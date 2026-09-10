'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');

const MAX_BYTES = 8 * 1024 * 1024;
const uploadDirectory = path.resolve(__dirname, '..', '..', 'uploads', 'chat');
fs.mkdirSync(uploadDirectory, { recursive: true });

const extensions = new Map([
    ['application/pdf', '.pdf'],
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp']
]);

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => {
        const extension = extensions.get(file.mimetype) || '.bin';
        callback(null, `chat-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!extensions.has(file.mimetype)) {
            return callback(new Error('Chỉ gửi PDF hoặc ảnh JPG, PNG, WebP.'));
        }
        callback(null, true);
    }
}).single('TepChat');

const hasExpectedSignature = async (file) => {
    if (!file?.path) return false;
    const handle = await fs.promises.open(file.path, 'r');
    try {
        const header = Buffer.alloc(12);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        const pdf = bytesRead >= 5 && header.subarray(0, 5).toString('ascii') === '%PDF-';
        const jpg = bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
        const png = bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const webp = bytesRead >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
        return (file.mimetype === 'application/pdf' && pdf)
            || (file.mimetype === 'image/jpeg' && jpg)
            || (file.mimetype === 'image/png' && png)
            || (file.mimetype === 'image/webp' && webp);
    } finally {
        await handle.close();
    }
};

const uploadChatFile = (req, res, next) => {
    upload(req, res, async (error) => {
        if (!error && req.file) {
            try {
                if (await hasExpectedSignature(req.file)) return next();
                await fs.promises.unlink(req.file.path).catch(() => {});
                req.file = undefined;
                return res.status(400).json({ message: 'Tệp không phải PDF hoặc ảnh JPG/PNG/WebP hợp lệ.' });
            } catch {
                await fs.promises.unlink(req.file.path).catch(() => {});
                req.file = undefined;
                return res.status(400).json({ message: 'Không thể đọc tệp đính kèm.' });
            }
        }
        if (!error) return next();
        const tooBig = error.code === 'LIMIT_FILE_SIZE';
        return res.status(tooBig ? 413 : 400).json({
            message: tooBig ? 'Tệp chat không được lớn hơn 8 MB.' : (error.message || 'Không thể tải tệp chat.')
        });
    });
};

const storedNameFor = (file) => (file ? file.filename : null);

const absoluteChatFile = (storedName) => {
    const filename = path.basename(String(storedName || ''));
    if (!filename) return null;
    const absolutePath = path.resolve(uploadDirectory, filename);
    if (path.dirname(absolutePath) !== uploadDirectory) return null;
    return absolutePath;
};

const deleteChatFile = async (storedName) => {
    const absolutePath = absoluteChatFile(storedName);
    if (!absolutePath) return;
    await fs.promises.unlink(absolutePath).catch((error) => {
        if (error.code !== 'ENOENT') console.error('Không thể dọn tệp chat:', error.message);
    });
};

module.exports = {
    uploadChatFile,
    storedNameFor,
    absoluteChatFile,
    deleteChatFile,
    hasExpectedSignature,
    CHAT_UPLOAD_DIR: uploadDirectory,
    CHAT_MAX_BYTES: MAX_BYTES
};
