# Khác Wi-Fi vẫn test chung một database (miễn phí)

Cùng quán / cùng lab thì dùng IP `192.168...` như `HUONG_DAN_TEST_DB_CHUNG.md`.

**Mỗi người một nhà, wifi khác nhau** thì IP 192.168 **không dùng được** — số đó chỉ thấy trong mạng nhà đó.

Cách miễn phí, không cần thuê server:

| Cách | Ai phải cài | Ô *Máy chủ nhóm* điền gì | Nên chọn khi |
| --- | --- | --- | --- |
| **1. Tailscale** (khuyên dùng) | Cả 7 người, 5 phút/máy | IP `100.x.x.x` của TV1 | Muốn ổn định, giống wifi chung |
| **2. Cloudflare Tunnel** | Chỉ TV1 | Link `https://xxxx.trycloudflare.com` | Không muốn cả nhóm cài thêm app |
| **3. ngrok** (gói free) | Chỉ TV1 | Link `https://xxxx.ngrok-free.app` | Dự phòng; link free hay đổi mỗi lần mở |

Không mở cổng SQL Server ra Internet. Chỉ mở API cổng 3000 qua Tailscale hoặc đường hầm HTTPS.

---

## Cách 1 — Tailscale (nên dùng)

Tailscale tạo một “wifi ảo” miễn phí. Bảy máy ở bảy nhà vẫn thấy nhau như cùng mạng.  
Không cần biết router, không cần public IP.

### Bước A — Cả 7 người, mỗi máy một lần

1. Mở https://tailscale.com/download
2. Tải **Tailscale cho Windows**, cài, mở app.
3. Bấm **Log in** / **Sign in**. Chọn **Sign in with Google** (gmail trường / gmail riêng đều được) hoặc GitHub.
4. Máy đầu tiên (TV1) tạo sẵn mạng. Sáu người còn lại **phải được TV1 mời vào cùng một tài khoản/mạng**:
   - Cách đơn giản nhất cho nhóm bài tập: cả 7 đăng nhập **cùng một Google** mà nhóm thống nhất (ví dụ Gmail nhóm trưởng), **hoặc**
   - TV1 vào https://login.tailscale.com/admin/machines → **Users / Invite** mời Gmail của từng bạn (gói personal miễn phí đủ cho vài máy).
5. Sau khi đăng nhập, icon Tailscale ở khay hệ thống (gần giờ) phải **sáng / Connected**. Không tắt app này lúc test.

Nếu máy hỏi “Allow incoming connections”: chọn **Allow**.

### Bước B — Chỉ TV1

1. Giữ Tailscale **Connected**.
2. Chạy `4_CHAY_MAY_CHU_NHOM.bat` như bình thường (SQL + API vẫn trên máy TV1).
3. Lấy IP Tailscale của máy TV1, **không** lấy IP wifi nhà:
   - Cách 1: mở Tailscale → bấm tên máy mình → copy địa chỉ kiểu `100.x.x.x`
   - Cách 2: PowerShell:

```powershell
tailscale ip -4
```

Sẽ ra một dòng, ví dụ `100.101.23.45`.

4. Gửi vào nhóm **đúng số đó**:

```text
Khác wifi — dùng Tailscale.
IP Máy chủ nhóm: 100.101.23.45
Mọi người Tailscale phải Connected, rồi chạy 5_CHAY_MAY_THANH_VIEN.bat
Ô Máy chủ nhóm dán 100.101.23.45 → Kiểm tra → login đúng vai trò.
```

### Bước C — TV2 đến TV7

1. Tailscale Connected.
2. `5_CHAY_MAY_THANH_VIEN.bat` (đừng chạy file 2).
3. Ô **Máy chủ nhóm**: dán `100.x.x.x` của TV1 → **Kiểm tra** (chữ xanh).
4. Bấm vai trò → Đăng nhập.
5. Sidebar: `Dữ liệu nhóm · 100.x.x.x`.

Không dán IP `192.168...` khi đang ở nhà khác.

### Tailscale hay lỗi

| Hiện tượng | Làm gì |
| --- | --- |
| Kiểm tra đỏ | Bạn kia chưa Connected; TV1 chưa chạy file 4; dán nhầm IP wifi nhà |
| Máy không thấy nhau | Không cùng tailnet / chưa accept lời mời trên https://login.tailscale.com/admin |
| Windows chặn | TV1 chạy lại file 4 **Run as administrator** |
| IP 100 đổi | Hiếm. Lấy lại bằng `tailscale ip -4` rồi gửi lại nhóm |

Gói Personal miễn phí đủ 7 máy học tập.

---

## Cách 2 — Chỉ TV1 cài: Cloudflare Tunnel (free)

Sáu người kia **không** cài app thêm. TV1 mở một link `https://....trycloudflare.com`, gửi nhóm.

**Hướng dẫn từng nút (tải file, hai cửa sổ, copy link, lỗi thường gặp):**  
`HUONG_DAN_CLOUDFLARE_TUNNEL.md`

Tóm tắt: tải `cloudflared.exe` vào thư mục dự án → mở `4_CHAY_MAY_CHU_NHOM.bat` → mở `6_MO_DUONG_HAM_CLOUDFLARE.bat` → copy một dòng `https://....trycloudflare.com` → thành viên dán nguyên link vào ô Máy chủ nhóm.

---

## Cách 3 — ngrok free (dự phòng)

Giống Cloudflare: chỉ TV1 cài.

1. https://ngrok.com/download — tạo tài khoản free, lấy authtoken.
2. `ngrok config add-authtoken <token>`
3. File 4 đang chạy, rồi:

```bat
ngrok http 3000
```

4. Copy `https://xxxx.ngrok-free.app` gửi nhóm.

Lưu ý gói free: link đổi mỗi lần mở; có khi chậm; một số máy bị trang cảnh báo — bản app mới đã gửi kèm header bỏ cảnh báo. Nếu vẫn đỏ, đổi sang Tailscale hoặc Cloudflare.

---

## Chọn gì cho nhóm 7 người?

- **Nên Tailscale:** làm một lần, IP `100.x` dùng cả học kỳ, gần như không đổi.
- Chỉ muốn TV1 cực nhọc: Cloudflare Tunnel.
- Không đưa file `.bak` / SQL lên máy lạ trên mạng công cộng.

Phân công tài khoản TV1–TV7 vẫn như `HUONG_DAN_TEST_DB_CHUNG.md`.
