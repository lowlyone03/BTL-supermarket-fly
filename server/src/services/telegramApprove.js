const path = require('node:path');
const fs = require('node:fs');
const { ROLE_PERMISSION_CODES } = require('../constants/permissions');
const {
    escapeHtml, textCode, moneyCode, formatMoney, formatVnDateTime, formatTelegramDate,
    prettyShiftName, isManagerRole, telegramAudience, t, headerBlock, kv, splitTelegramText,
    statusBadge, sectionTitle
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

const KIND_TABLE = {
    po: 'DonMuaHang',
    px: 'PhieuXuat',
    kk: 'KiemKe',
    dt: 'PhieuDoiTra',
    pc: 'PhieuChi',
    cc: 'ChamCong'
};

const pingInboxAfterDecision = (kind, action, id) => {
    const meta = KIND_META[kind];
    const table = KIND_TABLE[kind];
    if (!meta || !table || !id) return;
    try {
        require('./notificationHub').notifyInboxChanged({
            action: action === 'no' ? `Từ chối ${meta.label}` : `Phê duyệt ${meta.label}`,
            table,
            recordId: String(id)
        });
    } catch { /* chuông desktop lỗi không chặn duyệt Telegram */ }
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
    const match = raw.match(/^(ok|no|dt|docs):(po|px|kk|dt|pc|cc|hd|pn|hdm|gh|bck):(.{1,40})$/i);
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
        const mapped = mapDecisionResult(result, action);
        if (mapped.ok) pingInboxAfterDecision(kind, action, id);
        return mapped;
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
               pc.MaCongNo, pc.MaGiaoDichNganHang, pc.HinhThucCapQuy, pc.NgayCapQuy,
               nv.TenNV NguoiLap, nvd.TenNV NguoiDuyet, ncc.TenNCC,
               cn.HanThanhToan, cn.SoTienConLai, cn.SoTienNo, cn.SoTienDaTra, cn.TrangThai TrangThaiCongNo,
               hd.SoHoaDon, hd.MaPO, hd.MaPN, hd.TienThue, hd.TongCong, hd.TrangThaiDoiChieu, hd.MaHDMH
        FROM PhieuChi pc
        JOIN NhanVien nv ON nv.MaNV=pc.MaNV
        LEFT JOIN NhanVien nvd ON nvd.MaNV=pc.MaNV_Duyet
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
    const tong = header.TongCong != null ? header.TongCong : header.SoTien;
    return {
        kind: 'pc', id, title: 'PHIẾU CHI CHỜ DUYỆT',
        status: header.TrangThai, createdBy: header.NguoiLap, createdAt: header.NgayChungTu,
        approvedBy: header.NguoiDuyet, party: header.TenNCC,
        extra: {
            PhuongThuc: header.PhuongThuc,
            CongNo: header.MaCongNo,
            MaGD: header.MaGiaoDichNganHang,
            HinhThucCapQuy: header.HinhThucCapQuy
        },
        lines,
        totals: {
            tong,
            soTienPhieu: header.SoTien,
            thue: header.TienThue,
            hanNo: header.HanThanhToan,
            conLai: header.SoTienConLai
        },
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
        note: header.NoiDung || header.GhiChu,
        debtStatus: header.TrangThaiCongNo
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

const formatLineRow = (row, index, { countMode, nameLen = 28 } = {}) => {
    const code = row.MaSP || `#${index + 1}`;
    const name = String(row.TenSP || '').slice(0, nameLen);
    if (countMode) {
        const difference = Number(row.ChenhLech || 0);
        return `${difference ? '🟠' : '🟢'} <b>${String(index + 1).padStart(2, '0')}</b>  ${textCode(code)} ${escapeHtml(name)}\n   Hệ thống ${textCode(String(row.SLHeThong ?? '—'))} · Thực tế ${textCode(String(row.SLThucTe ?? '—'))} · Lệch ${textCode(String(row.ChenhLech ?? '—'))}`;
    }
    const qty = lineQty(row);
    const price = linePrice(row);
    const amount = lineAmount(row);
    return `▫️ <b>${String(index + 1).padStart(2, '0')}</b>  ${textCode(code)} ${escapeHtml(name)}\n   ${textCode(String(qty ?? '—'))} × ${moneyCode(price)}  →  <b>${moneyCode(amount)}</b>`;
};

const buildApprovalCard = (dossier = {}, lang = 'vi') => {
    const pending = Boolean(dossier.pending);
    const title = dossier.title || KIND_META[dossier.kind]?.label || 'VIỆC CẦN DUYỆT';
    const lines = Array.isArray(dossier.lines) ? dossier.lines.slice(0, MAX_LINES) : [];
    const extras = dossier.extra || {};
    const rows = [
        headerBlock(`${pending ? '⚡' : '📋'} <b>${escapeHtml(title)}</b>`),
        `<blockquote>${statusBadge(dossier.status || (pending ? 'Chờ duyệt' : '—'))}\n🔖 ${escapeHtml(dossier.id || '—')}</blockquote>`,
        sectionTitle('👤', 'Thông tin chứng từ'),
        kv('Mã chứng từ', textCode(dossier.id || '—')),
        kv('Người lập', textCode(dossier.createdBy || '—')),
        dossier.approvedBy ? kv('Người duyệt', textCode(dossier.approvedBy)) : '',
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
        rows.push('', sectionTitle('📦', `Dòng hàng (${lines.length}${dossier.lines?.length > MAX_LINES ? '+' : ''})`));
        rows.push(...lines.map((row, index) => formatLineRow(row, index, { countMode: dossier.countMode })));
        if ((dossier.lines || []).length > MAX_LINES) {
            rows.push(`<i>… và ${(dossier.lines.length - MAX_LINES)} dòng nữa — xem đủ trên Fly.</i>`);
        }
    }
    if (dossier.totals && (dossier.totals.tong != null || dossier.totals.thue != null)) {
        rows.push('', sectionTitle('💰', 'Tổng hợp'));
        if (dossier.totals.tong != null) rows.push(kv('Tổng tiền', moneyCode(dossier.totals.tong)));
        if (dossier.totals.thue != null) rows.push(kv('Thuế mua', moneyCode(dossier.totals.thue)));
        if (dossier.totals.hanNo) rows.push(kv('Hạn nợ', textCode(formatTelegramDate(dossier.totals.hanNo, lang) || '—')));
        if (dossier.totals.hanNoNgay != null) rows.push(kv('Điều khoản nợ', textCode(`${dossier.totals.hanNoNgay} ngày`)));
    }
    if (dossier.docs?.length) {
        rows.push('', sectionTitle('🗂', 'Chứng từ liên quan'));
        for (const doc of dossier.docs) {
            rows.push(kv(doc.label, textCode(doc.value || '—')));
        }
    }
    if (dossier.note) rows.push('', `<i>${escapeHtml(String(dossier.note).slice(0, 400))}</i>`);
    rows.push('', pending
        ? '<blockquote>🛡 <b>Xác nhận an toàn</b>\nDuyệt hoặc từ chối sẽ gọi đúng nghiệp vụ Fly và ghi Nhật ký hệ thống.</blockquote>'
        : `<i>${escapeHtml(t(lang, 'flyHint'))}</i>`);
    return rows.filter(line => line !== '').join('\n');
};

const PAYMENT_LABELS = {
    admin: {
        party: 'NCC',
        debt: 'Công nợ',
        invoice: 'Số HĐ NCC',
        po: 'Đơn mua',
        pn: 'Phiếu nhập',
        match: 'Đối chiếu 3 bên',
        tax: 'Thuế mua',
        total: 'Tổng tiền',
        voucherAmount: 'Số tiền phiếu chi',
        due: 'Hạn nợ',
        method: 'Phương thức',
        bank: 'Mã GD ngân hàng',
        remaining: 'Còn phải trả',
        items: 'Dòng hàng',
        related: 'Chứng từ liên quan',
        totals: 'Tổng hợp',
        paidBy: 'Người thanh toán',
        approvedBy: 'Người duyệt',
        createdBy: 'Người lập',
        fund: 'Hình thức giao quỹ',
        debtStatus: 'Trạng thái công nợ'
    },
    ql: {
        party: 'Nhà cung cấp',
        debt: 'Khoản nợ NCC',
        invoice: 'Hóa đơn nhà cung cấp',
        po: 'Đơn đặt hàng',
        pn: 'Phiếu nhập kho',
        match: 'Khớp đơn / nhập / hóa đơn',
        tax: 'Thuế trên hóa đơn',
        total: 'Số tiền đã chi',
        voucherAmount: 'Số tiền phiếu',
        due: 'Hạn thanh toán',
        method: 'Cách chi',
        bank: 'Mã giao dịch',
        remaining: 'Còn phải trả',
        items: 'Hàng đã thanh toán',
        related: 'Chứng từ liên quan',
        totals: 'Tổng hợp',
        paidBy: 'Kế toán chi',
        approvedBy: 'Người duyệt quỹ',
        createdBy: 'Người lập phiếu',
        fund: 'Cách giao tiền',
        debtStatus: 'Tình trạng nợ'
    }
};

const paymentIntro = (audience, outcome) => {
    const ok = outcome !== 'fail';
    if (audience === 'ql') {
        return ok
            ? 'Kế toán đã thanh toán cho nhà cung cấp. Bạn chỉ xem kết quả — không cần lập hay chi phiếu.'
            : 'Kế toán ghi nhận chi tiền không thành công. Công nợ nhà cung cấp giữ nguyên. Bạn chỉ xem thông tin.';
    }
    return ok
        ? 'Kế toán đã ghi nhận thanh toán thành công trên Fly. Công nợ đã tất toán (chỉ thông tin).'
        : 'Kế toán ghi nhận thanh toán thất bại. Công nợ không đổi — thực hiện lại trên Fly.';
};

const relabelPaymentDoc = (doc, labels) => {
    const raw = String(doc.label || '');
    if (/phiếu chi/i.test(raw)) return { ...doc, label: 'Phiếu chi' };
    if (/công nợ/i.test(raw)) return { ...doc, label: labels.debt };
    if (/số hđ|hóa đơn/i.test(raw)) return { ...doc, label: labels.invoice };
    if (/đơn mua/i.test(raw)) return { ...doc, label: labels.po };
    if (/phiếu nhập/i.test(raw)) return { ...doc, label: labels.pn };
    if (/đối chiếu|3 bên/i.test(raw)) return { ...doc, label: labels.match };
    return doc;
};

const buildPaymentResultCard = (dossier = {}, { audience = 'admin', lang = 'vi' } = {}) => {
    const mode = audience === 'ql' ? 'ql' : 'admin';
    const labels = PAYMENT_LABELS[mode];
    const outcome = dossier.paymentOutcome === 'fail' ? 'fail' : 'success';
    const title = dossier.title || (outcome === 'fail'
        ? 'THANH TOÁN PHIẾU CHI THẤT BẠI'
        : 'THANH TOÁN PHIẾU CHI THÀNH CÔNG');
    const lines = Array.isArray(dossier.lines) ? dossier.lines.slice(0, MAX_LINES) : [];
    const extras = dossier.extra || {};
    const totals = dossier.totals || {};
    const rows = [
        headerBlock(`${outcome === 'fail' ? '🔴' : '🔔'} <b>${escapeHtml(title)}</b>`),
        `<blockquote>${statusBadge(dossier.status || (outcome === 'fail' ? 'Thanh toán thất bại' : 'Thanh toán thành công'))}\n🔖 ${escapeHtml(dossier.id || '—')}</blockquote>`,
        `<i>${escapeHtml(paymentIntro(mode, outcome))}</i>`,
        '',
        sectionTitle('👤', 'Thông tin chứng từ'),
        kv('Mã chứng từ', textCode(dossier.id || '—')),
        dossier.party ? kv(labels.party, textCode(dossier.party)) : '',
        kv(labels.createdBy, textCode(dossier.createdBy || '—')),
        dossier.approvedBy ? kv(labels.approvedBy, textCode(dossier.approvedBy)) : '',
        dossier.paidBy ? kv(labels.paidBy, textCode(dossier.paidBy)) : '',
        extras.PhuongThuc ? kv(labels.method, textCode(extras.PhuongThuc === 'Chuyển khoản' ? 'Chuyển khoản' : extras.PhuongThuc)) : '',
        extras.HinhThucCapQuy ? kv(labels.fund, textCode(extras.HinhThucCapQuy)) : '',
        extras.MaGD ? kv(labels.bank, textCode(extras.MaGD)) : '',
        extras.CongNo ? kv(labels.debt, textCode(extras.CongNo)) : '',
        dossier.debtStatus ? kv(labels.debtStatus, textCode(dossier.debtStatus)) : ''
    ];
    if (lines.length) {
        rows.push('', sectionTitle('📦', `${labels.items} (${lines.length}${dossier.lines?.length > MAX_LINES ? '+' : ''})`));
        rows.push(...lines.map((row, index) => formatLineRow(row, index, { nameLen: 36 })));
        if ((dossier.lines || []).length > MAX_LINES) {
            rows.push(`<i>… và ${(dossier.lines.length - MAX_LINES)} dòng nữa — xem đủ trên Fly.</i>`);
        }
    }
    if (totals.tong != null || totals.soTienPhieu != null || totals.thue != null) {
        rows.push('', sectionTitle('💰', labels.totals));
        if (totals.tong != null) rows.push(kv(labels.total, moneyCode(totals.tong)));
        if (totals.soTienPhieu != null && Number(totals.soTienPhieu) !== Number(totals.tong)) {
            rows.push(kv(labels.voucherAmount, moneyCode(totals.soTienPhieu)));
        }
        if (totals.thue != null) rows.push(kv(labels.tax, moneyCode(totals.thue)));
        if (totals.hanNo) rows.push(kv(labels.due, textCode(formatTelegramDate(totals.hanNo, lang) || '—')));
        if (totals.conLai != null) rows.push(kv(labels.remaining, moneyCode(totals.conLai)));
    }
    if (dossier.docs?.length) {
        rows.push('', sectionTitle('🗂', labels.related));
        for (const doc of dossier.docs) {
            const shown = relabelPaymentDoc(doc, labels);
            rows.push(kv(shown.label, textCode(shown.value || '—')));
        }
    }
    const note = dossier.auditNote || dossier.note;
    if (note) rows.push('', `<i>${escapeHtml(String(note).slice(0, 400))}</i>`);
    rows.push('', `<i>${escapeHtml(t(lang, 'flyHint'))}</i>`);
    return rows.filter(line => line !== '').join('\n');
};

const viewDocumentKeyboard = (dossier = {}) => {
    const kind = dossier.kind || 'pc';
    const id = dossier.id;
    if (!id) {
        return {
            inline_keyboard: [[
                { text: '🏠 Tổng quan', callback_data: 'cmd:fly' },
                { text: '⏳ Việc chờ', callback_data: 'cmd:pending' }
            ]]
        };
    }
    return {
        inline_keyboard: [
            [
                { text: '🔄 Cập nhật', callback_data: decisionCallbackData('dt', kind, id) },
                { text: '📄 Chứng từ', callback_data: decisionCallbackData('docs', kind, id) }
            ],
            [
                { text: '🏠 Tổng quan', callback_data: 'cmd:fly' },
                { text: '⏳ Việc chờ', callback_data: 'cmd:pending' }
            ]
        ]
    };
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
        { text: '🔄 Cập nhật', callback_data: decisionCallbackData('dt', kind, id) },
        { text: '📄 Chứng từ', callback_data: decisionCallbackData('docs', kind, id) }
    ]);
    rows.push([
        { text: '📊 Báo cáo', callback_data: 'cmd:reports' },
        { text: '🏠 Tổng quan', callback_data: 'cmd:fly' }
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

const composePaymentPush = async (pool, id, { outcome = 'success', actor, content, lang = 'vi' } = {}) => {
    const dossier = await loadDossier(pool, 'pc', id);
    const paid = {
        ...(dossier || { kind: 'pc', id, lines: [], docs: [], totals: {}, extra: {} }),
        kind: 'pc',
        id: (dossier && dossier.id) || id,
        pending: false,
        paymentOutcome: outcome === 'fail' ? 'fail' : 'success',
        title: outcome === 'fail' ? 'THANH TOÁN PHIẾU CHI THẤT BẠI' : 'THANH TOÁN PHIẾU CHI THÀNH CÔNG',
        paidBy: actor?.TenNV || actor?.HoTen || actor?.TenDangNhap || '',
        auditNote: content || dossier?.note
    };
    if (outcome !== 'fail' && !/thành công|tất toán|đã thanh toán/i.test(paid.status || '')) {
        paid.status = paid.debtStatus || 'Thanh toán thành công';
    }
    if (outcome === 'fail' && !/thất bại/i.test(paid.status || '')) {
        paid.status = 'Thanh toán thất bại';
    }
    return {
        dossier: paid,
        extra: { reply_markup: viewDocumentKeyboard(paid), disable_notification: false },
        textFor(person, personLang = lang) {
            const audience = telegramAudience(person);
            return buildPaymentResultCard(paid, { audience, lang: personLang });
        }
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
            text: `${item.tone === 'urgent' ? '🔴' : '🟡'} Xem ${item.id}`,
            callback_data: decisionCallbackData('dt', item.kind, item.id)
        }]))
    };
};

module.exports = {
    KIND_META,
    KIND_TABLE,
    pingInboxAfterDecision,
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
    buildPaymentResultCard,
    approvalKeyboard,
    viewDocumentKeyboard,
    composePendingPush,
    composePaymentPush,
    telegramAudience,
    formatLineRow,
    isPublicHttpUrl,
    localUploadPath,
    publicFileUrl,
    describeLocalPhoto,
    listPendingDecisions,
    pendingListKeyboard,
    splitTelegramText
};
