const { sql } = require('../config/db');
const { notifyInboxChanged } = require('./notificationHub');
const { logAudit } = require('./auditLog');
const { compactSnapshot } = require('./warehouseReportSnapshot');
const { formatPeriodLabel } = require('./reportingPeriod');

const ensureWarehouseReportSubmitSchema = async (pool) => {
    await pool.request().query(`
        IF OBJECT_ID(N'dbo.BaoCaoKhoNop', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.BaoCaoKhoNop (
                MaBC VARCHAR(30) NOT NULL CONSTRAINT PK_BaoCaoKhoNop PRIMARY KEY,
                LoaiKy NVARCHAR(20) NOT NULL,
                GiaTriKy VARCHAR(20) NOT NULL,
                TuNgay DATE NOT NULL,
                DenNgay DATE NOT NULL,
                NhanKy NVARCHAR(120) NOT NULL,
                MaNV_Lap VARCHAR(20) NOT NULL,
                TenNV_Lap NVARCHAR(100) NOT NULL,
                NgayNop DATETIME NOT NULL CONSTRAINT DF_BaoCaoKhoNop_NgayNop DEFAULT GETDATE(),
                TrangThai NVARCHAR(30) NOT NULL CONSTRAINT DF_BaoCaoKhoNop_TT DEFAULT N'Đã gửi',
                GhiChu NVARCHAR(300) NULL,
                NoiDung NVARCHAR(MAX) NOT NULL,
                CONSTRAINT FK_BaoCaoKhoNop_NV FOREIGN KEY (MaNV_Lap) REFERENCES dbo.NhanVien(MaNV)
            );
            CREATE INDEX IX_BaoCaoKhoNop_Ky ON dbo.BaoCaoKhoNop (LoaiKy, GiaTriKy, NgayNop DESC);
            CREATE INDEX IX_BaoCaoKhoNop_NV ON dbo.BaoCaoKhoNop (MaNV_Lap, NgayNop DESC);
        END
        UPDATE dbo.BaoCaoKhoNop
        SET NhanKy = N'Tháng ' + RIGHT(GiaTriKy, 2) + N'/' + LEFT(GiaTriKy, 4)
        WHERE LoaiKy IN (N'month', N'tháng', N'Tháng')
          AND GiaTriKy LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
          AND NhanKy <> N'Tháng ' + RIGHT(GiaTriKy, 2) + N'/' + LEFT(GiaTriKy, 4);`);
};

const datePrefix = prefix => {
    const now = new Date();
    return `${prefix}${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
};

const nextId = async (transaction) => {
    const prefix = datePrefix('BCK');
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${prefix}%`)
        .query(`SELECT TOP 1 MaBC Id FROM BaoCaoKhoNop WITH (UPDLOCK, HOLDLOCK)
                WHERE MaBC LIKE @Prefix ORDER BY MaBC DESC`);
    const last = result.recordset[0]?.Id;
    const sequence = last ? Number(last.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(sequence).padStart(3, '0')}`;
};

const notifyManagers = async (pool, { user, maBC, label }) => {
    const recipients = await pool.request().query(`
        SELECT nv.MaNV
        FROM NhanVien nv
        JOIN TaiKhoan tk ON tk.MaNV=nv.MaNV
        JOIN VaiTro vt ON vt.MaVaiTro=tk.MaVaiTro
        WHERE vt.TenVaiTro=N'Quản lý'
          AND tk.TrangThai=1
          AND ISNULL(nv.TrangThai, N'Đang làm việc')=N'Đang làm việc'`);
    const title = `Báo cáo Thủ kho ${label} · ${maBC}`;
    const detail = `${user.TenNV || 'Thủ kho'} đã gửi ${maBC}. Đây là báo cáo Thủ kho, không phải báo cáo tổng cửa hàng. Mở menu Báo cáo Thủ kho để xem.`;
    for (const person of recipients.recordset) {
        await pool.request()
            .input('MaNVNhan', sql.VarChar, person.MaNV)
            .input('TieuDe', sql.NVarChar, title.slice(0, 200))
            .input('NoiDung', sql.NVarChar, detail.slice(0, 1000))
            .input('MaNVGui', sql.VarChar, user.MaNV)
            .input('TenGui', sql.NVarChar, user.TenNV || 'Thủ kho')
            .input('DichDen', sql.NVarChar, 'admin-warehouse-reports')
            .query(`
                INSERT ThongBaoCuaHang (MaNV_Nhan, TieuDe, NoiDung, MaNV_Gui, TenNV_Gui, DichDen, MucDo)
                VALUES (@MaNVNhan, @TieuDe, @NoiDung, @MaNVGui, @TenGui, @DichDen, N'Thông tin')`);
    }
    return recipients.recordset.length;
};

const submitWarehouseReport = async (pool, user, report, note = '') => {
    await ensureWarehouseReportSubmitSchema(pool);
    const snapshot = compactSnapshot(report);
    const period = snapshot.period;
    if (!period?.periodType || !period.period || !period.from || !period.to) {
        throw new Error('Chưa có kỳ báo cáo để gửi. Hãy lập báo cáo trước.');
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const existing = await new sql.Request(transaction)
            .input('LoaiKy', sql.NVarChar, period.periodType)
            .input('GiaTriKy', sql.VarChar, period.period)
            .input('MaNV', sql.VarChar, user.MaNV)
            .query(`SELECT TOP 1 MaBC FROM BaoCaoKhoNop WITH (UPDLOCK, HOLDLOCK)
                    WHERE LoaiKy=@LoaiKy AND GiaTriKy=@GiaTriKy AND MaNV_Lap=@MaNV`);
        const payload = JSON.stringify(snapshot);
        let maBC = existing.recordset[0]?.MaBC;
        const replaced = Boolean(maBC);
        const nhanKy = formatPeriodLabel(period.periodType, period.period, period.label);
        if (maBC) {
            await new sql.Request(transaction)
                .input('MaBC', sql.VarChar, maBC)
                .input('NhanKy', sql.NVarChar, nhanKy)
                .input('TuNgay', sql.Date, period.from)
                .input('DenNgay', sql.Date, period.to)
                .input('TenNV', sql.NVarChar, user.TenNV || 'Thủ kho')
                .input('GhiChu', sql.NVarChar, String(note || '').trim().slice(0, 300) || null)
                .input('NoiDung', sql.NVarChar, payload)
                .query(`UPDATE BaoCaoKhoNop
                        SET NhanKy=@NhanKy, TuNgay=@TuNgay, DenNgay=@DenNgay, TenNV_Lap=@TenNV,
                            NgayNop=GETDATE(), GhiChu=@GhiChu, NoiDung=@NoiDung, TrangThai=N'Đã gửi'
                        WHERE MaBC=@MaBC`);
        } else {
            maBC = await nextId(transaction);
            await new sql.Request(transaction)
                .input('MaBC', sql.VarChar, maBC)
                .input('LoaiKy', sql.NVarChar, period.periodType)
                .input('GiaTriKy', sql.VarChar, period.period)
                .input('TuNgay', sql.Date, period.from)
                .input('DenNgay', sql.Date, period.to)
                .input('NhanKy', sql.NVarChar, nhanKy)
                .input('MaNV', sql.VarChar, user.MaNV)
                .input('TenNV', sql.NVarChar, user.TenNV || 'Thủ kho')
                .input('GhiChu', sql.NVarChar, String(note || '').trim().slice(0, 300) || null)
                .input('NoiDung', sql.NVarChar, payload)
                .query(`INSERT BaoCaoKhoNop (MaBC, LoaiKy, GiaTriKy, TuNgay, DenNgay, NhanKy, MaNV_Lap, TenNV_Lap, GhiChu, NoiDung)
                        VALUES (@MaBC, @LoaiKy, @GiaTriKy, @TuNgay, @DenNgay, @NhanKy, @MaNV, @TenNV, @GhiChu, @NoiDung)`);
        }
        await logAudit(transaction, {
            user,
            action: 'Gửi báo cáo kho',
            table: 'BaoCaoKhoNop',
            recordId: maBC,
            uc: 'UC15',
            content: `${period.label || period.period}; gửi cho Quản lý xem báo cáo Thủ kho${replaced ? ' (ghi đè cùng kỳ)' : ''}`
        });
        await transaction.commit();
        let notified = 0;
        try {
            notified = await notifyManagers(pool, { user, maBC, label: period.label || period.period });
        } catch (error) {
            console.error(error);
        }
        notifyInboxChanged({ action: 'Gửi báo cáo kho', table: 'BaoCaoKhoNop', recordId: maBC });
        try {
            const telegramNotify = require('./telegramNotify');
            telegramNotify.notifySafely(() => telegramNotify.notifyWarehouseReportSubmitted(pool, maBC));
        } catch (error) {
            console.error('Telegram báo cáo kho:', error.message);
        }
        return {
            MaBC: maBC,
            replaced,
            notified,
            message: notified
                ? `Đã ${replaced ? 'cập nhật' : 'gửi'} ${maBC} cho Quản lý. Đây là báo cáo Thủ kho, tách khỏi báo cáo tổng cửa hàng.`
                : `Đã lưu ${maBC}. Chưa gửi được hộp thư Quản lý — hãy báo trực tiếp.`
        };
    } catch (error) {
        try { await transaction.rollback(); } catch { /* đã rollback hoặc chưa begin xong */ }
        throw error;
    }
};

const listWarehouseReports = async (pool, { mine = null, top = 40 } = {}) => {
    await ensureWarehouseReportSubmitSchema(pool);
    const result = await pool.request()
        .input('Top', sql.Int, Math.min(Math.max(Number(top) || 40, 1), 100))
        .input('MaNV', sql.VarChar, mine || null)
        .query(`
            SELECT TOP (@Top) MaBC, LoaiKy, GiaTriKy, TuNgay, DenNgay, NhanKy,
                   MaNV_Lap, TenNV_Lap, NgayNop, TrangThai, GhiChu
            FROM BaoCaoKhoNop
            WHERE (@MaNV IS NULL OR MaNV_Lap=@MaNV)
            ORDER BY NgayNop DESC`);
    return result.recordset;
};

const withdrawWarehouseReport = async (pool, user, maBC) => {
    await ensureWarehouseReportSubmitSchema(pool);
    const id = String(maBC || '').trim();
    if (!id) throw new Error('Thiếu số báo cáo cần thu hồi.');
    const found = await pool.request().input('MaBC', sql.VarChar, id)
        .query(`SELECT MaBC, MaNV_Lap, NhanKy FROM BaoCaoKhoNop WHERE MaBC=@MaBC`);
    const row = found.recordset[0];
    if (!row) throw new Error('Không tìm thấy báo cáo kho đã gửi.');
    const isOwner = row.MaNV_Lap === user.MaNV;
    const isManager = user.TenVaiTro === 'Quản lý';
    if (!isOwner && !isManager) throw new Error('Chỉ người lập hoặc Quản lý mới thu hồi được báo cáo này.');
    const like = `%${id}%`;
    await pool.request().input('MaBC', sql.NVarChar, like).query(`
        DELETE ThongBaoCuaHang
        WHERE DichDen=N'admin-warehouse-reports'
          AND (TieuDe LIKE @MaBC OR NoiDung LIKE @MaBC)`);
    await pool.request().input('MaBC', sql.VarChar, id)
        .query(`DELETE BaoCaoKhoNop WHERE MaBC=@MaBC`);
    await logAudit(pool, {
        user,
        action: 'Thu hồi báo cáo kho',
        table: 'BaoCaoKhoNop',
        recordId: id,
        uc: 'UC15',
        content: `${row.NhanKy || id}; thu hồi bản đã gửi cho Quản lý`
    });
    notifyInboxChanged({ action: 'Thu hồi báo cáo kho', table: 'BaoCaoKhoNop', recordId: id });
    return { MaBC: id, message: `Đã thu hồi ${id}. Quản lý không còn thấy bản này.` };
};

const getWarehouseReportSubmission = async (pool, id) => {
    await ensureWarehouseReportSubmitSchema(pool);
    const result = await pool.request().input('MaBC', sql.VarChar, id)
        .query(`SELECT * FROM BaoCaoKhoNop WHERE MaBC=@MaBC`);
    const row = result.recordset[0];
    if (!row) throw new Error('Không tìm thấy báo cáo kho đã gửi.');
    let snapshot = {};
    try { snapshot = JSON.parse(row.NoiDung || '{}'); } catch { snapshot = {}; }
    const { NoiDung, ...header } = row;
    return { header, report: snapshot };
};

module.exports = {
    ensureWarehouseReportSubmitSchema,
    compactSnapshot,
    submitWarehouseReport,
    withdrawWarehouseReport,
    listWarehouseReports,
    getWarehouseReportSubmission
};
