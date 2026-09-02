/*
    Supermarket Fly - Migration danh muc hang hoa khai truong
    Ngay: 24/08/2026

    Muc dich:
    1. Nang cap CSDL SupermarketFlyDB da duoc tao truoc do.
    2. Khong tao lai database, khong chay lai SupermarketFly_CreateDB.sql.
    3. Chuan hoa MaVach de cho phep nhieu san pham chua co ma vach.
    4. Bo cot SLTonThucTe du thua trong ChiTietDeNghi (neu chua co du lieu).
    5. Thay 8 san pham minh hoa cu bang danh muc khai truong 36 san pham.
    6. Kho Ha Noi bat dau voi ton kho bang 0 va so luong dat mua bang 0.

    LUU Y:
    - Gia trong file la DU LIEU MAU cho bai tap. Quan ly can kiem tra/chot lai
      gia truoc khi dua he thong vao van hanh thuc te.
    - Script tu dung neu san pham mau cu da phat sinh chung tu nghiep vu.
    - Nen BACKUP database truoc khi Execute.
*/

USE [SupermarketFlyDB];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* Neu da co du 36 ma hang moi thi coi nhu migration da duoc chay. */
IF (
    SELECT COUNT(*)
    FROM dbo.SanPham
    WHERE MaSP IN (
        'SUA001','SUA002','SUA003','SUA004','SUA005','SUA006',
        'BK001','BK002','BK003','BK004','BK005','BK006',
        'NGK001','NGK002','NGK003','NGK004','NGK005','NGK006',
        'HMP001','HMP002','HMP003','HMP004','HMP005','HMP006',
        'DH001','DH002','DH003','DH004','DH005','DH006',
        'GD001','GD002','GD003','GD004','GD005','GD006'
    )
) = 36
BEGIN
    PRINT N'Danh muc khai truong da ton tai. Khong thuc hien lai migration.';
    RETURN;
END;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.DanhMuc', N'U') IS NULL
       OR OBJECT_ID(N'dbo.SanPham', N'U') IS NULL
       OR OBJECT_ID(N'dbo.TonKho', N'U') IS NULL
       OR OBJECT_ID(N'dbo.Kho', N'U') IS NULL
    BEGIN
        RAISERROR(N'CSDL thieu bang DanhMuc, SanPham, TonKho hoac Kho.', 16, 1);
    END;

    /*
        SanPham.MaVach dang la cot NULL UNIQUE trong file CreateDB cu.
        SQL Server chi cho phep mot gia tri NULL trong UNIQUE constraint.
        Chuyen sang unique filtered index de nhieu san pham co the chua co ma vach.
    */
    DECLARE @MaVachConstraint sysname;

    SELECT TOP (1) @MaVachConstraint = kc.name
    FROM sys.key_constraints AS kc
    INNER JOIN sys.index_columns AS ic
        ON ic.object_id = kc.parent_object_id
       AND ic.index_id = kc.unique_index_id
    INNER JOIN sys.columns AS c
        ON c.object_id = ic.object_id
       AND c.column_id = ic.column_id
    WHERE kc.parent_object_id = OBJECT_ID(N'dbo.SanPham')
      AND kc.[type] = 'UQ'
      AND c.name = N'MaVach';

    IF @MaVachConstraint IS NOT NULL
    BEGIN
        DECLARE @DropMaVachConstraintSql NVARCHAR(1000);
        SET @DropMaVachConstraintSql =
            N'ALTER TABLE dbo.SanPham DROP CONSTRAINT '
            + QUOTENAME(@MaVachConstraint) + N';';
        EXEC sys.sp_executesql @DropMaVachConstraintSql;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.SanPham')
          AND name = N'UX_SanPham_MaVach_NotNull'
    )
    BEGIN
        CREATE UNIQUE INDEX UX_SanPham_MaVach_NotNull
            ON dbo.SanPham(MaVach)
            WHERE MaVach IS NOT NULL;
    END;

    /*
        SLTonThucTe khong nam trong luoc do nghiep vu da chot.
        So luong thuc te phai ghi o ChiTietKiemKe.
    */
    IF COL_LENGTH(N'dbo.ChiTietDeNghi', N'SLTonThucTe') IS NOT NULL
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM dbo.ChiTietDeNghi
            WHERE SLTonThucTe IS NOT NULL
        )
        BEGIN
            RAISERROR(N'SLTonThucTe dang co du lieu. Can chuyen sang ChiTietKiemKe truoc khi xoa cot.', 16, 1);
        END;

        ALTER TABLE dbo.ChiTietDeNghi DROP COLUMN SLTonThucTe;
    END;

    /* Dung neu 8 san pham minh hoa cu da duoc dung trong chung tu. */
    IF EXISTS (
        SELECT 1 FROM dbo.ChiTietDeNghi WHERE MaSP IN ('SP001','SP002','SP003','SP004','SP005','SP006','SP007','SP008')
        UNION ALL
        SELECT 1 FROM dbo.ChiTietDonMua WHERE MaSP IN ('SP001','SP002','SP003','SP004','SP005','SP006','SP007','SP008')
        UNION ALL
        SELECT 1 FROM dbo.ChiTietPhieuNhap WHERE MaSP IN ('SP001','SP002','SP003','SP004','SP005','SP006','SP007','SP008')
        UNION ALL
        SELECT 1 FROM dbo.GiaoDichKho WHERE MaSP IN ('SP001','SP002','SP003','SP004','SP005','SP006','SP007','SP008')
        UNION ALL
        SELECT 1 FROM dbo.ChiTietHoaDon WHERE MaSP IN ('SP001','SP002','SP003','SP004','SP005','SP006','SP007','SP008')
        UNION ALL
        SELECT 1 FROM dbo.ChiTietPhieuXuat WHERE MaSP IN ('SP001','SP002','SP003','SP004','SP005','SP006','SP007','SP008')
        UNION ALL
        SELECT 1 FROM dbo.ChiTietKiemKe WHERE MaSP IN ('SP001','SP002','SP003','SP004','SP005','SP006','SP007','SP008')
        UNION ALL
        SELECT 1 FROM dbo.ChiTietDoiTra WHERE MaSP IN ('SP001','SP002','SP003','SP004','SP005','SP006','SP007','SP008')
    )
    BEGIN
        RAISERROR(N'San pham minh hoa cu da phat sinh chung tu. Khong duoc xoa; can lap migration chuyen ma rieng.', 16, 1);
    END;

    /* Xoa rieng du lieu ton kho va san pham minh hoa cu, khong xoa chung tu. */
    DELETE FROM dbo.TonKho
    WHERE MaSP IN ('SP001','SP002','SP003','SP004','SP005','SP006','SP007','SP008');

    DELETE FROM dbo.SanPham
    WHERE MaSP IN ('SP001','SP002','SP003','SP004','SP005','SP006','SP007','SP008');

    /* Chuan hoa 6 nhom mat hang da thong nhat. */
    DECLARE @DanhMuc TABLE (
        MaDM VARCHAR(20) PRIMARY KEY,
        TenDM NVARCHAR(100) NOT NULL,
        MoTa NVARCHAR(255) NULL
    );

    INSERT INTO @DanhMuc (MaDM, TenDM, MoTa)
    VALUES
        ('DM_SUA', N'Sữa và sản phẩm từ sữa', N'Sữa nước, sữa chua và sản phẩm từ sữa'),
        ('DM_BK',  N'Bánh kẹo', N'Bánh, kẹo và đồ ăn nhẹ đóng gói'),
        ('DM_NGK', N'Nước giải khát', N'Nước uống đóng chai, nước ngọt và trà đóng chai'),
        ('DM_HMP', N'Hóa mỹ phẩm', N'Sản phẩm giặt tẩy và chăm sóc cá nhân'),
        ('DM_DH',  N'Đồ đóng hộp', N'Thực phẩm đóng hộp và thực phẩm ăn liền'),
        ('DM_GD',  N'Hàng gia dụng thiết yếu', N'Giấy, túi, dụng cụ và vật dụng gia đình');

    UPDATE dm
       SET dm.TenDM = src.TenDM,
           dm.MoTa = src.MoTa
    FROM dbo.DanhMuc AS dm
    INNER JOIN @DanhMuc AS src ON src.MaDM = dm.MaDM;

    INSERT INTO dbo.DanhMuc (MaDM, TenDM, MoTa)
    SELECT src.MaDM, src.TenDM, src.MoTa
    FROM @DanhMuc AS src
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.DanhMuc AS dm WHERE dm.MaDM = src.MaDM
    );

    DECLARE @SanPhamMoi TABLE (
        MaSP VARCHAR(20) PRIMARY KEY,
        MaDM VARCHAR(20) NOT NULL,
        TenSP NVARCHAR(150) NOT NULL,
        DonViTinh NVARCHAR(30) NOT NULL,
        GiaNhap DECIMAL(18,2) NOT NULL,
        GiaBan DECIMAL(18,2) NOT NULL,
        TonKhoToiThieu INT NOT NULL
    );

    INSERT INTO @SanPhamMoi
        (MaSP, MaDM, TenSP, DonViTinh, GiaNhap, GiaBan, TonKhoToiThieu)
    VALUES
        ('SUA001','DM_SUA',N'Sữa tươi tiệt trùng Vinamilk không đường 1 L',N'Hộp',30000,36000,12),
        ('SUA002','DM_SUA',N'Sữa tươi tiệt trùng TH true MILK có đường 1 L',N'Hộp',30000,36000,12),
        ('SUA003','DM_SUA',N'Sữa tươi tiệt trùng Dutch Lady 1 L',N'Hộp',32000,38000,12),
        ('SUA004','DM_SUA',N'Sữa chua Vinamilk có đường lốc 4 hộp',N'Lốc',25000,32000,16),
        ('SUA005','DM_SUA',N'Sữa chua uống Probi lốc 5 chai',N'Lốc',26000,33000,10),
        ('SUA006','DM_SUA',N'Sữa đặc Ông Thọ 380 g',N'Lon',30000,38000,10),

        ('BK001','DM_BK',N'Bánh quy Cosy Marie 300 g',N'Gói',17000,22000,12),
        ('BK002','DM_BK',N'Bánh Chocopie Orion hộp 12 cái',N'Hộp',28000,35000,10),
        ('BK003','DM_BK',N'Bánh AFC dinh dưỡng hộp 300 g',N'Hộp',30000,38000,10),
        ('BK004','DM_BK',N'Kẹo sô-cô-la M&M 100 g',N'Gói',52000,65000,8),
        ('BK005','DM_BK',N'Kẹo Mentos cuộn 37,5 g',N'Cuộn',7000,10000,20),
        ('BK006','DM_BK',N'Bánh gạo One One 150 g',N'Gói',25000,32000,12),

        ('NGK001','DM_NGK',N'Nước tinh khiết Lavie 500 ml',N'Chai',4500,6000,24),
        ('NGK002','DM_NGK',N'Nước ngọt Coca-Cola 330 ml',N'Lon',10000,13000,24),
        ('NGK003','DM_NGK',N'Nước ngọt Pepsi 330 ml',N'Lon',9000,12000,24),
        ('NGK004','DM_NGK',N'Nước cam có ga Mirinda 330 ml',N'Lon',9000,12000,18),
        ('NGK005','DM_NGK',N'Trà xanh Không Độ 455 ml',N'Chai',9000,12000,18),
        ('NGK006','DM_NGK',N'Trà Ô Long Tea Plus 455 ml',N'Chai',10000,13000,18),

        ('HMP001','DM_HMP',N'Nước rửa chén Sunlight chanh 750 g',N'Chai',32000,42000,10),
        ('HMP002','DM_HMP',N'Nước giặt Ariel 3,2 kg',N'Túi',142000,179000,8),
        ('HMP003','DM_HMP',N'Nước giặt OMO Matic 3,1 kg',N'Túi',125000,159000,8),
        ('HMP004','DM_HMP',N'Dầu gội Clear Men 630 g',N'Chai',168000,205000,6),
        ('HMP005','DM_HMP',N'Dầu gội Sunsilk mềm mượt 650 g',N'Chai',150000,185000,6),
        ('HMP006','DM_HMP',N'Kem đánh răng P/S bảo vệ 123 180 g',N'Tuýp',26000,34000,12),

        ('DH001','DM_DH',N'Cá ngừ ngâm dầu đóng hộp 170 g',N'Hộp',22000,29000,10),
        ('DH002','DM_DH',N'Cá hộp sốt cà 155 g',N'Hộp',20000,27000,10),
        ('DH003','DM_DH',N'Thịt heo hầm đóng hộp 150 g',N'Hộp',25000,33000,10),
        ('DH004','DM_DH',N'Thịt hộp Spam 340 g',N'Hộp',80000,99000,6),
        ('DH005','DM_DH',N'Đậu Hà Lan đóng hộp 400 g',N'Hộp',28000,36000,8),
        ('DH006','DM_DH',N'Ngô ngọt đóng hộp 425 g',N'Hộp',52000,65000,8),

        ('GD001','DM_GD',N'Giấy vệ sinh Pulppy 10 cuộn',N'Bịch',65000,79000,8),
        ('GD002','DM_GD',N'Khăn giấy ăn Bless You hộp 180 tờ',N'Hộp',22000,29000,10),
        ('GD003','DM_GD',N'Túi rác tự hủy cỡ trung',N'Cuộn',35000,45000,10),
        ('GD004','DM_GD',N'Miếng rửa chén Scotch-Brite gói 3 miếng',N'Gói',25000,32000,10),
        ('GD005','DM_GD',N'Màng bọc thực phẩm 30 cm x 30 m',N'Cuộn',30000,39000,8),
        ('GD006','DM_GD',N'Hộp đựng thực phẩm nhựa 1 L',N'Cái',18000,25000,8);

    IF EXISTS (
        SELECT 1
        FROM @SanPhamMoi AS src
        INNER JOIN dbo.SanPham AS sp ON sp.MaSP = src.MaSP
    )
    BEGIN
        RAISERROR(N'Mot so ma san pham khai truong da ton tai. Can kiem tra truoc khi chen.', 16, 1);
    END;

    INSERT INTO dbo.SanPham
        (MaSP, MaDM, TenSP, DonViTinh, MaVach, GiaNhap, GiaBan, TonKhoToiThieu, TrangThai)
    SELECT
        MaSP, MaDM, TenSP, DonViTinh, NULL, GiaNhap, GiaBan, TonKhoToiThieu, N'Đang bán'
    FROM @SanPhamMoi;

    /* Mot kho vat ly tai Ha Noi. Chi tao neu CSDL chua co kho. */
    IF NOT EXISTS (SELECT 1 FROM dbo.Kho)
    BEGIN
        INSERT INTO dbo.Kho (MaKho, TenKho, DiaChi, TrangThai)
        VALUES ('KHO_HN01', N'Kho cửa hàng Hà Nội', N'Supermarket Fly · Hà Nội', 1);
    END;

    DECLARE @MaKho VARCHAR(20);
    SELECT TOP (1) @MaKho = MaKho
    FROM dbo.Kho
    ORDER BY MaKho;

    IF @MaKho IS NULL
    BEGIN
        RAISERROR(N'Khong xac dinh duoc kho de khoi tao ton kho.', 16, 1);
    END;

    /* Kho moi mo: chua nhap lan dau, tat ca so luong vat ly bang 0. */
    INSERT INTO dbo.TonKho
        (MaKho, MaSP, SLTon, SLDatMua, DonGiaBinhQuan, GiaTriTon, NgayCapNhat)
    SELECT
        @MaKho, src.MaSP, 0, 0, 0, 0, GETDATE()
    FROM @SanPhamMoi AS src
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.TonKho AS tk
        WHERE tk.MaKho = @MaKho AND tk.MaSP = src.MaSP
    );

    COMMIT TRANSACTION;

    PRINT N'Migration thanh cong: da tao 6 danh muc, 36 san pham va ton kho khoi tao bang 0.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    DECLARE @ErrorMessage NVARCHAR(2048);
    SET @ErrorMessage = ERROR_MESSAGE();
    PRINT N'Migration that bai. Khong co thay doi nao duoc giu lai.';
    RAISERROR(N'Loi migration: %s', 16, 1, @ErrorMessage);
END CATCH;
GO

/* Kiem tra sau khi migration thanh cong. */
SELECT MaDM, TenDM, MoTa
FROM dbo.DanhMuc
WHERE MaDM IN ('DM_SUA','DM_BK','DM_NGK','DM_HMP','DM_DH','DM_GD')
ORDER BY MaDM;

SELECT sp.MaSP, dm.TenDM, sp.TenSP, sp.DonViTinh,
       sp.GiaNhap, sp.GiaBan, sp.TonKhoToiThieu, sp.TrangThai
FROM dbo.SanPham AS sp
INNER JOIN dbo.DanhMuc AS dm ON dm.MaDM = sp.MaDM
WHERE sp.MaSP LIKE 'SUA%'
   OR sp.MaSP LIKE 'BK%'
   OR sp.MaSP LIKE 'NGK%'
   OR sp.MaSP LIKE 'HMP%'
   OR sp.MaSP LIKE 'DH%'
   OR sp.MaSP LIKE 'GD%'
ORDER BY dm.MaDM, sp.MaSP;

SELECT tk.MaKho, COUNT(*) AS SoMatHang,
       SUM(tk.SLTon) AS TongSoLuongTon,
       SUM(tk.SLDatMua) AS TongSoLuongDangDat
FROM dbo.TonKho AS tk
WHERE tk.MaSP LIKE 'SUA%'
   OR tk.MaSP LIKE 'BK%'
   OR tk.MaSP LIKE 'NGK%'
   OR tk.MaSP LIKE 'HMP%'
   OR tk.MaSP LIKE 'DH%'
   OR tk.MaSP LIKE 'GD%'
GROUP BY tk.MaKho;
GO
