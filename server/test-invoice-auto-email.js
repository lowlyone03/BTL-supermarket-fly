const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { MailError } = require('./src/services/mailService');
const {
    sendCompletedInvoiceEmail, scheduleInvoiceEmailAfterCommit, waitInvoiceEmail, getInvoiceEmailStatus
} = require('./src/services/invoiceAutoEmail');

const results = [];
const test = (name, run) => results.push({ name, run });

const invoice = (over = {}) => ({
    MaHD: 'HD20260930001', MaKH: 'KH001', TenKH: 'Nguyễn Văn A', EmailKH: 'khach@example.com',
    TrangThai: 'Hoàn thành', TongThanhToan: 140000, ...over
});
const mockDeps = ({ inv = invoice(), sendError = null, loadError = null } = {}) => {
    const calls = { sent: [], audits: [] };
    return {
        calls,
        deps: {
            load: async (maHD) => {
                if (loadError) throw loadError;
                return { invoice: inv && { ...inv, MaHD: maHD }, lines: [], payments: [] };
            },
            send: async (payload) => {
                calls.sent.push(payload);
                if (sendError) throw sendError;
                return { to: payload.to, messageId: '<mock@test>' };
            },
            audit: async (entry) => { calls.audits.push(entry); }
        }
    };
};
const fakeTransaction = () => new EventEmitter();

test('COMMIT thành công: gửi đúng 1 mail tới email khách, ghi nhật ký Thành công', async () => {
    const { calls, deps } = mockDeps();
    const txn = fakeTransaction();
    const pending = scheduleInvoiceEmailAfterCommit(txn, { maHD: 'HD01', user: { MaNV: 'NV01' } }, deps);
    assert.equal(calls.sent.length, 0, 'chưa commit thì chưa gửi');
    txn.emit('commit');
    txn.emit('commit');
    const result = await pending;
    assert.deepEqual(result, { emailSent: true, emailTo: 'khach@example.com' });
    assert.equal(calls.sent.length, 1);
    assert.equal(calls.audits.length, 1);
    assert.equal(calls.audits[0].action, 'Gửi email hóa đơn');
    assert.equal(calls.audits[0].recordId, 'HD01');
    assert.match(calls.audits[0].content, /Tự gửi hóa đơn sau thanh toán tới khach@example\.com/);
});

test('ROLLBACK: không gửi, không ghi nhật ký', async () => {
    const { calls, deps } = mockDeps();
    const txn = fakeTransaction();
    const pending = scheduleInvoiceEmailAfterCommit(txn, { maHD: 'HD02' }, deps);
    txn.emit('rollback', false);
    txn.emit('commit');
    assert.deepEqual(await pending, { emailSent: false, emailSkipped: 'ROLLED_BACK' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.sent.length, 0);
    assert.equal(calls.audits.length, 0);
});

test('Khách vãng lai / không email / email sai: bỏ qua, không phải lỗi', async () => {
    for (const [over, code] of [
        [{ MaKH: null, EmailKH: null }, 'NO_CUSTOMER'],
        [{ EmailKH: '  ' }, 'NO_CUSTOMER_EMAIL'],
        [{ EmailKH: 'khong-hop-le' }, 'INVALID_CUSTOMER_EMAIL']
    ]) {
        const { calls, deps } = mockDeps({ inv: invoice(over) });
        const result = await sendCompletedInvoiceEmail({ maHD: 'HD03' }, deps);
        assert.deepEqual(result, { emailSent: false, emailSkipped: code });
        assert.equal(calls.sent.length, 0);
        assert.equal(calls.audits.length, 0);
    }
});

test('SMTP lỗi: resolve với emailError (không throw), ghi nhật ký Thất bại', async () => {
    const { calls, deps } = mockDeps({ sendError: new MailError('Gmail từ chối đăng nhập.', 502, 'SMTP_SEND_FAILED') });
    const txn = fakeTransaction();
    const pending = scheduleInvoiceEmailAfterCommit(txn, { maHD: 'HD04' }, deps);
    txn.emit('commit');
    const result = await pending;
    assert.equal(result.emailSent, false);
    assert.equal(result.emailTo, 'khach@example.com');
    assert.equal(result.emailError, 'Gmail từ chối đăng nhập.');
    assert.equal(calls.audits.length, 1);
    assert.equal(calls.audits[0].result, 'Thất bại');
    assert.equal(calls.audits[0].severity, 'Cảnh báo');
});

test('SMTP chưa cấu hình: bỏ qua im lặng, không báo lỗi thanh toán', async () => {
    const { deps } = mockDeps({ sendError: new MailError('Chưa cấu hình', 503, 'SMTP_NOT_CONFIGURED') });
    const warn = console.warn;
    console.warn = () => {};
    try {
        assert.deepEqual(await sendCompletedInvoiceEmail({ maHD: 'HD05' }, deps), { emailSent: false, emailSkipped: 'SMTP_NOT_CONFIGURED' });
    } finally {
        console.warn = warn;
    }
});

test('Lỗi bất ngờ (DB đọc lại HĐ) + ghi nhật ký cũng lỗi: vẫn resolve với thông báo chung', async () => {
    const { calls, deps } = mockDeps({ loadError: new Error('connection reset') });
    const error = console.error;
    console.error = () => {};
    try {
        const result = await sendCompletedInvoiceEmail({ maHD: 'HD06' }, { ...deps, audit: async () => { throw new Error('audit down'); } });
        assert.equal(result.emailSent, false);
        assert.equal(result.emailError, 'Không thể gửi email hóa đơn.');
        assert.equal(calls.sent.length, 0);
    } finally {
        console.error = error;
    }
});

test('Transaction không hỗ trợ sự kiện: không gửi', async () => {
    assert.deepEqual(await scheduleInvoiceEmailAfterCommit({}, { maHD: 'HD07' }), { emailSent: false, emailSkipped: 'NO_TRANSACTION' });
});

test('waitInvoiceEmail: quá hạn thì trả emailPending, mail vẫn chạy nền', async () => {
    const slow = new Promise(resolve => setTimeout(() => resolve({ emailSent: true, emailTo: 'a@b.vn' }), 80));
    assert.deepEqual(await waitInvoiceEmail(slow, 10), { emailSent: false, emailPending: true });
    assert.deepEqual(await waitInvoiceEmail(Promise.resolve({ emailSent: true, emailTo: 'a@b.vn' }), 50), { emailSent: true, emailTo: 'a@b.vn' });
    assert.deepEqual(await waitInvoiceEmail(undefined), {});
});

test('getInvoiceEmailStatus: trả kết quả gần nhất theo mã HĐ để desktop poll', async () => {
    const { deps } = mockDeps();
    assert.equal(getInvoiceEmailStatus('HD_CHUA_CO'), null);
    await sendCompletedInvoiceEmail({ maHD: 'HD08' }, deps);
    assert.deepEqual(getInvoiceEmailStatus('HD08'), { emailSent: true, emailTo: 'khach@example.com' });
});

test('Hook nằm trong completeInvoiceInternal, chỉ ở nhánh vừa chuyển Hoàn thành; caller không lộ Promise', () => {
    const src = fs.readFileSync(path.join(__dirname, 'src/controllers/salesController.js'), 'utf8');
    const body = src.slice(src.indexOf('const completeInvoiceInternal'), src.indexOf('const completeInvoice = async'));
    const alreadyIdx = body.indexOf('alreadyCompleted: true');
    const updateIdx = body.indexOf("UPDATE HoaDon SET TrangThai=N'Hoàn thành'");
    const hookIdx = body.indexOf('scheduleInvoiceEmailAfterCommit(transaction');
    assert.ok(alreadyIdx > 0 && updateIdx > alreadyIdx && hookIdx > updateIdx, 'hook phải sau UPDATE Hoàn thành, không ở nhánh đã hoàn thành');
    assert.match(body, /enumerable: false/);
    assert.equal((src.match(/scheduleInvoiceEmailAfterCommit\(/g) || []).length, 1, 'chỉ một điểm hẹn gửi');
    const complete = src.slice(src.indexOf('const completeInvoice = async'));
    assert.ok(complete.indexOf('await transaction.commit()') < complete.indexOf('waitInvoiceEmail(result.invoiceEmail)'));
    const routes = fs.readFileSync(path.join(__dirname, 'src/routes/cashierRoutes.js'), 'utf8');
    assert.match(routes, /router\.get\('\/invoices\/:id\/email-status', requirePermission\('UC24'\), sales\.invoiceEmailStatus\)/);
    const ui = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/cashier/cashier-pages.js'), 'utf8');
    assert.match(ui, /Đã gửi hóa đơn tới/);
    assert.match(ui, /Chưa gửi được email, hóa đơn vẫn đã thanh toán/);
    assert.match(ui, /data-email-invoice/, 'nút Gửi email tay vẫn còn');
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
