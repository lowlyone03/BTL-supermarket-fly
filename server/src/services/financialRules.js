const MONEY_TOLERANCE = 0.01;

const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;
const moneyMatches = (left, right, tolerance = MONEY_TOLERANCE) => Math.abs(number(left) - number(right)) <= tolerance;

// Thủ kho ghi "Đạt yêu cầu, được nhập lại kho" hoặc "Không đạt, không nhập lại kho".
// Dùng "ược nhập lại kho" để khỏi phụ thuộc LOWER() với chữ Đ, và loại nhánh "không nhập lại".
const RESTOCK_ACCEPTED_SQL = `(dt.KetQuaKiemTra LIKE N'%ược nhập lại kho%' AND dt.KetQuaKiemTra NOT LIKE N'%không nhập lại%')`;
const RESTOCK_REJECTED_SQL = `(dt.KetQuaKiemTra LIKE N'%không nhập lại%')`;
const STOCK_FATE_SQL = `
    CASE
      WHEN dt.KetQuaKiemTra IS NULL OR LTRIM(RTRIM(dt.KetQuaKiemTra))=N'' THEN N'Chưa kiểm kho'
      WHEN ${RESTOCK_ACCEPTED_SQL} THEN N'Nhập lại kho bán'
      WHEN ${RESTOCK_REJECTED_SQL} THEN N'Loại bỏ / vứt — không cộng tồn (đã trừ lúc bán)'
      ELSE N'Chưa rõ xử lý kho'
    END`;

const isRestockAccepted = text => {
    const value = String(text || '');
    return /ược nhập lại kho/i.test(value) && !/không nhập lại/i.test(value);
};

const looksUnsellable = text => /hỏng|hết hạn|kém chất|lỗi cửa hàng|không bán/i.test(String(text || ''));

// Chương 6 quy ước dòng "Hàng giao đổi" chỉ dùng khi đổi ngang giá.
// Nếu khác giá, nghiệp vụ phải hoàn hàng cũ và lập hóa đơn bán mới.
const isEqualValueExchange = (returnedValue, exchangeValue) => moneyMatches(
    roundMoney(returnedValue),
    roundMoney(exchangeValue)
);

const calculateGrossProfit = values => {
    const DoanhThuHoaDon = roundMoney(values.DoanhThuHoaDon ?? values.DoanhThu);
    const TienHoan = roundMoney(values.TienHoan);
    const GiaVonHoaDon = roundMoney(values.GiaVonHoaDon ?? values.GiaVon);
    const GiaVonHangTraNhapLai = roundMoney(values.GiaVonHangTraNhapLai);
    const GiaVonHangGiaoDoi = roundMoney(values.GiaVonHangGiaoDoi);
    const DoanhThuThuan = roundMoney(DoanhThuHoaDon - TienHoan);
    const GiaVonHangBanThuan = roundMoney(GiaVonHoaDon - GiaVonHangTraNhapLai + GiaVonHangGiaoDoi);
    return {
        DoanhThuHoaDon,
        TienHoan,
        DoanhThuThuan,
        GiaVonHoaDon,
        GiaVonHangTraNhapLai,
        GiaVonHangGiaoDoi,
        GiaVonHangBanThuan,
        LoiNhuanGop: roundMoney(DoanhThuThuan - GiaVonHangBanThuan)
    };
};

const createDifference = (code, scope, message, values = {}) => ({ code, scope, message, ...values });

const evaluateThreeWayMatch = ({ invoice, invoiceLines = [], receipt, receiptLines = [] }) => {
    const differences = [];
    const rows = [];
    const referenceMap = new Map(receiptLines.map(line => [line.MaSP, line]));
    const invoiceMap = new Map(invoiceLines.map(line => [line.MaSP, line]));
    const productIds = [...new Set([...invoiceMap.keys(), ...referenceMap.keys()])];

    for (const MaSP of productIds) {
        const hd = invoiceMap.get(MaSP);
        const pn = referenceMap.get(MaSP);
        const rowDifferences = [];
        if (!hd) rowDifferences.push(createDifference('MISSING_INVOICE_PRODUCT', 'product', `${MaSP}: đã nhận nhưng thiếu trên hóa đơn`));
        if (!pn) rowDifferences.push(createDifference('MISSING_RECEIPT_PRODUCT', 'product', `${MaSP}: không có trong Phiếu nhập`));

        const invoiceQuantity = number(hd?.SoLuong);
        const receiptQuantity = number(pn?.SoLuongChapNhan);
        const orderPrice = number(pn?.DonGiaDonMua);
        const receiptPrice = number(pn?.DonGiaNhap);
        const invoicePrice = number(hd?.DonGia);
        const invoiceLineAmount = number(hd?.ThanhTien);
        const expectedLineAmount = roundMoney(invoiceQuantity * invoicePrice);
        const receiptLineAmount = number(pn?.ThanhTienPhieuNhap ?? pn?.ThanhTien);
        const expectedTax = roundMoney(expectedLineAmount * number(hd?.ThueSuat) / 100);
        const invoiceTax = number(hd?.TienThue);

        if (hd && pn && invoiceQuantity !== receiptQuantity) {
            rowDifferences.push(createDifference('QUANTITY_MISMATCH', 'quantity', `${MaSP}: hóa đơn ${invoiceQuantity}, thực nhận ${receiptQuantity}`, {
                invoiceValue: invoiceQuantity, referenceValue: receiptQuantity
            }));
        }
        if (hd && pn && !moneyMatches(orderPrice, receiptPrice)) {
            rowDifferences.push(createDifference('ORDER_RECEIPT_PRICE_MISMATCH', 'price', `${MaSP}: đơn giá Phiếu nhập khác Đơn mua`, {
                orderValue: orderPrice, receiptValue: receiptPrice
            }));
        }
        if (hd && pn && !moneyMatches(invoicePrice, orderPrice)) {
            rowDifferences.push(createDifference('ORDER_INVOICE_PRICE_MISMATCH', 'price', `${MaSP}: đơn giá hóa đơn khác Đơn mua`, {
                orderValue: orderPrice, invoiceValue: invoicePrice
            }));
        }
        if (hd && pn && !moneyMatches(invoicePrice, receiptPrice)) {
            rowDifferences.push(createDifference('RECEIPT_INVOICE_PRICE_MISMATCH', 'price', `${MaSP}: đơn giá hóa đơn khác Phiếu nhập`, {
                receiptValue: receiptPrice, invoiceValue: invoicePrice
            }));
        }
        if (hd && !moneyMatches(invoiceLineAmount, expectedLineAmount)) {
            rowDifferences.push(createDifference('INVOICE_LINE_TOTAL_MISMATCH', 'total', `${MaSP}: tiền hàng trên hóa đơn không bằng số lượng × đơn giá`, {
                invoiceValue: invoiceLineAmount, expectedValue: expectedLineAmount
            }));
        }
        if (hd && pn && !moneyMatches(invoiceLineAmount, receiptLineAmount)) {
            rowDifferences.push(createDifference('RECEIPT_INVOICE_TOTAL_MISMATCH', 'total', `${MaSP}: tiền hàng hóa đơn khác Phiếu nhập`, {
                receiptValue: receiptLineAmount, invoiceValue: invoiceLineAmount
            }));
        }
        if (hd && !moneyMatches(invoiceTax, expectedTax)) {
            rowDifferences.push(createDifference('LINE_TAX_MISMATCH', 'tax', `${MaSP}: tiền thuế không đúng theo thuế suất ${number(hd.ThueSuat)}%`, {
                invoiceValue: invoiceTax, expectedValue: expectedTax
            }));
        }

        differences.push(...rowDifferences);
        rows.push({
            MaSP,
            TenSP: hd?.TenSP || pn?.TenSP,
            DonViTinh: hd?.DonViTinh || pn?.DonViTinh,
            SoLuongDat: number(pn?.SoLuongDat),
            SoLuongThucNhan: receiptQuantity,
            SoLuongHoaDon: invoiceQuantity,
            DonGiaDonMua: orderPrice,
            DonGiaPhieuNhap: receiptPrice,
            DonGiaHoaDon: invoicePrice,
            TienHangPhieuNhap: receiptLineAmount,
            TienHangHoaDon: invoiceLineAmount,
            ThueSuat: number(hd?.ThueSuat),
            TienThueHoaDon: invoiceTax,
            TienThueTinhLai: expectedTax,
            KetQuaSoLuong: rowDifferences.some(item => item.scope === 'product' || item.scope === 'quantity') ? 'Chênh lệch' : 'Khớp',
            KetQuaDonGia: rowDifferences.some(item => item.scope === 'price') ? 'Chênh lệch' : 'Khớp',
            KetQuaThue: rowDifferences.some(item => item.scope === 'tax') ? 'Chênh lệch' : 'Khớp',
            KetQuaTongTien: rowDifferences.some(item => item.scope === 'total') ? 'Chênh lệch' : 'Khớp',
            KetQua: rowDifferences.length ? 'Chênh lệch' : 'Khớp'
        });
    }

    const calculatedGoods = roundMoney(invoiceLines.reduce((sum, line) => sum + number(line.ThanhTien), 0));
    const calculatedTax = roundMoney(invoiceLines.reduce((sum, line) => sum + number(line.TienThue), 0));
    const calculatedTotal = roundMoney(calculatedGoods + calculatedTax);
    const receiptGoods = roundMoney(receiptLines.reduce((sum, line) => sum + number(line.ThanhTienPhieuNhap ?? line.ThanhTien), 0));
    const orderValueForReceivedQuantity = roundMoney(receiptLines.reduce((sum, line) => (
        sum + number(line.SoLuongChapNhan) * number(line.DonGiaDonMua)
    ), 0));

    const headerChecks = [
        ['INVOICE_GOODS_HEADER_MISMATCH', 'total', 'Tổng tiền hàng hóa đơn không bằng tổng các dòng', invoice?.TongTienHang, calculatedGoods],
        ['INVOICE_TAX_HEADER_MISMATCH', 'tax', 'Tổng tiền thuế hóa đơn không bằng tổng thuế các dòng', invoice?.TienThue, calculatedTax],
        ['INVOICE_GRAND_TOTAL_MISMATCH', 'total', 'Tổng cộng hóa đơn không bằng tiền hàng cộng tiền thuế', invoice?.TongCong, calculatedTotal],
        ['RECEIPT_HEADER_TOTAL_MISMATCH', 'total', 'Tổng Phiếu nhập không bằng tổng các dòng thực nhận', receipt?.TongTien, receiptGoods],
        ['ORDER_RECEIPT_TOTAL_MISMATCH', 'total', 'Giá trị thực nhận theo Phiếu nhập khác giá trị theo đơn giá Đơn mua', receiptGoods, orderValueForReceivedQuantity],
        ['RECEIPT_INVOICE_HEADER_MISMATCH', 'total', 'Tổng tiền hàng hóa đơn khác Tổng Phiếu nhập trước thuế', invoice?.TongTienHang, receiptGoods]
    ];
    for (const [code, scope, message, actual, expected] of headerChecks) {
        if (!moneyMatches(actual, expected)) {
            differences.push(createDifference(code, scope, message, { invoiceValue: number(actual), expectedValue: number(expected) }));
        }
    }

    return {
        matched: differences.length === 0,
        differences,
        differenceMessages: differences.map(item => item.message),
        rows,
        totals: {
            DonMuaTheoLuongNhan: orderValueForReceivedQuantity,
            PhieuNhapTruocThue: receiptGoods,
            HoaDonTienHang: number(invoice?.TongTienHang),
            HoaDonTienThue: number(invoice?.TienThue),
            HoaDonTongCong: number(invoice?.TongCong),
            TienHangTinhLai: calculatedGoods,
            TienThueTinhLai: calculatedTax,
            TongCongTinhLai: calculatedTotal
        }
    };
};

module.exports = {
    MONEY_TOLERANCE,
    RESTOCK_ACCEPTED_SQL,
    RESTOCK_REJECTED_SQL,
    STOCK_FATE_SQL,
    isRestockAccepted,
    looksUnsellable,
    isEqualValueExchange,
    roundMoney,
    moneyMatches,
    calculateGrossProfit,
    evaluateThreeWayMatch
};
