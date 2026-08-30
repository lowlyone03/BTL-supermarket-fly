USE SupermarketFlyDB;
GO

IF COL_LENGTH('dbo.SanPham', 'DuongDanAnh') IS NULL
BEGIN
    ALTER TABLE dbo.SanPham ADD DuongDanAnh nvarchar(500) NULL;
END;
GO

