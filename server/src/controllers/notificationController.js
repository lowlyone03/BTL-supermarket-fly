const { poolPromise } = require('../config/db');
const { subscribe } = require('../services/notificationHub');
const { listForRole, inboxHint, roleOf } = require('../services/inboxService');
const {
    normalizeNotificationKey,
    loadReadKeys,
    markRead,
    markAllRead,
    resolveOwnedNotification,
    decorateWithReadState,
    countUnread
} = require('../services/notificationReadService');
const { emitReadUpdated } = require('../services/notifyService');

const loadInboxState = async (pool, user) => {
    const rawItems = await listForRole(pool, user);
    const readKeys = await loadReadKeys(pool, user.MaNV);
    const items = decorateWithReadState(rawItems, readKeys);
    const unread = countUnread(items);
    return { items, unread };
};

const listPayload = (user, items, unread) => ({
    role: roleOf(user),
    hint: inboxHint[roleOf(user)] || 'Việc liên quan đến vai trò của bạn.',
    stamp: items.map(item => `${item.id}:${item.read ? 1 : 0}`).join('|'),
    count: items.length,
    unread,
    unreadCount: unread,
    urgent: items.filter(item => !item.read && item.tone === 'urgent').length,
    items
});

const list = async (req, res) => {
    try {
        const pool = await poolPromise;
        const { items, unread } = await loadInboxState(pool, req.user);
        res.json(listPayload(req.user, items, unread));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải thông báo.' });
    }
};

const unreadCount = async (req, res) => {
    try {
        const pool = await poolPromise;
        const { items, unread } = await loadInboxState(pool, req.user);
        res.json({
            unread,
            unreadCount: unread,
            urgent: items.filter(item => !item.read && item.tone === 'urgent').length
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải số thông báo chưa đọc.' });
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

const readOne = async (req, res) => {
    try {
        const pool = await poolPromise;
        const items = await listForRole(pool, req.user);
        const target = await resolveOwnedNotification(pool, req.user.MaNV, req.params.id, items);
        if (target.error) return res.status(target.error).json({ message: target.message });
        await markRead(pool, req.user.MaNV, target.key, {
            maNhan: target.maNhan,
            entityType: target.entityType,
            entityId: target.entityId,
            derivedKey: target.derivedKey
        });
        const readKeys = await loadReadKeys(pool, req.user.MaNV);
        const unread = countUnread(decorateWithReadState(items, readKeys));
        emitReadUpdated(req.user.MaNV, {
            ids: [target.key],
            all: false,
            unread,
            unreadCount: unread
        });
        res.json({
            message: 'Đã đánh dấu thông báo là đã đọc.',
            id: target.key,
            unread,
            unreadCount: unread
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể cập nhật trạng thái thông báo.' });
    }
};

const readAll = async (req, res) => {
    try {
        const pool = await poolPromise;
        const items = await listForRole(pool, req.user);
        const ids = items.map(item => normalizeNotificationKey(item.id)).filter(Boolean);
        await markAllRead(pool, req.user.MaNV, ids);
        emitReadUpdated(req.user.MaNV, {
            ids,
            all: true,
            unread: 0,
            unreadCount: 0
        });
        res.json({
            message: ids.length ? 'Đã đánh dấu tất cả thông báo là đã đọc.' : 'Không có thông báo chưa đọc.',
            updated: ids.length,
            unread: 0,
            unreadCount: 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể đánh dấu tất cả thông báo là đã đọc.' });
    }
};

module.exports = { list, stream, readOne, readAll, unreadCount, loadInboxState };
