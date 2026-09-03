require('dotenv').config();
const { poolPromise, sql } = require('./src/config/db');

const API = 'http://localhost:3000/api';

const request = async (path, token, options = {}, expectedStatus = null) => {
    const response = await fetch(`${API}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (expectedStatus !== null) {
        if (response.status !== expectedStatus) {
            throw new Error(`${options.method || 'GET'} ${path}: chờ HTTP ${expectedStatus}, nhận ${response.status} (${data.message || ''})`);
        }
        return { status: response.status, data };
    }
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${data.message || response.status}`);
    return data;
};

const login = async username => (await request('/auth/login', null, {
    method: 'POST', body: JSON.stringify({ TenDangNhap: username, MatKhau: '123' })
})).token;

(async () => {
    const ketoan = await login('ketoan');
    const before = await request('/accounting/payroll/2026-09', ketoan);
    if (before.built === undefined) throw new Error('GET phải trả built/canBuild, không tự insert.');
    const futureGet = await request('/accounting/payroll/2026-12', ketoan);
    if (futureGet.canBuild !== false) throw new Error('Kỳ tương lai không được phép lập.');
    if ((futureGet.items || []).length) throw new Error('GET kỳ tương lai không được tự tạo dòng BangLuong.');
    const futureBuild = await request('/accounting/payroll/2026-12/build', ketoan, { method: 'POST' }, 400);
    if (!/chưa tới/i.test(futureBuild.data.message || '')) {
        throw new Error(`Lập kỳ tương lai phải báo chưa tới, nhận: ${futureBuild.data.message}`);
    }

    const status = before.period?.TrangThai || '';
    let after = before;
    let rebuilt = false;
    if (status !== 'Đã khóa' && status !== 'Đã thanh toán') {
        const built = await request('/accounting/payroll/2026-09/build', ketoan, { method: 'POST' }, null).catch(error => ({ error: error.message }));
        if (built.error) {
            if (!/chờ duyệt/i.test(built.error)) throw new Error(built.error);
            console.log(`Bỏ qua build 2026-09: ${built.error}`);
        } else {
            rebuilt = true;
            console.log(`BUILD 2026-09: ${built.message}`);
            after = await request('/accounting/payroll/2026-09', ketoan);
        }
    } else {
        console.log(`Bỏ qua build 2026-09 (${status})`);
    }

    const pool = await poolPromise;
    const approved = await pool.request().query(`
        SELECT COUNT(DISTINCT l.MaNV) SoNV
        FROM ChamCong cc JOIN LichLamViec l ON l.MaLich=cc.MaLich
        WHERE cc.TrangThai=N'Đã duyệt'
          AND l.NgayLam >= '2026-09-01' AND l.NgayLam <= CONVERT(date, GETDATE())
          AND COALESCE(cc.ThoiGianRaDuocDuyet, cc.ThoiGianRa) IS NOT NULL`);
    const expectedNv = Number(approved.recordset[0].SoNV || 0);
    if (rebuilt && after.items.length !== expectedNv) {
        throw new Error(`2026-09 phải có ${expectedNv} dòng (NV có công đã duyệt), nhận ${after.items.length}`);
    }
    if (rebuilt && expectedNv === 0 && after.items.some(item => Number(item.LuongNgayLe) > 0)) {
        throw new Error('Không được cộng lương lễ khi không có chấm công.');
    }
    if (expectedNv > 0 && !(after.summary?.SoNgayLe > 0)) {
        throw new Error('Tháng 9 phải có ngày lễ trên lịch.');
    }

    const cashier = await login('thungan');
    const shifts = await request('/cashier/shifts', cashier);
    const duty = shifts.duty || {};
    console.log(`DUTY thungan: ${duty.status} — ${duty.message}`);
    if (duty.status !== 'inside') {
        const checkIn = await request('/cashier/attendance/check-in', cashier, { method: 'POST' }, 403);
        if (!checkIn.data.message) throw new Error('Check-in ngoài giờ phải có message tiếng Việt.');
        const open = await request('/cashier/shifts/open', cashier, {
            method: 'POST', body: JSON.stringify({ TienDauCa: 100000 })
        }, 403);
        console.log(`POS ngoài giờ: check-in 403 (${checkIn.data.message}); mở ca 403 (${open.data.message})`);
    } else {
        console.log('thungan đang trong ca — tìm thu ngân ngoài khung giờ.');
    }

    const outsiders = await pool.request().query(`
        SELECT TOP 1 tk.TenDangNhap, nv.TenNV
        FROM TaiKhoan tk
        JOIN NhanVien nv ON nv.MaNV = tk.MaNV
        JOIN VaiTro vt ON vt.MaVaiTro = tk.MaVaiTro
        WHERE vt.TenVaiTro = N'Thu ngân' AND nv.TrangThai = N'Đang làm việc'
          AND NOT EXISTS (
              SELECT 1 FROM LichLamViec l
              WHERE l.MaNV = nv.MaNV AND l.TrangThai = N'Đã công bố'
                AND GETDATE() BETWEEN DATEADD(minute, -10, l.BatDauDuKien) AND l.KetThucDuKien
          )
        ORDER BY nv.MaNV`);
    let posUser = 'thungan';
    let posToken = cashier;
    if (outsiders.recordset[0]) {
        try {
            posUser = outsiders.recordset[0].TenDangNhap;
            posToken = await login(posUser);
            console.log(`Dùng ${posUser} (${outsiders.recordset[0].TenNV}) — không trong khung giờ ca.`);
        } catch {
            posUser = 'thungan';
            posToken = cashier;
        }
    }
    const invoice = await request('/cashier/invoices', posToken, {
        method: 'POST',
        body: JSON.stringify({ lines: [{ MaSP: 'SP0001', SoLuong: 1 }] })
    }, 403);
    if (!invoice.data.message) throw new Error('Lập HĐ ngoài ca phải 403 kèm message.');
    console.log(`POS bán 403: ${invoice.data.message}`);

    console.log('PAYROLL + POS DUTY PASS');
    console.log(`  GET không insert; 2026-09 NV=${after.items.length} (kỳ vọng ${expectedNv}); tương lai bị chặn.`);
    await pool.close();
})().catch(async error => {
    console.error('FAIL:', error.message);
    process.exitCode = 1;
    try { await (await poolPromise).close(); } catch { /* ignore */ }
});
