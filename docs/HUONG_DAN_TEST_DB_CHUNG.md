# Test chung một database — không phải đăng xuất đổi vai trò

Cách cũ (mỗi người một SQL Server trên máy mình) chỉ hợp khi test **lẻ từng màn**.  
Muốn test đúng quy trình cửa hàng thì **sáu người phải nhìn cùng một dữ liệu**, mỗi người **giữ một tài khoản và không thoát**.

Ví dụ luồng thật:

1. Thủ kho lập đề nghị.
2. Mua hàng lập đơn — vẫn thấy đề nghị vừa tạo.
3. Quản lý duyệt.
4. Thủ kho nhập kho.
5. Kế toán đối chiếu.
6. Thu ngân bán.

Nếu mỗi người một database riêng thì bước 2 không thấy dữ liệu bước 1.  
Nếu một người đăng nhập rồi đăng xuất để làm bước tiếp theo thì buổi test rối và không giống vận hành thật.

## Cách làm (một máy chủ nhóm)

```text
Máy chủ nhóm (1 người, thường là người phát triển)
  SQL Server Express  +  Node API cổng 3000  +  database SupermarketFlyDB

Máy thành viên (5–6 người, cùng Wi-Fi)
  Chỉ mở cửa sổ Electron
  Ô "Máy chủ nhóm" = IP máy chủ, ví dụ 192.168.1.10
```

Thành viên **không cần** cài SQL Server, SSMS, ODBC hay restore file `.bak`.

Hệ thống dùng JWT: nhiều người đăng nhập cùng lúc được. Không khóa phiên khi người khác vào.

## Việc máy chủ làm (một lần mỗi buổi)

1. Cài và chạy như cũ: `1_CAI_DAT_LAN_DAU.bat`, database `SupermarketFlyDB` đã có dữ liệu test.
2. Nhấp đúp `4_CHAY_MAY_CHU_NHOM.bat`.
3. Giữ cửa sổ đen mở. Gửi vào nhóm **một dòng IP** mà file in ra, ví dụ `192.168.1.23`.
4. Nếu thành viên bấm Kiểm tra mà lỗi: chuột phải file `.bat` → **Run as administrator** để mở cổng 3000, hoặc tự mở inbound TCP 3000 trên Windows Firewall.
5. Máy chủ và thành viên phải **cùng một Wi-Fi** (tránh Wi-Fi khách sạn/cô lập thiết bị).

Máy chủ muốn vừa host vừa test: mở thêm `2_CHAY_SUPERMARKET_FLY.bat` hoặc `5_CHAY_MAY_THANH_VIEN.bat`, để ô máy chủ là `localhost`.

## Việc thành viên làm

1. `git pull` bản mới (hoặc tải ZIP mới nhất từ GitHub).
2. Lần đầu: `1_CAI_DAT_LAN_DAU.bat`.
3. Mỗi lần test: `5_CHAY_MAY_THANH_VIEN.bat` — **không** chạy `2_CHAY_SUPERMARKET_FLY.bat` (file đó mở API local, dễ nhầm sang database máy mình).
4. Ở màn đăng nhập:
   - Nhập IP máy chủ vào **Máy chủ nhóm**.
   - Bấm **Kiểm tra** đến khi thấy “Kết nối được”.
   - Bấm nút vai trò của mình (mật khẩu `123`) rồi **Đăng nhập**.
5. Để nguyên cửa sổ. Việc của người trước xong sẽ hiện ở chuông thông báo / danh sách chứng từ.

Góc trái dưới sidebar hiện `Dữ liệu nhóm · 192.168.x.x` là đang đúng máy chủ chung.  
Nếu hiện `Dữ liệu: máy này` thì đang test local, không thấy việc của người khác.

## Phân công tài khoản — mỗi người một vai, không nhảy

| Người | Tài khoản | Việc giữ trên máy mình |
| --- | --- | --- |
| 1 | `admin` | Duyệt đơn, phân ca, sản phẩm, giao quỹ |
| 2 | `muahang` | NCC, lập đơn, theo dõi giao |
| 3 | `thukho` | Đề nghị, nhận hàng, nhập/xuất, kiểm kê |
| 4 | `thungan` (hoặc `thungan02`… nếu trùng ca) | Check-in, POS, đóng ca |
| 5 | `ketoan` | Đối chiếu, công nợ, phiếu thu, lương |
| 6 | Lần lượt các tài khoản **trên cùng máy chủ**, chỉ khi cần kiểm tra chéo menu/báo cáo | Không sửa chứng từ đang có người làm |

Mật khẩu mẫu: `123`.

Người 6 nếu phải đổi vai trò: bấm **Đổi tài khoản** (nút cũ Đăng xuất), chọn chip vai trò khác, đăng nhập lại. Không cần tắt app.

## Quy ước để sáu người không đụng nhau

- Dữ liệu mới: tiền tố `TEST-<TÊN>-<YYYYMMDD>`.
- Không xóa / không “sửa hộ” chứng từ của người khác.
- Không đổi mật khẩu tài khoản mẫu giữa buổi.
- Thu ngân: mỗi người một tài khoản `thungan` / `thungan02`… vì một ca gắn một người.
- Nếu kẹt vì thiếu tiền điều kiện (chưa có lịch ca, chưa có đơn): nhắn đúng người phụ trách bước trước, **không** tự đăng nhập hộ trừ khi người đó vắng.

## Khi nào vẫn dùng database riêng

Giữ cách cũ (restore `.bak` trên từng máy, chạy `2_CHAY_SUPERMARKET_FLY.bat`) khi:

- Chỉ smoke test một màn, không cần chuỗi liên vai trò.
- Không ngồi cùng mạng.
- Cần thử xóa/sửa dữ liệu mà không làm hỏng buổi test chung.

Hai cách **không trộn** trong cùng một buổi: hoặc cả nhóm vào máy chủ, hoặc mỗi người máy riêng.

## Sự cố thường gặp

| Hiện tượng | Xử lý |
| --- | --- |
| Kiểm tra máy chủ thất bại | Máy chủ đã chạy `4_...bat`? Cùng Wi-Fi? IP đúng? Firewall cổng 3000? |
| Đăng nhập được nhưng dữ liệu khác người khác | Ô máy chủ đang `localhost` — nhập lại IP nhóm, kiểm tra, đăng nhập lại |
| Thành viên chạy `2_CHAY_...` rồi không thấy việc của nhóm | Đóng app, chạy `5_CHAY_MAY_THANH_VIEN.bat` |
| Thu ngân không vào POS | Quản lý phải công bố lịch **hôm nay** và đúng giờ ca |
| Hai người sửa cùng một đơn | Thống nhất người giữ chứng từ; người kia chờ chuông |
