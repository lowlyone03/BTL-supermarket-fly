require('./loadEnv').loadEnv();
const sql = require('mssql/msnodesqlv8');

const config = {
    driver: 'ODBC Driver 17 for SQL Server',
    server: 'localhost\\SQLEXPRESS',
    database: 'SupermarketFlyDB',
    requestTimeout: 60000,
    connectionTimeout: 30000,
    options: {
        trustedConnection: true,
        trustServerCertificate: true,
        useUTC: false
    }
};

const rawQuery = sql.Request.prototype.query;
let queryGate = Promise.resolve();
sql.Request.prototype.query = function querySerialized(command, callback) {
    if (typeof callback === 'function') return rawQuery.call(this, command, callback);
    const run = () => rawQuery.call(this, command);
    const pending = queryGate.then(run, run);
    queryGate = pending.then(() => undefined, () => undefined);
    return pending;
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('✅ Đã kết nối tới SQL Server (bằng Windows Authentication) thành công!');
    return pool;
  })
  .catch(err => {
    console.error('❌ Lỗi kết nối CSDL: ', err.message);
    throw err;
  });

module.exports = {
  sql,
  poolPromise
};
