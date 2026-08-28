const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const toLocalDateKey = value => {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const timeToMinutes = value => {
    if (value == null || value === '') return null;
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.getUTCHours() * 60 + value.getUTCMinutes();
    }
    const text = String(value);
    const match = text.match(/(\d{1,2}):(\d{2})/);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
    const asDate = new Date(value);
    if (Number.isFinite(asDate.getTime())) return asDate.getHours() * 60 + asDate.getMinutes();
    return null;
};

const isInBreakWindow = (cursor, breakStartMin, breakEndMin) => {
    if (breakStartMin == null || breakEndMin == null || breakStartMin === breakEndMin) return false;
    const minute = cursor.getHours() * 60 + cursor.getMinutes();
    return breakStartMin < breakEndMin
        ? minute >= breakStartMin && minute < breakEndMin
        : minute >= breakStartMin || minute < breakEndMin;
};

const splitDayNightMinutes = (startValue, endValue, rangeStartValue = null, rangeEndValue = null, breakWindow = null) => {
    let start = new Date(startValue);
    let end = new Date(endValue);
    if (rangeStartValue && start < new Date(rangeStartValue)) start = new Date(rangeStartValue);
    if (rangeEndValue && end > new Date(rangeEndValue)) end = new Date(rangeEndValue);
    if (!(start < end)) return { day: 0, night: 0 };
    const breakStartMin = timeToMinutes(breakWindow?.GioNghiBatDau);
    const breakEndMin = timeToMinutes(breakWindow?.GioNghiKetThuc);
    let day = 0;
    let night = 0;
    for (let cursor = new Date(start); cursor < end; cursor = new Date(cursor.getTime() + MINUTE_MS)) {
        if (isInBreakWindow(cursor, breakStartMin, breakEndMin)) continue;
        const hour = cursor.getHours();
        if (hour >= 22 || hour < 6) night += 1;
        else day += 1;
    }
    return { day, night };
};

const restHours = (firstEnd, secondStart) =>
    (new Date(secondStart).getTime() - new Date(firstEnd).getTime()) / HOUR_MS;

module.exports = { HOUR_MS, MINUTE_MS, toLocalDateKey, splitDayNightMinutes, restHours, timeToMinutes };
