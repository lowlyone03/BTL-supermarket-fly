const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const {
    isRestockAccepted, looksUnsellable, roundMoney,
    defaultRefundMethod, originalInvoicePayMethod,
    exchangeMoneyDelta, RETURN_MONEY_PENDING, RETURN_MONEY_FAILED
} = require('../services/financialRules');
const { postReturnJournals } = require('../services/accountingHooks');
const { ensureReturnRefundSchema } = require('../services/returnRefundSchema');
const {
    remainingQrRefundable, loadLatestRefundTx, loadOpenShiftDrawer, assertCashDrawerEnough,
    resolveRefundMethod, sendZaloPayRefund, queryZaloPayRefund, retryZaloPayRefund,
    startExchangeCollect, queryExchangeCollect, markTicketDone, zpTransIdOf
} = require('../services/returnRefundService');
const { calendarizeRow } = require('../services/reportingPeriod');
const { INVOICE_RETURN_APPLY, INVOICE_RETURN_COLUMNS } = require('../services/invoiceReturnSql');
const { assertCashierDuty } = require('../services/cashierDuty');
const {
    canCompleteAssignedReturn, canActOnAssignedReturn, canClaimLeftoverReturn,
    assignedCashierOf, handoverApprovedReturns, acceptLeftoverReturn,
    describeReturnHandover, isUnfinishedReturn, isLeftoverReturn,
    healParkedReturns, claimLeftoverReturnsForShift, ensureReturnHandoverSchema
} = require('../services/returnHandover');

const historyOf = (item, extra = {}) => describeReturnHandover({
    openerMaNV: item.MaNV_Lap,
    openerName: item.NguoiLap,
    openerAt: item.NgayLap,
    parkedAt: item.NgayBanGiao,
    claimerMaNV: item.MaNV_XuLy,
    claimerName: item.NguoiXuLy,
    claimerAt: item.NgayTiepNhan,
    customerName: item.TenKH,
    completed: item.TrangThai === 'Hoàn thành',
    completedAt: item.NgayHoan,
    ...extra
});

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);

const generateId = async (transaction, table, column, prefix) => {
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 ${column} Id FROM ${table} WITH (UPDLOCK,HOLDLOCK)
                WHERE ${column} LIKE @Prefix ORDER BY ${column} DESC`);
    const last = result.recordset[0]?.Id;
    return `${prefix}${String(last ? Number(last.slice(prefix.length)) + 1 : 1).padStart(4, '0')}`;
};

const writeAudit = (request, user, action, recordId, content) =>
    logAudit(request, { user, action, table: 'PhieuDoiTra', recordId, content, uc: 'UC26', severity: 'Quan trọng' });

const loadDetail = async (pool, maDT) => {
    const headerSql = (withXuLy) => `
        SELECT dt.*, hd.NgayLap NgayHoaDon, hd.TongThanhToan, hd.MaKH, hd.MaCa MaCaGoc, hd.MaKho,
               kh.TenKH, kh.SDT, kh.HangThanhVien,
               nv.TenNV NguoiLap, nvk.TenNV NguoiKiemTra, nvd.TenNV NguoiDuyet,
               ${withXuLy ? 'xu.TenNV NguoiXuLy,' : ''}
               ban.TenNV ThuNganGoc, k.TenKho, k.DiaChi DiaChiKho
        FROM PhieuDoiTra dt
        JOIN HoaDon hd ON hd.MaHD=dt.MaHD
        JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
        JOIN NhanVien ban ON ban.MaNV=hd.MaNV
        LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
        LEFT JOIN NhanVien nvk ON nvk.MaNV=dt.MaNV_KiemTra
        LEFT JOIN NhanVien nvd ON nvd.MaNV=dt.MaNV_Duyet
        ${withXuLy ? 'LEFT JOIN NhanVien xu ON xu.MaNV=dt.MaNV_XuLy' : ''}
        LEFT JOIN Kho k ON k.MaKho=hd.MaKho
        WHERE dt.MaDT=@MaDT`;
    let header;
    try {
        header = await pool.request().input('MaDT', sql.VarChar, maDT).query(headerSql(true));
    } catch (error) {
        if (!/Invalid column name|MaNV_XuLy/i.test(error.message || '')) throw error;
        header = await pool.request().input('MaDT', sql.VarChar, maDT).query(headerSql(false));
    }
    if (!header.recordset.length) return null;
    const ticket = header.recordset[0];
    const bind = () => pool.request().input('MaDT', sql.VarChar, maDT).input('MaHD', sql.VarChar, ticket.MaHD);
    const [lines, payments, audit, stockMoves, linkedIssue] = await Promise.all([
        bind().query(`
            SELECT ct.*, sp.TenSP, sp.DonViTinh, sp.MaVach, hdct.SoLuong SLBan
            FROM ChiTietDoiTra ct
            JOIN SanPham sp ON sp.MaSP=ct.MaSP
            LEFT JOIN ChiTietHoaDon hdct ON hdct.MaHD=@MaHD AND hdct.MaSP=ct.MaSP
            WHERE ct.MaDT=@MaDT
            ORDER BY ct.LoaiDong, sp.TenSP`),
        bind().query(`
            SELECT PhuongThuc, SoTien, TrangThai, MaGiaoDich, NguonXacNhan, GhiChu, NgayTT
            FROM ThanhToan
            WHERE MaHD=@MaHD AND TrangThai=N'Thành công'
            ORDER BY NgayTT`),
        bind().query(`
            SELECT nk.ThoiGian, nk.HanhDong, nk.NoiDung, n.TenNV
            FROM NhatKy nk
            LEFT JOIN TaiKhoan t ON t.MaTK=nk.MaTK
            LEFT JOIN NhanVien n ON n.MaNV=t.MaNV
            WHERE nk.BangLienQuan=N'PhieuDoiTra' AND nk.MaBanGhi=@MaDT
            ORDER BY nk.ThoiGian`),
        bind().query(`
            SELECT gd.LoaiGD, gd.SoLuong, gd.NgayGD, gd.GhiChu, sp.MaSP, sp.TenSP, nv.TenNV NguoiGhiSo
            FROM GiaoDichKho gd
            JOIN SanPham sp ON sp.MaSP=gd.MaSP
            JOIN NhanVien nv ON nv.MaNV=gd.MaNV
            WHERE gd.LoaiChungTu=N'DoiTra' AND gd.MaChungTu=@MaDT
            ORDER BY gd.NgayGD`),
        pool.request().input('MaDT', sql.VarChar, maDT).input('Mau', sql.NVarChar, `%Nguồn đổi trả ${maDT}.%`).query(`
            SELECT TOP 1 MaPX, TrangThai, KhongTruTon
            FROM PhieuXuat
            WHERE TrangThai IN (N'Nháp', N'Chờ duyệt', N'Đã duyệt', N'Đã xác nhận')
              AND (MaDT=@MaDT OR GhiChu LIKE @Mau)
            ORDER BY CASE TrangThai
                WHEN N'Nháp' THEN 1 WHEN N'Chờ duyệt' THEN 2 WHEN N'Đã duyệt' THEN 3 ELSE 4 END,
                NgayXuat DESC`).catch(error => {
            if (!/Invalid column name|MaDT|KhongTruTon/i.test(error.message || '')) throw error;
            return pool.request().input('Mau', sql.NVarChar, `%Nguồn đổi trả ${maDT}.%`).query(`
                SELECT TOP 1 MaPX, TrangThai FROM PhieuXuat
                WHERE GhiChu LIKE @Mau AND TrangThai IN (N'Nháp', N'Chờ duyệt', N'Đã duyệt', N'Đã xác nhận')
                ORDER BY NgayXuat DESC`);
        })
    ]);
    const scrapIssue = linkedIssue.recordset[0] || null;
    await ensureReturnRefundSchema(pool).catch(() => {});
    const cap = await remainingQrRefundable(pool, ticket.MaHD).catch(() => null);
    const refundTx = await loadLatestRefundTx(pool, maDT).catch(() => null);
    const originalPay = originalInvoicePayMethod(payments.recordset) || ticket.PhuongThucGoc || null;
    const qrPay = cap?.originalQr || (payments.recordset || []).find(row =>
        String(row.PhuongThuc || '') === 'QR' || /zalo|momo|^qr$/i.test(String(row.PhuongThuc || ''))
    );
    return {
        ticket: {
            ...ticket,
            PhuongThucGoc: originalPay,
            ZpTransId: zpTransIdOf(qrPay || {}),
            LichSuBanGiao: ticket.MaNV_XuLy || ticket.NgayBanGiao ? historyOf(ticket) : '',
            MaPXHuy: scrapIssue?.MaPX || null,
            TrangThaiPXHuy: scrapIssue?.TrangThai || null
        },
        lines: lines.recordset,
        payments: payments.recordset,
        audit: audit.recordset,
        stockMoves: stockMoves.recordset,
        refundTx,
        refundCap: cap ? {
            paid: cap.paid,
            already: cap.already,
            remaining: cap.remaining
        } : null
    };
};

const searchInvoices = async (req, res) => {
    try {
        const search = clean(req.query.search, 100);
        if (search.length < 2) return res.json({ items: [] });
        const pool = await poolPromise;
        const result = await pool.request().input('Search', sql.NVarChar, `%${search}%`).query(`
            SELECT TOP 30 hd.MaHD, hd.NgayLap, hd.TongThanhToan, hd.MaKH, hd.MaCa, hd.MaNV,
                   kh.TenKH, kh.SDT, nv.TenNV,
                   ${INVOICE_RETURN_COLUMNS}
            FROM HoaDon hd
            JOIN NhanVien nv ON nv.MaNV=hd.MaNV
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            ${INVOICE_RETURN_APPLY}
            WHERE hd.TrangThai=N'Hoàn thành'
              AND (hd.MaHD LIKE @Search COLLATE Latin1_General_100_CI_AI OR ISNULL(hd.MaKH,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
                   OR kh.TenKH LIKE @Search COLLATE Latin1_General_100_CI_AI OR kh.SDT LIKE @Search COLLATE Latin1_General_100_CI_AI
                   OR nv.TenNV LIKE @Search COLLATE Latin1_General_100_CI_AI OR hd.MaCa LIKE @Search COLLATE Latin1_General_100_CI_AI)
            ORDER BY hd.NgayLap DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tìm hóa đơn gốc.' });
    }
};

const getInvoiceForReturn = async (req, res) => {
    try {
        const pool = await poolPromise;
        const header = await pool.request().input('MaHD', sql.VarChar, clean(req.params.id, 20)).query(`
            SELECT hd.MaHD, hd.NgayLap, hd.TongThanhToan, hd.MaKH, hd.MaCa, hd.MaNV, hd.MaKho,
                   kh.TenKH, kh.SDT, nv.TenNV,
                   ${INVOICE_RETURN_COLUMNS}
            FROM HoaDon hd JOIN NhanVien nv ON nv.MaNV=hd.MaNV
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            ${INVOICE_RETURN_APPLY}
            WHERE hd.MaHD=@MaHD AND hd.TrangThai=N'Hoàn thành'`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Chỉ hóa đơn đã hoàn thành mới được đổi trả.' });
        const lines = await pool.request().input('MaHD', sql.VarChar, req.params.id).query(`
            SELECT ct.MaSP, sp.TenSP, sp.DonViTinh, ct.SoLuong, ct.DonGia, ct.ThanhTien, ct.DonGiaVon,
                   ct.SoLuong - ISNULL((
                       SELECT SUM(dtct.SoLuong) FROM ChiTietDoiTra dtct
                       JOIN PhieuDoiTra dt ON dt.MaDT=dtct.MaDT
                       WHERE dt.MaHD=@MaHD AND dtct.MaSP=ct.MaSP AND dtct.LoaiDong=N'Hàng khách trả'
                         AND dt.TrangThai NOT IN (N'Từ chối', N'Đã hủy')
                   ),0) AS SLConDoiTra
            FROM ChiTietHoaDon ct JOIN SanPham sp ON sp.MaSP=ct.MaSP
            WHERE ct.MaHD=@MaHD`);
        res.json({ invoice: calendarizeRow(header.recordset[0]), lines: lines.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải hóa đơn đổi trả.' });
    }
};

const listReturns = async (req, res) => {
    try {
        const status = clean(req.query.status, 30);
        const scope = clean(req.query.scope, 20);
        const search = clean(req.query.search, 100);
        const pool = await poolPromise;
        await ensureReturnHandoverSchema(pool);
        await healParkedReturns(pool);
        const openShift = await pool.request().input('MaNV', sql.VarChar, req.user.MaNV).query(`
            SELECT TOP 1 MaCa, MaQuay FROM CaLamViec
            WHERE MaNV=@MaNV AND TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL
            ORDER BY ThoiGianBatDau DESC`);
        const openQuay = openShift.recordset[0]?.MaQuay || null;
        if (openShift.recordset[0]?.MaCa && openQuay) {
            try {
                const autoClaimed = await claimLeftoverReturnsForShift(pool, {
                    maNV: req.user.MaNV,
                    maQuay: openQuay,
                    maCa: openShift.recordset[0].MaCa
                });
                for (const row of autoClaimed) {
                    await writeAudit(pool.request(), req.user, 'Tiếp nhận đổi trả', row.MaDT, historyOf({
                        ...row,
                        NguoiXuLy: req.user.TenNV,
                        MaNV_XuLy: req.user.MaNV,
                        NgayTiepNhan: row.NgayTiepNhan || new Date()
                    }));
                }
            } catch (error) {
                console.error(error);
            }
        }
        const mineFilter = scope === 'mine'
            ? `(dt.MaNV_Lap=@MaNV OR dt.MaNV_XuLy=@MaNV
                    OR (dt.TrangThai NOT IN (N'Hoàn thành', N'Từ chối', N'Đã hủy')
                        AND dt.NgayHoan IS NULL
                        AND dt.NgayBanGiao IS NOT NULL AND EXISTS (
                        SELECT 1 FROM CaLamViec ca
                        WHERE ca.MaNV=@MaNV AND ca.TrangThai=N'Đang mở' AND ca.ThoiGianKetThuc IS NULL
                          AND (dt.MaQuayXuLy IS NULL OR ca.MaQuay=dt.MaQuayXuLy))))`
            : '1=1';
        const mineLegacy = scope === 'mine' ? 'dt.MaNV_Lap=@MaNV' : '1=1';
        let result;
        try {
            result = await pool.request()
                .input('Status', sql.NVarChar, status)
                .input('Search', sql.NVarChar, `%${search}%`)
                .input('MaNV', sql.VarChar, req.user.MaNV).query(`
                SELECT dt.MaDT, dt.MaHD, dt.NgayLap, dt.HinhThucXuLy, dt.SoTienHoan, dt.TrangThai,
                       dt.LyDo, dt.MaCaHoan, dt.KetQuaKiemTra, dt.NgayKiemTra, dt.MaNV_KiemTra, dt.GhiChu,
                       dt.MaNV_Lap, dt.MaNV_XuLy, dt.MaQuayXuLy, dt.NgayBanGiao, dt.MaCaBanGiao,
                       dt.NgayHoan, dt.NgayTiepNhan,
                       nv.TenNV NguoiLap, xu.TenNV NguoiXuLy, kh.TenKH, kh.SDT, hd.MaCa MaCaGoc, ban.TenNV ThuNganGoc
                FROM PhieuDoiTra dt
                JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
                JOIN HoaDon hd ON hd.MaHD=dt.MaHD
                JOIN NhanVien ban ON ban.MaNV=hd.MaNV
                LEFT JOIN NhanVien xu ON xu.MaNV=dt.MaNV_XuLy
                LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
                WHERE (@Status=N'' OR dt.TrangThai=@Status) AND (${mineFilter})
                  AND (@Search=N'%%' OR dt.MaDT LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR dt.MaHD LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR ISNULL(kh.TenKH,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR ISNULL(kh.SDT,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR ISNULL(hd.MaCa,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR ISNULL(ban.TenNV,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR ISNULL(nv.TenNV,'') LIKE @Search COLLATE Latin1_General_100_CI_AI)
                ORDER BY CASE WHEN dt.TrangThai NOT IN (N'Hoàn thành', N'Từ chối', N'Đã hủy')
                                   AND dt.NgayHoan IS NULL AND dt.NgayBanGiao IS NOT NULL
                                   AND (dt.MaNV_XuLy IS NULL OR dt.MaNV_XuLy<>@MaNV)
                              THEN 0 ELSE 1 END,
                         CASE dt.TrangThai
                           WHEN N'Đã duyệt' THEN 0 WHEN N'Chờ duyệt' THEN 1
                           WHEN N'Chờ kiểm tra' THEN 2 WHEN N'Nháp' THEN 3 ELSE 4 END,
                         dt.NgayLap DESC`);
            result.recordset = result.recordset.map(item => {
                const leftover = isLeftoverReturn(item, req.user.MaNV);
                const claimed = Boolean(item.NgayBanGiao && item.MaNV_XuLy === req.user.MaNV && isUnfinishedReturn(item));
                return {
                    ...item,
                    SotTuCaTruoc: leftover,
                    CoTheTiepNhan: canClaimLeftoverReturn(item, req.user.MaNV, openQuay),
                    TuCaTruoc: leftover || claimed,
                    DaTiepNhan: claimed,
                    LichSuBanGiao: leftover || claimed || (item.NguoiXuLy && item.NguoiXuLy !== item.NguoiLap)
                        ? historyOf(item)
                        : ''
                };
            });
        } catch (error) {
            if (!/Invalid column name|MaNV_XuLy|NgayTiepNhan/i.test(error.message || '')) throw error;
            result = await pool.request()
                .input('Status', sql.NVarChar, status)
                .input('Search', sql.NVarChar, `%${search}%`)
                .input('MaNV', sql.VarChar, req.user.MaNV).query(`
                SELECT dt.MaDT, dt.MaHD, dt.NgayLap, dt.HinhThucXuLy, dt.SoTienHoan, dt.TrangThai,
                       dt.LyDo, dt.MaCaHoan, dt.KetQuaKiemTra, dt.NgayKiemTra, dt.MaNV_KiemTra, dt.GhiChu,
                       nv.TenNV NguoiLap, kh.TenKH, kh.SDT, hd.MaCa MaCaGoc, ban.TenNV ThuNganGoc
                FROM PhieuDoiTra dt
                JOIN NhanVien nv ON nv.MaNV=dt.MaNV_Lap
                JOIN HoaDon hd ON hd.MaHD=dt.MaHD
                JOIN NhanVien ban ON ban.MaNV=hd.MaNV
                LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
                WHERE (@Status=N'' OR dt.TrangThai=@Status) AND (${mineLegacy})
                  AND (@Search=N'%%' OR dt.MaDT LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR dt.MaHD LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR ISNULL(kh.TenKH,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR ISNULL(kh.SDT,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR ISNULL(hd.MaCa,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR ISNULL(ban.TenNV,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
                       OR ISNULL(nv.TenNV,'') LIKE @Search COLLATE Latin1_General_100_CI_AI)
                ORDER BY CASE dt.TrangThai
                           WHEN N'Đã duyệt' THEN 0 WHEN N'Chờ duyệt' THEN 1
                           WHEN N'Chờ kiểm tra' THEN 2 WHEN N'Nháp' THEN 3 ELSE 4 END,
                         dt.NgayLap DESC`);
        }
        const items = result.recordset;
        res.json({
            items,
            leftoverFromPreviousShift: items.filter(item => item.SotTuCaTruoc).length,
            receivedFromPreviousShift: items.filter(item => item.DaTiepNhan).length,
            openShift: openShift.recordset[0] || null
        });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải danh sách đổi trả.' });
    }
};

const listRecentInvoices = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT TOP 12 hd.MaHD, hd.NgayLap, hd.TongThanhToan, hd.MaKH, hd.MaCa, hd.MaNV,
                   kh.TenKH, kh.SDT, nv.TenNV,
                   ${INVOICE_RETURN_COLUMNS}
            FROM HoaDon hd
            JOIN NhanVien nv ON nv.MaNV=hd.MaNV
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            ${INVOICE_RETURN_APPLY}
            WHERE hd.TrangThai=N'Hoàn thành'
            ORDER BY hd.NgayLap DESC`);
        res.json({ items: result.recordset });
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải hóa đơn gần đây.' });
    }
};

const getReturn = async (req, res) => {
    try {
        const detail = await loadDetail(await poolPromise, clean(req.params.id, 20));
        if (!detail) return res.status(404).json({ message: 'Không tìm thấy phiếu đổi trả.' });
        res.json(detail);
    } catch (error) {
        res.status(500).json({ message: 'Không thể tải phiếu đổi trả.' });
    }
};

const createReturn = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const maHD = clean(req.body.MaHD, 20);
        const reason = clean(req.body.LyDo, 500);
        const form = clean(req.body.HinhThucXuLy, 30);
        const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
        if (!reason) throw new Error('Phải nhập lý do đổi trả.');
        if (!['Đổi hàng', 'Hoàn tiền'].includes(form)) throw new Error('Hình thức xử lý phải là Đổi hàng hoặc Hoàn tiền.');
        if (!lines.length) throw new Error('Chọn ít nhất một sản phẩm khách trả.');
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const invoice = await new sql.Request(transaction).input('MaHD', sql.VarChar, maHD)
            .query(`SELECT hd.MaHD, hd.MaKho, ca.MaQuay
                    FROM HoaDon hd WITH(UPDLOCK,HOLDLOCK)
                    LEFT JOIN CaLamViec ca ON ca.MaCa=hd.MaCa
                    WHERE hd.MaHD=@MaHD AND hd.TrangThai=N'Hoàn thành'`);
        if (!invoice.recordset.length) throw new Error('Hóa đơn gốc chưa hoàn thành hoặc không tồn tại.');
        const invoiceRow = invoice.recordset[0];
        const prefix = `DT${new Date().toISOString().slice(2, 10).replaceAll('-', '')}`;
        const maDT = await generateId(transaction, 'PhieuDoiTra', 'MaDT', prefix);
        const prepared = [];
        let refund = 0;
        for (const raw of lines) {
            const maSP = clean(raw.MaSP, 20);
            const qty = Number(raw.SoLuong);
            if (!maSP || !Number.isInteger(qty) || qty <= 0) throw new Error('Dòng hàng đổi trả không hợp lệ.');
            const origin = await new sql.Request(transaction).input('MaHD', sql.VarChar, maHD)
                .input('MaSP', sql.VarChar, maSP).query(`
                    SELECT ct.SoLuong, ct.DonGia, ct.ThanhTien, ct.DonGiaVon,
                           ct.SoLuong - ISNULL((
                               SELECT SUM(dtct.SoLuong) FROM ChiTietDoiTra dtct
                               JOIN PhieuDoiTra dt ON dt.MaDT=dtct.MaDT
                               WHERE dt.MaHD=@MaHD AND dtct.MaSP=@MaSP AND dtct.LoaiDong=N'Hàng khách trả'
                                 AND dt.TrangThai NOT IN (N'Từ chối', N'Đã hủy')
                           ),0) ConLai
                    FROM ChiTietHoaDon ct WHERE ct.MaHD=@MaHD AND ct.MaSP=@MaSP`);
            if (!origin.recordset.length) throw new Error(`Sản phẩm ${maSP} không có trên hóa đơn gốc.`);
            if (qty > Number(origin.recordset[0].ConLai)) throw new Error(`Số lượng đổi trả ${maSP} vượt phần còn lại trên hóa đơn.`);
            const unit = Number(origin.recordset[0].DonGia);
            const cost = Number(origin.recordset[0].DonGiaVon || 0);
            const amount = unit * qty;
            refund += amount;
            prepared.push({ maSP, qty, unit, cost, amount, note: clean(raw.LyDo, 200) || reason });
        }
        const insertReturn = async (withHandoverCols) => {
            const reqInsert = new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).input('MaHD', sql.VarChar, maHD)
                .input('MaNV', sql.VarChar, req.user.MaNV).input('LyDo', sql.NVarChar, reason)
                .input('HinhThuc', sql.NVarChar, form)
                .input('SoTienHoan', sql.Decimal(18, 2), form === 'Hoàn tiền' ? refund : 0);
            if (withHandoverCols) {
                await reqInsert.input('MaQuay', sql.VarChar, invoiceRow.MaQuay || null).query(`
                    INSERT PhieuDoiTra(MaDT,MaHD,MaNV_Lap,MaNV_XuLy,MaQuayXuLy,LyDo,HinhThucXuLy,SoTienHoan,TrangThai,NgayLap)
                    VALUES(@MaDT,@MaHD,@MaNV,@MaNV,@MaQuay,@LyDo,@HinhThuc,@SoTienHoan,N'Nháp',GETDATE())`);
                return;
            }
            await reqInsert.query(`
                INSERT PhieuDoiTra(MaDT,MaHD,MaNV_Lap,LyDo,HinhThucXuLy,SoTienHoan,TrangThai,NgayLap)
                VALUES(@MaDT,@MaHD,@MaNV,@LyDo,@HinhThuc,@SoTienHoan,N'Nháp',GETDATE())`);
        };
        try {
            await insertReturn(true);
        } catch (error) {
            if (!/Invalid column name|MaNV_XuLy/i.test(error.message || '')) throw error;
            await insertReturn(false);
        }
        for (const line of prepared) {
            await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).input('MaSP', sql.VarChar, line.maSP)
                .input('SoLuong', sql.Int, line.qty).input('DonGia', sql.Decimal(18, 2), line.unit)
                .input('ThanhTien', sql.Decimal(18, 2), line.amount).input('DonGiaVon', sql.Decimal(18, 2), line.cost)
                .input('ThanhTienVon', sql.Decimal(18, 2), line.cost * line.qty)
                .input('LyDo', sql.NVarChar, line.note).query(`
                    INSERT ChiTietDoiTra(MaDT,MaSP,LoaiDong,SoLuong,DonGia,ThanhTien,DonGiaVon,ThanhTienVon,LyDo)
                    VALUES(@MaDT,@MaSP,N'Hàng khách trả',@SoLuong,@DonGia,@ThanhTien,@DonGiaVon,@ThanhTienVon,@LyDo)`);
        }
        await writeAudit(new sql.Request(transaction), req.user, 'Lập phiếu đổi trả', maDT, `Từ hóa đơn ${maHD}`);
        await transaction.commit();
        res.status(201).json({ message: `Đã lưu phiếu đổi trả nháp ${maDT}.`, MaDT: maDT });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const submitReturn = async (req, res) => {
    try {
        const pool = await poolPromise;
        const maDT = clean(req.params.id, 20);
        let result;
        try {
            result = await pool.request()
                .input('MaDT', sql.VarChar, maDT)
                .input('MaNV', sql.VarChar, req.user.MaNV).query(`
                    UPDATE dt SET dt.TrangThai=N'Chờ kiểm tra'
                    FROM PhieuDoiTra dt
                    WHERE dt.MaDT=@MaDT AND dt.TrangThai=N'Nháp'
                      AND (
                            (dt.NgayBanGiao IS NULL AND (dt.MaNV_Lap=@MaNV OR dt.MaNV_XuLy=@MaNV))
                         OR (dt.NgayBanGiao IS NOT NULL AND dt.MaNV_XuLy=@MaNV)
                      );
                    SELECT @@ROWCOUNT affected;`);
        } catch (error) {
            if (!/Invalid column name|MaNV_XuLy|NgayBanGiao/i.test(error.message || '')) throw error;
            result = await pool.request().input('MaDT', sql.VarChar, maDT)
                .input('MaNV', sql.VarChar, req.user.MaNV).query(`
                    UPDATE PhieuDoiTra SET TrangThai=N'Chờ kiểm tra'
                    WHERE MaDT=@MaDT AND MaNV_Lap=@MaNV AND TrangThai=N'Nháp';
                    SELECT @@ROWCOUNT affected;`);
        }
        if (!result.recordset[0].affected) {
            return res.status(400).json({ message: 'Chỉ phiếu nháp bạn đang phụ trách mới gửi Thủ kho. Phiếu sót từ ca trước cần bấm Tiếp nhận trước.' });
        }
        await writeAudit(pool.request(), req.user, 'Gửi hàng đổi trả cho Thủ kho', req.params.id, 'Chờ kiểm tra tình trạng hàng');
        res.json({ message: 'Đã gửi hàng cho Thủ kho kiểm tra.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const inspectReturn = async (req, res) => {
    try {
        const resultText = clean(req.body.KetQuaKiemTra, 200);
        const restock = Boolean(req.body.DuocNhapLai);
        if (!resultText) throw new Error('Phải ghi kết quả kiểm tra.');
        const pool = await poolPromise;
        const maDT = clean(req.params.id, 20);
        const header = await pool.request().input('MaDT', sql.VarChar, maDT).query(`
            SELECT LyDo, TrangThai, MaNV_KiemTra, KetQuaKiemTra FROM PhieuDoiTra WHERE MaDT=@MaDT`);
        if (!header.recordset.length) throw new Error('Không tìm thấy phiếu đổi trả.');
        const ticket = header.recordset[0];
        const revising = ticket.TrangThai === 'Chờ duyệt' && ticket.MaNV_KiemTra === req.user.MaNV;
        if (ticket.TrangThai !== 'Chờ kiểm tra' && !revising) {
            if (['Đã duyệt', 'Hoàn thành'].includes(ticket.TrangThai)) {
                throw new Error('Phiếu đã duyệt hoặc hoàn thành, không sửa kết quả kiểm. Vào Lịch sử kho bấm Tôi đã tích nhầm: hàng hỏng nhập nhầm sẽ được trừ tồn ngay.');
            }
            if (ticket.TrangThai === 'Chờ duyệt') {
                throw new Error('Chỉ Thủ kho đã kiểm phiếu này mới được sửa kết quả, và chỉ trước khi Quản lý duyệt.');
            }
            throw new Error('Phiếu không còn ở trạng thái chờ kiểm tra.');
        }
        const ketQua = `${restock ? 'Đạt yêu cầu, được nhập lại kho' : 'Không đạt, không nhập lại kho'}. ${resultText}`.slice(0, 200);
        const result = await pool.request().input('MaDT', sql.VarChar, maDT)
            .input('MaNV', sql.VarChar, req.user.MaNV).input('KetQua', sql.NVarChar, ketQua).query(revising
            ? `UPDATE PhieuDoiTra SET NgayKiemTra=GETDATE(), KetQuaKiemTra=@KetQua
               WHERE MaDT=@MaDT AND TrangThai=N'Chờ duyệt' AND MaNV_KiemTra=@MaNV;
               SELECT @@ROWCOUNT affected;`
            : `UPDATE PhieuDoiTra SET MaNV_KiemTra=@MaNV, NgayKiemTra=GETDATE(),
                    KetQuaKiemTra=@KetQua, TrangThai=N'Chờ duyệt'
               WHERE MaDT=@MaDT AND TrangThai=N'Chờ kiểm tra';
               SELECT @@ROWCOUNT affected;`);
        if (!result.recordset[0].affected) return res.status(400).json({ message: revising ? 'Không sửa được kết quả kiểm tra.' : 'Phiếu không còn ở trạng thái chờ kiểm tra.' });
        await writeAudit(pool.request(), req.user, revising ? 'Sửa kết quả kiểm đổi trả' : 'Kiểm tra hàng đổi trả', maDT,
            revising ? `Trước: ${ticket.KetQuaKiemTra || '—'}. Sau: ${ketQua}` : ketQua);
        let message = revising
            ? 'Đã sửa kết quả kiểm tra. Quản lý sẽ thấy kết quả mới khi duyệt.'
            : 'Đã ghi kết quả kiểm tra và chuyển Quản lý phê duyệt.';
        if (restock && looksUnsellable(ticket.LyDo)) {
            message += ' Lưu ý: lý do thu ngân là hàng hỏng/hết hạn nhưng Thủ kho chọn nhập lại kho bán.';
        } else if (!restock) {
            message += ' Hàng loại bỏ/vứt: không cộng tồn (đã trừ lúc bán). Có thể lập phiếu xuất hủy để kiểm soát SL, tiền và hàng.';
        }
        res.json({ message, revised: revising });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const flagInspectMistake = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const reason = clean(req.body.LyDo, 400);
        if (!reason) throw new Error('Phải ghi rõ đã tích nhầm chỗ nào và hàng thực tế ra sao.');
        const maDT = clean(req.params.id, 20);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const header = await new sql.Request(transaction)
            .input('MaDT', sql.VarChar, maDT)
            .input('MaNV', sql.VarChar, req.user.MaNV).query(`
            SELECT dt.MaDT, dt.TrangThai, dt.KetQuaKiemTra, dt.GhiChu, dt.LyDo, hd.MaKho
            FROM PhieuDoiTra dt WITH (UPDLOCK, HOLDLOCK)
            JOIN HoaDon hd ON hd.MaHD=dt.MaHD
            WHERE dt.MaDT=@MaDT AND dt.MaNV_KiemTra=@MaNV`);
        if (!header.recordset.length) throw new Error('Chỉ Thủ kho đã kiểm phiếu này mới xác nhận tích nhầm.');
        const ticket = header.recordset[0];
        if (!['Đã duyệt', 'Hoàn thành'].includes(ticket.TrangThai)) {
            throw new Error('Phiếu còn chờ duyệt: hãy bấm Sửa kết quả kiểm, không cần báo tích nhầm.');
        }
        if (!isRestockAccepted(ticket.KetQuaKiemTra)) {
            throw new Error('Phiếu này không nhập lại kho nên không có tồn nhập nhầm để trừ.');
        }

        const already = await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
            SELECT TOP 1 MaGD FROM GiaoDichKho WITH (UPDLOCK, HOLDLOCK)
            WHERE LoaiChungTu=N'DoiTra' AND MaChungTu=@MaDT AND LoaiGD=N'Xuất'
              AND GhiChu LIKE N'%tích nhầm%'`);
        if (already.recordset.length) throw new Error('Đã trừ tồn cho tích nhầm trên phiếu này.');

        const marker = `Nguồn đổi trả ${maDT}.`;
        let confirmedIssue;
        try {
            confirmedIssue = await new sql.Request(transaction)
                .input('MaDT', sql.VarChar, maDT)
                .input('Mau', sql.NVarChar, `%${marker}%`).query(`
                SELECT TOP 1 MaPX FROM PhieuXuat WITH (UPDLOCK, HOLDLOCK)
                WHERE (MaDT=@MaDT OR GhiChu LIKE @Mau) AND TrangThai=N'Đã xác nhận'`);
        } catch (error) {
            if (!/Invalid column name|MaDT/i.test(error.message || '')) throw error;
            confirmedIssue = await new sql.Request(transaction)
                .input('Mau', sql.NVarChar, `%${marker}%`).query(`
                SELECT TOP 1 MaPX FROM PhieuXuat WITH (UPDLOCK, HOLDLOCK)
                WHERE GhiChu LIKE @Mau AND TrangThai=N'Đã xác nhận'`);
        }
        const stockAlreadyCut = Boolean(confirmedIssue.recordset.length);
        const completed = ticket.TrangThai === 'Hoàn thành';
        const lines = completed && !stockAlreadyCut
            ? (await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
                SELECT ct.MaSP, ct.SoLuong, ct.DonGiaVon, ct.ThanhTienVon, sp.TenSP
                FROM ChiTietDoiTra ct WITH (UPDLOCK, HOLDLOCK)
                JOIN SanPham sp ON sp.MaSP=ct.MaSP
                WHERE ct.MaDT=@MaDT AND ct.LoaiDong=N'Hàng khách trả' AND ct.SoLuong>0`)).recordset
            : [];

        if (completed && !stockAlreadyCut) {
            if (!lines.length) throw new Error('Phiếu đổi trả không có hàng khách trả để trừ tồn.');
            for (const line of lines) {
                const stock = await new sql.Request(transaction)
                    .input('MaKho', sql.VarChar, ticket.MaKho)
                    .input('MaSP', sql.VarChar, line.MaSP).query(`
                    SELECT SLTon, DonGiaBinhQuan FROM TonKho WITH (UPDLOCK, HOLDLOCK)
                    WHERE MaKho=@MaKho AND MaSP=@MaSP`);
                const available = Number(stock.recordset[0]?.SLTon || 0);
                if (!stock.recordset.length || available < Number(line.SoLuong)) {
                    throw new Error(`${line.TenSP} chỉ còn tồn ${available}, không đủ trừ ${line.SoLuong} đã nhập nhầm. Kiểm kê phần còn lại.`);
                }
                const cost = Number(stock.recordset[0].DonGiaBinhQuan || line.DonGiaVon || 0);
                await new sql.Request(transaction)
                    .input('MaKho', sql.VarChar, ticket.MaKho)
                    .input('MaSP', sql.VarChar, line.MaSP)
                    .input('SoLuong', sql.Int, line.SoLuong).query(`
                    UPDATE TonKho SET SLTon=SLTon-@SoLuong,
                        GiaTriTon=(SLTon-@SoLuong)*DonGiaBinhQuan, NgayCapNhat=GETDATE()
                    WHERE MaKho=@MaKho AND MaSP=@MaSP AND SLTon>=@SoLuong`);
                const maGD = await generateId(transaction, 'GiaoDichKho', 'MaGD',
                    `GD${new Date().toISOString().slice(2, 10).replaceAll('-', '')}`);
                await new sql.Request(transaction)
                    .input('MaGD', sql.VarChar, maGD)
                    .input('MaKho', sql.VarChar, ticket.MaKho)
                    .input('MaSP', sql.VarChar, line.MaSP)
                    .input('MaNV', sql.VarChar, req.user.MaNV)
                    .input('SoLuong', sql.Int, -Number(line.SoLuong))
                    .input('DonGiaVon', sql.Decimal(18, 2), cost)
                    .input('ThanhTienVon', sql.Decimal(18, 2), cost * Number(line.SoLuong))
                    .input('MaDT', sql.VarChar, maDT)
                    .input('GhiChu', sql.NVarChar, `Sửa tích nhầm — xuất hủy hàng hỏng đã nhập lại kho`)
                    .query(`INSERT GiaoDichKho(MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                            VALUES(@MaGD,@MaKho,@MaSP,@MaNV,N'Xuất',@SoLuong,@DonGiaVon,@ThanhTienVon,N'DoiTra',@MaDT,GETDATE(),@GhiChu)`);
            }
        }

        let openIssues;
        try {
            openIssues = await new sql.Request(transaction)
                .input('MaNV', sql.VarChar, req.user.MaNV)
                .input('MaDT', sql.VarChar, maDT)
                .input('Mau', sql.NVarChar, `%${marker}%`).query(`
                SELECT MaPX, TrangThai FROM PhieuXuat WITH (UPDLOCK, HOLDLOCK)
                WHERE MaNV=@MaNV AND (MaDT=@MaDT OR GhiChu LIKE @Mau)
                  AND TrangThai IN (N'Nháp', N'Chờ duyệt', N'Đã duyệt')`);
        } catch (error) {
            if (!/Invalid column name|MaDT/i.test(error.message || '')) throw error;
            openIssues = await new sql.Request(transaction)
                .input('MaNV', sql.VarChar, req.user.MaNV)
                .input('Mau', sql.NVarChar, `%${marker}%`).query(`
                SELECT MaPX, TrangThai FROM PhieuXuat WITH (UPDLOCK, HOLDLOCK)
                WHERE MaNV=@MaNV AND GhiChu LIKE @Mau
                  AND TrangThai IN (N'Nháp', N'Chờ duyệt', N'Đã duyệt')`);
        }
        for (const issue of openIssues.recordset) {
            if (issue.TrangThai === 'Nháp') {
                await new sql.Request(transaction).input('MaPX', sql.VarChar, issue.MaPX)
                    .query('DELETE ChiTietPhieuXuat WHERE MaPX=@MaPX; DELETE PhieuXuat WHERE MaPX=@MaPX');
            } else {
                await new sql.Request(transaction).input('MaPX', sql.VarChar, issue.MaPX).query(`
                    UPDATE PhieuXuat SET TrangThai=N'Từ chối',
                        LyDoTuChoi=N'Đã trừ tồn khi Thủ kho xác nhận tích nhầm trên phiếu đổi trả'
                    WHERE MaPX=@MaPX`);
            }
        }

        const stamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const reduced = completed && (lines.length > 0 || stockAlreadyCut);
        const ketQua = (reduced
            ? 'Không đạt, không nhập lại kho. Sửa tích nhầm: hàng hỏng, đã trừ tồn nhập nhầm.'
            : 'Không đạt, không nhập lại kho. Sửa tích nhầm: hàng hỏng, không nhập lại khi hoàn.').slice(0, 200);
        const note = `[${reduced ? 'Đã trừ tồn tích nhầm' : 'Đã sửa tích nhầm'} ${stamp}] ${reason}`.slice(0, 500);
        const ghiChu = `${ticket.GhiChu ? `${ticket.GhiChu}\n` : ''}${note}`.slice(0, 500);
        await new sql.Request(transaction)
            .input('MaDT', sql.VarChar, maDT)
            .input('KetQua', sql.NVarChar, ketQua)
            .input('GhiChu', sql.NVarChar, ghiChu)
            .query('UPDATE PhieuDoiTra SET KetQuaKiemTra=@KetQua, GhiChu=@GhiChu WHERE MaDT=@MaDT');
        await writeAudit(new sql.Request(transaction), req.user, 'Xác nhận tích nhầm kiểm đổi trả', maDT,
            reduced
                ? `${note}. Đã trừ tồn ${lines.reduce((sum, line) => sum + Number(line.SoLuong || 0), 0) || 'theo phiếu xuất'} đơn vị hàng hỏng nhập nhầm.`
                : `${note}. Thu ngân xác nhận hoàn/đổi sẽ không cộng tồn.`);
        await transaction.commit();
        res.json({
            reduced,
            GhiChu: ghiChu,
            message: reduced
                ? `Đã xác nhận tích nhầm trên ${maDT}: tồn kho giảm số lượng hàng hỏng đã nhập lại.`
                : `Đã sửa ${maDT}: hàng hỏng sẽ không nhập lại kho khi thu ngân xác nhận hoàn/đổi.`
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message || 'Không thể xác nhận tích nhầm.' });
    }
};

const decideReturn = (approved) => async (req, res) => {
    try {
        const reason = clean(req.body.LyDo, 500);
        if (!approved && !reason) throw new Error('Từ chối phải ghi lý do.');
        const pool = await poolPromise;
        const result = await pool.request().input('MaDT', sql.VarChar, clean(req.params.id, 20))
            .input('MaNV', sql.VarChar, req.user.MaNV)
            .input('TrangThai', sql.NVarChar, approved ? 'Đã duyệt' : 'Từ chối')
            .input('LyDo', sql.NVarChar, reason || null).query(`
                UPDATE PhieuDoiTra SET TrangThai=@TrangThai, MaNV_Duyet=@MaNV, NgayDuyet=GETDATE(),
                    GhiChu=COALESCE(@LyDo, GhiChu)
                WHERE MaDT=@MaDT AND TrangThai=N'Chờ duyệt';
                SELECT @@ROWCOUNT affected;`);
        if (!result.recordset[0].affected) return res.status(400).json({ message: 'Phiếu không còn chờ phê duyệt.' });
        await writeAudit(pool.request(), req.user, approved ? 'Phê duyệt đổi trả' : 'Từ chối đổi trả', req.params.id, reason || 'Đồng ý theo kết quả kiểm tra của Thủ kho');
        res.json({ message: approved ? 'Đã phê duyệt phiếu đổi trả.' : 'Đã từ chối phiếu đổi trả.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const COMPLETE_MONEY_STATUSES = ['Đã duyệt', RETURN_MONEY_PENDING, RETURN_MONEY_FAILED];

const stockMovesExist = async (connection, maDT) => {
    const result = await new sql.Request(connection).input('MaDT', sql.VarChar, maDT).query(`
        SELECT COUNT(*) So FROM GiaoDichKho WHERE LoaiChungTu=N'DoiTra' AND MaChungTu=@MaDT`);
    return Number(result.recordset[0]?.So || 0) > 0;
};

const applyReturnStockMoves = async (transaction, { ticket, returned, restock, maNV, maDT }) => {
    if (restock) {
        for (let index = 0; index < returned.length; index += 1) {
            const line = returned[index];
            await new sql.Request(transaction).input('MaKho', sql.VarChar, ticket.MaKho)
                .input('MaSP', sql.VarChar, line.MaSP).input('SoLuong', sql.Int, line.SoLuong)
                .input('DonGiaVon', sql.Decimal(18, 2), line.DonGiaVon).query(`
                    UPDATE TonKho SET SLTon=SLTon+@SoLuong,
                        GiaTriTon=(SLTon+@SoLuong)*CASE WHEN SLTon+@SoLuong=0 THEN 0
                            ELSE ((SLTon*DonGiaBinhQuan)+(@SoLuong*@DonGiaVon))/(SLTon+@SoLuong) END,
                        DonGiaBinhQuan=CASE WHEN SLTon+@SoLuong=0 THEN 0
                            ELSE ((SLTon*DonGiaBinhQuan)+(@SoLuong*@DonGiaVon))/(SLTon+@SoLuong) END,
                        NgayCapNhat=GETDATE()
                    WHERE MaKho=@MaKho AND MaSP=@MaSP`);
            const maGD = await generateId(transaction, 'GiaoDichKho', 'MaGD', `GD${new Date().toISOString().slice(2, 10).replaceAll('-', '')}`);
            await new sql.Request(transaction).input('MaGD', sql.VarChar, maGD)
                .input('MaKho', sql.VarChar, ticket.MaKho).input('MaSP', sql.VarChar, line.MaSP)
                .input('MaNV', sql.VarChar, maNV).input('SoLuong', sql.Int, line.SoLuong)
                .input('DonGiaVon', sql.Decimal(18, 2), line.DonGiaVon)
                .input('ThanhTienVon', sql.Decimal(18, 2), line.ThanhTienVon)
                .input('MaDT', sql.VarChar, maDT).query(`
                    INSERT GiaoDichKho(MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                    VALUES(@MaGD,@MaKho,@MaSP,@MaNV,N'Nhập',@SoLuong,@DonGiaVon,@ThanhTienVon,N'DoiTra',@MaDT,GETDATE(),N'Nhập lại hàng khách trả đạt yêu cầu')`);
        }
        return;
    }
    for (let index = 0; index < returned.length; index += 1) {
        const line = returned[index];
        const maGD = await generateId(transaction, 'GiaoDichKho', 'MaGD', `GD${new Date().toISOString().slice(2, 10).replaceAll('-', '')}`);
        await new sql.Request(transaction).input('MaGD', sql.VarChar, maGD)
            .input('MaKho', sql.VarChar, ticket.MaKho).input('MaSP', sql.VarChar, line.MaSP)
            .input('MaNV', sql.VarChar, maNV)
            .input('DonGiaVon', sql.Decimal(18, 2), line.DonGiaVon)
            .input('MaDT', sql.VarChar, maDT).query(`
                INSERT GiaoDichKho(MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                VALUES(@MaGD,@MaKho,@MaSP,@MaNV,N'Điều chỉnh',0,@DonGiaVon,0,N'DoiTra',@MaDT,GETDATE(),
                  N'Loại bỏ/vứt hàng khách trả — không cộng tồn (đã trừ lúc bán)')`);
    }
};

const applyExchangeIssue = async (transaction, { ticket, preparedExchange, maNV, maDT }) => {
    for (const { maSP, qty, price, cost } of preparedExchange) {
        await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).input('MaSP', sql.VarChar, maSP)
            .input('SoLuong', sql.Int, qty).input('DonGia', sql.Decimal(18, 2), price)
            .input('ThanhTien', sql.Decimal(18, 2), price * qty)
            .input('DonGiaVon', sql.Decimal(18, 2), cost)
            .input('ThanhTienVon', sql.Decimal(18, 2), cost * qty).query(`
                INSERT ChiTietDoiTra(MaDT,MaSP,LoaiDong,SoLuong,DonGia,ThanhTien,DonGiaVon,ThanhTienVon,LyDo)
                VALUES(@MaDT,@MaSP,N'Hàng giao đổi',@SoLuong,@DonGia,@ThanhTien,@DonGiaVon,@ThanhTienVon,N'Giao đổi cho khách')`);
        await new sql.Request(transaction).input('MaKho', sql.VarChar, ticket.MaKho)
            .input('MaSP', sql.VarChar, maSP).input('SoLuong', sql.Int, qty).query(`
                UPDATE TonKho SET SLTon=SLTon-@SoLuong, GiaTriTon=(SLTon-@SoLuong)*DonGiaBinhQuan, NgayCapNhat=GETDATE()
                WHERE MaKho=@MaKho AND MaSP=@MaSP AND SLTon>=@SoLuong`);
        const maGD = await generateId(transaction, 'GiaoDichKho', 'MaGD', `GD${new Date().toISOString().slice(2, 10).replaceAll('-', '')}`);
        await new sql.Request(transaction).input('MaGD', sql.VarChar, maGD)
            .input('MaKho', sql.VarChar, ticket.MaKho).input('MaSP', sql.VarChar, maSP)
            .input('MaNV', sql.VarChar, maNV).input('SoLuong', sql.Int, -qty)
            .input('DonGiaVon', sql.Decimal(18, 2), cost)
            .input('ThanhTienVon', sql.Decimal(18, 2), cost * qty)
            .input('MaDT', sql.VarChar, maDT).query(`
                INSERT GiaoDichKho(MaGD,MaKho,MaSP,MaNV,LoaiGD,SoLuong,DonGiaVon,ThanhTienVon,LoaiChungTu,MaChungTu,NgayGD,GhiChu)
                VALUES(@MaGD,@MaKho,@MaSP,@MaNV,N'Xuất',@SoLuong,@DonGiaVon,@ThanhTienVon,N'DoiTra',@MaDT,GETDATE(),N'Xuất hàng giao đổi cho khách')`);
    }
};

const completeReturn = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const maDT = clean(req.params.id, 20);
        await ensureReturnHandoverSchema(await poolPromise);
        await ensureReturnRefundSchema(await poolPromise);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        await healParkedReturns(transaction);
        const header = await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
            SELECT dt.*, hd.MaKho FROM PhieuDoiTra dt WITH(UPDLOCK,HOLDLOCK)
            JOIN HoaDon hd ON hd.MaHD=dt.MaHD
            WHERE dt.MaDT=@MaDT`);
        if (!header.recordset.length) throw new Error('Không tìm thấy phiếu đổi trả.');
        const ticket = header.recordset[0];
        if (!COMPLETE_MONEY_STATUSES.includes(ticket.TrangThai)) {
            throw new Error('Chỉ phiếu đã duyệt, đang hoàn tiền hoặc hoàn tiền thất bại mới xử lý được.');
        }
        let dutyResult;
        try {
            dutyResult = await assertCashierDuty(transaction, req.user.MaNV, 'complete-return');
        } catch (error) {
            const openNow = (await new sql.Request(transaction).input('MaNV', sql.VarChar, req.user.MaNV).query(`
                SELECT TOP 1 MaCa, MaQuay FROM CaLamViec WITH(UPDLOCK,HOLDLOCK)
                WHERE MaNV=@MaNV AND TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL`)).recordset[0];
            const quay = ticket.MaQuayXuLy || openNow?.MaQuay || (await new sql.Request(transaction)
                .input('MaDT', sql.VarChar, maDT)
                .query(`SELECT ca.MaQuay FROM PhieuDoiTra dt
                        JOIN HoaDon hd ON hd.MaHD=dt.MaHD
                        LEFT JOIN CaLamViec ca ON ca.MaCa=hd.MaCa
                        WHERE dt.MaDT=@MaDT`)).recordset[0]?.MaQuay;
            if (error.status === 403 && quay && !openNow) {
                await handoverApprovedReturns(transaction, {
                    fromMaNV: assignedCashierOf(ticket),
                    maQuay: quay,
                    fromMaCa: ticket.MaCaHoan || null,
                    afterTime: new Date()
                });
                await transaction.commit();
                return res.status(error.status || 403).json({
                    message: error.message,
                    handedOver: true
                });
            }
            throw error;
        }
        const shift = dutyResult.shift || (await new sql.Request(transaction).input('MaNV', sql.VarChar, req.user.MaNV).query(`
            SELECT TOP 1 MaCa, MaQuay FROM CaLamViec WITH(UPDLOCK,HOLDLOCK)
            WHERE MaNV=@MaNV AND TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL`)).recordset[0];
        if (!shift) throw new Error('Phải mở ca bán hàng của bạn trước khi hoàn tiền hoặc giao hàng đổi. Không mở lại ca nhân viên đã đóng.');
        const maQuay = shift.MaQuay || dutyResult.shift?.MaQuay;
        if (canClaimLeftoverReturn(ticket, req.user.MaNV, maQuay)) {
            const accepted = await acceptLeftoverReturn(transaction, {
                maDT, maNV: req.user.MaNV, maQuay, maCa: shift.MaCa
            });
            if (accepted) {
                ticket.MaNV_XuLy = accepted.MaNV_XuLy;
                ticket.MaQuayXuLy = accepted.MaQuayXuLy;
                ticket.NgayTiepNhan = accepted.NgayTiepNhan;
                ticket.NgayBanGiao = accepted.NgayBanGiao;
            }
        }
        if (!canCompleteAssignedReturn(ticket, req.user.MaNV, maQuay)
            && !canActOnAssignedReturn(ticket, req.user.MaNV, maQuay)) {
            throw new Error('Phiếu này đã chuyển ca sau cùng quầy. Thu ngân ca hiện tại tiếp nhận rồi mới xác nhận hoàn/đổi.');
        }
        const maCaHoan = shift.MaCa;
        const restock = isRestockAccepted(ticket.KetQuaKiemTra);
        const returned = await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
            SELECT * FROM ChiTietDoiTra WITH(UPDLOCK,HOLDLOCK) WHERE MaDT=@MaDT AND LoaiDong=N'Hàng khách trả'`);
        const existingExchange = await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
            SELECT * FROM ChiTietDoiTra WITH(UPDLOCK,HOLDLOCK) WHERE MaDT=@MaDT AND LoaiDong=N'Hàng giao đổi'`);
        const stockDone = await stockMovesExist(transaction, maDT);
        const pays = await new sql.Request(transaction).input('MaHD', sql.VarChar, ticket.MaHD).query(`
            SELECT PhuongThuc, SoTien, TrangThai, MaGiaoDich, NguonXacNhan, GhiChu
            FROM ThanhToan WHERE MaHD=@MaHD AND TrangThai=N'Thành công'`);
        const firstComplete = ticket.TrangThai === 'Đã duyệt';
        let preparedExchange = [];
        let moneyPlan = {
            kind: Number(ticket.SoTienHoan) > 0 ? 'refund' : 'equal',
            soTienHoan: Number(ticket.SoTienHoan || 0),
            soTienThuThem: Number(ticket.SoTienThuThem || 0)
        };

        if (ticket.HinhThucXuLy === 'Đổi hàng') {
            if (firstComplete && !existingExchange.recordset.length) {
                const exchange = Array.isArray(req.body.exchange) ? req.body.exchange : [];
                if (!exchange.length) throw new Error('Đổi hàng phải chọn sản phẩm giao cho khách.');
                const exchangedProducts = new Set();
                let exchangeValue = 0;
                for (const raw of exchange) {
                    const maSP = clean(raw.MaSP, 20);
                    const qty = Number(raw.SoLuong);
                    if (!maSP || !Number.isInteger(qty) || qty <= 0) throw new Error('Dòng hàng giao đổi không hợp lệ.');
                    if (exchangedProducts.has(maSP)) throw new Error(`Sản phẩm ${maSP} bị lặp trong danh sách hàng giao đổi.`);
                    exchangedProducts.add(maSP);
                    const stock = await new sql.Request(transaction).input('MaKho', sql.VarChar, ticket.MaKho)
                        .input('MaSP', sql.VarChar, maSP).query(`
                            SELECT sp.TenSP, sp.GiaBan, tk.SLTon, tk.DonGiaBinhQuan
                            FROM SanPham sp JOIN TonKho tk WITH(UPDLOCK,HOLDLOCK)
                              ON tk.MaSP=sp.MaSP AND tk.MaKho=@MaKho
                            WHERE sp.MaSP=@MaSP AND sp.TrangThai IN (N'Đang bán', N'Đang kinh doanh')`);
                    if (!stock.recordset.length) throw new Error(`Sản phẩm ${maSP} không còn kinh doanh.`);
                    if (Number(stock.recordset[0].SLTon) < qty) throw new Error(`${stock.recordset[0].TenSP} không đủ tồn để giao đổi.`);
                    const price = Number(stock.recordset[0].GiaBan);
                    const cost = Number(stock.recordset[0].DonGiaBinhQuan || 0);
                    exchangeValue = roundMoney(exchangeValue + price * qty);
                    preparedExchange.push({ maSP, qty, price, cost });
                }
                const returnedValue = roundMoney(returned.recordset.reduce((sum, line) => sum + Number(line.ThanhTien || 0), 0));
                moneyPlan = exchangeMoneyDelta(returnedValue, exchangeValue);
            } else {
                const returnedValue = roundMoney(returned.recordset.reduce((sum, line) => sum + Number(line.ThanhTien || 0), 0));
                const exchangeValue = roundMoney(existingExchange.recordset.reduce((sum, line) => sum + Number(line.ThanhTien || 0), 0));
                moneyPlan = exchangeMoneyDelta(returnedValue, exchangeValue);
            }
        } else if (ticket.HinhThucXuLy !== 'Hoàn tiền') {
            throw new Error('Hình thức xử lý đổi trả không hợp lệ.');
        }

        if (firstComplete && !stockDone) {
            await applyReturnStockMoves(transaction, {
                ticket, returned: returned.recordset, restock, maNV: req.user.MaNV, maDT
            });
            if (preparedExchange.length) {
                await applyExchangeIssue(transaction, {
                    ticket, preparedExchange, maNV: req.user.MaNV, maDT
                });
            }
            await new sql.Request(transaction)
                .input('MaDT', sql.VarChar, maDT)
                .input('SoTien', sql.Decimal(18, 2), moneyPlan.soTienHoan)
                .input('ThuThem', sql.Decimal(18, 2), moneyPlan.soTienThuThem)
                .query(`UPDATE PhieuDoiTra SET SoTienHoan=@SoTien, SoTienThuThem=@ThuThem WHERE MaDT=@MaDT`);
        }

        const opener = await new sql.Request(transaction).input('MaNV', sql.VarChar, ticket.MaNV_Lap)
            .query('SELECT TenNV FROM NhanVien WHERE MaNV=@MaNV');
        const claimerRow = await new sql.Request(transaction).input('MaNV', sql.VarChar, req.user.MaNV)
            .query('SELECT TenNV FROM NhanVien WHERE MaNV=@MaNV');
        const customer = await new sql.Request(transaction).input('MaHD', sql.VarChar, ticket.MaHD)
            .query(`SELECT kh.TenKH FROM HoaDon hd LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH WHERE hd.MaHD=@MaHD`);
        const historyNote = ticket.NgayBanGiao || (ticket.MaNV_Lap && ticket.MaNV_Lap !== req.user.MaNV)
            ? describeReturnHandover({
                openerMaNV: ticket.MaNV_Lap,
                openerName: opener.recordset[0]?.TenNV,
                openerAt: ticket.NgayLap,
                parkedAt: ticket.NgayBanGiao,
                claimerMaNV: req.user.MaNV,
                claimerName: claimerRow.recordset[0]?.TenNV,
                claimerAt: ticket.NgayTiepNhan || new Date(),
                customerName: customer.recordset[0]?.TenKH,
                completed: false
            })
            : ticket.HinhThucXuLy;

        if (ticket.TrangThai === RETURN_MONEY_PENDING) {
            await transaction.commit();
            const queried = await queryZaloPayRefund({
                connection: await poolPromise, ticket, maCa: maCaHoan, user: req.user, req
            });
            return res.json({ MaDT: maDT, MaCaHoan: maCaHoan, history: historyNote, ...queried });
        }
        if (ticket.TrangThai === RETURN_MONEY_FAILED) {
            await transaction.commit();
            const retried = await retryZaloPayRefund({
                connection: await poolPromise,
                ticket,
                amount: moneyPlan.soTienHoan || Number(ticket.SoTienHoan || 0),
                maCa: maCaHoan,
                user: req.user,
                req
            });
            return res.json({ MaDT: maDT, MaCaHoan: maCaHoan, history: historyNote, ...retried });
        }

        if (moneyPlan.kind === 'collect') {
            const collectMethod = clean(req.body.PhuongThucThuThem, 30)
                || (defaultRefundMethod(null, pays.recordset) === 'QR' ? 'QR' : 'Tiền mặt');
            if (collectMethod === 'Tiền mặt') {
                await markTicketDone(transaction, {
                    maDT, maCa: maCaHoan, method: 'Tiền mặt', amount: 0,
                    soTienThuThem: moneyPlan.soTienThuThem, phuongThucThuThem: 'Tiền mặt'
                });
                await writeAudit(new sql.Request(transaction), req.user, 'Hoàn thành đổi trả', maDT,
                    `${historyNote}. Thu thêm TM ${moneyPlan.soTienThuThem} — không hoàn rồi bán lại.`);
                await postReturnJournals(transaction, {
                    maDT, maNV: req.user.MaNV, user: req.user, includeMoney: false, includeStock: true
                });
                await transaction.commit();
                return res.json({
                    message: `Đã thu thêm tiền mặt và hoàn tất ${maDT}. Hóa đơn gốc không đổi.`,
                    MaDT: maDT, MaCaHoan: maCaHoan, TrangThai: 'Hoàn thành', completed: true
                });
            }
            await transaction.commit();
            const started = await startExchangeCollect({
                connection: await poolPromise,
                ticket: { ...ticket, SoTienThuThem: moneyPlan.soTienThuThem },
                amount: moneyPlan.soTienThuThem,
                method: 'QR',
                maCa: maCaHoan,
                user: req.user,
                req
            });
            return res.json({ MaDT: maDT, MaCaHoan: maCaHoan, TrangThai: 'Đã duyệt', ...started });
        }

        if (moneyPlan.kind === 'equal' || !(moneyPlan.soTienHoan > 0)) {
            await markTicketDone(transaction, {
                maDT, maCa: maCaHoan, method: defaultRefundMethod(null, pays.recordset) || 'Tiền mặt', amount: 0
            });
            await writeAudit(new sql.Request(transaction), req.user, 'Hoàn thành đổi trả', maDT,
                `${historyNote}. Đổi ngang — không hoàn tiền.`);
            await postReturnJournals(transaction, { maDT, maNV: req.user.MaNV, user: req.user });
            await transaction.commit();
            return res.json({
                message: `Đã hoàn tất ${maDT}. Đổi ngang giá, không sinh hoàn tiền.`,
                MaDT: maDT, MaCaHoan: maCaHoan, TrangThai: 'Hoàn thành', completed: true
            });
        }

        const method = resolveRefundMethod({
            originalMethod: defaultRefundMethod(null, pays.recordset),
            payments: pays.recordset,
            requested: req.body.PhuongThucHoan
        });

        if (method === 'Tiền mặt') {
            const drawer = await loadOpenShiftDrawer(transaction, maCaHoan);
            assertCashDrawerEnough(moneyPlan.soTienHoan, drawer.TienMatTrongKet);
            await markTicketDone(transaction, {
                maDT, maCa: maCaHoan, method: 'Tiền mặt', amount: moneyPlan.soTienHoan
            });
            await writeAudit(new sql.Request(transaction), req.user, 'Hoàn thành đổi trả', maDT,
                `${historyNote}. Hoàn tiền mặt từ két ca đang mở.`);
            await postReturnJournals(transaction, { maDT, maNV: req.user.MaNV, user: req.user });
            await transaction.commit();
            return res.json({
                message: `Đã hoàn tiền mặt ${maDT}.`,
                MaDT: maDT, MaCaHoan: maCaHoan, TrangThai: 'Hoàn thành', completed: true,
                TienMatTrongKet: drawer.TienMatTrongKet
            });
        }

        await transaction.commit();
        const sent = await sendZaloPayRefund({
            connection: await poolPromise,
            ticket: { ...ticket, SoTienHoan: moneyPlan.soTienHoan },
            amount: moneyPlan.soTienHoan,
            maCa: maCaHoan,
            user: req.user,
            req
        });
        if (sent.queryOnly || sent.alreadyDone) {
            const queried = await queryZaloPayRefund({
                connection: await poolPromise, ticket, maCa: maCaHoan, user: req.user, req
            });
            return res.json({ MaDT: maDT, MaCaHoan: maCaHoan, history: historyNote, ...queried });
        }
        const journalTxn = new sql.Transaction(await poolPromise);
        await journalTxn.begin();
        try {
            await postReturnJournals(journalTxn, {
                maDT, maNV: req.user.MaNV, user: req.user, includeMoney: false, includeStock: true
            });
            await journalTxn.commit();
        } catch (journalError) {
            if (journalTxn._aborted !== true) await journalTxn.rollback().catch(() => {});
            console.error(journalError);
        }
        return res.json({
            MaDT: maDT,
            MaCaHoan: maCaHoan,
            history: historyNote,
            TrangThai: sent.failed ? RETURN_MONEY_FAILED : RETURN_MONEY_PENDING,
            pending: sent.pending,
            failed: sent.failed,
            mRefundId: sent.mRefundId,
            message: sent.message
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(error.status || 400).json({ message: error.message });
    }
};

const queryReturnRefund = async (req, res) => {
    try {
        const maDT = clean(req.params.id, 20);
        await ensureReturnRefundSchema(await poolPromise);
        const duty = await assertCashierDuty(await poolPromise, req.user.MaNV, 'complete-return');
        const header = await (await poolPromise).request().input('MaDT', sql.VarChar, maDT).query(`
            SELECT dt.* FROM PhieuDoiTra dt WHERE dt.MaDT=@MaDT`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy phiếu đổi trả.' });
        const ticket = header.recordset[0];
        if (ticket.MaThamChieuThuThem && Number(ticket.SoTienThuThem || 0) > 0 && ticket.TrangThai === 'Đã duyệt') {
            const collected = await queryExchangeCollect({
                connection: await poolPromise,
                ticket,
                maCa: duty.shift?.MaCa || ticket.MaCaHoan,
                user: req.user,
                req
            });
            return res.json({ MaDT: maDT, ...collected });
        }
        const queried = await queryZaloPayRefund({
            connection: await poolPromise,
            ticket,
            maCa: duty.shift?.MaCa || ticket.MaCaHoan,
            user: req.user,
            req
        });
        res.json({ MaDT: maDT, ...queried });
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message });
    }
};

const retryReturnRefund = async (req, res) => {
    try {
        const maDT = clean(req.params.id, 20);
        await ensureReturnRefundSchema(await poolPromise);
        const duty = await assertCashierDuty(await poolPromise, req.user.MaNV, 'complete-return');
        const header = await (await poolPromise).request().input('MaDT', sql.VarChar, maDT).query(`
            SELECT dt.* FROM PhieuDoiTra dt WHERE dt.MaDT=@MaDT`);
        if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy phiếu đổi trả.' });
        const ticket = header.recordset[0];
        const retried = await retryZaloPayRefund({
            connection: await poolPromise,
            ticket,
            amount: Number(ticket.SoTienHoan || 0),
            maCa: duty.shift?.MaCa || ticket.MaCaHoan,
            user: req.user,
            req
        });
        res.json({ MaDT: maDT, ...retried });
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message });
    }
};

const claimReturn = async (req, res) => {
    const transaction = new sql.Transaction(await poolPromise);
    try {
        const maDT = clean(req.params.id, 20);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        await healParkedReturns(transaction);
        const duty = await assertCashierDuty(transaction, req.user.MaNV, 'complete-return');
        const shift = duty.shift || (await new sql.Request(transaction).input('MaNV', sql.VarChar, req.user.MaNV).query(`
            SELECT TOP 1 MaCa, MaQuay FROM CaLamViec WITH(UPDLOCK,HOLDLOCK)
            WHERE MaNV=@MaNV AND TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL`)).recordset[0];
        if (!shift) throw new Error('Phải mở ca bán hàng của bạn trước khi tiếp nhận phiếu đổi trả.');
        const header = await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
            SELECT dt.*, hd.MaKH, kh.TenKH, lap.TenNV NguoiLap
            FROM PhieuDoiTra dt WITH(UPDLOCK,HOLDLOCK)
            JOIN HoaDon hd ON hd.MaHD=dt.MaHD
            JOIN NhanVien lap ON lap.MaNV=dt.MaNV_Lap
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH
            WHERE dt.MaDT=@MaDT`);
        if (!header.recordset.length) throw new Error('Không tìm thấy phiếu đổi trả.');
        const ticket = header.recordset[0];
        if (!canClaimLeftoverReturn(ticket, req.user.MaNV, shift.MaQuay)) {
            throw new Error('Phiếu này không phải việc sót tại quầy ca đang mở, hoặc đã được tiếp nhận.');
        }
        const accepted = await acceptLeftoverReturn(transaction, {
            maDT,
            maNV: req.user.MaNV,
            maQuay: shift.MaQuay,
            maCa: shift.MaCa
        });
        if (!accepted) throw new Error('Không tiếp nhận được phiếu đổi trả.');
        const claimer = await new sql.Request(transaction).input('MaNV', sql.VarChar, req.user.MaNV)
            .query('SELECT TenNV FROM NhanVien WHERE MaNV=@MaNV');
        const history = historyOf({
            ...ticket,
            MaNV_XuLy: req.user.MaNV,
            NguoiXuLy: claimer.recordset[0]?.TenNV,
            NgayTiepNhan: accepted.NgayTiepNhan || new Date()
        });
        await writeAudit(new sql.Request(transaction), req.user, 'Tiếp nhận đổi trả', maDT, history);
        await transaction.commit();
        res.json({
            message: `Đã tiếp nhận ${maDT} trên ca ${shift.MaCa}.`,
            MaDT: maDT,
            MaCaBanGiao: shift.MaCa,
            history
        });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(error.status || 400).json({ message: error.message });
    }
};

module.exports = {
    searchInvoices, listRecentInvoices, getInvoiceForReturn, listReturns, getReturn,
    createReturn, submitReturn, inspectReturn, flagInspectMistake, decideReturn,
    claimReturn, completeReturn, queryReturnRefund, retryReturnRefund
};
