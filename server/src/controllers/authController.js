const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('../config/db');
const bcrypt = require('bcrypt');
const { logAudit } = require('../services/auditLog');
const { validateNewPassword } = require('../services/fieldValidators');
const { loadEffectiveCodes, attachEffectivePermissions } = require('../services/effectivePermissions');
const { readMaintenance, isPrivilegedUser } = require('../services/maintenanceService');

const JWT_SECRET = process.env.JWT_SECRET || 'supermarket_fly_secret_123';

const login = async (req, res) => {
    try {
        const TenDangNhap = typeof req.body.TenDangNhap === 'string' ? req.body.TenDangNhap.trim() : '';
        const MatKhau = req.body.MatKhau;

        if (!TenDangNhap || !MatKhau) {
            return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập và mật khẩu!' });
        }

        const pool = await poolPromise;

        const accResult = await pool.request()
            .input('TenDangNhap', sql.VarChar, TenDangNhap)
            .query(`
                SELECT t.MaTK, t.MatKhauHash, t.MaNV, t.MaVaiTro, t.TrangThai, v.TenVaiTro, n.TenNV
                FROM TaiKhoan t
                JOIN VaiTro v ON t.MaVaiTro = v.MaVaiTro
                JOIN NhanVien n ON t.MaNV = n.MaNV
                WHERE t.TenDangNhap = @TenDangNhap
            `);

        if (accResult.recordset.length === 0) {
            return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác!' });
        }

        const user = accResult.recordset[0];

        if (user.TrangThai === 0) {
            return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản lý!' });
        }

        const isMatch = await bcrypt.compare(MatKhau, user.MatKhauHash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác!' });
        }

        const maint = readMaintenance();
        if (maint.enabled && !isPrivilegedUser(user)) {
            return res.status(503).json({
                code: 'MAINTENANCE',
                overlay: true,
                message: 'Hệ thống đang bảo trì',
                reason: maint.reason || 'Quản lý đang bảo trì hệ thống. Vui lòng thử lại sau.'
            });
        }

        const token = jwt.sign(
            { MaTK: user.MaTK, MaNV: user.MaNV, MaVaiTro: user.MaVaiTro, TenVaiTro: user.TenVaiTro },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        await pool.request()
            .input('MaTK', sql.Int, user.MaTK)
            .query('UPDATE TaiKhoan SET LanDangNhapCuoi = GETDATE() WHERE MaTK = @MaTK');

        try {
            await logAudit(pool, {
                user: { MaTK: user.MaTK }, req,
                action: 'Đăng nhập', table: 'TaiKhoan', recordId: String(user.MaTK),
                content: `${user.TenNV} (${user.TenVaiTro}) đăng nhập thành công.`
            });
        } catch (err) {
            console.log('Lỗi ghi nhật ký đăng nhập:', err.message);
        }

        const quyen = await loadEffectiveCodes(pool, user);

        let preferences = { ngonNgu: 'vi', giaoDien: 'light' };
        try {
            const { getEffectivePreferences } = require('../services/preferenceService');
            preferences = await getEffectivePreferences(pool, user.MaTK);
        } catch (prefError) {
            console.log('Không tải được tuỳ chọn giao diện lúc đăng nhập:', prefError.message);
        }

        setImmediate(() => {
            Promise.resolve().then(async () => {
                const { syncMembershipSafe } = require('../services/chatService');
                await syncMembershipSafe(pool, user.MaNV);
            }).catch(() => {});
        });

        res.status(200).json({
            message: 'Đăng nhập thành công!',
            token: token,
            user: {
                MaNV: user.MaNV,
                TenNV: user.TenNV,
                MaVaiTro: user.MaVaiTro,
                TenVaiTro: user.TenVaiTro,
                Quyen: quyen
            },
            preferences
        });

    } catch (error) {
        console.error('Lỗi server:', error);
        res.status(500).json({ message: 'Lỗi hệ thống!' });
    }
};

const changePassword = async (req, res) => {
    try {
        const { MatKhauCu } = req.body;
        const maTK = req.user.MaTK;

        if (!MatKhauCu) {
            return res.status(400).json({ message: 'Vui lòng nhập mật khẩu cũ và mới!' });
        }
        const newPassword = validateNewPassword(req.body.MatKhauMoi);
        if (!newPassword.ok) {
            return res.status(400).json({ message: newPassword.message });
        }
        const MatKhauMoi = newPassword.value;

        const pool = await poolPromise;

        const accResult = await pool.request()
            .input('MaTK', sql.Int, maTK)
            .query('SELECT MatKhauHash, TenDangNhap FROM TaiKhoan WHERE MaTK = @MaTK');

        if (accResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Tài khoản không tồn tại!' });
        }

        const user = accResult.recordset[0];

        const isMatch = await bcrypt.compare(MatKhauCu, user.MatKhauHash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Mật khẩu cũ không chính xác!' });
        }
        if (MatKhauCu === MatKhauMoi) {
            return res.status(400).json({ message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
        }

        const salt = await bcrypt.genSalt(10);
        const newHashedPassword = await bcrypt.hash(MatKhauMoi, salt);

        await pool.request()
            .input('MaTK', sql.Int, maTK)
            .input('MatKhauHash', sql.VarChar, newHashedPassword)
            .query('UPDATE TaiKhoan SET MatKhauHash = @MatKhauHash WHERE MaTK = @MaTK');

        await logAudit(pool, {
            user: req.user, req, action: 'Đổi mật khẩu', table: 'TaiKhoan', recordId: String(maTK),
            severity: 'Cảnh báo', content: 'Người dùng tự đổi mật khẩu. Nhật ký không lưu mật khẩu.'
        });

        res.json({ message: 'Đổi mật khẩu thành công!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

const getSession = async (req, res) => {
    try {
        const pool = await poolPromise;
        const row = await pool.request()
            .input('MaTK', sql.Int, req.user.MaTK)
            .query(`SELECT t.MaTK, t.MaNV, t.MaVaiTro, v.TenVaiTro, n.TenNV
                    FROM TaiKhoan t
                    JOIN VaiTro v ON t.MaVaiTro = v.MaVaiTro
                    JOIN NhanVien n ON n.MaNV = t.MaNV
                    WHERE t.MaTK = @MaTK`);
        if (!row.recordset.length) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
        }
        const session = row.recordset[0];
        await attachEffectivePermissions(pool, session);
        res.json({
            user: {
                MaNV: session.MaNV,
                TenNV: session.TenNV,
                MaVaiTro: session.MaVaiTro,
                TenVaiTro: session.TenVaiTro,
                Quyen: session.Quyen
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không tải được phiên làm việc.' });
    }
};

module.exports = {
    login,
    changePassword,
    getSession
};
