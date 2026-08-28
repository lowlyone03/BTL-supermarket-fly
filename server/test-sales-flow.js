require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');

const base = process.env.API_BASE || 'http://localhost:3000/api';
const localDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

async function request(path, options = {}, token = null) {
    const response = await fetch(`${base}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${data.message || response.status}`);
    return data;
}

async function ensureCurrentSchedule() {
    const pool = await poolPromise;
    await pool.request().input('NgayLam', sql.Date, localDate()).query(`
            IF EXISTS(SELECT 1 FROM LichLamViec WHERE MaNV='NV_TN08' AND NgayLam=@NgayLam)
                UPDATE LichLamViec SET MaLoaiCa='SANG',NhiemVu=N'Ca chính full-time',MaQuay='Q02',
                    TrangThai=N'Đã công bố',BatDauDuKien=DATEADD(minute,-30,GETDATE()),
                    KetThucDuKien=DATEADD(hour,7,GETDATE()),NgayCapNhat=GETDATE()
                WHERE MaNV='NV_TN08' AND NgayLam=@NgayLam;
            ELSE
                INSERT LichLamViec(MaNV,MaLoaiCa,NgayLam,NhiemVu,MaQuay,TrangThai,NguoiPhanCong,
                    NguonPhanCong,BatDauDuKien,KetThucDuKien,NgayCongBo,NguoiCongBo)
                VALUES('NV_TN08','SANG',@NgayLam,N'Ca chính full-time','Q02',N'Đã công bố','NV_QL01',
                    'Test',DATEADD(minute,-30,GETDATE()),DATEADD(hour,7,GETDATE()),GETDATE(),'NV_QL01');`);
}

async function run() {
    await ensureCurrentSchedule();
    const login = await request('/auth/login', {
        method: 'POST', body: JSON.stringify({ TenDangNhap: 'thungan08', MatKhau: '123' })
    });
    const token = login.token;
    await request('/cashier/attendance/check-in', { method: 'POST' }, token);
    const shiftsBefore = await request('/cashier/shifts', {}, token);
    if (!shiftsBefore.current) {
        await request('/cashier/shifts/open', {
            method: 'POST', body: JSON.stringify({ TienDauCa: 500000 })
        }, token);
    }
    const catalog = await request('/cashier/pos/catalog', {}, token);
    const product = catalog.products.find(item => Number(item.SLTon) > 0);
    if (!product) throw new Error('Không có sản phẩm còn tồn để kiểm thử POS.');
    const invoice = await request('/cashier/invoices', {
        method: 'POST', body: JSON.stringify({ lines: [{ MaSP: product.MaSP, SoLuong: 1 }] })
    }, token);
    await request(`/cashier/invoices/${invoice.MaHD}/payments`, {
        method: 'POST', body: JSON.stringify({
            PhuongThuc: 'Tiền mặt', SoTien: invoice.TongThanhToan, TrangThai: 'Thành công'
        })
    }, token);
    await request(`/cashier/invoices/${invoice.MaHD}/complete`, { method: 'POST' }, token);
    const detail = await request(`/cashier/invoices/${invoice.MaHD}`, {}, token);
    if (detail.invoice.TrangThai !== 'Hoàn thành') throw new Error('Hóa đơn không chuyển sang Hoàn thành.');
    const summary = await request('/cashier/shifts/current/summary', {}, token);
    const close = await request('/cashier/shifts/close', {
        method: 'POST',
        body: JSON.stringify({ TienCuoiCa: Number(summary.TienDauCa) + Number(summary.TienMatHeThong) })
    }, token);
    await request('/cashier/attendance/check-out', { method: 'POST' }, token);
    console.log(JSON.stringify({
        status: 'SALES FLOW PASS',
        invoice: invoice.MaHD,
        product: product.MaSP,
        total: invoice.TongThanhToan,
        shift: close.MaCa,
        difference: close.ChenhLech
    }, null, 2));
    const pool = await poolPromise;
    await pool.close();
}

run().catch(async error => {
    console.error(error);
    try { const pool = await poolPromise; await pool.close(); } catch {}
    process.exitCode = 1;
});
