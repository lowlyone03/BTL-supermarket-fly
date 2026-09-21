'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FILE_PATH = path.resolve(__dirname, '..', '..', 'data', 'maintenance.json');

const emptyState = () => ({
    enabled: false,
    reason: '',
    enabledAt: null,
    enabledBy: null,
    enabledByName: ''
});

const readMaintenance = () => {
    try {
        if (!fs.existsSync(FILE_PATH)) return emptyState();
        const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
        return {
            ...emptyState(),
            enabled: Boolean(raw.enabled),
            reason: String(raw.reason || '').slice(0, 300),
            enabledAt: raw.enabledAt || null,
            enabledBy: raw.enabledBy || null,
            enabledByName: raw.enabledByName || ''
        };
    } catch {
        return emptyState();
    }
};

const writeMaintenance = (state) => {
    const dir = path.dirname(FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const next = {
        enabled: Boolean(state.enabled),
        reason: String(state.reason || '').slice(0, 300),
        enabledAt: state.enabledAt || null,
        enabledBy: state.enabledBy || null,
        enabledByName: state.enabledByName || ''
    };
    fs.writeFileSync(FILE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
};

const isPrivilegedUser = (user) => {
    if (!user) return false;
    const role = String(user.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN');
    const maNV = String(user.MaNV || '').trim().toUpperCase();
    return role === 'quản lý' || maNV === 'NV_QL01';
};

const WHITELIST = [
    { method: 'GET', test: (url) => url === '/api/health' || url.startsWith('/api/health?') },
    { method: 'POST', test: (url) => url === '/api/auth/login' || url.startsWith('/api/auth/login?') },
    { method: 'GET', test: (url) => url === '/api/auth/session' || url.startsWith('/api/auth/session?') },
    { method: null, test: (url) => url.startsWith('/api/admin/backup') || url.startsWith('/api/admin/restore') || url.startsWith('/api/admin/maintenance') },
    { method: null, test: (url) => url.startsWith('/api/payments/gateway') }
];

const isWhitelisted = (req) => {
    const url = String(req.originalUrl || req.url || '').split('#')[0];
    const method = String(req.method || 'GET').toUpperCase();
    return WHITELIST.some((rule) => (!rule.method || rule.method === method) && rule.test(url));
};

module.exports = {
    FILE_PATH,
    readMaintenance,
    writeMaintenance,
    isPrivilegedUser,
    isWhitelisted,
    emptyState
};
