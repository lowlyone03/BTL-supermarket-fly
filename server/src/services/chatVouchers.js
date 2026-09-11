'use strict';

const { sql } = require('../config/db');
const { foldRole } = require('./chatPolicy');

const VOUCHER_TYPES = [
    {
        loai: 'DeNghiMuaHang',
        table: 'DeNghiMuaHang',
        idCol: 'MaDN',
        title: 'PHIẾU ĐỀ NGHỊ MUA HÀNG',
        dateCols: ['NgayLap', 'NgayGui'],
        statusCol: 'TrangThai',
        roles: ['quản lý', 'thủ kho', 'nhân viên mua hàng']
    },
    {
        loai: 'DonMuaHang',
        table: 'DonMuaHang',
        idCol: 'MaPO',
        title: 'ĐƠN MUA HÀNG',
        dateCols: ['NgayLap'],
        statusCol: 'TrangThai',
        roles: ['quản lý', 'nhân viên mua hàng', 'thủ kho', 'kế toán']
    },
    {
        loai: 'PhieuNhap',
        table: 'PhieuNhap',
        idCol: 'MaPN',
        title: 'PHIẾU NHẬP KHO',
        dateCols: ['NgayNhap', 'NgayXacNhan', 'NgayLap'],
        statusCol: 'TrangThai',
        roles: ['quản lý', 'thủ kho', 'nhân viên mua hàng', 'kế toán']
    },
    {
        loai: 'PhieuXuat',
        table: 'PhieuXuat',
        idCol: 'MaPX',
        title: 'PHIẾU XUẤT KHO',
        dateCols: ['NgayXuat', 'NgayLap'],
        statusCol: 'TrangThai',
        roles: ['quản lý', 'thủ kho', 'nhân viên mua hàng']
    },
    {
        loai: 'HoaDon',
        table: 'HoaDon',
        idCol: 'MaHD',
        title: 'HÓA ĐƠN BÁN HÀNG',
        dateCols: ['NgayLap'],
        statusCol: 'TrangThai',
        roles: ['quản lý', 'thu ngân', 'kế toán']
    },
    {
        loai: 'PhieuChi',
        table: 'PhieuChi',
        idCol: 'MaPhieu',
        title: 'PHIẾU CHI NCC',
        dateCols: ['NgayChungTu', 'NgayDuyet'],
        statusCol: 'TrangThai',
        roles: ['quản lý', 'kế toán', 'nhân viên mua hàng']
    },
    {
        loai: 'CongNoPhaiTra',
        table: 'CongNoPhaiTra',
        idCol: 'MaCNPTra',
        title: 'CÔNG NỢ NHÀ CUNG CẤP',
        dateCols: ['HanThanhToan', 'NgayPhatSinh'],
        statusCol: 'TrangThai',
        roles: ['quản lý', 'kế toán', 'nhân viên mua hàng']
    },
    {
        loai: 'GiaHanCongNo',
        table: 'CongNoGiaHan',
        idCol: 'MaGiaHan',
        title: 'XIN GIA HẠN THANH TOÁN',
        dateCols: ['NgayYeuCau'],
        statusCol: 'TrangThai',
        roles: ['quản lý', 'kế toán', 'nhân viên mua hàng']
    }
];

const typeByLoai = new Map(VOUCHER_TYPES.map((item) => [item.loai, item]));

const tableExists = async (pool, name) => {
    const result = await pool.request()
        .input('Ten', sql.NVarChar, name)
        .query(`SELECT 1 AS Ok FROM sys.tables WHERE name = @Ten AND schema_id = SCHEMA_ID(N'dbo')`);
    return result.recordset.length > 0;
};

const firstExistingColumn = async (pool, table, columns) => {
    for (const column of columns) {
        const result = await pool.request().query(`
            SELECT 1 AS Ok WHERE COL_LENGTH(N'dbo.${table}', N'${column}') IS NOT NULL`);
        if (result.recordset.length) return column;
    }
    return null;
};

const canSeeType = (spec, tenVaiTro) => spec.roles.includes(foldRole(tenVaiTro));

const mapRow = (spec, row, dateCol, statusCol) => ({
    loai: spec.loai,
    ma: row.Ma,
    ten: `${spec.title} · ${row.Ma}`,
    title: spec.title,
    trangThai: statusCol ? row.TrangThai : null,
    ngay: dateCol ? row.Ngay : null
});

const listVouchers = async (pool, user, { q = '', loai = '' } = {}) => {
    const query = String(q || '').trim().slice(0, 40);
    const wanted = String(loai || '').trim();
    const items = [];
    for (const spec of VOUCHER_TYPES) {
        if (wanted && spec.loai !== wanted) continue;
        if (!canSeeType(spec, user?.TenVaiTro)) continue;
        if (!(await tableExists(pool, spec.table))) continue;
        const dateCol = await firstExistingColumn(pool, spec.table, spec.dateCols);
        const statusCol = spec.statusCol && await firstExistingColumn(pool, spec.table, [spec.statusCol]);
        const request = pool.request().input('Q', sql.NVarChar, `%${query}%`);
        const dateSql = dateCol ? `, ${dateCol} AS Ngay` : ', CAST(NULL AS DATETIME) AS Ngay';
        const statusSql = statusCol ? `, ${statusCol} AS TrangThai` : ', CAST(NULL AS NVARCHAR(40)) AS TrangThai';
        const filter = query ? `WHERE ${spec.idCol} LIKE @Q` : '';
        const order = dateCol ? `ORDER BY ${dateCol} DESC` : `ORDER BY ${spec.idCol} DESC`;
        const result = await request.query(`
            SELECT TOP 12 ${spec.idCol} AS Ma ${dateSql} ${statusSql}
            FROM dbo.${spec.table}
            ${filter}
            ${order}`);
        for (const row of result.recordset) items.push(mapRow(spec, row, dateCol, statusCol));
    }
    return items.slice(0, 30);
};

const moneyOf = (value) => Number(value || 0);

const getSpecialVoucher = async (pool, user, loai, ma) => {
    const role = foldRole(user?.TenVaiTro);
    const finance = ['quản lý', 'kế toán', 'nhân viên mua hàng'].includes(role);
    if (!finance) return null;
    if (loai === 'GiaHanCongNo') {
        const result = await pool.request()
            .input('Ma', sql.Int, Number(ma) || 0)
            .query(`
                SELECT g.MaGiaHan, g.MaCNPTra, g.HanCu, g.HanMoi, g.TrangThai, g.NgayYeuCau,
                       g.GhiChu, ncc.TenNCC, cn.SoTienNo, cn.SoTienDaTra, cn.SoTienConLai
                FROM dbo.CongNoGiaHan g
                LEFT JOIN dbo.CongNoPhaiTra cn ON cn.MaCNPTra = g.MaCNPTra
                LEFT JOIN dbo.NhaCungCap ncc ON ncc.MaNCC = COALESCE(g.MaNCC, cn.MaNCC)
                WHERE g.MaGiaHan = @Ma`);
        if (!result.recordset.length) return null;
        const row = result.recordset[0];
        return {
            loai,
            ma: String(row.MaGiaHan),
            ten: `Xin gia hạn · ${row.TenNCC || row.MaCNPTra}`,
            title: 'XIN GIA HẠN THANH TOÁN',
            trangThai: row.TrangThai,
            ngay: row.NgayYeuCau,
            tenNCC: row.TenNCC,
            soTien: moneyOf(row.SoTienNo),
            soTienDaTra: moneyOf(row.SoTienDaTra),
            soTienConLai: moneyOf(row.SoTienConLai),
            hanThanhToan: row.HanMoi || row.HanCu,
            maCongNo: row.MaCNPTra
        };
    }
    if (loai === 'CongNoPhaiTra') {
        const result = await pool.request()
            .input('Ma', sql.VarChar, String(ma).trim())
            .query(`
                SELECT cn.MaCNPTra, cn.SoTienNo, cn.SoTienDaTra, cn.SoTienConLai, cn.HanThanhToan,
                       cn.TrangThai, ncc.TenNCC, hd.SoHoaDon
                FROM dbo.CongNoPhaiTra cn
                JOIN dbo.NhaCungCap ncc ON ncc.MaNCC = cn.MaNCC
                LEFT JOIN dbo.HoaDonMuaHang hd ON hd.MaHDMH = cn.MaHDMH
                WHERE cn.MaCNPTra = @Ma`);
        if (!result.recordset.length) return null;
        const row = result.recordset[0];
        return {
            loai, ma: row.MaCNPTra, ten: `Công nợ ${row.MaCNPTra} · ${row.TenNCC}`,
            title: 'CÔNG NỢ NHÀ CUNG CẤP', trangThai: row.TrangThai, ngay: row.HanThanhToan,
            tenNCC: row.TenNCC, soTien: moneyOf(row.SoTienNo), soTienDaTra: moneyOf(row.SoTienDaTra),
            soTienConLai: moneyOf(row.SoTienConLai), hanThanhToan: row.HanThanhToan, soHoaDon: row.SoHoaDon
        };
    }
    if (loai === 'PhieuChi') {
        const result = await pool.request()
            .input('Ma', sql.VarChar, String(ma).trim())
            .query(`
                SELECT pc.MaPhieu, pc.SoTien, pc.TrangThai, pc.NgayChungTu, pc.PhuongThuc,
                       ncc.TenNCC, cn.SoTienNo, cn.SoTienDaTra, cn.SoTienConLai, cn.MaCNPTra
                FROM dbo.PhieuChi pc
                JOIN dbo.NhaCungCap ncc ON ncc.MaNCC = pc.MaNCC
                LEFT JOIN dbo.CongNoPhaiTra cn ON cn.MaCNPTra = pc.MaCongNo
                WHERE pc.MaPhieu = @Ma`);
        if (!result.recordset.length) return null;
        const row = result.recordset[0];
        return {
            loai, ma: row.MaPhieu, ten: `Phiếu chi ${row.MaPhieu} · ${row.TenNCC}`,
            title: 'PHIẾU CHI NCC', trangThai: row.TrangThai, ngay: row.NgayChungTu,
            tenNCC: row.TenNCC, soTien: moneyOf(row.SoTien), soTienDaTra: moneyOf(row.SoTienDaTra),
            soTienConLai: moneyOf(row.SoTienConLai), maCongNo: row.MaCNPTra
        };
    }
    return null;
};

const getVoucher = async (pool, user, loai, ma) => {
    const special = await getSpecialVoucher(pool, user, String(loai || ''), ma);
    if (special) return special;
    const spec = typeByLoai.get(String(loai || ''));
    if (!spec) {
        const error = new Error('Loại chứng từ không hỗ trợ.');
        error.status = 404;
        throw error;
    }
    if (!canSeeType(spec, user?.TenVaiTro)) {
        const error = new Error('Bạn không xem được loại chứng từ này.');
        error.status = 403;
        throw error;
    }
    if (!(await tableExists(pool, spec.table))) {
        const error = new Error('Chưa có bảng chứng từ này trên hệ thống.');
        error.status = 404;
        throw error;
    }
    const dateCol = await firstExistingColumn(pool, spec.table, spec.dateCols);
    const statusCol = spec.statusCol && await firstExistingColumn(pool, spec.table, [spec.statusCol]);
    const dateSql = dateCol ? `, ${dateCol} AS Ngay` : ', CAST(NULL AS DATETIME) AS Ngay';
    const statusSql = statusCol ? `, ${statusCol} AS TrangThai` : ', CAST(NULL AS NVARCHAR(40)) AS TrangThai';
    const result = await pool.request()
        .input('Ma', sql.VarChar, String(ma || '').trim())
        .query(`SELECT TOP 1 ${spec.idCol} AS Ma ${dateSql} ${statusSql}
                FROM dbo.${spec.table} WHERE ${spec.idCol} = @Ma`);
    if (!result.recordset.length) {
        const error = new Error('Không tìm thấy chứng từ.');
        error.status = 404;
        throw error;
    }
    return mapRow(spec, result.recordset[0], dateCol, statusCol);
};

module.exports = { VOUCHER_TYPES, listVouchers, getVoucher };
