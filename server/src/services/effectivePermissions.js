'use strict';

const { sql } = require('../config/db');
const {
    FUNCTION_CATALOG,
    MANAGER_FIXED_PERMISSION_CODES,
    ROLE_PERMISSION_CODES
} = require('../constants/permissions');

const foldRole = (value) => String(value || '').trim().toLocaleLowerCase('vi-VN');

let schemaReady = false;
let schemaPromise = null;

const run = (connection, text) => {
    if (!connection) throw new Error('Thiếu kết nối CSDL phân quyền.');
    return new sql.Request(connection).query(text);
};

const codesFromRoleName = (tenVaiTro) => {
    const listed = ROLE_PERMISSION_CODES[foldRole(tenVaiTro)] || [];
    return [...new Set(listed.map((code) => String(code).trim()).filter(Boolean))];
};

const uniqueCodes = (codes) => [...new Set((codes || []).map((code) => String(code || '').trim()).filter(Boolean))];

const sameSet = (a, b) => {
    const left = uniqueCodes(a).sort();
    const right = uniqueCodes(b).sort();
    return left.length === right.length && left.every((code, index) => code === right[index]);
};

const runSafe = async (connection, text, label) => {
    try {
        await run(connection, text);
    } catch (error) {
        console.warn(label || 'NhanVien_ChucNang schema:', error.message);
    }
};

const ensureEmployeePermissionSchema = async (connection) => {
    if (!connection) return;
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await run(connection, `
            IF OBJECT_ID(N'dbo.NhanVien_ChucNang', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.NhanVien_ChucNang (
                    MaNV        VARCHAR(20) NOT NULL,
                    MaChucNang  VARCHAR(20) NOT NULL,
                    DuocPhep    BIT         NOT NULL CONSTRAINT DF_NVCN_Phep DEFAULT (1),
                    NgayCapNhat DATETIME    NOT NULL CONSTRAINT DF_NVCN_Ngay DEFAULT GETDATE(),
                    CONSTRAINT PK_NhanVien_ChucNang PRIMARY KEY (MaNV, MaChucNang)
                );
            END`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.NhanVien_ChucNang', N'U') IS NOT NULL
               AND EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'dbo.NhanVien_ChucNang')
                      AND name = N'MaChucNang' AND max_length < 20 AND system_type_id = 167
               )
            BEGIN
                DECLARE @fk NVARCHAR(200);
                SELECT @fk = N'ALTER TABLE dbo.NhanVien_ChucNang DROP CONSTRAINT [' + fk.name + N'];'
                FROM sys.foreign_keys fk
                WHERE fk.parent_object_id = OBJECT_ID(N'dbo.NhanVien_ChucNang');
                WHILE @fk IS NOT NULL
                BEGIN
                    EXEC sp_executesql @fk;
                    SET @fk = NULL;
                    SELECT @fk = N'ALTER TABLE dbo.NhanVien_ChucNang DROP CONSTRAINT [' + fk.name + N'];'
                    FROM sys.foreign_keys fk
                    WHERE fk.parent_object_id = OBJECT_ID(N'dbo.NhanVien_ChucNang');
                END
                DECLARE @pk SYSNAME;
                SELECT @pk = kc.name FROM sys.key_constraints kc
                WHERE kc.parent_object_id = OBJECT_ID(N'dbo.NhanVien_ChucNang') AND kc.[type] = 'PK';
                IF @pk IS NOT NULL
                    EXEC(N'ALTER TABLE dbo.NhanVien_ChucNang DROP CONSTRAINT [' + @pk + N']');
                ALTER TABLE dbo.NhanVien_ChucNang ALTER COLUMN MaChucNang VARCHAR(20) NOT NULL;
                ALTER TABLE dbo.NhanVien_ChucNang ADD CONSTRAINT PK_NhanVien_ChucNang PRIMARY KEY (MaNV, MaChucNang);
            END`);
        await runSafe(connection, `
            IF OBJECT_ID(N'dbo.NhanVien_ChucNang', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.NhanVien', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_NVCN_NhanVien')
                ALTER TABLE dbo.NhanVien_ChucNang ADD CONSTRAINT FK_NVCN_NhanVien
                    FOREIGN KEY (MaNV) REFERENCES dbo.NhanVien (MaNV);`, 'FK_NVCN_NhanVien');
        await runSafe(connection, `
            IF OBJECT_ID(N'dbo.NhanVien_ChucNang', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.ChucNang', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_NVCN_ChucNang')
                ALTER TABLE dbo.NhanVien_ChucNang ADD CONSTRAINT FK_NVCN_ChucNang
                    FOREIGN KEY (MaChucNang) REFERENCES dbo.ChucNang (MaChucNang);`, 'FK_NVCN_ChucNang');
        schemaReady = true;
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

const requestOf = (connection) => new sql.Request(connection);

const loadRoleCodesFromDb = async (pool, maVaiTro) => {
    if (!pool || !maVaiTro) return [];
    const result = await requestOf(pool)
        .input('MaVaiTro', sql.Int, Number(maVaiTro))
        .query(`SELECT MaChucNang FROM dbo.VaiTro_ChucNang
                WHERE MaVaiTro = @MaVaiTro AND DuocPhep = 1
                ORDER BY MaChucNang`);
    return uniqueCodes(result.recordset.map((row) => row.MaChucNang));
};

const loadOverrideCodes = async (pool, maNV) => {
    if (!pool || !maNV) return null;
    await ensureEmployeePermissionSchema(pool);
    const result = await requestOf(pool)
        .input('MaNV', sql.VarChar, String(maNV))
        .query(`SELECT MaChucNang FROM dbo.NhanVien_ChucNang
                WHERE MaNV = @MaNV AND DuocPhep = 1
                ORDER BY MaChucNang`);
    if (!result.recordset.length) return null;
    return uniqueCodes(result.recordset.map((row) => row.MaChucNang));
};

const mergeEffective = ({ roleCodes, overrideCodes, tenVaiTro }) => {
    const role = uniqueCodes(roleCodes);
    if (foldRole(tenVaiTro) === 'quản lý') {
        return uniqueCodes([...role, ...MANAGER_FIXED_PERMISSION_CODES]);
    }
    if (Array.isArray(overrideCodes) && overrideCodes.length) return uniqueCodes(overrideCodes);
    return role;
};

const loadEffectiveCodes = async (pool, user = {}) => {
    const tenVaiTro = user.TenVaiTro;
    const fallback = codesFromRoleName(tenVaiTro);
    try {
        if (pool) await ensureEmployeePermissionSchema(pool);
        let roleCodes = fallback;
        if (pool && user.MaVaiTro) {
            const fromDb = await loadRoleCodesFromDb(pool, user.MaVaiTro);
            if (fromDb.length) roleCodes = fromDb;
        }
        const overrideCodes = pool && user.MaNV ? await loadOverrideCodes(pool, user.MaNV) : null;
        return mergeEffective({ roleCodes, overrideCodes, tenVaiTro });
    } catch {
        return fallback;
    }
};

const attachEffectivePermissions = async (pool, user = {}) => {
    if (Array.isArray(user.Quyen) && user.Quyen.length) return user;
    user.Quyen = await loadEffectiveCodes(pool, user);
    return user;
};

const codesOf = (user) => {
    if (Array.isArray(user?.Quyen) && user.Quyen.length) return uniqueCodes(user.Quyen);
    return codesFromRoleName(user?.TenVaiTro);
};

const hasUc = (user, code) => codesOf(user).includes(String(code || '').trim());

const saveEmployeeOverrides = async (transaction, { maNV, codes, roleCodes }) => {
    const granted = uniqueCodes(codes);
    await new sql.Request(transaction)
        .input('MaNV', sql.VarChar, String(maNV))
        .query('DELETE FROM dbo.NhanVien_ChucNang WHERE MaNV = @MaNV');
    if (sameSet(granted, roleCodes)) return { cheDo: 'TheoVaiTro', codes: roleCodes };
    for (const code of granted) {
        await new sql.Request(transaction)
            .input('MaNV', sql.VarChar, String(maNV))
            .input('MaChucNang', sql.VarChar, code)
            .query(`INSERT INTO dbo.NhanVien_ChucNang (MaNV, MaChucNang, DuocPhep)
                    VALUES (@MaNV, @MaChucNang, 1)`);
    }
    return { cheDo: 'TuyChinh', codes: granted };
};

const clearEmployeeOverrides = async (connection, maNV) => {
    await new sql.Request(connection)
        .input('MaNV', sql.VarChar, String(maNV))
        .query('DELETE FROM dbo.NhanVien_ChucNang WHERE MaNV = @MaNV');
};

const permissionSqlFilter = (request, { maNV, maVaiTro, codes }) => {
    const list = uniqueCodes(codes);
    const placeholders = list.map((code, index) => {
        const name = `MaChucNang${index}`;
        request.input(name, sql.VarChar, code);
        return `@${name}`;
    });
    request.input('MaNV_Quyen', sql.VarChar, String(maNV || ''));
    request.input('MaVaiTro_Quyen', sql.Int, Number(maVaiTro) || 0);
    const inList = placeholders.join(', ') || `N''`;
    return `
        SELECT TOP 1 1 AS DuocPhep
        WHERE EXISTS (
            SELECT 1 FROM dbo.NhanVien_ChucNang
            WHERE MaNV = @MaNV_Quyen AND DuocPhep = 1 AND MaChucNang IN (${inList})
        )
        OR (
            NOT EXISTS (SELECT 1 FROM dbo.NhanVien_ChucNang WHERE MaNV = @MaNV_Quyen)
            AND EXISTS (
                SELECT 1 FROM dbo.VaiTro_ChucNang
                WHERE MaVaiTro = @MaVaiTro_Quyen AND DuocPhep = 1 AND MaChucNang IN (${inList})
            )
        )`;
};

module.exports = {
    FUNCTION_CATALOG,
    MANAGER_FIXED_PERMISSION_CODES,
    ROLE_PERMISSION_CODES,
    foldRole,
    codesFromRoleName,
    uniqueCodes,
    sameSet,
    ensureEmployeePermissionSchema,
    loadRoleCodesFromDb,
    loadOverrideCodes,
    mergeEffective,
    loadEffectiveCodes,
    attachEffectivePermissions,
    codesOf,
    hasUc,
    saveEmployeeOverrides,
    clearEmployeeOverrides,
    permissionSqlFilter
};
