/* P1 payment gateway: NguonXacNhan + MaThamChieuCong + 1 QR MoMo Chờ / HĐ.
   Idempotent. Khong doi enum PhuongThuc. Khong bang moi. */
USE SupermarketFlyDB;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF COL_LENGTH(N'dbo.ThanhToan', N'NguonXacNhan') IS NULL
    ALTER TABLE dbo.ThanhToan ADD NguonXacNhan NVARCHAR(20) NULL;
GO

IF COL_LENGTH(N'dbo.ThanhToan', N'MaThamChieuCong') IS NULL
    ALTER TABLE dbo.ThanhToan ADD MaThamChieuCong VARCHAR(80) NULL;
GO

IF OBJECT_ID(N'dbo.ThanhToan', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_ThanhToan_MaThamChieuCong'
          AND object_id = OBJECT_ID(N'dbo.ThanhToan')
   )
    CREATE UNIQUE INDEX UX_ThanhToan_MaThamChieuCong
        ON dbo.ThanhToan (MaThamChieuCong)
        WHERE MaThamChieuCong IS NOT NULL;
GO

IF OBJECT_ID(N'dbo.ThanhToan', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_ThanhToan_MotQrMoMoCho'
          AND object_id = OBJECT_ID(N'dbo.ThanhToan')
   )
    CREATE UNIQUE INDEX UX_ThanhToan_MotQrMoMoCho
        ON dbo.ThanhToan (MaHD)
        WHERE PhuongThuc = N'QR'
          AND NguonXacNhan = N'MoMo'
          AND TrangThai = N'Chờ xác nhận';
GO
