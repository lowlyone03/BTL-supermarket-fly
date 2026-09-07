const {
    formatMoney, formatTelegramDate, formatTelegramValue
} = require('./telegramMessages');

const PAGE_W = 1000;
const PAGE_H = 1414;
const MARGIN = 44;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MAX_DOC_LINES = 80;
const PRODUCT_IMAGE_RE = /san-pham-|\/uploads\/products\/|\\uploads\\products\\/i;

const xml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const clip = (value, max) => {
    const text = String(value ?? '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(1, max - 1))}…`;
};

const isProductImagePath = (value) => {
    if (value == null || Buffer.isBuffer(value)) return false;
    if (typeof value === 'object') {
        if (value.isPaper || Buffer.isBuffer(value.buffer)) return false;
        return PRODUCT_IMAGE_RE.test([value.path, value.filename, value.name, value.url]
            .filter(Boolean).join(' '));
    }
    return PRODUCT_IMAGE_RE.test(String(value));
};

const qtyOf = (row) => row.SoLuong ?? row.SL ?? row.SoLuongChapNhan ?? row.SLThucTe;
const priceOf = (row) => row.DonGia ?? row.DonGiaNhap ?? row.DonGiaVon ?? 0;
const amountOf = (row) => {
    if (row.ThanhTien != null) return Number(row.ThanhTien);
    if (row.ThanhTienPhieuNhap != null) return Number(row.ThanhTienPhieuNhap);
    return Number(qtyOf(row) || 0) * Number(priceOf(row) || 0);
};

const isApprovedStatus = (status) =>
    /đã duyệt|đã xác nhận|đã thanh toán|thành công|đã đối chiếu|approved|paid/i.test(String(status || ''));

const safeFilePart = (value) => String(value || 'ct')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'ct';

const iconStore = (x, y, s = 1) => `
  <g transform="translate(${x},${y}) scale(${s})">
    <rect x="1" y="12" width="22" height="12" rx="1.4" fill="#1d5c45"/>
    <path d="M1 12 L12 3 L23 12 Z" fill="#267b5b"/>
    <rect x="9.2" y="16" width="5.6" height="8" fill="#fff6dc"/>
    <rect x="4" y="15" width="4" height="4" fill="#d9efe6"/>
    <rect x="16" y="15" width="4" height="4" fill="#d9efe6"/>
  </g>`;

const iconBox = (x, y, s = 0.85) => `
  <g transform="translate(${x},${y}) scale(${s})">
    <path d="M4 9 L12 5 L20 9 L12 13 Z" fill="#e7f3ed" stroke="#1d5c45" stroke-width="1.3"/>
    <path d="M4 9 L4 17 L12 21 L12 13 Z" fill="#d3e8de" stroke="#1d5c45" stroke-width="1.3"/>
    <path d="M20 9 L20 17 L12 21 L12 13 Z" fill="#c4ddd2" stroke="#1d5c45" stroke-width="1.3"/>
  </g>`;

const iconMoney = (x, y, s = 0.85) => `
  <g transform="translate(${x},${y}) scale(${s})">
    <circle cx="12" cy="12" r="10" fill="#f6e7b4" stroke="#b8860b" stroke-width="1.4"/>
    <text x="12" y="16.2" text-anchor="middle" font-size="11" font-weight="700" fill="#7a5f0c" font-family="Segoe UI, Tahoma, Arial, sans-serif">đ</text>
  </g>`;

const iconCheck = (x, y, s = 0.8) => `
  <g transform="translate(${x},${y}) scale(${s})">
    <circle cx="12" cy="12" r="10" fill="#1d5c45"/>
    <path d="M7 12.4 L10.6 16 L17.2 8.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

const tableColumns = (mode) => {
    if (mode === 'count') {
        return [
            { key: 'stt', label: 'STT', w: 48, align: 'middle' },
            { key: 'ma', label: 'Mã', w: 100, align: 'start' },
            { key: 'ten', label: 'Tên hàng', w: 356, align: 'start' },
            { key: 'ht', label: 'HT', w: 100, align: 'end' },
            { key: 'tt', label: 'TT', w: 100, align: 'end' },
            { key: 'lech', label: 'Lệch', w: 108, align: 'end' }
        ];
    }
    if (mode === 'receipt') {
        return [
            { key: 'stt', label: 'STT', w: 44, align: 'middle' },
            { key: 'ma', label: 'Mã', w: 86, align: 'start' },
            { key: 'ten', label: 'Tên hàng', w: 280, align: 'start' },
            { key: 'giao', label: 'Giao', w: 78, align: 'end' },
            { key: 'nhap', label: 'Nhập', w: 78, align: 'end' },
            { key: 'tuchoi', label: 'Từ chối', w: 86, align: 'end' },
            { key: 'tien', label: 'Thành tiền', w: 160, align: 'end' }
        ];
    }
    if (mode === 'return') {
        return [
            { key: 'stt', label: 'STT', w: 48, align: 'middle' },
            { key: 'loai', label: 'Loại', w: 110, align: 'start' },
            { key: 'ma', label: 'Mã', w: 90, align: 'start' },
            { key: 'ten', label: 'Tên hàng', w: 336, align: 'start' },
            { key: 'sl', label: 'SL', w: 80, align: 'end' },
            { key: 'tien', label: 'Thành tiền', w: 148, align: 'end' }
        ];
    }
    return [
        { key: 'stt', label: 'STT', w: 48, align: 'middle' },
        { key: 'ma', label: 'Mã', w: 90, align: 'start' },
        { key: 'ten', label: 'Tên hàng', w: 380, align: 'start' },
        { key: 'sl', label: 'SL', w: 80, align: 'end' },
        { key: 'dg', label: 'Đơn giá', w: 140, align: 'end' },
        { key: 'tien', label: 'Thành tiền', w: 166, align: 'end' }
    ];
};

const cellValue = (row, index, key, mode) => {
    if (key === 'stt') return String(index + 1);
    if (key === 'ma') return clip(row.MaSP || `#${index + 1}`, 12);
    if (key === 'ten') return clip(row.TenSP || row.TenHang || '', mode === 'receipt' ? 28 : 34);
    if (key === 'loai') return clip(row.LoaiDong || '', 12);
    if (key === 'sl') return String(qtyOf(row) ?? '—');
    if (key === 'dg') return formatMoney(priceOf(row));
    if (key === 'tien') return formatMoney(amountOf(row));
    if (key === 'giao') return String(row.SoLuongGiao ?? '—');
    if (key === 'nhap') return String(row.SoLuongChapNhan ?? '—');
    if (key === 'tuchoi') return String(row.SoLuongTuChoi ?? 0);
    if (key === 'ht') return String(row.SLHeThong ?? '—');
    if (key === 'tt') return String(row.SLThucTe ?? '—');
    if (key === 'lech') return String(row.ChenhLech ?? '—');
    return '';
};

const textAnchor = (align) => {
    if (align === 'end') return { anchor: 'end', pad: -8 };
    if (align === 'middle') return { anchor: 'middle', pad: 0 };
    return { anchor: 'start', pad: 8 };
};

const captionFor = (doc = {}, lang = 'vi', page = 1, totalPages = 1) => {
    const title = String(doc.title || 'CHỨNG TỪ').toUpperCase();
    const number = doc.number || doc.id || '';
    const when = formatTelegramDate(doc.date, lang) || '';
    const pageBit = totalPages > 1 ? ` · ${page}/${totalPages}` : '';
    return clip(`📄 ${title}${number ? ` · ${number}` : ''}${when ? ` · ${when}` : ''}${pageBit}`, 180);
};

const splitLineChunks = (lines, fieldsCount) => {
    const fieldH = Math.max(0, fieldsCount) * 26;
    const firstTake = Math.max(6, Math.floor((PAGE_H - 430 - fieldH) / 26));
    const nextTake = Math.max(10, Math.floor((PAGE_H - 300) / 26));
    if (!lines.length) return [[]];
    const chunks = [];
    let index = 0;
    let take = firstTake;
    while (index < lines.length) {
        chunks.push(lines.slice(index, index + take));
        index += take;
        take = nextTake;
    }
    return chunks.length ? chunks : [[]];
};

const buildVoucherSvg = (doc = {}, options = {}) => {
    const pages = buildVoucherSvgs(doc, options);
    return pages[0] || '';
};

const buildVoucherSvgs = (doc = {}, options = {}) => {
    const lang = options.lang || 'vi';
    const title = String(doc.title || 'CHỨNG TỪ').toUpperCase();
    const number = doc.number || doc.id || '—';
    const when = formatTelegramDate(doc.date, lang) || '';
    const status = doc.status ? String(doc.status) : '';
    const approved = isApprovedStatus(status);
    const mode = doc.lineMode || 'sale';
    const cols = tableColumns(mode);
    const fields = (Array.isArray(doc.fields) ? doc.fields : [])
        .filter(item => item && item.value != null && item.value !== '');
    const totals = Array.isArray(doc.totals) ? doc.totals.filter(Boolean) : [];
    const lines = Array.isArray(doc.lines) ? doc.lines.slice(0, MAX_DOC_LINES) : [];
    const note = doc.note ? clip(String(doc.note), 180) : '';
    const chunks = splitLineChunks(lines, fields.length);
    const totalPages = chunks.length;

    return chunks.map((chunk, pageIndex) => {
        const page = pageIndex + 1;
        const showFields = page === 1;
        const showTotals = page === totalPages;
        let y = MARGIN;
        const parts = [];

        parts.push(`<rect x="18" y="18" width="${PAGE_W - 36}" height="${PAGE_H - 36}" fill="#ffffff" stroke="#c3cfc8" stroke-width="1.4"/>`);
        parts.push(`<rect x="26" y="26" width="${PAGE_W - 52}" height="${PAGE_H - 52}" fill="none" stroke="#e1e8e4" stroke-width="0.8"/>`);

        parts.push(`<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="54" rx="6" fill="#f3f8f5"/>`);
        parts.push(iconStore(MARGIN + 10, y + 12, 1.15));
        parts.push(`<text x="${MARGIN + 48}" y="${y + 24}" font-size="18" font-weight="700" fill="#16382c">SUPERMARKET FLY · Hà Nội</text>`);
        parts.push(`<text x="${MARGIN + 48}" y="${y + 44}" font-size="12" fill="#5d6f67">Giấy chứng từ nội bộ · không phải ảnh sản phẩm</text>`);
        y += 72;
        parts.push(`<line x1="${MARGIN}" y1="${y}" x2="${PAGE_W - MARGIN}" y2="${y}" stroke="#1d5c45" stroke-width="2"/>`);
        y += 36;

        parts.push(`<text x="${PAGE_W / 2}" y="${y}" text-anchor="middle" font-size="26" font-weight="700" fill="#16382c">${xml(title)}</text>`);
        y += 28;
        const meta = [`Số ${number}`, when, status].filter(Boolean).join('   ·   ');
        parts.push(`<text x="${PAGE_W / 2}" y="${y}" text-anchor="middle" font-size="14" fill="#3d5249">${xml(meta)}</text>`);
        if (approved) {
            parts.push(iconCheck(PAGE_W - MARGIN - 120, y - 20, 0.9));
            parts.push(`<text x="${PAGE_W - MARGIN - 92}" y="${y}" font-size="13" font-weight="700" fill="#1d5c45">Đã duyệt</text>`);
        }
        y += 22;
        parts.push(`<line x1="${MARGIN + 80}" y1="${y}" x2="${PAGE_W - MARGIN - 80}" y2="${y}" stroke="#d5ded9" stroke-width="1"/>`);
        y += 20;

        if (showFields) {
            for (const field of fields) {
                const label = clip(String(field.label || ''), 28);
                const value = clip(formatTelegramValue(field.value, lang), 52);
                parts.push(`<text x="${MARGIN}" y="${y}" font-size="13" font-weight="700" fill="#1a2e26">${xml(label)}</text>`);
                parts.push(`<text x="${MARGIN + 230}" y="${y}" font-size="13" fill="#243830">${xml(value)}</text>`);
                y += 26;
            }
            if (fields.length) y += 8;
        }

        if (lines.length || chunk.length) {
            parts.push(iconBox(MARGIN - 2, y - 16, 0.85));
            const extra = lines.length > MAX_DOC_LINES ? '+' : '';
            parts.push(`<text x="${MARGIN + 26}" y="${y}" font-size="14" font-weight="700" fill="#16382c">Dòng hàng (${lines.length}${extra})</text>`);
            y += 14;

            let x = MARGIN;
            parts.push(`<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="28" fill="#e8f1ec"/>`);
            for (const col of cols) {
                const { anchor, pad } = textAnchor(col.align);
                const tx = col.align === 'middle' ? x + col.w / 2 : x + (col.align === 'end' ? col.w + pad : pad);
                parts.push(`<text x="${tx}" y="${y + 19}" text-anchor="${anchor}" font-size="11" font-weight="700" fill="#315343">${xml(col.label)}</text>`);
                x += col.w;
            }
            y += 28;

            chunk.forEach((row, localIndex) => {
                const globalIndex = chunks.slice(0, pageIndex).reduce((sum, part) => sum + part.length, 0) + localIndex;
                if (localIndex % 2 === 1) {
                    parts.push(`<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="26" fill="#f7faf8"/>`);
                }
                x = MARGIN;
                for (const col of cols) {
                    const { anchor, pad } = textAnchor(col.align);
                    const tx = col.align === 'middle' ? x + col.w / 2 : x + (col.align === 'end' ? col.w + pad : pad);
                    parts.push(`<text x="${tx}" y="${y + 18}" text-anchor="${anchor}" font-size="12" fill="#1a2e26">${xml(cellValue(row, globalIndex, col.key, mode))}</text>`);
                    x += col.w;
                }
                y += 26;
            });
            parts.push(`<rect x="${MARGIN}" y="${y - chunk.length * 26 - 28}" width="${CONTENT_W}" height="${chunk.length * 26 + 28}" fill="none" stroke="#d5dfda"/>`);
            y += 16;
            if (lines.length > MAX_DOC_LINES && page === totalPages) {
                parts.push(`<text x="${MARGIN}" y="${y}" font-size="12" fill="#5d6f67">… còn ${lines.length - MAX_DOC_LINES} dòng — xem đủ trên Fly.</text>`);
                y += 20;
            }
        }

        if (showTotals && totals.length) {
            parts.push(iconMoney(MARGIN - 2, y - 16, 0.85));
            parts.push(`<text x="${MARGIN + 26}" y="${y}" font-size="14" font-weight="700" fill="#16382c">Tổng hợp</text>`);
            y += 10;
            const boxH = totals.length * 26 + 16;
            parts.push(`<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="${boxH}" rx="6" fill="#f4f8f6" stroke="#1d5c45"/>`);
            y += 24;
            for (const item of totals) {
                const money = item.money !== false && (typeof item.value === 'number' || item.format === 'money');
                const value = money ? formatMoney(item.value) : formatTelegramValue(item.value, lang);
                parts.push(`<text x="${MARGIN + 16}" y="${y}" font-size="13" fill="#3d5249">${xml(item.label || '')}</text>`);
                parts.push(`<text x="${PAGE_W - MARGIN - 16}" y="${y}" text-anchor="end" font-size="14" font-weight="700" fill="#16382c">${xml(value)}</text>`);
                y += 26;
            }
            y += 8;
        }

        if (showTotals && note) {
            y += 8;
            parts.push(`<text x="${MARGIN}" y="${y}" font-size="12" fill="#5d6f67">${xml(note)}</text>`);
        }

        const footerY = PAGE_H - 40;
        parts.push(`<line x1="${MARGIN}" y1="${footerY - 18}" x2="${PAGE_W - MARGIN}" y2="${footerY - 18}" stroke="#d5ded9"/>`);
        parts.push(`<text x="${MARGIN}" y="${footerY}" font-size="11" fill="#7b8881">SUPERMARKET FLY · Hà Nội</text>`);
        parts.push(`<text x="${PAGE_W - MARGIN}" y="${footerY}" text-anchor="end" font-size="11" fill="#7b8881">Trang ${page}/${totalPages} · giấy trắng chứng từ</text>`);

        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
  <rect width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>
  <g font-family="Segoe UI, Tahoma, Arial, sans-serif">
    ${parts.join('\n    ')}
  </g>
</svg>`;
    });
};

let lastRender = null;

const loadSharp = () => {
    try {
        return require('sharp');
    } catch (error) {
        throw new Error(`Thiếu dependency sharp (${error.message}). Chạy npm install trong server/.`);
    }
};

const renderVoucherPages = async (doc = {}, options = {}) => {
    const sharp = loadSharp();
    const svgs = buildVoucherSvgs(doc, options);
    const pages = [];
    for (let index = 0; index < svgs.length; index += 1) {
        const buffer = await sharp(Buffer.from(svgs[index], 'utf8'), { density: 144 })
            .png({ compressionLevel: 8 })
            .toBuffer();
        const kind = safeFilePart(doc.kind || 'ct');
        const number = safeFilePart(doc.number || doc.id || 'ct');
        pages.push({
            buffer,
            filename: `chung-tu-${kind}-${number}-p${index + 1}.png`,
            caption: captionFor(doc, options.lang, index + 1, svgs.length),
            mime: 'image/png',
            svg: svgs[index],
            isPaper: true
        });
    }
    lastRender = { kind: doc.kind, number: doc.number || doc.id, pages: pages.length, filenames: pages.map(p => p.filename) };
    return pages;
};

const renderVoucherPng = async (doc = {}, options = {}) => {
    const pages = await renderVoucherPages(doc, options);
    return pages[0] || null;
};

const peekLastVoucherRender = () => lastRender;
const resetVoucherRenderPeek = () => { lastRender = null; };

module.exports = {
    PAGE_W,
    PAGE_H,
    isProductImagePath,
    captionFor,
    buildVoucherSvg,
    buildVoucherSvgs,
    renderVoucherPng,
    renderVoucherPages,
    peekLastVoucherRender,
    resetVoucherRenderPeek
};
