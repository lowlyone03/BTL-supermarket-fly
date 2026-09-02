const { sql, poolPromise } = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { logAudit } = require('../services/auditLog');

const login = async (req, res) => {
    try {
        const { TenDangNhap, MatKhau } = req.body;

        // Validation cơ bản
        if (!TenDangNhap || !MatKhau) {
            return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập và mật khẩu!' });
        }

        const pool = await poolPromise;

        // 1. Tìm tài khoản trong Database
        const accResult = await pool.request()
            .input('TenDangNhap', sql.VarChar, TenDangNhap)
            .query(`
                SELECT t.MaTK, t.MatKhauHash, t.MaNV, t.MaVaiTro, t.TrangThai, v.TenVaiTro, n.TenNV
                FROM TaiKhoan t
                JOIN VaiTro v ON t.MaVaiTro = v.MaVaiTro
                JOIN NhanVien n ON t.MaNV = n.MaNV
                WHERE t.TenDangNhap = @TenDangNhap
            `);

        if (accResult.recordset.length === 0) {
            return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác!' });
        }

        const user = accResult.recordset[0];

        // 2. Kiểm tra tài khoản bị khóa (TrangThai = 0)
        if (user.TrangThai === 0) {
            return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản lý!' });
        }

        // 3. So sánh mật khẩu bằng bcrypt
        const isMatch = await bcrypt.compare(MatKhau, user.MatKhauHash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác!' });
        }

        // 4. Đăng nhập thành công -> Tạo Token
        const secretKey = process.env.JWT_SECRET || 'supermarket_fly_secret_123';
        const token = jwt.sign(
            { MaTK: user.MaTK, MaNV: user.MaNV, MaVaiTro: user.MaVaiTro, TenVaiTro: user.TenVaiTro },
            secretKey,
            { expiresIn: '8h' } // Token có hạn 8 tiếng (theo ca làm việc)
        );

        // 5. Cập nhật LanDangNhapCuoi
        await pool.request()
            .input('MaTK', sql.Int, user.MaTK)
            .query('UPDATE TaiKhoan SET LanDangNhapCuoi = GETDATE() WHERE MaTK = @MaTK');

        // (Tùy chọn) Thêm vào bảng NhatKy nếu cần. Giả định có bảng NhatKy:
        try {
            await logAudit(pool, {
                user: { MaTK: user.MaTK }, req,
                action: 'Đăng nhập', table: 'TaiKhoan', recordId: String(user.MaTK),
                content: `${user.TenNV} (${user.TenVaiTro}) đăng nhập thành công.`
            });
        } catch (err) {
            console.log('Lỗi ghi nhật ký đăng nhập:', err.message);
        }

        const permissionResult = await pool.request()
            .input('MaVaiTro', sql.Int, user.MaVaiTro)
            .query(`SELECT MaChucNang
                    FROM VaiTro_ChucNang
                    WHERE MaVaiTro = @MaVaiTro AND DuocPhep = 1
                    ORDER BY MaChucNang`);

        // Trả về kết quả
        res.status(200).json({
            message: 'Đăng nhập thành công!',
            token: token,
            user: {
                MaNV: user.MaNV,
                TenNV: user.TenNV,
                MaVaiTro: user.MaVaiTro,
                TenVaiTro: user.TenVaiTro,
                Quyen: permissionResult.recordset.map(item => item.MaChucNang)
            }
        });

    } catch (error) {
        console.error('Lỗi server:', error);
        res.status(500).json({ message: 'Lỗi hệ thống!' });
    }
};

// Đổi mật khẩu
const changePassword = async (req, res) => {
    try {
        const { MatKhauCu, MatKhauMoi } = req.body;
        const maTK = req.user.MaTK; // lấy từ token (verifyToken middleware)

        if (!MatKhauCu || !MatKhauMoi) {
            return res.status(400).json({ message: 'Vui lòng nhập mật khẩu cũ và mới!' });
        }

        const pool = await poolPromise;

        // Lấy thông tin TK hiện tại
        const accResult = await pool.request()
            .input('MaTK', sql.Int, maTK)
            .query('SELECT MatKhauHash, TenDangNhap FROM TaiKhoan WHERE MaTK = @MaTK');

        if (accResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Tài khoản không tồn tại!' });
        }

        const user = accResult.recordset[0];

        // So sánh mật khẩu cũ
        const isMatch = await bcrypt.compare(MatKhauCu, user.MatKhauHash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Mật khẩu cũ không chính xác!' });
        }

        // Hash mật khẩu mới
        const salt = await bcrypt.genSalt(10);
        const newHashedPassword = await bcrypt.hash(MatKhauMoi, salt);

        // Update DB
        await pool.request()
            .input('MaTK', sql.Int, maTK)
            .input('MatKhauHash', sql.VarChar, newHashedPassword)
            .query('UPDATE TaiKhoan SET MatKhauHash = @MatKhauHash WHERE MaTK = @MaTK');

        // Ghi nhật ký
        await logAudit(pool, {
            user: req.user, req, action: 'Đổi mật khẩu', table: 'TaiKhoan', recordId: String(maTK),
            severity: 'Cảnh báo', content: 'Người dùng tự đổi mật khẩu. Nhật ký không lưu mật khẩu.'
        });

        res.json({ message: 'Đổi mật khẩu thành công!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

module.exports = {
    login,
    changePassword
};
