const { sql, poolPromise } = require('../config/db');
const { closeOpenAttendance } = require('../services/attendanceSync');
const { calculateGrossProfit, RESTOCK_ACCEPTED_SQL } = require('../services/financialRules');
const { logAudit } = require('../services/auditLog');

const generateShiftId = async transaction => {
    const now = new Date();
    const prefix = `CA${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 MaCa FROM CaLamViec WITH (UPDLOCK,HOLDLOCK)
                WHERE MaCa LIKE @Prefix ORDER BY MaCa DESC`);
    const last = result.recordset[0]?.MaCa;
    return `${prefix}${String(last ? Number(last.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
};

const shiftQuery = `
    SELECT ca.MaCa,ca.MaNV,nv.TenNV,ca.ThoiGianBatDau,ca.ThoiGianKetThuc,
           ca.TienDauCa,ca.TienCuoiCa,ca.TrangThai,ca.MaLich,ca.MaQuay,
           ca.TrangThaiDoiSoat,ca.TongTienMat,ca.TongTienQR,ca.TongTienThe,
           ca.TongTienChuyenKhoan,ca.TongTienHoanMat,ca.TienMatHeThong,ca.TienThucNop,
           COUNT(hd.MaHD) AS SoHoaDon,
           COALESCE(SUM(CASE WHEN hd.TrangThai=N'Hoàn thành' THEN hd.TongThanhToan ELSE 0 END),0) AS DoanhThu
    FROM CaLamViec ca
    JOIN NhanVien nv ON nv.MaNV=ca.MaNV
    LEFT JOIN HoaDon hd ON hd.MaCa=ca.MaCa
`;

const getShifts = async (req, res) => {
    try {
        const pool = await poolPromise;
        const [current, history] = await Promise.all([
            pool.request().input('MaNV', sql.VarChar, req.user.MaNV).query(`${shiftQuery}
                WHERE ca.MaNV=@MaNV AND ca.ThoiGianKetThuc IS NULL AND ca.TrangThai=N'Đang mở'
                GROUP BY ca.MaCa,ca.MaNV,nv.TenNV,ca.ThoiGianBatDau,ca.ThoiGianKetThuc,ca.TienDauCa,ca.TienCuoiCa,ca.TrangThai,ca.MaLich,ca.MaQuay,
                         ca.TrangThaiDoiSoat,ca.TongTienMat,ca.TongTienQR,ca.TongTienThe,ca.TongTienChuyenKhoan,ca.TongTienHoanMat,ca.TienMatHeThong,ca.TienThucNop`),
            pool.request().input('MaNV', sql.VarChar, req.user.MaNV).query(`${shiftQuery}
                WHERE ca.MaNV=@MaNV
                GROUP BY ca.MaCa,ca.MaNV,nv.TenNV,ca.ThoiGianBatDau,ca.ThoiGianKetThuc,ca.TienDauCa,ca.TienCuoiCa,ca.TrangThai,ca.MaLich,ca.MaQuay,
                         ca.TrangThaiDoiSoat,ca.TongTienMat,ca.TongTienQR,ca.TongTienThe,ca.TongTienChuyenKhoan,ca.TongTienHoanMat,ca.TienMatHeThong,ca.TienThucNop
                ORDER BY ca.ThoiGianBatDau DESC`)
        ]);
        res.json({ current: current.recordset[0] || null, items: history.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải thông tin ca bán hàng.' });
    }
};

const scheduleSelect = `
    SELECT l.MaLich,l.MaNV,l.MaLoaiCa,lc.TenCa,lc.NhomCa,CONVERT(varchar(10),l.NgayLam,23) NgayLam,
           CONVERT(varchar(5),lc.GioBatDau,108) GioBatDau,CONVERT(varchar(5),lc.GioKetThuc,108) GioKetThuc,
           CONVERT(varchar(5),lc.GioNghiBatDau,108) GioNghiBatDau,CONVERT(varchar(5),lc.GioNghiKetThuc,108) GioNghiKetThuc,
           lc.SoGio,l.NhiemVu,l.MaQuay,q.TenQuay,l.TrangThai,
           l.BatDauDuKien,l.KetThucDuKien,
           cc.MaChamCong,cc.ThoiGianVao,cc.ThoiGianRa,cc.TrangThai TrangThaiChamCong
    FROM LichLamViec l JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
    LEFT JOIN QuayBanHang q ON q.MaQuay=l.MaQuay
    LEFT JOIN ChamCong cc ON cc.MaLich=l.MaLich
`;

const getMySchedule = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('MaNV', sql.VarChar, req.user.MaNV).query(`${scheduleSelect}
            WHERE l.MaNV=@MaNV AND l.NgayLam BETWEEN DATEADD(day,-7,CONVERT(date,GETDATE()))
                  AND DATEADD(day,31,CONVERT(date,GETDATE())) AND l.TrangThai=N'Đã công bố'
            ORDER BY l.NgayLam,lc.ThuTu`);
        const todayKey = (await pool.request().query(`SELECT CONVERT(varchar(10),GETDATE(),23) HomNay`)).recordset[0].HomNay;
        const today = result.recordset.find(item => item.ThoiGianVao && !item.ThoiGianRa)
            || result.recordset.find(item => item.NgayLam === todayKey)
            || null;
        const nextShift = result.recordset.find(item => String(item.NgayLam) > todayKey) || null;
        const publishedCount = result.recordset.length;
        res.json({ today, todayKey, nextShift, publishedCount, items: result.recordset });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Không thể tải lịch làm việc cá nhân.' }); }
};

const checkIn = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const schedule = await new sql.Request(transaction).input('MaNV', sql.VarChar, req.user.MaNV).query(`${scheduleSelect}
            WHERE l.MaNV=@MaNV AND l.TrangThai=N'Đã công bố'
              AND (
                    l.NgayLam = CONVERT(date, GETDATE())
                 OR (lc.LaCaDem = 1 AND CONVERT(date, GETDATE()) = DATEADD(day, 1, l.NgayLam)
                     AND GETDATE() <= DATEADD(hour, 2, l.KetThucDuKien))
              )
            ORDER BY l.BatDauDuKien`);
        if (!schedule.recordset.length) throw new Error('Hôm nay bạn được xếp nghỉ hoặc chưa có lịch đã công bố. Hãy đăng nhập đúng thu ngân được phân ca hôm nay.');
        const item = schedule.recordset[0];
        if (item.ThoiGianVao) throw new Error('Bạn đã chấm công vào ca này.');
        await new sql.Request(transaction).input('MaLich', sql.BigInt, item.MaLich)
            .input('BatDau', sql.DateTime, item.BatDauDuKien).query(`
            MERGE ChamCong AS target USING (SELECT @MaLich MaLich) source ON target.MaLich=source.MaLich
            WHEN MATCHED THEN UPDATE SET ThoiGianVao=GETDATE(),TrangThai=N'Đang làm việc',
                PhutDiMuon=CASE WHEN GETDATE()>@BatDau THEN DATEDIFF(minute,@BatDau,GETDATE()) ELSE 0 END
            WHEN NOT MATCHED THEN INSERT (MaLich,ThoiGianVao,TrangThai,PhutDiMuon)
                VALUES (@MaLich,GETDATE(),N'Đang làm việc',
                    CASE WHEN GETDATE()>@BatDau THEN DATEDIFF(minute,@BatDau,GETDATE()) ELSE 0 END);`);
        await transaction.commit();
        res.json({ message: `Đã chấm công vào ${item.TenCa}.`, MaLich: item.MaLich });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const checkOut = async (req, res) => {
    try {
        const pool = await poolPromise;
        const activeShift = await pool.request().input('MaNV', sql.VarChar, req.user.MaNV).query(`
            SELECT MaCa FROM CaLamViec WHERE MaNV=@MaNV AND ThoiGianKetThuc IS NULL AND TrangThai=N'Đang mở'`);
        if (activeShift.recordset.length) return res.status(400).json({ message: `Hãy đóng ca bán hàng ${activeShift.recordset[0].MaCa} trước khi chấm công ra.` });
        const result = await pool.request().input('MaNV', sql.VarChar, req.user.MaNV).query(`
            UPDATE cc SET ThoiGianRa=GETDATE(),TrangThai=N'Chờ duyệt',
                PhutVeSom=CASE WHEN GETDATE()<l.KetThucDuKien THEN DATEDIFF(minute,GETDATE(),l.KetThucDuKien) ELSE 0 END
            FROM ChamCong cc JOIN LichLamViec l ON l.MaLich=cc.MaLich
            WHERE l.MaNV=@MaNV AND cc.ThoiGianVao IS NOT NULL AND cc.ThoiGianRa IS NULL`);
        if (!result.rowsAffected[0]) return res.status(400).json({ message: 'Không có lượt chấm công đang mở.' });
        res.json({ message: 'Đã chấm công ra. Thời gian làm việc đang chờ Quản lý duyệt.' });
    } catch (error) { console.error(error); res.status(400).json({ message: error.message }); }
};

const openShift = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const TienDauCa = Number(req.body.TienDauCa);
        if (!Number.isFinite(TienDauCa) || TienDauCa < 0) {
            throw new Error('Tiền đầu ca phải là số không âm.');
        }
        if (TienDauCa > 1000000000) throw new Error('Tiền đầu ca vượt quá giới hạn cho phép.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const employee = await new sql.Request(transaction)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT MaNV,TenNV,ChucVu,TrangThai FROM NhanVien WITH (UPDLOCK,HOLDLOCK) WHERE MaNV=@MaNV`);
        if (!employee.recordset.length || employee.recordset[0].TrangThai !== 'Đang làm việc') {
            throw new Error('Nhân viên không ở trạng thái làm việc.');
        }
        if (employee.recordset[0].ChucVu !== 'Thu ngân') {
            throw new Error('Chỉ Nhân viên bán hàng kiêm thu ngân mới được mở ca bán hàng cá nhân.');
        }
        const todayShift = await new sql.Request(transaction)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT TOP 1 l.MaLich,l.MaQuay,l.NhiemVu,l.NgayLam,lc.TenCa,
                           cc.ThoiGianVao,cc.ThoiGianRa
                    FROM LichLamViec l
                    JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
                    LEFT JOIN ChamCong cc ON cc.MaLich=l.MaLich
                    WHERE l.MaNV=@MaNV AND l.TrangThai=N'Đã công bố'
                      AND (
                            l.NgayLam = CONVERT(date, GETDATE())
                         OR (lc.LaCaDem = 1 AND CONVERT(date, GETDATE()) = DATEADD(day, 1, l.NgayLam)
                             AND GETDATE() <= DATEADD(hour, 2, l.KetThucDuKien))
                      )
                    ORDER BY l.BatDauDuKien DESC`);
        if (!todayShift.recordset.length) {
            const next = await new sql.Request(transaction).input('MaNV', sql.VarChar, req.user.MaNV).query(`
                SELECT TOP 1 CONVERT(varchar(10),l.NgayLam,23) NgayLam, lc.TenCa
                FROM LichLamViec l JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
                WHERE l.MaNV=@MaNV AND l.TrangThai=N'Đã công bố' AND l.NgayLam > CONVERT(date, GETDATE())
                ORDER BY l.NgayLam, lc.ThuTu`);
            const hint = next.recordset[0]
                ? ` Ca gần nhất của bạn là ${next.recordset[0].TenCa} ngày ${next.recordset[0].NgayLam}.`
                : '';
            throw new Error(`Hôm nay bạn được xếp nghỉ, không mở được ca bán hàng.${hint} Hãy đăng nhập tài khoản thu ngân được phân ca hôm nay.`);
        }
        const assignment = { recordset: todayShift.recordset };
        if (!assignment.recordset[0].ThoiGianVao || assignment.recordset[0].ThoiGianRa) {
            throw new Error('Hãy vào Lịch làm việc và nhấn Chấm công vào trước khi mở ca bán hàng.');
        }
        const mainShiftDuties = new Set(['Ca chính full-time', 'Thu ngân']);
        if (!mainShiftDuties.has(assignment.recordset[0].NhiemVu)) {
            throw new Error('Hôm nay bạn được phân công tăng cường part-time, không phụ trách mở quầy thu ngân.');
        }
        const active = await new sql.Request(transaction)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT MaCa FROM CaLamViec WITH (UPDLOCK,HOLDLOCK)
                    WHERE MaNV=@MaNV AND ThoiGianKetThuc IS NULL AND TrangThai=N'Đang mở'`);
        if (active.recordset.length) throw new Error(`Bạn đang có ca ${active.recordset[0].MaCa} chưa đóng.`);
        const MaCa = await generateShiftId(transaction);
        await new sql.Request(transaction)
            .input('MaCa', sql.VarChar, MaCa)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('MaLich', sql.BigInt, assignment.recordset[0].MaLich)
            .input('MaQuay', sql.VarChar, assignment.recordset[0].MaQuay)
            .input('TienDauCa', sql.Decimal(18, 2), TienDauCa)
            .query(`INSERT INTO CaLamViec (MaCa,MaNV,MaLich,MaQuay,ThoiGianBatDau,TienDauCa,TrangThai)
                    VALUES (@MaCa,@MaNV,@MaLich,@MaQuay,GETDATE(),@TienDauCa,N'Đang mở')`);
        await logAudit(transaction, {
            user: req.user, req, action: 'Mở ca bán hàng', table: 'CaLamViec', recordId: MaCa, uc: 'UC22',
            severity: 'Quan trọng',
            content: `Thu ngân mở ca với tiền đầu ca ${TienDauCa.toLocaleString('vi-VN')} đồng`
        });
        await transaction.commit();
        res.status(201).json({ message: `Đã mở ca ${MaCa}. Bạn có thể bắt đầu bán hàng.`, MaCa });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        const message = error.message.includes('UX_CaLamViec_Quay_DangMo')
            ? 'Quầy được phân công đang có Thu ngân khác mở ca.'
            : error.message;
        res.status(400).json({ message });
    }
};

const getShiftSummary = async (source, maCa, lock = false) => {
    const next = () => (typeof source.request === 'function' ? source.request() : new sql.Request(source));
    const hint = lock ? 'WITH (UPDLOCK,HOLDLOCK)' : '';
    const shift = await next().input('MaCa', sql.VarChar, maCa).query(`
        SELECT ca.*,nv.TenNV,q.TenQuay
        FROM CaLamViec ca ${hint}
        JOIN NhanVien nv ON nv.MaNV=ca.MaNV
        LEFT JOIN QuayBanHang q ON q.MaQuay=ca.MaQuay
        WHERE ca.MaCa=@MaCa`);
    if (!shift.recordset.length) throw new Error('Không tìm thấy ca bán hàng.');
    const totals = await next().input('MaCa', sql.VarChar, maCa).query(`
        SELECT
          COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Tiền mặt' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TongTienMat,
          COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'QR' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TongTienQR,
          COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Thẻ' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TongTienThe,
          COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Chuyển khoản' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TongTienChuyenKhoan
        FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
        WHERE hd.MaCa=@MaCa AND hd.TrangThai=N'Hoàn thành'`);
    const refunds = await next().input('MaCa', sql.VarChar, maCa).query(`
        WITH ChiTietDoiTraTheoPhieu AS (
            SELECT ct.MaDT,
                   SUM(CASE WHEN ct.LoaiDong=N'Hàng khách trả' THEN ct.ThanhTienVon ELSE 0 END) GiaVonHangTra,
                   SUM(CASE WHEN ct.LoaiDong=N'Hàng giao đổi' THEN ct.ThanhTienVon ELSE 0 END) GiaVonHangGiaoDoi
            FROM ChiTietDoiTra ct GROUP BY ct.MaDT
        )
        SELECT COALESCE(SUM(CASE WHEN dt.PhuongThucHoan=N'Tiền mặt' THEN dt.SoTienHoan ELSE 0 END),0) TongTienHoanMat,
               COALESCE(SUM(dt.SoTienHoan),0) TienHoan,
               COALESCE(SUM(CASE WHEN ${RESTOCK_ACCEPTED_SQL}
                                 THEN ct.GiaVonHangTra ELSE 0 END),0) GiaVonHangTraNhapLai,
               COALESCE(SUM(ct.GiaVonHangGiaoDoi),0) GiaVonHangGiaoDoi
        FROM PhieuDoiTra dt
        LEFT JOIN ChiTietDoiTraTheoPhieu ct ON ct.MaDT=dt.MaDT
        WHERE dt.TrangThai=N'Hoàn thành'
          AND (dt.MaCaHoan=@MaCa OR (dt.MaCaHoan IS NULL AND dt.NgayHoan BETWEEN
              (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
              AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))`);
    const invoices = await next().input('MaCa', sql.VarChar, maCa).query(`
        SELECT COUNT(*) SoHoaDon,
               COALESCE(SUM(CASE WHEN TrangThai=N'Hoàn thành' THEN TongThanhToan ELSE 0 END),0) DoanhThu,
               SUM(CASE WHEN TrangThai=N'Nháp' THEN 1 ELSE 0 END) HoaDonNhap
        FROM HoaDon WHERE MaCa=@MaCa`);
    const pending = await next().input('MaCa', sql.VarChar, maCa).query(`
        SELECT COUNT(*) Tong FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
        WHERE hd.MaCa=@MaCa AND tt.TrangThai=N'Chờ xác nhận'`);
    const cost = await next().input('MaCa', sql.VarChar, maCa).query(`
        SELECT COALESCE(SUM(ct.ThanhTienVon),0) GiaVon
        FROM ChiTietHoaDon ct JOIN HoaDon hd ON hd.MaHD=ct.MaHD
        WHERE hd.MaCa=@MaCa AND hd.TrangThai=N'Hoàn thành'`);
    const summary = {
        ...shift.recordset[0],
        ...totals.recordset[0],
        ...refunds.recordset[0],
        ...invoices.recordset[0],
        GiaVonHoaDon: Number(cost.recordset[0].GiaVon || 0),
        ThanhToanChoXacNhan: Number(pending.recordset[0].Tong || 0)
    };
    summary.TienMatHeThong = Number(summary.TongTienMat || 0) - Number(summary.TongTienHoanMat || 0);
    summary.TienMatTrongKet = Number(summary.TienDauCa || 0) + Number(summary.TienMatHeThong || 0);
    const profit = calculateGrossProfit({
        DoanhThuHoaDon: summary.DoanhThu,
        TienHoan: summary.TienHoan,
        GiaVonHoaDon: summary.GiaVonHoaDon,
        GiaVonHangTraNhapLai: summary.GiaVonHangTraNhapLai,
        GiaVonHangGiaoDoi: summary.GiaVonHangGiaoDoi
    });
    Object.assign(summary, profit, { GiaVon: profit.GiaVonHangBanThuan });
    return summary;
};

const getCurrentShiftSummary = async (req, res) => {
    try {
        const pool = await poolPromise;
        const current = await pool.request().input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT TOP 1 MaCa FROM CaLamViec WHERE MaNV=@MaNV AND TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL ORDER BY ThoiGianBatDau DESC`);
        if (!current.recordset.length) return res.status(404).json({ message: 'Bạn chưa có ca bán hàng đang mở.' });
        res.json(await getShiftSummary(pool, current.recordset[0].MaCa));
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

const closeShift = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const TienCuoiCa = Number(req.body.TienCuoiCa);
        if (!Number.isFinite(TienCuoiCa) || TienCuoiCa < 0) throw new Error('Tiền cuối ca phải là số không âm.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const lookup = await new sql.Request(transaction).input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT MaCa FROM CaLamViec WITH (UPDLOCK,HOLDLOCK)
                    WHERE MaNV=@MaNV AND TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL`);
        if (!lookup.recordset.length) throw new Error('Bạn không có ca bán hàng đang mở.');
        const maCa = lookup.recordset[0].MaCa;
        const summary = await getShiftSummary(transaction, maCa, true);
        if (Number(summary.HoaDonNhap || 0) > 0) throw new Error('Ca còn hóa đơn nháp. Hãy hoàn thành hoặc hủy trước khi đóng ca.');
        if (Number(summary.ThanhToanChoXacNhan || 0) > 0) throw new Error('Ca còn thanh toán chờ xác nhận.');
        const tienThucNop = TienCuoiCa - Number(summary.TienDauCa || 0);
        if (tienThucNop < 0) throw new Error('Tiền cuối ca không được nhỏ hơn tiền quỹ đầu ca.');
        await new sql.Request(transaction).input('MaCa', sql.VarChar, maCa)
            .input('TienCuoiCa', sql.Decimal(18, 2), TienCuoiCa)
            .input('TongTienMat', sql.Decimal(18, 2), summary.TongTienMat)
            .input('TongTienQR', sql.Decimal(18, 2), summary.TongTienQR)
            .input('TongTienThe', sql.Decimal(18, 2), summary.TongTienThe)
            .input('TongTienChuyenKhoan', sql.Decimal(18, 2), summary.TongTienChuyenKhoan)
            .input('TongTienHoanMat', sql.Decimal(18, 2), summary.TongTienHoanMat)
            .input('TienMatHeThong', sql.Decimal(18, 2), summary.TienMatHeThong)
            .input('TienThucNop', sql.Decimal(18, 2), tienThucNop).query(`
                UPDATE CaLamViec SET ThoiGianKetThuc=GETDATE(),NgayDongCa=GETDATE(),TienCuoiCa=@TienCuoiCa,
                    TongTienMat=@TongTienMat,TongTienQR=@TongTienQR,TongTienThe=@TongTienThe,
                    TongTienChuyenKhoan=@TongTienChuyenKhoan,TongTienHoanMat=@TongTienHoanMat,
                    TienMatHeThong=@TienMatHeThong,TienThucNop=@TienThucNop,
                    TrangThai=N'Đã chốt',TrangThaiDoiSoat=N'Chờ Kế toán đối soát'
                WHERE MaCa=@MaCa`);
        await logAudit(transaction, {
            user: req.user, req, action: 'Đóng ca bán hàng', table: 'CaLamViec', recordId: maCa, uc: 'UC22',
            severity: 'Quan trọng',
            content: `Đóng ca; hệ thống ${Number(summary.TienMatHeThong).toLocaleString('vi-VN')}đ; thực nộp ${Number(tienThucNop).toLocaleString('vi-VN')}đ; lệch ${Number(tienThucNop - summary.TienMatHeThong).toLocaleString('vi-VN')}đ`
        });
        await closeOpenAttendance(transaction, maCa);
        await transaction.commit();
        res.json({
            message: `Đã đóng ca ${maCa}. Đã chấm công ra theo giờ chốt ca. Ca đang chờ Kế toán đối soát.`,
            MaCa: maCa,
            TienMatHeThong: summary.TienMatHeThong,
            TienThucNop: tienThucNop,
            ChenhLech: tienThucNop - summary.TienMatHeThong
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    getShifts, getMySchedule, checkIn, checkOut, openShift,
    getCurrentShiftSummary, closeShift
};
