'use strict';

const assert = require('node:assert/strict');
const {
    OVERDUE_EXTENSION_DAYS,
    resolvePayAmount,
    daysOverdue,
    needsPurchasingExtension,
    displayDebtStatus
} = require('./src/services/payableMath');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Một lần = hết số còn lại; còn lại sau chi không âm', () => {
    const planned = resolvePayAmount({ remaining: 1_250_000, loai: 'MotLan' });
    assert.equal(planned.loai, 'MotLan');
    assert.equal(planned.amount, 1_250_000);
    assert.equal(planned.remainingAfter, 0);
    assert.equal(planned.capped, false);
    assert.equal(planned.percentOfOriginal(2_000_000), 100);
});

test('Theo % trên số còn lại, làm tròn VND', () => {
    const planned = resolvePayAmount({ remaining: 1_000_000, loai: 'PhanTram', phanTram: 40 });
    assert.equal(planned.loai, 'PhanTram');
    assert.equal(planned.amount, 400_000);
    assert.equal(planned.remainingAfter, 600_000);
    assert.equal(planned.percentOfRemaining, 40);
    assert.equal(planned.percentOfOriginal(2_000_000), 70);
});

test('Số tùy ý lớn hơn còn lại thì cắt về còn lại', () => {
    const planned = resolvePayAmount({ remaining: 500_000, loai: 'SoTien', soTien: 9_999_999 });
    assert.equal(planned.amount, 500_000);
    assert.equal(planned.capped, true);
    assert.equal(planned.remainingAfter, 0);
});

test('Số tùy ý hợp lệ giữ phần còn lại', () => {
    const planned = resolvePayAmount({ remaining: 800_000, loai: 'SoTien', soTien: 250_000.4 });
    assert.equal(planned.amount, 250_000.4);
    assert.equal(planned.remainingAfter, 549_999.6);
});

test('Không cho lập phiếu khi còn lại = 0; % ngoài (0,100] lỗi', () => {
    assert.throws(() => resolvePayAmount({ remaining: 0, loai: 'MotLan' }), /tất toán|không còn/i);
    assert.throws(() => resolvePayAmount({ remaining: 100, loai: 'PhanTram', phanTram: 0 }), /Phần trăm/);
    assert.throws(() => resolvePayAmount({ remaining: 100, loai: 'PhanTram', phanTram: 101 }), /Phần trăm/);
    assert.throws(() => resolvePayAmount({ remaining: 100, loai: 'SoTien', soTien: 0 }), /lớn hơn 0/);
});

test('Quá hạn 45 ngày mới cần mua hàng xin gia hạn', () => {
    assert.equal(OVERDUE_EXTENSION_DAYS, 45);
    const today = new Date(2026, 8, 11);
    const due45 = new Date(2026, 6, 28);
    const due44 = new Date(2026, 6, 29);
    assert.equal(daysOverdue(due45, today), 45);
    assert.equal(daysOverdue(due44, today), 44);
    assert.equal(needsPurchasingExtension({ soTienConLai: 1, hanThanhToan: due45, today }), true);
    assert.equal(needsPurchasingExtension({ soTienConLai: 1, hanThanhToan: due44, today }), false);
    assert.equal(needsPurchasingExtension({ soTienConLai: 0, hanThanhToan: due45, today }), false);
});

test('Trạng thái hiển thị: đã trả / một phần / quá hạn / chưa thanh toán', () => {
    const today = new Date(2026, 8, 11);
    assert.equal(displayDebtStatus({ soTienConLai: 0, soTienDaTra: 100, hanThanhToan: today, today }), 'Đã thanh toán');
    assert.equal(displayDebtStatus({
        soTienNo: 100, soTienDaTra: 40, soTienConLai: 60,
        hanThanhToan: new Date(2026, 8, 20), today
    }), 'Thanh toán một phần');
    assert.equal(displayDebtStatus({
        soTienNo: 100, soTienDaTra: 0, soTienConLai: 100,
        hanThanhToan: new Date(2026, 8, 20), today
    }), 'Chưa thanh toán');
    assert.equal(displayDebtStatus({
        soTienNo: 100, soTienDaTra: 10, soTienConLai: 90,
        hanThanhToan: new Date(2026, 6, 1), today
    }), 'Quá hạn');
});

console.log('payable-math tests ok');
