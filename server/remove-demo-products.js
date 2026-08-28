require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');

const productIds = ['SP001', 'SP002', 'SP003', 'SP004', 'SP005', 'SP006', 'SP007', 'SP008'];

async function run() {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const references = await new sql.Request(transaction).query(`
            SELECT OBJECT_NAME(fkc.parent_object_id) Bang,
                   COL_NAME(fkc.parent_object_id,fkc.parent_column_id) Cot
            FROM sys.foreign_key_columns fkc
            WHERE fkc.referenced_object_id=OBJECT_ID('dbo.SanPham')`);
        const blockers = [];
        for (const reference of references.recordset) {
            if (reference.Bang === 'TonKho') continue;
            const result = await new sql.Request(transaction).query(`
                SELECT COUNT(*) Tong
                FROM dbo.[${reference.Bang}]
                WHERE [${reference.Cot}] IN (${productIds.map(id => `'${id}'`).join(',')})`);
            if (Number(result.recordset[0].Tong) > 0) {
                blockers.push(`${reference.Bang}: ${result.recordset[0].Tong} dòng`);
            }
        }
        if (blockers.length) {
            throw new Error(`Chưa thể xóa vì 8 sản phẩm đã có chứng từ (${blockers.join('; ')}).`);
        }
        await new sql.Request(transaction).query(`
            DELETE FROM dbo.TonKho WHERE MaSP IN (${productIds.map(id => `'${id}'`).join(',')});
            DELETE FROM dbo.SanPham WHERE MaSP IN (${productIds.map(id => `'${id}'`).join(',')});`);
        const remaining = await new sql.Request(transaction).query('SELECT COUNT(*) Tong FROM dbo.SanPham');
        await transaction.commit();
        console.log(`Đã xóa SP001–SP008. Danh mục hiện còn ${remaining.recordset[0].Tong} sản phẩm.`);
        await pool.close();
    } catch (error) {
        await transaction.rollback().catch(() => {});
        await pool.close().catch(() => {});
        throw error;
    }
}

run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
