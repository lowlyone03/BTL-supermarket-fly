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

const isTransactionParent = parent => Boolean(
    parent
    && typeof parent.begin === 'function'
    && typeof parent.commit === 'function'
    && typeof parent.rollback === 'function'
    && parent.isolationLevel !== undefined
);

const rawQuery = sql.Request.prototype.query;
let queryGate = Promise.resolve();
sql.Request.prototype.query = function querySerialized(command, callback) {
    // Query trên Transaction đi thẳng: connection riêng, đã tuần tự theo _activeRequest.
    // Nếu nhét chúng vào queryGate chung với Telegram/pool thì Telegram SELECT (chờ khóa
    // SERIALIZABLE) giữ cổng JS, transaction không COMMIT được → Query timeout HYT00.
    if (isTransactionParent(this.parent) || typeof callback === 'function') {
        return rawQuery.call(this, command, callback);
    }
    const run = () => rawQuery.call(this, command);
    const pending = queryGate.then(run, run);
    queryGate = pending.then(() => undefined, () => undefined);
    return pending;
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    require('./termLog').ok('SQL Server - Windows Authentication');
    return pool;
  })
  .catch(err => {
    require('./termLog').err('Lỗi kết nối CSDL: ' + err.message);
    throw err;
  });

module.exports = {
  sql,
  poolPromise
};
