const { sql, poolPromise } = require('../config/db');
const { splitDayNightMinutes } = require('../services/timeService');

const validMonth = value => /^\d{4}-\d{2}$/.test(String(value || ''));

const getPeriodBounds = month => {
    const [year, monthNumber] = month.split('-').map(Number);
    return {
        start: new Date(year, monthNumber - 1, 1, 0, 0, 0),
        end: new Date(year, monthNumber, 1, 0, 0, 0),
        paymentDate: new Date(year, monthNumber, 5, 0, 0, 0)
    };
};

const build = async (req, res) => {
    const month = String(req.params.month || '');
    if (!validMonth(month)) return res.status(400).json({ message: 'Kỳ lương không hợp lệ.' });
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const bounds = getPeriodBounds(month);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const existing = await new sql.Request(transaction).input('MaKy', sql.VarChar, month)
            .query('SELECT TrangThai FROM KyLuong WITH(UPDLOCK,HOLDLOCK) WHERE MaKy=@MaKy');
        if (existing.recordset[0]?.TrangThai === 'Đã khóa' || existing.recordset[0]?.TrangThai === 'Đã thanh toán') {
            throw new Error('Kỳ lương đã khóa nên không thể tính lại.');
        }
        await new sql.Request(transaction).input('MaKy', sql.VarChar, month)
            .input('TuNgay', sql.Date, bounds.start).input('DenNgay', sql.Date, new Date(bounds.end.getTime() - 86400000))
            .input('NgayTra', sql.Date, bounds.paymentDate).input('NguoiLap', sql.VarChar, req.user.MaNV).query(`
                MERGE KyLuong target USING(SELECT @MaKy MaKy) source ON target.MaKy=source.MaKy
                WHEN MATCHED THEN UPDATE SET TuNgay=@TuNgay,DenNgay=@DenNgay,NgayTraDuKien=@NgayTra,
                    NguoiLap=@NguoiLap,NgayLap=GETDATE(),TrangThai=N'Kế toán đã lập'
                WHEN NOT MATCHED THEN INSERT(MaKy,TuNgay,DenNgay,NgayTraDuKien,TrangThai,NguoiLap)
                    VALUES(@MaKy,@TuNgay,@DenNgay,@NgayTra,N'Kế toán đã lập',@NguoiLap);`);
        await new sql.Request(transaction).input('MaKy', sql.VarChar, month).query(`
            DELETE FROM ChiTietBangLuong WHERE MaBangLuong IN(SELECT MaBangLuong FROM BangLuong WHERE MaKy=@MaKy);
            DELETE FROM BangLuong WHERE MaKy=@MaKy;`);
        const attendance = await new sql.Request(transaction).input('Start', sql.DateTime, bounds.start)
            .input('End', sql.DateTime, bounds.end).query(`
                SELECT cc.MaChamCong,l.MaNV,nv.TenNV,
                       COALESCE(cc.ThoiGianVaoDuocDuyet,cc.ThoiGianVao) BatDau,
                       COALESCE(cc.ThoiGianRaDuocDuyet,cc.ThoiGianRa) KetThuc,
                       CONVERT(varchar(5),lc.GioNghiBatDau,108) GioNghiBatDau,
                       CONVERT(varchar(5),lc.GioNghiKetThuc,108) GioNghiKetThuc,
                       COALESCE(ml.LuongGio,55000) LuongGio,COALESCE(ml.HeSoBanDem,1.30) HeSoBanDem
                FROM ChamCong cc JOIN LichLamViec l ON l.MaLich=cc.MaLich
                JOIN NhanVien nv ON nv.MaNV=l.MaNV
                JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
                OUTER APPLY(SELECT TOP 1 LuongGio,HeSoBanDem FROM MucLuongNhanVien
                    WHERE MaNV=l.MaNV AND NgayHieuLuc<=CONVERT(date,COALESCE(cc.ThoiGianVaoDuocDuyet,cc.ThoiGianVao))
                    ORDER BY NgayHieuLuc DESC) ml
                WHERE cc.TrangThai=N'Đã duyệt'
                  AND COALESCE(cc.ThoiGianRaDuocDuyet,cc.ThoiGianRa)>@Start
                  AND COALESCE(cc.ThoiGianVaoDuocDuyet,cc.ThoiGianVao)<@End`);
        const grouped = new Map();
        for (const row of attendance.recordset) {
            const start = new Date(Math.max(new Date(row.BatDau).getTime(), bounds.start.getTime()));
            const end = new Date(Math.min(new Date(row.KetThuc).getTime(), bounds.end.getTime()));
            const split = splitDayNightMinutes(start, end, null, null, {
                GioNghiBatDau: row.GioNghiBatDau, GioNghiKetThuc: row.GioNghiKetThuc
            });
            const payDay = split.day / 60 * Number(row.LuongGio);
            const payNight = split.night / 60 * Number(row.LuongGio) * Number(row.HeSoBanDem);
            if (!grouped.has(row.MaNV)) grouped.set(row.MaNV, {
                MaNV: row.MaNV, TenNV: row.TenNV, day: 0, night: 0, base: 0, nightPay: 0, details: []
            });
            const item = grouped.get(row.MaNV);
            item.day += split.day; item.night += split.night; item.base += payDay; item.nightPay += payNight;
            item.details.push({ ...row, start, day: split.day, night: split.night, total: payDay + payNight });
        }
        for (const item of grouped.values()) {
            const inserted = await new sql.Request(transaction).input('MaKy', sql.VarChar, month)
                .input('MaNV', sql.VarChar, item.MaNV).input('PhutNgay', sql.Int, item.day)
                .input('PhutDem', sql.Int, item.night).input('LuongCoBan', sql.Decimal(18, 2), item.base)
                .input('LuongBanDem', sql.Decimal(18, 2), item.nightPay)
                .input('TongLuong', sql.Decimal(18, 2), item.base + item.nightPay).query(`
                    INSERT BangLuong(MaKy,MaNV,PhutNgay,PhutDem,LuongCoBan,LuongBanDem,TongLuong,TrangThai)
                    OUTPUT inserted.MaBangLuong
                    VALUES(@MaKy,@MaNV,@PhutNgay,@PhutDem,@LuongCoBan,@LuongBanDem,@TongLuong,N'Chờ khóa')`);
            const maBangLuong = inserted.recordset[0].MaBangLuong;
            for (const detail of item.details) {
                await new sql.Request(transaction).input('MaBangLuong', sql.BigInt, maBangLuong)
                    .input('MaChamCong', sql.BigInt, detail.MaChamCong).input('NgayCong', sql.Date, detail.start)
                    .input('PhutNgay', sql.Int, detail.day).input('PhutDem', sql.Int, detail.night)
                    .input('LuongGio', sql.Decimal(18, 2), detail.LuongGio)
                    .input('HeSo', sql.Decimal(5, 2), detail.HeSoBanDem)
                    .input('ThanhTien', sql.Decimal(18, 2), detail.total).query(`
                        INSERT ChiTietBangLuong(MaBangLuong,MaChamCong,NgayCong,PhutNgay,PhutDem,LuongGio,HeSoBanDem,ThanhTien)
                        VALUES(@MaBangLuong,@MaChamCong,@NgayCong,@PhutNgay,@PhutDem,@LuongGio,@HeSo,@ThanhTien)`);
            }
        }
        await transaction.commit();
        res.status(201).json({ message: `Đã lập bảng lương ${month} cho ${grouped.size} nhân viên.` });
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
        const pool = await poolPromise;
        const [period, rows] = await Promise.all([
            pool.request().input('MaKy', sql.VarChar, month).query('SELECT * FROM KyLuong WHERE MaKy=@MaKy'),
            pool.request().input('MaKy', sql.VarChar, month).query(`
                SELECT bl.*,nv.TenNV FROM BangLuong bl JOIN NhanVien nv ON nv.MaNV=bl.MaNV
                WHERE bl.MaKy=@MaKy ORDER BY nv.TenNV`)
        ]);
        res.json({ period: period.recordset[0] || null, items: rows.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải bảng lương.' });
    }
};

const lock = async (req, res) => {
    try {
        const month = String(req.params.month || '');
        const pool = await poolPromise;
        const result = await pool.request().input('MaKy', sql.VarChar, month).query(`
            UPDATE KyLuong SET TrangThai=N'Đã khóa',NgayKhoa=GETDATE()
            WHERE MaKy=@MaKy AND TrangThai=N'Kế toán đã lập';
            UPDATE BangLuong SET TrangThai=N'Đã khóa'
            WHERE MaKy=@MaKy AND EXISTS(SELECT 1 FROM KyLuong WHERE MaKy=@MaKy AND TrangThai=N'Đã khóa');
            SELECT @@ROWCOUNT affected;`);
        if (!result.recordset[0].affected) return res.status(400).json({ message: 'Kỳ lương chưa được lập hoặc đã khóa.' });
        res.json({ message: `Đã khóa kỳ lương ${month}.` });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const pay = async (req, res) => {
    try {
        const month = String(req.params.month || '');
        const employee = String(req.params.employee || '');
        const code = String(req.body.MaGiaoDich || '').trim();
        if (!code) return res.status(400).json({ message: 'Cần nhập mã giao dịch trả lương.' });
        const pool = await poolPromise;
        const result = await pool.request().input('MaKy', sql.VarChar, month)
            .input('MaNV', sql.VarChar, employee).input('MaGiaoDich', sql.VarChar, code).query(`
                UPDATE BangLuong SET TrangThai=N'Đã thanh toán',NgayThanhToan=GETDATE(),MaGiaoDich=@MaGiaoDich
                WHERE MaKy=@MaKy AND MaNV=@MaNV AND TrangThai=N'Đã khóa';
                SELECT @@ROWCOUNT affected;`);
        if (!result.recordset[0].affected) return res.status(400).json({ message: 'Bảng lương nhân viên chưa được khóa hoặc đã thanh toán.' });
        await pool.request().input('MaKy', sql.VarChar, month).query(`
            IF NOT EXISTS(SELECT 1 FROM BangLuong WHERE MaKy=@MaKy AND TrangThai<>N'Đã thanh toán')
                UPDATE KyLuong SET TrangThai=N'Đã thanh toán' WHERE MaKy=@MaKy`);
        res.json({ message: `Đã ghi nhận thanh toán lương cho ${employee}.` });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = { build, get, lock, pay };
