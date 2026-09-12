// Hóa đơn bán gốc giữ TrangThai = N'Hoàn thành'. Đổi trả đọc từ PhieuDoiTra.
const INVOICE_RETURN_APPLY = `
OUTER APPLY (
    SELECT
        COUNT(*) SoPhieu,
        SUM(CASE WHEN dt.TrangThai <> N'Hoàn thành' THEN 1 ELSE 0 END) SoDangXuLy,
        SUM(CASE WHEN dt.TrangThai = N'Hoàn thành' THEN 1 ELSE 0 END) SoHoanTat,
        SUM(CASE WHEN dt.TrangThai = N'Hoàn thành' AND dt.HinhThucXuLy = N'Đổi hàng' THEN 1 ELSE 0 END) SoDoiHang,
        SUM(CASE WHEN dt.TrangThai = N'Hoàn thành' AND dt.HinhThucXuLy = N'Hoàn tiền' THEN dt.SoTienHoan ELSE 0 END) TienDaHoan
    FROM PhieuDoiTra dt
    WHERE dt.MaHD = hd.MaHD
      AND dt.TrangThai NOT IN (N'Từ chối', N'Đã hủy')
) dt
OUTER APPLY (
    SELECT COALESCE(SUM(ct.SoLuong), 0) SLBan
    FROM ChiTietHoaDon ct
    WHERE ct.MaHD = hd.MaHD
) ban
OUTER APPLY (
    SELECT COALESCE(SUM(ct.SoLuong), 0) SLDaTra
    FROM ChiTietDoiTra ct
    JOIN PhieuDoiTra p ON p.MaDT = ct.MaDT
    WHERE p.MaHD = hd.MaHD
      AND ct.LoaiDong = N'Hàng khách trả'
      AND p.TrangThai = N'Hoàn thành'
) tra
OUTER APPLY (
    SELECT TOP 1 tt.PhuongThuc AS PhuongThucGoc
    FROM ThanhToan tt
    WHERE tt.MaHD = hd.MaHD AND tt.TrangThai = N'Thành công'
    ORDER BY tt.SoTien DESC, tt.NgayTT
) ttgoc
OUTER APPLY (
    SELECT
        COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Tiền mặt' THEN tt.SoTien ELSE 0 END),0) TienMatDaThu,
        COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'QR' THEN tt.SoTien ELSE 0 END),0) TienQrDaThu
    FROM ThanhToan tt
    WHERE tt.MaHD = hd.MaHD AND tt.TrangThai = N'Thành công'
      AND (tt.GhiChu IS NULL OR tt.GhiChu NOT LIKE N'Thu chênh đổi hàng%')
) ttbd
`;

const INVOICE_RETURN_COLUMNS = `
    COALESCE(dt.SoPhieu, 0) AS SoPhieuDoiTra,
    COALESCE(dt.SoDangXuLy, 0) AS SoPhieuDangXuLy,
    COALESCE(dt.SoHoanTat, 0) AS SoPhieuHoanTat,
    COALESCE(dt.SoDoiHang, 0) AS SoPhieuDoiHang,
    COALESCE(dt.TienDaHoan, 0) AS TienDaHoan,
    COALESCE(ban.SLBan, 0) AS SLBan,
    COALESCE(tra.SLDaTra, 0) AS SLDaTra,
    ttgoc.PhuongThucGoc,
    COALESCE(ttbd.TienMatDaThu, 0) AS TienMatDaThu,
    COALESCE(ttbd.TienQrDaThu, 0) AS TienQrDaThu
`;

module.exports = { INVOICE_RETURN_APPLY, INVOICE_RETURN_COLUMNS };
