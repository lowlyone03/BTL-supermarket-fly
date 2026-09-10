const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const bandOf = (score) => {
    if (score >= 70) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
};

const WEIGHTS = {
    supplier: { late: 35, priceUp: 30, short: 35 },
    po: { price: 40, stock: 30, late: 30 },
    shift: { variance: 70, repeat: 30 }
};

const scoreSupplier = ({ lateDays = 0, priceUpPct = 0, shortQty = 0, orderedQty = 0 } = {}) => {
    const late = Math.min(1, Math.max(0, Number(lateDays) || 0) / 14) * WEIGHTS.supplier.late;
    const price = Math.min(1, Math.max(0, Number(priceUpPct) || 0) / 20) * WEIGHTS.supplier.priceUp;
    const ordered = Number(orderedQty) || 0;
    const shortRatio = ordered > 0 ? Math.min(1, Math.max(0, Number(shortQty) || 0) / ordered) : 0;
    const short = shortRatio * WEIGHTS.supplier.short;
    const score = clamp(late + price + short);
    return {
        kind: 'supplier',
        score,
        band: bandOf(score),
        weights: WEIGHTS.supplier,
        parts: {
            giaoTre: Math.round(late),
            giaTang: Math.round(price),
            giaoThieu: Math.round(short)
        }
    };
};

const scorePurchaseOrder = ({ priceUpPct = 0, relatedLowStock = false, lateDays = 0 } = {}) => {
    const price = Math.min(1, Math.max(0, Number(priceUpPct) || 0) / 20) * WEIGHTS.po.price;
    const stock = relatedLowStock ? WEIGHTS.po.stock : 0;
    const late = Math.min(1, Math.max(0, Number(lateDays) || 0) / 10) * WEIGHTS.po.late;
    const score = clamp(price + stock + late);
    return {
        kind: 'po',
        score,
        band: bandOf(score),
        weights: WEIGHTS.po,
        parts: {
            giaVsLichSu: Math.round(price),
            tonLienQuan: Math.round(stock),
            treHan: Math.round(late)
        }
    };
};

const scoreShift = ({ varianceAbs = 0, systemCash = 0, repeatCount = 0 } = {}) => {
    const base = Number(systemCash) > 0
        ? Math.min(1, Math.abs(Number(varianceAbs) || 0) / Math.max(Number(systemCash), 1))
        : (Math.abs(Number(varianceAbs) || 0) > 0 ? 1 : 0);
    const variance = base * WEIGHTS.shift.variance;
    const repeat = Math.min(1, Math.max(0, Number(repeatCount) || 0) / 3) * WEIGHTS.shift.repeat;
    const score = clamp(variance + repeat);
    return {
        kind: 'shift',
        score,
        band: bandOf(score),
        weights: WEIGHTS.shift,
        parts: {
            lechKet: Math.round(variance),
            lapLai: Math.round(repeat)
        }
    };
};

module.exports = { WEIGHTS, bandOf, scoreSupplier, scorePurchaseOrder, scoreShift };
