const assert = require('node:assert/strict');
const { calculateGrossProfit, evaluateThreeWayMatch, isRestockAccepted, looksUnsellable, isEqualValueExchange } = require('./src/services/financialRules');
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

test('Đổi trực tiếp chỉ chấp nhận hàng giao đổi ngang giá', () => {
    assert.equal(isEqualValueExchange(250_000, 250_000), true);
    assert.equal(isEqualValueExchange(250_000, 249_000), false);
    assert.equal(isEqualValueExchange(250_000, 251_000), false);
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
