const complete = async ({ system, user, maxTokens = 700 } = {}) => {
    const apiKey = String(process.env.ASSISTANT_API_KEY || '').trim();
    if (!apiKey) {
        const error = new Error('Chưa cấu hình trợ lý. Điền ASSISTANT_API_KEY trong server/.env rồi chạy lại npm start.');
        error.status = 503;
        error.code = 'ASSISTANT_NOT_CONFIGURED';
        throw error;
    }
    const model = String(process.env.ASSISTANT_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
    const timeoutMs = Number(process.env.ASSISTANT_TIMEOUT_MS || 25000);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let response;
    try {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            signal: ac.signal,
            body: JSON.stringify({
                model,
                temperature: 0.2,
                max_tokens: Math.min(Number(maxTokens) || 700, 1200),
                messages: [
                    { role: 'system', content: String(system || '') },
                    { role: 'user', content: String(user || '') }
                ]
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
    const text = String(payload.choices?.[0]?.message?.content || '').trim();
    if (!text) {
        const failed = new Error('Trợ lý không trả được nội dung. Hãy mở đúng màn hình trên dashboard.');
        failed.status = 502;
        throw failed;
    }
    return { text, model };
};

module.exports = { complete };
