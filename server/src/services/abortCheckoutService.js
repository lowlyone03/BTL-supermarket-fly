const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('./auditLog');
const {
    ABORT_CHECKOUT_VOID_NOTE,
    cashToReturnFromPayments,
    decideAbortCheckout,
    roundMoney
} = require('./financialRules');
const {
    failPendingPaymentsForInvoice,
    paymentTotals,
    queryOrResolve
} = require('./paymentGatewayService');

const moneyVi = value => `${Number(value || 0).toLocaleString('vi-VN')}đ`;

const abortError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

/**
 * Query mọi QR đang Chờ trên HĐ — một lần cuối trước khi hủy thanh toán.
 * Nếu không query được: KHÔNG hủy (tránh nhánh A khi QR đã thành công phía ZaloPay).
 */
const queryPendingQrLastTime = async ({ maHD, user, req, queryPendingQr }) => {
    if (typeof queryPendingQr === 'function') {
        return queryPendingQr({ maHD, user, req });
    }
    const pool = await poolPromise;
    const pending = await new sql.Request(pool)
        .input('MaHD', sql.VarChar, maHD)
        .query(`
            SELECT MaTT FROM ThanhToan
            WHERE MaHD=@MaHD AND PhuongThuc=N'QR' AND TrangThai=N'Chờ xác nhận'
            ORDER BY NgayTT`);
    const results = [];
    for (const row of pending.recordset) {
        try {
            results.push(await queryOrResolve({
                maHD,
                maTT: row.MaTT,
                user,
                req,
                failIfFinal: false
            }));
        } catch (error) {
            throw abortError(
                'Chưa query được ZaloPay lần cuối. Không hủy thanh toán — bấm Query lại rồi thử hủy.',
                409
            );
        }
    }
    return results;
};

/**
 * Đảo dòng ThanhToan đã Thành công khi hủy phiên (nhánh A).
 * Không tạo GiaoDichHoan / phiếu chi — đây không phải hoàn tiền trả hàng.
 * Trạng thái Đã hủy (không phải Thất bại cổng) để ca/két không cộng như bán thành công.
 */
const voidSuccessfulPaymentsForAbort = async (connection, maHD) => {
    const result = await new sql.Request(connection)
        .input('MaHD', sql.VarChar, maHD)
        .input('GhiChu', sql.NVarChar, ABORT_CHECKOUT_VOID_NOTE.slice(0, 200))
        .query(`
            UPDATE ThanhToan
            SET TrangThai=N'Đã hủy', NgayXacNhan=GETDATE(), GhiChu=@GhiChu
            OUTPUT DELETED.MaTT, DELETED.PhuongThuc, DELETED.SoTien
            WHERE MaHD=@MaHD AND TrangThai=N'Thành công'`);
    return result.recordset || [];
};

const countReturnArtifacts = async (connection, maHD) => {
    let phieuDoiTra = 0;
    let giaoDichHoan = 0;
    try {
        const tickets = await new sql.Request(connection)
            .input('MaHD', sql.VarChar, maHD)
            .query('SELECT COUNT(*) AS n FROM PhieuDoiTra WHERE MaHD=@MaHD');
        phieuDoiTra = Number(tickets.recordset[0]?.n || 0);
    } catch { /* schema cũ không có bảng — coi như 0 */ }
    try {
        const lines = await new sql.Request(connection)
            .input('MaHD', sql.VarChar, maHD)
            .query(`
                SELECT COUNT(*) AS n
                FROM GiaoDichHoan gd
                JOIN PhieuDoiTra p ON p.MaDT=gd.MaPhieuTra
                WHERE p.MaHD=@MaHD`);
        giaoDichHoan = Number(lines.recordset[0]?.n || 0);
    } catch { /* GiaoDichHoan chưa migrate */ }
    return { phieuDoiTra, giaoDichHoan };
};

const loadInvoiceForAbort = async (connection, maHD, maNV) => {
    const header = await new sql.Request(connection)
        .input('MaHD', sql.VarChar, maHD)
        .input('MaNV', sql.VarChar, maNV)
        .query(`
            SELECT hd.MaHD, hd.TrangThai, hd.TongThanhToan, hd.MaNV, hd.MaCa, hd.MaKho
            FROM HoaDon hd WITH (UPDLOCK, HOLDLOCK)
            WHERE hd.MaHD=@MaHD AND hd.MaNV=@MaNV`);
    return header.recordset[0] || null;
};

const branchBBody = ({ maHD, alreadyCompleted, cashToReturn = 0 }) => ({
    cancelled: false,
    completed: true,
    alreadyCompleted: Boolean(alreadyCompleted),
    branch: 'B',
    mustReturn: true,
    cashToReturn,
    createdReturnTicket: false,
    createdGiaoDichHoan: false,
    MaHD: maHD,
    TrangThai: 'Hoàn thành',
    message: 'Khách đã thanh toán đủ. Không hủy hóa đơn — lập phiếu Trả hàng – Hoàn tiền.'
});

const branchABody = ({
    maHD,
    cashToReturn,
    voidedPayments,
    clearedPending,
    alreadyCancelled
}) => {
    const cash = roundMoney(cashToReturn);
    const message = alreadyCancelled
        ? `Hóa đơn ${maHD} đã hủy trước đó.`
        : cash > 0
            ? `Đã hủy thanh toán. Đưa lại khách ${moneyVi(cash)} tiền mặt đã thu. Hóa đơn ${maHD} Đã hủy. Không lập phiếu trả hàng, không ghi doanh thu.`
            : `Đã hủy hóa đơn nháp ${maHD}. Không ghi sổ / không trừ kho.`;
    return {
        cancelled: true,
        completed: false,
        alreadyCancelled: Boolean(alreadyCancelled),
        branch: 'A',
        mustReturn: false,
        cashToReturn: cash,
        voidedPayments: voidedPayments || 0,
        clearedPending: clearedPending || 0,
        createdReturnTicket: false,
        createdGiaoDichHoan: false,
        stockReleased: true,
        MaHD: maHD,
        TrangThai: 'Đã hủy',
        message
    };
};

/**
 * Hủy thanh toán trên HĐ nháp (mục 2 + 14).
 * @param {object} opts
 * @param {function} [opts.queryPendingQr] — inject cho test (bỏ qua ZaloPay thật)
 */
const abortCheckoutPayment = async ({ maHD, lyDo, user, req, queryPendingQr } = {}) => {
    if (!maHD) throw abortError('Thiếu mã hóa đơn.', 400);
    await queryPendingQrLastTime({ maHD, user, req, queryPendingQr });

    const transaction = new sql.Transaction(await poolPromise);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const invoice = await loadInvoiceForAbort(transaction, maHD, user.MaNV);
        if (!invoice) {
            await transaction.rollback();
            throw abortError('Không tìm thấy hóa đơn.', 404);
        }

        const totals = await paymentTotals(transaction, maHD);
        const qrPaid = await new sql.Request(transaction)
            .input('MaHD', sql.VarChar, maHD)
            .query(`
                SELECT COALESCE(SUM(SoTien),0) PaidQr
                FROM ThanhToan WITH (UPDLOCK, HOLDLOCK)
                WHERE MaHD=@MaHD AND PhuongThuc=N'QR' AND TrangThai=N'Thành công'`);
        const decision = decideAbortCheckout({
            invoiceStatus: invoice.TrangThai,
            tongThanhToan: invoice.TongThanhToan,
            paidSuccess: totals.paid,
            pendingCount: totals.pendingCount,
            paidQrSuccess: Number(qrPaid.recordset[0].PaidQr || 0)
        });

        if (decision.error === 'not_draft') {
            await transaction.rollback();
            throw abortError('Không thể hủy hóa đơn đã thanh toán hoặc không còn ở trạng thái Nháp.', 400);
        }
        if (decision.error === 'successful_qr_blocks_abort') {
            await transaction.rollback();
            throw abortError(
                'Đã có thanh toán QR thành công. Không hủy phiên — hoàn thành phần còn lại hoặc lập Trả hàng sau khi hóa đơn Hoàn thành.',
                409
            );
        }

        if (decision.branch === 'B') {
            if (decision.completeInvoice) {
                const sales = require('../controllers/salesController');
                await sales.completeInvoiceInternal(transaction, {
                    maHD,
                    actorMaNV: invoice.MaNV,
                    user,
                    req,
                    requireOwnerShift: false,
                    auditNote: 'Hủy thanh toán — query ZaloPay lần cuối thấy đã đủ tiền, hoàn thành HĐ'
                });
            }
            await logAudit(transaction, {
                user, req, action: 'Hủy thanh toán', table: 'HoaDon', recordId: maHD, uc: 'UC24',
                result: 'Từ chối',
                severity: 'Cảnh báo',
                content: 'Nhánh B: QR/tiền đã đủ lúc query lần cuối. Không hủy HĐ — chuyển Trả hàng – Hoàn tiền. Không tạo phiếu trả tại bước này.'
            });
            await transaction.commit();
            return { httpStatus: 200, body: branchBBody({ maHD, alreadyCompleted: decision.alreadyCompleted }) };
        }

        if (decision.alreadyCancelled) {
            await transaction.commit();
            return { httpStatus: 200, body: branchABody({ maHD, cashToReturn: 0, alreadyCancelled: true }) };
        }

        let clearedPending = 0;
        if (decision.failPendingQr) {
            clearedPending = await failPendingPaymentsForInvoice(
                transaction,
                maHD,
                'Hủy thanh toán — void QR pending, không ghi nhận Thành công'
            );
        }

        let voided = [];
        if (decision.voidSuccessfulPayments) {
            voided = await voidSuccessfulPaymentsForAbort(transaction, maHD);
        }
        const cashToReturn = cashToReturnFromPayments(
            voided.map(row => ({ ...row, TrangThai: 'Thành công' }))
        );

        const updated = await new sql.Request(transaction)
            .input('MaHD', sql.VarChar, maHD)
            .input('MaNV', sql.VarChar, user.MaNV)
            .input('LyDo', sql.NVarChar, lyDo || 'Hủy thanh toán')
            .query(`
                UPDATE HoaDon SET TrangThai=N'Đã hủy', GhiChu=@LyDo
                WHERE MaHD=@MaHD AND MaNV=@MaNV AND TrangThai=N'Nháp';
                SELECT @@ROWCOUNT affected;`);
        if (!updated.recordset[0].affected) {
            await transaction.rollback();
            throw abortError('Không thể hủy hóa đơn đã thanh toán hoặc không còn ở trạng thái Nháp.', 400);
        }

        const artifacts = await countReturnArtifacts(transaction, maHD);
        if (artifacts.phieuDoiTra || artifacts.giaoDichHoan) {
            await transaction.rollback();
            throw abortError('Hủy thanh toán không được đụng phiếu trả hàng. Giao dịch bị hủy để bảo toàn dữ liệu.', 409);
        }

        await logAudit(transaction, {
            user, req, action: 'Hủy thanh toán', table: 'HoaDon', recordId: maHD, uc: 'UC24',
            severity: 'Cảnh báo',
            content: `${lyDo ? `Lý do: ${lyDo}. ` : ''}Nhánh A: HĐ Đã hủy. Void ${voided.length} dòng Thành công (TM trả khách ${moneyVi(cashToReturn)}). Fail ${clearedPending} QR chờ. Không PhieuDoiTra, không GiaoDichHoan. Tồn chưa trừ (HĐ chưa Hoàn thành). Ca không cộng TM này vào TongTienMat.`
        });
        await transaction.commit();
        return {
            httpStatus: 200,
            body: branchABody({
                maHD,
                cashToReturn,
                voidedPayments: voided.length,
                clearedPending
            })
        };
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        throw error;
    }
};

module.exports = {
    abortCheckoutPayment,
    queryPendingQrLastTime,
    voidSuccessfulPaymentsForAbort,
    decideAbortCheckout,
    cashToReturnFromPayments
};
