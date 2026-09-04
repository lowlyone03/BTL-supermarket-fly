# Cloudflare Tunnel — từng bước cho TV1 (khác Wi-Fi, miễn phí)

Cách này: **chỉ máy TV1** cài thêm một file. Sáu bạn kia **không cài gì mới**, chỉ dán một link `https://....trycloudflare.com` vào ô **Máy chủ nhóm**.

Không cần tài khoản Cloudflare. Không cần cùng Wi-Fi. Database vẫn nằm trên máy TV1.

Hai cửa sổ phải mở suốt buổi test:

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

Đợi 5–15 giây. Trong cửa sổ sẽ có khung, **một dòng https** giống:

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
| File 6 báo không thấy `cloudflared.exe` | File chưa đổi tên hoặc để sai thư mục | Làm lại A1, để `cloudflared.exe` cạnh các file `.bat` |
| File 6 báo cổng 3000 chưa chạy | Chưa mở file 4, hoặc file 4 lỗi SQL | Mở file 4 trước, thử `http://localhost:3000/api/health` |
| Cửa sổ cloudflared chạy mãi không có `https://` | Mạng chậm / bị chặn | Đợi 30 giây. Thử tắt VPN máy TV1. Chạy lại file 6 |
| Thành viên bấm Kiểm tra ra chữ đỏ | Sai link; thiếu `https://`; TV1 đã tắt hầm; dán thêm `/api` | TV1 còn 2 cửa sổ không? Gửi lại đúng 1 dòng https. Thành viên xóa hết ô rồi dán lại |
| Kiểm tra xanh nhưng login lỗi | App cũ không hiểu https | `git pull` bản có ô Máy chủ nhóm; dán **cả** `https://...` |
| Vào được lúc đầu rồi đứt | Máy TV1 ngủ; wifi TV1 mất; đóng nhầm cửa sổ | TV1 tắt Sleep, mở lại file 4 rồi file 6, gửi **link mới** |
| Windows chặn `.exe` | SmartScreen | More info → Run anyway |
| Link rất dài / có chữ `failed to request quick Tunnel` | Cloudflare quá tải hoặc mạng trường chặn | Đợi 1 phút chạy lại. Nếu vẫn fail: dùng Tailscale (`HUONG_DAN_KHAC_WIFI.md`) |

---

## Nhớ 4 điều

1. File 4 trước, file 6 sau.
2. Copy đúng một dòng `https://....trycloudflare.com`.
3. Hai cửa sổ đen mở suốt buổi.
4. Tắt hầm = link chết = gửi link mới.
