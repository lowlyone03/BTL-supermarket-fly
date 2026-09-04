const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const {
    validateRequiredName, validateOptionalVnPhone, validateOptionalEmail, validateOptionalName,
    validateRequiredCode, validateRequiredVnTaxId, validateOptionalNote
} = require('../services/fieldValidators');

const clean = (value, max, fallback = null) => {
    const normalized = String(value ?? '').trim().slice(0, max);
    return normalized || fallback;
};

const writeAudit = (request, user, action, recordId, content) =>
    logAudit(request, { user, action, table: 'NhaCungCap', recordId, content, uc: 'UC11' });

const normalizeSupplier = body => {
    const maNCC = validateRequiredCode(body.MaNCC, 'Mã Nhà cung cấp');
    if (!maNCC.ok) throw new Error(maNCC.message);
    const tax = validateRequiredVnTaxId(body.MaSoThue);
    if (!tax.ok) throw new Error(tax.message);
    const address = validateOptionalNote(body.DiaChi, 300);
    if (!address.ok) throw new Error(address.message.replace('Ghi chú', 'Địa chỉ'));
    const supplier = {
        MaNCC: maNCC.value,
        TenNCC: clean(body.TenNCC, 150),
        MaSoThue: tax.value,
        SDT: clean(body.SDT, 20),
        Email: clean(body.Email, 100),
        DiaChi: address.value || null,
        NguoiLienHe: clean(body.NguoiLienHe, 100),
        TrangThai: body.TrangThai === 'Ngừng hợp tác' ? 'Ngừng hợp tác' : 'Đang hợp tác'
    };
    const ten = validateRequiredName(supplier.TenNCC, 'Tên Nhà cung cấp');
    if (!ten.ok) throw new Error(ten.message);
    supplier.TenNCC = ten.value;
    const contact = validateOptionalName(supplier.NguoiLienHe, 'Người liên hệ');
    if (!contact.ok) throw new Error(contact.message);
    supplier.NguoiLienHe = contact.value || null;
    const email = validateOptionalEmail(supplier.Email);
    if (!email.ok) throw new Error(email.message);
    supplier.Email = email.value || null;
    const phone = validateOptionalVnPhone(supplier.SDT);
    if (!phone.ok) throw new Error(phone.message);
    supplier.SDT = phone.value || null;
    return supplier;
};

const bind = (request, supplier) => request
    .input('MaNCC', sql.VarChar, supplier.MaNCC)
    .input('TenNCC', sql.NVarChar, supplier.TenNCC)
    .input('MaSoThue', sql.VarChar, supplier.MaSoThue)
    .input('SDT', sql.VarChar, supplier.SDT)
    .input('Email', sql.VarChar, supplier.Email)
    .input('DiaChi', sql.NVarChar, supplier.DiaChi)
    .input('NguoiLienHe', sql.NVarChar, supplier.NguoiLienHe)
    .input('TrangThai', sql.NVarChar, supplier.TrangThai);

const list = async (req, res) => {
    try {
        const keyword = clean(req.query.search, 150, '');
        const status = clean(req.query.status, 30, '');
        const pool = await poolPromise;
        const result = await pool.request()
            .input('TuKhoa', sql.NVarChar, keyword)
            .input('Mau', sql.NVarChar, `%${keyword}%`)
            .input('TrangThai', sql.NVarChar, status)
            .query(`SELECT ncc.MaNCC,ncc.TenNCC,ncc.MaSoThue,ncc.SDT,ncc.Email,ncc.DiaChi,
                           ncc.NguoiLienHe,ncc.TrangThai,COUNT(po.MaPO) AS SoDonMua,
                           MAX(po.NgayLap) AS LanMuaGanNhat
                    FROM NhaCungCap ncc
                    LEFT JOIN DonMuaHang po ON po.MaNCC=ncc.MaNCC
                    WHERE (@TrangThai=N'' OR ncc.TrangThai=@TrangThai)
                      AND (@TuKhoa=N'' OR ncc.MaNCC LIKE @Mau COLLATE Latin1_General_100_CI_AI OR ncc.TenNCC LIKE @Mau COLLATE Latin1_General_100_CI_AI
                           OR ncc.MaSoThue LIKE @Mau COLLATE Latin1_General_100_CI_AI OR ISNULL(ncc.SDT,'') LIKE @Mau COLLATE Latin1_General_100_CI_AI)
                    GROUP BY ncc.MaNCC,ncc.TenNCC,ncc.MaSoThue,ncc.SDT,ncc.Email,ncc.DiaChi,ncc.NguoiLienHe,ncc.TrangThai
                    ORDER BY CASE WHEN ncc.TrangThai=N'Đang hợp tác' THEN 0 ELSE 1 END,ncc.TenNCC`);
        const items = result.recordset;
        res.json({ items, summary: { total: items.length, active: items.filter(item => item.TrangThai === 'Đang hợp tác').length, inactive: items.filter(item => item.TrangThai !== 'Đang hợp tác').length } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải danh sách Nhà cung cấp.' });
    }
};

const create = async (req, res) => {
    try {
        const supplier = normalizeSupplier(req.body);
        const pool = await poolPromise;
        await bind(pool.request(), supplier).query(`INSERT INTO NhaCungCap
            (MaNCC,TenNCC,MaSoThue,SDT,Email,DiaChi,NguoiLienHe,TrangThai)
            VALUES (@MaNCC,@TenNCC,@MaSoThue,@SDT,@Email,@DiaChi,@NguoiLienHe,@TrangThai)`);
        await writeAudit(pool.request(), req.user, 'Thêm Nhà cung cấp', supplier.MaNCC, `Tạo Nhà cung cấp ${supplier.TenNCC}`);
        res.status(201).json({ message: 'Đã thêm Nhà cung cấp.', MaNCC: supplier.MaNCC });
    } catch (error) {
        console.error(error);
        const duplicate = error.number === 2627 || error.number === 2601;
        res.status(duplicate ? 409 : 400).json({ message: duplicate ? 'Mã Nhà cung cấp hoặc mã số thuế đã tồn tại.' : error.message });
    }
};

const update = async (req, res) => {
    try {
        const supplier = normalizeSupplier({ ...req.body, MaNCC: req.params.id });
        const pool = await poolPromise;
        const result = await bind(pool.request(), supplier).query(`UPDATE NhaCungCap SET
            TenNCC=@TenNCC,MaSoThue=@MaSoThue,SDT=@SDT,Email=@Email,DiaChi=@DiaChi,
            NguoiLienHe=@NguoiLienHe,TrangThai=@TrangThai
            OUTPUT inserted.MaNCC WHERE MaNCC=@MaNCC`);
        if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy Nhà cung cấp.' });
        await writeAudit(pool.request(), req.user, 'Cập nhật Nhà cung cấp', supplier.MaNCC, `Cập nhật thông tin ${supplier.TenNCC}`);
        res.json({ message: 'Đã cập nhật Nhà cung cấp.' });
    } catch (error) {
        console.error(error);
        const duplicate = error.number === 2627 || error.number === 2601;
        res.status(duplicate ? 409 : 400).json({ message: duplicate ? 'Mã số thuế đã thuộc Nhà cung cấp khác.' : error.message });
    }
};

const setStatus = async (req, res) => {
    try {
        const status = req.body.TrangThai === 'Ngừng hợp tác' ? 'Ngừng hợp tác' : 'Đang hợp tác';
        const pool = await poolPromise;
        const result = await pool.request().input('MaNCC', sql.VarChar, req.params.id).input('TrangThai', sql.NVarChar, status)
            .query('UPDATE NhaCungCap SET TrangThai=@TrangThai OUTPUT inserted.MaNCC WHERE MaNCC=@MaNCC');
        if (!result.recordset.length) return res.status(404).json({ message: 'Không tìm thấy Nhà cung cấp.' });
        await writeAudit(pool.request(), req.user, status === 'Đang hợp tác' ? 'Kích hoạt Nhà cung cấp' : 'Ngừng hợp tác Nhà cung cấp', req.params.id, `Chuyển trạng thái sang ${status}`);
        res.json({ message: `Đã chuyển Nhà cung cấp sang trạng thái ${status}.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể cập nhật trạng thái Nhà cung cấp.' });
    }
};

const orderHistory = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('MaNCC', sql.VarChar, req.params.id).query(`
            SELECT MaPO,MaDN,NgayLap,NgayGiaoDuKien,TongTien,TrangThai
            FROM DonMuaHang WHERE MaNCC=@MaNCC ORDER BY NgayLap DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải lịch sử Đơn mua.' });
    }
};

module.exports = { list, create, update, setStatus, orderHistory };
