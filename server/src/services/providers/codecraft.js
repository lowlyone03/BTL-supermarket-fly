const DEFAULT_BASE = 'https://codecraftapi.com/v1';
const DEFAULT_MODEL = 'deepseek-v4-flash-0731';

const emptyKeyError = () => {
    const error = new Error('Chưa cấu hình trợ lý. Điền ASSISTANT_API_KEY trong server/.env rồi chạy lại npm start.');
    error.status = 503;
    error.code = 'ASSISTANT_NOT_CONFIGURED';
    return error;
};

const parseCompletion = (payload) => {
    const text = String(payload?.choices?.[0]?.message?.content || '').trim();
    const model = String(payload?.model || '').trim() || null;
    return { text, model };
};

const looksLikeCloudflare = (payload, raw) => {
    const blob = `${JSON.stringify(payload || {})}\n${String(raw || '').slice(0, 400)}`.toLowerCase();
    return blob.includes('cloudflare') || blob.includes('bad gateway') || blob.includes('error 502');
};

const mapHttpError = (status, payload, raw = '') => {
    const code = String(payload?.error?.code || payload?.error?.type || payload?.error_name || '');
    if (status === 401 || code === 'invalid_api_key' || code === 'authentication_error') {
        const error = new Error('Khóa CodeCraft không hợp lệ hoặc đã thu hồi. Kiểm tra ASSISTANT_API_KEY rồi chạy lại npm start.');
        error.status = 401;
        error.code = 'ASSISTANT_AUTH';
        return error;
    }
    if (status === 402 || code === 'insufficient_funds') {
        const error = new Error('Hết hạn mức CodeCraft. Nạp thêm token hoặc nâng gói, rồi hỏi lại — hoặc mở đúng màn hình dashboard.');
        error.status = 402;
        error.code = 'ASSISTANT_QUOTA';
        return error;
    }
    if (status === 429 || code === 'rate_limit_exceeded') {
        const error = new Error('CodeCraft đang giới hạn tốc độ. Đợi một lát rồi hỏi lại, hoặc mở đúng màn hình dashboard.');
        error.status = 429;
        error.code = 'ASSISTANT_RATE';
        return error;
    }
    if (status === 403 || code === 'insufficient_scope') {
        const error = new Error('Khóa CodeCraft thiếu quyền gọi chat. Kiểm tra scope inference trên dashboard nhà cung cấp.');
        error.status = 403;
        error.code = 'ASSISTANT_SCOPE';
        return error;
    }
    if (status === 502 || looksLikeCloudflare(payload, raw)) {
        const error = new Error('CodeCraft tạm gián đoạn (lỗi cổng máy chủ). Đợi ít phút rồi hỏi lại, hoặc mở đúng màn hình dashboard.');
        error.status = 502;
        error.code = 'ASSISTANT_UPSTREAM';
        return error;
    }
    const fallback = String(payload?.error?.message || payload?.detail || '').trim();
    const error = new Error(fallback || 'Nhà cung cấp trợ lý từ chối yêu cầu. Hãy mở đúng màn hình trên dashboard.');
    error.status = 502;
    error.code = 'ASSISTANT_UPSTREAM';
    return error;
};

const complete = async ({ system, user, maxTokens = 700 } = {}) => {
    const apiKey = String(process.env.ASSISTANT_API_KEY || '').trim();
    if (!apiKey) throw emptyKeyError();

    const base = String(process.env.ASSISTANT_BASE_URL || DEFAULT_BASE).trim().replace(/\/+$/, '') || DEFAULT_BASE;
    const model = String(process.env.ASSISTANT_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    const url = `${base}/chat/completions`;
    const timeoutMs = Number(process.env.ASSISTANT_TIMEOUT_MS || 25000);
    const body = JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        max_tokens: Math.max(Number(maxTokens) || 700, 2048),
        messages: [
            { role: 'system', content: String(system || '') },
            { role: 'user', content: String(user || '') }
        ]
    });

    const postOnce = async () => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        try {
            return await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                signal: ac.signal,
                body
            });
        } finally {
            clearTimeout(timer);
        }
    };

    let response;
    try {
        response = await postOnce();
        if (response.status === 502) {
            await new Promise((resolve) => setTimeout(resolve, 400));
            response = await postOnce();
        }
    } catch (error) {
        const failed = new Error(error.name === 'AbortError'
            ? 'Trợ lý tạm không trả lời kịp. Hãy mở đúng màn hình trên dashboard.'
            : 'Không kết nối được nhà cung cấp trợ lý.');
        failed.status = 502;
        throw failed;
    }

    const raw = await response.text();
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
    if (!response.ok) throw mapHttpError(response.status, payload, raw);

    const parsed = parseCompletion(payload);
    if (!parsed.text) {
        const failed = new Error('Trợ lý không trả được nội dung. Hãy mở đúng màn hình trên dashboard.');
        failed.status = 502;
        throw failed;
    }
    return { text: parsed.text, model: parsed.model || model };
};

module.exports = {
    complete,
    parseCompletion,
    mapHttpError,
    DEFAULT_BASE,
    DEFAULT_MODEL
};
