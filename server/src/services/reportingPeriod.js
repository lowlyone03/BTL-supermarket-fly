const pad = value => String(value).padStart(2, '0');
const isoDate = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const addDays = (value, days) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return isoDate(date);
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
        if (isoDate(date) !== period) throw new Error('Ngày báo cáo không tồn tại.');
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
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const quarter = Math.floor((Number(month) - 1) / 3) + 1;
    return {
        day: `${year}-${month}-${day}`,
        month: `${year}-${month}`,
        quarter: `${year}-Q${quarter}`,
        year: String(year)
    };
};

module.exports = { resolveReportingPeriod, vietnamCalendar, currentPeriodDefaults, activityFromStamp };
