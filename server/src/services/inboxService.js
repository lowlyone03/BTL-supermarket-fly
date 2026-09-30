const { sql } = require('../config/db');
const { ensurePayrollSchema } = require('./payrollSchema');
const { vietnamCalendar } = require('./reportingPeriod');
const { listInboxForEmployee } = require('./storeProfitLoss');
const { ensureReturnHandoverSchema } = require('./returnHandover');
const { derivedInboxKey, parseInboxIdentity } = require('./notificationReadService');
const { REPORT_ENTITY, reportIdOf, isReportTarget } = require('./reportInboxRead');

const roleOf = user => String(user?.TenVaiTro || '').trim();
const roleKey = user => roleOf(user).toLocaleLowerCase('vi-VN');
const isRole = (user, name) => roleKey(user) === String(name || '').trim().toLocaleLowerCase('vi-VN');

const safeRows = async (fn, fallback = []) => {
    try {
        const result = await fn();
        return result?.recordset || fallback;
    } catch (error) {
        console.error(error);
        return fallback;
    }
};

const row = (id, target, title, detail, at, tone = 'info') => ({
    id, target, title, detail: detail || '', at: at || null, tone, open: true
});

const many = (recordset, map) => (recordset || []).map(map).filter(item => item?.id);

const moneyVi = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return `${Math.round(number).toLocaleString('vi-VN')} đ`;
};

const joinDetail = (...parts) => parts.map(part => String(part || '').trim()).filter(Boolean).join(' · ');

const pcPayTitle = row => (row.TrangThai === 'Thanh toán thất bại'
    ? `Thanh toán Phiếu chi ${row.MaPhieu} thất bại, thực hiện lại`
    : 'Quản lý đã giao tiền, cần thanh toán NCC');

const pcPayDetail = row => joinDetail(
    row.MaPhieu,
    row.TenNCC,
    moneyVi(row.SoTien),
    row.NguoiDuyet ? `${row.NguoiDuyet} đã duyệt` : ''
);

const pcRejectTitle = row => `Quản lý từ chối Phiếu chi ${row.MaPhieu}`;

const pcRejectDetail = row => joinDetail(
    row.TenNCC,
    moneyVi(row.SoTien),
    row.NguoiDuyet,
    row.LyDoTuChoi
);

const pclRejectTitle = row => `Quản lý từ chối Phiếu chi lương ${row.MaPhieu}`;

const pclRejectDetail = row => joinDetail(
    row.TenNV,
    `kỳ ${row.MaKy}`,
    moneyVi(row.SoTien),
    row.NguoiDuyet,
    row.LyDoTuChoi
);

const PENDING_CHAM_CONG_PREDICATE = `cc.TrangThai = N'Chờ duyệt'`;

const vnDay = value => {
    const iso = value instanceof Date && Number.isFinite(value.getTime())
        ? value.toISOString().slice(0, 10)
        : String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
};

const listPendingAttendance = async (pool, { top = 8 } = {}) => {
    const limit = Math.min(Math.max(Number.parseInt(top, 10) || 8, 1), 200);
    const result = await pool.request().query(`
        SELECT TOP (${limit}) cc.MaChamCong, l.NgayLam, nv.TenNV, lc.TenCa
        FROM ChamCong cc
        JOIN LichLamViec l ON l.MaLich = cc.MaLich
        JOIN NhanVien nv ON nv.MaNV = l.MaNV
        JOIN LoaiCa lc ON lc.MaLoaiCa = l.MaLoaiCa
        WHERE ${PENDING_CHAM_CONG_PREDICATE}
        ORDER BY cc.ThoiGianRa DESC`);
    return result.recordset || [];
};

const SKIP_PERSISTED_EVENTS = new Set(['qr.result']);

const noticeTone = (mucDo, title) => {
    const blob = `${mucDo || ''} ${title || ''}`;
    return /cảnh báo|khẩn|lỗ/i.test(blob) ? 'urgent' : 'info';
};

const entityDedupeKey = item => {
    if (item?.entityType && item?.entityId) return `${item.entityType}:${item.entityId}`;
    const parsed = parseInboxIdentity(item?.id);
    return parsed.entityType ? `${parsed.entityType}:${parsed.entityId}` : '';
};

const mergeInboxItems = (primary, secondary) => {
    const seenIds = new Set();
    const seenEntities = new Set();
    const out = [];
    for (const item of [...(primary || []), ...(secondary || [])]) {
        if (!item?.id) continue;
        const id = String(item.id);
        if (seenIds.has(id)) continue;
        const entity = entityDedupeKey(item);
        if (entity && seenEntities.has(entity)) continue;
        seenIds.add(id);
        if (entity) seenEntities.add(entity);
        out.push(item);
    }
    return out;
};

const CLOSE_ON_UPDATE_TARGETS = Object.freeze([
    'manager-purchase-approvals', 'manager-workforce-approve', 'manager-payables',
    'admin-warehouse-reports', 'admin-department-reports'
]);

let departmentSchemaReady = null;
const ensureDepartmentReportTable = pool => {
    if (!departmentSchemaReady) {
        departmentSchemaReady = require('./departmentReportSubmit').ensureDepartmentReportSchema(pool)
            .catch(error => {
                departmentSchemaReady = null;
                throw error;
            });
    }
    return departmentSchemaReady;
};

const idsJson = ids => JSON.stringify([...new Set(ids.map(value => String(value || '').trim()).filter(Boolean))]);

const loadClosedRecipients = async (pool, maNV, candidates) => {
    if (!candidates.length) return new Set();
    try {
        await ensureDepartmentReportTable(pool);
        const result = await pool.request()
            .input('MaNV', sql.VarChar, maNV)
            .input('Ids', sql.NVarChar, idsJson(candidates))
            .query(`
            SELECT n.MaNhan
            FROM dbo.ThongBaoNguoiNhan n
            JOIN dbo.ThongBaoSuKien e ON e.MaSuKien=n.MaSuKien
            WHERE n.MaNV=@MaNV AND n.DaDoc=0
              AND CONVERT(varchar(30), n.MaNhan) IN (SELECT [value] FROM OPENJSON(@Ids))
              AND (
                EXISTS (SELECT 1 FROM dbo.ThongBaoSuKien later
                        WHERE later.EntityType=e.EntityType AND later.EntityId=e.EntityId
                          AND later.MaSuKien>e.MaSuKien)
                OR (e.EntityType='DonMuaHang' AND NOT EXISTS (
                    SELECT 1 FROM DonMuaHang x WHERE x.MaPO=e.EntityId AND x.TrangThai=N'Chờ duyệt'))
                OR (e.EntityType='PhieuXuat' AND NOT EXISTS (
                    SELECT 1 FROM PhieuXuat x WHERE x.MaPX=e.EntityId AND x.TrangThai=N'Chờ duyệt'))
                OR (e.EntityType='KiemKe' AND NOT EXISTS (
                    SELECT 1 FROM KiemKe x WHERE x.MaKK=e.EntityId AND x.TrangThai=N'Chờ duyệt điều chỉnh'))
                OR (e.EntityType='PhieuDoiTra' AND NOT EXISTS (
                    SELECT 1 FROM PhieuDoiTra x WHERE x.MaDT=e.EntityId AND x.TrangThai IN (N'Chờ duyệt', N'Chờ xử lý hoàn tiền')))
                OR (e.EntityType='PhieuChi' AND NOT EXISTS (
                    SELECT 1 FROM PhieuChi x WHERE x.MaPhieu=e.EntityId AND x.TrangThai=N'Chờ duyệt'))
                OR (e.EntityType='PhieuChiLuong' AND NOT EXISTS (
                    SELECT 1 FROM PhieuChiLuong x WHERE x.MaPhieu=e.EntityId AND x.TrangThai=N'Chờ duyệt'))
                OR (e.EntityType='ChamCong' AND NOT EXISTS (
                    SELECT 1 FROM ChamCong x WHERE CONVERT(varchar(30), x.MaChamCong)=e.EntityId AND x.TrangThai=N'Chờ duyệt'))
                OR (e.EntityType='BaoCaoNop' AND EXISTS (
                    SELECT 1 FROM BaoCaoBoPhanNop x WHERE x.MaBC=e.EntityId AND x.TrangThai<>N'Đã gửi'))
              )`);
        return new Set((result.recordset || []).map(row => String(row.MaNhan)));
    } catch (error) {
        console.error(error);
        return new Set();
    }
};

const loadProcessedReports = async (pool, reportIds) => {
    if (!reportIds.length) return new Set();
    try {
        await ensureDepartmentReportTable(pool);
        const result = await pool.request()
            .input('Ids', sql.NVarChar, idsJson(reportIds))
            .query(`
            SELECT MaBC FROM BaoCaoBoPhanNop
            WHERE TrangThai<>N'Đã gửi'
              AND MaBC IN (SELECT [value] FROM OPENJSON(@Ids))`);
        return new Set((result.recordset || []).map(row => String(row.MaBC)));
    } catch (error) {
        console.error(error);
        return new Set();
    }
};

const listPersistedWorkflowItems = async (pool, user) => {
    const maNV = user?.MaNV;
    if (!maNV) return [];
    try {
        await require('./notifySchema').ensureNotifySchema(pool);
        const result = await pool.request().input('MaNV', sql.VarChar, maNV).query(`
            SELECT TOP 50 n.MaNhan, n.DaDoc, e.EventKey, e.EntityType, e.EntityId,
                   e.Title, e.Detail, e.Tone, e.Target, e.NgayTao EventAt
            FROM dbo.ThongBaoNguoiNhan n
            JOIN dbo.ThongBaoSuKien e ON e.MaSuKien=n.MaSuKien
            WHERE n.MaNV=@MaNV AND n.DaAn=0
            ORDER BY e.NgayTao DESC`);
        const rows = (result.recordset || [])
            .filter(row => !SKIP_PERSISTED_EVENTS.has(String(row.EventKey || '')));
        const closed = await loadClosedRecipients(pool, maNV, rows
            .filter(row => !row.DaDoc && CLOSE_ON_UPDATE_TARGETS.includes(String(row.Target || '')))
            .map(row => row.MaNhan));
        return rows.map(row => {
            const derived = derivedInboxKey(row.EntityType, row.EntityId);
            return {
                id: derived || `nhan:${row.MaNhan}`,
                target: row.Target || '',
                title: row.Title,
                detail: row.Detail || '',
                at: row.EventAt,
                tone: row.Tone === 'warning' || row.Tone === 'urgent' ? 'urgent' : 'info',
                read: Boolean(row.DaDoc) || closed.has(String(row.MaNhan)),
                open: false,
                maNhan: row.MaNhan,
                entityType: row.EntityType,
                entityId: row.EntityId
            };
        });
    } catch (error) {
        console.error(error);
        return [];
    }
};

const inboxHint = {
    'Quản lý': 'Việc nhân viên vừa gửi hiện ngay. Chấm công chờ duyệt: mở menu Duyệt công (cả ngày cũ và ca hành chính). Chuông kêu một tiếng khi có việc mới — không cần F5.',
    'Thủ kho': 'Chuyến giao chờ nhận, đổi trả, phiếu xuất đã duyệt hoặc kiểm kê bị từ chối cần đếm lại hiện ngay. Chuông kêu một tiếng khi có việc mới.',
    'Nhân viên mua hàng': 'Đề nghị từ kho, đơn mua đã duyệt, chuyến đã gửi Thủ kho, và việc kế toán nhờ xin gia hạn NCC hiện ngay. Chuông kêu một tiếng khi có việc mới.',
    'Kế toán': 'Ca đã chốt, phiếu nhập cần đối chiếu, hóa đơn chờ khớp, phiếu chi Quản lý vừa duyệt hoặc từ chối, và phiếu sẵn sàng thanh toán hiện ngay. Chuông kêu một tiếng khi có việc mới.',
    'Thu ngân': 'Lịch hôm nay, đổi trả chờ kho/quản lý, và phiếu đã duyệt cần xác nhận — hiện ngay khi có việc mới.'
};

const listForRole = async (pool, user) => {
    const role = roleOf(user);
    const maNV = user.MaNV;
    const items = [];
    const q = () => pool.request();

    try {
        const notices = await listInboxForEmployee(pool, maNV);
        items.push(...many(notices, r => {
            if (/kiểm kê/i.test(r.TieuDe || '') && /từ chối|đếm lại/i.test(r.TieuDe || '')) return null;
            const notice = {
                ...row(
                    `pnl:${r.MaTB}`,
                    r.DichDen || (isRole(user, 'Quản lý') ? 'manager-reports' : ''),
                    r.TieuDe,
                    r.NoiDung,
                    r.NgayGui,
                    noticeTone(r.MucDo, r.TieuDe)
                ),
                open: false
            };
            const maBC = isReportTarget(r.DichDen) ? reportIdOf(r.TieuDe, r.NoiDung) : '';
            return maBC ? { ...notice, entityType: REPORT_ENTITY, entityId: maBC } : notice;
        }));
    } catch { /* bảng thông báo chưa có thì bỏ qua */ }

    try {
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
    } catch (error) {
        console.error(error);
    }

    if (isRole(user, 'Quản lý')) {
      try {
        const poolSafe = pool;
        await ensurePayrollSchema(poolSafe).catch(() => {});
        const [po, px, kk, dt, dtWait, pc, cc, pcl, latePay] = await Promise.all([
            safeRows(() => q().query(`SELECT TOP 8 po.MaPO, po.NgayLap, ncc.TenNCC, nv.TenNV
                       FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
                       JOIN NhanVien nv ON nv.MaNV=po.MaNV_Lap
                       WHERE po.TrangThai=N'Chờ duyệt' ORDER BY po.NgayLap DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 px.MaPX, px.NgayXuat, px.LoaiXuat, nv.TenNV
                       FROM PhieuXuat px JOIN NhanVien nv ON nv.MaNV=px.MaNV
                       WHERE px.TrangThai=N'Chờ duyệt' ORDER BY px.NgayXuat DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 kk.MaKK, kk.NgayKiemKe, nv.TenNV
                       FROM KiemKe kk JOIN NhanVien nv ON nv.MaNV=kk.MaNV
                       WHERE kk.TrangThai=N'Chờ duyệt điều chỉnh' ORDER BY kk.NgayKiemKe DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 dt.MaDT, dt.NgayLap, dt.HinhThucXuLy, nv.TenNV
                       FROM PhieuDoiTra dt JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
                       WHERE dt.TrangThai=N'Chờ duyệt' ORDER BY dt.NgayLap DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 dt.MaDT, dt.NgayLap, dt.HinhThucXuLy, dt.SoTienHoan, nv.TenNV
                       FROM PhieuDoiTra dt JOIN NhanVien nv ON nv.MaNV=COALESCE(dt.MaNV_XuLy, dt.MaNV_Lap)
                       WHERE dt.TrangThai=N'Chờ xử lý hoàn tiền' ORDER BY dt.NgayLap DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 pc.MaPhieu, pc.NgayChungTu, pc.SoTien, nv.TenNV
                       FROM PhieuChi pc JOIN NhanVien nv ON nv.MaNV=pc.MaNV
                       WHERE pc.TrangThai=N'Chờ duyệt' ORDER BY pc.NgayChungTu DESC`)),
            safeRows(() => listPendingAttendance(poolSafe, { top: 8 })),
            safeRows(() => q().query(`SELECT TOP 8 pcl.MaPhieu, pcl.NgayLap, pcl.SoTien, nv.TenNV, pcl.MaKy, pcl.PhuongThuc
                       FROM PhieuChiLuong pcl JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
                       WHERE pcl.TrangThai=N'Chờ duyệt' ORDER BY pcl.NgayLap DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 k.MaKy, CONVERT(varchar(10),k.NgayTraDuKien,23) NgayTraDuKien,
                              SUM(CASE WHEN bl.TrangThai<>N'Đã thanh toán' THEN 1 ELSE 0 END) SoChuaChi
                       FROM KyLuong k JOIN BangLuong bl ON bl.MaKy=k.MaKy
                       WHERE k.TrangThai IN (N'Đã khóa', N'Đã thanh toán')
                         AND k.NgayTraDuKien IS NOT NULL
                         AND CONVERT(date, GETDATE()) >= DATEADD(day,-2,k.NgayTraDuKien)
                         AND EXISTS (SELECT 1 FROM BangLuong b WHERE b.MaKy=k.MaKy AND b.TrangThai<>N'Đã thanh toán')
                       GROUP BY k.MaKy, k.NgayTraDuKien`))
        ]);
        items.push(
            ...many(po, r => row(`po:${r.MaPO}`, 'manager-purchase-approvals', 'Đơn mua chờ duyệt',
                `${r.MaPO} · ${r.TenNCC} · ${r.TenNV}`, r.NgayLap, 'urgent')),
            ...many(px, r => row(`px:${r.MaPX}`, 'manager-purchase-approvals', 'Phiếu xuất chờ duyệt',
                `${r.MaPX} · ${r.LoaiXuat} · ${r.TenNV}`, r.NgayXuat, 'urgent')),
            ...many(kk, r => row(`kk:${r.MaKK}`, 'manager-purchase-approvals', 'Kiểm kê chờ duyệt điều chỉnh',
                `${r.MaKK} · ${r.TenNV}`, r.NgayKiemKe, 'urgent')),
            ...many(dt, r => row(`dt:${r.MaDT}`, 'manager-purchase-approvals', 'Đổi trả chờ duyệt',
                `${r.MaDT} · ${r.HinhThucXuLy} · ${r.TenNV}`, r.NgayLap, 'urgent')),
            ...many(dtWait, r => row(`dt-cash:${r.MaDT}`, 'cashier-returns',
                'Chờ xử lý hoàn tiền — két không đủ TM, không ghi két âm',
                `${r.MaDT} · ${r.HinhThucXuLy} · ${r.TenNV}`, r.NgayLap, 'urgent')),
            ...many(pc, r => row(`pc:${r.MaPhieu}`, 'manager-payables', 'Phiếu chi chờ duyệt và giao tiền',
                `${r.MaPhieu} · ${r.TenNV}`, r.NgayChungTu, 'urgent')),
            ...many(cc, r => row(`cc:${r.MaChamCong}`, 'manager-workforce-approve', 'Chấm công chờ duyệt',
                [r.TenNV, r.TenCa, vnDay(r.NgayLam)].filter(Boolean).join(' · '), r.NgayLam, 'urgent')),
            ...many(pcl, r => row(`pcl:${r.MaPhieu}`, 'manager-purchase-approvals', 'Phiếu chi lương chờ duyệt và giao quỹ',
                `${r.MaPhieu} · ${r.TenNV} · ${r.PhuongThuc} · kỳ ${r.MaKy}`, r.NgayLap, 'urgent')),
            ...many(latePay, r => row(`luong-tre:${r.MaKy}`, 'manager-purchase-approvals',
                vietnamCalendar().date > String(r.NgayTraDuKien).slice(0, 10)
                    ? `Lương kỳ ${r.MaKy} chi trễ sau mùng 10`
                    : `Lương kỳ ${r.MaKy} sắp đến hạn tất toán mùng 10`,
                `${r.SoChuaChi} nhân viên chưa chi · hạn ${String(r.NgayTraDuKien).slice(0, 10)}`,
                r.NgayTraDuKien, 'urgent'))
        );
      } catch (error) {
        console.error(error);
      }
    }

    if (isRole(user, 'Thủ kho')) {
        const [returns, arrive, issues, feedback, recount, drifted, low] = await Promise.all([
            safeRows(() => q().query(`SELECT TOP 8 dt.MaDT, dt.NgayLap, dt.HinhThucXuLy, nv.TenNV
                       FROM PhieuDoiTra dt JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
                       WHERE dt.TrangThai=N'Chờ kiểm tra' ORDER BY dt.NgayLap DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 gh.MaTBGH, gh.MaPO, gh.TrangThai, gh.NgayTao, gh.NgayDen, ncc.TenNCC
                       FROM ThongBaoGiaoHang gh JOIN DonMuaHang po ON po.MaPO=gh.MaPO
                       JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
                       WHERE gh.TrangThai IN (N'Đang giao', N'Đã đến kho')
                       ORDER BY CASE WHEN gh.TrangThai=N'Đã đến kho' THEN 0 ELSE 1 END,
                                COALESCE(gh.NgayDen, gh.NgayTao) DESC`)),
            safeRows(() => q().input('MaNV', sql.VarChar, maNV).query(`
                       SELECT TOP 8 MaPX, NgayXuat, LoaiXuat FROM PhieuXuat
                       WHERE MaNV=@MaNV AND TrangThai=N'Đã duyệt' ORDER BY NgayDuyet DESC`)),
            safeRows(() => q().input('MaNV', sql.VarChar, maNV).query(`
                       SELECT TOP 8 MaDN, NgayLap, LyDo FROM DeNghiMuaHang
                       WHERE MaNV_Lap=@MaNV AND TrangThai=N'Yêu cầu bổ sung' ORDER BY NgayLap DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 kk.MaKK, COALESCE(kk.NgayDuyet, kk.NgayKiemKe) NgayDuyet,
                              kk.LyDoTuChoi, nv.TenNV
                       FROM KiemKe kk
                       LEFT JOIN NhanVien nv ON nv.MaNV=kk.MaNV_Duyet
                       WHERE kk.TrangThai=N'Từ chối'
                         AND COALESCE(kk.NgayDuyet, kk.NgayKiemKe)>=DATEADD(day,-14,GETDATE())
                         AND NOT EXISTS (
                            SELECT 1 FROM KiemKe later
                            WHERE later.MaKho=kk.MaKho
                              AND later.MaKK<>kk.MaKK
                              AND later.NgayKiemKe>COALESCE(kk.NgayDuyet, kk.NgayKiemKe)
                              AND later.TrangThai IN (N'Đang kiểm', N'Chờ duyệt điều chỉnh', N'Đã duyệt', N'Hoàn thành không chênh lệch', N'Đã đếm lại')
                              AND (later.GhiChu IS NULL OR later.GhiChu NOT LIKE N'%trước khi lập đề nghị%')
                         )
                       ORDER BY COALESCE(kk.NgayDuyet, kk.NgayKiemKe) DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 kk.MaKK, kk.NgayKiemKe
                       FROM KiemKe kk
                       WHERE kk.TrangThai=N'Chờ duyệt điều chỉnh'
                         AND EXISTS (
                            SELECT 1 FROM ChiTietKiemKe ct
                            LEFT JOIN TonKho tk ON tk.MaKho=kk.MaKho AND tk.MaSP=ct.MaSP
                            WHERE ct.MaKK=kk.MaKK AND ct.ChenhLech<>0
                              AND ISNULL(tk.SLTon,0)<>ct.SLHeThong
                         )
                       ORDER BY kk.NgayKiemKe DESC`)),
            safeRows(() => q().query(`SELECT COUNT(*) SoLuong FROM SanPham sp
                       LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
                       WHERE sp.TrangThai=N'Đang bán' AND ISNULL(tk.SLTon,0)<=sp.TonKhoToiThieu`))
        ]);
        items.push(
            ...many(returns, r => row(`dt:${r.MaDT}`, 'warehouse-returns', 'Hàng khách trả chờ kiểm',
                `${r.MaDT} · ${r.HinhThucXuLy} · ${r.TenNV}`, r.NgayLap, 'urgent')),
            ...many(arrive, r => row(`gh:${r.MaTBGH}`, 'warehouse-receiving',
                r.TrangThai === 'Đang giao' ? 'Chuyến giao chờ nhận' : 'Xe giao đã đến kho',
                `${r.MaTBGH} · ${r.MaPO} · ${r.TenNCC} · ${r.TrangThai === 'Đang giao' ? 'ghi nhận xe đến' : 'nhận và kiểm hàng'}`,
                r.NgayDen || r.NgayTao, 'urgent')),
            ...many(issues, r => row(`px:${r.MaPX}`, 'warehouse-stock-issues', 'Phiếu xuất đã duyệt, cần xác nhận xuất',
                `${r.MaPX} · ${r.LoaiXuat} · trừ tồn khi bạn xác nhận`, r.NgayXuat, 'urgent')),
            ...many(feedback, r => row(`dn:${r.MaDN}`, 'warehouse-requests', 'Đề nghị cần bổ sung',
                `${r.MaDN} · ${r.LyDo || 'Mua hàng yêu cầu chỉnh'}`, r.NgayLap, 'info')),
            ...many(recount, r => row(`kk-reject:${r.MaKK}`, 'warehouse-inventory-counts',
                `Kiểm kê ${r.MaKK} bị từ chối — đếm lại vì nhập hàng`,
                `${r.LyDoTuChoi || `Quản lý ${r.TenNV || ''} từ chối vì tồn đã đổi (thường do nhập hàng)`}`.trim(),
                r.NgayDuyet, 'urgent')),
            ...many(drifted, r => row(`kk-drift:${r.MaKK}`, 'warehouse-inventory-counts',
                `Tồn đã đổi sau kiểm kê ${r.MaKK} — chờ QL từ chối / đếm lại`,
                'Tồn hiện tại khác số lúc đếm (thường do nhập hàng). Quản lý từ chối thì tạo đợt mới.',
                r.NgayKiemKe, 'urgent'))
        );
        const lowCount = Number(low[0]?.SoLuong || 0);
        if (lowCount) {
            items.push(row(`low:${lowCount}`, 'warehouse-inventory', 'Cảnh báo tồn kho',
                `${lowCount} mặt hàng dưới hoặc bằng mức tối thiểu`, new Date(), 'info'));
        }
    }

    if (isRole(user, 'Nhân viên mua hàng')) {
        const [requests, approved, revise, sent] = await Promise.all([
            safeRows(() => q().query(`SELECT TOP 8 dn.MaDN, dn.NgayGui, dn.LyDo, nv.TenNV
                       FROM DeNghiMuaHang dn JOIN NhanVien nv ON nv.MaNV=dn.MaNV_Lap
                       WHERE dn.TrangThai=N'Đã gửi' ORDER BY dn.NgayGui DESC`)),
            safeRows(() => q().input('MaNV', sql.VarChar, maNV).query(`
                       SELECT TOP 8 po.MaPO, po.NgayDuyet, ncc.TenNCC
                       FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
                       WHERE po.MaNV_Lap=@MaNV AND po.TrangThai=N'Đã duyệt' ORDER BY po.NgayDuyet DESC`)),
            safeRows(() => q().input('MaNV', sql.VarChar, maNV).query(`
                       SELECT TOP 8 po.MaPO, po.NgayLap, po.LyDoTuChoi, ncc.TenNCC
                       FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
                       WHERE po.MaNV_Lap=@MaNV AND po.TrangThai=N'Yêu cầu chỉnh sửa' ORDER BY po.NgayLap DESC`)),
            safeRows(() => q().input('MaNV', sql.VarChar, maNV).query(`
                       SELECT TOP 8 gh.MaTBGH, gh.MaPO, gh.TrangThai, gh.NgayTao, ncc.TenNCC
                       FROM ThongBaoGiaoHang gh
                       JOIN DonMuaHang po ON po.MaPO=gh.MaPO
                       JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
                       WHERE po.MaNV_Lap=@MaNV AND gh.TrangThai IN (N'Đang giao', N'Đã đến kho')
                       ORDER BY gh.NgayTao DESC`))
        ]);
        items.push(
            ...many(requests, r => row(`dn:${r.MaDN}`, 'purchasing-inbox', 'Đề nghị mua từ kho',
                `${r.MaDN} · ${r.TenNV} · ${r.LyDo || 'Cần lập đơn mua'}`, r.NgayGui, 'urgent')),
            ...many(approved, r => row(`po:${r.MaPO}`, 'purchasing-orders', 'Đơn mua đã duyệt, gửi Nhà cung cấp',
                `${r.MaPO} · ${r.TenNCC}`, r.NgayDuyet, 'urgent')),
            ...many(revise, r => row(`po-fix:${r.MaPO}`, 'purchasing-orders', 'Đơn mua cần chỉnh theo Quản lý',
                `${r.MaPO} · ${r.TenNCC} · ${r.LyDoTuChoi || ''}`, r.NgayLap, 'info')),
            ...many(sent, r => row(`gh:${r.MaTBGH}`, 'purchasing-orders',
                r.TrangThai === 'Đang giao' ? `Đã gửi chuyến ${r.MaTBGH} cho Thủ kho` : `Thủ kho đang nhận chuyến ${r.MaTBGH}`,
                `${r.MaPO} · ${r.TenNCC} · ${r.TrangThai}`, r.NgayTao, 'info'))
        );
        const giaHan = await safeRows(() => q().query(`
            SELECT TOP 8 g.MaGiaHan, g.MaCNPTra, g.NgayYeuCau, g.HanCu, ncc.TenNCC, cn.SoTienConLai, nv.TenNV
            FROM CongNoGiaHan g
            JOIN CongNoPhaiTra cn ON cn.MaCNPTra = g.MaCNPTra
            JOIN NhaCungCap ncc ON ncc.MaNCC = g.MaNCC
            LEFT JOIN NhanVien nv ON nv.MaNV = g.MaNV_YeuCau
            WHERE g.TrangThai IN (N'ChoLienHe', N'DaLienHe') AND cn.SoTienConLai > 0
            ORDER BY g.NgayYeuCau DESC`));
        items.push(...many(giaHan, r => row(`giahan:${r.MaGiaHan}`, 'purchasing-suppliers', 'Kế toán nhờ xin gia hạn NCC',
            joinDetail(r.TenNCC, r.MaCNPTra, moneyVi(r.SoTienConLai), r.HanCu ? `hạn cũ ${vnDay(r.HanCu)}` : '', r.TenNV),
            r.NgayYeuCau, 'urgent')));
    }

    if (isRole(user, 'Kế toán')) {
        await ensurePayrollSchema(pool).catch(() => {});
        const [shifts, invoices, receipts, pay, payReject, overdue, payrollPay, payrollReject] = await Promise.all([
            safeRows(() => q().query(`SELECT TOP 8 ca.MaCa, ca.ThoiGianKetThuc, nv.TenNV
                       FROM CaLamViec ca JOIN NhanVien nv ON nv.MaNV=ca.MaNV
                       WHERE ca.TrangThai=N'Đã chốt' AND ca.TrangThaiDoiSoat=N'Chờ Kế toán đối soát'
                       ORDER BY ca.ThoiGianKetThuc DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 hd.MaHDMH, hd.SoHoaDon, hd.NgayTiepNhan, hd.TrangThaiDoiChieu, ncc.TenNCC
                       FROM HoaDonMuaHang hd JOIN NhaCungCap ncc ON ncc.MaNCC=hd.MaNCC
                       WHERE hd.TrangThaiDoiChieu IN (N'Chờ đối chiếu', N'Chờ Phiếu nhập', N'Chênh lệch')
                       ORDER BY hd.NgayTiepNhan DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 pn.MaPN, pn.MaPO, pn.NgayXacNhan, ncc.TenNCC
                       FROM PhieuNhap pn JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC
                       WHERE pn.TrangThai=N'Đã xác nhận'
                         AND NOT EXISTS (SELECT 1 FROM HoaDonMuaHang hd WHERE hd.MaPN=pn.MaPN)
                       ORDER BY pn.NgayXacNhan DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 pc.MaPhieu, pc.NgayDuyet, pc.SoTien, pc.TrangThai, ncc.TenNCC,
                              nvDuyet.TenNV NguoiDuyet
                       FROM PhieuChi pc
                       LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=pc.MaNCC
                       LEFT JOIN NhanVien nvDuyet ON nvDuyet.MaNV=pc.MaNV_Duyet
                       WHERE pc.TrangThai IN (N'Đã duyệt', N'Thanh toán thất bại')
                       ORDER BY pc.NgayDuyet DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 pc.MaPhieu, pc.NgayDuyet, pc.SoTien, pc.LyDoTuChoi, ncc.TenNCC,
                              nvDuyet.TenNV NguoiDuyet
                       FROM PhieuChi pc
                       LEFT JOIN NhaCungCap ncc ON ncc.MaNCC=pc.MaNCC
                       LEFT JOIN NhanVien nvDuyet ON nvDuyet.MaNV=pc.MaNV_Duyet
                       WHERE pc.TrangThai=N'Từ chối'
                         AND COALESCE(pc.NgayDuyet, pc.NgayChungTu)>=DATEADD(day,-14,GETDATE())
                       ORDER BY COALESCE(pc.NgayDuyet, pc.NgayChungTu) DESC`)),
            safeRows(() => q().query(`SELECT COUNT(*) SoLuong FROM CongNoPhaiTra
                       WHERE SoTienConLai>0 AND HanThanhToan<CONVERT(date,GETDATE())`)),
            safeRows(() => q().query(`SELECT TOP 8 pcl.MaPhieu, pcl.NgayDuyet, pcl.SoTien, nv.TenNV, pcl.MaKy, pcl.TrangThai, pcl.PhuongThuc,
                              q.SoTienMatCon, q.SoTienCKCon, q.SoTienCKGiao, nvDuyet.TenNV NguoiDuyet
                       FROM PhieuChiLuong pcl
                       JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
                       LEFT JOIN NhanVien nvDuyet ON nvDuyet.MaNV=pcl.MaNV_Duyet
                       LEFT JOIN QuyLuongKy q ON q.MaKy=pcl.MaKy
                       WHERE pcl.TrangThai IN (N'Đã duyệt', N'Thanh toán thất bại')
                       ORDER BY pcl.NgayDuyet DESC`)),
            safeRows(() => q().query(`SELECT TOP 8 pcl.MaPhieu, pcl.NgayDuyet, pcl.SoTien, nv.TenNV, pcl.MaKy, pcl.LyDoTuChoi,
                              nvDuyet.TenNV NguoiDuyet
                       FROM PhieuChiLuong pcl
                       JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
                       LEFT JOIN NhanVien nvDuyet ON nvDuyet.MaNV=pcl.MaNV_Duyet
                       WHERE pcl.TrangThai=N'Từ chối'
                         AND COALESCE(pcl.NgayDuyet, pcl.NgayLap)>=DATEADD(day,-14,GETDATE())
                       ORDER BY COALESCE(pcl.NgayDuyet, pcl.NgayLap) DESC`))
        ]);
        items.push(
            ...many(shifts, r => row(`ca:${r.MaCa}`, 'accounting-settlements', 'Ca đã chốt, cần lập/xác nhận Phiếu thu',
                `${r.MaCa} · ${r.TenNV}`, r.ThoiGianKetThuc, 'urgent')),
            ...many(invoices, r => row(`hdmh:${r.MaHDMH}`, 'accounting-invoices', 'Hóa đơn Nhà cung cấp cần đối chiếu',
                `${r.SoHoaDon} · ${r.TenNCC} · ${r.TrangThaiDoiChieu}`, r.NgayTiepNhan, 'urgent')),
            ...many(receipts, r => row(`pn:${r.MaPN}`, 'accounting-invoices', 'Phiếu nhập đã xác nhận, cần lập hóa đơn',
                `${r.MaPN} · ${r.MaPO} · ${r.TenNCC}`, r.NgayXacNhan, 'urgent')),
            ...many(pay, r => row(`pc-pay:${r.MaPhieu}`, 'accounting-payables', pcPayTitle(r),
                pcPayDetail(r), r.NgayDuyet, 'urgent')),
            ...many(payReject, r => row(`pc-no:${r.MaPhieu}`, 'accounting-payables', pcRejectTitle(r),
                pcRejectDetail(r), r.NgayDuyet, 'urgent')),
            ...many(payrollPay, r => {
                const ready = r.PhuongThuc === 'Tiền mặt'
                    ? Number(r.SoTienMatCon || 0) >= Number(r.SoTien || 0)
                    : Number(r.SoTienCKCon || 0) >= Number(r.SoTien || 0);
                const title = r.TrangThai === 'Thanh toán thất bại'
                    ? 'Chi lương thất bại, thực hiện lại trên cùng phiếu'
                    : ready
                        ? 'Quản lý đã giao quỹ chung, cần chi lương'
                        : 'Phiếu lương đã duyệt, chờ Quản lý giao quỹ chung';
                return row(`pcl-pay:${r.MaPhieu}`, 'accounting-payroll', title,
                    joinDetail(r.MaPhieu, r.TenNV, `kỳ ${r.MaKy}`, moneyVi(r.SoTien), r.NguoiDuyet),
                    r.NgayDuyet, 'urgent');
            }),
            ...many(payrollReject, r => row(`pcl-no:${r.MaPhieu}`, 'accounting-payroll', pclRejectTitle(r),
                pclRejectDetail(r), r.NgayDuyet, 'urgent'))
        );
        const overdueCount = Number(overdue[0]?.SoLuong || 0);
        if (overdueCount) {
            items.push(row(`cn-over:${overdueCount}`, 'accounting-payables', 'Công nợ quá hạn',
                `${overdueCount} khoản còn phải trả đã quá hạn thanh toán`, new Date(), 'info'));
        }
    }

    if (isRole(user, 'Thu ngân')) {
        await ensureReturnHandoverSchema(pool).catch(() => {});
        const [ready, leftover, waiting, rejected, refunding] = await Promise.all([
            safeRows(() => q().input('MaNV', sql.VarChar, maNV).query(`
                SELECT TOP 8 MaDT, NgayDuyet, HinhThucXuLy FROM PhieuDoiTra
                WHERE TrangThai=N'Đã duyệt'
                  AND (MaNV_XuLy=@MaNV OR (ISNULL(MaNV_XuLy, MaNV_Lap)=@MaNV AND NgayBanGiao IS NULL))
                ORDER BY NgayDuyet DESC`)),
            safeRows(() => q().input('MaNV', sql.VarChar, maNV).query(`
                SELECT TOP 8 dt.MaDT, dt.NgayBanGiao, dt.HinhThucXuLy
                FROM PhieuDoiTra dt
                WHERE dt.TrangThai NOT IN (N'Hoàn thành', N'Từ chối', N'Đã hủy')
                  AND dt.NgayHoan IS NULL
                  AND dt.NgayBanGiao IS NOT NULL
                  AND dt.MaNV_XuLy IS NULL
                  AND EXISTS (
                        SELECT 1 FROM CaLamViec ca
                        WHERE ca.MaNV=@MaNV AND ca.TrangThai=N'Đang mở' AND ca.ThoiGianKetThuc IS NULL
                          AND (dt.MaQuayXuLy IS NULL OR ca.MaQuay=dt.MaQuayXuLy)
                  )
                ORDER BY dt.NgayBanGiao DESC`)),
            safeRows(() => q().input('MaNV', sql.VarChar, maNV).query(`
                SELECT TOP 8 MaDT, NgayLap, TrangThai, HinhThucXuLy FROM PhieuDoiTra
                WHERE (MaNV_Lap=@MaNV OR MaNV_XuLy=@MaNV) AND TrangThai IN (N'Chờ kiểm tra', N'Chờ duyệt')
                ORDER BY NgayLap DESC`)),
            safeRows(() => q().input('MaNV', sql.VarChar, maNV).query(`
                SELECT TOP 8 MaDT, NgayDuyet, HinhThucXuLy, GhiChu FROM PhieuDoiTra
                WHERE MaNV_Lap=@MaNV AND TrangThai=N'Từ chối' AND NgayDuyet>=DATEADD(day,-3,GETDATE())
                ORDER BY NgayDuyet DESC`)),
            safeRows(() => q().input('MaNV', sql.VarChar, maNV).query(`
                SELECT TOP 8 MaDT, NgayDuyet, HinhThucXuLy, TrangThai, MaGiaoDichHoan FROM PhieuDoiTra
                WHERE TrangThai IN (N'Đang hoàn tiền', N'Hoàn tiền thất bại', N'Chờ xử lý hoàn tiền')
                  AND (MaNV_XuLy=@MaNV OR ISNULL(MaNV_XuLy, MaNV_Lap)=@MaNV)
                ORDER BY NgayDuyet DESC`))
        ]);
        items.push(
            ...many(leftover, r => row(`dt-left:${r.MaDT}`, 'cashier-returns',
                'Phiếu đổi trả sót ca trước tại quầy — tự tiếp nhận và làm tiếp',
                `${r.MaDT} · ${r.HinhThucXuLy} · không chờ người cũ`, r.NgayBanGiao, 'urgent')),
            ...many(refunding, r => row(`dt-rf:${r.MaDT}`, 'cashier-returns',
                r.TrangThai === 'Đang hoàn tiền'
                    ? 'Đang hoàn ZaloPay — Query, khách đã có thể về'
                    : r.TrangThai === 'Chờ xử lý hoàn tiền'
                        ? 'Chờ xử lý hoàn tiền — két đủ mới chi TM, không chi dở'
                    : 'Hoàn ZaloPay thất bại — Query rồi thử lại, không trả tiền mặt',
                `${r.MaDT} · ${r.MaGiaoDichHoan || 'm_refund_id'}`, r.NgayDuyet, 'urgent')),
            ...many(ready, r => row(`dt-ok:${r.MaDT}`, 'cashier-returns',
                r.HinhThucXuLy === 'Đổi hàng' ? 'Quản lý đã duyệt — xác nhận đổi hàng' : 'Quản lý đã duyệt — gửi hoàn ZaloPay / tiền mặt',
                `${r.MaDT} · xác nhận trên ca đang mở`, r.NgayDuyet, 'urgent')),
            ...many(waiting, r => row(`dt-wait:${r.MaDT}`, 'cashier-returns',
                r.TrangThai === 'Chờ kiểm tra' ? 'Đổi trả đang chờ Thủ kho kiểm' : 'Đổi trả đang chờ Quản lý duyệt',
                `${r.MaDT} · ${r.HinhThucXuLy}`, r.NgayLap, 'wait')),
            ...many(rejected, r => row(`dt-no:${r.MaDT}`, 'cashier-returns', 'Phiếu đổi trả bị từ chối',
                `${r.MaDT} · ${r.GhiChu || r.HinhThucXuLy}`, r.NgayDuyet, 'info'))
        );
    }

    const persisted = await listPersistedWorkflowItems(pool, user);
    const combined = mergeInboxItems(items, persisted);
    const submittedReport = item => item.entityType === REPORT_ENTITY && isReportTarget(item.target);
    const processedReports = await loadProcessedReports(pool, combined
        .filter(item => submittedReport(item) && !item.read)
        .map(item => item.entityId));
    const merged = processedReports.size
        ? combined.map(item => (submittedReport(item) && processedReports.has(String(item.entityId))
            ? { ...item, read: true }
            : item))
        : combined;
    merged.sort((a, b) => {
        const rank = { urgent: 0, info: 1, wait: 2 };
        const diff = (rank[a.tone] ?? 3) - (rank[b.tone] ?? 3);
        if (diff) return diff;
        return new Date(b.at || 0) - new Date(a.at || 0);
    });
    return merged;
};

module.exports = {
    listForRole, inboxHint, roleOf, isRole,
    listPendingAttendance, PENDING_CHAM_CONG_PREDICATE,
    moneyVi, joinDetail, pcPayTitle, pcPayDetail, pcRejectTitle, pcRejectDetail,
    pclRejectTitle, pclRejectDetail,
    mergeInboxItems, listPersistedWorkflowItems
};
