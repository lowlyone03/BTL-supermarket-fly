const { sql, poolPromise } = require('../config/db');

const SECRET_KEY = /matkhau|password|hash|token|secret|otp/i;

const TABLE_LABELS = {
    DeNghiMuaHang: 'Phiếu đề nghị mua hàng',
    DonMuaHang: 'Đơn mua hàng',
    PhieuNhap: 'Phiếu nhập kho',
    PhieuXuat: 'Phiếu xuất kho',
    KiemKe: 'Đợt kiểm kê',
    PhieuDoiTra: 'Phiếu đổi trả',
    HoaDon: 'Hóa đơn bán hàng',
    HoaDonMuaHang: 'Hóa đơn mua hàng',
    ThanhToan: 'Thanh toán hóa đơn',
    PhieuChi: 'Phiếu chi Nhà cung cấp',
    PhieuChiLuong: 'Phiếu chi lương',
    QuyLuongKy: 'Quỹ lương chung',
    LichSuChiLuong: 'Lịch sử chi lương từ quỹ chung',
    PhieuThu: 'Phiếu thu cuối ca',
    CaLamViec: 'Ca bán hàng',
    CongNoNCC: 'Công nợ Nhà cung cấp',
    NhaCungCap: 'Nhà cung cấp',
    SanPham: 'Sản phẩm',
    DanhMuc: 'Danh mục hàng hóa',
    KhuyenMai: 'Chương trình khuyến mãi',
    NhanVien: 'Hồ sơ nhân viên',
    TaiKhoan: 'Tài khoản đăng nhập',
    VaiTro_ChucNang: 'Phân quyền chức năng',
    LichLamViec: 'Lịch làm việc',
    ChamCong: 'Chấm công',
    KyLuong: 'Kỳ lương',
    BangLuong: 'Bảng lương',
    NgayLeNam: 'Lịch ngày lễ năm',
    HeSoLuongNgay: 'Hệ số lương ngày',
    KeHoachDieuChinhLaiLo: 'Kế hoạch điều chỉnh lãi lỗ',
    ThongBaoCuaHang: 'Thông báo cửa hàng'
};

const TARGET_BY_TABLE = {
    DeNghiMuaHang: 'manager-purchase-approvals',
    DonMuaHang: 'manager-purchase-approvals',
    PhieuXuat: 'manager-purchase-approvals',
    KiemKe: 'manager-purchase-approvals',
    PhieuDoiTra: 'manager-purchase-approvals',
    PhieuChi: 'manager-purchase-approvals',
    PhieuChiLuong: 'manager-purchase-approvals',
    QuyLuongKy: 'accounting-payroll',
    LichSuChiLuong: 'accounting-payroll',
    HoaDonMuaHang: 'manager-payables',
    CongNoNCC: 'manager-payables',
    PhieuThu: 'manager-payables',
    LichLamViec: 'manager-workforce',
    ChamCong: 'manager-workforce',
    CaLamViec: 'manager-workforce',
    KyLuong: 'manager-workforce',
    BangLuong: 'manager-workforce',
    NgayLeNam: 'manager-holidays',
    HeSoLuongNgay: 'manager-holidays',
    KeHoachDieuChinhLaiLo: 'manager-reports',
    ThongBaoCuaHang: 'manager-reports',
    SanPham: '../admin/products.html',
    DanhMuc: '../admin/products.html',
    KhuyenMai: '../admin/promotions.html',
    NhanVien: '../admin/employees.html',
    TaiKhoan: '../admin/accounts.html',
    VaiTro_ChucNang: '../admin/permissions.html'
};

const ACTION_META = {
    'Gửi kế hoạch điều chỉnh lãi lỗ': {
        viecLam: 'Gửi kế hoạch điều chỉnh khi cửa hàng lỗ',
        giaiThich: 'Quản lý ghi nguyên nhân, việc sẽ làm và hạn xem lại, rồi gửi thông báo tới mọi nhân viên đang làm việc. Không chi tiền, không sửa lãi gộp.',
        mucDo: 'Cảnh báo', nhom: 'tien-ton', target: 'manager-reports'
    },
    'Đăng nhập': {
        viecLam: 'Đăng nhập hệ thống',
        giaiThich: 'Ghi nhận nhân viên đã mở phần mềm. Không làm thay đổi tiền, tồn kho hay chứng từ.',
        mucDo: 'Thông tin', nhom: 'dang-nhap'
    },
    'Đổi mật khẩu': {
        viecLam: 'Đổi mật khẩu',
        giaiThich: 'Nhân viên tự đổi mật khẩu. Nhật ký không lưu mật khẩu.',
        mucDo: 'Cảnh báo', nhom: 'he-thong', target: '../admin/accounts.html'
    },
    'Hoàn thành hóa đơn': {
        viecLam: 'Hoàn thành hóa đơn bán hàng',
        giaiThich: 'Khách đã trả đủ tiền. Hệ thống trừ tồn kho và ghi doanh thu ca. Đây là số liệu bán hàng chính thức.',
        mucDo: 'Quan trọng', nhom: 'tien-ton'
    },
    'Hoàn thành hóa đơn bán hàng': {
        viecLam: 'Hoàn thành hóa đơn bán hàng',
        giaiThich: 'Khách đã trả đủ tiền. Hệ thống trừ tồn kho và ghi doanh thu ca. Đây là số liệu bán hàng chính thức.',
        mucDo: 'Quan trọng', nhom: 'tien-ton'
    },
    'Lập hóa đơn nháp': {
        viecLam: 'Lập hóa đơn nháp',
        giaiThich: 'Hóa đơn chưa thu tiền, tồn kho chưa trừ. Có thể hủy nếu chưa thanh toán.',
        mucDo: 'Thông tin', nhom: 'tien-ton'
    },
    'Hủy hóa đơn nháp': {
        viecLam: 'Hủy hóa đơn nháp',
        giaiThich: 'Hóa đơn nháp bị hủy. Tiền và tồn kho không đổi vì chưa hoàn thành.',
        mucDo: 'Cảnh báo', nhom: 'tien-ton'
    },
    'Thu tiền hóa đơn': {
        viecLam: 'Thu tiền hóa đơn',
        giaiThich: 'Ghi nhận một lần khách trả tiền. Hóa đơn chỉ hoàn thành khi đã thu đủ.',
        mucDo: 'Quan trọng', nhom: 'tien-ton'
    },
    'Mở ca bán hàng': {
        viecLam: 'Mở ca bán hàng',
        giaiThich: 'Thu ngân bắt đầu ca và khai báo tiền quỹ đầu ca. Doanh thu ca được cộng từ đây.',
        mucDo: 'Quan trọng', nhom: 'ca'
    },
    'Đóng ca bán hàng': {
        viecLam: 'Đóng ca bán hàng',
        giaiThich: 'Thu ngân chốt tiền cuối ca. Kế toán sẽ đối soát phiếu thu. Chênh lệch tiền mặt cần được giải thích.',
        mucDo: 'Quan trọng', nhom: 'tien-ton'
    },
    'Xác nhận Phiếu thu': {
        viecLam: 'Xác nhận phiếu thu cuối ca',
        giaiThich: 'Kế toán xác nhận số tiền mặt bàn giao khớp (hoặc đã ghi lý do lệch). Ca được đánh dấu đã đối soát.',
        mucDo: 'Quan trọng', nhom: 'tien-ton', target: 'manager-payables'
    },
    'Lập Phiếu thu cuối ca': {
        viecLam: 'Lập phiếu thu cuối ca',
        giaiThich: 'Kế toán lập chứng từ bàn giao tiền mặt theo số liệu ca đã đóng.',
        mucDo: 'Quan trọng', nhom: 'tien-ton'
    },
    'Tạo đề nghị mua hàng': {
        viecLam: 'Lưu phiếu đề nghị mua hàng',
        giaiThich: 'Thủ kho ghi nhu cầu nhập hàng. Tồn kho chưa đổi cho đến khi nhận hàng và xác nhận phiếu nhập.',
        mucDo: 'Thông tin', nhom: 'mua-hang'
    },
    'Cập nhật đề nghị mua hàng': {
        viecLam: 'Sửa phiếu đề nghị mua hàng',
        giaiThich: 'Thủ kho chỉnh số lượng/mặt hàng trên bản nháp hoặc phiếu bị trả bổ sung.',
        mucDo: 'Thông tin', nhom: 'mua-hang'
    },
    'Gửi đề nghị mua hàng': {
        viecLam: 'Gửi đề nghị tới mua hàng',
        giaiThich: 'Hồ sơ chuyển cho Nhân viên mua hàng. Đây là bước bắt đầu quy trình đặt hàng.',
        mucDo: 'Cảnh báo', nhom: 'mua-hang'
    },
    'Hủy đề nghị mua hàng': {
        viecLam: 'Hủy đề nghị mua hàng',
        giaiThich: 'Phiếu đề nghị không còn dùng. Không ảnh hưởng tồn kho.',
        mucDo: 'Cảnh báo', nhom: 'mua-hang'
    },
    'Tiếp nhận đề nghị mua hàng': {
        viecLam: 'Tiếp nhận đề nghị từ kho',
        giaiThich: 'Nhân viên mua hàng nhận hồ sơ và có thể lập Đơn mua.',
        mucDo: 'Thông tin', nhom: 'mua-hang'
    },
    'Yêu cầu bổ sung đề nghị mua hàng': {
        viecLam: 'Trả đề nghị để kho bổ sung',
        giaiThich: 'Hồ sơ chưa đủ rõ. Thủ kho phải sửa rồi gửi lại.',
        mucDo: 'Cảnh báo', nhom: 'mua-hang'
    },
    'Lập Đơn mua hàng': {
        viecLam: 'Lập đơn mua hàng',
        giaiThich: 'Chọn Nhà cung cấp và số lượng đặt. Đơn còn nháp, chưa đặt hàng thật.',
        mucDo: 'Thông tin', nhom: 'mua-hang'
    },
    'Chỉnh sửa Đơn mua hàng': {
        viecLam: 'Sửa đơn mua hàng',
        giaiThich: 'Cập nhật hồ sơ trước khi gửi Quản lý phê duyệt.',
        mucDo: 'Thông tin', nhom: 'mua-hang'
    },
    'Gửi duyệt Đơn mua hàng': {
        viecLam: 'Gửi đơn mua chờ Quản lý duyệt',
        giaiThich: 'Quản lý phải đồng ý mới được gửi Nhà cung cấp. Tồn kho chưa đổi.',
        mucDo: 'Cảnh báo', nhom: 'duyet'
    },
    'Phê duyệt Đơn mua hàng': {
        viecLam: 'Phê duyệt đơn mua hàng',
        giaiThich: 'Quản lý đồng ý mua. Bước tiếp theo: gửi Nhà cung cấp. Tồn kho vẫn chưa cộng.',
        mucDo: 'Quan trọng', nhom: 'duyet'
    },
    'Từ chối Đơn mua hàng': {
        viecLam: 'Từ chối đơn mua hàng',
        giaiThich: 'Đơn không được thực hiện. Không phát sinh công nợ hay tồn kho.',
        mucDo: 'Cảnh báo', nhom: 'duyet'
    },
    'Yêu cầu chỉnh sửa Đơn mua hàng': {
        viecLam: 'Yêu cầu sửa đơn mua',
        giaiThich: 'Quản lý chưa duyệt, mua hàng phải chỉnh rồi gửi lại.',
        mucDo: 'Cảnh báo', nhom: 'duyet'
    },
    'Gửi Đơn mua cho Nhà cung cấp': {
        viecLam: 'Gửi đơn mua cho Nhà cung cấp',
        giaiThich: 'Bắt đầu theo dõi hàng đã đặt chưa nhận. Công nợ chưa ghi cho đến khi có hóa đơn.',
        mucDo: 'Quan trọng', nhom: 'mua-hang'
    },
    'Ghi nhận Nhà cung cấp xác nhận': {
        viecLam: 'Nhà cung cấp xác nhận đơn mua',
        giaiThich: 'NCC đồng ý giao hàng theo đơn đã gửi.',
        mucDo: 'Thông tin', nhom: 'mua-hang'
    },
    'Ghi nhận Nhà cung cấp giao hàng': {
        viecLam: 'Ghi nhận NCC giao hàng',
        giaiThich: 'Xe hàng đang đến hoặc đã báo giao. Thủ kho sẽ kiểm nhận. Tồn kho chưa cộng.',
        mucDo: 'Cảnh báo', nhom: 'ton-kho'
    },
    'Ghi nhận xe hàng đến kho': {
        viecLam: 'Ghi nhận xe hàng đến kho',
        giaiThich: 'Thủ kho xác nhận lô hàng đã tới, chuẩn bị kiểm và lập phiếu nhập.',
        mucDo: 'Thông tin', nhom: 'ton-kho'
    },
    'Lập Phiếu kiểm nhận hàng': {
        viecLam: 'Lập phiếu nhập / kiểm nhận',
        giaiThich: 'Ghi số lượng đạt/không đạt. Tồn kho chỉ cộng sau khi xác nhận nhập kho.',
        mucDo: 'Cảnh báo', nhom: 'ton-kho'
    },
    'Xác nhận nhập kho': {
        viecLam: 'Xác nhận nhập kho',
        giaiThich: 'Cộng tồn những mặt hàng đạt yêu cầu. Đây là bước làm tăng hàng trên kệ/kho.',
        mucDo: 'Quan trọng', nhom: 'ton-kho'
    },
    'Lập Phiếu xuất kho': {
        viecLam: 'Lập phiếu xuất kho',
        giaiThich: 'Phiếu còn nháp. Tồn kho chưa trừ cho đến khi được duyệt và xác nhận xuất.',
        mucDo: 'Thông tin', nhom: 'ton-kho'
    },
    'Cập nhật Phiếu xuất kho': {
        viecLam: 'Sửa phiếu xuất kho',
        giaiThich: 'Chỉnh nội dung phiếu nháp. Tồn kho chưa đổi.',
        mucDo: 'Thông tin', nhom: 'ton-kho'
    },
    'Gửi duyệt Phiếu xuất kho': {
        viecLam: 'Gửi phiếu xuất chờ duyệt',
        giaiThich: 'Quản lý phải duyệt trước khi trừ tồn. Hàng hỏng/hết hạn/xuất khác kho đều đi qua bước này.',
        mucDo: 'Cảnh báo', nhom: 'duyet'
    },
    'Phê duyệt Phiếu xuất kho': {
        viecLam: 'Phê duyệt phiếu xuất kho',
        giaiThich: 'Cho phép Thủ kho xác nhận xuất. Tồn kho sẽ giảm ở bước xác nhận.',
        mucDo: 'Quan trọng', nhom: 'duyet'
    },
    'Từ chối Phiếu xuất kho': {
        viecLam: 'Từ chối phiếu xuất kho',
        giaiThich: 'Không xuất hàng, tồn kho giữ nguyên.',
        mucDo: 'Cảnh báo', nhom: 'duyet'
    },
    'Xác nhận xuất kho': {
        viecLam: 'Xác nhận xuất kho',
        giaiThich: 'Đã trừ tồn kho theo phiếu. Hàng không còn trên sổ.',
        mucDo: 'Quan trọng', nhom: 'ton-kho'
    },
    'Tạo đợt kiểm kê': {
        viecLam: 'Tạo đợt kiểm kê',
        giaiThich: 'Chụp số tồn hệ thống tại thời điểm tạo. Tồn chỉ đổi nếu sau này Quản lý duyệt chênh lệch.',
        mucDo: 'Thông tin', nhom: 'ton-kho'
    },
    'Cập nhật kiểm kê': {
        viecLam: 'Ghi số đếm kiểm kê',
        giaiThich: 'Thủ kho nhập số lượng thực tế. Chưa tác động tồn kho.',
        mucDo: 'Thông tin', nhom: 'ton-kho'
    },
    'Gửi duyệt điều chỉnh tồn': {
        viecLam: 'Gửi duyệt điều chỉnh tồn sau kiểm kê',
        giaiThich: 'Có chênh lệch. Quản lý duyệt mới được cộng/trừ tồn.',
        mucDo: 'Cảnh báo', nhom: 'duyet'
    },
    'Hoàn thành kiểm kê': {
        viecLam: 'Kết thúc kiểm kê (không lệch)',
        giaiThich: 'Số đếm khớp hệ thống. Tồn kho không đổi.',
        mucDo: 'Thông tin', nhom: 'ton-kho'
    },
    'Phê duyệt điều chỉnh tồn': {
        viecLam: 'Duyệt điều chỉnh tồn kho',
        giaiThich: 'Tồn kho đã được cộng/trừ theo chênh lệch kiểm kê. Ảnh hưởng trực tiếp hàng trên sổ.',
        mucDo: 'Quan trọng', nhom: 'duyet'
    },
    'Từ chối điều chỉnh tồn': {
        viecLam: 'Từ chối điều chỉnh tồn',
        giaiThich: 'Không đổi tồn. Thủ kho có thể kiểm lại.',
        mucDo: 'Cảnh báo', nhom: 'duyet'
    },
    'Lập phiếu đổi trả': {
        viecLam: 'Lập phiếu đổi/trả hàng',
        giaiThich: 'Thu ngân ghi hàng khách trả. Tiền hoàn và tồn kho chỉ đổi sau các bước kiểm-duyệt-xác nhận.',
        mucDo: 'Cảnh báo', nhom: 'tien-ton'
    },
    'Gửi hàng đổi trả cho Thủ kho': {
        viecLam: 'Gửi hàng đổi trả cho Thủ kho kiểm',
        giaiThich: 'Chờ Thủ kho ghi hàng còn bán được hay phải loại bỏ.',
        mucDo: 'Cảnh báo', nhom: 'ton-kho'
    },
    'Kiểm tra hàng đổi trả': {
        viecLam: 'Kiểm hàng khách trả',
        giaiThich: 'Thủ kho quyết định nhập lại kho bán hay loại bỏ. Quyết định này ảnh hưởng tồn khi phiếu hoàn tất.',
        mucDo: 'Quan trọng', nhom: 'ton-kho'
    },
    'Sửa kết quả kiểm đổi trả': {
        viecLam: 'Sửa kết quả kiểm đổi trả',
        giaiThich: 'Thủ kho sửa trước khi Quản lý duyệt. Nếu tick nhầm nhập lại hàng hỏng, bước này (hoặc xác nhận tích nhầm) dùng để sửa.',
        mucDo: 'Cảnh báo', nhom: 'ton-kho'
    },
    'Xác nhận tích nhầm kiểm đổi trả': {
        viecLam: 'Xác nhận tích nhầm (hàng hỏng đã nhập lại)',
        giaiThich: 'Sửa sai: hàng hỏng từng được cộng tồn sẽ bị trừ lại, hoặc sẽ không cộng khi hoàn tất.',
        mucDo: 'Quan trọng', nhom: 'ton-kho'
    },
    'Phê duyệt đổi trả': {
        viecLam: 'Phê duyệt phiếu đổi trả',
        giaiThich: 'Quản lý đồng ý. Thu ngân sẽ hoàn tiền/đổi hàng. Tồn có thể cộng nếu Thủ kho cho nhập lại kho bán.',
        mucDo: 'Quan trọng', nhom: 'duyet'
    },
    'Từ chối đổi trả': {
        viecLam: 'Từ chối phiếu đổi trả',
        giaiThich: 'Không hoàn tiền, không đổi hàng, tồn không cộng.',
        mucDo: 'Cảnh báo', nhom: 'duyet'
    },
    'Hoàn thành đổi trả': {
        viecLam: 'Hoàn thành đổi/trả hàng',
        giaiThich: 'Đã xử lý với khách. Tiền hoàn và tồn kho (nếu nhập lại) đã được ghi nhận.',
        mucDo: 'Quan trọng', nhom: 'tien-ton'
    },
    'Tiếp nhận hóa đơn Nhà cung cấp': {
        viecLam: 'Tiếp nhận hóa đơn Nhà cung cấp',
        giaiThich: 'Kế toán nhập hóa đơn mua. Công nợ ghi nhận sau khi đối chiếu ba bên.',
        mucDo: 'Cảnh báo', nhom: 'cong-no'
    },
    'Đối chiếu hóa đơn ba bên': {
        viecLam: 'Đối chiếu hóa đơn ba bên',
        giaiThich: 'Khớp đơn mua – phiếu nhập – hóa đơn. Sau bước này mới ghi công nợ Nhà cung cấp.',
        mucDo: 'Quan trọng', nhom: 'cong-no'
    },
    'Lập và gửi duyệt Phiếu chi': {
        viecLam: 'Lập phiếu chi (trả NCC)',
        giaiThich: 'Đề nghị chi tiền cho Nhà cung cấp. Tiền chỉ ra khi Quản lý duyệt và Kế toán ghi đã trả.',
        mucDo: 'Quan trọng', nhom: 'cong-no'
    },
    'Chỉnh sửa và gửi lại Phiếu chi': {
        viecLam: 'Sửa và gửi lại phiếu chi',
        giaiThich: 'Kế toán chỉnh hồ sơ rồi trình duyệt lại.',
        mucDo: 'Cảnh báo', nhom: 'cong-no'
    },
    'Phê duyệt Phiếu chi': {
        viecLam: 'Phê duyệt phiếu chi',
        giaiThich: 'Quản lý cho phép trả tiền Nhà cung cấp. Kế toán sẽ ghi nhận đã chi.',
        mucDo: 'Quan trọng', nhom: 'duyet'
    },
    'Từ chối Phiếu chi': {
        viecLam: 'Từ chối phiếu chi',
        giaiThich: 'Không chi tiền. Công nợ giữ nguyên.',
        mucDo: 'Cảnh báo', nhom: 'duyet'
    },
    'Thanh toán Phiếu chi': {
        viecLam: 'Ghi nhận đã trả tiền NCC',
        giaiThich: 'Tiền đã chi, công nợ Nhà cung cấp giảm tương ứng.',
        mucDo: 'Quan trọng', nhom: 'cong-no'
    },
    'Lập bảng lương tháng': {
        viecLam: 'Lập bảng lương tháng',
        giaiThich: 'Tính lương theo giờ công đã duyệt, hệ số ngày/đêm/OT/lễ và 8 giờ nghỉ lễ hưởng lương. Tất toán dự kiến mùng 10 tháng sau. Chưa trả tiền.',
        mucDo: 'Quan trọng', nhom: 'luong'
    },
    'Khóa kỳ lương': {
        viecLam: 'Khóa kỳ lương',
        giaiThich: 'Không cho tính lại. Lịch lễ các ngày trong kỳ bị khóa. Kế toán lập phiếu chi, Quản lý duyệt quỹ, rồi mới chi.',
        mucDo: 'Cảnh báo', nhom: 'luong'
    },
    'Thanh toán lương nhân viên': {
        viecLam: 'Ghi nhận trả lương',
        giaiThich: 'Cách cũ. Hiện phải chi qua Phiếu chi lương đã duyệt.',
        mucDo: 'Quan trọng', nhom: 'luong'
    },
    'Lập Phiếu chi lương': {
        viecLam: 'Lập phiếu chi lương',
        giaiThich: 'Mỗi nhân viên một phiếu, một kênh tiền mặt hoặc chuyển khoản. Số tiền khóa theo tổng lương. Chưa thanh toán.',
        mucDo: 'Quan trọng', nhom: 'luong'
    },
    'Gửi lại Phiếu chi lương': {
        viecLam: 'Sửa và gửi lại phiếu chi lương',
        giaiThich: 'Kế toán đổi phương thức trên cùng phiếu bị từ chối. Không tạo phiếu thứ hai.',
        mucDo: 'Cảnh báo', nhom: 'luong'
    },
    'Duyệt Phiếu chi lương': {
        viecLam: 'Duyệt phiếu chi lương',
        giaiThich: 'Quản lý đồng ý chi cho nhân viên này. Chưa đưa tiền. Quỹ chung giao sau, một lần cho cả kỳ.',
        mucDo: 'Quan trọng', nhom: 'duyet'
    },
    'Duyệt hàng loạt Phiếu chi lương': {
        viecLam: 'Duyệt tất cả phiếu chi lương kỳ',
        giaiThich: 'Duyệt nhanh các phiếu đang chờ trên bảng lương kỳ đó. Vẫn chưa giao quỹ.',
        mucDo: 'Quan trọng', nhom: 'duyet'
    },
    'Giao quỹ lương chung': {
        viecLam: 'Giao quỹ lương chung',
        giaiThich: 'Quản lý đưa một cục tiền mặt và/hoặc ủy quyền chuyển khoản cho Kế toán. Kế toán mới được chích từng người từ quỹ này.',
        mucDo: 'Quan trọng', nhom: 'luong', target: 'accounting-payroll'
    },
    'Duyệt Phiếu chi lương và giao quỹ': {
        viecLam: 'Duyệt phiếu chi lương và giao quỹ (cách cũ)',
        giaiThich: 'Cách cũ: giao quỹ theo từng người. Hiện tại duyệt riêng, giao quỹ chung một lần.',
        mucDo: 'Quan trọng', nhom: 'duyet'
    },
    'Từ chối Phiếu chi lương': {
        viecLam: 'Từ chối phiếu chi lương',
        giaiThich: 'Kế toán sửa trên cùng phiếu. Bảng lương vẫn khóa.',
        mucDo: 'Cảnh báo', nhom: 'duyet'
    },
    'Chi lương từ quỹ chung': {
        viecLam: 'Chi lương từ quỹ chung',
        giaiThich: 'Kế toán chích một khoản từ quỹ chung để trả một nhân viên. Quỹ còn lại giảm. Chuyển khoản bắt buộc mã giao dịch.',
        mucDo: 'Quan trọng', nhom: 'luong', target: 'accounting-payroll'
    },
    'Chi lương thành công': {
        viecLam: 'Chi lương thành công',
        giaiThich: 'Bảng lương nhân viên chuyển Đã thanh toán. Cấm chi lần hai. Chuyển khoản bắt buộc mã giao dịch.',
        mucDo: 'Quan trọng', nhom: 'luong'
    },
    'Ghi nhận chi lương thất bại': {
        viecLam: 'Chi lương thất bại',
        giaiThich: 'Bảng lương giữ Đã khóa. Thực hiện lại trên cùng phiếu, không lập phiếu mới.',
        mucDo: 'Cảnh báo', nhom: 'luong'
    },
    'Cập nhật lịch ngày lễ năm': {
        viecLam: 'Cập nhật lịch ngày lễ năm',
        giaiThich: 'Quản lý khai báo ngày Tết âm, Giỗ Tổ và ngày liền kề 02/09. Không sửa được ngày thuộc kỳ lương đã khóa.',
        mucDo: 'Quan trọng', nhom: 'luong', target: 'manager-holidays'
    },
    'Cập nhật hệ số lương ngày': {
        viecLam: 'Cập nhật hệ số lương ngày',
        giaiThich: 'Hệ số không được thấp hơn mức tối thiểu Bộ luật Lao động 2019 / Nghị định 145.',
        mucDo: 'Cảnh báo', nhom: 'luong', target: 'manager-holidays'
    },
    'Phân ca tự động': {
        viecLam: 'Phân ca tự động',
        giaiThich: 'Quản lý tạo lịch làm việc bản nháp cho cửa hàng.',
        mucDo: 'Thông tin', nhom: 'ca'
    },
    'Duyệt chấm công': {
        viecLam: 'Duyệt chấm công',
        giaiThich: 'Số phút được duyệt sẽ đưa vào bảng lương. Có/không tính tăng ca theo quyết định Quản lý.',
        mucDo: 'Quan trọng', nhom: 'luong'
    },
    'Thanh toán Phiếu chi thành công': {
        viecLam: 'Trả tiền Nhà cung cấp thành công',
        giaiThich: 'Tiền đã chi, công nợ Nhà cung cấp được tất toán. Đây là giao dịch tiền thật.',
        mucDo: 'Quan trọng', nhom: 'cong-no', target: 'manager-payables'
    },
    'Ghi nhận thanh toán Phiếu chi thất bại': {
        viecLam: 'Thanh toán phiếu chi thất bại',
        giaiThich: 'Không trừ công nợ. Có thể thực hiện lại trên cùng phiếu chi.',
        mucDo: 'Cảnh báo', nhom: 'cong-no', target: 'manager-payables'
    },
    'Khóa tài khoản': {
        viecLam: 'Khóa tài khoản đăng nhập',
        giaiThich: 'Nhân viên không còn đăng nhập được cho đến khi được mở khóa.',
        mucDo: 'Cảnh báo', nhom: 'he-thong', target: '../admin/accounts.html'
    },
    'Mở khóa tài khoản': {
        viecLam: 'Mở khóa tài khoản',
        giaiThich: 'Tài khoản được phép đăng nhập lại.',
        mucDo: 'Cảnh báo', nhom: 'he-thong', target: '../admin/accounts.html'
    },
    'Đặt lại mật khẩu': {
        viecLam: 'Đặt lại mật khẩu',
        giaiThich: 'Quản lý đặt lại mật khẩu. Nhật ký không lưu mật khẩu mới.',
        mucDo: 'Cảnh báo', nhom: 'he-thong', target: '../admin/accounts.html'
    },
    'Đổi vai trò': {
        viecLam: 'Đổi vai trò tài khoản',
        giaiThich: 'Thay đổi quyền menu/API của tài khoản theo vai trò mới.',
        mucDo: 'Quan trọng', nhom: 'he-thong', target: '../admin/accounts.html'
    },
    'Sửa nhân viên': {
        viecLam: 'Sửa hồ sơ nhân viên',
        giaiThich: 'Cập nhật thông tin nhân sự. Không liên quan tiền hay tồn kho.',
        mucDo: 'Thông tin', nhom: 'he-thong', target: '../admin/employees.html'
    },
    'Tạo tài khoản': {
        viecLam: 'Cấp tài khoản đăng nhập',
        giaiThich: 'Nhân viên có thể đăng nhập phần mềm. Mật khẩu không được ghi vào nhật ký.',
        mucDo: 'Cảnh báo', nhom: 'he-thong'
    },
    'Cập nhật phân quyền': {
        viecLam: 'Sửa phân quyền chức năng',
        giaiThich: 'Thay đổi menu/API mà từng vai trò được dùng. Ảnh hưởng toàn cửa hàng.',
        mucDo: 'Quan trọng', nhom: 'he-thong'
    }
};

const ROLE_NOUN = {
    'Quản lý': 'Quản lý',
    'Kế toán': 'Kế toán',
    'Thu ngân': 'Thu ngân',
    'Thủ kho': 'Thủ kho',
    'Nhân viên mua hàng': 'Nhân viên mua hàng'
};

let extraColumnSet = null;

const clientIp = req => {
    if (!req) return null;
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return (forwarded || req.ip || req.socket?.remoteAddress || '').slice(0, 45) || null;
};

const scrub = value => {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(scrub);
    if (typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            if (SECRET_KEY.test(key)) continue;
            out[key] = scrub(item);
        }
        return out;
    }
    return value;
};

const makeRequest = source => {
    if (!source) return null;
    if (typeof source.begin === 'function' && typeof source.commit === 'function') return new sql.Request(source);
    if (source.transaction && typeof source.transaction === 'object') return new sql.Request(source.transaction);
    if (source.parent && typeof source.parent.begin === 'function' && typeof source.parent.commit === 'function') {
        return new sql.Request(source.parent);
    }
    if (typeof source.request === 'function' && !source.input) return source.request();
    if (source.parent && typeof source.parent.request === 'function') return source.parent.request();
    return null;
};

const loadExtraColumns = async pool => {
    if (extraColumnSet) return extraColumnSet;
    const result = await pool.request().query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='NhatKy'
          AND COLUMN_NAME IN ('MaUC','KetQua','MucDo','DuLieuJSON','DiaChiIP')`);
    extraColumnSet = new Set(result.recordset.map(row => row.COLUMN_NAME));
    return extraColumnSet;
};

const inferMeta = row => {
    const action = String(row.HanhDong || '');
    const lower = action.toLocaleLowerCase('vi-VN');
    let mucDo = 'Thông tin';
    let nhom = 'khac';
    if (/phê duyệt|duyệt|từ chối/.test(lower)) { mucDo = 'Quan trọng'; nhom = 'duyet'; }
    if (/nhập kho|xuất kho|tồn|kiểm kê|đổi trả/.test(lower)) { mucDo = 'Quan trọng'; nhom = 'ton-kho'; }
    if (/hóa đơn|phiếu chi|phiếu thu|thanh toán|công nợ|lương|tiền/.test(lower)) { mucDo = 'Quan trọng'; nhom = 'tien-ton'; }
    if (/đăng nhập/.test(lower)) { mucDo = 'Thông tin'; nhom = 'dang-nhap'; }
    if (/khóa|xóa|ngừng|hủy/.test(lower)) mucDo = 'Cảnh báo';
    return {
        viecLam: action || 'Thao tác hệ thống',
        giaiThich: row.NoiDung
            ? `Chi tiết đã ghi: ${row.NoiDung}`
            : 'Thao tác được ghi nhận trên hệ thống. Bấm dòng để xem chứng từ liên quan nếu có.',
        mucDo,
        nhom
    };
};

const roleNoun = role => ROLE_NOUN[role] || role || 'Nhân viên';

const presentAudit = row => {
    const meta = ACTION_META[row.HanhDong] || inferMeta(row);
    const who = row.TenNV
        ? `${roleNoun(row.TenVaiTro)} ${row.TenNV}`
        : (row.TenDangNhap || 'Hệ thống');
    const docLabel = TABLE_LABELS[row.BangLienQuan] || row.BangLienQuan || '';
    const ma = row.MaBanGhi ? String(row.MaBanGhi) : '';
    const login = meta.nhom === 'dang-nhap' || String(row.HanhDong || '').toLocaleLowerCase('vi-VN').includes('đăng nhập');
    let tieuDe = login
        ? `${who} đăng nhập vào hệ thống.`
        : `${who} ${meta.viecLam.toLocaleLowerCase('vi-VN')}${ma ? ` ${ma}` : ''}.`;
    if (!login && row.NoiDung && !tieuDe.includes(row.NoiDung)) {
        tieuDe = `${tieuDe.replace(/\.$/, '')} — ${row.NoiDung}`.slice(0, 400);
    }
    const ketQua = row.KetQua || (String(row.HanhDong || '').includes('Từ chối') || String(row.HanhDong || '').includes('Thất bại')
        ? 'Thất bại'
        : 'Thành công');
    let diff = null;
    if (row.DuLieuJSON) {
        try { diff = JSON.parse(row.DuLieuJSON); } catch { diff = null; }
    }
    const mucDo = row.MucDo || meta.mucDo;
    return {
        ...row,
        tieuDe,
        viecLam: meta.viecLam,
        doiTuong: docLabel || 'Hệ thống',
        doiTuongMa: ma,
        ketQuaHienThi: ketQua,
        giaiThich: meta.giaiThich,
        mucDoHienThi: mucDo,
        nhom: meta.nhom,
        laDangNhap: login,
        quanTrong: ['Quan trọng', 'Cảnh báo'].includes(mucDo),
        target: meta.target || TARGET_BY_TABLE[row.BangLienQuan] || '',
        truoc: diff?.truoc || null,
        sau: diff?.sau || null
    };
};

const logAudit = async (source, opts = {}) => {
    const options = source && typeof source === 'object' && !opts.action && (source.action || source.HanhDong)
        ? source
        : { ...opts, source };
    const {
        user, req, action, table, recordId, content,
        uc = null, result = 'Thành công', severity = null,
        before = undefined, after = undefined, ip = null
    } = options;
    const hanhDong = String(action || '').trim().slice(0, 250);
    if (!hanhDong) return;
    const meta = ACTION_META[hanhDong] || inferMeta({ HanhDong: hanhDong, NoiDung: content, BangLienQuan: table });
    const pool = await poolPromise;
    const request = makeRequest(options.source || options.transaction || options.pool || source) || pool.request();
    const columns = await loadExtraColumns(pool);
    const jsonPayload = (before !== undefined || after !== undefined)
        ? JSON.stringify(scrub({ truoc: before ?? null, sau: after ?? null }))
        : null;
    const record = recordId == null ? null : String(recordId).slice(0, 50);
    const noiDung = content ? String(content).slice(0, 1000) : null;
    const diaChiIP = (ip || clientIp(req) || '').slice(0, 45) || null;
    request.input('LogMaTK', sql.Int, user?.MaTK || null);
    request.input('LogHanhDong', sql.NVarChar, hanhDong);
    request.input('LogBang', sql.NVarChar, table || null);
    request.input('LogMaBanGhi', sql.VarChar, record);
    request.input('LogNoiDung', sql.NVarChar, noiDung);
    const extraCols = [];
    const extraVals = [];
    if (columns.has('MaUC')) {
        extraCols.push('MaUC'); extraVals.push('@LogMaUC');
        request.input('LogMaUC', sql.NVarChar, uc || null);
    }
    if (columns.has('KetQua')) {
        extraCols.push('KetQua'); extraVals.push('@LogKetQua');
        request.input('LogKetQua', sql.NVarChar, result || 'Thành công');
    }
    if (columns.has('MucDo')) {
        extraCols.push('MucDo'); extraVals.push('@LogMucDo');
        request.input('LogMucDo', sql.NVarChar, severity || meta.mucDo);
    }
    if (columns.has('DuLieuJSON')) {
        extraCols.push('DuLieuJSON'); extraVals.push('@LogJson');
        request.input('LogJson', sql.NVarChar, jsonPayload);
    }
    if (columns.has('DiaChiIP')) {
        extraCols.push('DiaChiIP'); extraVals.push('@LogIP');
        request.input('LogIP', sql.VarChar, diaChiIP);
    }
    const colSql = ['MaTK', 'HanhDong', 'BangLienQuan', 'MaBanGhi', 'NoiDung', 'ThoiGian', ...extraCols].join(',');
    const valSql = ['@LogMaTK', '@LogHanhDong', '@LogBang', '@LogMaBanGhi', '@LogNoiDung', 'GETDATE()', ...extraVals].join(',');
    await request.query(`INSERT INTO NhatKy (${colSql}) VALUES (${valSql})`);
};

const logAuditSafe = async (...args) => {
    try {
        await logAudit(...args);
    } catch (error) {
        console.error('Không ghi được nhật ký:', error.message);
    }
};

const parsePaging = (query = {}) => {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(500, Math.max(10, Number(query.pageSize) || 50));
    return { page, pageSize, offset: (page - 1) * pageSize };
};

const defaultFromTo = () => {
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
    const iso = value => {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
    return { from: iso(from), to: iso(to) };
};

const ACTION_FILTERS = [
    { value: '', label: 'Tất cả việc làm' },
    { value: 'nghiep-vu', label: 'Việc cửa hàng (ẩn đăng nhập)' },
    { value: 'dang-nhap', label: 'Chỉ đăng nhập' },
    { value: 'duyet', label: 'Phê duyệt / từ chối' },
    { value: 'tien-ton', label: 'Tiền và tồn kho' },
    { value: 'cong-no', label: 'Công nợ / phiếu chi' },
    { value: 'luong', label: 'Ca, công, lương' },
    { value: 'he-thong', label: 'Tài khoản / phân quyền' }
];

const ROLE_FILTERS = [
    { value: '', label: 'Tất cả vai trò' },
    { value: 'Quản lý', label: 'Quản lý' },
    { value: 'Kế toán', label: 'Kế toán' },
    { value: 'Thu ngân', label: 'Thu ngân' },
    { value: 'Thủ kho', label: 'Thủ kho' },
    { value: 'Nhân viên mua hàng', label: 'Nhân viên mua hàng' }
];

const listAuditLogs = async (query = {}) => {
    const pool = await poolPromise;
    const columns = await loadExtraColumns(pool);
    const defaults = defaultFromTo();
    const from = String(query.from || defaults.from).slice(0, 10);
    const to = String(query.to || defaults.to).slice(0, 10);
    const search = String(query.search || '').trim();
    const role = String(query.role || '').trim();
    const actor = String(query.actor || '').trim();
    const action = String(query.action || '').trim();
    const kind = query.kind == null ? 'nghiep-vu' : String(query.kind).trim();
    const { page, pageSize, offset } = parsePaging(query);
    const extraSelect = [
        columns.has('MaUC') ? 'nk.MaUC' : 'CAST(NULL AS nvarchar(20)) AS MaUC',
        columns.has('KetQua') ? 'nk.KetQua' : 'CAST(NULL AS nvarchar(30)) AS KetQua',
        columns.has('MucDo') ? 'nk.MucDo' : 'CAST(NULL AS nvarchar(30)) AS MucDo',
        columns.has('DuLieuJSON') ? 'nk.DuLieuJSON' : 'CAST(NULL AS nvarchar(max)) AS DuLieuJSON',
        columns.has('DiaChiIP') ? 'nk.DiaChiIP' : 'CAST(NULL AS varchar(45)) AS DiaChiIP'
    ].join(', ');
    const request = pool.request()
        .input('TuNgay', sql.Date, from)
        .input('DenNgay', sql.Date, to)
        .input('TuKhoa', sql.NVarChar, search)
        .input('Mau', sql.NVarChar, `%${search}%`)
        .input('VaiTro', sql.NVarChar, role)
        .input('Nguoi', sql.NVarChar, actor)
        .input('HanhDong', sql.NVarChar, action)
        .input('Skip', sql.Int, offset)
        .input('Take', sql.Int, pageSize);
    const kindSql = kind === 'dang-nhap'
        ? `AND nk.HanhDong LIKE N'%Đăng nhập%'`
        : kind === 'nghiep-vu'
            ? `AND nk.HanhDong NOT LIKE N'%Đăng nhập%'`
            : kind === 'duyet'
                ? `AND (nk.HanhDong LIKE N'%duyệt%' OR nk.HanhDong LIKE N'%Từ chối%' OR nk.HanhDong LIKE N'%Phê duyệt%')`
                : kind === 'tien-ton'
                    ? `AND (nk.BangLienQuan IN (N'HoaDon',N'PhieuThu',N'CaLamViec',N'PhieuDoiTra',N'PhieuNhap',N'PhieuXuat',N'ThanhToan') OR nk.HanhDong LIKE N'%hóa đơn%' OR nk.HanhDong LIKE N'%nhập kho%' OR nk.HanhDong LIKE N'%xuất kho%')`
                    : kind === 'cong-no'
                        ? `AND (nk.BangLienQuan IN (N'PhieuChi',N'HoaDonMuaHang',N'CongNoNCC') OR nk.HanhDong LIKE N'%Phiếu chi%' OR nk.HanhDong LIKE N'%công nợ%')`
                        : kind === 'luong'
                            ? `AND (nk.BangLienQuan IN (N'KyLuong',N'BangLuong',N'ChamCong',N'LichLamViec',N'CaLamViec',N'PhieuChiLuong',N'QuyLuongKy',N'LichSuChiLuong') OR nk.HanhDong LIKE N'%lương%' OR nk.HanhDong LIKE N'%chấm công%' OR nk.HanhDong LIKE N'%ca %' OR nk.HanhDong LIKE N'%quỹ%')`
                            : kind === 'quy-luong'
                                ? `AND (nk.BangLienQuan IN (N'QuyLuongKy',N'LichSuChiLuong',N'PhieuChiLuong') OR nk.HanhDong LIKE N'%quỹ lương%' OR nk.HanhDong LIKE N'%Chi lương%' OR nk.HanhDong LIKE N'%Phiếu chi lương%')`
                            : kind === 'he-thong'
                                ? `AND nk.BangLienQuan IN (N'TaiKhoan',N'NhanVien',N'VaiTro_ChucNang')`
                                : '';
    const where = `
        WHERE CONVERT(date, nk.ThoiGian) BETWEEN @TuNgay AND @DenNgay
          AND (@VaiTro=N'' OR v.TenVaiTro=@VaiTro)
          AND (@Nguoi=N'' OR n.MaNV=@Nguoi OR CAST(t.MaTK AS varchar(20))=@Nguoi)
          AND (@HanhDong=N'' OR nk.HanhDong=@HanhDong)
          AND (@TuKhoa=N'' OR nk.HanhDong LIKE @Mau OR nk.NoiDung LIKE @Mau OR nk.MaBanGhi LIKE @Mau
               OR n.TenNV LIKE @Mau OR t.TenDangNhap LIKE @Mau OR nk.BangLienQuan LIKE @Mau)
          ${kindSql}`;
    const countResult = await request.query(`
        SELECT COUNT(*) AS Total
        FROM NhatKy nk
        LEFT JOIN TaiKhoan t ON t.MaTK=nk.MaTK
        LEFT JOIN NhanVien n ON n.MaNV=t.MaNV
        LEFT JOIN VaiTro v ON v.MaVaiTro=t.MaVaiTro
        ${where}`);
    const listRequest = pool.request()
        .input('TuNgay', sql.Date, from)
        .input('DenNgay', sql.Date, to)
        .input('TuKhoa', sql.NVarChar, search)
        .input('Mau', sql.NVarChar, `%${search}%`)
        .input('VaiTro', sql.NVarChar, role)
        .input('Nguoi', sql.NVarChar, actor)
        .input('HanhDong', sql.NVarChar, action)
        .input('Skip', sql.Int, offset)
        .input('Take', sql.Int, pageSize);
    const rows = await listRequest.query(`
        SELECT nk.MaNK, nk.HanhDong, nk.BangLienQuan, nk.MaBanGhi, nk.NoiDung, nk.ThoiGian,
               t.TenDangNhap, t.MaTK, n.TenNV, n.MaNV, v.TenVaiTro, ${extraSelect}
        FROM NhatKy nk
        LEFT JOIN TaiKhoan t ON t.MaTK=nk.MaTK
        LEFT JOIN NhanVien n ON n.MaNV=t.MaNV
        LEFT JOIN VaiTro v ON v.MaVaiTro=t.MaVaiTro
        ${where}
        ORDER BY nk.ThoiGian DESC, nk.MaNK DESC
        OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY`);
    const items = rows.recordset.map(presentAudit);
    return {
        items,
        total: Number(countResult.recordset[0]?.Total || 0),
        page,
        pageSize,
        from,
        to,
        kind
    };
};

const listAuditFilters = async () => {
    const pool = await poolPromise;
    const [actions, people] = await Promise.all([
        pool.request().query(`
            SELECT DISTINCT HanhDong FROM NhatKy
            WHERE HanhDong IS NOT NULL AND LTRIM(RTRIM(HanhDong))<>''
            ORDER BY HanhDong`),
        pool.request().query(`
            SELECT DISTINCT n.MaNV, n.TenNV, v.TenVaiTro
            FROM NhatKy nk
            JOIN TaiKhoan t ON t.MaTK=nk.MaTK
            JOIN NhanVien n ON n.MaNV=t.MaNV
            LEFT JOIN VaiTro v ON v.MaVaiTro=t.MaVaiTro
            ORDER BY n.TenNV`)
    ]);
    const knownActions = Object.keys(ACTION_META);
    const fromDb = actions.recordset.map(row => row.HanhDong);
    const merged = [...new Set([...knownActions, ...fromDb])].sort((a, b) => a.localeCompare(b, 'vi'));
    return {
        kinds: ACTION_FILTERS,
        roles: ROLE_FILTERS,
        actions: [{ value: '', label: 'Tất cả hành động' }, ...merged.map(value => ({ value, label: value }))],
        people: [{ value: '', label: 'Tất cả nhân viên' }, ...people.recordset.map(row => ({
            value: row.MaNV,
            label: `${row.TenNV} — ${row.TenVaiTro || ''}`.trim()
        }))]
    };
};

module.exports = {
    logAudit,
    logAuditSafe,
    presentAudit,
    listAuditLogs,
    listAuditFilters,
    defaultFromTo,
    TABLE_LABELS,
    ACTION_FILTERS,
    ROLE_FILTERS
};
