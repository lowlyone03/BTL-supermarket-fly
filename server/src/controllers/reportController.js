const { sql, poolPromise } = require('../config/db');
const { calculateGrossProfit, roundMoney, RESTOCK_ACCEPTED_SQL, RESTOCK_REJECTED_SQL, STOCK_FATE_SQL } = require('../services/financialRules');
const { resolveReportingPeriod, activityFromStamp, currentPeriodDefaults } = require('../services/reportingPeriod');
const { INVOICE_RETURN_APPLY, INVOICE_RETURN_COLUMNS } = require('../services/invoiceReturnSql');
const storeProfitLoss = require('../services/storeProfitLoss');

const bindPeriod = (pool, period) => pool.request()
    .input('From', sql.NVarChar(10), period.from)
    .input('ToExclusive', sql.NVarChar(10), period.toExclusive);

const queryLatestActivity = async (pool) => {
    const result = await pool.request().query(`
        SELECT MAX(Ngay) LatestAt
        FROM (
            SELECT MAX(NgayLap) Ngay FROM HoaDon WHERE TrangThai=N'Hoàn thành'
            UNION ALL SELECT MAX(NgayHoan) FROM PhieuDoiTra WHERE TrangThai=N'Hoàn thành'
            UNION ALL SELECT MAX(NgayGD) FROM GiaoDichKho
            UNION ALL SELECT MAX(NgayLap) FROM DonMuaHang WHERE TrangThai NOT IN (N'Nháp', N'Từ chối')
        ) x`);
    return activityFromStamp(result.recordset[0]?.LatestAt);
};

const resolveReportPeriod = async (pool, query = {}) => {
    const requested = resolveReportingPeriod(query);
    const latestActivity = await queryLatestActivity(pool);
    if (String(query.lockPeriod || '') === '1' || !latestActivity) {
        return { period: requested, latestActivity, fallbackFrom: null };
    }
    const current = currentPeriodDefaults();
    const watchingCurrent = (requested.periodType === 'month' && requested.period === current.month)
        || (requested.periodType === 'day' && requested.period === current.day);
    if (!watchingCurrent) return { period: requested, latestActivity, fallbackFrom: null };
    const probe = await bindPeriod(pool, requested).query(`
        SELECT
          (SELECT COUNT(*) FROM HoaDon WHERE TrangThai=N'Hoàn thành' AND NgayLap>=@From AND NgayLap<@ToExclusive)
          + (SELECT COUNT(*) FROM GiaoDichKho WHERE NgayGD>=@From AND NgayGD<@ToExclusive)
          + (SELECT COUNT(*) FROM DonMuaHang WHERE NgayLap>=@From AND NgayLap<@ToExclusive
               AND TrangThai NOT IN (N'Nháp', N'Từ chối')) AS SoPhatSinh`);
    if (Number(probe.recordset[0]?.SoPhatSinh)) {
        return { period: requested, latestActivity, fallbackFrom: null };
    }
    const nextType = latestActivity[requested.periodType] ? requested.periodType : 'month';
    const nextValue = latestActivity[nextType];
    if (!nextValue || nextValue === requested.period) {
        return { period: requested, latestActivity, fallbackFrom: null };
    }
    return {
        period: resolveReportingPeriod({ periodType: nextType, period: nextValue }),
        latestActivity,
        fallbackFrom: requested
    };
};

const RETURN_STEP_SQL = `
    CASE
      WHEN dt.TrangThai=N'Nháp' THEN N'Thu ngân chưa gửi Thủ kho'
      WHEN dt.TrangThai=N'Chờ kiểm tra' THEN N'Thủ kho chưa kiểm hàng'
      WHEN dt.TrangThai=N'Chờ duyệt' THEN N'Quản lý chưa duyệt'
      WHEN dt.TrangThai=N'Đã duyệt' THEN N'Thu ngân chưa xác nhận hoàn/đổi'
      WHEN dt.TrangThai=N'Từ chối' THEN N'Quản lý đã từ chối'
      WHEN dt.TrangThai=N'Đã hủy' THEN N'Phiếu đã hủy'
      WHEN ${RESTOCK_REJECTED_SQL} THEN N'Loại bỏ / vứt — không cộng tồn (đã trừ lúc bán)'
      WHEN ${RESTOCK_ACCEPTED_SQL} THEN N'Nhập lại kho bán'
      WHEN dt.LyDo LIKE N'%nhầm%' OR dt.LyDo LIKE N'%sai sản phẩm%' THEN N'Thu ngân bán/giao nhầm'
      ELSE N'Đã xử lý xong tại quầy'
    END`;

const cashierReturnScope = `
    AND (
      @MaNV IS NULL
      OR dt.MaNV_Lap=@MaNV
      OR EXISTS (SELECT 1 FROM CaLamViec ca WHERE ca.MaCa=dt.MaCaHoan AND ca.MaNV=@MaNV)
      OR EXISTS (SELECT 1 FROM HoaDon hd2 WHERE hd2.MaHD=dt.MaHD AND hd2.MaNV=@MaNV)
    )`;

const queryReturnDiagnostics = async (pool, period, maNV = null) => {
    const bind = () => bindPeriod(pool, period).input('MaNV', sql.VarChar(20), maNV);
    const [summary, tickets, products] = await Promise.all([
        bind().query(`
            SELECT
              COUNT(*) SoPhieu,
              SUM(CASE WHEN dt.HinhThucXuLy=N'Hoàn tiền' THEN 1 ELSE 0 END) SoHoanTien,
              SUM(CASE WHEN dt.HinhThucXuLy=N'Đổi hàng' THEN 1 ELSE 0 END) SoDoiHang,
              COALESCE(SUM(CASE WHEN dt.TrangThai=N'Hoàn thành' THEN dt.SoTienHoan ELSE 0 END),0) TienHoan,
              SUM(CASE WHEN dt.TrangThai=N'Chờ kiểm tra' THEN 1 ELSE 0 END) ChoKiemTra,
              SUM(CASE WHEN dt.TrangThai=N'Chờ duyệt' THEN 1 ELSE 0 END) ChoDuyet,
              SUM(CASE WHEN dt.TrangThai=N'Đã duyệt' THEN 1 ELSE 0 END) ChoThuNganXacNhan,
              SUM(CASE WHEN ${RESTOCK_REJECTED_SQL} THEN 1 ELSE 0 END) KhongNhapLai,
              COALESCE(SUM(CASE WHEN ${RESTOCK_ACCEPTED_SQL} THEN 1 ELSE 0 END),0) NhapLaiKho
            FROM PhieuDoiTra dt
            WHERE dt.TrangThai NOT IN (N'Đã hủy')
              AND (
                (dt.NgayLap>=@From AND dt.NgayLap<@ToExclusive)
                OR (dt.NgayHoan IS NOT NULL AND dt.NgayHoan>=@From AND dt.NgayHoan<@ToExclusive)
              )
              ${cashierReturnScope}`),
        bind().query(`
            SELECT TOP 20 dt.MaDT, dt.MaHD, dt.NgayLap, dt.NgayHoan, dt.HinhThucXuLy, dt.SoTienHoan,
                   dt.TrangThai, dt.LyDo, dt.KetQuaKiemTra, dt.MaCaHoan,
                   kh.TenKH, lap.TenNV NguoiLap, kho.TenNV NguoiKiemTra, duyet.TenNV NguoiDuyet,
                   ${RETURN_STEP_SQL} BuocCanXuLy,
                   ${STOCK_FATE_SQL} HangDiDau
            FROM PhieuDoiTra dt
            JOIN HoaDon hd ON hd.MaHD=dt.MaHD
            JOIN NhanVien lap ON lap.MaNV=dt.MaNV_Lap
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            LEFT JOIN NhanVien kho ON kho.MaNV=dt.MaNV_KiemTra
            LEFT JOIN NhanVien duyet ON duyet.MaNV=dt.MaNV_Duyet
            WHERE dt.TrangThai NOT IN (N'Đã hủy')
              AND (
                (dt.NgayLap>=@From AND dt.NgayLap<@ToExclusive)
                OR (dt.NgayHoan IS NOT NULL AND dt.NgayHoan>=@From AND dt.NgayHoan<@ToExclusive)
              )
              ${cashierReturnScope}
            ORDER BY CASE dt.TrangThai
                       WHEN N'Đã duyệt' THEN 0 WHEN N'Chờ duyệt' THEN 1
                       WHEN N'Chờ kiểm tra' THEN 2 WHEN N'Nháp' THEN 3 ELSE 4 END,
                     COALESCE(dt.NgayHoan, dt.NgayLap) DESC`),
        bind().query(`
            SELECT TOP 8 sp.MaSP, sp.TenSP,
                   SUM(ct.SoLuong) SLTra,
                   COALESCE(SUM(ct.ThanhTien),0) TienHangTra,
                   SUM(CASE WHEN ${RESTOCK_ACCEPTED_SQL} THEN ct.SoLuong ELSE 0 END) SLNhapLai,
                   SUM(CASE WHEN ${RESTOCK_REJECTED_SQL} THEN ct.SoLuong ELSE 0 END) SLLoaiBo,
                   SUM(CASE WHEN ${RESTOCK_REJECTED_SQL} THEN ct.SoLuong ELSE 0 END) SLKhongNhapLai,
                   MAX(dt.LyDo) LyDoMau
            FROM ChiTietDoiTra ct
            JOIN PhieuDoiTra dt ON dt.MaDT=ct.MaDT
            JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.LoaiDong=N'Hàng khách trả'
              AND dt.TrangThai NOT IN (N'Đã hủy', N'Từ chối')
              AND (
                (dt.NgayLap>=@From AND dt.NgayLap<@ToExclusive)
                OR (dt.NgayHoan IS NOT NULL AND dt.NgayHoan>=@From AND dt.NgayHoan<@ToExclusive)
              )
              ${cashierReturnScope}
            GROUP BY sp.MaSP, sp.TenSP
            ORDER BY SLTra DESC`)
    ]);
    return {
        summary: summary.recordset[0] || {},
        tickets: tickets.recordset,
        products: products.recordset
    };
};

const buildFinancialReport = async (query, prepared = null) => {
        const pool = await poolPromise;
        const { period, latestActivity, fallbackFrom } = prepared || await resolveReportPeriod(pool, query);
        const [salesResult, returnsResult, dailyResult, purchasesResult, movementResult,
            stockResult, laterMovementResult, financeResult, cashflowDailyResult,
            debtAgingResult, payablesResult, reconciliationResult] = await Promise.all([
            bindPeriod(pool, period).query(`
                SELECT COUNT(DISTINCT hd.MaHD) SoHoaDon,
                       COALESCE((SELECT SUM(h.TongThanhToan) FROM HoaDon h
                           WHERE h.TrangThai=N'Hoàn thành' AND h.NgayLap>=@From AND h.NgayLap<@ToExclusive),0) DoanhThuHoaDon,
                       COALESCE(SUM(CASE WHEN hd.TrangThai=N'Hoàn thành' THEN ct.ThanhTienVon ELSE 0 END),0) GiaVonHoaDon
                FROM HoaDon hd LEFT JOIN ChiTietHoaDon ct ON ct.MaHD=hd.MaHD
                WHERE hd.TrangThai=N'Hoàn thành' AND hd.NgayLap>=@From AND hd.NgayLap<@ToExclusive`),
            bindPeriod(pool, period).query(`
                WITH ChiTietTheoPhieu AS (
                    SELECT MaDT,
                           SUM(CASE WHEN LoaiDong=N'Hàng khách trả' THEN ThanhTienVon ELSE 0 END) GiaVonHangTra,
                           SUM(CASE WHEN LoaiDong=N'Hàng giao đổi' THEN ThanhTienVon ELSE 0 END) GiaVonHangGiaoDoi
                    FROM ChiTietDoiTra GROUP BY MaDT
                )
                SELECT COUNT(*) SoPhieuDoiTra,COALESCE(SUM(dt.SoTienHoan),0) TienHoan,
                       COALESCE(SUM(CASE WHEN ${RESTOCK_ACCEPTED_SQL}
                                         THEN ct.GiaVonHangTra ELSE 0 END),0) GiaVonHangTraNhapLai,
                       COALESCE(SUM(ct.GiaVonHangGiaoDoi),0) GiaVonHangGiaoDoi
                FROM PhieuDoiTra dt LEFT JOIN ChiTietTheoPhieu ct ON ct.MaDT=dt.MaDT
                WHERE dt.TrangThai=N'Hoàn thành' AND dt.NgayHoan>=@From AND dt.NgayHoan<@ToExclusive`),
            bindPeriod(pool, period).query(`
                WITH HoaDonNgay AS (
                    SELECT CONVERT(date,NgayLap) Ngay,COUNT(*) SoHoaDon,SUM(TongThanhToan) DoanhThuHoaDon
                    FROM HoaDon WHERE TrangThai=N'Hoàn thành' AND NgayLap>=@From AND NgayLap<@ToExclusive
                    GROUP BY CONVERT(date,NgayLap)
                ), GiaVonNgay AS (
                    SELECT CONVERT(date,hd.NgayLap) Ngay,SUM(ct.ThanhTienVon) GiaVonHoaDon
                    FROM HoaDon hd JOIN ChiTietHoaDon ct ON ct.MaHD=hd.MaHD
                    WHERE hd.TrangThai=N'Hoàn thành' AND hd.NgayLap>=@From AND hd.NgayLap<@ToExclusive
                    GROUP BY CONVERT(date,hd.NgayLap)
                ), ChiTietTheoPhieu AS (
                    SELECT MaDT,
                           SUM(CASE WHEN LoaiDong=N'Hàng khách trả' THEN ThanhTienVon ELSE 0 END) GiaVonHangTra,
                           SUM(CASE WHEN LoaiDong=N'Hàng giao đổi' THEN ThanhTienVon ELSE 0 END) GiaVonHangGiaoDoi
                    FROM ChiTietDoiTra GROUP BY MaDT
                ), DoiTraNgay AS (
                    SELECT CONVERT(date,dt.NgayHoan) Ngay,SUM(dt.SoTienHoan) TienHoan,
                           SUM(CASE WHEN ${RESTOCK_ACCEPTED_SQL}
                                    THEN ct.GiaVonHangTra ELSE 0 END) GiaVonHangTraNhapLai,
                           SUM(ct.GiaVonHangGiaoDoi) GiaVonHangGiaoDoi
                    FROM PhieuDoiTra dt LEFT JOIN ChiTietTheoPhieu ct ON ct.MaDT=dt.MaDT
                    WHERE dt.TrangThai=N'Hoàn thành' AND dt.NgayHoan>=@From AND dt.NgayHoan<@ToExclusive
                    GROUP BY CONVERT(date,dt.NgayHoan)
                ), CacNgay AS (
                    SELECT Ngay FROM HoaDonNgay UNION SELECT Ngay FROM DoiTraNgay
                )
                SELECT n.Ngay,COALESCE(h.SoHoaDon,0) SoHoaDon,COALESCE(h.DoanhThuHoaDon,0) DoanhThuHoaDon,
                       COALESCE(g.GiaVonHoaDon,0) GiaVonHoaDon,COALESCE(d.TienHoan,0) TienHoan,
                       COALESCE(d.GiaVonHangTraNhapLai,0) GiaVonHangTraNhapLai,
                       COALESCE(d.GiaVonHangGiaoDoi,0) GiaVonHangGiaoDoi
                FROM CacNgay n LEFT JOIN HoaDonNgay h ON h.Ngay=n.Ngay
                LEFT JOIN GiaVonNgay g ON g.Ngay=n.Ngay LEFT JOIN DoiTraNgay d ON d.Ngay=n.Ngay
                ORDER BY n.Ngay`),
            bindPeriod(pool, period).query(`
                SELECT
                  (SELECT COUNT(*) FROM DonMuaHang WHERE NgayLap>=@From AND NgayLap<@ToExclusive
                     AND TrangThai NOT IN (N'Nháp',N'Từ chối')) SoDonMua,
                  COALESCE((SELECT SUM(TongTien) FROM DonMuaHang WHERE NgayLap>=@From AND NgayLap<@ToExclusive
                     AND TrangThai NOT IN (N'Nháp',N'Từ chối')),0) GiaTriDonMua,
                  (SELECT COUNT(*) FROM PhieuNhap WHERE TrangThai=N'Đã xác nhận'
                     AND NgayXacNhan>=@From AND NgayXacNhan<@ToExclusive) SoPhieuNhap,
                  COALESCE((SELECT SUM(TongTien) FROM PhieuNhap WHERE TrangThai=N'Đã xác nhận'
                     AND NgayXacNhan>=@From AND NgayXacNhan<@ToExclusive),0) GiaTriNhap,
                  (SELECT COUNT(*) FROM HoaDonMuaHang WHERE NgayHoaDon>=@From AND NgayHoaDon<@ToExclusive) SoHoaDonMua,
                  COALESCE((SELECT SUM(TongTienHang) FROM HoaDonMuaHang WHERE NgayHoaDon>=@From AND NgayHoaDon<@ToExclusive),0) TienHangMua,
                  COALESCE((SELECT SUM(TienThue) FROM HoaDonMuaHang WHERE NgayHoaDon>=@From AND NgayHoaDon<@ToExclusive),0) ThueDauVao,
                  COALESCE((SELECT SUM(TongCong) FROM HoaDonMuaHang WHERE NgayHoaDon>=@From AND NgayHoaDon<@ToExclusive),0) TongHoaDonMua`),
            bindPeriod(pool, period).query(`
                SELECT COALESCE(SUM(CASE WHEN LoaiGD=N'Nhập' THEN SoLuong ELSE 0 END),0) SoLuongNhap,
                       COALESCE(SUM(CASE WHEN LoaiGD=N'Xuất' THEN ABS(SoLuong) ELSE 0 END),0) SoLuongXuat,
                       COALESCE(SUM(CASE WHEN LoaiGD=N'Điều chỉnh' THEN SoLuong ELSE 0 END),0) DieuChinhRong,
                       COALESCE(SUM(CASE WHEN LoaiGD=N'Nhập' THEN ABS(ThanhTienVon) ELSE 0 END),0) GiaTriNhap,
                       COALESCE(SUM(CASE WHEN LoaiGD=N'Xuất' THEN ABS(ThanhTienVon) ELSE 0 END),0) GiaTriXuat,
                       COALESCE(SUM(CASE WHEN SoLuong<0 THEN -ABS(ThanhTienVon) ELSE ABS(ThanhTienVon) END),0) BienDongGiaTriRong
                FROM GiaoDichKho WHERE NgayGD>=@From AND NgayGD<@ToExclusive`),
            pool.request().query(`SELECT COALESCE(SUM(SLTon),0) SoLuongHienTai,COALESCE(SUM(GiaTriTon),0) GiaTriHienTai FROM TonKho`),
            bindPeriod(pool, period).query(`
                SELECT COALESCE(SUM(SoLuong),0) SoLuongSauKy,
                       COALESCE(SUM(CASE WHEN SoLuong<0 THEN -ABS(ThanhTienVon) ELSE ABS(ThanhTienVon) END),0) GiaTriSauKy
                FROM GiaoDichKho WHERE NgayGD>=@ToExclusive`),
            bindPeriod(pool, period).query(`
                SELECT
                  (SELECT COUNT(*) FROM CongNoPhaiTra WHERE NgayPhatSinh>=@From AND NgayPhatSinh<@ToExclusive) SoKhoanNoPhatSinh,
                  COALESCE((SELECT SUM(SoTienNo) FROM CongNoPhaiTra WHERE NgayPhatSinh>=@From AND NgayPhatSinh<@ToExclusive),0) CongNoPhatSinh,
                  COALESCE((SELECT SUM(SoTienConLai) FROM CongNoPhaiTra),0) CongNoConLai,
                  COALESCE((SELECT SUM(SoTienConLai) FROM CongNoPhaiTra WHERE SoTienConLai>0 AND HanThanhToan<CONVERT(date,GETDATE())),0) CongNoQuaHan,
                  (SELECT COUNT(*) FROM PhieuThu WHERE NgayLap>=@From AND NgayLap<@ToExclusive) SoPhieuThu,
                  COALESCE((SELECT SUM(SoTienTheoHeThong) FROM PhieuThu WHERE NgayLap>=@From AND NgayLap<@ToExclusive),0) PhieuThuTheoHeThong,
                  COALESCE((SELECT SUM(SoTienThucNop) FROM PhieuThu WHERE NgayLap>=@From AND NgayLap<@ToExclusive),0) PhieuThuThucNop,
                  COALESCE((SELECT SUM(SoTienThucNop-SoTienTheoHeThong) FROM PhieuThu WHERE NgayLap>=@From AND NgayLap<@ToExclusive),0) ChenhLechPhieuThu,
                  (SELECT COUNT(*) FROM PhieuChi WHERE NgayChungTu>=@From AND NgayChungTu<@ToExclusive) SoPhieuChi,
                  COALESCE((SELECT SUM(SoTien) FROM PhieuChi WHERE NgayChungTu>=@From AND NgayChungTu<@ToExclusive),0) TongPhieuChi,
                  COALESCE((SELECT SUM(SoTien) FROM PhieuChi WHERE NgayChungTu>=@From AND NgayChungTu<@ToExclusive
                      AND TrangThai=N'Thanh toán thành công'),0) DaThanhToanNCC`),
            bindPeriod(pool, period).query(`
                WITH ThuNgay AS (
                    SELECT CONVERT(date,NgayLap) Ngay,COUNT(*) SoPhieuThu,
                           SUM(SoTienThucNop) ThucNop
                    FROM PhieuThu
                    WHERE NgayLap>=@From AND NgayLap<@ToExclusive
                    GROUP BY CONVERT(date,NgayLap)
                ), ChiNgay AS (
                    SELECT CONVERT(date,NgayChungTu) Ngay,COUNT(*) SoPhieuChi,
                           SUM(CASE WHEN TrangThai=N'Thanh toán thành công' THEN SoTien ELSE 0 END) DaChi
                    FROM PhieuChi
                    WHERE NgayChungTu>=@From AND NgayChungTu<@ToExclusive
                    GROUP BY CONVERT(date,NgayChungTu)
                ), CacNgay AS (SELECT Ngay FROM ThuNgay UNION SELECT Ngay FROM ChiNgay)
                SELECT n.Ngay,COALESCE(t.SoPhieuThu,0) SoPhieuThu,COALESCE(t.ThucNop,0) ThucNop,
                       COALESCE(c.SoPhieuChi,0) SoPhieuChi,COALESCE(c.DaChi,0) DaChi
                FROM CacNgay n LEFT JOIN ThuNgay t ON t.Ngay=n.Ngay LEFT JOIN ChiNgay c ON c.Ngay=n.Ngay
                ORDER BY n.Ngay`),
            pool.request().query(`
                SELECT NhomHan,ThuTu,COUNT(*) SoKhoan,COALESCE(SUM(SoTienConLai),0) GiaTri
                FROM (
                    SELECT SoTienConLai,
                           CASE
                             WHEN DATEDIFF(day,CONVERT(date,GETDATE()),HanThanhToan)>30 THEN N'Còn trên 30 ngày'
                             WHEN DATEDIFF(day,CONVERT(date,GETDATE()),HanThanhToan)>15 THEN N'Còn 16–30 ngày'
                             WHEN DATEDIFF(day,CONVERT(date,GETDATE()),HanThanhToan)>=0 THEN N'Còn 0–15 ngày'
                             WHEN DATEDIFF(day,HanThanhToan,CONVERT(date,GETDATE()))<=30 THEN N'Quá hạn 1–30 ngày'
                             ELSE N'Quá hạn trên 30 ngày'
                           END NhomHan,
                           CASE
                             WHEN DATEDIFF(day,CONVERT(date,GETDATE()),HanThanhToan)>30 THEN 1
                             WHEN DATEDIFF(day,CONVERT(date,GETDATE()),HanThanhToan)>15 THEN 2
                             WHEN DATEDIFF(day,CONVERT(date,GETDATE()),HanThanhToan)>=0 THEN 3
                             WHEN DATEDIFF(day,HanThanhToan,CONVERT(date,GETDATE()))<=30 THEN 4
                             ELSE 5
                           END ThuTu
                    FROM CongNoPhaiTra WHERE SoTienConLai>0
                ) x GROUP BY NhomHan,ThuTu ORDER BY ThuTu`),
            pool.request().query(`
                SELECT TOP 8 cn.MaCNPTra,ncc.TenNCC,hd.SoHoaDon,cn.NgayPhatSinh,cn.HanThanhToan,
                       cn.SoTienNo,cn.SoTienDaTra,cn.SoTienConLai,
                       CASE WHEN cn.HanThanhToan<CONVERT(date,GETDATE()) THEN N'Quá hạn'
                            WHEN DATEDIFF(day,CONVERT(date,GETDATE()),cn.HanThanhToan)<=15 THEN N'Sắp đến hạn'
                            ELSE N'Còn hạn' END TrangThaiHienTai
                FROM CongNoPhaiTra cn JOIN NhaCungCap ncc ON ncc.MaNCC=cn.MaNCC
                JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
                WHERE cn.SoTienConLai>0
                ORDER BY CASE WHEN cn.HanThanhToan<CONVERT(date,GETDATE()) THEN 0 ELSE 1 END,cn.HanThanhToan`),
            bindPeriod(pool, period).query(`
                SELECT TrangThaiDoiChieu,COUNT(*) SoHoaDon,COALESCE(SUM(TongCong),0) TongCong
                FROM HoaDonMuaHang WHERE NgayHoaDon>=@From AND NgayHoaDon<@ToExclusive
                GROUP BY TrangThaiDoiChieu ORDER BY SoHoaDon DESC`)
        ]);

        const doiTra = await queryReturnDiagnostics(pool, period);
        const gross = calculateGrossProfit({ ...salesResult.recordset[0], ...returnsResult.recordset[0] });
        const daily = dailyResult.recordset.map(row => ({
            Ngay: row.Ngay,
            SoHoaDon: Number(row.SoHoaDon || 0),
            ...calculateGrossProfit(row)
        }));
        const movement = movementResult.recordset[0];
        const currentStock = stockResult.recordset[0];
        const later = laterMovementResult.recordset[0];
        const closingQuantity = Number(currentStock.SoLuongHienTai || 0) - Number(later.SoLuongSauKy || 0);
        const closingValue = roundMoney(Number(currentStock.GiaTriHienTai || 0) - Number(later.GiaTriSauKy || 0));
        const periodNetQuantity = Number(movement.SoLuongNhap || 0) - Number(movement.SoLuongXuat || 0) + Number(movement.DieuChinhRong || 0);

        return {
            period,
            latestActivity,
            fallbackFrom,
            sales: { SoHoaDon: Number(salesResult.recordset[0].SoHoaDon || 0), SoPhieuDoiTra: Number(returnsResult.recordset[0].SoPhieuDoiTra || 0), ...gross },
            daily,
            purchases: purchasesResult.recordset[0],
            inventory: {
                ...movement,
                SoLuongDauKy: closingQuantity - periodNetQuantity,
                SoLuongCuoiKy: closingQuantity,
                GiaTriDauKy: roundMoney(closingValue - Number(movement.BienDongGiaTriRong || 0)),
                GiaTriCuoiKy: closingValue
            },
            finance: financeResult.recordset[0],
            cashflowDaily: cashflowDailyResult.recordset,
            debtAging: debtAgingResult.recordset,
            payables: payablesResult.recordset,
            reconciliation: reconciliationResult.recordset,
            doiTra
        };
};

const getFinancialReport = async (req, res) => {
    try {
        res.json(await buildFinancialReport(req.query));
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể lập báo cáo tài chính nội bộ.' });
    }
};

const getStoreOperationsReport = async (req, res) => {
    try {
        const pool = await poolPromise;
        const resolved = await resolveReportPeriod(pool, req.query);
        const period = resolved.period;
        const [core, cashiers, alerts, activity, salesByCategory, topProducts, inventoryByCategory] = await Promise.all([
            buildFinancialReport(req.query, resolved),
            bindPeriod(pool, period).query(`
                SELECT nv.MaNV, nv.TenNV, COUNT(*) SoCa,
                       COALESCE(SUM(ca.DoanhThuHoaDon),0) DoanhThuHoaDon,
                       COALESCE(SUM(ca.TienMatHeThong),0) TienMatHeThong,
                       COALESCE(SUM(ca.TienThucNop),0) TienThucNop
                FROM NhanVien nv
                JOIN (
                    SELECT ca.MaNV, ca.MaCa, ca.TienMatHeThong, ca.TienThucNop,
                           COALESCE((SELECT SUM(hd.TongThanhToan) FROM HoaDon hd
                                     WHERE hd.MaCa=ca.MaCa AND hd.TrangThai=N'Hoàn thành'),0) DoanhThuHoaDon
                    FROM CaLamViec ca
                    WHERE ca.ThoiGianBatDau>=@From AND ca.ThoiGianBatDau<@ToExclusive
                ) ca ON ca.MaNV=nv.MaNV
                WHERE nv.ChucVu=N'Thu ngân'
                GROUP BY nv.MaNV, nv.TenNV
                ORDER BY DoanhThuHoaDon DESC`),
            pool.request().query(`
                SELECT
                  (SELECT COUNT(*) FROM SanPham sp JOIN TonKho tk ON tk.MaSP=sp.MaSP
                    WHERE sp.TrangThai IN (N'Đang bán',N'Đang kinh doanh') AND tk.SLTon<=sp.TonKhoToiThieu) TonThap,
                  (SELECT COUNT(*) FROM CongNoPhaiTra WHERE SoTienConLai>0 AND HanThanhToan<CONVERT(date,GETDATE())) CongNoQuaHan,
                  (SELECT COUNT(*) FROM CaLamViec WHERE TrangThai=N'Đã chốt' AND TrangThaiDoiSoat=N'Chờ Kế toán đối soát') CaChoDoiSoat,
                  (SELECT COUNT(*) FROM PhieuDoiTra WHERE TrangThai IN (N'Chờ kiểm tra',N'Chờ duyệt',N'Đã duyệt')) DoiTraDangXuLy`),
            bindPeriod(pool, period).query(`
                SELECT
                  (SELECT COUNT(*) FROM CaLamViec WHERE ThoiGianBatDau>=@From AND ThoiGianBatDau<@ToExclusive) SoCaMo,
                  (SELECT COUNT(*) FROM HoaDon WHERE TrangThai=N'Hoàn thành' AND NgayLap>=@From AND NgayLap<@ToExclusive) SoHoaDon,
                  (SELECT COUNT(*) FROM PhieuDoiTra WHERE NgayLap>=@From AND NgayLap<@ToExclusive) SoDoiTra,
                  (SELECT COUNT(*) FROM DonMuaHang WHERE NgayLap>=@From AND NgayLap<@ToExclusive AND TrangThai NOT IN (N'Nháp',N'Từ chối')) SoDonMua,
                  (SELECT COUNT(*) FROM PhieuNhap WHERE TrangThai=N'Đã xác nhận' AND NgayXacNhan>=@From AND NgayXacNhan<@ToExclusive) SoPhieuNhap,
                  (SELECT COUNT(*) FROM PhieuXuat WHERE NgayXuat>=@From AND NgayXuat<@ToExclusive) SoPhieuXuat,
                  (SELECT COUNT(*) FROM KiemKe WHERE NgayKiemKe>=@From AND NgayKiemKe<@ToExclusive) SoKiemKe`),
            bindPeriod(pool, period).query(`
                SELECT dm.MaDM,dm.TenDM,SUM(ct.SoLuong) SoLuongBan,
                       COALESCE(SUM(ct.ThanhTien),0) DoanhThuHoaDon,
                       COALESCE(SUM(ct.ThanhTienVon),0) GiaVonHoaDon,
                       COALESCE(SUM(ct.ThanhTien-ct.ThanhTienVon),0) LaiGopHoaDon
                FROM HoaDon hd JOIN ChiTietHoaDon ct ON ct.MaHD=hd.MaHD
                JOIN SanPham sp ON sp.MaSP=ct.MaSP JOIN DanhMuc dm ON dm.MaDM=sp.MaDM
                WHERE hd.TrangThai=N'Hoàn thành' AND hd.NgayLap>=@From AND hd.NgayLap<@ToExclusive
                GROUP BY dm.MaDM,dm.TenDM ORDER BY DoanhThuHoaDon DESC`),
            bindPeriod(pool, period).query(`
                SELECT TOP 8 sp.MaSP,sp.TenSP,dm.TenDM,SUM(ct.SoLuong) SoLuongBan,
                       COALESCE(SUM(ct.ThanhTien),0) DoanhThuHoaDon,
                       COALESCE(SUM(ct.ThanhTien-ct.ThanhTienVon),0) LaiGopHoaDon
                FROM HoaDon hd JOIN ChiTietHoaDon ct ON ct.MaHD=hd.MaHD
                JOIN SanPham sp ON sp.MaSP=ct.MaSP JOIN DanhMuc dm ON dm.MaDM=sp.MaDM
                WHERE hd.TrangThai=N'Hoàn thành' AND hd.NgayLap>=@From AND hd.NgayLap<@ToExclusive
                GROUP BY sp.MaSP,sp.TenSP,dm.TenDM ORDER BY DoanhThuHoaDon DESC`),
            pool.request().query(`
                SELECT dm.MaDM,dm.TenDM,COALESCE(SUM(tk.SLTon),0) SoLuongTon,
                       COALESCE(SUM(tk.GiaTriTon),0) GiaTriTon
                FROM DanhMuc dm JOIN SanPham sp ON sp.MaDM=dm.MaDM
                LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
                GROUP BY dm.MaDM,dm.TenDM ORDER BY GiaTriTon DESC`)
        ]);
        res.json({
            period: core.period,
            latestActivity: core.latestActivity,
            fallbackFrom: core.fallbackFrom,
            sales: core.sales,
            daily: core.daily,
            purchases: core.purchases,
            inventory: core.inventory,
            finance: core.finance,
            cashiers: cashiers.recordset,
            alerts: alerts.recordset[0],
            activity: activity.recordset[0],
            salesByCategory: salesByCategory.recordset,
            topProducts: topProducts.recordset,
            inventoryByCategory: inventoryByCategory.recordset,
            doiTra: core.doiTra
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể lập báo cáo hoạt động cửa hàng.' });
    }
};

const getWarehouseReport = async (req, res) => {
    try {
        const pool = await poolPromise;
        const { period, latestActivity, fallbackFrom } = await resolveReportPeriod(pool, req.query);
        const [movement, stock, low, docs, daily, laterMovement, inventoryByCategory, recentDocuments] = await Promise.all([
            bindPeriod(pool, period).query(`
                SELECT COALESCE(SUM(CASE WHEN LoaiGD=N'Nhập' THEN SoLuong ELSE 0 END),0) SoLuongNhap,
                       COALESCE(SUM(CASE WHEN LoaiGD=N'Xuất' THEN ABS(SoLuong) ELSE 0 END),0) SoLuongXuat,
                       COALESCE(SUM(CASE WHEN LoaiGD=N'Điều chỉnh' THEN SoLuong ELSE 0 END),0) DieuChinhRong
                FROM GiaoDichKho WHERE NgayGD>=@From AND NgayGD<@ToExclusive`),
            pool.request().query(`
                SELECT COUNT(*) TongMatHang,
                       COALESCE(SUM(CASE WHEN ISNULL(tk.SLTon,0)<=0 THEN 1 ELSE 0 END),0) HetHang,
                       COALESCE(SUM(CASE WHEN ISNULL(tk.SLTon,0)<=sp.TonKhoToiThieu THEN 1 ELSE 0 END),0) TonThap,
                       COALESCE(SUM(CASE WHEN tk.SLTon>0 THEN tk.SLTon ELSE 0 END),0) TongTon,
                       COALESCE(SUM(tk.GiaTriTon),0) GiaTriTon
                FROM SanPham sp LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
                WHERE sp.TrangThai IN (N'Đang bán',N'Đang kinh doanh')`),
            pool.request().query(`
                SELECT TOP 20 sp.MaSP, sp.TenSP, sp.DonViTinh, sp.TonKhoToiThieu, ISNULL(tk.SLTon,0) SLTon
                FROM SanPham sp LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
                WHERE sp.TrangThai IN (N'Đang bán',N'Đang kinh doanh') AND ISNULL(tk.SLTon,0)<=sp.TonKhoToiThieu
                ORDER BY (sp.TonKhoToiThieu-ISNULL(tk.SLTon,0)) DESC, sp.TenSP`),
            bindPeriod(pool, period).query(`
                SELECT
                  (SELECT COUNT(*) FROM PhieuNhap WHERE TrangThai=N'Đã xác nhận' AND NgayXacNhan>=@From AND NgayXacNhan<@ToExclusive) SoPhieuNhap,
                  (SELECT COUNT(*) FROM PhieuXuat WHERE NgayXuat>=@From AND NgayXuat<@ToExclusive) SoPhieuXuat,
                  (SELECT COUNT(*) FROM KiemKe WHERE NgayKiemKe>=@From AND NgayKiemKe<@ToExclusive) SoKiemKe,
                  (SELECT COUNT(*) FROM KiemKe WHERE TrangThai=N'Chờ duyệt điều chỉnh') ChoDuyetKiemKe,
                  (SELECT COUNT(*) FROM PhieuXuat WHERE TrangThai=N'Chờ duyệt') ChoDuyetXuat,
                  (SELECT COUNT(*) FROM PhieuDoiTra WHERE TrangThai=N'Chờ kiểm tra') ChoKiemTraDoiTra,
                  COALESCE((SELECT SUM(ABS(ct.ChenhLech*ISNULL(tk.DonGiaBinhQuan,0)))
                     FROM KiemKe kk JOIN ChiTietKiemKe ct ON ct.MaKK=kk.MaKK
                     LEFT JOIN TonKho tk ON tk.MaKho=kk.MaKho AND tk.MaSP=ct.MaSP
                     WHERE kk.NgayKiemKe>=@From AND kk.NgayKiemKe<@ToExclusive),0) GiaTriChenhLechKiemKe`),
            bindPeriod(pool, period).query(`
                SELECT CONVERT(date,NgayGD) Ngay,
                       COALESCE(SUM(CASE WHEN LoaiGD=N'Nhập' THEN SoLuong ELSE 0 END),0) SoLuongNhap,
                       COALESCE(SUM(CASE WHEN LoaiGD=N'Xuất' THEN ABS(SoLuong) ELSE 0 END),0) SoLuongXuat,
                       COALESCE(SUM(CASE WHEN LoaiGD=N'Điều chỉnh' THEN SoLuong ELSE 0 END),0) DieuChinhRong
                FROM GiaoDichKho WHERE NgayGD>=@From AND NgayGD<@ToExclusive
                GROUP BY CONVERT(date,NgayGD) ORDER BY Ngay`),
            bindPeriod(pool, period).query(`
                SELECT COALESCE(SUM(SoLuong),0) SoLuongSauKy
                FROM GiaoDichKho WHERE NgayGD>=@ToExclusive`),
            pool.request().query(`
                SELECT dm.MaDM,dm.TenDM,COALESCE(SUM(tk.SLTon),0) SoLuongTon,
                       COALESCE(SUM(tk.GiaTriTon),0) GiaTriTon
                FROM DanhMuc dm JOIN SanPham sp ON sp.MaDM=dm.MaDM
                LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
                GROUP BY dm.MaDM,dm.TenDM ORDER BY GiaTriTon DESC`),
            bindPeriod(pool, period).query(`
                SELECT TOP 12 * FROM (
                    SELECT pn.MaPN MaChungTu,N'Phiếu nhập' LoaiChungTu,pn.NgayXacNhan NgayChungTu,
                           pn.TrangThai,nv.TenNV NguoiLap,pn.TongTien GiaTri
                    FROM PhieuNhap pn JOIN NhanVien nv ON nv.MaNV=pn.MaNV
                    WHERE pn.NgayXacNhan>=@From AND pn.NgayXacNhan<@ToExclusive
                    UNION ALL
                    SELECT px.MaPX,N'Phiếu xuất',px.NgayXuat,px.TrangThai,nv.TenNV,
                           COALESCE((SELECT SUM(ct.SoLuong*ct.DonGia) FROM ChiTietPhieuXuat ct WHERE ct.MaPX=px.MaPX),0)
                    FROM PhieuXuat px JOIN NhanVien nv ON nv.MaNV=px.MaNV
                    WHERE px.NgayXuat>=@From AND px.NgayXuat<@ToExclusive
                    UNION ALL
                    SELECT kk.MaKK,N'Kiểm kê',kk.NgayKiemKe,kk.TrangThai,nv.TenNV,
                           COALESCE((SELECT SUM(ABS(ct.ChenhLech*ISNULL(tk.DonGiaBinhQuan,0)))
                             FROM ChiTietKiemKe ct LEFT JOIN TonKho tk ON tk.MaKho=kk.MaKho AND tk.MaSP=ct.MaSP
                             WHERE ct.MaKK=kk.MaKK),0)
                    FROM KiemKe kk JOIN NhanVien nv ON nv.MaNV=kk.MaNV
                    WHERE kk.NgayKiemKe>=@From AND kk.NgayKiemKe<@ToExclusive
                ) d ORDER BY NgayChungTu DESC`)
        ]);
        const m = movement.recordset[0];
        const currentQuantity = Number(stock.recordset[0].TongTon || 0);
        const closingQuantity = currentQuantity - Number(laterMovement.recordset[0].SoLuongSauKy || 0);
        const openingQuantity = closingQuantity - Number(m.SoLuongNhap || 0) + Number(m.SoLuongXuat || 0) - Number(m.DieuChinhRong || 0);
        let runningQuantity = openingQuantity;
        const dailyRows = daily.recordset.map(row => {
            runningQuantity += Number(row.SoLuongNhap || 0) - Number(row.SoLuongXuat || 0) + Number(row.DieuChinhRong || 0);
            return { ...row, TonCuoiNgay: runningQuantity };
        });
        res.json({
            period,
            latestActivity,
            fallbackFrom,
            movement: { ...m, SoLuongDauKy: openingQuantity, SoLuongCuoiKy: closingQuantity },
            stock: stock.recordset[0],
            documents: docs.recordset[0],
            lowStock: low.recordset,
            daily: dailyRows,
            inventoryByCategory: inventoryByCategory.recordset,
            recentDocuments: recentDocuments.recordset,
            doiTra: await queryReturnDiagnostics(pool, period)
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể lập báo cáo kho.' });
    }
};

const getSalesReport = async (req, res) => {
    try {
        const pool = await poolPromise;
        const { period, latestActivity, fallbackFrom } = await resolveReportPeriod(pool, req.query);
        const maNV = req.user.MaNV;
        const [sales, methods, shifts, returns, daily, topProducts, recentInvoices, alerts] = await Promise.all([
            bindPeriod(pool, period).input('MaNV', sql.VarChar, maNV).query(`
                SELECT COUNT(*) SoHoaDon,
                       COALESCE(SUM(TongThanhToan),0) DoanhThuHoaDon
                FROM HoaDon WHERE MaNV=@MaNV AND TrangThai=N'Hoàn thành'
                  AND NgayLap>=@From AND NgayLap<@ToExclusive`),
            bindPeriod(pool, period).input('MaNV', sql.VarChar, maNV).query(`
                SELECT
                  COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Tiền mặt' THEN tt.SoTien ELSE 0 END),0) TienMat,
                  COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'QR' THEN tt.SoTien ELSE 0 END),0) QR,
                  COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Thẻ' THEN tt.SoTien ELSE 0 END),0) The,
                  COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Chuyển khoản' THEN tt.SoTien ELSE 0 END),0) ChuyenKhoan
                FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
                WHERE hd.MaNV=@MaNV AND hd.TrangThai=N'Hoàn thành' AND tt.TrangThai=N'Thành công'
                  AND hd.NgayLap>=@From AND hd.NgayLap<@ToExclusive`),
            bindPeriod(pool, period).input('MaNV', sql.VarChar, maNV).query(`
                SELECT ca.MaCa, nv.TenNV, ca.ThoiGianBatDau, ca.ThoiGianKetThuc, ca.TrangThai, ca.TienMatHeThong, ca.TienThucNop,
                       (SELECT COUNT(*) FROM HoaDon hd WHERE hd.MaCa=ca.MaCa AND hd.TrangThai=N'Hoàn thành') SoHoaDon,
                       COALESCE((SELECT SUM(hd.TongThanhToan) FROM HoaDon hd WHERE hd.MaCa=ca.MaCa AND hd.TrangThai=N'Hoàn thành'),0) DoanhThu,
                       (SELECT COUNT(*) FROM PhieuDoiTra dt WHERE dt.MaCaHoan=ca.MaCa AND dt.TrangThai=N'Hoàn thành') SoDoiTra,
                       COALESCE((SELECT SUM(dt.SoTienHoan) FROM PhieuDoiTra dt WHERE dt.MaCaHoan=ca.MaCa AND dt.TrangThai=N'Hoàn thành'),0) TienHoan
                FROM CaLamViec ca
                JOIN NhanVien nv ON nv.MaNV=ca.MaNV
                WHERE ca.MaNV=@MaNV AND ca.ThoiGianBatDau>=@From AND ca.ThoiGianBatDau<@ToExclusive
                ORDER BY ca.ThoiGianBatDau DESC`),
            bindPeriod(pool, period).input('MaNV', sql.VarChar, maNV).query(`
                SELECT COUNT(*) SoPhieu,
                       COALESCE(SUM(SoTienHoan),0) TienHoan
                FROM PhieuDoiTra dt
                WHERE dt.TrangThai=N'Hoàn thành'
                  AND dt.NgayHoan>=@From AND dt.NgayHoan<@ToExclusive
                  AND (
                    EXISTS (SELECT 1 FROM CaLamViec ca WHERE ca.MaCa=dt.MaCaHoan AND ca.MaNV=@MaNV)
                    OR (dt.MaCaHoan IS NULL AND dt.MaNV_Lap=@MaNV)
                  )`),
            bindPeriod(pool, period).input('MaNV', sql.VarChar, maNV).query(`
                WITH BanHangNgay AS (
                    SELECT CONVERT(date,hd.NgayLap) Ngay,COUNT(*) SoHoaDon,SUM(hd.TongThanhToan) DoanhThuHoaDon
                    FROM HoaDon hd
                    WHERE hd.MaNV=@MaNV AND hd.TrangThai=N'Hoàn thành'
                      AND hd.NgayLap>=@From AND hd.NgayLap<@ToExclusive
                    GROUP BY CONVERT(date,hd.NgayLap)
                ), HoanTienNgay AS (
                    SELECT CONVERT(date,dt.NgayHoan) Ngay,COUNT(*) SoPhieu,SUM(dt.SoTienHoan) TienHoan
                    FROM PhieuDoiTra dt
                    WHERE dt.TrangThai=N'Hoàn thành' AND dt.NgayHoan>=@From AND dt.NgayHoan<@ToExclusive
                      AND (EXISTS (SELECT 1 FROM CaLamViec ca WHERE ca.MaCa=dt.MaCaHoan AND ca.MaNV=@MaNV)
                           OR (dt.MaCaHoan IS NULL AND dt.MaNV_Lap=@MaNV))
                    GROUP BY CONVERT(date,dt.NgayHoan)
                ), CacNgay AS (SELECT Ngay FROM BanHangNgay UNION SELECT Ngay FROM HoanTienNgay)
                SELECT n.Ngay,COALESCE(b.SoHoaDon,0) SoHoaDon,COALESCE(b.DoanhThuHoaDon,0) DoanhThuHoaDon,
                       COALESCE(h.SoPhieu,0) SoPhieu,COALESCE(h.TienHoan,0) TienHoan,
                       COALESCE(b.DoanhThuHoaDon,0)-COALESCE(h.TienHoan,0) DoanhThuThuan
                FROM CacNgay n LEFT JOIN BanHangNgay b ON b.Ngay=n.Ngay LEFT JOIN HoanTienNgay h ON h.Ngay=n.Ngay
                ORDER BY n.Ngay`),
            bindPeriod(pool, period).input('MaNV', sql.VarChar, maNV).query(`
                SELECT TOP 8 sp.MaSP,sp.TenSP,SUM(ct.SoLuong) SoLuongBan,
                       COALESCE(SUM(ct.ThanhTien),0) DoanhThu
                FROM HoaDon hd JOIN ChiTietHoaDon ct ON ct.MaHD=hd.MaHD
                JOIN SanPham sp ON sp.MaSP=ct.MaSP
                WHERE hd.MaNV=@MaNV AND hd.TrangThai=N'Hoàn thành'
                  AND hd.NgayLap>=@From AND hd.NgayLap<@ToExclusive
                GROUP BY sp.MaSP,sp.TenSP ORDER BY DoanhThu DESC`),
            bindPeriod(pool, period).input('MaNV', sql.VarChar, maNV).query(`
                SELECT TOP 10 hd.MaHD,hd.NgayLap,hd.TongThanhToan,hd.TrangThai,
                       COALESCE(kh.TenKH,N'Khách lẻ') TenKhachHang,
                       STUFF((SELECT N', '+tt.PhuongThuc FROM ThanhToan tt
                              WHERE tt.MaHD=hd.MaHD AND tt.TrangThai=N'Thành công'
                              ORDER BY tt.PhuongThuc FOR XML PATH(''),TYPE).value('.','nvarchar(max)'),1,2,N'') PhuongThuc,
                       ${INVOICE_RETURN_COLUMNS}
                FROM HoaDon hd LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
                ${INVOICE_RETURN_APPLY}
                WHERE hd.MaNV=@MaNV AND hd.NgayLap>=@From AND hd.NgayLap<@ToExclusive
                ORDER BY hd.NgayLap DESC`),
            bindPeriod(pool, period).input('MaNV', sql.VarChar, maNV).query(`
                SELECT
                  (SELECT COUNT(*) FROM HoaDon WHERE MaNV=@MaNV AND TrangThai=N'Nháp'
                     AND NgayLap>=@From AND NgayLap<@ToExclusive) HoaDonNhap,
                  (SELECT COUNT(*) FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
                     WHERE hd.MaNV=@MaNV AND tt.TrangThai=N'Chờ xác nhận'
                       AND hd.NgayLap>=@From AND hd.NgayLap<@ToExclusive) ThanhToanChoXacNhan,
                  (SELECT COUNT(*) FROM PhieuDoiTra WHERE MaNV_Lap=@MaNV
                     AND TrangThai IN (N'Chờ kiểm tra',N'Chờ duyệt',N'Đã duyệt')) DoiTraDangXuLy,
                  (SELECT COUNT(*) FROM CaLamViec WHERE MaNV=@MaNV AND TrangThai=N'Đã chốt'
                     AND TrangThaiDoiSoat=N'Chờ Kế toán đối soát'
                     AND ThoiGianBatDau>=@From AND ThoiGianBatDau<@ToExclusive) CaChoDoiSoat`)
        ]);
        res.json({
            period,
            latestActivity,
            fallbackFrom,
            sales: { ...sales.recordset[0], ...returns.recordset[0] },
            methods: methods.recordset[0],
            shifts: shifts.recordset,
            daily: daily.recordset,
            topProducts: topProducts.recordset,
            recentInvoices: recentInvoices.recordset,
            alerts: alerts.recordset[0],
            doiTra: await queryReturnDiagnostics(pool, period, maNV)
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể lập báo cáo bán hàng.' });
    }
};

const getPurchasingReport = async (req, res) => {
    try {
        const pool = await poolPromise;
        const { period, latestActivity, fallbackFrom } = await resolveReportPeriod(pool, req.query);
        const [summary, byStatus, suppliers, daily, byCategory, actionOrders] = await Promise.all([
            bindPeriod(pool, period).query(`
                SELECT
                  (SELECT COUNT(*) FROM DonMuaHang WHERE NgayLap>=@From AND NgayLap<@ToExclusive
                     AND TrangThai NOT IN (N'Nháp',N'Từ chối')) SoDonMua,
                  COALESCE((SELECT SUM(TongTien) FROM DonMuaHang WHERE NgayLap>=@From AND NgayLap<@ToExclusive
                     AND TrangThai NOT IN (N'Nháp',N'Từ chối')),0) GiaTriDonMua,
                  (SELECT COUNT(*) FROM PhieuNhap WHERE TrangThai=N'Đã xác nhận'
                     AND NgayXacNhan>=@From AND NgayXacNhan<@ToExclusive) SoPhieuNhap,
                  COALESCE((SELECT SUM(TongTien) FROM PhieuNhap WHERE TrangThai=N'Đã xác nhận'
                     AND NgayXacNhan>=@From AND NgayXacNhan<@ToExclusive),0) GiaTriNhap,
                  (SELECT COUNT(DISTINCT MaNCC) FROM DonMuaHang WHERE NgayLap>=@From AND NgayLap<@ToExclusive
                     AND TrangThai NOT IN (N'Nháp',N'Từ chối')) SoNhaCungCap,
                  (SELECT COUNT(*) FROM NhaCungCap WHERE TrangThai IN (N'Đang hợp tác',N'Hoạt động')) SoNhaCungCapHopTac,
                  (SELECT COUNT(*) FROM DonMuaHang WHERE NgayLap>=@From AND NgayLap<@ToExclusive
                     AND TrangThai=N'Chờ duyệt') SoDonChoDuyet,
                  (SELECT COUNT(*) FROM DonMuaHang WHERE NgayLap>=@From AND NgayLap<@ToExclusive
                     AND TrangThai IN (N'Đã gửi Nhà cung cấp',N'Nhà cung cấp xác nhận',N'Đang giao',N'Giao một phần')) SoDonDangGiao,
                  (SELECT COUNT(*) FROM DonMuaHang WHERE NgayLap>=@From AND NgayLap<@ToExclusive
                     AND NgayGiaoDuKien<CONVERT(date,GETDATE())
                     AND TrangThai NOT IN (N'Hoàn thành',N'Từ chối',N'Nháp')) SoDonTre,
                  (SELECT COUNT(*) FROM DonMuaHang po WHERE po.NgayLap>=@From AND po.NgayLap<@ToExclusive
                     AND EXISTS (SELECT 1 FROM PhieuNhap pn WHERE pn.MaPO=po.MaPO AND pn.TrangThai=N'Đã xác nhận')
                     AND NOT EXISTS (SELECT 1 FROM ChiTietDonMua ct WHERE ct.MaPO=po.MaPO AND ct.SLConThieu>0)) SoDonDaHoanTat,
                  (SELECT COUNT(*) FROM DonMuaHang po WHERE po.NgayLap>=@From AND po.NgayLap<@ToExclusive
                     AND EXISTS (SELECT 1 FROM PhieuNhap pn WHERE pn.MaPO=po.MaPO AND pn.TrangThai=N'Đã xác nhận')
                     AND NOT EXISTS (SELECT 1 FROM ChiTietDonMua ct WHERE ct.MaPO=po.MaPO AND ct.SLConThieu>0)
                     AND (SELECT MAX(CONVERT(date,pn.NgayXacNhan)) FROM PhieuNhap pn
                          WHERE pn.MaPO=po.MaPO AND pn.TrangThai=N'Đã xác nhận')<=po.NgayGiaoDuKien) SoDonDungHan,
                  COALESCE((SELECT SUM(ct.SLConThieu) FROM ChiTietDonMua ct JOIN DonMuaHang po ON po.MaPO=ct.MaPO
                     WHERE po.TrangThai IN (N'Đã duyệt',N'Đã gửi Nhà cung cấp',N'Nhà cung cấp xác nhận',N'Đang giao',N'Giao một phần')),0) SLConThieu`),
            bindPeriod(pool, period).query(`
                SELECT TrangThai, COUNT(*) SoDon, COALESCE(SUM(TongTien),0) GiaTri
                FROM DonMuaHang WHERE NgayLap>=@From AND NgayLap<@ToExclusive
                GROUP BY TrangThai ORDER BY SoDon DESC`),
            bindPeriod(pool, period).query(`
                SELECT TOP 10 ncc.MaNCC, ncc.TenNCC, COUNT(*) SoDon, COALESCE(SUM(po.TongTien),0) GiaTri
                FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
                WHERE po.NgayLap>=@From AND po.NgayLap<@ToExclusive AND po.TrangThai NOT IN (N'Nháp',N'Từ chối')
                GROUP BY ncc.MaNCC, ncc.TenNCC ORDER BY GiaTri DESC`),
            bindPeriod(pool, period).query(`
                SELECT CONVERT(date,NgayLap) Ngay,COUNT(*) SoDon,COALESCE(SUM(TongTien),0) GiaTri
                FROM DonMuaHang
                WHERE NgayLap>=@From AND NgayLap<@ToExclusive AND TrangThai NOT IN (N'Nháp',N'Từ chối')
                GROUP BY CONVERT(date,NgayLap) ORDER BY Ngay`),
            bindPeriod(pool, period).query(`
                SELECT dm.MaDM,dm.TenDM,SUM(ct.SoLuong) SoLuongDat,COALESCE(SUM(ct.ThanhTien),0) GiaTri
                FROM DonMuaHang po JOIN ChiTietDonMua ct ON ct.MaPO=po.MaPO
                JOIN SanPham sp ON sp.MaSP=ct.MaSP JOIN DanhMuc dm ON dm.MaDM=sp.MaDM
                WHERE po.NgayLap>=@From AND po.NgayLap<@ToExclusive
                  AND po.TrangThai NOT IN (N'Nháp',N'Từ chối')
                GROUP BY dm.MaDM,dm.TenDM ORDER BY GiaTri DESC`),
            bindPeriod(pool, period).query(`
                SELECT TOP 10 po.MaPO,ncc.TenNCC,po.NgayLap,po.NgayGiaoDuKien,po.TongTien,po.TrangThai,
                       COALESCE((SELECT SUM(ct.SLConThieu) FROM ChiTietDonMua ct WHERE ct.MaPO=po.MaPO),0) SLConThieu,
                       CASE WHEN po.NgayGiaoDuKien<CONVERT(date,GETDATE())
                                  AND po.TrangThai NOT IN (N'Hoàn thành',N'Từ chối',N'Nháp') THEN N'Quá hạn giao'
                            WHEN po.TrangThai=N'Chờ duyệt' THEN N'Chờ Quản lý duyệt'
                            WHEN po.TrangThai IN (N'Đang giao',N'Giao một phần',N'Nhà cung cấp xác nhận',N'Đã gửi Nhà cung cấp') THEN N'Đang theo dõi giao'
                            ELSE po.TrangThai END UuTien
                FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
                WHERE po.NgayLap>=@From AND po.NgayLap<@ToExclusive
                  AND (po.TrangThai=N'Chờ duyệt' OR po.TrangThai IN (N'Đang giao',N'Giao một phần',N'Nhà cung cấp xác nhận',N'Đã gửi Nhà cung cấp')
                       OR (po.NgayGiaoDuKien<CONVERT(date,GETDATE()) AND po.TrangThai NOT IN (N'Hoàn thành',N'Từ chối',N'Nháp')))
                ORDER BY CASE WHEN po.NgayGiaoDuKien<CONVERT(date,GETDATE()) THEN 0 WHEN po.TrangThai=N'Chờ duyệt' THEN 1 ELSE 2 END,
                         po.NgayGiaoDuKien,po.NgayLap DESC`)
        ]);
        res.json({
            period,
            latestActivity,
            fallbackFrom,
            summary: summary.recordset[0],
            byStatus: byStatus.recordset,
            suppliers: suppliers.recordset,
            daily: daily.recordset,
            byCategory: byCategory.recordset,
            actionOrders: actionOrders.recordset,
            doiTra: await queryReturnDiagnostics(pool, period)
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message || 'Không thể lập báo cáo mua hàng.' });
    }
};

const noStore = res => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    return res;
};

const getStoreProfitLossReport = async (req, res) => {
    try {
        noStore(res);
        const pool = await poolPromise;
        const resolved = await resolveReportPeriod(pool, req.query);
        res.json(await storeProfitLoss.buildReport(pool, resolved));
    } catch (error) {
        console.error(error);
        noStore(res).status(400).json({ message: error.message || 'Không thể lập báo cáo lãi lỗ cửa hàng.' });
    }
};

const postStoreProfitLossPlan = async (req, res) => {
    try {
        noStore(res);
        const pool = await poolPromise;
        const resolved = await resolveReportPeriod(pool, {
            periodType: req.body?.periodType,
            period: req.body?.period,
            lockPeriod: '1'
        });
        const result = await storeProfitLoss.savePlan(pool, req.user, req, resolved, req.body || {});
        res.json(result);
    } catch (error) {
        console.error(error);
        noStore(res).status(error.status || 400).json({
            message: error.message || 'Không thể lưu kế hoạch điều chỉnh.'
        });
    }
};

module.exports = {
    getFinancialReport,
    getStoreOperationsReport,
    getWarehouseReport,
    getSalesReport,
    getPurchasingReport,
    getStoreProfitLossReport,
    postStoreProfitLossPlan
};
