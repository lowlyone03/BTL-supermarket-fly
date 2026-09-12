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

/* UX_GiaoDichHoan_MRefundId từ migration ZaloPayRefund là UNIQUE CONSTRAINT.
   DROP INDEX bị SQL Server cấm — phải DROP CONSTRAINT rồi tạo filtered unique index
   (nhiều dòng TM có MRefundId NULL). Idempotent. */
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
