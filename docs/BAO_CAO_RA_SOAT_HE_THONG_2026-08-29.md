# Báo cáo rà soát Supermarket Fly — 29/08/2026

## 1. Phạm vi đối chiếu

Đã đọc và so sánh mã nguồn, CSDL hiện hành với bốn tài liệu:

1. `Bai_trinh_1_Nhom_2 (1).docx`
2. `TriThuc_Chuong6 (4).docx`
3. `Cac_chuc_nang_moi_chot_hom_nay_Supermarket_Fly.txt`
4. `UC_va_Danh_sach_chuc_nang_Supermarket_Fly.txt`

Kết luận ngắn: hệ thống đã có đầy đủ các nhóm chức năng UC01–UC29 và thêm UC30–UC33 về lịch làm việc, chấm công, duyệt công và lương. Chưa nên kết luận “nghiệm thu 100%” vì CSDL hiện chưa có phiếu đổi trả hoàn thành và Phiếu chi để chạy kiểm thử đầu-cuối bằng dữ liệu thật cho hai luồng này.

## 2. Kết quả theo 5 actor

| Actor | Phạm vi chính | Báo cáo | Đánh giá |
|---|---|---|---|
| Quản lý | Nhân viên, phân quyền, duyệt mua/chi/đổi trả, công nợ, báo cáo | Báo cáo vận hành và tài chính tháng 08/2026 gọi API thành công | Đạt về chức năng; cần test tay các nút duyệt với chứng từ mới |
| Nhân viên mua hàng | Nhà cung cấp, đề nghị mua, đơn mua, giao hàng | Báo cáo mua hàng tháng 08/2026 gọi API thành công | Đạt |
| Thủ kho | Nhập, xuất, kiểm kê, tồn, kiểm tra hàng trả | Báo cáo nhập–xuất–tồn tháng 08/2026 gọi API thành công | Đạt; cần thêm dữ liệu đổi trả để chứng minh nhập lại kho |
| Thu ngân | Chấm công, mở/đóng ca, POS, khách hàng, hóa đơn, đổi trả | Báo cáo bán hàng cá nhân tháng 08/2026 gọi API thành công | Đạt; đã chặn đổi trực tiếp khác giá |
| Kế toán | Hóa đơn mua, đối chiếu ba chứng từ, công nợ, Phiếu chi, Phiếu thu ca, báo cáo | Báo cáo tài chính tháng 08/2026 gọi API thành công | Đạt về xử lý; chưa có Phiếu chi thật để test đầu-cuối |

## 3. Nhân sự và CSDL

- CSDL đang có đúng **12 nhân viên hoạt động**:
  - 1 Quản lý
  - 1 Nhân viên mua hàng
  - 1 Thủ kho
  - 8 Thu ngân
  - 1 Kế toán
- Tài liệu Chương 6 mô tả 35 bảng lõi; CSDL có 45 bảng. Mười bảng tăng thêm phục vụ lịch làm việc, chấm công, lương, quầy và thông báo giao hàng.
- Đây là phần mở rộng hợp lý của dự án, nhưng hai file TXT vẫn ghi “chưa thực hiện tính lương hoặc chấm công”, nên nội dung tài liệu đang chậm hơn mã nguồn.

## 4. Ba nghiệp vụ tài chính đã kiểm tra

### 4.1 Lãi gộp trên màn hình ca và báo cáo

Công thức đang dùng:

```text
Doanh thu thuần = Doanh thu hóa đơn hoàn thành − Tiền hoàn hoàn thành
Giá vốn thuần   = Giá vốn hóa đơn − Giá vốn hàng trả được nhập lại + Giá vốn hàng giao đổi
Lãi gộp         = Doanh thu thuần − Giá vốn thuần
```

Công thức này khớp Chương 6. Kiểm thử tự động bao phủ: không đổi trả, hoàn tiền có/không nhập lại kho và giao hàng đổi.

### 4.2 UC27 — đối chiếu ba chứng từ

Backend kiểm tra:

- Sản phẩm và tập dòng chứng từ
- Số lượng đặt, nhận và ghi trên hóa đơn
- Đơn giá Đơn mua, Phiếu nhập và Hóa đơn
- Thành tiền từng dòng
- Thuế suất, tiền thuế tính lại và tiền thuế lưu
- Tổng tiền hàng, tổng thuế và tổng cộng ở phần đầu chứng từ

Chỉ khi toàn bộ điều kiện khớp mới tạo công nợ. Lưu hóa đơn mua mới chỉ tạo trạng thái chờ đối chiếu.

Lưu ý thiết kế: Đơn mua và Phiếu nhập hiện không có cột thuế. Vì vậy hệ thống xác thực thuế trên Hóa đơn mua và đối chiếu tổng tiền hàng với Phiếu nhập; chưa thể so sánh một “thuế suất của cả ba chứng từ” theo nghĩa đen nếu không mở rộng schema.

### 4.3 UC29 — Phiếu thu ca

Số tiền hệ thống được tính từ tiền đầu ca, thanh toán tiền mặt thành công và hoàn tiền mặt. Chênh lệch được ghi nhận trên phiếu; các khoản QR, Thẻ và Chuyển khoản không bị cộng vào két tiền mặt.

## 5. Luồng đổi trả đã chốt

Luồng hiện tại:

```text
Thu ngân lập phiếu → Thủ kho kiểm tra → Quản lý duyệt → Thu ngân hoàn tất
```

Luồng này khớp báo cáo chính và hai file TXT mới nhất. Một đoạn trong Chương 6 ghi Quản lý duyệt trước Thủ kho kiểm tra là mâu thuẫn tài liệu; mã nguồn đang theo bản chốt mới hơn.

Quy tắc vừa siết lại:

- Đổi trực tiếp chỉ cho phép tổng giá trị hàng giao đổi bằng tổng giá trị hàng khách trả.
- Khác giá phải hoàn hàng cũ rồi lập hóa đơn bán mới.
- Giao diện khóa nút hoàn tất khi lệch giá.
- Backend kiểm tra lại trước khi ghi chi tiết đổi và trước khi cập nhật tồn kho.
- Sản phẩm lặp trong danh sách giao đổi bị từ chối.

## 6. Giao diện

Đã áp dụng lớp giao diện chung cho cả 5 actor:

- Thu gọn sidebar, topbar, tiêu đề và khoảng trắng dọc.
- Chuẩn hóa bán kính, bóng đổ, trạng thái hover/focus và nút bấm.
- Giữ bộ lọc kỳ báo cáo trên một hàng ở màn hình laptop; chỉ xếp dọc khi màn hình hẹp.
- Thu gọn KPI để phần biểu đồ/bảng xuất hiện sớm hơn trong màn hình đầu.
- Tiêu đề bảng cố định khi cuộn, hàng có phản hồi hover.
- Modal đồng bộ và phù hợp màn hình thấp.
- Sơ đồ đối chiếu kế toán có thể cuộn ngang thay vì ép chữ.
- Có xử lý responsive và `prefers-reduced-motion`.
- Bổ sung dashboard SVG tương tác cho đủ 5 actor: đường xu hướng, cột so sánh, cơ cấu donut và xếp hạng ngang.
- Biểu đồ dùng dữ liệu API thật, có tooltip, chú giải, trạng thái rỗng và không phụ thuộc thư viện/CDN bên ngoài.
- Bảng chi tiết vẫn được giữ dưới biểu đồ để đối soát chứng từ.
- Bản in/PDF báo cáo đã tách khỏi mẫu chứng từ cũ: có dải nhận diện thương hiệu, 4 KPI, biểu đồ SVG, bảng zebra, ghi chú và khu vực chữ ký.
- Đủ mẫu in riêng cho 5 actor; báo cáo Thu ngân dùng A4 ngang, bốn báo cáo còn lại dùng A4 dọc.
- Quản lý, Kế toán, Mua hàng, Thủ kho và Thu ngân đều có thể xuất CSV từ cùng bộ dữ liệu đang hiển thị.
- Đã đóng gói 36 ảnh sản phẩm theo đúng `MaSP` vào ứng dụng Electron; dùng chung ở Tổng quan Quản lý, Sản phẩm & giá, tồn kho và POS/giỏ hàng.
- Sản phẩm mới chưa có ảnh tự hiện placeholder theo tên/mã, không làm vỡ thẻ hoặc xuất hiện biểu tượng ảnh lỗi.
- Trang Tổng quan Quản lý được nâng cấp theo bố cục product-led dashboard: ưu tiên điều hành, thẻ chờ duyệt, KPI vận hành, sản phẩm cần theo dõi và hai bảng nhân sự/nhật ký.
- Năm báo cáo vai trò dùng chung một cấu trúc điều hành mới: dải điều hướng nhanh cố định, khối tổng quan lãnh đạo, chương `Phân tích trực quan` và chương `Dữ liệu đối soát`.
- Mỗi vai trò vẫn có màu nhấn và nội dung riêng: Quản lý, Kế toán, Mua hàng, Thủ kho và Thu ngân; không dùng một mẫu báo cáo chung thiếu ngữ cảnh nghiệp vụ.
- Bố cục mới tự chuyển từ hai cột sang một cột ở màn hình laptop/hẹp, đồng thời giữ bảng chi tiết bên dưới biểu đồ để kiểm tra chứng từ.

Không thể chụp ảnh kiểm tra trực tiếp từ phiên làm việc này vì môi trường không cung cấp browser runtime. Phần đánh giá hình ảnh dựa trên ảnh người dùng gửi và kiểm tra toàn bộ HTML/CSS/JS nguồn.

## 7. Kiểm thử đã chạy

`npm run test:next`: **PASS**

- Kiểm tra cú pháp backend và frontend: đạt
- 16 kiểm thử quy tắc nghiệp vụ: đạt
- Kiểm thử renderer báo cáo A4 (thương hiệu, KPI, SVG, bảng và định dạng tiền): đạt
- Kiểm thử 36 ảnh sản phẩm, ánh xạ JPG/PNG và placeholder: đạt
- Lập lịch 8 giờ + ca tăng cường 4 giờ, đủ 35 lượt/tuần: đạt
- Lịch hành chính 07:30–17:30, nghỉ 11:30–13:30, thứ 2–thứ 7: đạt

API báo cáo tháng 08/2026 của cả 5 actor: **PASS**.

Đã dựng localhost tạm để smoke-test tài nguyên và API, sau đó dừng cổng `3000`/`4173` và xóa toàn bộ thư mục máy chủ xem thử theo yêu cầu.

Dữ liệu hiện có tại thời điểm rà soát:

- 4 hóa đơn bán hoàn thành
- 3 ca làm việc
- 0 phiếu đổi trả hoàn thành
- 0 Phiếu chi

## 8. Việc còn lại trước nghiệm thu cuối

1. Test tay đổi trả bằng dữ liệu thật: nhập lại kho, không nhập lại kho, đổi ngang giá, đổi khác giá bị chặn.
2. Tạo một bộ Đơn mua → Phiếu nhập → Hóa đơn mua để test UC27 cả trường hợp khớp và lệch thuế/tổng.
3. Tạo công nợ và Phiếu chi để test đầy đủ duyệt, thanh toán và trạng thái tất toán.
4. Test Phiếu thu cho một ca đã đóng có hoàn tiền mặt.
5. Mở ứng dụng tại 1366×768, 1920×1080 và zoom Windows 100%/125% để duyệt hình ảnh cuối.
6. Cập nhật báo cáo Word: UC30–UC33, 45 bảng thực tế, thứ tự luồng đổi trả và đánh số mục Chương 7.

Kịch bản thao tác chi tiết nằm trong `HUONG_DAN_KIEM_THU_UC10_UC27_UC29.md`.
