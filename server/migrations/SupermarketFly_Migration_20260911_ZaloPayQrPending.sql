/* P1 ZaloPay: 1 QR Chờ / HĐ mọi nguồn (không lọc NguonXacNhan).
   Idempotent. Không fail hàng loạt MoMo Chờ — đó không phải luật nghiệp vụ.
   Cleanup demo: SupermarketFly_CleanupDemo_PendingMomoQr.sql (chạy tay). */
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

IF OBJECT_ID(N'dbo.ThanhToan', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_ThanhToan_MotQrMoMoCho'
          AND object_id = OBJECT_ID(N'dbo.ThanhToan')
   )
    DROP INDEX UX_ThanhToan_MotQrMoMoCho ON dbo.ThanhToan;
GO

IF OBJECT_ID(N'dbo.ThanhToan', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_ThanhToan_MotQrCho'
          AND object_id = OBJECT_ID(N'dbo.ThanhToan')
   )
    CREATE UNIQUE INDEX UX_ThanhToan_MotQrCho
        ON dbo.ThanhToan (MaHD)
        WHERE PhuongThuc = N'QR'
          AND TrangThai = N'Chờ xác nhận';
GO
