const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hasExpectedSignature, storedPathFor } = require('./src/middlewares/productImageUpload');

(async () => {
    const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'supermarket-fly-image-'));
    const validPng = path.join(tempDirectory, 'valid.png');
    const fakePng = path.join(tempDirectory, 'fake.png');
    try {
        await fs.promises.writeFile(validPng, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]));
        await fs.promises.writeFile(fakePng, Buffer.from('not-an-image'));
        assert.equal(await hasExpectedSignature({ path: validPng, mimetype: 'image/png' }), true);
        assert.equal(await hasExpectedSignature({ path: fakePng, mimetype: 'image/png' }), false);
        assert.equal(storedPathFor({ filename: 'san-pham-test.webp' }), '/uploads/products/san-pham-test.webp');
        assert.equal(storedPathFor(null), null);
        console.log('PRODUCT UPLOAD PASS: kiểm tra chữ ký ảnh thật và đường dẫn lưu trữ hợp lệ.');
    } finally {
        await fs.promises.rm(tempDirectory, { recursive: true, force: true });
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
