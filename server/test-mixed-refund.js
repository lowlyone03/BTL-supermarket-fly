const assert = require('node:assert/strict');
const {
    allocateRefund, previewRefundAllocation, paidByMethod, refundedByMethod, remainingByMethod,
    summarizeRefundTicketStatus, cashRefundDrawerBlock, cashRefundDrawerShort, expectedDrawerCash,
    exchangeMoneyDelta, cashierMayRefundCash, collectExtraNote, isCollectExtraPayment,
    RETURN_MONEY_PENDING, RETURN_MONEY_FAILED, RETURN_MONEY_WAITING
} = require('./src/services/financialRules');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

const HD001_PAYMENTS = [
    { PhuongThuc: 'Tiền mặt', SoTien: 300_000, TrangThai: 'Thành công' },
    { PhuongThuc: 'QR', SoTien: 700_000, TrangThai: 'Thành công' }
];

test('T0 HD001 đã thu TM 300 + QR 700 — không gộp thành một PT', () => {
    const paid = paidByMethod(HD001_PAYMENTS);
    assert.equal(paid.TM, 300_000);
    assert.equal(paid.QR, 700_000);
    assert.equal(cashierMayRefundCash('QR'), true);
});

test('T1 trả 200k → QR 200, TM 0; két không đụng', () => {
    const preview = previewRefundAllocation({ need: 200_000, payments: HD001_PAYMENTS });
    assert.equal(preview.allocation.ok, true);
    assert.equal(preview.allocation.hoanQr, 200_000);
    assert.equal(preview.allocation.hoanTm, 0);
    assert.equal(preview.allocation.qrRemainingAfter, 500_000);
    assert.equal(preview.allocation.cashRemainingAfter, 300_000);
    const drawer = expectedDrawerCash({ TienDauCa: 1_000_000, TongTienMat: 300_000, TongTienHoanMat: 0 });
    assert.equal(drawer, 1_300_000);
});

test('T2 trả tiếp 600k → QR 500 + TM 100', () => {
    const lines = [{ PhuongThuc: 'QR', SoTienHoan: 200_000, TrangThaiHoan: 'THANH_CONG', MaPhieuTra: 'DT1' }];
    const preview = previewRefundAllocation({
        need: 600_000, payments: HD001_PAYMENTS, refundLines: lines
    });
    assert.equal(preview.remaining.QR, 500_000);
    assert.equal(preview.remaining.TM, 300_000);
    assert.equal(preview.allocation.hoanQr, 500_000);
    assert.equal(preview.allocation.hoanTm, 100_000);
    assert.equal(preview.allocation.qrRemainingAfter, 0);
    assert.equal(preview.allocation.cashRemainingAfter, 200_000);
});

test('T3 trả tiếp 200k → chỉ TM 200', () => {
    const lines = [
        { PhuongThuc: 'QR', SoTienHoan: 200_000, TrangThaiHoan: 'THANH_CONG', MaPhieuTra: 'DT1' },
        { PhuongThuc: 'QR', SoTienHoan: 500_000, TrangThaiHoan: 'THANH_CONG', MaPhieuTra: 'DT2' },
        { PhuongThuc: 'Tiền mặt', SoTienHoan: 100_000, TrangThaiHoan: 'THANH_CONG', MaPhieuTra: 'DT2' }
    ];
    const preview = previewRefundAllocation({
        need: 200_000, payments: HD001_PAYMENTS, refundLines: lines
    });
    assert.equal(preview.remaining.QR, 0);
    assert.equal(preview.remaining.TM, 200_000);
    assert.equal(preview.allocation.hoanQr, 0);
    assert.equal(preview.allocation.hoanTm, 200_000);
    const refunded = refundedByMethod(lines);
    assert.equal(refunded.QR, 700_000);
    assert.equal(refunded.TM, 100_000);
});

test('T4 két thiếu 100k khi cần TM 200k — không két âm, chờ xử lý', () => {
    const short = cashRefundDrawerShort({ soTienHoan: 200_000, tienMatTrongKet: 100_000 });
    assert.equal(short.need, 200_000);
    assert.equal(short.avail, 100_000);
    assert.equal(short.short, 100_000);
    assert.equal(short.blocked, true);
    const msg = cashRefundDrawerBlock({ soTienHoan: 200_000, tienMatTrongKet: 100_000 });
    assert.match(msg, /Không đủ tiền mặt để hoàn/);
    assert.match(msg, /200/);
    assert.match(msg, /100/);
    const afterIfPaidAnyway = expectedDrawerCash({
        TienDauCa: 1_000_000, TongTienMat: 300_000, TongTienHoanMat: 200_000
    });
    assert.ok(afterIfPaidAnyway >= 1_100_000, 'không trừ TM khi chưa chi');
    const ifForced = expectedDrawerCash({
        TienDauCa: 0, TongTienMat: 100_000, TongTienHoanMat: 200_000
    });
    assert.equal(ifForced, -100_000);
    assert.ok(ifForced < 0, 'công thức có thể ra âm — chặn ở drawer block, không ghi két');
});

test('T5 trả hết 1tr → QR 700 + TM 300; két chỉ −300k', () => {
    const preview = previewRefundAllocation({ need: 1_000_000, payments: HD001_PAYMENTS });
    assert.equal(preview.allocation.hoanQr, 700_000);
    assert.equal(preview.allocation.hoanTm, 300_000);
    const drawer = expectedDrawerCash({
        TienDauCa: 1_000_000, TongTienMat: 300_000, TongTienHoanMat: 300_000
    });
    assert.equal(drawer, 1_000_000);
    assert.notEqual(drawer, 1_000_000 - 1_000_000 + 1_000_000 - 1_000_000);
});

test('T6 đổi ngang 600↔600 = 0 tiền', () => {
    const delta = exchangeMoneyDelta(600_000, 600_000);
    assert.equal(delta.kind, 'equal');
    assert.equal(delta.soTienHoan, 0);
    assert.equal(delta.soTienThuThem, 0);
    const allocation = allocateRefund(delta.soTienHoan, { QR: 700_000, TM: 300_000 });
    assert.equal(allocation.hoanQr, 0);
    assert.equal(allocation.hoanTm, 0);
});

test('T7 đổi đắt hơn 600→800 = thu thêm 200 (khoản thu mới, không hoàn)', () => {
    const delta = exchangeMoneyDelta(600_000, 800_000);
    assert.equal(delta.kind, 'collect');
    assert.equal(delta.soTienThuThem, 200_000);
    assert.equal(delta.soTienHoan, 0);
    const note = collectExtraNote('DT0099');
    assert.match(note, /Thu chênh đổi hàng DT0099/);
    assert.equal(isCollectExtraPayment({ GhiChu: note }), true);
    assert.equal(isCollectExtraPayment({ GhiChu: 'Tiền mặt quầy' }), false);
});

test('T8 đổi rẻ hơn 600→400; QR còn 50 → QR 50 + TM 150', () => {
    const delta = exchangeMoneyDelta(600_000, 400_000);
    assert.equal(delta.kind, 'refund');
    assert.equal(delta.soTienHoan, 200_000);
    const allocation = allocateRefund(200_000, { QR: 50_000, TM: 300_000 });
    assert.equal(allocation.hoanQr, 50_000);
    assert.equal(allocation.hoanTm, 150_000);
});

test('T9 báo cáo ca: sau hoàn QR 200, TM 300, két = 1.3tr', () => {
    const paid = paidByMethod(HD001_PAYMENTS);
    const refunded = refundedByMethod([
        { PhuongThuc: 'QR', SoTienHoan: 200_000, TrangThaiHoan: 'THANH_CONG' }
    ]);
    assert.equal(paid.TM, 300_000);
    assert.equal(paid.QR, 700_000);
    assert.equal(refunded.QR, 200_000);
    const qrRong = paid.QR - refunded.QR;
    assert.equal(qrRong, 500_000);
    const ket = expectedDrawerCash({ TienDauCa: 1_000_000, TongTienMat: 300_000, TongTienHoanMat: 0 });
    assert.equal(ket, 1_300_000);
});

test('T10 phiếu tổng hợp ≠ dòng: QR DANG_XU_LY + TM THANH_CONG', () => {
    const header = summarizeRefundTicketStatus([
        { PhuongThuc: 'QR', TrangThaiHoan: 'DANG_XU_LY', SoTienHoan: 500_000 },
        { PhuongThuc: 'Tiền mặt', TrangThaiHoan: 'THANH_CONG', SoTienHoan: 100_000 }
    ]);
    assert.equal(header, RETURN_MONEY_PENDING);
    const waiting = summarizeRefundTicketStatus([
        { PhuongThuc: 'QR', TrangThaiHoan: 'THANH_CONG', SoTienHoan: 500_000 },
        { PhuongThuc: 'Tiền mặt', TrangThaiHoan: 'CHO_XU_LY', SoTienHoan: 200_000 }
    ]);
    assert.equal(waiting, RETURN_MONEY_WAITING);
    const failed = summarizeRefundTicketStatus([
        { PhuongThuc: 'QR', TrangThaiHoan: 'THAT_BAI', SoTienHoan: 200_000 }
    ]);
    assert.equal(failed, RETURN_MONEY_FAILED);
    const done = summarizeRefundTicketStatus([
        { PhuongThuc: 'QR', TrangThaiHoan: 'THANH_CONG' },
        { PhuongThuc: 'Tiền mặt', TrangThaiHoan: 'THANH_CONG' }
    ]);
    assert.equal(done, 'Hoàn thành');
});

test('Legacy phiếu 1 PT không có dòng con vẫn cộng vào đã hoàn', () => {
    const refunded = refundedByMethod([], [{
        MaDT: 'DT_OLD', TrangThai: 'Hoàn thành', PhuongThucHoan: 'QR', SoTienHoan: 200_000
    }]);
    assert.equal(refunded.QR, 200_000);
    const remaining = remainingByMethod(paidByMethod(HD001_PAYMENTS), refunded);
    assert.equal(remaining.QR, 500_000);
});

test('Không hoàn vượt cap từng PT', () => {
    const over = allocateRefund(2_000_000, { QR: 700_000, TM: 300_000 });
    assert.equal(over.ok, false);
    assert.equal(over.exceedsCap, true);
    assert.equal(over.hoanQr, 0);
    assert.equal(over.hoanTm, 0);
});

console.log('MIXED REFUND PASS: allocate QR-trước-TM, 3 case HD001, két thiếu, đổi ngang/đắt/rẻ, dòng ≠ header.');
