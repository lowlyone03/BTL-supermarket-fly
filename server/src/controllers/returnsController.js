const { sql, poolPromise } = require('../config/db');
const { isRestockAccepted, isEqualValueExchange, roundMoney } = require('../services/financialRules');

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);

const generateId = async (transaction, table, column, prefix) => {
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 ${column} Id FROM ${table} WITH (UPDLOCK,HOLDLOCK)
                WHERE ${column} LIKE @Prefix ORDER BY ${column} DESC`);
    const last = result.recordset[0]?.Id;
    return `${prefix}${String(last ? Number(last.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
};

const writeAudit = async (request, user, action, recordId, content) => {
    await request.input('MaTK', sql.Int, user.MaTK).input('HanhDong', sql.NVarChar, action)
        .input('MaBanGhi', sql.VarChar, recordId).input('NoiDung', sql.NVarChar, content)
        .query(`INSERT NhatKy(MaTK,HanhDong,BangLienQuan,MaBanGhi,NoiDung,ThoiGian)
                VALUES(@MaTK,@HanhDong,N'PhieuDoiTra',@MaBanGhi,@NoiDung,GETDATE())`);
};

const loadDetail = async (pool, maDT) => {
    const header = await pool.request().input('MaDT', sql.VarChar, maDT).query(`
        SELECT dt.*, hd.NgayLap NgayHoaDon, hd.TongThanhToan, hd.MaKH, hd.MaCa MaCaGoc,
               kh.TenKH, kh.SDT, nv.TenNV NguoiLap, nvk.TenNV NguoiKiemTra, nvd.TenNV NguoiDuyet,
               ban.TenNV ThuNganGoc
        FROM PhieuDoiTra dt
        JOIN HoaDon hd ON hd.MaHD=dt.MaHD
        JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
        JOIN NhanVien ban ON ban.MaNV=hd.MaNV
        LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
        LEFT JOIN NhanVien nvk ON nvk.MaNV=dt.MaNV_KiemTra
        LEFT JOIN NhanVien nvd ON nvd.MaNV=dt.MaNV_Duyet
        WHERE dt.MaDT=@MaDT`);
    if (!header.recordset.length) return null;
    const lines = await pool.request().input('MaDT', sql.VarChar, maDT).query(`
        SELECT ct.*, sp.TenSP, sp.DonViTinh
        FROM ChiTietDoiTra ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
        WHERE ct.MaDT=@MaDT ORDER BY ct.LoaiDong, sp.TenSP`);
    return { ticket: header.recordset[0], lines: lines.recordset };
};

const searchInvoices = async (req, res) => {
    try {
        const search = clean(req.query.search, 100);
        if (search.length < 2) return res.json({ items: [] });
        const pool = await poolPromise;
        const result = await pool.request().input('Search', sql.NVarChar, `%${search}%`).query(`
            SELECT TOP 30 hd.MaHD, hd.NgayLap, hd.TongThanhToan, hd.MaKH, hd.MaCa, hd.MaNV,
                   kh.TenKH, kh.SDT, nv.TenNV
            FROM HoaDon hd
            JOIN NhanVien nv ON nv.MaNV=hd.MaNV
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            WHERE hd.TrangThai=N'Hoàn thành'
              AND (hd.MaHD LIKE @Search OR kh.TenKH LIKE @Search OR kh.SDT LIKE @Search
                   OR nv.TenNV LIKE @Search OR hd.MaCa LIKE @Search)
            ORDER BY hd.NgayLap DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tìm hóa đơn gốc.' });
    }
};

const getInvoiceForReturn = async (req, res) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request().input('MaHD', sql.VarChar, clean(req.params.id, 20)).query(`
            SELECT hd.MaHD, hd.NgayLap, hd.TongThanhToan, hd.MaKH, hd.MaCa, hd.MaNV, hd.MaKho,
                   kh.TenKH, kh.SDT, nv.TenNV
            FROM HoaDon hd JOIN NhanVien nv ON nv.MaNV=hd.MaNV
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            WHERE hd.MaHD=@MaHD AND hd.TrangThai=N'Hoàn thành'`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Chỉ hóa đơn đã hoàn thành mới được đổi trả.' });
        const lines = await pool.request().input('MaHD', sql.VarChar, req.params.id).query(`
            SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SoLuong, ct.DonGia, ct.ThanhTien, ct.DonGiaVon,
                   ct.SoLuong - ISNULL((
                       SELECT SUM(dtct.SoLuong) FROM ChiTietDoiTra dtct
                       JOIN PhieuDoiTra dt ON dt.MaDT=dtct.MaDT
                       WHERE dt.MaHD=@MaHD AND dtct.MaSP=ct.MaSP AND dtct.LoaiDong=N'Hàng khách trả'
                         AND dt.TrangThai NOT IN (N'Từ chối', N'Đã hủy')
                   ),0) AS SLConDoiTra
            FROM ChiTietHoaDon ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaHD=@MaHD`);
        res.json({ invoice: header.recordset[0], lines: lines.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải hóa đơn đổi trả.' });
    }
};

const listReturns = async (req, res) => {
    try {
        const status = clean(req.query.status, 30);
        const scope = clean(req.query.scope, 20);
        const pool = await poolPromise;
        const result = await pool.request()
            .input('Status', sql.NVarChar, status)
            .input('MaNV', sql.VarChar, req.user.MaNV).query(`
            SELECT dt.MaDT, dt.MaHD, dt.NgayLap, dt.HinhThucXuLy, dt.SoTienHoan, dt.TrangThai,
                   dt.LyDo, dt.MaCaHoan, nv.TenNV NguoiLap, kh.TenKH, hd.MaCa MaCaGoc, ban.TenNV ThuNganGoc
            FROM PhieuDoiTra dt
            JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
            JOIN HoaDon hd ON hd.MaHD=dt.MaHD
            JOIN NhanVien ban ON ban.MaNV=hd.MaNV
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            WHERE (@Status=N'' OR dt.TrangThai=@Status)
              AND (${scope === 'mine' ? 'dt.MaNV_Lap=@MaNV' : '1=1'})
            ORDER BY dt.NgayLap DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải danh sách đổi trả.' });
    }
};

const listRecentInvoices = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TOP 12 hd.MaHD, hd.NgayLap, hd.TongThanhToan, hd.MaKH, hd.MaCa, hd.MaNV,
                   kh.TenKH, kh.SDT, nv.TenNV
            FROM HoaDon hd
            JOIN NhanVien nv ON nv.MaNV=hd.MaNV
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            WHERE hd.TrangThai=N'Hoàn thành'
            ORDER BY hd.NgayLap DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải hóa đơn gần đây.' });
    }
};

const getReturn = async (req, res) => {
    try {
        const detail = await loadDetail(await poolPromise, clean(req.params.id, 20));
        if (!detail) return res.status(404).json({ message: 'Không tìm thấy phiếu đổi trả.' });
        res.json(detail);
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải phiếu đổi trả.' });
    }
};

const createReturn = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const maHD = clean(req.body.MaHD, 20);
        const reason = clean(req.body.LyDo, 500);
        const form = clean(req.body.HinhThucXuLy, 30);
        const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
        if (!reason) throw new Error('Phải nhập lý do đổi trả.');
        if (!['Đổi hàng', 'Hoàn tiền'].includes(form)) throw new Error('Hình thức xử lý phải là Đổi hàng hoặc Hoàn tiền.');
        if (!lines.length) throw new Error('Chọn ít nhất một sản phẩm khách trả.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const invoice = await new sql.Request(transaction).input('MaHD', sql.VarChar, maHD)
            .query(`SELECT MaHD, MaKho FROM HoaDon WITH(UPDLOCK,HOLDLOCK) WHERE MaHD=@MaHD AND TrangThai=N'Hoàn thành'`);
        if (!invoice.recordset.length) throw new Error('Hóa đơn gốc chưa hoàn thành hoặc không tồn tại.');
        const prefix = `DT${new Date().toISOString().slice(2, 10).replaceAll('-', '')}`;
        const maDT = await generateId(transaction, 'PhieuDoiTra', 'MaDT', prefix);
        const prepared = [];
        let refund = 0;
        for (const raw of lines) {
            const maSP = clean(raw.MaSP, 20);
            const qty = Number(raw.SoLuong);
            if (!maSP || !Number.isInteger(qty) || qty <= 0) throw new Error('Dòng hàng đổi trả không hợp lệ.');
            const origin = await new sql.Request(transaction).input('MaHD', sql.VarChar, maHD)
                .input('MaSP', sql.VarChar, maSP).query(`
                    SELECT ct.SoLuong, ct.DonGia, ct.ThanhTien, ct.DonGiaVon,
                           ct.SoLuong - ISNULL((
                               SELECT SUM(dtct.SoLuong) FROM ChiTietDoiTra dtct
                               JOIN PhieuDoiTra dt ON dt.MaDT=dtct.MaDT
                               WHERE dt.MaHD=@MaHD AND dtct.MaSP=@MaSP AND dtct.LoaiDong=N'Hàng khách trả'
                                 AND dt.TrangThai NOT IN (N'Từ chối', N'Đã hủy')
                           ),0) ConLai
                    FROM ChiTietHoaDon ct WHERE ct.MaHD=@MaHD AND ct.MaSP=@MaSP`);
            if (!origin.recordset.length) throw new Error(`Sản phẩm ${maSP} không có trên hóa đơn gốc.`);
            if (qty > Number(origin.recordset[0].ConLai)) throw new Error(`Số lượng đổi trả ${maSP} vượt phần còn lại trên hóa đơn.`);
            const unit = Number(origin.recordset[0].DonGia);
            const cost = Number(origin.recordset[0].DonGiaVon || 0);
            const amount = unit * qty;
            refund += amount;
            prepared.push({ maSP, qty, unit, cost, amount, note: clean(raw.LyDo, 200) || reason });
        }
        await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).input('MaHD', sql.VarChar, maHD)
            .input('MaNV', sql.VarChar, req.user.MaNV).input('LyDo', sql.NVarChar, reason)
            .input('HinhThuc', sql.NVarChar, form)
            .input('SoTienHoan', sql.Decimal(18, 2), form === 'Hoàn tiền' ? refund : 0).query(`
                INSERT PhieuDoiTra(MaDT,MaHD,MaNV_Lap,LyDo,HinhThucXuLy,SoTienHoan,TrangThai,NgayLap)
                VALUES(@MaDT,@MaHD,@MaNV,@LyDo,@HinhThuc,@SoTienHoan,N'Nháp',GETDATE())`);
        for (const line of prepared) {
            await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).input('MaSP', sql.VarChar, line.maSP)
                .input('SoLuong', sql.Int, line.qty).input('DonGia', sql.Decimal(18, 2), line.unit)
                .input('ThanhTien', sql.Decimal(18, 2), line.amount).input('DonGiaVon', sql.Decimal(18, 2), line.cost)
                .input('ThanhTienVon', sql.Decimal(18, 2), line.cost * line.qty)
                .input('LyDo', sql.NVarChar, line.note).query(`
                    INSERT ChiTietDoiTra(MaDT,MaSP,LoaiDong,SoLuong,DonGia,ThanhTien,DonGiaVon,ThanhTienVon,LyDo)
                    VALUES(@MaDT,@MaSP,N'Hàng khách trả',@SoLuong,@DonGia,@ThanhTien,@DonGiaVon,@ThanhTienVon,@LyDo)`);
        }
        await writeAudit(new sql.Request(transaction), req.user, 'Lập phiếu đổi trả', maDT, `Từ hóa đơn ${maHD}`);
        await transaction.commit();
        res.status(201).json({ message: `Đã lưu phiếu đổi trả nháp ${maDT}.`, MaDT: maDT });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const submitReturn = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('MaDT', sql.VarChar, clean(req.params.id, 20))
            .input('MaNV', sql.VarChar, req.user.MaNV).query(`
                UPDATE PhieuDoiTra SET TrangThai=N'Chờ kiểm tra'
                WHERE MaDT=@MaDT AND MaNV_Lap=@MaNV AND TrangThai=N'Nháp';
                SELECT @@ROWCOUNT affected;`);
        if (!result.recordset[0].affected) return res.status(400).json({ message: 'Chỉ phiếu nháp do bạn lập mới gửi Thủ kho kiểm tra.' });
        await writeAudit(pool.request(), req.user, 'Gửi hàng đổi trả cho Thủ kho', req.params.id, 'Chờ kiểm tra tình trạng hàng');
        res.json({ message: 'Đã gửi hàng cho Thủ kho kiểm tra.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const inspectReturn = async (req, res) => {
    try {
        const resultText = clean(req.body.KetQuaKiemTra, 200);
        const restock = Boolean(req.body.DuocNhapLai);
        if (!resultText) throw new Error('Phải ghi kết quả kiểm tra.');
        const pool = await poolPromise;
        const ketQua = `${restock ? 'Đạt yêu cầu, được nhập lại kho' : 'Không đạt, không nhập lại kho'}. ${resultText}`.slice(0, 200);
        const result = await pool.request().input('MaDT', sql.VarChar, clean(req.params.id, 20))
            .input('MaNV', sql.VarChar, req.user.MaNV).input('KetQua', sql.NVarChar, ketQua).query(`
                UPDATE PhieuDoiTra SET MaNV_KiemTra=@MaNV, NgayKiemTra=GETDATE(),
                    KetQuaKiemTra=@KetQua, TrangThai=N'Chờ duyệt'
                WHERE MaDT=@MaDT AND TrangThai=N'Chờ kiểm tra';
                SELECT @@ROWCOUNT affected;`);
        if (!result.recordset[0].affected) return res.status(400).json({ message: 'Phiếu không còn ở trạng thái chờ kiểm tra.' });
        await writeAudit(pool.request(), req.user, 'Kiểm tra hàng đổi trả', req.params.id, ketQua);
        res.json({ message: 'Đã ghi kết quả kiểm tra và chuyển Quản lý phê duyệt.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const decideReturn = (approved) => async (req, res) => {
    try {
        const reason = clean(req.body.LyDo, 500);
        if (!approved && !reason) throw new Error('Từ chối phải ghi lý do.');
        const pool = await poolPromise;
        const result = await pool.request().input('MaDT', sql.VarChar, clean(req.params.id, 20))
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('TrangThai', sql.NVarChar, approved ? 'Đã duyệt' : 'Từ chối')
            .input('LyDo', sql.NVarChar, reason || null).query(`
                UPDATE PhieuDoiTra SET TrangThai=@TrangThai, MaNV_Duyet=@MaNV, NgayDuyet=GETDATE(),
                    GhiChu=COALESCE(@LyDo, GhiChu)
                WHERE MaDT=@MaDT AND TrangThai=N'Chờ duyệt';
                SELECT @@ROWCOUNT affected;`);
        if (!result.recordset[0].affected) return res.status(400).json({ message: 'Phiếu không còn chờ phê duyệt.' });
        await writeAudit(pool.request(), req.user, approved ? 'Phê duyệt đổi trả' : 'Từ chối đổi trả', req.params.id, reason || 'Đồng ý theo kết quả kiểm tra của Thủ kho');
        res.json({ message: approved ? 'Đã phê duyệt phiếu đổi trả.' : 'Đã từ chối phiếu đổi trả.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const completeReturn = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const maDT = clean(req.params.id, 20);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const header = await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
            SELECT dt.*, hd.MaKho FROM PhieuDoiTra dt WITH(UPDLOCK,HOLDLOCK)
            JOIN HoaDon hd ON hd.MaHD=dt.MaHD
            WHERE dt.MaDT=@MaDT`);
        if (!header.recordset.length) throw new Error('Không tìm thấy phiếu đổi trả.');
        const ticket = header.recordset[0];
        if (ticket.MaNV_Lap !== req.user.MaNV) throw new Error('Chỉ thu ngân lập phiếu mới hoàn tất đổi trả.');
        if (ticket.TrangThai !== 'Đã duyệt') throw new Error('Chỉ phiếu đã được Quản lý duyệt mới hoàn tất được.');
        const shift = await new sql.Request(transaction).input('MaNV', sql.VarChar, req.user.MaNV).query(`
            SELECT TOP 1 MaCa FROM CaLamViec WITH(UPDLOCK,HOLDLOCK)
            WHERE MaNV=@MaNV AND TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL`);
        if (!shift.recordset.length) throw new Error('Phải mở ca bán hàng của bạn trước khi hoàn tiền hoặc giao hàng đổi. Không mở lại ca nhân viên đã đóng.');
        const maCaHoan = shift.recordset[0].MaCa;
        const restock = isRestockAccepted(ticket.KetQuaKiemTra);
        const returned = await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
            SELECT * FROM ChiTietDoiTra WITH(UPDLOCK,HOLDLOCK) WHERE MaDT=@MaDT AND LoaiDong=N'Hàng khách trả'`);
        let refund = null;
        let preparedExchange = [];
        if (ticket.HinhThucXuLy === 'Hoàn tiền') {
            const method = clean(req.body.PhuongThucHoan, 30);
            const code = clean(req.body.MaGiaoDichHoan, 50) || null;
            if (!['Tiền mặt', 'QR', 'Thẻ', 'Chuyển khoản'].includes(method)) throw new Error('Phương thức hoàn tiền không hợp lệ.');
            if (method !== 'Tiền mặt' && !code) throw new Error('Hoàn tiền điện tử phải có mã giao dịch.');
            refund = { method, code };
        } else if (ticket.HinhThucXuLy === 'Đổi hàng') {
            const exchange = Array.isArray(req.body.exchange) ? req.body.exchange : [];
            if (!exchange.length) throw new Error('Đổi hàng phải chọn sản phẩm giao cho khách.');
            const exchangedProducts = new Set();
            let exchangeValue = 0;
            for (const raw of exchange) {
                const maSP = clean(raw.MaSP, 20);
                const qty = Number(raw.SoLuong);
                if (!maSP || !Number.isInteger(qty) || qty <= 0) throw new Error('Dòng hàng giao đổi không hợp lệ.');
                if (exchangedProducts.has(maSP)) throw new Error(`Sản phẩm ${maSP} bị lặp trong danh sách hàng giao đổi.`);
                exchangedProducts.add(maSP);
                const stock = await new sql.Request(transaction).input('MaKho', sql.VarChar, ticket.MaKho)
                    .input('MaSP', sql.VarChar, maSP).query(`
                        SELECT sp.TenSP, sp.GiaBan, tk.SLTon, tk.DonGiaBinhQuan
                        FROM SanPham sp JOIN TonKho tk WITH(UPDLOCK,HOLDLOCK)
                          ON tk.MaSP=sp.MaSP AND tk.MaKho=@MaKho
                        WHERE sp.MaSP=@MaSP AND sp.TrangThai IN (N'Đang bán', N'Đang kinh doanh')`);
                if (!stock.recordset.length) throw new Error(`Sản phẩm ${maSP} không còn kinh doanh.`);
                if (Number(stock.recordset[0].SLTon) < qty) throw new Error(`${stock.recordset[0].TenSP} không đủ tồn để giao đổi.`);
                const price = Number(stock.recordset[0].GiaBan);
                const cost = Number(stock.recordset[0].DonGiaBinhQuan || 0);
                exchangeValue = roundMoney(exchangeValue + price * qty);
                preparedExchange.push({ maSP, qty, price, cost });
            }
            const returnedValue = roundMoney(returned.recordset.reduce((sum, line) => sum + Number(line.ThanhTien || 0), 0));
            if (!isEqualValueExchange(returnedValue, exchangeValue)) {
                throw new Error(`Đổi trực tiếp chỉ áp dụng hàng ngang giá (${returnedValue.toLocaleString('vi-VN')} đ). Nếu khác giá, hãy hoàn hàng cũ và lập hóa đơn bán mới.`);
            }
        } else {
            throw new Error('Hình thức xử lý đổi trả không hợp lệ.');
        }
        if (restock) {
            for (let index = 0; index < returned.recordset.length; index += 1) {
                const line = returned.recordset[index];
                await new sql.Request(transaction).input('MaKho', sql.VarChar, ticket.MaKho)
                    .input('MaSP', sql.VarChar, line.MaSP).input('SoLuong', sql.Int, line.SoLuong)
                    .input('DonGiaVon', sql.Decimal(18, 2), line.DonGiaVon).query(`
                        UPDATE TonKho SET SLTon=SLTon+@SoLuong,
                            GiaTriTon=(SLTon+@SoLuong)*CASE WHEN SLTon+@SoLuong=0 THEN 0
                                ELSE ((SLTon*DonGiaBinhQuan)+(@SoLuong*@DonGiaVon))/(SLTon+@SoLuong) END,
                            DonGiaBinhQuan=CASE WHEN SLTon+@SoLuong=0 THEN 0
                                ELSE ((SLTon*DonGiaBinhQuan)+(@SoLuong*@DonGiaVon))/(SLTon+@SoLuong) END,
                            NgayCapNhat=GETDATE()
                        WHERE MaKho=@MaKho AND MaSP=@MaSP`);
                const maGD = await generateId(transaction, 'GiaoDichKho', 'MaGD', `GD${new Date().toISOString().slice(2, 10).replaceAll('-', '')}`);
                await new sql.Request(transaction).input('MaGD', sql.VarChar, maGD)
                    .input('MaKho', sql.VarChar, ticket.MaKho).input('MaSP', sql.VarChar, line.MaSP)
                    .input('MaNV', sql.VarChar, req.user.MaNV).input('SoLuong', sql.Int, line.SoLuong)
                    .input('DonGiaVon', sql.Decimal(18, 2), line.DonGiaVon)
                    .input('ThanhTienVon', sql.Decimal(18, 2), line.ThanhTienVon)
                    .input('MaDT', sql.VarChar, maDT).query(`
                        INSERT GiaoDichKho(MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                        VALUES(@MaGD,@MaKho,@MaSP,@MaNV,N'Nhập',@SoLuong,@DonGiaVon,@ThanhTienVon,N'DoiTra',@MaDT,GETDATE(),N'Nhập lại hàng khách trả đạt yêu cầu')`);
            }
        }
        if (ticket.HinhThucXuLy === 'Hoàn tiền') {
            await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT)
                .input('PhuongThuc', sql.NVarChar, refund.method).input('MaGD', sql.VarChar, refund.code)
                .input('MaCa', sql.VarChar, maCaHoan).query(`
                    UPDATE PhieuDoiTra SET PhuongThucHoan=@PhuongThuc, MaGiaoDichHoan=@MaGD,
                        NgayHoan=GETDATE(), MaCaHoan=@MaCa
                    WHERE MaDT=@MaDT`);
        } else {
            for (const { maSP, qty, price, cost } of preparedExchange) {
                await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).input('MaSP', sql.VarChar, maSP)
                    .input('SoLuong', sql.Int, qty).input('DonGia', sql.Decimal(18, 2), price)
                    .input('ThanhTien', sql.Decimal(18, 2), price * qty)
                    .input('DonGiaVon', sql.Decimal(18, 2), cost)
                    .input('ThanhTienVon', sql.Decimal(18, 2), cost * qty).query(`
                        INSERT ChiTietDoiTra(MaDT,MaSP,LoaiDong,SoLuong,DonGia,ThanhTien,DonGiaVon,ThanhTienVon,LyDo)
                        VALUES(@MaDT,@MaSP,N'Hàng giao đổi',@SoLuong,@DonGia,@ThanhTien,@DonGiaVon,@ThanhTienVon,N'Giao đổi cho khách')`);
                await new sql.Request(transaction).input('MaKho', sql.VarChar, ticket.MaKho)
                    .input('MaSP', sql.VarChar, maSP).input('SoLuong', sql.Int, qty).query(`
                        UPDATE TonKho SET SLTon=SLTon-@SoLuong, GiaTriTon=(SLTon-@SoLuong)*DonGiaBinhQuan, NgayCapNhat=GETDATE()
                        WHERE MaKho=@MaKho AND MaSP=@MaSP AND SLTon>=@SoLuong`);
                const maGD = await generateId(transaction, 'GiaoDichKho', 'MaGD', `GD${new Date().toISOString().slice(2, 10).replaceAll('-', '')}`);
                await new sql.Request(transaction).input('MaGD', sql.VarChar, maGD)
                    .input('MaKho', sql.VarChar, ticket.MaKho).input('MaSP', sql.VarChar, maSP)
                    .input('MaNV', sql.VarChar, req.user.MaNV).input('SoLuong', sql.Int, -qty)
                    .input('DonGiaVon', sql.Decimal(18, 2), cost)
                    .input('ThanhTienVon', sql.Decimal(18, 2), cost * qty)
                    .input('MaDT', sql.VarChar, maDT).query(`
                        INSERT GiaoDichKho(MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                        VALUES(@MaGD,@MaKho,@MaSP,@MaNV,N'Xuất',@SoLuong,@DonGiaVon,@ThanhTienVon,N'DoiTra',@MaDT,GETDATE(),N'Xuất hàng giao đổi cho khách')`);
            }
        }
        await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT)
            .input('MaCa', sql.VarChar, maCaHoan).query(`
                UPDATE PhieuDoiTra SET TrangThai=N'Hoàn thành',
                    NgayHoan=COALESCE(NgayHoan, GETDATE()), MaCaHoan=COALESCE(MaCaHoan, @MaCa)
                WHERE MaDT=@MaDT`);
        await writeAudit(new sql.Request(transaction), req.user, 'Hoàn thành đổi trả', maDT, ticket.HinhThucXuLy);
        await transaction.commit();
        res.json({ message: `Đã hoàn thành phiếu đổi trả ${maDT}.`, MaDT: maDT, MaCaHoan: maCaHoan });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    searchInvoices, listRecentInvoices, getInvoiceForReturn, listReturns, getReturn,
    createReturn, submitReturn, inspectReturn, decideReturn, completeReturn
};
