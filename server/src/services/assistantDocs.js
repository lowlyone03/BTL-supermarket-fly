const { sql } = require('../config/db');
const { fold } = require('./assistantFaq');
const { isRole } = require('./inboxService');
const { hasUc } = require('./assistantTools');
const {
    parsePeriod,
    isManagerUser,
    canReadPurchase,
    canReadSales,
    canReadStoreReport,
    listPurchaseInvoicesByMonth,
    getPurchaseInvoiceDetail,
    listSalesInvoicesByMonth,
    getSalesInvoiceDetail,
    compactStoreReport,
    zeroStoreReport
} = require('./assistantInvoices');
const { resolveReportingPeriod } = require('./reportingPeriod');
const { buildReport } = require('./storeProfitLoss');

const allowed = (user, extra = []) => isManagerUser(user) || extra.some((code) => hasUc(user, code));

const rowsOf = async (pool, period, text, extra = {}) => {
    const request = pool.request()
        .input('From', sql.Date, period.from)
        .input('ToExclusive', sql.Date, period.toExclusive)
        .input('MaNV', sql.VarChar, extra.MaNV || '');
    if (extra.Key) request.input('Key', sql.VarChar, extra.Key);
    const result = await request.query(text);
    return result.recordset || [];
};

const item = (id, so, partner, ngay, tien, trangThai) => ({
    id: String(id || ''),
    soHd: String(so || id || ''),
    ncc: partner || '—',
    ngay: ngay || null,
    tien: Number(tien || 0),
    trangThai: String(trangThai || '')
});

const printOf = ({ title, number, date, status, fields, columns, rows, totals, note, signatures, variant, watermark }) => ({
    variant: variant || (String(title || '').toUpperCase().startsWith('BÁO CÁO') ? 'report' : undefined),
    title,
    number: number || '',
    documentDate: date || new Date(),
    status: status || '',
    watermark: watermark || '',
    fields: fields || [],
    columns: columns || [],
    rows: rows || [],
    totals: totals || [],
    note: note || '',
    signatures: signatures || ['Người lập', 'Quản lý cửa hàng']
});

const emptyPrint = (spec, period) => printOf({
    title: spec.title,
    number: period.label,
    status: period.label,
    watermark: 'CHƯA CÓ SỐ LIỆU',
    fields: [
        { label: 'Kỳ', value: period.label },
        { label: 'Từ ngày', value: period.from },
        { label: 'Đến ngày', value: period.toExclusive }
    ],
    columns: [
        { key: 'chiTieu', label: 'Chỉ tiêu' },
        { key: 'soTien', label: 'Số tiền', format: 'money', align: 'right' }
    ],
    rows: [{ chiTieu: spec.label, soTien: 0 }],
    totals: [{ label: spec.label, value: 0, format: 'money' }],
    note: `${period.label} chưa phát sinh. Mẫu in với số 0.`,
    variant: spec.mode === 'report' ? 'report' : undefined
});

const okResult = ({ spec, period, answer, items = [], report = null, print = null, evidence = [] }) => {
    const rows = (items || []).map((row) => ({ ...row, loai: spec.loai }));
    return {
        allowed: true,
        blocked: false,
        answer,
        sources: [spec.source],
        evidence,
        nextActions: [],
        kind: spec.id,
        loai: spec.loai,
        items: rows,
        invoices: rows,
        invoiceKind: spec.mode === 'list' ? spec.id : null,
        report,
        print: print ? { loai: spec.loai, mau: print } : null,
        period,
        model: null
    };
};

const KINDS = [
    {
        id: 'purchase',
        loai: 'HoaDonMuaHang',
        label: 'Hóa đơn mua',
        title: 'HÓA ĐƠN MUA HÀNG',
        source: 'Hóa đơn mua hàng',
        partner: 'NCC',
        mode: 'list',
        extraUc: ['UC27'],
        match: (f) => /hoa\s*don\s*mua|hoa\s*don\s*ncc|hd\s*mua|hdmh|hđmh/.test(f)
            || (/hoa\s*don/.test(f) && /\bmua\b|\bncc\b/.test(f))
    },
    {
        id: 'sales',
        loai: 'HoaDon',
        label: 'Hóa đơn bán',
        title: 'HÓA ĐƠN BÁN HÀNG',
        source: 'Hóa đơn bán hàng',
        partner: 'Khách',
        mode: 'list',
        extraUc: ['UC24'],
        match: (f) => /hoa\s*don\s*ban|hoa\s*don\s*pos|hd\s*ban|hoa\s*don\s*quay/.test(f)
            || (/hoa\s*don/.test(f) && !/\bmua\b|\bncc\b/.test(f))
    },
    {
        id: 'po',
        loai: 'DonMuaHang',
        label: 'Đơn mua',
        title: 'ĐƠN MUA HÀNG',
        source: 'Đơn mua hàng',
        partner: 'NCC',
        mode: 'list',
        extraUc: ['UC05', 'UC13'],
        match: (f) => /don\s*mua|\bpo\b|don\s*hang\s*mua/.test(f) && !/hoa\s*don/.test(f)
    },
    {
        id: 'receipt',
        loai: 'PhieuNhap',
        label: 'Phiếu nhập',
        title: 'PHIẾU NHẬP KHO',
        source: 'Phiếu nhập kho',
        partner: 'NCC',
        mode: 'list',
        extraUc: ['UC17', 'UC18'],
        match: (f) => /phieu\s*nhap|\bpn\b|nhap\s*kho/.test(f)
    },
    {
        id: 'issue',
        loai: 'PhieuXuat',
        label: 'Phiếu xuất',
        title: 'PHIẾU XUẤT KHO',
        source: 'Phiếu xuất kho',
        partner: 'Kho',
        mode: 'list',
        extraUc: ['UC06', 'UC19'],
        match: (f) => /phieu\s*xuat|\bpx\b|xuat\s*kho/.test(f)
    },
    {
        id: 'request',
        loai: 'DeNghiMuaHang',
        label: 'Đề nghị mua',
        title: 'PHIẾU ĐỀ NGHỊ MUA HÀNG',
        source: 'Đề nghị mua hàng',
        partner: 'Kho',
        mode: 'list',
        extraUc: ['UC12', 'UC16'],
        match: (f) => /de\s*nghi\s*mua|phieu\s*de\s*nghi|\bdn\b/.test(f)
    },
    {
        id: 'return',
        loai: 'PhieuDoiTra',
        label: 'Đổi trả',
        title: 'HỒ SƠ KIỂM ĐỔI TRẢ',
        source: 'Đổi trả',
        partner: 'Khách',
        mode: 'list',
        extraUc: ['UC08', 'UC21', 'UC26'],
        match: (f) => /doi\s*tra|phieu\s*doi|\bdt\b/.test(f)
    },
    {
        id: 'count',
        loai: 'KiemKe',
        label: 'Kiểm kê',
        title: 'PHIẾU KIỂM KÊ',
        source: 'Kiểm kê',
        partner: 'Kho',
        mode: 'list',
        extraUc: ['UC07', 'UC20'],
        match: (f) => /kiem\s*ke|\bkk\b/.test(f)
    },
    {
        id: 'receipt-cash',
        loai: 'PhieuThu',
        label: 'Phiếu thu ca',
        title: 'PHIẾU THU TIỀN MẶT BÀN GIAO CA',
        source: 'Phiếu thu ca',
        partner: 'Thu ngân',
        mode: 'list',
        extraUc: ['UC29'],
        match: (f) => /phieu\s*thu|thu\s*ca|ban\s*giao\s*ca/.test(f)
    },
    {
        id: 'payment',
        loai: 'PhieuChi',
        label: 'Phiếu chi',
        title: 'PHIẾU CHI',
        source: 'Phiếu chi',
        partner: 'NCC',
        mode: 'list',
        extraUc: ['UC09', 'UC28'],
        match: (f) => /phieu\s*chi/.test(f) && !/luong/.test(f)
    },
    {
        id: 'payables',
        loai: 'CongNoPhaiTra',
        label: 'Công nợ NCC',
        title: 'BÁO CÁO TỔNG HỢP CÔNG NỢ NHÀ CUNG CẤP',
        source: 'Công nợ',
        partner: 'NCC',
        mode: 'list',
        extraUc: ['UC28', 'UC10'],
        match: (f) => /cong\s*no|phai\s*tra\s*ncc/.test(f)
    },
    {
        id: 'payroll',
        loai: 'BangLuong',
        label: 'Lương gộp',
        title: 'BÁO CÁO LƯƠNG GỘP THÁNG',
        source: 'Bảng lương',
        mode: 'report',
        extraUc: ['UC32', 'UC33'],
        match: (f) => /luong/.test(f) && !/phieu\s*chi/.test(f)
    },
    {
        id: 'low-stock',
        loai: 'TonThap',
        label: 'Tồn thấp',
        title: 'BÁO CÁO TỒN THẤP',
        source: 'Dashboard quản lý',
        partner: 'Mặt hàng',
        mode: 'list',
        extraUc: ['UC10', 'UC15'],
        match: (f) => /ton\s*thap|duoi\s*dinh\s*muc|canh\s*bao\s*ton/.test(f)
    },
    {
        id: 'warehouse-report',
        loai: 'BaoCaoThuKho',
        label: 'Báo cáo thủ kho',
        title: 'BÁO CÁO THỦ KHO',
        source: 'Báo cáo thủ kho',
        mode: 'report',
        extraUc: ['UC10', 'UC15'],
        match: (f) => /bao\s*cao\s*thu\s*kho|thu\s*kho/.test(f) && /bao\s*cao|in\b|tai\b|xem\b/.test(f)
    },
    {
        id: 'department-report',
        loai: 'BaoCaoBoPhan',
        label: 'Báo cáo bộ phận',
        title: 'BÁO CÁO BỘ PHẬN',
        source: 'Báo cáo bộ phận',
        mode: 'report',
        extraUc: ['UC10'],
        match: (f) => /bao\s*cao\s*bo\s*phan|bcm|bckt|bctn/.test(f) && /bao\s*cao|in\b|tai\b|xem\b/.test(f)
    },
    {
        id: 'trial-balance',
        loai: 'CanDoiPhatSinh',
        label: 'Cân đối phát sinh',
        title: 'BẢNG CÂN ĐỐI PHÁT SINH',
        source: 'Cân đối phát sinh',
        mode: 'report',
        extraUc: ['UC38', 'UC43'],
        match: (f) => /can\s*doi\s*phat\s*sinh|\bcdps\b|cđps/.test(f)
    },
    {
        id: 'kqkd',
        loai: 'KQKD',
        label: 'KQKD',
        title: 'BÁO CÁO KẾT QUẢ KINH DOANH',
        source: 'KQKD',
        mode: 'report',
        extraUc: ['UC43', 'UC10'],
        match: (f) => /\bkqkd\b|ket\s*qua\s*kinh\s*doanh/.test(f)
    },
    {
        id: 'cash-flow',
        loai: 'LCTT',
        label: 'Lưu chuyển tiền tệ',
        title: 'BÁO CÁO LƯU CHUYỂN TIỀN TỆ',
        source: 'Lưu chuyển tiền tệ',
        mode: 'report',
        extraUc: ['UC43', 'UC10'],
        match: (f) => /luu\s*chuyen|\blctt\b/.test(f)
    },
    {
        id: 'balance-sheet',
        loai: 'BCDKT',
        label: 'Bảng cân đối kế toán',
        title: 'BẢNG CÂN ĐỐI KẾ TOÁN',
        source: 'Bảng cân đối kế toán',
        mode: 'report',
        extraUc: ['UC43', 'UC38'],
        match: (f) => /can\s*doi\s*ke\s*toan|\bbcdkt\b|bang\s*can\s*doi/.test(f) && !/phat\s*sinh/.test(f)
    },
    {
        id: 'store-report',
        loai: 'BaoCaoCuaHang',
        label: 'Báo cáo cửa hàng',
        title: 'BÁO CÁO CỬA HÀNG THEO THÁNG',
        source: 'Báo cáo cửa hàng',
        mode: 'report',
        extraUc: ['UC10', 'UC43'],
        match: (f) => (/bao\s*cao|\bpnl\b|p\s*&\s*l|lai\s*lo/.test(f)
            && /thang|nay|cua\s*hang|in\b|tai\b|xem\b/.test(f))
            || /in\s+bao\s*cao|tai\s+bao\s*cao|xem\s+bao\s*cao/.test(f)
            || /doanh\s*(so|thu).*(thang|quy|nam|20\d{2})/.test(f)
            || /bao\s*cao\s*thang/.test(f)
    }
];

const detectDocumentIntent = (question) => {
    const folded = fold(question);
    const spec = KINDS.find((kind) => kind.match(folded));
    if (!spec) return null;
    return { kind: spec.id, loai: spec.loai, period: parsePeriod(question) };
};

const detectInvoiceIntent = detectDocumentIntent;

const specOf = (id) => KINDS.find((kind) => kind.id === id);

const canReadKind = (spec, user) => {
    if (spec.id === 'purchase') return canReadPurchase(user);
    if (spec.id === 'sales') return canReadSales(user);
    if (spec.id === 'store-report') return canReadStoreReport(user);
    if (spec.id === 'payroll') return isManagerUser(user) || hasUc(user, 'UC32') || hasUc(user, 'UC33');
    return allowed(user, spec.extraUc);
};

const listAndPrint = {
    async purchase(pool, user, period) {
        const rows = await listPurchaseInvoicesByMonth(pool, period);
        const items = rows.map((row) => item(row.MaHDMH, row.SoHoaDon, row.TenNCC, row.NgayHoaDon, row.TongCong, row.TrangThaiDoiChieu || row.TrangThai));
        return { items };
    },
    async sales(pool, user, period) {
        const rows = await listSalesInvoicesByMonth(pool, user, period);
        const items = rows.map((row) => item(row.MaHD, row.MaHD, row.TenKH || 'Khách vãng lai', row.NgayLap, row.TongThanhToan || row.TongTienHang, row.TrangThai));
        return { items };
    },
    async po(pool, user, period) {
        const rows = await rowsOf(pool, period, `
            SELECT TOP 80 po.MaPO, po.NgayLap, po.TongTien, po.TrangThai, ncc.TenNCC
            FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
            WHERE CONVERT(date, po.NgayLap) >= @From AND CONVERT(date, po.NgayLap) < @ToExclusive
            ORDER BY po.NgayLap DESC`);
        return { items: rows.map((row) => item(row.MaPO, row.MaPO, row.TenNCC, row.NgayLap, row.TongTien, row.TrangThai)) };
    },
    async receipt(pool, user, period) {
        const rows = await rowsOf(pool, period, `
            SELECT TOP 80 pn.MaPN, pn.NgayNhap, pn.NgayXacNhan, pn.TongTien, pn.TrangThai, ncc.TenNCC
            FROM PhieuNhap pn JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC
            WHERE CONVERT(date, COALESCE(pn.NgayXacNhan, pn.NgayNhap)) >= @From
              AND CONVERT(date, COALESCE(pn.NgayXacNhan, pn.NgayNhap)) < @ToExclusive
            ORDER BY COALESCE(pn.NgayXacNhan, pn.NgayNhap) DESC`);
        return { items: rows.map((row) => item(row.MaPN, row.MaPN, row.TenNCC, row.NgayXacNhan || row.NgayNhap, row.TongTien, row.TrangThai)) };
    },
    async issue(pool, user, period) {
        const rows = await rowsOf(pool, period, `
            SELECT TOP 80 px.MaPX, px.NgayXuat, px.TrangThai, px.LoaiXuat, k.TenKho,
                   COALESCE((SELECT SUM(ct.SoLuong*ct.DonGia) FROM ChiTietPhieuXuat ct WHERE ct.MaPX=px.MaPX),0) TongTien
            FROM PhieuXuat px JOIN Kho k ON k.MaKho=px.MaKho
            WHERE CONVERT(date, px.NgayXuat) >= @From AND CONVERT(date, px.NgayXuat) < @ToExclusive
            ORDER BY px.NgayXuat DESC`);
        return { items: rows.map((row) => item(row.MaPX, row.MaPX, row.TenKho || row.LoaiXuat, row.NgayXuat, row.TongTien, row.TrangThai)) };
    },
    async request(pool, user, period) {
        const rows = await rowsOf(pool, period, `
            SELECT TOP 80 dn.MaDN, dn.NgayLap, dn.TrangThai, nv.TenNV,
                   (SELECT COUNT(*) FROM ChiTietDeNghi ct WHERE ct.MaDN=dn.MaDN) SoMatHang
            FROM DeNghiMuaHang dn JOIN NhanVien nv ON nv.MaNV=dn.MaNV_Lap
            WHERE CONVERT(date, dn.NgayLap) >= @From AND CONVERT(date, dn.NgayLap) < @ToExclusive
            ORDER BY dn.NgayLap DESC`);
        return { items: rows.map((row) => item(row.MaDN, row.MaDN, row.TenNV, row.NgayLap, row.SoMatHang, row.TrangThai)) };
    },
    async return(pool, user, period) {
        const rows = await rowsOf(pool, period, `
            SELECT TOP 80 dt.MaDT, dt.NgayLap, dt.SoTienHoan, dt.TrangThai, dt.MaHD, kh.TenKH
            FROM PhieuDoiTra dt
            LEFT JOIN HoaDon hd ON hd.MaHD=dt.MaHD
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            WHERE CONVERT(date, dt.NgayLap) >= @From AND CONVERT(date, dt.NgayLap) < @ToExclusive
            ORDER BY dt.NgayLap DESC`);
        return { items: rows.map((row) => item(row.MaDT, row.MaDT, row.TenKH || row.MaHD, row.NgayLap, row.SoTienHoan, row.TrangThai)) };
    },
    async count(pool, user, period) {
        const rows = await rowsOf(pool, period, `
            SELECT TOP 80 kk.MaKK, kk.NgayKiemKe, kk.TrangThai, nv.TenNV
            FROM KiemKe kk JOIN NhanVien nv ON nv.MaNV=kk.MaNV
            WHERE CONVERT(date, kk.NgayKiemKe) >= @From AND CONVERT(date, kk.NgayKiemKe) < @ToExclusive
            ORDER BY kk.NgayKiemKe DESC`);
        return { items: rows.map((row) => item(row.MaKK, row.MaKK, row.TenNV, row.NgayKiemKe, 0, row.TrangThai)) };
    },
    async 'receipt-cash'(pool, user, period) {
        const rows = await rowsOf(pool, period, `
            SELECT TOP 80 pt.MaPT, pt.NgayLap, pt.SoTienThucNop, pt.TrangThai, ca.MaCa, nv.TenNV
            FROM PhieuThu pt
            JOIN CaLamViec ca ON ca.MaCa=pt.MaCa
            JOIN NhanVien nv ON nv.MaNV=ca.MaNV
            WHERE CONVERT(date, pt.NgayLap) >= @From AND CONVERT(date, pt.NgayLap) < @ToExclusive
            ORDER BY pt.NgayLap DESC`);
        return { items: rows.map((row) => item(row.MaPT, row.MaPT, row.TenNV, row.NgayLap, row.SoTienThucNop, row.TrangThai)) };
    },
    async payment(pool, user, period) {
        const rows = await rowsOf(pool, period, `
            SELECT TOP 80 pc.MaPhieu, pc.NgayChungTu, pc.SoTien, pc.TrangThai, ncc.TenNCC, pc.NoiDung
            FROM PhieuChi pc LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=pc.MaNCC
            WHERE CONVERT(date, pc.NgayChungTu) >= @From AND CONVERT(date, pc.NgayChungTu) < @ToExclusive
            ORDER BY pc.NgayChungTu DESC`);
        return { items: rows.map((row) => item(row.MaPhieu, row.MaPhieu, row.TenNCC || row.NoiDung, row.NgayChungTu, row.SoTien, row.TrangThai)) };
    },
    async payables(pool) {
        const rows = await pool.request().query(`
            SELECT TOP 80 cn.MaCNPTra, ncc.TenNCC, hd.SoHoaDon, cn.NgayPhatSinh, cn.HanThanhToan,
                   cn.SoTienNo, cn.SoTienDaTra, cn.SoTienConLai,
                   CASE WHEN cn.SoTienConLai=0 THEN N'Đã thanh toán'
                        WHEN cn.HanThanhToan<CONVERT(date,GETDATE()) THEN N'Quá hạn'
                        ELSE N'Đang nợ' END TrangThaiHienTai
            FROM CongNoPhaiTra cn
            JOIN NhaCungCap ncc ON ncc.MaNCC=cn.MaNCC
            JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
            ORDER BY cn.SoTienConLai DESC, cn.HanThanhToan`);
        const items = (rows.recordset || []).map((row) => item(row.MaCNPTra, row.SoHoaDon, row.TenNCC, row.HanThanhToan, row.SoTienConLai, row.TrangThaiHienTai));
        const tong = items.reduce((sum, row) => sum + Number(row.tien || 0), 0);
        return { items, extra: { tong, raw: rows.recordset || [] } };
    },
    async 'low-stock'(pool) {
        const rows = await pool.request().query(`
            SELECT TOP 40 sp.MaSP, sp.TenSP, tk.SLTon, sp.TonKhoToiThieu, k.TenKho
            FROM TonKho tk
            JOIN SanPham sp ON sp.MaSP=tk.MaSP
            JOIN Kho k ON k.MaKho=tk.MaKho
            WHERE sp.TrangThai IN (N'Đang bán', N'Đang kinh doanh')
              AND tk.SLTon <= sp.TonKhoToiThieu
            ORDER BY tk.SLTon ASC, sp.TenSP`);
        return {
            items: (rows.recordset || []).map((row) => item(row.MaSP, row.MaSP, row.TenSP, null, row.SLTon, `Tối thiểu ${row.TonKhoToiThieu}`))
        };
    }
};

const reportAndPrint = {
    async payroll(pool, user, period, spec) {
        const key = period.key.length === 7 ? period.key : `${period.year}-${String(period.month).padStart(2, '0')}`;
        let tong = 0;
        let soNv = 0;
        try {
            const rows = await pool.request().input('Key', sql.VarChar, key).query(`
                SELECT COUNT(*) SoNV, COALESCE(SUM(bl.TongLuong),0) Tong
                FROM BangLuong bl JOIN KyLuong k ON k.MaKy=bl.MaKy
                WHERE k.MaKy=@Key`);
            tong = Number(rows.recordset[0]?.Tong || 0);
            soNv = Number(rows.recordset[0]?.SoNV || 0);
        } catch { /* empty */ }
        const showLines = hasUc(user, 'UC33');
        const kpis = { tongLuong: tong, soNv, kqkdLoiNhuan: tong };
        const print = printOf({
            title: spec.title,
            number: key,
            status: period.label,
            variant: 'report',
            watermark: soNv === 0 ? 'CHƯA CÓ SỐ LIỆU' : '',
            fields: [
                { label: 'Kỳ', value: period.label },
                { label: 'Số nhân viên', value: soNv },
                { label: 'Phạm vi', value: showLines ? 'Có dòng nhân viên' : 'Chỉ tổng gộp' }
            ],
            columns: [
                { key: 'chiTieu', label: 'Chỉ tiêu' },
                { key: 'soTien', label: 'Số tiền', format: 'money', align: 'right' }
            ],
            rows: [
                { chiTieu: 'Tổng lương gộp', soTien: tong },
                { chiTieu: 'Số nhân viên', soTien: soNv }
            ],
            totals: [{ label: 'Tổng lương gộp', value: tong, format: 'money' }],
            note: 'Quản lý xem lương gộp để giám sát. Không in từng dòng nhân viên nếu chưa được cấp lập bảng lương.'
        });
        return {
            report: { empty: soNv === 0 && tong === 0, period: { label: period.label, period: key }, kpis: { doanhThuThuan: 0, laiGop: 0, kqkdLoiNhuan: tong, soHoaDon: soNv } },
            print,
            kpis
        };
    },
    async 'store-report'(pool, user, period) {
        let report = zeroStoreReport(period);
        try {
            const resolved = resolveReportingPeriod({ periodType: 'month', period: period.key.length === 7 ? period.key : `${period.year}-${String(period.month).padStart(2, '0')}` });
            const data = await buildReport(pool, { period: resolved, latestActivity: null, fallbackFrom: null });
            report = compactStoreReport(data, period);
        } catch {
            report = zeroStoreReport(period);
        }
        const k = report.kpis;
        const print = printOf({
            title: 'BÁO CÁO CỬA HÀNG THEO THÁNG',
            number: report.period.period,
            status: report.period.label,
            variant: 'report',
            watermark: report.empty ? 'CHƯA CÓ SỐ LIỆU' : '',
            fields: [
                { label: 'Kỳ', value: report.period.label },
                { label: 'Từ ngày', value: report.period.from },
                { label: 'Đến ngày', value: report.period.to }
            ],
            columns: [
                { key: 'chiTieu', label: 'Chỉ tiêu' },
                { key: 'soTien', label: 'Số tiền', format: 'money', align: 'right' }
            ],
            rows: [
                { chiTieu: 'Doanh thu thuần', soTien: k.doanhThuThuan },
                { chiTieu: 'Lãi gộp', soTien: k.laiGop },
                { chiTieu: 'Lãi/lỗ KQKD (không trừ trả NCC)', soTien: k.kqkdLoiNhuan },
                { chiTieu: 'Chi NCC (dòng tiền, không trừ KQKD)', soTien: k.chiNcc }
            ],
            totals: [
                { label: 'Doanh thu thuần', value: k.doanhThuThuan, format: 'money' },
                { label: 'Lãi gộp', value: k.laiGop, format: 'money' },
                { label: 'Lãi/lỗ KQKD', value: k.kqkdLoiNhuan, format: 'money' }
            ],
            note: 'Báo cáo điều hành cửa hàng. Tiền trả NCC là dòng tiền, không trừ lãi kế toán.'
        });
        return { report, print, kpis: k };
    },
    async kqkd(pool, user, period, spec) {
        const inner = await reportAndPrint['store-report'](pool, user, period, spec);
        inner.print.title = spec.title;
        return inner;
    },
    async 'warehouse-report'(pool, user, period, spec) {
        let soPn = 0;
        let soPx = 0;
        let soKk = 0;
        try {
            const rows = await rowsOf(pool, period, `
                SELECT
                  (SELECT COUNT(*) FROM PhieuNhap WHERE CONVERT(date, COALESCE(NgayXacNhan,NgayNhap))>=@From AND CONVERT(date, COALESCE(NgayXacNhan,NgayNhap))<@ToExclusive) SoPN,
                  (SELECT COUNT(*) FROM PhieuXuat WHERE CONVERT(date, NgayXuat)>=@From AND CONVERT(date, NgayXuat)<@ToExclusive) SoPX,
                  (SELECT COUNT(*) FROM KiemKe WHERE CONVERT(date, NgayKiemKe)>=@From AND CONVERT(date, NgayKiemKe)<@ToExclusive) SoKK`);
            soPn = Number(rows[0]?.SoPN || 0);
            soPx = Number(rows[0]?.SoPX || 0);
            soKk = Number(rows[0]?.SoKK || 0);
        } catch { /* empty */ }
        const empty = soPn + soPx + soKk === 0;
        const print = printOf({
            title: spec.title,
            number: period.label,
            variant: 'report',
            watermark: empty ? 'CHƯA CÓ SỐ LIỆU' : '',
            fields: [{ label: 'Kỳ', value: period.label }],
            columns: [
                { key: 'chiTieu', label: 'Chỉ tiêu' },
                { key: 'soLuong', label: 'Số phiếu', align: 'right' }
            ],
            rows: [
                { chiTieu: 'Phiếu nhập', soLuong: soPn },
                { chiTieu: 'Phiếu xuất', soLuong: soPx },
                { chiTieu: 'Kiểm kê', soLuong: soKk }
            ],
            note: 'Tóm tắt vận hành kho trong kỳ. Không phải tồn chi tiết toàn hàng.'
        });
        return {
            report: { empty, period: { label: period.label }, kpis: { doanhThuThuan: 0, laiGop: 0, kqkdLoiNhuan: 0, soHoaDon: soPn } },
            print
        };
    },
    async 'department-report'(pool, user, period, spec) {
        let items = [];
        try {
            const { listDepartmentReports } = require('./departmentReportSubmit');
            items = await listDepartmentReports(pool, { top: 12, latestOnly: true });
        } catch { items = []; }
        const print = printOf({
            title: spec.title,
            number: period.label,
            variant: 'report',
            watermark: items.length ? '' : 'CHƯA CÓ BẢN NỘP',
            fields: [{ label: 'Kỳ đang xem', value: period.label }],
            columns: [
                { key: 'MaBC', label: 'Số BC' },
                { key: 'BoPhan', label: 'Bộ phận' },
                { key: 'NhanKy', label: 'Kỳ' },
                { key: 'TenNV_Lap', label: 'Người lập' },
                { key: 'TrangThai', label: 'Trạng thái' }
            ],
            rows: items,
            note: 'Snapshot bộ phận đã gửi. Trợ lý chỉ xem/in, không duyệt.'
        });
        return {
            report: { empty: !items.length, period: { label: period.label }, items },
            print
        };
    },
    async 'trial-balance'(pool, user, period, spec) {
        try {
            const rows = await rowsOf(pool, period, `
                SELECT tk.MaTK, tk.TenTK,
                       COALESCE(sd.SoDuNo,0) DuDauNo, COALESCE(sd.SoDuCo,0) DuDauCo,
                       COALESCE(ps.PsNo,0) PsNo, COALESCE(ps.PsCo,0) PsCo
                FROM TaiKhoanKeToan tk
                LEFT JOIN (
                    SELECT sd.MaTK, SUM(sd.SoDuNo) SoDuNo, SUM(sd.SoDuCo) SoDuCo
                    FROM SoDuDauKy sd JOIN KyKeToan k ON k.MaKy=sd.MaKy
                    WHERE k.TuNgay=@From GROUP BY sd.MaTK
                ) sd ON sd.MaTK=tk.MaTK
                LEFT JOIN (
                    SELECT v.MaTK, SUM(v.SoTienNo) PsNo, SUM(v.SoTienCo) PsCo
                    FROM vw_SoCaiDong v
                    WHERE v.NgayHachToan>=@From AND v.NgayHachToan<@ToExclusive AND v.LoaiButToan NOT IN (N'SODU_DAU_KY')
                    GROUP BY v.MaTK
                ) ps ON ps.MaTK=tk.MaTK
                WHERE tk.TrangThai=N'Su dung'
                ORDER BY tk.MaTK`);
            const mapped = rows.map((row) => {
                const net = Number(row.DuDauNo || 0) - Number(row.DuDauCo || 0) + Number(row.PsNo || 0) - Number(row.PsCo || 0);
                return { ...row, ten: row.TenTK, DuCuoiNo: net > 0 ? net : 0, DuCuoiCo: net < 0 ? -net : 0 };
            });
            const print = printOf({
                title: spec.title,
                number: period.label,
                variant: 'report',
                orientation: 'landscape',
                watermark: mapped.length ? '' : 'CHƯA CÓ SỐ LIỆU',
                fields: [{ label: 'Kỳ', value: period.label }],
                columns: [
                    { key: 'MaTK', label: 'TK' },
                    { key: 'ten', label: 'Tên' },
                    { key: 'DuDauNo', label: 'Đầu Nợ', format: 'money', align: 'right' },
                    { key: 'DuDauCo', label: 'Đầu Có', format: 'money', align: 'right' },
                    { key: 'PsNo', label: 'PS Nợ', format: 'money', align: 'right' },
                    { key: 'PsCo', label: 'PS Có', format: 'money', align: 'right' },
                    { key: 'DuCuoiNo', label: 'Cuối Nợ', format: 'money', align: 'right' },
                    { key: 'DuCuoiCo', label: 'Cuối Có', format: 'money', align: 'right' }
                ],
                rows: mapped
            });
            return {
                report: { empty: !mapped.length, period: { label: period.label }, kpis: { doanhThuThuan: 0, laiGop: 0, kqkdLoiNhuan: 0, soHoaDon: mapped.length } },
                print
            };
        } catch {
            return { report: { empty: true, period: { label: period.label }, kpis: { doanhThuThuan: 0, laiGop: 0, kqkdLoiNhuan: 0, soHoaDon: 0 } }, print: emptyPrint(spec, period) };
        }
    },
    async 'cash-flow'(pool, user, period, spec) {
        try {
            const rows = await rowsOf(pool, period, `
                SELECT v.LoaiButToan, SUM(v.SoTienNo) PsNo, SUM(v.SoTienCo) PsCo
                FROM vw_SoCaiDong v
                WHERE v.NgayHachToan>=@From AND v.NgayHachToan<@ToExclusive
                  AND v.MaTK IN ('111','112')
                  AND v.LoaiButToan NOT IN (N'SODU_DAU_KY', N'KET_CHUYEN', N'DAO_KET_CHUYEN')
                GROUP BY v.LoaiButToan`);
            const print = printOf({
                title: spec.title,
                number: period.label,
                variant: 'report',
                watermark: rows.length ? '' : 'CHƯA CÓ SỐ LIỆU',
                fields: [{ label: 'Kỳ', value: period.label }],
                columns: [
                    { key: 'LoaiButToan', label: 'Loại bút toán' },
                    { key: 'PsNo', label: 'Nợ', format: 'money', align: 'right' },
                    { key: 'PsCo', label: 'Có', format: 'money', align: 'right' }
                ],
                rows
            });
            return {
                report: { empty: !rows.length, period: { label: period.label }, kpis: { doanhThuThuan: 0, laiGop: 0, kqkdLoiNhuan: 0, soHoaDon: rows.length } },
                print
            };
        } catch {
            return { report: { empty: true, period: { label: period.label }, kpis: { doanhThuThuan: 0, laiGop: 0, kqkdLoiNhuan: 0, soHoaDon: 0 } }, print: emptyPrint(spec, period) };
        }
    },
    async 'balance-sheet'(pool, user, period, spec) {
        const inner = await reportAndPrint['trial-balance'](pool, user, period, spec);
        inner.print.title = spec.title;
        return inner;
    }
};

const detailPrint = {
    async purchase(pool, user, id) {
        const detail = await getPurchaseInvoiceDetail(pool, id);
        if (!detail) return null;
        const invoice = detail.invoice || {};
        return printOf({
            title: 'PHIẾU TIẾP NHẬN HÓA ĐƠN NHÀ CUNG CẤP',
            number: invoice.MaHDMH,
            date: invoice.NgayTiepNhan || invoice.NgayHoaDon,
            status: invoice.TrangThaiDoiChieu,
            fields: [
                { label: 'Số hóa đơn Nhà cung cấp', value: invoice.SoHoaDon },
                { label: 'Nhà cung cấp', value: invoice.TenNCC },
                { label: 'Đơn mua', value: invoice.MaPO },
                { label: 'Phiếu nhập', value: invoice.MaPN || 'Chưa có' },
                { label: 'Ngày hóa đơn', value: invoice.NgayHoaDon, format: 'date' }
            ],
            columns: [
                { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
                { label: 'Số lượng', key: 'SoLuong', align: 'right' },
                { label: 'Đơn giá', key: 'DonGia', format: 'money', align: 'right' },
                { label: 'Thành tiền', key: 'ThanhTien', format: 'money', align: 'right' }
            ],
            rows: detail.lines || [],
            totals: [
                { label: 'Tổng tiền hàng', value: invoice.TongTienHang, format: 'money' },
                { label: 'TỔNG CỘNG', value: invoice.TongCong, format: 'money' }
            ],
            signatures: ['Người giao hóa đơn', 'Kế toán tiếp nhận']
        });
    },
    async sales(pool, user, id) {
        const detail = await getSalesInvoiceDetail(pool, user, id);
        if (!detail) return null;
        const inv = detail.invoice || {};
        return printOf({
            title: 'HÓA ĐƠN BÁN HÀNG',
            number: inv.MaHD,
            date: inv.NgayLap,
            status: inv.TrangThai,
            fields: [
                { label: 'Thu ngân', value: inv.TenNV },
                { label: 'Khách hàng', value: inv.TenKH || 'Khách vãng lai' }
            ],
            columns: [
                { key: 'TenSP', label: 'Sản phẩm' },
                { key: 'SoLuong', label: 'SL', align: 'right' },
                { key: 'DonGia', label: 'Đơn giá', format: 'money', align: 'right' },
                { key: 'ThanhTien', label: 'Thành tiền', format: 'money', align: 'right' }
            ],
            rows: detail.lines || [],
            totals: [
                { label: 'Tiền hàng', value: inv.TongTienHang, format: 'money' },
                { label: 'Tổng thanh toán', value: inv.TongThanhToan, format: 'money' }
            ],
            signatures: ['Thu ngân', 'Khách hàng']
        });
    },
    async po(pool, user, id) {
        const header = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT po.*, ncc.TenNCC, nv.TenNV AS NguoiLap, duyet.TenNV AS NguoiDuyet
            FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
            JOIN NhanVien nv ON nv.MaNV=po.MaNV_Lap
            LEFT JOIN NhanVien duyet ON duyet.MaNV=po.MaNV_Duyet
            WHERE po.MaPO=@Ma`);
        if (!header.recordset.length) return null;
        const order = header.recordset[0];
        const lines = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT ct.*, sp.TenSP, sp.DonViTinh FROM ChiTietDonMua ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaPO=@Ma ORDER BY sp.TenSP`);
        return printOf({
            title: 'ĐƠN MUA HÀNG',
            number: order.MaPO,
            date: order.NgayLap,
            status: order.TrangThai,
            fields: [
                { label: 'Nhà cung cấp', value: order.TenNCC },
                { label: 'Phiếu đề nghị nguồn', value: order.MaDN },
                { label: 'Người lập', value: order.NguoiLap },
                { label: 'Người phê duyệt', value: order.NguoiDuyet || 'Chưa phê duyệt' }
            ],
            columns: [
                { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
                { label: 'Số lượng', key: 'SoLuong', align: 'right' },
                { label: 'Đơn giá', key: 'DonGia', format: 'money', align: 'right' },
                { label: 'Thành tiền', key: 'ThanhTien', format: 'money', align: 'right' }
            ],
            rows: lines.recordset || [],
            totals: [{ label: 'TỔNG GIÁ TRỊ ĐƠN MUA', value: order.TongTien, format: 'money' }],
            signatures: ['Nhân viên mua hàng', 'Quản lý cửa hàng']
        });
    },
    async receipt(pool, user, id) {
        const header = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT pn.*, ncc.TenNCC, k.TenKho, nv.TenNV AS NguoiKiemNhan
            FROM PhieuNhap pn JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC
            JOIN Kho k ON k.MaKho=pn.MaKho JOIN NhanVien nv ON nv.MaNV=pn.MaNV
            WHERE pn.MaPN=@Ma`);
        if (!header.recordset.length) return null;
        const receipt = header.recordset[0];
        const lines = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT ct.*, sp.TenSP, sp.DonViTinh FROM ChiTietPhieuNhap ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaPN=@Ma ORDER BY sp.TenSP`);
        return printOf({
            title: receipt.TrangThai === 'Đã xác nhận' ? 'PHIẾU NHẬP KHO' : 'BIÊN BẢN KIỂM NHẬN HÀNG',
            number: receipt.MaPN,
            date: receipt.NgayXacNhan || receipt.NgayNhap,
            status: receipt.TrangThai,
            fields: [
                { label: 'Đơn mua', value: receipt.MaPO },
                { label: 'Nhà cung cấp', value: receipt.TenNCC },
                { label: 'Kho nhập', value: receipt.TenKho }
            ],
            columns: [
                { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
                { label: 'SL nhập', key: 'SoLuongChapNhan', align: 'right' },
                { label: 'Đơn giá', key: 'DonGiaNhap', format: 'money', align: 'right' }
            ],
            rows: lines.recordset || [],
            totals: [{ label: 'Tổng giá trị nhập', value: receipt.TongTien, format: 'money' }],
            signatures: ['Đại diện Nhà cung cấp', 'Thủ kho kiểm nhận']
        });
    },
    async issue(pool, user, id) {
        const header = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT px.*, k.TenKho, nv.TenNV AS NguoiLap FROM PhieuXuat px
            JOIN Kho k ON k.MaKho=px.MaKho JOIN NhanVien nv ON nv.MaNV=px.MaNV WHERE px.MaPX=@Ma`);
        if (!header.recordset.length) return null;
        const issue = header.recordset[0];
        const lines = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT ct.*, sp.TenSP, sp.DonViTinh FROM ChiTietPhieuXuat ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaPX=@Ma ORDER BY sp.TenSP`);
        return printOf({
            title: 'PHIẾU XUẤT KHO',
            number: issue.MaPX,
            date: issue.NgayXuat,
            status: issue.TrangThai,
            fields: [
                { label: 'Loại xuất', value: issue.LoaiXuat },
                { label: 'Kho', value: issue.TenKho },
                { label: 'Người lập', value: issue.NguoiLap }
            ],
            columns: [
                { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
                { label: 'SL xuất', key: 'SoLuong', align: 'right' },
                { label: 'Giá vốn', key: 'DonGia', format: 'money', align: 'right' }
            ],
            rows: lines.recordset || [],
            signatures: ['Thủ kho', 'Quản lý cửa hàng']
        });
    },
    async request(pool, user, id) {
        const header = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT dn.*, nv.TenNV AS NguoiLap FROM DeNghiMuaHang dn
            JOIN NhanVien nv ON nv.MaNV=dn.MaNV_Lap WHERE dn.MaDN=@Ma`);
        if (!header.recordset.length) return null;
        const request = header.recordset[0];
        const lines = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT ct.*, sp.TenSP, sp.DonViTinh FROM ChiTietDeNghi ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaDN=@Ma ORDER BY sp.TenSP`);
        return printOf({
            title: 'PHIẾU ĐỀ NGHỊ MUA HÀNG',
            number: request.MaDN,
            date: request.NgayLap,
            status: request.TrangThai,
            fields: [
                { label: 'Người đề nghị', value: request.NguoiLap },
                { label: 'Lý do', value: request.LyDo || 'Bổ sung hàng hóa' }
            ],
            columns: [
                { label: 'Mã hàng', key: 'MaSP' }, { label: 'Tên mặt hàng', key: 'TenSP' },
                { label: 'SL đề nghị', key: 'SLDeNghi', align: 'right' }
            ],
            rows: lines.recordset || [],
            signatures: ['Thủ kho lập phiếu', 'Nhân viên mua hàng tiếp nhận']
        });
    },
    async return(pool, user, id) {
        const header = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT dt.*, kh.TenKH FROM PhieuDoiTra dt
            LEFT JOIN HoaDon hd ON hd.MaHD=dt.MaHD
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            WHERE dt.MaDT=@Ma`);
        if (!header.recordset.length) return null;
        const ticket = header.recordset[0];
        let lines = [];
        try {
            const result = await pool.request().input('Ma', sql.VarChar, id).query(`
                SELECT ct.*, sp.TenSP, sp.DonViTinh FROM ChiTietDoiTra ct
                LEFT JOIN SanPham sp ON sp.MaSP=ct.MaSP WHERE ct.MaDT=@Ma`);
            lines = result.recordset || [];
        } catch { lines = []; }
        return printOf({
            title: 'HỒ SƠ KIỂM ĐỔI TRẢ',
            number: ticket.MaDT,
            date: ticket.NgayKiemTra || ticket.NgayLap,
            status: ticket.TrangThai,
            fields: [
                { label: 'Hóa đơn gốc', value: ticket.MaHD },
                { label: 'Khách hàng', value: ticket.TenKH || '—' },
                { label: 'Số tiền hoàn', value: ticket.SoTienHoan, format: 'money' }
            ],
            columns: [
                { key: 'TenSP', label: 'Sản phẩm' },
                { key: 'SoLuong', label: 'SL', align: 'right' },
                { key: 'ThanhTien', label: 'Thành tiền', format: 'money', align: 'right' }
            ],
            rows: lines,
            signatures: ['Thu ngân', 'Thủ kho', 'Quản lý']
        });
    },
    async count(pool, user, id) {
        const header = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT kk.*, nv.TenNV FROM KiemKe kk JOIN NhanVien nv ON nv.MaNV=kk.MaNV WHERE kk.MaKK=@Ma`);
        if (!header.recordset.length) return null;
        const sheet = header.recordset[0];
        const lines = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT ct.*, sp.TenSP FROM ChiTietKiemKe ct JOIN SanPham sp ON sp.MaSP=ct.MaSP WHERE ct.MaKK=@Ma`);
        return printOf({
            title: 'PHIẾU KIỂM KÊ',
            number: sheet.MaKK,
            date: sheet.NgayKiemKe,
            status: sheet.TrangThai,
            fields: [{ label: 'Người kiểm', value: sheet.TenNV }],
            columns: [
                { key: 'MaSP', label: 'Mã' }, { key: 'TenSP', label: 'Tên' },
                { key: 'SLHeThong', label: 'SL hệ thống', align: 'right' },
                { key: 'SLThucTe', label: 'SL thực tế', align: 'right' },
                { key: 'ChenhLech', label: 'Chênh lệch', align: 'right' }
            ],
            rows: lines.recordset || [],
            signatures: ['Thủ kho', 'Quản lý cửa hàng']
        });
    },
    async 'receipt-cash'(pool, user, id) {
        const header = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT pt.*, ca.MaCa, nv.TenNV, q.TenQuay
            FROM PhieuThu pt
            JOIN CaLamViec ca ON ca.MaCa=pt.MaCa
            JOIN NhanVien nv ON nv.MaNV=ca.MaNV
            LEFT JOIN QuayBanHang q ON q.MaQuay=ca.MaQuay
            WHERE pt.MaPT=@Ma`);
        if (!header.recordset.length) return null;
        const pt = header.recordset[0];
        return printOf({
            title: 'PHIẾU THU TIỀN MẶT BÀN GIAO CA',
            number: pt.MaPT,
            date: pt.NgayLap,
            status: pt.TrangThai,
            fields: [
                { label: 'Mã ca', value: pt.MaCa },
                { label: 'Thu ngân', value: pt.TenNV },
                { label: 'Quầy', value: pt.TenQuay || '—' }
            ],
            columns: [
                { key: 'chiTieu', label: 'Chỉ tiêu' },
                { key: 'soTien', label: 'Số tiền', format: 'money', align: 'right' }
            ],
            rows: [
                { chiTieu: 'Tiền theo hệ thống', soTien: pt.SoTienTheoHeThong },
                { chiTieu: 'Tiền thực nộp', soTien: pt.SoTienThucNop }
            ],
            totals: [{ label: 'Tiền thực nộp', value: pt.SoTienThucNop, format: 'money' }],
            signatures: ['Thu ngân bàn giao', 'Kế toán nhận']
        });
    },
    async payment(pool, user, id) {
        const header = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT pc.*, ncc.TenNCC FROM PhieuChi pc
            LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=pc.MaNCC WHERE pc.MaPhieu=@Ma`);
        if (!header.recordset.length) return null;
        const pc = header.recordset[0];
        return printOf({
            title: 'PHIẾU CHI',
            number: pc.MaPhieu,
            date: pc.NgayChungTu,
            status: pc.TrangThai,
            fields: [
                { label: 'Nhà cung cấp', value: pc.TenNCC || '—' },
                { label: 'Nội dung', value: pc.NoiDung || '—' },
                { label: 'Phương thức', value: pc.PhuongThuc || '—' }
            ],
            columns: [
                { key: 'chiTieu', label: 'Khoản' },
                { key: 'soTien', label: 'Số tiền', format: 'money', align: 'right' }
            ],
            rows: [{ chiTieu: pc.NoiDung || 'Chi NCC', soTien: pc.SoTien }],
            totals: [{ label: 'Số tiền', value: pc.SoTien, format: 'money' }],
            signatures: ['Kế toán', 'Quản lý cửa hàng']
        });
    },
    async payables(pool, user, id) {
        const header = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT cn.*, ncc.TenNCC, hd.SoHoaDon FROM CongNoPhaiTra cn
            JOIN NhaCungCap ncc ON ncc.MaNCC=cn.MaNCC
            JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
            WHERE cn.MaCNPTra=@Ma`);
        if (!header.recordset.length) return null;
        const debt = header.recordset[0];
        return printOf({
            title: 'CÔNG NỢ NHÀ CUNG CẤP',
            number: debt.MaCNPTra,
            date: debt.NgayPhatSinh,
            status: debt.SoTienConLai > 0 ? 'Đang nợ' : 'Đã thanh toán',
            fields: [
                { label: 'Nhà cung cấp', value: debt.TenNCC },
                { label: 'Hóa đơn', value: debt.SoHoaDon },
                { label: 'Hạn thanh toán', value: debt.HanThanhToan, format: 'date' }
            ],
            columns: [
                { key: 'chiTieu', label: 'Chỉ tiêu' },
                { key: 'soTien', label: 'Số tiền', format: 'money', align: 'right' }
            ],
            rows: [
                { chiTieu: 'Giá trị ghi nhận', soTien: debt.SoTienNo },
                { chiTieu: 'Đã trả', soTien: debt.SoTienDaTra },
                { chiTieu: 'Còn lại', soTien: debt.SoTienConLai }
            ],
            totals: [{ label: 'Còn phải trả', value: debt.SoTienConLai, format: 'money' }],
            signatures: ['Kế toán', 'Quản lý cửa hàng']
        });
    },
    async 'low-stock'(pool, user, id) {
        const header = await pool.request().input('Ma', sql.VarChar, id).query(`
            SELECT sp.MaSP, sp.TenSP, tk.SLTon, sp.TonKhoToiThieu, k.TenKho
            FROM TonKho tk JOIN SanPham sp ON sp.MaSP=tk.MaSP JOIN Kho k ON k.MaKho=tk.MaKho
            WHERE sp.MaSP=@Ma`);
        if (!header.recordset.length) return null;
        const row = header.recordset[0];
        return printOf({
            title: 'CẢNH BÁO TỒN THẤP',
            number: row.MaSP,
            fields: [
                { label: 'Mặt hàng', value: row.TenSP },
                { label: 'Kho', value: row.TenKho }
            ],
            columns: [
                { key: 'chiTieu', label: 'Chỉ tiêu' },
                { key: 'soLuong', label: 'Số lượng', align: 'right' }
            ],
            rows: [
                { chiTieu: 'Tồn hiện tại', soLuong: row.SLTon },
                { chiTieu: 'Tồn tối thiểu', soLuong: row.TonKhoToiThieu }
            ]
        });
    }
};

const handleDocumentIntent = async (pool, user, question) => {
    const intent = detectDocumentIntent(question);
    if (!intent) return null;
    const spec = specOf(intent.kind);
    if (!spec) return null;
    const period = intent.period;
    if (!canReadKind(spec, user)) {
        return okResult({
            spec,
            period,
            answer: `${spec.label} ${period.label}: tài khoản này không xem trên trợ lý.`,
            items: []
        });
    }

    try {
        if (spec.mode === 'report') {
            const built = await (reportAndPrint[spec.id] || reportAndPrint['store-report'])(pool, user, period, spec);
            const empty = built.report?.empty;
            const k = built.report?.kpis || {};
            const moneyVi = (value) => `${Math.round(Number(value) || 0).toLocaleString('vi-VN')} ₫`;
            const answer = empty
                ? `${spec.label} · ${period.label}\nDoanh thu thuần ${moneyVi(0)}\nKỳ này chưa phát sinh.`
                : `${spec.label} · ${period.label}\nDoanh thu thuần ${moneyVi(k.doanhThuThuan)}\nLãi gộp ${moneyVi(k.laiGop)}`;
            return okResult({
                spec,
                period,
                answer,
                report: built.report,
                print: built.print,
                evidence: [
                    { claim: spec.label, numbers: [k.kqkdLoiNhuan || 0], source: spec.source, confidence: 'high' }
                ]
            });
        }

        const listed = await listAndPrint[spec.id](pool, user, period);
        const items = listed.items || [];
        let print = emptyPrint(spec, period);
        if (spec.id === 'payables') {
            print = printOf({
                title: spec.title,
                number: period.label,
                variant: 'report',
                watermark: items.length ? '' : 'CHƯA CÓ SỐ LIỆU',
                fields: [
                    { label: 'Phạm vi', value: 'Toàn bộ cửa hàng Hà Nội' },
                    { label: 'Số khoản', value: items.length }
                ],
                columns: [
                    { label: 'Mã công nợ', key: 'id' },
                    { label: 'Nhà cung cấp', key: 'ncc' },
                    { label: 'Hóa đơn', key: 'soHd' },
                    { label: 'Còn lại', key: 'tien', format: 'money', align: 'right' },
                    { label: 'Trạng thái', key: 'trangThai' }
                ],
                rows: items,
                totals: [{ label: 'Tổng còn phải trả', value: listed.extra?.tong || 0, format: 'money' }],
                note: 'Báo cáo quản trị từ công nợ sau đối chiếu ba bên.'
            });
        } else if (spec.id === 'low-stock') {
            print = printOf({
                title: spec.title,
                number: period.label,
                variant: 'report',
                watermark: items.length ? '' : 'CHƯA CÓ SỐ LIỆU',
                fields: [{ label: 'Phạm vi', value: 'Mặt hàng dưới định mức' }],
                columns: [
                    { label: 'Mã', key: 'id' },
                    { label: 'Mặt hàng', key: 'ncc' },
                    { label: 'Tồn', key: 'tien', align: 'right' },
                    { label: 'Ghi chú', key: 'trangThai' }
                ],
                rows: items,
                note: 'Tóm tắt tồn thấp, không phải tồn kho chi tiết toàn hàng.'
            });
        } else if (!items.length) {
            print = emptyPrint(spec, period);
        }

        const answer = items.length
            ? `Có ${items.length} ${spec.label.toLowerCase()} trong ${period.label}. Chọn một dòng rồi bấm Xem / In hoặc Tải.`
            : `${period.label} chưa phát sinh ${spec.label.toLowerCase()}. Bạn vẫn xem / in mẫu trống, hoặc tải về.`;
        return okResult({ spec, period, answer, items, print });
    } catch {
        const print = emptyPrint(spec, period);
        return okResult({
            spec,
            period,
            answer: `${period.label} chưa phát sinh ${spec.label.toLowerCase()}. Bạn vẫn xem / in mẫu trống, hoặc tải về.`,
            items: [],
            print,
            report: spec.mode === 'report' ? { empty: true, period: { label: period.label }, kpis: { doanhThuThuan: 0, laiGop: 0, kqkdLoiNhuan: 0, soHoaDon: 0 } } : null
        });
    }
};

const getDocumentPrint = async (pool, user, kind, id) => {
    const spec = specOf(kind);
    if (!spec) {
        const error = new Error('Loại chứng từ không hỗ trợ.');
        error.status = 404;
        throw error;
    }
    if (!canReadKind(spec, user)) {
        const error = new Error('Tài khoản này không xem chứng từ trên trợ lý.');
        error.status = 403;
        throw error;
    }
    if (spec.mode === 'report') {
        const period = parsePeriod(String(id || '').trim());
        const built = await (reportAndPrint[spec.id] || reportAndPrint['store-report'])(pool, user, period, spec);
        return { kind: spec.id, loai: spec.loai, print: built.print };
    }
    const fn = detailPrint[spec.id];
    if (!fn) {
        const error = new Error('Chưa có mẫu in cho loại này.');
        error.status = 404;
        throw error;
    }
    const print = await fn(pool, user, String(id || '').trim());
    if (!print) {
        const error = new Error('Không tìm thấy chứng từ.');
        error.status = 404;
        throw error;
    }
    return { kind: spec.id, loai: spec.loai, print };
};

const emptyDocResult = (period, spec) => okResult({
    spec: spec || specOf('store-report'),
    period,
    answer: `${period.label} chưa phát sinh. Bạn vẫn xem / in mẫu với số 0, hoặc tải về.`,
    print: emptyPrint(spec || specOf('store-report'), period),
    report: { empty: true, period: { label: period.label }, kpis: { doanhThuThuan: 0, laiGop: 0, kqkdLoiNhuan: 0, soHoaDon: 0 } }
});

module.exports = {
    KINDS,
    parsePeriod,
    detectDocumentIntent,
    detectInvoiceIntent,
    handleDocumentIntent,
    getDocumentPrint,
    canReadKind,
    specOf,
    emptyDocResult,
    isManagerUser
};
