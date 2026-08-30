const express = require('express');
const cors = require('cors');
const path = require('node:path');
require('dotenv').config();
const { poolPromise } = require('./config/db'); // Đảm bảo gọi file db.js để khởi tạo kết nối

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads'), {
    maxAge: '7d',
    fallthrough: false
}));

// Import Routes
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const accountRoutes = require('./routes/accountRoutes');
const roleRoutes = require('./routes/roleRoutes');
const adminRoutes = require('./routes/adminRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const purchasingRoutes = require('./routes/purchasingRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const accountingRoutes = require('./routes/accountingRoutes');
const cashierRoutes = require('./routes/cashierRoutes');

// Định tuyến API
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/purchasing', purchasingRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/cashier', cashierRoutes);

// API Kiểm tra trạng thái Server
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend Supermarket Fly đang chạy!' });
});

// API Kiểm tra kết nối Database
app.get('/api/test-db', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT GETDATE() AS CurrentTime');
        res.json({ status: 'ok', data: result.recordset });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.use('/api', (req, res) => {
    res.status(404).json({ message: `Không tìm thấy ${req.method} ${req.originalUrl}. Hãy đóng ứng dụng và chạy lại npm start.` });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
