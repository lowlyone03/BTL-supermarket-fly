const { poolPromise } = require('../config/db');
const { logAuditSafe } = require('./auditLog');
const { pickFaq, fold } = require('./assistantFaq');
const { collectContext, codesOf } = require('./assistantTools');

const DAILY_LIMIT = Number(process.env.ASSISTANT_DAILY_LIMIT || 40);
const MAX_QUESTION = Number(process.env.ASSISTANT_MAX_QUESTION || 500);
const usage = new Map();

const SYSTEM_PROMPT = `Bạn là Fly Intelligence Center — trợ lý nghiệp vụ nội bộ siêu thị Supermarket Fly (một cửa hàng, Hà Nội).
Trả lời tiếng Việt có dấu, ngắn gọn, chỉnh chu.

Chỉ dùng số trong khối [SO LIEU] / [HOI THOAI] và luật trong khối [FAQ]. Không bịa số.
Mỗi con số phải có dòng Nguồn ngay dưới (mã chứng từ hoặc tên báo cáo).
Next action chỉ là hướng dẫn mở màn hình dashboard, không click hộ, không duyệt, không trả tiền, không ghi sổ.

Không biết, thiếu quyền, hoặc [SO LIEU] ghi "không lấy được" → nói rõ và gợi ý mở đúng màn. Không đoán.

Cấm: duyệt chứng từ, hoàn thành hóa đơn, trả NCC, sửa tồn, lộ secret, viết SQL.

Ba cột tiền không trộn:
(A) Doanh thu / giá vốn lúc hóa đơn Hoàn thành.
(B) Két ca chỉ tiền mặt (TM thu − hoàn TM). MoMo không vào két, không vào phiếu thu.
(C) Nợ NCC chỉ sau đối chiếu 3 bên Khớp. Trả NCC = giảm 331, nằm dòng tiền — KHÔNG trừ kqkdLoiNhuan.

POS P1: Tiền mặt hoặc MoMo (PhuongThuc=QR, NguonXacNhan=MoMo). Giá kệ đã gồm VAT.
Quản lý không có UC15 / UC37: không mô tả tồn chi tiết toàn hàng, không danh sách chờ ghi sổ.`;

const FORBIDDEN_ANSWER = `Trợ lý Fly không được phép duyệt chứng từ, hoàn thành hóa đơn, trả nhà cung cấp, ghi sổ hay tick thanh toán hộ.

Bạn mở đúng màn trên dashboard (Trung tâm phê duyệt, POS, công nợ, sổ cái) để thao tác. Telegram đã có nút duyệt riêng — trợ lý không gọi nút đó.`;

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
    const patterns = [
        /duyet.{0,60}(ho|giup|gium)/,
        /tu\s*choi.{0,40}(ho|giup|gium)/,
        /\/approve/,
        /\/reject/,
        /approve.{0,40}(ho|giup|for me)/,
        /tra\s*ncc.{0,40}(giup|ho|gium)/,
        /chi\s*ncc.{0,40}(giup|ho|gium)/,
        /lap\s*phieu\s*chi.{0,40}(giup|ho)/,
        /hoan\s*thanh\s*hoa\s*don/,
        /completeinvoice/,
        /tick\s*momo/,
        /ghi\s*so.{0,40}(giup|ho)/,
        /khoa\s*ky.{0,40}(giup|ho)/
    ];
    return patterns.some((re) => re.test(text));
};

const resolveProvider = (override) => {
    if (override) return override;
    const name = String(process.env.ASSISTANT_PROVIDER || 'codecraft').trim().toLowerCase();
    if (name === 'openai') return require('./providers/openai');
    if (name === 'gemini') return require('./providers/gemini');
    if (name === 'ollama') return require('./providers/ollama');
    if (name === 'mock') {
        return {
            complete: async () => ({ text: 'Trợ lý mock: dùng số trong [SO LIEU], không bịa.\nNguồn: mock', model: 'mock' })
        };
    }
    return require('./providers/codecraft');
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
    const quyen = (snapshot.permissions || codesOf(user)).join(', ');
    const faq = pickFaq(question, 3) || '- (không khớp FAQ)';
    const turns = clipHistory(history);
    const convo = turns.length
        ? turns.map((turn) => `${turn.role === 'user' ? 'Bạn' : 'Trợ lý'}: ${turn.text}`).join('\n')
        : '(không có)';
    return [
        `[VAI TRO]\n${role}`,
        `[QUYEN]\n${quyen || 'UC01'}`,
        `[FAQ]\n${faq}`,
        `[HOI THOAI]\n${convo}`,
        `[SO LIEU]\n${redactPii(snapshot.soLieu || 'không lấy được số liệu, không bịa')}`,
        `[CAM]\nKhông duyệt. Không bịa. KQKD không trừ trả NCC. Chỉ dùng số trong [SO LIEU]. Thiếu quyền thì nói thiếu quyền. Next action = mở màn hình, không thao tác hộ.`
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

const ask = async ({ req, user, question, history, provider, pool } = {}) => {
    const text = clipQuestion(question);
    if (!text) {
        const error = new Error('Hãy nhập câu hỏi.');
        error.status = 400;
        throw error;
    }
    consumeRate(user?.MaNV);
    if (isForbiddenQuestion(text)) {
        await auditAsk({ req, user, question: text, result: 'Từ chối', blocked: true });
        return {
            answer: FORBIDDEN_ANSWER,
            sources: ['Chính sách trợ lý Fly — không thao tác chứng từ'],
            evidence: [{ claim: 'Từ chối thao tác hộ', numbers: [], source: 'Chính sách trợ lý', confidence: 'high' }],
            nextActions: [{ label: 'Mở Trung tâm phê duyệt', target: 'manager-purchase-approvals' }],
            blocked: true,
            model: null
        };
    }

    let snapshot = { soLieu: 'không lấy được số liệu, không bịa', sources: [], permissions: codesOf(user), roleLabel: user?.TenVaiTro };
    try {
        const db = pool || await poolPromise;
        snapshot = await collectContext(db, user);
    } catch {
        snapshot.soLieu = 'không lấy được số liệu, không bịa';
    }

    const packed = packContext({ user, question: text, snapshot, history });
    const complete = resolveProvider(provider).complete;
    const result = await complete({
        system: SYSTEM_PROMPT,
        user: `Câu hỏi:\n${text}\n\n${packed}`,
        maxTokens: 700
    });
    await auditAsk({ req, user, question: text, result: 'Thành công', blocked: false });
    const pack = snapshot.pack || {};
    return {
        answer: String(result.text || '').trim(),
        sources: snapshot.sources || [],
        evidence: (pack.anomalies || []).slice(0, 3).map((item) => ({
            claim: item.object || item.type,
            numbers: [item.evidence],
            source: item.source,
            confidence: item.confidence || 'medium'
        })),
        nextActions: [
            ...((pack.priorities || []).map((item) => item.nextAction).filter(Boolean)),
            ...((pack.anomalies || []).map((item) => item.nextAction).filter(Boolean))
        ].filter((item, index, all) => item?.target && all.findIndex((row) => row.target === item.target) === index).slice(0, 4),
        blocked: false,
        model: result.model || null
    };
};

const getBrief = async ({ user, pool } = {}) => {
    const { buildBrief } = require('./analyticsEngine');
    const db = pool || await poolPromise;
    return buildBrief(db, user);
};

const runUserScenario = async ({ user, type, params, pool } = {}) => {
    const { buildBrief } = require('./analyticsEngine');
    const { runScenario } = require('./scenarioEngine');
    const db = pool || await poolPromise;
    const pack = await buildBrief(db, user);
    return runScenario({ type, params, snapshot: pack.scenario });
};

module.exports = {
    ask,
    getBrief,
    runUserScenario,
    isForbiddenQuestion,
    packContext,
    clipHistory,
    consumeRate,
    usage,
    FORBIDDEN_ANSWER,
    SYSTEM_PROMPT
};
