require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');

const API = 'http://localhost:3000/api';
let createdShift = null;

const request = async (path, token, options = {}, expectedStatus = null) => {
    const response = await fetch(`${API}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (expectedStatus !== null) {
        if (response.status !== expectedStatus) throw new Error(`${path}: chờ HTTP ${expectedStatus}, nhận ${response.status}`);
        return data;
    }
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${data.message || response.status}`);
    return data;
};

const cleanup = async () => {
    if (!createdShift) return;
    const pool = await poolPromise;
    await pool.request().input('MaCa', sql.VarChar, createdShift).query(`
        DELETE FROM NhatKy WHERE BangLienQuan=N'CaLamViec' AND MaBanGhi=@MaCa;
        DELETE FROM CaLamViec WHERE MaCa=@MaCa AND NOT EXISTS (SELECT 1 FROM HoaDon WHERE MaCa=@MaCa);`);
};

(async () => {
    const login = await request('/auth/login', null, {
        method: 'POST', body: JSON.stringify({ TenDangNhap: 'thungan', MatKhau: '123' })
    });
    const before = await request('/cashier/shifts', login.token);
    if (before.current) throw new Error(`Tài khoản Thu ngân đang có ca thật ${before.current.MaCa}; không chạy kiểm thử ghi dữ liệu.`);
    const opened = await request('/cashier/shifts/open', login.token, {
        method: 'POST', body: JSON.stringify({ TienDauCa: 1250000 })
    });
    createdShift = opened.MaCa;
    const after = await request('/cashier/shifts', login.token);
    if (!after.current || after.current.MaCa !== createdShift || Number(after.current.TienDauCa) !== 1250000) {
        throw new Error('Ca vừa mở không được trả về đúng dữ liệu.');
    }
    const duplicate = await request('/cashier/shifts/open', login.token, {
        method: 'POST', body: JSON.stringify({ TienDauCa: 500000 })
    }, 400);
    if (!String(duplicate.message || '').includes(createdShift)) throw new Error('Hệ thống chưa chặn mở hai ca đồng thời.');
    console.log(JSON.stringify({ result: 'PASS', shift: createdShift, openingCash: 1250000, duplicateBlocked: true }, null, 2));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    try { await cleanup(); console.log('CLEANUP PASS: ca kiểm thử đã được xóa.'); }
    catch (error) { console.error('CLEANUP FAILED:', error); process.exitCode = 1; }
    const pool = await poolPromise;
    await pool.close();
    process.exit(process.exitCode || 0);
});
