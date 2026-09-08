const sql = require('mssql/msnodesqlv8');

const PRE_REQUEST_NOTE = /trước khi lập đề nghị/i;
const RECOUNTED_STATUS = 'Đã đếm lại';
const FINISHED_SUCCESSOR = new Set(['Đã duyệt', 'Hoàn thành không chênh lệch', 'Chờ duyệt điều chỉnh', RECOUNTED_STATUS]);

const isPreRequestNote = (note) => PRE_REQUEST_NOTE.test(String(note || ''));

const isFinishedSuccessorStatus = (status) => FINISHED_SUCCESSOR.has(String(status || '').trim());

const successorExistsSql = (alias = 'kk') => `
    EXISTS (
        SELECT 1 FROM KiemKe later
        WHERE later.MaKho = ${alias}.MaKho
          AND later.MaKK <> ${alias}.MaKK
          AND later.NgayKiemKe > COALESCE(${alias}.NgayDuyet, ${alias}.NgayKiemKe)
          AND later.TrangThai IN (N'Đang kiểm', N'Chờ duyệt điều chỉnh', N'Đã duyệt', N'Hoàn thành không chênh lệch', N'Đã đếm lại')
          AND (later.GhiChu IS NULL OR later.GhiChu NOT LIKE N'%trước khi lập đề nghị%')
    )`;

const presentCountLifecycle = (item = {}) => {
    const status = String(item.TrangThai || '').trim();
    const successorId = item.MaKKThayThe || null;
    const successorStatus = String(item.TrangThaiThayThe || '').trim() || null;
    const daDemLai = status === RECOUNTED_STATUS
        || Boolean(status === 'Từ chối' && successorId && isFinishedSuccessorStatus(successorStatus));
    const dangDemLai = Boolean(status === 'Từ chối' && !daDemLai && successorId && successorStatus === 'Đang kiểm');
    const canRecount = Boolean(status === 'Từ chối' && !daDemLai && !dangDemLai);

    let trangThaiHienThi = status;
    if (daDemLai) trangThaiHienThi = RECOUNTED_STATUS;
    else if (dangDemLai) trangThaiHienThi = 'Đang đếm lại';

    let statusNote = '';
    if (canRecount) statusNote = item.LyDoTuChoi || '';
    else if (dangDemLai && successorId) statusNote = `Đang đếm lại trên ${successorId}`;
    else if (daDemLai && successorId) statusNote = `Thay bằng ${successorId}`;

    let actionLabel = 'Xem chi tiết';
    if (status === 'Đang kiểm' || dangDemLai) actionLabel = 'Tiếp tục kiểm';
    else if (canRecount) actionLabel = 'Xem lý do / đếm lại';

    return {
        CanRecount: canRecount,
        DaDemLai: daDemLai,
        DangDemLai: dangDemLai,
        TrangThaiHienThi: trangThaiHienThi,
        StatusNote: statusNote,
        ActionLabel: actionLabel,
        OpenMaKK: dangDemLai && successorId ? successorId : item.MaKK,
        MaKKThayThe: successorId,
        MaKKGoc: item.MaKKGoc || null
    };
};

const decorateCount = (item) => ({ ...item, ...presentCountLifecycle(item) });

const requestOf = (db) => (db && typeof db.request === 'function' ? db.request() : new sql.Request(db));

const syncRejectedCountSuccessors = async (db) => {
    await requestOf(db).query(`
        UPDATE kk
        SET kk.MaKKThayThe = later.MaKK,
            kk.TrangThai = N'Đã đếm lại'
        FROM dbo.KiemKe kk
        CROSS APPLY (
            SELECT TOP 1 s.MaKK
            FROM dbo.KiemKe s
            WHERE s.MaKho = kk.MaKho
              AND s.MaKK <> kk.MaKK
              AND s.NgayKiemKe > COALESCE(kk.NgayDuyet, kk.NgayKiemKe)
              AND s.TrangThai IN (N'Hoàn thành không chênh lệch', N'Đã duyệt', N'Chờ duyệt điều chỉnh')
              AND (s.GhiChu IS NULL OR s.GhiChu NOT LIKE N'%trước khi lập đề nghị%')
            ORDER BY s.NgayKiemKe DESC
        ) later
        WHERE kk.TrangThai = N'Từ chối'`);
    await requestOf(db).query(`
        UPDATE kk
        SET kk.MaKKThayThe = later.MaKK
        FROM dbo.KiemKe kk
        CROSS APPLY (
            SELECT TOP 1 s.MaKK
            FROM dbo.KiemKe s
            WHERE s.MaKho = kk.MaKho
              AND s.MaKK <> kk.MaKK
              AND s.NgayKiemKe > COALESCE(kk.NgayDuyet, kk.NgayKiemKe)
              AND s.TrangThai = N'Đang kiểm'
              AND (s.GhiChu IS NULL OR s.GhiChu NOT LIKE N'%trước khi lập đề nghị%')
            ORDER BY s.NgayKiemKe DESC
        ) later
        WHERE kk.TrangThai = N'Từ chối'
          AND kk.MaKKThayThe IS NULL`);
};

const linkOpenRejections = async (db, { MaKho, MaKK, MaKKGoc }) => {
    await requestOf(db)
        .input('MaKho', sql.VarChar, MaKho)
        .input('MaKK', sql.VarChar, MaKK)
        .input('MaKKGoc', sql.VarChar, MaKKGoc || null)
        .query(`
            UPDATE KiemKe
            SET MaKKThayThe = @MaKK
            WHERE MaKho = @MaKho
              AND TrangThai = N'Từ chối'
              AND (@MaKKGoc IS NULL OR MaKK = @MaKKGoc OR MaKKThayThe IS NULL OR MaKKThayThe = @MaKK)`);
};

const markRejectedRecounted = async (db, { MaKK, MaKho, MaKKGoc, heuristic = true }) => {
    const result = await requestOf(db)
        .input('MaKK', sql.VarChar, MaKK)
        .input('MaKho', sql.VarChar, MaKho)
        .input('MaKKGoc', sql.VarChar, MaKKGoc || null)
        .input('Heuristic', sql.Bit, heuristic ? 1 : 0)
        .query(`
            UPDATE KiemKe
            SET TrangThai = N'Đã đếm lại',
                MaKKThayThe = COALESCE(MaKKThayThe, @MaKK)
            OUTPUT inserted.MaKK
            WHERE TrangThai = N'Từ chối'
              AND MaKho = @MaKho
              AND MaKK <> @MaKK
              AND (
                    MaKK = @MaKKGoc
                 OR MaKKThayThe = @MaKK
                 OR (@Heuristic=1 AND COALESCE(NgayDuyet, NgayKiemKe) < (SELECT NgayKiemKe FROM KiemKe WHERE MaKK=@MaKK))
              )`);
    return (result.recordset || []).map(row => row.MaKK);
};

module.exports = {
    RECOUNTED_STATUS,
    isPreRequestNote,
    isFinishedSuccessorStatus,
    successorExistsSql,
    presentCountLifecycle,
    decorateCount,
    syncRejectedCountSuccessors,
    linkOpenRejections,
    markRejectedRecounted
};
