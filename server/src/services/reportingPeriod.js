const pad = value => String(value).padStart(2, '0');
const isoUtcDate = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const addDays = (value, days) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return isoUtcDate(date);
};

const vietnamCalendar = (now = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(now);
    const get = type => parts.find(part => part.type === type)?.value;
    const year = Number(get('year'));
    const month = get('month');
    const day = get('day');
    const quarter = Math.floor((Number(month) - 1) / 3) + 1;
    return {
        year,
        month,
        day,
        quarter,
        date: `${year}-${month}-${day}`,
        monthPeriod: `${year}-${month}`,
        quarterPeriod: `${year}-Q${quarter}`,
        yearPeriod: String(year)
    };
};

/** Ngày dương lịch VN (YYYY-MM-DD). Không dùng toISOString()/UTC slice — DATE SQL + useUTC:false thành 17:00Z ngày hôm trước. */
const vietnamDateKey = (value) => {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return vietnamCalendar(value).date;
    }
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return vietnamCalendar(parsed).date;
};

/** HD202609080001 → 2026-09-08. HDM2026080001 / PC202608xxxx (YYYYMM) → 2026-08-01. CP2608xxxx (YYMM) → 2026-08-01. */
const dateKeyFromDocCode = (value) => {
    const text = String(value || '').trim().toUpperCase();
    const match = text.match(/^[A-Z]+(\d+)/);
    if (!match) return null;
    const num = match[1];
    const ymd = (year, month, day) => {
        if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
        const probe = new Date(Date.UTC(year, month - 1, day));
        if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
        return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };
    if (num.length >= 8) {
        const full = ymd(Number(num.slice(0, 4)), Number(num.slice(4, 6)), Number(num.slice(6, 8)));
        if (full) return full;
    }
    if (num.length >= 6) {
        const monthStart = ymd(Number(num.slice(0, 4)), Number(num.slice(4, 6)), 1);
        if (monthStart) return monthStart;
    }
    if (num.length >= 4) {
        const yyMonth = ymd(2000 + Number(num.slice(0, 2)), Number(num.slice(2, 4)), 1);
        if (yyMonth) return yyMonth;
    }
    return null;
};

const CALENDAR_FIELDS = new Set([
    'NgayChungTu', 'NgayHachToan', 'TuNgay', 'DenNgay', 'NgayMua', 'NgayDuaVaoSD',
    'Ngay', 'NgayGD', 'NgayHoaDon', 'NgayXuat', 'NgayCT', 'NgayLap', 'NgayPhatSinh'
]);

const calendarizeRow = (row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const next = { ...row };
    for (const key of Object.keys(next)) {
        if (!CALENDAR_FIELDS.has(key) || next[key] == null || next[key] === '') continue;
        const iso = vietnamDateKey(next[key]);
        if (iso) next[key] = iso;
    }
    return next;
};

const currentPeriodDefaults = (now = new Date()) => {
    const calendar = vietnamCalendar(now);
    return {
        day: calendar.date,
        month: calendar.monthPeriod,
        quarter: calendar.quarterPeriod,
        year: calendar.yearPeriod
    };
};

const assertYear = value => {
    const year = Number(value);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Năm báo cáo không hợp lệ.');
    return year;
};

const resolveReportingPeriod = (query = {}, now = new Date()) => {
    const periodType = String(query.periodType || 'month').trim().toLowerCase();
    const defaults = currentPeriodDefaults(now);
    const period = String(query.period || defaults[periodType] || defaults.month).trim();
    let from;
    let toExclusive;
    let label;

    if (periodType === 'day') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) throw new Error('Ngày báo cáo phải có dạng YYYY-MM-DD.');
        const [year, month, day] = period.split('-').map(Number);
        assertYear(year);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (isoUtcDate(date) !== period) throw new Error('Ngày báo cáo không tồn tại.');
        from = period;
        toExclusive = addDays(period, 1);
        label = `Ngày ${pad(day)}/${pad(month)}/${year}`;
    } else if (periodType === 'month') {
        const match = period.match(/^(\d{4})-(\d{2})$/);
        if (!match) throw new Error('Tháng báo cáo phải có dạng YYYY-MM.');
        const year = assertYear(match[1]);
        const month = Number(match[2]);
        if (month < 1 || month > 12) throw new Error('Tháng báo cáo không hợp lệ.');
        from = `${year}-${pad(month)}-01`;
        toExclusive = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
        label = `Tháng ${pad(month)}/${year}`;
    } else if (periodType === 'quarter') {
        const match = period.match(/^(\d{4})-Q([1-4])$/i);
        if (!match) throw new Error('Quý báo cáo phải có dạng YYYY-Q1 đến YYYY-Q4.');
        const year = assertYear(match[1]);
        const quarter = Number(match[2]);
        const startMonth = (quarter - 1) * 3 + 1;
        from = `${year}-${pad(startMonth)}-01`;
        toExclusive = quarter === 4 ? `${year + 1}-01-01` : `${year}-${pad(startMonth + 3)}-01`;
        label = `Quý ${quarter}/${year}`;
    } else if (periodType === 'year') {
        const year = assertYear(period);
        from = `${year}-01-01`;
        toExclusive = `${year + 1}-01-01`;
        label = `Năm ${year}`;
    } else {
        throw new Error('Loại kỳ báo cáo chỉ nhận ngày, tháng, quý hoặc năm.');
    }

    return { periodType, period, from, toExclusive, to: addDays(toExclusive, -1), label };
};

const activityFromStamp = stamp => {
    if (!stamp) return null;
    const date = new Date(stamp);
    if (Number.isNaN(date.getTime())) return null;
    const calendar = vietnamCalendar(date);
    return {
        day: calendar.date,
        month: calendar.monthPeriod,
        quarter: calendar.quarterPeriod,
        year: calendar.yearPeriod
    };
};

const formatPeriodLabel = (periodType, period, fallback = '') => {
    try {
        return resolveReportingPeriod({ periodType, period }).label;
    } catch {
        const text = String(fallback || period || '').trim();
        return /[\uFFFD]/.test(text) ? String(period || '') : text;
    }
};

module.exports = {
    resolveReportingPeriod,
    vietnamCalendar,
    vietnamDateKey,
    dateKeyFromDocCode,
    calendarizeRow,
    currentPeriodDefaults,
    activityFromStamp,
    formatPeriodLabel
};
