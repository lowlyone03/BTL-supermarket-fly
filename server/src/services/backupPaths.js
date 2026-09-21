'use strict';

const path = require('node:path');

const BACKUP_DIR = path.resolve(__dirname, '..', '..', 'backups');
const PROJECT_BACKUP_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'TaiLieu_Du_An', '05_Backup', 'Database_Backups');

const safeBackupName = (name) => {
    const base = path.basename(String(name || '')).trim();
    if (!base || base !== String(name || '').trim()) return '';
    if (base.includes('..') || /[\\/]/.test(base)) return '';
    if (!/^SupermarketFly_[A-Za-z0-9._-]+\.(bak|json)$/i.test(base)) return '';
    return base;
};

const backupFilePath = (fileName) => {
    const safe = safeBackupName(fileName);
    if (!safe) return '';
    return path.join(BACKUP_DIR, safe);
};

const isSafeLocalBakPath = (filePath) => {
    const raw = String(filePath || '').trim();
    if (!raw || !path.isAbsolute(raw) || raw.includes('..')) return false;
    return /\.bak$/i.test(raw);
};

const formatBytes = (bytes) => {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

module.exports = {
    BACKUP_DIR,
    PROJECT_BACKUP_DIR,
    safeBackupName,
    backupFilePath,
    isSafeLocalBakPath,
    formatBytes
};
