const express = require('express');
const cors = require('cors');
const os = require('node:os');
const path = require('node:path');
require('./config/loadEnv').loadEnv();
const term = require('./config/termLog');
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
app.use('/uploads/chat', (req, res) => {
    res.status(403).json({ message: 'Tệp chat chỉ tải qua /api/chat/files với JWT.' });
});
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
const paymentGatewayRoutes = require('./routes/paymentGatewayRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const chatRoutes = require('./routes/chatRoutes');
const preferenceRoutes = require('./routes/preferenceRoutes');

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
app.use('/api/assistant', assistantRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/me', preferenceRoutes);
// IPN/return ZaloPay: public, mount TRƯỚC catch-all 404. Không payment.routes / momoController.
app.use('/api/payments/gateway', paymentGatewayRoutes);

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
            term.err(`Cổng ${PORT} đang bị chiếm. Đóng process cũ rồi chạy lại npm start.`);
            return;
        }
        term.err(`Không listen ${host}:${PORT}: ${error.message}`);
    });
    return server;
};

// 0.0.0.0 = IPv4 (LAN + 127.0.0.1). ::1 = Electron/Chromium gọi localhost.
startHttp(HOST, () => {
    const lan = listLanIPv4();
    const rows = [
        { label: 'API', value: `http://localhost:${PORT}` }
    ];
    if (lan.length) {
        lan.forEach((ip) => rows.push({ label: 'LAN', value: ip }));
    } else {
        rows.push({ label: 'LAN', value: 'không thấy IP — kiểm tra Wi-Fi' });
    }
    const tunnel = String(process.env.TELEGRAM_PUBLIC_BASE_URL || process.env.PAYMENT_IPN_URL || '')
        .replace(/\/api\/.*$/, '')
        .replace(/\/$/, '');
    if (/^https:\/\//i.test(tunnel)) {
        rows.push({ label: 'Tunnel', value: tunnel });
    }
    term.banner('Supermarket Fly - API', rows);
    poolPromise.then(async (pool) => {
        try {
            const { ensureStoreProfitLossSchema } = require('./services/storeProfitLoss');
            const { ensureReturnHandoverSchema, healParkedReturns } = require('./services/returnHandover');
            const { ensureTelegramSchema } = require('./services/telegramSchema');
            const { ensureCountSuccessorSchema } = require('./services/countSuccessorSchema');
            const { syncRejectedCountSuccessors } = require('./services/countLifecycle');
            await ensureStoreProfitLossSchema(pool);
            await ensureReturnHandoverSchema(pool);
            const { ensureReturnRefundSchema } = require('./services/returnRefundSchema');
            await ensureReturnRefundSchema(pool);
            await healParkedReturns(pool);
            await ensureTelegramSchema(pool);
            await ensureCountSuccessorSchema(pool);
            await syncRejectedCountSuccessors(pool);
            const { ensureReconciliationSchema } = require('./services/reconciliationService');
            await ensureReconciliationSchema(pool);
            const { ensureChatSchema } = require('./services/chatSchema');
            const { syncAllMemberships } = require('./services/chatService');
            await ensureChatSchema(pool);
            await syncAllMemberships(pool);
            const { ensurePreferenceSchema } = require('./services/preferenceSchema');
            await ensurePreferenceSchema(pool);
            const { ensureLoyaltyApplySchema } = require('./services/loyaltyApply');
            await ensureLoyaltyApplySchema(pool);
        } catch (error) {
            console.error('Không thể bổ sung schema thông báo / bàn giao / Telegram:', error.message);
        }
    }).catch((error) => {
        term.err(`SQL chưa sẵn sàng (API vẫn listen): ${error.message}`);
    });
    try {
        startTelegramCompanion({ boundExclusivePort: true });
    } catch (error) {
        term.err(`Telegram: ${error.message}`);
    }
});
if (HOST !== '::1' && HOST !== '::') {
    startHttp('::1', () => {
        term.info(`IPv6  http://[::1]:${PORT}`);
    });
}
