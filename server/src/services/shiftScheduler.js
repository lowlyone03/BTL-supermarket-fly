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
const REST_MS = 12 * 60 * 60000;
const NEVER_ASSIGNED = 0;
const NO_NIGHT_GAP = 9999;

const workDate = item => String(item.NgayLam).slice(0, 10);
const monthKey = date => dateKey(date).slice(0, 7);
const monthStart = date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const scheduleHistoryFrom = fromDate => {
    const first = fromDate instanceof Date ? fromDate : parseDate(fromDate);
    const lookback = addDays(first, -7);
    const firstOfMonth = monthStart(first);
    return dateKey(firstOfMonth.getTime() <= lookback.getTime() ? firstOfMonth : lookback);
};

const isActiveCashier = employee => {
    const status = employee?.TrangThai;
    if (status != null && String(status).trim() && String(status).trim() !== 'Đang làm việc') return false;
    const account = employee?.TrangThaiTaiKhoan ?? employee?.TaiKhoanHoatDong;
    if (account == null || account === '') return true;
    return Number(account) === 1 || String(account) === 'Hoạt động';
};

const compareKeys = (left, right) => {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const a = left[index];
        const b = right[index];
        if (typeof a === 'string' || typeof b === 'string') {
            const order = String(a).localeCompare(String(b), 'vi');
            if (order) return order;
            continue;
        }
        if (a !== b) return a - b;
    }
    return 0;
};

/**
 * Thu ngân: lọc cứng 1 ca/ngày, nghỉ 12 giờ, ≤48 giờ/tuần (T2–CN), không đêm thứ 3 liên tiếp.
 * Sau đó chọn theo thứ tự: ít giờ tuần (bậc 8 giờ, để ca 4h không át xoay loại ca) → ít loại ca này
 * trong tháng → đổi loại ca so với ca gần nhất → tránh cùng loại hai ngày làm liên tiếp
 * → đều tổng ca tháng → (đêm) ít đêm / xa đêm gần nhất → ít giờ tuần còn lại → ai xếp ít gần đây nhất.
 */
const generateSchedule = ({ employees, shifts, from, to, existing = [] }) => {
    const orderedEmployees = [...(employees || [])].filter(isActiveCashier)
        .sort((a, b) => String(a.MaNV).localeCompare(String(b.MaNV), 'vi'));
    if (orderedEmployees.length < CASHIER_TEAM_SIZE) {
        throw new Error(`Cần đủ ${CASHIER_TEAM_SIZE} Nhân viên bán hàng kiêm thu ngân đang làm việc để phân ca tự động.`);
    }
    const first = parseDate(from);
    const last = parseDate(to);
    const dayCount = Math.floor((last - first) / DAY_MS) + 1;
    if (dayCount < 1 || dayCount > 31) throw new Error('Mỗi lần chỉ phân ca tối đa 31 ngày.');

    const orderedShifts = [...shifts].filter(shift => !isOfficeShift(shift))
        .sort((a, b) => Number(a.ThuTu) - Number(b.ThuTu));
    if (!orderedShifts.length) throw new Error('Thiếu danh mục ca quầy để phân ca thu ngân.');
    const shiftByCode = new Map(orderedShifts.map(shift => [shift.MaLoaiCa, shift]));
    const shiftTimes = item => {
        const known = shiftByCode.get(item.MaLoaiCa);
        return {
            GioBatDau: known?.GioBatDau || item.GioBatDau,
            GioKetThuc: known?.GioKetThuc || item.GioKetThuc
        };
    };
    const assignmentInstant = item => {
        const recorded = item.NgayCapNhat || item.BatDauDuKien;
        if (recorded) {
            const stamp = new Date(recorded).getTime();
            if (Number.isFinite(stamp)) return stamp;
        }
        return interval(parseDate(workDate(item)), shiftTimes(item)).start;
    };

    const assignments = [];
    const all = existing.map(item => ({ ...item, _generated: false }));
    const weeklyHours = new Map();
    const monthTypeCounts = new Map();
    const monthShiftCounts = new Map();
    const monthNightCounts = new Map();
    const lastAssignAt = new Map();

    const registerExisting = item => {
        const day = parseDate(workDate(item));
        const maNV = item.MaNV;
        const month = monthKey(day);
        weeklyHours.set(`${maNV}|${weekKey(day)}`, (weeklyHours.get(`${maNV}|${weekKey(day)}`) || 0) + Number(item.SoGio || 0));
        monthTypeCounts.set(`${maNV}|${month}|${item.MaLoaiCa}`, (monthTypeCounts.get(`${maNV}|${month}|${item.MaLoaiCa}`) || 0) + 1);
        monthShiftCounts.set(`${maNV}|${month}`, (monthShiftCounts.get(`${maNV}|${month}`) || 0) + 1);
        if (item.MaLoaiCa === 'DEM') {
            monthNightCounts.set(`${maNV}|${month}`, (monthNightCounts.get(`${maNV}|${month}`) || 0) + 1);
        }
        const when = assignmentInstant(item);
        if ((lastAssignAt.get(maNV) || NEVER_ASSIGNED) < when) lastAssignAt.set(maNV, when);
    };
    all.forEach(registerExisting);

    const latestBefore = (maNV, beforeDate, type) => {
        let latest = null;
        for (const item of all) {
            if (item.MaNV !== maNV) continue;
            if (type && item.MaLoaiCa !== type) continue;
            const itemDate = workDate(item);
            if (itemDate >= beforeDate) continue;
            if (!latest || itemDate > workDate(latest)
                || (itemDate === workDate(latest) && assignmentInstant(item) > assignmentInstant(latest))) {
                latest = item;
            }
        }
        return latest;
    };

    const hasRest = (employee, day, shift) => {
        const currentInterval = interval(day, shift);
        return all.every(item => {
            if (item.MaNV !== employee.MaNV) return true;
            const other = interval(parseDate(workDate(item)), shiftTimes(item));
            const gap = currentInterval.start >= other.end
                ? currentInterval.start - other.end
                : other.start - currentInterval.end;
            return gap >= REST_MS;
        });
    };

    for (let offset = 0; offset < dayCount; offset += 1) {
        const day = addDays(first, offset);
        const currentDate = dateKey(day);
        const month = monthKey(day);
        const yesterday = dateKey(addDays(day, -1));
        const usedToday = new Set(all.filter(item => workDate(item) === currentDate).map(item => item.MaNV));

        for (const shift of orderedShifts) {
            const currentCount = all.filter(item => workDate(item) === currentDate && item.MaLoaiCa === shift.MaLoaiCa).length;
            for (let slot = currentCount; slot < Number(shift.SoNguoiCan); slot += 1) {
                const candidates = orderedEmployees.filter(employee => {
                    if (usedToday.has(employee.MaNV)) return false;
                    const wk = `${employee.MaNV}|${weekKey(day)}`;
                    if ((weeklyHours.get(wk) || 0) + Number(shift.SoGio) > 48) return false;
                    if (shift.MaLoaiCa === 'DEM') {
                        const previousNights = [1, 2].map(days => dateKey(addDays(day, -days)));
                        const workedBothPreviousNights = previousNights.every(key =>
                            all.some(item => item.MaNV === employee.MaNV
                                && item.MaLoaiCa === 'DEM'
                                && workDate(item) === key));
                        if (workedBothPreviousNights) return false;
                    }
                    return hasRest(employee, day, shift);
                }).map(employee => {
                    const last = latestBefore(employee.MaNV, currentDate);
                    const lastNight = latestBefore(employee.MaNV, currentDate, 'DEM');
                    const yesterdayShift = all.find(item => item.MaNV === employee.MaNV && workDate(item) === yesterday);
                    const weekH = weeklyHours.get(`${employee.MaNV}|${weekKey(day)}`) || 0;
                    const daysSinceNight = lastNight
                        ? Math.round((day - parseDate(workDate(lastNight))) / DAY_MS)
                        : NO_NIGHT_GAP;
                    return {
                        employee,
                        keys: [
                            Math.floor(weekH / 8),
                            monthTypeCounts.get(`${employee.MaNV}|${month}|${shift.MaLoaiCa}`) || 0,
                            last && last.MaLoaiCa === shift.MaLoaiCa ? 1 : 0,
                            yesterdayShift && yesterdayShift.MaLoaiCa === shift.MaLoaiCa ? 1 : 0,
                            monthShiftCounts.get(`${employee.MaNV}|${month}`) || 0,
                            shift.MaLoaiCa === 'DEM' ? (monthNightCounts.get(`${employee.MaNV}|${month}`) || 0) : 0,
                            shift.MaLoaiCa === 'DEM' ? -daysSinceNight : 0,
                            weekH,
                            lastAssignAt.get(employee.MaNV) || NEVER_ASSIGNED,
                            employee.MaNV
                        ]
                    };
                }).sort((a, b) => compareKeys(a.keys, b.keys));

                if (!candidates.length) {
                    const label = shift.TenCa || shift.MaLoaiCa;
                    throw new Error(`Không thể xếp đủ ${label} ngày ${currentDate} mà vẫn bảo đảm 1 ca/ngày, nghỉ 12 giờ, tối đa 48 giờ/tuần và không quá 2 đêm liên tiếp.`);
                }
                const employee = candidates[0].employee;
                const item = {
                    MaNV: employee.MaNV,
                    NgayLam: currentDate,
                    MaLoaiCa: shift.MaLoaiCa,
                    NhiemVu: dutyForShift(shift),
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

const isNightShift = item => String(item?.MaLoaiCa || '') === 'DEM' || Number(item?.LaCaDem) === 1;

const scheduleSlotLockReason = item => {
    if (!item) return null;
    if (item.MaChamCong || item.ThoiGianVao || item.ThoiGianRa) {
        return 'Ca này đã chấm công nên không thể sửa. Hãy giữ nguyên để đối chiếu công/lương.';
    }
    const clock = String(item.TrangThaiChamCong || '');
    if (clock === 'Đã duyệt' || clock === 'Đang làm việc' || clock === 'Chờ duyệt') {
        return 'Ca này đã có dữ liệu chấm công nên không thể sửa.';
    }
    const pos = String(item.TrangThaiCaBan || '');
    if (pos === 'Đang mở' || pos === 'Đã chốt') {
        return 'Ca POS đã mở hoặc đã chốt trên lượt này nên không thể sửa lịch.';
    }
    if (item.MaCa) return 'Ca bán hàng đã gắn với lượt này nên không thể sửa lịch.';
    return null;
};

const assertScheduleLaborRules = (rows = []) => {
    const active = [...rows].filter(row => {
        const status = String(row.TrangThai || '');
        return !status || status === 'Bản nháp' || status === 'Đã công bố';
    });
    const byDay = new Map();
    for (const row of active) {
        const day = String(row.NgayLam).slice(0, 10);
        const key = `${row.MaNV}|${day}`;
        if (byDay.has(key)) throw new Error(`${row.TenNV || row.MaNV} đã có hơn 1 ca trong ngày ${day}.`);
        byDay.set(key, row);
    }
    const byEmployee = new Map();
    for (const row of active) {
        if (!byEmployee.has(row.MaNV)) byEmployee.set(row.MaNV, []);
        byEmployee.get(row.MaNV).push(row);
    }
    for (const rowsOfEmp of byEmployee.values()) {
        rowsOfEmp.sort((a, b) => {
            const startA = new Date(a.BatDauDuKien || 0).getTime();
            const startB = new Date(b.BatDauDuKien || 0).getTime();
            if (Number.isFinite(startA) && Number.isFinite(startB) && startA && startB && startA !== startB) {
                return startA - startB;
            }
            return String(a.NgayLam).localeCompare(String(b.NgayLam));
        });
        const name = rowsOfEmp[0].TenNV || rowsOfEmp[0].MaNV;
        const weekly = new Map();
        for (let index = 0; index < rowsOfEmp.length; index += 1) {
            const row = rowsOfEmp[index];
            const week = weekKey(parseDate(String(row.NgayLam).slice(0, 10)));
            weekly.set(week, (weekly.get(week) || 0) + Number(row.SoGio || 0));
            if (weekly.get(week) > 48) throw new Error(`${name} vượt 48 giờ trong tuần bắt đầu ${week}.`);
            if (index > 0 && row.BatDauDuKien && rowsOfEmp[index - 1].KetThucDuKien) {
                const rest = (new Date(row.BatDauDuKien) - new Date(rowsOfEmp[index - 1].KetThucDuKien)) / 3600000;
                if (rest < 12) throw new Error(`${name} chỉ nghỉ ${Math.max(0, rest).toFixed(1)} giờ giữa hai ca.`);
            }
        }
        const nightDays = [...new Set(rowsOfEmp.filter(isNightShift).map(row => String(row.NgayLam).slice(0, 10)))].sort();
        for (let index = 2; index < nightDays.length; index += 1) {
            const first = parseDate(nightDays[index - 2]);
            const last = parseDate(nightDays[index]);
            if ((last - first) / DAY_MS === 2) {
                throw new Error(`${name} bị xếp 3 đêm liên tiếp (${nightDays[index - 2]}–${nightDays[index]}).`);
            }
        }
    }
};

module.exports = {
    generateSchedule, generateOfficeSchedule, parseDate, dateKey, addDays, weekKey,
    scheduleHistoryFrom, CASHIER_TEAM_SIZE, OFFICE_TEAM_SIZE, OFFICE_ROLES, OFFICE_SHIFT_CODE,
    isOfficeShift, officeDutyFor, isNightShift, scheduleSlotLockReason, assertScheduleLaborRules
};
