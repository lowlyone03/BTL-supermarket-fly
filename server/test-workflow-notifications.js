'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    WORKFLOW_EVENTS,
    WORKFLOW_CATALOG
} = require('./src/services/notifyCatalog');
const {
    buildWorkflowNotification,
    resolveRecipients,
    publishWorkflowNotification
} = require('./src/services/notifyService');

const ROOT = __dirname;
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const testSixWorkflowCatalogs = () => {
    const families = {
        purchase: [
            WORKFLOW_EVENTS.PURCHASE_REQUEST_SUBMITTED,
            WORKFLOW_EVENTS.PURCHASE_ORDER_SUBMITTED,
            WORKFLOW_EVENTS.PURCHASE_ORDER_APPROVED,
            WORKFLOW_EVENTS.PURCHASE_ORDER_REJECTED
        ],
        stockIssue: [
            WORKFLOW_EVENTS.STOCK_ISSUE_SUBMITTED,
            WORKFLOW_EVENTS.STOCK_ISSUE_APPROVED,
            WORKFLOW_EVENTS.STOCK_ISSUE_REJECTED
        ],
        inventoryCount: [
            WORKFLOW_EVENTS.INVENTORY_COUNT_SUBMITTED,
            WORKFLOW_EVENTS.INVENTORY_COUNT_APPROVED,
            WORKFLOW_EVENTS.INVENTORY_COUNT_REJECTED
        ],
        returns: [
            WORKFLOW_EVENTS.RETURN_SUBMITTED,
            WORKFLOW_EVENTS.RETURN_INSPECTED,
            WORKFLOW_EVENTS.RETURN_APPROVED,
            WORKFLOW_EVENTS.RETURN_REJECTED
        ],
        paymentVoucher: [
            WORKFLOW_EVENTS.PAYMENT_VOUCHER_SUBMITTED,
            WORKFLOW_EVENTS.PAYMENT_VOUCHER_APPROVED,
            WORKFLOW_EVENTS.PAYMENT_VOUCHER_REJECTED
        ],
        attendance: [
            WORKFLOW_EVENTS.ATTENDANCE_SUBMITTED,
            WORKFLOW_EVENTS.ATTENDANCE_APPROVED
        ]
    };
    for (const [family, events] of Object.entries(families)) {
        assert.ok(events.length >= 2, `${family} must contain both sides of its workflow`);
        events.forEach(eventKey => assert.ok(WORKFLOW_CATALOG[eventKey], `${eventKey} missing`));
    }
    const realTargets = new Set([
        'purchasing-inbox', 'warehouse-requests', 'purchasing-orders',
        'purchasing-suppliers', 'manager-purchase-approvals', 'warehouse-stock-issues',
        'warehouse-inventory-counts', 'warehouse-returns', 'warehouse-receiving',
        'cashier-returns', 'cashier-pos', 'cashier-shifts',
        'accounting-payables', 'accounting-invoices', 'accounting-settlements',
        'accounting-payroll', 'manager-workforce-approve', 'cashier-schedule',
        'admin-warehouse-reports', 'home'
    ]);
    Object.values(WORKFLOW_CATALOG).forEach(item => assert.ok(realTargets.has(item.target), item.target));
    const delivery = WORKFLOW_CATALOG[WORKFLOW_EVENTS.DELIVERY_SENT];
    assert.equal(delivery.target, 'warehouse-receiving');
    assert.equal(delivery.permission, 'UC17');
};

const testRecipientResolutionAndOverrides = async () => {
    const accounts = [
        { MaNV: 'NV_ACTOR', MaVaiTro: 1, TenVaiTro: 'Quản lý' },
        { MaNV: 'NV_ROLE_ONLY', MaVaiTro: 2, TenVaiTro: 'Nhân viên mua hàng' },
        { MaNV: 'NV_OVERRIDE', MaVaiTro: 3, TenVaiTro: 'Kế toán' },
        { MaNV: 'NV_EXACT', MaVaiTro: 4, TenVaiTro: 'Thủ kho' }
    ];
    const notification = buildWorkflowNotification(WORKFLOW_EVENTS.PURCHASE_ORDER_SUBMITTED, {
        entityId: 'PO_TEST', actor: { MaNV: 'NV_ACTOR', TenNV: 'Người gửi' }
    });
    const recipients = await resolveRecipients({}, notification, {
        accountLoader: async () => accounts,
        permissionLoader: async (_connection, account) => account.MaNV === 'NV_OVERRIDE' ? ['UC05'] : []
    });
    assert.deepEqual(recipients, ['NV_OVERRIDE'], 'effective employee override must route the task');

    const exact = buildWorkflowNotification(WORKFLOW_EVENTS.PURCHASE_ORDER_APPROVED, {
        entityId: 'PO_TEST',
        actor: { MaNV: 'NV_ACTOR' },
        recipientUsers: ['NV_EXACT']
    });
    assert.deepEqual(await resolveRecipients({}, exact, {
        accountLoader: async () => accounts,
        permissionLoader: async () => []
    }), ['NV_EXACT']);
};

const testPublishDedupeAndTargeting = async () => {
    const inserted = new Set();
    const refreshes = [];
    const persist = async (_connection, notification) => {
        if (inserted.has(notification.idempotencyKey)) {
            return { created: false, duplicate: true, eventId: 1 };
        }
        inserted.add(notification.idempotencyKey);
        return { created: true, duplicate: false, eventId: 1 };
    };
    const dependencies = {
        resolveRecipients: async () => ['NV_MANAGER'],
        persist,
        notify: meta => refreshes.push(meta)
    };
    const context = {
        entityId: 'PX_TEST',
        actor: { MaNV: 'NV_WAREHOUSE', TenNV: 'Thủ kho A' }
    };
    const first = await publishWorkflowNotification(
        {}, WORKFLOW_EVENTS.STOCK_ISSUE_SUBMITTED, context, dependencies
    );
    const duplicate = await publishWorkflowNotification(
        {}, WORKFLOW_EVENTS.STOCK_ISSUE_SUBMITTED, context, dependencies
    );
    assert.equal(first.created, true);
    assert.equal(duplicate.duplicate, true);
    assert.equal(refreshes.length, 1, 'duplicate transition must not emit a second refresh/chime');
    assert.deepEqual(refreshes[0].rooms, ['user:NV_MANAGER']);
    assert.match(first.notification.detail, /Thủ kho A/);
    assert.match(first.notification.detail, /PX_TEST/);
};

const testNoSensitivePayloadLeakage = () => {
    const payment = buildWorkflowNotification(WORKFLOW_EVENTS.PAYMENT_VOUCHER_SUBMITTED, {
        entityId: 'PC_TEST',
        actor: { MaNV: 'NV_KT', TenNV: 'Kế toán A' },
        amount: 987654321,
        supplierBank: 'SECRET-BANK'
    });
    const attendance = buildWorkflowNotification(WORKFLOW_EVENTS.ATTENDANCE_APPROVED, {
        entityId: '55',
        actor: { MaNV: 'NV_QL', TenNV: 'Quản lý A' },
        salary: 123456789,
        approvedMinutes: 999
    });
    const publicText = JSON.stringify([payment, attendance]);
    assert.doesNotMatch(publicText, /987654321|SECRET-BANK|123456789|999/);
    assert.match(payment.detail, /PC_TEST/);
    assert.match(attendance.detail, /55/);
};

const testCommitOrderingAndActorResponses = () => {
    const transactionCases = [
        ['src/controllers/purchaseOrderController.js', 'PURCHASE_ORDER_SUBMITTED'],
        ['src/controllers/purchaseOrderController.js', 'DELIVERY_SENT'],
        ['src/controllers/stockIssueController.js', 'STOCK_ISSUE_SUBMITTED'],
        ['src/controllers/inventoryCountController.js', 'INVENTORY_COUNT_SUBMITTED'],
        ['src/controllers/paymentVoucherController.js', 'PAYMENT_VOUCHER_SUBMITTED'],
        ['src/controllers/workforceController.js', 'ATTENDANCE_APPROVED']
    ];
    for (const [file, eventName] of transactionCases) {
        const source = read(file);
        const eventAt = source.indexOf(`WORKFLOW_EVENTS.${eventName}`);
        assert.ok(eventAt > -1, `${eventName} is not wired`);
        const before = source.slice(Math.max(0, eventAt - 500), eventAt);
        assert.match(before, /await transaction\.commit\(\);/, `${eventName} must publish after commit`);
    }
    const cashier = read('src/controllers/cashierController.js');
    assert.match(cashier, /UPDATE cc SET[\s\S]*OUTPUT inserted\.MaChamCong[\s\S]*publishAfterCommit\(pool, WORKFLOW_EVENTS\.ATTENDANCE_SUBMITTED/,
        'checkout attendance must be updated by an autocommit statement before publication');

    const responseSources = [
        read('src/controllers/purchaseOrderController.js'),
        read('src/controllers/stockIssueController.js'),
        read('src/controllers/inventoryCountController.js'),
        read('src/controllers/returnsController.js'),
        read('src/controllers/paymentVoucherController.js'),
        read('src/controllers/workforceController.js')
    ].join('\n');
    assert.match(responseSources, /Đã gửi Đơn mua hàng \$\{req\.params\.id\} tới Quản lý/);
    assert.match(responseSources, /Đã gửi Phiếu xuất \$\{req\.params\.id\} tới Quản lý/);
    assert.match(responseSources, /Đã gửi kiểm kê \$\{req\.params\.id\} tới Quản lý/);
    assert.match(responseSources, /Đã gửi Phiếu đổi trả \$\{maDT\} tới Thủ kho/);
    assert.match(responseSources, /Đã duyệt Phiếu chi \$\{MaPhieu\}/);
    assert.match(responseSources, /Đã duyệt chấm công \$\{id\} cho \$\{row\.MaNV\}/);
};

(async () => {
    testSixWorkflowCatalogs();
    await testRecipientResolutionAndOverrides();
    await testPublishDedupeAndTargeting();
    testNoSensitivePayloadLeakage();
    testCommitOrderingAndActorResponses();
    console.log('Workflow notification tests passed.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
