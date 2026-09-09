const { sql } = require('../config/db');
const { logAudit } = require('./auditLog');
const { roundMoney } = require('./financialRules');
const { vietnamCalendar, vietnamDateKey } = require('./reportingPeriod');
const { docTypeLabel, journalTypeLabel } = require('./ledgerLabels');

const CLOSED_REASON = 'KY_KHOA';
const EXCLUDED_PL = ['KET_CHUYEN', 'DAO_KET_CHUYEN', 'SODU_DAU_KY'];
const EXCLUDED_PS = ['SODU_DAU_KY'];

let schemaKnown = null;
let vatKnown = null;

const n = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const requestOf = connection => (connection?.request ? connection.request() : new sql.Request(connection));

const isoDate = value => vietnamDateKey(value);

const clampIsoDate = (value, from, to) => {
    let date = isoDate(value);
    const start = isoDate(from);
    const end = isoDate(to);
    if (!date) return start || end || null;
    if (start && date < start) date = start;
    if (end && date > end) date = end;
    return date;
};

/** Ngoài kỳ đang mở → ngày cuối kỳ (vd 09/09 + kỳ 8/2026 → 31/08). Trong kỳ thì giữ nguyên. */
const datesInOpenPeriod = (open, ngayChungTu) => {
    if (!open) return null;
    const tu = isoDate(open.TuNgay);
    const den = isoDate(open.DenNgay);
    const ngay = isoDate(ngayChungTu);
    const inOpen = Boolean(ngay && tu && den && ngay >= tu && ngay <= den);
    const used = inOpen ? ngay : den;
    return {
        maKy: open.MaKy,
        ngayHachToan: used,
        ngayChungTu: used
    };
};

const yyMM = (now = new Date()) => {
    const cal = vietnamCalendar(now);
    return `${String(cal.year).slice(-2)}${cal.month}`;
};

const yyMMFromMaKy = (maKy) => {
    const match = String(maKy || '').match(/^(\d{4})-(\d{2})$/);
    return match ? `${match[1].slice(-2)}${match[2]}` : yyMM();
};

const periodLabelVi = (maKy) => {
    const match = String(maKy || '').match(/^(\d{4})-(\d{2})$/);
    return match ? `Tháng ${Number(match[2])}/${match[1]}` : String(maKy || 'kỳ đang mở');
};

const defaultDateInPeriod = (period) => {
    if (!period) return vietnamCalendar().date;
    const tu = isoDate(period.TuNgay);
    const den = isoDate(period.DenNgay);
    const today = vietnamCalendar().date;
    if (tu && today < tu) return tu;
    if (den && today > den) return den;
    if (tu && den && today >= tu && today <= den) return today;
    return den || tu || today;
};

const hasAccountingSchema = async (connection) => {
    if (schemaKnown === true) return true;
    try {
        const result = await requestOf(connection).query(`SELECT OBJECT_ID(N'dbo.ButToan', N'U') AS Id`);
        schemaKnown = Boolean(result.recordset[0]?.Id);
        return schemaKnown;
    } catch {
        schemaKnown = false;
        return false;
    }
};

const hasVatColumns = async (connection) => {
    if (vatKnown === true) return true;
    try {
        const result = await requestOf(connection).query(`SELECT COL_LENGTH(N'dbo.SanPham', N'ThueSuat') AS Len`);
        vatKnown = Boolean(result.recordset[0]?.Len);
        return vatKnown;
    } catch {
        vatKnown = false;
        return false;
    }
};

const resetSchemaCache = () => { schemaKnown = null; vatKnown = null; };

const generateJournalId = async (transaction, table, column, prefix, width = 5) => {
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 ${column} AS Ma FROM ${table} WITH (UPDLOCK,HOLDLOCK)
                WHERE ${column} LIKE @Prefix ORDER BY ${column} DESC`);
    const last = result.recordset[0]?.Ma;
    const next = last ? Number(String(last).slice(prefix.length)) + 1 : 1;
    if (!Number.isFinite(next) || next < 1) {
        throw new Error(`Không sinh được ${column} với tiền tố ${prefix}.`);
    }
    return `${prefix}${String(next).padStart(width, '0')}`;
};

const moneyAccount = method => (/tiền mặt|tien mat/i.test(String(method || '')) ? '111' : '112');

const normalizeLines = (lines = []) => lines.map((line, index) => {
    const soTienNo = roundMoney(line.soTienNo ?? line.SoTienNo ?? 0);
    const soTienCo = roundMoney(line.soTienCo ?? line.SoTienCo ?? 0);
    const maTK = String(line.maTK || line.MaTK || '').trim();
    if (!maTK) throw new Error(`Dòng bút toán ${index + 1} thiếu tài khoản.`);
    if ((soTienNo > 0 && soTienCo > 0) || (soTienNo <= 0 && soTienCo <= 0)) {
        throw new Error(`Dòng ${maTK}: mỗi dòng chỉ Nợ hoặc Có > 0.`);
    }
    return {
        maTK,
        soTienNo,
        soTienCo,
        dienGiaiDong: String(line.dienGiaiDong || line.DienGiaiDong || '').slice(0, 300) || null,
        maDoiTuong: String(line.maDoiTuong || line.MaDoiTuong || '').slice(0, 30) || null,
        loaiDoiTuong: String(line.loaiDoiTuong || line.LoaiDoiTuong || '').slice(0, 20) || null
    };
}).filter(line => line.soTienNo > 0 || line.soTienCo > 0);

const previewJournal = (payload = {}) => {
    const lines = normalizeLines(payload.lines);
    const tongNo = roundMoney(lines.reduce((sum, line) => sum + line.soTienNo, 0));
    const tongCo = roundMoney(lines.reduce((sum, line) => sum + line.soTienCo, 0));
    if (tongNo !== tongCo) {
        const error = new Error(`Bút toán lệch: Nợ ${tongNo} ≠ Có ${tongCo}.`);
        error.status = 400;
        throw error;
    }
    return { lines, tongNo, tongCo };
};

const findCoveringPeriod = async (transaction, ngay) => {
    const result = await new sql.Request(transaction)
        .input('Ngay', sql.Date, ngay)
        .query(`SELECT TOP 1 * FROM KyKeToan WHERE TuNgay<=@Ngay AND DenNgay>=@Ngay`);
    return result.recordset[0] || null;
};

const findOpenPeriod = async (transaction, { afterDate = null } = {}) => {
    const request = new sql.Request(transaction).input('After', sql.Date, afterDate);
    const result = await request.query(`
        SELECT TOP 1 * FROM KyKeToan
        WHERE TrangThai=N'Mo' AND (@After IS NULL OR TuNgay>@After)
        ORDER BY TuNgay`);
    return result.recordset[0] || null;
};

const assertPeriodOpen = async (transaction, ngay) => {
    const date = isoDate(ngay);
    const period = await findCoveringPeriod(transaction, date);
    if (!period || period.TrangThai !== 'Mo') {
        const error = new Error(`Ngày hạch toán ${date} không thuộc kỳ đang mở.`);
        error.status = 400;
        throw error;
    }
    return period;
};

const enqueueChoGhiSo = async (transaction, { loaiChungTu, maChungTu, lyDo }) => {
    const existing = await new sql.Request(transaction)
        .input('Loai', sql.NVarChar, loaiChungTu)
        .input('Ma', sql.VarChar, maChungTu)
        .input('LyDo', sql.NVarChar, lyDo)
        .query(`SELECT MaCho FROM ChoGhiSo WITH (UPDLOCK,HOLDLOCK)
                WHERE LoaiChungTu=@Loai AND MaChungTu=@Ma AND LyDo=@LyDo AND DaXuLy=0`);
    if (existing.recordset.length) return { queued: true, alreadyQueued: true, MaCho: existing.recordset[0].MaCho };
    try {
        const inserted = await new sql.Request(transaction)
            .input('Loai', sql.NVarChar, loaiChungTu)
            .input('Ma', sql.VarChar, maChungTu)
            .input('LyDo', sql.NVarChar, lyDo)
            .query(`INSERT INTO ChoGhiSo (LoaiChungTu, MaChungTu, LyDo)
                    OUTPUT inserted.MaCho
                    VALUES (@Loai, @Ma, @LyDo)`);
        return { queued: true, MaCho: inserted.recordset[0]?.MaCho };
    } catch (error) {
        if (error.number === 2601 || error.number === 2627) return { queued: true, alreadyQueued: true };
        throw error;
    }
};

const markChoGhiSoDone = async (transaction, { loaiChungTu, maChungTu, lyDo = null }) => {
    const request = new sql.Request(transaction)
        .input('Loai', sql.NVarChar, loaiChungTu)
        .input('Ma', sql.VarChar, maChungTu)
        .input('LyDo', sql.NVarChar, lyDo);
    await request.query(`
        UPDATE ChoGhiSo SET DaXuLy=1
        WHERE LoaiChungTu=@Loai AND MaChungTu=@Ma AND DaXuLy=0
          AND (@LyDo IS NULL OR LyDo=@LyDo)`);
};

const postingIntoOpen = (open, chungTu, extra = {}) => {
    const tu = isoDate(open.TuNgay);
    const den = isoDate(open.DenNgay);
    const today = vietnamCalendar().date;
    const inOpen = today >= tu && today <= den;
    return {
        maKy: open.MaKy,
        ngayHachToan: inOpen ? today : clampIsoDate(chungTu, tu, den),
        ngayChungTu: chungTu,
        queued: false,
        ...extra
    };
};

const resolvePostingDates = async (transaction, { ngayChungTu, late = false, forceOpenPeriod = false }) => {
    const chungTu = isoDate(ngayChungTu) || vietnamCalendar().date;
    if (forceOpenPeriod) {
        const open = await findOpenPeriod(transaction);
        if (!open) {
            throw Object.assign(new Error('Chưa có kỳ kế toán đang mở. Mở kỳ rồi bấm Ghi sổ.'), { status: 400 });
        }
        return { ...datesInOpenPeriod(open, chungTu), queued: false };
    }
    const covering = await findCoveringPeriod(transaction, chungTu);
    if (covering?.TrangThai === 'Mo') {
        return { maKy: covering.MaKy, ngayHachToan: chungTu, ngayChungTu: chungTu, queued: false };
    }
    if (covering?.TrangThai === 'Khoa') {
        if (late) {
            const open = await findOpenPeriod(transaction, { afterDate: covering.DenNgay })
                || await findOpenPeriod(transaction);
            if (!open) return { queued: true, lyDo: CLOSED_REASON, ngayChungTu: chungTu };
            return postingIntoOpen(open, chungTu, { late: true });
        }
        return { queued: true, lyDo: CLOSED_REASON, ngayChungTu: chungTu };
    }
    // ChuaMo / không có kỳ phủ: hôm nay có thể là tháng 9 trong khi kỳ 8 vẫn mở — kẹp vào kỳ đang mở, không xếp KY_KHOA.
    const open = await findOpenPeriod(transaction);
    if (!open) return { queued: true, lyDo: CLOSED_REASON, ngayChungTu: chungTu };
    return postingIntoOpen(open, chungTu);
};

const loadAccountMap = async (transaction, codes) => {
    if (!codes.length) return new Map();
    const request = new sql.Request(transaction);
    const names = codes.map((code, index) => {
        const key = `TK${index}`;
        request.input(key, sql.VarChar, code);
        return `@${key}`;
    });
    const result = await request.query(`
        SELECT MaTK, TenTK, TrangThai, ChoPhepGhiSo
        FROM TaiKhoanKeToan WHERE MaTK IN (${names.join(',')})`);
    return new Map(result.recordset.map(row => [row.MaTK, row]));
};

const findEffectiveJournal = async (transaction, { loaiChungTu, maChungTu, loaiButToan }) => {
    const result = await new sql.Request(transaction)
        .input('LoaiCT', sql.NVarChar, loaiChungTu)
        .input('MaCT', sql.VarChar, maChungTu)
        .input('LoaiBT', sql.NVarChar, loaiButToan)
        .query(`SELECT TOP 1 * FROM ButToan WITH (UPDLOCK,HOLDLOCK)
                WHERE LoaiChungTu=@LoaiCT AND MaChungTu=@MaCT AND LoaiButToan=@LoaiBT
                  AND TrangThai=N'DaGhiSo' AND DaBiDao=0 AND MaBTGoc IS NULL`);
    return result.recordset[0] || null;
};

const insertJournalRows = async (transaction, header, lines) => {
    await new sql.Request(transaction)
        .input('MaBT', sql.VarChar, header.MaBT)
        .input('MaKy', sql.VarChar, header.MaKy)
        .input('NgayHT', sql.Date, header.NgayHachToan)
        .input('NgayCT', sql.Date, header.NgayChungTu)
        .input('LoaiCT', sql.NVarChar, header.LoaiChungTu)
        .input('MaCT', sql.VarChar, header.MaChungTu)
        .input('LoaiBT', sql.NVarChar, header.LoaiButToan)
        .input('DienGiai', sql.NVarChar, header.DienGiai)
        .input('TongNo', sql.Decimal(18, 2), header.TongNo)
        .input('TongCo', sql.Decimal(18, 2), header.TongCo)
        .input('MaNV', sql.VarChar, header.MaNV_Lap)
        .input('Nguon', sql.NVarChar, header.Nguon)
        .input('MaBTGoc', sql.VarChar, header.MaBTGoc)
        .query(`INSERT INTO ButToan
            (MaBT,MaKy,NgayHachToan,NgayChungTu,LoaiChungTu,MaChungTu,LoaiButToan,DienGiai,
             TrangThai,DaBiDao,MaBTGoc,TongNo,TongCo,MaNV_Lap,Nguon)
            VALUES (@MaBT,@MaKy,@NgayHT,@NgayCT,@LoaiCT,@MaCT,@LoaiBT,@DienGiai,
                    N'DaGhiSo',0,@MaBTGoc,@TongNo,@TongCo,@MaNV,@Nguon)`);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        await new sql.Request(transaction)
            .input('MaBT', sql.VarChar, header.MaBT)
            .input('SoDong', sql.SmallInt, index + 1)
            .input('MaTK', sql.VarChar, line.maTK)
            .input('No', sql.Decimal(18, 2), line.soTienNo)
            .input('Co', sql.Decimal(18, 2), line.soTienCo)
            .input('DG', sql.NVarChar, line.dienGiaiDong)
            .input('DT', sql.VarChar, line.maDoiTuong)
            .input('LDT', sql.NVarChar, line.loaiDoiTuong)
            .query(`INSERT INTO ChiTietButToan
                (MaBT,SoDong,MaTK,SoTienNo,SoTienCo,DienGiaiDong,MaDoiTuong,LoaiDoiTuong)
                VALUES (@MaBT,@SoDong,@MaTK,@No,@Co,@DG,@DT,@LDT)`);
    }
};

const postJournal = async (transaction, payload = {}) => {
    if (!(await hasAccountingSchema(transaction))) return { skipped: true };
    const nguon = payload.nguon || payload.Nguon || 'TuDong';
    const loaiButToan = String(payload.loaiButToan || payload.LoaiButToan || '').trim();
    const isManual = loaiButToan === 'THU_CONG';
    let loaiChungTu = String(payload.loaiChungTu || payload.LoaiChungTu || '').trim();
    let maChungTu = String(payload.maChungTu || payload.MaChungTu || '').trim();
    if (!loaiButToan) throw Object.assign(new Error('Thiếu loại bút toán.'), { status: 400 });

    if (isManual) loaiChungTu = 'ThuCong';
    if (!isManual && (!loaiChungTu || !maChungTu)) {
        throw Object.assign(new Error('Thiếu chứng từ nguồn.'), { status: 400 });
    }

    if (!isManual) {
        const existing = await findEffectiveJournal(transaction, { loaiChungTu, maChungTu, loaiButToan });
        if (existing) return { MaBT: existing.MaBT, alreadyPosted: true };
    }

    const preview = previewJournal(payload);
    const ngayChungTu = isoDate(payload.ngayChungTu || payload.NgayChungTu) || vietnamCalendar().date;
    const dates = await resolvePostingDates(transaction, {
        ngayChungTu,
        late: Boolean(payload.late),
        forceOpenPeriod: Boolean(payload.forceOpenPeriod)
    });
    if (dates.queued) {
        if (isManual) {
            throw Object.assign(new Error('Bút toán thủ công bắt buộc ngày thuộc kỳ đang mở.'), { status: 400 });
        }
        const queued = await enqueueChoGhiSo(transaction, { loaiChungTu, maChungTu, lyDo: dates.lyDo || CLOSED_REASON });
        return { queued: true, ...queued };
    }

    if (isManual) {
        maChungTu = await generateJournalId(transaction, 'ButToan', 'MaChungTu', `TC${yyMMFromMaKy(dates.maKy)}`, 5);
    }

    await assertPeriodOpen(transaction, dates.ngayHachToan);
    const accounts = await loadAccountMap(transaction, [...new Set(preview.lines.map(line => line.maTK))]);
    for (const line of preview.lines) {
        const account = accounts.get(line.maTK);
        if (!account) throw Object.assign(new Error(`Không có tài khoản ${line.maTK}.`), { status: 400 });
        if (account.TrangThai !== 'Su dung') throw Object.assign(new Error(`Tài khoản ${line.maTK} đã ngừng.`), { status: 400 });
        if (!account.ChoPhepGhiSo) throw Object.assign(new Error(`Tài khoản ${line.maTK} không cho ghi sổ.`), { status: 400 });
    }

    const MaBT = await generateJournalId(transaction, 'ButToan', 'MaBT', `BT${yyMMFromMaKy(dates.maKy)}`, 5);
    const header = {
        MaBT,
        MaKy: dates.maKy,
        NgayHachToan: dates.ngayHachToan,
        NgayChungTu: dates.ngayChungTu,
        LoaiChungTu: loaiChungTu,
        MaChungTu: maChungTu,
        LoaiButToan: loaiButToan,
        DienGiai: String(payload.dienGiai || payload.DienGiai || loaiButToan).slice(0, 500),
        TongNo: preview.tongNo,
        TongCo: preview.tongCo,
        MaNV_Lap: payload.maNV || payload.MaNV || payload.MaNV_Lap,
        Nguon: isManual ? 'ThuCong' : (nguon === 'Seeding' ? 'Seeding' : 'TuDong'),
        MaBTGoc: payload.maBTGoc || payload.MaBTGoc || null
    };
    if (!header.MaNV_Lap) throw Object.assign(new Error('Thiếu nhân viên lập bút toán.'), { status: 400 });
    await insertJournalRows(transaction, header, preview.lines);
    await markChoGhiSoDone(transaction, { loaiChungTu, maChungTu });
    await logAudit(transaction, {
        user: payload.user || { MaNV: header.MaNV_Lap },
        action: 'Ghi sổ bút toán',
        table: 'ButToan',
        recordId: MaBT,
        uc: 'UC37',
        content: `${journalTypeLabel(loaiButToan)} · ${docTypeLabel(loaiChungTu)} ${maChungTu} · Nợ ${header.TongNo} · Có ${header.TongCo}${header.DienGiai ? ` · ${header.DienGiai}` : ''}`
    }).catch(() => {});
    return { MaBT, alreadyPosted: false, MaKy: header.MaKy, MaChungTu: maChungTu, LoaiChungTu: loaiChungTu };
};

const reverseJournal = async (transaction, { MaBTGoc, MaNV, lyDo = '', user } = {}) => {
    if (!(await hasAccountingSchema(transaction))) return { skipped: true };
    const source = await new sql.Request(transaction)
        .input('MaBT', sql.VarChar, MaBTGoc)
        .query(`SELECT * FROM ButToan WITH (UPDLOCK,HOLDLOCK) WHERE MaBT=@MaBT`);
    if (!source.recordset.length) throw Object.assign(new Error('Không tìm thấy bút toán gốc.'), { status: 404 });
    const goc = source.recordset[0];
    if (goc.TrangThai !== 'DaGhiSo' || Number(goc.DaBiDao)) {
        throw Object.assign(new Error('Chỉ đảo bút toán đã ghi sổ và chưa bị đảo.'), { status: 400 });
    }
    const period = await findCoveringPeriod(transaction, isoDate(goc.NgayHachToan));
    if (period?.TrangThai === 'Khoa') {
        throw Object.assign(new Error('Không đảo bút toán đã ghi vào kỳ Khoa. Mở lại kỳ hoặc điều chỉnh kỳ đang mở.'), { status: 400 });
    }
    const details = await new sql.Request(transaction)
        .input('MaBT', sql.VarChar, MaBTGoc)
        .query(`SELECT * FROM ChiTietButToan WHERE MaBT=@MaBT ORDER BY SoDong`);
    const loaiDao = `DAO_${goc.LoaiButToan}`.slice(0, 30);
    const posted = await postJournal(transaction, {
        loaiChungTu: goc.LoaiChungTu,
        maChungTu: goc.MaChungTu,
        loaiButToan: loaiDao,
        ngayChungTu: goc.NgayHachToan,
        dienGiai: `Đảo ${goc.MaBT}: ${lyDo || goc.DienGiai}`.slice(0, 500),
        lines: details.recordset.map(row => ({
            maTK: row.MaTK,
            soTienNo: n(row.SoTienCo),
            soTienCo: n(row.SoTienNo),
            dienGiaiDong: `Đảo ${row.MaTK}`,
            maDoiTuong: row.MaDoiTuong,
            loaiDoiTuong: row.LoaiDoiTuong
        })),
        maNV: MaNV || goc.MaNV_Lap,
        nguon: goc.Nguon === 'ThuCong' ? 'ThuCong' : 'TuDong',
        maBTGoc: goc.MaBT,
        user
    });
    if (posted.queued || !posted.MaBT) {
        throw Object.assign(new Error('Không đảo được: kỳ gốc không đang mở. Mở lại kỳ rồi đảo.'), { status: 400 });
    }
    await new sql.Request(transaction)
        .input('MaBT', sql.VarChar, goc.MaBT)
        .query(`UPDATE ButToan SET DaBiDao=1 WHERE MaBT=@MaBT AND DaBiDao=0`);
    await logAudit(transaction, {
        user: user || { MaNV: MaNV || goc.MaNV_Lap },
        action: 'Đảo bút toán',
        table: 'ButToan',
        recordId: posted.MaBT,
        uc: 'UC37',
        content: `Đảo ${goc.MaBT} → ${posted.MaBT} (${journalTypeLabel(loaiDao)}). Lý do: ${lyDo || '—'}`
    }).catch(() => {});
    return { MaBTGoc: goc.MaBT, MaBT: posted.MaBT, LoaiButToan: loaiDao };
};

const netMovement = (debit, credit, nature) => {
    const no = n(debit);
    const co = n(credit);
    if (nature === 'Co') return roundMoney(co - no);
    return roundMoney(no - co);
};

const KQKD_NATURE = { 511: 'Co', 711: 'Co', 5212: 'No', 632: 'No', 642: 'No' };

module.exports = {
    CLOSED_REASON,
    EXCLUDED_PL,
    EXCLUDED_PS,
    KQKD_NATURE,
    moneyAccount,
    yyMM,
    yyMMFromMaKy,
    periodLabelVi,
    defaultDateInPeriod,
    datesInOpenPeriod,
    clampIsoDate,
    isoDate,
    hasAccountingSchema,
    hasVatColumns,
    resetSchemaCache,
    generateJournalId,
    previewJournal,
    normalizeLines,
    findCoveringPeriod,
    findOpenPeriod,
    findEffectiveJournal,
    assertPeriodOpen,
    enqueueChoGhiSo,
    markChoGhiSoDone,
    resolvePostingDates,
    postJournal,
    reverseJournal,
    netMovement,
    n
};
