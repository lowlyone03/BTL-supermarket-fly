/* Hoàn ZaloPay: GiaoDichHoan + snapshot TongTienHoanQR. Sandbox only. Idempotent. */
USE SupermarketFlyDB;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH(N'dbo.CaLamViec', N'TongTienHoanQR') IS NULL
    ALTER TABLE dbo.CaLamViec ADD TongTienHoanQR DECIMAL(18,2) NULL;
GO

IF COL_LENGTH(N'dbo.PhieuDoiTra', N'SoTienThuThem') IS NULL
    ALTER TABLE dbo.PhieuDoiTra ADD SoTienThuThem DECIMAL(18,2) NOT NULL
        CONSTRAINT DF_PhieuDoiTra_SoTienThuThem DEFAULT 0;
GO

IF COL_LENGTH(N'dbo.PhieuDoiTra', N'PhuongThucThuThem') IS NULL
    ALTER TABLE dbo.PhieuDoiTra ADD PhuongThucThuThem NVARCHAR(30) NULL;
GO

IF COL_LENGTH(N'dbo.PhieuDoiTra', N'MaThamChieuThuThem') IS NULL
    ALTER TABLE dbo.PhieuDoiTra ADD MaThamChieuThuThem VARCHAR(50) NULL;
GO

IF OBJECT_ID(N'dbo.GiaoDichHoan', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GiaoDichHoan (
        MaGiaoDichHoan VARCHAR(20) NOT NULL,
        MaPhieuTra VARCHAR(20) NOT NULL,
        ZpTransIdGoc VARCHAR(50) NOT NULL,
        MRefundId VARCHAR(45) NOT NULL,
        RefundId VARCHAR(50) NULL,
        SoTienHoan DECIMAL(18,2) NOT NULL,
        TrangThaiHoan VARCHAR(20) NOT NULL,
        MaLoi NVARCHAR(50) NULL,
        NoiDungLoi NVARCHAR(500) NULL,
        NgayYeuCau DATETIME NOT NULL CONSTRAINT DF_GiaoDichHoan_NgayYeuCau DEFAULT GETDATE(),
        NgayHoanThanh DATETIME NULL,
        CONSTRAINT PK_GiaoDichHoan PRIMARY KEY (MaGiaoDichHoan),
        CONSTRAINT UX_GiaoDichHoan_MRefundId UNIQUE (MRefundId)
    );
END
GO

IF OBJECT_ID(N'dbo.GiaoDichHoan', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_GiaoDichHoan_MaPhieuTra'
          AND object_id = OBJECT_ID(N'dbo.GiaoDichHoan')
   )
    CREATE INDEX IX_GiaoDichHoan_MaPhieuTra ON dbo.GiaoDichHoan (MaPhieuTra);
GO
