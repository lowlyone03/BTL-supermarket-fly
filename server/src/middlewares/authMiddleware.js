const jwt = require('jsonwebtoken');
const { poolPromise } = require('../config/db');
const { permissionSqlFilter, ensureEmployeePermissionSchema } = require('../services/effectivePermissions');

const JWT_SECRET = process.env.JWT_SECRET || 'supermarket_fly_secret_123';

const tokenFromRequest = req => {
    const authHeader = req.headers['authorization'];
    const bearer = authHeader && authHeader.split(' ')[1];
    if (bearer) return bearer;
    const queryToken = req.query?.token || req.query?.access_token;
    return queryToken ? String(queryToken) : '';
};

const verifyToken = (req, res, next) => {
    const token = tokenFromRequest(req);

    if (!token) {
        return res.status(401).json({ message: 'Vui lòng đăng nhập!' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!' });
        }
        req.user = decoded;
        next();
    });
};

const requireRole = (roleName) => {
    return (req, res, next) => {
        if (!req.user || req.user.TenVaiTro !== roleName) {
            return res.status(403).json({ message: 'Bạn không có quyền truy cập chức năng này!' });
        }
        next();
    };
};

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
            await ensureEmployeePermissionSchema(pool);
            const request = pool.request();
            const result = await request.query(permissionSqlFilter(request, {
                maNV: req.user.MaNV,
                maVaiTro: req.user.MaVaiTro,
                codes
            }));
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
