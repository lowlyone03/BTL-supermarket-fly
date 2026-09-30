'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readService = require('./src/services/notificationReadService');
const notifyService = require('./src/services/notifyService');

const ROOT = path.resolve(__dirname, '..');
const SQL = { VarChar: 'VarChar', NVarChar: 'NVarChar', BigInt: 'BigInt' };
const noopSchema = async () => {};

class FakeIo {
    constructor() {
        this.emissions = [];
    }

    use() {}
    on() {}
    attach() {}
    to(rooms) {
        return {
            emit: (event, payload) => this.emissions.push({ rooms, event, payload })
        };
    }
    removeAllListeners() {}
}

const createFakeConnection = (handler = () => ({ recordset: [] })) => {
    const statements = [];
    return {
        statements,
        request() {
            const inputs = {};
            return {
                input(name, _type, value) {
                    inputs[name] = value;
                    return this;
                },
                async query(text) {
                    const entry = { text, inputs: { ...inputs } };
                    statements.push(entry);
                    return handler(entry, statements) || { recordset: [] };
                }
            };
        }
    };
};

const deps = extra => ({
    sql: SQL,
    ensureSchema: noopSchema,
    ...extra
});

const mockRes = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(data) {
        this.body = data;
        return this;
    }
});

const restoreCache = originals => {
    for (const [filePath, prior] of originals) {
        if (prior) require.cache[filePath] = prior;
        else delete require.cache[filePath];
    }
};

const testIdentityAndDecorate = () => {
    assert.equal(readService.parseInboxIdentity('po:PO01').entityType, 'DonMuaHang');
    assert.equal(readService.parseInboxIdentity('po:PO01').entityId, 'PO01');
    assert.equal(readService.parseInboxIdentity('42').maNhan, 42);
    const items = readService.decorateWithReadState([
        { id: 'po:PO01', title: 'A' },
        { id: 'po:PO02', title: 'B' }
    ], new Set(['po:PO01']));
    assert.equal(items[0].read, true);
    assert.equal(items[1].read, false);
    assert.equal(readService.countUnread(items), 1);
};

const testReadOneTouchesOnlyThatRecipient = async () => {
    const connection = createFakeConnection();
    await readService.markRead(connection, 'NV_A', 'po:PO01', {}, deps());
    assert.equal(connection.statements.length, 2);
    const insert = connection.statements[0];
    const update = connection.statements[1];
    assert.match(insert.text, /ThongBaoDaDoc/);
    assert.equal(insert.inputs.MaNV, 'NV_A');
    assert.deepEqual(JSON.parse(insert.inputs.KeysJson), ['po:PO01']);
    assert.doesNotMatch(insert.inputs.KeysJson, /PO02|NV_B/);
    assert.match(update.text, /ThongBaoNguoiNhan/);
    assert.match(update.text, /MaNV=@MaNV/);
    assert.equal(update.inputs.MaNV, 'NV_A');
    assert.equal(update.inputs.EntityType, 'DonMuaHang');
    assert.equal(update.inputs.EntityId, 'PO01');
    assert.equal(update.inputs.MaNV === 'NV_B', false);
};

const testReadAllDoesNotTouchOtherEmployee = async () => {
    const connection = createFakeConnection();
    const keys = await readService.markAllRead(connection, 'NV_A', ['po:PO01', 'px:PX02'], deps());
    assert.deepEqual(keys, ['po:PO01', 'px:PX02']);
    assert.equal(connection.statements.length, 1);
    const batch = connection.statements[0];
    assert.equal(batch.inputs.MaNV, 'NV_A');
    assert.notEqual(batch.inputs.MaNV, 'NV_B');
    assert.match(batch.text, /BEGIN TRAN/);
    assert.match(batch.text, /ThongBaoDaDoc/);
    assert.match(batch.text, /UPDATE dbo\.ThongBaoNguoiNhan/);
    assert.match(batch.text, /MaNV=@MaNV/);
    assert.match(batch.text, /DaDoc=0/);
    assert.match(batch.text, /COMMIT/);
    assert.doesNotMatch(batch.text, /NV_B/);
    assert.deepEqual(JSON.parse(batch.inputs.KeysJson), ['po:PO01', 'px:PX02']);
};

const testHistoryStillListableAfterReadAll = () => {
    const raw = [
        { id: 'po:PO01', title: 'Đơn 1' },
        { id: 'po:PO02', title: 'Đơn 2' }
    ];
    const after = readService.decorateWithReadState(raw, new Set(['po:PO01', 'po:PO02']));
    assert.equal(after.length, 2);
    assert.equal(readService.countUnread(after), 0);
    assert.ok(after.every(item => item.read && item.title));
};

const testUnauthorizedRecipientIsForbidden = async () => {
    const connection = createFakeConnection(entry => {
        if (/ThongBaoNguoiNhan n/.test(entry.text) && /MaNhan=@MaNhan/.test(entry.text)) {
            return { recordset: [{ MaNhan: 9, MaNV: 'NV_B', DaDoc: false, EntityType: 'DonMuaHang', EntityId: 'PO99' }] };
        }
        return { recordset: [] };
    });
    const denied = await readService.resolveOwnedNotification(connection, 'NV_A', '9', [], deps());
    assert.equal(denied.error, 403);
    const missing = await readService.resolveOwnedNotification(connection, 'NV_A', 'po:NOT_MINE', [], deps());
    assert.equal(missing.error, 404);
    const invalid = await readService.resolveOwnedNotification(connection, 'NV_A', '   ', [], deps());
    assert.equal(invalid.error, 400);
};

const testOwnedInboxItemAndRecipient = async () => {
    const inbox = [{ id: 'dn:DN01', title: 'Đề nghị' }];
    const ownedInbox = await readService.resolveOwnedNotification({}, 'NV_A', 'dn:DN01', inbox, deps());
    assert.equal(ownedInbox.error, undefined);
    assert.equal(ownedInbox.source, 'inbox');
    assert.equal(ownedInbox.entityType, 'DeNghiMuaHang');

    const connection = createFakeConnection(() => ({
        recordset: [{ MaNhan: 12, MaNV: 'NV_A', DaDoc: false, EntityType: 'DonMuaHang', EntityId: 'PO12' }]
    }));
    const ownedRow = await readService.resolveOwnedNotification(connection, 'NV_A', '12', [], deps());
    assert.equal(ownedRow.source, 'recipient');
    assert.equal(ownedRow.maNhan, 12);
    assert.equal(ownedRow.derivedKey, 'po:PO12');
};

const testReportNoticeLinksToReportEntity = async () => {
    const inbox = [{ id: 'pnl:78', title: 'Báo cáo Thủ kho', entityType: 'BaoCaoNop', entityId: 'BCK20260909001' }];
    const owned = await readService.resolveOwnedNotification({}, 'NV_A', 'pnl:78', inbox, deps());
    assert.equal(owned.entityType, 'BaoCaoNop');
    assert.equal(owned.entityId, 'BCK20260909001');
    assert.equal(owned.derivedKey, 'bc:BCK20260909001');
};

const testViewingReportMarksOnlyViewer = async () => {
    const { markReportViewed, markSubmittedReportViewed } = require('./src/services/reportInboxRead');
    const connection = createFakeConnection(entry => (/FROM ThongBaoCuaHang/.test(entry.text)
        ? { recordset: [{ MaTB: 78 }, { MaTB: 81 }] }
        : { recordset: [] }));
    const ids = await markReportViewed(connection, 'NV_A', 'BCK20260909001', deps());
    assert.deepEqual(ids, ['bc:BCK20260909001', 'pnl:78', 'pnl:81']);
    const lookup = connection.statements[0];
    assert.equal(lookup.inputs.MaNV, 'NV_A');
    assert.equal(lookup.inputs.MaBC, '%BCK20260909001%');
    const savedKeys = connection.statements
        .filter(entry => /INSERT dbo\.ThongBaoDaDoc/.test(entry.text))
        .flatMap(entry => JSON.parse(entry.inputs.KeysJson));
    assert.deepEqual(savedKeys.sort(), ['bc:BCK20260909001', 'pnl:78', 'pnl:81']);
    const update = connection.statements.find(entry => /UPDATE n/.test(entry.text));
    assert.equal(update.inputs.EntityType, 'BaoCaoNop');
    assert.equal(update.inputs.EntityId, 'BCK20260909001');
    assert.ok(connection.statements.every(entry => entry.inputs.MaNV === undefined || entry.inputs.MaNV === 'NV_A'));

    const emitted = [];
    const skipped = await markSubmittedReportViewed(createFakeConnection(), { MaNV: 'NV_TK', TenVaiTro: 'Thủ kho' },
        'BCK20260909001', deps({ emitReadUpdated: (...args) => emitted.push(args) }));
    assert.deepEqual(skipped, []);
    assert.equal(emitted.length, 0);
};

const loadController = extras => {
    const originals = [];
    const stub = (relative, exports) => {
        const filePath = require.resolve(relative);
        originals.push([filePath, require.cache[filePath]]);
        require.cache[filePath] = {
            id: filePath,
            filename: filePath,
            loaded: true,
            exports
        };
    };
    const marked = [];
    const emitted = [];
    const readKeys = extras.readKeys || new Set();
    stub('./src/config/db', { poolPromise: Promise.resolve({ fake: true }), sql: SQL });
    stub('./src/services/notificationHub', { subscribe() {} });
    stub('./src/services/inboxService', {
        listForRole: extras.listForRole || (async () => extras.items || []),
        inboxHint: { 'Quản lý': 'hint' },
        roleOf: user => user.TenVaiTro
    });
    stub('./src/services/notificationReadService', {
        ...readService,
        loadReadKeys: async () => readKeys,
        markRead: async (_pool, maNV, key, options) => {
            marked.push({ maNV, key, options, mode: 'one' });
            readKeys.add(key);
            return key;
        },
        markAllRead: async (_pool, maNV, ids) => {
            marked.push({ maNV, ids, mode: 'all' });
            ids.forEach(id => readKeys.add(id));
            return ids;
        },
        resolveOwnedNotification: extras.resolveOwnedNotification || readService.resolveOwnedNotification
    });
    stub('./src/services/notifyService', {
        emitReadUpdated: (maNV, payload) => {
            emitted.push({ maNV, payload, room: `user:${String(maNV).toUpperCase()}` });
            return true;
        }
    });
    const controllerPath = require.resolve('./src/controllers/notificationController');
    originals.push([controllerPath, require.cache[controllerPath]]);
    delete require.cache[controllerPath];
    const controller = require('./src/controllers/notificationController');
    return { controller, marked, emitted, originals, readKeys };
};

const testControllerReadAndUnreadCount = async () => {
    const items = [
        { id: 'po:PO01', title: 'Đơn 1', tone: 'info' },
        { id: 'po:PO02', title: 'Đơn 2', tone: 'urgent' }
    ];
    const loaded = loadController({ items, readKeys: new Set() });
    try {
        const user = { MaNV: 'NV_A', TenVaiTro: 'Quản lý' };
        const listRes = mockRes();
        await loaded.controller.list({ user }, listRes);
        assert.equal(listRes.body.unreadCount, 2);
        assert.equal(listRes.body.items.length, 2);
        assert.equal(listRes.body.items.every(item => item.read === false), true);

        const readRes = mockRes();
        loaded.readKeys.clear();
        await loaded.controller.readOne({ user, params: { id: 'po:PO01' } }, readRes);
        assert.equal(readRes.body.unreadCount, 1);
        assert.equal(loaded.marked[0].key, 'po:PO01');
        assert.equal(loaded.marked[0].maNV, 'NV_A');
        assert.deepEqual(loaded.emitted[0].room, 'user:NV_A');
        assert.equal(loaded.emitted[0].payload.all, false);

        const allRes = mockRes();
        await loaded.controller.readAll({ user }, allRes);
        assert.equal(allRes.body.unreadCount, 0);
        assert.equal(loaded.emitted[1].payload.all, true);
        assert.equal(loaded.emitted[1].room, 'user:NV_A');

        const countRes = mockRes();
        await loaded.controller.unreadCount({ user }, countRes);
        assert.equal(countRes.body.unreadCount, 0);

        const history = readService.decorateWithReadState(items, loaded.readKeys);
        assert.equal(history.length, 2);
        assert.equal(readService.countUnread(history), 0);
    } finally {
        restoreCache(loaded.originals);
    }
};

const testControllerRejectsForeignId = async () => {
    const loaded = loadController({
        items: [{ id: 'po:MINE', title: 'Của tôi' }],
        resolveOwnedNotification: async () => ({
            error: 403,
            message: 'Bạn không thể đánh dấu thông báo của nhân viên khác.'
        })
    });
    try {
        const res = mockRes();
        await loaded.controller.readOne({ user: { MaNV: 'NV_A', TenVaiTro: 'Quản lý' }, params: { id: '99' } }, res);
        assert.equal(res.statusCode, 403);
        assert.equal(loaded.marked.length, 0);
        assert.equal(loaded.emitted.length, 0);
    } finally {
        restoreCache(loaded.originals);
    }
};

const testSocketReadUpdatedIsUserScoped = () => {
    const socketServer = require('./src/services/socketServer');
    socketServer.resetSocketServerForTests();
    const io = socketServer.initSocketServer({
        ServerClass: FakeIo,
        authDependencies: {
            verifyToken: () => ({ MaTK: 1, MaNV: 'NV_A' }),
            poolProvider: async () => ({}),
            accountLoader: async () => ({ MaTK: 1, MaNV: 'NV_A', MaVaiTro: 1, TenVaiTro: 'Quản lý', TenNV: 'A' }),
            permissionLoader: async () => ['UC05']
        }
    });
    notifyService.emitReadUpdated('nv_a', { ids: ['po:PO01'], all: false, unread: 1, unreadCount: 1 });
    notifyService.emitInboxRefresh({ rooms: ['store:default', 'perm:UC05'] });
    assert.equal(io.emissions[0].event, 'notification:read-updated');
    assert.deepEqual(io.emissions[0].rooms, ['user:NV_A']);
    assert.notDeepEqual(io.emissions[0].rooms, ['store:default']);
    assert.ok(!io.emissions.some(item => item.event === 'notification:read-updated' && String(item.rooms).includes('store:')));
    socketServer.resetSocketServerForTests();
};

const testUiContract = () => {
    const html = fs.readFileSync(path.join(ROOT, 'desktop', 'src', 'pages', 'dashboard', 'dashboard.html'), 'utf8');
    const js = fs.readFileSync(path.join(ROOT, 'desktop', 'src', 'pages', 'dashboard', 'dashboard.js'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'desktop', 'src', 'pages', 'dashboard', 'dashboard.css'), 'utf8');
    const routes = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'notificationRoutes.js'), 'utf8');
    assert.match(html, /data-notification-filter="unread"/);
    assert.match(html, /data-notification-filter="all"/);
    assert.match(html, /data-notification-filter="read"/);
    assert.match(html, /Đánh dấu tất cả đã đọc/);
    assert.match(js, /inboxFilter = 'unread'/);
    const openInbox = js.match(/const openInboxPanel = \(\) => \{[\s\S]*?\n  \};/);
    assert.ok(openInbox, 'openInboxPanel must exist');
    assert.match(openInbox[0], /renderInboxPanel/);
    assert.doesNotMatch(openInbox[0], /markAllInboxRead|markInboxItemRead/);
    assert.match(js, /notify\.markRead/);
    assert.match(js, /if \(item\.open === false && item\.read\) return map;/);
    assert.match(css, /notification-read-all/);
    assert.match(routes, /verifyToken/);
    assert.match(routes, /\/unread-count/);
    assert.ok(routes.indexOf('/read-all') < routes.indexOf('/:id/read'));
};

(async () => {
    testIdentityAndDecorate();
    await testReadOneTouchesOnlyThatRecipient();
    await testReadAllDoesNotTouchOtherEmployee();
    testHistoryStillListableAfterReadAll();
    await testUnauthorizedRecipientIsForbidden();
    await testOwnedInboxItemAndRecipient();
    await testReportNoticeLinksToReportEntity();
    await testViewingReportMarksOnlyViewer();
    await testControllerReadAndUnreadCount();
    await testControllerRejectsForeignId();
    testSocketReadUpdatedIsUserScoped();
    testUiContract();
    console.log('Notification read/unread tests passed.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
