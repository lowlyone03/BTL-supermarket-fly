const { sql } = require('../config/db');

let schemaReady = false;
let schemaPromise = null;

const run = (connection, text) => new sql.Request(connection).query(text);

const ensureCountScrapSchema = async (connection) => {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await run(connection, `
            IF COL_LENGTH('dbo.PhieuXuat','MaKK') IS NULL
                ALTER TABLE dbo.PhieuXuat ADD MaKK VARCHAR(20) NULL;`);
        await run(connection, `
            IF COL_LENGTH('dbo.PhieuXuat','MaKK') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PhieuXuat_MaKK')
                ALTER TABLE dbo.PhieuXuat ADD CONSTRAINT FK_PhieuXuat_MaKK
                    FOREIGN KEY (MaKK) REFERENCES dbo.KiemKe (MaKK);`);
        await run(connection, `
            IF COL_LENGTH('dbo.PhieuXuat','MaKK') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'UX_PhieuXuat_MaKK_Active' AND object_id = OBJECT_ID(N'dbo.PhieuXuat')
               )
                CREATE UNIQUE INDEX UX_PhieuXuat_MaKK_Active ON dbo.PhieuXuat (MaKK)
                WHERE MaKK IS NOT NULL AND TrangThai IN (N'Nháp', N'Chờ duyệt', N'Đã duyệt', N'Đã xác nhận');`);
        await run(connection, `
            IF COL_LENGTH('dbo.PhieuXuat','MaDT') IS NULL
                ALTER TABLE dbo.PhieuXuat ADD MaDT VARCHAR(20) NULL;`);
        await run(connection, `
            IF COL_LENGTH('dbo.PhieuXuat','MaDT') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PhieuXuat_MaDT')
                ALTER TABLE dbo.PhieuXuat ADD CONSTRAINT FK_PhieuXuat_MaDT
                    FOREIGN KEY (MaDT) REFERENCES dbo.PhieuDoiTra (MaDT);`);
        await run(connection, `
            IF COL_LENGTH('dbo.PhieuXuat','MaDT') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'UX_PhieuXuat_MaDT_Active' AND object_id = OBJECT_ID(N'dbo.PhieuXuat')
               )
                CREATE UNIQUE INDEX UX_PhieuXuat_MaDT_Active ON dbo.PhieuXuat (MaDT)
                WHERE MaDT IS NOT NULL AND TrangThai IN (N'Nháp', N'Chờ duyệt', N'Đã duyệt', N'Đã xác nhận');`);
        await run(connection, `
            IF COL_LENGTH('dbo.PhieuXuat','KhongTruTon') IS NULL
                ALTER TABLE dbo.PhieuXuat ADD KhongTruTon BIT NOT NULL
                    CONSTRAINT DF_PhieuXuat_KhongTruTon DEFAULT 0;`);
        await run(connection, `
            IF COL_LENGTH('dbo.ChiTietKiemKe','SLHong') IS NULL
                ALTER TABLE dbo.ChiTietKiemKe ADD SLHong INT NULL;`);
        schemaReady = true;
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

module.exports = { ensureCountScrapSchema };
