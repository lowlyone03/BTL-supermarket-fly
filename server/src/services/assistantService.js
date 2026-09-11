const { poolPromise } = require('../config/db');
const { logAuditSafe } = require('./auditLog');
const { pickFaq, fold } = require('./assistantFaq');
const { collectContext, codesOf, hasUc } = require('./assistantTools');
const { attachEffectivePermissions } = require('./effectivePermissions');
const { handleDocumentIntent, detectDocumentIntent, emptyDocResult, specOf, canReadKind } = require('./assistantDocs');
const {
    describeAccess,
    sanitizeAssistantText,
    humanizeSources,
    humanizeEvidence
} = require('./assistantCopy');

const DAILY_LIMIT = Number(process.env.ASSISTANT_DAILY_LIMIT || 40);
const MAX_QUESTION = Number(process.env.ASSISTANT_MAX_QUESTION || 500);
const usage = new Map();

const SYSTEM_PROMPT = `Bạn là Trợ lý Fly — trợ lý nghiệp vụ nội bộ siêu thị Supermarket Fly (một cửa hàng, Hà Nội).
Trả lời tiếng Việt có dấu, ngắn gọn, chỉnh chu, dễ đọc cho quản lý cửa hàng.

Chỉ dùng số trong khối [SO LIEU] / [HOI THOAI] và luật trong khối [FAQ]. Không bịa số.
Mỗi con số kèm nguồn bằng tên màn hình tiếng Việt: Hộp thư, Dashboard quản lý, Hàng chờ duyệt, Công nợ, KQKD.
CẤM viết đường dẫn API, GET, endpoint, mã kỹ thuật.

Viết gạch đầu dòng thường (- ). CẤM bảng markdown (| --- |), CẤM ký hiệu ** ## * --- để trang trí.

Khi nói quyền: chỉ tiếng Việt theo vai trò, ví dụ "bạn đang đăng nhập Quản lý, có thể xem dashboard, hóa đơn, báo cáo tháng, công nợ tóm tắt, kết quả kinh doanh".
CẤM nêu mã UC hay "use case".

Quản lý là giám sát: được xem, in và tải hóa đơn mua/bán, đơn mua, phiếu nhập/xuất, đề nghị mua, đổi trả, phiếu thu/chi, công nợ NCC, báo cáo cửa hàng, KQKD, CĐPS, LCTT, lương gộp tháng. CẤM nói "tôi không có dữ liệu", "chỉ cấp công nợ/hôm nay", "hãy mở màn hình". Hệ thống tool đã trả list hoặc báo cáo thì chỉ tóm tắt số, không diễn giải quyền.

Mọi bộ phận (quản lý, mua hàng, thu ngân, kế toán, thủ kho) được hỏi trong phạm vi chức năng đã cấp. CẤM duyệt / phê duyệt / từ chối chứng từ, hoàn thành hóa đơn, trả NCC, ghi sổ, tick thanh toán, phân quyền hộ — kể cả khi người dùng có quyền duyệt trên dashboard. Duyệt chỉ do người bấm nút trên màn hình Fly hoặc Telegram.

Next action không thay thế xem/in trong widget. Không duyệt hộ, không trả tiền, không ghi sổ.

Cấm: duyệt chứng từ, hoàn thành hóa đơn, trả NCC, sửa tồn, lộ secret, viết SQL.

Ba cột tiền không trộn:
(A) Doanh thu / giá vốn lúc hóa đơn Hoàn thành.
(B) Két ca chỉ tiền mặt (TM thu − hoàn TM). QR/ZaloPay không vào két, không vào phiếu thu. Lịch sử MoMo (cùng PhuongThuc=QR) cũng không vào két.
(C) Nợ NCC chỉ sau đối chiếu 3 bên Khớp. Trả NCC = giảm 331, nằm dòng tiền — KHÔNG trừ kqkdLoiNhuan.

POS P1: Tiền mặt hoặc ZaloPay (PhuongThuc=QR, NguonXacNhan=ZaloPay). HĐ cũ có thể NguonXacNhan=MoMo — vẫn là QR, không vào két. Giá kệ đã gồm VAT.
Quản lý không xem tồn kho chi tiết toàn hàng, không xem danh sách chờ ghi sổ.

Nếu người dùng xin danh sách hóa đơn hoặc báo cáo tháng, hệ thống đã đưa list/số — chỉ nói ngắn và gợi ý chọn Xem / In hoặc Tải. Không viết đoạn giới thiệu chung về KQKD hay quyền.`;

const FORBIDDEN_ANSWER = `Trợ lý Fly không được phép duyệt chứng từ, phê duyệt phiếu chi, hoàn tiền, hoàn thành hóa đơn, trả nhà cung cấp, ghi sổ, tick thanh toán hay đổi phân quyền hộ.

Bạn mở đúng màn trên dashboard (Trung tâm phê duyệt, POS, công nợ, sổ cái, phân quyền) rồi bấm nút. Telegram nếu có nút duyệt thì đó là thao tác tay — trợ lý chat không gọi nút đó.`;

const SCOPE_ANSWER = `Câu hỏi này nằm ngoài chức năng được cấp cho tài khoản của bạn.

Trợ lý chỉ xem và giải thích trong phạm vi công việc đã phân. Hãy hỏi việc thuộc quầy/kho/mua hàng/kế toán của bạn, hoặc nhờ Quản lý cấp thêm quyền (tùy chỉnh theo nhân viên, không đổi cả vai trò).`;

const looksLikeSecret = (text) => /mat\s*khau|password|secret|token|otp|api[_-]?key/i.test(String(text || ''));

const dayKey = (maNV) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return `${maNV || 'anon'}|${day}`;
};

const consumeRate = (maNV) => {
    const key = dayKey(maNV);
    const used = Number(usage.get(key) || 0) + 1;
    if (used > DAILY_LIMIT) {
        const error = new Error(`Đã hết ${DAILY_LIMIT} câu hỏi trợ lý trong ngày. Mai hỏi tiếp hoặc mở đúng màn hình.`);
        error.status = 429;
        throw error;
    }
    usage.set(key, used);
};

const isForbiddenQuestion = (question) => {
    const text = fold(question);
    const listing = /(nhung|danh sach|liet ke|nao dang|dang cho|cho toi duyet|cho duyet|can chu y)/.test(text)
        && /(duyet|phe duyet)/.test(text)
        && !/(giup|gium|ho\b|bam|thuc hien|giup toi|ho toi)/.test(text)
        && !/(duyet|phe duyet|tu choi)\s+(po|pc|px|dn|hd|phieu|don)\s*\w+/i.test(text);
    if (listing) return false;
    const patterns = [
        /duyet.{0,80}(ho|giup|gium|giup toi|ho toi|lun|luon|ngay|giup minh)/,
        /phe\s*duyet.{0,80}(ho|giup|gium|phieu|don|po|pc)/,
        /tu\s*choi.{0,40}(ho|giup|gium)/,
        /\/approve/,
        /\/reject/,
        /approve.{0,40}(ho|giup|for me|this|it)/,
        /tra\s*ncc.{0,40}(giup|ho|gium)/,
        /chi\s*ncc.{0,40}(giup|ho|gium)/,
        /lap\s*phieu\s*chi.{0,40}(giup|ho)/,
        /hoan\s*thanh\s*hoa\s*don/,
        /completeinvoice/,
        /tick\s*momo/,
        /tick\s*zalopay/,
        /ghi\s*so.{0,40}(giup|ho)/,
        /khoa\s*ky.{0,40}(giup|ho)/,
        /\/ask.{0,40}\/approve/,
        /bam\s*(nut\s*)?duyet/,
        /duyet\s+(po|pc|px|dn|hd)\w*/i,
        /duyet\s+phieu(\s+chi)?/,
        /duyet\s+don\s+mua/,
        /phan\s*quyen.{0,40}(giup|ho)/,
        /cap\s*quyen.{0,40}(giup|ho)/,
        /hoan\s*tien.{0,40}(giup|ho|gium)/
    ];
    return patterns.some((re) => re.test(text));
};

const SCOPE_INTENTS = [
    { re: /cong\s*no|phieu\s*chi|tra\s*ncc|han\s*thanh\s*toan/, uc: ['UC28', 'UC09', 'UC10'] },
    { re: /ghi\s*so|so\s*cai|khoa\s*ky|but\s*toan/, uc: ['UC37', 'UC38', 'UC39'] },
    { re: /doi\s*chieu\s*hoa\s*don\s*mua|hoa\s*don\s*mua/, uc: ['UC27', 'UC10'] },
    { re: /ton\s*kho|duoi\s*dinh\s*muc|phieu\s*nhap|phieu\s*xuat|kiem\s*ke/, uc: ['UC15', 'UC16', 'UC17', 'UC18', 'UC19', 'UC20'] },
    { re: /de\s*nghi\s*mua|don\s*mua|nha\s*cung\s*cap|ncc\s+nao/, uc: ['UC11', 'UC12', 'UC13', 'UC14', 'UC05', 'UC10'] },
    { re: /bang\s*luong|phieu\s*chi\s*luong/, uc: ['UC33', 'UC32'] },
    { re: /kqkd|ket\s*qua\s*kinh\s*doanh|bang\s*can\s*doi/, uc: ['UC43', 'UC10'] },
    { re: /doi\s*soat\s*(nh|ngan\s*hang)|sao\s*ke/, uc: ['UC42'] }
];

const isOutOfScopeQuestion = (question, user) => {
    const text = fold(question);
    const hit = SCOPE_INTENTS.find((item) => item.re.test(text));
    if (!hit) return false;
    if (fold(user?.TenVaiTro) === 'quan ly') return false;
    return !hit.uc.some((code) => hasUc(user, code));
};

const resolveProvider = (override) => {
    if (override) return override;
    const name = String(process.env.ASSISTANT_PROVIDER || 'genspark').trim().toLowerCase();
    if (name === 'genspark') return require('./providers/genspark');
    if (name === 'openai') return require('./providers/openai');
    if (name === 'gemini') return require('./providers/gemini');
    if (name === 'ollama') return require('./providers/ollama');
    if (name === 'codecraft') return require('./providers/codecraft');
    if (name === 'mock') {
        return {
            complete: async () => ({ text: 'Trợ lý mock: dùng số trong [SO LIEU], không bịa.\nNguồn: mock', model: 'mock' })
        };
    }
    return require('./providers/genspark');
};

const clipQuestion = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION);

const redactPii = (text) => String(text || '')
    .replace(/\b0\d{8,10}\b/g, (m) => `****${m.slice(-4)}`)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[ẩn email]');

const clipHistory = (history) => {
    if (!Array.isArray(history)) return [];
    return history.slice(-6).map((turn) => ({
        role: turn.role === 'assistant' || turn.role === 'bot' ? 'assistant' : 'user',
        text: clipQuestion(turn.text || turn.content).slice(0, 220)
    })).filter((turn) => turn.text);
};

const packContext = ({ user, question, snapshot, history }) => {
    const role = snapshot.roleLabel || user.TenVaiTro || '';
    const quyen = describeAccess(user || { TenVaiTro: role }, snapshot.permissions || codesOf(user));
    const faq = sanitizeAssistantText(pickFaq(question, 3) || '- (không khớp FAQ)');
    const turns = clipHistory(history);
    const convo = turns.length
        ? turns.map((turn) => `${turn.role === 'user' ? 'Bạn' : 'Trợ lý'}: ${sanitizeAssistantText(turn.text)}`).join('\n')
        : '(không có)';
    return [
        `[VAI TRO]\n${role}`,
        `[QUYEN]\n${quyen}`,
        `[FAQ]\n${faq}`,
        `[HOI THOAI]\n${convo}`,
        `[SO LIEU]\n${sanitizeAssistantText(redactPii(snapshot.soLieu || 'không lấy được số liệu, không bịa'))}`,
        `[CAM]\nKhông duyệt. Không bịa. KQKD không trừ trả NCC. Quản lý được xem/in/tải hóa đơn, phiếu, đơn mua, báo cáo tháng. CẤM "không có dữ liệu / chỉ cấp công nợ / chỉ có hôm nay / mở màn hình". Không viết đường dẫn API. Không nêu mã UC. Không vẽ bảng markdown.`
    ].join('\n\n');
};

const auditAsk = async ({ req, user, question, result, blocked }) => {
    const content = looksLikeSecret(question) ? '[đã ẩn — câu hỏi giống mật khẩu]' : clipQuestion(question).slice(0, 120);
    await logAuditSafe({
        user,
        req,
        action: 'Trợ lý AI',
        table: 'TaiKhoan',
        recordId: user?.MaNV || null,
        uc: 'UC01',
        result: blocked ? 'Từ chối' : result,
        content
    });
};

const ask = async ({
    req, user, question, history, historyTurns, provider, pool, channel, tab
} = {}) => {
    const text = clipQuestion(question);
    if (!text) {
        const error = new Error('Hãy nhập câu hỏi.');
        error.status = 400;
        throw error;
    }
    consumeRate(user?.MaNV);
    try {
        const db = pool || await poolPromise;
        await attachEffectivePermissions(db, user);
    } catch { /* giữ Quyen theo vai trò */ }
    const resolvedChannel = channel === 'telegram' ? 'telegram' : 'electron';
    const resolvedTab = tab || (/h[oô]m\s*nay/i.test(text) ? 'homnay' : 'chat');
    if (isForbiddenQuestion(text)) {
        await auditAsk({ req, user, question: text, result: 'Từ chối', blocked: true });
        return {
            answer: FORBIDDEN_ANSWER,
            sources: ['Chính sách trợ lý Fly — không thao tác chứng từ'],
            evidence: [{ claim: 'Từ chối duyệt / ghi sổ hộ', numbers: [], source: 'Chính sách trợ lý', confidence: 'high' }],
            nextActions: [{ label: 'Mở Trung tâm phê duyệt', target: 'manager-purchase-approvals' }],
            blocked: true,
            model: null,
            channel: resolvedChannel,
            tab: resolvedTab
        };
    }
    if (isOutOfScopeQuestion(text, user)) {
        await auditAsk({ req, user, question: text, result: 'Ngoài phạm vi', blocked: true });
        return {
            answer: SCOPE_ANSWER,
            sources: ['Phân quyền nhân viên / vai trò'],
            evidence: [{ claim: 'Ngoài chức năng được cấp', numbers: codesOf(user), source: 'Phân quyền', confidence: 'high' }],
            nextActions: [],
            blocked: true,
            outOfScope: true,
            model: null,
            channel: resolvedChannel,
            tab: resolvedTab
        };
    }
    const docIntent = detectDocumentIntent(text);
    if (docIntent) {
        const spec = specOf(docIntent.kind);
        if (spec && canReadKind(spec, user)) {
        try {
            const db = pool || await poolPromise;
            const listed = await handleDocumentIntent(db, user, text);
            if (listed) {
                await auditAsk({ req, user, question: text, result: 'Thành công', blocked: false });
                return {
                    ...listed,
                    answer: sanitizeAssistantText(listed.answer),
                    sources: humanizeSources(listed.sources),
                    evidence: humanizeEvidence(listed.evidence),
                    channel: resolvedChannel,
                    tab: resolvedTab
                };
            }
        } catch {
            const fallback = emptyDocResult(docIntent.period, { id: docIntent.kind, loai: docIntent.loai, label: 'Chứng từ', title: 'CHỨNG TỪ', source: 'Số liệu hệ thống', mode: 'list' });
            return {
                ...fallback,
                channel: resolvedChannel,
                tab: resolvedTab
            };
        }
        }
    }

    let snapshot = { soLieu: 'không lấy được số liệu, không bịa', sources: [], permissions: codesOf(user), roleLabel: user?.TenVaiTro };
    try {
        const db = pool || await poolPromise;
        snapshot = await collectContext(db, user);
    } catch {
        snapshot.soLieu = 'không lấy được số liệu, không bịa';
    }

    const packed = packContext({
        user,
        question: text,
        snapshot,
        history: historyTurns || history
    });
    const complete = resolveProvider(provider).complete;
    const result = await complete({
        system: SYSTEM_PROMPT,
        user: `Câu hỏi:\n${text}\n\n${packed}`,
        maxTokens: 700
    });
    await auditAsk({ req, user, question: text, result: 'Thành công', blocked: false });
    const pack = snapshot.pack || {};
    return {
        answer: sanitizeAssistantText(result.text || ''),
        sources: humanizeSources(snapshot.sources),
        evidence: humanizeEvidence((pack.anomalies || []).slice(0, 3).map((item) => ({
            claim: item.object || item.type,
            numbers: [item.evidence],
            source: item.source,
            confidence: item.confidence || 'medium'
        }))),
        nextActions: [
            ...((pack.priorities || []).map((item) => item.nextAction).filter(Boolean)),
            ...((pack.anomalies || []).map((item) => item.nextAction).filter(Boolean))
        ].filter((item, index, all) => item?.target && all.findIndex((row) => row.target === item.target) === index).slice(0, 4),
        invoices: [],
        invoiceKind: null,
        kind: null,
        items: [],
        print: null,
        report: null,
        blocked: false,
        model: result.model || null,
        channel: resolvedChannel,
        tab: resolvedTab
    };
};

const getBrief = async ({ user, pool, period } = {}) => {
    const { buildBrief } = require('./analyticsEngine');
    const db = pool || await poolPromise;
    return buildBrief(db, user, { period });
};

const runUserScenario = async ({ user, type, params, pool } = {}) => {
    const { buildBrief } = require('./analyticsEngine');
    const { runScenario } = require('./scenarioEngine');
    const db = pool || await poolPromise;
    const period = params?.period || params?.month || '';
    const pack = await buildBrief(db, user, { period });
    return runScenario({ type, params: { ...params, period }, snapshot: pack.scenario });
};

module.exports = {
    ask,
    getBrief,
    runUserScenario,
    isForbiddenQuestion,
    isOutOfScopeQuestion,
    packContext,
    clipHistory,
    consumeRate,
    usage,
    FORBIDDEN_ANSWER,
    SCOPE_ANSWER,
    SYSTEM_PROMPT
};
