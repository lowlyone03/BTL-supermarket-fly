require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');

async function prepare() {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        await new sql.Request(transaction).query(`
            IF COL_LENGTH('ChiTietDeNghi', 'SLTonThucTe') IS NULL
                ALTER TABLE ChiTietDeNghi ADD SLTonThucTe int NULL;

            IF NOT EXISTS (SELECT 1 FROM Kho WHERE MaKho='KHO_HN01')
                INSERT INTO Kho (MaKho,TenKho,DiaChi,TrangThai)
                VALUES ('KHO_HN01',N'Kho cửa hàng Hà Nội',N'Supermarket Fly · Hà Nội',1);
            ELSE
                UPDATE Kho SET TenKho=N'Kho cửa hàng Hà Nội',DiaChi=N'Supermarket Fly · Hà Nội',TrangThai=1
                WHERE MaKho='KHO_HN01';
        `);

        const removed = await new sql.Request(transaction).query(`
            DELETE dm
            OUTPUT deleted.MaDM, deleted.TenDM
            FROM DanhMuc dm
            WHERE NOT EXISTS (SELECT 1 FROM SanPham sp WHERE sp.MaDM = dm.MaDM);
        `);

        await transaction.commit();
        if (removed.recordset.length) {
            console.log('Đã xóa danh mục rỗng:', removed.recordset.map(row => `${row.MaDM} (${row.TenDM})`).join(', '));
        }
        console.log('Đã chuẩn bị Kho Hà Nội; giữ nguyên danh mục 36 sản phẩm đã chốt.');
        await pool.close();
    } catch (error) {
        await transaction.rollback().catch(() => {});
        console.error(error);
        process.exitCode = 1;
    }
}

prepare();
