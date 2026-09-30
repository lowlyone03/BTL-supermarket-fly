const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    MailError, readSmtpConfig, resolveInvoiceRecipient, buildInvoiceEmail, sendInvoiceEmail, storeNameFrom, smtpErrorMessage
} = require('./src/services/mailService');

const results = [];
const test = (name, run) => results.push({ name, run });

const GMAIL_ENV = {
    SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_SECURE: 'false',
    SMTP_USER: 'shop@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop', MAIL_FROM: 'Supermarket Fly <shop@gmail.com>'
};
const invoice = (over = {}) => ({
    MaHD: 'HD20260930001', MaKH: 'KH001', TenKH: 'Nguyễn Văn A', EmailKH: 'khach@example.com',
    TrangThai: 'Hoàn thành', NgayLap: '2026-09-30T09:15:00Z',
    TongTienHang: 150000, TienGiamGia: 10000, TienDiemQuyDoi: 0, TongThanhToan: 140000,
    ...over
});
const lines = [
    { MaSP: 'SP01', TenSP: 'Sữa tươi <1L>', SoLuong: 2, DonGia: 50000, ThanhTien: 100000 },
    { MaSP: 'SP02', TenSP: 'Bánh mì', SoLuong: 1, DonGia: 50000, ThanhTien: 50000 }
];
const mockTransport = (behavior = 'ok') => {
    const sent = [];
    return {
        sent,
        sendMail: async (message) => {
            sent.push(message);
            if (behavior === 'auth') throw Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'), { code: 'EAUTH' });
            return { messageId: '<mock@test>' };
        }
    };
};
const rejectsCode = async (promise, code) => {
    await assert.rejects(promise, error => error instanceof MailError && error.code === code);
};

test('Thiếu SMTP_USER/SMTP_PASS: báo lỗi cấu hình tiếng Việt, không crash', () => {
    for (const env of [{}, { SMTP_USER: 'a@gmail.com' }, { SMTP_PASS: 'x' }]) {
        assert.throws(() => readSmtpConfig(env), error => {
            assert.ok(error instanceof MailError);
            assert.equal(error.code, 'SMTP_NOT_CONFIGURED');
            assert.equal(error.status, 503);
            assert.match(error.message, /Chưa cấu hình Gmail SMTP trong server\/\.env/);
            return true;
        });
    }
});

test('Cấu hình Gmail: STARTTLS 587, bỏ khoảng trắng App Password, MAIL_FROM mặc định = SMTP_USER', () => {
    const config = readSmtpConfig(GMAIL_ENV);
    assert.equal(config.host, 'smtp.gmail.com');
    assert.equal(config.port, 587);
    assert.equal(config.secure, false);
    assert.equal(config.pass, 'abcdefghijklmnop');
    assert.equal(readSmtpConfig({ SMTP_USER: 'u@gmail.com', SMTP_PASS: 'p' }).from, 'u@gmail.com');
    assert.equal(readSmtpConfig({ SMTP_USER: 'u@gmail.com', SMTP_PASS: 'p', SMTP_PORT: '465' }).secure, true);
});

test('Từ chối hóa đơn khách vãng lai / khách không email / email sai / chưa hoàn thành', () => {
    const code = (inv) => {
        try { resolveInvoiceRecipient(inv); return 'OK'; } catch (error) { return error.code; }
    };
    assert.equal(code(null), 'INVOICE_NOT_FOUND');
    assert.equal(code(invoice({ MaKH: null, TenKH: null, EmailKH: null })), 'NO_CUSTOMER');
    assert.equal(code(invoice({ EmailKH: '' })), 'NO_CUSTOMER_EMAIL');
    assert.equal(code(invoice({ EmailKH: '   ' })), 'NO_CUSTOMER_EMAIL');
    assert.equal(code(invoice({ EmailKH: 'sai-email' })), 'INVALID_CUSTOMER_EMAIL');
    assert.equal(code(invoice({ TrangThai: 'Nháp' })), 'INVOICE_NOT_COMPLETED');
    assert.equal(resolveInvoiceRecipient(invoice({ EmailKH: ' khach@example.com ' })), 'khach@example.com');
});

test('Nội dung email: mã HĐ, khách, dòng hàng, tổng; escape HTML', () => {
    const mail = buildInvoiceEmail({ invoice: invoice(), lines, storeName: 'Supermarket Fly' });
    assert.match(mail.subject, /HD20260930001/);
    assert.match(mail.html, /HD20260930001/);
    assert.match(mail.html, /Nguyễn Văn A/);
    assert.match(mail.html, /Sữa tươi &lt;1L&gt;/);
    assert.ok(!mail.html.includes('<1L>'));
    assert.match(mail.html, /140\.000đ/);
    assert.match(mail.html, /Giảm giá/);
    assert.match(mail.text, /2\. Bánh mì\n\s+1 x 50\.000đ = 50\.000đ/);
    assert.match(mail.text, /TỔNG THANH TOÁN: 140\.000đ/);
    assert.match(mail.html, /max-width:600px/);
    assert.ok(!/<th\b/.test(mail.html), 'dòng hàng không dùng bảng 4 cột');
    assert.ok(!/Thanh toán<\/td>/.test(mail.html), 'không có dữ liệu thanh toán thì không render khối Thanh toán');
    assert.ok(!mail.html.includes('Thông tin giao dịch'), 'không có thu ngân/quầy/ca thì không render khối');
    assert.equal(storeNameFrom('Supermarket Fly <shop@gmail.com>'), 'Supermarket Fly');
});

test('Bản chi tiết: đơn vị, SĐT che giữa, khối Thanh toán và Thông tin giao dịch chỉ từ dữ liệu có thật', () => {
    const mail = buildInvoiceEmail({
        invoice: invoice({ SDT: '0901234567', TenNV: 'Tạ Thu Trang', MaQuay: 'Q01', MaCa: 'CA202609300001', DiemCong: 0 }),
        lines: [{ ...lines[1], DonViTinh: 'Ổ', GiamGia: 5000 }],
        payments: [{ PhuongThuc: 'QR', NguonXacNhan: 'ZaloPay', MaGiaoDich: '260930000001611', SoTien: 140000, NgayTT: '2026-09-30T09:45:26Z' }]
    });
    assert.match(mail.html, /Ổ · 1 × 50\.000đ/);
    assert.match(mail.html, /Giảm -5\.000đ/);
    assert.match(mail.html, /090\*\*\*\*567/);
    assert.ok(!mail.html.includes('0901234567'));
    assert.match(mail.html, /ZaloPay/);
    assert.match(mail.html, /Mã GD 260930000001611/);
    assert.match(mail.html, /Tạ Thu Trang/);
    assert.match(mail.html, /Đã thanh toán/);
    assert.match(mail.html, /tiết kiệm 10\.000đ/);
    assert.ok(!mail.html.includes('Điểm tích lũy cộng'), 'DiemCong = 0 thì không hiện');
    assert.match(mail.text, /THANH TOÁN\n- ZaloPay: 140\.000đ \(Mã GD 260930000001611, 16:45\)/);
    assert.match(mail.text, /Thu ngân: Tạ Thu Trang/);
    assert.equal(storeNameFrom('shop@gmail.com'), 'Supermarket Fly');
});

test('Thiếu SMTP: sendInvoiceEmail từ chối trước khi gọi transport', async () => {
    const transport = mockTransport();
    await rejectsCode(sendInvoiceEmail({ invoice: invoice(), lines }, { env: {}, transport }), 'SMTP_NOT_CONFIGURED');
    assert.equal(transport.sent.length, 0);
});

test('Khách không email: sendInvoiceEmail không gửi', async () => {
    const transport = mockTransport();
    await rejectsCode(sendInvoiceEmail({ invoice: invoice({ EmailKH: null }), lines }, { env: GMAIL_ENV, transport }), 'NO_CUSTOMER_EMAIL');
    assert.equal(transport.sent.length, 0);
});

test('Gửi qua transport giả: đúng người nhận là khách, from = MAIL_FROM', async () => {
    const transport = mockTransport();
    const result = await sendInvoiceEmail({ invoice: invoice(), lines }, { env: GMAIL_ENV, transport });
    assert.equal(result.to, 'khach@example.com');
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].to, 'khach@example.com');
    assert.equal(transport.sent[0].from, 'Supermarket Fly <shop@gmail.com>');
    assert.match(transport.sent[0].html, /HD20260930001/);
});

test('Lỗi SMTP (sai App Password) đổi thành MailError tiếng Việt', async () => {
    await rejectsCode(sendInvoiceEmail({ invoice: invoice(), lines }, { env: GMAIL_ENV, transport: mockTransport('auth') }), 'SMTP_SEND_FAILED');
    assert.match(smtpErrorMessage({ code: 'EAUTH' }), /mật khẩu ứng dụng/);
    assert.match(smtpErrorMessage({ code: 'ETIMEDOUT' }), /Không kết nối được/);
});

test('Route POST /invoices/:id/email được mount, cùng quyền UC24; UI có nút Gửi email', () => {
    const routes = fs.readFileSync(path.join(__dirname, 'src/routes/cashierRoutes.js'), 'utf8');
    assert.match(routes, /router\.post\('\/invoices\/:id\/email', requirePermission\('UC24'\), sales\.emailInvoice\)/);
    const app = fs.readFileSync(path.join(__dirname, 'src/app.js'), 'utf8');
    assert.match(app, /app\.use\('\/api\/cashier', cashierRoutes\)/);
    const ui = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/cashier/cashier-pages.js'), 'utf8');
    assert.match(ui, /data-email-invoice/);
    assert.match(ui, /\/cashier\/invoices\/\$\{encodeURIComponent\(maHD\)\}\/email/);
});

(async () => {
    for (const { name, run } of results) {
        try {
            await run();
            console.log(`✓ ${name}`);
        } catch (error) {
            console.error(`✗ ${name}`);
            console.error(error);
            process.exitCode = 1;
        }
    }
})();
