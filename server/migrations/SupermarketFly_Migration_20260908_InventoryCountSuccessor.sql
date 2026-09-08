/* Liên kết đợt kiểm kê đếm lại với đợt bị từ chối.
   Khi Thủ kho hoàn thành đợt mới, đợt Từ chối được đóng thành Đã đếm lại. */
USE SupermarketFlyDB;
GO

IF COL_LENGTH('dbo.KiemKe', 'MaKKGoc') IS NULL
    ALTER TABLE dbo.KiemKe ADD MaKKGoc VARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.KiemKe', 'MaKKThayThe') IS NULL
    ALTER TABLE dbo.KiemKe ADD MaKKThayThe VARCHAR(20) NULL;
GO

UPDATE kk
SET kk.MaKKThayThe = later.MaKK,
    kk.TrangThai = N'Đã đếm lại'
FROM dbo.KiemKe kk
CROSS APPLY (
    SELECT TOP 1 s.MaKK
    FROM dbo.KiemKe s
    WHERE s.MaKho = kk.MaKho
      AND s.MaKK <> kk.MaKK
      AND s.NgayKiemKe > COALESCE(kk.NgayDuyet, kk.NgayKiemKe)
      AND s.TrangThai IN (N'Hoàn thành không chênh lệch', N'Đã duyệt', N'Chờ duyệt điều chỉnh')
      AND (s.GhiChu IS NULL OR s.GhiChu NOT LIKE N'%trước khi lập đề nghị%')
    ORDER BY s.NgayKiemKe DESC
) later
WHERE kk.TrangThai = N'Từ chối';
GO
