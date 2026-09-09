const fs = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');
const { sql, poolPromise } = require('../config/db');
const { resolveReportingPeriod, vietnamCalendar, vietnamDateKey, dateKeyFromDocCode, calendarizeRow } = require('../services/reportingPeriod');
const { roundMoney } = require('../services/financialRules');
const { splitVatExclusive, assertChosenRate } = require('../services/vatSales');
const {
    hasAccountingSchema,
    postJournal,
    reverseJournal,
    previewJournal,
    generateJournalId,
    findEffectiveJournal,
    findOpenPeriod,
    findCoveringPeriod,
    isoDate,
    n,
    KQKD_NATURE,
    yyMM,
    yyMMFromMaKy,
    periodLabelVi,
    defaultDateInPeriod,
    datesInOpenPeriod
} = require('../services/journalEngine');
const { rebuildFromDocument, postExpenseConfirm, postAssetConfirm } = require('../services/accountingHooks');
const { logAuditSafe } = require('../services/auditLog');
const { INVOICE_RETURN_APPLY, INVOICE_RETURN_COLUMNS } = require('../services/invoiceReturnSql');
const {
    expenseTypeLabel,
    presentExpense,
    presentAccount,
    presentJournalRow,
    docTypeLabel
} = require('../services/ledgerLabels');

const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 },
    fileFilter: (req, file, done) => {
        const name = String(file.originalname || '').toLowerCase();
        const csv = name.endsWith('.csv') || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel';
        if (!csv || name.endsWith('.xlsx') || name.endsWith('.xls')) {
            return done(Object.assign(new Error('Chỉ nhận file CSV. Không import Excel.'), { status: 400 }));
        }
        done(null, true);
    }
});

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const periodKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
const lastDay = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const viDay = iso => {
    const text = isoDate(iso);
    if (!text) return '';
    return `${text.slice(8, 10)}/${text.slice(5, 7)}/${text.slice(0, 4)}`;
};
const outsideOpenError = (open) => {
    const range = open ? ` Chỉ nhận ngày từ ${viDay(open.TuNgay)} đến ${viDay(open.DenNgay)}.` : '';
    return Object.assign(new Error(`Ngày ngoài kỳ đang mở (${periodLabelVi(open?.MaKy)}).${range}`), { status: 400 });
};

const loadPresentedExpense = async (connection, id) => {
    const rows = await new sql.Request(connection).input('Id', sql.VarChar, id).query(`
        SELECT cp.*, l.TenLoaiCP,
               CASE WHEN ${HAS_EXPENSE_JOURNAL} THEN 1 ELSE 0 END AS HasJournal
        FROM ChiPhiVanHanh cp
        JOIN LoaiChiPhi l ON l.MaLoaiCP = cp.MaLoaiCP WHERE cp.MaCP = @Id`);
    return rows.recordset[0] ? presentExpense(rows.recordset[0]) : null;
};

const realignChiPhiJournalsToOpen = async (pool, open) => {
    if (!open) return 0;
    const tu = isoDate(open.TuNgay);
    const den = isoDate(open.DenNgay);
    const updated = await pool.request()
        .input('OpenKy', sql.VarChar, open.MaKy)
        .input('Tu', sql.Date, tu)
        .input('Den', sql.Date, den)
        .query(`
            UPDATE bt
            SET bt.MaKy=@OpenKy,
                bt.NgayHachToan=CASE
                    WHEN CONVERT(date, bt.NgayHachToan) BETWEEN @Tu AND @Den THEN CONVERT(date, bt.NgayHachToan)
                    ELSE @Den END,
                bt.NgayChungTu=CASE
                    WHEN CONVERT(date, bt.NgayChungTu) BETWEEN @Tu AND @Den THEN CONVERT(date, bt.NgayChungTu)
                    ELSE @Den END
            OUTPUT inserted.MaBT, inserted.MaChungTu
            FROM ButToan bt
            WHERE bt.LoaiButToan=N'CHI_PHI' AND bt.TrangThai=N'DaGhiSo' AND bt.DaBiDao=0
              AND (bt.MaKy<>@OpenKy
                   OR CONVERT(date, bt.NgayHachToan) < @Tu
                   OR CONVERT(date, bt.NgayHachToan) > @Den)`);
    const rows = updated.recordset || [];
    for (const row of rows) {
        if (!row.MaChungTu) continue;
        await pool.request()
            .input('Id', sql.VarChar, row.MaChungTu)
            .input('MaKy', sql.VarChar, open.MaKy)
            .input('Tu', sql.Date, tu)
            .input('Den', sql.Date, den)
            .query(`UPDATE ChiPhiVanHanh
                    SET MaKy=@MaKy,
                        NgayChungTu=CASE
                            WHEN CONVERT(date, NgayChungTu) BETWEEN @Tu AND @Den THEN NgayChungTu
                            ELSE @Den END
                    WHERE MaCP=@Id`);
    }
    return rows.length;
};

const backfillMissingExpenseJournals = async (pool, req) => {
    const open = await findOpenPeriod(pool);
    if (!open) return { posted: 0, realigned: 0 };
    const realigned = await realignChiPhiJournalsToOpen(pool, open);
    const pending = await pool.request().query(`
        SELECT cp.*
        FROM ChiPhiVanHanh cp
        WHERE cp.TrangThai=N'DaXacNhan'
          AND NOT EXISTS (
              SELECT 1 FROM ButToan bt
              WHERE bt.LoaiChungTu=N'ChiPhiVanHanh' AND bt.MaChungTu=cp.MaCP
                AND bt.LoaiButToan=N'CHI_PHI' AND bt.DaBiDao=0 AND bt.MaBTGoc IS NULL
                AND bt.TrangThai=N'DaGhiSo'
          )`);
    let posted = 0;
    let lastError = '';
    const maNV = req.user?.MaNV;
    if (!maNV) return { posted, realigned, error: 'Thiếu nhân viên để ghi sổ chi phí.' };
    for (const raw of pending.recordset) {
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const locked = await new sql.Request(transaction)
                .input('Id', sql.VarChar, raw.MaCP)
                .query(`SELECT * FROM ChiPhiVanHanh WITH (UPDLOCK,HOLDLOCK) WHERE MaCP=@Id`);
            const row = locked.recordset[0];
            if (!row) {
                await transaction.rollback().catch(() => {});
                continue;
            }
            const result = await postExpenseConfirm(transaction, {
                expense: row, maNV: maNV || row.MaNV_Lap, user: req.user
            });
            if (result?.queued) {
                lastError = `Không ghi sổ ${row.MaCP}: hệ thống xếp chờ thay vì ghi vào kỳ ${open.MaKy}.`;
                await transaction.rollback().catch(() => {});
                continue;
            }
            if (result?.MaBT) posted += 1;
            await transaction.commit();
        } catch (error) {
            await transaction.rollback().catch(() => {});
            lastError = error.message || String(error);
            console.error(`backfill CHI_PHI ${raw.MaCP}:`, lastError);
        }
    }
    return { posted, realigned, error: lastError || undefined };
};

const runExpenseJournalBackfill = async (pool, req) => {
    try {
        return await backfillMissingExpenseJournals(pool, req);
    } catch (error) {
        console.error('backfill CHI_PHI:', error.message || error);
        return { posted: 0, realigned: 0, error: error.message };
    }
};

const requireSchema = async (res) => {
    const pool = await poolPromise;
    if (!(await hasAccountingSchema(pool))) {
        res.status(503).json({ message: 'Chưa chạy migration kế toán (20260909_AccountingCore).' });
        return null;
    }
    return pool;
};

const handle = (fn) => async (req, res) => {
    try {
        const pool = await requireSchema(res);
        if (!pool) return;
        await fn(req, res, pool);
    } catch (error) {
        console.error(error);
        res.status(error.status || 400).json({ message: error.message || 'Lỗi kế toán.' });
    }
};

const writeLedgerAudit = (source, req, action, table, recordId, content, extra = {}) =>
    logAuditSafe(source, {
        user: req.user,
        req,
        action,
        table,
        recordId,
        content,
        uc: extra.uc || 'UC37',
        severity: extra.severity || 'Quan trọng',
        after: extra.after
    });

const listAccounts = handle(async (req, res, pool) => {
    const result = await pool.request().query(`
    SELECT * FROM TaiKhoanKeToan ORDER BY MaTK`);
    const items = result.recordset.map(presentAccount);
    res.json({ items, total: items.length });
});

const saveAccount = handle(async (req, res, pool) => {
    const MaTK = clean(req.body.MaTK, 8);
    const TenTK = clean(req.body.TenTK, 200);
    const TinhChat = clean(req.body.TinhChat, 20);
    const LoaiBC = clean(req.body.LoaiBC, 10);
    if (!MaTK || !TenTK) throw Object.assign(new Error('Thiếu mã / tên tài khoản.'), { status: 400 });
    const existing = await pool.request().input('MaTK', sql.VarChar, MaTK)
        .query('SELECT LaHeThong FROM TaiKhoanKeToan WHERE MaTK=@MaTK');
    if (existing.recordset.length) {
        if (Number(existing.recordset[0].LaHeThong) && req.body.Xoa) {
            throw Object.assign(new Error('Không xóa tài khoản hệ thống.'), { status: 400 });
        }
        await pool.request().input('MaTK', sql.VarChar, MaTK)
            .input('TenTK', sql.NVarChar, TenTK)
            .input('TT', sql.NVarChar, req.body.TrangThai === 'Ngung' ? 'Ngung' : 'Su dung')
            .input('GC', sql.NVarChar, clean(req.body.GhiChu, 300) || null)
            .query(`UPDATE TaiKhoanKeToan SET TenTK=@TenTK, TrangThai=@TT, GhiChu=@GC WHERE MaTK=@MaTK`);
        await writeLedgerAudit(pool, req, 'Cập nhật tài khoản kế toán', 'TaiKhoanKeToan', MaTK, `Cập nhật ${MaTK} — ${TenTK}`, { uc: 'UC34' });
        return res.json({ message: `Đã cập nhật ${MaTK}.` });
    }
    await pool.request().input('MaTK', sql.VarChar, MaTK).input('TenTK', sql.NVarChar, TenTK)
        .input('TC', sql.NVarChar, TinhChat).input('BC', sql.NVarChar, LoaiBC)
        .query(`INSERT INTO TaiKhoanKeToan (MaTK,TenTK,TinhChat,LoaiBC,LaHeThong)
                VALUES (@MaTK,@TenTK,@TC,@BC,0)`);
    await writeLedgerAudit(pool, req, 'Thêm tài khoản kế toán', 'TaiKhoanKeToan', MaTK, `Thêm ${MaTK} — ${TenTK}`, { uc: 'UC34' });
    res.status(201).json({ message: `Đã thêm ${MaTK}.` });
});

const patchAccount = handle(async (req, res, pool) => {
    req.body.MaTK = clean(req.params.maTK, 8);
    return saveAccount(req, res);
});

const listPeriods = handle(async (req, res, pool) => {
    const result = await pool.request().query(`
        SELECT k.*,
               CASE WHEN EXISTS (
                   SELECT 1 FROM ButToan bt
                   WHERE bt.LoaiChungTu=N'KyKeToan' AND bt.LoaiButToan=N'KET_CHUYEN'
                     AND bt.MaChungTu=k.MaKy AND bt.DaBiDao=0 AND bt.TrangThai=N'DaGhiSo'
               ) THEN 1 ELSE 0 END AS DaKetChuyen
        FROM KyKeToan k ORDER BY MaKy DESC`);
    res.json({ items: result.recordset.map(calendarizeRow) });
});

const upsertPeriod = handle(async (req, res, pool) => {
    const cal = vietnamCalendar();
    const year = Number(req.body.Nam || cal.year);
    const month = Number(req.body.Thang || cal.month);
    if (month < 1 || month > 12) throw new Error('Tháng không hợp lệ.');
    const MaKy = periodKey(year, month);
    const TuNgay = `${MaKy}-01`;
    const DenNgay = `${MaKy}-${String(lastDay(year, month)).padStart(2, '0')}`;
    const existing = await pool.request().input('MaKy', sql.VarChar, MaKy)
        .query('SELECT MaKy FROM KyKeToan WHERE MaKy=@MaKy');
    if (!existing.recordset.length) {
        await pool.request().input('MaKy', sql.VarChar, MaKy).input('Nam', sql.SmallInt, year)
            .input('Thang', sql.TinyInt, month).input('Tu', sql.Date, TuNgay).input('Den', sql.Date, DenNgay)
            .query(`INSERT INTO KyKeToan (MaKy,Nam,Thang,TuNgay,DenNgay) VALUES (@MaKy,@Nam,@Thang,@Tu,@Den)`);
        await writeLedgerAudit(pool, req, 'Tạo kỳ kế toán', 'KyKeToan', MaKy, `Tạo kỳ ${MaKy} (${TuNgay} → ${DenNgay})`, { uc: 'UC35' });
    }
    res.json({ MaKy, TuNgay, DenNgay });
});

const openPeriod = handle(async (req, res, pool) => {
    const MaKy = clean(req.params.maKy, 7);
    const open = await pool.request().query(`SELECT MaKy FROM KyKeToan WHERE TrangThai=N'Mo'`);
    if (open.recordset.length && open.recordset[0].MaKy !== MaKy) {
        throw new Error(`Đang có kỳ ${open.recordset[0].MaKy} mở. Khóa kỳ đó trước khi mở kỳ khác (khuyến nghị mini).`);
    }
    await pool.request().input('MaKy', sql.VarChar, MaKy).input('MaNV', sql.VarChar, req.user.MaNV)
        .query(`UPDATE KyKeToan SET TrangThai=N'Mo', NgayMo=GETDATE(), MaNV_Mo=@MaNV
                WHERE MaKy=@MaKy AND TrangThai IN (N'ChuaMo', N'DeNghiKhoa')`);
    await writeLedgerAudit(pool, req, 'Mở kỳ kế toán', 'KyKeToan', MaKy, `Mở kỳ ${MaKy}`, { uc: 'UC35' });
    res.json({ message: `Đã mở kỳ ${MaKy}.` });
});

const getOpening = handle(async (req, res, pool) => {
    const MaKy = clean(req.params.maKy, 7);
    const rows = await pool.request().input('MaKy', sql.VarChar, MaKy).query(`
        SELECT tk.MaTK, tk.TenTK, tk.TinhChat,
               ISNULL(sd.SoDuNo,0) SoDuNo, ISNULL(sd.SoDuCo,0) SoDuCo, ISNULL(sd.DaChot,0) DaChot
        FROM TaiKhoanKeToan tk
        LEFT JOIN SoDuDauKy sd ON sd.MaTK=tk.MaTK AND sd.MaKy=@MaKy
        WHERE tk.TrangThai=N'Su dung'
        ORDER BY tk.MaTK`);
    const tongNo = roundMoney(rows.recordset.reduce((s, r) => s + n(r.SoDuNo), 0));
    const tongCo = roundMoney(rows.recordset.reduce((s, r) => s + n(r.SoDuCo), 0));
    res.json({ items: rows.recordset.map(presentAccount), tongNo, tongCo, balanced: tongNo === tongCo });
});

const saveOpening = handle(async (req, res, pool) => {
    const MaKy = clean(req.params.maKy, 7);
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    for (const line of lines) {
        const locked = await pool.request().input('MaKy', sql.VarChar, MaKy).input('MaTK', sql.VarChar, line.MaTK)
            .query('SELECT DaChot FROM SoDuDauKy WHERE MaKy=@MaKy AND MaTK=@MaTK');
        if (Number(locked.recordset[0]?.DaChot)) {
            throw Object.assign(new Error(`Không sửa số dư đầu kỳ đã chốt (${line.MaTK}). Dùng bút toán điều chỉnh.`), { status: 400 });
        }
        await pool.request().input('MaKy', sql.VarChar, MaKy).input('MaTK', sql.VarChar, line.MaTK)
            .input('No', sql.Decimal(18, 2), n(line.SoDuNo))
            .input('Co', sql.Decimal(18, 2), n(line.SoDuCo))
            .input('GC', sql.NVarChar, clean(line.GhiChu, 200) || null)
            .query(`
                MERGE SoDuDauKy AS t
                USING (SELECT @MaKy MaKy, @MaTK MaTK) s
                ON t.MaKy=s.MaKy AND t.MaTK=s.MaTK
                WHEN MATCHED THEN UPDATE SET SoDuNo=@No, SoDuCo=@Co, GhiChu=@GC
                WHEN NOT MATCHED THEN INSERT (MaKy,MaTK,SoDuNo,SoDuCo,GhiChu) VALUES (@MaKy,@MaTK,@No,@Co,@GC);`);
    }
    await writeLedgerAudit(pool, req, 'Lưu số dư đầu kỳ', 'SoDuDauKy', MaKy, `Lưu ${lines.length} dòng số dư kỳ ${MaKy}`, { uc: 'UC35' });
    res.json({ message: 'Đã lưu số dư đầu kỳ.' });
});

const lockOpening = handle(async (req, res, pool) => {
    const MaKy = clean(req.params.maKy, 7);
    const ky = await pool.request().input('MaKy', sql.VarChar, MaKy).query('SELECT TrangThai FROM KyKeToan WHERE MaKy=@MaKy');
    if (ky.recordset[0]?.TrangThai !== 'Mo') throw new Error('Chốt số dư đầu kỳ khi kỳ đang mở.');
    const rows = await pool.request().input('MaKy', sql.VarChar, MaKy).query('SELECT * FROM SoDuDauKy WHERE MaKy=@MaKy');
    const tongNo = roundMoney(rows.recordset.reduce((s, r) => s + n(r.SoDuNo), 0));
    const tongCo = roundMoney(rows.recordset.reduce((s, r) => s + n(r.SoDuCo), 0));
    if (tongNo !== tongCo) throw new Error(`Tổng Nợ ${tongNo} ≠ tổng Có ${tongCo}. Không chốt.`);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        await new sql.Request(transaction).input('MaKy', sql.VarChar, MaKy)
            .query('UPDATE SoDuDauKy SET DaChot=1 WHERE MaKy=@MaKy');
        const lines = rows.recordset.flatMap(row => {
            const out = [];
            if (n(row.SoDuNo)) out.push({ maTK: row.MaTK, soTienNo: n(row.SoDuNo), soTienCo: 0 });
            if (n(row.SoDuCo)) out.push({ maTK: row.MaTK, soTienNo: 0, soTienCo: n(row.SoDuCo) });
            return out;
        });
        if (lines.length) {
            await postJournal(transaction, {
                loaiChungTu: 'KyKeToan', maChungTu: MaKy, loaiButToan: 'SODU_DAU_KY',
                ngayChungTu: `${MaKy}-01`,
                dienGiai: `Số dư đầu kỳ ${MaKy}`,
                lines, maNV: req.user.MaNV, user: req.user, nguon: 'Seeding'
            });
        }
        await writeLedgerAudit(transaction, req, 'Chốt số dư đầu kỳ', 'SoDuDauKy', MaKy, `Chốt số dư đầu kỳ ${MaKy}`, { uc: 'UC35' });
        await transaction.commit();
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
    res.json({ message: `Đã chốt số dư đầu kỳ ${MaKy}.` });
});

const listExpenseTypes = handle(async (req, res, pool) => {
    const rows = await pool.request().query('SELECT * FROM LoaiChiPhi ORDER BY MaLoaiCP');
    res.json({ items: rows.recordset.map(presentExpense) });
});

const HAS_EXPENSE_JOURNAL = `EXISTS (
            SELECT 1 FROM ButToan bt
            WHERE bt.LoaiChungTu=N'ChiPhiVanHanh' AND bt.MaChungTu=cp.MaCP
              AND bt.LoaiButToan=N'CHI_PHI' AND bt.DaBiDao=0 AND bt.MaBTGoc IS NULL AND bt.TrangThai=N'DaGhiSo'
        )`;

const listExpenses = handle(async (req, res, pool) => {
    const backfill = await runExpenseJournalBackfill(pool, req);
    const rows = await pool.request().query(`
        SELECT cp.*, l.TenLoaiCP,
               CASE WHEN ${HAS_EXPENSE_JOURNAL} THEN 1 ELSE 0 END AS HasJournal
        FROM ChiPhiVanHanh cp
        JOIN LoaiChiPhi l ON l.MaLoaiCP=cp.MaLoaiCP
        ORDER BY cp.NgayChungTu DESC, cp.MaCP DESC`);
    res.json({ items: rows.recordset.map(presentExpense), backfill });
});

const createExpense = handle(async (req, res, pool) => {
    const TienHang = n(req.body.TienHang);
    if (TienHang < 0) throw new Error('Tiền hàng không hợp lệ.');
    const ThueSuat = assertChosenRate(req.body.ThueSuat, 'Thuế suất chi phí');
    const tax = splitVatExclusive(TienHang, ThueSuat);
    const TienThue = req.body.TienThue != null ? n(req.body.TienThue) : tax.vat;
    const TongCong = roundMoney(TienHang + TienThue);
    const MaTKTien = clean(req.body.MaTKTien, 8);
    if (!['111', '112'].includes(MaTKTien)) throw new Error('Chỉ chọn TK tiền 111 hoặc 112.');
    const open = await findOpenPeriod(pool);
    if (!open) {
        throw Object.assign(new Error('Chưa có kỳ kế toán đang mở. Mở kỳ rồi lập phiếu chi phí.'), { status: 400 });
    }
    const assigned = datesInOpenPeriod(open, isoDate(req.body.NgayChungTu) || defaultDateInPeriod(open));
    const ngay = assigned.ngayChungTu;
    const MaKy = assigned.maKy;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const id = await generateJournalId(transaction, 'ChiPhiVanHanh', 'MaCP', `CP${yyMMFromMaKy(MaKy)}`, 4);
        await new sql.Request(transaction)
            .input('MaCP', sql.VarChar, id).input('MaKy', sql.VarChar, MaKy)
            .input('Loai', sql.VarChar, clean(req.body.MaLoaiCP, 20))
            .input('Ngay', sql.Date, ngay).input('SoCT', sql.VarChar, clean(req.body.SoChungTu, 50) || null)
            .input('MaNCC', sql.VarChar, clean(req.body.MaNCC, 20) || null)
            .input('MST', sql.VarChar, clean(req.body.MaSoThue, 20) || null)
            .input('Hang', sql.Decimal(18, 2), TienHang).input('Thue', sql.Decimal(5, 2), ThueSuat)
            .input('TienThue', sql.Decimal(18, 2), TienThue).input('Tong', sql.Decimal(18, 2), TongCong)
            .input('TK', sql.VarChar, MaTKTien).input('GD', sql.VarChar, clean(req.body.MaGiaoDich, 50) || null)
            .input('MaNV', sql.VarChar, req.user.MaNV).input('GC', sql.NVarChar, clean(req.body.GhiChu, 500) || null)
            .query(`INSERT INTO ChiPhiVanHanh
                (MaCP,MaKy,MaLoaiCP,NgayChungTu,SoChungTu,MaNCC,MaSoThue,TienHang,ThueSuat,TienThue,TongCong,MaTKTien,MaGiaoDich,MaNV_Lap,GhiChu)
                VALUES (@MaCP,@MaKy,@Loai,@Ngay,@SoCT,@MaNCC,@MST,@Hang,@Thue,@TienThue,@Tong,@TK,@GD,@MaNV,@GC)`);
        await writeLedgerAudit(transaction, req, 'Lập phiếu chi phí', 'ChiPhiVanHanh', id,
            `Nháp ${id} · ${expenseTypeLabel(clean(req.body.MaLoaiCP, 20))} · ${TongCong.toLocaleString('vi-VN')}đ · TK ${MaTKTien} · kỳ ${MaKy}`, { uc: 'UC36' });
        await transaction.commit();
        res.status(201).json({
            message: `Đã lưu chi phí ${id}.`,
            MaCP: id,
            MaKy,
            TenKy: periodLabelVi(MaKy),
            NgayChungTu: ngay
        });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const confirmExpense = handle(async (req, res, pool) => {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const row = await new sql.Request(transaction).input('Id', sql.VarChar, req.params.id)
            .query(`SELECT * FROM ChiPhiVanHanh WITH (UPDLOCK,HOLDLOCK) WHERE MaCP=@Id`);
        if (!row.recordset.length) throw new Error('Không tìm thấy chi phí.');
        const expense = row.recordset[0];
        if (expense.TrangThai === 'DaHuy') {
            throw Object.assign(new Error('Phiếu đã hủy, không ghi sổ được.'), { status: 400 });
        }
        const already = expense.TrangThai === 'DaXacNhan';
        if (!already) {
            await new sql.Request(transaction).input('Id', sql.VarChar, expense.MaCP)
                .query(`UPDATE ChiPhiVanHanh SET TrangThai=N'DaXacNhan', NgayXacNhan=GETDATE() WHERE MaCP=@Id`);
            expense.TrangThai = 'DaXacNhan';
        }
        const posted = await postExpenseConfirm(transaction, { expense, maNV: req.user.MaNV, user: req.user });
        if (posted.queued) {
            throw Object.assign(new Error(
                `Không ghi sổ ${expense.MaCP}: hệ thống xếp bút toán vào chờ thay vì kỳ đang mở. Mở kỳ kế toán rồi thử lại.`
            ), { status: 400 });
        }
        if (!posted.alreadyPosted && !posted.MaBT) {
            throw Object.assign(new Error(
                'Không ghi được bút toán CHI_PHI. Kiểm tra kỳ đang mở và tài khoản 642 / 1331 / 111-112 cho phép ghi sổ, rồi thử lại.'
            ), { status: 400 });
        }
        if (!already) {
            await writeLedgerAudit(transaction, req, 'Xác nhận chi phí vận hành', 'ChiPhiVanHanh', expense.MaCP,
                `Xác nhận và ghi sổ ${expense.MaCP} · kỳ ${expense.MaKy}`, { uc: 'UC36' });
        } else if (!posted.alreadyPosted) {
            await writeLedgerAudit(transaction, req, 'Ghi sổ lại chi phí vận hành', 'ChiPhiVanHanh', expense.MaCP,
                `Bổ sung bút toán ${posted.MaBT} cho ${expense.MaCP} · kỳ ${expense.MaKy}`, { uc: 'UC36' });
        }
        await transaction.commit();
        const fresh = await loadPresentedExpense(pool, expense.MaCP);
        return res.json({
            message: already && posted.alreadyPosted
                ? 'Chi phí đã xác nhận và đã có bút toán.'
                : `Đã ghi sổ ${expense.MaCP} vào ${fresh?.TenKy || periodLabelVi(expense.MaKy)}.`,
            already: already && posted.alreadyPosted,
            backfill: already && !posted.alreadyPosted,
            expense: fresh,
            MaKy: fresh?.MaKy || expense.MaKy,
            TenKy: fresh?.TenKy || periodLabelVi(expense.MaKy),
            NgayChungTu: fresh?.NgayChungTu || expense.NgayChungTu,
            ...posted
        });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const cancelExpense = handle(async (req, res, pool) => {
    const found = await pool.request().input('Id', sql.VarChar, req.params.id)
        .query(`SELECT TrangThai FROM ChiPhiVanHanh WHERE MaCP=@Id`);
    if (!found.recordset.length) throw Object.assign(new Error('Không tìm thấy phiếu chi phí.'), { status: 404 });
    if (found.recordset[0].TrangThai !== 'Nhap') {
        throw Object.assign(new Error('Chỉ hủy được phiếu đang ở trạng thái Nháp.'), { status: 400 });
    }
    await pool.request().input('Id', sql.VarChar, req.params.id)
        .query(`UPDATE ChiPhiVanHanh SET TrangThai=N'DaHuy' WHERE MaCP=@Id AND TrangThai=N'Nhap'`);
    await writeLedgerAudit(pool, req, 'Hủy phiếu chi phí nháp', 'ChiPhiVanHanh', req.params.id,
        `Hủy nháp ${req.params.id}`, { uc: 'UC36', severity: 'Cảnh báo' });
    res.json({ message: 'Đã hủy phiếu nháp.' });
});

const JOURNAL_LIST_WHERE = `
          bt.TrangThai=N'DaGhiSo'
          AND (@From IS NULL OR bt.NgayHachToan>=@From)
          AND (@To IS NULL OR bt.NgayHachToan<@To)
          AND (@MaKy IS NULL OR bt.MaKy=@MaKy)
          AND (@Loai IS NULL OR bt.LoaiButToan=@Loai)
          AND (@Q IS NULL OR bt.MaBT LIKE @Q OR bt.MaChungTu LIKE @Q)`;

const groupJournalLines = (headers, lineRows) => {
    const byBt = new Map();
    for (const line of lineRows || []) {
        const presented = presentJournalRow(line);
        const list = byBt.get(presented.MaBT) || [];
        list.push(presented);
        byBt.set(presented.MaBT, list);
    }
    return (headers || []).map(row => {
        const presented = presentJournalRow(row);
        return { ...presented, lines: byBt.get(presented.MaBT) || [] };
    });
};

const listJournals = handle(async (req, res, pool) => {
    const backfill = await runExpenseJournalBackfill(pool, req);
    const bindList = request => request
        .input('From', sql.Date, req.query.from || null)
        .input('To', sql.Date, req.query.to || null)
        .input('MaKy', sql.VarChar, clean(req.query.maKy, 7) || null)
        .input('Loai', sql.NVarChar, clean(req.query.loai, 30) || null)
        .input('Q', sql.NVarChar, clean(req.query.q, 50) || null);
    const headerResult = await bindList(pool.request()).query(`
        SELECT TOP 400 bt.*, nv.TenNV
        FROM ButToan bt
        LEFT JOIN NhanVien nv ON nv.MaNV=bt.MaNV_Lap
        WHERE ${JOURNAL_LIST_WHERE}
        ORDER BY bt.NgayHachToan DESC, bt.MaBT DESC`);
    const headers = headerResult.recordset || [];
    if (!headers.length) return res.json({ items: [], backfill });
    const lineResult = await bindList(pool.request()).query(`
        SELECT ct.MaBT, ct.SoDong, ct.MaTK, tk.TenTK, ct.SoTienNo, ct.SoTienCo, ct.DienGiaiDong
        FROM ChiTietButToan ct
        JOIN TaiKhoanKeToan tk ON tk.MaTK=ct.MaTK
        WHERE ct.MaBT IN (
            SELECT TOP 400 bt.MaBT
            FROM ButToan bt
            WHERE ${JOURNAL_LIST_WHERE}
            ORDER BY bt.NgayHachToan DESC, bt.MaBT DESC
        )
        ORDER BY ct.MaBT, ct.SoDong`);
    res.json({ items: groupJournalLines(headers, lineResult.recordset || []), backfill });
});

const getJournal = handle(async (req, res, pool) => {
    const header = await pool.request().input('Id', sql.VarChar, req.params.id)
        .query(`SELECT bt.*, nv.TenNV FROM ButToan bt LEFT JOIN NhanVien nv ON nv.MaNV=bt.MaNV_Lap WHERE bt.MaBT=@Id`);
    if (!header.recordset.length) return res.status(404).json({ message: 'Không tìm thấy bút toán.' });
    const lines = await pool.request().input('Id', sql.VarChar, req.params.id).query(`
        SELECT ct.*, tk.TenTK FROM ChiTietButToan ct JOIN TaiKhoanKeToan tk ON tk.MaTK=ct.MaTK
        WHERE ct.MaBT=@Id ORDER BY ct.SoDong`);
    res.json({ journal: presentJournalRow(header.recordset[0]), lines: lines.recordset.map(presentJournalRow) });
});

const createManualJournal = handle(async (req, res, pool) => {
    const preview = previewJournal({ lines: req.body.lines });
    const open = await findOpenPeriod(pool);
    const ngay = isoDate(req.body.ngay || req.body.ngayChungTu) || defaultDateInPeriod(open);
    const covering = await findCoveringPeriod(pool, ngay);
    if (!open || covering?.MaKy !== open.MaKy || covering?.TrangThai !== 'Mo') {
        throw outsideOpenError(open);
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const posted = await postJournal(transaction, {
            loaiButToan: 'THU_CONG',
            ngayChungTu: ngay,
            dienGiai: clean(req.body.dienGiai, 500) || 'Bút toán thủ công',
            lines: preview.lines,
            maNV: req.user.MaNV,
            user: req.user,
            nguon: 'ThuCong'
        });
        await writeLedgerAudit(transaction, req, 'Lập bút toán thủ công', 'ButToan', posted.MaBT,
            `Bút toán thủ công ${posted.MaBT} · chứng từ ${posted.MaChungTu || ''}`, { uc: 'UC37' });
        await transaction.commit();
        res.status(201).json({ message: `Đã ghi ${posted.MaBT}.`, ...posted });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const reverseManual = handle(async (req, res, pool) => {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const result = await reverseJournal(transaction, {
            MaBTGoc: req.params.id, MaNV: req.user.MaNV, lyDo: clean(req.body.LyDo, 200), user: req.user
        });
        await writeLedgerAudit(transaction, req, 'Đảo bút toán thủ công', 'ButToan', result.MaBT,
            `Đảo ${req.params.id} → ${result.MaBT}. Lý do: ${clean(req.body.LyDo, 200)}`, { uc: 'UC37', severity: 'Cảnh báo' });
        await transaction.commit();
        res.json({ message: `Đã đảo ${req.params.id} → ${result.MaBT}.`, ...result });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const previewExisting = handle(async (req, res, pool) => {
    if (req.query.lines) return res.json(previewJournal({ lines: JSON.parse(req.query.lines) }));
    res.json({ message: 'Gửi lines để xem định khoản.' });
});

const presentUnpostedRow = (row) => {
    const next = calendarizeRow({ ...row });
    const key = vietnamDateKey(next.NgayPhatSinh)
        || vietnamDateKey(next.NgayHoaDon)
        || vietnamDateKey(next.NgayLap)
        || vietnamDateKey(next.NgayChungTu)
        || vietnamDateKey(next.NgayTiepNhan)
        || dateKeyFromDocCode(next.MaChungTu);
    if (key) {
        next.NgayPhatSinh = key;
        next.NgayLap = next.NgayLap || key;
        next.NgayChungTu = next.NgayChungTu || key;
        next.NgayHoaDon = next.NgayHoaDon || key;
    }
    return next;
};

const listUnposted = handle(async (req, res, pool) => {
    await runExpenseJournalBackfill(pool, req);
    const rows = await pool.request().query(`
        SELECT cgs.MaCho, cgs.LoaiChungTu, cgs.MaChungTu, cgs.LyDo, cgs.DaXuLy,
               CASE WHEN cgs.LyDo=N'PN_CHUA_DOI_CHIEU' OR cgs.LyDo=N'THIEU_THUE' THEN 0 ELSE 1 END AS ChoGhi,
               CONVERT(varchar(10), CAST(COALESCE(
                   hd.NgayLap,
                   hdm.NgayHoaDon,
                   hdm.NgayTiepNhan,
                   COALESCE(pn.NgayXacNhan, pn.NgayNhap),
                   cp.NgayChungTu,
                   px.NgayXuat,
                   dt.NgayLap,
                   pc.NgayChungTu,
                   pt.NgayLap,
                   ts.NgayMua,
                   cgs.NgayPhatSinh
               ) AS datetime), 23) NgayPhatSinh
        FROM ChoGhiSo cgs
        LEFT JOIN HoaDon hd ON cgs.LoaiChungTu=N'HoaDon' AND hd.MaHD=cgs.MaChungTu
        LEFT JOIN HoaDonMuaHang hdm ON cgs.LoaiChungTu=N'HoaDonMuaHang' AND hdm.MaHDMH=cgs.MaChungTu
        LEFT JOIN PhieuNhap pn ON cgs.LoaiChungTu=N'PhieuNhap' AND pn.MaPN=cgs.MaChungTu
        LEFT JOIN ChiPhiVanHanh cp ON cgs.LoaiChungTu=N'ChiPhiVanHanh' AND cp.MaCP=cgs.MaChungTu
        LEFT JOIN PhieuXuat px ON cgs.LoaiChungTu=N'PhieuXuat' AND px.MaPX=cgs.MaChungTu
        LEFT JOIN PhieuDoiTra dt ON cgs.LoaiChungTu=N'PhieuDoiTra' AND dt.MaDT=cgs.MaChungTu
        LEFT JOIN PhieuChi pc ON cgs.LoaiChungTu=N'PhieuChi' AND pc.MaPhieu=cgs.MaChungTu
        LEFT JOIN PhieuThu pt ON cgs.LoaiChungTu=N'PhieuThu' AND pt.MaPT=cgs.MaChungTu
        LEFT JOIN TaiSanCoDinh ts ON cgs.LoaiChungTu=N'TaiSanCoDinh' AND ts.MaTSCD=cgs.MaChungTu
        WHERE cgs.DaXuLy=0
        ORDER BY NgayPhatSinh DESC, cgs.MaCho DESC`);
    const missing = await pool.request().query(`
        SELECT hd.MaHD MaChungTu, N'HoaDon' LoaiChungTu, N'THIEU_BAN_HANG' LyDo,
               CONVERT(varchar(10), hd.NgayLap, 23) NgayPhatSinh
        FROM HoaDon hd
        WHERE hd.TrangThai=N'Hoàn thành'
          AND NOT EXISTS (
            SELECT 1 FROM ButToan bt WHERE bt.LoaiChungTu=N'HoaDon' AND bt.MaChungTu=hd.MaHD
              AND bt.LoaiButToan=N'BAN_HANG' AND bt.DaBiDao=0 AND bt.MaBTGoc IS NULL AND bt.TrangThai=N'DaGhiSo')
        UNION ALL
        SELECT hd.MaHDMH, N'HoaDonMuaHang', N'THIEU_MUA_HANG',
               CONVERT(varchar(10), CAST(COALESCE(hd.NgayHoaDon, hd.NgayTiepNhan) AS datetime), 23)
        FROM HoaDonMuaHang hd
        WHERE hd.TrangThaiDoiChieu=N'Đã khớp'
          AND NOT EXISTS (
            SELECT 1 FROM ButToan bt WHERE bt.LoaiChungTu=N'HoaDonMuaHang' AND bt.MaChungTu=hd.MaHDMH
              AND bt.LoaiButToan=N'MUA_HANG' AND bt.DaBiDao=0 AND bt.MaBTGoc IS NULL)
        UNION ALL
        SELECT cp.MaCP, N'ChiPhiVanHanh', N'THIEU_CHI_PHI', CONVERT(varchar(10), cp.NgayChungTu, 23)
        FROM ChiPhiVanHanh cp
        WHERE cp.TrangThai=N'DaXacNhan'
          AND NOT EXISTS (
            SELECT 1 FROM ButToan bt WHERE bt.LoaiChungTu=N'ChiPhiVanHanh' AND bt.MaChungTu=cp.MaCP
              AND bt.LoaiButToan=N'CHI_PHI' AND bt.DaBiDao=0 AND bt.MaBTGoc IS NULL AND bt.TrangThai=N'DaGhiSo')`);
    res.json({
        queue: rows.recordset.map(presentUnpostedRow),
        missing: missing.recordset.map(presentUnpostedRow)
    });
});

const postUnposted = handle(async (req, res, pool) => {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const row = await new sql.Request(transaction).input('Id', sql.BigInt, req.params.id)
            .query('SELECT * FROM ChoGhiSo WITH (UPDLOCK,HOLDLOCK) WHERE MaCho=@Id');
        if (!row.recordset.length) throw new Error('Không tìm thấy hàng chờ ghi sổ.');
        const item = row.recordset[0];
        if (item.LyDo === 'THIEU_THUE' || item.LyDo === 'PN_CHUA_DOI_CHIEU') {
            throw new Error('Hàng này chỉ cảnh báo, không bấm Ghi sổ được.');
        }
        const posted = await rebuildFromDocument(transaction, {
            loaiChungTu: item.LoaiChungTu, maChungTu: item.MaChungTu,
            maNV: req.user.MaNV, user: req.user, late: true
        });
        if (!posted.queued) {
            await new sql.Request(transaction).input('Id', sql.BigInt, item.MaCho)
                .query('UPDATE ChoGhiSo SET DaXuLy=1 WHERE MaCho=@Id');
        }
        await writeLedgerAudit(transaction, req, 'Ghi sổ trễ', 'ChoGhiSo', String(item.MaCho),
            posted.queued
                ? `Vẫn chờ ${docTypeLabel(item.LoaiChungTu)} ${item.MaChungTu}`
                : `Ghi sổ trễ ${docTypeLabel(item.LoaiChungTu)} ${item.MaChungTu}`, { uc: 'UC37' });
        await transaction.commit();
        res.json({ message: posted.queued ? 'Vẫn chờ — chưa có kỳ mở.' : 'Đã ghi sổ trễ.', ...posted });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const periodBounds = (req) => {
    const resolved = resolveReportingPeriod(req.query);
    return resolved;
};

const journalReport = handle(async (req, res, pool) => {
    const period = periodBounds(req);
    const rows = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive)
        .input('MaTK', sql.VarChar, clean(req.query.maTK, 8) || null)
        .input('Loai', sql.NVarChar, clean(req.query.loai, 30) || null)
        .query(`
        SELECT v.* FROM vw_SoCaiDong v
        WHERE v.NgayHachToan>=@From AND v.NgayHachToan<@To
          AND v.LoaiButToan<>N'SODU_DAU_KY'
          AND (@MaTK IS NULL OR v.MaTK=@MaTK)
          AND (@Loai IS NULL OR v.LoaiButToan=@Loai)
        ORDER BY v.NgayHachToan, v.MaBT, v.SoDong`);
    const tongNo = roundMoney(rows.recordset.reduce((s, r) => s + n(r.SoTienNo), 0));
    const tongCo = roundMoney(rows.recordset.reduce((s, r) => s + n(r.SoTienCo), 0));
    res.json({ period, items: rows.recordset.map(presentJournalRow), tongNo, tongCo, balanced: tongNo === tongCo, nguon: `Sổ cái kỳ ${period.label}` });
});

const generalLedger = handle(async (req, res, pool) => {
    const period = periodBounds(req);
    const maTK = clean(req.query.maTK, 8);
    if (!maTK) throw new Error('Chọn mã tài khoản.');
    const account = await pool.request().input('MaTK', sql.VarChar, maTK)
        .query('SELECT * FROM TaiKhoanKeToan WHERE MaTK=@MaTK');
    if (!account.recordset.length) throw new Error('Không có tài khoản.');
    const tk = account.recordset[0];
    const opening = await pool.request().input('MaTK', sql.VarChar, maTK).input('From', sql.Date, period.from)
        .query(`
            SELECT COALESCE(SUM(SoDuNo),0) SoDuNo, COALESCE(SUM(SoDuCo),0) SoDuCo
            FROM SoDuDauKy sd JOIN KyKeToan k ON k.MaKy=sd.MaKy
            WHERE sd.MaTK=@MaTK AND k.TuNgay=@From`);
    const dauNo = n(opening.recordset[0]?.SoDuNo);
    const dauCo = n(opening.recordset[0]?.SoDuCo);
    const soDuDau = tk.TinhChat === 'Co' ? roundMoney(dauCo - dauNo) : roundMoney(dauNo - dauCo);
    const rows = await pool.request().input('MaTK', sql.VarChar, maTK)
        .input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT v.* FROM vw_SoCaiDong v
        WHERE v.MaTK=@MaTK AND v.NgayHachToan>=@From AND v.NgayHachToan<@To
          AND v.LoaiButToan<>N'SODU_DAU_KY'
        ORDER BY v.NgayHachToan, v.MaBT, v.SoDong`);
    let run = soDuDau;
    const items = rows.recordset.map(row => {
        run = tk.TinhChat === 'Co'
            ? roundMoney(run + n(row.SoTienCo) - n(row.SoTienNo))
            : roundMoney(run + n(row.SoTienNo) - n(row.SoTienCo));
        return { ...row, DuChay: run, DuNo: run > 0 && tk.TinhChat !== 'Co' ? run : (run < 0 && tk.TinhChat === 'Co' ? Math.abs(run) : (tk.TinhChat !== 'Co' && run > 0 ? run : 0)), DuCo: tk.TinhChat === 'Co' && run > 0 ? run : 0 };
    });
    const psNo = roundMoney(rows.recordset.reduce((s, r) => s + n(r.SoTienNo), 0));
    const psCo = roundMoney(rows.recordset.reduce((s, r) => s + n(r.SoTienCo), 0));
    res.json({
        period,
        account: presentAccount(tk),
        soDuDau,
        items: items.map(presentJournalRow),
        psNo,
        psCo,
        soDuCuoi: run,
        nguon: `Sổ cái ${maTK} ${period.label}`
    });
});

const trialBalance = handle(async (req, res, pool) => {
    const period = periodBounds(req);
    const rows = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT tk.MaTK, tk.TenTK, tk.TinhChat, tk.LoaiBC,
               COALESCE(sd.SoDuNo,0) DuDauNo, COALESCE(sd.SoDuCo,0) DuDauCo,
               COALESCE(ps.PsNo,0) PsNo, COALESCE(ps.PsCo,0) PsCo
        FROM TaiKhoanKeToan tk
        LEFT JOIN (
            SELECT sd.MaTK, SUM(sd.SoDuNo) SoDuNo, SUM(sd.SoDuCo) SoDuCo
            FROM SoDuDauKy sd JOIN KyKeToan k ON k.MaKy=sd.MaKy
            WHERE k.TuNgay=@From GROUP BY sd.MaTK
        ) sd ON sd.MaTK=tk.MaTK
        LEFT JOIN (
            SELECT v.MaTK, SUM(v.SoTienNo) PsNo, SUM(v.SoTienCo) PsCo
            FROM vw_SoCaiDong v
            WHERE v.NgayHachToan>=@From AND v.NgayHachToan<@To AND v.LoaiButToan NOT IN (N'SODU_DAU_KY')
            GROUP BY v.MaTK
        ) ps ON ps.MaTK=tk.MaTK
        WHERE tk.TrangThai=N'Su dung'
        ORDER BY tk.MaTK`);
    const items = rows.recordset.map(row => {
        const net = n(row.DuDauNo) - n(row.DuDauCo) + n(row.PsNo) - n(row.PsCo);
        return presentAccount({
            ...row,
            DuCuoiNo: net > 0 ? roundMoney(net) : 0,
            DuCuoiCo: net < 0 ? roundMoney(-net) : 0
        });
    });
    const sum = key => roundMoney(items.reduce((s, r) => s + n(r[key]), 0));
    const check = {
        dau: sum('DuDauNo') === sum('DuDauCo'),
        ps: sum('PsNo') === sum('PsCo'),
        cuoi: sum('DuCuoiNo') === sum('DuCuoiCo')
    };
    res.json({ period, items, tong: { dauNo: sum('DuDauNo'), dauCo: sum('DuDauCo'), psNo: sum('PsNo'), psCo: sum('PsCo'), cuoiNo: sum('DuCuoiNo'), cuoiCo: sum('DuCuoiCo') }, check, dat: check.dau && check.ps && check.cuoi });
});

const loadPlNets = async (pool, period) => {
    const rows = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT v.MaTK, SUM(v.SoTienNo) PsNo, SUM(v.SoTienCo) PsCo
        FROM vw_SoCaiDong v
        WHERE v.NgayHachToan>=@From AND v.NgayHachToan<@To
          AND v.LoaiButToan NOT IN (N'KET_CHUYEN', N'DAO_KET_CHUYEN', N'SODU_DAU_KY')
        GROUP BY v.MaTK`);
    const map = new Map(rows.recordset.map(row => [row.MaTK, row]));
    const netOf = (maTK) => {
        const row = map.get(maTK) || { PsNo: 0, PsCo: 0 };
        const nature = KQKD_NATURE[maTK] || 'No';
        return nature === 'Co' ? roundMoney(n(row.PsCo) - n(row.PsNo)) : roundMoney(n(row.PsNo) - n(row.PsCo));
    };
    const dt = netOf('511');
    const tra = netOf('5212');
    const gv = netOf('632');
    const cp = netOf('642');
    const khac = netOf('711');
    const dtThuan = roundMoney(dt - tra);
    const laiGop = roundMoney(dtThuan - gv);
    const ln = roundMoney(laiGop - cp + khac);
    return { dt, tra, dtThuan, gv, laiGop, cp, khac, ln };
};

const hasClosing = async (pool, maKy) => {
    const row = await pool.request().input('MaKy', sql.VarChar, maKy).query(`
        SELECT 1 FROM ButToan
        WHERE LoaiChungTu=N'KyKeToan' AND LoaiButToan=N'KET_CHUYEN' AND MaChungTu=@MaKy
          AND DaBiDao=0 AND TrangThai=N'DaGhiSo'`);
    return Boolean(row.recordset.length);
};

const incomeStatement = handle(async (req, res, pool) => {
    const period = periodBounds(req);
    const pl = await loadPlNets(pool, period);
    res.json({
        period,
        watermark: true,
        lines: [
            { id: 1, label: 'Doanh thu bán hàng', amount: pl.dt },
            { id: 2, label: 'Trừ: Chiết khấu / giảm giá', amount: pl.tra },
            { id: 3, label: 'Doanh thu thuần', amount: pl.dtThuan },
            { id: 4, label: 'Giá vốn hàng bán', amount: pl.gv },
            { id: 5, label: 'Lợi nhuận gộp kế toán', amount: pl.laiGop },
            { id: 6, label: 'Chi phí quản lý (642)', amount: pl.cp },
            { id: 7, label: 'Thu nhập khác', amount: pl.khac },
            { id: 8, label: 'Lợi nhuận kế toán trước thuế (mini)', amount: pl.ln }
        ],
        loiNhuanKeToan: pl.ln,
        chuThich: 'CHƯA xử lý thuế TNDN. Không trừ tiền trả NCC.',
        nguon: `Sổ cái kỳ ${period.label}`
    });
});

const closingBalances = async (pool, period) => {
    const tb = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT tk.MaTK, tk.TinhChat,
               COALESCE(sd.SoDuNo,0) DuDauNo, COALESCE(sd.SoDuCo,0) DuDauCo,
               COALESCE(ps.PsNo,0) PsNo, COALESCE(ps.PsCo,0) PsCo
        FROM TaiKhoanKeToan tk
        LEFT JOIN (
            SELECT sd.MaTK, SUM(sd.SoDuNo) SoDuNo, SUM(sd.SoDuCo) SoDuCo
            FROM SoDuDauKy sd JOIN KyKeToan k ON k.MaKy=sd.MaKy
            WHERE k.TuNgay=@From GROUP BY sd.MaTK
        ) sd ON sd.MaTK=tk.MaTK
        LEFT JOIN (
            SELECT v.MaTK, SUM(v.SoTienNo) PsNo, SUM(v.SoTienCo) PsCo
            FROM vw_SoCaiDong v
            WHERE v.NgayHachToan>=@From AND v.NgayHachToan<@To
            GROUP BY v.MaTK
        ) ps ON ps.MaTK=tk.MaTK`);
    const map = {};
    for (const row of tb.recordset) {
        const net = n(row.DuDauNo) - n(row.DuDauCo) + n(row.PsNo) - n(row.PsCo);
        map[row.MaTK] = row.TinhChat === 'Co' ? roundMoney(-net) : roundMoney(net);
        if (row.TinhChat === 'Co') map[row.MaTK] = roundMoney(n(row.DuDauCo) - n(row.DuDauNo) + n(row.PsCo) - n(row.PsNo));
    }
    return map;
};

const balanceSheet = handle(async (req, res, pool) => {
    const period = periodBounds(req);
    const bal = await closingBalances(pool, period);
    const pl = await loadPlNets(pool, period);
    const maKy = period.periodType === 'month' ? period.period : String(period.from).slice(0, 7);
    const closed = await hasClosing(pool, maKy);
    const ky = await pool.request().input('MaKy', sql.VarChar, maKy).query('SELECT TrangThai FROM KyKeToan WHERE MaKy=@MaKy');
    const khoa = ky.recordset[0]?.TrangThai === 'Khoa';
    const j = closed ? n(bal['421']) : roundMoney(n(bal['421']) + pl.ln);
    const ts = {
        A: roundMoney(n(bal['111']) + n(bal['112'])),
        B: n(bal['138']),
        C: n(bal['156']),
        D: n(bal['1331']),
        E: roundMoney(n(bal['211']) - n(bal['214']))
    };
    const tongTS = roundMoney(ts.A + ts.B + ts.C + ts.D + ts.E);
    const nv = {
        F: n(bal['331']),
        G: n(bal['33311']),
        H: n(bal['334']),
        I: n(bal['411']),
        J: j
    };
    const tongNV = roundMoney(nv.F + nv.G + nv.H + nv.I + nv.J);
    res.json({
        period, closed, watermark: !khoa,
        taiSan: ts, tongTS, nguonVon: nv, tongNV,
        can: tongTS === tongNV,
        chuThich: 'Số dư kết quả lũy kế mô hình mini, CHƯA xử lý thuế TNDN.',
        nguon: `Sổ cái kỳ ${period.label}`
    });
});

const cashFlow = handle(async (req, res, pool) => {
    const period = periodBounds(req);
    const rows = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT v.LoaiButToan, v.MaTK, SUM(v.SoTienNo) PsNo, SUM(v.SoTienCo) PsCo
        FROM vw_SoCaiDong v
        WHERE v.NgayHachToan>=@From AND v.NgayHachToan<@To
          AND v.MaTK IN ('111','112')
          AND v.LoaiButToan NOT IN (N'SODU_DAU_KY', N'KET_CHUYEN', N'DAO_KET_CHUYEN')
        GROUP BY v.LoaiButToan, v.MaTK`);
    const group = (types, sign = 1) => roundMoney(rows.recordset
        .filter(row => types.includes(row.LoaiButToan) || types.includes(String(row.LoaiButToan).replace(/^DAO_/, '')))
        .reduce((sum, row) => {
            const dao = String(row.LoaiButToan).startsWith('DAO_');
            const inward = n(row.PsNo) - n(row.PsCo);
            return sum + inward * (dao ? 1 : sign);
        }, 0));
    const thuBan = group(['BAN_HANG']);
    const hoan = group(['DOI_TRA_HOAN']);
    const traNcc = group(['TRA_NCC']);
    const luong = group(['CHI_LUONG']);
    const cp = group(['CHI_PHI']);
    const lech = group(['LECH_QUY']);
    const thuCong = group(['THU_CONG']);
    const tscd = group(['MUA_TSCD']);
    const i = roundMoney(thuBan + hoan + traNcc + luong + cp + lech + thuCong);
    const ii = tscd;
    const iii = 0;
    const tong = roundMoney(i + ii + iii);
    const raw = roundMoney(rows.recordset.reduce((s, r) => s + n(r.PsNo) - n(r.PsCo), 0));
    res.json({
        period,
        I: { banHang: thuBan, hoan, traNcc, luong, chiPhi: cp, lechQuy: lech, thuChiKhac: thuCong, tong: i },
        II: { muaTscd: tscd, tong: ii },
        III: { tong: iii },
        tong, doiChieuPs: raw, khop: tong === raw,
        nguon: `Phát sinh 111+112 kỳ ${period.label}`
    });
});

const vatOutput = handle(async (req, res, pool) => {
    const period = periodBounds(req);
    const rows = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT hd.MaHD, hd.NgayLap, ct.MaSP, ct.ThanhTienSauGiam, ct.ThueSuat, ct.TienThue, hd.TongThanhToan
        FROM ChiTietHoaDon ct JOIN HoaDon hd ON hd.MaHD=ct.MaHD
        WHERE hd.TrangThai=N'Hoàn thành' AND hd.NgayLap>=@From AND hd.NgayLap<@To`);
    const items = rows.recordset.map(row => calendarizeRow({
        ...row,
        thieuThue: row.ThueSuat == null,
        vat: n(row.TienThue)
    }));
    res.json({ period, items, tongVat: roundMoney(items.reduce((s, r) => s + r.vat, 0)) });
});

const vatInput = handle(async (req, res, pool) => {
    const period = periodBounds(req);
    const mua = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT hd.MaHDMH Ma, hd.NgayHoaDon Ngay, hd.SoHoaDon, hd.TongTienHang TienHang, hd.TienThue VAT, hd.TongCong,
               N'HoaDonMuaHang' Nguon
        FROM HoaDonMuaHang hd
        WHERE hd.TrangThaiDoiChieu=N'Đã khớp' AND hd.NgayHoaDon>=@From AND hd.NgayHoaDon<@To`);
    const cp = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT MaCP Ma, NgayChungTu Ngay, SoChungTu SoHoaDon, TienHang, TienThue VAT, TongCong, N'ChiPhi' Nguon
        FROM ChiPhiVanHanh WHERE TrangThai=N'DaXacNhan' AND NgayChungTu>=@From AND NgayChungTu<@To AND TienThue>0`);
    const fa = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT MaTSCD Ma, NgayMua Ngay, SoHoaDon, NguyenGia TienHang, TienThue VAT, NguyenGia+TienThue TongCong, N'TSCD' Nguon
        FROM TaiSanCoDinh WHERE NgayMua>=@From AND NgayMua<@To`);
    const tra = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT bt.MaChungTu Ma, bt.NgayChungTu Ngay, bt.MaChungTu SoHoaDon,
               -SUM(CASE WHEN ct.MaTK='156' THEN ct.SoTienCo ELSE 0 END) TienHang,
               -SUM(CASE WHEN ct.MaTK='1331' THEN ct.SoTienCo ELSE 0 END) VAT,
               -SUM(CASE WHEN ct.MaTK='331' THEN ct.SoTienNo ELSE 0 END) TongCong,
               N'TRA_NCC_HANG' Nguon
        FROM ButToan bt JOIN ChiTietButToan ct ON ct.MaBT=bt.MaBT
        WHERE bt.LoaiButToan=N'TRA_NCC_HANG' AND bt.DaBiDao=0 AND bt.TrangThai=N'DaGhiSo'
          AND bt.NgayHachToan>=@From AND bt.NgayHachToan<@To
        GROUP BY bt.MaChungTu, bt.NgayChungTu`);
    const items = [...mua.recordset, ...cp.recordset, ...fa.recordset, ...tra.recordset].map(calendarizeRow);
    res.json({ period, items, tongVat: roundMoney(items.reduce((s, r) => s + n(r.VAT), 0)) });
});

const vatSummary = handle(async (req, res, pool) => {
    const period = periodBounds(req);
    const raRow = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT COALESCE(SUM(ct.TienThue),0) Vat
        FROM ChiTietHoaDon ct JOIN HoaDon hd ON hd.MaHD=ct.MaHD
        WHERE hd.TrangThai=N'Hoàn thành' AND hd.NgayLap>=@From AND hd.NgayLap<@To`);
    const vaoMua = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT COALESCE(SUM(TienThue),0) Vat FROM HoaDonMuaHang
        WHERE TrangThaiDoiChieu=N'Đã khớp' AND NgayHoaDon>=@From AND NgayHoaDon<@To`);
    const vaoCp = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT COALESCE(SUM(TienThue),0) Vat FROM ChiPhiVanHanh
        WHERE TrangThai=N'DaXacNhan' AND NgayChungTu>=@From AND NgayChungTu<@To`);
    const vaoTs = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT COALESCE(SUM(TienThue),0) Vat FROM TaiSanCoDinh
        WHERE NgayMua>=@From AND NgayMua<@To`);
    const tra = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT COALESCE(SUM(ct.SoTienCo),0) Vat
        FROM ButToan bt JOIN ChiTietButToan ct ON ct.MaBT=bt.MaBT
        WHERE bt.LoaiButToan=N'TRA_NCC_HANG' AND bt.DaBiDao=0 AND bt.TrangThai=N'DaGhiSo'
          AND ct.MaTK='1331' AND bt.NgayHachToan>=@From AND bt.NgayHachToan<@To`);
    const ra = n(raRow.recordset[0]?.Vat);
    const vao = roundMoney(n(vaoMua.recordset[0]?.Vat) + n(vaoCp.recordset[0]?.Vat) + n(vaoTs.recordset[0]?.Vat) - n(tra.recordset[0]?.Vat));
    res.json({ period, vatRa: ra, vatVao: vao, chenh: roundMoney(ra - vao), nhan: 'Không phải số phải nộp tờ khai.' });
});

const cashMovement = handle(async (req, res, pool) => {
    const period = periodBounds(req);
    const rows = await pool.request().input('From', sql.Date, period.from).input('To', sql.Date, period.toExclusive).query(`
        SELECT bt.MaBT, bt.NgayHachToan, bt.LoaiChungTu, bt.MaChungTu, bt.LoaiButToan, bt.DienGiai,
               SUM(CASE WHEN ct.MaTK IN ('111','112') THEN ct.SoTienNo ELSE 0 END) Thu,
               SUM(CASE WHEN ct.MaTK IN ('111','112') THEN ct.SoTienCo ELSE 0 END) Chi
        FROM ButToan bt JOIN ChiTietButToan ct ON ct.MaBT=bt.MaBT
        WHERE bt.TrangThai=N'DaGhiSo' AND bt.NgayHachToan>=@From AND bt.NgayHachToan<@To
          AND bt.LoaiButToan NOT IN (N'SODU_DAU_KY', N'KET_CHUYEN', N'DAO_KET_CHUYEN')
          AND ct.MaTK IN ('111','112')
        GROUP BY bt.MaBT, bt.NgayHachToan, bt.LoaiChungTu, bt.MaChungTu, bt.LoaiButToan, bt.DienGiai
        ORDER BY bt.NgayHachToan, bt.MaBT`);
    const tongThu = roundMoney(rows.recordset.reduce((s, r) => s + n(r.Thu), 0));
    const tongChi = roundMoney(rows.recordset.reduce((s, r) => s + n(r.Chi), 0));
    res.json({
        period,
        items: rows.recordset.map(presentJournalRow),
        tongThu,
        tongChi,
        rong: roundMoney(tongThu - tongChi),
        nguon: `Chứng từ 111/112 kỳ ${period.label}`
    });
});

const missingJournals = async (pool, maKy) => {
    const ky = await pool.request().input('MaKy', sql.VarChar, maKy).query('SELECT * FROM KyKeToan WHERE MaKy=@MaKy');
    const period = ky.recordset[0];
    if (!period) throw new Error('Không có kỳ.');
    const from = isoDate(period.TuNgay);
    const toExclusive = isoDate(new Date(new Date(period.DenNgay).getTime() + 86400000));
    const block = [];
    const warn = [];
    const hd = await pool.request().input('From', sql.Date, from).input('To', sql.Date, period.DenNgay).query(`
        SELECT hd.MaHD FROM HoaDon hd
        WHERE hd.TrangThai=N'Hoàn thành' AND CONVERT(date,hd.NgayLap) BETWEEN @From AND @To
          AND NOT EXISTS (SELECT 1 FROM ButToan bt WHERE bt.LoaiChungTu=N'HoaDon' AND bt.MaChungTu=hd.MaHD
            AND bt.LoaiButToan=N'BAN_HANG' AND bt.DaBiDao=0 AND bt.MaBTGoc IS NULL)`);
    hd.recordset.forEach(row => block.push(`Hóa đơn bán ${row.MaHD} đã hoàn thành nhưng thiếu bút toán Bán hàng / Giá vốn`));
    const mua = await pool.request().input('From', sql.Date, from).input('To', sql.Date, period.DenNgay).query(`
        SELECT MaHDMH FROM HoaDonMuaHang
        WHERE TrangThaiDoiChieu=N'Đã khớp' AND NgayHoaDon BETWEEN @From AND @To
          AND NOT EXISTS (SELECT 1 FROM ButToan bt WHERE bt.LoaiChungTu=N'HoaDonMuaHang' AND bt.MaChungTu=MaHDMH
            AND bt.LoaiButToan=N'MUA_HANG' AND bt.DaBiDao=0)`);
    mua.recordset.forEach(row => block.push(`Hóa đơn mua ${row.MaHDMH} đã khớp nhưng thiếu bút toán Mua hàng`));
    const pc = await pool.request().input('From', sql.Date, from).input('To', sql.Date, period.DenNgay).query(`
        SELECT MaPhieu FROM PhieuChi
        WHERE TrangThai=N'Thanh toán thành công' AND CONVERT(date, COALESCE(NgayDuyet, NgayChungTu)) BETWEEN @From AND @To
          AND NOT EXISTS (SELECT 1 FROM ButToan bt WHERE bt.LoaiChungTu=N'PhieuChi' AND bt.MaChungTu=MaPhieu
            AND bt.LoaiButToan=N'TRA_NCC' AND bt.DaBiDao=0)`);
    pc.recordset.forEach(row => block.push(`Phiếu chi ${row.MaPhieu} thanh toán thành công nhưng thiếu bút toán Trả nhà cung cấp`));
    const pn = await pool.request().query(`
        SELECT MaPN FROM PhieuNhap WHERE TrangThai=N'Đã xác nhận'
          AND NOT EXISTS (SELECT 1 FROM HoaDonMuaHang hd WHERE hd.MaPN=PhieuNhap.MaPN AND hd.TrangThaiDoiChieu=N'Đã khớp')`);
    pn.recordset.forEach(row => warn.push(`Phiếu nhập ${row.MaPN} chưa đối chiếu 3 bên`));
    const draft = await pool.request().input('From', sql.Date, from).input('To', sql.Date, period.DenNgay).query(`
        SELECT MaHD FROM HoaDon WHERE TrangThai=N'Nháp' AND CONVERT(date,NgayLap) BETWEEN @From AND @To`);
    draft.recordset.forEach(row => warn.push(`Hóa đơn bán ${row.MaHD} đang ở trạng thái Nháp`));
    return { period, block, warn };
};

const closeCheck = handle(async (req, res, pool) => {
    res.json(await missingJournals(pool, clean(req.params.maKy, 7)));
});

const copyOpeningForward = async (transaction, maKy, overwrite = false) => {
    const current = await new sql.Request(transaction).input('MaKy', sql.VarChar, maKy).query('SELECT * FROM KyKeToan WHERE MaKy=@MaKy');
    const ky = current.recordset[0];
    if (!ky) return null;
    const [y, m] = ky.MaKy.split('-').map(Number);
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    const nextKey = periodKey(nextYear, nextMonth);
    const exists = await new sql.Request(transaction).input('MaKy', sql.VarChar, nextKey).query('SELECT MaKy FROM KyKeToan WHERE MaKy=@MaKy');
    if (!exists.recordset.length) {
        const tu = `${nextKey}-01`;
        const den = `${nextKey}-${String(lastDay(nextYear, nextMonth)).padStart(2, '0')}`;
        await new sql.Request(transaction).input('MaKy', sql.VarChar, nextKey)
            .input('Nam', sql.SmallInt, nextYear).input('Thang', sql.TinyInt, nextMonth)
            .input('Tu', sql.Date, tu).input('Den', sql.Date, den)
            .query(`INSERT INTO KyKeToan (MaKy,Nam,Thang,TuNgay,DenNgay) VALUES (@MaKy,@Nam,@Thang,@Tu,@Den)`);
    }
    const balances = await new sql.Request(transaction)
        .input('FromKy', sql.VarChar, maKy)
        .query(`
        SELECT tk.MaTK,
               COALESCE(sd.SoDuNo,0) DuDauNo, COALESCE(sd.SoDuCo,0) DuDauCo,
               COALESCE(ps.PsNo,0) PsNo, COALESCE(ps.PsCo,0) PsCo
        FROM TaiKhoanKeToan tk
        LEFT JOIN SoDuDauKy sd ON sd.MaTK=tk.MaTK AND sd.MaKy=@FromKy
        LEFT JOIN (
            SELECT ct.MaTK, SUM(ct.SoTienNo) PsNo, SUM(ct.SoTienCo) PsCo
            FROM ChiTietButToan ct JOIN ButToan bt ON bt.MaBT=ct.MaBT
            WHERE bt.MaKy=@FromKy AND bt.TrangThai=N'DaGhiSo'
            GROUP BY ct.MaTK
        ) ps ON ps.MaTK=tk.MaTK
        WHERE tk.TrangThai=N'Su dung'`);
    for (const row of balances.recordset) {
        const net = n(row.DuDauNo) - n(row.DuDauCo) + n(row.PsNo) - n(row.PsCo);
        const soDuNo = net > 0 ? roundMoney(net) : 0;
        const soDuCo = net < 0 ? roundMoney(-net) : 0;
        await new sql.Request(transaction)
            .input('MaKy', sql.VarChar, nextKey).input('MaTK', sql.VarChar, row.MaTK)
            .input('No', sql.Decimal(18, 2), soDuNo).input('Co', sql.Decimal(18, 2), soDuCo)
            .input('Overwrite', sql.Bit, overwrite ? 1 : 0)
            .query(`
                MERGE SoDuDauKy AS t
                USING (SELECT @MaKy MaKy, @MaTK MaTK) s ON t.MaKy=s.MaKy AND t.MaTK=s.MaTK
                WHEN MATCHED AND (@Overwrite=1 OR t.DaChot=0) THEN
                    UPDATE SET SoDuNo=@No, SoDuCo=@Co, DaChot=1
                WHEN NOT MATCHED THEN
                    INSERT (MaKy,MaTK,SoDuNo,SoDuCo,DaChot) VALUES (@MaKy,@MaTK,@No,@Co,1);`);
    }
    return nextKey;
};

const postClosing = handle(async (req, res, pool) => {
    const MaKy = clean(req.params.maKy, 7);
    const period = resolveReportingPeriod({ periodType: 'month', period: MaKy });
    const pl = await loadPlNets(pool, period);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const existing = await findEffectiveJournal(transaction, { loaiChungTu: 'KyKeToan', maChungTu: MaKy, loaiButToan: 'KET_CHUYEN' });
        if (existing) {
            await transaction.commit();
            return res.json({ message: 'Đã kết chuyển.', alreadyPosted: true, MaBT: existing.MaBT });
        }
        const lines = [];
        if (pl.dt) { lines.push({ maTK: '511', soTienNo: pl.dt, soTienCo: 0 }); lines.push({ maTK: '911', soTienNo: 0, soTienCo: pl.dt }); }
        if (pl.khac) { lines.push({ maTK: '711', soTienNo: pl.khac, soTienCo: 0 }); lines.push({ maTK: '911', soTienNo: 0, soTienCo: pl.khac }); }
        if (pl.tra) { lines.push({ maTK: '911', soTienNo: pl.tra, soTienCo: 0 }); lines.push({ maTK: '5212', soTienNo: 0, soTienCo: pl.tra }); }
        if (pl.gv) { lines.push({ maTK: '911', soTienNo: pl.gv, soTienCo: 0 }); lines.push({ maTK: '632', soTienNo: 0, soTienCo: pl.gv }); }
        if (pl.cp) { lines.push({ maTK: '911', soTienNo: pl.cp, soTienCo: 0 }); lines.push({ maTK: '642', soTienNo: 0, soTienCo: pl.cp }); }
        if (pl.ln > 0) { lines.push({ maTK: '911', soTienNo: pl.ln, soTienCo: 0 }); lines.push({ maTK: '421', soTienNo: 0, soTienCo: pl.ln }); }
        if (pl.ln < 0) { lines.push({ maTK: '421', soTienNo: Math.abs(pl.ln), soTienCo: 0 }); lines.push({ maTK: '911', soTienNo: 0, soTienCo: Math.abs(pl.ln) }); }
        const posted = await postJournal(transaction, {
            loaiChungTu: 'KyKeToan', maChungTu: MaKy, loaiButToan: 'KET_CHUYEN',
            ngayChungTu: period.to, dienGiai: `Kết chuyển ${MaKy}`,
            lines, maNV: req.user.MaNV, user: req.user
        });
        await writeLedgerAudit(transaction, req, 'Kết chuyển kỳ kế toán', 'KyKeToan', MaKy,
            `Kết chuyển ${MaKy} · lợi nhuận ${pl.ln.toLocaleString('vi-VN')}đ`, { uc: 'UC39' });
        await transaction.commit();
        res.json({ message: 'Đã kết chuyển.', ...posted, loiNhuan: pl.ln });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const closePeriod = handle(async (req, res, pool) => {
    const MaKy = clean(req.params.maKy, 7);
    const check = await missingJournals(pool, MaKy);
    if (check.block.length) {
        return res.status(400).json({ message: 'Không khóa — còn chứng từ hợp lệ thiếu bút toán.', block: check.block, warn: check.warn });
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const nextKey = await copyOpeningForward(transaction, MaKy, true);
        await new sql.Request(transaction).input('MaKy', sql.VarChar, MaKy).input('MaNV', sql.VarChar, req.user.MaNV)
            .query(`UPDATE KyKeToan SET TrangThai=N'Khoa', NgayKhoa=GETDATE(), MaNV_Khoa=@MaNV WHERE MaKy=@MaKy`);
        await writeLedgerAudit(transaction, req, 'Khóa kỳ kế toán', 'KyKeToan', MaKy,
            `Khóa kỳ ${MaKy}${check.warn.length ? ` · ${check.warn.length} cảnh báo WARN` : ''}${nextKey ? ` · kỳ sau ${nextKey}` : ''}`, { uc: 'UC39' });
        await transaction.commit();
        res.json({ message: `Đã khóa kỳ ${MaKy}.`, warn: check.warn, nextPeriod: nextKey });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const reopenPeriod = handle(async (req, res, pool) => {
    const MaKy = clean(req.params.maKy, 7);
    const latest = await pool.request().query(`SELECT TOP 1 MaKy FROM KyKeToan WHERE TrangThai=N'Khoa' ORDER BY DenNgay DESC`);
    if (latest.recordset[0]?.MaKy !== MaKy) throw new Error('Chỉ mở lại kỳ khóa gần nhất.');
    const ky = await pool.request().input('MaKy', sql.VarChar, MaKy).query('SELECT * FROM KyKeToan WHERE MaKy=@MaKy');
    const [y, m] = MaKy.split('-').map(Number);
    const nextKey = periodKey(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
    const later = await pool.request().input('MaKy', sql.VarChar, nextKey).query(`
        SELECT TOP 1 MaBT, LoaiButToan FROM ButToan
        WHERE MaKy=@MaKy AND DaBiDao=0 AND TrangThai=N'DaGhiSo' AND LoaiButToan<>N'SODU_DAU_KY'`);
    if (later.recordset.length) throw new Error('Kỳ sau đã có bút toán nghiệp vụ. Không mở lại kỳ trước.');
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const goc = await findEffectiveJournal(transaction, { loaiChungTu: 'KyKeToan', maChungTu: MaKy, loaiButToan: 'KET_CHUYEN' });
        if (goc) {
            await reverseJournal(transaction, {
                MaBTGoc: goc.MaBT, MaNV: req.user.MaNV, lyDo: clean(req.body.LyDo, 200) || 'Mở lại kỳ', user: req.user
            });
        }
        await new sql.Request(transaction).input('MaKy', sql.VarChar, MaKy)
            .query(`UPDATE KyKeToan SET TrangThai=N'Mo', NgayKhoa=NULL WHERE MaKy=@MaKy`);
        await writeLedgerAudit(transaction, req, 'Mở lại kỳ kế toán', 'KyKeToan', MaKy,
            `Mở lại kỳ ${MaKy}. Lý do: ${clean(req.body.LyDo, 200) || 'Mở lại kỳ'}`, { uc: 'UC39', severity: 'Cảnh báo' });
        await transaction.commit();
        res.json({ message: `Đã mở lại kỳ ${MaKy}. Số dư đầu kỳ sau chưa đổi.` });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const listAssets = handle(async (req, res, pool) => {
    const rows = await pool.request().query('SELECT * FROM TaiSanCoDinh ORDER BY NgayMua DESC');
    res.json({ items: rows.recordset.map(calendarizeRow) });
});

const createAsset = handle(async (req, res, pool) => {
    if (!['111', '112'].includes(clean(req.body.MaTKTien, 8))) throw new Error('TSCĐ chỉ thanh toán 111 hoặc 112, không 331.');
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const MaTSCD = await generateJournalId(transaction, 'TaiSanCoDinh', 'MaTSCD', `TS${yyMM()}`, 4);
        await new sql.Request(transaction)
            .input('Ma', sql.VarChar, MaTSCD).input('Ten', sql.NVarChar, clean(req.body.TenTSCD, 200))
            .input('Nhom', sql.NVarChar, clean(req.body.Nhom, 50) || 'KHAC')
            .input('Bo', sql.NVarChar, clean(req.body.BoPhan, 50) || null)
            .input('Mua', sql.Date, isoDate(req.body.NgayMua) || vietnamCalendar().date)
            .input('SD', sql.Date, isoDate(req.body.NgayDuaVaoSD) || isoDate(req.body.NgayMua) || vietnamCalendar().date)
            .input('Thang', sql.SmallInt, n(req.body.SoThangKH))
            .input('NG', sql.Decimal(18, 2), n(req.body.NguyenGia))
            .input('Thue', sql.Decimal(18, 2), n(req.body.TienThue))
            .input('TK', sql.VarChar, clean(req.body.MaTKTien, 8))
            .input('NCC', sql.VarChar, clean(req.body.MaNCC, 20) || null)
            .input('HD', sql.VarChar, clean(req.body.SoHoaDon, 50) || null)
            .input('NV', sql.VarChar, req.user.MaNV)
            .query(`INSERT INTO TaiSanCoDinh
                (MaTSCD,TenTSCD,Nhom,BoPhan,NgayMua,NgayDuaVaoSD,SoThangKH,NguyenGia,TienThue,MaTKTien,MaNCC,SoHoaDon,MaNV_Lap)
                VALUES (@Ma,@Ten,@Nhom,@Bo,@Mua,@SD,@Thang,@NG,@Thue,@TK,@NCC,@HD,@NV)`);
        await writeLedgerAudit(transaction, req, 'Lập thẻ TSCĐ', 'TaiSanCoDinh', MaTSCD,
            `Lập thẻ ${MaTSCD} — ${clean(req.body.TenTSCD, 200)}`, { uc: 'UC41' });
        await transaction.commit();
        res.status(201).json({ MaTSCD, message: `Đã lập thẻ ${MaTSCD}.` });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const confirmAsset = handle(async (req, res, pool) => {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const row = await new sql.Request(transaction).input('Id', sql.VarChar, req.params.id)
            .query('SELECT * FROM TaiSanCoDinh WHERE MaTSCD=@Id');
        if (!row.recordset.length) throw new Error('Không tìm thấy TSCĐ.');
        const posted = await postAssetConfirm(transaction, { asset: row.recordset[0], maNV: req.user.MaNV, user: req.user });
        await writeLedgerAudit(transaction, req, 'Ghi sổ mua TSCĐ', 'TaiSanCoDinh', req.params.id,
            posted.queued ? `Thẻ ${req.params.id} chờ ghi sổ vì kỳ đã khóa` : `Ghi sổ mua TSCĐ ${req.params.id}`, { uc: 'UC41' });
        await transaction.commit();
        res.json({ message: posted.queued ? 'Thẻ đã lưu, bút toán chờ ghi sổ.' : 'Đã ghi sổ mua TSCĐ.', ...posted });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const runDepreciation = handle(async (req, res, pool) => {
    const MaKy = clean(req.params.maKy, 7);
    const existing = await findEffectiveJournal(await poolPromise.then(p => p), { loaiChungTu: 'KyKeToan', maChungTu: MaKy, loaiButToan: 'KHAU_HAO' });
    if (existing) return res.json({ message: 'Đã chạy khấu hao kỳ này.', alreadyPosted: true, MaBT: existing.MaBT });
    const assets = await pool.request().input('Den', sql.Date, `${MaKy}-${String(lastDay(...MaKy.split('-').map(Number))).padStart(2, '0')}`)
        .query(`SELECT * FROM TaiSanCoDinh WHERE NgayDuaVaoSD<=@Den AND TrangThai=N'Su dung'`);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        let tong = 0;
        for (const asset of assets.recordset) {
            const done = await new sql.Request(transaction).input('Ma', sql.VarChar, asset.MaTSCD)
                .query('SELECT COALESCE(SUM(SoTien),0) DaKH FROM KhauHaoTaiSan WHERE MaTSCD=@Ma');
            const da = n(done.recordset[0]?.DaKH);
            const monthly = roundMoney(n(asset.NguyenGia) / n(asset.SoThangKH));
            const remain = roundMoney(n(asset.NguyenGia) - da);
            if (remain <= 0) continue;
            const soTien = remain <= monthly ? remain : monthly;
            await new sql.Request(transaction).input('Ma', sql.VarChar, asset.MaTSCD).input('MaKy', sql.VarChar, MaKy)
                .input('So', sql.Decimal(18, 2), soTien)
                .query(`INSERT INTO KhauHaoTaiSan (MaTSCD,MaKy,SoTien) VALUES (@Ma,@MaKy,@So)`);
            tong = roundMoney(tong + soTien);
        }
        if (tong) {
            await postJournal(transaction, {
                loaiChungTu: 'KyKeToan', maChungTu: MaKy, loaiButToan: 'KHAU_HAO',
                ngayChungTu: `${MaKy}-${String(lastDay(...MaKy.split('-').map(Number))).padStart(2, '0')}`,
                dienGiai: `Khấu hao ${MaKy}`,
                lines: [{ maTK: '642', soTienNo: tong, soTienCo: 0 }, { maTK: '214', soTienNo: 0, soTienCo: tong }],
                maNV: req.user.MaNV, user: req.user
            });
        }
        await writeLedgerAudit(transaction, req, 'Chạy khấu hao TSCĐ', 'TaiSanCoDinh', MaKy,
            `Khấu hao kỳ ${MaKy}: ${tong.toLocaleString('vi-VN')}đ`, { uc: 'UC41' });
        await transaction.commit();
        res.json({ message: `Khấu hao ${tong.toLocaleString('vi-VN')}đ.`, soTien: tong });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const listBankAccounts = handle(async (req, res, pool) => {
    const rows = await pool.request().query('SELECT * FROM TaiKhoanNganHang ORDER BY MaTKNH');
    res.json({ items: rows.recordset });
});

const createBankAccount = handle(async (req, res, pool) => {
    const active = await pool.request().query(`SELECT MaTKNH FROM TaiKhoanNganHang WHERE TrangThai=N'Su dung'`);
    if (active.recordset.length) {
        throw Object.assign(new Error('Mini chỉ dùng 1 tài khoản ngân hàng đang sử dụng. Ngừng TK hiện tại trước khi thêm (hướng phát triển: nhiều NH).'), { status: 400 });
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const MaTKNH = await generateJournalId(transaction, 'TaiKhoanNganHang', 'MaTKNH', 'NH', 4);
        await new sql.Request(transaction)
            .input('Ma', sql.VarChar, MaTKNH)
            .input('So', sql.VarChar, clean(req.body.SoTaiKhoan, 30))
            .input('Ten', sql.NVarChar, clean(req.body.TenNH, 100))
            .input('CN', sql.NVarChar, clean(req.body.ChiNhanh, 100) || null)
            .input('Chu', sql.NVarChar, clean(req.body.ChuTaiKhoan, 150))
            .query(`INSERT INTO TaiKhoanNganHang (MaTKNH,SoTaiKhoan,TenNH,ChiNhanh,ChuTaiKhoan,MaTKKeToan)
                    VALUES (@Ma,@So,@Ten,@CN,@Chu,'112')`);
        await writeLedgerAudit(transaction, req, 'Thêm tài khoản ngân hàng', 'TaiKhoanNganHang', MaTKNH,
            `Thêm ${MaTKNH} · ${clean(req.body.TenNH, 100)} · luôn map TK 112`, { uc: 'UC42' });
        await transaction.commit();
        res.status(201).json({ MaTKNH, MaTKKeToan: '112', message: 'Đã thêm tài khoản ngân hàng (luôn map 112).' });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const parseCsv = (buffer) => {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw Object.assign(new Error('CSV trống.'), { status: 400 });
    const header = lines[0].split(',').map(cell => cell.trim().replace(/^"|"$/g, '').toLowerCase());
    const idx = name => header.findIndex(h => h.includes(name));
    const iNgay = idx('ngay') >= 0 ? idx('ngay') : 0;
    const iTien = idx('sotien') >= 0 ? idx('sotien') : (idx('so tien') >= 0 ? idx('so tien') : 1);
    const iNo = idx('no');
    const iCo = idx('co');
    const iDG = idx('dien');
    const iGD = idx('magd') >= 0 ? idx('magd') : idx('giao');
    return lines.slice(1).map(line => {
        const cols = line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
        return {
            ngay: cols[iNgay],
            soTien: n(cols[iTien]),
            no: iNo >= 0 ? n(cols[iNo]) : 0,
            co: iCo >= 0 ? n(cols[iCo]) : 0,
            dienGiai: iDG >= 0 ? cols[iDG] : '',
            maGD: iGD >= 0 ? cols[iGD] : ''
        };
    });
};

const importStatement = handle(async (req, res, pool) => {
    if (!req.file) throw Object.assign(new Error('Thiếu file CSV.'), { status: 400 });
    const rows = parseCsv(req.file.buffer);
    const MaTKNH = clean(req.body.MaTKNH, 20);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const MaSaoKe = await generateJournalId(transaction, 'SaoKeNganHang', 'MaSaoKe', `SK${yyMM()}`, 4);
        await new sql.Request(transaction)
            .input('Ma', sql.VarChar, MaSaoKe).input('TK', sql.VarChar, MaTKNH)
            .input('Tu', sql.Date, req.body.TuNgay || rows[0]?.ngay)
            .input('Den', sql.Date, req.body.DenNgay || rows[rows.length - 1]?.ngay)
            .input('Ten', sql.NVarChar, req.file.originalname)
            .input('NV', sql.VarChar, req.user.MaNV)
            .query(`INSERT INTO SaoKeNganHang (MaSaoKe,MaTKNH,TuNgay,DenNgay,TenFile,MaNV_Import)
                    VALUES (@Ma,@TK,@Tu,@Den,@Ten,@NV)`);
        for (const row of rows) {
            await new sql.Request(transaction)
                .input('Ma', sql.VarChar, MaSaoKe).input('Ngay', sql.Date, row.ngay)
                .input('Tien', sql.Decimal(18, 2), row.soTien)
                .input('No', sql.Decimal(18, 2), row.no).input('Co', sql.Decimal(18, 2), row.co)
                .input('DG', sql.NVarChar, row.dienGiai || null).input('GD', sql.VarChar, row.maGD || null)
                .query(`INSERT INTO DongSaoKe (MaSaoKe,NgayGD,SoTien,PhatSinhNo,PhatSinhCo,DienGiai,MaGiaoDich)
                        VALUES (@Ma,@Ngay,@Tien,@No,@Co,@DG,@GD)`);
        }
        await writeLedgerAudit(transaction, req, 'Nhập sao kê CSV', 'SaoKeNganHang', MaSaoKe,
            `Nhập ${MaSaoKe} · ${rows.length} dòng · ${req.file.originalname} · TKNH ${MaTKNH}`, { uc: 'UC42' });
        await transaction.commit();
        res.status(201).json({ MaSaoKe, soDong: rows.length });
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
});

const getStatement = handle(async (req, res, pool) => {
    const header = await pool.request().input('Id', sql.VarChar, req.params.id)
        .query('SELECT * FROM SaoKeNganHang WHERE MaSaoKe=@Id');
    const lines = await pool.request().input('Id', sql.VarChar, req.params.id)
        .query('SELECT * FROM DongSaoKe WHERE MaSaoKe=@Id ORDER BY NgayGD, MaDong');
    res.json({
        statement: calendarizeRow(header.recordset[0]),
        lines: lines.recordset.map(calendarizeRow)
    });
});

const autoMatchStatement = handle(async (req, res, pool) => {
    const lines = await pool.request().input('Id', sql.VarChar, req.params.id)
        .query(`SELECT * FROM DongSaoKe WHERE MaSaoKe=@Id AND TrangThaiKhop=N'Chua khop' AND MaGiaoDich IS NOT NULL`);
    let matched = 0;
    for (const line of lines.recordset) {
        const hit = await pool.request().input('GD', sql.VarChar, line.MaGiaoDich).query(`
            SELECT TOP 1 N'ThanhToan' Loai, MaTT Ma FROM ThanhToan WHERE MaGiaoDich=@GD
            UNION ALL SELECT TOP 1 N'PhieuChi', MaPhieu FROM PhieuChi WHERE MaGiaoDichNganHang=@GD
            UNION ALL SELECT TOP 1 N'PhieuChiLuong', MaPhieu FROM PhieuChiLuong WHERE MaGiaoDichNganHang=@GD`);
        if (hit.recordset[0]) {
            await pool.request().input('Dong', sql.BigInt, line.MaDong)
                .input('Loai', sql.NVarChar, hit.recordset[0].Loai)
                .input('Ma', sql.VarChar, hit.recordset[0].Ma)
                .query(`UPDATE DongSaoKe SET TrangThaiKhop=N'Khop tu dong', LoaiChungTuKhop=@Loai, MaChungTuKhop=@Ma WHERE MaDong=@Dong`);
            matched += 1;
        }
    }
    await writeLedgerAudit(pool, req, 'Khớp sao kê tự động', 'SaoKeNganHang', req.params.id,
        `Khớp tự động ${matched} dòng trên ${req.params.id}`, { uc: 'UC42' });
    res.json({ message: `Khớp tự động ${matched} dòng.`, matched });
});

const matchBankLine = handle(async (req, res, pool) => {
    await pool.request().input('Id', sql.BigInt, req.params.id)
        .input('Loai', sql.NVarChar, clean(req.body.LoaiChungTu, 30))
        .input('Ma', sql.VarChar, clean(req.body.Ma, 30))
        .query(`UPDATE DongSaoKe SET TrangThaiKhop=N'Khop thu cong', LoaiChungTuKhop=@Loai, MaChungTuKhop=@Ma WHERE MaDong=@Id`);
    await writeLedgerAudit(pool, req, 'Khớp sao kê thủ công', 'SaoKeNganHang', String(req.params.id),
        `Khớp dòng ${req.params.id} với ${clean(req.body.LoaiChungTu, 30)} ${clean(req.body.Ma, 30)}`, { uc: 'UC42' });
    res.json({ message: 'Đã khớp tay.' });
});

const mismatchBankLine = handle(async (req, res, pool) => {
    await pool.request().input('Id', sql.BigInt, req.params.id)
        .input('LyDo', sql.NVarChar, clean(req.body.LyDo, 200))
        .query(`UPDATE DongSaoKe SET TrangThaiKhop=N'Chenh lech', GhiChuKhop=@LyDo WHERE MaDong=@Id`);
    await writeLedgerAudit(pool, req, 'Đánh chênh lệch sao kê', 'SaoKeNganHang', String(req.params.id),
        `Chênh lệch dòng ${req.params.id}. Lý do: ${clean(req.body.LyDo, 200)}`, { uc: 'UC42', severity: 'Cảnh báo' });
    res.json({ message: 'Đã đánh chênh lệch.' });
});

const getSalesInvoiceDocument = async (pool, id) => {
    const header = await pool.request().input('MaHD', sql.VarChar, id).query(`
        SELECT hd.*, kh.TenKH, kh.SDT, nv.TenNV, ca.MaQuay,
               ${INVOICE_RETURN_COLUMNS}
        FROM HoaDon hd
        JOIN NhanVien nv ON nv.MaNV = hd.MaNV
        JOIN CaLamViec ca ON ca.MaCa = hd.MaCa
        LEFT JOIN KhachHang kh ON kh.MaKH = hd.MaKH
        ${INVOICE_RETURN_APPLY}
        WHERE hd.MaHD = @MaHD`);
    if (!header.recordset.length) throw Object.assign(new Error('Không tìm thấy hóa đơn bán.'), { status: 404 });
    const [lines, payments, returns] = await Promise.all([
        pool.request().input('MaHD', sql.VarChar, id).query(`
            SELECT ct.*, sp.TenSP, sp.DonViTinh, sp.MaVach
            FROM ChiTietHoaDon ct JOIN SanPham sp ON sp.MaSP = ct.MaSP
            WHERE ct.MaHD = @MaHD ORDER BY sp.TenSP`),
        pool.request().input('MaHD', sql.VarChar, id).query(`
            SELECT * FROM ThanhToan WHERE MaHD=@MaHD ORDER BY NgayTT`),
        pool.request().input('MaHD', sql.VarChar, id).query(`
            SELECT dt.MaDT, dt.HinhThucXuLy, dt.TrangThai, dt.SoTienHoan, dt.NgayLap, dt.LyDo, dt.MaCaHoan,
                   nv.TenNV NguoiLap
            FROM PhieuDoiTra dt
            JOIN NhanVien nv ON nv.MaNV = dt.MaNV_Lap
            WHERE dt.MaHD = @MaHD
            ORDER BY dt.NgayLap`)
    ]);
    return {
        invoice: calendarizeRow(header.recordset[0]),
        lines: lines.recordset,
        payments: payments.recordset,
        returns: returns.recordset.map(calendarizeRow)
    };
};

const getDocument = handle(async (req, res, pool) => {
    const loai = clean(req.params.loai, 40);
    const id = clean(req.params.id, 40);
    if (!id) throw Object.assign(new Error('Thiếu mã chứng từ.'), { status: 400 });
    if (loai === 'HoaDon') {
        const detail = await getSalesInvoiceDocument(pool, id);
        return res.json({ loai, loaiHienThi: docTypeLabel(loai), ...detail });
    }
    if (loai === 'ChiPhiVanHanh') {
        const expense = await loadPresentedExpense(pool, id);
        if (!expense) throw Object.assign(new Error('Không tìm thấy phiếu chi phí.'), { status: 404 });
        return res.json({ loai, loaiHienThi: docTypeLabel(loai), expense });
    }
    if (loai === 'TaiSanCoDinh') {
        const rows = await pool.request().input('Id', sql.VarChar, id).query('SELECT * FROM TaiSanCoDinh WHERE MaTSCD=@Id');
        if (!rows.recordset.length) throw Object.assign(new Error('Không tìm thấy thẻ TSCĐ.'), { status: 404 });
        return res.json({ loai, loaiHienThi: docTypeLabel(loai), asset: calendarizeRow(rows.recordset[0]) });
    }
    if (loai === 'HoaDonMuaHang') {
        const rows = await pool.request().input('Id', sql.VarChar, id).query('SELECT MaHDMH FROM HoaDonMuaHang WHERE MaHDMH=@Id');
        if (!rows.recordset.length) throw Object.assign(new Error('Không tìm thấy hóa đơn mua hàng.'), { status: 404 });
        return res.json({ loai, loaiHienThi: docTypeLabel(loai), MaHDMH: id, open: 'invoice' });
    }
    if (loai === 'PhieuChi') {
        const rows = await pool.request().input('Id', sql.VarChar, id).query('SELECT MaPhieu FROM PhieuChi WHERE MaPhieu=@Id');
        if (!rows.recordset.length) throw Object.assign(new Error('Không tìm thấy phiếu chi.'), { status: 404 });
        return res.json({ loai, loaiHienThi: docTypeLabel(loai), MaPhieu: id, open: 'pc' });
    }
    if (loai === 'PhieuNhap') {
        const rows = await pool.request().input('Id', sql.VarChar, id).query('SELECT MaPN FROM PhieuNhap WHERE MaPN=@Id');
        if (!rows.recordset.length) throw Object.assign(new Error('Không tìm thấy phiếu nhập.'), { status: 404 });
        return res.json({ loai, loaiHienThi: docTypeLabel(loai), MaPN: id, open: 'pn' });
    }
    throw Object.assign(new Error(`Chưa hỗ trợ xem chứng từ loại ${docTypeLabel(loai)}.`), { status: 400 });
});

const HANDBOOK_FILES = [
    path.resolve(__dirname, '..', '..', '..', 'docs', 'CAM_NANG_KE_TOAN_MINI.txt'),
    path.resolve(__dirname, '..', '..', '..', 'desktop', 'src', 'pages', 'accounting', 'cam-nang.txt')
];

const getHandbook = async (req, res) => {
    try {
        let content = '';
        for (const file of HANDBOOK_FILES) {
            try {
                content = await fs.readFile(file, 'utf8');
                if (content && content.trim()) break;
            } catch {
                content = '';
            }
        }
        if (!content.trim()) {
            return res.status(404).json({ message: 'Không tìm thấy cẩm nang kế toán trên máy chủ.' });
        }
        res.json({ content: content.replace(/^\uFEFF/, '') });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Không đọc được cẩm nang kế toán.' });
    }
};

module.exports = {
    csvUpload,
    listAccounts,
    saveAccount,
    patchAccount,
    listPeriods,
    upsertPeriod,
    openPeriod,
    getOpening,
    saveOpening,
    lockOpening,
    listExpenseTypes,
    listExpenses,
    createExpense,
    confirmExpense,
    cancelExpense,
    listJournals,
    getJournal,
    createManualJournal,
    reverseManual,
    previewExisting,
    listUnposted,
    postUnposted,
    journalReport,
    generalLedger,
    trialBalance,
    incomeStatement,
    balanceSheet,
    cashFlow,
    cashMovement,
    vatOutput,
    vatInput,
    vatSummary,
    closeCheck,
    postClosing,
    closePeriod,
    reopenPeriod,
    listAssets,
    createAsset,
    confirmAsset,
    runDepreciation,
    listBankAccounts,
    createBankAccount,
    importStatement,
    getStatement,
    autoMatchStatement,
    matchBankLine,
    mismatchBankLine,
    getDocument,
    getHandbook
};
