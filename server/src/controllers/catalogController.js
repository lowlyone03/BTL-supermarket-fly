const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const { storedPathFor, deleteUploadedProductImage } = require('../middlewares/productImageUpload');
const {
    validateRequiredCode, validateRequiredText, validateRequiredNonNegativeNumber,
    validateRequiredNonNegativeInteger, validateOptionalBarcode
} = require('../services/fieldValidators');

const text = (value, max, fallback = null) => {
    const normalized = String(value ?? '').trim().slice(0, max);
    return normalized || fallback;
};

const writeAudit = (request, user, action, tableName, recordId, content) =>
    logAudit(request, { user, action, table: tableName, recordId, content, uc: 'UC04' });

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
        const maDM = validateRequiredCode(req.body.MaDM, 'Mã danh mục');
        if (!maDM.ok) throw new Error(maDM.message);
        const tenDM = validateRequiredText(req.body.TenDM, 'Tên danh mục', { min: 2, max: 100 });
        if (!tenDM.ok) throw new Error(tenDM.message);
        const MaDM = maDM.value;
        const TenDM = tenDM.value;
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
        const tenDM = validateRequiredText(req.body.TenDM, 'Tên danh mục', { min: 2, max: 100 });
        if (!tenDM.ok) throw new Error(tenDM.message);
        const TenDM = tenDM.value;
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
                       sp.DuongDanAnh,
                       sp.TonKhoToiThieu,sp.TrangThai,dm.TenDM,
                       ISNULL(SUM(tk.SLTon),0) AS SLTon,ISNULL(SUM(tk.SLDatMua),0) AS SLDatMua,
                       CASE WHEN EXISTS (SELECT 1 FROM GiaoDichKho gd WHERE gd.MaSP=sp.MaSP AND gd.LoaiGD=N'Nhập')
                            THEN 0 ELSE 1 END AS ChuaNhapLanDau
                FROM SanPham sp
                JOIN DanhMuc dm ON dm.MaDM=sp.MaDM
                LEFT JOIN TonKho tk ON tk.MaSP=sp.MaSP
                WHERE (@TuKhoa=N'' OR sp.MaSP LIKE @Mau COLLATE Latin1_General_100_CI_AI OR sp.TenSP LIKE @Mau COLLATE Latin1_General_100_CI_AI OR ISNULL(sp.MaVach,'') LIKE @Mau COLLATE Latin1_General_100_CI_AI)
                  AND (@MaDM='' OR sp.MaDM=@MaDM)
                  AND (@TrangThai=N'' OR sp.TrangThai=@TrangThai)
                GROUP BY sp.MaSP,sp.MaDM,sp.TenSP,sp.DonViTinh,sp.MaVach,sp.GiaNhap,sp.GiaBan,sp.DuongDanAnh,
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
    const maSP = validateRequiredCode(body.MaSP, 'Mã sản phẩm');
    if (!maSP.ok) throw new Error(maSP.message);
    const maDM = validateRequiredCode(body.MaDM, 'Mã danh mục');
    if (!maDM.ok) throw new Error(maDM.message);
    const tenSP = validateRequiredText(body.TenSP, 'Tên sản phẩm', { min: 2, max: 150 });
    if (!tenSP.ok) throw new Error(tenSP.message);
    const donVi = validateRequiredText(body.DonViTinh, 'Đơn vị tính', { min: 1, max: 30 });
    if (!donVi.ok) throw new Error(donVi.message);
    const barcode = validateOptionalBarcode(body.MaVach);
    if (!barcode.ok) throw new Error(barcode.message);
    const giaNhap = validateRequiredNonNegativeNumber(body.GiaNhap, 'Giá nhập');
    if (!giaNhap.ok) throw new Error(giaNhap.message);
    const giaBan = validateRequiredNonNegativeNumber(body.GiaBan, 'Giá bán');
    if (!giaBan.ok) throw new Error(giaBan.message);
    const tonMin = validateRequiredNonNegativeInteger(body.TonKhoToiThieu, 'Tồn kho tối thiểu');
    if (!tonMin.ok) throw new Error(tonMin.message);
    return {
        MaSP: maSP.value,
        MaDM: maDM.value,
        TenSP: tenSP.value,
        DonViTinh: donVi.value,
        MaVach: barcode.value || null,
        GiaNhap: giaNhap.value,
        GiaBan: giaBan.value,
        TonKhoToiThieu: tonMin.value,
        DuongDanAnh: text(body.DuongDanAnh, 500),
        TrangThai: body.TrangThai === 'Ngừng bán' ? 'Ngừng bán' : 'Đang bán'
    };
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
        .input('DuongDanAnh', sql.NVarChar(500), product.DuongDanAnh)
        .input('TrangThai', sql.NVarChar, product.TrangThai);
};

const createProduct = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    const uploadedPath = storedPathFor(req.file);
    let transactionStarted = false;
    try {
        if (!uploadedPath) throw new Error('Ảnh sản phẩm là bắt buộc khi thêm sản phẩm mới.');
        const product = normalizeProduct({ ...req.body, DuongDanAnh: uploadedPath });
        await transaction.begin();
        transactionStarted = true;
        await bindProduct(new sql.Request(transaction), product).query(`
            INSERT INTO SanPham (MaSP,MaDM,TenSP,DonViTinh,MaVach,GiaNhap,GiaBan,TonKhoToiThieu,DuongDanAnh,TrangThai)
            VALUES (@MaSP,@MaDM,@TenSP,@DonViTinh,@MaVach,@GiaNhap,@GiaBan,@TonKhoToiThieu,@DuongDanAnh,@TrangThai)`);
        await new sql.Request(transaction).input('MaSP', sql.VarChar, product.MaSP).query(`
            INSERT INTO TonKho (MaKho,MaSP,SLTon,SLDatMua,DonGiaBinhQuan,GiaTriTon,NgayCapNhat)
            SELECT MaKho,@MaSP,0,0,0,0,GETDATE() FROM Kho WHERE TrangThai=1`);
        await writeAudit(new sql.Request(transaction), req.user, 'Thêm sản phẩm', 'SanPham', product.MaSP, `Tạo sản phẩm ${product.TenSP}`);
        await transaction.commit();
        res.status(201).json({ message: 'Đã thêm sản phẩm, lưu ảnh và khởi tạo tồn kho bằng 0.', MaSP: product.MaSP, DuongDanAnh: uploadedPath });
    } catch (error) {
        if (transactionStarted && transaction._aborted !== true) await transaction.rollback().catch(() => {});
        await deleteUploadedProductImage(uploadedPath);
        console.error(error);
        const duplicate = error.number === 2627 || error.number === 2601;
        res.status(duplicate ? 409 : 400).json({ message: duplicate ? 'Mã sản phẩm hoặc mã vạch đã tồn tại.' : error.message });
    }
};

const updateProduct = async (req, res) => {
    const uploadedPath = storedPathFor(req.file);
    try {
        const pool = await poolPromise;
        const existingResult = await pool.request()
            .input('MaSP', sql.VarChar, req.params.id)
            .query('SELECT MaSP,DuongDanAnh FROM SanPham WHERE MaSP=@MaSP');
        const existing = existingResult.recordset[0];
        if (!existing) {
            await deleteUploadedProductImage(uploadedPath);
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
        }
        const product = normalizeProduct({
            ...req.body,
            MaSP: req.params.id,
            DuongDanAnh: uploadedPath || existing.DuongDanAnh
        });
        const result = await bindProduct(pool.request(), product).query(`
            UPDATE SanPham SET MaDM=@MaDM,TenSP=@TenSP,DonViTinh=@DonViTinh,MaVach=@MaVach,
                   GiaNhap=@GiaNhap,GiaBan=@GiaBan,TonKhoToiThieu=@TonKhoToiThieu,
                   DuongDanAnh=@DuongDanAnh,TrangThai=@TrangThai
            OUTPUT inserted.MaSP WHERE MaSP=@MaSP`);
        if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
        await writeAudit(pool.request(), req.user, 'Cập nhật sản phẩm', 'SanPham', product.MaSP, `Cập nhật thông tin ${product.TenSP}`);
        if (uploadedPath && existing.DuongDanAnh !== uploadedPath) {
            await deleteUploadedProductImage(existing.DuongDanAnh);
        }
        res.json({ message: uploadedPath ? 'Đã cập nhật sản phẩm và thay ảnh mới.' : 'Đã cập nhật sản phẩm.' });
    } catch (error) {
        await deleteUploadedProductImage(uploadedPath);
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

const getPromotions = async (req, res) => {
    try {
        const search = text(req.query.search, 100, '');
        const pool = await poolPromise;
        const result = await pool.request().input('Search', sql.NVarChar, `%${search}%`).query(`
            SELECT MaKM,TenKM,LoaiKM,GiaTri,NgayBatDau,NgayKetThuc,TrangThai,
                   CASE WHEN TrangThai=N'Hiệu lực' AND CONVERT(date,GETDATE()) BETWEEN NgayBatDau AND NgayKetThuc
                        THEN 1 ELSE 0 END AS DangApDung
            FROM KhuyenMai
            WHERE @Search=N'%%' OR MaKM LIKE @Search COLLATE Latin1_General_100_CI_AI OR TenKM LIKE @Search COLLATE Latin1_General_100_CI_AI
            ORDER BY NgayBatDau DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải chương trình khuyến mãi.' });
    }
};

const savePromotion = async (req, res) => {
    try {
        const maKM = validateRequiredCode(req.params.id || req.body.MaKM, 'Mã khuyến mãi');
        if (!maKM.ok) throw new Error(maKM.message);
        const tenKM = validateRequiredText(req.body.TenKM, 'Tên chương trình khuyến mãi', { min: 2, max: 150 });
        if (!tenKM.ok) throw new Error(tenKM.message);
        const MaKM = maKM.value;
        const TenKM = tenKM.value;
        const LoaiKM = text(req.body.LoaiKM, 20);
        const giaTri = validateRequiredNonNegativeNumber(req.body.GiaTri, 'Giá trị khuyến mãi');
        if (!giaTri.ok) throw new Error(giaTri.message);
        const GiaTri = giaTri.value;
        const NgayBatDau = text(req.body.NgayBatDau, 10);
        const NgayKetThuc = text(req.body.NgayKetThuc, 10);
        const TrangThai = req.body.TrangThai === 'Ngừng' ? 'Ngừng' : 'Hiệu lực';
        if (!NgayBatDau || !NgayKetThuc) throw new Error('Mã, tên và thời hạn khuyến mãi là bắt buộc.');
        if (!['Phần trăm', 'Số tiền'].includes(LoaiKM)) throw new Error('Loại khuyến mãi chỉ nhận Phần trăm hoặc Số tiền.');
        if (LoaiKM === 'Phần trăm' && GiaTri > 100) throw new Error('Khuyến mãi phần trăm không vượt 100%.');
        if (NgayKetThuc < NgayBatDau) throw new Error('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
        const pool = await poolPromise;
        const exists = await pool.request().input('MaKM', sql.VarChar, MaKM)
            .query('SELECT MaKM FROM KhuyenMai WHERE MaKM=@MaKM');
        const isUpdate = Boolean(req.params.id);
        if (isUpdate && !exists.recordset.length) return res.status(404).json({ message: 'Không tìm thấy chương trình khuyến mãi.' });
        if (!isUpdate && exists.recordset.length) throw new Error('Mã khuyến mãi đã tồn tại.');
        await pool.request()
            .input('MaKM', sql.VarChar, MaKM).input('TenKM', sql.NVarChar, TenKM)
            .input('LoaiKM', sql.NVarChar, LoaiKM).input('GiaTri', sql.Decimal(18, 2), GiaTri)
            .input('NgayBatDau', sql.Date, NgayBatDau).input('NgayKetThuc', sql.Date, NgayKetThuc)
            .input('TrangThai', sql.NVarChar, TrangThai).query(isUpdate
                ? `UPDATE KhuyenMai SET TenKM=@TenKM,LoaiKM=@LoaiKM,GiaTri=@GiaTri,
                       NgayBatDau=@NgayBatDau,NgayKetThuc=@NgayKetThuc,TrangThai=@TrangThai
                   WHERE MaKM=@MaKM`
                : `INSERT KhuyenMai(MaKM,TenKM,LoaiKM,GiaTri,NgayBatDau,NgayKetThuc,TrangThai)
                   VALUES(@MaKM,@TenKM,@LoaiKM,@GiaTri,@NgayBatDau,@NgayKetThuc,@TrangThai)`);
        await writeAudit(pool.request(), req.user, isUpdate ? 'Cập nhật khuyến mãi' : 'Tạo khuyến mãi',
            'KhuyenMai', MaKM, `${TenKM} · ${LoaiKM} ${GiaTri}`);
        res.status(isUpdate ? 200 : 201).json({ message: isUpdate ? 'Đã cập nhật chương trình khuyến mãi.' : 'Đã tạo chương trình khuyến mãi.', MaKM });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const setPromotionStatus = async (req, res) => {
    try {
        const status = req.body.TrangThai === 'Hiệu lực' ? 'Hiệu lực' : 'Ngừng';
        const pool = await poolPromise;
        const result = await pool.request().input('MaKM', sql.VarChar, req.params.id)
            .input('TrangThai', sql.NVarChar, status)
            .query('UPDATE KhuyenMai SET TrangThai=@TrangThai OUTPUT inserted.MaKM WHERE MaKM=@MaKM');
        if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy chương trình khuyến mãi.' });
        await writeAudit(pool.request(), req.user, status === 'Ngừng' ? 'Ngừng khuyến mãi' : 'Kích hoạt khuyến mãi',
            'KhuyenMai', req.params.id, `Chuyển trạng thái sang ${status}`);
        res.json({ message: `Đã chuyển khuyến mãi sang trạng thái ${status}.` });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    getCategories, createCategory, updateCategory, setCategoryStatus,
    getProducts, createProduct, updateProduct, setProductStatus,
    getPromotions, savePromotion, setPromotionStatus
};
