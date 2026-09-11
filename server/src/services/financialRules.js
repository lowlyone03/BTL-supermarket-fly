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

// Đổi ngang = không đụng tiền. Khác giá: hoàn chênh hoặc thu chênh trên cùng phiếu — không hoàn hết rồi bán lại.
const isEqualValueExchange = (returnedValue, exchangeValue) => moneyMatches(
    roundMoney(returnedValue),
    roundMoney(exchangeValue)
);

const exchangeMoneyDelta = (returnedValue, exchangeValue) => {
    const returned = roundMoney(returnedValue);
    const issued = roundMoney(exchangeValue);
    if (isEqualValueExchange(returned, issued)) {
        return { kind: 'equal', amount: 0, soTienHoan: 0, soTienThuThem: 0 };
    }
    if (returned > issued) {
        const amount = roundMoney(returned - issued);
        return { kind: 'refund', amount, soTienHoan: amount, soTienThuThem: 0 };
    }
    const amount = roundMoney(issued - returned);
    return { kind: 'collect', amount, soTienHoan: 0, soTienThuThem: amount };
};

// Số dư két dự kiến = quỹ đầu ca + TM thu − hoàn TM. QR hoàn không vào công thức này.
// Hàm chỉ tính số; không được dùng để cho phép két âm — chặn ở cashRefundBlockedByDrawer.
const expectedDrawerCash = ({ TienDauCa = 0, TongTienMat = 0, TongTienHoanMat = 0 } = {}) =>
    roundMoney(number(TienDauCa) + number(TongTienMat) - number(TongTienHoanMat));

const dongTmThuan = ({ TongTienMat = 0, TongTienHoanMat = 0 } = {}) =>
    roundMoney(number(TongTienMat) - number(TongTienHoanMat));

const qrNet = ({ TongTienQR = 0, TongTienHoanQR = 0 } = {}) =>
    roundMoney(number(TongTienQR) - number(TongTienHoanQR));

const REFUND_METHODS = ['Tiền mặt', 'QR', 'Thẻ', 'Chuyển khoản'];
const RETURN_DONE_STATUSES = ['Hoàn thành'];
const RETURN_MONEY_PENDING = 'Đang hoàn tiền';
const RETURN_MONEY_FAILED = 'Hoàn tiền thất bại';
const RETURN_CLOSED_STATUSES = ['Hoàn thành', 'Từ chối', 'Đã hủy'];
const RETURN_DONE_SQL = `dt.TrangThai=N'Hoàn thành'`;
const RETURN_OPEN_SQL = `dt.TrangThai NOT IN (N'Hoàn thành', N'Từ chối', N'Đã hủy')`;

const isSettledReturn = status => RETURN_DONE_STATUSES.includes(String(status || ''));
const isReturnMoneyPending = status => String(status || '') === RETURN_MONEY_PENDING;
const isReturnMoneyFailed = status => String(status || '') === RETURN_MONEY_FAILED;

const canonicalRefundMethod = method => {
    const value = String(method || '').trim();
    if (/zalo|momo|^qr$/i.test(value)) return 'QR';
    return REFUND_METHODS.includes(value) ? value : '';
};

const originalInvoicePayMethod = (payments = []) => {
    const successful = (Array.isArray(payments) ? payments : []).filter(row =>
        !row.TrangThai || row.TrangThai === 'Thành công'
    );
    if (!successful.length) return '';
    const top = [...successful].sort((left, right) => number(right.SoTien) - number(left.SoTien))[0];
    return canonicalRefundMethod(top.PhuongThuc);
};

const defaultRefundMethod = (originalMethod, payments = []) =>
    canonicalRefundMethod(originalMethod) || originalInvoicePayMethod(payments) || 'Tiền mặt';

// HĐ gốc QR → bắt buộc hoàn QR/ZaloPay. Thu ngân không được đổi sang tiền mặt.
const cashierMayRefundCash = (originalMethod, payments = []) =>
    defaultRefundMethod(originalMethod, payments) === 'Tiền mặt';

const cashRefundExceedsDrawer = (soTienHoan, tienMatTrongKet) =>
    roundMoney(soTienHoan) > 0 && roundMoney(soTienHoan) > roundMoney(tienMatTrongKet);

// Chặn cứng: két vật lý không âm. expectedDrawerCash âm cũng không được dùng để vẫn hoàn TM.
const cashRefundBlockedByDrawer = (soTienHoan, tienMatTrongKet) =>
    cashRefundExceedsDrawer(soTienHoan, tienMatTrongKet) || roundMoney(tienMatTrongKet) < 0;

const formatVndPlain = value => `${roundMoney(value).toLocaleString('vi-VN')} đ`;

const cashRefundDrawerBlock = ({ soTienHoan, tienMatTrongKet } = {}) => {
    if (!cashRefundBlockedByDrawer(soTienHoan, tienMatTrongKet)) return '';
    return `Số dư két không đủ để hoàn tiền. Số dư khả dụng: ${formatVndPlain(tienMatTrongKet)}. Số tiền cần hoàn: ${formatVndPlain(soTienHoan)}. Vui lòng hoàn về phương thức thanh toán ban đầu.`;
};

const cashRefundDrawerWarning = cashRefundDrawerBlock;

const refundableQrRemaining = (originalQrPaid, alreadyRefundedQr) =>
    roundMoney(Math.max(0, number(originalQrPaid) - number(alreadyRefundedQr)));

const qrRefundWouldExceedCap = (amount, originalQrPaid, alreadyRefundedQr) =>
    roundMoney(amount) > refundableQrRemaining(originalQrPaid, alreadyRefundedQr);

// MaGiaoDich lúc QR Thành công = zp_trans_id. Không bịa mã nếu thiếu.
const zpTransIdOf = (payment = {}) => {
    const direct = String(payment.MaGiaoDich || payment.zp_trans_id || payment.ZpTransId || '').trim();
    if (direct) return direct;
    const note = String(payment.GhiChu || '');
    const match = note.match(/zp_trans_id:([0-9A-Za-z._-]+)/i);
    return match ? match[1] : '';
};

const nextRefundSendAction = ({ currentTxStatus, queryClassification } = {}) => {
    const status = String(currentTxStatus || '').toUpperCase();
    const klass = String(queryClassification || '');
    if (status === 'DANG_XU_LY' || klass === 'pending' || klass === 'authorized') return 'query_only';
    if (status === 'THANH_CONG' || klass === 'success') return 'already_done';
    if (status === 'THAT_BAI' || klass === 'failure') return 'resend_after_fail';
    if (status === 'CHO_GUI' || !status) return 'create';
    return 'query_only';
};

const cashHandoverExcludingOpening = (tienCuoiCa, tienDauCa) =>
    roundMoney(number(tienCuoiCa) - number(tienDauCa));

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
    exchangeMoneyDelta,
    roundMoney,
    moneyMatches,
    expectedDrawerCash,
    dongTmThuan,
    qrNet,
    REFUND_METHODS,
    RETURN_DONE_STATUSES,
    RETURN_MONEY_PENDING,
    RETURN_MONEY_FAILED,
    RETURN_CLOSED_STATUSES,
    RETURN_DONE_SQL,
    RETURN_OPEN_SQL,
    isSettledReturn,
    isReturnMoneyPending,
    isReturnMoneyFailed,
    canonicalRefundMethod,
    originalInvoicePayMethod,
    defaultRefundMethod,
    cashierMayRefundCash,
    cashRefundExceedsDrawer,
    cashRefundBlockedByDrawer,
    cashRefundDrawerBlock,
    cashRefundDrawerWarning,
    refundableQrRemaining,
    qrRefundWouldExceedCap,
    zpTransIdOf,
    nextRefundSendAction,
    cashHandoverExcludingOpening,
    calculateGrossProfit,
    evaluateThreeWayMatch
};
