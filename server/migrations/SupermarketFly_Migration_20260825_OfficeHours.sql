/* ============================================================
   MIGRATION 2026-08-25: CA HANH CHINH CHO MUA HANG / KHO / KE TOAN
   - 07:30-17:30, nghi trua 11:30-13:30, 8 gio cong.
   - Lam T2-T7, nghi Chu nhat (khong vuot 48 gio/tuan).
   ============================================================ */
USE SupermarketFlyDB;
GO

IF COL_LENGTH('dbo.LoaiCa','NhomCa') IS NULL
    ALTER TABLE dbo.LoaiCa ADD NhomCa NVARCHAR(20) NOT NULL
        CONSTRAINT DF_LoaiCa_NhomCa DEFAULT N'QUAY';
IF COL_LENGTH('dbo.LoaiCa','GioNghiBatDau') IS NULL
    ALTER TABLE dbo.LoaiCa ADD GioNghiBatDau TIME(0) NULL;
IF COL_LENGTH('dbo.LoaiCa','GioNghiKetThuc') IS NULL
    ALTER TABLE dbo.LoaiCa ADD GioNghiKetThuc TIME(0) NULL;
GO

UPDATE dbo.LoaiCa SET NhomCa=N'QUAY'
WHERE MaLoaiCa IN ('SANG','CHIEU','DEM','TRUA_TC','TOI_TC');
GO

MERGE dbo.LoaiCa AS target
USING (VALUES
    ('HANH_CHINH', N'Ca hành chính', CAST('07:30' AS TIME), CAST('17:30' AS TIME),
     8.0, 3, 6, 0, N'HANH_CHINH', CAST('11:30' AS TIME), CAST('13:30' AS TIME))
) AS source (MaLoaiCa,TenCa,GioBatDau,GioKetThuc,SoGio,SoNguoiCan,ThuTu,LaCaDem,NhomCa,GioNghiBatDau,GioNghiKetThuc)
ON target.MaLoaiCa=source.MaLoaiCa
WHEN MATCHED THEN UPDATE SET TenCa=source.TenCa,GioBatDau=source.GioBatDau,GioKetThuc=source.GioKetThuc,
    SoGio=source.SoGio,SoNguoiCan=source.SoNguoiCan,ThuTu=source.ThuTu,LaCaDem=source.LaCaDem,
    NhomCa=source.NhomCa,GioNghiBatDau=source.GioNghiBatDau,GioNghiKetThuc=source.GioNghiKetThuc,TrangThai=1
WHEN NOT MATCHED THEN INSERT
    (MaLoaiCa,TenCa,GioBatDau,GioKetThuc,SoGio,SoNguoiCan,ThuTu,LaCaDem,NhomCa,GioNghiBatDau,GioNghiKetThuc)
    VALUES (source.MaLoaiCa,source.TenCa,source.GioBatDau,source.GioKetThuc,source.SoGio,
            source.SoNguoiCan,source.ThuTu,source.LaCaDem,source.NhomCa,source.GioNghiBatDau,source.GioNghiKetThuc);
GO

INSERT dbo.MucLuongNhanVien (MaNV,LuongGio,HeSoBanDem,NgayHieuLuc)
SELECT nv.MaNV,55000,1.30,CONVERT(date,'2026-08-01')
FROM dbo.NhanVien nv
WHERE nv.ChucVu IN (N'Nhân viên mua hàng', N'Thủ kho', N'Kế toán')
  AND nv.TrangThai=N'Đang làm việc'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.MucLuongNhanVien ml
      WHERE ml.MaNV=nv.MaNV AND ml.NgayHieuLuc=CONVERT(date,'2026-08-01'));
GO

PRINT N'Da them ca hanh chinh 07:30-17:30, nghi trua 11:30-13:30 cho mua hang / kho / ke toan.';
GO
