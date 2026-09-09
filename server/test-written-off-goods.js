const assert = require('node:assert/strict');
const {
    inferMaDT,
    inferMaKK,
    inferKhongTruTon,
    classifyWrittenOffLine,
    lineValue,
    decorateWrittenOffLine,
    mergeWrittenOffLines,
    summarizeWrittenOffLines
} = require('./src/services/writtenOffGoods');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Phân loại tận dụng nội bộ, hủy kiểm kê, đổi trả loại bỏ và hủy thường', () => {
    assert.equal(classifyWrittenOffLine({ LoaiXuat: 'Sử dụng nội bộ' }).PhanLoai, 'Tận dụng — nhân viên sử dụng');
    assert.equal(classifyWrittenOffLine({ LoaiXuat: 'Hủy hàng', MaKK: 'KK20260908001' }).PhanLoai, 'Hủy từ kiểm kê');
    assert.equal(classifyWrittenOffLine({ LoaiXuat: 'Hủy hàng', MaDT: 'DT20260908001' }).PhanLoai, 'Đổi trả loại bỏ — không nhập lại kho bán');
    assert.equal(classifyWrittenOffLine({ LoaiXuat: 'Hủy hàng' }).PhanLoai, 'Hủy hàng');
});

test('Suy ra MaDT / MaKK từ ghi chú phiếu cũ', () => {
    assert.equal(inferMaDT({ GhiChu: 'Nguồn đổi trả DT20260908111. Không trừ tồn lần nữa.' }), 'DT20260908111');
    assert.equal(inferMaDT({ GhiChu: 'Hàng khách trả hỏng. Nguồn DT20260908222 / hóa đơn HD1.' }), 'DT20260908222');
    assert.equal(inferMaKK({ GhiChu: 'Hàng hỏng phát hiện khi kiểm kê KK20260908333. Phiếu thông tin — không trừ trùng.' }), 'KK20260908333');
});

test('KhongTruTon theo cột, theo MaDT hoặc theo chữ không trừ', () => {
    assert.equal(inferKhongTruTon({ KhongTruTon: 1 }), true);
    assert.equal(inferKhongTruTon({ MaDT: 'DT1' }), true);
    assert.equal(inferKhongTruTon({ GhiChu: 'Phiếu thông tin — không trừ trùng' }), true);
    assert.equal(inferKhongTruTon({ LoaiXuat: 'Hủy hàng' }), false);
    assert.match(classifyWrittenOffLine({ MaDT: 'DT1' }).AnhHuongTon, /Không trừ tồn lần nữa/);
    assert.match(classifyWrittenOffLine({ LoaiXuat: 'Hủy hàng' }).AnhHuongTon, /Đã giảm tồn/);
});

test('Giá trị đổi trả ưu tiên vốn, phiếu cũ thiếu đơn giá thì tiền = 0', () => {
    assert.equal(lineValue({ SoLuong: 2, ThanhTienVon: 16000, DonGia: 90000 }), 16000);
    assert.equal(lineValue({ SoLuong: 2, DonGiaVon: 7000, DonGia: 90000 }), 14000);
    assert.equal(lineValue({ SoLuong: 3, DonGia: 5000 }), 15000);
    assert.equal(decorateWrittenOffLine({ SoLuong: 4, DonGia: 0, GiaTri: 0 }).GiaTri, 0);
});

test('Không đếm trùng đổi trả khi đã có phiếu xuất MaDT+MaSP', () => {
    const lines = mergeWrittenOffLines(
        [{ MaPX: 'PX1', NgayXuat: '2026-09-08', LoaiXuat: 'Hủy hàng', MaDT: 'DT1', MaSP: 'SP1', TenSP: 'Sữa', SoLuong: 2, DonGia: 8000, GiaTri: 16000 }],
        [
            { MaDT: 'DT1', MaSP: 'SP1', TenSP: 'Sữa', SoLuong: 2, DonGiaVon: 8000, ThanhTienVon: 16000 },
            { MaDT: 'DT1', MaSP: 'SP2', TenSP: 'Bánh', SoLuong: 1, DonGiaVon: 3000, ThanhTienVon: 3000 },
            { MaDT: 'DT2', MaSP: 'SP3', TenSP: 'Kẹo', SoLuong: 5, DonGia: 1000, ThanhTien: 5000 }
        ]
    );
    assert.equal(lines.length, 3);
    assert.ok(lines.some(row => row.MaPX === 'PX1' && row.MaSP === 'SP1'));
    assert.ok(lines.some(row => !row.MaPX && row.MaDT === 'DT1' && row.MaSP === 'SP2'));
    assert.ok(lines.some(row => !row.MaPX && row.MaDT === 'DT2' && row.MaSP === 'SP3'));
    assert.ok(!lines.some(row => !row.MaPX && row.MaDT === 'DT1' && row.MaSP === 'SP1'));
});

test('Tóm tắt: hủy gồm KK/DT, tận dụng riêng, tổng không cộng trùng đổi trả', () => {
    const lines = mergeWrittenOffLines([
        { MaPX: 'PX1', LoaiXuat: 'Hủy hàng', MaKK: 'KK1', MaSP: 'A', SoLuong: 2, DonGia: 1000, GiaTri: 2000 },
        { MaPX: 'PX2', LoaiXuat: 'Sử dụng nội bộ', MaSP: 'B', SoLuong: 3, DonGia: 2000, GiaTri: 6000 },
        { MaPX: 'PX3', LoaiXuat: 'Hủy hàng', MaDT: 'DT1', MaSP: 'C', SoLuong: 1, DonGia: 4000, GiaTri: 4000 }
    ], []);
    const summary = summarizeWrittenOffLines(lines);
    assert.equal(summary.SoPhieu, 3);
    assert.equal(summary.SoMatHang, 3);
    assert.equal(summary.SLHuy, 3);
    assert.equal(summary.GiaTriHuy, 6000);
    assert.equal(summary.SLTanDung, 3);
    assert.equal(summary.GiaTriTanDung, 6000);
    assert.equal(summary.SLDoiTraLoaiBo, 1);
    assert.equal(summary.GiaTriDoiTraLoaiBo, 4000);
    assert.equal(summary.TongSoLuong, 6);
    assert.equal(summary.TongGiaTri, 12000);
});

console.log('WRITTEN-OFF GOODS PASS: phân loại, suy nguồn, giá trị vốn và chống đếm trùng.');
