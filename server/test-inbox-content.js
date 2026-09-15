'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    WORKFLOW_EVENTS,
    WORKFLOW_CATALOG
} = require('./src/services/notifyCatalog');
const {
    decorateWithReadState,
    countUnread
} = require('./src/services/notificationReadService');

const ROOT = __dirname;
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const resolveSrc = relative => require.resolve(path.join(ROOT, relative));

const stub = (relative, exports) => {
    const full = resolveSrc(relative);
    require.cache[full] = {
        id: full,
        filename: full,
        loaded: true,
        exports,
        children: [],
        paths: []
    };
};

delete require.cache[resolveSrc('./src/services/inboxService.js')];
stub('./src/services/storeProfitLoss.js', {
    listInboxForEmployee: async (_pool, maNV) => [{
        MaTB: 77,
        TieuDe: 'Cửa hàng lỗ — Tháng 09/2026',
        NoiDung: 'Báo cáo lãi lỗ cửa hàng',
        MucDo: 'Cảnh báo',
        NgayGui: new Date('2026-09-15T10:00:00Z'),
        DichDen: '',
        MaNV_Nhan: maNV
    }]
});
stub('./src/services/notifySchema.js', { ensureNotifySchema: async () => {} });
stub('./src/services/payrollSchema.js', { ensurePayrollSchema: async () => {} });
stub('./src/services/returnHandover.js', { ensureReturnHandoverSchema: async () => {} });

const {
    listForRole,
    mergeInboxItems,
    listPersistedWorkflowItems
} = require('./src/services/inboxService');

const fakePool = handlers => ({
    request() {
        const req = {
            input() { return req; },
            async query(text) {
                const sql = String(text);
                for (const handler of handlers) {
                    if (handler.match(sql)) return { recordset: handler.rows || [] };
                }
                return { recordset: [] };
            }
        };
        return req;
    }
});

const persistedRows = extra => [{
    MaNhan: 501,
    DaDoc: 0,
    EventKey: 'purchase-request.submitted',
    EntityType: 'DeNghiMuaHang',
    EntityId: 'DN20260915099',
    Title: 'Phiếu đề nghị DN20260915099 chờ tiếp nhận',
    Detail: 'Thủ kho đã gửi phiếu đề nghị DN20260915099.',
    Tone: 'info',
    Target: 'purchasing-inbox',
    EventAt: new Date('2026-09-15T09:00:00Z')
}, {
    MaNhan: 502,
    DaDoc: 0,
    EventKey: 'qr.result',
    EntityType: 'ThanhToan',
    EntityId: 'HD999',
    Title: 'Thanh toán QR HD999 đã cập nhật',
    Detail: 'Cổng thanh toán',
    Tone: 'info',
    Target: 'cashier-pos',
    EventAt: new Date('2026-09-15T11:00:00Z')
}, ...extra];

const operationalPool = extraPersist => fakePool([
    {
        match: sql => sql.includes('ThongBaoNguoiNhan'),
        rows: persistedRows(extraPersist || [])
    },
    {
        match: sql => sql.includes('DeNghiMuaHang') && sql.includes("N'Đã gửi'"),
        rows: [{
            MaDN: 'DN20260915001',
            NgayGui: new Date('2026-09-15T08:00:00Z'),
            LyDo: 'Hết tồn kho',
            TenNV: 'Nguyễn Thủ Kho'
        }]
    },
    {
        match: sql => sql.includes('ThongBaoGiaoHang') && sql.includes("N'Đang giao'"),
        rows: [{
            MaTBGH: 'GH20260915001',
            MaPO: 'PO20260915003',
            TrangThai: 'Đang giao',
            NgayTao: new Date('2026-09-15T12:00:00Z'),
            NgayDen: null,
            TenNCC: 'NCC Demo'
        }]
    },
    {
        match: sql => sql.includes('DonMuaHang') && sql.includes("N'Chờ duyệt'"),
        rows: [{
            MaPO: 'PO20260915010',
            NgayLap: new Date('2026-09-15T07:00:00Z'),
            TenNCC: 'NCC Demo',
            TenNV: 'Trần Thu Hà'
        }]
    }
]);

const idsOf = items => items.map(item => item.id);
const titlesOf = items => items.map(item => item.title);

const testMergeKeepsReportsAndWorkflow = () => {
    const merged = mergeInboxItems([
        { id: 'pnl:77', title: 'Cửa hàng lỗ — Tháng 09/2026', tone: 'urgent' },
        { id: 'dn:DN20260915001', title: 'Đề nghị mua từ kho', tone: 'urgent' }
    ], [
        { id: 'dn:DN20260915001', title: 'Phiếu đề nghị trùng', entityType: 'DeNghiMuaHang', entityId: 'DN20260915001' },
        { id: 'po:PO20260915010', title: 'Đơn mua chờ duyệt', entityType: 'DonMuaHang', entityId: 'PO20260915010' }
    ]);
    assert.deepEqual(idsOf(merged), ['pnl:77', 'dn:DN20260915001', 'po:PO20260915010']);
};

const testPurchasingInboxHasWarehouseRequestAndReport = async () => {
    const items = await listForRole(operationalPool(), {
        MaNV: 'NV_MH01',
        TenVaiTro: 'Nhân viên mua hàng'
    });
    assert.ok(items.some(item => item.id === 'pnl:77'), 'report feed must remain');
    assert.ok(items.some(item => item.id === 'dn:DN20260915001' && /đề nghị/i.test(item.title)),
        'pending warehouse request must surface for purchasing');
    assert.ok(items.some(item => item.id === 'dn:DN20260915099'),
        'persisted request history must surface after accept/status change');
    assert.equal(items.some(item => /qr/i.test(item.title) || item.id.includes('HD999')), false,
        'QR results must not spam the inbox list');
};

const testWarehouseInboxHasSentDelivery = async () => {
    const items = await listForRole(operationalPool(), {
        MaNV: 'NV_TK01',
        TenVaiTro: 'Thủ kho'
    });
    const delivery = items.find(item => item.id === 'gh:GH20260915001');
    assert.ok(delivery, 'warehouse bell must list Đang giao shipments');
    assert.match(delivery.title, /chuyến giao chờ nhận/i);
    assert.match(delivery.detail, /GH20260915001/);
    assert.match(delivery.detail, /PO20260915003/);
    assert.ok(items.some(item => item.id === 'pnl:77'));
};

const testAdminInboxHasApprovalTasks = async () => {
    const items = await listForRole(operationalPool([{
        MaNhan: 700,
        DaDoc: 0,
        EventKey: 'purchase-order.submitted',
        EntityType: 'DonMuaHang',
        EntityId: 'PO20260915088',
        Title: 'Đơn mua PO20260915088 chờ phê duyệt',
        Detail: 'Nhân viên mua hàng đã gửi đơn mua PO20260915088.',
        Tone: 'info',
        Target: 'manager-purchase-approvals',
        EventAt: new Date('2026-09-15T06:00:00Z')
    }]), {
        MaNV: 'NV_QL01',
        TenVaiTro: 'Quản lý'
    });
    assert.ok(items.some(item => item.id === 'po:PO20260915010' && /chờ duyệt/i.test(item.title)),
        'admin pending PO approval must appear');
    assert.ok(items.some(item => item.id === 'po:PO20260915088'),
        'persisted approval event must appear even after status snapshot is empty');
    assert.ok(items.some(item => item.id === 'pnl:77'));
};

const testReadAllDoesNotDeleteHistory = async () => {
    const items = await listForRole(operationalPool(), {
        MaNV: 'NV_MH01',
        TenVaiTro: 'Nhân viên mua hàng'
    });
    const marked = decorateWithReadState(items, new Set(items.map(item => item.id)));
    assert.ok(marked.length >= 2, 'read-all must keep report + operational history');
    assert.equal(countUnread(marked), 0);
    assert.ok(marked.every(item => item.read === true));
    assert.ok(marked.some(item => item.id === 'pnl:77'));
    assert.ok(marked.some(item => String(item.id).startsWith('dn:')));

    const source = read('src/services/notificationReadService.js');
    assert.match(source, /INSERT dbo\.ThongBaoDaDoc/);
    assert.match(source, /SET DaDoc=1/);
    assert.doesNotMatch(source, /DELETE FROM dbo\.ThongBao(SuKien|NguoiNhan|CuaHang)/);
};

const testPersistedListSkipsQr = async () => {
    const rows = await listPersistedWorkflowItems(operationalPool(), { MaNV: 'NV_TN01' });
    assert.ok(rows.some(item => item.id === 'dn:DN20260915099'));
    assert.equal(rows.some(item => item.target === 'cashier-pos'), false);
};

const testCatalogAndPublishSites = () => {
    const delivery = WORKFLOW_CATALOG[WORKFLOW_EVENTS.DELIVERY_SENT];
    assert.equal(delivery.target, 'warehouse-receiving');
    assert.equal(delivery.permission, 'UC17');
    assert.match(delivery.title({ entityId: 'GH1', poId: 'PO1' }), /GH1/);
    assert.match(delivery.detail({ entityId: 'GH1', poId: 'PO1', actor: { TenNV: 'Hà' } }), /PO1/);

    const request = WORKFLOW_CATALOG[WORKFLOW_EVENTS.PURCHASE_REQUEST_SUBMITTED];
    assert.equal(request.target, 'purchasing-inbox');
    assert.equal(request.permission, 'UC12');

    const po = read('src/controllers/purchaseOrderController.js');
    assert.match(po, /await transaction\.commit\(\);\s*await publishAfterCommit\([\s\S]*WORKFLOW_EVENTS\.DELIVERY_SENT/);
    assert.match(po, /Đã gửi chuyến \$\{MaTBGH\} của đơn \$\{req\.params\.id\} cho Thủ kho/);

    const warehouse = read('src/controllers/warehouseController.js');
    assert.match(warehouse, /WORKFLOW_EVENTS\.PURCHASE_REQUEST_SUBMITTED/);
    assert.match(warehouse, /publishAfterCommit\(pool, eventKey/);
    assert.match(warehouse, /Đã gửi Phiếu đề nghị \$\{req\.params\.id\} tới Nhân viên mua hàng/);

    const inbox = read('src/services/inboxService.js');
    assert.match(inbox, /listPersistedWorkflowItems/);
    assert.match(inbox, /mergeInboxItems\(items, persisted\)/);
    assert.match(inbox, /TrangThai IN \(N'Đang giao', N'Đã đến kho'\)/);
    assert.match(inbox, /dn\.TrangThai=N'Đã gửi'/);
};

(async () => {
    testMergeKeepsReportsAndWorkflow();
    await testPurchasingInboxHasWarehouseRequestAndReport();
    await testWarehouseInboxHasSentDelivery();
    await testAdminInboxHasApprovalTasks();
    await testReadAllDoesNotDeleteHistory();
    await testPersistedListSkipsQr();
    testCatalogAndPublishSites();
    console.log('Inbox content tests passed.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
