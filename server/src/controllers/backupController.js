const path = require('node:path');
const fs = require('node:fs');
const bcrypt = require('bcrypt');
const { sql, poolPromise } = require('../config/db');
const { logAudit, logAuditSafe } = require('../services/auditLog');
const {
    createFullBackup,
    listBackupHistory,
    resolveStoredBackup,
    verifyRestoreConfirm,
    restoreFromDisk,
    isSafeLocalBakPath
} = require('../services/backupService');
const { readMaintenance, writeMaintenance } = require('../services/maintenanceService');

const truthy = (value) => value === true || value === 'true' || Number(value) === 1;

const createBackup = async (req, res) => {
    try {
        const result = await createFullBackup({ user: req.user });
        const pool = await poolPromise;
        await logAudit(pool, {
            user: req.user, req,
            action: 'Tạo backup database',
            table: 'NhatKy',
            recordId: String(result.fileName).slice(0, 50),
            uc: 'UC03',
            severity: 'Quan trọng',
            content: `${result.message} File ${result.fileName}.`
        });
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Không thể tạo backup.' });
    }
};

const listBackups = async (_req, res) => {
    try {
        const data = await listBackupHistory();
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể liệt kê backup.' });
    }
};

const downloadBackup = (req, res) => {
    try {
        const stored = resolveStoredBackup(req.params.fileName);
        if (!stored) return res.status(404).json({ message: 'File backup không tồn tại.' });
        if (!/\.bak$/i.test(stored.fileName)) {
            return res.status(400).json({ message: 'Chỉ tải được file .bak.' });
        }
        res.download(stored.filePath, stored.fileName);
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải file backup.' });
    }
};

const confirmRestoreAccess = async (req) => {
    const confirm = verifyRestoreConfirm({
        xacNhan: req.body?.xacNhan || req.body?.confirm,
        daHieuMatDuLieu: req.body?.daHieuMatDuLieu
    });
    if (!confirm.ok) return { ok: false, status: 400, message: confirm.message };
    const password = String(req.body?.MatKhau || req.body?.MatKhauHienTai || '');
    if (!password) return { ok: false, status: 400, message: 'Nhập mật khẩu Quản lý để xác nhận khôi phục.' };
    const pool = await poolPromise;
    const acc = await pool.request()
        .input('MaTK', sql.Int, req.user.MaTK)
        .query('SELECT MatKhauHash FROM TaiKhoan WHERE MaTK = @MaTK');
    if (!acc.recordset.length) return { ok: false, status: 404, message: 'Không tìm thấy tài khoản.' };
    const match = await bcrypt.compare(password, acc.recordset[0].MatKhauHash);
    if (!match) return { ok: false, status: 400, message: 'Mật khẩu không chính xác.' };
    return { ok: true };
};

const maybeBackupBeforeRestore = async (req) => {
    if (!truthy(req.body?.saoLuuTruoc)) return null;
    return createFullBackup({ user: req.user });
};

const finishRestore = async (req, res, sourceLabel) => {
    const pool = await poolPromise;
    await logAuditSafe(pool, {
        user: req.user, req,
        action: 'Khôi phục database',
        table: 'NhatKy',
        recordId: String(sourceLabel || '').slice(0, 50),
        uc: 'UC03',
        severity: 'Quan trọng',
        content: `Quản lý xác nhận khôi phục từ ${sourceLabel}. Dữ liệu trước đó đã bị thay.`
    });
    res.json({
        message: 'Đã khôi phục CSDL. Hãy đóng ứng dụng và chạy lại npm start, rồi đăng nhập lại.',
        needRestart: true
    });
};

const restoreStoredBackup = async (req, res) => {
    try {
        const access = await confirmRestoreAccess(req);
        if (!access.ok) return res.status(access.status).json({ message: access.message });
        const stored = resolveStoredBackup(req.params.fileName);
        if (!stored) return res.status(404).json({ message: 'File backup không tồn tại.' });
        if (!/\.bak$/i.test(stored.fileName)) {
            return res.status(400).json({ message: 'File JSON metadata không khôi phục được. Cần file .bak đầy đủ.' });
        }
        await maybeBackupBeforeRestore(req);
        await restoreFromDisk(stored.filePath);
        await finishRestore(req, res, stored.fileName);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Không khôi phục được CSDL.' });
    }
};

const restoreUploadedBackup = async (req, res) => {
    const uploaded = req.file;
    try {
        const access = await confirmRestoreAccess(req);
        if (!access.ok) {
            if (uploaded?.path) await fs.promises.unlink(uploaded.path).catch(() => {});
            return res.status(access.status).json({ message: access.message });
        }
        const localPath = String(req.body?.localPath || '').trim();
        let source = uploaded?.path || '';
        if (!source && localPath) {
            if (!isSafeLocalBakPath(localPath)) {
                return res.status(400).json({ message: 'Đường dẫn file .bak không hợp lệ.' });
            }
            if (!fs.existsSync(localPath)) return res.status(404).json({ message: 'Không tìm thấy file .bak trên máy.' });
            source = localPath;
        }
        if (!source) return res.status(400).json({ message: 'Hãy chọn file .bak để khôi phục.' });
        await maybeBackupBeforeRestore(req);
        await restoreFromDisk(source);
        const label = uploaded?.originalname || path.basename(source);
        if (uploaded?.path) await fs.promises.unlink(uploaded.path).catch(() => {});
        await finishRestore(req, res, label);
    } catch (error) {
        if (uploaded?.path) await fs.promises.unlink(uploaded.path).catch(() => {});
        console.error(error);
        res.status(500).json({ message: error.message || 'Không khôi phục được CSDL.' });
    }
};

const listOpenShifts = async (pool) => {
    try {
        const result = await pool.request().query(`
            SELECT ca.MaCa, n.TenNV, ca.ThoiGianBatDau
            FROM CaLamViec ca
            JOIN NhanVien n ON n.MaNV = ca.MaNV
            WHERE ca.TrangThai = N'Đang mở' AND ca.ThoiGianKetThuc IS NULL
            ORDER BY ca.ThoiGianBatDau`);
        return result.recordset;
    } catch {
        return [];
    }
};

const getMaintenance = async (_req, res) => {
    try {
        const state = readMaintenance();
        const pool = await poolPromise;
        const openShifts = await listOpenShifts(pool);
        res.json({
            ...state,
            openShifts,
            checklist: [
                'Thông báo nhân viên trước khi bật.',
                'Ca đang mở và hóa đơn dở không bị đóng tự động.',
                'IPN cổng thanh toán vẫn nhận.',
                'Tắt bảo trì khi xong, không chạy setup:next / git pull từ màn này.'
            ]
        });
    } catch (error) {
        res.status(500).json({ message: 'Không tải được trạng thái bảo trì.' });
    }
};

const putMaintenance = async (req, res) => {
    try {
        const enabled = truthy(req.body?.enabled);
        const reason = String(req.body?.reason || '').trim().slice(0, 300);
        const current = readMaintenance();
        const pool = await poolPromise;
        const openShifts = await listOpenShifts(pool);
        if (enabled && !current.enabled && openShifts.length && !truthy(req.body?.daHieuCaMo)) {
            return res.status(400).json({
                message: `Đang có ${openShifts.length} ca mở. Hãy xác nhận đã hiểu — hệ thống không đóng ca / không hủy hóa đơn dở.`,
                openShifts
            });
        }
        const next = writeMaintenance({
            enabled,
            reason: enabled ? reason : '',
            enabledAt: enabled ? (current.enabled ? current.enabledAt : new Date().toISOString()) : null,
            enabledBy: enabled ? req.user.MaTK : null,
            enabledByName: enabled ? (req.user.TenNV || req.user.TenVaiTro || '') : ''
        });
        await logAudit(pool, {
            user: req.user, req,
            action: enabled ? 'Bật chế độ bảo trì' : 'Tắt chế độ bảo trì',
            table: 'NhatKy',
            recordId: enabled ? 'ON' : 'OFF',
            uc: 'UC03',
            severity: 'Cảnh báo',
            content: enabled
                ? `Bật bảo trì. Lý do: ${next.reason || '—'}. Ca mở: ${openShifts.length}. Không đóng ca, không hủy HĐ.`
                : 'Tắt chế độ bảo trì.'
        });
        res.json({ ...next, openShifts, message: enabled ? 'Đã bật chế độ bảo trì.' : 'Đã tắt chế độ bảo trì.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Không đổi được chế độ bảo trì.' });
    }
};

module.exports = {
    createBackup,
    listBackups,
    downloadBackup,
    restoreStoredBackup,
    restoreUploadedBackup,
    getMaintenance,
    putMaintenance
};
