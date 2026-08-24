require('dotenv').config();
const sql = require('mssql/msnodesqlv8'); 

const config = {
    driver: 'ODBC Driver 17 for SQL Server',
    server: 'localhost\\SQLEXPRESS',  // Sử dụng localhost thay vì dấu chấm
    database: 'SupermarketFlyDB',
    options: {
        trustedConnection: true, 
        trustServerCertificate: true,
        // SQL Server lưu DATETIME theo giờ địa phương của cửa hàng (Hà Nội).
        // Không diễn giải giá trị này như UTC vì sẽ làm giao diện cộng thêm 7 giờ.
        useUTC: false
    }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('✅ Đã kết nối tới SQL Server (bằng Windows Authentication) thành công!');
    return pool;
  })
  .catch(err => {
    console.error('❌ Lỗi kết nối CSDL: ', err.message);
    process.exit(1);
  });

module.exports = {
  sql,
  poolPromise
};
