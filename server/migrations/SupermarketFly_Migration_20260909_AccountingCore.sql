/* KT loi + mo rong mini (plan 1.5 FINAL).
   Idempotent. Khong LIKE trong filtered index. Khong CauHinhDinhKhoan / DaKetChuyen / DoiChieuNganHang. */
USE SupermarketFlyDB;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

/* ---------- TaiKhoanKeToan + seed 18 TK ---------- */
IF OBJECT_ID(N'dbo.TaiKhoanKeToan', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TaiKhoanKeToan (
        MaTK VARCHAR(8) NOT NULL,
        TenTK NVARCHAR(200) NOT NULL,
        TinhChat NVARCHAR(20) NOT NULL,
        LoaiBC NVARCHAR(10) NOT NULL,
        MaCha VARCHAR(8) NULL,
        Cap TINYINT NOT NULL CONSTRAINT DF_TKKT_Cap DEFAULT 1,
        ChoPhepGhiSo BIT NOT NULL CONSTRAINT DF_TKKT_GhiSo DEFAULT 1,
        LaHeThong BIT NOT NULL CONSTRAINT DF_TKKT_HeThong DEFAULT 0,
        TrangThai NVARCHAR(20) NOT NULL CONSTRAINT DF_TKKT_TT DEFAULT N'Su dung',
        GhiChu NVARCHAR(300) NULL,
        CONSTRAINT PK_TaiKhoanKeToan PRIMARY KEY (MaTK),
        CONSTRAINT CK_TKKT_TinhChat CHECK (TinhChat IN (N'No', N'Co', N'LuongTinh')),
        CONSTRAINT CK_TKKT_LoaiBC CHECK (LoaiBC IN (N'TS', N'NV', N'DT', N'CP', N'TT')),
        CONSTRAINT CK_TKKT_TrangThai CHECK (TrangThai IN (N'Su dung', N'Ngung'))
    );
END
GO

IF OBJECT_ID(N'dbo.TaiKhoanKeToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_TKKT_MaCha')
    ALTER TABLE dbo.TaiKhoanKeToan ADD CONSTRAINT FK_TKKT_MaCha
        FOREIGN KEY (MaCha) REFERENCES dbo.TaiKhoanKeToan (MaTK);
GO

IF OBJECT_ID(N'dbo.TaiKhoanKeToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TaiKhoanKeToan_MaCha' AND object_id = OBJECT_ID(N'dbo.TaiKhoanKeToan'))
    CREATE INDEX IX_TaiKhoanKeToan_MaCha ON dbo.TaiKhoanKeToan (MaCha);
GO

IF OBJECT_ID(N'dbo.TaiKhoanKeToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TaiKhoanKeToan_TrangThai' AND object_id = OBJECT_ID(N'dbo.TaiKhoanKeToan'))
    CREATE INDEX IX_TaiKhoanKeToan_TrangThai ON dbo.TaiKhoanKeToan (TrangThai);
GO

IF OBJECT_ID(N'dbo.TaiKhoanKeToan', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM dbo.TaiKhoanKeToan)
BEGIN
    INSERT INTO dbo.TaiKhoanKeToan (MaTK, TenTK, TinhChat, LoaiBC, MaCha, Cap, ChoPhepGhiSo, LaHeThong, TrangThai, GhiChu) VALUES
    ('111', N'Tiền mặt', N'No', N'TS', NULL, 1, 1, 1, N'Su dung', N'Thu TM POS; chi TM'),
    ('112', N'Tiền gửi ngân hàng', N'No', N'TS', NULL, 1, 1, 1, N'Su dung', N'QR/Thẻ/CK; 1 TKNH mini'),
    ('1331', N'Thuế GTGT được khấu trừ', N'No', N'TS', NULL, 1, 1, 1, N'Su dung', N'VAT đầu vào'),
    ('138', N'Phải thu khác (thiếu quỹ ca)', N'No', N'TS', NULL, 1, 1, 1, N'Su dung', N'Lệch quỹ thiếu'),
    ('156', N'Hàng hóa', N'No', N'TS', NULL, 1, 1, 1, N'Su dung', N'Kho sổ cái'),
    ('211', N'TSCĐ hữu hình', N'No', N'TS', NULL, 1, 1, 1, N'Su dung', N'Nguyên giá chưa VAT'),
    ('214', N'Hao mòn TSCĐ', N'Co', N'TS', NULL, 1, 1, 1, N'Su dung', N'Khấu hao lũy kế'),
    ('331', N'Phải trả người bán', N'Co', N'NV', NULL, 1, 1, 1, N'Su dung', N'3-way; không mua TSCĐ'),
    ('33311', N'Thuế GTGT đầu ra', N'Co', N'NV', NULL, 1, 1, 1, N'Su dung', N'VAT bán'),
    ('334', N'Phải trả người lao động', N'Co', N'NV', NULL, 1, 1, 1, N'Su dung', N'Lương'),
    ('411', N'Vốn chủ sở hữu', N'Co', N'NV', NULL, 1, 1, 1, N'Su dung', N'Số dư đầu'),
    ('421', N'Kết quả kinh doanh lũy kế (mini, chưa TNDN)', N'Co', N'NV', NULL, 1, 1, 1, N'Su dung', N'Chưa thuế TNDN'),
    ('511', N'Doanh thu bán hàng', N'Co', N'DT', NULL, 1, 1, 1, N'Su dung', N'Chưa VAT'),
    ('5212', N'Chiết khấu / giảm giá', N'No', N'DT', NULL, 1, 1, 1, N'Su dung', N'Hoàn tiền / giảm giá'),
    ('632', N'Giá vốn hàng bán', N'No', N'CP', NULL, 1, 1, 1, N'Su dung', N'Xuất bán / hủy / KK thiếu'),
    ('642', N'Chi phí quản lý doanh nghiệp', N'No', N'CP', NULL, 1, 1, 1, N'Su dung', N'Lương, điện, KH, nội bộ'),
    ('711', N'Thu nhập khác', N'Co', N'DT', NULL, 1, 1, 1, N'Su dung', N'Thừa quỹ; KK thừa'),
    ('911', N'Xác định kết quả kinh doanh', N'LuongTinh', N'TT', NULL, 1, 1, 1, N'Su dung', N'Kết chuyển cuối kỳ');
END
GO

IF OBJECT_ID(N'dbo.TaiKhoanKeToan', N'U') IS NOT NULL
BEGIN
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Tiền mặt' WHERE MaTK = '111';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Tiền gửi ngân hàng' WHERE MaTK = '112';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Thuế GTGT được khấu trừ' WHERE MaTK = '1331';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Phải thu khác (thiếu quỹ ca)' WHERE MaTK = '138';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Hàng hóa' WHERE MaTK = '156';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'TSCĐ hữu hình' WHERE MaTK = '211';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Hao mòn TSCĐ' WHERE MaTK = '214';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Phải trả người bán' WHERE MaTK = '331';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Thuế GTGT đầu ra' WHERE MaTK = '33311';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Phải trả người lao động' WHERE MaTK = '334';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Vốn chủ sở hữu' WHERE MaTK = '411';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Kết quả kinh doanh lũy kế (mini, chưa TNDN)' WHERE MaTK = '421';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Doanh thu bán hàng' WHERE MaTK = '511';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Chiết khấu / giảm giá' WHERE MaTK = '5212';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Giá vốn hàng bán' WHERE MaTK = '632';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Chi phí quản lý doanh nghiệp' WHERE MaTK = '642';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Thu nhập khác' WHERE MaTK = '711';
    UPDATE dbo.TaiKhoanKeToan SET TenTK = N'Xác định kết quả kinh doanh' WHERE MaTK = '911';
END
GO

/* ---------- KyKeToan / SoDuDauKy ---------- */
IF OBJECT_ID(N'dbo.KyKeToan', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.KyKeToan (
        MaKy VARCHAR(7) NOT NULL,
        Nam SMALLINT NOT NULL,
        Thang TINYINT NOT NULL,
        TuNgay DATE NOT NULL,
        DenNgay DATE NOT NULL,
        TrangThai NVARCHAR(20) NOT NULL CONSTRAINT DF_Ky_TT DEFAULT N'ChuaMo',
        NgayMo DATETIME NULL,
        MaNV_Mo VARCHAR(20) NULL,
        NgayKhoa DATETIME NULL,
        MaNV_Khoa VARCHAR(20) NULL,
        GhiChu NVARCHAR(300) NULL,
        CONSTRAINT PK_KyKeToan PRIMARY KEY (MaKy),
        CONSTRAINT CK_Ky_Thang CHECK (Thang BETWEEN 1 AND 12),
        CONSTRAINT CK_Ky_TrangThai CHECK (TrangThai IN (N'ChuaMo', N'Mo', N'DeNghiKhoa', N'Khoa')),
        CONSTRAINT CK_Ky_Ngay CHECK (DenNgay >= TuNgay),
        CONSTRAINT UQ_Ky_NamThang UNIQUE (Nam, Thang)
    );
END
GO

IF OBJECT_ID(N'dbo.KyKeToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Ky_Mo')
    ALTER TABLE dbo.KyKeToan ADD CONSTRAINT FK_Ky_Mo FOREIGN KEY (MaNV_Mo) REFERENCES dbo.NhanVien (MaNV);
GO
IF OBJECT_ID(N'dbo.KyKeToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Ky_Khoa')
    ALTER TABLE dbo.KyKeToan ADD CONSTRAINT FK_Ky_Khoa FOREIGN KEY (MaNV_Khoa) REFERENCES dbo.NhanVien (MaNV);
GO

IF OBJECT_ID(N'dbo.SoDuDauKy', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SoDuDauKy (
        MaKy VARCHAR(7) NOT NULL,
        MaTK VARCHAR(8) NOT NULL,
        SoDuNo DECIMAL(18,2) NOT NULL CONSTRAINT DF_SoDu_No DEFAULT 0,
        SoDuCo DECIMAL(18,2) NOT NULL CONSTRAINT DF_SoDu_Co DEFAULT 0,
        DaChot BIT NOT NULL CONSTRAINT DF_SoDu_Chot DEFAULT 0,
        GhiChu NVARCHAR(200) NULL,
        CONSTRAINT PK_SoDuDauKy PRIMARY KEY (MaKy, MaTK),
        CONSTRAINT CK_SoDu_No CHECK (SoDuNo >= 0),
        CONSTRAINT CK_SoDu_Co CHECK (SoDuCo >= 0),
        CONSTRAINT CK_SoDu_MotBen CHECK (
            (SoDuNo = 0 AND SoDuCo = 0) OR (SoDuNo = 0 AND SoDuCo > 0) OR (SoDuCo = 0 AND SoDuNo > 0))
    );
END
GO

IF OBJECT_ID(N'dbo.SoDuDauKy', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_SoDu_Ky')
    ALTER TABLE dbo.SoDuDauKy ADD CONSTRAINT FK_SoDu_Ky FOREIGN KEY (MaKy) REFERENCES dbo.KyKeToan (MaKy);
GO
IF OBJECT_ID(N'dbo.SoDuDauKy', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_SoDu_TK')
    ALTER TABLE dbo.SoDuDauKy ADD CONSTRAINT FK_SoDu_TK FOREIGN KEY (MaTK) REFERENCES dbo.TaiKhoanKeToan (MaTK);
GO

/* ---------- ButToan / ChiTietButToan ---------- */
IF OBJECT_ID(N'dbo.ButToan', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ButToan (
        MaBT VARCHAR(20) NOT NULL,
        MaKy VARCHAR(7) NOT NULL,
        NgayHachToan DATE NOT NULL,
        NgayChungTu DATE NOT NULL,
        LoaiChungTu NVARCHAR(30) NOT NULL,
        MaChungTu VARCHAR(30) NOT NULL,
        LoaiButToan NVARCHAR(30) NOT NULL,
        DienGiai NVARCHAR(500) NOT NULL,
        TrangThai NVARCHAR(20) NOT NULL CONSTRAINT DF_BT_TT DEFAULT N'DaGhiSo',
        DaBiDao BIT NOT NULL CONSTRAINT DF_BT_Dao DEFAULT 0,
        MaBTGoc VARCHAR(20) NULL,
        TongNo DECIMAL(18,2) NOT NULL,
        TongCo DECIMAL(18,2) NOT NULL,
        MaNV_Lap VARCHAR(20) NOT NULL,
        NgayLap DATETIME NOT NULL CONSTRAINT DF_BT_NgayLap DEFAULT GETDATE(),
        Nguon NVARCHAR(20) NOT NULL CONSTRAINT DF_BT_Nguon DEFAULT N'TuDong',
        CONSTRAINT PK_ButToan PRIMARY KEY (MaBT),
        CONSTRAINT CK_BT_TT CHECK (TrangThai IN (N'Nhap', N'DaGhiSo')),
        CONSTRAINT CK_BT_CanBang CHECK (TongNo = TongCo),
        CONSTRAINT CK_BT_Nguon CHECK (Nguon IN (N'TuDong', N'ThuCong', N'Seeding'))
    );
END
GO

IF OBJECT_ID(N'dbo.ButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_BT_Ky')
    ALTER TABLE dbo.ButToan ADD CONSTRAINT FK_BT_Ky FOREIGN KEY (MaKy) REFERENCES dbo.KyKeToan (MaKy);
GO
IF OBJECT_ID(N'dbo.ButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_BT_NV')
    ALTER TABLE dbo.ButToan ADD CONSTRAINT FK_BT_NV FOREIGN KEY (MaNV_Lap) REFERENCES dbo.NhanVien (MaNV);
GO
IF OBJECT_ID(N'dbo.ButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_BT_Goc')
    ALTER TABLE dbo.ButToan ADD CONSTRAINT FK_BT_Goc FOREIGN KEY (MaBTGoc) REFERENCES dbo.ButToan (MaBT);
GO

IF OBJECT_ID(N'dbo.ButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ButToan_Nguon' AND object_id = OBJECT_ID(N'dbo.ButToan'))
    CREATE UNIQUE INDEX UX_ButToan_Nguon
        ON dbo.ButToan (LoaiChungTu, MaChungTu, LoaiButToan)
        WHERE DaBiDao = 0 AND MaBTGoc IS NULL;
GO

IF OBJECT_ID(N'dbo.ButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ButToan_Dao' AND object_id = OBJECT_ID(N'dbo.ButToan'))
    CREATE UNIQUE INDEX UX_ButToan_Dao
        ON dbo.ButToan (MaBTGoc, LoaiButToan)
        WHERE MaBTGoc IS NOT NULL AND DaBiDao = 0;
GO

IF OBJECT_ID(N'dbo.ButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ButToan_KyNgay' AND object_id = OBJECT_ID(N'dbo.ButToan'))
    CREATE INDEX IX_ButToan_KyNgay ON dbo.ButToan (MaKy, NgayHachToan);
GO
IF OBJECT_ID(N'dbo.ButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ButToan_ChungTu' AND object_id = OBJECT_ID(N'dbo.ButToan'))
    CREATE INDEX IX_ButToan_ChungTu ON dbo.ButToan (LoaiChungTu, MaChungTu);
GO
IF OBJECT_ID(N'dbo.ButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ButToan_Loai' AND object_id = OBJECT_ID(N'dbo.ButToan'))
    CREATE INDEX IX_ButToan_Loai ON dbo.ButToan (LoaiButToan, TrangThai);
GO
IF OBJECT_ID(N'dbo.ButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ButToan_DaBiDao' AND object_id = OBJECT_ID(N'dbo.ButToan'))
    CREATE INDEX IX_ButToan_DaBiDao ON dbo.ButToan (DaBiDao);
GO
IF OBJECT_ID(N'dbo.ButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ButToan_MaBTGoc' AND object_id = OBJECT_ID(N'dbo.ButToan'))
    CREATE INDEX IX_ButToan_MaBTGoc ON dbo.ButToan (MaBTGoc);
GO

IF OBJECT_ID(N'dbo.ChiTietButToan', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ChiTietButToan (
        MaBT VARCHAR(20) NOT NULL,
        SoDong SMALLINT NOT NULL,
        MaTK VARCHAR(8) NOT NULL,
        SoTienNo DECIMAL(18,2) NOT NULL CONSTRAINT DF_CTBT_No DEFAULT 0,
        SoTienCo DECIMAL(18,2) NOT NULL CONSTRAINT DF_CTBT_Co DEFAULT 0,
        DienGiaiDong NVARCHAR(300) NULL,
        MaDoiTuong VARCHAR(30) NULL,
        LoaiDoiTuong NVARCHAR(20) NULL,
        CONSTRAINT PK_CTBT PRIMARY KEY (MaBT, SoDong),
        CONSTRAINT CK_CTBT_No CHECK (SoTienNo >= 0),
        CONSTRAINT CK_CTBT_Co CHECK (SoTienCo >= 0),
        CONSTRAINT CK_CTBT_MotBen CHECK (
            (SoTienNo > 0 AND SoTienCo = 0) OR (SoTienCo > 0 AND SoTienNo = 0))
    );
END
GO

IF OBJECT_ID(N'dbo.ChiTietButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_CTBT_BT')
    ALTER TABLE dbo.ChiTietButToan ADD CONSTRAINT FK_CTBT_BT
        FOREIGN KEY (MaBT) REFERENCES dbo.ButToan (MaBT) ON DELETE CASCADE;
GO
IF OBJECT_ID(N'dbo.ChiTietButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_CTBT_TK')
    ALTER TABLE dbo.ChiTietButToan ADD CONSTRAINT FK_CTBT_TK
        FOREIGN KEY (MaTK) REFERENCES dbo.TaiKhoanKeToan (MaTK);
GO
IF OBJECT_ID(N'dbo.ChiTietButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CTBT_TK' AND object_id = OBJECT_ID(N'dbo.ChiTietButToan'))
    CREATE INDEX IX_CTBT_TK ON dbo.ChiTietButToan (MaTK, MaBT);
GO
IF OBJECT_ID(N'dbo.ChiTietButToan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CTBT_DoiTuong' AND object_id = OBJECT_ID(N'dbo.ChiTietButToan'))
    CREATE INDEX IX_CTBT_DoiTuong ON dbo.ChiTietButToan (LoaiDoiTuong, MaDoiTuong);
GO

/* ---------- ChoGhiSo ---------- */
IF OBJECT_ID(N'dbo.ChoGhiSo', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ChoGhiSo (
        MaCho BIGINT IDENTITY(1,1) NOT NULL,
        LoaiChungTu NVARCHAR(30) NOT NULL,
        MaChungTu VARCHAR(30) NOT NULL,
        LyDo NVARCHAR(200) NOT NULL,
        NgayPhatSinh DATETIME NOT NULL CONSTRAINT DF_CGS_Ngay DEFAULT GETDATE(),
        DaXuLy BIT NOT NULL CONSTRAINT DF_CGS_XuLy DEFAULT 0,
        CONSTRAINT PK_ChoGhiSo PRIMARY KEY (MaCho)
    );
END
GO

IF OBJECT_ID(N'dbo.ChoGhiSo', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ChoGhiSo_Active' AND object_id = OBJECT_ID(N'dbo.ChoGhiSo'))
    CREATE UNIQUE INDEX UX_ChoGhiSo_Active
        ON dbo.ChoGhiSo (LoaiChungTu, MaChungTu, LyDo)
        WHERE DaXuLy = 0;
GO

/* ---------- LoaiChiPhi / ChiPhiVanHanh ---------- */
IF OBJECT_ID(N'dbo.LoaiChiPhi', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.LoaiChiPhi (
        MaLoaiCP VARCHAR(20) NOT NULL,
        TenLoaiCP NVARCHAR(100) NOT NULL,
        MaTKMacDinh VARCHAR(8) NOT NULL CONSTRAINT DF_LCP_TK DEFAULT '642',
        TrangThai NVARCHAR(20) NOT NULL CONSTRAINT DF_LCP_TT DEFAULT N'Su dung',
        CONSTRAINT PK_LoaiChiPhi PRIMARY KEY (MaLoaiCP)
    );
END
GO

IF OBJECT_ID(N'dbo.LoaiChiPhi', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM dbo.LoaiChiPhi)
BEGIN
    INSERT INTO dbo.LoaiChiPhi (MaLoaiCP, TenLoaiCP) VALUES
    ('DIEN', N'Tiền điện'),
    ('NUOC', N'Tiền nước'),
    ('THUE_NHA', N'Thuê mặt bằng'),
    ('VP', N'Văn phòng phẩm'),
    ('CUOC', N'Cước vận chuyển'),
    ('QUANG_CAO', N'Quảng cáo'),
    ('SUA_CHUA', N'Sửa chữa nhỏ'),
    ('KHAC', N'Chi phí khác');
END
GO

IF OBJECT_ID(N'dbo.ChiPhiVanHanh', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ChiPhiVanHanh (
        MaCP VARCHAR(20) NOT NULL,
        MaKy VARCHAR(7) NOT NULL,
        MaLoaiCP VARCHAR(20) NOT NULL,
        NgayChungTu DATE NOT NULL,
        SoChungTu VARCHAR(50) NULL,
        MaNCC VARCHAR(20) NULL,
        MaSoThue VARCHAR(20) NULL,
        TienHang DECIMAL(18,2) NOT NULL,
        ThueSuat DECIMAL(5,2) NOT NULL CONSTRAINT DF_CP_Thue DEFAULT 0,
        TienThue DECIMAL(18,2) NOT NULL CONSTRAINT DF_CP_TienThue DEFAULT 0,
        TongCong DECIMAL(18,2) NOT NULL,
        MaTKTien VARCHAR(8) NOT NULL,
        MaGiaoDich VARCHAR(50) NULL,
        TrangThai NVARCHAR(20) NOT NULL CONSTRAINT DF_CP_TT DEFAULT N'Nhap',
        MaNV_Lap VARCHAR(20) NOT NULL,
        NgayLap DATETIME NOT NULL CONSTRAINT DF_CP_NgayLap DEFAULT GETDATE(),
        NgayXacNhan DATETIME NULL,
        DuongDanAnh NVARCHAR(300) NULL,
        GhiChu NVARCHAR(500) NULL,
        CONSTRAINT PK_ChiPhiVanHanh PRIMARY KEY (MaCP),
        CONSTRAINT CK_CP_Hang CHECK (TienHang >= 0),
        CONSTRAINT CK_CP_Tong CHECK (TongCong >= 0 AND ABS(TongCong - (TienHang + TienThue)) < 0.02),
        CONSTRAINT CK_CP_TKTien CHECK (MaTKTien IN ('111', '112')),
        CONSTRAINT CK_CP_TT CHECK (TrangThai IN (N'Nhap', N'DaXacNhan', N'DaHuy'))
    );
END
GO

IF OBJECT_ID(N'dbo.ChiPhiVanHanh', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_CP_Ky')
    ALTER TABLE dbo.ChiPhiVanHanh ADD CONSTRAINT FK_CP_Ky FOREIGN KEY (MaKy) REFERENCES dbo.KyKeToan (MaKy);
GO
IF OBJECT_ID(N'dbo.ChiPhiVanHanh', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_CP_Loai')
    ALTER TABLE dbo.ChiPhiVanHanh ADD CONSTRAINT FK_CP_Loai FOREIGN KEY (MaLoaiCP) REFERENCES dbo.LoaiChiPhi (MaLoaiCP);
GO
IF OBJECT_ID(N'dbo.ChiPhiVanHanh', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_CP_NV')
    ALTER TABLE dbo.ChiPhiVanHanh ADD CONSTRAINT FK_CP_NV FOREIGN KEY (MaNV_Lap) REFERENCES dbo.NhanVien (MaNV);
GO

/* ---------- TSCD ---------- */
IF OBJECT_ID(N'dbo.TaiSanCoDinh', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TaiSanCoDinh (
        MaTSCD VARCHAR(20) NOT NULL,
        TenTSCD NVARCHAR(200) NOT NULL,
        Nhom NVARCHAR(50) NOT NULL,
        BoPhan NVARCHAR(50) NULL,
        NgayMua DATE NOT NULL,
        NgayDuaVaoSD DATE NOT NULL,
        SoThangKH SMALLINT NOT NULL,
        NguyenGia DECIMAL(18,2) NOT NULL,
        TienThue DECIMAL(18,2) NOT NULL CONSTRAINT DF_TSCD_Thue DEFAULT 0,
        MaTKTien VARCHAR(8) NOT NULL,
        MaNCC VARCHAR(20) NULL,
        SoHoaDon VARCHAR(50) NULL,
        TrangThai NVARCHAR(20) NOT NULL CONSTRAINT DF_TSCD_TT DEFAULT N'Su dung',
        MaNV_Lap VARCHAR(20) NOT NULL,
        NgayLap DATETIME NOT NULL CONSTRAINT DF_TSCD_NgayLap DEFAULT GETDATE(),
        CONSTRAINT PK_TaiSanCoDinh PRIMARY KEY (MaTSCD),
        CONSTRAINT CK_TSCD_Thang CHECK (SoThangKH > 0),
        CONSTRAINT CK_TSCD_NG CHECK (NguyenGia > 0),
        CONSTRAINT CK_TSCD_TKTien CHECK (MaTKTien IN ('111', '112'))
    );
END
GO

IF OBJECT_ID(N'dbo.KhauHaoTaiSan', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.KhauHaoTaiSan (
        MaTSCD VARCHAR(20) NOT NULL,
        MaKy VARCHAR(7) NOT NULL,
        SoTien DECIMAL(18,2) NOT NULL,
        NgayChay DATETIME NOT NULL CONSTRAINT DF_KH_Ngay DEFAULT GETDATE(),
        CONSTRAINT PK_KH PRIMARY KEY (MaTSCD, MaKy)
    );
END
GO

IF OBJECT_ID(N'dbo.KhauHaoTaiSan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_KH_TSCD')
    ALTER TABLE dbo.KhauHaoTaiSan ADD CONSTRAINT FK_KH_TSCD FOREIGN KEY (MaTSCD) REFERENCES dbo.TaiSanCoDinh (MaTSCD);
GO
IF OBJECT_ID(N'dbo.KhauHaoTaiSan', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_KH_Ky')
    ALTER TABLE dbo.KhauHaoTaiSan ADD CONSTRAINT FK_KH_Ky FOREIGN KEY (MaKy) REFERENCES dbo.KyKeToan (MaKy);
GO

/* ---------- TaiKhoanNganHang + sao ke (1 TKNH enforce o service) ---------- */
IF OBJECT_ID(N'dbo.TaiKhoanNganHang', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TaiKhoanNganHang (
        MaTKNH VARCHAR(20) NOT NULL,
        SoTaiKhoan VARCHAR(30) NOT NULL,
        TenNH NVARCHAR(100) NOT NULL,
        ChiNhanh NVARCHAR(100) NULL,
        ChuTaiKhoan NVARCHAR(150) NOT NULL,
        MaTKKeToan VARCHAR(8) NOT NULL CONSTRAINT DF_TKNH_TK DEFAULT '112',
        TrangThai NVARCHAR(20) NOT NULL CONSTRAINT DF_TKNH_TT DEFAULT N'Su dung',
        CONSTRAINT PK_TaiKhoanNganHang PRIMARY KEY (MaTKNH),
        CONSTRAINT UQ_TKNH_So UNIQUE (SoTaiKhoan),
        CONSTRAINT CK_TKNH_MaTK CHECK (MaTKKeToan = '112')
    );
END
GO

IF OBJECT_ID(N'dbo.TaiKhoanNganHang', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.TaiKhoanNganHang', N'MaTKKeToan') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_TKNH_MaTK')
    ALTER TABLE dbo.TaiKhoanNganHang ADD CONSTRAINT CK_TKNH_MaTK CHECK (MaTKKeToan = '112');
GO

IF OBJECT_ID(N'dbo.SaoKeNganHang', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SaoKeNganHang (
        MaSaoKe VARCHAR(20) NOT NULL,
        MaTKNH VARCHAR(20) NOT NULL,
        TuNgay DATE NOT NULL,
        DenNgay DATE NOT NULL,
        TenFile NVARCHAR(260) NOT NULL,
        HashFile VARCHAR(64) NULL,
        MaNV_Import VARCHAR(20) NOT NULL,
        NgayImport DATETIME NOT NULL CONSTRAINT DF_SK_Ngay DEFAULT GETDATE(),
        TrangThai NVARCHAR(20) NOT NULL CONSTRAINT DF_SK_TT DEFAULT N'DaNhap',
        CONSTRAINT PK_SaoKeNganHang PRIMARY KEY (MaSaoKe)
    );
END
GO

IF OBJECT_ID(N'dbo.SaoKeNganHang', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_SK_TKNH')
    ALTER TABLE dbo.SaoKeNganHang ADD CONSTRAINT FK_SK_TKNH FOREIGN KEY (MaTKNH) REFERENCES dbo.TaiKhoanNganHang (MaTKNH);
GO

IF OBJECT_ID(N'dbo.DongSaoKe', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DongSaoKe (
        MaDong BIGINT IDENTITY(1,1) NOT NULL,
        MaSaoKe VARCHAR(20) NOT NULL,
        NgayGD DATE NOT NULL,
        SoTien DECIMAL(18,2) NOT NULL,
        PhatSinhNo DECIMAL(18,2) NOT NULL CONSTRAINT DF_DSK_No DEFAULT 0,
        PhatSinhCo DECIMAL(18,2) NOT NULL CONSTRAINT DF_DSK_Co DEFAULT 0,
        DienGiai NVARCHAR(300) NULL,
        MaGiaoDich VARCHAR(80) NULL,
        TrangThaiKhop NVARCHAR(20) NOT NULL CONSTRAINT DF_DSK_Khop DEFAULT N'Chua khop',
        LoaiChungTuKhop NVARCHAR(30) NULL,
        MaChungTuKhop VARCHAR(30) NULL,
        GhiChuKhop NVARCHAR(200) NULL,
        CONSTRAINT PK_DongSaoKe PRIMARY KEY (MaDong),
        CONSTRAINT CK_DSK_Khop CHECK (TrangThaiKhop IN (N'Chua khop', N'Khop tu dong', N'Khop thu cong', N'Chenh lech'))
    );
END
GO

IF OBJECT_ID(N'dbo.DongSaoKe', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_DSK_SK')
    ALTER TABLE dbo.DongSaoKe ADD CONSTRAINT FK_DSK_SK FOREIGN KEY (MaSaoKe) REFERENCES dbo.SaoKeNganHang (MaSaoKe);
GO
IF OBJECT_ID(N'dbo.DongSaoKe', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DongSaoKe_MaGD' AND object_id = OBJECT_ID(N'dbo.DongSaoKe'))
    CREATE INDEX IX_DongSaoKe_MaGD ON dbo.DongSaoKe (MaGiaoDich);
GO
IF OBJECT_ID(N'dbo.DongSaoKe', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DongSaoKe_TienNgay' AND object_id = OBJECT_ID(N'dbo.DongSaoKe'))
    CREATE INDEX IX_DongSaoKe_TienNgay ON dbo.DongSaoKe (NgayGD, SoTien);
GO

/* ---------- VAT POS (NULL = chua chon; 0 = 0% hop le) ---------- */
IF COL_LENGTH(N'dbo.SanPham', N'ThueSuat') IS NULL
    ALTER TABLE dbo.SanPham ADD ThueSuat DECIMAL(5,2) NULL;
GO

IF COL_LENGTH(N'dbo.SanPham', N'ThueSuat') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_SanPham_ThueSuat')
    ALTER TABLE dbo.SanPham ADD CONSTRAINT CK_SanPham_ThueSuat
        CHECK (ThueSuat IS NULL OR ThueSuat IN (0, 5, 8, 10));
GO

IF COL_LENGTH(N'dbo.ChiTietHoaDon', N'ThueSuat') IS NULL
    ALTER TABLE dbo.ChiTietHoaDon ADD ThueSuat DECIMAL(5,2) NULL;
GO
IF COL_LENGTH(N'dbo.ChiTietHoaDon', N'TienThue') IS NULL
    ALTER TABLE dbo.ChiTietHoaDon ADD TienThue DECIMAL(18,2) NOT NULL CONSTRAINT DF_CTHD_TienThue DEFAULT 0;
GO
IF COL_LENGTH(N'dbo.ChiTietHoaDon', N'ThanhTienSauGiam') IS NULL
    ALTER TABLE dbo.ChiTietHoaDon ADD ThanhTienSauGiam DECIMAL(18,2) NULL;
GO

IF COL_LENGTH(N'dbo.ChiTietHoaDon', N'ThueSuat') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_CTHD_ThueSuat')
    ALTER TABLE dbo.ChiTietHoaDon ADD CONSTRAINT CK_CTHD_ThueSuat
        CHECK (ThueSuat IS NULL OR ThueSuat IN (0, 5, 8, 10));
GO

IF COL_LENGTH(N'dbo.HoaDon', N'TienThue') IS NULL
    ALTER TABLE dbo.HoaDon ADD TienThue DECIMAL(18,2) NOT NULL CONSTRAINT DF_HD_TienThue DEFAULT 0;
GO

/* Seed thue demo theo nhom — KHONG gan loat 8, KHONG gan 0 (0 = 0% hop le) */
IF COL_LENGTH(N'dbo.SanPham', N'ThueSuat') IS NOT NULL
BEGIN
    UPDATE sp SET ThueSuat = CASE
        WHEN dm.TenDM LIKE N'%rau%' OR dm.TenDM LIKE N'%gạo%' OR dm.TenDM LIKE N'%gao%'
          OR dm.TenDM LIKE N'%thịt%' OR dm.TenDM LIKE N'%thit%' OR dm.TenDM LIKE N'%cá%'
          OR dm.TenDM LIKE N'%ca %' OR dm.TenDM LIKE N'%tươi%' OR dm.TenDM LIKE N'%tuoi%' THEN 5
        WHEN dm.TenDM LIKE N'%sữa%' OR dm.TenDM LIKE N'%sua%' OR dm.TenDM LIKE N'%sách%'
          OR dm.TenDM LIKE N'%sach%' THEN 5
        WHEN dm.TenDM LIKE N'%thuốc%' OR dm.TenDM LIKE N'%thuoc%' THEN 5
        WHEN dm.TenDM LIKE N'%đồ uống%' OR dm.TenDM LIKE N'%do uong%' OR dm.TenDM LIKE N'%nước%'
          OR dm.TenDM LIKE N'%nuoc%' OR dm.TenDM LIKE N'%bánh%' OR dm.TenDM LIKE N'%banh%'
          OR dm.TenDM LIKE N'%snack%' OR dm.TenDM LIKE N'%mì%' OR dm.TenDM LIKE N'%mi %' THEN 8
        WHEN dm.TenDM LIKE N'%gia vị%' OR dm.TenDM LIKE N'%gia vi%' OR dm.TenDM LIKE N'%hóa%'
          OR dm.TenDM LIKE N'%hoa%' OR dm.TenDM LIKE N'%vệ sinh%' OR dm.TenDM LIKE N'%ve sinh%' THEN 10
        ELSE 8
    END
    FROM dbo.SanPham sp
    JOIN dbo.DanhMuc dm ON dm.MaDM = sp.MaDM
    WHERE sp.ThueSuat IS NULL;
END
GO

/* ---------- Quyen UC34-UC43 (khong xoa quyen cu) ---------- */
IF OBJECT_ID(N'dbo.ChucNang', N'U') IS NOT NULL
BEGIN
    MERGE dbo.ChucNang AS t
    USING (VALUES
        ('UC34', N'Danh mục tài khoản kế toán', N'Kế toán tổng hợp'),
        ('UC35', N'Kỳ kế toán và số dư đầu kỳ', N'Kế toán tổng hợp'),
        ('UC36', N'Chi phí vận hành trong kỳ', N'Kế toán tổng hợp'),
        ('UC37', N'Bút toán / chờ ghi sổ', N'Kế toán tổng hợp'),
        ('UC38', N'Nhật ký chung / sổ cái / CĐPS', N'Kế toán tổng hợp'),
        ('UC39', N'Khóa kỳ và kết chuyển', N'Kế toán tổng hợp'),
        ('UC40', N'Bảng kê VAT', N'Kế toán tổng hợp'),
        ('UC41', N'Tài sản cố định và khấu hao', N'Kế toán mở rộng'),
        ('UC42', N'Import sao kê ngân hàng CSV', N'Kế toán mở rộng'),
        ('UC43', N'Báo cáo tài chính mini', N'Kế toán tổng hợp')
    ) AS s(MaChucNang, TenChucNang, Nhom)
    ON t.MaChucNang = s.MaChucNang
    WHEN MATCHED THEN UPDATE SET TenChucNang = s.TenChucNang, Nhom = s.Nhom
    WHEN NOT MATCHED THEN INSERT (MaChucNang, TenChucNang, Nhom) VALUES (s.MaChucNang, s.TenChucNang, s.Nhom);
END
GO

IF OBJECT_ID(N'dbo.VaiTro_ChucNang', N'U') IS NOT NULL
BEGIN
    INSERT INTO dbo.VaiTro_ChucNang (MaVaiTro, MaChucNang, DuocPhep)
    SELECT vt.MaVaiTro, uc.MaChucNang, 1
    FROM dbo.VaiTro vt
    CROSS JOIN (VALUES ('UC34'),('UC35'),('UC36'),('UC37'),('UC38'),('UC39'),('UC40'),('UC41'),('UC42'),('UC43')) uc(MaChucNang)
    WHERE LOWER(vt.TenVaiTro) IN (N'kế toán', N'ke toan')
      AND NOT EXISTS (
          SELECT 1 FROM dbo.VaiTro_ChucNang x
          WHERE x.MaVaiTro = vt.MaVaiTro AND x.MaChucNang = uc.MaChucNang);

    INSERT INTO dbo.VaiTro_ChucNang (MaVaiTro, MaChucNang, DuocPhep)
    SELECT vt.MaVaiTro, uc.MaChucNang, 1
    FROM dbo.VaiTro vt
    CROSS JOIN (VALUES ('UC38'),('UC39'),('UC43')) uc(MaChucNang)
    WHERE LOWER(vt.TenVaiTro) IN (N'quản lý', N'quan ly')
      AND NOT EXISTS (
          SELECT 1 FROM dbo.VaiTro_ChucNang x
          WHERE x.MaVaiTro = vt.MaVaiTro AND x.MaChucNang = uc.MaChucNang);
END
GO

IF OBJECT_ID(N'dbo.vw_SoCaiDong', N'V') IS NOT NULL
    DROP VIEW dbo.vw_SoCaiDong;
GO
CREATE VIEW dbo.vw_SoCaiDong AS
SELECT bt.MaBT, bt.MaKy, bt.NgayHachToan, bt.NgayChungTu, bt.LoaiChungTu, bt.MaChungTu,
       bt.LoaiButToan, bt.DienGiai, bt.TrangThai, bt.DaBiDao, bt.MaBTGoc, bt.Nguon, bt.MaNV_Lap,
       ct.SoDong, ct.MaTK, tk.TenTK, tk.TinhChat, tk.LoaiBC,
       ct.SoTienNo, ct.SoTienCo, ct.DienGiaiDong, ct.MaDoiTuong, ct.LoaiDoiTuong
FROM dbo.ChiTietButToan ct
JOIN dbo.ButToan bt ON bt.MaBT = ct.MaBT
JOIN dbo.TaiKhoanKeToan tk ON tk.MaTK = ct.MaTK
WHERE bt.TrangThai = N'DaGhiSo';
GO
