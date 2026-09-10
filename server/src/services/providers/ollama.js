const complete = async ({ system, user, maxTokens = 700 } = {}) => {
    const base = String(process.env.ASSISTANT_OLLAMA_URL || '').trim();
    if (!base) {
        const error = new Error('Ollama chưa bật. P2-MIN dùng Gemini/OpenAI. Điền ASSISTANT_OLLAMA_URL khi làm P2-ĐỦ.');
        error.status = 503;
        error.code = 'ASSISTANT_NOT_CONFIGURED';
        throw error;
    }
    const model = String(process.env.ASSISTANT_OLLAMA_MODEL || 'llama3.2').trim();
    const timeoutMs = Number(process.env.ASSISTANT_TIMEOUT_MS || 25000);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let response;
    try {
        response = await fetch(`${base.replace(/\/+$/, '')}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ac.signal,
            body: JSON.stringify({
                model,
                stream: false,
                options: { num_predict: Math.min(Number(maxTokens) || 700, 1200) },
                messages: [
                    { role: 'system', content: String(system || '') },
                    { role: 'user', content: String(user || '') }
                ]
            })
        });
    } catch (error) {
        const failed = new Error(error.name === 'AbortError'
            ? 'Trợ lý tạm không trả lời kịp. Hãy mở đúng màn hình trên dashboard.'
            : 'Không kết nối được Ollama.');
        failed.status = 502;
        throw failed;
    } finally {
        clearTimeout(timer);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const failed = new Error(payload.error || 'Ollama từ chối yêu cầu.');
        failed.status = 502;
        throw failed;
    }
    const text = String(payload.message?.content || '').trim();
    if (!text) {
        const failed = new Error('Trợ lý không trả được nội dung. Hãy mở đúng màn hình trên dashboard.');
        failed.status = 502;
        throw failed;
    }
    return { text, model };
};

module.exports = { complete };
