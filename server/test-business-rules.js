const assert = require('node:assert/strict');
const { calculateGrossProfit, evaluateThreeWayMatch, isRestockAccepted, looksUnsellable, isEqualValueExchange, expectedDrawerCash, cashHandoverExcludingOpening, defaultRefundMethod, originalInvoicePayMethod, canonicalRefundMethod, cashRefundExceedsDrawer, cashRefundDrawerWarning, cashRefundDrawerBlock, cashierMayRefundCash, exchangeMoneyDelta, refundableQrRemaining, qrRefundWouldExceedCap, nextRefundSendAction, qrNet, zpTransIdOf, allocateRefund } = require('./src/services/financialRules');
const { resolveReportingPeriod } = require('./src/services/reportingPeriod');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Lãi gộp không có đổi trả giữ công thức cơ bản', () => {
    const result = calculateGrossProfit({ DoanhThuHoaDon: 1_000_000, GiaVonHoaDon: 600_000 });
    assert.equal(result.DoanhThuThuan, 1_000_000);
    assert.equal(result.GiaVonHangBanThuan, 600_000);
    assert.equal(result.LoiNhuanGop, 400_000);
});

test('Hoàn tiền và hàng trả nhập lại cùng làm giảm doanh thu, giảm giá vốn', () => {
    const result = calculateGrossProfit({
        DoanhThuHoaDon: 1_000_000,
        TienHoan: 200_000,
        GiaVonHoaDon: 600_000,
        GiaVonHangTraNhapLai: 120_000
    });
    assert.equal(result.DoanhThuThuan, 800_000);
    assert.equal(result.GiaVonHangBanThuan, 480_000);
    assert.equal(result.LoiNhuanGop, 320_000);
});

test('Ví dụ trang 33/34: hoàn tiền và hàng trả nhập lại, chưa có giao đổi', () => {
    const result = calculateGrossProfit({
        DoanhThuHoaDon: 100_000_000,
        TienHoan: 5_000_000,
        GiaVonHoaDon: 75_000_000,
        GiaVonHangTraNhapLai: 4_000_000
    });
    assert.equal(result.DoanhThuThuan, 95_000_000);
    assert.equal(result.GiaVonHangBanThuan, 71_000_000);
    assert.equal(result.LoiNhuanGop, 24_000_000);
});

test('Hàng không nhập lại kho không được trừ giá vốn', () => {
    const result = calculateGrossProfit({
        DoanhThuHoaDon: 1_000_000,
        TienHoan: 200_000,
        GiaVonHoaDon: 600_000,
        GiaVonHangTraNhapLai: 0
    });
    assert.equal(result.GiaVonHangBanThuan, 600_000);
    assert.equal(result.LoiNhuanGop, 200_000);
});

test('Hàng giao đổi làm tăng giá vốn thuần', () => {
    const result = calculateGrossProfit({
        DoanhThuHoaDon: 1_000_000,
        GiaVonHoaDon: 600_000,
        GiaVonHangTraNhapLai: 120_000,
        GiaVonHangGiaoDoi: 150_000
    });
    assert.equal(result.GiaVonHangBanThuan, 630_000);
    assert.equal(result.LoiNhuanGop, 370_000);
});

test('Két dự kiến = quỹ đầu ca + thu TM − hoàn TM; được nhỏ hơn quỹ đầu ca', () => {
    assert.equal(expectedDrawerCash({ TienDauCa: 1_000_000, TongTienMat: 0, TongTienHoanMat: 218_000 }), 782_000);
    assert.equal(cashHandoverExcludingOpening(782_000, 1_000_000), -218_000);
    assert.equal(expectedDrawerCash({ TienDauCa: 1_000_000, TongTienMat: 500_000, TongTienHoanMat: 0 }), 1_500_000);
});

test('Hoàn tiền mặc định cùng kênh hóa đơn gốc; QR/ZaloPay không mặc định tiền mặt', () => {
    assert.equal(canonicalRefundMethod('ZaloPay'), 'QR');
    assert.equal(defaultRefundMethod('QR'), 'QR');
    assert.equal(defaultRefundMethod('Tiền mặt'), 'Tiền mặt');
    assert.equal(defaultRefundMethod('Thẻ'), 'Thẻ');
    assert.equal(defaultRefundMethod('Chuyển khoản'), 'Chuyển khoản');
    assert.equal(defaultRefundMethod(''), 'Tiền mặt');
    assert.equal(originalInvoicePayMethod([
        { PhuongThuc: 'Tiền mặt', SoTien: 20_000, TrangThai: 'Thành công' },
        { PhuongThuc: 'QR', SoTien: 180_000, TrangThai: 'Thành công' }
    ]), 'QR');
    assert.equal(defaultRefundMethod(null, [{ PhuongThuc: 'QR', SoTien: 90_000, TrangThai: 'Thành công' }]), 'QR');
    assert.equal(defaultRefundMethod(null, [{ PhuongThuc: 'ZaloPay', SoTien: 50_000, TrangThai: 'Thành công' }]), 'QR');
});

test('Chặn cứng két thiếu khi hoàn TM — không cho phép két âm', () => {
    assert.equal(cashRefundExceedsDrawer(300_000, 200_000), true);
    assert.equal(cashRefundExceedsDrawer(200_000, 200_000), false);
    const block = cashRefundDrawerBlock({ soTienHoan: 300_000, tienMatTrongKet: 200_000 });
    assert.match(block, /200/);
    assert.match(block, /300/);
    assert.match(block, /Không đủ tiền mặt để hoàn/i);
    assert.match(block, /thiếu/i);
    assert.equal(cashRefundDrawerWarning({ soTienHoan: 100_000, tienMatTrongKet: 200_000 }), '');
    assert.equal(cashierMayRefundCash('QR'), true);
    assert.equal(cashierMayRefundCash('Tiền mặt'), true);
    const split = allocateRefund(600_000, { QR: 500_000, TM: 300_000 });
    assert.equal(split.hoanQr, 500_000);
    assert.equal(split.hoanTm, 100_000);
});

test('Hoàn QR không đổi két dự kiến; expectedDrawerCash không được dùng để cho phép két âm', () => {
    const before = expectedDrawerCash({ TienDauCa: 1_000_000, TongTienMat: 0, TongTienHoanMat: 0 });
    const afterQrRefund = expectedDrawerCash({ TienDauCa: 1_000_000, TongTienMat: 0, TongTienHoanMat: 0 });
    assert.equal(before, afterQrRefund);
    assert.equal(qrNet({ TongTienQR: 5_000_000, TongTienHoanQR: 1_200_000 }), 3_800_000);
    assert.ok(expectedDrawerCash({ TienDauCa: 1_000_000, TongTienMat: 0, TongTienHoanMat: 8_000_000 }) < 0);
});

test('Đổi ngang = 0 tiền; rẻ hơn = hoàn chênh; đắt hơn = thu chênh', () => {
    assert.deepEqual(exchangeMoneyDelta(250_000, 250_000), { kind: 'equal', amount: 0, soTienHoan: 0, soTienThuThem: 0 });
    assert.equal(isEqualValueExchange(250_000, 250_000), true);
    const cheaper = exchangeMoneyDelta(500_000, 300_000);
    assert.equal(cheaper.kind, 'refund');
    assert.equal(cheaper.soTienHoan, 200_000);
    const dearer = exchangeMoneyDelta(500_000, 700_000);
    assert.equal(dearer.kind, 'collect');
    assert.equal(dearer.soTienThuThem, 200_000);
});

test('Trần hoàn QR = đã thu QR − đã hoàn thành công; không vượt HĐ', () => {
    assert.equal(refundableQrRemaining(5_000_000, 1_200_000), 3_800_000);
    assert.equal(qrRefundWouldExceedCap(800_000, 5_000_000, 1_200_000), false);
    assert.equal(qrRefundWouldExceedCap(3_800_001, 5_000_000, 1_200_000), true);
    assert.equal(qrRefundWouldExceedCap(5_000_000, 5_000_000, 0), false);
    assert.equal(zpTransIdOf({ MaGiaoDich: '2609110001' }), '2609110001');
    assert.equal(zpTransIdOf({ GhiChu: 'zp_trans_id:abc.1' }), 'abc.1');
    assert.equal(zpTransIdOf({}), '');
});

test('PROCESSING chỉ Query — không mint m_refund_id mới', () => {
    assert.equal(nextRefundSendAction({ currentTxStatus: 'DANG_XU_LY' }), 'query_only');
    assert.equal(nextRefundSendAction({ queryClassification: 'pending' }), 'query_only');
    assert.equal(nextRefundSendAction({ currentTxStatus: 'THANH_CONG' }), 'already_done');
    assert.equal(nextRefundSendAction({ currentTxStatus: 'THAT_BAI' }), 'resend_after_fail');
    assert.equal(nextRefundSendAction({ currentTxStatus: 'CHO_GUI' }), 'create');
});

const matchedInput = () => ({
    invoice: { TongTienHang: 200_000, TienThue: 16_000, TongCong: 216_000 },
    invoiceLines: [{
        MaSP: 'SP01', TenSP: 'Sản phẩm test', DonViTinh: 'Hộp', SoLuong: 2,
        DonGia: 100_000, ThanhTien: 200_000, ThueSuat: 8, TienThue: 16_000
    }],
    receipt: { TongTien: 200_000 },
    receiptLines: [{
        MaSP: 'SP01', TenSP: 'Sản phẩm test', DonViTinh: 'Hộp', SoLuongDat: 2,
        SoLuongChapNhan: 2, DonGiaDonMua: 100_000, DonGiaNhap: 100_000,
        ThanhTienPhieuNhap: 200_000
    }]
});

test('UC27 khớp khi sản phẩm, số lượng, ba mức giá, thuế và tổng tiền đều đúng', () => {
    const result = evaluateThreeWayMatch(matchedInput());
    assert.equal(result.matched, true);
    assert.deepEqual(result.differenceMessages, []);
    assert.equal(result.totals.TongCongTinhLai, 216_000);
    assert.equal(result.rows[0].KetQuaThue, 'Khớp');
});

test('UC27 chặn công nợ khi tiền thuế dòng sai', () => {
    const input = matchedInput();
    input.invoiceLines[0].TienThue = 15_000;
    input.invoice.TienThue = 15_000;
    input.invoice.TongCong = 215_000;
    const result = evaluateThreeWayMatch(input);
    assert.equal(result.matched, false);
    assert.ok(result.differences.some(item => item.code === 'LINE_TAX_MISMATCH'));
});

test('UC27 chặn công nợ khi tổng cộng hóa đơn sai', () => {
    const input = matchedInput();
    input.invoice.TongCong = 215_000;
    const result = evaluateThreeWayMatch(input);
    assert.equal(result.matched, false);
    assert.ok(result.differences.some(item => item.code === 'INVOICE_GRAND_TOTAL_MISMATCH'));
});

test('UC27 phát hiện giá Phiếu nhập khác Đơn mua dù giá hóa đơn trùng một bên', () => {
    const input = matchedInput();
    input.receiptLines[0].DonGiaNhap = 99_000;
    input.receiptLines[0].ThanhTienPhieuNhap = 198_000;
    input.receipt.TongTien = 198_000;
    const result = evaluateThreeWayMatch(input);
    assert.equal(result.matched, false);
    assert.ok(result.differences.some(item => item.code === 'ORDER_RECEIPT_PRICE_MISMATCH'));
    assert.ok(result.differences.some(item => item.code === 'RECEIPT_INVOICE_HEADER_MISMATCH'));
});

test('UC27 chặn công nợ khi thiếu sản phẩm trên hóa đơn', () => {
    const input = matchedInput();
    input.invoiceLines = [];
    input.invoice.TongTienHang = 0;
    input.invoice.TienThue = 0;
    input.invoice.TongCong = 0;
    const result = evaluateThreeWayMatch(input);
    assert.equal(result.matched, false);
    assert.ok(result.differences.some(item => item.code === 'MISSING_INVOICE_PRODUCT'));
});

test('UC27 chặn công nợ khi tổng tiền thuế header lệch tổng dòng', () => {
    const input = matchedInput();
    input.invoice.TienThue = 20_000;
    input.invoice.TongCong = 220_000;
    const result = evaluateThreeWayMatch(input);
    assert.equal(result.matched, false);
    assert.ok(result.differences.some(item => item.code === 'INVOICE_TAX_HEADER_MISMATCH'));
});

test('Chỉ hàng đạt yêu cầu mới được tính nhập lại kho', () => {
    assert.equal(isRestockAccepted('Đạt yêu cầu, được nhập lại kho. Bao bì còn nguyên.'), true);
    assert.equal(isRestockAccepted('Không đạt, không nhập lại kho. Hàng hỏng.'), false);
    assert.equal(looksUnsellable('hỏng'), true);
    assert.equal(looksUnsellable('Hàng hỏng / lỗi cửa hàng'), true);
    assert.equal(looksUnsellable('Khách đổi ý'), false);
});

test('Kỳ báo cáo ngày có đúng hai biên ngày', () => {
    assert.deepEqual(resolveReportingPeriod({ periodType: 'day', period: '2026-08-28' }), {
        periodType: 'day', period: '2026-08-28', from: '2026-08-28', toExclusive: '2026-08-29',
        to: '2026-08-28', label: 'Ngày 28/08/2026'
    });
});

test('Kỳ báo cáo quý 4 chạy qua năm kế tiếp', () => {
    const result = resolveReportingPeriod({ periodType: 'quarter', period: '2026-Q4' });
    assert.equal(result.from, '2026-10-01');
    assert.equal(result.toExclusive, '2027-01-01');
    assert.equal(result.to, '2026-12-31');
});

test('Kỳ báo cáo từ chối tháng không tồn tại', () => {
    assert.throws(() => resolveReportingPeriod({ periodType: 'month', period: '2026-13' }), /không hợp lệ/);
});

console.log('\nTất cả kiểm thử quy tắc nghiệp vụ đã đạt.');
