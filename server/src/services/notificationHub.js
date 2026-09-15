const clients = new Set();
let seq = 0;
let flushTimer = null;
let pendingMeta = null;

const HEARTBEAT_MS = 20000;
const DEBOUNCE_MS = 320;
const QUIET = /đăng nhập|đăng xuất|đổi mật khẩu/i;
const { TRANSPORTS, resolveNotifyTransport } = require('./notifyCatalog');

const writeEvent = (res, event, data) => {
    if (!res || res.writableEnded) return false;
    try {
        if (event) res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        return true;
    } catch {
        return false;
    }
};

const drop = res => {
    if (res._flyHeartbeat) clearInterval(res._flyHeartbeat);
    clients.delete(res);
};

const subscribe = res => {
    clients.add(res);
    writeEvent(res, 'ready', {
        seq,
        at: new Date().toISOString()
    });
    res._flyHeartbeat = setInterval(() => {
        if (res.writableEnded) return drop(res);
        try { res.write(': keepalive\n\n'); } catch { drop(res); }
    }, HEARTBEAT_MS);
    res.on('close', () => drop(res));
    res.on('error', () => drop(res));
};

const flush = () => {
    flushTimer = null;
    const meta = pendingMeta || {};
    pendingMeta = null;
    const payload = {
        seq: ++seq,
        at: new Date().toISOString(),
        action: meta.action || '',
        table: meta.table || ''
    };
    const transport = resolveNotifyTransport();
    if (transport === TRANSPORTS.SSE || transport === TRANSPORTS.BOTH) {
        for (const res of [...clients]) {
            if (!writeEvent(res, 'inbox', payload)) drop(res);
        }
    }
    if (transport === TRANSPORTS.SOCKET || transport === TRANSPORTS.BOTH) {
        try {
            const rooms = meta.broadcast ? undefined : [...(meta.rooms || [])];
            if (meta.broadcast || rooms.length) {
                require('./notifyService').emitInboxRefresh({ ...payload, rooms });
            }
        } catch { /* Socket lỗi/không có dependency không được ảnh hưởng SSE/REST */ }
    }
    try {
        const telegramNotify = require('./telegramNotify');
        telegramNotify.notifySafely(() => telegramNotify.onInboxChanged({
            action: meta.action,
            table: meta.table,
            recordId: meta.recordId
        }));
    } catch { /* bot lỗi không ảnh hưởng chuông desktop */ }
};

const notifyInboxChanged = (meta = {}) => {
    const action = String(meta.action || '');
    if (action && QUIET.test(action)) return;
    const targetedRooms = Array.isArray(meta.rooms)
        ? meta.rooms.map(room => String(room || '').trim()).filter(Boolean)
        : meta.room ? [String(meta.room).trim()].filter(Boolean) : null;
    if (!pendingMeta) {
        pendingMeta = {
            action: meta.action || '',
            table: meta.table || '',
            recordId: meta.recordId || '',
            broadcast: targetedRooms == null,
            rooms: new Set(targetedRooms || [])
        };
    } else {
        pendingMeta.action = meta.action || pendingMeta.action;
        pendingMeta.table = meta.table || pendingMeta.table;
        pendingMeta.recordId = meta.recordId || pendingMeta.recordId;
        if (targetedRooms == null) pendingMeta.broadcast = true;
        for (const room of targetedRooms || []) pendingMeta.rooms.add(room);
    }
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, DEBOUNCE_MS);
};

module.exports = { subscribe, notifyInboxChanged };
