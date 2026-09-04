# Kế hoạch bàn giao và phân công 6 thành viên test Supermarket Fly

Phạm vi tổ chức: **1 người phát triển/điều phối + 6 thành viên kiểm thử**.  
Repository: `https://github.com/lowlyone03/BTL-supermarket-fly.git`

## 1. Vai trò của cả nhóm

### Bạn — người phát triển và điều phối

Bạn không nhận một actor để test như sáu thành viên. Nhiệm vụ của bạn là:

- Chốt đúng phiên bản mã nguồn và đẩy lên GitHub.
- Chạy kiểm tra tự động trước khi giao.
- Backup database, ảnh runtime và gửi đúng bộ file.
- Thông báo mã commit dùng cho cả đợt test.
- Phân công test case, giải đáp tiền điều kiện và nhận báo lỗi.
- Sửa lỗi, đẩy commit mới và thông báo phạm vi cần retest.
- Không tự đánh dấu PASS cho lỗi do mình vừa sửa; người báo lỗi phải retest.

### Sáu thành viên test

- Thành viên 1: Quản lý cửa hàng.
- Thành viên 2: Nhân viên mua hàng.
- Thành viên 3: Thủ kho.
- Thành viên 4: Thu ngân.
- Thành viên 5: Kế toán.
- Thành viên 6: QA tích hợp, bảo mật, báo cáo chéo và toàn vẹn dữ liệu.

## 2. Việc bạn làm trước khi gửi bản test

### 2.1. Chốt và đẩy Git

Mở PowerShell tại dự án:

```powershell
cd D:\UDTHTKT\BTL\supermarket-fly
git status --short
npm run test:next
git push origin main
git rev-parse --short HEAD
```

Điều kiện được phép gửi nhóm:

- `git status --short` không có file chưa lưu.
- `npm run test:next` kết thúc thành công.
- `git push` không báo lỗi.
- Ghi lại mã commit từ lệnh cuối và gửi đúng mã đó vào nhóm chat.

Trong vòng test đầu tiên, bạn tạm ngừng đẩy thay đổi mới lên `main`. Nếu vẫn tiếp tục code trong lúc mọi người test, kết quả giữa các máy sẽ không còn cùng một phiên bản.

### 2.2. Chuẩn bị thư mục bàn giao riêng

Tạo một thư mục trên Google Drive/OneDrive, ví dụ:

```text
SUPERMARKET_FLY_TEST_V1
├── SupermarketFlyDB_2026-08-30_225448.bak
└── LINK_GITHUB.txt
```

Nội dung `LINK_GITHUB.txt`:

```text
Repository: https://github.com/lowlyone03/BTL-supermarket-fly.git
Branch: main
Commit dùng để test: <DÁN MÃ COMMIT MỚI NHẤT>
File hướng dẫn chính: HUONG_DAN_KIEM_THU_TOAN_BO_HE_THONG_SUPERMARKET_FLY.txt
```

Các file phải gửi:

1. `SupermarketFlyDB_2026-08-30_225448.bak`: dữ liệu nền giống nhau cho sáu máy.
2. Link GitHub và mã commit cần test.

Không cần gửi ZIP ảnh trong đợt này vì thư mục ảnh runtime đang rỗng; ảnh mẫu đã nằm trong GitHub.

Không cần gửi:

- Toàn bộ thư mục `node_modules`.
- Thư mục `.git` dưới dạng ZIP.
- File `server/.env` của máy bạn.
- Các bản `.bak` cũ khác.
- Cả thư mục `BTL` chứa tài liệu cá nhân không liên quan.

GitHub chứa mã nguồn và ảnh mẫu. Chỉ file `.bak` phải gửi riêng qua Drive trong đợt test hiện tại.

### 2.3. Tạo nơi nhận lỗi

Cách khuyến nghị: dùng GitHub Issues của repository.

Tạo các nhãn:

- `critical`: sai tiền, sai tồn, mất dữ liệu, vượt quyền.
- `high`: sai luồng chính hoặc không thể hoàn tất nghiệp vụ.
- `medium`: kiểm tra dữ liệu/báo cáo sai cục bộ.
- `low`: giao diện, chữ, icon hoặc responsive.
- `admin`, `purchase`, `warehouse`, `cashier`, `accounting`, `integration`.
- `need-retest` và `verified`.

Nếu nhóm chưa quen GitHub Issues, dùng một Google Sheet chung nhưng vẫn phải có đủ các cột:

```text
ID | Test case | Người test | Commit | Tài khoản | Mã chứng từ
Kết quả mong đợi | Kết quả thực tế | Mức độ | Ảnh/video | Trạng thái retest
```

## 3. Tin nhắn bạn gửi vào nhóm

Có thể sao chép mẫu sau:

```text
Mọi người test Supermarket Fly theo bản đã chốt sau:

GitHub: https://github.com/lowlyone03/BTL-supermarket-fly.git
Branch: main
Commit bắt buộc: <MÃ COMMIT>
Database: <LINK DRIVE>
Mật khẩu tài khoản mẫu: 123

Trước khi test, mọi người phải gửi lại 4 ảnh/xác nhận:
1. git log -1 --oneline đúng commit.
2. npm run test:next PASS.
3. Database có 12 nhân viên và 12 tài khoản.
4. Đăng nhập được tài khoản đã phân công.

Không sửa code, không push lên main và không xóa dữ liệu của test case khác.
Mọi dữ liệu mới đặt tiền tố TEST-<TEN>-<NGAY>.
Lỗi phải ghi mã test case, bước tái hiện, mong đợi/thực tế, mã chứng từ và ảnh/video.
```

## 4. Sáu thành viên cài và xác nhận môi trường

Mỗi thành viên thực hiện trên máy của mình.

### 4.1. Cài phần mềm nền

- Git.
- Node.js 22 trở lên.
- SQL Server Express với instance `SQLEXPRESS`.
- SSMS.
- ODBC Driver 17 for SQL Server.

### 4.2. Clone đúng mã nguồn

```powershell
git clone https://github.com/lowlyone03/BTL-supermarket-fly.git
cd .\BTL-supermarket-fly
git switch main
git pull origin main
git log -1 --oneline
```

Mã commit hiển thị phải trùng mã bạn đã gửi. Nếu không trùng thì chưa được test.

### 4.3. Khôi phục database

Trong SSMS:

1. Kết nối `localhost\SQLEXPRESS` bằng Windows Authentication.
2. Chọn Databases → Restore Database → Device.
3. Chọn `SupermarketFlyDB_2026-08-30_225448.bak`.
4. Database đích là `SupermarketFlyDB`.
5. Nếu máy có database cùng tên, backup dữ liệu cũ trước khi ghi đè.

Kiểm tra sau restore:

```sql
USE SupermarketFlyDB;
SELECT COUNT(*) AS SoNhanVien FROM NhanVien;
SELECT COUNT(*) AS SoTaiKhoan FROM TaiKhoan;
```

Kỳ vọng: `12` nhân viên và `12` tài khoản.

### 4.4. Cài thư viện

Không cần chép ZIP ảnh. Ảnh mẫu đã nằm trong mã nguồn và thư mục ảnh tải lên sẽ được hệ thống tự tạo.

Chạy:

```powershell
npm install
cd .\server
npm install
cd ..\desktop
npm install
cd ..
npm run test:next
npm start
```

Giữ PowerShell chạy `npm start` trong suốt phiên test.

## 5. Phân công chi tiết cho 6 thành viên

### Thành viên 1 — Quản lý cửa hàng

Tài khoản: `admin`, mật khẩu `123`.

Test case chính:

- `MGR-01` đến `MGR-30`.
- `WF-01` đến `WF-12` và `WF-22` đến `WF-29`.
- Các bước quản lý phê duyệt trong P2P, RET, WHI, INV và ACC.
- `RPT-01` đến `RPT-08`.

Phải chú ý: đúng 12 nhân viên/tài khoản, không tự khóa quản lý, phân quyền, sản phẩm bắt buộc có ảnh, lịch làm việc, duyệt/từ chối có lý do và báo cáo UC10.

### Thành viên 2 — Nhân viên mua hàng

Tài khoản: `muahang`, mật khẩu `123`.

Test case chính:

- `PUR-01` đến `PUR-07`.
- `P2P-04` đến `P2P-23`, trừ thao tác phê duyệt thuộc quản lý.
- `RPT-21` đến `RPT-26`.

Phải chú ý: NCC trùng/sai dữ liệu, tiếp nhận đề nghị, giới hạn số lượng, điều khoản 30–45 ngày, gửi duyệt, chuyến giao và báo cáo mua hàng.

### Thành viên 3 — Thủ kho

Tài khoản: `thukho`, mật khẩu `123`.

Test case chính:

- `P2P-01` đến `P2P-03`.
- `WH-01` đến `WH-19`.
- `RET-04` đến `RET-06`.
- `WHI-01` đến `WHI-13`.
- `INV-01` đến `INV-13`.
- `RPT-09` đến `RPT-14`.

Phải chú ý: tồn không âm, chỉ hàng chấp nhận được nhập, không xác nhận hai lần, xuất kho chỉ giảm tồn sau xác nhận, kiểm kê đúng snapshot và báo cáo UC15.

### Thành viên 4 — Thu ngân

Tài khoản: `thungan` hoặc một tài khoản từ `thungan02` đến `thungan08`, mật khẩu `123`.

Test case chính:

- `WF-13` đến `WF-21`.
- `POS-01` đến `POS-42`.
- `RET-01` đến `RET-03` và `RET-11` đến `RET-24`.
- `RPT-15` đến `RPT-20`.

Phải chú ý: lịch/check-in trước khi mở ca, tồn ở thời điểm hoàn tất, tiền mặt/QR/thẻ, mã giao dịch, double click, chốt ca, hoàn tiền, đổi ngang giá và báo cáo chỉ hiện dữ liệu cá nhân.

### Thành viên 5 — Kế toán

Tài khoản: `ketoan`, mật khẩu `123`.

Test case chính:

- `ACC-01` đến `ACC-32`.
- `PAY-01` đến `PAY-12`.
- `RPT-27` đến `RPT-32`.

Phải chú ý: UC27 đối chiếu đủ sản phẩm, số lượng, đơn giá, thuế suất, tiền thuế và tổng tiền; công nợ chỉ giảm sau chi thành công; quyết toán ca; bảng lương; lãi gộp đúng sau đổi trả.

### Thành viên 6 — QA tích hợp

Người này dùng lần lượt cả năm loại tài khoản trên một database riêng, không chỉ test một actor.

Test case chính:

- `GEN-01` đến `GEN-08`.
- `SEC-01` đến `SEC-05`.
- `RPT-33` đến `RPT-42`.
- `E2E-01` đến `E2E-10`.
- `CON-01` đến `CON-10`.
- Checklist giao diện mục 18.
- Toàn bộ đối chiếu cuối buổi tại mục 19.

Đây là người xác nhận các chức năng riêng lẻ có nối thành một quy trình hoàn chỉnh hay không. Người này phải ghi lại mọi mã chứng từ sinh ra trong E2E.

## 6. Cách chạy để sáu người không vướng nhau

**Nên dùng khi test chuỗi liên vai trò:** một máy chủ nhóm + một database. Xem `HUONG_DAN_TEST_DB_CHUNG.md`. Máy chủ chạy `4_CHAY_MAY_CHU_NHOM.bat`, thành viên chạy `5_CHAY_MAY_THANH_VIEN.bat` và nhập IP. Mỗi người giữ một tài khoản, không đăng xuất để làm hộ bước của người khác.

Phần còn lại của mục này mô tả cách cũ: mỗi người một database riêng (phù hợp smoke test độc lập).

### Vòng 0 — Xác nhận cài đặt

Tất cả sáu người gửi lại cho bạn:

- Ảnh commit đúng.
- Ảnh `npm run test:next` PASS.
- Kết quả 12 nhân viên/12 tài khoản.
- Ảnh đăng nhập actor được giao.

Chỉ bắt đầu tính kết quả khi cả sáu người đã qua vòng 0.

### Vòng 1 — Test chức năng song song

- Thành viên 1–5 chạy các test case actor được giao trên database riêng của họ.
- Thành viên 6 chạy GEN, SEC và các test responsive cơ bản.
- Mỗi người đặt dữ liệu `TEST-<TEN>-<YYYYMMDD>`.
- Mỗi lỗi tạo một Issue riêng; không gộp nhiều lỗi khác nghiệp vụ vào cùng một Issue.

Do mỗi người có database riêng, họ không làm thay đổi dữ liệu của nhau. Nếu cần tạo tiền điều kiện bằng actor khác, tester được phép đăng nhập actor đó trên chính database của mình nhưng chỉ đánh giá test case đã được phân công.

### Vòng 2 — Test tích hợp

- Thành viên 6 restore lại bản `.bak` sạch trước khi bắt đầu.
- Chạy `E2E-01` đến `E2E-10` đúng thứ tự.
- Không restore database hoặc xóa chứng từ giữa một chuỗi E2E.
- Thành viên actor tương ứng có thể theo dõi qua chia sẻ màn hình và xác nhận nghiệp vụ.
- Bạn không thao tác thay tester, chỉ giải thích tiền điều kiện nếu tài liệu chưa rõ.

### Vòng 3 — Bạn sửa lỗi

Bạn xử lý theo thứ tự:

1. Critical.
2. High.
3. Medium.
4. Low.

Mỗi lỗi nên có commit riêng hoặc nhóm các lỗi thật sự cùng nguyên nhân. Sau khi sửa:

```powershell
npm run test:next
git add -A
git commit -m "fix: <mô tả ngắn lỗi>"
git push origin main
git rev-parse --short HEAD
```

Gửi nhóm mã commit mới và danh sách test case cần retest. Không chỉ nhắn “đã sửa”.

### Vòng 4 — Retest

Mỗi thành viên cập nhật mã:

```powershell
git switch main
git pull origin main
git log -1 --oneline
npm run test:next
```

- Người tạo Issue phải retest và ghi kết quả.
- PASS thì đổi nhãn từ `need-retest` sang `verified`.
- Còn lỗi thì mở lại Issue, không tạo Issue trùng.
- Lỗi tiền/tồn/công nợ/điểm phải restore database sạch và chạy lại cả chuỗi liên quan.
- Thành viên 6 chạy regression E2E liên quan sau khi các lỗi Critical/High được sửa.

## 7. Mẫu báo lỗi bắt buộc

Tiêu đề:

```text
[FAIL][POS-29][High] Thanh toán hỗn hợp ghi sai tiền QR
```

Nội dung:

```text
Người test:
Ngày giờ:
Commit:
Máy/Windows/Node:
Tài khoản:
Test case:
Mã ca/hóa đơn/chứng từ:

Tiền điều kiện:
Dữ liệu đã nhập:
Các bước tái hiện:
1.
2.
3.

Kết quả mong đợi:
Kết quả thực tế:
Đối chiếu tồn/tiền/công nợ/điểm/trạng thái:
Ảnh hoặc video:
Mức độ: Critical / High / Medium / Low
```

Không chấp nhận báo lỗi kiểu “em bấm không được” hoặc chỉ gửi một ảnh không có mã test case và bước tái hiện.

## 8. Lịch một buổi test gợi ý

| Thời lượng | Hoạt động |
|---|---|
| 30 phút đầu | Vòng 0: kiểm tra môi trường, commit, database và đăng nhập |
| 90 phút | Vòng 1: năm actor test song song; QA test GEN/SEC |
| 15 phút | Tổng hợp Blocked và loại Issue trùng |
| 120 phút | Vòng 2: QA chạy E2E; năm actor hỗ trợ đối chiếu |
| 45 phút | Báo cáo 5 actor, responsive, CSV/PDF/in |
| 30 phút | Đối chiếu cuối buổi và chốt danh sách Critical/High |

Nếu không đủ thời gian, không bỏ E2E-01, E2E-02, E2E-03, E2E-05, E2E-08 và E2E-10.

## 9. Tiêu chí bạn được phép chốt bản ổn

- Cả sáu thành viên dùng cùng commit.
- `npm run test:next` PASS trên bản cuối.
- Không còn Issue Critical hoặc High chưa xác minh.
- Người báo lỗi đã retest, không phải chỉ người phát triển tự xác nhận.
- E2E-01 đến E2E-10 PASS trên một database sạch.
- Không có double click hoặc mất kết nối nào ghi tiền/tồn/công nợ hai lần.
- UC27 so đủ thuế và tổng tiền.
- Công thức lãi gộp sau đổi trả đúng.
- Báo cáo năm actor khớp số liệu nguồn, CSV và bản in/PDF.
- Hệ thống vẫn đúng cơ cấu 12 nhân viên/tài khoản.

Tài liệu test chi tiết tương ứng từng mã nằm trong `HUONG_DAN_KIEM_THU_TOAN_BO_HE_THONG_SUPERMARKET_FLY.txt`.
