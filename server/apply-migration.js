require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { poolPromise } = require('./src/config/db');

const migrationName = process.argv[2] || 'SupermarketFly_Migration_20260825_SalesAndWorkforceV2.sql';
const migrationPath = path.resolve(__dirname, 'migrations', migrationName);

async function run() {
    if (!fs.existsSync(migrationPath)) {
        throw new Error(`Không tìm thấy migration: ${migrationName}`);
    }
    const sqlText = fs.readFileSync(migrationPath, 'utf8');
    const batches = sqlText
        .split(/^\s*GO\s*;?\s*$/gim)
        .map(batch => batch.trim())
        .filter(Boolean);
    const pool = await poolPromise;
    for (let index = 0; index < batches.length; index += 1) {
        try {
            await pool.request().batch(batches[index]);
        } catch (error) {
            error.message = `Migration lỗi tại batch ${index + 1}/${batches.length}: ${error.message}`;
            throw error;
        }
    }
    console.log(`MIGRATION PASS: ${path.basename(migrationPath)} (${batches.length} batches).`);
    await pool.close();
}

run().catch(async error => {
    console.error(error);
    process.exitCode = 1;
    try {
        const pool = await poolPromise;
        await pool.close();
    } catch {}
});
