const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');

const editableStatuses = new Set(['Nháp', 'Yêu cầu chỉnh sửa']);
const clean = (value, max, fallback = null) => String(value ?? '').trim().slice(0, max) || fallback;

const writeAudit = (request, user, action, recordId, content) =>
    logAudit(request, { user, action, table: 'DonMuaHang', recordId, content, uc: 'UC13' });

const normalizeLines = lines => {
    if (!Array.isArray(lines) || !lines.length) throw new Error('Đơn mua phải có ít nhất một mặt hàng.');
    const seen = new Set();
    return lines.map((line, index) => {
        const MaSP = clean(line.MaSP, 20);
        const SoLuong = Number(line.SoLuong);
        const DonGia = Number(line.DonGia);
        const ChietKhau = Number(line.ChietKhau || 0);
        if (!MaSP) throw new Error(`Dòng ${index + 1} chưa có sản phẩm.`);
        if (seen.has(MaSP)) throw new Error(`Sản phẩm ${MaSP} bị lặp trong Đơn mua.`);
        if (!Number.isInteger(SoLuong) || SoLuong <= 0) throw new Error(`Số lượng của ${MaSP} phải là số nguyên dương.`);
        if (!Number.isFinite(DonGia) || DonGia < 0) throw new Error(`Đơn giá của ${MaSP} không hợp lệ.`);
        if (!Number.isFinite(ChietKhau) || ChietKhau < 0 || ChietKhau > 100) throw new Error(`Tỷ lệ chiết khấu của ${MaSP} phải từ 0 đến 100%.`);
        seen.add(MaSP);
        return { MaSP, SoLuong, DonGia, ChietKhau, ThanhTien: SoLuong * DonGia * (1 - ChietKhau / 100) };
    });
};

const normalizeHeader = body => {
    const MaDN = clean(body.MaDN, 20);
    const MaNCC = clean(body.MaNCC, 20);
    const NgayGiaoDuKien = clean(body.NgayGiaoDuKien, 10);
    const SoNgayThanhToan = Number(body.SoNgayThanhToan);
    if (!MaDN || !MaNCC || !NgayGiaoDuKien) throw new Error('Phiếu đề nghị, Nhà cung cấp và ngày giao dự kiến là bắt buộc.');
    if (!Number.isInteger(SoNgayThanhToan) || SoNgayThanhToan < 30 || SoNgayThanhToan > 45) throw new Error('Thời hạn thanh toán phải từ 30 đến 45 ngày.');
    return { MaDN, MaNCC, NgayGiaoDuKien, SoNgayThanhToan, DieuKhoanThanhToan: clean(body.DieuKhoanThanhToan, 500, `Thanh toán toàn bộ sau ${SoNgayThanhToan} ngày`), GhiChu: clean(body.GhiChu, 500) };
};

const generateId = async transaction => {
    const date = new Date();
    const prefix = `PO${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const result = await new sql.Request(transaction).input('Prefix', sql.VarChar, `${prefix}%`).query(`
        SELECT TOP 1 MaPO FROM DonMuaHang WITH (UPDLOCK,HOLDLOCK) WHERE MaPO LIKE @Prefix ORDER BY MaPO DESC`);
    const last = result.recordset[0]?.MaPO;
    return `${prefix}${String(last ? Number(last.slice(prefix.length)) + 1 : 1).padStart(3, '0')}`;
};

const generateShipmentId = async transaction => {
    const date = new Date();
    const prefix = `GH${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const result = await new sql.Request(transaction).input('Prefix', sql.VarChar, `${prefix}%`).query(`
        SELECT TOP 1 MaTBGH FROM ThongBaoGiaoHang WITH (UPDLOCK,HOLDLOCK)
        WHERE MaTBGH LIKE @Prefix ORDER BY MaTBGH DESC`);
    const last = result.recordset[0]?.MaTBGH;
    return `${prefix}${String(last ? Number(last.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
};

const validateSource = async (transaction, header, lines, excludeOrder = null) => {
    const request = await new sql.Request(transaction).input('MaDN', sql.VarChar, header.MaDN).input('MaNV', sql.VarChar, null)
        .query(`SELECT MaDN,TrangThai FROM DeNghiMuaHang WITH (UPDLOCK) WHERE MaDN=@MaDN`);
    if (!request.recordset.length || !['Đang xử lý', 'Đã lập đơn'].includes(request.recordset[0].TrangThai)) throw new Error('Phiếu đề nghị chưa được tiếp nhận hoặc không còn hợp lệ.');
    const supplier = await new sql.Request(transaction).input('MaNCC', sql.VarChar, header.MaNCC)
        .query(`SELECT MaNCC FROM NhaCungCap WHERE MaNCC=@MaNCC AND TrangThai=N'Đang hợp tác'`);
    if (!supplier.recordset.length) throw new Error('Nhà cung cấp không tồn tại hoặc đã ngừng hợp tác.');
    for (const line of lines) {
        const result = await new sql.Request(transaction)
            .input('MaDN', sql.VarChar, header.MaDN).input('MaSP', sql.VarChar, line.MaSP)
            .input('LoaiBoMaPO', sql.VarChar, excludeOrder)
            .query(`SELECT ct.SLDeNghi,
                       ISNULL((SELECT SUM(ctpo.SoLuong) FROM DonMuaHang po JOIN ChiTietDonMua ctpo ON ctpo.MaPO=po.MaPO
                               WHERE po.MaDN=ct.MaDN AND ctpo.MaSP=ct.MaSP
                                 AND (@LoaiBoMaPO IS NULL OR po.MaPO<>@LoaiBoMaPO)
                                 AND po.TrangThai NOT IN (N'Từ chối',N'Đã hủy')),0) AS DaPhanBo
                    FROM ChiTietDeNghi ct WHERE ct.MaDN=@MaDN AND ct.MaSP=@MaSP`);
        if (!result.recordset.length) throw new Error(`Sản phẩm ${line.MaSP} không thuộc Phiếu đề nghị.`);
        const available = Number(result.recordset[0].SLDeNghi) - Number(result.recordset[0].DaPhanBo);
        if (line.SoLuong > available) throw new Error(`Số lượng đặt của ${line.MaSP} vượt quá giới hạn ${available} của Phiếu đề nghị nguồn. Nếu cần tăng thêm, hãy chuyển Phiếu đề nghị về Thủ kho cập nhật trước.`);
    }
};

const insertLines = async (transaction, MaPO, lines) => {
    for (const line of lines) {
        await new sql.Request(transaction).input('MaPO', sql.VarChar, MaPO).input('MaSP', sql.VarChar, line.MaSP)
            .input('SoLuong', sql.Int, line.SoLuong).input('DonGia', sql.Decimal(18, 2), line.DonGia)
            .input('ChietKhau', sql.Decimal(18, 2), line.ChietKhau).input('ThanhTien', sql.Decimal(18, 2), line.ThanhTien)
            .query(`INSERT INTO ChiTietDonMua (MaPO,MaSP,SoLuong,DonGia,ChietKhau,ThanhTien,SLDaGiao,SLConThieu)
                    VALUES (@MaPO,@MaSP,@SoLuong,@DonGia,@ChietKhau,@ThanhTien,0,@SoLuong)`);
    }
};

const refreshRequestStatus = async (transaction, MaDN) => {
    const result = await new sql.Request(transaction).input('MaDN', sql.VarChar, MaDN).query(`
        SELECT SUM(ct.SLDeNghi) AS TongDeNghi,
               ISNULL((SELECT SUM(ctpo.SoLuong) FROM DonMuaHang po JOIN ChiTietDonMua ctpo ON ctpo.MaPO=po.MaPO
                       WHERE po.MaDN=@MaDN AND po.TrangThai NOT IN (N'Từ chối',N'Đã hủy')),0) AS TongDaLap
        FROM ChiTietDeNghi ct WHERE ct.MaDN=@MaDN`);
    const row = result.recordset[0];
    const status = Number(row.TongDaLap) >= Number(row.TongDeNghi) ? 'Đã lập đơn' : 'Đang xử lý';
    await new sql.Request(transaction).input('MaDN', sql.VarChar, MaDN).input('TrangThai', sql.NVarChar, status)
        .query(`UPDATE DeNghiMuaHang SET TrangThai=@TrangThai WHERE MaDN=@MaDN`);
};

const list = async (req, res) => {
    try {
        const keyword = clean(req.query.search, 150, '');
        const status = clean(req.query.status, 40, '');
        const pool = await poolPromise;
        const result = await pool.request().input('TuKhoa', sql.NVarChar, keyword).input('Mau', sql.NVarChar, `%${keyword}%`)
            .input('TrangThai', sql.NVarChar, status).query(`
                SELECT po.MaPO,po.MaDN,po.MaNCC,ncc.TenNCC,po.MaNV_Lap,nv.TenNV AS NguoiLap,po.NgayLap,
                       po.NgayGiaoDuKien,po.SoNgayThanhToan,po.TongTien,po.TrangThai,
                       dn.TrangThai AS TrangThaiDeNghi,
                       COUNT(ct.MaSP) AS SoMatHang,SUM(ct.SoLuong) AS TongSoLuong,
                       SUM(ct.SLDaGiao) AS TongDaGiao,SUM(ct.SLConThieu) AS TongConThieu
                FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC JOIN NhanVien nv ON nv.MaNV=po.MaNV_Lap
                LEFT JOIN DeNghiMuaHang dn ON dn.MaDN=po.MaDN
                JOIN ChiTietDonMua ct ON ct.MaPO=po.MaPO
                WHERE (@TrangThai=N'' OR po.TrangThai=@TrangThai)
                  AND (@TuKhoa=N'' OR po.MaPO LIKE @Mau COLLATE Latin1_General_100_CI_AI OR po.MaDN LIKE @Mau COLLATE Latin1_General_100_CI_AI OR ncc.TenNCC LIKE @Mau COLLATE Latin1_General_100_CI_AI)
                GROUP BY po.MaPO,po.MaDN,po.MaNCC,ncc.TenNCC,po.MaNV_Lap,nv.TenNV,po.NgayLap,
                         po.NgayGiaoDuKien,po.SoNgayThanhToan,po.TongTien,po.TrangThai,dn.TrangThai
                ORDER BY po.NgayLap DESC`);
        res.json({ items: result.recordset });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Không thể tải danh sách Đơn mua hàng.' }); }
};

const getDetail = async (req, res) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request().input('MaPO', sql.VarChar, req.params.id).query(`
            SELECT po.*,ncc.TenNCC,nv.TenNV AS NguoiLap,duyet.TenNV AS NguoiDuyet,
                   dn.TrangThai AS TrangThaiDeNghi
            FROM DonMuaHang po JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC JOIN NhanVien nv ON nv.MaNV=po.MaNV_Lap
            LEFT JOIN NhanVien duyet ON duyet.MaNV=po.MaNV_Duyet
            LEFT JOIN DeNghiMuaHang dn ON dn.MaDN=po.MaDN
            WHERE po.MaPO=@MaPO`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy Đơn mua hàng.' });
        const lines = await pool.request().input('MaPO', sql.VarChar, req.params.id).query(`
            SELECT ct.*,sp.TenSP,sp.DonViTinh,dn.SLDeNghi AS SLTheoDeNghi,
                   CASE WHEN dn.SLDeNghi IS NULL THEN NULL
                        ELSE dn.SLDeNghi-ISNULL(phanbo.DaPhanBo,0) END AS SLToiDaChoDon
            FROM ChiTietDonMua ct
            JOIN DonMuaHang po ON po.MaPO=ct.MaPO
            JOIN SanPham sp ON sp.MaSP=ct.MaSP
            LEFT JOIN ChiTietDeNghi dn ON dn.MaDN=po.MaDN AND dn.MaSP=ct.MaSP
            OUTER APPLY (
                SELECT SUM(ctkhac.SoLuong) AS DaPhanBo
                FROM DonMuaHang pokhac
                JOIN ChiTietDonMua ctkhac ON ctkhac.MaPO=pokhac.MaPO
                WHERE pokhac.MaDN=po.MaDN AND ctkhac.MaSP=ct.MaSP AND pokhac.MaPO<>po.MaPO
                  AND pokhac.TrangThai NOT IN (N'Từ chối',N'Đã hủy')
            ) phanbo
            WHERE ct.MaPO=@MaPO ORDER BY sp.TenSP`);
        const shipments = await pool.request().input('MaPO', sql.VarChar, req.params.id).query(`
            SELECT gh.MaTBGH,gh.SoPhieuGiao,gh.NgayXuatPhat,gh.NgayGioDuKienDen,gh.BienSoXe,
                   gh.TenTaiXe,gh.SDTTaiXe,gh.SoKien,gh.TrangThai,gh.NgayDen,gh.GhiChu,gh.NgayTao,
                   nv.TenNV AS NguoiGhiNhan
            FROM ThongBaoGiaoHang gh
            JOIN NhanVien nv ON nv.MaNV=gh.MaNVGhiNhan
            WHERE gh.MaPO=@MaPO ORDER BY gh.NgayTao DESC`);
        res.json({ order: header.recordset[0], lines: lines.recordset, shipments: shipments.recordset });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Không thể tải chi tiết Đơn mua hàng.' }); }
};

const create = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const header = normalizeHeader(req.body);
        const lines = normalizeLines(req.body.lines);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        await validateSource(transaction, header, lines);
        const MaPO = await generateId(transaction);
        const total = lines.reduce((sum, line) => sum + line.ThanhTien, 0);
        await new sql.Request(transaction).input('MaPO', sql.VarChar, MaPO).input('MaDN', sql.VarChar, header.MaDN)
            .input('MaNCC', sql.VarChar, header.MaNCC).input('MaNV', sql.VarChar, req.user.MaNV)
            .input('NgayGiao', sql.Date, header.NgayGiaoDuKien).input('DieuKhoan', sql.NVarChar, header.DieuKhoanThanhToan)
            .input('SoNgay', sql.Int, header.SoNgayThanhToan).input('TongTien', sql.Decimal(18, 2), total)
            .input('GhiChu', sql.NVarChar, header.GhiChu).query(`INSERT INTO DonMuaHang
                (MaPO,MaDN,MaNCC,MaNV_Lap,NgayLap,NgayGiaoDuKien,DieuKhoanThanhToan,SoNgayThanhToan,TongTien,TrangThai,GhiChu)
                VALUES (@MaPO,@MaDN,@MaNCC,@MaNV,GETDATE(),@NgayGiao,@DieuKhoan,@SoNgay,@TongTien,N'Nháp',@GhiChu)`);
        await insertLines(transaction, MaPO, lines);
        await refreshRequestStatus(transaction, header.MaDN);
        await writeAudit(new sql.Request(transaction), req.user, 'Lập Đơn mua hàng', MaPO, `Tạo bản nháp từ Phiếu đề nghị ${header.MaDN}`);
        await transaction.commit();
        res.status(201).json({ message: 'Đã lưu bản nháp Đơn mua hàng.', MaPO });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error); res.status(400).json({ message: error.message });
    }
};

const update = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const header = normalizeHeader(req.body);
        const lines = normalizeLines(req.body.lines);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction).input('MaPO', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV).query(`
                SELECT MaPO,MaDN,TrangThai FROM DonMuaHang WITH (UPDLOCK)
                WHERE MaPO=@MaPO AND MaNV_Lap=@MaNV AND TrangThai IN (N'Nháp',N'Yêu cầu chỉnh sửa')`);
        if (!current.recordset.length) throw new Error('Đơn mua không còn ở trạng thái có thể chỉnh sửa.');
        if (header.MaDN !== current.recordset[0].MaDN) throw new Error('Không được đổi Phiếu đề nghị nguồn của Đơn mua.');
        await validateSource(transaction, header, lines, req.params.id);
        const total = lines.reduce((sum, line) => sum + line.ThanhTien, 0);
        await new sql.Request(transaction).input('MaPO', sql.VarChar, req.params.id).input('MaNCC', sql.VarChar, header.MaNCC)
            .input('NgayGiao', sql.Date, header.NgayGiaoDuKien).input('DieuKhoan', sql.NVarChar, header.DieuKhoanThanhToan)
            .input('SoNgay', sql.Int, header.SoNgayThanhToan).input('TongTien', sql.Decimal(18, 2), total)
            .input('GhiChu', sql.NVarChar, header.GhiChu).query(`
                UPDATE DonMuaHang SET MaNCC=@MaNCC,NgayGiaoDuKien=@NgayGiao,DieuKhoanThanhToan=@DieuKhoan,
                       SoNgayThanhToan=@SoNgay,TongTien=@TongTien,GhiChu=@GhiChu,LyDoTuChoi=NULL
                WHERE MaPO=@MaPO;
                DELETE FROM ChiTietDonMua WHERE MaPO=@MaPO;`);
        await insertLines(transaction, req.params.id, lines);
        await refreshRequestStatus(transaction, header.MaDN);
        await writeAudit(new sql.Request(transaction), req.user, 'Chỉnh sửa Đơn mua hàng', req.params.id, 'Cập nhật hồ sơ trước khi gửi lại Quản lý phê duyệt');
        await transaction.commit();
        res.json({ message: 'Đã cập nhật Đơn mua hàng.' });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error); res.status(400).json({ message: error.message });
    }
};

const submit = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const current = await new sql.Request(transaction).input('MaPO', sql.VarChar, req.params.id).input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT MaPO,MaDN,MaNCC,TrangThai,SoNgayThanhToan
                    FROM DonMuaHang WITH (UPDLOCK)
                    WHERE MaPO=@MaPO AND MaNV_Lap=@MaNV
                      AND TrangThai IN (N'Nháp',N'Yêu cầu chỉnh sửa')
                      AND SoNgayThanhToan BETWEEN 30 AND 45`);
        if (!current.recordset.length) throw new Error('Đơn mua không còn ở trạng thái có thể gửi duyệt.');
        const linesResult = await new sql.Request(transaction).input('MaPO', sql.VarChar, req.params.id)
            .query('SELECT MaSP,SoLuong,DonGia,ChietKhau FROM ChiTietDonMua WHERE MaPO=@MaPO');
        if (!linesResult.recordset.length) throw new Error('Đơn mua chưa có mặt hàng để gửi duyệt.');
        await validateSource(transaction, current.recordset[0], linesResult.recordset, req.params.id);
        await new sql.Request(transaction).input('MaPO', sql.VarChar, req.params.id)
            .query(`UPDATE DonMuaHang SET TrangThai=N'Chờ duyệt',LyDoTuChoi=NULL WHERE MaPO=@MaPO`);
        await writeAudit(new sql.Request(transaction), req.user, 'Gửi duyệt Đơn mua hàng', req.params.id, 'Chuyển Đơn mua tới Quản lý phê duyệt');
        await transaction.commit();
        res.json({ message: 'Đã gửi Đơn mua hàng cho Quản lý phê duyệt.' });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error); res.status(409).json({ message: error.message || 'Không thể gửi duyệt Đơn mua hàng.' });
    }
};

const approve = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('MaPO', sql.VarChar, req.params.id).input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`UPDATE DonMuaHang SET TrangThai=N'Đã duyệt',MaNV_Duyet=@MaNV,NgayDuyet=GETDATE(),LyDoTuChoi=NULL
                    OUTPUT inserted.MaPO WHERE MaPO=@MaPO AND TrangThai=N'Chờ duyệt' AND SoNgayThanhToan BETWEEN 30 AND 45`);
        if (!result.recordset.length) return res.status(409).json({ message: 'Đơn mua không còn ở trạng thái chờ duyệt hoặc điều khoản chưa hợp lệ.' });
        await writeAudit(pool.request(), req.user, 'Phê duyệt Đơn mua hàng', req.params.id, 'Quản lý phê duyệt Đơn mua; tồn kho chưa thay đổi');
        res.json({ message: 'Đã phê duyệt Đơn mua hàng.' });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Không thể phê duyệt Đơn mua hàng.' }); }
};

const decide = status => async (req, res) => {
    try {
        const reason = clean(req.body.LyDo, 500);
        if (!reason) return res.status(400).json({ message: 'Vui lòng nhập lý do.' });
        const pool = await poolPromise;
        const result = await pool.request().input('MaPO', sql.VarChar, req.params.id).input('MaNV', sql.VarChar, req.user.MaNV)
            .input('TrangThai', sql.NVarChar, status).input('LyDo', sql.NVarChar, reason).query(`
                UPDATE DonMuaHang SET TrangThai=@TrangThai,MaNV_Duyet=@MaNV,NgayDuyet=GETDATE(),LyDoTuChoi=@LyDo
                OUTPUT inserted.MaPO,inserted.MaDN WHERE MaPO=@MaPO AND TrangThai=N'Chờ duyệt'`);
        if (!result.recordset.length) return res.status(409).json({ message: 'Đơn mua không còn ở trạng thái chờ duyệt.' });
        if (status === 'Từ chối') {
            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            await refreshRequestStatus(transaction, result.recordset[0].MaDN);
            await transaction.commit();
        }
        await writeAudit(pool.request(), req.user, status === 'Từ chối' ? 'Từ chối Đơn mua hàng' : 'Yêu cầu chỉnh sửa Đơn mua hàng', req.params.id, reason);
        res.json({ message: status === 'Từ chối' ? 'Đã từ chối Đơn mua hàng.' : 'Đã trả Đơn mua cho Nhân viên mua hàng chỉnh sửa.' });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Không thể cập nhật quyết định phê duyệt.' }); }
};

const sendSupplier = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const order = await new sql.Request(transaction).input('MaPO', sql.VarChar, req.params.id).input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`UPDATE DonMuaHang SET TrangThai=N'Đã gửi Nhà cung cấp'
                    OUTPUT inserted.MaPO WHERE MaPO=@MaPO AND MaNV_Lap=@MaNV AND TrangThai=N'Đã duyệt'`);
        if (!order.recordset.length) throw new Error('Đơn mua chưa được duyệt hoặc đã gửi Nhà cung cấp.');
        await new sql.Request(transaction).input('MaPO', sql.VarChar, req.params.id).query(`
            UPDATE tk SET tk.SLDatMua=tk.SLDatMua+ct.SoLuong,tk.NgayCapNhat=GETDATE()
            FROM TonKho tk JOIN ChiTietDonMua ct ON ct.MaSP=tk.MaSP
            WHERE ct.MaPO=@MaPO`);
        await writeAudit(new sql.Request(transaction), req.user, 'Gửi Đơn mua cho Nhà cung cấp', req.params.id, 'Bắt đầu theo dõi số lượng đã đặt nhưng chưa nhận');
        await transaction.commit();
        res.json({ message: 'Đã ghi nhận gửi Đơn mua cho Nhà cung cấp.' });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error); res.status(409).json({ message: error.message });
    }
};

const confirmSupplier = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('MaPO', sql.VarChar, req.params.id).input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`UPDATE DonMuaHang SET TrangThai=N'Nhà cung cấp xác nhận'
                    OUTPUT inserted.MaPO WHERE MaPO=@MaPO AND MaNV_Lap=@MaNV AND TrangThai=N'Đã gửi Nhà cung cấp'`);
        if (!result.recordset.length) return res.status(409).json({ message: 'Đơn mua chưa được gửi hoặc đã được xác nhận.' });
        await writeAudit(pool.request(), req.user, 'Ghi nhận Nhà cung cấp xác nhận', req.params.id, 'Nhà cung cấp xác nhận thực hiện Đơn mua');
        res.json({ message: 'Đã ghi nhận Nhà cung cấp xác nhận Đơn mua.' });
    } catch (error) { console.error(error); res.status(500).json({ message: 'Không thể cập nhật xác nhận của Nhà cung cấp.' }); }
};

const recordShipment = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const SoPhieuGiao = clean(req.body.SoPhieuGiao, 50);
        const NgayXuatPhat = new Date(req.body.NgayXuatPhat);
        const NgayGioDuKienDen = new Date(req.body.NgayGioDuKienDen);
        const BienSoXe = clean(req.body.BienSoXe, 20);
        const TenTaiXe = clean(req.body.TenTaiXe, 100);
        const SDTTaiXe = clean(req.body.SDTTaiXe, 20);
        const rawSoKien = req.body.SoKien;
        const SoKien = rawSoKien === '' || rawSoKien === null || rawSoKien === undefined ? null : Number(rawSoKien);
        const GhiChu = clean(req.body.GhiChu, 500);
        if (!SoPhieuGiao || Number.isNaN(NgayXuatPhat.getTime()) || Number.isNaN(NgayGioDuKienDen.getTime())) {
            throw new Error('Số phiếu giao, thời gian xuất phát và thời gian dự kiến đến là bắt buộc.');
        }
        if (NgayGioDuKienDen < NgayXuatPhat) throw new Error('Thời gian dự kiến đến không được trước thời gian xuất phát.');
        if (SoKien !== null && (!Number.isInteger(SoKien) || SoKien < 0)) throw new Error('Số kiện phải là số nguyên không âm.');

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const order = await new sql.Request(transaction)
            .input('MaPO', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`SELECT MaPO,TrangThai FROM DonMuaHang WITH (UPDLOCK,HOLDLOCK)
                    WHERE MaPO=@MaPO AND MaNV_Lap=@MaNV
                      AND TrangThai IN (N'Nhà cung cấp xác nhận',N'Giao một phần')`);
        if (!order.recordset.length) throw new Error('Đơn mua chưa được Nhà cung cấp xác nhận, đã có chuyến đang giao hoặc không còn được phép ghi nhận giao hàng.');

        const active = await new sql.Request(transaction).input('MaPO', sql.VarChar, req.params.id).query(`
            SELECT MaTBGH FROM ThongBaoGiaoHang WITH (UPDLOCK,HOLDLOCK)
            WHERE MaPO=@MaPO AND TrangThai IN (N'Đang giao',N'Đã đến kho')`);
        if (active.recordset.length) throw new Error('Đơn mua đang có một chuyến hàng chưa kiểm nhận xong.');

        const MaTBGH = await generateShipmentId(transaction);
        await new sql.Request(transaction)
            .input('MaTBGH', sql.VarChar, MaTBGH)
            .input('MaPO', sql.VarChar, req.params.id)
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('SoPhieuGiao', sql.VarChar, SoPhieuGiao)
            .input('NgayXuatPhat', sql.DateTime, NgayXuatPhat)
            .input('NgayGioDuKienDen', sql.DateTime, NgayGioDuKienDen)
            .input('BienSoXe', sql.VarChar, BienSoXe)
            .input('TenTaiXe', sql.NVarChar, TenTaiXe)
            .input('SDTTaiXe', sql.VarChar, SDTTaiXe)
            .input('SoKien', sql.Int, SoKien)
            .input('GhiChu', sql.NVarChar, GhiChu)
            .query(`INSERT INTO ThongBaoGiaoHang
                    (MaTBGH,MaPO,MaNVGhiNhan,SoPhieuGiao,NgayXuatPhat,NgayGioDuKienDen,
                     BienSoXe,TenTaiXe,SDTTaiXe,SoKien,TrangThai,GhiChu,NgayTao)
                    VALUES (@MaTBGH,@MaPO,@MaNV,@SoPhieuGiao,@NgayXuatPhat,@NgayGioDuKienDen,
                            @BienSoXe,@TenTaiXe,@SDTTaiXe,@SoKien,N'Đang giao',@GhiChu,GETDATE());
                    UPDATE DonMuaHang SET TrangThai=N'Đang giao',NgayGiaoDuKien=CONVERT(date,@NgayGioDuKienDen)
                    WHERE MaPO=@MaPO;`);
        await writeAudit(new sql.Request(transaction), req.user, 'Ghi nhận Nhà cung cấp giao hàng', req.params.id,
            `Chuyến ${MaTBGH}, phiếu giao ${SoPhieuGiao}; hàng đang vận chuyển và chưa được tính vào tồn kho`);
        await transaction.commit();
        res.status(201).json({
            message: 'Đã ghi nhận chuyến giao hàng. Thủ kho sẽ ghi nhận xe đến trước khi kiểm nhận; tồn kho chưa thay đổi.',
            MaTBGH
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(409).json({ message: error.message });
    }
};

module.exports = {
    list, getDetail, create, update, submit,
    approve, requestChanges: decide('Yêu cầu chỉnh sửa'), reject: decide('Từ chối'),
    sendSupplier, confirmSupplier, recordShipment
};
