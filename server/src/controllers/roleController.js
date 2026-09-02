const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');

// Lấy danh sách vai trò
const getRoles = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM VaiTro ORDER BY MaVaiTro');
        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Lấy ma trận phân quyền
const getPermissionMatrix = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT v.MaVaiTro, v.TenVaiTro, c.MaChucNang, c.TenChucNang, c.Nhom,
                   ISNULL(vc.DuocPhep, 0) AS DuocPhep
            FROM VaiTro v
            CROSS JOIN ChucNang c
            LEFT JOIN VaiTro_ChucNang vc ON v.MaVaiTro = vc.MaVaiTro AND c.MaChucNang = vc.MaChucNang
            ORDER BY c.Nhom, c.MaChucNang, v.MaVaiTro
        `);
        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Cập nhật ma trận phân quyền
const updatePermissions = async (req, res) => {
    try {
        const { permissions } = req.body; // array of { MaVaiTro, MaChucNang, DuocPhep }
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ message: 'Dữ liệu không hợp lệ!' });
        }

        const pool = await poolPromise;
        const [roleResult, functionResult] = await Promise.all([
            pool.request().query('SELECT MaVaiTro, TenVaiTro FROM VaiTro'),
            pool.request().query('SELECT MaChucNang FROM ChucNang')
        ]);
        const manager = roleResult.recordset.find(role => role.TenVaiTro === 'Quản lý');
        const validRoleIds = new Set(roleResult.recordset.map(role => Number(role.MaVaiTro)));
        const validFunctionIds = new Set(functionResult.recordset.map(item => String(item.MaChucNang).trim()));

        if (!manager) {
            return res.status(500).json({ message: 'Thiếu vai trò Quản lý trong cơ sở dữ liệu.' });
        }

        const normalized = permissions.map(item => ({
            MaVaiTro: Number(item.MaVaiTro),
            MaChucNang: String(item.MaChucNang || '').trim(),
            DuocPhep: Boolean(item.DuocPhep)
        }));
        if (normalized.some(item => !validRoleIds.has(item.MaVaiTro) || !validFunctionIds.has(item.MaChucNang))) {
            return res.status(400).json({ message: 'Dữ liệu phân quyền chứa vai trò hoặc chức năng không hợp lệ.' });
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Vai trò Quản lý được cố định theo UC01-UC10 để tránh tự khóa hệ thống.
            await new sql.Request(transaction).query('DELETE FROM VaiTro_ChucNang');

            for (let index = 1; index <= 10; index += 1) {
                await new sql.Request(transaction)
                    .input('MaVaiTro', sql.Int, Number(manager.MaVaiTro))
                    .input('MaChucNang', sql.VarChar, `UC${String(index).padStart(2, '0')}`)
                    .query(`INSERT INTO VaiTro_ChucNang (MaVaiTro, MaChucNang, DuocPhep)
                            VALUES (@MaVaiTro, @MaChucNang, 1)`);
            }

            const uniquePermissions = new Map();
            normalized
                .filter(item => item.MaVaiTro !== Number(manager.MaVaiTro) && item.DuocPhep)
                .forEach(item => uniquePermissions.set(`${item.MaVaiTro}:${item.MaChucNang}`, item));

            for (const p of uniquePermissions.values()) {
                await new sql.Request(transaction)
                    .input('MaVaiTro', sql.Int, p.MaVaiTro)
                    .input('MaChucNang', sql.VarChar, p.MaChucNang)
                    .query(`INSERT INTO VaiTro_ChucNang (MaVaiTro, MaChucNang, DuocPhep)
                            VALUES (@MaVaiTro, @MaChucNang, 1)`);
            }

            // Ghi nhật ký
            await logAudit(transaction, {
                user: req.user, req, action: 'Cập nhật phân quyền', table: 'VaiTro_ChucNang',
                severity: 'Quan trọng', content: 'Đã cập nhật lại ma trận phân quyền hệ thống'
            });

            await transaction.commit();
            res.json({ message: 'Cập nhật phân quyền thành công!' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server khi cập nhật quyền' });
    }
};

module.exports = {
    getRoles,
    getPermissionMatrix,
    updatePermissions
};
