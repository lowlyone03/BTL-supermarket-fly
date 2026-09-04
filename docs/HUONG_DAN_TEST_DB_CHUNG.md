# Hướng dẫn test chung một database — 7 thành viên

Đọc file này khi cả nhóm muốn test như một cửa hàng thật: người này làm xong, người kia **thấy ngay** trên máy mình, **không** phải đăng xuất để đóng vai người khác.

- **Cùng Wi-Fi:** làm tiếp trong file này (IP `192.168...`).
- **Khác Wi-Fi / mỗi người một nhà:** dùng phần mềm miễn phí Tailscale — xem `HUONG_DAN_KHAC_WIFI.md`.

GitHub: `https://github.com/lowlyone03/BTL-supermarket-fly`  
Nhánh: `main`  
Bản có ô *Máy chủ nhóm*: commit `5f6cc05` trở đi.

---

## 0. Đọc 2 phút cho hết rối

Trong đồ án có **hai loại “7 / 5 / 12”** — đừng trộn:

| Số | Là gì | Ý nghĩa khi test |
| --- | --- | --- |
| **7 thành viên** | 7 người trong nhóm bài tập lớn (các bạn) | 7 máy, 7 chỗ ngồi |
| **5 actor** | 5 loại tài khoản trong phần mềm | Quản lý, Mua hàng, Thủ kho, Thu ngân, Kế toán |
| **12 nhân viên** | 12 user đã seed sẵn | 1 QL + 1 MH + 1 TK + 8 TN + 1 KT |

Phần mềm **không có** tài khoản thứ 6 hay thứ 7.  
Vì vậy 7 người **không** phải tạo 7 vai trò mới. Cách chia:

- **1 người (TV1)** vừa mở **máy chủ** (giữ database) vừa test phần nền tảng (đăng nhập, tài khoản).
- **5 người (TV3–TV6 + một phần TV2)** mỗi người **một tài khoản nghiệp vụ**, để nguyên máy, không thoát.
- **TV2 và TV7** cùng tài khoản `admin` nhưng **mỗi người một cụm màn hình**, không sửa cùng một chứng từ.

Giống siêu thị: 7 sinh viên ngồi 7 máy, nhưng cửa hàng chỉ có 5 loại nhân viên. Hai bạn “quản lý” chia việc: một bạn duyệt đơn / sản phẩm, một bạn phân ca / lãi lỗ.

**Cấm** kiểu: một người login `thukho` xong việc → đăng xuất → login `muahang` làm tiếp. Đó là lý do buổi test cũ rối.

---

## 1. Điền tên trước khi ngồi (in / gửi nhóm)

| TV | Phần code của bạn | Máy chạy gì | Tài khoản | Mật khẩu | Việc được làm trên máy mình |
| --- | --- | --- | --- | --- | --- |
| **TV1** | Nền tảng, login, JWT | `4_CHAY_MAY_CHU_NHOM.bat` (+ app nếu muốn) | Máy chủ. Test thêm: `admin` khi TV2/TV7 không đụng màn Tài khoản | `123` | Mở API + SQL. Gửi IP. Giúp bạn khác kết nối. Test sai mật khẩu, khóa TK, chuông |
| **TV2** | Quản trị cửa hàng | `5_CHAY_MAY_THANH_VIEN.bat` | `admin` | `123` | Sản phẩm, nhân viên, **duyệt đơn mua / xuất / kiểm kê**, báo cáo cửa hàng UC10 |
| **TV3** | Mua hàng | file 5 | `muahang` | `123` | NCC, nhận đề nghị, lập đơn mua, theo dõi giao |
| **TV4** | Thủ kho | file 5 | `thukho` | `123` | Tồn, đề nghị mua, nhận hàng, phiếu nhập/xuất, kiểm kê |
| **TV5** | Thu ngân / POS | file 5 | `thungan` | `123` | Lịch ca, check-in, bán hàng, hóa đơn, đóng ca |
| **TV6** | Kế toán | file 5 | `ketoan` | `123` | Đối chiếu 3 chứng từ, công nợ, phiếu thu/chi, bảng lương |
| **TV7** | Ca – công – lương – lãi/lỗ | file 5 | `admin` (cùng TV2) | `123` | **Phân ca, ngày lễ, duyệt công, giao quỹ lương, lãi/lỗ cửa hàng** — không vào Sản phẩm / không duyệt đơn của TV2 |

Điền họ tên vào cột trống khi gửi nhóm:

```text
TV1 (máy chủ): ........................
TV2 (admin — duyệt / SP): .............
TV3 (muahang): ........................
TV4 (thukho): .........................
TV5 (thungan): ........................
TV6 (ketoan): .........................
TV7 (admin — ca / lãi lỗ): ............
```

---

## 2. Cả nhóm phải cùng mạng

1. Bảy máy bắt **cùng một Wi-Fi** (wifi nhà, wifi lab, phát hotspot từ một điện thoại).
2. **Không** dùng wifi “khách” / “guest” của quán — loại này thường chặn máy này nói chuyện với máy kia.
3. TV1 **không tắt máy**, không cho máy ngủ, **không đóng cửa sổ đen** của máy chủ.
4. Thành viên **không cần** cài SQL Server, SSMS, ODBC, không restore file `.bak`. Chỉ TV1 cần database trên máy mình.

---

## 3. Việc của TV1 — máy chủ (làm trước, khoảng 10 phút)

TV1 là “nhà kho dữ liệu”. Sáu người kia chỉ mượn dữ liệu qua mạng.

### 3.1. Máy TV1 đã có sẵn

- Node.js 22+
- SQL Server Express instance `SQLEXPRESS`
- Database tên đúng `SupermarketFlyDB` (đã seed, đăng nhập `admin` / `123` được trên máy TV1)
- Thư mục dự án: `...\supermarket-fly` (thấy `package.json`, `server`, `desktop`, các file `.bat`)

Nếu máy TV1 chưa chạy được app một mình thì **chưa mở buổi test nhóm**. Chạy `1_CAI_DAT_LAN_DAU.bat` rồi `2_CHAY_SUPERMARKET_FLY.bat` trên máy TV1 đến khi login được, mới làm bước 3.2.

### 3.2. Lấy đúng bản code

Mở PowerShell:

```powershell
cd D:\UDTHTKT\BTL\supermarket-fly
git pull origin main
git log -1 --oneline
```

Dòng cuối phải thấy commit có chữ máy chủ nhóm, hoặc mã `5f6cc05` trở về sau.  
Nếu không dùng Git: tải ZIP `https://github.com/lowlyone03/BTL-supermarket-fly/archive/refs/heads/main.zip`, giải nén, vào thư mục có các file `.bat`.

### 3.3. Mở máy chủ

1. Vào thư mục `supermarket-fly`.
2. **Chuột phải** `4_CHAY_MAY_CHU_NHOM.bat` → **Run as administrator** (để Windows cho phép máy khác vào cổng 3000).
3. Để cửa sổ đen mở. Không bấm phím, không đóng.

Cửa sổ sẽ in roughly:

```text
IP may nay de thanh vien nhap o man dang nhap:
  192.168.1.23
```

hoặc khi Node chạy xong:

```text
Cùng Wi-Fi: thành viên nhập IP này ở màn đăng nhập (ô Máy chủ nhóm):
   192.168.1.23
```

**Chỉ gửi số IP** (bốn nhóm số, có dấu chấm).  
Không gửi `http://...`, không gửi `:3000` trừ khi nhóm trưởng dặn khác.

Nếu thấy **hai IP** (ví dụ một cái `192.168...` và một cái `26.x` của Radmin/Hamachi): gửi cái `192.168...`. Bạn khác thử không vào được thì thử IP còn lại.

### 3.4. Tin nhắn TV1 gửi ngay vào nhóm

```text
Máy chủ đã mở. Commit: 5f6cc05
Cùng Wi-Fi với mình.
IP điền vào ô "Máy chủ nhóm": 192.168.x.x

Mọi người:
- Chỉ chạy 5_CHAY_MAY_THANH_VIEN.bat (đừng chạy file 2)
- Ô Máy chủ nhóm dán IP → bấm Kiểm tra
- Bấm đúng nút vai trò của mình, mật khẩu 123
- Để nguyên máy, không đăng xuất

TV2 = admin (duyệt, sản phẩm)
TV3 = muahang
TV4 = thukho
TV5 = thungan
TV6 = ketoan
TV7 = admin nhưng chỉ phân ca / ngày lễ / quỹ lương / lãi lỗ
```

### 3.5. TV1 có được mở app trên máy mình không?

Được. Có 2 cách:

- Cách A (an toàn): trên máy TV1 chạy thêm `5_CHAY_MAY_THANH_VIEN.bat`, ô máy chủ để `localhost`, đăng nhập khi cần test nền tảng.
- Cách B: chỉ nhìn cửa sổ đen, không mở app — đỡ rối.

**Đừng** chạy `2_CHAY_SUPERMARKET_FLY.bat` cùng lúc với file 4: hai API cùng cổng 3000 sẽ lệch.

---

## 4. Việc của TV2 → TV7 — máy thành viên (làm sau khi đã có IP)

Làm **đúng thứ tự**. Sai bước 4.3 là nguyên nhân hay gặp nhất (“sao máy mình không thấy đơn của bạn”).

### 4.1. Lần đầu trên máy (chỉ một lần)

Cần: Windows, Node.js 22+. **Không** cần SQL Server.

```powershell
git clone https://github.com/lowlyone03/BTL-supermarket-fly.git
cd BTL-supermarket-fly
```

Hoặc tải ZIP `main` như mục 3.2.

Nhấp đúp `1_CAI_DAT_LAN_DAU.bat`, chờ dòng `CAI DAT THANH CONG`.

### 4.2. Mỗi buổi test

1. Đóng hết cửa sổ Supermarket Fly cũ (nếu có).
2. Nhấp đúp **`5_CHAY_MAY_THANH_VIEN.bat`**.
3. **Không** chạy `2_CHAY_SUPERMARKET_FLY.bat`. File 2 tự mở API trên *máy bạn* → bạn sẽ nhìn database rỗng/cũ của máy bạn, không phải database nhóm.

Giữ cửa sổ đen của file 5 mở. Chờ cửa sổ đăng nhập hiện.

### 4.3. Màn đăng nhập — bốn nút, làm từ trên xuống

Màn hình có form trắng bên phải.

**Bước A — Máy chủ nhóm** (ô phía dưới, có icon hình đĩa / database)

1. Xóa chữ `localhost` nếu đang có.
2. Dán đúng IP TV1 gửi, ví dụ `192.168.1.23`.
3. Bấm **Kiểm tra**.
4. Chờ chữ xanh: `Kết nối được 192.168.1.23. Có thể đăng nhập.`
5. Nếu chữ đỏ: dừng lại, nhắn TV1. Đừng bấm Đăng nhập.

**Bước B — Tài khoản**

Bấm **một** nút màu viên thuốc đúng vai của bạn:

| Bạn là | Bấm nút |
| --- | --- |
| TV2 hoặc TV7 | **Quản lý** |
| TV3 | **Mua hàng** |
| TV4 | **Thủ kho** |
| TV5 | **Thu ngân** |
| TV6 | **Kế toán** |

Ô tên và mật khẩu tự điền (`123`). Không sửa mật khẩu.

**Bước C — Đăng nhập**

Bấm nút xanh **Đăng nhập**.

**Bước D — Kiểm tra đã vào đúng nhà**

Góc trái dưới, dưới chữ vai trò, phải thấy:

`Dữ liệu nhóm · 192.168.1.23`

(số IP trùng IP TV1).

Nếu thấy `Dữ liệu: máy này` → bạn đang lệch. Bấm **Đổi tài khoản**, làm lại bước A.

### 4.4. Sau khi vào được — để nguyên

- Không tắt app.
- Không đổi tài khoản trừ khi bạn là TV7/TV2 và đã thống nhất.
- Việc người trước làm xong: xem **chuông** góc trên, hoặc mở đúng danh sách (đơn mua, đề nghị, phê duyệt…).

---

## 5. TV2 và TV7 cùng `admin` thì chia màn thế nào?

Hai máy **đăng nhập `admin` cùng lúc được** (hệ thống không đá người kia ra).

| Màn / việc | Ai được bấm | Ai không bấm |
| --- | --- | --- |
| Sản phẩm & giá, nhân viên, tài khoản | TV2 | TV7 |
| Trung tâm phê duyệt (đơn mua, xuất kho, kiểm kê, đổi trả, phiếu chi NCC) | TV2 | TV7 chỉ xem nếu cần |
| Báo cáo cửa hàng UC10 | TV2 | TV7 xem lãi/lỗ ở màn của TV7 |
| Phân ca, lịch làm việc, ngày lễ, duyệt chấm công | TV7 | TV2 |
| Giao quỹ lương cho kế toán | TV7 | TV2 |
| Cửa hàng lãi hay lỗ (P&L) | TV7 | TV2 |
| Nhật ký hệ thống | TV1 hoặc TV2 khi bắt lỗi | Không xóa log |

Nếu hai người vô tình sửa cùng một đơn: người giữ chứng từ nói mã đơn trong chat, người kia dừng.

---

## 6. Buổi test gợi ý — 7 người, khoảng 90 phút

Làm theo **thứ tự**. Người sau chỉ bắt đầu khi người trước nhắn mã chứng từ vào nhóm.

### Vòng 0 — Cả 7 người vào được (15 phút)

Mỗi người gửi 1 ảnh:

1. Thanh bên trái có chữ `Dữ liệu nhóm · <IP>`.
2. Tên nhân viên đúng vai (Nguyễn Minh Anh = QL, Trần Thu Hà = MH, …).

Chưa đủ 7 ảnh thì chưa đếm giờ test nghiệp vụ.

TV1 lúc này: thử login sai mật khẩu trên máy mình (localhost), xác nhận báo lỗi tiếng Việt. Không khóa `admin`.

### Vòng 1 — Mỗi người sờ phần mình, chưa nối chuỗi (20 phút)

Làm song song, dữ liệu mới phải có tiền tố `TEST-<TV>-<ngày>`, ví dụ `TEST-TV3-20260904`.

| TV | Làm gì | Không làm |
| --- | --- | --- |
| TV1 | Đúng IP, cửa sổ chủ còn chạy, xem nhật ký đăng nhập | Không xóa tài khoản mẫu |
| TV2 | Tìm 1 sản phẩm, xem danh sách chờ duyệt | Chưa bấm duyệt nếu chưa có đơn của TV3 |
| TV3 | Tìm NCC, thử thêm NCC trùng mã (phải bị chặn) | Chưa lập đơn nếu TV4 chưa có đề nghị |
| TV4 | Mở tồn kho, tìm sản phẩm không dấu | Chưa xuất hủy bừa |
| TV5 | Mở lịch ca. Nếu chưa có lịch hôm nay → ghi BLOCKED, chờ TV7 | Không tự sửa database |
| TV6 | Mở công nợ / đối chiếu, xem số liệu có sẵn | Chưa bấm thanh toán thật |
| TV7 | Mở phân ca. **Công bố lịch hôm nay** cho `thungan` nếu TV5 đang BLOCKED | Không đổi giá sản phẩm |

### Vòng 2 — Một chuỗi cửa hàng (40 phút) — đây là lúc DB chung có ích

Nhắn vào nhóm theo mẫu: `TV4 xong đề nghị ĐN-____`.

1. **TV7** công bố lịch ca **hôm nay**, đúng giờ đang ngồi, cho thu ngân `thungan`.
2. **TV4** lập **Phiếu đề nghị mua** từ mặt hàng tồn thấp. Gửi mã đề nghị.
3. **TV3** mở hộp thư đề nghị → thấy đúng mã đó → lập **Đơn mua**. Gửi mã đơn.
4. **TV2** mở phê duyệt → duyệt đơn đó (đúng điều kiện). Nhắn “đã duyệt”.
5. **TV4** nhận hàng → phiếu nhập, chỉ SL chấp nhận. Gửi mã phiếu nhập.
6. **TV6** đối chiếu đơn + phiếu nhập + hóa đơn mua. Khớp mới có công nợ. Gửi mã công nợ / kết quả lệch.
7. **TV5** check-in / mở ca → bán 1–2 món (tiền mặt hoặc QR). Gửi mã hóa đơn. Đóng ca nếu kịp.
8. **TV6** lập phiếu thu theo ca vừa đóng (nếu TV5 đã đóng).
9. **TV7** mở **lãi/lỗ cửa hàng**, bấm lập báo cáo kỳ hiện tại. Chụp KPI.

Nếu bước nào kẹt: ghi `BLOCKED: thiếu bước TV_`, **không** tự login hộ tài khoản người khác.

### Vòng 3 — Chụp lỗi / kết thúc (15 phút)

- Lỗi gửi: người + tài khoản + màn + đã bấm gì + mong đợi + thực tế + ảnh.
- TV1 không tự bảo “PASS” cho lỗi mình vừa giải thích; người gặp lỗi phải thử lại.
- Tắt máy: thành viên đóng app trước. **TV1 tắt máy chủ sau cùng.**

---

## 7. Quy ước để 7 người không đạp chân nhau

- Tên dữ liệu mới: `TEST-TV3-20260904-NCC` (đổi TV và ngày).
- Không xóa sản phẩm / NCC / chứng từ có sẵn.
- Không đổi mật khẩu `123` giữa buổi.
- TV5 nếu cần thu ngân thứ hai (tránh trùng ca): dùng `thungan02` / `123`, nói trước trong nhóm.
- Thiếu bước trước → nhắn đúng TV, chờ. Không “mượn” tài khoản.
- Cùng một đơn mua: chỉ TV3 sửa khi còn nháp; sau gửi duyệt thì chỉ TV2 duyệt.

---

## 8. Sự cố — đọc hàng của bạn

| Bạn thấy gì | Nguyên nhân hay gặp | Làm gì |
| --- | --- | --- |
| Bấm Kiểm tra ra chữ đỏ | TV1 chưa chạy file 4; khác Wi-Fi; sai IP; firewall chặn | TV1 chạy lại file 4 **Run as administrator**. Thành viên thử IP còn lại nếu có 2 IP |
| Đăng nhập được nhưng không thấy đề nghị / đơn của bạn kia | Ô máy chủ còn `localhost` hoặc đã chạy nhầm file 2 | Đổi tài khoản, dán lại IP, Kiểm tra, xem sidebar `Dữ liệu nhóm` |
| `Failed to fetch` / không vào được | App thành viên trỏ đúng IP nhưng TV1 đóng cửa sổ đen hoặc máy ngủ | TV1 mở lại file 4; thành viên bấm Kiểm tra lại |
| Hai người cùng `admin` sửa mất dữ liệu nhau | TV2 và TV7 vào cùng một màn | Quay lại bảng mục 5 |
| Thu ngân không mở được POS | Chưa có lịch **hôm nay** hoặc ngoài giờ ca | TV7 công bố lịch; đứng trong giờ ca (vào sớm tối đa ~10 phút) |
| File 5 mở xong vẫn không có cửa sổ app | Chưa `1_CAI_DAT_LAN_DAU.bat` hoặc lỗi npm | Chụp cả cửa sổ đen gửi TV1 |
| TV1 chạy file 4 báo lỗi SQL | Database chưa có / sai instance | Trên máy TV1 chạy app một mình (`2_...bat`) đến khi login được đã |

---

## 9. Khi nào *không* dùng database chung

Mỗi người restore `.bak` trên máy mình và chạy `2_CHAY_SUPERMARKET_FLY.bat` khi:

- Ở nhà một mình, không cùng mạng.
- Cố ý thử xóa / phá dữ liệu.
- Chỉ kiểm tra chữ, nút, giao diện phần mình.

**Một buổi chỉ chọn một cách.** Đừng nửa nhóm vào IP TV1, nửa nhóm chạy file 2.

---

## 10. TV1 nhớ sau buổi test

- Có thể tắt file 4.
- Database trên máy TV1 đã bị cả nhóm ghi thêm chứng từ `TEST-...` — đó là bình thường.
- Trước buổi test sạch: TV1 backup hoặc restore lại `.bak` mẫu, rồi mới mở file 4.
- Sửa lỗi xong nhớ `git push` và gửi **mã commit mới** + danh sách chỗ cần thử lại. Không chỉ nhắn “đã sửa”.
