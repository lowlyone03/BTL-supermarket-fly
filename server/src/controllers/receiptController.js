const { sql, poolPromise } = require('../config/db');

const clean = (value, max, fallback = null) => String(value ?? '').trim().slice(0, max) || fallback;

const writeAudit = async (request, user, action, recordId, content, table = 'PhieuNhap') => {
    await request.input('LogMaTK', sql.Int, user.MaTK)
        .input('LogHanhDong', sql.NVarChar, action)
        .input('LogBang', sql.NVarChar, table)
        .input('LogMaBanGhi', sql.VarChar, recordId)
        .input('LogNoiDung', sql.NVarChar, content)
        .query(`INSERT INTO NhatKy (MaTK,HanhDong,BangLienQuan,MaBanGhi,NoiDung,ThoiGian)
                VALUES (@LogMaTK,@LogHanhDong,@LogBang,@LogMaBanGhi,@LogNoiDung,GETDATE())`);
};

const generateId = async (transaction, table, column, prefix) => {
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 ${column} AS Ma FROM ${table} WITH (UPDLOCK,HOLDLOCK)
                WHERE ${column} LIKE @Prefix ORDER BY ${column} DESC`);
    const last = result.recordset[0]?.Ma;
    const sequence = last ? Number(last.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(sequence).padStart(4, '0')}`;
};

const normalizeLines = lines => {
    if (!Array.isArray(lines) || !lines.length) throw new Error('Phiếu nhập phải có ít nhất một mặt hàng được giao.');
    const seen = new Set();
    return lines.map((line, index) => {
        const MaSP = clean(line.MaSP, 20);
        const SoLuongGiao = Number(line.SoLuongGiao);
        const SoLuongChapNhan = Number(line.SoLuongChapNhan);
        const SoLuongTuChoi = Number(line.SoLuongTuChoi || 0);
        const DonGiaNhap = Number(line.DonGiaNhap);
        if (!MaSP || seen.has(MaSP)) throw new Error(`Dòng ${index + 1} có mã mặt hàng trống hoặc bị lặp.`);
        if (![SoLuongGiao, SoLuongChapNhan, SoLuongTuChoi].every(Number.isInteger) || SoLuongGiao <= 0 || SoLuongChapNhan < 0 || SoLuongTuChoi < 0) {
            throw new Error(`Số lượng tại dòng ${index + 1} không hợp lệ.`);
        }
        if (SoLuongGiao !== SoLuongChapNhan + SoLuongTuChoi) throw new Error(`Dòng ${index + 1}: số giao phải bằng số chấp nhận cộng số từ chối.`);
        if (!Number.isFinite(DonGiaNhap) || DonGiaNhap < 0) throw new Error(`Đơn giá nhập tại dòng ${index + 1} không hợp lệ.`);
        const TinhTrangHang = clean(line.TinhTrangHang, 200, SoLuongTuChoi ? 'Có hàng không đạt' : 'Đạt yêu cầu');
        const LyDoTuChoi = clean(line.LyDoTuChoi, 300);
        if (SoLuongTuChoi > 0 && !LyDoTuChoi) throw new Error(`Vui lòng ghi lý do từ chối tại dòng ${index + 1}.`);
        seen.add(MaSP);
        return {
            MaSP, SoLuongGiao, SoLuongChapNhan, SoLuongTuChoi, DonGiaNhap,
            ThanhTien: SoLuongChapNhan * DonGiaNhap,
            TinhTrangHang, LyDoTuChoi,
            HanSD: clean(line.HanSD, 10), SoLo: clean(line.SoLo, 50), ViTriKho: clean(line.ViTriKho, 100)
        };
    });
};

const listAvailableOrders = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT gh.MaTBGH,gh.SoPhieuGiao,gh.NgayXuatPhat,gh.NgayGioDuKienDen,gh.BienSoXe,
                   gh.TenTaiXe,gh.SDTTaiXe,gh.SoKien,gh.TrangThai AS TrangThaiGiao,gh.NgayDen,
                   po.MaPO,po.MaNCC,ncc.TenNCC,po.NgayGiaoDuKien,po.TrangThai,po.TongTien,
                   COUNT(ct.MaSP) AS SoMatHang,SUM(ct.SLConThieu) AS TongConThieu
            FROM ThongBaoGiaoHang gh
            JOIN DonMuaHang po ON po.MaPO=gh.MaPO
            JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
            JOIN ChiTietDonMua ct ON ct.MaPO=po.MaPO
            WHERE gh.TrangThai IN (N'Đang giao',N'Đã đến kho')
              AND ct.SLConThieu>0
            GROUP BY gh.MaTBGH,gh.SoPhieuGiao,gh.NgayXuatPhat,gh.NgayGioDuKienDen,gh.BienSoXe,
                     gh.TenTaiXe,gh.SDTTaiXe,gh.SoKien,gh.TrangThai,gh.NgayDen,
                     po.MaPO,po.MaNCC,ncc.TenNCC,po.NgayGiaoDuKien,po.TrangThai,po.TongTien
            ORDER BY CASE WHEN gh.TrangThai=N'Đã đến kho' THEN 0 ELSE 1 END,gh.NgayGioDuKienDen,po.MaPO`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh sách Đơn mua đang chờ nhận hàng.' });
    }
};

const markShipmentArrived = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('MaTBGH', sql.VarChar, req.params.id).query(`
            UPDATE ThongBaoGiaoHang SET TrangThai=N'Đã đến kho',NgayDen=GETDATE()
            OUTPUT inserted.MaTBGH,inserted.MaPO,inserted.NgayDen
            WHERE MaTBGH=@MaTBGH AND TrangThai=N'Đang giao'`);
        if (!result.recordset.length) return res.status(409).json({ message: 'Chuyến hàng không còn ở trạng thái đang giao hoặc đã được ghi nhận đến kho.' });
        await writeAudit(pool.request(), req.user, 'Ghi nhận xe hàng đến kho', req.params.id,
            `Xe giao Đơn mua ${result.recordset[0].MaPO} đã đến; hàng chưa được kiểm nhận và chưa tăng tồn kho`, 'ThongBaoGiaoHang');
        res.json({ message: 'Đã ghi nhận xe hàng đến kho. Bây giờ Thủ kho có thể mở kiểm nhận; tồn kho chưa thay đổi.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể ghi nhận chuyến hàng đến kho.' });
    }
};

const getShipmentForReceipt = async (req, res) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request().input('MaTBGH', sql.VarChar, req.params.id).query(`
            SELECT gh.MaTBGH,gh.SoPhieuGiao,gh.NgayXuatPhat,gh.NgayGioDuKienDen,gh.BienSoXe,
                   gh.TenTaiXe,gh.SDTTaiXe,gh.SoKien,gh.TrangThai AS TrangThaiGiao,gh.NgayDen,gh.GhiChu AS GhiChuGiao,
                   po.MaPO,po.MaNCC,ncc.TenNCC,po.NgayGiaoDuKien,po.TrangThai,po.GhiChu
            FROM ThongBaoGiaoHang gh
            JOIN DonMuaHang po ON po.MaPO=gh.MaPO
            JOIN NhaCungCap ncc ON ncc.MaNCC=po.MaNCC
            WHERE gh.MaTBGH=@MaTBGH AND gh.TrangThai=N'Đã đến kho'`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Chuyến hàng chưa được ghi nhận đến kho hoặc đã bắt đầu kiểm nhận.' });
        const lines = await pool.request().input('MaPO', sql.VarChar, header.recordset[0].MaPO).query(`
            SELECT ct.MaSP,sp.TenSP,sp.DonViTinh,ct.SoLuong,ct.DonGia,ct.SLDaGiao,ct.SLConThieu
            FROM ChiTietDonMua ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaPO=@MaPO AND ct.SLConThieu>0 ORDER BY sp.TenSP`);
        const warehouses = await pool.request().query(`SELECT MaKho,TenKho,DiaChi FROM Kho WHERE TrangThai=1 ORDER BY MaKho`);
        res.json({ order: header.recordset[0], lines: lines.recordset, warehouses: warehouses.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải thông tin kiểm nhận theo Đơn mua.' });
    }
};

const listReceipts = async (req, res) => {
    try {
        const keyword = clean(req.query.search, 120, '');
        const status = clean(req.query.status, 30, '');
        const pool = await poolPromise;
        const result = await pool.request().input('TuKhoa', sql.NVarChar, keyword).input('Mau', sql.NVarChar, `%${keyword}%`)
            .input('TrangThai', sql.NVarChar, status).query(`
                SELECT pn.MaPN,pn.MaPO,pn.MaNCC,ncc.TenNCC,pn.MaKho,k.TenKho,pn.NgayNhap,pn.NgayXacNhan,
                       pn.TongTien,pn.TrangThai,COUNT(ct.MaSP) AS SoMatHang,
                       SUM(ct.SoLuongGiao) AS TongGiao,SUM(ct.SoLuongChapNhan) AS TongChapNhan,SUM(ct.SoLuongTuChoi) AS TongTuChoi
                FROM PhieuNhap pn JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC JOIN Kho k ON k.MaKho=pn.MaKho
                JOIN ChiTietPhieuNhap ct ON ct.MaPN=pn.MaPN
                WHERE (@TrangThai=N'' OR pn.TrangThai=@TrangThai)
                  AND (@TuKhoa=N'' OR pn.MaPN LIKE @Mau OR pn.MaPO LIKE @Mau OR ncc.TenNCC LIKE @Mau)
                GROUP BY pn.MaPN,pn.MaPO,pn.MaNCC,ncc.TenNCC,pn.MaKho,k.TenKho,pn.NgayNhap,pn.NgayXacNhan,pn.TongTien,pn.TrangThai
                ORDER BY pn.NgayNhap DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh sách Phiếu nhập.' });
    }
};

const getReceiptDetail = async (req, res) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request().input('MaPN', sql.VarChar, req.params.id).query(`
            SELECT pn.*,ncc.TenNCC,k.TenKho,nv.TenNV AS NguoiKiemNhan
            FROM PhieuNhap pn JOIN NhaCungCap ncc ON ncc.MaNCC=pn.MaNCC JOIN Kho k ON k.MaKho=pn.MaKho
            JOIN NhanVien nv ON nv.MaNV=pn.MaNV WHERE pn.MaPN=@MaPN`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy Phiếu nhập.' });
        const lines = await pool.request().input('MaPN', sql.VarChar, req.params.id).query(`
            SELECT ct.*,sp.TenSP,sp.DonViTinh FROM ChiTietPhieuNhap ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaPN=@MaPN ORDER BY sp.TenSP`);
        res.json({ receipt: header.recordset[0], lines: lines.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải chi tiết Phiếu nhập.' });
    }
};

const createReceipt = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const MaPO = clean(req.body.MaPO, 20);
        const MaTBGH = clean(req.body.MaTBGH, 20);
        const MaKho = clean(req.body.MaKho, 20);
        const lines = normalizeLines(req.body.lines);
        if (!MaPO || !MaTBGH || !MaKho) throw new Error('Chuyến giao, Đơn mua và kho nhận hàng là bắt buộc.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const order = await new sql.Request(transaction).input('MaPO', sql.VarChar, MaPO)
            .input('MaTBGH', sql.VarChar, MaTBGH).query(`
            SELECT po.MaPO,po.MaNCC,po.TrangThai
            FROM ThongBaoGiaoHang gh WITH (UPDLOCK,HOLDLOCK)
            JOIN DonMuaHang po WITH (UPDLOCK,HOLDLOCK) ON po.MaPO=gh.MaPO
            WHERE gh.MaTBGH=@MaTBGH AND gh.MaPO=@MaPO AND gh.TrangThai=N'Đã đến kho'
              AND po.TrangThai=N'Đang giao'
              AND NOT EXISTS (SELECT 1 FROM PhieuNhap WHERE MaTBGH=@MaTBGH)`);
        if (!order.recordset.length) throw new Error('Chuyến hàng chưa đến kho, đã được lập Phiếu nhập hoặc không còn hợp lệ để kiểm nhận.');
        const warehouse = await new sql.Request(transaction).input('MaKho', sql.VarChar, MaKho)
            .query(`SELECT MaKho FROM Kho WHERE MaKho=@MaKho AND TrangThai=1`);
        if (!warehouse.recordset.length) throw new Error('Kho nhận hàng không tồn tại hoặc đã ngừng hoạt động.');
        for (const line of lines) {
            const ordered = await new sql.Request(transaction).input('MaPO', sql.VarChar, MaPO).input('MaSP', sql.VarChar, line.MaSP)
                .query(`SELECT SLConThieu,DonGia FROM ChiTietDonMua WITH (UPDLOCK) WHERE MaPO=@MaPO AND MaSP=@MaSP`);
            if (!ordered.recordset.length) throw new Error(`Mặt hàng ${line.MaSP} không thuộc Đơn mua.`);
            if (line.SoLuongGiao > Number(ordered.recordset[0].SLConThieu)) {
                throw new Error(`Số giao của ${line.MaSP} vượt quá ${ordered.recordset[0].SLConThieu} còn thiếu trên Đơn mua.`);
            }
        }
        const now = new Date();
        const prefix = `PN${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const MaPN = await generateId(transaction, 'PhieuNhap', 'MaPN', prefix);
        const total = lines.reduce((sum, line) => sum + line.ThanhTien, 0);
        await new sql.Request(transaction).input('MaPN', sql.VarChar, MaPN).input('MaPO', sql.VarChar, MaPO)
            .input('MaTBGH', sql.VarChar, MaTBGH)
            .input('MaNCC', sql.VarChar, order.recordset[0].MaNCC).input('MaNV', sql.VarChar, req.user.MaNV)
            .input('MaKho', sql.VarChar, MaKho).input('TongTien', sql.Decimal(18, 2), total)
            .input('GhiChu', sql.NVarChar, clean(req.body.GhiChu, 500)).query(`
                INSERT INTO PhieuNhap (MaPN,MaPO,MaTBGH,MaNCC,MaNV,MaKho,NgayNhap,TongTien,TrangThai,GhiChu)
                VALUES (@MaPN,@MaPO,@MaTBGH,@MaNCC,@MaNV,@MaKho,GETDATE(),@TongTien,N'Nháp',@GhiChu);
                UPDATE ThongBaoGiaoHang SET TrangThai=N'Đang kiểm nhận' WHERE MaTBGH=@MaTBGH;`);
        for (const line of lines) {
            await new sql.Request(transaction).input('MaPN', sql.VarChar, MaPN).input('MaSP', sql.VarChar, line.MaSP)
                .input('ChapNhan', sql.Int, line.SoLuongChapNhan).input('DonGia', sql.Decimal(18, 2), line.DonGiaNhap)
                .input('ThanhTien', sql.Decimal(18, 2), line.ThanhTien).input('Giao', sql.Int, line.SoLuongGiao)
                .input('TuChoi', sql.Int, line.SoLuongTuChoi).input('TinhTrang', sql.NVarChar, line.TinhTrangHang)
                .input('LyDo', sql.NVarChar, line.LyDoTuChoi).input('HanSD', sql.Date, line.HanSD)
                .input('SoLo', sql.VarChar, line.SoLo).input('ViTri', sql.NVarChar, line.ViTriKho).query(`
                    INSERT INTO ChiTietPhieuNhap
                    (MaPN,MaSP,SoLuongChapNhan,DonGiaNhap,ThanhTien,SoLuongGiao,SoLuongTuChoi,TinhTrangHang,LyDoTuChoi,HanSD,SoLo,ViTriKho)
                    VALUES (@MaPN,@MaSP,@ChapNhan,@DonGia,@ThanhTien,@Giao,@TuChoi,@TinhTrang,@LyDo,@HanSD,@SoLo,@ViTri)`);
        }
        await writeAudit(new sql.Request(transaction), req.user, 'Lập Phiếu kiểm nhận hàng', MaPN, `Ghi nhận lô hàng giao theo Đơn mua ${MaPO}; tồn kho chưa thay đổi`);
        await transaction.commit();
        res.status(201).json({ message: 'Đã lưu Phiếu kiểm nhận. Tồn kho chưa thay đổi cho tới khi xác nhận nhập.', MaPN });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

const confirmReceipt = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const header = await new sql.Request(transaction).input('MaPN', sql.VarChar, req.params.id).query(`
            SELECT pn.MaPN,pn.MaPO,pn.MaTBGH,pn.MaKho,pn.TrangThai,po.MaDN
            FROM PhieuNhap pn WITH (UPDLOCK) JOIN DonMuaHang po WITH (UPDLOCK) ON po.MaPO=pn.MaPO
            WHERE pn.MaPN=@MaPN`);
        if (!header.recordset.length) throw new Error('Không tìm thấy Phiếu nhập.');
        if (header.recordset[0].TrangThai !== 'Nháp') throw new Error('Phiếu nhập đã được xác nhận hoặc không còn hợp lệ.');
        const { MaPN, MaPO, MaTBGH, MaKho, MaDN } = header.recordset[0];
        const lines = await new sql.Request(transaction).input('MaPN', sql.VarChar, MaPN).query(`
            SELECT ct.* FROM ChiTietPhieuNhap ct WHERE ct.MaPN=@MaPN`);
        for (let index = 0; index < lines.recordset.length; index += 1) {
            const line = lines.recordset[index];
            const orderLine = await new sql.Request(transaction).input('MaPO', sql.VarChar, MaPO).input('MaSP', sql.VarChar, line.MaSP)
                .query(`SELECT SLConThieu FROM ChiTietDonMua WITH (UPDLOCK) WHERE MaPO=@MaPO AND MaSP=@MaSP`);
            if (!orderLine.recordset.length || Number(line.SoLuongGiao) > Number(orderLine.recordset[0].SLConThieu)) {
                throw new Error(`Số giao của ${line.MaSP} không còn phù hợp với phần còn thiếu trên Đơn mua.`);
            }
            const accepted = Number(line.SoLuongChapNhan);
            if (accepted > 0) {
                await new sql.Request(transaction).input('MaKho', sql.VarChar, MaKho).input('MaSP', sql.VarChar, line.MaSP)
                    .input('SoLuong', sql.Int, accepted).input('DonGia', sql.Decimal(18, 2), line.DonGiaNhap).query(`
                        UPDATE TonKho WITH (UPDLOCK)
                        SET DonGiaBinhQuan=CASE WHEN SLTon+@SoLuong=0 THEN 0
                            ELSE ((SLTon*DonGiaBinhQuan)+(@SoLuong*@DonGia))/(SLTon+@SoLuong) END,
                            SLTon=SLTon+@SoLuong,
                            SLDatMua=CASE WHEN SLDatMua>=@SoLuong THEN SLDatMua-@SoLuong ELSE 0 END,
                            GiaTriTon=(SLTon+@SoLuong)*CASE WHEN SLTon+@SoLuong=0 THEN 0
                            ELSE ((SLTon*DonGiaBinhQuan)+(@SoLuong*@DonGia))/(SLTon+@SoLuong) END,
                            NgayCapNhat=GETDATE()
                        WHERE MaKho=@MaKho AND MaSP=@MaSP`);
                const gdPrefix = `GD${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`;
                const MaGD = await generateId(transaction, 'GiaoDichKho', 'MaGD', gdPrefix);
                await new sql.Request(transaction).input('MaGD', sql.VarChar, MaGD).input('MaKho', sql.VarChar, MaKho)
                    .input('MaSP', sql.VarChar, line.MaSP).input('MaNV', sql.VarChar, req.user.MaNV)
                    .input('SoLuong', sql.Int, accepted).input('DonGia', sql.Decimal(18, 2), line.DonGiaNhap)
                    .input('ThanhTien', sql.Decimal(18, 2), accepted * Number(line.DonGiaNhap)).input('MaPN', sql.VarChar, MaPN)
                    .query(`INSERT INTO GiaoDichKho
                        (MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                        VALUES (@MaGD,@MaKho,@MaSP,@MaNV,N'Nhập',@SoLuong,@DonGia,@ThanhTien,N'Phiếu nhập',@MaPN,GETDATE(),N'Nhập hàng theo Đơn mua')`);
                await new sql.Request(transaction).input('MaPO', sql.VarChar, MaPO).input('MaSP', sql.VarChar, line.MaSP)
                    .input('SoLuong', sql.Int, accepted).query(`
                        UPDATE ChiTietDonMua SET SLDaGiao=SLDaGiao+@SoLuong,SLConThieu=SoLuong-(SLDaGiao+@SoLuong)
                        WHERE MaPO=@MaPO AND MaSP=@MaSP`);
            }
        }
        const remain = await new sql.Request(transaction).input('MaPO', sql.VarChar, MaPO)
            .query(`SELECT SUM(SLConThieu) AS ConThieu FROM ChiTietDonMua WHERE MaPO=@MaPO`);
        const poStatus = Number(remain.recordset[0].ConThieu || 0) === 0 ? 'Hoàn thành' : 'Giao một phần';
        await new sql.Request(transaction).input('MaPN', sql.VarChar, MaPN).input('MaPO', sql.VarChar, MaPO)
            .input('MaTBGH', sql.VarChar, MaTBGH)
            .input('POTrangThai', sql.NVarChar, poStatus).query(`
                UPDATE PhieuNhap SET TrangThai=N'Đã xác nhận',NgayXacNhan=GETDATE() WHERE MaPN=@MaPN AND TrangThai=N'Nháp';
                UPDATE DonMuaHang SET TrangThai=@POTrangThai WHERE MaPO=@MaPO;
                UPDATE ThongBaoGiaoHang SET TrangThai=N'Đã kiểm nhận' WHERE MaTBGH=@MaTBGH;`);
        if (MaDN) {
            const requestProgress = await new sql.Request(transaction).input('MaDN', sql.VarChar, MaDN).query(`
                SELECT SUM(ct.SLDeNghi) AS TongDeNghi,
                       ISNULL((SELECT SUM(ctpo.SoLuong) FROM DonMuaHang po JOIN ChiTietDonMua ctpo ON ctpo.MaPO=po.MaPO
                               WHERE po.MaDN=@MaDN AND po.TrangThai<>N'Từ chối'),0) AS TongDaDat,
                       ISNULL((SELECT SUM(ctpo.SLDaGiao) FROM DonMuaHang po JOIN ChiTietDonMua ctpo ON ctpo.MaPO=po.MaPO
                               WHERE po.MaDN=@MaDN AND po.TrangThai<>N'Từ chối'),0) AS TongDaNhan
                FROM ChiTietDeNghi ct WHERE ct.MaDN=@MaDN`);
            const progress = requestProgress.recordset[0];
            if (Number(progress.TongDaDat) >= Number(progress.TongDeNghi) && Number(progress.TongDaNhan) >= Number(progress.TongDeNghi)) {
                await new sql.Request(transaction).input('MaDN', sql.VarChar, MaDN)
                    .query(`UPDATE DeNghiMuaHang SET TrangThai=N'Hoàn thành' WHERE MaDN=@MaDN`);
            }
        }
        await writeAudit(new sql.Request(transaction), req.user, 'Xác nhận nhập kho', MaPN, `Cộng số lượng đạt yêu cầu vào kho và cập nhật tiến độ Đơn mua ${MaPO}`);
        await transaction.commit();
        res.json({ message: 'Đã xác nhận nhập kho. Tồn kho chỉ tăng theo số lượng đạt yêu cầu.', TrangThaiDonMua: poStatus });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(409).json({ message: error.message });
    }
};

module.exports = {
    listAvailableOrders,
    markShipmentArrived,
    getShipmentForReceipt,
    listReceipts,
    getReceiptDetail,
    createReceipt,
    confirmReceipt
};
