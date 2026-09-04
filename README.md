# Supermarket Fly

Phần mềm quản lý **nội bộ một cửa hàng** siêu thị — giao diện: *Supermarket FLY · Hà Nội*.

Đọc file này để **hiểu dự án đang giải quyết việc gì**, dùng công nghệ nào, và tiền–hàng đi trong hệ thống ra sao. Phần cài máy, tài khoản test, API nằm ở nửa sau.

Tài liệu test / kế toán đã chốt: **[docs/](docs/README.md)** · UC và tài liệu môn: `../TaiLieu_Du_An/`

---

## 1. Bối cảnh

Đây là **bài tập lớn (BTL)** môn *Ứng dụng hệ thống thông tin kế toán* (AIS): làm một hệ thống thật sự chạy được cho cửa hàng, không phải slide hay form giả.

Bối cảnh nghiệp vụ nhóm chọn:

- Một siêu thị **một địa điểm**, một kho logic **Kho cửa hàng** — không chuỗi, không điều chuyển chi nhánh.
- **12 nhân viên, 5 vai trò:** 1 quản lý, 1 mua hàng, 1 thủ kho, 8 thu ngân, 1 kế toán.
- **Khách** đến quầy trả đủ tiền rồi lấy hàng. **Nhà cung cấp** giao hàng, cửa hàng nợ 30–45 ngày rồi trả **một lần đủ**.
- Quản lý cần biết: hàng còn không, ca thu ngân có đúng không, đã trả NCC chưa, lương tháng trả thế nào, cửa hàng **lãi hay lỗ** sau chi phí.

Nếu không có phần mềm: đề nghị mua viết tay, nhập kho lệch hóa đơn, két ca không đối được với máy, công nợ “duyệt là đã trả”, cuối tháng không biết tiền bán có đủ trả lương.

Hệ thống thay việc đó bằng **chứng từ điện tử + phân quyền + nhật ký**: mỗi việc có người làm, trạng thái, và số chỉ đổi khi bước hợp lệ xong.

---

## 2. Dự án này là gì — và không phải gì

**Là:** AIS vận hành cửa hàng. Chuỗi *đề nghị → mua → nhập → bán → quỹ ca → công nợ NCC → lương → báo cáo*.

Kế toán trong code hiện tại là **kế toán nghiệp vụ**: đối chiếu chứng từ, công nợ phải trả, phiếu thu/chi, lãi **gộp** (doanh thu thuần − giá vốn thuần), bảng lương theo công. Quản lý có thêm màn **lãi/lỗ sau chi phí** (trừ luôn chi NCC đã trả và lương đã khóa) để điều hành, không phải báo cáo tài chính nộp thuế.

**Không phải:**

| Không phải | Vì sao |
| --- | --- |
| Website bán hàng / app khách | Khách không đăng nhập |
| ERP nhiều công ty, nhiều kho | Một cửa hàng, một kho |
| MISA / FAST / sổ cái Nợ–Có | Chưa có `TaiKhoanKeToan`, `ButToan`, khóa sổ, BCĐKT |
| Phần mềm BHXH – bảng lương nhà nước | Không tính BHXH/BHYT; lương theo giờ công + ngày lễ luật VN |

Hướng “kế toán mini” (sổ cái, VAT POS, TSCĐ) nhóm đã **chốt là Plan A** nhưng **chưa code** — chỉ làm khi được yêu cầu.

---

## 3. Công nghệ sử dụng

Mô hình **ứng dụng desktop + API + SQL Server** — đúng kiểu phần mềm nội bộ cửa hàng (cài máy tính nhân viên, không host public).

```text
Máy nhân viên                Máy / cùng máy cửa hàng              SQL Server
┌─────────────────┐          ┌──────────────────────┐            ┌────────────────┐
│ Electron        │  HTTP    │ Node.js Express      │   ODBC 17  │ Supermarket-   │
│ (cửa sổ Windows)│  JWT ──► │ cổng 3000            │ ─────────► │ FlyDB          │
│ HTML/CSS/JS     │          │ REST /api/...        │  Windows   │ giờ địa phương │
└─────────────────┘          └──────────────────────┘  Auth      └────────────────┘
```

| Tầng | Công nghệ | Việc trong dự án |
| --- | --- | --- |
| Giao diện | **Electron** (Forge), HTML/CSS/JS thuần | Một cửa sổ Windows; sau login, sidebar đổi theo vai trò. Không React/Vue. |
| API | **Node.js**, **Express 5**, **JWT**, **bcrypt**, **CORS** | Mọi nghiệp vụ đi API; quyền theo mã use case (`UC05`, `UC27`…). |
| Ảnh SP | **Multer**, thư mục `server/uploads`, URL `/uploads` | Bắt buộc có ảnh khi tạo sản phẩm. |
| Dữ liệu | **SQL Server** + **mssql** / **msnodesqlv8** | Quan hệ chứng từ (đơn, phiếu nhập, HĐ, công nợ, ca, lương). `useUTC: false` vì DATETIME là giờ Hà Nội. |
| Máy chủ DB | Instance mặc định `localhost\SQLEXPRESS`, **Windows Authentication** | File `.env.example` có user `sa` nhưng `db.js` đang trusted connection. |
| Công cụ | **npm**, `concurrently`, file `.bat` | `npm start` = API + desktop cùng lúc. |

**Vì sao stack này:** môn học quen SQL Server; Electron cho cảm giác “phần mềm cửa hàng” không cần trình duyệt; Node đủ viết API và gắn ODBC. Git chỉ ở thư mục `supermarket-fly/` (thư mục cha `BTL/` không phải repo).

![Sơ đồ kiến trúc Electron — API cổng 3000 — SQL Server](docs/images/kien-truc-he-thong.png)

---

## 4. Cách hiểu hệ thống (tiền và hàng)

Ba “cột tiền” **không được trộn**:

1. **Hàng và giá vốn** — bán xong trừ tồn, dòng hóa đơn giữ `DonGiaVon`. Lãi gộp = tiền bán thuần − giá vốn thuần. Đổi trả làm giảm doanh thu/giá vốn, không sửa tay tồn.
2. **Két ca thu ngân** — chỉ tiền mặt khách đưa tại quầy (trừ hoàn tiền mặt). Cuối ca nộp phiếu thu. QR/thẻ **không** vào két. Phiếu thu **không** cộng thêm một lần doanh thu.
3. **Công nợ NCC và quỹ lương** — nợ NCC chỉ sinh khi kế toán **đối chiếu khớp** đơn + phiếu nhập + hóa đơn mua. Duyệt phiếu / giao quỹ **chưa** phải đã trả. Lương: quản lý giao **một quỹ cho kế toán**, kế toán mới chi từng người. Ngày tất toán lương (và hướng cước vận chuyển) là **mùng 10**.

Hàng đi: *đề nghị (sau khi thủ kho đếm thật) → đơn mua (QL duyệt) → giao → kiểm → nhập (chỉ SL chấp nhận) → kệ → bán / đổi trả / xuất hủy*.

Người dùng không nhìn “bảng SQL”. Họ nhìn **chứng từ và trạng thái**: Chờ duyệt → Đã duyệt → Thành công / Thất bại.

---

## 5. Ai dùng phần mềm

Năm **actor** (loại vai trò). Tám thu ngân vẫn là một actor.

| Vai trò | Trong cửa hàng làm gì |
| --- | --- |
| Quản lý (QL) | Phê duyệt việc lớn, giao quỹ, phân ca, xem cửa hàng lãi/lỗ, nhật ký khi có sự cố |
| Mua hàng (MH) | Nhà cung cấp, biến đề nghị kho thành đơn mua, theo dõi giao hàng |
| Thủ kho (TK) | Đếm hàng, đề nghị khi hết/thiếu, nhận hàng, nhập–xuất, kiểm kê |
| Thu ngân (TN) | Đúng ca mới vào quầy; bán, thu tiền, đóng ca |
| Kế toán (KT) | Đối chiếu mua, công nợ, phiếu thu ca, lập/khóa/chi lương, báo cáo nội bộ |

Khách và NCC **không có tài khoản**.

---

## 6. Ảnh demo giao diện thật

Hai ảnh dưới chụp từ `desktop/src/pages` khi chạy static (`localhost:4173`). Đăng nhập nội bộ, không phải web khách.

![Trang giới thiệu](docs/images/demo-landing.png)

*Trang giới thiệu — 5 phân hệ và 5 vai trò. Một số câu trên landing mang tính giới thiệu (ví dụ “công nợ khách hàng”); **nghiệp vụ thật không bán chịu**, không có công nợ phải thu.*

![Màn đăng nhập kem + 2 cột](docs/images/demo-login.png)

*Đăng nhập: trái minh họa mua / kho / quầy / kế toán; phải form tài khoản nội bộ (`admin`, `thukho`, `ketoan`…).*

Các màn sau login (kho, POS, lương, quỹ, lãi/lỗ) — minh họa đúng palette xanh FLY:

| Kho (Thủ kho) | Quầy (Thu ngân) |
| --- | --- |
| ![Tồn kho & cảnh báo](docs/images/demo-ton-kho.png) | ![POS bán hàng](docs/images/demo-pos.png) |

| Lương (Kế toán) | Giao quỹ (Quản lý) |
| --- | --- |
| ![Bảng lương tháng](docs/images/demo-bang-luong.png) | ![Giao quỹ cho kế toán](docs/images/demo-giao-quy-luong.png) |

![Báo cáo lãi lỗ cửa hàng](docs/images/demo-lai-lo.png)

---

## 7. Ba quy trình chuẩn (đúng logic đã chốt)

Ba quy trình này là xương sống đồ án. Số trên chứng từ **chỉ đổi đúng bước**; mũi tên đứt = chưa được phép.

### Quy trình 1 — Mua hàng và nhập kho

![Sơ đồ quy trình mua — nhập — đối chiếu](docs/images/quy-trinh-1-mua-nhap.png)

```mermaid
flowchart LR
  A[TK đếm thực tế] --> B{Còn đủ?}
  B -->|Có| Z[Dừng — không đề nghị]
  B -->|Hết / thiếu| C[Phiếu đề nghị mua]
  B -->|Hỏng hết hạn| X[Phiếu xuất hủy]
  X --> X1[QL duyệt]
  X1 --> X2[TK xác nhận mới trừ tồn]
  C --> D[MH lập Đơn mua]
  D --> E[QL duyệt PO]
  E --> F[NCC giao]
  F --> G[TK kiểm — chỉ SL chấp nhận]
  G --> H[Phiếu nhập cộng tồn]
  H --> I[KT nhập HĐ mua]
  I --> J{Đối chiếu 3 chứng từ}
  J -->|Khớp| K[Sinh công nợ phải trả]
  J -->|Lệch| L[Không ghi nợ]
```

| Bước | Ai | Hệ thống được / không được |
| --- | --- | --- |
| 1. Cảnh báo tồn &lt; min | Máy | Chỉ **gợi ý**. Không tự thành đơn mua, không “đề nghị khai trương”. |
| 2. Kiểm đếm thực tế | TK | Đợt kiểm kê **đúng mặt hàng đã chọn**. Số đếm ≠ sổ thì ghi trên kiểm kê; tồn sổ chỉ đổi sau QL duyệt điều chỉnh. |
| 3a. Còn đủ | TK | **Không** lập đề nghị. |
| 3b. Hết / thiếu sau đếm | TK | Lập **Phiếu đề nghị** → gửi MH. **QL không duyệt đề nghị.** |
| 3c. Hỏng / hết hạn | TK | **Phiếu xuất hủy** → QL duyệt → TK xác nhận mới trừ tồn. |
| 4. Đơn mua | MH | Chọn NCC, số lượng, giá. |
| 5. Duyệt PO | QL | **Lần duyệt duy nhất** trên đơn. |
| 6. Nhận hàng | TK | Đạt / thiếu / sai / hư. Chỉ `SoLuongChapNhan` vào phiếu nhập. Hàng hư **không** cộng tồn. |
| 7. Đối chiếu 3 bên | KT | Đơn + phiếu nhập + HĐ GTGT (SP, SL, đơn giá, thuế mua, tổng). |
| 8. Công nợ | Máy | **Chỉ khi khớp.** Hạn = ngày đối chiếu + 30–45 ngày. Trả một lần đủ. |

**Cấm:** trả trước, trả từng phần, giảm nợ lúc lập phiếu chi hoặc lúc QL duyệt phiếu chi NCC. Nợ chỉ về 0 khi KT ghi thanh toán **thành công**.

---

### Quy trình 2 — Bán tại quầy và quỹ ca

![Sơ đồ bán hàng — đóng ca — phiếu thu](docs/images/quy-trinh-2-ban-quy-ca.png)

```mermaid
flowchart TD
  P[QL công bố lịch ca] --> Q{TN đúng ngày + trong giờ ca?}
  Q -->|Không / hết ca| R[API 403 — không vào POS]
  Q -->|Có, sớm tối đa ~10 phút| S[Check-in / mở ca]
  S --> T[Bán — khách trả đủ]
  T --> U[Trừ tồn + snapshot DonGiaVon]
  U --> V[Đóng ca]
  V --> W[KT lập Phiếu thu]
  W --> Y[TM hệ thống = TM thu − hoàn TM]
```

| Bước | Ai | Logic đã chốt |
| --- | --- | --- |
| Phân ca | QL | Lịch **Đã công bố**. Ca hành chính T2–T7; thu ngân theo ngày có lịch. |
| Vào quầy | TN | Phải đúng **hôm nay** và **trong khung giờ**. Hết giờ ca / đã đóng: **không vào lại, không bán**. |
| Bán | TN | Thanh toán **đủ** tại quầy. Không công nợ phải thu, không TK 131. |
| Tồn và lãi gộp | Máy | HĐ hoàn thành mới trừ tồn. DT thuần − GV thuần = lãi gộp. |
| Đổi trả | TN (+ QL nếu lệch giá) | Không cộng doanh thu lần hai. |
| Két ca | TN → KT | Chỉ **tiền mặt**. QR / thẻ / CK **không** vào két. Một ca **một** phiếu thu. |
| Phiếu thu | KT | Không phải biên bản chênh lệch riêng — lý do ghi trên phiếu. **Không** Co doanh thu lần hai. |

---

### Quy trình 3 — Lương tháng (tất toán mùng 10)

![Sơ đồ lương — duyệt — giao quỹ cho kế toán — chi](docs/images/quy-trinh-3-luong.png)

```mermaid
flowchart TD
  A[QL duyệt công — OT có phút] --> B[KT bấm Lập / tính lại]
  B --> C{Còn công chờ / chưa ai có công duyệt?}
  C -->|Có chờ| D[Chặn lập]
  C -->|Không có NV đã làm| E[Bảng trống]
  C -->|Có NV đã chấm công duyệt| F[Tính giờ + lễ chỉ cho người đó]
  F --> G[KT khóa kỳ]
  G --> H[KT lập phiếu — mỗi NV TM hoặc CK]
  H --> I[QL duyệt từng người hoặc Duyệt tất cả]
  I --> J[QL giao quỹ CHUNG cho kế toán — một lần]
  J --> K[KT chi từng NV từ quỹ]
  K --> L[Chỉ lúc chi thành công mới Đã thanh toán]
```

| Bước | Ai | Logic đã chốt |
| --- | --- | --- |
| Ngày lễ | QL | Khai năm (Tết âm, Giỗ Tổ, liền kề 02/09). |
| Chấm công | NV / QL duyệt | Chỉ **Đã duyệt** vào lương. |
| Lập bảng | **Chỉ KT** | GET **không** tự tạo số. QL lập → 403. |
| Ai có dòng | Máy | Chỉ NV **phút công duyệt &gt; 0**. Lễ 8h chỉ cộng cho người đã đi làm trong kỳ. Không lập kỳ tương lai. |
| Ngày trả | Máy | **Mùng 10 tháng sau** (kỳ 08 → 10/09). Sau 10 vẫn chi được, gắn trễ. |
| Kênh | KT | Mỗi NV/kỳ **một** kênh: TM **hoặc** CK. |
| Duyệt | QL | Từng phiếu hoặc **Duyệt tất cả**. Duyệt **chưa** trả lương. |
| Giao quỹ | QL | **Một cục cho kế toán** (không giao từng NV). Khác phiếu chi NCC (vẫn giao từng phiếu). |
| Chi | KT | Rút từ quỹ đã nhận. CK bắt buộc mã GD. Fail → cùng phiếu, làm lại. |
| Lãi gộp | Máy | **Không** trừ bảng lương. QL xem lãi/lỗ sau chi phí ở báo cáo cửa hàng (trừ lương đã khóa). |

---

## Mục lục (vận hành kỹ thuật)

1. [Cài đặt và chạy](#cài-đặt-và-chạy)
2. [Tài khoản test](#tài-khoản-test)
3. [Năm actor và phạm vi](#năm-actor-và-phạm-vi)
4. [Kiến trúc](#kiến-trúc)
5. [Cây thư mục](#cây-thư-mục)
6. [Luồng nghiệp vụ chính](#luồng-nghiệp-vụ-chính)
7. [Kế toán nghiệp vụ đã chốt](#kế-toán-nghiệp-vụ-đã-chốt)
8. [Lương, ngày lễ, quỹ chung](#lương-ngày-lễ-quỹ-chung)
9. [Báo cáo lãi / lỗ cửa hàng (QL)](#báo-cáo-lãi--lỗ-cửa-hàng-ql)
10. [Nhật ký và thông báo](#nhật-ký-và-thông-báo)
11. [API](#api)
12. [CSDL và migration](#csdl-và-migration)
13. [Lệnh npm / test](#lệnh-npm--test)
14. [Những gì cố ý chưa làm](#những-gì-cố-ý-chưa-làm)
15. [Xử lý sự cố thường gặp](#xử-lý-sự-cố-thường-gặp)
16. [Tài liệu liên quan](#tài-liệu-liên-quan)

---


## Cài đặt và chạy

### Yêu cầu máy

- Windows, **Node.js** và **npm** trên PATH
- **SQL Server** (thường SQL Express) + **ODBC Driver 17 for SQL Server**
- Kết nối trong `server/src/config/db.js`: Windows Authentication, instance `localhost\SQLEXPRESS`, database `SupermarketFlyDB`, `useUTC: false` (giờ Hà Nội). File `.env.example` có `DB_USER`/`DB_PASSWORD` nhưng **runtime hiện dùng trusted connection** trong `db.js`

### Lần đầu

1. Tạo database `SupermarketFlyDB` (script gốc `server/migrations/SupermarketFly_CreateDB.sql` nếu máy trống).
2. Trong thư mục này:

```text
1_CAI_DAT_LAN_DAU.bat
```

Hoặc: `npm install` ở root, `server/`, `desktop/`.

3. Migration + seed quyền/tài khoản + dọn dữ liệu demo:

```text
npm run setup:next
```

(`migrate:next` lần lượt chạy các file SQL từ 20260825 đến 20260905, rồi seed permissions/accounts, xóa SP demo thừa, thu ngân thừa, chuẩn bị kho.)

4. Copy `server/.env.example` → `server/.env` nếu cần (cổng 3000). **Không commit `.env`.**

### Chạy hàng ngày (một máy)

```text
2_CHAY_SUPERMARKET_FLY.bat
```

hoặc `npm start` (mở song song API và Electron).

### Test nhóm trên một database

Một người (máy chủ) giữ SQL Server + API. Các thành viên chỉ mở desktop, nhập IP máy chủ ở màn đăng nhập, mỗi người một vai trò — không cần đăng xuất để test bước tiếp theo.

```text
4_CHAY_MAY_CHU_NHOM.bat      (máy chủ, giữ cửa sổ mở, gửi IP vào nhóm)
5_CHAY_MAY_THANH_VIEN.bat    (máy thành viên — không cần SQL Server)
```

Chi tiết: [docs/HUONG_DAN_TEST_DB_CHUNG.md](docs/HUONG_DAN_TEST_DB_CHUNG.md).

- API: `http://localhost:3000` — kiểm tra `GET /api/health`, `GET /api/test-db`
- Desktop: cửa sổ Electron. **Đóng hẳn app rồi mở lại** khi vừa kéo JS mới (không chỉ F5)

Test tự động: `3_KIEM_TRA_TU_DONG.bat` hoặc `npm run test:next`.

---

## Tài khoản test

Mật khẩu mặc định **`123`** (seed `server/seed-accounts.js`).

| Đăng nhập | Vai trò | Nhân viên |
| --- | --- | --- |
| `admin` | Quản lý cửa hàng (QL) | Nguyễn Minh Anh |
| `muahang` | Nhân viên mua hàng (MH) | Trần Thu Hà |
| `thukho` | Thủ kho (TK) | Lê Đức Long |
| `ketoan` | Kế toán (KT) | Hoàng Minh Châu |
| `thungan` | Thu ngân (TN) | Phạm Thảo Vy |
| `thungan02` … `thungan08` | Thu ngân | 7 thu ngân còn lại |

Đúng **5 vai trò** trên Use Case. Tám thu ngân không tạo actor thứ sáu.

---

## Năm actor và phạm vi

| Actor | Việc chính | Thư mục UI |
| --- | --- | --- |
| **QL** | Phê duyệt PO / kiểm kê / xuất kho / đổi trả / phiếu chi NCC; giao **quỹ lương cho kế toán**; phân ca, duyệt công, ngày lễ năm; SP–giá–KM–NV–TK; nhật ký hệ thống; báo cáo cửa hàng và **lãi/lỗ** | `desktop/src/pages/admin/`, `dashboard/`, `workforce/` |
| **MH** | NCC, đọc đề nghị từ kho, lập đơn mua, theo dõi giao hàng | `warehouse/supplier-pages.js`, `purchase-order-pages.js` |
| **TK** | Tồn kho, kiểm đếm thực tế rồi mới đề nghị mua (hết giai đoạn khai trương), nhận hàng, phiếu nhập, xuất hủy, kiểm kê, kiểm đổi trả | `warehouse/` |
| **TN** | Lịch ca, check-in, POS, hóa đơn, đổi trả, đóng ca | `cashier/` |
| **KT** | Đối chiếu 3 chứng từ mua, công nợ NCC, phiếu thu ca, bảng lương, chi lương từ quỹ QL đã giao, báo cáo nội bộ, lịch sử hoạt động KT | `accounting/` |

**Không có** actor Nhân sự riêng, không BHXH/BHYT trên phiếu lương, không nhiều chi nhánh, không bán chịu (không TK 131).

---

## Kiến trúc

```text
[ Electron desktop ]  --HTTP JWT-->  [ Express :3000 ]  -->  [ SQL Server ]
     pages theo vai trò                 routes / controllers
                                        services (lương, P&L, ca…)
                                        /uploads ảnh sản phẩm
```

- Sau login, `dashboard.html` + `dashboard.js` load trang động (`window.FLY_ROLE_PAGES`) theo `TenVaiTro`.
- Quyền theo **mã UC** (`requirePermission('UC27')` …), không chỉ tên vai trò.
- Ảnh sản phẩm: bắt buộc khi tạo SP; file tĩnh `/uploads`.

---

## Cây thư mục

```text
supermarket-fly/
├── 1_CAI_DAT_LAN_DAU.bat
├── 2_CHAY_SUPERMARKET_FLY.bat
├── 3_KIEM_TRA_TU_DONG.bat
├── package.json              npm start, setup:next, test:next
├── docs/                     hướng dẫn test, bàn giao, kế toán đã chốt
├── desktop/src/
│   ├── index.js, preload.js
│   └── pages/
│       ├── landing, login
│       ├── dashboard         vỏ app + sidebar
│       ├── admin             QL: SP, NV, TK, KM, phân quyền, nhật ký
│       ├── warehouse         TK + MH
│       ├── cashier           POS, ca
│       ├── accounting        KT + P&L nhúng cho QL
│       ├── workforce         phân ca, ngày lễ
│       └── shared            in, chart, ảnh, locale VI
└── server/
    ├── apply-migration.js
    ├── seed-accounts.js, seed-permissions.js
    ├── migrations/           CreateDB + 12 file theo ngày
    ├── uploads/
    └── src/
        ├── app.js            mount /api/*
        ├── config/db.js
        ├── routes/           11 file
        ├── controllers/
        ├── services/         payrollEngine, payrollFund, storeProfitLoss, cashierDuty…
        └── middlewares/      auth, upload ảnh
```

Workspace Cursor còn `../TaiLieu_Du_An/` (không commit vào repo này).

---

## Luồng nghiệp vụ chính

### Mua hàng và nhập kho (đã qua khai trương)

1. Hệ thống **cảnh báo** tồn dưới mức tối thiểu — chỉ là gợi ý.
2. Thủ kho **kiểm đếm thực tế** (đợt kiểm kê đúng mặt hàng đã chọn). Còn đủ → thôi. Thiếu → **Phiếu đề nghị mua hàng** gửi MH (không duyệt QL ở bước này). Hỏng / hết hạn → **Phiếu xuất hủy** (QL duyệt, TK xác nhận mới trừ tồn).
3. MH chọn NCC, lập **Đơn mua**.
4. QL **phê duyệt PO** (lần duyệt duy nhất trên đơn).
5. NCC giao → TK kiểm (đạt / thiếu / sai / hư) → **Phiếu nhập**. Chỉ `SoLuongChapNhan` cộng tồn khi xác nhận.
6. KT nhập HĐ GTGT mua, **đối chiếu 3 chứng từ** (đơn + phiếu nhập + HĐ). Khớp mới sinh `CongNoPhaiTra`. Lệch không ghi nợ.

Nút **Lập đề nghị khai trương** đã bỏ.

### Bán tại quầy

- Bán **đủ**, không bán chịu.
- Thu ngân chỉ mở POS khi có **lịch Đã công bố đúng hôm nay** và **trong khung giờ ca** (vào sớm tối đa khoảng 10 phút). **Hết ca không vào lại, không bán** — API trả 403, không chỉ khóa nút.
- Hóa đơn hoàn thành trừ tồn, snapshot giá vốn dòng.
- Đổi trả: quy tắc ngang giá / duyệt QL tùy UC đã cài.
- Đóng ca → KT lập **Phiếu thu** (tiền mặt hệ thống = TM thu − hoàn TM). QR/thẻ/CK không vào két. Một ca một phiếu thu. Chênh lệch ghi lý do trên phiếu. Phiếu thu **không** ghi doanh thu lần hai.

### Công nợ NCC và phiếu chi

- Nợ 30–45 ngày; trả **một lần đủ**, không trả trước / trả góp.
- KT lập phiếu chi (có thể sớm); số tiền khóa = còn lại.
- **Lập phiếu / QL duyệt-giao quỹ NCC chưa giảm nợ.** Chỉ khi KT ghi thanh toán **thành công** thì `SoTienConLai = 0`.
- QL duyệt phiếu chi NCC = giao quỹ theo **từng phiếu** (TM hoặc ủy quyền CK). Khác quỹ lương (xem dưới).

### Kho sau nhận hàng

- Kiểm kê định kỳ: lệch → chờ QL duyệt điều chỉnh; không UPDATE `TonKho` tay.
- Xuất thủ công / hủy: QL duyệt → TK xác nhận mới trừ tồn.

---

## Kế toán nghiệp vụ đã chốt

Chi tiết từng quyết định: [docs/PHUONG_AN_KE_TOAN_DA_CHOT.txt](docs/PHUONG_AN_KE_TOAN_DA_CHOT.txt).

- Lãi trên báo cáo nội bộ cũ = **lãi gộp** = DT thuần − GV thuần. **Bảng lương không trừ vào lãi gộp.**
- Kỳ báo cáo theo `Asia/Ho_Chi_Minh`. Ngày 1–3: ô tháng mặc định lùi tháng trước. Nút **Lập báo cáo** = tổng hợp chứng từ đã hoàn thành trong kỳ, **không** chi tiền, **không** khóa sổ cái.
- Plan A sổ cái (`TaiKhoanKeToan`, `KyKeToan`, `ButToan`) **chưa code** — chỉ làm khi nhóm bảo làm.

Gợi ý hạch toán *để dành* (chưa sinh bút toán): khóa lương Nợ 642 / Có 334; chi lương Nợ 334 / Có 111 hoặc 112.

---

## Lương, ngày lễ, quỹ chung

### Ai làm gì

| Bước | Ai | Việc |
| --- | --- | --- |
| Phân ca, ngày lễ, duyệt công | QL | UC30, UC32. OT ngoài ca phải xác nhận phút |
| Lập / tính lại / khóa kỳ | **Chỉ KT** | API 403 nếu QL bấm lập. GET **không** tự tạo bảng lương |
| Lập phiếu chi lương | KT | Mỗi NV/kỳ một phiếu, **TM hoặc CK** (không vừa TM vừa CK) |
| Duyệt phiếu | QL | Từng người hoặc **Duyệt tất cả** |
| Giao quỹ | QL | **Một lần cho kế toán** (không giao từng NV). Nút: *Giao quỹ cho kế toán* |
| Chi lương | KT | Rút từng NV từ quỹ đã nhận. CK bắt buộc mã GD |

### Ngày trả

Tất toán **mùng 10 tháng sau** kỳ lương (kỳ 08 → 10/09). Chi sau ngày 10 vẫn được, gắn trễ + lý do.

### Ai có mặt trên bảng lương

- Chỉ khi KT bấm **Lập / tính lại**.
- Chỉ NV có **chấm công Đã duyệt**, phút công > 0 trong kỳ. Không cộng ngày lễ cho cả cửa hàng khi chưa ai làm.
- Không lập kỳ tương lai. Còn công chờ duyệt thì không lập được.

### Hệ số (BLLĐ 2019 + NĐ 145/2020)

Ngày thường 100%, đêm 130%, OT ngày 150%, nghỉ tuần 200%, lễ trong ca 300% (+ đêm/OT lễ theo nghị định). Nghỉ lễ hưởng lương: 8 giờ chuẩn × đơn giá — **chỉ người đã có công duyệt trong kỳ**. BHXH không tính (`Thuong`/`KhauTru` = 0).

QL khai **Ngày lễ năm** (Tết âm, Giỗ Tổ, ngày liền kề 02/09). Seed 2026: Tết 16–20/02 (TB 9441/BNV), Giỗ Tổ 26/04, liền kề Quốc khánh mặc định 01/09.

### Tách quỹ

Phiếu chi **NCC** vẫn duyệt + giao **từng phiếu**. Phiếu chi **lương** dùng bảng riêng (`PhieuChiLuong`), không tái sử dụng `PhieuChi` (ràng buộc `MaCongNo`).

---

## Báo cáo lãi / lỗ cửa hàng (QL)

Tab đầu **Báo cáo cửa hàng**: *Cửa hàng đang lãi hay lỗ*. Không thay báo cáo lãi gộp cũ.

**P&L quản trị**

Doanh thu thuần − giá vốn thuần − chi NCC thanh toán thành công trong kỳ − lương **đã khóa** (− cước nếu có chứng từ).

**Tiền có trả lương không?** Phiếu thu ca (TM) + đã thu CK/QR/thẻ so với lương đã khóa.

**Chưa trừ:** thuê mặt bằng, điện nước, cước vận chuyển (chưa có bảng chứng từ cước).

Khi **lỗ** (hoặc DT thuần < lương khóa): hiện nguyên nhân theo số thật; QL bắt buộc nhập kế hoạch điều chỉnh (≥ 50 ký tự) → **Lưu và gửi thông báo toàn cửa hàng** (mọi NV đang làm việc). Kỳ lãi không bắt plan. Lịch sử plan không xóa.

---

## Nhật ký và thông báo

- **QL — Nhật ký hệ thống:** việc làm tiếng Việt, lọc 1 hàng + lịch Từ–Đến, panel chi tiết, xuất CSV, không xóa/sửa log. Mặc định 7 ngày, có thể ẩn đăng nhập.
- **KT — Lịch sử hoạt động:** việc của kế toán đang login + lịch sử chi lương từ quỹ chung.
- **TK — Lịch sử kho:** việc đã làm tại kho (kiểm kê, nhập, xuất, đề nghị).
- Chuông thông báo 12s: phê duyệt, kế hoạch lỗ, công chờ duyệt, v.v.

---

## API

Prefix `/api`. Health: `GET /api/health`.

| Prefix | Việc |
| --- | --- |
| `/api/auth` | Đăng nhập |
| `/api/accounts`, `/roles`, `/employees` | TK, vai trò, NV |
| `/api/admin` | QL: catalog, phê duyệt, báo cáo, phân ca, ngày lễ, P&L |
| `/api/warehouse` | Tồn, kiểm kê, nhập, xuất, đề nghị |
| `/api/purchasing`, `/api/suppliers` | Đơn mua, NCC, đề nghị inbox |
| `/api/accounting` | Đối chiếu, công nợ, phiếu thu, lương, quỹ, lịch sử KT |
| `/api/cashier` | Ca, POS, HĐ, đổi trả |
| `/api/notifications` | Chuông |

Một số endpoint lương / quỹ:

- `POST /api/accounting/payroll/:month/build` — chỉ KT
- `POST /api/admin/approvals/payroll-vouchers/approve-all`
- `POST /api/admin/approvals/payroll-fund/:month/handover` — giao quỹ cho KT
- `GET /api/admin/reports/store-profit-loss`
- `POST /api/admin/reports/store-profit-loss/plan`

---

## CSDL và migration

Thư mục `server/migrations/`:

| File | Việc |
| --- | --- |
| `SupermarketFly_CreateDB.sql` | Tạo DB / bảng lõi |
| `20260824_OpeningCatalog` / `DeliveryTracking` / `CleanupLegacyCategories` | Catalog, giao hàng, dọn nhóm cũ |
| `20260825_WorkforceScheduling` / `SalesAndWorkforceV2` / `OfficeHours` | Ca, bán, giờ hành chính |
| `20260830_ProductImages` | Ảnh SP |
| `20260901_PaymentFundHandover` | Giao quỹ phiếu chi NCC |
| `20260902_AuditLog` | Cột nhật ký mở rộng |
| `20260903_PayrollEngine` | Lễ, hệ số, phiếu chi lương |
| `20260904_PayrollCommonFund` | Quỹ lương chung QL → KT |
| `20260905_StoreProfitLoss` | Kế hoạch điều chỉnh khi lỗ |

Chạy lẻ: `cd server && node apply-migration.js <tên-file.sql>`  
Hoặc cả chuỗi: `npm run setup:next` / `npm run migrate:next`.

Một số controller còn `ensure*Schema()` lúc gọi API (máy cũ tự ALTER), nhưng máy setup mới nên chạy migration.

---

## Lệnh npm / test

Ở **root repo**:

| Lệnh | Việc |
| --- | --- |
| `npm start` | API + Electron |
| `npm run setup:next` | migrate + seed + dọn demo |
| `npm run test:next` | syntax check + test nghiệp vụ / ảnh / tìm kiếm / in / ca |

Ở **server** thêm: `test:payroll`, `test:payroll-fund`, `test:store-pnl`, `test:business`, …

---

## Những gì cố ý chưa làm

| Hạng mục | Ghi chú |
| --- | --- |
| Sổ cái, Nợ/Có, `TaiKhoanKeToan` / `ButToan` / `KyKeToan` | Chờ nhóm bảo làm kế toán mini |
| BHXH / BHYT / BHTN / công đoàn | Ngoài phạm vi BTL |
| VAT trên POS (tách 511/33311) | Plan A, chưa cột thuế HĐ bán |
| TSCĐ, sao kê 112, LCTT, BCĐKT | Plan A |
| Cước vận chuyển 4.000 đ/km, bồi thường 20% (NCC + nhà xe cùng chịu) khi hư ≥ 1/3 | **Đã chốt plan, chưa code** |
| TK 242, kho FEFO/lô, nhiều cửa hàng, HĐĐT nhà nước, bán chịu | Cắt |

Cước giao hàng (plan): siêu thị trả cước cho đơn vị NCC thuê; chuyến 10–100 km; thanh toán cước mùng 10; bồi **một gói 20%** giá trị chuyến chia mặc định 10% + 10%. Công nợ **hàng** vẫn chỉ khi đối chiếu 3 chứng từ khớp.

---

## Xử lý sự cố thường gặp

| Hiện tượng | Hướng xử lý |
| --- | --- |
| *Không thể mở trang / Failed to fetch* trên kho | API chết **hoặc** JS trang không load. Chạy `npm start`, xem `GET /api/health`. Đóng/mở lại Electron |
| Báo cáo đầu tháng trống / kẹt “Đang tải” | Đã sửa kỳ VN + lùi tháng ngày 1–3. Bấm **Lập báo cáo** khi nút đã bật. Tháng không có HĐ hoàn thành thì số = 0 |
| Bảng lương tháng 9 có 880k dù chưa làm | Rule cũ cộng lễ cho mọi NV. **Lập / tính lại** sau khi QL duyệt hết công. Chỉ người đã chấm công mới còn dòng |
| Không lập được kỳ lương | Còn `ChamCong` chờ duyệt, hoặc không phải KT |
| Không thấy “giao quỹ cho kế toán” | Nút là giao **một cục quỹ cho KT** sau khi duyệt phiếu. Không giao từng NV. Phiếu NCC vẫn giao từng phiếu |
| Thu ngân không vào được POS | Không có ca công bố hôm nay, **hoặc** ngoài giờ / đã hết ca |
| SQL không kết nối | Instance không phải `SQLEXPRESS`, thiếu ODBC 17, chưa tạo `SupermarketFlyDB`, Windows auth |

---

## Tài liệu liên quan

| File | Nội dung |
| --- | --- |
| [docs/README.md](docs/README.md) | Mục lục toàn bộ file trong `docs/` |
| [docs/PHUONG_AN_KE_TOAN_DA_CHOT.txt](docs/PHUONG_AN_KE_TOAN_DA_CHOT.txt) | Phương án đang chạy trong code |
| [docs/PHAM_VI_KE_TOAN_DA_CHOT_LAI_31-08.txt](docs/PHAM_VI_KE_TOAN_DA_CHOT_LAI_31-08.txt) | Plan A: giữ / cắt |
| [docs/HUONG_DAN_TEST_DON_GIAN_CHO_6_NGUOI.md](docs/HUONG_DAN_TEST_DON_GIAN_CHO_6_NGUOI.md) | Smoke test 6 người |
| [docs/HUONG_DAN_BAN_GIAO_CHO_THANH_VIEN_TEST.md](docs/HUONG_DAN_BAN_GIAO_CHO_THANH_VIEN_TEST.md) | Bàn giao Git / `.bak` |
| `../TaiLieu_Du_An/` | UC, CSDL mô tả, ảnh, backup môn học |

`docs/HUONG_DI_VA_THIET_KE_ACTOR_TIEP_THEO.md` mô tả hướng cũ (làm tiếp thủ kho/mua hàng) — **lỗi thời** nếu UC11–UC33 đã chạy; không dùng làm bước tiếp theo.

---

## Giấy phép

Mã nguồn đồ án học tập (desktop `package.json`: MIT; server ISC). Không phải sản phẩm thương mại.
