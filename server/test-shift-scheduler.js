const assert = require('node:assert/strict');
const {
    generateSchedule, generateOfficeSchedule, scheduleHistoryFrom, parseDate, addDays, dateKey,
    scheduleSlotLockReason, assertScheduleLaborRules
} = require('./src/services/shiftScheduler');

const employees = Array.from({ length: 8 }, (_, index) => ({
    MaNV: `NV_TN${String(index + 1).padStart(2, '0')}`,
    TrangThai: 'Đang làm việc',
    TrangThaiTaiKhoan: 1
}));
const shifts = [
    { MaLoaiCa: 'SANG', TenCa: 'Ca sáng', GioBatDau: '06:00', GioKetThuc: '14:00', SoGio: 8, SoNguoiCan: 1, ThuTu: 1 },
    { MaLoaiCa: 'TRUA_TC', TenCa: 'Tăng cường trưa', GioBatDau: '10:00', GioKetThuc: '14:00', SoGio: 4, SoNguoiCan: 1, ThuTu: 2 },
    { MaLoaiCa: 'CHIEU', TenCa: 'Ca chiều', GioBatDau: '14:00', GioKetThuc: '22:00', SoGio: 8, SoNguoiCan: 1, ThuTu: 3 },
    { MaLoaiCa: 'TOI_TC', TenCa: 'Tăng cường tối', GioBatDau: '18:00', GioKetThuc: '22:00', SoGio: 4, SoNguoiCan: 1, ThuTu: 4 },
    { MaLoaiCa: 'DEM', TenCa: 'Ca đêm', GioBatDau: '22:00', GioKetThuc: '06:00', SoGio: 8, SoNguoiCan: 1, ThuTu: 5 }
];
const shiftMap = new Map(shifts.map(shift => [shift.MaLoaiCa, shift]));
const only = (...codes) => shifts.filter(shift => codes.includes(shift.MaLoaiCa));
const row = (MaNV, NgayLam, MaLoaiCa) => {
    const shift = shiftMap.get(MaLoaiCa);
    return {
        MaNV, NgayLam, MaLoaiCa, SoGio: shift.SoGio,
        GioBatDau: shift.GioBatDau, GioKetThuc: shift.GioKetThuc
    };
};
const othersOn = (date, type, except = 'NV_TN01') => employees
    .filter(item => item.MaNV !== except)
    .map(item => row(item.MaNV, date, type));

assert.equal(scheduleHistoryFrom('2026-08-24'), '2026-08-01', 'Cuối tháng phải lấy lịch từ mùng 1 để đếm loại ca.');
assert.equal(scheduleHistoryFrom('2026-09-03'), '2026-08-27', 'Đầu tháng vẫn lùi 7 ngày để kiểm tra nghỉ/đêm.');

const assignments = generateSchedule({
    employees, shifts: [...shifts, {
        MaLoaiCa: 'HANH_CHINH', GioBatDau: '07:30', GioKetThuc: '17:30', SoGio: 8, SoNguoiCan: 3, ThuTu: 6, NhomCa: 'HANH_CHINH'
    }], from: '2026-08-24', to: '2026-08-30', existing: []
});
assert.equal(assignments.length, 35, 'Phải phủ đủ 35 lượt ca trong tuần (5 loại × 1 người × 7 ngày).');

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
    for (const rowItem of rows) {
        assert.ok(!byDay.has(rowItem.NgayLam), `${employee.MaNV} bị xếp trùng ngày.`);
        byDay.set(rowItem.NgayLam, rowItem);
    }
    for (let index = 2; index < rows.length; index += 1) {
        const streak = [rows[index - 2], rows[index - 1], rows[index]];
        const nights = streak.every(item => item.MaLoaiCa === 'DEM'
            && dateKey(addDays(parseDate(streak[0].NgayLam), 2)) === streak[2].NgayLam);
        assert.ok(!nights, `${employee.MaNV} bị xếp 3 đêm liên tiếp.`);
    }
}

const typeSpread = new Map();
for (const item of assignments) {
    if (!typeSpread.has(item.MaLoaiCa)) typeSpread.set(item.MaLoaiCa, new Map());
    const byEmp = typeSpread.get(item.MaLoaiCa);
    byEmp.set(item.MaNV, (byEmp.get(item.MaNV) || 0) + 1);
}
for (const [type, byEmp] of typeSpread) {
    const counts = employees.map(item => byEmp.get(item.MaNV) || 0);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 3, `${type} phải xoay tương đối đều trong tuần.`);
}

console.log('SHIFT SCHEDULER PASS: ca chính 8h + tăng cường 4h, đủ 35 lượt/tuần, không trùng ngày.');

assert.throws(
    () => generateSchedule({
        employees: employees.map((item, index) => index === 0 ? { ...item, TrangThai: 'Nghỉ việc' } : item),
        shifts, from: '2026-08-24', to: '2026-08-24'
    }),
    /Cần đủ 8/,
    'Phải loại thu ngân nghỉ việc / khóa tài khoản trước khi xếp.'
);

const preferFewerHours = generateSchedule({
    employees, shifts: only('SANG'), from: '2026-08-25', to: '2026-08-25',
    existing: employees.filter(item => item.MaNV !== 'NV_TN08').map(item => row(item.MaNV, '2026-08-24', 'SANG'))
});
assert.equal(preferFewerHours[0].MaNV, 'NV_TN08', 'Ưu tiên người ít giờ tuần hơn, không theo mã NV.');

const preferFewerType = generateSchedule({
    employees, shifts: only('SANG'), from: '2026-08-24', to: '2026-08-24',
    existing: [
        row('NV_TN01', '2026-08-03', 'SANG'),
        row('NV_TN01', '2026-08-10', 'SANG'),
        ...employees.filter(item => item.MaNV !== 'NV_TN01').flatMap(item => [
            row(item.MaNV, '2026-08-03', 'CHIEU'),
            row(item.MaNV, '2026-08-10', 'CHIEU')
        ])
    ]
});
assert.notEqual(preferFewerType[0].MaNV, 'NV_TN01', 'Người đã nhiều ca sáng trong tháng không được ưu tiên ca sáng.');
assert.equal(preferFewerType[0].MaNV, 'NV_TN02', 'Trong nhóm ít ca sáng hơn, tie-break phải xác định.');

const preferDifferentType = generateSchedule({
    employees, shifts: only('SANG'), from: '2026-08-24', to: '2026-08-24',
    existing: [
        row('NV_TN01', '2026-08-03', 'CHIEU'),
        row('NV_TN01', '2026-08-10', 'SANG'),
        ...employees.filter(item => item.MaNV !== 'NV_TN01').flatMap(item => [
            row(item.MaNV, '2026-08-03', 'SANG'),
            row(item.MaNV, '2026-08-10', 'CHIEU')
        ])
    ]
});
assert.notEqual(preferDifferentType[0].MaNV, 'NV_TN01', 'Ưu tiên đổi loại ca so với ca gần nhất.');

assert.equal(
    generateSchedule({
        employees, shifts: only('SANG'), from: '2026-08-25', to: '2026-08-25',
        existing: [
            ...['2026-08-24', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29'].map(day => row('NV_TN01', day, 'SANG')),
            ...employees.filter(item => item.MaNV !== 'NV_TN01').flatMap(item => (
                ['2026-08-24', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30']
                    .map(day => row(item.MaNV, day, 'SANG'))
            ))
        ]
    })[0].MaNV,
    'NV_TN01',
    'Người còn dưới 48 giờ tuần được nhận ca 8 giờ; người đã đủ 48 giờ bị loại.'
);

assert.throws(
    () => generateSchedule({
        employees, shifts: only('SANG'), from: '2026-08-25', to: '2026-08-25',
        existing: employees.flatMap(item => (
            ['2026-08-24', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30']
                .map(day => row(item.MaNV, day, 'SANG'))
        ))
    }),
    /Không thể xếp đủ/,
    'Vượt 48 giờ/tuần thì dừng toàn bộ, không trả lịch thiếu.'
);

assert.throws(
    () => generateSchedule({
        employees, shifts: only('SANG'), from: '2026-08-25', to: '2026-08-25',
        existing: [row('NV_TN01', '2026-08-24', 'DEM'), ...othersOn('2026-08-25', 'CHIEU')]
    }),
    /Không thể xếp đủ/,
    'DEM kết thúc 06:00 không được xếp SANG 06:00 sáng hôm sau (thiếu 12 giờ nghỉ).'
);

assert.throws(
    () => generateSchedule({
        employees, shifts: only('DEM'), from: '2026-08-26', to: '2026-08-26',
        existing: [
            row('NV_TN01', '2026-08-24', 'DEM'),
            row('NV_TN01', '2026-08-25', 'DEM'),
            ...othersOn('2026-08-26', 'SANG')
        ]
    }),
    /Không thể xếp đủ/,
    'Không xếp đêm thứ 3 liên tiếp; nếu hết người thì abort.'
);

const secondNightOk = generateSchedule({
    employees, shifts: only('DEM'), from: '2026-08-25', to: '2026-08-25',
    existing: [row('NV_TN01', '2026-08-24', 'DEM'), ...othersOn('2026-08-25', 'SANG')]
});
assert.equal(secondNightOk[0].MaNV, 'NV_TN01', 'Hai đêm liên tiếp vẫn được phép.');

assert.throws(
    () => generateSchedule({
        employees, shifts: only('SANG', 'CHIEU'), from: '2026-08-24', to: '2026-08-24',
        existing: othersOn('2026-08-24', 'TRUA_TC')
    }),
    /Không thể xếp đủ/,
    'Hết người hợp lệ giữa tuần thì abort, không giữ bản xếp dở.'
);

const oneShiftDay = generateSchedule({
    employees, shifts, from: '2026-08-24', to: '2026-08-24', existing: []
});
assert.equal(new Set(oneShiftDay.map(item => item.MaNV)).size, 5, 'Mỗi người tối đa 1 ca/ngày.');
assert.equal(oneShiftDay.length, 5);

assert.throws(
    () => generateSchedule({
        employees, shifts: only('TRUA_TC'), from: '2026-08-25', to: '2026-08-25',
        existing: [row('NV_TN01', '2026-08-24', 'DEM'), ...othersOn('2026-08-25', 'CHIEU')]
    }),
    /Không thể xếp đủ/,
    'DEM xong 06:00 thì TRUA_TC 10:00 hôm sau cũng thiếu 12 giờ nghỉ.'
);

const twelveHoursExact = generateSchedule({
    employees, shifts: only('TOI_TC'), from: '2026-08-25', to: '2026-08-25',
    existing: [row('NV_TN01', '2026-08-24', 'DEM'), ...othersOn('2026-08-25', 'SANG')]
});
assert.equal(twelveHoursExact[0].MaNV, 'NV_TN01', 'Đúng 12 giờ nghỉ (DEM 06:00 → TOI_TC 18:00) vẫn hợp lệ.');

const preferOlderNight = generateSchedule({
    employees, shifts: only('DEM'), from: '2026-08-24', to: '2026-08-24',
    existing: [
        row('NV_TN01', '2026-08-15', 'DEM'),
        row('NV_TN01', '2026-08-17', 'SANG'),
        ...employees.filter(item => item.MaNV !== 'NV_TN01').flatMap(item => [
            row(item.MaNV, '2026-08-03', 'DEM'),
            row(item.MaNV, '2026-08-17', 'SANG')
        ])
    ]
});
assert.notEqual(preferOlderNight[0].MaNV, 'NV_TN01', 'Ca đêm ưu tiên người xa lần đêm gần nhất hơn.');

const monthRoster = generateSchedule({
    employees, shifts, from: '2026-08-01', to: '2026-08-31', existing: []
});
assert.equal(monthRoster.length, 155, 'Tháng 31 ngày × 5 ca phải xếp đủ, không dừng giữa chừng.');
const monthType = new Map();
const monthHours = new Map();
for (const item of monthRoster) {
    const week = `${item.MaNV}|${item.NgayLam}`;
    assert.ok(!monthHours.has(week), `${item.MaNV} bị xếp 2 ca ngày ${item.NgayLam}.`);
    monthHours.set(week, item);
    if (!monthType.has(item.MaLoaiCa)) monthType.set(item.MaLoaiCa, new Map());
    const byEmp = monthType.get(item.MaLoaiCa);
    byEmp.set(item.MaNV, (byEmp.get(item.MaNV) || 0) + 1);
}
for (const [type, byEmp] of monthType) {
    const counts = employees.map(item => byEmp.get(item.MaNV) || 0);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 3, `${type} phải xoay tương đối đều trong tháng (max-min ≤ 3).`);
}

console.log('CASHIER RULES PASS: lọc cứng + ưu tiên giờ tuần/loại ca tháng + abort khi hết người.');

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

const laborRow = (MaNV, NgayLam, MaLoaiCa, extras = {}) => {
    const shift = shiftMap.get(MaLoaiCa);
    const wraps = shift.GioKetThuc <= shift.GioBatDau;
    const endDay = wraps ? dateKey(addDays(parseDate(NgayLam), 1)) : NgayLam;
    return {
        MaNV, TenNV: MaNV, NgayLam, MaLoaiCa, SoGio: shift.SoGio, TrangThai: 'Đã công bố',
        BatDauDuKien: `${NgayLam}T${shift.GioBatDau}:00Z`,
        KetThucDuKien: `${endDay}T${shift.GioKetThuc}:00Z`,
        ...extras
    };
};

assert.equal(scheduleSlotLockReason({ TrangThai: 'Đã công bố' }), null, 'Lịch đã công bố vẫn sửa được nếu chưa chấm công.');
assert.equal(scheduleSlotLockReason({ TrangThai: 'Bản nháp' }), null);
assert.match(scheduleSlotLockReason({ MaChamCong: 12 }), /chấm công/);
assert.match(scheduleSlotLockReason({ ThoiGianVao: '2026-08-24T06:05:00' }), /chấm công/);
assert.match(scheduleSlotLockReason({ TrangThaiCaBan: 'Đã chốt', MaCa: 'CA01' }), /POS|Ca bán/);
assert.match(scheduleSlotLockReason({ TrangThaiChamCong: 'Đã duyệt' }), /chấm công/);

assert.doesNotThrow(() => assertScheduleLaborRules([
    laborRow('NV_TN01', '2026-08-24', 'DEM'),
    laborRow('NV_TN01', '2026-08-25', 'DEM')
]), 'Hai đêm liên tiếp vẫn hợp lệ khi công bố lại.');

assert.throws(
    () => assertScheduleLaborRules([
        laborRow('NV_TN01', '2026-08-24', 'DEM'),
        laborRow('NV_TN01', '2026-08-25', 'DEM'),
        laborRow('NV_TN01', '2026-08-26', 'DEM')
    ]),
    /3 đêm liên tiếp/,
    'Công bố lại phải chặn đêm thứ 3 liên tiếp.'
);

assert.throws(
    () => assertScheduleLaborRules([
        laborRow('NV_TN01', '2026-08-24', 'SANG'),
        laborRow('NV_TN01', '2026-08-24', 'CHIEU')
    ]),
    /hơn 1 ca/,
    'Công bố lại phải chặn 2 ca trong cùng ngày.'
);

assert.throws(
    () => assertScheduleLaborRules([
        laborRow('NV_TN01', '2026-08-24', 'SANG'),
        laborRow('NV_TN01', '2026-08-25', 'SANG'),
        laborRow('NV_TN01', '2026-08-26', 'SANG'),
        laborRow('NV_TN01', '2026-08-27', 'SANG'),
        laborRow('NV_TN01', '2026-08-28', 'SANG'),
        laborRow('NV_TN01', '2026-08-29', 'SANG'),
        laborRow('NV_TN01', '2026-08-30', 'SANG')
    ]),
    /48 giờ/,
    'Công bố lại phải chặn vượt 48 giờ/tuần.'
);

assert.throws(
    () => assertScheduleLaborRules([
        laborRow('NV_TN01', '2026-08-24', 'DEM'),
        laborRow('NV_TN01', '2026-08-25', 'SANG')
    ]),
    /nghỉ/,
    'Công bố lại phải chặn thiếu 12 giờ nghỉ.'
);

assert.doesNotThrow(() => assertScheduleLaborRules([
    laborRow('NV_TN01', '2026-08-24', 'DEM'),
    laborRow('NV_TN01', '2026-08-25', 'TOI_TC')
]), 'Đúng 12 giờ nghỉ (DEM 06:00 → TOI_TC 18:00) vẫn công bố được.');

console.log('PUBLISH RULES PASS: lịch đã công bố không khóa; chấm công/POS thì khóa; 12h / 48h / 1 ca / 2 đêm vẫn chặn khi công bố lại.');
