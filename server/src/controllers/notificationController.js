const { poolPromise } = require('../config/db');
const { subscribe } = require('../services/notificationHub');
const { listForRole, inboxHint, roleOf } = require('../services/inboxService');

const list = async (req, res) => {
    try {
        const pool = await poolPromise;
        const items = await listForRole(pool, req.user);
        const stamp = items.map(item => item.id).join('|');
        res.json({
            role: roleOf(req.user),
            hint: inboxHint[roleOf(req.user)] || 'Việc liên quan đến vai trò của bạn.',
            stamp,
            count: items.length,
            urgent: items.filter(item => item.tone === 'urgent').length,
            items
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải thông báo.' });
    }
};

const stream = (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (!res.getHeader('Access-Control-Allow-Origin')) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    }
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write('retry: 2000\n\n');
    subscribe(res);
};

module.exports = { list, stream };
