const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const {
    MANAGER_FIXED_PERMISSION_CODES,
    FUNCTION_CATALOG,
    ensureEmployeePermissionSchema,
    loadRoleCodesFromDb,
    loadOverrideCodes,
    mergeEffective,
    uniqueCodes,
    saveEmployeeOverrides,
    clearEmployeeOverrides,
    foldRole
} = require('../services/effectivePermissions');

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
            // Vai trò Quản lý được cố định theo bộ quyền vận hành chuẩn để tránh tự khóa hệ thống.
            await new sql.Request(transaction).query('DELETE FROM VaiTro_ChucNang');

            for (const code of MANAGER_FIXED_PERMISSION_CODES) {
                await new sql.Request(transaction)
                    .input('MaVaiTro', sql.Int, Number(manager.MaVaiTro))
                    .input('MaChucNang', sql.VarChar, code)
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

const getStaffPermissions = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureEmployeePermissionSchema(pool);
        const [roles, functions, employees] = await Promise.all([
            pool.request().query(`SELECT MaVaiTro, TenVaiTro, MoTa FROM VaiTro ORDER BY MaVaiTro`),
            pool.request().query(`SELECT MaChucNang, TenChucNang, Nhom FROM ChucNang ORDER BY Nhom, MaChucNang`),
            pool.request().query(`
                SELECT n.MaNV, n.TenNV, n.ChucVu, n.TrangThai,
                       t.MaTK, t.MaVaiTro, t.TrangThai AS TrangThaiTK, v.TenVaiTro
                FROM NhanVien n
                LEFT JOIN TaiKhoan t ON t.MaNV = n.MaNV
                LEFT JOIN VaiTro v ON v.MaVaiTro = t.MaVaiTro
                ORDER BY CASE COALESCE(v.TenVaiTro, n.ChucVu)
                    WHEN N'Quản lý' THEN 1
                    WHEN N'Nhân viên mua hàng' THEN 2
                    WHEN N'Thủ kho' THEN 3
                    WHEN N'Thu ngân' THEN 4
                    WHEN N'Kế toán' THEN 5
                    ELSE 6 END, n.TenNV`)
        ]);
        const roleRows = roles.recordset;
        const functionRows = functions.recordset.length ? functions.recordset : FUNCTION_CATALOG;
        const roleCodesMap = {};
        for (const role of roleRows) {
            roleCodesMap[role.MaVaiTro] = await loadRoleCodesFromDb(pool, role.MaVaiTro);
        }
        const staff = [];
        for (const emp of employees.recordset) {
            const maVaiTro = emp.MaVaiTro;
            const tenVaiTro = emp.TenVaiTro || emp.ChucVu;
            const roleCodes = maVaiTro ? (roleCodesMap[maVaiTro] || []) : [];
            const override = emp.MaNV ? await loadOverrideCodes(pool, emp.MaNV) : null;
            const codes = mergeEffective({ roleCodes, overrideCodes: override, tenVaiTro });
            const extra = codes.filter((code) => !roleCodes.includes(code));
            staff.push({
                MaNV: emp.MaNV,
                TenNV: emp.TenNV,
                ChucVu: emp.ChucVu,
                TrangThai: emp.TrangThai,
                HasAccount: Boolean(emp.MaTK),
                MaTK: emp.MaTK || null,
                MaVaiTro: maVaiTro || null,
                TenVaiTro: tenVaiTro,
                TrangThaiTK: emp.TrangThaiTK,
                CheDo: override ? 'TuyChinh' : 'TheoVaiTro',
                codes,
                roleCodes,
                extra
            });
        }
        res.json({
            functions: functionRows,
            roles: roleRows.map((role) => ({
                ...role,
                codes: roleCodesMap[role.MaVaiTro] || []
            })),
            employees: staff
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không tải được phân quyền nhân viên.' });
    }
};

const updateEmployeePermissions = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const maNV = String(req.params.maNV || '').trim();
        const codes = Array.isArray(req.body?.codes) ? req.body.codes : null;
        if (!maNV || !codes) {
            return res.status(400).json({ message: 'Thiếu mã nhân viên hoặc danh sách quyền.' });
        }
        await transaction.begin();
        await ensureEmployeePermissionSchema(transaction);
        const emp = await new sql.Request(transaction)
            .input('MaNV', sql.VarChar, maNV)
            .query(`SELECT n.MaNV, n.TenNV, n.ChucVu, t.MaVaiTro, v.TenVaiTro
                    FROM NhanVien n
                    LEFT JOIN TaiKhoan t ON t.MaNV = n.MaNV
                    LEFT JOIN VaiTro v ON v.MaVaiTro = t.MaVaiTro
                    WHERE n.MaNV = @MaNV`);
        if (!emp.recordset.length) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Không tìm thấy nhân viên.' });
        }
        const row = emp.recordset[0];
        if (!row.MaVaiTro) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Nhân viên chưa có tài khoản nên chưa gán quyền đăng nhập.' });
        }
        if (foldRole(row.TenVaiTro || row.ChucVu) === 'quản lý') {
            await transaction.rollback();
            return res.status(400).json({ message: 'Quyền vai trò Quản lý được cố định, không tùy chỉnh từng người.' });
        }
        const roleCodes = await loadRoleCodesFromDb(transaction, row.MaVaiTro);
        const granted = uniqueCodes(codes);
        const valid = new Set((FUNCTION_CATALOG || []).map((item) => item.MaChucNang));
        const catalog = await new sql.Request(transaction).query('SELECT MaChucNang FROM ChucNang');
        catalog.recordset.forEach((item) => valid.add(String(item.MaChucNang)));
        if (granted.some((code) => !valid.has(code))) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Danh sách quyền chứa mã chức năng không hợp lệ.' });
        }
        const saved = await saveEmployeeOverrides(transaction, {
            maNV,
            codes: granted,
            roleCodes
        });
        await logAudit(transaction, {
            user: req.user, req, action: 'Phân quyền nhân viên', table: 'NhanVien_ChucNang',
            recordId: maNV, severity: 'Quan trọng',
            content: saved.cheDo === 'TuyChinh'
                ? `Tùy chỉnh quyền ${row.TenNV}: ${saved.codes.join(', ')}`
                : `Khôi phục ${row.TenNV} theo mẫu vai trò ${row.TenVaiTro}`
        });
        await transaction.commit();
        res.json({
            message: saved.cheDo === 'TuyChinh'
                ? `Đã lưu quyền riêng cho ${row.TenNV}. Nhân viên cần đăng nhập lại hoặc tải lại trang.`
                : `Đã trả ${row.TenNV} về đúng mẫu vai trò ${row.TenVaiTro}.`,
            ...saved,
            MaNV: maNV
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(500).json({ message: error.message || 'Không lưu được quyền nhân viên.' });
    }
};

const resetEmployeePermissions = async (req, res) => {
    try {
        const maNV = String(req.params.maNV || '').trim();
        const pool = await poolPromise;
        await ensureEmployeePermissionSchema(pool);
        await clearEmployeeOverrides(pool, maNV);
        await logAudit(pool, {
            user: req.user, req, action: 'Khôi phục quyền theo vai trò', table: 'NhanVien_ChucNang',
            recordId: maNV, content: `Xóa tùy chỉnh quyền của ${maNV}`
        });
        res.json({ message: 'Đã khôi phục quyền theo mẫu vai trò.', cheDo: 'TheoVaiTro', MaNV: maNV });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không khôi phục được quyền.' });
    }
};

const promoteEmployee = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const maNV = String(req.params.maNV || '').trim();
        const maVaiTro = Number(req.body?.MaVaiTro);
        const keepOverrides = Boolean(req.body?.GiuQuyenRieng);
        if (!maNV || !Number.isInteger(maVaiTro)) {
            return res.status(400).json({ message: 'Chọn vai trò mới cho nhân viên.' });
        }
        await transaction.begin();
        await ensureEmployeePermissionSchema(transaction);
        const emp = await new sql.Request(transaction)
            .input('MaNV', sql.VarChar, maNV)
            .query(`SELECT n.MaNV, n.TenNV, n.ChucVu, t.MaTK, t.MaVaiTro, v.TenVaiTro
                    FROM NhanVien n
                    LEFT JOIN TaiKhoan t ON t.MaNV = n.MaNV
                    LEFT JOIN VaiTro v ON v.MaVaiTro = t.MaVaiTro
                    WHERE n.MaNV = @MaNV`);
        if (!emp.recordset.length) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Không tìm thấy nhân viên.' });
        }
        const row = emp.recordset[0];
        if (!row.MaTK) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Nhân viên chưa có tài khoản, hãy tạo tài khoản trước khi nâng vai trò.' });
        }
        const role = await new sql.Request(transaction)
            .input('MaVaiTro', sql.Int, maVaiTro)
            .query('SELECT MaVaiTro, TenVaiTro FROM VaiTro WHERE MaVaiTro = @MaVaiTro');
        if (!role.recordset.length) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Vai trò không tồn tại.' });
        }
        const next = role.recordset[0];
        await new sql.Request(transaction)
            .input('MaNV', sql.VarChar, maNV)
            .input('ChucVu', sql.NVarChar, next.TenVaiTro)
            .query('UPDATE NhanVien SET ChucVu = @ChucVu WHERE MaNV = @MaNV');
        await new sql.Request(transaction)
            .input('MaTK', sql.Int, row.MaTK)
            .input('MaVaiTro', sql.Int, next.MaVaiTro)
            .query('UPDATE TaiKhoan SET MaVaiTro = @MaVaiTro WHERE MaTK = @MaTK');
        if (!keepOverrides) {
            await new sql.Request(transaction)
                .input('MaNV', sql.VarChar, maNV)
                .query('DELETE FROM dbo.NhanVien_ChucNang WHERE MaNV = @MaNV');
        }
        await logAudit(transaction, {
            user: req.user, req, action: 'Nâng vai trò nhân viên', table: 'TaiKhoan',
            recordId: String(row.MaTK), severity: 'Quan trọng',
            content: `${row.TenNV}: ${row.TenVaiTro || row.ChucVu} → ${next.TenVaiTro}`
        });
        await transaction.commit();
        res.json({
            message: `Đã chuyển ${row.TenNV} sang vai trò ${next.TenVaiTro}. Nhân viên cần đăng nhập lại.`,
            MaNV: maNV,
            MaVaiTro: next.MaVaiTro,
            TenVaiTro: next.TenVaiTro
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(500).json({ message: error.message || 'Không đổi được vai trò.' });
    }
};

module.exports = {
    getRoles,
    getPermissionMatrix,
    updatePermissions,
    getStaffPermissions,
    updateEmployeePermissions,
    resetEmployeePermissions,
    promoteEmployee
};
