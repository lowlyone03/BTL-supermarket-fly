const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error('Ngày phân ca không hợp lệ.');
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
};

const dateKey = date => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);
const minutes = value => {
    const text = String(value ?? '00:00');
    const match = text.match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};

const weekKey = date => {
    const day = (date.getUTCDay() + 6) % 7;
    return dateKey(addDays(date, -day));
};

const interval = (day, shift) => {
    const startMinute = minutes(shift.GioBatDau);
    const endMinute = minutes(shift.GioKetThuc);
    const start = day.getTime() + startMinute * 60000;
    const end = day.getTime() + (endMinute <= startMinute ? DAY_MS : 0) + endMinute * 60000;
    return { start, end };
};

const isReinforcement = shift => shift.MaLoaiCa === 'TRUA_TC' || shift.MaLoaiCa === 'TOI_TC';
const OFFICE_SHIFT_CODE = 'HANH_CHINH';
const OFFICE_TEAM_SIZE = 3;
const OFFICE_ROLES = ['Nhân viên mua hàng', 'Thủ kho', 'Kế toán'];
const OFFICE_DUTY = {
    'Nhân viên mua hàng': 'Hành chính mua hàng',
    'Thủ kho': 'Hành chính kho',
    'Kế toán': 'Hành chính kế toán'
};

const isOfficeShift = shift => String(shift?.MaLoaiCa || '') === OFFICE_SHIFT_CODE
    || String(shift?.NhomCa || '') === 'HANH_CHINH';
const isSunday = date => date.getUTCDay() === 0;
const officeDutyFor = employee => OFFICE_DUTY[employee?.ChucVu] || 'Hành chính cố định';

const dutyForShift = shift => {
    if (isOfficeShift(shift)) return 'Hành chính cố định';
    return isReinforcement(shift) ? 'Tăng cường part-time' : 'Ca chính full-time';
};

const CASHIER_TEAM_SIZE = 8;

/**
 * Xếp một ca/ngày/người, nghỉ tối thiểu 12 giờ và không vượt 48 giờ/tuần.
 * Điểm ưu tiên vừa cân bằng tổng giờ, vừa luân phiên loại ca giữa các nhân viên.
 */
const generateSchedule = ({ employees, shifts, from, to, existing = [] }) => {
    if (!Array.isArray(employees) || employees.length < CASHIER_TEAM_SIZE) {
        throw new Error(`Cần đủ ${CASHIER_TEAM_SIZE} Nhân viên bán hàng kiêm thu ngân đang làm việc để phân ca tự động.`);
    }
    const first = parseDate(from);
    const last = parseDate(to);
    const dayCount = Math.floor((last - first) / DAY_MS) + 1;
    if (dayCount < 1 || dayCount > 31) throw new Error('Mỗi lần chỉ phân ca tối đa 31 ngày.');

    const orderedEmployees = [...employees].sort((a, b) => String(a.MaNV).localeCompare(String(b.MaNV), 'vi'));
    const orderedShifts = [...shifts].filter(shift => !isOfficeShift(shift))
        .sort((a, b) => Number(a.ThuTu) - Number(b.ThuTu));
    if (!orderedShifts.length) throw new Error('Thiếu danh mục ca quầy để phân ca thu ngân.');
    const assignments = [];
    const all = existing.map(item => ({ ...item, _generated: false }));
    const weeklyHours = new Map();
    const shiftCounts = new Map();

    const registerExisting = item => {
        const day = parseDate(String(item.NgayLam).slice(0, 10));
        const wk = `${item.MaNV}|${weekKey(day)}`;
        weeklyHours.set(wk, (weeklyHours.get(wk) || 0) + Number(item.SoGio || 0));
        const sk = `${item.MaNV}|${item.MaLoaiCa}`;
        shiftCounts.set(sk, (shiftCounts.get(sk) || 0) + 1);
    };
    all.forEach(registerExisting);

    for (let offset = 0; offset < dayCount; offset += 1) {
        const day = addDays(first, offset);
        const currentDate = dateKey(day);
        const usedToday = new Set(all.filter(item => String(item.NgayLam).slice(0, 10) === currentDate).map(item => item.MaNV));

        for (const shift of orderedShifts) {
            const currentCount = all.filter(item => String(item.NgayLam).slice(0, 10) === currentDate && item.MaLoaiCa === shift.MaLoaiCa).length;
            for (let slot = currentCount; slot < Number(shift.SoNguoiCan); slot += 1) {
                const currentInterval = interval(day, shift);
                const candidates = orderedEmployees.filter(employee => {
                    if (usedToday.has(employee.MaNV)) return false;
                    const wk = `${employee.MaNV}|${weekKey(day)}`;
                    if ((weeklyHours.get(wk) || 0) + Number(shift.SoGio) > 48) return false;
                    if (shift.MaLoaiCa === 'DEM') {
                        const previousNightKeys = [1, 2].map(days => dateKey(addDays(day, -days)));
                        const workedBothPreviousNights = previousNightKeys.every(key =>
                            all.some(item => item.MaNV === employee.MaNV
                                && item.MaLoaiCa === 'DEM'
                                && String(item.NgayLam).slice(0, 10) === key));
                        if (workedBothPreviousNights) return false;
                    }
                    return all.every(item => {
                        if (item.MaNV !== employee.MaNV) return true;
                        const itemDay = parseDate(String(item.NgayLam).slice(0, 10));
                        const itemShift = orderedShifts.find(value => value.MaLoaiCa === item.MaLoaiCa) || item;
                        const other = interval(itemDay, itemShift);
                        return currentInterval.start >= other.end
                            ? currentInterval.start - other.end >= 12 * 60 * 60000
                            : other.start - currentInterval.end >= 12 * 60 * 60000;
                    });
                }).map(employee => {
                    const wk = `${employee.MaNV}|${weekKey(day)}`;
                    const sameShift = shiftCounts.get(`${employee.MaNV}|${shift.MaLoaiCa}`) || 0;
                    const totalHours = weeklyHours.get(wk) || 0;
                    const rotation = (offset * 8 + Number(shift.ThuTu) * 2 + slot) % orderedEmployees.length;
                    const employeeIndex = orderedEmployees.findIndex(item => item.MaNV === employee.MaNV);
                    const rotationDistance = (employeeIndex - rotation + orderedEmployees.length) % orderedEmployees.length;
                    return { employee, score: totalHours * 100 + sameShift * 24 + rotationDistance };
                }).sort((a, b) => a.score - b.score || a.employee.MaNV.localeCompare(b.employee.MaNV));

                if (!candidates.length) {
                    throw new Error(`Không thể xếp đủ ${shift.TenCa} ngày ${currentDate} mà vẫn bảo đảm nghỉ 12 giờ và tối đa 48 giờ/tuần.`);
                }
                const employee = candidates[0].employee;
                const duty = dutyForShift(shift);
                const item = {
                    MaNV: employee.MaNV,
                    NgayLam: currentDate,
                    MaLoaiCa: shift.MaLoaiCa,
                    NhiemVu: duty,
                    MaQuay: isReinforcement(shift) ? null : 'Q01',
                    SoGio: Number(shift.SoGio),
                    _generated: true
                };
                assignments.push(item);
                all.push(item);
                usedToday.add(employee.MaNV);
                registerExisting(item);
            }
        }
    }
    return assignments;
};

const generateOfficeSchedule = ({ employees, shift, from, to, existing = [] }) => {
    if (!shift || !isOfficeShift(shift)) {
        throw new Error('Chưa có loại ca hành chính 07:30–17:30. Hãy chạy migration ca hành chính.');
    }
    if (!Array.isArray(employees) || employees.length < OFFICE_TEAM_SIZE) {
        throw new Error('Cần đủ Nhân viên mua hàng, Thủ kho và Kế toán đang làm việc để xếp ca hành chính.');
    }
    const first = parseDate(from);
    const last = parseDate(to);
    const dayCount = Math.floor((last - first) / DAY_MS) + 1;
    if (dayCount < 1 || dayCount > 31) throw new Error('Mỗi lần chỉ phân ca tối đa 31 ngày.');

    const orderedEmployees = [...employees].sort((a, b) => String(a.MaNV).localeCompare(String(b.MaNV), 'vi'));
    const assignments = [];
    const all = existing.map(item => ({ ...item, _generated: false }));
    const weeklyHours = new Map();
    const registerExisting = item => {
        const day = parseDate(String(item.NgayLam).slice(0, 10));
        const wk = `${item.MaNV}|${weekKey(day)}`;
        weeklyHours.set(wk, (weeklyHours.get(wk) || 0) + Number(item.SoGio || 0));
    };
    all.forEach(registerExisting);

    for (let offset = 0; offset < dayCount; offset += 1) {
        const day = addDays(first, offset);
        if (isSunday(day)) continue;
        const currentDate = dateKey(day);
        const usedToday = new Set(all.filter(item => String(item.NgayLam).slice(0, 10) === currentDate).map(item => item.MaNV));
        const currentInterval = interval(day, shift);

        for (const employee of orderedEmployees) {
            if (usedToday.has(employee.MaNV)) continue;
            const wk = `${employee.MaNV}|${weekKey(day)}`;
            if ((weeklyHours.get(wk) || 0) + Number(shift.SoGio) > 48) {
                throw new Error(`${employee.TenNV || employee.MaNV} sẽ vượt 48 giờ/tuần nếu xếp ca hành chính ngày ${currentDate}.`);
            }
            const restOk = all.every(item => {
                if (item.MaNV !== employee.MaNV) return true;
                const itemDay = parseDate(String(item.NgayLam).slice(0, 10));
                const itemShift = item.MaLoaiCa === shift.MaLoaiCa ? shift : item;
                const other = interval(itemDay, {
                    GioBatDau: itemShift.GioBatDau || item.GioBatDau,
                    GioKetThuc: itemShift.GioKetThuc || item.GioKetThuc
                });
                return currentInterval.start >= other.end
                    ? currentInterval.start - other.end >= 12 * 60 * 60000
                    : other.start - currentInterval.end >= 12 * 60 * 60000;
            });
            if (!restOk) {
                throw new Error(`Không đủ 12 giờ nghỉ trước ca hành chính của ${employee.TenNV || employee.MaNV} ngày ${currentDate}.`);
            }
            const item = {
                MaNV: employee.MaNV,
                NgayLam: currentDate,
                MaLoaiCa: shift.MaLoaiCa,
                NhiemVu: officeDutyFor(employee),
                MaQuay: null,
                SoGio: Number(shift.SoGio),
                _generated: true
            };
            assignments.push(item);
            all.push(item);
            usedToday.add(employee.MaNV);
            registerExisting(item);
        }
    }
    return assignments;
};

module.exports = {
    generateSchedule, generateOfficeSchedule, parseDate, dateKey, addDays, weekKey,
    CASHIER_TEAM_SIZE, OFFICE_TEAM_SIZE, OFFICE_ROLES, OFFICE_SHIFT_CODE,
    isOfficeShift, officeDutyFor
};
