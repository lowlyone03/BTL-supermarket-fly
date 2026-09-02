# Hướng dẫn bàn giao Supermarket Fly cho thành viên kiểm thử

Ngày đóng gói: **30/08/2026**  
Phạm vi: ứng dụng quản trị nội bộ Electron, 5 actor, 12 tài khoản nhân viên.

## 1. Gói cần gửi cho người kiểm thử

Gửi riêng tư đủ ba thành phần sau:

1. Mã nguồn Git của thư mục `supermarket-fly` hoặc file Git bundle được tạo cùng bản backup.
2. File database `SupermarketFlyDB_2026-08-30_*.bak` trong thư mục `D:\UDTHTKT\BTL\TaiLieu_Du_An\05_Backup\Database_Backups`.
3. File `SupermarketFly_Uploads_2026-08-30_*.zip` trong cùng thư mục backup.

Ảnh sản phẩm mẫu nằm trong mã nguồn và đi theo Git. Ảnh do người dùng tải lên nằm trong `server/uploads`, bị Git bỏ qua, nên phải bàn giao bằng file ZIP riêng.

Không gửi công khai file `.env`, database hoặc mật khẩu thật. Với nhóm môn học, nên dùng Google Drive/OneDrive có giới hạn người được truy cập hoặc một Git repository riêng tư.

## 2. Yêu cầu trên máy người kiểm thử

- Windows 10 hoặc Windows 11.
- Node.js 22 trở lên và npm 10 trở lên. Bản đóng gói hiện tại đã kiểm tra với Node.js 24 và npm 11.
- Git.
- SQL Server Express có instance tên `SQLEXPRESS`.
- ODBC Driver 17 for SQL Server.
- SQL Server Management Studio (SSMS) để khôi phục database thuận tiện.

Ứng dụng hiện kết nối bằng Windows Authentication tới:

- Server: `localhost\SQLEXPRESS`
- Database: `SupermarketFlyDB`
- ODBC driver: `ODBC Driver 17 for SQL Server`

Nếu máy test dùng tên instance khác, cần đổi trường `server` trong `server/src/config/db.js` trước khi chạy. Không cần nhập tài khoản SQL khi dùng Windows Authentication.

## 3. Lấy mã nguồn

### Cách A — từ Git bundle trong gói backup

Mở PowerShell tại thư mục muốn đặt dự án:

```powershell
git clone "D:\duong-dan-den-file\supermarket-fly_2026-08-30_*.bundle" supermarket-fly
cd .\supermarket-fly
```

Thay đường dẫn và tên file đúng với file được nhận. Nếu PowerShell không tự mở rộng dấu `*` trong tham số này, nhập đầy đủ tên file bundle.

### Cách B — từ Git repository riêng tư

```powershell
git clone <URL_REPOSITORY_RIENG_TU> supermarket-fly
cd .\supermarket-fly
```

Kiểm tra mã nguồn đã đúng bản bàn giao:

```powershell
git log -1 --oneline
git status --short
```

`git status --short` phải không in ra thay đổi nào ngay sau khi clone.

## 4. Khôi phục database

1. Mở SSMS và kết nối `localhost\SQLEXPRESS` bằng **Windows Authentication**.
2. Bấm chuột phải **Databases** → **Restore Database...**.
3. Chọn **Device** → chọn file `SupermarketFlyDB_2026-08-30_*.bak`.
4. Đặt tên database đích là `SupermarketFlyDB`.
5. Nếu máy đã có database cùng tên và dữ liệu đó không cần giữ, hãy backup database cũ trước. Chỉ chọn ghi đè khi đã chắc chắn đúng database test.
6. Hoàn tất Restore và chạy truy vấn kiểm tra:

```sql
USE SupermarketFlyDB;
SELECT DB_NAME() AS TenDatabase;
SELECT COUNT(*) AS SoNhanVien FROM NhanVien;
```

Kết quả mong đợi của bản dữ liệu bàn giao: database là `SupermarketFlyDB`, hệ thống có 12 nhân viên theo cơ cấu đã chốt.

Nếu SQL Server báo không đọc được file `.bak`, hãy chép file vào thư mục backup mặc định của SQL Server rồi chọn lại trong SSMS.

Không chạy `npm run setup:next` sau khi đã restore bản backup mới nhất. Lệnh đó dành cho việc nâng cấp/chuẩn hóa một database cũ và có thể thay đổi dữ liệu test.

## 5. Khôi phục ảnh sản phẩm tải lên

Giải nén file `SupermarketFly_Uploads_2026-08-30_*.zip`. Chép thư mục `uploads` nhận được vào:

```text
supermarket-fly\server\uploads
```

Cấu trúc đúng sau khi chép:

```text
server\uploads\products\...
```

Nếu file ZIP không có ảnh thì đây vẫn là trạng thái hợp lệ: tại thời điểm backup chưa có ảnh runtime nào; ảnh sản phẩm mẫu vẫn lấy từ tài nguyên đã lưu trong Git.

## 6. Cài thư viện và chạy ứng dụng

Tại thư mục gốc `supermarket-fly`, chạy lần lượt:

```powershell
npm install
cd .\server
npm install
cd ..\desktop
npm install
cd ..
npm start
```

`npm start` sẽ chạy đồng thời backend tại `http://localhost:3000` và ứng dụng Electron. Giữ cửa sổ PowerShell mở trong suốt lúc kiểm thử.

Nếu cổng 3000 đang bị chiếm, dừng tiến trình cũ rồi chạy lại. Không nên tự đổi cổng khi chưa cập nhật đồng bộ ứng dụng desktop.

## 7. Tài khoản kiểm thử của 5 actor

Mật khẩu mẫu: `123`.

| Actor | Tài khoản | Phạm vi kiểm thử chính |
|---|---|---|
| Quản lý cửa hàng | `admin` | nhân viên, tài khoản, phân quyền, phê duyệt, sản phẩm, khuyến mãi, báo cáo UC10 |
| Nhân viên mua hàng | `muahang` | nhà cung cấp, đề nghị mua, đơn mua, theo dõi giao hàng, báo cáo mua hàng |
| Thủ kho | `thukho` | tồn kho, nhận hàng, phiếu nhập/xuất, kiểm kê, kiểm tra đổi trả, báo cáo UC15 |
| Thu ngân | `thungan` đến `thungan08` | lịch/ca, POS, khách hàng, hóa đơn, đổi trả, báo cáo UC22 |
| Kế toán | `ketoan` | đối chiếu ba chứng từ UC27, thu/chi, công nợ, quyết toán ca, lãi gộp UC29 |

Nếu một tài khoản đã được đổi mật khẩu hoặc bị khóa trong lần test trước, dùng `admin` để kiểm tra trạng thái tài khoản. Không reset hàng loạt khi chưa ghi nhận kết quả kiểm thử.

## 8. Thứ tự test liên actor khuyến nghị

Để dữ liệu không bị đi ngược luồng, kiểm thử theo thứ tự:

1. **Quản lý:** đăng nhập, kiểm tra đủ 12 nhân viên/tài khoản và quyền của 5 actor; tạo sản phẩm có ảnh; phân ca và công bố lịch.
2. **Thủ kho:** tạo đề nghị mua hàng từ mặt hàng cần bổ sung.
3. **Mua hàng:** tiếp nhận đề nghị, lập đơn mua và chuyển quản lý phê duyệt.
4. **Quản lý:** duyệt đơn mua đúng điều kiện.
5. **Thủ kho:** nhận và kiểm tra hàng, lập phiếu nhập; xác nhận tồn kho chỉ tăng một lần.
6. **Kế toán:** đối chiếu đơn mua – phiếu nhập – hóa đơn, gồm sản phẩm, số lượng, đơn giá, thuế suất, tiền thuế và tổng cộng.
7. **Thu ngân:** check-in/mở ca, bán hàng, thanh toán, in hóa đơn; kiểm tra tồn kho giảm đúng một lần.
8. **Thu ngân + Thủ kho + Quản lý:** thực hiện đổi/trả, kiểm tra các nhánh đổi ngang giá, hoàn tiền, hàng nhập lại và hàng không nhập lại.
9. **Kế toán:** quyết toán ca, phiếu thu/chi, công nợ và công thức lãi gộp sau đổi trả.
10. **Cả 5 actor:** lập báo cáo đúng kỳ, kiểm tra KPI, biểu đồ, bảng chi tiết, tìm kiếm, xuất CSV và bản in/PDF.

Thực hiện chi tiết từng ca bình thường và ngoại lệ theo file:

```text
HUONG_DAN_KIEM_THU_TOAN_BO_HE_THONG_SUPERMARKET_FLY.txt
```

Riêng UC10/UC27/UC29 dùng thêm:

```text
HUONG_DAN_KIEM_THU_UC10_UC27_UC29.md
```

## 9. Quy ước dữ liệu test

- Mã/tên dữ liệu mới nên có tiền tố `TEST-<TEN_THANH_VIEN>-<YYYYMMDD>`.
- Mỗi người dùng một thu ngân hoặc một bộ mã test riêng để tránh sửa cùng chứng từ.
- Ghi lại mã đơn mua, phiếu nhập, hóa đơn, phiếu đổi trả và ca bán hàng của từng kịch bản.
- Với ca ngoại lệ, chụp màn hình thông báo lỗi và kiểm tra lại database/UI để chắc chắn không phát sinh tồn kho, tiền, công nợ hoặc trạng thái chứng từ ngoài ý muốn.
- Không xóa dữ liệu của người test khác. Không thử trên database duy nhất chưa được backup.

## 10. Kiểm tra tự động trước khi test tay

Từ thư mục gốc:

```powershell
npm run test:next
```

Kỳ vọng: tất cả kiểm tra cú pháp, quy tắc nghiệp vụ, ảnh sản phẩm, upload, tìm kiếm, mẫu in báo cáo và lịch làm việc đều đạt.

Kiểm tra API upload ảnh tích hợp cần hai cửa sổ PowerShell:

Cửa sổ 1:

```powershell
npm run start:server
```

Cửa sổ 2:

```powershell
cd .\server
npm run test:product-image-api
```

Bài test API sẽ tự dọn sản phẩm, tồn kho và ảnh test do nó tạo. Dừng server ở cửa sổ 1 bằng `Ctrl+C` sau khi hoàn tất.

## 11. Checklist kết thúc buổi test

- Ghi commit Git đã test và thời gian bắt đầu/kết thúc.
- Ghi tài khoản/actor đã dùng.
- Ghi mã test case trong tài liệu full-system.
- Ghi kết quả `PASS`, `FAIL` hoặc `BLOCKED` và bằng chứng ảnh/video.
- Với lỗi số liệu, ghi cả kỳ báo cáo và mã chứng từ nguồn.
- Với lỗi tìm kiếm, ghi từ khóa chính xác, màn hình và kết quả mong đợi.
- Với lỗi ảnh, ghi định dạng, dung lượng file và sản phẩm liên quan.
- Không sửa trực tiếp database để “làm cho test chạy qua”; mọi can thiệp phải được ghi lại.

## 12. Lưu ý khi chia sẻ

Bản hiện tại phù hợp nhất với hình thức mỗi thành viên chạy mã nguồn và database test trên máy riêng. Chỉ gửi một file cài Electron là chưa đủ, vì backend và SQL Server vẫn là thành phần bắt buộc. Việc đưa lên HTTP hoặc tạo bản cài độc lập cần một giai đoạn triển khai riêng, không thuộc gói test nội bộ này.
