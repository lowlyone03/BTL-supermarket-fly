const crypto = require('node:crypto');

const REQUEST_TYPE = 'captureWallet';
const DEFAULT_CREATE_URL = 'https://test-payment.momo.vn/v2/gateway/api/create';
const DEFAULT_QUERY_URL = 'https://test-payment.momo.vn/v2/gateway/api/query';
const TIMEOUT_MS = 30000;
const PRODUCTION_HOST = /^https:\/\/payment\.momo\.vn/i;

const PENDING_CODES = new Set([1000, 7000, 7002]);
const FINAL_FAIL_CODES = new Set([
    10, 11, 12, 13, 20, 21, 22, 40, 41, 42, 43, 98, 99,
    1001, 1002, 1003, 1004, 1005, 1006, 1007, 1026, 1030,
    2001, 2007, 3001, 3002, 3003, 3004, 4001, 4100
]);

class MomoProviderError extends Error {
    constructor(message, { clearFailure = false, resultCode = null, status = 400 } = {}) {
        super(message);
        this.name = 'MomoProviderError';
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

const rawCreate = ({
    accessKey, amount, extraData, ipnUrl, orderId, orderInfo,
    partnerCode, redirectUrl, requestId, requestType
}) => [
    `accessKey=${accessKey}`,
    `amount=${amount}`,
    `extraData=${extraData ?? ''}`,
    `ipnUrl=${ipnUrl}`,
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `partnerCode=${partnerCode}`,
    `redirectUrl=${redirectUrl}`,
    `requestId=${requestId}`,
    `requestType=${requestType}`
].join('&');

const rawQuery = ({ accessKey, orderId, partnerCode, requestId }) => (
    `accessKey=${accessKey}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}`
);

const rawIpn = (payload, accessKey) => {
    if (payload.transId === undefined || payload.transId === null || payload.transId === '') {
        throw new Error('IPN thiếu transId — không ký / không tin.');
    }
    return [
        `accessKey=${accessKey}`,
        `amount=${payload.amount}`,
        `extraData=${payload.extraData ?? ''}`,
        `message=${payload.message ?? ''}`,
        `orderId=${payload.orderId}`,
        `orderInfo=${payload.orderInfo ?? ''}`,
        `orderType=${payload.orderType ?? ''}`,
        `partnerCode=${payload.partnerCode}`,
        `payType=${payload.payType ?? ''}`,
        `requestId=${payload.requestId}`,
        `responseTime=${payload.responseTime}`,
        `resultCode=${payload.resultCode}`,
        `transId=${payload.transId}`
    ].join('&');
};

const classifyResultCode = (code) => {
    const value = Number(code);
    if (value === 0) return 'success';
    if (value === 9000) return 'authorized';
    if (PENDING_CODES.has(value)) return 'pending';
    if (FINAL_FAIL_CODES.has(value)) return 'failure';
    return 'pending';
};

const chooseQrPayload = ({ qrCodeUrl, payUrl } = {}) => {
    const qr = String(qrCodeUrl || '').trim();
    const pay = String(payUrl || '').trim();
    if (/^000201/.test(qr) || /^momo:\/\//i.test(qr) || /^https?:\/\//i.test(qr)) {
        return {
            qrPayload: qr,
            secondaryPayload: /^momo:\/\//i.test(qr) && pay ? pay : ''
        };
    }
    if (pay) return { qrPayload: pay, secondaryPayload: '' };
    return { qrPayload: qr, secondaryPayload: '' };
};

const getConfig = () => {
    const partnerCode = String(process.env.MOMO_PARTNER_CODE || '').trim();
    const accessKey = String(process.env.MOMO_ACCESS_KEY || '').trim();
    const secretKey = String(process.env.MOMO_SECRET_KEY || '').trim();
    if (!partnerCode || !accessKey || !secretKey) {
        throw new MomoProviderError(
            'Chưa có MOMO_* trong .env — copy sample từ momo-wallet/payment MoMo.js',
            { clearFailure: true, status: 400 }
        );
    }
    const createUrl = String(process.env.MOMO_CREATE_URL || DEFAULT_CREATE_URL).trim();
    const queryUrl = String(process.env.MOMO_QUERY_URL || DEFAULT_QUERY_URL).trim();
    if (PRODUCTION_HOST.test(createUrl) || PRODUCTION_HOST.test(queryUrl)) {
        throw new MomoProviderError('CẤM trỏ https://payment.momo.vn (production).', {
            clearFailure: true, status: 400
        });
    }
    return {
        partnerCode,
        accessKey,
        secretKey,
        createUrl,
        queryUrl,
        ipnUrl: String(process.env.PAYMENT_IPN_URL || '').trim(),
        returnUrl: String(process.env.PAYMENT_RETURN_URL || '').trim()
    };
};

const postJson = async (url, body) => {
    const started = Date.now();
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (error) {
        const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
        throw new MomoProviderError(
            timedOut ? 'MoMo create/query hết giờ — giữ Chờ, Query lại.' : `Không gọi được MoMo: ${error.message}`,
            { clearFailure: false, status: 503 }
        );
    }
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (response.status >= 500) {
        throw new MomoProviderError(`MoMo HTTP ${response.status} — chưa rõ đã nhận chưa.`, {
            clearFailure: false, status: 503, resultCode: data.resultCode
        });
    }
    if (response.status >= 400) {
        throw new MomoProviderError(data.message || `MoMo từ chối HTTP ${response.status}.`, {
            clearFailure: true, status: 400, resultCode: data.resultCode
        });
    }
    data._elapsedMs = Date.now() - started;
    return data;
};

const createPayment = async ({ MaHD, MaTT, SoTien, MoTa, returnUrl, ipnUrl, orderId, requestId }) => {
    const cfg = getConfig();
    const amount = Math.round(Number(SoTien));
    const extraData = '';
    const orderInfo = String(MoTa || `Thanh toan ${MaHD || MaTT}`).slice(0, 200);
    const resolvedIpn = ipnUrl || cfg.ipnUrl;
    const resolvedReturn = returnUrl || cfg.returnUrl;
    if (!resolvedIpn || !resolvedReturn) {
        throw new MomoProviderError('Chưa có PAYMENT_IPN_URL / PAYMENT_RETURN_URL (tunnel HTTPS).', {
            clearFailure: true, status: 400
        });
    }
    const raw = rawCreate({
        accessKey: cfg.accessKey,
        amount,
        extraData,
        ipnUrl: resolvedIpn,
        orderId,
        orderInfo,
        partnerCode: cfg.partnerCode,
        redirectUrl: resolvedReturn,
        requestId,
        requestType: REQUEST_TYPE
    });
    const signature = hmacSha256Hex(cfg.secretKey, raw);
    const body = {
        partnerCode: cfg.partnerCode,
        partnerName: 'Supermarket Fly',
        storeId: 'FLY',
        storeName: 'Supermarket Fly',
        requestType: REQUEST_TYPE,
        ipnUrl: resolvedIpn,
        redirectUrl: resolvedReturn,
        orderId,
        amount,
        lang: 'vi',
        autoCapture: true,
        orderInfo,
        requestId,
        extraData,
        accessKey: cfg.accessKey,
        signature
    };
    const data = await postJson(cfg.createUrl, body);
    const resultCode = Number(data.resultCode);
    if (resultCode !== 0) {
        throw new MomoProviderError(data.message || `MoMo create resultCode ${resultCode}.`, {
            clearFailure: true, status: 400, resultCode
        });
    }
    return {
        resultCode,
        message: data.message || 'OK',
        qrCodeUrl: data.qrCodeUrl || '',
        payUrl: data.payUrl || '',
        deeplink: data.deeplink || '',
        orderId: data.orderId || orderId,
        requestId: data.requestId || requestId,
        amount: data.amount,
        raw: data
    };
};

const queryPayment = async (orderId, requestId) => {
    const cfg = getConfig();
    const resolvedRequestId = requestId || `QRY${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
    const raw = rawQuery({
        accessKey: cfg.accessKey,
        orderId,
        partnerCode: cfg.partnerCode,
        requestId: resolvedRequestId
    });
    const body = {
        partnerCode: cfg.partnerCode,
        requestId: resolvedRequestId,
        orderId,
        lang: 'vi',
        signature: hmacSha256Hex(cfg.secretKey, raw)
    };
    const data = await postJson(cfg.queryUrl, body);
    return {
        resultCode: Number(data.resultCode),
        classification: classifyResultCode(data.resultCode),
        message: data.message || '',
        amount: data.amount,
        transId: data.transId,
        payType: data.payType,
        orderId: data.orderId || orderId,
        raw: data
    };
};

const verifyCallback = (payload = {}) => {
    const cfg = getConfig();
    if (payload.transId === undefined || payload.transId === null || payload.transId === '') {
        return { ok: false, reason: 'missing_transId' };
    }
    let raw;
    try {
        raw = rawIpn(payload, cfg.accessKey);
    } catch (error) {
        return { ok: false, reason: error.message };
    }
    const expected = hmacSha256Hex(cfg.secretKey, raw);
    if (!timingSafeEqualHex(expected, payload.signature)) {
        return { ok: false, reason: 'bad_signature', expected };
    }
    if (String(payload.partnerCode) !== cfg.partnerCode) {
        return { ok: false, reason: 'partner_mismatch' };
    }
    return {
        ok: true,
        MaThamChieuCong: String(payload.orderId || ''),
        SoTien: Number(payload.amount),
        MaGiaoDich: String(payload.transId),
        resultCode: Number(payload.resultCode),
        classification: classifyResultCode(payload.resultCode),
        raw: payload
    };
};

module.exports = {
    REQUEST_TYPE,
    MomoProviderError,
    hmacSha256Hex,
    timingSafeEqualHex,
    rawCreate,
    rawQuery,
    rawIpn,
    classifyResultCode,
    chooseQrPayload,
    getConfig,
    createPayment,
    queryPayment,
    verifyCallback
};
