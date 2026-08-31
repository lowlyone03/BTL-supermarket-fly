# Hướng dẫn test đơn giản cho 6 thành viên

Tài liệu này dành cho thành viên **không biết Git**. Các bạn chỉ cần tải ZIP, cài ứng dụng, đăng nhập và test phần được giao.

## 1. Người phát triển gửi gì vào nhóm?

Chỉ gửi ba thứ:

1. Link tải dự án ZIP:
   `https://github.com/lowlyone03/BTL-supermarket-fly/archive/refs/tags/test-team-v1-2026-08-31.zip`
2. File database `SupermarketFlyDB_2026-08-30_225448.bak` qua Google Drive/OneDrive.
3. File `SupermarketFly_Uploads_2026-08-30_225448.zip` qua Google Drive/OneDrive.

Không yêu cầu thành viên dùng `git clone`, tạo commit, push code hoặc dùng GitHub Issues.

## 2. Tin nhắn gửi cho 6 thành viên

```text
Mọi người tải ba mục mình gửi: ZIP dự án, file database .bak và ZIP ảnh.

Mỗi người làm theo file HUONG_DAN_TEST_DON_GIAN_CHO_6_NGUOI.md trong dự án.
Mật khẩu tài khoản test đều là 123.

Mỗi người chỉ test phần được phân công. Khi gặp lỗi, gửi vào nhóm:
Tên người test + tài khoản + màn hình + đã bấm gì + mong đợi gì + thực tế gì + ảnh/video.

Không sửa code và không xóa dữ liệu có sẵn.
```

## 3. Thành viên chuẩn bị máy một lần

Máy cần có:

- Node.js 22 trở lên.
- SQL Server Express, instance `SQLEXPRESS`.
- SQL Server Management Studio (SSMS).
- ODBC Driver 17 for SQL Server.

Nếu thiếu một trong các phần trên, báo người phát triển hỗ trợ cài trước buổi test.

## 4. Tải và giải nén

1. Mở link ZIP dự án người phát triển gửi.
2. Giải nén vào đường dẫn ngắn, không dấu, ví dụ `D:\SupermarketFlyTest`.
3. Mở thư mục vừa giải nén. Thư mục đúng phải nhìn thấy `package.json`, `server` và `desktop`.

## 5. Khôi phục database

1. Mở SSMS.
2. Kết nối `localhost\SQLEXPRESS` bằng **Windows Authentication**.
3. Bấm chuột phải `Databases` → `Restore Database...`.
4. Chọn `Device` → chọn file `SupermarketFlyDB_2026-08-30_225448.bak`.
5. Đặt tên database là `SupermarketFlyDB` rồi bấm Restore.
6. Nếu máy đã có database cùng tên, hỏi người phát triển trước khi ghi đè.

## 6. Chép ảnh sản phẩm

Giải nén `SupermarketFly_Uploads_2026-08-30_225448.zip`, sau đó chép thư mục `uploads` vào trong thư mục `server` của dự án.

Đường dẫn đúng:

```text
D:\SupermarketFlyTest\...\server\uploads\products
```

ZIP ảnh hiện có thể gần như trống; đây không phải lỗi vì ảnh sản phẩm mẫu đã nằm sẵn trong dự án.

## 7. Cài và chạy bằng cách nhấp đúp

Lần đầu tiên:

1. Nhấp đúp `1_CAI_DAT_LAN_DAU.bat`.
2. Chờ đến khi thấy dòng `CAI DAT THANH CONG`.
3. Nếu có lỗi, chụp toàn bộ cửa sổ màu đen và gửi người phát triển.

Mỗi lần mở ứng dụng:

1. Nhấp đúp `2_CHAY_SUPERMARKET_FLY.bat`.
2. Không đóng cửa sổ màu đen trong lúc test.
3. Chờ cửa sổ đăng nhập Supermarket Fly xuất hiện.

Muốn chạy kiểm tra tự động:

1. Đóng ứng dụng đang mở.
2. Nhấp đúp `3_KIEM_TRA_TU_DONG.bat`.
3. Chụp dòng cuối nếu có chữ `PASS` hoặc lỗi màu đỏ.

## 8. Chia 6 người — mỗi người một phần dễ hiểu

### Người 1 — Quản lý sản phẩm

- Tài khoản: `admin`; mật khẩu: `123`.
- Mở `Sản phẩm & giá`.
- Tìm một sản phẩm bằng mã, tên có dấu và tên không dấu.
- Thêm một sản phẩm mới và bắt buộc chọn ảnh JPG/PNG/WebP.
- Mở lại sản phẩm, đổi ảnh rồi lưu.
- Kỳ vọng: ảnh và thông tin xuất hiện đúng; sản phẩm tìm thấy ở danh sách.

Tên sản phẩm test: `TEST-N1-SAN-PHAM`.

### Người 2 — Nhà cung cấp và mua hàng

- Tài khoản: `muahang`; mật khẩu: `123`.
- Mở `Nhà cung cấp` và tìm NCC bằng mã/tên.
- Thêm một NCC mới với mã, tên, số điện thoại và email hợp lệ.
- Thử thêm lần nữa cùng mã để kiểm tra hệ thống chặn trùng.
- Mở danh sách đơn mua và kiểm tra tìm kiếm/trạng thái.
- Kỳ vọng: NCC hợp lệ được tạo; NCC trùng bị chặn và có thông báo dễ hiểu.

Tên NCC test: `TEST-N2-NCC`.

### Người 3 — Tồn kho

- Tài khoản: `thukho`; mật khẩu: `123`.
- Mở `Tồn kho & cảnh báo`.
- Tìm sản phẩm bằng mã, tên có dấu, tên không dấu và mã vạch.
- Kiểm tra số tồn, tồn tối thiểu, cảnh báo và ảnh sản phẩm.
- Mở báo cáo kho, đổi kỳ báo cáo và xem biểu đồ/bảng.
- Kỳ vọng: tìm kiếm đúng; tồn không âm; báo cáo không vỡ giao diện.

Người này chỉ xem và tìm kiếm trong vòng test đơn giản, chưa tự sửa tồn trực tiếp.

### Người 4 — Thu ngân và hóa đơn

- Tài khoản: `thungan`; mật khẩu: `123`.
- Mở lịch làm việc và ca bán hàng.
- Mở danh sách khách hàng, tìm theo tên/số điện thoại.
- Mở danh sách hóa đơn và tìm một hóa đơn đã có.
- Mở báo cáo bán hàng, đổi kỳ và kiểm tra biểu đồ/phương thức thanh toán.
- Nếu hệ thống có lịch công bố và cho mở ca: thử mở ca rồi thêm sản phẩm vào hóa đơn nháp.
- Kỳ vọng: thu ngân chỉ thấy dữ liệu của mình; tìm kiếm và báo cáo hoạt động.

Nếu không mở được ca vì chưa có lịch/check-in, ghi `BLOCKED: thiếu lịch hoặc chấm công`, không tự sửa database.

### Người 5 — Kế toán

- Tài khoản: `ketoan`; mật khẩu: `123`.
- Mở đối chiếu hóa đơn mua.
- Xem một bộ đơn mua – phiếu nhập – hóa đơn có sẵn.
- Kiểm tra có sản phẩm, số lượng, đơn giá, thuế suất, tiền thuế và tổng cộng.
- Mở công nợ, phiếu thu/chi và báo cáo kế toán.
- Đổi kỳ báo cáo, xem biểu đồ và bản in/PDF.
- Kỳ vọng: số liệu có chú thích dễ hiểu; không được xác nhận/chi hai lần.

Trong vòng test đơn giản, không bấm xác nhận thanh toán thật nếu chưa ghi lại mã chứng từ.

### Người 6 — Tìm kiếm, báo cáo và giao diện

- Lần lượt đăng nhập: `admin`, `muahang`, `thukho`, `thungan`, `ketoan`; mật khẩu `123`.
- Kiểm tra menu mỗi vai trò có đúng chức năng không.
- Thử ô tìm kiếm trên thanh trên cùng và trong các danh sách.
- Mở báo cáo của cả 5 vai trò, đổi tháng/quý/năm.
- Kiểm tra KPI, biểu đồ, bảng, CSV và xem bản in/PDF.
- Thu nhỏ cửa sổ và thử mức zoom 80%, 100%, 125%.
- Kỳ vọng: không lộ menu sai quyền; không vỡ card/bảng/biểu đồ; số liệu có giải thích.

## 9. Cách báo lỗi thật đơn giản

Chỉ cần gửi đúng mẫu này vào nhóm chat:

```text
Người test: Nguyễn Văn A
Tài khoản: thukho
Màn hình: Tồn kho & cảnh báo
Tôi đã làm: tìm "sua tuoi" không dấu
Mong đợi: thấy sản phẩm Sữa tươi
Thực tế: danh sách trống
Ảnh/video: <đính kèm>
```

Nếu lỗi liên quan tiền, tồn kho hoặc hóa đơn, thêm mã sản phẩm/hóa đơn/chứng từ vào tin nhắn.

## 10. Cách người phát triển điều phối

1. Gửi link/file và chờ cả sáu người trả lời `ĐÃ MỞ ĐƯỢC APP`.
2. Gửi phân công Người 1 đến Người 6.
3. Cho mọi người test trong 60–90 phút.
4. Lỗi nào giống nhau thì gom lại một mục.
5. Sửa lỗi Critical/High trước; chưa cần sửa ngay lỗi chữ/icon nhỏ.
6. Sau khi sửa, gửi lại link ZIP phiên bản mới hoặc yêu cầu tải lại ZIP từ tag mới.
7. Người đã báo lỗi mở bản mới và thử lại đúng các bước cũ.

Đây là vòng smoke test đơn giản. Sau khi sáu người đã quen thao tác, mới chuyển sang tài liệu đầy đủ `HUONG_DAN_KIEM_THU_TOAN_BO_HE_THONG_SUPERMARKET_FLY.txt` để chạy các luồng liên actor.
