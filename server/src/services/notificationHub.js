const clients = new Set();
let seq = 0;
let flushTimer = null;
let pendingMeta = null;

const HEARTBEAT_MS = 20000;
const DEBOUNCE_MS = 320;
const QUIET = /đăng nhập|đăng xuất|đổi mật khẩu/i;

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
    for (const res of [...clients]) {
        if (!writeEvent(res, 'inbox', payload)) drop(res);
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
    pendingMeta = { action: meta.action || '', table: meta.table || '', recordId: meta.recordId || '' };
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, DEBOUNCE_MS);
};

module.exports = { subscribe, notifyInboxChanged };
