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
        CONSTRAINT PK_GiaoDichHoan PRIMARY KEY (MaGiaoDichHoan)
    );
END
GO

/* CSDL cũ: UNIQUE CONSTRAINT cùng tên — không DROP INDEX được. */
IF OBJECT_ID(N'dbo.GiaoDichHoan', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1 FROM sys.key_constraints
        WHERE name = N'UX_GiaoDichHoan_MRefundId'
          AND parent_object_id = OBJECT_ID(N'dbo.GiaoDichHoan')
          AND [type] = N'UQ'
   )
    ALTER TABLE dbo.GiaoDichHoan DROP CONSTRAINT UX_GiaoDichHoan_MRefundId;
GO

IF OBJECT_ID(N'dbo.GiaoDichHoan', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1 FROM sys.indexes i
        WHERE i.name = N'UX_GiaoDichHoan_MRefundId'
          AND i.object_id = OBJECT_ID(N'dbo.GiaoDichHoan')
          AND i.is_unique_constraint = 0
          AND i.is_primary_key = 0
          AND (i.has_filter = 0 OR ISNULL(i.filter_definition, N'') NOT LIKE N'%MRefundId%IS NOT NULL%')
   )
    DROP INDEX UX_GiaoDichHoan_MRefundId ON dbo.GiaoDichHoan;
GO

IF OBJECT_ID(N'dbo.GiaoDichHoan', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_GiaoDichHoan_MRefundId'
          AND object_id = OBJECT_ID(N'dbo.GiaoDichHoan')
   )
    CREATE UNIQUE INDEX UX_GiaoDichHoan_MRefundId
        ON dbo.GiaoDichHoan (MRefundId)
        WHERE MRefundId IS NOT NULL;
GO

IF OBJECT_ID(N'dbo.GiaoDichHoan', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_GiaoDichHoan_MaPhieuTra'
          AND object_id = OBJECT_ID(N'dbo.GiaoDichHoan')
   )
    CREATE INDEX IX_GiaoDichHoan_MaPhieuTra ON dbo.GiaoDichHoan (MaPhieuTra);
GO
