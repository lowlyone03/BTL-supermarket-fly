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
        loai: 'HoaDonMuaHang',
        table: 'HoaDonMuaHang',
        idCol: 'MaHDMH',
        title: 'HÓA ĐƠN MUA HÀNG',
        dateCols: ['NgayLap', 'NgayHoaDon'],
        statusCol: 'TrangThaiDoiChieu',
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

const getVoucher = async (pool, user, loai, ma) => {
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
