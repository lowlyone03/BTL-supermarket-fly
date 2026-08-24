const { sql, poolPromise } = require('../config/db');

const text = (value, max, fallback = null) => {
    const normalized = String(value ?? '').trim().slice(0, max);
    return normalized || fallback;
};

const number = (value, label, { integer = false, min = 0 } = {}) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || (integer && !Number.isInteger(parsed))) {
        throw new Error(`${label} không hợp lệ.`);
    }
    return parsed;
};

const writeAudit = async (request, user, action, tableName, recordId, content) => {
    await request
        .input('LogMaTK', sql.Int, user.MaTK)
        .input('LogHanhDong', sql.NVarChar, action)
        .input('LogBang', sql.NVarChar, tableName)
        .input('LogMaBanGhi', sql.VarChar, recordId)
        .input('LogNoiDung', sql.NVarChar, content)
        .query(`INSERT INTO NhatKy (MaTK,HanhDong,BangLienQuan,MaBanGhi,NoiDung,ThoiGian)
                VALUES (@LogMaTK,@LogHanhDong,@LogBang,@LogMaBanGhi,@LogNoiDung,GETDATE())`);
};

const getCategories = async (_req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT dm.MaDM, dm.TenDM, dm.MoTa, dm.TrangThai, COUNT(sp.MaSP) AS SoSanPham
            FROM DanhMuc dm
            LEFT JOIN SanPham sp ON sp.MaDM=dm.MaDM
            GROUP BY dm.MaDM,dm.TenDM,dm.MoTa,dm.TrangThai
            ORDER BY dm.TrangThai DESC,dm.TenDM`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh mục hàng hóa.' });
    }
};

const createCategory = async (req, res) => {
    try {
        const MaDM = text(req.body.MaDM, 20);
        const TenDM = text(req.body.TenDM, 100);
        if (!MaDM || !TenDM) throw new Error('Mã và tên danh mục là bắt buộc.');
        const pool = await poolPromise;
        await pool.request()
            .input('MaDM', sql.VarChar, MaDM)
            .input('TenDM', sql.NVarChar, TenDM)
            .input('MoTa', sql.NVarChar, text(req.body.MoTa, 255))
            .query(`INSERT INTO DanhMuc (MaDM,TenDM,MoTa,TrangThai)
                    VALUES (@MaDM,@TenDM,@MoTa,1)`);
        await writeAudit(pool.request(), req.user, 'Thêm danh mục hàng hóa', 'DanhMuc', MaDM, `Tạo danh mục ${TenDM}`);
        res.status(201).json({ message: 'Đã thêm danh mục hàng hóa.', MaDM });
    } catch (error) {
        console.error(error);
        const duplicate = error.number === 2627 || error.number === 2601;
        res.status(duplicate ? 409 : 400).json({ message: duplicate ? 'Mã hoặc tên danh mục đã tồn tại.' : error.message });
    }
};

const updateCategory = async (req, res) => {
    try {
        const TenDM = text(req.body.TenDM, 100);
        if (!TenDM) throw new Error('Tên danh mục là bắt buộc.');
        const pool = await poolPromise;
        const result = await pool.request()
            .input('MaDM', sql.VarChar, req.params.id)
            .input('TenDM', sql.NVarChar, TenDM)
            .input('MoTa', sql.NVarChar, text(req.body.MoTa, 255))
            .query(`UPDATE DanhMuc SET TenDM=@TenDM,MoTa=@MoTa
                    OUTPUT inserted.MaDM WHERE MaDM=@MaDM`);
        if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy danh mục.' });
        await writeAudit(pool.request(), req.user, 'Cập nhật danh mục hàng hóa', 'DanhMuc', req.params.id, `Cập nhật danh mục ${TenDM}`);
        res.json({ message: 'Đã cập nhật danh mục hàng hóa.' });
    } catch (error) {
        console.error(error);
        res.status(error.number === 2627 || error.number === 2601 ? 409 : 400).json({ message: error.message });
    }
};

const setCategoryStatus = async (req, res) => {
    try {
        const TrangThai = Number(req.body.TrangThai) === 1 ? 1 : 0;
        const pool = await poolPromise;
        if (!TrangThai) {
            const activeProducts = await pool.request().input('MaDM', sql.VarChar, req.params.id)
                .query(`SELECT COUNT(*) AS SoLuong FROM SanPham WHERE MaDM=@MaDM AND TrangThai=N'Đang bán'`);
            if (Number(activeProducts.recordset[0].SoLuong) > 0) {
                return res.status(409).json({ message: 'Hãy ngừng bán các sản phẩm thuộc danh mục trước.' });
            }
        }
        const result = await pool.request()
            .input('MaDM', sql.VarChar, req.params.id)
            .input('TrangThai', sql.TinyInt, TrangThai)
            .query('UPDATE DanhMuc SET TrangThai=@TrangThai OUTPUT inserted.MaDM WHERE MaDM=@MaDM');
        if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy danh mục.' });
        await writeAudit(pool.request(), req.user, TrangThai ? 'Kích hoạt danh mục' : 'Ngừng sử dụng danh mục', 'DanhMuc', req.params.id, TrangThai ? 'Cho phép sử dụng danh mục' : 'Ngừng sử dụng danh mục');
        res.json({ message: TrangThai ? 'Đã kích hoạt danh mục.' : 'Đã ngừng sử dụng danh mục.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể cập nhật trạng thái danh mục.' });
    }
};

const getProducts = async (req, res) => {
    try {
        const keyword = text(req.query.search, 150, '');
        const category = text(req.query.category, 20, '');
        const status = text(req.query.status, 30, '');
        const pool = await poolPromise;
        const result = await pool.request()
            .input('TuKhoa', sql.NVarChar, keyword)
            .input('Mau', sql.NVarChar, `%${keyword}%`)
            .input('MaDM', sql.VarChar, category)
            .input('TrangThai', sql.NVarChar, status)
            .query(`
                SELECT sp.MaSP,sp.MaDM,sp.TenSP,sp.DonViTinh,sp.MaVach,sp.GiaNhap,sp.GiaBan,
                       sp.TonKhoToiThieu,sp.TrangThai,dm.TenDM,
                       ISNULL(SUM(tk.SLTon),0) AS SLTon,ISNULL(SUM(tk.SLDatMua),0) AS SLDatMua,
                       CASE WHEN EXISTS (SELECT 1 FROM GiaoDichKho gd WHERE gd.MaSP=sp.MaSP AND gd.LoaiGD=N'Nhập')
                            THEN 0 ELSE 1 END AS ChuaNhapLanDau
                FROM SanPham sp
                JOIN DanhMuc dm ON dm.MaDM=sp.MaDM
                LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
                WHERE (@TuKhoa=N'' OR sp.MaSP LIKE @Mau OR sp.TenSP LIKE @Mau OR ISNULL(sp.MaVach,'') LIKE @Mau)
                  AND (@MaDM='' OR sp.MaDM=@MaDM)
                  AND (@TrangThai=N'' OR sp.TrangThai=@TrangThai)
                GROUP BY sp.MaSP,sp.MaDM,sp.TenSP,sp.DonViTinh,sp.MaVach,sp.GiaNhap,sp.GiaBan,
                         sp.TonKhoToiThieu,sp.TrangThai,dm.TenDM
                ORDER BY CASE WHEN sp.TrangThai=N'Đang bán' THEN 0 ELSE 1 END,dm.TenDM,sp.TenSP`);
        const items = result.recordset;
        res.json({
            items,
            summary: {
                total: items.length,
                active: items.filter(item => item.TrangThai === 'Đang bán').length,
                inactive: items.filter(item => item.TrangThai !== 'Đang bán').length,
                unopened: items.filter(item => Number(item.ChuaNhapLanDau) === 1).length
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh sách sản phẩm.' });
    }
};

const normalizeProduct = body => {
    const product = {
        MaSP: text(body.MaSP, 20),
        MaDM: text(body.MaDM, 20),
        TenSP: text(body.TenSP, 150),
        DonViTinh: text(body.DonViTinh, 30),
        MaVach: text(body.MaVach, 30),
        GiaNhap: number(body.GiaNhap, 'Giá nhập'),
        GiaBan: number(body.GiaBan, 'Giá bán'),
        TonKhoToiThieu: number(body.TonKhoToiThieu, 'Tồn kho tối thiểu', { integer: true }),
        TrangThai: body.TrangThai === 'Ngừng bán' ? 'Ngừng bán' : 'Đang bán'
    };
    if (!product.MaSP || !product.MaDM || !product.TenSP || !product.DonViTinh) {
        throw new Error('Mã, danh mục, tên sản phẩm và đơn vị tính là bắt buộc.');
    }
    return product;
};

const bindProduct = (request, product, includeCode = true) => {
    if (includeCode) request.input('MaSP', sql.VarChar, product.MaSP);
    return request
        .input('MaDM', sql.VarChar, product.MaDM)
        .input('TenSP', sql.NVarChar, product.TenSP)
        .input('DonViTinh', sql.NVarChar, product.DonViTinh)
        .input('MaVach', sql.VarChar, product.MaVach)
        .input('GiaNhap', sql.Decimal(18, 2), product.GiaNhap)
        .input('GiaBan', sql.Decimal(18, 2), product.GiaBan)
        .input('TonKhoToiThieu', sql.Int, product.TonKhoToiThieu)
        .input('TrangThai', sql.NVarChar, product.TrangThai);
};

const createProduct = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const product = normalizeProduct(req.body);
        await transaction.begin();
        await bindProduct(new sql.Request(transaction), product).query(`
            INSERT INTO SanPham (MaSP,MaDM,TenSP,DonViTinh,MaVach,GiaNhap,GiaBan,TonKhoToiThieu,TrangThai)
            VALUES (@MaSP,@MaDM,@TenSP,@DonViTinh,@MaVach,@GiaNhap,@GiaBan,@TonKhoToiThieu,@TrangThai)`);
        await new sql.Request(transaction).input('MaSP', sql.VarChar, product.MaSP).query(`
            INSERT INTO TonKho (MaKho,MaSP,SLTon,SLDatMua,DonGiaBinhQuan,GiaTriTon,NgayCapNhat)
            SELECT MaKho,@MaSP,0,0,0,0,GETDATE() FROM Kho WHERE TrangThai=1`);
        await writeAudit(new sql.Request(transaction), req.user, 'Thêm sản phẩm', 'SanPham', product.MaSP, `Tạo sản phẩm ${product.TenSP}`);
        await transaction.commit();
        res.status(201).json({ message: 'Đã thêm sản phẩm và khởi tạo tồn kho bằng 0.', MaSP: product.MaSP });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        console.error(error);
        const duplicate = error.number === 2627 || error.number === 2601;
        res.status(duplicate ? 409 : 400).json({ message: duplicate ? 'Mã sản phẩm hoặc mã vạch đã tồn tại.' : error.message });
    }
};

const updateProduct = async (req, res) => {
    try {
        const product = normalizeProduct({ ...req.body, MaSP: req.params.id });
        const pool = await poolPromise;
        const result = await bindProduct(pool.request(), product).query(`
            UPDATE SanPham SET MaDM=@MaDM,TenSP=@TenSP,DonViTinh=@DonViTinh,MaVach=@MaVach,
                   GiaNhap=@GiaNhap,GiaBan=@GiaBan,TonKhoToiThieu=@TonKhoToiThieu,TrangThai=@TrangThai
            OUTPUT inserted.MaSP WHERE MaSP=@MaSP`);
        if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
        await writeAudit(pool.request(), req.user, 'Cập nhật sản phẩm', 'SanPham', product.MaSP, `Cập nhật thông tin ${product.TenSP}`);
        res.json({ message: 'Đã cập nhật sản phẩm.' });
    } catch (error) {
        console.error(error);
        const duplicate = error.number === 2627 || error.number === 2601;
        res.status(duplicate ? 409 : 400).json({ message: duplicate ? 'Mã vạch đã được sử dụng cho sản phẩm khác.' : error.message });
    }
};

const setProductStatus = async (req, res) => {
    try {
        const status = req.body.TrangThai === 'Ngừng bán' ? 'Ngừng bán' : 'Đang bán';
        const pool = await poolPromise;
        const result = await pool.request()
            .input('MaSP', sql.VarChar, req.params.id)
            .input('TrangThai', sql.NVarChar, status)
            .query('UPDATE SanPham SET TrangThai=@TrangThai OUTPUT inserted.MaSP WHERE MaSP=@MaSP');
        if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
        await writeAudit(pool.request(), req.user, status === 'Đang bán' ? 'Kích hoạt sản phẩm' : 'Ngừng bán sản phẩm', 'SanPham', req.params.id, `Chuyển trạng thái sang ${status}`);
        res.json({ message: `Đã chuyển sản phẩm sang trạng thái ${status}.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể cập nhật trạng thái sản phẩm.' });
    }
};

module.exports = {
    getCategories, createCategory, updateCategory, setCategoryStatus,
    getProducts, createProduct, updateProduct, setProductStatus
};
