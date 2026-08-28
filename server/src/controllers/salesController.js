const { sql, poolPromise } = require('../config/db');

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const POINT_EARN_UNIT = Math.max(1, Number(process.env.POINT_EARN_UNIT || 10000));
const POINT_VALUE_VND = Math.max(0, Number(process.env.POINT_VALUE_VND || 1000));

const generateId = async (transaction, table, column, prefix) => {
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 ${column} Id FROM ${table} WITH (UPDLOCK,HOLDLOCK)
                WHERE ${column} LIKE @Prefix ORDER BY ${column} DESC`);
    const last = result.recordset[0]?.Id;
    return `${prefix}${String(last ? Number(last.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
};

const getActiveShift = async (request, maNV, lock = false) => {
    const result = await request.input('MaNV', sql.VarChar, maNV).query(`
        SELECT TOP 1 ca.MaCa,ca.MaNV,ca.MaQuay,ca.ThoiGianBatDau
        FROM CaLamViec ca ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''}
        WHERE ca.MaNV=@MaNV AND ca.TrangThai=N'Đang mở' AND ca.ThoiGianKetThuc IS NULL`);
    if (!result.recordset.length) throw new Error('Bạn phải mở ca bán hàng trước khi sử dụng POS.');
    return result.recordset[0];
};

const getCatalog = async (req, res) => {
    try {
        const search = clean(req.query.search, 100);
        const pool = await poolPromise;
        const [products, promotions] = await Promise.all([
            pool.request().input('Search', sql.NVarChar, `%${search}%`).query(`
                SELECT sp.MaSP,sp.TenSP,sp.MaVach,sp.DonViTinh,sp.GiaBan,sp.TrangThai,
                       tk.MaKho,tk.SLTon,tk.DonGiaBinhQuan
                FROM SanPham sp
                JOIN TonKho tk ON tk.MaSP=sp.MaSP
                JOIN Kho k ON k.MaKho=tk.MaKho AND k.TrangThai=1
                WHERE sp.TrangThai IN (N'Đang bán',N'Đang kinh doanh')
                  AND (@Search=N'%%' OR sp.MaSP LIKE @Search OR sp.MaVach LIKE @Search OR sp.TenSP LIKE @Search)
                ORDER BY sp.TenSP`),
            pool.request().query(`
                SELECT MaKM,TenKM,LoaiKM,GiaTri,NgayBatDau,NgayKetThuc
                FROM KhuyenMai
                WHERE TrangThai=N'Hiệu lực' AND CONVERT(date,GETDATE()) BETWEEN NgayBatDau AND NgayKetThuc
                ORDER BY TenKM`)
        ]);
        res.json({ products: products.recordset, promotions: promotions.recordset, pointValue: POINT_VALUE_VND });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh mục bán hàng.' });
    }
};

const listCustomers = async (req, res) => {
    try {
        const search = clean(req.query.search, 100);
        const pool = await poolPromise;
        const result = await pool.request().input('Search', sql.NVarChar, `%${search}%`).query(`
            SELECT TOP 50 MaKH,TenKH,SDT,Email,DiaChi,NgaySinh,DiemTichLuy,HangThanhVien
            FROM KhachHang
            WHERE @Search=N'%%' OR MaKH LIKE @Search OR TenKH LIKE @Search OR SDT LIKE @Search
            ORDER BY TenKH`);
        res.json({ items: result.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải khách hàng.' });
    }
};

const saveCustomer = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const tenKH = clean(req.body.TenKH, 100);
        const sdt = clean(req.body.SDT, 15) || null;
        if (!tenKH) throw new Error('Tên khách hàng là bắt buộc.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const prefix = `KH${new Date().getFullYear()}`;
        const maKH = await generateId(transaction, 'KhachHang', 'MaKH', prefix);
        await new sql.Request(transaction).input('MaKH', sql.VarChar, maKH)
            .input('TenKH', sql.NVarChar, tenKH).input('SDT', sql.VarChar, sdt)
            .input('Email', sql.VarChar, clean(req.body.Email, 150) || null)
            .input('DiaChi', sql.NVarChar, clean(req.body.DiaChi, 300) || null)
            .input('NgaySinh', sql.Date, req.body.NgaySinh || null).query(`
                INSERT KhachHang(MaKH,TenKH,SDT,Email,DiaChi,NgaySinh,DiemTichLuy,HangThanhVien,NgayTao)
                VALUES(@MaKH,@TenKH,@SDT,@Email,@DiaChi,@NgaySinh,0,N'Thường',GETDATE())`);
        await transaction.commit();
        res.status(201).json({ message: 'Đã tạo khách hàng thành viên.', MaKH: maKH });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message.includes('UQ') || error.message.includes('UNIQUE')
            ? 'Số điện thoại đã thuộc khách hàng khác.' : error.message });
    }
};

const updateCustomer = async (req, res) => {
    try {
        const maKH = clean(req.params.id, 20);
        const tenKH = clean(req.body.TenKH, 100);
        if (!tenKH) throw new Error('Tên khách hàng là bắt buộc.');
        const pool = await poolPromise;
        const result = await pool.request().input('MaKH', sql.VarChar, maKH)
            .input('TenKH', sql.NVarChar, tenKH)
            .input('SDT', sql.VarChar, clean(req.body.SDT, 15) || null)
            .input('Email', sql.VarChar, clean(req.body.Email, 150) || null)
            .input('DiaChi', sql.NVarChar, clean(req.body.DiaChi, 300) || null)
            .input('NgaySinh', sql.Date, req.body.NgaySinh || null).query(`
                UPDATE KhachHang SET TenKH=@TenKH,SDT=@SDT,Email=@Email,DiaChi=@DiaChi,NgaySinh=@NgaySinh
                WHERE MaKH=@MaKH;
                SELECT @@ROWCOUNT affected;`);
        if (!result.recordset[0].affected) return res.status(404).json({ message: 'Không tìm thấy khách hàng.' });
        res.json({ message: 'Đã cập nhật hồ sơ khách hàng. Điểm tích lũy không bị thay đổi.' });
    } catch (error) {
        res.status(400).json({ message: error.message.includes('UQ') || error.message.includes('UNIQUE')
            ? 'Số điện thoại đã thuộc khách hàng khác.' : error.message });
    }
};

const listInvoices = async (req, res) => {
    try {
        const search = clean(req.query.search, 100);
        const status = clean(req.query.status, 30);
        const pool = await poolPromise;
        const result = await pool.request()
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('Search', sql.NVarChar, `%${search}%`)
            .input('TrangThai', sql.NVarChar, status).query(`
            SELECT TOP 80 hd.MaHD,hd.NgayLap,hd.TongTienHang,hd.TienGiamGia,hd.TienDiemQuyDoi,
                   hd.TongThanhToan,hd.TrangThai,hd.MaKH,kh.TenKH,kh.SDT,ca.MaCa
            FROM HoaDon hd
            JOIN CaLamViec ca ON ca.MaCa=hd.MaCa
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            WHERE hd.MaNV=@MaNV
              AND (@TrangThai=N'' OR hd.TrangThai=@TrangThai)
              AND (@Search=N'%%' OR hd.MaHD LIKE @Search OR kh.TenKH LIKE @Search OR kh.SDT LIKE @Search)
            ORDER BY hd.NgayLap DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải danh sách hóa đơn.' });
    }
};

const quoteInvoice = async (req, res) => {
    try {
        const pool = await poolPromise;
        await getActiveShift(pool.request(), req.user.MaNV);
        const calc = await calculateInvoice(
            pool,
            req.body.lines,
            clean(req.body.MaKM, 20) || null,
            req.body.DiemSuDung,
            clean(req.body.MaKH, 20) || null
        );
        res.json({
            TongTienHang: calc.TongTienHang,
            TienGiamGia: calc.TienGiamGia,
            DiemSuDung: calc.DiemSuDung,
            TienDiemQuyDoi: calc.TienDiemQuyDoi,
            TongThanhToan: calc.TongThanhToan,
            lines: calc.lines
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const queryFrom = (source) => (source.request ? source.request() : new sql.Request(source));

const calculateInvoice = async (source, lines, maKM, diemSuDung, maKH) => {
    if (!Array.isArray(lines) || !lines.length) throw new Error('Hóa đơn phải có ít nhất một sản phẩm.');
    const normalized = [];
    const seen = new Set();
    for (const raw of lines) {
        const maSP = clean(raw.MaSP, 20);
        const soLuong = Number(raw.SoLuong);
        if (!maSP || !Number.isFinite(soLuong) || soLuong <= 0 || !Number.isInteger(soLuong)) {
            throw new Error('Dòng hàng không hợp lệ.');
        }
        if (seen.has(maSP)) throw new Error(`Sản phẩm ${maSP} bị lặp.`);
        seen.add(maSP);
        const product = await queryFrom(source).input(`SP${normalized.length}`, sql.VarChar, maSP).query(`
            SELECT sp.MaSP,sp.TenSP,sp.DonViTinh,sp.GiaBan,tk.MaKho,tk.SLTon
            FROM SanPham sp JOIN TonKho tk ON tk.MaSP=sp.MaSP
            JOIN Kho k ON k.MaKho=tk.MaKho AND k.TrangThai=1
            WHERE sp.MaSP=@SP${normalized.length} AND sp.TrangThai IN (N'Đang bán',N'Đang kinh doanh')`);
        if (!product.recordset.length) throw new Error(`Sản phẩm ${maSP} không còn kinh doanh.`);
        const item = product.recordset[0];
        if (soLuong > Number(item.SLTon)) throw new Error(`${item.TenSP} chỉ còn ${item.SLTon} ${item.DonViTinh || ''}.`);
        normalized.push({ ...item, SoLuong: soLuong, DonGia: Number(item.GiaBan), GiamGia: 0,
            ThanhTien: Number(item.GiaBan) * soLuong });
    }
    const tongTienHang = normalized.reduce((sum, item) => sum + item.ThanhTien, 0);
    let tienGiamGia = 0;
    if (maKM) {
        const promotion = await queryFrom(source).input('MaKMCalc', sql.VarChar, maKM).query(`
            SELECT LoaiKM,GiaTri FROM KhuyenMai
            WHERE MaKM=@MaKMCalc AND TrangThai=N'Hiệu lực'
              AND CONVERT(date,GETDATE()) BETWEEN NgayBatDau AND NgayKetThuc`);
        if (!promotion.recordset.length) throw new Error('Khuyến mãi không còn hiệu lực.');
        const promo = promotion.recordset[0];
        tienGiamGia = /%|phần trăm/i.test(String(promo.LoaiKM))
            ? tongTienHang * Math.min(100, Number(promo.GiaTri)) / 100
            : Math.min(tongTienHang, Number(promo.GiaTri));
    }
    let diem = Number(diemSuDung || 0);
    if (!Number.isFinite(diem) || diem < 0 || !Number.isInteger(diem)) throw new Error('Điểm sử dụng không hợp lệ.');
    if (diem > 0) {
        if (!maKH) throw new Error('Chỉ khách hàng thành viên mới được sử dụng điểm.');
        const customer = await queryFrom(source).input('MaKHCalc', sql.VarChar, maKH)
            .query('SELECT DiemTichLuy FROM KhachHang WHERE MaKH=@MaKHCalc');
        if (!customer.recordset.length || diem > Number(customer.recordset[0].DiemTichLuy)) {
            throw new Error('Điểm tích lũy không đủ.');
        }
    }
    const tienDiem = Math.min(tongTienHang - tienGiamGia, diem * POINT_VALUE_VND);
    if (POINT_VALUE_VND === 0) diem = 0;
    return {
        lines: normalized,
        MaKho: normalized[0].MaKho,
        TongTienHang: tongTienHang,
        TienGiamGia: Math.round(tienGiamGia),
        DiemSuDung: diem,
        TienDiemQuyDoi: tienDiem,
        TongThanhToan: Math.max(0, Math.round(tongTienHang - tienGiamGia - tienDiem))
    };
};

const createInvoice = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const shift = await getActiveShift(new sql.Request(transaction), req.user.MaNV, true);
        const maKH = clean(req.body.MaKH, 20) || null;
        const maKM = clean(req.body.MaKM, 20) || null;
        const calc = await calculateInvoice(transaction, req.body.lines, maKM, req.body.DiemSuDung, maKH);
        const now = new Date();
        const prefix = `HD${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const maHD = await generateId(transaction, 'HoaDon', 'MaHD', prefix);
        await new sql.Request(transaction).input('MaHD', sql.VarChar, maHD)
            .input('MaKH', sql.VarChar, maKH).input('MaNV', sql.VarChar, req.user.MaNV)
            .input('MaKho', sql.VarChar, calc.MaKho).input('MaCa', sql.VarChar, shift.MaCa)
            .input('MaKM', sql.VarChar, maKM).input('TongTienHang', sql.Decimal(18, 2), calc.TongTienHang)
            .input('TienGiamGia', sql.Decimal(18, 2), calc.TienGiamGia).input('DiemSuDung', sql.Int, calc.DiemSuDung)
            .input('TienDiem', sql.Decimal(18, 2), calc.TienDiemQuyDoi)
            .input('TongThanhToan', sql.Decimal(18, 2), calc.TongThanhToan).query(`
                INSERT HoaDon(MaHD,MaKH,MaNV,MaKho,MaCa,MaKM,NgayLap,TongTienHang,TienGiamGia,
                    DiemSuDung,TienDiemQuyDoi,TongThanhToan,TrangThai,DiemCong)
                VALUES(@MaHD,@MaKH,@MaNV,@MaKho,@MaCa,@MaKM,GETDATE(),@TongTienHang,@TienGiamGia,
                    @DiemSuDung,@TienDiem,@TongThanhToan,N'Nháp',0)`);
        for (const line of calc.lines) {
            await new sql.Request(transaction).input('MaHD', sql.VarChar, maHD)
                .input('MaSP', sql.VarChar, line.MaSP).input('SoLuong', sql.Int, line.SoLuong)
                .input('DonGia', sql.Decimal(18, 2), line.DonGia).input('GiamGia', sql.Decimal(18, 2), line.GiamGia)
                .input('ThanhTien', sql.Decimal(18, 2), line.ThanhTien).query(`
                    INSERT ChiTietHoaDon(MaHD,MaSP,SoLuong,DonGia,GiamGia,ThanhTien,DonGiaVon,ThanhTienVon)
                    VALUES(@MaHD,@MaSP,@SoLuong,@DonGia,@GiamGia,@ThanhTien,0,0)`);
        }
        await transaction.commit();
        res.status(201).json({ message: `Đã lưu hóa đơn nháp ${maHD}.`, MaHD: maHD, ...calc });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

const getInvoice = async (req, res) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request().input('MaHD', sql.VarChar, clean(req.params.id, 20))
            .input('MaNV', sql.VarChar, req.user.MaNV).query(`
            SELECT hd.*,kh.TenKH,kh.SDT,nv.TenNV,ca.MaQuay
            FROM HoaDon hd JOIN NhanVien nv ON nv.MaNV=hd.MaNV
            JOIN CaLamViec ca ON ca.MaCa=hd.MaCa
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            WHERE hd.MaHD=@MaHD AND hd.MaNV=@MaNV`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy hóa đơn.' });
        const [lines, payments] = await Promise.all([
            pool.request().input('MaHD', sql.VarChar, req.params.id).query(`
                SELECT ct.*,sp.TenSP,sp.DonViTinh,sp.MaVach FROM ChiTietHoaDon ct
                JOIN SanPham sp ON sp.MaSP=ct.MaSP WHERE ct.MaHD=@MaHD ORDER BY sp.TenSP`),
            pool.request().input('MaHD', sql.VarChar, req.params.id).query(`
                SELECT * FROM ThanhToan WHERE MaHD=@MaHD ORDER BY NgayTT`)
        ]);
        res.json({ invoice: header.recordset[0], lines: lines.recordset, payments: payments.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải hóa đơn.' });
    }
};

const cancelInvoice = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('MaHD', sql.VarChar, clean(req.params.id, 20))
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('LyDo', sql.NVarChar, clean(req.body.LyDo, 300) || null).query(`
                UPDATE HoaDon SET TrangThai=N'Đã hủy',GhiChu=@LyDo
                WHERE MaHD=@MaHD AND MaNV=@MaNV AND TrangThai=N'Nháp'
                  AND NOT EXISTS(SELECT 1 FROM ThanhToan WHERE MaHD=@MaHD AND TrangThai=N'Thành công');
                SELECT @@ROWCOUNT affected;`);
        if (!result.recordset[0].affected) return res.status(400).json({ message: 'Không thể hủy hóa đơn đã thanh toán hoặc không còn ở trạng thái Nháp.' });
        res.json({ message: 'Đã hủy hóa đơn nháp.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const addPayment = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const method = clean(req.body.PhuongThuc, 30);
        const amount = Number(req.body.SoTien);
        const status = clean(req.body.TrangThai, 20) || 'Thành công';
        const transactionCode = clean(req.body.MaGiaoDich, 50) || null;
        if (!['Tiền mặt', 'QR', 'Thẻ', 'Chuyển khoản'].includes(method)) throw new Error('Phương thức thanh toán không hợp lệ.');
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền thanh toán phải lớn hơn 0.');
        if (!['Thành công', 'Thất bại'].includes(status)) throw new Error('Trạng thái thanh toán không hợp lệ.');
        if (method !== 'Tiền mặt' && status === 'Thành công' && !transactionCode) throw new Error('Thanh toán điện tử thành công phải có mã giao dịch.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const invoice = await new sql.Request(transaction).input('MaHD', sql.VarChar, clean(req.params.id, 20))
            .input('MaNV', sql.VarChar, req.user.MaNV).query(`
                SELECT hd.MaHD,hd.TongThanhToan FROM HoaDon hd WITH(UPDLOCK,HOLDLOCK)
                JOIN CaLamViec ca ON ca.MaCa=hd.MaCa
                WHERE hd.MaHD=@MaHD AND hd.MaNV=@MaNV AND hd.TrangThai=N'Nháp' AND ca.TrangThai=N'Đang mở'`);
        if (!invoice.recordset.length) throw new Error('Hóa đơn không còn khả dụng để thanh toán.');
        const paid = await new sql.Request(transaction).input('MaHD', sql.VarChar, req.params.id).query(`
            SELECT COALESCE(SUM(SoTien),0) DaThanhToan FROM ThanhToan WITH(UPDLOCK,HOLDLOCK)
            WHERE MaHD=@MaHD AND TrangThai=N'Thành công'`);
        if (status === 'Thành công' && Number(paid.recordset[0].DaThanhToan) + amount > Number(invoice.recordset[0].TongThanhToan)) {
            throw new Error('Tổng thanh toán thành công không được vượt số tiền hóa đơn.');
        }
        const prefix = `TT${new Date().toISOString().slice(2, 10).replaceAll('-', '')}`;
        const maTT = await generateId(transaction, 'ThanhToan', 'MaTT', prefix);
        await new sql.Request(transaction).input('MaTT', sql.VarChar, maTT)
            .input('MaHD', sql.VarChar, req.params.id).input('PhuongThuc', sql.NVarChar, method)
            .input('MaGiaoDich', sql.VarChar, transactionCode).input('SoTien', sql.Decimal(18, 2), amount)
            .input('TrangThai', sql.NVarChar, status).query(`
                INSERT ThanhToan(MaTT,MaHD,PhuongThuc,MaGiaoDich,SoTien,NgayTT,TrangThai,NgayXacNhan)
                VALUES(@MaTT,@MaHD,@PhuongThuc,@MaGiaoDich,@SoTien,GETDATE(),@TrangThai,
                    CASE WHEN @TrangThai IN(N'Thành công',N'Thất bại') THEN GETDATE() END)`);
        await transaction.commit();
        res.status(201).json({ message: `Đã ghi nhận thanh toán ${status.toLowerCase()}.`, MaTT: maTT });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message.includes('UX_ThanhToan_MaGiaoDich')
            ? 'Mã giao dịch điện tử đã được sử dụng.' : error.message });
    }
};

const completeInvoice = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const invoiceResult = await new sql.Request(transaction).input('MaHD', sql.VarChar, clean(req.params.id, 20))
            .input('MaNV', sql.VarChar, req.user.MaNV).query(`
                SELECT hd.* FROM HoaDon hd WITH(UPDLOCK,HOLDLOCK)
                JOIN CaLamViec ca WITH(UPDLOCK,HOLDLOCK) ON ca.MaCa=hd.MaCa
                WHERE hd.MaHD=@MaHD AND hd.MaNV=@MaNV AND ca.TrangThai=N'Đang mở'`);
        if (!invoiceResult.recordset.length) throw new Error('Hóa đơn không thuộc ca đang mở của bạn.');
        const invoice = invoiceResult.recordset[0];
        if (invoice.TrangThai === 'Hoàn thành') {
            await transaction.rollback();
            return res.json({ message: 'Hóa đơn đã hoàn thành trước đó.', MaHD: invoice.MaHD, alreadyCompleted: true });
        }
        if (invoice.TrangThai !== 'Nháp') throw new Error('Chỉ hóa đơn Nháp mới được hoàn thành.');
        const payments = await new sql.Request(transaction).input('MaHD', sql.VarChar, invoice.MaHD).query(`
            SELECT COALESCE(SUM(CASE WHEN TrangThai=N'Thành công' THEN SoTien ELSE 0 END),0) DaThanhToan,
                   SUM(CASE WHEN TrangThai=N'Chờ xác nhận' THEN 1 ELSE 0 END) DangCho
            FROM ThanhToan WITH(UPDLOCK,HOLDLOCK) WHERE MaHD=@MaHD`);
        if (Number(payments.recordset[0].DangCho || 0) > 0) throw new Error('Hóa đơn còn thanh toán chờ xác nhận.');
        if (Math.round(Number(payments.recordset[0].DaThanhToan)) !== Math.round(Number(invoice.TongThanhToan))) {
            throw new Error(`Khách phải thanh toán đủ ${Number(invoice.TongThanhToan).toLocaleString('vi-VN')} đồng.`);
        }
        const lines = await new sql.Request(transaction).input('MaHD', sql.VarChar, invoice.MaHD)
            .input('MaKho', sql.VarChar, invoice.MaKho).query(`
            SELECT ct.MaSP,ct.SoLuong,tk.SLTon,tk.DonGiaBinhQuan,tk.MaKho,sp.TenSP
            FROM ChiTietHoaDon ct
            JOIN SanPham sp ON sp.MaSP=ct.MaSP
            JOIN TonKho tk WITH(UPDLOCK,HOLDLOCK) ON tk.MaSP=ct.MaSP AND tk.MaKho=@MaKho
            WHERE ct.MaHD=@MaHD ORDER BY ct.MaSP`);
        if (!lines.recordset.length) throw new Error('Hóa đơn không có dòng hàng.');
        for (let index = 0; index < lines.recordset.length; index += 1) {
            const line = lines.recordset[index];
            if (Number(line.SLTon) < Number(line.SoLuong)) throw new Error(`${line.TenSP} không đủ tồn để hoàn thành.`);
            const cost = Number(line.DonGiaBinhQuan || 0);
            await new sql.Request(transaction).input('MaHD', sql.VarChar, invoice.MaHD)
                .input('MaSP', sql.VarChar, line.MaSP).input('DonGiaVon', sql.Decimal(18, 2), cost)
                .input('ThanhTienVon', sql.Decimal(18, 2), cost * Number(line.SoLuong)).query(`
                    UPDATE ChiTietHoaDon SET DonGiaVon=@DonGiaVon,ThanhTienVon=@ThanhTienVon
                    WHERE MaHD=@MaHD AND MaSP=@MaSP`);
            await new sql.Request(transaction).input('MaKho', sql.VarChar, invoice.MaKho)
                .input('MaSP', sql.VarChar, line.MaSP).input('SoLuong', sql.Int, line.SoLuong)
                .query(`UPDATE TonKho SET SLTon=SLTon-@SoLuong,GiaTriTon=(SLTon-@SoLuong)*DonGiaBinhQuan,NgayCapNhat=GETDATE()
                        WHERE MaKho=@MaKho AND MaSP=@MaSP AND SLTon>=@SoLuong`);
            const maGD = `GD${Date.now()}${String(index).padStart(2, '0')}`.slice(0, 20);
            await new sql.Request(transaction).input('MaGD', sql.VarChar, maGD)
                .input('MaKho', sql.VarChar, invoice.MaKho).input('MaSP', sql.VarChar, line.MaSP)
                .input('MaNV', sql.VarChar, req.user.MaNV).input('SoLuong', sql.Int, -Number(line.SoLuong))
                .input('DonGiaVon', sql.Decimal(18, 2), cost)
                .input('ThanhTienVon', sql.Decimal(18, 2), cost * Number(line.SoLuong))
                .input('MaHD', sql.VarChar, invoice.MaHD).query(`
                    INSERT GiaoDichKho(MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                    VALUES(@MaGD,@MaKho,@MaSP,@MaNV,N'Xuất',@SoLuong,@DonGiaVon,@ThanhTienVon,N'HoaDon',@MaHD,GETDATE(),N'Xuất bán tại quầy')`);
        }
        const diemCong = invoice.MaKH ? Math.floor(Number(invoice.TongThanhToan) / POINT_EARN_UNIT) : 0;
        await new sql.Request(transaction).input('MaHD', sql.VarChar, invoice.MaHD).input('DiemCong', sql.Int, diemCong)
            .query(`UPDATE HoaDon SET TrangThai=N'Hoàn thành',DiemCong=@DiemCong WHERE MaHD=@MaHD`);
        if (invoice.MaKH) {
            await new sql.Request(transaction).input('MaKH', sql.VarChar, invoice.MaKH)
                .input('DiemSuDung', sql.Int, invoice.DiemSuDung).input('DiemCong', sql.Int, diemCong)
                .query(`UPDATE KhachHang SET
                            DiemTichLuy=DiemTichLuy-@DiemSuDung+@DiemCong,
                            HangThanhVien=CASE
                                WHEN DiemTichLuy-@DiemSuDung+@DiemCong>=500 THEN N'Vàng'
                                WHEN DiemTichLuy-@DiemSuDung+@DiemCong>=100 THEN N'Bạc'
                                ELSE N'Thường' END
                        WHERE MaKH=@MaKH`);
        }
        await new sql.Request(transaction).input('MaTK', sql.Int, req.user.MaTK)
            .input('MaHD', sql.VarChar, invoice.MaHD)
            .query(`INSERT NhatKy(MaTK,HanhDong,BangLienQuan,MaBanGhi,NoiDung,ThoiGian)
                    VALUES(@MaTK,N'Hoàn thành hóa đơn',N'HoaDon',@MaHD,N'Đã thanh toán đủ, xuất kho và ghi nhận doanh thu',GETDATE())`);
        await transaction.commit();
        res.json({ message: `Hóa đơn ${invoice.MaHD} đã hoàn thành.`, MaHD: invoice.MaHD, DiemCong: diemCong });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    getCatalog, listCustomers, saveCustomer, updateCustomer, listInvoices, quoteInvoice,
    createInvoice, getInvoice, cancelInvoice, addPayment, completeInvoice
};
