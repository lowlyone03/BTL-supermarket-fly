try {
    require('node:dns').setDefaultResultOrder('ipv4first');
} catch {
    /* Node cũ không có setDefaultResultOrder */
}

const { ROLE_PERMISSION_CODES } = require('../constants/permissions');
const { calculateGrossProfit, RESTOCK_ACCEPTED_SQL } = require('./financialRules');
const {
    operatingDayOf, operatingWindow, operatingDayForReport, isOperatingReportWindow,
    isMorningScheduleWindow, isWithinRateLimit, formatVnDate, vnParts, RATE_LIMIT_MS,
    sanitizeJsDateText
} = require('./telegramClock');
const {
    formatMoney, maskChatId, escapeHtml, buildA1Message, buildA2Message, buildB12Message,
    buildA3Message, buildInboxPushMessage, buildAttendancePendingMessage, buildPushCard,
    formatTelegramValue, FLY_HINT, isManagerRole, telegramAudience, normalizeLang, splitTelegramText
} = require('./telegramMessages');
const { isProductImagePath } = require('./telegramVoucherImage');

const eventCard = (title, fields, lang = 'vi') => buildPushCard({
    title,
    rows: Object.entries(fields).map(([label, value]) =>
        `${escapeHtml(label)}: <code>${escapeHtml(formatTelegramValue(value, lang))}</code>`)
});

const PUSH_WINDOW_MS = RATE_LIMIT_MS;
const inflightPushes = new Set();
let runtime = {
    fetchFn: (...args) => globalThis.fetch(...args),
    getPool: null,
    getSql: null,
    now: () => new Date(),
    log: (...args) => console.error(...args)
};

let status = 'off';
let cronTimer = null;

const notifySafely = (work) => {
    try {
        const result = typeof work === 'function' ? work() : work;
        if (result && typeof result.then === 'function') {
            result.catch(error => runtime.log('Telegram:', error.message || error));
        }
        return result;
    } catch (error) {
        runtime.log('Telegram:', error.message || error);
        return undefined;
    }
};

const setTelegramRuntime = (partial = {}) => {
    runtime = { ...runtime, ...partial };
};

const resetTelegramRuntime = () => {
    runtime.fetchFn = (...args) => globalThis.fetch(...args);
    runtime.getPool = null;
    runtime.getSql = null;
    runtime.now = () => new Date();
    runtime.log = (...args) => console.error(...args);
    inflightPushes.clear();
};

const db = () => {
    if (runtime.getSql) {
        return {
            sql: runtime.getSql(),
            poolPromise: runtime.getPool ? runtime.getPool() : Promise.resolve(null)
        };
    }
    const mod = require('../config/db');
    return {
        sql: mod.sql,
        poolPromise: runtime.getPool ? runtime.getPool() : mod.poolPromise
    };
};

const getPool = async () => {
    const { poolPromise } = db();
    return poolPromise;
};

const botToken = () => String(process.env.TELEGRAM_BOT_TOKEN || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^bot/i, '');
const botUsername = () => String(process.env.TELEGRAM_BOT_USERNAME || 'supermarket_flybot').replace(/^@/, '');
const webhookUrl = () => {
    const explicit = String(process.env.TELEGRAM_WEBHOOK_URL || '').trim();
    if (explicit) return explicit;
    const base = String(process.env.TELEGRAM_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    if (base) return `${base}/api/telegram/webhook`;
    return '';
};
const webhookSecret = () => String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
const TELEGRAM_FETCH_ATTEMPTS = 3;
const TELEGRAM_FETCH_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const redactTelegramSecrets = (text) => String(text || '')
    .replace(/bot\d+:[A-Za-z0-9_-]+/gi, 'bot<redacted>');

const telegramErrorCode = (error) => String(
    error?.code || error?.cause?.code || error?.errno || error?.cause?.errno || ''
);

const describeTelegramFetchError = (error, method = 'request') => {
    const raw = redactTelegramSecrets(error?.message || error || '');
    const code = telegramErrorCode(error);
    const causeMsg = redactTelegramSecrets(error?.cause?.message || '');
    const timedOut = error?.name === 'AbortError'
        || code === 'ABORT_ERR'
        || /aborted|timeout|hết giờ/i.test(`${raw} ${causeMsg}`);
    if (timedOut) {
        return `Telegram ${method} hết giờ (timeout${code ? ` ${code}` : ''}) — mạng chậm hoặc api.telegram.org bị chặn.`;
    }
    const byCode = {
        ENOTFOUND: `Telegram ${method} lỗi DNS ENOTFOUND — không phân giải được api.telegram.org.`,
        EAI_AGAIN: `Telegram ${method} lỗi DNS EAI_AGAIN — DNS tạm thời thất bại.`,
        ECONNREFUSED: `Telegram ${method} lỗi ECONNREFUSED — bị từ chối kết nối tới api.telegram.org.`,
        ECONNRESET: `Telegram ${method} lỗi ECONNRESET — kết nối bị cắt (firewall / ISP / proxy).`,
        ETIMEDOUT: `Telegram ${method} lỗi ETIMEDOUT — hết giờ kết nối tới api.telegram.org.`,
        ENETUNREACH: `Telegram ${method} lỗi ENETUNREACH — không tới được mạng Telegram.`,
        EHOSTUNREACH: `Telegram ${method} lỗi EHOSTUNREACH — không tới được máy chủ Telegram.`,
        CERT_HAS_EXPIRED: `Telegram ${method} lỗi SSL CERT_HAS_EXPIRED.`,
        UNABLE_TO_VERIFY_LEAF_SIGNATURE: `Telegram ${method} lỗi SSL — không xác thực được chứng chỉ.`,
        ERR_TLS_CERT_ALTNAME_INVALID: `Telegram ${method} lỗi SSL — tên chứng chỉ không khớp.`,
        EPROTO: `Telegram ${method} lỗi SSL/TLS EPROTO.`,
        UND_ERR_CONNECT_TIMEOUT: `Telegram ${method} lỗi UND_ERR_CONNECT_TIMEOUT — hết giờ kết nối.`,
        UND_ERR_SOCKET: `Telegram ${method} lỗi UND_ERR_SOCKET — socket Telegram bị đóng.`
    };
    if (code && byCode[code]) return byCode[code];
    const detail = [code && `code ${code}`, causeMsg && causeMsg !== raw ? causeMsg : '']
        .filter(Boolean)
        .join(', ');
    if (/fetch failed/i.test(raw)) {
        return `Telegram ${method} không gọi được api.telegram.org (fetch failed${detail ? ` — ${detail}` : ''}).`;
    }
    return detail ? `${raw} (${detail})` : raw;
};

const isRetryableTelegramNetworkError = (error) => {
    const msg = String(error?.message || '');
    if (/không hợp lệ|Unauthorized|401|409|Conflict|process bot khác/i.test(msg)) return false;
    const code = telegramErrorCode(error);
    return /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|UND_ERR|EPROTO|CERT_|ABORT|fetch failed|hết giờ|timeout|socket/i
        .test(`${code} ${msg}`);
};

const timeoutForTelegramMethod = (method, payload = {}, options = {}) => {
    if (options.timeoutMs != null) return Number(options.timeoutMs) || TELEGRAM_FETCH_TIMEOUT_MS;
    if (method === 'getUpdates') return (Number(payload.timeout) || 0) * 1000 + 10000;
    return TELEGRAM_FETCH_TIMEOUT_MS;
};

const wrapTelegramFetchError = (error, method) => {
    const wrapped = new Error(describeTelegramFetchError(error, method));
    wrapped.code = telegramErrorCode(error) || error?.name;
    wrapped.cause = error?.cause || error;
    return wrapped;
};

const fetchTelegram = async (url, init, options = {}) => {
    const method = options.apiMethod || 'request';
    const attempts = options.retries != null ? Number(options.retries) : TELEGRAM_FETCH_ATTEMPTS;
    const timeoutMs = timeoutForTelegramMethod(method, options.payload || {}, options);
    const fetchFn = options.fetchFn || runtime.fetchFn;
    let lastError;
    for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        if (typeof timer.unref === 'function') timer.unref();
        try {
            return await fetchFn(url, { ...init, signal: controller.signal });
        } catch (error) {
            lastError = wrapTelegramFetchError(error, method);
            const canRetry = attempt < attempts && isRetryableTelegramNetworkError(error);
            if (!canRetry) throw lastError;
            await sleep(250 * attempt);
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastError;
};

const messageEffectId = (kind) => {
    const key = String(kind || '').trim().toUpperCase();
    if (!key) return '';
    return String(process.env[`TELEGRAM_EFFECT_${key}_ID`] || '').trim();
};

const getTelegramStatus = () => status;
const setTelegramStatus = value => { status = value; };

const roleKey = name => String(name || '').trim().toLocaleLowerCase('vi-VN');

const codesForRole = role => ROLE_PERMISSION_CODES[roleKey(role)] || [];

const roleHasUc = (role, codes) => {
    const set = codesForRole(role);
    return (Array.isArray(codes) ? codes : [codes]).some(code => set.includes(code));
};

const telegramApi = async (method, payload = {}, options = {}) => {
    const token = options.token || botToken();
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN trống');
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await fetchTelegram(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }, {
        fetchFn: options.fetchFn,
        apiMethod: method,
        payload,
        retries: options.retries,
        timeoutMs: options.timeoutMs
    });
    const data = typeof response.json === 'function' ? await response.json() : response;
    if (data && data.ok === false) {
        const code = data.error_code || response.status;
        const desc = String(data.description || '');
        if (code === 401 || /unauthorized/i.test(desc)) {
            throw new Error('Token Telegram không hợp lệ — kiểm tra TELEGRAM_BOT_TOKEN trong server/.env');
        }
        if (code === 409 || /conflict/i.test(desc)) {
            throw new Error('Telegram 409 Conflict — còn process bot khác, tắt npm start cũ');
        }
        throw new Error(data.description || `Telegram ${method} thất bại`);
    }
    return data;
};

const sendMessage = async (chatId, text, extra = {}) => {
    if (!chatId || !text) return { skipped: true };
    const {
        parse_mode = 'HTML', disable_notification, reply_markup,
        effect, message_effect_id, ...rest
    } = extra;
    const chunks = splitTelegramText(sanitizeJsDateText(String(text)));
    const effectId = String(message_effect_id || messageEffectId(effect)).trim();
    let last = { skipped: true };
    for (let index = 0; index < chunks.length; index += 1) {
        const payload = {
            chat_id: chatId,
            text: chunks[index],
            disable_web_page_preview: true,
            parse_mode,
            ...rest
        };
        if (disable_notification === true) payload.disable_notification = true;
        else payload.disable_notification = false;
        if (effectId && index === chunks.length - 1) payload.message_effect_id = effectId;
        if (reply_markup && index === chunks.length - 1) payload.reply_markup = reply_markup;
        last = await telegramApi('sendMessage', payload);
    }
    return last;
};

const sendChatAction = async (chatId, action = 'typing') => {
    if (!chatId) return { skipped: true };
    return telegramApi('sendChatAction', { chat_id: chatId, action });
};

const answerCallbackQuery = async (callbackQueryId, text = '', options = {}) => {
    if (!callbackQueryId) return { skipped: true };
    const payload = { callback_query_id: callbackQueryId };
    if (text) payload.text = String(text).slice(0, 200);
    if (options.show_alert === true) payload.show_alert = true;
    if (options.cache_time != null) payload.cache_time = Number(options.cache_time) || 0;
    return telegramApi('answerCallbackQuery', payload);
};

const editMessageText = async (chatId, messageId, text, extra = {}) => {
    if (!chatId || !messageId || !text) return { skipped: true };
    const clean = sanitizeJsDateText(String(text));
    if (clean.length > 3900) return { skipped: true, reason: 'too-long' };
    const { parse_mode = 'HTML', reply_markup, ...rest } = extra;
    const payload = {
        chat_id: chatId,
        message_id: messageId,
        text: clean,
        parse_mode,
        link_preview_options: { is_disabled: true },
        ...rest
    };
    if (reply_markup) payload.reply_markup = reply_markup;
    return telegramApi('editMessageText', payload);
};

const editMessageReplyMarkup = async (chatId, messageId, replyMarkup = { inline_keyboard: [] }) => {
    if (!chatId || !messageId) return { skipped: true };
    return telegramApi('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup
    });
};

const setMessageReaction = async (chatId, messageId, emoji = '👍', { isBig = true } = {}) => {
    if (!chatId || !messageId) return { skipped: true };
    return telegramApi('setMessageReaction', {
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: 'emoji', emoji }],
        is_big: Boolean(isBig)
    });
};

const sendPhotoMultipart = async (chatId, buffer, filename, extra = {}) => {
    const caption = String(extra.caption || '').slice(0, 1000);
    const quiet = extra.disable_notification === true;
    const form = new FormData();
    form.append('chat_id', String(chatId));
    const file = typeof File === 'function'
        ? new File([buffer], filename, { type: extra.mime || 'image/png' })
        : new Blob([buffer], { type: extra.mime || 'image/png' });
    form.append('photo', file, filename);
    if (caption) form.append('caption', caption);
    form.append('parse_mode', extra.parse_mode || 'HTML');
    form.append('disable_notification', quiet ? 'true' : 'false');
    const token = extra.token || botToken();
    const response = await fetchTelegram(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        body: form
    }, {
        fetchFn: extra.fetchFn,
        apiMethod: 'sendPhoto',
        retries: extra.retries,
        timeoutMs: extra.timeoutMs
    });
    const data = typeof response.json === 'function' ? await response.json() : response;
    if (data && data.ok === false) throw new Error(data.description || 'sendPhoto thất bại');
    return data;
};

const sendPhoto = async (chatId, photo, extra = {}) => {
    if (!chatId || !photo) return { skipped: true };
    if (isProductImagePath(photo) && extra.allowProductImage !== true) {
        return { skipped: true, reason: 'product-image-blocked' };
    }
    try {
        const {
            isPublicHttpUrl, localUploadPath, publicFileUrl, describeLocalPhoto
        } = require('./telegramApprove');
        const caption = String(extra.caption || '').slice(0, 1000);
        const quiet = extra.disable_notification === true;
        const buffer = Buffer.isBuffer(photo)
            ? photo
            : (photo && Buffer.isBuffer(photo.buffer) ? photo.buffer : null);
        if (buffer && buffer.length) {
            const filename = (typeof photo === 'object' && photo.filename)
                || extra.filename
                || 'chung-tu.png';
            return sendPhotoMultipart(chatId, buffer, filename, {
                ...extra, caption, disable_notification: quiet, mime: photo.mime
            });
        }
        const publicUrl = typeof photo === 'string' ? (publicFileUrl(photo) || (isPublicHttpUrl(photo) ? photo : '')) : '';
        if (publicUrl) {
            return telegramApi('sendPhoto', {
                chat_id: chatId,
                photo: publicUrl,
                caption,
                parse_mode: extra.parse_mode || 'HTML',
                disable_notification: quiet
            });
        }
        const stored = typeof photo === 'string' ? photo : photo.path;
        if (isProductImagePath(stored) && extra.allowProductImage !== true) {
            return { skipped: true, reason: 'product-image-blocked' };
        }
        const abs = localUploadPath(stored);
        if (abs) {
            const fs = require('node:fs');
            const path = require('node:path');
            if (fs.existsSync(abs)) {
                const buf = fs.readFileSync(abs);
                return sendPhotoMultipart(chatId, buf, path.basename(abs), {
                    ...extra, caption, disable_notification: quiet, mime: 'image/jpeg'
                });
            }
        }
        await sendMessage(chatId, describeLocalPhoto({ path: stored, name: String(stored || '').split(/[/\\]/).pop() }), {
            disable_notification: quiet
        });
        return { described: true };
    } catch (error) {
        runtime.log('Telegram photo:', error.message);
        try {
            await sendMessage(chatId, 'Xem ảnh / chứng từ trên Fly (Telegram không tải được file máy LAN).', extra);
        } catch { /* không crash POS */ }
        return { skipped: true, error: error.message };
    }
};

const sendDocumentMultipart = async (chatId, buffer, filename, extra = {}) => {
    const caption = String(extra.caption || '').slice(0, 1000);
    const quiet = extra.disable_notification === true;
    const form = new FormData();
    form.append('chat_id', String(chatId));
    const mime = extra.mime || 'application/pdf';
    const file = typeof File === 'function'
        ? new File([buffer], filename, { type: mime })
        : new Blob([buffer], { type: mime });
    form.append('document', file, filename);
    if (caption) form.append('caption', caption);
    form.append('parse_mode', extra.parse_mode || 'HTML');
    form.append('disable_notification', quiet ? 'true' : 'false');
    const token = extra.token || botToken();
    const response = await fetchTelegram(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: 'POST',
        body: form
    }, {
        fetchFn: extra.fetchFn,
        apiMethod: 'sendDocument',
        retries: extra.retries,
        timeoutMs: extra.timeoutMs != null ? extra.timeoutMs : 45000
    });
    const data = typeof response.json === 'function' ? await response.json() : response;
    if (data && data.ok === false) throw new Error(data.description || 'sendDocument thất bại');
    return data;
};

const sendDocument = async (chatId, document, extra = {}) => {
    if (!chatId || !document) return { skipped: true };
    const buffer = Buffer.isBuffer(document)
        ? document
        : (document && Buffer.isBuffer(document.buffer) ? document.buffer : null);
    if (!buffer || !buffer.length) return { skipped: true, reason: 'empty-document' };
    const filename = (typeof document === 'object' && document.filename)
        || extra.filename
        || 'chung-tu.pdf';
    const caption = extra.caption != null ? extra.caption : (document.caption || '');
    return sendDocumentMultipart(chatId, buffer, filename, {
        ...extra,
        caption,
        mime: document.mime || extra.mime || 'application/pdf'
    });
};

const request = (pool, sqlMod) => (pool.request ? pool.request() : new sqlMod.Request(pool));

const lastPushAt = async (pool, loai, ma) => {
    const { sql } = db();
    try {
        const result = await request(pool, sql)
            .input('Loai', sql.NVarChar, loai)
            .input('Ma', sql.VarChar, String(ma).slice(0, 50))
            .query(`SELECT LanGuiCuoi FROM TelegramPushLog WHERE LoaiSuKien=@Loai AND MaChungTu=@Ma`);
        return result.recordset[0]?.LanGuiCuoi || null;
    } catch (error) {
        runtime.log('Telegram PushLog đọc:', error.message);
        return null;
    }
};

const shouldSkipPush = async (pool, loai, ma, { once = false, now = runtime.now() } = {}) => {
    const keys = relatedPushKeys(loai, ma);
    for (const key of keys) {
        if (inflightPushes.has(`${key.loai}|${key.ma}`)) return true;
        const last = await lastPushAt(pool, key.loai, key.ma);
        if (!last) continue;
        if (once) return true;
        if (isWithinRateLimit(last, now, PUSH_WINDOW_MS)) return true;
    }
    return false;
};

const markPushSent = async (pool, loai, ma) => {
    const { sql } = db();
    try {
        await request(pool, sql)
            .input('Loai', sql.NVarChar, loai)
            .input('Ma', sql.VarChar, String(ma).slice(0, 50))
            .query(`
                MERGE TelegramPushLog AS t
                USING (SELECT @Loai AS LoaiSuKien, @Ma AS MaChungTu) AS s
                ON t.LoaiSuKien = s.LoaiSuKien AND t.MaChungTu = s.MaChungTu
                WHEN MATCHED THEN UPDATE SET LanGuiCuoi = GETDATE()
                WHEN NOT MATCHED THEN INSERT (LoaiSuKien, MaChungTu, LanGuiCuoi)
                    VALUES (s.LoaiSuKien, s.MaChungTu, GETDATE());`);
    } catch (error) {
        runtime.log('Telegram PushLog ghi:', error.message);
    }
};

const boundRecipients = async (pool, { roles, ucAny, maNV } = {}) => {
    const { sql } = db();
    const recipientSql = (withLang) => `
            SELECT d.MaNV, d.ChatId, d.MaTK, d.Bat, ${withLang ? 'd.NgoonNgu,' : 'NULL AS NgoonNgu,'} n.TenNV, v.TenVaiTro, t.TenDangNhap, t.TrangThai AS TrangThaiTK, t.MaVaiTro
            FROM TelegramDangKy d
            JOIN NhanVien n ON n.MaNV = d.MaNV
            JOIN TaiKhoan t ON t.MaNV = d.MaNV AND (d.MaTK IS NULL OR t.MaTK = d.MaTK)
            JOIN VaiTro v ON v.MaVaiTro = t.MaVaiTro
            WHERE d.Bat = 1 AND d.ChatId IS NOT NULL AND t.TrangThai = 1`;
    try {
        let result;
        try {
            result = await request(pool, sql).query(recipientSql(true));
        } catch (error) {
            if (!/NgoonNgu/i.test(error.message || '')) throw error;
            result = await request(pool, sql).query(recipientSql(false));
        }
        let rows = result.recordset || [];
        if (maNV) {
            const ids = new Set((Array.isArray(maNV) ? maNV : [maNV]).map(String));
            rows = rows.filter(row => ids.has(String(row.MaNV)));
        }
        if (roles?.length) {
            const wanted = new Set(roles.map(roleKey));
            rows = rows.filter(row => wanted.has(roleKey(row.TenVaiTro)));
        }
        if (ucAny?.length) {
            rows = rows.filter(row => roleHasUc(row.TenVaiTro, ucAny));
        }
        return rows.filter(row => isManagerRole(row.TenVaiTro));
    } catch (error) {
        runtime.log('Telegram recipients:', error.message);
        return [];
    }
};

const INBOX_ID_BY_EVENT = {
    PC_CHO_DUYET: ma => `pc:${ma}`,
    PO_CHO_DUYET: ma => `po:${ma}`,
    PX_CHO_DUYET: ma => `px:${ma}`,
    KK_CHO_DUYET: ma => `kk:${ma}`,
    DT_CHO_DUYET: ma => `dt:${ma}`,
    CHAM_CONG: ma => `cc:${ma}`,
    PCL_CHO_DUYET: ma => `pcl:${ma}`
};

const deriveInboxId = (loai, ma) => {
    const fn = INBOX_ID_BY_EVENT[loai];
    return fn ? fn(String(ma).slice(0, 40)) : null;
};

const EVENT_BY_INBOX_PREFIX = {
    pc: 'PC_CHO_DUYET',
    po: 'PO_CHO_DUYET',
    px: 'PX_CHO_DUYET',
    kk: 'KK_CHO_DUYET',
    dt: 'DT_CHO_DUYET',
    cc: 'CHAM_CONG',
    pcl: 'PCL_CHO_DUYET'
};

const relatedPushKeys = (loai, ma) => {
    const id = String(ma ?? '').slice(0, 50);
    const keys = [{ loai, ma: id }];
    const inboxId = deriveInboxId(loai, id);
    if (inboxId) keys.push({ loai: 'INBOX', ma: String(inboxId).slice(0, 50) });
    if (loai === 'INBOX') {
        const match = id.match(/^([a-z]+):(.+)$/i);
        if (match && EVENT_BY_INBOX_PREFIX[match[1]]) {
            keys.push({ loai: EVENT_BY_INBOX_PREFIX[match[1]], ma: match[2].slice(0, 50) });
        }
    }
    return keys;
};

const attendancePushKey = (row = {}) => {
    const nv = String(row.MaNV || '').trim();
    const day = formatVnDate(row.NgayLam);
    const ca = String(row.TenCa || row.MaLoaiCa || '').trim();
    if (!nv || !day) return null;
    return `${nv}_${day}_${ca}`.slice(0, 50);
};

const SALE_OR_QUIET = /đăng nhập|đăng xuất|đổi mật khẩu|hoàn thành hóa đơn|lập hóa đơn nháp|thu tiền hóa đơn|hủy hóa đơn nháp|^telegram /i;
const INBOX_FRESH_MS = 12 * 60 * 1000;

const pushTo = async (pool, recipients, loai, ma, text, { once = false, extra = {} } = {}) => {
    if (!recipients.length || text == null || text === '') return { sent: 0, skipped: true };
    if (await shouldSkipPush(pool, loai, ma, { once })) return { sent: 0, skipped: true };
    const keys = relatedPushKeys(loai, ma);
    const tokens = keys.map(key => `${key.loai}|${key.ma}`);
    for (const token of tokens) inflightPushes.add(token);
    let sent = 0;
    try {
        for (const person of recipients) {
            try {
                const body = typeof text === 'function' ? text(person) : text;
                if (!body) continue;
                const extraOf = typeof extra === 'function' ? extra(person) : extra;
                await sendMessage(person.ChatId, body, { disable_notification: false, ...extraOf });
                sent += 1;
            } catch (error) {
                runtime.log('Telegram send:', error.message);
            }
        }
        if (sent) {
            for (const key of keys) await markPushSent(pool, key.loai, key.ma);
        }
    } finally {
        for (const token of tokens) inflightPushes.delete(token);
    }
    return { sent, skipped: false };
};

const one = async (pool, sqlText, inputs = {}) => {
    const { sql } = db();
    const req = request(pool, sql);
    for (const [name, spec] of Object.entries(inputs)) {
        req.input(name, spec.type, spec.value);
    }
    const result = await req.query(sqlText);
    return result.recordset?.[0] || null;
};

const many = async (pool, sqlText, inputs = {}) => {
    const { sql } = db();
    const req = request(pool, sql);
    for (const [name, spec] of Object.entries(inputs)) {
        req.input(name, spec.type, spec.value);
    }
    const result = await req.query(sqlText);
    return result.recordset || [];
};

const loadOperatingSummary = async (pool, dayIso) => {
    const { sql } = db();
    const window = operatingWindow(dayIso);
    const sales = await one(pool, `
        SELECT
            COALESCE((SELECT SUM(h.TongThanhToan) FROM HoaDon h
                WHERE h.TrangThai=N'Hoàn thành' AND h.NgayLap>=CONVERT(datetime,@From,120) AND h.NgayLap<CONVERT(datetime,@To,120)),0) DoanhThuHoaDon,
            COALESCE((SELECT COUNT(*) FROM HoaDon h
                WHERE h.TrangThai=N'Hoàn thành' AND h.NgayLap>=CONVERT(datetime,@From,120) AND h.NgayLap<CONVERT(datetime,@To,120)),0) SoHoaDon,
            COALESCE((SELECT SUM(ct.ThanhTienVon) FROM HoaDon hd JOIN ChiTietHoaDon ct ON ct.MaHD=hd.MaHD
                WHERE hd.TrangThai=N'Hoàn thành' AND hd.NgayLap>=CONVERT(datetime,@From,120) AND hd.NgayLap<CONVERT(datetime,@To,120)),0) GiaVonHoaDon
        `, {
        From: { type: sql.NVarChar, value: window.fromSql },
        To: { type: sql.NVarChar, value: window.toSql }
    });
    const returns = await one(pool, `
        WITH ChiTietTheoPhieu AS (
            SELECT MaDT,
                   SUM(CASE WHEN LoaiDong=N'Hàng khách trả' THEN ThanhTienVon ELSE 0 END) GiaVonHangTra,
                   SUM(CASE WHEN LoaiDong=N'Hàng giao đổi' THEN ThanhTienVon ELSE 0 END) GiaVonHangGiaoDoi
            FROM ChiTietDoiTra GROUP BY MaDT
        )
        SELECT COALESCE(SUM(dt.SoTienHoan),0) TienHoan,
               COALESCE(SUM(CASE WHEN ${RESTOCK_ACCEPTED_SQL} THEN ct.GiaVonHangTra ELSE 0 END),0) GiaVonHangTraNhapLai,
               COALESCE(SUM(ct.GiaVonHangGiaoDoi),0) GiaVonHangGiaoDoi
        FROM PhieuDoiTra dt LEFT JOIN ChiTietTheoPhieu ct ON ct.MaDT=dt.MaDT
        WHERE dt.TrangThai=N'Hoàn thành' AND dt.NgayHoan>=CONVERT(datetime,@From,120) AND dt.NgayHoan<CONVERT(datetime,@To,120)`, {
        From: { type: sql.NVarChar, value: window.fromSql },
        To: { type: sql.NVarChar, value: window.toSql }
    }).catch(() => ({ TienHoan: 0, GiaVonHangTraNhapLai: 0, GiaVonHangGiaoDoi: 0 }));
    const pay = await one(pool, `
        SELECT
            COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Tiền mặt' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TienMat,
            COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'QR' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TienQR,
            COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Thẻ' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TienThe,
            COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Chuyển khoản' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TienCK,
            SUM(CASE WHEN tt.TrangThai=N'Chờ xác nhận' THEN 1 ELSE 0 END) ChoXacNhan
        FROM ThanhToan tt
        JOIN HoaDon hd ON hd.MaHD=tt.MaHD
        WHERE hd.TrangThai=N'Hoàn thành' AND tt.NgayTT>=CONVERT(datetime,@From,120) AND tt.NgayTT<CONVERT(datetime,@To,120)`, {
        From: { type: sql.NVarChar, value: window.fromSql },
        To: { type: sql.NVarChar, value: window.toSql }
    }).catch(() => ({ TienMat: 0, TienQR: 0, TienThe: 0, TienCK: 0, ChoXacNhan: 0 }));
    const alerts = await one(pool, `
        SELECT
            (SELECT COUNT(*) FROM CongNoPhaiTra WHERE SoTienConLai>0
                AND HanThanhToan<=DATEADD(day,7,CONVERT(date,CONVERT(datetime,@To,120)))) CongNoDenHan,
            (SELECT COUNT(*) FROM SanPham sp LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
                WHERE sp.TrangThai=N'Đang bán' AND ISNULL(tk.SLTon,0)<=sp.TonKhoToiThieu) SpCanBoSung,
            (SELECT COUNT(*) FROM CaLamViec WHERE TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL) CaDangMo
        `, { To: { type: sql.NVarChar, value: window.toSql } }).catch(() => ({}));
    const lech = await many(pool, `
        SELECT MaCa FROM CaLamViec
        WHERE TrangThai=N'Đã chốt' AND ThoiGianKetThuc>=CONVERT(datetime,@From,120) AND ThoiGianKetThuc<CONVERT(datetime,@To,120)
          AND ISNULL(TienThucNop,0)<>ISNULL(TienMatHeThong,0)`, {
        From: { type: sql.NVarChar, value: window.fromSql },
        To: { type: sql.NVarChar, value: window.toSql }
    }).catch(() => []);
    const profit = calculateGrossProfit({
        DoanhThuHoaDon: sales?.DoanhThuHoaDon,
        TienHoan: returns?.TienHoan,
        GiaVonHoaDon: sales?.GiaVonHoaDon,
        GiaVonHangTraNhapLai: returns?.GiaVonHangTraNhapLai,
        GiaVonHangGiaoDoi: returns?.GiaVonHangGiaoDoi
    });
    return {
        operatingDay: dayIso,
        ...profit,
        SoHoaDon: Number(sales?.SoHoaDon || 0),
        TienMat: Number(pay?.TienMat || 0),
        TienQR: Number(pay?.TienQR || 0),
        TienThe: Number(pay?.TienThe || 0),
        TienCK: Number(pay?.TienCK || 0),
        choXacNhan: Number(pay?.ChoXacNhan || 0),
        congNoDenHan: Number(alerts?.CongNoDenHan || 0),
        spCanBoSung: Number(alerts?.SpCanBoSung || 0),
        caDangMo: Number(alerts?.CaDangMo || 0),
        caLech: lech.map(row => row.MaCa)
    };
};

const loadOperatingDetails = async (pool, dayIso) => {
    const { sql } = db();
    const window = operatingWindow(dayIso);
    const invoices = await many(pool, `
        SELECT TOP 8 h.MaHD, h.TongThanhToan, h.NgayLap
        FROM HoaDon h
        WHERE h.TrangThai=N'Hoàn thành'
          AND h.NgayLap>=CONVERT(datetime,@From,120) AND h.NgayLap<CONVERT(datetime,@To,120)
        ORDER BY h.TongThanhToan DESC`, {
        From: { type: sql.NVarChar, value: window.fromSql },
        To: { type: sql.NVarChar, value: window.toSql }
    }).catch(() => []);
    const restock = await many(pool, `
        SELECT TOP 8 sp.TenSP, ISNULL(tk.SLTon,0) SLTon, sp.TonKhoToiThieu
        FROM SanPham sp LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
        WHERE sp.TrangThai=N'Đang bán' AND ISNULL(tk.SLTon,0)<=sp.TonKhoToiThieu
        ORDER BY (sp.TonKhoToiThieu-ISNULL(tk.SLTon,0)) DESC, sp.TenSP`).catch(() => []);
    return { invoices, restock };
};

const notifyShiftClosed = async (payload = {}) => {
    const pool = await getPool();
    const { sql } = db();
    const maCa = payload.MaCa || payload.maCa;
    if (!maCa) return;
    let row = { ...payload, MaCa: maCa };
    if (row.ChenhLech == null || !row.TenNV) {
        const loaded = await one(pool, `
            SELECT ca.MaCa, ca.MaQuay, ca.MaNV, ca.TienMatHeThong, ca.TienThucNop,
                   ISNULL(ca.TienThucNop,0)-ISNULL(ca.TienMatHeThong,0) ChenhLech,
                   nv.TenNV
            FROM CaLamViec ca JOIN NhanVien nv ON nv.MaNV=ca.MaNV
            WHERE ca.MaCa=@MaCa`, { MaCa: { type: sql.VarChar, value: maCa } });
        row = { ...loaded, ...row, MaCa: maCa };
    }
    const lech = Number(row.ChenhLech || 0);
    if (lech !== 0) {
        const text = buildA2Message(row);
        const rec = await boundRecipients(pool, { roles: ['Quản lý', 'Kế toán'], ucAny: ['UC10', 'UC29'] });
        await pushTo(pool, rec, 'LECH_KET', maCa, text);
        await markPushSent(pool, 'CA_CHOT', maCa);
        return;
    }
    const kt = await boundRecipients(pool, { roles: ['Kế toán'], ucAny: ['UC29'] });
    await pushTo(pool, kt, 'CA_CHOT', maCa, buildB12Message(row));
};

const notifyAttendancePending = async (payload = {}) => {
    const pool = await getPool();
    const { sql } = db();
    const maNV = payload.MaNV || payload.maNV;
    const row = await one(pool, `
        SELECT TOP 1 cc.MaChamCong, n.TenNV, lc.TenCa, l.NgayLam, l.MaNV
        FROM ChamCong cc
        JOIN LichLamViec l ON l.MaLich=cc.MaLich
        JOIN NhanVien n ON n.MaNV=l.MaNV
        JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
        WHERE l.MaNV=@MaNV AND cc.TrangThai=N'Chờ duyệt'
        ORDER BY cc.ThoiGianRa DESC`, { MaNV: { type: sql.VarChar, value: maNV } }).catch(() => null);
    if (!row) return;
    const ql = await boundRecipients(pool, { roles: ['Quản lý'], ucAny: ['UC32'] });
    const ma = row.MaChamCong || attendancePushKey({ ...row, MaNV: row.MaNV || maNV });
    if (!ma) return;
    const fingerprint = attendancePushKey({ ...row, MaNV: row.MaNV || maNV });
    if (fingerprint && fingerprint !== String(ma)) {
        if (await shouldSkipPush(pool, 'CHAM_CONG', fingerprint)) return;
    }
    const result = await pushPendingCard(pool, ql, 'CHAM_CONG', ma, 'cc', buildAttendancePendingMessage({
        ...row, MaNV: row.MaNV || maNV
    }));
    if (result.sent && fingerprint && fingerprint !== String(ma)) {
        await markPushSent(pool, 'CHAM_CONG', fingerprint);
    }
};

const pushPendingCard = async (pool, recipients, loai, ma, kind, fallbackText) => {
    try {
        const { composePendingPush } = require('./telegramApprove');
        const card = await composePendingPush(pool, kind, ma);
        return pushTo(pool, recipients, loai, ma, card.text || fallbackText, { extra: card.extra });
    } catch (error) {
        runtime.log('Telegram pending card:', error.message);
        return pushTo(pool, recipients, loai, ma, fallbackText);
    }
};

const handlers = {};

handlers['Lập và gửi duyệt Phiếu chi'] = handlers['Chỉnh sửa và gửi lại Phiếu chi'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `
        SELECT pc.MaPhieu, pc.SoTien, pc.PhuongThuc, pc.TrangThai, pc.MaCongNo,
               ncc.TenNCC, cn.MaCNPTra, cn.HanThanhToan, nv.TenNV AS NguoiLap
        FROM PhieuChi pc
        LEFT JOIN CongNoPhaiTra cn ON cn.MaCNPTra=pc.MaCongNo
        LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=COALESCE(pc.MaNCC, cn.MaNCC)
        LEFT JOIN NhanVien nv ON nv.MaNV=pc.MaNV
        WHERE pc.MaPhieu=@Id`, { Id: { type: sql.VarChar, value: ctx.recordId } });
    if (!row) return;
    const ql = await boundRecipients(ctx.pool, { roles: ['Quản lý'], ucAny: ['UC09'] });
    await pushPendingCard(ctx.pool, ql, 'PC_CHO_DUYET', row.MaPhieu, 'pc', buildA1Message(row));
};

handlers['Đóng ca bán hàng'] = async (ctx) => {
    await notifyShiftClosed({ MaCa: ctx.recordId });
    if (ctx.user?.MaNV) await notifyAttendancePending({ MaNV: ctx.user.MaNV });
};

handlers['Gửi duyệt Đơn mua hàng'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `
        SELECT po.MaPO, ncc.TenNCC, nv.TenNV
        FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
        JOIN NhanVien nv ON nv.MaNV=po.MaNV_Lap WHERE po.MaPO=@Id`,
        { Id: { type: sql.VarChar, value: ctx.recordId } });
    if (!row) return;
    const ql = await boundRecipients(ctx.pool, { roles: ['Quản lý'], ucAny: ['UC05'] });
    await pushPendingCard(ctx.pool, ql, 'PO_CHO_DUYET', row.MaPO, 'po', eventCard('ĐƠN MUA CHỜ DUYỆT', {
        Mã: row.MaPO, NCC: row.TenNCC, 'Người lập': row.TenNV
    }));
};

handlers['Gửi duyệt Phiếu xuất kho'] = handlers['Lập và gửi duyệt Phiếu xuất kho'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `SELECT MaPX, LoaiXuat FROM PhieuXuat WHERE MaPX=@Id`,
        { Id: { type: sql.VarChar, value: ctx.recordId } });
    if (!row) return;
    const ql = await boundRecipients(ctx.pool, { roles: ['Quản lý'], ucAny: ['UC06'] });
    await pushPendingCard(ctx.pool, ql, 'PX_CHO_DUYET', row.MaPX, 'px', eventCard('PHIẾU XUẤT CHỜ DUYỆT', {
        Mã: row.MaPX, 'Loại xuất': row.LoaiXuat || '—'
    }));
};

handlers['Gửi duyệt điều chỉnh tồn'] = async (ctx) => {
    const ql = await boundRecipients(ctx.pool, { roles: ['Quản lý'], ucAny: ['UC07'] });
    await pushPendingCard(ctx.pool, ql, 'KK_CHO_DUYET', ctx.recordId, 'kk', eventCard('KIỂM KÊ CHỜ DUYỆT ĐIỀU CHỈNH', {
        Mã: ctx.recordId
    }));
};

handlers['Kiểm tra hàng đổi trả'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `SELECT MaDT, HinhThucXuLy FROM PhieuDoiTra WHERE MaDT=@Id`,
        { Id: { type: sql.VarChar, value: ctx.recordId } });
    if (!row) return;
    const ql = await boundRecipients(ctx.pool, { roles: ['Quản lý'], ucAny: ['UC08'] });
    await pushPendingCard(ctx.pool, ql, 'DT_CHO_DUYET', row.MaDT, 'dt', eventCard('ĐỔI TRẢ CHỜ DUYỆT', {
        Mã: row.MaDT, 'Hình thức': row.HinhThucXuLy || '—'
    }));
};

handlers['Gửi đề nghị mua hàng'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `
        SELECT dn.MaDN, nv.TenNV FROM DeNghiMuaHang dn
        JOIN NhanVien nv ON nv.MaNV=dn.MaNV_Lap WHERE dn.MaDN=@Id`,
        { Id: { type: sql.VarChar, value: ctx.recordId } });
    if (!row) return;
    const mh = await boundRecipients(ctx.pool, { roles: ['Nhân viên mua hàng'] });
    await pushTo(ctx.pool, mh, 'DN_MOI', row.MaDN, eventCard('ĐỀ NGHỊ MUA TỪ KHO', {
        Mã: row.MaDN, 'Người lập': row.TenNV
    }));
};

handlers['Phê duyệt Đơn mua hàng'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `
        SELECT po.MaPO, po.MaNV_Lap, ncc.TenNCC
        FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC WHERE po.MaPO=@Id`,
        { Id: { type: sql.VarChar, value: ctx.recordId } });
    if (!row) return;
    const rec = await boundRecipients(ctx.pool, { maNV: row.MaNV_Lap });
    await pushTo(ctx.pool, rec, 'PO_DA_DUYET', row.MaPO, eventCard('ĐƠN ĐÃ DUYỆT, GỬI NCC', {
        Mã: row.MaPO, NCC: row.TenNCC
    }));
};

handlers['Yêu cầu chỉnh sửa Đơn mua hàng'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `
        SELECT po.MaPO, po.MaNV_Lap, po.LyDoTuChoi, ncc.TenNCC
        FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC WHERE po.MaPO=@Id`,
        { Id: { type: sql.VarChar, value: ctx.recordId } });
    if (!row) return;
    const rec = await boundRecipients(ctx.pool, { maNV: row.MaNV_Lap });
    await pushTo(ctx.pool, rec, 'PO_CAN_CHINH', row.MaPO, eventCard('ĐƠN CẦN CHỈNH', {
        Mã: row.MaPO, NCC: row.TenNCC, 'Lý do': row.LyDoTuChoi || '—'
    }));
};

handlers['Yêu cầu bổ sung đề nghị mua hàng'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `SELECT MaDN, MaNV_Lap, LyDo FROM DeNghiMuaHang WHERE MaDN=@Id`,
        { Id: { type: sql.VarChar, value: ctx.recordId } });
    if (!row) return;
    const rec = await boundRecipients(ctx.pool, { maNV: row.MaNV_Lap });
    await pushTo(ctx.pool, rec, 'DN_BO_SUNG', row.MaDN, eventCard('ĐỀ NGHỊ CẦN BỔ SUNG', {
        Mã: row.MaDN, 'Lý do': row.LyDo || '—'
    }));
};

handlers['Ghi nhận xe hàng đến kho'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `
        SELECT TOP 1 gh.MaTBGH, gh.MaPO, ncc.TenNCC
        FROM ThongBaoGiaoHang gh JOIN DonMuaHang po ON po.MaPO=gh.MaPO
        JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
        WHERE gh.MaPO=@Id OR CAST(gh.MaTBGH AS varchar(50))=@Id
        ORDER BY gh.NgayDen DESC`, { Id: { type: sql.VarChar, value: String(ctx.recordId) } }).catch(() => null);
    const tk = await boundRecipients(ctx.pool, { roles: ['Thủ kho'] });
    const ma = row?.MaPO || ctx.recordId;
    await pushTo(ctx.pool, tk, 'XE_DEN_KHO', ma, eventCard('XE GIAO ĐÃ ĐẾN KHO', {
        Đơn: row?.MaPO || ctx.recordId, NCC: row?.TenNCC || '—', 'Ghi chú': 'Tồn chưa tăng. Nhận và kiểm hàng trên Fly.'
    }));
};

handlers['Phê duyệt Phiếu xuất kho'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `SELECT MaPX, MaNV FROM PhieuXuat WHERE MaPX=@Id`,
        { Id: { type: sql.VarChar, value: ctx.recordId } });
    if (!row) return;
    const rec = await boundRecipients(ctx.pool, { maNV: row.MaNV });
    await pushTo(ctx.pool, rec, 'PX_DA_DUYET', row.MaPX, eventCard('PHIẾU XUẤT ĐÃ DUYỆT, CẦN XÁC NHẬN XUẤT', {
        Mã: row.MaPX
    }));
};

handlers['Từ chối điều chỉnh tồn'] = async (ctx) => {
    const tk = await boundRecipients(ctx.pool, { roles: ['Thủ kho'] });
    await pushTo(ctx.pool, tk, 'KK_TU_CHOI', ctx.recordId, eventCard('KIỂM KÊ BỊ TỪ CHỐI — ĐẾM LẠI', {
        Mã: ctx.recordId
    }));
};

handlers['Tiếp nhận hóa đơn Nhà cung cấp'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `
        SELECT hd.MaHDMH, hd.SoHoaDon, ncc.TenNCC
        FROM HoaDonMuaHang hd JOIN NhaCungCap ncc ON ncc.MaNCC=hd.MaNCC
        WHERE hd.MaHDMH=@Id`, { Id: { type: sql.VarChar, value: ctx.recordId } });
    if (!row) return;
    const kt = await boundRecipients(ctx.pool, { roles: ['Kế toán'], ucAny: ['UC27'] });
    await pushTo(ctx.pool, kt, 'HD_NCC', row.MaHDMH, eventCard('HÓA ĐƠN NCC CẦN ĐỐI CHIẾU', {
        'Số HĐ': row.SoHoaDon, NCC: row.TenNCC
    }));
};

handlers['Đối chiếu hóa đơn ba bên'] = async (ctx) => {
    if (!/chênh lệch/i.test(ctx.content || '') && !/chênh lệch/i.test(ctx.result || '')) return;
    const { sql } = db();
    const row = await one(ctx.pool, `
        SELECT hd.MaHDMH, hd.SoHoaDon, ncc.TenNCC
        FROM HoaDonMuaHang hd JOIN NhaCungCap ncc ON ncc.MaNCC=hd.MaNCC
        WHERE hd.MaHDMH=@Id`, { Id: { type: sql.VarChar, value: ctx.recordId } });
    const kt = await boundRecipients(ctx.pool, { roles: ['Kế toán'] });
    await pushTo(ctx.pool, kt, 'HD_LECH', ctx.recordId, eventCard('HÓA ĐƠN LỆCH, KHÔNG SINH CÔNG NỢ', {
        'Số HĐ': row?.SoHoaDon || ctx.recordId, NCC: row?.TenNCC || '—'
    }));
};

handlers['Phê duyệt Phiếu chi'] = async (ctx) => {
    const kt = await boundRecipients(ctx.pool, { roles: ['Kế toán'], ucAny: ['UC28'] });
    await pushTo(ctx.pool, kt, 'PC_DA_DUYET', ctx.recordId, eventCard('QL ĐÃ GIAO TIỀN, CẦN THANH TOÁN NCC', {
        Mã: ctx.recordId, 'Ghi chú': 'Cấm chi từ Telegram. Mở Fly.'
    }));
};

handlers['Từ chối Phiếu chi'] = async (ctx) => {
    const kt = await boundRecipients(ctx.pool, { roles: ['Kế toán'], ucAny: ['UC28'] });
    await pushTo(ctx.pool, kt, 'PC_TU_CHOI', ctx.recordId, eventCard('QL TỪ CHỐI PHIẾU CHI', {
        Mã: ctx.recordId,
        'Lý do': ctx.content || '—',
        'Ghi chú': 'Sửa và gửi lại trên Fly.'
    }));
};

handlers['Từ chối Phiếu chi lương'] = async (ctx) => {
    const kt = await boundRecipients(ctx.pool, { roles: ['Kế toán'], ucAny: ['UC33'] });
    await pushTo(ctx.pool, kt, 'PCL_TU_CHOI', ctx.recordId, eventCard('QL TỪ CHỐI PHIẾU CHI LƯƠNG', {
        Mã: ctx.recordId,
        'Lý do': ctx.content || '—',
        'Ghi chú': 'Sửa trên cùng phiếu. Mở Fly.'
    }));
};

const pushPaymentResult = async (ctx, outcome) => {
    const rec = await boundRecipients(ctx.pool, { roles: ['Quản lý', 'Kế toán'] });
    if (!rec.length) return;
    const loai = outcome === 'fail' ? 'PC_THAT_BAI' : 'PC_THANH_CONG';
    const fallbackTitle = outcome === 'fail' ? 'THANH TOÁN PHIẾU CHI THẤT BẠI' : 'THANH TOÁN PHIẾU CHI THÀNH CÔNG';
    const fallbackNote = outcome === 'fail' ? 'Nợ không đổi. Làm lại trên Fly.' : 'Đã tất toán (chỉ thông tin).';
    try {
        const { composePaymentPush } = require('./telegramApprove');
        const packed = await composePaymentPush(ctx.pool, ctx.recordId, {
            outcome,
            actor: ctx.user,
            content: ctx.content
        });
        await pushTo(ctx.pool, rec, loai, ctx.recordId, person => packed.textFor(person), {
            extra: packed.extra
        });
    } catch (error) {
        runtime.log('Telegram payment card:', error.message);
        await pushTo(ctx.pool, rec, loai, ctx.recordId, eventCard(fallbackTitle, {
            Mã: ctx.recordId, 'Ghi chú': fallbackNote
        }));
    }
};

handlers['Thanh toán Phiếu chi thành công'] = async (ctx) => {
    await pushPaymentResult(ctx, 'success');
};

handlers['Ghi nhận thanh toán Phiếu chi thất bại'] = async (ctx) => {
    await pushPaymentResult(ctx, 'fail');
};

handlers['Lập Phiếu chi lương'] = handlers['Gửi lại Phiếu chi lương'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `SELECT MaPhieu, MaKy FROM PhieuChiLuong WHERE MaPhieu=@Id`,
        { Id: { type: sql.VarChar, value: ctx.recordId } }).catch(() => ({ MaPhieu: ctx.recordId, MaKy: '' }));
    const ql = await boundRecipients(ctx.pool, { roles: ['Quản lý'], ucAny: ['UC32'] });
    await pushTo(ctx.pool, ql, 'PCL_CHO_DUYET', row.MaPhieu || ctx.recordId, eventCard('PHIẾU CHI LƯƠNG CHỜ DUYỆT VÀ GIAO QUỸ', {
        Mã: row.MaPhieu || ctx.recordId, Kỳ: row.MaKy || '—', 'Ghi chú': 'Không kèm số tiền từng NV.'
    }));
};

handlers['Duyệt Phiếu chi lương'] = handlers['Duyệt hàng loạt Phiếu chi lương'] = handlers['Giao quỹ lương chung'] = async (ctx) => {
    const kt = await boundRecipients(ctx.pool, { roles: ['Kế toán'], ucAny: ['UC33'] });
    await pushTo(ctx.pool, kt, 'PCL_CHO_CHI', ctx.recordId || 'QUY', eventCard('CHỜ CHI LƯƠNG TRÊN FLY', {
        'Ghi chú': 'Cấm chi từ Telegram.'
    }));
};

handlers['Phê duyệt đổi trả'] = async (ctx) => {
    const { sql } = db();
    const row = await one(ctx.pool, `
        SELECT MaDT, MaNV_Lap, MaNV_XuLy, HinhThucXuLy FROM PhieuDoiTra WHERE MaDT=@Id`,
        { Id: { type: sql.VarChar, value: ctx.recordId } });
    if (!row) return;
    const rec = await boundRecipients(ctx.pool, { maNV: [row.MaNV_XuLy, row.MaNV_Lap].filter(Boolean) });
    await pushTo(ctx.pool, rec, 'DT_DA_DUYET', row.MaDT, eventCard('ĐỔI TRẢ ĐÃ DUYỆT', {
        Mã: row.MaDT, 'Ghi chú': 'Xác nhận đổi/hoàn trên ca đang mở.'
    }));
};

const notifyWarehouseReportSubmitted = async (pool, maBC) => {
    const id = String(maBC || '').trim();
    if (!id || !pool) return { sent: 0 };
    const { composeWarehouseReportView } = require('./warehouseReportTelegram');
    const pack = await composeWarehouseReportView(pool, id, { mode: 'push', lang: 'vi' });
    if (!pack.texts.length) return { sent: 0 };
    const ql = await boundRecipients(pool, { roles: ['Quản lý'], ucAny: ['UC10'] });
    if (!ql.length) return { sent: 0 };
    const first = await pushTo(pool, ql, 'BCK_NOP', id, pack.texts[0], { extra: pack.extra });
    if (first.sent && pack.texts.length > 1) {
        for (const person of ql) {
            for (const text of pack.texts.slice(1)) {
                try { await sendMessage(person.ChatId, text, pack.extra); } catch (error) {
                    runtime.log('Telegram BCK:', error.message);
                }
            }
        }
    }
    return first;
};

handlers['Gửi báo cáo kho'] = async (ctx) => {
    await notifyWarehouseReportSubmitted(ctx.pool, ctx.recordId);
};

handlers['Gửi kế hoạch điều chỉnh lãi lỗ'] = async (ctx) => {
    const all = await boundRecipients(ctx.pool, {});
    await pushTo(ctx.pool, all, 'KE_HOACH_LO', ctx.recordId || operatingDayOf(runtime.now()), eventCard('KẾ HOẠCH ĐIỀU CHỈNH LÃI LỖ', {
        'Nội dung': ctx.content || 'Quản lý đã gửi kế hoạch tới cửa hàng.',
        'Ghi chú': 'Không chi tiền, không sửa lãi gộp.'
    }));
};

handlers['Xác nhận nhập kho'] = handlers['Xác nhận xuất kho'] = handlers['Hoàn thành hóa đơn'] = handlers['Hoàn thành hóa đơn bán hàng'] = async (ctx) => {
    const { sql } = db();
    const count = await one(ctx.pool, `
        SELECT COUNT(*) SoLuong FROM SanPham sp
        LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
        WHERE sp.TrangThai=N'Đang bán' AND ISNULL(tk.SLTon,0)<=sp.TonKhoToiThieu`);
    const so = Number(count?.SoLuong || 0);
    if (!so) return;
    const tk = await boundRecipients(ctx.pool, { roles: ['Thủ kho'], ucAny: ['UC15'] });
    const day = operatingDayOf(runtime.now());
    await pushTo(ctx.pool, tk, 'TON_THAP', day, eventCard('TỒN CẦN BỔ SUNG', {
        'Số mã': so,
        'Ghi chú': 'Dưới hoặc bằng định mức (không liệt kê từng SP).'
    }));
};

const pickInboxToPush = (items, { recordId, now }) => {
    const id = recordId ? String(recordId) : '';
    return (items || []).filter(item => {
        if (!item?.id) return false;
        const blob = `${item.id} ${item.title || ''} ${item.detail || ''}`;
        if (/hóa đơn bán|hoàn thành hóa đơn|^hd:|^hoadon:/i.test(blob)) return false;
        if (/báo cáo thủ kho|gửi báo cáo kho|BCK\d{8}/i.test(blob)) return false;
        if (id && (String(item.id).includes(id) || String(item.detail || '').includes(id))) return true;
        if (id) return false;
        const at = item.at ? new Date(item.at).getTime() : 0;
        return at && (now.getTime() - at) <= INBOX_FRESH_MS;
    }).slice(0, 5);
};

const onInboxChanged = async (meta = {}) => {
    const action = String(meta.action || '');
    if (SALE_OR_QUIET.test(action)) return { skipped: true, reason: 'quiet-or-sale' };
    try {
        const pool = meta.pool || await getPool();
        if (!pool) return { skipped: true };
        const managers = await boundRecipients(pool, { roles: ['Quản lý'], ucAny: ['UC10'] });
        if (!managers.length) return { skipped: true };
        const { listForRole } = require('./inboxService');
        const recordId = meta.recordId || meta.MaBanGhi || '';
        const now = runtime.now();
        let sent = 0;
        for (const person of managers) {
            const items = await listForRole(pool, {
                MaNV: person.MaNV,
                TenVaiTro: person.TenVaiTro,
                MaTK: person.MaTK,
                MaVaiTro: person.MaVaiTro
            });
            const picked = pickInboxToPush(items, { recordId, now });
            const lang = normalizeLang(person.NgoonNgu);
            for (const item of picked) {
                const { parseInboxKind, composePendingPush } = require('./telegramApprove');
                const parsed = parseInboxKind(item.id);
                let text = buildInboxPushMessage(item, lang);
                let extra = {};
                if (parsed) {
                    try {
                        const card = await composePendingPush(pool, parsed.kind, parsed.id, lang);
                        text = card.text || text;
                        extra = card.extra || {};
                    } catch { /* giữ mẫu inbox nếu hồ sơ lỗi */ }
                }
                const result = await pushTo(pool, [person], 'INBOX', String(item.id).slice(0, 50),
                    text, { extra });
                sent += result.sent || 0;
            }
        }
        return { sent };
    } catch (error) {
        runtime.log('Telegram inbox:', error.message);
        return { skipped: true, error: error.message };
    }
};

const onAudit = async (payload = {}) => {
    const action = String(payload.action || payload.HanhDong || '').trim();
    const handler = handlers[action];
    if (!handler) return;
    try {
        const pool = payload.pool || await getPool();
        await handler({
            pool,
            recordId: payload.recordId || payload.MaBanGhi,
            user: payload.user,
            content: payload.content,
            result: payload.result,
            table: payload.table
        });
    } catch (error) {
        runtime.log('Telegram onAudit:', error.message);
    }
};

const sendOperatingReport = async (now = runtime.now()) => {
    if (!isOperatingReportWindow(now)) return { skipped: true, reason: 'outside-window' };
    const pool = await getPool();
    const day = operatingDayForReport(now);
    if (await shouldSkipPush(pool, 'BAO_CAO_VAN_HANH', day, { once: true })) {
        return { skipped: true, reason: 'already-sent' };
    }
    const summary = await loadOperatingSummary(pool, day);
    const text = buildA3Message(summary, { sentAt: vnParts(now).date });
    const ql = await boundRecipients(pool, { roles: ['Quản lý'], ucAny: ['UC10'] });
    const result = await pushTo(pool, ql, 'BAO_CAO_VAN_HANH', day, text, { once: true });
    const overdue = Number(summary.congNoDenHan || 0);
    if (overdue) {
        const rec = await boundRecipients(pool, { roles: ['Kế toán', 'Quản lý'], ucAny: ['UC28', 'UC10'] });
        await pushTo(pool, rec, 'CONG_NO_QUA_HAN', day,
            eventCard('CÔNG NỢ QUÁ HẠN / ĐẾN HẠN', {
                Khoản: `${overdue} khoản còn phải trả`,
                'Ghi chú': 'Xem /debt trên chat riêng.'
            }),
            { once: true });
    }
    return result;
};

const sendMorningSchedule = async (now = runtime.now()) => {
    const { date } = vnParts(now);
    const inWindow = isMorningScheduleWindow(now);
    const hour = vnParts(now).hour;
    if (!inWindow && hour < 7) return { skipped: true };
    const pool = await getPool();
    if (await shouldSkipPush(pool, 'LICH_HOM_NAY', date, { once: true })) return { skipped: true };
    const { sql } = db();
    const people = await boundRecipients(pool, { ucAny: ['UC31'] });
    const staff = people.filter(row => roleKey(row.TenVaiTro) !== roleKey('Quản lý'));
    let sent = 0;
    for (const person of staff) {
        const row = await one(pool, `
            SELECT TOP 1 l.MaLich, lc.TenCa, cc.ThoiGianVao
            FROM LichLamViec l JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
            LEFT JOIN ChamCong cc ON cc.MaLich=l.MaLich
            WHERE l.MaNV=@MaNV AND l.TrangThai=N'Đã công bố'
              AND l.NgayLam=CONVERT(date, @Ngay)
            ORDER BY l.BatDauDuKien`, {
            MaNV: { type: sql.VarChar, value: person.MaNV },
            Ngay: { type: sql.Date, value: date }
        }).catch(() => null);
        if (!row || row.ThoiGianVao) continue;
        try {
            await sendMessage(person.ChatId, eventCard('LỊCH HÔM NAY', {
                Ca: row.TenCa,
                'Ghi chú': 'Hãy chấm công vào trước khi làm việc. (QL không nhận tin này.)'
            }));
            sent += 1;
        } catch (error) {
            runtime.log('Telegram lịch:', error.message);
        }
    }
    if (sent || staff.length) await markPushSent(pool, 'LICH_HOM_NAY', date);
    return { sent };
};

const tickCompanionJobs = async (now = runtime.now()) => {
    await notifySafely(() => sendOperatingReport(now));
    await notifySafely(() => sendMorningSchedule(now));
};

const startCompanionJobs = () => {
    if (cronTimer) return cronTimer;
    cronTimer = setInterval(() => tickCompanionJobs(), 60 * 1000);
    if (typeof cronTimer.unref === 'function') cronTimer.unref();
    tickCompanionJobs().catch(() => {});
    return cronTimer;
};

const stopCompanionJobs = () => {
    if (cronTimer) clearInterval(cronTimer);
    cronTimer = null;
};

module.exports = {
    notifySafely,
    setTelegramRuntime,
    resetTelegramRuntime,
    botToken,
    botUsername,
    webhookUrl,
    webhookSecret,
    describeTelegramFetchError,
    isRetryableTelegramNetworkError,
    TELEGRAM_FETCH_ATTEMPTS,
    TELEGRAM_FETCH_TIMEOUT_MS,
    getTelegramStatus,
    setTelegramStatus,
    telegramApi,
    sendMessage,
    sendChatAction,
    answerCallbackQuery,
    editMessageText,
    editMessageReplyMarkup,
    setMessageReaction,
    messageEffectId,
    sendPhoto,
    sendDocument,
    shouldSkipPush,
    relatedPushKeys,
    markPushSent,
    boundRecipients,
    loadOperatingSummary,
    loadOperatingDetails,
    onInboxChanged,
    pickInboxToPush,
    notifyShiftClosed,
    notifyAttendancePending,
    notifyWarehouseReportSubmitted,
    onAudit,
    sendOperatingReport,
    sendMorningSchedule,
    tickCompanionJobs,
    startCompanionJobs,
    stopCompanionJobs,
    roleHasUc,
    codesForRole,
    telegramAudience,
    formatMoney,
    maskChatId,
    PUSH_WINDOW_MS,
    getLivePool: getPool,
    db
};
