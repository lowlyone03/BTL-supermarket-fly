'use strict';

const assert = require('node:assert/strict');
const {
    SCORE, STATUS, AUTO_MIN,
    parseStatementCsv, scorePair, classifyScore, matchStatement
} = require('./src/services/reconciliationEngine');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Trọng số khớp: 50+20+25+5 = 100, không LLM', () => {
    assert.equal(SCORE.AMOUNT + SCORE.DATE + SCORE.REFERENCE + SCORE.SUPPLIER, 100);
    assert.equal(AUTO_MIN, 95);
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'src/services/reconciliationEngine.js'), 'utf8');
    assert.doesNotMatch(src, /openai|gemini|codecraft|ollama|fetch\(/i);
});

test('Khớp 100%: tiền + ngày ±1 + mã PC + NCC', () => {
    const scored = scorePair(
        { soTien: 1500000, ngay: '2026-09-10', noiDung: 'CK PC26090012 NCC Rau Sach Ha Noi', maThamChieu: '' },
        { soTien: 1500000, ngay: '2026-09-09', maChungTu: 'PC26090012', maThamChieu: 'PC26090012', tenNCC: 'Rau Sach Ha Noi', loaiChungTu: 'PhieuChi' }
    );
    assert.equal(scored.diem, 100);
    assert.equal(classifyScore(scored), STATUS.AUTO);
});

test('Gợi ý ~70%: chỉ tiền + ngày, không mã', () => {
    const scored = scorePair(
        { soTien: 200000, ngay: '2026-09-10', noiDung: 'Thu QR', maThamChieu: '' },
        { soTien: 200000, ngay: '2026-09-10', maChungTu: 'TT0009', maThamChieu: 'MOMO-AAA', loaiChungTu: 'ThanhToan' }
    );
    assert.equal(scored.diem, 70);
    assert.equal(classifyScore(scored), STATUS.SUGGESTED);
    assert.equal(scored.refHit, '');
});

test('Chênh lệch: cùng mã, lệch tiền — hiện 2 số + chênh', () => {
    const scored = scorePair(
        { soTien: 99000, ngay: '2026-09-10', noiDung: 'MoMo 4088878653', maThamChieu: '4088878653' },
        { soTien: 100000, ngay: '2026-09-10', maChungTu: 'TT0010', maGiaoDich: '4088878653', maThamChieu: '4088878653', loaiChungTu: 'ThanhToan' }
    );
    assert.equal(scored.amountEqual, false);
    assert.equal(scored.chenLech, 1000);
    assert.ok(scored.refHit);
    assert.equal(classifyScore(scored), STATUS.DIFFERENCE);
});

test('MoMo QR vs sao kê: mã giao dịch trong nội dung CK', () => {
    const results = matchStatement(
        [{ soTien: 85000, ngay: '2026-09-10', noiDung: 'NAPAS MOMO 4088878653 SUPERMARKET FLY', maThamChieu: '' }],
        [{
            loaiChungTu: 'ThanhToan',
            maChungTu: 'TT26090001',
            soTien: 85000,
            ngay: '2026-09-10',
            maGiaoDich: '4088878653',
            maThamChieu: '4088878653',
            phuongThuc: 'QR',
            nguonXacNhan: 'MoMo'
        }]
    );
    assert.equal(results[0].trangThai, STATUS.AUTO);
    assert.equal(results[0].diemKhop, 95);
    assert.equal(results[0].maChungTu, 'TT26090001');
});

test('Không ứng viên → Chưa khớp', () => {
    const results = matchStatement(
        [{ soTien: 50000, ngay: '2026-09-01', noiDung: 'PHI DICH VU', maThamChieu: '' }],
        [{ loaiChungTu: 'ThanhToan', maChungTu: 'TT1', soTien: 999999, ngay: '2026-08-01', maThamChieu: 'ZZZ' }]
    );
    assert.equal(results[0].trangThai, STATUS.UNMATCHED);
    assert.equal(results[0].diemKhop, 0);
});

test('CSV cột Ngày / Số tiền / Nội dung / Mã tham chiếu', () => {
    const csv = 'Ngày,Số tiền,Nội dung,Mã tham chiếu\n10/09/2026,150000,"CK PC26090012",PC26090012\n';
    const rows = parseStatementCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ngay, '2026-09-10');
    assert.equal(rows[0].soTien, 150000);
    assert.match(rows[0].noiDung, /PC26090012/);
    assert.equal(rows[0].maThamChieu, 'PC26090012');
});

test('Greedy: một chứng từ không gán hai dòng sao kê', () => {
    const results = matchStatement(
        [
            { soTien: 100000, ngay: '2026-09-10', noiDung: 'A TT99', maThamChieu: 'TT99' },
            { soTien: 100000, ngay: '2026-09-10', noiDung: 'B TT99', maThamChieu: 'TT99' }
        ],
        [{ loaiChungTu: 'ThanhToan', maChungTu: 'TT99', soTien: 100000, ngay: '2026-09-10', maThamChieu: 'TT99' }]
    );
    const auto = results.filter((row) => row.trangThai !== STATUS.UNMATCHED);
    assert.equal(auto.length, 1);
    assert.equal(results.filter((row) => row.trangThai === STATUS.UNMATCHED).length, 1);
});

console.log('reconciliation engine tests ok');
