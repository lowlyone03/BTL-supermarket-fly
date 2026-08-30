# Kế hoạch dữ liệu và giao diện báo cáo 5 actor

## 1. Nguyên tắc thiết kế

- Dùng bố cục thống nhất: **bộ lọc kỳ báo cáo → 6 KPI → 3 biểu đồ → 3 bảng/cảnh báo → chi tiết mở rộng**.
- Giữ nhận diện Supermarket Fly: xanh lá đậm, xanh bạc hà, nền kem sáng; màu vàng/đỏ/xanh dương chỉ dùng để phân biệt chuỗi dữ liệu và mức cảnh báo.
- Chỉ hiển thị số lấy được từ chứng từ thật trong cơ sở dữ liệu. Không tạo số mẫu để làm đẹp giao diện.
- Chỉ số chưa có dữ liệu trả về trạng thái trống rõ ràng, không tự đổi thành số ước tính.
- Không gọi “lợi nhuận ròng” vì hệ thống chưa quản lý đủ lương, điện nước, thuê mặt bằng và toàn bộ chi phí vận hành. Chỉ dùng **lãi gộp**.
- Mỗi báo cáo phục vụ quyết định của đúng actor; dữ liệu chi tiết được đặt sau biểu đồ hoặc trong phần mở rộng để màn hình đầu không bị thô và quá dài.

## 2. Ma trận dữ liệu đang dùng

| Actor | KPI đang dùng | Biểu đồ đang dùng | Bảng/cảnh báo đang dùng | Nguồn nghiệp vụ |
|---|---|---|---|---|
| Quản lý cửa hàng – UC10 | Doanh thu thuần, lãi gộp, hóa đơn hoàn thành, giá trị tồn, công nợ NCC, số mặt hàng tồn thấp | Doanh thu–lãi gộp theo ngày, doanh thu theo danh mục, cơ cấu doanh thu | Sản phẩm đóng góp doanh thu, tồn theo danh mục, cảnh báo vận hành | Hóa đơn bán, đổi trả hoàn thành, phiếu nhập/xuất, tồn kho, công nợ, ca bán |
| Nhân viên mua hàng | Giá trị mua, đơn hợp lệ, NCC hợp tác, đơn chờ duyệt, đơn giao trễ, tỷ lệ đúng hạn | Giá trị mua theo ngày, giá trị theo NCC, cơ cấu mua theo danh mục | NCC theo giá trị, đơn cần xử lý, cảnh báo giao thiếu/giao trễ | Đơn mua, chi tiết đơn mua, NCC, phiếu nhập, hóa đơn mua |
| Thủ kho | Giá trị tồn, mặt hàng tồn thấp, phiếu nhập, phiếu xuất, đợt kiểm kê, giá trị chênh lệch | Nhập–xuất–tồn theo ngày, tồn theo danh mục, tỷ trọng giá trị tồn | Sản phẩm cần bổ sung, chứng từ gần đây, cảnh báo chờ duyệt/chênh lệch | Sản phẩm, danh mục, phiếu nhập/xuất, chi tiết phiếu, kiểm kê, lịch sử kho |
| Thu ngân – UC22 | Doanh thu thuần, số hóa đơn, giá trị đơn trung bình, tiền mặt, thanh toán điện tử, tiền hoàn | Doanh thu theo ngày, cơ cấu thanh toán, sản phẩm bán chạy | Ca bán, hóa đơn gần đây, cảnh báo hóa đơn/đổi trả/ca chờ đối soát | Ca bán, hóa đơn, chi tiết hóa đơn, thanh toán, phiếu đổi trả |
| Kế toán – UC27/UC29 | Doanh thu thuần, tiền thu thực nộp, phiếu chi thành công, công nợ NCC, nợ quá hạn, chênh lệch bàn giao | Doanh thu–giá vốn–lãi gộp, phiếu thu–phiếu chi, tuổi nợ | Công nợ cần theo dõi, trạng thái đối chiếu ba chứng từ, cảnh báo tài chính | Hóa đơn bán/mua, đổi trả, ca bán, phiếu thu/chi, công nợ, phiếu nhập, đơn mua |

## 3. Công thức bắt buộc

### 3.1. Doanh thu thuần

```text
Doanh thu thuần
= Tổng tiền hóa đơn bán hoàn thành
- Tổng tiền hoàn của phiếu đổi trả hoàn thành
```

### 3.2. Giá vốn thuần

```text
Giá vốn thuần
= Giá vốn hàng đã bán
- Giá vốn hàng khách trả và nhập lại kho
+ Giá vốn hàng giao thay thế khi đổi ngang giá
```

### 3.3. Lãi gộp

```text
Lãi gộp = Doanh thu thuần - Giá vốn thuần
```

### 3.4. Đối chiếu ba chứng từ – UC27

Đơn mua, phiếu nhập và hóa đơn mua phải đối chiếu đủ:

1. Sản phẩm.
2. Số lượng.
3. Đơn giá.
4. Thuế suất.
5. Tiền thuế.
6. Tổng cộng.

Chỉ chứng từ khớp đầy đủ mới được ghi nhận là `Đã khớp`; sai bất kỳ trường nào phải ghi trạng thái lệch và chỉ ra lý do.

## 4. Trường giữ chỗ cho dữ liệu có thể phát sinh sau này

Các trường dưới đây có giá trị nghiệp vụ nhưng **chưa được hiển thị như số chính thức** cho tới khi đủ dữ liệu nguồn.

| Trường tương lai | Vì sao chưa dùng ngay | Dữ liệu cần bổ sung | Điều kiện bật giao diện | Kiểm thử bắt buộc |
|---|---|---|---|---|
| So sánh tăng/giảm với kỳ trước | API hiện tập trung kỳ đang chọn; so sánh thiếu nền kỳ trước có thể gây hiểu sai | Cùng tập chỉ số của kỳ trước và quy tắc so sánh ngày/tháng/quý/năm | Cả kỳ hiện tại và kỳ so sánh đều đầy đủ | Kỳ trước bằng 0, kỳ không đủ ngày, năm nhuận, đổi múi giờ |
| Doanh thu thu ngân theo giờ | Hiện báo cáo chuẩn theo ngày/ca | Nhóm hóa đơn theo giờ lập và ca; lọc đúng nhân viên đăng nhập | Có đủ thời gian hóa đơn và định nghĩa khung giờ của ca | Hóa đơn qua nửa đêm, ca đêm, hóa đơn hủy/nháp |
| SLA và điểm chất lượng NCC | Số ngày giao thực tế chưa phản ánh đầy đủ chất lượng hàng | Ngày hẹn, ngày nhận hoàn tất, tỷ lệ giao đủ, kết quả kiểm hàng, lịch sử vi phạm | Có lịch sử tối thiểu theo quy định đánh giá NCC | Giao nhiều đợt, giao thiếu, trả NCC, đơn hủy |
| Tồn theo lô, hạn dùng và FEFO | Có số lô/hạn dùng ở chứng từ nhập nhưng tồn hiện tại chưa được hạch toán đầy đủ theo từng lô | Sổ tồn theo lô cho mọi nhập/xuất/đổi trả/điều chỉnh | Tổng tồn theo lô khớp tuyệt đối với tồn sản phẩm | Xuất nhiều lô, hàng hết hạn, đổi trả vào đúng lô, điều chỉnh kiểm kê |
| Thanh toán điện tử đã quyết toán | Hệ thống có phương thức thanh toán nhưng chưa có dữ liệu đối soát ngân hàng/cổng QR | Tệp hoặc API sao kê, mã giao dịch cổng thanh toán, trạng thái quyết toán | Giao dịch nội bộ khớp với bản ghi ngân hàng | Trùng mã, hoàn tiền, phí cổng, giao dịch treo |
| Lãi gộp theo danh mục sau hoàn/đổi | Tiền hoàn đang tổng hợp toàn kỳ; phân bổ sai sẽ làm biểu đồ danh mục sai | Chi tiết dòng hàng trả, hàng nhập lại và hàng giao đổi theo danh mục | Mọi phiếu đổi trả có đủ chi tiết và giá vốn lịch sử | Trả một phần, đổi nhiều sản phẩm, chênh lệch giá, không nhập lại kho |
| Giá trị tồn lịch sử chính xác từng ngày | Tồn cuối ngày hiện được dựng từ tồn hiện tại và luồng nhập/xuất trong kỳ | Nhật ký tồn bất biến hoặc snapshot cuối ngày | Snapshot/nghiệp vụ kho phủ đủ toàn kỳ | Chứng từ ghi lùi ngày, sửa/hủy chứng từ, kiểm kê điều chỉnh |
| Báo cáo nhiều chi nhánh | Phạm vi hiện tại chỉ có một cửa hàng và một kho logic | Mã chi nhánh trên toàn bộ chứng từ, nhân viên, kho và cấu hình quyền | Không có chứng từ thiếu mã chi nhánh | Chuyển kho, nhân viên nhiều chi nhánh, phân quyền dữ liệu |

## 5. Các chỉ số chủ động loại bỏ

- Lợi nhuận ròng, EBITDA hoặc chi phí vận hành đầy đủ: chưa có đủ nguồn chi phí.
- Công nợ khách hàng: ngoài phạm vi đã chốt; hệ thống chỉ theo dõi công nợ nhà cung cấp.
- Thanh toán công nợ từng phần: tài liệu chốt không hỗ trợ thanh toán một phần.
- So sánh nhiều cửa hàng/kho: dự án hiện chỉ có một cửa hàng và một kho logic.
- Dự báo doanh thu bằng AI: không phải yêu cầu nghiệp vụ và chưa có đủ lịch sử để kiểm chứng.

## 6. Quy trình đưa một trường giữ chỗ vào sử dụng

1. Chốt định nghĩa nghiệp vụ, công thức, trạng thái loại trừ và người chịu trách nhiệm xác nhận.
2. Bổ sung trường dữ liệu hoặc nhật ký nghiệp vụ; không tính ngược từ số tổng nếu mất dấu vết chứng từ.
3. Viết truy vấn/API trả cả giá trị và thông tin về độ đầy đủ dữ liệu.
4. Thêm kiểm thử mức công thức, kiểm thử API và bộ ca biên.
5. Đối chiếu thủ công tối thiểu một kỳ có đủ chứng từ.
6. Chỉ bật KPI/biểu đồ khi dữ liệu đạt điều kiện hoàn chỉnh; nếu chưa đạt thì dùng trạng thái trống có giải thích.
7. Ghi công thức và tài khoản test vào hướng dẫn kiểm thử để người dùng có thể tự kiểm chứng.

## 7. Tiêu chí nghiệm thu giao diện

- Màn hình desktop hiển thị đủ 6 KPI trên một hàng khi chiều rộng cho phép; tự chuyển 3/2/1 cột ở màn hình hẹp.
- Ba biểu đồ không tràn chữ, có chú giải, tooltip và trạng thái không có dữ liệu.
- Ba bảng/cảnh báo có tiêu đề ngắn, hàng dữ liệu gọn, cuộn ngang bên trong thay vì làm tràn toàn trang.
- Không còn icon lệch; icon có khung 32–36 px và căn giữa bằng lưới.
- Màu đỏ chỉ dùng cho sai lệch/quá hạn/cảnh báo; màu vàng cho sắp đến hạn/chờ xử lý; xanh cho trạng thái hợp lệ.
- Số tiền thống nhất định dạng Việt Nam và ký hiệu `₫`.
- Bộ lọc ngày/tháng/năm, in/PDF và CSV vẫn hoạt động sau khi đổi bố cục.
- Dữ liệu màn hình, CSV và bản in phải cho cùng tổng số trong cùng kỳ.
