const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const path = require('node:path');
const fs = require('node:fs');

const BACKUP_DIR = path.resolve(__dirname, '..', '..', 'backups');

const ensureBackupDir = () => {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
};

const createBackup = async (req, res) => {
    try {
        const pool = await poolPromise;
        ensureBackupDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `SupermarketFly_Backup_${timestamp}.bak`;
        const filePath = path.join(BACKUP_DIR, fileName);

        // Try SQL Server BACKUP DATABASE
        try {
            const dbNameResult = await pool.request().query('SELECT DB_NAME() AS DbName');
            const dbName = dbNameResult.recordset[0].DbName;
            await pool.request().query(`BACKUP DATABASE [${dbName}] TO DISK = N'${filePath.replace(/'/g, "''")}' WITH FORMAT, INIT, NAME = N'SupermarketFly Full Backup'`);
        } catch (backupError) {
            // If SQL backup fails (permission issues), create metadata-only backup
            const tables = await pool.request().query(`
                SELECT t.TABLE_NAME, 
                       (SELECT SUM(p.rows) FROM sys.partitions p JOIN sys.tables st ON st.object_id=p.object_id WHERE st.name=t.TABLE_NAME AND p.index_id IN (0,1)) AS RowCount
                FROM INFORMATION_SCHEMA.TABLES t WHERE t.TABLE_TYPE='BASE TABLE' ORDER BY t.TABLE_NAME`);
            const metadata = {
                timestamp: new Date().toISOString(),
                type: 'metadata-only',
                reason: 'SQL Server BACKUP requires elevated permissions. This file contains database structure info.',
                tables: tables.recordset,
                hint: 'To perform a full backup, run BACKUP DATABASE from SQL Server Management Studio or grant backup permissions to the app user.'
            };
            const metaPath = path.join(BACKUP_DIR, `SupermarketFly_Meta_${timestamp}.json`);
            fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
            await logAudit(pool.request(), { user: req.user, action: 'Tạo backup metadata', table: 'HệThống', recordId: path.basename(metaPath), content: `Backup SQL thất bại: ${backupError.message}. Đã lưu metadata.`, severity: 'Cảnh báo' });
            return res.json({ message: 'Không có quyền backup SQL Server trực tiếp. Đã lưu file metadata thay thế.', fileName: path.basename(metaPath), type: 'metadata' });
        }

        await logAudit(pool.request(), { user: req.user, action: 'Tạo backup database', table: 'HệThống', recordId: fileName, content: `Backup thành công: ${fileName}`, severity: 'Quan trọng' });
        res.json({ message: 'Đã tạo backup thành công.', fileName, type: 'full' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Không thể tạo backup.' });
    }
};

const listBackups = async (_req, res) => {
    try {
        ensureBackupDir();
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('SupermarketFly_'))
            .map(f => {
                const stat = fs.statSync(path.join(BACKUP_DIR, f));
                return { fileName: f, size: stat.size, createdAt: stat.mtime.toISOString() };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ items: files, backupDir: BACKUP_DIR });
    } catch (error) {
        res.status(500).json({ message: 'Không thể liệt kê backup.' });
    }
};

const downloadBackup = (req, res) => {
    try {
        const fileName = String(req.params.fileName || '').replace(/[/\\]/g, '');
        if (!fileName.startsWith('SupermarketFly_')) return res.status(400).json({ message: 'Tên file không hợp lệ.' });
        const filePath = path.join(BACKUP_DIR, fileName);
        if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File backup không tồn tại.' });
        res.download(filePath, fileName);
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải file backup.' });
    }
};

const getSecurityLogs = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TOP 100 nk.MaNK, nk.HanhDong, nk.NoiDung, nk.ThoiGian, nk.BangLienQuan, nk.MaBanGhi,
                   COALESCE(n.TenNV, t.TenDangNhap, N'Hệ thống') AS NguoiThaoTac,
                   v.TenVaiTro
            FROM NhatKy nk
            LEFT JOIN TaiKhoan t ON t.MaTK = nk.MaTK
            LEFT JOIN NhanVien n ON n.MaNV = t.MaNV
            LEFT JOIN VaiTro v ON v.MaVaiTro = t.MaVaiTro
            WHERE nk.HanhDong IN (N'Đăng nhập', N'Đổi mật khẩu', N'Đặt lại mật khẩu', N'Khóa tài khoản', N'Mở khóa tài khoản', N'Tạo tài khoản', N'Đổi vai trò', N'Tạo backup database', N'Tạo backup metadata')
            ORDER BY nk.ThoiGian DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải nhật ký bảo mật.' });
    }
};

module.exports = { createBackup, listBackups, downloadBackup, getSecurityLogs };
