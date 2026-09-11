/* SANDBOX / DEMO ONLY — không phải luật nghiệp vụ (4.13).
   Fail các dòng QR MoMo đang Chờ trên HĐ nháp test.
   Dữ liệu cần bảo toàn: Query trạng thái MoMo TRƯỚC khi stub cổng, không chạy file này. */
USE SupermarketFlyDB;
GO

UPDATE tt
SET tt.TrangThai = N'Thất bại',
    tt.NgayXacNhan = GETDATE(),
    tt.GhiChu = LEFT(N'Cleanup demo: ngừng MoMo — không query được sau khi stub cổng', 200)
FROM dbo.ThanhToan tt
JOIN dbo.HoaDon hd ON hd.MaHD = tt.MaHD
WHERE tt.PhuongThuc = N'QR'
  AND tt.NguonXacNhan = N'MoMo'
  AND tt.TrangThai = N'Chờ xác nhận'
  AND hd.TrangThai = N'Nháp';
GO
