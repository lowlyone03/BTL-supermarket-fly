const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/warehouse/warehouse-pages.js'), 'utf8');
const start = src.indexOf('const initInventory');
const end = src.indexOf('const initRequests');
assert.ok(start >= 0 && end > start, 'initInventory is defined');
const init = src.slice(start, end);

assert.match(init, /class="inventory-select"/);
assert.match(init, /status-pill \$\{stockStatus\(item\)\}">\$\{esc\(classifyMucTon\(item\)\)\}/);
assert.match(src, /const classifyMucTon = item =>/);
assert.match(src, /\(onHand - minimum\) <= APPROACHING_MIN_UNITS/);
assert.match(src, /mucTon === 'Hết hàng' \|\| mucTon === 'Sắp chạm định mức' \? 'out'/);
assert.match(init, /const selectedIds = new Set\(\)/);
assert.match(init, /selectedIds\.has\(item\.MaSP\) \? 'checked' : ''/);
assert.match(init, /selectedIds\.delete\(item\.MaSP\)/);
assert.doesNotMatch(init, /item\.MucTon\s*===\s*['"]Đủ hàng['"]\s*\?\s*['"]['"]\s*:\s*['"]checked['"]/);
assert.doesNotMatch(init, /inventory-select[^>]*item\.MucTon/);
assert.doesNotMatch(init, /localStorage/);

const checkboxMatch = init.match(/<input type="checkbox" class="inventory-select"[^>]*>/);
assert.ok(checkboxMatch, 'inventory checkbox markup is present');
const renderCheckbox = new Function('item', 'selectedIds', 'esc', `return \`${checkboxMatch[0]}\`;`);
const esc = value => String(value ?? '');
const statuses = ['Đủ hàng', 'Sắp chạm định mức', 'Cần bổ sung', 'Hết hàng', 'Chưa nhập lần đầu'];

for (const MucTon of statuses) {
  const html = renderCheckbox({ MaSP: 'SP001', TenSP: 'Bánh AFC dinh dưỡng hộp 300 g', MucTon }, new Set(), esc);
  assert.doesNotMatch(html, /\bchecked\b/, `initial render must not check "${MucTon}" from status`);
}

const userPicked = renderCheckbox(
  { MaSP: 'SP001', TenSP: 'Bánh AFC dinh dưỡng hộp 300 g', MucTon: 'Sắp chạm định mức' },
  new Set(['SP001']),
  esc
);
assert.match(userPicked, /\bchecked\b/, 'this-session selection still checks the row');

console.log('PASS warehouse-inventory-ui');
