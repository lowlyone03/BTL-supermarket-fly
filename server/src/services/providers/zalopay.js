const crypto = require('node:crypto');

const DEFAULT_CREATE_URL = 'https://sb-openapi.zalopay.vn/v2/create';
const DEFAULT_QUERY_URL = 'https://sb-openapi.zalopay.vn/v2/query';
const DEFAULT_REFUND_URL = 'https://sb-openapi.zalopay.vn/v2/refund';
const DEFAULT_QUERY_REFUND_URL = 'https://sb-openapi.zalopay.vn/v2/query_refund';
const TIMEOUT_MS = 30000;
const PRODUCTION_HOST = /^https:\/\/openapi\.zalopay\.vn/i;
const ORDER_TYPE = 1;

class ZalopayProviderError extends Error {
    constructor(message, { clearFailure = false, resultCode = null, status = 400 } = {}) {
        super(message);
        this.name = 'ZalopayProviderError';
        this.clearFailure = clearFailure;
        this.resultCode = resultCode;
        this.status = status;
    }
}

const hmacSha256Hex = (secret, raw) => crypto.createHmac('sha256', secret).update(String(raw), 'utf8').digest('hex');

const timingSafeEqualHex = (left, right) => {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

const rawCreate = ({ appId, appTransId, appUser, amount, appTime, embedData, item }) => (
    `${appId}|${appTransId}|${appUser}|${amount}|${appTime}|${embedData}|${item}`
);

const rawQuery = ({ appId, appTransId, key1 }) => `${appId}|${appTransId}|${key1}`;

// Refund HMAC (docs.zalopay.vn): app_id|zp_trans_id|amount|description|timestamp — key1, không fee.
const rawRefund = ({ appId, zpTransId, amount, description, timestamp }) => (
    `${appId}|${zpTransId}|${amount}|${description}|${timestamp}`
);

const rawQueryRefund = ({ appId, mRefundId, timestamp }) => `${appId}|${mRefundId}|${timestamp}`;

const classifyQueryCode = (code) => {
    const value = Number(code);
    if (value === 1) return 'success';
    if (value === 2) return 'failure';
    if (value === 3) return 'pending';
    return 'pending';
};

const parseReturnCode = (data) => {
    if (!data || typeof data !== 'object' || data.return_code === undefined || data.return_code === null || data.return_code === '') {
        return { ok: false, code: null };
    }
    const code = Number(data.return_code);
    if (!Number.isFinite(code)) return { ok: false, code: null };
    return { ok: true, code };
};

/**
 * 4.7b — uncertain ≠ failure.
 * clearFailure chỉ khi config local sai HOẶC ZaloPay xác nhận request bị từ chối cuối cùng.
 * HTTP 4xx và body parse được → CHƯA đủ. Phải kèm xác nhận từ chối cuối cùng (return_code === 2).
 * 4xx + return_code 1 / mã lạ / thiếu code → giữ Chờ + Query (không coi mọi 4xx là final).
 * Body lạ / không parse / HTTP 5xx / timeout → giữ Chờ + Query.
 */
const classifyCreateResponse = ({ httpStatus, data } = {}) => {
    const status = Number(httpStatus);
    if (!Number.isFinite(status) || status >= 500 || status <= 0) {
        return { kind: 'uncertain', clearFailure: false, returnCode: null };
    }
    const parsed = parseReturnCode(data);
    if (parsed.ok && parsed.code === 2) {
        return { kind: 'rejected', clearFailure: true, returnCode: 2 };
    }
    if (status >= 200 && status < 300 && parsed.ok && parsed.code === 1) {
        return { kind: 'created', clearFailure: false, returnCode: 1 };
    }
    return { kind: 'uncertain', clearFailure: false, returnCode: parsed.ok ? parsed.code : null };
};

const chooseQrPayload = ({ qrCode, qrCodeUrl, orderUrl, payUrl } = {}) => {
    const qr = String(qrCode || qrCodeUrl || '').trim();
    const pay = String(orderUrl || payUrl || '').trim();
    if (/^000201/.test(qr) || /^https?:\/\//i.test(qr)) {
        return {
            qrPayload: qr,
            secondaryPayload: /^000201/.test(qr) && pay ? pay : ''
        };
    }
    if (pay) return { qrPayload: pay, secondaryPayload: '' };
    return { qrPayload: qr, secondaryPayload: '' };
};

const getConfig = () => {
    const appId = String(process.env.ZALOPAY_APP_ID || '').trim();
    const key1 = String(process.env.ZALOPAY_KEY1 || '').trim();
    const key2 = String(process.env.ZALOPAY_KEY2 || '').trim();
    if (!appId || !key1 || !key2) {
        throw new ZalopayProviderError(
            'Chưa có ZALOPAY_APP_ID / ZALOPAY_KEY1 / ZALOPAY_KEY2 trong .env — copy sample sandbox từ docs.zalopay.vn hoặc sbmc.',
            { clearFailure: true, status: 400 }
        );
    }
    const createUrl = String(process.env.ZALOPAY_CREATE_URL || DEFAULT_CREATE_URL).trim();
    const queryUrl = String(process.env.ZALOPAY_QUERY_URL || DEFAULT_QUERY_URL).trim();
    const refundUrl = String(process.env.ZALOPAY_REFUND_URL || DEFAULT_REFUND_URL).trim();
    const queryRefundUrl = String(process.env.ZALOPAY_QUERY_REFUND_URL || DEFAULT_QUERY_REFUND_URL).trim();
    if ([createUrl, queryUrl, refundUrl, queryRefundUrl].some(url => PRODUCTION_HOST.test(url))) {
        throw new ZalopayProviderError('CẤM trỏ https://openapi.zalopay.vn (production).', {
            clearFailure: true, status: 400
        });
    }
    return {
        appId,
        key1,
        key2,
        createUrl,
        queryUrl,
        refundUrl,
        queryRefundUrl,
        ipnUrl: String(process.env.PAYMENT_IPN_URL || '').trim(),
        returnUrl: String(process.env.PAYMENT_RETURN_URL || '').trim()
    };
};

const postForm = async (url, fields) => {
    const started = Date.now();
    const body = new URLSearchParams();
    Object.entries(fields).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        body.set(key, String(value));
    });
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body,
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (error) {
        const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
        throw new ZalopayProviderError(
            timedOut ? 'ZaloPay hết giờ — giữ trạng thái, Query lại.' : `Không gọi được ZaloPay: ${error.message}`,
            { clearFailure: false, status: 503 }
        );
    }
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = null; }
    return {
        httpStatus: response.status,
        data: data && typeof data === 'object' ? data : null,
        rawText: text,
        elapsedMs: Date.now() - started
    };
};

const createPayment = async ({ MaHD, MaTT, SoTien, MoTa, returnUrl, ipnUrl, orderId, requestId, appTime }) => {
    const cfg = getConfig();
    const amount = Math.round(Number(SoTien));
    const resolvedIpn = ipnUrl || cfg.ipnUrl;
    const resolvedReturn = returnUrl || cfg.returnUrl;
    if (!resolvedIpn || !resolvedReturn) {
        throw new ZalopayProviderError('Chưa có PAYMENT_IPN_URL / PAYMENT_RETURN_URL (tunnel HTTPS).', {
            clearFailure: true, status: 400
        });
    }
    const appTransId = String(orderId || '').trim();
    if (!/^\d{6}_/.test(appTransId)) {
        throw new ZalopayProviderError('app_trans_id phải bắt đầu yyMMdd_ (GMT+7).', {
            clearFailure: true, status: 400
        });
    }
    const appUser = 'FLY';
    const item = '[]';
    const embedData = JSON.stringify({ redirecturl: resolvedReturn, merchantinfo: String(MaHD || MaTT || '') });
    const time = Number(appTime) || Date.now();
    const description = String(MoTa || `Supermarket Fly ${MaHD || MaTT}`).slice(0, 256);
    const mac = hmacSha256Hex(cfg.key1, rawCreate({
        appId: cfg.appId,
        appTransId,
        appUser,
        amount,
        appTime: time,
        embedData,
        item
    }));
    const payload = {
        app_id: cfg.appId,
        app_user: appUser,
        app_trans_id: appTransId,
        app_time: time,
        expire_duration_seconds: 900,
        amount,
        description,
        callback_url: resolvedIpn,
        item,
        embed_data: embedData,
        bank_code: 'zalopayapp',
        mac
    };
    const posted = await postForm(cfg.createUrl, payload);
    const classified = classifyCreateResponse({ httpStatus: posted.httpStatus, data: posted.data });
    if (classified.kind === 'created') {
        const data = posted.data || {};
        return {
            resultCode: 1,
            return_code: 1,
            message: data.return_message || 'OK',
            qrCodeUrl: data.qr_code || '',
            payUrl: data.order_url || '',
            deeplink: data.order_url || '',
            orderId: data.app_trans_id || appTransId,
            requestId: requestId || '',
            amount: data.amount || amount,
            zpTransToken: data.zp_trans_token || '',
            raw: data
        };
    }
    if (classified.kind === 'rejected') {
        throw new ZalopayProviderError(
            (posted.data && posted.data.return_message) || `ZaloPay từ chối tạo đơn (return_code 2).`,
            { clearFailure: true, status: 400, resultCode: 2 }
        );
    }
    throw new ZalopayProviderError(
        'Chưa rõ trạng thái ZaloPay. Giữ Chờ — bấm Query lại. Không tạo mã mới.',
        { clearFailure: false, status: 503, resultCode: classified.returnCode }
    );
};

const queryPayment = async (orderId) => {
    const cfg = getConfig();
    const appTransId = String(orderId || '').trim();
    const mac = hmacSha256Hex(cfg.key1, rawQuery({ appId: cfg.appId, appTransId, key1: cfg.key1 }));
    const posted = await postForm(cfg.queryUrl, {
        app_id: cfg.appId,
        app_trans_id: appTransId,
        mac
    });
    if (!posted.data) {
        throw new ZalopayProviderError('Query ZaloPay không parse được — giữ Chờ.', {
            clearFailure: false, status: 503
        });
    }
    if (posted.httpStatus >= 500) {
        throw new ZalopayProviderError(`ZaloPay query HTTP ${posted.httpStatus} — giữ Chờ.`, {
            clearFailure: false, status: 503
        });
    }
    const parsed = parseReturnCode(posted.data);
    if (!parsed.ok) {
        throw new ZalopayProviderError('Query ZaloPay thiếu return_code — giữ Chờ.', {
            clearFailure: false, status: 503
        });
    }
    const classification = classifyQueryCode(parsed.code);
    const transId = posted.data.zp_trans_id;
    return {
        resultCode: parsed.code,
        classification,
        message: posted.data.return_message || posted.data.sub_return_message || '',
        amount: posted.data.amount,
        transId: transId === undefined || transId === null ? null : transId,
        orderId: posted.data.app_trans_id || appTransId,
        raw: posted.data
    };
};

const verifyCallback = (payload = {}) => {
    const cfg = getConfig();
    const dataStr = payload.data;
    const mac = payload.mac;
    const type = Number(payload.type);
    if (dataStr === undefined || dataStr === null || dataStr === '') {
        return { ok: false, reason: 'missing_data' };
    }
    if (mac === undefined || mac === null || mac === '') {
        return { ok: false, reason: 'missing_mac' };
    }
    if (Number.isFinite(type) && type !== ORDER_TYPE) {
        return { ok: false, reason: 'ignored_type', ignore: true };
    }
    const expected = hmacSha256Hex(cfg.key2, String(dataStr));
    if (!timingSafeEqualHex(expected, mac)) {
        return { ok: false, reason: 'bad_signature', expected };
    }
    let parsed;
    try {
        parsed = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
    } catch {
        return { ok: false, reason: 'bad_data_json' };
    }
    if (!parsed || typeof parsed !== 'object') {
        return { ok: false, reason: 'bad_data_json' };
    }
    if (parsed.zp_trans_id === undefined || parsed.zp_trans_id === null || parsed.zp_trans_id === '') {
        return { ok: false, reason: 'missing_transId' };
    }
    if (String(parsed.app_id) !== String(cfg.appId)) {
        return { ok: false, reason: 'app_mismatch' };
    }
    return {
        ok: true,
        MaThamChieuCong: String(parsed.app_trans_id || ''),
        SoTien: Number(parsed.amount),
        MaGiaoDich: String(parsed.zp_trans_id),
        zp_trans_id: String(parsed.zp_trans_id),
        resultCode: 1,
        classification: 'success',
        raw: parsed
    };
};

/**
 * POST /v2/refund — gửi yêu cầu, chưa chắc tiền đã về khách.
 * return_code 1 hoặc 3 → phải Query Refund. 2 = từ chối cuối.
 */
const createRefund = async ({ zpTransId, amount, mRefundId, description, timestamp }) => {
    const cfg = getConfig();
    const zp = String(zpTransId || '').trim();
    const refundId = String(mRefundId || '').trim();
    const desc = String(description || 'Hoan tien Fly').slice(0, 256);
    const time = Number(timestamp) || Date.now();
    const vnd = Math.round(Number(amount));
    if (!zp) {
        throw new ZalopayProviderError('Thiếu zp_trans_id hóa đơn gốc — không bịa mã hoàn.', {
            clearFailure: true, status: 400
        });
    }
    if (!/^\d{6}_/.test(refundId)) {
        throw new ZalopayProviderError('m_refund_id phải bắt đầu yymmdd_ (GMT+7).', {
            clearFailure: true, status: 400
        });
    }
    if (!Number.isFinite(vnd) || vnd < 1) {
        throw new ZalopayProviderError('Số tiền hoàn ZaloPay phải là số nguyên VND > 0.', {
            clearFailure: true, status: 400
        });
    }
    const mac = hmacSha256Hex(cfg.key1, rawRefund({
        appId: cfg.appId, zpTransId: zp, amount: vnd, description: desc, timestamp: time
    }));
    const posted = await postForm(cfg.refundUrl, {
        app_id: cfg.appId,
        zp_trans_id: zp,
        amount: vnd,
        description: desc,
        timestamp: time,
        m_refund_id: refundId,
        mac
    });
    const classified = classifyCreateResponse({ httpStatus: posted.httpStatus, data: posted.data });
    if (classified.kind === 'rejected') {
        throw new ZalopayProviderError(
            (posted.data && (posted.data.sub_return_message || posted.data.return_message))
                || 'ZaloPay từ chối hoàn tiền (return_code 2).',
            { clearFailure: true, status: 400, resultCode: 2 }
        );
    }
    const data = posted.data || {};
    const parsed = parseReturnCode(data);
    return {
        resultCode: parsed.ok ? parsed.code : classified.returnCode,
        return_code: parsed.ok ? parsed.code : classified.returnCode,
        classification: parsed.ok ? classifyQueryCode(parsed.code) : 'pending',
        message: data.return_message || data.sub_return_message || '',
        subReturnCode: data.sub_return_code,
        subReturnMessage: data.sub_return_message || '',
        refundId: data.refund_id == null ? null : String(data.refund_id),
        mRefundId: refundId,
        amount: vnd,
        clearFailure: classified.clearFailure,
        raw: data
    };
};

const queryRefund = async (mRefundId) => {
    const cfg = getConfig();
    const id = String(mRefundId || '').trim();
    const timestamp = Date.now();
    const mac = hmacSha256Hex(cfg.key1, rawQueryRefund({ appId: cfg.appId, mRefundId: id, timestamp }));
    const posted = await postForm(cfg.queryRefundUrl, {
        app_id: cfg.appId,
        m_refund_id: id,
        timestamp,
        mac
    });
    if (!posted.data) {
        throw new ZalopayProviderError('Query hoàn ZaloPay không parse được — giữ Đang hoàn tiền.', {
            clearFailure: false, status: 503
        });
    }
    if (posted.httpStatus >= 500) {
        throw new ZalopayProviderError(`ZaloPay query_refund HTTP ${posted.httpStatus} — giữ Đang hoàn tiền.`, {
            clearFailure: false, status: 503
        });
    }
    const parsed = parseReturnCode(posted.data);
    if (!parsed.ok) {
        throw new ZalopayProviderError('Query hoàn ZaloPay thiếu return_code — giữ Đang hoàn tiền.', {
            clearFailure: false, status: 503
        });
    }
    return {
        resultCode: parsed.code,
        classification: classifyQueryCode(parsed.code),
        message: posted.data.return_message || posted.data.sub_return_message || '',
        subReturnCode: posted.data.sub_return_code,
        subReturnMessage: posted.data.sub_return_message || '',
        refundId: posted.data.refund_id == null ? null : String(posted.data.refund_id),
        mRefundId: id,
        raw: posted.data
    };
};

module.exports = {
    ORDER_TYPE,
    ZalopayProviderError,
    hmacSha256Hex,
    timingSafeEqualHex,
    rawCreate,
    rawQuery,
    rawRefund,
    rawQueryRefund,
    classifyQueryCode,
    classifyCreateResponse,
    parseReturnCode,
    chooseQrPayload,
    getConfig,
    createPayment,
    queryPayment,
    createRefund,
    queryRefund,
    verifyCallback
};
