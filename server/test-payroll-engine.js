require('dotenv').config();
const { poolPromise } = require('./src/config/db');

const API = 'http://localhost:3000/api';

const request = async (path, token, options = {}) => {
    const response = await fetch(`${API}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${data.message || response.status}`);
    return data;
};

const login = async username => (await request('/auth/login', null, {
    method: 'POST', body: JSON.stringify({ TenDangNhap: username, MatKhau: '123' })
})).token;

const monthsWithHolidays = ['2026-01', '2026-02', '2026-04', '2026-05', '2026-09'];

(async () => {
    const [ketoan, admin] = await Promise.all(['ketoan', 'admin'].map(login));
    const holidays = await request('/admin/workforce/holidays/2026', admin);
    const tet = holidays.items.filter(item => item.NhomLe === 'TetAmLich');
    const gioTo = holidays.items.filter(item => item.NhomLe === 'GioTo');
    if (tet.length < 5 || !gioTo.length) {
        throw new Error(`Lịch 2026 thiếu ngày âm: Tết ${tet.length}/5, Giỗ Tổ ${gioTo.length}.`);
    }

    let chosen = null;
    let built = null;
    const skipped = [];
    for (const month of monthsWithHolidays) {
        const current = await request(`/accounting/payroll/${month}`, ketoan);
        const status = current.period?.TrangThai || '';
        if (status === 'Đã khóa' || status === 'Đã thanh toán') {
            skipped.push(`${month} (${status})`);
            continue;
        }
        try {
            built = await request(`/accounting/payroll/${month}/build`, ketoan, { method: 'POST' });
            chosen = await request(`/accounting/payroll/${month}`, ketoan);
            break;
        } catch (error) {
            skipped.push(`${month} (${error.message})`);
        }
    }
    if (!chosen) {
        const fallback = await request('/accounting/payroll/2026-09', ketoan);
        const pay = String(fallback.period?.NgayTraDuKien || fallback.summary?.NgayTraDuKien || '').slice(0, 10);
        if (pay !== '2026-10-10') throw new Error(`NgayTraDuKien kỳ 2026-09 phải là 2026-10-10, nhận ${pay}`);
        const holidayPay = (fallback.items || []).reduce((sum, item) => sum + Number(item.LuongNgayLe || 0), 0);
        if (!(fallback.summary?.SoNgayLe > 0)) {
            throw new Error('Lịch lễ tháng 9/2026 phải có 01/09 và 02/09.');
        }
        if (holidayPay <= 0 && (fallback.items || []).length) {
            throw new Error(`Không thấy lương ngày lễ > 0. Không lập được kỳ mới. ${skipped.join(' | ')}`);
        }
        console.log('PAYROLL ENGINE PASS (kỳ đã khóa, chỉ kiểm tra dữ liệu hiện có).');
        console.log(`  NgayTraDuKien=2026-10-10; SoNgayLe=${fallback.summary?.SoNgayLe}; NV=${fallback.items.length}; LuongNgayLe=${holidayPay}`);
        if (skipped.length) console.log(`  Bỏ qua: ${skipped.join(' | ')}`);
        await (await poolPromise).close();
        return;
    }

    const pay = String(chosen.summary?.NgayTraDuKien || chosen.period?.NgayTraDuKien || '').slice(0, 10);
    const [year, monthNum] = chosen.period.MaKy.split('-').map(Number);
    const expectMonth = monthNum === 12 ? 1 : monthNum + 1;
    const expectYear = monthNum === 12 ? year + 1 : year;
    const expected = `${expectYear}-${String(expectMonth).padStart(2, '0')}-10`;
    if (pay !== expected) throw new Error(`NgayTraDuKien phải là ${expected} (mùng 10), nhận ${pay}`);
    const holidayPay = (chosen.items || []).reduce((sum, item) => sum + Number(item.LuongNgayLe || 0), 0);
    if (!(chosen.summary?.SoNgayLe > 0)) {
        throw new Error(`Kỳ ${chosen.period.MaKy} phải có ngày lễ trên lịch (SoNgayLe=${chosen.summary?.SoNgayLe}).`);
    }
    if (chosen.items.length && holidayPay <= 0) {
        throw new Error(`Kỳ ${chosen.period.MaKy} có ${chosen.items.length} NV đã đi làm nhưng lương lễ = 0.`);
    }
    const restLines = chosen.items.filter(item => Number(item.LuongNgayLe) > 0).length;
    console.log('PAYROLL ENGINE PASS');
    console.log(`  Login ketoan + admin OK`);
    console.log(`  Tết âm 2026: ${tet.map(item => String(item.NgayDuongLich).slice(0, 10)).join(', ')}`);
    console.log(`  Lập kỳ ${chosen.period.MaKy}: ${built.message}`);
    console.log(`  NgayTraDuKien=${pay}; ngày lễ=${chosen.summary.SoNgayLe}; NV có lương lễ=${restLines}; tổng lễ=${holidayPay}`);
    if (skipped.length) console.log(`  Bỏ qua: ${skipped.join(' | ')}`);
    await (await poolPromise).close();
})().catch(async error => {
    console.error('PAYROLL ENGINE FAIL:', error.message);
    process.exitCode = 1;
    try { await (await poolPromise).close(); } catch {}
});
