const { sql, poolPromise } = require('../config/db');

const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);

const getDashboard = async (req, res) => {
    try {
        const pool = await poolPromise;
        const [summaryResult, rolesResult, pendingResult, logsResult] = await Promise.all([
            pool.request().query(`
                SELECT
                    (SELECT COUNT(*) FROM NhanVien) AS TongNhanVien,
                    (SELECT COUNT(*) FROM NhanVien WHERE TrangThai = N'Đang làm việc') AS NhanVienDangLam,
                    (SELECT COUNT(*) FROM NhanVien n WHERE n.TrangThai = N'Đang làm việc'
                        AND NOT EXISTS (SELECT 1 FROM TaiKhoan t WHERE t.MaNV = n.MaNV)) AS ChuaCoTaiKhoan,
                    (SELECT COUNT(*) FROM TaiKhoan) AS TongTaiKhoan,
                    (SELECT COUNT(*) FROM TaiKhoan WHERE TrangThai = 0) AS TaiKhoanBiKhoa,
                    (SELECT COUNT(*) FROM NhatKy WHERE CONVERT(date, ThoiGian) = CONVERT(date, GETDATE())) AS ThaoTacHomNay
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
            `)
        ]);

        const pending = pendingResult.recordset[0];
        res.json({
            summary: summaryResult.recordset[0],
            roleDistribution: rolesResult.recordset,
            pendingApprovals: {
                ...pending,
                TongChoDuyet: Object.values(pending).reduce((total, value) => total + Number(value || 0), 0)
            },
            recentLogs: logsResult.recordset
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải dữ liệu tổng quan.' });
    }
};

const getApprovalQueues = async (req, res) => {
    try {
        const pool = await poolPromise;
        const [warehouse, finance] = await Promise.all([
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
                ORDER BY NgayLap DESC`)
        ]);
        res.json({ warehouse: warehouse.recordset, finance: finance.recordset });
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
                               DATEDIFF(DAY,CONVERT(date,GETDATE()),cn.HanThanhToan) AS SoNgayConLai,
                               CASE
                                   WHEN cn.SoTienConLai=0 THEN N'Đã thanh toán'
                                   WHEN cn.HanThanhToan<CONVERT(date,GETDATE()) THEN N'Quá hạn'
                                   ELSE N'Đang nợ'
                               END AS TrangThaiHienTai
                        FROM CongNoPhaiTra cn
                        JOIN NhaCungCap ncc ON ncc.MaNCC=cn.MaNCC
                        JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
                    )
                    SELECT * FROM DuLieuCongNo
                    WHERE (@TrangThai=N'' OR TrangThaiHienTai=@TrangThai)
                      AND (@TuKhoa=N'' OR MaCNPTra LIKE @Mau OR TenNCC LIKE @Mau
                           OR SoHoaDon LIKE @Mau OR MaPO LIKE @Mau OR MaPN LIKE @Mau)
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
                                THEN 1 ELSE 0 END) AS SoKhoanQuaHan
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
        const header = await pool.request()
            .input('MaCN', sql.VarChar, clean(req.params.id, 20))
            .query(`
                SELECT cn.MaCNPTra,cn.MaNCC,ncc.TenNCC,ncc.SDT,ncc.Email,
                       cn.MaHDMH,hd.SoHoaDon,hd.MaPO,hd.MaPN,hd.NgayHoaDon,
                       cn.SoTienNo,cn.SoTienDaTra,cn.SoTienConLai,cn.NgayPhatSinh,
                       cn.HanThanhToan,cn.GhiChu,
                       CASE WHEN cn.SoTienConLai=0 THEN N'Đã thanh toán'
                            WHEN cn.HanThanhToan<CONVERT(date,GETDATE()) THEN N'Quá hạn'
                            ELSE N'Đang nợ' END AS TrangThaiHienTai
                FROM CongNoPhaiTra cn
                JOIN NhaCungCap ncc ON ncc.MaNCC=cn.MaNCC
                JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
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

module.exports = { getDashboard, getApprovalQueues, getPayablesOverview, getPayableDetail };
