-- Admin gốc (tài khoản hệ thống) khác với nhân viên được phong vai trò Quản lý.
-- Không dựa vào “đang là Quản lý” để cấm hạ cấp.
IF COL_LENGTH('dbo.TaiKhoan', 'IsFounder') IS NULL
    ALTER TABLE dbo.TaiKhoan ADD IsFounder BIT NOT NULL CONSTRAINT DF_TaiKhoan_IsFounder DEFAULT (0);
GO

IF COL_LENGTH('dbo.TaiKhoan', 'MaVaiTroTruoc') IS NULL
    ALTER TABLE dbo.TaiKhoan ADD MaVaiTroTruoc INT NULL;
GO

UPDATE dbo.TaiKhoan
SET IsFounder = 1
WHERE ISNULL(IsFounder, 0) = 0
  AND (LOWER(TenDangNhap) = 'admin' OR MaNV = 'NV_QL01');
GO
