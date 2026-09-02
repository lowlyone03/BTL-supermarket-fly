/* ============================================================
   CO SO DU LIEU: SupermarketFly
   He thong quan ly sieu thi mini "Supermarket Fly"
   Microsoft SQL Server  |  35 bang  |  68 khoa ngoai
   Sinh tu thiet ke ERD Chuong 6
   ============================================================ */

IF DB_ID('SupermarketFlyDB') IS NULL
    CREATE DATABASE SupermarketFlyDB;
GO
USE SupermarketFlyDB;
GO

/* ---------- 1) TAO CAC BANG (khong kem khoa ngoai) ---------- */

-- ============================================================================
-- NHÓM 1: HỆ THỐNG & PHÂN QUYỀN (5 BẢNG)
-- ============================================================================

-- 1.1. VaiTro: Vai trò trong hệ thống
CREATE TABLE [VaiTro] (
    [MaVaiTro] INT IDENTITY(1,1) NOT NULL,
    [TenVaiTro] NVARCHAR(50) NOT NULL UNIQUE,
    [MoTa] NVARCHAR(200) NULL,
    CONSTRAINT [PK_VaiTro] PRIMARY KEY ([MaVaiTro])
);
GO

-- 1.2. TaiKhoan: Tài khoản đăng nhập
CREATE TABLE [TaiKhoan] (
    [MaTK] INT IDENTITY(1,1) NOT NULL,
    [TenDangNhap] VARCHAR(50) NOT NULL UNIQUE,
    [MatKhauHash] VARCHAR(256) NOT NULL,
    [MaNV] VARCHAR(20) NOT NULL UNIQUE,
    [MaVaiTro] INT NOT NULL,
    [TrangThai] TINYINT NOT NULL DEFAULT 1,
    [NgayTao] DATETIME NOT NULL DEFAULT GETDATE(),
    [LanDangNhapCuoi] DATETIME NULL,
    CONSTRAINT [PK_TaiKhoan] PRIMARY KEY ([MaTK])
);
GO

-- 1.3. NhatKy: Nhật ký hoạt động (Audit Log)
CREATE TABLE [NhatKy] (
    [MaNK] BIGINT IDENTITY(1,1) NOT NULL,
    [MaTK] INT NOT NULL,
    [HanhDong] NVARCHAR(100) NOT NULL,
    [BangLienQuan] NVARCHAR(50) NULL,
    [MaBanGhi] VARCHAR(20) NULL,
    [NoiDung] NVARCHAR(500) NULL,
    [ThoiGian] DATETIME NOT NULL DEFAULT GETDATE(),
    [DiaChiIP] VARCHAR(45) NULL,
    CONSTRAINT [PK_NhatKy] PRIMARY KEY ([MaNK])
);
GO

-- 1.4. ChucNang: Chức năng hệ thống (quyền)
CREATE TABLE [ChucNang] (
    [MaChucNang] VARCHAR(20) NOT NULL,
    [TenChucNang] NVARCHAR(100) NOT NULL,
    [Nhom] NVARCHAR(50) NULL,
    [MoTa] NVARCHAR(200) NULL,
    CONSTRAINT [PK_ChucNang] PRIMARY KEY ([MaChucNang])
);
GO

-- 1.5. VaiTro_ChucNang: Phân quyền vai trò – chức năng (N–N)
CREATE TABLE [VaiTro_ChucNang] (
    [MaVaiTro] INT NOT NULL,
    [MaChucNang] VARCHAR(20) NOT NULL,
    [DuocPhep] BIT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_VaiTro_ChucNang] PRIMARY KEY ([MaVaiTro], [MaChucNang])
);
GO

-- ============================================================================
-- NHÓM 2: DANH MỤC GỐC (6 BẢNG)
-- ============================================================================

-- 2.1. DanhMuc: Danh mục hàng hóa
CREATE TABLE [DanhMuc] (
    [MaDM] VARCHAR(10) NOT NULL,
    [TenDM] NVARCHAR(100) NOT NULL,
    [MoTa] NVARCHAR(500) NULL,
    [TrangThai] TINYINT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_DanhMuc] PRIMARY KEY ([MaDM])
);
GO

-- 2.2. SanPham: Sản phẩm
CREATE TABLE [SanPham] (
    [MaSP] VARCHAR(20) NOT NULL,
    [MaDM] VARCHAR(10) NOT NULL,
    [TenSP] NVARCHAR(200) NOT NULL,
    [DonViTinh] NVARCHAR(50) NOT NULL,
    [MaVach] VARCHAR(30) NULL UNIQUE,
    [GiaNhap] DECIMAL(18,2) NOT NULL CHECK ([GiaNhap] >= 0),
    [GiaBan] DECIMAL(18,2) NOT NULL CHECK ([GiaBan] >= 0),
    [TonKhoToiThieu] INT NOT NULL DEFAULT 0,
    [TrangThai] NVARCHAR(20) NOT NULL DEFAULT N'Đang bán',
    CONSTRAINT [PK_SanPham] PRIMARY KEY ([MaSP])
);
GO

-- 2.3. NhaCungCap: Nhà cung cấp
CREATE TABLE [NhaCungCap] (
    [MaNCC] VARCHAR(20) NOT NULL,
    [TenNCC] NVARCHAR(200) NOT NULL,
    [MaSoThue] VARCHAR(20) NULL,
    [SDT] VARCHAR(15) NULL,
    [Email] VARCHAR(150) NULL,
    [DiaChi] NVARCHAR(300) NULL,
    [NguoiLienHe] NVARCHAR(100) NULL,
    [TrangThai] NVARCHAR(20) NOT NULL DEFAULT N'Đang hợp tác',
    CONSTRAINT [PK_NhaCungCap] PRIMARY KEY ([MaNCC])
);
GO

-- 2.4. KhachHang: Khách hàng
CREATE TABLE [KhachHang] (
    [MaKH] VARCHAR(20) NOT NULL,
    [TenKH] NVARCHAR(100) NOT NULL,
    [SDT] VARCHAR(15) NULL UNIQUE,
    [Email] VARCHAR(150) NULL,
    [DiaChi] NVARCHAR(300) NULL,
    [NgaySinh] DATE NULL,
    [DiemTichLuy] INT NOT NULL DEFAULT 0,
    [HangThanhVien] NVARCHAR(20) NOT NULL DEFAULT N'Thường',
    [NgayTao] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_KhachHang] PRIMARY KEY ([MaKH])
);
GO

-- 2.5. NhanVien: Nhân viên
CREATE TABLE [NhanVien] (
    [MaNV] VARCHAR(20) NOT NULL,
    [TenNV] NVARCHAR(100) NOT NULL,
    [ChucVu] NVARCHAR(50) NOT NULL,
    [SDT] VARCHAR(15) NULL UNIQUE,
    [Email] VARCHAR(150) NULL,
    [DiaChi] NVARCHAR(300) NULL,
    [TrangThai] NVARCHAR(20) NOT NULL DEFAULT N'Đang làm việc',
    CONSTRAINT [PK_NhanVien] PRIMARY KEY ([MaNV])
);
GO

-- 2.6. Kho: Kho hàng của cửa hàng (một kho logic duy nhất)
CREATE TABLE [Kho] (
    [MaKho] VARCHAR(20) NOT NULL,
    [TenKho] NVARCHAR(150) NOT NULL,
    [DiaChi] NVARCHAR(300) NULL,
    [TrangThai] TINYINT NOT NULL DEFAULT 1,
    CONSTRAINT [PK_Kho] PRIMARY KEY ([MaKho])
);
GO

-- ============================================================================
-- NHÓM 3: QUY TRÌNH MUA HÀNG (6 BẢNG)
-- ============================================================================

-- 3.1. DeNghiMuaHang: Phiếu đề nghị mua hàng (Master)
CREATE TABLE [DeNghiMuaHang] (
    [MaDN] VARCHAR(20) NOT NULL,
    [MaNV_Lap] VARCHAR(20) NOT NULL,
    [NgayLap] DATETIME NOT NULL DEFAULT GETDATE(),
    [LyDo] NVARCHAR(500) NULL,
    [TrangThai] NVARCHAR(30) NOT NULL,
    [NgayGui] DATETIME NULL,
    [MaNV_TiepNhan] VARCHAR(20) NULL,
    [GhiChu] NVARCHAR(500) NULL,
    CONSTRAINT [PK_DeNghiMuaHang] PRIMARY KEY ([MaDN])
);
GO

-- 3.2. ChiTietDeNghi: Chi tiết đề nghị mua hàng (Detail) (bang N-N)
CREATE TABLE [ChiTietDeNghi] (
    [MaDN] VARCHAR(20) NOT NULL,
    [MaSP] VARCHAR(20) NOT NULL,
    [SLTonHienTai] INT NOT NULL,
    [SLTonToiThieu] INT NOT NULL,
    [SLDeNghi] INT NOT NULL CHECK ([SLDeNghi] > 0),
    [GhiChu] NVARCHAR(200) NULL,
    CONSTRAINT [PK_ChiTietDeNghi] PRIMARY KEY ([MaDN], [MaSP])
);
GO

-- 3.3. DonMuaHang: Đơn mua hàng / Purchase Order (Master)
CREATE TABLE [DonMuaHang] (
    [MaPO] VARCHAR(20) NOT NULL,
    [MaDN] VARCHAR(20) NULL,
    [MaNCC] VARCHAR(20) NOT NULL,
    [MaNV_Lap] VARCHAR(20) NOT NULL,
    [NgayLap] DATETIME NOT NULL DEFAULT GETDATE(),
    [NgayGiaoDuKien] DATE NULL,
    [DieuKhoanThanhToan] NVARCHAR(200) NULL,
    [SoNgayThanhToan] INT NOT NULL CHECK ([SoNgayThanhToan] BETWEEN 30 AND 45),
    [TongTien] DECIMAL(18,2) NOT NULL CHECK ([TongTien] >= 0),
    [TrangThai] NVARCHAR(30) NOT NULL,
    [MaNV_Duyet] VARCHAR(20) NULL,
    [NgayDuyet] DATETIME NULL,
    [LyDoTuChoi] NVARCHAR(500) NULL,
    [GhiChu] NVARCHAR(500) NULL,
    CONSTRAINT [PK_DonMuaHang] PRIMARY KEY ([MaPO])
);
GO

-- 3.4. ChiTietDonMua: Chi tiết đơn mua hàng (Detail) (bang N-N)
CREATE TABLE [ChiTietDonMua] (
    [MaPO] VARCHAR(20) NOT NULL,
    [MaSP] VARCHAR(20) NOT NULL,
    [SoLuong] INT NOT NULL CHECK ([SoLuong] > 0),
    [DonGia] DECIMAL(18,2) NOT NULL CHECK ([DonGia] >= 0),
    [ChietKhau] DECIMAL(5,2) NOT NULL DEFAULT 0,
    [ThanhTien] DECIMAL(18,2) NOT NULL CHECK ([ThanhTien] >= 0),
    [SLDaGiao] INT NOT NULL DEFAULT 0,
    [SLConThieu] INT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_ChiTietDonMua] PRIMARY KEY ([MaPO], [MaSP])
);
GO

-- 3.5. ThongBaoGiaoHang: Thông tin chuyến giao do Nhân viên mua hàng ghi nhận từ Nhà cung cấp
CREATE TABLE [ThongBaoGiaoHang] (
    [MaTBGH] VARCHAR(20) NOT NULL,
    [MaPO] VARCHAR(20) NOT NULL,
    [MaNVGhiNhan] VARCHAR(20) NOT NULL,
    [SoPhieuGiao] VARCHAR(50) NOT NULL,
    [NgayXuatPhat] DATETIME NOT NULL,
    [NgayGioDuKienDen] DATETIME NOT NULL,
    [BienSoXe] VARCHAR(20) NULL,
    [TenTaiXe] NVARCHAR(100) NULL,
    [SDTTaiXe] VARCHAR(20) NULL,
    [SoKien] INT NULL CHECK ([SoKien] IS NULL OR [SoKien] >= 0),
    [TrangThai] NVARCHAR(30) NOT NULL DEFAULT N'Đang giao',
    [NgayDen] DATETIME NULL,
    [GhiChu] NVARCHAR(500) NULL,
    [NgayTao] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_ThongBaoGiaoHang] PRIMARY KEY ([MaTBGH]),
    CONSTRAINT [CK_ThongBaoGiaoHang_ThoiGian] CHECK ([NgayGioDuKienDen] >= [NgayXuatPhat])
);
GO

-- 3.6. PhieuNhap: Phiếu nhập kho (Master)
CREATE TABLE [PhieuNhap] (
    [MaPN] VARCHAR(20) NOT NULL,
    [MaPO] VARCHAR(20) NOT NULL,
    [MaTBGH] VARCHAR(20) NULL,
    [MaNCC] VARCHAR(20) NOT NULL,
    [MaNV] VARCHAR(20) NOT NULL,
    [MaKho] VARCHAR(20) NOT NULL,
    [NgayNhap] DATETIME NOT NULL DEFAULT GETDATE(),
    [TongTien] DECIMAL(18,2) NOT NULL CHECK ([TongTien] >= 0),
    [TrangThai] NVARCHAR(30) NOT NULL,
    [NgayXacNhan] DATETIME NULL,
    [GhiChu] NVARCHAR(500) NULL,
    CONSTRAINT [PK_PhieuNhap] PRIMARY KEY ([MaPN])
);
GO

-- 3.6. ChiTietPhieuNhap: Chi tiết phiếu nhập (Detail) (bang N-N)
CREATE TABLE [ChiTietPhieuNhap] (
    [MaPN] VARCHAR(20) NOT NULL,
    [MaSP] VARCHAR(20) NOT NULL,
    [SoLuongChapNhan] INT NOT NULL CHECK ([SoLuongChapNhan] >= 0),
    [DonGiaNhap] DECIMAL(18,2) NOT NULL CHECK ([DonGiaNhap] >= 0),
    [ThanhTien] DECIMAL(18,2) NOT NULL CHECK ([ThanhTien] >= 0),
    [SoLuongGiao] INT NOT NULL CHECK ([SoLuongGiao] > 0),
    [SoLuongTuChoi] INT NOT NULL DEFAULT 0 CHECK ([SoLuongTuChoi] >= 0),
    [TinhTrangHang] NVARCHAR(200) NULL,
    [LyDoTuChoi] NVARCHAR(300) NULL,
    [HanSD] DATE NULL,
    [SoLo] VARCHAR(50) NULL,
    [ViTriKho] NVARCHAR(100) NULL,
    CONSTRAINT [PK_ChiTietPhieuNhap] PRIMARY KEY ([MaPN], [MaSP]),
    CONSTRAINT [CK_ChiTietPhieuNhap_1] CHECK ([SoLuongGiao] = [SoLuongChapNhan] + [SoLuongTuChoi])
);
GO

-- ============================================================================
-- NHÓM 4: QUY TRÌNH BÁN HÀNG & ĐỔI TRẢ (8 BẢNG)
-- ============================================================================

-- 4.1. KhuyenMai: Chương trình khuyến mãi
CREATE TABLE [KhuyenMai] (
    [MaKM] VARCHAR(20) NOT NULL,
    [TenKM] NVARCHAR(150) NOT NULL,
    [LoaiKM] NVARCHAR(20) NOT NULL,
    [GiaTri] DECIMAL(18,2) NOT NULL CHECK ([GiaTri] >= 0),
    [NgayBatDau] DATE NOT NULL,
    [NgayKetThuc] DATE NOT NULL,
    [TrangThai] NVARCHAR(20) NOT NULL DEFAULT N'Hiệu lực',
    CONSTRAINT [PK_KhuyenMai] PRIMARY KEY ([MaKM]),
    CONSTRAINT [CK_KhuyenMai_Ngay] CHECK ([NgayKetThuc] >= [NgayBatDau])
);
GO

-- 4.2. CaLamViec: Ca làm việc (thu ngân)
CREATE TABLE [CaLamViec] (
    [MaCa] VARCHAR(20) NOT NULL,
    [MaNV] VARCHAR(20) NOT NULL,
    [ThoiGianBatDau] DATETIME NOT NULL DEFAULT GETDATE(),
    [ThoiGianKetThuc] DATETIME NULL,
    [TienDauCa] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [TienCuoiCa] DECIMAL(18,2) NULL,
    [TrangThai] NVARCHAR(20) NOT NULL DEFAULT N'Đang mở',
    CONSTRAINT [PK_CaLamViec] PRIMARY KEY ([MaCa])
);
GO

-- 4.3. HoaDon: Hóa đơn bán hàng (Master)
CREATE TABLE [HoaDon] (
    [MaHD] VARCHAR(20) NOT NULL,
    [MaKH] VARCHAR(20) NULL,
    [MaNV] VARCHAR(20) NOT NULL,
    [MaKho] VARCHAR(20) NOT NULL,
    [MaCa] VARCHAR(20) NOT NULL,
    [MaKM] VARCHAR(20) NULL,
    [NgayLap] DATETIME NOT NULL DEFAULT GETDATE(),
    [TongTienHang] DECIMAL(18,2) NOT NULL CHECK ([TongTienHang] >= 0),
    [TienGiamGia] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [DiemSuDung] INT NOT NULL DEFAULT 0,
    [TienDiemQuyDoi] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [TongThanhToan] DECIMAL(18,2) NOT NULL CHECK ([TongThanhToan] >= 0),
    [TrangThai] NVARCHAR(30) NOT NULL,
    [DiemCong] INT NOT NULL DEFAULT 0,
    [GhiChu] NVARCHAR(500) NULL,
    CONSTRAINT [PK_HoaDon] PRIMARY KEY ([MaHD])
);
GO

-- 4.4. ChiTietHoaDon: Chi tiết hóa đơn bán (Detail) (bang N-N)
CREATE TABLE [ChiTietHoaDon] (
    [MaHD] VARCHAR(20) NOT NULL,
    [MaSP] VARCHAR(20) NOT NULL,
    [SoLuong] INT NOT NULL CHECK ([SoLuong] > 0),
    [DonGia] DECIMAL(18,2) NOT NULL CHECK ([DonGia] >= 0),
    [GiamGia] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [ThanhTien] DECIMAL(18,2) NOT NULL CHECK ([ThanhTien] >= 0),
    [DonGiaVon] DECIMAL(18,2) NOT NULL CHECK ([DonGiaVon] >= 0),
    [ThanhTienVon] DECIMAL(18,2) NOT NULL CHECK ([ThanhTienVon] >= 0),
    CONSTRAINT [PK_ChiTietHoaDon] PRIMARY KEY ([MaHD], [MaSP])
);
GO

-- 4.5. ThanhToan: Thanh toán bán hàng
CREATE TABLE [ThanhToan] (
    [MaTT] VARCHAR(20) NOT NULL,
    [MaHD] VARCHAR(20) NOT NULL,
    [PhuongThuc] NVARCHAR(30) NOT NULL,
    [MaGiaoDich] VARCHAR(50) NULL,
    [SoTien] DECIMAL(18,2) NOT NULL CHECK ([SoTien] > 0),
    [NgayTT] DATETIME NOT NULL DEFAULT GETDATE(),
    [TrangThai] NVARCHAR(20) NOT NULL DEFAULT N'Chờ xác nhận',
    [NgayXacNhan] DATETIME NULL,
    [GhiChu] NVARCHAR(200) NULL,
    CONSTRAINT [PK_ThanhToan] PRIMARY KEY ([MaTT])
);
GO

-- 4.6. PhieuDoiTra: Phiếu đổi trả hàng bán (Master)
CREATE TABLE [PhieuDoiTra] (
    [MaDT] VARCHAR(20) NOT NULL,
    [MaHD] VARCHAR(20) NOT NULL,
    [MaNV_Lap] VARCHAR(20) NOT NULL,
    [MaNV_Duyet] VARCHAR(20) NULL,
    [MaNV_KiemTra] VARCHAR(20) NULL,
    [NgayKiemTra] DATETIME NULL,
    [KetQuaKiemTra] NVARCHAR(200) NULL,
    [LyDo] NVARCHAR(500) NULL,
    [HinhThucXuLy] NVARCHAR(30) NOT NULL,
    [SoTienHoan] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [PhuongThucHoan] NVARCHAR(30) NULL,
    [MaGiaoDichHoan] VARCHAR(50) NULL,
    [NgayHoan] DATETIME NULL,
    [TrangThai] NVARCHAR(30) NOT NULL,
    [NgayLap] DATETIME NOT NULL DEFAULT GETDATE(),
    [NgayDuyet] DATETIME NULL,
    [GhiChu] NVARCHAR(500) NULL,
    CONSTRAINT [PK_PhieuDoiTra] PRIMARY KEY ([MaDT])
);
GO

-- 4.7. ChiTietDoiTra: Chi tiết đổi trả (Detail) (bang N-N)
CREATE TABLE [ChiTietDoiTra] (
    [MaDT] VARCHAR(20) NOT NULL,
    [MaSP] VARCHAR(20) NOT NULL,
    [LoaiDong] NVARCHAR(20) NOT NULL DEFAULT N'Hàng khách trả',
    [SoLuong] INT NOT NULL CHECK ([SoLuong] > 0),
    [DonGia] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [ThanhTien] DECIMAL(18,2) NOT NULL CHECK ([ThanhTien] >= 0),
    [DonGiaVon] DECIMAL(18,2) NOT NULL CHECK ([DonGiaVon] >= 0),
    [ThanhTienVon] DECIMAL(18,2) NOT NULL CHECK ([ThanhTienVon] >= 0),
    [LyDo] NVARCHAR(200) NULL,
    CONSTRAINT [PK_ChiTietDoiTra] PRIMARY KEY ([MaDT], [MaSP], [LoaiDong])
);
GO

-- 4.8. PhieuThu: Phiếu thu tiền mặt bàn giao cuối ca
CREATE TABLE [PhieuThu] (
    [MaPT] VARCHAR(20) NOT NULL,
    [MaCa] VARCHAR(20) NOT NULL UNIQUE,
    [MaNV_Lap] VARCHAR(20) NOT NULL,
    [NgayLap] DATETIME NOT NULL DEFAULT GETDATE(),
    [SoTienTheoHeThong] DECIMAL(18,2) NOT NULL CHECK ([SoTienTheoHeThong] >= 0),
    [SoTienThucNop] DECIMAL(18,2) NOT NULL CHECK ([SoTienThucNop] >= 0),
    [ChenhLech] AS ([SoTienThucNop] - [SoTienTheoHeThong]),
    [LyDoChenhLech] NVARCHAR(500) NULL,
    [NoiDung] NVARCHAR(500) NOT NULL,
    [NgayXacNhan] DATETIME NULL,
    [TrangThai] NVARCHAR(30) NOT NULL,
    [GhiChu] NVARCHAR(500) NULL,
    CONSTRAINT [PK_PhieuThu] PRIMARY KEY ([MaPT]),
    CONSTRAINT [CK_PhieuThu_1] CHECK ([SoTienThucNop] = [SoTienTheoHeThong] OR [LyDoChenhLech] IS NOT NULL)
);
GO

-- ============================================================================
-- NHÓM 5: QUY TRÌNH KHO (6 BẢNG)
-- ============================================================================

-- 5.1. TonKho: Tồn kho (bảng phát sinh Kho ↔ SanPham) (bang N-N)
CREATE TABLE [TonKho] (
    [MaKho] VARCHAR(20) NOT NULL,
    [MaSP] VARCHAR(20) NOT NULL,
    [SLTon] INT NOT NULL CHECK ([SLTon] >= 0),
    [SLDatMua] INT NOT NULL DEFAULT 0,
    [DonGiaBinhQuan] DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ([DonGiaBinhQuan] >= 0),
    [GiaTriTon] DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ([GiaTriTon] >= 0),
    [NgayCapNhat] DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_TonKho] PRIMARY KEY ([MaKho], [MaSP])
);
GO

-- 5.2. GiaoDichKho: Thẻ kho / giao dịch kho
CREATE TABLE [GiaoDichKho] (
    [MaGD] VARCHAR(20) NOT NULL,
    [MaKho] VARCHAR(20) NOT NULL,
    [MaSP] VARCHAR(20) NOT NULL,
    [MaNV] VARCHAR(20) NOT NULL,
    [LoaiGD] NVARCHAR(20) NOT NULL,
    [SoLuong] INT NOT NULL,
    [DonGiaVon] DECIMAL(18,2) NULL,
    [ThanhTienVon] DECIMAL(18,2) NULL,
    [LoaiChungTu] NVARCHAR(20) NULL,
    [MaChungTu] VARCHAR(20) NULL,
    [NgayGD] DATETIME NOT NULL DEFAULT GETDATE(),
    [GhiChu] NVARCHAR(200) NULL,
    CONSTRAINT [PK_GiaoDichKho] PRIMARY KEY ([MaGD])
);
GO

-- 5.3. PhieuXuat: Phiếu xuất kho thủ công (Master)
CREATE TABLE [PhieuXuat] (
    [MaPX] VARCHAR(20) NOT NULL,
    [MaKho] VARCHAR(20) NOT NULL,
    [MaNV] VARCHAR(20) NOT NULL,
    [LoaiXuat] NVARCHAR(30) NOT NULL,
    [MaNCC] VARCHAR(20) NULL,
    [MaPN] VARCHAR(20) NULL,
    [NgayXuat] DATETIME NOT NULL DEFAULT GETDATE(),
    [TrangThai] NVARCHAR(30) NOT NULL,
    [MaNV_Duyet] VARCHAR(20) NULL,
    [NgayDuyet] DATETIME NULL,
    [LyDoTuChoi] NVARCHAR(300) NULL,
    [GhiChu] NVARCHAR(500) NULL,
    CONSTRAINT [PK_PhieuXuat] PRIMARY KEY ([MaPX])
);
GO

-- 5.4. ChiTietPhieuXuat: Chi tiết phiếu xuất (Detail) (bang N-N)
CREATE TABLE [ChiTietPhieuXuat] (
    [MaPX] VARCHAR(20) NOT NULL,
    [MaSP] VARCHAR(20) NOT NULL,
    [SoLuong] INT NOT NULL CHECK ([SoLuong] > 0),
    [DonGia] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [GhiChu] NVARCHAR(200) NULL,
    CONSTRAINT [PK_ChiTietPhieuXuat] PRIMARY KEY ([MaPX], [MaSP])
);
GO

-- 5.5. KiemKe: Đợt kiểm kê kho (Master)
CREATE TABLE [KiemKe] (
    [MaKK] VARCHAR(20) NOT NULL,
    [MaKho] VARCHAR(20) NOT NULL,
    [MaNV] VARCHAR(20) NOT NULL,
    [NgayKiemKe] DATETIME NOT NULL DEFAULT GETDATE(),
    [TrangThai] NVARCHAR(30) NOT NULL,
    [MaNV_Duyet] VARCHAR(20) NULL,
    [NgayDuyet] DATETIME NULL,
    [LyDoTuChoi] NVARCHAR(500) NULL,
    [GhiChu] NVARCHAR(500) NULL,
    CONSTRAINT [PK_KiemKe] PRIMARY KEY ([MaKK])
);
GO

-- 5.6. ChiTietKiemKe: Chi tiết kiểm kê (Detail) (bang N-N)
CREATE TABLE [ChiTietKiemKe] (
    [MaKK] VARCHAR(20) NOT NULL,
    [MaSP] VARCHAR(20) NOT NULL,
    [SLHeThong] INT NOT NULL,
    [SLThucTe] INT NOT NULL,
    [ChenhLech] INT NOT NULL,
    [NguyenNhan] NVARCHAR(200) NULL,
    [KetQuaDoiChieu] NVARCHAR(20) NOT NULL,
    [TinhTrangHang] NVARCHAR(30) NULL,
    CONSTRAINT [PK_ChiTietKiemKe] PRIMARY KEY ([MaKK], [MaSP])
);
GO

-- ============================================================================
-- NHÓM 6: KẾ TOÁN & CÔNG NỢ (5 BẢNG)
-- ============================================================================

-- 6.1. HoaDonMuaHang: Hóa đơn GTGT từ NCC (đối chiếu 3 bên)
CREATE TABLE [HoaDonMuaHang] (
    [MaHDMH] VARCHAR(20) NOT NULL,
    [SoHoaDon] VARCHAR(50) NOT NULL,
    [MaNCC] VARCHAR(20) NOT NULL,
    [MaPO] VARCHAR(20) NULL,
    [MaPN] VARCHAR(20) NULL,
    [NgayHoaDon] DATE NOT NULL,
    [TongTienHang] DECIMAL(18,2) NOT NULL CHECK ([TongTienHang] >= 0),
    [TienThue] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [TongCong] DECIMAL(18,2) NOT NULL CHECK ([TongCong] >= 0),
    [TrangThaiDoiChieu] NVARCHAR(30) NOT NULL,
    [GhiChuChenhLech] NVARCHAR(500) NULL,
    [MaNV] VARCHAR(20) NOT NULL,
    [NgayTiepNhan] DATETIME NOT NULL DEFAULT GETDATE(),
    [TrangThai] NVARCHAR(30) NOT NULL,
    CONSTRAINT [PK_HoaDonMuaHang] PRIMARY KEY ([MaHDMH]),
    CONSTRAINT [CK_HoaDonMuaHang_1] CHECK ([TrangThaiDoiChieu] <> N'Đã khớp' OR ([MaPO] IS NOT NULL AND [MaPN] IS NOT NULL))
);
GO

-- 6.2. ChiTietHoaDonMuaHang: Chi tiết hóa đơn mua hàng (bang N-N)
CREATE TABLE [ChiTietHoaDonMuaHang] (
    [MaHDMH] VARCHAR(20) NOT NULL,
    [MaSP] VARCHAR(20) NOT NULL,
    [SoLuong] INT NOT NULL CHECK ([SoLuong] > 0),
    [DonGia] DECIMAL(18,2) NOT NULL CHECK ([DonGia] >= 0),
    [ThueSuat] DECIMAL(5,2) NOT NULL DEFAULT 0,
    [TienThue] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [ThanhTien] DECIMAL(18,2) NOT NULL CHECK ([ThanhTien] >= 0),
    CONSTRAINT [PK_ChiTietHoaDonMuaHang] PRIMARY KEY ([MaHDMH], [MaSP])
);
GO

-- 6.3. CongNoPhaiTra: Công nợ phải trả (NCC)
CREATE TABLE [CongNoPhaiTra] (
    [MaCNPTra] VARCHAR(20) NOT NULL,
    [MaNCC] VARCHAR(20) NOT NULL,
    [MaHDMH] VARCHAR(20) NOT NULL UNIQUE,
    [SoTienNo] DECIMAL(18,2) NOT NULL CHECK ([SoTienNo] > 0),
    [SoTienDaTra] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [SoTienConLai] DECIMAL(18,2) NOT NULL CHECK ([SoTienConLai] >= 0),
    [NgayPhatSinh] DATETIME NOT NULL DEFAULT GETDATE(),
    [HanThanhToan] DATE NOT NULL,
    [TrangThai] NVARCHAR(30) NOT NULL,
    [GhiChu] NVARCHAR(500) NULL,
    CONSTRAINT [PK_CongNoPhaiTra] PRIMARY KEY ([MaCNPTra])
);
GO

-- 6.4. PhieuChi: Phiếu chi (thanh toán nhà cung cấp)
CREATE TABLE [PhieuChi] (
    [MaPhieu] VARCHAR(20) NOT NULL,
    [MaNCC] VARCHAR(20) NOT NULL,
    [MaCongNo] VARCHAR(20) NOT NULL UNIQUE,
    [SoTien] DECIMAL(18,2) NOT NULL CHECK ([SoTien] > 0),
    [PhuongThuc] NVARCHAR(30) NOT NULL,
    [MaGiaoDichNganHang] VARCHAR(50) NULL,
    [NgayChungTu] DATETIME NOT NULL DEFAULT GETDATE(),
    [NoiDung] NVARCHAR(500) NOT NULL,
    [MaNV] VARCHAR(20) NOT NULL,
    [MaNV_Duyet] VARCHAR(20) NULL,
    [NgayDuyet] DATETIME NULL,
    [LyDoTuChoi] NVARCHAR(500) NULL,
    [TrangThai] NVARCHAR(30) NOT NULL,
    [GhiChu] NVARCHAR(500) NULL,
    [HinhThucCapQuy] NVARCHAR(40) NULL,
    [NgayCapQuy] DATETIME NULL,
    [GhiChuCapQuy] NVARCHAR(500) NULL,
    CONSTRAINT [PK_PhieuChi] PRIMARY KEY ([MaPhieu])
);
GO

/* ---------- 2) THEM CAC KHOA NGOAI (68 quan he) ---------- */

-- Nhóm 1: Hệ thống & Phân quyền
ALTER TABLE [TaiKhoan] ADD CONSTRAINT [FK_TaiKhoan_MaVaiTro] FOREIGN KEY ([MaVaiTro]) REFERENCES [VaiTro] ([MaVaiTro]);
ALTER TABLE [TaiKhoan] ADD CONSTRAINT [FK_TaiKhoan_MaNV] FOREIGN KEY ([MaNV]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [NhatKy] ADD CONSTRAINT [FK_NhatKy_MaTK] FOREIGN KEY ([MaTK]) REFERENCES [TaiKhoan] ([MaTK]);
ALTER TABLE [VaiTro_ChucNang] ADD CONSTRAINT [FK_VaiTro_ChucNang_MaVaiTro] FOREIGN KEY ([MaVaiTro]) REFERENCES [VaiTro] ([MaVaiTro]);
ALTER TABLE [VaiTro_ChucNang] ADD CONSTRAINT [FK_VaiTro_ChucNang_MaChucNang] FOREIGN KEY ([MaChucNang]) REFERENCES [ChucNang] ([MaChucNang]);

-- Nhóm 2: Danh mục gốc
ALTER TABLE [SanPham] ADD CONSTRAINT [FK_SanPham_MaDM] FOREIGN KEY ([MaDM]) REFERENCES [DanhMuc] ([MaDM]);
ALTER TABLE [CaLamViec] ADD CONSTRAINT [FK_CaLamViec_MaNV] FOREIGN KEY ([MaNV]) REFERENCES [NhanVien] ([MaNV]);

-- Nhóm 3: Quy trình mua hàng
ALTER TABLE [DeNghiMuaHang] ADD CONSTRAINT [FK_DeNghiMuaHang_MaNV_Lap] FOREIGN KEY ([MaNV_Lap]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [DeNghiMuaHang] ADD CONSTRAINT [FK_DeNghiMuaHang_MaNV_TiepNhan] FOREIGN KEY ([MaNV_TiepNhan]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [ChiTietDeNghi] ADD CONSTRAINT [FK_ChiTietDeNghi_MaDN] FOREIGN KEY ([MaDN]) REFERENCES [DeNghiMuaHang] ([MaDN]);
ALTER TABLE [ChiTietDeNghi] ADD CONSTRAINT [FK_ChiTietDeNghi_MaSP] FOREIGN KEY ([MaSP]) REFERENCES [SanPham] ([MaSP]);
ALTER TABLE [DonMuaHang] ADD CONSTRAINT [FK_DonMuaHang_MaDN] FOREIGN KEY ([MaDN]) REFERENCES [DeNghiMuaHang] ([MaDN]);
ALTER TABLE [DonMuaHang] ADD CONSTRAINT [FK_DonMuaHang_MaNCC] FOREIGN KEY ([MaNCC]) REFERENCES [NhaCungCap] ([MaNCC]);
ALTER TABLE [DonMuaHang] ADD CONSTRAINT [FK_DonMuaHang_MaNV_Lap] FOREIGN KEY ([MaNV_Lap]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [DonMuaHang] ADD CONSTRAINT [FK_DonMuaHang_MaNV_Duyet] FOREIGN KEY ([MaNV_Duyet]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [ChiTietDonMua] ADD CONSTRAINT [FK_ChiTietDonMua_MaPO] FOREIGN KEY ([MaPO]) REFERENCES [DonMuaHang] ([MaPO]);
ALTER TABLE [ChiTietDonMua] ADD CONSTRAINT [FK_ChiTietDonMua_MaSP] FOREIGN KEY ([MaSP]) REFERENCES [SanPham] ([MaSP]);
ALTER TABLE [ThongBaoGiaoHang] ADD CONSTRAINT [FK_ThongBaoGiaoHang_MaPO] FOREIGN KEY ([MaPO]) REFERENCES [DonMuaHang] ([MaPO]);
ALTER TABLE [ThongBaoGiaoHang] ADD CONSTRAINT [FK_ThongBaoGiaoHang_MaNVGhiNhan] FOREIGN KEY ([MaNVGhiNhan]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [PhieuNhap] ADD CONSTRAINT [FK_PhieuNhap_MaPO] FOREIGN KEY ([MaPO]) REFERENCES [DonMuaHang] ([MaPO]);
ALTER TABLE [PhieuNhap] ADD CONSTRAINT [FK_PhieuNhap_MaTBGH] FOREIGN KEY ([MaTBGH]) REFERENCES [ThongBaoGiaoHang] ([MaTBGH]);
ALTER TABLE [PhieuNhap] ADD CONSTRAINT [FK_PhieuNhap_MaNCC] FOREIGN KEY ([MaNCC]) REFERENCES [NhaCungCap] ([MaNCC]);
ALTER TABLE [PhieuNhap] ADD CONSTRAINT [FK_PhieuNhap_MaNV] FOREIGN KEY ([MaNV]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [PhieuNhap] ADD CONSTRAINT [FK_PhieuNhap_MaKho] FOREIGN KEY ([MaKho]) REFERENCES [Kho] ([MaKho]);
ALTER TABLE [ChiTietPhieuNhap] ADD CONSTRAINT [FK_ChiTietPhieuNhap_MaPN] FOREIGN KEY ([MaPN]) REFERENCES [PhieuNhap] ([MaPN]);
ALTER TABLE [ChiTietPhieuNhap] ADD CONSTRAINT [FK_ChiTietPhieuNhap_MaSP] FOREIGN KEY ([MaSP]) REFERENCES [SanPham] ([MaSP]);
GO
SET QUOTED_IDENTIFIER ON;
GO
CREATE INDEX [IX_ThongBaoGiaoHang_MaPO_TrangThai]
    ON [ThongBaoGiaoHang] ([MaPO], [TrangThai], [NgayTao] DESC);
CREATE UNIQUE INDEX [UX_PhieuNhap_MaTBGH]
    ON [PhieuNhap] ([MaTBGH]) WHERE [MaTBGH] IS NOT NULL;
GO

-- Nhóm 4: Quy trình bán hàng & Đổi trả
ALTER TABLE [HoaDon] ADD CONSTRAINT [FK_HoaDon_MaKH] FOREIGN KEY ([MaKH]) REFERENCES [KhachHang] ([MaKH]);
ALTER TABLE [HoaDon] ADD CONSTRAINT [FK_HoaDon_MaNV] FOREIGN KEY ([MaNV]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [HoaDon] ADD CONSTRAINT [FK_HoaDon_MaKho] FOREIGN KEY ([MaKho]) REFERENCES [Kho] ([MaKho]);
ALTER TABLE [HoaDon] ADD CONSTRAINT [FK_HoaDon_MaCa] FOREIGN KEY ([MaCa]) REFERENCES [CaLamViec] ([MaCa]);
ALTER TABLE [HoaDon] ADD CONSTRAINT [FK_HoaDon_MaKM] FOREIGN KEY ([MaKM]) REFERENCES [KhuyenMai] ([MaKM]);
ALTER TABLE [ChiTietHoaDon] ADD CONSTRAINT [FK_ChiTietHoaDon_MaHD] FOREIGN KEY ([MaHD]) REFERENCES [HoaDon] ([MaHD]);
ALTER TABLE [ChiTietHoaDon] ADD CONSTRAINT [FK_ChiTietHoaDon_MaSP] FOREIGN KEY ([MaSP]) REFERENCES [SanPham] ([MaSP]);
ALTER TABLE [ThanhToan] ADD CONSTRAINT [FK_ThanhToan_MaHD] FOREIGN KEY ([MaHD]) REFERENCES [HoaDon] ([MaHD]);
ALTER TABLE [PhieuDoiTra] ADD CONSTRAINT [FK_PhieuDoiTra_MaHD] FOREIGN KEY ([MaHD]) REFERENCES [HoaDon] ([MaHD]);
ALTER TABLE [PhieuDoiTra] ADD CONSTRAINT [FK_PhieuDoiTra_MaNV_Lap] FOREIGN KEY ([MaNV_Lap]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [PhieuDoiTra] ADD CONSTRAINT [FK_PhieuDoiTra_MaNV_Duyet] FOREIGN KEY ([MaNV_Duyet]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [PhieuDoiTra] ADD CONSTRAINT [FK_PhieuDoiTra_MaNV_KiemTra] FOREIGN KEY ([MaNV_KiemTra]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [ChiTietDoiTra] ADD CONSTRAINT [FK_ChiTietDoiTra_MaDT] FOREIGN KEY ([MaDT]) REFERENCES [PhieuDoiTra] ([MaDT]);
ALTER TABLE [ChiTietDoiTra] ADD CONSTRAINT [FK_ChiTietDoiTra_MaSP] FOREIGN KEY ([MaSP]) REFERENCES [SanPham] ([MaSP]);
ALTER TABLE [PhieuThu] ADD CONSTRAINT [FK_PhieuThu_MaCa] FOREIGN KEY ([MaCa]) REFERENCES [CaLamViec] ([MaCa]);
ALTER TABLE [PhieuThu] ADD CONSTRAINT [FK_PhieuThu_MaNV_Lap] FOREIGN KEY ([MaNV_Lap]) REFERENCES [NhanVien] ([MaNV]);

-- Nhóm 5: Quy trình kho
ALTER TABLE [TonKho] ADD CONSTRAINT [FK_TonKho_MaKho] FOREIGN KEY ([MaKho]) REFERENCES [Kho] ([MaKho]);
ALTER TABLE [TonKho] ADD CONSTRAINT [FK_TonKho_MaSP] FOREIGN KEY ([MaSP]) REFERENCES [SanPham] ([MaSP]);
ALTER TABLE [GiaoDichKho] ADD CONSTRAINT [FK_GiaoDichKho_MaKho] FOREIGN KEY ([MaKho]) REFERENCES [Kho] ([MaKho]);
ALTER TABLE [GiaoDichKho] ADD CONSTRAINT [FK_GiaoDichKho_MaSP] FOREIGN KEY ([MaSP]) REFERENCES [SanPham] ([MaSP]);
ALTER TABLE [GiaoDichKho] ADD CONSTRAINT [FK_GiaoDichKho_MaNV] FOREIGN KEY ([MaNV]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [PhieuXuat] ADD CONSTRAINT [FK_PhieuXuat_MaKho] FOREIGN KEY ([MaKho]) REFERENCES [Kho] ([MaKho]);
ALTER TABLE [PhieuXuat] ADD CONSTRAINT [FK_PhieuXuat_MaNV] FOREIGN KEY ([MaNV]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [PhieuXuat] ADD CONSTRAINT [FK_PhieuXuat_MaNCC] FOREIGN KEY ([MaNCC]) REFERENCES [NhaCungCap] ([MaNCC]);
ALTER TABLE [PhieuXuat] ADD CONSTRAINT [FK_PhieuXuat_MaPN] FOREIGN KEY ([MaPN]) REFERENCES [PhieuNhap] ([MaPN]);
ALTER TABLE [PhieuXuat] ADD CONSTRAINT [FK_PhieuXuat_MaNV_Duyet] FOREIGN KEY ([MaNV_Duyet]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [ChiTietPhieuXuat] ADD CONSTRAINT [FK_ChiTietPhieuXuat_MaPX] FOREIGN KEY ([MaPX]) REFERENCES [PhieuXuat] ([MaPX]);
ALTER TABLE [ChiTietPhieuXuat] ADD CONSTRAINT [FK_ChiTietPhieuXuat_MaSP] FOREIGN KEY ([MaSP]) REFERENCES [SanPham] ([MaSP]);
ALTER TABLE [KiemKe] ADD CONSTRAINT [FK_KiemKe_MaKho] FOREIGN KEY ([MaKho]) REFERENCES [Kho] ([MaKho]);
ALTER TABLE [KiemKe] ADD CONSTRAINT [FK_KiemKe_MaNV] FOREIGN KEY ([MaNV]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [KiemKe] ADD CONSTRAINT [FK_KiemKe_MaNV_Duyet] FOREIGN KEY ([MaNV_Duyet]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [ChiTietKiemKe] ADD CONSTRAINT [FK_ChiTietKiemKe_MaKK] FOREIGN KEY ([MaKK]) REFERENCES [KiemKe] ([MaKK]);
ALTER TABLE [ChiTietKiemKe] ADD CONSTRAINT [FK_ChiTietKiemKe_MaSP] FOREIGN KEY ([MaSP]) REFERENCES [SanPham] ([MaSP]);

-- Nhóm 6: Kế toán & Công nợ
ALTER TABLE [HoaDonMuaHang] ADD CONSTRAINT [FK_HoaDonMuaHang_MaNCC] FOREIGN KEY ([MaNCC]) REFERENCES [NhaCungCap] ([MaNCC]);
ALTER TABLE [HoaDonMuaHang] ADD CONSTRAINT [FK_HoaDonMuaHang_MaPO] FOREIGN KEY ([MaPO]) REFERENCES [DonMuaHang] ([MaPO]);
ALTER TABLE [HoaDonMuaHang] ADD CONSTRAINT [FK_HoaDonMuaHang_MaPN] FOREIGN KEY ([MaPN]) REFERENCES [PhieuNhap] ([MaPN]);
ALTER TABLE [HoaDonMuaHang] ADD CONSTRAINT [FK_HoaDonMuaHang_MaNV] FOREIGN KEY ([MaNV]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [ChiTietHoaDonMuaHang] ADD CONSTRAINT [FK_ChiTietHoaDonMuaHang_MaHDMH] FOREIGN KEY ([MaHDMH]) REFERENCES [HoaDonMuaHang] ([MaHDMH]);
ALTER TABLE [ChiTietHoaDonMuaHang] ADD CONSTRAINT [FK_ChiTietHoaDonMuaHang_MaSP] FOREIGN KEY ([MaSP]) REFERENCES [SanPham] ([MaSP]);
ALTER TABLE [CongNoPhaiTra] ADD CONSTRAINT [FK_CongNoPhaiTra_MaNCC] FOREIGN KEY ([MaNCC]) REFERENCES [NhaCungCap] ([MaNCC]);
ALTER TABLE [CongNoPhaiTra] ADD CONSTRAINT [FK_CongNoPhaiTra_MaHDMH] FOREIGN KEY ([MaHDMH]) REFERENCES [HoaDonMuaHang] ([MaHDMH]);
ALTER TABLE [PhieuChi] ADD CONSTRAINT [FK_PhieuChi_MaNCC] FOREIGN KEY ([MaNCC]) REFERENCES [NhaCungCap] ([MaNCC]);
ALTER TABLE [PhieuChi] ADD CONSTRAINT [FK_PhieuChi_MaCongNo] FOREIGN KEY ([MaCongNo]) REFERENCES [CongNoPhaiTra] ([MaCNPTra]);
ALTER TABLE [PhieuChi] ADD CONSTRAINT [FK_PhieuChi_MaNV] FOREIGN KEY ([MaNV]) REFERENCES [NhanVien] ([MaNV]);
ALTER TABLE [PhieuChi] ADD CONSTRAINT [FK_PhieuChi_MaNV_Duyet] FOREIGN KEY ([MaNV_Duyet]) REFERENCES [NhanVien] ([MaNV]);
GO

-- ============================================================================
-- 3) DỮ LIỆU KHỞI TẠO MẪU (SEED DATA CHO HỆ THỐNG & PHÂN QUYỀN)
-- ============================================================================

-- 3.1. Khởi tạo 5 Vai trò chuẩn theo mô tả nghiệp vụ
INSERT INTO VaiTro (TenVaiTro, MoTa) VALUES
(N'Quản lý', N'Toàn quyền quản trị, phê duyệt đơn mua, duyệt kiểm kê, xem báo cáo tổng hợp'),
(N'Nhân viên Mua hàng', N'Tìm NCC, lập đơn mua hàng (PO), theo dõi tiến độ giao hàng'),
(N'Thủ kho', N'Lập đề nghị mua, nhập kho, xuất kho thủ công, kiểm kê kho'),
(N'Thu ngân', N'Mở/đóng ca, bán hàng tại quầy POS, thu tiền, tiếp nhận đổi trả'),
(N'Kế toán', N'Đối chiếu chứng từ 3 bên, theo dõi công nợ phải thu/trả, lập phiếu thu/chi');

-- 3.2. Khởi tạo danh mục Chức năng hệ thống (Phân quyền động UC02)
INSERT INTO ChucNang (MaChucNang, TenChucNang, Nhom, MoTa) VALUES
('CN_USER_MGT',    N'Quản lý Tài khoản & Phân quyền', N'Hệ thống',  N'Tạo tài khoản, phân quyền vai trò'),
('CN_AUDIT_LOG',   N'Xem Nhật ký hệ thống',           N'Hệ thống',  N'Xem lịch sử thao tác người dùng'),
('CN_PROD_MGT',    N'Quản lý Sản phẩm & Danh mục',    N'Danh mục',  N'Thêm, sửa thông tin hàng hóa, giá niêm yết'),
('CN_PROMO_MGT',   N'Quản lý Khuyến mãi',             N'Danh mục',  N'Thiết lập CT giảm giá, quà tặng'),
('CN_SUPP_MGT',    N'Quản lý Nhà cung cấp',           N'Danh mục',  N'Quản lý hồ sơ NCC'),
('CN_CUST_MGT',    N'Quản lý Khách hàng',             N'Danh mục',  N'Quản lý KH thân thiết, tích điểm'),
('CN_REQ_PURCH',   N'Lập Đề nghị mua hàng',           N'Mua hàng',  N'Thủ kho đề xuất hàng cần mua'),
('CN_CREATE_PO',   N'Lập Đơn mua hàng (PO)',          N'Mua hàng',  N'NV Mua hàng tạo đơn đặt hàng'),
('CN_APPROVE_PO',  N'Phê duyệt Đơn mua hàng',         N'Mua hàng',  N'Quản lý duyệt PO'),
('CN_RECEIVE_GRN', N'Lập Phiếu nhập kho',             N'Kho',       N'Thủ kho nhận hàng, kiểm đếm'),
('CN_MANAGE_STK',  N'Quản lý Tồn kho',                N'Kho',       N'Xem số dư tồn kho, cảnh báo tồn tối thiểu'),
('CN_MANUAL_ISS',  N'Lập Phiếu xuất kho',             N'Kho',       N'Xuất trả NCC, xuất hủy, điều chuyển'),
('CN_STOCK_TAKE',  N'Kiểm kê kho & Điều chỉnh',       N'Kho',       N'Kiểm kê định kỳ, lập biên bản chênh lệch'),
('CN_POS_CASH',    N'Bán hàng tại quầy (POS)',        N'Bán hàng',  N'Quét mã, tính tiền, in hóa đơn'),
('CN_POS_RETURN',  N'Xử lý Đổi trả hàng',             N'Bán hàng',  N'Lập phiếu đổi trả hàng bán'),
('CN_MATCH_3WAY',  N'Đối chiếu chứng từ 3 bên',       N'Kế toán',   N'Đối soát PO - Phiếu nhập - HĐ GTGT'),
('CN_DEBT_REC',    N'Quản lý Công nợ phải thu',       N'Kế toán',   N'Theo dõi KH mua chịu, thu nợ'),
('CN_DEBT_PAY',    N'Quản lý Công nợ phải trả',       N'Kế toán',   N'Theo dõi nợ NCC, lên lịch trả'),
('CN_VOUCHER_TR',  N'Lập Phiếu Thu / Chi',            N'Kế toán',   N'Ghi sổ thu chi tiền mặt, ngân hàng'),
('CN_REP_REVENUE', N'Báo cáo Doanh thu & Ca bán',     N'Báo cáo',   N'Báo cáo bán hàng theo ngày/ca/nhân viên'),
('CN_REP_INV',     N'Báo cáo Nhập - Xuất - Tồn',      N'Báo cáo',   N'Thống kê luân chuyển hàng hóa'),
('CN_REP_FIN',     N'Báo cáo Tài chính & Công nợ',    N'Báo cáo',   N'Báo cáo tổng hợp nợ và dòng tiền');

-- 3.3. Gán quyền mặc định cho Vai trò Quản lý (VaiTro = 1) -> Toàn quyền (DuocPhep = 1)
INSERT INTO VaiTro_ChucNang (MaVaiTro, MaChucNang, DuocPhep)
SELECT 1, MaChucNang, 1 FROM ChucNang;

-- ============================================================================
-- KẾT THÚC TẬP LỆNH TẠO 35 BẢNG, 68 KHÓA NGOẠI VÀ KHỞI TẠO DỮ LIỆU
-- ============================================================================
