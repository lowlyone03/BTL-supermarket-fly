'use strict';

const EVENTS = Object.freeze({
    INBOX_REFRESH: 'notification:inbox-refresh',
    READ_UPDATED: 'notification:read-updated',
    PROBE: 'notification:probe',
    NEW: 'notification:new'
});

const TRANSPORTS = Object.freeze({
    SSE: 'sse',
    BOTH: 'both',
    SOCKET: 'socket'
});

const DEFAULT_TRANSPORT = TRANSPORTS.BOTH;

const WORKFLOW_EVENTS = Object.freeze({
    PURCHASE_REQUEST_SUBMITTED: 'purchase-request.submitted',
    PURCHASE_REQUEST_RESUBMITTED: 'purchase-request.resubmitted',
    PURCHASE_REQUEST_CHANGES: 'purchase-request.changes-requested',
    PURCHASE_ORDER_SUBMITTED: 'purchase-order.submitted',
    PURCHASE_ORDER_RESUBMITTED: 'purchase-order.resubmitted',
    PURCHASE_ORDER_APPROVED: 'purchase-order.approved',
    PURCHASE_ORDER_CHANGES: 'purchase-order.changes-requested',
    PURCHASE_ORDER_REJECTED: 'purchase-order.rejected',
    STOCK_ISSUE_SUBMITTED: 'stock-issue.submitted',
    STOCK_ISSUE_APPROVED: 'stock-issue.approved',
    STOCK_ISSUE_REJECTED: 'stock-issue.rejected',
    INVENTORY_COUNT_SUBMITTED: 'inventory-count.submitted',
    INVENTORY_COUNT_APPROVED: 'inventory-count.approved',
    INVENTORY_COUNT_REJECTED: 'inventory-count.rejected',
    RETURN_SUBMITTED: 'return.submitted',
    RETURN_INSPECTED: 'return.inspected',
    RETURN_APPROVED: 'return.approved',
    RETURN_REJECTED: 'return.rejected',
    PAYMENT_VOUCHER_SUBMITTED: 'payment-voucher.submitted',
    PAYMENT_VOUCHER_RESUBMITTED: 'payment-voucher.resubmitted',
    PAYMENT_VOUCHER_APPROVED: 'payment-voucher.approved',
    PAYMENT_VOUCHER_REJECTED: 'payment-voucher.rejected',
    ATTENDANCE_SUBMITTED: 'attendance.submitted',
    ATTENDANCE_APPROVED: 'attendance.approved',
    PURCHASE_REQUEST_ACCEPTED: 'purchase-request.accepted',
    DELIVERY_SENT: 'delivery.sent',
    DELIVERY_ARRIVED: 'delivery.arrived',
    RECEIPT_CONFIRMED: 'receipt.confirmed',
    INVOICE_MATCHED: 'purchase-invoice.matched',
    INVOICE_MISMATCHED: 'purchase-invoice.mismatched',
    PAYMENT_VOUCHER_PAID: 'payment-voucher.paid',
    PAYMENT_VOUCHER_FAILED: 'payment-voucher.failed',
    PAYABLE_EXTENSION_REQUESTED: 'payable-extension.requested',
    PAYABLE_EXTENSION_GRANTED: 'payable-extension.granted',
    SHIFT_CLOSED: 'shift.closed',
    SHIFT_RECEIPT_CONFIRMED: 'shift-receipt.confirmed',
    QR_RESULT: 'qr.result',
    RETURN_COMPLETED: 'return.completed',
    RETURN_REFUND_WAITING: 'return.refund-waiting',
    STOCK_ISSUE_CONFIRMED: 'stock-issue.confirmed',
    SCHEDULE_PUBLISHED: 'schedule.published',
    PAYROLL_VOUCHER_SUBMITTED: 'payroll-voucher.submitted',
    PAYROLL_VOUCHER_RESUBMITTED: 'payroll-voucher.resubmitted',
    PAYROLL_VOUCHER_REJECTED: 'payroll-voucher.rejected',
    PAYROLL_FUND_HANDED: 'payroll.fund-handed',
    PAYROLL_PAID: 'payroll.paid',
    PAYROLL_FAILED: 'payroll.failed',
    REPORT_SUBMITTED: 'report.submitted',
    REPORT_FEEDBACK: 'report.feedback',
    ACCOUNT_CHANGED: 'account.changed'
});

const actorName = context => String(
    context.actorName || context.actor?.TenNV || context.actor?.MaNV || 'Một nhân viên'
).trim();

const relatedPo = context => String(context.poId || context.MaPO || '').trim();

const entry = (entityType, status, target, title, detail, permission = null) => Object.freeze({
    entityType, status, target, title, detail, permission
});

const WORKFLOW_CATALOG = Object.freeze({
    [WORKFLOW_EVENTS.PURCHASE_REQUEST_SUBMITTED]: entry(
        'DeNghiMuaHang', 'Đã gửi', 'purchasing-inbox',
        context => `Phiếu đề nghị ${context.entityId} chờ tiếp nhận`,
        context => `${actorName(context)} đã gửi phiếu đề nghị ${context.entityId}. Vui lòng tiếp nhận và lập đơn mua.`,
        'UC12'
    ),
    [WORKFLOW_EVENTS.PURCHASE_REQUEST_RESUBMITTED]: entry(
        'DeNghiMuaHang', 'Đã gửi', 'purchasing-inbox',
        context => `Phiếu đề nghị ${context.entityId} đã được gửi lại`,
        context => `${actorName(context)} đã bổ sung và gửi lại phiếu đề nghị ${context.entityId}. Vui lòng tiếp nhận hồ sơ mới.`,
        'UC12'
    ),
    [WORKFLOW_EVENTS.PURCHASE_REQUEST_CHANGES]: entry(
        'DeNghiMuaHang', 'Yêu cầu bổ sung', 'warehouse-requests',
        context => `Phiếu đề nghị ${context.entityId} cần bổ sung`,
        context => `${actorName(context)} đã trả phiếu đề nghị ${context.entityId}. Vui lòng bổ sung hồ sơ rồi gửi lại.`
    ),
    [WORKFLOW_EVENTS.PURCHASE_ORDER_SUBMITTED]: entry(
        'DonMuaHang', 'Chờ duyệt', 'manager-purchase-approvals',
        context => `Đơn mua ${context.entityId} chờ phê duyệt`,
        context => `${actorName(context)} đã gửi đơn mua ${context.entityId}. Vui lòng kiểm tra và ra quyết định.`,
        'UC05'
    ),
    [WORKFLOW_EVENTS.PURCHASE_ORDER_RESUBMITTED]: entry(
        'DonMuaHang', 'Chờ duyệt', 'manager-purchase-approvals',
        context => `Đơn mua ${context.entityId} đã được gửi lại`,
        context => `${actorName(context)} đã chỉnh sửa và gửi lại đơn mua ${context.entityId}. Vui lòng kiểm tra hồ sơ mới.`,
        'UC05'
    ),
    [WORKFLOW_EVENTS.PURCHASE_ORDER_APPROVED]: entry(
        'DonMuaHang', 'Đã duyệt', 'purchasing-orders',
        context => `Đơn mua ${context.entityId} đã được duyệt`,
        context => `${actorName(context)} đã duyệt đơn mua ${context.entityId}. Vui lòng tiếp tục gửi Nhà cung cấp.`
    ),
    [WORKFLOW_EVENTS.PURCHASE_ORDER_CHANGES]: entry(
        'DonMuaHang', 'Yêu cầu chỉnh sửa', 'purchasing-orders',
        context => `Đơn mua ${context.entityId} cần chỉnh sửa`,
        context => `${actorName(context)} yêu cầu chỉnh sửa đơn mua ${context.entityId}. Vui lòng cập nhật và gửi lại.`
    ),
    [WORKFLOW_EVENTS.PURCHASE_ORDER_REJECTED]: entry(
        'DonMuaHang', 'Từ chối', 'purchasing-orders',
        context => `Đơn mua ${context.entityId} bị từ chối`,
        context => `${actorName(context)} đã từ chối đơn mua ${context.entityId}. Vui lòng kiểm tra phản hồi trong hồ sơ.`
    ),
    [WORKFLOW_EVENTS.STOCK_ISSUE_SUBMITTED]: entry(
        'PhieuXuat', 'Chờ duyệt', 'manager-purchase-approvals',
        context => `Phiếu xuất ${context.entityId} chờ phê duyệt`,
        context => `${actorName(context)} đã gửi phiếu xuất ${context.entityId}. Vui lòng kiểm tra và ra quyết định.`,
        'UC06'
    ),
    [WORKFLOW_EVENTS.STOCK_ISSUE_APPROVED]: entry(
        'PhieuXuat', 'Đã duyệt', 'warehouse-stock-issues',
        context => `Phiếu xuất ${context.entityId} đã được duyệt`,
        context => `${actorName(context)} đã duyệt phiếu xuất ${context.entityId}. Vui lòng xác nhận xuất kho.`
    ),
    [WORKFLOW_EVENTS.STOCK_ISSUE_REJECTED]: entry(
        'PhieuXuat', 'Từ chối', 'warehouse-stock-issues',
        context => `Phiếu xuất ${context.entityId} bị từ chối`,
        context => `${actorName(context)} đã từ chối phiếu xuất ${context.entityId}. Vui lòng kiểm tra phản hồi.`
    ),
    [WORKFLOW_EVENTS.INVENTORY_COUNT_SUBMITTED]: entry(
        'KiemKe', 'Chờ duyệt điều chỉnh', 'manager-purchase-approvals',
        context => `Kiểm kê ${context.entityId} chờ duyệt điều chỉnh`,
        context => `${actorName(context)} đã gửi kiểm kê ${context.entityId}. Vui lòng kiểm tra chênh lệch và ra quyết định.`,
        'UC07'
    ),
    [WORKFLOW_EVENTS.INVENTORY_COUNT_APPROVED]: entry(
        'KiemKe', 'Đã duyệt', 'warehouse-inventory-counts',
        context => `Kiểm kê ${context.entityId} đã được duyệt`,
        context => `${actorName(context)} đã duyệt điều chỉnh cho kiểm kê ${context.entityId}. Vui lòng tiếp tục xử lý hàng cần loại bỏ nếu có.`
    ),
    [WORKFLOW_EVENTS.INVENTORY_COUNT_REJECTED]: entry(
        'KiemKe', 'Từ chối', 'warehouse-inventory-counts',
        context => `Kiểm kê ${context.entityId} bị từ chối`,
        context => `${actorName(context)} đã từ chối điều chỉnh kiểm kê ${context.entityId}. Vui lòng kiểm tra phản hồi và đếm lại.`
    ),
    [WORKFLOW_EVENTS.RETURN_SUBMITTED]: entry(
        'PhieuDoiTra', 'Chờ kiểm tra', 'warehouse-returns',
        context => `Phiếu đổi trả ${context.entityId} chờ kiểm tra`,
        context => `${actorName(context)} đã bàn giao phiếu đổi trả ${context.entityId}. Vui lòng kiểm tra tình trạng hàng.`,
        'UC21'
    ),
    [WORKFLOW_EVENTS.RETURN_INSPECTED]: entry(
        'PhieuDoiTra', 'Chờ duyệt', 'manager-purchase-approvals',
        context => `Phiếu đổi trả ${context.entityId} chờ phê duyệt`,
        context => `${actorName(context)} đã kiểm tra phiếu đổi trả ${context.entityId}. Vui lòng xem hồ sơ và ra quyết định.`,
        'UC08'
    ),
    [WORKFLOW_EVENTS.RETURN_APPROVED]: entry(
        'PhieuDoiTra', 'Đã duyệt', 'cashier-returns',
        context => `Phiếu đổi trả ${context.entityId} đã được duyệt`,
        context => `${actorName(context)} đã duyệt phiếu đổi trả ${context.entityId}. Thu ngân phụ trách vui lòng hoàn tất với khách.`
    ),
    [WORKFLOW_EVENTS.RETURN_REJECTED]: entry(
        'PhieuDoiTra', 'Từ chối', 'cashier-returns',
        context => `Phiếu đổi trả ${context.entityId} bị từ chối`,
        context => `${actorName(context)} đã từ chối phiếu đổi trả ${context.entityId}. Thu ngân phụ trách vui lòng kiểm tra phản hồi.`
    ),
    [WORKFLOW_EVENTS.PAYMENT_VOUCHER_SUBMITTED]: entry(
        'PhieuChi', 'Chờ duyệt', 'manager-purchase-approvals',
        context => `Phiếu chi ${context.entityId} chờ phê duyệt`,
        context => `${actorName(context)} đã gửi phiếu chi ${context.entityId}. Vui lòng kiểm tra hồ sơ và ra quyết định.`,
        'UC09'
    ),
    [WORKFLOW_EVENTS.PAYMENT_VOUCHER_RESUBMITTED]: entry(
        'PhieuChi', 'Chờ duyệt', 'manager-purchase-approvals',
        context => `Phiếu chi ${context.entityId} đã được gửi lại`,
        context => `${actorName(context)} đã chỉnh sửa và gửi lại phiếu chi ${context.entityId}. Vui lòng kiểm tra hồ sơ mới.`,
        'UC09'
    ),
    [WORKFLOW_EVENTS.PAYMENT_VOUCHER_APPROVED]: entry(
        'PhieuChi', 'Đã duyệt', 'accounting-payables',
        context => `Phiếu chi ${context.entityId} đã được duyệt`,
        context => `${actorName(context)} đã duyệt phiếu chi ${context.entityId}. Kế toán lập phiếu vui lòng thực hiện thanh toán Nhà cung cấp.`
    ),
    [WORKFLOW_EVENTS.PAYMENT_VOUCHER_REJECTED]: entry(
        'PhieuChi', 'Từ chối', 'accounting-payables',
        context => `Phiếu chi ${context.entityId} bị từ chối`,
        context => `${actorName(context)} đã từ chối phiếu chi ${context.entityId}. Kế toán lập phiếu vui lòng kiểm tra phản hồi.`
    ),
    [WORKFLOW_EVENTS.ATTENDANCE_SUBMITTED]: entry(
        'ChamCong', 'Chờ duyệt', 'manager-workforce-approve',
        context => `Chấm công ${context.entityId} chờ phê duyệt`,
        context => `${actorName(context)} đã chấm công ra. Vui lòng kiểm tra lượt chấm công ${context.entityId}.`,
        'UC32'
    ),
    [WORKFLOW_EVENTS.ATTENDANCE_APPROVED]: entry(
        'ChamCong', 'Đã duyệt', 'cashier-schedule',
        context => `Chấm công ${context.entityId} đã được duyệt`,
        context => `${actorName(context)} đã duyệt lượt chấm công ${context.entityId}. Bạn có thể xem kết quả trong lịch làm việc.`
    ),
    [WORKFLOW_EVENTS.PURCHASE_REQUEST_ACCEPTED]: entry(
        'DeNghiMuaHang', 'Đang xử lý', 'warehouse-requests',
        context => `Phiếu đề nghị ${context.entityId} đã được tiếp nhận`,
        context => `${actorName(context)} đã tiếp nhận phiếu đề nghị ${context.entityId}. Bộ phận mua hàng đang lập đơn.`
    ),
    [WORKFLOW_EVENTS.DELIVERY_SENT]: entry(
        'ThongBaoGiaoHang', 'Đang giao', 'warehouse-receiving',
        context => `Chuyến giao ${context.entityId} chờ nhận`,
        context => `${actorName(context)} đã gửi chuyến ${context.entityId}${relatedPo(context) ? ` của đơn ${relatedPo(context)}` : ''} đang giao. Vui lòng ghi nhận xe đến.`,
        'UC17'
    ),
    [WORKFLOW_EVENTS.DELIVERY_ARRIVED]: entry(
        'ThongBaoGiaoHang', 'Đã đến kho', 'warehouse-receiving',
        context => `Chuyến ${context.entityId} đã đến kho`,
        context => `Chuyến ${context.entityId}${relatedPo(context) ? ` của đơn ${relatedPo(context)}` : ''} đã đến, cần kiểm nhận.`,
        'UC17'
    ),
    [WORKFLOW_EVENTS.RECEIPT_CONFIRMED]: entry(
        'PhieuNhap', 'Đã xác nhận', 'accounting-invoices',
        context => `Phiếu nhập ${context.entityId} đã xác nhận`,
        context => `${actorName(context)} đã xác nhận nhập ${context.entityId}${relatedPo(context) ? ` cho đơn ${relatedPo(context)}` : ''}. Kế toán vui lòng đối chiếu hồ sơ.`,
        'UC27'
    ),
    [WORKFLOW_EVENTS.INVOICE_MATCHED]: entry(
        'HoaDonMuaHang', 'Đã khớp', 'accounting-payables',
        context => `Hóa đơn mua ${context.entityId} đã khớp`,
        context => `${actorName(context)} đã đối chiếu khớp hóa đơn ${context.entityId}. Công nợ sẵn sàng xử lý.`,
        'UC28'
    ),
    [WORKFLOW_EVENTS.INVOICE_MISMATCHED]: entry(
        'HoaDonMuaHang', 'Chênh lệch', 'accounting-invoices',
        context => `Hóa đơn mua ${context.entityId} còn chênh lệch`,
        context => `${actorName(context)} đối chiếu hóa đơn ${context.entityId}: hồ sơ còn chênh lệch, chưa phát sinh công nợ.`,
        'UC27'
    ),
    [WORKFLOW_EVENTS.PAYMENT_VOUCHER_PAID]: entry(
        'PhieuChi', 'Thanh toán thành công', 'accounting-payables',
        context => `Thanh toán phiếu chi ${context.entityId} thành công`,
        context => `${actorName(context)} đã thanh toán phiếu chi ${context.entityId}. Công nợ đã được cập nhật.`
    ),
    [WORKFLOW_EVENTS.PAYMENT_VOUCHER_FAILED]: entry(
        'PhieuChi', 'Thanh toán thất bại', 'accounting-payables',
        context => `Thanh toán phiếu chi ${context.entityId} thất bại`,
        context => `${actorName(context)} ghi nhận thanh toán phiếu chi ${context.entityId} thất bại. Công nợ giữ nguyên, cần thực hiện lại.`,
        'UC28'
    ),
    [WORKFLOW_EVENTS.PAYABLE_EXTENSION_REQUESTED]: entry(
        'CongNoGiaHan', 'ChoLienHe', 'purchasing-suppliers',
        context => `Công nợ ${context.entityId} cần xin gia hạn`,
        context => `${actorName(context)} nhờ liên hệ nhà cung cấp xin gia hạn công nợ ${context.entityId}.`,
        'UC11'
    ),
    [WORKFLOW_EVENTS.PAYABLE_EXTENSION_GRANTED]: entry(
        'CongNoGiaHan', 'DaGiaHan', 'accounting-payables',
        context => `Công nợ ${context.entityId} đã ghi hạn mới`,
        context => `${actorName(context)} đã ghi hạn mới cho công nợ ${context.entityId}.`
    ),
    [WORKFLOW_EVENTS.SHIFT_CLOSED]: entry(
        'CaLamViec', 'Đã chốt', 'accounting-settlements',
        context => `Ca ${context.entityId} đã đóng, cần đối soát`,
        context => `${actorName(context)} đã đóng ca ${context.entityId}. Kế toán vui lòng lập hoặc xác nhận phiếu thu.`,
        'UC29'
    ),
    [WORKFLOW_EVENTS.SHIFT_RECEIPT_CONFIRMED]: entry(
        'PhieuThu', 'Đã xác nhận', 'cashier-shifts',
        context => `Phiếu thu ${context.entityId} đã đối soát`,
        context => `${actorName(context)} đã xác nhận phiếu thu ${context.entityId}. Ca đã được đối soát.`
    ),
    [WORKFLOW_EVENTS.QR_RESULT]: entry(
        'ThanhToan', 'Cập nhật', 'cashier-pos',
        context => `Thanh toán QR ${context.entityId} đã cập nhật`,
        context => `Cổng thanh toán đã cập nhật kết quả cho hóa đơn ${context.entityId}.`
    ),
    [WORKFLOW_EVENTS.RETURN_COMPLETED]: entry(
        'PhieuDoiTra', 'Hoàn thành', 'cashier-returns',
        context => `Phiếu đổi trả ${context.entityId} đã hoàn tất`,
        context => `${actorName(context)} đã hoàn tất phiếu đổi trả ${context.entityId}.`
    ),
    [WORKFLOW_EVENTS.RETURN_REFUND_WAITING]: entry(
        'PhieuDoiTra', 'Chờ xử lý hoàn tiền', 'cashier-returns',
        context => `Phiếu đổi trả ${context.entityId} chờ xử lý hoàn tiền`,
        context => `Phiếu đổi trả ${context.entityId} đang chờ xử lý hoàn tiền. Vui lòng kiểm tra két và thử lại.`,
        'UC08'
    ),
    [WORKFLOW_EVENTS.STOCK_ISSUE_CONFIRMED]: entry(
        'PhieuXuat', 'Đã xác nhận', 'warehouse-stock-issues',
        context => `Phiếu xuất ${context.entityId} đã xác nhận xuất`,
        context => `${actorName(context)} đã xác nhận xuất phiếu ${context.entityId}. Hồ sơ kho đã khóa.`
    ),
    [WORKFLOW_EVENTS.SCHEDULE_PUBLISHED]: entry(
        'LichLamViec', 'Đã công bố', 'cashier-schedule',
        context => `Lịch làm việc ${context.entityId} đã công bố`,
        context => `${actorName(context)} đã công bố lịch làm việc ${context.entityId}. Vui lòng xem lịch cá nhân.`
    ),
    [WORKFLOW_EVENTS.PAYROLL_VOUCHER_SUBMITTED]: entry(
        'PhieuChiLuong', 'Chờ duyệt', 'manager-purchase-approvals',
        context => `Phiếu chi lương kỳ ${context.entityId} chờ duyệt`,
        context => `${actorName(context)} đã lập phiếu chi lương kỳ ${context.entityId} và gửi duyệt.`,
        'UC32'
    ),
    [WORKFLOW_EVENTS.PAYROLL_VOUCHER_RESUBMITTED]: entry(
        'PhieuChiLuong', 'Chờ duyệt', 'manager-purchase-approvals',
        context => `Phiếu chi lương ${context.entityId} đã gửi lại`,
        context => `${actorName(context)} đã gửi lại phiếu chi lương ${context.entityId}. Vui lòng kiểm tra hồ sơ mới.`,
        'UC32'
    ),
    [WORKFLOW_EVENTS.PAYROLL_VOUCHER_REJECTED]: entry(
        'PhieuChiLuong', 'Từ chối', 'accounting-payroll',
        context => `Phiếu chi lương ${context.entityId} bị từ chối`,
        context => `${actorName(context)} đã từ chối phiếu chi lương ${context.entityId}. Kế toán vui lòng sửa trên cùng phiếu.`
    ),
    [WORKFLOW_EVENTS.PAYROLL_FUND_HANDED]: entry(
        'QuyLuongKy', 'Đã giao quỹ', 'accounting-payroll',
        context => `Quỹ lương kỳ ${context.entityId} đã bàn giao`,
        context => `${actorName(context)} đã giao quỹ lương kỳ ${context.entityId}. Kế toán vui lòng chi từng phiếu.`,
        'UC33'
    ),
    [WORKFLOW_EVENTS.PAYROLL_PAID]: entry(
        'PhieuChiLuong', 'Thanh toán thành công', 'cashier-schedule',
        context => `Lương kỳ đã được chi`,
        context => `${actorName(context)} đã chi lương trên phiếu ${context.entityId}.`
    ),
    [WORKFLOW_EVENTS.PAYROLL_FAILED]: entry(
        'PhieuChiLuong', 'Thanh toán thất bại', 'accounting-payroll',
        context => `Chi lương ${context.entityId} thất bại`,
        context => `Chi phiếu lương ${context.entityId} thất bại. Kế toán vui lòng thử lại trên cùng phiếu.`,
        'UC33'
    ),
    [WORKFLOW_EVENTS.REPORT_SUBMITTED]: entry(
        'BaoCaoNop', 'Đã gửi', 'admin-warehouse-reports',
        context => `Báo cáo ${context.entityId} đã nộp`,
        context => `${actorName(context)} đã nộp báo cáo ${context.entityId}.`,
        'UC10'
    ),
    [WORKFLOW_EVENTS.REPORT_FEEDBACK]: entry(
        'BaoCaoNop', 'Cần phản hồi', 'home',
        context => `Báo cáo ${context.entityId} cần giải trình`,
        context => `${actorName(context)} yêu cầu giải trình báo cáo ${context.entityId}.`
    ),
    [WORKFLOW_EVENTS.ACCOUNT_CHANGED]: entry(
        'TaiKhoan', 'Đã cập nhật', 'home',
        context => `Quyền truy cập của bạn vừa được cập nhật`,
        context => `${actorName(context)} đã cập nhật tài khoản hoặc quyền. Hãy tải lại phiên làm việc.`
    )
});

const resolveNotifyTransport = (env = process.env) => {
    const value = String(env.NOTIFY_TRANSPORT || DEFAULT_TRANSPORT).trim().toLowerCase();
    return Object.values(TRANSPORTS).includes(value) ? value : DEFAULT_TRANSPORT;
};

const getWorkflowEvent = eventKey => WORKFLOW_CATALOG[eventKey] || null;

module.exports = {
    EVENTS,
    TRANSPORTS,
    DEFAULT_TRANSPORT,
    WORKFLOW_EVENTS,
    WORKFLOW_CATALOG,
    resolveNotifyTransport,
    getWorkflowEvent
};
