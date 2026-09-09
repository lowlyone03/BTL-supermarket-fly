const express = require('express');
const cors = require('cors');
const os = require('node:os');
const path = require('node:path');
require('./config/loadEnv').loadEnv();
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
const ledgerRoutes = require('./routes/ledgerRoutes');
const cashierRoutes = require('./routes/cashierRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const telegramRoutes = require('./routes/telegramRoutes');

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
app.use('/api/ledger', ledgerRoutes);
app.use('/api/cashier', cashierRoutes);
app.use('/api/telegram', telegramRoutes);

// API Kiểm tra trạng thái Server
app.get('/api/health', (req, res) => {
    let telegram = 'off';
    try { telegram = require('./services/telegramNotify').getTelegramStatus(); } catch { telegram = 'off'; }
    res.json({ status: 'ok', message: 'Backend Supermarket Fly đang chạy!', telegram });
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

process.on('unhandledRejection', (reason) => {
    console.error('Lỗi không bắt (API vẫn chạy):', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (error) => {
    console.error('Ngoại lệ không bắt (API vẫn chạy):', error.message);
});

const {
    startTelegramCompanion,
    installParentDeathHooks
} = require('./services/telegramCompanionProcess');
installParentDeathHooks();

const startHttp = (host, onListening) => {
    const server = app.listen({ port: Number(PORT), host, exclusive: true }, onListening);
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`Cổng ${PORT} đang bị chiếm. Đóng process cũ rồi chạy lại npm start.`);
            return;
        }
        console.error(`Không listen ${host}:${PORT}:`, error.message);
    });
    return server;
};

// 0.0.0.0 = IPv4 (LAN + 127.0.0.1). ::1 = Electron/Chromium gọi localhost.
startHttp(HOST, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    const lan = listLanIPv4();
    if (lan.length) {
        console.log('Cùng Wi-Fi: thành viên nhập IP này ở màn đăng nhập (ô Máy chủ nhóm):');
        lan.forEach((ip) => console.log(`   ${ip}`));
    } else {
        console.log('Không thấy IP LAN. Kiểm tra Wi-Fi / Ethernet rồi chạy lại.');
    }
    poolPromise.then(async (pool) => {
        try {
            const { ensureStoreProfitLossSchema } = require('./services/storeProfitLoss');
            const { ensureReturnHandoverSchema, healParkedReturns } = require('./services/returnHandover');
            const { ensureTelegramSchema } = require('./services/telegramSchema');
            const { ensureCountSuccessorSchema } = require('./services/countSuccessorSchema');
            const { syncRejectedCountSuccessors } = require('./services/countLifecycle');
            await ensureStoreProfitLossSchema(pool);
            await ensureReturnHandoverSchema(pool);
            await healParkedReturns(pool);
            await ensureTelegramSchema(pool);
            await ensureCountSuccessorSchema(pool);
            await syncRejectedCountSuccessors(pool);
        } catch (error) {
            console.error('Không thể bổ sung schema thông báo / bàn giao / Telegram:', error.message);
        }
    }).catch((error) => {
        console.error('SQL chưa sẵn sàng (API vẫn listen):', error.message);
    });
    try {
        startTelegramCompanion({ boundExclusivePort: true });
    } catch (error) {
        console.error('Telegram:', error.message);
    }
});
if (HOST !== '::1' && HOST !== '::') {
    startHttp('::1', () => {
        console.log(`Cũng lắng nghe http://[::1]:${PORT} (localhost IPv6)`);
    });
}
