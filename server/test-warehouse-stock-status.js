const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    APPROACHING_MIN_UNITS,
    STOCK_STATUS,
    classifyMucTon,
    needsImportAttention,
    mucTonSql,
    lowOnlyPredicateSql
} = require('./src/services/stockLevel');

assert.equal(APPROACHING_MIN_UNITS, 5);

const cases = [
    { SLTon: 38, TonKhoToiThieu: 25, expected: STOCK_STATUS.ENOUGH, note: 'Chocopie 38 vs 25' },
    { SLTon: 67, TonKhoToiThieu: 50, expected: STOCK_STATUS.ENOUGH, note: 'Trung thu 67 vs 50' },
    { SLTon: 31, TonKhoToiThieu: 25, expected: STOCK_STATUS.ENOUGH, note: 'gap 6' },
    { SLTon: 30, TonKhoToiThieu: 25, expected: STOCK_STATUS.APPROACHING, note: 'gap 5' },
    { SLTon: 28, TonKhoToiThieu: 25, expected: STOCK_STATUS.APPROACHING, note: 'gap 3' },
    { SLTon: 26, TonKhoToiThieu: 25, expected: STOCK_STATUS.APPROACHING, note: 'gap 1' },
    { SLTon: 25, TonKhoToiThieu: 25, expected: STOCK_STATUS.NEED_RESTOCK, note: 'at min' },
    { SLTon: 24, TonKhoToiThieu: 25, expected: STOCK_STATUS.NEED_RESTOCK, note: 'below min' },
    { SLTon: 1, TonKhoToiThieu: 25, expected: STOCK_STATUS.NEED_RESTOCK, note: 'far below min' },
    { SLTon: 0, TonKhoToiThieu: 25, expected: STOCK_STATUS.OUT, note: 'out of stock' },
    { SLTon: 0, TonKhoToiThieu: 25, neverImported: true, expected: STOCK_STATUS.NEVER_IMPORTED, note: 'never imported' }
];

for (const { expected, note, ...item } of cases) {
    assert.equal(classifyMucTon(item), expected, note);
}

assert.equal(needsImportAttention({ SLTon: 38, TonKhoToiThieu: 25 }), false);
assert.equal(needsImportAttention({ SLTon: 28, TonKhoToiThieu: 25 }), true);
assert.equal(needsImportAttention({ SLTon: 25, TonKhoToiThieu: 25 }), true);
assert.equal(needsImportAttention({ SLTon: 24, TonKhoToiThieu: 25 }), true);

const controller = fs.readFileSync(path.join(__dirname, 'src/controllers/warehouseController.js'), 'utf8');
assert.match(controller, /require\('\.\.\/services\/stockLevel'\)/);
assert.match(controller, /mucTonSql\('tk\.SLTon', 'sp\.TonKhoToiThieu'/);
assert.match(controller, /lowOnlyPredicateSql\('tk\.SLTon', 'sp\.TonKhoToiThieu'/);
assert.match(controller, /MucTon: classifyMucTon\(/);
assert.doesNotMatch(controller, /TonKhoToiThieu \* 1\.5/);
assert.doesNotMatch(controller, /CEILING\(sp\.TonKhoToiThieu/);

const sqlCase = mucTonSql('tk.SLTon', 'sp.TonKhoToiThieu', {
    neverImportedPredicate: `NOT EXISTS (
               SELECT 1 FROM GiaoDichKho gd
               WHERE gd.MaKho = @MaKho AND gd.MaSP = sp.MaSP AND gd.LoaiGD = N'Nhập'
             )`
});
assert.match(sqlCase, /Chưa nhập lần đầu/);
assert.match(sqlCase, /Hết hàng/);
assert.match(sqlCase, /Cần bổ sung/);
assert.match(sqlCase, /Sắp chạm định mức/);
assert.match(sqlCase, /Đủ hàng/);
assert.match(sqlCase, /ISNULL\(tk\.SLTon, 0\) > sp\.TonKhoToiThieu AND ISNULL\(tk\.SLTon, 0\) - sp\.TonKhoToiThieu <= 5/);
assert.doesNotMatch(sqlCase, /1\.5/);

const filterSql = lowOnlyPredicateSql('tk.SLTon', 'sp.TonKhoToiThieu', {
    neverImportedPredicate: 'NOT EXISTS (SELECT 1 FROM GiaoDichKho gd WHERE gd.MaKho=@MaKho AND gd.MaSP=sp.MaSP AND gd.LoaiGD=N\'Nhập\')'
});
assert.match(filterSql, /<= sp\.TonKhoToiThieu \+ 5/);

const ui = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/warehouse/warehouse-pages.js'), 'utf8');
assert.match(ui, /const APPROACHING_MIN_UNITS = 5/);
assert.match(ui, /const classifyMucTon = item =>/);
assert.match(ui, /\$\{esc\(classifyMucTon\(item\)\)\}/);
assert.match(ui, /selectedIds\.has\(item\.MaSP\) \? 'checked' : ''/);
assert.doesNotMatch(ui, /item\.MucTon\s*===\s*['"]Đủ hàng['"]\s*\?\s*['"]['"]\s*:\s*['"]checked['"]/);
assert.doesNotMatch(ui, /TonKhoToiThieu\s*\*\s*1\.5/);
assert.doesNotMatch(ui, /CEILING/);

const classifyStart = ui.indexOf('const APPROACHING_MIN_UNITS = 5');
const classifyEnd = ui.indexOf('const stockStatus = item =>');
assert.ok(classifyStart >= 0 && classifyEnd > classifyStart, 'desktop classifyMucTon is defined');
const desktopClassify = new Function(`${ui.slice(classifyStart, classifyEnd)}; return classifyMucTon;`)();
assert.equal(
    desktopClassify({ SLTon: 38, TonKhoToiThieu: 25, MucTon: 'Sắp chạm định mức' }),
    'Đủ hàng',
    'desktop must not keep API Sắp chạm for Chocopie 38 vs 25'
);
assert.equal(
    desktopClassify({ SLTon: 67, TonKhoToiThieu: 50, MucTon: 'Sắp chạm định mức' }),
    'Đủ hàng',
    'desktop must not keep API Sắp chạm for Trung thu 67 vs 50'
);
assert.equal(desktopClassify({ SLTon: 28, TonKhoToiThieu: 25, MucTon: 'Đủ hàng' }), 'Sắp chạm định mức');
assert.equal(desktopClassify({ SLTon: 25, TonKhoToiThieu: 25 }), 'Cần bổ sung');
assert.equal(desktopClassify({ SLTon: 24, TonKhoToiThieu: 25 }), 'Cần bổ sung');

const dashboard = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/dashboard/dashboard.html'), 'utf8');
assert.match(dashboard, /warehouse-pages\.js\?v=stock-gap-5/);
assert.doesNotMatch(dashboard, /warehouse-pages\.js\?v=inventory-select-1/);

console.log('PASS warehouse-stock-status');
