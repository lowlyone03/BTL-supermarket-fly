const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const { notifyInboxChanged } = require('../services/notificationHub');
const { resolvePayAmount, OVERDUE_EXTENSION_DAYS } = require('../services/payableMath');
const {
    ensurePayablePaymentSchema,
    ACTIVE_VOUCHER_APPLY,
    EXTENSION_APPLY,
    DEBT_STATUS_SQL
} = require('../services/payablePaymentSchema');

const clean = (value, max = 120, fallback = null) => String(value ?? '').trim().slice(0, max) || fallback;
const PAYMENT_METHODS = new Set(['Tiền mặt', 'Chuyển khoản']);
const FUND_METHODS = new Set(['Tiền mặt', 'Ủy quyền chuyển khoản']);

let fundColumnsReady = false;
const ensureFundColumns = async (connection) => {
    if (fundColumnsReady) return;
    await ensurePayablePaymentSchema(connection);
    await new sql.Request(connection).query(`
        IF COL_LENGTH('dbo.PhieuChi','HinhThucCapQuy') IS NULL
            ALTER TABLE dbo.PhieuChi ADD HinhThucCapQuy NVARCHAR(40) NULL;
        IF COL_LENGTH('dbo.PhieuChi','NgayCapQuy') IS NULL
            ALTER TABLE dbo.PhieuChi ADD NgayCapQuy DATETIME NULL;
        IF COL_LENGTH('dbo.PhieuChi','GhiChuCapQuy') IS NULL
            ALTER TABLE dbo.PhieuChi ADD GhiChuCapQuy NVARCHAR(500) NULL;`);
    fundColumnsReady = true;
};

const generateId = async (transaction, prefix) => {
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 MaPhieu AS Ma FROM PhieuChi WITH (UPDLOCK,HOLDLOCK)
                WHERE MaPhieu LIKE @Prefix ORDER BY MaPhieu DESC`);
    const last = result.recordset[0]?.Ma;
    return `${prefix}${String(last ? Number(last.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
};

const writeAudit = (transaction, user, action, recordId, content) =>
    logAudit(transaction, { user, action, table: 'PhieuChi', recordId, content, uc: 'UC28', severity: 'Quan trọng' });

const payableSelect = `
    SELECT cn.MaCNPTra,cn.MaNCC,ncc.TenNCC,ncc.MaSoThue,ncc.SDT,ncc.Email,
           cn.MaHDMH,hd.SoHoaDon,hd.MaPO,hd.MaPN,hd.NgayHoaDon,hd.TrangThaiDoiChieu,
           cn.SoTienNo,cn.SoTienDaTra,cn.SoTienConLai,cn.NgayPhatSinh,cn.HanThanhToan,
           ${DEBT_STATUS_SQL} AS TrangThaiCongNo,
           CASE
               WHEN cn.SoTienConLai=0 THEN N'Đã tất toán'
               WHEN pc.TrangThai=N'Thanh toán thất bại' THEN N'Thanh toán thất bại, làm lại'
               WHEN pc.TrangThai=N'Đã duyệt' THEN N'Quản lý đã giao tiền, chờ chi NCC'
               WHEN pc.TrangThai=N'Chờ duyệt' THEN N'Chờ Quản lý giao tiền'
               WHEN pc.TrangThai=N'Từ chối' THEN N'Phiếu chi bị từ chối'
               WHEN pc.MaPhieu IS NULL AND cn.SoTienDaTra>0 THEN N'Thanh toán một phần, có thể lập phiếu tiếp'
               WHEN pc.MaPhieu IS NULL THEN N'Chưa lập Phiếu chi'
               WHEN pc.TrangThai=N'Thanh toán thành công' AND cn.SoTienConLai>0 THEN N'Thanh toán một phần, có thể lập phiếu tiếp'
               ELSE pc.TrangThai
           END AS BuocTatToan,
           DATEDIFF(day,CONVERT(date,GETDATE()),cn.HanThanhToan) AS SoNgayConLai,
           CASE WHEN cn.SoTienConLai>0 AND DATEDIFF(day,cn.HanThanhToan,CONVERT(date,GETDATE()))>=${OVERDUE_EXTENSION_DAYS}
                THEN 1 ELSE 0 END AS QuaHan45,
           CASE WHEN cn.SoTienNo>0 THEN CAST(ROUND(cn.SoTienDaTra * 100.0 / cn.SoTienNo, 1) AS DECIMAL(9,1)) ELSE 0 END AS PhanTramDaTra,
           pc.MaPhieu,pc.SoTien AS SoTienPhieuChi,pc.PhuongThuc,pc.MaGiaoDichNganHang,
           pc.NgayChungTu,pc.NoiDung,pc.MaNV,pc.MaNV_Duyet,pc.NgayDuyet,
           pc.LyDoTuChoi,pc.TrangThai AS TrangThaiPhieuChi,pc.GhiChu,
           pc.HinhThucCapQuy,pc.NgayCapQuy,pc.GhiChuCapQuy,pc.LoaiThanhToan,pc.PhanTram,
           nvLap.TenNV AS NguoiLap,nvDuyet.TenNV AS NguoiDuyet,
           gh.TrangThaiGiaHan,gh.HanMoiGiaHan,gh.HanCuGiaHan
    FROM CongNoPhaiTra cn
    JOIN NhaCungCap ncc ON ncc.MaNCC=cn.MaNCC
    JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
    ${ACTIVE_VOUCHER_APPLY}
    ${EXTENSION_APPLY}
    LEFT JOIN NhanVien nvLap ON nvLap.MaNV=pc.MaNV
    LEFT JOIN NhanVien nvDuyet ON nvDuyet.MaNV=pc.MaNV_Duyet`;

const loadPayablesList = async (pool, { search = '', status = '' } = {}) => {
        const keyword = clean(search, 120, '');
        const filter = clean(status, 30, '');
        await ensureFundColumns(pool);
        const result = await pool.request()
            .input('Keyword', sql.NVarChar, keyword)
            .input('Pattern', sql.NVarChar, `%${keyword}%`)
            .input('Status', sql.NVarChar, filter)
            .query(`${payableSelect}
                WHERE (@Keyword=N'' OR cn.MaCNPTra LIKE @Pattern COLLATE Latin1_General_100_CI_AI OR ncc.TenNCC LIKE @Pattern COLLATE Latin1_General_100_CI_AI
                       OR hd.SoHoaDon LIKE @Pattern COLLATE Latin1_General_100_CI_AI OR hd.MaPO LIKE @Pattern COLLATE Latin1_General_100_CI_AI OR pc.MaPhieu LIKE @Pattern COLLATE Latin1_General_100_CI_AI)
                  AND (@Status=N'' OR pc.TrangThai=@Status
                       OR (@Status=N'Chưa lập Phiếu chi' AND pc.MaPhieu IS NULL))
                ORDER BY CASE WHEN cn.SoTienConLai>0 AND cn.HanThanhToan<=CONVERT(date,GETDATE()) THEN 0 ELSE 1 END,
                         cn.HanThanhToan,cn.NgayPhatSinh DESC`);
        const items = result.recordset;
        return {
            items,
            summary: {
                TongKhoan: items.length,
                TongConLai: items.reduce((sum, item) => sum + Number(item.SoTienConLai || 0), 0),
                ChoDuyet: items.filter(item => item.TrangThaiPhieuChi === 'Chờ duyệt').length,
                ChoThanhToan: items.filter(item => ['Đã duyệt', 'Thanh toán thất bại'].includes(item.TrangThaiPhieuChi)).length
            }
        };
};

const listPayables = async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request().query(`UPDATE CongNoPhaiTra SET TrangThai=N'Quá hạn'
            WHERE SoTienConLai>0 AND HanThanhToan<CONVERT(date,GETDATE()) AND TrangThai<>N'Quá hạn'`);
        res.json(await loadPayablesList(pool, { search: req.query.search, status: req.query.status }));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải công nợ và Phiếu chi.' });
    }
};

const getPayable = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureFundColumns(pool);
        const result = await pool.request().input('Id', sql.VarChar, clean(req.params.id, 20))
            .query(`${payableSelect} WHERE cn.MaCNPTra=@Id OR pc.MaPhieu=@Id`);
        if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy khoản công nợ.' });
        const payable = result.recordset[0];
        const lines = await pool.request().input('MaHD', sql.VarChar, payable.MaHDMH).query(`
            SELECT ct.MaSP,sp.TenSP,sp.DonViTinh,ct.SoLuong,ct.DonGia,ct.ThueSuat,ct.TienThue,ct.ThanhTien
            FROM ChiTietHoaDonMuaHang ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaHDMH=@MaHD ORDER BY sp.TenSP`);
        const payments = await pool.request().input('MaCN', sql.VarChar, payable.MaCNPTra).query(`
            SELECT pc.MaPhieu, pc.SoTien, pc.PhuongThuc, pc.TrangThai, pc.NgayChungTu, pc.NgayDuyet,
                   pc.LoaiThanhToan, pc.PhanTram, pc.NoiDung, nv.TenNV AS NguoiLap
            FROM PhieuChi pc
            LEFT JOIN NhanVien nv ON nv.MaNV = pc.MaNV
            WHERE pc.MaCongNo = @MaCN
            ORDER BY pc.NgayChungTu DESC, pc.MaPhieu DESC`);
        let extensions = [];
        try {
            const ext = await pool.request().input('MaCN', sql.VarChar, payable.MaCNPTra).query(`
                SELECT TOP 8 g.*, nv.TenNV AS NguoiYeuCau, xl.TenNV AS NguoiXuLy
                FROM CongNoGiaHan g
                LEFT JOIN NhanVien nv ON nv.MaNV = g.MaNV_YeuCau
                LEFT JOIN NhanVien xl ON xl.MaNV = g.MaNV_XuLy
                WHERE g.MaCNPTra = @MaCN
                ORDER BY g.NgayYeuCau DESC`);
            extensions = ext.recordset;
        } catch { extensions = []; }
        res.json({ payable, lines: lines.recordset, payments: payments.recordset, extensions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải hồ sơ công nợ.' });
    }
};

const voucherPrefix = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value;
    return `PC${get('year')}${get('month')}`;
};

const insertOnePaymentVoucher = async (user, MaCongNo, { PhuongThuc, NoiDung, GhiChu, LoaiThanhToan, PhanTram, SoTien }) => {
    if (!PAYMENT_METHODS.has(PhuongThuc)) throw new Error('Phương thức Phiếu chi chỉ gồm Tiền mặt hoặc Chuyển khoản.');
    if (!NoiDung) throw new Error('Nội dung chi là bắt buộc.');
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        await ensurePayablePaymentSchema(transaction);
        const debtResult = await new sql.Request(transaction).input('Id', sql.VarChar, MaCongNo).query(`
            SELECT cn.*,hd.SoHoaDon,hd.MaPO,hd.MaPN,hd.TrangThaiDoiChieu,ncc.TenNCC
            FROM CongNoPhaiTra cn WITH (UPDLOCK,HOLDLOCK)
            JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
            JOIN NhaCungCap ncc ON ncc.MaNCC=cn.MaNCC
            WHERE cn.MaCNPTra=@Id`);
        if (!debtResult.recordset.length) throw new Error('Không tìm thấy khoản công nợ.');
        const debt = debtResult.recordset[0];
        if (debt.TrangThaiDoiChieu !== 'Đã khớp' || !debt.MaPO || !debt.MaPN) {
            throw new Error('Chỉ được lập Phiếu chi khi Đơn mua, Phiếu nhập và Hóa đơn đã đối chiếu khớp.');
        }
        if (Number(debt.SoTienConLai) <= 0 || debt.TrangThai === 'Đã tất toán') {
            throw new Error('Khoản công nợ đã được tất toán.');
        }
        const inFlight = await new sql.Request(transaction).input('Id', sql.VarChar, MaCongNo)
            .query(`SELECT TOP 1 MaPhieu, TrangThai FROM PhieuChi WITH (UPDLOCK,HOLDLOCK)
                    WHERE MaCongNo=@Id AND TrangThai IN (N'Chờ duyệt', N'Đã duyệt', N'Thanh toán thất bại')`);
        if (inFlight.recordset.length) {
            throw new Error(`Công nợ đang có Phiếu chi ${inFlight.recordset[0].MaPhieu} (${inFlight.recordset[0].TrangThai}). Tất toán phiếu đó trước khi lập phiếu tiếp.`);
        }
        const planned = resolvePayAmount({
            remaining: debt.SoTienConLai,
            loai: LoaiThanhToan || 'MotLan',
            phanTram: PhanTram,
            soTien: SoTien
        });
        const dueResult = await new sql.Request(transaction).input('Id', sql.VarChar, MaCongNo)
            .query('SELECT CASE WHEN HanThanhToan<=CONVERT(date,GETDATE()) THEN 1 ELSE 0 END AS DenHan FROM CongNoPhaiTra WHERE MaCNPTra=@Id');
        const early = !dueResult.recordset[0].DenHan;
        const MaPhieu = await generateId(transaction, voucherPrefix());
        await new sql.Request(transaction)
            .input('MaPhieu', sql.VarChar, MaPhieu).input('MaNCC', sql.VarChar, debt.MaNCC)
            .input('MaCongNo', sql.VarChar, MaCongNo).input('SoTien', sql.Decimal(18, 2), planned.amount)
            .input('PhuongThuc', sql.NVarChar, PhuongThuc).input('NoiDung', sql.NVarChar, NoiDung)
            .input('MaNV', sql.VarChar, user.MaNV).input('GhiChu', sql.NVarChar, GhiChu)
            .input('LoaiThanhToan', sql.NVarChar, planned.loai)
            .input('PhanTram', sql.Decimal(9, 4), planned.loai === 'PhanTram' ? Number(PhanTram) : null)
            .query(`INSERT INTO PhieuChi
                    (MaPhieu,MaNCC,MaCongNo,SoTien,PhuongThuc,MaGiaoDichNganHang,NgayChungTu,
                     NoiDung,MaNV,MaNV_Duyet,NgayDuyet,LyDoTuChoi,TrangThai,GhiChu,LoaiThanhToan,PhanTram)
                    VALUES(@MaPhieu,@MaNCC,@MaCongNo,@SoTien,@PhuongThuc,NULL,GETDATE(),
                           @NoiDung,@MaNV,NULL,NULL,NULL,N'Chờ duyệt',@GhiChu,@LoaiThanhToan,@PhanTram)`);
        const payLabel = planned.remainingAfter > 0 ? 'từng phần' : 'một lần (hết số còn lại)';
        await writeAudit(transaction, user, 'Lập và gửi duyệt Phiếu chi', MaPhieu,
            `${early ? 'Trước hạn. ' : ''}Công nợ ${MaCongNo}; chi ${payLabel} ${planned.amount}/${Number(debt.SoTienConLai)} cho ${debt.TenNCC}`);
        await transaction.commit();
        return {
            message: planned.remainingAfter > 0
                ? `Đã lập Phiếu chi ${MaPhieu} số ${planned.amount} (còn lại sau khi duyệt+chi dự kiến ${planned.remainingAfter}) và gửi Quản lý duyệt. Công nợ chưa giảm.`
                : `Đã lập Phiếu chi ${MaPhieu} tất toán số còn lại ${planned.amount} và gửi Quản lý duyệt. Công nợ chưa giảm.`,
            MaPhieu, MaCongNo, MaNCC: debt.MaNCC, TenNCC: debt.TenNCC,
            SoTien: planned.amount, SoTienConLaiSau: planned.remainingAfter,
            TrangThai: 'Chờ duyệt', TatToanSom: early, LoaiThanhToan: planned.loai, Capped: planned.capped
        };
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        throw error;
    }
};

const createVoucher = async (req, res) => {
    try {
        const result = await insertOnePaymentVoucher(req.user, clean(req.params.id, 20), {
            PhuongThuc: clean(req.body.PhuongThuc, 30),
            NoiDung: clean(req.body.NoiDung, 500),
            GhiChu: clean(req.body.GhiChu, 500),
            LoaiThanhToan: clean(req.body.LoaiThanhToan, 20) || 'MotLan',
            PhanTram: req.body.PhanTram,
            SoTien: req.body.SoTien
        });
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const createVouchersBulk = async (req, res) => {
    try {
        const ids = [...new Set((Array.isArray(req.body.MaCNPTra) ? req.body.MaCNPTra : [])
            .map(id => clean(id, 20)).filter(Boolean))];
        const PhuongThuc = clean(req.body.PhuongThuc, 30);
        const NoiDung = clean(req.body.NoiDung, 500);
        const GhiChu = clean(req.body.GhiChu, 500);
        if (!ids.length) throw new Error('Chọn ít nhất một khoản công nợ chưa lập Phiếu chi.');
        if (ids.length > 30) throw new Error('Mỗi đợt tối đa 30 khoản công nợ.');
        if (!PAYMENT_METHODS.has(PhuongThuc)) throw new Error('Phương thức Phiếu chi chỉ gồm Tiền mặt hoặc Chuyển khoản.');
        if (!NoiDung) throw new Error('Nội dung chi là bắt buộc.');
        const pool = await poolPromise;
        await ensureFundColumns(pool);
        const lookup = pool.request();
        ids.forEach((id, index) => lookup.input(`d${index}`, sql.VarChar, id));
        const preview = await lookup.query(`${payableSelect}
            WHERE cn.MaCNPTra IN (${ids.map((_, index) => `@d${index}`).join(',')})`);
        if (preview.recordset.length !== ids.length) throw new Error('Có khoản công nợ không tồn tại hoặc bạn không xem được.');
        const suppliers = [...new Set(preview.recordset.map(row => row.MaNCC))];
        if (suppliers.length > 1) {
            throw new Error('Chỉ lập phiếu chi hàng loạt cho cùng một Nhà cung cấp. Mỗi Nhà cung cấp một đợt — không gộp nhiều NCC.');
        }
        const created = [];
        const errors = [];
        for (const id of ids) {
            const row = preview.recordset.find(item => item.MaCNPTra === id);
            const lineContent = clean(`${NoiDung} (${id} · HĐ ${row?.SoHoaDon || ''})`.trim(), 500);
            try {
                created.push(await insertOnePaymentVoucher(req.user, id, {
                    PhuongThuc, NoiDung: lineContent, GhiChu
                }));
            } catch (error) {
                errors.push({ MaCNPTra: id, message: error.message });
            }
        }
        if (!created.length) {
            return res.status(400).json({
                message: errors[0]?.message || 'Không lập được Phiếu chi nào.',
                items: [], errors
            });
        }
        const ncc = created[0].TenNCC;
        res.status(201).json({
            message: errors.length
                ? `Đã lập ${created.length}/${ids.length} Phiếu chi cho ${ncc}. ${errors.length} khoản lỗi — công nợ chưa đổi trên phiếu đã lập.`
                : `Đã lập ${created.length} Phiếu chi cho ${ncc} và gửi Quản lý duyệt + giao tiền. Mỗi khoản một phiếu, công nợ chưa đổi.`,
            items: created,
            errors
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const resubmitVoucher = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const MaPhieu = clean(req.params.id, 20);
        const PhuongThuc = clean(req.body.PhuongThuc, 30);
        const NoiDung = clean(req.body.NoiDung, 500);
        const GhiChu = clean(req.body.GhiChu, 500);
        if (!PAYMENT_METHODS.has(PhuongThuc) || !NoiDung) throw new Error('Phương thức và nội dung chi không hợp lệ.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction).input('Id', sql.VarChar, MaPhieu).query(`
            SELECT pc.*,cn.SoTienConLai,cn.TrangThai TrangThaiCongNo
            FROM PhieuChi pc WITH (UPDLOCK,HOLDLOCK)
            JOIN CongNoPhaiTra cn WITH (UPDLOCK,HOLDLOCK) ON cn.MaCNPTra=pc.MaCongNo
            WHERE pc.MaPhieu=@Id`);
        if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu chi.');
        const voucher = current.recordset[0];
        if (voucher.TrangThai !== 'Từ chối') throw new Error('Chỉ Phiếu chi bị từ chối mới được chỉnh sửa và gửi lại.');
        if (Number(voucher.SoTienConLai) <= 0 || voucher.TrangThaiCongNo === 'Đã tất toán') throw new Error('Công nợ đã được tất toán.');
        await new sql.Request(transaction).input('Id', sql.VarChar, MaPhieu)
            .input('SoTien', sql.Decimal(18, 2), voucher.SoTien)
            .input('PhuongThuc', sql.NVarChar, PhuongThuc).input('NoiDung', sql.NVarChar, NoiDung)
            .input('GhiChu', sql.NVarChar, GhiChu).query(`
                UPDATE PhieuChi SET SoTien=@SoTien,PhuongThuc=@PhuongThuc,NoiDung=@NoiDung,GhiChu=@GhiChu,
                    MaNV_Duyet=NULL,NgayDuyet=NULL,LyDoTuChoi=NULL,TrangThai=N'Chờ duyệt'
                WHERE MaPhieu=@Id`);
        await writeAudit(transaction, req.user, 'Chỉnh sửa và gửi lại Phiếu chi', MaPhieu,
            `Gửi lại Phiếu chi cho công nợ ${voucher.MaCongNo}`);
        await transaction.commit();
        res.json({ message: `Đã chỉnh sửa và gửi lại Phiếu chi ${MaPhieu}.`, MaPhieu, TrangThai: 'Chờ duyệt' });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const payVoucher = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const MaPhieu = clean(req.params.id, 20);
        if (typeof req.body.ThanhCong !== 'boolean') throw new Error('Phải ghi nhận rõ kết quả thanh toán thành công hoặc thất bại.');
        const success = req.body.ThanhCong;
        const bankCode = clean(req.body.MaGiaoDichNganHang, 50);
        const paymentNote = clean(req.body.GhiChuThanhToan, 500);
        if (!success && !paymentNote) throw new Error('Thanh toán thất bại phải ghi nguyên nhân để thực hiện lại.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction).input('Id', sql.VarChar, MaPhieu).query(`
            SELECT pc.*,cn.SoTienNo,cn.SoTienDaTra,cn.SoTienConLai,cn.TrangThai TrangThaiCongNo,cn.MaHDMH
            FROM PhieuChi pc WITH (UPDLOCK,HOLDLOCK)
            JOIN CongNoPhaiTra cn WITH (UPDLOCK,HOLDLOCK) ON cn.MaCNPTra=pc.MaCongNo
            WHERE pc.MaPhieu=@Id`);
        if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu chi.');
        const voucher = current.recordset[0];
        if (!['Đã duyệt', 'Thanh toán thất bại'].includes(voucher.TrangThai)) {
            throw new Error('Phiếu chi phải được Quản lý duyệt trước khi Kế toán thanh toán.');
        }
        const payAmount = Number(voucher.SoTien);
        const remaining = Number(voucher.SoTienConLai);
        if (payAmount <= 0 || remaining <= 0) {
            throw new Error('Không còn số phải trả trên công nợ này.');
        }
        if (payAmount - remaining > 0.009) {
            throw new Error('Số tiền Phiếu chi lớn hơn số còn lại. Hãy lập lại phiếu theo số còn lại.');
        }
        const apply = Math.min(payAmount, remaining);
        if (success && voucher.PhuongThuc === 'Chuyển khoản' && !bankCode) {
            throw new Error('Thanh toán chuyển khoản thành công phải có mã giao dịch ngân hàng hoặc ủy nhiệm chi.');
        }
        const mergedNote = clean([voucher.GhiChu, paymentNote].filter(Boolean).join(' | '), 500);
        await new sql.Request(transaction).input('Id', sql.VarChar, MaPhieu)
            .input('BankCode', sql.VarChar, voucher.PhuongThuc === 'Chuyển khoản' ? bankCode : null)
            .input('GhiChu', sql.NVarChar, mergedNote)
            .input('TrangThai', sql.NVarChar, success ? 'Thanh toán thành công' : 'Thanh toán thất bại')
            .query(`UPDATE PhieuChi SET MaGiaoDichNganHang=@BankCode,GhiChu=@GhiChu,TrangThai=@TrangThai
                    WHERE MaPhieu=@Id`);
        if (success) {
            const paid = Number(voucher.SoTienDaTra) + apply;
            const left = Math.max(0, Number(voucher.SoTienNo) - paid);
            const debtStatus = left <= 0 ? 'Đã tất toán' : 'Thanh toán một phần';
            await new sql.Request(transaction)
                .input('MaCN', sql.VarChar, voucher.MaCongNo)
                .input('DaTra', sql.Decimal(18, 2), paid)
                .input('ConLai', sql.Decimal(18, 2), left)
                .input('TrangThai', sql.NVarChar, debtStatus)
                .query(`UPDATE CongNoPhaiTra SET SoTienDaTra=@DaTra,SoTienConLai=@ConLai,TrangThai=@TrangThai
                        WHERE MaCNPTra=@MaCN`);
            if (left <= 0) {
                await new sql.Request(transaction).input('MaHD', sql.VarChar, voucher.MaHDMH)
                    .query(`UPDATE HoaDonMuaHang SET TrangThai=N'Đã thanh toán' WHERE MaHDMH=@MaHD`);
            }
        }
        await writeAudit(transaction, req.user,
            success ? 'Thanh toán Phiếu chi thành công' : 'Ghi nhận thanh toán Phiếu chi thất bại',
            MaPhieu,
            success
                ? `Công nợ ${voucher.MaCongNo} trừ ${apply}; còn lại ${Math.max(0, Number(voucher.SoTienNo) - (Number(voucher.SoTienDaTra) + apply))}`
                : `Công nợ ${voucher.MaCongNo} giữ nguyên; lý do: ${paymentNote}`);
        const { postSupplierPayment } = require('../services/accountingHooks');
        await postSupplierPayment(transaction, { maPhieu: MaPhieu, maNV: req.user.MaNV, user: req.user, success });
        await transaction.commit();
        const leftAfter = success
            ? Math.max(0, Number(voucher.SoTienNo) - (Number(voucher.SoTienDaTra) + apply))
            : remaining;
        res.json({
            message: success
                ? (leftAfter > 0
                    ? `Thanh toán thành công ${apply}. Công nợ ${voucher.MaCongNo} còn lại ${leftAfter}. Có thể lập phiếu chi tiếp cho phần còn lại.`
                    : `Thanh toán thành công. Công nợ ${voucher.MaCongNo} đã tất toán.`)
                : 'Đã ghi nhận thanh toán thất bại. Công nợ giữ nguyên và có thể thực hiện lại trên Phiếu chi này.',
            MaPhieu, MaCongNo: voucher.MaCongNo,
            SoTienChi: apply,
            SoTienConLai: leftAfter,
            TrangThai: success ? 'Thanh toán thành công' : 'Thanh toán thất bại',
            CongNoDaGiam: success
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const getApprovalDetail = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureFundColumns(pool);
        const result = await pool.request().input('Id', sql.VarChar, clean(req.params.id, 20))
            .query(`${payableSelect} WHERE pc.MaPhieu=@Id`);
        if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy Phiếu chi.' });
        const voucher = result.recordset[0];
        const lines = await pool.request().input('MaHD', sql.VarChar, voucher.MaHDMH).query(`
            SELECT ct.MaSP,sp.TenSP,sp.DonViTinh,ct.SoLuong,ct.DonGia,ct.ThueSuat,ct.ThanhTien
            FROM ChiTietHoaDonMuaHang ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaHDMH=@MaHD ORDER BY sp.TenSP`);
        res.json({ voucher, lines: lines.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải hồ sơ Phiếu chi.' });
    }
};

const decideVoucher = approved => async (req, res) => {
    const pool = await poolPromise;
    await ensureFundColumns(pool);
    const transaction = new sql.Transaction(pool);
    try {
        const MaPhieu = clean(req.params.id, 20);
        const reason = clean(req.body.LyDo, 500);
        const fundMethod = clean(req.body.HinhThucCapQuy, 40);
        const fundNote = clean(req.body.GhiChuCapQuy, 500);
        if (!approved && !reason) throw new Error('Từ chối Phiếu chi phải ghi lý do.');
        if (approved && !FUND_METHODS.has(fundMethod)) {
            throw new Error('Quản lý phải chọn cách giao tiền cho Kế toán: Tiền mặt hoặc Ủy quyền chuyển khoản.');
        }
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction).input('Id', sql.VarChar, MaPhieu).query(`
            SELECT pc.*,cn.SoTienConLai,cn.TrangThai TrangThaiCongNo,
                   hd.TrangThaiDoiChieu,hd.MaPO,hd.MaPN
            FROM PhieuChi pc WITH (UPDLOCK,HOLDLOCK)
            JOIN CongNoPhaiTra cn WITH (UPDLOCK,HOLDLOCK) ON cn.MaCNPTra=pc.MaCongNo
            JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
            WHERE pc.MaPhieu=@Id`);
        if (!current.recordset.length) throw new Error('Không tìm thấy Phiếu chi.');
        const voucher = current.recordset[0];
        if (voucher.TrangThai !== 'Chờ duyệt') throw new Error('Phiếu chi không còn ở trạng thái Chờ duyệt.');
        if (approved && (voucher.TrangThaiDoiChieu !== 'Đã khớp' || !voucher.MaPO || !voucher.MaPN)) {
            throw new Error('Bộ chứng từ ba bên chưa đủ điều kiện phê duyệt.');
        }
        if (approved && (Number(voucher.SoTien) <= 0 || Number(voucher.SoTien) - Number(voucher.SoTienConLai) > 0.009)) {
            throw new Error('Số tiền Phiếu chi phải lớn hơn 0 và không vượt số công nợ còn lại.');
        }
        if (approved && voucher.PhuongThuc === 'Tiền mặt' && fundMethod !== 'Tiền mặt') {
            throw new Error('Phiếu chi tiền mặt: Quản lý phải giao đủ tiền mặt cho Kế toán.');
        }
        if (approved && voucher.PhuongThuc === 'Chuyển khoản' && fundMethod !== 'Ủy quyền chuyển khoản') {
            throw new Error('Phiếu chi chuyển khoản: Quản lý ủy quyền cho Kế toán dùng tài khoản cửa hàng.');
        }
        await new sql.Request(transaction).input('Id', sql.VarChar, MaPhieu)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('LyDo', sql.NVarChar, approved ? null : reason)
            .input('TrangThai', sql.NVarChar, approved ? 'Đã duyệt' : 'Từ chối')
            .input('HinhThucCapQuy', sql.NVarChar, approved ? fundMethod : null)
            .input('GhiChuCapQuy', sql.NVarChar, approved ? fundNote : null)
            .query(`UPDATE PhieuChi SET MaNV_Duyet=@MaNV,NgayDuyet=GETDATE(),LyDoTuChoi=@LyDo,
                    TrangThai=@TrangThai,HinhThucCapQuy=@HinhThucCapQuy,NgayCapQuy=CASE WHEN @TrangThai=N'Đã duyệt' THEN GETDATE() ELSE NULL END,
                    GhiChuCapQuy=@GhiChuCapQuy WHERE MaPhieu=@Id`);
        await writeAudit(transaction, req.user, approved ? 'Phê duyệt Phiếu chi' : 'Từ chối Phiếu chi', MaPhieu,
            approved ? `Đã giao tiền (${fundMethod}) cho Kế toán tất toán ${voucher.MaCongNo}; chưa giảm công nợ`
                : `Từ chối Phiếu chi; công nợ giữ nguyên. Lý do: ${reason}`);
        await transaction.commit();
        notifyInboxChanged({
            action: approved ? 'Phê duyệt Phiếu chi' : 'Từ chối Phiếu chi',
            table: 'PhieuChi',
            recordId: MaPhieu
        });
        res.json({
            message: approved
                ? `Đã duyệt và giao tiền cho Kế toán trên Phiếu chi ${MaPhieu}. Công nợ chỉ giảm sau khi Kế toán thanh toán thành công cho Nhà cung cấp.`
                : `Đã từ chối Phiếu chi ${MaPhieu}.`,
            MaPhieu, TrangThai: approved ? 'Đã duyệt' : 'Từ chối', CongNoDaGiam: false,
            HinhThucCapQuy: approved ? fundMethod : null
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const cardJson = (payload = {}) => JSON.stringify({
    loai: payload.loai || 'GiaHanCongNo',
    ma: String(payload.ma || '').slice(0, 24),
    title: String(payload.title || '').slice(0, 72),
    MaCNPTra: payload.MaCNPTra,
    TenNCC: String(payload.TenNCC || '').slice(0, 60),
    SoHoaDon: payload.SoHoaDon,
    SoTienNo: payload.SoTienNo,
    SoTienDaTra: payload.SoTienDaTra,
    SoTienConLai: payload.SoTienConLai,
    HanCu: payload.HanCu,
    HanMoi: payload.HanMoi,
    TrangThai: String(payload.TrangThai || '').slice(0, 48),
    GhiChu: String(payload.GhiChu || '').slice(0, 80)
});

const postExtensionChat = async (user, payload) => {
    try {
        const { postRoomCard } = require('../services/chatService');
        const pool = await poolPromise;
        return await postRoomCard(pool, user, {
            khoa: 'mua-hang',
            allowGuest: true,
            noiDung: cardJson(payload),
            voucher: { loai: payload.loai || 'GiaHanCongNo', ma: String(payload.ma || payload.MaCNPTra || '') }
        });
    } catch (error) {
        console.error('Chat gia hạn NCC:', error.message);
        return null;
    }
};

const requestExtension = async (req, res) => {
    const pool = await poolPromise;
    await ensureFundColumns(pool);
    const transaction = new sql.Transaction(pool);
    try {
        const maCN = clean(req.params.id, 20);
        const note = clean(req.body.GhiChu, 500);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const debt = await new sql.Request(transaction).input('Id', sql.VarChar, maCN).query(`
            SELECT cn.*, ncc.TenNCC
            FROM CongNoPhaiTra cn WITH (UPDLOCK, HOLDLOCK)
            JOIN NhaCungCap ncc ON ncc.MaNCC = cn.MaNCC
            WHERE cn.MaCNPTra = @Id`);
        if (!debt.recordset.length) throw new Error('Không tìm thấy khoản công nợ.');
        const row = debt.recordset[0];
        if (Number(row.SoTienConLai) <= 0) throw new Error('Khoản này đã tất toán, không cần gia hạn.');
        const overdue = await new sql.Request(transaction).input('Id', sql.VarChar, maCN).query(`
            SELECT DATEDIFF(day, cn.HanThanhToan, CONVERT(date, GETDATE())) AS QuaNgay
            FROM CongNoPhaiTra cn WHERE cn.MaCNPTra = @Id`);
        if (Number(overdue.recordset[0]?.QuaNgay || 0) < OVERDUE_EXTENSION_DAYS) {
            throw new Error(`Chỉ nhờ mua hàng xin gia hạn khi quá hạn từ ${OVERDUE_EXTENSION_DAYS} ngày.`);
        }
        const open = await new sql.Request(transaction).input('Id', sql.VarChar, maCN).query(`
            SELECT TOP 1 MaGiaHan FROM CongNoGiaHan
            WHERE MaCNPTra = @Id AND TrangThai IN (N'ChoLienHe', N'DaLienHe')
            ORDER BY MaGiaHan DESC`);
        if (open.recordset.length) {
            await transaction.commit();
            return res.json({
                message: 'Đã nhờ mua hàng xin gia hạn. Theo dõi trạng thái trên hồ sơ công nợ.',
                MaGiaHan: open.recordset[0].MaGiaHan,
                MaCNPTra: maCN,
                TrangThaiGiaHan: 'ChoLienHe',
                KhoaChat: 'mua-hang'
            });
        }
        const inserted = await new sql.Request(transaction)
            .input('MaCN', sql.VarChar, maCN)
            .input('MaNCC', sql.VarChar, row.MaNCC)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('HanCu', sql.Date, row.HanThanhToan)
            .input('GhiChu', sql.NVarChar, note)
            .query(`INSERT INTO CongNoGiaHan (MaCNPTra, MaNCC, MaNV_YeuCau, HanCu, TrangThai, GhiChu, MaPhongChat)
                    OUTPUT INSERTED.MaGiaHan
                    VALUES (@MaCN, @MaNCC, @MaNV, @HanCu, N'ChoLienHe', @GhiChu, N'CH_MUAHANG')`);
        const maGiaHan = inserted.recordset[0].MaGiaHan;
        await transaction.commit();
        const chat = await postExtensionChat(req.user, {
            loai: 'GiaHanCongNo',
            ma: String(maGiaHan),
            title: 'Kế toán nhờ xin gia hạn NCC',
            MaCNPTra: maCN,
            TenNCC: row.TenNCC,
            SoHoaDon: row.MaHDMH,
            SoTienNo: Number(row.SoTienNo),
            SoTienDaTra: Number(row.SoTienDaTra),
            SoTienConLai: Number(row.SoTienConLai),
            HanCu: row.HanThanhToan,
            TrangThai: 'Chờ mua hàng liên hệ NCC',
            GhiChu: note
        });
        if (chat?.maTin) {
            await pool.request()
                .input('Ma', sql.Int, maGiaHan)
                .input('MaTin', sql.BigInt, chat.maTin)
                .query('UPDATE CongNoGiaHan SET MaTin = @MaTin WHERE MaGiaHan = @Ma');
        }
        notifyInboxChanged({ action: 'Nhờ mua hàng xin gia hạn NCC', table: 'CongNoGiaHan', recordId: String(maGiaHan) });
        res.status(201).json({
            message: 'Đã nhờ mua hàng xin gia hạn. Mua hàng sẽ liên hệ NCC; bạn theo dõi trạng thái trên hồ sơ công nợ.',
            MaGiaHan: maGiaHan,
            MaCNPTra: maCN,
            TrangThaiGiaHan: 'ChoLienHe',
            KhoaChat: 'mua-hang',
            MaTin: chat?.maTin || null
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const grantExtension = async (req, res) => {
    const pool = await poolPromise;
    await ensureFundColumns(pool);
    const transaction = new sql.Transaction(pool);
    try {
        const maCN = clean(req.params.id, 20);
        const hanMoi = clean(req.body.HanMoi, 10);
        const note = clean(req.body.GhiChu, 500);
        const maGiaHan = Number(req.body.MaGiaHan) || 0;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(hanMoi || '')) {
            throw new Error('Nhập hạn mới theo dạng YYYY-MM-DD sau khi NCC đồng ý gia hạn.');
        }
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const debt = await new sql.Request(transaction).input('Id', sql.VarChar, maCN).query(`
            SELECT cn.*, ncc.TenNCC
            FROM CongNoPhaiTra cn WITH (UPDLOCK, HOLDLOCK)
            JOIN NhaCungCap ncc ON ncc.MaNCC = cn.MaNCC
            WHERE cn.MaCNPTra = @Id`);
        if (!debt.recordset.length) throw new Error('Không tìm thấy khoản công nợ.');
        const row = debt.recordset[0];
        if (Number(row.SoTienConLai) <= 0) throw new Error('Khoản này đã tất toán.');
        const next = new Date(`${hanMoi}T00:00:00+07:00`);
        const old = row.HanThanhToan ? new Date(row.HanThanhToan) : null;
        if (Number.isNaN(next.getTime())) throw new Error('Hạn mới không hợp lệ.');
        if (old && next.getTime() <= old.getTime()) {
            throw new Error('Hạn mới phải sau hạn hiện tại.');
        }
        const days = old ? Math.round((next - old) / 86400000) : null;
        let giaHanId = maGiaHan;
        if (!giaHanId) {
            const open = await new sql.Request(transaction).input('Id', sql.VarChar, maCN).query(`
                SELECT TOP 1 MaGiaHan FROM CongNoGiaHan
                WHERE MaCNPTra = @Id AND TrangThai IN (N'ChoLienHe', N'DaLienHe')
                ORDER BY MaGiaHan DESC`);
            giaHanId = open.recordset[0]?.MaGiaHan || 0;
        }
        if (!giaHanId) {
            const created = await new sql.Request(transaction)
                .input('MaCN', sql.VarChar, maCN)
                .input('MaNCC', sql.VarChar, row.MaNCC)
                .input('MaNV', sql.VarChar, req.user.MaNV)
                .input('HanCu', sql.Date, row.HanThanhToan)
                .input('HanMoi', sql.Date, hanMoi)
                .input('SoNgay', sql.Int, days)
                .input('GhiChu', sql.NVarChar, note)
                .query(`INSERT INTO CongNoGiaHan (MaCNPTra, MaNCC, MaNV_YeuCau, MaNV_XuLy, HanCu, HanMoi, SoNgayThem, TrangThai, GhiChu, MaPhongChat)
                        OUTPUT INSERTED.MaGiaHan
                        VALUES (@MaCN, @MaNCC, @MaNV, @MaNV, @HanCu, @HanMoi, @SoNgay, N'DaGiaHan', @GhiChu, N'CH_MUAHANG')`);
            giaHanId = created.recordset[0].MaGiaHan;
        } else {
            await new sql.Request(transaction)
                .input('Ma', sql.Int, giaHanId)
                .input('MaNV', sql.VarChar, req.user.MaNV)
                .input('HanMoi', sql.Date, hanMoi)
                .input('SoNgay', sql.Int, days)
                .input('GhiChu', sql.NVarChar, note)
                .query(`UPDATE CongNoGiaHan
                        SET MaNV_XuLy = @MaNV, HanMoi = @HanMoi, SoNgayThem = @SoNgay,
                            TrangThai = N'DaGiaHan', GhiChu = COALESCE(@GhiChu, GhiChu)
                        WHERE MaGiaHan = @Ma`);
        }
        await new sql.Request(transaction)
            .input('MaCN', sql.VarChar, maCN)
            .input('HanMoi', sql.Date, hanMoi)
            .query(`UPDATE CongNoPhaiTra SET HanThanhToan = @HanMoi, TrangThai = N'Thanh toán một phần'
                    WHERE MaCNPTra = @MaCN AND SoTienConLai > 0`);
        if (Number(row.SoTienDaTra) <= 0) {
            await new sql.Request(transaction).input('MaCN', sql.VarChar, maCN)
                .query(`UPDATE CongNoPhaiTra SET TrangThai = N'Chưa thanh toán'
                        WHERE MaCNPTra = @MaCN AND SoTienDaTra = 0 AND SoTienConLai > 0`);
        }
        await transaction.commit();
        await postExtensionChat(req.user, {
            loai: 'GiaHanCongNo',
            ma: String(giaHanId),
            title: 'NCC đã đồng ý gia hạn',
            MaCNPTra: maCN,
            TenNCC: row.TenNCC,
            SoTienConLai: Number(row.SoTienConLai),
            HanCu: row.HanThanhToan,
            HanMoi: hanMoi,
            TrangThai: 'Đã gia hạn',
            GhiChu: note
        });
        notifyInboxChanged({ action: 'Ghi hạn mới NCC', table: 'CongNoGiaHan', recordId: String(giaHanId) });
        res.json({
            message: `Đã ghi hạn mới ${hanMoi} cho ${row.TenNCC}. Công nợ ${maCN} không còn quá hạn theo hạn cũ.`,
            MaGiaHan: giaHanId,
            MaCNPTra: maCN,
            HanMoi: hanMoi,
            TrangThaiGiaHan: 'DaGiaHan',
            KhoaChat: 'mua-hang'
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const listExtensionQueue = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureFundColumns(pool);
        const result = await pool.request().query(`
            SELECT TOP 30 g.MaGiaHan, g.MaCNPTra, g.TrangThai, g.HanCu, g.HanMoi, g.NgayYeuCau, g.GhiChu,
                   ncc.TenNCC, ncc.MaNCC, ncc.SDT, cn.SoTienConLai, nv.TenNV AS NguoiYeuCau
            FROM CongNoGiaHan g
            JOIN CongNoPhaiTra cn ON cn.MaCNPTra = g.MaCNPTra
            JOIN NhaCungCap ncc ON ncc.MaNCC = g.MaNCC
            LEFT JOIN NhanVien nv ON nv.MaNV = g.MaNV_YeuCau
            WHERE g.TrangThai IN (N'ChoLienHe', N'DaLienHe') AND cn.SoTienConLai > 0
            ORDER BY g.NgayYeuCau DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không tải được việc xin gia hạn NCC.' });
    }
};

module.exports = {
    loadPayablesList,
    listPayables,
    listExtensionQueue,
    getPayable,
    createVoucher,
    createVouchersBulk,
    resubmitVoucher,
    payVoucher,
    getApprovalDetail,
    approveVoucher: decideVoucher(true),
    rejectVoucher: decideVoucher(false),
    requestExtension,
    grantExtension,
    ensureFundColumns
};
