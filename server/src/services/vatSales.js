const { roundMoney } = require('./financialRules');

const ALLOWED_RATES = [0, 5, 8, 10];

const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const isAllowedRate = value => ALLOWED_RATES.includes(Number(value));

const assertChosenRate = (value, label = 'Thuế suất') => {
    if (value === null || value === undefined || value === '') {
        const error = new Error(`${label} chưa chọn (NULL). Chọn 0 / 5 / 8 / 10.`);
        error.code = 'THIEU_THUE';
        error.status = 400;
        throw error;
    }
    const rate = Number(value);
    if (!isAllowedRate(rate)) {
        const error = new Error(`${label} phải là 0, 5, 8 hoặc 10.`);
        error.status = 400;
        throw error;
    }
    return rate;
};

const splitVatInclusive = (grossInclusive, ratePercent) => {
    const gross = roundMoney(grossInclusive);
    if (ratePercent === null || ratePercent === undefined || ratePercent === '') {
        return { gross, rate: null, vat: 0, net: gross, missing: true };
    }
    const rate = number(ratePercent);
    if (rate <= 0) return { gross, rate, vat: 0, net: gross, missing: false };
    const vat = roundMoney(gross * rate / (100 + rate));
    return { gross, rate, vat, net: roundMoney(gross - vat), missing: false };
};

const splitVatExclusive = (netExclusive, ratePercent) => {
    const net = roundMoney(netExclusive);
    const rate = number(ratePercent);
    const vat = roundMoney(net * rate / 100);
    return { net, rate, vat, gross: roundMoney(net + vat) };
};

const allocateAfterDiscount = (lines, payableGross) => {
    const items = (lines || []).map(line => ({
        ...line,
        ThanhTien: roundMoney(line.ThanhTien ?? number(line.DonGia) * number(line.SoLuong))
    }));
    const listTotal = roundMoney(items.reduce((sum, line) => sum + number(line.ThanhTien), 0));
    const target = roundMoney(payableGross);
    if (!items.length) return [];
    if (listTotal <= 0) {
        return items.map(line => ({ ...line, ThanhTienSauGiam: 0, TienThue: 0, DoanhThuThuan: 0 }));
    }
    let allocated = 0;
    return items.map((line, index) => {
        const last = index === items.length - 1;
        const share = last
            ? roundMoney(target - allocated)
            : roundMoney(number(line.ThanhTien) * target / listTotal);
        if (!last) allocated = roundMoney(allocated + share);
        const rate = line.ThueSuat;
        const split = splitVatInclusive(share, rate);
        return {
            ...line,
            ThanhTienSauGiam: share,
            TienThue: split.missing ? 0 : split.vat,
            DoanhThuThuan: split.missing ? 0 : split.net,
            ThieuThue: Boolean(split.missing)
        };
    });
};

const snapshotSaleTaxes = (lines, payableGross) => {
    const allocated = allocateAfterDiscount(lines, payableGross);
    if (allocated.some(line => line.ThieuThue)) {
        const error = new Error('Sản phẩm chưa chọn thuế suất. Quản lý chọn 0 / 5 / 8 / 10 trước khi bán.');
        error.code = 'THIEU_THUE';
        error.status = 400;
        throw error;
    }
    allocated.forEach((line, index) => assertChosenRate(line.ThueSuat, `Thuế suất dòng ${index + 1}`));
    return {
        lines: allocated,
        TienThue: roundMoney(allocated.reduce((sum, line) => sum + number(line.TienThue), 0)),
        DoanhThuThuan: roundMoney(allocated.reduce((sum, line) => sum + number(line.DoanhThuThuan), 0))
    };
};

const reverseSaleVat = ({ hoanGomVat, thueSuatDongGoc, soLuongTra, soLuongBan, thanhTienSauGiamGoc }) => {
    const rate = thueSuatDongGoc;
    if (rate === null || rate === undefined || rate === '') {
        return { vat: 0, net: roundMoney(hoanGomVat), missing: true, rate: null };
    }
    let gross = hoanGomVat;
    if (gross == null && soLuongBan) {
        gross = roundMoney(number(thanhTienSauGiamGoc) * number(soLuongTra) / number(soLuongBan));
    }
    return { ...splitVatInclusive(gross, rate), missing: false };
};

const purchaseReturnFromSnapshot = ({ soLuongTra, soLuongHoaDon, thanhTienHang, tienThueDong, thueSuatDong }) => {
    const qtyInvoice = number(soLuongHoaDon);
    const qty = number(soLuongTra);
    if (qtyInvoice <= 0 || qty <= 0) {
        return { hang: 0, thue: 0, tong: 0, thueSuat: number(thueSuatDong) };
    }
    const ratio = qty / qtyInvoice;
    const hang = roundMoney(number(thanhTienHang) * ratio);
    const thue = tienThueDong != null
        ? roundMoney(number(tienThueDong) * ratio)
        : roundMoney(hang * number(thueSuatDong) / 100);
    return { hang, thue, tong: roundMoney(hang + thue), thueSuat: number(thueSuatDong) };
};

module.exports = {
    ALLOWED_RATES,
    isAllowedRate,
    assertChosenRate,
    splitVatInclusive,
    splitVatExclusive,
    allocateAfterDiscount,
    snapshotSaleTaxes,
    reverseSaleVat,
    purchaseReturnFromSnapshot
};
