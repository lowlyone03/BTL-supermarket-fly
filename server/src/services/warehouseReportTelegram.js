const {
    escapeHtml, formatMoney, moneyCode, textCode, headerBlock, sectionTitle,
    splitTelegramText, formatTelegramDate, formatVnDateTime, t
} = require('./telegramMessages');

const tidyLines = (lines = []) => {
    const out = [];
    for (const value of lines) {
        if (value == null || value === false) continue;
        const line = String(value);
        if (!line && (!out.length || out[out.length - 1] === '')) continue;
        out.push(line);
    }
    while (out[out.length - 1] === '') out.pop();
    return out.join('\n');
};
const { formatPeriodLabel } = require('./reportingPeriod');

const MAX_WRITEOFF = 20;
const MAX_LOW = 8;
const MAX_RETURNS = 8;
const MAX_DOCS = 8;
const MAX_DAYS = 10;

const qtyOf = value => Number(value || 0).toLocaleString('vi-VN');

const writeoffKind = row => {
    if (String(row?.LoaiXuat || '').trim() === 'Sử dụng nội bộ') return 'reuse';
    if (row?.MaDT) return 'return';
    return 'scrap';
};

const writeoffKindLabel = kind => ({
    scrap: 'Hủy hàng',
    reuse: 'Tận dụng NV',
    return: 'Đổi trả loại bỏ'
}[kind] || 'Khác');

const writeoffSplit = (summary = {}) => {
    const slReturn = Number(summary.SLDoiTraLoaiBo || 0);
    const gtReturn = Number(summary.GiaTriDoiTraLoaiBo || 0);
    return {
        slScrap: Math.max(0, Number(summary.SLHuy || 0) - slReturn),
        gtScrap: Math.max(0, Number(summary.GiaTriHuy || 0) - gtReturn),
        slReuse: Number(summary.SLTanDung || 0),
        gtReuse: Number(summary.GiaTriTanDung || 0),
        slReturn,
        gtReturn,
        slTotal: Number(summary.TongSoLuong || 0),
        gtTotal: Number(summary.TongGiaTri || 0),
        tickets: Number(summary.SoPhieu || 0),
        products: Number(summary.SoMatHang || 0)
    };
};

const writeoffDoc = row => [row?.MaPX, row?.MaKK, row?.MaDT].filter(Boolean).join(' · ');

const writeoffByDay = (lines = []) => {
    const map = new Map();
    lines.forEach(row => {
        const raw = row.NgayXuat;
        const key = raw ? String(raw).slice(0, 10) : '—';
        if (!map.has(key)) map.set(key, { key, scrap: 0, reuse: 0, ret: 0, value: 0 });
        const bucket = map.get(key);
        const sl = Number(row.SoLuong || 0);
        const kind = writeoffKind(row);
        if (kind === 'reuse') bucket.reuse += sl;
        else if (kind === 'return') bucket.ret += sl;
        else bucket.scrap += sl;
        bucket.value += Number(row.GiaTri || 0);
    });
    return [...map.values()];
};

const periodLabelOf = (header = {}, report = {}) => {
    const period = report.period || {};
    return formatPeriodLabel(
        header.LoaiKy || period.periodType,
        header.GiaTriKy || period.period,
        header.NhanKy || period.label
    );
};

const parseSnapshot = (row = {}) => {
    if (row.report && typeof row.report === 'object') return row.report;
    try { return JSON.parse(row.NoiDung || '{}'); } catch { return {}; }
};

const loadWarehouseSubmission = async (pool, maBC) => {
    if (!pool || !maBC) return null;
    const { sql } = require('../config/db');
    const result = await pool.request()
        .input('MaBC', sql.VarChar, String(maBC).trim())
        .query(`SELECT MaBC, LoaiKy, GiaTriKy, TuNgay, DenNgay, NhanKy,
                       MaNV_Lap, TenNV_Lap, NgayNop, TrangThai, GhiChu, NoiDung
                FROM BaoCaoKhoNop WHERE MaBC=@MaBC`);
    const header = result.recordset[0];
    if (!header) return null;
    return { header, report: parseSnapshot(header) };
};

const listWarehouseSubmissions = async (pool, top = 8) => {
    if (!pool) return [];
    const { sql } = require('../config/db');
    const result = await pool.request()
        .input('Top', sql.Int, Math.min(Math.max(Number(top) || 8, 1), 20))
        .query(`SELECT TOP (@Top) MaBC, LoaiKy, GiaTriKy, NhanKy, TenNV_Lap, NgayNop, TrangThai, GhiChu
                FROM BaoCaoKhoNop ORDER BY NgayNop DESC`);
    return result.recordset || [];
};

const buildWarehouseReportText = (header = {}, report = {}, { mode = 'view', lang = 'vi' } = {}) => {
    const period = report.period || {};
    const movement = report.movement || {};
    const stock = report.stock || {};
    const docs = report.documents || {};
    const writeoff = report.hangRoiKhoBan || {};
    const split = writeoffSplit(writeoff.summary || {});
    const lines = writeoff.lines || [];
    const days = writeoffByDay(lines);
    const lowStock = report.lowStock || [];
    const returns = report.doiTra || {};
    const tickets = returns.tickets || [];
    const products = returns.products || [];
    const recent = report.recentDocuments || [];
    const label = periodLabelOf(header, report);
    const from = formatTelegramDate(header.TuNgay || period.from, lang) || header.TuNgay || period.from || '—';
    const to = formatTelegramDate(header.DenNgay || period.to, lang) || header.DenNgay || period.to || '—';
    const title = mode === 'push'
        ? 'THỦ KHO VỪA GỬI BÁO CÁO KHO'
        : 'BÁO CÁO THỦ KHO';
    const out = [
        headerBlock(`📦 <b>${escapeHtml(title)}</b>`),
        `<blockquote>🔖 <b>${escapeHtml(header.MaBC || '—')}</b>  ·  ${escapeHtml(label)}\n📅 ${textCode(from)} → ${textCode(to)}\n${escapeHtml(header.TenNV_Lap || 'Thủ kho')} · ${escapeHtml(formatVnDateTime(header.NgayNop, lang) || '')}</blockquote>`,
        `<i>Đây là báo cáo Thủ kho (nhập–xuất–tồn, hàng rời kho bán). Không phải báo cáo cửa hàng / lãi lỗ.</i>`,
        header.GhiChu ? `${sectionTitle('📝', 'Ghi chú nộp')}\n${escapeHtml(header.GhiChu)}` : '',
        '',
        sectionTitle('📥', 'NHẬP – XUẤT – TỒN'),
        `Tồn đầu kỳ: ${textCode(qtyOf(movement.SoLuongDauKy))} ĐV`,
        `Nhập trong kỳ: ${textCode(qtyOf(movement.SoLuongNhap))} ĐV`,
        `Xuất trong kỳ: ${textCode(qtyOf(movement.SoLuongXuat))} ĐV`,
        Number(movement.DieuChinhRong) ? `Điều chỉnh ròng: ${textCode(qtyOf(movement.DieuChinhRong))} ĐV` : '',
        `<b>Tồn cuối kỳ:</b> ${textCode(qtyOf(movement.SoLuongCuoiKy))} ĐV`,
        `<b>Giá trị tồn:</b> ${moneyCode(stock.GiaTriTon)} · đang tồn ${textCode(qtyOf(stock.TongTon))} ĐV`,
        `Dưới tồn tối thiểu: ${textCode(String(stock.TonThap || 0))} mã · Hết hàng: ${textCode(String(stock.HetHang || 0))} mã`,
        '',
        sectionTitle('📤', 'HÀNG ĐÃ XUẤT — KHÔNG CÒN BÁN'),
        `Hủy hàng: ${textCode(qtyOf(split.slScrap))} ĐV · ${moneyCode(split.gtScrap)}`,
        `Tận dụng NV: ${textCode(qtyOf(split.slReuse))} ĐV · ${moneyCode(split.gtReuse)}`,
        `Đổi trả loại bỏ: ${textCode(qtyOf(split.slReturn))} ĐV · ${moneyCode(split.gtReturn)}`,
        `<b>Tổng:</b> ${textCode(qtyOf(split.slTotal))} ĐV · ${moneyCode(split.gtTotal)} · ${textCode(String(split.tickets))} phiếu`
    ];
    if (days.length) {
        out.push('', sectionTitle('📆', 'THEO NGÀY CÓ PHÁT SINH'));
        days.slice(0, MAX_DAYS).forEach(row => {
            out.push(`${textCode(formatTelegramDate(`${row.key}T00:00:00+07:00`, lang) || row.key)} · hủy ${qtyOf(row.scrap)} · tận dụng ${qtyOf(row.reuse)} · đổi trả ${qtyOf(row.ret)} · ${formatMoney(row.value)}`);
        });
        if (days.length > MAX_DAYS) out.push(`<i>… còn ${days.length - MAX_DAYS} ngày — xem đủ trên Fly.</i>`);
    }
    if (lines.length) {
        out.push('', sectionTitle('📋', `CHI TIẾT HÀNG RỜI KHO BÁN (${Math.min(lines.length, MAX_WRITEOFF)}/${lines.length})`));
        lines.slice(0, MAX_WRITEOFF).forEach((row, index) => {
            const kind = writeoffKind(row);
            out.push(`${index + 1}. <b>${escapeHtml(row.TenSP || row.MaSP || '—')}</b> ${row.MaSP ? textCode(row.MaSP) : ''}`);
            out.push(`   ${escapeHtml(writeoffKindLabel(kind))} · ${textCode(qtyOf(row.SoLuong))} × ${formatMoney(row.DonGia)} = <b>${formatMoney(row.GiaTri)}</b>`);
            out.push(`   ${escapeHtml(writeoffDoc(row) || '—')} · ${escapeHtml(formatTelegramDate(row.NgayXuat, lang) || '')}${row.AnhHuongTon ? ` · ${escapeHtml(row.AnhHuongTon)}` : ''}`);
        });
        if (lines.length > MAX_WRITEOFF) {
            out.push(`<i>… còn ${lines.length - MAX_WRITEOFF} dòng. Mở Fly → Báo cáo Thủ kho hoặc xuất Excel để xem đủ.</i>`);
        }
    }
    if (lowStock.length) {
        out.push('', sectionTitle('⚠️', `TỒN THẤP (${lowStock.length})`));
        lowStock.slice(0, MAX_LOW).forEach(row => {
            const lack = Math.max(0, Number(row.TonKhoToiThieu || 0) - Number(row.SLTon || 0));
            out.push(`• ${escapeHtml(row.TenSP || row.MaSP || '—')} ${row.MaSP ? textCode(row.MaSP) : ''} · tồn ${qtyOf(row.SLTon)} / min ${qtyOf(row.TonKhoToiThieu)} · thiếu ${qtyOf(lack)}`);
        });
        if (lowStock.length > MAX_LOW) out.push(`<i>… còn ${lowStock.length - MAX_LOW} mã.</i>`);
    }
    const returnSummary = returns.summary || {};
    out.push('', sectionTitle('↩️', 'ĐỔI TRẢ TRONG KỲ'));
    out.push(`Phiếu: ${textCode(String(returnSummary.SoPhieu || tickets.length || 0))} · Hoàn ${moneyCode(returnSummary.TienHoan)} · Loại bỏ ${textCode(String(returnSummary.KhongNhapLai || 0))} phiếu`);
    tickets.slice(0, MAX_RETURNS).forEach(row => {
        out.push(`• ${textCode(row.MaDT)} · ${escapeHtml(row.HinhThucXuLy || '—')} · ${formatMoney(row.SoTienHoan)}${row.BuocCanXuLy ? ` · ${escapeHtml(row.BuocCanXuLy)}` : ''}`);
    });
    if (tickets.length > MAX_RETURNS) out.push(`<i>… còn ${tickets.length - MAX_RETURNS} phiếu đổi trả.</i>`);
    if (products.length) {
        out.push('', sectionTitle('📦', 'HÀNG KHÁCH TRẢ'));
        products.slice(0, MAX_RETURNS).forEach(row => {
            out.push(`• ${escapeHtml(row.TenSP || row.MaSP || '—')} · trả ${qtyOf(row.SLTra)} · nhập lại ${qtyOf(row.SLNhapLai)} · loại bỏ ${qtyOf(row.SLLoaiBo || row.SLKhongNhapLai)}`);
        });
    }
    if (recent.length || docs.SoPhieuNhap || docs.SoPhieuXuat || docs.SoKiemKe) {
        out.push('', sectionTitle('📑', 'CHỨNG TỪ'));
        out.push(`PN ${textCode(String(docs.SoPhieuNhap || 0))} · PX ${textCode(String(docs.SoPhieuXuat || 0))} · KK ${textCode(String(docs.SoKiemKe || 0))}`);
        recent.slice(0, MAX_DOCS).forEach(row => {
            out.push(`• ${textCode(row.MaChungTu)} · ${escapeHtml(row.LoaiChungTu || '')} · ${escapeHtml(row.TrangThai || '')}`);
        });
    }
    out.push('', `<i>🏪 SUPERMARKET FLY · bản đủ dòng / biểu đồ xem trên Fly → Báo cáo Thủ kho hoặc file Excel.</i>`);
    return tidyLines(out);
};

const paginateReport = (text) => {
    const chunks = splitTelegramText(String(text || ''), 3600);
    if (chunks.length <= 1) return chunks.filter(Boolean);
    return chunks.map((chunk, index) => (
        index === 0
            ? `${chunk}\n\n<i>— trang 1/${chunks.length} —</i>`
            : `<i>— trang ${index + 1}/${chunks.length} —</i>\n${chunk}`
    ));
};

const warehouseReportKeyboard = (lang = 'vi') => ({
    inline_keyboard: [[
        { text: t(lang, 'rptWarehouseList') || '📋 Kỳ đã gửi', callback_data: 'rpt:wh' },
        { text: t(lang, 'rptStoreReports') || '📊 Báo cáo cửa hàng', callback_data: 'cmd:reports' }
    ], [
        { text: '🏠 Tổng quan', callback_data: 'cmd:fly' }
    ]]
});

const warehouseReportListKeyboard = (items = [], lang = 'vi') => {
    const rows = items.slice(0, 8).map(item => ([{
        text: `${item.MaBC} · ${formatPeriodLabel(item.LoaiKy, item.GiaTriKy, item.NhanKy)}`.slice(0, 64),
        callback_data: String(`docs:bck:${item.MaBC}`).slice(0, 64)
    }]));
    rows.push([
        { text: '‹ Danh sách báo cáo', callback_data: 'cmd:reports' },
        { text: '🏠 Tổng quan', callback_data: 'cmd:fly' }
    ]);
    return { inline_keyboard: rows };
};

const buildWarehouseReportListText = (items = [], lang = 'vi') => {
    const lines = [
        headerBlock(`📦 <b>${escapeHtml(t(lang, 'rptWarehouseTitle') || 'BÁO CÁO THỦ KHO ĐÃ GỬI')}</b>`),
        `<i>${escapeHtml(t(lang, 'rptWarehouseHint') || 'Bấm một số BCK để xem đủ nhập–xuất–tồn, hàng rời kho bán, tồn thấp và đổi trả.')}</i>`,
        ''
    ];
    if (!items.length) {
        lines.push(escapeHtml(t(lang, 'rptWarehouseEmpty') || 'Chưa có kỳ nào Thủ kho gửi.'));
        return tidyLines(lines);
    }
    items.slice(0, 8).forEach(item => {
        const label = formatPeriodLabel(item.LoaiKy, item.GiaTriKy, item.NhanKy);
        lines.push(`• <b>${escapeHtml(item.MaBC)}</b> · ${escapeHtml(label)}`);
        lines.push(`   ${escapeHtml(item.TenNV_Lap || 'Thủ kho')} · ${escapeHtml(formatVnDateTime(item.NgayNop, lang) || '')}`);
    });
    return tidyLines(lines);
};

const composeWarehouseReportMessages = (header, report, options = {}) => {
    const pages = paginateReport(buildWarehouseReportText(header, report, options));
    const extra = { reply_markup: warehouseReportKeyboard(options.lang) };
    return {
        texts: pages,
        documents: pages.map(text => ({ text, kind: 'bck', number: header.MaBC })),
        extra,
        text: pages[0] || ''
    };
};

const composeWarehouseReportView = async (pool, maBC, options = {}) => {
    const loaded = await loadWarehouseSubmission(pool, maBC).catch(() => null);
    if (!loaded) {
        return {
            text: tidyLines([
                headerBlock('📦 <b>BÁO CÁO THỦ KHO</b>'),
                `<i>${escapeHtml(t(options.lang || 'vi', 'rptWarehouseMissing') || 'Không tìm thấy báo cáo kho đã gửi.')}</i>`
            ]),
            texts: [],
            documents: [],
            extra: { reply_markup: warehouseReportKeyboard(options.lang) }
        };
    }
    return composeWarehouseReportMessages(loaded.header, loaded.report, { ...options, mode: options.mode || 'view' });
};

const composeWarehouseReportList = async (pool, lang = 'vi') => {
    const items = await listWarehouseSubmissions(pool, 8).catch(() => []);
    return {
        text: buildWarehouseReportListText(items, lang),
        extra: { reply_markup: items.length ? warehouseReportListKeyboard(items, lang) : warehouseReportKeyboard(lang) },
        items
    };
};

module.exports = {
    writeoffKind,
    writeoffKindLabel,
    writeoffSplit,
    writeoffByDay,
    periodLabelOf,
    loadWarehouseSubmission,
    listWarehouseSubmissions,
    buildWarehouseReportText,
    composeWarehouseReportMessages,
    composeWarehouseReportView,
    composeWarehouseReportList,
    warehouseReportKeyboard,
    warehouseReportListKeyboard
};
