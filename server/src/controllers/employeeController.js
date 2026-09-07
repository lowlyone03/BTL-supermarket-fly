const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const { ensurePayrollSchema } = require('../services/payrollSchema');
const { ensureEmployeeProfileSchema } = require('../services/employeeProfileSchema');
const {
    HOSO_SELECT, hasProfileInput, validateEmployeeProfile, toHoSoProfile,
    uniqueProfileConflictMessage, assertUniqueProfileCodes, upsertEmployeeProfile
} = require('../services/employeeHoSo');
const {
    validateEmployeeCode, validateEmployeeProfileFields
} = require('../services/fieldValidators');

const EMPLOYEE_STATUSES = ['Đang làm việc', 'Nghỉ việc'];

const normalizeText = value => typeof value === 'string' ? value.trim() : '';

const uniqueEmployeeConflictMessage = (error) => {
    const profileMessage = uniqueProfileConflictMessage(error);
    if (profileMessage) return profileMessage;
    const text = error?.message || '';
    if (text.includes('UX_NhanVien_CCCD') || /CCCD/i.test(text)) {
        return 'Số CCCD đã được dùng cho nhân viên khác.';
    }
    if (/Email/i.test(text)) {
        return 'Email đã được dùng cho nhân viên khác.';
    }
    if (/SDT/i.test(text)) {
        return 'Số điện thoại đã được dùng cho nhân viên khác.';
    }
    return 'Số CCCD, số điện thoại, Email, MST hoặc BHXH đã bị trùng!';
};

const bindEmployeeFields = (request, employee) => request
    .input('TenNV', sql.NVarChar, employee.TenNV)
    .input('ChucVu', sql.NVarChar, employee.ChucVu)
    .input('CCCD', sql.VarChar, employee.CCCD)
    .input('NgaySinh', sql.Date, employee.NgaySinh)
    .input('GioiTinh', sql.NVarChar, employee.GioiTinh)
    .input('SDT', sql.VarChar, employee.SDT)
    .input('Email', sql.VarChar, employee.Email)
    .input('DiaChi', sql.NVarChar, employee.DiaChi)
    .input('NgayVaoLam', sql.Date, employee.NgayVaoLam)
    .input('TrangThai', sql.NVarChar, employee.TrangThai);

const findDuplicateEmployee = async (pool, column, value, excludeMaNV, type = sql.VarChar) => {
    if (!value) return null;
    const request = pool.request().input('Value', type, value);
    let sqlText = `SELECT MaNV FROM NhanVien WHERE ${column} = @Value`;
    if (excludeMaNV) {
        request.input('MaNV', sql.VarChar, excludeMaNV);
        sqlText += ' AND MaNV <> @MaNV';
    }
    const found = await request.query(sqlText);
    return found.recordset[0] || null;
};

const validateEmployeeInput = async (pool, body, { requireCode = false, excludeMaNV = '', strictCreate = requireCode } = {}) => {
    const employee = {
        MaNV: normalizeText(body.MaNV).toUpperCase(),
        ChucVu: normalizeText(body.ChucVu),
        TrangThai: normalizeText(body.TrangThai) || 'Đang làm việc'
    };

    if (requireCode) {
        const maNV = validateEmployeeCode(employee.MaNV);
        if (!maNV.ok) return { error: maNV.message };
        employee.MaNV = maNV.value;
    }
    const fields = validateEmployeeProfileFields(body, { strictCreate });
    if (!fields.ok) return { error: fields.message };
    employee.TenNV = fields.profile.TenNV;
    employee.CCCD = fields.profile.CCCD || null;
    employee.NgaySinh = fields.profile.NgaySinh;
    employee.GioiTinh = fields.profile.GioiTinh || null;
    employee.SDT = fields.profile.SDT || null;
    employee.Email = fields.profile.Email || null;
    employee.DiaChi = fields.profile.DiaChi || null;
    employee.NgayVaoLam = fields.profile.NgayVaoLam;
    if (!employee.ChucVu) {
        return { error: 'Vui lòng chọn chức vụ.' };
    }
    if (!EMPLOYEE_STATUSES.includes(employee.TrangThai)) {
        return { error: 'Trạng thái nhân viên không hợp lệ.' };
    }

    const exclude = normalizeText(excludeMaNV) || (requireCode ? employee.MaNV : '');
    if (await findDuplicateEmployee(pool, 'CCCD', employee.CCCD, exclude)) {
        return { error: 'Số CCCD đã được dùng cho nhân viên khác.' };
    }
    if (await findDuplicateEmployee(pool, 'SDT', employee.SDT, exclude)) {
        return { error: 'Số điện thoại đã được dùng cho nhân viên khác.' };
    }
    if (await findDuplicateEmployee(pool, 'Email', employee.Email, exclude)) {
        return { error: 'Email đã được dùng cho nhân viên khác.' };
    }

    const role = await pool.request()
        .input('TenVaiTro', sql.NVarChar, employee.ChucVu)
        .query('SELECT MaVaiTro FROM VaiTro WHERE TenVaiTro = @TenVaiTro');
    if (role.recordset.length === 0) {
        return { error: 'Chức vụ phải thuộc một trong 5 vai trò của hệ thống.' };
    }

    employee.MaVaiTro = role.recordset[0].MaVaiTro;

    const profileResult = validateEmployeeProfile(body, {
        diaChi: employee.DiaChi,
        ngaySinh: employee.NgaySinh,
        cccd: employee.CCCD,
        tenNV: employee.TenNV,
        strictCreate
    });
    if (profileResult.error) return { error: profileResult.error };
    const uniqueProfile = await assertUniqueProfileCodes(pool, profileResult.profile, exclude);
    if (uniqueProfile.error) return { error: uniqueProfile.error };

    return {
        employee,
        profile: profileResult.profile || toHoSoProfile(fields.profile, { diaChi: employee.DiaChi }),
        saveProfile: hasProfileInput(body) || requireCode || Boolean(employee.CCCD)
    };
};

// Lấy danh sách nhân viên
const getEmployees = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureEmployeeProfileSchema(pool);
        const result = await pool.request().query(`
            SELECT n.*,
                   CASE WHEN t.MaTK IS NOT NULL THEN 1 ELSE 0 END AS HasAccount,
                   t.TenDangNhap,
                   ${HOSO_SELECT}
            FROM NhanVien n
            LEFT JOIN TaiKhoan t ON n.MaNV = t.MaNV
            LEFT JOIN HoSoNhanVien hs ON hs.MaNV = n.MaNV
            ORDER BY CASE n.ChucVu
                WHEN N'Quản lý' THEN 1
                WHEN N'Nhân viên mua hàng' THEN 2
                WHEN N'Thủ kho' THEN 3
                WHEN N'Thu ngân' THEN 4
                WHEN N'Kế toán' THEN 5
                ELSE 6 END, n.MaNV
        `);
        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Lấy nhân viên chưa có tài khoản
const getAvailableEmployees = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureEmployeeProfileSchema(pool);
        const result = await pool.request().query(`
            SELECT n.MaNV, n.TenNV, n.ChucVu, n.CCCD, n.NgaySinh, n.GioiTinh, n.SDT, n.Email, n.DiaChi, n.NgayVaoLam,
                   ${HOSO_SELECT}
            FROM NhanVien n
            LEFT JOIN HoSoNhanVien hs ON hs.MaNV = n.MaNV
            WHERE n.MaNV NOT IN (SELECT MaNV FROM TaiKhoan)
              AND n.TrangThai = N'Đang làm việc'
            ORDER BY n.TenNV
        `);
        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Lấy chi tiết nhân viên
const getEmployeeById = async (req, res) => {
    try {
        const { maNV } = req.params;
        const pool = await poolPromise;
        await ensureEmployeeProfileSchema(pool);
        const result = await pool.request()
            .input('MaNV', sql.VarChar, maNV)
            .query(`SELECT n.*, ${HOSO_SELECT}
                    FROM NhanVien n
                    LEFT JOIN HoSoNhanVien hs ON hs.MaNV = n.MaNV
                    WHERE n.MaNV = @MaNV`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
        }
        res.json(result.recordset[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Thêm nhân viên
const createEmployee = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureEmployeeProfileSchema(pool);
        const validation = await validateEmployeeInput(pool, req.body, { requireCode: true });
        if (validation.error) {
            return res.status(400).json({ message: validation.error });
        }
        const { MaNV, TenNV, ChucVu } = validation.employee;
        if (ChucVu === 'Quản lý') {
            const managerCount = await pool.request().query("SELECT COUNT(*) AS Total FROM NhanVien WHERE ChucVu = N'Quản lý' AND TrangThai = N'Đang làm việc'");
            if (managerCount.recordset[0].Total > 0) {
                return res.status(400).json({ message: 'Hệ thống chỉ có một Quản lý cửa hàng.' });
            }
        }

        // Kiểm tra trùng mã
        const check = await pool.request()
            .input('MaNV', sql.VarChar, MaNV)
            .query('SELECT MaNV FROM NhanVien WHERE MaNV = @MaNV');

        if (check.recordset.length > 0) {
            return res.status(400).json({ message: 'Mã nhân viên đã tồn tại!' });
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            await bindEmployeeFields(new sql.Request(transaction).input('MaNV', sql.VarChar, MaNV), validation.employee)
                .query(`INSERT INTO NhanVien
                        (MaNV, TenNV, ChucVu, CCCD, NgaySinh, GioiTinh, SDT, Email, DiaChi, NgayVaoLam, TrangThai)
                        VALUES (@MaNV, @TenNV, @ChucVu, @CCCD, @NgaySinh, @GioiTinh, @SDT, @Email, @DiaChi, @NgayVaoLam, @TrangThai)`);
            await upsertEmployeeProfile(transaction, MaNV, validation.profile);
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        // Ghi nhật ký
        await logAudit(pool, {
            user: req.user, req, action: 'Thêm nhân viên', table: 'NhanVien', recordId: MaNV,
            content: `Thêm nhân viên ${TenNV} — ${ChucVu}`
        });

        res.status(201).json({ message: 'Thêm nhân viên thành công' });
    } catch (error) {
        console.error(error);
        if (/UNIQUE KEY|unique index|UX_NhanVien_CCCD|UX_HoSoNhanVien_/i.test(error.message || '')) {
            return res.status(400).json({ message: uniqueEmployeeConflictMessage(error) });
        }
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Cập nhật nhân viên
const updateEmployee = async (req, res) => {
    try {
        const { maNV } = req.params;
        const pool = await poolPromise;
        await ensurePayrollSchema(pool);
        await ensureEmployeeProfileSchema(pool);
        const validation = await validateEmployeeInput(pool, req.body, { excludeMaNV: maNV });
        if (validation.error) {
            return res.status(400).json({ message: validation.error });
        }
        const { TenNV, ChucVu, TrangThai, MaVaiTro } = validation.employee;

        if (maNV === req.user.MaNV && (TrangThai !== 'Đang làm việc' || Number(MaVaiTro) !== Number(req.user.MaVaiTro))) {
            return res.status(400).json({ message: 'Không thể tự đổi vai trò hoặc cho chính mình nghỉ việc.' });
        }
        if (ChucVu === 'Quản lý') {
            const managerCount = await pool.request()
                .input('MaNV', sql.VarChar, maNV)
                .query("SELECT COUNT(*) AS Total FROM NhanVien WHERE ChucVu = N'Quản lý' AND TrangThai = N'Đang làm việc' AND MaNV <> @MaNV");
            if (managerCount.recordset[0].Total > 0) {
                return res.status(400).json({ message: 'Hệ thống chỉ có một Quản lý cửa hàng.' });
            }
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        let result;
        try {
            result = await bindEmployeeFields(new sql.Request(transaction).input('MaNV', sql.VarChar, maNV), validation.employee)
                .query(`UPDATE NhanVien
                        SET TenNV = @TenNV, ChucVu = @ChucVu, CCCD = @CCCD, NgaySinh = @NgaySinh,
                            GioiTinh = @GioiTinh, SDT = @SDT, Email = @Email, DiaChi = @DiaChi,
                            NgayVaoLam = @NgayVaoLam, TrangThai = @TrangThai,
                            NgayNghiViec = CASE WHEN @TrangThai=N'Nghỉ việc'
                                THEN COALESCE(NgayNghiViec, CONVERT(date, GETDATE())) ELSE NULL END
                        WHERE MaNV = @MaNV`);

            // Chức vụ và vai trò là cùng một phân loại actor, vì vậy phải luôn đồng bộ.
            await new sql.Request(transaction)
                .input('MaNV', sql.VarChar, maNV)
                .input('MaVaiTro', sql.Int, MaVaiTro)
                .query('UPDATE TaiKhoan SET MaVaiTro = @MaVaiTro WHERE MaNV = @MaNV');

            if (TrangThai === 'Nghỉ việc') {
                await new sql.Request(transaction)
                    .input('MaNV', sql.VarChar, maNV)
                    .query('UPDATE TaiKhoan SET TrangThai = 0 WHERE MaNV = @MaNV');
            }

            if (validation.saveProfile) {
                await upsertEmployeeProfile(transaction, maNV, validation.profile);
            }

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
        }

        // Ghi nhật ký
        await logAudit(pool, {
            user: req.user, req, action: 'Sửa nhân viên', table: 'NhanVien', recordId: maNV,
            content: `Cập nhật thông tin NV: ${TenNV}`
        });

        res.json({ message: 'Cập nhật nhân viên thành công' });
    } catch (error) {
        console.error(error);
        if (/UNIQUE KEY|unique index|UX_NhanVien_CCCD|UX_HoSoNhanVien_/i.test(error.message || '')) {
            return res.status(400).json({ message: uniqueEmployeeConflictMessage(error) });
        }
        res.status(500).json({ message: 'Lỗi server' });
    }
};

module.exports = {
    getEmployees,
    getAvailableEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    validateEmployeeInput,
    bindEmployeeFields
};
