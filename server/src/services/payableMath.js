'use strict';

const OVERDUE_EXTENSION_DAYS = 45;
const PAY_TYPES = new Set(['MotLan', 'PhanTram', 'SoTien']);

const roundVnd = (value) => Math.round((Number(value) || 0) * 100) / 100;

const bad = (message) => {
    const error = new Error(message);
    error.status = 400;
    throw error;
};

const resolvePayAmount = ({ remaining, loai = 'MotLan', phanTram, soTien } = {}) => {
    const cap = Math.max(0, roundVnd(remaining));
    if (cap <= 0) bad('Khoản công nợ đã tất toán hoặc không còn số phải trả.');
    const kind = PAY_TYPES.has(String(loai || '').trim()) ? String(loai).trim() : 'MotLan';
    let amount = cap;
    if (kind === 'PhanTram') {
        const pct = Number(phanTram);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
            bad('Phần trăm thanh toán phải từ trên 0 đến 100.');
        }
        amount = roundVnd(cap * (pct / 100));
        if (amount <= 0) amount = Math.min(cap, 1);
    } else if (kind === 'SoTien') {
        amount = roundVnd(soTien);
        if (!Number.isFinite(amount) || amount <= 0) bad('Nhập số tiền thanh toán lớn hơn 0.');
    }
    const capped = amount > cap;
    if (capped) amount = cap;
    const remainingAfter = roundVnd(Math.max(0, cap - amount));
    const percentOfOriginal = (original) => {
        const base = roundVnd(original);
        if (base <= 0) return 0;
        return Math.round(((base - remainingAfter) / base) * 1000) / 10;
    };
    return {
        loai: kind,
        amount,
        capped,
        remainingAfter,
        percentOfRemaining: cap ? Math.round((amount / cap) * 1000) / 10 : 0,
        percentOfOriginal
    };
};

const daysOverdue = (hanThanhToan, today = new Date()) => {
    if (!hanThanhToan) return 0;
    const due = new Date(hanThanhToan);
    if (Number.isNaN(due.getTime())) return 0;
    const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const end = Date.UTC(due.getUTCFullYear ? due.getFullYear() : due.getFullYear(), due.getMonth(), due.getDate());
    const diff = Math.floor((start - end) / 86400000);
    return diff > 0 ? diff : 0;
};

const needsPurchasingExtension = ({ soTienConLai, hanThanhToan, today } = {}) => (
    Number(soTienConLai) > 0 && daysOverdue(hanThanhToan, today) >= OVERDUE_EXTENSION_DAYS
);

const displayDebtStatus = ({ soTienNo, soTienDaTra, soTienConLai, hanThanhToan, today } = {}) => {
    const remaining = roundVnd(soTienConLai);
    const paid = roundVnd(soTienDaTra);
    const overdue = daysOverdue(hanThanhToan, today);
    if (remaining <= 0) return 'Đã thanh toán';
    if (overdue >= OVERDUE_EXTENSION_DAYS) return 'Quá hạn';
    if (overdue > 0) return 'Quá hạn';
    if (paid > 0) return 'Thanh toán một phần';
    return Number(soTienNo) > 0 ? 'Chưa thanh toán' : 'Chưa thanh toán';
};

module.exports = {
    OVERDUE_EXTENSION_DAYS,
    PAY_TYPES,
    roundVnd,
    resolvePayAmount,
    daysOverdue,
    needsPurchasingExtension,
    displayDebtStatus
};
