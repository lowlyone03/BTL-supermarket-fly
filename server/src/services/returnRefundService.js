const { sql } = require('../config/db');
const { logAudit } = require('./auditLog');
const zalopay = require('./providers/zalopay');
const { ensureReturnRefundSchema } = require('./returnRefundSchema');
const {
    roundMoney, defaultRefundMethod, cashierMayRefundCash, cashRefundDrawerBlock,
    expectedDrawerCash, refundableQrRemaining, zpTransIdOf, nextRefundSendAction,
    RETURN_MONEY_PENDING, RETURN_MONEY_FAILED, exchangeMoneyDelta
} = require('./financialRules');
const { postReturnJournals } = require('./accountingHooks');

const HOAN_CHO_GUI = 'CHO_GUI';
const HOAN_DANG = 'DANG_XU_LY';
const HOAN_OK = 'THANH_CONG';
const HOAN_FAIL = 'THAT_BAI';

const requestOf = (connection) => (
    typeof connection.request === 'function' ? connection.request() : new sql.Request(connection)
);

const generateId = async (transaction, table, column, prefix) => {
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 ${column} Id FROM ${table} WITH (UPDLOCK,HOLDLOCK)
                WHERE ${column} LIKE @Prefix ORDER BY ${column} DESC`);
    const last = result.recordset[0]?.Id;
    return `${prefix}${String(last ? Number(last.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
};

const vietnamYymmdd = () => {
    const iso = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    return iso.slice(2).replaceAll('-', '');
};

const refundError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const loadSuccessfulPayments = async (connection, maHD) => {
    const result = await requestOf(connection).input('MaHD', sql.VarChar, maHD).query(`
        SELECT MaTT, PhuongThuc, SoTien, TrangThai, MaGiaoDich, NguonXacNhan, GhiChu, NgayTT
        FROM ThanhToan
        WHERE MaHD=@MaHD AND TrangThai=N'Thành công'
        ORDER BY SoTien DESC, NgayTT`);
    return result.recordset;
};

const originalQrPayment = (payments) => (payments || []).find(row =>
    String(row.PhuongThuc || '') === 'QR' || /zalo|momo|^qr$/i.test(String(row.PhuongThuc || ''))
) || null;

const originalQrPaid = (payments) => roundMoney((payments || [])
    .filter(row => canonicalQr(row.PhuongThuc))
    .reduce((sum, row) => sum + Number(row.SoTien || 0), 0));

const canonicalQr = method => /zalo|momo|^qr$/i.test(String(method || '').trim());

const loadRefundedQrOnInvoice = async (connection, maHD) => {
    await ensureReturnRefundSchema(connection);
    const result = await requestOf(connection).input('MaHD', sql.VarChar, maHD).query(`
        SELECT COALESCE((
            SELECT SUM(gd.SoTienHoan) FROM GiaoDichHoan gd
            JOIN PhieuDoiTra dt ON dt.MaDT=gd.MaPhieuTra
            WHERE dt.MaHD=@MaHD AND gd.TrangThaiHoan=N'THANH_CONG'
        ),0) DaHoanTx,
        COALESCE((
            SELECT SUM(dt.SoTienHoan) FROM PhieuDoiTra dt
            WHERE dt.MaHD=@MaHD AND dt.TrangThai=N'Hoàn thành'
              AND dt.PhuongThucHoan=N'QR'
              AND NOT EXISTS (
                    SELECT 1 FROM GiaoDichHoan gd
                    WHERE gd.MaPhieuTra=dt.MaDT AND gd.TrangThaiHoan=N'THANH_CONG'
              )
        ),0) DaHoanPhieu`);
    return roundMoney(Number(result.recordset[0]?.DaHoanTx || 0) + Number(result.recordset[0]?.DaHoanPhieu || 0));
};

const remainingQrRefundable = async (connection, maHD) => {
    const payments = await loadSuccessfulPayments(connection, maHD);
    const paid = originalQrPaid(payments);
    const done = await loadRefundedQrOnInvoice(connection, maHD);
    return {
        payments,
        originalQr: originalQrPayment(payments),
        paid,
        already: done,
        remaining: refundableQrRemaining(paid, done)
    };
};

const loadLatestRefundTx = async (connection, maDT) => {
    await ensureReturnRefundSchema(connection);
    const result = await requestOf(connection).input('MaDT', sql.VarChar, maDT).query(`
        SELECT TOP 1 * FROM GiaoDichHoan
        WHERE MaPhieuTra=@MaDT
        ORDER BY NgayYeuCau DESC, MaGiaoDichHoan DESC`);
    return result.recordset[0] || null;
};

const loadOpenShiftDrawer = async (connection, maCa) => {
    const drawer = await requestOf(connection).input('MaCa', sql.VarChar, maCa).query(`
        SELECT ca.TienDauCa,
          COALESCE((
            SELECT SUM(CASE WHEN tt.PhuongThuc=N'Tiền mặt' AND tt.TrangThai=N'Thành công' THEN tt.SoTien ELSE 0 END)
            FROM ThanhToan tt JOIN HoaDon hd ON hd.MaHD=tt.MaHD
            WHERE hd.MaCa=@MaCa AND hd.TrangThai=N'Hoàn thành'
          ),0) TongTienMat,
          COALESCE((
            SELECT SUM(CASE WHEN dt.PhuongThucHoan=N'Tiền mặt' THEN dt.SoTienHoan ELSE 0 END)
            FROM PhieuDoiTra dt
            WHERE dt.TrangThai=N'Hoàn thành'
              AND (dt.MaCaHoan=@MaCa OR (dt.MaCaHoan IS NULL AND dt.NgayHoan BETWEEN
                  (SELECT ThoiGianBatDau FROM CaLamViec WHERE MaCa=@MaCa)
                  AND COALESCE((SELECT ThoiGianKetThuc FROM CaLamViec WHERE MaCa=@MaCa),GETDATE())))
          ),0) TongTienHoanMat
        FROM CaLamViec ca WHERE ca.MaCa=@MaCa`);
    const row = drawer.recordset[0] || {};
    return {
        ...row,
        TienMatTrongKet: expectedDrawerCash(row)
    };
};

const assertCashDrawerEnough = (soTienHoan, tienMatTrongKet) => {
    const message = cashRefundDrawerBlock({ soTienHoan, tienMatTrongKet });
    if (message) throw refundError(message);
};

const resolveRefundMethod = ({ originalMethod, payments, requested }) => {
    const original = defaultRefundMethod(originalMethod, payments);
    const ask = String(requested || '').trim();
    if (original === 'QR') {
        if (ask && ask !== 'QR' && !/zalo/i.test(ask)) {
            throw refundError('Hóa đơn gốc ZaloPay/QR thì phải hoàn ZaloPay. Thu ngân không được đổi sang tiền mặt.');
        }
        return 'QR';
    }
    if (original === 'Tiền mặt') return 'Tiền mặt';
    return original;
};

const buildMRefundId = ({ appId, maDT, attempt = 1 }) => {
    const yymmdd = vietnamYymmdd();
    const suffix = Number(attempt) > 1 ? `r${attempt}` : '';
    return `${yymmdd}_${appId}_${maDT}${suffix}`.slice(0, 45);
};

const countRefundAttempts = async (connection, maDT) => {
    const result = await requestOf(connection).input('MaDT', sql.VarChar, maDT)
        .query('SELECT COUNT(*) So FROM GiaoDichHoan WHERE MaPhieuTra=@MaDT');
    return Number(result.recordset[0]?.So || 0);
};

const insertRefundTx = async (transaction, {
    maDT, zpTransId, mRefundId, amount, status = HOAN_CHO_GUI, errorCode = null, errorText = null
}) => {
    const prefix = `GH${vietnamYymmdd()}`;
    const maGD = await generateId(transaction, 'GiaoDichHoan', 'MaGiaoDichHoan', prefix);
    await new sql.Request(transaction)
        .input('MaGD', sql.VarChar, maGD)
        .input('MaDT', sql.VarChar, maDT)
        .input('Zp', sql.VarChar, String(zpTransId).slice(0, 50))
        .input('MRefund', sql.VarChar, String(mRefundId).slice(0, 45))
        .input('SoTien', sql.Decimal(18, 2), amount)
        .input('TrangThai', sql.VarChar, status)
        .input('MaLoi', sql.NVarChar, errorCode)
        .input('Loi', sql.NVarChar, errorText)
        .query(`
            INSERT GiaoDichHoan(MaGiaoDichHoan,MaPhieuTra,ZpTransIdGoc,MRefundId,SoTienHoan,TrangThaiHoan,MaLoi,NoiDungLoi)
            VALUES(@MaGD,@MaDT,@Zp,@MRefund,@SoTien,@TrangThai,@MaLoi,@Loi)`);
    return maGD;
};

const updateRefundTx = async (connection, maGD, patch = {}) => {
    await requestOf(connection)
        .input('MaGD', sql.VarChar, maGD)
        .input('TrangThai', sql.VarChar, patch.TrangThaiHoan || null)
        .input('RefundId', sql.VarChar, patch.RefundId || null)
        .input('MaLoi', sql.NVarChar, patch.MaLoi == null ? null : String(patch.MaLoi).slice(0, 50))
        .input('Loi', sql.NVarChar, patch.NoiDungLoi == null ? null : String(patch.NoiDungLoi).slice(0, 500))
        .input('Done', sql.Bit, patch.done ? 1 : 0)
        .query(`
            UPDATE GiaoDichHoan SET
                TrangThaiHoan=COALESCE(@TrangThai, TrangThaiHoan),
                RefundId=COALESCE(@RefundId, RefundId),
                MaLoi=@MaLoi,
                NoiDungLoi=@Loi,
                NgayHoanThanh=CASE WHEN @Done=1 THEN GETDATE() ELSE NgayHoanThanh END
            WHERE MaGiaoDichHoan=@MaGD`);
};

const markTicketRefunding = async (transaction, { maDT, maCa, amount, mRefundId }) => {
    await new sql.Request(transaction)
        .input('MaDT', sql.VarChar, maDT)
        .input('MaCa', sql.VarChar, maCa)
        .input('SoTien', sql.Decimal(18, 2), amount)
        .input('MaGD', sql.VarChar, mRefundId)
        .query(`
            UPDATE PhieuDoiTra SET
                PhuongThucHoan=N'QR',
                MaGiaoDichHoan=@MaGD,
                SoTienHoan=@SoTien,
                MaCaHoan=@MaCa,
                TrangThai=N'Đang hoàn tiền',
                NgayHoan=NULL
            WHERE MaDT=@MaDT`);
};

const markTicketFailed = async (connection, { maDT, message, mRefundId }) => {
    await requestOf(connection)
        .input('MaDT', sql.VarChar, maDT)
        .input('MaGD', sql.VarChar, mRefundId || null)
        .input('GhiChu', sql.NVarChar, String(message || 'Hoàn ZaloPay thất bại').slice(0, 500))
        .query(`
            UPDATE PhieuDoiTra SET
                TrangThai=N'Hoàn tiền thất bại',
                MaGiaoDichHoan=COALESCE(@MaGD, MaGiaoDichHoan),
                GhiChu=@GhiChu,
                NgayHoan=NULL
            WHERE MaDT=@MaDT`);
};

const markTicketDone = async (transaction, {
    maDT, maCa, method, amount, maGD, soTienThuThem = 0, phuongThucThuThem = null
}) => {
    await new sql.Request(transaction)
        .input('MaDT', sql.VarChar, maDT)
        .input('MaCa', sql.VarChar, maCa)
        .input('PhuongThuc', sql.NVarChar, method)
        .input('MaGD', sql.VarChar, maGD || null)
        .input('SoTien', sql.Decimal(18, 2), amount)
        .input('ThuThem', sql.Decimal(18, 2), soTienThuThem)
        .input('PtThu', sql.NVarChar, phuongThucThuThem)
        .query(`
            UPDATE PhieuDoiTra SET
                TrangThai=N'Hoàn thành',
                PhuongThucHoan=@PhuongThuc,
                MaGiaoDichHoan=@MaGD,
                SoTienHoan=@SoTien,
                SoTienThuThem=@ThuThem,
                PhuongThucThuThem=@PtThu,
                NgayHoan=GETDATE(),
                MaCaHoan=COALESCE(MaCaHoan, @MaCa)
            WHERE MaDT=@MaDT`);
};

const assertQrRefundReady = async (connection, { maHD, amount, maDT }) => {
    const cap = await remainingQrRefundable(connection, maHD);
    const pay = cap.originalQr;
    if (!pay) {
        throw refundError('Hóa đơn gốc không có thanh toán QR thành công để hoàn ZaloPay.');
    }
    const source = String(pay.NguonXacNhan || '').trim();
    if (source && source !== 'ZaloPay') {
        throw refundError(
            `Thanh toán gốc là ${source}, không phải ZaloPay. Không gửi hoàn ZaloPay. Dùng kênh gốc hoặc kế toán ghi thủ công TK 112.`
        );
    }
    const zp = zpTransIdOf(pay);
    if (!zp) {
        throw refundError(
            'Hóa đơn QR này thiếu mã giao dịch ZaloPay (zp_trans_id). Không thể hoàn tự động — không bịa mã. Liên hệ kế toán đối soát TK 112.'
        );
    }
    const alreadyThis = (await loadLatestRefundTx(connection, maDT));
    const alreadyOk = alreadyThis && alreadyThis.TrangThaiHoan === HOAN_OK
        ? Number(alreadyThis.SoTienHoan || 0)
        : 0;
    const remaining = refundableQrRemaining(cap.paid, cap.already - alreadyOk);
    if (roundMoney(amount) > remaining) {
        throw refundError(
            `Số tiền hoàn vượt phần QR còn lại trên hóa đơn gốc. Đã hoàn ${cap.already.toLocaleString('vi-VN')} đ / ${cap.paid.toLocaleString('vi-VN')} đ. Còn hoàn được ${remaining.toLocaleString('vi-VN')} đ.`
        );
    }
    return { zpTransId: zp, payment: pay, remaining, paid: cap.paid };
};

/**
 * Gửi hoàn ZaloPay. Gọi refund ≠ khách đã có tiền.
 * Một phiếu một m_refund_id đang xử lý — PROCESSING thì chỉ Query, không mint id mới.
 */
const sendZaloPayRefund = async ({ connection, ticket, amount, maCa, user, req, forceNewAfterFail = false }) => {
    await ensureReturnRefundSchema(connection);
    const latest = await loadLatestRefundTx(connection, ticket.MaDT);
    if (latest) {
        const action = nextRefundSendAction({ currentTxStatus: latest.TrangThaiHoan });
        if (action === 'already_done') {
            return { alreadyDone: true, tx: latest };
        }
        if (action === 'query_only') {
            return { queryOnly: true, tx: latest, mRefundId: latest.MRefundId };
        }
        if (action === 'resend_after_fail' && !forceNewAfterFail) {
            return { queryOnly: true, tx: latest, mRefundId: latest.MRefundId, mustQueryFirst: true };
        }
    }

    const ready = await assertQrRefundReady(connection, {
        maHD: ticket.MaHD, amount, maDT: ticket.MaDT
    });
    const attempt = (await countRefundAttempts(connection, ticket.MaDT)) + 1;
    const cfg = zalopay.getConfig();
    const mRefundId = latest && latest.TrangThaiHoan === HOAN_FAIL && forceNewAfterFail
        ? buildMRefundId({ appId: cfg.appId, maDT: ticket.MaDT, attempt })
        : (latest?.MRefundId || buildMRefundId({ appId: cfg.appId, maDT: ticket.MaDT, attempt: 1 }));

    if (latest && latest.TrangThaiHoan === HOAN_FAIL && forceNewAfterFail && latest.MRefundId === mRefundId) {
        throw refundError('Không tạo m_refund_id mới khi bản ghi cũ vẫn đang xử lý. Hãy Query Refund.');
    }

    const { poolPromise } = require('../config/db');
    const db = await poolPromise;
    const work = new sql.Transaction(db);
    let maGD;
    await work.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        maGD = latest && !forceNewAfterFail ? latest.MaGiaoDichHoan : null;
        if (!maGD) {
            maGD = await insertRefundTx(work, {
                maDT: ticket.MaDT,
                zpTransId: ready.zpTransId,
                mRefundId,
                amount,
                status: HOAN_DANG
            });
        } else {
            await updateRefundTx(work, maGD, { TrangThaiHoan: HOAN_DANG, MaLoi: null, NoiDungLoi: null });
        }
        await markTicketRefunding(work, {
            maDT: ticket.MaDT, maCa, amount, mRefundId
        });
        await work.commit();
    } catch (error) {
        if (work._aborted !== true) await work.rollback().catch(() => {});
        throw error;
    }

    let created;
    try {
        created = await zalopay.createRefund({
            zpTransId: ready.zpTransId,
            amount,
            mRefundId,
            description: `Fly hoan ${ticket.MaDT} ${ticket.MaHD}`,
            timestamp: Date.now()
        });
    } catch (error) {
        await updateRefundTx(db, maGD, {
            TrangThaiHoan: error.clearFailure ? HOAN_FAIL : HOAN_DANG,
            MaLoi: error.resultCode == null ? 'SEND' : String(error.resultCode),
            NoiDungLoi: error.message,
            done: Boolean(error.clearFailure)
        });
        if (error.clearFailure) {
            await markTicketFailed(db, { maDT: ticket.MaDT, message: error.message, mRefundId });
        }
        throw error;
    }

    const pool = db;
    const failed = created.classification === 'failure';
    await updateRefundTx(pool, maGD, {
        TrangThaiHoan: failed ? HOAN_FAIL : HOAN_DANG,
        RefundId: created.refundId,
        MaLoi: failed ? String(created.subReturnCode || created.resultCode || '') : null,
        NoiDungLoi: failed ? (created.subReturnMessage || created.message) : null,
        done: failed
    });
    if (failed) {
        await markTicketFailed(pool, {
            maDT: ticket.MaDT,
            message: created.subReturnMessage || created.message || 'ZaloPay từ chối hoàn (có thể hạn mức hoàn một phần).',
            mRefundId
        });
    }
    if (user) {
        await logAudit(pool, {
            user, req, action: 'Gửi hoàn ZaloPay', table: 'PhieuDoiTra', recordId: ticket.MaDT,
            uc: 'UC26', severity: 'Quan trọng',
            content: `m_refund_id ${mRefundId}. ${failed ? 'Thất bại' : 'Đang xử lý — chưa ghi Có 112'}.`
        });
    }
    return {
        pending: !failed,
        failed,
        mRefundId,
        MaGiaoDichHoan: maGD,
        message: failed
            ? (created.subReturnMessage || created.message)
            : 'Yêu cầu hoàn đã gửi / Đang xử lý. Khách có thể về — Fly tự Query Refund.',
        tx: { MRefundId: mRefundId, TrangThaiHoan: failed ? HOAN_FAIL : HOAN_DANG }
    };
};

const finalizeSuccessfulRefund = async (transaction, { ticket, tx, maCa, user, req }) => {
    await updateRefundTx(transaction, tx.MaGiaoDichHoan, {
        TrangThaiHoan: HOAN_OK,
        RefundId: tx.RefundId,
        MaLoi: null,
        NoiDungLoi: null,
        done: true
    });
    await markTicketDone(transaction, {
        maDT: ticket.MaDT,
        maCa,
        method: 'QR',
        amount: Number(tx.SoTienHoan || ticket.SoTienHoan || 0),
        maGD: tx.MRefundId
    });
    await postReturnJournals(transaction, {
        maDT: ticket.MaDT, maNV: user?.MaNV, user, includeMoney: true, includeStock: false
    });
    if (user) {
        await logAudit(transaction, {
            user, req, action: 'Hoàn thành đổi trả', table: 'PhieuDoiTra', recordId: ticket.MaDT,
            uc: 'UC26', severity: 'Quan trọng',
            content: `ZaloPay refund THANH_CONG m_refund_id ${tx.MRefundId}. Có 112 khi query thành công.`
        });
    }
};

const queryZaloPayRefund = async ({ connection, ticket, maCa, user, req }) => {
    await ensureReturnRefundSchema(connection);
    const latest = await loadLatestRefundTx(connection, ticket.MaDT);
    if (!latest) throw refundError('Chưa có giao dịch hoàn ZaloPay trên phiếu này.');
    if (latest.TrangThaiHoan === HOAN_OK) {
        return { TrangThai: 'Hoàn thành', alreadyDone: true, mRefundId: latest.MRefundId };
    }

    let queried;
    try {
        queried = await zalopay.queryRefund(latest.MRefundId);
    } catch (error) {
        throw refundError(error.message || 'Không query được hoàn ZaloPay. Giữ Đang hoàn tiền.', error.status || 503);
    }

    if (queried.classification === 'pending') {
        return {
            TrangThai: RETURN_MONEY_PENDING,
            pending: true,
            mRefundId: latest.MRefundId,
            message: 'Yêu cầu hoàn đã gửi / Đang xử lý. Chưa ghi Có 112.'
        };
    }

    const pool = await require('../config/db').poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        const locked = await new sql.Request(transaction).input('MaDT', sql.VarChar, ticket.MaDT).query(`
            SELECT dt.* FROM PhieuDoiTra dt WITH (UPDLOCK, HOLDLOCK) WHERE dt.MaDT=@MaDT`);
        const current = locked.recordset[0];
        if (!current) throw refundError('Không tìm thấy phiếu đổi trả.');
        if (current.TrangThai === 'Hoàn thành') {
            await transaction.rollback();
            return { TrangThai: 'Hoàn thành', alreadyDone: true, mRefundId: latest.MRefundId };
        }
        const tx = await loadLatestRefundTx(transaction, ticket.MaDT);
        if (queried.classification === 'success') {
            await finalizeSuccessfulRefund(transaction, {
                ticket: current,
                tx: { ...tx, RefundId: queried.refundId || tx.RefundId },
                maCa: maCa || current.MaCaHoan,
                user,
                req
            });
            await transaction.commit();
            return {
                TrangThai: 'Hoàn thành',
                completed: true,
                mRefundId: tx.MRefundId,
                MaGiaoDichHoan: queried.refundId || tx.RefundId,
                message: `Đã hoàn ZaloPay ${current.MaDT}.`
            };
        }
        await updateRefundTx(transaction, tx.MaGiaoDichHoan, {
            TrangThaiHoan: HOAN_FAIL,
            RefundId: queried.refundId,
            MaLoi: String(queried.subReturnCode || queried.resultCode || ''),
            NoiDungLoi: queried.subReturnMessage || queried.message,
            done: true
        });
        await markTicketFailed(transaction, {
            maDT: current.MaDT,
            message: queried.subReturnMessage || queried.message || 'Hoàn ZaloPay thất bại.',
            mRefundId: tx.MRefundId
        });
        await logAudit(transaction, {
            user, req, action: 'Hoàn tiền thất bại', table: 'PhieuDoiTra', recordId: current.MaDT,
            uc: 'UC26', severity: 'Quan trọng',
            content: `Query refund THAT_BAI m_refund_id ${tx.MRefundId}. Không trả tiền mặt.`
        });
        await transaction.commit();
        return {
            TrangThai: RETURN_MONEY_FAILED,
            failed: true,
            mRefundId: tx.MRefundId,
            message: queried.subReturnMessage || queried.message || 'Hoàn tiền thất bại. Không trả tiền mặt.'
        };
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        throw error;
    }
};

const startExchangeCollect = async ({ connection, ticket, amount, method, maCa, user, req }) => {
    await ensureReturnRefundSchema(connection);
    const collectMethod = String(method || 'Tiền mặt').trim();
    if (collectMethod === 'Tiền mặt') {
        return { collectCash: true, amount };
    }
    if (collectMethod !== 'QR') {
        throw refundError('Thu thêm chỉ nhận tiền mặt hoặc ZaloPay.');
    }
    const cfg = zalopay.getConfig();
    const existing = String(ticket.MaThamChieuThuThem || '').trim();
    const orderId = existing || `${vietnamYymmdd()}_${cfg.appId}_${ticket.MaDT}C`.slice(0, 40);
    await requestOf(connection)
        .input('MaDT', sql.VarChar, ticket.MaDT)
        .input('ThuThem', sql.Decimal(18, 2), amount)
        .input('Pt', sql.NVarChar, 'QR')
        .input('Ref', sql.VarChar, orderId)
        .input('MaCa', sql.VarChar, maCa)
        .query(`
            UPDATE PhieuDoiTra SET
                SoTienThuThem=@ThuThem,
                PhuongThucThuThem=@Pt,
                MaThamChieuThuThem=@Ref,
                MaCaHoan=COALESCE(MaCaHoan, @MaCa)
            WHERE MaDT=@MaDT`);
    const created = await zalopay.createPayment({
        MaHD: ticket.MaDT,
        MaTT: ticket.MaDT,
        SoTien: amount,
        MoTa: `Fly thu chenh ${ticket.MaDT}`,
        orderId
    });
    if (user) {
        await logAudit(connection, {
            user, req, action: 'Thu thêm đổi hàng', table: 'PhieuDoiTra', recordId: ticket.MaDT,
            uc: 'UC26', severity: 'Quan trọng',
            content: `Thu chênh ZaloPay ${amount} app_trans_id ${orderId}. HĐ gốc không đổi.`
        });
    }
    return {
        collectPending: true,
        orderId,
        qrCodeUrl: created.qrCodeUrl,
        payUrl: created.payUrl,
        amount,
        message: 'Khách quét ZaloPay phần chênh. Hóa đơn gốc không đổi. Không hoàn 500 rồi thu 700.'
    };
};

const queryExchangeCollect = async ({ connection, ticket, maCa, user, req }) => {
    const orderId = String(ticket.MaThamChieuThuThem || '').trim();
    if (!orderId) throw refundError('Chưa có mã thu thêm ZaloPay trên phiếu này.');
    const queried = await zalopay.queryPayment(orderId);
    if (queried.classification === 'pending') {
        return { collectPending: true, orderId, message: 'Đang chờ khách thanh toán phần chênh ZaloPay.' };
    }
    if (queried.classification !== 'success') {
        throw refundError(queried.message || 'Thu thêm ZaloPay chưa thành công. Query lại — không bịa mã mới.');
    }
    const { poolPromise } = require('../config/db');
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        await markTicketDone(transaction, {
            maDT: ticket.MaDT,
            maCa,
            method: ticket.PhuongThucHoan || 'QR',
            amount: 0,
            maGD: orderId,
            soTienThuThem: Number(ticket.SoTienThuThem || queried.amount || 0),
            phuongThucThuThem: 'QR'
        });
        await postReturnJournals(transaction, {
            maDT: ticket.MaDT, maNV: user?.MaNV, user, includeMoney: false, includeStock: true
        });
        await logAudit(transaction, {
            user, req, action: 'Hoàn thành đổi trả', table: 'PhieuDoiTra', recordId: ticket.MaDT,
            uc: 'UC26', severity: 'Quan trọng',
            content: `Thu chênh ZaloPay thành công ${orderId}. HĐ gốc không đổi.`
        });
        await transaction.commit();
        return {
            TrangThai: 'Hoàn thành',
            completed: true,
            collectDone: true,
            message: `Đã thu thêm ZaloPay trên ${ticket.MaDT}.`
        };
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        throw error;
    }
};

const retryZaloPayRefund = async ({ connection, ticket, amount, maCa, user, req }) => {
    const latest = await loadLatestRefundTx(connection, ticket.MaDT);
    if (latest && (latest.TrangThaiHoan === HOAN_DANG || latest.TrangThaiHoan === HOAN_CHO_GUI)) {
        return queryZaloPayRefund({ connection, ticket, maCa, user, req });
    }
    if (latest && latest.TrangThaiHoan === HOAN_OK) {
        return { TrangThai: 'Hoàn thành', alreadyDone: true, mRefundId: latest.MRefundId };
    }
    const queried = latest
        ? await queryZaloPayRefund({ connection, ticket, maCa, user, req }).catch(() => null)
        : null;
    if (queried?.completed || queried?.alreadyDone) return queried;
    if (queried?.pending) return queried;
    return sendZaloPayRefund({
        connection,
        ticket,
        amount: amount || Number(ticket.SoTienHoan || latest?.SoTienHoan || 0),
        maCa,
        user,
        req,
        forceNewAfterFail: Boolean(latest && latest.TrangThaiHoan === HOAN_FAIL)
    });
};

module.exports = {
    HOAN_CHO_GUI,
    HOAN_DANG,
    HOAN_OK,
    HOAN_FAIL,
    loadSuccessfulPayments,
    originalQrPayment,
    remainingQrRefundable,
    loadLatestRefundTx,
    loadOpenShiftDrawer,
    assertCashDrawerEnough,
    resolveRefundMethod,
    cashierMayRefundCash,
    buildMRefundId,
    sendZaloPayRefund,
    queryZaloPayRefund,
    retryZaloPayRefund,
    startExchangeCollect,
    queryExchangeCollect,
    markTicketDone,
    exchangeMoneyDelta,
    zpTransIdOf
};
