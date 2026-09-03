const FUNCTION_CATALOG = [
    { MaChucNang: 'UC01', TenChucNang: 'Đăng nhập và sử dụng tài khoản', Nhom: 'Hệ thống' },
    { MaChucNang: 'UC02', TenChucNang: 'Quản lý tài khoản và phân quyền', Nhom: 'Hệ thống' },
    { MaChucNang: 'UC03', TenChucNang: 'Xem nhật ký hệ thống', Nhom: 'Hệ thống' },
    { MaChucNang: 'UC04', TenChucNang: 'Quản lý nhân viên, sản phẩm, khuyến mãi', Nhom: 'Dữ liệu chung' },
    { MaChucNang: 'UC05', TenChucNang: 'Phê duyệt Đơn mua hàng', Nhom: 'Mua hàng' },
    { MaChucNang: 'UC06', TenChucNang: 'Phê duyệt Phiếu xuất kho thủ công', Nhom: 'Kho' },
    { MaChucNang: 'UC07', TenChucNang: 'Phê duyệt điều chỉnh tồn kho', Nhom: 'Kho' },
    { MaChucNang: 'UC08', TenChucNang: 'Phê duyệt đổi trả và hoàn tiền', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC09', TenChucNang: 'Phê duyệt Phiếu chi thanh toán NCC', Nhom: 'Kế toán' },
    { MaChucNang: 'UC10', TenChucNang: 'Xem báo cáo và thống kê tổng hợp', Nhom: 'Báo cáo' },
    { MaChucNang: 'UC11', TenChucNang: 'Quản lý Nhà cung cấp', Nhom: 'Mua hàng' },
    { MaChucNang: 'UC12', TenChucNang: 'Tiếp nhận Phiếu đề nghị mua hàng', Nhom: 'Mua hàng' },
    { MaChucNang: 'UC13', TenChucNang: 'Lập và quản lý Đơn mua hàng', Nhom: 'Mua hàng' },
    { MaChucNang: 'UC14', TenChucNang: 'Theo dõi Đơn mua hàng và giao hàng', Nhom: 'Mua hàng' },
    { MaChucNang: 'UC15', TenChucNang: 'Tra cứu tồn kho và cảnh báo', Nhom: 'Kho' },
    { MaChucNang: 'UC16', TenChucNang: 'Lập Phiếu đề nghị mua hàng', Nhom: 'Kho' },
    { MaChucNang: 'UC17', TenChucNang: 'Tiếp nhận và kiểm tra hàng', Nhom: 'Kho' },
    { MaChucNang: 'UC18', TenChucNang: 'Lập và xác nhận Phiếu nhập kho', Nhom: 'Kho' },
    { MaChucNang: 'UC19', TenChucNang: 'Lập và thực hiện Phiếu xuất kho', Nhom: 'Kho' },
    { MaChucNang: 'UC20', TenChucNang: 'Kiểm kê và xử lý chênh lệch tồn kho', Nhom: 'Kho' },
    { MaChucNang: 'UC21', TenChucNang: 'Kiểm tra hàng khách đổi trả', Nhom: 'Kho' },
    { MaChucNang: 'UC22', TenChucNang: 'Mở và đóng ca bán hàng', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC23', TenChucNang: 'Quản lý thông tin khách hàng', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC24', TenChucNang: 'Lập Hóa đơn bán hàng', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC25', TenChucNang: 'Ghi nhận thanh toán và hoàn thành HĐ', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC26', TenChucNang: 'Tiếp nhận và xử lý yêu cầu đổi trả', Nhom: 'Bán hàng' },
    { MaChucNang: 'UC27', TenChucNang: 'Quản lý HĐ mua hàng và đối chiếu', Nhom: 'Kế toán' },
    { MaChucNang: 'UC28', TenChucNang: 'Theo dõi và thanh toán công nợ NCC', Nhom: 'Kế toán' },
    { MaChucNang: 'UC29', TenChucNang: 'Đối soát doanh thu, lập Phiếu thu', Nhom: 'Kế toán' },
    { MaChucNang: 'UC30', TenChucNang: 'Phân công ca và giám sát chấm công', Nhom: 'Nhân sự mở rộng' },
    { MaChucNang: 'UC31', TenChucNang: 'Xem lịch và chấm công cá nhân', Nhom: 'Nhân sự mở rộng' },
    { MaChucNang: 'UC32', TenChucNang: 'Duyệt công và tổng hợp lương tạm tính', Nhom: 'Nhân sự mở rộng' },
    { MaChucNang: 'UC33', TenChucNang: 'Lập, khóa và thanh toán bảng lương', Nhom: 'Nhân sự mở rộng' }
];

const MANAGER_FIXED_PERMISSION_CODES = ['UC01', 'UC02', 'UC03', 'UC04', 'UC05', 'UC06', 'UC07', 'UC08', 'UC09', 'UC10', 'UC30', 'UC32'];

const ROLE_PERMISSION_CODES = {
    'quản lý': MANAGER_FIXED_PERMISSION_CODES,
    'nhân viên mua hàng': ['UC01', 'UC11', 'UC12', 'UC13', 'UC14', 'UC31'],
    'thủ kho': ['UC01', 'UC15', 'UC16', 'UC17', 'UC18', 'UC19', 'UC20', 'UC21', 'UC31'],
    'thu ngân': ['UC01', 'UC22', 'UC23', 'UC24', 'UC25', 'UC26', 'UC31'],
    'kế toán': ['UC01', 'UC27', 'UC28', 'UC29', 'UC31', 'UC33']
};

module.exports = {
    FUNCTION_CATALOG,
    MANAGER_FIXED_PERMISSION_CODES,
    ROLE_PERMISSION_CODES
};
