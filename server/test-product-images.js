const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const assetDir = path.resolve(__dirname, '../desktop/src/assets/products');
const files = fs.readdirSync(assetDir).filter(file => /\.(?:jpg|jpeg|png|webp)$/i.test(file));
assert.equal(files.length, 36, 'Bộ ảnh đóng gói phải có đúng 36 sản phẩm.');

global.window = {};
require('../desktop/src/pages/shared/product-images.js');

const imageUi = window.FLY_PRODUCT_IMAGES;
assert.ok(imageUi, 'Component ảnh sản phẩm phải được khởi tạo.');
assert.equal(imageUi.url('BK001'), '../../assets/products/BK001.jpg');
assert.equal(imageUi.url('DH002'), '../../assets/products/DH002.png');
assert.match(imageUi.markup({ MaSP: 'SUA003', TenSP: 'Sữa tươi' }), /SUA003\.jpg/);
assert.match(imageUi.markup({ MaSP: 'SP999', TenSP: 'Sản phẩm mới' }), /is-missing/);
assert.equal(imageUi.resolve({ MaSP: 'SP999', DuongDanAnh: '/uploads/products/san-pham-moi.webp' }), 'http://localhost:3000/uploads/products/san-pham-moi.webp');
assert.equal(imageUi.hasImage({ MaSP: 'SP999', DuongDanAnh: '/uploads/products/san-pham-moi.webp' }), true);
assert.equal(imageUi.hasBundledImage('BK999'), false, 'Không được đoán ảnh theo tiền tố cho mã chưa có asset.');
assert.doesNotMatch(imageUi.markup({ MaSP: 'BK001', TenSP: 'Bánh quy' }), /undefined|NaN/);

const warehouseController = fs.readFileSync(path.resolve(__dirname, 'src/controllers/warehouseController.js'), 'utf8');
const salesController = fs.readFileSync(path.resolve(__dirname, 'src/controllers/salesController.js'), 'utf8');
const catalogController = fs.readFileSync(path.resolve(__dirname, 'src/controllers/catalogController.js'), 'utf8');
assert.match(warehouseController, /sp\.DuongDanAnh/, 'API kho phải trả ảnh sản phẩm tải lên.');
assert.match(salesController, /sp\.DuongDanAnh/, 'API POS phải trả ảnh sản phẩm tải lên.');
assert.match(catalogController, /sp\.DuongDanAnh/, 'API quản lý sản phẩm phải trả ảnh sản phẩm tải lên.');

console.log('PRODUCT IMAGES PASS: đủ 36 ảnh; ảnh tải lên đi qua Quản lý, Kho, POS; placeholder an toàn.');
