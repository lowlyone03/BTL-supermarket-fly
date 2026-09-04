# Tài liệu vận hành Supermarket Fly

README chi tiết toàn dự án (bối cảnh, công nghệ, ảnh demo, 3 quy trình, API): **[../README.md](../README.md)**.

Ảnh demo nằm ở [images/](images/).

Thư mục này là **chỗ canonical** (có Git) cho hướng dẫn test, bàn giao và phương án kế toán.
Chạy app vẫn từ thư mục gốc repo: `1_CAI_DAT_LAN_DAU.bat` rồi `2_CHAY_SUPERMARKET_FLY.bat`, hoặc `npm start`.

## Kế toán đã chốt

| File | Nội dung |
| --- | --- |
| [PHUONG_AN_KE_TOAN_DA_CHOT.txt](PHUONG_AN_KE_TOAN_DA_CHOT.txt) | Phương án đang chạy trong mã nguồn (02/09/2026) |
| [PHAM_VI_KE_TOAN_DA_CHOT_LAI_31-08.txt](PHAM_VI_KE_TOAN_DA_CHOT_LAI_31-08.txt) | Phạm vi Plan A hiệu chỉnh: giữ/cắt gì (31/08/2026) |

## Test và bàn giao

| File | Nội dung |
| --- | --- |
| [HUONG_DAN_BAN_GIAO_CHO_THANH_VIEN_TEST.md](HUONG_DAN_BAN_GIAO_CHO_THANH_VIEN_TEST.md) | Gói gửi tester: Git, `.bak`, uploads |
| [HUONG_DAN_TEST_DON_GIAN_CHO_6_NGUOI.md](HUONG_DAN_TEST_DON_GIAN_CHO_6_NGUOI.md) | Smoke test cho 6 người, không cần biết Git |
| [0_TIN_NHAN_GUI_NHOM_TEST_6_NGUOI.txt](0_TIN_NHAN_GUI_NHOM_TEST_6_NGUOI.txt) | Tin nhắn vòng 1 (copy gửi nhóm) |
| [1_TIN_NHAN_VONG_2_TEST_PHAN_KHAC_SO_VOI_WORD.txt](1_TIN_NHAN_VONG_2_TEST_PHAN_KHAC_SO_VOI_WORD.txt) | Tin nhắn vòng 2 — phần khác Word gốc |
| [KE_HOACH_BAN_GIAO_VA_PHAN_CONG_6_THANH_VIEN_TEST.md](KE_HOACH_BAN_GIAO_VA_PHAN_CONG_6_THANH_VIEN_TEST.md) | Phân công 6 thành viên |
| [HUONG_DAN_TEST_CHUC_NANG_VA_NGOAI_LE.txt](HUONG_DAN_TEST_CHUC_NANG_VA_NGOAI_LE.txt) | Từng chức năng + luồng ngoại lệ |
| [HUONG_DAN_KIEM_THU_TOAN_BO_HE_THONG_SUPERMARKET_FLY.txt](HUONG_DAN_KIEM_THU_TOAN_BO_HE_THONG_SUPERMARKET_FLY.txt) | Kịch bản full-system (file lớn) |
| [HUONG_DAN_KIEM_THU_UC10_UC27_UC29.md](HUONG_DAN_KIEM_THU_UC10_UC27_UC29.md) | UC10 / UC27 / UC29 |
| [HUONG_DAN_TEST_PHAN_CA_POS_LUONG.md](HUONG_DAN_TEST_PHAN_CA_POS_LUONG.md) | Phân ca → POS → lương |
| [HUONG_DAN_TEST_DB_CHUNG.md](HUONG_DAN_TEST_DB_CHUNG.md) | **7 thành viên, một database:** từng bước TV1–TV7, màn đăng nhập, chuỗi test |
| [HUONG_DAN_KHAC_WIFI.md](HUONG_DAN_KHAC_WIFI.md) | **Khác Wi-Fi:** Tailscale (free) hoặc Cloudflare / ngrok |
| [HUONG_DAN_CLOUDFLARE_TUNNEL.md](HUONG_DAN_CLOUDFLARE_TUNNEL.md) | **Cloudflare Tunnel từng bước:** chỉ TV1 cài, nhóm dán link |
| [0_TIN_NHAN_TEST_7_NGUOI_DB_CHUNG.txt](0_TIN_NHAN_TEST_7_NGUOI_DB_CHUNG.txt) | Tin nhắn copy gửi nhóm (phân công + IP + chuỗi test) |

## Phân công nhóm (7 người CODE)

| File | Nội dung |
| --- | --- |
| [PHAN_CONG_7_THANH_VIEN_VA_CHI_TIET_DU_AN_Supermarket_Fly.txt](PHAN_CONG_7_THANH_VIEN_VA_CHI_TIET_DU_AN_Supermarket_Fly.txt) | Mô tả chi tiết dự án + mỗi thành viên code phân hệ nào (UC, file, API, bảng, checklist) |

Khác với kế hoạch **6 người TEST** ở mục dưới: file 7 người là phân công **viết code / báo cáo**, không phải kịch bản kiểm thử.

## Đối chiếu và thiết kế

| File | Nội dung |
| --- | --- |
| [DOI_CHIEU_HE_THONG_HIEN_TAI_VOI_TAI_LIEU_GOC_2026-08-31.md](DOI_CHIEU_HE_THONG_HIEN_TAI_VOI_TAI_LIEU_GOC_2026-08-31.md) | Hệ thống hiện tại vs tài liệu gốc (UC30–UC33, 45 bảng) |
| [BAO_CAO_RA_SOAT_HE_THONG_2026-08-29.md](BAO_CAO_RA_SOAT_HE_THONG_2026-08-29.md) | Rà soát 29/08/2026 |
| [KE_HOACH_DU_LIEU_VA_GIAO_DIEN_BAO_CAO_5_ACTOR.md](KE_HOACH_DU_LIEU_VA_GIAO_DIEN_BAO_CAO_5_ACTOR.md) | Dữ liệu và UI báo cáo 5 actor |
| [HUONG_DI_VA_THIET_KE_ACTOR_TIEP_THEO.md](HUONG_DI_VA_THIET_KE_ACTOR_TIEP_THEO.md) | Actor / UC sau phân hệ Quản lý |

## Không nằm ở đây

- UC, chức năng chốt, mô tả CSDL, ảnh, backup: `../../TaiLieu_Du_An/`
- Bản nháp 2 phương án kế toán (không trùng file đã chốt): `TaiLieu_Du_An/99_Tam_Xu_Ly/.codex-tmp/ke-hoach-ke-toan.txt`
- Checksum gói bàn giao lịch sử: `TaiLieu_Du_An/05_Backup/Database_Backups/`
