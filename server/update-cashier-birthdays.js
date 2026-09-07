require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');

const CASHIER_BIRTHDAYS = [
    { MaNV: 'NV_TN01', NgaySinh: '1998-02-18' },
    { MaNV: 'NV_TN02', NgaySinh: '1999-09-03' },
    { MaNV: 'NV_TN03', NgaySinh: '1999-05-26' },
    { MaNV: 'NV_TN04', NgaySinh: '2001-12-14' },
    { MaNV: 'NV_TN05', NgaySinh: '2000-04-09' },
    { MaNV: 'NV_TN06', NgaySinh: '1998-08-30' },
    { MaNV: 'NV_TN07', NgaySinh: '2001-01-22' },
    { MaNV: 'NV_TN08', NgaySinh: '2002-06-17' }
];

async function updateCashierBirthdays(pool) {
    const before = await pool.request().query(`
        SELECT n.MaNV, n.TenNV, n.NgaySinh, n.NgayVaoLam, n.CCCD
        FROM NhanVien n
        WHERE n.MaNV IN ('NV_TN01','NV_TN02','NV_TN03','NV_TN04','NV_TN05','NV_TN06','NV_TN07','NV_TN08')
        ORDER BY n.MaNV`);
    console.log('Trước khi cập nhật:');
    before.recordset.forEach((row) => {
        console.log(`  ${row.MaNV} ${row.TenNV}  ${row.NgaySinh ? String(row.NgaySinh).slice(0, 10) : 'NULL'}  CCCD ${row.CCCD || '—'}`);
    });

    for (const row of CASHIER_BIRTHDAYS) {
        await pool.request()
            .input('MaNV', sql.VarChar, row.MaNV)
            .input('NgaySinh', sql.Date, row.NgaySinh)
            .query(`UPDATE NhanVien
                    SET NgaySinh = @NgaySinh
                    WHERE MaNV = @MaNV AND ChucVu = N'Thu ngân'`);
    }

    const after = await pool.request().query(`
        SELECT n.MaNV, n.TenNV, CONVERT(char(10), n.NgaySinh, 23) AS NgaySinh,
               CONVERT(char(10), n.NgayVaoLam, 23) AS NgayVaoLam, n.CCCD
        FROM NhanVien n
        WHERE n.MaNV IN ('NV_TN01','NV_TN02','NV_TN03','NV_TN04','NV_TN05','NV_TN06','NV_TN07','NV_TN08')
        ORDER BY n.MaNV`);
    console.log('Sau khi cập nhật:');
    after.recordset.forEach((row) => {
        console.log(`  ${row.MaNV} ${row.TenNV}  ${row.NgaySinh}  vào làm ${row.NgayVaoLam}  CCCD ${row.CCCD || '—'}`);
    });
    return after.recordset;
}

async function main() {
    const pool = await poolPromise;
    await updateCashierBirthdays(pool);
    process.exit(0);
}

if (require.main === module) {
    main().catch((err) => {
        console.error('❌ Lỗi cập nhật ngày sinh thu ngân:', err.message);
        process.exit(1);
    });
}

module.exports = { CASHIER_BIRTHDAYS, updateCashierBirthdays };
