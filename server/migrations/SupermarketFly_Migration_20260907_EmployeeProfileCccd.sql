/* Hồ sơ nhân viên: CCCD + ngày sinh, giới tính, ngày vào làm */
USE SupermarketFlyDB;
GO

IF COL_LENGTH('dbo.NhanVien', 'CCCD') IS NULL
    ALTER TABLE dbo.NhanVien ADD CCCD VARCHAR(12) NULL;
GO
IF COL_LENGTH('dbo.NhanVien', 'NgaySinh') IS NULL
    ALTER TABLE dbo.NhanVien ADD NgaySinh DATE NULL;
GO
IF COL_LENGTH('dbo.NhanVien', 'GioiTinh') IS NULL
    ALTER TABLE dbo.NhanVien ADD GioiTinh NVARCHAR(10) NULL;
GO
IF COL_LENGTH('dbo.NhanVien', 'NgayVaoLam') IS NULL
    ALTER TABLE dbo.NhanVien ADD NgayVaoLam DATE NULL;
GO

IF COL_LENGTH('dbo.NhanVien', 'CCCD') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_NhanVien_CCCD' AND object_id = OBJECT_ID(N'dbo.NhanVien')
   )
    CREATE UNIQUE INDEX UX_NhanVien_CCCD ON dbo.NhanVien (CCCD)
    WHERE CCCD IS NOT NULL;
GO
