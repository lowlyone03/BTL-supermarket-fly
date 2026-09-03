const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('../config/db');

// Middleware xác thực Token (Để dùng cho các API sau này)
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Định dạng: Bearer <token>

    if (!token) {
        return res.status(401).json({ message: 'Vui lòng đăng nhập!' });
    }

    const secretKey = process.env.JWT_SECRET || 'supermarket_fly_secret_123';
    
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!' });
        }
        req.user = decoded; // Lưu thông tin giải mã vào req để API phía sau dùng
        next();
    });
};

// Middleware kiểm tra quyền (Ví dụ: requireRole('Quản lý'))
const requireRole = (roleName) => {
    return (req, res, next) => {
        if (!req.user || req.user.TenVaiTro !== roleName) {
            return res.status(403).json({ message: 'Bạn không có quyền truy cập chức năng này!' });
        }
        next();
    };
};

// Quyền được lấy trực tiếp từ CSDL để thay đổi phân quyền có hiệu lực ở API,
// không chỉ ẩn/hiện nút trên giao diện.
const requireAnyPermission = (permissionCodes) => {
    const codes = (Array.isArray(permissionCodes) ? permissionCodes : [permissionCodes])
        .map(code => String(code || '').trim())
        .filter(Boolean);

    return async (req, res, next) => {
        try {
            if (!req.user?.MaVaiTro) {
                return res.status(403).json({ message: 'Không xác định được quyền của tài khoản.' });
            }
            if (!codes.length) {
                return res.status(403).json({ message: 'Tài khoản chưa được cấp quyền sử dụng chức năng này.' });
            }
            const pool = await poolPromise;
            const request = pool.request().input('MaVaiTro', sql.Int, req.user.MaVaiTro);
            const placeholders = codes.map((code, index) => {
                const name = `MaChucNang${index}`;
                request.input(name, sql.VarChar, code);
                return `@${name}`;
            });
            const result = await request.query(`SELECT 1 AS DuocPhep
                    FROM VaiTro_ChucNang
                    WHERE MaVaiTro = @MaVaiTro
                      AND MaChucNang IN (${placeholders.join(', ')})
                      AND DuocPhep = 1`);
            if (!result.recordset.length) {
                return res.status(403).json({ message: 'Tài khoản chưa được cấp quyền sử dụng chức năng này.' });
            }
            next();
        } catch (error) {
            console.error('Lỗi kiểm tra quyền:', error);
            res.status(500).json({ message: 'Không thể kiểm tra quyền truy cập.' });
        }
    };
};

const requirePermission = (permissionCode) => requireAnyPermission([permissionCode]);

module.exports = {
    verifyToken,
    requireRole,
    requirePermission,
    requireAnyPermission
};
