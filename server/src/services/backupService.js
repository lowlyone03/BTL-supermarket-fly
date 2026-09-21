'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sql, poolPromise, dbConfig } = require('../config/db');
const {
    BACKUP_DIR,
    PROJECT_BACKUP_DIR,
    safeBackupName,
    backupFilePath,
    isSafeLocalBakPath,
    formatBytes
} = require('./backupPaths');

const ensureBackupDir = () => {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
};

const projectBackupDirIfExists = () => {
    try {
        if (fs.existsSync(PROJECT_BACKUP_DIR)) return PROJECT_BACKUP_DIR;
    } catch { /* ignore */ }
    return '';
};

const BACKUP_TIMEOUT_MS = 300000;

const sqlEscapePath = (filePath) => String(filePath || '').replace(/'/g, "''");

const bracketId = (name) => `[${String(name || '').replace(/]/g, '')}]`;

const connectMaster = async () => {
    const pool = new sql.ConnectionPool({
        ...dbConfig,
        database: 'master',
        requestTimeout: BACKUP_TIMEOUT_MS
    });
    await pool.connect();
    return pool;
};

const currentDbName = async (pool) => {
    const result = await pool.request().query('SELECT DB_NAME() AS DbName');
    return result.recordset[0]?.DbName || dbConfig.database;
};

const runSqlBackup = async (pool, dbName, filePath) => {
    const request = pool.request();
    request.timeout = BACKUP_TIMEOUT_MS;
    await request.query(
        `BACKUP DATABASE ${bracketId(dbName)} TO DISK = N'${sqlEscapePath(filePath)}' WITH FORMAT, INIT, NAME = N'SupermarketFly Full Backup'`
    );
};

const createFullBackup = async ({ user } = {}) => {
    const pool = await poolPromise;
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const createdBy = user?.TenNV || user?.TenDangNhap || '';
    const fileName = `SupermarketFly_Backup_${timestamp}.bak`;
    const filePath = path.join(BACKUP_DIR, fileName);

    try {
        const dbName = await currentDbName(pool);
        await runSqlBackup(pool, dbName, filePath);
    } catch (backupError) {
        await fs.promises.unlink(filePath).catch(() => {});
        const detail = backupError.message || 'BACKUP DATABASE thất bại.';
        throw new Error(`Sao lưu SQL thất bại. File .bak không được tạo. ${detail}`);
    }

    if (!fs.existsSync(filePath)) {
        throw new Error('Sao lưu SQL thất bại. Không thấy file .bak sau khi BACKUP DATABASE.');
    }

    const stat = fs.statSync(filePath);
    let projectPath = '';
    const projectDir = projectBackupDirIfExists();
    if (projectDir) {
        try {
            const dest = path.join(projectDir, fileName);
            await fs.promises.copyFile(filePath, dest);
            projectPath = dest;
        } catch { /* thư mục dự án không bắt buộc */ }
    }

    return {
        fileName,
        filePath,
        projectPath,
        projectBackupDir: projectDir || PROJECT_BACKUP_DIR,
        size: stat.size,
        loai: 'full',
        createdAt: stat.mtime.toISOString(),
        createdBy,
        type: 'full',
        message: 'Đã tạo bản sao lưu đầy đủ (.bak).'
    };
};

const listBackupHistory = async () => {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR).filter((name) => safeBackupName(name));
    const items = files.map((fileName) => {
        const filePath = path.join(BACKUP_DIR, fileName);
        const stat = fs.statSync(filePath);
        const isBak = /\.bak$/i.test(fileName);
        return {
            fileName,
            size: stat.size,
            loai: isBak ? 'full' : 'metadata',
            createdAt: stat.mtime.toISOString(),
            duongDan: filePath,
            exists: true,
            canRestore: isBak
        };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const latest = items[0] || null;
    const ageHours = latest ? (Date.now() - new Date(latest.createdAt).getTime()) / 36e5 : null;
    let statusMessage = 'Chưa có bản sao lưu.';
    let statusLevel = 'warning';
    if (latest) {
        if (latest.loai !== 'full') {
            statusMessage = 'Bản gần nhất không phải file .bak. JSON metadata không khôi phục được.';
            statusLevel = 'warning';
        } else if (ageHours > 24 * 7) {
            statusMessage = 'Bản sao lưu đầy đủ gần nhất đã hơn 7 ngày.';
            statusLevel = 'warning';
        } else {
            statusMessage = 'Đã có bản sao lưu đầy đủ gần đây.';
            statusLevel = 'ok';
        }
    }

    return {
        items,
        latest,
        backupDir: BACKUP_DIR,
        projectBackupDir: projectBackupDirIfExists() || PROJECT_BACKUP_DIR,
        projectDirExists: Boolean(projectBackupDirIfExists()),
        status: { level: statusLevel, message: statusMessage, ageHours }
    };
};

const resolveStoredBackup = (fileName) => {
    const filePath = backupFilePath(fileName);
    if (!filePath || !fs.existsSync(filePath)) return null;
    return { fileName: path.basename(filePath), filePath };
};

const verifyRestoreConfirm = ({ xacNhan, daHieuMatDuLieu }) => {
    const { validateRestoreConfirm } = require('./fieldValidators');
    const phrase = validateRestoreConfirm(xacNhan);
    if (!phrase.ok) return phrase;
    if (daHieuMatDuLieu !== true && daHieuMatDuLieu !== 'true' && Number(daHieuMatDuLieu) !== 1) {
        return { ok: false, message: 'Hãy xác nhận đã hiểu dữ liệu hiện tại sẽ bị thay thế.' };
    }
    return { ok: true, value: phrase.value };
};

const restoreFromDisk = async (sourcePath) => {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
        throw new Error('Không tìm thấy file backup.');
    }
    if (!/\.bak$/i.test(sourcePath)) {
        throw new Error('Chỉ khôi phục được file .bak. File JSON metadata không phải bản sao lưu.');
    }
    ensureBackupDir();
    const stagingName = `SupermarketFly_Restore_${Date.now()}.bak`;
    const stagingPath = path.join(BACKUP_DIR, stagingName);
    const sameDir = path.resolve(sourcePath) === path.resolve(stagingPath);
    if (!sameDir) await fs.promises.copyFile(sourcePath, stagingPath);

    const appPool = await poolPromise;
    const dbName = await currentDbName(appPool);
    const master = await connectMaster();
    try {
        const verify = master.request();
        verify.timeout = BACKUP_TIMEOUT_MS;
        try {
            await verify.query(`RESTORE VERIFYONLY FROM DISK = N'${sqlEscapePath(stagingPath)}'`);
        } catch (verifyError) {
            throw new Error(`File .bak không hợp lệ: ${verifyError.message}`);
        }
        const restore = master.request();
        restore.timeout = BACKUP_TIMEOUT_MS;
        await restore.query(`
            ALTER DATABASE ${bracketId(dbName)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
            RESTORE DATABASE ${bracketId(dbName)} FROM DISK = N'${sqlEscapePath(stagingPath)}' WITH REPLACE, RECOVERY;
            ALTER DATABASE ${bracketId(dbName)} SET MULTI_USER;`);
    } catch (error) {
        try {
            await master.request().query(`IF DB_ID(N'${String(dbName).replace(/'/g, "''")}') IS NOT NULL ALTER DATABASE ${bracketId(dbName)} SET MULTI_USER;`);
        } catch { /* ignore */ }
        throw error;
    } finally {
        await master.close().catch(() => {});
        if (!sameDir) await fs.promises.unlink(stagingPath).catch(() => {});
    }
};

module.exports = {
    BACKUP_DIR,
    PROJECT_BACKUP_DIR,
    safeBackupName,
    backupFilePath,
    isSafeLocalBakPath,
    ensureBackupDir,
    projectBackupDirIfExists,
    formatBytes,
    createFullBackup,
    listBackupHistory,
    resolveStoredBackup,
    verifyRestoreConfirm,
    restoreFromDisk
};
