const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { poolPromise } = require('./config/db'); // Đảm bảo gọi file db.js để khởi tạo kết nối

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Import Routes
const authRoutes = require('./routes/authRoutes');

// Định tuyến API
app.use('/api/auth', authRoutes);

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

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
