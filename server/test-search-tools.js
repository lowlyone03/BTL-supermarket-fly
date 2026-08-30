const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = {};
require('../desktop/src/pages/shared/search-tools.js');

const search = window.FLY_SEARCH;
assert.ok(search, 'Bộ công cụ tìm kiếm phải được khởi tạo.');
assert.equal(search.normalize('  Đặng Gia Huy  '), 'dang gia huy');
assert.equal(search.normalize('HÓA ĐƠN Nhà Cung Cấp'), 'hoa don nha cung cap');
assert.equal(search.normalize(null), '');

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

(async () => {
    let callCount = 0;
    let latestValue = '';
    const debounced = search.debounce(value => {
        callCount += 1;
        latestValue = value;
    }, 30);
    debounced('cũ');
    debounced('mới');
    await delay(60);
    assert.equal(callCount, 1, 'Debounce chỉ được chạy lần nhập cuối.');
    assert.equal(latestValue, 'mới');

    const dashboardHtml = fs.readFileSync(path.resolve(__dirname, '../desktop/src/pages/dashboard/dashboard.html'), 'utf8');
    assert.match(dashboardHtml, /search-tools\.js/);
    const cashierPages = fs.readFileSync(path.resolve(__dirname, '../desktop/src/pages/cashier/cashier-pages.js'), 'utf8');
    assert.match(cashierPages, /customerSearchVersion/);
    assert.match(cashierPages, /returnSearchVersion/);
    assert.match(cashierPages, /exchangeSearchVersion/);

    const accentAwareControllers = [
        'catalogController.js', 'salesController.js', 'returnsController.js', 'accountingController.js',
        'paymentVoucherController.js', 'stockIssueController.js', 'inventoryCountController.js',
        'purchaseOrderController.js', 'receiptController.js', 'adminController.js',
        'warehouseController.js', 'supplierController.js'
    ];
    accentAwareControllers.forEach(file => {
        const source = fs.readFileSync(path.resolve(__dirname, 'src/controllers', file), 'utf8');
        assert.match(source, /Latin1_General_100_CI_AI/, `${file} phải tìm được tiếng Việt có dấu và không dấu.`);
    });

    console.log('SEARCH PASS: chuẩn hóa tiếng Việt, debounce và tìm kiếm API không phân biệt dấu đã được kiểm tra.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
