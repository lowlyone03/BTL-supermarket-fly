const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { previewJournal, netMovement, KQKD_NATURE, EXCLUDED_PL, isoDate, yyMMFromMaKy, periodLabelVi, defaultDateInPeriod, datesInOpenPeriod } = require('./src/services/journalEngine');
const { vietnamDateKey, vietnamCalendar, calendarizeRow, dateKeyFromDocCode } = require('./src/services/reportingPeriod');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('previewJournal bắt Nợ = Có', () => {
    const ok = previewJournal({
        lines: [
            { maTK: '111', soTienNo: 100, soTienCo: 0 },
            { maTK: '511', soTienNo: 0, soTienCo: 100 }
        ]
    });
    assert.equal(ok.tongNo, 100);
    assert.equal(ok.tongCo, 100);
    assert.throws(() => previewJournal({
        lines: [
            { maTK: '111', soTienNo: 100, soTienCo: 0 },
            { maTK: '511', soTienNo: 0, soTienCo: 90 }
        ]
    }), /lệch/i);
});

test('KQKD thuần: 511/711 = Có−Nợ; 5212/632/642 = Nợ−Có', () => {
    assert.equal(netMovement(10, 110, KQKD_NATURE[511]), 100);
    assert.equal(netMovement(80, 5, KQKD_NATURE[632]), 75);
    assert.deepEqual(EXCLUDED_PL, ['KET_CHUYEN', 'DAO_KET_CHUYEN', 'SODU_DAU_KY']);
});

test('isoDate / vietnamDateKey: lịch VN, không cắt UTC từ ISO datetime', () => {
    assert.equal(isoDate('2026-09-09'), '2026-09-09');
    assert.equal(vietnamDateKey('2026-09-08T17:00:00.000Z'), '2026-09-09');
    assert.equal(isoDate(new Date('2026-09-08T17:00:00.000Z')), '2026-09-09');
    assert.equal(calendarizeRow({ NgayLap: new Date('2026-09-08T17:00:00.000Z') }).NgayLap, '2026-09-09');
    assert.equal(calendarizeRow({ NgayLap: '2026-09-09' }).NgayLap, '2026-09-09');
    assert.equal(calendarizeRow({ NgayPhatSinh: '2026-09-08T17:00:00.000Z' }).NgayPhatSinh, '2026-09-09');
    assert.equal(isoDate('2026-08-01T00:00:00.000Z'), vietnamCalendar(new Date('2026-08-01T00:00:00.000Z')).date);
    assert.equal(isoDate(null), null);
    assert.equal(isoDate(''), null);
});

test('yyMMFromMaKy lấy tiền tố theo kỳ mở, không theo ngày máy', () => {
    assert.equal(yyMMFromMaKy('2026-08'), '2608');
    assert.equal(yyMMFromMaKy('2026-09'), '2609');
    assert.equal(periodLabelVi('2026-08'), 'Tháng 8/2026');
    const inAugust = defaultDateInPeriod({ TuNgay: '2026-08-01', DenNgay: '2026-08-31' });
    assert.match(inAugust, /^2026-08-\d{2}$/);
    assert.ok(inAugust >= '2026-08-01' && inAugust <= '2026-08-31');
});

test('ENG-07: filtered unique không dùng LIKE', () => {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'SupermarketFly_Migration_20260909_AccountingCore.sql'), 'utf8');
    const nguon = sql.match(/UX_ButToan_Nguon[\s\S]{0,400}/)[0];
    const dao = sql.match(/UX_ButToan_Dao[\s\S]{0,400}/)[0];
    const cho = sql.match(/UX_ChoGhiSo_Active[\s\S]{0,400}/)[0];
    assert.match(nguon, /DaBiDao\s*=\s*0/);
    assert.match(nguon, /MaBTGoc\s+IS NULL/);
    assert.doesNotMatch(nguon, /LIKE/i);
    assert.match(dao, /MaBTGoc\s+IS NOT NULL/);
    assert.doesNotMatch(dao, /LIKE/i);
    assert.match(cho, /DaXuLy\s*=\s*0/);
    assert.doesNotMatch(cho, /LIKE/i);
    assert.match(sql, /CK_TKNH_MaTK/);
    assert.match(sql, /MaTKKeToan = '112'/);
    assert.match(sql, /INSERT INTO dbo\.TaiKhoanKeToan/);
    assert.match(sql, /'138'/);
});

test('kỳ ChuaMo không xếp KY_KHOA khi đang có kỳ mở', () => {
    const src = fs.readFileSync(path.join(__dirname, 'src', 'services', 'journalEngine.js'), 'utf8');
    const fn = src.match(/const resolvePostingDates[\s\S]+?return postingIntoOpen\(open, chungTu\);\r?\n\};/)[0];
    assert.match(fn, /covering\?\.TrangThai === 'Khoa'/);
    assert.match(fn, /postingIntoOpen\(open, chungTu\)/);
    assert.match(fn, /ChuaMo/);
});

test('GET journals lọc DaGhiSo và backfill CHI_PHI', () => {
    const src = fs.readFileSync(path.join(__dirname, 'src', 'controllers', 'ledgerController.js'), 'utf8');
    assert.match(src, /runExpenseJournalBackfill/);
    assert.match(src, /bt\.TrangThai=N'DaGhiSo'/);
    assert.match(src, /LEFT JOIN NhanVien/);
    const listFn = src.match(/const listJournals = handle\(async[\s\S]+?const getJournal/)[0];
    assert.match(listFn, /ChiTietButToan/);
    assert.match(listFn, /tk\.TenTK/);
    assert.match(listFn, /groupJournalLines/);
});

test('datesInOpenPeriod kéo ngày ngoài kỳ về cuối kỳ mở', () => {
    const open = { MaKy: '2026-08', TuNgay: '2026-08-01', DenNgay: '2026-08-31' };
    const pulled = datesInOpenPeriod(open, '2026-09-09');
    assert.equal(pulled.maKy, '2026-08');
    assert.equal(pulled.ngayChungTu, '2026-08-31');
    assert.equal(pulled.ngayHachToan, '2026-08-31');
    const inside = datesInOpenPeriod(open, '2026-08-15');
    assert.equal(inside.ngayChungTu, '2026-08-15');
    assert.equal(inside.maKy, '2026-08');
    assert.equal(datesInOpenPeriod(null, '2026-09-09'), null);
});

test('GET HoaDon / list journals calendarize NgayLap và lọc maKy kỳ mở', () => {
    const sales = fs.readFileSync(path.join(__dirname, 'src', 'controllers', 'salesController.js'), 'utf8');
    const ledger = fs.readFileSync(path.join(__dirname, 'src', 'controllers', 'ledgerController.js'), 'utf8');
    const pages = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'src', 'pages', 'accounting', 'ledger-pages.js'), 'utf8');
    assert.match(sales, /invoice:\s*calendarizeRow\(header\.recordset\[0\]\)/);
    assert.match(ledger, /invoice:\s*calendarizeRow\(header\.recordset\[0\]\)/);
    assert.match(ledger, /AND \(@MaKy IS NULL OR bt\.MaKy=@MaKy\)/);
    assert.match(pages, /\/ledger\/journals\?maKy=\$\{encodeURIComponent\(current\.MaKy\)\}/);
});

test('CHI_PHI confirm bắt buộc forceOpenPeriod, không copy MaKy từ BT kỳ khác', () => {
    const hooks = fs.readFileSync(path.join(__dirname, 'src', 'services', 'accountingHooks.js'), 'utf8');
    const ctrl = fs.readFileSync(path.join(__dirname, 'src', 'controllers', 'ledgerController.js'), 'utf8');
    assert.match(hooks, /forceOpenPeriod:\s*true/);
    assert.match(hooks, /datesInOpenPeriod\(open, expense\.NgayChungTu\)/);
    assert.match(hooks, /UPDATE ChiPhiVanHanh SET MaKy=@MaKy, NgayChungTu=@Ngay/);
    assert.match(ctrl, /posted\.queued/);
    assert.match(ctrl, /loadPresentedExpense/);
    assert.doesNotMatch(ctrl, /covering\?\.TrangThai === 'Khoa'\) return expense/);
});

test('dateKeyFromDocCode: HD YYYYMMDD; HDM/PC YYYYMM → ngày 01; CP YYMM', () => {
    assert.equal(dateKeyFromDocCode('HD202608250002'), '2026-08-25');
    assert.equal(dateKeyFromDocCode('HD202609080001'), '2026-09-08');
    assert.equal(dateKeyFromDocCode('HDM2026080001'), '2026-08-01');
    assert.equal(dateKeyFromDocCode('HDM2026090010'), '2026-09-01');
    assert.equal(dateKeyFromDocCode('PC2026080001'), '2026-08-01');
    assert.equal(dateKeyFromDocCode('PN202608250001'), '2026-08-25');
    assert.equal(dateKeyFromDocCode('CP26080001'), '2026-08-01');
    assert.equal(dateKeyFromDocCode(''), null);
});

test('GET unposted JOIN ngày chứng từ + varchar(10); FE formatDateVN + fallback mã HĐ', () => {
    const ledger = fs.readFileSync(path.join(__dirname, 'src', 'controllers', 'ledgerController.js'), 'utf8');
    const pages = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'src', 'pages', 'accounting', 'ledger-pages.js'), 'utf8');
    const listFn = ledger.match(/const presentUnpostedRow[\s\S]+?const postUnposted/)[0];
    assert.match(listFn, /LEFT JOIN HoaDon hd/);
    assert.match(listFn, /hd\.NgayLap/);
    assert.match(listFn, /HoaDonMuaHang/);
    assert.match(listFn, /NgayHoaDon/);
    assert.match(listFn, /NgayTiepNhan/);
    assert.match(listFn, /CAST\(COALESCE/);
    assert.match(listFn, /PhieuNhap/);
    assert.match(listFn, /ChiPhiVanHanh/);
    assert.match(listFn, /CONVERT\(varchar\(10\)/);
    assert.match(listFn, /dateKeyFromDocCode/);
    assert.doesNotMatch(listFn, /CONVERT\(date,\s*hd\.NgayLap\)/);
    assert.match(pages, /formatDateVN/);
    assert.match(pages, /formatQueueDate/);
    assert.match(pages, /dateFromDocCode/);
});
