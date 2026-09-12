let schemaReady = false;
let schemaPromise = null;

const run = (connection, text) => {
    if (!connection || typeof connection.request !== 'function') {
        throw new Error('Telegram schema: thiếu connection');
    }
    return connection.request().query(text);
};

const isMissingNgoonNguColumn = (error) => {
    const msg = String(error?.message || error || '');
    return /invalid column name\s*['[]?NgoonNgu[\]']?/i.test(msg);
};

const resetTelegramSchemaCache = () => {
    schemaReady = false;
    schemaPromise = null;
};

const ensureTelegramSchema = async (connection) => {
    if (!connection) return;
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await run(connection, `
            IF OBJECT_ID(N'dbo.TelegramDangKy', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.TelegramDangKy (
                    MaNV            VARCHAR(20)  NOT NULL,
                    ChatId          VARCHAR(32)  NULL,
                    MaTK            INT          NULL,
                    Bat             BIT          NOT NULL CONSTRAINT DF_TelegramDangKy_Bat DEFAULT (1),
                    NgayDangKy      DATETIME     NOT NULL CONSTRAINT DF_TelegramDangKy_NgayDangKy DEFAULT (GETDATE()),
                    NgayXacThuc     DATETIME     NULL,
                    LanHoatDongCuoi DATETIME     NULL,
                    MaOTP           VARCHAR(6)   NULL,
                    HetHanOTP       DATETIME     NULL,
                    SoLanSai        INT          NOT NULL CONSTRAINT DF_TelegramDangKy_SoLanSai DEFAULT (0),
                    NgoonNgu        NVARCHAR(8)  NULL CONSTRAINT DF_TelegramDangKy_NgoonNgu DEFAULT (N'vi'),
                    CONSTRAINT PK_TelegramDangKy PRIMARY KEY (MaNV)
                );
            END`);
        await run(connection, `
            IF COL_LENGTH('TelegramDangKy','NgoonNgu') IS NULL
                ALTER TABLE dbo.TelegramDangKy ADD NgoonNgu NVARCHAR(8) NULL
                    CONSTRAINT DF_TelegramDangKy_NgoonNgu DEFAULT (N'vi');`);
        await run(connection, `
            IF COL_LENGTH('TelegramDangKy','NgoonNgu') IS NOT NULL
                UPDATE dbo.TelegramDangKy SET NgoonNgu = N'vi' WHERE NgoonNgu IS NULL;`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.TelegramDangKy', N'U') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'UX_TelegramDangKy_ChatId'
                      AND object_id = OBJECT_ID(N'dbo.TelegramDangKy')
               )
                CREATE UNIQUE INDEX UX_TelegramDangKy_ChatId
                    ON dbo.TelegramDangKy (ChatId)
                    WHERE ChatId IS NOT NULL;`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.TelegramDangKy', N'U') IS NOT NULL
               AND EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'dbo.TelegramDangKy')
                      AND name = N'MaOTP'
                      AND system_type_id = TYPE_ID(N'char')
               )
                ALTER TABLE dbo.TelegramDangKy ALTER COLUMN MaOTP VARCHAR(6) NULL;`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.TelegramPushLog', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.TelegramPushLog (
                    LoaiSuKien  NVARCHAR(50) NOT NULL,
                    MaChungTu   VARCHAR(50)  NOT NULL,
                    LanGuiCuoi  DATETIME     NOT NULL CONSTRAINT DF_TelegramPushLog_LanGuiCuoi DEFAULT (GETDATE()),
                    CONSTRAINT PK_TelegramPushLog PRIMARY KEY (LoaiSuKien, MaChungTu)
                );
            END`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.TelegramCardMsg', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.TelegramCardMsg (
                    LoaiSuKien  NVARCHAR(50) NOT NULL,
                    MaChungTu   VARCHAR(50)  NOT NULL,
                    ChatId      VARCHAR(32)  NOT NULL,
                    MessageId   BIGINT       NOT NULL,
                    NgayCapNhat DATETIME     NOT NULL CONSTRAINT DF_TelegramCardMsg_NgayCapNhat DEFAULT (GETDATE()),
                    CONSTRAINT PK_TelegramCardMsg PRIMARY KEY (LoaiSuKien, MaChungTu, ChatId)
                );
            END`);
        schemaReady = true;
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

module.exports = {
    ensureTelegramSchema,
    resetTelegramSchemaCache,
    isMissingNgoonNguColumn
};
