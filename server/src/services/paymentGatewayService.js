const crypto = require('node:crypto');
const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('./auditLog');
const zalopay = require('./providers/zalopay');

const PENDING_QR_CASH_MESSAGE = 'Hóa đơn còn thanh toán ZaloPay đang chờ xác nhận. Hãy Query hoặc resolve trước khi thu Tiền mặt.';
const PENDING_MOMO_CASH_MESSAGE = PENDING_QR_CASH_MESSAGE;
const QR_MANUAL_MESSAGE = 'P1 không thu QR thủ công. Dùng nút ZaloPay hoặc Tiền mặt sau khi ZaloPay đã Thất bại / hết hạn.';
const WAITING_STATUS = 'Chờ xác nhận';
const MIN_QR = 1000;
const MAX_QR = 50000000;
const MIN_MOMO = MIN_QR;
const MAX_MOMO = MAX_QR;
const GATEWAY_ACTOR = 'zalopay-gateway';

const actorForNv = async (connection, maNV) => {
    const result = await new sql.Request(connection)
        .input('MaNV', sql.VarChar, maNV)
        .query('SELECT TOP 1 MaTK, TenDangNhap FROM TaiKhoan WHERE MaNV=@MaNV');
    const row = result.recordset[0] || {};
    return {
        MaNV: maNV,
        MaTK: row.MaTK,
        TenDangNhap: row.TenDangNhap || GATEWAY_ACTOR
    };
};

/** Callback ZaloPay: luôn HTTP 200 + JSON.
 *  return_code 1 = dừng retry (success, type!==1 ignore, idempotent).
 *  return_code -1 = MAC/schema sai.
 *  return_code 0 = lỗi nội bộ / chưa map được đơn → ZaloPay retry. */
const ipnAck = (message = 'success') => ({ return_code: 1, return_message: message });
const ipnIgnored = () => ({ return_code: 1, return_message: 'ignored' });
const ipnIdempotent = () => ({ return_code: 1, return_message: 'success' });
const ipnBadMac = () => ({ return_code: -1, return_message: 'mac not equal' });
const ipnRetry = (message = 'internal error') => ({ return_code: 0, return_message: String(message || 'internal error').slice(0, 200) });

const gatewayError = (message, status = 400, extra = {}) => {
    const error = new Error(message);
    error.status = status;
    Object.assign(error, extra);
    return error;
};

const compareVnd = (left, right) => Math.round(Number(left)) === Math.round(Number(right));

const remainingOf = (tongThanhToan, daThanhCong) => (
    Math.round(Number(tongThanhToan || 0)) - Math.round(Number(daThanhCong || 0))
);

const shouldRetryComplete = ({ invoiceStatus, paid, total, pendingCount }) => (
    invoiceStatus === 'Nháp'
    && Number(pendingCount || 0) === 0
    && compareVnd(paid, total)
);

const decideCancelledInvoiceAction = ({ invoiceStatus, paymentStatus } = {}) => {
    if (invoiceStatus !== 'Đã hủy') return null;
    return paymentStatus === WAITING_STATUS ? 'fail_pending' : 'ignore';
};

const decideGatewayAction = ({
    paymentStatus,
    paymentAmount,
    paymentTransId,
    classification,
    ipnAmount,
    ipnTransId
}) => {
    if (classification === 'authorized' || classification === 'pending') return 'keep_pending';
    if (classification === 'success' && !compareVnd(ipnAmount, paymentAmount)) return 'amount_mismatch_fail';
    if (classification === 'failure') {
        return paymentStatus === 'Thành công' ? 'keep_success' : 'mark_failed';
    }
    if (paymentStatus === 'Thành công') {
        return String(paymentTransId || '') === String(ipnTransId || '') ? 'retry_complete' : 'transid_conflict';
    }
    if (paymentStatus === WAITING_STATUS) return 'first_success';
    return 'ignore';
};

const assertAddPaymentAllowed = (pending, { status, method } = {}) => {
    if (status === WAITING_STATUS) {
        throw gatewayError('Chờ xác nhận chỉ được tạo từ cổng thanh toán ZaloPay.', 400);
    }
    if (pending) {
        throw gatewayError(PENDING_QR_CASH_MESSAGE, 409);
    }
    if (method === 'QR') {
        throw gatewayError(QR_MANUAL_MESSAGE, 409);
    }
    if (method === 'Thẻ' || method === 'Chuyển khoản') {
        throw gatewayError('P1 chỉ thu Tiền mặt hoặc ZaloPay.', 400);
    }
};

const randomHex = (bytes = 4) => crypto.randomBytes(bytes).toString('hex');

const getProvider = (name) => {
    const key = String(name || process.env.PAYMENT_PROVIDER || 'zalopay').trim().toLowerCase();
    if (key === 'zalopay') return require('./providers/zalopay');
    if (key === 'momo') return require('./providers/momo');
    if (key === 'vnpay') return require('./providers/vnpay');
    if (key === 'payos') return require('./providers/payos');
    if (key === 'momo_simulator') {
        throw gatewayError('Payment Simulator chưa bật. Đặt PAYMENT_PROVIDER=zalopay.', 400, { clearFailure: true });
    }
    throw gatewayError('Provider chưa bật', 400, { clearFailure: true });
};

const findPendingQr = async (connection, maHD) => {
    const result = await new sql.Request(connection).input('MaHD', sql.VarChar, maHD).query(`
        SELECT TOP 1 MaTT, SoTien, TrangThai, NguonXacNhan, MaThamChieuCong, MaGiaoDich, GhiChu
        FROM ThanhToan WITH (UPDLOCK, HOLDLOCK)
        WHERE MaHD=@MaHD AND PhuongThuc=N'QR' AND TrangThai=N'Chờ xác nhận'`);
    return result.recordset[0] || null;
};

const findPendingMomoQr = findPendingQr;

const vietnamYymmdd = () => {
    const iso = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    return iso.slice(2).replaceAll('-', '');
};

const buildAppTransId = (maTT) => `${vietnamYymmdd()}_${maTT}${randomHex(4)}`.slice(0, 40);

const loadPaymentOnInvoice = async (connection, maHD, maTT) => {
    const result = await new sql.Request(connection)
        .input('MaHD', sql.VarChar, maHD)
        .input('MaTT', sql.VarChar, maTT)
        .query(`
            SELECT tt.*, hd.TongThanhToan, hd.TrangThai HoaDonTrangThai, hd.MaNV, hd.MaCa, hd.MaKH, hd.MaKho
            FROM ThanhToan tt WITH (UPDLOCK, HOLDLOCK)
            JOIN HoaDon hd WITH (UPDLOCK, HOLDLOCK) ON hd.MaHD=tt.MaHD
            WHERE tt.MaHD=@MaHD AND tt.MaTT=@MaTT`);
    return result.recordset[0] || null;
};

const paymentTotals = async (connection, maHD) => {
    const result = await new sql.Request(connection).input('MaHD', sql.VarChar, maHD).query(`
        SELECT COALESCE(SUM(CASE WHEN TrangThai=N'Thành công' THEN SoTien ELSE 0 END),0) DaThanhToan,
               SUM(CASE WHEN TrangThai=N'Chờ xác nhận' THEN 1 ELSE 0 END) DangCho
        FROM ThanhToan WITH (UPDLOCK, HOLDLOCK) WHERE MaHD=@MaHD`);
    return {
        paid: Number(result.recordset[0].DaThanhToan || 0),
        pendingCount: Number(result.recordset[0].DangCho || 0)
    };
};

const requestIdFromNote = (ghiChu) => {
    const match = String(ghiChu || '').match(/req:([0-9A-Za-z._-]+)/);
    return match ? match[1] : '';
};

const toQrDataUrl = async (text) => {
    if (!text) return '';
    const QRCode = require('qrcode');
    return QRCode.toDataURL(String(text), { width: 280, margin: 1, errorCorrectionLevel: 'M' });
};

const emptyQrImages = () => ({
    qrPayload: '',
    qrImageDataUrl: '',
    qrCodeUrl: '',
    payUrl: '',
    payUrlQrImageDataUrl: ''
});

const buildQrImages = async (created) => {
    const chosen = zalopay.chooseQrPayload({
        qrCode: created.qrCodeUrl || created.deeplink,
        qrCodeUrl: created.qrCodeUrl || created.deeplink,
        orderUrl: created.payUrl,
        payUrl: created.payUrl
    });
    const qrImageDataUrl = chosen.qrPayload ? await toQrDataUrl(chosen.qrPayload) : '';
    const payUrlQrImageDataUrl = chosen.secondaryPayload ? await toQrDataUrl(chosen.secondaryPayload) : '';
    return {
        qrPayload: chosen.qrPayload,
        qrImageDataUrl,
        qrCodeUrl: created.qrCodeUrl || '',
        payUrl: created.payUrl || '',
        payUrlQrImageDataUrl
    };
};

const qrImagesFromPaymentRow = async (row = {}) => {
    const created = {
        qrCodeUrl: String(row.QrCodeUrl || row.qrCodeUrl || '').trim(),
        payUrl: String(row.PayUrl || row.payUrl || '').trim(),
        deeplink: String(row.QrCodeUrl || row.qrCodeUrl || '').trim()
    };
    if (!created.qrCodeUrl && !created.payUrl) return emptyQrImages();
    try {
        return await buildQrImages(created);
    } catch (error) {
        console.error('Không vẽ được QR image:', error.message);
        return {
            qrPayload: created.qrCodeUrl || created.payUrl,
            qrImageDataUrl: '',
            qrCodeUrl: created.qrCodeUrl,
            payUrl: created.payUrl,
            payUrlQrImageDataUrl: ''
        };
    }
};

let qrLinkColumnsReady = false;
const ensureQrLinkColumns = async (connection) => {
    if (qrLinkColumnsReady) return;
    await new sql.Request(connection).query(`
        IF COL_LENGTH(N'dbo.ThanhToan', N'PayUrl') IS NULL
            ALTER TABLE dbo.ThanhToan ADD PayUrl NVARCHAR(1000) NULL;
        IF COL_LENGTH(N'dbo.ThanhToan', N'QrCodeUrl') IS NULL
            ALTER TABLE dbo.ThanhToan ADD QrCodeUrl NVARCHAR(1000) NULL;`);
    qrLinkColumnsReady = true;
};

const saveGatewayQrLinks = async (connection, maTT, { payUrl, qrCodeUrl } = {}) => {
    await ensureQrLinkColumns(connection);
    await new sql.Request(connection)
        .input('MaTT', sql.VarChar, maTT)
        .input('PayUrl', sql.NVarChar(1000), String(payUrl || '').slice(0, 1000) || null)
        .input('QrCodeUrl', sql.NVarChar(1000), String(qrCodeUrl || '').slice(0, 1000) || null)
        .query('UPDATE ThanhToan SET PayUrl=@PayUrl, QrCodeUrl=@QrCodeUrl WHERE MaTT=@MaTT');
};

const failPendingPaymentsForInvoice = async (connection, maHD, note) => {
    const result = await new sql.Request(connection)
        .input('MaHD', sql.VarChar, maHD)
        .input('GhiChu', sql.NVarChar, String(note || 'Hủy nháp hóa đơn — không ghi sổ').slice(0, 200))
        .query(`
            UPDATE ThanhToan
            SET TrangThai=N'Thất bại', NgayXacNhan=GETDATE(), GhiChu=@GhiChu
            OUTPUT DELETED.MaTT
            WHERE MaHD=@MaHD AND TrangThai=N'Chờ xác nhận'`);
    return result.recordset.length;
};

const markPaymentFailed = async (connection, maTT, note) => {
    await new sql.Request(connection)
        .input('MaTT', sql.VarChar, maTT)
        .input('GhiChu', sql.NVarChar, String(note || 'ZaloPay thất bại').slice(0, 200))
        .query(`
            UPDATE ThanhToan
            SET TrangThai=N'Thất bại', NgayXacNhan=GETDATE(), GhiChu=@GhiChu
            WHERE MaTT=@MaTT AND TrangThai=N'Chờ xác nhận'`);
};

const executeCreateAfterCommit = async ({ insertAndCommit, createOnProvider, onClearFail }) => {
    const row = await insertAndCommit();
    try {
        return { row, created: await createOnProvider(row) };
    } catch (error) {
        error.insertedRow = row;
        if (error.clearFailure) await onClearFail(row, error);
        throw error;
    }
};

const createQrPayment = async ({ maHD, soTien, user, req, provider }) => {
    const sales = require('../controllers/salesController');
    const prov = provider || getProvider();
    let inserted;

    const insertAndCommit = async () => {
        const transaction = new sql.Transaction(await poolPromise);
        try {
            await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
            await sales.getActiveShift(transaction, user.MaNV, true);
            const invoice = await new sql.Request(transaction)
                .input('MaHD', sql.VarChar, maHD)
                .input('MaNV', sql.VarChar, user.MaNV)
                .query(`
                    SELECT hd.MaHD, hd.TongThanhToan FROM HoaDon hd WITH (UPDLOCK, HOLDLOCK)
                    JOIN CaLamViec ca ON ca.MaCa=hd.MaCa
                    WHERE hd.MaHD=@MaHD AND hd.MaNV=@MaNV AND hd.TrangThai=N'Nháp' AND ca.TrangThai=N'Đang mở'`);
            if (!invoice.recordset.length) throw gatewayError('Hóa đơn không còn khả dụng để thanh toán.', 400);
            const pending = await findPendingQr(transaction, maHD);
            if (pending) {
                throw gatewayError('Đã có thanh toán QR đang chờ. Hãy Query/resolve trước khi tạo mã mới.', 409);
            }
            const totals = await paymentTotals(transaction, maHD);
            const remaining = remainingOf(invoice.recordset[0].TongThanhToan, totals.paid);
            if (remaining < MIN_QR) {
                throw gatewayError('ZaloPay tối thiểu 1.000đ — dùng Tiền mặt.', 400);
            }
            const requested = soTien == null || soTien === '' ? remaining : Math.round(Number(soTien));
            if (!Number.isFinite(requested) || requested <= 0) throw gatewayError('Số tiền ZaloPay không hợp lệ.', 400);
            const amount = Math.min(requested, remaining);
            if (amount < MIN_QR) throw gatewayError('ZaloPay tối thiểu 1.000đ — dùng Tiền mặt.', 400);
            if (amount > MAX_QR) throw gatewayError('Số tiền ZaloPay vượt hạn mức sandbox.', 400);
            const prefix = `TT${new Date().toISOString().slice(2, 10).replaceAll('-', '')}`;
            const maTT = await sales.generateId(transaction, 'ThanhToan', 'MaTT', prefix);
            const appTime = Date.now();
            const orderId = buildAppTransId(maTT);
            const requestId = String(appTime);
            await new sql.Request(transaction)
                .input('MaTT', sql.VarChar, maTT)
                .input('MaHD', sql.VarChar, maHD)
                .input('SoTien', sql.Decimal(18, 2), amount)
                .input('MaThamChieuCong', sql.VarChar, orderId)
                .input('GhiChu', sql.NVarChar, `time:${appTime}`.slice(0, 200))
                .query(`
                    INSERT ThanhToan(MaTT,MaHD,PhuongThuc,MaGiaoDich,SoTien,NgayTT,TrangThai,NgayXacNhan,
                        GhiChu,NguonXacNhan,MaThamChieuCong)
                    VALUES(@MaTT,@MaHD,N'QR',NULL,@SoTien,GETDATE(),N'Chờ xác nhận',NULL,
                        @GhiChu,N'ZaloPay',@MaThamChieuCong)`);
            await logAudit(transaction, {
                user, req, action: 'Thu tiền hóa đơn', table: 'HoaDon', recordId: maHD, uc: 'UC25',
                severity: 'Quan trọng',
                content: `Tạo thanh toán gateway ${maTT} provider zalopay ${amount.toLocaleString('vi-VN')}đ. app_trans_id ${orderId}.`
            });
            await transaction.commit();
            return { maTT, orderId, requestId, amount, maHD, appTime };
        } catch (error) {
            if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
            if (String(error.message || '').includes('UX_ThanhToan_MotQrMoMoCho')
                || String(error.message || '').includes('UX_ThanhToan_MotQrCho')) {
                throw gatewayError('Đã có thanh toán QR đang chờ. Hãy Query/resolve trước khi tạo mã mới.', 409);
            }
            throw error;
        }
    };

    const createOnProvider = async (row) => prov.createPayment({
        MaHD: row.maHD,
        MaTT: row.maTT,
        SoTien: row.amount,
        MoTa: `Supermarket Fly ${row.maHD}`,
        returnUrl: process.env.PAYMENT_RETURN_URL,
        ipnUrl: process.env.PAYMENT_IPN_URL,
        orderId: row.orderId,
        requestId: row.requestId,
        appTime: row.appTime
    });

    const onClearFail = async (row, error) => {
        const pool = await poolPromise;
        await markPaymentFailed(pool, row.maTT, error.message || 'ZaloPay create thất bại');
    };

    try {
        const { row, created } = await executeCreateAfterCommit({
            insertAndCommit, createOnProvider, onClearFail
        });
        inserted = row;
        let images = {
            qrPayload: created.qrCodeUrl || created.payUrl || '',
            qrImageDataUrl: '',
            qrCodeUrl: created.qrCodeUrl || '',
            payUrl: created.payUrl || '',
            payUrlQrImageDataUrl: ''
        };
        try {
            images = await buildQrImages(created);
        } catch (error) {
            console.error('Không vẽ được QR image:', error.message);
        }
        try {
            const pool = await poolPromise;
            await saveGatewayQrLinks(pool, row.maTT, {
                payUrl: created.payUrl,
                qrCodeUrl: created.qrCodeUrl || created.deeplink
            });
        } catch (error) {
            console.error('Không lưu PayUrl/QrCodeUrl:', error.message);
        }
        return {
            httpStatus: 201,
            body: {
                MaTT: row.maTT,
                PhuongThuc: 'QR',
                NguonXacNhan: 'ZaloPay',
                TrangThai: WAITING_STATUS,
                SoTien: row.amount,
                MaThamChieuCong: row.orderId,
                provider: 'zalopay',
                expiredAt: null,
                ...images
            }
        };
    } catch (error) {
        inserted = error.insertedRow || inserted;
        if (error.clearFailure) {
            throw gatewayError(
                error.message.includes('ZALOPAY_') || error.message.includes('Provider')
                    ? error.message
                    : 'Không thanh toán được ZaloPay — chuyển Tiền mặt.',
                error.status || 400,
                { clearFailure: true, MaTT: inserted?.maTT || error.MaTT }
            );
        }
        return {
            httpStatus: 503,
            body: {
                MaTT: inserted?.maTT || null,
                PhuongThuc: 'QR',
                NguonXacNhan: 'ZaloPay',
                TrangThai: WAITING_STATUS,
                SoTien: inserted?.amount,
                provider: 'zalopay',
                message: 'Chưa rõ trạng thái ZaloPay. Giữ Chờ — bấm Query lại. Không tạo mã mới.'
            }
        };
    }
};

const completeIfReady = async (transaction, invoice, req, source) => {
    const totals = await paymentTotals(transaction, invoice.MaHD);
    const header = await new sql.Request(transaction).input('MaHD', sql.VarChar, invoice.MaHD)
        .query('SELECT MaHD, MaNV, TongThanhToan, TrangThai FROM HoaDon WITH (UPDLOCK, HOLDLOCK) WHERE MaHD=@MaHD');
    const current = header.recordset[0];
    if (!current) return { skipped: true };
    if (!shouldRetryComplete({
        invoiceStatus: current.TrangThai,
        paid: totals.paid,
        total: current.TongThanhToan,
        pendingCount: totals.pendingCount
    })) {
        return {
            completed: current.TrangThai === 'Hoàn thành',
            alreadyCompleted: current.TrangThai === 'Hoàn thành',
            waiting: totals.pendingCount > 0,
            paid: totals.paid
        };
    }
    const sales = require('../controllers/salesController');
    const result = await sales.completeInvoiceInternal(transaction, {
        maHD: current.MaHD,
        actorMaNV: current.MaNV,
        user: await actorForNv(transaction, current.MaNV),
        req,
        requireOwnerShift: false,
        auditNote: source === 'query' ? 'Query ZaloPay retry completeInvoice' : 'IPN ZaloPay'
    });
    return result;
};

const applyGatewayResult = async (transaction, { payment, verified, req, source = 'IPN' }) => {
    const cancelledAction = decideCancelledInvoiceAction({
        invoiceStatus: payment.HoaDonTrangThai,
        paymentStatus: payment.TrangThai
    });
    if (cancelledAction === 'fail_pending') {
        await markPaymentFailed(transaction, payment.MaTT, 'Hóa đơn đã hủy — IPN/query không ghi sổ');
        return { action: 'invoice_cancelled' };
    }
    if (cancelledAction === 'ignore') {
        return { action: 'invoice_cancelled' };
    }

    const action = decideGatewayAction({
        paymentStatus: payment.TrangThai,
        paymentAmount: payment.SoTien,
        paymentTransId: payment.MaGiaoDich,
        classification: verified.classification,
        ipnAmount: verified.SoTien,
        ipnTransId: verified.MaGiaoDich
    });

    if (action === 'keep_pending' || action === 'ignore' || action === 'keep_success') {
        if (action === 'keep_success' || action === 'keep_pending') {
            const invoice = { MaHD: payment.MaHD, MaNV: payment.MaNV, TongThanhToan: payment.TongThanhToan, TrangThai: payment.HoaDonTrangThai };
            if (action === 'keep_success') return { action, ...(await completeIfReady(transaction, invoice, req, source)) };
        }
        return { action };
    }
    if (action === 'transid_conflict') {
        console.error('ZaloPay transId lệch trên dòng đã Thành công', payment.MaTT, payment.MaGiaoDich, verified.MaGiaoDich);
        return { action };
    }
    if (action === 'amount_mismatch_fail') {
        await markPaymentFailed(transaction, payment.MaTT, 'IPN amount lệch');
        return { action };
    }
    if (action === 'mark_failed') {
        await markPaymentFailed(transaction, payment.MaTT, verified.message || `ZaloPay resultCode ${verified.resultCode}`);
        return { action };
    }

    if (action === 'first_success') {
        try {
            await new sql.Request(transaction)
                .input('MaTT', sql.VarChar, payment.MaTT)
                .input('MaGiaoDich', sql.VarChar, String(verified.MaGiaoDich).slice(0, 50))
                .query(`
                    UPDATE ThanhToan
                    SET TrangThai=N'Thành công', NgayXacNhan=GETDATE(), MaGiaoDich=@MaGiaoDich
                    WHERE MaTT=@MaTT AND TrangThai=N'Chờ xác nhận'`);
            // MaGiaoDich lúc Thành công = zp_trans_id (IPN + Query). Hoàn ZaloPay đọc mã này — không bịa.
        } catch (error) {
            if (String(error.message || '').includes('UX_ThanhToan_MaGiaoDich')) {
                console.error('ZaloPay transId trùng MaGiaoDich', verified.MaGiaoDich);
                return { action: 'transid_unique_conflict' };
            }
            throw error;
        }
        await logAudit(transaction, {
            user: await actorForNv(transaction, payment.MaNV),
            req, action: 'Thu tiền hóa đơn', table: 'HoaDon', recordId: payment.MaHD, uc: 'UC25',
            result: 'Thành công', severity: 'Quan trọng',
            content: `${source} xác nhận MaGD ${verified.MaGiaoDich} cho ${payment.MaTT}.`
        });
    }

    const invoice = {
        MaHD: payment.MaHD,
        MaNV: payment.MaNV,
        TongThanhToan: payment.TongThanhToan,
        TrangThai: payment.HoaDonTrangThai
    };
    const completed = await completeIfReady(transaction, invoice, req, source);
    return { action, ...completed };
};

const ipnReplyForInvalidCallback = (verified) => {
    if (verified.ignore || verified.reason === 'ignored_type') return ipnIgnored();
    return ipnBadMac();
};

const ipnReplyForApplied = (applied) => {
    const action = applied?.action;
    // Idempotent / ignore / HĐ hủy: return_code 1 — ZaloPay không retry.
    if (action === 'keep_success' || action === 'retry_complete' || action === 'ignore'
        || action === 'transid_conflict' || action === 'transid_unique_conflict'
        || action === 'invoice_cancelled') {
        return ipnIdempotent();
    }
    return ipnAck();
};

const handleIpn = async (payload, req) => {
    const prov = getProvider();
    const verified = prov.verifyCallback(payload);
    if (!verified.ok) {
        console.error('ZaloPay IPN bỏ qua:', verified.reason);
        return {
            accepted: true,
            ignored: true,
            reason: verified.reason,
            merchantReply: ipnReplyForInvalidCallback(verified)
        };
    }
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const found = await new sql.Request(transaction)
            .input('OrderId', sql.VarChar, verified.MaThamChieuCong)
            .query(`
                SELECT tt.*, hd.TongThanhToan, hd.TrangThai HoaDonTrangThai, hd.MaNV, hd.MaCa, hd.MaKH, hd.MaKho
                FROM ThanhToan tt WITH (UPDLOCK, HOLDLOCK)
                JOIN HoaDon hd WITH (UPDLOCK, HOLDLOCK) ON hd.MaHD=tt.MaHD
                WHERE tt.MaThamChieuCong=@OrderId`);
        if (!found.recordset.length) {
            await transaction.rollback();
            console.error('ZaloPay IPN không map app_trans_id', verified.MaThamChieuCong);
            return {
                accepted: true,
                ignored: true,
                reason: 'order_not_found',
                merchantReply: ipnRetry('order_not_found')
            };
        }
        const payment = found.recordset[0];
        const applied = await applyGatewayResult(transaction, {
            payment,
            verified: { ...verified, message: payload.message, resultCode: verified.resultCode },
            req,
            source: 'IPN'
        });
        await transaction.commit();
        return { accepted: true, ...applied, merchantReply: ipnReplyForApplied(applied) };
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        throw error;
    }
};

const getPaymentStatus = async ({ maHD, maTT, maNV }) => {
    const pool = await poolPromise;
    await ensureQrLinkColumns(pool);
    const row = await new sql.Request(pool)
        .input('MaHD', sql.VarChar, maHD)
        .input('MaTT', sql.VarChar, maTT)
        .input('MaNV', sql.VarChar, maNV)
        .query(`
            SELECT tt.MaTT, tt.TrangThai, tt.MaGiaoDich, tt.NguonXacNhan, tt.SoTien, tt.PhuongThuc,
                   tt.PayUrl, tt.QrCodeUrl, hd.TrangThai HoaDonTrangThai
            FROM ThanhToan tt
            JOIN HoaDon hd ON hd.MaHD=tt.MaHD
            WHERE tt.MaHD=@MaHD AND tt.MaTT=@MaTT AND hd.MaNV=@MaNV`);
    if (!row.recordset.length) throw gatewayError('Không tìm thấy dòng thanh toán.', 404);
    const item = row.recordset[0];
    const images = item.TrangThai === WAITING_STATUS
        ? await qrImagesFromPaymentRow(item)
        : {
            ...emptyQrImages(),
            qrCodeUrl: String(item.QrCodeUrl || ''),
            payUrl: String(item.PayUrl || '')
        };
    return {
        ...item,
        alreadyCompleted: item.HoaDonTrangThai === 'Hoàn thành',
        ...images
    };
};

const queryOrResolve = async ({ maHD, maTT, user, req, failIfFinal = false, provider }) => {
    const sales = require('../controllers/salesController');
    const prov = provider || getProvider();
    const pool = await poolPromise;
    await sales.getActiveShift(pool, user.MaNV, false);
    const snapshot = await new sql.Request(pool)
        .input('MaHD', sql.VarChar, maHD)
        .input('MaTT', sql.VarChar, maTT)
        .input('MaNV', sql.VarChar, user.MaNV)
        .query(`
            SELECT tt.*, hd.TongThanhToan, hd.TrangThai HoaDonTrangThai, hd.MaNV, hd.MaCa, hd.MaKH, hd.MaKho
            FROM ThanhToan tt
            JOIN HoaDon hd ON hd.MaHD=tt.MaHD
            WHERE tt.MaHD=@MaHD AND tt.MaTT=@MaTT AND hd.MaNV=@MaNV`);
    if (!snapshot.recordset.length) throw gatewayError('Không tìm thấy dòng thanh toán.', 404);
    const current = snapshot.recordset[0];
    if (current.PhuongThuc !== 'QR') {
        throw gatewayError('Dòng này không phải thanh toán QR cổng.', 400);
    }
    if (current.NguonXacNhan && current.NguonXacNhan !== 'ZaloPay') {
        throw gatewayError(
            'Dòng QR không phải ZaloPay. Cổng MoMo đã tắt — không Query/tạo mã mới trên dòng này (4.13).',
            400
        );
    }
    if (current.HoaDonTrangThai === 'Đã hủy') {
        if (current.TrangThai === WAITING_STATUS) {
            const clearTxn = new sql.Transaction(pool);
            try {
                await clearTxn.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
                await markPaymentFailed(clearTxn, maTT, 'Hóa đơn đã hủy — query không ghi sổ');
                await clearTxn.commit();
            } catch (error) {
                if (clearTxn._aborted !== true) await clearTxn.rollback().catch(() => {});
                throw error;
            }
            return { TrangThai: 'Thất bại', MaTT: maTT, invoiceCancelled: true };
        }
        return { TrangThai: current.TrangThai, MaTT: maTT, invoiceCancelled: true };
    }

    let queried = null;
    if (current.TrangThai === WAITING_STATUS) {
        try {
            queried = await prov.queryPayment(current.MaThamChieuCong);
        } catch (error) {
            if (failIfFinal) {
                throw gatewayError('Chưa xác minh được ZaloPay. Giữ Chờ — Query lại. Không đánh Thất bại. Không tạo mã mới.', 409);
            }
            throw gatewayError(error.message || 'Không query được ZaloPay. Giữ Chờ.', error.status || 503);
        }
        if (queried.classification === 'success' && (queried.transId === undefined || queried.transId === null)) {
            throw gatewayError('Query ZaloPay thiếu zp_trans_id. Giữ Chờ.', 409);
        }
        if (failIfFinal && (queried.classification === 'pending' || queried.classification === 'authorized')) {
            throw gatewayError('ZaloPay vẫn đang chờ. Giữ Chờ — Query lại. Không đánh Thất bại. Không tạo mã mới.', 409);
        }
    }

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        await sales.getActiveShift(transaction, user.MaNV, true);
        const payment = await loadPaymentOnInvoice(transaction, maHD, maTT);
        if (!payment || payment.MaNV !== user.MaNV) throw gatewayError('Không tìm thấy dòng thanh toán.', 404);
        if (payment.TrangThai === 'Thành công' || !queried) {
            const completed = await completeIfReady(transaction, payment, req, 'query');
            await transaction.commit();
            return { TrangThai: payment.TrangThai, MaTT: maTT, ...completed };
        }
        if (payment.TrangThai !== WAITING_STATUS) {
            await transaction.rollback();
            return { TrangThai: payment.TrangThai, MaTT: maTT };
        }
        const applied = await applyGatewayResult(transaction, {
            payment,
            verified: {
                classification: queried.classification,
                SoTien: queried.amount,
                MaGiaoDich: queried.transId,
                resultCode: queried.resultCode,
                message: queried.message
            },
            req,
            source: 'query'
        });
        await transaction.commit();
        const status = applied.action === 'mark_failed' || applied.action === 'amount_mismatch_fail'
            ? 'Thất bại'
            : applied.action === 'first_success' || applied.action === 'retry_complete' || applied.action === 'keep_success'
                ? 'Thành công'
                : WAITING_STATUS;
        return { MaTT: maTT, TrangThai: status, ...applied };
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        throw error;
    }
};

module.exports = {
    PENDING_MOMO_CASH_MESSAGE,
    PENDING_QR_CASH_MESSAGE,
    QR_MANUAL_MESSAGE,
    compareVnd,
    remainingOf,
    shouldRetryComplete,
    decideGatewayAction,
    decideCancelledInvoiceAction,
    assertAddPaymentAllowed,
    findPendingQr,
    findPendingMomoQr,
    failPendingPaymentsForInvoice,
    getProvider,
    executeCreateAfterCommit,
    createQrPayment,
    handleIpn,
    getPaymentStatus,
    queryOrResolve,
    applyGatewayResult,
    paymentTotals,
    qrImagesFromPaymentRow,
    buildQrImages,
    buildAppTransId,
    ipnAck,
    ipnIgnored,
    ipnIdempotent,
    ipnBadMac,
    ipnRetry,
    ipnReplyForInvalidCallback,
    ipnReplyForApplied
};
