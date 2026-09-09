/* Nhãn tiếng Việt có dấu cho danh mục KT mini đã seed không dấu.
   Mã (DIEN, 111, BAN_HANG…) không đổi. Idempotent. */
IF OBJECT_ID(N'dbo.LoaiChiPhi', N'U') IS NOT NULL
BEGIN
    UPDATE dbo.LoaiChiPhi SET TenLoaiCP = N'Tiền điện' WHERE MaLoaiCP = 'DIEN';
    UPDATE dbo.LoaiChiPhi SET TenLoaiCP = N'Tiền nước' WHERE MaLoaiCP = 'NUOC';
    UPDATE dbo.LoaiChiPhi SET TenLoaiCP = N'Thuê mặt bằng' WHERE MaLoaiCP = 'THUE_NHA';
    UPDATE dbo.LoaiChiPhi SET TenLoaiCP = N'Văn phòng phẩm' WHERE MaLoaiCP = 'VP';
    UPDATE dbo.LoaiChiPhi SET TenLoaiCP = N'Cước vận chuyển' WHERE MaLoaiCP = 'CUOC';
    UPDATE dbo.LoaiChiPhi SET TenLoaiCP = N'Quảng cáo' WHERE MaLoaiCP = 'QUANG_CAO';
    UPDATE dbo.LoaiChiPhi SET TenLoaiCP = N'Sửa chữa nhỏ' WHERE MaLoaiCP = 'SUA_CHUA';
    UPDATE dbo.LoaiChiPhi SET TenLoaiCP = N'Chi phí khác' WHERE MaLoaiCP = 'KHAC';
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
