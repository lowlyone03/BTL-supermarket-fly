IF OBJECT_ID('dbo.QuyLuongKy', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.QuyLuongKy (
        MaKy VARCHAR(7) NOT NULL,
        SoTienMatGiao DECIMAL(18,2) NOT NULL CONSTRAINT DF_QuyLuongKy_MatGiao DEFAULT 0,
        SoTienMatCon DECIMAL(18,2) NOT NULL CONSTRAINT DF_QuyLuongKy_MatCon DEFAULT 0,
        SoTienCKGiao DECIMAL(18,2) NOT NULL CONSTRAINT DF_QuyLuongKy_CKGiao DEFAULT 0,
        SoTienCKCon DECIMAL(18,2) NOT NULL CONSTRAINT DF_QuyLuongKy_CKCon DEFAULT 0,
        MaNV_QL VARCHAR(20) NULL,
        NgayGiao DATETIME NULL,
        GhiChu NVARCHAR(500) NULL,
        NgayCapNhat DATETIME NOT NULL CONSTRAINT DF_QuyLuongKy_NgayCapNhat DEFAULT GETDATE(),
        CONSTRAINT PK_QuyLuongKy PRIMARY KEY (MaKy),
        CONSTRAINT FK_QuyLuongKy_Ky FOREIGN KEY (MaKy) REFERENCES dbo.KyLuong(MaKy),
        CONSTRAINT FK_QuyLuongKy_QL FOREIGN KEY (MaNV_QL) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT CK_QuyLuongKy_Mat CHECK (SoTienMatCon >= 0 AND SoTienMatGiao >= SoTienMatCon),
        CONSTRAINT CK_QuyLuongKy_CK CHECK (SoTienCKCon >= 0 AND SoTienCKGiao >= SoTienCKCon)
    );
END
GO

IF OBJECT_ID('dbo.LichSuChiLuong', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.LichSuChiLuong (
        MaLS BIGINT IDENTITY(1,1) NOT NULL,
        MaKy VARCHAR(7) NOT NULL,
        MaPhieu VARCHAR(30) NOT NULL,
        MaNV VARCHAR(20) NOT NULL,
        SoTien DECIMAL(18,2) NOT NULL,
        PhuongThuc NVARCHAR(30) NOT NULL,
        MaGiaoDichNganHang VARCHAR(50) NULL,
        SoTienMatCon DECIMAL(18,2) NOT NULL,
        SoTienCKCon DECIMAL(18,2) NOT NULL,
        MaNV_KT VARCHAR(20) NOT NULL,
        NgayChi DATETIME NOT NULL CONSTRAINT DF_LichSuChiLuong_NgayChi DEFAULT GETDATE(),
        ThanhCong BIT NOT NULL,
        GhiChu NVARCHAR(500) NULL,
        CONSTRAINT PK_LichSuChiLuong PRIMARY KEY (MaLS),
        CONSTRAINT FK_LichSuChiLuong_Ky FOREIGN KEY (MaKy) REFERENCES dbo.KyLuong(MaKy),
        CONSTRAINT FK_LichSuChiLuong_Phieu FOREIGN KEY (MaPhieu) REFERENCES dbo.PhieuChiLuong(MaPhieu),
        CONSTRAINT FK_LichSuChiLuong_NV FOREIGN KEY (MaNV) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT FK_LichSuChiLuong_KT FOREIGN KEY (MaNV_KT) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT CK_LichSuChiLuong_PT CHECK (PhuongThuc IN (N'Tiền mặt', N'Chuyển khoản')),
        CONSTRAINT CK_LichSuChiLuong_Tien CHECK (SoTien > 0)
    );
    CREATE INDEX IX_LichSuChiLuong_Ky ON dbo.LichSuChiLuong(MaKy, NgayChi DESC);
    CREATE INDEX IX_LichSuChiLuong_KT ON dbo.LichSuChiLuong(MaNV_KT, NgayChi DESC);
END
GO
