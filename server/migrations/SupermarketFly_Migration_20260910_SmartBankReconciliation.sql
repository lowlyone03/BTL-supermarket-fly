/* P3 — Đối soát ngân hàng thông minh + cột MaThamChieu trên DongSaoKe
   Idempotent. UC42. Không tạo UC mới. */
IF COL_LENGTH(N'dbo.DongSaoKe', N'MaThamChieu') IS NULL
    ALTER TABLE dbo.DongSaoKe ADD MaThamChieu NVARCHAR(80) NULL;
GO

IF OBJECT_ID(N'dbo.KetQuaDoiSoatNganHang', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.KetQuaDoiSoatNganHang (
        MaKetQua BIGINT IDENTITY(1,1) NOT NULL,
        MaDong BIGINT NOT NULL,
        MaSaoKe VARCHAR(20) NOT NULL,
        TrangThaiGoiY NVARCHAR(30) NOT NULL,
        TrangThaiKT NVARCHAR(30) NOT NULL CONSTRAINT DF_KQDS_KT DEFAULT N'Chờ xác nhận',
        DiemKhop INT NOT NULL CONSTRAINT DF_KQDS_Diem DEFAULT 0,
        LyDo NVARCHAR(500) NULL,
        LoaiChungTu NVARCHAR(40) NULL,
        MaChungTu VARCHAR(40) NULL,
        MaThamChieu NVARCHAR(80) NULL,
        SoTienSaoKe DECIMAL(18,2) NOT NULL,
        SoTienChungTu DECIMAL(18,2) NULL,
        ChenLech DECIMAL(18,2) NULL,
        TenDoiTac NVARCHAR(150) NULL,
        MaNV_XacNhan VARCHAR(20) NULL,
        NgayXacNhan DATETIME NULL,
        NgayTinh DATETIME NOT NULL CONSTRAINT DF_KQDS_Tinh DEFAULT GETDATE(),
        CONSTRAINT PK_KetQuaDoiSoatNganHang PRIMARY KEY (MaKetQua),
        CONSTRAINT UQ_KQDS_MaDong UNIQUE (MaDong),
        CONSTRAINT CK_KQDS_GoiY CHECK (TrangThaiGoiY IN (N'Khớp tự động', N'Gợi ý', N'Chênh lệch', N'Chưa khớp')),
        CONSTRAINT CK_KQDS_KT CHECK (TrangThaiKT IN (N'Chờ xác nhận', N'Đã xác nhận', N'Bỏ gợi ý'))
    );
END
GO

IF OBJECT_ID(N'dbo.KetQuaDoiSoatNganHang', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.DongSaoKe', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_KQDS_Dong')
    ALTER TABLE dbo.KetQuaDoiSoatNganHang ADD CONSTRAINT FK_KQDS_Dong
        FOREIGN KEY (MaDong) REFERENCES dbo.DongSaoKe (MaDong);
GO

IF OBJECT_ID(N'dbo.UngVienDoiSoat', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UngVienDoiSoat (
        MaUngVien BIGINT IDENTITY(1,1) NOT NULL,
        MaDong BIGINT NOT NULL,
        LoaiChungTu NVARCHAR(40) NOT NULL,
        MaChungTu VARCHAR(40) NOT NULL,
        DiemKhop INT NOT NULL,
        LyDo NVARCHAR(400) NULL,
        SoTien DECIMAL(18,2) NOT NULL,
        NgayGD DATE NULL,
        MaThamChieu NVARCHAR(80) NULL,
        TenDoiTac NVARCHAR(150) NULL,
        ChenLech DECIMAL(18,2) NULL,
        CONSTRAINT PK_UngVienDoiSoat PRIMARY KEY (MaUngVien)
    );
END
GO

IF OBJECT_ID(N'dbo.UngVienDoiSoat', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_UngVienDoiSoat_Dong' AND object_id = OBJECT_ID(N'dbo.UngVienDoiSoat')
   )
    CREATE INDEX IX_UngVienDoiSoat_Dong ON dbo.UngVienDoiSoat (MaDong);
GO
