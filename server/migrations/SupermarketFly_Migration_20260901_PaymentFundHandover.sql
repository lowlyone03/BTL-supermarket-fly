IF COL_LENGTH('dbo.PhieuChi', 'HinhThucCapQuy') IS NULL
    ALTER TABLE dbo.PhieuChi ADD HinhThucCapQuy NVARCHAR(40) NULL;
IF COL_LENGTH('dbo.PhieuChi', 'NgayCapQuy') IS NULL
    ALTER TABLE dbo.PhieuChi ADD NgayCapQuy DATETIME NULL;
IF COL_LENGTH('dbo.PhieuChi', 'GhiChuCapQuy') IS NULL
    ALTER TABLE dbo.PhieuChi ADD GhiChuCapQuy NVARCHAR(500) NULL;
GO
