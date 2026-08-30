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
assert.doesNotMatch(imageUi.markup({ MaSP: 'BK001', TenSP: 'Bánh quy' }), /undefined|NaN/);

console.log('PRODUCT IMAGES PASS: đủ 36 ảnh, đúng đường dẫn JPG/PNG và có placeholder cho mã mới.');
