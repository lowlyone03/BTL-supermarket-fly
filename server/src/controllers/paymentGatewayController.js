const {
    createQrPayment,
    handleIpn,
    getPaymentStatus,
    queryOrResolve,
    ipnRetry
} = require('../services/paymentGatewayService');

const clean = (value, max = 40) => String(value ?? '').trim().slice(0, max);

const createQr = async (req, res) => {
    try {
        const result = await createQrPayment({
            maHD: clean(req.params.id, 20),
            soTien: req.body?.SoTien,
            user: req.user,
            req
        });
        res.status(result.httpStatus).json(result.body);
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message });
    }
};

const paymentStatus = async (req, res) => {
    try {
        const data = await getPaymentStatus({
            maHD: clean(req.params.id, 20),
            maTT: clean(req.params.maTT, 20),
            maNV: req.user.MaNV
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message });
    }
};

const queryPayment = async (req, res) => {
    try {
        const data = await queryOrResolve({
            maHD: clean(req.params.id, 20),
            maTT: clean(req.params.maTT, 20),
            user: req.user,
            req,
            failIfFinal: false
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message });
    }
};

const resolvePayment = async (req, res) => {
    try {
        const data = await queryOrResolve({
            maHD: clean(req.params.id, 20),
            maTT: clean(req.params.maTT, 20),
            user: req.user,
            req,
            failIfFinal: true
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message });
    }
};

/**
 * POST /api/payments/gateway/ipn — luôn HTTP 200 + JSON { return_code, return_message }.
 * Không 204 (MoMo). ZaloPay retry khi return_code === 0; các mã khác thì dừng.
 *
 * Case                                              | return_code | return_message | Retry?
 * --------------------------------------------------|-------------|----------------|--------
 * type !== 1 (không phải Order) → ignore            | 1           | ignored        | KHÔNG
 * Idempotent: keep_success / retry_complete / ignore
 *   / transid_conflict / invoice_cancelled          | 1           | success        | KHÔNG
 * first_success / mark_failed / amount_mismatch xong| 1           | success        | KHÔNG
 * MAC/schema sai (thiếu data, JSON, zp_trans_id)    | -1          | mac not equal  | không tin callback
 * Exception / order_not_found (IPN sớm hơn INSERT)  | 0           | ...            | CÓ (~3 lần)
 *
 * CẤM trả 0 cho ignore/idempotent — ZaloPay sẽ callback lại không cần thiết.
 */
const ipn = async (req, res) => {
    try {
        const result = await handleIpn(req.body || {}, req);
        res.status(200).json(result.merchantReply || { return_code: 1, return_message: 'success' });
    } catch (error) {
        console.error('ZaloPay IPN lỗi nội bộ (return_code 0 để retry):', error.message);
        res.status(200).json(ipnRetry(error.message || 'IPN chưa xử lý xong.'));
    }
};

const returnUrl = (req, res) => {
    const q = req.query || {};
    console.log(`  ·  ZaloPay return  ${q.apptransid || '—'}  status ${q.status ?? '—'}  ${q.amount || '—'}đ`);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send('<!doctype html><html lang="vi"><body><p>Có thể đóng cửa sổ / quay lại quầy.</p></body></html>');
};

module.exports = {
    createQr, paymentStatus, queryPayment, resolvePayment, ipn, returnUrl
};
