require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');

const API = 'http://localhost:3000/api';
const ids = { supplier: 'NCC_TEST_FLOW' };
let product;
let stockBefore;

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

const cleanup = async () => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        if (ids.invoice) {
            await new sql.Request(transaction).input('MaHD', sql.VarChar, ids.invoice).query(`
                DELETE FROM CongNoPhaiTra WHERE MaHDMH=@MaHD;
                DELETE FROM ChiTietHoaDonMuaHang WHERE MaHDMH=@MaHD;
                DELETE FROM HoaDonMuaHang WHERE MaHDMH=@MaHD;`);
        }
        if (ids.receipt) {
            await new sql.Request(transaction).input('MaPN', sql.VarChar, ids.receipt).query(`
                DELETE FROM GiaoDichKho WHERE LoaiChungTu=N'Phiếu nhập' AND MaChungTu=@MaPN;
                DELETE FROM ChiTietPhieuNhap WHERE MaPN=@MaPN;
                DELETE FROM PhieuNhap WHERE MaPN=@MaPN;`);
        }
        if (ids.shipment) {
            await new sql.Request(transaction).input('MaTBGH', sql.VarChar, ids.shipment).query(`
                DELETE FROM ThongBaoGiaoHang WHERE MaTBGH=@MaTBGH;`);
        }
        if (ids.order) {
            await new sql.Request(transaction).input('MaPO', sql.VarChar, ids.order).query(`
                DELETE FROM ChiTietDonMua WHERE MaPO=@MaPO;
                DELETE FROM DonMuaHang WHERE MaPO=@MaPO;`);
        }
        if (ids.purchaseRequest) {
            await new sql.Request(transaction).input('MaDN', sql.VarChar, ids.purchaseRequest).query(`
                DELETE FROM ChiTietDeNghi WHERE MaDN=@MaDN;
                DELETE FROM DeNghiMuaHang WHERE MaDN=@MaDN;`);
        }
        await new sql.Request(transaction).input('MaNCC', sql.VarChar, ids.supplier)
            .query(`DELETE FROM NhaCungCap WHERE MaNCC=@MaNCC`);
        if (product && stockBefore) {
            await new sql.Request(transaction).input('MaKho', sql.VarChar, stockBefore.MaKho).input('MaSP', sql.VarChar, product.MaSP)
                .input('SLTon', sql.Int, stockBefore.SLTon).input('SLDatMua', sql.Int, stockBefore.SLDatMua)
                .input('DonGia', sql.Decimal(18, 2), stockBefore.DonGiaBinhQuan).input('GiaTri', sql.Decimal(18, 2), stockBefore.GiaTriTon)
                .query(`UPDATE TonKho SET SLTon=@SLTon,SLDatMua=@SLDatMua,DonGiaBinhQuan=@DonGia,GiaTriTon=@GiaTri,NgayCapNhat=GETDATE()
                        WHERE MaKho=@MaKho AND MaSP=@MaSP`);
        }
        const records = [ids.supplier, ids.purchaseRequest, ids.order, ids.shipment, ids.receipt, ids.invoice, ids.debt].filter(Boolean);
        for (const record of records) {
            await new sql.Request(transaction).input('MaBanGhi', sql.VarChar, record).query(`DELETE FROM NhatKy WHERE MaBanGhi=@MaBanGhi`);
        }
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

(async () => {
    const pool = await poolPromise;
    product = (await pool.request().query(`SELECT TOP 1 MaSP,TenSP,GiaNhap FROM SanPham WHERE TrangThai=N'Đang bán' ORDER BY MaSP`)).recordset[0];
    stockBefore = (await pool.request().input('MaSP', sql.VarChar, product.MaSP).query(`SELECT TOP 1 * FROM TonKho WHERE MaSP=@MaSP ORDER BY MaKho`)).recordset[0];
    const [warehouse, purchasing, manager, accounting] = await Promise.all(['thukho', 'muahang', 'admin', 'ketoan'].map(login));

    await request('/suppliers', purchasing, { method: 'POST', body: JSON.stringify({ MaNCC: ids.supplier, TenNCC: 'Nhà cung cấp kiểm thử luồng', MaSoThue: 'TEST20260824', SDT: '0900000000', DiaChi: 'Hà Nội', NguoiLienHe: 'Bộ phận kiểm thử', TrangThai: 'Đang hợp tác' }) });
    const createdRequest = await request('/warehouse/purchase-requests', warehouse, { method: 'POST', body: JSON.stringify({ LyDo: 'Kiểm thử nhập hàng khai trương', lines: [{ MaSP: product.MaSP, SLDeNghi: 7 }] }) });
    ids.purchaseRequest = createdRequest.MaDN;
    await request(`/warehouse/purchase-requests/${ids.purchaseRequest}/submit`, warehouse, { method: 'POST' });
    await request(`/purchasing/purchase-requests/${ids.purchaseRequest}/accept`, purchasing, { method: 'POST' });
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const createdOrder = await request('/purchasing/purchase-orders', purchasing, { method: 'POST', body: JSON.stringify({ MaDN: ids.purchaseRequest, MaNCC: ids.supplier, NgayGiaoDuKien: tomorrow, SoNgayThanhToan: 30, DieuKhoanThanhToan: 'Thanh toán sau 30 ngày', lines: [{ MaSP: product.MaSP, SoLuong: 7, DonGia: Number(product.GiaNhap), ChietKhau: 0 }] }) });
    ids.order = createdOrder.MaPO;
    await request(`/purchasing/purchase-orders/${ids.order}/submit`, purchasing, { method: 'POST' });
    await request(`/admin/approvals/purchase-orders/${ids.order}/approve`, manager, { method: 'POST' });
    await request(`/purchasing/purchase-orders/${ids.order}/send-supplier`, purchasing, { method: 'POST' });
    await request(`/purchasing/purchase-orders/${ids.order}/supplier-confirm`, purchasing, { method: 'POST' });
    const shipment = await request(`/purchasing/purchase-orders/${ids.order}/shipments`, purchasing, { method: 'POST', body: JSON.stringify({ SoPhieuGiao: `PG-${Date.now()}`, NgayXuatPhat: new Date().toISOString(), NgayGioDuKienDen: new Date(Date.now() + 3600000).toISOString(), BienSoXe: '29H-TEST', TenTaiXe: 'Tài xế kiểm thử', SDTTaiXe: '0900000000', SoKien: 1 }) });
    ids.shipment = shipment.MaTBGH;
    await request(`/warehouse/receiving/shipments/${ids.shipment}/arrive`, warehouse, { method: 'POST', body: '{}' });
    const createdReceipt = await request('/warehouse/receipts', warehouse, { method: 'POST', body: JSON.stringify({ MaTBGH: ids.shipment, MaPO: ids.order, MaKho: stockBefore.MaKho, GhiChu: 'Lô kiểm thử tự động', lines: [{ MaSP: product.MaSP, SoLuongGiao: 7, SoLuongChapNhan: 7, SoLuongTuChoi: 0, DonGiaNhap: Number(product.GiaNhap), TinhTrangHang: 'Đạt yêu cầu', SoLo: 'TEST-LOT', ViTriKho: 'Kệ kiểm thử' }] }) });
    ids.receipt = createdReceipt.MaPN;
    await request(`/warehouse/receipts/${ids.receipt}/confirm`, warehouse, { method: 'POST' });
    const afterReceipt = (await pool.request().input('MaKho', sql.VarChar, stockBefore.MaKho).input('MaSP', sql.VarChar, product.MaSP).query(`SELECT SLTon,SLDatMua FROM TonKho WHERE MaKho=@MaKho AND MaSP=@MaSP`)).recordset[0];
    if (Number(afterReceipt.SLTon) !== Number(stockBefore.SLTon) + 7 || Number(afterReceipt.SLDatMua) !== Number(stockBefore.SLDatMua)) throw new Error('Tồn kho hoặc lượng đang đặt không cập nhật đúng sau xác nhận nhập.');
    const savedInvoice = await request('/accounting/purchase-invoices', accounting, {
        method: 'POST',
        body: JSON.stringify({
            MaPN: ids.receipt,
            SoHoaDon: `TEST-FLOW-${Date.now()}`,
            NgayHoaDon: new Date().toISOString().slice(0, 10),
            lines: [{ MaSP: product.MaSP, SoLuong: 7, DonGia: Number(product.GiaNhap), ThueSuat: 8 }]
        })
    });
    ids.invoice = savedInvoice.MaHDMH;
    if (savedInvoice.TrangThaiDoiChieu !== 'Chờ đối chiếu' || savedInvoice.MaCNPTra) {
        throw new Error('Lưu hóa đơn có Phiếu nhập phải chờ Kế toán đối chiếu và chưa được phát sinh công nợ.');
    }
    const preview = await request(`/accounting/purchase-invoices/${ids.invoice}/reconciliation-preview?MaPN=${ids.receipt}`, accounting);
    if (preview.result !== 'Đủ điều kiện ghi nhận công nợ' || preview.differences.length) {
        throw new Error('Bảng xem trước đối chiếu ba chứng từ không xác định đúng hồ sơ khớp.');
    }
    let confirmationBlocked = false;
    try {
        await request(`/accounting/purchase-invoices/${ids.invoice}/reconcile`, accounting, {
            method: 'POST', body: JSON.stringify({ MaPN: ids.receipt })
        });
    } catch (error) {
        confirmationBlocked = /chưa xác nhận/i.test(error.message);
    }
    if (!confirmationBlocked) throw new Error('Không được đối chiếu nếu Kế toán chưa bấm xác nhận riêng.');
    const invoice = await request(`/accounting/purchase-invoices/${ids.invoice}/reconcile`, accounting, {
        method: 'POST', body: JSON.stringify({ MaPN: ids.receipt, XacNhanDoiChieu: true })
    });
    ids.debt = invoice.MaCNPTra;
    if (invoice.TrangThaiDoiChieu !== 'Đã khớp' || !invoice.MaCNPTra) throw new Error('Hóa đơn khớp nhưng chưa phát sinh công nợ.');
    console.log(JSON.stringify({ result: 'PASS', product: product.MaSP, request: ids.purchaseRequest, order: ids.order, receipt: ids.receipt, invoice: ids.invoice, debt: ids.debt, stockIncrease: 7 }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    try { await cleanup(); console.log('CLEANUP PASS: dữ liệu kiểm thử đã được xóa và tồn kho đã khôi phục.'); }
    catch (error) { console.error('CLEANUP FAILED:', error); process.exitCode = 1; }
    process.exit(process.exitCode || 0);
});
