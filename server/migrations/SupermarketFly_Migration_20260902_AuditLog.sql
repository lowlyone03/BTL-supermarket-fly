-- Nhật ký hệ thống: cột nghiệp vụ + độ dài mã chứng từ
SET NOCOUNT ON;
GO

IF COL_LENGTH('dbo.NhatKy', 'MaBanGhi') IS NOT NULL
    ALTER TABLE dbo.NhatKy ALTER COLUMN MaBanGhi VARCHAR(50) NULL;
GO

IF COL_LENGTH('dbo.NhatKy', 'HanhDong') IS NOT NULL
    ALTER TABLE dbo.NhatKy ALTER COLUMN HanhDong NVARCHAR(250) NOT NULL;
GO

IF COL_LENGTH('dbo.NhatKy', 'NoiDung') IS NOT NULL
    ALTER TABLE dbo.NhatKy ALTER COLUMN NoiDung NVARCHAR(1000) NULL;
GO

IF COL_LENGTH('dbo.NhatKy', 'MaUC') IS NULL
    ALTER TABLE dbo.NhatKy ADD MaUC NVARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.NhatKy', 'KetQua') IS NULL
    ALTER TABLE dbo.NhatKy ADD KetQua NVARCHAR(30) NULL;
GO

IF COL_LENGTH('dbo.NhatKy', 'MucDo') IS NULL
    ALTER TABLE dbo.NhatKy ADD MucDo NVARCHAR(30) NULL;
GO

IF COL_LENGTH('dbo.NhatKy', 'DuLieuJSON') IS NULL
    ALTER TABLE dbo.NhatKy ADD DuLieuJSON NVARCHAR(MAX) NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_NhatKy_ThoiGian' AND object_id = OBJECT_ID('dbo.NhatKy')
)
    CREATE INDEX IX_NhatKy_ThoiGian ON dbo.NhatKy (ThoiGian DESC, MaNK DESC);
GO

UPDATE dbo.NhatKy
SET NoiDung = N'Đăng nhập vào phần mềm quản lý cửa hàng. Không gắn chứng từ.',
    BangLienQuan = COALESCE(BangLienQuan, N'TaiKhoan'),
    KetQua = COALESCE(KetQua, N'Thành công'),
    MucDo = COALESCE(MucDo, N'Thông tin')
WHERE HanhDong LIKE N'%Đăng nhập%' AND (NoiDung IS NULL OR LTRIM(RTRIM(NoiDung)) = N'');
GO
