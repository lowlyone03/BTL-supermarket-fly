const PAGE_W = 1000;
const PAGE_H = 1414;
const MARGIN = 44;
const CONTENT_W = PAGE_W - MARGIN * 2;
const ROWS_FIRST = 18;
const ROWS_NEXT = 26;

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

const formatPrintMoney = (value) =>
    `${Math.round(Number(value || 0)).toLocaleString('vi-VN')} đ`;

const formatPrintDate = (value) => {
    if (value == null || value === '') return '—';
    const raw = String(value);
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return raw;
    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh'
    }).format(dt);
};

const formatPrintValue = (item = {}, raw) => {
    const value = raw !== undefined ? raw : item.value;
    if (item.format === 'money') return formatPrintMoney(value);
    if (item.format === 'date') return formatPrintDate(value);
    if (item.format === 'percent') return `${Number(value || 0)}%`;
    if (value == null || value === '') return '—';
    return String(value);
};

const cellText = (row, column) => {
    const raw = typeof column.value === 'function' ? column.value(row) : row[column.key];
    return formatPrintValue(column, raw);
};

const unwrapPrint = (print) => (print && print.mau ? print.mau : print) || {};

const pdfFileName = (config = {}) => {
    const raw = [config.title, config.number].filter(Boolean).join('-') || 'chung-tu';
    const safe = String(raw).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'chung-tu';
    return `${safe}.pdf`;
};

const splitRowChunks = (rows, fieldCount) => {
    const first = Math.max(8, ROWS_FIRST - Math.min(8, Math.floor(fieldCount / 2)));
    if (!rows.length) return [[]];
    const chunks = [rows.slice(0, first)];
    for (let index = first; index < rows.length; index += ROWS_NEXT) {
        chunks.push(rows.slice(index, index + ROWS_NEXT));
    }
    return chunks;
};

const colLayout = (columns) => {
    const stt = 48;
    const rest = CONTENT_W - stt;
    const n = Math.max(1, columns.length);
    const each = Math.floor(rest / n);
    return [
        { key: '__stt', label: 'STT', w: stt, align: 'center' },
        ...columns.map((column, index) => ({
            ...column,
            w: index === n - 1 ? rest - each * (n - 1) : each
        }))
    ];
};

const textX = (x, width, align) => {
    if (align === 'right' || align === 'end') return { x: x + width - 8, anchor: 'end' };
    if (align === 'center' || align === 'middle') return { x: x + width / 2, anchor: 'middle' };
    return { x: x + 8, anchor: 'start' };
};

const buildPageSvg = (config, options, chunk, page, totalPages) => {
    const official = options.skin === 'official' || options.skin === 'w';
    const title = String(config.title || 'CHỨNG TỪ').toUpperCase();
    const number = config.number || '—';
    const status = config.status ? String(config.status) : '';
    const fields = Array.isArray(config.fields) ? config.fields.filter((item) => item && item.value != null && item.value !== '') : [];
    const columns = Array.isArray(config.columns) ? config.columns : [];
    const totals = Array.isArray(config.totals) ? config.totals : [];
    const signatures = Array.isArray(config.signatures) && config.signatures.length
        ? config.signatures
        : ['Người lập', 'Quản lý cửa hàng'];
    const note = config.note ? clip(String(config.note), 220) : '';
    const watermark = config.watermark ? String(config.watermark) : '';
    const cols = colLayout(columns);
    const showMeta = page === 1;
    const showFoot = page === totalPages;
    let y = MARGIN;
    const parts = [];

    const ink = official ? '#111' : '#183126';
    const muted = official ? '#333' : '#5d6f67';
    const line = official ? '#111' : '#d5dfda';
    const headBg = official ? '#fff' : '#eaf3ee';
    const altBg = official ? '#f7f7f7' : '#f8faf9';

    parts.push(`<rect width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>`);
    if (!official) {
        parts.push(`<rect width="${PAGE_W}" height="${PAGE_H}" fill="#e9eeeb"/>`);
        parts.push(`<rect x="22" y="22" width="${PAGE_W - 44}" height="${PAGE_H - 44}" fill="#ffffff"/>`);
    }
    if (watermark) {
        parts.push(`<text x="${PAGE_W / 2}" y="${PAGE_H / 2}" text-anchor="middle" font-size="64" font-weight="800" fill="${official ? '#00000018' : '#1d76561f'}" transform="rotate(-24 ${PAGE_W / 2} ${PAGE_H / 2})">${xml(watermark)}</text>`);
    }

    if (official) {
        parts.push(`<text x="${MARGIN}" y="${y + 16}" font-size="15" font-weight="700" fill="#000">SUPERMARKET FLY</text>`);
        parts.push(`<text x="${MARGIN}" y="${y + 34}" font-size="12" fill="#000">Cửa hàng Hà Nội</text>`);
        parts.push(`<text x="${PAGE_W - MARGIN}" y="${y + 16}" text-anchor="end" font-size="13" font-weight="700" fill="#000">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</text>`);
        parts.push(`<text x="${PAGE_W - MARGIN}" y="${y + 34}" text-anchor="end" font-size="13" font-style="italic" fill="#000">Độc lập - Tự do - Hạnh phúc</text>`);
        parts.push(`<line x1="${PAGE_W - MARGIN - 220}" y1="${y + 40}" x2="${PAGE_W - MARGIN}" y2="${y + 40}" stroke="#000"/>`);
        y += 70;
        parts.push(`<text x="${PAGE_W / 2}" y="${y}" text-anchor="middle" font-size="20" font-weight="700" fill="#000">${xml(title)}</text>`);
        y += 26;
        parts.push(`<text x="${PAGE_W / 2}" y="${y}" text-anchor="middle" font-size="13" fill="#000">Số: ${xml(number)}${status ? ` · ${xml(status)}` : ''}</text>`);
        y += 22;
        parts.push(`<text x="${PAGE_W - MARGIN}" y="${y}" text-anchor="end" font-size="13" font-style="italic" fill="#000">Hà Nội, ngày ${xml(formatPrintDate(config.documentDate || new Date()))}</text>`);
        y += 28;
    } else {
        parts.push(`<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="86" rx="12" fill="#174a37"/>`);
        parts.push(`<text x="${MARGIN + 20}" y="${y + 28}" font-size="11" font-weight="700" fill="#d1eadf">CHỨNG TỪ NỘI BỘ · DỮ LIỆU HỆ THỐNG</text>`);
        parts.push(`<text x="${MARGIN + 20}" y="${y + 54}" font-size="22" font-weight="700" fill="#ffffff">${xml(title)}</text>`);
        parts.push(`<text x="${MARGIN + 20}" y="${y + 74}" font-size="13" fill="#e2f1ea">Số ${xml(number)} · ${xml(formatPrintDate(config.documentDate || new Date()))}${status ? ` · ${xml(status)}` : ''}</text>`);
        y += 106;
        parts.push(`<text x="${MARGIN}" y="${y}" font-size="12" font-weight="700" fill="#174a37">SUPERMARKET FLY · Cửa hàng Hà Nội</text>`);
        y += 24;
    }

    if (showMeta) {
        for (const field of fields) {
            const label = clip(String(field.label || ''), 28);
            const value = clip(formatPrintValue(field), 52);
            if (official) {
                parts.push(`<text x="${MARGIN}" y="${y}" font-size="13" font-weight="700" fill="#000">${xml(label)}</text>`);
                parts.push(`<text x="${MARGIN + 240}" y="${y}" font-size="13" fill="#000">${xml(value)}</text>`);
            } else {
                parts.push(`<rect x="${MARGIN}" y="${y - 16}" width="${CONTENT_W}" height="26" rx="6" fill="#f8faf9" stroke="#dbe5df"/>`);
                parts.push(`<text x="${MARGIN + 12}" y="${y + 2}" font-size="12" fill="#6c7d74">${xml(label)}</text>`);
                parts.push(`<text x="${PAGE_W - MARGIN - 12}" y="${y + 2}" text-anchor="end" font-size="13" font-weight="700" fill="${ink}">${xml(value)}</text>`);
            }
            y += official ? 22 : 32;
        }
        if (fields.length) y += 8;
    }

    if (columns.length) {
        let x = MARGIN;
        parts.push(`<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="28" fill="${headBg}" stroke="${line}"/>`);
        for (const col of cols) {
            const pos = textX(x, col.w, col.align);
            parts.push(`<text x="${pos.x}" y="${y + 19}" text-anchor="${pos.anchor}" font-size="11" font-weight="700" fill="${official ? '#000' : '#315343'}">${xml(col.label)}</text>`);
            x += col.w;
        }
        y += 28;
        chunk.forEach((row, local) => {
            const global = options.offset + local;
            if (local % 2 === 1) {
                parts.push(`<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="26" fill="${altBg}"/>`);
            }
            x = MARGIN;
            for (const col of cols) {
                const value = col.key === '__stt' ? String(global + 1) : clip(cellText(row, col), Math.max(8, Math.floor(col.w / 8)));
                const pos = textX(x, col.w, col.key === '__stt' ? 'center' : col.align);
                parts.push(`<text x="${pos.x}" y="${y + 18}" text-anchor="${pos.anchor}" font-size="12" fill="${ink}">${xml(value)}</text>`);
                x += col.w;
            }
            y += 26;
        });
        parts.push(`<rect x="${MARGIN}" y="${y - chunk.length * 26 - 28}" width="${CONTENT_W}" height="${chunk.length * 26 + 28}" fill="none" stroke="${line}"/>`);
        y += 16;
        if (!chunk.length) {
            parts.push(`<text x="${PAGE_W / 2}" y="${y}" text-anchor="middle" font-size="13" fill="${muted}">Không có dòng chi tiết</text>`);
            y += 24;
        }
    }

    if (showFoot && totals.length) {
        for (const item of totals) {
            parts.push(`<text x="${MARGIN + 280}" y="${y}" font-size="13" fill="${muted}">${xml(item.label || '')}</text>`);
            parts.push(`<text x="${PAGE_W - MARGIN}" y="${y}" text-anchor="end" font-size="14" font-weight="700" fill="${ink}">${xml(formatPrintValue(item))}</text>`);
            y += 22;
        }
        y += 8;
    }
    if (showFoot && note) {
        parts.push(`<text x="${MARGIN}" y="${y}" font-size="12" fill="${muted}">Ghi chú: ${xml(note)}</text>`);
        y += 28;
    }
    if (showFoot) {
        const slot = CONTENT_W / signatures.length;
        signatures.forEach((name, index) => {
            const cx = MARGIN + slot * index + slot / 2;
            parts.push(`<text x="${cx}" y="${y}" text-anchor="middle" font-size="13" font-weight="700" fill="${ink}">${xml(name)}</text>`);
            parts.push(`<text x="${cx}" y="${y + 18}" text-anchor="middle" font-size="11" font-style="italic" fill="${muted}">(Ký, ghi rõ họ tên)</text>`);
        });
    }

    const footerY = PAGE_H - 36;
    parts.push(`<text x="${MARGIN}" y="${footerY}" font-size="11" fill="${muted}">SUPERMARKET FLY · ${official ? 'Bản giấy trắng mực đen' : 'Mẫu hệ thống'}</text>`);
    parts.push(`<text x="${PAGE_W - MARGIN}" y="${footerY}" text-anchor="end" font-size="11" fill="${muted}">Trang ${page}/${totalPages}</text>`);

    const family = official ? 'Times New Roman, Times, serif' : 'Segoe UI, Tahoma, Arial, sans-serif';
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">
  <g font-family="${family}">
    ${parts.join('\n    ')}
  </g>
</svg>`;
};

const buildPrintSvgs = (print, options = {}) => {
    const config = unwrapPrint(print);
    const rows = Array.isArray(config.rows) ? config.rows.slice(0, 80) : [];
    const fields = Array.isArray(config.fields) ? config.fields : [];
    const chunks = splitRowChunks(rows, fields.length);
    let offset = 0;
    return chunks.map((chunk, index) => {
        const svg = buildPageSvg(config, { ...options, offset }, chunk, index + 1, chunks.length);
        offset += chunk.length;
        return svg;
    });
};

const assembleJpegPdf = (images = []) => {
    const pages = images.length ? images : [{ jpeg: Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]), w: 10, h: 10 }];
    const pageW = 595.28;
    const pageH = 841.89;
    const imageObjOf = (i) => 3 + i * 3;
    const contentObjOf = (i) => 4 + i * 3;
    const pageObjOf = (i) => 5 + i * 3;
    const parts = [];
    const offsets = [0];
    let pos = 0;
    const write = (data) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'latin1');
        parts.push(buf);
        pos += buf.length;
    };
    const writeObj = (num, dict, stream) => {
        offsets[num] = pos;
        if (stream) {
            write(`${num} 0 obj\n${dict}\nstream\n`);
            write(stream);
            write('\nendstream\nendobj\n');
        } else {
            write(`${num} 0 obj\n${dict}\nendobj\n`);
        }
    };

    write('%PDF-1.4\n');
    writeObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    const kids = pages.map((_, i) => `${pageObjOf(i)} 0 R`).join(' ');
    writeObj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`);
    pages.forEach((img, i) => {
        const jpeg = img.jpeg || Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]);
        const w = Number(img.w || img.width || 1);
        const h = Number(img.h || img.height || 1);
        writeObj(
            imageObjOf(i),
            `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
            jpeg
        );
        const scale = Math.min(pageW / w, pageH / h);
        const dw = w * scale;
        const dh = h * scale;
        const x = (pageW - dw) / 2;
        const y = (pageH - dh) / 2;
        const content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
        writeObj(contentObjOf(i), `<< /Length ${Buffer.byteLength(content)} >>`, Buffer.from(content));
        writeObj(
            pageObjOf(i),
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${imageObjOf(i)} 0 R >> >> /Contents ${contentObjOf(i)} 0 R >>`
        );
    });
    const xrefPos = pos;
    const objCount = 2 + pages.length * 3;
    write(`xref\n0 ${objCount + 1}\n`);
    write('0000000000 65535 f \n');
    for (let i = 1; i <= objCount; i += 1) {
        write(`${String(offsets[i] || 0).padStart(10, '0')} 00000 n \n`);
    }
    write(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
    return Buffer.concat(parts);
};

const loadSharp = () => {
    try {
        return require('sharp');
    } catch (error) {
        throw new Error(`Thiếu dependency sharp (${error.message}). Chạy npm install trong server/.`);
    }
};

const renderPrintPdf = async (print, options = {}) => {
    const sharp = loadSharp();
    const svgs = buildPrintSvgs(print, options);
    const images = [];
    for (const svg of svgs) {
        const jpeg = await sharp(Buffer.from(svg, 'utf8'), { density: 144 })
            .jpeg({ quality: 84 })
            .toBuffer();
        const meta = await sharp(jpeg).metadata();
        images.push({ jpeg, w: meta.width || PAGE_W, h: meta.height || PAGE_H });
    }
    return assembleJpegPdf(images);
};

module.exports = {
    PAGE_W,
    PAGE_H,
    unwrapPrint,
    formatPrintMoney,
    formatPrintDate,
    pdfFileName,
    buildPrintSvgs,
    assembleJpegPdf,
    renderPrintPdf
};
