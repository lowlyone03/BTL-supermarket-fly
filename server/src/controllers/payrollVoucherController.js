const { sql, poolPromise } = require('../config/db');
const { logAudit, listAuditLogs } = require('../services/auditLog');
const { ensurePayrollSchema } = require('../services/payrollSchema');
const { validMonth, VALID_METHODS, dateKey, voucherMaPhieu } = require('../services/payrollEngine');
const { voucherSelect } = require('./payrollController');
const { vietnamCalendar } = require('../services/reportingPeriod');
const { loadFund, snapshotFund, listPayouts } = require('../services/payrollFund');

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
                `Kỳ ${month} · ${row.TenNV} · ${method} · ${soTien} — chưa thanh toán, chờ Quản lý duyệt. Giao quỹ chung sau khi duyệt xong kỳ.`);
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

const insertPayoutHistory = async (transaction, payload) => {
    await new sql.Request(transaction)
        .input('MaKy', sql.VarChar, payload.MaKy)
        .input('MaPhieu', sql.VarChar, payload.MaPhieu)
        .input('MaNV', sql.VarChar, payload.MaNV)
        .input('SoTien', sql.Decimal(18, 2), payload.SoTien)
        .input('PhuongThuc', sql.NVarChar, payload.PhuongThuc)
        .input('Bank', sql.VarChar, payload.MaGiaoDichNganHang)
        .input('MatCon', sql.Decimal(18, 2), payload.SoTienMatCon)
        .input('CKCon', sql.Decimal(18, 2), payload.SoTienCKCon)
        .input('MaNVKT', sql.VarChar, payload.MaNV_KT)
        .input('ThanhCong', sql.Bit, payload.ThanhCong ? 1 : 0)
        .input('GhiChu', sql.NVarChar, payload.GhiChu)
        .query(`INSERT LichSuChiLuong(MaKy,MaPhieu,MaNV,SoTien,PhuongThuc,MaGiaoDichNganHang,SoTienMatCon,SoTienCKCon,MaNV_KT,ThanhCong,GhiChu)
                VALUES(@MaKy,@MaPhieu,@MaNV,@SoTien,@PhuongThuc,@Bank,@MatCon,@CKCon,@MaNVKT,@ThanhCong,@GhiChu)`);
};

const payVoucher = async (req, res) => {
    if (String(req.user?.TenVaiTro || '').trim() !== 'Kế toán') {
        return res.status(403).json({ message: 'Chỉ Kế toán được chi lương sau khi Quản lý đã giao quỹ chung.' });
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
            throw new Error('Phiếu chi lương phải được Quản lý duyệt trước khi Kế toán chi từ quỹ chung.');
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
        const fundRow = await new sql.Request(transaction).input('MaKy', sql.VarChar, voucher.MaKy)
            .query('SELECT * FROM QuyLuongKy WITH(UPDLOCK,HOLDLOCK) WHERE MaKy=@MaKy');
        const fund = fundRow.recordset[0] || null;
        let matCon = Number(fund?.SoTienMatCon || 0);
        let ckCon = Number(fund?.SoTienCKCon || 0);
        const amount = Number(voucher.SoTien);
        if (success) {
            if (voucher.PhuongThuc === 'Tiền mặt') {
                if (!fund || matCon < amount) {
                    throw new Error('Chưa có quỹ chung tiền mặt, hoặc số quỹ còn không đủ. Quản lý phải giao quỹ chung một lần cho kỳ này.');
                }
                matCon = Math.round((matCon - amount) * 100) / 100;
            } else {
                if (!fund || Number(fund.SoTienCKGiao || 0) <= 0) {
                    throw new Error('Quản lý chưa ủy quyền chuyển khoản chung cho kỳ này. Không chi từng người trước khi có ủy quyền chung.');
                }
                if (ckCon < amount) {
                    throw new Error('Quỹ ủy quyền chuyển khoản còn lại không đủ. Quản lý hãy giao bổ sung quỹ chung.');
                }
                ckCon = Math.round((ckCon - amount) * 100) / 100;
            }
            await new sql.Request(transaction).input('MaKy', sql.VarChar, voucher.MaKy)
                .input('MatCon', sql.Decimal(18, 2), matCon)
                .input('CKCon', sql.Decimal(18, 2), ckCon)
                .query('UPDATE QuyLuongKy SET SoTienMatCon=@MatCon,SoTienCKCon=@CKCon,NgayCapNhat=GETDATE() WHERE MaKy=@MaKy');
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
        await insertPayoutHistory(transaction, {
            MaKy: voucher.MaKy,
            MaPhieu: maPhieu,
            MaNV: voucher.MaNV,
            SoTien: amount,
            PhuongThuc: voucher.PhuongThuc,
            MaGiaoDichNganHang: voucher.PhuongThuc === 'Chuyển khoản' ? bankCode : null,
            SoTienMatCon: matCon,
            SoTienCKCon: ckCon,
            MaNV_KT: req.user.MaNV,
            ThanhCong: success,
            GhiChu: success
                ? (late ? `Chi trễ: ${lateNote}` : paymentNote)
                : paymentNote
        });
        await writeAudit(transaction, req.user,
            success ? 'Chi lương từ quỹ chung' : 'Ghi nhận chi lương thất bại',
            maPhieu,
            success
                ? `Đã chi ${voucher.PhuongThuc} ${amount} cho ${voucher.TenNV} kỳ ${voucher.MaKy} từ quỹ chung. TM còn ${matCon}; CK còn ${ckCon}.${late ? ` Trễ hạn, lý do: ${lateNote}` : ''}`
                : `Chi lương thất bại; quỹ chung không trừ. Bảng lương giữ Đã khóa. Lý do: ${paymentNote}`);
        await transaction.commit();
        res.json({
            message: success
                ? `Đã chi lương thành công cho ${voucher.TenNV} từ quỹ chung. Quỹ còn: TM ${matCon}, CK ${ckCon}.`
                : 'Đã ghi nhận chi lương thất bại. Quỹ chung không bị trừ. Dùng lại cùng phiếu.',
            MaPhieu: maPhieu,
            TrangThai: success ? 'Thanh toán thành công' : 'Thanh toán thất bại',
            CoChiTre: success && late,
            SoTienMatCon: matCon,
            SoTienCKCon: ckCon
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
            FROM PhieuChiLuong WHERE MaKy=@MaKy
            GROUP BY PhuongThuc,TrangThai`);
        const period = await pool.request().input('MaKy', sql.VarChar, voucher.MaKy)
            .query('SELECT * FROM KyLuong WHERE MaKy=@MaKy');
        const employee = await pool.request().input('MaNV', sql.VarChar, voucher.MaNV)
            .query('SELECT MaNV,TenNV,ChucVu FROM NhanVien WHERE MaNV=@MaNV');
        const fund = await snapshotFund(pool, voucher.MaKy);
        res.json({
            voucher: { ...voucher, TenNV: employee.recordset[0]?.TenNV, ChucVu: employee.recordset[0]?.ChucVu },
            batch: siblings.recordset,
            period: period.recordset[0] || null,
            fund
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải hồ sơ Phiếu chi lương.' });
    }
};

const approveOne = async (transaction, user, maPhieu) => {
    const current = await new sql.Request(transaction).input('Id', sql.VarChar, maPhieu).query(`
        SELECT pcl.*,nv.TenNV FROM PhieuChiLuong pcl WITH(UPDLOCK,HOLDLOCK)
        JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
        WHERE pcl.MaPhieu=@Id`);
    if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu chi lương.');
    const voucher = current.recordset[0];
    if (voucher.TrangThai !== 'Chờ duyệt') throw new Error(`Phiếu ${maPhieu} không còn ở trạng thái Chờ duyệt.`);
    await new sql.Request(transaction).input('Id', sql.VarChar, maPhieu)
        .input('MaNV', sql.VarChar, user.MaNV)
        .query(`UPDATE PhieuChiLuong SET MaNV_Duyet=@MaNV,NgayDuyet=GETDATE(),LyDoTuChoi=NULL,
                TrangThai=N'Đã duyệt' WHERE MaPhieu=@Id`);
    await logAudit(transaction, {
        user, action: 'Duyệt Phiếu chi lương', table: 'PhieuChiLuong', recordId: maPhieu,
        uc: 'UC09', severity: 'Quan trọng',
        content: `Đã duyệt ${voucher.MaPhieu} (${voucher.TenNV}, ${voucher.PhuongThuc} ${Number(voucher.SoTien)}). Chưa giao quỹ — Quản lý giao quỹ chung một lần cho kỳ ${voucher.MaKy}.`
    });
    return voucher;
};

const decideVoucher = approved => async (req, res) => {
    const pool = await poolPromise;
    await ensurePayrollSchema(pool);
    const transaction = new sql.Transaction(pool);
    try {
        const maPhieu = clean(req.params.id, 30);
        const reason = clean(req.body.LyDo, 500);
        if (!approved && !reason) throw new Error('Từ chối Phiếu chi lương phải ghi lý do.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        if (approved) {
            const voucher = await approveOne(transaction, req.user, maPhieu);
            await transaction.commit();
            return res.json({
                message: `Đã duyệt Phiếu chi lương ${maPhieu} (${voucher.TenNV}). Chưa giao quỹ. Sau khi duyệt xong kỳ, bấm Giao quỹ chung một lần.`,
                MaPhieu: maPhieu, TrangThai: 'Đã duyệt'
            });
        }
        const current = await new sql.Request(transaction).input('Id', sql.VarChar, maPhieu).query(`
            SELECT pcl.*,nv.TenNV FROM PhieuChiLuong pcl WITH(UPDLOCK,HOLDLOCK)
            JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
            WHERE pcl.MaPhieu=@Id`);
        if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu chi lương.');
        const voucher = current.recordset[0];
        if (voucher.TrangThai !== 'Chờ duyệt') throw new Error('Phiếu chi lương không còn ở trạng thái Chờ duyệt.');
        await new sql.Request(transaction).input('Id', sql.VarChar, maPhieu)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('LyDo', sql.NVarChar, reason)
            .query(`UPDATE PhieuChiLuong SET MaNV_Duyet=@MaNV,NgayDuyet=GETDATE(),LyDoTuChoi=@LyDo,
                    TrangThai=N'Từ chối' WHERE MaPhieu=@Id`);
        await logAudit(transaction, {
            user: req.user, action: 'Từ chối Phiếu chi lương',
            table: 'PhieuChiLuong', recordId: maPhieu, uc: 'UC09', severity: 'Quan trọng',
            content: `Từ chối ${voucher.MaPhieu}. Lý do: ${reason}. Kế toán sửa trên cùng phiếu.`
        });
        await transaction.commit();
        res.json({ message: `Đã từ chối Phiếu chi lương ${maPhieu}.`, MaPhieu: maPhieu, TrangThai: 'Từ chối' });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const approveAll = async (req, res) => {
    const month = clean(req.body.MaKy, 7) || clean(req.query.MaKy, 7);
    if (!validMonth(month)) return res.status(400).json({ message: 'Cần kỳ lương (MaKy, dạng YYYY-MM) để duyệt tất cả phiếu chờ.' });
    const pool = await poolPromise;
    await ensurePayrollSchema(pool);
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const pending = await new sql.Request(transaction).input('MaKy', sql.VarChar, month).query(`
            SELECT MaPhieu FROM PhieuChiLuong WITH(UPDLOCK,HOLDLOCK)
            WHERE MaKy=@MaKy AND TrangThai=N'Chờ duyệt' ORDER BY MaPhieu`);
        if (!pending.recordset.length) throw new Error(`Kỳ ${month} không còn phiếu chi lương chờ duyệt.`);
        const approved = [];
        for (const row of pending.recordset) {
            const voucher = await approveOne(transaction, req.user, row.MaPhieu);
            approved.push({ MaPhieu: voucher.MaPhieu, TenNV: voucher.TenNV, SoTien: Number(voucher.SoTien), PhuongThuc: voucher.PhuongThuc });
        }
        await logAudit(transaction, {
            user: req.user, action: 'Duyệt hàng loạt Phiếu chi lương', table: 'KyLuong', recordId: month,
            uc: 'UC09', severity: 'Quan trọng',
            content: `Đã duyệt ${approved.length} phiếu kỳ ${month}. Chưa giao quỹ — bước tiếp theo là giao quỹ chung một lần.`
        });
        await transaction.commit();
        res.json({
            message: `Đã duyệt ${approved.length} phiếu kỳ ${month}. Tiếp theo hãy giao quỹ chung một lần cho Kế toán.`,
            MaKy: month,
            items: approved
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const handOverFund = async (req, res) => {
    const month = clean(req.params.month, 7);
    if (!validMonth(month)) return res.status(400).json({ message: 'Kỳ lương không hợp lệ.' });
    const note = clean(req.body.GhiChu, 500);
    const pool = await poolPromise;
    await ensurePayrollSchema(pool);
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const pending = await new sql.Request(transaction).input('MaKy', sql.VarChar, month)
            .query(`SELECT COUNT(*) SoLuong FROM PhieuChiLuong WITH(UPDLOCK,HOLDLOCK) WHERE MaKy=@MaKy AND TrangThai=N'Chờ duyệt'`);
        if (Number(pending.recordset[0].SoLuong) > 0) {
            throw new Error(`Còn ${pending.recordset[0].SoLuong} phiếu chưa duyệt. Hãy duyệt hết (hoặc Duyệt tất cả) rồi mới giao quỹ chung.`);
        }
        const needRow = await new sql.Request(transaction).input('MaKy', sql.VarChar, month).query(`
            SELECT PhuongThuc, COUNT(*) SoPhieu, COALESCE(SUM(SoTien),0) Tong
            FROM PhieuChiLuong WITH(UPDLOCK,HOLDLOCK)
            WHERE MaKy=@MaKy AND TrangThai IN (N'Đã duyệt', N'Thanh toán thất bại')
            GROUP BY PhuongThuc`);
        const of = method => needRow.recordset.find(row => row.PhuongThuc === method);
        const tmNeed = Number(of('Tiền mặt')?.Tong || 0);
        const ckNeed = Number(of('Chuyển khoản')?.Tong || 0);
        if (tmNeed <= 0 && ckNeed <= 0) {
            throw new Error('Không có phiếu đã duyệt chưa chi để giao quỹ chung.');
        }
        const current = await new sql.Request(transaction).input('MaKy', sql.VarChar, month)
            .query('SELECT * FROM QuyLuongKy WITH(UPDLOCK,HOLDLOCK) WHERE MaKy=@MaKy');
        const fund = current.recordset[0];
        const tmCon = Number(fund?.SoTienMatCon || 0);
        const ckCon = Number(fund?.SoTienCKCon || 0);
        const tmTopUp = Math.max(0, tmNeed - tmCon);
        const ckTopUp = Math.max(0, ckNeed - ckCon);
        if (tmTopUp <= 0 && ckTopUp <= 0) {
            throw new Error('Quỹ chung kỳ này đã đủ cho các phiếu đã duyệt chưa chi.');
        }
        await new sql.Request(transaction)
            .input('MaKy', sql.VarChar, month)
            .input('TmTop', sql.Decimal(18, 2), tmTopUp)
            .input('CkTop', sql.Decimal(18, 2), ckTopUp)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('GhiChu', sql.NVarChar, note)
            .query(`
                MERGE QuyLuongKy target USING (SELECT @MaKy MaKy) source ON target.MaKy=source.MaKy
                WHEN MATCHED THEN UPDATE SET
                    SoTienMatGiao=SoTienMatGiao+@TmTop,
                    SoTienMatCon=SoTienMatCon+@TmTop,
                    SoTienCKGiao=SoTienCKGiao+@CkTop,
                    SoTienCKCon=SoTienCKCon+@CkTop,
                    MaNV_QL=@MaNV, NgayGiao=GETDATE(), GhiChu=@GhiChu, NgayCapNhat=GETDATE()
                WHEN NOT MATCHED THEN INSERT(MaKy,SoTienMatGiao,SoTienMatCon,SoTienCKGiao,SoTienCKCon,MaNV_QL,NgayGiao,GhiChu)
                    VALUES(@MaKy,@TmTop,@TmTop,@CkTop,@CkTop,@MaNV,GETDATE(),@GhiChu);`);
        const after = await loadFund(transaction, month);
        await logAudit(transaction, {
            user: req.user, action: 'Giao quỹ lương chung', table: 'QuyLuongKy', recordId: month,
            uc: 'UC09', severity: 'Quan trọng',
            content: `Kỳ ${month}: giao TM +${tmTopUp} (còn ${Number(after.SoTienMatCon)}), ủy quyền CK +${ckTopUp} (còn ${Number(after.SoTienCKCon)}). Kế toán chích từng nhân viên từ quỹ này.`
        });
        await transaction.commit();
        res.json({
            message: `Đã giao quỹ chung kỳ ${month}. Tiền mặt ${tmTopUp ? `+${tmTopUp}` : 'không thêm'}; chuyển khoản ${ckTopUp ? `+${ckTopUp}` : 'không thêm'}. Kế toán chi từng người từ quỹ còn lại.`,
            MaKy: month,
            tmTopUp,
            ckTopUp,
            fund: after
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

const listBoard = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensurePayrollSchema(pool);
        const result = await pool.request().query(`
            SELECT pcl.MaPhieu,pcl.MaKy,pcl.MaNV,nv.TenNV,nv.ChucVu,pcl.SoTien,pcl.PhuongThuc,pcl.TrangThai,
                   pcl.NgayLap,pcl.NgayDuyet,lap.TenNV AS NguoiLap,CONVERT(varchar(10),k.NgayTraDuKien,23) NgayTraDuKien
            FROM PhieuChiLuong pcl
            JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
            JOIN NhanVien lap ON lap.MaNV=pcl.MaNV_Lap
            JOIN KyLuong k ON k.MaKy=pcl.MaKy
            WHERE pcl.TrangThai IN (N'Chờ duyệt', N'Đã duyệt', N'Thanh toán thất bại')
            ORDER BY pcl.MaKy DESC, pcl.NgayLap DESC`);
        const byKy = new Map();
        for (const row of result.recordset) {
            if (!byKy.has(row.MaKy)) byKy.set(row.MaKy, []);
            byKy.get(row.MaKy).push(row);
        }
        const periods = [];
        for (const [MaKy, items] of byKy) {
            const fund = await snapshotFund(pool, MaKy);
            periods.push({
                MaKy,
                pending: items.filter(item => item.TrangThai === 'Chờ duyệt'),
                approved: items.filter(item => ['Đã duyệt', 'Thanh toán thất bại'].includes(item.TrangThai)),
                fund
            });
        }
        res.json({ periods });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải bảng duyệt lương.' });
    }
};

const idsOf = (items, table) => [...new Set(items
    .filter(item => item.BangLienQuan === table && item.MaBanGhi)
    .map(item => String(item.MaBanGhi)))];

const rowsByIds = async (pool, ids, query, key) => {
    const unique = [...new Set((ids || []).filter(Boolean).map(String))];
    if (!unique.length) return new Map();
    const request = pool.request();
    const names = unique.map((id, index) => {
        request.input(`v${index}`, sql.VarChar, id);
        return `@v${index}`;
    });
    const result = await request.query(query.replace('__IN__', names.join(',')));
    return new Map(result.recordset.map(row => [String(row[key]), row]));
};

const enrichAccountantActivity = async items => {
    if (!items.length) return items;
    const pool = await poolPromise;
    const [invoices, payables, vouchers, receipts, payrolls, bangLuong] = await Promise.all([
        rowsByIds(pool, idsOf(items, 'HoaDonMuaHang'), `
            SELECT hd.MaHDMH,hd.SoHoaDon,hd.MaPO,hd.MaPN,cn.MaCNPTra
            FROM HoaDonMuaHang hd
            LEFT JOIN CongNoPhaiTra cn ON cn.MaHDMH=hd.MaHDMH
            WHERE hd.MaHDMH IN (__IN__)`, 'MaHDMH'),
        rowsByIds(pool, idsOf(items, 'CongNoNCC'), `
            SELECT cn.MaCNPTra,cn.MaHDMH,hd.SoHoaDon,hd.MaPO,hd.MaPN,pc.MaPhieu
            FROM CongNoPhaiTra cn
            JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
            LEFT JOIN PhieuChi pc ON pc.MaCongNo=cn.MaCNPTra
            WHERE cn.MaCNPTra IN (__IN__)`, 'MaCNPTra'),
        rowsByIds(pool, [...idsOf(items, 'PhieuChi')], `
            SELECT pc.MaPhieu,pc.MaCongNo AS MaCNPTra,hd.MaHDMH,hd.SoHoaDon,hd.MaPO,hd.MaPN,pc.SoTien,pc.MaGiaoDichNganHang
            FROM PhieuChi pc
            JOIN CongNoPhaiTra cn ON cn.MaCNPTra=pc.MaCongNo
            JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
            WHERE pc.MaPhieu IN (__IN__)`, 'MaPhieu'),
        rowsByIds(pool, idsOf(items, 'PhieuThu'), `
            SELECT MaPT,MaCa FROM PhieuThu WHERE MaPT IN (__IN__)`, 'MaPT'),
        rowsByIds(pool, [...idsOf(items, 'PhieuChiLuong'), ...idsOf(items, 'LichSuChiLuong')], `
            SELECT pcl.MaPhieu,pcl.MaKy,pcl.MaNV,nv.TenNV,pcl.SoTien,pcl.PhuongThuc,pcl.MaGiaoDichNganHang,pcl.TrangThai
            FROM PhieuChiLuong pcl
            JOIN NhanVien nv ON nv.MaNV=pcl.MaNV
            WHERE pcl.MaPhieu IN (__IN__)`, 'MaPhieu'),
        rowsByIds(pool, idsOf(items, 'BangLuong'), `
            SELECT CAST(MaBangLuong AS varchar(30)) MaBangLuong,MaKy,MaNV
            FROM BangLuong WHERE CAST(MaBangLuong AS varchar(30)) IN (__IN__)`, 'MaBangLuong')
    ]);
    const payoutIds = [...payrolls.keys()];
    const payouts = await rowsByIds(pool, payoutIds, `
        SELECT ls.MaPhieu,ls.SoTienMatCon,ls.SoTienCKCon,ls.MaGiaoDichNganHang,ls.SoTien
        FROM LichSuChiLuong ls
        WHERE ls.MaLS IN (
            SELECT MAX(MaLS) FROM LichSuChiLuong WHERE MaPhieu IN (__IN__) GROUP BY MaPhieu
        )`, 'MaPhieu');
    return items.map(item => {
        const ma = String(item.MaBanGhi || '');
        const invoice = invoices.get(ma);
        const payable = payables.get(ma);
        const voucher = vouchers.get(ma);
        const receipt = receipts.get(ma);
        const payroll = payrolls.get(ma);
        const bang = bangLuong.get(ma);
        const payout = payouts.get(ma);
        const lienKet = {
            MaHDMH: invoice?.MaHDMH || payable?.MaHDMH || voucher?.MaHDMH || null,
            SoHoaDon: invoice?.SoHoaDon || payable?.SoHoaDon || voucher?.SoHoaDon || null,
            MaPO: invoice?.MaPO || payable?.MaPO || voucher?.MaPO || null,
            MaPN: invoice?.MaPN || payable?.MaPN || voucher?.MaPN || null,
            MaCNPTra: payable?.MaCNPTra || voucher?.MaCNPTra || invoice?.MaCNPTra || null,
            MaPhieu: voucher?.MaPhieu || payroll?.MaPhieu || payable?.MaPhieu || null,
            MaCa: receipt?.MaCa || (item.BangLienQuan === 'CaLamViec' ? ma : null),
            MaPT: receipt?.MaPT || (item.BangLienQuan === 'PhieuThu' ? ma : null),
            MaKy: payroll?.MaKy || bang?.MaKy || ((item.BangLienQuan === 'KyLuong' || item.BangLienQuan === 'QuyLuongKy') ? ma : null),
            MaNV: payroll?.MaNV || bang?.MaNV || null,
            TenNV: payroll?.TenNV || null,
            MaGiaoDichNganHang: voucher?.MaGiaoDichNganHang || payroll?.MaGiaoDichNganHang || payout?.MaGiaoDichNganHang || null,
            SoTienMatCon: payout?.SoTienMatCon ?? null,
            SoTienCKCon: payout?.SoTienCKCon ?? null
        };
        const soTien = item.SoTien || Number(voucher?.SoTien || payroll?.SoTien || payout?.SoTien || 0) || null;
        return { ...item, lienKet, SoTien: soTien };
    });
};

const getAccountantActivity = async (req, res) => {
    if (String(req.user?.TenVaiTro || '').trim() !== 'Kế toán') {
        return res.status(403).json({ message: 'Chỉ Kế toán xem lịch sử hoạt động kế toán của mình.' });
    }
    try {
        const data = await listAuditLogs({
            ...req.query,
            role: 'Kế toán',
            actor: req.user.MaNV,
            kind: req.query.kind == null ? 'nghiep-vu' : req.query.kind
        });
        data.items = await enrichAccountantActivity(data.items || []);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Không thể tải lịch sử kế toán.' });
    }
};

const getPayoutHistory = async (req, res) => {
    if (String(req.user?.TenVaiTro || '').trim() !== 'Kế toán') {
        return res.status(403).json({ message: 'Chỉ Kế toán xem lịch sử chi lương từ quỹ chung.' });
    }
    try {
        const pool = await poolPromise;
        await ensurePayrollSchema(pool);
        const month = clean(req.query.month, 7) || '';
        const items = await listPayouts(pool, { maKy: month, actor: req.user.MaNV, take: 200 });
        res.json({ items });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải lịch sử chi lương từ quỹ chung.' });
    }
};

module.exports = {
    createVouchers,
    resubmitVoucher,
    payVoucher,
    getApprovalDetail,
    approveVoucher: decideVoucher(true),
    rejectVoucher: decideVoucher(false),
    approveAll,
    handOverFund,
    listPending,
    listBoard,
    getAccountantActivity,
    getPayoutHistory
};
