const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    operatingDayOf, operatingDayForReport, isOperatingReportWindow,
    isNightShiftStartHour, isWithinRateLimit, formatVnDate, formatVnDateTime,
    looksLikeJsDateString
} = require('./src/services/telegramClock');
const {
    buildTodayMessage, buildA1Message, buildA3Message, hasForbiddenFinanceLabel,
    buildFlyDashboard, escapeHtml, buildInboxPushMessage, buildAttendancePendingMessage,
    buildPendingMessage, ATTENDANCE_NOTE_VI, prettyShiftName,
    buildReportsMessage, buildReportsMessages, splitTelegramText,
    DENY_GROUP, DENY_VIEW, DENY_STRANGER, DENY_NOT_MANAGER, DENY_NOT_MANAGER_CMD,
    maskOtp, maskChatId, isManagerRole, t
} = require('./src/services/telegramMessages');
const teleDecision = require('./src/services/telegramApprove');
const teleDocs = require('./src/services/telegramDocuments');
const notify = require('./src/services/telegramNotify');
const bot = require('./src/controllers/telegramBotController');

const test = (name, run) => {
    try {
        const result = run();
        if (result && typeof result.then === 'function') {
            return result.then(() => console.log(`✓ ${name}`)).catch(error => {
                console.error(`✗ ${name}`);
                throw error;
            });
        }
        console.log(`✓ ${name}`);
        return Promise.resolve();
    } catch (error) {
        console.error(`✗ ${name}`);
        return Promise.reject(error);
    }
};

const at = iso => new Date(iso);

const fakeSql = new Proxy({}, {
    get: () => {
        const type = (..._args) => type;
        return type;
    }
});

process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'ci-mock-token';
process.env.TELEGRAM_BOT_USERNAME = 'supermarket_flybot';
process.env.TELEGRAM_WEBHOOK_URL = '';

(async () => {
    await test('OTP sai không bind', () => {
        const row = { MaNV: 'NV001', MaOTP: '482913', SoLanSai: 0, HetHanOTP: new Date(Date.now() + 60000) };
        const verdict = bot.evaluateOtpAttempt({ row, otp: '000000', now: new Date() });
        assert.equal(verdict.ok, false);
        assert.equal(verdict.code, 'wrong');
        assert.equal(verdict.increment, true);
    });

    await test('OTP hết hạn không bind', () => {
        const row = { MaNV: 'NV001', MaOTP: '482913', SoLanSai: 0, HetHanOTP: new Date(Date.now() - 1000) };
        const verdict = bot.evaluateOtpAttempt({ row, otp: '482913', now: new Date() });
        assert.equal(verdict.ok, false);
        assert.equal(verdict.code, 'expired');
    });

    await test('OTP sai 5 lần thì khóa', () => {
        const row = { MaNV: 'NV001', MaOTP: '482913', SoLanSai: 4, HetHanOTP: new Date(Date.now() + 60000) };
        const verdict = bot.evaluateOtpAttempt({ row, otp: '111111', now: new Date() });
        assert.equal(verdict.ok, false);
        assert.equal(verdict.code, 'locked');
        assert.equal(verdict.clear, true);
    });

    await test('ChatId trùng NV khác → 409', () => {
        const row = { MaNV: 'NV001', MaOTP: '482913', SoLanSai: 0, HetHanOTP: new Date(Date.now() + 60000), TenVaiTro: 'Quản lý' };
        const verdict = bot.evaluateBind({
            row, otp: '482913', now: new Date(), chatId: '99',
            occupant: { MaNV: 'NV002', ChatId: '99' }
        });
        assert.equal(verdict.ok, false);
        assert.equal(verdict.http, 409);
    });

    await test('OTP đúng thì bind', () => {
        const row = { MaNV: 'NV001', MaOTP: '482913', SoLanSai: 0, HetHanOTP: new Date(Date.now() + 60000), TenVaiTro: 'Quản lý' };
        const verdict = bot.evaluateBind({ row, otp: '482913', now: new Date(), chatId: '100' });
        assert.equal(verdict.ok, true);
    });

    await test('OTP đúng sau TRIM CHAR pad phải bind', () => {
        const row = {
            MaNV: 'NV001', MaOTP: '628817 ', SoLanSai: 0,
            HetHanOTP: new Date(Date.now() + 60000), TenVaiTro: 'Quản lý'
        };
        const padded = bot.evaluateBind({ row, otp: '628817', now: new Date(), chatId: '100' });
        assert.equal(padded.ok, true);
        const asNumber = bot.evaluateBind({
            row: { ...row, MaOTP: '628817' }, otp: 628817, now: new Date(), chatId: '100'
        });
        assert.equal(asNumber.ok, true);
        assert.equal(bot.normalizeOtp('628817\0'), '628817');
        assert.equal(bot.normalizeOtp(' 628817 '), '628817');
    });

    await test('TN/MH OTP bị từ chối; QL bind OK', () => {
        const otpRow = { MaOTP: '482913', SoLanSai: 0, HetHanOTP: new Date(Date.now() + 60000) };
        assert.equal(bot.evaluateBind({
            row: { ...otpRow, MaNV: 'NV008', TenVaiTro: 'Thu ngân' },
            otp: '482913', now: new Date(), chatId: '8'
        }).code, 'not_manager');
        assert.equal(bot.evaluateBind({
            row: { ...otpRow, MaNV: 'NV003', TenVaiTro: 'Nhân viên mua hàng' },
            otp: '482913', now: new Date(), chatId: '3'
        }).message, DENY_NOT_MANAGER);
        const ql = bot.evaluateBind({
            row: { ...otpRow, MaNV: 'NV001', TenVaiTro: 'Quản lý' },
            otp: '482913', now: new Date(), chatId: '1'
        });
        assert.equal(ql.ok, true);
        assert.equal(isManagerRole('Quản lý'), true);
        assert.equal(isManagerRole('Thu ngân'), false);
    });

    await test('Che OTP trên nhật ký', () => {
        assert.equal(maskOtp('482913'), '482***');
        assert.match(maskChatId('123456789'), /\*{4}/);
    });

    await test('TN không /debt; QL không /payroll chi tiết NV', () => {
        assert.equal(bot.userHasCommand({ TenVaiTro: 'Thu ngân' }, ['UC10', 'UC28']), false);
        assert.equal(bot.userHasCommand({ TenVaiTro: 'Quản lý' }, ['UC33']), false);
        assert.equal(bot.userHasCommand({ TenVaiTro: 'Kế toán' }, ['UC33']), true);
        assert.equal(bot.userHasCommand({ TenVaiTro: 'Quản lý' }, ['UC10']), true);
        assert.equal(bot.userHasCommand({ TenVaiTro: 'Thủ kho' }, ['UC15']), true);
    });

    await test('Menu /fly ẩn nút không UC', () => {
        const ql = bot.flyKeyboard({ TenVaiTro: 'Quản lý' }).inline_keyboard.flat().map(btn => btn.text);
        assert.ok(ql.includes('📊 Hôm nay'));
        assert.ok(ql.includes('💰 Doanh thu'));
        assert.ok(ql.includes('🧾 Công nợ'));
        assert.ok(ql.includes('📄 Chứng từ'));
        assert.ok(ql.includes('⏳ Việc chờ'));
        assert.ok(ql.includes('📊 Báo cáo'));
        assert.ok(ql.includes('🕐 Ca'));
        assert.ok(ql.includes('💳 Thanh toán'));
        assert.ok(ql.includes('🔔 Cảnh báo'));
        assert.ok(ql.includes('🌐 Ngôn ngữ'));
        assert.ok(ql.includes('❓ Help'));
        assert.ok(!ql.some(text => /Lowstock|Tồn thấp/.test(text)));
        assert.ok(!ql.some(text => /Từ chối|approve/i.test(text)));
        const tn = bot.flyKeyboard({ TenVaiTro: 'Thu ngân' }).inline_keyboard.flat().map(btn => btn.text);
        assert.ok(!tn.some(text => /📊 Hôm nay|💰 Doanh thu/.test(text)));
        assert.ok(!tn.some(text => /🧾 Công nợ/.test(text)));
        assert.ok(tn.some(text => /🕐 Ca/.test(text)));
        assert.ok(tn.some(text => /⏳ Việc chờ/.test(text)));
    });

    await test('/help: lệnh English + chú thích Việt, lọc UC, không có duyệt', () => {
        const ql = bot.cmdHelp({ TenVaiTro: 'Quản lý' });
        assert.match(ql, /\/start 482913 — Bắt đầu/);
        assert.match(ql, /\/bind 482913 — Gắn tài khoản/);
        assert.match(ql, /\/today — Tóm tắt hoạt động hôm nay/);
        assert.match(ql, /\/payroll — Lương tóm tắt kỳ/);
        assert.match(ql, /Không \/pay \/complete/);
        assert.match(ql, /\/reports — Báo cáo cửa hàng/);
        assert.match(ql, /\/docs — Chứng từ/);
        assert.doesNotMatch(ql, /\/lowstock/);
        assert.doesNotMatch(ql, /\/payroll NV008/);
        assert.doesNotMatch(ql, /^\/approve /m);
        const kt = bot.cmdHelp({ TenVaiTro: 'Kế toán' });
        assert.match(kt, /\/debt — Công nợ NCC/);
        assert.match(kt, /\/payroll NV008 — Lương 1 người/);
        assert.doesNotMatch(kt, /\/today —/);
        const tk = bot.cmdHelp({ TenVaiTro: 'Thủ kho' });
        assert.match(tk, /\/lowstock — Tồn thấp/);
        assert.doesNotMatch(tk, /\/debt —/);
        const tn = bot.cmdHelp({ TenVaiTro: 'Thu ngân' });
        assert.match(tn, /\/shifts — Ca làm/);
        assert.match(tn, /\/payments — Thanh toán TM\/QR/);
        assert.doesNotMatch(tn, /\/today —/);
        assert.doesNotMatch(tn, /\/debt —/);
    });

    await test('Reply keyboard 2 cột persistent, đổi nhãn 3 ngôn ngữ, không game/nạp', () => {
        const vi = bot.replyKeyboard('vi', { bound: true });
        assert.equal(vi.resize_keyboard, true);
        assert.equal(vi.is_persistent, true);
        assert.equal(vi.keyboard.length, 6);
        assert.ok(vi.keyboard.every(row => row.length === 2));
        const viText = vi.keyboard.flat().map(btn => btn.text);
        assert.deepEqual(viText.slice(0, 4), [
            '📄 Chứng từ', '⏳ Cần duyệt',
            '📊 Báo cáo', '💰 Doanh thu hôm nay'
        ]);
        assert.ok(!viText.some(text => /Game|Voucher|VietQR|Nạp|Mở shop|approve/i.test(text)));
        const guest = bot.replyKeyboard('vi', { bound: false });
        assert.equal(guest.keyboard[1].length, 1);
        assert.match(guest.keyboard[1][0].text, /🔗 Liên kết/);
        const en = bot.replyKeyboard('en', { bound: true }).keyboard.flat().map(btn => btn.text);
        assert.ok(en.includes('💰 Today revenue'));
        assert.ok(en.includes('📋 Summary /fly'));
        const zh = bot.replyKeyboard('zh', { bound: true }).keyboard.flat().map(btn => btn.text);
        assert.ok(zh.includes('🛍️ 商品 / 低库存'));
        assert.ok(zh.includes('📋 摘要 /fly'));
        assert.equal(bot.matchReplyCommand('Game'), null);
        assert.equal(bot.matchReplyCommand('Nạp VietQR'), null);
    });

    await test('Không export hàm approve / pay / complete', () => {
        assert.equal(typeof bot.approve, 'undefined');
        assert.equal(typeof bot.pay, 'undefined');
        assert.equal(typeof bot.completeInvoice, 'undefined');
        assert.equal(typeof notify.approve, 'undefined');
        assert.equal(typeof bot.payVoucher, 'undefined');
    });

    await test('Grep thư mục telegram: không có hàm duyệt nghiệp vụ', () => {
        const root = path.join(__dirname, 'src');
        const files = [];
        const walk = dir => {
            for (const name of fs.readdirSync(dir)) {
                const full = path.join(dir, name);
                if (fs.statSync(full).isDirectory()) walk(full);
                else if (/telegram/i.test(full) && full.endsWith('.js')) files.push(full);
            }
        };
        walk(root);
        assert.ok(files.length >= 3);
        for (const file of files) {
            const text = fs.readFileSync(file, 'utf8');
            assert.equal(/function\s+approve|exports\.approve\s*=/.test(text), false, file);
            assert.equal(/completeInvoice/.test(text), false, file);
            assert.equal(/payVoucher/.test(text), false, file);
            assert.doesNotMatch(text, /bot\d{6,}:AA[A-Za-z0-9_-]{20,}/);
        }
    });

    await test('/today: DT GV lãi gộp 4 kênh, không gọi báo cáo tài chính', () => {
        const text = buildTodayMessage({
            operatingDay: '2026-09-05',
            DoanhThuThuan: 1000000,
            GiaVonHangBanThuan: 600000,
            LoiNhuanGop: 400000,
            TienMat: 100, TienQR: 200, TienThe: 300, TienCK: 400,
            congNoDenHan: 1, choXacNhan: 0, spCanBoSung: 2, caLech: []
        });
        assert.match(text, /Tóm tắt hoạt động hôm nay/);
        assert.match(text, /Doanh thu/);
        assert.match(text, /Giá vốn/);
        assert.match(text, /Lãi gộp/);
        assert.match(text, /QR/);
        assert.match(text, /Thẻ/);
        assert.match(text, /Chuyển khoản/);
        assert.equal(hasForbiddenFinanceLabel(text), false);
        assert.doesNotMatch(text, /tài chính ngày/i);
        const zhToday = buildTodayMessage({
            operatingDay: '2026-09-05',
            DoanhThuThuan: 1000000,
            GiaVonHangBanThuan: 600000,
            LoiNhuanGop: 400000,
            TienMat: 100, TienQR: 200, TienThe: 300, TienCK: 400,
            congNoDenHan: 1, choXacNhan: 0, spCanBoSung: 2, caLech: []
        }, 'zh');
        assert.match(zhToday, /销售额/);
        assert.match(zhToday, /毛利/);
        assert.doesNotMatch(zhToday, /Doanh thu/);
        const a3 = buildA3Message({
            operatingDay: '2026-09-05', LoiNhuanGop: 1,
            DoanhThuThuan: 1, GiaVonHangBanThuan: 0,
            TienMat: 0, TienQR: 0, TienThe: 0, TienCK: 0
        }, { sentAt: '2026-09-06' });
        assert.match(a3, /TÓM TẮT HOẠT ĐỘNG/);
        assert.doesNotMatch(a3, /tài chính ngày/i);
        assert.match(buildA1Message({ MaPhieu: 'PC00028', SoTien: 12500000, PhuongThuc: 'Chuyển khoản' }), /PHIẾU CHI CHỜ DUYỆT/);
        assert.match(text, /<b>/);
        assert.match(text, /<code>/);
    });

    await test('HTML escape tên NCC/NV; dashboard /fly có số mock, không approve', () => {
        assert.equal(escapeHtml('A & B <Ltd>'), 'A &amp; B &lt;Ltd&gt;');
        const a1 = buildA1Message({
            MaPhieu: 'PC00028', TenNCC: 'A & B <Ltd>', SoTien: 12500000,
            PhuongThuc: 'Chuyển khoản', NguoiLap: 'Lan <KT>'
        });
        assert.match(a1, /A &amp; B &lt;Ltd&gt;/);
        assert.match(a1, /Lan &lt;KT&gt;/);
        assert.doesNotMatch(a1, /A & B <Ltd>/);
        assert.doesNotMatch(a1, /approve_|\/approve|Từ chối|completeInvoice/i);
        const dash = buildFlyDashboard({
            summary: {
                operatingDay: '2026-09-05',
                DoanhThuThuan: 1200000,
                GiaVonHangBanThuan: 800000,
                LoiNhuanGop: 400000,
                TienMat: 100000, TienQR: 200000, TienThe: 300000, TienCK: 400000,
                congNoDenHan: 2, choXacNhan: 1, spCanBoSung: 3,
                caDangMo: 1, caLech: ['CA01'], SoHoaDon: 8
            },
            inbox: [
                { id: 'po:PO001', title: 'Đơn mua chờ duyệt', detail: 'PO001 · A & B' },
                { id: 'pc:PC1', title: 'Phiếu chi chờ duyệt và giao tiền', detail: 'PC1' }
            ]
        });
        assert.match(dash, /SUPERMARKET FLY/);
        assert.match(dash, /05\/09\/2026/);
        assert.match(dash, /1\.200\.000đ/);
        assert.match(dash, /800\.000đ/);
        assert.match(dash, /400\.000đ/);
        assert.match(dash, /100\.000đ/);
        assert.match(dash, /200\.000đ/);
        assert.match(dash, /Đơn mua chờ duyệt/);
        assert.match(dash, /A &amp; B/);
        assert.match(dash, /<b>/);
        assert.match(dash, /<code>/);
        assert.doesNotMatch(dash, /tài chính ngày/i);
        assert.doesNotMatch(dash, /approve_|\/approve|Từ chối|completeInvoice/i);
        const inbox = buildInboxPushMessage({
            title: 'Đơn mua chờ duyệt',
            detail: 'PO001 · A & B <NCC>',
            at: '2026-09-05T10:00:00+07:00'
        });
        assert.match(inbox, /A &amp; B &lt;NCC&gt;/);
        assert.match(inbox, /05\/09\/2026 10:00/);
        assert.doesNotMatch(inbox, /GMT|Mon Sep|Indochina|toString/);
        assert.doesNotMatch(inbox, /Từ chối|approve_|\/approve/i);
        const pending = buildPendingMessage([{
            id: 'cc:1', title: 'Chấm công chờ duyệt',
            detail: 'Hoàng Minh Châu · hành chính',
            at: new Date('2026-09-07T00:00:00+07:00')
        }]);
        assert.match(pending, /Hoàng Minh Châu/);
        assert.match(pending, /Ca hành chính/);
        assert.match(pending, /07\/09\/2026/);
        assert.match(pending, /UC32/);
        assert.match(pending, /Fly → Duyệt công/);
        assert.match(pending, /Duyệt công/);
        assert.match(pending, new RegExp(ATTENDANCE_NOTE_VI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.doesNotMatch(pending, /GMT|Mon Sep|00:00:00/);
        const att = buildAttendancePendingMessage({
            TenNV: 'Hoàng Minh Châu', TenCa: 'hành chính',
            NgayLam: new Date('2026-09-07T00:00:00+07:00')
        });
        assert.match(att, /Ca hành chính · 07\/09\/2026/);
        assert.match(att, /chờ duyệt công|UC32/);
        assert.doesNotMatch(att, /GMT|Mon Sep|Indochina/);
    });

    await test('Mốc A3 đúng 06:10, sai 22:00; ngày vận hành D khi clock 06:10 D+1', () => {
        const morning = at('2026-09-06T06:10:00+07:00');
        const night = at('2026-09-05T22:10:00+07:00');
        const dawn = at('2026-09-06T03:00:00+07:00');
        assert.equal(isOperatingReportWindow(morning), true);
        assert.equal(isOperatingReportWindow(night), false);
        assert.equal(isNightShiftStartHour(night), true);
        assert.equal(operatingDayForReport(morning), '2026-09-05');
        assert.equal(operatingDayOf(dawn), '2026-09-05');
        assert.equal(operatingDayOf(morning), '2026-09-06');
        assert.equal(formatVnDate('2026-09-05'), '05/09/2026');
        const sqlDate = new Date('2026-09-07T00:00:00+07:00');
        assert.equal(formatVnDate(sqlDate), '07/09/2026');
        assert.equal(formatVnDateTime(sqlDate), '07/09/2026');
        assert.doesNotMatch(formatVnDate(sqlDate), /GMT|Mon Sep|Indochina/);
        assert.equal(looksLikeJsDateString(sqlDate.toString()), true);
        assert.equal(looksLikeJsDateString(formatVnDate(sqlDate)), false);
        assert.equal(formatVnDateTime('2026-09-05T10:00:00+07:00'), '05/09/2026 10:00');
        assert.equal(prettyShiftName('hành chính'), 'Ca hành chính');
        assert.equal(prettyShiftName('Ca đêm'), 'Ca đêm');
    });

    await test('Rate-limit 10 phút cùng chứng từ', async () => {
        const now = new Date();
        assert.equal(isWithinRateLimit(new Date(now.getTime() - 2 * 60 * 1000), now), true);
        assert.equal(isWithinRateLimit(new Date(now.getTime() - 11 * 60 * 1000), now), false);
        const last = new Date();
        const pool = {
            request() {
                return {
                    input() { return this; },
                    async query() { return { recordset: [{ LanGuiCuoi: last }] }; }
                };
            }
        };
        notify.setTelegramRuntime({ getPool: async () => pool, getSql: () => fakeSql, now: () => new Date() });
        assert.equal(await notify.shouldSkipPush(pool, 'PC_CHO_DUYET', 'PC00028'), true);
    });

    await test('Group update bỏ qua, không gửi số tiền', async () => {
        const sent = [];
        notify.setTelegramRuntime({
            fetchFn: async (_url, opts) => {
                sent.push(JSON.parse(opts.body));
                return { ok: true, json: async () => ({ ok: true }) };
            }
        });
        const result = await bot.handleUpdate({
            message: { chat: { id: -100, type: 'group' }, text: '/today' }
        });
        assert.equal(result.group, true);
        assert.equal(sent.length, 1);
        assert.equal(sent[0].text, DENY_GROUP);
        assert.doesNotMatch(sent[0].text, /\d{3}/);
    });

    await test('Lệnh cấm /approve không tồn tại như handler ghi', async () => {
        const sent = [];
        notify.setTelegramRuntime({
            fetchFn: async (_url, opts) => {
                sent.push(JSON.parse(opts.body));
                return { json: async () => ({ ok: true }) };
            }
        });
        const result = await bot.handleUpdate({
            message: { chat: { id: 1, type: 'private' }, text: '/approve PC00028' }
        });
        assert.equal(result.forbidden, true);
        assert.match(sent[0].text, /không duyệt|Không \/pay/i);
    });

    await test('sendMessage mặc định parse_mode HTML', async () => {
        const sent = [];
        notify.setTelegramRuntime({
            fetchFn: async (_url, opts) => {
                sent.push(JSON.parse(opts.body));
                return { json: async () => ({ ok: true }) };
            }
        });
        await notify.sendMessage('42', '<b>Hi</b> &amp; shop');
        assert.equal(sent[0].parse_mode, 'HTML');
        assert.equal(sent[0].text, '<b>Hi</b> &amp; shop');
        assert.equal(sent[0].disable_notification, false);
        assert.doesNotMatch(sent[0].text, /approve/i);
        sent.length = 0;
        await notify.sendMessage('42', '<b>Hi</b>', { disable_notification: true });
        assert.equal(sent[0].disable_notification, true);
    });

    await test('Inbox push bỏ HĐ bán; dedup 10 phút theo id chuông', async () => {
        const now = new Date();
        const items = [
            { id: 'hd:HD001', title: 'Hóa đơn bán hoàn thành', detail: 'HD001', at: now },
            { id: 'po:PO001', title: 'Đơn mua chờ duyệt', detail: 'PO001 · NCC', at: now }
        ];
        const picked = notify.pickInboxToPush(items, { recordId: 'PO001', now });
        assert.equal(picked.length, 1);
        assert.equal(picked[0].id, 'po:PO001');
        const saleOnly = notify.pickInboxToPush(items, { recordId: 'HD001', now });
        assert.equal(saleOnly.length, 0);
    });

    await test('Telegram lỗi không làm fail closeShift (notifySafely + fetch throw)', async () => {
        notify.setTelegramRuntime({
            fetchFn: async () => { throw new Error('telegram down'); }
        });
        let threw = false;
        try {
            notify.notifySafely(() => notify.sendMessage('1', 'CHÊNH LỆCH KẾT CA'));
        } catch {
            threw = true;
        }
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(threw, false);
        const committed = { status: 200 };
        assert.equal(committed.status, 200);
    });

    await test('Polling: deleteWebhook trước getUpdates', async () => {
        const calls = [];
        const fetchFn = async (url) => {
            calls.push(url);
            return { json: async () => ({ ok: true, result: [] }) };
        };
        const prevUrl = process.env.TELEGRAM_WEBHOOK_URL;
        process.env.TELEGRAM_WEBHOOK_URL = '';
        const result = await bot.startTelegramBot({
            fetchFn, pollOnce: true, skipCron: true, startPolling: false, webhookUrl: '', skipSchema: true
        });
        process.env.TELEGRAM_WEBHOOK_URL = prevUrl;
        bot.stopTelegramBot();
        assert.equal(result.mode, 'polling');
        assert.equal(result.deleteWebhookFirst, true);
        const methods = calls.map(url => String(url).split('/').pop());
        const del = methods.indexOf('deleteWebhook');
        const get = methods.indexOf('getUpdates');
        assert.ok(del >= 0 && get >= 0 && del < get);
        assert.ok(!methods.includes('setWebhook'));
        assert.ok(methods.includes('setMyCommands'));
        assert.ok(methods.includes('setChatMenuButton'));
        assert.ok(methods.includes('getMe'));
    });

    await test('401 lúc start → log token không hợp lệ, không in token', async () => {
        const fetchFn = async () => ({
            status: 401,
            json: async () => ({ ok: false, error_code: 401, description: 'Unauthorized' })
        });
        const result = await bot.startTelegramBot({
            fetchFn, skipCron: true, startPolling: false, webhookUrl: '', skipSchema: true
        });
        bot.stopTelegramBot();
        assert.equal(result.mode, 'off');
        assert.match(result.error, /Token Telegram không hợp lệ/);
        assert.doesNotMatch(result.error, /889737|AAFL|:AA/);
    });

    await test('Token trống → off, không crash', async () => {
        const prev = process.env.TELEGRAM_BOT_TOKEN;
        process.env.TELEGRAM_BOT_TOKEN = '';
        const result = await bot.startTelegramBot({ skipCron: true, startPolling: false, skipSchema: true });
        process.env.TELEGRAM_BOT_TOKEN = prev;
        assert.equal(result.mode, 'off');
    });

    await test('parseCommand /start OTP và /bind alias; /payroll MaNV', () => {
        assert.deepEqual(bot.parseCommand('/start 482913'), { name: 'bind', otp: '482913' });
        assert.deepEqual(bot.parseCommand('/bind 482913'), { name: 'bind', otp: '482913' });
        assert.deepEqual(bot.parseCommand('/start 628817'), { name: 'bind', otp: '628817' });
        assert.deepEqual(bot.parseCommand('/start628817'), { name: 'bind', otp: '628817' });
        assert.deepEqual(bot.parseCommand('/start@supermarket_flybot 628817'), { name: 'bind', otp: '628817' });
        assert.deepEqual(bot.parseCommand('/start@supermarket_flybot'), { name: 'start' });
        assert.deepEqual(bot.parseCommand('/payroll NV008'), { name: 'payroll', arg: 'NV008' });
        assert.equal(bot.parseCommand('/today').name, 'today');
        assert.equal(bot.parseCommand('📋 Tóm tắt /fly').name, 'fly');
        assert.equal(bot.parseCommand('💰 Doanh thu hôm nay').name, 'revenue');
        assert.equal(bot.parseCommand('🛍️ Sản phẩm / tồn thấp').name, 'lowstock');
        assert.equal(bot.parseCommand('📦 Việc chờ duyệt').name, 'pending');
        assert.equal(bot.parseCommand('⏳ Cần duyệt').name, 'pending');
        assert.equal(bot.parseCommand('📊 Báo cáo').name, 'reports');
        assert.equal(bot.parseCommand('📄 Chứng từ').name, 'docs');
        assert.deepEqual(bot.parseCommand('/docs po:PO00001'), { name: 'docs', arg: 'po:PO00001' });
        assert.deepEqual(bot.parseDocsArg('po:PO00001'), { kind: 'po', id: 'PO00001' });
        assert.equal(bot.parseCommand('🧾 Công nợ NCC').name, 'debt');
        assert.equal(bot.parseCommand('📋 Summary /fly').name, 'fly');
        assert.equal(bot.parseCommand('💰 今日销售').name, 'revenue');
        assert.equal(DENY_VIEW.includes('không xem'), true);
    });

    const mockPool = (row) => ({
        request() {
            return {
                input() { return this; },
                async query() { return { recordset: row ? [row] : [] }; }
            };
        }
    });

    const mockPoolBySql = ({ byChat = null, byOtp = null } = {}) => ({
        request() {
            return {
                input() { return this; },
                async query(sql) {
                    const text = String(sql);
                    if (/WHERE d\.ChatId=@ChatId/.test(text)) {
                        return { recordset: byChat ? [byChat] : [] };
                    }
                    if (/LTRIM\(RTRIM\(d\.MaOTP\)\)=@Otp/.test(text)) {
                        if (/HetHanOTP > GETDATE\(\)/.test(text) && byOtp?.HetHanOTP
                            && new Date(byOtp.HetHanOTP).getTime() < Date.now()) {
                            return { recordset: [] };
                        }
                        return { recordset: byOtp ? [byOtp] : [] };
                    }
                    return { recordset: [] };
                }
            };
        }
    });

    const collectSent = (row) => {
        const sent = [];
        notify.setTelegramRuntime({
            fetchFn: async (_url, opts) => {
                sent.push(opts?.body ? JSON.parse(opts.body) : {});
                return { json: async () => ({ ok: true, result: [] }) };
            },
            getPool: async () => mockPool(row),
            getSql: () => fakeSql
        });
        return sent;
    };

    await test('handleBindOtp: ChatId NULL, OTP CHAR pad vẫn bind', async () => {
        const otpRow = {
            MaNV: 'NV001', ChatId: null, MaTK: 1, Bat: 0, MaOTP: '628817 ',
            HetHanOTP: new Date(Date.now() + 60000), SoLanSai: 0,
            TenNV: 'Nguyễn Minh Anh', MaTKLive: 1, MaVaiTro: 1, TrangThaiTK: 1, TenVaiTro: 'Quản lý'
        };
        const logs = [];
        const origLog = console.log;
        console.log = (...args) => { logs.push(args.map(String).join(' ')); };
        notify.setTelegramRuntime({
            fetchFn: async () => ({ json: async () => ({ ok: true }) }),
            getPool: async () => mockPoolBySql({ byChat: null, byOtp: otpRow }),
            getSql: () => fakeSql
        });
        try {
            const msg = await bot.handleBindOtp('999001', '628817');
            assert.match(msg, /Đã liên kết Nguyễn Minh Anh/);
            assert.match(msg, /Quản lý/);
            const joined = logs.join('\n');
            assert.match(joined, /628\*\*\*/);
            assert.doesNotMatch(joined, /628817/);
        } finally {
            console.log = origLog;
        }
    });

    await test('handleBindOtp: hết hạn nói hết hạn, không phải sai mã', async () => {
        const expired = {
            MaNV: 'NV001', ChatId: null, MaTK: 1, Bat: 0, MaOTP: '628817',
            HetHanOTP: new Date(Date.now() - 1000), SoLanSai: 0,
            TenNV: 'Nguyễn Minh Anh', MaTKLive: 1, MaVaiTro: 1, TrangThaiTK: 1, TenVaiTro: 'Quản lý'
        };
        notify.setTelegramRuntime({
            fetchFn: async () => ({ json: async () => ({ ok: true }) }),
            getPool: async () => mockPoolBySql({ byChat: null, byOtp: expired }),
            getSql: () => fakeSql
        });
        const msg = await bot.handleBindOtp('42', '628817');
        assert.match(msg, /hết hạn/i);
        assert.doesNotMatch(msg, /Còn \d+ lần thử/);
    });

    await test('handleBindOtp: OTP đúng nhưng không phải QL', async () => {
        const tn = {
            MaNV: 'NV008', ChatId: null, MaTK: 2, Bat: 0, MaOTP: '628817',
            HetHanOTP: new Date(Date.now() + 60000), SoLanSai: 0,
            TenNV: 'Thu ngân', MaTKLive: 2, MaVaiTro: 4, TrangThaiTK: 1, TenVaiTro: 'Thu ngân'
        };
        notify.setTelegramRuntime({
            fetchFn: async () => ({ json: async () => ({ ok: true }) }),
            getPool: async () => mockPoolBySql({ byChat: null, byOtp: tn }),
            getSql: () => fakeSql
        });
        const msg = await bot.handleBindOtp('42', '628817');
        assert.equal(msg, DENY_NOT_MANAGER);
    });

    await test('handleBindOtp: không có dòng OTP khớp → không đếm lần thử', async () => {
        notify.setTelegramRuntime({
            fetchFn: async () => ({ json: async () => ({ ok: true }) }),
            getPool: async () => mockPoolBySql({ byChat: null, byOtp: null }),
            getSql: () => fakeSql
        });
        const msg = await bot.handleBindOtp('42', '111111');
        assert.match(msg, /Mã không đúng hoặc không còn hiệu lực/);
        assert.doesNotMatch(msg, /Còn \d+ lần thử/);
    });

    await test('handleBindOtp: lỗi cột NgoonNgu không thành hướng dẫn liên kết', async () => {
        bot.resetTelegramSchemaCache();
        bot.resetChatLangCache();
        let ngoonSelects = 0;
        const otpRow = {
            MaNV: 'NV001', ChatId: null, MaTK: 1, Bat: 0, MaOTP: '628817',
            HetHanOTP: new Date(Date.now() + 60000), SoLanSai: 0,
            TenNV: 'Nguyễn Minh Anh', MaTKLive: 1, MaVaiTro: 1, TrangThaiTK: 1, TenVaiTro: 'Quản lý'
        };
        const pool = {
            request() {
                return {
                    input() { return this; },
                    async query(sqlText) {
                        const text = String(sqlText);
                        if (/COL_LENGTH|ALTER TABLE|CREATE TABLE|CREATE UNIQUE INDEX|TelegramPushLog|SET NgoonNgu = N'vi'/.test(text)) {
                            return { recordset: [] };
                        }
                        if (/SELECT TOP 1 d\.MaNV/.test(text) && /d\.NgoonNgu/.test(text)) {
                            ngoonSelects += 1;
                            if (ngoonSelects === 1) {
                                throw new Error("Invalid column name 'NgoonNgu'.");
                            }
                        }
                        if (/WHERE d\.ChatId=@ChatId/.test(text)) return { recordset: [] };
                        if (/LTRIM\(RTRIM\(d\.MaOTP\)\)=@Otp/.test(text)) return { recordset: [otpRow] };
                        return { recordset: [] };
                    }
                };
            }
        };
        notify.setTelegramRuntime({
            fetchFn: async () => ({ json: async () => ({ ok: true }) }),
            getPool: async () => pool,
            getSql: () => fakeSql
        });
        const msg = await bot.handleBindOtp('42', '628817');
        assert.match(msg, /Đã liên kết Nguyễn Minh Anh/);
        assert.doesNotMatch(msg, /Hướng dẫn liên kết|Xin chào|Tạo mã/);
        assert.ok(ngoonSelects >= 2);
    });

    await test('handleUpdate /start 628817 parse và bind', async () => {
        const otpRow = {
            MaNV: 'NV001', ChatId: null, MaTK: 1, Bat: 0, MaOTP: '628817 ',
            HetHanOTP: new Date(Date.now() + 60000), SoLanSai: 0,
            TenNV: 'Nguyễn Minh Anh', MaTKLive: 1, MaVaiTro: 1, TrangThaiTK: 1, TenVaiTro: 'Quản lý'
        };
        const sent = [];
        notify.setTelegramRuntime({
            fetchFn: async (_url, opts) => {
                sent.push(opts?.body ? JSON.parse(opts.body) : {});
                return { json: async () => ({ ok: true }) };
            },
            getPool: async () => mockPoolBySql({ byChat: null, byOtp: otpRow }),
            getSql: () => fakeSql
        });
        const result = await bot.handleUpdate({
            message: { chat: { id: 555, type: 'private' }, text: '/start 628817' }
        });
        assert.equal(result.bind, true);
        assert.match(sent[0].text, /Đã liên kết Nguyễn Minh Anh/);
    });

    await test('/start không OTP vẫn reply + nút, không số liệu', async () => {
        bot.resetChatLangCache();
        const sent = collectSent(null);
        const result = await bot.handleUpdate({
            message: { chat: { id: 42, type: 'private' }, text: '/start' }
        });
        assert.equal(result.start, true);
        const welcomes = sent.filter(item => item.text);
        assert.equal(welcomes.length, 1);
        const msg = welcomes[0];
        assert.equal(msg.disable_notification, true);
        assert.match(msg.text, /Xin chào/);
        assert.match(msg.text, /companion của Quản lý/);
        assert.match(msg.text, /Liên kết Telegram/);
        assert.match(msg.text, /Tạo mã/);
        assert.match(msg.text, /Hà Nội/);
        assert.doesNotMatch(msg.text, /DT ngày|Doanh thu|Giá vốn|\/buy|\/stock|\/balance/);
        assert.doesNotMatch(msg.text, /GMT|Mon Sep|Indochina/);
        const kb = msg.reply_markup?.keyboard || [];
        const labels = kb.flat().map(btn => btn.text).join(' | ');
        assert.equal(msg.reply_markup.resize_keyboard, true);
        assert.equal(msg.reply_markup.is_persistent, true);
        assert.match(labels, /🔗 Liên kết \/ Hướng dẫn OTP/);
        assert.match(labels, /❓ Trợ giúp/);
        assert.match(labels, /🌐 Ngôn ngữ/);
        assert.doesNotMatch(labels, /Game|Voucher|VietQR|Nạp|Mở shop|Duyệt phiếu|Từ chối/i);
        assert.ok(kb.some(row => row.length === 1), 'hàng OTP full width');
    });

    await test('/start đã bind QL chào theo tên', async () => {
        bot.resetChatLangCache();
        const qlRow = {
            MaNV: 'NV001', ChatId: '42', MaTK: 1, Bat: 1, TenNV: 'Nguyễn Minh Anh',
            MaTKLive: 1, MaVaiTro: 1, TrangThaiTK: 1, TenVaiTro: 'Quản lý'
        };
        const sent = collectSent(qlRow);
        const result = await bot.handleUpdate({
            message: { chat: { id: 42, type: 'private' }, text: '/start' }
        });
        assert.equal(result.bound, true);
        const welcomes = sent.filter(item => item.text);
        assert.equal(welcomes.length, 1);
        assert.equal(welcomes[0].disable_notification, true);
        assert.match(welcomes[0].text, /Chào Quản lý/);
        assert.match(welcomes[0].text, /Nguyễn Minh Anh/);
        assert.match(welcomes[0].text, /Hà Nội/);
        assert.match(welcomes[0].text, /\/fly/);
        assert.match(welcomes[0].text, /DT ngày|Today revenue|今日销售/);
        assert.match(welcomes[0].text, /Việc chờ|Công chờ duyệt/);
        assert.match(welcomes[0].text, /UC32|Duyệt|nhật ký|Không chi lương/);
        assert.doesNotMatch(welcomes[0].text, /GMT|Mon Sep|Indochina/);
        const boundKb = sent[0].reply_markup?.keyboard || [];
        const boundLabels = boundKb.flat().map(btn => btn.text);
        assert.equal(sent[0].reply_markup.resize_keyboard, true);
        assert.equal(sent[0].reply_markup.is_persistent, true);
        assert.ok(boundKb.every(row => row.length === 2));
        assert.ok(boundLabels.includes('🛍️ Sản phẩm / tồn thấp'));
        assert.ok(boundLabels.includes('📄 Chứng từ'));
        assert.ok(boundLabels.includes('⏳ Cần duyệt'));
        assert.ok(boundLabels.includes('📊 Báo cáo'));
        assert.ok(boundLabels.includes('💰 Doanh thu hôm nay'));
        assert.ok(boundLabels.includes('🧾 Công nợ NCC'));
        assert.ok(boundLabels.includes('🕐 Ca & quỹ'));
        assert.ok(boundLabels.includes('💳 Thanh toán'));
        assert.ok(boundLabels.includes('🛍️ Sản phẩm / tồn thấp'));
        assert.ok(boundLabels.includes('📋 Tóm tắt /fly'));
        assert.ok(boundLabels.includes('🌐 Ngôn ngữ'));
        assert.ok(boundLabels.includes('❓ Trợ giúp'));
        assert.ok(!boundLabels.some(text => /Game|Voucher|VietQR|Nạp|Mở shop/i.test(text)));
    });

    await test('chọn zh → help tiếng Trung; OTP trim vẫn bind', async () => {
        bot.resetChatLangCache();
        const sent = [];
        notify.setTelegramRuntime({
            fetchFn: async (_url, opts) => {
                sent.push(opts?.body ? JSON.parse(opts.body) : {});
                return { json: async () => ({ ok: true }) };
            },
            getPool: async () => mockPool(null),
            getSql: () => fakeSql
        });
        const picked = await bot.handleUpdate({
            callback_query: { id: 'q1', data: 'lang:zh', message: { chat: { id: 77, type: 'private' } } }
        });
        assert.equal(picked.lang, 'zh');
        assert.equal(bot.getChatLang('77'), 'zh');
        assert.match(sent.find(item => item.text).text, /已切换为简体中文/);
        const zhKb = sent.find(item => item.reply_markup?.keyboard)?.reply_markup?.keyboard || [];
        const zhLabels = zhKb.flat().map(btn => btn.text).join(' | ');
        assert.match(zhLabels, /关联 \/ OTP 说明|帮助/);
        assert.doesNotMatch(zhLabels, /Game|Voucher|VietQR|Nạp/);
        sent.length = 0;
        await bot.handleUpdate({
            callback_query: { id: 'q2', data: 'cmd:help', message: { chat: { id: 77, type: 'private' } } }
        });
        const help = sent.find(item => item.text);
        assert.match(help.text, /关联说明/);
        assert.match(help.text, /店长/);
        assert.doesNotMatch(help.text, /\/buy|\/stock/);
        const zhHelp = bot.cmdHelp({ TenVaiTro: 'Quản lý' }, 'zh');
        assert.match(zhHelp, /帮助/);
        assert.match(zhHelp, /今日经营摘要/);
        assert.equal(t('zh', 'todayRevenue'), '销售额');

        const otpRow = {
            MaNV: 'NV001', ChatId: null, MaTK: 1, Bat: 0, MaOTP: '628817 ',
            HetHanOTP: new Date(Date.now() + 60000), SoLanSai: 0,
            TenNV: 'Nguyễn Minh Anh', MaTKLive: 1, MaVaiTro: 1, TrangThaiTK: 1, TenVaiTro: 'Quản lý'
        };
        notify.setTelegramRuntime({
            fetchFn: async () => ({ json: async () => ({ ok: true }) }),
            getPool: async () => mockPoolBySql({ byChat: null, byOtp: otpRow }),
            getSql: () => fakeSql
        });
        const padded = bot.evaluateBind({
            row: otpRow, otp: '628817', now: new Date(), chatId: '77'
        });
        assert.equal(padded.ok, true);
        const bound = await bot.handleBindOtp('77', '628817');
        assert.match(bound, /已关联 Nguyễn Minh Anh|Đã liên kết Nguyễn Minh Anh/);
        bot.resetChatLangCache();
    });

    await test('Lệnh chưa bind / không QL không số liệu', async () => {
        bot.resetChatLangCache();
        const unbound = collectSent(null);
        await bot.handleUpdate({
            message: { chat: { id: 42, type: 'private' }, text: '/today' }
        });
        assert.match(unbound[0].text, /Chỉ Quản lý đã liên kết/);
        assert.doesNotMatch(unbound[0].text, /Doanh thu|Giá vốn|Lãi gộp/);

        const tnRow = {
            MaNV: 'NV008', ChatId: '42', MaTK: 2, Bat: 1, TenNV: 'Thu ngân test',
            MaTKLive: 2, MaVaiTro: 4, TrangThaiTK: 1, TenVaiTro: 'Thu ngân'
        };
        const tnSent = collectSent(tnRow);
        const tn = await bot.handleUpdate({
            message: { chat: { id: 42, type: 'private' }, text: '/today' }
        });
        assert.equal(tn.notManager, true);
        assert.equal(tnSent[0].text, DENY_NOT_MANAGER_CMD);
        assert.doesNotMatch(tnSent[0].text, /Doanh thu|Giá vốn|\d{3}\.\d{3}/);
    });

    await test('/help /fly user-initiated tắt chuông; push mặc định có chuông', async () => {
        bot.resetChatLangCache();
        const qlRow = {
            MaNV: 'NV001', ChatId: '42', MaTK: 1, Bat: 1, TenNV: 'Nguyễn Minh Anh',
            MaTKLive: 1, MaVaiTro: 1, TrangThaiTK: 1, TenVaiTro: 'Quản lý'
        };
        const sent = collectSent(qlRow);
        await bot.handleUpdate({
            message: { chat: { id: 42, type: 'private' }, text: '/help' }
        });
        assert.equal(sent[0].disable_notification, true);
        assert.match(sent[0].text, /\/start 482913/);
        sent.length = 0;
        await bot.handleUpdate({
            message: { chat: { id: 42, type: 'private' }, text: '/fly' }
        });
        const fly = sent.find(item => item.text);
        assert.equal(fly.disable_notification, true);
        sent.length = 0;
        await notify.sendMessage('42', '🔔 CHẤM CÔNG CHỜ DUYỆT');
        assert.equal(sent[0].disable_notification, false);
    });

    await test('/start cùng update_id chỉ 1 tin chào', async () => {
        bot.resetChatLangCache();
        const sent = collectSent(null);
        const update = { update_id: 9001, message: { chat: { id: 42, type: 'private' }, text: '/start' } };
        const first = await bot.handleUpdate(update);
        const second = await bot.handleUpdate(update);
        assert.equal(first.start, true);
        assert.equal(second.deduped, true);
        assert.equal(sent.filter(item => item.text).length, 1);
        assert.equal(sent[0].disable_notification, true);
    });

    await test('Webhook active không gọi getUpdates', async () => {
        const calls = [];
        const fetchFn = async (url) => {
            calls.push(url);
            return { json: async () => ({ ok: true, result: { url: 'https://example.test/hook' } }) };
        };
        const result = await bot.startTelegramBot({
            fetchFn, skipCron: true, webhookUrl: 'https://example.test/hook', skipSchema: true
        });
        bot.stopTelegramBot();
        assert.equal(result.mode, 'webhook');
        assert.equal(result.polling, false);
        const methods = calls.map(url => String(url).split('/').pop());
        assert.ok(methods.includes('setWebhook'));
        assert.ok(!methods.includes('getUpdates'));
    });

    await test('Thẻ chờ duyệt đủ dòng hàng + nút Duyệt/Từ chối', () => {
        const lines = Array.from({ length: 12 }, (_, i) => ({
            MaSP: `SP${String(i + 1).padStart(3, '0')}`,
            TenSP: `Hàng ${i + 1}`,
            SoLuong: i + 1,
            DonGia: 10000,
            ThanhTien: (i + 1) * 10000
        }));
        const card = teleDecision.buildApprovalCard({
            kind: 'po', id: 'PO00001', title: 'ĐƠN MUA CHỜ DUYỆT',
            status: 'Chờ duyệt', createdBy: 'Lan', party: 'NCC ABC',
            lines, totals: { tong: 780000, thue: 78000 },
            docs: [
                { label: 'Đơn mua', value: 'PO00001' },
                { label: 'Số HĐ NCC', value: 'HD-NCC-1' },
                { label: 'Phiếu nhập', value: 'PN00001' }
            ],
            pending: true
        });
        assert.match(card, /PO00001/);
        assert.match(card, /SP001/);
        assert.match(card, /Hàng 12/);
        assert.match(card, /780\.000đ/);
        assert.match(card, /HD-NCC-1/);
        assert.match(card, /PN00001/);
        const kb = teleDecision.approvalKeyboard({ kind: 'po', id: 'PO00001', pending: true });
        const texts = kb.inline_keyboard.flat().map(btn => btn.text);
        assert.ok(texts.includes('✅ Duyệt'));
        assert.ok(texts.includes('❌ Từ chối'));
        assert.ok(texts.includes('📄 Chứng từ'));
        assert.ok(texts.includes('📊 Báo cáo'));
        assert.ok(kb.inline_keyboard.flat().some(btn => btn.callback_data === 'ok:po:PO00001'));
        assert.ok(kb.inline_keyboard.flat().some(btn => btn.callback_data === 'docs:po:PO00001'));
        const attKb = teleDecision.approvalKeyboard({ kind: 'cc', id: '9', pending: true });
        assert.ok(!attKb.inline_keyboard.flat().some(btn => btn.text === '❌ Từ chối'));
        assert.ok(attKb.inline_keyboard.flat().some(btn => btn.callback_data === 'ok:cc:9'));
    });

    await test('QL callback duyệt gọi service mock và ghi audit', async () => {
        bot.resetChatLangCache();
        const audits = [];
        bot.setFlyHandlerOverride(async (ctx) => {
            audits.push({
                user: ctx.user, action: 'Phê duyệt Đơn mua hàng', recordId: ctx.id, uc: ctx.uc
            });
            return { status: 200, body: { message: 'Đã phê duyệt Đơn mua hàng.' } };
        });
        const qlRow = {
            MaNV: 'NV001', ChatId: '42', MaTK: 1, Bat: 1, TenNV: 'Nguyễn Minh Anh',
            MaTKLive: 1, MaVaiTro: 1, TrangThaiTK: 1, TenVaiTro: 'Quản lý'
        };
        const sent = collectSent(qlRow);
        const result = await bot.handleUpdate({
            callback_query: {
                id: 'ap1',
                data: 'ok:po:PO00001',
                message: { chat: { id: 42, type: 'private' } }
            }
        });
        assert.equal(result.ok, true);
        assert.equal(result.kind, 'po');
        assert.equal(audits.length, 1);
        assert.equal(audits[0].action, 'Phê duyệt Đơn mua hàng');
        assert.equal(audits[0].recordId, 'PO00001');
        assert.equal(audits[0].uc, 'UC05');
        assert.equal(audits[0].user.TenVaiTro, 'Quản lý');
        assert.match(sent.find(item => item.text).text, /Đã duyệt trên Telegram/);
        assert.match(sent.find(item => item.text).text, /nhật ký/);
        bot.setFlyHandlerOverride(null);
    });

    await test('Không phải QL callback duyệt → 403', async () => {
        bot.resetChatLangCache();
        let called = 0;
        bot.setFlyHandlerOverride(async () => {
            called += 1;
            return { status: 200, body: { message: 'should not' } };
        });
        const tnRow = {
            MaNV: 'NV008', ChatId: '42', MaTK: 2, Bat: 1, TenNV: 'Thu ngân test',
            MaTKLive: 2, MaVaiTro: 4, TrangThaiTK: 1, TenVaiTro: 'Thu ngân'
        };
        const sent = collectSent(tnRow);
        const result = await bot.handleUpdate({
            callback_query: {
                id: 'ap2',
                data: 'ok:po:PO00001',
                message: { chat: { id: 42, type: 'private' } }
            }
        });
        assert.equal(result.status, 403);
        assert.ok(result.notManager || result.forbidden);
        assert.equal(called, 0);
        assert.equal(sent.find(item => item.text)?.text, DENY_NOT_MANAGER_CMD);
        bot.setFlyHandlerOverride(null);
    });

    await test('Duyệt lần 2 idempotent; callback không phải hoàn thành HĐ', async () => {
        bot.resetChatLangCache();
        bot.setFlyHandlerOverride(async () => ({
            status: 409, body: { message: 'Đơn mua không còn ở trạng thái chờ duyệt.' }
        }));
        const qlRow = {
            MaNV: 'NV001', ChatId: '42', MaTK: 1, Bat: 1, TenNV: 'Nguyễn Minh Anh',
            MaTKLive: 1, MaVaiTro: 1, TrangThaiTK: 1, TenVaiTro: 'Quản lý'
        };
        const sent = collectSent(qlRow);
        const result = await bot.handleUpdate({
            callback_query: {
                id: 'ap3',
                data: 'ok:po:PO00001',
                message: { chat: { id: 42, type: 'private' } }
            }
        });
        assert.equal(result.already, true);
        assert.match(sent.find(item => item.text).text, /đã được xử lý|Không duyệt lần hai/i);
        assert.deepEqual(bot.parseDecisionCallback('ok:po:PO00001'), { action: 'ok', kind: 'po', id: 'PO00001' });
        assert.deepEqual(bot.parseDecisionCallback('docs:po:PO00001'), { action: 'docs', kind: 'po', id: 'PO00001' });
        assert.equal(bot.parseDecisionCallback('cmd:today'), null);
        bot.setFlyHandlerOverride(null);
    });

    await test('Chứng từ Telegram: khung in + dòng hàng, không Date.toString', () => {
        const sheet = teleDocs.buildDocumentSheet({
            title: 'ĐƠN MUA HÀNG',
            number: 'PO00001',
            date: new Date('2026-09-07T00:00:00+07:00'),
            status: 'Chờ duyệt',
            fields: [
                { label: 'Nhà cung cấp', value: 'NCC ABC' },
                { label: 'Ngày giao', value: new Date('2026-09-10T00:00:00+07:00') }
            ],
            lines: [
                { MaSP: 'SP001', TenSP: 'Sữa tươi', SoLuong: 10, DonGia: 12000, ThanhTien: 120000 }
            ],
            totals: [{ label: 'TỔNG GIÁ TRỊ ĐƠN MUA', value: 120000, format: 'money' }]
        });
        assert.match(sheet, /ĐƠN MUA HÀNG/);
        assert.match(sheet, /PO00001/);
        assert.match(sheet, /SP001/);
        assert.match(sheet, /Sữa tươi/);
        assert.match(sheet, /120\.000đ/);
        assert.match(sheet, /07\/09\/2026/);
        assert.doesNotMatch(sheet, /GMT|Mon Sep|Indochina|toString/);
        const pages = splitTelegramText(`${'a\n'.repeat(2000)}dòng hàng SP001`, 200);
        assert.ok(pages.length >= 2);
        assert.match(pages[1], /— trang 2 —/);
        const reports = buildReportsMessages({
            summary: { operatingDay: '2026-09-07', DoanhThuThuan: 1, GiaVonHangBanThuan: 0, LoiNhuanGop: 1, TienMat: 0, TienQR: 0, TienThe: 0, TienCK: 0 },
            debt: { TongKhoan: 1, TongConLai: 1000, SapHan: 0, QuaHan: 0 },
            inbox: [],
            pnl: { loiNhuanGop: 1, laiLoSauChiPhi: 1 }
        });
        assert.equal(reports.length, 5);
        assert.match(reports[0], /Lãi gộp/);
        assert.match(reports[1], /P&amp;L|P&L/);
        assert.match(reports[2], /CÔNG NỢ/);
    });

    await test('callback docs sinh tin có dòng hàng', async () => {
        bot.resetChatLangCache();
        bot.setDocumentPackOverride(async () => ({
            messages: [{
                title: 'ĐƠN MUA HÀNG',
                text: teleDocs.buildDocumentSheet({
                    title: 'ĐƠN MUA HÀNG',
                    number: 'PO00001',
                    lines: [{ MaSP: 'SP001', TenSP: 'Sữa tươi', SoLuong: 2, DonGia: 15000, ThanhTien: 30000 }]
                }),
                photos: []
            }]
        }));
        const qlRow = {
            MaNV: 'NV001', ChatId: '42', MaTK: 1, Bat: 1, TenNV: 'Nguyễn Minh Anh',
            MaTKLive: 1, MaVaiTro: 1, TrangThaiTK: 1, TenVaiTro: 'Quản lý'
        };
        const sent = collectSent(qlRow);
        const result = await bot.handleUpdate({
            callback_query: {
                id: 'docs1',
                data: 'docs:po:PO00001',
                message: { chat: { id: 42, type: 'private' } }
            }
        });
        assert.equal(result.ok, true);
        assert.equal(result.command, 'docs');
        const paper = sent.find(item => item.text && /ĐƠN MUA HÀNG/.test(item.text));
        assert.ok(paper, 'phải gửi ít nhất 1 tin chứng từ');
        assert.match(paper.text, /SP001/);
        assert.match(paper.text, /Sữa tươi/);
        assert.doesNotMatch(paper.text, /GMT|Mon Sep|Indochina|toString/);
        bot.setDocumentPackOverride(null);
    });

    notify.resetTelegramRuntime();
    bot.stopTelegramBot();
    console.log('PASS telegram companion P1');
    process.exit(0);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
