const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    REPLACE_MREFUND_UNIQUE_SQL
} = require('./src/services/returnRefundSchema');

const test = (name, run) => {
    try {
        const result = run();
        if (result && typeof result.then === 'function') {
            return result.then(() => console.log(`✓ ${name}`)).catch((error) => {
                console.error(`✗ ${name}`);
                throw error;
            });
        }
        console.log(`✓ ${name}`);
        return Promise.resolve();
    } catch (error) {
        console.error(`✗ ${name}`);
        return Promise.reject(error);
    }
};

const inspectMRefundUnique = async (pool) => {
    const result = await pool.request().query(`
        SELECT
            kc.name AS ConstraintName,
            kc.[type] AS ConstraintType,
            i.name AS IndexName,
            i.is_unique AS IsUnique,
            i.is_unique_constraint AS IsUniqueConstraint,
            i.has_filter AS HasFilter,
            i.filter_definition AS FilterDefinition
        FROM sys.indexes i
        LEFT JOIN sys.key_constraints kc
            ON kc.parent_object_id = i.object_id
           AND kc.unique_index_id = i.index_id
           AND kc.[type] = N'UQ'
        WHERE i.object_id = OBJECT_ID(N'dbo.GiaoDichHoan')
          AND (i.name = N'UX_GiaoDichHoan_MRefundId' OR kc.name = N'UX_GiaoDichHoan_MRefundId')`);
    return result.recordset[0] || null;
};

(async () => {
    await test('SQL phân biệt UNIQUE CONSTRAINT vs index thường', () => {
        assert.match(REPLACE_MREFUND_UNIQUE_SQL, /DROP CONSTRAINT UX_GiaoDichHoan_MRefundId/);
        assert.match(REPLACE_MREFUND_UNIQUE_SQL, /sys\.key_constraints/);
        assert.match(REPLACE_MREFUND_UNIQUE_SQL, /is_unique_constraint = 0/);
        assert.doesNotMatch(
            REPLACE_MREFUND_UNIQUE_SQL,
            /DROP INDEX UX_GiaoDichHoan_MRefundId ON dbo\.GiaoDichHoan;\s*END/
        );
        const schemaJs = fs.readFileSync(
            path.join(__dirname, 'src/services/returnRefundSchema.js'), 'utf8'
        );
        assert.doesNotMatch(
            schemaJs.replace(REPLACE_MREFUND_UNIQUE_SQL, ''),
            /DROP INDEX UX_GiaoDichHoan_MRefundId/
        );
    });

    await test('Migration MixedRefund / ZaloPayRefund không DROP INDEX khi còn UNIQUE KEY', () => {
        const mixed = fs.readFileSync(
            path.join(__dirname, 'migrations/SupermarketFly_Migration_20260912_MixedRefundLines.sql'), 'utf8'
        );
        const zalo = fs.readFileSync(
            path.join(__dirname, 'migrations/SupermarketFly_Migration_20260911_ZaloPayRefund.sql'), 'utf8'
        );
        assert.match(mixed, /ALTER TABLE dbo\.GiaoDichHoan DROP CONSTRAINT UX_GiaoDichHoan_MRefundId/);
        assert.match(zalo, /ALTER TABLE dbo\.GiaoDichHoan DROP CONSTRAINT UX_GiaoDichHoan_MRefundId/);
        assert.match(mixed, /is_unique_constraint = 0/);
        assert.match(zalo, /is_unique_constraint = 0/);
        assert.doesNotMatch(zalo, /CONSTRAINT UX_GiaoDichHoan_MRefundId UNIQUE/);
    });

    let poolPromise;
    let ensureReturnRefundSchema;
    let resetReturnRefundSchemaCache;
    try {
        ({ poolPromise } = require('./src/config/db'));
        ({
            ensureReturnRefundSchema,
            resetReturnRefundSchemaCache
        } = require('./src/services/returnRefundSchema'));
        await poolPromise;
    } catch (error) {
        console.log(`↷ DB skip: ${error.message}`);
        console.log('RETURN REFUND SCHEMA PASS (unit).');
        return;
    }

    const pool = await poolPromise;
    try {
        const beforeCount = (await pool.request().query(
            `SELECT COUNT(*) AS So FROM dbo.GiaoDichHoan`
        )).recordset[0].So;

        resetReturnRefundSchemaCache();
        await ensureReturnRefundSchema(pool);
        const after1 = await inspectMRefundUnique(pool);
        assert.ok(after1, 'Phải có UX_GiaoDichHoan_MRefundId sau lần 1');
        assert.equal(Number(after1.IsUniqueConstraint), 0, 'Không còn UNIQUE KEY constraint');
        assert.equal(after1.ConstraintName, null);
        assert.equal(Number(after1.IsUnique), 1);
        assert.equal(Number(after1.HasFilter), 1);
        assert.match(String(after1.FilterDefinition || ''), /MRefundId/i);

        resetReturnRefundSchemaCache();
        await ensureReturnRefundSchema(pool);
        const after2 = await inspectMRefundUnique(pool);
        assert.ok(after2, 'Phải còn UX_GiaoDichHoan_MRefundId sau lần 2');
        assert.equal(Number(after2.IsUniqueConstraint), 0);
        assert.equal(Number(after2.IsUnique), 1);
        assert.equal(Number(after2.HasFilter), 1);

        const afterCount = (await pool.request().query(
            `SELECT COUNT(*) AS So FROM dbo.GiaoDichHoan`
        )).recordset[0].So;
        assert.equal(Number(afterCount), Number(beforeCount), 'Không được xóa dòng GiaoDichHoan');
        console.log('✓ DB ensureReturnRefundSchema chạy 2 lần — filtered unique index, dữ liệu giữ nguyên');
        console.log('RETURN REFUND SCHEMA PASS (unit + DB ×2).');
    } finally {
        try { await pool.close(); } catch { /* ignore */ }
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
