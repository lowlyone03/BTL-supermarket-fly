'use strict';

const { sql } = require('../config/db');

const FOUNDER_USERNAMES = new Set(['admin']);
const FOUNDER_EMPLOYEE_CODES = new Set(['NV_QL01']);

const ROLE_RANK = {
    'quản lý': 50,
    'kế toán': 40,
    'nhân viên mua hàng': 30,
    'thủ kho': 20,
    'thu ngân': 10
};

let schemaReady = false;
let schemaPromise = null;

const foldText = (value) => String(value || '').trim().toLocaleLowerCase('vi-VN');

const truthyFlag = (value) => value === true || value === 1 || Number(value) === 1 || String(value) === '1';

const isManagerRoleName = (value) => foldText(value) === 'quản lý';

const isFounderAccount = (row = {}) => {
    if (truthyFlag(row.IsFounder)) return true;
    const login = String(row.TenDangNhap || '').trim().toLowerCase();
    const maNV = String(row.MaNV || '').trim().toUpperCase();
    return FOUNDER_USERNAMES.has(login) || FOUNDER_EMPLOYEE_CODES.has(maNV);
};

const roleRank = (tenVaiTro) => ROLE_RANK[foldText(tenVaiTro)] || 0;

const roleChangeKind = (fromName, toName) => {
    const from = roleRank(fromName);
    const to = roleRank(toName);
    if (to > from) return 'promote';
    if (to < from) return 'demote';
    return 'lateral';
};

const roleChangeVerdict = ({ target = {}, actor = {}, nextRoleId } = {}) => {
    if (!target.MaTK && !target.HasAccount) {
        return { ok: false, code: 'no-account', message: 'Nhân viên chưa có tài khoản, hãy tạo tài khoản trước khi đổi vai trò.' };
    }
    if (isFounderAccount(target)) {
        return { ok: false, code: 'founder', message: 'Admin gốc không được hạ cấp hay đổi vai trò.' };
    }
    if (actor?.MaTK != null && target.MaTK != null && Number(actor.MaTK) === Number(target.MaTK)) {
        return { ok: false, code: 'self', message: 'Không thể tự đổi vai trò của chính mình.' };
    }
    if (Number.isInteger(nextRoleId) && target.MaVaiTro != null && Number(target.MaVaiTro) === nextRoleId) {
        return { ok: false, code: 'same', message: 'Nhân viên đã ở vai trò này.' };
    }
    return { ok: true, code: 'ok' };
};

const staffRoleFlags = (row = {}) => {
    const founder = isFounderAccount(row);
    const manager = isManagerRoleName(row.TenVaiTro || row.ChucVu);
    const hasAccount = Boolean(row.MaTK || row.HasAccount);
    return {
        IsFounder: founder,
        IsManagerRole: manager,
        IsPromotedManager: manager && !founder,
        HasAccount: hasAccount,
        CanChangeRole: hasAccount && !founder,
        CanEditCodes: hasAccount && !manager,
        RoleLockReason: founder ? 'founder' : (hasAccount ? '' : 'no-account')
    };
};

const run = (connection, text) => {
    if (!connection) throw new Error('Thiếu kết nối CSDL tài khoản gốc.');
    return new sql.Request(connection).query(text);
};

const ensureFounderAccountSchema = async (connection) => {
    if (!connection) return;
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await run(connection, `
            IF COL_LENGTH('dbo.TaiKhoan', 'IsFounder') IS NULL
                ALTER TABLE dbo.TaiKhoan ADD IsFounder BIT NOT NULL CONSTRAINT DF_TaiKhoan_IsFounder DEFAULT (0);
            IF COL_LENGTH('dbo.TaiKhoan', 'MaVaiTroTruoc') IS NULL
                ALTER TABLE dbo.TaiKhoan ADD MaVaiTroTruoc INT NULL;`);
        await run(connection, `
            UPDATE dbo.TaiKhoan
            SET IsFounder = 1
            WHERE ISNULL(IsFounder, 0) = 0
              AND (LOWER(TenDangNhap) = 'admin' OR MaNV = 'NV_QL01');`);
        schemaReady = true;
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

const markKnownFounders = async (connection) => {
    await ensureFounderAccountSchema(connection);
    await run(connection, `
        UPDATE dbo.TaiKhoan
        SET IsFounder = 1
        WHERE LOWER(TenDangNhap) = 'admin' OR MaNV = 'NV_QL01';`);
};

module.exports = {
    FOUNDER_USERNAMES,
    FOUNDER_EMPLOYEE_CODES,
    foldText,
    isManagerRoleName,
    isFounderAccount,
    roleRank,
    roleChangeKind,
    roleChangeVerdict,
    staffRoleFlags,
    ensureFounderAccountSchema,
    markKnownFounders
};
