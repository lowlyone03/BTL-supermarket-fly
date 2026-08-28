const assert = require('node:assert/strict');
const { generateSchedule, generateOfficeSchedule } = require('./src/services/shiftScheduler');

const employees = Array.from({ length: 8 }, (_, index) => ({ MaNV: `NV_TN${String(index + 1).padStart(2, '0')}` }));
const shifts = [
    { MaLoaiCa: 'SANG', GioBatDau: '06:00', GioKetThuc: '14:00', SoGio: 8, SoNguoiCan: 1, ThuTu: 1 },
    { MaLoaiCa: 'TRUA_TC', GioBatDau: '10:00', GioKetThuc: '14:00', SoGio: 4, SoNguoiCan: 1, ThuTu: 2 },
    { MaLoaiCa: 'CHIEU', GioBatDau: '14:00', GioKetThuc: '22:00', SoGio: 8, SoNguoiCan: 1, ThuTu: 3 },
    { MaLoaiCa: 'TOI_TC', GioBatDau: '18:00', GioKetThuc: '22:00', SoGio: 4, SoNguoiCan: 1, ThuTu: 4 },
    { MaLoaiCa: 'DEM', GioBatDau: '22:00', GioKetThuc: '06:00', SoGio: 8, SoNguoiCan: 1, ThuTu: 5 }
];

const assignments = generateSchedule({
    employees, shifts: [...shifts, {
        MaLoaiCa: 'HANH_CHINH', GioBatDau: '07:30', GioKetThuc: '17:30', SoGio: 8, SoNguoiCan: 3, ThuTu: 6, NhomCa: 'HANH_CHINH'
    }], from: '2026-08-24', to: '2026-08-30', existing: []
});
assert.equal(assignments.length, 35, 'Phải phủ đủ 35 lượt ca trong tuần (5 loại × 1 người × 7 ngày).');

const shiftMap = new Map(shifts.map(shift => [shift.MaLoaiCa, shift]));
const hours = new Map();
for (const item of assignments) {
    hours.set(item.MaNV, (hours.get(item.MaNV) || 0) + Number(shiftMap.get(item.MaLoaiCa).SoGio));
}
assert.ok([...hours.values()].every(value => value <= 48), 'Không nhân viên nào được vượt 48 giờ/tuần.');

for (const date of [...new Set(assignments.map(item => item.NgayLam))]) {
    const mainMorning = assignments.find(item => item.NgayLam === date && item.MaLoaiCa === 'SANG');
    const boostNoon = assignments.find(item => item.NgayLam === date && item.MaLoaiCa === 'TRUA_TC');
    assert.ok(mainMorning && boostNoon, `${date} phải có cả ca sáng chính và tăng cường trưa.`);
    assert.notEqual(mainMorning.MaNV, boostNoon.MaNV, `${date} ca chính và tăng cường phải là hai người khác nhau.`);
    assert.equal(mainMorning.NhiemVu, 'Ca chính full-time');
    assert.equal(boostNoon.NhiemVu, 'Tăng cường part-time');
}

for (const employee of employees) {
    const rows = assignments.filter(item => item.MaNV === employee.MaNV)
        .sort((a, b) => String(a.NgayLam).localeCompare(String(b.NgayLam)));
    const byDay = new Map();
    for (const row of rows) {
        assert.ok(!byDay.has(row.NgayLam), `${employee.MaNV} bị xếp trùng ngày.`);
        byDay.set(row.NgayLam, row);
    }
}

console.log('SHIFT SCHEDULER PASS: ca chính 8h + tăng cường 4h, đủ 35 lượt/tuần, không trùng ngày.');

const officeEmployees = [
    { MaNV: 'NV_MH01', TenNV: 'Trần Thu Hà', ChucVu: 'Nhân viên mua hàng' },
    { MaNV: 'NV_TK01', TenNV: 'Lê Đức Long', ChucVu: 'Thủ kho' },
    { MaNV: 'NV_KT01', TenNV: 'Hoàng Minh Châu', ChucVu: 'Kế toán' }
];
const officeShift = {
    MaLoaiCa: 'HANH_CHINH', TenCa: 'Ca hành chính', GioBatDau: '07:30', GioKetThuc: '17:30',
    SoGio: 8, SoNguoiCan: 3, ThuTu: 6, NhomCa: 'HANH_CHINH', GioNghiBatDau: '11:30', GioNghiKetThuc: '13:30'
};
const officeAssignments = generateOfficeSchedule({
    employees: officeEmployees, shift: officeShift, from: '2026-08-24', to: '2026-08-30', existing: []
});
assert.equal(officeAssignments.length, 18, '3 người × 6 ngày (T2–T7), Chủ nhật nghỉ.');
assert.ok(officeAssignments.every(item => item.NgayLam !== '2026-08-30'), 'Không xếp ca hành chính vào Chủ nhật.');
assert.equal(officeAssignments.filter(item => item.MaNV === 'NV_MH01').length, 6);
assert.ok(officeAssignments.every(item => item.NhiemVu.startsWith('Hành chính')));
const { splitDayNightMinutes } = require('./src/services/timeService');
const paid = splitDayNightMinutes('2026-08-25T07:30:00', '2026-08-25T17:30:00', null, null, {
    GioNghiBatDau: '11:30', GioNghiKetThuc: '13:30'
});
assert.equal(paid.day + paid.night, 480, '7h30–17h30 trừ nghỉ 11h30–13h30 phải còn đúng 8 giờ công.');
const lunchOnly = splitDayNightMinutes('2026-08-25T11:30:00', '2026-08-25T13:30:00', null, null, officeShift);
assert.equal(lunchOnly.day + lunchOnly.night, 0, 'Toàn bộ 11h30–13h30 phải là giờ nghỉ không tính lương.');
const beforeLunch = splitDayNightMinutes('2026-08-25T11:00:00', '2026-08-25T12:00:00', null, null, officeShift);
assert.equal(beforeLunch.day + beforeLunch.night, 30, 'Làm 11h–12h chỉ tính 30 phút trước giờ nghỉ 11h30.');
const afterLunch = splitDayNightMinutes('2026-08-25T13:00:00', '2026-08-25T14:00:00', null, null, officeShift);
assert.equal(afterLunch.day + afterLunch.night, 30, 'Làm 13h–14h chỉ tính 30 phút sau giờ nghỉ 13h30.');
console.log('OFFICE SCHEDULER PASS: hành chính 7h30–17h30, nghỉ trưa 11h30–13h30, T2–T7.');
