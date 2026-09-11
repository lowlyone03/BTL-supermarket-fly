const {
    escapeHtml, formatMoney, moneyCode, formatVnDateTime, formatTelegramDate,
    formatTelegramValue, prettyShiftName, headerBlock, splitTelegramText, t, RULE,
    statusBadge, sectionTitle
} = require('./telegramMessages');

const MAX_RELATED = 8;
const MAX_LINES = 80;

let packOverride = null;

const setDocumentPackOverride = (fn) => {
    packOverride = typeof fn === 'function' ? fn : null;
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

const manyRows = async (pool, text, inputs) => runQuery(pool, text, inputs).catch(() => []);

const idInput = (id) => {
    const sql = sqlTypes();
    return { Id: { type: sql?.VarChar, value: String(id) } };
};

const DOC_KIND_RE = 'po|px|kk|dt|pc|cc|hd|pn|hdm|gh|bckt|bctn|bcm|bck|dept';

const inferKindFromId = (raw) => {
    const id = String(raw || '').trim();
    if (!id) return null;
    if (/^BCKT/i.test(id)) return 'bckt';
    if (/^BCTN/i.test(id)) return 'bctn';
    if (/^BCM/i.test(id)) return 'bcm';
    if (/^BCK/i.test(id)) return 'bck';
    if (/^PO/i.test(id)) return 'po';
    if (/^PX/i.test(id)) return 'px';
    if (/^KK/i.test(id)) return 'kk';
    if (/^DT/i.test(id)) return 'dt';
    if (/^PN/i.test(id)) return 'pn';
    if (/^HDM/i.test(id)) return 'hdm';
    if (/^HD/i.test(id)) return 'hd';
    if (/^TBGH|^GH/i.test(id)) return 'gh';
    if (/^PC(?!L)/i.test(id)) return 'pc';
    if (/^\d+$/.test(id)) return 'cc';
    return null;
};

const parseDocsArg = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return null;
    const tagged = text.match(new RegExp(`^(?:docs:)?(${DOC_KIND_RE}):(.{1,40})$`, 'i'));
    if (tagged) return { kind: tagged[1].toLowerCase(), id: tagged[2] };
    const kind = inferKindFromId(text);
    return kind ? { kind, id: text } : null;
};

const qtyOf = (row) => row.SoLuong ?? row.SL ?? row.SoLuongChapNhan ?? row.SLThucTe;
const priceOf = (row) => row.DonGia ?? row.DonGiaNhap ?? row.DonGiaVon ?? 0;
const amountOf = (row) => {
    if (row.ThanhTien != null) return Number(row.ThanhTien);
    if (row.ThanhTienPhieuNhap != null) return Number(row.ThanhTienPhieuNhap);
    return Number(qtyOf(row) || 0) * Number(priceOf(row) || 0);
};

const formatLine = (row, index, mode = 'sale') => {
    const code = row.MaSP || `#${index + 1}`;
    const name = String(row.TenSP || row.TenHang || '').slice(0, 36);
    const unit = row.DonViTinh ? ` ${escapeHtml(row.DonViTinh)}` : '';
    if (mode === 'count') {
        return `${index + 1}. <b>${escapeHtml(String(code))}</b> ${escapeHtml(name)}\n    HT ${escapeHtml(String(row.SLHeThong ?? '—'))} / TT ${escapeHtml(String(row.SLThucTe ?? '—'))} · lệch ${escapeHtml(String(row.ChenhLech ?? '—'))}${row.NguyenNhan ? ` · ${escapeHtml(row.NguyenNhan)}` : ''}`;
    }
    if (mode === 'receipt') {
        return `${index + 1}. <b>${escapeHtml(String(code))}</b> ${escapeHtml(name)}${unit}\n    giao ${escapeHtml(String(row.SoLuongGiao ?? '—'))} · nhập ${escapeHtml(String(row.SoLuongChapNhan ?? '—'))} · từ chối ${escapeHtml(String(row.SoLuongTuChoi ?? 0))} × ${moneyCode(row.DonGiaNhap ?? row.DonGia)} = ${moneyCode(amountOf(row))}`;
    }
    if (mode === 'return') {
        const loai = row.LoaiDong ? `${escapeHtml(row.LoaiDong)} · ` : '';
        return `${index + 1}. ${loai}<b>${escapeHtml(String(code))}</b> ${escapeHtml(name)}\n    SL ${escapeHtml(String(qtyOf(row) ?? '—'))} × ${moneyCode(priceOf(row))} = ${moneyCode(amountOf(row))}`;
    }
    return `${index + 1}. <b>${escapeHtml(String(code))}</b> ${escapeHtml(name)}${unit}\n    SL ${escapeHtml(String(qtyOf(row) ?? '—'))} × ${moneyCode(priceOf(row))} = ${moneyCode(amountOf(row))}`;
};

const fieldLine = (label, value, lang = 'vi') => {
    if (value == null || value === '') return '';
    return `<b>${escapeHtml(label)}</b>: ${escapeHtml(formatTelegramValue(value, lang))}`;
};

const buildDocumentSheet = (doc = {}, lang = 'vi') => {
    const title = String(doc.title || 'CHỨNG TỪ').toUpperCase();
    const number = doc.number || doc.id || '—';
    const when = formatTelegramDate(doc.date, lang) || formatVnDateTime(doc.date, lang) || '';
    const status = doc.status ? String(doc.status) : '';
    const lines = Array.isArray(doc.lines) ? doc.lines.slice(0, MAX_LINES) : [];
    const fields = Array.isArray(doc.fields) ? doc.fields : [];
    const totals = Array.isArray(doc.totals) ? doc.totals : [];
    const vendor = fields.find(field => /ncc|nhà cung cấp|khách|nhân viên/i.test(String(field.label || '')));
    const totalField = totals.find(item => item.money !== false && (typeof item.value === 'number' || item.format === 'money'));
    const header = [
        headerBlock(`📄 <b>${escapeHtml(title)}</b>`),
        `<blockquote>${status ? statusBadge(status) : 'Chưa xác định'}\n🔖 <b>${escapeHtml(String(number))}</b>${when ? ` · ${escapeHtml(when)}` : ''}${vendor?.value ? `\n${escapeHtml(vendor.label)}: ${escapeHtml(formatTelegramValue(vendor.value, lang))}` : ''}${totalField ? `\n${escapeHtml(totalField.label || 'Số tiền')}: ${moneyCode(totalField.value)}` : ''}</blockquote>`
    ];
    const body = [];
    for (const field of fields) {
        const line = fieldLine(field.label, field.value, lang);
        if (line) body.push(line);
    }
    if (lines.length) {
        body.push('', `<b>📦 Dòng hàng (${lines.length}${(doc.lines || []).length > MAX_LINES ? '+' : ''})</b>`, RULE);
        body.push(...lines.map((row, index) => formatLine(row, index, doc.lineMode || 'sale')));
        if ((doc.lines || []).length > MAX_LINES) {
            body.push(`<i>… còn ${(doc.lines.length - MAX_LINES)} dòng — xem tiếp trang sau hoặc trên Fly.</i>`);
        }
    }
    if (totals.length) {
        body.push('', '<b>💰 Tổng hợp</b>');
        for (const item of totals) {
            const money = item.money !== false && (typeof item.value === 'number' || item.format === 'money');
            const shown = money ? moneyCode(item.value) : escapeHtml(formatTelegramValue(item.value, lang));
            body.push(`<b>${escapeHtml(item.label)}</b>: ${shown}`);
        }
    }
    if (doc.note) body.push('', `<i>${escapeHtml(String(doc.note).slice(0, 500))}</i>`);
    body.push('', `<i>${escapeHtml(t(lang, 'hideAfterRead'))}</i>`);
    return [...header, '', ...body].filter(line => line !== undefined).join('\n');
};

const paginateDocument = (text) => {
    const chunks = splitTelegramText(String(text || ''), 3600);
    if (chunks.length <= 1) return chunks.filter(Boolean);
    return chunks.map((chunk, index) => {
        if (index === 0) return `${chunk}\n\n<i>— trang 1/${chunks.length} —</i>`;
        return `<i>— trang ${index + 1} —</i>\n${chunk}`;
    });
};

const toMessages = (doc, lang) => {
    if (!doc) return [];
    return [{
        text: buildDocumentSheet(doc, lang),
        title: doc.title,
        number: doc.number || doc.id,
        kind: doc.kind,
        sheet: { ...doc, photos: [] },
        photos: []
    }];
};

const loadPoCore = async (pool, id) => {
    const sql = sqlTypes();
    const header = await oneRow(pool, `
        SELECT po.MaPO, po.TrangThai, po.NgayLap, po.TongTien, po.SoNgayThanhToan, po.NgayGiaoDuKien,
               po.DieuKhoanThanhToan, po.MaDN, po.GhiChu, po.LyDoTuChoi,
               ncc.TenNCC, nv.TenNV NguoiLap, duyet.TenNV NguoiDuyet
        FROM DonMuaHang po
        JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
        JOIN NhanVien nv ON nv.MaNV=po.MaNV_Lap
        LEFT JOIN NhanVien duyet ON duyet.MaNV=po.MaNV_Duyet
        WHERE po.MaPO=@Id`, idInput(id));
    if (!header) return null;
    const lines = await manyRows(pool, `
        SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SoLuong, ct.DonGia, ct.ThanhTien,
               ct.ChietKhau, ct.SLDaGiao, ct.SLConThieu
        FROM ChiTietDonMua ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaPO=@Id ORDER BY sp.TenSP`, idInput(id));
    return { header, lines };
};

const sheetPo = (header, lines, lang) => ({
    kind: 'po', title: 'ĐƠN MUA HÀNG', number: header.MaPO, date: header.NgayLap,
    status: header.TrangThai, lineMode: 'sale', lines, photos: [],
    fields: [
        { label: 'Nhà cung cấp', value: header.TenNCC },
        { label: 'Phiếu đề nghị', value: header.MaDN },
        { label: 'Người lập', value: header.NguoiLap },
        { label: 'Người duyệt', value: header.NguoiDuyet || 'Chưa phê duyệt' },
        { label: 'Ngày giao dự kiến', value: header.NgayGiaoDuKien },
        { label: 'Điều khoản', value: header.DieuKhoanThanhToan || (header.SoNgayThanhToan != null ? `Thanh toán trong ${header.SoNgayThanhToan} ngày` : '') },
        { label: 'Hạn nợ (ngày)', value: header.SoNgayThanhToan != null ? `${header.SoNgayThanhToan} ngày` : '' }
    ],
    totals: [{ label: 'TỔNG GIÁ TRỊ ĐƠN MUA', value: header.TongTien, format: 'money' }],
    note: header.GhiChu || header.LyDoTuChoi || `Thanh toán trong ${header.SoNgayThanhToan || '—'} ngày theo điều khoản trên đơn.`
});

const loadShipments = async (pool, maPO) => manyRows(pool, `
    SELECT gh.MaTBGH, gh.SoPhieuGiao, gh.NgayXuatPhat, gh.NgayGioDuKienDen, gh.BienSoXe,
           gh.TenTaiXe, gh.SDTTaiXe, gh.SoKien, gh.TrangThai, gh.NgayDen, gh.GhiChu, nv.TenNV NguoiGhiNhan
    FROM ThongBaoGiaoHang gh
    JOIN NhanVien nv ON nv.MaNV=gh.MaNVGhiNhan
    WHERE gh.MaPO=@Id ORDER BY gh.NgayTao DESC`, idInput(maPO));

const sheetShipment = (row) => ({
    kind: 'gh', title: 'CHUYẾN GIAO / THÔNG BÁO GIAO HÀNG', number: row.MaTBGH,
    date: row.NgayGioDuKienDen || row.NgayTao, status: row.TrangThai, lines: [],
    fields: [
        { label: 'Phiếu giao', value: row.SoPhieuGiao },
        { label: 'Biển số', value: row.BienSoXe },
        { label: 'Tài xế', value: row.TenTaiXe },
        { label: 'SĐT tài xế', value: row.SDTTaiXe },
        { label: 'Số kiện', value: row.SoKien },
        { label: 'Dự kiến đến', value: row.NgayGioDuKienDen },
        { label: 'Đã đến kho', value: row.NgayDen },
        { label: 'Người ghi nhận', value: row.NguoiGhiNhan }
    ],
    note: row.GhiChu || 'Tồn chưa tăng khi xe đến. Thủ kho nhận và lập phiếu nhập trên Fly.'
});

const loadPnById = async (pool, id) => {
    const header = await oneRow(pool, `
        SELECT pn.MaPN, pn.MaPO, pn.MaTBGH, pn.TrangThai, pn.NgayNhap, pn.NgayXacNhan, pn.TongTien, pn.GhiChu,
               ncc.TenNCC, k.TenKho, nv.TenNV NguoiKiemNhan
        FROM PhieuNhap pn
        JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC
        JOIN Kho k ON k.MaKho=pn.MaKho
        JOIN NhanVien nv ON nv.MaNV=pn.MaNV
        WHERE pn.MaPN=@Id`, idInput(id));
    if (!header) return null;
    const lines = await manyRows(pool, `
        SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SoLuongGiao, ct.SoLuongChapNhan, ct.SoLuongTuChoi,
               ct.DonGiaNhap, ct.ThanhTien, ct.TinhTrangHang, ct.SoLo, ct.HanSD
        FROM ChiTietPhieuNhap ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaPN=@Id ORDER BY sp.TenSP`, idInput(id));
    return { header, lines };
};

const sheetPn = (header, lines) => ({
    kind: 'pn',
    title: header.TrangThai === 'Đã xác nhận' ? 'PHIẾU NHẬP KHO' : 'BIÊN BẢN KIỂM NHẬN HÀNG',
    number: header.MaPN, date: header.NgayXacNhan || header.NgayNhap, status: header.TrangThai,
    lineMode: 'receipt', lines, photos: [],
    fields: [
        { label: 'Đơn mua', value: header.MaPO },
        { label: 'Chuyến giao', value: header.MaTBGH },
        { label: 'Nhà cung cấp', value: header.TenNCC },
        { label: 'Kho nhập', value: header.TenKho },
        { label: 'Người kiểm nhận', value: header.NguoiKiemNhan }
    ],
    totals: [
        { label: 'Tổng SL nhập', value: lines.reduce((sum, row) => sum + Number(row.SoLuongChapNhan || 0), 0), money: false },
        { label: 'Tổng giá trị nhập', value: header.TongTien, format: 'money' }
    ],
    note: header.GhiChu || 'Số lượng từ chối không được ghi tăng tồn kho.'
});

const loadHdmById = async (pool, id) => {
    const header = await oneRow(pool, `
        SELECT hd.MaHDMH, hd.SoHoaDon, hd.MaPO, hd.MaPN, hd.NgayHoaDon, hd.NgayTiepNhan,
               hd.TongTienHang, hd.TienThue, hd.TongCong, hd.TrangThai, hd.TrangThaiDoiChieu,
               ncc.TenNCC, nv.TenNV NguoiTiepNhan
        FROM HoaDonMuaHang hd
        JOIN NhaCungCap ncc ON ncc.MaNCC=hd.MaNCC
        JOIN NhanVien nv ON nv.MaNV=hd.MaNV
        WHERE hd.MaHDMH=@Id OR hd.SoHoaDon=@Id`, idInput(id));
    if (!header) return null;
    const lines = await manyRows(pool, `
        SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SoLuong, ct.DonGia, ct.ThueSuat, ct.TienThue, ct.ThanhTien
        FROM ChiTietHoaDonMuaHang ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaHDMH=@Hd ORDER BY sp.TenSP`, {
        Hd: { type: sqlTypes()?.VarChar, value: header.MaHDMH }
    });
    return { header, lines };
};

const sheetHdm = (header, lines) => ({
    kind: 'hdm', title: 'HÓA ĐƠN MUA', number: header.SoHoaDon || header.MaHDMH,
    date: header.NgayHoaDon || header.NgayTiepNhan, status: header.TrangThaiDoiChieu || header.TrangThai,
    lineMode: 'sale', lines, photos: [],
    fields: [
        { label: 'Mã hồ sơ', value: header.MaHDMH },
        { label: 'Số HĐ NCC', value: header.SoHoaDon },
        { label: 'Nhà cung cấp', value: header.TenNCC },
        { label: 'Đơn mua', value: header.MaPO },
        { label: 'Phiếu nhập', value: header.MaPN || 'Chưa có' },
        { label: 'Người tiếp nhận', value: header.NguoiTiepNhan }
    ],
    totals: [
        { label: 'Tiền hàng', value: header.TongTienHang, format: 'money' },
        { label: 'Thuế (VAT)', value: header.TienThue, format: 'money' },
        { label: 'TỔNG CỘNG', value: header.TongCong, format: 'money' }
    ],
    note: 'Phiếu ghi nhận hóa đơn NCC trên Fly — không thay thế hóa đơn GTGT gốc.'
});

const loadHdById = async (pool, id) => {
    const header = await oneRow(pool, `
        SELECT hd.MaHD, hd.NgayLap, hd.TongTienHang, hd.TienGiamGia, hd.TienDiemQuyDoi, hd.TongThanhToan,
               hd.TrangThai, hd.GhiChu, nv.TenNV, ca.MaQuay, ca.MaCa, kh.TenKH, kh.SDT
        FROM HoaDon hd
        JOIN NhanVien nv ON nv.MaNV=hd.MaNV
        JOIN CaLamViec ca ON ca.MaCa=hd.MaCa
        LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
        WHERE hd.MaHD=@Id`, idInput(id));
    if (!header) return null;
    const lines = await manyRows(pool, `
        SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SoLuong, ct.DonGia, ct.ThanhTien
        FROM ChiTietHoaDon ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaHD=@Id ORDER BY sp.TenSP`, idInput(id));
    const payments = await manyRows(pool, `
        SELECT PhuongThuc, SoTien, TrangThai, NgayTT
        FROM ThanhToan WHERE MaHD=@Id ORDER BY NgayTT`, idInput(id));
    return { header, lines, payments };
};

const sheetHd = (header, lines, payments = [], lang = 'vi') => {
    const paid = (payments || []).filter(row => row.TrangThai === 'Thành công');
    const pttt = paid.length
        ? paid.map(row => `${row.PhuongThuc} ${formatMoney(row.SoTien)}`).join(', ')
        : '';
    return {
        kind: 'hd', title: 'HÓA ĐƠN BÁN HÀNG', number: header.MaHD, date: header.NgayLap,
        status: header.TrangThai, lineMode: 'sale', lines, photos: [],
        fields: [
            { label: 'Thu ngân', value: header.TenNV },
            { label: 'Quầy', value: header.MaQuay },
            { label: 'Ca', value: header.MaCa },
            { label: 'Khách hàng', value: header.TenKH || 'Khách vãng lai' },
            { label: 'PTTT', value: pttt }
        ],
        totals: [
            { label: 'Tiền hàng', value: header.TongTienHang, format: 'money' },
            { label: 'Giảm giá', value: header.TienGiamGia, format: 'money' },
            header.TienDiemQuyDoi ? { label: 'Điểm quy đổi', value: header.TienDiemQuyDoi, format: 'money' } : null,
            { label: 'Tổng thanh toán', value: header.TongThanhToan, format: 'money' }
        ].filter(Boolean),
        note: header.GhiChu || 'Bản chữ hóa đơn gốc lúc bán. Đổi trả in trên phiếu DT riêng.'
    };
};

const loadPxCore = async (pool, id) => {
    const header = await oneRow(pool, `
        SELECT px.MaPX, px.TrangThai, px.NgayXuat, px.LoaiXuat, px.GhiChu, px.MaPN, px.MaKK,
               nv.TenNV NguoiLap, nvd.TenNV NguoiDuyet, ncc.TenNCC, k.TenKho
        FROM PhieuXuat px
        JOIN NhanVien nv ON nv.MaNV=px.MaNV
        LEFT JOIN NhanVien nvd ON nvd.MaNV=px.MaNV_Duyet
        LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=px.MaNCC
        LEFT JOIN Kho k ON k.MaKho=px.MaKho
        WHERE px.MaPX=@Id`, idInput(id));
    if (!header) return null;
    const lines = await manyRows(pool, `
        SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SoLuong, ct.DonGia,
               (ct.SoLuong*ISNULL(ct.DonGia,0)) ThanhTien, ct.GhiChu
        FROM ChiTietPhieuXuat ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaPX=@Id ORDER BY sp.TenSP`, idInput(id));
    return { header, lines };
};

const sheetPx = (header, lines) => ({
    kind: 'px', title: 'PHIẾU XUẤT KHO', number: header.MaPX, date: header.NgayXuat,
    status: header.TrangThai, lineMode: 'sale', lines, photos: [],
    fields: [
        { label: 'Loại xuất', value: header.LoaiXuat },
        { label: 'Kho', value: header.TenKho },
        { label: 'Người lập', value: header.NguoiLap },
        { label: 'Người duyệt', value: header.NguoiDuyet || 'Chưa duyệt' },
        { label: 'Phiếu nhập nguồn', value: header.MaPN },
        { label: 'Đợt kiểm kê', value: header.MaKK },
        { label: 'Nhà cung cấp', value: header.TenNCC }
    ],
    totals: [
        { label: 'Tổng SL xuất', value: lines.reduce((sum, row) => sum + Number(row.SoLuong || 0), 0), money: false },
        { label: 'Giá trị tham chiếu', value: lines.reduce((sum, row) => sum + amountOf(row), 0), format: 'money' }
    ],
    note: header.GhiChu || 'Tồn chỉ giảm sau khi Quản lý duyệt và Thủ kho xác nhận xuất.'
});

const loadKkCore = async (pool, id) => {
    const header = await oneRow(pool, `
        SELECT kk.MaKK, kk.TrangThai, kk.NgayKiemKe, kk.GhiChu, nv.TenNV NguoiLap,
               nvd.TenNV NguoiDuyet, k.TenKho
        FROM KiemKe kk
        JOIN NhanVien nv ON nv.MaNV=kk.MaNV
        LEFT JOIN NhanVien nvd ON nvd.MaNV=kk.MaNV_Duyet
        LEFT JOIN Kho k ON k.MaKho=kk.MaKho
        WHERE kk.MaKK=@Id`, idInput(id));
    if (!header) return null;
    const lines = await manyRows(pool, `
        SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SLHeThong, ct.SLThucTe, ct.ChenhLech,
               ct.NguyenNhan, ct.TinhTrangHang
        FROM ChiTietKiemKe ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaKK=@Id ORDER BY ABS(ct.ChenhLech) DESC, sp.TenSP`, idInput(id));
    return { header, lines };
};

const sheetKk = (header, lines) => ({
    kind: 'kk', title: 'PHIẾU KIỂM KÊ', number: header.MaKK, date: header.NgayKiemKe,
    status: header.TrangThai, lineMode: 'count', lines, photos: [],
    fields: [
        { label: 'Kho', value: header.TenKho },
        { label: 'Người lập', value: header.NguoiLap },
        { label: 'Người duyệt', value: header.NguoiDuyet || 'Chưa duyệt' },
        { label: 'SP lệch', value: String(lines.filter(row => Number(row.ChenhLech) !== 0).length) }
    ],
    totals: [{
        label: 'Số dòng', value: lines.length, money: false
    }],
    note: header.GhiChu || 'Chênh lệch từng SP. Duyệt trên Telegram ghi nhật ký như Fly.'
});

const loadDtCore = async (pool, id) => {
    const header = await oneRow(pool, `
        SELECT dt.MaDT, dt.TrangThai, dt.NgayLap, dt.NgayHoan, dt.HinhThucXuLy, dt.LyDo, dt.SoTienHoan,
               dt.MaHD, dt.KetQuaKiemTra, nv.TenNV NguoiLap, nvd.TenNV NguoiDuyet, nvk.TenNV NguoiKiemTra,
               kh.TenKH, hd.TongThanhToan, hd.NgayLap NgayHoaDon, ban.TenNV ThuNganGoc, ca.MaQuay
        FROM PhieuDoiTra dt
        JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
        JOIN HoaDon hd ON hd.MaHD=dt.MaHD
        JOIN NhanVien ban ON ban.MaNV=hd.MaNV
        LEFT JOIN NhanVien nvd ON nvd.MaNV=dt.MaNV_Duyet
        LEFT JOIN NhanVien nvk ON nvk.MaNV=dt.MaNV_KiemTra
        LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
        LEFT JOIN CaLamViec ca ON ca.MaCa=hd.MaCa
        WHERE dt.MaDT=@Id`, idInput(id));
    if (!header) return null;
    const lines = await manyRows(pool, `
        SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SoLuong, ct.DonGia, ct.ThanhTien, ct.LoaiDong
        FROM ChiTietDoiTra ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaDT=@Id ORDER BY ct.LoaiDong, sp.TenSP`, idInput(id));
    return { header, lines };
};

const sheetDt = (header, lines) => ({
    kind: 'dt',
    title: header.HinhThucXuLy === 'Hoàn tiền' ? 'PHIẾU HOÀN TIỀN' : 'PHIẾU ĐỔI HÀNG',
    number: header.MaDT, date: header.NgayHoan || header.NgayLap, status: header.TrangThai,
    lineMode: 'return', lines, photos: [],
    fields: [
        { label: 'Hóa đơn gốc', value: header.MaHD },
        { label: 'Ngày bán gốc', value: header.NgayHoaDon },
        { label: 'Khách hàng', value: header.TenKH || 'Khách vãng lai' },
        { label: 'Thu ngân lập', value: header.NguoiLap },
        { label: 'Thu ngân bán gốc', value: header.ThuNganGoc },
        { label: 'Quầy', value: header.MaQuay },
        { label: 'Hình thức', value: header.HinhThucXuLy },
        { label: 'Thủ kho kiểm', value: header.NguoiKiemTra },
        { label: 'Quản lý duyệt', value: header.NguoiDuyet },
        { label: 'Lý do', value: header.LyDo }
    ],
    totals: [{ label: 'Tiền hoàn', value: header.SoTienHoan, format: 'money' }],
    note: header.KetQuaKiemTra || header.LyDo || 'Phiếu đổi trả. Hóa đơn gốc gửi tin riêng.'
});

const loadPcCore = async (pool, id) => {
    const header = await oneRow(pool, `
        SELECT pc.MaPhieu, pc.TrangThai, pc.NgayChungTu, pc.SoTien, pc.PhuongThuc, pc.NoiDung, pc.GhiChu,
               pc.MaCongNo, pc.HinhThucCapQuy, nv.TenNV NguoiLap, nvd.TenNV NguoiDuyet, ncc.TenNCC,
               cn.HanThanhToan, cn.SoTienConLai, cn.SoTienNo, cn.SoTienDaTra, cn.MaHDMH,
               hd.SoHoaDon, hd.MaPO, hd.MaPN, hd.TienThue, hd.TongCong, hd.TrangThaiDoiChieu, hd.MaHDMH MaHoaDonMua
        FROM PhieuChi pc
        JOIN NhanVien nv ON nv.MaNV=pc.MaNV
        LEFT JOIN NhanVien nvd ON nvd.MaNV=pc.MaNV_Duyet
        LEFT JOIN CongNoPhaiTra cn ON cn.MaCNPTra=pc.MaCongNo
        LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=COALESCE(pc.MaNCC, cn.MaNCC)
        LEFT JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
        WHERE pc.MaPhieu=@Id`, idInput(id));
    if (!header) return null;
    const lines = header.MaHDMH || header.MaHoaDonMua
        ? await manyRows(pool, `
            SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SoLuong, ct.DonGia, ct.ThueSuat, ct.ThanhTien
            FROM ChiTietHoaDonMuaHang ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaHDMH=@Hd ORDER BY sp.TenSP`, {
            Hd: { type: sqlTypes()?.VarChar, value: header.MaHDMH || header.MaHoaDonMua }
        })
        : [];
    return { header, lines };
};

const sheetPc = (header, lines) => ({
    kind: 'pc', title: 'PHIẾU CHI NHÀ CUNG CẤP', number: header.MaPhieu,
    date: header.NgayChungTu, status: header.TrangThai, lineMode: 'sale', lines,
    photos: [],
    fields: [
        { label: 'NCC', value: header.TenNCC },
        { label: 'Người lập', value: header.NguoiLap },
        { label: 'Người duyệt', value: header.NguoiDuyet },
        { label: 'Phương thức', value: header.PhuongThuc },
        { label: 'Hình thức giao quỹ', value: header.HinhThucCapQuy },
        { label: 'Công nợ', value: header.MaCongNo },
        { label: 'Số HĐ NCC', value: header.SoHoaDon },
        { label: 'Đơn mua', value: header.MaPO },
        { label: 'Phiếu nhập', value: header.MaPN },
        { label: 'Đối chiếu 3 bên', value: header.TrangThaiDoiChieu },
        { label: 'Hạn thanh toán', value: header.HanThanhToan }
    ],
    totals: [
        { label: 'Số tiền phiếu', value: header.SoTien, format: 'money' },
        header.TienThue != null ? { label: 'Thuế mua', value: header.TienThue, format: 'money' } : null,
        header.TongCong != null ? { label: 'Tổng cộng HĐ', value: header.TongCong, format: 'money' } : null,
        header.SoTienConLai != null ? { label: 'Còn phải trả', value: header.SoTienConLai, format: 'money' } : null
    ].filter(Boolean),
    note: header.NoiDung || header.GhiChu || 'Không chi NCC từ Telegram. Duyệt ghi nhật ký như Fly.'
});

const sheetDebt = (header) => ({
    kind: 'cn', title: 'CÔNG NỢ PHẢI TRẢ', number: header.MaCongNo,
    date: header.HanThanhToan, status: header.TrangThai,
    fields: [
        { label: 'NCC', value: header.TenNCC },
        { label: 'Hóa đơn NCC', value: header.SoHoaDon },
        { label: 'Đơn mua', value: header.MaPO },
        { label: 'Phiếu nhập', value: header.MaPN },
        { label: 'Hạn thanh toán', value: header.HanThanhToan }
    ],
    totals: [
        { label: 'Giá trị ghi nhận', value: header.SoTienNo, format: 'money' },
        { label: 'Đã trả', value: header.SoTienDaTra, format: 'money' },
        { label: 'CÒN PHẢI TRẢ', value: header.SoTienConLai, format: 'money' }
    ],
    note: 'Công nợ chỉ giảm sau khi Kế toán thanh toán thành công trên Fly.'
});

const loadCcCore = async (pool, id) => {
    const sql = sqlTypes();
    return oneRow(pool, `
        SELECT TOP 1 cc.MaChamCong, cc.TrangThai, cc.ThoiGianVao, cc.ThoiGianRa, cc.GhiChu,
               l.NgayLam, l.MaNV, l.NhiemVu, nv.TenNV, lc.TenCa, lc.MaLoaiCa,
               l.BatDauDuKien, l.KetThucDuKien, ca.MaCa, ca.MaQuay,
               CASE WHEN cc.ThoiGianRa>l.KetThucDuKien
                    THEN DATEDIFF(minute,l.KetThucDuKien,cc.ThoiGianRa) ELSE 0 END AS SoPhutOT
        FROM ChamCong cc
        JOIN LichLamViec l ON l.MaLich=cc.MaLich
        JOIN NhanVien nv ON nv.MaNV=l.MaNV
        JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
        LEFT JOIN CaLamViec ca ON ca.MaLich=l.MaLich OR (ca.MaNV=l.MaNV AND CONVERT(date,ca.ThoiGianBatDau)=l.NgayLam)
        WHERE cc.MaChamCong=@Id`, {
        Id: { type: sql?.BigInt || sql?.VarChar, value: Number(id) || id }
    });
};

const sheetCc = (header) => ({
    kind: 'cc', title: 'PHIẾU CHẤM CÔNG', number: header.MaChamCong,
    date: header.NgayLam, status: header.TrangThai, lines: [],
    fields: [
        { label: 'Nhân viên', value: header.TenNV || header.MaNV },
        { label: 'Ca', value: prettyShiftName(header.TenCa || header.MaLoaiCa) },
        { label: 'Ngày', value: header.NgayLam },
        { label: 'Giờ vào', value: header.ThoiGianVao },
        { label: 'Giờ ra', value: header.ThoiGianRa },
        { label: 'Phút OT', value: header.SoPhutOT != null ? String(header.SoPhutOT) : '0' },
        { label: 'Quầy / mã ca', value: [header.MaQuay, header.MaCa].filter(Boolean).join(' · ') },
        { label: 'Nhiệm vụ', value: header.NhiemVu }
    ],
    note: header.GhiChu || 'Giấy tờ chấm công (UC32). Duyệt trên Telegram ghi nhật ký như Fly → Duyệt công.'
});

const pushSheets = (out, doc, lang) => {
    if (!doc) return;
    out.push(...toMessages(doc, lang));
};

const loadRelatedForPo = async (pool, maPO, lang, out) => {
    const shipments = (await loadShipments(pool, maPO)).slice(0, MAX_RELATED);
    for (const row of shipments) pushSheets(out, sheetShipment(row), lang);
    const receipts = await manyRows(pool, `SELECT MaPN FROM PhieuNhap WHERE MaPO=@Id ORDER BY NgayNhap DESC`, idInput(maPO));
    for (const row of receipts.slice(0, MAX_RELATED)) {
        const loaded = await loadPnById(pool, row.MaPN);
        if (loaded) pushSheets(out, sheetPn(loaded.header, loaded.lines), lang);
    }
    const invoices = await manyRows(pool, `SELECT MaHDMH FROM HoaDonMuaHang WHERE MaPO=@Id ORDER BY NgayTiepNhan DESC`, idInput(maPO));
    for (const row of invoices.slice(0, MAX_RELATED)) {
        const loaded = await loadHdmById(pool, row.MaHDMH);
        if (loaded) pushSheets(out, sheetHdm(loaded.header, loaded.lines), lang);
    }
};

const loadDocumentPack = async (pool, kind, id, lang = 'vi') => {
    if (packOverride) return packOverride({ pool, kind, id, lang });
    const key = String(kind || '').toLowerCase();
    const ma = String(id || '').trim();
    const messages = [];
    try {
        if (key === 'bck') {
            const warehouseTg = require('./warehouseReportTelegram');
            const pack = await warehouseTg.composeWarehouseReportView(pool, ma, { mode: 'view', lang });
            return {
                messages: pack.documents?.length
                    ? pack.documents
                    : [{ text: pack.text, kind: 'bck', number: ma }]
            };
        }
        if (key === 'dept' || key === 'bcm' || key === 'bckt' || key === 'bctn') {
            const deptTg = require('./departmentReportTelegram');
            const pack = await deptTg.composeDepartmentReportView(pool, ma, { mode: 'view', lang });
            return {
                messages: pack.documents?.length
                    ? pack.documents
                    : [{ text: pack.text, kind: key, number: ma }]
            };
        }
        if (key === 'po') {
            const loaded = await loadPoCore(pool, ma);
            if (!loaded) return { messages: missingSheet(key, ma, lang) };
            pushSheets(messages, sheetPo(loaded.header, loaded.lines, lang), lang);
            await loadRelatedForPo(pool, loaded.header.MaPO, lang, messages);
            return { messages };
        }
        if (key === 'pn') {
            const loaded = await loadPnById(pool, ma);
            if (!loaded) return { messages: missingSheet(key, ma, lang) };
            pushSheets(messages, sheetPn(loaded.header, loaded.lines), lang);
            return { messages };
        }
        if (key === 'hdm') {
            const loaded = await loadHdmById(pool, ma);
            if (!loaded) return { messages: missingSheet(key, ma, lang) };
            pushSheets(messages, sheetHdm(loaded.header, loaded.lines), lang);
            return { messages };
        }
        if (key === 'hd') {
            const loaded = await loadHdById(pool, ma);
            if (!loaded) return { messages: missingSheet(key, ma, lang) };
            pushSheets(messages, sheetHd(loaded.header, loaded.lines, loaded.payments, lang), lang);
            return { messages };
        }
        if (key === 'px') {
            const loaded = await loadPxCore(pool, ma);
            if (!loaded) return { messages: missingSheet(key, ma, lang) };
            pushSheets(messages, sheetPx(loaded.header, loaded.lines), lang);
            return { messages };
        }
        if (key === 'kk') {
            const loaded = await loadKkCore(pool, ma);
            if (!loaded) return { messages: missingSheet(key, ma, lang) };
            pushSheets(messages, sheetKk(loaded.header, loaded.lines), lang);
            return { messages };
        }
        if (key === 'dt') {
            const loaded = await loadDtCore(pool, ma);
            if (!loaded) return { messages: missingSheet(key, ma, lang) };
            pushSheets(messages, sheetDt(loaded.header, loaded.lines), lang);
            if (loaded.header.MaHD) {
                const invoice = await loadHdById(pool, loaded.header.MaHD);
                if (invoice) pushSheets(messages, sheetHd(invoice.header, invoice.lines, invoice.payments, lang), lang);
            }
            return { messages };
        }
        if (key === 'pc') {
            const loaded = await loadPcCore(pool, ma);
            if (!loaded) return { messages: missingSheet(key, ma, lang) };
            pushSheets(messages, sheetPc(loaded.header, loaded.lines), lang);
            if (loaded.header.MaCongNo) pushSheets(messages, sheetDebt(loaded.header), lang);
            if (loaded.header.MaHDMH || loaded.header.MaHoaDonMua) {
                const invoice = await loadHdmById(pool, loaded.header.MaHDMH || loaded.header.MaHoaDonMua);
                if (invoice) pushSheets(messages, sheetHdm(invoice.header, invoice.lines), lang);
            }
            if (loaded.header.MaPO) {
                const po = await loadPoCore(pool, loaded.header.MaPO);
                if (po) pushSheets(messages, sheetPo(po.header, po.lines, lang), lang);
            }
            return { messages };
        }
        if (key === 'cc') {
            const header = await loadCcCore(pool, ma);
            if (!header) return { messages: missingSheet(key, ma, lang) };
            pushSheets(messages, sheetCc(header), lang);
            return { messages };
        }
        if (key === 'gh') {
            const row = await oneRow(pool, `
                SELECT gh.MaTBGH, gh.SoPhieuGiao, gh.NgayXuatPhat, gh.NgayGioDuKienDen, gh.BienSoXe,
                       gh.TenTaiXe, gh.SDTTaiXe, gh.SoKien, gh.TrangThai, gh.NgayDen, gh.GhiChu,
                       nv.TenNV NguoiGhiNhan, gh.MaPO
                FROM ThongBaoGiaoHang gh JOIN NhanVien nv ON nv.MaNV=gh.MaNVGhiNhan
                WHERE gh.MaTBGH=@Id`, idInput(ma));
            if (!row) return { messages: missingSheet(key, ma, lang) };
            pushSheets(messages, sheetShipment(row), lang);
            return { messages };
        }
    } catch (error) {
        console.error('Telegram chứng từ:', error.message);
    }
    return { messages: missingSheet(key, ma, lang) };
};

const missingSheet = (kind, id, lang) => toMessages({
    title: 'CHỨNG TỪ',
    number: id || '—',
    note: t(lang, 'docsMissing'),
    fields: [{ label: 'Loại', value: kind || '—' }]
}, lang);

const buildDocsIndex = (items = [], lang = 'vi') => {
    const rows = [
        headerBlock(`📄 <b>${escapeHtml(t(lang, 'docsTitle'))}</b>`),
        `<i>${escapeHtml(t(lang, 'docsIndexHint'))}</i>`,
        ''
    ];
    if (!items.length) {
        rows.push(escapeHtml(t(lang, 'docsEmpty')));
        return rows.join('\n');
    }
    for (const item of items.slice(0, 8)) {
        rows.push(`• <b>${escapeHtml(item.id)}</b> · ${escapeHtml(item.title || item.kind || '')}${item.detail ? ` — ${escapeHtml(String(item.detail).slice(0, 80))}` : ''}`);
    }
    rows.push('', `<i>${escapeHtml(t(lang, 'docsIndexFooter'))}</i>`);
    return rows.filter(Boolean).join('\n');
};

const docsIndexKeyboard = (items = []) => {
    const rows = items.slice(0, 8).map(item => ([{
        text: `📄 ${item.id}`,
        callback_data: String(`docs:${item.kind}:${item.id}`).slice(0, 64)
    }]));
    rows.push([{ text: '⏳ Việc chờ', callback_data: 'cmd:pending' }, { text: '📊 Báo cáo', callback_data: 'cmd:reports' }]);
    return { inline_keyboard: rows };
};

const DOC_TYPE_KEYS = [
    { kind: 'po', key: 'docsTypePo' },
    { kind: 'pn', key: 'docsTypePn' },
    { kind: 'hdm', key: 'docsTypeHdm' },
    { kind: 'hd', key: 'docsTypeHd' },
    { kind: 'px', key: 'docsTypePx' },
    { kind: 'kk', key: 'docsTypeKk' },
    { kind: 'dt', key: 'docsTypeDt' },
    { kind: 'pc', key: 'docsTypePc' },
    { kind: 'cc', key: 'docsTypeCc' },
    { kind: 'bck', key: 'docsTypeBck' },
    { kind: 'bcm', key: 'docsTypeBcm' }
];

const DOC_LIST_LIMIT = 12;

const DOC_LIST_SQL = {
    po: `SELECT TOP ${DOC_LIST_LIMIT} po.MaPO AS id, po.NgayLap AS ngay, po.TrangThai AS trangThai, ncc.TenNCC AS doiTuong
         FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
         ORDER BY po.NgayLap DESC, po.MaPO DESC`,
    pn: `SELECT TOP ${DOC_LIST_LIMIT} pn.MaPN AS id, ISNULL(pn.NgayXacNhan, pn.NgayNhap) AS ngay, pn.TrangThai AS trangThai, ncc.TenNCC AS doiTuong
         FROM PhieuNhap pn JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC
         ORDER BY ISNULL(pn.NgayXacNhan, pn.NgayNhap) DESC, pn.MaPN DESC`,
    hdm: `SELECT TOP ${DOC_LIST_LIMIT} hd.MaHDMH AS id, ISNULL(hd.NgayHoaDon, hd.NgayTiepNhan) AS ngay,
                ISNULL(hd.TrangThaiDoiChieu, hd.TrangThai) AS trangThai, ncc.TenNCC AS doiTuong
         FROM HoaDonMuaHang hd JOIN NhaCungCap ncc ON ncc.MaNCC=hd.MaNCC
         ORDER BY ISNULL(hd.NgayHoaDon, hd.NgayTiepNhan) DESC, hd.MaHDMH DESC`,
    hd: `SELECT TOP ${DOC_LIST_LIMIT} hd.MaHD AS id, hd.NgayLap AS ngay, hd.TrangThai AS trangThai,
                ISNULL(kh.TenKH, N'Khách vãng lai') AS doiTuong
         FROM HoaDon hd LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
         ORDER BY hd.NgayLap DESC, hd.MaHD DESC`,
    px: `SELECT TOP ${DOC_LIST_LIMIT} px.MaPX AS id, px.NgayXuat AS ngay, px.TrangThai AS trangThai,
                ISNULL(ncc.TenNCC, px.LoaiXuat) AS doiTuong
         FROM PhieuXuat px LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=px.MaNCC
         ORDER BY px.NgayXuat DESC, px.MaPX DESC`,
    kk: `SELECT TOP ${DOC_LIST_LIMIT} kk.MaKK AS id, kk.NgayKiemKe AS ngay, kk.TrangThai AS trangThai,
                ISNULL(k.TenKho, N'Kho') AS doiTuong
         FROM KiemKe kk LEFT JOIN Kho k ON k.MaKho=kk.MaKho
         ORDER BY kk.NgayKiemKe DESC, kk.MaKK DESC`,
    dt: `SELECT TOP ${DOC_LIST_LIMIT} dt.MaDT AS id, dt.NgayLap AS ngay, dt.TrangThai AS trangThai,
                ISNULL(kh.TenKH, N'Khách vãng lai') AS doiTuong
         FROM PhieuDoiTra dt JOIN HoaDon hd ON hd.MaHD=dt.MaHD
         LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
         ORDER BY dt.NgayLap DESC, dt.MaDT DESC`,
    pc: `SELECT TOP ${DOC_LIST_LIMIT} pc.MaPhieu AS id, pc.NgayChungTu AS ngay, pc.TrangThai AS trangThai,
                ISNULL(ncc.TenNCC, pc.NoiDung) AS doiTuong
         FROM PhieuChi pc LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=pc.MaNCC
         ORDER BY pc.NgayChungTu DESC, pc.MaPhieu DESC`,
    bck: `SELECT TOP ${DOC_LIST_LIMIT} bc.MaBC AS id, bc.NgayNop AS ngay, bc.TrangThai AS trangThai,
                ISNULL(bc.NhanKy, bc.TenNV_Lap) AS doiTuong
         FROM BaoCaoKhoNop bc
         ORDER BY bc.NgayNop DESC, bc.MaBC DESC`,
    bcm: `SELECT TOP ${DOC_LIST_LIMIT} bc.MaBC AS id, bc.NgayNop AS ngay, bc.TrangThai AS trangThai,
                ISNULL(bc.NhanKy, bc.TenNV_Lap) AS doiTuong
         FROM BaoCaoBoPhanNop bc
         WHERE bc.TrangThai IN (N'Đã gửi', N'Đã xem', N'Cần phản hồi')
         ORDER BY bc.NgayNop DESC, bc.MaBC DESC`,
    cc: `SELECT TOP ${DOC_LIST_LIMIT} CAST(cc.MaChamCong AS varchar(20)) AS id, l.NgayLam AS ngay,
                cc.TrangThai AS trangThai, nv.TenNV AS doiTuong
         FROM ChamCong cc
         JOIN LichLamViec l ON l.MaLich=cc.MaLich
         JOIN NhanVien nv ON nv.MaNV=l.MaNV
         ORDER BY l.NgayLam DESC, cc.MaChamCong DESC`
};

let recentDocsOverride = null;
const setRecentDocsOverride = (fn) => {
    recentDocsOverride = typeof fn === 'function' ? fn : null;
};

const buildDocsTypeMenu = (lang = 'vi') => [
    headerBlock(`📄 <b>${escapeHtml(t(lang, 'docsPickTitle'))}</b>`),
    `<i>${escapeHtml(t(lang, 'docsPickHint'))}</i>`,
    '',
    `<i>${escapeHtml(t(lang, 'hideAfterRead'))}</i>`
].join('\n');

const docsTypeKeyboard = (lang = 'vi') => {
    const buttons = DOC_TYPE_KEYS.map(item => ({
        text: t(lang, item.key),
        callback_data: `dkind:${item.kind}`
    }));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
        rows.push(buttons.slice(i, i + 2));
    }
    return { inline_keyboard: rows };
};

const listRecentDocuments = async (pool, kind) => {
    const key = String(kind || '').toLowerCase();
    if (recentDocsOverride) return recentDocsOverride({ pool, kind: key });
    const sqlText = DOC_LIST_SQL[key];
    if (!sqlText || !pool) return [];
    return manyRows(pool, sqlText, {});
};

const buildDocsTypeList = (kind, rows = [], lang = 'vi') => {
    const meta = DOC_TYPE_KEYS.find(item => item.kind === kind);
    const typeName = meta ? t(lang, meta.key) : String(kind || '');
    const lines = [
        headerBlock(`📄 <b>${escapeHtml(t(lang, 'docsListTitle', { type: typeName }))}</b>`),
        `<i>${escapeHtml(t(lang, 'docsListHint'))}</i>`,
        ''
    ];
    if (!rows.length) {
        lines.push(escapeHtml(t(lang, 'docsListEmpty')));
        return lines.join('\n');
    }
    for (const row of rows.slice(0, 15)) {
        const ngay = formatTelegramDate(row.ngay, lang) || '';
        lines.push(`${statusBadge(row.trangThai || '—')}  <b>${escapeHtml(row.id)}</b>\n   ${escapeHtml(ngay || '—')} · ${escapeHtml(row.doiTuong || '—')}`);
    }
    return lines.filter(Boolean).join('\n');
};

const docsTypeListKeyboard = (kind, rows = [], lang = 'vi') => {
    const buttons = rows.slice(0, 15).map(row => ([{
        text: `📄 ${row.id}`,
        callback_data: String(`docs:${kind}:${row.id}`).slice(0, 64)
    }]));
    buttons.push([
        { text: t(lang, 'docsBackTypes'), callback_data: 'cmd:docs' },
        { text: '🏠 Tổng quan', callback_data: 'cmd:fly' }
    ]);
    return { inline_keyboard: buttons };
};

module.exports = {
    DOC_KIND_RE,
    inferKindFromId,
    parseDocsArg,
    buildDocumentSheet,
    formatLine,
    paginateDocument,
    toMessages,
    loadDocumentPack,
    setDocumentPackOverride,
    buildDocsIndex,
    docsIndexKeyboard,
    DOC_TYPE_KEYS,
    buildDocsTypeMenu,
    docsTypeKeyboard,
    listRecentDocuments,
    setRecentDocsOverride,
    buildDocsTypeList,
    docsTypeListKeyboard,
    sheetPo,
    sheetPn,
    sheetHdm,
    sheetHd,
    sheetPx,
    sheetKk,
    sheetDt,
    sheetPc,
    sheetCc,
    sheetShipment
};
