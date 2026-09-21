'use strict';

const jwt = require('jsonwebtoken');
const { readMaintenance, isPrivilegedUser, isWhitelisted } = require('../services/maintenanceService');

const jwtSecret = () => process.env.JWT_SECRET || 'supermarket_fly_secret_123';

const peekUser = (req) => {
    const authHeader = req.headers['authorization'];
    const bearer = authHeader && authHeader.split(' ')[1];
    const token = bearer || String(req.query?.token || req.query?.access_token || '');
    if (!token) return null;
    try {
        return jwt.verify(token, jwtSecret());
    } catch {
        return null;
    }
};

const maintenanceGuard = (req, res, next) => {
    const state = readMaintenance();
    if (!state.enabled) return next();
    if (isWhitelisted(req)) return next();
    const user = peekUser(req);
    if (isPrivilegedUser(user)) {
        req.user = req.user || user;
        return next();
    }
    return res.status(503).json({
        code: 'MAINTENANCE',
        overlay: true,
        message: 'Hệ thống đang bảo trì',
        reason: state.reason || 'Quản lý đang bảo trì hệ thống. Vui lòng thử lại sau.'
    });
};

module.exports = { maintenanceGuard };
