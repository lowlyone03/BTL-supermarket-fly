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

const expectFail = async (fn, hint) => {
    try {
        await fn();
        throw new Error(`Phải lỗi: ${hint}`);
    } catch (error) {
        if (String(error.message).startsWith('Phải lỗi:')) throw error;
    }
};

(async () => {
    const [ketoan, admin] = await Promise.all(['ketoan', 'admin'].map(login));
    const board = await request('/admin/approvals/payroll-board', admin);
    const periods = board.periods || [];
    if (!periods.length) {
        console.log('PAYROLL FUND SKIP: không còn phiếu chờ duyệt / đã duyệt chưa chi để chạy E2E.');
        await (await poolPromise).close();
        return;
    }

    const period = periods.find(item => (item.pending || []).length || (item.approved || []).length) || periods[0];
    const month = period.MaKy;
    let pending = period.pending || [];
    let approved = period.approved || [];

    if (pending.length) {
        const first = pending[0];
        const one = await request(`/admin/approvals/payroll-vouchers/${first.MaPhieu}/approve`, admin, {
            method: 'POST', body: JSON.stringify({})
        });
        if (one.TrangThai !== 'Đã duyệt') throw new Error(`Duyệt 1 phải ra Đã duyệt, nhận ${one.TrangThai}`);
        console.log(`  Duyệt 1: ${first.MaPhieu} OK`);
        const still = await request('/admin/approvals/payroll-board', admin);
        const afterOne = still.periods.find(item => item.MaKy === month);
        pending = afterOne?.pending || [];
        approved = afterOne?.approved || [];
        if (pending.length) {
            const all = await request('/admin/approvals/payroll-vouchers/approve-all', admin, {
                method: 'POST', body: JSON.stringify({ MaKy: month })
            });
            if (!all.items?.length) throw new Error('Duyệt tất cả không duyệt được phiếu nào.');
            console.log(`  Duyệt tất cả: ${all.items.length} phiếu OK`);
        } else {
            console.log('  Duyệt tất cả: không còn phiếu chờ (đã duyệt hết sau phiếu 1).');
        }
    } else {
        console.log(`  Kỳ ${month} không còn chờ duyệt, dùng phiếu đã duyệt để giao quỹ.`);
    }

    const beforePay = await request(`/accounting/payroll/${month}`, ketoan);
    const payable = (beforePay.vouchers || []).find(item => ['Đã duyệt', 'Thanh toán thất bại'].includes(item.TrangThai));
    if (!payable) throw new Error(`Kỳ ${month} không có phiếu đã duyệt để chi.`);

    await expectFail(
        () => request(`/accounting/payroll-vouchers/${payable.MaPhieu}/pay`, ketoan, {
            method: 'POST',
            body: JSON.stringify({
                ThanhCong: true,
                MaGiaoDichNganHang: payable.PhuongThuc === 'Chuyển khoản' ? 'TEST-FUND-CK-1' : '',
                GhiChuThanhToan: 'test'
            })
        }),
        'chi khi chưa giao quỹ chung'
    );
    console.log('  Chặn chi trước giao quỹ chung OK');

    const handover = await request(`/admin/approvals/payroll-fund/${month}/handover`, admin, {
        method: 'POST', body: JSON.stringify({ GhiChu: 'Test giao quỹ chung một lần' })
    });
    const afterHandTm = Number(handover.fund?.SoTienMatCon || 0);
    const afterHandCk = Number(handover.fund?.SoTienCKCon || 0);
    if (afterHandTm <= 0 && afterHandCk <= 0) throw new Error('Giao quỹ chung phải để lại số dư TM hoặc CK.');
    console.log(`  Giao quỹ chung kỳ ${month}: TM còn ${afterHandTm}, CK còn ${afterHandCk}`);

    const payBody = {
        ThanhCong: true,
        MaGiaoDichNganHang: payable.PhuongThuc === 'Chuyển khoản' ? `TEST-GD-${Date.now()}` : '',
        GhiChuThanhToan: 'Test chi từ quỹ chung',
        GhiChuTreHan: 'Test API quỹ chung sau hạn tất toán'
    };
    const paid = await request(`/accounting/payroll-vouchers/${payable.MaPhieu}/pay`, ketoan, {
        method: 'POST', body: JSON.stringify(payBody)
    });
    if (paid.TrangThai !== 'Thanh toán thành công') throw new Error(`Chi phải thành công, nhận ${paid.TrangThai}`);
    const remainTm = Number(paid.SoTienMatCon);
    const remainCk = Number(paid.SoTienCKCon);
    if (payable.PhuongThuc === 'Tiền mặt' && remainTm !== Math.round((afterHandTm - Number(payable.SoTien)) * 100) / 100) {
        throw new Error(`Quỹ TM sau chi phải giảm. Trước ${afterHandTm}, sau ${remainTm}, phiếu ${payable.SoTien}`);
    }
    if (payable.PhuongThuc === 'Chuyển khoản' && remainCk !== Math.round((afterHandCk - Number(payable.SoTien)) * 100) / 100) {
        throw new Error(`Quỹ CK sau chi phải giảm. Trước ${afterHandCk}, sau ${remainCk}, phiếu ${payable.SoTien}`);
    }
    console.log(`  Chi ${payable.MaPhieu} (${payable.PhuongThuc}): quỹ còn TM ${remainTm}, CK ${remainCk}`);

    const history = await request('/accounting/activity-log?kind=quy-luong&pageSize=20', ketoan);
    const hasPayLog = (history.items || []).some(item =>
        item.HanhDong === 'Chi lương từ quỹ chung' || String(item.MaBanGhi) === payable.MaPhieu
    );
    if (!hasPayLog) throw new Error('Lịch sử kế toán phải có dòng chi từ quỹ chung.');
    const payouts = await request('/accounting/payroll-payouts', ketoan);
    const payoutRow = (payouts.items || []).find(item => item.MaPhieu === payable.MaPhieu);
    if (!payoutRow) throw new Error('Bảng lịch sử chi từ quỹ chung phải có dòng vừa chi.');

    console.log('PAYROLL COMMON FUND PASS');
    console.log(`  Kỳ ${month}; duyệt 1 + duyệt tất cả + giao quỹ 1 lần + chi giảm quỹ + lịch sử có dòng.`);
    await (await poolPromise).close();
})().catch(async error => {
    console.error('PAYROLL FUND FAIL:', error.message);
    process.exitCode = 1;
    try { await (await poolPromise).close(); } catch { /* ignore */ }
});
