/* ============================================================
   MIGRATION 2026-08-25: WORKFORCE V2 + POS + DOI SOAT CA
   - Chay lap lai an toan.
   - Bo sung, khong xoa du lieu nghiep vu hien co.
   ============================================================ */
USE SupermarketFlyDB;
GO

/* ----- Lich lam viec: dong bang moc thoi gian du kien ----- */
IF COL_LENGTH('dbo.LichLamViec','BatDauDuKien') IS NULL
    ALTER TABLE dbo.LichLamViec ADD BatDauDuKien DATETIME NULL;
IF COL_LENGTH('dbo.LichLamViec','KetThucDuKien') IS NULL
    ALTER TABLE dbo.LichLamViec ADD KetThucDuKien DATETIME NULL;
IF COL_LENGTH('dbo.LichLamViec','NguonPhanCong') IS NULL
    ALTER TABLE dbo.LichLamViec ADD NguonPhanCong VARCHAR(20) NOT NULL
        CONSTRAINT DF_LichLamViec_Nguon DEFAULT 'Manual';
IF COL_LENGTH('dbo.LichLamViec','NgayCongBo') IS NULL
    ALTER TABLE dbo.LichLamViec ADD NgayCongBo DATETIME NULL;
IF COL_LENGTH('dbo.LichLamViec','NguoiCongBo') IS NULL
    ALTER TABLE dbo.LichLamViec ADD NguoiCongBo VARCHAR(20) NULL;
IF COL_LENGTH('dbo.LichLamViec','LyDoDieuChinh') IS NULL
    ALTER TABLE dbo.LichLamViec ADD LyDoDieuChinh NVARCHAR(300) NULL;
GO

UPDATE l
SET BatDauDuKien = DATEADD(SECOND,DATEDIFF(SECOND,CAST('00:00' AS TIME),lc.GioBatDau),CAST(l.NgayLam AS DATETIME)),
    KetThucDuKien = DATEADD(DAY,CASE WHEN lc.GioKetThuc<=lc.GioBatDau THEN 1 ELSE 0 END,
        DATEADD(SECOND,DATEDIFF(SECOND,CAST('00:00' AS TIME),lc.GioKetThuc),CAST(l.NgayLam AS DATETIME)))
FROM dbo.LichLamViec l
JOIN dbo.LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
WHERE l.BatDauDuKien IS NULL OR l.KetThucDuKien IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_LichLamViec_NguoiCongBo')
    ALTER TABLE dbo.LichLamViec ADD CONSTRAINT FK_LichLamViec_NguoiCongBo
        FOREIGN KEY (NguoiCongBo) REFERENCES dbo.NhanVien(MaNV);
GO

/* Ca chinh 8h = 1 nguoi full-time; tang cuong 4h = 1 nguoi part-time.
   Khung 10-14 va 18-22 co 2 nguoi: ca chinh + tang cuong. */
UPDATE dbo.LoaiCa SET SoNguoiCan=1 WHERE MaLoaiCa IN ('SANG','CHIEU','DEM','TRUA_TC','TOI_TC');
GO

/* ----- Cham cong va dieu chinh ----- */
IF COL_LENGTH('dbo.ChamCong','ThoiGianVaoDuocDuyet') IS NULL
    ALTER TABLE dbo.ChamCong ADD ThoiGianVaoDuocDuyet DATETIME NULL;
IF COL_LENGTH('dbo.ChamCong','ThoiGianRaDuocDuyet') IS NULL
    ALTER TABLE dbo.ChamCong ADD ThoiGianRaDuocDuyet DATETIME NULL;
IF COL_LENGTH('dbo.ChamCong','PhutDiMuon') IS NULL
    ALTER TABLE dbo.ChamCong ADD PhutDiMuon INT NOT NULL CONSTRAINT DF_ChamCong_PhutDiMuon DEFAULT 0;
IF COL_LENGTH('dbo.ChamCong','PhutVeSom') IS NULL
    ALTER TABLE dbo.ChamCong ADD PhutVeSom INT NOT NULL CONSTRAINT DF_ChamCong_PhutVeSom DEFAULT 0;
GO

IF OBJECT_ID('dbo.DieuChinhChamCong','U') IS NULL
BEGIN
    CREATE TABLE dbo.DieuChinhChamCong (
        MaDieuChinh BIGINT IDENTITY(1,1) NOT NULL,
        MaChamCong BIGINT NOT NULL,
        ThoiGianVaoDeXuat DATETIME NULL,
        ThoiGianRaDeXuat DATETIME NULL,
        LyDo NVARCHAR(500) NOT NULL,
        NguoiDeXuat VARCHAR(20) NOT NULL,
        NguoiDuyet VARCHAR(20) NULL,
        TrangThai NVARCHAR(30) NOT NULL DEFAULT N'Chờ duyệt',
        NgayDeXuat DATETIME NOT NULL DEFAULT GETDATE(),
        NgayDuyet DATETIME NULL,
        PhanHoi NVARCHAR(500) NULL,
        CONSTRAINT PK_DieuChinhChamCong PRIMARY KEY (MaDieuChinh),
        CONSTRAINT FK_DieuChinhChamCong_ChamCong FOREIGN KEY (MaChamCong) REFERENCES dbo.ChamCong(MaChamCong),
        CONSTRAINT FK_DieuChinhChamCong_NguoiDeXuat FOREIGN KEY (NguoiDeXuat) REFERENCES dbo.NhanVien(MaNV),
        CONSTRAINT FK_DieuChinhChamCong_NguoiDuyet FOREIGN KEY (NguoiDuyet) REFERENCES dbo.NhanVien(MaNV)
    );
END;
GO

/* ----- Ca ban hang va snapshot dong ca ----- */
IF COL_LENGTH('dbo.CaLamViec','TrangThaiDoiSoat') IS NULL
    ALTER TABLE dbo.CaLamViec ADD TrangThaiDoiSoat NVARCHAR(30) NOT NULL
        CONSTRAINT DF_CaLamViec_DoiSoat DEFAULT N'Chưa đóng';
IF COL_LENGTH('dbo.CaLamViec','NgayDongCa') IS NULL
    ALTER TABLE dbo.CaLamViec ADD NgayDongCa DATETIME NULL;
IF COL_LENGTH('dbo.CaLamViec','TongTienMat') IS NULL
    ALTER TABLE dbo.CaLamViec ADD TongTienMat DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.CaLamViec','TongTienQR') IS NULL
    ALTER TABLE dbo.CaLamViec ADD TongTienQR DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.CaLamViec','TongTienThe') IS NULL
    ALTER TABLE dbo.CaLamViec ADD TongTienThe DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.CaLamViec','TongTienChuyenKhoan') IS NULL
    ALTER TABLE dbo.CaLamViec ADD TongTienChuyenKhoan DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.CaLamViec','TongTienHoanMat') IS NULL
    ALTER TABLE dbo.CaLamViec ADD TongTienHoanMat DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.CaLamViec','TienMatHeThong') IS NULL
    ALTER TABLE dbo.CaLamViec ADD TienMatHeThong DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.CaLamViec','TienThucNop') IS NULL
    ALTER TABLE dbo.CaLamViec ADD TienThucNop DECIMAL(18,2) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_CaLamViec_NhanVien_DangMo')
    CREATE UNIQUE INDEX UX_CaLamViec_NhanVien_DangMo ON dbo.CaLamViec(MaNV)
    WHERE TrangThai=N'Đang mở';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_CaLamViec_Quay_DangMo')
    CREATE UNIQUE INDEX UX_CaLamViec_Quay_DangMo ON dbo.CaLamViec(MaQuay)
    WHERE TrangThai=N'Đang mở' AND MaQuay IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_HoaDon_MaCa_TrangThai')
    CREATE INDEX IX_HoaDon_MaCa_TrangThai ON dbo.HoaDon(MaCa,TrangThai);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ThanhToan_MaHD_TrangThai')
    CREATE INDEX IX_ThanhToan_MaHD_TrangThai ON dbo.ThanhToan(MaHD,TrangThai);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_ThanhToan_MaGiaoDich')
    CREATE UNIQUE INDEX UX_ThanhToan_MaGiaoDich ON dbo.ThanhToan(MaGiaoDich)
    WHERE MaGiaoDich IS NOT NULL;
GO

IF COL_LENGTH('dbo.PhieuDoiTra','MaCaHoan') IS NULL
    ALTER TABLE dbo.PhieuDoiTra ADD MaCaHoan VARCHAR(20) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_PhieuDoiTra_CaHoan')
    ALTER TABLE dbo.PhieuDoiTra ADD CONSTRAINT FK_PhieuDoiTra_CaHoan
        FOREIGN KEY (MaCaHoan) REFERENCES dbo.CaLamViec(MaCa);
GO

/* ----- Ky luong: phan mo rong, tach khoi loi nhuan gop ----- */
IF OBJECT_ID('dbo.KyLuong','U') IS NULL
BEGIN
    CREATE TABLE dbo.KyLuong (
        MaKy VARCHAR(7) NOT NULL,
        TuNgay DATE NOT NULL,
        DenNgay DATE NOT NULL,
        NgayTraDuKien DATE NULL,
        TrangThai NVARCHAR(40) NOT NULL DEFAULT N'Đang ghi nhận',
        NguoiLap VARCHAR(20) NULL,
        NgayLap DATETIME NOT NULL DEFAULT GETDATE(),
        NgayKhoa DATETIME NULL,
        CONSTRAINT PK_KyLuong PRIMARY KEY (MaKy),
        CONSTRAINT FK_KyLuong_NguoiLap FOREIGN KEY (NguoiLap) REFERENCES dbo.NhanVien(MaNV)
    );
END;
GO

IF OBJECT_ID('dbo.BangLuong','U') IS NULL
BEGIN
    CREATE TABLE dbo.BangLuong (
        MaBangLuong BIGINT IDENTITY(1,1) NOT NULL,
        MaKy VARCHAR(7) NOT NULL,
        MaNV VARCHAR(20) NOT NULL,
        PhutNgay INT NOT NULL DEFAULT 0,
        PhutDem INT NOT NULL DEFAULT 0,
        LuongCoBan DECIMAL(18,2) NOT NULL DEFAULT 0,
        LuongBanDem DECIMAL(18,2) NOT NULL DEFAULT 0,
        Thuong DECIMAL(18,2) NOT NULL DEFAULT 0,
        KhauTru DECIMAL(18,2) NOT NULL DEFAULT 0,
        TongLuong DECIMAL(18,2) NOT NULL DEFAULT 0,
        TrangThai NVARCHAR(30) NOT NULL DEFAULT N'Chờ duyệt',
        NgayThanhToan DATETIME NULL,
        MaGiaoDich VARCHAR(50) NULL,
        CONSTRAINT PK_BangLuong PRIMARY KEY (MaBangLuong),
        CONSTRAINT UQ_BangLuong_KyNhanVien UNIQUE (MaKy,MaNV),
        CONSTRAINT FK_BangLuong_Ky FOREIGN KEY (MaKy) REFERENCES dbo.KyLuong(MaKy),
        CONSTRAINT FK_BangLuong_NhanVien FOREIGN KEY (MaNV) REFERENCES dbo.NhanVien(MaNV)
    );
END;
GO

IF OBJECT_ID('dbo.ChiTietBangLuong','U') IS NULL
BEGIN
    CREATE TABLE dbo.ChiTietBangLuong (
        MaChiTiet BIGINT IDENTITY(1,1) NOT NULL,
        MaBangLuong BIGINT NOT NULL,
        MaChamCong BIGINT NOT NULL,
        NgayCong DATE NOT NULL,
        PhutNgay INT NOT NULL DEFAULT 0,
        PhutDem INT NOT NULL DEFAULT 0,
        LuongGio DECIMAL(18,2) NOT NULL,
        HeSoBanDem DECIMAL(5,2) NOT NULL,
        ThanhTien DECIMAL(18,2) NOT NULL,
        CONSTRAINT PK_ChiTietBangLuong PRIMARY KEY (MaChiTiet),
        CONSTRAINT UQ_ChiTietBangLuong_CongNgay UNIQUE (MaBangLuong,MaChamCong,NgayCong),
        CONSTRAINT FK_ChiTietBangLuong_BangLuong FOREIGN KEY (MaBangLuong) REFERENCES dbo.BangLuong(MaBangLuong),
        CONSTRAINT FK_ChiTietBangLuong_ChamCong FOREIGN KEY (MaChamCong) REFERENCES dbo.ChamCong(MaChamCong)
    );
END;
GO

/* ----- Quyen mo rong; khong thay doi 29 UC goc ----- */
MERGE dbo.ChucNang AS target
USING (VALUES
    ('UC30',N'Phân công ca và giám sát chấm công',N'Nhân sự'),
    ('UC31',N'Xem lịch và chấm công cá nhân',N'Nhân sự'),
    ('UC32',N'Duyệt công và tổng hợp lương tạm tính',N'Nhân sự'),
    ('UC33',N'Lập, khóa và thanh toán bảng lương',N'Nhân sự')
) source(MaChucNang,TenChucNang,Nhom)
ON target.MaChucNang=source.MaChucNang
WHEN MATCHED THEN UPDATE SET TenChucNang=source.TenChucNang,Nhom=source.Nhom
WHEN NOT MATCHED THEN INSERT(MaChucNang,TenChucNang,Nhom)
VALUES(source.MaChucNang,source.TenChucNang,source.Nhom);
GO

DECLARE @QuanLy INT=(SELECT MaVaiTro FROM dbo.VaiTro WHERE TenVaiTro=N'Quản lý');
DECLARE @ThuNgan INT=(SELECT MaVaiTro FROM dbo.VaiTro WHERE TenVaiTro=N'Thu ngân');
DECLARE @KeToan INT=(SELECT MaVaiTro FROM dbo.VaiTro WHERE TenVaiTro=N'Kế toán');
MERGE dbo.VaiTro_ChucNang target
USING (
    SELECT @QuanLy MaVaiTro,'UC30' MaChucNang UNION ALL
    SELECT @QuanLy,'UC32' UNION ALL
    SELECT @ThuNgan,'UC31' UNION ALL
    SELECT @KeToan,'UC33'
) source
ON target.MaVaiTro=source.MaVaiTro AND target.MaChucNang=source.MaChucNang
WHEN MATCHED THEN UPDATE SET DuocPhep=1
WHEN NOT MATCHED THEN INSERT(MaVaiTro,MaChucNang,DuocPhep)
VALUES(source.MaVaiTro,source.MaChucNang,1);
GO

PRINT N'Hoàn tất Workforce V2, POS, đối soát ca và nền bảng lương.';
GO

/* Xoa trang NV_TN09 / thungan09 neu con sot tu ban 9 thu ngan. */
DECLARE @MaNV VARCHAR(20) = 'NV_TN09';
DECLARE @MaTK INT = (
    SELECT TOP 1 MaTK FROM dbo.TaiKhoan
    WHERE MaNV = @MaNV OR TenDangNhap = 'thungan09'
);

IF OBJECT_ID('dbo.ChiTietBangLuong','U') IS NOT NULL
BEGIN
    DELETE ct FROM dbo.ChiTietBangLuong ct
    JOIN dbo.BangLuong bl ON bl.MaBangLuong = ct.MaBangLuong
    WHERE bl.MaNV = @MaNV;
    DELETE ct FROM dbo.ChiTietBangLuong ct
    JOIN dbo.ChamCong cc ON cc.MaChamCong = ct.MaChamCong
    JOIN dbo.LichLamViec l ON l.MaLich = cc.MaLich
    WHERE l.MaNV = @MaNV;
END;

IF OBJECT_ID('dbo.BangLuong','U') IS NOT NULL
    DELETE FROM dbo.BangLuong WHERE MaNV = @MaNV;
IF OBJECT_ID('dbo.KyLuong','U') IS NOT NULL
    UPDATE dbo.KyLuong SET NguoiLap = NULL WHERE NguoiLap = @MaNV;

IF OBJECT_ID('dbo.DieuChinhChamCong','U') IS NOT NULL
BEGIN
    UPDATE dbo.DieuChinhChamCong SET NguoiDuyet = NULL WHERE NguoiDuyet = @MaNV;
    DELETE d FROM dbo.DieuChinhChamCong d
    JOIN dbo.ChamCong cc ON cc.MaChamCong = d.MaChamCong
    JOIN dbo.LichLamViec l ON l.MaLich = cc.MaLich
    WHERE l.MaNV = @MaNV OR d.NguoiDeXuat = @MaNV;
END;

IF OBJECT_ID('dbo.ChamCong','U') IS NOT NULL
BEGIN
    UPDATE dbo.ChamCong SET NguoiDuyet = NULL WHERE NguoiDuyet = @MaNV;
    DELETE cc FROM dbo.ChamCong cc
    JOIN dbo.LichLamViec l ON l.MaLich = cc.MaLich
    WHERE l.MaNV = @MaNV;
END;

IF COL_LENGTH('dbo.PhieuDoiTra','MaCaHoan') IS NOT NULL
    UPDATE dbo.PhieuDoiTra SET MaCaHoan = NULL
    WHERE MaCaHoan IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV);

UPDATE dbo.PhieuDoiTra SET MaNV_Duyet = NULL WHERE MaNV_Duyet = @MaNV;
UPDATE dbo.PhieuDoiTra SET MaNV_KiemTra = NULL WHERE MaNV_KiemTra = @MaNV;

DELETE ctdt FROM dbo.ChiTietDoiTra ctdt
JOIN dbo.PhieuDoiTra dt ON dt.MaDT = ctdt.MaDT
WHERE dt.MaNV_Lap = @MaNV
   OR dt.MaHD IN (SELECT MaHD FROM dbo.HoaDon WHERE MaNV = @MaNV
                  OR MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV));

DELETE FROM dbo.PhieuDoiTra
WHERE MaNV_Lap = @MaNV
   OR MaHD IN (SELECT MaHD FROM dbo.HoaDon WHERE MaNV = @MaNV
               OR MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV));

DELETE FROM dbo.PhieuThu
WHERE MaNV_Lap = @MaNV
   OR MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV);

DELETE tt FROM dbo.ThanhToan tt
JOIN dbo.HoaDon hd ON hd.MaHD = tt.MaHD
WHERE hd.MaNV = @MaNV OR hd.MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV);

DELETE ct FROM dbo.ChiTietHoaDon ct
JOIN dbo.HoaDon hd ON hd.MaHD = ct.MaHD
WHERE hd.MaNV = @MaNV OR hd.MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV);

DELETE FROM dbo.HoaDon
WHERE MaNV = @MaNV OR MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV);

IF COL_LENGTH('dbo.CaLamViec','MaLich') IS NOT NULL
    UPDATE dbo.CaLamViec SET MaLich = NULL WHERE MaNV = @MaNV;
DELETE FROM dbo.CaLamViec WHERE MaNV = @MaNV;

IF OBJECT_ID('dbo.LichLamViec','U') IS NOT NULL
BEGIN
    UPDATE dbo.LichLamViec SET NguoiPhanCong = 'NV_QL01'
    WHERE NguoiPhanCong = @MaNV AND MaNV <> @MaNV;
    IF COL_LENGTH('dbo.LichLamViec','NguoiCongBo') IS NOT NULL
        UPDATE dbo.LichLamViec SET NguoiCongBo = 'NV_QL01'
        WHERE NguoiCongBo = @MaNV AND MaNV <> @MaNV;
    DELETE FROM dbo.LichLamViec WHERE MaNV = @MaNV;
END;

IF OBJECT_ID('dbo.MucLuongNhanVien','U') IS NOT NULL
    DELETE FROM dbo.MucLuongNhanVien WHERE MaNV = @MaNV;

UPDATE dbo.DeNghiMuaHang SET MaNV_TiepNhan = NULL WHERE MaNV_TiepNhan = @MaNV;
UPDATE dbo.DonMuaHang SET MaNV_Duyet = NULL WHERE MaNV_Duyet = @MaNV;
UPDATE dbo.PhieuXuat SET MaNV_Duyet = NULL WHERE MaNV_Duyet = @MaNV;
UPDATE dbo.KiemKe SET MaNV_Duyet = NULL WHERE MaNV_Duyet = @MaNV;
UPDATE dbo.PhieuChi SET MaNV_Duyet = NULL WHERE MaNV_Duyet = @MaNV;
UPDATE dbo.GiaoDichKho SET MaNV = 'NV_TN08' WHERE MaNV = @MaNV;
UPDATE dbo.PhieuNhap SET MaNV = 'NV_TN08' WHERE MaNV = @MaNV;
UPDATE dbo.PhieuXuat SET MaNV = 'NV_TN08' WHERE MaNV = @MaNV;
UPDATE dbo.KiemKe SET MaNV = 'NV_TN08' WHERE MaNV = @MaNV;
UPDATE dbo.HoaDonMuaHang SET MaNV = 'NV_TN08' WHERE MaNV = @MaNV;
UPDATE dbo.PhieuChi SET MaNV = 'NV_TN08' WHERE MaNV = @MaNV;
UPDATE dbo.DeNghiMuaHang SET MaNV_Lap = 'NV_QL01' WHERE MaNV_Lap = @MaNV;
UPDATE dbo.DonMuaHang SET MaNV_Lap = 'NV_QL01' WHERE MaNV_Lap = @MaNV;
UPDATE dbo.ThongBaoGiaoHang SET MaNVGhiNhan = 'NV_QL01' WHERE MaNVGhiNhan = @MaNV;

IF @MaTK IS NOT NULL
    DELETE FROM dbo.NhatKy WHERE MaTK = @MaTK;

DELETE FROM dbo.TaiKhoan WHERE MaNV = @MaNV OR TenDangNhap = 'thungan09';
DELETE FROM dbo.NhanVien WHERE MaNV = @MaNV;
GO
