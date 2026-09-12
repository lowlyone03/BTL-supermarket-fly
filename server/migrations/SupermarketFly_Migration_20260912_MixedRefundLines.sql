/* Dòng hoàn đa kênh: GiaoDichHoan có MaHD + PhuongThuc; ZaloPay fields nullable.
   PhieuDoiTra.TrangThai là tổng hợp. Mỗi dòng có trạng thái riêng. */
USE SupermarketFlyDB;
GO

IF COL_LENGTH(N'dbo.GiaoDichHoan', N'MaHD') IS NULL
    ALTER TABLE dbo.GiaoDichHoan ADD MaHD VARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.GiaoDichHoan', N'PhuongThuc') IS NULL
    ALTER TABLE dbo.GiaoDichHoan ADD PhuongThuc NVARCHAR(30) NULL;
GO
IF COL_LENGTH(N'dbo.GiaoDichHoan', N'ZpTransIdGoc') IS NOT NULL
    ALTER TABLE dbo.GiaoDichHoan ALTER COLUMN ZpTransIdGoc VARCHAR(50) NULL;
GO
IF COL_LENGTH(N'dbo.GiaoDichHoan', N'MRefundId') IS NOT NULL
    ALTER TABLE dbo.GiaoDichHoan ALTER COLUMN MRefundId VARCHAR(45) NULL;
GO
