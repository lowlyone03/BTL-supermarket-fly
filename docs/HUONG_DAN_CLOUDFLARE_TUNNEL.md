# Cloudflare Tunnel — từng bước cho TV1 (khác Wi-Fi, miễn phí)

Cách này: **chỉ máy TV1** cài thêm một file. Sáu bạn kia **không cài gì mới**, chỉ dán một link `https://....trycloudflare.com` vào ô **Máy chủ nhóm**.

Không cần tài khoản Cloudflare. Không cần cùng Wi-Fi. Database vẫn nằm trên máy TV1.

## Test ZaloPay trên máy TV1 (IPN + app một lệnh)

`npm start` rồi mới mở `6_MO_DUONG_HAM_CLOUDFLARE.bat` **không đủ** cho ZaloPay:
file 6 chỉ tạo link, **không** ghi `PAYMENT_IPN_URL` / `PAYMENT_RETURN_URL`.
Node chỉ đọc `.env` lúc start (`loadEnv` trong `server/src/app.js`) — start trước rồi sửa `.env` thì API vẫn gửi URL cũ (hoặc trống).

**Một thao tác** (double-click hoặc gõ):

- `7_CHAY_APP_VA_TUNNEL_MOMO.bat`
- hoặc: `npm run start:zalopay` (cùng việc; `npm run start:tunnel` / `start:momo` cũng vậy)

Thứ tự script (đừng đảo):

1. Kiểm tra `cloudflared.exe` (thiếu thì in link tải, không chạy im).
2. Tắt **tunnel cũ của project này** nếu là zombie (chạy nhưng không có URL). Tunnel hệ thống / named tunnel khác thì **không** đụng.
3. Nếu tunnel project **còn sống và đã có URL** → dùng lại, không mở thêm.
4. Mở **cửa sổ tunnel**: `cloudflared tunnel --url http://localhost:3000` (timeout thì tự thử lại tối đa 4 lần).
5. Đợi in `https://….trycloudflare.com` (có thể 30–180 giây nếu Cloudflare chậm).
6. **Chỉ khi đã có URL và tunnel còn sống** mới ghi `server/.env` (không query string):
   - `PAYMENT_IPN_URL=https://XXXX/api/payments/gateway/ipn`
   - `PAYMENT_RETURN_URL=https://XXXX/api/payments/gateway/return`
7. **Mới** `npm start` (API + Electron)

Fail / timeout → **không ghi** URL hỏng vào `.env`. Không cần tắt-mở cửa sổ bán hàng.

Vẫn **hai cửa sổ**: tunnel phải sống suốt buổi; app chạy cửa sổ kia.
Tắt tunnel = link đổi = chạy lại file 7 (script ghi `.env` rồi start lại).

`npm start` / `2_CHAY_SUPERMARKET_FLY.bat` **không** bắt `cloudflared` — máy thành viên và test không ZaloPay giữ như cũ.

File `6_MO_DUONG_HAM_CLOUDFLARE.bat`: chỉ tunnel, khi TV1 đã mở file 4 cho nhóm test xa.

---

Hai cửa sổ phải mở suốt buổi test **nhóm** (không ZaloPay / chỉ share API):

```text
Cửa sổ 1:  4_CHAY_MAY_CHU_NHOM.bat     ← API + SQL (cổng 3000)
Cửa sổ 2:  6_MO_DUONG_HAM_CLOUDFLARE.bat  ← tạo link cho nhóm
```

Tắt một trong hai là cả nhóm mất kết nối. Tắt cửa sổ 2 thì **link đổi**, phải gửi link mới.

---

## Phần A — TV1 làm một lần (tải file, ~3 phút)

### A1. Tải cloudflared

1. Mở trình duyệt, vào đúng link này (bản Windows 64-bit mới nhất):

   https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe

2. File sẽ tải về, tên dài kiểu `cloudflared-windows-amd64.exe`.
3. Mở thư mục **Downloads** (Tải xuống).
4. Đổi tên file thành đúng: `cloudflared.exe`
   - Chuột phải file → Rename → gõ `cloudflared` (Windows tự giữ đuôi `.exe`).
5. **Cắt** file đó, **dán** vào thư mục dự án — cùng chỗ với `4_CHAY_MAY_CHU_NHOM.bat`:

   ```text
   D:\UDTHTKT\BTL\supermarket-fly\cloudflared.exe
   ```

   (Đường dẫn máy bạn có thể khác, miễn **cùng thư mục** với các file `.bat` là được.)

Nếu Windows hiện “Windows protected your PC”:

1. Bấm **More info**.
2. Bấm **Run anyway**.
   File này là chương trình chính thức của Cloudflare, không phải cài đặt MSI.

### A2. Kiểm tra file chạy được

Mở PowerShell, dán (sửa đường dẫn nếu khác):

```powershell
cd D:\UDTHTKT\BTL\supermarket-fly
.\cloudflared.exe --version
```

Thấy một dòng kiểu `cloudflared version 2026.x.x` là xong phần cài. Làm một lần, các buổi sau khỏi tải lại.

---

## Phần B — Mỗi buổi test (TV1, đúng thứ tự)

Làm **B1 rồi mới B2**. Đảo thứ tự thì không ra link.

### B1. Mở máy chủ (SQL + API)

1. Vào thư mục `supermarket-fly`.
2. Chuột phải `4_CHAY_MAY_CHU_NHOM.bat` → **Run as administrator**.
3. Đợi đến khi thấy roughly:

   ```text
   Server đang chạy tại http://localhost:3000
   ```

4. **Không đóng** cửa sổ này. Không cho máy ngủ (Cài đặt Windows → Power → Sleep = Never khi cắm sạc).

Muốn chắc API sống: trên máy TV1 mở trình duyệt, vào `http://localhost:3000/api/health`  
Phải thấy chữ `"status":"ok"`. Chưa thấy thì chưa làm B2.

### B2. Mở đường hầm Cloudflare

**Cách dễ:** nhấp đúp `6_MO_DUONG_HAM_CLOUDFLARE.bat` (cùng thư mục).

File này tự tìm `cloudflared.exe`, kiểm tra cổng 3000, rồi in link.

**Cách gõ tay** nếu không dùng file `.bat`:

```powershell
cd D:\UDTHTKT\BTL\supermarket-fly
.\cloudflared.exe tunnel --url http://localhost:3000
```

### B3. Lấy đúng dòng link

Đợi 5–30 giây (mạng chậm / Cloudflare quá tải có thể tới 1–2 phút). Trong cửa sổ sẽ có khung, **một dòng https** giống:

```text
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at:                                          |
|  https://names-random-here.trycloudflare.com                                               |
+--------------------------------------------------------------------------------------------+
```

Chỉ copy **một** URL, bắt đầu bằng `https://` và hết bằng `trycloudflare.com`.  
Không copy các dòng `INF`, không thêm `/api` phía sau.

Ví dụ đúng:

```text
https://alice-boxes-cookie-sweden.trycloudflare.com
```

Ví dụ sai:

```text
https://alice-boxes-cookie-sweden.trycloudflare.com/api
http://alice-boxes-cookie-sweden.trycloudflare.com
192.168.1.23
```

### B4. Gửi nhóm (copy nguyên khối)

```text
Khác wifi — dùng Cloudflare Tunnel.
Ô Máy chủ nhóm dán NGUYÊN dòng này (có https://):

https://<DÁN LINK VỪA COPY>.trycloudflare.com

Rồi bấm Kiểm tra (chữ xanh) → bấm vai trò của mình → Đăng nhập.

TV1 giữ 2 cửa sổ đen mở. Đừng tắt.
```

Mỗi lần tắt cửa sổ cloudflared / file 6, link **mất**. Mở lại sẽ ra link khác — gửi lại nhóm, thành viên dán link mới rồi Kiểm tra lại.

---

## Phần C — TV2 đến TV7 (tải dự án trước, không cài cloudflared)

Link `trycloudflare.com` **không phải** file cài app. Sáu bạn phải **tải dự án về máy trước**, cài một lần, rồi mới dán link đó vào ô Máy chủ nhóm.

### C0. Máy cần gì

- Windows 10/11
- **Node.js 22+** — https://nodejs.org (bản LTS). Cài xong **mở lại** máy hoặc mở CMD mới.
- **Không** cần SQL Server, SSMS, ODBC, file `.bak`

### C1. Tải dự án (một lần)

Cách không cần Git — gửi link ZIP này:

https://github.com/lowlyone03/BTL-supermarket-fly/archive/refs/heads/main.zip

1. Tải → giải nén (chuột phải → Extract All).
2. Đặt vào đường dẫn ngắn, không dấu, ví dụ `D:\SupermarketFly`.
3. Mở thư mục vừa giải nén. Phải thấy `1_CAI_DAT_LAN_DAU.bat`, `5_CHAY_MAY_THANH_VIEN.bat`, thư mục `server` và `desktop`.  
   Nếu thấy thêm một lớp thư mục `BTL-supermarket-fly-main` thì **vào trong đó**.

Cách dùng Git (nếu đã cài Git):

```powershell
git clone https://github.com/lowlyone03/BTL-supermarket-fly.git
cd BTL-supermarket-fly
```

### C2. Cài thư viện (một lần)

Nhấp đúp `1_CAI_DAT_LAN_DAU.bat`, đợi dòng `CAI DAT THANH CONG`.  
Lỗi thiếu Node: cài Node.js rồi chạy lại file này.

### C3. Mỗi buổi — sau khi TV1 đã gửi link https

1. Chạy `5_CHAY_MAY_THANH_VIEN.bat`. **Không** chạy file 2.
3. Ở màn đăng nhập, ô **Máy chủ nhóm**:
   - Xóa `localhost` nếu đang có.
   - Dán **nguyên** link TV1 gửi, gồm `https://`.
   - Bấm **Kiểm tra**.
4. Chữ xanh: `Kết nối được ....trycloudflare.com` → bấm nút vai trò (`admin` / `muahang` / …) → **Đăng nhập**.
5. Góc trái dưới sidebar phải có `Dữ liệu nhóm · ....trycloudflare.com`.

Tài khoản vẫn như cũ, mật khẩu `123`. Phân công TV2–TV7 xem `HUONG_DAN_TEST_DB_CHUNG.md`.

---

## Phần D — Tắt buổi test

1. Thành viên đóng app trước.
2. TV1: cửa sổ file 6 / cloudflared → `Ctrl+C`, rồi đóng.
3. TV1: cửa sổ file 4 → `Ctrl+C`, rồi đóng.

---

## Phần E — Lỗi thường gặp

| Bạn thấy gì | Nguyên nhân | Làm gì |
| --- | --- | --- |
| File 6 / file 7 báo không thấy `cloudflared.exe` | File chưa đổi tên hoặc để sai thư mục | Làm lại A1, để `cloudflared.exe` cạnh các file `.bat` |
| File 6 báo cổng 3000 chưa chạy | Chưa mở file 4, hoặc file 4 lỗi SQL | Mở file 4 trước, thử `http://localhost:3000/api/health` |
| Cửa sổ cloudflared chạy mãi không có `https://` | Mạng chậm / bị chặn | Đợi thêm. Tắt VPN. Chạy lại file 6 hoặc `npm run start:zalopay` |
| `failed to request quick Tunnel` / `context deadline exceeded` / `invalid UUID length` | Quick tunnel Cloudflare lỗi (timeout hoặc API trả rỗng). **Không phải lỗi app.** | Đợi 1–2 phút, chạy lại `npm run start:zalopay`. Script tự tắt tunnel cũ **của project**, thử 4 lần. **Không** cần tắt-mở Electron. Vẫn fail: phần F |
| `Cloudflared da tat truoc khi co URL` | Quick tunnel chết vì timeout, hoặc Windows chặn `.exe` | Đọc cửa sổ tunnel. Timeout → hàng trên. SmartScreen → More info → Run anyway |
| Script báo *Dung lai tunnel dang chay* | Còn cloudflared project sống **kèm URL** | Giữ cửa sổ tunnel. Không mở thêm file 6 |
| Thành viên bấm Kiểm tra ra chữ đỏ | Sai link; thiếu `https://`; TV1 đã tắt hầm; dán thêm `/api` | TV1 còn 2 cửa sổ không? Gửi lại đúng 1 dòng https. Thành viên xóa hết ô rồi dán lại |
| Kiểm tra xanh nhưng login lỗi | App cũ không hiểu https | `git pull` bản có ô Máy chủ nhóm; dán **cả** `https://...` |
| Vào được lúc đầu rồi đứt | Máy TV1 ngủ; wifi TV1 mất; đóng nhầm cửa sổ | TV1 tắt Sleep, mở lại file 4 rồi file 6, gửi **link mới** |
| Windows chặn `.exe` | SmartScreen | More info → Run anyway |
| QR ZaloPay không callback | Tunnel chết hoặc `.env` còn URL buổi trước | Chỉ `start:zalopay` mới ghi IPN. Timeout thì script **không** ghi URL hỏng |

---

## Phần F — Timeout trycloudflare (ZaloPay)

Quick tunnel `trycloudflare.com` **hay fail** từ mạng Việt Nam / Wi-Fi trường: timeout HTTPS tới `https://api.trycloudflare.com/tunnel`, hoặc API trả về rỗng (`invalid UUID length: 0`). SuperMarket Fly và ZaloPay sandbox vẫn ổn — chỉ webhook IPN/Telegram cần URL HTTPS công khai.

`npm run start:zalopay` / file 7:

1. Tắt cloudflared **của project này** (logfile `supermarket-fly-cloudflare-tunnel-*.log` hoặc `--url http://localhost:3000` dùng `cloudflared.exe` trong thư mục dự án). Không tắt named tunnel / Windows service của máy.
2. Tunnel cũ còn sống **và đã in URL** → dùng lại, ghi `.env`.
3. Zombie (chạy nhưng không có URL) → tắt rồi mở mới.
4. Timeout → thử lại tối đa 4 lần (nghỉ 5s, 10s, 20s).
5. Vẫn fail → **không ghi** URL vào `server/.env`. URL trycloudflare buổi trước đã chết.

**Không** khởi động lại cửa sổ bán hàng cho lỗi này.

Nếu thử lại vài lần vẫn timeout:

- Tắt VPN; thử mạng điện thoại (4G/5G) trên máy TV1.
- **Named Cloudflare Tunnel** (ổn định hơn; cần tài khoản Cloudflare **và** domain trỏ nameserver Cloudflare):

```powershell
cd D:\UDTHTKT\BTL\supermarket-fly
.\cloudflared.exe tunnel login
.\cloudflared.exe tunnel create supermarket-fly
.\cloudflared.exe tunnel route dns supermarket-fly zalopay.yourdomain.com
.\cloudflared.exe tunnel run supermarket-fly
```

Rồi ghi tay vào `server/.env` (HTTPS của domain bạn, không phải trycloudflare):

```text
PAYMENT_IPN_URL=https://zalopay.yourdomain.com/api/payments/gateway/ipn
PAYMENT_RETURN_URL=https://zalopay.yourdomain.com/api/payments/gateway/return
TELEGRAM_PUBLIC_BASE_URL=https://zalopay.yourdomain.com
TELEGRAM_WEBHOOK_URL=https://zalopay.yourdomain.com/api/telegram/webhook
```

sau đó `npm start` (không cần file 7). Giữ cửa sổ `tunnel run` mở.

- Không có domain: dùng **ngrok** (`HUONG_DAN_KHAC_WIFI.md` cách 3) rồi ghi cùng 3 biến `.env` với host ngrok.
- **Tailscale không thay** được cho ZaloPay IPN — máy chủ ZaloPay không gọi được IP `100.x`. Tailscale chỉ cho thành viên khác Wi-Fi vào API.

---

## Nhớ 4 điều

1. Test ZaloPay IPN trên máy TV1: file 7 / `npm run start:zalopay` (không dùng `npm start` + file 6).
2. Test nhóm xa (chỉ share API): file 4 trước, file 6 sau.
3. Copy đúng một dòng `https://....trycloudflare.com`. Hai cửa sổ mở suốt buổi.
4. Tắt hầm = link chết = chạy lại file 7 (ZaloPay) hoặc gửi link mới (nhóm).
