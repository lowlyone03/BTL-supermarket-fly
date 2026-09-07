const { sql } = require('../config/db');

let schemaReady = false;
let schemaPromise = null;

const run = (connection, text) => (
    connection && typeof connection.request === 'function'
        ? connection.request()
        : new sql.Request(connection)
).query(text);

const ensurePhieuThuSchema = async (connection) => {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await run(connection, `
            DECLARE @sql nvarchar(max) = N'';
            SELECT @sql = @sql + N'ALTER TABLE dbo.PhieuThu DROP CONSTRAINT ' + QUOTENAME(cc.name) + N';'
            FROM sys.check_constraints cc
            WHERE cc.parent_object_id = OBJECT_ID(N'dbo.PhieuThu')
              AND cc.name <> N'CK_PhieuThu_1'
              AND (
                    cc.definition LIKE N'%SoTienTheoHeThong%'
                 OR cc.definition LIKE N'%SoTienThucNop%'
              )
              AND (
                    cc.definition LIKE N'%(0)%'
                 OR cc.definition LIKE N'%>%='
              );
            IF @sql <> N'' EXEC sp_executesql @sql;`);
        schemaReady = true;
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

module.exports = { ensurePhieuThuSchema };
