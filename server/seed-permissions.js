require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');
const { FUNCTION_CATALOG, ROLE_PERMISSION_CODES } = require('./src/constants/permissions');

async function seedPermissions() {
    try {
        const pool = await poolPromise;
        console.log('--- BẮT ĐẦU SEED CHỨC NĂNG & PHÂN QUYỀN ---');

        // Lấy danh sách Vai trò
        const rolesDb = await pool.request().query('SELECT MaVaiTro, TenVaiTro FROM VaiTro');
        const roleMap = {};
        rolesDb.recordset.forEach(r => {
            roleMap[r.TenVaiTro.toLowerCase().trim()] = r.MaVaiTro;
        });

        // Xóa bộ mã CN_* cũ vì tài liệu đã chốt duy nhất 29 use case UC01-UC29.
        await pool.request().query(`
            DELETE FROM VaiTro_ChucNang WHERE MaChucNang LIKE 'CN[_]%';
            DELETE FROM ChucNang WHERE MaChucNang LIKE 'CN[_]%';
        `);

        // Seed/chuẩn hóa ChucNang
        for (const fn of FUNCTION_CATALOG) {
            const check = await pool.request()
                .input('MaChucNang', sql.VarChar, fn.MaChucNang)
                .query('SELECT MaChucNang FROM ChucNang WHERE MaChucNang = @MaChucNang');
            if (check.recordset.length === 0) {
                await pool.request()
                    .input('MaChucNang', sql.VarChar, fn.MaChucNang)
                    .input('TenChucNang', sql.NVarChar, fn.TenChucNang)
                    .input('Nhom', sql.NVarChar, fn.Nhom)
                    .query('INSERT INTO ChucNang (MaChucNang, TenChucNang, Nhom) VALUES (@MaChucNang, @TenChucNang, @Nhom)');
            } else {
                await pool.request()
                    .input('MaChucNang', sql.VarChar, fn.MaChucNang)
                    .input('TenChucNang', sql.NVarChar, fn.TenChucNang)
                    .input('Nhom', sql.NVarChar, fn.Nhom)
                    .query(`UPDATE ChucNang
                            SET TenChucNang = @TenChucNang, Nhom = @Nhom
                            WHERE MaChucNang = @MaChucNang`);
            }
        }
        console.log('+ Đã seed 29 Use Case gốc và 4 quyền nhân sự mở rộng');

        // Map VaiTro -> Array of MaChucNang
        // Clear VaiTro_ChucNang
        await pool.request().query('DELETE FROM VaiTro_ChucNang');

        // Insert VaiTro_ChucNang
        for (const [roleName, ucs] of Object.entries(ROLE_PERMISSION_CODES)) {
            const roleId = roleMap[roleName];
            if (roleId) {
                for (const uc of ucs) {
                    await pool.request()
                        .input('MaVaiTro', sql.Int, roleId)
                        .input('MaChucNang', sql.VarChar, uc)
                        .input('DuocPhep', sql.Bit, 1)
                        .query('INSERT INTO VaiTro_ChucNang (MaVaiTro, MaChucNang, DuocPhep) VALUES (@MaVaiTro, @MaChucNang, @DuocPhep)');
                }
            }
        }
        console.log('+ Đã seed bảng VaiTro_ChucNang');

        console.log('--- HOÀN TẤT SEED DỮ LIỆU ---');
        process.exit(0);

    } catch (err) {
        console.error('❌ Lỗi: ', err);
        process.exit(1);
    }
}

seedPermissions();
