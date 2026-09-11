const { escapeHtml, splitTelegramText, isTelegramAskEnabled } = require('./telegramMessages');
const { sanitizeAssistantText, humanizeSources } = require('./assistantCopy');

const ASK_USAGE = 'Hỏi Trợ lý Fly. Gõ: /ask hôm nay cần chú ý gì?\nTrợ lý không duyệt chứng từ. Việc chờ: nút trên tin, hoặc /pending.';
const ASK_DISABLED = 'Chưa bật hỏi trợ lý trên Telegram. Dùng /guide /today hoặc nút Trợ lý trên Fly.';
const ASK_WORKING = 'Đang hỏi trợ lý Fly…';
const ASK_TIMEOUT = 'Trợ lý tạm không trả lời kịp — mở dashboard Electron hoặc /today /pending.';
const MAX_DOC_BUTTONS = 8;
const PERIOD_ID_RE = /^(20\d{2}-(?:0[1-9]|1[0-2])(?:-\d{2})?)$/;

const KIND_CODE = {
    purchase: 'hdm',
    sales: 'hd',
    po: 'po',
    receipt: 'pn',
    issue: 'px',
    request: 'dn',
    return: 'dt',
    count: 'kk',
    'receipt-cash': 'pt',
    payment: 'pc',
    payables: 'cn',
    payroll: 'lg',
    'low-stock': 'tt',
    'warehouse-report': 'bck',
    'store-report': 'bc',
    kqkd: 'kq',
    'trial-balance': 'cd',
    'cash-flow': 'lc',
    'balance-sheet': 'bs'
};

const CODE_KIND = Object.fromEntries(Object.entries(KIND_CODE).map(([kind, code]) => [code, kind]));

let askOverride = null;
let askDocOverride = null;

const setAskOverride = (fn) => {
    askOverride = typeof fn === 'function' ? fn : null;
};

const setAskDocOverride = (fn) => {
    askDocOverride = typeof fn === 'function' ? fn : null;
};

const invokeAsk = (args) => {
    if (askOverride) return askOverride(args);
    const { ask } = require('./assistantService');
    return ask(args);
};

const prettyMoney = (value) => `${Math.round(Number(value || 0)).toLocaleString('vi-VN')} đ`;

const askDocCallbackData = (skin, kind, id) => {
    const code = KIND_CODE[kind];
    if (!code || (skin !== 's' && skin !== 'w')) return '';
    return `askd:${skin}:${code}:${String(id || '').slice(0, 40)}`.slice(0, 64);
};

const parseAskDocCallback = (data) => {
    const match = String(data || '').trim().match(/^askd:([sw]):([a-z]{2,3}):(.{0,40})$/i);
    if (!match) return null;
    const kind = CODE_KIND[match[2].toLowerCase()];
    if (!kind) return null;
    return { skin: match[1].toLowerCase(), kind, id: match[3] };
};

const itemsOf = (result) => {
    const rows = result?.items || result?.invoices || [];
    return Array.isArray(rows) ? rows : [];
};

const specOfKind = (kind) => {
    try {
        return require('./assistantDocs').specOf(kind);
    } catch {
        return null;
    }
};

const formatDocLine = (row, index, kind) => {
    const so = row.soHd || row.id || '—';
    const partner = row.ncc || '—';
    const qtyKind = kind === 'low-stock' || kind === 'request';
    const amount = qtyKind ? String(row.tien ?? '—') : prettyMoney(row.tien);
    return `${index + 1}. <b>${escapeHtml(so)}</b> — ${escapeHtml(partner)} — ${escapeHtml(amount)}`;
};

const normalizeAnswerLines = (value) => {
    let out = sanitizeAssistantText(value || '').replace(/\r\n/g, '\n').trim();
    if (!out) return '';
    if (!out.includes('\n') && / \- /.test(out)) {
        out = out.replace(/ \- /g, '\n- ');
    }
    return out;
};

const formatPlainAnswer = (value) => {
    const raw = normalizeAnswerLines(value) || 'Trợ lý không trả lời được.';
    return raw.split('\n').map((line) => escapeHtml(line.trimEnd())).join('\n');
};

const formatSourcesBlock = (sources) => {
    const names = humanizeSources(sources || []).slice(0, 8);
    if (!names.length) return '';
    return `\n\n<b>Nguồn</b>\n${names.map((item) => `• ${escapeHtml(item)}`).join('\n')}`;
};

const formatAskDocuments = (result) => {
    const kind = result.kind || result.invoiceKind;
    const spec = specOfKind(kind);
    const items = itemsOf(result);
    const period = result.period?.label || '';
    const label = (spec?.label || 'chứng từ').toLowerCase();
    if (items.length) {
        const lines = items.slice(0, 30).map((row, index) => formatDocLine(row, index, kind));
        const more = items.length > MAX_DOC_BUTTONS
            ? `\n<i>… nút PDF hiện ${MAX_DOC_BUTTONS} chứng từ đầu.</i>`
            : '';
        return `Có <b>${items.length}</b> ${escapeHtml(label)}${period ? ` trong ${escapeHtml(period)}` : ''}.\nBấm mã bên dưới để tải PDF mẫu hệ thống. Nút Giấy trắng = bản mực đen.\n\n${lines.join('\n')}${more}`;
    }
    const answer = formatPlainAnswer(result.answer);
    if (result.report || result.print) {
        return `${answer}\nBấm nút để tải PDF mẫu hệ thống hoặc giấy trắng.`;
    }
    return answer;
};

const buildAskKeyboard = (result) => {
    const kind = result.kind || result.invoiceKind;
    if (!kind || !KIND_CODE[kind]) return null;
    const items = itemsOf(result);
    const spec = specOfKind(kind);
    const periodKey = result.period?.key || '';
    const rows = [];
    if (items.length && spec?.mode !== 'report') {
        for (const row of items.slice(0, MAX_DOC_BUTTONS)) {
            const id = row.id || row.soHd;
            const label = String(row.soHd || row.id || 'PDF').slice(0, 28);
            const system = askDocCallbackData('s', kind, id);
            const white = askDocCallbackData('w', kind, id);
            if (!system || system.length > 64) continue;
            rows.push([
                { text: label, callback_data: system },
                { text: 'Giấy trắng', callback_data: white }
            ]);
        }
    } else if (result.print || result.report || spec?.mode === 'report') {
        const id = periodKey || result.print?.mau?.number || result.print?.number || '';
        const system = askDocCallbackData('s', kind, id);
        const white = askDocCallbackData('w', kind, id);
        if (system) {
            rows.push([
                { text: 'Tải PDF hệ thống', callback_data: system },
                { text: 'Giấy trắng', callback_data: white }
            ]);
        }
    }
    if (!rows.length) return null;
    return { inline_keyboard: rows };
};

const formatAskAnswer = (result) => {
    const items = itemsOf(result);
    const hasDocs = items.length || result?.report || result?.print;
    const body = hasDocs ? formatAskDocuments(result) : formatPlainAnswer(result?.answer);
    const texts = splitTelegramText(`${body}${formatSourcesBlock(result?.sources)}`, 3900);
    const keyboard = hasDocs ? buildAskKeyboard(result) : null;
    return {
        texts,
        extra: keyboard ? { reply_markup: keyboard } : undefined
    };
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
        const formatted = formatAskAnswer(result);
        return { result, texts: formatted.texts, extra: formatted.extra };
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

const deliverAskDocument = async ({ user, pool, kind, id, skin } = {}) => {
    if (askDocOverride) return askDocOverride({ user, pool, kind, id, skin });
    const { getDocumentPrint, handleDocumentIntent, specOf, canReadKind } = require('./assistantDocs');
    const spec = specOf(kind);
    if (!spec || !canReadKind(spec, user)) {
        const error = new Error('Tài khoản này không xem chứng từ trên trợ lý.');
        error.status = 403;
        throw error;
    }
    let print = null;
    if (spec.mode === 'report' || PERIOD_ID_RE.test(String(id || ''))) {
        if (spec.mode === 'report') {
            const packed = await getDocumentPrint(pool, user, kind, id);
            print = packed.print;
        } else {
            const listed = await handleDocumentIntent(pool, user, `${spec.label} ${id}`);
            print = listed?.print?.mau || listed?.print;
        }
    } else {
        const packed = await getDocumentPrint(pool, user, kind, id);
        print = packed.print;
    }
    if (!print) {
        const error = new Error('Không tìm thấy chứng từ.');
        error.status = 404;
        throw error;
    }
    const { renderPrintPdf, pdfFileName } = require('./assistantPrintPdf');
    const resolvedSkin = skin === 'w' || skin === 'official' ? 'official' : 'system';
    const buffer = await renderPrintPdf(print, { skin: resolvedSkin });
    const filename = pdfFileName({ ...print, skin: resolvedSkin });
    const caption = `${print.title || 'Chứng từ'}${print.number ? ` · ${print.number}` : ''} · ${resolvedSkin === 'official' ? 'giấy trắng' : 'mẫu hệ thống'}`;
    return { buffer, filename, caption, mime: 'application/pdf' };
};

module.exports = {
    ASK_USAGE,
    ASK_DISABLED,
    ASK_WORKING,
    ASK_TIMEOUT,
    KIND_CODE,
    isTelegramAskEnabled,
    setAskOverride,
    setAskDocOverride,
    invokeAsk,
    askDocCallbackData,
    parseAskDocCallback,
    buildAskKeyboard,
    formatAskAnswer,
    runTelegramAsk,
    enqueueAsk,
    deliverAskDocument
};
