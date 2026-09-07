const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const pad = value => String(value).padStart(2, '0');

const JS_DATE_LEAK = /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4}\b|\bGMT[+-]\d{4}\b|\bIndochina Time\b/;

const looksLikeJsDateString = (value) => JS_DATE_LEAK.test(String(value || ''));

const vnParts = (now = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(now);
    const get = type => parts.find(part => part.type === type)?.value;
    const year = Number(get('year'));
    const month = get('month');
    const day = get('day');
    return {
        year,
        month,
        day,
        hour: Number(get('hour')),
        minute: Number(get('minute')),
        date: `${year}-${month}-${day}`
    };
};

const addDaysIso = (iso, days) => {
    const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/;
const DMY_RE = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/;

const isDateOnlyInstant = (date, raw) => {
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (DATE_ONLY_RE.test(text)) return true;
    if (/T00:00:00(?:\.0+)?(?:Z|[+-]00:00)?$/.test(text)) return true;
    const p = vnParts(date);
    if (p.hour === 0 && p.minute === 0) return true;
    if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0
        && p.hour === 7 && p.minute === 0) {
        return true;
    }
    return false;
};

const partsFromDate = (date, raw) => {
    const p = vnParts(date);
    return {
        year: String(p.year),
        month: p.month,
        day: p.day,
        hour: pad(p.hour),
        minute: pad(p.minute),
        dateOnly: isDateOnlyInstant(date, raw)
    };
};

const parseTelegramDate = (value) => {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return partsFromDate(value, value);
    }
    const s = String(value).trim();
    if (!s) return null;
    const dateOnly = s.match(DATE_ONLY_RE);
    if (dateOnly) {
        return {
            year: dateOnly[1], month: dateOnly[2], day: dateOnly[3],
            hour: '00', minute: '00', dateOnly: true
        };
    }
    const dmy = s.match(DMY_RE);
    if (dmy && !looksLikeJsDateString(s)) {
        return {
            year: dmy[3], month: dmy[2], day: dmy[1],
            hour: dmy[4] || '00', minute: dmy[5] || '00',
            dateOnly: !dmy[4]
        };
    }
    const iso = s.match(ISO_RE);
    if (iso) {
        const parsedIso = new Date(/[T ]/.test(s) ? s.replace(' ', 'T') : s);
        if (!Number.isNaN(parsedIso.getTime())) return partsFromDate(parsedIso, s);
        return {
            year: iso[1], month: iso[2], day: iso[3],
            hour: iso[4], minute: iso[5],
            dateOnly: iso[4] === '00' && iso[5] === '00' && (!iso[6] || iso[6] === '00')
        };
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return partsFromDate(parsed, s);
    return null;
};

const formatParts = (parts, lang = 'vi', withTime = false) => {
    if (!parts) return '';
    const key = String(lang || 'vi').toLowerCase();
    const showTime = withTime && !parts.dateOnly;
    if (key === 'zh' || key === 'zh-cn' || key === 'cn') {
        const date = `${parts.year}/${parts.month}/${parts.day}`;
        return showTime ? `${date} ${parts.hour}:${parts.minute}` : date;
    }
    const date = `${parts.day}/${parts.month}/${parts.year}`;
    return showTime ? `${date} ${parts.hour}:${parts.minute}` : date;
};

const formatVnDate = (value, lang = 'vi') => formatParts(parseTelegramDate(value), lang, false);

const formatVnDateTime = (value, lang = 'vi') => formatParts(parseTelegramDate(value), lang, true);

const sanitizeJsDateText = (text, lang = 'vi') => String(text || '').replace(
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4}(?: \([^)]+\))?/g,
    (match) => formatVnDateTime(match, lang) || ''
);

/** Ngày vận hành đang chạy: trước 06:00 lịch = ca đêm ngày hôm trước. */
const operatingDayOf = (now = new Date()) => {
    const { date, hour } = vnParts(now);
    return hour >= 6 ? date : addDaysIso(date, -1);
};

const operatingWindow = (dayIso) => {
    const day = String(dayIso).slice(0, 10);
    const next = addDaysIso(day, 1);
    return {
        day,
        from: `${day}T06:00:00`,
        toExclusive: `${next}T06:00:00`,
        fromSql: `${day} 06:00:00`,
        toSql: `${next} 06:00:00`
    };
};

/** Cửa sổ gửi tóm tắt sau ca đêm: 06:05–06:15, mặc định nghĩ tới 06:10 — không phải 22:00. */
const isOperatingReportWindow = (now = new Date()) => {
    const { hour, minute } = vnParts(now);
    return hour === 6 && minute >= 5 && minute <= 15;
};

const isNightShiftStartHour = (now = new Date()) => vnParts(now).hour === 22;

/** Tin ~06:10 ngày lịch D+1 thuộc ngày vận hành D. */
const operatingDayForReport = (now = new Date()) => addDaysIso(vnParts(now).date, -1);

const isMorningScheduleWindow = (now = new Date()) => {
    const { hour, minute } = vnParts(now);
    return hour === 7 && minute >= 25 && minute <= 40;
};

const RATE_LIMIT_MS = 10 * 60 * 1000;

const isWithinRateLimit = (lastSentAt, now = new Date(), windowMs = RATE_LIMIT_MS) => {
    if (!lastSentAt) return false;
    const last = lastSentAt instanceof Date ? lastSentAt : new Date(lastSentAt);
    if (Number.isNaN(last.getTime())) return false;
    return (now.getTime() - last.getTime()) < windowMs;
};

module.exports = {
    TIME_ZONE,
    RATE_LIMIT_MS,
    vnParts,
    addDaysIso,
    parseTelegramDate,
    formatVnDate,
    formatVnDateTime,
    looksLikeJsDateString,
    sanitizeJsDateText,
    operatingDayOf,
    operatingWindow,
    isOperatingReportWindow,
    isNightShiftStartHour,
    operatingDayForReport,
    isMorningScheduleWindow,
    isWithinRateLimit
};
