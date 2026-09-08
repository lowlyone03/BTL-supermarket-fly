const { sql } = require('../config/db');

let schemaReady = false;
let schemaPromise = null;

const run = (connection, text) => new sql.Request(connection).query(text);

const ensureCountSuccessorSchema = async (connection) => {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await run(connection, `
            IF COL_LENGTH('dbo.KiemKe','MaKKGoc') IS NULL
                ALTER TABLE dbo.KiemKe ADD MaKKGoc VARCHAR(20) NULL;`);
        await run(connection, `
            IF COL_LENGTH('dbo.KiemKe','MaKKThayThe') IS NULL
                ALTER TABLE dbo.KiemKe ADD MaKKThayThe VARCHAR(20) NULL;`);
        schemaReady = true;
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

module.exports = { ensureCountSuccessorSchema };
