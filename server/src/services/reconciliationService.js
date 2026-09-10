'use strict';

const { sql } = require('../config/db');
const { generateJournalId, yyMM } = require('./journalEngine');
const { vietnamDateKey } = require('./reportingPeriod');
const { logAuditSafe } = require('./auditLog');
const { ROLE_PERMISSION_CODES } = require('../constants/permissions');
const { isRole } = require('./inboxService');
const {
    STATUS, KT_STATUS, parseStatementCsv, matchStatement, dateKey, roundMoney
} = require('./reconciliationEngine');

const codesOf = (user) => {
    const key = String(user?.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN');
    return ROLE_PERMISSION_CODES[key] || [];
};
const hasUc = (user, code) => codesOf(user).includes(code);

const deny = (message, status = 403) => {
    const error = new Error(message);
    error.status = status;
    throw error;
};

const assertKt = (user) => {
    if (!hasUc(user, 'UC42')) deny('Cần UC42 (sao kê / đối chiếu ngân hàng).');
};

const run = (connection, text) => {
    if (!connection || typeof connection.request !== 'function') {
        throw new Error('Đối soát: thiếu connection SQL.');
    }
    return connection.request().query(text);
};

let schemaReady = false;
let schemaPromise = null;

const ensureReconciliationSchema = async (connection) => {
    if (!connection) return;
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await run(connection, `
            IF COL_LENGTH('dbo.DongSaoKe', 'MaThamChieu') IS NULL
                ALTER TABLE dbo.DongSaoKe ADD MaThamChieu NVARCHAR(80) NULL;`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.KetQuaDoiSoatNganHang', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.KetQuaDoiSoatNganHang (
                    MaKetQua BIGINT IDENTITY(1,1) NOT NULL,
                    MaDong BIGINT NOT NULL,
                    MaSaoKe VARCHAR(20) NOT NULL,
                    TrangThaiGoiY NVARCHAR(30) NOT NULL,
                    TrangThaiKT NVARCHAR(30) NOT NULL CONSTRAINT DF_KQDS_KT DEFAULT N'Chờ xác nhận',
                    DiemKhop INT NOT NULL CONSTRAINT DF_KQDS_Diem DEFAULT 0,
                    LyDo NVARCHAR(500) NULL,
                    LoaiChungTu NVARCHAR(40) NULL,
                    MaChungTu VARCHAR(40) NULL,
                    MaThamChieu NVARCHAR(80) NULL,
                    SoTienSaoKe DECIMAL(18,2) NOT NULL,
                    SoTienChungTu DECIMAL(18,2) NULL,
                    ChenLech DECIMAL(18,2) NULL,
                    TenDoiTac NVARCHAR(150) NULL,
                    MaNV_XacNhan VARCHAR(20) NULL,
                    NgayXacNhan DATETIME NULL,
                    NgayTinh DATETIME NOT NULL CONSTRAINT DF_KQDS_Tinh DEFAULT GETDATE(),
                    CONSTRAINT PK_KetQuaDoiSoatNganHang PRIMARY KEY (MaKetQua),
                    CONSTRAINT UQ_KQDS_MaDong UNIQUE (MaDong),
                    CONSTRAINT CK_KQDS_GoiY CHECK (TrangThaiGoiY IN (N'Khớp tự động', N'Gợi ý', N'Chênh lệch', N'Chưa khớp')),
                    CONSTRAINT CK_KQDS_KT CHECK (TrangThaiKT IN (N'Chờ xác nhận', N'Đã xác nhận', N'Bỏ gợi ý'))
                );
            END`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.KetQuaDoiSoatNganHang', N'U') IS NOT NULL
               AND OBJECT_ID(N'dbo.DongSaoKe', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_KQDS_Dong')
                ALTER TABLE dbo.KetQuaDoiSoatNganHang ADD CONSTRAINT FK_KQDS_Dong
                    FOREIGN KEY (MaDong) REFERENCES dbo.DongSaoKe (MaDong);`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.UngVienDoiSoat', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.UngVienDoiSoat (
                    MaUngVien BIGINT IDENTITY(1,1) NOT NULL,
                    MaDong BIGINT NOT NULL,
                    LoaiChungTu NVARCHAR(40) NOT NULL,
                    MaChungTu VARCHAR(40) NOT NULL,
                    DiemKhop INT NOT NULL,
                    LyDo NVARCHAR(400) NULL,
                    SoTien DECIMAL(18,2) NOT NULL,
                    NgayGD DATE NULL,
                    MaThamChieu NVARCHAR(80) NULL,
                    TenDoiTac NVARCHAR(150) NULL,
                    ChenLech DECIMAL(18,2) NULL,
                    CONSTRAINT PK_UngVienDoiSoat PRIMARY KEY (MaUngVien)
                );
            END`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.UngVienDoiSoat', N'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_UngVienDoiSoat_Dong'
                    AND object_id = OBJECT_ID(N'dbo.UngVienDoiSoat'))
                CREATE INDEX IX_UngVienDoiSoat_Dong ON dbo.UngVienDoiSoat (MaDong);`);
        schemaReady = true;
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

const csvTemplate = () => Buffer.from(
    '\uFEFFNgày,Số tiền,Nội dung,Mã tham chiếu\n'
    + '10/09/2026,85000,"NAPAS MOMO 4088878653 SUPERMARKET FLY",4088878653\n'
    + '10/09/2026,-1500000,"CK PC26090012 thanh toan NCC Rau Sach","PC26090012"\n'
    + '11/09/2026,200000,"Thu QR cung ngay khong ma",\n'
    + '11/09/2026,99000,"MoMo 4088879999 lech tien",4088879999\n'
    + '12/09/2026,45000,"PHI DICH VU THANG 9",\n',
    'utf8'
);

const loadCandidates = async (pool, { tuNgay, denNgay } = {}) => {
    const from = tuNgay || '2000-01-01';
    const to = denNgay || '2099-12-31';
    let momo;
    try {
        momo = await pool.request().input('Tu', sql.Date, from).input('Den', sql.Date, to).query(`
            SELECT N'ThanhToan' LoaiChungTu, tt.MaTT MaChungTu, tt.SoTien,
                   CONVERT(date, COALESCE(tt.NgayXacNhan, tt.NgayTT)) Ngay,
                   tt.MaGiaoDich, COALESCE(tt.MaThamChieuCong, tt.MaGiaoDich) MaThamChieu,
                   N'' TenNCC, N'' MaNCC
            FROM ThanhToan tt
            WHERE tt.TrangThai = N'Thành công'
              AND tt.PhuongThuc = N'QR'
              AND (tt.NguonXacNhan = N'MoMo' OR tt.NguonXacNhan IS NULL)
              AND CONVERT(date, COALESCE(tt.NgayXacNhan, tt.NgayTT)) BETWEEN @Tu AND DATEADD(day, 3, @Den)`);
    } catch (error) {
        if (!/Invalid column name|NguonXacNhan|MaThamChieuCong/i.test(error.message || '')) throw error;
        momo = await pool.request().input('Tu', sql.Date, from).input('Den', sql.Date, to).query(`
            SELECT N'ThanhToan' LoaiChungTu, tt.MaTT MaChungTu, tt.SoTien,
                   CONVERT(date, COALESCE(tt.NgayXacNhan, tt.NgayTT)) Ngay,
                   tt.MaGiaoDich, tt.MaGiaoDich MaThamChieu,
                   N'' TenNCC, N'' MaNCC
            FROM ThanhToan tt
            WHERE tt.TrangThai = N'Thành công'
              AND tt.PhuongThuc = N'QR'
              AND CONVERT(date, COALESCE(tt.NgayXacNhan, tt.NgayTT)) BETWEEN @Tu AND DATEADD(day, 3, @Den)`);
    }
    const chiNcc = await pool.request().input('Tu', sql.Date, from).input('Den', sql.Date, to).query(`
        SELECT N'PhieuChi' LoaiChungTu, pc.MaPhieu MaChungTu, pc.SoTien,
               CONVERT(date, pc.NgayChungTu) Ngay,
               pc.MaGiaoDichNganHang MaGiaoDich,
               COALESCE(pc.MaGiaoDichNganHang, pc.MaPhieu) MaThamChieu,
               ncc.TenNCC, pc.MaNCC
        FROM PhieuChi pc
        JOIN NhaCungCap ncc ON ncc.MaNCC = pc.MaNCC
        WHERE pc.TrangThai = N'Thanh toán thành công'
          AND pc.PhuongThuc = N'Chuyển khoản'
          AND CONVERT(date, pc.NgayChungTu) BETWEEN DATEADD(day, -3, @Tu) AND DATEADD(day, 3, @Den)`);
    let luong = { recordset: [] };
    try {
        luong = await pool.request().input('Tu', sql.Date, from).input('Den', sql.Date, to).query(`
            SELECT N'PhieuChiLuong' LoaiChungTu, pcl.MaPhieu MaChungTu, pcl.SoTien,
                   CONVERT(date, COALESCE(pcl.NgayThanhToan, pcl.NgayLap)) Ngay,
                   pcl.MaGiaoDichNganHang MaGiaoDich,
                   COALESCE(pcl.MaGiaoDichNganHang, pcl.MaPhieu) MaThamChieu,
                   nv.TenNV TenNCC, pcl.MaNV MaNCC
            FROM PhieuChiLuong pcl
            JOIN NhanVien nv ON nv.MaNV = pcl.MaNV
            WHERE pcl.TrangThai = N'Thanh toán thành công'
              AND pcl.PhuongThuc = N'Chuyển khoản'
              AND CONVERT(date, COALESCE(pcl.NgayThanhToan, pcl.NgayLap)) BETWEEN DATEADD(day, -3, @Tu) AND DATEADD(day, 3, @Den)`);
    } catch {
        luong = { recordset: [] };
    }
    const primary = [...momo.recordset, ...chiNcc.recordset, ...luong.recordset];
    const taken = new Set(primary.map((row) => `${row.LoaiChungTu}:${row.MaChungTu}`));
    let journals = { recordset: [] };
    try {
        journals = await pool.request().input('Tu', sql.Date, from).input('Den', sql.Date, to).query(`
            SELECT N'ButToan' LoaiChungTu,
                   CONCAT(bt.MaBT, N'-', ct.SoDong) MaChungTu,
                   CASE WHEN ct.SoTienNo > 0 THEN ct.SoTienNo ELSE -ct.SoTienCo END SoTien,
                   bt.NgayHachToan Ngay,
                   bt.MaChungTu MaGiaoDich,
                   bt.MaChungTu MaThamChieu,
                   bt.DienGiai TenNCC, bt.LoaiChungTu MaNCC
            FROM ChiTietButToan ct
            JOIN ButToan bt ON bt.MaBT = ct.MaBT
            WHERE ct.MaTK = '112'
              AND bt.DaBiDao = 0 AND bt.MaBTGoc IS NULL AND bt.TrangThai = N'DaGhiSo'
              AND bt.NgayHachToan BETWEEN DATEADD(day, -3, @Tu) AND DATEADD(day, 3, @Den)`);
    } catch {
        journals = { recordset: [] };
    }
    const extra = journals.recordset.filter((row) => !taken.has(`${row.MaNCC}:${row.MaGiaoDich}`));
    return [...primary, ...extra].map((row) => ({
        loaiChungTu: row.LoaiChungTu,
        maChungTu: String(row.MaChungTu),
        soTien: roundMoney(row.SoTien),
        ngay: vietnamDateKey(row.Ngay) || dateKey(row.Ngay),
        maGiaoDich: row.MaGiaoDich || '',
        maThamChieu: row.MaThamChieu || row.MaGiaoDich || '',
        tenNCC: row.TenNCC || '',
        maNCC: row.MaNCC || ''
    }));
};

const persistResults = async (transaction, maSaoKe, results, confirmedDong) => {
    const skip = confirmedDong || new Set();
    for (const item of results) {
        const maDong = item.line.maDong;
        if (skip.has(maDong)) continue;
        await new sql.Request(transaction)
            .input('Dong', sql.BigInt, maDong)
            .query('DELETE FROM UngVienDoiSoat WHERE MaDong=@Dong');
        const exists = await new sql.Request(transaction)
            .input('Dong', sql.BigInt, maDong)
            .query('SELECT MaKetQua FROM KetQuaDoiSoatNganHang WHERE MaDong=@Dong');
        const req = new sql.Request(transaction)
            .input('Dong', sql.BigInt, maDong)
            .input('Sk', sql.VarChar, maSaoKe)
            .input('GoiY', sql.NVarChar, item.trangThai)
            .input('Diem', sql.Int, item.diemKhop)
            .input('LyDo', sql.NVarChar, item.lyDo)
            .input('Loai', sql.NVarChar, item.loaiChungTu)
            .input('Ma', sql.VarChar, item.maChungTu)
            .input('Ref', sql.NVarChar, item.maThamChieu)
            .input('TienSk', sql.Decimal(18, 2), item.soTienSaoKe)
            .input('TienCt', sql.Decimal(18, 2), item.soTienChungTu)
            .input('Lech', sql.Decimal(18, 2), item.chenLech)
            .input('DoiTac', sql.NVarChar, item.tenDoiTac || null);
        if (exists.recordset.length) {
            await req.query(`
                UPDATE KetQuaDoiSoatNganHang
                SET TrangThaiGoiY=@GoiY, TrangThaiKT=N'Chờ xác nhận', DiemKhop=@Diem, LyDo=@LyDo,
                    LoaiChungTu=@Loai, MaChungTu=@Ma, MaThamChieu=@Ref,
                    SoTienSaoKe=@TienSk, SoTienChungTu=@TienCt, ChenLech=@Lech,
                    TenDoiTac=@DoiTac, MaNV_XacNhan=NULL, NgayXacNhan=NULL, NgayTinh=GETDATE()
                WHERE MaDong=@Dong AND TrangThaiKT<>N'Đã xác nhận'`);
        } else {
            await req.query(`
                INSERT INTO KetQuaDoiSoatNganHang
                    (MaDong,MaSaoKe,TrangThaiGoiY,TrangThaiKT,DiemKhop,LyDo,LoaiChungTu,MaChungTu,
                     MaThamChieu,SoTienSaoKe,SoTienChungTu,ChenLech,TenDoiTac)
                VALUES (@Dong,@Sk,@GoiY,N'Chờ xác nhận',@Diem,@LyDo,@Loai,@Ma,
                        @Ref,@TienSk,@TienCt,@Lech,@DoiTac)`);
        }
        for (const ung of item.ungVien || []) {
            await new sql.Request(transaction)
                .input('Dong', sql.BigInt, maDong)
                .input('Loai', sql.NVarChar, ung.loaiChungTu)
                .input('Ma', sql.VarChar, ung.maChungTu)
                .input('Diem', sql.Int, ung.diemKhop)
                .input('LyDo', sql.NVarChar, ung.lyDo)
                .input('Tien', sql.Decimal(18, 2), ung.soTien)
                .input('Ngay', sql.Date, ung.ngay || null)
                .input('Ref', sql.NVarChar, ung.maThamChieu)
                .input('DoiTac', sql.NVarChar, ung.tenDoiTac || null)
                .input('Lech', sql.Decimal(18, 2), ung.chenLech)
                .query(`INSERT INTO UngVienDoiSoat
                    (MaDong,LoaiChungTu,MaChungTu,DiemKhop,LyDo,SoTien,NgayGD,MaThamChieu,TenDoiTac,ChenLech)
                    VALUES (@Dong,@Loai,@Ma,@Diem,@LyDo,@Tien,@Ngay,@Ref,@DoiTac,@Lech)`);
        }
    }
};

const runEngineOnStatement = async (pool, user, maSaoKe) => {
    await ensureReconciliationSchema(pool);
    const header = await pool.request().input('Id', sql.VarChar, maSaoKe)
        .query('SELECT * FROM SaoKeNganHang WHERE MaSaoKe=@Id');
    if (!header.recordset.length) deny('Không tìm thấy sao kê.', 404);
    const linesRes = await pool.request().input('Id', sql.VarChar, maSaoKe)
        .query('SELECT * FROM DongSaoKe WHERE MaSaoKe=@Id ORDER BY NgayGD, MaDong');
    const confirmed = await pool.request().input('Id', sql.VarChar, maSaoKe).query(`
        SELECT MaDong FROM KetQuaDoiSoatNganHang
        WHERE MaSaoKe=@Id AND TrangThaiKT=N'Đã xác nhận'`);
    const skip = new Set(confirmed.recordset.map((row) => Number(row.MaDong)));
    const tu = vietnamDateKey(header.recordset[0].TuNgay) || dateKey(header.recordset[0].TuNgay);
    const den = vietnamDateKey(header.recordset[0].DenNgay) || dateKey(header.recordset[0].DenNgay);
    const candidates = await loadCandidates(pool, { tuNgay: tu, denNgay: den });
    const pendingLines = linesRes.recordset.filter((row) => !skip.has(Number(row.MaDong)));
    const engineLines = pendingLines.map((row) => ({
        maDong: Number(row.MaDong),
        ngay: vietnamDateKey(row.NgayGD) || dateKey(row.NgayGD),
        soTien: roundMoney(row.SoTien),
        noiDung: row.DienGiai || '',
        maThamChieu: row.MaThamChieu || row.MaGiaoDich || ''
    }));
    const results = matchStatement(engineLines, candidates);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        await persistResults(transaction, maSaoKe, results, skip);
        await logAuditSafe(transaction, {
            user, action: 'Chạy đối soát ngân hàng thông minh', table: 'SaoKeNganHang',
            recordId: maSaoKe, uc: 'UC42',
            content: `Engine rule (không LLM) · ${results.length} dòng chờ · ${maSaoKe}`
        });
        await transaction.commit();
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
    return { MaSaoKe: maSaoKe, soDong: results.length, ketQua: summarizeLocal(results) };
};

const summarizeLocal = (results) => {
    const counts = {
        [STATUS.AUTO]: 0,
        [STATUS.SUGGESTED]: 0,
        [STATUS.DIFFERENCE]: 0,
        [STATUS.UNMATCHED]: 0
    };
    for (const row of results) counts[row.trangThai] = (counts[row.trangThai] || 0) + 1;
    return counts;
};

const importStatementCsv = async (pool, user, { buffer, originalname, maTKNH, tuNgay, denNgay }) => {
    assertKt(user);
    await ensureReconciliationSchema(pool);
    const rows = parseStatementCsv(buffer);
    if (!rows.length) deny('CSV không có dòng dữ liệu.', 400);
    let tk = String(maTKNH || '').trim();
    if (!tk) {
        const active = await pool.request().query(`SELECT TOP 1 MaTKNH FROM TaiKhoanNganHang WHERE TrangThai=N'Su dung'`);
        tk = active.recordset[0]?.MaTKNH || '';
    }
    if (!tk) deny('Chưa có tài khoản ngân hàng đang sử dụng. Thêm TKNH (UC42) trước khi nhập CSV.', 400);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const MaSaoKe = await generateJournalId(transaction, 'SaoKeNganHang', 'MaSaoKe', `SK${yyMM()}`, 4);
        await new sql.Request(transaction)
            .input('Ma', sql.VarChar, MaSaoKe).input('TK', sql.VarChar, tk)
            .input('Tu', sql.Date, tuNgay || rows[0].ngay)
            .input('Den', sql.Date, denNgay || rows[rows.length - 1].ngay)
            .input('Ten', sql.NVarChar, originalname || 'sao-ke.csv')
            .input('NV', sql.VarChar, user.MaNV)
            .query(`INSERT INTO SaoKeNganHang (MaSaoKe,MaTKNH,TuNgay,DenNgay,TenFile,MaNV_Import)
                    VALUES (@Ma,@TK,@Tu,@Den,@Ten,@NV)`);
        for (const row of rows) {
            await new sql.Request(transaction)
                .input('Ma', sql.VarChar, MaSaoKe)
                .input('Ngay', sql.Date, row.ngay)
                .input('Tien', sql.Decimal(18, 2), row.soTien)
                .input('No', sql.Decimal(18, 2), row.phatSinhNo)
                .input('Co', sql.Decimal(18, 2), row.phatSinhCo)
                .input('DG', sql.NVarChar, row.noiDung || null)
                .input('GD', sql.VarChar, row.maThamChieu || null)
                .input('Ref', sql.NVarChar, row.maThamChieu || null)
                .query(`INSERT INTO DongSaoKe (MaSaoKe,NgayGD,SoTien,PhatSinhNo,PhatSinhCo,DienGiai,MaGiaoDich,MaThamChieu)
                        VALUES (@Ma,@Ngay,@Tien,@No,@Co,@DG,@GD,@Ref)`);
        }
        await logAuditSafe(transaction, {
            user, action: 'Nhập sao kê đối soát thông minh', table: 'SaoKeNganHang',
            recordId: MaSaoKe, uc: 'UC42',
            content: `Nhập ${MaSaoKe} · ${rows.length} dòng · ${originalname || 'csv'} · không tự ghi sổ`
        });
        await transaction.commit();
        await runEngineOnStatement(pool, user, MaSaoKe);
        return { MaSaoKe, soDong: rows.length };
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
};

const listStatements = async (pool, user) => {
    assertKt(user);
    await ensureReconciliationSchema(pool);
    const rows = await pool.request().query(`
        SELECT sk.*,
               (SELECT COUNT(*) FROM DongSaoKe d WHERE d.MaSaoKe=sk.MaSaoKe) SoDong,
               (SELECT COUNT(*) FROM KetQuaDoiSoatNganHang k
                 WHERE k.MaSaoKe=sk.MaSaoKe AND k.TrangThaiKT=N'Chờ xác nhận') ChoXacNhan,
               (SELECT COUNT(*) FROM KetQuaDoiSoatNganHang k
                 WHERE k.MaSaoKe=sk.MaSaoKe AND k.TrangThaiKT=N'Đã xác nhận') DaXacNhan
        FROM SaoKeNganHang sk
        ORDER BY sk.NgayImport DESC`);
    return { items: rows.recordset };
};

const getStatementDetail = async (pool, user, maSaoKe, { trangThai, search } = {}) => {
    assertKt(user);
    await ensureReconciliationSchema(pool);
    const header = await pool.request().input('Id', sql.VarChar, maSaoKe)
        .query('SELECT * FROM SaoKeNganHang WHERE MaSaoKe=@Id');
    if (!header.recordset.length) deny('Không tìm thấy sao kê.', 404);
    const lines = await pool.request().input('Id', sql.VarChar, maSaoKe).query(`
        SELECT d.*, k.MaKetQua, k.TrangThaiGoiY, k.TrangThaiKT, k.DiemKhop, k.LyDo,
               k.LoaiChungTu LoaiGoiY, k.MaChungTu MaGoiY, k.MaThamChieu MaThamChieuKq,
               k.SoTienSaoKe, k.SoTienChungTu, k.ChenLech, k.TenDoiTac, k.NgayXacNhan
        FROM DongSaoKe d
        LEFT JOIN KetQuaDoiSoatNganHang k ON k.MaDong = d.MaDong
        WHERE d.MaSaoKe=@Id
        ORDER BY d.NgayGD, d.MaDong`);
    const ung = await pool.request().input('Id', sql.VarChar, maSaoKe).query(`
        SELECT u.* FROM UngVienDoiSoat u
        JOIN DongSaoKe d ON d.MaDong=u.MaDong
        WHERE d.MaSaoKe=@Id
        ORDER BY u.MaDong, u.DiemKhop DESC`);
    const byDong = new Map();
    for (const row of ung.recordset) {
        const list = byDong.get(Number(row.MaDong)) || [];
        list.push(row);
        byDong.set(Number(row.MaDong), list);
    }
    const q = String(search || '').trim().toLowerCase();
    const filter = String(trangThai || '').trim();
    const mapped = lines.recordset.map((row) => ({
        ...row,
        ungVien: byDong.get(Number(row.MaDong)) || []
    })).filter((row) => {
        if (filter && row.TrangThaiGoiY !== filter && row.TrangThaiKT !== filter) return false;
        if (!q) return true;
        const blob = `${row.DienGiai || ''} ${row.MaGiaoDich || ''} ${row.MaThamChieu || ''} ${row.MaGoiY || ''}`.toLowerCase();
        return blob.includes(q);
    });
    const counts = {
        tong: lines.recordset.length,
        choXacNhan: 0,
        daXacNhan: 0,
        auto: 0,
        goiY: 0,
        chenhLech: 0,
        chuaKhop: 0,
        tongTienChuaXacNhan: 0
    };
    for (const row of lines.recordset) {
        if (row.TrangThaiKT === KT_STATUS.CONFIRMED) counts.daXacNhan += 1;
        else {
            counts.choXacNhan += 1;
            counts.tongTienChuaXacNhan += Math.abs(nSafe(row.SoTien));
        }
        if (row.TrangThaiGoiY === STATUS.AUTO) counts.auto += 1;
        if (row.TrangThaiGoiY === STATUS.SUGGESTED) counts.goiY += 1;
        if (row.TrangThaiGoiY === STATUS.DIFFERENCE) counts.chenhLech += 1;
        if (row.TrangThaiGoiY === STATUS.UNMATCHED || !row.TrangThaiGoiY) counts.chuaKhop += 1;
    }
    return { statement: header.recordset[0], lines: mapped, counts };
};

const nSafe = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const confirmLine = async (pool, user, maDong, body = {}) => {
    assertKt(user);
    await ensureReconciliationSchema(pool);
    const dong = Number(maDong);
    const current = await pool.request().input('Dong', sql.BigInt, dong).query(`
        SELECT d.*, k.MaKetQua, k.TrangThaiGoiY, k.LoaiChungTu, k.MaChungTu, k.ChenLech, k.SoTienChungTu
        FROM DongSaoKe d
        LEFT JOIN KetQuaDoiSoatNganHang k ON k.MaDong=d.MaDong
        WHERE d.MaDong=@Dong`);
    if (!current.recordset.length) deny('Không tìm thấy dòng sao kê.', 404);
    const row = current.recordset[0];
    let loai = String(body.LoaiChungTu || row.LoaiChungTu || '').trim();
    let ma = String(body.MaChungTu || row.MaChungTu || '').trim();
    if (body.MaUngVien) {
        const pick = await pool.request()
            .input('Id', sql.BigInt, Number(body.MaUngVien))
            .input('Dong', sql.BigInt, dong)
            .query('SELECT * FROM UngVienDoiSoat WHERE MaUngVien=@Id AND MaDong=@Dong');
        if (!pick.recordset.length) deny('Ứng viên không thuộc dòng này.', 400);
        loai = pick.recordset[0].LoaiChungTu;
        ma = pick.recordset[0].MaChungTu;
    }
    const khopStatus = row.TrangThaiGoiY === STATUS.DIFFERENCE ? 'Chenh lech' : 'Khop thu cong';
    const ghiChu = row.TrangThaiGoiY === STATUS.DIFFERENCE
        ? `KT xác nhận chênh lệch. Sao kê ${row.SoTien} / chứng từ ${row.SoTienChungTu}`
        : `KT xác nhận đối soát ${loai || ''} ${ma || ''}`.trim();
    await pool.request()
        .input('Dong', sql.BigInt, dong)
        .input('Loai', sql.NVarChar, loai || null)
        .input('Ma', sql.VarChar, ma || null)
        .input('NV', sql.VarChar, user.MaNV)
        .input('Khop', sql.NVarChar, khopStatus)
        .input('Chu', sql.NVarChar, ghiChu)
        .query(`
            UPDATE KetQuaDoiSoatNganHang
            SET TrangThaiKT=N'Đã xác nhận', LoaiChungTu=COALESCE(@Loai, LoaiChungTu),
                MaChungTu=COALESCE(@Ma, MaChungTu), MaNV_XacNhan=@NV, NgayXacNhan=GETDATE()
            WHERE MaDong=@Dong;
            UPDATE DongSaoKe
            SET TrangThaiKhop=@Khop, LoaiChungTuKhop=@Loai, MaChungTuKhop=@Ma, GhiChuKhop=@Chu
            WHERE MaDong=@Dong`);
    await logAuditSafe(pool, {
        user, action: 'Xác nhận đối soát ngân hàng', table: 'DongSaoKe',
        recordId: String(dong), uc: 'UC42',
        content: `Xác nhận dòng ${dong} · ${loai} ${ma} · không postJournal`
    });
    return { message: 'Đã xác nhận đối soát. Engine không ghi sổ.', MaDong: dong };
};

const rejectLine = async (pool, user, maDong) => {
    assertKt(user);
    await ensureReconciliationSchema(pool);
    const dong = Number(maDong);
    await pool.request().input('Dong', sql.BigInt, dong).query(`
        UPDATE KetQuaDoiSoatNganHang SET TrangThaiKT=N'Bỏ gợi ý', MaNV_XacNhan=NULL, NgayXacNhan=NULL
        WHERE MaDong=@Dong;
        UPDATE DongSaoKe SET TrangThaiKhop=N'Chua khop', LoaiChungTuKhop=NULL, MaChungTuKhop=NULL, GhiChuKhop=N'KT bỏ gợi ý'
        WHERE MaDong=@Dong`);
    await logAuditSafe(pool, {
        user, action: 'Bỏ gợi ý đối soát ngân hàng', table: 'DongSaoKe',
        recordId: String(dong), uc: 'UC42',
        content: `Bỏ gợi ý dòng ${dong}`
    });
    return { message: 'Đã bỏ gợi ý. Dòng trở lại chưa khớp.', MaDong: dong };
};

const confirmAutoBatch = async (pool, user, maSaoKe) => {
    assertKt(user);
    await ensureReconciliationSchema(pool);
    const rows = await pool.request().input('Id', sql.VarChar, maSaoKe).query(`
        SELECT MaDong FROM KetQuaDoiSoatNganHang
        WHERE MaSaoKe=@Id AND TrangThaiGoiY=N'Khớp tự động' AND TrangThaiKT=N'Chờ xác nhận'`);
    let count = 0;
    for (const row of rows.recordset) {
        await confirmLine(pool, user, row.MaDong, {});
        count += 1;
    }
    return { message: `Đã xác nhận hàng loạt ${count} dòng khớp tự động. Không ghi sổ.`, soDong: count };
};

const loadReconciliationSummary = async (pool, user) => {
    await ensureReconciliationSchema(pool);
    const isKt = hasUc(user, 'UC42');
    const isQl = isRole(user, 'Quản lý') && hasUc(user, 'UC10');
    if (!isKt && !isQl) return { skipped: true, reason: 'Không có UC42/UC10 đối soát.' };
    let counts = { recordset: [{ ChoXacNhan: 0, TongTien: 0, GoiY: 0, Auto: 0, Chenh: 0, Chua: 0 }] };
    try {
        counts = await pool.request().query(`
            SELECT
              SUM(CASE WHEN k.TrangThaiKT=N'Chờ xác nhận' OR k.MaKetQua IS NULL THEN 1 ELSE 0 END) ChoXacNhan,
              COALESCE(SUM(CASE WHEN k.TrangThaiKT=N'Chờ xác nhận' OR k.MaKetQua IS NULL THEN ABS(d.SoTien) ELSE 0 END),0) TongTien,
              SUM(CASE WHEN k.TrangThaiGoiY=N'Gợi ý' AND k.TrangThaiKT=N'Chờ xác nhận' THEN 1 ELSE 0 END) GoiY,
              SUM(CASE WHEN k.TrangThaiGoiY=N'Khớp tự động' AND k.TrangThaiKT=N'Chờ xác nhận' THEN 1 ELSE 0 END) Auto,
              SUM(CASE WHEN k.TrangThaiGoiY=N'Chênh lệch' THEN 1 ELSE 0 END) Chenh,
              SUM(CASE WHEN k.TrangThaiGoiY=N'Chưa khớp' OR k.MaKetQua IS NULL THEN 1 ELSE 0 END) Chua
            FROM DongSaoKe d
            LEFT JOIN KetQuaDoiSoatNganHang k ON k.MaDong=d.MaDong`);
    } catch {
        return { skipped: true, reason: 'Chưa có bảng đối soát.' };
    }
    const row = counts.recordset[0] || {};
    const summary = {
        soDongChuaDoiSoat: nSafe(row.ChoXacNhan),
        tongTienChuaDoiSoat: nSafe(row.TongTien),
        soDongGoiY: nSafe(row.GoiY),
        soDongAutoChoXacNhan: nSafe(row.Auto),
        soDongChenhLech: nSafe(row.Chenh),
        soDongChuaKhop: nSafe(row.Chua)
    };
    if (isQl && !isKt) {
        return { scope: 'ql', ...summary };
    }
    return { scope: 'kt', ...summary };
};

module.exports = {
    ensureReconciliationSchema,
    csvTemplate,
    importStatementCsv,
    runEngineOnStatement,
    listStatements,
    getStatementDetail,
    confirmLine,
    rejectLine,
    confirmAutoBatch,
    loadReconciliationSummary,
    loadCandidates
};
