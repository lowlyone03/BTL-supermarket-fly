const { sql } = require('../config/db');
const { resolveReportingPeriod } = require('./reportingPeriod');
const { listForRole, isRole } = require('./inboxService');
const { codesOf, hasUc } = require('./effectivePermissions');
const { action } = require('./assistantNav');
const { scoreSupplier, scorePurchaseOrder, scoreShift } = require('./riskEngine');
const storeProfitLoss = require('./storeProfitLoss');

const n = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value) => `${Math.round(n(value)).toLocaleString('vi-VN')} đ`;

const redact = (row) => {
    if (!row || typeof row !== 'object') return row;
    const next = { ...row };
    delete next.SDT;
    delete next.Email;
    delete next.MaSoThue;
    delete next.CCCD;
    if (next.TenKH) next.TenKH = String(next.TenKH).slice(0, 24);
    return next;
};

const withTimeout = (promise, label, ms = 4000) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout:${label}`)), ms))
]);

const safe = async (label, fn) => {
    try {
        return await withTimeout(fn(), label);
    } catch {
        return { failed: true, label, message: `không lấy được ${label}, không bịa` };
    }
};

const queryRows = async (pool, text) => {
    const result = await pool.request().query(text);
    return result.recordset || [];
};

const loadRevenueTrend = async (pool) => {
    const rows = await queryRows(pool, `
        SELECT CONVERT(varchar(10), CONVERT(date, hd.NgayLap), 23) Ngay,
               COALESCE(SUM(hd.TongThanhToan),0) DoanhThu,
               COUNT(*) SoHoaDon
        FROM HoaDon hd
        WHERE hd.TrangThai=N'Hoàn thành'
          AND CONVERT(date,hd.NgayLap)>=DATEADD(day,-14,CONVERT(date,GETDATE()))
        GROUP BY CONVERT(date, hd.NgayLap)
        ORDER BY Ngay`);
    return rows;
};

const loadTopSellers = async (pool) => {
    return queryRows(pool, `
        SELECT TOP 5 sp.MaSP, sp.TenSP, SUM(ct.SoLuong) SoLuong,
               COALESCE(SUM(ct.ThanhTienSauGiam), SUM(ct.SoLuong*ct.DonGia), 0) DoanhThu
        FROM ChiTietHoaDon ct
        JOIN HoaDon hd ON hd.MaHD=ct.MaHD
        JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE hd.TrangThai=N'Hoàn thành'
          AND CONVERT(date,hd.NgayLap)>=DATEADD(day,-7,CONVERT(date,GETDATE()))
        GROUP BY sp.MaSP, sp.TenSP
        ORDER BY SoLuong DESC`);
};

const loadMomoAndDrafts = async (pool, { maNV = null, maCa = null } = {}) => {
    const momoReq = pool.request();
    const draftReq = pool.request();
    let momoScope = ' AND CONVERT(date, COALESCE(tt.NgayTT, hd.NgayLap))=CONVERT(date,GETDATE())';
    let draftScope = ' AND CONVERT(date,hd.NgayLap)=CONVERT(date,GETDATE())';
    if (maCa) {
        momoReq.input('MaCa', sql.VarChar, maCa);
        draftReq.input('MaCa', sql.VarChar, maCa);
        momoScope = ' AND hd.MaCa=@MaCa';
        draftScope = ' AND hd.MaCa=@MaCa';
    } else if (maNV) {
        momoReq.input('MaNV', sql.VarChar, maNV);
        draftReq.input('MaNV', sql.VarChar, maNV);
        momoScope += ' AND hd.MaNV=@MaNV';
        draftScope = ' AND hd.MaNV=@MaNV AND CONVERT(date,hd.NgayLap)=CONVERT(date,GETDATE())';
    }
    const momo = await momoReq.query(`
        SELECT
          SUM(CASE WHEN tt.PhuongThuc=N'QR' AND tt.TrangThai=N'Thành công' AND hd.TrangThai=N'Hoàn thành' THEN 1 ELSE 0 END) SoHoaDonMoMo,
          COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'QR' AND tt.TrangThai=N'Thành công' AND hd.TrangThai=N'Hoàn thành' THEN tt.SoTien ELSE 0 END),0) TongMoMo,
          SUM(CASE WHEN tt.PhuongThuc=N'QR' AND tt.TrangThai=N'Chờ xác nhận' THEN 1 ELSE 0 END) MoMoCho
        FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
        WHERE 1=1 ${momoScope}`);
    const drafts = await draftReq.query(`
        SELECT COUNT(*) SoNhap
        FROM HoaDon hd
        WHERE hd.TrangThai=N'Nháp' ${draftScope}`);
    return { ...(momo.recordset[0] || {}), SoNhap: drafts.recordset[0]?.SoNhap || 0 };
};

const loadReturnsTrend = async (pool) => {
    const rows = await queryRows(pool, `
        SELECT
          SUM(CASE WHEN CONVERT(date,dt.NgayLap)>=DATEADD(day,-7,CONVERT(date,GETDATE())) THEN 1 ELSE 0 END) TuanNay,
          SUM(CASE WHEN CONVERT(date,dt.NgayLap)>=DATEADD(day,-14,CONVERT(date,GETDATE()))
                    AND CONVERT(date,dt.NgayLap)<DATEADD(day,-7,CONVERT(date,GETDATE())) THEN 1 ELSE 0 END) TuanTruoc
        FROM PhieuDoiTra dt`);
    return rows[0] || { TuanNay: 0, TuanTruoc: 0 };
};

const loadPoPriceSignals = async (pool) => {
    return queryRows(pool, `
        SELECT TOP 8 po.MaPO, ncc.TenNCC, ncc.MaNCC, ct.MaSP, sp.TenSP, ct.DonGia GiaHienTai, prev.DonGia GiaTruoc,
               CASE WHEN prev.DonGia>0 THEN ((ct.DonGia-prev.DonGia)*100.0/prev.DonGia) ELSE 0 END Pct,
               po.NgayGiaoDuKien, po.TrangThai, ct.SLConThieu, ct.SoLuong
        FROM DonMuaHang po
        JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
        JOIN ChiTietDonMua ct ON ct.MaPO=po.MaPO
        JOIN SanPham sp ON sp.MaSP=ct.MaSP
        OUTER APPLY (
            SELECT TOP 1 ct2.DonGia
            FROM DonMuaHang po2
            JOIN ChiTietDonMua ct2 ON ct2.MaPO=po2.MaPO
            WHERE po2.MaNCC=po.MaNCC AND ct2.MaSP=ct.MaSP AND po2.MaPO<>po.MaPO
              AND po2.TrangThai NOT IN (N'Nháp', N'Từ chối', N'Đã hủy')
              AND po2.NgayLap<po.NgayLap
            ORDER BY po2.NgayLap DESC
        ) prev
        WHERE po.TrangThai IN (N'Chờ duyệt', N'Đã duyệt', N'Đã gửi Nhà cung cấp', N'Nhà cung cấp xác nhận', N'Đang giao')
          AND prev.DonGia IS NOT NULL AND ct.DonGia > prev.DonGia * 1.05
        ORDER BY Pct DESC`);
};

const loadSalesVelocity = async (pool, maList) => {
    if (!maList?.length) return [];
    const request = pool.request();
    maList.slice(0, 20).forEach((ma, index) => request.input(`P${index}`, sql.VarChar, ma));
    const inList = maList.slice(0, 20).map((_, index) => `@P${index}`).join(',');
    const rows = await request.query(`
        SELECT ct.MaSP, SUM(ct.SoLuong) Sold7, SUM(CASE WHEN CONVERT(date,hd.NgayLap)>=DATEADD(day,-28,CONVERT(date,GETDATE())) THEN ct.SoLuong ELSE 0 END) Sold28
        FROM ChiTietHoaDon ct JOIN HoaDon hd ON hd.MaHD=ct.MaHD
        WHERE hd.TrangThai=N'Hoàn thành'
          AND CONVERT(date,hd.NgayLap)>=DATEADD(day,-28,CONVERT(date,GETDATE()))
          AND ct.MaSP IN (${inList})
        GROUP BY ct.MaSP`);
    return rows.recordset;
};

const stripPiiPayables = (pack) => {
    if (!pack || pack.failed) return pack;
    return {
        ...pack,
        items: (pack.items || []).slice(0, 20).map((row) => redact({
            MaCNPTra: row.MaCNPTra,
            MaNCC: row.MaNCC,
            TenNCC: row.TenNCC,
            SoTienConLai: row.SoTienConLai,
            HanThanhToan: row.HanThanhToan,
            TrangThaiHienTai: row.TrangThaiHienTai || row.TrangThaiCongNo,
            SoNgayConLai: row.SoNgayConLai,
            MaPO: row.MaPO
        })),
        summary: pack.summary || null
    };
};

const collectFacts = async (pool, user, periodKey = '') => {
    const facts = { role: user?.TenVaiTro, permissions: codesOf(user), sources: [] };
    facts.inbox = await safe('inbox', () => listForRole(pool, user));
    if (!facts.inbox?.failed) facts.sources.push('Hộp thư');

    if (isRole(user, 'Quản lý') && (hasUc(user, 'UC10') || hasUc(user, 'UC04'))) {
        const { loadAdminDashboard, loadApprovalQueues, loadPayablesOverview, loadSalesShifts } = require('../controllers/adminController');
        facts.admin = await safe('dashboard quản lý', () => loadAdminDashboard(pool));
        if (!facts.admin?.failed) facts.sources.push('Dashboard quản lý');
        facts.approvals = await safe('hàng chờ duyệt', () => loadApprovalQueues(pool));
        if (!facts.approvals?.failed) facts.sources.push('Hàng chờ duyệt');
        if (hasUc(user, 'UC10')) {
            facts.payables = stripPiiPayables(await safe('công nợ QL', () => loadPayablesOverview(pool, {})));
            if (!facts.payables?.failed) facts.sources.push('Công nợ');
            facts.shifts = await safe('ca bán hàng', () => loadSalesShifts(pool, {}));
            if (!facts.shifts?.failed) facts.sources.push('Báo cáo ca');
        }
    }

    if (isRole(user, 'Nhân viên mua hàng') && hasUc(user, 'UC12')) {
        const { loadPurchaseRequests } = require('../controllers/warehouseController');
        facts.requests = await safe('đề nghị mua', () => loadPurchaseRequests(pool, user, { purchasing: true }));
        if (!facts.requests?.failed) facts.sources.push('Đề nghị mua hàng');
    }
    if ((isRole(user, 'Nhân viên mua hàng') && hasUc(user, 'UC13')) || (isRole(user, 'Quản lý') && hasUc(user, 'UC05'))) {
        const { loadPurchaseOrders } = require('../controllers/purchaseOrderController');
        facts.orders = await safe('đơn mua', () => loadPurchaseOrders(pool, {}));
        if (!facts.orders?.failed) facts.sources.push('Đơn mua hàng');
        facts.poPrices = await safe('giá PO', () => loadPoPriceSignals(pool));
        if (!facts.poPrices?.failed) facts.sources.push('Chi tiết đơn mua vs đơn trước');
    }

    if (isRole(user, 'Thủ kho') && hasUc(user, 'UC15')) {
        const { loadWarehouseDashboard, loadInventory } = require('../controllers/warehouseController');
        facts.warehouse = await safe('tổng quan kho', () => loadWarehouseDashboard(pool, user));
        if (!facts.warehouse?.failed) facts.sources.push('Tổng quan kho');
        facts.inventory = await safe('tồn kho', () => loadInventory(pool, user, { lowOnly: true }));
        if (!facts.inventory?.failed) facts.sources.push('Tồn kho');
    }

    if (isRole(user, 'Thu ngân') && hasUc(user, 'UC22')) {
        const { loadCurrentShiftSummary } = require('../controllers/cashierController');
        facts.shift = await safe('ca hiện tại', () => loadCurrentShiftSummary(pool, user));
        if (!facts.shift?.failed) facts.sources.push('Ca bán hàng');
    }

    if (isRole(user, 'Kế toán') && hasUc(user, 'UC37')) {
        const { loadUnpostedQueue } = require('../controllers/ledgerController');
        facts.unposted = await safe('chờ ghi sổ', () => loadUnpostedQueue(pool));
        if (!facts.unposted?.failed) facts.sources.push('Chờ ghi sổ');
    }
    if (isRole(user, 'Kế toán') && hasUc(user, 'UC28')) {
        const { loadPayablesList } = require('../controllers/paymentVoucherController');
        facts.payables = stripPiiPayables(await safe('công nợ KT', () => loadPayablesList(pool, {})));
        if (!facts.payables?.failed) facts.sources.push('Công nợ');
    }
    if (isRole(user, 'Kế toán') && hasUc(user, 'UC27')) {
        const { loadPurchaseInvoices } = require('../controllers/accountingController');
        facts.purchaseInvoices = await safe('HĐMH', () => loadPurchaseInvoices(pool, { match: 'Chưa đối chiếu' }));
        if (!facts.purchaseInvoices?.failed) facts.sources.push('Hóa đơn mua hàng');
    }
    if (isRole(user, 'Kế toán') && hasUc(user, 'UC29')) {
        const { loadClosedShifts } = require('../controllers/settlementController');
        facts.settlements = await safe('ca chờ phiếu thu', () => loadClosedShifts(pool, {}));
        if (!facts.settlements?.failed) facts.sources.push('Ca và phiếu thu');
    }

    if ((hasUc(user, 'UC10') && isRole(user, 'Quản lý')) || (hasUc(user, 'UC38') || hasUc(user, 'UC43'))) {
        try {
            const month = /^\d{4}-\d{2}$/.test(String(periodKey || '')) ? String(periodKey) : undefined;
            const resolved = { period: resolveReportingPeriod({ periodType: 'month', period: month }) };
            if (hasUc(user, 'UC10') || hasUc(user, 'UC43')) {
                facts.pnl = await safe('KQKD cửa hàng', () => storeProfitLoss.buildReport(pool, resolved));
                if (!facts.pnl?.failed) facts.sources.push('KQKD');
            }
            if (hasUc(user, 'UC38') || hasUc(user, 'UC43')) {
                const { loadIncomeStatement, loadCashFlow } = require('../controllers/ledgerController');
                facts.income = await safe('KQKD sổ cái', () => loadIncomeStatement(pool, resolved.period));
                facts.cashflow = await safe('dòng tiền', () => loadCashFlow(pool, resolved.period));
                if (!facts.income?.failed) facts.sources.push('KQKD');
                if (!facts.cashflow?.failed) facts.sources.push('Lưu chuyển tiền tệ');
            }
        } catch {
            facts.pnl = facts.pnl || { failed: true, message: 'không lấy được KQKD, không bịa' };
        }
    }

    const canRevenue = isRole(user, 'Quản lý') && hasUc(user, 'UC10');
    const canPosStats = isRole(user, 'Thu ngân') || canRevenue;
    if (canRevenue) {
        facts.trend = await safe('xu hướng DT', () => loadRevenueTrend(pool));
        facts.topSellers = await safe('top bán', () => loadTopSellers(pool));
        facts.returns = await safe('đổi trả', () => loadReturnsTrend(pool));
        if (!facts.trend?.failed) facts.sources.push('Hóa đơn hoàn thành 14 ngày');
        if (!facts.topSellers?.failed) facts.sources.push('Chi tiết HĐ 7 ngày');
    }
    if (canPosStats) {
        const maCa = facts.shift?.open ? facts.shift.summary?.MaCa : null;
        const maNV = isRole(user, 'Thu ngân') ? user.MaNV : null;
        facts.momo = await safe('QR / nháp', () => loadMomoAndDrafts(pool, { maNV, maCa }));
        if (!facts.momo?.failed) facts.sources.push(isRole(user, 'Thu ngân') ? 'Thanh toán / HĐ ca hiện tại' : 'Thanh toán / HĐ hôm nay');
    }

    const stockRows = (facts.inventory?.items || facts.admin?.lowStock || facts.warehouse?.lowStock || []).slice(0, 12);
    if (stockRows.length && (hasUc(user, 'UC15') || hasUc(user, 'UC10'))) {
        facts.velocity = await safe('tốc độ bán', () => loadSalesVelocity(pool, stockRows.map((row) => row.MaSP).filter(Boolean)));
    }
    return facts;
};

const kpisFromFacts = (facts, user) => {
    const chips = [];
    const admin = facts.admin && !facts.admin.failed ? facts.admin : null;
    if (admin?.revenue) {
        chips.push({ id: 'dt', label: 'DT hôm nay', value: money(admin.revenue.DoanhThuHomNay), source: 'Dashboard quản lý' });
        chips.push({ id: 'gp', label: 'Lãi gộp hôm nay', value: money(admin.revenue.LaiGopHomNay), source: 'Dashboard quản lý' });
    }
    if (admin?.pendingApprovals) {
        chips.push({ id: 'pending', label: 'Chờ duyệt', value: String(admin.pendingApprovals.TongChoDuyet || 0), source: 'Dashboard quản lý' });
    }
    if (facts.shift?.open) {
        chips.push({ id: 'cash', label: 'TM hệ thống', value: money(facts.shift.summary?.TienMatHeThong), source: 'Tóm tắt ca' });
        chips.push({ id: 'momo', label: 'QR ca', value: money(facts.shift.summary?.TongTienQR), source: 'Tóm tắt ca — không vào két' });
    }
    if (facts.momo && !facts.momo.failed) {
        chips.push({ id: 'momo-count', label: 'HĐ QR', value: String(facts.momo.SoHoaDonMoMo || 0), source: 'Thanh toán QR thành công' });
        chips.push({ id: 'drafts', label: 'HĐ nháp', value: String(facts.momo.SoNhap || 0), source: 'Hóa đơn nháp' });
    }
    if (facts.payables && !facts.payables.failed && facts.payables.summary) {
        chips.push({ id: 'ap', label: 'Công nợ còn', value: money(facts.payables.summary.TongConLai), source: hasUc(user, 'UC28') ? 'Công nợ KT' : 'Công nợ QL' });
        chips.push({ id: 'overdue', label: 'Quá hạn', value: money(facts.payables.summary.TongQuaHan || 0), source: 'Công nợ' });
    }
    if (facts.pnl && !facts.pnl.failed && facts.pnl.kqkd) {
        chips.push({ id: 'kqkd', label: `KQKD ${facts.pnl.kqkd.trangThai || ''}`.trim(), value: money(facts.pnl.kqkd.loiNhuan), source: 'Báo cáo lãi lỗ cửa hàng — không trừ trả NCC' });
    }
    if (facts.unposted && !facts.unposted.failed && Array.isArray(facts.unposted)) {
        chips.push({ id: 'unposted', label: 'Chờ ghi sổ', value: String(facts.unposted.length), source: 'Chờ ghi sổ — Kế toán' });
    }
    if (facts.warehouse && !facts.warehouse.failed) {
        chips.push({ id: 'restock', label: 'Cần bổ sung', value: String(facts.warehouse.summary?.CanBoSung || 0), source: 'Tổng quan kho' });
    }
    if (facts.admin?.lowStock && !hasUc(user, 'UC15')) {
        chips.push({ id: 'low', label: 'Tồn thấp TOP', value: String(facts.admin.lowStock.length), source: 'Dashboard quản lý' });
    }
    return chips.slice(0, 8);
};

const anomaliesFromFacts = (facts, user) => {
    const list = [];
    const today = new Date();
    const trend = Array.isArray(facts.trend) ? facts.trend : [];
    if (trend.length >= 3 && facts.admin?.revenue) {
        const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(today);
        const todayRow = trend.find((row) => String(row.Ngay).slice(0, 10) === todayKey);
        const others = trend.filter((row) => String(row.Ngay).slice(0, 10) !== todayKey);
        const avg = others.reduce((sum, row) => sum + n(row.DoanhThu), 0) / Math.max(others.length, 1);
        const current = n(todayRow?.DoanhThu ?? facts.admin.revenue.DoanhThuHomNay);
        if (avg > 0) {
            const delta = ((current - avg) / avg) * 100;
            if (Math.abs(delta) >= 15) {
                list.push({
                    type: 'revenue_deviation',
                    object: 'Doanh thu hôm nay',
                    deltaPct: Math.round(delta),
                    severity: Math.abs(delta) >= 30 ? 'High' : 'Medium',
                    confidence: others.length >= 5 ? 'high' : 'medium',
                    evidence: `Hôm nay ${money(current)} so với TB ${others.length} ngày gần đó ${money(avg)} (${delta >= 0 ? '+' : ''}${Math.round(delta)}%).`,
                    source: 'Hóa đơn hoàn thành 14 ngày',
                    nextAction: action('managerReports'),
                    fallback: others.length < 7 ? 'Chưa đủ 14 ngày lịch sử — so với các ngày có HĐ.' : null
                });
            }
        } else {
            list.push({
                type: 'revenue_deviation',
                object: 'Doanh thu hôm nay',
                deltaPct: 0,
                severity: 'Low',
                confidence: 'low',
                evidence: `Hôm nay ${money(current)}. Chưa đủ ngày đối chiếu để gọi là lệch.`,
                source: 'Hóa đơn hoàn thành',
                nextAction: action('managerReports'),
                fallback: 'Thiếu lịch sử ngày tương đương — engine không bịa TB.'
            });
        }
    }

    const stock = (facts.inventory?.items || facts.warehouse?.lowStock || facts.admin?.lowStock || []).slice(0, 8);
    const velocity = Array.isArray(facts.velocity) ? facts.velocity : [];
    const velMap = new Map(velocity.map((row) => [row.MaSP, row]));
    for (const row of stock.slice(0, 4)) {
        const sold = velMap.get(row.MaSP);
        const sold7 = n(sold?.Sold7);
        list.push({
            type: 'low_stock',
            object: `${row.MaSP} ${row.TenSP || ''}`.trim(),
            deltaPct: null,
            severity: n(row.SLTon) <= 0 ? 'High' : 'Medium',
            confidence: sold7 > 0 ? 'high' : 'medium',
            evidence: sold7 > 0
                ? `${row.MaSP} tồn ${row.SLTon} / min ${row.TonKhoToiThieu}; bán 7 ngày ${sold7}. Cần bổ sung — không lập PO.`
                : `${row.MaSP} tồn ${row.SLTon} / min ${row.TonKhoToiThieu}. Chưa thấy tốc độ bán 7 ngày.`,
            source: hasUc(user, 'UC15') ? 'Tồn kho' : 'Dashboard quản lý',
            nextAction: action(hasUc(user, 'UC15') ? 'inventory' : 'home')
        });
    }

    if (facts.momo && !facts.momo.failed) {
        if (n(facts.momo.SoNhap) > 0) {
            list.push({
                type: 'draft_invoices',
                object: 'Hóa đơn nháp',
                severity: 'Medium',
                confidence: 'high',
                evidence: `${facts.momo.SoNhap} hóa đơn nháp đang treo.`,
                source: isRole(user, 'Thu ngân') ? 'HĐ ca/thu ngân' : 'HĐ hôm nay',
                nextAction: action(isRole(user, 'Thu ngân') ? 'cashierInvoices' : 'home')
            });
        }
        if (n(facts.momo.MoMoCho) > 0) {
            list.push({
                type: 'momo_pending',
                object: 'QR chờ xác nhận',
                severity: 'Medium',
                confidence: 'high',
                evidence: `${facts.momo.MoMoCho} thanh toán QR đang chờ. Trợ lý không tick hộ.`,
                source: 'Thanh toán QR',
                nextAction: action(isRole(user, 'Thu ngân') ? 'cashierPos' : 'home')
            });
        }
    }

    const payItems = facts.payables && !facts.payables.failed ? (facts.payables.items || []) : [];
    const due = payItems.filter((row) => n(row.SoTienConLai) > 0 && n(row.SoNgayConLai) <= 3).slice(0, 5);
    for (const row of due) {
        list.push({
            type: 'payable_due',
            object: `${row.MaCNPTra} ${row.TenNCC || ''}`.trim(),
            severity: n(row.SoNgayConLai) < 0 ? 'High' : 'Medium',
            confidence: 'high',
            evidence: `${row.MaCNPTra} còn ${money(row.SoTienConLai)}, hạn ${String(row.HanThanhToan || '').slice(0, 10)} (${row.SoNgayConLai} ngày).`,
            source: hasUc(user, 'UC28') ? 'Công nợ' : 'Công nợ',
            nextAction: action(hasUc(user, 'UC28') ? 'accountingPayables' : 'managerPayables')
        });
    }

    if (facts.returns && !facts.returns.failed && n(facts.returns.TuanTruoc) >= 0) {
        const now = n(facts.returns.TuanNay);
        const prev = n(facts.returns.TuanTruoc);
        if (prev > 0 && now > prev * 1.3) {
            list.push({
                type: 'returns_up',
                object: 'Đổi trả 7 ngày',
                severity: 'Medium',
                confidence: 'medium',
                evidence: `${now} phiếu tuần này so với ${prev} tuần trước.`,
                source: 'Phiếu đổi trả',
                nextAction: action('home')
            });
        }
    }

    const prices = Array.isArray(facts.poPrices) ? facts.poPrices : [];
    for (const row of prices.slice(0, 3)) {
        list.push({
            type: 'po_price_up',
            object: `${row.MaPO} ${row.MaSP}`,
            severity: n(row.Pct) >= 15 ? 'High' : 'Medium',
            confidence: 'high',
            evidence: `${row.MaPO} ${row.MaSP}: ${money(row.GiaHienTai)} vs đơn trước ${money(row.GiaTruoc)} (+${Math.round(n(row.Pct))}%).`,
            source: 'Chi tiết Đơn mua vs đơn gần nhất cùng SP/NCC',
            nextAction: action('purchaseOrders')
        });
    }

    const shifts = facts.shifts?.items || facts.settlements?.items || [];
    const skewed = shifts.filter((row) => Math.abs(n(row.ChenhLech)) >= 1000).slice(0, 3);
    for (const row of skewed) {
        list.push({
            type: 'cash_variance',
            object: row.MaCa,
            severity: Math.abs(n(row.ChenhLech)) >= 50000 ? 'High' : 'Medium',
            confidence: 'high',
            evidence: `Ca ${row.MaCa} lệch két ${money(row.ChenhLech)} (TM hệ thống ${money(row.TienMatHeThong)}).`,
            source: isRole(user, 'Kế toán') ? 'Ca và phiếu thu' : 'Báo cáo ca',
            nextAction: action(isRole(user, 'Kế toán') ? 'settlements' : 'managerReports')
        });
    }

    if (isRole(user, 'Quản lý') && facts.approvals && !facts.approvals.failed) {
        const count = (facts.approvals.warehouse?.length || 0) + (facts.approvals.finance?.length || 0) + (facts.approvals.payroll?.length || 0);
        if (count > 0) {
            list.push({
                type: 'approval_backlog',
                object: 'Chứng từ chờ duyệt',
                severity: count >= 5 ? 'High' : 'Medium',
                confidence: 'high',
                evidence: `${count} hồ sơ đang chờ (kho/tài chính/lương). Trợ lý không duyệt hộ.`,
                source: 'Trung tâm phê duyệt',
                nextAction: action('approvals')
            });
        }
    }
    if (facts.unposted && !facts.unposted.failed && Array.isArray(facts.unposted) && facts.unposted.length) {
        list.push({
            type: 'unposted',
            object: 'Chờ ghi sổ',
            severity: facts.unposted.length >= 5 ? 'High' : 'Medium',
            confidence: 'high',
            evidence: `${facts.unposted.length} chứng từ chờ ghi sổ.`,
            source: 'Chờ ghi sổ',
            nextAction: action('unposted')
        });
    }
    return list.slice(0, 12);
};

const risksFromFacts = (facts, user) => {
    const risks = [];
    const prices = Array.isArray(facts.poPrices) ? facts.poPrices : [];
    const byNcc = new Map();
    for (const row of prices) {
        const cur = byNcc.get(row.MaNCC) || { TenNCC: row.TenNCC, lateDays: 0, priceUpPct: 0, shortQty: 0, orderedQty: 0 };
        cur.priceUpPct = Math.max(cur.priceUpPct, n(row.Pct));
        cur.shortQty += n(row.SLConThieu);
        cur.orderedQty += n(row.SoLuong);
        if (row.NgayGiaoDuKien) {
            const due = new Date(row.NgayGiaoDuKien);
            const days = Math.round((Date.now() - due.getTime()) / 86400000);
            if (days > 0 && n(row.SLConThieu) > 0) cur.lateDays = Math.max(cur.lateDays, days);
        }
        byNcc.set(row.MaNCC, cur);
    }
    if ((isRole(user, 'Quản lý') && hasUc(user, 'UC10')) || isRole(user, 'Nhân viên mua hàng') || isRole(user, 'Kế toán')) {
        for (const [ma, row] of [...byNcc.entries()].slice(0, 5)) {
            const scored = scoreSupplier(row);
            if (scored.score >= 20) {
                risks.push({
                    ...scored,
                    object: `${ma} ${row.TenNCC || ''}`.trim(),
                    evidence: `Giá tăng tối đa ${Math.round(row.priceUpPct)}%, giao thiếu ${row.shortQty}/${row.orderedQty}, trễ ${row.lateDays} ngày.`,
                    source: 'Đơn mua / giá vs lịch sử',
                    nextAction: action(isRole(user, 'Nhân viên mua hàng') ? 'purchaseOrders' : (hasUc(user, 'UC28') ? 'accountingPayables' : 'managerPayables'))
                });
            }
        }
        for (const row of prices.slice(0, 4)) {
            const lateDays = row.NgayGiaoDuKien ? Math.max(0, Math.round((Date.now() - new Date(row.NgayGiaoDuKien).getTime()) / 86400000)) : 0;
            const scored = scorePurchaseOrder({
                priceUpPct: n(row.Pct),
                relatedLowStock: Boolean((facts.admin?.lowStock || []).some((item) => item.MaSP === row.MaSP)),
                lateDays
            });
            if (scored.score >= 25) {
                risks.push({
                    ...scored,
                    object: row.MaPO,
                    evidence: `${row.MaSP} giá +${Math.round(n(row.Pct))}%. Checklist trước duyệt — không duyệt hộ.`,
                    source: 'Đơn mua',
                    nextAction: action(isRole(user, 'Quản lý') ? 'approvals' : 'purchaseOrders')
                });
            }
        }
    }
    const shifts = facts.shifts?.items || facts.settlements?.items || [];
    const byCashier = new Map();
    for (const row of shifts) {
        if (Math.abs(n(row.ChenhLech)) < 1000) continue;
        const key = row.MaNV || row.TenNV;
        const cur = byCashier.get(key) || { TenNV: row.TenNV, count: 0, last: row };
        cur.count += 1;
        cur.last = row;
        byCashier.set(key, cur);
    }
    if (isRole(user, 'Quản lý') || isRole(user, 'Kế toán') || isRole(user, 'Thu ngân')) {
        for (const row of [...byCashier.values()].slice(0, 4)) {
            const last = row.last;
            const scored = scoreShift({
                varianceAbs: last.ChenhLech,
                systemCash: last.TienMatHeThong,
                repeatCount: row.count
            });
            if (scored.score >= 20) {
                risks.push({
                    ...scored,
                    object: `${last.MaCa} · ${row.TenNV || ''}`.trim(),
                    evidence: `Lệch ${money(last.ChenhLech)}, lặp ${row.count} ca.`,
                    source: isRole(user, 'Thu ngân') ? 'Ca của bạn' : 'Báo cáo ca / phiếu thu',
                    nextAction: action(isRole(user, 'Kế toán') ? 'settlements' : 'cashierShifts')
                });
            }
        }
    }
    return risks.slice(0, 8);
};

const prioritiesFrom = (anomalies, risks, facts, user) => {
    const scored = [
        ...anomalies.map((item) => ({ ...item, rank: item.severity === 'High' ? 3 : item.severity === 'Medium' ? 2 : 1, kind: 'anomaly' })),
        ...risks.map((item) => ({ ...item, rank: item.band === 'High' ? 3 : item.band === 'Medium' ? 2 : 1, kind: 'risk' }))
    ].sort((a, b) => b.rank - a.rank);
    const top = scored.slice(0, 3).map((item, index) => ({
        order: index + 1,
        title: item.object || item.type,
        why: item.evidence,
        nextAction: item.nextAction,
        source: item.source
    }));
    if (!top.length && facts.inbox && !facts.inbox.failed && facts.inbox.length) {
        return facts.inbox.slice(0, 3).map((item, index) => ({
            order: index + 1,
            title: item.title,
            why: item.detail || 'Việc chờ trên inbox.',
            nextAction: item.target ? { label: 'Mở việc', target: item.target } : action('home'),
            source: 'Inbox'
        }));
    }
    if (!top.length) {
        return [{
            order: 1,
            title: 'Không có bất thường nổi bật',
            why: `Tài khoản ${user?.TenVaiTro || ''} không có tín hiệu ưu tiên từ engine lúc này.`,
            nextAction: action('home'),
            source: 'Fly Intelligence Center'
        }];
    }
    return top;
};

const insightsFromFacts = (facts, user) => {
    const cards = [];
    const pnl = facts.pnl && !facts.pnl.failed ? facts.pnl : null;
    const cf = facts.cashflow && !facts.cashflow.failed ? facts.cashflow : null;
    if (pnl?.kqkd) {
        const profit = n(pnl.kqkd.loiNhuan);
        const dt = n(pnl.kqkd.doanhThuThuan);
        const gp = n(pnl.kqkd.loiNhuanGop);
        const gv = n(pnl.hoatDong?.giaVon?.giaVonThuan);
        const chiNcc = n(pnl.dongTien?.chiNcc);
        const tm = n(pnl.tienMat?.tienMatPhieuThu);
        const momo = n(pnl.tienMat?.qr ?? facts.momo?.TongMoMo);
        if (dt || gv) {
            const margin = dt ? Math.round((gp / dt) * 1000) / 10 : 0;
            cards.push({
                id: 'dt-vs-gv',
                title: 'Doanh thu thuần so với giá vốn',
                body: `DT thuần ${money(dt)} − GV thuần ${money(gv)} = lãi gộp ${money(gp)} (biên ${margin}%). KQKD ${money(profit)} không trừ trả NCC.`,
                evidence: [
                    { claim: 'Doanh thu thuần', numbers: [money(dt)], source: 'P&L cửa hàng', confidence: 'high' },
                    { claim: 'Giá vốn thuần', numbers: [money(gv)], source: 'P&L cửa hàng', confidence: 'high' },
                    { claim: 'Lãi gộp', numbers: [money(gp)], source: 'DT − GV', confidence: 'high' }
                ],
                nextAction: action('kqkd')
            });
        }
        cards.push({
            id: 'profit-vs-cash',
            title: 'Vì sao có lãi nhưng tiền mặt có thể giảm?',
            body: profit > 0 && (chiNcc > 0 || tm < profit)
                ? `KQKD ${money(profit)} (không trừ trả NCC). Chi NCC trên dòng tiền ${money(chiNcc)}. Tiền mặt phiếu thu ${money(tm)}. Lãi kế toán ≠ tiền trong két.`
                : `KQKD kỳ này ${money(profit)} — ${pnl.kqkd.trangThai}. Trả NCC nằm dòng tiền, không trừ kqkdLoiNhuan lần nữa.`,
            evidence: [
                { claim: 'kqkdLoiNhuan', numbers: [money(profit)], source: pnl.congThuc?.laiLo || 'P&L cửa hàng', confidence: 'high' },
                { claim: 'Chi NCC (dòng tiền / 331)', numbers: [money(chiNcc)], source: 'Phiếu chi thành công trong kỳ', confidence: 'high' }
            ],
            nextAction: action('kqkd')
        });
        cards.push({
            id: 'pay-ncc-not-pnl',
            title: '331 và KQKD: trả NCC không trừ lãi lần nữa',
            body: `Giá vốn đã ghi lúc bán / khi mua đã khớp. Trả NCC giảm 331 (${money(chiNcc)}), nằm LCTT. Không trừ KQKD ${money(profit)}.`,
            evidence: [
                { claim: 'Luật Fly', numbers: ['không trừ kqkdLoiNhuan'], source: 'FAQ / cẩm nang kế toán mini', confidence: 'high' }
            ],
            nextAction: action('cashflow')
        });
        if (tm || momo) {
            cards.push({
                id: 'ket-vs-momo',
                title: 'Két tiền mặt và ZaloPay/QR (112)',
                body: `Két (phiếu thu TM) ${money(tm)}. ZaloPay/QR ${money(momo)} vào 112, không vào két. DT đã ghi lúc HĐ hoàn thành.`,
                evidence: [
                    { claim: 'Tiền mặt phiếu thu', numbers: [money(tm)], source: 'P&L / phiếu thu ca', confidence: 'high' },
                    { claim: 'ZaloPay / QR', numbers: [money(momo)], source: 'Thanh toán QR', confidence: facts.momo && !facts.momo.failed ? 'high' : 'medium' }
                ],
                nextAction: action(isRole(user, 'Thu ngân') ? 'cashierShifts' : 'cashflow')
            });
        }
    }
    cards.push({
        id: 'momo-not-drawer',
        title: 'Vì sao ZaloPay/QR không vào két?',
        body: 'Két ca chỉ tiền mặt (TM thu − hoàn TM). QR (ZaloPay; lịch sử MoMo) không vào két, không vào phiếu thu. DT đã ghi lúc HĐ hoàn thành.',
        evidence: [
            { claim: 'QR hôm nay/ca', numbers: [facts.momo && !facts.momo.failed ? `${facts.momo.SoHoaDonMoMo || 0} HĐ · ${money(facts.momo.TongMoMo)}` : 'không lấy được QR, không bịa'], source: 'Thanh toán QR', confidence: facts.momo && !facts.momo.failed ? 'high' : 'low' }
        ],
        nextAction: action(isRole(user, 'Thu ngân') ? 'cashierShifts' : 'home')
    });
    if (Array.isArray(facts.topSellers) && facts.topSellers.length) {
        cards.push({
            id: 'top-sellers',
            title: '5 SP bán chạy 7 ngày',
            body: facts.topSellers.map((row) => `${row.MaSP} ${row.TenSP}: ${row.SoLuong} · ${money(row.DoanhThu)}`).join('\n'),
            evidence: [{ claim: 'Top 5 theo số lượng', numbers: facts.topSellers.map((row) => `${row.MaSP}:${row.SoLuong}`), source: 'Chi tiết HĐ hoàn thành 7 ngày', confidence: 'high' }],
            nextAction: action('managerReports')
        });
    }
    const payItems = facts.payables && !facts.payables.failed ? (facts.payables.items || []) : [];
    if (payItems.length) {
        const biggest = [...payItems].sort((a, b) => n(b.SoTienConLai) - n(a.SoTienConLai))[0];
        cards.push({
            id: 'top-payable',
            title: 'NCC công nợ lớn nhất (trong quyền)',
            body: `${biggest.TenNCC}: còn ${money(biggest.SoTienConLai)} · ${biggest.MaCNPTra}`,
            evidence: [{ claim: 'Số còn lại', numbers: [money(biggest.SoTienConLai)], source: 'Công nợ', confidence: 'high' }],
            nextAction: action(hasUc(user, 'UC28') ? 'accountingPayables' : 'managerPayables')
        });
    }
    const shifts = facts.shifts?.items || [];
    if (shifts.length && isRole(user, 'Quản lý')) {
        const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
        const todayShifts = shifts.filter((row) => String(row.ThoiGianBatDau || '').slice(0, 10) === todayKey);
        const topCash = [...(todayShifts.length ? todayShifts : shifts)].sort((a, b) => n(b.TienMatHeThong) - n(a.TienMatHeThong))[0];
        if (topCash) {
            cards.push({
                id: 'top-cash-shift',
                title: 'Ca tiền mặt hệ thống cao',
                body: `${topCash.MaCa} · ${topCash.TenNV}: TM hệ thống ${money(topCash.TienMatHeThong)} (QR ${money(topCash.TongTienQR)} không vào két).`,
                evidence: [{ claim: 'TienMatHeThong', numbers: [money(topCash.TienMatHeThong)], source: 'Báo cáo ca', confidence: 'high' }],
                nextAction: action('managerReports')
            });
        }
    }
    return cards.slice(0, 6);
};

const scenarioSnapshot = (facts, user) => {
    const pnl = facts.pnl && !facts.pnl.failed ? facts.pnl : null;
    const kqkd = pnl?.kqkd
        ? {
            doanhThuThuan: n(pnl.kqkd.doanhThuThuan),
            loiNhuanGop: n(pnl.kqkd.loiNhuanGop),
            loiNhuan: n(pnl.kqkd.loiNhuan),
            giaVonThuan: n(pnl.hoatDong?.giaVon?.giaVonThuan),
            period: pnl.period
        }
        : (facts.income && !facts.income.failed
            ? { doanhThuThuan: n(facts.income.lines?.find((l) => l.id === 3)?.amount), loiNhuanGop: n(facts.income.lines?.find((l) => l.id === 5)?.amount), loiNhuan: n(facts.income.loiNhuanKeToan), giaVonThuan: 0 }
            : { unavailable: true, reason: 'Tài khoản không xem KQKD/P&L.' });
    const cash = pnl?.tienMat
        ? {
            tienMat: n(pnl.tienMat.tienMatPhieuThu),
            momo: n(pnl.tienMat.qr || facts.momo?.TongMoMo),
            nganHang: n(pnl.tienMat.chuyenKhoan) + n(pnl.tienMat.the) + n(pnl.tienMat.qr)
        }
        : (facts.momo && !facts.momo.failed
            ? { tienMat: 0, momo: n(facts.momo.TongMoMo), nganHang: n(facts.momo.TongMoMo) }
            : { unavailable: true, reason: 'Chưa có tiền mặt / QR trong phạm vi quyền.' });
    const stockItems = facts.inventory && !facts.inventory.failed
        ? { items: facts.inventory.items || [] }
        : (facts.admin?.lowStock
            ? { items: facts.admin.lowStock, scope: 'dashboard-top' }
            : { unavailable: true, reason: 'Không có tồn trong phạm vi quyền (Quản lý không xem tồn chi tiết toàn hàng).' });
    const velocity = Array.isArray(facts.velocity) ? facts.velocity : [];
    const velMap = new Map(velocity.map((row) => [row.MaSP, row]));
    const demandItems = stockItems.unavailable
        ? stockItems
        : {
            items: (stockItems.items || []).map((row) => ({
                ...row,
                sold4w: n(velMap.get(row.MaSP)?.Sold28)
            }))
        };
    return { kqkd, cash, stockItems, demandItems, role: user?.TenVaiTro, period: pnl?.period || kqkd.period || null };
};

const buildPack = async (pool, user, options = {}) => {
    const facts = await collectFacts(pool, user, options.period || options.month || '');
    const kpis = kpisFromFacts(facts, user);
    const anomalies = anomaliesFromFacts(facts, user);
    const risks = risksFromFacts(facts, user);
    const priorities = prioritiesFrom(anomalies, risks, facts, user);
    const insights = insightsFromFacts(facts, user);
    const soLieuLines = [
        ...kpis.map((chip) => `${chip.label}: ${chip.value}`),
        ...anomalies.slice(0, 6).map((item) => `Cảnh báo ${item.type}: ${item.evidence}`),
        ...priorities.map((item) => `Ưu tiên ${item.order}: ${item.title} — ${item.why}`)
    ];
    return {
        generatedAt: new Date().toISOString(),
        role: facts.role,
        permissions: facts.permissions,
        kpis,
        anomalies,
        risks,
        priorities,
        insights,
        sources: facts.sources,
        scenario: scenarioSnapshot(facts, user),
        llmConfigured: Boolean(String(process.env.ASSISTANT_API_KEY || '').trim()),
        soLieu: soLieuLines.join('\n') || 'không lấy được số liệu, không bịa',
        facts
    };
};

const filterPayablesLeak = (pack, user) => {
    if (hasUc(user, 'UC10') || hasUc(user, 'UC28')) return pack;
    const scrub = (text) => String(text || '').replace(/CN\d{4,}/g, '[ẩn]');
    return {
        ...pack,
        soLieu: scrub(pack.soLieu),
        kpis: (pack.kpis || []).filter((chip) => chip.id !== 'ap' && chip.id !== 'overdue'),
        anomalies: (pack.anomalies || []).filter((item) => item.type !== 'payable_due'),
        insights: (pack.insights || []).filter((item) => item.id !== 'top-payable')
    };
};

const buildBrief = async (pool, user, options = {}) => filterPayablesLeak(await buildPack(pool, user, options), user);

module.exports = {
    buildPack,
    buildBrief,
    filterPayablesLeak,
    kpisFromFacts,
    anomaliesFromFacts,
    risksFromFacts,
    redact
};
