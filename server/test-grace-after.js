const assert = require('node:assert/strict');
const { classifyDutyWindow, GRACE_BEFORE_MINUTES, GRACE_AFTER_MINUTES } = require('./src/services/cashierDuty');
const { scrapLinesFromRows, isUnsellableCountLine } = require('./src/services/countScrap');
const { canCompleteAssignedReturn } = require('./src/services/returnHandover');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

const start = new Date('2026-09-04T08:00:00+07:00');
const end = new Date('2026-09-04T16:00:00+07:00');

test('Grace trước 10 phút vẫn trong ca; sớm hơn là trước ca', () => {
    assert.equal(GRACE_BEFORE_MINUTES, 10);
    assert.equal(classifyDutyWindow(new Date(start.getTime() - 10 * 60000), start, end), 'trong');
    assert.equal(classifyDutyWindow(new Date(start.getTime() - 11 * 60000), start, end), 'truoc');
});

test('Trong giờ ca được bán; sau KetThuc là grace_sau chứ không còn trong', () => {
    assert.equal(classifyDutyWindow(new Date('2026-09-04T12:00:00+07:00'), start, end), 'trong');
    assert.equal(classifyDutyWindow(new Date(end.getTime() + 60000), start, end), 'grace_sau');
});

test('Grace sau 15 phút cho complete-return / đóng ca; hết grace là sau', () => {
    assert.equal(GRACE_AFTER_MINUTES, 15);
    assert.equal(classifyDutyWindow(new Date(end.getTime() + 15 * 60000), start, end), 'grace_sau');
    assert.equal(classifyDutyWindow(new Date(end.getTime() + 16 * 60000), start, end), 'sau');
});

test('Hàng hỏng/hết hạn SLThucTe > 0 mới vào phiếu xuất hủy', () => {
    const lines = scrapLinesFromRows([
        { MaSP: 'A', TenSP: 'A', SLThucTe: 2, TinhTrangHang: 'Hỏng', NguyenNhan: 'Rách' },
        { MaSP: 'B', TenSP: 'B', SLThucTe: 0, TinhTrangHang: 'Hỏng' },
        { MaSP: 'C', TenSP: 'C', SLThucTe: 5, TinhTrangHang: 'Bình thường' },
        { MaSP: 'D', TenSP: 'D', SLThucTe: 1, TinhTrangHang: 'Hết hạn' }
    ]);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].MaSP, 'A');
    assert.equal(lines[0].SoLuong, 2);
    assert.equal(isUnsellableCountLine({ TinhTrangHang: 'Hết hạn', SLThucTe: 1 }), true);
});

test('Phiếu đã bàn giao: thu ngân ca sau cùng quầy được complete', () => {
    const ticket = { TrangThai: 'Đã duyệt', MaNV_Lap: 'NV1', MaNV_XuLy: 'NV2', MaQuayXuLy: 'Q01', NgayBanGiao: new Date() };
    assert.equal(canCompleteAssignedReturn(ticket, 'NV2', 'Q01'), true);
    assert.equal(canCompleteAssignedReturn(ticket, 'NV3', 'Q01'), true);
    assert.equal(canCompleteAssignedReturn(ticket, 'NV3', 'Q02'), false);
    assert.equal(canCompleteAssignedReturn({ ...ticket, TrangThai: 'Hoàn thành' }, 'NV2', 'Q01'), false);
});

console.log('PASS grace-after + scrap-from-count');
