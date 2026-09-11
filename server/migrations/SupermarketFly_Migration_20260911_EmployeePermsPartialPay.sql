-- Phân quyền theo nhân viên, phiếu chi từng phần, xin gia hạn công nợ 45 ngày.
IF OBJECT_ID(N'dbo.NhanVien_ChucNang', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.NhanVien_ChucNang (
        MaNV        VARCHAR(20) NOT NULL,
                    MaChucNang  VARCHAR(20) NOT NULL,
        DuocPhep    BIT         NOT NULL CONSTRAINT DF_NVCN_Phep DEFAULT (1),
        NgayCapNhat DATETIME    NOT NULL CONSTRAINT DF_NVCN_Ngay DEFAULT GETDATE(),
        CONSTRAINT PK_NhanVien_ChucNang PRIMARY KEY (MaNV, MaChucNang)
    );
END
GO

IF OBJECT_ID(N'dbo.NhanVien_ChucNang', N'U') IS NOT NULL
   AND EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.NhanVien_ChucNang')
          AND name = N'MaChucNang' AND max_length < 20 AND system_type_id = 167
   )
BEGIN
    DECLARE @fk NVARCHAR(200);
    SELECT @fk = N'ALTER TABLE dbo.NhanVien_ChucNang DROP CONSTRAINT [' + fk.name + N'];'
    FROM sys.foreign_keys fk
    WHERE fk.parent_object_id = OBJECT_ID(N'dbo.NhanVien_ChucNang');
    WHILE @fk IS NOT NULL
    BEGIN
        EXEC sp_executesql @fk;
        SET @fk = NULL;
        SELECT @fk = N'ALTER TABLE dbo.NhanVien_ChucNang DROP CONSTRAINT [' + fk.name + N'];'
        FROM sys.foreign_keys fk
        WHERE fk.parent_object_id = OBJECT_ID(N'dbo.NhanVien_ChucNang');
    END
    DECLARE @pk SYSNAME;
    SELECT @pk = kc.name FROM sys.key_constraints kc
    WHERE kc.parent_object_id = OBJECT_ID(N'dbo.NhanVien_ChucNang') AND kc.[type] = 'PK';
    IF @pk IS NOT NULL
        EXEC(N'ALTER TABLE dbo.NhanVien_ChucNang DROP CONSTRAINT [' + @pk + N']');
    ALTER TABLE dbo.NhanVien_ChucNang ALTER COLUMN MaChucNang VARCHAR(20) NOT NULL;
    ALTER TABLE dbo.NhanVien_ChucNang ADD CONSTRAINT PK_NhanVien_ChucNang PRIMARY KEY (MaNV, MaChucNang);
END
GO

IF OBJECT_ID(N'dbo.NhanVien_ChucNang', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.NhanVien', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_NVCN_NhanVien')
    ALTER TABLE dbo.NhanVien_ChucNang ADD CONSTRAINT FK_NVCN_NhanVien
        FOREIGN KEY (MaNV) REFERENCES dbo.NhanVien (MaNV);
GO

IF OBJECT_ID(N'dbo.NhanVien_ChucNang', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.ChucNang', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_NVCN_ChucNang')
    ALTER TABLE dbo.NhanVien_ChucNang ADD CONSTRAINT FK_NVCN_ChucNang
        FOREIGN KEY (MaChucNang) REFERENCES dbo.ChucNang (MaChucNang);
GO

DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql = @sql + N'ALTER TABLE dbo.PhieuChi DROP CONSTRAINT [' + kc.name + N'];'
FROM sys.key_constraints kc
WHERE kc.parent_object_id = OBJECT_ID(N'dbo.PhieuChi')
  AND kc.[type] = 'UQ'
  AND EXISTS (
      SELECT 1
      FROM sys.index_columns ic
      JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE ic.object_id = kc.parent_object_id
        AND ic.index_id = kc.unique_index_id
        AND c.name = N'MaCongNo'
  );
IF @sql <> N'' EXEC sp_executesql @sql;
GO

DECLARE @sql2 NVARCHAR(MAX) = N'';
SELECT @sql2 = @sql2 + N'DROP INDEX [' + i.name + N'] ON dbo.PhieuChi;'
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID(N'dbo.PhieuChi')
  AND i.is_unique = 1
  AND i.is_primary_key = 0
  AND i.is_unique_constraint = 0
  AND EXISTS (
      SELECT 1
      FROM sys.index_columns ic
      JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND c.name = N'MaCongNo'
  );
IF @sql2 <> N'' EXEC sp_executesql @sql2;
GO

IF COL_LENGTH(N'dbo.PhieuChi', N'LoaiThanhToan') IS NULL
    ALTER TABLE dbo.PhieuChi ADD LoaiThanhToan NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.PhieuChi', N'PhanTram') IS NULL
    ALTER TABLE dbo.PhieuChi ADD PhanTram DECIMAL(9, 4) NULL;
GO

IF OBJECT_ID(N'dbo.PhieuChi', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_PhieuChi_MaCongNo' AND object_id = OBJECT_ID(N'dbo.PhieuChi')
   )
    CREATE INDEX IX_PhieuChi_MaCongNo ON dbo.PhieuChi (MaCongNo, TrangThai, NgayChungTu DESC);
GO

IF OBJECT_ID(N'dbo.CongNoGiaHan', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CongNoGiaHan (
        MaGiaHan     INT IDENTITY(1,1) NOT NULL,
        MaCNPTra     VARCHAR(20)   NOT NULL,
        MaNCC        VARCHAR(20)   NULL,
        MaNV_YeuCau  VARCHAR(20)   NOT NULL,
        MaNV_XuLy    VARCHAR(20)   NULL,
        NgayYeuCau   DATETIME      NOT NULL CONSTRAINT DF_CNGH_YeuCau DEFAULT GETDATE(),
        HanCu        DATE          NULL,
        HanMoi       DATE          NULL,
        SoNgayThem   INT           NULL,
        TrangThai    NVARCHAR(30)  NOT NULL CONSTRAINT DF_CNGH_TT DEFAULT N'ChoLienHe',
        GhiChu       NVARCHAR(500) NULL,
        MaPhongChat  VARCHAR(40)   NULL,
        MaTin        BIGINT        NULL,
        CONSTRAINT PK_CongNoGiaHan PRIMARY KEY (MaGiaHan)
    );
END
GO
