const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');

const clean = (value, max = 120, fallback = null) => String(value ?? '').trim().slice(0, max) || fallback;
const PAYMENT_METHODS = new Set(['Tiền mặt', 'Chuyển khoản']);
const FUND_METHODS = new Set(['Tiền mặt', 'Ủy quyền chuyển khoản']);

let fundColumnsReady = false;
const ensureFundColumns = async (connection) => {
    if (fundColumnsReady) return;
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
           CASE WHEN cn.SoTienConLai=0 THEN N'Đã tất toán'
                WHEN cn.HanThanhToan<CONVERT(date,GETDATE()) THEN N'Quá hạn'
                ELSE N'Đang nợ' END AS TrangThaiCongNo,
           CASE
               WHEN cn.SoTienConLai=0 OR pc.TrangThai=N'Thanh toán thành công' THEN N'Đã tất toán'
               WHEN pc.TrangThai=N'Thanh toán thất bại' THEN N'Thanh toán thất bại, làm lại'
               WHEN pc.TrangThai=N'Đã duyệt' THEN N'Quản lý đã giao tiền, chờ chi NCC'
               WHEN pc.TrangThai=N'Chờ duyệt' THEN N'Chờ Quản lý giao tiền'
               WHEN pc.TrangThai=N'Từ chối' THEN N'Phiếu chi bị từ chối'
               WHEN pc.MaPhieu IS NULL THEN N'Chưa lập Phiếu chi'
               ELSE pc.TrangThai
           END AS BuocTatToan,
           DATEDIFF(day,CONVERT(date,GETDATE()),cn.HanThanhToan) AS SoNgayConLai,
           pc.MaPhieu,pc.SoTien AS SoTienPhieuChi,pc.PhuongThuc,pc.MaGiaoDichNganHang,
           pc.NgayChungTu,pc.NoiDung,pc.MaNV,pc.MaNV_Duyet,pc.NgayDuyet,
           pc.LyDoTuChoi,pc.TrangThai AS TrangThaiPhieuChi,pc.GhiChu,
           pc.HinhThucCapQuy,pc.NgayCapQuy,pc.GhiChuCapQuy,
           nvLap.TenNV AS NguoiLap,nvDuyet.TenNV AS NguoiDuyet
    FROM CongNoPhaiTra cn
    JOIN NhaCungCap ncc ON ncc.MaNCC=cn.MaNCC
    JOIN HoaDonMuaHang hd ON hd.MaHDMH=cn.MaHDMH
    LEFT JOIN PhieuChi pc ON pc.MaCongNo=cn.MaCNPTra
    LEFT JOIN NhanVien nvLap ON nvLap.MaNV=pc.MaNV
    LEFT JOIN NhanVien nvDuyet ON nvDuyet.MaNV=pc.MaNV_Duyet`;

const listPayables = async (req, res) => {
    try {
        const keyword = clean(req.query.search, 120, '');
        const status = clean(req.query.status, 30, '');
        const pool = await poolPromise;
        await ensureFundColumns(pool);
        await pool.request().query(`UPDATE CongNoPhaiTra SET TrangThai=N'Quá hạn'
            WHERE SoTienConLai>0 AND HanThanhToan<CONVERT(date,GETDATE()) AND TrangThai<>N'Quá hạn'`);
        const result = await pool.request()
            .input('Keyword', sql.NVarChar, keyword)
            .input('Pattern', sql.NVarChar, `%${keyword}%`)
            .input('Status', sql.NVarChar, status)
            .query(`${payableSelect}
                WHERE (@Keyword=N'' OR cn.MaCNPTra LIKE @Pattern COLLATE Latin1_General_100_CI_AI OR ncc.TenNCC LIKE @Pattern COLLATE Latin1_General_100_CI_AI
                       OR hd.SoHoaDon LIKE @Pattern COLLATE Latin1_General_100_CI_AI OR hd.MaPO LIKE @Pattern COLLATE Latin1_General_100_CI_AI OR pc.MaPhieu LIKE @Pattern COLLATE Latin1_General_100_CI_AI)
                  AND (@Status=N'' OR pc.TrangThai=@Status
                       OR (@Status=N'Chưa lập Phiếu chi' AND pc.MaPhieu IS NULL))
                ORDER BY CASE WHEN cn.SoTienConLai>0 AND cn.HanThanhToan<=CONVERT(date,GETDATE()) THEN 0 ELSE 1 END,
                         cn.HanThanhToan,cn.NgayPhatSinh DESC`);
        const items = result.recordset;
        res.json({
            items,
            summary: {
                TongKhoan: items.length,
                TongConLai: items.reduce((sum, item) => sum + Number(item.SoTienConLai || 0), 0),
                ChoDuyet: items.filter(item => item.TrangThaiPhieuChi === 'Chờ duyệt').length,
                ChoThanhToan: items.filter(item => ['Đã duyệt', 'Thanh toán thất bại'].includes(item.TrangThaiPhieuChi)).length
            }
        });
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
        res.json({ payable, lines: lines.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải hồ sơ công nợ.' });
    }
};

const createVoucher = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const MaCongNo = clean(req.params.id, 20);
        const PhuongThuc = clean(req.body.PhuongThuc, 30);
        const NoiDung = clean(req.body.NoiDung, 500);
        const GhiChu = clean(req.body.GhiChu, 500);
        if (!PAYMENT_METHODS.has(PhuongThuc)) throw new Error('Phương thức Phiếu chi chỉ gồm Tiền mặt hoặc Chuyển khoản.');
        if (!NoiDung) throw new Error('Nội dung chi là bắt buộc.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
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
        const dueResult = await new sql.Request(transaction).input('Id', sql.VarChar, MaCongNo)
            .query('SELECT CASE WHEN HanThanhToan<=CONVERT(date,GETDATE()) THEN 1 ELSE 0 END AS DenHan FROM CongNoPhaiTra WHERE MaCNPTra=@Id');
        const early = !dueResult.recordset[0].DenHan;
        const existing = await new sql.Request(transaction).input('Id', sql.VarChar, MaCongNo)
            .query('SELECT MaPhieu FROM PhieuChi WITH (UPDLOCK,HOLDLOCK) WHERE MaCongNo=@Id');
        if (existing.recordset.length) throw new Error(`Công nợ đã có Phiếu chi ${existing.recordset[0].MaPhieu}; không được tạo Phiếu chi thứ hai.`);
        const now = new Date();
        const prefix = `PC${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const MaPhieu = await generateId(transaction, prefix);
        await new sql.Request(transaction)
            .input('MaPhieu', sql.VarChar, MaPhieu).input('MaNCC', sql.VarChar, debt.MaNCC)
            .input('MaCongNo', sql.VarChar, MaCongNo).input('SoTien', sql.Decimal(18, 2), debt.SoTienConLai)
            .input('PhuongThuc', sql.NVarChar, PhuongThuc).input('NoiDung', sql.NVarChar, NoiDung)
            .input('MaNV', sql.VarChar, req.user.MaNV).input('GhiChu', sql.NVarChar, GhiChu)
            .query(`INSERT INTO PhieuChi
                    (MaPhieu,MaNCC,MaCongNo,SoTien,PhuongThuc,MaGiaoDichNganHang,NgayChungTu,
                     NoiDung,MaNV,MaNV_Duyet,NgayDuyet,LyDoTuChoi,TrangThai,GhiChu)
                    VALUES(@MaPhieu,@MaNCC,@MaCongNo,@SoTien,@PhuongThuc,NULL,GETDATE(),
                           @NoiDung,@MaNV,NULL,NULL,NULL,N'Chờ duyệt',@GhiChu)`);
        await writeAudit(transaction, req.user, 'Lập và gửi duyệt Phiếu chi', MaPhieu,
            `${early ? 'Tất toán sớm. ' : ''}Công nợ ${MaCongNo}; thanh toán toàn bộ ${Number(debt.SoTienConLai)} cho ${debt.TenNCC}`);
        await transaction.commit();
        res.status(201).json({
            message: early
                ? `Đã lập Phiếu chi ${MaPhieu} (tất toán trước hạn) và gửi Quản lý duyệt + giao tiền. Công nợ chưa thay đổi.`
                : `Đã lập Phiếu chi ${MaPhieu} và gửi Quản lý duyệt + giao tiền. Công nợ chưa thay đổi.`,
            MaPhieu, MaCongNo, SoTien: debt.SoTienConLai, TrangThai: 'Chờ duyệt', TatToanSom: early
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
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
            .input('SoTien', sql.Decimal(18, 2), voucher.SoTienConLai)
            .input('PhuongThuc', sql.NVarChar, PhuongThuc).input('NoiDung', sql.NVarChar, NoiDung)
            .input('GhiChu', sql.NVarChar, GhiChu).query(`
                UPDATE PhieuChi SET SoTien=@SoTien,PhuongThuc=@PhuongThuc,NoiDung=@NoiDung,GhiChu=@GhiChu,
                    MaNV_Duyet=NULL,NgayDuyet=NULL,LyDoTuChoi=NULL,TrangThai=N'Chờ duyệt'
                WHERE MaPhieu=@Id`);
        await writeAudit(transaction, req.user, 'Chỉnh sửa và gửi lại Phiếu chi', MaPhieu,
            `Gửi lại Phiếu chi cho công nợ ${voucher.MaCongNo}; giữ nguyên quan hệ một công nợ - một Phiếu chi`);
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
        if (Number(voucher.SoTien) !== Number(voucher.SoTienConLai) || Number(voucher.SoTienConLai) <= 0) {
            throw new Error('Số tiền Phiếu chi không còn bằng toàn bộ công nợ còn lại.');
        }
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
            await new sql.Request(transaction).input('MaCN', sql.VarChar, voucher.MaCongNo).query(`
                UPDATE CongNoPhaiTra SET SoTienDaTra=SoTienNo,SoTienConLai=0,TrangThai=N'Đã tất toán'
                WHERE MaCNPTra=@MaCN`);
            await new sql.Request(transaction).input('MaHD', sql.VarChar, voucher.MaHDMH)
                .query(`UPDATE HoaDonMuaHang SET TrangThai=N'Đã thanh toán' WHERE MaHDMH=@MaHD`);
        }
        await writeAudit(transaction, req.user,
            success ? 'Thanh toán Phiếu chi thành công' : 'Ghi nhận thanh toán Phiếu chi thất bại',
            MaPhieu,
            success ? `Công nợ ${voucher.MaCongNo} đã tất toán toàn bộ ${Number(voucher.SoTien)}`
                : `Công nợ ${voucher.MaCongNo} giữ nguyên; lý do: ${paymentNote}`);
        await transaction.commit();
        res.json({
            message: success
                ? `Thanh toán thành công. Công nợ ${voucher.MaCongNo} đã được tất toán.`
                : 'Đã ghi nhận thanh toán thất bại. Công nợ giữ nguyên và có thể thực hiện lại trên Phiếu chi này.',
            MaPhieu, MaCongNo: voucher.MaCongNo,
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
        if (approved && (Number(voucher.SoTien) !== Number(voucher.SoTienConLai) || Number(voucher.SoTienConLai) <= 0)) {
            throw new Error('Số tiền Phiếu chi phải bằng toàn bộ công nợ còn lại.');
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

module.exports = {
    listPayables,
    getPayable,
    createVoucher,
    resubmitVoucher,
    payVoucher,
    getApprovalDetail,
    approveVoucher: decideVoucher(true),
    rejectVoucher: decideVoucher(false),
    ensureFundColumns
};
