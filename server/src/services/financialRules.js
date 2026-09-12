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
const RETURN_MONEY_WAITING = 'Chờ xử lý hoàn tiền';
const HOAN_CHO_GUI = 'CHO_GUI';
const HOAN_DANG = 'DANG_XU_LY';
const HOAN_OK = 'THANH_CONG';
const HOAN_FAIL = 'THAT_BAI';
const HOAN_CHO_XU_LY = 'CHO_XU_LY';
const RETURN_CLOSED_STATUSES = ['Hoàn thành', 'Từ chối', 'Đã hủy'];
const RETURN_DONE_SQL = `dt.TrangThai=N'Hoàn thành'`;
const RETURN_OPEN_SQL = `dt.TrangThai NOT IN (N'Hoàn thành', N'Từ chối', N'Đã hủy')`;
const COLLECT_EXTRA_NOTE_PREFIX = 'Thu chênh đổi hàng';

const isSettledReturn = status => RETURN_DONE_STATUSES.includes(String(status || ''));
const isReturnMoneyPending = status => String(status || '') === RETURN_MONEY_PENDING;
const isReturnMoneyFailed = status => String(status || '') === RETURN_MONEY_FAILED;
const isReturnMoneyWaiting = status => String(status || '') === RETURN_MONEY_WAITING;

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

// Không còn lock “HĐ QR không được hoàn TM”. Allocator (ưu tiên QR) quyết định kênh.
const cashierMayRefundCash = () => true;

const isQrMethod = method => canonicalRefundMethod(method) === 'QR';
const isCashMethod = method => canonicalRefundMethod(method) === 'Tiền mặt';

const paidByMethod = (payments = []) => {
    const successful = (Array.isArray(payments) ? payments : []).filter(row =>
        !row.TrangThai || row.TrangThai === 'Thành công'
    );
    const sumOf = method => roundMoney(successful
        .filter(row => canonicalRefundMethod(row.PhuongThuc) === method)
        .reduce((sum, row) => sum + number(row.SoTien), 0));
    return { TM: sumOf('Tiền mặt'), QR: sumOf('QR') };
};

const refundedByMethod = (refundLines = [], legacyTickets = []) => {
    const ok = (Array.isArray(refundLines) ? refundLines : []).filter(row =>
        String(row.TrangThaiHoan || '').toUpperCase() === HOAN_OK
    );
    const ticketsWithOkLine = new Set(ok.map(row => row.MaPhieuTra || row.MaDT).filter(Boolean));
    const sumLines = method => roundMoney(ok
        .filter(row => canonicalRefundMethod(row.PhuongThuc) === method)
        .reduce((sum, row) => sum + number(row.SoTienHoan ?? row.SoTien), 0));
    let TM = sumLines('Tiền mặt');
    let QR = sumLines('QR');
    for (const ticket of (Array.isArray(legacyTickets) ? legacyTickets : [])) {
        if (String(ticket.TrangThai || '') !== 'Hoàn thành') continue;
        if (ticketsWithOkLine.has(ticket.MaDT)) continue;
        const method = canonicalRefundMethod(ticket.PhuongThucHoan);
        const amount = roundMoney(ticket.SoTienHoan);
        if (method === 'QR') QR = roundMoney(QR + amount);
        if (method === 'Tiền mặt') TM = roundMoney(TM + amount);
    }
    return { TM, QR };
};

const remainingByMethod = (paid = {}, refunded = {}) => ({
    TM: roundMoney(Math.max(0, number(paid.TM) - number(refunded.TM))),
    QR: roundMoney(Math.max(0, number(paid.QR) - number(refunded.QR)))
});

/**
 * Phân bổ số tiền cần hoàn: ưu tiên QR trước, phần vượt sang tiền mặt.
 *
 * Đây là CHÍNH SÁCH NGHIỆP VỤ Supermarket Fly (bảo vệ quỹ tiền mặt của ca,
 * giảm thiếu TM khi hoàn), KHÔNG phải quy tắc kế toán bắt buộc. Sổ cái vẫn
 * ghi đúng nguồn: Có 112 cho phần hoàn QR, Có 111 cho phần hoàn TM.
 *
 * Công thức:
 *   QR_con / TM_con = đã thu − đã hoàn (từng PT)
 *   Hoan_QR = min(need, QR_con)
 *   Hoan_TM = min(need − Hoan_QR, TM_con)
 * Không hoàn quá số đã thu từng phương thức. Không gán PT theo món hàng.
 *
 * PhieuDoiTra.TrangThai chỉ là trạng thái TỔNG HỢP; mỗi dòng GiaoDichHoan
 * có trạng thái RIÊNG — UI/sổ/ca phải theo DÒNG.
 */
const allocateRefund = (need, remaining = {}) => {
    const want = roundMoney(need);
    const qrCon = roundMoney(Math.max(0, remaining.QR ?? remaining.qrRemaining ?? 0));
    const tmCon = roundMoney(Math.max(0, remaining.TM ?? remaining.cashRemaining ?? 0));
    const cap = roundMoney(qrCon + tmCon);
    if (want <= 0) {
        return {
            ok: true, need: 0, hoanQr: 0, hoanTm: 0, exceedsCap: false,
            qrRemainingAfter: qrCon, cashRemainingAfter: tmCon, cap
        };
    }
    if (want > cap + MONEY_TOLERANCE) {
        return {
            ok: false, need: want, hoanQr: 0, hoanTm: 0, exceedsCap: true,
            reason: 'exceeds_cap', qrRemainingAfter: qrCon, cashRemainingAfter: tmCon, cap
        };
    }
    const hoanQr = roundMoney(Math.min(want, qrCon));
    const hoanTm = roundMoney(Math.min(roundMoney(want - hoanQr), tmCon));
    return {
        ok: true,
        need: want,
        hoanQr,
        hoanTm,
        exceedsCap: false,
        qrRemainingAfter: roundMoney(qrCon - hoanQr),
        cashRemainingAfter: roundMoney(tmCon - hoanTm),
        cap
    };
};

const previewRefundAllocation = ({
    need, payments = [], refundLines = [], legacyTickets = []
} = {}) => {
    const paid = paidByMethod(payments);
    const refunded = refundedByMethod(refundLines, legacyTickets);
    const remaining = remainingByMethod(paid, refunded);
    return { paid, refunded, remaining, allocation: allocateRefund(need, remaining) };
};

/**
 * PhieuDoiTra.TrangThai = tổng hợp. Mỗi dòng GiaoDichHoan có trạng thái riêng
 * (vd. QR DANG_XU_LY + TM THANH_CONG). UI/sổ/ca theo DÒNG, không giả định 1 status tiền.
 */
const summarizeRefundTicketStatus = (lines = []) => {
    const statuses = (Array.isArray(lines) ? lines : []).map(row =>
        String(row.TrangThaiHoan || '').toUpperCase()
    );
    if (!statuses.length) return null;
    if (statuses.some(status => status === HOAN_DANG || status === HOAN_CHO_GUI)) return RETURN_MONEY_PENDING;
    if (statuses.some(status => status === HOAN_CHO_XU_LY)) return RETURN_MONEY_WAITING;
    if (statuses.some(status => status === HOAN_FAIL)) return RETURN_MONEY_FAILED;
    if (statuses.every(status => status === HOAN_OK)) return 'Hoàn thành';
    return RETURN_MONEY_PENDING;
};

const collectExtraNote = maDT => `${COLLECT_EXTRA_NOTE_PREFIX} ${String(maDT || '').trim()}`;
const isCollectExtraPayment = row => String(row?.GhiChu || '').startsWith(COLLECT_EXTRA_NOTE_PREFIX);

const cashRefundExceedsDrawer = (soTienHoan, tienMatTrongKet) =>
    roundMoney(soTienHoan) > 0 && roundMoney(soTienHoan) > roundMoney(tienMatTrongKet);

// Chặn cứng: két vật lý không âm. expectedDrawerCash âm cũng không được dùng để vẫn hoàn TM.
const cashRefundBlockedByDrawer = (soTienHoan, tienMatTrongKet) =>
    cashRefundExceedsDrawer(soTienHoan, tienMatTrongKet) || roundMoney(tienMatTrongKet) < 0;

const formatVndPlain = value => `${roundMoney(value).toLocaleString('vi-VN')} đ`;

const cashRefundDrawerShort = ({ soTienHoan, tienMatTrongKet } = {}) => {
    const need = roundMoney(soTienHoan);
    const avail = roundMoney(tienMatTrongKet);
    const short = roundMoney(Math.max(0, need - Math.max(0, avail)));
    return { need, avail, short, blocked: cashRefundBlockedByDrawer(need, avail) };
};

const cashRefundDrawerBlock = ({ soTienHoan, tienMatTrongKet } = {}) => {
    const { need, avail, short, blocked } = cashRefundDrawerShort({ soTienHoan, tienMatTrongKet });
    if (!blocked) return '';
    return `Không đủ tiền mặt để hoàn. Cần ${formatVndPlain(need)} / khả dụng ${formatVndPlain(avail)} / thiếu ${formatVndPlain(short)}.`;
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

// ── Hủy thanh toán (mục 2 + 14) — KHÔNG phải trả hàng ──────────────────────
// Tình huống: HĐ nháp đã thu một phần (vd. TM 300k Thành công + QR 700k Chờ),
// khách thôi mua. Khác trả hàng sau Hoàn thành: không PhieuDoiTra, không GiaoDichHoan.
//
// Bắt buộc query QR lần cuối rồi mới quyết định (caller làm query, hàm này chỉ đọc state sau query).
//
// Nhánh A — QR chưa thành công: hủy HĐ, void TM đã thu, fail QR pending.
//   Ca/két: getShiftSummary chỉ cộng ThanhToan TM Thành công trên HĐ Hoàn thành.
//   Hủy HĐ → 300k không vào TongTienMat. Void dòng TM → Đã hủy để không ai
//   cộng nhầm nếu sau này bỏ lọc TrangThai HĐ. Không phiếu chi / không hoàn trả hàng.
//   Vật lý: thu ngân đưa lại khách số TM đã nhận (két vật lý −300, đối với +300 lúc thu).
// Nhánh B — query thấy đã đủ tiền: không hủy; complete HĐ; hướng Trả hàng – Hoàn tiền.
const ABORT_CHECKOUT_VOID_NOTE = 'Hủy thanh toán — đã trả lại khách (không phải phiếu trả / GiaoDichHoan)';

const cashToReturnFromPayments = (payments = []) => roundMoney(
    (Array.isArray(payments) ? payments : [])
        .filter(row => isCashMethod(row.PhuongThuc) && String(row.TrangThai || '') === 'Thành công')
        .reduce((sum, row) => sum + number(row.SoTien), 0)
);

const decideAbortCheckout = ({
    invoiceStatus,
    tongThanhToan = 0,
    paidSuccess = 0,
    pendingCount = 0,
    paidQrSuccess = 0
} = {}) => {
    const status = String(invoiceStatus || '');
    const total = roundMoney(tongThanhToan);
    const paid = roundMoney(paidSuccess);
    const pending = Number(pendingCount || 0);
    const paidQr = roundMoney(paidQrSuccess);

    if (status === 'Hoàn thành') {
        return {
            branch: 'B',
            cancelled: false,
            completeInvoice: false,
            alreadyCompleted: true,
            mustReturn: true,
            voidSuccessfulPayments: false,
            failPendingQr: false,
            cancelInvoice: false
        };
    }
    if (status === 'Đã hủy') {
        return {
            branch: 'A',
            cancelled: true,
            alreadyCancelled: true,
            completeInvoice: false,
            mustReturn: false,
            voidSuccessfulPayments: false,
            failPendingQr: false,
            cancelInvoice: false
        };
    }
    if (status !== 'Nháp') {
        return { branch: null, error: 'not_draft', cancelled: false };
    }
    if (pending === 0 && total > 0 && paid + MONEY_TOLERANCE >= total) {
        return {
            branch: 'B',
            cancelled: false,
            completeInvoice: true,
            alreadyCompleted: false,
            mustReturn: true,
            voidSuccessfulPayments: false,
            failPendingQr: false,
            cancelInvoice: false
        };
    }
    if (paidQr > MONEY_TOLERANCE) {
        return { branch: null, error: 'successful_qr_blocks_abort', cancelled: false };
    }
    return {
        branch: 'A',
        cancelled: true,
        completeInvoice: false,
        alreadyCompleted: false,
        mustReturn: false,
        voidSuccessfulPayments: true,
        failPendingQr: true,
        cancelInvoice: true
    };
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
    RETURN_MONEY_WAITING,
    HOAN_CHO_GUI,
    HOAN_DANG,
    HOAN_OK,
    HOAN_FAIL,
    HOAN_CHO_XU_LY,
    RETURN_CLOSED_STATUSES,
    RETURN_DONE_SQL,
    RETURN_OPEN_SQL,
    COLLECT_EXTRA_NOTE_PREFIX,
    isSettledReturn,
    isReturnMoneyPending,
    isReturnMoneyFailed,
    isReturnMoneyWaiting,
    canonicalRefundMethod,
    originalInvoicePayMethod,
    defaultRefundMethod,
    cashierMayRefundCash,
    isQrMethod,
    isCashMethod,
    paidByMethod,
    refundedByMethod,
    remainingByMethod,
    allocateRefund,
    previewRefundAllocation,
    summarizeRefundTicketStatus,
    collectExtraNote,
    isCollectExtraPayment,
    cashRefundExceedsDrawer,
    cashRefundBlockedByDrawer,
    cashRefundDrawerShort,
    cashRefundDrawerBlock,
    cashRefundDrawerWarning,
    refundableQrRemaining,
    qrRefundWouldExceedCap,
    zpTransIdOf,
    nextRefundSendAction,
    ABORT_CHECKOUT_VOID_NOTE,
    cashToReturnFromPayments,
    decideAbortCheckout,
    cashHandoverExcludingOpening,
    calculateGrossProfit,
    evaluateThreeWayMatch
};
