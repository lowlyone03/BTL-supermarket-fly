/* Ngôn ngữ + giao diện theo nhân viên; mặc định cửa hàng khi NV chưa chọn. Idempotent. */
IF COL_LENGTH(N'dbo.TaiKhoan', N'NgonNgu') IS NULL
    ALTER TABLE dbo.TaiKhoan ADD NgonNgu VARCHAR(8) NULL;
IF COL_LENGTH(N'dbo.TaiKhoan', N'GiaoDien') IS NULL
    ALTER TABLE dbo.TaiKhoan ADD GiaoDien VARCHAR(16) NULL;
GO

IF OBJECT_ID(N'dbo.CauHinhCuaHang', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CauHinhCuaHang (
        MaCauHinh VARCHAR(40)  NOT NULL,
        GiaTri    NVARCHAR(80) NOT NULL,
        CONSTRAINT PK_CauHinhCuaHang PRIMARY KEY (MaCauHinh)
    );
END
GO

IF OBJECT_ID(N'dbo.CauHinhCuaHang', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.CauHinhCuaHang WHERE MaCauHinh = N'NgonNguMacDinh')
    INSERT INTO dbo.CauHinhCuaHang (MaCauHinh, GiaTri) VALUES (N'NgonNguMacDinh', N'vi');

IF OBJECT_ID(N'dbo.CauHinhCuaHang', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.CauHinhCuaHang WHERE MaCauHinh = N'GiaoDienMacDinh')
    INSERT INTO dbo.CauHinhCuaHang (MaCauHinh, GiaTri) VALUES (N'GiaoDienMacDinh', N'light');
GO
