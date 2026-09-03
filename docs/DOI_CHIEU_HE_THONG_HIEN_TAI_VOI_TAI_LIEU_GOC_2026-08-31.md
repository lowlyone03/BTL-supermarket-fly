# Đối chiếu hệ thống hiện tại với tài liệu gốc — 31/08/2026

## 1. Kết luận ngắn

Hệ thống hiện tại **không đổi mô hình actor**: vẫn là 5 actor nội bộ gồm Quản lý, Nhân viên mua hàng, Thủ kho, Thu ngân và Kế toán. Khách hàng và Nhà cung cấp vẫn chỉ là đối tượng nghiệp vụ, không đăng nhập hệ thống.

Điểm khác lớn nhất so với bản Word/TXT ban đầu là:

- Phạm vi chức năng tăng từ **UC01–UC29 lên UC01–UC33**.
- CSDL tăng từ **35 bảng lên 45 bảng**.
- Có thêm lịch làm việc, chấm công, duyệt công, lương tạm tính và bảng lương.
- Có thêm ảnh sản phẩm bắt buộc khi tạo mới, tìm kiếm tiếng Việt không phân biệt dấu, báo cáo trực quan riêng cho 5 actor, xuất CSV/PDF và luồng thông báo chuyến giao hàng rõ hơn.

Đây chủ yếu là **mở rộng trên 5 actor cũ**, không phải thay đổi bản chất mô hình siêu thị hoặc thêm actor mới.

## 2. Nguồn đã đối chiếu

1. `Bai_trinh_1_Nhom_2 (1).docx`: trang 6–19 mô tả phạm vi, 5 actor và nghiệp vụ; trang 23 mô tả 35 bảng.
2. `TriThuc_Chuong6 (4).docx`: mô tả 35 bảng và công thức lãi gộp tại trang 33–34.
3. `UC_va_Danh_sach_chuc_nang_Supermarket_Fly.txt`: chốt UC01–UC29, 5 actor và 12 nhân viên.
4. `Cac_chuc_nang_moi_chot_hom_nay_Supermarket_Fly.txt`: chốt các quy tắc mới lúc đầu nhưng còn ghi hệ thống chưa tính lương/chấm công.
5. Mã nguồn, migration, phân quyền và hướng dẫn kiểm thử hiện hành của dự án.

## 3. Những phần KHÔNG thay đổi so với tài liệu gốc

| Nội dung | Trạng thái hiện tại |
|---|---|
| Số actor | Vẫn đúng 5 actor nội bộ |
| Cơ cấu nhân sự chốt | Vẫn 12 người: 1 Quản lý, 1 Mua hàng, 1 Thủ kho, 8 Thu ngân, 1 Kế toán |
| Phạm vi cửa hàng | Một cửa hàng, một kho logic; không có điều chuyển liên kho |
| Kênh bán | Bán trực tiếp tại quầy; không phải thương mại điện tử |
| Khách hàng/NCC | Không phải actor đăng nhập |
| Công nợ khách hàng | Không bán chịu, không phát sinh phải thu khách hàng |
| Thanh toán NCC | Trả đủ một lần khi đến hạn; không trả trước hoặc trả từng phần |
| Lợi nhuận | Vẫn là **lợi nhuận gộp**, không phải lợi nhuận ròng |
| UC01–UC29 | Vẫn được giữ; bốn UC mới không thay thế các UC lõi |

Các nội dung trên là giới hạn phạm vi. Khi test, không ghi lỗi vì hệ thống không có thương mại điện tử, chuyển kho, công nợ khách hàng, trả NCC từng phần hoặc lợi nhuận ròng.

## 4. Những điểm khác thật sự so với tài liệu ban đầu

### 4.1. Từ 29 UC lên 33 UC — khác nghiệp vụ lớn nhất

| UC mới | Actor có quyền | Nội dung mới | Phải test |
|---|---|---|---|
| UC30 | Quản lý | Phân ca thủ công/tự động, công bố lịch, gán quầy, kiểm soát định biên | `WF-01` đến `WF-12` |
| UC31 | Mua hàng, Thủ kho, Thu ngân, Kế toán | Xem lịch cá nhân, check-in, check-out | `WF-13` đến `WF-21` |
| UC32 | Quản lý | Duyệt chấm công và xem lương tạm tính | `WF-22` đến `WF-29` |
| UC33 | Kế toán | Lập, khóa và thanh toán bảng lương | `PAY-01` đến `PAY-12` |

Lưu ý: Quản lý không dùng UC31 trong ma trận quyền hiện tại; Quản lý theo dõi lịch/công qua UC30 và UC32.

### 4.2. CSDL từ 35 lên 45 bảng

Mười bảng mở rộng hiện tại:

| Nhóm | Bảng mới | Actor chịu tác động chính |
|---|---|---|
| Lịch/quầy | `LoaiCa`, `QuayBanHang`, `LichLamViec` | Quản lý, Thu ngân và bốn nhân viên dùng lịch cá nhân |
| Chấm công | `ChamCong`, `DieuChinhChamCong` | Quản lý và bốn nhân viên nghiệp vụ |
| Mức lương | `MucLuongNhanVien` | Quản lý/Kế toán |
| Bảng lương | `KyLuong`, `BangLuong`, `ChiTietBangLuong` | Kế toán, dữ liệu nguồn từ chấm công đã duyệt |
| Giao hàng | `ThongBaoGiaoHang` | Mua hàng tạo chuyến; Thủ kho tiếp nhận/kiểm nhận |

Ngoài 10 bảng mới, bảng `SanPham` còn được bổ sung cột `DuongDanAnh`.

### 4.3. Mở ca POS bị ràng buộc với lịch và chấm công

Trong Word ban đầu, UC22 chủ yếu yêu cầu Thu ngân mở ca cá nhân và ghi tiền đầu ca. Hệ thống hiện tại chặt hơn:

1. Quản lý phải tạo và công bố lịch.
2. Thu ngân phải có lịch phù hợp.
3. Thu ngân phải check-in.
4. Chỉ ca chính phù hợp mới được mở POS; ca tăng cường không tự mở một quầy POS độc lập.
5. Không được check-out khi vẫn còn ca POS đang mở.

Actor liên quan: **Quản lý + Thu ngân**. Đây là điểm tích hợp dễ phát sinh lỗi nhất, phải chạy `WF-01`–`WF-21`, `POS-01`–`POS-10` và `E2E-02` trên cùng một CSDL.

### 4.4. Có bảng lương nhưng lãi gộp vẫn không trừ lương

Tài liệu ban đầu nói hệ thống chưa quản lý đầy đủ tiền lương nên chỉ báo cáo lãi gộp. Hiện tại đã có UC33 và các bảng lương, nhưng báo cáo tài chính vẫn phải giữ:

```text
Doanh thu thuần = Doanh thu hóa đơn hoàn thành − Tiền hoàn hoàn thành
Giá vốn thuần   = Giá vốn hóa đơn − Giá vốn hàng trả nhập lại + Giá vốn hàng giao đổi
Lãi gộp         = Doanh thu thuần − Giá vốn thuần
```

Không được tự trừ bảng lương, điện nước, thuê mặt bằng hoặc khấu hao vào chỉ tiêu lãi gộp. Actor cần test: **Kế toán + Quản lý + Thu ngân** qua `RET-24`, `PAY-01`–`PAY-12`, `RPT-02` và `RPT-31`.

### 4.5. Ảnh sản phẩm là dữ liệu bắt buộc khi tạo sản phẩm mới

Word ban đầu mô tả mã, tên, mã vạch, đơn vị tính, giá, tồn tối thiểu và trạng thái; không nêu ảnh sản phẩm. Hệ thống hiện tại bổ sung:

- Bắt buộc chọn ảnh khi thêm sản phẩm.
- Chấp nhận JPG/PNG/WebP, tối đa 5 MB và kiểm tra nội dung tệp.
- Sửa sản phẩm mà không chọn ảnh mới phải giữ ảnh cũ.
- Ảnh được dùng tại Quản lý sản phẩm, Tổng quan, Tồn kho và POS.

Actor chính: **Quản lý**; actor kiểm tra chéo: **Thủ kho + Thu ngân**. Chạy `MGR-22`–`MGR-26`, `WH-03` và `POS-17`.

### 4.6. Theo dõi chuyến giao được tách thành bản ghi riêng

Word đã có UC14 theo dõi giao hàng và UC17 tiếp nhận hàng, nhưng hệ thống hiện tại cụ thể hóa bằng `ThongBaoGiaoHang`: Mua hàng khai báo chuyến, Thủ kho đánh dấu xe đến, kiểm nhận rồi lập phiếu nhập.

Actor: **Mua hàng + Thủ kho**. Chạy `P2P-18`–`P2P-23`, `WH-06`–`WH-19` và `E2E-01`.

### 4.7. Báo cáo trực quan riêng cho cả 5 actor

Word đã có báo cáo Quản lý, Kế toán và báo cáo ca Thu ngân. Hiện tại mở rộng thành màn hình báo cáo trực quan riêng cho đủ 5 actor:

| Actor | Báo cáo hiện tại | Tính chất so với Word |
|---|---|---|
| Quản lý | Hoạt động cửa hàng, doanh thu–giá vốn–lãi gộp, thu–chi, công nợ, nhân sự | Nâng cấp UC10 |
| Mua hàng | Giá trị mua, NCC, danh mục, tỷ lệ giao đúng hạn, đơn cần xử lý | Màn hình báo cáo mới hỗ trợ UC11–UC14 |
| Thủ kho | Nhập–xuất–tồn, giá trị tồn, cơ cấu danh mục, cảnh báo | Mở rộng giao diện UC15 |
| Thu ngân | Doanh thu cá nhân, ca, phương thức thanh toán, sản phẩm bán | Nâng cấp UC22 |
| Kế toán | Doanh thu đối soát, thu–chi, tuổi nợ, giá vốn/lãi gộp | Nâng cấp UC29 |

Tất cả có KPI, biểu đồ, bảng chi tiết, chú giải số liệu, lọc kỳ, CSV và bản in/PDF. Đây chủ yếu là thay đổi giao diện và khả năng đọc dữ liệu; không được làm thay đổi công thức nghiệp vụ.

Chạy `RPT-01`–`RPT-42` và `E2E-10`.

### 4.8. Tìm kiếm được nâng cấp trên toàn hệ thống

Tài liệu gốc đã yêu cầu tìm kiếm ở một số danh sách. Hệ thống hiện tại bổ sung tìm chung, tìm không phân biệt dấu tiếng Việt, debounce, xóa nhanh bằng Escape và phím Ctrl+K ở dashboard.

Actor: **cả 5 actor**. Chạy `GEN-08`, `MGR-30`, `PUR-01`/`PUR-06`, `WH-03`, `POS-16`, `POS-40` và các bộ lọc của Kế toán.

## 5. Những phần từng sai nhưng hiện đã sửa để KHỚP tài liệu

Các mục dưới đây không còn là khác biệt; vẫn phải regression test vì liên quan tiền/tồn:

1. **UC27:** đối chiếu đủ sản phẩm, số lượng, đơn giá, thuế suất, tiền thuế, tiền hàng và tổng cộng — chạy `ACC-01`–`ACC-12`.
2. **Lãi gộp:** đã tính tiền hoàn, giá vốn hàng trả nhập lại và giá vốn hàng giao đổi — chạy `RET-13`–`RET-24`, `RPT-02`, `RPT-31`.
3. **Đổi khác giá:** phải trả hàng cũ rồi lập hóa đơn mới; đổi trực tiếp chỉ dùng khi ngang giá — chạy `RET-19`–`RET-23`.
4. **Phiếu thu ca:** chỉ tiền mặt đi vào két; QR/thẻ/chuyển khoản chỉ đối soát điện tử — chạy `ACC-25`–`ACC-32`.
5. **Công nợ NCC:** chỉ giảm khi Phiếu chi được duyệt và thanh toán thành công đủ một lần — chạy `ACC-13`–`ACC-24`.

## 6. Ma trận khác biệt theo 5 actor

| Actor | UC gốc | Quyền hiện tại | Phần cần test thêm so với Word | Test case trọng tâm |
|---|---|---|---|---|
| Quản lý | UC01–UC10 | UC01–UC10, UC30, UC32 | Phân ca, công bố lịch, duyệt công/lương tạm tính, ảnh sản phẩm, báo cáo mới | `MGR-22`–`MGR-30`, `WF-01`–`WF-12`, `WF-22`–`WF-29`, `RPT-01`–`RPT-08` |
| Mua hàng | UC01, UC11–UC14 | Thêm UC31 | Lịch/chấm công cá nhân, chuyến giao, báo cáo mua hàng | `WF-13`–`WF-21`, `P2P-18`–`P2P-23`, `RPT-21`–`RPT-26` |
| Thủ kho | UC01, UC15–UC21 | Thêm UC31 | Lịch/chấm công, nhận chuyến giao, ảnh hàng, báo cáo kho | `WF-13`–`WF-21`, `WH-06`–`WH-19`, `RPT-09`–`RPT-14` |
| Thu ngân | UC01, UC22–UC26 | Thêm UC31 | Lịch/check-in ràng buộc mở POS, ảnh tại POS, báo cáo cá nhân | `WF-13`–`WF-21`, `POS-01`–`POS-42`, `RET-01`–`RET-24`, `RPT-15`–`RPT-20` |
| Kế toán | UC01, UC27–UC29 | Thêm UC31, UC33 | Lịch/chấm công, bảng lương, báo cáo tài chính trực quan | `WF-13`–`WF-21`, `ACC-01`–`ACC-32`, `PAY-01`–`PAY-12`, `RPT-27`–`RPT-32` |

## 7. Chia 6 người test phần khác biệt

Đây là vòng test sâu sau khi cả 6 người đã mở được app và hoàn thành vòng test đơn giản.

| Người | Phần phụ trách | Tài khoản | Bắt buộc chạy |
|---|---|---|---|
| Người 1 | Quản lý, ảnh sản phẩm, phân ca/duyệt công | `admin` | `MGR-22`–`MGR-30`, `WF-01`–`WF-12`, `WF-22`–`WF-29` |
| Người 2 | Mua hàng, chuyến giao, báo cáo mua | `muahang` | `P2P-18`–`P2P-23`, `RPT-21`–`RPT-26`, một lượt `WF-13`–`WF-20` |
| Người 3 | Kho, tiếp nhận chuyến, ảnh/tồn, báo cáo kho | `thukho` | `WH-06`–`WH-19`, `RPT-09`–`RPT-14`, một lượt `WF-13`–`WF-20` |
| Người 4 | Thu ngân từ lịch đến bán/đổi trả | `thungan` | `WF-13`–`WF-21`, `POS-01`–`POS-42`, `RET-01`–`RET-24` |
| Người 5 | Kế toán, UC27, quyết toán ca, lương | `ketoan` | `ACC-01`–`ACC-32`, `PAY-01`–`PAY-12`, `RPT-27`–`RPT-32` |
| Người 6 | Phân quyền, tìm kiếm, 5 báo cáo và đối chiếu chéo | cả 5 tài khoản | `GEN-08`, `SEC-01`–`SEC-05`, `RPT-01`–`RPT-42`, `E2E-10`, `CON-01`–`CON-10` |

Người 1–5 có thể test độc lập trên bản CSDL riêng. Riêng các chuỗi `E2E-01`–`E2E-10` phải chạy lần lượt trên **cùng một CSDL**, không ghép kết quả từ sáu máy khác nhau.

## 8. Thứ tự kiểm thử để không bỏ sót

### Mức P0 — lỗi là chưa thể nghiệm thu

1. Quyền của 5 actor: không thấy/không gọi được chức năng ngoài quyền.
2. UC30–UC33: lịch → chấm công → duyệt công → bảng lương.
3. Lịch/check-in → mở POS → bán → đóng ca → Phiếu thu.
4. Mua → giao → nhập → UC27 thuế/tổng → công nợ → Phiếu chi.
5. Đổi trả → tồn → két tiền → doanh thu thuần → giá vốn thuần → lãi gộp.
6. Double click/hai cửa sổ không ghi trùng tiền, tồn, công nợ hoặc bảng lương.

### Mức P1 — phải hoàn thành trước buổi báo cáo

1. Ảnh sản phẩm và tìm kiếm không dấu.
2. Báo cáo đủ 5 actor, cùng kỳ phải khớp ở các giao điểm.
3. CSV/PDF/bản in khớp màn hình.
4. Thông báo/chuyến giao không tạo trùng hoặc nhận hai lần.

### Mức P2 — hoàn thiện trải nghiệm

1. Giao diện 1366×768, 1920×1080, zoom 80%/100%/125%.
2. Icon, chữ, chú giải, tooltip, bảng và trạng thái rỗng.
3. Điều hướng bàn phím, focus và thông báo lỗi dễ hiểu.

## 9. Tiêu chí kết luận hệ thống đã được test triệt để

Chỉ kết luận đạt khi:

- 29 UC gốc và 4 UC mở rộng đều có kết quả PASS hoặc lỗi đã sửa và retest PASS.
- `E2E-01`–`E2E-10` đều chạy trên cùng một CSDL và PASS.
- Không có lỗi Critical/High về quyền, tiền, tồn, điểm, công nợ, ca, công hoặc lương.
- UC27 lệch từng yếu tố thuế/tổng đều bị chặn và không sinh công nợ.
- Lãi gộp sau ba nhánh đổi trả khớp công thức tài liệu.
- Báo cáo 5 actor cùng kỳ khớp bảng chi tiết, CSV và PDF.
- CSDL sau test vẫn có đúng cơ cấu 12 nhân viên; dữ liệu lỗi không được ghi dở dang.

Kịch bản thao tác chi tiết dùng file `HUONG_DAN_KIEM_THU_TOAN_BO_HE_THONG_SUPERMARKET_FLY.txt`.
