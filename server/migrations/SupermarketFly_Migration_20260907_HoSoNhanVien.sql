/* Hồ sơ chi tiết nhân viên (1–1 theo MaNV) */
USE SupermarketFlyDB;
GO

IF OBJECT_ID(N'dbo.HoSoNhanVien', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.HoSoNhanVien (
        MaNV            VARCHAR(20) NOT NULL,
        QuocTich        NVARCHAR(50) NULL,
        DanToc          NVARCHAR(50) NULL,
        TonGiao         NVARCHAR(50) NULL,
        NoiSinh         NVARCHAR(200) NULL,
        NguyenQuan      NVARCHAR(200) NULL,
        HoKhauThuongTru NVARCHAR(300) NULL,
        ChoOHienNay     NVARCHAR(300) NULL,
        NgayCapCCCD     DATE NULL,
        NoiCapCCCD      NVARCHAR(200) NULL,
        TinhTrangHonNhan NVARCHAR(30) NULL,
        TrinhDoHocVan   NVARCHAR(80) NULL,
        ChuyenMon       NVARCHAR(200) NULL,
        MSTCaNhan       VARCHAR(13) NULL,
        SoBHXH          VARCHAR(15) NULL,
        SoTaiKhoanNH    VARCHAR(30) NULL,
        TenNganHang     NVARCHAR(100) NULL,
        ChiNhanhNH      NVARCHAR(150) NULL,
        NguoiLienHe     NVARCHAR(150) NULL,
        QuanHeLienHe    NVARCHAR(50) NULL,
        SDTLienHe       VARCHAR(15) NULL,
        GhiChuHoSo      NVARCHAR(500) NULL,
        CONSTRAINT PK_HoSoNhanVien PRIMARY KEY (MaNV),
        CONSTRAINT FK_HoSoNhanVien_MaNV FOREIGN KEY (MaNV) REFERENCES dbo.NhanVien (MaNV)
    );
END
GO

IF COL_LENGTH('dbo.HoSoNhanVien', 'QuocTich') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD QuocTich NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'DanToc') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD DanToc NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'TonGiao') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD TonGiao NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'NoiSinh') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD NoiSinh NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'NguyenQuan') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD NguyenQuan NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'HoKhauThuongTru') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD HoKhauThuongTru NVARCHAR(300) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'ChoOHienNay') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD ChoOHienNay NVARCHAR(300) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'NgayCapCCCD') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD NgayCapCCCD DATE NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'NoiCapCCCD') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD NoiCapCCCD NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'TinhTrangHonNhan') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD TinhTrangHonNhan NVARCHAR(30) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'TrinhDoHocVan') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD TrinhDoHocVan NVARCHAR(80) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'ChuyenMon') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD ChuyenMon NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'MSTCaNhan') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD MSTCaNhan VARCHAR(13) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'SoBHXH') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD SoBHXH VARCHAR(15) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'SoTaiKhoanNH') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD SoTaiKhoanNH VARCHAR(30) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'TenNganHang') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD TenNganHang NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'ChiNhanhNH') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD ChiNhanhNH NVARCHAR(150) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'NguoiLienHe') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD NguoiLienHe NVARCHAR(150) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'QuanHeLienHe') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD QuanHeLienHe NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'SDTLienHe') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD SDTLienHe VARCHAR(15) NULL;
GO
IF COL_LENGTH('dbo.HoSoNhanVien', 'GhiChuHoSo') IS NULL
    ALTER TABLE dbo.HoSoNhanVien ADD GhiChuHoSo NVARCHAR(500) NULL;
GO

IF COL_LENGTH('dbo.HoSoNhanVien', 'MSTCaNhan') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_HoSoNhanVien_MSTCaNhan' AND object_id = OBJECT_ID(N'dbo.HoSoNhanVien')
   )
    CREATE UNIQUE INDEX UX_HoSoNhanVien_MSTCaNhan ON dbo.HoSoNhanVien (MSTCaNhan)
    WHERE MSTCaNhan IS NOT NULL;
GO

IF COL_LENGTH('dbo.HoSoNhanVien', 'SoBHXH') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_HoSoNhanVien_SoBHXH' AND object_id = OBJECT_ID(N'dbo.HoSoNhanVien')
   )
    CREATE UNIQUE INDEX UX_HoSoNhanVien_SoBHXH ON dbo.HoSoNhanVien (SoBHXH)
    WHERE SoBHXH IS NOT NULL;
GO
