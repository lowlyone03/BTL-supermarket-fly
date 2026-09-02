/* Engine lương: lịch lễ VN, hệ số BLLĐ 2019, tất toán mùng 10, Phiếu chi lương TM/CK.
   Idempotent. Không sửa các file SQL đã chạy. Không tạo sổ cái / BHXH. */

IF COL_LENGTH('dbo.NhanVien','NgayNghiViec') IS NULL
    ALTER TABLE dbo.NhanVien ADD NgayNghiViec DATE NULL;
GO

IF COL_LENGTH('dbo.KyLuong','NgayTatToan') IS NULL
    ALTER TABLE dbo.KyLuong ADD NgayTatToan TINYINT NOT NULL CONSTRAINT DF_KyLuong_NgayTatToan DEFAULT 10;
IF COL_LENGTH('dbo.KyLuong','CoChiTre') IS NULL
    ALTER TABLE dbo.KyLuong ADD CoChiTre BIT NOT NULL CONSTRAINT DF_KyLuong_CoChiTre DEFAULT 0;
GO

IF COL_LENGTH('dbo.BangLuong','PhutLe') IS NULL
    ALTER TABLE dbo.BangLuong ADD PhutLe INT NOT NULL CONSTRAINT DF_BangLuong_PhutLe DEFAULT 0;
IF COL_LENGTH('dbo.BangLuong','LuongNgayLe') IS NULL
    ALTER TABLE dbo.BangLuong ADD LuongNgayLe DECIMAL(18,2) NOT NULL CONSTRAINT DF_BangLuong_LuongNgayLe DEFAULT 0;
IF COL_LENGTH('dbo.BangLuong','LuongTangCa') IS NULL
    ALTER TABLE dbo.BangLuong ADD LuongTangCa DECIMAL(18,2) NOT NULL CONSTRAINT DF_BangLuong_LuongTangCa DEFAULT 0;
IF COL_LENGTH('dbo.BangLuong','PhuongThucChi') IS NULL
    ALTER TABLE dbo.BangLuong ADD PhuongThucChi NVARCHAR(30) NULL;
GO

IF COL_LENGTH('dbo.ChiTietBangLuong','LoaiNgay') IS NULL
    ALTER TABLE dbo.ChiTietBangLuong ADD LoaiNgay NVARCHAR(20) NULL;
IF COL_LENGTH('dbo.ChiTietBangLuong','LoaiGio') IS NULL
    ALTER TABLE dbo.ChiTietBangLuong ADD LoaiGio NVARCHAR(20) NULL;
IF COL_LENGTH('dbo.ChiTietBangLuong','HeSoApDung') IS NULL
    ALTER TABLE dbo.ChiTietBangLuong ADD HeSoApDung DECIMAL(5,2) NULL;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.ChiTietBangLuong') AND name = 'MaChamCong' AND is_nullable = 0
)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ChiTietBangLuong_ChamCong')
        ALTER TABLE dbo.ChiTietBangLuong DROP CONSTRAINT FK_ChiTietBangLuong_ChamCong;
    ALTER TABLE dbo.ChiTietBangLuong ALTER COLUMN MaChamCong BIGINT NULL;
    ALTER TABLE dbo.ChiTietBangLuong ADD CONSTRAINT FK_ChiTietBangLuong_ChamCong
        FOREIGN KEY (MaChamCong) REFERENCES dbo.ChamCong(MaChamCong);
END;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_ChiTietBangLuong_CongNgay' AND object_id = OBJECT_ID('dbo.ChiTietBangLuong'))
    ALTER TABLE dbo.ChiTietBangLuong DROP CONSTRAINT UQ_ChiTietBangLuong_CongNgay;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ChiTietBangLuong_CongGio' AND object_id = OBJECT_ID('dbo.ChiTietBangLuong'))
    CREATE UNIQUE INDEX UX_ChiTietBangLuong_CongGio
        ON dbo.ChiTietBangLuong(MaBangLuong, MaChamCong, NgayCong, LoaiGio)
        WHERE MaChamCong IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ChiTietBangLuong_LeNghi' AND object_id = OBJECT_ID('dbo.ChiTietBangLuong'))
    CREATE UNIQUE INDEX UX_ChiTietBangLuong_LeNghi
        ON dbo.ChiTietBangLuong(MaBangLuong, NgayCong)
        WHERE LoaiGio = N'NgayLeNghi';
GO

IF OBJECT_ID('dbo.NgayLeNam','U') IS NULL
BEGIN
    CREATE TABLE dbo.NgayLeNam (
        Nam INT NOT NULL,
        NgayDuongLich DATE NOT NULL,
        TenLe NVARCHAR(100) NOT NULL,
        NhomLe NVARCHAR(30) NOT NULL,
        Nguon NVARCHAR(20) NOT NULL,
        GhiChu NVARCHAR(300) NULL,
        NguoiCapNhat VARCHAR(20) NULL,
        NgayCapNhat DATETIME NOT NULL CONSTRAINT DF_NgayLeNam_NgayCapNhat DEFAULT GETDATE(),
        NgayKhoa DATETIME NULL,
        CONSTRAINT PK_NgayLeNam PRIMARY KEY (Nam, NgayDuongLich),
        CONSTRAINT FK_NgayLeNam_NguoiCapNhat FOREIGN KEY (NguoiCapNhat) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT CK_NgayLeNam_Nguon CHECK (Nguon IN (N'CoDinh', N'AmLich', N'QuocKhanhLienKe')),
        CONSTRAINT CK_NgayLeNam_Nam CHECK (YEAR(NgayDuongLich) = Nam)
    );
END;
GO

IF OBJECT_ID('dbo.HeSoLuongNgay','U') IS NULL
BEGIN
    CREATE TABLE dbo.HeSoLuongNgay (
        MaHeSo VARCHAR(20) NOT NULL,
        LoaiNgay NVARCHAR(20) NOT NULL,
        LoaiGio NVARCHAR(20) NOT NULL,
        HeSo DECIMAL(5,2) NOT NULL,
        MinHeSo DECIMAL(5,2) NOT NULL,
        MoTa NVARCHAR(200) NULL,
        CONSTRAINT PK_HeSoLuongNgay PRIMARY KEY (MaHeSo),
        CONSTRAINT UQ_HeSoLuongNgay_Loai UNIQUE (LoaiNgay, LoaiGio),
        CONSTRAINT CK_HeSoLuongNgay_Min CHECK (HeSo >= MinHeSo AND MinHeSo > 0)
    );
END;
GO

MERGE dbo.HeSoLuongNgay AS target
USING (VALUES
    ('HS_THUONG_NGAY', N'Thuong',   N'TrongCaNgay', 1.00, 1.00, N'Trong ca, ban ngày, ngày thường — 100%'),
    ('HS_THUONG_DEM',  N'Thuong',   N'TrongCaDem',  1.30, 1.30, N'Trong ca, ban đêm 22h–6h, ngày thường — 130%'),
    ('HS_THUONG_OTNG', N'Thuong',   N'TangCaNgay',  1.50, 1.50, N'Tăng ca ngày thường ban ngày — 150%'),
    ('HS_THUONG_OTDEM',N'Thuong',   N'TangCaDem',   2.00, 2.00, N'Tăng ca ngày thường ban đêm — 200%'),
    ('HS_TUAN_NGAY',   N'NghiTuan', N'TrongCaNgay', 2.00, 2.00, N'Làm ngày nghỉ hằng tuần ban ngày — 200%'),
    ('HS_TUAN_DEM',    N'NghiTuan', N'TrongCaDem',  2.30, 2.30, N'Làm ngày nghỉ hằng tuần ban đêm — 230%'),
    ('HS_TUAN_OTNG',   N'NghiTuan', N'TangCaNgay',  2.40, 2.40, N'Tăng ca ngày nghỉ tuần ban ngày — 240%'),
    ('HS_TUAN_OTDEM',  N'NghiTuan', N'TangCaDem',   2.70, 2.70, N'Tăng ca ngày nghỉ tuần ban đêm — 270%'),
    ('HS_LE_NGAY',     N'LeTet',    N'TrongCaNgay', 3.00, 3.00, N'Làm lễ/Tết trong ca ban ngày — 300%'),
    ('HS_LE_DEM',      N'LeTet',    N'TrongCaDem',  3.30, 3.30, N'Làm lễ/Tết trong ca ban đêm — 330%'),
    ('HS_LE_OTNG',     N'LeTet',    N'TangCaNgay',  3.60, 3.60, N'Tăng ca lễ/Tết ban ngày — 360%'),
    ('HS_LE_OTDEM',    N'LeTet',    N'TangCaDem',   3.90, 3.90, N'Tăng ca lễ/Tết ban đêm — 390%')
) AS source (MaHeSo, LoaiNgay, LoaiGio, HeSo, MinHeSo, MoTa)
ON target.MaHeSo = source.MaHeSo
WHEN NOT MATCHED THEN
    INSERT (MaHeSo, LoaiNgay, LoaiGio, HeSo, MinHeSo, MoTa)
    VALUES (source.MaHeSo, source.LoaiNgay, source.LoaiGio, source.HeSo, source.MinHeSo, source.MoTa);
GO

/* 2026: Tết âm 16–20/02 theo TB 9441/BNV; Giỗ Tổ 10/3 âm = 26/04/2026; Quốc khánh liền kề 01/09. */
MERGE dbo.NgayLeNam AS target
USING (VALUES
    (2026, CONVERT(date,'2026-01-01'), N'Tết Dương lịch', N'TetDuongLich', N'CoDinh', N'Cố định 01/01'),
    (2026, CONVERT(date,'2026-02-16'), N'Tết Âm lịch — 29 tháng Chạp Ất Tỵ', N'TetAmLich', N'AmLich', N'TB 9441/BNV: 5 ngày Tết 16–20/02/2026. Quản lý sửa được nếu lệch.'),
    (2026, CONVERT(date,'2026-02-17'), N'Tết Âm lịch — mùng 1 Bính Ngọ', N'TetAmLich', N'AmLich', N'TB 9441/BNV'),
    (2026, CONVERT(date,'2026-02-18'), N'Tết Âm lịch — mùng 2', N'TetAmLich', N'AmLich', N'TB 9441/BNV'),
    (2026, CONVERT(date,'2026-02-19'), N'Tết Âm lịch — mùng 3', N'TetAmLich', N'AmLich', N'TB 9441/BNV'),
    (2026, CONVERT(date,'2026-02-20'), N'Tết Âm lịch — mùng 4', N'TetAmLich', N'AmLich', N'TB 9441/BNV'),
    (2026, CONVERT(date,'2026-04-26'), N'Giỗ Tổ Hùng Vương (10/03 âm)', N'GioTo', N'AmLich', N'10/03 âm lịch năm 2026 = 26/04/2026. Quản lý sửa được.'),
    (2026, CONVERT(date,'2026-04-30'), N'Ngày Chiến thắng', N'ChienThang', N'CoDinh', N'Cố định 30/04'),
    (2026, CONVERT(date,'2026-05-01'), N'Ngày Quốc tế Lao động', N'LaoDong', N'CoDinh', N'Cố định 01/05'),
    (2026, CONVERT(date,'2026-09-01'), N'Quốc khánh — ngày liền kề', N'QuocKhanhLienKe', N'QuocKhanhLienKe', N'TB 9441/BNV chọn 01/09. Quản lý có thể đổi sang 03/09.'),
    (2026, CONVERT(date,'2026-09-02'), N'Quốc khánh', N'QuocKhanh', N'CoDinh', N'Cố định 02/09')
) AS source (Nam, NgayDuongLich, TenLe, NhomLe, Nguon, GhiChu)
ON target.Nam = source.Nam AND target.NgayDuongLich = source.NgayDuongLich
WHEN NOT MATCHED THEN
    INSERT (Nam, NgayDuongLich, TenLe, NhomLe, Nguon, GhiChu)
    VALUES (source.Nam, source.NgayDuongLich, source.TenLe, source.NhomLe, source.Nguon, source.GhiChu);
GO

IF OBJECT_ID('dbo.PhieuChiLuong','U') IS NULL
BEGIN
    CREATE TABLE dbo.PhieuChiLuong (
        MaPhieu VARCHAR(30) NOT NULL,
        MaKy VARCHAR(7) NOT NULL,
        MaNV VARCHAR(20) NOT NULL,
        MaBangLuong BIGINT NOT NULL,
        SoTien DECIMAL(18,2) NOT NULL,
        PhuongThuc NVARCHAR(30) NOT NULL,
        TrangThai NVARCHAR(40) NOT NULL CONSTRAINT DF_PhieuChiLuong_TrangThai DEFAULT N'Chờ duyệt',
        NoiDung NVARCHAR(500) NULL,
        GhiChu NVARCHAR(500) NULL,
        MaNV_Lap VARCHAR(20) NOT NULL,
        NgayLap DATETIME NOT NULL CONSTRAINT DF_PhieuChiLuong_NgayLap DEFAULT GETDATE(),
        MaNV_Duyet VARCHAR(20) NULL,
        NgayDuyet DATETIME NULL,
        LyDoTuChoi NVARCHAR(500) NULL,
        HinhThucCapQuy NVARCHAR(40) NULL,
        NgayCapQuy DATETIME NULL,
        GhiChuCapQuy NVARCHAR(500) NULL,
        MaGiaoDichNganHang VARCHAR(50) NULL,
        CoChiTre BIT NOT NULL CONSTRAINT DF_PhieuChiLuong_CoChiTre DEFAULT 0,
        GhiChuTreHan NVARCHAR(500) NULL,
        NgayThanhToan DATETIME NULL,
        CONSTRAINT PK_PhieuChiLuong PRIMARY KEY (MaPhieu),
        CONSTRAINT UQ_PhieuChiLuong_KyNhanVien UNIQUE (MaKy, MaNV),
        CONSTRAINT FK_PhieuChiLuong_Ky FOREIGN KEY (MaKy) REFERENCES dbo.KyLuong(MaKy),
        CONSTRAINT FK_PhieuChiLuong_NV FOREIGN KEY (MaNV) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT FK_PhieuChiLuong_Bang FOREIGN KEY (MaBangLuong) REFERENCES dbo.BangLuong(MaBangLuong),
        CONSTRAINT FK_PhieuChiLuong_Lap FOREIGN KEY (MaNV_Lap) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT FK_PhieuChiLuong_Duyet FOREIGN KEY (MaNV_Duyet) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT CK_PhieuChiLuong_PT CHECK (PhuongThuc IN (N'Tiền mặt', N'Chuyển khoản')),
        CONSTRAINT CK_PhieuChiLuong_Tien CHECK (SoTien > 0)
    );
END;
GO
