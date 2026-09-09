const assert = require('node:assert/strict');
const {
    splitVatInclusive,
    splitVatExclusive,
    snapshotSaleTaxes,
    reverseSaleVat,
    purchaseReturnFromSnapshot,
    assertChosenRate
} = require('./src/services/vatSales');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Giá bán gồm VAT: 108.000đ 8% → thuế 8.000, thuần 100.000', () => {
    const split = splitVatInclusive(108000, 8);
    assert.equal(split.vat, 8000);
    assert.equal(split.net, 100000);
    assert.equal(split.missing, false);
});

test('Thuế 0% hợp lệ, NULL là thiếu thuế', () => {
    const zero = splitVatInclusive(50000, 0);
    assert.equal(zero.vat, 0);
    assert.equal(zero.net, 50000);
    const missing = splitVatInclusive(50000, null);
    assert.equal(missing.missing, true);
    assert.equal(assertChosenRate(0), 0);
    assert.throws(() => assertChosenRate(null), /chưa chọn/);
});

test('KM + điểm trừ trước khi tách VAT; 2 dòng 8% và 10%', () => {
    const snap = snapshotSaleTaxes([
        { MaSP: 'A', ThanhTien: 108000, ThueSuat: 8 },
        { MaSP: 'B', ThanhTien: 110000, ThueSuat: 10 }
    ], 196200);
    assert.equal(snap.lines.length, 2);
    assert.ok(snap.lines.every(line => [8, 10].includes(line.ThueSuat)));
    assert.equal(snap.lines.reduce((s, l) => s + l.ThanhTienSauGiam, 0), 196200);
    assert.ok(snap.TienThue > 0);
});

test('Hoàn hàng bán đảo theo snapshot dòng HĐ, không theo thuế SP hiện tại', () => {
    const split = reverseSaleVat({
        hoanGomVat: 108000,
        thueSuatDongGoc: 8
    });
    assert.equal(split.vat, 8000);
    assert.equal(split.net, 100000);
});

test('TRA_NCC_HANG lấy VAT từ snapshot ChiTietHoaDonMuaHang', () => {
    const part = purchaseReturnFromSnapshot({
        soLuongTra: 2,
        soLuongHoaDon: 10,
        thanhTienHang: 100000,
        tienThueDong: 8000,
        thueSuatDong: 8
    });
    assert.equal(part.hang, 20000);
    assert.equal(part.thue, 1600);
    assert.equal(part.tong, 21600);
});

test('Không bịa 10% khi dòng HĐ cũ thiếu thuế', () => {
    const split = reverseSaleVat({ hoanGomVat: 100000, thueSuatDongGoc: null });
    assert.equal(split.missing, true);
    assert.equal(split.vat, 0);
});

console.log('VAT SALES PASS');
