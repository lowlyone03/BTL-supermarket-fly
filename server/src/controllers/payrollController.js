const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const { ensurePayrollSchema } = require('../services/payrollSchema');
const { snapshotFund } = require('../services/payrollFund');
const { seedFixedHolidays } = require('./holidayController');
const {
    validMonth, dateKey, periodBounds, employedOn, loadRates, loadHolidays,
    holidaySet, validateLunarCalendar, pendingAttendance, computeShiftLines,
    holidayRestLine, workMinutesOf, summarize, lateWarning, mondayKey
} = require('../services/payrollEngine');
const { vietnamCalendar } = require('../services/reportingPeriod');

const assertAccountant = (req, res) => {
    if (String(req.user?.TenVaiTro || '').trim() === 'Kế toán') return true;
    res.status(403).json({
        message: 'Chỉ Kế toán được lập, khóa và chi bảng lương. Quản lý duyệt công và duyệt phiếu chi/giao quỹ; không lập kỳ lương.'
    });
    return false;
};

const voucherSelect = `
    SELECT pcl.MaPhieu,pcl.MaKy,pcl.MaNV,pcl.MaBangLuong,pcl.SoTien,pcl.PhuongThuc,pcl.TrangThai,
           pcl.NoiDung,pcl.GhiChu,pcl.MaNV_Lap,pcl.NgayLap,pcl.MaNV_Duyet,pcl.NgayDuyet,pcl.LyDoTuChoi,
           pcl.HinhThucCapQuy,pcl.NgayCapQuy,pcl.GhiChuCapQuy,pcl.MaGiaoDichNganHang,
           pcl.CoChiTre,pcl.GhiChuTreHan,pcl.NgayThanhToan,
           nvLap.TenNV AS NguoiLap,nvDuyet.TenNV AS NguoiDuyet
    FROM PhieuChiLuong pcl
    JOIN NhanVien nvLap ON nvLap.MaNV=pcl.MaNV_Lap
    LEFT JOIN NhanVien nvDuyet ON nvDuyet.MaNV=pcl.MaNV_Duyet`;

const loadWeekMap = async (transaction, startKey, endKey) => {
    const from = new Date(`${startKey}T00:00:00`);
    from.setDate(from.getDate() - 7);
    const to = new Date(`${endKey}T00:00:00`);
    to.setDate(to.getDate() + 7);
    const result = await new sql.Request(transaction)
        .input('From', sql.Date, dateKey(from)).input('To', sql.Date, dateKey(to)).query(`
            SELECT l.MaNV,CONVERT(varchar(10),l.NgayLam,23) NgayLam
            FROM LichLamViec l
            WHERE l.TrangThai=N'Đã công bố' AND l.NgayLam BETWEEN @From AND @To`);
    const map = new Map();
    for (const row of result.recordset) {
        const key = `${row.MaNV}|${mondayKey(row.NgayLam)}`;
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(row.NgayLam);
    }
    return map;
};

const insertDetail = async (transaction, maBangLuong, line) => {
    await new sql.Request(transaction)
        .input('MaBangLuong', sql.BigInt, maBangLuong)
        .input('MaChamCong', sql.BigInt, line.MaChamCong)
        .input('NgayCong', sql.Date, line.NgayCong)
        .input('PhutNgay', sql.Int, line.PhutNgay)
        .input('PhutDem', sql.Int, line.PhutDem)
        .input('LuongGio', sql.Decimal(18, 2), line.LuongGio)
        .input('HeSoBanDem', sql.Decimal(5, 2), line.HeSoBanDem)
        .input('HeSoApDung', sql.Decimal(5, 2), line.HeSoApDung)
        .input('LoaiNgay', sql.NVarChar, line.LoaiNgay)
        .input('LoaiGio', sql.NVarChar, line.LoaiGio)
        .input('ThanhTien', sql.Decimal(18, 2), line.ThanhTien)
        .query(`INSERT ChiTietBangLuong(MaBangLuong,MaChamCong,NgayCong,PhutNgay,PhutDem,LuongGio,HeSoBanDem,ThanhTien,LoaiNgay,LoaiGio,HeSoApDung)
                VALUES(@MaBangLuong,@MaChamCong,@NgayCong,@PhutNgay,@PhutDem,@LuongGio,@HeSoBanDem,@ThanhTien,@LoaiNgay,@LoaiGio,@HeSoApDung)`);
};

const build = async (req, res) => {
    if (!assertAccountant(req, res)) return;
    const month = String(req.params.month || '');
    if (!validMonth(month)) return res.status(400).json({ message: 'Kỳ lương không hợp lệ.' });
    const todayCal = vietnamCalendar();
    if (month > todayCal.monthPeriod) {
        return res.status(400).json({
            message: `Không lập bảng lương tháng ${month}: kỳ chưa tới (hiện tại ${todayCal.monthPeriod}).`
        });
    }
    const bounds = periodBounds(month);
    const attendTo = month === todayCal.monthPeriod ? todayCal.date : bounds.endKey;
    const pool = await poolPromise;
    await ensurePayrollSchema(pool);
    await seedFixedHolidays(pool, bounds.year);
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const existing = await new sql.Request(transaction).input('MaKy', sql.VarChar, month)
            .query('SELECT TrangThai FROM KyLuong WITH(UPDLOCK,HOLDLOCK) WHERE MaKy=@MaKy');
        if (existing.recordset[0]?.TrangThai === 'Đã khóa' || existing.recordset[0]?.TrangThai === 'Đã thanh toán') {
            throw new Error('Kỳ lương đã khóa nên không thể tính lại.');
        }
        const voucherBlock = await new sql.Request(transaction).input('MaKy', sql.VarChar, month)
            .query(`SELECT TOP 1 MaPhieu FROM PhieuChiLuong WHERE MaKy=@MaKy AND TrangThai NOT IN (N'Từ chối')`);
        if (voucherBlock.recordset.length) {
            throw new Error(`Kỳ ${month} đã có Phiếu chi lương ${voucherBlock.recordset[0].MaPhieu}. Không tính lại.`);
        }
        const pending = await pendingAttendance(transaction, bounds.startKey, attendTo);
        if (pending.length) {
            const sample = pending.slice(0, 8).map(row => `${row.TenNV} (${row.NgayLam})`).join(', ');
            throw new Error(`Còn ${pending.length} lượt chấm công chờ duyệt trong kỳ ${month}: ${sample}${pending.length > 8 ? '…' : ''}. Quản lý hãy duyệt công (UC32) trước khi Kế toán lập bảng lương.`);
        }
        const yearHolidays = await loadHolidays(transaction, bounds.year);
        const lunarError = validateLunarCalendar(yearHolidays);
        if (lunarError) throw new Error(lunarError);
        const periodHolidays = yearHolidays.filter(row => {
            const day = dateKey(row.NgayDuongLich);
            return day >= bounds.startKey && day <= bounds.endKey;
        });
        const holidays = holidaySet(periodHolidays);
        const rates = await loadRates(transaction);
        const weekDays = await loadWeekMap(transaction, bounds.startKey, bounds.endKey);

        await new sql.Request(transaction).input('MaKy', sql.VarChar, month)
            .input('Year', sql.Int, bounds.year).input('MonthNum', sql.Int, bounds.monthNumber)
            .input('NguoiLap', sql.VarChar, req.user.MaNV).query(`
                MERGE KyLuong target USING(SELECT @MaKy MaKy) source ON target.MaKy=source.MaKy
                WHEN MATCHED THEN UPDATE SET
                    TuNgay=DATEFROMPARTS(@Year,@MonthNum,1),
                    DenNgay=EOMONTH(DATEFROMPARTS(@Year,@MonthNum,1)),
                    NgayTraDuKien=DATEADD(day,9,DATEADD(month,1,DATEFROMPARTS(@Year,@MonthNum,1))),
                    NgayTatToan=10,CoChiTre=0,
                    NguoiLap=@NguoiLap,NgayLap=GETDATE(),TrangThai=N'Kế toán đã lập'
                WHEN NOT MATCHED THEN INSERT(MaKy,TuNgay,DenNgay,NgayTraDuKien,NgayTatToan,CoChiTre,TrangThai,NguoiLap)
                    VALUES(@MaKy,DATEFROMPARTS(@Year,@MonthNum,1),EOMONTH(DATEFROMPARTS(@Year,@MonthNum,1)),
                           DATEADD(day,9,DATEADD(month,1,DATEFROMPARTS(@Year,@MonthNum,1))),
                           10,0,N'Kế toán đã lập',@NguoiLap);`);
        await new sql.Request(transaction).input('MaKy', sql.VarChar, month).query(`
            DELETE FROM ChiTietBangLuong WHERE MaBangLuong IN(SELECT MaBangLuong FROM BangLuong WHERE MaKy=@MaKy);
            DELETE FROM BangLuong WHERE MaKy=@MaKy;`);

        const employees = await new sql.Request(transaction)
            .input('Start', sql.Date, bounds.startKey).input('End', sql.Date, bounds.endKey).query(`
                SELECT nv.MaNV,nv.TenNV,nv.TrangThai,CONVERT(varchar(10),nv.NgayNghiViec,23) NgayNghiViec,
                       COALESCE(ml.LuongGio,55000) LuongGio
                FROM NhanVien nv
                OUTER APPLY (
                    SELECT TOP 1 LuongGio FROM MucLuongNhanVien
                    WHERE MaNV=nv.MaNV AND NgayHieuLuc<=@End
                    ORDER BY NgayHieuLuc DESC
                ) ml
                WHERE nv.TrangThai=N'Đang làm việc'
                   OR (nv.NgayNghiViec IS NOT NULL AND nv.NgayNghiViec>=@Start)`);

        const attendance = await new sql.Request(transaction)
            .input('Year', sql.Int, bounds.year).input('MonthNum', sql.Int, bounds.monthNumber)
            .input('AttendTo', sql.Date, attendTo).query(`
                SELECT cc.MaChamCong,l.MaNV,nv.TenNV,l.MaLoaiCa,lc.NhomCa,
                       CONVERT(varchar(10),l.NgayLam,23) NgayLam,
                       COALESCE(cc.ThoiGianVaoDuocDuyet,cc.ThoiGianVao) BatDau,
                       COALESCE(cc.ThoiGianRaDuocDuyet,cc.ThoiGianRa) KetThuc,
                       l.BatDauDuKien,l.KetThucDuKien,
                       CONVERT(varchar(5),lc.GioNghiBatDau,108) GioNghiBatDau,
                       CONVERT(varchar(5),lc.GioNghiKetThuc,108) GioNghiKetThuc,
                       COALESCE(ml.LuongGio,55000) LuongGio
                FROM ChamCong cc JOIN LichLamViec l ON l.MaLich=cc.MaLich
                JOIN NhanVien nv ON nv.MaNV=l.MaNV
                JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
                OUTER APPLY(SELECT TOP 1 LuongGio FROM MucLuongNhanVien
                    WHERE MaNV=l.MaNV AND NgayHieuLuc<=CONVERT(date,COALESCE(cc.ThoiGianVaoDuocDuyet,cc.ThoiGianVao))
                    ORDER BY NgayHieuLuc DESC) ml
                WHERE cc.TrangThai=N'Đã duyệt'
                  AND l.NgayLam <= @AttendTo
                  AND COALESCE(cc.ThoiGianRaDuocDuyet,cc.ThoiGianRa) >= DATEFROMPARTS(@Year,@MonthNum,1)
                  AND COALESCE(cc.ThoiGianVaoDuocDuyet,cc.ThoiGianVao) < DATEADD(month,1,DATEFROMPARTS(@Year,@MonthNum,1))`);

        const employeeMap = new Map(employees.recordset.map(emp => [emp.MaNV, emp]));
        const grouped = new Map();
        for (const row of attendance.recordset) {
            if (!grouped.has(row.MaNV)) {
                const emp = employeeMap.get(row.MaNV);
                grouped.set(row.MaNV, {
                    MaNV: row.MaNV,
                    TenNV: emp?.TenNV || row.TenNV,
                    TrangThai: emp?.TrangThai || 'Đang làm việc',
                    NgayNghiViec: emp?.NgayNghiViec || null,
                    LuongGio: Number(emp?.LuongGio || row.LuongGio || 55000),
                    details: []
                });
            }
            grouped.get(row.MaNV).details.push(...computeShiftLines(row, bounds, holidays, rates, weekDays));
        }
        let builtCount = 0;
        for (const item of grouped.values()) {
            if (workMinutesOf(item.details) <= 0) continue;
            const luongGio = Number(item.LuongGio || 55000);
            for (const holiday of periodHolidays) {
                const day = dateKey(holiday.NgayDuongLich);
                if (day > attendTo) continue;
                if (!employedOn(item, day)) continue;
                item.details.push(holidayRestLine(day, luongGio));
            }
            const totals = summarize(item.details);
            if (!item.details.length || totals.TongLuong <= 0) continue;
            const inserted = await new sql.Request(transaction)
                .input('MaKy', sql.VarChar, month).input('MaNV', sql.VarChar, item.MaNV)
                .input('PhutNgay', sql.Int, totals.PhutNgay).input('PhutDem', sql.Int, totals.PhutDem)
                .input('PhutLe', sql.Int, totals.PhutLe)
                .input('LuongCoBan', sql.Decimal(18, 2), totals.LuongCoBan)
                .input('LuongBanDem', sql.Decimal(18, 2), totals.LuongBanDem)
                .input('LuongTangCa', sql.Decimal(18, 2), totals.LuongTangCa)
                .input('LuongNgayLe', sql.Decimal(18, 2), totals.LuongNgayLe)
                .input('TongLuong', sql.Decimal(18, 2), totals.TongLuong).query(`
                    INSERT BangLuong(MaKy,MaNV,PhutNgay,PhutDem,PhutLe,LuongCoBan,LuongBanDem,LuongTangCa,LuongNgayLe,
                                     Thuong,KhauTru,TongLuong,TrangThai)
                    OUTPUT inserted.MaBangLuong
                    VALUES(@MaKy,@MaNV,@PhutNgay,@PhutDem,@PhutLe,@LuongCoBan,@LuongBanDem,@LuongTangCa,@LuongNgayLe,
                           0,0,@TongLuong,N'Chờ khóa')`);
            const maBangLuong = inserted.recordset[0].MaBangLuong;
            for (const line of item.details) await insertDetail(transaction, maBangLuong, line);
            builtCount += 1;
        }
        const holidayRestCount = periodHolidays.filter(row => dateKey(row.NgayDuongLich) <= attendTo).length;
        await logAudit(transaction, {
            user: req.user, req, action: 'Lập bảng lương tháng', table: 'KyLuong', recordId: month, uc: 'UC33',
            severity: 'Quan trọng',
            content: `Đã lập bảng lương ${month}; ${builtCount} NV có công đã duyệt; tất toán ${bounds.paymentDate}; ${holidayRestCount} ngày lễ (chỉ cộng cho NV đã đi làm).`
        });
        await transaction.commit();
        res.status(201).json({
            message: builtCount
                ? `Đã lập bảng lương ${month}: ${builtCount} nhân viên có chấm công đã duyệt. Lương lễ 8 giờ chỉ cộng cho những người này. Tất toán dự kiến ${bounds.paymentDate}.`
                : `Đã lập kỳ ${month} nhưng bảng trống: chưa có nhân viên nào có chấm công đã duyệt (phút công > 0) đến ${attendTo}. Không cộng lương lễ cho cả cửa hàng.`,
            NgayTraDuKien: bounds.paymentDate,
            SoNgayLe: holidayRestCount,
            SoNhanVien: builtCount
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

const get = async (req, res) => {
    try {
        const month = String(req.params.month || '');
        if (!validMonth(month)) return res.status(400).json({ message: 'Kỳ lương không hợp lệ.' });
        const bounds = periodBounds(month);
        const pool = await poolPromise;
        await ensurePayrollSchema(pool);
        const [period, rows, vouchers, holidays] = await Promise.all([
            pool.request().input('MaKy', sql.VarChar, month).query('SELECT * FROM KyLuong WHERE MaKy=@MaKy'),
            pool.request().input('MaKy', sql.VarChar, month).query(`
                SELECT bl.*,nv.TenNV,nv.ChucVu,
                       pcl.MaPhieu,pcl.PhuongThuc AS PhuongThucPhieu,pcl.TrangThai AS TrangThaiPhieu,
                       pcl.MaGiaoDichNganHang,pcl.CoChiTre,pcl.LyDoTuChoi
                FROM BangLuong bl JOIN NhanVien nv ON nv.MaNV=bl.MaNV
                LEFT JOIN PhieuChiLuong pcl ON pcl.MaKy=bl.MaKy AND pcl.MaNV=bl.MaNV
                WHERE bl.MaKy=@MaKy ORDER BY nv.TenNV`),
            pool.request().input('MaKy', sql.VarChar, month).query(`${voucherSelect} WHERE pcl.MaKy=@MaKy ORDER BY nvLap.TenNV`),
            loadHolidays(pool, bounds.year, bounds.startKey, bounds.endKey)
        ]);
        const items = rows.recordset;
        const unpaid = items.some(item => item.TrangThai !== 'Đã thanh toán');
        const storedPay = period.recordset[0] ? dateKey(period.recordset[0].NgayTraDuKien) : '';
        const locked = ['Đã khóa', 'Đã thanh toán'].includes(period.recordset[0]?.TrangThai);
        if (period.recordset[0] && !locked && storedPay !== bounds.paymentDate) {
            await pool.request().input('MaKy', sql.VarChar, month).input('Pay', sql.Date, bounds.paymentDate)
                .query('UPDATE KyLuong SET NgayTraDuKien=@Pay, NgayTatToan=10 WHERE MaKy=@MaKy');
        }
        const payDate = bounds.paymentDate;
        const warning = lateWarning(payDate, unpaid);
        const soNgayLeNghi = items.reduce((sum, item) => sum + Math.round(Number(item.PhutLe || 0) / 480), 0);
        const periodRow = period.recordset[0] ? {
            ...period.recordset[0],
            TuNgay: dateKey(period.recordset[0].TuNgay),
            DenNgay: dateKey(period.recordset[0].DenNgay),
            NgayTraDuKien: payDate,
            NgayTraDuKienLuu: storedPay || payDate
        } : null;
        const fund = await snapshotFund(pool, month);
        const todayCal = vietnamCalendar();
        const canBuild = month <= todayCal.monthPeriod && !locked;
        res.json({
            period: periodRow,
            built: Boolean(periodRow),
            canBuild,
            canWrite: String(req.user?.TenVaiTro || '').trim() === 'Kế toán',
            attendanceRule: 'Chưa bấm Lập thì chưa có số. Chỉ nhân viên đã chấm công (đã duyệt) trong tháng mới có mặt. Lương lễ 8 giờ chỉ cộng khi đã có công thật — không đưa cả cửa hàng vào vì ngày lễ.',
            items,
            vouchers: vouchers.recordset,
            holidays,
            warning,
            fund,
            summary: {
                SoNhanVien: items.length,
                TongLuong: items.reduce((sum, item) => sum + Number(item.TongLuong || 0), 0),
                TongLuongNgayLe: items.reduce((sum, item) => sum + Number(item.LuongNgayLe || 0), 0),
                SoNgayLe: holidays.length,
                SoDongLeNghi: soNgayLeNghi,
                NgayTraDuKien: payDate,
                ChoDuyet: vouchers.recordset.filter(item => item.TrangThai === 'Chờ duyệt').length,
                ChoChi: vouchers.recordset.filter(item => ['Đã duyệt', 'Thanh toán thất bại'].includes(item.TrangThai)).length,
                SoTienMatCon: Number(fund.fund?.SoTienMatCon || 0),
                SoTienCKCon: Number(fund.fund?.SoTienCKCon || 0)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải bảng lương.' });
    }
};

const getDetails = async (req, res) => {
    try {
        const month = String(req.params.month || '');
        const employee = String(req.params.employee || '');
        if (!validMonth(month)) return res.status(400).json({ message: 'Kỳ lương không hợp lệ.' });
        const pool = await poolPromise;
        await ensurePayrollSchema(pool);
        const header = await pool.request().input('MaKy', sql.VarChar, month).input('MaNV', sql.VarChar, employee).query(`
            SELECT bl.*,nv.TenNV FROM BangLuong bl JOIN NhanVien nv ON nv.MaNV=bl.MaNV
            WHERE bl.MaKy=@MaKy AND bl.MaNV=@MaNV`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy bảng lương nhân viên.' });
        const lines = await pool.request().input('MaBangLuong', sql.BigInt, header.recordset[0].MaBangLuong).query(`
            SELECT ct.*,CONVERT(varchar(10),ct.NgayCong,23) NgayCong
            FROM ChiTietBangLuong ct WHERE ct.MaBangLuong=@MaBangLuong
            ORDER BY ct.NgayCong,ct.LoaiGio`);
        res.json({ item: header.recordset[0], lines: lines.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải chi tiết bảng lương.' });
    }
};

const lock = async (req, res) => {
    if (!assertAccountant(req, res)) return;
    const month = String(req.params.month || '');
    if (!validMonth(month)) return res.status(400).json({ message: 'Kỳ lương không hợp lệ.' });
    const bounds = periodBounds(month);
    const pool = await poolPromise;
    await ensurePayrollSchema(pool);
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction).input('MaKy', sql.VarChar, month)
            .query('SELECT TrangThai FROM KyLuong WITH(UPDLOCK,HOLDLOCK) WHERE MaKy=@MaKy');
        if (current.recordset[0]?.TrangThai !== 'Kế toán đã lập') {
            throw new Error('Kỳ lương chưa được lập hoặc đã khóa.');
        }
        await new sql.Request(transaction).input('MaKy', sql.VarChar, month)
            .input('From', sql.Date, bounds.startKey).input('To', sql.Date, bounds.endKey).query(`
            UPDATE KyLuong SET TrangThai=N'Đã khóa',NgayKhoa=GETDATE() WHERE MaKy=@MaKy;
            UPDATE BangLuong SET TrangThai=N'Đã khóa' WHERE MaKy=@MaKy;
            UPDATE NgayLeNam SET NgayKhoa=GETDATE()
            WHERE NgayDuongLich BETWEEN @From AND @To AND NgayKhoa IS NULL;`);
        await logAudit(transaction, {
            user: req.user, req, action: 'Khóa kỳ lương', table: 'KyLuong', recordId: month, uc: 'UC33',
            severity: 'Cảnh báo',
            content: `Đã khóa kỳ lương ${month}. Lịch lễ các ngày trong kỳ bị khóa. Chưa chi lương — Kế toán lập phiếu, Quản lý duyệt rồi giao quỹ chung một lần.`
        });
        await transaction.commit();
        res.json({ message: `Đã khóa kỳ lương ${month}. Kế toán lập phiếu chi (TM hoặc CK), Quản lý duyệt từng người (hoặc duyệt tất cả), rồi giao quỹ chung một lần. Kế toán chi từng người từ quỹ đó.` });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const pay = async (req, res) => {
    res.status(400).json({
        message: 'Không ghi nhận trả lương trực tiếp trên bảng lương. Hãy lập Phiếu chi lương, chờ Quản lý duyệt và giao quỹ, rồi chi trên phiếu đó.'
    });
};

module.exports = { build, get, getDetails, lock, pay, voucherSelect };
