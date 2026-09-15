'use strict';

let schemaReady = false;
let schemaPromise = null;

const run = (connection, text) => {
    if (!connection) throw new Error('Thiếu kết nối CSDL thông báo.');
    if (typeof connection.request === 'function') return connection.request().query(text);
    const { sql } = require('../config/db');
    return new sql.Request(connection).query(text);
};

const runSafe = async (connection, text, label) => {
    try {
        await run(connection, text);
    } catch (error) {
        console.warn(`${label}: ${error.message}`);
    }
};

const ensureNotifySchema = async connection => {
    if (!connection || schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await run(connection, `
            IF OBJECT_ID(N'dbo.ThongBaoSuKien', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.ThongBaoSuKien (
                    MaSuKien BIGINT IDENTITY(1,1) NOT NULL,
                    EventKey VARCHAR(100) NOT NULL,
                    EntityType VARCHAR(80) NULL,
                    EntityId VARCHAR(100) NULL,
                    IdempotencyKey VARCHAR(200) NOT NULL,
                    Title NVARCHAR(200) NOT NULL,
                    Detail NVARCHAR(1000) NULL,
                    Tone VARCHAR(20) NOT NULL CONSTRAINT DF_ThongBaoSuKien_Tone DEFAULT ('info'),
                    Target VARCHAR(200) NULL,
                    ActorMaNV VARCHAR(20) NULL,
                    PayloadJson NVARCHAR(MAX) NULL,
                    NgayTao DATETIME2(3) NOT NULL CONSTRAINT DF_ThongBaoSuKien_NgayTao DEFAULT SYSUTCDATETIME(),
                    CONSTRAINT PK_ThongBaoSuKien PRIMARY KEY (MaSuKien)
                );
            END

            IF OBJECT_ID(N'dbo.ThongBaoNguoiNhan', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.ThongBaoNguoiNhan (
                    MaNhan BIGINT IDENTITY(1,1) NOT NULL,
                    MaSuKien BIGINT NOT NULL,
                    MaNV VARCHAR(20) NOT NULL,
                    DaGuiSocket BIT NOT NULL CONSTRAINT DF_ThongBaoNguoiNhan_DaGui DEFAULT (0),
                    DaDoc BIT NOT NULL CONSTRAINT DF_ThongBaoNguoiNhan_DaDoc DEFAULT (0),
                    NgayDoc DATETIME2(3) NULL,
                    DaAn BIT NOT NULL CONSTRAINT DF_ThongBaoNguoiNhan_DaAn DEFAULT (0),
                    NgayTao DATETIME2(3) NOT NULL CONSTRAINT DF_ThongBaoNguoiNhan_NgayTao DEFAULT SYSUTCDATETIME(),
                    CONSTRAINT PK_ThongBaoNguoiNhan PRIMARY KEY (MaNhan)
                );
            END

            IF OBJECT_ID(N'dbo.ThongBaoDaDoc', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.ThongBaoDaDoc (
                    MaNV VARCHAR(20) NOT NULL,
                    NotificationKey VARCHAR(220) NOT NULL,
                    NgayDoc DATETIME2(3) NOT NULL CONSTRAINT DF_ThongBaoDaDoc_NgayDoc DEFAULT SYSUTCDATETIME(),
                    CONSTRAINT PK_ThongBaoDaDoc PRIMARY KEY (MaNV, NotificationKey)
                );
            END`);

        await run(connection, `
            IF OBJECT_ID(N'dbo.ThongBaoSuKien', N'U') IS NOT NULL
               AND COL_LENGTH(N'dbo.ThongBaoSuKien', N'IdempotencyKey') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE object_id = OBJECT_ID(N'dbo.ThongBaoSuKien')
                      AND name = N'UX_ThongBaoSuKien_Idempotency'
               )
                CREATE UNIQUE INDEX UX_ThongBaoSuKien_Idempotency
                    ON dbo.ThongBaoSuKien (IdempotencyKey);

            IF OBJECT_ID(N'dbo.ThongBaoSuKien', N'U') IS NOT NULL
               AND COL_LENGTH(N'dbo.ThongBaoSuKien', N'EventKey') IS NOT NULL
               AND COL_LENGTH(N'dbo.ThongBaoSuKien', N'NgayTao') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE object_id = OBJECT_ID(N'dbo.ThongBaoSuKien')
                      AND name = N'IX_ThongBaoSuKien_Event_Ngay'
               )
                CREATE INDEX IX_ThongBaoSuKien_Event_Ngay
                    ON dbo.ThongBaoSuKien (EventKey, NgayTao DESC);

            IF OBJECT_ID(N'dbo.ThongBaoNguoiNhan', N'U') IS NOT NULL
               AND COL_LENGTH(N'dbo.ThongBaoNguoiNhan', N'MaSuKien') IS NOT NULL
               AND COL_LENGTH(N'dbo.ThongBaoNguoiNhan', N'MaNV') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE object_id = OBJECT_ID(N'dbo.ThongBaoNguoiNhan')
                      AND name = N'UX_ThongBaoNguoiNhan_SuKien_NV'
               )
                CREATE UNIQUE INDEX UX_ThongBaoNguoiNhan_SuKien_NV
                    ON dbo.ThongBaoNguoiNhan (MaSuKien, MaNV);

            IF OBJECT_ID(N'dbo.ThongBaoNguoiNhan', N'U') IS NOT NULL
               AND COL_LENGTH(N'dbo.ThongBaoNguoiNhan', N'MaNV') IS NOT NULL
               AND COL_LENGTH(N'dbo.ThongBaoNguoiNhan', N'DaDoc') IS NOT NULL
               AND COL_LENGTH(N'dbo.ThongBaoNguoiNhan', N'DaAn') IS NOT NULL
               AND COL_LENGTH(N'dbo.ThongBaoNguoiNhan', N'NgayTao') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE object_id = OBJECT_ID(N'dbo.ThongBaoNguoiNhan')
                      AND name = N'IX_ThongBaoNguoiNhan_Inbox'
               )
                CREATE INDEX IX_ThongBaoNguoiNhan_Inbox
                    ON dbo.ThongBaoNguoiNhan (MaNV, DaAn, DaDoc, NgayTao DESC);`);

        await runSafe(connection, `
            IF OBJECT_ID(N'dbo.NhanVien', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.ThongBaoDaDoc', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.FK_ThongBaoDaDoc_NhanVien', N'F') IS NULL
               AND EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'dbo.NhanVien')
                      AND name = N'MaNV' AND system_type_id = 167 AND max_length = 20
               )
                ALTER TABLE dbo.ThongBaoDaDoc
                    ADD CONSTRAINT FK_ThongBaoDaDoc_NhanVien
                    FOREIGN KEY (MaNV) REFERENCES dbo.NhanVien (MaNV);`,
        'FK_ThongBaoDaDoc_NhanVien');

        await runSafe(connection, `
            IF OBJECT_ID(N'dbo.ThongBaoNguoiNhan', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.ThongBaoSuKien', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.FK_ThongBaoNguoiNhan_SuKien', N'F') IS NULL
               AND EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'dbo.ThongBaoNguoiNhan')
                      AND name = N'MaSuKien' AND system_type_id = 127
               )
               AND EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'dbo.ThongBaoSuKien')
                      AND name = N'MaSuKien' AND system_type_id = 127
               )
                ALTER TABLE dbo.ThongBaoNguoiNhan
                    ADD CONSTRAINT FK_ThongBaoNguoiNhan_SuKien
                    FOREIGN KEY (MaSuKien) REFERENCES dbo.ThongBaoSuKien (MaSuKien);`,
        'FK_ThongBaoNguoiNhan_SuKien');

        await runSafe(connection, `
            IF OBJECT_ID(N'dbo.NhanVien', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.ThongBaoNguoiNhan', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.FK_ThongBaoNguoiNhan_NhanVien', N'F') IS NULL
               AND EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'dbo.NhanVien')
                      AND name = N'MaNV' AND system_type_id = 167 AND max_length = 20
               )
               AND EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'dbo.ThongBaoNguoiNhan')
                      AND name = N'MaNV' AND system_type_id = 167 AND max_length = 20
               )
                ALTER TABLE dbo.ThongBaoNguoiNhan
                    ADD CONSTRAINT FK_ThongBaoNguoiNhan_NhanVien
                    FOREIGN KEY (MaNV) REFERENCES dbo.NhanVien (MaNV);`,
        'FK_ThongBaoNguoiNhan_NhanVien');

        await runSafe(connection, `
            IF OBJECT_ID(N'dbo.NhanVien', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.ThongBaoSuKien', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.FK_ThongBaoSuKien_Actor', N'F') IS NULL
               AND EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'dbo.NhanVien')
                      AND name = N'MaNV' AND system_type_id = 167 AND max_length = 20
               )
               AND EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'dbo.ThongBaoSuKien')
                      AND name = N'ActorMaNV' AND system_type_id = 167 AND max_length = 20
               )
                ALTER TABLE dbo.ThongBaoSuKien
                    ADD CONSTRAINT FK_ThongBaoSuKien_Actor
                    FOREIGN KEY (ActorMaNV) REFERENCES dbo.NhanVien (MaNV);`,
        'FK_ThongBaoSuKien_Actor');

        schemaReady = true;
    })().catch(error => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

const resetNotifySchemaForTests = () => {
    schemaReady = false;
    schemaPromise = null;
};

module.exports = {
    ensureNotifySchema,
    resetNotifySchemaForTests
};
