# Hướng dẫn test Phân ca → POS → Đối soát → Lương

## 1. Chuẩn bị lần đầu

Mở PowerShell tại thư mục `supermarket-fly`:

```powershell
npm run setup:next
npm run test:next
npm start
```

`setup:next` có thể chạy lại: migration (gồm ca hành chính), quyền và tài khoản được chuẩn bị theo kiểu idempotent; danh mục giữ nguyên đúng 36 sản phẩm nhóm đã chốt.

## 2. Tài khoản test

Mật khẩu chung: `123`

- Quản lý: `admin`
- Nhân viên mua hàng: `muahang`
- Thủ kho: `thukho`
- Kế toán: `ketoan`
- Thu ngân 1: `thungan`
- Thu ngân 2–8: `thungan02` … `thungan08`

## 3. Luồng test đầy đủ

### A. Quản lý phân ca

1. Đăng nhập `admin`.
2. Mở **Nhân sự & phân ca**.
3. Chọn tuần cần test, nhấn **Phân ca tự động**.
4. Kiểm tra bản xem trước rồi xác nhận.
5. Kiểm tra:
   - lưới **Khối hành chính**: mua hàng, thủ kho, kế toán đều 7h30–17h30, nghỉ 11h30–13h30, Chủ nhật nghỉ;
   - lưới **Thu ngân**: ca chính 8h và tăng cường 4h;
   - một người không có hai lịch trong cùng ngày;
   - không vượt 48 giờ/tuần;
   - nghỉ tối thiểu 12 giờ;
   - không quá hai ca đêm liên tiếp.
6. Nhấn **Công bố lịch**.

### A2. Mua hàng / Thủ kho / Kế toán chấm công

1. Đăng nhập `muahang`, `thukho` hoặc `ketoan`.
2. Mở **Lịch làm việc**.
3. Nếu đang trong khung 7h30–17h30 (Thứ 2–Thứ 7), nhấn **Chấm công vào**, hết giờ nhấn **Chấm công ra**.
4. Không có nút mở quầy bán hàng — nhóm này không làm POS.
5. Quản lý duyệt công: 7h30–17h30 trừ nghỉ trưa 11h30–13h30 còn **8 giờ** tính lương.

### B. Thu ngân chấm công và bán hàng

1. Đăng nhập đúng Thu ngân được xếp ở ngày/giờ hiện tại.
2. Mở **Lịch làm việc**, nhấn **Check-in**.
3. Mở **Ca bán hàng**, nhập tiền đầu ca và xác nhận.
4. Mở **Bán hàng**:
   - quét/tìm sản phẩm;
   - có thể chọn hoặc tạo khách hàng;
   - tăng/giảm số lượng;
   - chọn một hoặc nhiều phương thức: Tiền mặt, QR, Thẻ, Chuyển khoản;
   - thanh toán đủ và xem bản in hóa đơn.
5. Quay lại **Ca bán hàng**, nhấn **Đóng ca & bàn giao**.
6. Nhập tổng tiền mặt thực tế trong két (gồm quỹ đầu ca).
7. Quay lại **Lịch làm việc**, nhấn **Check-out**.

Hệ thống không cho đóng ca nếu còn hóa đơn nháp hoặc thanh toán chờ xác nhận.

Công thức điểm mặc định để test: chi `10.000 đ` được `1 điểm`, `1 điểm` đổi `1.000 đ`. Có thể đổi bằng `POINT_EARN_UNIT` và `POINT_VALUE_VND` trong `.env` khi nhóm chốt chính sách chính thức.

### C. Quản lý duyệt công

1. Đăng nhập `admin`, mở **Nhân sự & phân ca**.
2. Tại bảng **Duyệt công**, duyệt lượt đã Check-out.
3. Kiểm tra bảng lương tạm tính phía dưới. Giờ 22:00–06:00 được tách thành giờ đêm.

### D. Kế toán đối soát ca

1. Đăng nhập `ketoan`.
2. Mở **Ca & Phiếu thu**.
3. Chọn ca vừa đóng:
   - nếu lệch tiền, nhập lý do giải trình;
   - lập và xác nhận Phiếu thu;
   - xem/in Phiếu thu.

Phiếu thu chỉ xác nhận tiền mặt bàn giao, không ghi doanh thu lần thứ hai.

### E. Kế toán lập bảng lương

1. Mở **Bảng lương tháng**.
2. Chọn tháng và nhấn **Lập / tính lại**.
3. Kiểm tra giờ ngày, giờ đêm và tổng lương.
4. Nhấn **Khóa kỳ lương**.
5. Nhập mã giao dịch cho từng nhân viên khi trả lương.

Kỳ đã khóa không thể tính lại; chỉ lượt chấm công đã được Quản lý duyệt mới được tính.

## 4. Kiểm thử tự động

```powershell
cd server
npm test
npm run test:scheduler
```

Kiểm thử tích hợp dưới đây tạo một hóa đơn thật trong CSDL test, trừ một đơn vị tồn và đóng một ca mẫu:

```powershell
npm run test:sales-flow
```

## 5. Dữ liệu smoke test đã tạo

Lần kiểm tra bàn giao đã tạo:

- Hóa đơn `HD202608250001`, tổng `38.000 đ`;
- Ca `CA202608250001`, chênh lệch `0 đ`;
- Phiếu thu `PT2608250001`;
- một lượt công của `NV_TN08` và bảng lương tháng `2026-08`.

Các bản ghi này giúp mở giao diện và kiểm tra ngay cả trước khi tự chạy lại toàn bộ luồng.
