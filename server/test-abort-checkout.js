require('dotenv').config();
const assert = require('node:assert/strict');
const {
    decideAbortCheckout,
    cashToReturnFromPayments,
    expectedDrawerCash,
    allocateRefund,
    ABORT_CHECKOUT_VOID_NOTE
} = require('./src/services/financialRules');
const { decideCancelledInvoiceAction, decideGatewayAction } = require('./src/services/paymentGatewayService');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

const MIX = [
    { PhuongThuc: 'Tiền mặt', SoTien: 300_000, TrangThai: 'Thành công' },
    { PhuongThuc: 'QR', SoTien: 700_000, TrangThai: 'Chờ xác nhận' }
];

test('A — TM 300 + QR chờ: hủy phiên, trả khách 300k, không phải allocateRefund', () => {
    const decision = decideAbortCheckout({
        invoiceStatus: 'Nháp',
        tongThanhToan: 1_000_000,
        paidSuccess: 300_000,
        pendingCount: 1
    });
    assert.equal(decision.branch, 'A');
    assert.equal(decision.cancelled, true);
    assert.equal(decision.mustReturn, false);
    assert.equal(decision.voidSuccessfulPayments, true);
    assert.equal(decision.failPendingQr, true);
    assert.equal(decision.cancelInvoice, true);
    assert.equal(cashToReturnFromPayments(MIX), 300_000);
    const refund = allocateRefund(300_000, { QR: 0, TM: 300_000 });
    assert.equal(refund.ok, true, 'allocateRefund vẫn dùng cho trả hàng — không gọi khi hủy phiên');
    assert.match(ABORT_CHECKOUT_VOID_NOTE, /không phải phiếu trả/);
});

test('A — QR fail / hết chờ, TM còn: vẫn hủy, void TM', () => {
    const decision = decideAbortCheckout({
        invoiceStatus: 'Nháp',
        tongThanhToan: 1_000_000,
        paidSuccess: 300_000,
        pendingCount: 0
    });
    assert.equal(decision.branch, 'A');
    assert.equal(decision.cancelled, true);
});

test('A — nháp chưa thu: hủy được, cashToReturn = 0', () => {
    const decision = decideAbortCheckout({
        invoiceStatus: 'Nháp',
        tongThanhToan: 1_000_000,
        paidSuccess: 0,
        pendingCount: 0
    });
    assert.equal(decision.branch, 'A');
    assert.equal(cashToReturnFromPayments([]), 0);
});

test('B — query thấy QR thành công đủ 1tr: không hủy, hướng trả hàng', () => {
    const decision = decideAbortCheckout({
        invoiceStatus: 'Nháp',
        tongThanhToan: 1_000_000,
        paidSuccess: 1_000_000,
        pendingCount: 0
    });
    assert.equal(decision.branch, 'B');
    assert.equal(decision.cancelled, false);
    assert.equal(decision.completeInvoice, true);
    assert.equal(decision.mustReturn, true);
    assert.equal(decision.voidSuccessfulPayments, false);
});

test('B — HĐ đã Hoàn thành lúc bấm hủy (IPN vừa xong): không hủy', () => {
    const decision = decideAbortCheckout({
        invoiceStatus: 'Hoàn thành',
        tongThanhToan: 1_000_000,
        paidSuccess: 1_000_000,
        pendingCount: 0
    });
    assert.equal(decision.branch, 'B');
    assert.equal(decision.alreadyCompleted, true);
    assert.equal(decision.completeInvoice, false);
    assert.equal(decision.mustReturn, true);
});

test('Ca/két: 300k hủy phiên không vào TongTienMat như bán thành công', () => {
    const afterAbort = expectedDrawerCash({
        TienDauCa: 1_000_000,
        TongTienMat: 0,
        TongTienHoanMat: 0
    });
    assert.equal(afterAbort, 1_000_000);
    const ifMistakenAsSale = expectedDrawerCash({
        TienDauCa: 1_000_000,
        TongTienMat: 300_000,
        TongTienHoanMat: 0
    });
    assert.equal(ifMistakenAsSale, 1_300_000);
    assert.notEqual(afterAbort, ifMistakenAsSale);
});

test('IPN sau HĐ Đã hủy / dòng Đã hủy: không sống lại Thành công', () => {
    assert.equal(decideCancelledInvoiceAction({
        invoiceStatus: 'Đã hủy', paymentStatus: 'Chờ xác nhận'
    }), 'fail_pending');
    assert.equal(decideCancelledInvoiceAction({
        invoiceStatus: 'Đã hủy', paymentStatus: 'Đã hủy'
    }), 'ignore');
    assert.equal(decideGatewayAction({
        paymentStatus: 'Đã hủy',
        paymentAmount: 300000,
        paymentTransId: null,
        classification: 'success',
        ipnAmount: 300000,
        ipnTransId: '1'
    }), 'ignore');
});

test('QR đã Thành công nhưng chưa đủ HĐ — không hủy phiên (không void tiền cổng)', () => {
    const blocked = decideAbortCheckout({
        invoiceStatus: 'Nháp',
        tongThanhToan: 1_000_000,
        paidSuccess: 700_000,
        pendingCount: 0,
        paidQrSuccess: 400_000
    });
    assert.equal(blocked.error, 'successful_qr_blocks_abort');
    assert.equal(blocked.cancelled, false);
});

test('Không dùng phiếu trả cho hủy trước Hoàn thành', () => {
    const a = decideAbortCheckout({
        invoiceStatus: 'Nháp', tongThanhToan: 1_000_000, paidSuccess: 300_000, pendingCount: 1
    });
    assert.equal(a.mustReturn, false);
    const b = decideAbortCheckout({
        invoiceStatus: 'Hoàn thành', tongThanhToan: 1_000_000, paidSuccess: 1_000_000, pendingCount: 0
    });
    assert.equal(b.mustReturn, true);
});

const runDb = async () => {
    let sql;
    let poolPromise;
    let abortCheckoutPayment;
    try {
        ({ sql, poolPromise } = require('./src/config/db'));
        ({ abortCheckoutPayment } = require('./src/services/abortCheckoutService'));
        await poolPromise;
    } catch (error) {
        console.log(`↷ DB skip: ${error.message}`);
        return { ran: false, reason: error.message };
    }

    const pool = await poolPromise;
    const stamp = Date.now().toString().slice(-8);
    const maHdA = `HDA${stamp}`.slice(0, 20);
    const maHdB = `HDB${stamp}`.slice(0, 20);
    const maTmA = `TTA${stamp}`.slice(0, 20);
    const maQrA = `TTQ${stamp}`.slice(0, 20);
    const maTmB = `TTB${stamp}`.slice(0, 20);
    const maQrB = `TTC${stamp}`.slice(0, 20);

    const ctx = await pool.request().query(`
        SELECT TOP 1 hd.MaNV, hd.MaKho, hd.MaCa, tk.MaTK
        FROM HoaDon hd
        JOIN TaiKhoan tk ON tk.MaNV=hd.MaNV
        ORDER BY hd.NgayLap DESC`);
    const row = ctx.recordset[0];
    if (!row) {
        console.log('↷ DB skip: chưa có hóa đơn+tài khoản mẫu để lấy MaNV/MaTK/MaKho/MaCa.');
        return { ran: false, reason: 'no fixture invoice+account' };
    }

    const insertDraft = async (maHD, maTm, maQr, { completeHd = false } = {}) => {
        await pool.request()
            .input('MaHD', sql.VarChar, maHD)
            .input('MaNV', sql.VarChar, row.MaNV)
            .input('MaKho', sql.VarChar, row.MaKho)
            .input('MaCa', sql.VarChar, row.MaCa)
            .input('TrangThai', sql.NVarChar, completeHd ? 'Hoàn thành' : 'Nháp')
            .query(`
                INSERT HoaDon(MaHD,MaKH,MaNV,MaKho,MaCa,NgayLap,TongTienHang,TienGiamGia,
                    DiemSuDung,TienDiemQuyDoi,TongThanhToan,TrangThai,DiemCong)
                VALUES(@MaHD,NULL,@MaNV,@MaKho,@MaCa,GETDATE(),1000000,0,0,0,1000000,@TrangThai,0)`);
        await pool.request()
            .input('MaTT', sql.VarChar, maTm)
            .input('MaHD', sql.VarChar, maHD)
            .query(`
                INSERT ThanhToan(MaTT,MaHD,PhuongThuc,SoTien,NgayTT,TrangThai,NgayXacNhan,NguonXacNhan)
                VALUES(@MaTT,@MaHD,N'Tiền mặt',300000,GETDATE(),N'Thành công',GETDATE(),N'ThuCong')`);
        await pool.request()
            .input('MaTT', sql.VarChar, maQr)
            .input('MaHD', sql.VarChar, maHD)
            .input('TrangThai', sql.NVarChar, completeHd ? 'Thành công' : 'Chờ xác nhận')
            .query(`
                INSERT ThanhToan(MaTT,MaHD,PhuongThuc,SoTien,NgayTT,TrangThai,NguonXacNhan)
                VALUES(@MaTT,@MaHD,N'QR',700000,GETDATE(),@TrangThai,N'ZaloPay')`);
    };

    const cleanup = async () => {
        for (const maHD of [maHdA, maHdB]) {
            await pool.request().input('MaHD', sql.VarChar, maHD)
                .query('DELETE ThanhToan WHERE MaHD=@MaHD; DELETE HoaDon WHERE MaHD=@MaHD');
        }
    };

    try {
        await insertDraft(maHdA, maTmA, maQrA);
        const user = { MaNV: row.MaNV, MaTK: row.MaTK, TenDangNhap: 'test-abort' };
        const a = await abortCheckoutPayment({
            maHD: maHdA,
            lyDo: 'Test nhánh A',
            user,
            req: {},
            queryPendingQr: async () => []
        });
        assert.equal(a.body.branch, 'A');
        assert.equal(a.body.cancelled, true);
        assert.equal(a.body.cashToReturn, 300_000);
        assert.equal(a.body.createdReturnTicket, false);
        assert.equal(a.body.createdGiaoDichHoan, false);
        assert.equal(a.body.TrangThai, 'Đã hủy');

        const afterA = await pool.request().input('MaHD', sql.VarChar, maHdA).query(`
            SELECT hd.TrangThai HdTt,
                   (SELECT COUNT(*) FROM PhieuDoiTra WHERE MaHD=hd.MaHD) Phieu,
                   (SELECT COUNT(*) FROM ThanhToan WHERE MaHD=hd.MaHD AND PhuongThuc=N'Tiền mặt' AND TrangThai=N'Đã hủy') TmVoid,
                   (SELECT COUNT(*) FROM ThanhToan WHERE MaHD=hd.MaHD AND PhuongThuc=N'QR' AND TrangThai=N'Thất bại') QrFail,
                   (SELECT COUNT(*) FROM ThanhToan WHERE MaHD=hd.MaHD AND TrangThai=N'Thành công') StillOk
            FROM HoaDon hd WHERE hd.MaHD=@MaHD`);
        const snapA = afterA.recordset[0];
        assert.equal(snapA.HdTt, 'Đã hủy');
        assert.equal(Number(snapA.Phieu), 0);
        assert.equal(Number(snapA.TmVoid), 1);
        assert.equal(Number(snapA.QrFail), 1);
        assert.equal(Number(snapA.StillOk), 0);

        const shiftLike = await pool.request().input('MaHD', sql.VarChar, maHdA).query(`
            SELECT COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Tiền mặt' AND tt.TrangThai=N'Thành công'
                THEN tt.SoTien ELSE 0 END),0) TongTienMat
            FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
            WHERE hd.MaHD=@MaHD AND hd.TrangThai=N'Hoàn thành'`);
        assert.equal(Number(shiftLike.recordset[0].TongTienMat), 0);
        console.log('✓ DB A — TM+QR pending → hủy, không phiếu trả, ca không cộng 300k');

        await insertDraft(maHdB, maTmB, maQrB, { completeHd: true });
        const b = await abortCheckoutPayment({
            maHD: maHdB,
            lyDo: 'Test nhánh B race',
            user,
            req: {},
            queryPendingQr: async () => [{ TrangThai: 'Thành công', completed: true }]
        });
        assert.equal(b.body.branch, 'B');
        assert.equal(b.body.cancelled, false);
        assert.equal(b.body.mustReturn, true);
        assert.equal(b.body.completed, true);
        const afterB = await pool.request().input('MaHD', sql.VarChar, maHdB).query(`
            SELECT TrangThai FROM HoaDon WHERE MaHD=@MaHD`);
        assert.equal(afterB.recordset[0].TrangThai, 'Hoàn thành');
        const stillTm = await pool.request().input('MaHD', sql.VarChar, maHdB).query(`
            SELECT TrangThai FROM ThanhToan WHERE MaHD=@MaHD AND PhuongThuc=N'Tiền mặt'`);
        assert.equal(stillTm.recordset[0].TrangThai, 'Thành công');
        console.log('✓ DB B — race QR đã đủ / HĐ Hoàn thành → không hủy');

        return { ran: true };
    } finally {
        await cleanup().catch(() => {});
    }
};

(async () => {
    console.log('ABORT CHECKOUT unit: decide A/B, 300k không vào két, không phiếu trả.');
    const db = await runDb();
    if (db.ran) console.log('ABORT CHECKOUT PASS (unit + DB).');
    else console.log(`ABORT CHECKOUT PASS (unit). DB chưa chạy: ${db.reason}`);
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
