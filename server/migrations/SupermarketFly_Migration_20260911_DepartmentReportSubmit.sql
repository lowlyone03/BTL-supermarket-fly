/* Bao cao bo phan (Mua hang / Ke toan / Thu ngan) nop cho Quan ly.
   Song song BaoCaoKhoNop — khong doi bang kho. Idempotent. */
USE SupermarketFlyDB;
GO

IF OBJECT_ID(N'dbo.BaoCaoBoPhanNop', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.BaoCaoBoPhanNop (
        MaBC VARCHAR(30) NOT NULL CONSTRAINT PK_BaoCaoBoPhanNop PRIMARY KEY,
        BoPhan NVARCHAR(20) NOT NULL,
        LoaiBaoCao VARCHAR(30) NOT NULL,
        LoaiKy NVARCHAR(20) NOT NULL,
        GiaTriKy VARCHAR(20) NOT NULL,
        TuNgay DATE NOT NULL,
        DenNgay DATE NOT NULL,
        NhanKy NVARCHAR(120) NOT NULL,
        SoPhien INT NOT NULL CONSTRAINT DF_BaoCaoBoPhanNop_Phien DEFAULT 1,
        MaCa VARCHAR(20) NULL,
        MaNV_Lap VARCHAR(20) NOT NULL,
        TenNV_Lap NVARCHAR(100) NOT NULL,
        NgayNop DATETIME NOT NULL CONSTRAINT DF_BaoCaoBoPhanNop_NgayNop DEFAULT GETDATE(),
        NgayXem DATETIME NULL,
        MaNV_Xem VARCHAR(20) NULL,
        TrangThai NVARCHAR(30) NOT NULL CONSTRAINT DF_BaoCaoBoPhanNop_TT DEFAULT N'Đã gửi',
        GhiChu NVARCHAR(300) NULL,
        PhanHoiQL NVARCHAR(500) NULL,
        NoiDung NVARCHAR(MAX) NOT NULL,
        CONSTRAINT FK_BaoCaoBoPhanNop_NV FOREIGN KEY (MaNV_Lap) REFERENCES dbo.NhanVien(MaNV)
    );
    CREATE INDEX IX_BaoCaoBoPhanNop_Ky ON dbo.BaoCaoBoPhanNop (BoPhan, LoaiBaoCao, LoaiKy, GiaTriKy, MaNV_Lap, SoPhien DESC);
    CREATE INDEX IX_BaoCaoBoPhanNop_TT ON dbo.BaoCaoBoPhanNop (TrangThai, NgayNop DESC);
    CREATE INDEX IX_BaoCaoBoPhanNop_NV ON dbo.BaoCaoBoPhanNop (MaNV_Lap, NgayNop DESC);
END
GO
