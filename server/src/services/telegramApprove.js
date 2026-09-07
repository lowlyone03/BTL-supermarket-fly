const path = require('node:path');
const fs = require('node:fs');
const { ROLE_PERMISSION_CODES } = require('../constants/permissions');
const {
    escapeHtml, textCode, moneyCode, formatMoney, formatVnDateTime, formatTelegramDate,
    prettyShiftName, isManagerRole, t, headerBlock, kv, splitTelegramText
} = require('./telegramMessages');

const DECISION_TTL_MS = 15 * 60 * 1000;
const MAX_LINES = 30;
const ALREADY_DONE = /không còn|đã được duyệt|đã duyệt trước|không còn chờ|không còn ở trạng thái|đã xử lý/i;
const DENY_403 = 'Tài khoản chưa được cấp quyền sử dụng chức năng này.';
const OK_APPROVE = 'Đã duyệt trên Telegram — đã ghi nhật ký. Mở Fly nếu cần.';
const OK_REJECT = 'Đã từ chối trên Telegram — đã ghi nhật ký. Mở Fly nếu cần.';
const ALREADY_TEXT = 'Việc này đã được xử lý trước đó. Không duyệt lần hai.';
const ASK_REASON = 'Nhập lý do từ chối (bắt buộc như trên Fly). Gửi tin trả lời tin này.';

const pendingRejectByChat = new Map();
const inFlight = new Set();
let flyHandlerOverride = null;

const roleKey = name => String(name || '').trim().toLocaleLowerCase('vi-VN');
const codesForRole = role => ROLE_PERMISSION_CODES[roleKey(role)] || [];
const roleHasUc = (role, codes) => {
    const set = codesForRole(role);
    return (Array.isArray(codes) ? codes : [codes]).some(code => set.includes(code));
};

const KIND_META = {
    po: { uc: 'UC05', label: 'Đơn mua hàng', rejectReason: true },
    px: { uc: 'UC06', label: 'Phiếu xuất kho', rejectReason: true },
    kk: { uc: 'UC07', label: 'Kiểm kê điều chỉnh', rejectReason: true },
    dt: { uc: 'UC08', label: 'Đổi trả', rejectReason: true },
    pc: { uc: 'UC09', label: 'Phiếu chi NCC', rejectReason: true },
    cc: { uc: 'UC32', label: 'Chấm công', rejectReason: false }
};

const requestOf = (pool, sqlMod) => (pool.request ? pool.request() : new sqlMod.Request(pool));

const sqlTypes = () => {
    try {
        return require('../config/db').sql;
    } catch {
        return null;
    }
};

const runQuery = async (pool, text, inputs = {}) => {
    const sql = sqlTypes();
    const req = requestOf(pool, sql);
    for (const [name, spec] of Object.entries(inputs)) {
        if (sql && spec && spec.type) req.input(name, spec.type, spec.value);
        else req.input(name, spec);
    }
    const result = await req.query(text);
    return result.recordset || [];
};

const oneRow = async (...args) => {
    const rows = await runQuery(...args).catch(() => []);
    return rows[0] || null;
};

const setFlyHandlerOverride = (fn) => {
    flyHandlerOverride = typeof fn === 'function' ? fn : null;
};

const resetDecisionState = () => {
    pendingRejectByChat.clear();
    inFlight.clear();
    flyHandlerOverride = null;
};

const parseDecisionCallback = (data) => {
    const raw = String(data || '').trim();
    if (raw === 'rp' || raw === 'cmd:reports') return { action: 'reports' };
    const match = raw.match(/^(ok|no|dt|docs):(po|px|kk|dt|pc|cc|hd|pn|hdm|gh):(.{1,40})$/i);
    if (!match) return null;
    return { action: match[1].toLowerCase(), kind: match[2].toLowerCase(), id: match[3] };
};

const parseInboxKind = (itemId) => {
    const match = String(itemId || '').match(/^(po|px|kk|dt|pc|cc):(.{1,40})$/i);
    if (!match) return null;
    return { kind: match[1].toLowerCase(), id: match[2] };
};

const decisionCallbackData = (action, kind, id) => String(`${action}:${kind}:${id}`).slice(0, 64);

const canDecideKind = (user, kind) => {
    const meta = KIND_META[kind];
    if (!meta) return false;
    if (!isManagerRole(user?.TenVaiTro)) return false;
    if (Number(user?.TrangThaiTK) === 0) return false;
    return roleHasUc(user.TenVaiTro, [meta.uc]);
};

const rememberReject = (chatId, kind, id) => {
    pendingRejectByChat.set(String(chatId), { kind, id, at: Date.now() });
};

const consumeReject = (chatId) => {
    const key = String(chatId);
    const row = pendingRejectByChat.get(key);
    if (!row) return null;
    if (Date.now() - row.at > DECISION_TTL_MS) {
        pendingRejectByChat.delete(key);
        return null;
    }
    pendingRejectByChat.delete(key);
    return row;
};

const peekReject = (chatId) => {
    const row = pendingRejectByChat.get(String(chatId));
    if (!row) return null;
    if (Date.now() - row.at > DECISION_TTL_MS) {
        pendingRejectByChat.delete(String(chatId));
        return null;
    }
    return row;
};

const invokeFlyHandler = (handler, { user, params, body }) => new Promise((resolve) => {
    let settled = false;
    const finish = (status, payload) => {
        if (settled) return;
        settled = true;
        resolve({ status, body: payload || {} });
    };
    const req = {
        user,
        params: params || {},
        body: body || {},
        query: {},
        headers: {},
        ip: 'telegram'
    };
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = Number(code) || 200;
            return this;
        },
        json(data) {
            finish(this.statusCode, data);
            return this;
        },
        send(data) {
            finish(this.statusCode, data);
            return this;
        }
    };
    Promise.resolve()
        .then(() => handler(req, res))
        .catch(error => finish(500, { message: error.message || 'Lỗi duyệt.' }));
});

const resolveFlyHandler = (kind, action) => {
    if (kind === 'po') {
        const ctrl = require('../controllers/purchaseOrderController');
        return action === 'ok' ? ctrl.approve : ctrl.reject;
    }
    if (kind === 'px') {
        const ctrl = require('../controllers/stockIssueController');
        return action === 'ok' ? ctrl.approveIssue : ctrl.rejectIssue;
    }
    if (kind === 'kk') {
        const ctrl = require('../controllers/inventoryCountController');
        return action === 'ok' ? ctrl.approveCount : ctrl.rejectCount;
    }
    if (kind === 'dt') {
        const ctrl = require('../controllers/returnsController');
        return ctrl.decideReturn(action === 'ok');
    }
    if (kind === 'pc') {
        const ctrl = require('../controllers/paymentVoucherController');
        return action === 'ok' ? ctrl.approveVoucher : ctrl.rejectVoucher;
    }
    if (kind === 'cc' && action === 'ok') {
        const ctrl = require('../controllers/workforceController');
        return ctrl.approveAttendance;
    }
    return null;
};

const fundMethodForPc = async (pool, id) => {
    const sql = sqlTypes();
    const row = await oneRow(pool, `
        SELECT PhuongThuc FROM PhieuChi WHERE MaPhieu=@Id`, {
        Id: { type: sql?.VarChar, value: String(id) }
    }).catch(() => null);
    const method = String(row?.PhuongThuc || '');
    if (method === 'Chuyển khoản') return 'Ủy quyền chuyển khoản';
    return 'Tiền mặt';
};

const buildDecisionBody = async (pool, kind, action, id, reason) => {
    if (action === 'no') return { LyDo: String(reason || '').trim().slice(0, 500) };
    if (kind === 'pc') {
        return {
            HinhThucCapQuy: await fundMethodForPc(pool, id),
            GhiChuCapQuy: 'Duyệt và giao quỹ từ Telegram (cùng hàm Fly).'
        };
    }
    if (kind === 'cc') return { TinhTangCa: false };
    return {};
};

const mapDecisionResult = (result, action) => {
    const status = Number(result?.status || 200);
    const message = String(result?.body?.message || '');
    if (status === 403) return { ok: false, status: 403, text: DENY_403 };
    if (status >= 400 && ALREADY_DONE.test(message)) {
        return { ok: false, status, already: true, text: ALREADY_TEXT, fly: message };
    }
    if (status >= 400) {
        return { ok: false, status, text: message || 'Không xử lý được trên Telegram. Mở Fly.' };
    }
    return {
        ok: true,
        status,
        text: action === 'no' ? OK_REJECT : OK_APPROVE,
        fly: message
    };
};

const runFlyDecision = async ({ user, kind, action, id, reason, pool, chatId } = {}) => {
    const meta = KIND_META[kind];
    if (!meta) return { ok: false, status: 400, text: 'Loại việc không duyệt được trên Telegram.' };
    if (!user || !isManagerRole(user.TenVaiTro) || Number(user.TrangThaiTK) === 0) {
        return { ok: false, status: 403, text: DENY_403 };
    }
    if (!roleHasUc(user.TenVaiTro, [meta.uc])) {
        return { ok: false, status: 403, text: DENY_403 };
    }
    if (action === 'no' && !meta.rejectReason) {
        return { ok: false, status: 400, text: 'Chấm công trên Telegram chỉ duyệt (không từ chối). Mở Fly nếu cần.' };
    }
    if (action === 'no' && meta.rejectReason && !String(reason || '').trim()) {
        if (chatId) rememberReject(chatId, kind, id);
        return { ok: false, needReason: true, text: ASK_REASON };
    }
    const token = `${kind}:${id}:${action}`;
    if (inFlight.has(token)) return { ok: false, already: true, text: ALREADY_TEXT };
    inFlight.add(token);
    try {
        const ctx = {
            user, kind, action, id, reason, uc: meta.uc,
            body: await buildDecisionBody(pool, kind, action, id, reason)
        };
        if (flyHandlerOverride) {
            const result = await flyHandlerOverride(ctx);
            return mapDecisionResult(result || { status: 200, body: { message: 'OK' } }, action);
        }
        const handler = resolveFlyHandler(kind, action);
        if (!handler) return { ok: false, status: 400, text: 'Không gọi được hàm duyệt Fly.' };
        const result = await invokeFlyHandler(handler, {
            user,
            params: { id: String(id) },
            body: ctx.body
        });
        return mapDecisionResult(result, action);
    } finally {
        inFlight.delete(token);
    }
};

const lineQty = (row) => row.SoLuong ?? row.SL ?? row.SLThucTe ?? row.ChenhLech;
const linePrice = (row) => row.DonGia ?? row.DonGiaVon ?? 0;
const lineAmount = (row) => {
    if (row.ThanhTien != null) return Number(row.ThanhTien);
    const qty = Number(lineQty(row) || 0);
    const price = Number(linePrice(row) || 0);
    return qty * price;
};

const collectPhotos = () => [];

const loadLinesSafe = async (pool, sqlText, inputs) => {
    const rows = await runQuery(pool, sqlText, inputs).catch(() => []);
    return rows.slice(0, MAX_LINES);
};

const loadPo = async (pool, id) => {
    const sql = sqlTypes();
    const header = await oneRow(pool, `
        SELECT po.MaPO, po.TrangThai, po.NgayLap, po.TongTien, po.SoNgayThanhToan, po.NgayGiaoDuKien,
               po.MaDN, po.MaNCC, ncc.TenNCC, nv.TenNV NguoiLap, po.GhiChu
        FROM DonMuaHang po
        JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
        JOIN NhanVien nv ON nv.MaNV=po.MaNV_Lap
        WHERE po.MaPO=@Id`, { Id: { type: sql?.VarChar, value: id } });
    if (!header) return null;
    const lines = await loadLinesSafe(pool, `
        SELECT ct.MaSP, sp.TenSP, ct.SoLuong, ct.DonGia, ct.ThanhTien
        FROM ChiTietDonMua ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaPO=@Id ORDER BY sp.TenSP`, { Id: { type: sql?.VarChar, value: id } });
    const related = await oneRow(pool, `
        SELECT TOP 1 hd.SoHoaDon, hd.MaHDMH, hd.MaPN, hd.MaPO, hd.TienThue, hd.TongCong, hd.TrangThaiDoiChieu
        FROM HoaDonMuaHang hd WHERE hd.MaPO=@Id ORDER BY hd.NgayTiepNhan DESC`, {
        Id: { type: sql?.VarChar, value: id }
    }).catch(() => null);
    return {
        kind: 'po', id, title: 'ĐƠN MUA CHỜ DUYỆT',
        status: header.TrangThai, createdBy: header.NguoiLap, createdAt: header.NgayLap,
        party: header.TenNCC, extra: { MaDN: header.MaDN, HanNo: header.SoNgayThanhToan, Giao: header.NgayGiaoDuKien },
        lines, totals: { tong: header.TongTien, thue: related?.TienThue, hanNoNgay: header.SoNgayThanhToan },
        docs: [
            { label: 'Đơn mua', value: header.MaPO },
            { label: 'Đề nghị', value: header.MaDN },
            related ? { label: 'Hóa đơn NCC', value: related.SoHoaDon } : null,
            related ? { label: 'Phiếu nhập', value: related.MaPN } : null,
            related ? { label: 'Đối chiếu 3 bên', value: related.TrangThaiDoiChieu } : null
        ].filter(Boolean),
        photos: collectPhotos(lines),
        pending: /chờ duyệt/i.test(header.TrangThai || ''),
        note: header.GhiChu
    };
};

const loadPx = async (pool, id) => {
    const sql = sqlTypes();
    const header = await oneRow(pool, `
        SELECT px.MaPX, px.TrangThai, px.NgayXuat, px.LoaiXuat, px.GhiChu, px.MaPN,
               nv.TenNV NguoiLap, ncc.TenNCC, k.TenKho
        FROM PhieuXuat px
        JOIN NhanVien nv ON nv.MaNV=px.MaNV
        LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=px.MaNCC
        LEFT JOIN Kho k ON k.MaKho=px.MaKho
        WHERE px.MaPX=@Id`, { Id: { type: sql?.VarChar, value: id } });
    if (!header) return null;
    const lines = await loadLinesSafe(pool, `
        SELECT ct.MaSP, sp.TenSP, ct.SoLuong, ct.DonGia, (ct.SoLuong*ISNULL(ct.DonGia,0)) ThanhTien
        FROM ChiTietPhieuXuat ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaPX=@Id ORDER BY sp.TenSP`, { Id: { type: sql?.VarChar, value: id } });
    const tong = lines.reduce((sum, row) => sum + Number(row.ThanhTien || 0), 0);
    return {
        kind: 'px', id, title: 'PHIẾU XUẤT CHỜ DUYỆT',
        status: header.TrangThai, createdBy: header.NguoiLap, createdAt: header.NgayXuat,
        party: header.TenNCC || header.TenKho, extra: { LoaiXuat: header.LoaiXuat, Kho: header.TenKho },
        lines, totals: { tong },
        docs: [
            { label: 'Phiếu xuất', value: header.MaPX },
            header.MaPN ? { label: 'Phiếu nhập nguồn', value: header.MaPN } : null
        ].filter(Boolean),
        photos: collectPhotos(lines),
        pending: /chờ duyệt/i.test(header.TrangThai || ''),
        note: header.GhiChu
    };
};

const loadKk = async (pool, id) => {
    const sql = sqlTypes();
    const header = await oneRow(pool, `
        SELECT kk.MaKK, kk.TrangThai, kk.NgayKiemKe, kk.GhiChu, nv.TenNV NguoiLap, k.TenKho
        FROM KiemKe kk JOIN NhanVien nv ON nv.MaNV=kk.MaNV
        LEFT JOIN Kho k ON k.MaKho=kk.MaKho
        WHERE kk.MaKK=@Id`, { Id: { type: sql?.VarChar, value: id } });
    if (!header) return null;
    const lines = await loadLinesSafe(pool, `
        SELECT ct.MaSP, sp.TenSP, ct.SLHeThong, ct.SLThucTe, ct.ChenhLech, ct.NguyenNhan,
               ct.SLThucTe SoLuong, ISNULL(tk.DonGiaBinhQuan,0) DonGia,
               (ct.ChenhLech*ISNULL(tk.DonGiaBinhQuan,0)) ThanhTien
        FROM ChiTietKiemKe ct
        JOIN SanPham sp ON sp.MaSP=ct.MaSP
        JOIN KiemKe kk ON kk.MaKK=ct.MaKK
        LEFT JOIN TonKho tk ON tk.MaKho=kk.MaKho AND tk.MaSP=ct.MaSP
        WHERE ct.MaKK=@Id ORDER BY ABS(ct.ChenhLech) DESC, sp.TenSP`, { Id: { type: sql?.VarChar, value: id } });
    return {
        kind: 'kk', id, title: 'KIỂM KÊ CHỜ DUYỆT ĐIỀU CHỈNH',
        status: header.TrangThai, createdBy: header.NguoiLap, createdAt: header.NgayKiemKe,
        party: header.TenKho, extra: { Kho: header.TenKho },
        lines, totals: { tong: lines.reduce((sum, row) => sum + Number(row.ThanhTien || 0), 0) },
        docs: [{ label: 'Đợt kiểm kê', value: header.MaKK }],
        photos: collectPhotos(lines),
        pending: /chờ duyệt/i.test(header.TrangThai || ''),
        note: header.GhiChu,
        countMode: true
    };
};

const loadDt = async (pool, id) => {
    const sql = sqlTypes();
    const header = await oneRow(pool, `
        SELECT dt.MaDT, dt.TrangThai, dt.NgayLap, dt.HinhThucXuLy, dt.LyDo, dt.SoTienHoan, dt.MaHD,
               dt.KetQuaKiemTra, nv.TenNV NguoiLap, kh.TenKH, hd.TongThanhToan, ca.MaQuay
        FROM PhieuDoiTra dt
        JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
        JOIN HoaDon hd ON hd.MaHD=dt.MaHD
        LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
        LEFT JOIN CaLamViec ca ON ca.MaCa=hd.MaCa
        WHERE dt.MaDT=@Id`, { Id: { type: sql?.VarChar, value: id } });
    if (!header) return null;
    const lines = await loadLinesSafe(pool, `
        SELECT ct.MaSP, sp.TenSP, ct.SoLuong, ct.DonGia, ct.ThanhTien, ct.LoaiDong
        FROM ChiTietDoiTra ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaDT=@Id ORDER BY ct.LoaiDong, sp.TenSP`, { Id: { type: sql?.VarChar, value: id } });
    return {
        kind: 'dt', id, title: 'ĐỔI TRẢ CHỜ DUYỆT',
        status: header.TrangThai, createdBy: header.NguoiLap, createdAt: header.NgayLap,
        party: header.TenKH, extra: { HinhThuc: header.HinhThucXuLy, Quay: header.MaQuay },
        lines, totals: { tong: header.SoTienHoan || header.TongThanhToan },
        docs: [
            { label: 'Phiếu đổi trả', value: header.MaDT },
            { label: 'Hóa đơn gốc', value: header.MaHD }
        ],
        photos: collectPhotos(lines),
        pending: /chờ duyệt/i.test(header.TrangThai || ''),
        note: [header.LyDo, header.KetQuaKiemTra].filter(Boolean).join(' · ')
    };
};

const loadPc = async (pool, id) => {
    const sql = sqlTypes();
    const header = await oneRow(pool, `
        SELECT pc.MaPhieu, pc.TrangThai, pc.NgayChungTu, pc.SoTien, pc.PhuongThuc, pc.NoiDung, pc.GhiChu,
               pc.MaCongNo, nv.TenNV NguoiLap, ncc.TenNCC, cn.HanThanhToan, cn.SoTienConLai,
               hd.SoHoaDon, hd.MaPO, hd.MaPN, hd.TienThue, hd.TongCong, hd.TrangThaiDoiChieu, hd.MaHDMH
        FROM PhieuChi pc
        JOIN NhanVien nv ON nv.MaNV=pc.MaNV
        LEFT JOIN CongNoPhaiTra cn ON cn.MaCNPTra=pc.MaCongNo
        LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=COALESCE(pc.MaNCC, cn.MaNCC)
        LEFT JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
        WHERE pc.MaPhieu=@Id`, { Id: { type: sql?.VarChar, value: id } });
    if (!header) return null;
    const lines = header.MaHDMH
        ? await loadLinesSafe(pool, `
            SELECT ct.MaSP, sp.TenSP, ct.SoLuong, ct.DonGia, ct.ThanhTien, ct.ThueSuat
            FROM ChiTietHoaDonMuaHang ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaHDMH=@Hd ORDER BY sp.TenSP`, { Hd: { type: sql?.VarChar, value: header.MaHDMH } })
        : [];
    return {
        kind: 'pc', id, title: 'PHIẾU CHI CHỜ DUYỆT',
        status: header.TrangThai, createdBy: header.NguoiLap, createdAt: header.NgayChungTu,
        party: header.TenNCC, extra: { PhuongThuc: header.PhuongThuc, CongNo: header.MaCongNo },
        lines, totals: { tong: header.SoTien, thue: header.TienThue, hanNo: header.HanThanhToan },
        docs: [
            { label: 'Phiếu chi', value: header.MaPhieu },
            { label: 'Công nợ', value: header.MaCongNo },
            { label: 'Số HĐ NCC', value: header.SoHoaDon },
            { label: 'Đơn mua', value: header.MaPO },
            { label: 'Phiếu nhập', value: header.MaPN },
            { label: 'Đối chiếu 3 bên', value: header.TrangThaiDoiChieu }
        ].filter(row => row.value),
        photos: collectPhotos(lines),
        pending: /chờ duyệt/i.test(header.TrangThai || ''),
        note: header.NoiDung || header.GhiChu
    };
};

const loadCc = async (pool, id) => {
    const sql = sqlTypes();
    const header = await oneRow(pool, `
        SELECT TOP 1 cc.MaChamCong, cc.TrangThai, cc.ThoiGianVao, cc.ThoiGianRa, cc.GhiChu,
               l.NgayLam, l.MaNV, l.NhiemVu, nv.TenNV, lc.TenCa, lc.MaLoaiCa,
               l.BatDauDuKien, l.KetThucDuKien, ca.MaCa, ca.MaQuay, ca.TrangThai TrangThaiCa,
               CASE WHEN cc.ThoiGianRa>l.KetThucDuKien
                    THEN DATEDIFF(minute,l.KetThucDuKien,cc.ThoiGianRa) ELSE 0 END AS SoPhutOT
        FROM ChamCong cc
        JOIN LichLamViec l ON l.MaLich=cc.MaLich
        JOIN NhanVien nv ON nv.MaNV=l.MaNV
        JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
        LEFT JOIN CaLamViec ca ON ca.MaLich=l.MaLich OR (ca.MaNV=l.MaNV AND CONVERT(date,ca.ThoiGianBatDau)=l.NgayLam)
        WHERE cc.MaChamCong=@Id`, { Id: { type: sql?.BigInt || sql?.VarChar, value: Number(id) || id } });
    if (!header) return null;
    return {
        kind: 'cc', id: String(header.MaChamCong || id), title: 'CHẤM CÔNG CHỜ DUYỆT',
        status: header.TrangThai, createdBy: header.TenNV, createdAt: header.ThoiGianRa || header.NgayLam,
        party: header.TenNV,
        extra: {
            Ca: prettyShiftName(header.TenCa),
            Ngay: header.NgayLam,
            Quay: header.MaQuay,
            MaCa: header.MaCa,
            Vao: header.ThoiGianVao,
            Ra: header.ThoiGianRa,
            OT: header.SoPhutOT,
            NhiemVu: header.NhiemVu
        },
        lines: [], totals: {},
        docs: [
            { label: 'Mã chấm công', value: header.MaChamCong },
            header.MaCa ? { label: 'Ca bán', value: header.MaCa } : null
        ].filter(Boolean),
        photos: [],
        pending: /chờ duyệt/i.test(header.TrangThai || ''),
        note: 'Ca đã đóng — chờ duyệt công (UC32). Duyệt trên Telegram ghi nhật ký như Fly → Duyệt công.',
        attendance: true
    };
};

const LOADERS = { po: loadPo, px: loadPx, kk: loadKk, dt: loadDt, pc: loadPc, cc: loadCc };

const loadDossier = async (pool, kind, id) => {
    const loader = LOADERS[kind];
    if (!loader || !pool) return { kind, id, title: KIND_META[kind]?.label || 'Việc chờ duyệt', pending: true, lines: [], docs: [], photos: [] };
    try {
        return await loader(pool, id) || {
            kind, id, title: KIND_META[kind]?.label, pending: true, lines: [], docs: [], photos: []
        };
    } catch {
        return { kind, id, title: KIND_META[kind]?.label, pending: true, lines: [], docs: [], photos: [] };
    }
};

const formatLineRow = (row, index, { countMode } = {}) => {
    const code = row.MaSP || `#${index + 1}`;
    const name = String(row.TenSP || '').slice(0, 28);
    if (countMode) {
        return `• ${textCode(code)} ${escapeHtml(name)} · HT ${textCode(String(row.SLHeThong ?? '—'))} / TT ${textCode(String(row.SLThucTe ?? '—'))} · lệch ${textCode(String(row.ChenhLech ?? '—'))}`;
    }
    const qty = lineQty(row);
    const price = linePrice(row);
    const amount = lineAmount(row);
    return `• ${textCode(code)} ${escapeHtml(name)} · SL ${textCode(String(qty ?? '—'))} × ${moneyCode(price)} = ${moneyCode(amount)}`;
};

const buildApprovalCard = (dossier = {}, lang = 'vi') => {
    const pending = Boolean(dossier.pending);
    const title = dossier.title || KIND_META[dossier.kind]?.label || 'VIỆC CẦN DUYỆT';
    const lines = Array.isArray(dossier.lines) ? dossier.lines.slice(0, MAX_LINES) : [];
    const extras = dossier.extra || {};
    const rows = [
        headerBlock(`📋 <b>${escapeHtml(title)}</b>`),
        kv('Mã chứng từ', textCode(dossier.id || '—')),
        kv('Trạng thái', textCode(dossier.status || (pending ? 'Chờ duyệt' : '—'))),
        kv('Người lập', textCode(dossier.createdBy || '—')),
        dossier.createdAt ? kv('Lúc lập', textCode(formatVnDateTime(dossier.createdAt, lang) || '—')) : '',
        dossier.party ? kv('NCC / NV / KH', textCode(dossier.party)) : ''
    ];
    if (extras.LoaiXuat) rows.push(kv('Loại xuất', textCode(extras.LoaiXuat)));
    if (extras.Kho) rows.push(kv('Kho / quầy', textCode(extras.Kho)));
    if (extras.Quay) rows.push(kv('Quầy', textCode(extras.Quay)));
    if (extras.HinhThuc) rows.push(kv('Hình thức', textCode(extras.HinhThuc)));
    if (extras.PhuongThuc) rows.push(kv('Phương thức', textCode(extras.PhuongThuc === 'Chuyển khoản' ? 'Chuyển khoản' : extras.PhuongThuc)));
    if (extras.CongNo) rows.push(kv('Công nợ', textCode(extras.CongNo)));
    if (extras.MaDN) rows.push(kv('Đề nghị', textCode(extras.MaDN)));
    if (extras.HanNo) rows.push(kv('Hạn nợ (ngày)', textCode(String(extras.HanNo))));
    if (dossier.attendance) {
        rows.push(kv('Ca', textCode(`${prettyShiftName(extras.Ca)} · ${formatTelegramDate(extras.Ngay, lang) || '—'}`)));
        rows.push(kv('Giờ vào', textCode(formatVnDateTime(extras.Vao, lang) || '—')));
        rows.push(kv('Giờ ra', textCode(formatVnDateTime(extras.Ra, lang) || '—')));
        rows.push(kv('Phút OT', textCode(String(extras.OT || 0))));
        if (extras.MaCa) rows.push(kv('Mã ca', textCode(extras.MaCa)));
        if (extras.NhiemVu) rows.push(kv('Nhiệm vụ', textCode(extras.NhiemVu)));
    }
    if (lines.length) {
        rows.push('', `<b>Dòng hàng (${lines.length}${dossier.lines?.length > MAX_LINES ? '+' : ''})</b>`);
        rows.push(...lines.map((row, index) => formatLineRow(row, index, { countMode: dossier.countMode })));
        if ((dossier.lines || []).length > MAX_LINES) {
            rows.push(`<i>… và ${(dossier.lines.length - MAX_LINES)} dòng nữa — xem đủ trên Fly.</i>`);
        }
    }
    if (dossier.totals && (dossier.totals.tong != null || dossier.totals.thue != null)) {
        rows.push('', `<b>Tổng hợp</b>`);
        if (dossier.totals.tong != null) rows.push(kv('Tổng tiền', moneyCode(dossier.totals.tong)));
        if (dossier.totals.thue != null) rows.push(kv('Thuế mua', moneyCode(dossier.totals.thue)));
        if (dossier.totals.hanNo) rows.push(kv('Hạn nợ', textCode(formatTelegramDate(dossier.totals.hanNo, lang) || '—')));
        if (dossier.totals.hanNoNgay != null) rows.push(kv('Điều khoản nợ', textCode(`${dossier.totals.hanNoNgay} ngày`)));
    }
    if (dossier.docs?.length) {
        rows.push('', '<b>Chứng từ liên quan</b>');
        for (const doc of dossier.docs) {
            rows.push(kv(doc.label, textCode(doc.value || '—')));
        }
    }
    if (dossier.note) rows.push('', `<i>${escapeHtml(String(dossier.note).slice(0, 400))}</i>`);
    rows.push('', `<i>${escapeHtml(t(lang, 'flyHint'))}</i>`);
    return rows.filter(line => line !== '').join('\n');
};

const approvalKeyboard = (dossier = {}) => {
    const kind = dossier.kind;
    const id = dossier.id;
    if (!KIND_META[kind] || !id) {
        return { inline_keyboard: [[{ text: '📊 Báo cáo', callback_data: 'cmd:reports' }]] };
    }
    const rows = [];
    if (dossier.pending) {
        const actions = [{ text: '✅ Duyệt', callback_data: decisionCallbackData('ok', kind, id) }];
        if (KIND_META[kind].rejectReason) {
            actions.push({ text: '❌ Từ chối', callback_data: decisionCallbackData('no', kind, id) });
        }
        rows.push(actions);
    }
    rows.push([
        { text: '📄 Chứng từ', callback_data: decisionCallbackData('docs', kind, id) },
        { text: '📊 Báo cáo', callback_data: 'cmd:reports' }
    ]);
    return { inline_keyboard: rows };
};

const composePendingPush = async (pool, kind, id, lang = 'vi') => {
    const dossier = await loadDossier(pool, kind, id);
    return {
        text: buildApprovalCard(dossier, lang),
        extra: { reply_markup: approvalKeyboard(dossier), disable_notification: false },
        dossier
    };
};

const isPublicHttpUrl = (value) => {
    const url = String(value || '').trim();
    if (!/^https:\/\//i.test(url)) return false;
    return !/localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\./i.test(url);
};

const localUploadPath = (stored) => {
    const raw = String(stored || '').trim();
    if (!raw) return null;
    const rel = raw.replace(/^[/\\]+/, '').replace(/^uploads[/\\]/i, '');
    if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) {
        return path.resolve(__dirname, '..', '..', 'uploads', rel);
    }
    if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) return raw;
    return null;
};

const publicFileUrl = (stored) => {
    const base = String(process.env.TELEGRAM_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    const raw = String(stored || '').trim();
    if (isPublicHttpUrl(raw)) return raw;
    if (base && /^https:\/\//i.test(base) && !/localhost|127\.0\.0\.1/i.test(base) && raw.startsWith('/uploads/')) {
        return `${base}${raw}`;
    }
    return '';
};

const describeLocalPhoto = (photo) => {
    const name = photo?.name || path.basename(String(photo?.path || 'anh'));
    return `Ảnh chứng từ: ${name} — Telegram không tải URL localhost. Xem ảnh trên Fly.`;
};

const listPendingDecisions = (inbox = []) => inbox
    .map(item => {
        const parsed = parseInboxKind(item.id);
        if (!parsed) return null;
        return { ...item, ...parsed };
    })
    .filter(Boolean);

const pendingListKeyboard = (items = []) => {
    const cards = listPendingDecisions(items).slice(0, 8);
    if (!cards.length) return null;
    return {
        inline_keyboard: cards.map(item => ([{
            text: `📄 ${item.id}`,
            callback_data: decisionCallbackData('docs', item.kind, item.id)
        }]))
    };
};

module.exports = {
    KIND_META,
    DENY_403,
    OK_APPROVE,
    OK_REJECT,
    ALREADY_TEXT,
    ASK_REASON,
    MAX_LINES,
    parseDecisionCallback,
    parseInboxKind,
    decisionCallbackData,
    canDecideKind,
    roleHasUc,
    rememberReject,
    consumeReject,
    peekReject,
    runFlyDecision,
    invokeFlyHandler,
    setFlyHandlerOverride,
    resetDecisionState,
    loadDossier,
    buildApprovalCard,
    approvalKeyboard,
    composePendingPush,
    formatLineRow,
    isPublicHttpUrl,
    localUploadPath,
    publicFileUrl,
    describeLocalPhoto,
    listPendingDecisions,
    pendingListKeyboard,
    splitTelegramText
};
