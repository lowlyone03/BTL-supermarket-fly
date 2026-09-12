const { sql, poolPromise } = require('../config/db');
const { closeOpenAttendance } = require('../services/attendanceSync');
const { calculateGrossProfit, RESTOCK_ACCEPTED_SQL, expectedDrawerCash, cashHandoverExcludingOpening, dongTmThuan, qrNet } = require('../services/financialRules');
const { ensureReturnRefundSchema } = require('../services/returnRefundSchema');
const { validateClosingCash, validateCloseShiftConfirm, validateCheckOutConfirm } = require('../services/fieldValidators');
const { logAudit } = require('../services/auditLog');
const { snapshotDuty, assertCashierDuty, assertOwnerCloseShift, CashierDutyError, GRACE_AFTER_MINUTES, isBoostDuty, isOfficeShift } = require('../services/cashierDuty');
const { loadUnfinishedReturns, loadLeftoverReturns, healParkedReturns, handoverApprovedReturns, handoverAuditMessage, claimLeftoverReturnsForShift, describeReturnHandover, ensureReturnHandoverSchema } = require('../services/returnHandover');
const { reopenShift: reopenClosedShift, ShiftReopenError } = require('../services/shiftReopen');

const publicDuty = (duty) => {
    if (!duty) return null;
    const schedule = duty.schedule ? {
        MaLich: duty.schedule.MaLich,
        TenCa: duty.schedule.TenCa,
        NgayLam: duty.schedule.NgayLam,
        GioBatDau: duty.schedule.GioBatDau,
        GioKetThuc: duty.schedule.GioKetThuc,
        NhiemVu: duty.schedule.NhiemVu,
        ViTri: duty.schedule.ViTri
    } : null;
    return {
        graceMinutes: duty.graceMinutes,
        status: duty.status,
        message: duty.message,
        schedule,
        canCheckIn: duty.canCheckIn,
        canCheckOut: duty.canCheckOut,
        canOpenShift: duty.canOpenShift,
        canSell: duty.canSell,
        canCompleteReturn: duty.canCompleteReturn,
        canCloseShift: duty.canCloseShift,
        graceAfterMinutes: duty.graceAfterMinutes || GRACE_AFTER_MINUTES,
        staleOpenShift: Boolean(duty.staleOpenShift),
        recovery: duty.openShift ? 'close-shift' : (duty.openAttendance ? 'check-out' : null),
        openAttendance: duty.openAttendance ? {
            MaLich: duty.openAttendance.MaLich,
            TenCa: duty.openAttendance.TenCa,
            NgayLam: duty.openAttendance.NgayLam,
            GioBatDau: duty.openAttendance.GioBatDau,
            GioKetThuc: duty.openAttendance.GioKetThuc,
            MaQuay: duty.openAttendance.MaQuay
        } : null,
        openShift: duty.openShift ? { MaCa: duty.openShift.MaCa, MaLich: duty.openShift.MaLich, MaQuay: duty.openShift.MaQuay } : null
    };
};

const failDuty = (res, error) => res.status(error.status || 400).json({
    message: error.message,
    code: error.code,
    recovery: error.recovery,
    MaCa: error.MaCa,
    stale: error.stale,
    duty: error.duty ? publicDuty(error.duty) : undefined
});

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
        res.json({ current: current.recordset[0] || null, items: history.recordset, duty: publicDuty(await snapshotDuty(pool, req.user.MaNV)) });
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
            WHERE l.MaNV=@MaNV AND l.TrangThai=N'Đã công bố'
              AND (
                    l.NgayLam BETWEEN DATEADD(day,-7,CONVERT(date,GETDATE()))
                                  AND DATEADD(day,31,CONVERT(date,GETDATE()))
                 OR (cc.ThoiGianVao IS NOT NULL AND cc.ThoiGianRa IS NULL)
                 OR EXISTS (
                        SELECT 1 FROM CaLamViec ca
                        WHERE ca.MaNV=l.MaNV AND ca.MaLich=l.MaLich
                          AND ca.TrangThai=N'Đang mở' AND ca.ThoiGianKetThuc IS NULL
                    )
              )
            ORDER BY l.NgayLam,lc.ThuTu`);
        const todayKey = (await pool.request().query(`SELECT CONVERT(varchar(10),GETDATE(),23) HomNay`)).recordset[0].HomNay;
        const openItem = result.recordset.find(item => item.ThoiGianVao && !item.ThoiGianRa) || null;
        const todayScheduled = result.recordset.find(item => item.NgayLam === todayKey) || null;
        const dutySnapshot = await snapshotDuty(pool, req.user.MaNV);
        const leftoverLich = dutySnapshot.staleOpenShift || dutySnapshot.status === 'stale_session'
            ? Number(dutySnapshot.schedule?.MaLich || dutySnapshot.openShift?.MaLich || 0)
            : 0;
        const leftoverItem = leftoverLich
            ? result.recordset.find(item => Number(item.MaLich) === leftoverLich) || null
            : null;
        const today = leftoverItem || openItem || todayScheduled || null;
        const nextShift = result.recordset.find(item => String(item.NgayLam) > todayKey) || null;
        const publishedCount = result.recordset.length;
        const duty = publicDuty(dutySnapshot);
        res.json({ today, todayKey, todayScheduled, nextShift, publishedCount, items: result.recordset, duty });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Không thể tải lịch làm việc cá nhân.' }); }
};

const checkIn = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const { schedule: item } = await assertCashierDuty(transaction, req.user.MaNV, 'check-in');
        if (item.ThoiGianVao) throw new CashierDutyError('Bạn đã chấm công vào ca này.', 400);
        await new sql.Request(transaction).input('MaLich', sql.BigInt, item.MaLich)
            .input('BatDau', sql.DateTime, item.BatDauDuKien).query(`
            MERGE ChamCong AS target USING (SELECT @MaLich MaLich) source ON target.MaLich=source.MaLich
            WHEN MATCHED THEN UPDATE SET ThoiGianVao=GETDATE(),TrangThai=N'Đang làm việc',
                PhutDiMuon=CASE WHEN GETDATE()>@BatDau THEN DATEDIFF(minute,@BatDau,GETDATE()) ELSE 0 END
            WHEN NOT MATCHED THEN INSERT (MaLich,ThoiGianVao,TrangThai,PhutDiMuon)
                VALUES (@MaLich,GETDATE(),N'Đang làm việc',
                    CASE WHEN GETDATE()>@BatDau THEN DATEDIFF(minute,@BatDau,GETDATE()) ELSE 0 END);`);
        await transaction.commit();
        res.json({ message: `Đã chấm công vào ${item.TenCa} (${String(item.GioBatDau || '').slice(0, 5)}–${String(item.GioKetThuc || '').slice(0, 5)}).`, MaLich: item.MaLich });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        failDuty(res, error);
    }
};

const checkOut = async (req, res) => {
    try {
        const confirmed = validateCheckOutConfirm(req.body?.XacNhan);
        if (!confirmed.ok) throw new Error(confirmed.message);
        const pool = await poolPromise;
        await assertCashierDuty(pool, req.user.MaNV, 'check-out');
        const result = await pool.request().input('MaNV', sql.VarChar, req.user.MaNV).query(`
            UPDATE cc SET ThoiGianRa=GETDATE(),TrangThai=N'Chờ duyệt',
                PhutVeSom=CASE WHEN GETDATE()<l.KetThucDuKien THEN DATEDIFF(minute,GETDATE(),l.KetThucDuKien) ELSE 0 END
            FROM ChamCong cc JOIN LichLamViec l ON l.MaLich=cc.MaLich
            WHERE l.MaNV=@MaNV AND cc.ThoiGianVao IS NOT NULL AND cc.ThoiGianRa IS NULL`);
        if (!result.rowsAffected[0]) return res.status(400).json({ message: 'Không có lượt chấm công đang mở.' });
        try {
            const telegramNotify = require('../services/telegramNotify');
            telegramNotify.notifySafely(() => telegramNotify.notifyAttendancePending({ MaNV: req.user.MaNV }));
        } catch { /* Telegram lỗi không làm fail chấm công */ }
        res.json({ message: 'Đã chấm công ra. Thời gian làm việc đang chờ Quản lý duyệt.' });
    } catch (error) {
        if (error instanceof CashierDutyError) return failDuty(res, error);
        console.error(error);
        res.status(400).json({ message: error.message });
    }
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
        await ensureReturnHandoverSchema(transaction);
        await healParkedReturns(transaction);
        let schedule;
        try {
            ({ schedule } = await assertCashierDuty(transaction, req.user.MaNV, 'open-shift'));
        } catch (error) {
            const duty = await snapshotDuty(transaction, req.user.MaNV);
            const current = duty.schedule;
            const leftover = await loadLeftoverReturns(transaction, { maNV: req.user.MaNV });
            const canBoostTakeLeftover = error instanceof CashierDutyError
                && current
                && !isOfficeShift(current)
                && isBoostDuty(current)
                && leftover.length
                && (current.MaQuay || leftover[0].MaQuayXuLy);
            if (!canBoostTakeLeftover) throw error;
            schedule = { ...current, MaQuay: current.MaQuay || leftover[0].MaQuayXuLy };
        }
        if (!schedule.ThoiGianVao || schedule.ThoiGianRa) {
            throw new CashierDutyError('Hãy vào Lịch làm việc và nhấn Chấm công vào trước khi mở ca bán hàng.', 400);
        }
        const mainShiftDuties = new Set(['Ca chính full-time', 'Thu ngân']);
        if (!mainShiftDuties.has(schedule.NhiemVu) && !isBoostDuty(schedule)) {
            throw new CashierDutyError('Hôm nay bạn được phân công tăng cường part-time, không phụ trách mở quầy thu ngân.', 400);
        }
        if (isBoostDuty(schedule)) {
            const leftover = await loadLeftoverReturns(transaction, { maNV: req.user.MaNV });
            if (!leftover.length) {
                throw new CashierDutyError('Tăng cường chỉ mở quầy khi có phiếu đổi trả sót ca trước tại quầy.', 400);
            }
            schedule = { ...schedule, MaQuay: schedule.MaQuay || leftover[0].MaQuayXuLy };
        }
        const assignment = { recordset: [schedule] };
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
        const claimed = await claimLeftoverReturnsForShift(transaction, {
            maNV: req.user.MaNV,
            maQuay: assignment.recordset[0].MaQuay,
            maCa: MaCa
        });
        for (const row of claimed) {
            const history = describeReturnHandover({
                openerMaNV: row.MaNV_Lap,
                openerName: row.NguoiLap,
                openerAt: row.NgayLap,
                parkedAt: row.NgayBanGiao,
                claimerMaNV: req.user.MaNV,
                claimerName: req.user.TenNV,
                claimerAt: row.NgayTiepNhan || new Date(),
                customerName: row.TenKH
            });
            await logAudit(transaction, {
                user: req.user, req, action: 'Tiếp nhận đổi trả', table: 'PhieuDoiTra',
                recordId: row.MaDT, uc: 'UC26', severity: 'Quan trọng', content: history
            });
        }
        await transaction.commit();
        const leftoverNote = claimed.length
            ? ` Đã tự tiếp nhận ${claimed.length} phiếu đổi trả sót từ ca trước tại quầy — không chờ người cũ. Vào Đổi trả để làm tiếp.`
            : '';
        res.status(201).json({
            message: `Đã mở ca ${MaCa}. Bạn có thể bắt đầu bán hàng.${leftoverNote}`,
            MaCa,
            leftoverReturns: claimed.map(row => row.MaDT),
            leftoverFromPreviousShift: claimed.length,
            claimedReturns: claimed.map(row => row.MaDT),
            receivedFromPreviousShift: claimed.length
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        const message = error instanceof CashierDutyError
            ? error.message
            : error.message.includes('UX_CaLamViec_Quay_DangMo')
                ? 'Quầy được phân công đang có Thu ngân khác mở ca.'
                : error.message;
        res.status(error.status || 400).json({ message, duty: error.duty ? publicDuty(error.duty) : undefined });
    }
};

const getShiftSummary = async (source, maCa, lock = false) => {
    await ensureReturnRefundSchema(source).catch(() => {});
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
        -- Doanh thu TM ca = dòng Thành công trên HĐ Hoàn thành (đã trừ dòng Thu chênh đổi hàng).
        -- Hủy thanh toán (nhánh A): HĐ → Đã hủy + đảo TM → Đã hủy → 300k không vào TongTienMat / két dự kiến.
        -- Không dùng GiaoDichHoan cho hủy phiên — đó là trả hàng sau Hoàn thành.
        SELECT
          COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Tiền mặt' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TongTienMat,
          COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'QR' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TongTienQR,
          COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Thẻ' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TongTienThe,
          COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Chuyển khoản' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END),0) TongTienChuyenKhoan
        FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
        WHERE hd.MaCa=@MaCa AND hd.TrangThai=N'Hoàn thành'
          AND (tt.GhiChu IS NULL OR tt.GhiChu NOT LIKE N'Thu chênh đổi hàng%')`);
    const refunds = await next().input('MaCa', sql.VarChar, maCa).query(`
        WITH ChiTietDoiTraTheoPhieu AS (
            SELECT ct.MaDT,
                   SUM(CASE WHEN ct.LoaiDong=N'Hàng khách trả' THEN ct.ThanhTienVon ELSE 0 END) GiaVonHangTra,
                   SUM(CASE WHEN ct.LoaiDong=N'Hàng giao đổi' THEN ct.ThanhTienVon ELSE 0 END) GiaVonHangGiaoDoi
            FROM ChiTietDoiTra ct GROUP BY ct.MaDT
        )
        SELECT COALESCE((
                    SELECT SUM(gd.SoTienHoan) FROM GiaoDichHoan gd
                    JOIN PhieuDoiTra p ON p.MaDT=gd.MaPhieuTra
                    WHERE gd.TrangThaiHoan=N'THANH_CONG'
                      AND (gd.PhuongThuc=N'Tiền mặt' OR (gd.PhuongThuc IS NULL AND p.PhuongThucHoan=N'Tiền mặt'))
                      AND (p.MaCaHoan=@MaCa OR (p.MaCaHoan IS NULL AND COALESCE(gd.NgayHoanThanh,p.NgayHoan) BETWEEN
                          (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
                          AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))
               ),0) + COALESCE((
                    SELECT SUM(p.SoTienHoan) FROM PhieuDoiTra p
                    WHERE p.TrangThai=N'Hoàn thành' AND p.PhuongThucHoan=N'Tiền mặt'
                      AND NOT EXISTS (SELECT 1 FROM GiaoDichHoan gd WHERE gd.MaPhieuTra=p.MaDT)
                      AND (p.MaCaHoan=@MaCa OR (p.MaCaHoan IS NULL AND p.NgayHoan BETWEEN
                          (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
                          AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))
               ),0) TongTienHoanMat,
               COALESCE((
                    SELECT SUM(gd.SoTienHoan) FROM GiaoDichHoan gd
                    JOIN PhieuDoiTra p ON p.MaDT=gd.MaPhieuTra
                    WHERE gd.TrangThaiHoan=N'THANH_CONG'
                      AND (gd.PhuongThuc=N'QR' OR (gd.PhuongThuc IS NULL AND p.PhuongThucHoan=N'QR'))
                      AND (p.MaCaHoan=@MaCa OR (p.MaCaHoan IS NULL AND COALESCE(gd.NgayHoanThanh,p.NgayHoan) BETWEEN
                          (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
                          AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))
               ),0) + COALESCE((
                    SELECT SUM(p.SoTienHoan) FROM PhieuDoiTra p
                    WHERE p.TrangThai=N'Hoàn thành' AND p.PhuongThucHoan=N'QR'
                      AND NOT EXISTS (SELECT 1 FROM GiaoDichHoan gd WHERE gd.MaPhieuTra=p.MaDT)
                      AND (p.MaCaHoan=@MaCa OR (p.MaCaHoan IS NULL AND p.NgayHoan BETWEEN
                          (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
                          AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))
               ),0) TongTienHoanQR,
               COALESCE((
                    SELECT SUM(dt.SoTienThuThem) FROM PhieuDoiTra dt
                    WHERE dt.PhuongThucThuThem=N'Tiền mặt' AND dt.SoTienThuThem>0
                      AND (dt.MaCaHoan=@MaCa OR (dt.MaCaHoan IS NULL AND dt.NgayHoan BETWEEN
                          (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
                          AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))
               ),0) TongTienThuThemMat,
               COALESCE((
                    SELECT SUM(dt.SoTienThuThem) FROM PhieuDoiTra dt
                    WHERE dt.PhuongThucThuThem=N'QR' AND dt.SoTienThuThem>0
                      AND (dt.MaCaHoan=@MaCa OR (dt.MaCaHoan IS NULL AND dt.NgayHoan BETWEEN
                          (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
                          AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))
               ),0) TongTienThuThemQR,
               COALESCE((
                    SELECT SUM(gd.SoTienHoan) FROM GiaoDichHoan gd
                    JOIN PhieuDoiTra p ON p.MaDT=gd.MaPhieuTra
                    WHERE gd.TrangThaiHoan=N'THANH_CONG'
                      AND (p.MaCaHoan=@MaCa OR (p.MaCaHoan IS NULL AND COALESCE(gd.NgayHoanThanh,p.NgayHoan) BETWEEN
                          (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
                          AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))
               ),0) + COALESCE((
                    SELECT SUM(p.SoTienHoan) FROM PhieuDoiTra p
                    WHERE p.TrangThai=N'Hoàn thành'
                      AND NOT EXISTS (SELECT 1 FROM GiaoDichHoan gd WHERE gd.MaPhieuTra=p.MaDT)
                      AND (p.MaCaHoan=@MaCa OR (p.MaCaHoan IS NULL AND p.NgayHoan BETWEEN
                          (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
                          AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))
               ),0) TienHoan,
               COALESCE((
                    SELECT SUM(CASE WHEN ${RESTOCK_ACCEPTED_SQL} THEN ct.GiaVonHangTra ELSE 0 END)
                    FROM PhieuDoiTra dt
                    LEFT JOIN ChiTietDoiTraTheoPhieu ct ON ct.MaDT=dt.MaDT
                    WHERE dt.TrangThai=N'Hoàn thành'
                      AND (dt.MaCaHoan=@MaCa OR (dt.MaCaHoan IS NULL AND dt.NgayHoan BETWEEN
                          (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
                          AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))
               ),0) GiaVonHangTraNhapLai,
               COALESCE((
                    SELECT SUM(ct.GiaVonHangGiaoDoi)
                    FROM PhieuDoiTra dt
                    LEFT JOIN ChiTietDoiTraTheoPhieu ct ON ct.MaDT=dt.MaDT
                    WHERE dt.TrangThai=N'Hoàn thành'
                      AND (dt.MaCaHoan=@MaCa OR (dt.MaCaHoan IS NULL AND dt.NgayHoan BETWEEN
                          (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
                          AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))
               ),0) GiaVonHangGiaoDoi
        FROM (SELECT 1 n) dummy`);
    const invoices = await next().input('MaCa', sql.VarChar, maCa).query(`
        SELECT COUNT(*) SoHoaDon,
               COALESCE(SUM(CASE WHEN TrangThai=N'Hoàn thành' THEN TongThanhToan ELSE 0 END),0) DoanhThu,
               SUM(CASE WHEN TrangThai=N'Nháp' THEN 1 ELSE 0 END) HoaDonNhap
        FROM HoaDon WHERE MaCa=@MaCa`);
    const pending = await next().input('MaCa', sql.VarChar, maCa).query(`
        SELECT COUNT(*) Tong FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
        WHERE hd.MaCa=@MaCa AND tt.TrangThai=N'Chờ xác nhận' AND hd.TrangThai=N'Nháp'`);
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
    summary.TongTienMat = Number(summary.TongTienMat || 0) + Number(summary.TongTienThuThemMat || 0);
    summary.TongTienQR = Number(summary.TongTienQR || 0) + Number(summary.TongTienThuThemQR || 0);
    summary.TongTienHoanQR = Number(summary.TongTienHoanQR || 0);
    summary.TienMatHeThong = dongTmThuan({
        TongTienMat: summary.TongTienMat,
        TongTienHoanMat: summary.TongTienHoanMat
    });
    summary.DongTmThuan = summary.TienMatHeThong;
    summary.QrRong = qrNet({
        TongTienQR: summary.TongTienQR,
        TongTienHoanQR: summary.TongTienHoanQR
    });
    summary.TienMatTrongKet = expectedDrawerCash({
        TienDauCa: summary.TienDauCa,
        TongTienMat: summary.TongTienMat,
        TongTienHoanMat: summary.TongTienHoanMat
    });
    const profit = calculateGrossProfit({
        DoanhThuHoaDon: summary.DoanhThu,
        TienHoan: summary.TienHoan,
        GiaVonHoaDon: summary.GiaVonHoaDon,
        GiaVonHangTraNhapLai: summary.GiaVonHangTraNhapLai,
        GiaVonHangGiaoDoi: summary.GiaVonHangGiaoDoi
    });
    Object.assign(summary, profit, { GiaVon: profit.GiaVonHangBanThuan });
    try {
        const pendingReturns = await next().input('MaNV', sql.VarChar, summary.MaNV).query(`
            SELECT dt.MaDT, dt.MaHD, dt.HinhThucXuLy, dt.SoTienHoan, dt.NgayBanGiao, dt.TrangThai
            FROM PhieuDoiTra dt
            WHERE dt.TrangThai IN (N'Nháp', N'Chờ kiểm tra', N'Chờ duyệt', N'Đã duyệt', N'Đang hoàn tiền', N'Hoàn tiền thất bại', N'Chờ xử lý hoàn tiền')
              AND dt.NgayHoan IS NULL
              AND COALESCE(dt.MaNV_XuLy, dt.MaNV_Lap)=@MaNV
            ORDER BY CASE dt.TrangThai
                       WHEN N'Đã duyệt' THEN 0 WHEN N'Chờ duyệt' THEN 1
                       WHEN N'Chờ kiểm tra' THEN 2 ELSE 3 END, dt.NgayLap`);
        summary.pendingUnfinishedReturns = pendingReturns.recordset;
        summary.pendingApprovedReturns = pendingReturns.recordset.filter(row => row.TrangThai === 'Đã duyệt');
    } catch (error) {
        if (!/Invalid column name|MaNV_XuLy/i.test(error.message || '')) throw error;
        summary.pendingApprovedReturns = [];
        summary.pendingUnfinishedReturns = [];
    }
    return summary;
};

const loadCurrentShiftSummary = async (pool, user) => {
        const current = await pool.request().input('MaNV', sql.VarChar, user.MaNV)
            .query(`SELECT TOP 1 MaCa FROM CaLamViec WHERE MaNV=@MaNV AND TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL ORDER BY ThoiGianBatDau DESC`);
        if (!current.recordset.length) return { open: false };
        return { open: true, summary: await getShiftSummary(pool, current.recordset[0].MaCa) };
};

const getCurrentShiftSummary = async (req, res) => {
    try {
        const pool = await poolPromise;
        const snapshot = await loadCurrentShiftSummary(pool, req.user);
        if (!snapshot.open) return res.status(404).json({ message: 'Bạn chưa có ca bán hàng đang mở.' });
        res.json(snapshot.summary);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

const closeShift = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const counted = validateClosingCash(req.body.TienCuoiCa);
        if (!counted.ok) throw new Error(counted.message);
        const confirmed = validateCloseShiftConfirm(req.body.XacNhan);
        if (!confirmed.ok) throw new Error(confirmed.message);
        const TienCuoiCa = counted.value;
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const lookup = await new sql.Request(transaction).input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT MaCa FROM CaLamViec WITH (UPDLOCK,HOLDLOCK)
                    WHERE MaNV=@MaNV AND TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL`);
        if (!lookup.recordset.length) throw new Error('Bạn không có ca bán hàng đang mở.');
        const maCa = lookup.recordset[0].MaCa;
        const duty = await snapshotDuty(transaction, req.user.MaNV);
        assertOwnerCloseShift(duty, maCa);
        const summary = await getShiftSummary(transaction, maCa, true);
        if (Number(summary.HoaDonNhap || 0) > 0) throw new Error('Ca còn hóa đơn nháp. Hãy hoàn thành hoặc hủy trước khi đóng ca.');
        if (Number(summary.ThanhToanChoXacNhan || 0) > 0) throw new Error('Ca còn thanh toán chờ xác nhận.');
        const pendingUnfinished = await loadUnfinishedReturns(transaction, { maNV: req.user.MaNV });
        const handover = pendingUnfinished.length
            ? await handoverApprovedReturns(transaction, {
                fromMaNV: req.user.MaNV,
                maQuay: summary.MaQuay,
                fromMaCa: maCa,
                afterTime: new Date()
            })
            : { handed: [], warning: null };
        for (const ticket of handover.handed || []) {
            await logAudit(transaction, {
                user: req.user, req, action: 'Bàn giao đổi trả', table: 'PhieuDoiTra',
                recordId: ticket.MaDT, uc: 'UC26', severity: 'Quan trọng',
                content: handoverAuditMessage(maCa, 'ca sau cùng quầy')
            });
        }
        const tienThucNop = cashHandoverExcludingOpening(TienCuoiCa, summary.TienDauCa);
        await new sql.Request(transaction).input('MaCa', sql.VarChar, maCa)
            .input('TienCuoiCa', sql.Decimal(18, 2), TienCuoiCa)
            .input('TongTienMat', sql.Decimal(18, 2), summary.TongTienMat)
            .input('TongTienQR', sql.Decimal(18, 2), summary.TongTienQR)
            .input('TongTienThe', sql.Decimal(18, 2), summary.TongTienThe)
            .input('TongTienChuyenKhoan', sql.Decimal(18, 2), summary.TongTienChuyenKhoan)
            .input('TongTienHoanMat', sql.Decimal(18, 2), summary.TongTienHoanMat)
            .input('TongTienHoanQR', sql.Decimal(18, 2), summary.TongTienHoanQR || 0)
            .input('TienMatHeThong', sql.Decimal(18, 2), summary.TienMatHeThong)
            .input('TienThucNop', sql.Decimal(18, 2), tienThucNop).query(`
                UPDATE CaLamViec SET ThoiGianKetThuc=GETDATE(),NgayDongCa=GETDATE(),TienCuoiCa=@TienCuoiCa,
                    TongTienMat=@TongTienMat,TongTienQR=@TongTienQR,TongTienThe=@TongTienThe,
                    TongTienChuyenKhoan=@TongTienChuyenKhoan,TongTienHoanMat=@TongTienHoanMat,
                    TongTienHoanQR=@TongTienHoanQR,
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
        try {
            const telegramNotify = require('../services/telegramNotify');
            telegramNotify.notifySafely(() => telegramNotify.notifyShiftClosed({
                MaCa: maCa,
                MaNV: req.user.MaNV,
                TenNV: req.user.TenNV,
                MaQuay: summary.MaQuay,
                TienMatHeThong: summary.TienMatHeThong,
                TienThucNop: tienThucNop,
                ChenhLech: tienThucNop - summary.TienMatHeThong
            }));
            telegramNotify.notifySafely(() => telegramNotify.notifyAttendancePending({ MaNV: req.user.MaNV }));
        } catch { /* Telegram lỗi không làm fail đóng ca */ }
        const warning = handover.warning;
        res.json({
            message: warning
                ? `Đã đóng ca ${maCa}. Không thể bán hàng cho đến khi mở ca mới. ${warning} Đã chấm công ra theo giờ chốt ca. Ca đang chờ Kế toán đối soát.`
                : `Đã đóng ca ${maCa}. Không thể bán hàng cho đến khi mở ca mới. Đã chấm công ra theo giờ chốt ca. Ca đang chờ Kế toán đối soát.`,
            MaCa: maCa,
            TienMatHeThong: summary.TienMatHeThong,
            TienThucNop: tienThucNop,
            ChenhLech: tienThucNop - summary.TienMatHeThong,
            pendingApprovedReturns: pendingUnfinished.filter(row => row.TrangThai === 'Đã duyệt'),
            pendingUnfinishedReturns: pendingUnfinished,
            handoverWarning: warning
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        if (error instanceof CashierDutyError) return failDuty(res, error);
        res.status(400).json({ message: error.message });
    }
};

const reopenShift = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const result = await reopenClosedShift(transaction, {
            maCa: req.params.id,
            user: req.user,
            req,
            silent: false,
            lyDo: req.body?.LyDo
        });
        await transaction.commit();
        res.json({
            message: result.alreadyOpen
                ? `Ca ${result.MaCa} vẫn đang mở.`
                : `Đã mở lại ca ${result.MaCa}. Thu ngân có thể vào bán hàng trên đúng ca này.`,
            ...result
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        const status = error instanceof ShiftReopenError ? (error.status || 400) : 400;
        res.status(status).json({ message: error.message, fundLocked: Boolean(error.fundLocked), MaPT: error.MaPT });
    }
};

module.exports = {
    getShifts, getMySchedule, checkIn, checkOut, openShift,
    loadCurrentShiftSummary, getCurrentShiftSummary, closeShift, reopenShift
};
