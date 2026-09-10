/* P5-MIN — Chat nội bộ 6 kênh. Idempotent.
   Ma trận CHỐT MỚI: #kho = QL+TK+MH; #mua-hàng = QL+MH+TK;
   #kế-toán = QL+KT (TN không vào); #thu-ngân = QL+TN; #quản-lý = QL; #cửa-hàng = tất cả.
   TinNhanDaDoc.MaTinCuoi = WATERMARK, không FK tới tin còn sống. */
IF OBJECT_ID(N'dbo.PhongChat', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PhongChat (
        MaPhong      VARCHAR(40)   NOT NULL,
        Khoa         VARCHAR(40)   NOT NULL,
        TenPhong     NVARCHAR(100) NOT NULL,
        LoaiPhong    NVARCHAR(20)  NOT NULL,
        MaVaiTro     INT           NULL,
        MoTa         NVARCHAR(200) NULL,
        NgayTao      DATETIME      NOT NULL CONSTRAINT DF_PhongChat_NgayTao DEFAULT GETDATE(),
        TrangThai    NVARCHAR(20)  NOT NULL CONSTRAINT DF_PhongChat_TT DEFAULT N'DangMo',
        CONSTRAINT PK_PhongChat PRIMARY KEY (MaPhong),
        CONSTRAINT CK_PhongChat_Loai CHECK (LoaiPhong IN (N'KenhChung', N'KenhVaiTro', N'DM', N'Nhom')),
        CONSTRAINT CK_PhongChat_TT CHECK (TrangThai IN (N'DangMo', N'Dong'))
    );
END
GO

IF OBJECT_ID(N'dbo.PhongChat', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.VaiTro', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PhongChat_VaiTro')
    ALTER TABLE dbo.PhongChat ADD CONSTRAINT FK_PhongChat_VaiTro
        FOREIGN KEY (MaVaiTro) REFERENCES dbo.VaiTro (MaVaiTro);
GO

IF OBJECT_ID(N'dbo.PhongChat', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_PhongChat_Khoa' AND object_id = OBJECT_ID(N'dbo.PhongChat')
   )
    CREATE UNIQUE INDEX UX_PhongChat_Khoa ON dbo.PhongChat (Khoa);
GO

IF OBJECT_ID(N'dbo.ThanhVienPhongChat', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ThanhVienPhongChat (
        MaPhong      VARCHAR(40) NOT NULL,
        MaNV         VARCHAR(20) NOT NULL,
        NgayVao      DATETIME    NOT NULL CONSTRAINT DF_TVPC_NgayVao DEFAULT GETDATE(),
        AnKhoiPhong  BIT         NOT NULL CONSTRAINT DF_TVPC_An DEFAULT (0),
        CONSTRAINT PK_ThanhVienPhongChat PRIMARY KEY (MaPhong, MaNV),
        CONSTRAINT FK_TVPC_Phong FOREIGN KEY (MaPhong) REFERENCES dbo.PhongChat (MaPhong),
        CONSTRAINT FK_TVPC_NV    FOREIGN KEY (MaNV)    REFERENCES dbo.NhanVien (MaNV)
    );
END
GO

IF OBJECT_ID(N'dbo.ThanhVienPhongChat', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_TVPC_NV' AND object_id = OBJECT_ID(N'dbo.ThanhVienPhongChat')
   )
    CREATE INDEX IX_TVPC_NV ON dbo.ThanhVienPhongChat (MaNV, AnKhoiPhong) INCLUDE (MaPhong);
GO

IF OBJECT_ID(N'dbo.TinNhan', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TinNhan (
        MaTin         BIGINT IDENTITY(1,1) NOT NULL,
        MaPhong       VARCHAR(40)    NOT NULL,
        MaNV_Gui      VARCHAR(20)    NOT NULL,
        TenNV_Gui     NVARCHAR(100)  NOT NULL,
        TenVaiTro_Gui NVARCHAR(50)   NOT NULL,
        NoiDung       NVARCHAR(1000) NOT NULL,
        LoaiTin       NVARCHAR(20)   NOT NULL CONSTRAINT DF_TinNhan_Loai DEFAULT N'VanBan',
        DuongDanFile  NVARCHAR(260)  NULL,
        TenFile       NVARCHAR(200)  NULL,
        MimeFile      VARCHAR(80)    NULL,
        DungLuong     INT            NULL,
        LoaiChungTu   NVARCHAR(40)   NULL,
        MaChungTu     VARCHAR(40)    NULL,
        NgayGui       DATETIME       NOT NULL CONSTRAINT DF_TinNhan_NgayGui DEFAULT GETDATE(),
        DaXoa         BIT            NOT NULL CONSTRAINT DF_TinNhan_Xoa DEFAULT (0),
        CONSTRAINT PK_TinNhan PRIMARY KEY (MaTin),
        CONSTRAINT CK_TinNhan_Loai CHECK (LoaiTin IN (N'VanBan', N'HeThong', N'Anh', N'File', N'ChungTu')),
        CONSTRAINT FK_TinNhan_Phong FOREIGN KEY (MaPhong) REFERENCES dbo.PhongChat (MaPhong),
        CONSTRAINT FK_TinNhan_Gui   FOREIGN KEY (MaNV_Gui) REFERENCES dbo.NhanVien (MaNV)
    );
END
GO

IF COL_LENGTH(N'dbo.TinNhan', N'DuongDanFile') IS NULL
    ALTER TABLE dbo.TinNhan ADD DuongDanFile NVARCHAR(260) NULL;
GO
IF COL_LENGTH(N'dbo.TinNhan', N'TenFile') IS NULL
    ALTER TABLE dbo.TinNhan ADD TenFile NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'dbo.TinNhan', N'MimeFile') IS NULL
    ALTER TABLE dbo.TinNhan ADD MimeFile VARCHAR(80) NULL;
GO
IF COL_LENGTH(N'dbo.TinNhan', N'DungLuong') IS NULL
    ALTER TABLE dbo.TinNhan ADD DungLuong INT NULL;
GO
IF COL_LENGTH(N'dbo.TinNhan', N'LoaiChungTu') IS NULL
    ALTER TABLE dbo.TinNhan ADD LoaiChungTu NVARCHAR(40) NULL;
GO
IF COL_LENGTH(N'dbo.TinNhan', N'MaChungTu') IS NULL
    ALTER TABLE dbo.TinNhan ADD MaChungTu VARCHAR(40) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_TinNhan_Loai')
    ALTER TABLE dbo.TinNhan DROP CONSTRAINT CK_TinNhan_Loai;
GO
IF OBJECT_ID(N'dbo.TinNhan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_TinNhan_Loai')
    ALTER TABLE dbo.TinNhan ADD CONSTRAINT CK_TinNhan_Loai
        CHECK (LoaiTin IN (N'VanBan', N'HeThong', N'Anh', N'File', N'ChungTu'));
GO

IF OBJECT_ID(N'dbo.TinNhan', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_TinNhan_PhongNgay' AND object_id = OBJECT_ID(N'dbo.TinNhan')
   )
    CREATE INDEX IX_TinNhan_PhongNgay ON dbo.TinNhan (MaPhong, NgayGui DESC) INCLUDE (MaTin, DaXoa);
GO

IF OBJECT_ID(N'dbo.TinNhan', N'U') IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_TinNhan_PhongTin' AND object_id = OBJECT_ID(N'dbo.TinNhan')
   )
    CREATE INDEX IX_TinNhan_PhongTin ON dbo.TinNhan (MaPhong, MaTin);
GO

-- Watermark đã đọc: KHÔNG FK MaTinCuoi → TinNhan.
-- Cleanup xóa tin cũ; watermark nhỏ hơn MIN(MaTin) còn lại vẫn OK (unread = MaTin > MaTinCuoi).
IF OBJECT_ID(N'dbo.TinNhanDaDoc', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TinNhanDaDoc (
        MaPhong      VARCHAR(40) NOT NULL,
        MaNV         VARCHAR(20) NOT NULL,
        MaTinCuoi    BIGINT      NOT NULL CONSTRAINT DF_TNDD_Tin DEFAULT (0),
        NgayDoc      DATETIME    NOT NULL CONSTRAINT DF_TNDD_Ngay DEFAULT GETDATE(),
        CONSTRAINT PK_TinNhanDaDoc PRIMARY KEY (MaPhong, MaNV),
        CONSTRAINT FK_TNDD_Phong FOREIGN KEY (MaPhong) REFERENCES dbo.PhongChat (MaPhong),
        CONSTRAINT FK_TNDD_NV    FOREIGN KEY (MaNV)    REFERENCES dbo.NhanVien (MaNV)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PhongChat WHERE MaPhong = 'CH_CUAHANG')
    INSERT INTO dbo.PhongChat (MaPhong, Khoa, TenPhong, LoaiPhong, MaVaiTro, MoTa)
    VALUES ('CH_CUAHANG', 'cua-hang', N'#cửa-hàng', N'KenhChung', NULL, N'Kênh chung mọi bộ phận');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PhongChat WHERE MaPhong = 'CH_QUANLY')
    INSERT INTO dbo.PhongChat (MaPhong, Khoa, TenPhong, LoaiPhong, MaVaiTro, MoTa)
    SELECT 'CH_QUANLY', 'quan-ly', N'#quản-lý', N'KenhVaiTro', MaVaiTro, N'Chỉ Quản lý'
    FROM dbo.VaiTro WHERE TenVaiTro = N'Quản lý';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PhongChat WHERE MaPhong = 'CH_KHO')
    INSERT INTO dbo.PhongChat (MaPhong, Khoa, TenPhong, LoaiPhong, MaVaiTro, MoTa)
    SELECT 'CH_KHO', 'kho', N'#kho', N'KenhVaiTro', MaVaiTro, N'QL + Thủ kho + Mua hàng'
    FROM dbo.VaiTro WHERE TenVaiTro = N'Thủ kho';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PhongChat WHERE MaPhong = 'CH_MUAHANG')
    INSERT INTO dbo.PhongChat (MaPhong, Khoa, TenPhong, LoaiPhong, MaVaiTro, MoTa)
    SELECT 'CH_MUAHANG', 'mua-hang', N'#mua-hàng', N'KenhVaiTro', MaVaiTro, N'QL + Mua hàng + Thủ kho'
    FROM dbo.VaiTro WHERE TenVaiTro = N'Nhân viên mua hàng';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PhongChat WHERE MaPhong = 'CH_KETOAN')
    INSERT INTO dbo.PhongChat (MaPhong, Khoa, TenPhong, LoaiPhong, MaVaiTro, MoTa)
    SELECT 'CH_KETOAN', 'ke-toan', N'#kế-toán', N'KenhVaiTro', MaVaiTro, N'QL + Kế toán — không Thu ngân'
    FROM dbo.VaiTro WHERE TenVaiTro = N'Kế toán';
GO
IF NOT EXISTS (SELECT 1 FROM dbo.PhongChat WHERE MaPhong = 'CH_THUNGAN')
    INSERT INTO dbo.PhongChat (MaPhong, Khoa, TenPhong, LoaiPhong, MaVaiTro, MoTa)
    SELECT 'CH_THUNGAN', 'thu-ngan', N'#thu-ngân', N'KenhVaiTro', MaVaiTro, N'QL + Thu ngân'
    FROM dbo.VaiTro WHERE TenVaiTro = N'Thu ngân';
GO

-- Retention: chỉ xóa tin. Không xóa watermark / phòng / thành viên.
DELETE FROM dbo.TinNhan
WHERE NgayGui < DATEADD(DAY, -90, GETDATE())
  AND LoaiTin <> N'HeThong';
GO
