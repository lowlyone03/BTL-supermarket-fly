const assert = require('node:assert/strict');
const {
    scrapLinesFromRows,
    isUnsellableCountLine,
    countStockImpact,
    returnStockImpact,
    countScrapNote,
    returnDiscardNote,
    storedStockImpact
} = require('./src/services/countScrap');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Thiếu + hỏng thì xuất đúng số thiếu, không xuất cả SL thực tế', () => {
    const lines = scrapLinesFromRows([
        { MaSP: 'BK002', SLHeThong: 34, SLThucTe: 30, TinhTrangHang: 'Hỏng', NguyenNhan: 'Hỏng 4 cái', DonGiaBinhQuan: 28000 }
    ]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].SoLuong, 4);
    assert.equal(lines[0].ThanhTien, 112000);
    assert.equal(countStockImpact(lines).KhongTruTon, true);
});

test('Hàng hỏng SL thực tế > 0 mới đưa vào phiếu xuất hủy', () => {
    const lines = scrapLinesFromRows([
        { MaSP: 'A', TenSP: 'A', SLThucTe: 2, TinhTrangHang: 'Hỏng', NguyenNhan: 'Rách', DonGiaBinhQuan: 5000 },
        { MaSP: 'B', TenSP: 'B', SLThucTe: 0, TinhTrangHang: 'Hỏng' },
        { MaSP: 'C', TenSP: 'C', SLThucTe: 5, TinhTrangHang: 'Bình thường' }
    ]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].SoLuong, 2);
    assert.equal(lines[0].ThanhTien, 10000);
    assert.equal(isUnsellableCountLine({ TinhTrangHang: 'Hết hạn', SLThucTe: 1 }), true);
});

test('Kiểm kê: hàng hỏng còn trên kệ thì xác nhận PX sẽ giảm tồn', () => {
    const impact = countStockImpact([
        { MaSP: 'A', TinhTrangHang: 'Hỏng', SLThucTe: 2, SoLuong: 2, SLTonHienTai: 8 }
    ]);
    assert.equal(impact.KhongTruTon, false);
    assert.equal(impact.willDecrease, true);
    assert.match(countScrapNote('KK1', [{ MaSP: 'A', TinhTrangHang: 'Hỏng', SLThucTe: 2 }], impact), /giảm tồn/);
});

test('Kiểm kê: tồn đã hết thì phiếu thông tin không trừ trùng', () => {
    const impact = countStockImpact([
        { MaSP: 'A', TinhTrangHang: 'Hỏng', SLThucTe: 2, SoLuong: 2, SLTonHienTai: 0 }
    ]);
    assert.equal(impact.KhongTruTon, true);
    assert.equal(impact.willDecrease, false);
});

test('Đổi trả loại bỏ: không giảm tồn, ghi nguồn HD/DT và tiền', () => {
    const impact = returnStockImpact();
    assert.equal(impact.KhongTruTon, true);
    const note = returnDiscardNote({
        maDT: 'DT2609040002',
        maHD: 'HD202609040003',
        lyDo: 'Hàng hỏng / lỗi cửa hàng',
        lines: [{ MaSP: 'X', SoLuong: 1, ThanhTien: 15000 }, { MaSP: 'Y', SoLuong: 1, ThanhTien: 20000 }]
    });
    assert.match(note, /không nhập lại kho/);
    assert.match(note, /DT2609040002/);
    assert.match(note, /HD202609040003/);
    assert.match(note, /đã trừ lúc bán/);
});

test('Phiếu lưu MaDT thì xác nhận thông tin, không trừ tồn', () => {
    const stored = storedStockImpact({ MaDT: 'DT1', KhongTruTon: true });
    assert.equal(stored.willDecrease, false);
});

console.log('PASS stock-issue scrap sources');
