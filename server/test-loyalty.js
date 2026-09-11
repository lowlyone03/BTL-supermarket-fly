'use strict';

const assert = require('node:assert/strict');
const {
    scoreRecency, scoreFrequency, scoreMonetary, segmentFromScores,
    computeCustomerRfm, computeRfmTable, summarizeSegments
} = require('./src/services/loyaltyAnalytics');
const {
    LOYALTY_POLICY, DEFAULT_LOYALTY_POLICY, offerForSegment, OFFER_CATEGORIES,
    normalizePolicy, publicPolicy, POS_AUTO_PROMO
} = require('./src/services/loyaltyPolicy');
const { mergeLoyaltyDiscount, bannerForOffer, countOffersFromTable } = require('./src/services/loyaltyApply');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Chính sách mặc định: VIP 10%, win-back 20k, mới x2 — không bịa %', () => {
    assert.equal(LOYALTY_POLICY.vipMaxPercent, 10);
    assert.equal(DEFAULT_LOYALTY_POLICY.winBackVoucherVnd, 20000);
    assert.equal(LOYALTY_POLICY.newMemberPointMultiplier, 2);
    assert.equal(POS_AUTO_PROMO, false);
    assert.deepEqual(OFFER_CATEGORIES, ['VIP', 'win-back', 'mới']);
    const vip = offerForSegment('Giá trị cao');
    assert.equal(vip.category, 'VIP');
    assert.equal(vip.maxPercent, 10);
    assert.equal(vip.shortLabel, 'VIP: tối đa 10%');
    const win = offerForSegment('Nguy cơ rời bỏ');
    assert.equal(win.category, 'win-back');
    assert.equal(win.voucherVnd, 20000);
    assert.match(win.shortLabel, /20\.000 đ/);
    const newbie = offerForSegment('Mới');
    assert.equal(newbie.pointMultiplier, 2);
    assert.equal(newbie.shortLabel, '×2 điểm');
});

test('QL sửa mức: gợi ý lấy đúng policy, không bịa % khác', () => {
    const custom = normalizePolicy({
        vipMaxPercent: 8,
        winBackVoucherVnd: 15000,
        newMemberPointMultiplier: 3
    });
    const vip = offerForSegment('Giá trị cao', custom);
    assert.equal(vip.maxPercent, 8);
    assert.equal(vip.shortLabel, 'VIP: tối đa 8%');
    const win = offerForSegment('Ngủ đông', custom);
    assert.equal(win.voucherVnd, 15000);
    const newbie = offerForSegment('Mới', custom);
    assert.equal(newbie.pointMultiplier, 3);
    assert.equal(newbie.shortLabel, '×3 điểm');
});

test('Tắt từng nhóm: không gợi ý nhóm đó', () => {
    const off = normalizePolicy({
        vipEnabled: false,
        winBackEnabled: false,
        newMemberEnabled: false
    });
    assert.equal(offerForSegment('Giá trị cao', off).category, null);
    assert.match(offerForSegment('Giá trị cao', off).shortLabel, /tắt/i);
    assert.equal(offerForSegment('Nguy cơ rời bỏ', off).category, null);
    assert.equal(offerForSegment('Mới', off).category, null);
});

test('normalizePolicy kẹp biên, không nhận % bịa', () => {
    const clamped = normalizePolicy({ vipMaxPercent: 99, winBackVoucherVnd: 10, newMemberPointMultiplier: 40 });
    assert.equal(clamped.vipMaxPercent, 20);
    assert.equal(clamped.winBackVoucherVnd, 1000);
    assert.equal(clamped.newMemberPointMultiplier, 5);
    assert.equal(publicPolicy(clamped).posGanKhuyenMai, false);
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
    assert.equal(scoreRecency(null), 1);
    assert.equal(scoreFrequency(12), 5);
    assert.equal(scoreFrequency(1), 1);
    assert.equal(scoreFrequency(0), 1);
    assert.equal(scoreMonetary(5000000), 5);
    assert.equal(scoreMonetary(100000), 1);
    assert.equal(scoreMonetary(0), 1);
    assert.equal(segmentFromScores({ r: 5, f: 5, m: 5 }), 'Giá trị cao');
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'src/services/loyaltyAnalytics.js'), 'utf8');
    assert.doesNotMatch(src, /openai|gemini|codecraft|fetch\(/i);
    assert.doesNotMatch(src, /:\s*999\b/);
});

test('Chưa từng mua: không 999, không win-back / at-risk', () => {
    const asOf = '2026-09-10';
    const never = computeCustomerRfm({
        MaKH: 'KH0', TenKH: 'Nguyễn Huệ', HangThanhVien: 'Thường', DiemTichLuy: 0,
        SoHoaDon: 0, TongChiTieu: 0, LanMuaGanNhat: null
    }, asOf);
    assert.equal(never.chuaTungMua, true);
    assert.equal(never.RecencyNgay, null);
    assert.equal(never.soNgayChuaMua, null);
    assert.equal(never.R, 1);
    assert.equal(never.F, 1);
    assert.equal(never.M, 1);
    assert.equal(never.Segment, 'Chưa phát sinh');
    assert.equal(never.GoiY.category, null);
    assert.match(never.GoiY.rfmLyDo, /chưa từng mua/i);

    const dormant = computeCustomerRfm({
        MaKH: 'KH9', TenKH: 'Ngủ đông thật', HangThanhVien: 'Bạc', DiemTichLuy: 80,
        SoHoaDon: 2, TongChiTieu: 400000, LanMuaGanNhat: '2026-01-01'
    }, asOf);
    assert.equal(dormant.chuaTungMua, false);
    assert.equal(dormant.RecencyNgay, 252);
    assert.equal(dormant.soNgayChuaMua, 252);
    assert.equal(dormant.Segment, 'Ngủ đông');
    assert.equal(dormant.GoiY.category, 'win-back');

    const table = computeRfmTable([never, dormant], asOf);
    const summary = summarizeSegments(table);
    assert.equal(summary.atRisk, 1);
    assert.equal(summary.chuaPhatSinh, 1);
    assert.equal(summary.segments['Chưa phát sinh'], 1);
});

test('Áp VIP: không cộng đôi % với KM phần trăm', () => {
    const policy = normalizePolicy({ vipMaxPercent: 10, vipEnabled: true });
    const stacked = mergeLoyaltyDiscount({
        loai: 'VIP', policy, tongTienHang: 200000,
        kmAmount: 30000, kmIsPercent: true, kmPercent: 15
    });
    assert.equal(stacked.tienGiamGia, 30000);
    assert.equal(stacked.tienGiamCS, 0);
    const onlyVip = mergeLoyaltyDiscount({ loai: 'VIP', policy, tongTienHang: 200000 });
    assert.equal(onlyVip.tienGiamGia, 20000);
    assert.equal(onlyVip.giaTri, '10%');
    const over = mergeLoyaltyDiscount({
        loai: 'VIP', policy: normalizePolicy({ vipMaxPercent: 99 }), tongTienHang: 100000
    });
    assert.equal(over.tienGiamGia, 20000);
});

test('Win-back 1 lần, không âm; mới chỉ nhân điểm', () => {
    const policy = normalizePolicy({ winBackVoucherVnd: 20000, newMemberPointMultiplier: 2 });
    const wb = mergeLoyaltyDiscount({ loai: 'win-back', policy, tongTienHang: 15000, kmAmount: 0 });
    assert.equal(wb.tienGiamGia, 15000);
    assert.equal(wb.tienGiamCS, 15000);
    const afterKm = mergeLoyaltyDiscount({ loai: 'win-back', policy, tongTienHang: 100000, kmAmount: 90000 });
    assert.equal(afterKm.tienGiamCS, 10000);
    assert.equal(afterKm.tienGiamGia, 100000);
    const newbie = mergeLoyaltyDiscount({ loai: 'mới', policy, tongTienHang: 80000, kmAmount: 5000 });
    assert.equal(newbie.tienGiamGia, 5000);
    assert.equal(newbie.heSoDiem, 2);
    const off = mergeLoyaltyDiscount({
        loai: 'VIP', policy: normalizePolicy({ vipEnabled: false }), tongTienHang: 100000
    });
    assert.equal(off.tienGiamCS, 0);
    assert.equal(off.loai, null);
});

test('Banner POS đúng chữ chính sách; không auto', () => {
    const vip = offerForSegment('Giá trị cao');
    assert.equal(bannerForOffer(vip), 'Theo chính sách cửa hàng: VIP tối đa 10%');
    assert.equal(publicPolicy().autoApply, false);
    const table = [
        { GoiY: { category: 'VIP' } },
        { GoiY: { category: 'win-back' } },
        { GoiY: { category: 'mới' } }
    ];
    const counts = countOffersFromTable(table, normalizePolicy({}));
    assert.deepEqual(counts, { vip: 1, winBack: 1, moi: 1 });
});

console.log('loyalty RFM tests ok');
