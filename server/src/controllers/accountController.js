const { sql, poolPromise } = require('../config/db');
const bcrypt = require('bcrypt');

// Lấy danh sách tài khoản
const getAccounts = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT t.MaTK, t.TenDangNhap, t.MaNV, t.MaVaiTro, t.TrangThai, t.NgayTao, t.LanDangNhapCuoi,
                   n.TenNV, n.ChucVu, v.TenVaiTro
            FROM TaiKhoan t
            JOIN NhanVien n ON t.MaNV = n.MaNV
            JOIN VaiTro v ON t.MaVaiTro = v.MaVaiTro
            ORDER BY t.NgayTao DESC
        `);
        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Tạo tài khoản mới
const createAccount = async (req, res) => {
    try {
        const MaNV = typeof req.body.MaNV === 'string' ? req.body.MaNV.trim() : '';
        const TenDangNhap = typeof req.body.TenDangNhap === 'string' ? req.body.TenDangNhap.trim().toLowerCase() : '';
        const MaVaiTro = Number(req.body.MaVaiTro);
        if (!MaNV || !TenDangNhap || !Number.isInteger(MaVaiTro)) {
            return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin!' });
        }
        if (!/^[a-z0-9._-]{3,50}$/.test(TenDangNhap)) {
            return res.status(400).json({ message: 'Tên đăng nhập chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.' });
        }

        const pool = await poolPromise;

        // Check nếu nhân viên đã có TK
        const checkNV = await pool.request()
            .input('MaNV', sql.VarChar, MaNV)
            .query(`SELECT n.MaNV, n.TenNV, n.ChucVu, n.TrangThai, t.MaTK,
                           v.MaVaiTro AS MaVaiTroTheoChucVu
                    FROM NhanVien n
                    LEFT JOIN TaiKhoan t ON t.MaNV = n.MaNV
                    LEFT JOIN VaiTro v ON v.TenVaiTro = n.ChucVu
                    WHERE n.MaNV = @MaNV`);
        if (checkNV.recordset.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy nhân viên!' });
        }
        if (checkNV.recordset[0].MaTK) {
            return res.status(400).json({ message: 'Nhân viên này đã có tài khoản!' });
        }
        if (checkNV.recordset[0].TrangThai !== 'Đang làm việc') {
            return res.status(400).json({ message: 'Chỉ có thể tạo tài khoản cho nhân viên đang làm việc.' });
        }
        if (Number(checkNV.recordset[0].MaVaiTroTheoChucVu) !== MaVaiTro) {
            return res.status(400).json({ message: `Vai trò phải khớp với chức vụ ${checkNV.recordset[0].ChucVu}.` });
        }

        // Check nếu tên đăng nhập bị trùng
        const checkUsername = await pool.request()
            .input('TenDangNhap', sql.VarChar, TenDangNhap)
            .query('SELECT MaTK FROM TaiKhoan WHERE TenDangNhap = @TenDangNhap');
        if (checkUsername.recordset.length > 0) {
            return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại!' });
        }

        // Tạo mật khẩu mặc định '123'
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123', salt);

        const result = await pool.request()
            .input('TenDangNhap', sql.VarChar, TenDangNhap)
            .input('MatKhauHash', sql.VarChar, hashedPassword)
            .input('MaNV', sql.VarChar, MaNV)
            .input('MaVaiTro', sql.Int, MaVaiTro)
            .input('TrangThai', sql.TinyInt, 1)
            .query(`INSERT INTO TaiKhoan (TenDangNhap, MatKhauHash, MaNV, MaVaiTro, TrangThai, NgayTao)
                    VALUES (@TenDangNhap, @MatKhauHash, @MaNV, @MaVaiTro, @TrangThai, GETDATE());
                    SELECT SCOPE_IDENTITY() AS NewMaTK;`);

        const newMaTK = result.recordset[0].NewMaTK;

        // Ghi nhật ký
        await pool.request()
            .input('MaTK', sql.Int, req.user.MaTK)
            .input('HanhDong', sql.NVarChar, 'Tạo tài khoản')
            .input('BangLienQuan', sql.NVarChar, 'TaiKhoan')
            .input('MaBanGhi', sql.VarChar, newMaTK.toString())
            .input('NoiDung', sql.NVarChar, `Tạo tài khoản ${TenDangNhap} cho nhân viên ${MaNV}`)
            .query('INSERT INTO NhatKy (MaTK, HanhDong, BangLienQuan, MaBanGhi, NoiDung, ThoiGian) VALUES (@MaTK, @HanhDong, @BangLienQuan, @MaBanGhi, @NoiDung, GETDATE())');

        res.status(201).json({ message: 'Tạo tài khoản thành công với mật khẩu mặc định là 123' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Khóa/Mở khóa tài khoản
const toggleAccountStatus = async (req, res) => {
    try {
        const { maTK } = req.params;

        // Không cho phép khóa tài khoản đang đăng nhập
        if (Number(maTK) === Number(req.user.MaTK)) {
            return res.status(400).json({ message: 'Không thể khóa tài khoản đang đăng nhập!' });
        }

        const pool = await poolPromise;

        const account = await pool.request()
            .input('MaTK', sql.Int, maTK)
            .query('SELECT TenDangNhap, TrangThai FROM TaiKhoan WHERE MaTK = @MaTK');

        if (account.recordset.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản!' });
        }

        const currentStatus = account.recordset[0].TrangThai;
        const newStatus = currentStatus === 1 ? 0 : 1;
        const username = account.recordset[0].TenDangNhap;
        const actionStr = newStatus === 1 ? 'Mở khóa' : 'Khóa';

        await pool.request()
            .input('MaTK', sql.Int, maTK)
            .input('TrangThai', sql.TinyInt, newStatus)
            .query('UPDATE TaiKhoan SET TrangThai = @TrangThai WHERE MaTK = @MaTK');

        // Ghi nhật ký
        await pool.request()
            .input('MaTK_Log', sql.Int, req.user.MaTK)
            .input('HanhDong', sql.NVarChar, `${actionStr} tài khoản`)
            .input('BangLienQuan', sql.NVarChar, 'TaiKhoan')
            .input('MaBanGhi', sql.VarChar, maTK.toString())
            .input('NoiDung', sql.NVarChar, `${actionStr} tài khoản ${username}`)
            .query('INSERT INTO NhatKy (MaTK, HanhDong, BangLienQuan, MaBanGhi, NoiDung, ThoiGian) VALUES (@MaTK_Log, @HanhDong, @BangLienQuan, @MaBanGhi, @NoiDung, GETDATE())');

        res.json({ message: `${actionStr} tài khoản thành công!` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Đặt lại mật khẩu
const resetPassword = async (req, res) => {
    try {
        const { maTK } = req.params;
        const pool = await poolPromise;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123', salt);

        const account = await pool.request()
            .input('MaTK', sql.Int, maTK)
            .query('SELECT TenDangNhap FROM TaiKhoan WHERE MaTK = @MaTK');

        if (account.recordset.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản!' });
        }

        await pool.request()
            .input('MaTK', sql.Int, maTK)
            .input('MatKhauHash', sql.VarChar, hashedPassword)
            .query('UPDATE TaiKhoan SET MatKhauHash = @MatKhauHash WHERE MaTK = @MaTK');

        // Ghi nhật ký
        await pool.request()
            .input('MaTK_Log', sql.Int, req.user.MaTK)
            .input('HanhDong', sql.NVarChar, 'Đặt lại mật khẩu')
            .input('BangLienQuan', sql.NVarChar, 'TaiKhoan')
            .input('MaBanGhi', sql.VarChar, maTK.toString())
            .input('NoiDung', sql.NVarChar, `Đặt lại mật khẩu cho tài khoản ${account.recordset[0].TenDangNhap}`)
            .query('INSERT INTO NhatKy (MaTK, HanhDong, BangLienQuan, MaBanGhi, NoiDung, ThoiGian) VALUES (@MaTK_Log, @HanhDong, @BangLienQuan, @MaBanGhi, @NoiDung, GETDATE())');

        res.json({ message: 'Đặt lại mật khẩu thành công (mặc định: 123)' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Cập nhật vai trò
const updateAccountRole = async (req, res) => {
    try {
        const { maTK } = req.params;
        const MaVaiTro = Number(req.body.MaVaiTro);

        if (!Number.isInteger(MaVaiTro)) {
            return res.status(400).json({ message: 'Vui lòng chọn vai trò!' });
        }

        // Không cho admin tự đổi vai trò của chính mình để tránh mất quyền
        if (Number(maTK) === Number(req.user.MaTK)) {
            return res.status(400).json({ message: 'Không thể tự đổi vai trò của chính mình!' });
        }

        const pool = await poolPromise;
        const role = await pool.request()
            .input('MaVaiTro', sql.Int, MaVaiTro)
            .query('SELECT TenVaiTro FROM VaiTro WHERE MaVaiTro = @MaVaiTro');
        if (role.recordset.length === 0) {
            return res.status(400).json({ message: 'Vai trò không hợp lệ!' });
        }
        if (role.recordset[0].TenVaiTro === 'Quản lý') {
            const managerCount = await pool.request()
                .input('MaTK', sql.Int, Number(maTK) || 0)
                .query(`SELECT COUNT(*) AS Total
                        FROM TaiKhoan t
                        JOIN VaiTro v ON v.MaVaiTro = t.MaVaiTro
                        WHERE v.TenVaiTro = N'Quản lý' AND t.MaTK <> @MaTK`);
            if (managerCount.recordset[0].Total > 0) {
                return res.status(400).json({ message: 'Hệ thống chỉ có một tài khoản Quản lý.' });
            }
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        let account;
        try {
            account = await new sql.Request(transaction)
                .input('MaTK', sql.Int, maTK)
                .query('SELECT MaNV FROM TaiKhoan WHERE MaTK = @MaTK');
            if (account.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ message: 'Không tìm thấy tài khoản!' });
            }

            await new sql.Request(transaction)
                .input('MaTK', sql.Int, maTK)
                .input('MaVaiTro', sql.Int, MaVaiTro)
                .query('UPDATE TaiKhoan SET MaVaiTro = @MaVaiTro WHERE MaTK = @MaTK');

            // Đồng bộ chức vụ để một nhân viên không bị gắn hai actor khác nhau.
            await new sql.Request(transaction)
                .input('MaNV', sql.VarChar, account.recordset[0].MaNV)
                .input('ChucVu', sql.NVarChar, role.recordset[0].TenVaiTro)
                .query('UPDATE NhanVien SET ChucVu = @ChucVu WHERE MaNV = @MaNV');

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        // Ghi nhật ký
        await pool.request()
            .input('MaTK_Log', sql.Int, req.user.MaTK)
            .input('HanhDong', sql.NVarChar, 'Đổi vai trò')
            .input('BangLienQuan', sql.NVarChar, 'TaiKhoan')
            .input('MaBanGhi', sql.VarChar, maTK.toString())
            .input('NoiDung', sql.NVarChar, `Cập nhật vai trò tài khoản ID ${maTK} thành ${role.recordset[0].TenVaiTro}`)
            .query('INSERT INTO NhatKy (MaTK, HanhDong, BangLienQuan, MaBanGhi, NoiDung, ThoiGian) VALUES (@MaTK_Log, @HanhDong, @BangLienQuan, @MaBanGhi, @NoiDung, GETDATE())');

        res.json({ message: 'Cập nhật vai trò thành công!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Lấy nhật ký hệ thống
const getAuditLogs = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT nk.MaNK, nk.HanhDong, nk.BangLienQuan, nk.MaBanGhi, nk.NoiDung,
                   nk.ThoiGian, t.TenDangNhap, n.TenNV
            FROM NhatKy nk
            LEFT JOIN TaiKhoan t ON nk.MaTK = t.MaTK
            LEFT JOIN NhanVien n ON t.MaNV = n.MaNV
            ORDER BY nk.ThoiGian DESC
        `);
        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

module.exports = {
    getAccounts,
    createAccount,
    toggleAccountStatus,
    resetPassword,
    updateAccountRole,
    getAuditLogs
};
