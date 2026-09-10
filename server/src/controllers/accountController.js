const { sql, poolPromise } = require('../config/db');
const bcrypt = require('bcrypt');
const { logAudit, listAuditLogs, listAuditFilters } = require('../services/auditLog');
const { validateUsername, validateEmployeeCode, toIsoDate } = require('../services/fieldValidators');
const { ensureEmployeeProfileSchema } = require('../services/employeeProfileSchema');
const { HOSO_SELECT, PROFILE_KEYS, hasProfileInput, upsertEmployeeProfile } = require('../services/employeeHoSo');
const { validateEmployeeInput, bindEmployeeFields } = require('./employeeController');

// Lấy danh sách tài khoản
const getAccounts = async (req, res) => {
    try {
        const pool = await poolPromise;
        await ensureEmployeeProfileSchema(pool);
        const result = await pool.request().query(`
            SELECT t.MaTK, t.TenDangNhap, t.MaNV, t.MaVaiTro, t.TrangThai, t.NgayTao, t.LanDangNhapCuoi,
                   n.TenNV, n.ChucVu, n.CCCD, n.NgaySinh, n.GioiTinh, n.SDT, n.Email, n.DiaChi, n.NgayVaoLam,
                   n.TrangThai AS TrangThaiNV,
                   v.TenVaiTro,
                   ${HOSO_SELECT}
            FROM TaiKhoan t
            JOIN NhanVien n ON t.MaNV = n.MaNV
            JOIN VaiTro v ON t.MaVaiTro = v.MaVaiTro
            LEFT JOIN HoSoNhanVien hs ON hs.MaNV = n.MaNV
            ORDER BY t.NgayTao DESC
        `);
        res.json(result.recordset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Tạo tài khoản mới
const createAccount = async (req, res) => {
    try {
        const maNVResult = validateEmployeeCode(req.body.MaNV);
        if (!maNVResult.ok) return res.status(400).json({ message: maNVResult.message });
        const MaNV = maNVResult.value;
        const usernameResult = validateUsername(req.body.TenDangNhap);
        if (!usernameResult.ok) return res.status(400).json({ message: usernameResult.message });
        const TenDangNhap = usernameResult.value;
        const MaVaiTro = Number(req.body.MaVaiTro);
        if (!Number.isInteger(MaVaiTro)) {
            return res.status(400).json({ message: 'Vui lòng chọn vai trò!' });
        }

        const pool = await poolPromise;
        await ensureEmployeeProfileSchema(pool);

        // Check nếu nhân viên đã có TK
        const checkNV = await pool.request()
            .input('MaNV', sql.VarChar, MaNV)
            .query(`SELECT n.*, t.MaTK, v.MaVaiTro AS MaVaiTroTheoChucVu, ${HOSO_SELECT}
                    FROM NhanVien n
                    LEFT JOIN TaiKhoan t ON t.MaNV = n.MaNV
                    LEFT JOIN VaiTro v ON v.TenVaiTro = n.ChucVu
                    LEFT JOIN HoSoNhanVien hs ON hs.MaNV = n.MaNV
                    WHERE n.MaNV = @MaNV`);
        if (checkNV.recordset.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy nhân viên!' });
        }
        const existing = checkNV.recordset[0];
        if (existing.MaTK) {
            return res.status(400).json({ message: 'Nhân viên này đã có tài khoản!' });
        }
        if (existing.TrangThai !== 'Đang làm việc') {
            return res.status(400).json({ message: 'Chỉ có thể tạo tài khoản cho nhân viên đang làm việc.' });
        }
        if (Number(existing.MaVaiTroTheoChucVu) !== MaVaiTro) {
            return res.status(400).json({ message: `Vai trò phải khớp với chức vụ ${existing.ChucVu}.` });
        }

        // Check nếu tên đăng nhập bị trùng
        const checkUsername = await pool.request()
            .input('TenDangNhap', sql.VarChar, TenDangNhap)
            .query('SELECT MaTK FROM TaiKhoan WHERE TenDangNhap = @TenDangNhap');
        if (checkUsername.recordset.length > 0) {
            return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại!' });
        }

        const coreKeys = ['TenNV', 'CCCD', 'NgaySinh', 'GioiTinh', 'SDT', 'Email', 'DiaChi', 'NgayVaoLam', 'DiaChiThuongTru'];
        const postedProfile = {};
        for (const key of [...coreKeys, ...PROFILE_KEYS]) {
            if (Object.prototype.hasOwnProperty.call(req.body, key)) postedProfile[key] = req.body[key];
        }
        if (req.body.HoSo && typeof req.body.HoSo === 'object') postedProfile.HoSo = req.body.HoSo;
        const corePosted = coreKeys.some((key) => Object.prototype.hasOwnProperty.call(req.body, key));
        let profileUpdate = null;
        if (hasProfileInput(req.body) || corePosted) {
            const merged = {
                ...existing,
                NgaySinh: toIsoDate(existing.NgaySinh) || existing.NgaySinh,
                NgayVaoLam: toIsoDate(existing.NgayVaoLam) || existing.NgayVaoLam,
                NgayCapCCCD: toIsoDate(existing.NgayCapCCCD) || existing.NgayCapCCCD,
                ...postedProfile,
                MaNV,
                ChucVu: existing.ChucVu,
                TrangThai: existing.TrangThai
            };
            const validation = await validateEmployeeInput(pool, merged, { excludeMaNV: MaNV, strictCreate: false });
            if (validation.error) {
                return res.status(400).json({ message: validation.error });
            }
            profileUpdate = validation;
        }

        // Tạo mật khẩu mặc định '123'
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123', salt);

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        let newMaTK;
        try {
            if (profileUpdate) {
                await bindEmployeeFields(new sql.Request(transaction).input('MaNV', sql.VarChar, MaNV), profileUpdate.employee)
                    .query(`UPDATE NhanVien
                            SET TenNV = @TenNV, ChucVu = @ChucVu, CCCD = @CCCD, NgaySinh = @NgaySinh,
                                GioiTinh = @GioiTinh, SDT = @SDT, Email = @Email, DiaChi = @DiaChi,
                                NgayVaoLam = @NgayVaoLam, TrangThai = @TrangThai
                            WHERE MaNV = @MaNV`);
                await upsertEmployeeProfile(transaction, MaNV, profileUpdate.profile);
            }
            const result = await new sql.Request(transaction)
                .input('TenDangNhap', sql.VarChar, TenDangNhap)
                .input('MatKhauHash', sql.VarChar, hashedPassword)
                .input('MaNV', sql.VarChar, MaNV)
                .input('MaVaiTro', sql.Int, MaVaiTro)
                .input('TrangThai', sql.TinyInt, 1)
                .query(`INSERT INTO TaiKhoan (TenDangNhap, MatKhauHash, MaNV, MaVaiTro, TrangThai, NgayTao)
                        VALUES (@TenDangNhap, @MatKhauHash, @MaNV, @MaVaiTro, @TrangThai, GETDATE());
                        SELECT SCOPE_IDENTITY() AS NewMaTK;`);
            newMaTK = result.recordset[0].NewMaTK;
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        // Ghi nhật ký
        await logAudit(pool, {
            user: req.user, req, action: 'Tạo tài khoản', table: 'TaiKhoan', recordId: String(newMaTK),
            severity: 'Cảnh báo', content: `Tạo tài khoản ${TenDangNhap} cho nhân viên ${MaNV}. Mật khẩu không được ghi nhật ký.`
        });

        try {
            const { syncMembershipSafe } = require('../services/chatService');
            await syncMembershipSafe(pool, MaNV);
        } catch { /* chat không chặn tạo TK */ }

        res.status(201).json({ message: 'Tạo tài khoản thành công với mật khẩu mặc định là 123' });
    } catch (error) {
        console.error(error);
        if (/UNIQUE KEY|unique index|UX_NhanVien_|UX_HoSoNhanVien_/i.test(error.message || '')) {
            return res.status(400).json({ message: 'Số CCCD, số điện thoại, Email, MST hoặc BHXH đã bị trùng!' });
        }
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Khóa/Mở khóa tài khoản
const toggleAccountStatus = async (req, res) => {
    try {
        const { maTK } = req.params;

        // Không cho phép khóa tài khoản đang đăng nhập
        if (Number(maTK) === Number(req.user.MaTK)) {
            return res.status(400).json({ message: 'Không thể khóa tài khoản đang đăng nhập!' });
        }

        const pool = await poolPromise;

        const account = await pool.request()
            .input('MaTK', sql.Int, maTK)
            .query('SELECT TenDangNhap, TrangThai, MaNV FROM TaiKhoan WHERE MaTK = @MaTK');

        if (account.recordset.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản!' });
        }

        const currentStatus = account.recordset[0].TrangThai;
        const newStatus = currentStatus === 1 ? 0 : 1;
        const username = account.recordset[0].TenDangNhap;
        const actionStr = newStatus === 1 ? 'Mở khóa' : 'Khóa';

        await pool.request()
            .input('MaTK', sql.Int, maTK)
            .input('TrangThai', sql.TinyInt, newStatus)
            .query('UPDATE TaiKhoan SET TrangThai = @TrangThai WHERE MaTK = @MaTK');

        // Ghi nhật ký
        await logAudit(pool, {
            user: req.user, req, action: `${actionStr} tài khoản`, table: 'TaiKhoan', recordId: String(maTK),
            severity: 'Cảnh báo', content: `${actionStr} tài khoản ${username}`
        });

        try {
            const { syncMembershipSafe } = require('../services/chatService');
            await syncMembershipSafe(pool, account.recordset[0].MaNV);
        } catch { /* chat không chặn khóa TK */ }

        res.json({ message: `${actionStr} tài khoản thành công!` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Đặt lại mật khẩu
const resetPassword = async (req, res) => {
    try {
        const { maTK } = req.params;
        const pool = await poolPromise;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123', salt);

        const account = await pool.request()
            .input('MaTK', sql.Int, maTK)
            .query('SELECT TenDangNhap FROM TaiKhoan WHERE MaTK = @MaTK');

        if (account.recordset.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản!' });
        }

        await pool.request()
            .input('MaTK', sql.Int, maTK)
            .input('MatKhauHash', sql.VarChar, hashedPassword)
            .query('UPDATE TaiKhoan SET MatKhauHash = @MatKhauHash WHERE MaTK = @MaTK');

        // Ghi nhật ký
        await logAudit(pool, {
            user: req.user, req, action: 'Đặt lại mật khẩu', table: 'TaiKhoan', recordId: String(maTK),
            severity: 'Cảnh báo', content: `Đặt lại mật khẩu cho tài khoản ${account.recordset[0].TenDangNhap}. Mật khẩu không được ghi nhật ký.`
        });

        res.json({ message: 'Đặt lại mật khẩu thành công (mặc định: 123)' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Cập nhật vai trò
const updateAccountRole = async (req, res) => {
    try {
        const { maTK } = req.params;
        const MaVaiTro = Number(req.body.MaVaiTro);

        if (!Number.isInteger(MaVaiTro)) {
            return res.status(400).json({ message: 'Vui lòng chọn vai trò!' });
        }

        // Không cho admin tự đổi vai trò của chính mình để tránh mất quyền
        if (Number(maTK) === Number(req.user.MaTK)) {
            return res.status(400).json({ message: 'Không thể tự đổi vai trò của chính mình!' });
        }

        const pool = await poolPromise;
        const role = await pool.request()
            .input('MaVaiTro', sql.Int, MaVaiTro)
            .query('SELECT TenVaiTro FROM VaiTro WHERE MaVaiTro = @MaVaiTro');
        if (role.recordset.length === 0) {
            return res.status(400).json({ message: 'Vai trò không hợp lệ!' });
        }
        if (role.recordset[0].TenVaiTro === 'Quản lý') {
            const managerCount = await pool.request()
                .input('MaTK', sql.Int, Number(maTK) || 0)
                .query(`SELECT COUNT(*) AS Total
                        FROM TaiKhoan t
                        JOIN VaiTro v ON v.MaVaiTro = t.MaVaiTro
                        WHERE v.TenVaiTro = N'Quản lý' AND t.MaTK <> @MaTK`);
            if (managerCount.recordset[0].Total > 0) {
                return res.status(400).json({ message: 'Hệ thống chỉ có một tài khoản Quản lý.' });
            }
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        let account;
        try {
            account = await new sql.Request(transaction)
                .input('MaTK', sql.Int, maTK)
                .query('SELECT MaNV FROM TaiKhoan WHERE MaTK = @MaTK');
            if (account.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ message: 'Không tìm thấy tài khoản!' });
            }

            await new sql.Request(transaction)
                .input('MaTK', sql.Int, maTK)
                .input('MaVaiTro', sql.Int, MaVaiTro)
                .query('UPDATE TaiKhoan SET MaVaiTro = @MaVaiTro WHERE MaTK = @MaTK');

            // Đồng bộ chức vụ để một nhân viên không bị gắn hai actor khác nhau.
            await new sql.Request(transaction)
                .input('MaNV', sql.VarChar, account.recordset[0].MaNV)
                .input('ChucVu', sql.NVarChar, role.recordset[0].TenVaiTro)
                .query('UPDATE NhanVien SET ChucVu = @ChucVu WHERE MaNV = @MaNV');

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        // Ghi nhật ký
        await logAudit(pool, {
            user: req.user, req, action: 'Đổi vai trò', table: 'TaiKhoan', recordId: String(maTK),
            severity: 'Quan trọng', content: `Cập nhật vai trò tài khoản thành ${role.recordset[0].TenVaiTro}`
        });

        try {
            const { syncMembershipSafe } = require('../services/chatService');
            await syncMembershipSafe(pool, account.recordset[0].MaNV);
        } catch { /* chat không chặn đổi vai trò */ }

        res.json({ message: 'Cập nhật vai trò thành công!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Lấy nhật ký hệ thống
// Lấy nhật ký hệ thống (chỉ Quản lý — đã chặn ở router)
const getAuditLogs = async (req, res) => {
    try {
        const data = await listAuditLogs(req.query);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Không thể tải nhật ký hệ thống.' });
    }
};

const getAuditFilters = async (_req, res) => {
    try {
        res.json(await listAuditFilters());
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải bộ lọc nhật ký.' });
    }
};

const exportAuditLogs = async (req, res) => {
    try {
        const data = await listAuditLogs({ ...req.query, page: 1, pageSize: 500 });
        const header = ['Thời gian', 'Người', 'Vai trò', 'Việc làm', 'Chứng từ', 'Kết quả', 'Giải thích', 'Chi tiết'];
        const lines = [header.join(',')];
        const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
        for (const row of data.items) {
            lines.push([
                row.ThoiGian ? new Date(row.ThoiGian).toISOString() : '',
                row.TenNV || row.TenDangNhap || '',
                row.TenVaiTro || '',
                row.viecLam || row.HanhDong || '',
                row.doiTuongMa || '',
                row.ketQuaHienThi || '',
                row.giaiThich || '',
                row.NoiDung || ''
            ].map(csv).join(','));
        }
        const body = '\uFEFF' + lines.join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="nhat-ky-he-thong.csv"');
        res.send(body);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể xuất nhật ký.' });
    }
};

module.exports = {
    getAccounts,
    createAccount,
    toggleAccountStatus,
    resetPassword,
    updateAccountRole,
    getAuditLogs,
    getAuditFilters,
    exportAuditLogs
};
