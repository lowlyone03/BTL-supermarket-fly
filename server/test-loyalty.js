'use strict';

const assert = require('node:assert/strict');
const {
    scoreRecency, scoreFrequency, scoreMonetary, segmentFromScores,
    computeRfmTable, summarizeSegments
} = require('./src/services/loyaltyAnalytics');
const { LOYALTY_POLICY, offerForSegment, OFFER_CATEGORIES } = require('./src/services/loyaltyPolicy');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Chính sách cố định: VIP 10%, win-back 20k, mới x2 — không bịa %', () => {
    assert.equal(LOYALTY_POLICY.vipMaxPercent, 10);
    assert.equal(LOYALTY_POLICY.winBackVoucherVnd, 20000);
    assert.equal(LOYALTY_POLICY.newMemberPointMultiplier, 2);
    assert.deepEqual(OFFER_CATEGORIES, ['VIP', 'win-back', 'mới']);
    const vip = offerForSegment('Giá trị cao');
    assert.equal(vip.category, 'VIP');
    assert.equal(vip.maxPercent, 10);
    const win = offerForSegment('Nguy cơ rời bỏ');
    assert.equal(win.category, 'win-back');
    assert.equal(win.voucherVnd, 20000);
    const newbie = offerForSegment('Mới');
    assert.equal(newbie.pointMultiplier, 2);
});

test('RFM fixture: VIP / at-risk / mới', () => {
    const asOf = '2026-09-10';
    const table = computeRfmTable([
        {
            MaKH: 'KH1', TenKH: 'VIP', HangThanhVien: 'Vàng', DiemTichLuy: 800,
            SoHoaDon: 14, TongChiTieu: 6000000, LanMuaGanNhat: '2026-09-08'
        },
        {
            MaKH: 'KH2', TenKH: 'At risk', HangThanhVien: 'Bạc', DiemTichLuy: 200,
            SoHoaDon: 8, TongChiTieu: 2500000, LanMuaGanNhat: '2026-01-01'
        },
        {
            MaKH: 'KH3', TenKH: 'Mới', HangThanhVien: 'Thường', DiemTichLuy: 10,
            SoHoaDon: 1, TongChiTieu: 120000, LanMuaGanNhat: '2026-09-09'
        }
    ], asOf);
    assert.equal(table[0].Segment, 'Giá trị cao');
    assert.equal(table[0].GoiY.category, 'VIP');
    assert.equal(table[1].Segment, 'Nguy cơ rời bỏ');
    assert.equal(table[1].GoiY.category, 'win-back');
    assert.equal(table[2].Segment, 'Mới');
    assert.equal(table[2].GoiY.category, 'mới');
    const summary = summarizeSegments(table);
    assert.equal(summary.soKhach, 3);
    assert.equal(summary.atRisk, 1);
});

test('Thang điểm R/F/M rule rõ, không LLM', () => {
    assert.equal(scoreRecency(3), 5);
    assert.equal(scoreRecency(40), 3);
    assert.equal(scoreRecency(200), 1);
    assert.equal(scoreFrequency(12), 5);
    assert.equal(scoreFrequency(1), 1);
    assert.equal(scoreMonetary(5000000), 5);
    assert.equal(scoreMonetary(100000), 1);
    assert.equal(segmentFromScores({ r: 5, f: 5, m: 5 }), 'Giá trị cao');
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'src/services/loyaltyAnalytics.js'), 'utf8');
    assert.doesNotMatch(src, /openai|gemini|codecraft|fetch\(/i);
});

console.log('loyalty RFM tests ok');
