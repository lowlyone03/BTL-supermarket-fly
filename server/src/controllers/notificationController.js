const { sql, poolPromise } = require('../config/db');
const { ensurePayrollSchema } = require('../services/payrollSchema');
const { vietnamCalendar } = require('../services/reportingPeriod');

const roleOf = user => String(user?.TenVaiTro || '').trim();

const row = (id, target, title, detail, at, tone = 'info') => ({
    id, target, title, detail: detail || '', at: at || null, tone
});

const many = (recordset, map) => (recordset || []).map(map).filter(item => item?.id);

const inboxHint = {
    'Quản lý': 'Việc nhân viên vừa gửi sẽ hiện ở đây. Không cần F5: chuông và trang phê duyệt tự cập nhật.',
    'Thủ kho': 'Khi thu ngân gửi đổi trả, mua hàng báo hàng đến, hoặc Quản lý duyệt phiếu xuất — việc mới hiện ngay.',
    'Nhân viên mua hàng': 'Đề nghị từ kho và đơn mua đã duyệt cần gửi Nhà cung cấp được đẩy sang đây.',
    'Kế toán': 'Ca thu ngân đã chốt, hóa đơn chờ đối chiếu và phiếu chi sẵn sàng thanh toán.',
    'Thu ngân': 'Lịch hôm nay, đổi trả đang chờ kho/quản lý, và phiếu đã duyệt cần bạn xác nhận hoàn/đổi.'
};

const listForRole = async (pool, user) => {
    const role = roleOf(user);
    const maNV = user.MaNV;
    const items = [];
    const q = () => pool.request();

    const schedule = await q().input('MaNV', sql.VarChar, maNV).query(`
        SELECT TOP 1 l.MaLich, lc.TenCa, l.BatDauDuKien, cc.ThoiGianVao
        FROM LichLamViec l
        JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
        LEFT JOIN ChamCong cc ON cc.MaLich=l.MaLich
        WHERE l.MaNV=@MaNV AND l.TrangThai=N'Đã công bố'
          AND l.NgayLam=CONVERT(date, GETDATE())
        ORDER BY l.BatDauDuKien`);
    if (schedule.recordset[0] && !schedule.recordset[0].ThoiGianVao && role !== 'Quản lý') {
        const s = schedule.recordset[0];
        items.push(row(`lich:${s.MaLich}`, 'cashier-schedule', 'Lịch làm việc hôm nay',
            `${s.TenCa} · hãy chấm công vào trước khi làm việc`, s.BatDauDuKien, 'info'));
    }

    if (role === 'Quản lý') {
        const poolSafe = pool;
        await ensurePayrollSchema(poolSafe).catch(() => {});
        const [po, px, kk, dt, pc, cc, pcl, latePay] = await Promise.all([
            q().query(`SELECT TOP 8 po.MaPO, po.NgayLap, ncc.TenNCC, nv.TenNV
                       FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
                       JOIN NhanVien nv ON nv.MaNV=po.MaNV_Lap
                       WHERE po.TrangThai=N'Chờ duyệt' ORDER BY po.NgayLap DESC`),
            q().query(`SELECT TOP 8 px.MaPX, px.NgayXuat, px.LoaiXuat, nv.TenNV
                       FROM PhieuXuat px JOIN NhanVien nv ON nv.MaNV=px.MaNV
                       WHERE px.TrangThai=N'Chờ duyệt' ORDER BY px.NgayXuat DESC`),
            q().query(`SELECT TOP 8 kk.MaKK, kk.NgayKiemKe, nv.TenNV
                       FROM KiemKe kk JOIN NhanVien nv ON nv.MaNV=kk.MaNV
                       WHERE kk.TrangThai=N'Chờ duyệt điều chỉnh' ORDER BY kk.NgayKiemKe DESC`),
            q().query(`SELECT TOP 8 dt.MaDT, dt.NgayLap, dt.HinhThucXuLy, nv.TenNV
                       FROM PhieuDoiTra dt JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
                       WHERE dt.TrangThai=N'Chờ duyệt' ORDER BY dt.NgayLap DESC`),
            q().query(`SELECT TOP 8 pc.MaPhieu, pc.NgayChungTu, pc.SoTien, nv.TenNV
                       FROM PhieuChi pc JOIN NhanVien nv ON nv.MaNV=pc.MaNV
                       WHERE pc.TrangThai=N'Chờ duyệt' ORDER BY pc.NgayChungTu DESC`),
            q().query(`SELECT TOP 8 cc.MaChamCong, l.NgayLam, nv.TenNV, lc.TenCa
                       FROM ChamCong cc JOIN LichLamViec l ON l.MaLich=cc.MaLich
                       JOIN NhanVien nv ON nv.MaNV=l.MaNV
                       JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
                       WHERE cc.TrangThai=N'Chờ duyệt' ORDER BY cc.ThoiGianRa DESC`),
            q().query(`SELECT TOP 8 pcl.MaPhieu, pcl.NgayLap, pcl.SoTien, nv.TenNV, pcl.MaKy, pcl.PhuongThuc
                       FROM PhieuChiLuong pcl JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
                       WHERE pcl.TrangThai=N'Chờ duyệt' ORDER BY pcl.NgayLap DESC`),
            q().query(`SELECT TOP 8 k.MaKy, CONVERT(varchar(10),k.NgayTraDuKien,23) NgayTraDuKien,
                              SUM(CASE WHEN bl.TrangThai<>N'Đã thanh toán' THEN 1 ELSE 0 END) SoChuaChi
                       FROM KyLuong k JOIN BangLuong bl ON bl.MaKy=k.MaKy
                       WHERE k.TrangThai IN (N'Đã khóa', N'Đã thanh toán')
                         AND k.NgayTraDuKien IS NOT NULL
                         AND CONVERT(date, GETDATE()) >= DATEADD(day,-2,k.NgayTraDuKien)
                         AND EXISTS (SELECT 1 FROM BangLuong b WHERE b.MaKy=k.MaKy AND b.TrangThai<>N'Đã thanh toán')
                       GROUP BY k.MaKy, k.NgayTraDuKien`)
        ]);
        items.push(
            ...many(po.recordset, r => row(`po:${r.MaPO}`, 'manager-purchase-approvals', 'Đơn mua chờ duyệt',
                `${r.MaPO} · ${r.TenNCC} · ${r.TenNV}`, r.NgayLap, 'urgent')),
            ...many(px.recordset, r => row(`px:${r.MaPX}`, 'manager-purchase-approvals', 'Phiếu xuất chờ duyệt',
                `${r.MaPX} · ${r.LoaiXuat} · ${r.TenNV}`, r.NgayXuat, 'urgent')),
            ...many(kk.recordset, r => row(`kk:${r.MaKK}`, 'manager-purchase-approvals', 'Kiểm kê chờ duyệt điều chỉnh',
                `${r.MaKK} · ${r.TenNV}`, r.NgayKiemKe, 'urgent')),
            ...many(dt.recordset, r => row(`dt:${r.MaDT}`, 'manager-purchase-approvals', 'Đổi trả chờ duyệt',
                `${r.MaDT} · ${r.HinhThucXuLy} · ${r.TenNV}`, r.NgayLap, 'urgent')),
            ...many(pc.recordset, r => row(`pc:${r.MaPhieu}`, 'manager-payables', 'Phiếu chi chờ duyệt và giao tiền',
                `${r.MaPhieu} · ${r.TenNV}`, r.NgayChungTu, 'urgent')),
            ...many(cc.recordset, r => row(`cc:${r.MaChamCong}`, 'manager-workforce', 'Chấm công chờ duyệt',
                `${r.TenNV} · ${r.TenCa}`, r.NgayLam, 'urgent')),
            ...many(pcl.recordset, r => row(`pcl:${r.MaPhieu}`, 'manager-purchase-approvals', 'Phiếu chi lương chờ duyệt và giao quỹ',
                `${r.MaPhieu} · ${r.TenNV} · ${r.PhuongThuc} · kỳ ${r.MaKy}`, r.NgayLap, 'urgent')),
            ...many(latePay.recordset, r => row(`luong-tre:${r.MaKy}`, 'manager-purchase-approvals',
                vietnamCalendar().date > String(r.NgayTraDuKien).slice(0, 10)
                    ? `Lương kỳ ${r.MaKy} chi trễ sau mùng 10`
                    : `Lương kỳ ${r.MaKy} sắp đến hạn tất toán mùng 10`,
                `${r.SoChuaChi} nhân viên chưa chi · hạn ${String(r.NgayTraDuKien).slice(0, 10)}`,
                r.NgayTraDuKien, 'urgent'))
        );
    }

    if (role === 'Thủ kho') {
        const [returns, arrive, issues, feedback, low] = await Promise.all([
            q().query(`SELECT TOP 8 dt.MaDT, dt.NgayLap, dt.HinhThucXuLy, nv.TenNV
                       FROM PhieuDoiTra dt JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
                       WHERE dt.TrangThai=N'Chờ kiểm tra' ORDER BY dt.NgayLap DESC`),
            q().query(`SELECT TOP 8 gh.MaTBGH, gh.MaPO, gh.NgayDen, ncc.TenNCC
                       FROM ThongBaoGiaoHang gh JOIN DonMuaHang po ON po.MaPO=gh.MaPO
                       JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
                       WHERE gh.TrangThai=N'Đã đến kho' ORDER BY gh.NgayDen DESC`),
            q().input('MaNV', sql.VarChar, maNV).query(`
                       SELECT TOP 8 MaPX, NgayXuat, LoaiXuat FROM PhieuXuat
                       WHERE MaNV=@MaNV AND TrangThai=N'Đã duyệt' ORDER BY NgayDuyet DESC`),
            q().input('MaNV', sql.VarChar, maNV).query(`
                       SELECT TOP 8 MaDN, NgayLap, LyDo FROM DeNghiMuaHang
                       WHERE MaNV_Lap=@MaNV AND TrangThai=N'Yêu cầu bổ sung' ORDER BY NgayLap DESC`),
            q().query(`SELECT COUNT(*) SoLuong FROM SanPham sp
                       LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
                       WHERE sp.TrangThai=N'Đang bán' AND ISNULL(tk.SLTon,0)<=sp.TonKhoToiThieu`)
        ]);
        items.push(
            ...many(returns.recordset, r => row(`dt:${r.MaDT}`, 'warehouse-returns', 'Hàng khách trả chờ kiểm',
                `${r.MaDT} · ${r.HinhThucXuLy} · ${r.TenNV}`, r.NgayLap, 'urgent')),
            ...many(arrive.recordset, r => row(`gh:${r.MaTBGH}`, 'warehouse-receiving', 'Xe giao đã đến kho',
                `${r.MaPO} · ${r.TenNCC} · nhận và kiểm hàng`, r.NgayDen, 'urgent')),
            ...many(issues.recordset, r => row(`px:${r.MaPX}`, 'warehouse-stock-issues', 'Phiếu xuất đã duyệt, cần xác nhận xuất',
                `${r.MaPX} · ${r.LoaiXuat} · trừ tồn khi bạn xác nhận`, r.NgayXuat, 'urgent')),
            ...many(feedback.recordset, r => row(`dn:${r.MaDN}`, 'warehouse-requests', 'Đề nghị cần bổ sung',
                `${r.MaDN} · ${r.LyDo || 'Mua hàng yêu cầu chỉnh'}`, r.NgayLap, 'info'))
        );
        const lowCount = Number(low.recordset[0]?.SoLuong || 0);
        if (lowCount) {
            items.push(row(`low:${lowCount}`, 'warehouse-inventory', 'Cảnh báo tồn kho',
                `${lowCount} mặt hàng dưới hoặc bằng mức tối thiểu`, new Date(), 'info'));
        }
    }

    if (role === 'Nhân viên mua hàng') {
        const [requests, approved, revise] = await Promise.all([
            q().query(`SELECT TOP 8 dn.MaDN, dn.NgayGui, dn.LyDo, nv.TenNV
                       FROM DeNghiMuaHang dn JOIN NhanVien nv ON nv.MaNV=dn.MaNV_Lap
                       WHERE dn.TrangThai=N'Đã gửi' ORDER BY dn.NgayGui DESC`),
            q().input('MaNV', sql.VarChar, maNV).query(`
                       SELECT TOP 8 po.MaPO, po.NgayDuyet, ncc.TenNCC
                       FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
                       WHERE po.MaNV_Lap=@MaNV AND po.TrangThai=N'Đã duyệt' ORDER BY po.NgayDuyet DESC`),
            q().input('MaNV', sql.VarChar, maNV).query(`
                       SELECT TOP 8 po.MaPO, po.NgayLap, po.LyDoTuChoi, ncc.TenNCC
                       FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
                       WHERE po.MaNV_Lap=@MaNV AND po.TrangThai=N'Yêu cầu chỉnh sửa' ORDER BY po.NgayLap DESC`)
        ]);
        items.push(
            ...many(requests.recordset, r => row(`dn:${r.MaDN}`, 'purchasing-inbox', 'Đề nghị mua từ kho',
                `${r.MaDN} · ${r.TenNV} · ${r.LyDo || 'Cần lập đơn mua'}`, r.NgayGui, 'urgent')),
            ...many(approved.recordset, r => row(`po:${r.MaPO}`, 'purchasing-orders', 'Đơn mua đã duyệt, gửi Nhà cung cấp',
                `${r.MaPO} · ${r.TenNCC}`, r.NgayDuyet, 'urgent')),
            ...many(revise.recordset, r => row(`po-fix:${r.MaPO}`, 'purchasing-orders', 'Đơn mua cần chỉnh theo Quản lý',
                `${r.MaPO} · ${r.TenNCC} · ${r.LyDoTuChoi || ''}`, r.NgayLap, 'info'))
        );
    }

    if (role === 'Kế toán') {
        await ensurePayrollSchema(pool).catch(() => {});
        const [shifts, invoices, pay, overdue, payrollPay] = await Promise.all([
            q().query(`SELECT TOP 8 ca.MaCa, ca.ThoiGianKetThuc, nv.TenNV
                       FROM CaLamViec ca JOIN NhanVien nv ON nv.MaNV=ca.MaNV
                       WHERE ca.TrangThai=N'Đã chốt' AND ca.TrangThaiDoiSoat=N'Chờ Kế toán đối soát'
                       ORDER BY ca.ThoiGianKetThuc DESC`),
            q().query(`SELECT TOP 8 hd.MaHDMH, hd.SoHoaDon, hd.NgayTiepNhan, hd.TrangThaiDoiChieu, ncc.TenNCC
                       FROM HoaDonMuaHang hd JOIN NhaCungCap ncc ON ncc.MaNCC=hd.MaNCC
                       WHERE hd.TrangThaiDoiChieu IN (N'Chờ đối chiếu', N'Chờ Phiếu nhập', N'Chênh lệch')
                       ORDER BY hd.NgayTiepNhan DESC`),
            q().query(`SELECT TOP 8 pc.MaPhieu, pc.NgayDuyet, pc.SoTien, ncc.TenNCC
                       FROM PhieuChi pc JOIN NhaCungCap ncc ON ncc.MaNCC=pc.MaNCC
                       WHERE pc.TrangThai IN (N'Đã duyệt', N'Thanh toán thất bại')
                       ORDER BY pc.NgayDuyet DESC`),
            q().query(`SELECT COUNT(*) SoLuong FROM CongNoPhaiTra
                       WHERE SoTienConLai>0 AND HanThanhToan<CONVERT(date,GETDATE())`),
            q().query(`SELECT TOP 8 pcl.MaPhieu, pcl.NgayDuyet, pcl.SoTien, nv.TenNV, pcl.MaKy, pcl.TrangThai
                       FROM PhieuChiLuong pcl JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
                       WHERE pcl.TrangThai IN (N'Đã duyệt', N'Thanh toán thất bại')
                       ORDER BY pcl.NgayDuyet DESC`)
        ]);
        items.push(
            ...many(shifts.recordset, r => row(`ca:${r.MaCa}`, 'accounting-settlements', 'Ca đã chốt, cần lập/xác nhận Phiếu thu',
                `${r.MaCa} · ${r.TenNV}`, r.ThoiGianKetThuc, 'urgent')),
            ...many(invoices.recordset, r => row(`hdmh:${r.MaHDMH}`, 'accounting-invoices', 'Hóa đơn Nhà cung cấp cần đối chiếu',
                `${r.SoHoaDon} · ${r.TenNCC} · ${r.TrangThaiDoiChieu}`, r.NgayTiepNhan, 'urgent')),
            ...many(pay.recordset, r => row(`pc-pay:${r.MaPhieu}`, 'accounting-payables', 'Quản lý đã giao tiền, cần thanh toán NCC',
                `${r.MaPhieu} · ${r.TenNCC}`, r.NgayDuyet, 'urgent')),
            ...many(payrollPay.recordset, r => row(`pcl-pay:${r.MaPhieu}`, 'accounting-payroll',
                r.TrangThai === 'Thanh toán thất bại' ? 'Chi lương thất bại, thực hiện lại trên cùng phiếu' : 'Quản lý đã giao quỹ lương, cần chi',
                `${r.MaPhieu} · ${r.TenNV} · kỳ ${r.MaKy}`, r.NgayDuyet, 'urgent'))
        );
        const overdueCount = Number(overdue.recordset[0]?.SoLuong || 0);
        if (overdueCount) {
            items.push(row(`cn-over:${overdueCount}`, 'accounting-payables', 'Công nợ quá hạn',
                `${overdueCount} khoản còn phải trả đã quá hạn thanh toán`, new Date(), 'info'));
        }
    }

    if (role === 'Thu ngân') {
        const [ready, waiting, rejected] = await Promise.all([
            q().input('MaNV', sql.VarChar, maNV).query(`
                SELECT TOP 8 MaDT, NgayDuyet, HinhThucXuLy FROM PhieuDoiTra
                WHERE MaNV_Lap=@MaNV AND TrangThai=N'Đã duyệt' ORDER BY NgayDuyet DESC`),
            q().input('MaNV', sql.VarChar, maNV).query(`
                SELECT TOP 8 MaDT, NgayLap, TrangThai, HinhThucXuLy FROM PhieuDoiTra
                WHERE MaNV_Lap=@MaNV AND TrangThai IN (N'Chờ kiểm tra', N'Chờ duyệt')
                ORDER BY NgayLap DESC`),
            q().input('MaNV', sql.VarChar, maNV).query(`
                SELECT TOP 8 MaDT, NgayDuyet, HinhThucXuLy, GhiChu FROM PhieuDoiTra
                WHERE MaNV_Lap=@MaNV AND TrangThai=N'Từ chối' AND NgayDuyet>=DATEADD(day,-3,GETDATE())
                ORDER BY NgayDuyet DESC`)
        ]);
        items.push(
            ...many(ready.recordset, r => row(`dt-ok:${r.MaDT}`, 'cashier-returns',
                r.HinhThucXuLy === 'Đổi hàng' ? 'Quản lý đã duyệt — xác nhận đổi hàng' : 'Quản lý đã duyệt — xác nhận hoàn tiền',
                `${r.MaDT} · mở ca rồi bấm xác nhận`, r.NgayDuyet, 'urgent')),
            ...many(waiting.recordset, r => row(`dt-wait:${r.MaDT}`, 'cashier-returns',
                r.TrangThai === 'Chờ kiểm tra' ? 'Đổi trả đang chờ Thủ kho kiểm' : 'Đổi trả đang chờ Quản lý duyệt',
                `${r.MaDT} · ${r.HinhThucXuLy}`, r.NgayLap, 'wait')),
            ...many(rejected.recordset, r => row(`dt-no:${r.MaDT}`, 'cashier-returns', 'Phiếu đổi trả bị từ chối',
                `${r.MaDT} · ${r.GhiChu || r.HinhThucXuLy}`, r.NgayDuyet, 'info'))
        );
    }

    items.sort((a, b) => {
        const rank = { urgent: 0, info: 1, wait: 2 };
        const diff = (rank[a.tone] ?? 3) - (rank[b.tone] ?? 3);
        if (diff) return diff;
        return new Date(b.at || 0) - new Date(a.at || 0);
    });
    return items;
};

const list = async (req, res) => {
    try {
        const pool = await poolPromise;
        const items = await listForRole(pool, req.user);
        const stamp = items.map(item => item.id).join('|');
        res.json({
            role: roleOf(req.user),
            hint: inboxHint[roleOf(req.user)] || 'Việc liên quan đến vai trò của bạn.',
            stamp,
            count: items.length,
            urgent: items.filter(item => item.tone === 'urgent').length,
            items
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải thông báo.' });
    }
};

module.exports = { list };
