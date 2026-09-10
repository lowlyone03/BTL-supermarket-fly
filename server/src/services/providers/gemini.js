const DEFAULT_MODEL = process.env.ASSISTANT_MODEL || 'gemini-2.0-flash';

const complete = async ({ system, user, maxTokens = 700 } = {}) => {
    const apiKey = String(process.env.ASSISTANT_API_KEY || '').trim();
    if (!apiKey) {
        const error = new Error('Chưa cấu hình trợ lý. Điền ASSISTANT_API_KEY trong server/.env rồi chạy lại npm start.');
        error.status = 503;
        error.code = 'ASSISTANT_NOT_CONFIGURED';
        throw error;
    }
    const model = String(process.env.ASSISTANT_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const timeoutMs = Number(process.env.ASSISTANT_TIMEOUT_MS || 25000);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ac.signal,
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: String(system || '') }] },
                contents: [{ role: 'user', parts: [{ text: String(user || '') }] }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: Math.min(Number(maxTokens) || 700, 1200)
                }
            })
        });
    } catch (error) {
        const failed = new Error(error.name === 'AbortError'
            ? 'Trợ lý tạm không trả lời kịp. Hãy mở đúng màn hình trên dashboard.'
            : 'Không kết nối được nhà cung cấp trợ lý.');
        failed.status = 502;
        throw failed;
    } finally {
        clearTimeout(timer);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const failed = new Error(payload.error?.message || 'Nhà cung cấp trợ lý từ chối yêu cầu.');
        failed.status = 502;
        throw failed;
    }
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join('\n').trim();
    if (!text) {
        const failed = new Error('Trợ lý không trả được nội dung. Hãy mở đúng màn hình trên dashboard.');
        failed.status = 502;
        throw failed;
    }
    return { text, model };
};

module.exports = { complete };
