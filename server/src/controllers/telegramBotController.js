const crypto = require('node:crypto');
const { vietnamCalendar, currentPeriodDefaults, resolveReportingPeriod } = require('../services/reportingPeriod');
const {
    operatingDayOf, formatVnDate, vnParts
} = require('../services/telegramClock');
const {
    formatMoney, maskOtp, maskChatId, DENY_STRANGER,
    DENY_NOT_MANAGER, DENY_GROUP, t, normalizeLang, otpFailMessage, isManagerRole,
    langKeyboardRow, buildStartWelcomeUnbound, buildStartWelcomeBound,
    buildStartWelcomeGuest, buildHelpMessage, buildTodayMessage,
    buildRevenueMessage, buildFlyDashboard, buildDebtMessage, buildLowstockMessage,
    buildShiftsMessage, buildPaymentsMessage, buildPendingMessage, buildAlertsMessage,
    buildPayrollSummaryMessage, buildPayrollOneMessage,
    buildReportsMenu, reportsMenuKeyboard, buildPnlOnlyMessage,
    buildManagementReportMessage, managementReportKeyboard,
    replyKeyboard, matchReplyCommand, removeKeyboardMarkup, showMenuInlineKeyboard
} = require('../services/telegramMessages');
const teleGuide = require('../services/telegramGuide');
const teleAsk = require('../services/telegramAsk');
const teleDecision = require('../services/telegramApprove');
const teleDocs = require('../services/telegramDocuments');
const voucherImage = require('../services/telegramVoucherImage');
const notify = require('../services/telegramNotify');
const {
    ensureTelegramSchema,
    resetTelegramSchemaCache,
    isMissingNgoonNguColumn
} = require('../services/telegramSchema');

const OTP_TTL_MIN = 5;
const OTP_MAX_TRIES = 5;
const START_BIND_CHECK_MS = 4000;
const FORBIDDEN_TEXT = /\/(approve|reject|pay|complete)\b/;
const READ_CALLBACK = /^(cmd|cmd:)\w+$/i;
const PUBLIC_CALLBACKS = new Set(['linkguide', 'help']);
const pendingLangByChat = new Map();
const pendingAskByChat = new Map();
const kbBoundByChat = new Map();
const seenUpdateIds = new Map();
const PENDING_ASK_TTL_MS = 10 * 60 * 1000;
const SEEN_UPDATE_TTL_MS = 2 * 60 * 1000;

const rememberUpdateId = (updateId) => {
    if (updateId == null || updateId === '') return false;
    const now = Date.now();
    for (const [id, at] of seenUpdateIds) {
        if (now - at > SEEN_UPDATE_TTL_MS) seenUpdateIds.delete(id);
    }
    const key = String(updateId);
    if (seenUpdateIds.has(key)) return true;
    seenUpdateIds.set(key, now);
    return false;
};

const resetUpdateDedup = () => seenUpdateIds.clear();

const QUIET_COMMANDS = new Set(['start', 'help', 'fly', 'reports', 'docs', 'guide', 'rules', 'hidekb', 'showkb']);

const withQuiet = (name, extra = {}) => (
    QUIET_COMMANDS.has(name) ? { ...extra, disable_notification: true } : extra
);

const rememberReplyKb = (chatId, { bound, lang, hidden } = {}) => {
    const id = String(chatId);
    const prev = kbBoundByChat.get(id) || {};
    kbBoundByChat.set(id, {
        bound: bound == null ? Boolean(prev.bound) : Boolean(bound),
        lang: lang ? normalizeLang(lang) : (prev.lang || langOf(chatId)),
        hidden: hidden == null ? Boolean(prev.hidden) : Boolean(hidden)
    });
};

// Link @bot là public. Không tin username Telegram.
// Bảo mật = OTP từ session Fly Quản lý + ChatId trong TelegramDangKy + kiểm vai trò mỗi lệnh.
const BOT_NATIVE_COMMANDS = [
    { command: 'start', description: 'Mở menu / liên kết OTP' },
    { command: 'help', description: 'Trợ giúp (lệnh EN + chú thích VI)' },
    { command: 'fly', description: 'Menu cửa hàng (nút bấm)' },
    { command: 'today', description: 'Tóm tắt hoạt động hôm nay' },
    { command: 'debt', description: 'Công nợ NCC' },
    { command: 'lowstock', description: 'Tồn thấp' },
    { command: 'shifts', description: 'Ca làm' },
    { command: 'payments', description: 'Thanh toán' },
    { command: 'pending', description: 'Việc chờ duyệt' },
    { command: 'docs', description: 'Chứng từ / giấy tờ' },
    { command: 'reports', description: 'Báo cáo cửa hàng / Thủ kho' },
    { command: 'guide', description: 'Tài liệu / quy tắc kế toán' },
    { command: 'rules', description: 'Quy tắc hệ thống (alias /guide)' },
    { command: 'payroll', description: 'Lương (tóm tắt)' },
    { command: 'unlink', description: 'Hủy liên kết' }
];

const nativeTelegramCommands = () => {
    const cmds = BOT_NATIVE_COMMANDS.filter((item) => item.command !== 'ask');
    if (!teleAsk.isTelegramAskEnabled()) return cmds;
    const askCmd = { command: 'ask', description: 'Hỏi trợ lý Fly (đúng quyền QL)' };
    const unlinkAt = cmds.findIndex((item) => item.command === 'unlink');
    if (unlinkAt >= 0) cmds.splice(unlinkAt, 0, askCmd);
    else cmds.push(askCmd);
    return cmds;
};

const FLY_BUTTONS = [
    { id: 'today', key: 'flyToday', uc: ['UC10'] },
    { id: 'revenue', key: 'flyRevenue', uc: ['UC10'] },
    { id: 'debt', key: 'flyDebt', uc: ['UC10', 'UC28'] },
    { id: 'docs', key: 'flyDocs', uc: [] },
    { id: 'guide', key: 'flyGuide', uc: [] },
    { id: 'pending', key: 'flyPending', uc: [] },
    { id: 'reports', key: 'flyReports', uc: ['UC10'] },
    { id: 'shifts', key: 'flyShifts', uc: ['UC10', 'UC22', 'UC29'] },
    { id: 'payments', key: 'flyPayments', uc: ['UC10', 'UC25', 'UC29'] },
    { id: 'alerts', key: 'flyAlerts', uc: [] },
    { id: 'langmenu', key: 'flyLang', uc: [] },
    { id: 'help', key: 'flyHelp', uc: [] }
];

let pollState = { running: false, offset: 0, fetchFn: null };
let pollAbort = false;

const sqlTypes = () => notify.db().sql;

const poolOf = () => notify.getLivePool();

const readyPool = async () => {
    const pool = await poolOf();
    if (pool) await ensureTelegramSchema(pool);
    return pool;
};

const sqlReq = (pool) => pool.request();

const otpSqlType = (sql) => sql.VarChar(6);

const normalizeOtp = (value) => String(value ?? '').replace(/\0/g, '').trim();

const langOf = (chatId, row) => {
    const pending = pendingLangByChat.get(String(chatId));
    if (pending) return normalizeLang(pending);
    return normalizeLang(row?.NgoonNgu);
};

const persistLang = async (chatId, lang, maNV) => {
    const normalized = normalizeLang(lang);
    pendingLangByChat.set(String(chatId), normalized);
    if (!maNV) return normalized;
    try {
        const pool = await readyPool();
        const sql = sqlTypes();
        await sqlReq(pool)
            .input('MaNV', sql.VarChar, maNV)
            .input('NgoonNgu', sql.NVarChar(8), normalized)
            .query('UPDATE TelegramDangKy SET NgoonNgu=@NgoonNgu WHERE MaNV=@MaNV');
    } catch (error) {
        console.error('Telegram lang:', error.message);
    }
    return normalized;
};

const evaluateOtpAttempt = ({ row, otp, now = new Date(), chatTakenBy } = {}) => {
    if (!row || !row.MaOTP) {
        return { ok: false, code: 'not_found', message: 'Mã không đúng hoặc không còn hiệu lực. Tạo mã mới trong Fly.' };
    }
    if (Number(row.SoLanSai || 0) >= OTP_MAX_TRIES) {
        return { ok: false, code: 'locked', message: 'Mã đã bị khóa vì nhập sai quá 5 lần. Tạo mã mới trong Fly.' };
    }
    if (row.HetHanOTP && new Date(row.HetHanOTP).getTime() < now.getTime()) {
        return { ok: false, code: 'expired', message: 'Mã đã hết hạn, tạo mã mới trong Fly.' };
    }
    if (normalizeOtp(otp) !== normalizeOtp(row.MaOTP)) {
        const next = Number(row.SoLanSai || 0) + 1;
        if (next >= OTP_MAX_TRIES) {
            return { ok: false, code: 'locked', increment: true, clear: true, message: 'Mã đã bị khóa vì nhập sai quá 5 lần. Tạo mã mới trong Fly.' };
        }
        return {
            ok: false, code: 'wrong', increment: true, left: OTP_MAX_TRIES - next,
            message: t('vi', 'otpWrong', { left: OTP_MAX_TRIES - next })
        };
    }
    if (chatTakenBy && String(chatTakenBy.MaNV) !== String(row.MaNV)) {
        return {
            ok: false, code: 'chat_taken', http: 409,
            message: 'Chat này đang gắn nhân viên khác. Hủy liên kết trên Fly hoặc nhờ QL.'
        };
    }
    return { ok: true };
};

const evaluateBind = ({ row, otp, now, chatId, occupant }) => {
    const result = evaluateOtpAttempt({ row, otp, now, chatTakenBy: occupant });
    if (!result.ok) return result;
    if (!isManagerRole(row.TenVaiTro)) {
        return { ok: false, code: 'not_manager', message: DENY_NOT_MANAGER };
    }
    const oldChat = row.ChatId && String(row.ChatId) !== String(chatId) ? String(row.ChatId) : null;
    return { ok: true, replaceOldChat: oldChat };
};

const userHasCommand = (user, codes) => {
    if (!codes?.length) return true;
    return notify.roleHasUc(user.TenVaiTro, codes);
};

const auditTelegram = (user, action, extra = {}) => notify.notifySafely(() => {
    const { logAuditSafe } = require('../services/auditLog');
    return logAuditSafe({
        user,
        action,
        table: 'TelegramDangKy',
        recordId: user?.MaNV,
        uc: extra.uc || 'UC01',
        result: extra.result || 'Thành công',
        content: extra.content,
        after: { ChatId: extra.chatId ? maskChatId(extra.chatId) : undefined, Lenh: extra.lenh }
    });
});

const lookupByChat = async (pool, chatId) => {
    await ensureTelegramSchema(pool);
    const sql = sqlTypes();
    const result = await sqlReq(pool)
        .input('ChatId', sql.VarChar, String(chatId))
        .query(`
            SELECT TOP 1 d.MaNV, d.ChatId, d.MaTK, d.Bat, d.MaOTP, d.HetHanOTP, d.SoLanSai, d.NgoonNgu,
                   n.TenNV, t.MaTK AS MaTKLive, t.MaVaiTro, t.TrangThai AS TrangThaiTK, v.TenVaiTro
            FROM TelegramDangKy d
            JOIN NhanVien n ON n.MaNV=d.MaNV
            JOIN TaiKhoan t ON t.MaNV=d.MaNV
            JOIN VaiTro v ON v.MaVaiTro=t.MaVaiTro
            WHERE d.ChatId=@ChatId
            ORDER BY CASE WHEN d.MaTK IS NOT NULL AND t.MaTK=d.MaTK THEN 0 ELSE 1 END`);
    return result.recordset[0] || null;
};

const lookupByOtp = async (pool, otp, { onlyValid = false } = {}) => {
    await ensureTelegramSchema(pool);
    const sql = sqlTypes();
    const normalized = normalizeOtp(otp);
    const expiryClause = onlyValid ? 'AND d.HetHanOTP > GETDATE()' : '';
    const result = await sqlReq(pool)
        .input('Otp', otpSqlType(sql), normalized)
        .query(`
            SELECT TOP 1 d.MaNV, d.ChatId, d.MaTK, d.Bat, d.MaOTP, d.HetHanOTP, d.SoLanSai, d.NgoonNgu,
                   n.TenNV, t.MaTK AS MaTKLive, t.MaVaiTro, t.TrangThai AS TrangThaiTK, v.TenVaiTro
            FROM TelegramDangKy d
            JOIN NhanVien n ON n.MaNV=d.MaNV
            JOIN TaiKhoan t ON t.MaNV=d.MaNV
            JOIN VaiTro v ON v.MaVaiTro=t.MaVaiTro
            WHERE d.MaOTP IS NOT NULL
              AND LTRIM(RTRIM(d.MaOTP))=@Otp
              ${expiryClause}
            ORDER BY CASE WHEN d.MaTK IS NOT NULL AND t.MaTK=d.MaTK THEN 0 ELSE 1 END, d.HetHanOTP DESC`);
    return result.recordset[0] || null;
};

const touchActive = async (pool, maNV) => {
    const sql = sqlTypes();
    await sqlReq(pool).input('MaNV', sql.VarChar, maNV)
        .query('UPDATE TelegramDangKy SET LanHoatDongCuoi=GETDATE() WHERE MaNV=@MaNV');
};

const reply = (chatId, text, extra = {}) => {
    const state = kbBoundByChat.get(String(chatId)) || { bound: false, lang: langOf(chatId), hidden: false };
    const next = { ...extra };
    if (next.show_reply_keyboard) {
        rememberReplyKb(chatId, { hidden: false, bound: state.bound, lang: state.lang });
        delete next.show_reply_keyboard;
        next.reply_markup = replyKeyboard(state.lang, { bound: state.bound });
    }
    const live = kbBoundByChat.get(String(chatId)) || state;
    if (!next.reply_markup && !live.hidden) {
        next.reply_markup = replyKeyboard(live.lang, { bound: live.bound });
    }
    return notify.sendMessage(chatId, text, next);
};

const sendHideKeyboard = async (chatId) => {
    const lang = langOf(chatId);
    rememberReplyKb(chatId, { hidden: true });
    await notify.sendMessage(chatId, t(lang, 'hideOk'), {
        ...withQuiet('hidekb'),
        reply_markup: removeKeyboardMarkup()
    });
    await notify.sendMessage(chatId, t(lang, 'showHint'), {
        ...withQuiet('hidekb'),
        reply_markup: showMenuInlineKeyboard(lang)
    });
    return { ok: true, command: 'hidekb', removed: true };
};

const sendShowKeyboard = async (chatId) => {
    const lang = langOf(chatId);
    const prev = kbBoundByChat.get(String(chatId)) || {};
    let bound = Boolean(prev.bound);
    try {
        const live = await requireBound(chatId);
        if (!live.error && isManagerRole(live.user?.TenVaiTro)) bound = true;
    } catch { /* giữ bound đã nhớ */ }
    rememberReplyKb(chatId, { hidden: false, bound, lang: prev.lang || lang });
    await reply(chatId, t(lang, 'showOk'), withQuiet('showkb'));
    return { ok: true, command: 'showkb' };
};

const bindSuccess = async (pool, row, chatId, lang = 'vi') => {
    await ensureTelegramSchema(pool);
    const sql = sqlTypes();
    const oldChat = row.ChatId && String(row.ChatId) !== String(chatId) ? String(row.ChatId) : null;
    pendingLangByChat.set(String(chatId), normalizeLang(lang));
    await sqlReq(pool)
        .input('MaNV', sql.VarChar, row.MaNV)
        .input('ChatId', sql.VarChar, String(chatId))
        .input('MaTK', sql.Int, row.MaTKLive || row.MaTK)
        .input('NgoonNgu', sql.NVarChar(8), lang)
        .query(`UPDATE TelegramDangKy SET ChatId=@ChatId, MaTK=@MaTK, Bat=1, NgayXacThuc=GETDATE(),
                MaOTP=NULL, HetHanOTP=NULL, SoLanSai=0, LanHoatDongCuoi=GETDATE(), NgoonNgu=@NgoonNgu
                WHERE MaNV=@MaNV`);
    if (oldChat) {
        await reply(oldChat, t(lang, 'unlinkOldChat')).catch(() => {});
    }
    const user = {
        MaNV: row.MaNV, MaTK: row.MaTKLive || row.MaTK, MaVaiTro: row.MaVaiTro,
        TenVaiTro: row.TenVaiTro, TenNV: row.TenNV
    };
    auditTelegram(user, 'Telegram liên kết', { chatId, lenh: '/start', content: `Liên kết ${maskChatId(chatId)}` });
    return t(lang, 'bindSuccess', { name: row.TenNV, role: row.TenVaiTro });
};

const applyOtpFailure = async (pool, row, verdict) => {
    if (!row || !verdict.increment) return;
    const sql = sqlTypes();
    if (verdict.clear) {
        await sqlReq(pool).input('MaNV', sql.VarChar, row.MaNV)
            .query('UPDATE TelegramDangKy SET MaOTP=NULL, HetHanOTP=NULL, SoLanSai=SoLanSai+1 WHERE MaNV=@MaNV');
        return;
    }
    await sqlReq(pool).input('MaNV', sql.VarChar, row.MaNV)
        .query('UPDATE TelegramDangKy SET SoLanSai=SoLanSai+1 WHERE MaNV=@MaNV');
};

const handleBindOtp = async (chatId, otp) => {
    const normalized = normalizeOtp(otp);
    console.log(`Telegram bind: OTP ${maskOtp(normalized)} chat ${maskChatId(chatId)}`);
    const attempt = async (pool) => {
        const occupant = await lookupByChat(pool, chatId);
        const lang = langOf(chatId, occupant);
        const pending = await lookupByOtp(pool, normalized, { onlyValid: true });
        const row = pending || await lookupByOtp(pool, normalized, { onlyValid: false });
        if (!row) {
            return t(lang, 'otpNotFound');
        }
        const verdict = evaluateBind({
            row, otp: normalized, now: new Date(), chatId, occupant
        });
        if (!verdict.ok) {
            if (verdict.increment) await applyOtpFailure(pool, row, verdict);
            return otpFailMessage(lang, verdict);
        }
        return bindSuccess(pool, row, chatId, lang);
    };
    try {
        const pool = await readyPool();
        return await attempt(pool);
    } catch (error) {
        console.error('Telegram bind:', error.message);
        if (!isMissingNgoonNguColumn(error)) {
            return t(langOf(chatId), 'bindDbError');
        }
        try {
            resetTelegramSchemaCache();
            const pool = await readyPool();
            return await attempt(pool);
        } catch (retryError) {
            console.error('Telegram bind retry:', retryError.message);
            return t(langOf(chatId), 'bindDbError');
        }
    }
};

const requireBound = async (chatId) => {
    const pool = await readyPool();
    const row = await lookupByChat(pool, chatId);
    const lang = langOf(chatId, row);
    if (!row) return { error: t(lang, 'denyUnbound'), errorCode: 'unbound', lang };
    if (Number(row.TrangThaiTK) === 0) return { error: t(lang, 'denyLocked'), errorCode: 'locked', lang };
    if (!Number(row.Bat)) return { error: t(lang, 'denyMuted'), errorCode: 'muted', lang };
    await touchActive(pool, row.MaNV).catch(() => {});
    rememberReplyKb(chatId, { bound: isManagerRole(row.TenVaiTro), lang });
    return {
        pool,
        lang,
        user: {
            MaNV: row.MaNV,
            MaTK: row.MaTKLive || row.MaTK,
            MaVaiTro: row.MaVaiTro,
            TenVaiTro: row.TenVaiTro,
            TenNV: row.TenNV,
            NgoonNgu: row.NgoonNgu
        }
    };
};

const requireBoundTimed = async (chatId, ms = START_BIND_CHECK_MS) => {
    let timer;
    try {
        return await Promise.race([
            requireBound(chatId),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('telegram-bind-timeout')), ms);
            })
        ]);
    } catch (error) {
        if (String(error?.message || '') === 'telegram-bind-timeout') {
            return { error: DENY_STRANGER, errorCode: 'stranger', lang: langOf(chatId) };
        }
        throw error;
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const startUnboundKeyboard = (lang = 'vi') => ({
    inline_keyboard: [
        langKeyboardRow(),
        [
            { text: t(lang, 'btnLinkGuide'), callback_data: 'cmd:linkguide' },
            { text: t(lang, 'btnHelp'), callback_data: 'cmd:help' }
        ]
    ]
});

const startWelcomeText = (lang = 'vi') => buildStartWelcomeUnbound(notify.botUsername(), lang);

const startBoundText = (user, lang = 'vi') => buildStartWelcomeBound(user, lang);

const startBoundKeyboard = (user, lang = 'vi') => flyKeyboard(user, lang);

const registerNativeTelegramMenu = async (fetchFn) => {
    await notify.telegramApi('setMyCommands', { commands: nativeTelegramCommands() }, { fetchFn });
    await notify.telegramApi('setChatMenuButton', { menu_button: { type: 'commands' } }, { fetchFn });
};

const registerMenuSafe = async (fetchFn) => {
    try {
        await registerNativeTelegramMenu(fetchFn);
        console.log('Telegram: đã setMyCommands + menu hamburger');
    } catch (error) {
        console.error('Telegram setMyCommands:', error.message);
    }
};

const unauthorizedHint = (error) => {
    const msg = String(error?.message || error || '');
    if (/unauthorized|401|không hợp lệ/i.test(msg)) {
        return 'Token Telegram không hợp lệ — kiểm tra TELEGRAM_BOT_TOKEN trong server/.env';
    }
    if (/fetch failed/i.test(msg) && !/^Telegram /i.test(msg)) {
        return notify.describeTelegramFetchError(error, 'request');
    }
    return msg;
};

const denyIfNoUc = (user, codes, lang = 'vi') => {
    if (!userHasCommand(user, codes)) return t(lang, 'denyView');
    return null;
};

const flyKeyboard = (user, lang = 'vi') => {
    const visible = FLY_BUTTONS.filter(btn => userHasCommand(user, btn.uc));
    const rows = [];
    for (let i = 0; i < visible.length; i += 2) {
        rows.push(visible.slice(i, i + 2).map(btn => ({
            text: t(lang, btn.key),
            callback_data: `cmd:${btn.id}`
        })));
    }
    return { inline_keyboard: rows };
};

const navCopy = (lang = 'vi') => {
    const key = normalizeLang(lang);
    if (key === 'en') return { home: '🏠 Overview', refresh: '🔄 Refresh', reports: '📊 Reports', docs: '📄 Documents' };
    if (key === 'zh') return { home: '🏠 总览', refresh: '🔄 刷新', reports: '📊 报表', docs: '📄 单据' };
    return { home: '🏠 Tổng quan', refresh: '🔄 Làm mới', reports: '📊 Báo cáo', docs: '📄 Chứng từ' };
};

const commandNavigation = (name, lang = 'vi', refreshData = '') => {
    const copy = navCopy(lang);
    const callback = refreshData || `cmd:${name}`;
    const rows = [[
        { text: copy.refresh, callback_data: callback },
        { text: copy.home, callback_data: 'cmd:fly' }
    ]];
    if (!['reports', 'docs', 'fly'].includes(name)) {
        rows.push([
            { text: copy.reports, callback_data: 'cmd:reports' },
            { text: copy.docs, callback_data: 'cmd:docs' }
        ]);
    }
    return { inline_keyboard: rows };
};

const decorateCommandResult = (result, name, lang = 'vi', refreshData = '') => {
    if (typeof result === 'string') {
        return { text: result, extra: { reply_markup: commandNavigation(name, lang, refreshData) } };
    }
    if (!result || result.documents?.length || result.texts?.length || result.extra?.reply_markup) return result;
    return {
        ...result,
        extra: { ...(result.extra || {}), reply_markup: commandNavigation(name, lang, refreshData) }
    };
};

const cmdHelp = (user, lang = 'vi') => buildHelpMessage(codes => userHasCommand(user, codes), lang);

const loadTodayBundle = async (pool, user) => {
    const day = operatingDayOf();
    const [summary, details] = await Promise.all([
        notify.loadOperatingSummary(pool, day),
        notify.loadOperatingDetails(pool, day).catch(() => ({ invoices: [], restock: [] }))
    ]);
    let inbox = [];
    try {
        const { listForRole } = require('../services/inboxService');
        inbox = await listForRole(pool, user);
    } catch { /* inbox lỗi thì dashboard vẫn hiện số bán */ }
    return { day, summary: { ...summary, ...details }, inbox };
};

const cmdFly = async (pool, user, lang = 'vi', chatId) => {
    const wasHidden = Boolean(kbBoundByChat.get(String(chatId))?.hidden);
    rememberReplyKb(chatId, { bound: true, lang, hidden: false });
    const restoreKb = { reply_markup: replyKeyboard(lang, { bound: true }) };
    try {
        const { summary, inbox } = await loadTodayBundle(pool, user);
        return {
            text: buildFlyDashboard({ summary, inbox }, lang),
            extra: wasHidden ? restoreKb : { reply_markup: flyKeyboard(user, lang) }
        };
    } catch (error) {
        console.error('Telegram /fly:', error.message);
        return { text: t(lang, 'flyMenu'), extra: wasHidden ? restoreKb : { reply_markup: flyKeyboard(user, lang) } };
    }
};

const cmdGuide = (arg, lang = 'vi') => teleGuide.buildGuideResult(arg, lang);

const cmdAsk = async (user, pool, arg) => {
    if (!teleAsk.isTelegramAskEnabled()) return teleAsk.ASK_DISABLED;
    if (!String(arg || '').trim()) return teleAsk.ASK_USAGE;
    const out = await teleAsk.runTelegramAsk({ user, question: arg, pool, req: null });
    if (out.extra) return { texts: out.texts, extra: out.extra };
    if (out.texts?.length === 1) return out.texts[0];
    return { texts: out.texts };
};

const handleAskCommand = async (bound, chatId, arg, message) => {
    const lang = bound.lang || langOf(chatId);
    if (message?.message_id) {
        await notify.sendChatAction(chatId, 'typing').catch(() => {});
    }
    if (!teleAsk.isTelegramAskEnabled()) {
        await reply(chatId, teleAsk.ASK_DISABLED);
        return { ok: true, command: 'ask', disabled: true };
    }
    if (!String(arg || '').trim()) {
        await reply(chatId, t(lang, 'askUsage'));
        return { ok: true, command: 'ask', usage: true };
    }
    await reply(chatId, teleAsk.ASK_WORKING);
    const user = bound.user;
    const pool = bound.pool;
    const question = String(arg).trim();
    teleAsk.enqueueAsk(async () => {
        try {
            const out = await teleAsk.runTelegramAsk({ user, question, pool, req: null });
            const texts = out.texts || [];
            for (let index = 0; index < texts.length; index += 1) {
                const extra = (index === texts.length - 1 && out.extra) ? out.extra : {};
                await reply(chatId, texts[index], extra);
            }
        } catch (error) {
            console.error('Telegram /ask:', error.message);
            await reply(chatId, teleAsk.ASK_TIMEOUT).catch(() => {});
        }
    });
    return { ok: true, command: 'ask', queued: true };
};

const cmdToday = async (pool, user, lang = 'vi') => {
    const denied = denyIfNoUc(user, ['UC10'], lang);
    if (denied) return denied;
    const { summary } = await loadTodayBundle(pool, user);
    const text = buildTodayMessage(summary, lang);
    if (/tài chính ngày/i.test(text)) return t(lang, 'todayTemplateError');
    return text;
};

const cmdRevenue = async (pool, user, lang = 'vi') => {
    const denied = denyIfNoUc(user, ['UC10'], lang);
    if (denied) return denied;
    const { summary } = await loadTodayBundle(pool, user);
    return buildRevenueMessage(summary, lang);
};

const cmdDebt = async (pool, user, lang = 'vi') => {
    const denied = denyIfNoUc(user, ['UC10', 'UC28'], lang);
    if (denied) return denied;
    const summary = await sqlReq(pool).query(`
        SELECT COUNT(*) TongKhoan,
               COALESCE(SUM(SoTienConLai),0) TongConLai,
               SUM(CASE WHEN SoTienConLai>0 AND HanThanhToan<CONVERT(date,GETDATE()) THEN 1 ELSE 0 END) QuaHan,
               SUM(CASE WHEN SoTienConLai>0 AND HanThanhToan BETWEEN CONVERT(date,GETDATE()) AND DATEADD(day,7,CONVERT(date,GETDATE())) THEN 1 ELSE 0 END) SapHan
        FROM CongNoPhaiTra WHERE SoTienConLai>0`);
    const top = await sqlReq(pool).query(`
        SELECT TOP 8 cn.MaCNPTra, ncc.TenNCC, cn.SoTienConLai, cn.HanThanhToan
        FROM CongNoPhaiTra cn JOIN NhaCungCap ncc ON ncc.MaNCC=cn.MaNCC
        WHERE cn.SoTienConLai>0
        ORDER BY cn.HanThanhToan, cn.SoTienConLai DESC`);
    return buildDebtMessage({ summary: summary.recordset[0] || {}, rows: top.recordset || [] }, lang);
};

const cmdLowstock = async (pool, user, lang = 'vi') => {
    const denied = denyIfNoUc(user, ['UC10', 'UC15'], lang);
    if (denied) return denied;
    const result = await sqlReq(pool).query(`
        SELECT TOP 8 sp.TenSP, ISNULL(tk.SLTon,0) SLTon, sp.TonKhoToiThieu
        FROM SanPham sp LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
        WHERE sp.TrangThai=N'Đang bán' AND ISNULL(tk.SLTon,0)<=sp.TonKhoToiThieu
        ORDER BY (sp.TonKhoToiThieu-ISNULL(tk.SLTon,0)) DESC, sp.TenSP`);
    return buildLowstockMessage(result.recordset, lang);
};

const cmdShifts = async (pool, user, lang = 'vi') => {
    const denied = denyIfNoUc(user, ['UC10', 'UC22', 'UC29'], lang);
    if (denied) return denied;
    const sql = sqlTypes();
    const isTn = notify.roleHasUc(user.TenVaiTro, ['UC22']) && !notify.roleHasUc(user.TenVaiTro, ['UC10', 'UC29']);
    const result = isTn
        ? await sqlReq(pool).input('MaNV', sql.VarChar, user.MaNV).query(`
            SELECT TOP 8 ca.MaCa, ca.TrangThai, ca.TrangThaiDoiSoat, ca.MaQuay,
                   ISNULL(ca.TienThucNop,0)-ISNULL(ca.TienMatHeThong,0) ChenhLech, nv.TenNV
            FROM CaLamViec ca JOIN NhanVien nv ON nv.MaNV=ca.MaNV
            WHERE ca.MaNV=@MaNV
            ORDER BY ca.ThoiGianBatDau DESC`)
        : await sqlReq(pool).query(`
            SELECT TOP 8 ca.MaCa, ca.TrangThai, ca.TrangThaiDoiSoat, ca.MaQuay,
                   ISNULL(ca.TienThucNop,0)-ISNULL(ca.TienMatHeThong,0) ChenhLech, nv.TenNV
            FROM CaLamViec ca JOIN NhanVien nv ON nv.MaNV=ca.MaNV
            WHERE CONVERT(date, ca.ThoiGianBatDau)=CONVERT(date, GETDATE())
               OR ca.TrangThai=N'Đang mở'
               OR (ca.TrangThai=N'Đã chốt' AND ca.TrangThaiDoiSoat=N'Chờ Kế toán đối soát')
            ORDER BY ca.ThoiGianBatDau DESC`);
    return buildShiftsMessage(result.recordset, lang);
};

const cmdPayments = async (pool, user, lang = 'vi') => {
    const denied = denyIfNoUc(user, ['UC10', 'UC25', 'UC29'], lang);
    if (denied) return denied;
    const sql = sqlTypes();
    const day = operatingDayOf();
    const { operatingWindow } = require('../services/telegramClock');
    const win = operatingWindow(day);
    const isTn = notify.roleHasUc(user.TenVaiTro, ['UC25']) && !notify.roleHasUc(user.TenVaiTro, ['UC10', 'UC29']);
    const request = sqlReq(pool)
        .input('From', sql.DateTime, new Date(win.fromSql.replace(' ', 'T')))
        .input('To', sql.DateTime, new Date(win.toSql.replace(' ', 'T')));
    const filter = isTn ? 'AND hd.MaNV=@MaNV' : '';
    if (isTn) request.input('MaNV', sql.VarChar, user.MaNV);
    const result = await request.query(`
        SELECT tt.PhuongThuc, COUNT(*) SoLuong, COALESCE(SUM(tt.SoTien),0) Tong,
               SUM(CASE WHEN tt.TrangThai=N'Chờ xác nhận' THEN 1 ELSE 0 END) ChoXacNhan
        FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
        WHERE tt.NgayTT>=@From AND tt.NgayTT<@To ${filter}
        GROUP BY tt.PhuongThuc`);
    const recentReq = sqlReq(pool)
        .input('FromR', sql.DateTime, new Date(win.fromSql.replace(' ', 'T')))
        .input('ToR', sql.DateTime, new Date(win.toSql.replace(' ', 'T')));
    if (isTn) recentReq.input('MaNV', sql.VarChar, user.MaNV);
    const recent = await recentReq.query(`
        SELECT TOP 8 tt.PhuongThuc, tt.SoTien, tt.NgayTT, tt.TrangThai
        FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
        WHERE tt.NgayTT>=@FromR AND tt.NgayTT<@ToR ${filter}
        ORDER BY tt.NgayTT DESC`).catch(() => ({ recordset: [] }));
    return buildPaymentsMessage({
        day, channels: result.recordset || [], recent: recent.recordset || []
    }, lang);
};

const cmdPending = async (pool, user, lang = 'vi') => {
    const { listForRole } = require('../services/inboxService');
    const items = await listForRole(pool, user);
    const kb = teleDecision.pendingListKeyboard(items);
    return {
        text: buildPendingMessage(items, lang),
        extra: kb ? { reply_markup: kb } : {}
    };
};

const loadPnlDay = async (pool) => {
    try {
        const { resolveReportingPeriod } = require('../services/reportingPeriod');
        const { buildReport } = require('../services/storeProfitLoss');
        const period = resolveReportingPeriod({ periodType: 'day' });
        const report = await buildReport(pool, { period, latestActivity: null, fallbackFrom: null });
        return report?.hoatDong || null;
    } catch {
        return null;
    }
};

const shiftReportPeriod = (periodType, value, amount) => {
    const step = Number(amount) || 0;
    if (periodType === 'month') {
        const match = String(value).match(/^(\d{4})-(\d{2})$/);
        if (!match) throw new Error('Kỳ tháng không hợp lệ.');
        const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + step, 1));
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    if (periodType === 'quarter') {
        const match = String(value).match(/^(\d{4})-Q([1-4])$/i);
        if (!match) throw new Error('Kỳ quý không hợp lệ.');
        const absolute = Number(match[1]) * 4 + Number(match[2]) - 1 + step;
        return `${Math.floor(absolute / 4)}-Q${absolute % 4 + 1}`;
    }
    if (periodType === 'year') return String(Number(value) + step);
    throw new Error('Chỉ hỗ trợ báo cáo tháng, quý hoặc năm.');
};

const addIsoDays = (value, days) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
};

const daysBetween = (from, to) => Math.max(0, Math.round(
    (new Date(`${to}T00:00:00.000Z`) - new Date(`${from}T00:00:00.000Z`)) / 86400000
));

const cmdManagementReport = async (pool, user, periodType, periodValue, lang = 'vi') => {
    const denied = denyIfNoUc(user, ['UC10'], lang);
    if (denied) return denied;
    const type = String(periodType || '').toLowerCase();
    try {
        const current = currentPeriodDefaults();
        const selected = String(periodValue || current[type] || '').toUpperCase();
        const period = resolveReportingPeriod({ periodType: type, period: selected });
        const previousValue = shiftReportPeriod(type, selected, -1);
        let previousPeriod = resolveReportingPeriod({ periodType: type, period: previousValue });
        const isCurrent = selected === String(current[type] || '').toUpperCase();
        if (isCurrent) {
            const elapsedDays = daysBetween(period.from, current.day) + 1;
            const alignedEnd = addIsoDays(previousPeriod.from, elapsedDays);
            const toExclusive = alignedEnd < previousPeriod.toExclusive ? alignedEnd : previousPeriod.toExclusive;
            previousPeriod = {
                ...previousPeriod,
                toExclusive,
                to: addIsoDays(toExclusive, -1),
                label: `${previousPeriod.label} · cùng tiến độ`
            };
        }
        const { buildReport } = require('../services/storeProfitLoss');
        const [report, previousReport] = await Promise.all([
            buildReport(pool, { period, latestActivity: null, fallbackFrom: null }),
            buildReport(pool, { period: previousPeriod, latestActivity: null, fallbackFrom: null })
        ]);
        const nextValue = shiftReportPeriod(type, selected, 1);
        const reportWithMeta = {
            ...report,
            telegramMeta: { isCurrent, asOf: current.day, comparisonAligned: isCurrent }
        };
        return {
            text: buildManagementReportMessage({ report: reportWithMeta, previousReport }, lang),
            extra: {
                reply_markup: managementReportKeyboard({
                    periodType: type,
                    period: selected,
                    previous: previousValue,
                    next: nextValue,
                    canNext: selected < String(current[type] || '').toUpperCase(),
                    current
                }, lang)
            }
        };
    } catch (error) {
        console.error(`Telegram báo cáo ${type}:`, error.message);
        return {
            text: '⚠️ <b>Chưa lập được báo cáo kỳ này.</b>\n<i>Hãy kiểm tra dữ liệu bán hàng, kỳ lương và thử lại.</i>',
            extra: { reply_markup: reportsMenuKeyboard(lang) }
        };
    }
};

const cmdReports = async (pool, user, lang = 'vi') => {
    const denied = denyIfNoUc(user, ['UC10'], lang);
    if (denied) return denied;
    return {
        text: buildReportsMenu(lang),
        extra: { reply_markup: reportsMenuKeyboard(lang) }
    };
};

const cmdReportPick = async (pool, user, which, lang = 'vi') => {
    const key = String(which || '').toLowerCase();
    if (key === 'today') return cmdToday(pool, user, lang);
    if (key === 'debt') return cmdDebt(pool, user, lang);
    if (key === 'pending') return cmdPending(pool, user, lang);
    if (key === 'shifts') return cmdShifts(pool, user, lang);
    if (key === 'lowstock') return cmdLowstock(pool, user, lang);
    if (key === 'pnl') return buildPnlOnlyMessage(await loadPnlDay(pool), lang);
    if (key === 'wh') {
        const warehouseTg = require('../services/warehouseReportTelegram');
        return warehouseTg.composeWarehouseReportList(pool, lang);
    }
    return cmdReports(pool, user, lang);
};

const cmdDocs = async (pool, user, arg, lang = 'vi') => {
    const parsed = teleDocs.parseDocsArg(arg);
    if (parsed) {
        const pack = await teleDocs.loadDocumentPack(pool, parsed.kind, parsed.id, lang);
        return {
            text: pack.messages[0]?.text || t(lang, 'docsMissing'),
            documents: pack.messages
        };
    }
    if (String(arg || '').trim()) return t(lang, 'docsUnknown');
    return {
        text: teleDocs.buildDocsTypeMenu(lang),
        extra: { reply_markup: teleDocs.docsTypeKeyboard(lang) }
    };
};

const cmdAlerts = async (pool, user, lang = 'vi') => {
    const { listForRole } = require('../services/inboxService');
    const pending = await listForRole(pool, user);
    return buildAlertsMessage(pending.filter(item => item.tone === 'urgent'), lang);
};

const cmdPayroll = async (pool, user, maNV, lang = 'vi') => {
    if (maNV) {
        const denied = denyIfNoUc(user, ['UC33'], lang);
        if (denied) return denied;
        const month = vietnamCalendar().monthPeriod;
        const sql = sqlTypes();
        const header = await sqlReq(pool)
            .input('MaKy', sql.VarChar, month)
            .input('MaNV', sql.VarChar, maNV)
            .query(`SELECT bl.TongLuong, bl.TrangThai, nv.TenNV, bl.PhutNgay, bl.PhutDem
                    FROM BangLuong bl JOIN NhanVien nv ON nv.MaNV=bl.MaNV
                    WHERE bl.MaKy=@MaKy AND bl.MaNV=@MaNV`);
        if (!header.recordset.length) return t(lang, 'payrollMissing', { maNV, month });
        return buildPayrollOneMessage(header.recordset[0], maNV, month, lang);
    }
    const denied = denyIfNoUc(user, ['UC10'], lang);
    if (denied) return denied;
    const month = vietnamCalendar().monthPeriod;
    const result = await sqlReq(pool).input('MaKy', sql.VarChar, month).query(`
        SELECT COUNT(*) SoNV, COALESCE(SUM(TongLuong),0) Tong,
               SUM(CASE WHEN TrangThai=N'Đã thanh toán' THEN 1 ELSE 0 END) DaChi,
               SUM(CASE WHEN TrangThai<>N'Đã thanh toán' THEN 1 ELSE 0 END) ChuaChi
        FROM BangLuong WHERE MaKy=@MaKy`);
    return buildPayrollSummaryMessage(result.recordset[0] || {}, month, lang);
};

const cmdUnlink = async (pool, user, chatId, lang = 'vi') => {
    const sql = sqlTypes();
    await sqlReq(pool).input('MaNV', sql.VarChar, user.MaNV).query(`
        UPDATE TelegramDangKy SET ChatId=NULL, Bat=0, MaOTP=NULL, HetHanOTP=NULL
        WHERE MaNV=@MaNV`);
    pendingLangByChat.delete(String(chatId));
    rememberReplyKb(chatId, { bound: false, lang });
    auditTelegram(user, 'Telegram hủy liên kết', { chatId, lenh: '/unlink', uc: 'UC01' });
    return t(lang, 'unlinkOk');
};

const runCommand = async (name, user, pool, chatId, arg, lang = 'vi') => {
    switch (name) {
        case 'help': return cmdHelp(user, lang);
        case 'fly': return cmdFly(pool, user, lang, chatId);
        case 'guide':
        case 'rules': return cmdGuide(arg, lang);
        case 'revenue': return cmdRevenue(pool, user, lang);
        case 'today': return cmdToday(pool, user, lang);
        case 'langmenu': return {
            text: t(lang, 'langMenuTitle'),
            extra: { reply_markup: { inline_keyboard: [langKeyboardRow()] } }
        };
        case 'debt': return cmdDebt(pool, user, lang);
        case 'lowstock': return cmdLowstock(pool, user, lang);
        case 'shifts': return cmdShifts(pool, user, lang);
        case 'payments': return cmdPayments(pool, user, lang);
        case 'pending': return cmdPending(pool, user, lang);
        case 'docs': return cmdDocs(pool, user, arg, lang);
        case 'reports': return cmdReports(pool, user, lang);
        case 'alerts': return cmdAlerts(pool, user, lang);
        case 'payroll': return cmdPayroll(pool, user, arg, lang);
        case 'unlink': return cmdUnlink(pool, user, chatId, lang);
        case 'ask': return cmdAsk(user, pool, arg);
        default: return t(lang, 'unknownCmd');
    }
};

const parseCommand = (text) => {
    const raw = String(text || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .replace(/^\/([A-Za-z0-9_]+)@[\w]+/i, '/$1');
    const startOtp = raw.match(/^\/(?:start|bind)(?:\s+|_|)(\d{6})\s*$/i);
    if (startOtp) return { name: 'bind', otp: startOtp[1] };
    if (/^\/start\s*$/i.test(raw)) return { name: 'start' };
    const payroll = raw.match(/^\/payroll(?:\s+|_)([A-Za-z0-9]+)?\s*$/i);
    if (payroll) return { name: 'payroll', arg: payroll[1] ? payroll[1].toUpperCase() : '' };
    const docs = raw.match(/^\/docs(?:\s+(.+))?$/i);
    if (docs) return { name: 'docs', arg: String(docs[1] || '').trim() };
    const ask = raw.match(/^\/ask(?:\s+(.+))?$/i);
    if (ask) return { name: 'ask', arg: String(ask[1] || '').trim() };
    const guide = raw.match(/^\/(?:guide|rules)(?:\s+(.+))?$/i);
    if (guide) return { name: 'guide', arg: String(guide[1] || '').trim() };
    const simple = raw.match(/^\/(help|fly|today|debt|lowstock|shifts|payments|pending|reports|alerts|unlink|revenue)\s*$/i);
    if (simple) return { name: simple[1].toLowerCase() };
    if (/^\/[A-Za-z0-9_]+/i.test(raw)) return { name: 'unknown', raw };
    const fromReply = matchReplyCommand(raw);
    if (fromReply) return fromReply;
    return { name: 'unknown', raw };
};

const rememberAskWait = (chatId) => {
    pendingAskByChat.set(String(chatId), Date.now());
};

const peekAskWait = (chatId) => {
    const at = pendingAskByChat.get(String(chatId));
    return Boolean(at && (Date.now() - at) <= PENDING_ASK_TTL_MS);
};

const consumeAskWait = (chatId) => {
    const ok = peekAskWait(chatId);
    pendingAskByChat.delete(String(chatId));
    return ok;
};

const handleStartCommand = async (chatId) => {
    const quiet = { disable_notification: true };
    let bound;
    try {
        bound = await requireBoundTimed(chatId);
    } catch (error) {
        console.error('Telegram start:', error.message);
        const lang = langOf(chatId);
        await reply(chatId, t(lang, 'bindDbError'), quiet);
        return { start: true, error: true };
    }
    const lang = bound.lang || langOf(chatId, bound.user);
    if (!bound.error && isManagerRole(bound.user.TenVaiTro)) {
        rememberReplyKb(chatId, { bound: true, lang, hidden: false });
        let dash = { summary: {}, inbox: [] };
        try {
            dash = await loadTodayBundle(bound.pool, bound.user);
        } catch (error) {
            console.error('Telegram start dash:', error.message);
        }
        await reply(chatId, buildStartWelcomeBound(bound.user, lang, dash), quiet);
        return { start: true, bound: true };
    }
    if (!bound.error && bound.user) {
        rememberReplyKb(chatId, { bound: false, lang });
        await reply(chatId, buildStartWelcomeGuest(lang), quiet);
        return { start: true, bound: true, denied: true };
    }
    if (bound.errorCode === 'muted' || bound.errorCode === 'locked') {
        rememberReplyKb(chatId, { bound: false, lang });
        await reply(chatId, bound.error, quiet);
        return { start: true };
    }
    rememberReplyKb(chatId, { bound: false, lang });
    await reply(chatId, startWelcomeText(lang), quiet);
    return { start: true };
};

const handleLangCallback = async (chatId, lang) => {
    const normalized = await persistLang(chatId, lang);
    const bound = await requireBound(chatId).catch(() => ({ errorCode: 'unbound', lang: normalized }));
    const liveLang = normalized;
    if (!bound.error && bound.user && isManagerRole(bound.user.TenVaiTro)) {
        await persistLang(chatId, liveLang, bound.user.MaNV);
        rememberReplyKb(chatId, { bound: true, lang: liveLang, hidden: false });
        let dash = { summary: {}, inbox: [] };
        try {
            dash = await loadTodayBundle(bound.pool, bound.user);
        } catch { /* chào vẫn gửi khi dashboard lỗi */ }
        await reply(chatId, `${t(liveLang, 'langChosen')}\n\n${buildStartWelcomeBound(bound.user, liveLang, dash)}`);
        return { ok: true, command: 'lang', lang: liveLang };
    }
    if (!bound.error && bound.user) {
        await persistLang(chatId, liveLang, bound.user.MaNV);
        rememberReplyKb(chatId, { bound: false, lang: liveLang });
        await reply(chatId, `${t(liveLang, 'langChosen')}\n\n${buildStartWelcomeGuest(liveLang)}`);
        return { ok: true, command: 'lang', lang: liveLang, denied: true };
    }
    rememberReplyKb(chatId, { bound: false, lang: liveLang });
    await reply(chatId, `${t(liveLang, 'langChosen')}\n\n${startWelcomeText(liveLang)}`);
    return { ok: true, command: 'lang', lang: liveLang };
};

const sendRelatedPhotos = async (chatId, dossier, extra = {}) => {
    const photos = (dossier?.photos || []).filter(photo => !voucherImage.isProductImagePath(photo));
    for (const photo of photos) {
        await notify.sendPhoto(chatId, photo.path || photo, {
            caption: `Chứng từ ${dossier.id || dossier.title || ''} · ${photo.name || ''}`.trim(),
            disable_notification: extra.disable_notification === true
        }).catch(() => {});
    }
};

const sendPaperVoucher = async (chatId, doc, extra = {}) => {
    const sheet = doc?.sheet || (doc?.title || doc?.number || doc?.lines ? doc : null);
    if (!sheet || !(sheet.title || sheet.number || (sheet.lines && sheet.lines.length) || (sheet.fields && sheet.fields.length))) {
        return 0;
    }
    try {
        const pages = await voucherImage.renderVoucherPages(sheet, { lang: extra.lang });
        let count = 0;
        for (const paper of pages) {
            await notify.sendPhoto(chatId, paper, {
                caption: paper.caption,
                disable_notification: extra.disable_notification === true
            });
            count += 1;
        }
        return count;
    } catch (error) {
        console.error('Telegram giấy chứng từ:', error.message);
        return 0;
    }
};

const sendDocumentPack = async (chatId, documents = [], extra = {}) => {
    if (!documents.length) return 0;
    let sent = 0;
    for (const doc of documents) {
        await sendPaperVoucher(chatId, doc, extra);
        if (!doc?.text) continue;
        await reply(chatId, doc.text, extra);
        sent += 1;
    }
    return sent;
};

const deliverCommandResult = async (chatId, result, extra = {}) => {
    if (typeof result === 'string') {
        await reply(chatId, result, extra);
        return;
    }
    if (result.documents?.length) {
        await sendDocumentPack(chatId, result.documents, extra);
        return;
    }
    if (result.texts?.length) {
        for (let index = 0; index < result.texts.length; index += 1) {
            const lastExtra = (index === result.texts.length - 1 && result.extra) ? result.extra : {};
            await reply(chatId, result.texts[index], { ...extra, ...lastExtra });
        }
        return;
    }
    await reply(chatId, result.text, { ...extra, ...(result.extra || {}) });
};

const deliverCallbackResult = async (query, result, extra = {}, name = 'fly', lang = 'vi', refreshData = '') => {
    const chatId = query.message?.chat?.id;
    const decorated = decorateCommandResult(result, name, lang, refreshData);
    if (decorated?.documents?.length || decorated?.texts?.length) {
        return deliverCommandResult(chatId, decorated, extra);
    }
    const messageId = query.message?.message_id;
    const text = typeof decorated === 'string' ? decorated : decorated?.text;
    const mergedExtra = typeof decorated === 'string'
        ? extra
        : { ...extra, ...(decorated?.extra || {}) };
    if (messageId && query.message?.text && text) {
        try {
            const edited = await notify.editMessageText(chatId, messageId, text, mergedExtra);
            if (!edited?.skipped) return edited;
        } catch (error) {
            if (/message is not modified/i.test(error.message || '')) return { unchanged: true };
        }
    }
    return deliverCommandResult(chatId, decorated, extra);
};

const completedDecisionKeyboard = (parsed, lang = 'vi') => ({
    inline_keyboard: [
        [
            { text: '🔄 Cập nhật', callback_data: `dt:${parsed.kind}:${parsed.id}` },
            { text: '📄 Chứng từ', callback_data: `docs:${parsed.kind}:${parsed.id}` }
        ],
        [
            { text: navCopy(lang).home, callback_data: 'cmd:fly' },
            { text: '📋 Việc chờ', callback_data: 'cmd:pending' }
        ]
    ]
});

const handleAskDocCallback = async (chatId, parsed, user, pool) => {
    await notify.sendChatAction(chatId, 'upload_document').catch(() => {});
    try {
        const file = await teleAsk.deliverAskDocument({
            user,
            pool,
            kind: parsed.kind,
            id: parsed.id,
            skin: parsed.skin
        });
        await notify.sendDocument(chatId, file, {
            caption: file.caption,
            filename: file.filename,
            disable_notification: true
        });
        return { ok: true, command: 'askdoc', kind: parsed.kind, id: parsed.id, skin: parsed.skin };
    } catch (error) {
        const status = Number(error.status) || 500;
        const text = status === 403
            ? 'Tài khoản này không xem chứng từ trên trợ lý.'
            : (error.message || 'Không tạo được PDF. Thử /ask lại hoặc mở trợ lý trên Fly.');
        await reply(chatId, text);
        return { ok: false, command: 'askdoc', status, kind: parsed.kind, id: parsed.id };
    }
};

const handleDecisionCallback = async (chatId, parsed, user, pool, lang, query = {}) => {
    if (parsed.action === 'reports') {
        const text = await cmdReports(pool, user, lang);
        await deliverCallbackResult(query, text, withQuiet('reports'), 'reports', lang);
        return { ok: true, command: 'reports' };
    }
    if (parsed.action === 'docs') {
        const pack = await teleDocs.loadDocumentPack(pool, parsed.kind, parsed.id, lang);
        const count = await sendDocumentPack(chatId, pack.messages, withQuiet('docs'));
        if (!count) await reply(chatId, t(lang, 'docsMissing'), withQuiet('docs'));
        return { ok: true, command: 'docs', kind: parsed.kind, id: parsed.id, count };
    }
    if (parsed.action === 'dt') {
        const packed = await teleDecision.composePendingPush(pool, parsed.kind, parsed.id, lang);
        await deliverCallbackResult(query, packed, {}, 'pending', lang, `dt:${parsed.kind}:${parsed.id}`);
        await sendRelatedPhotos(chatId, packed.dossier);
        return { ok: true, command: 'detail', kind: parsed.kind, id: parsed.id };
    }
    if (!teleDecision.canDecideKind(user, parsed.kind)) {
        await reply(chatId, teleDecision.DENY_403);
        return { forbidden: true, status: 403 };
    }
    if (parsed.action === 'no') {
        teleDecision.rememberReject(chatId, parsed.kind, parsed.id);
        await reply(chatId, teleDecision.ASK_REASON, {
            reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'Lý do từ chối' }
        });
        return { ok: true, needReason: true, kind: parsed.kind, id: parsed.id };
    }
    const verdict = await teleDecision.runFlyDecision({
        user, kind: parsed.kind, action: parsed.action, id: parsed.id, pool, chatId
    });
    const messageId = query.message?.message_id;
    if (messageId && verdict.ok) {
        await notify.setMessageReaction(chatId, messageId, parsed.action === 'no' ? '👎' : '👍').catch(() => {});
        await notify.editMessageReplyMarkup(chatId, messageId, completedDecisionKeyboard(parsed, lang)).catch(() => {});
    }
    await reply(chatId, verdict.text, {
        ...(verdict.ok ? { effect: parsed.action === 'no' ? 'alert' : 'success' } : {}),
        reply_markup: completedDecisionKeyboard(parsed, lang)
    });
    return {
        ok: verdict.ok,
        status: verdict.status,
        already: verdict.already,
        command: parsed.action,
        kind: parsed.kind,
        id: parsed.id
    };
};

const handleRejectReasonMessage = async (chatId, text, bound) => {
    const pending = teleDecision.consumeReject(chatId);
    if (!pending) return null;
    const live = bound.lang || langOf(chatId);
    const verdict = await teleDecision.runFlyDecision({
        user: bound.user,
        kind: pending.kind,
        action: 'no',
        id: pending.id,
        reason: text,
        pool: bound.pool,
        chatId
    });
    await reply(chatId, verdict.text);
    return { ok: verdict.ok, rejected: true, status: verdict.status, kind: pending.kind, id: pending.id, lang: live };
};

const handlePrivateMessage = async (message) => {
    const chatId = message.chat?.id;
    const text = String(message.text || '').trim();
    const lang = langOf(chatId);
    const waitingReject = teleDecision.peekReject(chatId);
    if (waitingReject && text && !text.startsWith('/') && !matchReplyCommand(text)) {
        const bound = await requireBound(chatId).catch(() => ({ error: t(lang, 'denyStranger'), lang }));
        if (bound.error) {
            teleDecision.consumeReject(chatId);
            await reply(chatId, bound.error);
            return { unbound: true };
        }
        if (!isManagerRole(bound.user.TenVaiTro)) {
            teleDecision.consumeReject(chatId);
            await reply(chatId, t(bound.lang || lang, 'denyNotManagerCmd'));
            return { forbidden: true, status: 403, notManager: true };
        }
        return handleRejectReasonMessage(chatId, text, bound);
    }
    if (peekAskWait(chatId) && text && !/^\/[A-Za-z0-9_]+/i.test(text) && !matchReplyCommand(text)) {
        consumeAskWait(chatId);
        const boundAsk = await requireBound(chatId).catch(() => ({ error: t(lang, 'denyStranger'), errorCode: 'stranger', lang }));
        if (boundAsk.error) {
            const deny = boundAsk.errorCode === 'muted' || boundAsk.errorCode === 'locked' ? boundAsk.error : t(boundAsk.lang || lang, 'denyStranger');
            await reply(chatId, deny);
            return { unbound: true };
        }
        if (!isManagerRole(boundAsk.user.TenVaiTro)) {
            await reply(chatId, t(boundAsk.lang || lang, 'denyNotManagerCmd'));
            return { forbidden: true, notManager: true };
        }
        return handleAskCommand(boundAsk, chatId, text, message);
    }
    if (FORBIDDEN_TEXT.test(text) && !/^\/ask\b/i.test(text) && !matchReplyCommand(text) && !/^\/(today|pending|reports|help|fly)/i.test(text)) {
        await reply(chatId, t(lang, 'denyWrite'));
        return { forbidden: true };
    }
    const parsed = parseCommand(text);
    if (parsed.name === 'hidekb') {
        return sendHideKeyboard(chatId);
    }
    if (parsed.name === 'showkb') {
        return sendShowKeyboard(chatId);
    }
    if (parsed.name === 'linkguide') {
        rememberReplyKb(chatId, { bound: false, lang });
        await reply(chatId, t(lang, 'startLinkGuide'));
        return { ok: true, command: 'linkguide' };
    }
    if (parsed.name === 'langmenu') {
        await reply(chatId, t(lang, 'langMenuTitle'), { reply_markup: { inline_keyboard: [langKeyboardRow()] } });
        return { ok: true, command: 'langmenu' };
    }
    if (parsed.name === 'bind') {
        try {
            const body = await handleBindOtp(chatId, parsed.otp);
            if (/Đã liên kết|Linked |已关联/.test(body)) rememberReplyKb(chatId, { bound: true, lang: langOf(chatId), hidden: false });
            await reply(chatId, body);
            return { bind: true };
        } catch (error) {
            console.error('Telegram bind:', error.message);
            await reply(chatId, t(langOf(chatId), 'bindDbError'));
            return { bind: true, error: true };
        }
    }
    if (parsed.name === 'start') {
        return handleStartCommand(chatId);
    }
    const bound = await requireBound(chatId).catch(() => ({ error: t(lang, 'denyStranger'), errorCode: 'stranger', lang }));
    const live = bound.lang || lang;
    if (bound.error) {
        const deny = bound.errorCode === 'muted' || bound.errorCode === 'locked' ? bound.error : t(live, 'denyStranger');
        await reply(chatId, deny);
        return { unbound: true };
    }
    if (parsed.name === 'unlink') {
        const result = await cmdUnlink(bound.pool, bound.user, chatId, live);
        await reply(chatId, result);
        return { ok: true, command: 'unlink' };
    }
    if (!isManagerRole(bound.user.TenVaiTro)) {
        await reply(chatId, t(live, 'denyNotManagerCmd'));
        return { forbidden: true, notManager: true };
    }
    if (parsed.name !== 'ask' && parsed.name !== 'askwait') {
        pendingAskByChat.delete(String(chatId));
    }
    if (parsed.name === 'unknown') {
        await reply(chatId, t(live, 'unknownCmd'));
        return { unknown: true };
    }
    if (parsed.name === 'askwait') {
        if (!teleAsk.isTelegramAskEnabled()) {
            await reply(chatId, teleAsk.ASK_DISABLED);
            return { ok: true, command: 'askwait', disabled: true };
        }
        rememberAskWait(chatId);
        await reply(chatId, t(live, 'askPrompt'));
        return { ok: true, command: 'askwait' };
    }
    if (parsed.name === 'ask') {
        return handleAskCommand(bound, chatId, parsed.arg, message);
    }
    if (message.message_id) {
        const activity = parsed.name === 'docs' ? 'upload_photo' : 'typing';
        await notify.sendChatAction(chatId, activity).catch(() => {});
    }
    const result = await runCommand(parsed.name, bound.user, bound.pool, chatId, parsed.arg, live);
    await deliverCommandResult(chatId, decorateCommandResult(result, parsed.name, live), withQuiet(parsed.name));
    if (parsed.name !== 'fly' && parsed.name !== 'help') {
        auditTelegram(bound.user, `Telegram /${parsed.name}`, { chatId, lenh: `/${parsed.name}`, uc: 'UC01' });
    }
    return { ok: true, command: parsed.name };
};

const handleCallback = async (query) => {
    const chatId = query.message?.chat?.id;
    const data = String(query.data || '');
    const liveUi = Boolean(query.message?.message_id);
    await notify.answerCallbackQuery(query.id, liveUi ? 'Đang cập nhật dữ liệu…' : '').catch(() => {});
    if (liveUi) {
        const activity = /^askd:/.test(data)
            ? 'upload_document'
            : (/docs|dkind/.test(data) ? 'upload_photo' : 'typing');
        await notify.sendChatAction(chatId, activity).catch(() => {});
    }
    const langMatch = data.match(/^lang:(vi|en|zh)$/i);
    if (langMatch) {
        return handleLangCallback(chatId, langMatch[1].toLowerCase());
    }
    const lang = langOf(chatId);
    const decision = teleDecision.parseDecisionCallback(data);
    const askDoc = teleAsk.parseAskDocCallback(data);
    const dkindMatch = data.match(/^dkind:(po|px|kk|dt|pc|cc|hd|pn|hdm|bck)$/i);
    const rptMatch = data.match(/^rpt:(today|debt|pending|shifts|lowstock|pnl|wh)$/i);
    const periodMatch = data.match(/^period:(month|quarter|year):(\d{4}(?:-\d{2}|-Q[1-4])?)$/i);
    const guideMatch = data.match(/^guide:(revenue|gross|pnl|vat|debt|cash|payroll)$/i);
    if (/\/(pay|complete)\b/i.test(data)) {
        await reply(chatId, t(lang, 'denyWrite'));
        return { forbidden: true };
    }
    if (!/^cmd:/.test(data) && !decision && !askDoc && !dkindMatch && !rptMatch && !periodMatch && !guideMatch) {
        await reply(chatId, t(lang, 'denyWrite'));
        return { forbidden: true };
    }
    if (query.message?.chat?.type && query.message.chat.type !== 'private') {
        await reply(chatId, t(lang, 'denyGroup'));
        return { group: true };
    }
    const name = data.slice(4);
    if (name === 'linkguide') {
        await reply(chatId, t(lang, 'startLinkGuide'));
        return { ok: true, command: 'linkguide' };
    }
    const bound = await requireBound(chatId).catch(() => ({ error: t(lang, 'denyStranger'), errorCode: 'stranger', lang }));
    const live = bound.lang || lang;
    if (name === 'help') {
        if (!bound.error && isManagerRole(bound.user.TenVaiTro)) {
            await reply(chatId, cmdHelp(bound.user, live), withQuiet('help'));
            return { ok: true, command: 'help' };
        }
        await reply(chatId, `${t(live, 'denyStranger')}\n\n${t(live, 'startLinkGuide')}`, withQuiet('help'));
        return { ok: true, command: 'help', unbound: true };
    }
    if (name === 'langmenu') {
        await reply(chatId, t(live, 'langMenuTitle'), { reply_markup: { inline_keyboard: [langKeyboardRow()] } });
        return { ok: true, command: 'langmenu' };
    }
    if (name === 'showkb') {
        return sendShowKeyboard(chatId);
    }
    if (name === 'hidekb') {
        return sendHideKeyboard(chatId);
    }
    if (bound.error) {
        await reply(chatId, t(live, 'denyStranger'));
        return { unbound: true };
    }
    if (name === 'unlink') {
        const result = await cmdUnlink(bound.pool, bound.user, chatId, live);
        await reply(chatId, result);
        return { ok: true, command: 'unlink' };
    }
    if (!isManagerRole(bound.user.TenVaiTro)) {
        await reply(chatId, t(live, 'denyNotManagerCmd'));
        return { forbidden: true, notManager: true, status: 403 };
    }
    if (dkindMatch) {
        const kind = dkindMatch[1].toLowerCase();
        const rows = await teleDocs.listRecentDocuments(bound.pool, kind);
        await deliverCallbackResult(query, {
            text: teleDocs.buildDocsTypeList(kind, rows, live),
            extra: { reply_markup: teleDocs.docsTypeListKeyboard(kind, rows, live) }
        }, withQuiet('docs'), 'docs', live, `dkind:${kind}`);
        return { ok: true, command: 'docs', kind };
    }
    if (rptMatch) {
        const which = rptMatch[1].toLowerCase();
        const picked = await cmdReportPick(bound.pool, bound.user, which, live);
        await deliverCallbackResult(query, picked, withQuiet(which === 'pending' ? 'pending' : 'reports'), 'reports', live, `rpt:${which}`);
        return { ok: true, command: 'reports', report: which };
    }
    if (periodMatch) {
        const type = periodMatch[1].toLowerCase();
        const period = periodMatch[2].toUpperCase();
        const picked = await cmdManagementReport(bound.pool, bound.user, type, period, live);
        await deliverCallbackResult(query, picked, withQuiet('reports'), 'reports', live, `period:${type}:${period}`);
        return { ok: true, command: 'reports', report: type, period };
    }
    if (guideMatch) {
        const topic = guideMatch[1].toLowerCase();
        const picked = cmdGuide(topic, live);
        await deliverCallbackResult(query, picked, withQuiet('guide'), 'guide', live, `guide:${topic}`);
        return { ok: true, command: 'guide', topic };
    }
    if (askDoc) {
        return handleAskDocCallback(chatId, askDoc, bound.user, bound.pool);
    }
    if (decision) {
        return handleDecisionCallback(chatId, decision, bound.user, bound.pool, live, query);
    }
    const result = await runCommand(name, bound.user, bound.pool, chatId, '', live);
    await deliverCallbackResult(query, result, withQuiet(name), name, live);
    return { ok: true, command: name };
};

const handleUpdate = async (update) => {
    if (rememberUpdateId(update?.update_id)) return { deduped: true };
    if (update.callback_query) return handleCallback(update.callback_query);
    const message = update.message || update.edited_message;
    if (!message) return { ignored: true };
    const type = String(message.chat?.type || '');
    if (type !== 'private') {
        if (message.chat?.id) await reply(message.chat.id, DENY_GROUP).catch(() => {});
        return { group: true };
    }
    return handlePrivateMessage(message);
};

const verifyWebhookSecret = (req) => {
    const expected = notify.webhookSecret();
    if (!expected) return true;
    const got = req.headers['x-telegram-bot-api-secret-token'];
    return String(got || '') === expected;
};

const webhook = async (req, res) => {
    try {
        if (!verifyWebhookSecret(req)) {
            return res.status(401).json({ message: 'Webhook secret không khớp.' });
        }
        await handleUpdate(req.body || {});
        res.json({ ok: true });
    } catch (error) {
        console.error('Telegram webhook:', error.message);
        res.json({ ok: true });
    }
};

const randomOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const createLinkOtp = async (req, res) => {
    try {
        if (!isManagerRole(req.user?.TenVaiTro)) {
            return res.status(403).json({ message: DENY_NOT_MANAGER });
        }
        const pool = await readyPool();
        const sql = sqlTypes();
        const otp = randomOtp();
        await sqlReq(pool)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('MaTK', sql.Int, req.user.MaTK)
            .input('Otp', otpSqlType(sql), otp)
            .query(`
                IF EXISTS (SELECT 1 FROM TelegramDangKy WHERE MaNV=@MaNV)
                    UPDATE TelegramDangKy SET MaOTP=@Otp, HetHanOTP=DATEADD(minute, ${OTP_TTL_MIN}, GETDATE()),
                        SoLanSai=0, MaTK=@MaTK, NgayDangKy=GETDATE()
                    WHERE MaNV=@MaNV;
                ELSE
                    INSERT INTO TelegramDangKy (MaNV, MaTK, Bat, NgayDangKy, MaOTP, HetHanOTP, SoLanSai)
                    VALUES (@MaNV, @MaTK, 0, GETDATE(), @Otp, DATEADD(minute, ${OTP_TTL_MIN}, GETDATE()), 0);`);
        auditTelegram(req.user, 'Telegram tạo mã OTP', { uc: 'UC01', content: `OTP ${maskOtp(otp)}`, lenh: 'link-otp' });
        const expires = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
        res.json({
            otp,
            expiresAt: expires.toISOString(),
            ttlMinutes: OTP_TTL_MIN,
            botUsername: notify.botUsername(),
            botHandle: `@${notify.botUsername()}`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không tạo được mã liên kết Telegram. Kiểm tra migration.' });
    }
};

const getLinkStatus = async (req, res) => {
    try {
        const pool = await readyPool();
        const sql = sqlTypes();
        const result = await sqlReq(pool).input('MaNV', sql.VarChar, req.user.MaNV).query(`
            SELECT ChatId, Bat, NgayXacThuc, MaOTP, HetHanOTP FROM TelegramDangKy WHERE MaNV=@MaNV`);
        const row = result.recordset[0];
        const pending = row?.MaOTP && row.HetHanOTP && new Date(row.HetHanOTP) > new Date();
        res.json({
            bound: Boolean(row?.ChatId) && Number(row?.Bat) === 1,
            bat: row ? Number(row.Bat) === 1 : false,
            chatMasked: row?.ChatId ? maskChatId(row.ChatId) : '',
            verifiedAt: row?.NgayXacThuc || null,
            pendingOtp: pending ? String(row.MaOTP).trim() : null,
            otpExpiresAt: pending ? row.HetHanOTP : null,
            botUsername: notify.botUsername(),
            botHandle: `@${notify.botUsername()}`
        });
    } catch (error) {
        res.status(500).json({ message: 'Không tải được trạng thái Telegram.' });
    }
};

const unlinkSelf = async (req, res) => {
    try {
        const pool = await readyPool();
        const sql = sqlTypes();
        const current = await sqlReq(pool).input('MaNV', sql.VarChar, req.user.MaNV)
            .query('SELECT ChatId FROM TelegramDangKy WHERE MaNV=@MaNV');
        const chatId = current.recordset[0]?.ChatId;
        await sqlReq(pool).input('MaNV', sql.VarChar, req.user.MaNV).query(`
            UPDATE TelegramDangKy SET ChatId=NULL, Bat=0, MaOTP=NULL, HetHanOTP=NULL WHERE MaNV=@MaNV`);
        if (chatId) await reply(chatId, 'Đã hủy liên kết từ Fly.').catch(() => {});
        auditTelegram(req.user, 'Telegram hủy liên kết', { chatId, uc: 'UC01', lenh: 'unlink' });
        res.json({ message: 'Đã hủy liên kết Telegram.' });
    } catch (error) {
        res.status(500).json({ message: 'Không hủy được liên kết.' });
    }
};

const listBindings = async (req, res) => {
    try {
        const pool = await readyPool();
        const result = await sqlReq(pool).query(`
            SELECT d.MaNV, n.TenNV, v.TenVaiTro, d.ChatId, d.Bat, d.NgayXacThuc, d.LanHoatDongCuoi, t.TenDangNhap
            FROM TelegramDangKy d
            JOIN NhanVien n ON n.MaNV=d.MaNV
            LEFT JOIN TaiKhoan t ON t.MaNV=d.MaNV AND (d.MaTK IS NULL OR t.MaTK=d.MaTK)
            LEFT JOIN VaiTro v ON v.MaVaiTro=t.MaVaiTro
            WHERE d.ChatId IS NOT NULL
            ORDER BY n.TenNV`);
        res.json({
            items: result.recordset.map(row => ({
                ...row,
                ChatIdMasked: maskChatId(row.ChatId),
                ChatId: undefined
            })).map(({ ChatId, ...rest }) => rest)
        });
    } catch (error) {
        res.status(500).json({ message: 'Không tải được danh sách liên kết Telegram.' });
    }
};

const revokeBinding = async (req, res) => {
    try {
        const pool = await readyPool();
        const sql = sqlTypes();
        const maNV = String(req.params.maNV || '');
        const current = await sqlReq(pool).input('MaNV', sql.VarChar, maNV)
            .query('SELECT ChatId FROM TelegramDangKy WHERE MaNV=@MaNV');
        const chatId = current.recordset[0]?.ChatId;
        await sqlReq(pool).input('MaNV', sql.VarChar, maNV).query(`
            UPDATE TelegramDangKy SET ChatId=NULL, Bat=0, MaOTP=NULL, HetHanOTP=NULL WHERE MaNV=@MaNV`);
        if (chatId) await reply(chatId, 'Quản lý đã hủy liên kết Telegram của bạn.').catch(() => {});
        auditTelegram(req.user, 'Telegram hủy liên kết cưỡng chế', { chatId, uc: 'UC02', lenh: 'revoke', content: maNV });
        res.json({ message: `Đã hủy liên kết Telegram của ${maNV}.` });
    } catch (error) {
        res.status(500).json({ message: 'Không hủy được liên kết.' });
    }
};

const setChannel = async (req, res) => {
    try {
        const pool = await readyPool();
        const sql = sqlTypes();
        const maNV = String(req.params.maNV || '');
        const bat = req.body?.Bat === 0 || req.body?.Bat === false || req.body?.Bat === '0' ? 0 : 1;
        await sqlReq(pool).input('MaNV', sql.VarChar, maNV).input('Bat', sql.Bit, bat)
            .query('UPDATE TelegramDangKy SET Bat=@Bat WHERE MaNV=@MaNV AND ChatId IS NOT NULL');
        auditTelegram(req.user, bat ? 'Telegram bật kênh' : 'Telegram tắt kênh', { uc: 'UC02', content: maNV });
        res.json({ message: bat ? 'Đã bật kênh Telegram.' : 'Đã tắt kênh Telegram.', Bat: bat });
    } catch (error) {
        res.status(500).json({ message: 'Không đổi được trạng thái kênh.' });
    }
};

const startTelegramBot = async (options = {}) => {
    const token = notify.botToken();
    console.log(`Telegram: PID ${process.pid} khởi động bot`);
    if (!token) {
        notify.setTelegramStatus('off');
        console.log('Telegram: off (chưa có TELEGRAM_BOT_TOKEN)');
        return { mode: 'off' };
    }
    const fetchFn = options.fetchFn;
    if (fetchFn) notify.setTelegramRuntime({ fetchFn });
    const url = options.webhookUrl !== undefined ? options.webhookUrl : notify.webhookUrl();
    const apiOpts = { fetchFn };
    if (options.retries != null) apiOpts.retries = options.retries;
    if (options.timeoutMs != null) apiOpts.timeoutMs = options.timeoutMs;
    try {
        if (options.skipSchema !== true) {
            try {
                const pool = await poolOf();
                if (pool) await ensureTelegramSchema(pool);
            } catch (schemaError) {
                console.error('Telegram schema:', schemaError.message);
            }
        }
        await notify.telegramApi('getMe', {}, apiOpts);
        const startPollingMode = async ({ fallbackFromWebhook = false } = {}) => {
            if (pollState.running && options.startPolling !== false && !options.pollOnce) {
                console.log(`Telegram: polling đã chạy (PID ${process.pid}) — không start lần 2`);
                return { mode: 'polling', already: true, deleteWebhookFirst: true, fallbackFromWebhook };
            }
            pollAbort = false;
            await notify.telegramApi('deleteWebhook', { drop_pending_updates: false }, apiOpts);
            await registerMenuSafe(fetchFn);
            notify.setTelegramStatus('polling');
            const reason = fallbackFromWebhook
                ? 'webhook lỗi, fallback polling — bot vẫn chạy local'
                : 'đã deleteWebhook trước getUpdates';
            console.log(`Telegram: polling PID ${process.pid} (${reason})`);
            if (!options.skipCron) notify.startCompanionJobs();
            if (options.pollOnce) {
                await notify.telegramApi('getUpdates', { offset: pollState.offset, timeout: 0 }, apiOpts);
                return { mode: 'polling', deleteWebhookFirst: true, fallbackFromWebhook };
            }
            if (!pollState.running && options.startPolling !== false) {
                pollState.running = true;
                pollAbort = false;
                (async () => {
                    while (pollState.running && !pollAbort) {
                        try {
                            const data = await notify.telegramApi('getUpdates', {
                                offset: pollState.offset,
                                timeout: 25
                            }, { fetchFn, retries: 2 });
                            for (const update of data.result || []) {
                                pollState.offset = update.update_id + 1;
                                await handleUpdate(update).catch(err => console.error('Telegram update:', err.message));
                            }
                        } catch (error) {
                            const hint = unauthorizedHint(error);
                            if (/409|Conflict|process bot khác/i.test(String(error?.message || hint))) {
                                pollState.running = false;
                                pollAbort = true;
                                notify.stopCompanionJobs();
                                notify.setTelegramStatus('off');
                                console.error(`Telegram getUpdates 409 (PID ${process.pid}) — dừng polling.`);
                                if (process.env.TELEGRAM_BOT_CHILD === '1') process.exit(0);
                                return;
                            }
                            console.error('Telegram polling:', hint);
                            await new Promise(resolve => setTimeout(resolve, 2500));
                        }
                    }
                })();
            }
            return { mode: 'polling', deleteWebhookFirst: true, fallbackFromWebhook };
        };
        if (url) {
            try {
                pollAbort = true;
                pollState.running = false;
                await notify.telegramApi('setWebhook', {
                    url,
                    secret_token: notify.webhookSecret() || undefined,
                    allowed_updates: ['message', 'callback_query']
                }, apiOpts);
                await registerMenuSafe(fetchFn);
                notify.setTelegramStatus('webhook');
                console.log(`Telegram: webhook ${url} (không polling)`);
                if (!options.skipCron) notify.startCompanionJobs();
                return { mode: 'webhook', polling: false };
            } catch (webhookError) {
                pollAbort = false;
                const hint = unauthorizedHint(webhookError);
                console.error('Telegram webhook lỗi, chuyển polling:', hint);
                return startPollingMode({ fallbackFromWebhook: true });
            }
        }
        return startPollingMode();
    } catch (error) {
        notify.setTelegramStatus('off');
        const hint = unauthorizedHint(error);
        console.error('Telegram không khởi động được:', hint);
        return { mode: 'off', error: hint };
    }
};

const stopTelegramBot = () => {
    pollState.running = false;
    pollAbort = true;
    notify.stopCompanionJobs();
};

const isTelegramPolling = () => pollState.running && !pollAbort;

module.exports = {
    OTP_TTL_MIN,
    OTP_MAX_TRIES,
    FORBIDDEN_TEXT,
    FLY_BUTTONS,
    normalizeOtp,
    evaluateOtpAttempt,
    evaluateBind,
    parseCommand,
    userHasCommand,
    isManagerRole,
    flyKeyboard,
    startUnboundKeyboard,
    BOT_NATIVE_COMMANDS,
    nativeTelegramCommands,
    cmdHelp,
    cmdFly,
    handleUpdate,
    handlePrivateMessage,
    handleBindOtp,
    getChatLang: (chatId) => pendingLangByChat.get(String(chatId)) || 'vi',
    resetChatLangCache: () => {
        pendingLangByChat.clear();
        pendingAskByChat.clear();
        kbBoundByChat.clear();
        seenUpdateIds.clear();
        teleDecision.resetDecisionState();
        teleAsk.setAskOverride(null);
        teleAsk.setAskDocOverride(null);
        teleDocs.setDocumentPackOverride(null);
        teleDocs.setRecentDocsOverride(null);
        voucherImage.resetVoucherRenderPeek();
    },
    setDocumentPackOverride: teleDocs.setDocumentPackOverride,
    parseDocsArg: teleDocs.parseDocsArg,
    resetUpdateDedup,
    replyKeyboard,
    matchReplyCommand,
    removeKeyboardMarkup,
    parseGuideArg: teleGuide.parseGuideArg,
    buildGuideTopic: teleGuide.buildGuideTopic,
    buildGuideResult: teleGuide.buildGuideResult,
    resetTelegramSchemaCache,
    webhook,
    verifyWebhookSecret,
    createLinkOtp,
    getLinkStatus,
    unlinkSelf,
    listBindings,
    revokeBinding,
    setChannel,
    startTelegramBot,
    stopTelegramBot,
    isTelegramPolling,
    READ_CALLBACK,
    runFlyDecision: teleDecision.runFlyDecision,
    setFlyHandlerOverride: teleDecision.setFlyHandlerOverride,
    parseDecisionCallback: teleDecision.parseDecisionCallback,
    setAskOverride: teleAsk.setAskOverride,
    setAskDocOverride: teleAsk.setAskDocOverride,
    parseAskDocCallback: teleAsk.parseAskDocCallback,
    isTelegramAskEnabled: teleAsk.isTelegramAskEnabled
};
