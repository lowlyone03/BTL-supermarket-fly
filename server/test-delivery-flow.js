require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');

const API = 'http://localhost:3000/api';
const TEST_PO = 'PO_TEST_SHIP';

const request = async (path, token, options = {}) => {
    const response = await fetch(`${API}${path}`, {
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
};

const login = async username => (await request('/auth/login', null, {
    method: 'POST', body: JSON.stringify({ TenDangNhap: username, MatKhau: '123' })
})).token;

const cleanup = async pool => {
    await pool.request().input('MaPO', sql.VarChar, TEST_PO).query(`
        DELETE FROM NhatKy
        WHERE MaBanGhi=@MaPO
           OR MaBanGhi IN (SELECT MaTBGH FROM ThongBaoGiaoHang WHERE MaPO=@MaPO);
        DELETE FROM ThongBaoGiaoHang WHERE MaPO=@MaPO;
        DELETE FROM ChiTietDonMua WHERE MaPO=@MaPO;
        DELETE FROM DonMuaHang WHERE MaPO=@MaPO;`);
};

const run = async () => {
    const pool = await poolPromise;
    await cleanup(pool);
    try {
        await pool.request().input('MaPO', sql.VarChar, TEST_PO)
            .input('TrangThai', sql.NVarChar, 'Nhà cung cấp xác nhận').query(`
                INSERT INTO DonMuaHang
                    (MaPO,MaDN,MaNCC,MaNV_Lap,NgayLap,NgayGiaoDuKien,DieuKhoanThanhToan,
                     SoNgayThanhToan,TongTien,TrangThai,GhiChu)
                SELECT @MaPO,MaDN,MaNCC,MaNV_Lap,GETDATE(),CONVERT(date,GETDATE()),DieuKhoanThanhToan,
                       SoNgayThanhToan,10000,@TrangThai,N'Dữ liệu kiểm thử tạm'
                FROM DonMuaHang WHERE MaPO='PO20260824001';
                INSERT INTO ChiTietDonMua
                    (MaPO,MaSP,SoLuong,DonGia,ChietKhau,ThanhTien,SLDaGiao,SLConThieu)
                SELECT TOP 1 @MaPO,MaSP,1,10000,0,10000,0,1
                FROM ChiTietDonMua WHERE MaPO='PO20260824001' ORDER BY MaSP;`);

        const purchasing = await login('muahang');
        const warehouse = await login('thukho');
        const shipment = await request(`/purchasing/purchase-orders/${TEST_PO}/shipments`, purchasing, {
            method: 'POST',
            body: JSON.stringify({
                SoPhieuGiao: 'PG-TEST-01',
                NgayXuatPhat: '2026-08-24T12:00',
                NgayGioDuKienDen: '2026-08-24T16:00',
                BienSoXe: '29H-TEST', TenTaiXe: 'Tài xế thử', SDTTaiXe: '0900000000', SoKien: 1
            })
        });
        const before = await request('/warehouse/receiving/orders', warehouse);
        const visible = before.items.find(item => item.MaPO === TEST_PO);
        if (!visible || visible.TrangThaiGiao !== 'Đang giao') throw new Error('Thủ kho chưa nhìn thấy chuyến đang giao.');
        await request(`/warehouse/receiving/shipments/${shipment.MaTBGH}/arrive`, warehouse, { method: 'POST', body: '{}' });
        const detail = await request(`/warehouse/receiving/shipments/${shipment.MaTBGH}`, warehouse);
        if (detail.order.MaPO !== TEST_PO || detail.order.TrangThaiGiao !== 'Đã đến kho' || detail.lines.length !== 1) {
            throw new Error('Dữ liệu mở kiểm nhận không đúng chuyến giao thử.');
        }
        console.log(`PASS: ${shipment.MaTBGH} | Đang giao -> Đã đến kho -> sẵn sàng kiểm nhận`);
    } finally {
        await cleanup(pool);
        const remaining = await pool.request().input('MaPO', sql.VarChar, TEST_PO)
            .query('SELECT COUNT(*) AS SoDong FROM DonMuaHang WHERE MaPO=@MaPO');
        console.log(`CLEANUP: còn ${remaining.recordset[0].SoDong} đơn thử`);
        await pool.close();
    }
};

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
