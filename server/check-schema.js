require('dotenv').config();
const { poolPromise } = require('./src/config/db');

async function checkSchema() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME IN (
                'VaiTro', 'NhanVien', 'TaiKhoan', 'ChucNang', 'VaiTro_ChucNang',
                'SanPham', 'TonKho', 'Kho', 'GiaoDichKho',
                'DeNghiMuaHang', 'ChiTietDeNghi', 'DonMuaHang', 'ChiTietDonMua',
                'NhatKy'
            )
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `);
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('Lỗi: ', err);
        process.exit(1);
    }
}

checkSchema();
