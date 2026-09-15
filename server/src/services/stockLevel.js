'use strict';

const APPROACHING_MIN_UNITS = 5;

const STOCK_STATUS = Object.freeze({
    NEVER_IMPORTED: 'Chưa nhập lần đầu',
    OUT: 'Hết hàng',
    NEED_RESTOCK: 'Cần bổ sung',
    APPROACHING: 'Sắp chạm định mức',
    ENOUGH: 'Đủ hàng'
});

const numberOrZero = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const classifyMucTon = ({ SLTon = 0, TonKhoToiThieu = 0, neverImported = false } = {}) => {
    if (neverImported) return STOCK_STATUS.NEVER_IMPORTED;
    const onHand = numberOrZero(SLTon);
    const minimum = numberOrZero(TonKhoToiThieu);
    if (onHand <= 0) return STOCK_STATUS.OUT;
    if (onHand <= minimum) return STOCK_STATUS.NEED_RESTOCK;
    if ((onHand - minimum) <= APPROACHING_MIN_UNITS) return STOCK_STATUS.APPROACHING;
    return STOCK_STATUS.ENOUGH;
};

const needsImportAttention = item => classifyMucTon(item) !== STOCK_STATUS.ENOUGH;

const mucTonSql = (qtyExpr, minExpr, { neverImportedPredicate } = {}) => {
    const qty = `ISNULL(${qtyExpr}, 0)`;
    const neverImported = neverImportedPredicate
        ? `WHEN ${neverImportedPredicate} THEN N'${STOCK_STATUS.NEVER_IMPORTED}'
             `
        : '';
    return `CASE
             ${neverImported}WHEN ${qty} <= 0 THEN N'${STOCK_STATUS.OUT}'
             WHEN ${qty} <= ${minExpr} THEN N'${STOCK_STATUS.NEED_RESTOCK}'
             WHEN ${qty} > ${minExpr} AND ${qty} - ${minExpr} <= ${APPROACHING_MIN_UNITS} THEN N'${STOCK_STATUS.APPROACHING}'
             ELSE N'${STOCK_STATUS.ENOUGH}'
           END`;
};

const lowOnlyPredicateSql = (qtyExpr, minExpr, { neverImportedPredicate } = {}) => {
    const qty = `ISNULL(${qtyExpr}, 0)`;
    const parts = [
        neverImportedPredicate,
        `${qty} <= ${minExpr} + ${APPROACHING_MIN_UNITS}`
    ].filter(Boolean);
    return `(${parts.join(' OR ')})`;
};

module.exports = {
    APPROACHING_MIN_UNITS,
    STOCK_STATUS,
    classifyMucTon,
    needsImportAttention,
    mucTonSql,
    lowOnlyPredicateSql
};
