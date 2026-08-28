const { sql, poolPromise } = require('../config/db');
const {
    generateSchedule, generateOfficeSchedule, parseDate, dateKey, addDays,
    CASHIER_TEAM_SIZE, OFFICE_TEAM_SIZE, OFFICE_ROLES, OFFICE_SHIFT_CODE,
    isOfficeShift, officeDutyFor
} = require('../services/shiftScheduler');
const { splitDayNightMinutes } = require('../services/timeService');
const { closeOpenAttendance } = require('../services/attendanceSync');

const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const localSqlDateTime = value => {
    const date = new Date(value);
    const number = (part, size = 2) => String(part).padStart(size, '0');
    return `${date.getFullYear()}-${number(date.getMonth() + 1)}-${number(date.getDate())} `
        + `${number(date.getHours())}:${number(date.getMinutes())}:${number(date.getSeconds())}.${number(date.getMilliseconds(), 3)}`;
};
const MAIN_SHIFT_DUTIES = new Set(['Ca chính full-time', 'Thu ngân']);
const isMainShiftDuty = duty => MAIN_SHIFT_DUTIES.has(String(duty || '').trim());
const isOfficeRole = chucVu => OFFICE_ROLES.includes(String(chucVu || '').trim());
const mondayKey = value => {
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    const offset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - offset);
    return date.toISOString().slice(0, 10);
};

const SHIFT_SELECT = `MaLoaiCa,TenCa,CONVERT(varchar(5),GioBatDau,108) GioBatDau,
    CONVERT(varchar(5),GioKetThuc,108) GioKetThuc,
    CONVERT(varchar(5),GioNghiBatDau,108) GioNghiBatDau,
    CONVERT(varchar(5),GioNghiKetThuc,108) GioNghiKetThuc,
    SoGio,SoNguoiCan,ThuTu,LaCaDem,NhomCa`;

const validatePublishRange = async (pool, from, to) => {
    const result = await pool.request().input('From', sql.Date, from).input('To', sql.Date, to).query(`
        SELECT l.MaLich,l.MaNV,nv.TenNV,l.MaLoaiCa,CONVERT(varchar(10),l.NgayLam,23) NgayLam,
               l.NhiemVu,l.MaQuay,l.BatDauDuKien,l.KetThucDuKien,lc.SoGio,
               tk.TrangThai TrangThaiTaiKhoan
        FROM LichLamViec l JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
        JOIN NhanVien nv ON nv.MaNV=l.MaNV
        LEFT JOIN TaiKhoan tk ON tk.MaNV=l.MaNV
        WHERE l.NgayLam BETWEEN DATEADD(day,-7,@From) AND DATEADD(day,7,@To)
          AND l.TrangThai IN(N'Bản nháp',N'Đã công bố')
        ORDER BY l.MaNV,l.BatDauDuKien`);
    const inRange = result.recordset.filter(row => row.NgayLam >= from && row.NgayLam <= to);
    for (const row of inRange) {
        if (Number(row.TrangThaiTaiKhoan) !== 1) throw new Error(`${row.TenNV} chưa có tài khoản hoạt động.`);
        if (isMainShiftDuty(row.NhiemVu) && !row.MaQuay) throw new Error(`${row.TenNV} làm ca chính nhưng chưa được gán quầy.`);
    }
    const queueKeys = new Set();
    for (const row of inRange.filter(item => item.MaQuay)) {
        const key = `${row.NgayLam}|${row.MaLoaiCa}|${row.MaQuay}`;
        if (queueKeys.has(key)) throw new Error(`Quầy ${row.MaQuay} bị xếp trùng trong cùng ca.`);
        queueKeys.add(key);
    }
    const byEmployee = new Map();
    for (const row of result.recordset) {
        if (!byEmployee.has(row.MaNV)) byEmployee.set(row.MaNV, []);
        byEmployee.get(row.MaNV).push(row);
    }
    for (const rows of byEmployee.values()) {
        rows.sort((a, b) => new Date(a.BatDauDuKien) - new Date(b.BatDauDuKien));
        const weekly = new Map();
        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index];
            const week = mondayKey(row.NgayLam);
            weekly.set(week, (weekly.get(week) || 0) + Number(row.SoGio));
            if (weekly.get(week) > 48) throw new Error(`${row.TenNV} vượt 48 giờ trong tuần bắt đầu ${week}.`);
            if (index > 0) {
                const previous = rows[index - 1];
                const rest = (new Date(row.BatDauDuKien) - new Date(previous.KetThucDuKien)) / 3600000;
                if (rest < 12) throw new Error(`${row.TenNV} chỉ nghỉ ${Math.max(0, rest).toFixed(1)} giờ giữa hai ca.`);
            }
        }
    }
};

const getSetup = async (req, res) => {
    try {
        const pool = await poolPromise;
        const [employees, shifts, registers] = await Promise.all([
            pool.request().query(`SELECT nv.MaNV,nv.TenNV,nv.ChucVu,
                    COALESCE(ml.LuongGio,55000) AS LuongGio,COALESCE(ml.HeSoBanDem,1.30) AS HeSoBanDem
                FROM NhanVien nv
                JOIN TaiKhoan tk ON tk.MaNV=nv.MaNV AND tk.TrangThai=1
                OUTER APPLY (SELECT TOP 1 LuongGio,HeSoBanDem FROM MucLuongNhanVien
                             WHERE MaNV=nv.MaNV AND NgayHieuLuc<=CONVERT(date,GETDATE())
                             ORDER BY NgayHieuLuc DESC) ml
                WHERE nv.ChucVu IN (N'Thu ngân', N'Nhân viên mua hàng', N'Thủ kho', N'Kế toán')
                  AND nv.TrangThai=N'Đang làm việc'
                ORDER BY CASE nv.ChucVu WHEN N'Thu ngân' THEN 1 ELSE 0 END, nv.MaNV`),
            pool.request().query(`SELECT ${SHIFT_SELECT} FROM LoaiCa WHERE TrangThai=1 ORDER BY ThuTu`),
            pool.request().query(`SELECT MaQuay,TenQuay FROM QuayBanHang WHERE TrangThai=N'Hoạt động' ORDER BY MaQuay`)
        ]);
        const cashiers = employees.recordset.filter(item => item.ChucVu === 'Thu ngân');
        const officeStaff = employees.recordset.filter(item => isOfficeRole(item.ChucVu));
        res.json({
            employees: employees.recordset,
            cashiers,
            officeStaff,
            shifts: shifts.recordset,
            registers: registers.recordset
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải dữ liệu thiết lập phân ca.' });
    }
};

const getSchedules = async (req, res) => {
    try {
        const from = clean(req.query.from, 10);
        const to = clean(req.query.to, 10);
        if (!validDate(from) || !validDate(to)) return res.status(400).json({ message: 'Khoảng ngày không hợp lệ.' });
        const pool = await poolPromise;
        const result = await pool.request().input('From', sql.Date, from).input('To', sql.Date, to).query(`
            SELECT l.MaLich,l.MaNV,nv.TenNV,nv.ChucVu,l.MaLoaiCa,lc.TenCa,lc.NhomCa,
                   CONVERT(varchar(10),l.NgayLam,23) NgayLam,
                   CONVERT(varchar(5),lc.GioBatDau,108) GioBatDau,
                   CONVERT(varchar(5),lc.GioKetThuc,108) GioKetThuc,
                   CONVERT(varchar(5),lc.GioNghiBatDau,108) GioNghiBatDau,
                   CONVERT(varchar(5),lc.GioNghiKetThuc,108) GioNghiKetThuc,lc.SoGio,
                   l.NhiemVu,l.MaQuay,q.TenQuay,l.TrangThai,l.GhiChu,
                   cc.ThoiGianVao,cc.ThoiGianRa,cc.TrangThai TrangThaiChamCong,
                   ca.MaCa,ca.TrangThai TrangThaiCaBan
            FROM LichLamViec l
            JOIN NhanVien nv ON nv.MaNV=l.MaNV
            JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
            LEFT JOIN QuayBanHang q ON q.MaQuay=l.MaQuay
            LEFT JOIN ChamCong cc ON cc.MaLich=l.MaLich
            OUTER APPLY (
                SELECT TOP 1 x.MaCa,x.TrangThai
                FROM CaLamViec x
                WHERE x.MaNV=l.MaNV AND (
                    x.MaLich=l.MaLich
                    OR CONVERT(date,x.ThoiGianBatDau)=l.NgayLam
                )
                ORDER BY x.ThoiGianBatDau DESC
            ) ca
            WHERE l.NgayLam BETWEEN @From AND @To AND l.TrangThai<>N'Đã hủy'
            ORDER BY l.NgayLam,lc.ThuTu,nv.TenNV`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải lịch làm việc.' });
    }
};

const autoSchedule = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const from = clean(req.body.from, 10);
        const to = clean(req.body.to, 10);
        if (!validDate(from) || !validDate(to)) throw new Error('Khoảng ngày phân ca không hợp lệ.');
        const first = parseDate(from);
        const last = parseDate(to);
        if (last < first || (last - first) / 86400000 > 30) throw new Error('Mỗi lần chỉ phân ca tối đa 31 ngày liên tiếp.');

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const request = () => new sql.Request(transaction);
        const protectedRows = await request().input('From', sql.Date, from).input('To', sql.Date, to).query(`
            SELECT COUNT(*) Tong FROM LichLamViec WITH (UPDLOCK,HOLDLOCK)
            WHERE NgayLam BETWEEN @From AND @To AND TrangThai=N'Đã công bố'`);
        if (protectedRows.recordset[0].Tong) throw new Error('Khoảng ngày đã có lịch được công bố. Hãy hủy công bố từng lịch trước khi xếp lại.');
        const employeesResult = await request().query(`SELECT nv.MaNV,nv.TenNV,nv.ChucVu FROM NhanVien nv
                JOIN TaiKhoan tk ON tk.MaNV=nv.MaNV AND tk.TrangThai=1
                WHERE nv.ChucVu IN (N'Thu ngân', N'Nhân viên mua hàng', N'Thủ kho', N'Kế toán')
                  AND nv.TrangThai=N'Đang làm việc' ORDER BY nv.MaNV`);
        const shiftsResult = await request().query(`SELECT ${SHIFT_SELECT} FROM LoaiCa WHERE TrangThai=1 ORDER BY ThuTu`);
        const existingResult = await request().input('ContextFrom', sql.Date, dateKey(addDays(first, -7)))
                .input('ContextTo', sql.Date, dateKey(addDays(last, 7))).query(`
                    SELECT l.MaNV,l.MaLoaiCa,CONVERT(varchar(10),l.NgayLam,23) NgayLam,lc.SoGio,
                           CONVERT(varchar(5),lc.GioBatDau,108) GioBatDau,CONVERT(varchar(5),lc.GioKetThuc,108) GioKetThuc
                    FROM LichLamViec l JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
                    WHERE l.NgayLam BETWEEN @ContextFrom AND @ContextTo
                      AND l.TrangThai<>N'Đã hủy' AND NOT (l.NgayLam BETWEEN CONVERT(date,'${from}') AND CONVERT(date,'${to}'))`)
        ;
        const cashiers = employeesResult.recordset.filter(item => item.ChucVu === 'Thu ngân');
        const officeStaff = employeesResult.recordset.filter(item => isOfficeRole(item.ChucVu));
        const cashierShifts = shiftsResult.recordset.filter(item => !isOfficeShift(item));
        const officeShift = shiftsResult.recordset.find(item => isOfficeShift(item));
        const cashierGenerated = generateSchedule({
            employees: cashiers, shifts: cashierShifts, from, to, existing: existingResult.recordset
        });
        const officeGenerated = generateOfficeSchedule({
            employees: officeStaff, shift: officeShift, from, to, existing: existingResult.recordset
        });
        const generated = [...cashierGenerated, ...officeGenerated];
        if (req.body.preview === true) {
            await transaction.rollback();
            return res.json({
                message: `Lịch xem trước: ${cashierGenerated.length} lượt thu ngân và ${officeGenerated.length} lượt hành chính.`,
                count: generated.length, items: generated
            });
        }
        await request().input('From', sql.Date, from).input('To', sql.Date, to)
            .query(`DELETE FROM LichLamViec WHERE NgayLam BETWEEN @From AND @To AND TrangThai=N'Bản nháp'`);
        for (const item of generated) {
            await request().input('MaNV', sql.VarChar, item.MaNV).input('MaLoaiCa', sql.VarChar, item.MaLoaiCa)
                .input('NgayLam', sql.Date, item.NgayLam).input('NhiemVu', sql.NVarChar, item.NhiemVu)
                .input('MaQuay', sql.VarChar, item.MaQuay).input('NguoiPhanCong', sql.VarChar, req.user.MaNV)
                .query(`INSERT LichLamViec
                        (MaNV,MaLoaiCa,NgayLam,NhiemVu,MaQuay,TrangThai,NguoiPhanCong,NguonPhanCong,BatDauDuKien,KetThucDuKien)
                        SELECT @MaNV,@MaLoaiCa,@NgayLam,@NhiemVu,@MaQuay,N'Bản nháp',@NguoiPhanCong,'Auto',
                               DATEADD(SECOND,DATEDIFF(SECOND,CAST('00:00' AS TIME),GioBatDau),CAST(@NgayLam AS DATETIME)),
                               DATEADD(DAY,CASE WHEN GioKetThuc<=GioBatDau THEN 1 ELSE 0 END,
                                   DATEADD(SECOND,DATEDIFF(SECOND,CAST('00:00' AS TIME),GioKetThuc),CAST(@NgayLam AS DATETIME)))
                        FROM LoaiCa WHERE MaLoaiCa=@MaLoaiCa`);
        }
        await request().input('MaTK', sql.Int, req.user.MaTK).input('NoiDung', sql.NVarChar,
            `Tự động phân ${generated.length} lượt: thu ngân xoay ca và hành chính 7h30–17h30`)
            .query(`INSERT NhatKy (MaTK,HanhDong,BangLienQuan,NoiDung,ThoiGian)
                    VALUES (@MaTK,N'Phân ca tự động',N'LichLamViec',@NoiDung,GETDATE())`);
        await transaction.commit();
        res.status(201).json({
            message: `Đã tạo bản nháp ${cashierGenerated.length} lượt thu ngân và ${officeGenerated.length} lượt hành chính (${CASHIER_TEAM_SIZE} thu ngân + ${OFFICE_TEAM_SIZE} khối văn phòng).`,
            count: generated.length
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

const saveSchedule = async (req, res) => {
    try {
        const MaNV = clean(req.body.MaNV, 20);
        let MaLoaiCa = clean(req.body.MaLoaiCa, 20);
        const NgayLam = clean(req.body.NgayLam, 10);
        let NhiemVu = clean(req.body.NhiemVu, 100);
        let MaQuay = clean(req.body.MaQuay, 20) || null;
        if (!MaNV || !MaLoaiCa || !validDate(NgayLam)) return res.status(400).json({ message: 'Thông tin phân ca chưa đầy đủ.' });
        const pool = await poolPromise;
        const employee = await pool.request().input('MaNV', sql.VarChar, MaNV)
            .query(`SELECT MaNV,TenNV,ChucVu,TrangThai FROM NhanVien WHERE MaNV=@MaNV`);
        if (!employee.recordset.length || employee.recordset[0].TrangThai !== 'Đang làm việc') {
            return res.status(400).json({ message: 'Nhân viên không còn đang làm việc.' });
        }
        const row = employee.recordset[0];
        if (isOfficeRole(row.ChucVu)) {
            MaLoaiCa = OFFICE_SHIFT_CODE;
            NhiemVu = officeDutyFor(row);
            MaQuay = null;
        } else {
            if (MaLoaiCa === OFFICE_SHIFT_CODE) {
                return res.status(400).json({ message: 'Thu ngân không xếp ca hành chính 7h30–17h30.' });
            }
            if (!NhiemVu) return res.status(400).json({ message: 'Thông tin phân ca chưa đầy đủ.' });
            if (isMainShiftDuty(NhiemVu) && !MaQuay) return res.status(400).json({ message: 'Ca chính full-time phải được chỉ định quầy.' });
        }
        const result = await pool.request().input('MaNV', sql.VarChar, MaNV).input('MaLoaiCa', sql.VarChar, MaLoaiCa)
            .input('NgayLam', sql.Date, NgayLam).input('NhiemVu', sql.NVarChar, NhiemVu).input('MaQuay', sql.VarChar, MaQuay)
            .input('NguoiPhanCong', sql.VarChar, req.user.MaNV).query(`
                MERGE LichLamViec AS target
                USING (SELECT @MaNV MaNV,@NgayLam NgayLam,@MaLoaiCa MaLoaiCa,
                              DATEADD(SECOND,DATEDIFF(SECOND,CAST('00:00' AS TIME),GioBatDau),CAST(@NgayLam AS DATETIME)) BatDau,
                              DATEADD(DAY,CASE WHEN GioKetThuc<=GioBatDau THEN 1 ELSE 0 END,
                                  DATEADD(SECOND,DATEDIFF(SECOND,CAST('00:00' AS TIME),GioKetThuc),CAST(@NgayLam AS DATETIME))) KetThuc
                       FROM LoaiCa WHERE MaLoaiCa=@MaLoaiCa) source
                ON target.MaNV=source.MaNV AND target.NgayLam=source.NgayLam
                WHEN MATCHED AND target.TrangThai=N'Bản nháp' THEN UPDATE SET MaLoaiCa=@MaLoaiCa,NhiemVu=@NhiemVu,
                    MaQuay=@MaQuay,NguoiPhanCong=@NguoiPhanCong,NguonPhanCong='Manual',
                    BatDauDuKien=source.BatDau,KetThucDuKien=source.KetThuc,NgayCapNhat=GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (MaNV,MaLoaiCa,NgayLam,NhiemVu,MaQuay,TrangThai,NguoiPhanCong,NguonPhanCong,BatDauDuKien,KetThucDuKien)
                    VALUES (@MaNV,@MaLoaiCa,@NgayLam,@NhiemVu,@MaQuay,N'Bản nháp',@NguoiPhanCong,'Manual',source.BatDau,source.KetThuc)
                OUTPUT inserted.MaLich,inserted.TrangThai;`);
        if (!result.recordset.length) return res.status(400).json({ message: 'Lịch đã công bố nên không thể sửa trực tiếp.' });
        res.json({ message: 'Đã lưu lịch phân công.', item: result.recordset[0] });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message.includes('UQ_LichLamViec') ? 'Nhân viên đã có lịch trong ngày này.' : error.message });
    }
};

const deleteSchedule = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('MaLich', sql.BigInt, Number(req.params.id))
            .query(`DELETE FROM LichLamViec WHERE MaLich=@MaLich AND TrangThai=N'Bản nháp'`);
        if (!result.rowsAffected[0]) return res.status(400).json({ message: 'Chỉ có thể xóa lịch đang ở bản nháp.' });
        res.json({ message: 'Đã xóa lượt phân công.' });
    } catch (error) { res.status(400).json({ message: error.message }); }
};

const publishSchedules = async (req, res) => {
    try {
        const from = clean(req.body.from, 10); const to = clean(req.body.to, 10);
        if (!validDate(from) || !validDate(to)) return res.status(400).json({ message: 'Khoảng ngày không hợp lệ.' });
        const pool = await poolPromise;
        const coverage = await pool.request().input('From', sql.Date, from).input('To', sql.Date, to).query(`
            SELECT d.NgayLam,lc.MaLoaiCa,lc.TenCa,lc.SoNguoiCan,COUNT(l.MaLich) SoNguoiDaXep
            FROM (SELECT DATEADD(day,n.number,@From) NgayLam FROM master..spt_values n
                  WHERE n.type='P' AND n.number<=DATEDIFF(day,@From,@To)) d
            CROSS JOIN LoaiCa lc
            LEFT JOIN LichLamViec l ON l.NgayLam=d.NgayLam AND l.MaLoaiCa=lc.MaLoaiCa AND l.TrangThai<>N'Đã hủy'
            WHERE lc.TrangThai=1
              AND NOT (lc.MaLoaiCa='HANH_CHINH' AND (DATEDIFF(day, CONVERT(date,'19000101'), d.NgayLam) % 7) = 6)
            GROUP BY d.NgayLam,lc.MaLoaiCa,lc.TenCa,lc.SoNguoiCan
            HAVING COUNT(l.MaLich)<>lc.SoNguoiCan`);
        if (coverage.recordset.length) {
            const item = coverage.recordset[0];
            return res.status(400).json({ message: `${item.TenCa} ngày ${new Date(item.NgayLam).toLocaleDateString('vi-VN')} chưa đủ ${item.SoNguoiCan} người.` });
        }
        await validatePublishRange(pool, from, to);
        const result = await pool.request().input('From', sql.Date, from).input('To', sql.Date, to)
            .input('NguoiCongBo', sql.VarChar, req.user.MaNV)
            .query(`UPDATE LichLamViec SET TrangThai=N'Đã công bố',NgayCapNhat=GETDATE(),
                        NgayCongBo=GETDATE(),NguoiCongBo=@NguoiCongBo
                    WHERE NgayLam BETWEEN @From AND @To AND TrangThai=N'Bản nháp'`);
        res.json({ message: `Đã công bố ${result.rowsAffected[0]} lượt làm việc cho nhân viên.` });
    } catch (error) { console.error(error); res.status(400).json({ message: error.message }); }
};

const getAttendance = async (req, res) => {
    try {
        const from = clean(req.query.from, 10);
        const to = clean(req.query.to, 10);
        if (!validDate(from) || !validDate(to)) return res.status(400).json({ message: 'Khoảng ngày không hợp lệ.' });
        const pool = await poolPromise;
        await closeOpenAttendance(pool);
        const result = await pool.request().input('From', sql.Date, from).input('To', sql.Date, to).query(`
            SELECT cc.MaChamCong,l.MaLich,l.MaNV,nv.TenNV,nv.ChucVu,l.NgayLam,lc.TenCa,l.NhiemVu,
                   l.BatDauDuKien,l.KetThucDuKien,lc.SoGio,
                   cc.ThoiGianVao,
                   COALESCE(cc.ThoiGianRa, ca.ThoiGianKetThuc) ThoiGianRa,
                   cc.ThoiGianVaoDuocDuyet,cc.ThoiGianRaDuocDuyet,cc.SoPhutDuocDuyet,
                   cc.PhutDiMuon,cc.PhutVeSom,cc.GhiChu GhiChuDuyet,
                   CASE
                       WHEN COALESCE(cc.ThoiGianRa, ca.ThoiGianKetThuc) IS NOT NULL
                            AND (cc.TrangThai IS NULL OR cc.TrangThai=N'Đang làm việc')
                       THEN N'Chờ duyệt'
                       ELSE cc.TrangThai
                   END AS TrangThai,
                   ca.MaCa,ca.TrangThai TrangThaiCaBan,ca.ThoiGianKetThuc ThoiGianDongCa,
                   CASE
                       WHEN cc.ThoiGianVao IS NULL THEN 0
                       ELSE DATEDIFF(minute,cc.ThoiGianVao,COALESCE(cc.ThoiGianRa,ca.ThoiGianKetThuc,GETDATE()))
                   END AS SoPhutLam,
                   CASE WHEN COALESCE(cc.ThoiGianRa,ca.ThoiGianKetThuc,GETDATE())>l.KetThucDuKien
                        THEN DATEDIFF(minute,l.KetThucDuKien,COALESCE(cc.ThoiGianRa,ca.ThoiGianKetThuc,GETDATE()))
                        ELSE 0 END AS SoPhutOT,
                   CASE WHEN cc.ThoiGianRaDuocDuyet>l.KetThucDuKien
                        THEN DATEDIFF(minute,
                            CASE WHEN cc.ThoiGianVaoDuocDuyet>l.KetThucDuKien
                                 THEN cc.ThoiGianVaoDuocDuyet ELSE l.KetThucDuKien END,
                            cc.ThoiGianRaDuocDuyet)
                        ELSE 0 END AS SoPhutOTTinhLuong
            FROM LichLamViec l
            JOIN NhanVien nv ON nv.MaNV=l.MaNV
            JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
            LEFT JOIN ChamCong cc ON cc.MaLich=l.MaLich
            OUTER APPLY (
                SELECT TOP 1 ca.MaCa,ca.TrangThai,ca.ThoiGianKetThuc
                FROM CaLamViec ca
                WHERE ca.MaNV=l.MaNV AND (
                    ca.MaLich=l.MaLich
                    OR CONVERT(date,ca.ThoiGianBatDau)=l.NgayLam
                )
                ORDER BY ca.ThoiGianBatDau DESC
            ) ca
            WHERE l.NgayLam BETWEEN @From AND @To AND l.TrangThai=N'Đã công bố'
            ORDER BY l.NgayLam,lc.ThuTu,nv.TenNV`);
        res.json({ items: result.recordset, serverTime: new Date().toISOString() });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải bảng chấm công.' });
    }
};

const approveAttendance = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) throw new Error('Mã chấm công không hợp lệ.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction).input('Id', sql.BigInt, id).query(`
            SELECT cc.*,l.MaNV,l.BatDauDuKien,l.KetThucDuKien,
                   CONVERT(varchar(5),lc.GioNghiBatDau,108) GioNghiBatDau,
                   CONVERT(varchar(5),lc.GioNghiKetThuc,108) GioNghiKetThuc
            FROM ChamCong cc
            JOIN LichLamViec l ON l.MaLich=cc.MaLich
            JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
            WHERE cc.MaChamCong=@Id`);
        if (!current.recordset.length) throw new Error('Không tìm thấy lượt chấm công.');
        const row = current.recordset[0];
        if (row.TrangThai === 'Đã duyệt') throw new Error('Lượt chấm công này đã được duyệt trước đó.');
        // Giờ thực tế là dữ liệu đối chiếu, không cho màn duyệt âm thầm sửa lại.
        const actualStart = new Date(row.ThoiGianVao);
        const actualEnd = new Date(row.ThoiGianRa);
        const scheduledStart = new Date(row.BatDauDuKien);
        const scheduledEnd = new Date(row.KetThucDuKien);
        if (![actualStart, actualEnd, scheduledStart, scheduledEnd].every(value => Number.isFinite(value.getTime())) || actualEnd <= actualStart) {
            throw new Error('Khoảng thời gian chấm công hoặc lịch ca không hợp lệ.');
        }
        const includeOvertime = req.body.TinhTangCa === true;
        const managerNote = clean(req.body.GhiChu, 220);
        if (includeOvertime && !managerNote) throw new Error('Duyệt có tính tăng ca bắt buộc phải ghi lý do hoặc nội dung phân công tăng ca.');

        const actualMinutes = Math.round((actualEnd - actualStart) / 60000);
        const overtimeActual = Math.max(0, Math.round((actualEnd - scheduledEnd) / 60000));
        const requestedOvertimeMinutes = Number(req.body.SoPhutTangCaDuocDuyet);
        if (includeOvertime && (!Number.isInteger(requestedOvertimeMinutes) || requestedOvertimeMinutes <= 0)) {
            throw new Error('Hãy nhập số phút tăng ca được Quản lý duyệt.');
        }
        if (includeOvertime && requestedOvertimeMinutes > overtimeActual) {
            throw new Error(`Số phút tăng ca được duyệt không được vượt quá ${overtimeActual} phút thực tế ngoài ca.`);
        }

        const start = new Date(Math.max(actualStart.getTime(), scheduledStart.getTime()));
        const requestedEnd = includeOvertime
            ? new Date(Math.min(actualEnd.getTime(), scheduledEnd.getTime() + requestedOvertimeMinutes * 60000))
            : new Date(Math.min(actualEnd.getTime(), scheduledEnd.getTime()));
        const end = requestedEnd > start ? requestedEnd : new Date(start);
        const clockMinutes = Math.round((end - start) / 60000);
        if (includeOvertime && clockMinutes > 16 * 60) {
            throw new Error('Khoảng thời gian có tính tăng ca không được vượt quá 16 giờ. Hãy kiểm tra lại giờ ra thực tế.');
        }
        const paid = splitDayNightMinutes(start, end, null, null, {
            GioNghiBatDau: row.GioNghiBatDau, GioNghiKetThuc: row.GioNghiKetThuc
        });
        const approvedMinutes = paid.day + paid.night;
        const overtimeStart = new Date(Math.max(start.getTime(), scheduledEnd.getTime()));
        const overtimePaid = end > overtimeStart
            ? splitDayNightMinutes(overtimeStart, end, null, null, {
                GioNghiBatDau: row.GioNghiBatDau, GioNghiKetThuc: row.GioNghiKetThuc
            })
            : { day: 0, night: 0 };
        const approvedOvertime = overtimePaid.day + overtimePaid.night;
        const systemNote = includeOvertime
            ? `Có tính tăng ca ${approvedOvertime} phút theo xác nhận của Quản lý.`
            : `Duyệt theo ca đã phân; không tính ${overtimeActual} phút sau giờ kết thúc ca.`;
        const approvalNote = [systemNote, managerNote].filter(Boolean).join(' ');
        await new sql.Request(transaction).input('Id', sql.BigInt, id)
            // msnodesqlv8 có thể dịch Date thêm/mất 7 giờ khi ghi lại; truyền chuỗi giờ địa phương để giữ đúng giờ cửa hàng.
            .input('Start', sql.VarChar, localSqlDateTime(start)).input('End', sql.VarChar, localSqlDateTime(end))
            .input('Minutes', sql.Int, approvedMinutes).input('NguoiDuyet', sql.VarChar, req.user.MaNV)
            .input('GhiChu', sql.NVarChar, approvalNote).query(`
                UPDATE ChamCong SET ThoiGianVaoDuocDuyet=CONVERT(datetime,@Start,121),
                    ThoiGianRaDuocDuyet=CONVERT(datetime,@End,121),
                    SoPhutDuocDuyet=@Minutes,NguoiDuyet=@NguoiDuyet,GhiChu=@GhiChu,
                    NgayDuyet=GETDATE(),TrangThai=N'Đã duyệt'
                WHERE MaChamCong=@Id`);
        await new sql.Request(transaction).input('MaTK', sql.Int, req.user.MaTK)
            .input('MaBanGhi', sql.VarChar, String(id))
            .input('NoiDung', sql.NVarChar, `Duyệt ${approvedMinutes}/${actualMinutes} phút thực tế cho ${row.MaNV}; ${includeOvertime ? `có ${approvedOvertime} phút tăng ca tính lương` : 'không tính tăng ca'}`)
            .query(`INSERT NhatKy(MaTK,HanhDong,BangLienQuan,MaBanGhi,NoiDung,ThoiGian)
                    VALUES(@MaTK,N'Duyệt chấm công',N'ChamCong',@MaBanGhi,@NoiDung,GETDATE())`);
        await transaction.commit();
        res.json({
            message: includeOvertime
                ? `Đã duyệt ${approvedMinutes} phút, gồm ${approvedOvertime} phút tăng ca tính lương.`
                : `Đã duyệt ca với ${approvedMinutes} phút tính lương; ${overtimeActual} phút sau ca không tính lương.`,
            SoPhutThucTe: actualMinutes,
            SoPhutDuocDuyet: approvedMinutes,
            SoPhutTangCaDuocTinh: approvedOvertime,
            TinhTangCa: includeOvertime
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const getPayrollPreview = async (req, res) => {
    try {
        const month = clean(req.query.month, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ message: 'Tháng tính lương không hợp lệ.' });
        const pool = await poolPromise;
        const rows = await pool.request().input('Month', sql.VarChar, month).query(`
            SELECT nv.MaNV,nv.TenNV,nv.ChucVu,l.MaLich,l.NgayLam,lc.SoGio,cc.ThoiGianVao,cc.ThoiGianRa,
                   cc.ThoiGianVaoDuocDuyet,cc.ThoiGianRaDuocDuyet,cc.SoPhutDuocDuyet,
                   cc.TrangThai TrangThaiChamCong,
                   CONVERT(varchar(5),lc.GioNghiBatDau,108) GioNghiBatDau,
                   CONVERT(varchar(5),lc.GioNghiKetThuc,108) GioNghiKetThuc,
                   COALESCE(ml.LuongGio,55000) LuongGio,COALESCE(ml.HeSoBanDem,1.30) HeSoBanDem
            FROM NhanVien nv
            LEFT JOIN LichLamViec l ON l.MaNV=nv.MaNV AND CONVERT(char(7),l.NgayLam,120)=@Month AND l.TrangThai=N'Đã công bố'
            LEFT JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
            LEFT JOIN ChamCong cc ON cc.MaLich=l.MaLich
            OUTER APPLY (SELECT TOP 1 LuongGio,HeSoBanDem FROM MucLuongNhanVien
                         WHERE MaNV=nv.MaNV AND NgayHieuLuc<=ISNULL(l.NgayLam,EOMONTH(CONVERT(date,@Month+'-01')))
                         ORDER BY NgayHieuLuc DESC) ml
            WHERE nv.ChucVu IN (N'Thu ngân', N'Nhân viên mua hàng', N'Thủ kho', N'Kế toán')
              AND nv.TrangThai=N'Đang làm việc'
            ORDER BY CASE nv.ChucVu WHEN N'Thu ngân' THEN 1 ELSE 0 END, nv.MaNV,l.NgayLam`);
        const summary = new Map();
        for (const row of rows.recordset) {
            if (!summary.has(row.MaNV)) summary.set(row.MaNV, { MaNV: row.MaNV, TenNV: row.TenNV, ChucVu: row.ChucVu, SoCa: 0,
                GioLich: 0, GioNgay: 0, GioDem: 0, LuongTamTinh: 0, CaThieuChamCong: 0 });
            const item = summary.get(row.MaNV);
            if (!row.MaLich) continue;
            item.SoCa += 1; item.GioLich += Number(row.SoGio || 0);
            if (!row.ThoiGianVao || row.TrangThaiChamCong !== 'Đã duyệt') { item.CaThieuChamCong += 1; continue; }
            const end = row.ThoiGianRaDuocDuyet ? new Date(row.ThoiGianRaDuocDuyet)
                : row.ThoiGianRa ? new Date(row.ThoiGianRa) : new Date();
            const start = row.ThoiGianVaoDuocDuyet ? new Date(row.ThoiGianVaoDuocDuyet) : new Date(row.ThoiGianVao);
            if (end <= start) continue;
            let segments = splitDayNightMinutes(start, end, null, null, {
                GioNghiBatDau: row.GioNghiBatDau, GioNghiKetThuc: row.GioNghiKetThuc
            });
            if (row.SoPhutDuocDuyet != null) {
                const total = segments.day + segments.night || 1;
                const ratio = Number(row.SoPhutDuocDuyet) / total;
                segments = { day: Math.round(segments.day * ratio), night: Math.round(segments.night * ratio) };
            }
            item.GioNgay += segments.day / 60; item.GioDem += segments.night / 60;
            item.LuongTamTinh += segments.day / 60 * Number(row.LuongGio)
                + segments.night / 60 * Number(row.LuongGio) * Number(row.HeSoBanDem);
        }
        res.json({ month, items: [...summary.values()].map(item => ({ ...item,
            GioLich: Number(item.GioLich.toFixed(2)),GioNgay:Number(item.GioNgay.toFixed(2)),
            GioDem:Number(item.GioDem.toFixed(2)),LuongTamTinh:Math.round(item.LuongTamTinh) })) });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Không thể tổng hợp công và lương tạm tính.' }); }
};

module.exports = {
    getSetup, getSchedules, autoSchedule, saveSchedule, deleteSchedule, publishSchedules,
    getAttendance, approveAttendance, getPayrollPreview
};
