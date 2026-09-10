const SCREENS = {
    home: { target: 'home', label: 'Tổng quan' },
    approvals: { target: 'manager-purchase-approvals', label: 'Trung tâm phê duyệt' },
    managerPayables: { target: 'manager-payables', label: 'Theo dõi công nợ' },
    managerReports: { target: 'manager-reports', label: 'Báo cáo cửa hàng' },
    kqkd: { target: 'ledger-kqkd', label: 'Kết quả kinh doanh' },
    cashflow: { target: 'ledger-cf', label: 'Lưu chuyển tiền tệ' },
    trial: { target: 'ledger-trial', label: 'Cân đối phát sinh' },
    unposted: { target: 'ledger-journals', label: 'Bút toán & chờ ghi sổ' },
    warehouseHome: { target: 'warehouse-home', label: 'Tổng quan kho' },
    inventory: { target: 'warehouse-inventory', label: 'Tồn kho & cảnh báo' },
    warehouseRequests: { target: 'warehouse-requests', label: 'Đề nghị mua hàng' },
    purchasingInbox: { target: 'purchasing-inbox', label: 'Đề nghị từ kho' },
    purchaseOrders: { target: 'purchasing-orders', label: 'Đơn mua hàng' },
    suppliers: { target: 'purchasing-suppliers', label: 'Nhà cung cấp' },
    cashierShifts: { target: 'cashier-shifts', label: 'Ca bán hàng' },
    cashierPos: { target: 'cashier-pos', label: 'Bán hàng' },
    cashierInvoices: { target: 'cashier-invoices', label: 'Hóa đơn' },
    accountingPayables: { target: 'accounting-payables', label: 'Công nợ Nhà cung cấp' },
    accountingInvoices: { target: 'accounting-invoices', label: 'Đối chiếu hóa đơn' },
    settlements: { target: 'accounting-settlements', label: 'Ca & Phiếu thu' }
};

const byRole = (user) => {
    const role = String(user?.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN');
    if (role === 'quản lý') {
        return [SCREENS.home, SCREENS.approvals, SCREENS.managerPayables, SCREENS.managerReports, SCREENS.kqkd, SCREENS.cashflow];
    }
    if (role === 'nhân viên mua hàng') {
        return [SCREENS.purchasingInbox, SCREENS.purchaseOrders, SCREENS.suppliers];
    }
    if (role === 'thủ kho') {
        return [SCREENS.warehouseHome, SCREENS.inventory, SCREENS.warehouseRequests];
    }
    if (role === 'thu ngân') {
        return [SCREENS.cashierShifts, SCREENS.cashierPos, SCREENS.cashierInvoices];
    }
    if (role === 'kế toán') {
        return [SCREENS.accountingPayables, SCREENS.settlements, SCREENS.unposted, SCREENS.kqkd, SCREENS.cashflow, SCREENS.trial];
    }
    return [SCREENS.home];
};

const action = (key) => {
    const screen = SCREENS[key];
    if (!screen) return null;
    return { label: `Mở ${screen.label}`, target: screen.target };
};

module.exports = { SCREENS, byRole, action };
