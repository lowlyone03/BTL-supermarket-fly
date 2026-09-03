const { sql, poolPromise } = require('../config/db');
const { closeOpenAttendance } = require('../services/attendanceSync');
const { ensureFundColumns } = require('./paymentVoucherController');
const { ensurePayrollSchema } = require('../services/payrollSchema');

const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);

const getDashboard = async (req, res) => {
    try {
        const pool = await poolPromise;
        await closeOpenAttendance(pool).catch(() => {});
        const [summaryResult, rolesResult, pendingResult, logsResult, revenueResult, lowStockResult] = await Promise.all([
            pool.request().query(`
                SELECT
                    (SELECT COUNT(*) FROM NhanVien) AS TongNhanVien,
                    (SELECT COUNT(*) FROM NhanVien WHERE TrangThai = N'Đang làm việc') AS NhanVienDangLam,
                    (SELECT COUNT(*) FROM NhanVien n WHERE n.TrangThai = N'Đang làm việc'
                        AND NOT EXISTS (SELECT 1 FROM TaiKhoan t WHERE t.MaNV = n.MaNV)) AS ChuaCoTaiKhoan,
                    (SELECT COUNT(*) FROM TaiKhoan) AS TongTaiKhoan,
                    (SELECT COUNT(*) FROM TaiKhoan WHERE TrangThai = 0) AS TaiKhoanBiKhoa,
                    (SELECT COUNT(*) FROM NhatKy WHERE CONVERT(date, ThoiGian) = CONVERT(date, GETDATE())) AS ThaoTacHomNay,
                    (SELECT COUNT(*) FROM CaLamViec WHERE TrangThai = N'Đang mở' AND ThoiGianKetThuc IS NULL) AS CaDangMo
            `),
            pool.request().query(`
                SELECT v.TenVaiTro, COUNT(n.MaNV) AS SoNhanVien
                FROM VaiTro v
                LEFT JOIN NhanVien n ON n.ChucVu = v.TenVaiTro AND n.TrangThai = N'Đang làm việc'
                GROUP BY v.MaVaiTro, v.TenVaiTro
                ORDER BY v.MaVaiTro
            `),
            pool.request().query(`
                SELECT
                    (SELECT COUNT(*) FROM DonMuaHang WHERE TrangThai = N'Chờ duyệt') AS DonMuaHang,
                    (SELECT COUNT(*) FROM PhieuXuat WHERE TrangThai = N'Chờ duyệt') AS PhieuXuat,
                    (SELECT COUNT(*) FROM KiemKe WHERE TrangThai = N'Chờ duyệt điều chỉnh') AS KiemKe,
                    (SELECT COUNT(*) FROM PhieuDoiTra WHERE TrangThai = N'Chờ duyệt') AS DoiTra,
                    (SELECT COUNT(*) FROM PhieuChi WHERE TrangThai = N'Chờ duyệt') AS PhieuChi
            `),
            pool.request().query(`
                SELECT TOP 5 nk.HanhDong, nk.NoiDung, nk.ThoiGian,
                       COALESCE(n.TenNV, t.TenDangNhap, N'Hệ thống') AS NguoiThaoTac
                FROM NhatKy nk
                LEFT JOIN TaiKhoan t ON t.MaTK = nk.MaTK
                LEFT JOIN NhanVien n ON n.MaNV = t.MaNV
                ORDER BY nk.ThoiGian DESC
            `),
            pool.request().query(`
                SELECT COALESCE(SUM(CASE WHEN CONVERT(date,hd.NgayLap)=CONVERT(date,GETDATE()) THEN hd.TongThanhToan ELSE 0 END),0) AS DoanhThuHomNay,
                       COALESCE(SUM(CASE WHEN CONVERT(date,hd.NgayLap)>=DATEADD(day,-7,CONVERT(date,GETDATE())) THEN hd.TongThanhToan ELSE 0 END),0) AS DoanhThu7Ngay,
                       COALESCE(SUM(CASE WHEN CONVERT(date,hd.NgayLap)=CONVERT(date,GETDATE()) THEN hd.TongThanhToan ELSE 0 END)
                               -SUM(CASE WHEN CONVERT(date,hd.NgayLap)=CONVERT(date,GETDATE()) THEN ct.GiaVonTong ELSE 0 END),0) AS LaiGopHomNay
                FROM HoaDon hd
                CROSS APPLY (SELECT COALESCE(SUM(c.DonGiaVon*c.SoLuong),0) AS GiaVonTong FROM ChiTietHoaDon c WHERE c.MaHD=hd.MaHD) ct
                WHERE hd.TrangThai=N'Hoàn thành'
            `).catch(() => ({ recordset: [{ DoanhThuHomNay: 0, DoanhThu7Ngay: 0, LaiGopHomNay: 0 }] })),
            pool.request().query(`
                SELECT TOP 10 sp.MaSP, sp.TenSP, sp.DonViTinh, sp.TonKhoToiThieu, ISNULL(SUM(tk.SLTon),0) AS SLTon
                FROM SanPham sp LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
                WHERE sp.TrangThai=N'Đang bán'
                GROUP BY sp.MaSP,sp.TenSP,sp.DonViTinh,sp.TonKhoToiThieu
                HAVING ISNULL(SUM(tk.SLTon),0) <= sp.TonKhoToiThieu
                ORDER BY ISNULL(SUM(tk.SLTon),0) ASC
            `).catch(() => ({ recordset: [] }))
        ]);

        const pending = pendingResult.recordset[0];
        res.json({
            summary: summaryResult.recordset[0],
            roleDistribution: rolesResult.recordset,
            pendingApprovals: {
                ...pending,
                TongChoDuyet: Object.values(pending).reduce((total, value) => total + Number(value || 0), 0)
            },
            recentLogs: logsResult.recordset,
            revenue: revenueResult.recordset[0] || { DoanhThuHomNay: 0, DoanhThu7Ngay: 0, LaiGopHomNay: 0 },
            lowStock: lowStockResult.recordset
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải dữ liệu tổng quan.' });
    }
};

const getApprovalQueues = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensurePayrollSchema(pool);
        const [warehouse, finance, payroll] = await Promise.all([
            pool.request().query(`
                SELECT N'Phiếu xuất kho' AS LoaiHoSo,px.MaPX AS MaHoSo,px.NgayXuat AS NgayLap,
                       nv.TenNV AS NguoiLap,px.LoaiXuat AS NoiDung,px.TrangThai
                FROM PhieuXuat px JOIN NhanVien nv ON nv.MaNV=px.MaNV
                WHERE px.TrangThai=N'Chờ duyệt'
                UNION ALL
                SELECT N'Điều chỉnh kiểm kê',kk.MaKK,kk.NgayKiemKe,nv.TenNV,
                       COALESCE(kk.GhiChu,N'Đề nghị điều chỉnh chênh lệch tồn kho'),kk.TrangThai
                FROM KiemKe kk JOIN NhanVien nv ON nv.MaNV=kk.MaNV
                WHERE kk.TrangThai=N'Chờ duyệt điều chỉnh'
                ORDER BY NgayLap DESC`),
            pool.request().query(`
                SELECT N'Phiếu chi Nhà cung cấp' AS LoaiHoSo,pc.MaPhieu AS MaHoSo,pc.NgayChungTu AS NgayLap,
                       nv.TenNV AS NguoiLap,pc.NoiDung,pc.SoTien,pc.TrangThai
                FROM PhieuChi pc JOIN NhanVien nv ON nv.MaNV=pc.MaNV
                WHERE pc.TrangThai=N'Chờ duyệt'
                UNION ALL
                SELECT N'Đổi trả khách hàng',dt.MaDT,dt.NgayLap,nv.TenNV,
                       COALESCE(dt.LyDo,N'Đề nghị đổi trả'),dt.SoTienHoan,dt.TrangThai
                FROM PhieuDoiTra dt JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
                WHERE dt.TrangThai=N'Chờ duyệt'
                ORDER BY NgayLap DESC`),
            pool.request().query(`
                    SELECT pcl.MaPhieu,pcl.MaKy,nv.TenNV,pcl.SoTien,pcl.PhuongThuc,pcl.NgayLap,lap.TenNV AS NguoiLap,
                           N'Phiếu chi lương' AS LoaiHoSo, pcl.MaPhieu AS MaHoSo, nv.TenNV AS NoiDung
                    FROM PhieuChiLuong pcl
                    JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
                    JOIN NhanVien lap ON lap.MaNV=pcl.MaNV_Lap
                    WHERE pcl.TrangThai=N'Chờ duyệt'
                    ORDER BY pcl.NgayLap DESC`)
        ]);
        res.json({ warehouse: warehouse.recordset, finance: finance.recordset, payroll: payroll.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải trung tâm phê duyệt.' });
    }
};

// Màn hình giám sát dành cho Quản lý. API này chỉ đọc dữ liệu công nợ;
// việc đối chiếu hóa đơn, ghi nhận và thanh toán vẫn thuộc nghiệp vụ Kế toán.
const getPayablesOverview = async (req, res) => {
    try {
        const keyword = clean(req.query.search);
        const status = clean(req.query.status, 30);
        const pool = await poolPromise;
        await ensureFundColumns(pool);
        const [itemsResult, summaryResult] = await Promise.all([
            pool.request()
                .input('TuKhoa', sql.NVarChar, keyword)
                .input('Mau', sql.NVarChar, `%${keyword}%`)
                .input('TrangThai', sql.NVarChar, status)
                .query(`
                    WITH DuLieuCongNo AS (
                        SELECT cn.MaCNPTra,cn.MaNCC,ncc.TenNCC,cn.MaHDMH,hd.SoHoaDon,
                               hd.MaPO,hd.MaPN,cn.SoTienNo,cn.SoTienDaTra,cn.SoTienConLai,
                               cn.NgayPhatSinh,cn.HanThanhToan,cn.GhiChu,
                               pc.MaPhieu,pc.PhuongThuc,pc.SoTien AS SoTienPhieuChi,
                               pc.TrangThai AS TrangThaiPhieuChi,pc.HinhThucCapQuy,pc.NgayCapQuy,
                               pc.GhiChuCapQuy,nvDuyet.TenNV AS NguoiDuyet,nvLap.TenNV AS NguoiLap,
                               DATEDIFF(DAY,CONVERT(date,GETDATE()),cn.HanThanhToan) AS SoNgayConLai,
                               CASE
                                   WHEN cn.SoTienConLai=0 THEN N'Đã thanh toán'
                                   WHEN cn.HanThanhToan<CONVERT(date,GETDATE()) THEN N'Quá hạn'
                                   ELSE N'Đang nợ'
                               END AS TrangThaiHienTai,
                               CASE
                                   WHEN cn.SoTienConLai=0 OR pc.TrangThai=N'Thanh toán thành công' THEN N'Đã tất toán'
                                   WHEN pc.TrangThai=N'Thanh toán thất bại' THEN N'Thanh toán thất bại, Kế toán làm lại'
                                   WHEN pc.TrangThai=N'Đã duyệt' THEN N'Đã giao tiền, chờ Kế toán chi'
                                   WHEN pc.TrangThai=N'Chờ duyệt' THEN N'Chờ Quản lý giao tiền'
                                   WHEN pc.TrangThai=N'Từ chối' THEN N'Phiếu chi bị từ chối'
                                   WHEN pc.MaPhieu IS NULL THEN N'Kế toán chưa lập Phiếu chi'
                                   ELSE pc.TrangThai
                               END AS BuocTatToan
                        FROM CongNoPhaiTra cn
                        JOIN NhaCungCap ncc ON ncc.MaNCC=cn.MaNCC
                        JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
                        LEFT JOIN PhieuChi pc ON pc.MaCongNo=cn.MaCNPTra
                        LEFT JOIN NhanVien nvLap ON nvLap.MaNV=pc.MaNV
                        LEFT JOIN NhanVien nvDuyet ON nvDuyet.MaNV=pc.MaNV_Duyet
                    )
                    SELECT * FROM DuLieuCongNo
                    WHERE (@TrangThai=N'' OR TrangThaiHienTai=@TrangThai)
                      AND (@TuKhoa=N'' OR MaCNPTra LIKE @Mau COLLATE Latin1_General_100_CI_AI OR TenNCC LIKE @Mau COLLATE Latin1_General_100_CI_AI
                           OR SoHoaDon LIKE @Mau COLLATE Latin1_General_100_CI_AI OR MaPO LIKE @Mau COLLATE Latin1_General_100_CI_AI OR MaPN LIKE @Mau COLLATE Latin1_General_100_CI_AI)
                    ORDER BY CASE WHEN TrangThaiHienTai=N'Quá hạn' THEN 0
                                  WHEN TrangThaiHienTai=N'Đang nợ' THEN 1 ELSE 2 END,
                             HanThanhToan,NgayPhatSinh DESC`),
            pool.request().query(`
                SELECT COUNT(*) AS TongKhoan,
                       COALESCE(SUM(SoTienNo),0) AS TongPhatSinh,
                       COALESCE(SUM(SoTienDaTra),0) AS TongDaTra,
                       COALESCE(SUM(SoTienConLai),0) AS TongConLai,
                       COALESCE(SUM(CASE WHEN SoTienConLai>0 AND HanThanhToan<CONVERT(date,GETDATE())
                                         THEN SoTienConLai ELSE 0 END),0) AS TongQuaHan,
                       SUM(CASE WHEN SoTienConLai>0 AND HanThanhToan<CONVERT(date,GETDATE())
                                THEN 1 ELSE 0 END) AS SoKhoanQuaHan,
                       (SELECT COUNT(*) FROM PhieuChi WHERE TrangThai=N'Chờ duyệt') AS ChoGiaoTien,
                       (SELECT COUNT(*) FROM PhieuChi WHERE TrangThai IN (N'Đã duyệt', N'Thanh toán thất bại')) AS ChoKeToanChi
                FROM CongNoPhaiTra`)
        ]);
        res.json({ items: itemsResult.recordset, summary: summaryResult.recordset[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải tình hình công nợ Nhà cung cấp.' });
    }
};

const getPayableDetail = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureFundColumns(pool);
        const header = await pool.request()
            .input('MaCN', sql.VarChar, clean(req.params.id, 20))
            .query(`
                SELECT cn.MaCNPTra,cn.MaNCC,ncc.TenNCC,ncc.SDT,ncc.Email,
                       cn.MaHDMH,hd.SoHoaDon,hd.MaPO,hd.MaPN,hd.NgayHoaDon,
                       cn.SoTienNo,cn.SoTienDaTra,cn.SoTienConLai,cn.NgayPhatSinh,
                       cn.HanThanhToan,cn.GhiChu,
                       pc.MaPhieu,pc.PhuongThuc,pc.SoTien AS SoTienPhieuChi,
                       pc.TrangThai AS TrangThaiPhieuChi,pc.HinhThucCapQuy,pc.NgayCapQuy,
                       pc.GhiChuCapQuy,pc.NoiDung,pc.MaGiaoDichNganHang,
                       nvLap.TenNV AS NguoiLap,nvDuyet.TenNV AS NguoiDuyet,
                       CASE WHEN cn.SoTienConLai=0 THEN N'Đã thanh toán'
                            WHEN cn.HanThanhToan<CONVERT(date,GETDATE()) THEN N'Quá hạn'
                            ELSE N'Đang nợ' END AS TrangThaiHienTai,
                       CASE
                           WHEN cn.SoTienConLai=0 OR pc.TrangThai=N'Thanh toán thành công' THEN N'Đã tất toán'
                           WHEN pc.TrangThai=N'Thanh toán thất bại' THEN N'Thanh toán thất bại, Kế toán làm lại'
                           WHEN pc.TrangThai=N'Đã duyệt' THEN N'Đã giao tiền, chờ Kế toán chi'
                           WHEN pc.TrangThai=N'Chờ duyệt' THEN N'Chờ Quản lý giao tiền'
                           WHEN pc.TrangThai=N'Từ chối' THEN N'Phiếu chi bị từ chối'
                           WHEN pc.MaPhieu IS NULL THEN N'Kế toán chưa lập Phiếu chi'
                           ELSE pc.TrangThai
                       END AS BuocTatToan
                FROM CongNoPhaiTra cn
                JOIN NhaCungCap ncc ON ncc.MaNCC=cn.MaNCC
                JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
                LEFT JOIN PhieuChi pc ON pc.MaCongNo=cn.MaCNPTra
                LEFT JOIN NhanVien nvLap ON nvLap.MaNV=pc.MaNV
                LEFT JOIN NhanVien nvDuyet ON nvDuyet.MaNV=pc.MaNV_Duyet
                WHERE cn.MaCNPTra=@MaCN`);
        if (!header.recordset.length) {
            return res.status(404).json({ message: 'Không tìm thấy khoản công nợ.' });
        }
        const lines = await pool.request()
            .input('MaHD', sql.VarChar, header.recordset[0].MaHDMH)
            .query(`
                SELECT ct.MaSP,sp.TenSP,sp.DonViTinh,ct.SoLuong,ct.DonGia,
                       ct.ThueSuat,ct.TienThue,ct.ThanhTien
                FROM ChiTietHoaDonMuaHang ct
                JOIN SanPham sp ON sp.MaSP=ct.MaSP
                WHERE ct.MaHDMH=@MaHD ORDER BY sp.TenSP`);
        res.json({ payable: header.recordset[0], lines: lines.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải chi tiết khoản công nợ.' });
    }
};

const getSalesShifts = async (req, res) => {
    try {
        const from = clean(req.query.from, 10);
        const to = clean(req.query.to, 10);
        const pool = await poolPromise;
        const result = await pool.request()
            .input('From', sql.Date, from || null)
            .input('To', sql.Date, to || null)
            .query(`
                SELECT ca.MaCa,ca.MaNV,nv.TenNV,ca.MaQuay,q.TenQuay,
                       ca.ThoiGianBatDau,ca.ThoiGianKetThuc,ca.TienDauCa,ca.TienCuoiCa,
                       ca.TongTienMat,ca.TongTienQR,ca.TongTienThe,ca.TongTienChuyenKhoan,
                       ca.TongTienHoanMat,ca.TienMatHeThong,ca.TienThucNop,
                       ca.TienThucNop-ca.TienMatHeThong ChenhLech,
                       ca.TrangThai,ca.TrangThaiDoiSoat,
                       (SELECT COUNT(*) FROM HoaDon hd WHERE hd.MaCa=ca.MaCa AND hd.TrangThai=N'Hoàn thành') SoHoaDon,
                       (SELECT COALESCE(SUM(hd.TongThanhToan),0) FROM HoaDon hd
                        WHERE hd.MaCa=ca.MaCa AND hd.TrangThai=N'Hoàn thành') DoanhThu
                FROM CaLamViec ca
                JOIN NhanVien nv ON nv.MaNV=ca.MaNV
                LEFT JOIN QuayBanHang q ON q.MaQuay=ca.MaQuay
                WHERE (@From IS NULL OR CONVERT(date,ca.ThoiGianBatDau)>=@From)
                  AND (@To IS NULL OR CONVERT(date,ca.ThoiGianBatDau)<=@To)
                ORDER BY ca.ThoiGianBatDau DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải báo cáo ca bán hàng.' });
    }
};

module.exports = { getDashboard, getApprovalQueues, getPayablesOverview, getPayableDetail, getSalesShifts };
