const express = require('express');
const cors = require('cors');
const os = require('node:os');
const path = require('node:path');
require('dotenv').config();
const { poolPromise } = require('./config/db'); // Đảm bảo gọi file db.js để khởi tạo kết nối

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const listLanIPv4 = () => {
    const addresses = [];
    for (const list of Object.values(os.networkInterfaces())) {
        for (const net of list || []) {
            const isV4 = net.family === 4 || net.family === 'IPv4';
            if (isV4 && !net.internal) addresses.push(net.address);
        }
    }
    return [...new Set(addresses)];
};

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads'), {
    maxAge: '7d',
    fallthrough: false
}));

// Import Routes
const { verifyToken } = require('./middlewares/authMiddleware');
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
const notificationRoutes = require('./routes/notificationRoutes');

// Định tuyến API
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
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
app.get('/api/test-db', verifyToken, async (req, res) => {
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

// Start Server — 0.0.0.0 để máy khác trong cùng Wi-Fi gọi được API (DB vẫn nằm trên máy này).
app.listen(PORT, HOST, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    const lan = listLanIPv4();
    if (lan.length) {
        console.log('Cùng Wi-Fi: thành viên nhập IP này ở màn đăng nhập (ô Máy chủ nhóm):');
        lan.forEach((ip) => console.log(`   ${ip}`));
    } else {
        console.log('Không thấy IP LAN. Kiểm tra Wi-Fi / Ethernet rồi chạy lại.');
    }
});
