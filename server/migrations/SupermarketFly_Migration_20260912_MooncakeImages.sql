/* Chuẩn hóa path ảnh 4 bánh trung thu về relative /uploads/products/bk00x.jpg.
   .bak cũ chỉ lưu path (kể cả hash upload hoặc path tuyệt đối máy chủ).
   Idempotent: không ghi đè nếu admin đã đổi sang ảnh upload mới. */
USE SupermarketFlyDB;
GO

UPDATE dbo.SanPham
SET DuongDanAnh = N'/uploads/products/bk007.jpg'
WHERE MaSP = 'BK007'
  AND (
      NULLIF(LTRIM(RTRIM(ISNULL(DuongDanAnh, N''))), N'') IS NULL
      OR DuongDanAnh LIKE N'%san-pham-1788799493167-cd7354df69dd.jpg%'
      OR DuongDanAnh LIKE N'_:[/\]%'
      OR DuongDanAnh LIKE N'file:%'
  );
GO

UPDATE dbo.SanPham
SET DuongDanAnh = N'/uploads/products/bk008.jpg'
WHERE MaSP = 'BK008'
  AND (
      NULLIF(LTRIM(RTRIM(ISNULL(DuongDanAnh, N''))), N'') IS NULL
      OR DuongDanAnh LIKE N'%san-pham-1788799878676-cf93faf43a2e.jpg%'
      OR DuongDanAnh LIKE N'_:[/\]%'
      OR DuongDanAnh LIKE N'file:%'
  );
GO

UPDATE dbo.SanPham
SET DuongDanAnh = N'/uploads/products/bk009.jpg'
WHERE MaSP = 'BK009'
  AND (
      NULLIF(LTRIM(RTRIM(ISNULL(DuongDanAnh, N''))), N'') IS NULL
      OR DuongDanAnh LIKE N'%san-pham-1788800397186-b97f11a181fc.jpg%'
      OR DuongDanAnh LIKE N'_:[/\]%'
      OR DuongDanAnh LIKE N'file:%'
  );
GO

UPDATE dbo.SanPham
SET DuongDanAnh = N'/uploads/products/bk010.jpg'
WHERE MaSP = 'BK010'
  AND (
      NULLIF(LTRIM(RTRIM(ISNULL(DuongDanAnh, N''))), N'') IS NULL
      OR DuongDanAnh LIKE N'%san-pham-1788800758724-2e995d696676.jpg%'
      OR DuongDanAnh LIKE N'_:[/\]%'
      OR DuongDanAnh LIKE N'file:%'
  );
GO
