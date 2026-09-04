const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const { roundMoney, evaluateThreeWayMatch } = require('../services/financialRules');

const clean = (value, max, fallback = null) => String(value ?? '').trim().slice(0, max) || fallback;

const generateId = async (transaction, table, column, prefix) => {
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 ${column} AS Ma FROM ${table} WITH (UPDLOCK,HOLDLOCK)
                WHERE ${column} LIKE @Prefix ORDER BY ${column} DESC`);
    const last = result.recordset[0]?.Ma;
    return `${prefix}${String(last ? Number(last.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
};

const writeAudit = (transaction, user, action, table, recordId, content) =>
    logAudit(transaction, { user, action, table, recordId, content, uc: 'UC27', severity: 'Quan trọng' });

const normalizeLines = inputLines => {
    if (!Array.isArray(inputLines) || !inputLines.length) throw new Error('Hóa đơn phải có ít nhất một mặt hàng.');
    const seen = new Set();
    return inputLines.map((input, index) => {
        const MaSP = clean(input.MaSP, 20);
        const SoLuong = Number(input.SoLuong);
        const DonGia = Number(input.DonGia);
        const ThueSuat = Number(input.ThueSuat || 0);
        if (!MaSP || seen.has(MaSP) || !Number.isInteger(SoLuong) || SoLuong <= 0
            || !Number.isFinite(DonGia) || DonGia < 0
            || !Number.isFinite(ThueSuat) || ThueSuat < 0 || ThueSuat > 100) {
            throw new Error(`Dòng hóa đơn ${index + 1} không hợp lệ.`);
        }
        seen.add(MaSP);
        const ThanhTien = roundMoney(SoLuong * DonGia);
        return { MaSP, SoLuong, DonGia, ThueSuat, ThanhTien, TienThue: roundMoney(ThanhTien * ThueSuat / 100) };
    });
};

const loadReceiptReference = async (transaction, MaPN, lock = false) => {
    const lockHint = lock ? 'WITH (UPDLOCK,HOLDLOCK)' : '';
    const header = await new sql.Request(transaction).input('MaPN', sql.VarChar, MaPN).query(`
        SELECT pn.MaPN,pn.MaPO,pn.MaNCC,ncc.TenNCC,pn.NgayXacNhan,pn.TongTien,
               po.TongTien AS TongTienDonMua,po.SoNgayThanhToan,po.DieuKhoanThanhToan
        FROM PhieuNhap pn ${lockHint}
        JOIN DonMuaHang po ON po.MaPO=pn.MaPO
        JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC
        WHERE pn.MaPN=@MaPN AND pn.TrangThai=N'Đã xác nhận'`);
    if (!header.recordset.length) throw new Error('Phiếu nhập chưa được xác nhận hoặc không tồn tại.');
    const lines = await new sql.Request(transaction).input('MaPN', sql.VarChar, MaPN).query(`
        SELECT ct.MaSP,po.SoLuong AS SoLuongDat,ct.SoLuongChapNhan,
               ct.DonGiaNhap,ct.ThanhTien AS ThanhTienPhieuNhap,
               po.DonGia AS DonGiaDonMua,po.ThanhTien AS ThanhTienDonMua,
               sp.TenSP,sp.DonViTinh
        FROM ChiTietPhieuNhap ct
        JOIN PhieuNhap pn ON pn.MaPN=ct.MaPN
        JOIN ChiTietDonMua po ON po.MaPO=pn.MaPO AND po.MaSP=ct.MaSP
        JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaPN=@MaPN AND ct.SoLuongChapNhan>0
        ORDER BY sp.TenSP`);
    return { header: header.recordset[0], lines: lines.recordset };
};

const createDebtIfMatched = async (transaction, invoice, paymentDays) => {
    const existing = await new sql.Request(transaction)
        .input('MaHD', sql.VarChar, invoice.MaHDMH)
        .query('SELECT MaCNPTra FROM CongNoPhaiTra WITH (UPDLOCK,HOLDLOCK) WHERE MaHDMH=@MaHD');
    if (existing.recordset.length) return existing.recordset[0].MaCNPTra;
    if (Number(invoice.TongCong) <= 0) return null;
    const now = new Date();
    const prefix = `CN${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const MaCNPTra = await generateId(transaction, 'CongNoPhaiTra', 'MaCNPTra', prefix);
    await new sql.Request(transaction)
        .input('MaCN', sql.VarChar, MaCNPTra)
        .input('MaNCC', sql.VarChar, invoice.MaNCC)
        .input('MaHD', sql.VarChar, invoice.MaHDMH)
        .input('SoTien', sql.Decimal(18, 2), invoice.TongCong)
        .input('SoNgay', sql.Int, paymentDays)
        .query(`INSERT INTO CongNoPhaiTra
                (MaCNPTra,MaNCC,MaHDMH,SoTienNo,SoTienDaTra,SoTienConLai,NgayPhatSinh,HanThanhToan,TrangThai,GhiChu)
                VALUES (@MaCN,@MaNCC,@MaHD,@SoTien,0,@SoTien,GETDATE(),DATEADD(DAY,@SoNgay,CONVERT(date,GETDATE())),N'Đang nợ',N'Phát sinh sau đối chiếu ba bên')`);
    return MaCNPTra;
};

const listReceiptFiles = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT pn.MaPN,pn.MaPO,pn.MaNCC,ncc.TenNCC,pn.NgayXacNhan,pn.TongTien,
                   po.SoNgayThanhToan,COUNT(ct.MaSP) AS SoMatHang,SUM(ct.SoLuongChapNhan) AS TongSoLuong,
                   CASE WHEN EXISTS (SELECT 1 FROM HoaDonMuaHang hd WHERE hd.MaPN=pn.MaPN) THEN 1 ELSE 0 END AS DaTiepNhanHoaDon
            FROM PhieuNhap pn
            JOIN DonMuaHang po ON po.MaPO=pn.MaPO
            JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC
            JOIN ChiTietPhieuNhap ct ON ct.MaPN=pn.MaPN
            WHERE pn.TrangThai=N'Đã xác nhận'
            GROUP BY pn.MaPN,pn.MaPO,pn.MaNCC,ncc.TenNCC,pn.NgayXacNhan,pn.TongTien,po.SoNgayThanhToan
            ORDER BY pn.NgayXacNhan DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải hồ sơ nhận hàng chờ đối chiếu.' });
    }
};

const getReceiptFile = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin();
        const reference = await loadReceiptReference(transaction, req.params.id);
        await transaction.commit();
        res.json({ file: reference.header, lines: reference.lines });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(404).json({ message: error.message || 'Không thể tải hồ sơ đối chiếu.' });
    }
};

const listPurchaseOrderFiles = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT po.MaPO,po.MaNCC,ncc.TenNCC,po.NgayLap,po.SoNgayThanhToan,po.TongTien,po.TrangThai,
                   COUNT(ct.MaSP) AS SoMatHang,SUM(ct.SoLuong) AS TongSoLuong
            FROM DonMuaHang po
            JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
            JOIN ChiTietDonMua ct ON ct.MaPO=po.MaPO
            WHERE po.TrangThai IN (N'Đã duyệt',N'Đã gửi Nhà cung cấp',N'Nhà cung cấp xác nhận',N'Đang giao',N'Giao một phần',N'Hoàn thành')
            GROUP BY po.MaPO,po.MaNCC,ncc.TenNCC,po.NgayLap,po.SoNgayThanhToan,po.TongTien,po.TrangThai
            ORDER BY po.NgayLap DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải Đơn mua dùng để tiếp nhận hóa đơn.' });
    }
};

const getPurchaseOrderFile = async (req, res) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request().input('MaPO', sql.VarChar, req.params.id).query(`
            SELECT po.MaPO,po.MaNCC,ncc.TenNCC,po.SoNgayThanhToan,po.DieuKhoanThanhToan,po.TrangThai,
                   po.TongTien,po.NgayLap,po.NgayGiaoDuKien
            FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
            WHERE po.MaPO=@MaPO AND po.TrangThai NOT IN (N'Nháp',N'Chờ duyệt',N'Yêu cầu chỉnh sửa',N'Từ chối')`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Đơn mua chưa đủ điều kiện tiếp nhận hóa đơn.' });
        const lines = await pool.request().input('MaPO', sql.VarChar, req.params.id).query(`
            SELECT ct.MaSP,sp.TenSP,sp.DonViTinh,ct.SoLuong,ct.DonGia,
                   ct.SoLuong*ct.DonGia AS ThanhTien
            FROM ChiTietDonMua ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaPO=@MaPO ORDER BY sp.TenSP`);
        res.json({ file: header.recordset[0], lines: lines.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải chi tiết Đơn mua.' });
    }
};

const listInvoices = async (req, res) => {
    try {
        const keyword = clean(req.query.search, 120, '');
        const match = clean(req.query.match, 30, '');
        const pool = await poolPromise;
        await pool.request().query(`UPDATE CongNoPhaiTra SET TrangThai=N'Quá hạn'
            WHERE SoTienConLai>0 AND HanThanhToan<CONVERT(date,GETDATE()) AND TrangThai<>N'Quá hạn'`);
        const result = await pool.request()
            .input('TuKhoa', sql.NVarChar, keyword).input('Mau', sql.NVarChar, `%${keyword}%`)
            .input('DoiChieu', sql.NVarChar, match).query(`
                SELECT hd.MaHDMH,hd.SoHoaDon,hd.MaNCC,ncc.TenNCC,hd.MaPO,hd.MaPN,hd.NgayHoaDon,
                       hd.TongTienHang,hd.TienThue,hd.TongCong,hd.TrangThaiDoiChieu,hd.GhiChuChenhLech,hd.TrangThai,
                       cn.MaCNPTra,cn.HanThanhToan,cn.SoTienConLai,cn.TrangThai AS TrangThaiCongNo
                FROM HoaDonMuaHang hd JOIN NhaCungCap ncc ON ncc.MaNCC=hd.MaNCC
                LEFT JOIN CongNoPhaiTra cn ON cn.MaHDMH=hd.MaHDMH
                WHERE (@DoiChieu=N'' OR hd.TrangThaiDoiChieu=@DoiChieu)
                  AND (@TuKhoa=N'' OR hd.SoHoaDon LIKE @Mau COLLATE Latin1_General_100_CI_AI OR hd.MaHDMH LIKE @Mau COLLATE Latin1_General_100_CI_AI OR hd.MaPO LIKE @Mau COLLATE Latin1_General_100_CI_AI OR ncc.TenNCC LIKE @Mau COLLATE Latin1_General_100_CI_AI)
                ORDER BY hd.NgayTiepNhan DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh sách hóa đơn mua hàng.' });
    }
};

const getInvoiceDetail = async (req, res) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request().input('MaHD', sql.VarChar, req.params.id).query(`
            SELECT hd.*,ncc.TenNCC,nv.TenNV AS NguoiTiepNhan,cn.MaCNPTra,cn.SoTienNo,cn.SoTienConLai,
                   cn.HanThanhToan,cn.TrangThai AS TrangThaiCongNo
            FROM HoaDonMuaHang hd JOIN NhaCungCap ncc ON ncc.MaNCC=hd.MaNCC
            JOIN NhanVien nv ON nv.MaNV=hd.MaNV LEFT JOIN CongNoPhaiTra cn ON cn.MaHDMH=hd.MaHDMH
            WHERE hd.MaHDMH=@MaHD`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy hóa đơn mua hàng.' });
        const lines = await pool.request().input('MaHD', sql.VarChar, req.params.id).query(`
            SELECT ct.*,sp.TenSP,sp.DonViTinh FROM ChiTietHoaDonMuaHang ct
            JOIN SanPham sp ON sp.MaSP=ct.MaSP WHERE ct.MaHDMH=@MaHD ORDER BY sp.TenSP`);
        res.json({ invoice: header.recordset[0], lines: lines.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải chi tiết hóa đơn.' });
    }
};

const createInvoice = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const SoHoaDon = clean(req.body.SoHoaDon, 50);
        const MaPN = clean(req.body.MaPN, 20);
        const MaPOInput = clean(req.body.MaPO, 20);
        const NgayHoaDon = clean(req.body.NgayHoaDon, 10);
        const lines = normalizeLines(req.body.lines);
        if (!SoHoaDon || !NgayHoaDon || (!MaPN && !MaPOInput)) {
            throw new Error('Số hóa đơn, ngày hóa đơn và hồ sơ Đơn mua/Phiếu nhập là bắt buộc.');
        }
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        let reference = null;
        let MaPO = MaPOInput;
        let MaNCC;
        if (MaPN) {
            reference = await loadReceiptReference(transaction, MaPN, true);
            MaPO = reference.header.MaPO;
            MaNCC = reference.header.MaNCC;
            if (MaPOInput && MaPOInput !== MaPO) throw new Error('Phiếu nhập không thuộc Đơn mua đã chọn.');
            const used = await new sql.Request(transaction).input('MaPN', sql.VarChar, MaPN)
                .query('SELECT 1 FROM HoaDonMuaHang WITH (UPDLOCK,HOLDLOCK) WHERE MaPN=@MaPN');
            if (used.recordset.length) throw new Error('Phiếu nhập này đã được gắn với một hóa đơn khác.');
        } else {
            const order = await new sql.Request(transaction).input('MaPO', sql.VarChar, MaPO).query(`
                SELECT MaPO,MaNCC,SoNgayThanhToan FROM DonMuaHang WITH (UPDLOCK,HOLDLOCK)
                WHERE MaPO=@MaPO AND TrangThai NOT IN (N'Nháp',N'Chờ duyệt',N'Yêu cầu chỉnh sửa',N'Từ chối')`);
            if (!order.recordset.length) throw new Error('Đơn mua chưa đủ điều kiện tiếp nhận hóa đơn.');
            ({ MaNCC } = order.recordset[0]);
        }
        const duplicate = await new sql.Request(transaction)
            .input('MaNCC', sql.VarChar, MaNCC).input('SoHoaDon', sql.VarChar, SoHoaDon)
            .query('SELECT 1 FROM HoaDonMuaHang WITH (UPDLOCK,HOLDLOCK) WHERE MaNCC=@MaNCC AND SoHoaDon=@SoHoaDon');
        if (duplicate.recordset.length) throw new Error('Số hóa đơn này đã được tiếp nhận từ Nhà cung cấp.');
        const totalGoods = lines.reduce((sum, line) => sum + line.ThanhTien, 0);
        const totalTax = lines.reduce((sum, line) => sum + line.TienThue, 0);
        const total = totalGoods + totalTax;
        // Tiếp nhận hóa đơn và đối chiếu là hai nghiệp vụ độc lập. Việc bấm
        // "Lưu hóa đơn" tuyệt đối không được tự xác nhận khớp hoặc tạo công nợ.
        const matchStatus = MaPN ? 'Chờ đối chiếu' : 'Chờ Phiếu nhập';
        const invoiceStatus = 'Chờ đối chiếu';
        const now = new Date();
        const prefix = `HDM${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const MaHDMH = await generateId(transaction, 'HoaDonMuaHang', 'MaHDMH', prefix);
        await new sql.Request(transaction)
            .input('MaHD', sql.VarChar, MaHDMH).input('SoHD', sql.VarChar, SoHoaDon)
            .input('MaNCC', sql.VarChar, MaNCC).input('MaPO', sql.VarChar, MaPO)
            .input('MaPN', sql.VarChar, MaPN).input('NgayHD', sql.Date, NgayHoaDon)
            .input('TienHang', sql.Decimal(18, 2), totalGoods).input('TienThue', sql.Decimal(18, 2), totalTax)
            .input('TongCong', sql.Decimal(18, 2), total).input('DoiChieu', sql.NVarChar, matchStatus)
            .input('ChenhLech', sql.NVarChar, null)
            .input('MaNV', sql.VarChar, req.user.MaNV).input('TrangThai', sql.NVarChar, invoiceStatus)
            .query(`INSERT INTO HoaDonMuaHang
                    (MaHDMH,SoHoaDon,MaNCC,MaPO,MaPN,NgayHoaDon,TongTienHang,TienThue,TongCong,TrangThaiDoiChieu,GhiChuChenhLech,MaNV,NgayTiepNhan,TrangThai)
                    VALUES (@MaHD,@SoHD,@MaNCC,@MaPO,@MaPN,@NgayHD,@TienHang,@TienThue,@TongCong,@DoiChieu,@ChenhLech,@MaNV,GETDATE(),@TrangThai)`);
        for (const line of lines) {
            await new sql.Request(transaction)
                .input('MaHD', sql.VarChar, MaHDMH).input('MaSP', sql.VarChar, line.MaSP)
                .input('SoLuong', sql.Int, line.SoLuong).input('DonGia', sql.Decimal(18, 2), line.DonGia)
                .input('ThueSuat', sql.Decimal(5, 2), line.ThueSuat).input('TienThue', sql.Decimal(18, 2), line.TienThue)
                .input('ThanhTien', sql.Decimal(18, 2), line.ThanhTien)
                .query(`INSERT INTO ChiTietHoaDonMuaHang (MaHDMH,MaSP,SoLuong,DonGia,ThueSuat,TienThue,ThanhTien)
                        VALUES (@MaHD,@MaSP,@SoLuong,@DonGia,@ThueSuat,@TienThue,@ThanhTien)`);
        }
        await writeAudit(transaction, req.user, 'Tiếp nhận hóa đơn Nhà cung cấp', 'HoaDonMuaHang', MaHDMH,
            matchStatus === 'Chờ Phiếu nhập' ? `Hóa đơn ${SoHoaDon} đã lưu trước Phiếu nhập; chưa phát sinh công nợ`
                : `Hóa đơn ${SoHoaDon} đã lưu cùng Phiếu nhập ${MaPN}; đang chờ Kế toán đối chiếu ba chứng từ`);
        await transaction.commit();
        res.status(201).json({
            message: matchStatus === 'Chờ Phiếu nhập'
                ? 'Đã lưu hóa đơn. Hồ sơ đang chờ Phiếu nhập và chưa phát sinh công nợ.'
                : 'Đã lưu hóa đơn. Kế toán cần thực hiện đối chiếu ba chứng từ trước khi ghi nhận công nợ.',
            MaHDMH, MaCNPTra: null, TrangThaiDoiChieu: matchStatus, differences: []
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

const reconcileInvoice = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const MaHDMH = clean(req.params.id, 20);
        const MaPN = clean(req.body.MaPN, 20);
        if (!MaPN) throw new Error('Vui lòng chọn Phiếu nhập đã xác nhận.');
        if (req.body.XacNhanDoiChieu !== true) {
            throw new Error('Kế toán chưa xác nhận thực hiện đối chiếu ba chứng từ.');
        }
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const invoiceResult = await new sql.Request(transaction).input('MaHD', sql.VarChar, MaHDMH)
            .query('SELECT * FROM HoaDonMuaHang WITH (UPDLOCK,HOLDLOCK) WHERE MaHDMH=@MaHD');
        if (!invoiceResult.recordset.length) throw new Error('Không tìm thấy hóa đơn mua hàng.');
        const invoice = invoiceResult.recordset[0];
        if (invoice.TrangThaiDoiChieu === 'Đã khớp') throw new Error('Hóa đơn đã được đối chiếu khớp trước đó.');
        const reference = await loadReceiptReference(transaction, MaPN, true);
        if (reference.header.MaPO !== invoice.MaPO || reference.header.MaNCC !== invoice.MaNCC) {
            throw new Error('Phiếu nhập không cùng Đơn mua và Nhà cung cấp với hóa đơn.');
        }
        const used = await new sql.Request(transaction).input('MaPN', sql.VarChar, MaPN).input('MaHD', sql.VarChar, MaHDMH)
            .query('SELECT 1 FROM HoaDonMuaHang WITH (UPDLOCK,HOLDLOCK) WHERE MaPN=@MaPN AND MaHDMH<>@MaHD');
        if (used.recordset.length) throw new Error('Phiếu nhập này đã được đối chiếu với hóa đơn khác.');
        const lineResult = await new sql.Request(transaction).input('MaHD', sql.VarChar, MaHDMH)
            .query('SELECT MaSP,SoLuong,DonGia,ThueSuat,TienThue,ThanhTien FROM ChiTietHoaDonMuaHang WHERE MaHDMH=@MaHD');
        const invoiceLines = lineResult.recordset.map(line => ({
            ...line,
            SoLuong: Number(line.SoLuong),
            DonGia: Number(line.DonGia),
            ThueSuat: Number(line.ThueSuat || 0),
            TienThue: Number(line.TienThue || 0),
            ThanhTien: Number(line.ThanhTien || 0)
        }));
        const matchResult = evaluateThreeWayMatch({ invoice, invoiceLines, receipt: reference.header, receiptLines: reference.lines });
        const differences = matchResult.differenceMessages;
        const matched = matchResult.matched;
        await new sql.Request(transaction)
            .input('MaHD', sql.VarChar, MaHDMH).input('MaPN', sql.VarChar, MaPN)
            .input('DoiChieu', sql.NVarChar, matched ? 'Đã khớp' : 'Chênh lệch')
            .input('TrangThai', sql.NVarChar, matched ? 'Đã ghi nhận' : 'Chờ xử lý')
            .input('ChenhLech', sql.NVarChar, differences.join('; ') || null)
            .query(`UPDATE HoaDonMuaHang SET MaPN=@MaPN,TrangThaiDoiChieu=@DoiChieu,
                    TrangThai=@TrangThai,GhiChuChenhLech=@ChenhLech WHERE MaHDMH=@MaHD`);
        let MaCNPTra = null;
        if (matched) MaCNPTra = await createDebtIfMatched(transaction, invoice, reference.header.SoNgayThanhToan);
        await writeAudit(transaction, req.user, 'Đối chiếu hóa đơn ba bên', 'HoaDonMuaHang', MaHDMH,
            matched ? `Hồ sơ khớp Phiếu nhập ${MaPN}; phát sinh công nợ ${MaCNPTra}`
                : `Chênh lệch với Phiếu nhập ${MaPN}: ${differences.join('; ')}`);
        await transaction.commit();
        res.json({
            message: matched ? 'Đối chiếu thành công. Công nợ phải trả đã được ghi nhận.' : 'Hồ sơ còn chênh lệch, chưa phát sinh công nợ.',
            MaHDMH, MaCNPTra, TrangThaiDoiChieu: matched ? 'Đã khớp' : 'Chênh lệch',
            differences, differenceDetails: matchResult.differences, totals: matchResult.totals
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

const previewReconciliation = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const MaHDMH = clean(req.params.id, 20);
        const MaPNInput = clean(req.query.MaPN, 20);
        await transaction.begin();
        const invoiceResult = await new sql.Request(transaction).input('MaHD', sql.VarChar, MaHDMH)
            .query(`SELECT hd.*,ncc.TenNCC FROM HoaDonMuaHang hd
                    JOIN NhaCungCap ncc ON ncc.MaNCC=hd.MaNCC WHERE hd.MaHDMH=@MaHD`);
        if (!invoiceResult.recordset.length) throw new Error('Không tìm thấy hóa đơn mua hàng.');
        const invoice = invoiceResult.recordset[0];
        const MaPN = MaPNInput || invoice.MaPN;
        if (!MaPN) throw new Error('Hóa đơn chưa có Phiếu nhập để đối chiếu.');
        const reference = await loadReceiptReference(transaction, MaPN);
        if (reference.header.MaPO !== invoice.MaPO || reference.header.MaNCC !== invoice.MaNCC) {
            throw new Error('Phiếu nhập không cùng Đơn mua và Nhà cung cấp với hóa đơn.');
        }
        const invoiceLinesResult = await new sql.Request(transaction).input('MaHD', sql.VarChar, MaHDMH)
            .query(`SELECT ct.MaSP,ct.SoLuong,ct.DonGia,ct.ThueSuat,ct.TienThue,ct.ThanhTien,
                           sp.TenSP,sp.DonViTinh
                    FROM ChiTietHoaDonMuaHang ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
                    WHERE ct.MaHDMH=@MaHD ORDER BY sp.TenSP`);
        const invoiceLines = invoiceLinesResult.recordset.map(line => ({
            ...line,
            SoLuong: Number(line.SoLuong),
            DonGia: Number(line.DonGia),
            ThueSuat: Number(line.ThueSuat || 0),
            TienThue: Number(line.TienThue || 0),
            ThanhTien: Number(line.ThanhTien || 0)
        }));
        const matchResult = evaluateThreeWayMatch({ invoice, invoiceLines, receipt: reference.header, receiptLines: reference.lines });
        await transaction.commit();
        res.json({
            invoice,
            purchaseOrder: {
                MaPO: reference.header.MaPO,
                SoNgayThanhToan: reference.header.SoNgayThanhToan,
                TongTien: Number(reference.header.TongTienDonMua || 0)
            },
            receipt: reference.header,
            rows: matchResult.rows,
            totals: matchResult.totals,
            differences: matchResult.differenceMessages,
            differenceDetails: matchResult.differences,
            result: matchResult.matched ? 'Đủ điều kiện ghi nhận công nợ' : 'Chênh lệch'
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    listReceiptFiles, getReceiptFile, listPurchaseOrderFiles, getPurchaseOrderFile,
    listInvoices, getInvoiceDetail, createInvoice, previewReconciliation, reconcileInvoice
};
