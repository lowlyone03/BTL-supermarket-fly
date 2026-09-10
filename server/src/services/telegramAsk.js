const { escapeHtml, splitTelegramText, isTelegramAskEnabled } = require('./telegramMessages');
const { sanitizeAssistantText, humanizeSources } = require('./assistantCopy');

const ASK_USAGE = 'Hỏi Trợ lý Fly. Gõ: /ask hôm nay cần chú ý gì?\nTrợ lý không duyệt chứng từ. Việc chờ: nút trên tin, hoặc /pending.';
const ASK_DISABLED = 'Chưa bật hỏi trợ lý trên Telegram. Dùng /guide /today hoặc nút Trợ lý trên Fly.';
const ASK_WORKING = 'Đang hỏi trợ lý Fly…';
const ASK_TIMEOUT = 'Trợ lý tạm không trả lời kịp — mở dashboard Electron hoặc /today /pending.';

let askOverride = null;

const setAskOverride = (fn) => {
    askOverride = typeof fn === 'function' ? fn : null;
};

const invokeAsk = (args) => {
    if (askOverride) return askOverride(args);
    const { ask } = require('./assistantService');
    return ask(args);
};

const formatAskAnswer = (result) => {
    const answer = escapeHtml(sanitizeAssistantText(result?.answer || '')).trim()
        || 'Trợ lý không trả lời được.';
    const sources = humanizeSources(result?.sources || []).slice(0, 8);
    const block = sources.length
        ? `\n\nNguồn:\n${sources.map((item) => `- ${escapeHtml(item)}`).join('\n')}`
        : '';
    return splitTelegramText(`${answer}${block}`, 3900);
};

const clipAskQuestion = (value) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Number(process.env.ASSISTANT_MAX_QUESTION || 500));

const runTelegramAsk = async ({ user, question, pool, req = null } = {}) => {
    const timeoutMs = Number(process.env.ASSISTANT_TIMEOUT_MS || 25000);
    const clipped = clipAskQuestion(question);
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error('ask-timeout');
            error.code = 'ASK_TIMEOUT';
            reject(error);
        }, timeoutMs);
        if (typeof timer.unref === 'function') timer.unref();
    });
    try {
        const result = await Promise.race([
            invokeAsk({
                user,
                question: clipped,
                pool,
                req,
                channel: 'telegram',
                historyTurns: []
            }),
            timeout
        ]);
        return { result, texts: formatAskAnswer(result) };
    } catch (error) {
        if (Number(error.status) === 429) {
            return { rateLimited: true, texts: [error.message] };
        }
        if (Number(error.status) === 400) {
            return { usage: true, texts: [ASK_USAGE] };
        }
        if (error.code === 'ASK_TIMEOUT' || /timeout|timed out|ask-timeout/i.test(error.message || '')) {
            return { timeout: true, texts: [ASK_TIMEOUT] };
        }
        throw error;
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const enqueueAsk = (job) => {
    setImmediate(() => {
        Promise.resolve()
            .then(job)
            .catch((error) => {
                console.error('Telegram /ask:', error.message);
            });
    });
};

module.exports = {
    ASK_USAGE,
    ASK_DISABLED,
    ASK_WORKING,
    ASK_TIMEOUT,
    isTelegramAskEnabled,
    setAskOverride,
    invokeAsk,
    formatAskAnswer,
    runTelegramAsk,
    enqueueAsk
};
