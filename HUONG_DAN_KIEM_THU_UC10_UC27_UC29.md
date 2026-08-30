# Hướng dẫn kiểm thử nghiệp vụ — lãi gộp, UC27, UC10, UC29

Tài liệu này dùng để test phần vừa hoàn thiện. Mật khẩu dữ liệu mẫu: `123`. Hệ thống chốt **12 nhân viên**.

## 1. Phạm vi vừa chốt

Hai lỗi nghiệp vụ đã được sửa trong code:

1. **Lãi gộp trên màn hình ca** không còn là `Doanh thu hóa đơn − Giá vốn hóa đơn`. Công thức đúng theo Chương 6 trang 33–34:
   - Doanh thu thuần = Doanh thu hóa đơn hoàn thành − Tiền hoàn của phiếu đổi trả hoàn thành
   - Giá vốn thuần = Giá vốn hóa đơn − Giá vốn hàng trả được nhập lại kho + Giá vốn hàng giao đổi
   - Lợi nhuận gộp = Doanh thu thuần − Giá vốn thuần
2. **UC27 đối chiếu ba chứng từ** kiểm tra đủ sản phẩm, số lượng, đơn giá Đơn mua / Phiếu nhập / Hóa đơn, thuế suất, tiền thuế và tổng cộng. Chỉ khi toàn bộ khớp mới ghi nhận công nợ.

Cùng kỳ, Kế toán (UC29) và Quản lý (UC10) dùng chung một API báo cáo.

## 2. Chạy kiểm thử tự động trước khi test tay

```powershell
cd D:\UDTHTKT\BTL\supermarket-fly
npm run test:next
```

Chỉ công thức / đối chiếu / kỳ báo cáo:

```powershell
cd D:\UDTHTKT\BTL\supermarket-fly\server
npm run test:business
```

Kết quả đúng: **16 dòng** `✓` và dòng `Tất cả kiểm thử quy tắc nghiệp vụ đã đạt.`

Không cần `setup:next` khi chỉ test phần này. Nếu danh sách nhân viên lệch 12 người thì chạy `npm run setup:next` từ thư mục `supermarket-fly`.

## 3. Tài khoản test (12 nhân viên)

| Vai trò | Số người | Tài khoản | Mã NV |
|---|---|---|---|
| Quản lý cửa hàng | 1 | `admin` | NV_QL01 |
| Nhân viên mua hàng | 1 | `muahang` | NV_MH01 |
| Thủ kho | 1 | `thukho` | NV_TK01 |
| Thu ngân | 8 | `thungan` … `thungan08` | NV_TN01 … NV_TN08 |
| Kế toán | 1 | `ketoan` | NV_KT01 |

Thu ngân phải đăng nhập đúng người đang được phân ca hôm nay. Kiểm tra **Quản lý nhân viên** phải đúng 12 người; không còn `thungan09`.

## 4. Test lãi gộp trên màn hình ca (Thu ngân)

Mở **Ca bán hàng**. Dưới các ô quỹ/tiền mặt phải thấy 3 dòng công thức.

### LG-01 — Không có đổi trả

1. Chấm công vào, mở ca, bán 1 hóa đơn hoàn thành.
2. Làm mới **Ca bán hàng**.

Kỳ vọng:

```text
Doanh thu thuần = Doanh thu hóa đơn
Giá vốn thuần   = Giá vốn hóa đơn
Lãi gộp         = Doanh thu thuần − Giá vốn thuần
Tiền hoàn = 0, GV hàng trả nhập lại = 0, GV hàng giao đổi = 0
```

### LG-02 — Hoàn tiền, hàng được nhập lại kho

1. Lập Phiếu đổi trả từ hóa đơn trong ca, hình thức hoàn tiền.
2. Thủ kho tick **Hàng đạt yêu cầu, được nhập lại kho**.
3. Quản lý duyệt; Thu ngân hoàn tất hoàn tiền.
4. Làm mới **Ca bán hàng**.

Kỳ vọng:

- Doanh thu thuần giảm đúng số tiền hoàn.
- Giá vốn thuần giảm đúng giá vốn hàng trả được nhập lại.
- Tiền mặt trong két chỉ giảm nếu phương thức hoàn là Tiền mặt.

Ví dụ nhỏ: DT 1.000.000, hoàn 200.000, GV hóa đơn 600.000, GV nhập lại 120.000 → DT thuần 800.000, GV thuần 480.000, lãi gộp 320.000.

Ví dụ Chương 6: DT 100.000.000, hoàn 5.000.000, GV 75.000.000, GV nhập lại 4.000.000 → DT thuần 95.000.000, GV thuần 71.000.000, lãi gộp 24.000.000.

### LG-03 — Hàng trả không đạt, không nhập lại kho

Lặp LG-02 nhưng Thủ kho **bỏ tick** nhập lại kho.

Kỳ vọng: doanh thu thuần vẫn giảm theo tiền hoàn; **giá vốn thuần không giảm**.

### LG-04 — Đổi hàng ngang giá có giao sản phẩm thay thế

1. Lập phiếu đổi hàng, Thủ kho kiểm tra, Quản lý duyệt.
2. Thu ngân chọn hàng giao đổi và hoàn tất.
3. Làm mới màn hình ca.

Kỳ vọng: giá vốn hàng giao đổi được **cộng** vào giá vốn thuần. Nếu không hoàn tiền thì doanh thu thuần không giảm.

### LG-05 — Chặn đổi trực tiếp khác giá

1. Lập và duyệt một phiếu **Đổi hàng** như LG-04.
2. Chọn hàng giao đổi có tổng giá bán khác tổng giá trị hàng khách trả.

Kỳ vọng:

- Nút **Hoàn tất đổi hàng** bị khóa ngay trên giao diện.
- Hệ thống hướng dẫn hoàn hàng cũ rồi lập hóa đơn bán mới.
- Nếu cố gọi API trực tiếp, backend vẫn từ chối; không thêm chi tiết hàng giao đổi và không tăng/giảm tồn kho.
- Chọn lại hàng có tổng giá trị ngang giá thì nút được mở và có thể hoàn tất.

## 5. Test UC27 — đối chiếu ba chứng từ (Kế toán)

Luồng: Đơn mua đã duyệt → Phiếu nhập đã xác nhận → Tiếp nhận hóa đơn (chỉ lưu, **chưa** tạo công nợ) → bấm **Đối chiếu** → xem bảng → xác nhận.

### DC-01 — Khớp hoàn toàn

Nhập cùng sản phẩm, số lượng, đơn giá; thuế suất ví dụ 8%.

Bảng xem trước phải có: SL đặt / thực nhận / hóa đơn; giá Đơn mua / Phiếu nhập / Hóa đơn; thuế suất, tiền thuế lưu và tiền thuế tính lại; tiền hàng Phiếu nhập, tiền hàng Hóa đơn, tổng thuế, tổng cộng.

Kỳ vọng: **Ba chứng từ, thuế và tổng tiền đều khớp**; nút xác nhận bật; xác nhận xong mới có mã công nợ.

### DC-02 — Lệch số lượng

Số lượng hóa đơn khác số thực nhận. Nút ghi nhận công nợ bị khóa.

### DC-03 — Lệch giá bất kỳ chứng từ nào

Đơn giá Phiếu nhập khác Đơn mua, hoặc giá hóa đơn khác. Hệ thống nêu rõ cặp bị lệch, không tạo công nợ.

### DC-04 — Thuế và tổng tiền

```text
Tiền thuế dòng     = Số lượng × Đơn giá × Thuế suất / 100
Tổng tiền hàng     = Tổng tiền hàng các dòng
Tổng tiền thuế     = Tổng tiền thuế các dòng
Tổng cộng          = Tổng tiền hàng + Tổng tiền thuế
Tổng tiền hàng HĐ  = Tổng Phiếu nhập trước thuế (chỉ SoLuongChapNhan)
```

UI tự tính đúng khi nhập. Trường hợp sửa sai trực tiếp trong CSDL được `npm run test:business` chặn tạo công nợ.

### DC-05 — Lưu hóa đơn chưa đối chiếu

Bấm **Lưu hóa đơn** xong trạng thái phải là **Chờ đối chiếu**, cột công nợ **Chưa phát sinh**.

## 6. Test báo cáo UC29 và UC10

### BC-01 — Kế toán (`ketoan`) → Báo cáo nội bộ

Chọn Ngày / Tháng / Quý / Năm → **Lập báo cáo**.

Phải thấy: 3 bước công thức lãi gộp; mua hàng và thuế đầu vào; tồn đầu/cuối kỳ; công nợ, Phiếu thu, Phiếu chi; bảng theo ngày.

### BC-02 — Quản lý (`admin`) → Báo cáo

Cùng kỳ với BC-01. Số liệu phải bằng báo cáo Kế toán. Quản lý chỉ xem/xuất, không sửa chứng từ.

### BC-03 — Bản in/PDF và CSV

**Xem bản in / PDF** phải có dải thương hiệu, kỳ báo cáo, bốn KPI, biểu đồ SVG, bảng chi tiết và khu vực ký. **Xuất CSV** mở được bằng Excel, tiếng Việt đúng.

## 7. Các chức năng liên quan nên test kèm

Lãi gộp và UC27 phụ thuộc các luồng dưới đây. Nếu bước nào gãy thì số lãi gộp / đối chiếu sẽ sai theo.

| Mã | Chức năng | Ai test | Việc cần làm |
|---|---|---|---|
| UC22 | Mở/đóng ca | Thu ngân | Mở ca cá nhân, đóng ca, tiền mặt hệ thống = TM thành công − hoàn TM |
| UC24–UC25 | Bán hàng | Thu ngân | Hóa đơn nháp → thanh toán đủ → Hoàn thành, trừ tồn, lưu giá vốn |
| UC26 + UC21 + UC08 | Đổi trả | Thu ngân / Thủ kho / Quản lý | Lập phiếu → kiểm tra hàng → duyệt → hoàn tất |
| UC13 + UC05 | Đơn mua | Mua hàng / Quản lý | Lập PO, hạn 30–45 ngày, Quản lý duyệt |
| UC17–UC18 | Nhập kho | Thủ kho | Ghi SL giao / chấp nhận / từ chối; chỉ SL chấp nhận cộng tồn |
| UC27 | Đối chiếu | Kế toán | Như mục 5 |
| UC28 + UC09 | Công nợ / Phiếu chi | Kế toán / Quản lý | Một Phiếu chi / một công nợ; duyệt chưa giảm nợ; thanh toán thành công mới tất toán |
| UC29 | Phiếu thu ca | Kế toán | Lập phiếu, ghi chênh lệch trên phiếu, xác nhận |
| UC10 | Báo cáo quản trị | Quản lý | Cùng số liệu UC29 |

## 8. Test dashboard biểu đồ của 5 actor

Sau khi đăng nhập từng vai trò, mở mục **Báo cáo** và chọn tháng 08/2026.

Mỗi trang phải có cùng nhịp bố cục: **6 KPI → 3 biểu đồ → 3 khối bảng/cảnh báo**. Phần dữ liệu đối soát sâu nằm trong mục mở rộng ở cuối trang.

| Actor | 3 biểu đồ chính phải hiển thị | 3 khối chi tiết phải hiển thị | Điểm cần kiểm tra |
|---|---|---|---|
| Quản lý | Doanh thu–lãi gộp theo ngày; doanh thu theo danh mục; cơ cấu doanh thu | Sản phẩm đóng góp; tồn theo danh mục; cảnh báo vận hành | Tổng doanh thu danh mục lấy từ dòng hóa đơn; tiền hoàn chưa đủ chi tiết theo danh mục không được phân bổ giả |
| Kế toán | Doanh thu–giá vốn–lãi gộp; phiếu thu–đã chi; tuổi công nợ | Công nợ cần theo dõi; trạng thái đối chiếu ba chứng từ; cảnh báo tài chính | Công thức ba bước, thuế/tổng tiền UC27 và tổng biểu đồ phải khớp dữ liệu chi tiết |
| Mua hàng | Giá trị mua theo ngày; giá trị theo Nhà cung cấp; cơ cấu mua theo danh mục | Top Nhà cung cấp; đơn cần xử lý; cảnh báo giao hàng | Không tính đơn Nháp/Từ chối vào xu hướng hợp lệ; tỷ lệ đúng hạn chỉ tính đơn đã hoàn tất |
| Thủ kho | Nhập–xuất–tồn cuối ngày; tồn theo danh mục; tỷ trọng giá trị tồn | Hàng cần bổ sung; chứng từ gần đây; cảnh báo kho | Mức thiếu bằng `Tồn tối thiểu − Tồn hiện tại`; tồn cuối ngày được dựng từ sổ giao dịch và tồn hiện tại |
| Thu ngân | Doanh thu cá nhân theo ngày; cơ cấu thanh toán; sản phẩm bán chạy | Ca cá nhân; hóa đơn gần đây; cảnh báo ca/bán hàng | Chỉ hiện dữ liệu của tài khoản đang đăng nhập; doanh thu thuần đã trừ tiền hoàn của người đó |

Kiểm tra chung:

1. Rê chuột hoặc dùng phím Tab vào điểm/cột/vành biểu đồ: phải thấy tooltip số liệu.
2. Đổi Ngày/Tháng/Quý/Năm rồi bấm **Lập báo cáo**: biểu đồ và bảng cập nhật cùng lúc.
3. Kỳ không có dữ liệu phải hiện thông báo rỗng, không vẽ số giả.
4. Thử độ phân giải 1920×1080 và 1366×768, zoom 100%/125%: không tràn ngang trang; KPI tự chuyển 6→3→2→1 cột và biểu đồ/bảng tự chuyển 3→2→1 cột.
5. CSV/PDF vẫn xuất từ số liệu gốc; biểu đồ chỉ hỗ trợ phân tích trên màn hình, không thay thế bảng đối soát.
6. Toàn bộ khung, nút và trạng thái chính dùng xanh Supermarket Fly; đỏ chỉ dành cho lệch/quá hạn, vàng dành cho chờ xử lý.
7. Icon KPI và cảnh báo phải nằm giữa khung 32–36 px, không lệch lên/xuống khi tiêu đề dài hai dòng.
8. Khi bảng có nhiều cột, chỉ khối bảng được cuộn ngang; sidebar và toàn trang không xuất hiện thanh cuộn ngang.

## 9. Test bản in/PDF của 5 actor

Đăng nhập lần lượt năm vai trò và mở báo cáo tháng 08/2026. Bấm **Xem bản in / PDF**.

| Actor | Nội dung bản in |
|---|---|
| Quản lý | KPI doanh thu, lãi gộp, thu/chi; biểu đồ doanh thu–lãi; bảng theo ngày |
| Kế toán | KPI doanh thu, giá vốn, lãi gộp, công nợ; biểu đồ ba chuỗi; bảng tài chính theo ngày |
| Mua hàng | KPI đơn mua, giá trị, Phiếu nhập, số lượng thiếu; biểu đồ giá trị đơn; bảng Nhà cung cấp |
| Thủ kho | KPI nhập, xuất, tồn, giá trị tồn; biểu đồ biến động kho; bảng hàng dưới tồn tối thiểu |
| Thu ngân | KPI doanh thu cá nhân, hóa đơn, hoàn tiền, tiền mặt; biểu đồ doanh thu; bảng ca cá nhân |

Kiểm tra chung:

1. Nút trên preview phải ghi **In / Lưu PDF**, không còn ghi “In chứng từ”.
2. Bản in không xuất hiện chữ `undefined`, `NaN`, cột tràn khỏi A4 hoặc nội dung đè nhau.
3. Mẫu Thu ngân dùng A4 ngang để bảng ca không bị ép cột; các mẫu còn lại dùng A4 dọc.
4. Trong hộp thoại in của hệ điều hành, bật **Background graphics/Đồ họa nền** để giữ dải màu thương hiệu.
5. Lưu PDF rồi mở lại: biểu đồ, tiếng Việt, số tiền và bảng phải rõ nét.
6. `npm run test:next` phải có dòng `PRINT REPORT PASS`.

## 10. Tiêu chí nghiệm thu

- Không đổi trả: lãi gộp = doanh thu hóa đơn − giá vốn hóa đơn.
- Có hoàn tiền / đổi hàng: lãi gộp đổi cả doanh thu thuần và giá vốn thuần đúng công thức trang 33.
- Hàng không nhập lại kho: không trừ giá vốn.
- UC27 chỉ tạo công nợ khi sản phẩm, số lượng, ba mức giá, thuế và tổng tiền đều khớp.
- Lưu hóa đơn chưa đối chiếu thì chưa có công nợ.
- UC10 và UC29 cùng kỳ ra cùng số.
- Quản lý nhân viên đúng **12** người.
- Đổi trực tiếp khác giá bị chặn cả giao diện lẫn backend; tồn kho không thay đổi.
- `npm run test:business` đạt 16 kiểm thử.
- Bản in/PDF đủ cho cả 5 actor và `npm run test:print-report` đạt.
