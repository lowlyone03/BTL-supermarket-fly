const assert = require('node:assert/strict');
const { classifyDutyWindow, GRACE_BEFORE_MINUTES, GRACE_AFTER_MINUTES } = require('./src/services/cashierDuty');
const { scrapLinesFromRows, isUnsellableCountLine } = require('./src/services/countScrap');
const { canCompleteAssignedReturn, canActOnAssignedReturn, canClaimLeftoverReturn } = require('./src/services/returnHandover');
const { canHandleReturnCounter, canRunSalesCounter } = require('./src/services/cashierDuty');

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

test('Phiếu đã bàn giao: phải tiếp nhận rồi mới complete trên ca mới', () => {
    const leftover = { TrangThai: 'Đã duyệt', MaNV_Lap: 'NV1', MaNV_XuLy: null, MaQuayXuLy: 'Q01', NgayBanGiao: new Date() };
    assert.equal(canCompleteAssignedReturn(leftover, 'NV2', 'Q01'), false);
    const claimed = { ...leftover, MaNV_XuLy: 'NV2' };
    assert.equal(canCompleteAssignedReturn(claimed, 'NV2', 'Q01'), true);
    assert.equal(canCompleteAssignedReturn(claimed, 'NV3', 'Q01'), false);
    assert.equal(canCompleteAssignedReturn(claimed, 'NV2', 'Q02'), false);
    assert.equal(canCompleteAssignedReturn({ ...claimed, TrangThai: 'Hoàn thành' }, 'NV2', 'Q01'), false);
    assert.equal(canCompleteAssignedReturn({ ...claimed, TrangThai: 'Đang hoàn tiền' }, 'NV2', 'Q01'), true);
    assert.equal(canCompleteAssignedReturn({ ...claimed, TrangThai: 'Hoàn tiền thất bại' }, 'NV2', 'Q01'), true);
});

test('Phiếu nháp treo: ca sau chưa tiếp nhận thì chưa gửi Thủ kho', () => {
    const draft = { TrangThai: 'Nháp', MaNV_Lap: 'NV1', MaNV_XuLy: null, MaQuayXuLy: 'Q01', NgayBanGiao: new Date() };
    assert.equal(canActOnAssignedReturn(draft, 'NV_TN03', 'Q01'), false);
    assert.equal(canCompleteAssignedReturn(draft, 'NV_TN03', 'Q01'), false);
    assert.equal(canActOnAssignedReturn({ ...draft, MaNV_XuLy: 'NV_TN03' }, 'NV_TN03', 'Q01'), true);
    assert.equal(canActOnAssignedReturn({ ...draft, TrangThai: 'Hoàn thành', NgayHoan: new Date() }, 'NV_TN03', 'Q01'), false);
});

test('Ca chính và tăng cường đều được xử lý phiếu sót; hành chính thì không', () => {
    assert.equal(canRunSalesCounter({ NhiemVu: 'Ca chính full-time', MaLoaiCa: 'SANG' }, 'Thu ngân'), true);
    assert.equal(canRunSalesCounter({ NhiemVu: 'Tăng cường part-time', MaLoaiCa: 'TRUA_TC' }, 'Thu ngân'), false);
    assert.equal(canHandleReturnCounter({ NhiemVu: 'Ca chính full-time', MaLoaiCa: 'SANG' }, 'Thu ngân'), true);
    assert.equal(canHandleReturnCounter({ NhiemVu: 'Tăng cường part-time', MaLoaiCa: 'TRUA_TC' }, 'Thu ngân'), true);
    assert.equal(canHandleReturnCounter({ NhiemVu: 'Hành chính cố định', MaLoaiCa: 'HANH_CHINH', NhomCa: 'HANH_CHINH' }, 'Thu ngân'), false);
    const leftover = { TrangThai: 'Đã duyệt', MaNV_Lap: 'NV1', MaNV_XuLy: null, MaQuayXuLy: 'Q01', NgayBanGiao: new Date() };
    assert.equal(canClaimLeftoverReturn(leftover, 'NV_TN08', 'Q01'), true);
});

console.log('PASS grace-after + scrap-from-count');
