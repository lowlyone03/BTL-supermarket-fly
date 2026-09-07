const assert = require('node:assert/strict');
const {
    invoiceListMatchSql,
    invoiceViewSql,
    resolveInvoiceListScope,
    canViewSaleInvoice
} = require('./src/services/invoiceSearch');

assert.match(invoiceListMatchSql, /hd\.MaHD LIKE @Search/);
assert.match(invoiceListMatchSql, /hd\.MaKH/);
assert.match(invoiceListMatchSql, /hd\.MaCa/);
assert.match(invoiceListMatchSql, /kh\.SDT/);
assert.match(invoiceListMatchSql, /Latin1_General_100_CI_AI/);
assert.match(invoiceViewSql, /hd\.MaNV=@MaNV OR hd\.TrangThai<>N'Nháp'/);

const idleOwn = resolveInvoiceListScope({ search: '', maCa: '' });
assert.equal(idleOwn.scope, 'own');
assert.match(idleOwn.accessSql, /hd\.MaNV=@MaNV/);
assert.equal(idleOwn.shiftSql, '1=1');

const currentShift = resolveInvoiceListScope({ search: '', maCa: 'CA0008' });
assert.equal(currentShift.scope, 'shift');
assert.equal(currentShift.shiftSql, 'hd.MaCa=@MaCa');

const searching = resolveInvoiceListScope({ search: 'KJvhjva842889', maCa: 'CA0008' });
assert.equal(searching.scope, 'search');
assert.match(searching.accessSql, /TrangThai<>N'Nháp'/);
assert.equal(searching.shiftSql, '1=1', 'Gõ mã phải tìm ngoài ca đang mở.');

assert.equal(canViewSaleInvoice('NV001', { MaNV: 'NV001', TrangThai: 'Nháp' }), true);
assert.equal(canViewSaleInvoice('NV001', { MaNV: 'NV002', TrangThai: 'Hoàn thành' }), true);
assert.equal(canViewSaleInvoice('NV001', { MaNV: 'NV002', TrangThai: 'Đã hủy' }), true);
assert.equal(canViewSaleInvoice('NV001', { MaNV: 'NV002', TrangThai: 'Nháp' }), false);

console.log('INVOICE SEARCH PASS: ca hiện tại khi không gõ; tìm mã nhìn ngoài ca; không xem nháp của thu ngân khác.');
