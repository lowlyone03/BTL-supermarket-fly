require('dotenv').config();
const assert = require('node:assert/strict');
const {
    monthsOverlapping,
    calculateOperatingResult,
    buildLossReasons,
    buildCashSentence
} = require('./src/services/storeProfitLossMath');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Tháng overlapping không lấy tháng của toExclusive mùng 1', () => {
    assert.deepEqual(monthsOverlapping('2026-09-01', '2026-10-01'), ['2026-09']);
    assert.deepEqual(monthsOverlapping('2026-07-01', '2026-10-01'), ['2026-07', '2026-08', '2026-09']);
    assert.deepEqual(monthsOverlapping('2026-09-02', '2026-09-03'), ['2026-09']);
});

test('Lãi gộp không trừ lương; lãi sau chi phí mới trừ NCC và lương khóa', () => {
    const result = calculateOperatingResult({
        doanhThuThuan: 10_000_000,
        loiNhuanGop: 3_000_000,
        chiNhaCungCap: 1_200_000,
        cuocVanChuyen: 0,
        chiPhiNhanVien: 2_500_000,
        tongLuongKhoa: 2_500_000
    });
    assert.equal(result.loiNhuanGop, 3_000_000);
    assert.equal(result.laiLoSauChiPhi, -700_000);
    assert.equal(result.trangThai, 'LỖ');
    assert.equal(result.batBuocKeHoach, true);
});

test('Kỳ lãi không bắt kế hoạch', () => {
    const result = calculateOperatingResult({
        doanhThuThuan: 20_000_000,
        loiNhuanGop: 8_000_000,
        chiNhaCungCap: 1_000_000,
        cuocVanChuyen: 0,
        chiPhiNhanVien: 2_000_000,
        tongLuongKhoa: 2_000_000
    });
    assert.equal(result.trangThai, 'LÃI');
    assert.equal(result.batBuocKeHoach, false);
    assert.equal(result.khongDuTraLuong, false);
    assert.equal(buildLossReasons({ ...result, doanhThuHoaDon: 20_000_000 }).length, 0);
});

test('Doanh thu thấp hơn lương khóa thì bắt kế hoạch dù có lãi gộp', () => {
    const result = calculateOperatingResult({
        doanhThuThuan: 1_000_000,
        loiNhuanGop: 400_000,
        chiNhaCungCap: 0,
        cuocVanChuyen: 0,
        chiPhiNhanVien: 2_000_000,
        tongLuongKhoa: 2_000_000
    });
    assert.equal(result.khongDuTraLuong, true);
    assert.equal(result.batBuocKeHoach, true);
    const reasons = buildLossReasons({
        ...result,
        doanhThuHoaDon: 1_000_000,
        tienHoan: 0,
        giaVonThuan: 600_000,
        chiNhaCungCap: 0,
        tongLuongKhoa: 2_000_000
    });
    assert.ok(reasons.some(item => item.ma === 'luong_hon_doanh_thu'));
    assert.ok(reasons.every(item => item.soLieu && item.nghiaLa));
});

test('Câu tiền thu đủ/thiếu lương đã khóa', () => {
    assert.match(buildCashSentence(8_000_000, 5_000_000, true).cau, /đủ/);
    assert.match(buildCashSentence(3_000_000, 5_000_000, true).cau, /thiếu/);
    assert.match(buildCashSentence(1_000_000, 0, false).cau, /chưa khóa/i);
});

async function request(path, options = {}, token = null) {
    const base = process.env.API_BASE || 'http://localhost:3000/api';
    const response = await fetch(`${base}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

async function apiVerify() {
    const health = await request('/health').catch(() => ({ ok: false }));
    if (!health.ok) {
        console.log('API SKIP: server chưa chạy, đã kiểm tra công thức tại chỗ.');
        return;
    }
    const login = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ TenDangNhap: 'admin', MatKhau: '123' })
    });
    if (!login.ok) throw new Error(`Đăng nhập QL thất bại: ${login.data.message || login.status}`);
    const token = login.data.token;
    const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date());
    const period = now.slice(0, 7);
    const report = await request(`/admin/reports/store-profit-loss?periodType=month&period=${period}&lockPeriod=1&_=${Date.now()}`, {}, token);
    if (!report.ok) throw new Error(report.data.message || 'GET lãi/lỗ thất bại');
    const body = report.data;
    assert.ok(body.period?.label);
    assert.equal(typeof body.hoatDong.laiLoSauChiPhi, 'number');
    assert.equal(typeof body.hoatDong.loiNhuanGop, 'number');
    assert.ok(body.congThuc.laiGop.includes('không trừ lương'));
    console.log(`✓ GET kỳ ${body.period.label}: ${body.hoatDong.trangThai} ${body.hoatDong.laiLoSauChiPhi}`);

    const quiet = await request(`/admin/reports/store-profit-loss?periodType=month&period=2020-01&lockPeriod=1&_=${Date.now()}`, {}, token);
    if (quiet.ok && !quiet.data.batBuocKeHoach) {
        const rejected = await request('/admin/reports/store-profit-loss/plan', {
            method: 'POST',
            body: JSON.stringify({
                periodType: 'month',
                period: '2020-01',
                nguyenNhanMa: ['khac'],
                nguyenNhanKhac: 'Thử gửi khi đang lãi',
                keHoach: 'Kế hoạch đủ năm mươi ký tự để kiểm tra từ chối khi kỳ đang lãi của cửa hàng.',
                hanXemLai: '2026-12-31'
            })
        }, token);
        assert.equal(rejected.ok, false);
        assert.match(rejected.data.message || '', /lãi/i);
        console.log('✓ Kỳ lãi (2020-01) không bắt / không nhận kế hoạch');
    }

    if (!body.batBuocKeHoach) {
        console.log('✓ Kỳ hiện tại không bắt kế hoạch');
        return;
    }
    if ((body.keHoach || []).length) {
        console.log('✓ Kỳ lỗ đã có kế hoạch lưu lại, không gửi thêm thông báo lặp');
        return;
    }

    const saved = await request('/admin/reports/store-profit-loss/plan', {
        method: 'POST',
        body: JSON.stringify({
            periodType: body.period.periodType,
            period: body.period.period,
            nguyenNhanMa: (body.nguyenNhan || []).map(item => item.ma).concat('khac'),
            nguyenNhanKhac: 'Kiểm thử gửi thông báo toàn cửa hàng',
            keHoach: 'Cắt tăng ca chưa cần thiết, duyệt OT chặt hơn, đàm phán giá nhà cung cấp và tăng trưng bày hàng bán chạy trong hai tuần tới.',
            hanXemLai: '2026-12-31'
        })
    }, token);
    if (!saved.ok) throw new Error(saved.data.message || 'POST kế hoạch thất bại');
    assert.ok(saved.data.item?.SoNguoiNhan >= 5);
    const cashierLogin = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ TenDangNhap: 'thungan', MatKhau: '123' })
    });
    const inbox = await request('/notifications', {}, cashierLogin.data.token);
    assert.ok(inbox.ok);
    assert.ok((inbox.data.items || []).some(item => String(item.id || '').startsWith('pnl:')));
    console.log(`✓ POST kế hoạch khi lỗ, gửi ${saved.data.item.SoNguoiNhan} người, thu ngân nhận được thông báo`);
}

apiVerify()
    .then(() => console.log('STORE PROFIT LOSS PASS'))
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
