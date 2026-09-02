const { sql } = require('../config/db');
const { splitDayNightMinutes, toLocalDateKey } = require('./timeService');
const { vietnamCalendar } = require('./reportingPeriod');

const HOLIDAY_MINUTES = 8 * 60;
const PAYMENT_DAY = 10;
const VALID_METHODS = new Set(['Tiền mặt', 'Chuyển khoản']);
const FUND_METHODS = new Set(['Tiền mặt', 'Ủy quyền chuyển khoản']);

const validMonth = value => /^\d{4}-\d{2}$/.test(String(value || ''));

const money = value => Math.round(Number(value || 0) * 100) / 100;

const dateKey = value => {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    return toLocalDateKey(value);
};

const paymentDateFor = month => {
    const [year, monthNumber] = month.split('-').map(Number);
    const payMonth = monthNumber === 12 ? 1 : monthNumber + 1;
    const payYear = monthNumber === 12 ? year + 1 : year;
    return `${payYear}-${String(payMonth).padStart(2, '0')}-${String(PAYMENT_DAY).padStart(2, '0')}`;
};

const periodBounds = month => {
    const [year, monthNumber] = month.split('-').map(Number);
    const startKey = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
    const endDate = new Date(year, monthNumber, 0);
    const endKey = `${year}-${String(monthNumber).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    return {
        year,
        monthNumber,
        startKey,
        endKey,
        start: new Date(year, monthNumber - 1, 1, 0, 0, 0),
        end: new Date(year, monthNumber, 1, 0, 0, 0),
        paymentDate: paymentDateFor(month)
    };
};

const mondayKey = value => {
    const date = new Date(`${dateKey(value)}T00:00:00`);
    const offset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offset);
    return dateKey(date);
};

const sundayKey = monday => {
    const date = new Date(`${monday}T00:00:00`);
    date.setDate(date.getDate() + 6);
    return dateKey(date);
};

const isSunday = value => new Date(`${dateKey(value)}T00:00:00`).getDay() === 0;

const isOfficeShift = row => String(row?.NhomCa || row?.MaLoaiCa || '') === 'HANH_CHINH';

const employedOn = (employee, day) => {
    const rest = employee.NgayNghiViec ? dateKey(employee.NgayNghiViec) : '';
    if (employee.TrangThai === 'Nghỉ việc' && !rest) return false;
    if (rest && day > rest) return false;
    return true;
};

const loadRates = async (connection) => {
    const result = await new sql.Request(connection).query(
        'SELECT MaHeSo,LoaiNgay,LoaiGio,HeSo,MinHeSo,MoTa FROM HeSoLuongNgay'
    );
    const map = new Map();
    for (const row of result.recordset) map.set(`${row.LoaiNgay}|${row.LoaiGio}`, Number(row.HeSo));
    return { rows: result.recordset, map };
};

const rateOf = (rates, loaiNgay, loaiGio) => {
    const found = rates.map.get(`${loaiNgay}|${loaiGio}`);
    if (found) return found;
    if (loaiGio === 'TrongCaNgay') return loaiNgay === 'LeTet' ? 3 : loaiNgay === 'NghiTuan' ? 2 : 1;
    if (loaiGio === 'TrongCaDem') return loaiNgay === 'LeTet' ? 3.3 : loaiNgay === 'NghiTuan' ? 2.3 : 1.3;
    if (loaiGio === 'TangCaNgay') return loaiNgay === 'LeTet' ? 3.6 : loaiNgay === 'NghiTuan' ? 2.4 : 1.5;
    return loaiNgay === 'LeTet' ? 3.9 : loaiNgay === 'NghiTuan' ? 2.7 : 2;
};

const loadHolidays = async (connection, year, fromKey = null, toKey = null) => {
    const request = new sql.Request(connection).input('Nam', sql.Int, year);
    let sqlText = `SELECT Nam,CONVERT(varchar(10),NgayDuongLich,23) NgayDuongLich,TenLe,NhomLe,Nguon,GhiChu,
                          NguoiCapNhat,NgayCapNhat,NgayKhoa
                   FROM NgayLeNam WHERE Nam=@Nam`;
    if (fromKey && toKey) {
        request.input('From', sql.Date, fromKey).input('To', sql.Date, toKey);
        sqlText += ' AND NgayDuongLich BETWEEN @From AND @To';
    }
    const result = await request.query(`${sqlText} ORDER BY NgayDuongLich`);
    return result.recordset;
};

const holidaySet = rows => new Set(rows.map(row => dateKey(row.NgayDuongLich)));

const validateLunarCalendar = (rows) => {
    const tet = rows.filter(row => row.NhomLe === 'TetAmLich');
    const gioTo = rows.filter(row => row.NhomLe === 'GioTo');
    const adjacent = rows.filter(row => row.NhomLe === 'QuocKhanhLienKe' || row.Nguon === 'QuocKhanhLienKe');
    const missing = [];
    if (tet.length < 5) missing.push('Tết Âm lịch (cần đủ 5 ngày dương lịch)');
    if (gioTo.length < 1) missing.push('Giỗ Tổ Hùng Vương (10/03 âm lịch — nhập ngày dương lịch)');
    if (adjacent.length < 1) missing.push('ngày liền kề Quốc khánh 02/09 (01/09 hoặc 03/09)');
    if (!missing.length) return null;
    return `Lịch lễ năm chưa đủ ngày âm lịch / liền kề: ${missing.join('; ')}. Quản lý hãy khai báo tại Điều hành → Ngày lễ năm trước khi Kế toán lập bảng lương.`;
};

const pendingAttendance = async (connection, startKey, endKey) => {
    const result = await new sql.Request(connection)
        .input('From', sql.Date, startKey).input('To', sql.Date, endKey).query(`
            SELECT cc.MaChamCong,l.MaNV,nv.TenNV,CONVERT(varchar(10),l.NgayLam,23) NgayLam,cc.TrangThai
            FROM ChamCong cc
            JOIN LichLamViec l ON l.MaLich=cc.MaLich
            JOIN NhanVien nv ON nv.MaNV=l.MaNV
            WHERE l.NgayLam BETWEEN @From AND @To
              AND l.TrangThai=N'Đã công bố'
              AND (
                    cc.TrangThai=N'Chờ duyệt'
                    OR (cc.ThoiGianVao IS NOT NULL AND cc.ThoiGianRa IS NOT NULL AND cc.TrangThai<>N'Đã duyệt'
                        AND cc.TrangThai<>N'Từ chối')
              )
            ORDER BY l.NgayLam,nv.TenNV`);
    return result.recordset;
};

const isWeeklyRestWork = (day, row, weekDays) => {
    if (isOfficeShift(row)) return isSunday(day);
    const week = mondayKey(day);
    const days = weekDays.get(`${row.MaNV}|${week}`);
    if (!days || days.size < 7) return false;
    const sunday = sundayKey(week);
    if (days.has(sunday)) return day === sunday;
    const last = [...days].sort().pop();
    return day === last;
};

const loaiNgayOf = (day, holidays, row, weekDays) => {
    if (holidays.has(day)) return 'LeTet';
    if (isWeeklyRestWork(day, row, weekDays)) return 'NghiTuan';
    return 'Thuong';
};

const pushLine = (details, line) => {
    if (!line.phutNgay && !line.phutDem) return;
    details.push({
        MaChamCong: line.MaChamCong,
        NgayCong: line.NgayCong,
        PhutNgay: line.phutNgay,
        PhutDem: line.phutDem,
        LuongGio: line.LuongGio,
        LoaiNgay: line.LoaiNgay,
        LoaiGio: line.LoaiGio,
        HeSoApDung: line.heso,
        HeSoBanDem: line.heso,
        ThanhTien: money(line.phutNgay / 60 * line.LuongGio * line.heso + line.phutDem / 60 * line.LuongGio * line.heso)
    });
};

const computeShiftLines = (row, bounds, holidays, rates, weekDays) => {
    const start = new Date(Math.max(new Date(row.BatDau).getTime(), bounds.start.getTime()));
    const end = new Date(Math.min(new Date(row.KetThuc).getTime(), bounds.end.getTime()));
    if (!(start < end)) return [];
    const day = dateKey(row.NgayLam);
    const loaiNgay = loaiNgayOf(day, holidays, row, weekDays);
    const scheduledEnd = row.KetThucDuKien ? new Date(row.KetThucDuKien) : end;
    const scheduledStart = row.BatDauDuKien ? new Date(row.BatDauDuKien) : start;
    const breaks = { GioNghiBatDau: row.GioNghiBatDau, GioNghiKetThuc: row.GioNghiKetThuc };
    const inStart = new Date(Math.max(start.getTime(), scheduledStart.getTime()));
    const inEnd = new Date(Math.min(end.getTime(), scheduledEnd.getTime()));
    const inShift = inStart < inEnd ? splitDayNightMinutes(inStart, inEnd, null, null, breaks) : { day: 0, night: 0 };
    const otStart = new Date(Math.max(start.getTime(), scheduledEnd.getTime()));
    const ot = end > otStart ? splitDayNightMinutes(otStart, end, null, null, breaks) : { day: 0, night: 0 };
    const luongGio = Number(row.LuongGio);
    const details = [];
    pushLine(details, {
        MaChamCong: row.MaChamCong, NgayCong: day, LuongGio: luongGio, LoaiNgay: loaiNgay,
        LoaiGio: 'TrongCaNgay', phutNgay: inShift.day, phutDem: 0, heso: rateOf(rates, loaiNgay, 'TrongCaNgay')
    });
    pushLine(details, {
        MaChamCong: row.MaChamCong, NgayCong: day, LuongGio: luongGio, LoaiNgay: loaiNgay,
        LoaiGio: 'TrongCaDem', phutNgay: 0, phutDem: inShift.night, heso: rateOf(rates, loaiNgay, 'TrongCaDem')
    });
    pushLine(details, {
        MaChamCong: row.MaChamCong, NgayCong: day, LuongGio: luongGio, LoaiNgay: loaiNgay,
        LoaiGio: 'TangCaNgay', phutNgay: ot.day, phutDem: 0, heso: rateOf(rates, loaiNgay, 'TangCaNgay')
    });
    pushLine(details, {
        MaChamCong: row.MaChamCong, NgayCong: day, LuongGio: luongGio, LoaiNgay: loaiNgay,
        LoaiGio: 'TangCaDem', phutNgay: 0, phutDem: ot.night, heso: rateOf(rates, loaiNgay, 'TangCaDem')
    });
    return details;
};

const holidayRestLine = (day, luongGio) => ({
    MaChamCong: null,
    NgayCong: day,
    PhutNgay: HOLIDAY_MINUTES,
    PhutDem: 0,
    LuongGio: luongGio,
    LoaiNgay: 'LeTet',
    LoaiGio: 'NgayLeNghi',
    HeSoApDung: 1,
    HeSoBanDem: 1,
    ThanhTien: money(HOLIDAY_MINUTES / 60 * luongGio)
});

const summarize = (details) => {
    let phutNgay = 0;
    let phutDem = 0;
    let phutLe = 0;
    let luongCoBan = 0;
    let luongBanDem = 0;
    let luongTangCa = 0;
    let luongNgayLe = 0;
    for (const line of details) {
        if (line.LoaiGio === 'NgayLeNghi') {
            phutLe += line.PhutNgay + line.PhutDem;
            luongNgayLe += line.ThanhTien;
            continue;
        }
        if (line.LoaiNgay === 'LeTet') phutLe += line.PhutNgay + line.PhutDem;
        phutNgay += line.PhutNgay;
        phutDem += line.PhutDem;
        if (line.LoaiGio.startsWith('TangCa')) luongTangCa += line.ThanhTien;
        else if (line.LoaiGio === 'TrongCaDem') luongBanDem += line.ThanhTien;
        else luongCoBan += line.ThanhTien;
    }
    const tong = money(luongCoBan + luongBanDem + luongTangCa + luongNgayLe);
    return {
        PhutNgay: phutNgay, PhutDem: phutDem, PhutLe: phutLe,
        LuongCoBan: money(luongCoBan), LuongBanDem: money(luongBanDem),
        LuongTangCa: money(luongTangCa), LuongNgayLe: money(luongNgayLe),
        Thuong: 0, KhauTru: 0, TongLuong: tong
    };
};

const lateWarning = (paymentDate, unpaid) => {
    if (!unpaid) return { warn: false, late: false };
    const today = vietnamCalendar().date;
    const pay = dateKey(paymentDate);
    const warnDate = (() => {
        const d = new Date(`${pay}T00:00:00`);
        d.setDate(d.getDate() - 2);
        return dateKey(d);
    })();
    return {
        warn: today >= warnDate,
        late: today > pay,
        today,
        paymentDate: pay,
        warnFrom: warnDate
    };
};

const voucherMaPhieu = (month, maNV) => `PCL${month.replace('-', '')}${maNV}`.slice(0, 30);

module.exports = {
    HOLIDAY_MINUTES, PAYMENT_DAY, VALID_METHODS, FUND_METHODS,
    validMonth, money, dateKey, paymentDateFor, periodBounds,
    employedOn, loadRates, rateOf, loadHolidays, holidaySet,
    validateLunarCalendar, pendingAttendance, computeShiftLines,
    holidayRestLine, summarize, lateWarning, voucherMaPhieu, mondayKey
};
