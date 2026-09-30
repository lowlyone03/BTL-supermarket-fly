/**
 * Tự gửi email hóa đơn khi completeInvoiceInternal vừa chuyển HĐ Nháp → Hoàn thành
 * và transaction COMMIT thành công. Không bao giờ throw / reject: lỗi SMTP, mạng chỉ ghi
 * nhật ký, hóa đơn và thanh toán giữ nguyên.
 */
const { MailError, resolveInvoiceRecipient, sendInvoiceEmail } = require('./mailService');

const RESULT_TTL_MS = 30 * 60 * 1000;
const MAX_RESULTS = 500;
const DEFAULT_WAIT_MS = 4000;
const SKIP_CODES = new Set([
    'NO_CUSTOMER', 'NO_CUSTOMER_EMAIL', 'INVALID_CUSTOMER_EMAIL',
    'SMTP_NOT_CONFIGURED', 'INVOICE_NOT_COMPLETED', 'INVOICE_NOT_FOUND'
]);

const results = new Map();

const remember = (maHD, value) => {
    results.delete(maHD);
    if (results.size >= MAX_RESULTS) results.delete(results.keys().next().value);
    results.set(maHD, { ...value, at: Date.now() });
    return value;
};

/** Kết quả tự gửi gần nhất của HĐ (bộ nhớ tiến trình, mất khi khởi động lại server). */
const getInvoiceEmailStatus = (maHD) => {
    const row = results.get(maHD);
    if (!row) return null;
    if (Date.now() - row.at > RESULT_TTL_MS) {
        results.delete(maHD);
        return null;
    }
    const { at, ...status } = row;
    return status;
};

const loadInvoiceForEmail = async (maHD) => {
    const { sql, poolPromise } = require('../config/db');
    const pool = await poolPromise;
    const header = await pool.request().input('MaHD', sql.VarChar, maHD).query(`
        SELECT hd.MaHD,hd.MaKH,hd.MaNV,hd.MaCa,hd.NgayLap,hd.TrangThai,hd.TongTienHang,hd.TienGiamGia,
               hd.TienDiemQuyDoi,hd.TongThanhToan,hd.DiemCong,kh.TenKH,kh.SDT,kh.Email AS EmailKH,
               nv.TenNV,ca.MaQuay
        FROM HoaDon hd
        LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
        LEFT JOIN NhanVien nv ON nv.MaNV=hd.MaNV
        LEFT JOIN CaLamViec ca ON ca.MaCa=hd.MaCa
        WHERE hd.MaHD=@MaHD`);
    const invoice = header.recordset[0];
    if (!invoice || !invoice.MaKH || !String(invoice.EmailKH || '').trim()) return { invoice, lines: [], payments: [] };
    const [lines, payments] = await Promise.all([
        pool.request().input('MaHD', sql.VarChar, maHD).query(`
            SELECT ct.MaSP,sp.TenSP,sp.DonViTinh,ct.SoLuong,ct.DonGia,ct.GiamGia,ct.ThanhTien
            FROM ChiTietHoaDon ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaHD=@MaHD ORDER BY sp.TenSP`),
        pool.request().input('MaHD', sql.VarChar, maHD).query(`
            SELECT PhuongThuc,NguonXacNhan,MaGiaoDich,SoTien,NgayTT,NgayXacNhan
            FROM ThanhToan WHERE MaHD=@MaHD AND TrangThai=N'Thành công' ORDER BY NgayTT`)
    ]);
    return { invoice, lines: lines.recordset, payments: payments.recordset };
};

const defaultDeps = () => ({
    load: loadInvoiceForEmail,
    send: (payload) => sendInvoiceEmail(payload),
    audit: (entry) => require('./auditLog').logAuditSafe(entry)
});

const safeAudit = async (audit, entry) => {
    try {
        await audit(entry);
    } catch (error) {
        console.error('Không ghi được nhật ký gửi email hóa đơn:', error.message);
    }
};

/** Đọc HĐ đã lưu theo mã rồi gửi. Trả { emailSent, emailTo?, emailError?, emailSkipped? }. */
const sendCompletedInvoiceEmail = async ({ maHD, user, req } = {}, deps = {}) => {
    const { load, send, audit } = { ...defaultDeps(), ...deps };
    remember(maHD, { emailSent: false, emailPending: true });
    let recipient = null;
    try {
        const data = await load(maHD);
        recipient = resolveInvoiceRecipient(data.invoice);
        const sent = await send({ ...data, to: recipient });
        await safeAudit(audit, {
            user, req, action: 'Gửi email hóa đơn', table: 'HoaDon', recordId: maHD, uc: 'UC24',
            content: `Tự gửi hóa đơn sau thanh toán tới ${sent.to}.`
        });
        return remember(maHD, { emailSent: true, emailTo: sent.to });
    } catch (error) {
        if (error instanceof MailError && SKIP_CODES.has(error.code)) {
            if (error.code === 'SMTP_NOT_CONFIGURED') console.warn('Bỏ qua tự gửi email hóa đơn:', error.message);
            return remember(maHD, { emailSent: false, emailSkipped: error.code });
        }
        const message = error instanceof MailError ? error.message : 'Không thể gửi email hóa đơn.';
        if (!(error instanceof MailError)) console.error('Tự gửi email hóa đơn lỗi:', error.message);
        await safeAudit(audit, {
            user, req, action: 'Gửi email hóa đơn', table: 'HoaDon', recordId: maHD, uc: 'UC24',
            result: 'Thất bại', severity: 'Cảnh báo',
            content: `Tự gửi hóa đơn sau thanh toán thất bại${recipient ? ` tới ${recipient}` : ''}: ${message}`
        });
        return remember(maHD, { emailSent: false, emailTo: recipient, emailError: message });
    }
};

/**
 * Hẹn gửi sau khi `transaction` COMMIT. Rollback → không gửi.
 * Promise luôn resolve, kể cả khi SMTP lỗi.
 */
const scheduleInvoiceEmailAfterCommit = (transaction, { maHD, user, req } = {}, deps = {}) => {
    if (!transaction || typeof transaction.once !== 'function') {
        return Promise.resolve({ emailSent: false, emailSkipped: 'NO_TRANSACTION' });
    }
    return new Promise((resolve) => {
        const onCommit = () => {
            transaction.removeListener('rollback', onRollback);
            resolve(sendCompletedInvoiceEmail({ maHD, user, req }, deps));
        };
        const onRollback = () => {
            transaction.removeListener('commit', onCommit);
            resolve({ emailSent: false, emailSkipped: 'ROLLED_BACK' });
        };
        transaction.once('commit', onCommit);
        transaction.once('rollback', onRollback);
    });
};

/** Chờ kết quả gửi tối đa `ms` để trả kèm response; quá hạn thì báo đang gửi, mail vẫn chạy nền. */
const waitInvoiceEmail = async (promise, ms = DEFAULT_WAIT_MS) => {
    if (!promise) return {};
    let timer = null;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ emailSent: false, emailPending: true }), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
};

module.exports = {
    sendCompletedInvoiceEmail,
    scheduleInvoiceEmailAfterCommit,
    waitInvoiceEmail,
    getInvoiceEmailStatus
};
