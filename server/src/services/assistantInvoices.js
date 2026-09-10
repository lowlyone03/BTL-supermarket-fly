const { sql } = require('../config/db');
const { fold } = require('./assistantFaq');
const { isRole } = require('./inboxService');
const { hasUc } = require('./assistantTools');

const MONTH_WORDS = {
    mot: 1, hai: 2, ba: 3, tu: 4, bon: 4, nam: 5,
    sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10
};

const pad2 = (value) => String(value).padStart(2, '0');

const hanoiNow = () => {
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    return new Date(`${key}T12:00:00+07:00`);
};

const parsePeriod = (question) => {
    const folded = fold(question);
    const now = hanoiNow();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;

    const iso = folded.match(/\b(20\d{2})-(0?[1-9]|1[0-2])\b/);
    const slash = folded.match(/\b(0?[1-9]|1[0-2])\s*[/\-]\s*(20\d{2})\b/);
    if (iso) {
        year = Number(iso[1]);
        month = Number(iso[2]);
    } else if (slash) {
        month = Number(slash[1]);
        year = Number(slash[2]);
    } else if (/thang\s*nay/.test(folded)) {
        month = now.getMonth() + 1;
        year = now.getFullYear();
    } else if (/thang\s*truoc/.test(folded)) {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        month = prev.getMonth() + 1;
        year = prev.getFullYear();
    } else if (/hom\s*nay/.test(folded)) {
        const day = now.getDate();
        const from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(day)}`;
        const next = new Date(now.getFullYear(), now.getMonth(), day + 1);
        return {
            grain: 'day',
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            day,
            from,
            toExclusive: `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`,
            key: from,
            label: `Ngày ${day}/${now.getMonth() + 1}/${now.getFullYear()}`
        };
    } else if (/hom\s*qua/.test(folded)) {
        const prev = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const day = prev.getDate();
        const from = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}-${pad2(day)}`;
        return {
            grain: 'day',
            year: prev.getFullYear(),
            month: prev.getMonth() + 1,
            day,
            from,
            toExclusive: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
            key: from,
            label: `Ngày ${day}/${prev.getMonth() + 1}/${prev.getFullYear()}`
        };
    } else {
        const yearMatch = folded.match(/\b(20\d{2})\b/);
        if (yearMatch) year = Number(yearMatch[1]);
        const word = folded.match(/\bthang\s*(muoi\s*hai|muoi\s*mot|muoi|mot|hai|ba|tu|bon|nam|sau|bay|tam|chin)\b/);
        const num = folded.match(/\bthang\s*(0?[1-9]|1[0-2])\b/);
        if (num) month = Number(num[1]);
        else if (word) {
            const token = word[1].replace(/\s+/g, ' ').trim();
            if (token === 'muoi hai') month = 12;
            else if (token === 'muoi mot') month = 11;
            else if (token === 'muoi') month = 10;
            else month = MONTH_WORDS[token] || month;
        }
    }

    const from = `${year}-${pad2(month)}-01`;
    const next = new Date(year, month, 1);
    const toExclusive = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-01`;
    return {
        grain: 'month',
        year,
        month,
        from,
        toExclusive,
        key: `${year}-${pad2(month)}`,
        label: `Tháng ${month}/${year}`
    };
};

const isManagerUser = (user) => {
    if (isRole(user, 'Quản lý')) return true;
    const folded = fold(user?.TenVaiTro || user?.MaVaiTro || '');
    if (/quan\s*ly|\bql\b|\badmin\b/.test(folded)) return true;
    return hasUc(user, 'UC10');
};

const detectInvoiceIntent = (question) => require('./assistantDocs').detectDocumentIntent(question);

const handleInvoiceIntent = (pool, user, question) => require('./assistantDocs').handleDocumentIntent(pool, user, question);

const canReadPurchase = (user) => isManagerUser(user) || hasUc(user, 'UC27');
const canReadSales = (user) => isManagerUser(user) || hasUc(user, 'UC24');
const canReadStoreReport = (user) => isManagerUser(user) || hasUc(user, 'UC10') || hasUc(user, 'UC43');

const listPurchaseInvoicesByMonth = async (pool, period) => {
    const result = await pool.request()
        .input('From', sql.Date, period.from)
        .input('ToExclusive', sql.Date, period.toExclusive)
        .query(`
            SELECT hd.MaHDMH, hd.SoHoaDon, hd.MaNCC, ncc.TenNCC, hd.MaPO, hd.MaPN, hd.NgayHoaDon,
                   hd.TongTienHang, hd.TienThue, hd.TongCong, hd.TrangThaiDoiChieu, hd.TrangThai
            FROM HoaDonMuaHang hd
            JOIN NhaCungCap ncc ON ncc.MaNCC = hd.MaNCC
            WHERE CONVERT(date, hd.NgayHoaDon) >= @From
              AND CONVERT(date, hd.NgayHoaDon) < @ToExclusive
            ORDER BY hd.NgayHoaDon DESC, hd.MaHDMH DESC`);
    return result.recordset || [];
};

const getPurchaseInvoiceDetail = async (pool, id) => {
    const ma = String(id || '').trim();
    if (!ma) return null;
    const header = await pool.request().input('MaHD', sql.VarChar, ma).query(`
        SELECT hd.*, ncc.TenNCC, nv.TenNV AS NguoiTiepNhan, cn.MaCNPTra, cn.SoTienNo, cn.SoTienConLai,
               cn.HanThanhToan, cn.TrangThai AS TrangThaiCongNo
        FROM HoaDonMuaHang hd
        JOIN NhaCungCap ncc ON ncc.MaNCC = hd.MaNCC
        JOIN NhanVien nv ON nv.MaNV = hd.MaNV
        LEFT JOIN CongNoPhaiTra cn ON cn.MaHDMH = hd.MaHDMH
        WHERE hd.MaHDMH = @MaHD`);
    if (!header.recordset.length) return null;
    const lines = await pool.request().input('MaHD', sql.VarChar, ma).query(`
        SELECT ct.*, sp.TenSP, sp.DonViTinh
        FROM ChiTietHoaDonMuaHang ct
        JOIN SanPham sp ON sp.MaSP = ct.MaSP
        WHERE ct.MaHDMH = @MaHD
        ORDER BY sp.TenSP`);
    return { invoice: header.recordset[0], lines: lines.recordset };
};

const listSalesInvoicesByMonth = async (pool, user, period) => {
    const scoped = !isManagerUser(user);
    const request = pool.request()
        .input('From', sql.Date, period.from)
        .input('ToExclusive', sql.Date, period.toExclusive)
        .input('MaNV', sql.VarChar, user?.MaNV || '');
    const result = await request.query(`
        SELECT TOP 80 hd.MaHD, hd.NgayLap, hd.TongTienHang, hd.TongThanhToan, hd.TrangThai,
               kh.TenKH, nv.TenNV, ca.MaCa
        FROM HoaDon hd
        JOIN CaLamViec ca ON ca.MaCa = hd.MaCa
        JOIN NhanVien nv ON nv.MaNV = hd.MaNV
        LEFT JOIN KhachHang kh ON kh.MaKH = hd.MaKH
        WHERE hd.TrangThai = N'Hoàn thành'
          AND CONVERT(date, hd.NgayLap) >= @From
          AND CONVERT(date, hd.NgayLap) < @ToExclusive
          ${scoped ? 'AND hd.MaNV = @MaNV' : ''}
        ORDER BY hd.NgayLap DESC`);
    return result.recordset || [];
};

const getSalesInvoiceDetail = async (pool, user, id) => {
    const ma = String(id || '').trim();
    if (!ma) return null;
    const scoped = !isManagerUser(user);
    const header = await pool.request()
        .input('MaHD', sql.VarChar, ma)
        .input('MaNV', sql.VarChar, user?.MaNV || '')
        .query(`
            SELECT hd.*, kh.TenKH, kh.SDT, nv.TenNV, ca.MaCa
            FROM HoaDon hd
            JOIN NhanVien nv ON nv.MaNV = hd.MaNV
            JOIN CaLamViec ca ON ca.MaCa = hd.MaCa
            LEFT JOIN KhachHang kh ON kh.MaKH = hd.MaKH
            WHERE hd.MaHD = @MaHD ${scoped ? 'AND hd.MaNV = @MaNV' : ''}`);
    if (!header.recordset.length) return null;
    const [lines, payments] = await Promise.all([
        pool.request().input('MaHD', sql.VarChar, ma).query(`
            SELECT ct.*, sp.TenSP, sp.DonViTinh
            FROM ChiTietHoaDon ct
            JOIN SanPham sp ON sp.MaSP = ct.MaSP
            WHERE ct.MaHD = @MaHD
            ORDER BY sp.TenSP`),
        pool.request().input('MaHD', sql.VarChar, ma).query(`
            SELECT * FROM ThanhToan WHERE MaHD = @MaHD ORDER BY NgayTT`)
    ]);
    return { invoice: header.recordset[0], lines: lines.recordset, payments: payments.recordset };
};

const compactPurchase = (row) => ({
    id: row.MaHDMH,
    soHd: row.SoHoaDon,
    ncc: row.TenNCC,
    ngay: row.NgayHoaDon,
    tien: Number(row.TongCong || 0),
    trangThai: row.TrangThaiDoiChieu || row.TrangThai || ''
});

const compactSale = (row) => ({
    id: row.MaHD,
    soHd: row.MaHD,
    ncc: row.TenKH || 'Khách vãng lai',
    ngay: row.NgayLap,
    tien: Number(row.TongThanhToan || row.TongTienHang || 0),
    trangThai: row.TrangThai || ''
});

const vndInt = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const compactStoreReport = (data, period) => {
    const op = data?.hoatDong || {};
    const sale = op.banHang || {};
    const kqkd = data?.kqkd || {};
    const dongTien = data?.dongTien || {};
    const resolved = data?.period || {};
    const doanhThuThuan = vndInt(sale.doanhThuThuan ?? kqkd.doanhThuThuan);
    const laiGop = vndInt(op.laiGop?.soTien ?? kqkd.loiNhuanGop);
    const kqkdLoiNhuan = vndInt(kqkd.loiNhuan ?? op.kqkdLoiNhuan);
    const luongDaKhoa = vndInt(op.nhanVien?.tongLuongKhoa ?? kqkd.chiPhiNhanVien);
    const chiNcc = vndInt(dongTien.chiNcc);
    const soHoaDon = Number(sale.soHoaDon ?? 0);
    const empty = soHoaDon === 0 && doanhThuThuan === 0 && kqkdLoiNhuan === 0 && laiGop === 0;
    return {
        empty,
        period: {
            period: resolved.period || period.key,
            label: resolved.label || period.label,
            from: resolved.from || period.from,
            to: resolved.to || period.toExclusive
        },
        kpis: {
            doanhThuThuan,
            laiGop,
            kqkdLoiNhuan,
            luongDaKhoa,
            chiNcc,
            soHoaDon,
            trangThai: kqkd.trangThai || op.kqkdTrangThai || (kqkdLoiNhuan > 0 ? 'LÃI' : kqkdLoiNhuan < 0 ? 'LỖ' : 'HÒA')
        },
        kqkd: {
            doanhThuThuan,
            loiNhuanGop: laiGop,
            chiPhiNhanVien: luongDaKhoa,
            cuocVanChuyen: vndInt(dongTien.cuocVanChuyen ?? kqkd.cuocVanChuyen),
            loiNhuan: kqkdLoiNhuan,
            trangThai: kqkd.trangThai || op.kqkdTrangThai || ''
        },
        dongTien: {
            chiNcc,
            cuocVanChuyen: vndInt(dongTien.cuocVanChuyen)
        },
        hoatDong: {
            banHang: { soHoaDon, doanhThuThuan },
            giaVon: { giaVonThuan: vndInt(op.giaVon?.giaVonThuan) },
            laiGop: { soTien: laiGop },
            nhanVien: { tongLuongKhoa: luongDaKhoa },
            kqkdLoiNhuan
        }
    };
};

const zeroStoreReport = (period) => compactStoreReport(null, period);

module.exports = {
    parsePeriod,
    detectInvoiceIntent,
    isManagerUser,
    canReadPurchase,
    canReadSales,
    canReadStoreReport,
    listPurchaseInvoicesByMonth,
    getPurchaseInvoiceDetail,
    listSalesInvoicesByMonth,
    getSalesInvoiceDetail,
    compactStoreReport,
    zeroStoreReport,
    handleInvoiceIntent
};
