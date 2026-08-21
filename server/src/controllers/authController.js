const { sql, poolPromise } = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

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
                SELECT t.MaTK, t.MatKhau, t.MaNV, t.MaVaiTro, t.TrangThai, v.TenVaiTro, n.TenNV 
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
        const isMatch = await bcrypt.compare(MatKhau, user.MatKhau);
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
            await pool.request()
                .input('MaTK', sql.Int, user.MaTK)
                .input('HanhDong', sql.NVarChar, 'Đăng nhập')
                .query('INSERT INTO NhatKy (MaTK, HanhDong, ThoiGian) VALUES (@MaTK, @HanhDong, GETDATE())');
        } catch (err) {
            console.log('Lỗi ghi nhật ký (Có thể bảng NhatKy chưa đúng cấu trúc):', err.message);
        }

        // Trả về kết quả
        res.status(200).json({
            message: 'Đăng nhập thành công!',
            token: token,
            user: {
                MaNV: user.MaNV,
                TenNV: user.TenNV,
                TenVaiTro: user.TenVaiTro
            }
        });

    } catch (error) {
        console.error('Lỗi server:', error);
        res.status(500).json({ message: 'Lỗi hệ thống!' });
    }
};

module.exports = {
    login
};
