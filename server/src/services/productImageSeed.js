const fs = require('node:fs');
const path = require('node:path');

const seedDirectory = path.resolve(__dirname, '..', '..', 'seed-images', 'products');
const uploadDirectory = path.resolve(__dirname, '..', '..', 'uploads', 'products');

const SEEDED_PRODUCTS = [
    { MaSP: 'BK007', file: 'bk007.jpg', legacy: ['san-pham-1788799493167-cd7354df69dd.jpg'] },
    { MaSP: 'BK008', file: 'bk008.jpg', legacy: ['san-pham-1788799878676-cf93faf43a2e.jpg'] },
    { MaSP: 'BK009', file: 'bk009.jpg', legacy: ['san-pham-1788800397186-b97f11a181fc.jpg'] },
    { MaSP: 'BK010', file: 'bk010.jpg', legacy: ['san-pham-1788800758724-2e995d696676.jpg'] }
];

const ensureSeedProductImages = () => {
    fs.mkdirSync(uploadDirectory, { recursive: true });
    for (const item of SEEDED_PRODUCTS) {
        const source = path.join(seedDirectory, item.file);
        if (!fs.existsSync(source)) continue;
        for (const name of [item.file, ...item.legacy]) {
            const dest = path.join(uploadDirectory, name);
            if (!fs.existsSync(dest)) fs.copyFileSync(source, dest);
        }
    }
};

module.exports = { ensureSeedProductImages, SEEDED_PRODUCTS, seedDirectory, uploadDirectory };
