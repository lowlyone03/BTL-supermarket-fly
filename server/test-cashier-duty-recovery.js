const assert = require('node:assert/strict');
const {
    buildDutySnapshot,
    assertDutyFromSnapshot,
    assertOwnerCloseShift,
    CashierDutyError,
    pickOpenAttendance
} = require('./src/services/cashierDuty');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

const morningToday = {
    MaLich: 100,
    MaLoaiCa: 'SANG',
    TenCa: 'Ca sáng',
    NhomCa: 'BAN',
    NhiemVu: 'Ca chính full-time',
    MaQuay: 'Q01',
    NgayLam: '2026-09-07',
    GioBatDau: '06:00',
    GioKetThuc: '14:00',
    BatDauDuKien: new Date('2026-09-07T06:00:00+07:00'),
    KetThucDuKien: new Date('2026-09-07T14:00:00+07:00'),
    ThoiGianVao: null,
    ThoiGianRa: null,
    ViTri: 'trong',
    LaHomNay: 1
};

const afternoonSep4 = {
    MaLich: 40,
    MaLoaiCa: 'CHIEU',
    TenCa: 'Ca chiều',
    NhomCa: 'BAN',
    NhiemVu: 'Ca chính full-time',
    MaQuay: 'Q01',
    NgayLam: '2026-09-04',
    GioBatDau: '14:00',
    GioKetThuc: '22:00',
    BatDauDuKien: new Date('2026-09-04T14:00:00+07:00'),
    KetThucDuKien: new Date('2026-09-04T22:00:00+07:00'),
    ThoiGianVao: new Date('2026-09-04T14:01:00+07:00'),
    ThoiGianRa: null,
    ViTri: 'sau',
    LaHomNay: 0
};

const nightSep2 = {
    MaLich: 20,
    MaLoaiCa: 'DEM',
    TenCa: 'Ca đêm',
    NhomCa: 'BAN',
    NhiemVu: 'Ca chính full-time',
    MaQuay: 'Q01',
    NgayLam: '2026-09-02',
    GioBatDau: '22:00',
    GioKetThuc: '06:00',
    BatDauDuKien: new Date('2026-09-02T22:00:00+07:00'),
    KetThucDuKien: new Date('2026-09-03T06:00:00+07:00'),
    ThoiGianVao: new Date('2026-09-02T22:27:00+07:00'),
    ThoiGianRa: null,
    ViTri: 'sau',
    LaHomNay: 0
};

const openPosSep4 = {
    MaCa: 'CA202609040002',
    MaLich: 40,
    TrangThai: 'Đang mở',
    ThoiGianBatDau: new Date('2026-09-04T14:05:00+07:00'),
    ThoiGianKetThuc: null,
    MaQuay: 'Q01'
};

const dutyCtx = (overrides = {}) => ({
    employee: { MaNV: 'NV01', TenNV: 'Đỗ Khánh Linh', ChucVu: 'Thu ngân' },
    schedules: [afternoonSep4, morningToday],
    openShift: openPosSep4,
    closedByLich: new Map(),
    nextShift: null,
    ...overrides
});

const caught = (fn) => {
    try {
        fn();
        return null;
    } catch (error) {
        return error;
    }
};

test('Ca cũ còn chấm vào + POS hôm trước: không nhận là đang trong ca sáng hôm nay', () => {
    const duty = buildDutySnapshot(dutyCtx());
    assert.equal(duty.status, 'stale_session');
    assert.equal(Number(duty.schedule.MaLich), 40);
    assert.equal(duty.schedule.TenCa, 'Ca chiều');
    assert.match(duty.message, /CA202609040002/);
    assert.match(duty.message, /Ca chiều ngày 2026-09-04/);
    assert.doesNotMatch(duty.message, /Đang trong Ca sáng ngày 2026-09-07/);
    assert.equal(duty.canCheckIn, false);
    assert.equal(duty.canCheckOut, false);
    assert.equal(duty.canSell, false);
    assert.equal(duty.canOpenShift, false);
    assert.equal(duty.canCloseShift, true);
    assert.equal(duty.staleOpenShift, true);
    assert.equal(pickOpenAttendance(duty.context.schedules).MaLich, 40);
});

test('Đóng POS cũ xong thì chấm công ra được; vẫn chưa được chấm vào ca hôm nay', () => {
    const duty = buildDutySnapshot(dutyCtx({ openShift: null }));
    assert.equal(duty.status, 'stale_session');
    assert.equal(duty.canCloseShift, false);
    assert.equal(duty.canCheckOut, true);
    assert.equal(duty.canCheckIn, false);
    const allowed = assertDutyFromSnapshot(duty, 'check-out');
    assert.equal(Number(allowed.schedule.MaLich), 40);
    const blocked = caught(() => assertDutyFromSnapshot(duty, 'check-in'));
    assert.ok(blocked instanceof CashierDutyError);
    assert.match(blocked.message, /chấm công ra/i);
});

test('close POS CA202609040002 succeeds while today is 07/09 sáng window', () => {
    const duty = buildDutySnapshot(dutyCtx());
    const viaIntent = assertDutyFromSnapshot(duty, 'close-shift');
    const viaOwner = assertOwnerCloseShift(duty, 'CA202609040002');
    assert.equal(viaIntent.shift.MaCa, 'CA202609040002');
    assert.equal(viaOwner.shift.MaCa, 'CA202609040002');
    assert.equal(viaOwner.stale, true);
    assert.equal(Number(viaOwner.schedule.MaLich), 40);
    assert.notEqual(Number(viaOwner.shift.MaLich), 100);
    const checkOut = caught(() => assertDutyFromSnapshot(duty, 'check-out'));
    assert.equal(checkOut.status, 400);
    assert.equal(checkOut.recovery, 'close-shift');
    assert.equal(checkOut.MaCa, 'CA202609040002');
    const sell = caught(() => assertDutyFromSnapshot(duty, 'sell'));
    assert.ok(sell instanceof CashierDutyError);
    assert.match(sell.message, /không khớp|đóng ca/i);
    assert.doesNotMatch(sell.message, /Hãy đóng đúng ca đang mở/);
});

test('Sau khi đóng ca cũ và chấm ra, khung giờ sáng cho chấm vào — chưa tự vào ca', () => {
    const closedAfternoon = { ...afternoonSep4, ThoiGianRa: new Date('2026-09-07T06:10:00+07:00') };
    const duty = buildDutySnapshot(dutyCtx({
        schedules: [closedAfternoon, morningToday],
        openShift: null
    }));
    assert.equal(duty.status, 'inside');
    assert.equal(Number(duty.schedule.MaLich), 100);
    assert.match(duty.message, /Trong khung giờ Ca sáng ngày 2026-09-07/);
    assert.doesNotMatch(duty.message, /^Đang trong Ca sáng/);
    assert.equal(duty.canCheckIn, true);
    assert.equal(duty.canCheckOut, false);
    const result = assertDutyFromSnapshot(duty, 'check-in');
    assert.equal(Number(result.schedule.MaLich), 100);
});

const afternoonTodayBefore = {
    MaLich: 150,
    MaLoaiCa: 'CHIEU',
    TenCa: 'Ca chiều',
    NhomCa: 'BAN',
    NhiemVu: 'Ca chính full-time',
    MaQuay: 'Q01',
    NgayLam: '2026-09-07',
    GioBatDau: '15:00',
    GioKetThuc: '22:00',
    BatDauDuKien: new Date('2026-09-07T15:00:00+07:00'),
    KetThucDuKien: new Date('2026-09-07T22:00:00+07:00'),
    ThoiGianVao: new Date('2026-09-07T10:50:00+07:00'),
    ThoiGianRa: null,
    ViTri: 'truoc',
    LaHomNay: 1
};

const leftoverClaimPos = {
    MaCa: 'CA202609070001',
    MaLich: 150,
    TrangThai: 'Đang mở',
    ThoiGianBatDau: new Date('2026-09-07T10:52:00+07:00'),
    ThoiGianKetThuc: null,
    MaQuay: 'Q01'
};

test('Ca sót mở trước giờ lịch 15:00: được xác nhận hoàn trên ca đang mở, không bị coi ca cũ', () => {
    const duty = buildDutySnapshot(dutyCtx({
        schedules: [afternoonTodayBefore],
        openShift: leftoverClaimPos
    }));
    assert.notEqual(duty.status, 'stale_session');
    assert.equal(duty.staleOpenShift, false);
    assert.equal(duty.canSell, false);
    assert.equal(duty.canCompleteReturn, true);
    assert.equal(duty.canCloseShift, true);
    const allowed = assertDutyFromSnapshot(duty, 'complete-return');
    assert.equal(allowed.shift.MaCa, 'CA202609070001');
    assert.equal(Number(allowed.schedule.MaLich), 150);
    const sell = caught(() => assertDutyFromSnapshot(duty, 'sell'));
    assert.ok(sell instanceof CashierDutyError);
});

test('Tăng cường mở ca chỉ để nhận phiếu sót: vẫn xác nhận hoàn trên ca hiện tại', () => {
    const boost = { ...afternoonTodayBefore, NhiemVu: 'Tăng cường part-time' };
    const duty = buildDutySnapshot(dutyCtx({
        schedules: [boost],
        openShift: leftoverClaimPos
    }));
    assert.equal(duty.canSell, false);
    assert.equal(duty.canCompleteReturn, true);
    const allowed = assertDutyFromSnapshot(duty, 'complete-return');
    assert.equal(allowed.shift.MaCa, 'CA202609070001');
    assert.equal(Number(allowed.schedule.MaLich), 150);
});

test('Ca POS hôm trước vẫn stale — không hoàn/đổi trên ca cũ', () => {
    const duty = buildDutySnapshot(dutyCtx());
    const blocked = caught(() => assertDutyFromSnapshot(duty, 'complete-return'));
    assert.ok(blocked instanceof CashierDutyError);
    assert.match(blocked.message, /ca cũ|đóng ca/i);
});

test('Ca đêm quên ra từ ngày khác cũng được ưu tiên hơn ca sáng hôm nay', () => {
    const duty = buildDutySnapshot(dutyCtx({
        schedules: [nightSep2, morningToday],
        openShift: null
    }));
    assert.equal(duty.status, 'stale_session');
    assert.equal(Number(duty.schedule.MaLich), 20);
    assert.equal(duty.canCheckOut, true);
    assert.equal(duty.canCheckIn, false);
    assert.match(duty.message, /Ca đêm ngày 2026-09-02/);
});

console.log('PASS cashier duty recovery');
