require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');
const { FUNCTION_CATALOG, ROLE_PERMISSION_CODES } = require('./src/constants/permissions');

const normalize = value => String(value || '').trim().toLocaleLowerCase('vi-VN');

const findRoleIdByName = (roleMap, aliases) => {
    for (const alias of aliases) {
        const roleId = roleMap.get(normalize(alias));
        if (roleId) return roleId;
    }
    return null;
};

async function syncRolePermissions() {
    try {
        const pool = await poolPromise;
        console.log('--- BẮT ĐẦU ĐỒNG BỘ QUYỀN VAI TRÒ ---');

        for (const fn of FUNCTION_CATALOG) {
            await pool.request()
                .input('MaChucNang', sql.VarChar, fn.MaChucNang)
                .input('TenChucNang', sql.NVarChar, fn.TenChucNang)
                .input('Nhom', sql.NVarChar, fn.Nhom)
                .query(`MERGE ChucNang AS target
                        USING (SELECT @MaChucNang AS MaChucNang) AS source
                        ON target.MaChucNang = source.MaChucNang
                        WHEN MATCHED THEN
                            UPDATE SET TenChucNang = @TenChucNang, Nhom = @Nhom
                        WHEN NOT MATCHED THEN
                            INSERT (MaChucNang, TenChucNang, Nhom)
                            VALUES (@MaChucNang, @TenChucNang, @Nhom);`);
        }

        const rolesDb = await pool.request().query('SELECT MaVaiTro, TenVaiTro FROM VaiTro');
        const roleMap = new Map(
            rolesDb.recordset.map(row => [normalize(row.TenVaiTro), Number(row.MaVaiTro)])
        );

        const roleAliases = {
            'quản lý': ['Quản lý', 'Quan ly', 'Manager', 'Admin', 'Quản trị', 'Quản trị viên'],
            'nhân viên mua hàng': ['Nhân viên mua hàng', 'Nhan vien mua hang', 'Mua hàng', 'Purchasing'],
            'thủ kho': ['Thủ kho', 'Thu kho', 'Kho', 'Warehouse'],
            'thu ngân': ['Thu ngân', 'Thu ngan', 'Cashier'],
            'kế toán': ['Kế toán', 'Ke toan', 'Accounting']
        };

        for (const [roleKey, codes] of Object.entries(ROLE_PERMISSION_CODES)) {
            const aliases = roleAliases[roleKey] || [roleKey];
            const roleId = findRoleIdByName(roleMap, aliases);
            if (!roleId) {
                console.warn(`! Bỏ qua vai trò "${roleKey}" vì không tìm thấy trong bảng VaiTro.`);
                continue;
            }

            for (const code of codes) {
                await pool.request()
                    .input('MaVaiTro', sql.Int, roleId)
                    .input('MaChucNang', sql.VarChar, code)
                    .query(`MERGE VaiTro_ChucNang AS target
                            USING (SELECT @MaVaiTro AS MaVaiTro, @MaChucNang AS MaChucNang) AS source
                            ON target.MaVaiTro = source.MaVaiTro AND target.MaChucNang = source.MaChucNang
                            WHEN MATCHED THEN
                                UPDATE SET DuocPhep = 1
                            WHEN NOT MATCHED THEN
                                INSERT (MaVaiTro, MaChucNang, DuocPhep)
                                VALUES (@MaVaiTro, @MaChucNang, 1);`);
            }

            console.log(`+ Đã đồng bộ ${codes.length} quyền cho vai trò "${roleKey}" (MaVaiTro=${roleId}).`);
        }

        console.log('--- HOÀN TẤT ĐỒNG BỘ QUYỀN ---');
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi đồng bộ quyền:', error);
        process.exit(1);
    }
}

syncRolePermissions();
