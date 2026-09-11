const KIND_META = {
    MH_DON_MUA: { boPhan: 'MuaHang', prefix: 'BCM', label: 'Báo cáo đơn mua và giao hàng', uc: 'UC14' },
    KT_NOI_BO: { boPhan: 'KeToan', prefix: 'BCKT', label: 'Báo cáo tài chính nội bộ', uc: 'UC29' },
    KT_KQKD: { boPhan: 'KeToan', prefix: 'BCKT', label: 'Kết quả kinh doanh', uc: 'UC43', ledger: true },
    KT_LCTT: { boPhan: 'KeToan', prefix: 'BCKT', label: 'Lưu chuyển tiền tệ', uc: 'UC43', ledger: true },
    KT_BCDKT: { boPhan: 'KeToan', prefix: 'BCKT', label: 'Bảng cân đối kế toán', uc: 'UC43', ledger: true },
    TN_BAN_HANG: { boPhan: 'ThuNgan', prefix: 'BCTN', label: 'Báo cáo ca và bán hàng cá nhân', uc: 'UC22' }
};

const DEPT_LABEL = {
    MuaHang: 'Mua hàng',
    KeToan: 'Kế toán',
    ThuNgan: 'Thu ngân'
};

const DEPT_PAGE = {
    MuaHang: 'purchasing-reports',
    KeToan: 'accounting-reports',
    ThuNgan: 'cashier-reports'
};

const LEDGER_KINDS = new Set(['KT_KQKD', 'KT_LCTT', 'KT_BCDKT']);

const compactPurchasing = (report = {}) => ({
    kind: 'MH_DON_MUA',
    period: report.period || null,
    summary: report.summary || {},
    byStatus: report.byStatus || [],
    suppliers: report.suppliers || [],
    daily: report.daily || [],
    byCategory: report.byCategory || [],
    actionOrders: report.actionOrders || [],
    doiTra: {
        summary: report.doiTra?.summary || {},
        tickets: report.doiTra?.tickets || [],
        products: report.doiTra?.products || []
    }
});

const compactSales = (report = {}) => ({
    kind: 'TN_BAN_HANG',
    period: report.period || null,
    sales: report.sales || {},
    methods: report.methods || {},
    shifts: report.shifts || [],
    daily: report.daily || [],
    topProducts: report.topProducts || [],
    recentInvoices: report.recentInvoices || [],
    alerts: report.alerts || {},
    doiTra: {
        summary: report.doiTra?.summary || {},
        tickets: report.doiTra?.tickets || [],
        products: report.doiTra?.products || []
    }
});

const compactFinancial = (report = {}) => ({
    kind: 'KT_NOI_BO',
    period: report.period || null,
    sales: report.sales || {},
    purchases: report.purchases || {},
    inventory: report.inventory || {},
    finance: report.finance || {},
    daily: report.daily || [],
    cashflowDaily: report.cashflowDaily || [],
    debtAging: report.debtAging || [],
    payables: report.payables || [],
    reconciliation: report.reconciliation || [],
    doiTra: {
        summary: report.doiTra?.summary || {},
        tickets: report.doiTra?.tickets || [],
        products: report.doiTra?.products || []
    }
});

const compactLedger = (kind, report = {}) => ({
    kind,
    period: report.period || null,
    watermark: Boolean(report.watermark),
    lines: report.lines || [],
    loiNhuanKeToan: report.loiNhuanKeToan,
    chuThich: report.chuThich || '',
    nguon: report.nguon || '',
    I: report.I || null,
    II: report.II || null,
    III: report.III || null,
    tong: report.tong,
    khop: report.khop,
    taiSan: report.taiSan || report.ts || null,
    nguonVon: report.nguonVon || report.nv || null,
    canDoi: report.canDoi,
    raw: report.raw || null
});

const compactSnapshot = (kind, report = {}) => {
    if (kind === 'MH_DON_MUA') return compactPurchasing(report);
    if (kind === 'TN_BAN_HANG') return compactSales(report);
    if (kind === 'KT_NOI_BO') return compactFinancial(report);
    if (LEDGER_KINDS.has(kind)) return compactLedger(kind, report);
    throw new Error('Loại báo cáo không hỗ trợ gửi.');
};

const kpiOf = (kind, report = {}) => {
    if (kind === 'MH_DON_MUA') {
        const s = report.summary || {};
        return [
            { key: 'GiaTriDonMua', label: 'Giá trị đơn mua', value: Number(s.GiaTriDonMua || 0), money: true },
            { key: 'SoDonMua', label: 'Số đơn hợp lệ', value: Number(s.SoDonMua || 0) },
            { key: 'SoPhieuNhap', label: 'Phiếu nhập', value: Number(s.SoPhieuNhap || 0) },
            { key: 'GiaTriNhap', label: 'Giá trị nhập', value: Number(s.GiaTriNhap || 0), money: true },
            { key: 'SoDonChoDuyet', label: 'Đơn chờ duyệt', value: Number(s.SoDonChoDuyet || 0) },
            { key: 'SoDonTre', label: 'Đơn giao trễ', value: Number(s.SoDonTre || 0) },
            { key: 'SLConThieu', label: 'SL còn thiếu', value: Number(s.SLConThieu || 0) }
        ];
    }
    if (kind === 'TN_BAN_HANG') {
        const s = report.sales || {};
        const m = report.methods || {};
        const net = Number(s.DoanhThuHoaDon || 0) - Number(s.TienHoan || 0);
        return [
            { key: 'DoanhThuThuan', label: 'Doanh thu thuần', value: net, money: true },
            { key: 'SoHoaDon', label: 'Hóa đơn hoàn thành', value: Number(s.SoHoaDon || 0) },
            { key: 'TienHoan', label: 'Tiền hoàn', value: Number(s.TienHoan || 0), money: true },
            { key: 'TienMat', label: 'Tiền mặt', value: Number(m.TienMat || 0), money: true },
            { key: 'DienTu', label: 'Thanh toán điện tử', value: Number(m.QR || 0) + Number(m.The || 0) + Number(m.ChuyenKhoan || 0), money: true }
        ];
    }
    if (kind === 'KT_NOI_BO') {
        const s = report.sales || {};
        const f = report.finance || {};
        return [
            { key: 'DoanhThuThuan', label: 'Doanh thu thuần', value: Number(s.DoanhThuThuan || 0), money: true },
            { key: 'LoiNhuanGop', label: 'Lãi gộp', value: Number(s.LoiNhuanGop || 0), money: true },
            { key: 'PhieuThuThucNop', label: 'Phiếu thu thực nộp', value: Number(f.PhieuThuThucNop || 0), money: true },
            { key: 'DaThanhToanNCC', label: 'Đã chi NCC', value: Number(f.DaThanhToanNCC || 0), money: true },
            { key: 'CongNoConLai', label: 'Công nợ còn lại', value: Number(f.CongNoConLai || 0), money: true },
            { key: 'CongNoQuaHan', label: 'Công nợ quá hạn', value: Number(f.CongNoQuaHan || 0), money: true },
            { key: 'ChenhLechPhieuThu', label: 'Chênh lệch bàn giao', value: Number(f.ChenhLechPhieuThu || 0), money: true }
        ];
    }
    if (kind === 'KT_KQKD') {
        const line8 = (report.lines || []).find(row => Number(row.id) === 8);
        return [
            { key: 'LoiNhuanKeToan', label: 'LN kế toán (dòng 8)', value: Number(report.loiNhuanKeToan ?? line8?.amount ?? 0), money: true }
        ];
    }
    if (kind === 'KT_LCTT') {
        return [{ key: 'TongLCTT', label: 'Tổng lưu chuyển tiền', value: Number(report.tong || 0), money: true }];
    }
    if (kind === 'KT_BCDKT') {
        return [{ key: 'CanDoi', label: 'Cân đối TS = NV', value: report.canDoi || report.watermark ? 0 : 1 }];
    }
    return [];
};

const compareKpis = (kind, submitted, live) => {
    const left = kpiOf(kind, submitted);
    const rightMap = new Map(kpiOf(kind, live).map(row => [row.key, row]));
    return left.map(row => {
        const other = rightMap.get(row.key);
        const liveValue = other ? Number(other.value || 0) : null;
        const submittedValue = Number(row.value || 0);
        return {
            ...row,
            submitted: submittedValue,
            live: liveValue,
            delta: liveValue == null ? null : liveValue - submittedValue
        };
    });
};

const roleDept = (user) => {
    const role = String(user?.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN');
    if (role === 'nhân viên mua hàng') return 'MuaHang';
    if (role === 'kế toán') return 'KeToan';
    if (role === 'thu ngân') return 'ThuNgan';
    return '';
};

module.exports = {
    KIND_META,
    DEPT_LABEL,
    DEPT_PAGE,
    LEDGER_KINDS,
    compactSnapshot,
    kpiOf,
    compareKpis,
    roleDept
};
