/** Gửi hóa đơn cho khách qua Gmail SMTP (Nodemailer). Cấu hình đọc từ server/.env. */

const { EMAIL_RE } = require('./fieldValidators');

const DEFAULT_STORE_NAME = 'Supermarket Fly';
const SEND_TIMEOUT_MS = 20000;

class MailError extends Error {
    constructor(message, status = 400, code = 'MAIL_ERROR') {
        super(message);
        this.name = 'MailError';
        this.status = status;
        this.code = code;
    }
}

const readSmtpConfig = (env = process.env) => {
    const user = String(env.SMTP_USER || '').trim();
    const pass = String(env.SMTP_PASS || '').replace(/\s+/g, '');
    if (!user || !pass) {
        throw new MailError(
            'Chưa cấu hình Gmail SMTP trong server/.env (cần SMTP_USER và SMTP_PASS là mật khẩu ứng dụng Google). Điền xong rồi khởi động lại máy chủ.',
            503,
            'SMTP_NOT_CONFIGURED'
        );
    }
    const port = Number(env.SMTP_PORT) || 587;
    const secureRaw = String(env.SMTP_SECURE ?? '').trim().toLowerCase();
    const secure = secureRaw ? ['1', 'true', 'yes'].includes(secureRaw) : port === 465;
    return {
        host: String(env.SMTP_HOST || '').trim() || 'smtp.gmail.com',
        port,
        secure,
        user,
        pass,
        from: String(env.MAIL_FROM || '').trim() || user
    };
};

const storeNameFrom = (from) => {
    const match = String(from || '').match(/^\s*"?([^"<]+?)"?\s*</);
    return match ? match[1].trim() : DEFAULT_STORE_NAME;
};

/** Hóa đơn phải có khách và khách phải có email hợp lệ; trả về email đã chuẩn hóa. */
const resolveInvoiceRecipient = (invoice) => {
    if (!invoice) throw new MailError('Không tìm thấy hóa đơn.', 404, 'INVOICE_NOT_FOUND');
    if (invoice.TrangThai !== 'Hoàn thành') {
        throw new MailError(`Chỉ gửi email hóa đơn đã hoàn thành. Hóa đơn ${invoice.MaHD} đang ở trạng thái ${invoice.TrangThai || 'không rõ'}.`, 409, 'INVOICE_NOT_COMPLETED');
    }
    if (!invoice.MaKH) {
        throw new MailError(`Hóa đơn ${invoice.MaHD} là khách vãng lai, không có email để gửi.`, 400, 'NO_CUSTOMER');
    }
    const email = String(invoice.EmailKH || '').trim();
    if (!email) {
        throw new MailError(`Khách ${invoice.TenKH || invoice.MaKH} chưa có email. Cập nhật email trong Khách hàng rồi gửi lại.`, 400, 'NO_CUSTOMER_EMAIL');
    }
    if (!EMAIL_RE.test(email)) {
        throw new MailError(`Email của khách (${email}) không đúng định dạng. Sửa trong Khách hàng rồi gửi lại.`, 400, 'INVALID_CUSTOMER_EMAIL');
    }
    return email;
};

const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const money = value => `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}đ`;

const dateParts = (value) => {
    if (!value) return null;
    const dt = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return Object.fromEntries(new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh'
    }).formatToParts(dt).map(part => [part.type, part.value]));
};

const formatDate = (value) => {
    const parts = dateParts(value);
    if (!parts) return value ? String(value) : '';
    return `${parts.day}/${parts.month}/${parts.year} · ${parts.hour}:${parts.minute}`;
};

const formatTime = (value) => {
    const parts = dateParts(value);
    return parts ? `${parts.hour}:${parts.minute}` : '';
};

/** Chỉ che giữa số để thư chuyển tiếp không lộ đủ SĐT khách. */
const maskPhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 7) return digits;
    return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
};

const paymentLabel = (payment) => {
    const method = String(payment?.PhuongThuc || '').trim();
    if (method === 'QR') return String(payment?.NguonXacNhan || '').trim() || 'QR chuyển khoản';
    return method || 'Thanh toán';
};

/** Cùng tông theme.css của desktop (sidebar xanh đậm Supermarket Fly). */
const THEME = {
    brand: '#173f34',
    brandSoft: '#1c4a3d',
    accent: '#36a878',
    positive: '#2b7d60',
    headerMuted: '#b8cac1',
    page: '#eef3ef',
    soft: '#f6f9f7',
    tint: '#e6f0e9',
    ink: '#18251f',
    muted: '#66736c',
    line: '#dfe4df',
    discount: '#b9543e'
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

const buildInvoiceEmail = ({ invoice, lines = [], payments = [], storeName = DEFAULT_STORE_NAME }) => {
    const inv = invoice || {};
    const c = THEME;
    const store = escapeHtml(storeName);
    const code = escapeHtml(inv.MaHD);
    const paid = inv.TrangThai === 'Hoàn thành';
    const totalQty = lines.reduce((sum, line) => sum + (Number(line.SoLuong) || 0), 0);
    const discount = Number(inv.TienGiamGia) || 0;
    const pointsValue = Number(inv.TienDiemQuyDoi) || 0;
    const saved = discount + pointsValue;
    const phone = maskPhone(inv.SDT);
    const adjustments = [];
    if (discount > 0) adjustments.push(['Giảm giá', `-${money(discount)}`]);
    if (pointsValue > 0) adjustments.push(['Điểm quy đổi', `-${money(pointsValue)}`]);
    const details = [
        ['Thu ngân', inv.TenNV],
        ['Quầy', inv.MaQuay],
        ['Ca bán', inv.MaCa],
        ['Điểm tích lũy cộng', Number(inv.DiemCong) > 0 ? `+${Number(inv.DiemCong)} điểm` : '']
    ].filter(([, value]) => String(value ?? '').trim());
    const lineSub = line => [line.DonViTinh, `${Number(line.SoLuong || 0)} × ${money(line.DonGia)}`]
        .filter(Boolean).join(' · ');

    const sectionLabel = (text, right = '') => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:2px solid ${c.brand};">
        <tr>
          <td style="padding:0 0 8px;font-size:12px;line-height:16px;font-weight:700;color:${c.brand};letter-spacing:1.2px;text-transform:uppercase;">${text}</td>
          ${right ? `<td align="right" style="padding:0 0 8px;font-size:13px;line-height:16px;color:${c.muted};white-space:nowrap;">${right}</td>` : ''}
        </tr>
      </table>`;

    const itemsHtml = lines.map((line, index) => `
        <tr><td style="padding:14px 0;${index < lines.length - 1 ? `border-bottom:1px solid ${c.line};` : ''}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="38" valign="top" style="width:38px;padding-top:1px;">
                <div style="width:26px;height:26px;border-radius:13px;background:${c.tint};color:${c.brand};font-size:13px;line-height:26px;font-weight:700;text-align:center;">${index + 1}</div>
              </td>
              <td valign="top">
                <div style="font-size:16px;line-height:22px;font-weight:600;color:${c.ink};">${escapeHtml(line.TenSP || line.MaSP)}</div>
                <div style="margin-top:3px;font-size:14px;line-height:20px;color:${c.muted};">${escapeHtml(lineSub(line))}</div>
                ${Number(line.GiamGia) > 0 ? `<div style="margin-top:2px;font-size:13px;line-height:18px;color:${c.discount};">Giảm -${money(line.GiamGia)}</div>` : ''}
              </td>
              <td valign="top" align="right" style="padding-left:12px;font-size:16px;line-height:22px;font-weight:700;color:${c.ink};white-space:nowrap;">${money(line.ThanhTien)}</td>
            </tr>
          </table>
        </td></tr>`).join('');

    const summaryRow = (label, value, color = c.ink) => `
        <tr>
          <td style="padding:5px 0;font-size:15px;line-height:22px;color:${c.muted};">${label}</td>
          <td align="right" style="padding:5px 0;font-size:15px;line-height:22px;color:${color};white-space:nowrap;">${value}</td>
        </tr>`;

    const paymentsHtml = payments.length ? `
    <tr><td class="sf-pad" style="padding:6px 32px 18px;">
      ${sectionLabel('Thanh toán')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${payments.map((payment, index) => {
        const meta = [payment.MaGiaoDich ? `Mã GD ${escapeHtml(payment.MaGiaoDich)}` : '', escapeHtml(formatTime(payment.NgayXacNhan || payment.NgayTT))].filter(Boolean).join(' · ');
        return `
        <tr>
          <td style="padding:12px 0;${index < payments.length - 1 ? `border-bottom:1px solid ${c.line};` : ''}">
            <div style="font-size:15px;line-height:22px;font-weight:600;color:${c.ink};">${escapeHtml(paymentLabel(payment))}</div>
            ${meta ? `<div style="font-size:13px;line-height:18px;color:${c.muted};word-break:break-all;">${meta}</div>` : ''}
          </td>
          <td valign="top" align="right" style="padding:12px 0 12px 12px;${index < payments.length - 1 ? `border-bottom:1px solid ${c.line};` : ''}font-size:15px;line-height:22px;font-weight:600;color:${c.ink};white-space:nowrap;">${money(payment.SoTien)}</td>
        </tr>`;
    }).join('')}
      </table>
    </td></tr>` : '';

    const detailsHtml = details.length ? `
    <tr><td class="sf-pad" style="padding:6px 32px 24px;">
      ${sectionLabel('Thông tin giao dịch')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">${details.map(([label, value]) => `
        <tr>
          <td style="padding:5px 0;font-size:14px;line-height:20px;color:${c.muted};">${label}</td>
          <td align="right" style="padding:5px 0 5px 12px;font-size:14px;line-height:20px;font-weight:600;color:${c.ink};">${escapeHtml(value)}</td>
        </tr>`).join('')}
      </table>
    </td></tr>` : '';

    const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Hóa đơn ${code}</title>
<style>
  @media only screen and (max-width:620px) {
    .sf-outer { padding:0 !important; }
    .sf-card { border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
    .sf-pad { padding-left:20px !important; padding-right:20px !important; }
    .sf-stack { display:block !important; width:100% !important; padding:0 0 14px 0 !important; }
    .sf-code { font-size:20px !important; line-height:26px !important; }
    .sf-total { font-size:26px !important; line-height:32px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${c.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Hóa đơn ${code} · ${lines.length} mặt hàng · Tổng thanh toán ${money(inv.TongThanhToan)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.page};">
<tr><td align="center" class="sf-outer" style="padding:28px 12px;">
  <table role="presentation" class="sf-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${c.line};border-radius:14px;overflow:hidden;font-family:${FONT};color:${c.ink};">

    <tr><td class="sf-pad" style="background:${c.brand};padding:28px 32px 30px;">
      <div style="font-size:17px;line-height:22px;font-weight:700;color:#ffffff;letter-spacing:.3px;">
        <span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:${c.accent};margin-right:9px;vertical-align:middle;"></span>${store}
      </div>
      <div style="margin-top:6px;font-size:12px;line-height:16px;font-weight:600;color:${c.headerMuted};letter-spacing:1.6px;text-transform:uppercase;">Hóa đơn bán hàng</div>
      ${paid ? `<div style="margin-top:14px;"><span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${c.accent};color:#ffffff;font-size:11px;line-height:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">&#10003; Đã thanh toán</span></div>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;background:#ffffff;border-radius:10px;border-left:5px solid ${c.accent};">
        <tr><td style="padding:14px 18px 12px;">
          <div style="font-size:11px;line-height:14px;font-weight:700;color:${c.muted};letter-spacing:1.4px;text-transform:uppercase;">Mã hóa đơn</div>
          <div class="sf-code" style="margin-top:4px;font-family:${MONO};font-size:22px;line-height:28px;font-weight:700;color:${c.brand};letter-spacing:1px;word-break:break-all;">${code}</div>
        </td></tr>
        <tr><td style="padding:0 18px;"><div style="border-top:1px dashed ${c.line};height:1px;line-height:1px;font-size:0;">&nbsp;</div></td></tr>
        <tr><td style="padding:10px 18px 14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:13px;line-height:20px;color:${c.muted};">Tổng thanh toán</td>
              <td align="right" style="font-size:17px;line-height:20px;font-weight:700;color:${c.brand};white-space:nowrap;">${money(inv.TongThanhToan)}</td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>

    <tr><td class="sf-pad" style="padding:24px 32px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="sf-stack" width="50%" valign="top" style="padding-right:12px;">
            <div style="font-size:12px;line-height:16px;font-weight:600;color:${c.muted};letter-spacing:1px;text-transform:uppercase;">Thời điểm</div>
            <div style="margin-top:4px;font-size:16px;line-height:22px;font-weight:600;color:${c.ink};">${escapeHtml(formatDate(inv.NgayLap))}</div>
          </td>
          <td class="sf-stack" width="50%" valign="top">
            <div style="font-size:12px;line-height:16px;font-weight:600;color:${c.muted};letter-spacing:1px;text-transform:uppercase;">Khách hàng</div>
            <div style="margin-top:4px;font-size:16px;line-height:22px;font-weight:600;color:${c.ink};">${escapeHtml(inv.TenKH || '')}</div>
            ${phone ? `<div style="margin-top:2px;font-size:14px;line-height:20px;color:${c.muted};">${escapeHtml(phone)}</div>` : ''}
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td class="sf-pad" style="padding:18px 32px 0;">
      ${sectionLabel('Chi tiết hàng', `${lines.length} mặt hàng · ${totalQty} sản phẩm`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${itemsHtml}
      </table>
    </td></tr>

    <tr><td class="sf-pad" style="padding:4px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${c.line};">
        <tr><td colspan="2" style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr>${summaryRow('Tiền hàng', money(inv.TongTienHang))}${adjustments.map(([label, value]) => summaryRow(label, value, c.discount)).join('')}
      </table>
    </td></tr>

    <tr><td class="sf-pad" style="padding:14px 32px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.tint};border-radius:12px;">
        <tr><td style="padding:18px 20px;">
          <div style="font-size:13px;line-height:18px;font-weight:700;color:${c.brandSoft};letter-spacing:1.2px;text-transform:uppercase;">Tổng thanh toán</div>
          <div class="sf-total" style="margin-top:4px;font-size:30px;line-height:36px;font-weight:800;color:${c.brand};white-space:nowrap;">${money(inv.TongThanhToan)}</div>
          ${saved > 0 ? `<div style="margin-top:4px;font-size:14px;line-height:20px;font-weight:600;color:${c.positive};">Quý khách đã tiết kiệm ${money(saved)}</div>` : ''}
        </td></tr>
      </table>
    </td></tr>
${paymentsHtml}${detailsHtml}
    <tr><td class="sf-pad" align="center" style="background:${c.soft};padding:22px 32px 26px;border-top:1px solid ${c.line};text-align:center;">
      <div style="font-size:15px;line-height:22px;font-weight:600;color:${c.brand};">Cảm ơn quý khách đã mua sắm tại ${store}!</div>
      <div style="margin-top:6px;font-size:12px;line-height:18px;color:${c.muted};">Email tự động, vui lòng không trả lời.</div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

    const heavy = '================================';
    const rule = '--------------------------------';
    const text = [
        storeName.toUpperCase(),
        `HÓA ĐƠN BÁN HÀNG${paid ? ' — ĐÃ THANH TOÁN' : ''}`,
        '',
        `Mã hóa đơn: ${inv.MaHD || ''}`,
        `Thời điểm:  ${formatDate(inv.NgayLap)}`,
        `Khách hàng: ${inv.TenKH || ''}${phone ? ` (${phone})` : ''}`,
        heavy,
        `CHI TIẾT HÀNG (${lines.length} mặt hàng, ${totalQty} sản phẩm)`,
        ...lines.flatMap((line, index) => [
            `${index + 1}. ${line.TenSP || line.MaSP}`,
            `   ${lineSub(line).replace('×', 'x')} = ${money(line.ThanhTien)}`,
            ...(Number(line.GiamGia) > 0 ? [`   Giảm -${money(line.GiamGia)}`] : [])
        ]),
        rule,
        `Tiền hàng: ${money(inv.TongTienHang)}`,
        ...adjustments.map(([label, value]) => `${label}: ${value}`),
        `TỔNG THANH TOÁN: ${money(inv.TongThanhToan)}`,
        ...(saved > 0 ? [`Quý khách đã tiết kiệm ${money(saved)}`] : []),
        ...(payments.length ? [
            heavy,
            'THANH TOÁN',
            ...payments.map(payment => {
                const meta = [payment.MaGiaoDich ? `Mã GD ${payment.MaGiaoDich}` : '', formatTime(payment.NgayXacNhan || payment.NgayTT)].filter(Boolean).join(', ');
                return `- ${paymentLabel(payment)}: ${money(payment.SoTien)}${meta ? ` (${meta})` : ''}`;
            })
        ] : []),
        ...(details.length ? [heavy, 'THÔNG TIN GIAO DỊCH', ...details.map(([label, value]) => `${label}: ${value}`)] : []),
        '',
        `Cảm ơn quý khách đã mua sắm tại ${storeName}!`,
        'Email tự động, vui lòng không trả lời.'
    ].join('\n');
    return {
        subject: `[${storeName}] Hóa đơn ${inv.MaHD || ''}`.trim(),
        html,
        text
    };
};

const createTransport = (config) => require('nodemailer').createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS
});

const smtpErrorMessage = (error) => {
    const code = String(error?.code || '');
    const response = String(error?.response || error?.message || '');
    if (code === 'EAUTH' || /535|534|Username and Password not accepted|Application-specific password/i.test(response)) {
        return 'Gmail từ chối đăng nhập. Kiểm tra SMTP_USER và SMTP_PASS (phải là mật khẩu ứng dụng 16 ký tự, tài khoản đã bật xác minh 2 bước).';
    }
    if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'ENOTFOUND', 'EDNS'].includes(code)) {
        return 'Không kết nối được máy chủ Gmail SMTP. Kiểm tra mạng Internet, SMTP_HOST/SMTP_PORT rồi thử lại.';
    }
    if (code === 'EENVELOPE' || /550|553/.test(response)) {
        return 'Gmail không chấp nhận địa chỉ nhận. Kiểm tra lại email của khách.';
    }
    if (/limit|quota|454|421/i.test(response)) {
        return 'Gmail đang giới hạn gửi (quá số thư cho phép). Thử lại sau.';
    }
    return `Gửi email thất bại: ${response.slice(0, 200) || 'lỗi không rõ'}.`;
};

/**
 * Gửi hóa đơn tới email khách. `transport` chỉ truyền khi test (mock), mặc định tạo từ env.
 * Lỗi SMTP được đổi sang MailError tiếng Việt; không đụng dữ liệu hóa đơn.
 */
const sendInvoiceEmail = async ({ invoice, lines = [], payments = [], to }, { env = process.env, transport = null } = {}) => {
    const config = readSmtpConfig(env);
    const recipient = to || resolveInvoiceRecipient(invoice);
    if (!EMAIL_RE.test(String(recipient || ''))) {
        throw new MailError('Email người nhận không đúng định dạng.', 400, 'INVALID_CUSTOMER_EMAIL');
    }
    const storeName = storeNameFrom(config.from);
    const message = buildInvoiceEmail({ invoice, lines, payments, storeName });
    const mailer = transport || createTransport(config);
    try {
        const info = await mailer.sendMail({
            from: config.from,
            to: recipient,
            subject: message.subject,
            html: message.html,
            text: message.text
        });
        return { to: recipient, messageId: info?.messageId || null };
    } catch (error) {
        throw new MailError(smtpErrorMessage(error), 502, 'SMTP_SEND_FAILED');
    } finally {
        if (!transport && typeof mailer.close === 'function') mailer.close();
    }
};

module.exports = {
    MailError,
    readSmtpConfig,
    resolveInvoiceRecipient,
    buildInvoiceEmail,
    sendInvoiceEmail,
    storeNameFrom,
    smtpErrorMessage
};
