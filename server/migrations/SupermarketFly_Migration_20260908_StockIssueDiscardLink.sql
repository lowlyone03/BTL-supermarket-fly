/* Lien ket Phieu xuat huy voi doi tra loai bo + co khong tru ton.
   Idempotent. Khong doi UX_PhieuXuat_MaKK_Active. */
USE SupermarketFlyDB;
GO

IF COL_LENGTH('dbo.PhieuXuat', 'MaDT') IS NULL
    ALTER TABLE dbo.PhieuXuat ADD MaDT VARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.PhieuXuat', 'MaDT') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PhieuXuat_MaDT')
    ALTER TABLE dbo.PhieuXuat ADD CONSTRAINT FK_PhieuXuat_MaDT
        FOREIGN KEY (MaDT) REFERENCES dbo.PhieuDoiTra (MaDT);
GO

IF COL_LENGTH('dbo.PhieuXuat', 'MaDT') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_PhieuXuat_MaDT_Active' AND object_id = OBJECT_ID(N'dbo.PhieuXuat')
   )
    CREATE UNIQUE INDEX UX_PhieuXuat_MaDT_Active ON dbo.PhieuXuat (MaDT)
    WHERE MaDT IS NOT NULL AND TrangThai IN (N'Nháp', N'Chờ duyệt', N'Đã duyệt', N'Đã xác nhận');
GO

IF COL_LENGTH('dbo.PhieuXuat', 'KhongTruTon') IS NULL
    ALTER TABLE dbo.PhieuXuat ADD KhongTruTon BIT NOT NULL
        CONSTRAINT DF_PhieuXuat_KhongTruTon DEFAULT 0;
GO
