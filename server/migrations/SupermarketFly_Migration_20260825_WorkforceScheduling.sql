/* ============================================================
   MIGRATION 2026-08-25: PHAN CA, CHAM CONG VA LUONG TAM TINH
   - An toan khi chay lai nhieu lan.
   - Khong xoa lich su nghiep vu hien co.
   ============================================================ */
USE SupermarketFlyDB;
GO

IF OBJECT_ID('dbo.LoaiCa', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.LoaiCa (
        MaLoaiCa VARCHAR(20) NOT NULL,
        TenCa NVARCHAR(80) NOT NULL,
        GioBatDau TIME(0) NOT NULL,
        GioKetThuc TIME(0) NOT NULL,
        SoGio DECIMAL(4,2) NOT NULL,
        SoNguoiCan TINYINT NOT NULL,
        ThuTu TINYINT NOT NULL,
        LaCaDem BIT NOT NULL DEFAULT 0,
        TrangThai TINYINT NOT NULL DEFAULT 1,
        CONSTRAINT PK_LoaiCa PRIMARY KEY (MaLoaiCa),
        CONSTRAINT CK_LoaiCa_SoGio CHECK (SoGio > 0 AND SoGio <= 12),
        CONSTRAINT CK_LoaiCa_SoNguoi CHECK (SoNguoiCan > 0)
    );
END;
GO

MERGE dbo.LoaiCa AS target
USING (VALUES
    ('SANG',    N'Ca sáng',          CAST('06:00' AS TIME), CAST('14:00' AS TIME), 8.0, 1, 1, 0),
    ('TRUA_TC', N'Tăng cường trưa',  CAST('10:00' AS TIME), CAST('14:00' AS TIME), 4.0, 1, 2, 0),
    ('CHIEU',   N'Ca chiều',         CAST('14:00' AS TIME), CAST('22:00' AS TIME), 8.0, 1, 3, 0),
    ('TOI_TC',  N'Tăng cường tối',   CAST('18:00' AS TIME), CAST('22:00' AS TIME), 4.0, 1, 4, 0),
    ('DEM',     N'Ca đêm',           CAST('22:00' AS TIME), CAST('06:00' AS TIME), 8.0, 1, 5, 1)
) AS source (MaLoaiCa,TenCa,GioBatDau,GioKetThuc,SoGio,SoNguoiCan,ThuTu,LaCaDem)
ON target.MaLoaiCa=source.MaLoaiCa
WHEN MATCHED THEN UPDATE SET TenCa=source.TenCa,GioBatDau=source.GioBatDau,
    GioKetThuc=source.GioKetThuc,SoGio=source.SoGio,SoNguoiCan=source.SoNguoiCan,
    ThuTu=source.ThuTu,LaCaDem=source.LaCaDem,TrangThai=1
WHEN NOT MATCHED THEN INSERT (MaLoaiCa,TenCa,GioBatDau,GioKetThuc,SoGio,SoNguoiCan,ThuTu,LaCaDem)
    VALUES (source.MaLoaiCa,source.TenCa,source.GioBatDau,source.GioKetThuc,source.SoGio,
            source.SoNguoiCan,source.ThuTu,source.LaCaDem);
GO

IF OBJECT_ID('dbo.QuayBanHang', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.QuayBanHang (
        MaQuay VARCHAR(20) NOT NULL,
        TenQuay NVARCHAR(80) NOT NULL,
        TrangThai NVARCHAR(30) NOT NULL DEFAULT N'Hoạt động',
        CONSTRAINT PK_QuayBanHang PRIMARY KEY (MaQuay)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.QuayBanHang WHERE MaQuay='Q01')
    INSERT dbo.QuayBanHang (MaQuay,TenQuay) VALUES ('Q01',N'Quầy thu ngân 1');
IF NOT EXISTS (SELECT 1 FROM dbo.QuayBanHang WHERE MaQuay='Q02')
    INSERT dbo.QuayBanHang (MaQuay,TenQuay) VALUES ('Q02',N'Quầy thu ngân 2');
GO

IF OBJECT_ID('dbo.LichLamViec', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.LichLamViec (
        MaLich BIGINT IDENTITY(1,1) NOT NULL,
        MaNV VARCHAR(20) NOT NULL,
        MaLoaiCa VARCHAR(20) NOT NULL,
        NgayLam DATE NOT NULL,
        NhiemVu NVARCHAR(100) NOT NULL,
        MaQuay VARCHAR(20) NULL,
        TrangThai NVARCHAR(30) NOT NULL DEFAULT N'Bản nháp',
        NguoiPhanCong VARCHAR(20) NOT NULL,
        GhiChu NVARCHAR(300) NULL,
        NgayTao DATETIME NOT NULL DEFAULT GETDATE(),
        NgayCapNhat DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_LichLamViec PRIMARY KEY (MaLich),
        CONSTRAINT UQ_LichLamViec_NhanVienNgay UNIQUE (MaNV,NgayLam),
        CONSTRAINT FK_LichLamViec_NhanVien FOREIGN KEY (MaNV) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT FK_LichLamViec_LoaiCa FOREIGN KEY (MaLoaiCa) REFERENCES dbo.LoaiCa(MaLoaiCa),
        CONSTRAINT FK_LichLamViec_Quay FOREIGN KEY (MaQuay) REFERENCES dbo.QuayBanHang(MaQuay),
        CONSTRAINT FK_LichLamViec_NguoiPhanCong FOREIGN KEY (NguoiPhanCong) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT CK_LichLamViec_TrangThai CHECK (TrangThai IN (N'Bản nháp',N'Đã công bố',N'Đã hủy'))
    );
    CREATE INDEX IX_LichLamViec_NgayLam ON dbo.LichLamViec(NgayLam,MaLoaiCa);
END;
GO

IF OBJECT_ID('dbo.ChamCong', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ChamCong (
        MaChamCong BIGINT IDENTITY(1,1) NOT NULL,
        MaLich BIGINT NOT NULL,
        ThoiGianVao DATETIME NULL,
        ThoiGianRa DATETIME NULL,
        TrangThai NVARCHAR(40) NOT NULL DEFAULT N'Chưa chấm công',
        SoPhutDuocDuyet INT NULL,
        NguoiDuyet VARCHAR(20) NULL,
        GhiChu NVARCHAR(300) NULL,
        NgayDuyet DATETIME NULL,
        CONSTRAINT PK_ChamCong PRIMARY KEY (MaChamCong),
        CONSTRAINT UQ_ChamCong_MaLich UNIQUE (MaLich),
        CONSTRAINT FK_ChamCong_Lich FOREIGN KEY (MaLich) REFERENCES dbo.LichLamViec(MaLich),
        CONSTRAINT FK_ChamCong_NguoiDuyet FOREIGN KEY (NguoiDuyet) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT CK_ChamCong_ThoiGian CHECK (ThoiGianRa IS NULL OR ThoiGianVao IS NULL OR ThoiGianRa >= ThoiGianVao)
    );
END;
GO

IF OBJECT_ID('dbo.MucLuongNhanVien', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MucLuongNhanVien (
        MaNV VARCHAR(20) NOT NULL,
        LuongGio DECIMAL(18,2) NOT NULL,
        HeSoBanDem DECIMAL(5,2) NOT NULL DEFAULT 1.30,
        NgayHieuLuc DATE NOT NULL,
        NgayHetHieuLuc DATE NULL,
        CONSTRAINT PK_MucLuongNhanVien PRIMARY KEY (MaNV,NgayHieuLuc),
        CONSTRAINT FK_MucLuongNhanVien_NhanVien FOREIGN KEY (MaNV) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT CK_MucLuongNhanVien_Luong CHECK (LuongGio > 0),
        CONSTRAINT CK_MucLuongNhanVien_HeSoDem CHECK (HeSoBanDem >= 1.30)
    );
END;
GO

IF COL_LENGTH('dbo.CaLamViec','MaLich') IS NULL
    ALTER TABLE dbo.CaLamViec ADD MaLich BIGINT NULL;
IF COL_LENGTH('dbo.CaLamViec','MaQuay') IS NULL
    ALTER TABLE dbo.CaLamViec ADD MaQuay VARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_CaLamViec_LichLamViec')
    ALTER TABLE dbo.CaLamViec ADD CONSTRAINT FK_CaLamViec_LichLamViec FOREIGN KEY (MaLich) REFERENCES dbo.LichLamViec(MaLich);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_CaLamViec_QuayBanHang')
    ALTER TABLE dbo.CaLamViec ADD CONSTRAINT FK_CaLamViec_QuayBanHang FOREIGN KEY (MaQuay) REFERENCES dbo.QuayBanHang(MaQuay);
GO

/* 8 nhan vien ban hang kiem thu ngan: giu NV_TN01 hien co va bo sung 7 ho so. */
MERGE dbo.NhanVien AS target
USING (VALUES
    ('NV_TN02',N'Nguyễn Hoàng Nam','0901000012','nam.nguyen@supermarket.fly'),
    ('NV_TN03',N'Đỗ Khánh Linh','0901000013','linh.do@supermarket.fly'),
    ('NV_TN04',N'Vũ Minh Quân','0901000014','quan.vu@supermarket.fly'),
    ('NV_TN05',N'Bùi Ngọc Mai','0901000015','mai.bui@supermarket.fly'),
    ('NV_TN06',N'Phan Tuấn Kiệt','0901000016','kiet.phan@supermarket.fly'),
    ('NV_TN07',N'Tạ Thu Trang','0901000017','trang.ta@supermarket.fly'),
    ('NV_TN08',N'Đặng Gia Huy','0901000018','huy.dang@supermarket.fly')
) AS source (MaNV,TenNV,SDT,Email)
ON target.MaNV=source.MaNV
WHEN MATCHED THEN UPDATE SET TenNV=source.TenNV,ChucVu=N'Thu ngân',TrangThai=N'Đang làm việc'
WHEN NOT MATCHED THEN INSERT (MaNV,TenNV,ChucVu,SDT,Email,DiaChi,TrangThai)
    VALUES (source.MaNV,source.TenNV,N'Thu ngân',source.SDT,source.Email,N'Hà Nội',N'Đang làm việc');
GO

INSERT dbo.MucLuongNhanVien (MaNV,LuongGio,HeSoBanDem,NgayHieuLuc)
SELECT nv.MaNV,55000,1.30,CONVERT(date,'2026-08-01')
FROM dbo.NhanVien nv
WHERE nv.ChucVu=N'Thu ngân'
  AND NOT EXISTS (SELECT 1 FROM dbo.MucLuongNhanVien ml WHERE ml.MaNV=nv.MaNV AND ml.NgayHieuLuc=CONVERT(date,'2026-08-01'));
GO

MERGE dbo.ChucNang AS target
USING (VALUES
    ('UC30',N'Phân công ca và giám sát chấm công',N'Nhân sự'),
    ('UC31',N'Xem lịch và chấm công cá nhân',N'Nhân sự'),
    ('UC32',N'Tổng hợp công và lương tạm tính',N'Nhân sự')
) AS source (MaChucNang,TenChucNang,Nhom)
ON target.MaChucNang=source.MaChucNang
WHEN MATCHED THEN UPDATE SET TenChucNang=source.TenChucNang,Nhom=source.Nhom
WHEN NOT MATCHED THEN INSERT (MaChucNang,TenChucNang,Nhom)
    VALUES (source.MaChucNang,source.TenChucNang,source.Nhom);
GO

DECLARE @QuanLy INT=(SELECT MaVaiTro FROM dbo.VaiTro WHERE TenVaiTro=N'Quản lý');
DECLARE @ThuNgan INT=(SELECT MaVaiTro FROM dbo.VaiTro WHERE TenVaiTro=N'Thu ngân');
MERGE dbo.VaiTro_ChucNang AS target
USING (SELECT @QuanLy MaVaiTro,'UC30' MaChucNang UNION ALL SELECT @QuanLy,'UC32' UNION ALL SELECT @ThuNgan,'UC31') source
ON target.MaVaiTro=source.MaVaiTro AND target.MaChucNang=source.MaChucNang
WHEN MATCHED THEN UPDATE SET DuocPhep=1
WHEN NOT MATCHED THEN INSERT (MaVaiTro,MaChucNang,DuocPhep) VALUES (source.MaVaiTro,source.MaChucNang,1);
GO

PRINT N'Đã hoàn tất migration phân ca, chấm công và lương tạm tính.';
GO
