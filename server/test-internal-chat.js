'use strict';

require('./src/config/loadEnv').loadEnv();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const {
    ROOM_MATRIX, canRoleEnter, roomsForRole, scanMessage, unreadFromWatermark, SOFT_TWELVE
} = require('./src/services/chatPolicy');
const chatHub = require('./src/services/chatHub');
const { consumeChatRate, resetChatRateForTests } = require('./src/services/chatService');

const test = async (name, run) => {
    await run();
    console.log(`✓ ${name}`);
};

const fakeRes = () => {
    const chunks = [];
    const res = {
        writableEnded: false,
        chunks,
        write(text) { chunks.push(String(text)); return true; },
        end() { this.writableEnded = true; },
        on() { return this; },
        text() { return chunks.join(''); }
    };
    return res;
};

const runUnit = async () => {
    await test('Ma trận: TK vào #mua-hàng, MH vào #kho, TN không vào #kế-toán', () => {
        assert.equal(canRoleEnter('Thủ kho', 'mua-hang'), true);
        assert.equal(canRoleEnter('Nhân viên mua hàng', 'kho'), true);
        assert.equal(canRoleEnter('Thu ngân', 'ke-toan'), false);
        assert.equal(canRoleEnter('Thu ngân', 'kho'), false);
        assert.equal(canRoleEnter('Kế toán', 'kho'), false);
        assert.equal(canRoleEnter('Quản lý', 'quan-ly'), true);
        assert.deepEqual(ROOM_MATRIX.kho, ['Quản lý', 'Thủ kho', 'Nhân viên mua hàng']);
        assert.deepEqual(ROOM_MATRIX['mua-hang'], ['Quản lý', 'Nhân viên mua hàng', 'Thủ kho']);
        const cashierRooms = roomsForRole('Thu ngân').map((room) => room.Khoa).sort();
        assert.deepEqual(cashierRooms, ['cua-hang', 'thu-ngan']);
        const keeperRooms = roomsForRole('Thủ kho').map((room) => room.Khoa).sort();
        assert.ok(keeperRooms.includes('mua-hang'));
        assert.ok(keeperRooms.includes('kho'));
        assert.ok(!keeperRooms.includes('ke-toan'));
    });

    await test('CCCD: 12 số không 400; CCCD+số thì chặn; mật khẩu 400', () => {
        const soft = scanMessage('Mã tham chiếu 001200009999 đã nhận.');
        assert.equal(soft.block, false);
        assert.match(soft.warning, /12 chữ số/);
        assert.match(SOFT_TWELVE, /guardrail/i);
        const hard = scanMessage('CCCD 001200009999 của nhân viên');
        assert.equal(hard.block, true);
        assert.equal(hard.status, 400);
        assert.match(hard.message, /CCCD/i);
        const cmnd = scanMessage('CMND 012345678901');
        assert.equal(cmnd.block, true);
        const secret = scanMessage('password abc');
        assert.equal(secret.block, true);
        assert.equal(secret.status, 400);
    });

    await test('Unread watermark: MaTinCuoi < MIN tin sống vẫn đếm đúng', () => {
        const living = [
            { MaTin: 81, DaXoa: 0, MaNV_Gui: 'NV_TK01' },
            { MaTin: 82, DaXoa: 0, MaNV_Gui: 'NV_QL01' },
            { MaTin: 83, DaXoa: 1, MaNV_Gui: 'NV_TK01' }
        ];
        assert.equal(unreadFromWatermark(living, 50, 'NV_QL01'), 1);
        assert.equal(unreadFromWatermark(living, 81, 'NV_QL01'), 0);
        assert.equal(unreadFromWatermark(living, 82, 'NV_QL01'), 0);
    });

    await test('Rate 21 tin / phút → 429', () => {
        resetChatRateForTests();
        for (let i = 0; i < 20; i += 1) consumeChatRate('NV_RATE');
        assert.throws(() => consumeChatRate('NV_RATE'), (error) => error.status === 429);
        resetChatRateForTests();
    });

    await test('SSE hub: 2 subscriber 2 user — chỉ thành viên phòng nhận chat', async () => {
        chatHub.resetChatHubForTests();
        const tk = fakeRes();
        const tn = fakeRes();
        chatHub.subscribe(tk, { MaNV: 'NV_TK01' });
        chatHub.subscribe(tn, { MaNV: 'NV_TN01' });
        assert.equal(chatHub.subscriberCount('NV_TK01'), 1);
        assert.equal(chatHub.subscriberCount('NV_TN01'), 1);
        await chatHub.notifyChat({ maPhong: 'CH_KHO', maTin: 9, memberIds: ['NV_TK01', 'NV_QL01'] });
        assert.match(tk.text(), /event: chat/);
        assert.match(tk.text(), /CH_KHO/);
        assert.doesNotMatch(tn.text(), /CH_KHO/);
        chatHub.resetChatHubForTests();
    });

    await test('Grep: chatHub không telegramNotify; assistantTools không PhongChat', () => {
        const hub = fs.readFileSync(path.join(__dirname, 'src/services/chatHub.js'), 'utf8');
        const tools = fs.readFileSync(path.join(__dirname, 'src/services/assistantTools.js'), 'utf8');
        const panel = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/dashboard/chat-panel.js'), 'utf8');
        const assistant = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/dashboard/assistant-panel.js'), 'utf8');
        assert.doesNotMatch(hub, /telegramNotify/);
        assert.doesNotMatch(tools, /PhongChat|TinNhan/);
        assert.match(panel, /menuInternalChat/);
        assert.doesNotMatch(panel, /menuAssistant/);
        assert.doesNotMatch(assistant, /chatDrawer|menuInternalChat/);
    });
};

const signUser = (row) => jwt.sign({
    MaTK: row.MaTK,
    MaNV: row.MaNV,
    MaVaiTro: row.MaVaiTro,
    TenVaiTro: row.TenVaiTro,
    TenNV: row.TenNV
}, process.env.JWT_SECRET || 'supermarket_fly_secret_123', { expiresIn: '1h' });

const jsonReq = (port, method, urlPath, { token = '', body } = {}) => new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {})
        }
    }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            let data = {};
            try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
            resolve({ status: res.statusCode, data });
        });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
});

const runLive = async () => {
    let pool;
    try {
        ({ poolPromise: pool } = { poolPromise: require('./src/config/db').poolPromise });
        pool = await require('./src/config/db').poolPromise;
    } catch (error) {
        console.log(`↷ Bỏ qua test live SQL: ${error.message}`);
        return;
    }
    const { sql } = require('./src/config/db');
    const { ensureChatSchema } = require('./src/services/chatSchema');
    const chatService = require('./src/services/chatService');
    await ensureChatSchema(pool);
    await chatService.syncAllMemberships(pool);

    const loadLogin = async (name) => {
        const row = await pool.request()
            .input('Ten', sql.VarChar, name)
            .query(`SELECT t.MaTK, t.MaNV, t.MaVaiTro, t.TrangThai, v.TenVaiTro, n.TenNV
                    FROM TaiKhoan t
                    JOIN VaiTro v ON v.MaVaiTro = t.MaVaiTro
                    JOIN NhanVien n ON n.MaNV = t.MaNV
                    WHERE t.TenDangNhap = @Ten`);
        if (!row.recordset.length) throw new Error(`Thiếu tài khoản seed ${name}`);
        return row.recordset[0];
    };

    const admin = await loadLogin('admin');
    const thukho = await loadLogin('thukho');
    const muahang = await loadLogin('muahang');
    const thungan = await loadLogin('thungan');
    const ketoan = await loadLogin('ketoan');

    const app = express();
    app.use(express.json());
    app.use('/api/chat', require('./src/routes/chatRoutes'));
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const tok = {
        ql: signUser(admin),
        tk: signUser(thukho),
        mh: signUser(muahang),
        tn: signUser(thungan),
        kt: signUser(ketoan)
    };

    try {
        await test('T1 Không token → GET /rooms 401', async () => {
            const res = await jsonReq(port, 'GET', '/api/chat/rooms');
            assert.equal(res.status, 401);
        });

        await test('T3/T3b/T3c/T6/T7 ma trận phòng theo vai trò', async () => {
            const tn = await jsonReq(port, 'GET', '/api/chat/rooms', { token: tok.tn });
            const tk = await jsonReq(port, 'GET', '/api/chat/rooms', { token: tok.tk });
            const mh = await jsonReq(port, 'GET', '/api/chat/rooms', { token: tok.mh });
            const kt = await jsonReq(port, 'GET', '/api/chat/rooms', { token: tok.kt });
            const ql = await jsonReq(port, 'GET', '/api/chat/rooms', { token: tok.ql });
            const codes = (res) => (res.data.items || []).map((item) => item.maPhong);
            assert.ok(!codes(tn).includes('CH_KETOAN'));
            assert.ok(codes(tk).includes('CH_MUAHANG'));
            assert.ok(codes(mh).includes('CH_KHO'));
            assert.ok(codes(kt).includes('CH_KETOAN'));
            assert.ok(codes(kt).includes('CH_CUAHANG'));
            assert.ok(!codes(kt).includes('CH_KHO'));
            assert.equal(codes(ql).length, 6);
        });

        await test('T4/T5 TN không đọc/gửi #kế-toán → 403', async () => {
            const get = await jsonReq(port, 'GET', '/api/chat/rooms/CH_KETOAN/messages', { token: tok.tn });
            const post = await jsonReq(port, 'POST', '/api/chat/rooms/CH_KETOAN/messages', {
                token: tok.tn, body: { NoiDung: 'thử vào kế toán', TenVaiTro: 'Quản lý' }
            });
            assert.equal(get.status, 403);
            assert.equal(post.status, 403);
        });

        await test('T11 Body TenVaiTro=Quản lý không nâng quyền TN', async () => {
            const res = await jsonReq(port, 'GET', '/api/chat/rooms/CH_QUANLY/messages', {
                token: tok.tn
            });
            assert.equal(res.status, 403);
        });

        await test('T13 12 số không 400; T13b CCCD+số thì 400', async () => {
            const soft = await jsonReq(port, 'POST', '/api/chat/rooms/CH_CUAHANG/messages', {
                token: tok.tk, body: { NoiDung: 'Mã tham chiếu 881200009901 ok' }
            });
            assert.equal(soft.status, 201);
            assert.match(String(soft.data.canhBao || ''), /12 chữ số/);
            const hard = await jsonReq(port, 'POST', '/api/chat/rooms/CH_CUAHANG/messages', {
                token: tok.tk, body: { NoiDung: 'CCCD 881200009901' }
            });
            assert.equal(hard.status, 400);
            assert.match(String(hard.data.message || ''), /CCCD/i);
        });

        await test('T10 Unread watermark + TK gửi #kho QL thấy', async () => {
            const sent = await jsonReq(port, 'POST', '/api/chat/rooms/CH_KHO/messages', {
                token: tok.tk, body: { NoiDung: `TK gửi QL trên #kho ${Date.now()}` }
            });
            assert.equal(sent.status, 201);
            const unread = await jsonReq(port, 'GET', '/api/chat/unread', { token: tok.ql });
            const kho = (unread.data.phong || []).find((item) => item.maPhong === 'CH_KHO');
            assert.ok(Number(unread.data.tongChuaDoc) >= 1);
            assert.ok(kho && Number(kho.chuaDoc) >= 1);
            const read = await jsonReq(port, 'POST', '/api/chat/rooms/CH_KHO/read', {
                token: tok.ql, body: { MaTinCuoi: sent.data.maTin }
            });
            assert.equal(read.status, 200);
            const after = await jsonReq(port, 'GET', '/api/chat/unread', { token: tok.ql });
            const khoAfter = (after.data.phong || []).find((item) => item.maPhong === 'CH_KHO');
            assert.equal(Number(khoAfter?.chuaDoc || 0), 0);
        });
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
};

(async () => {
    await runUnit();
    await runLive();
    console.log('internal chat P5-MIN tests ok');
    process.exit(0);
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
