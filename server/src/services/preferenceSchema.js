'use strict';

let schemaReady = false;
let schemaPromise = null;

const run = (connection, text) => {
    if (!connection || typeof connection.request !== 'function') {
        throw new Error('Preference schema: thiếu connection');
    }
    return connection.request().query(text);
};

const resetPreferenceSchemaCache = () => {
    schemaReady = false;
    schemaPromise = null;
};

const ensurePreferenceSchema = async (connection) => {
    if (!connection) return;
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await run(connection, `
            IF COL_LENGTH(N'dbo.TaiKhoan', N'NgonNgu') IS NULL
                ALTER TABLE dbo.TaiKhoan ADD NgonNgu VARCHAR(8) NULL;`);
        await run(connection, `
            IF COL_LENGTH(N'dbo.TaiKhoan', N'GiaoDien') IS NULL
                ALTER TABLE dbo.TaiKhoan ADD GiaoDien VARCHAR(16) NULL;`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.CauHinhCuaHang', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.CauHinhCuaHang (
                    MaCauHinh VARCHAR(40)  NOT NULL,
                    GiaTri    NVARCHAR(80) NOT NULL,
                    CONSTRAINT PK_CauHinhCuaHang PRIMARY KEY (MaCauHinh)
                );
            END`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.CauHinhCuaHang', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM dbo.CauHinhCuaHang WHERE MaCauHinh = N'NgonNguMacDinh')
                INSERT INTO dbo.CauHinhCuaHang (MaCauHinh, GiaTri) VALUES (N'NgonNguMacDinh', N'vi');`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.CauHinhCuaHang', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM dbo.CauHinhCuaHang WHERE MaCauHinh = N'GiaoDienMacDinh')
                INSERT INTO dbo.CauHinhCuaHang (MaCauHinh, GiaTri) VALUES (N'GiaoDienMacDinh', N'light');`);
        schemaReady = true;
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

module.exports = {
    ensurePreferenceSchema,
    resetPreferenceSchemaCache
};
