'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { EventEmitter } = require('node:events');
let createClient = null;
try {
    ({ io: createClient } = require('../desktop/node_modules/socket.io-client'));
} catch {
    // Server-only installs still run mocked dual-attach coverage.
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class FakeIo {
    constructor(options) {
        this.options = options;
        this.middlewares = [];
        this.handlers = new Map();
        this.attachCalls = [];
        this.emissions = [];
    }

    use(handler) {
        this.middlewares.push(handler);
    }

    on(event, handler) {
        const handlers = this.handlers.get(event) || [];
        handlers.push(handler);
        this.handlers.set(event, handlers);
    }

    attach(server) {
        this.attachCalls.push(server);
    }

    to(rooms) {
        return {
            emit: (event, payload) => this.emissions.push({ rooms, event, payload })
        };
    }

    removeAllListeners() {
        this.handlers.clear();
    }
}

const testCatalogAndRooms = () => {
    const catalog = require('./src/services/notifyCatalog');
    assert.equal(catalog.resolveNotifyTransport({}), 'both');
    assert.equal(catalog.resolveNotifyTransport({ NOTIFY_TRANSPORT: 'SSE' }), 'sse');
    assert.equal(catalog.resolveNotifyTransport({ NOTIFY_TRANSPORT: 'invalid' }), 'both');

    const socketServer = require('./src/services/socketServer');
    assert.equal(socketServer.isSocketEnabled({}), true);
    assert.equal(socketServer.isSocketEnabled({ SOCKET_ENABLED: 'false' }), false);
    assert.deepEqual(
        socketServer.deriveRooms(
            { MaNV: ' nv_01 ', TenVaiTro: ' Quản lý ' },
            ['uc05', 'UC05', ' UC32 ']
        ),
        ['perm:UC05', 'perm:UC32', 'role:quan-ly', 'store:default', 'user:NV_01']
    );
};

const testAuthAndAttach = async () => {
    const socketServer = require('./src/services/socketServer');
    socketServer.resetSocketServerForTests();

    await assert.rejects(
        socketServer.authenticateHandshake({ handshake: { auth: {} } }, {}),
        error => error.code === 'TOKEN_MISSING'
    );

    const identity = await socketServer.authenticateHandshake({
        handshake: { auth: { token: 'jwt-in-auth-not-query' } }
    }, {
        verifyToken: token => {
            assert.equal(token, 'jwt-in-auth-not-query');
            return { MaTK: 7, MaNV: 'TOKEN_NV', TenVaiTro: 'Không tin JWT' };
        },
        poolProvider: async () => ({ mocked: true }),
        accountLoader: async (_pool, decoded) => {
            assert.equal(decoded.MaTK, 7);
            return {
                MaTK: 7,
                MaNV: 'NV_QL01',
                MaVaiTro: 1,
                TenVaiTro: 'Quản lý',
                TenNV: 'Quản lý thật',
                TrangThai: 1
            };
        },
        permissionLoader: async (_pool, account) => {
            assert.equal(account.MaNV, 'NV_QL01');
            return ['UC05', 'UC32'];
        }
    });
    assert.equal(identity.user.MaNV, 'NV_QL01');
    assert.deepEqual(identity.rooms, [
        'perm:UC05',
        'perm:UC32',
        'role:quan-ly',
        'store:default',
        'user:NV_QL01'
    ]);

    await assert.rejects(
        socketServer.authenticateHandshake({
            handshake: { auth: { token: 'locked' } }
        }, {
            verifyToken: () => ({ MaTK: 9, MaNV: 'NV_LOCKED' }),
            poolProvider: async () => ({}),
            accountLoader: async () => {
                const error = new Error('Tài khoản đã bị khóa.');
                error.code = 'ACCOUNT_DISABLED';
                throw error;
            }
        }),
        error => error.code === 'ACCOUNT_DISABLED'
    );

    const authDependencies = {
        verifyToken: () => ({ MaTK: 7, MaNV: 'NV_QL01' }),
        poolProvider: async () => ({}),
        accountLoader: async () => ({
            MaTK: 7,
            MaNV: 'NV_QL01',
            MaVaiTro: 1,
            TenVaiTro: 'Quản lý',
            TenNV: 'QL'
        }),
        permissionLoader: async () => ['UC05']
    };
    const io = socketServer.initSocketServer({ ServerClass: FakeIo, authDependencies });
    assert.equal(socketServer.initSocketServer({ ServerClass: FakeIo }), io);
    assert.equal(io.handlers.get('connection').length, 1);

    const httpA = {};
    const httpB = {};
    assert.equal(socketServer.attachSocketServer(httpA), true);
    assert.equal(socketServer.attachSocketServer(httpA), true);
    assert.equal(socketServer.attachSocketServer(httpB), true);
    assert.deepEqual(io.attachCalls, [httpA, httpB]);

    const fakeSocket = {
        handshake: { auth: { token: 'ok' } },
        data: {},
        joined: [],
        sent: [],
        join(rooms) {
            this.joined.push(...rooms);
        },
        emit(event, payload) {
            this.sent.push({ event, payload });
        },
        disconnect() {
            throw new Error('Valid socket must not disconnect.');
        }
    };
    await new Promise((resolve, reject) => io.middlewares[0](fakeSocket, error => error ? reject(error) : resolve()));
    io.handlers.get('connection')[0](fakeSocket);
    await wait(0);
    assert.deepEqual(fakeSocket.joined, fakeSocket.data.flyRooms);
    assert.equal(fakeSocket.sent[0].event, 'notification:probe');

    const notifyService = require('./src/services/notifyService');
    assert.equal(notifyService.emitInboxRefresh({ seq: 2, rooms: ['perm:UC05'] }), true);
    assert.equal(io.emissions[0].event, 'notification:inbox-refresh');
    assert.deepEqual(io.emissions[0].rooms, ['perm:UC05']);

    socketServer.resetSocketServerForTests();
    assert.equal(notifyService.emitInboxRefresh({ seq: 3 }), false);
};

const testSchemaEnsureIsIdempotent = async () => {
    const { ensureNotifySchema, resetNotifySchemaForTests } = require('./src/services/notifySchema');
    resetNotifySchemaForTests();
    const statements = [];
    const connection = {
        request: () => ({
            query: async text => {
                statements.push(text);
                return { recordset: [] };
            }
        })
    };
    await ensureNotifySchema(connection);
    const firstCount = statements.length;
    await ensureNotifySchema(connection);
    assert.equal(statements.length, firstCount);
    assert.match(statements.join('\n'), /ThongBaoDaDoc/);
    assert.match(statements.join('\n'), /ThongBaoSuKien/);
    assert.match(statements.join('\n'), /ThongBaoNguoiNhan/);
    assert.match(statements.join('\n'), /UX_ThongBaoSuKien_Idempotency/);
    assert.match(statements.join('\n'), /FK_ThongBaoNguoiNhan_NhanVien/);
};

const testRealDualHttpAttachment = async () => {
    if (!createClient) return;
    const socketServer = require('./src/services/socketServer');
    socketServer.resetSocketServerForTests();
    const authDependencies = {
        verifyToken: token => ({ MaTK: token === 'a' ? 1 : 2, MaNV: 'NV_DUAL' }),
        poolProvider: async () => ({}),
        accountLoader: async (_pool, decoded) => ({
            MaTK: decoded.MaTK,
            MaNV: decoded.MaNV,
            MaVaiTro: 1,
            TenVaiTro: 'Quản lý',
            TenNV: 'Dual listener'
        }),
        permissionLoader: async () => ['UC05']
    };
    const serverA = http.createServer((_req, res) => res.end('A'));
    const serverB = http.createServer((_req, res) => res.end('B'));
    const io = socketServer.initSocketServer({ authDependencies });
    socketServer.attachSocketServer(serverA);
    socketServer.attachSocketServer(serverB);
    await Promise.all([
        new Promise(resolve => serverA.listen(0, '127.0.0.1', resolve)),
        new Promise(resolve => serverB.listen(0, '127.0.0.1', resolve))
    ]);

    const connect = (server, token) => new Promise((resolve, reject) => {
        const client = createClient(`http://127.0.0.1:${server.address().port}`, {
            auth: { token },
            forceNew: true,
            reconnection: false,
            timeout: 3000
        });
        const timer = setTimeout(() => {
            client.disconnect();
            reject(new Error('Dual-listener Socket.IO probe timed out.'));
        }, 5000);
        client.once('connect_error', error => {
            clearTimeout(timer);
            client.disconnect();
            reject(error);
        });
        client.once('notification:probe', payload => {
            clearTimeout(timer);
            resolve({ client, payload });
        });
    });

    const clients = await Promise.all([connect(serverA, 'a'), connect(serverB, 'b')]);
    assert.equal(io.of('/').adapter.rooms.get('user:NV_DUAL')?.size, 2);
    assert.ok(clients.every(item => item.payload.transport === 'both'));
    clients.forEach(item => item.client.disconnect());
    await Promise.all([
        new Promise(resolve => serverA.close(resolve)),
        new Promise(resolve => serverB.close(resolve))
    ]);
    socketServer.resetSocketServerForTests();
};

const testHubTransportAndSseRegression = async () => {
    const socketPayloads = [];
    const telegramPayloads = [];
    const notifyServicePath = require.resolve('./src/services/notifyService');
    const telegramPath = require.resolve('./src/services/telegramNotify');
    require.cache[notifyServicePath] = {
        id: notifyServicePath,
        filename: notifyServicePath,
        loaded: true,
        exports: { emitInboxRefresh: payload => socketPayloads.push(payload) }
    };
    require.cache[telegramPath] = {
        id: telegramPath,
        filename: telegramPath,
        loaded: true,
        exports: {
            notifySafely: fn => fn(),
            onInboxChanged: payload => telegramPayloads.push(payload)
        }
    };
    delete require.cache[require.resolve('./src/services/notificationHub')];
    const hub = require('./src/services/notificationHub');
    const response = new EventEmitter();
    response.writableEnded = false;
    response.writes = [];
    response.write = chunk => {
        response.writes.push(chunk);
        return true;
    };
    hub.subscribe(response);

    process.env.NOTIFY_TRANSPORT = 'both';
    hub.notifyInboxChanged({ action: 'Gửi duyệt', table: 'DonMuaHang', recordId: 'PO1' });
    assert.equal(response.writes.some(value => /event: inbox/.test(value)), false, 'keeps 320ms debounce');
    await wait(360);
    assert.equal(response.writes.filter(value => /event: inbox/.test(value)).length, 1);
    assert.equal(socketPayloads.length, 1);
    assert.equal(telegramPayloads.length, 1);

    process.env.NOTIFY_TRANSPORT = 'socket';
    hub.notifyInboxChanged({ action: 'Duyệt', table: 'DonMuaHang', recordId: 'PO1' });
    await wait(360);
    assert.equal(response.writes.filter(value => /event: inbox/.test(value)).length, 1);
    assert.equal(socketPayloads.length, 2);
    assert.equal(telegramPayloads.length, 2, 'Telegram is not duplicated by transport mode');

    process.env.NOTIFY_TRANSPORT = 'sse';
    hub.notifyInboxChanged({ action: 'Từ chối', table: 'DonMuaHang', recordId: 'PO1' });
    await wait(360);
    assert.equal(response.writes.filter(value => /event: inbox/.test(value)).length, 2);
    assert.equal(socketPayloads.length, 2);
    assert.equal(telegramPayloads.length, 3);

    response.emit('close');
    delete process.env.NOTIFY_TRANSPORT;
};

const testRendererAndAppWiring = () => {
    const root = path.resolve(__dirname, '..');
    const renderer = fs.readFileSync(path.join(root, 'desktop', 'src', 'pages', 'dashboard', 'notify-socket.js'), 'utf8');
    const dashboard = fs.readFileSync(path.join(root, 'desktop', 'src', 'pages', 'dashboard', 'dashboard.js'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, 'src', 'app.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'desktop', 'src', 'pages', 'dashboard', 'dashboard.html'), 'utf8');
    assert.match(renderer, /auth:\s*\{\s*token:/);
    assert.doesNotMatch(renderer, /socket\.io\/\?token=|query:\s*\{\s*token/);
    assert.match(renderer, /notification:inbox-refresh/);
    assert.match(renderer, /notification:read-updated/);
    assert.match(dashboard, /onReconnect:[\s\S]*refreshInboxSoon/);
    assert.match(dashboard, /onFallback:[\s\S]*startInboxPoll/);
    assert.match(dashboard, /onReadUpdated:/);
    assert.match(dashboard, /notifications\/read-all/);
    assert.match(dashboard, /markAllInboxRead/);
    assert.match(html, /Đánh dấu tất cả đã đọc/);
    assert.match(app, /const primaryHttpServer = startHttp/);
    assert.match(app, /loopbackHttpServer = startHttp\('::1'/);
    assert.match(app, /attachSocketServer\(server\)/);
};

(async () => {
    testCatalogAndRooms();
    await testAuthAndAttach();
    await testSchemaEnsureIsIdempotent();
    await testRealDualHttpAttachment();
    await testHubTransportAndSseRegression();
    testRendererAndAppWiring();
    console.log('Socket notification foundation tests passed.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
