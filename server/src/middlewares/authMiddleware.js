const jwt = require('jsonwebtoken');

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

module.exports = {
    verifyToken,
    requireRole
};
