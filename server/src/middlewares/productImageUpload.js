const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');

const uploadDirectory = path.resolve(__dirname, '..', '..', 'uploads', 'products');
fs.mkdirSync(uploadDirectory, { recursive: true });

const extensions = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp']
]);

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => {
        const extension = extensions.get(file.mimetype) || '.img';
        callback(null, `san-pham-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!extensions.has(file.mimetype)) {
            return callback(new Error('Ảnh sản phẩm chỉ chấp nhận JPG, PNG hoặc WebP.'));
        }
        callback(null, true);
    }
}).single('AnhSanPham');

const hasExpectedSignature = async file => {
    if (!file?.path) return false;
    const handle = await fs.promises.open(file.path, 'r');
    try {
        const header = Buffer.alloc(12);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        const jpg = bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
        const png = bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const webp = bytesRead >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
        return (file.mimetype === 'image/jpeg' && jpg)
            || (file.mimetype === 'image/png' && png)
            || (file.mimetype === 'image/webp' && webp);
    } finally {
        await handle.close();
    }
};

const uploadProductImage = (req, res, next) => {
    upload(req, res, async error => {
        if (!error && req.file) {
            try {
                if (await hasExpectedSignature(req.file)) return next();
                await fs.promises.unlink(req.file.path).catch(() => {});
                req.file = undefined;
                return res.status(400).json({ message: 'Tệp đã chọn không phải ảnh JPG, PNG hoặc WebP hợp lệ.' });
            } catch (signatureError) {
                await fs.promises.unlink(req.file.path).catch(() => {});
                req.file = undefined;
                return res.status(400).json({ message: 'Không thể đọc tệp ảnh sản phẩm.' });
            }
        }
        if (!error) return next();
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'Ảnh sản phẩm không được lớn hơn 5 MB.'
            : error.message || 'Không thể tải ảnh sản phẩm.';
        return res.status(400).json({ message });
    });
};

const storedPathFor = file => file ? `/uploads/products/${file.filename}` : null;

const deleteUploadedProductImage = async storedPath => {
    if (!String(storedPath || '').startsWith('/uploads/products/')) return;
    const filename = path.basename(storedPath);
    const absolutePath = path.resolve(uploadDirectory, filename);
    if (path.dirname(absolutePath) !== uploadDirectory) return;
    await fs.promises.unlink(absolutePath).catch(error => {
        if (error.code !== 'ENOENT') console.error('Không thể dọn ảnh sản phẩm:', error.message);
    });
};

module.exports = { uploadProductImage, storedPathFor, deleteUploadedProductImage, hasExpectedSignature };
