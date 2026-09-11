const UC_SHORT = {
    UC01: 'đăng nhập',
    UC02: 'quản lý tài khoản',
    UC03: 'nhật ký hệ thống',
    UC04: 'nhân viên, sản phẩm, khuyến mãi',
    UC05: 'duyệt đơn mua',
    UC06: 'duyệt phiếu xuất',
    UC07: 'duyệt điều chỉnh tồn',
    UC08: 'duyệt đổi trả',
    UC09: 'duyệt phiếu chi',
    UC10: 'dashboard và báo cáo',
    UC11: 'nhà cung cấp',
    UC12: 'đề nghị mua từ kho',
    UC13: 'đơn mua hàng',
    UC14: 'theo dõi giao hàng',
    UC15: 'tồn kho chi tiết',
    UC16: 'lập đề nghị mua',
    UC17: 'nhận hàng',
    UC18: 'phiếu nhập kho',
    UC19: 'phiếu xuất kho',
    UC20: 'kiểm kê',
    UC21: 'kiểm tra đổi trả',
    UC22: 'ca bán hàng',
    UC23: 'khách hàng tại quầy',
    UC24: 'lập hóa đơn',
    UC25: 'thanh toán hóa đơn',
    UC26: 'đổi trả tại quầy',
    UC27: 'đối chiếu hóa đơn mua',
    UC28: 'công nợ nhà cung cấp',
    UC29: 'phiếu thu ca',
    UC30: 'phân ca',
    UC31: 'lịch và chấm công',
    UC32: 'duyệt công',
    UC33: 'bảng lương',
    UC34: 'hệ thống tài khoản',
    UC35: 'kỳ kế toán',
    UC36: 'chi phí vận hành',
    UC37: 'chờ ghi sổ',
    UC38: 'sổ kế toán',
    UC39: 'khóa kỳ',
    UC40: 'bảng kê VAT',
    UC41: 'tài sản cố định',
    UC42: 'sao kê ngân hàng',
    UC43: 'kết quả kinh doanh'
};

const ROLE_SPEECH = {
    'quản lý': {
        can: 'xem dashboard, chờ duyệt, hóa đơn, phiếu nhập/xuất, đơn mua, đổi trả, phiếu thu/chi, công nợ, báo cáo tháng, KQKD, lương gộp',
        cannot: 'Không xem tồn kho chi tiết toàn hàng, không danh sách chờ ghi sổ, không nhập sao kê ngân hàng, không lương từng nhân viên'
    },
    'nhân viên mua hàng': {
        can: 'xem đề nghị từ kho, lập và theo dõi đơn mua, nhà cung cấp',
        cannot: 'Không duyệt đơn mua, không xem tồn kho chi tiết toàn hàng'
    },
    'thủ kho': {
        can: 'xem tồn kho, đề nghị mua, nhận hàng, phiếu xuất, kiểm kê',
        cannot: 'Không duyệt đơn mua, không xem sổ cái'
    },
    'thu ngân': {
        can: 'xem ca bán hàng, hóa đơn, khách hàng tại quầy',
        cannot: 'Không xem công nợ nhà cung cấp, không xem sổ cái'
    },
    'kế toán': {
        can: 'xem công nợ, chờ ghi sổ, kết quả kinh doanh, sao kê ngân hàng, bảng lương',
        cannot: 'Không duyệt đơn mua hộ quản lý'
    }
};

const SOURCE_RULES = [
    [/notifications/i, 'Hộp thư'],
    [/admin\/dashboard|dashboard quản lý/i, 'Dashboard quản lý'],
    [/approvals/i, 'Hàng chờ duyệt'],
    [/store-profit-loss|income-statement|\bkqkd\b|lãi lỗ/i, 'KQKD'],
    [/payables|công nợ/i, 'Công nợ'],
    [/cash-flow|lưu chuyển/i, 'Lưu chuyển tiền tệ'],
    [/sales-shifts|báo cáo ca/i, 'Báo cáo ca'],
    [/purchase-requests|đề nghị mua/i, 'Đề nghị mua hàng'],
    [/purchase-orders|đơn mua/i, 'Đơn mua hàng'],
    [/warehouse\/dashboard|tổng quan kho/i, 'Tổng quan kho'],
    [/warehouse\/inventory|tồn kho/i, 'Tồn kho'],
    [/shifts\/current|ca bán|tóm tắt ca/i, 'Ca bán hàng'],
    [/unposted|chờ ghi sổ/i, 'Chờ ghi sổ'],
    [/purchase-invoices|hóa đơn mua/i, 'Hóa đơn mua'],
    [/shift-settlements|phiếu thu/i, 'Ca và phiếu thu'],
    [/reconciliation|đối soát/i, 'Đối soát ngân hàng'],
    [/loyalty|khách hàng thân thiết|rfm/i, 'Khách hàng thân thiết']
];

const padUc = (num) => `UC${String(Number(num)).padStart(2, '0')}`;

const labelOf = (code) => UC_SHORT[String(code || '').toUpperCase()] || '';

const replaceUcCodes = (value) => {
    let out = String(value ?? '');
    out = out.replace(/\bUC\s*0*(\d{1,2})\s*[–—−-]\s*UC\s*0*(\d{1,2})\b/gi, (_, a, b) => {
        const start = UC_SHORT[padUc(a)];
        const end = UC_SHORT[padUc(b)];
        if (start && end) return `${start} đến ${end}`;
        return 'các chức năng được cấp';
    });
    out = out.replace(/\bUC\s*0*(\d{1,2})\b/gi, (_, n) => UC_SHORT[padUc(n)] || 'chức năng được cấp');
    out = out.replace(/\buse[\s-]*cases?\b/gi, '');
    out = out.replace(/\(\s*\)/g, '');
    out = out.replace(/[^\S\n]{2,}/g, ' ');
    out = out.replace(/[ \t]+\n/g, '\n');
    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.replace(/[ \t]+([,.;:!?])/g, '$1');
    return out.trim();
};

const hideApiPaths = (value) => String(value ?? '')
    .replace(/\bGET\s+\/api\/[^\s,;)]+/gi, '')
    .replace(/\/api\/[a-z0-9/_\-?=&%.]+/gi, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .trim();

const sanitizeAssistantText = (value) => hideApiPaths(replaceUcCodes(value));

const describeAccess = (user, codes) => {
    const role = String(user?.TenVaiTro || user?.roleLabel || 'nhân viên').trim() || 'nhân viên';
    const key = role.toLocaleLowerCase('vi-VN');
    const speech = ROLE_SPEECH[key];
    const names = [...new Set((codes || []).map(labelOf).filter(Boolean))];
    const parts = [`Bạn đang đăng nhập ${role}.`];
    if (speech) {
        parts.push(`Có thể ${speech.can}.`);
        parts.push(`${speech.cannot}.`);
    }
    if (names.length) parts.push(`Chi tiết quyền: ${names.join(', ')}.`);
    return parts.join(' ');
};

const sourceLabel = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return '';
    for (const [re, label] of SOURCE_RULES) {
        if (re.test(text)) return label;
    }
    if (/\/api\//i.test(text) || /^GET\s+/i.test(text)) return 'Số liệu hệ thống';
    return sanitizeAssistantText(text);
};

const humanizeSources = (list) => {
    const seen = new Set();
    const out = [];
    for (const item of list || []) {
        const label = sourceLabel(item);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        out.push(label);
    }
    return out;
};

const humanizeEvidence = (rows) => (rows || []).map((row) => ({
    ...row,
    claim: sanitizeAssistantText(row.claim || ''),
    evidence: sanitizeAssistantText(row.evidence || ''),
    source: sourceLabel(row.source || ''),
    numbers: Array.isArray(row.numbers)
        ? row.numbers.map((item) => sanitizeAssistantText(item))
        : row.numbers
}));

module.exports = {
    UC_SHORT,
    labelOf,
    replaceUcCodes,
    hideApiPaths,
    sanitizeAssistantText,
    describeAccess,
    sourceLabel,
    humanizeSources,
    humanizeEvidence
};
