const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/warehouse/purchase-order-pages.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/warehouse/warehouse.css'), 'utf8');
const helperStart = src.indexOf('const defaultExpectedPackages');
const start = src.indexOf('const shipmentModal');
const end = src.indexOf('const initOrders');
assert.ok(helperStart >= 0 && start > helperStart && end > start, 'shipmentModal and package helper are defined');
const modal = src.slice(helperStart, end);

const defaultExpectedPackages = new Function(`${src.slice(helperStart, start)}; return defaultExpectedPackages;`)();

const poA = { MaPO: 'PO20260915004', TongConThieu: 8, SoKien: 32 };
const poB = { MaPO: 'PO20260910001', TongConThieu: 32, SoKien: 32 };
assert.equal(defaultExpectedPackages(poA, [{ SLConThieu: 5 }, { SLConThieu: 3 }]), '8');
assert.equal(defaultExpectedPackages(poB, [{ SLConThieu: 32 }]), '32');
assert.equal(
    defaultExpectedPackages(poA, [{ SLConThieu: 5 }, { SLConThieu: 3 }]),
    defaultExpectedPackages({ MaPO: poA.MaPO, TongConThieu: 8 }, [{ SLConThieu: 5 }, { SLConThieu: 3 }])
);
assert.notEqual(
    defaultExpectedPackages(poA, [{ SLConThieu: 8 }]),
    defaultExpectedPackages(poB, [{ SLConThieu: 32 }]),
    'opening another PO must not reuse previous remaining qty'
);
assert.equal(defaultExpectedPackages({ TongConThieu: 32, SoKien: 32 }, [{ SLConThieu: 4 }]), '4', 'line remaining of the open PO wins over leftover 32');
assert.equal(defaultExpectedPackages({ TongConThieu: 12 }, undefined), '12');
assert.equal(defaultExpectedPackages({ TongConThieu: 0 }, [{ SLConThieu: 0 }]), '');
assert.equal(defaultExpectedPackages({ TongConThieu: 32 }, []), '', 'no remaining qty must not invent packages');
assert.equal(defaultExpectedPackages({ SoKien: 32 }, undefined), '');
assert.doesNotMatch(String(defaultExpectedPackages({ TongConThieu: 8 }, [{ SLConThieu: 8 }])), /^32$/);

assert.match(modal, /Ghi nhận chuyến giao hàng/);
assert.match(modal, /THEO DÕI NHÀ CUNG CẤP/);
assert.match(modal, /<h3>Vận đơn<\/h3>/);
assert.match(modal, /<h3>Lịch trình<\/h3>/);
assert.match(modal, /Phương tiện &amp; liên hệ/);
assert.match(modal, /<h3>Ghi chú<\/h3>/);
assert.match(modal, /Ghi nhận đang giao/);
assert.match(modal, /id="shipmentDocument"/);
assert.match(modal, /id="shipmentPackages"/);
assert.match(modal, /datetimeField\('shipmentDeparture'/);
assert.match(modal, /datetimeField\('shipmentArrival'/);
assert.match(modal, /id="shipmentPlate"/);
assert.match(modal, /id="shipmentDriver"/);
assert.match(modal, /id="shipmentPhone"/);
assert.match(modal, /id="shipmentNote"/);
assert.match(modal, /SoPhieuGiao:/);
assert.match(modal, /SoKien:/);
assert.match(modal, /NgayXuatPhat:/);
assert.match(modal, /NgayGioDuKienDen:/);
assert.match(modal, /BienSoXe:/);
assert.match(modal, /TenTaiXe:/);
assert.match(modal, /SDTTaiXe:/);
assert.match(modal, /GhiChu:/);
assert.match(modal, /\/purchasing\/purchase-orders\/\$\{order\.MaPO\}\/shipments/);
assert.match(modal, /method: 'POST'/);
assert.match(modal, /role="dialog"/);
assert.match(modal, /aria-modal="true"/);
assert.match(modal, /event\.key !== 'Escape'/);
assert.match(modal, /shipmentDocument_err/);
assert.match(modal, /Đang ghi nhận/);
assert.match(modal, /submitting/);
assert.match(modal, /button\.disabled = true/);
assert.match(modal, /setFieldError/);
assert.doesNotMatch(modal, /type="datetime-local"/);
assert.doesNotMatch(modal, /native.*datetime/);

assert.match(modal, /defaultExpectedPackages\(order, lines\)/);
assert.match(modal, /name="soKien-\$\{esc\(order\.MaPO\)\}"/);
assert.match(modal, /autocomplete="off"/);
assert.match(modal, /packagesInput\.value = packagePrefill/);
assert.match(modal, /SL còn thiếu của đúng đơn đang mở/);
assert.match(modal, /không lấy từ chuyến giao khác/);
assert.match(modal, /Số kiện dự kiến của \$\{esc\(order\.MaPO\)\}/);
assert.match(modal, /shipmentPackagesHint/);
assert.match(src, /shipmentModal\(context, data\.order, load, data\.lines\)/);
assert.doesNotMatch(modal, /shipments\[0\]\.SoKien/);
assert.doesNotMatch(modal, /value="32"/);

assert.match(css, /\.shipment-modal\s*\{[\s\S]*width:\s*min\(920px/);
assert.match(css, /\.shipment-modal\s*\{[\s\S]*flex-direction:\s*column/);
assert.match(css, /\.shipment-modal \.warehouse-modal-body[\s\S]*overflow:\s*auto/);
assert.match(css, /\.shipment-grid/);
assert.match(css, /@media \(max-width: 840px\)[\s\S]*\.shipment-grid/);
assert.match(css, /\.shipment-modal \.fly-vi-datetime[\s\S]*grid-template-columns:\s*minmax\(84px/);
assert.match(css, /\.fly-vi-hour \{ grid-column: 1; \}/);
assert.match(css, /\.shipment-modal \.warehouse-field-hint/);

console.log('PASS shipment-modal-ui');
