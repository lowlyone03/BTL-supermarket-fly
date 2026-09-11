const {
    escapeHtml, moneyCode, textCode, headerBlock, sectionTitle,
    splitTelegramText, formatTelegramDate, formatVnDateTime, t
} = require('./telegramMessages');
const { formatPeriodLabel } = require('./reportingPeriod');
const { KIND_META, DEPT_LABEL, kpiOf } = require('./departmentReportSnapshot');

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

const parseSnapshot = (row = {}) => {
    try { return JSON.parse(row.NoiDung || '{}'); } catch { return {}; }
};

const loadSubmission = async (pool, maBC) => {
    if (!pool || !maBC) return null;
    const { sql } = require('../config/db');
    const result = await pool.request()
        .input('MaBC', sql.VarChar, String(maBC).trim())
        .query(`SELECT MaBC, BoPhan, LoaiBaoCao, LoaiKy, GiaTriKy, TuNgay, DenNgay, NhanKy, SoPhien,
                       MaNV_Lap, TenNV_Lap, NgayNop, TrangThai, GhiChu, PhanHoiQL, NoiDung
                FROM BaoCaoBoPhanNop WHERE MaBC=@MaBC`);
    const header = result.recordset[0];
    if (!header) return null;
    return { header, report: parseSnapshot(header) };
};

const listSubmissions = async (pool, top = 8) => {
    if (!pool) return [];
    const { sql } = require('../config/db');
    const result = await pool.request()
        .input('Top', sql.Int, Math.min(Math.max(Number(top) || 8, 1), 20))
        .query(`SELECT TOP (@Top) MaBC, BoPhan, LoaiBaoCao, LoaiKy, GiaTriKy, NhanKy, SoPhien,
                       TenNV_Lap, NgayNop, TrangThai
                FROM BaoCaoBoPhanNop
                WHERE TrangThai IN (N'Đã gửi', N'Đã xem', N'Cần phản hồi')
                ORDER BY NgayNop DESC`);
    return result.recordset || [];
};

const deptKeyboard = (lang = 'vi') => ({
    inline_keyboard: [[
        { text: t(lang, 'rptDeptList') || '📋 Kỳ đã gửi', callback_data: 'rpt:dept' },
        { text: t(lang, 'rptStoreReports') || '📊 Báo cáo cửa hàng', callback_data: 'cmd:reports' }
    ], [
        { text: 'Tổng quan', callback_data: 'cmd:fly' }
    ]]
});

const listKeyboard = (items = [], lang = 'vi') => {
    const rows = items.slice(0, 8).map(item => ([{
        text: `${item.MaBC} · ${formatPeriodLabel(item.LoaiKy, item.GiaTriKy, item.NhanKy)}`.slice(0, 64),
        callback_data: String(`docs:dept:${item.MaBC}`).slice(0, 64)
    }]));
    rows.push([
        { text: '‹ Danh sách báo cáo', callback_data: 'cmd:reports' },
        { text: 'Tổng quan', callback_data: 'cmd:fly' }
    ]);
    return { inline_keyboard: rows };
};

const buildText = (header = {}, report = {}, { mode = 'view' } = {}) => {
    const meta = KIND_META[header.LoaiBaoCao] || {};
    const label = formatPeriodLabel(header.LoaiKy, header.GiaTriKy, header.NhanKy);
    const from = formatTelegramDate(header.TuNgay, 'vi') || header.TuNgay || '—';
    const to = formatTelegramDate(header.DenNgay, 'vi') || header.DenNgay || '—';
    const title = mode === 'push' ? 'BỘ PHẬN VỪA GỬI BÁO CÁO' : (meta.label || 'BÁO CÁO BỘ PHẬN');
    const kpis = kpiOf(header.LoaiBaoCao, report);
    const out = [
        headerBlock(`📥 <b>${escapeHtml(title)}</b>`),
        `<blockquote>🔖 <b>${escapeHtml(header.MaBC || '—')}</b>  ·  phiên ${textCode(String(header.SoPhien || 1))}\n${escapeHtml(DEPT_LABEL[header.BoPhan] || '')} · ${escapeHtml(label)}\n📅 ${textCode(from)} → ${textCode(to)}\n${escapeHtml(header.TenNV_Lap || '')} · ${escapeHtml(formatVnDateTime(header.NgayNop) || '')}</blockquote>`,
        `<i>Đây là bản bộ phận đã nộp. Không phải Báo cáo cửa hàng. Trợ lý không duyệt.</i>`,
        header.GhiChu ? `${sectionTitle('📝', 'Ghi chú nộp')}\n${escapeHtml(header.GhiChu)}` : '',
        '',
        sectionTitle('📌', 'CHỈ SỐ CHÍNH')
    ];
    kpis.forEach(row => {
        const value = row.money ? moneyCode(row.value) : textCode(String(row.value ?? '—'));
        out.push(`${escapeHtml(row.label)}: ${value}`);
    });
    if (!kpis.length) out.push('<i>Không có KPI tóm tắt — mở Fly để xem đủ bảng.</i>');
    out.push('', `<i>🏪 SUPERMARKET FLY · bản đủ biểu đồ xem trên Fly → Báo cáo bộ phận.</i>`);
    return tidyLines(out);
};

const paginate = (text) => {
    const chunks = splitTelegramText(String(text || ''), 3600);
    if (chunks.length <= 1) return chunks.filter(Boolean);
    return chunks.map((chunk, index) => (
        index === 0
            ? `${chunk}\n\n<i>— trang 1/${chunks.length} —</i>`
            : `<i>— trang ${index + 1}/${chunks.length} —</i>\n${chunk}`
    ));
};

const composeView = async (pool, maBC, options = {}) => {
    const loaded = await loadSubmission(pool, maBC).catch(() => null);
    if (!loaded) {
        return {
            text: tidyLines([
                headerBlock('📥 <b>BÁO CÁO BỘ PHẬN</b>'),
                `<i>${escapeHtml(t(options.lang || 'vi', 'rptDeptMissing') || 'Không tìm thấy báo cáo bộ phận đã gửi.')}</i>`
            ]),
            texts: [],
            documents: [],
            extra: { reply_markup: deptKeyboard(options.lang) }
        };
    }
    const pages = paginate(buildText(loaded.header, loaded.report, options));
    const extra = { reply_markup: deptKeyboard(options.lang) };
    return {
        texts: pages,
        documents: pages.map(text => ({ text, kind: 'dept', number: loaded.header.MaBC })),
        extra,
        text: pages[0] || ''
    };
};

const composeList = async (pool, lang = 'vi') => {
    const items = await listSubmissions(pool, 8).catch(() => []);
    const lines = [
        headerBlock(`📥 <b>${escapeHtml(t(lang, 'rptDeptTitle') || 'BÁO CÁO BỘ PHẬN ĐÃ GỬI')}</b>`),
        `<i>${escapeHtml(t(lang, 'rptDeptHint') || 'Bấm một số BCM / BCKT / BCTN để xem tóm tắt KPI. Không duyệt trên Telegram.')}</i>`,
        ''
    ];
    if (!items.length) {
        lines.push(escapeHtml(t(lang, 'rptDeptEmpty') || 'Chưa có kỳ nào bộ phận gửi.'));
    } else {
        items.forEach(item => {
            const meta = KIND_META[item.LoaiBaoCao] || {};
            lines.push(`• <b>${escapeHtml(item.MaBC)}</b> · ${escapeHtml(formatPeriodLabel(item.LoaiKy, item.GiaTriKy, item.NhanKy))}`);
            lines.push(`   ${escapeHtml(DEPT_LABEL[item.BoPhan] || '')} · ${escapeHtml(meta.label || item.LoaiBaoCao)} · ${escapeHtml(item.TenNV_Lap || '')}`);
        });
    }
    return {
        text: tidyLines(lines),
        extra: { reply_markup: items.length ? listKeyboard(items, lang) : deptKeyboard(lang) },
        items
    };
};

module.exports = {
    composeDepartmentReportView: composeView,
    composeDepartmentReportList: composeList,
    loadDepartmentSubmission: loadSubmission,
    listDepartmentSubmissions: listSubmissions
};
