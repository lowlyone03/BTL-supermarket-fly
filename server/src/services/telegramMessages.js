const {
    formatVnDate, formatVnDateTime: formatClockDateTime, looksLikeJsDateString
} = require('./telegramClock');

const RULE = '────────────────────';
const RULE_TOP = '━━━━━━━━━━━━━━━━━━━━';

const formatMoney = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0đ';
    return `${Math.round(number).toLocaleString('vi-VN')}đ`;
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const moneyCode = value => `<code>${formatMoney(value)}</code>`;
const textCode = value => `<code>${escapeHtml(value)}</code>`;

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
        flyHint: 'Duyệt trên Telegram ghi nhật ký (NhatKy) giống bấm trên Fly.',
        helpNoWrite: 'Không /pay /complete. Duyệt PO/PX/KK/đổi trả/phiếu chi/công: nút trên tin chờ duyệt — ghi NhatKy như Fly.',
        flyMenu: 'Fly — dashboard cửa hàng (nút không có quyền đã ẩn).',
        unknownCmd: 'Gõ /help hoặc /fly. Bot không trả lời câu hỏi tự do.',
        storeBrand: 'SUPERMARKET FLY · Hà Nội',
        welcomeUnboundHi: 'Xin chào! 👋 Mình là companion của Quản lý trên Supermarket Fly.',
        welcomeUnboundAbout: 'Rất vui được gặp bạn. Bot của Quản lý: xem số liệu và duyệt việc chờ (ghi nhật ký như Fly). Chưa liên kết nên không có số liệu.',
        welcomeUnboundOtpTitle: 'Liên kết tài khoản (chỉ Quản lý)',
        welcomeUnboundOtp1: '1. Đăng nhập Fly → góc phải → Liên kết Telegram → Tạo mã.',
        welcomeUnboundOtp2: '2. Quay lại chat này, gửi /start kèm 6 số (cách một dấu cách).',
        welcomeUnboundOtp3: 'Mã hết hạn sau 5 phút; sai 5 lần thì tạo mã mới trên Fly. OTP vai trò khác QL sẽ bị từ chối.',
        welcomeUnbound: [
            'Xin chào! 👋 Mình là companion của Quản lý trên Supermarket Fly.',
            '',
            'Rất vui được gặp bạn. Bot của Quản lý: xem số liệu và duyệt việc chờ (ghi nhật ký như Fly).',
            '',
            'Chưa liên kết? Trên Fly: góc phải → Liên kết Telegram → Tạo mã, rồi gửi /start kèm 6 số.',
            'Ví dụ: /start 482913'
        ].join('\n'),
        welcomeBound: 'Chào Quản lý {name}! 🌟 Rất vui được gặp lại.',
        welcomeBoundHi: 'Chào Quản lý {name}! 🌟 Rất vui được gặp lại.',
        welcomeDashTitle: 'Cửa hàng hôm nay',
        welcomeDashRevenue: 'DT ngày',
        welcomeDashPending: 'Việc chờ',
        welcomeDashGap: 'Ca lệch',
        welcomeDashAttendance: 'Công chờ duyệt',
        welcomeBoundGuide: 'Nút dưới khung chat: việc chờ, doanh thu, ca… Hoặc gõ /fly để xem dashboard.',
        welcomeBoundNoApprove: 'Việc chờ: bấm ✅ Duyệt / ❌ Từ chối trên tin đó — đã ghi nhật ký. Không chi lương / không hoàn thành HĐ.',
        welcomeBoundLang: '🌐 Đổi nhãn: nút Ngôn ngữ (Tiếng Việt / English / 简体中文).',
        pendingAttendanceNote: 'Ca đã đóng — chờ duyệt công (UC32). Nút ✅ Duyệt ghi nhật ký như Fly → Duyệt công.',
        pendingAttendanceHint: '«Chờ duyệt» = NV đã hết ca. Duyệt trên Telegram hoặc Fly → Duyệt công (cả ngày cũ / ca hành chính).',
        attendanceFlyPath: 'Fly → Duyệt công',
        pushAttendanceTitle: 'CHẤM CÔNG CHỜ DUYỆT',
        welcomeGuest: [
            'Xin chào! 👋 Mình là bot nội bộ Supermarket Fly.',
            '',
            'Rất tiếc nhé — chỉ Quản lý đã liên kết mới xem được số liệu. Bot không trả dữ liệu cửa hàng cho chat này.'
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
        flyHelp: '❓ Help',
        flyDocs: '📄 Chứng từ',
        kbDocs: '📄 Chứng từ',
        kbLowstock: '🛍️ Sản phẩm / tồn thấp',
        kbPending: '⏳ Cần duyệt',
        kbReports: '📊 Báo cáo',
        kbRevenue: '💰 Doanh thu hôm nay',
        kbDebt: '🧾 Công nợ NCC',
        kbShifts: '🕐 Ca & quỹ',
        kbPayments: '💳 Thanh toán',
        kbAlerts: '🔔 Cảnh báo',
        kbFly: '📋 Tóm tắt /fly',
        kbLang: '🌐 Ngôn ngữ',
        kbHelp: '❓ Trợ giúp',
        kbLink: '🔗 Liên kết / Hướng dẫn OTP',
        btnApprove: '✅ Duyệt',
        btnReject: '❌ Từ chối',
        btnDetail: '📋 Chi tiết',
        btnDocs: '📄 Chứng từ',
        btnReports: '📊 Báo cáo',
        docsTitle: 'CHỨNG TỪ / GIẤY TỜ',
        docsIndexHint: 'Bấm 📄 trên việc chờ, hoặc /docs po:PO00001. Mỗi chứng từ một tin HTML, đủ dòng hàng như bản in Fly.',
        docsIndexFooter: 'PO: đơn + chuyến giao + phiếu nhập + HĐ mua (nếu có). PX / KK / đổi trả / phiếu chi / chấm công: phiếu đủ dòng. Đổi trả kèm hóa đơn gốc.',
        docsEmpty: 'Không có việc chờ. Gõ /docs PO00001 hoặc bấm 📄 trên tin chờ duyệt.',
        docsMissing: 'Không tìm thấy chứng từ này. Kiểm tra mã trên Fly.',
        docsUnknown: 'Không nhận mã chứng từ. Ví dụ: /docs po:PO00001',
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
        helpDocs: '/docs — Chứng từ / giấy tờ (đơn mua, phiếu nhập, HĐ, xuất, KK, đổi trả, phiếu chi, công)',
        helpReports: '/reports — Báo cáo cửa hàng (lãi gộp, P&L ghi chú, công nợ, ca, tồn) — QL',
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
        dashBrand: 'SUPERMARKET FLY',
        dashOps: 'Kết quả hôm nay',
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
        unknownCmd: 'Type /help or /fly. The bot does not answer free-form questions.',
        storeBrand: 'SUPERMARKET FLY · Hà Nội',
        welcomeUnboundHi: 'Hello! 👋 I am the Store Manager companion on Supermarket Fly.',
        welcomeUnboundAbout: 'Glad you are here. Manager companion: read figures and approve pending work (same audit log as Fly). No figures until you link.',
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
        welcomeBound: 'Hello Store Manager {name}! 🌟 Welcome back.',
        welcomeBoundHi: 'Hello Store Manager {name}! 🌟 Welcome back.',
        welcomeDashTitle: 'Store today',
        welcomeDashRevenue: 'Today revenue',
        welcomeDashPending: 'Pending work',
        welcomeDashGap: 'Shift variance',
        welcomeDashAttendance: 'Attendance awaiting approval',
        welcomeBoundGuide: 'Buttons below the chat: pending, revenue, shifts… Or type /fly for the dashboard.',
        welcomeBoundNoApprove: 'Pending work: tap ✅ Approve / ❌ Reject on that card — audit is written. No payroll payout / no invoice complete.',
        welcomeBoundLang: '🌐 Labels: Language button (Tiếng Việt / English / 简体中文).',
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
        flyToday: '📊 Hôm nay',
        flyRevenue: '💰 Doanh thu',
        flyDebt: '🧾 Công nợ',
        flyLowstock: '📦 Low stock',
        flyPending: '⏳ Việc chờ',
        flyReports: '📊 Báo cáo',
        flyShifts: '🕐 Ca',
        flyPayments: '💳 Thanh toán',
        flyAlerts: '🔔 Cảnh báo',
        flyLang: '🌐 Ngôn ngữ',
        flyHelp: '❓ Help',
        flyDocs: '📄 Documents',
        kbDocs: '📄 Documents',
        kbLowstock: '🛍️ Products / low stock',
        kbPending: '⏳ Cần duyệt',
        kbReports: '📊 Báo cáo',
        kbRevenue: '💰 Today revenue',
        kbDebt: '🧾 Supplier AP',
        kbShifts: '🕐 Shifts & cash',
        kbPayments: '💳 Payments',
        kbAlerts: '🔔 Alerts',
        kbFly: '📋 Summary /fly',
        kbLang: '🌐 Language',
        kbHelp: '❓ Help',
        kbLink: '🔗 Link / OTP guide',
        btnApprove: '✅ Duyệt',
        btnReject: '❌ Từ chối',
        btnDetail: '📋 Chi tiết',
        btnDocs: '📄 Documents',
        btnReports: '📊 Báo cáo',
        docsTitle: 'DOCUMENTS / PAPERS',
        docsIndexHint: 'Tap 📄 on a pending item, or /docs po:PO00001. Each paper is its own HTML message with full line items.',
        docsIndexFooter: 'PO: order + shipment + receipt + purchase invoice (if any). Issue / count / return / payout / attendance: full slip. Returns include the original sales invoice.',
        docsEmpty: 'Nothing pending. Type /docs PO00001 or tap 📄 on a pending card.',
        docsMissing: 'Document not found. Check the code in Fly.',
        docsUnknown: 'Unrecognized document id. Example: /docs po:PO00001',
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
        helpDocs: '/docs — Papers / documents (PO, receipt, invoice, issue, count, return, payout, attendance)',
        helpReports: '/reports — Store report (gross profit, P&L note, AP, shifts, stock) — Manager',
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
        dashBrand: 'SUPERMARKET FLY',
        dashOps: 'Today’s result',
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
        unknownCmd: '请输入 /help 或 /fly。机器人不回答自由提问。',
        storeBrand: 'SUPERMARKET FLY · Hà Nội',
        welcomeUnboundHi: '您好！👋 我是 Supermarket Fly 的店长助手。',
        welcomeUnboundAbout: '很高兴见到您。店长助手：可查看数据并审批待办（与 Fly 同一本日志）。尚未关联，因此没有数据。',
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
        welcomeBound: '店长 {name}，您好！🌟 欢迎回来。',
        welcomeBoundHi: '店长 {name}，您好！🌟 欢迎回来。',
        welcomeDashTitle: '今日门店',
        welcomeDashRevenue: '今日销售',
        welcomeDashPending: '待办',
        welcomeDashGap: '班次长短款',
        welcomeDashAttendance: '待审批考勤',
        welcomeBoundGuide: '聊天框下方按钮：待办、销售、班次… 或输入 /fly 查看看板。',
        welcomeBoundNoApprove: '待办：在该卡片上点 ✅ 审批 / ❌ 拒绝 — 会写日志。不发工资、不完成销售单。',
        welcomeBoundLang: '🌐 标签语言：语言按钮（Tiếng Việt / English / 简体中文）。',
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
        flyToday: '📊 Hôm nay',
        flyRevenue: '💰 Doanh thu',
        flyDebt: '🧾 Công nợ',
        flyLowstock: '📦 低库存',
        flyPending: '⏳ Việc chờ',
        flyReports: '📊 Báo cáo',
        flyShifts: '🕐 Ca',
        flyPayments: '💳 Thanh toán',
        flyAlerts: '🔔 Cảnh báo',
        flyLang: '🌐 Ngôn ngữ',
        flyHelp: '❓ Help',
        flyDocs: '📄 单据',
        kbDocs: '📄 单据',
        kbLowstock: '🛍️ 商品 / 低库存',
        kbPending: '⏳ Cần duyệt',
        kbReports: '📊 Báo cáo',
        kbRevenue: '💰 今日销售',
        kbDebt: '🧾 供应商应付',
        kbShifts: '🕐 班次与钱箱',
        kbPayments: '💳 支付',
        kbAlerts: '🔔 提醒',
        kbFly: '📋 摘要 /fly',
        kbLang: '🌐 语言',
        kbHelp: '❓ 帮助',
        kbLink: '🔗 关联 / OTP 说明',
        btnApprove: '✅ Duyệt',
        btnReject: '❌ Từ chối',
        btnDetail: '📋 Chi tiết',
        btnDocs: '📄 单据',
        btnReports: '📊 Báo cáo',
        docsTitle: '单据 / 证件',
        docsIndexHint: '在待办上点 📄，或 /docs po:PO00001。每份单据单独一条 HTML，含完整行项目。',
        docsIndexFooter: '采购单：订单 + 送货 + 入库 + 进项发票（如有）。出库 / 盘点 / 退换 / 付款 / 考勤：完整单据。退换附原销售单。',
        docsEmpty: '没有待办。输入 /docs PO00001 或在待办卡片上点 📄。',
        docsMissing: '找不到该单据。请在 Fly 核对编号。',
        docsUnknown: '无法识别单据编号。例如：/docs po:PO00001',
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
        helpDocs: '/docs — 单据 / 证件（采购、入库、发票、出库、盘点、退换、付款、考勤）',
        helpReports: '/reports — 门店报表（毛利、P&L 备注、应付、班次、库存）— 店长',
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
        dashBrand: 'SUPERMARKET FLY',
        dashOps: '今日结果',
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

const headerBlock = (title) => [RULE_TOP, title, RULE].join('\n');

const hintLine = (lang) => `<i>${escapeHtml(t(lang, 'flyHint'))}</i>`;

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
        `<i>${escapeHtml(t(lang, 'welcomeBoundNoApprove'))}</i>`,
        escapeHtml(t(lang, 'welcomeBoundLang'))
    ].filter(line => line !== '').join('\n');
};

const buildStartWelcomeBound = (user, lang = DEFAULT_LANG, dash = {}) => {
    const fallback = normalizeLang(lang) === 'en' ? 'Manager' : 'Quản lý';
    const name = escapeHtml(String(user?.TenNV || '').trim() || fallback);
    const summary = dash.summary || {};
    const inbox = dash.inbox || [];
    const none = t(lang, 'todayNone');
    const lech = (summary.caLech || []).slice(0, 5).join(', ') || none;
    const attendance = countAttendancePending(inbox);
    return [
        headerBlock(`🏪 <b>${escapeHtml(t(lang, 'storeBrand'))}</b>`),
        t(lang, 'welcomeBoundHi', { name: `<b>${name}</b>` }),
        '',
        `<b>${escapeHtml(t(lang, 'welcomeDashTitle'))}</b>`,
        `💰 ${escapeHtml(t(lang, 'welcomeDashRevenue'))}: ${moneyCode(summary.DoanhThuThuan ?? summary.DoanhThuHoaDon)}`,
        `⏳ ${escapeHtml(t(lang, 'welcomeDashPending'))}: ${textCode(String(inbox.length))}`,
        `🕐 ${escapeHtml(t(lang, 'welcomeDashGap'))}: ${textCode(lech)}`,
        `📋 ${escapeHtml(t(lang, 'welcomeDashAttendance'))}: ${textCode(String(attendance))}`,
        '',
        escapeHtml(t(lang, 'welcomeBoundGuide')),
        `<i>${escapeHtml(t(lang, 'welcomeBoundNoApprove'))}</i>`,
        escapeHtml(t(lang, 'welcomeBoundLang'))
    ].join('\n');
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
    { key: 'helpPayroll', uc: ['UC10'] },
    { key: 'helpPayrollNv', uc: ['UC33'] },
    { key: 'helpUnlink' }
];

const HELP_LINES = HELP_LINE_KEYS.map(item => ({
    text: I18N.vi[item.key],
    uc: item.uc
}));

const buildHelpMessage = (hasCommand, lang = DEFAULT_LANG) => {
    const allowed = typeof hasCommand === 'function' ? hasCommand : () => true;
    const lines = [
        headerBlock(`❓ <b>${escapeHtml(t(lang, 'helpHeader'))}</b>`),
        `<i>${escapeHtml(t(lang, 'helpIntro'))}</i>`,
        ''
    ];
    for (const item of HELP_LINE_KEYS) {
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
            kv('Chênh lệch', `<code>${sign}${formatMoney(lech)}</code>`),
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
    const day = summary.operatingDay;
    const sent = sentAt ? formatVnDate(sentAt) : '';
    const lech = (summary.caLech || []).join(', ') || 'Không';
    return [
        headerBlock(`🏪 <b>SUPERMARKET FLY — Ngày vận hành ${formatVnDate(day)}</b>`),
        sent ? `<i>(gửi ${sent} ~06:10, sau ca đêm 22:00–06:00)</i>` : '<i>(sau ca đêm 22:00–06:00)</i>',
        '<b>TÓM TẮT HOẠT ĐỘNG</b>',
        '',
        `Doanh thu (HĐ hoàn thành): ${moneyCode(summary.DoanhThuThuan ?? summary.DoanhThuHoaDon)}`,
        `Giá vốn: ${moneyCode(summary.GiaVonHangBanThuan ?? summary.GiaVon)}`,
        `Lãi gộp: ${moneyCode(summary.LoiNhuanGop)}`,
        `Tiền mặt / QR / Thẻ / Chuyển khoản: ${moneyCode(summary.TienMat)} / ${moneyCode(summary.TienQR)} / ${moneyCode(summary.TienThe)} / ${moneyCode(summary.TienCK)}`,
        '',
        `Công nợ đến hạn: ${textCode(String(summary.congNoDenHan ?? 0))} khoản`,
        `GD chưa đối soát / chờ xác nhận: ${textCode(String(summary.choXacNhan ?? 0))}`,
        `SP cần bổ sung: ${textCode(String(summary.spCanBoSung ?? 0))}`,
        `Ca lệch quỹ: ${textCode(lech)}`,
        summary.caDangMo ? `Ca đang mở: ${textCode(String(summary.caDangMo))}` : '',
        '',
        '<i>Không trừ tiền trả NCC vào lãi gộp.</i>'
    ].filter(Boolean).join('\n');
};

const moneyBlock = (summary, lang) => [
    `${t(lang, 'todayRevenue')}: ${moneyCode(summary.DoanhThuThuan ?? summary.DoanhThuHoaDon)}`,
    `${t(lang, 'todayCogs')}: ${moneyCode(summary.GiaVonHangBanThuan ?? summary.GiaVon)}`,
    `${t(lang, 'todayGross')}: ${moneyCode(summary.LoiNhuanGop)}`
];

const channelBlock = (summary, lang) => [
    `💵 ${t(lang, 'todayCash')}: ${moneyCode(summary.TienMat)}`,
    `📱 ${t(lang, 'todayQr')}: ${moneyCode(summary.TienQR)}`,
    `💳 ${t(lang, 'todayCard')}: ${moneyCode(summary.TienThe)}`,
    `🏦 ${t(lang, 'todayTransfer')}: ${moneyCode(summary.TienCK)}`
];

const alertBlock = (summary, lang) => {
    const none = t(lang, 'todayNone');
    return [
        `<b>${escapeHtml(t(lang, 'todayAlerts'))}</b>`,
        `• ${t(lang, 'todayDebtDue')}: ${textCode(String(summary.congNoDenHan ?? 0))} ${t(lang, 'todayKhoan')}`,
        `• ${t(lang, 'todayPayPending')}: ${textCode(String(summary.choXacNhan ?? 0))}`,
        `• ${t(lang, 'todayRestock')}: ${textCode(String(summary.spCanBoSung ?? 0))}`,
        `• ${t(lang, 'todayShiftGap')}: ${textCode((summary.caLech || []).join(', ') || none)}`,
        summary.caDangMo != null ? `• ${t(lang, 'todayOpenShift')}: ${textCode(String(summary.caDangMo))}` : ''
    ].filter(Boolean);
};

const detailLines = (rows, mapFn, empty) => {
    if (!rows?.length) return empty ? [empty] : [];
    return rows.map(mapFn);
};

const buildTodayMessage = (summary, lang = DEFAULT_LANG) => {
    const lines = [
        headerBlock(`📊 <b>${escapeHtml(t(lang, 'todayTitle'))}</b>`),
        `<i>${escapeHtml(t(lang, 'todayDay', { day: formatVnDate(summary.operatingDay) }))}</i>`,
        '',
        ...moneyBlock(summary, lang),
        summary.SoHoaDon != null ? `${t(lang, 'todayInvoices')}: ${textCode(String(summary.SoHoaDon))}` : '',
        '',
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
    return lines.filter(line => line !== '').join('\n');
};

const buildRevenueMessage = (summary, lang = DEFAULT_LANG) => [
    headerBlock(`💰 <b>${escapeHtml(t(lang, 'revenueTitle'))}</b>`),
    `<i>${escapeHtml(t(lang, 'todayDay', { day: formatVnDate(summary.operatingDay) }))}</i>`,
    '',
    ...moneyBlock(summary, lang),
    summary.SoHoaDon != null ? `${t(lang, 'todayInvoices')}: ${textCode(String(summary.SoHoaDon))}` : '',
    '',
    `<b>${escapeHtml(t(lang, 'dashPay'))}</b>`,
    ...channelBlock(summary, lang),
    summary.invoices?.length ? '' : '',
    ...(summary.invoices?.length ? [
        `<b>${escapeHtml(t(lang, 'todayTopHd'))}</b>`,
        ...summary.invoices.slice(0, 8).map(row => `• ${textCode(row.MaHD)} · ${moneyCode(row.TongThanhToan)}`)
    ] : [])
].filter(line => line !== '').join('\n');

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
    const none = t(lang, 'todayNone');
    const lech = (summary.caLech || []).slice(0, 5).join(', ') || none;
    const latest = inbox.slice(0, 5);
    return [
        headerBlock(`🏪 <b>${escapeHtml(t(lang, 'dashBrand'))}</b>`),
        `<i>${escapeHtml(t(lang, 'todayDay', { day: formatVnDate(summary.operatingDay) }))}</i>`,
        '',
        `<b>${escapeHtml(t(lang, 'dashOps'))}</b>`,
        ...moneyBlock(summary, lang),
        summary.SoHoaDon != null ? `${t(lang, 'todayInvoices')}: ${textCode(String(summary.SoHoaDon))}` : '',
        '',
        `<b>${escapeHtml(t(lang, 'dashPay'))}</b>`,
        ...channelBlock(summary, lang),
        '',
        `<b>${escapeHtml(t(lang, 'dashWatch'))}</b>`,
        `⏳ ${t(lang, 'dashPending')}: ${textCode(String(inbox.length))}`,
        `🧾 ${t(lang, 'dashDebtDue')}: ${textCode(String(summary.congNoDenHan ?? 0))}`,
        `🕐 ${t(lang, 'dashOpenShift')}: ${textCode(String(summary.caDangMo ?? 0))} · ${t(lang, 'dashGapShift')}: ${textCode(lech)}`,
        `📦 ${t(lang, 'dashRestock')}: ${textCode(String(summary.spCanBoSung ?? 0))}`,
        '',
        `<b>🔔 ${escapeHtml(t(lang, 'dashInbox'))}</b>`,
        ...(latest.length ? latest.map(item => inboxLine(item, lang)) : [`<i>${escapeHtml(t(lang, 'dashInboxEmpty'))}</i>`]),
        latest.some(isAttendanceInbox) ? `<i>${escapeHtml(t(lang, 'attendanceFlyPath'))}</i>` : '',
        '',
        hintLine(lang)
    ].filter(line => line !== '').join('\n');
};

const buildDebtMessage = ({ summary = {}, rows = [] } = {}, lang = DEFAULT_LANG) => {
    const lines = [
        headerBlock(`🧾 <b>${escapeHtml(t(lang, 'debtTitle'))}</b>`),
        `${t(lang, 'debtCount')}: ${textCode(String(summary.TongKhoan || 0))}`,
        `${t(lang, 'debtRemain')}: ${moneyCode(summary.TongConLai)}`,
        `${t(lang, 'debtSoon')}: ${textCode(String(summary.SapHan || 0))}`,
        `${t(lang, 'debtOverdue')}: ${textCode(String(summary.QuaHan || 0))}`,
        '',
        `<b>${escapeHtml(t(lang, 'debtTop'))}</b>`
    ];
    if (!rows.length) lines.push(t(lang, 'debtEmpty'));
    for (const row of rows.slice(0, 8)) {
        lines.push(`• ${textCode(row.MaCNPTra)} · ${escapeHtml(row.TenNCC)} · ${moneyCode(row.SoTienConLai)} · ${t(lang, 'debtDue')} ${textCode(formatTelegramDate(row.HanThanhToan, lang))}`);
    }
    return lines.join('\n');
};

const buildLowstockMessage = (rows, lang = DEFAULT_LANG) => {
    if (!rows?.length) return t(lang, 'lowstockEmpty');
    return [
        headerBlock(`📦 <b>${escapeHtml(t(lang, 'lowstockTitle'))}</b>`),
        `<i>${escapeHtml(t(lang, 'lowstockHead'))}</i>`,
        ...rows.slice(0, 8).map(row =>
            `• ${escapeHtml(row.TenSP)}: ${textCode(`${row.SLTon}/${row.TonKhoToiThieu}`)}`)
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
        lines.push(`• ${textCode(row.MaCa)} · ${escapeHtml(row.TenNV)} · ${escapeHtml(row.TrangThai)}${quay}${gap}${recon}`);
    }
    return lines.join('\n');
};

const buildPaymentsMessage = ({ day, channels = [], recent = [] } = {}, lang = DEFAULT_LANG) => {
    const lines = [
        headerBlock(`💳 <b>${escapeHtml(t(lang, 'payTitle'))}</b>`),
        `<i>${escapeHtml(t(lang, 'payDay', { day: formatVnDate(day) }))}</i>`
    ];
    if (!channels.length) lines.push(t(lang, 'payEmpty'));
    for (const row of channels) {
        lines.push(`• ${escapeHtml(row.PhuongThuc)}: ${textCode(String(row.SoLuong))} GD · ${moneyCode(row.Tong)} · ${t(lang, 'payPending')} ${textCode(String(row.ChoXacNhan))}`);
    }
    if (recent.length) {
        lines.push('', `<b>${escapeHtml(t(lang, 'payRecent'))}</b>`);
        for (const row of recent.slice(0, 8)) {
            lines.push(`• ${escapeHtml(row.PhuongThuc)} · ${moneyCode(row.SoTien)} · ${escapeHtml(formatVnDateTime(row.NgayTT, lang))}`);
        }
    }
    return lines.join('\n');
};

const buildPendingMessage = (items, lang = DEFAULT_LANG) => {
    if (!items?.length) return t(lang, 'pendingEmpty');
    const rows = items.slice(0, 8);
    const hasAttendance = rows.some(isAttendanceInbox);
    return [
        headerBlock(`⏳ <b>${escapeHtml(t(lang, 'pendingTitle'))}</b>`),
        ...rows.map(item => inboxLine(item, lang)),
        hasAttendance ? '' : '',
        hasAttendance ? `<i>${escapeHtml(ATTENDANCE_NOTE_VI)}</i>` : '',
        hasAttendance ? `<i>${escapeHtml(t(lang, 'pendingAttendanceHint'))}</i>` : '',
        '',
        hintLine(lang)
    ].filter(line => line !== '').join('\n');
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
    `${t(lang, 'payrollStaff')}: ${textCode(String(summary.SoNV || 0))}`,
    `${t(lang, 'payrollTotal')}: ${moneyCode(summary.Tong)}`,
    `${t(lang, 'payrollPaid')}: ${textCode(String(summary.DaChi || 0))}`,
    `${t(lang, 'payrollUnpaid')}: ${textCode(String(summary.ChuaChi || 0))}`
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
            ? `<code>${escapeHtml(String(value))}</code>`
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
    { key: 'kbFly', name: 'fly' },
    { key: 'kbLang', name: 'langmenu' },
    { key: 'kbHelp', name: 'help' },
    { key: 'kbLink', name: 'linkguide' }
];

const REPLY_FALLBACK = [
    { name: 'docs', re: /^📄|chứng từ|giấy tờ|documents$|单据/i },
    { name: 'lowstock', re: /^🛍️|sản phẩm\s*\/\s*tồn|low stock|商品\s*\/\s*低库存/i },
    { name: 'pending', re: /^⏳|cần duyệt|việc chờ duyệt|pending approval|待审批/i },
    { name: 'reports', re: /^📊\s*báo cáo|^📊\s*reports|门店报表/i },
    { name: 'revenue', re: /^💰|doanh thu hôm nay|today revenue|今日销售/i },
    { name: 'debt', re: /^🧾|công nợ ncc|supplier ap|供应商应付/i },
    { name: 'shifts', re: /^🕐|ca\s*&\s*quỹ|shifts\s*&\s*cash|班次与钱箱/i },
    { name: 'payments', re: /^💳|thanh toán$|payments$|支付$/i },
    { name: 'alerts', re: /^🔔|cảnh báo$|alerts$|提醒$/i },
    { name: 'fly', re: /^📋|tóm tắt\s*\/fly|summary\s*\/fly|摘要\s*\/fly/i },
    { name: 'langmenu', re: /^🌐|ngôn ngữ$|language$|语言$/i },
    { name: 'help', re: /^❓|trợ giúp$|\/help|帮助$/i },
    { name: 'linkguide', re: /^🔗|hướng dẫn otp|otp guide|otp 说明/i }
];

const FORBIDDEN_REPLY = /game|voucher|vietqr|nạp\s|nap tien|mở shop|mo shop|complete[\s_]?invoice/i;

const matchReplyCommand = (text) => {
    const raw = String(text || '').replace(/\u00a0/g, ' ').trim();
    if (!raw || FORBIDDEN_REPLY.test(raw)) return null;
    for (const lang of LANGS) {
        for (const item of REPLY_CMD_KEYS) {
            if (raw === t(lang, item.key)) return { name: item.name, via: 'reply' };
        }
    }
    for (const item of REPLY_FALLBACK) {
        if (item.re.test(raw)) return { name: item.name, via: 'reply' };
    }
    return null;
};

const replyKeyboard = (lang = DEFAULT_LANG, { bound = false } = {}) => {
    const rows = bound
        ? [
            ['kbDocs', 'kbPending'],
            ['kbReports', 'kbRevenue'],
            ['kbDebt', 'kbShifts'],
            ['kbPayments', 'kbLowstock'],
            ['kbFly', 'kbLang'],
            ['kbHelp', 'kbAlerts']
        ]
        : [
            ['kbLang', 'kbHelp'],
            ['kbLink']
        ];
    return {
        keyboard: rows.map(row => row.map(key => ({ text: t(lang, key) }))),
        resize_keyboard: true,
        is_persistent: true
    };
};

module.exports = {
    formatMoney,
    escapeHtml,
    moneyCode,
    textCode,
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
    replyKeyboard,
    REPLY_CMD_KEYS,
    RULE,
    RULE_TOP
};
