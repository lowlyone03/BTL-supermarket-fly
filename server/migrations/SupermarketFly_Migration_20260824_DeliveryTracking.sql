USE [SupermarketFlyDB];
GO

SET XACT_ABORT ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.ThongBaoGiaoHang', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.ThongBaoGiaoHang (
            MaTBGH VARCHAR(20) NOT NULL,
            MaPO VARCHAR(20) NOT NULL,
            MaNVGhiNhan VARCHAR(20) NOT NULL,
            SoPhieuGiao VARCHAR(50) NOT NULL,
            NgayXuatPhat DATETIME NOT NULL,
            NgayGioDuKienDen DATETIME NOT NULL,
            BienSoXe VARCHAR(20) NULL,
            TenTaiXe NVARCHAR(100) NULL,
            SDTTaiXe VARCHAR(20) NULL,
            SoKien INT NULL,
            TrangThai NVARCHAR(30) NOT NULL
                CONSTRAINT DF_ThongBaoGiaoHang_TrangThai DEFAULT N'Đang giao',
            NgayDen DATETIME NULL,
            GhiChu NVARCHAR(500) NULL,
            NgayTao DATETIME NOT NULL
                CONSTRAINT DF_ThongBaoGiaoHang_NgayTao DEFAULT GETDATE(),
            CONSTRAINT PK_ThongBaoGiaoHang PRIMARY KEY (MaTBGH),
            CONSTRAINT CK_ThongBaoGiaoHang_SoKien CHECK (SoKien IS NULL OR SoKien >= 0),
            CONSTRAINT CK_ThongBaoGiaoHang_ThoiGian CHECK (NgayGioDuKienDen >= NgayXuatPhat),
            CONSTRAINT FK_ThongBaoGiaoHang_MaPO FOREIGN KEY (MaPO) REFERENCES dbo.DonMuaHang(MaPO),
            CONSTRAINT FK_ThongBaoGiaoHang_MaNVGhiNhan FOREIGN KEY (MaNVGhiNhan) REFERENCES dbo.NhanVien(MaNV)
        );
    END;

    IF COL_LENGTH(N'dbo.PhieuNhap', N'MaTBGH') IS NULL
        ALTER TABLE dbo.PhieuNhap ADD MaTBGH VARCHAR(20) NULL;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PhieuNhap_MaTBGH'
    )
        ALTER TABLE dbo.PhieuNhap ADD CONSTRAINT FK_PhieuNhap_MaTBGH
            FOREIGN KEY (MaTBGH) REFERENCES dbo.ThongBaoGiaoHang(MaTBGH);

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.ThongBaoGiaoHang')
          AND name = N'IX_ThongBaoGiaoHang_MaPO_TrangThai'
    )
        CREATE INDEX IX_ThongBaoGiaoHang_MaPO_TrangThai
            ON dbo.ThongBaoGiaoHang(MaPO, TrangThai, NgayTao DESC);

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.PhieuNhap')
          AND name = N'UX_PhieuNhap_MaTBGH'
    )
        EXEC(N'CREATE UNIQUE INDEX UX_PhieuNhap_MaTBGH
               ON dbo.PhieuNhap(MaTBGH) WHERE MaTBGH IS NOT NULL;');

    COMMIT TRANSACTION;
    PRINT N'Đã bổ sung quản lý chuyến giao hàng; dữ liệu hiện có được giữ nguyên.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
