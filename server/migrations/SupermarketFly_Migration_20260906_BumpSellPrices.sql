/* Cộng 50.000 VND vào giá bán niêm yết (SanPham.GiaBan).
   Không đụng giá nhập, tồn kho, hay dòng hóa đơn / phiếu cũ.
   Idempotent: chỉ cộng khi giá hiện tại còn đúng mức seed trước khi tăng. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @GiaCu TABLE (
    MaSP VARCHAR(20) PRIMARY KEY,
    GiaBanCu DECIMAL(18,2) NOT NULL
);

INSERT INTO @GiaCu (MaSP, GiaBanCu)
VALUES
    ('SUA001', 36000), ('SUA002', 36000), ('SUA003', 38000),
    ('SUA004', 32000), ('SUA005', 33000), ('SUA006', 38000),
    ('BK001', 22000), ('BK002', 35000), ('BK003', 38000),
    ('BK004', 65000), ('BK005', 10000), ('BK006', 32000),
    ('NGK001', 6000), ('NGK002', 13000), ('NGK003', 12000),
    ('NGK004', 12000), ('NGK005', 12000), ('NGK006', 13000),
    ('HMP001', 42000), ('HMP002', 179000), ('HMP003', 159000),
    ('HMP004', 205000), ('HMP005', 185000), ('HMP006', 34000),
    ('DH001', 29000), ('DH002', 27000), ('DH003', 33000),
    ('DH004', 99000), ('DH005', 36000), ('DH006', 65000),
    ('GD001', 79000), ('GD002', 29000), ('GD003', 45000),
    ('GD004', 32000), ('GD005', 39000), ('GD006', 25000);

UPDATE sp
SET GiaBan = sp.GiaBan + 50000
FROM dbo.SanPham AS sp
INNER JOIN @GiaCu AS cu ON cu.MaSP = sp.MaSP
WHERE sp.GiaBan = cu.GiaBanCu;

COMMIT TRANSACTION;
GO

SELECT sp.MaSP, sp.TenSP, sp.GiaNhap, sp.GiaBan, sp.TrangThai
FROM dbo.SanPham AS sp
ORDER BY sp.MaSP;
GO
