const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    ensureSeedProductImages,
    SEEDED_PRODUCTS,
    seedDirectory,
    uploadDirectory
} = require('./src/services/productImageSeed');

assert.equal(SEEDED_PRODUCTS.length, 4);
SEEDED_PRODUCTS.forEach(item => {
    const seedFile = path.join(seedDirectory, item.file);
    assert.ok(fs.existsSync(seedFile), `Thiếu ảnh seed ${item.file}`);
    assert.ok(fs.statSync(seedFile).size > 0, `Ảnh seed ${item.file} rỗng.`);
});

ensureSeedProductImages();
SEEDED_PRODUCTS.forEach(item => {
    assert.ok(fs.existsSync(path.join(uploadDirectory, item.file)), `API phải copy ${item.file} vào uploads.`);
    item.legacy.forEach(legacy => {
        assert.ok(fs.existsSync(path.join(uploadDirectory, legacy)), `API phải giữ alias ${legacy} cho .bak cũ.`);
    });
});

const appSource = fs.readFileSync(path.resolve(__dirname, 'src/app.js'), 'utf8');
assert.match(appSource, /ensureSeedProductImages/);
const gitignore = fs.readFileSync(path.resolve(__dirname, '../.gitignore'), 'utf8');
assert.match(gitignore, /server\/uploads\//);
assert.doesNotMatch(gitignore, /seed-images/);

console.log('PRODUCT IMAGE SEED PASS: 4 ảnh bánh trung thu đi kèm repo và copy sang uploads.');
