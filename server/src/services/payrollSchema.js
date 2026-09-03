const { sql } = require('../config/db');

let schemaReady = false;
let schemaPromise = null;

const RATE_ROWS = [
    ['HS_THUONG_NGAY', 'Thuong', 'TrongCaNgay', 1.00, 'Trong ca, ban ngày, ngày thường — 100%'],
    ['HS_THUONG_DEM', 'Thuong', 'TrongCaDem', 1.30, 'Trong ca, ban đêm 22h–6h, ngày thường — 130%'],
    ['HS_THUONG_OTNG', 'Thuong', 'TangCaNgay', 1.50, 'Tăng ca ngày thường ban ngày — 150%'],
    ['HS_THUONG_OTDEM', 'Thuong', 'TangCaDem', 2.00, 'Tăng ca ngày thường ban đêm — 200%'],
    ['HS_TUAN_NGAY', 'NghiTuan', 'TrongCaNgay', 2.00, 'Làm ngày nghỉ hằng tuần ban ngày — 200%'],
    ['HS_TUAN_DEM', 'NghiTuan', 'TrongCaDem', 2.30, 'Làm ngày nghỉ hằng tuần ban đêm — 230%'],
    ['HS_TUAN_OTNG', 'NghiTuan', 'TangCaNgay', 2.40, 'Tăng ca ngày nghỉ tuần ban ngày — 240%'],
    ['HS_TUAN_OTDEM', 'NghiTuan', 'TangCaDem', 2.70, 'Tăng ca ngày nghỉ tuần ban đêm — 270%'],
    ['HS_LE_NGAY', 'LeTet', 'TrongCaNgay', 3.00, 'Làm lễ/Tết trong ca ban ngày — 300%'],
    ['HS_LE_DEM', 'LeTet', 'TrongCaDem', 3.30, 'Làm lễ/Tết trong ca ban đêm — 330%'],
    ['HS_LE_OTNG', 'LeTet', 'TangCaNgay', 3.60, 'Tăng ca lễ/Tết ban ngày — 360%'],
    ['HS_LE_OTDEM', 'LeTet', 'TangCaDem', 3.90, 'Tăng ca lễ/Tết ban đêm — 390%']
];

const HOLIDAY_2026 = [
    ['2026-01-01', 'Tết Dương lịch', 'TetDuongLich', 'CoDinh', 'Cố định 01/01'],
    ['2026-02-16', 'Tết Âm lịch — 29 tháng Chạp Ất Tỵ', 'TetAmLich', 'AmLich', 'TB 9441/BNV: 5 ngày Tết 16–20/02/2026. Quản lý sửa được nếu lệch.'],
    ['2026-02-17', 'Tết Âm lịch — mùng 1 Bính Ngọ', 'TetAmLich', 'AmLich', 'TB 9441/BNV'],
    ['2026-02-18', 'Tết Âm lịch — mùng 2', 'TetAmLich', 'AmLich', 'TB 9441/BNV'],
    ['2026-02-19', 'Tết Âm lịch — mùng 3', 'TetAmLich', 'AmLich', 'TB 9441/BNV'],
    ['2026-02-20', 'Tết Âm lịch — mùng 4', 'TetAmLich', 'AmLich', 'TB 9441/BNV'],
    ['2026-04-26', 'Giỗ Tổ Hùng Vương (10/03 âm)', 'GioTo', 'AmLich', '10/03 âm lịch năm 2026 = 26/04/2026. Quản lý sửa được.'],
    ['2026-04-30', 'Ngày Chiến thắng', 'ChienThang', 'CoDinh', 'Cố định 30/04'],
    ['2026-05-01', 'Ngày Quốc tế Lao động', 'LaoDong', 'CoDinh', 'Cố định 01/05'],
    ['2026-09-01', 'Quốc khánh — ngày liền kề', 'QuocKhanhLienKe', 'QuocKhanhLienKe', 'TB 9441/BNV chọn 01/09. Quản lý có thể đổi sang 03/09.'],
    ['2026-09-02', 'Quốc khánh', 'QuocKhanh', 'CoDinh', 'Cố định 02/09']
];

const run = (connection, text) => new sql.Request(connection).query(text);

const ensurePayrollSchema = async (connection) => {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await run(connection, `
            IF COL_LENGTH('dbo.NhanVien','NgayNghiViec') IS NULL
                ALTER TABLE dbo.NhanVien ADD NgayNghiViec DATE NULL;
            IF COL_LENGTH('dbo.KyLuong','NgayTatToan') IS NULL
                ALTER TABLE dbo.KyLuong ADD NgayTatToan TINYINT NOT NULL CONSTRAINT DF_KyLuong_NgayTatToan DEFAULT 10;
            IF COL_LENGTH('dbo.KyLuong','CoChiTre') IS NULL
                ALTER TABLE dbo.KyLuong ADD CoChiTre BIT NOT NULL CONSTRAINT DF_KyLuong_CoChiTre DEFAULT 0;
            IF COL_LENGTH('dbo.BangLuong','PhutLe') IS NULL
                ALTER TABLE dbo.BangLuong ADD PhutLe INT NOT NULL CONSTRAINT DF_BangLuong_PhutLe DEFAULT 0;
            IF COL_LENGTH('dbo.BangLuong','LuongNgayLe') IS NULL
                ALTER TABLE dbo.BangLuong ADD LuongNgayLe DECIMAL(18,2) NOT NULL CONSTRAINT DF_BangLuong_LuongNgayLe DEFAULT 0;
            IF COL_LENGTH('dbo.BangLuong','LuongTangCa') IS NULL
                ALTER TABLE dbo.BangLuong ADD LuongTangCa DECIMAL(18,2) NOT NULL CONSTRAINT DF_BangLuong_LuongTangCa DEFAULT 0;
            IF COL_LENGTH('dbo.BangLuong','PhuongThucChi') IS NULL
                ALTER TABLE dbo.BangLuong ADD PhuongThucChi NVARCHAR(30) NULL;
            IF COL_LENGTH('dbo.ChiTietBangLuong','LoaiNgay') IS NULL
                ALTER TABLE dbo.ChiTietBangLuong ADD LoaiNgay NVARCHAR(20) NULL;
            IF COL_LENGTH('dbo.ChiTietBangLuong','LoaiGio') IS NULL
                ALTER TABLE dbo.ChiTietBangLuong ADD LoaiGio NVARCHAR(20) NULL;
            IF COL_LENGTH('dbo.ChiTietBangLuong','HeSoApDung') IS NULL
                ALTER TABLE dbo.ChiTietBangLuong ADD HeSoApDung DECIMAL(5,2) NULL;`);
        await run(connection, `
            IF EXISTS (
                SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID('dbo.ChiTietBangLuong') AND name = 'MaChamCong' AND is_nullable = 0
            )
            BEGIN
                IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ChiTietBangLuong_ChamCong')
                    ALTER TABLE dbo.ChiTietBangLuong DROP CONSTRAINT FK_ChiTietBangLuong_ChamCong;
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_ChiTietBangLuong_CongNgay' AND object_id = OBJECT_ID('dbo.ChiTietBangLuong'))
                    ALTER TABLE dbo.ChiTietBangLuong DROP CONSTRAINT UQ_ChiTietBangLuong_CongNgay;
                ALTER TABLE dbo.ChiTietBangLuong ALTER COLUMN MaChamCong BIGINT NULL;
                ALTER TABLE dbo.ChiTietBangLuong ADD CONSTRAINT FK_ChiTietBangLuong_ChamCong
                    FOREIGN KEY (MaChamCong) REFERENCES dbo.ChamCong(MaChamCong);
            END`);
        await run(connection, `
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_ChiTietBangLuong_CongNgay' AND object_id = OBJECT_ID('dbo.ChiTietBangLuong'))
                ALTER TABLE dbo.ChiTietBangLuong DROP CONSTRAINT UQ_ChiTietBangLuong_CongNgay;`);
        await run(connection, `
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ChiTietBangLuong_CongGio' AND object_id = OBJECT_ID('dbo.ChiTietBangLuong'))
                CREATE UNIQUE INDEX UX_ChiTietBangLuong_CongGio
                    ON dbo.ChiTietBangLuong(MaBangLuong, MaChamCong, NgayCong, LoaiGio)
                    WHERE MaChamCong IS NOT NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ChiTietBangLuong_LeNghi' AND object_id = OBJECT_ID('dbo.ChiTietBangLuong'))
                CREATE UNIQUE INDEX UX_ChiTietBangLuong_LeNghi
                    ON dbo.ChiTietBangLuong(MaBangLuong, NgayCong)
                    WHERE LoaiGio = N'NgayLeNghi';`);
        await run(connection, `
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
            IF OBJECT_ID('dbo.QuyLuongKy','U') IS NULL
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
            END;
            IF OBJECT_ID('dbo.LichSuChiLuong','U') IS NULL
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
            END;`);
        for (const [ma, loaiNgay, loaiGio, heso, moTa] of RATE_ROWS) {
            await new sql.Request(connection)
                .input('MaHeSo', sql.VarChar, ma)
                .input('LoaiNgay', sql.NVarChar, loaiNgay)
                .input('LoaiGio', sql.NVarChar, loaiGio)
                .input('HeSo', sql.Decimal(5, 2), heso)
                .input('MoTa', sql.NVarChar, moTa)
                .query(`IF NOT EXISTS (SELECT 1 FROM dbo.HeSoLuongNgay WHERE MaHeSo=@MaHeSo)
                    INSERT dbo.HeSoLuongNgay(MaHeSo,LoaiNgay,LoaiGio,HeSo,MinHeSo,MoTa)
                    VALUES(@MaHeSo,@LoaiNgay,@LoaiGio,@HeSo,@HeSo,@MoTa)`);
        }
        for (const [ngay, ten, nhom, nguon, ghiChu] of HOLIDAY_2026) {
            await new sql.Request(connection)
                .input('Nam', sql.Int, 2026)
                .input('Ngay', sql.Date, ngay)
                .input('TenLe', sql.NVarChar, ten)
                .input('NhomLe', sql.NVarChar, nhom)
                .input('Nguon', sql.NVarChar, nguon)
                .input('GhiChu', sql.NVarChar, ghiChu)
                .query(`IF NOT EXISTS (SELECT 1 FROM dbo.NgayLeNam WHERE Nam=@Nam AND NgayDuongLich=@Ngay)
                    INSERT dbo.NgayLeNam(Nam,NgayDuongLich,TenLe,NhomLe,Nguon,GhiChu)
                    VALUES(@Nam,@Ngay,@TenLe,@NhomLe,@Nguon,@GhiChu)`);
        }
        schemaReady = true;
    })();
    try {
        await schemaPromise;
    } catch (error) {
        schemaPromise = null;
        throw error;
    }
};

module.exports = { ensurePayrollSchema, HOLIDAY_2026, RATE_ROWS };
