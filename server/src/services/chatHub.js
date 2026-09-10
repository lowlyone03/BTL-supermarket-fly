'use strict';

const clients = new Map();
let seq = 0;

const HEARTBEAT_MS = 20000;
const MAX_STREAMS_PER_USER = 6;

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

const drop = (res) => {
    if (!res) return;
    if (res._flyHeartbeat) clearInterval(res._flyHeartbeat);
    const maNV = res._flyMaNV;
    if (maNV && clients.has(maNV)) {
        const set = clients.get(maNV);
        set.delete(res);
        if (!set.size) clients.delete(maNV);
    }
};

const subscribe = (res, user) => {
    const maNV = String(user?.MaNV || '').trim();
    if (!maNV) return;
    res._flyMaNV = maNV;
    if (!clients.has(maNV)) clients.set(maNV, new Set());
    const set = clients.get(maNV);
    set.add(res);
    while (set.size > MAX_STREAMS_PER_USER) {
        const oldest = set.values().next().value;
        try { oldest.end(); } catch { /* ignore */ }
        drop(oldest);
    }
    writeEvent(res, 'ready', { seq, at: new Date().toISOString() });
    res._flyHeartbeat = setInterval(() => {
        if (res.writableEnded) return drop(res);
        try { res.write(': keepalive\n\n'); } catch { drop(res); }
    }, HEARTBEAT_MS);
    res.on('close', () => drop(res));
    res.on('error', () => drop(res));
};

const emitToMembers = (event, payload, memberIds) => {
    const body = { seq: ++seq, at: new Date().toISOString(), ...payload };
    for (const id of memberIds || []) {
        const set = clients.get(String(id));
        if (!set) continue;
        for (const res of [...set]) {
            if (!writeEvent(res, event, body)) drop(res);
        }
    }
    return body;
};

const notifyChat = async ({ pool, maPhong, maTin, memberIds } = {}) => {
    let ids = (memberIds || []).map((id) => String(id));
    if (!ids.length && pool) {
        const { sql } = require('../config/db');
        const result = await pool.request()
            .input('MaPhong', sql.VarChar, String(maPhong || ''))
            .query(`SELECT MaNV FROM dbo.ThanhVienPhongChat
                    WHERE MaPhong = @MaPhong AND AnKhoiPhong = 0`);
        ids = result.recordset.map((row) => String(row.MaNV));
    }
    const chat = emitToMembers('chat', { maPhong, maTin: Number(maTin) || 0 }, ids);
    emitToMembers('unread', { maPhong, maTin: Number(maTin) || 0 }, ids);
    return chat;
};

const notifyRoomsChanged = (memberIds) => emitToMembers('room', {}, memberIds);

const subscriberCount = (maNV) => (clients.get(String(maNV || '')) || new Set()).size;

const resetChatHubForTests = () => {
    for (const set of clients.values()) {
        for (const res of [...set]) drop(res);
    }
    clients.clear();
    seq = 0;
};

module.exports = {
    subscribe,
    notifyChat,
    notifyRoomsChanged,
    subscriberCount,
    resetChatHubForTests
};
