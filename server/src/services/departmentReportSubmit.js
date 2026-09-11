const { sql } = require('../config/db');
const { notifyInboxChanged } = require('./notificationHub');
const { logAudit } = require('./auditLog');
const { formatPeriodLabel } = require('./reportingPeriod');
const {
    KIND_META,
    DEPT_LABEL,
    DEPT_PAGE,
    LEDGER_KINDS,
    compactSnapshot,
    roleDept
} = require('./departmentReportSnapshot');

const ADMIN_TARGET = 'admin-department-reports';
const ACTIVE_STATUSES = `N'Đã gửi', N'Đã xem', N'Cần phản hồi'`;

const ensureDepartmentReportSchema = async (pool) => {
    await pool.request().query(`
        IF OBJECT_ID(N'dbo.BaoCaoBoPhanNop', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.BaoCaoBoPhanNop (
                MaBC VARCHAR(30) NOT NULL CONSTRAINT PK_BaoCaoBoPhanNop PRIMARY KEY,
                BoPhan NVARCHAR(20) NOT NULL,
                LoaiBaoCao VARCHAR(30) NOT NULL,
                LoaiKy NVARCHAR(20) NOT NULL,
                GiaTriKy VARCHAR(20) NOT NULL,
                TuNgay DATE NOT NULL,
                DenNgay DATE NOT NULL,
                NhanKy NVARCHAR(120) NOT NULL,
                SoPhien INT NOT NULL CONSTRAINT DF_BaoCaoBoPhanNop_Phien DEFAULT 1,
                MaCa VARCHAR(20) NULL,
                MaNV_Lap VARCHAR(20) NOT NULL,
                TenNV_Lap NVARCHAR(100) NOT NULL,
                NgayNop DATETIME NOT NULL CONSTRAINT DF_BaoCaoBoPhanNop_NgayNop DEFAULT GETDATE(),
                NgayXem DATETIME NULL,
                MaNV_Xem VARCHAR(20) NULL,
                TrangThai NVARCHAR(30) NOT NULL CONSTRAINT DF_BaoCaoBoPhanNop_TT DEFAULT N'Đã gửi',
                GhiChu NVARCHAR(300) NULL,
                PhanHoiQL NVARCHAR(500) NULL,
                NoiDung NVARCHAR(MAX) NOT NULL,
                CONSTRAINT FK_BaoCaoBoPhanNop_NV FOREIGN KEY (MaNV_Lap) REFERENCES dbo.NhanVien(MaNV)
            );
            CREATE INDEX IX_BaoCaoBoPhanNop_Ky ON dbo.BaoCaoBoPhanNop (BoPhan, LoaiBaoCao, LoaiKy, GiaTriKy, MaNV_Lap, SoPhien DESC);
            CREATE INDEX IX_BaoCaoBoPhanNop_TT ON dbo.BaoCaoBoPhanNop (TrangThai, NgayNop DESC);
            CREATE INDEX IX_BaoCaoBoPhanNop_NV ON dbo.BaoCaoBoPhanNop (MaNV_Lap, NgayNop DESC);
        END`);
};

const datePrefix = prefix => {
    const now = new Date();
    return `${prefix}${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
};

const nextId = async (transaction, prefix) => {
    const stamp = datePrefix(prefix);
    const result = await new sql.Request(transaction)
        .input('Prefix', sql.VarChar, `${stamp}%`)
        .query(`SELECT TOP 1 MaBC Id FROM BaoCaoBoPhanNop WITH (UPDLOCK, HOLDLOCK)
                WHERE MaBC LIKE @Prefix ORDER BY MaBC DESC`);
    const last = result.recordset[0]?.Id;
    const sequence = last ? Number(last.slice(stamp.length)) + 1 : 1;
    return `${stamp}${String(sequence).padStart(3, '0')}`;
};

const assertKindForUser = (user, kind) => {
    const meta = KIND_META[kind];
    if (!meta) throw new Error('Loại báo cáo không hỗ trợ gửi.');
    const dept = roleDept(user);
    if (dept !== meta.boPhan) {
        throw new Error(`Chỉ ${DEPT_LABEL[meta.boPhan]} mới gửi được ${meta.label}.`);
    }
    return meta;
};

const periodClosed = async (pool, periodValue) => {
    const maKy = String(periodValue || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(maKy)) return false;
    const row = await pool.request().input('MaKy', sql.VarChar, maKy)
        .query(`SELECT TrangThai FROM KyKeToan WHERE MaKy=@MaKy`);
    return row.recordset[0]?.TrangThai === 'Khoa';
};

const collectWarnings = async (pool, kind, snapshot) => {
    const warnings = [];
    const period = snapshot.period || {};
    const from = period.from;
    const toExclusive = period.toExclusive || (period.to ? String(period.to) : null);
    if (kind === 'TN_BAN_HANG') {
        const alerts = snapshot.alerts || {};
        if (Number(alerts.CaChoDoiSoat)) {
            warnings.push(`${alerts.CaChoDoiSoat} ca đang chờ Kế toán đối soát — bản này vẫn gửi được.`);
        }
        if (Number(alerts.HoaDonNhap)) {
            warnings.push(`${alerts.HoaDonNhap} hóa đơn còn nháp, chưa vào doanh thu.`);
        }
        if (Number(alerts.ThanhToanChoXacNhan)) {
            warnings.push(`${alerts.ThanhToanChoXacNhan} thanh toán chờ xác nhận.`);
        }
    }
    if (kind === 'KT_NOI_BO' || kind === 'TN_BAN_HANG') {
        try {
            const req = pool.request();
            if (from) req.input('From', sql.NVarChar, from);
            const shiftSql = from
                ? `SELECT COUNT(*) SoLuong FROM CaLamViec
                   WHERE TrangThai=N'Đã chốt' AND TrangThaiDoiSoat=N'Chờ Kế toán đối soát'
                     AND CONVERT(date, ThoiGianBatDau)>=@From
                     ${toExclusive ? 'AND CONVERT(date, ThoiGianBatDau)<@ToExclusive' : ''}`
                : `SELECT COUNT(*) SoLuong FROM CaLamViec
                   WHERE TrangThai=N'Đã chốt' AND TrangThaiDoiSoat=N'Chờ Kế toán đối soát'`;
            if (toExclusive) req.input('ToExclusive', sql.NVarChar, toExclusive);
            const shifts = await req.query(shiftSql);
            const n = Number(shifts.recordset[0]?.SoLuong || 0);
            if (n && kind === 'KT_NOI_BO') warnings.push(`${n} ca chưa đối soát phiếu thu.`);
        } catch { /* schema cũ thì bỏ qua */ }
        const chenh = Number(snapshot.finance?.ChenhLechPhieuThu || 0);
        if (chenh) warnings.push(`Chênh lệch phiếu thu ${chenh.toLocaleString('vi-VN')} đ — ghi rõ trong ghi chú.`);
    }
    if (LEDGER_KINDS.has(kind)) {
        const closed = await periodClosed(pool, period.period || period.MaKy);
        if (!closed || snapshot.watermark) {
            throw new Error('Kỳ chưa khóa — báo cáo sổ cái còn dấu «Số liệu tạm tính», không gửi được cho Quản lý.');
        }
    }
    return warnings;
};

const notifyManagers = async (pool, { user, maBC, label, kind }) => {
    const meta = KIND_META[kind] || {};
    const recipients = await pool.request().query(`
        SELECT nv.MaNV
        FROM NhanVien nv
        JOIN TaiKhoan tk ON tk.MaNV=nv.MaNV
        JOIN VaiTro vt ON vt.MaVaiTro=tk.MaVaiTro
        WHERE vt.TenVaiTro=N'Quản lý'
          AND tk.TrangThai=1
          AND ISNULL(nv.TrangThai, N'Đang làm việc')=N'Đang làm việc'`);
    const title = `${meta.label || 'Báo cáo bộ phận'} ${label} · ${maBC}`;
    const detail = `${user.TenNV || DEPT_LABEL[meta.boPhan] || 'Nhân viên'} đã gửi ${maBC}. Mở menu Báo cáo bộ phận để xem bản đã nộp — không phải Báo cáo cửa hàng.`;
    for (const person of recipients.recordset) {
        await pool.request()
            .input('MaNVNhan', sql.VarChar, person.MaNV)
            .input('TieuDe', sql.NVarChar, title.slice(0, 200))
            .input('NoiDung', sql.NVarChar, detail.slice(0, 1000))
            .input('MaNVGui', sql.VarChar, user.MaNV)
            .input('TenGui', sql.NVarChar, user.TenNV || '')
            .input('DichDen', sql.NVarChar, ADMIN_TARGET)
            .query(`
                INSERT ThongBaoCuaHang (MaNV_Nhan, TieuDe, NoiDung, MaNV_Gui, TenNV_Gui, DichDen, MucDo)
                VALUES (@MaNVNhan, @TieuDe, @NoiDung, @MaNVGui, @TenGui, @DichDen, N'Thông tin')`);
    }
    return recipients.recordset.length;
};

const notifyAuthor = async (pool, { authorMaNV, sender, maBC, title, detail, target }) => {
    if (!authorMaNV) return;
    await pool.request()
        .input('MaNVNhan', sql.VarChar, authorMaNV)
        .input('TieuDe', sql.NVarChar, String(title || '').slice(0, 200))
        .input('NoiDung', sql.NVarChar, String(detail || '').slice(0, 1000))
        .input('MaNVGui', sql.VarChar, sender.MaNV)
        .input('TenGui', sql.NVarChar, sender.TenNV || 'Quản lý')
        .input('DichDen', sql.NVarChar, target)
        .query(`
            INSERT ThongBaoCuaHang (MaNV_Nhan, TieuDe, NoiDung, MaNV_Gui, TenNV_Gui, DichDen, MucDo)
            VALUES (@MaNVNhan, @TieuDe, @NoiDung, @MaNVGui, @TenGui, @DichDen, N'Cảnh báo')`);
};

const submitDepartmentReport = async (pool, user, { kind, report, note = '', maCa = null } = {}) => {
    await ensureDepartmentReportSchema(pool);
    const meta = assertKindForUser(user, kind);
    const snapshot = compactSnapshot(kind, report || {});
    const period = snapshot.period;
    if (!period?.periodType || !period.period || !period.from || !period.to) {
        throw new Error('Chưa có kỳ báo cáo để gửi. Hãy lập báo cáo trước.');
    }
    const warnings = await collectWarnings(pool, kind, snapshot);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const existing = await new sql.Request(transaction)
            .input('BoPhan', sql.NVarChar, meta.boPhan)
            .input('Loai', sql.VarChar, kind)
            .input('LoaiKy', sql.NVarChar, period.periodType)
            .input('GiaTriKy', sql.VarChar, period.period)
            .input('MaNV', sql.VarChar, user.MaNV)
            .query(`SELECT TOP 1 MaBC, SoPhien FROM BaoCaoBoPhanNop WITH (UPDLOCK, HOLDLOCK)
                    WHERE BoPhan=@BoPhan AND LoaiBaoCao=@Loai AND LoaiKy=@LoaiKy AND GiaTriKy=@GiaTriKy
                      AND MaNV_Lap=@MaNV
                    ORDER BY SoPhien DESC`);
        const last = existing.recordset[0];
        const soPhien = last ? Number(last.SoPhien || 1) + 1 : 1;
        const maBC = await nextId(transaction, meta.prefix);
        const nhanKy = formatPeriodLabel(period.periodType, period.period, period.label);
        const payload = JSON.stringify(snapshot);
        await new sql.Request(transaction)
            .input('MaBC', sql.VarChar, maBC)
            .input('BoPhan', sql.NVarChar, meta.boPhan)
            .input('Loai', sql.VarChar, kind)
            .input('LoaiKy', sql.NVarChar, period.periodType)
            .input('GiaTriKy', sql.VarChar, period.period)
            .input('TuNgay', sql.Date, period.from)
            .input('DenNgay', sql.Date, period.to)
            .input('NhanKy', sql.NVarChar, nhanKy)
            .input('SoPhien', sql.Int, soPhien)
            .input('MaCa', sql.VarChar, maCa || null)
            .input('MaNV', sql.VarChar, user.MaNV)
            .input('TenNV', sql.NVarChar, user.TenNV || DEPT_LABEL[meta.boPhan])
            .input('GhiChu', sql.NVarChar, String(note || '').trim().slice(0, 300) || null)
            .input('NoiDung', sql.NVarChar, payload)
            .query(`INSERT BaoCaoBoPhanNop
                    (MaBC, BoPhan, LoaiBaoCao, LoaiKy, GiaTriKy, TuNgay, DenNgay, NhanKy, SoPhien, MaCa,
                     MaNV_Lap, TenNV_Lap, GhiChu, NoiDung, TrangThai)
                    VALUES (@MaBC, @BoPhan, @Loai, @LoaiKy, @GiaTriKy, @TuNgay, @DenNgay, @NhanKy, @SoPhien, @MaCa,
                            @MaNV, @TenNV, @GhiChu, @NoiDung, N'Đã gửi')`);
        await logAudit(transaction, {
            user,
            action: 'Gửi báo cáo bộ phận',
            table: 'BaoCaoBoPhanNop',
            recordId: maBC,
            uc: meta.uc,
            content: `${meta.label} · ${nhanKy} · phiên ${soPhien}${last ? ` (sau ${last.MaBC})` : ''}`
        });
        await transaction.commit();
        let notified = 0;
        try {
            notified = await notifyManagers(pool, { user, maBC, label: nhanKy, kind });
        } catch (error) {
            console.error(error);
        }
        notifyInboxChanged({ action: 'Gửi báo cáo bộ phận', table: 'BaoCaoBoPhanNop', recordId: maBC });
        try {
            const telegramNotify = require('./telegramNotify');
            telegramNotify.notifySafely(() => telegramNotify.notifyDepartmentReportSubmitted(pool, maBC));
        } catch (error) {
            console.error('Telegram báo cáo bộ phận:', error.message);
        }
        return {
            MaBC: maBC,
            SoPhien: soPhien,
            replaced: false,
            previous: last?.MaBC || null,
            warnings,
            notified,
            message: notified
                ? `Đã gửi ${maBC} (phiên ${soPhien}) cho Quản lý. Xem ở menu Báo cáo bộ phận, không phải Báo cáo cửa hàng.`
                : `Đã lưu ${maBC}. Chưa gửi được hộp thư Quản lý — hãy báo trực tiếp.`
        };
    } catch (error) {
        try { await transaction.rollback(); } catch { /* ignore */ }
        throw error;
    }
};

const listFilters = (request, { mine, boPhan, loai, periodType, period, status, maNV, includeWithdrawn, latestOnly }) => {
    request.input('Mine', sql.VarChar, mine || null);
    request.input('BoPhan', sql.NVarChar, boPhan || null);
    request.input('Loai', sql.VarChar, loai || null);
    request.input('LoaiKy', sql.NVarChar, periodType || null);
    request.input('GiaTriKy', sql.VarChar, period || null);
    request.input('TrangThai', sql.NVarChar, status || null);
    request.input('MaNV', sql.VarChar, maNV || null);
    request.input('IncludeWithdrawn', sql.Bit, includeWithdrawn ? 1 : 0);
    request.input('LatestOnly', sql.Bit, latestOnly === false ? 0 : 1);
};

const listDepartmentReports = async (pool, options = {}) => {
    await ensureDepartmentReportSchema(pool);
    const top = Math.min(Math.max(Number(options.top) || 80, 1), 200);
    const request = pool.request().input('Top', sql.Int, top);
    listFilters(request, options);
    const result = await request.query(`
        WITH ranked AS (
            SELECT MaBC, BoPhan, LoaiBaoCao, LoaiKy, GiaTriKy, TuNgay, DenNgay, NhanKy, SoPhien, MaCa,
                   MaNV_Lap, TenNV_Lap, NgayNop, NgayXem, MaNV_Xem, TrangThai, GhiChu, PhanHoiQL,
                   ROW_NUMBER() OVER (
                       PARTITION BY BoPhan, LoaiBaoCao, LoaiKy, GiaTriKy, MaNV_Lap
                       ORDER BY SoPhien DESC, NgayNop DESC
                   ) rn
            FROM BaoCaoBoPhanNop
            WHERE (@Mine IS NULL OR MaNV_Lap=@Mine)
              AND (@BoPhan IS NULL OR BoPhan=@BoPhan)
              AND (@Loai IS NULL OR LoaiBaoCao=@Loai)
              AND (@LoaiKy IS NULL OR LoaiKy=@LoaiKy)
              AND (@GiaTriKy IS NULL OR GiaTriKy=@GiaTriKy)
              AND (@TrangThai IS NULL OR TrangThai=@TrangThai)
              AND (@MaNV IS NULL OR MaNV_Lap=@MaNV)
              AND (@IncludeWithdrawn=1 OR TrangThai<>N'Đã thu hồi')
        )
        SELECT TOP (@Top) * FROM ranked
        WHERE (@LatestOnly=0 OR rn=1)
        ORDER BY NgayNop DESC`);
    return result.recordset;
};

const dueFor = async (pool, { mine, kind, periodType, period }) => {
    await ensureDepartmentReportSchema(pool);
    const meta = KIND_META[kind];
    if (!meta || !mine || !periodType || !period) return { submitted: false, latest: null };
    const row = await pool.request()
        .input('BoPhan', sql.NVarChar, meta.boPhan)
        .input('Loai', sql.VarChar, kind)
        .input('LoaiKy', sql.NVarChar, periodType)
        .input('GiaTriKy', sql.VarChar, period)
        .input('MaNV', sql.VarChar, mine)
        .query(`SELECT TOP 1 MaBC, SoPhien, NgayNop, TrangThai
                FROM BaoCaoBoPhanNop
                WHERE BoPhan=@BoPhan AND LoaiBaoCao=@Loai AND LoaiKy=@LoaiKy AND GiaTriKy=@GiaTriKy
                  AND MaNV_Lap=@MaNV AND TrangThai IN (${ACTIVE_STATUSES})
                ORDER BY SoPhien DESC`);
    const latest = row.recordset[0] || null;
    return { submitted: Boolean(latest), latest };
};

const countUnreadForAdmin = async (pool) => {
    try {
        await ensureDepartmentReportSchema(pool);
        const row = await pool.request().query(`
            SELECT COUNT(*) SoLuong FROM BaoCaoBoPhanNop WHERE TrangThai=N'Đã gửi'`);
        return Number(row.recordset[0]?.SoLuong || 0);
    } catch {
        return 0;
    }
};

const withdrawDepartmentReport = async (pool, user, maBC) => {
    await ensureDepartmentReportSchema(pool);
    const id = String(maBC || '').trim();
    if (!id) throw new Error('Thiếu số báo cáo cần thu hồi.');
    const found = await pool.request().input('MaBC', sql.VarChar, id)
        .query(`SELECT MaBC, MaNV_Lap, NhanKy, TrangThai, BoPhan FROM BaoCaoBoPhanNop WHERE MaBC=@MaBC`);
    const row = found.recordset[0];
    if (!row) throw new Error('Không tìm thấy báo cáo bộ phận đã gửi.');
    const isOwner = row.MaNV_Lap === user.MaNV;
    const isManager = user.TenVaiTro === 'Quản lý';
    if (!isOwner && !isManager) throw new Error('Chỉ người lập hoặc Quản lý mới thu hồi được báo cáo này.');
    if (!isManager && row.TrangThai !== 'Đã gửi' && row.TrangThai !== 'Nháp') {
        throw new Error('Quản lý đã xem hoặc đã phản hồi — không thu hồi được. Hãy gửi phiên mới.');
    }
    const like = `%${id}%`;
    await pool.request().input('MaBC', sql.NVarChar, like).query(`
        DELETE ThongBaoCuaHang
        WHERE DichDen=N'admin-department-reports'
          AND (TieuDe LIKE @MaBC OR NoiDung LIKE @MaBC)`);
    await pool.request().input('MaBC', sql.VarChar, id)
        .query(`UPDATE BaoCaoBoPhanNop SET TrangThai=N'Đã thu hồi' WHERE MaBC=@MaBC`);
    await logAudit(pool, {
        user,
        action: 'Thu hồi báo cáo bộ phận',
        table: 'BaoCaoBoPhanNop',
        recordId: id,
        uc: KIND_META[Object.keys(KIND_META).find(k => KIND_META[k].boPhan === row.BoPhan)]?.uc || 'UC10',
        content: `${row.NhanKy || id}; ẩn khỏi danh sách Quản lý, giữ bản JSON`
    });
    notifyInboxChanged({ action: 'Thu hồi báo cáo bộ phận', table: 'BaoCaoBoPhanNop', recordId: id });
    return { MaBC: id, message: `Đã thu hồi ${id}. Quản lý không còn thấy bản này trong danh sách mặc định.` };
};

const parseRow = (row) => {
    let snapshot = {};
    try { snapshot = JSON.parse(row.NoiDung || '{}'); } catch { snapshot = {}; }
    const { NoiDung, ...header } = row;
    return { header, report: snapshot };
};

const getDepartmentReportSubmission = async (pool, id, { markViewedBy = null } = {}) => {
    await ensureDepartmentReportSchema(pool);
    const result = await pool.request().input('MaBC', sql.VarChar, String(id || '').trim())
        .query(`SELECT * FROM BaoCaoBoPhanNop WHERE MaBC=@MaBC`);
    const row = result.recordset[0];
    if (!row) throw new Error('Không tìm thấy báo cáo bộ phận đã gửi.');
    if (markViewedBy && row.TrangThai === 'Đã gửi') {
        await pool.request()
            .input('MaBC', sql.VarChar, row.MaBC)
            .input('MaNV', sql.VarChar, markViewedBy)
            .query(`UPDATE BaoCaoBoPhanNop
                    SET TrangThai=N'Đã xem', NgayXem=GETDATE(), MaNV_Xem=@MaNV
                    WHERE MaBC=@MaBC AND TrangThai=N'Đã gửi'`);
        row.TrangThai = 'Đã xem';
        row.MaNV_Xem = markViewedBy;
        row.NgayXem = new Date();
        notifyInboxChanged({ action: 'Xem báo cáo bộ phận', table: 'BaoCaoBoPhanNop', recordId: row.MaBC });
    }
    const packed = parseRow(row);
    const versions = await pool.request()
        .input('BoPhan', sql.NVarChar, row.BoPhan)
        .input('Loai', sql.VarChar, row.LoaiBaoCao)
        .input('LoaiKy', sql.NVarChar, row.LoaiKy)
        .input('GiaTriKy', sql.VarChar, row.GiaTriKy)
        .input('MaNV', sql.VarChar, row.MaNV_Lap)
        .query(`SELECT MaBC, SoPhien, NgayNop, TrangThai, GhiChu
                FROM BaoCaoBoPhanNop
                WHERE BoPhan=@BoPhan AND LoaiBaoCao=@Loai AND LoaiKy=@LoaiKy AND GiaTriKy=@GiaTriKy
                  AND MaNV_Lap=@MaNV
                ORDER BY SoPhien DESC`);
    return { ...packed, versions: versions.recordset };
};

const assertCanRead = (user, header) => {
    if (user.TenVaiTro === 'Quản lý') return;
    if (header.MaNV_Lap !== user.MaNV) {
        throw new Error('Bạn chỉ xem được báo cáo do chính mình gửi.');
    }
};

const feedbackDepartmentReport = async (pool, user, maBC, note) => {
    await ensureDepartmentReportSchema(pool);
    if (user.TenVaiTro !== 'Quản lý') throw new Error('Chỉ Quản lý mới gửi phản hồi báo cáo bộ phận.');
    const text = String(note || '').trim().slice(0, 500);
    if (!text) throw new Error('Hãy ghi nội dung cần bộ phận giải trình.');
    const found = await pool.request().input('MaBC', sql.VarChar, String(maBC || '').trim())
        .query(`SELECT * FROM BaoCaoBoPhanNop WHERE MaBC=@MaBC`);
    const row = found.recordset[0];
    if (!row) throw new Error('Không tìm thấy báo cáo bộ phận.');
    if (row.TrangThai === 'Đã thu hồi') throw new Error('Báo cáo đã thu hồi, không phản hồi được.');
    await pool.request()
        .input('MaBC', sql.VarChar, row.MaBC)
        .input('Note', sql.NVarChar, text)
        .query(`UPDATE BaoCaoBoPhanNop
                SET TrangThai=N'Cần phản hồi', PhanHoiQL=@Note
                WHERE MaBC=@MaBC`);
    const target = DEPT_PAGE[row.BoPhan] || 'home';
    await notifyAuthor(pool, {
        authorMaNV: row.MaNV_Lap,
        sender: user,
        maBC: row.MaBC,
        title: `Quản lý cần giải trình ${row.MaBC}`,
        detail: text,
        target
    });
    await logAudit(pool, {
        user,
        action: 'Phản hồi báo cáo bộ phận',
        table: 'BaoCaoBoPhanNop',
        recordId: row.MaBC,
        uc: 'UC10',
        content: text
    });
    notifyInboxChanged({ action: 'Phản hồi báo cáo bộ phận', table: 'BaoCaoBoPhanNop', recordId: row.MaBC });
    return { MaBC: row.MaBC, message: `Đã gửi phản hồi tới ${row.TenNV_Lap}. Báo cáo chuyển sang Cần phản hồi.` };
};

module.exports = {
    ensureDepartmentReportSchema,
    submitDepartmentReport,
    listDepartmentReports,
    withdrawDepartmentReport,
    getDepartmentReportSubmission,
    feedbackDepartmentReport,
    dueFor,
    countUnreadForAdmin,
    assertCanRead,
    ADMIN_TARGET,
    KIND_META
};
