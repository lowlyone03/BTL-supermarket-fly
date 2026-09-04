/* Bàn giao phiếu đổi trả đã duyệt + liên kết phiếu xuất hủy từ kiểm kê.
   Idempotent. Không đụng UNIQUE ca mở/quầy. */
USE SupermarketFlyDB;
GO

IF COL_LENGTH('dbo.PhieuDoiTra', 'MaNV_XuLy') IS NULL
    ALTER TABLE dbo.PhieuDoiTra ADD MaNV_XuLy VARCHAR(20) NULL;
IF COL_LENGTH('dbo.PhieuDoiTra', 'MaQuayXuLy') IS NULL
    ALTER TABLE dbo.PhieuDoiTra ADD MaQuayXuLy VARCHAR(20) NULL;
IF COL_LENGTH('dbo.PhieuDoiTra', 'NgayBanGiao') IS NULL
    ALTER TABLE dbo.PhieuDoiTra ADD NgayBanGiao DATETIME NULL;
IF COL_LENGTH('dbo.PhieuDoiTra', 'MaCaBanGiao') IS NULL
    ALTER TABLE dbo.PhieuDoiTra ADD MaCaBanGiao VARCHAR(20) NULL;
GO

UPDATE dt
SET MaNV_XuLy = dt.MaNV_Lap
FROM dbo.PhieuDoiTra dt
WHERE dt.MaNV_XuLy IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PhieuDoiTra_MaNV_XuLy')
    ALTER TABLE dbo.PhieuDoiTra ADD CONSTRAINT FK_PhieuDoiTra_MaNV_XuLy
        FOREIGN KEY (MaNV_XuLy) REFERENCES dbo.NhanVien (MaNV);
GO

IF COL_LENGTH('dbo.CaLamViec', 'MaQuay') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PhieuDoiTra_MaQuayXuLy')
   AND OBJECT_ID(N'dbo.QuayBanHang', N'U') IS NOT NULL
    ALTER TABLE dbo.PhieuDoiTra ADD CONSTRAINT FK_PhieuDoiTra_MaQuayXuLy
        FOREIGN KEY (MaQuayXuLy) REFERENCES dbo.QuayBanHang (MaQuay);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PhieuDoiTra_MaCaBanGiao')
    ALTER TABLE dbo.PhieuDoiTra ADD CONSTRAINT FK_PhieuDoiTra_MaCaBanGiao
        FOREIGN KEY (MaCaBanGiao) REFERENCES dbo.CaLamViec (MaCa);
GO

IF COL_LENGTH('dbo.PhieuXuat', 'MaKK') IS NULL
    ALTER TABLE dbo.PhieuXuat ADD MaKK VARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PhieuXuat_MaKK')
    ALTER TABLE dbo.PhieuXuat ADD CONSTRAINT FK_PhieuXuat_MaKK
        FOREIGN KEY (MaKK) REFERENCES dbo.KiemKe (MaKK);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_PhieuXuat_MaKK_Active' AND object_id = OBJECT_ID(N'dbo.PhieuXuat')
)
    CREATE UNIQUE INDEX UX_PhieuXuat_MaKK_Active ON dbo.PhieuXuat (MaKK)
    WHERE MaKK IS NOT NULL AND TrangThai IN (N'Nháp', N'Chờ duyệt', N'Đã duyệt', N'Đã xác nhận');
GO
