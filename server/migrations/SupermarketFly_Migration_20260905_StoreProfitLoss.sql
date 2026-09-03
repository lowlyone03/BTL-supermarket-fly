/* Báo cáo lãi/lỗ quản trị cửa hàng + kế hoạch điều chỉnh + thông báo toàn nhân viên.
   Idempotent. Không đụng bảng lãi gộp, không tạo sổ cái. */
IF OBJECT_ID(N'dbo.KeHoachDieuChinhLaiLo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.KeHoachDieuChinhLaiLo (
        MaKeHoach BIGINT IDENTITY(1,1) NOT NULL,
        LoaiKy NVARCHAR(10) NOT NULL,
        MaKy NVARCHAR(20) NOT NULL,
        TuNgay DATE NOT NULL,
        DenNgay DATE NOT NULL,
        NhanKy NVARCHAR(80) NOT NULL,
        SoTienLaiLo DECIMAL(18,2) NOT NULL,
        TrangThaiLaiLo NVARCHAR(20) NOT NULL,
        DoanhThuThuan DECIMAL(18,2) NOT NULL,
        TongLuongKhoa DECIMAL(18,2) NOT NULL,
        NguyenNhanMa NVARCHAR(500) NOT NULL,
        NguyenNhanKhac NVARCHAR(500) NULL,
        KeHoach NVARCHAR(2000) NOT NULL,
        HanXemLai DATE NOT NULL,
        MaNV_Gui VARCHAR(20) NOT NULL,
        TenNV_Gui NVARCHAR(100) NOT NULL,
        NgayGui DATETIME NOT NULL CONSTRAINT DF_KeHoachLaiLo_NgayGui DEFAULT GETDATE(),
        SoNguoiNhan INT NOT NULL CONSTRAINT DF_KeHoachLaiLo_SoNguoi DEFAULT 0,
        CONSTRAINT PK_KeHoachDieuChinhLaiLo PRIMARY KEY (MaKeHoach),
        CONSTRAINT FK_KeHoachLaiLo_NguoiGui FOREIGN KEY (MaNV_Gui) REFERENCES dbo.NhanVien(MaNV)
    );
END
GO

IF OBJECT_ID(N'dbo.ThongBaoCuaHang', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ThongBaoCuaHang (
        MaTB BIGINT IDENTITY(1,1) NOT NULL,
        MaKeHoach BIGINT NULL,
        MaNV_Nhan VARCHAR(20) NOT NULL,
        TieuDe NVARCHAR(200) NOT NULL,
        NoiDung NVARCHAR(1000) NOT NULL,
        MaNV_Gui VARCHAR(20) NOT NULL,
        TenNV_Gui NVARCHAR(100) NOT NULL,
        DichDen NVARCHAR(80) NULL,
        MucDo NVARCHAR(20) NOT NULL CONSTRAINT DF_ThongBaoCH_MucDo DEFAULT N'Cảnh báo',
        NgayGui DATETIME NOT NULL CONSTRAINT DF_ThongBaoCH_NgayGui DEFAULT GETDATE(),
        CONSTRAINT PK_ThongBaoCuaHang PRIMARY KEY (MaTB),
        CONSTRAINT FK_ThongBaoCH_KeHoach FOREIGN KEY (MaKeHoach) REFERENCES dbo.KeHoachDieuChinhLaiLo(MaKeHoach),
        CONSTRAINT FK_ThongBaoCH_Nhan FOREIGN KEY (MaNV_Nhan) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT FK_ThongBaoCH_Gui FOREIGN KEY (MaNV_Gui) REFERENCES dbo.NhanVien(MaNV)
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_KeHoachLaiLo_Ky' AND object_id = OBJECT_ID(N'dbo.KeHoachDieuChinhLaiLo')
)
    CREATE INDEX IX_KeHoachLaiLo_Ky ON dbo.KeHoachDieuChinhLaiLo (LoaiKy, MaKy, NgayGui DESC);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_ThongBaoCH_Nhan' AND object_id = OBJECT_ID(N'dbo.ThongBaoCuaHang')
)
    CREATE INDEX IX_ThongBaoCH_Nhan ON dbo.ThongBaoCuaHang (MaNV_Nhan, NgayGui DESC);
GO
