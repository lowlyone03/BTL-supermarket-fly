/* Bao cao kho do Thu kho nop cho Quan ly / Admin xem rieng.
   Khong thay Bao cao cua hang. Idempotent. */
USE SupermarketFlyDB;
GO

IF OBJECT_ID(N'dbo.BaoCaoKhoNop', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.BaoCaoKhoNop (
        MaBC VARCHAR(30) NOT NULL CONSTRAINT PK_BaoCaoKhoNop PRIMARY KEY,
        LoaiKy NVARCHAR(20) NOT NULL,
        GiaTriKy VARCHAR(20) NOT NULL,
        TuNgay DATE NOT NULL,
        DenNgay DATE NOT NULL,
        NhanKy NVARCHAR(120) NOT NULL,
        MaNV_Lap VARCHAR(20) NOT NULL,
        TenNV_Lap NVARCHAR(100) NOT NULL,
        NgayNop DATETIME NOT NULL CONSTRAINT DF_BaoCaoKhoNop_NgayNop DEFAULT GETDATE(),
        TrangThai NVARCHAR(30) NOT NULL CONSTRAINT DF_BaoCaoKhoNop_TT DEFAULT N'Đã gửi',
        GhiChu NVARCHAR(300) NULL,
        NoiDung NVARCHAR(MAX) NOT NULL,
        CONSTRAINT FK_BaoCaoKhoNop_NV FOREIGN KEY (MaNV_Lap) REFERENCES dbo.NhanVien(MaNV)
    );
    CREATE INDEX IX_BaoCaoKhoNop_Ky ON dbo.BaoCaoKhoNop (LoaiKy, GiaTriKy, NgayNop DESC);
    CREATE INDEX IX_BaoCaoKhoNop_NV ON dbo.BaoCaoKhoNop (MaNV_Lap, NgayNop DESC);
END
GO
