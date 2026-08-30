const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sql, poolPromise } = require('./src/config/db');
const { deleteUploadedProductImage } = require('./src/middlewares/productImageUpload');

const API_BASE = 'http://localhost:3000/api';
const TEST_CODES = ['ZZTIMG01', 'ZZTIMG02'];

const cleanup = async pool => {
    const oldImages = await pool.request()
        .input('Code1', sql.VarChar, TEST_CODES[0])
        .input('Code2', sql.VarChar, TEST_CODES[1])
        .query('SELECT DuongDanAnh FROM SanPham WHERE MaSP IN (@Code1,@Code2)');
    await pool.request()
        .input('Code1', sql.VarChar, TEST_CODES[0])
        .input('Code2', sql.VarChar, TEST_CODES[1])
        .query(`
            DELETE FROM TonKho WHERE MaSP IN (@Code1,@Code2);
            DELETE FROM NhatKy WHERE BangLienQuan='SanPham' AND MaBanGhi IN (@Code1,@Code2);
            DELETE FROM SanPham WHERE MaSP IN (@Code1,@Code2);`);
    await Promise.all(oldImages.recordset.map(item => deleteUploadedProductImage(item.DuongDanAnh)));
};

const requestJson = async (url, options = {}) => {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${data.message || JSON.stringify(data)}`);
    return data;
};

(async () => {
    const pool = await poolPromise;
    let createdImage = null;
    try {
        await cleanup(pool);
        const login = await requestJson(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ TenDangNhap: 'admin', MatKhau: '123' })
        });
        const headers = { Authorization: `Bearer ${login.token}` };
        const categories = await requestJson(`${API_BASE}/admin/catalog/categories`, { headers });
        const category = categories.items.find(item => Number(item.TrangThai) === 1);
        assert.ok(category, 'Cần ít nhất một danh mục đang hoạt động.');

        const imagePath = path.resolve(__dirname, '../desktop/src/assets/products/BK001.jpg');
        const form = new FormData();
        Object.entries({
            MaSP: TEST_CODES[0], MaDM: category.MaDM, TenSP: 'Sản phẩm kiểm thử hình ảnh',
            DonViTinh: 'Hộp', MaVach: 'TESTIMG20260830', GiaNhap: 10000, GiaBan: 12000,
            TonKhoToiThieu: 1, TrangThai: 'Đang bán'
        }).forEach(([key, value]) => form.append(key, String(value)));
        form.append('AnhSanPham', new Blob([await fs.promises.readFile(imagePath)], { type: 'image/jpeg' }), 'san-pham-test.jpg');
        const created = await requestJson(`${API_BASE}/admin/catalog/products`, { method: 'POST', headers, body: form });
        createdImage = created.DuongDanAnh;
        assert.match(createdImage, /^\/uploads\/products\/.*\.jpg$/);

        const updateFields = {
            MaDM: category.MaDM, TenSP: 'Sản phẩm kiểm thử hình ảnh', DonViTinh: 'Hộp',
            MaVach: 'TESTIMG20260830', GiaNhap: 10000, GiaBan: 12500,
            TonKhoToiThieu: 1, TrangThai: 'Đang bán'
        };
        const retainForm = new FormData();
        Object.entries(updateFields).forEach(([key, value]) => retainForm.append(key, String(value)));
        await requestJson(`${API_BASE}/admin/catalog/products/${TEST_CODES[0]}`, { method: 'PUT', headers, body: retainForm });
        const retained = await pool.request().input('Code', sql.VarChar, TEST_CODES[0])
            .query('SELECT DuongDanAnh,GiaBan FROM SanPham WHERE MaSP=@Code');
        assert.equal(retained.recordset[0].DuongDanAnh, createdImage, 'Không chọn ảnh mới phải giữ ảnh hiện tại.');
        assert.equal(Number(retained.recordset[0].GiaBan), 12500);

        const replacementPath = path.resolve(__dirname, '../desktop/src/assets/products/DH002.png');
        const replaceForm = new FormData();
        Object.entries(updateFields).forEach(([key, value]) => replaceForm.append(key, String(value)));
        replaceForm.append('AnhSanPham', new Blob([await fs.promises.readFile(replacementPath)], { type: 'image/png' }), 'anh-thay-the.png');
        await requestJson(`${API_BASE}/admin/catalog/products/${TEST_CODES[0]}`, { method: 'PUT', headers, body: replaceForm });
        const replaced = await pool.request().input('Code', sql.VarChar, TEST_CODES[0])
            .query('SELECT DuongDanAnh FROM SanPham WHERE MaSP=@Code');
        const replacementImage = replaced.recordset[0].DuongDanAnh;
        assert.notEqual(replacementImage, createdImage);
        assert.match(replacementImage, /\.png$/);
        const originalAbsolute = path.resolve(__dirname, `.${createdImage}`);
        assert.equal(fs.existsSync(originalAbsolute), false, 'Ảnh cũ phải được dọn sau khi thay ảnh thành công.');
        createdImage = replacementImage;

        const searchResult = await requestJson(`${API_BASE}/admin/catalog/products?search=san%20pham%20kiem%20thu`, { headers });
        assert.ok(searchResult.items.some(item => item.MaSP === TEST_CODES[0]), 'Tìm không dấu phải trả sản phẩm có dấu.');
        const imageResponse = await fetch(`http://localhost:3000${createdImage}`);
        assert.equal(imageResponse.status, 200);
        assert.match(imageResponse.headers.get('content-type') || '', /image\/png/);

        const fakeForm = new FormData();
        Object.entries({
            MaSP: TEST_CODES[1], MaDM: category.MaDM, TenSP: 'Tệp giả ảnh',
            DonViTinh: 'Hộp', MaVach: 'TESTIMGFAKE20260830', GiaNhap: 10000, GiaBan: 12000,
            TonKhoToiThieu: 1, TrangThai: 'Đang bán'
        }).forEach(([key, value]) => fakeForm.append(key, String(value)));
        const fakeSource = await fs.promises.readFile(path.resolve(__dirname, '../desktop/src/pages/shared/search-tools.js'));
        fakeForm.append('AnhSanPham', new Blob([fakeSource], { type: 'image/png' }), 'anh-gia.png');
        const fakeResponse = await fetch(`${API_BASE}/admin/catalog/products`, { method: 'POST', headers, body: fakeForm });
        assert.equal(fakeResponse.status, 400, 'Tệp giả MIME ảnh phải bị chặn.');

        console.log('API PRODUCT IMAGE PASS: tạo/giữ/thay ảnh, tìm không dấu, phục vụ ảnh và chặn tệp giả đều đạt.');
    } finally {
        await cleanup(pool);
        await deleteUploadedProductImage(createdImage);
        await pool.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
