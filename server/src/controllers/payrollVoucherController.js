const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const { ensurePayrollSchema } = require('../services/payrollSchema');
const {
    validMonth, VALID_METHODS, FUND_METHODS, dateKey, voucherMaPhieu
} = require('../services/payrollEngine');
const { voucherSelect } = require('./payrollController');
const { vietnamCalendar } = require('../services/reportingPeriod');

const clean = (value, max = 120, fallback = null) => String(value ?? '').trim().slice(0, max) || fallback;

const writeAudit = (transaction, user, action, recordId, content) =>
    logAudit(transaction, { user, action, table: 'PhieuChiLuong', recordId, content, uc: 'UC33', severity: 'Quan trọng' });

const loadVoucher = async (connection, id) => {
    const result = await new sql.Request(connection).input('Id', sql.VarChar, id)
        .query(`${voucherSelect} WHERE pcl.MaPhieu=@Id`);
    return result.recordset[0] || null;
};

const createVouchers = async (req, res) => {
    if (String(req.user?.TenVaiTro || '').trim() !== 'Kế toán') {
        return res.status(403).json({ message: 'Chỉ Kế toán được lập Phiếu chi lương.' });
    }
    const month = String(req.params.month || '');
    if (!validMonth(month)) return res.status(400).json({ message: 'Kỳ lương không hợp lệ.' });
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ message: 'Chọn ít nhất một nhân viên và đúng một phương thức chi (tiền mặt hoặc chuyển khoản).' });
    const pool = await poolPromise;
    await ensurePayrollSchema(pool);
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const period = await new sql.Request(transaction).input('MaKy', sql.VarChar, month)
            .query('SELECT * FROM KyLuong WITH(UPDLOCK,HOLDLOCK) WHERE MaKy=@MaKy');
        if (period.recordset[0]?.TrangThai !== 'Đã khóa' && period.recordset[0]?.TrangThai !== 'Đã thanh toán') {
            throw new Error('Chỉ lập Phiếu chi lương sau khi đã khóa kỳ.');
        }
        const created = [];
        for (const item of items) {
            const maNV = clean(item.MaNV, 20);
            const method = clean(item.PhuongThuc, 30);
            if (!maNV || !VALID_METHODS.has(method)) throw new Error('Mỗi nhân viên chỉ được chọn đúng một kênh: Tiền mặt hoặc Chuyển khoản. Không tách TM+CK.');
            const payroll = await new sql.Request(transaction)
                .input('MaKy', sql.VarChar, month).input('MaNV', sql.VarChar, maNV).query(`
                    SELECT bl.*,nv.TenNV FROM BangLuong bl WITH(UPDLOCK,HOLDLOCK)
                    JOIN NhanVien nv ON nv.MaNV=bl.MaNV
                    WHERE bl.MaKy=@MaKy AND bl.MaNV=@MaNV`);
            if (!payroll.recordset.length) throw new Error(`Không có bảng lương khóa của ${maNV} trong kỳ ${month}.`);
            const row = payroll.recordset[0];
            if (row.TrangThai === 'Đã thanh toán') throw new Error(`${row.TenNV} đã được chi lương kỳ ${month}.`);
            if (!['Đã khóa'].includes(row.TrangThai)) throw new Error(`${row.TenNV}: bảng lương chưa khóa.`);
            const existing = await new sql.Request(transaction)
                .input('MaKy', sql.VarChar, month).input('MaNV', sql.VarChar, maNV)
                .query('SELECT MaPhieu,TrangThai FROM PhieuChiLuong WITH(UPDLOCK,HOLDLOCK) WHERE MaKy=@MaKy AND MaNV=@MaNV');
            if (existing.recordset.length) {
                throw new Error(`${row.TenNV} đã có Phiếu chi lương ${existing.recordset[0].MaPhieu}. Không tạo phiếu thứ hai — sửa và gửi lại trên cùng phiếu nếu bị từ chối.`);
            }
            const maPhieu = voucherMaPhieu(month, maNV);
            const soTien = Number(row.TongLuong);
            if (soTien <= 0) throw new Error(`${row.TenNV} có tổng lương không hợp lệ.`);
            await new sql.Request(transaction)
                .input('MaPhieu', sql.VarChar, maPhieu).input('MaKy', sql.VarChar, month)
                .input('MaNV', sql.VarChar, maNV).input('MaBangLuong', sql.BigInt, row.MaBangLuong)
                .input('SoTien', sql.Decimal(18, 2), soTien).input('PhuongThuc', sql.NVarChar, method)
                .input('NoiDung', sql.NVarChar, `Chi lương kỳ ${month} cho ${row.TenNV}`)
                .input('MaNVLap', sql.VarChar, req.user.MaNV).query(`
                    INSERT PhieuChiLuong(MaPhieu,MaKy,MaNV,MaBangLuong,SoTien,PhuongThuc,TrangThai,NoiDung,MaNV_Lap)
                    VALUES(@MaPhieu,@MaKy,@MaNV,@MaBangLuong,@SoTien,@PhuongThuc,N'Chờ duyệt',@NoiDung,@MaNVLap);
                    UPDATE BangLuong SET PhuongThucChi=@PhuongThuc WHERE MaBangLuong=@MaBangLuong;`);
            await writeAudit(transaction, req.user, 'Lập Phiếu chi lương', maPhieu,
                `Kỳ ${month} · ${row.TenNV} · ${method} · ${soTien} — chưa thanh toán, chờ Quản lý duyệt và giao quỹ.`);
            created.push({ MaPhieu: maPhieu, MaNV: maNV, TenNV: row.TenNV, SoTien: soTien, PhuongThuc: method });
        }
        await transaction.commit();
        res.status(201).json({
            message: `Đã lập ${created.length} Phiếu chi lương kỳ ${month} và gửi Quản lý duyệt. Bảng lương chưa chuyển Đã thanh toán.`,
            items: created
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const resubmitVoucher = async (req, res) => {
    if (String(req.user?.TenVaiTro || '').trim() !== 'Kế toán') {
        return res.status(403).json({ message: 'Chỉ Kế toán được gửi lại Phiếu chi lương.' });
    }
    const maPhieu = clean(req.params.id, 30);
    const method = clean(req.body.PhuongThuc, 30);
    const note = clean(req.body.GhiChu, 500);
    if (!VALID_METHODS.has(method)) return res.status(400).json({ message: 'Phương thức chỉ gồm Tiền mặt hoặc Chuyển khoản.' });
    const pool = await poolPromise;
    await ensurePayrollSchema(pool);
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction).input('Id', sql.VarChar, maPhieu).query(`
            SELECT pcl.*,bl.TongLuong,bl.TrangThai TrangThaiLuong
            FROM PhieuChiLuong pcl WITH(UPDLOCK,HOLDLOCK)
            JOIN BangLuong bl WITH(UPDLOCK,HOLDLOCK) ON bl.MaBangLuong=pcl.MaBangLuong
            WHERE pcl.MaPhieu=@Id`);
        if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu chi lương.');
        const voucher = current.recordset[0];
        if (voucher.TrangThai !== 'Từ chối') throw new Error('Chỉ phiếu bị từ chối mới được sửa phương thức và gửi lại.');
        if (voucher.TrangThaiLuong === 'Đã thanh toán') throw new Error('Bảng lương đã thanh toán.');
        await new sql.Request(transaction).input('Id', sql.VarChar, maPhieu)
            .input('PhuongThuc', sql.NVarChar, method).input('GhiChu', sql.NVarChar, note)
            .input('SoTien', sql.Decimal(18, 2), voucher.TongLuong).query(`
                UPDATE PhieuChiLuong SET PhuongThuc=@PhuongThuc,SoTien=@SoTien,GhiChu=@GhiChu,
                    MaNV_Duyet=NULL,NgayDuyet=NULL,LyDoTuChoi=NULL,HinhThucCapQuy=NULL,NgayCapQuy=NULL,
                    GhiChuCapQuy=NULL,TrangThai=N'Chờ duyệt'
                WHERE MaPhieu=@Id;
                UPDATE BangLuong SET PhuongThucChi=@PhuongThuc WHERE MaBangLuong=(SELECT MaBangLuong FROM PhieuChiLuong WHERE MaPhieu=@Id);`);
        await writeAudit(transaction, req.user, 'Gửi lại Phiếu chi lương', maPhieu,
            `Sửa phương thức thành ${method} trên cùng phiếu; không tạo phiếu thứ hai.`);
        await transaction.commit();
        res.json({ message: `Đã gửi lại Phiếu chi lương ${maPhieu}.`, MaPhieu: maPhieu, TrangThai: 'Chờ duyệt' });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const payVoucher = async (req, res) => {
    if (String(req.user?.TenVaiTro || '').trim() !== 'Kế toán') {
        return res.status(403).json({ message: 'Chỉ Kế toán được chi lương sau khi Quản lý đã giao quỹ.' });
    }
    const maPhieu = clean(req.params.id, 30);
    if (typeof req.body.ThanhCong !== 'boolean') {
        return res.status(400).json({ message: 'Phải ghi nhận rõ kết quả chi lương thành công hoặc thất bại.' });
    }
    const success = req.body.ThanhCong;
    const bankCode = clean(req.body.MaGiaoDichNganHang, 50);
    const paymentNote = clean(req.body.GhiChuThanhToan, 500);
    const lateNote = clean(req.body.GhiChuTreHan, 500);
    if (!success && !paymentNote) return res.status(400).json({ message: 'Chi lương thất bại phải ghi nguyên nhân để thực hiện lại trên cùng phiếu.' });
    const pool = await poolPromise;
    await ensurePayrollSchema(pool);
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction).input('Id', sql.VarChar, maPhieu).query(`
            SELECT pcl.*,bl.TongLuong,bl.TrangThai TrangThaiLuong,k.NgayTraDuKien,nv.TenNV
            FROM PhieuChiLuong pcl WITH(UPDLOCK,HOLDLOCK)
            JOIN BangLuong bl WITH(UPDLOCK,HOLDLOCK) ON bl.MaBangLuong=pcl.MaBangLuong
            JOIN KyLuong k ON k.MaKy=pcl.MaKy
            JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
            WHERE pcl.MaPhieu=@Id`);
        if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu chi lương.');
        const voucher = current.recordset[0];
        if (!['Đã duyệt', 'Thanh toán thất bại'].includes(voucher.TrangThai)) {
            throw new Error('Phiếu chi lương phải được Quản lý duyệt và giao quỹ trước khi Kế toán chi.');
        }
        if (voucher.TrangThaiLuong === 'Đã thanh toán' || voucher.TrangThai === 'Thanh toán thành công') {
            throw new Error('Phiếu này đã chi thành công. Cấm chi lần hai.');
        }
        if (Number(voucher.SoTien) !== Number(voucher.TongLuong)) {
            throw new Error('Số tiền phiếu không còn khớp tổng lương đã khóa.');
        }
        if (success && voucher.PhuongThuc === 'Chuyển khoản' && !bankCode) {
            throw new Error('Chi chuyển khoản thành công bắt buộc nhập mã giao dịch ngân hàng.');
        }
        const today = vietnamCalendar().date;
        const due = dateKey(voucher.NgayTraDuKien);
        const late = today > due;
        if (success && late && !lateNote) {
            throw new Error(`Chi sau ngày tất toán ${due} (mùng 10). Hãy ghi lý do chi trễ.`);
        }
        const merged = clean([voucher.GhiChu, paymentNote].filter(Boolean).join(' | '), 500);
        await new sql.Request(transaction).input('Id', sql.VarChar, maPhieu)
            .input('BankCode', sql.VarChar, voucher.PhuongThuc === 'Chuyển khoản' ? bankCode : null)
            .input('GhiChu', sql.NVarChar, merged)
            .input('TrangThai', sql.NVarChar, success ? 'Thanh toán thành công' : 'Thanh toán thất bại')
            .input('CoChiTre', sql.Bit, success && late ? 1 : 0)
            .input('GhiChuTreHan', sql.NVarChar, success && late ? lateNote : voucher.GhiChuTreHan)
            .query(`UPDATE PhieuChiLuong SET MaGiaoDichNganHang=@BankCode,GhiChu=@GhiChu,TrangThai=@TrangThai,
                        CoChiTre=@CoChiTre,GhiChuTreHan=@GhiChuTreHan,
                        NgayThanhToan=CASE WHEN @TrangThai=N'Thanh toán thành công' THEN GETDATE() ELSE NgayThanhToan END
                    WHERE MaPhieu=@Id`);
        if (success) {
            await new sql.Request(transaction).input('MaBang', sql.BigInt, voucher.MaBangLuong)
                .input('BankCode', sql.VarChar, voucher.PhuongThuc === 'Chuyển khoản' ? bankCode : null).query(`
                    UPDATE BangLuong SET TrangThai=N'Đã thanh toán',NgayThanhToan=GETDATE(),MaGiaoDich=@BankCode
                    WHERE MaBangLuong=@MaBang`);
            await new sql.Request(transaction).input('MaKy', sql.VarChar, voucher.MaKy).query(`
                IF NOT EXISTS (SELECT 1 FROM BangLuong WHERE MaKy=@MaKy AND TrangThai<>N'Đã thanh toán')
                    UPDATE KyLuong SET TrangThai=N'Đã thanh toán' WHERE MaKy=@MaKy;
                IF EXISTS (SELECT 1 FROM PhieuChiLuong WHERE MaKy=@MaKy AND CoChiTre=1)
                    UPDATE KyLuong SET CoChiTre=1 WHERE MaKy=@MaKy;`);
        }
        await writeAudit(transaction, req.user,
            success ? 'Chi lương thành công' : 'Ghi nhận chi lương thất bại',
            maPhieu,
            success
                ? `Đã chi ${voucher.PhuongThuc} ${Number(voucher.SoTien)} cho ${voucher.TenNV} kỳ ${voucher.MaKy}${late ? `; trễ hạn, lý do: ${lateNote}` : ''}.`
                : `Chi lương thất bại; bảng lương giữ Đã khóa. Lý do: ${paymentNote}`);
        await transaction.commit();
        res.json({
            message: success
                ? `Đã chi lương thành công cho ${voucher.TenNV}. Bảng lương chuyển Đã thanh toán.`
                : 'Đã ghi nhận chi lương thất bại. Dùng lại cùng phiếu, không tạo phiếu mới.',
            MaPhieu: maPhieu,
            TrangThai: success ? 'Thanh toán thành công' : 'Thanh toán thất bại',
            CoChiTre: success && late
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const getApprovalDetail = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensurePayrollSchema(pool);
        const voucher = await loadVoucher(pool, clean(req.params.id, 30));
        if (!voucher) return res.status(404).json({ message: 'Không tìm thấy Phiếu chi lương.' });
        const siblings = await pool.request().input('MaKy', sql.VarChar, voucher.MaKy).query(`
            SELECT PhuongThuc,TrangThai,COUNT(*) SoPhieu,SUM(SoTien) TongTien
            FROM PhieuChiLuong WHERE MaKy=@MaKy AND TrangThai=N'Chờ duyệt'
            GROUP BY PhuongThuc,TrangThai`);
        const period = await pool.request().input('MaKy', sql.VarChar, voucher.MaKy)
            .query('SELECT * FROM KyLuong WHERE MaKy=@MaKy');
        const employee = await pool.request().input('MaNV', sql.VarChar, voucher.MaNV)
            .query('SELECT MaNV,TenNV,ChucVu FROM NhanVien WHERE MaNV=@MaNV');
        res.json({
            voucher: { ...voucher, TenNV: employee.recordset[0]?.TenNV, ChucVu: employee.recordset[0]?.ChucVu },
            batch: siblings.recordset,
            period: period.recordset[0] || null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải hồ sơ Phiếu chi lương.' });
    }
};

const decideVoucher = approved => async (req, res) => {
    const pool = await poolPromise;
    await ensurePayrollSchema(pool);
    const transaction = new sql.Transaction(pool);
    try {
        const maPhieu = clean(req.params.id, 30);
        const reason = clean(req.body.LyDo, 500);
        const fundMethod = clean(req.body.HinhThucCapQuy, 40);
        const fundNote = clean(req.body.GhiChuCapQuy, 500);
        if (!approved && !reason) throw new Error('Từ chối Phiếu chi lương phải ghi lý do.');
        if (approved && !FUND_METHODS.has(fundMethod)) {
            throw new Error('Quản lý phải chọn cách giao quỹ: Tiền mặt hoặc Ủy quyền chuyển khoản.');
        }
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction).input('Id', sql.VarChar, maPhieu).query(`
            SELECT pcl.*,nv.TenNV FROM PhieuChiLuong pcl WITH(UPDLOCK,HOLDLOCK)
            JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
            WHERE pcl.MaPhieu=@Id`);
        if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu chi lương.');
        const voucher = current.recordset[0];
        if (voucher.TrangThai !== 'Chờ duyệt') throw new Error('Phiếu chi lương không còn ở trạng thái Chờ duyệt.');
        if (approved && voucher.PhuongThuc === 'Tiền mặt' && fundMethod !== 'Tiền mặt') {
            throw new Error('Phiếu chi lương tiền mặt: Quản lý phải giao đủ tiền mặt cho Kế toán.');
        }
        if (approved && voucher.PhuongThuc === 'Chuyển khoản' && fundMethod !== 'Ủy quyền chuyển khoản') {
            throw new Error('Phiếu chi lương chuyển khoản: Quản lý ủy quyền cho Kế toán dùng tài khoản cửa hàng.');
        }
        const tmTotal = approved && voucher.PhuongThuc === 'Tiền mặt'
            ? (await new sql.Request(transaction).input('MaKy', sql.VarChar, voucher.MaKy).query(`
                SELECT COALESCE(SUM(SoTien),0) Tong FROM PhieuChiLuong
                WHERE MaKy=@MaKy AND PhuongThuc=N'Tiền mặt' AND TrangThai=N'Chờ duyệt'`)).recordset[0].Tong
            : 0;
        await new sql.Request(transaction).input('Id', sql.VarChar, maPhieu)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('LyDo', sql.NVarChar, approved ? null : reason)
            .input('TrangThai', sql.NVarChar, approved ? 'Đã duyệt' : 'Từ chối')
            .input('HinhThucCapQuy', sql.NVarChar, approved ? fundMethod : null)
            .input('GhiChuCapQuy', sql.NVarChar, approved ? fundNote : null)
            .query(`UPDATE PhieuChiLuong SET MaNV_Duyet=@MaNV,NgayDuyet=GETDATE(),LyDoTuChoi=@LyDo,
                    TrangThai=@TrangThai,HinhThucCapQuy=@HinhThucCapQuy,
                    NgayCapQuy=CASE WHEN @TrangThai=N'Đã duyệt' THEN GETDATE() ELSE NULL END,
                    GhiChuCapQuy=@GhiChuCapQuy WHERE MaPhieu=@Id`);
        await logAudit(transaction, {
            user: req.user, action: approved ? 'Duyệt Phiếu chi lương và giao quỹ' : 'Từ chối Phiếu chi lương',
            table: 'PhieuChiLuong', recordId: maPhieu, uc: 'UC09', severity: 'Quan trọng',
            content: approved
                ? `Đã duyệt ${voucher.MaPhieu} (${voucher.TenNV}, ${voucher.PhuongThuc} ${Number(voucher.SoTien)}). ${voucher.PhuongThuc === 'Tiền mặt' ? `Giao quỹ TM đợt (các phiếu TM chờ duyệt kỳ ${voucher.MaKy}): ${Number(tmTotal)}.` : 'Ủy quyền chuyển khoản.'} Bảng lương chưa Đã thanh toán.`
                : `Từ chối ${voucher.MaPhieu}. Lý do: ${reason}. Kế toán sửa trên cùng phiếu.`
        });
        await transaction.commit();
        res.json({
            message: approved
                ? `Đã duyệt và giao quỹ trên Phiếu chi lương ${maPhieu}. Kế toán mới được chi. Bảng lương chỉ chuyển Đã thanh toán khi chi thành công.`
                : `Đã từ chối Phiếu chi lương ${maPhieu}.`,
            MaPhieu: maPhieu, TrangThai: approved ? 'Đã duyệt' : 'Từ chối',
            HinhThucCapQuy: approved ? fundMethod : null
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const listPending = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensurePayrollSchema(pool);
        const result = await pool.request().query(`
            SELECT pcl.MaPhieu,pcl.MaKy,pcl.MaNV,nv.TenNV,nv.ChucVu,pcl.SoTien,pcl.PhuongThuc,pcl.TrangThai,
                   pcl.NgayLap,lap.TenNV AS NguoiLap,CONVERT(varchar(10),k.NgayTraDuKien,23) NgayTraDuKien
            FROM PhieuChiLuong pcl
            JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
            JOIN NhanVien lap ON lap.MaNV=pcl.MaNV_Lap
            JOIN KyLuong k ON k.MaKy=pcl.MaKy
            WHERE pcl.TrangThai=N'Chờ duyệt'
            ORDER BY pcl.NgayLap DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải phiếu chi lương chờ duyệt.' });
    }
};

module.exports = {
    createVouchers,
    resubmitVoucher,
    payVoucher,
    getApprovalDetail,
    approveVoucher: decideVoucher(true),
    rejectVoucher: decideVoucher(false),
    listPending
};
