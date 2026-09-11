'use strict';

const { ROLE_PERMISSION_CODES } = require('../constants/permissions');
const { LOYALTY_POLICY, offerForSegment, loadLoyaltyPolicy, publicPolicy } = require('./loyaltyPolicy');
const { vietnamDateKey } = require('./reportingPeriod');

const codesOf = (user) => {
    const key = String(user?.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN');
    return ROLE_PERMISSION_CODES[key] || [];
};
const hasUc = (user, code) => codesOf(user).includes(code);
const isRole = (user, name) => String(user?.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN')
    === String(name || '').trim().toLocaleLowerCase('vi-VN');

const assertLoyaltyManager = (user) => {
    if (!hasUc(user, 'UC10') || !isRole(user, 'Quản lý')) {
        const error = new Error('Chỉ Quản lý (UC10) xem phân tích RFM và chính sách ưu đãi.');
        error.status = 403;
        throw error;
    }
};

const n = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const dateKey = (value) => vietnamDateKey(value) || '';

const daysBetween = (from, to) => {
    const a = dateKey(from);
    const b = dateKey(to);
    if (!a || !b) return null;
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

const scoreRecency = (days, policy = LOYALTY_POLICY) => {
    if (days == null) return 1;
    if (days <= policy.recencyDays.veryHot) return 5;
    if (days <= policy.recencyDays.hot) return 4;
    if (days <= policy.recencyDays.warm) return 3;
    if (days <= policy.recencyDays.cool) return 2;
    return 1;
};

const scoreFrequency = (count, policy = LOYALTY_POLICY) => {
    const f = n(count);
    if (f >= policy.frequency.vip) return 5;
    if (f >= policy.frequency.loyal) return 4;
    if (f >= policy.frequency.regular) return 3;
    if (f >= policy.frequency.repeat) return 2;
    if (f >= 1) return 1;
    return 1;
};

const scoreMonetary = (amount, policy = LOYALTY_POLICY) => {
    const m = n(amount);
    if (m >= policy.monetary.vip) return 5;
    if (m >= policy.monetary.high) return 4;
    if (m >= policy.monetary.mid) return 3;
    if (m >= policy.monetary.low) return 2;
    return 1;
};

const segmentFromScores = ({ r, f, m }) => {
    if (r >= 4 && f >= 4 && m >= 4) return 'Giá trị cao';
    if (f >= 3 && m >= 3 && r <= 2) return 'Nguy cơ rời bỏ';
    if (f >= 4 && r >= 3) return 'Thân thiết';
    if (f <= 2 && r >= 4) return 'Mới';
    if (r === 1) return 'Ngủ đông';
    return 'Tiềm năng';
};

/** Ngày lệch quá lớn = overflow/ngày lỗi — không bịa số ngày cho UI. */
const RECENCY_OVERFLOW_DAYS = 3650;

const isNeverPurchased = (row, last) => {
    if (!last) return true;
    return n(row.SoHoaDon) === 0 && n(row.TongChiTieu) === 0;
};

const sanitizeRecencyDays = (days) => {
    if (days == null || !Number.isFinite(days)) return null;
    if (days < 0 || days > RECENCY_OVERFLOW_DAYS) return null;
    return Math.round(days);
};

const isWinBackRisk = (row) => !row.chuaTungMua
    && (row.Segment === 'Nguy cơ rời bỏ' || row.Segment === 'Ngủ đông');

const computeCustomerRfm = (row, asOf, policy = LOYALTY_POLICY) => {
    const last = dateKey(row.LanMuaGanNhat);
    const chuaTungMua = isNeverPurchased(row, last);
    const recencyDays = chuaTungMua ? null : sanitizeRecencyDays(daysBetween(last, asOf));
    const r = scoreRecency(recencyDays, policy);
    const f = scoreFrequency(row.SoHoaDon, policy);
    const m = scoreMonetary(row.TongChiTieu, policy);
    const segment = chuaTungMua ? 'Chưa phát sinh' : segmentFromScores({ r, f, m });
    const offer = offerForSegment(segment, policy);
    return {
        MaKH: row.MaKH,
        TenKH: row.TenKH,
        HangThanhVien: row.HangThanhVien || 'Thường',
        DiemTichLuy: n(row.DiemTichLuy),
        SoHoaDon: n(row.SoHoaDon),
        TongChiTieu: n(row.TongChiTieu),
        LanMuaGanNhat: last || null,
        RecencyNgay: recencyDays,
        soNgayChuaMua: recencyDays,
        chuaTungMua,
        R: r,
        F: f,
        M: m,
        Segment: segment,
        GoiY: offer
    };
};

const computeRfmTable = (rows, asOf, policy = LOYALTY_POLICY) => {
    const asOfKey = dateKey(asOf) || new Date().toISOString().slice(0, 10);
    return (rows || []).map((row) => computeCustomerRfm(row, asOfKey, policy));
};

const summarizeSegments = (table) => {
    const counts = {};
    let atRisk = 0;
    let chuaPhatSinh = 0;
    let tongChiTieu = 0;
    let tongDiem = 0;
    for (const row of table) {
        counts[row.Segment] = (counts[row.Segment] || 0) + 1;
        if (isWinBackRisk(row)) atRisk += 1;
        if (row.chuaTungMua || row.Segment === 'Chưa phát sinh') chuaPhatSinh += 1;
        tongChiTieu += n(row.TongChiTieu);
        tongDiem += n(row.DiemTichLuy);
    }
    return {
        soKhach: table.length,
        tongChiTieu,
        tongDiem,
        atRisk,
        chuaPhatSinh,
        segments: counts
    };
};

const loadCompletedMemberInvoices = async (pool) => {
    const result = await pool.request().query(`
        SELECT kh.MaKH, kh.TenKH, kh.HangThanhVien, kh.DiemTichLuy,
               COUNT(hd.MaHD) SoHoaDon,
               COALESCE(SUM(hd.TongThanhToan),0) TongChiTieu,
               MAX(hd.NgayLap) LanMuaGanNhat
        FROM KhachHang kh
        LEFT JOIN HoaDon hd ON hd.MaKH = kh.MaKH AND hd.TrangThai = N'Hoàn thành'
        GROUP BY kh.MaKH, kh.TenKH, kh.HangThanhVien, kh.DiemTichLuy`);
    return result.recordset || [];
};

const monthBounds = (month) => {
    const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
    const now = new Date();
    const y = match ? Number(match[1]) : now.getFullYear();
    const m = match ? Number(match[2]) : now.getMonth() + 1;
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    const label = `Tháng ${m}/${y}`;
    return { month: `${y}-${String(m).padStart(2, '0')}`, from, to, label };
};

const loadMonthKpis = async (pool, month) => {
    const { sql } = require('../config/db');
    const bounds = monthBounds(month);
    const result = await pool.request()
        .input('Tu', sql.Date, bounds.from)
        .input('Den', sql.Date, bounds.to)
        .query(`
            SELECT
              COUNT(*) SoHoaDonThanhVien,
              COUNT(DISTINCT hd.MaKH) SoKhachMua,
              COALESCE(SUM(hd.TongThanhToan),0) DoanhThuThanhVien,
              COALESCE(SUM(hd.DiemCong),0) DiemCong,
              COALESCE(SUM(hd.DiemSuDung),0) DiemDung
            FROM HoaDon hd
            WHERE hd.TrangThai = N'Hoàn thành'
              AND hd.MaKH IS NOT NULL
              AND CONVERT(date, hd.NgayLap) BETWEEN @Tu AND @Den`);
    return { ...bounds, ...(result.recordset[0] || {}) };
};

const buildLoyaltyOverview = async (pool, user, opts = {}) => {
    assertLoyaltyManager(user);
    const asOf = opts.asOf || new Date().toISOString().slice(0, 10);
    const policy = opts.policy || await loadLoyaltyPolicy();
    const rows = await loadCompletedMemberInvoices(pool);
    const table = computeRfmTable(rows, asOf, policy);
    const summary = summarizeSegments(table);
    const kpi = await loadMonthKpis(pool, opts.month);
    const ranked = table.slice().sort((a, b) => b.TongChiTieu - a.TongChiTieu);
    const atRisk = ranked.filter(isWinBackRisk).slice(0, 30);
    const chuaPhatSinh = ranked.filter((row) => row.chuaTungMua).slice(0, 30);
    return {
        asOf,
        policy: publicPolicy(policy),
        summary,
        kpi,
        segments: ranked,
        atRisk,
        chuaPhatSinh,
        hieuLuc: require('./loyaltyApply').countOffersFromTable(ranked, policy),
        homNayAp: await require('./loyaltyApply').loadTodayApplyStats(pool)
    };
};

const loadServingCustomerLoyalty = async (pool, user, maKH) => {
    if (!hasUc(user, 'UC23') || !isRole(user, 'Thu ngân')) {
        const error = new Error('Thu ngân chỉ xem điểm khách đang phục vụ (UC23).');
        error.status = 403;
        throw error;
    }
    const id = String(maKH || '').trim();
    if (!id) {
        const error = new Error('Thiếu mã khách hàng.');
        error.status = 400;
        throw error;
    }
    const { loadCustomerOffer } = require('./loyaltyApply');
    const pack = await loadCustomerOffer(pool, id);
    if (!pack) {
        const error = new Error('Không tìm thấy khách hàng.');
        error.status = 404;
        throw error;
    }
    return {
        MaKH: pack.MaKH,
        TenKH: pack.TenKH,
        HangThanhVien: pack.HangThanhVien,
        DiemTichLuy: pack.DiemTichLuy,
        SoHoaDonHoanThanh: pack.SoHoaDonHoanThanh,
        LanMuaGanNhat: pack.LanMuaGanNhat,
        Segment: pack.Segment,
        GoiY: pack.GoiY,
        banner: pack.banner,
        canApply: pack.canApply,
        autoApply: false,
        cuaHangRfm: false
    };
};

const loadLoyaltySummary = async (pool, user) => {
    if (isRole(user, 'Quản lý') && hasUc(user, 'UC10')) {
        const overview = await buildLoyaltyOverview(pool, user, {});
        return {
            scope: 'ql',
            soKhach: overview.summary.soKhach,
            atRisk: overview.summary.atRisk,
            segments: overview.summary.segments,
            thang: overview.kpi.label,
            soHoaDonThanhVien: overview.kpi.SoHoaDonThanhVien,
            doanhThuThanhVien: overview.kpi.DoanhThuThanhVien,
            policy: overview.policy
        };
    }
    return { skipped: true, reason: 'RFM cửa hàng chỉ cho QL (UC10). TN dùng điểm khách đang phục vụ, không dump RFM.' };
};

module.exports = {
    scoreRecency,
    scoreFrequency,
    scoreMonetary,
    segmentFromScores,
    computeCustomerRfm,
    computeRfmTable,
    summarizeSegments,
    isWinBackRisk,
    buildLoyaltyOverview,
    loadServingCustomerLoyalty,
    loadLoyaltySummary,
    monthBounds,
    assertLoyaltyManager
};
