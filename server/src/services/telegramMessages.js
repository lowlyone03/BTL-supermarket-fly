const {
    formatVnDate, formatVnDateTime: formatClockDateTime, looksLikeJsDateString, operatingDayOf
} = require('./telegramClock');
const { currentPeriodDefaults } = require('./reportingPeriod');

const RULE = '────────────────────';
const RULE_TOP = '━━━━━━━━━━━━━━━━━━━━';
const BAR_ON = '▰';
const BAR_OFF = '▱';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const progressBar = (value, max, width = 8) => {
    const total = Number(max);
    const current = Number(value);
    const ratio = total > 0 && Number.isFinite(current) ? clamp(current / total, 0, 1) : 0;
    const filled = Math.round(ratio * width);
    return `${BAR_ON.repeat(filled)}${BAR_OFF.repeat(width - filled)} ${Math.round(ratio * 100)}%`;
};

const statusBadge = (status) => {
    const raw = String(status || 'Chưa xác định').trim();
    const key = raw.toLocaleLowerCase('vi-VN');
    let icon = '⚪';
    if (/thành công|đã duyệt|đã xác nhận|đã thanh toán|đã tất toán|hoàn thành|đã đối chiếu|đã chốt/.test(key)) icon = '🟢';
    else if (/chờ|đang|nháp|mở/.test(key)) icon = '🟡';
    else if (/quá hạn|thất bại|từ chối|bị khóa|hủy|lệch/.test(key)) icon = '🔴';
    return `${icon} <b>${escapeHtml(raw)}</b>`;
};

const channelIcon = (name) => {
    const key = String(name || '').toLocaleLowerCase('vi-VN');
    if (key.includes('tiền mặt')) return '💵';
    if (key.includes('qr')) return '📱';
    if (key.includes('thẻ')) return '💳';
    if (key.includes('chuyển khoản')) return '🏦';
    return '💠';
};

const sectionTitle = (icon, title) => `${icon} <b>${escapeHtml(title)}</b>`;

const TELEGRAM_LEFTOVER_RE = /Bot nhận:|mã ngôn ngữ|Alt menu/i;

const stripTelegramLeftovers = (text) => String(text || '')
    .split('\n')
    .filter((line) => !TELEGRAM_LEFTOVER_RE.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const tidyLines = (lines = []) => {
    const out = [];
    for (const value of lines) {
        if (value == null || value === false) continue;
        const line = String(value);
        if (!line && (!out.length || out[out.length - 1] === '')) continue;
        out.push(line);
    }
    while (out[out.length - 1] === '') out.pop();
    return stripTelegramLeftovers(out.join('\n'));
};

const formatMoney = (value) => {
    const number = Number(value);
    const amount = Number.isFinite(number) ? Math.round(number) : 0;
    const sign = amount < 0 ? '−' : '';
    const grouped = String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${grouped} ₫`;
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const moneyCode = value => `<code>${formatMoney(value)}</code>`;
const textCode = value => `<code>${escapeHtml(value)}</code>`;

const liteMarkdownToHtml = (value) => {
    let text = escapeHtml(String(value ?? ''));
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    text = text.replace(/__([^_\n]+)__/g, '<b>$1</b>');
    text = text.replace(/`([^`]+)`/g, '<b>$1</b>');
    text = text.replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1<i>$2</i>');
    text = text.replace(/^#{1,6}\s+/gm, '');
    text = text.replace(/^\s*[-•]\s*/gm, '• ');
    text = text.replace(/\*\*/g, '');
    return text;
};

const splitTelegramText = (text, max = 3900) => {
    const source = String(text || '');
    if (source.length <= max) return source ? [source] : [''];
    const parts = [];
    let rest = source;
    while (rest.length) {
        if (rest.length <= max) {
            parts.push(rest);
            break;
        }
        let cut = rest.lastIndexOf('\n', max);
        if (cut < Math.floor(max * 0.45)) cut = max;
        parts.push(rest.slice(0, cut));
        rest = rest.slice(cut).replace(/^\n+/, '');
    }
    if (parts.length <= 1) return parts;
    return parts.map((part, index) => (
        index === 0 ? `${part}\n\n<i>— trang 1/${parts.length} —</i>` : `<i>— trang ${index + 1} —</i>\n${part}`
    ));
};

const formatTelegramDate = (value, lang = 'vi') => {
    const text = formatVnDate(value, lang);
    return looksLikeJsDateString(text) ? '' : text;
};

const formatVnDateTime = (value, lang = 'vi') => {
    const text = formatClockDateTime(value, lang);
    return looksLikeJsDateString(text) ? '' : text;
};

const formatTelegramValue = (value, lang = 'vi') => {
    if (value == null || value === '') return '—';
    if (value instanceof Date) return formatVnDateTime(value, lang) || '—';
    if (looksLikeJsDateString(value)) return formatVnDateTime(value, lang) || '—';
    return String(value);
};

const prettyShiftName = (tenCa) => {
    const name = String(tenCa || '').trim();
    if (!name || name === '—') return '—';
    return /^ca\b/i.test(name) ? name : `Ca ${name}`;
};

const ATTENDANCE_NOTE_VI = 'Ca đã đóng — chờ duyệt công (UC32). Nút ✅ Duyệt ghi nhật ký như Fly → Duyệt công.';
const ATTENDANCE_FLY_PATH = 'Fly → Duyệt công';

const isAttendanceInbox = (item) => {
    const id = String(item?.id || '');
    const title = String(item?.title || '');
    return id.startsWith('cc:') || /chấm công chờ duyệt/i.test(title);
};

const countAttendancePending = (inbox = []) => inbox.filter(isAttendanceInbox).length;

const maskOtp = value => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 3) return '***';
    return `${digits.slice(0, 3)}***`;
};

const maskChatId = value => {
    const id = String(value || '').trim();
    if (!id) return '';
    if (id.length <= 4) return '****';
    return `${id.slice(0, 2)}****${id.slice(-2)}`;
};

const isManagerRole = (role) => String(role || '').toLocaleLowerCase('vi-VN').includes('quản lý');

const telegramAudience = (person = {}) => {
    const role = String(person.TenVaiTro || person.role || '').toLocaleLowerCase('vi-VN');
    const login = String(person.TenDangNhap || person.username || '').trim().toLowerCase();
    if (role.includes('kế toán') || /\bketoan\b/.test(role)) return 'admin';
    if (login === 'admin' || role.includes('quản trị')) return 'admin';
    if (role.includes('quản lý') || role.includes('manager')) {
        return login && login !== 'admin' ? 'ql' : 'admin';
    }
    return 'ql';
};

const LANGS = ['vi', 'en', 'zh'];
const DEFAULT_LANG = 'vi';

const normalizeLang = (value) => {
    const key = String(value || '').trim().toLowerCase();
    if (key === 'zh' || key === 'zh-cn' || key === 'cn') return 'zh';
    if (key === 'en' || key === 'en-us' || key === 'en-gb') return 'en';
    if (key === 'vi' || key === 'vn') return 'vi';
    return DEFAULT_LANG;
};

const interpolate = (text, vars = {}) => String(text || '').replace(/\{(\w+)\}/g, (_, key) => (
    vars[key] == null ? '' : String(vars[key])
));

const I18N = {
    vi: {
        denyView: 'Tài khoản của bạn không xem mục này trong Fly.',
        denyUnbound: 'Hãy mở Supermarket Fly → Liên kết Telegram → Tạo mã, rồi gửi /start kèm 6 số.',
        denyStranger: 'Bot nội bộ Supermarket Fly. Chỉ Quản lý đã liên kết mới dùng được.',
        denyNotManager: 'Chỉ tài khoản Quản lý được liên kết.',
        denyNotManagerCmd: 'Chỉ Quản lý mới xem được số liệu trên bot.',
        denyGroup: 'Bot chỉ dùng chat riêng với tài khoản cửa hàng.',
        denyLocked: 'Tài khoản cửa hàng đang bị khóa. Không dùng được bot.',
        denyMuted: 'Kênh Telegram của bạn đang tắt. Nhờ Quản lý bật lại trên Fly.',
        denyWrite: 'Không duyệt bằng lệnh /approve. Không /pay, không hoàn thành hóa đơn, không chi NCC từ chat. Việc chờ: bấm nút trên tin chờ duyệt (ghi nhật ký như Fly).',
        flyHint: 'Duyệt trên Telegram ghi nhật ký giống bấm trên Fly.',
        helpNoWrite: 'Không /pay /complete. Duyệt PO/PX/KK/đổi trả/phiếu chi/công: nút trên tin chờ duyệt — ghi NhatKy như Fly.',
        flyMenu: 'Fly — dashboard cửa hàng (nút không có quyền đã ẩn).',
        unknownCmd: 'Bấm 📄 Chứng từ, 📊 Báo cáo, ⏳ Việc chờ hoặc gõ /help /fly.',
        storeBrand: 'SUPERMARKET FLY · Hà Nội',
        welcomeUnboundHi: 'Xin chào! 👋 Mình là companion của Quản lý trên Supermarket Fly.',
        welcomeUnboundAbout: 'Xem số liệu và duyệt việc chờ (ghi nhật ký như Fly). Chưa liên kết — chưa có số liệu.',
        welcomeUnboundOtpTitle: 'Liên kết tài khoản (chỉ Quản lý)',
        welcomeUnboundOtp1: '1. Đăng nhập Fly → góc phải → Liên kết Telegram → Tạo mã.',
        welcomeUnboundOtp2: '2. Quay lại chat này, gửi /start kèm 6 số (cách một dấu cách).',
        welcomeUnboundOtp3: 'Mã hết hạn sau 5 phút; sai 5 lần thì tạo mã mới trên Fly. OTP vai trò khác QL sẽ bị từ chối.',
        welcomeUnbound: [
            'Xin chào. Đây là kênh nội bộ Quản lý trên Supermarket Fly.',
            '',
            'Xem số liệu và duyệt việc chờ (ghi nhật ký như Fly).',
            '',
            'Chưa liên kết? Trên Fly: góc phải → Liên kết Telegram → Tạo mã, rồi gửi /start kèm 6 số.',
            'Ví dụ: /start 482913'
        ].join('\n'),
        welcomeBound: 'Kính chào Quản lý {name}. 🌟',
        welcomeBoundHi: 'Kính chào Quản lý {name}. 🌟',
        welcomeBoundP2: 'Kênh nội bộ Fly Hà Nội. Xem số liệu; duyệt PO, phiếu xuất, kiểm kê, đổi trả, phiếu chi, chấm công — ghi Nhật ký như Fly.',
        welcomeBoundP3: 'Bot giúp xem số liệu vận hành trong ngày và xử lý việc chờ duyệt ngay trên Telegram.',
        welcomeBoundP4: 'Quản lý duyệt được đơn mua (PO), phiếu xuất, kiểm kê, đổi trả, phiếu chi và chấm công — mỗi lần duyệt hoặc từ chối đều ghi Nhật ký như trên Fly.',
        welcomeDashTitle: 'Cửa hàng hôm nay',
        welcomeDashRevenue: 'Doanh thu',
        welcomeDashPending: 'Việc chờ',
        welcomeDashGap: 'Ca lệch',
        welcomeDashAttendance: 'Công chờ duyệt',
        welcomeBoundGuide: '📄 Chứng từ · /reports · 📚 /guide. Bấm Ẩn menu để đọc hết chat. Lịch sử: Fly → Nhật ký.',
        welcomeBoundNoApprove: 'Việc chờ: bấm ✅ Duyệt / ❌ Từ chối trên tin đó — đã ghi Nhật ký. Không chi lương / không hoàn thành HĐ từ lệnh chat.',
        welcomeBoundDocs: '📄 Chứng từ gồm đơn mua, phiếu nhập, hóa đơn, xuất kho, kiểm kê, đổi trả, phiếu chi và phiếu công.',
        welcomeBoundIdle: 'Không còn việc chờ — ngày vận hành đang ổn.',
        welcomeUnboundNote: 'Sau khi liên kết, Quản lý duyệt PO, phiếu xuất, kiểm kê, đổi trả, phiếu chi và chấm công trên tin chờ — ghi Nhật ký như Fly.',
        welcomeBoundLang: '🌐 Đổi nhãn: nút Ngôn ngữ (Tiếng Việt / English / 简体中文).',
        healthOk: 'Ổn định',
        healthWatch: 'Cần theo dõi',
        healthUrgent: 'Cần ưu tiên xử lý',
        opsWatchTitle: 'Việc cần xử lý',
        docsSection: 'Chứng từ',
        opsChips: 'Việc chờ {pending} · Công {attendance} · Ca lệch: {gap}',
        pendingAttendanceNote: 'Ca đã đóng — chờ duyệt công (UC32). Nút ✅ Duyệt ghi nhật ký như Fly → Duyệt công.',
        pendingAttendanceHint: '«Chờ duyệt» = NV đã hết ca. Duyệt trên Telegram hoặc Fly → Duyệt công (cả ngày cũ / ca hành chính).',
        attendanceFlyPath: 'Fly → Duyệt công',
        pushAttendanceTitle: 'CHẤM CÔNG CHỜ DUYỆT',
        welcomeGuest: [
            'Xin chào. Đây là bot nội bộ Supermarket Fly.',
            '',
            'Chỉ Quản lý đã liên kết mới xem được số liệu. Chat này không nhận dữ liệu cửa hàng.'
        ].join('\n'),
        startLinkGuide: [
            'HƯỚNG DẪN LIÊN KẾT (chỉ Quản lý)',
            '1. Đăng nhập Fly bằng tài khoản Quản lý (admin).',
            '2. Góc phải → Liên kết Telegram → Tạo mã.',
            '3. Quay lại chat này, gửi /start và 6 số (cách một dấu cách).',
            'Ví dụ: /start 482913',
            'Mã hết hạn sau 5 phút; sai 5 lần thì tạo mã mới trên Fly.',
            '',
            'OTP từ muahang / thukho / ketoan / thungan sẽ bị từ chối.',
            'Chỉ chat riêng với bot. Không gửi mã vào group.'
        ].join('\n'),
        otpNotFound: 'Mã không đúng hoặc không còn hiệu lực. Tạo mã mới trong Fly.',
        otpLocked: 'Mã đã bị khóa vì nhập sai quá 5 lần. Tạo mã mới trong Fly.',
        otpExpired: 'Mã đã hết hạn, tạo mã mới trong Fly.',
        otpWrong: 'Mã không đúng. Còn {left} lần thử.',
        otpChatTaken: 'Chat này đang gắn nhân viên khác. Hủy liên kết trên Fly hoặc nhờ QL.',
        bindSuccess: 'Đã liên kết {name} ({role}). Gõ /fly',
        bindDbError: 'Không liên kết được do lỗi cơ sở dữ liệu. Gửi lại /start kèm 6 số sau vài giây.',
        unlinkOk: 'Đã hủy liên kết Telegram. Tạo mã mới trên Fly khi cần.',
        unlinkOldChat: 'Đã hủy liên kết vì đăng ký máy mới.',
        langChosen: 'Đã chọn Tiếng Việt.',
        langMenuTitle: 'Chọn ngôn ngữ nhãn (số tiền không đổi).',
        btnLinkGuide: 'Hướng dẫn liên kết',
        btnHelp: 'Trợ giúp /help',
        flyHome: '🔄 Làm mới',
        navHome: '🏠 Tổng quan',
        flyToday: '📊 Hôm nay',
        flyRevenue: '💰 Doanh thu',
        flyDebt: '🧾 Công nợ',
        flyLowstock: '📦 Tồn thấp',
        flyPending: '⏳ Việc chờ',
        flyReports: '📊 Báo cáo',
        flyShifts: '🕐 Ca',
        flyPayments: '💳 Thanh toán',
        flyAlerts: '🔔 Cảnh báo',
        flyLang: '🌐 Ngôn ngữ',
        flyHelp: '❓ Trợ giúp',
        flyDocs: '📄 Chứng từ',
        kbDocs: '📄 Chứng từ',
        kbLowstock: '🛍️ Tồn thấp',
        kbPending: '⏳ Việc chờ',
        kbReports: '📊 Báo cáo',
        kbRevenue: '💰 Doanh thu',
        kbDebt: '🧾 Công nợ',
        kbShifts: '🕐 Ca & quỹ',
        kbPayments: '💳 Thanh toán',
        kbAlerts: '🔔 Cảnh báo',
        kbFly: '🔄 Cập nhật',
        kbLang: '🌐 Ngôn ngữ',
        kbHelp: '❓ Trợ giúp',
        kbAsk: '💬 Hỏi trợ lý',
        askPrompt: 'Bạn muốn hỏi gì? Gõ câu hỏi ở tin tiếp theo, ví dụ: hôm nay cần chú ý gì?',
        askUsage: 'Hỏi Trợ lý Fly. Gõ: /ask hôm nay cần chú ý gì?\nTrợ lý không duyệt chứng từ. Việc chờ: nút trên tin, hoặc /pending.',
        kbLink: '🔗 Liên kết',
        kbGuide: '📚 Tài liệu',
        kbHide: '⬆️ Ẩn menu',
        kbShow: '⬇️ Hiện menu',
        kbPinHint: 'Menu nút nằm dưới khung chat. Điện thoại: nếu không thấy, bấm biểu tượng bàn phím (bốn ô) cạnh ô nhập tin.',
        flyGuide: '📚 Tài liệu',
        hideOk: 'Đã ẩn bàn phím. Đọc chat thoải mái.',
        showOk: 'Đã hiện lại menu.',
        showHint: 'Hiện lại: bấm ⬇️ Hiện menu dưới tin này, hoặc gửi /fly. Điện thoại: bấm biểu tượng bàn phím cạnh ô nhập.',
        hideAfterRead: 'Xong thì bấm ⬆️ Ẩn menu để đọc hết chat.',
        guidePickTitle: 'TÀI LIỆU / QUY TẮC',
        guidePickHint: 'Bấm một mục. Công thức đã chốt — không slide rỗng.',
        guideSrc: 'Nguồn đã chốt',
        guideRev: 'Doanh thu',
        guideGross: 'Giá vốn / lãi gộp',
        guidePnl: 'P&L điều hành',
        guideVat: 'Thuế / VAT',
        guideDebt: 'Công nợ NCC',
        guideCash: 'Két ca / phiếu thu',
        guidePay: 'Lương / duyệt công',
        guideRevWhen: 'Khi nào ghi DT',
        guideRevL1: 'Chỉ hóa đơn TrangThai = Hoàn thành (cột A).',
        guideRevL2: 'DT thuần =',
        guideRevF1: 'tổng TT HĐ hoàn thành − tiền hoàn đã hoàn thành',
        guideRevL3: 'Phiếu thu ca KHÔNG sinh doanh thu lần hai.',
        guideRevNo: 'Không làm',
        guideRevL4: 'Không bán chịu, không công nợ phải thu (không TK 131).',
        guideRevL5: 'Đổi trả không cộng DT lần hai.',
        guideRevL6: 'Bot không hoàn thành hóa đơn bán từ chat.',
        guideGrossF: 'Công thức (financialRules)',
        guideGrossF1: 'DT thuần =',
        guideGrossFx1: 'TT HĐ hoàn thành − tiền hoàn',
        guideGrossF2: 'GV thuần =',
        guideGrossFx2: 'GV HĐ − GV hàng trả nhập lại + GV hàng giao đổi',
        guideGrossF3: 'Lãi gộp =',
        guideGrossFx3: 'DT thuần − GV thuần',
        guideGrossEx: 'Ví dụ công thức (minh họa)',
        guideGrossEx1: 'DT thuần',
        guideGrossEx2: 'Cùng lúc trả NCC',
        guideGrossEx3: 'lãi gộp vẫn',
        guideGrossNo: 'Không trừ vào lãi gộp',
        guideGrossL1: 'KHÔNG trừ tiền trả NCC.',
        guideGrossL2: 'Bảng lương KHÔNG trừ vào lãi gộp.',
        guideGrossL3: '/today và tin 06:10 dùng lãi gộp — không copy P&L trừ NCC.',
        guidePnlL1: 'Màn QL «Cửa hàng đang lãi hay lỗ». Khác lãi gộp. Không phải báo cáo tài chính / sổ cái.',
        guidePnlF: 'P&L quản trị',
        guidePnlFx: 'KQKD: lãi gộp − lương đã khóa (− cước nếu có). Không trừ chi NCC.',
        guidePnlDiff: 'Khác lãi gộp',
        guidePnlL2: 'Lãi gộp dừng ở DT − GV. KQKD trừ lương/cước. Chi NCC là dòng tiền, không trừ lãi.',
        guidePnlL3: 'Chưa trừ: thuê mặt bằng, điện, nước (chưa có chứng từ).',
        guidePnlL4: 'Khi lỗ (hoặc DT < lương khóa): QL nhập kế hoạch ≥ 50 ký tự, gửi toàn cửa hàng.',
        guidePnlL5: 'KQKD không trừ chi NCC. Trường laiLoSauChiPhi (deprecated) vẫn trừ NCC cho FE cũ.',
        guideVatBuy: 'Mua (đã có)',
        guideVatL1: 'HĐ mua có ThueSuat / TienThue. VAT mua (1331) đã ghi trên dòng HĐ mua.',
        guideVatSell: 'Bán POS (sự thật đang chạy)',
        guideVatL2: 'Giá niêm yết trên quầy ĐÃ GỒM VAT (PHAM_VI 31/08).',
        guideVatL3: 'Hóa đơn BÁN hiện CHƯA lưu thuế — không cột ThueSuat/TienThue trên ChiTietHoaDon.',
        guideVatL4: 'Plan A chốt tách 511 / 33311 — CHƯA CODE.',
        guideVatPlan: 'Công thức Plan A (chưa chạy)',
        guideVatF1: 'Thuế dòng =',
        guideVatFx1: 'làm tròn(TT sau giảm × thuế / (100 + thuế))',
        guideVatF2: '511 =',
        guideVatFx2: 'TT sau giảm − thuế dòng',
        guideVatEx: 'Ví dụ 10%, khách trả',
        guideVatNow: 'Hiện POS ghi một số gồm VAT, chưa tách 511/33311.',
        guideDebtWhen: 'Khi nào sinh nợ',
        guideDebtL1: 'Chỉ khi đối chiếu 3 bên KHỚP: đơn + phiếu nhập + HĐ mua.',
        guideDebtL2: 'Số nợ =',
        guideDebtFx: 'TongCong HĐ (tiền hàng + thuế)',
        guideDebtL3: 'Lệch → không insert CongNoPhaiTra.',
        guideDebtPay: 'Khi nào giảm nợ',
        guideDebtL4: 'Lập phiếu / QL duyệt + giao quỹ: SoTienConLai GIỮ NGUYÊN.',
        guideDebtL5: 'Thanh toán TOÀN BỘ MỘT LẦN. Không trả trước, không trả từng phần.',
        guideDebtL6: 'Chỉ KT ghi thanh toán THÀNH CÔNG → SoTienConLai =',
        guideDebtNo: 'Cấm',
        guideDebtL7: 'Trả trước; nhiều phiếu / một nợ; giảm nợ lúc lập hoặc lúc QL duyệt.',
        guideCashF: 'Công thức két',
        guideCashF1: 'TM hệ thống =',
        guideCashFx1: 'TM thu thành công − hoàn TM đã hoàn thành',
        guideCashF2: 'Chênh lệch =',
        guideCashFx2: 'Thực nộp − theo hệ thống',
        guideCashL1: 'QR / thẻ / CK không vào két.',
        guideCashPt: 'Phiếu thu (UC29)',
        guideCashL2: 'Một ca một phiếu thu (MaCa UNIQUE).',
        guideCashL3: 'Xác nhận phiếu thu KHÔNG cộng DT, KHÔNG giảm nợ NCC.',
        guideCashL4: 'Lệch: bắt buộc lý do trên phiếu — không biên bản riêng.',
        guidePayAtt: 'Duyệt công → lương',
        guidePayL1: 'Chỉ công Đã duyệt (UC32) vào lương. Còn chờ → không lập bảng.',
        guidePayL2: 'Chỉ KT lập / khóa kỳ. QL lập → 403. GET không tự tạo bảng.',
        guidePayRate: 'Hệ số (BLLĐ + NĐ 145/2020)',
        guidePayR1: 'Ngày',
        guidePayR2: 'đêm',
        guidePayR3: 'Nghỉ tuần',
        guidePayR4: 'lễ trong ca',
        guidePayR5: 'Nghỉ lễ hưởng lương:',
        guidePayR6: 'đơn giá — chỉ người đã có công duyệt trong kỳ',
        guidePayFund: 'Quỹ và chi',
        guidePayL3: 'Duyệt phiếu / giao quỹ CHƯA trả lương. KT chi thành công mới Đã thanh toán.',
        guidePayL4: 'Quỹ lương: QL giao một cục cho KT (khác phiếu chi NCC từng phiếu).',
        guidePayL5: 'Tất toán',
        guidePayDay: 'mùng 10 tháng sau (kỳ 08 → 10/09)',
        guidePayL6: 'Lương KHÔNG trừ vào lãi gộp.',
        guidePayL7: 'Telegram: nút Duyệt công ghi NhatKy như Fly → Duyệt công.',
        btnApprove: '✅ Duyệt',
        btnReject: '❌ Từ chối',
        btnDetail: '📋 Chi tiết',
        btnDocs: '📄 Chứng từ',
        btnReports: '📊 Báo cáo',
        docsTitle: 'CHỨNG TỪ / GIẤY TỜ',
        docsIndexHint: 'Bấm loại giấy tờ bên dưới. Không cần gõ mã. Việc chờ vẫn có nút 📄 trên từng tin.',
        docsIndexFooter: 'PO: đơn + chuyến giao + phiếu nhập + HĐ mua (nếu có). PX / KK / đổi trả / phiếu chi / chấm công: phiếu đủ dòng. Đổi trả kèm hóa đơn gốc.',
        docsEmpty: 'Không có việc chờ. Bấm 📄 Chứng từ để chọn loại giấy tờ.',
        docsMissing: 'Không tìm thấy chứng từ này. Kiểm tra mã trên Fly.',
        docsUnknown: 'Không nhận mã chứng từ. Bấm 📄 Chứng từ rồi chọn loại, hoặc /docs po:PO00001',
        docsPickTitle: 'CHỌN LOẠI CHỨNG TỪ',
        docsPickHint: 'Bấm loại giấy tờ. Không cần gõ mã. Bot gửi 8–15 chứng từ mới nhất — bấm mã để xem bản in đủ dòng.',
        docsTypePo: 'Đơn mua',
        docsTypePn: 'Phiếu nhập',
        docsTypeHdm: 'Hóa đơn mua',
        docsTypeHd: 'Hóa đơn bán',
        docsTypePx: 'Phiếu xuất',
        docsTypeKk: 'Kiểm kê',
        docsTypeDt: 'Đổi trả',
        docsTypePc: 'Phiếu chi',
        docsTypeCc: 'Chấm công / phiếu công',
        docsListTitle: 'CHỨNG TỪ · {type}',
        docsListEmpty: 'Chưa có chứng từ loại này.',
        docsListHint: 'Bấm một mã để mở bản in HTML đủ dòng hàng.',
        docsBackTypes: '« Chọn loại',
        reportsPickTitle: 'CHỌN BÁO CÁO',
        reportsPickHint: 'Bấm một mục. Có báo cáo cửa hàng, báo cáo Thủ kho đã gửi và báo cáo bộ phận đã gửi.',
        rptWarehouse: '📦 Báo cáo Thủ kho đã gửi',
        rptDept: '📥 Báo cáo bộ phận đã gửi',
        rptDeptTitle: 'BÁO CÁO BỘ PHẬN ĐÃ GỬI',
        rptDeptHint: 'Bấm một số BCM / BCKT / BCTN để xem tóm tắt KPI. Không duyệt trên Telegram.',
        rptDeptEmpty: 'Chưa có kỳ nào bộ phận gửi.',
        rptDeptMissing: 'Không tìm thấy báo cáo bộ phận đã gửi.',
        rptDeptList: '📋 Kỳ đã gửi',
        rptWarehouseTitle: 'BÁO CÁO THỦ KHO ĐÃ GỬI',
        rptWarehouseHint: 'Bấm một số BCK để xem nhập–xuất–tồn, hàng rời kho bán, tồn thấp và đổi trả.',
        rptWarehouseEmpty: 'Chưa có kỳ nào Thủ kho gửi.',
        rptWarehouseMissing: 'Không tìm thấy báo cáo kho đã gửi.',
        rptWarehouseList: '📋 Kỳ đã gửi',
        rptStoreReports: '📊 Báo cáo cửa hàng',
        docsTypeBck: 'Báo cáo Thủ kho',
        docsTypeBcm: 'Báo cáo bộ phận (BCM/BCKT/BCTN)',
        rptToday: '📊 Tóm tắt hôm nay (DT GV lãi gộp — không trừ NCC)',
        rptDebt: '🧾 Công nợ',
        rptPending: '⏳ Việc chờ',
        rptShifts: '🕐 Ca & quỹ',
        rptLowstock: '📦 Tồn thấp',
        rptPnl: '📈 P&L điều hành (khác lãi gộp)',
        rptMonth: '📅 Báo cáo tháng',
        rptQuarter: '🗓 Báo cáo quý',
        rptYear: '📆 Báo cáo năm',
        reportsPnlEmpty: 'Chưa có P&L điều hành cho ngày này. Lãi gộp không trừ chi NCC / lương.',
        helpHeader: 'Lệnh (English) — chú thích tiếng Việt',
        helpIntro: 'Chỉ đọc nghiệp vụ; lệnh không có quyền không liệt kê.',
        helpStart: '/start 482913 — Bắt đầu + mã OTP — liên kết tài khoản Fly',
        helpBind: '/bind 482913 — Gắn tài khoản (giống /start)',
        helpHelp: '/help — Trợ giúp — lệnh được phép theo vai trò',
        helpFly: '/fly — Dashboard cửa hàng (số + nút)',
        helpToday: '/today — Tóm tắt hoạt động hôm nay (DT – GV – lãi gộp – 4 kênh – cảnh báo) — QL',
        helpDebt: '/debt — Công nợ NCC — QL, KT',
        helpLowstock: '/lowstock — Tồn thấp / cần bổ sung — Thủ kho',
        helpShifts: '/shifts — Ca làm (QL·KT: cửa hàng; TN: ca mình)',
        helpPayments: '/payments — Thanh toán TM/QR/thẻ/CK',
        helpPending: '/pending — Việc chờ duyệt (nút Duyệt / Từ chối trên tin chờ)',
        helpDocs: '/docs — Chứng từ / giấy tờ (đơn mua, phiếu nhập, HĐ, xuất, KK, đổi trả, phiếu chi, công, BCK)',
        helpReports: '/reports — Báo cáo cửa hàng + Thủ kho (BCK) + bộ phận (BCM/BCKT/BCTN). Không duyệt báo cáo — QL',
        helpGuide: '/guide — Tài liệu / quy tắc (DT, lãi gộp, VAT, công nợ, két, lương) — alias /rules',
        helpAsk: '/ask … — Hỏi tự do (thử nghiệm): số liệu đúng quyền QL, có Nguồn. Không duyệt hộ. /guide vẫn là quy tắc cố định.',
        guideAskHint: 'Hỏi tự do (thử nghiệm): /ask … — số liệu đúng quyền QL, có Nguồn. Không duyệt hộ. /guide vẫn là quy tắc cố định.',
        helpPayroll: '/payroll — Lương tóm tắt kỳ — QL (không mã NV)',
        helpPayrollNv: '/payroll NV008 — Lương 1 người — CHỈ kế toán',
        helpUnlink: '/unlink — Hủy liên kết Telegram',
        todayTitle: 'Tóm tắt hoạt động hôm nay',
        todayDay: 'Ngày vận hành {day}',
        todayRevenue: 'Doanh thu',
        todayCogs: 'Giá vốn',
        todayGross: 'Lãi gộp',
        todayCash: 'Tiền mặt',
        todayQr: 'QR',
        todayCard: 'Thẻ',
        todayTransfer: 'Chuyển khoản',
        todayAlerts: 'Cảnh báo',
        todayDebtDue: 'Công nợ đến hạn / quá hạn',
        todayPayPending: 'Thanh toán chờ xác nhận',
        todayRestock: 'Mã hàng cần bổ sung',
        todayShiftGap: 'Ca lệch quỹ',
        todayNone: 'Không',
        todayKhoan: 'khoản',
        todayInvoices: 'Số HĐ hoàn thành',
        todayTopHd: 'Top hóa đơn',
        todayTopStock: 'Tồn cần bổ sung (top)',
        todayOpenShift: 'Ca đang mở',
        todayTemplateError: 'Tóm tắt hoạt động hôm nay (lỗi mẫu tin).',
        dashBrand: 'SUPERMARKET FLY · Hà Nội',
        dashOps: '⚡ Kết quả hôm nay',
        dashPay: '4 kênh thanh toán',
        dashWatch: 'Cần chú ý',
        dashInbox: 'Thông báo mới',
        dashInboxEmpty: 'Không có việc mới trên chuông.',
        dashPending: 'Việc chờ',
        dashDebtDue: 'Công nợ đến hạn',
        dashOpenShift: 'Ca đang mở',
        dashGapShift: 'lệch',
        dashRestock: 'Tồn cần bổ sung',
        revenueTitle: 'Doanh thu ngày vận hành',
        debtTitle: 'CÔNG NỢ NCC',
        debtCount: 'Tổng khoản',
        debtRemain: 'Còn phải trả',
        debtSoon: 'Đến hạn 7 ngày',
        debtOverdue: 'Quá hạn',
        debtTop: 'Top khoản:',
        debtEmpty: '(không có)',
        debtDue: 'hạn',
        lowstockTitle: 'TỒN THẤP (không tự lập đề nghị)',
        lowstockEmpty: 'Không có mặt hàng dưới định mức.',
        lowstockHead: 'Tên SP · tồn / tối thiểu',
        shiftsTitle: 'CA LÀM VIỆC',
        shiftsEmpty: 'Không có ca phù hợp.',
        shiftsGap: 'lệch',
        shiftsCounter: 'Quầy',
        shiftsReconcile: 'Đối soát',
        payTitle: 'THANH TOÁN ĐIỆN TỬ (không mã GD)',
        payDay: 'Ngày vận hành {day}',
        payEmpty: 'Chưa có giao dịch.',
        payPending: 'chờ xác nhận',
        payRecent: 'Giao dịch gần đây',
        payMixHint: 'TM vào két / phiếu thu. QR không vào két. Cùng ngày vận hành với câu hỏi QR.',
        payCashNone: 'Không có giao dịch tiền mặt trong ngày vận hành này.',
        payShifts: 'Ca hôm nay — TM vs QR',
        payShiftsEmpty: 'Chưa gắn được ca (MaCa) cho giao dịch ngày này.',
        payChipCash: '💵 Có tiền mặt?',
        payChipShift: '🕐 Ca TM / QR',
        pendingTitle: 'VIỆC CHỜ DUYỆT',
        pendingEmpty: 'Không có việc chờ.',
        reportsTitle: 'BÁO CÁO CỬA HÀNG',
        reportsPnlNote: 'P&L điều hành (nếu có) khác lãi gộp: có thể trừ chi NCC / lương — không dùng làm lãi gộp.',
        reportsGrossNote: 'Lãi gộp = DT thuần − GV thuần. Không trừ tiền trả NCC.',
        alertsTitle: 'CẢNH BÁO',
        alertsEmpty: 'Không có cảnh báo khẩn.',
        payrollTitle: 'TÓM TẮT LƯƠNG KỲ {month}',
        payrollStaff: 'Số NV',
        payrollTotal: 'Tổng',
        payrollPaid: 'Đã thanh toán',
        payrollUnpaid: 'Chưa thanh toán',
        payrollOne: 'LƯƠNG {name} ({maNV})',
        payrollPeriod: 'Kỳ {month}',
        payrollDayHours: 'Giờ ngày',
        payrollNightHours: 'Giờ đêm',
        payrollHoursUnit: 'giờ',
        payrollStatus: 'Trạng thái',
        payrollMissing: 'Không có bảng lương {maNV} kỳ {month}.',
        pushNew: 'VIỆC MỚI — chuông Quản lý',
        pushOpenFly: 'Mở Fly → chuông thông báo'
    },
    en: {
        denyView: 'Your account cannot view this item in Fly.',
        denyUnbound: 'Open Supermarket Fly → Link Telegram → Create code, then send /start and 6 digits.',
        denyStranger: 'Internal Supermarket Fly bot. Only a linked Store Manager can use it.',
        denyNotManager: 'Only a Store Manager account can be linked.',
        denyNotManagerCmd: 'Only the Store Manager can view figures on this bot.',
        denyGroup: 'This bot is for a private chat with the store account.',
        denyLocked: 'The store account is locked. The bot cannot be used.',
        denyMuted: 'Your Telegram channel is off. Ask the Store Manager to turn it on in Fly.',
        denyWrite: 'No /pay, no invoice complete, no supplier payout from chat commands. Pending work: tap buttons on the pending card (same audit log as Fly).',
        flyHint: 'Approving on Telegram writes the same NhatKy audit log as Fly.',
        helpNoWrite: 'No /pay /complete. Approve PO/issue/count/return/payout/attendance via buttons on pending cards — same NhatKy as Fly.',
        flyMenu: 'Fly — store dashboard (buttons without permission are hidden).',
        unknownCmd: 'No matching keyboard button. Tap Documents, Reports, Pending… or type /help /fly.',
        storeBrand: 'SUPERMARKET FLY · Hà Nội',
        welcomeUnboundHi: 'Hello! 👋 I am the Store Manager companion on Supermarket Fly.',
        welcomeUnboundAbout: 'Read figures and approve pending work (same audit log as Fly). No figures until you link.',
        welcomeUnboundOtpTitle: 'Link account (Store Manager only)',
        welcomeUnboundOtp1: '1. Sign in to Fly → top right → Link Telegram → Create code.',
        welcomeUnboundOtp2: '2. Come back here, send /start and 6 digits (with a space).',
        welcomeUnboundOtp3: 'The code expires after 5 minutes; 5 wrong tries require a new code in Fly. OTP from other roles is rejected.',
        welcomeUnbound: [
            'Hello! 👋 I am the Store Manager companion on Supermarket Fly.',
            '',
            'Glad you are here. Manager companion: read figures and approve pending work (same audit log as Fly).',
            '',
            'Not linked yet? In Fly: top right → Link Telegram → Create code, then send /start with 6 digits.',
            'Example: /start 482913'
        ].join('\n'),
        welcomeBound: 'Store Manager {name}, welcome. 🌟',
        welcomeBoundHi: 'Store Manager {name}, welcome. 🌟',
        welcomeBoundP2: 'Internal Fly Hà Nội channel. Read figures; approve PO, issues, counts, returns, payouts, attendance — same NhatKy as Fly.',
        welcomeBoundP3: 'The bot shows today’s operating figures and lets you handle pending approvals on Telegram.',
        welcomeBoundP4: 'You may approve purchase orders, issues, stock counts, returns, payment vouchers and attendance — each approve or reject writes the same audit log as Fly.',
        welcomeDashTitle: 'Store today',
        welcomeDashRevenue: 'Revenue',
        welcomeDashPending: 'Pending work',
        welcomeDashGap: 'Shift variance',
        welcomeDashAttendance: 'Attendance awaiting approval',
        welcomeBoundGuide: '📄 Documents · /reports · 📚 /guide. Tap Hide menu to read the chat. History: Fly → Nhật ký.',
        welcomeBoundNoApprove: 'Pending work: tap ✅ Approve / ❌ Reject on that card — NhatKy is written. No payroll payout / no invoice complete from chat commands.',
        welcomeBoundDocs: '📄 Documents include purchase orders, receipts, invoices, issues, counts, returns, payment vouchers and attendance sheets.',
        welcomeBoundIdle: 'No pending work — the operating day is clear.',
        welcomeUnboundNote: 'After linking, the Store Manager approves PO, issues, counts, returns, payouts, and attendance on the pending card — same NhatKy as Fly.',
        welcomeBoundLang: '🌐 Labels: Language button (Tiếng Việt / English / 简体中文).',
        healthOk: 'Stable',
        healthWatch: 'Needs attention',
        healthUrgent: 'Needs priority handling',
        opsWatchTitle: 'Work to handle',
        docsSection: 'Documents',
        opsChips: 'Pending {pending} · Attendance {attendance} · Variance: {gap}',
        pendingAttendanceNote: 'Shift closed — attendance awaits approval (UC32). ✅ Approve writes the same log as Fly → Duyệt công.',
        pendingAttendanceHint: '“Pending” = the shift ended. Approve here or in Fly → Duyệt công (older dates and office shifts included).',
        attendanceFlyPath: 'Fly → Duyệt công',
        pushAttendanceTitle: 'ATTENDANCE AWAITING APPROVAL',
        welcomeGuest: [
            'Hello! 👋 I am the internal Supermarket Fly bot.',
            '',
            'Sorry — only a linked Store Manager can view figures. This chat will not receive store data.'
        ].join('\n'),
        startLinkGuide: [
            'LINK GUIDE (Store Manager only)',
            '1. Sign in to Fly as Store Manager (admin).',
            '2. Top right → Link Telegram → Create code.',
            '3. Come back here, send /start and 6 digits (with a space).',
            'Example: /start 482913',
            'The code expires after 5 minutes; 5 wrong tries require a new code in Fly.',
            '',
            'OTP from purchaser / warehouse / accountant / cashier will be rejected.',
            'Private chat only. Do not send the code to a group.'
        ].join('\n'),
        otpNotFound: 'Code is incorrect or no longer valid. Create a new code in Fly.',
        otpLocked: 'Code locked after 5 wrong tries. Create a new code in Fly.',
        otpExpired: 'Code expired. Create a new one in Fly.',
        otpWrong: 'Incorrect code. {left} tries left.',
        otpChatTaken: 'This chat is linked to another staff member. Unlink in Fly or ask the manager.',
        bindSuccess: 'Linked {name} ({role}). Type /fly',
        bindDbError: 'Could not link because of a database error. Send /start and 6 digits again in a few seconds.',
        unlinkOk: 'Telegram unlinked. Create a new code in Fly when needed.',
        unlinkOldChat: 'Unlinked because a new device signed in.',
        langChosen: 'English selected.',
        langMenuTitle: 'Choose label language (amounts stay the same).',
        btnLinkGuide: 'Link guide',
        btnHelp: 'Help /help',
        flyHome: '🔄 Refresh',
        navHome: '🏠 Overview',
        flyToday: '📊 Today',
        flyRevenue: '💰 Revenue',
        flyDebt: '🧾 Payables',
        flyLowstock: '📦 Low stock',
        flyPending: '⏳ Pending',
        flyReports: '📊 Reports',
        flyShifts: '🕐 Shifts',
        flyPayments: '💳 Payments',
        flyAlerts: '🔔 Alerts',
        flyLang: '🌐 Language',
        flyHelp: '❓ Help',
        flyDocs: '📄 Documents',
        kbDocs: '📄 Documents',
        kbLowstock: '🛍️ Low stock',
        kbPending: '⏳ Pending',
        kbReports: '📊 Reports',
        kbRevenue: '💰 Today revenue',
        kbDebt: '🧾 Payables',
        kbShifts: '🕐 Shifts & cash',
        kbPayments: '💳 Payments',
        kbAlerts: '🔔 Alerts',
        kbFly: '🔄 Refresh',
        kbLang: '🌐 Language',
        kbHelp: '❓ Help',
        kbAsk: '💬 Ask',
        askPrompt: 'What do you want to ask? Type the next message, e.g. what needs attention today?',
        askUsage: 'Ask Fly Assistant. Type: /ask what needs attention today?\nThe assistant does not approve documents. Pending work: buttons on the card, or /pending.',
        kbLink: '🔗 Link account',
        kbGuide: '📚 Guide',
        kbHide: '⬆️ Hide menu',
        kbShow: '⬇️ Show menu',
        kbPinHint: 'The button menu sits below the chat. On phone: if it is missing, tap the keyboard icon (four squares) next to the input.',
        flyGuide: '📚 Guide',
        hideOk: 'Keyboard hidden. Read the chat freely.',
        showOk: 'Menu is back.',
        showHint: 'Show again: tap ⬇️ Show menu under this message, or send /fly. On phone: tap the keyboard icon next to the input.',
        hideAfterRead: 'When done, tap ⬆️ Hide menu to read the chat.',
        guidePickTitle: 'DOCUMENTS / RULES',
        guidePickHint: 'Tap one topic. Locked formulas — not empty slides.',
        guideSrc: 'Locked sources',
        guideRev: 'Revenue',
        guideGross: 'COGS / gross profit',
        guidePnl: 'Operating P&L',
        guideVat: 'Tax / VAT',
        guideDebt: 'Supplier AP',
        guideCash: 'Shift cash / receipt',
        guidePay: 'Payroll / attendance',
        guideRevWhen: 'When revenue is booked',
        guideRevL1: 'Only invoices with status = Completed (column A).',
        guideRevL2: 'Net revenue =',
        guideRevF1: 'completed invoice payments − completed refunds',
        guideRevL3: 'A shift cash receipt does NOT create revenue a second time.',
        guideRevNo: 'Do not',
        guideRevL4: 'No credit sales, no customer AR (no account 131).',
        guideRevL5: 'Returns do not add revenue a second time.',
        guideRevL6: 'The bot does not complete a sales invoice from chat.',
        guideGrossF: 'Formula (financialRules)',
        guideGrossF1: 'Net revenue =',
        guideGrossFx1: 'completed invoice payments − refunds',
        guideGrossF2: 'Net COGS =',
        guideGrossFx2: 'invoice COGS − returned COGS + exchange COGS',
        guideGrossF3: 'Gross profit =',
        guideGrossFx3: 'net revenue − net COGS',
        guideGrossEx: 'Formula example (illustration)',
        guideGrossEx1: 'Net revenue',
        guideGrossEx2: 'If a supplier is paid',
        guideGrossEx3: 'gross profit stays',
        guideGrossNo: 'Not deducted from gross profit',
        guideGrossL1: 'Do NOT deduct supplier payouts.',
        guideGrossL2: 'Payroll is NOT deducted from gross profit.',
        guideGrossL3: '/today and the 06:10 brief use gross profit — they do not copy P&L minus NCC.',
        guidePnlL1: 'Manager screen “is the store in profit or loss”. Not gross profit. Not a statutory financial statement.',
        guidePnlF: 'Management P&L',
        guidePnlFx: 'net rev − net COGS − successful supplier payouts − locked payroll (− freight if booked)',
        guidePnlDiff: 'Not the same as gross profit',
        guidePnlL2: 'Gross profit stops at rev − COGS. Operating P&L also deducts paid AP and locked payroll.',
        guidePnlL3: 'Not yet deducted: rent, electricity, water (no vouchers yet).',
        guidePnlL4: 'On a loss (or rev < locked payroll): manager enters a plan ≥ 50 characters for the whole store.',
        guidePnlL5: 'storeProfitLossMath deducts supplier payouts in “profit after costs” — the bot does not use that as gross profit.',
        guideVatBuy: 'Purchases (already live)',
        guideVatL1: 'Purchase invoices store ThueSuat / TienThue. Input VAT (1331) is already on purchase lines.',
        guideVatSell: 'POS sales (current truth)',
        guideVatL2: 'Shelf prices ALREADY INCLUDE VAT (scope locked 31/08).',
        guideVatL3: 'Sales invoices do NOT yet store tax — no ThueSuat/TienThue on ChiTietHoaDon.',
        guideVatL4: 'Plan A locks a 511 / 33311 split — NOT CODED YET.',
        guideVatPlan: 'Plan A formula (not running)',
        guideVatF1: 'Line VAT =',
        guideVatFx1: 'round(amount after discount × rate / (100 + rate))',
        guideVatF2: '511 =',
        guideVatFx2: 'amount after discount − line VAT',
        guideVatEx: 'Example 10%, customer pays',
        guideVatNow: 'POS currently stores one VAT-inclusive amount; 511/33311 are not split.',
        guideDebtWhen: 'When AP is created',
        guideDebtL1: 'Only after a 3-way MATCH: PO + goods receipt + purchase invoice.',
        guideDebtL2: 'Amount owed =',
        guideDebtFx: 'invoice TongCong (goods + tax)',
        guideDebtL3: 'Mismatch → no CongNoPhaiTra insert.',
        guideDebtPay: 'When AP decreases',
        guideDebtL4: 'Create voucher / manager approve + fund handover: SoTienConLai UNCHANGED.',
        guideDebtL5: 'Pay IN FULL, ONCE. No prepayment, no partial payment.',
        guideDebtL6: 'Only when accountant records a SUCCESSFUL payment → SoTienConLai =',
        guideDebtNo: 'Forbidden',
        guideDebtL7: 'Prepay; two vouchers for one AP; reduce AP when creating or when the manager approves.',
        guideCashF: 'Cash-drawer formula',
        guideCashF1: 'System cash =',
        guideCashFx1: 'successful cash in − completed cash refunds',
        guideCashF2: 'Variance =',
        guideCashFx2: 'cash handed in − system cash',
        guideCashL1: 'QR / card / transfer do not enter the drawer.',
        guideCashPt: 'Shift receipt (UC29)',
        guideCashL2: 'One receipt per shift (MaCa UNIQUE).',
        guideCashL3: 'Confirming the receipt does NOT add revenue and does NOT reduce supplier AP.',
        guideCashL4: 'A variance requires a reason on the receipt — no separate memo.',
        guidePayAtt: 'Attendance → payroll',
        guidePayL1: 'Only approved attendance (UC32) enters payroll. Pending → cannot build the sheet.',
        guidePayL2: 'Only the accountant builds / locks the period. Manager build → 403. GET does not auto-create.',
        guidePayRate: 'Rates (Labor Code + Decree 145/2020)',
        guidePayR1: 'Day',
        guidePayR2: 'night',
        guidePayR3: 'Weekly rest',
        guidePayR4: 'holiday in shift',
        guidePayR5: 'Paid public holiday:',
        guidePayR6: 'rate — only staff with approved hours in the period',
        guidePayFund: 'Fund and payout',
        guidePayL3: 'Approving / handing the fund is NOT paying wages. Paid only after a successful accountant payout.',
        guidePayL4: 'Payroll fund: manager hands ONE pool to the accountant (unlike per-voucher supplier AP).',
        guidePayL5: 'Settlement',
        guidePayDay: 'the 10th of the next month (period 08 → 10/09)',
        guidePayL6: 'Payroll is NOT deducted from gross profit.',
        guidePayL7: 'Telegram: Approve attendance writes the same NhatKy as Fly → Duyệt công.',
        btnApprove: '✅ Duyệt',
        btnReject: '❌ Từ chối',
        btnDetail: '📋 Chi tiết',
        btnDocs: '📄 Documents',
        btnReports: '📊 Báo cáo',
        docsTitle: 'DOCUMENTS / PAPERS',
        docsIndexHint: 'Tap a paper type below. No need to type an id. Pending cards still have 📄.',
        docsIndexFooter: 'PO: order + shipment + receipt + purchase invoice (if any). Issue / count / return / payout / attendance: full slip. Returns include the original sales invoice.',
        docsEmpty: 'Nothing pending. Tap 📄 Documents to pick a paper type.',
        docsMissing: 'Document not found. Check the code in Fly.',
        docsUnknown: 'Unrecognized document id. Tap 📄 Documents and pick a type, or /docs po:PO00001',
        docsPickTitle: 'CHOOSE DOCUMENT TYPE',
        docsPickHint: 'Tap a paper type. No id required. The bot lists 8–15 latest papers — tap a code for the full print.',
        docsTypePo: 'Purchase order',
        docsTypePn: 'Goods receipt',
        docsTypeHdm: 'Purchase invoice',
        docsTypeHd: 'Sales invoice',
        docsTypePx: 'Stock issue',
        docsTypeKk: 'Stock count',
        docsTypeDt: 'Return / exchange',
        docsTypePc: 'Payout voucher',
        docsTypeCc: 'Attendance / timesheet',
        docsListTitle: 'DOCUMENTS · {type}',
        docsListEmpty: 'No papers of this type yet.',
        docsListHint: 'Tap a code to open the full HTML print.',
        docsBackTypes: '« Types',
        reportsPickTitle: 'CHOOSE REPORT',
        reportsPickHint: 'Tap one item. Store reports, submitted warehouse reports and submitted department reports.',
        rptWarehouse: '📦 Submitted warehouse report',
        rptDept: '📥 Submitted department reports',
        rptDeptTitle: 'SUBMITTED DEPARTMENT REPORTS',
        rptDeptHint: 'Tap a BCM / BCKT / BCTN number for the KPI summary. No approval on Telegram.',
        rptDeptEmpty: 'No department report has been sent yet.',
        rptDeptMissing: 'That department report was not found.',
        rptDeptList: '📋 Submitted periods',
        rptWarehouseTitle: 'SUBMITTED WAREHOUSE REPORTS',
        rptWarehouseHint: 'Tap a BCK number to see stock movement, written-off goods, low stock and returns.',
        rptWarehouseEmpty: 'No warehouse report has been sent yet.',
        rptWarehouseMissing: 'That warehouse report was not found.',
        rptWarehouseList: '📋 Submitted periods',
        rptStoreReports: '📊 Store reports',
        docsTypeBck: 'Warehouse report',
        docsTypeBcm: 'Department reports (BCM/BCKT/BCTN)',
        rptToday: '📊 Today summary (rev COGS gross — no supplier payout)',
        rptDebt: '🧾 Payables',
        rptPending: '⏳ Pending work',
        rptShifts: '🕐 Shifts & cash',
        rptLowstock: '📦 Low stock',
        rptPnl: '📈 Operating P&L (not gross profit)',
        rptMonth: '📅 Monthly report',
        rptQuarter: '🗓 Quarterly report',
        rptYear: '📆 Annual report',
        reportsPnlEmpty: 'No operating P&L for this day. Gross profit does not deduct supplier payouts / payroll.',
        helpHeader: 'Commands (English) — descriptions',
        helpIntro: 'Read-only operations; commands without permission are omitted.',
        helpStart: '/start 482913 — Start + OTP — link Fly account',
        helpBind: '/bind 482913 — Link account (same as /start)',
        helpHelp: '/help — Help — commands allowed for your role',
        helpFly: '/fly — Store dashboard (figures + buttons)',
        helpToday: '/today — Today’s operations (rev – COGS – gross – 4 channels – alerts) — Manager',
        helpDebt: '/debt — Supplier AP — Manager, Accountant',
        helpLowstock: '/lowstock — Low stock / restock — Warehouse',
        helpShifts: '/shifts — Shifts (Manager·Accountant: store; Cashier: own)',
        helpPayments: '/payments — Cash/QR/card/transfer',
        helpPending: '/pending — Pending approvals (Approve / Reject buttons on the card)',
        helpDocs: '/docs — Papers / documents (PO, receipt, invoice, issue, count, return, payout, attendance, BCK)',
        helpReports: '/reports — Store + warehouse (BCK) + department (BCM/BCKT/BCTN). No report approval — Manager',
        helpGuide: '/guide — Rules (revenue, gross profit, VAT, AP, cash, payroll) — alias /rules',
        helpAsk: '/ask … — Free question (trial): figures match manager rights, with Sources. Does not approve. /guide stays static.',
        guideAskHint: 'Free question (trial): /ask … — figures match manager rights, with Sources. Does not approve. /guide stays static.',
        helpPayroll: '/payroll — Period payroll summary — Manager (no staff id)',
        helpPayrollNv: '/payroll NV008 — One person payroll — ACCOUNTANT ONLY',
        helpUnlink: '/unlink — Unlink Telegram',
        todayTitle: 'Today’s operations summary',
        todayDay: 'Operating day {day}',
        todayRevenue: 'Revenue',
        todayCogs: 'COGS',
        todayGross: 'Gross profit',
        todayCash: 'Cash',
        todayQr: 'QR',
        todayCard: 'Card',
        todayTransfer: 'Transfer',
        todayAlerts: 'Alerts',
        todayDebtDue: 'AP due / overdue',
        todayPayPending: 'Payments awaiting confirmation',
        todayRestock: 'SKUs to restock',
        todayShiftGap: 'Shift cash variance',
        todayNone: 'None',
        todayKhoan: 'items',
        todayInvoices: 'Completed invoices',
        todayTopHd: 'Top invoices',
        todayTopStock: 'SKUs to restock (top)',
        todayOpenShift: 'Open shifts',
        todayTemplateError: 'Today’s operations summary (message template error).',
        dashBrand: 'SUPERMARKET FLY · Hà Nội',
        dashOps: '⚡ Today’s result',
        dashPay: '4 payment channels',
        dashWatch: 'Watch list',
        dashInbox: 'Latest alerts',
        dashInboxEmpty: 'No new bell items.',
        dashPending: 'Pending work',
        dashDebtDue: 'AP due',
        dashOpenShift: 'Open shifts',
        dashGapShift: 'variance',
        dashRestock: 'Need restock',
        revenueTitle: 'Revenue — operating day',
        debtTitle: 'SUPPLIER AP',
        debtCount: 'Open items',
        debtRemain: 'Amount due',
        debtSoon: 'Due in 7 days',
        debtOverdue: 'Overdue',
        debtTop: 'Top items:',
        debtEmpty: '(none)',
        debtDue: 'due',
        lowstockTitle: 'LOW STOCK (does not create a request)',
        lowstockEmpty: 'No items below minimum.',
        lowstockHead: 'Item · on hand / min',
        shiftsTitle: 'WORK SHIFTS',
        shiftsEmpty: 'No matching shifts.',
        shiftsGap: 'variance',
        shiftsCounter: 'Till',
        shiftsReconcile: 'Reconcile',
        payTitle: 'ELECTRONIC PAYMENTS (no txn ids)',
        payDay: 'Operating day {day}',
        payEmpty: 'No transactions yet.',
        payPending: 'awaiting confirmation',
        payRecent: 'Recent payments',
        payMixHint: 'Cash goes to the drawer / cash receipt. QR does not. Same operating day as the QR question.',
        payCashNone: 'No cash transactions on this operating day.',
        payShifts: 'Shifts today — cash vs QR',
        payShiftsEmpty: 'No shift (MaCa) linked to today’s payments.',
        payChipCash: '💵 Any cash?',
        payChipShift: '🕐 Shift cash / QR',
        pendingTitle: 'PENDING APPROVALS',
        pendingEmpty: 'Nothing pending.',
        reportsTitle: 'STORE REPORT',
        reportsPnlNote: 'Operating P&L (if shown) is not gross profit: it may deduct supplier payouts / payroll.',
        reportsGrossNote: 'Gross profit = net revenue − net COGS. Supplier payouts are not deducted.',
        alertsTitle: 'ALERTS',
        alertsEmpty: 'No urgent alerts.',
        payrollTitle: 'PAYROLL SUMMARY {month}',
        payrollStaff: 'Staff',
        payrollTotal: 'Total',
        payrollPaid: 'Paid',
        payrollUnpaid: 'Unpaid',
        payrollOne: 'PAYROLL {name} ({maNV})',
        payrollPeriod: 'Period {month}',
        payrollDayHours: 'Day hours',
        payrollNightHours: 'Night hours',
        payrollHoursUnit: 'h',
        payrollStatus: 'Status',
        payrollMissing: 'No payroll for {maNV} in {month}.',
        pushNew: 'NEW — manager bell',
        pushOpenFly: 'Open Fly → notification bell'
    },
    zh: {
        denyView: '您的账号无权在 Fly 中查看此项。',
        denyUnbound: '请打开 Supermarket Fly → 关联 Telegram → 生成验证码，然后发送 /start 和 6 位数字。',
        denyStranger: '这是 Supermarket Fly 内部机器人。仅已关联的店长可以使用。',
        denyNotManager: '仅店长账号可以关联。',
        denyNotManagerCmd: '仅店长可在此机器人查看数据。',
        denyGroup: '本机器人仅用于与门店账号的私聊。',
        denyLocked: '门店账号已锁定，无法使用机器人。',
        denyMuted: '您的 Telegram 通道已关闭。请店长在 Fly 中重新开启。',
        denyWrite: '不能用命令 /pay、完成销售单或向供应商付款。待审批事项：点待办卡片上的按钮（与 Fly 写入同一本 NhatKy）。',
        flyHint: '在 Telegram 审批会写入与 Fly 相同的 NhatKy 日志。',
        helpNoWrite: '没有 /pay /complete。采购/出库/盘点/退换/付款/考勤：在待办卡片上点按钮 — 与 Fly 同一本 NhatKy。',
        flyMenu: 'Fly — 门店看板（无权限的按钮已隐藏）。',
        unknownCmd: '未匹配到键盘按钮。请点 📄 单据、📊 报表、⏳ 待办… 或输入 /help /fly。',
        storeBrand: 'SUPERMARKET FLY · Hà Nội',
        welcomeUnboundHi: '您好！👋 我是 Supermarket Fly 的店长助手。',
        welcomeUnboundAbout: '查看数据并审批待办（与 Fly 同一日志）。尚未关联，没有数据。',
        welcomeUnboundOtpTitle: '关联账号（仅店长）',
        welcomeUnboundOtp1: '1. 登录 Fly → 右上角 → 关联 Telegram → 生成验证码。',
        welcomeUnboundOtp2: '2. 回到本对话，发送 /start 和 6 位数字（中间有空格）。',
        welcomeUnboundOtp3: '验证码 5 分钟后失效；连续输错 5 次需在 Fly 重新生成。其他角色的 OTP 将被拒绝。',
        welcomeUnbound: [
            '您好！👋 我是 Supermarket Fly 的店长助手。',
            '',
            '很高兴见到您。店长助手：可查看数据并审批待办（与 Fly 同一本日志）。',
            '',
            '尚未关联？请在 Fly：右上角 → 关联 Telegram → 生成验证码，然后发送 /start 加 6 位数字。',
            '例如：/start 482913'
        ].join('\n'),
        welcomeBound: '店长 {name}，您好。🌟',
        welcomeBoundHi: '店长 {name}，您好。🌟',
        welcomeBoundP2: 'Fly 河内内部通道。查看数据；审批采购、出库、盘点、退换、付款、考勤 — 与 Fly 写入同一本 NhatKy。',
        welcomeBoundP3: '机器人可查看当日经营数据，并在 Telegram 处理待审批事项。',
        welcomeBoundP4: '店长可审批采购单、出库、盘点、退换、付款凭证和考勤 — 每次批准或拒绝都会写入与 Fly 相同的日志。',
        welcomeDashTitle: '今日门店',
        welcomeDashRevenue: '销售额',
        welcomeDashPending: '待办',
        welcomeDashGap: '班次长短款',
        welcomeDashAttendance: '待审批考勤',
        welcomeBoundGuide: '📄 单据 · /reports · 📚 /guide。点 隐藏菜单 以便读完聊天。历史：Fly → Nhật ký。',
        welcomeBoundNoApprove: '待办：在该卡片上点 ✅ 审批 / ❌ 拒绝 — 会写入 NhatKy。不能用命令发工资或完成销售单。',
        welcomeBoundDocs: '📄 单据包括采购单、入库、发票、出库、盘点、退换、付款凭证和考勤单。',
        welcomeBoundIdle: '没有待办 — 经营日运行平稳。',
        welcomeUnboundNote: '关联后，店长可在待办消息上审批采购、出库、盘点、退换、付款和考勤 — 与 Fly 写入同一本 NhatKy。',
        welcomeBoundLang: '🌐 标签语言：语言按钮（Tiếng Việt / English / 简体中文）。',
        healthOk: '运行平稳',
        healthWatch: '需要关注',
        healthUrgent: '需要优先处理',
        opsWatchTitle: '待处理事项',
        docsSection: '单据',
        opsChips: '待办 {pending} · 考勤 {attendance} · 长短款：{gap}',
        pendingAttendanceNote: '班次已结束 — 待审批考勤（UC32）。点 ✅ 审批会写入与 Fly → Duyệt công 相同的日志。',
        pendingAttendanceHint: '“待审批”= 员工已下班。可在此或 Fly → Duyệt công 审批（含旧日期与行政班）。',
        attendanceFlyPath: 'Fly → Duyệt công',
        pushAttendanceTitle: '待审批考勤',
        welcomeGuest: [
            '您好！👋 我是 Supermarket Fly 内部机器人。',
            '',
            '抱歉 — 仅已关联的店长可以查看数据。本对话不会收到门店数据。'
        ].join('\n'),
        startLinkGuide: [
            '关联说明（仅店长）',
            '1. 使用店长（admin）账号登录 Fly。',
            '2. 右上角 → 关联 Telegram → 生成验证码。',
            '3. 回到本对话，发送 /start 和 6 位数字（中间有空格）。',
            '例如：/start 482913',
            '验证码 5 分钟后失效；连续输错 5 次需在 Fly 重新生成。',
            '',
            '采购 / 仓库 / 会计 / 收银的 OTP 将被拒绝。',
            '仅限私聊。请勿把验证码发到群组。'
        ].join('\n'),
        otpNotFound: '验证码不正确或已失效。请在 Fly 生成新验证码。',
        otpLocked: '因连续输错 5 次，验证码已锁定。请在 Fly 生成新验证码。',
        otpExpired: '验证码已过期，请在 Fly 生成新验证码。',
        otpWrong: '验证码不正确。还剩 {left} 次尝试。',
        otpChatTaken: '此对话已关联其他员工。请在 Fly 取消关联或请店长处理。',
        bindSuccess: '已关联 {name}（{role}）。请输入 /fly',
        bindDbError: '数据库错误，无法关联。请稍后再发送 /start 和 6 位数字。',
        unlinkOk: '已取消 Telegram 关联。需要时请在 Fly 生成新验证码。',
        unlinkOldChat: '因在新设备登录，已取消本对话关联。',
        langChosen: '已切换为简体中文。',
        langMenuTitle: '选择标签语言（金额不变）。',
        btnLinkGuide: '关联说明',
        btnHelp: '帮助 /help',
        flyHome: '🔄 刷新',
        navHome: '🏠 总览',
        flyToday: '📊 今日',
        flyRevenue: '💰 销售',
        flyDebt: '🧾 应付',
        flyLowstock: '📦 低库存',
        flyPending: '⏳ 待办',
        flyReports: '📊 报表',
        flyShifts: '🕐 班次',
        flyPayments: '💳 支付',
        flyAlerts: '🔔 提醒',
        flyLang: '🌐 语言',
        flyHelp: '❓ 帮助',
        flyDocs: '📄 单据',
        kbDocs: '📄 单据',
        kbLowstock: '🛍️ 低库存',
        kbPending: '⏳ 待办',
        kbReports: '📊 报表',
        kbRevenue: '💰 今日销售',
        kbDebt: '🧾 应付',
        kbShifts: '🕐 班次与钱箱',
        kbPayments: '💳 支付',
        kbAlerts: '🔔 提醒',
        kbFly: '🔄 刷新',
        kbLang: '🌐 语言',
        kbHelp: '❓ 帮助',
        kbAsk: '💬 问助手',
        askPrompt: '您想问什么？请在下一条消息输入，例如：今天要注意什么？',
        askUsage: '问 Fly 助手。输入：/ask 今天要注意什么？\n助手不代审批。待办：卡片上的按钮，或 /pending。',
        kbLink: '🔗 关联',
        kbGuide: '📚 文档',
        kbHide: '⬆️ 隐藏菜单',
        kbShow: '⬇️ 显示菜单',
        kbPinHint: '按钮菜单在聊天框下方。手机上看不到时，请点输入框旁的键盘图标（四格）。',
        flyGuide: '📚 文档',
        hideOk: '已隐藏键盘。请阅读聊天。',
        showOk: '菜单已恢复。',
        showHint: '再显示：点这条消息下的 ⬇️ 显示菜单，或发送 /fly。手机：点输入框旁的键盘图标。',
        hideAfterRead: '看完后请点 ⬆️ 隐藏菜单，以便读完聊天。',
        guidePickTitle: '文档 / 规则',
        guidePickHint: '点一项。已锁定公式 — 不是空幻灯片。',
        guideSrc: '已锁定来源',
        guideRev: '销售额',
        guideGross: '成本 / 毛利',
        guidePnl: '经营 P&L',
        guideVat: '税 / VAT',
        guideDebt: '供应商应付',
        guideCash: '班次钱箱 / 收款单',
        guidePay: '工资 / 考勤',
        btnApprove: '✅ Duyệt',
        btnReject: '❌ Từ chối',
        btnDetail: '📋 Chi tiết',
        btnDocs: '📄 单据',
        btnReports: '📊 Báo cáo',
        docsTitle: '单据 / 证件',
        docsIndexHint: '请点下方单据类型，无需输入编号。待办卡片仍有 📄。',
        docsIndexFooter: '采购单：订单 + 送货 + 入库 + 进项发票（如有）。出库 / 盘点 / 退换 / 付款 / 考勤：完整单据。退换附原销售单。',
        docsEmpty: '没有待办。请点 📄 单据选择类型。',
        docsMissing: '找不到该单据。请在 Fly 核对编号。',
        docsUnknown: '无法识别单据编号。请点 📄 单据选择类型，或 /docs po:PO00001',
        docsPickTitle: '选择单据类型',
        docsPickHint: '点一种单据，无需输入编号。机器人列出最近 8–15 份 — 点编号查看完整打印。',
        docsTypePo: '采购单',
        docsTypePn: '入库单',
        docsTypeHdm: '进项发票',
        docsTypeHd: '销售单',
        docsTypePx: '出库单',
        docsTypeKk: '盘点',
        docsTypeDt: '退换',
        docsTypePc: '付款单',
        docsTypeCc: '考勤 / 工时单',
        docsListTitle: '单据 · {type}',
        docsListEmpty: '还没有这类单据。',
        docsListHint: '点一个编号打开完整 HTML 打印。',
        docsBackTypes: '« 选择类型',
        reportsPickTitle: '选择报表',
        reportsPickHint: '点一项。含门店报表、仓管已提交报告和部门已提交报告。',
        rptWarehouse: '📦 仓管已提交报告',
        rptDept: '📥 部门已提交报告',
        rptDeptTitle: '部门已提交报告',
        rptDeptHint: '点 BCM / BCKT / BCTN 编号查看 KPI 摘要。不能在 Telegram 审批。',
        rptDeptEmpty: '部门尚未提交任何报告。',
        rptDeptMissing: '找不到该部门报告。',
        rptDeptList: '📋 已提交期',
        rptWarehouseTitle: '仓管已提交报告',
        rptWarehouseHint: '点 BCK 编号查看进出存、离库商品、低库存和退货。',
        rptWarehouseEmpty: '仓管尚未提交任何报告。',
        rptWarehouseMissing: '找不到该库存报告。',
        rptWarehouseList: '📋 已提交期',
        rptStoreReports: '📊 门店报表',
        docsTypeBck: '仓管报告',
        docsTypeBcm: '部门报表（BCM/BCKT/BCTN）',
        rptToday: '📊 今日摘要（销售额 成本 毛利 — 不扣供应商款）',
        rptDebt: '🧾 应付',
        rptPending: '⏳ 待办',
        rptShifts: '🕐 班次与钱箱',
        rptLowstock: '📦 低库存',
        rptPnl: '📈 经营 P&L（不是毛利）',
        rptMonth: '📅 月报',
        rptQuarter: '🗓 季报',
        rptYear: '📆 年报',
        reportsPnlEmpty: '当日暂无经营 P&L。毛利不扣除供应商付款 / 工资。',
        helpHeader: '命令（英语）— 中文说明',
        helpIntro: '只读业务；无权限的命令不列出。',
        helpStart: '/start 482913 — 开始 + OTP — 关联 Fly 账号',
        helpBind: '/bind 482913 — 关联账号（与 /start 相同）',
        helpHelp: '/help — 帮助 — 按角色列出允许的命令',
        helpFly: '/fly — 门店看板（数字 + 按钮）',
        helpToday: '/today — 今日经营摘要（销售额 – 成本 – 毛利 – 4 渠道 – 提醒）— 店长',
        helpDebt: '/debt — 供应商应付 — 店长、会计',
        helpLowstock: '/lowstock — 低库存 / 需补货 — 仓管',
        helpShifts: '/shifts — 班次（店长·会计：全店；收银：本人）',
        helpPayments: '/payments — 现金/QR/卡/转账',
        helpPending: '/pending — 待审批（在待办卡片上点审批 / 拒绝）',
        helpDocs: '/docs — 单据 / 证件（采购、入库、发票、出库、盘点、退换、付款、考勤、BCK）',
        helpReports: '/reports — 门店 + 仓管(BCK) + 部门(BCM/BCKT/BCTN)。不能审批报表 — 店长',
        helpGuide: '/guide — 规则（销售、毛利、VAT、应付、钱箱、工资）— 别名 /rules',
        helpAsk: '/ask … — 自由提问（试用）：按店长权限给数字，含来源。不代审批。/guide 仍是固定规则。',
        guideAskHint: '自由提问（试用）：/ask … — 按店长权限给数字，含来源。不代审批。/guide 仍是固定规则。',
        helpPayroll: '/payroll — 本期工资摘要 — 店长（不含员工编号）',
        helpPayrollNv: '/payroll NV008 — 单人工资 — 仅会计',
        helpUnlink: '/unlink — 取消 Telegram 关联',
        todayTitle: '今日经营摘要',
        todayDay: '经营日 {day}',
        todayRevenue: '销售额',
        todayCogs: '成本',
        todayGross: '毛利',
        todayCash: '现金',
        todayQr: 'QR',
        todayCard: '银行卡',
        todayTransfer: '转账',
        todayAlerts: '提醒',
        todayDebtDue: '应付到期 / 逾期',
        todayPayPending: '待确认付款',
        todayRestock: '需补货商品',
        todayShiftGap: '班次长短款',
        todayNone: '无',
        todayKhoan: '笔',
        todayInvoices: '已完成单据',
        todayTopHd: '金额最高单据',
        todayTopStock: '需补货（前几项）',
        todayOpenShift: '未结束班次',
        todayTemplateError: '今日经营摘要（消息模板错误）。',
        dashBrand: 'SUPERMARKET FLY · Hà Nội',
        dashOps: '⚡ 今日结果',
        dashPay: '4 个支付渠道',
        dashWatch: '需关注',
        dashInbox: '最新通知',
        dashInboxEmpty: '铃铛暂无新事项。',
        dashPending: '待办',
        dashDebtDue: '到期应付',
        dashOpenShift: '未结束班次',
        dashGapShift: '长短款',
        dashRestock: '需补货',
        revenueTitle: '经营日销售额',
        debtTitle: '供应商应付',
        debtCount: '笔数',
        debtRemain: '尚欠',
        debtSoon: '7 日内到期',
        debtOverdue: '已逾期',
        debtTop: '前几笔：',
        debtEmpty: '（无）',
        debtDue: '到期',
        lowstockTitle: '低库存（不会自动建单）',
        lowstockEmpty: '没有低于下限的商品。',
        lowstockHead: '商品 · 库存 / 下限',
        shiftsTitle: '班次',
        shiftsEmpty: '没有符合的班次。',
        shiftsGap: '差额',
        shiftsCounter: '收银台',
        shiftsReconcile: '对账',
        payTitle: '电子支付（不含交易号）',
        payDay: '经营日 {day}',
        payEmpty: '暂无交易。',
        payPending: '待确认',
        payRecent: '最近交易',
        payMixHint: '现金进钱箱/收款单。QR 不进钱箱。与 QR 问题同一经营日。',
        payCashNone: '本经营日没有现金交易。',
        payShifts: '今日班次 — 现金 vs QR',
        payShiftsEmpty: '今天的交易尚未关联班次（MaCa）。',
        payChipCash: '💵 有现金吗？',
        payChipShift: '🕐 班次现金 / QR',
        pendingTitle: '待审批',
        pendingEmpty: '没有待办。',
        reportsTitle: '门店报表',
        reportsPnlNote: '经营 P&L（如有）不是毛利：可能已扣除供应商付款 / 工资。',
        reportsGrossNote: '毛利 = 净销售额 − 净成本。不扣除付给供应商的款项。',
        alertsTitle: '提醒',
        alertsEmpty: '没有紧急提醒。',
        payrollTitle: '工资摘要 {month}',
        payrollStaff: '人数',
        payrollTotal: '合计',
        payrollPaid: '已发放',
        payrollUnpaid: '未发放',
        payrollOne: '工资 {name}（{maNV}）',
        payrollPeriod: '期间 {month}',
        payrollDayHours: '白班工时',
        payrollNightHours: '夜班工时',
        payrollHoursUnit: '小时',
        payrollStatus: '状态',
        payrollMissing: '没有 {maNV} 在 {month} 的工资表。',
        pushNew: '新事项 — 店长铃铛',
        pushOpenFly: '请打开 Fly → 通知铃铛'
    }
};

const t = (lang, key, vars) => {
    const pack = I18N[normalizeLang(lang)] || I18N.vi;
    return interpolate(pack[key] ?? I18N.vi[key] ?? key, vars);
};

const DENY_VIEW = I18N.vi.denyView;
const DENY_UNBOUND = I18N.vi.denyUnbound;
const DENY_STRANGER = I18N.vi.denyStranger;
const DENY_NOT_MANAGER = I18N.vi.denyNotManager;
const DENY_NOT_MANAGER_CMD = I18N.vi.denyNotManagerCmd;
const DENY_GROUP = I18N.vi.denyGroup;
const DENY_LOCKED = I18N.vi.denyLocked;
const DENY_MUTED = I18N.vi.denyMuted;
const DENY_WRITE = I18N.vi.denyWrite;
const FLY_HINT = I18N.vi.flyHint;
const HELP_NO_WRITE_COMMANDS = I18N.vi.helpNoWrite;
const FLY_MENU_TEXT = I18N.vi.flyMenu;
const START_WELCOME_UNBOUND = I18N.vi.welcomeUnbound;
const START_WELCOME_GUEST = I18N.vi.welcomeGuest;
const START_LINK_GUIDE = I18N.vi.startLinkGuide;

const LANG_BUTTONS = [
    { lang: 'vi', text: '🇻🇳 Tiếng Việt' },
    { lang: 'en', text: '🇬🇧 English' },
    { lang: 'zh', text: '🇨🇳 简体中文' }
];

const langKeyboardRow = () => LANG_BUTTONS.map(btn => ({
    text: btn.text,
    callback_data: `lang:${btn.lang}`
}));

const headerBlock = (title) => [`╭${RULE_TOP}`, title, `╰${RULE}`].join('\n');

const hintLine = (lang) => `<i>${escapeHtml(t(lang, 'flyHint'))}</i>`;

const opsHealth = (urgentCount, pendingCount, lang = DEFAULT_LANG) => {
    if (Number(urgentCount) > 0) return t(lang, 'healthUrgent');
    if (Number(pendingCount) > 0) return t(lang, 'healthWatch');
    return t(lang, 'healthOk');
};

const moneyLine = (label, value) => `${escapeHtml(label)}: ${moneyCode(value)}`;

const buildOpsKpiBlock = (summary = {}, inbox = [], lang = DEFAULT_LANG) => {
    const dayRaw = summary.operatingDay || operatingDayOf();
    const dayText = formatVnDate(dayRaw, lang);
    const revenue = summary.DoanhThuThuan ?? summary.DoanhThuHoaDon ?? 0;
    const cogs = summary.GiaVonHangBanThuan ?? summary.GiaVon ?? 0;
    const gross = summary.LoiNhuanGop ?? 0;
    const pending = (inbox || []).length;
    const attendance = countAttendancePending(inbox);
    const gaps = summary.caLech || [];
    const none = t(lang, 'todayNone');
    const gapText = gaps.slice(0, 8).join(', ') || none;
    const urgentCount = Number(summary.congNoDenHan || 0)
        + Number(summary.choXacNhan || 0)
        + Number(summary.spCanBoSung || 0)
        + gaps.length
        + (inbox || []).filter(item => item?.tone === 'urgent').length;
    const healthLabel = opsHealth(urgentCount, pending, lang);
    const healthIcon = urgentCount > 4 ? '🔴' : ((urgentCount || pending) ? '🟡' : '🟢');
    const healthDetail = pending
        ? `${healthIcon} ${escapeHtml(healthLabel)} · ${pending} ${escapeHtml(t(lang, 'welcomeDashPending').toLocaleLowerCase('vi-VN'))}`
        : `${healthIcon} ${escapeHtml(healthLabel)}`;
    const idle = !pending && !attendance && !gaps.length
        ? `<i>${escapeHtml(t(lang, 'welcomeBoundIdle'))}</i>`
        : '';
    return tidyLines([
        sectionTitle('⚡', t(lang, 'welcomeDashTitle')),
        dayText ? `<i>${escapeHtml(t(lang, 'todayDay', { day: dayText }))}</i>` : '',
        `<blockquote><b>${healthDetail}</b></blockquote>`,
        `💰 <b>${escapeHtml(t(lang, 'todayRevenue'))}</b>  ${moneyCode(revenue)}`,
        `📦 <b>${escapeHtml(t(lang, 'todayCogs'))}</b>  ${moneyCode(cogs)}`,
        `${Number(gross) >= 0 ? '📈' : '📉'} <b>${escapeHtml(t(lang, 'todayGross'))}</b>  ${moneyCode(gross)}`,
        `<i>${escapeHtml(t(lang, 'reportsGrossNote'))}</i>`,
        `⏳ ${escapeHtml(t(lang, 'welcomeDashPending'))}: ${textCode(String(pending))}`,
        `📋 ${escapeHtml(t(lang, 'welcomeDashAttendance'))}: ${textCode(String(attendance))}`,
        `🕐 ${escapeHtml(t(lang, 'welcomeDashGap'))}: ${textCode(gapText)}`,
        idle
    ]);
};

const buildStartWelcomeUnbound = (botHandle, lang = DEFAULT_LANG) => {
    const raw = String(botHandle || '').replace(/^@/, '').trim();
    const handle = raw ? `Bot: ${textCode('@' + raw)}` : '';
    return [
        headerBlock(`🏪 <b>${escapeHtml(t(lang, 'storeBrand'))}</b>`),
        escapeHtml(t(lang, 'welcomeUnboundHi')),
        '',
        escapeHtml(t(lang, 'welcomeUnboundAbout')),
        '',
        `<b>${escapeHtml(t(lang, 'welcomeUnboundOtpTitle'))}</b>`,
        escapeHtml(t(lang, 'welcomeUnboundOtp1')),
        escapeHtml(t(lang, 'welcomeUnboundOtp2')),
        `Ví dụ: ${textCode('/start 482913')}`,
        escapeHtml(t(lang, 'welcomeUnboundOtp3')),
        handle,
        '',
        `<i>${escapeHtml(t(lang, 'welcomeUnboundNote'))}</i>`
    ].filter(line => line !== '').join('\n');
};

const welcomeNameFallback = (lang) => {
    const key = normalizeLang(lang);
    if (key === 'en') return 'Manager';
    if (key === 'zh') return '店长';
    return 'Quản lý';
};

const buildStartWelcomeBound = (user, lang = DEFAULT_LANG, dash = {}) => {
    const name = escapeHtml(String(user?.TenNV || '').trim() || welcomeNameFallback(lang));
    const summary = { ...(dash.summary || {}), operatingDay: dash.summary?.operatingDay || dash.day };
    const inbox = dash.inbox || [];
    return tidyLines([
        headerBlock(`🏪 <b>${escapeHtml(t(lang, 'storeBrand'))}</b>`),
        t(lang, 'welcomeBoundHi', { name: `<b>${name}</b>` }),
        '',
        escapeHtml(t(lang, 'welcomeBoundP2')),
        escapeHtml(t(lang, 'welcomeBoundP3')),
        escapeHtml(t(lang, 'welcomeBoundP4')),
        '',
        buildOpsKpiBlock(summary, inbox, lang),
        '',
        sectionTitle('📄', t(lang, 'docsSection')),
        escapeHtml(t(lang, 'welcomeBoundDocs')),
        '',
        escapeHtml(t(lang, 'welcomeBoundGuide')),
        escapeHtml(t(lang, 'welcomeBoundNoApprove')),
        escapeHtml(t(lang, 'welcomeBoundLang'))
    ]);
};

const buildStartWelcomeGuest = (lang = DEFAULT_LANG) => t(lang, 'welcomeGuest');

const HELP_LINE_KEYS = [
    { key: 'helpStart' },
    { key: 'helpBind' },
    { key: 'helpHelp' },
    { key: 'helpFly' },
    { key: 'helpToday', uc: ['UC10'] },
    { key: 'helpDebt', uc: ['UC10', 'UC28'] },
    { key: 'helpLowstock', uc: ['UC15'] },
    { key: 'helpShifts', uc: ['UC10', 'UC22', 'UC29'] },
    { key: 'helpPayments', uc: ['UC10', 'UC25', 'UC29'] },
    { key: 'helpPending' },
    { key: 'helpDocs' },
    { key: 'helpReports', uc: ['UC10'] },
    { key: 'helpGuide' },
    { key: 'helpAsk', ask: true },
    { key: 'helpPayroll', uc: ['UC10'] },
    { key: 'helpPayrollNv', uc: ['UC33'] },
    { key: 'helpUnlink' }
];

const HELP_LINES = HELP_LINE_KEYS.map(item => ({
    text: I18N.vi[item.key],
    uc: item.uc
}));

const isTelegramAskEnabled = () => String(process.env.TELEGRAM_ASK || '').trim() === '1';

const buildHelpMessage = (hasCommand, lang = DEFAULT_LANG) => {
    const allowed = typeof hasCommand === 'function' ? hasCommand : () => true;
    const lines = [
        headerBlock(`❓ <b>${escapeHtml(t(lang, 'helpHeader'))}</b>`),
        `<i>${escapeHtml(t(lang, 'helpIntro'))}</i>`,
        ''
    ];
    for (const item of HELP_LINE_KEYS) {
        if (item.ask && !isTelegramAskEnabled()) continue;
        if (!item.uc?.length || allowed(item.uc)) lines.push(escapeHtml(t(lang, item.key)));
    }
    lines.push('', `<i>${escapeHtml(t(lang, 'helpNoWrite'))}</i>`, escapeHtml(t(lang, 'denyWrite')));
    return lines.join('\n');
};

const otpFailMessage = (lang, verdict) => {
    if (!verdict || verdict.ok) return '';
    if (verdict.code === 'locked') return t(lang, 'otpLocked');
    if (verdict.code === 'expired') return t(lang, 'otpExpired');
    if (verdict.code === 'wrong') return t(lang, 'otpWrong', { left: verdict.left });
    if (verdict.code === 'chat_taken') return t(lang, 'otpChatTaken');
    if (verdict.code === 'not_manager') return t(lang, 'denyNotManager');
    return t(lang, 'otpNotFound');
};

const kv = (label, value) => `${escapeHtml(label)}: ${value}`;

const buildPushCard = ({ title, rows = [], footer }, lang = DEFAULT_LANG) => {
    const lines = [
        headerBlock(`🔔 <b>${escapeHtml(title)}</b>`),
        ...rows.filter(Boolean),
        '',
        footer || hintLine(lang)
    ];
    return lines.join('\n');
};

const buildA1Message = (row, lang = DEFAULT_LANG) => buildPushCard({
    title: 'PHIẾU CHI CHỜ DUYỆT',
    rows: [
        kv('Mã', textCode(row.MaPhieu || '')),
        kv('NCC', textCode(row.TenNCC || '—')),
        kv('Công nợ', textCode(row.MaCongNo || row.MaCNPTra || '—')),
        kv('Số tiền', moneyCode(row.SoTien)),
        kv('Phương thức', textCode(row.PhuongThuc === 'Chuyển khoản' ? 'Chuyển khoản' : (row.PhuongThuc || '—'))),
        kv('Hạn thanh toán', textCode(row.HanThanhToan ? formatTelegramDate(row.HanThanhToan, lang) : '—')),
        kv('Người lập', textCode(row.NguoiLap || row.TenNV || 'Kế toán')),
        kv('Trạng thái', textCode(row.TrangThai || 'Chờ duyệt')),
        'Mở Supermarket Fly → Trung tâm phê duyệt'
    ]
}, lang);

const buildA2Message = (row, lang = DEFAULT_LANG) => {
    const lech = Number(row.ChenhLech);
    const sign = Number.isFinite(lech) ? (lech > 0 ? '+' : '') : '';
    return buildPushCard({
        title: 'CHÊNH LỆCH KẾT CA',
        rows: [
            kv('Ca', textCode(row.MaCa || '')),
            kv('Quầy', textCode(row.MaQuay || '—')),
            kv('Thu ngân', textCode(row.TenNV || row.MaNV || '—')),
            kv('Tiền hệ thống', moneyCode(row.TienMatHeThong)),
            kv('Thực nộp', moneyCode(row.TienThucNop)),
            kv('Chênh lệch', `<b>${sign}${formatMoney(lech)}</b>`),
            kv('Lý do', textCode(row.LyDo || 'Chưa nhập trên phiếu thu')),
            'Trạng thái: Cần xử lý',
            'Mở Fly → Đối soát / Phiếu thu'
        ]
    }, lang);
};

const buildB12Message = (row, lang = DEFAULT_LANG) => buildPushCard({
    title: 'CA ĐÃ CHỐT — CẦN PHIẾU THU',
    rows: [
        kv('Ca', textCode(row.MaCa || '')),
        kv('Thu ngân', textCode(row.TenNV || row.MaNV || '—')),
        'Trạng thái: Chờ Kế toán đối soát',
        'Mở Fly → Ca & Phiếu thu'
    ]
}, lang);

const buildA3Message = (summary, { sentAt } = {}) => {
    const sent = sentAt ? formatVnDate(sentAt) : '';
    return tidyLines([
        headerBlock(`🏪 <b>SUPERMARKET FLY · Hà Nội</b>`),
        buildOpsKpiBlock(summary, [], 'vi'),
        '',
        sectionTitle('💳', 'TÓM TẮT HOẠT ĐỘNG'),
        moneyLine('Tiền mặt', summary.TienMat),
        moneyLine('QR', summary.TienQR),
        moneyLine('Thẻ', summary.TienThe),
        moneyLine('Chuyển khoản', summary.TienCK),
        sent ? `<i>Gửi ${escapeHtml(sent)} sau ca đêm.</i>` : '<i>Sau ca đêm 22:00–06:00.</i>'
    ]);
};

const moneyBlock = (summary, lang) => [
    moneyLine(t(lang, 'todayRevenue'), summary.DoanhThuThuan ?? summary.DoanhThuHoaDon),
    moneyLine(t(lang, 'todayCogs'), summary.GiaVonHangBanThuan ?? summary.GiaVon),
    moneyLine(t(lang, 'todayGross'), summary.LoiNhuanGop)
];

const channelBlock = (summary, lang) => {
    const channels = [
        [t(lang, 'todayCash'), Number(summary.TienMat || 0)],
        [t(lang, 'todayQr'), Number(summary.TienQR || 0)],
        [t(lang, 'todayCard'), Number(summary.TienThe || 0)],
        [t(lang, 'todayTransfer'), Number(summary.TienCK || 0)]
    ];
    return channels.map(([label, value]) => `${channelIcon(label)} <b>${escapeHtml(label)}</b>  ${moneyCode(value)}`);
};

const alertBlock = (summary, lang) => {
    const none = t(lang, 'todayNone');
    return [
        sectionTitle('🔔', t(lang, 'todayAlerts')),
        `• ${t(lang, 'todayDebtDue')}: <b>${summary.congNoDenHan ?? 0}</b> ${t(lang, 'todayKhoan')}`,
        `• ${t(lang, 'todayPayPending')}: <b>${summary.choXacNhan ?? 0}</b>`,
        `• ${t(lang, 'todayRestock')}: <b>${summary.spCanBoSung ?? 0}</b>`,
        `• ${t(lang, 'todayShiftGap')}: <b>${escapeHtml((summary.caLech || []).join(', ') || none)}</b>`,
        summary.caDangMo != null ? `• ${t(lang, 'todayOpenShift')}: <b>${summary.caDangMo}</b>` : ''
    ].filter(Boolean);
};

const detailLines = (rows, mapFn, empty) => {
    if (!rows?.length) return empty ? [empty] : [];
    return rows.map(mapFn);
};

const buildTodayMessage = (summary, lang = DEFAULT_LANG) => {
    const lines = [
        headerBlock(`📊 <b>${escapeHtml(t(lang, 'todayTitle'))}</b>`),
        buildOpsKpiBlock(summary, [], lang),
        summary.SoHoaDon != null ? `${t(lang, 'todayInvoices')}: ${textCode(String(summary.SoHoaDon))}` : '',
        '',
        sectionTitle('💳', t(lang, 'dashPay')),
        ...channelBlock(summary, lang),
        '',
        ...alertBlock(summary, lang)
    ];
    if (summary.invoices?.length) {
        lines.push('', `<b>${escapeHtml(t(lang, 'todayTopHd'))}</b>`);
        lines.push(...summary.invoices.slice(0, 8).map(row =>
            `• ${textCode(row.MaHD)} · ${moneyCode(row.TongThanhToan)}`));
    }
    if (summary.restock?.length) {
        lines.push('', `<b>${escapeHtml(t(lang, 'todayTopStock'))}</b>`);
        lines.push(...summary.restock.slice(0, 8).map(row =>
            `• ${escapeHtml(row.TenSP)}: ${textCode(`${row.SLTon}/${row.TonKhoToiThieu}`)}`));
    }
    return tidyLines(lines);
};

const buildRevenueMessage = (summary, lang = DEFAULT_LANG) => tidyLines([
    headerBlock(`💰 <b>${escapeHtml(t(lang, 'revenueTitle'))}</b>`),
    `<i>${escapeHtml(t(lang, 'todayDay', { day: formatVnDate(summary.operatingDay) }))}</i>`,
    '',
    ...moneyBlock(summary, lang),
    summary.SoHoaDon != null ? `${t(lang, 'todayInvoices')}: ${textCode(String(summary.SoHoaDon))}` : '',
    '',
    sectionTitle('💳', t(lang, 'dashPay')),
    ...channelBlock(summary, lang),
    summary.invoices?.length ? '' : '',
    ...(summary.invoices?.length ? [
        `<b>${escapeHtml(t(lang, 'todayTopHd'))}</b>`,
        ...summary.invoices.slice(0, 8).map(row => `• ${textCode(row.MaHD)} · ${moneyCode(row.TongThanhToan)}`)
    ] : [])
]);

const inboxLine = (item, lang = DEFAULT_LANG) => {
    const title = escapeHtml(item.title || '');
    let detail = item.detail ? String(item.detail) : '';
    let when = '';
    if (isAttendanceInbox(item)) {
        const parts = detail.split(' · ').map(part => part.trim()).filter(Boolean);
        if (parts.length >= 2) parts[1] = prettyShiftName(parts[1]);
        const day = item.at ? formatTelegramDate(item.at, lang) : '';
        if (day && !parts.includes(day)) parts.push(day);
        detail = parts.join(' · ');
        when = '';
    } else if (item.at) {
        const stamped = formatVnDateTime(item.at, lang);
        when = stamped ? ` · <i>${escapeHtml(stamped)}</i>` : '';
    }
    const detailBit = detail ? ` — ${escapeHtml(detail)}` : '';
    return `• <b>${title}</b>${detailBit}${when}`;
};

const buildFlyDashboard = ({ summary = {}, inbox = [] } = {}, lang = DEFAULT_LANG) => {
    const latest = inbox.slice(0, 5);
    return tidyLines([
        headerBlock(`🏪 <b>${escapeHtml(t(lang, 'dashBrand'))}</b>`),
        buildOpsKpiBlock(summary, inbox, lang),
        summary.SoHoaDon != null ? `${t(lang, 'todayInvoices')}: ${textCode(String(summary.SoHoaDon))}` : '',
        '',
        sectionTitle('💳', t(lang, 'dashPay')),
        ...channelBlock(summary, lang),
        '',
        sectionTitle('🔔', t(lang, 'dashInbox')),
        ...(latest.length ? latest.map(item => inboxLine(item, lang)) : [`<i>${escapeHtml(t(lang, 'dashInboxEmpty'))}</i>`]),
        latest.some(isAttendanceInbox) ? `<i>${escapeHtml(t(lang, 'attendanceFlyPath'))}</i>` : '',
        '',
        hintLine(lang)
    ]);
};

const buildDebtMessage = ({ summary = {}, rows = [] } = {}, lang = DEFAULT_LANG) => {
    const total = Number(summary.TongKhoan || 0);
    const overdue = Number(summary.QuaHan || 0);
    const lines = [
        headerBlock(`🧾 <b>${escapeHtml(t(lang, 'debtTitle'))}</b>`),
        `<blockquote>${overdue ? '🔴' : '🟢'} <b>${escapeHtml(t(lang, 'debtRemain'))}</b>  ${moneyCode(summary.TongConLai)}\n${escapeHtml(t(lang, 'debtOverdue'))}: ${textCode(String(overdue))} · ${escapeHtml(t(lang, 'debtSoon'))}: ${textCode(String(summary.SapHan || 0))}</blockquote>`,
        `${t(lang, 'debtCount')}: ${textCode(String(total))}  ${progressBar(total - overdue, total, 7)}`,
        '',
        `<b>${escapeHtml(t(lang, 'debtTop'))}</b>`
    ];
    if (!rows.length) lines.push(t(lang, 'debtEmpty'));
    for (const row of rows.slice(0, 8)) {
        const due = row.HanThanhToan ? new Date(row.HanThanhToan).getTime() : NaN;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tone = Number.isFinite(due) && due < today.getTime() ? '🔴' : '🟡';
        lines.push(`${tone} ${textCode(row.MaCNPTra)} · <b>${escapeHtml(row.TenNCC)}</b>\n   ${moneyCode(row.SoTienConLai)} · ${t(lang, 'debtDue')} ${textCode(formatTelegramDate(row.HanThanhToan, lang))}`);
    }
    return lines.join('\n');
};

const buildLowstockMessage = (rows, lang = DEFAULT_LANG) => {
    if (!rows?.length) return t(lang, 'lowstockEmpty');
    return [
        headerBlock(`📦 <b>${escapeHtml(t(lang, 'lowstockTitle'))}</b>`),
        `<i>${escapeHtml(t(lang, 'lowstockHead'))}</i>`,
        ...rows.slice(0, 8).map(row => {
            const current = Number(row.SLTon || 0);
            const minimum = Number(row.TonKhoToiThieu || 0);
            const tone = current <= 0 ? '🔴' : (current < minimum / 2 ? '🟠' : '🟡');
            return `${tone} <b>${escapeHtml(row.TenSP)}</b>  ${textCode(`${current}/${minimum}`)}\n   ${progressBar(current, minimum, 8)}`;
        })
    ].join('\n');
};

const buildShiftsMessage = (rows, lang = DEFAULT_LANG) => {
    if (!rows?.length) return t(lang, 'shiftsEmpty');
    const lines = [headerBlock(`🕐 <b>${escapeHtml(t(lang, 'shiftsTitle'))}</b>`)];
    for (const row of rows.slice(0, 8)) {
        const lech = Number(row.ChenhLech || 0);
        const gap = lech ? ` · ${t(lang, 'shiftsGap')} ${moneyCode(lech)}` : '';
        const quay = row.MaQuay ? ` · ${t(lang, 'shiftsCounter')} ${textCode(row.MaQuay)}` : '';
        const recon = row.TrangThaiDoiSoat ? ` · ${escapeHtml(row.TrangThaiDoiSoat)}` : '';
        lines.push(`${statusBadge(row.TrangThai)}  ${textCode(row.MaCa)}\n   👤 ${escapeHtml(row.TenNV)}${quay}${gap}${recon}`);
    }
    return lines.join('\n');
};

const formatPayChannel = (row, lang) => {
    const waiting = Number(row.ChoXacNhan || 0);
    return `${channelIcon(row.PhuongThuc)} <b>${escapeHtml(row.PhuongThuc)}</b>  ${moneyCode(row.Tong)}\n   ${textCode(String(row.SoLuong || 0))} GD · ${waiting ? '🟡' : '🟢'} ${t(lang, 'payPending')} ${textCode(String(waiting))}`;
};

const buildPaymentsMessage = ({ day, channels = [], recent = [], shifts = [] } = {}, lang = DEFAULT_LANG) => {
    const cashRow = channels.find(row => isCashMethod(row.PhuongThuc))
        || { PhuongThuc: t(lang, 'todayCash'), Tong: 0, SoLuong: 0, ChoXacNhan: 0 };
    const qrRow = channels.find(row => isQrMethod(row.PhuongThuc))
        || { PhuongThuc: t(lang, 'todayQr'), Tong: 0, SoLuong: 0, ChoXacNhan: 0 };
    const others = channels.filter(row => !isCashMethod(row.PhuongThuc) && !isQrMethod(row.PhuongThuc));
    const lines = [
        headerBlock(`💳 <b>${escapeHtml(t(lang, 'payTitle'))}</b>`),
        `<i>${escapeHtml(t(lang, 'payDay', { day: formatVnDate(day) }))}</i>`,
        `<i>${escapeHtml(t(lang, 'payMixHint'))}</i>`,
        formatPayChannel(cashRow, lang),
        formatPayChannel(qrRow, lang)
    ];
    if (!Number(cashRow.Tong) && !Number(cashRow.SoLuong)) {
        lines.push(`<i>${escapeHtml(t(lang, 'payCashNone'))}</i>`);
    }
    for (const row of others) lines.push(formatPayChannel(row, lang));
    if (!channels.length && !Number(cashRow.SoLuong) && !Number(qrRow.SoLuong)) {
        lines.push(t(lang, 'payEmpty'));
    }
    if (shifts.length) {
        lines.push('', `<b>${escapeHtml(t(lang, 'payShifts'))}</b>`);
        for (const row of shifts.slice(0, 8)) {
            const status = row.TrangThai ? statusBadge(row.TrangThai) : '⚪';
            lines.push(`${status}  ${textCode(row.MaCa)}\n   💵 ${moneyCode(row.TienMat)} · ${textCode(String(row.SoGdTm || 0))} GD · 📱 ${moneyCode(row.TienQR)} · ${textCode(String(row.SoGdQr || 0))} GD`);
        }
    } else if (channels.length) {
        lines.push('', `<i>${escapeHtml(t(lang, 'payShiftsEmpty'))}</i>`);
    }
    if (recent.length) {
        lines.push('', `<b>${escapeHtml(t(lang, 'payRecent'))}</b>`);
        for (const row of recent.slice(0, 8)) {
            lines.push(`${channelIcon(row.PhuongThuc)} ${escapeHtml(row.PhuongThuc)} · ${moneyCode(row.SoTien)} · <i>${escapeHtml(formatVnDateTime(row.NgayTT, lang))}</i>`);
        }
    }
    return lines.join('\n');
};

const buildPendingMessage = (items, lang = DEFAULT_LANG) => {
    if (!items?.length) {
        return tidyLines([
            headerBlock(`⏳ <b>${escapeHtml(t(lang, 'pendingTitle'))}</b>`),
            t(lang, 'pendingEmpty'),
            '',
            `<i>${escapeHtml(t(lang, 'hideAfterRead'))}</i>`
        ]);
    }
    const rows = items.slice(0, 8);
    const hasAttendance = rows.some(isAttendanceInbox);
    return tidyLines([
        headerBlock(`⏳ <b>${escapeHtml(t(lang, 'pendingTitle'))}</b>`),
        `<blockquote>📌 <b>${rows.length}</b> mục đang hiển thị · ưu tiên mục có dấu 🔴</blockquote>`,
        ...rows.map((item, index) => `${item.tone === 'urgent' ? '🔴' : '🟡'} <b>${String(index + 1).padStart(2, '0')}</b>  ${inboxLine(item, lang).replace(/^•\s*/, '')}`),
        hasAttendance ? '' : '',
        hasAttendance ? `<i>${escapeHtml(ATTENDANCE_NOTE_VI)}</i>` : '',
        hasAttendance ? `<i>${escapeHtml(t(lang, 'pendingAttendanceHint'))}</i>` : '',
        '',
        hintLine(lang),
        `<i>${escapeHtml(t(lang, 'hideAfterRead'))}</i>`
    ]);
};

const buildReportsMessages = ({ summary = {}, debt = {}, inbox = [], pnl = null, shifts = [], restock = [] } = {}, lang = DEFAULT_LANG) => {
    const none = t(lang, 'todayNone');
    const lech = (summary.caLech || []).slice(0, 6).join(', ') || none;
    const stockRows = restock.length ? restock : (summary.restock || []);
    const gross = [
        headerBlock(`📊 <b>${escapeHtml(t(lang, 'reportsTitle'))} · 1/5</b>`),
        `<i>${escapeHtml(t(lang, 'todayDay', { day: formatVnDate(summary.operatingDay) }))}</i>`,
        '',
        `<b>${escapeHtml(t(lang, 'dashOps'))}</b>`,
        ...moneyBlock(summary, lang),
        summary.SoHoaDon != null ? `${t(lang, 'todayInvoices')}: ${textCode(String(summary.SoHoaDon))}` : '',
        `<i>${escapeHtml(t(lang, 'reportsGrossNote'))}</i>`,
        '',
        `<b>${escapeHtml(t(lang, 'dashPay'))}</b>`,
        ...channelBlock(summary, lang)
    ].filter(line => line !== '').join('\n');
    const pnlLines = [
        headerBlock(`📊 <b>${escapeHtml(t(lang, 'reportsTitle'))} · P&amp;L · 2/5</b>`),
        `<i>${escapeHtml(t(lang, 'reportsPnlNote'))}</i>`
    ];
    if (pnl && (pnl.laiLoSauChiPhi != null || pnl.loiNhuanGop != null)) {
        if (pnl.loiNhuanGop != null) pnlLines.push(`Lãi gộp (cột A): ${moneyCode(pnl.loiNhuanGop)}`);
        if (pnl.chiPhiBenThu3 != null) pnlLines.push(`Chi NCC + cước: ${moneyCode(pnl.chiPhiBenThu3)}`);
        if (pnl.chiPhiNhanVien != null) pnlLines.push(`Lương đã khóa: ${moneyCode(pnl.chiPhiNhanVien)}`);
        if (pnl.laiLoSauChiPhi != null) pnlLines.push(`Lãi/lỗ sau chi phí: ${moneyCode(pnl.laiLoSauChiPhi)}`);
        if (pnl.trangThai) pnlLines.push(`Trạng thái: ${textCode(pnl.trangThai)}`);
    } else {
        pnlLines.push('<i>Chưa có P&amp;L điều hành cho ngày này. Lãi gộp ở tin 1 không trừ chi NCC / lương.</i>');
    }
    const debtText = [
        headerBlock(`🧾 <b>${escapeHtml(t(lang, 'debtTitle'))} · 3/5</b>`),
        `${t(lang, 'debtCount')}: ${textCode(String(debt.TongKhoan || 0))}`,
        `${t(lang, 'debtRemain')}: ${moneyCode(debt.TongConLai)}`,
        `${t(lang, 'debtSoon')}: ${textCode(String(debt.SapHan || 0))}`,
        `${t(lang, 'debtOverdue')}: ${textCode(String(debt.QuaHan || 0))}`
    ].join('\n');
    const shiftLines = [
        headerBlock(`🕐 <b>${escapeHtml(t(lang, 'shiftsTitle'))} · 4/5</b>`),
        `⏳ ${t(lang, 'dashPending')}: ${textCode(String(inbox.length || 0))}`,
        `🕐 ${t(lang, 'dashOpenShift')}: ${textCode(String(summary.caDangMo ?? 0))} · ${t(lang, 'dashGapShift')}: ${textCode(lech)}`
    ];
    if (shifts.length) {
        for (const row of shifts.slice(0, 8)) {
            const gap = Number(row.ChenhLech || 0);
            shiftLines.push(`• ${textCode(row.MaCa)} · ${escapeHtml(row.TenNV || '')} · ${escapeHtml(row.TrangThai || '')}${gap ? ` · lệch ${moneyCode(gap)}` : ''}`);
        }
    }
    const stockLines = [
        headerBlock(`📦 <b>${escapeHtml(t(lang, 'lowstockTitle'))} · 5/5</b>`),
        `📦 ${t(lang, 'dashRestock')}: ${textCode(String(summary.spCanBoSung ?? stockRows.length ?? 0))}`
    ];
    if (stockRows.length) {
        stockLines.push(...stockRows.slice(0, 8).map(row =>
            `• ${escapeHtml(row.TenSP)}: ${textCode(`${row.SLTon}/${row.TonKhoToiThieu}`)}`));
    } else {
        stockLines.push(t(lang, 'lowstockEmpty'));
    }
    if (summary.invoices?.length) {
        stockLines.push('', `<b>${escapeHtml(t(lang, 'todayTopHd'))}</b>`);
        stockLines.push(...summary.invoices.slice(0, 6).map(row =>
            `• ${textCode(row.MaHD)} · ${moneyCode(row.TongThanhToan)}`));
    }
    return [gross, pnlLines.join('\n'), debtText, shiftLines.join('\n'), stockLines.join('\n')];
};

const buildReportsMessage = ({ summary = {}, debt = {}, inbox = [], pnl = null, shifts = [], restock = [] } = {}, lang = DEFAULT_LANG) => {
    const none = t(lang, 'todayNone');
    const lech = (summary.caLech || []).slice(0, 6).join(', ') || none;
    const lines = [
        headerBlock(`📊 <b>${escapeHtml(t(lang, 'reportsTitle'))}</b>`),
        `<i>${escapeHtml(t(lang, 'todayDay', { day: formatVnDate(summary.operatingDay) }))}</i>`,
        '',
        `<b>${escapeHtml(t(lang, 'dashOps'))}</b>`,
        ...moneyBlock(summary, lang),
        summary.SoHoaDon != null ? `${t(lang, 'todayInvoices')}: ${textCode(String(summary.SoHoaDon))}` : '',
        `<i>${escapeHtml(t(lang, 'reportsGrossNote'))}</i>`,
        '',
        `<b>${escapeHtml(t(lang, 'dashPay'))}</b>`,
        ...channelBlock(summary, lang),
        '',
        `<b>${escapeHtml(t(lang, 'debtTitle'))}</b>`,
        `${t(lang, 'debtCount')}: ${textCode(String(debt.TongKhoan || 0))}`,
        `${t(lang, 'debtRemain')}: ${moneyCode(debt.TongConLai)}`,
        `${t(lang, 'debtSoon')}: ${textCode(String(debt.SapHan || 0))}`,
        `${t(lang, 'debtOverdue')}: ${textCode(String(debt.QuaHan || 0))}`,
        '',
        `<b>${escapeHtml(t(lang, 'dashWatch'))}</b>`,
        `⏳ ${t(lang, 'dashPending')}: ${textCode(String(inbox.length || 0))}`,
        `🕐 ${t(lang, 'dashOpenShift')}: ${textCode(String(summary.caDangMo ?? 0))} · ${t(lang, 'dashGapShift')}: ${textCode(lech)}`,
        `📦 ${t(lang, 'dashRestock')}: ${textCode(String(summary.spCanBoSung ?? 0))}`
    ];
    if (pnl && (pnl.laiLoSauChiPhi != null || pnl.loiNhuanGop != null)) {
        lines.push('', `<b>P&amp;L điều hành (khác lãi gộp)</b>`);
        if (pnl.loiNhuanGop != null) lines.push(`Lãi gộp (cột A): ${moneyCode(pnl.loiNhuanGop)}`);
        if (pnl.chiPhiBenThu3 != null) lines.push(`Chi NCC + cước: ${moneyCode(pnl.chiPhiBenThu3)}`);
        if (pnl.chiPhiNhanVien != null) lines.push(`Lương đã khóa: ${moneyCode(pnl.chiPhiNhanVien)}`);
        if (pnl.laiLoSauChiPhi != null) lines.push(`Lãi/lỗ sau chi phí: ${moneyCode(pnl.laiLoSauChiPhi)}`);
        if (pnl.trangThai) lines.push(`Trạng thái: ${textCode(pnl.trangThai)}`);
        lines.push(`<i>${escapeHtml(t(lang, 'reportsPnlNote'))}</i>`);
    }
    if (summary.invoices?.length) {
        lines.push('', `<b>${escapeHtml(t(lang, 'todayTopHd'))}</b>`);
        lines.push(...summary.invoices.slice(0, 6).map(row =>
            `• ${textCode(row.MaHD)} · ${moneyCode(row.TongThanhToan)}`));
    }
    return lines.filter(line => line !== '').join('\n');
};

const buildAlertsMessage = (items, lang = DEFAULT_LANG) => {
    if (!items?.length) return t(lang, 'alertsEmpty');
    const rows = items.slice(0, 8);
    const hasAttendance = rows.some(isAttendanceInbox);
    return [
        headerBlock(`🔔 <b>${escapeHtml(t(lang, 'alertsTitle'))}</b>`),
        ...rows.map(item => inboxLine(item, lang)),
        hasAttendance ? `<i>${escapeHtml(t(lang, 'attendanceFlyPath'))}</i>` : '',
        hasAttendance ? `<i>${escapeHtml(t(lang, 'pendingAttendanceHint'))}</i>` : '',
        '',
        hintLine(lang)
    ].filter(Boolean).join('\n');
};

const buildPayrollSummaryMessage = (summary, month, lang = DEFAULT_LANG) => [
    headerBlock(`💼 <b>${escapeHtml(t(lang, 'payrollTitle', { month }))}</b>`),
    `<blockquote>💰 <b>${t(lang, 'payrollTotal')}</b>  ${moneyCode(summary.Tong)}</blockquote>`,
    `${t(lang, 'payrollStaff')}: ${textCode(String(summary.SoNV || 0))}`,
    `✅ ${t(lang, 'payrollPaid')}: ${textCode(String(summary.DaChi || 0))}`,
    `⏳ ${t(lang, 'payrollUnpaid')}: ${textCode(String(summary.ChuaChi || 0))}`,
    `${progressBar(summary.DaChi, summary.SoNV, 10)}`
].join('\n');

const buildPayrollOneMessage = (row, maNV, month, lang = DEFAULT_LANG) => [
    headerBlock(`💼 <b>${escapeHtml(t(lang, 'payrollOne', { name: row.TenNV, maNV }))}</b>`),
    t(lang, 'payrollPeriod', { month }),
    `${t(lang, 'payrollDayHours')}: ${textCode(String(Math.round(Number(row.PhutNgay || 0) / 60)))} ${t(lang, 'payrollHoursUnit')}`,
    `${t(lang, 'payrollNightHours')}: ${textCode(String(Math.round(Number(row.PhutDem || 0) / 60)))} ${t(lang, 'payrollHoursUnit')}`,
    `${t(lang, 'payrollTotal')}: ${moneyCode(row.TongLuong)}`,
    `${t(lang, 'payrollStatus')}: ${textCode(row.TrangThai)}`
].join('\n');

const buildInboxPushMessage = (item, lang = DEFAULT_LANG) => {
    const tone = item.tone === 'urgent' ? '⚠' : '🔔';
    const attendance = isAttendanceInbox(item);
    let detail = item.detail ? String(item.detail) : '';
    if (attendance) {
        const parts = detail.split(' · ').map(part => part.trim()).filter(Boolean);
        if (parts.length >= 2) parts[1] = prettyShiftName(parts[1]);
        const day = item.at ? formatTelegramDate(item.at, lang) : '';
        if (day && !parts.includes(day)) parts.push(day);
        detail = parts.join(' · ');
    }
    const when = !attendance && item.at ? formatVnDateTime(item.at, lang) : '';
    return [
        headerBlock(`${tone} <b>${escapeHtml(t(lang, 'pushNew'))}</b>`),
        `<b>${escapeHtml(item.title || '')}</b>`,
        detail ? escapeHtml(detail) : '',
        when ? `<i>${escapeHtml(when)}</i>` : '',
        attendance ? `<i>${escapeHtml(ATTENDANCE_NOTE_VI)}</i>` : '',
        '',
        `<i>${escapeHtml(t(lang, 'flyHint'))}</i>`
    ].filter(Boolean).join('\n');
};

const buildAttendancePendingMessage = (row, lang = DEFAULT_LANG) => {
    const ca = prettyShiftName(row.TenCa || row.MaLoaiCa || '');
    const ngay = formatTelegramDate(row.NgayLam, lang) || '—';
    return buildPushCard({
        title: t(lang, 'pushAttendanceTitle'),
        rows: [
            kv('Nhân viên', textCode(row.TenNV || row.MaNV || '—')),
            kv('Ca', textCode(`${ca} · ${ngay}`)),
            `<i>${escapeHtml(ATTENDANCE_NOTE_VI)}</i>`
        ]
    }, lang);
};

const buildSimplePush = (title, fields, lang = DEFAULT_LANG) => buildPushCard({
    title,
    rows: Object.entries(fields).map(([label, value]) => kv(label, typeof value === 'number' || /đ$/.test(String(value))
        ? (Number.isFinite(Number(String(value).replace(/\D/g, ''))) && /đ$/.test(String(value))
            ? `<b>${escapeHtml(String(value))}</b>`
            : textCode(formatTelegramValue(value, lang)))
        : textCode(formatTelegramValue(value, lang))))
}, lang);

const hasForbiddenFinanceLabel = text => /báo cáo tài chính ngày|tài chính ngày|kqkd|p&amp;l điều hành|p&l điều hành/i.test(String(text || ''));

const REPLY_CMD_KEYS = [
    { key: 'kbDocs', name: 'docs' },
    { key: 'kbLowstock', name: 'lowstock' },
    { key: 'kbPending', name: 'pending' },
    { key: 'kbReports', name: 'reports' },
    { key: 'kbRevenue', name: 'revenue' },
    { key: 'kbDebt', name: 'debt' },
    { key: 'kbShifts', name: 'shifts' },
    { key: 'kbPayments', name: 'payments' },
    { key: 'kbAlerts', name: 'alerts' },
    { key: 'kbGuide', name: 'guide' },
    { key: 'kbHide', name: 'hidekb' },
    { key: 'kbShow', name: 'showkb' },
    { key: 'kbFly', name: 'fly' },
    { key: 'kbLang', name: 'langmenu' },
    { key: 'kbHelp', name: 'help' },
    { key: 'kbAsk', name: 'askwait' },
    { key: 'kbLink', name: 'linkguide' }
];

const FLY_LABEL_KEYS = [
    { key: 'flyHome', name: 'fly' },
    { key: 'navHome', name: 'fly' },
    { key: 'flyDocs', name: 'docs' },
    { key: 'btnDocs', name: 'docs' },
    { key: 'flyReports', name: 'reports' },
    { key: 'btnReports', name: 'reports' },
    { key: 'flyPending', name: 'pending' },
    { key: 'flyDebt', name: 'debt' },
    { key: 'flyToday', name: 'today' },
    { key: 'flyRevenue', name: 'revenue' },
    { key: 'flyLowstock', name: 'lowstock' },
    { key: 'flyShifts', name: 'shifts' },
    { key: 'flyPayments', name: 'payments' },
    { key: 'flyAlerts', name: 'alerts' },
    { key: 'flyLang', name: 'langmenu' },
    { key: 'flyHelp', name: 'help' },
    { key: 'btnHelp', name: 'help' },
    { key: 'flyGuide', name: 'guide' }
];

const REPLY_NEEDLES = [
    { name: 'hidekb', needles: ['ẩn menu', 'hide menu', '隐藏菜单'] },
    { name: 'showkb', needles: ['hiện menu', 'show menu', '显示菜单'] },
    { name: 'guide', needles: ['tài liệu / quy tắc', 'docs / rules', '文档 / 规则', 'tài liệu', 'quy tắc'] },
    { name: 'revenue', needles: ['doanh thu hôm nay', 'today revenue', '今日销售', 'doanh thu'] },
    { name: 'docs', needles: ['chứng từ', 'giấy tờ', 'documents', 'papers', '单据', '证件'] },
    { name: 'reports', needles: ['báo cáo', 'store report', '门店报表', 'reports'] },
    { name: 'pending', needles: ['cần duyệt', 'việc chờ duyệt', 'việc chờ', 'pending approval', '待审批', '待办'] },
    { name: 'debt', needles: ['công nợ ncc', 'công nợ', 'supplier ap', '供应商应付'] },
    { name: 'lowstock', needles: ['tồn thấp', 'low stock', 'sản phẩm / tồn', '商品 / 低库存', '低库存'] },
    { name: 'shifts', needles: ['ca & quỹ', 'ca làm', 'shifts & cash', '班次与钱箱'] },
    { name: 'payments', needles: ['thanh toán bằng qr', 'thanh toán bằng', 'qr hay tiền mặt', 'bán tiền mặt', 'ca nào bằng', 'ca nào thu', 'thu tm', 'thanh toán', 'payments', '支付'] },
    { name: 'alerts', needles: ['cảnh báo', 'alerts', '提醒'] },
    { name: 'today', needles: ['hôm nay', 'today', '今日经营'] },
    { name: 'fly', needles: ['tóm tắt /fly', 'summary /fly', '摘要 /fly', 'tóm tắt', 'summary', 'cập nhật', 'tổng quan', 'làm mới', 'refresh', '刷新'] },
    { name: 'langmenu', needles: ['ngôn ngữ', 'language', '语言'] },
    { name: 'help', needles: ['trợ giúp', 'help', '帮助'] },
    { name: 'askwait', needles: ['hỏi trợ lý', 'ask assistant', '问助手'] },
    { name: 'linkguide', needles: ['hướng dẫn otp', 'otp guide', 'otp 说明', 'liên kết', '关联'] }
];

const REPLY_FALLBACK = [
    { name: 'hidekb', re: /ẩn menu|hide menu|隐藏菜单/i },
    { name: 'showkb', re: /hiện menu|show menu|显示菜单/i },
    { name: 'guide', re: /tài liệu\s*\/\s*quy tắc|docs\s*\/\s*rules|文档\s*\/\s*规则|\/guide|\/rules/i },
    { name: 'docs', re: /chứng từ|giấy tờ|documents|单据/i },
    { name: 'lowstock', re: /sản phẩm\s*\/\s*tồn|low stock|商品\s*\/\s*低库存|tồn thấp/i },
    { name: 'pending', re: /cần duyệt|việc chờ|pending approval|待审批/i },
    { name: 'reports', re: /báo cáo|门店报表|\breports\b/i },
    { name: 'revenue', re: /doanh thu|today revenue|今日销售/i },
    { name: 'debt', re: /công nợ|supplier ap|供应商应付/i },
    { name: 'shifts', re: /ca\s*&\s*quỹ|shifts\s*&\s*cash|班次与钱箱|^🕐/i },
    { name: 'payments', re: /thanh toán|payments|支付|thu\s*tm|qr hay|ca nào bằng|ca nào thu|bán tiền mặt/i },
    { name: 'alerts', re: /cảnh báo|alerts|提醒/i },
    { name: 'fly', re: /tóm tắt|summary\s*\/fly|摘要\s*\/fly|cập nhật|tổng quan|làm mới|^refresh$/i },
    { name: 'langmenu', re: /ngôn ngữ|language|语言/i },
    { name: 'help', re: /trợ giúp|\/help|帮助/i },
    { name: 'askwait', re: /hỏi trợ lý|ask assistant|问助手/i },
    { name: 'linkguide', re: /hướng dẫn otp|otp guide|otp 说明|liên kết/i }
];

const FORBIDDEN_REPLY = /game|voucher|vietqr|nạp\s|nap tien|mở shop|mo shop|complete[\s_]?invoice/i;

const normalizeReplyText = (text) => String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\uFE0F\u200D]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}]/gu, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi-VN');

const LABEL_TO_CMD = new Map();
const registerReplyLabel = (label, name) => {
    const raw = String(label || '').replace(/\u00a0/g, ' ').trim();
    if (!raw) return;
    LABEL_TO_CMD.set(raw, name);
    const norm = normalizeReplyText(raw);
    if (norm) LABEL_TO_CMD.set(norm, name);
};
for (const lang of LANGS) {
    for (const item of [...REPLY_CMD_KEYS, ...FLY_LABEL_KEYS]) {
        registerReplyLabel(t(lang, item.key), item.name);
    }
}

const foldReply = (value) => normalizeReplyText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

const PAYMENTS_INTENT_RE = /(?:\bca\b|\bban\b|\bthu\b|thanh toan|giao dich|\bgd\b).{0,36}(?:tien mat|\btm\b|\bqr\b|zalopay|momo)|(?:hom nay).{0,36}(?:tien mat|thu tm|\bqr\b)|(?:\bqr\b|zalopay|momo).{0,24}(?:hay|hoac|vs|\/|voi).{0,16}(?:tien mat|\btm\b)|(?:tien mat).{0,20}(?:hay|hoac|vs).{0,16}(?:\bqr\b|zalopay)|(?:bao nhieu).{0,28}\bca\b.{0,28}(?:thanh toan|\bqr\b|tien mat)|ca nao (?:bang |thu )?(?:tien mat|\btm\b|\bqr\b)|ban tien mat|thu tm|qr hay tien mat|thanh toan bang/;
const OTHER_TOPIC_RE = /cong no|ton thap|luong|phieu chi|chung tu|bao cao|ncc|duyet po|ton kho/;
const SHORT_FOLLOWUP_RE = /^(con|vay|the|sao|roi|u+|da|o+|uk|ok|khong e|ko e|co)\b/;

const matchPaymentsIntent = (text) => PAYMENTS_INTENT_RE.test(foldReply(text));

const looksLikeTopicFollowUp = (text) => {
    const fold = foldReply(text);
    if (!fold || fold.length > 80 || OTHER_TOPIC_RE.test(fold)) return false;
    return SHORT_FOLLOWUP_RE.test(fold) || /\b(ca|tm|qr|tien mat|hom nay)\b/.test(fold);
};

const isCashMethod = (name) => /tiền mặt|tien mat|cash|现金/i.test(String(name || ''));
const isQrMethod = (name) => {
    const key = String(name || '').trim().toLocaleLowerCase('vi-VN');
    return key === 'qr' || /zalopay|momo/.test(key);
};

const summarizePaymentShifts = (rows = []) => {
    const map = new Map();
    for (const row of rows) {
        const id = String(row.MaCa || '—').trim() || '—';
        const cur = map.get(id) || {
            MaCa: id,
            TrangThai: row.TrangThai || '',
            TienMat: 0,
            TienQR: 0,
            SoGdTm: 0,
            SoGdQr: 0
        };
        const amount = Number(row.Tong || 0);
        const count = Number(row.SoLuong || 0);
        if (isCashMethod(row.PhuongThuc)) {
            cur.TienMat += amount;
            cur.SoGdTm += count;
        } else if (isQrMethod(row.PhuongThuc)) {
            cur.TienQR += amount;
            cur.SoGdQr += count;
        }
        if (row.TrangThai) cur.TrangThai = row.TrangThai;
        map.set(id, cur);
    }
    return [...map.values()];
};

const matchReplyNeedles = (norm) => {
    if (!norm) return null;
    let best = null;
    let bestLen = 0;
    for (const item of REPLY_NEEDLES) {
        for (const needle of item.needles) {
            const key = normalizeReplyText(needle);
            if (!key) continue;
            if (norm === key || norm.includes(key) || (norm.length >= 4 && key.includes(norm))) {
                if (key.length > bestLen) {
                    best = item.name;
                    bestLen = key.length;
                }
            }
        }
    }
    return best;
};

const matchReplyCommand = (text) => {
    const raw = String(text || '').replace(/\u00a0/g, ' ').trim();
    if (!raw || FORBIDDEN_REPLY.test(raw)) return null;
    if (/^\/[A-Za-z0-9_]+/i.test(raw)) return null;
    if (LABEL_TO_CMD.has(raw)) return { name: LABEL_TO_CMD.get(raw), via: 'reply' };
    const norm = normalizeReplyText(raw);
    if (norm && LABEL_TO_CMD.has(norm)) return { name: LABEL_TO_CMD.get(norm), via: 'reply' };
    if (matchPaymentsIntent(raw)) return { name: 'payments', via: 'reply' };
    const fromNeedle = matchReplyNeedles(norm);
    if (fromNeedle) return { name: fromNeedle, via: 'reply' };
    for (const item of REPLY_FALLBACK) {
        if (item.re.test(raw) || (norm && item.re.test(norm))) return { name: item.name, via: 'reply' };
    }
    return null;
};

const REPORT_MENU_ITEMS = [
    { id: 'wh', key: 'rptWarehouse' },
    { id: 'dept', key: 'rptDept' },
    { id: 'today', key: 'rptToday' },
    { id: 'debt', key: 'rptDebt' },
    { id: 'pending', key: 'rptPending' },
    { id: 'shifts', key: 'rptShifts' },
    { id: 'lowstock', key: 'rptLowstock' },
    { id: 'pnl', key: 'rptPnl' }
];

const reportsMenuKeyboard = (lang = DEFAULT_LANG, now = new Date()) => {
    const current = currentPeriodDefaults(now);
    const periodRows = [[
        { text: t(lang, 'rptMonth'), callback_data: `period:month:${current.month}` },
        { text: t(lang, 'rptQuarter'), callback_data: `period:quarter:${current.quarter}` }
    ], [
        { text: t(lang, 'rptYear'), callback_data: `period:year:${current.year}` }
    ]];
    return { inline_keyboard: periodRows.concat(REPORT_MENU_ITEMS.map(item => ([{
        text: t(lang, item.key),
        callback_data: `rpt:${item.id}`
    }])).concat([[
        { text: '🏠 Tổng quan', callback_data: 'cmd:fly' },
        { text: '📄 Chứng từ', callback_data: 'cmd:docs' }
    ]])) };
};

const buildReportsMenu = (lang = DEFAULT_LANG) => [
    headerBlock(`📊 <b>${escapeHtml(t(lang, 'reportsPickTitle'))}</b>`),
    `<i>${escapeHtml(t(lang, 'reportsPickHint'))}</i>`,
    '',
    `<i>${escapeHtml(t(lang, 'hideAfterRead'))}</i>`
].join('\n');

const buildPnlOnlyMessage = (pnl, lang = DEFAULT_LANG) => {
    const lines = [
        headerBlock(`📊 <b>P&amp;L · ${escapeHtml(t(lang, 'reportsTitle'))}</b>`),
        `<i>${escapeHtml(t(lang, 'reportsPnlNote'))}</i>`
    ];
    if (pnl && (pnl.laiLoSauChiPhi != null || pnl.loiNhuanGop != null)) {
        if (pnl.loiNhuanGop != null) lines.push(`Lãi gộp (cột A): ${moneyCode(pnl.loiNhuanGop)}`);
        if (pnl.chiPhiBenThu3 != null) lines.push(`Chi NCC + cước: ${moneyCode(pnl.chiPhiBenThu3)}`);
        if (pnl.chiPhiNhanVien != null) lines.push(`Lương đã khóa: ${moneyCode(pnl.chiPhiNhanVien)}`);
        if (pnl.laiLoSauChiPhi != null) lines.push(`Lãi/lỗ sau chi phí: ${moneyCode(pnl.laiLoSauChiPhi)}`);
        if (pnl.trangThai) lines.push(`Trạng thái: ${textCode(pnl.trangThai)}`);
    } else {
        lines.push(`<i>${escapeHtml(t(lang, 'reportsPnlEmpty'))}</i>`);
    }
    return lines.join('\n');
};

const reportNumber = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const reportPercent = (value, total) => {
    const denominator = reportNumber(total);
    if (!denominator) return 0;
    return reportNumber(value) / denominator * 100;
};

const percentText = value => `${reportNumber(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;

const reportDeltaLine = (label, current, previous, { money = true } = {}) => {
    const now = reportNumber(current);
    const before = reportNumber(previous);
    const diff = now - before;
    const icon = diff > 0 ? '↗️' : (diff < 0 ? '↘️' : '➡️');
    const value = money ? moneyCode(Math.abs(diff)) : textCode(String(Math.abs(Math.round(diff))));
    if (!before) {
        return `${icon} ${escapeHtml(label)}: ${now ? '<i>mới phát sinh</i>' : '<i>không đổi</i>'}`;
    }
    const pct = Math.abs(diff / before * 100);
    const sign = diff > 0 ? '+' : (diff < 0 ? '−' : '');
    return `${icon} ${escapeHtml(label)}: ${sign}${value} · ${sign}${percentText(pct)}`;
};

const buildManagementReportMessage = ({ report, previousReport } = {}, lang = DEFAULT_LANG) => {
    if (!report?.hoatDong || !report?.period) {
        return headerBlock('📊 <b>BÁO CÁO QUẢN TRỊ</b>') + '\n<i>Chưa có dữ liệu cho kỳ đã chọn.</i>';
    }
    const period = report.period;
    const op = report.hoatDong;
    const sales = op.banHang || {};
    const cogs = op.giaVon || {};
    const partner = op.benThu3 || {};
    const staff = op.nhanVien || {};
    const cash = report.tienMat || {};
    const previous = previousReport?.hoatDong || {};
    const previousSales = previous.banHang || {};
    const revenue = reportNumber(op.doanhThuThuan);
    const gross = reportNumber(op.loiNhuanGop);
    const net = reportNumber(op.laiLoSauChiPhi);
    const grossMargin = reportPercent(gross, revenue);
    const netMargin = reportPercent(net, revenue);
    const cogsRate = reportPercent(cogs.giaVonThuan, revenue);
    const returnRate = reportPercent(sales.tienHoan, sales.doanhThuHoaDon);
    const invoiceCount = reportNumber(sales.soHoaDon);
    const averageInvoice = invoiceCount ? revenue / invoiceCount : 0;
    const statusIcon = net > 0 ? '🟢' : (net < 0 ? '🔴' : '🟡');
    const previousLabel = previousReport?.period?.label || 'kỳ trước';
    const notes = [];
    if (staff.kyChuaKhoa?.length) notes.push(`Lương chưa khóa: ${staff.kyChuaKhoa.join(', ')} — chưa được trừ.`);
    for (const item of (partner.ghiChu || []).slice(0, 3)) {
        notes.push(`${item.ten}: ${item.ghiChu}`);
    }
    const topSuppliers = (partner.nhaCungCap || []).slice(0, 3);
    const lines = [
        headerBlock(`📊 <b>BÁO CÁO QUẢN TRỊ · ${escapeHtml(period.label)}</b>`),
        `📅 ${textCode(formatTelegramDate(period.from, lang))} → ${textCode(formatTelegramDate(period.to, lang))}`,
        report.telegramMeta?.isCurrent
            ? `<i>Tạm tính đến ${escapeHtml(formatTelegramDate(report.telegramMeta.asOf, lang))}; kỳ trước được so theo cùng số ngày.</i>`
            : '',
        `<blockquote>${statusIcon} <b>${escapeHtml(op.trangThai || 'CHƯA XÁC ĐỊNH')}</b>  ${moneyCode(net)}\nBiên lãi gộp ${textCode(percentText(grossMargin))} · Biên sau chi phí ${textCode(percentText(netMargin))}</blockquote>`,
        '',
        sectionTitle('💰', 'KẾT QUẢ KINH DOANH'),
        `🧾 Doanh thu hóa đơn: ${moneyCode(sales.doanhThuHoaDon)}`,
        `↩️ Trừ hoàn tiền: −${moneyCode(sales.tienHoan)}`,
        `💰 <b>Doanh thu thuần:</b> ${moneyCode(revenue)}`,
        `📦 Giá vốn thuần: −${moneyCode(cogs.giaVonThuan)}`,
        `📈 <b>Lãi gộp:</b> ${moneyCode(gross)}`,
        `🏭 Chi NCC + cước: −${moneyCode(op.chiPhiBenThu3)}`,
        `💼 Lương đã khóa: −${moneyCode(op.chiPhiNhanVien)}`,
        `${statusIcon} <b>= Lãi/lỗ sau chi phí:</b> ${moneyCode(net)}`,
        '',
        sectionTitle('📈', 'TỶ LỆ DỄ NHÌN'),
        `📦 Giá vốn  <code>${progressBar(cogsRate, 100, 8)}</code>`,
        `📈 Lãi gộp  <code>${progressBar(Math.max(0, grossMargin), 100, 8)}</code>`,
        `${netMargin < 0 ? '🔴 Mức lỗ ' : '🟢 Sau chi phí'} <code>${progressBar(Math.abs(netMargin), 100, 8)}</code>`,
        '',
        sectionTitle('🔄', `SO VỚI ${previousLabel.toLocaleUpperCase('vi-VN')}`),
        reportDeltaLine('Doanh thu thuần', revenue, previous.doanhThuThuan),
        reportDeltaLine('Lãi gộp', gross, previous.loiNhuanGop),
        reportDeltaLine('Lãi/lỗ sau chi phí', net, previous.laiLoSauChiPhi),
        reportDeltaLine('Số hóa đơn', invoiceCount, previousSales.soHoaDon, { money: false }),
        '',
        sectionTitle('🧾', 'BÁN HÀNG & ĐỔI TRẢ'),
        `Hóa đơn hoàn thành: ${textCode(String(invoiceCount))} · Bình quân: ${moneyCode(averageInvoice)}/HĐ`,
        `Đổi trả: ${textCode(String(reportNumber(sales.soPhieuDoiTra)))} phiếu · Hoàn ${moneyCode(sales.tienHoan)} (${textCode(percentText(returnRate))})`,
        '',
        sectionTitle('💳', 'TIỀN ĐÃ THU'),
        `💵 Tổng thu ghi nhận: ${moneyCode(cash.tongTienThu)}`,
        `💵 Tiền mặt: ${moneyCode(cash.tienMatPhieuThu)} · 📱 QR: ${moneyCode(cash.qr)}`,
        `💳 Thẻ: ${moneyCode(cash.the)} · 🏦 Chuyển khoản: ${moneyCode(cash.chuyenKhoan)}`
    ];
    if (topSuppliers.length) {
        lines.push('', sectionTitle('🏭', 'CHI NCC LỚN NHẤT'));
        topSuppliers.forEach((item, index) => lines.push(`${index + 1}. ${escapeHtml(item.TenNCC)} · ${moneyCode(item.SoTien)}`));
    }
    if (report.nguyenNhan?.length) {
        lines.push('', sectionTitle('🔎', 'ĐIỂM CẦN CHÚ Ý'));
        report.nguyenNhan.slice(0, 3).forEach(item => {
            lines.push(`• <b>${escapeHtml(item.tieuDe)}</b>`);
            if (item.soLieu) lines.push(`  ${escapeHtml(item.soLieu)}`);
        });
    }
    lines.push('', sectionTitle('ℹ️', 'CÁCH HIỂU SỐ'));
    lines.push('<i>Lãi gộp = doanh thu thuần − giá vốn thuần.</i>');
    lines.push('<i>Lãi/lỗ sau chi phí còn trừ khoản chi NCC, cước có chứng từ và lương đã khóa.</i>');
    if (notes.length) {
        lines.push('', sectionTitle('⚠️', 'DỮ LIỆU CHƯA TÍNH'));
        notes.forEach(note => lines.push(`• ${escapeHtml(note)}`));
    }
    return tidyLines(lines);
};

const managementReportKeyboard = ({ periodType, period, previous, next, canNext, current } = {}, lang = DEFAULT_LANG) => {
    const type = String(periodType || 'month');
    const rows = [[
        { text: '◀ Kỳ trước', callback_data: `period:${type}:${previous}` },
        { text: '🔄 Làm mới', callback_data: `period:${type}:${period}` }
    ]];
    if (canNext && next) rows[0].push({ text: 'Kỳ sau ▶', callback_data: `period:${type}:${next}` });
    rows.push([
        { text: t(lang, 'rptMonth'), callback_data: `period:month:${current.month}` },
        { text: t(lang, 'rptQuarter'), callback_data: `period:quarter:${current.quarter}` },
        { text: t(lang, 'rptYear'), callback_data: `period:year:${current.year}` }
    ]);
    rows.push([
        { text: '‹ Danh sách báo cáo', callback_data: 'cmd:reports' },
        { text: '🏠 Tổng quan', callback_data: 'cmd:fly' }
    ]);
    return { inline_keyboard: rows };
};

const removeKeyboardMarkup = () => ({ remove_keyboard: true }); // ReplyKeyboardRemove only — never ChatMenuButton

const showMenuInlineKeyboard = (lang = DEFAULT_LANG) => ({
    inline_keyboard: [[{ text: t(lang, 'kbShow'), callback_data: 'cmd:showkb' }]]
});

const replyKeyboard = (lang = DEFAULT_LANG, { bound = false } = {}) => {
    // 3 cột, Ẩn menu hàng đầu: Android cắt bàn phím cao 6–7 hàng nên mất Ẩn/Hiện.
    const rows = bound
        ? [
            ['kbHide', 'kbLang', 'kbFly'],
            ['kbDocs', 'kbPending', 'kbReports'],
            ['kbRevenue', 'kbDebt', 'kbShifts'],
            ['kbPayments', 'kbLowstock', 'kbGuide'],
            ...(isTelegramAskEnabled()
                ? [['kbAsk', 'kbHelp']]
                : [['kbHelp']])
        ]
        : [
            ['kbHide', 'kbLang'],
            ['kbHelp', 'kbLink']
        ];
    return {
        keyboard: rows.map(row => row.map(key => ({
            text: t(lang, key)
        }))),
        resize_keyboard: true,
        is_persistent: true,
        one_time_keyboard: false
    };
};

module.exports = {
    formatMoney,
    escapeHtml,
    liteMarkdownToHtml,
    stripTelegramLeftovers,
    moneyCode,
    textCode,
    progressBar,
    statusBadge,
    sectionTitle,
    channelIcon,
    headerBlock,
    kv,
    splitTelegramText,
    formatVnDateTime,
    formatTelegramDate,
    formatTelegramValue,
    prettyShiftName,
    looksLikeJsDateString,
    ATTENDANCE_NOTE_VI,
    ATTENDANCE_FLY_PATH,
    isAttendanceInbox,
    countAttendancePending,
    maskOtp,
    maskChatId,
    isManagerRole,
    telegramAudience,
    LANGS,
    DEFAULT_LANG,
    normalizeLang,
    t,
    otpFailMessage,
    langKeyboardRow,
    LANG_BUTTONS,
    DENY_VIEW,
    DENY_UNBOUND,
    DENY_STRANGER,
    DENY_NOT_MANAGER,
    DENY_NOT_MANAGER_CMD,
    DENY_GROUP,
    DENY_LOCKED,
    DENY_MUTED,
    DENY_WRITE,
    FLY_HINT,
    HELP_NO_WRITE_COMMANDS,
    FLY_MENU_TEXT,
    START_WELCOME_UNBOUND,
    START_WELCOME_GUEST,
    buildStartWelcomeUnbound,
    buildStartWelcomeBound,
    buildStartWelcomeGuest,
    START_LINK_GUIDE,
    HELP_LINES,
    isTelegramAskEnabled,
    buildHelpMessage,
    buildA1Message,
    buildA2Message,
    buildB12Message,
    buildA3Message,
    buildTodayMessage,
    buildRevenueMessage,
    buildFlyDashboard,
    buildDebtMessage,
    buildLowstockMessage,
    buildShiftsMessage,
    buildPaymentsMessage,
    matchPaymentsIntent,
    looksLikeTopicFollowUp,
    summarizePaymentShifts,
    buildPendingMessage,
    buildReportsMessage,
    buildReportsMessages,
    buildAlertsMessage,
    buildPayrollSummaryMessage,
    buildPayrollOneMessage,
    buildInboxPushMessage,
    buildAttendancePendingMessage,
    buildPushCard,
    buildSimplePush,
    hasForbiddenFinanceLabel,
    matchReplyCommand,
    normalizeReplyText,
    replyKeyboard,
    removeKeyboardMarkup,
    showMenuInlineKeyboard,
    reportsMenuKeyboard,
    buildReportsMenu,
    buildPnlOnlyMessage,
    buildManagementReportMessage,
    managementReportKeyboard,
    REPORT_MENU_ITEMS,
    REPLY_CMD_KEYS,
    RULE,
    RULE_TOP
};
