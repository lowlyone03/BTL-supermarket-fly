const { sql, poolPromise } = require('../config/db');
const { logAudit } = require('../services/auditLog');
const { ensurePayrollSchema } = require('../services/payrollSchema');
const { dateKey, loadRates, loadHolidays, validateLunarCalendar } = require('../services/payrollEngine');

const FIXED_DATES = [
    { md: '01-01', ten: 'Tết Dương lịch', nhom: 'TetDuongLich' },
    { md: '04-30', ten: 'Ngày Chiến thắng', nhom: 'ChienThang' },
    { md: '05-01', ten: 'Ngày Quốc tế Lao động', nhom: 'LaoDong' },
    { md: '09-02', ten: 'Quốc khánh', nhom: 'QuocKhanh' }
];

const seedFixedHolidays = async (connection, year) => {
    for (const item of FIXED_DATES) {
        const ngay = `${year}-${item.md}`;
        await new sql.Request(connection)
            .input('Nam', sql.Int, year).input('Ngay', sql.Date, ngay)
            .input('TenLe', sql.NVarChar, item.ten).input('NhomLe', sql.NVarChar, item.nhom)
            .query(`IF NOT EXISTS (SELECT 1 FROM NgayLeNam WHERE Nam=@Nam AND NgayDuongLich=@Ngay)
                INSERT NgayLeNam(Nam,NgayDuongLich,TenLe,NhomLe,Nguon,GhiChu)
                VALUES(@Nam,@Ngay,@TenLe,@NhomLe,N'CoDinh',N'Cố định theo Điều 112 BLLĐ 2019')`);
    }
};

const getHolidays = async (req, res) => {
    try {
        const year = Number(req.params.year);
        if (!Number.isInteger(year) || year < 2020 || year > 2100) {
            return res.status(400).json({ message: 'Năm lịch lễ không hợp lệ.' });
        }
        const pool = await poolPromise;
        await ensurePayrollSchema(pool);
        await seedFixedHolidays(pool, year);
        const [items, rates] = await Promise.all([loadHolidays(pool, year), loadRates(pool)]);
        const lunarError = validateLunarCalendar(items);
        res.json({
            year,
            items,
            rates: rates.rows,
            lunarError,
            note: year === 2026
                ? 'Tết âm 2026 đã seed theo Thông báo 9441/BNV (16–20/02). Giỗ Tổ seed 26/04/2026 (10/03 âm). Quản lý vẫn sửa được ngày âm lịch nếu lệch.'
                : 'Ngày cố định (01/01, 30/04, 01/05, 02/09) đã có. Quản lý phải nhập 5 ngày Tết âm, Giỗ Tổ và chọn ngày liền kề 02/09.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Không thể tải lịch ngày lễ.' });
    }
};

const dateLocked = async (connection, ngay) => {
    const result = await new sql.Request(connection).input('Ngay', sql.Date, ngay).query(`
        SELECT TOP 1 1 AS Locked
        FROM KyLuong k
        WHERE k.TrangThai IN (N'Đã khóa', N'Đã thanh toán') AND @Ngay BETWEEN k.TuNgay AND k.DenNgay
        UNION ALL
        SELECT TOP 1 1 FROM NgayLeNam WHERE NgayDuongLich=@Ngay AND NgayKhoa IS NOT NULL`);
    return Boolean(result.recordset[0]);
};

const saveHolidays = async (req, res) => {
    const year = Number(req.params.year);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
        return res.status(400).json({ message: 'Năm lịch lễ không hợp lệ.' });
    }
    const tetAm = Array.isArray(req.body.tetAm) ? req.body.tetAm.map(value => String(value).slice(0, 10)) : [];
    const gioTo = String(req.body.gioTo || '').slice(0, 10);
    const quocKhanhLienKe = String(req.body.quocKhanhLienKe || '').slice(0, 10);
    const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && value.startsWith(`${year}-`);
    if (tetAm.length !== 5 || tetAm.some(day => !valid(day))) {
        return res.status(400).json({ message: 'Cần nhập đúng 5 ngày dương lịch Tết Âm lịch trong năm đang sửa.' });
    }
    if (new Set(tetAm).size !== 5) return res.status(400).json({ message: 'Năm ngày Tết Âm lịch không được trùng nhau.' });
    if (!valid(gioTo)) return res.status(400).json({ message: 'Ngày Giỗ Tổ Hùng Vương (dương lịch) không hợp lệ.' });
    if (!['01', '03'].includes(quocKhanhLienKe.slice(8)) || !quocKhanhLienKe.startsWith(`${year}-09-`)) {
        return res.status(400).json({ message: 'Ngày liền kề Quốc khánh chỉ được chọn 01/09 hoặc 03/09 của năm đó.' });
    }
    const pool = await poolPromise;
    await ensurePayrollSchema(pool);
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const nextDates = new Set([...tetAm, gioTo, quocKhanhLienKe]);
        const existing = await loadHolidays(transaction, year);
        const editable = existing.filter(row => row.Nguon !== 'CoDinh');
        for (const row of editable) {
            const day = dateKey(row.NgayDuongLich);
            if (nextDates.has(day)) continue;
            if (await dateLocked(transaction, day)) {
                throw new Error(`Không bỏ được ${day} (${row.TenLe}): kỳ lương chứa ngày này đã khóa.`);
            }
        }
        if (await dateLocked(transaction, quocKhanhLienKe) && !existing.some(row => dateKey(row.NgayDuongLich) === quocKhanhLienKe)) {
            throw new Error('Ngày liền kề Quốc khánh mới thuộc kỳ lương đã khóa, không thêm được.');
        }
        await new sql.Request(transaction).input('Nam', sql.Int, year).query(`
            DELETE n FROM NgayLeNam n
            WHERE n.Nam=@Nam AND n.Nguon IN (N'AmLich', N'QuocKhanhLienKe') AND n.NgayKhoa IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM KyLuong k
                  WHERE k.TrangThai IN (N'Đã khóa', N'Đã thanh toán')
                    AND n.NgayDuongLich BETWEEN k.TuNgay AND k.DenNgay
              )`);
        const rows = [
            ...tetAm.sort().map((ngay, index) => ({
                ngay,
                ten: index === 0 ? `Tết Âm lịch — ngày ${index + 1}/5` : `Tết Âm lịch — ngày ${index + 1}/5`,
                nhom: 'TetAmLich',
                nguon: 'AmLich'
            })),
            { ngay: gioTo, ten: 'Giỗ Tổ Hùng Vương (10/03 âm)', nhom: 'GioTo', nguon: 'AmLich' },
            { ngay: quocKhanhLienKe, ten: 'Quốc khánh — ngày liền kề', nhom: 'QuocKhanhLienKe', nguon: 'QuocKhanhLienKe' }
        ];
        for (const row of rows) {
            await new sql.Request(transaction)
                .input('Nam', sql.Int, year).input('Ngay', sql.Date, row.ngay)
                .input('TenLe', sql.NVarChar, row.ten).input('NhomLe', sql.NVarChar, row.nhom)
                .input('Nguon', sql.NVarChar, row.nguon).input('MaNV', sql.VarChar, req.user.MaNV)
                .query(`
                    MERGE NgayLeNam target USING (SELECT @Nam Nam, @Ngay Ngay) source
                    ON target.Nam=source.Nam AND target.NgayDuongLich=source.Ngay
                    WHEN MATCHED THEN UPDATE SET TenLe=@TenLe,NhomLe=@NhomLe,Nguon=@Nguon,
                        NguoiCapNhat=@MaNV,NgayCapNhat=GETDATE()
                    WHEN NOT MATCHED THEN INSERT (Nam,NgayDuongLich,TenLe,NhomLe,Nguon,NguoiCapNhat)
                        VALUES(@Nam,@Ngay,@TenLe,@NhomLe,@Nguon,@MaNV);`);
        }
        await logAudit(transaction, {
            user: req.user, req, action: 'Cập nhật lịch ngày lễ năm', table: 'NgayLeNam',
            recordId: String(year), uc: 'UC30', severity: 'Quan trọng',
            content: `Năm ${year}: Tết âm ${tetAm.join(', ')}; Giỗ Tổ ${gioTo}; liền kề 02/09 = ${quocKhanhLienKe}.`
        });
        await transaction.commit();
        const items = await loadHolidays(pool, year);
        res.json({ message: `Đã lưu lịch lễ năm ${year}.`, year, items });
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        res.status(400).json({ message: error.message });
    }
};

const saveRates = async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ message: 'Chưa có hệ số để lưu.' });
    const pool = await poolPromise;
    await ensurePayrollSchema(pool);
    try {
        for (const item of items) {
            const heso = Number(item.HeSo);
            if (!item.MaHeSo || !Number.isFinite(heso)) throw new Error('Hệ số không hợp lệ.');
            const current = await pool.request().input('MaHeSo', sql.VarChar, item.MaHeSo)
                .query('SELECT MinHeSo FROM HeSoLuongNgay WHERE MaHeSo=@MaHeSo');
            if (!current.recordset.length) throw new Error(`Không tìm thấy hệ số ${item.MaHeSo}.`);
            if (heso + 1e-9 < Number(current.recordset[0].MinHeSo)) {
                throw new Error(`Hệ số ${item.MaHeSo} không được thấp hơn mức tối thiểu luật (${current.recordset[0].MinHeSo}).`);
            }
            await pool.request().input('MaHeSo', sql.VarChar, item.MaHeSo)
                .input('HeSo', sql.Decimal(5, 2), heso)
                .query('UPDATE HeSoLuongNgay SET HeSo=@HeSo WHERE MaHeSo=@MaHeSo');
        }
        await logAudit(pool, {
            user: req.user, req, action: 'Cập nhật hệ số lương ngày', table: 'HeSoLuongNgay',
            recordId: 'HeSoLuongNgay', uc: 'UC30', severity: 'Cảnh báo',
            content: 'Quản lý đã chỉnh hệ số lương ngày (không thấp hơn mức BLLĐ 2019 / NĐ 145).'
        });
        const rates = await loadRates(pool);
        res.json({ message: 'Đã lưu hệ số lương ngày.', rates: rates.rows });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = { getHolidays, saveHolidays, saveRates, seedFixedHolidays };
