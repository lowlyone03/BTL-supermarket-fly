const { ROLE_PERMISSION_CODES } = require('../constants/permissions');
const { listForRole, roleOf, isRole } = require('./inboxService');

const codesOf = (user) => {
    const key = String(user?.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN');
    return ROLE_PERMISSION_CODES[key] || [];
};

const hasUc = (user, code) => codesOf(user).includes(code);

const money = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return `${Math.round(number).toLocaleString('vi-VN')} đ`;
};

const withTimeout = (promise, label, ms = 2000) => Promise.race([
    promise,
    new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    })
]);

const safeTool = async (label, fn) => {
    try {
        return await withTimeout(fn(), label);
    } catch (error) {
        return { failed: true, label, message: `không lấy được ${label}, không bịa` };
    }
};

const formatInbox = (items) => {
    const list = (items || []).slice(0, 8);
    if (!list.length) return 'Inbox: không có việc chờ nổi bật.';
    return ['Inbox (tối đa 8):', ...list.map((item) => {
        const when = item.at ? String(item.at).slice(0, 16) : '';
        return `- ${item.title || item.id}${item.detail ? ` · ${item.detail}` : ''}${when ? ` · ${when}` : ''}`;
    })].join('\n');
};

const formatAdminDashboard = (data) => {
    if (!data || data.failed) return data?.message || 'không lấy được dashboard quản lý, không bịa';
    const pending = data.pendingApprovals || {};
    const revenue = data.revenue || {};
    const stock = (data.lowStock || []).slice(0, 8);
    const lines = [
        `Chờ duyệt: PO ${pending.DonMuaHang || 0}, phiếu xuất ${pending.PhieuXuat || 0}, kiểm kê ${pending.KiemKe || 0}, đổi trả ${pending.DoiTra || 0}, phiếu chi ${pending.PhieuChi || 0} (tổng ${pending.TongChoDuyet || 0}).`,
        `Doanh thu hôm nay: ${money(revenue.DoanhThuHomNay) || '0đ'}. Lãi gộp hôm nay: ${money(revenue.LaiGopHomNay) || '0đ'}.`,
        `Ca đang mở: ${data.summary?.CaDangMo ?? '—'}.`
    ];
    if (stock.length) {
        lines.push('Tồn thấp TOP (dashboard quản lý, không phải tồn chi tiết toàn hàng):');
        for (const row of stock) {
            lines.push(`- ${row.MaSP} ${row.TenSP}: còn ${row.SLTon} / min ${row.TonKhoToiThieu}`);
        }
    } else {
        lines.push('Tồn thấp TOP: không có mặt hàng dưới định mức trên dashboard.');
    }
    return lines.join('\n');
};

const formatWarehouseDashboard = (data) => {
    if (!data || data.failed) return data?.message || 'không lấy được tổng quan kho, không bịa';
    const summary = data.summary || {};
    const stock = (data.lowStock || []).slice(0, 6);
    const lines = [
        `Kho ${data.warehouse?.TenKho || data.warehouse?.MaKho || ''}: ${summary.TongMatHang || 0} mặt hàng, cần bổ sung ${summary.CanBoSung || 0}, hết hàng ${summary.HetHang || 0}, đang đặt mua ${summary.DangDatMua || 0}.`
    ];
    if (stock.length) {
        lines.push('Mặt hàng dưới định mức:');
        for (const row of stock) {
            lines.push(`- ${row.MaSP} ${row.TenSP}: ${row.SLTon} (${row.MucTon})`);
        }
    }
    return lines.join('\n');
};

const formatPurchaseRequests = (data) => {
    if (!data || data.failed) return data?.message || 'không lấy được đề nghị mua, không bịa';
    const items = (data.items || []).slice(0, 8);
    if (!items.length) return 'Đề nghị mua: không có phiếu.';
    return ['Đề nghị mua (tối đa 8):', ...items.map((row) =>
        `- ${row.MaDN} · ${row.TrangThai} · ${row.NguoiLap || ''} · ${row.SoMatHang || 0} SP`
    )].join('\n');
};

const formatShift = (data) => {
    if (!data || data.failed) return data?.message || 'không lấy được ca hiện tại, không bịa';
    if (!data.open) return 'Bạn chưa có ca bán hàng đang mở.';
    const s = data.summary || {};
    return [
        `Ca ${s.MaCa || ''} · quầy ${s.TenQuay || s.MaQuay || ''} · ${s.TrangThai || ''}.`,
        `Tiền mặt hệ thống (TM thu − hoàn TM): ${money(s.TienMatHeThong) || '0đ'}.`,
        `MoMo/QR thành công: ${money(s.TongTienQR) || '0đ'} — không vào két.`,
        `Hóa đơn nháp: ${s.HoaDonNhap || 0}. Thanh toán chờ xác nhận: ${s.ThanhToanChoXacNhan || 0}.`
    ].join('\n');
};

const formatUnposted = (rows) => {
    if (!rows || rows.failed) return rows?.message || 'không lấy được chờ ghi sổ, không bịa';
    const list = Array.isArray(rows) ? rows : [];
    const top = list.slice(0, 8);
    const lines = [`Chờ ghi sổ: ${list.length} chứng từ (Kế toán — không phải Quản lý).`];
    for (const row of top) {
        lines.push(`- ${row.MaChungTu} · ${row.LoaiChungTu} · ${row.LyDo || ''}`);
    }
    return lines.join('\n');
};

const formatReconSummary = (data) => {
    if (!data || data.failed || data.skipped) return data?.reason || data?.message || '';
    const tien = money(data.tongTienChuaDoiSoat);
    if (data.scope === 'ql') {
        return `Đối soát NH (QL, chỉ đếm): ${data.soDongChuaDoiSoat || 0} dòng chưa đối soát, tổng ${tien || '0đ'}. Không dump sao kê chi tiết.`;
    }
    return [
        `Đối soát NH (Kế toán): chưa xác nhận ${data.soDongChuaDoiSoat || 0} dòng · ${tien || '0 đ'}.`,
        `Khớp tự động chờ KT: ${data.soDongAutoChoXacNhan || 0}. Gợi ý: ${data.soDongGoiY || 0}. Chênh lệch: ${data.soDongChenhLech || 0}. Chưa khớp: ${data.soDongChuaKhop || 0}.`
    ].join('\n');
};

const formatLoyaltySummary = (data) => {
    if (!data || data.failed || data.skipped) return data?.reason || '';
    const segs = data.segments || {};
    return [
        `Khách thành viên (RFM, không LLM): ${data.soKhach || 0} hồ sơ. At-risk/ngủ đông: ${data.atRisk || 0}.`,
        `${data.thang || ''}: ${data.soHoaDonThanhVien || 0} HĐ hoàn thành · DT thành viên ${money(data.doanhThuThanhVien) || '0đ'}.`,
        `Segment: cao ${segs['Giá trị cao'] || 0}, thân thiết ${segs['Thân thiết'] || 0}, mới ${segs['Mới'] || 0}, rời bỏ ${segs['Nguy cơ rời bỏ'] || 0}.`
    ].join('\n');
};

const loadReconciliationSummary = async (pool, user) => {
    const { loadReconciliationSummary: load } = require('./reconciliationService');
    return load(pool, user);
};

const loadLoyaltySummary = async (pool, user) => {
    const { loadLoyaltySummary: load } = require('./loyaltyAnalytics');
    return load(pool, user);
};

const collectContext = async (pool, user) => {
    try {
        const { buildBrief } = require('./analyticsEngine');
        const pack = await buildBrief(pool, user);
        const extras = [];
        const extraSources = [...(pack.sources || [])];
        const recon = await safeTool('đối soát NH', () => loadReconciliationSummary(pool, user));
        if (recon && !recon.failed && !recon.skipped) {
            extras.push(formatReconSummary(recon));
            extraSources.push('Đối soát ngân hàng');
        }
        const loyalty = await safeTool('RFM khách', () => loadLoyaltySummary(pool, user));
        if (loyalty && !loyalty.failed && !loyalty.skipped) {
            extras.push(formatLoyaltySummary(loyalty));
            extraSources.push('Khách hàng thân thiết');
        }
        return {
            soLieu: [pack.soLieu, ...extras].filter(Boolean).join('\n'),
            sources: extraSources,
            permissions: pack.permissions || codesOf(user),
            roleLabel: pack.role || roleOf(user),
            pack
        };
    } catch {
        const sources = ['Inbox việc cần xử lý'];
        const blocks = [];
        const inbox = await safeTool('inbox', () => listForRole(pool, user));
        if (inbox?.failed) blocks.push(inbox.message);
        else {
            blocks.push(formatInbox(inbox));
            sources.push('Hộp thư');
        }
        if (isRole(user, 'Quản lý') && (hasUc(user, 'UC10') || hasUc(user, 'UC04'))) {
            const { loadAdminDashboard } = require('../controllers/adminController');
            const dash = await safeTool('dashboard quản lý', () => loadAdminDashboard(pool));
            blocks.push(formatAdminDashboard(dash));
            if (!dash?.failed) sources.push('Dashboard quản lý');
        } else if (isRole(user, 'Nhân viên mua hàng') && hasUc(user, 'UC12')) {
            const { loadPurchaseRequests } = require('../controllers/warehouseController');
            const reqs = await safeTool('đề nghị mua', () => loadPurchaseRequests(pool, user, { purchasing: true }));
            blocks.push(formatPurchaseRequests(reqs));
            if (!reqs?.failed) sources.push('Đề nghị mua hàng');
        } else if (isRole(user, 'Thủ kho') && hasUc(user, 'UC15')) {
            const { loadWarehouseDashboard } = require('../controllers/warehouseController');
            const dash = await safeTool('tổng quan kho', () => loadWarehouseDashboard(pool, user));
            blocks.push(formatWarehouseDashboard(dash));
            if (!dash?.failed) sources.push('Tổng quan kho');
        } else if (isRole(user, 'Thu ngân') && hasUc(user, 'UC22')) {
            const { loadCurrentShiftSummary } = require('../controllers/cashierController');
            const shift = await safeTool('ca hiện tại', () => loadCurrentShiftSummary(pool, user));
            blocks.push(formatShift(shift));
            if (!shift?.failed) sources.push('Ca bán hàng');
        } else if (isRole(user, 'Kế toán') && hasUc(user, 'UC37')) {
            const { loadUnpostedQueue } = require('../controllers/ledgerController');
            const queue = await safeTool('chờ ghi sổ', () => loadUnpostedQueue(pool));
            blocks.push(formatUnposted(queue));
            if (!queue?.failed) sources.push('Chờ ghi sổ');
        }
        return {
            soLieu: blocks.join('\n'),
            sources,
            permissions: codesOf(user),
            roleLabel: roleOf(user)
        };
    }
};

module.exports = {
    codesOf,
    hasUc,
    collectContext,
    loadReconciliationSummary,
    loadLoyaltySummary
};
