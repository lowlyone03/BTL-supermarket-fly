const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const { ensurePayrollSchema } = require('../services/payrollSchema');

const EMPLOYEE_STATUSES = ['Đang làm việc', 'Nghỉ việc'];

const normalizeText = value => typeof value === 'string' ? value.trim() : '';

const validateEmployeeInput = async (pool, body) => {
    const employee = {
        MaNV: normalizeText(body.MaNV).toUpperCase(),
        TenNV: normalizeText(body.TenNV),
        ChucVu: normalizeText(body.ChucVu),
        SDT: normalizeText(body.SDT) || null,
        Email: normalizeText(body.Email) || null,
        DiaChi: normalizeText(body.DiaChi) || null,
        TrangThai: normalizeText(body.TrangThai) || 'Đang làm việc'
    };

    if (!employee.TenNV || !employee.ChucVu) {
        return { error: 'Vui lòng nhập tên nhân viên và chức vụ.' };
    }
    if (!EMPLOYEE_STATUSES.includes(employee.TrangThai)) {
        return { error: 'Trạng thái nhân viên không hợp lệ.' };
    }

    const role = await pool.request()
        .input('TenVaiTro', sql.NVarChar, employee.ChucVu)
        .query('SELECT MaVaiTro FROM VaiTro WHERE TenVaiTro = @TenVaiTro');
    if (role.recordset.length === 0) {
        return { error: 'Chức vụ phải thuộc một trong 5 vai trò của hệ thống.' };
    }

    employee.MaVaiTro = role.recordset[0].MaVaiTro;
    return { employee };
};

// Lấy danh sách nhân viên
const getEmployees = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT n.*,
                   CASE WHEN t.MaTK IS NOT NULL THEN 1 ELSE 0 END AS HasAccount,
                   t.TenDangNhap
            FROM NhanVien n
            LEFT JOIN TaiKhoan t ON n.MaNV = t.MaNV
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
        const result = await pool.request().query(`
            SELECT MaNV, TenNV, ChucVu
            FROM NhanVien
            WHERE MaNV NOT IN (SELECT MaNV FROM TaiKhoan)
              AND TrangThai = N'Đang làm việc'
            ORDER BY TenNV
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
        const result = await pool.request()
            .input('MaNV', sql.VarChar, maNV)
            .query('SELECT * FROM NhanVien WHERE MaNV = @MaNV');

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
        const validation = await validateEmployeeInput(pool, req.body);
        if (validation.error) {
            return res.status(400).json({ message: validation.error });
        }
        const { MaNV, TenNV, ChucVu, SDT, Email, DiaChi, TrangThai } = validation.employee;
        if (!MaNV) {
            return res.status(400).json({ message: 'Vui lòng nhập mã nhân viên.' });
        }
        if (!/^[A-Z0-9_-]{2,20}$/.test(MaNV)) {
            return res.status(400).json({ message: 'Mã nhân viên chỉ gồm chữ in hoa, số, gạch dưới hoặc gạch ngang.' });
        }
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

        await pool.request()
            .input('MaNV', sql.VarChar, MaNV)
            .input('TenNV', sql.NVarChar, TenNV)
            .input('ChucVu', sql.NVarChar, ChucVu)
            .input('SDT', sql.VarChar, SDT || null)
            .input('Email', sql.VarChar, Email || null)
            .input('DiaChi', sql.NVarChar, DiaChi || null)
            .input('TrangThai', sql.NVarChar, TrangThai || 'Đang làm việc')
            .query(`INSERT INTO NhanVien (MaNV, TenNV, ChucVu, SDT, Email, DiaChi, TrangThai)
                    VALUES (@MaNV, @TenNV, @ChucVu, @SDT, @Email, @DiaChi, @TrangThai)`);

        // Ghi nhật ký
        await logAudit(pool, {
            user: req.user, req, action: 'Thêm nhân viên', table: 'NhanVien', recordId: MaNV,
            content: `Thêm nhân viên ${TenNV} — ${ChucVu}`
        });

        res.status(201).json({ message: 'Thêm nhân viên thành công' });
    } catch (error) {
        console.error(error);
        if (error.message.includes('UNIQUE KEY')) {
            return res.status(400).json({ message: 'Số điện thoại hoặc Email đã bị trùng!' });
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
        const validation = await validateEmployeeInput(pool, req.body);
        if (validation.error) {
            return res.status(400).json({ message: validation.error });
        }
        const { TenNV, ChucVu, SDT, Email, DiaChi, TrangThai, MaVaiTro } = validation.employee;

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
            result = await new sql.Request(transaction)
                .input('MaNV', sql.VarChar, maNV)
                .input('TenNV', sql.NVarChar, TenNV)
                .input('ChucVu', sql.NVarChar, ChucVu)
                .input('SDT', sql.VarChar, SDT)
                .input('Email', sql.VarChar, Email)
                .input('DiaChi', sql.NVarChar, DiaChi)
                .input('TrangThai', sql.NVarChar, TrangThai)
                .query(`UPDATE NhanVien
                        SET TenNV = @TenNV, ChucVu = @ChucVu, SDT = @SDT,
                            Email = @Email, DiaChi = @DiaChi, TrangThai = @TrangThai,
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
        if (error.message.includes('UNIQUE KEY')) {
            return res.status(400).json({ message: 'Số điện thoại hoặc Email đã bị trùng!' });
        }
        res.status(500).json({ message: 'Lỗi server' });
    }
};

module.exports = {
    getEmployees,
    getAvailableEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee
};
