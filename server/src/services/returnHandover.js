const { sql } = require('../config/db');

const requestOf = (connection) => (
    typeof connection.request === 'function' ? connection.request() : new sql.Request(connection)
);

const isMissingHandoverColumn = (error) => /Invalid column name|MaNV_XuLy|MaQuayXuLy|NgayBanGiao|MaCaBanGiao/i.test(error?.message || '');

const safeHandover = async (fn, fallback) => {
    try {
        return await fn();
    } catch (error) {
        if (isMissingHandoverColumn(error)) return fallback;
        throw error;
    }
};

const PENDING_APPROVED_SQL = `
    dt.TrangThai=N'Đã duyệt' AND dt.NgayHoan IS NULL`;

const loadPendingApprovedReturns = async (connection, { maNV = null, maQuay = null } = {}) => safeHandover(async () => {
    const result = await requestOf(connection)
        .input('MaNV', sql.VarChar, maNV)
        .input('MaQuay', sql.VarChar, maQuay)
        .query(`
            SELECT dt.MaDT, dt.MaHD, dt.MaNV_Lap, dt.MaNV_XuLy, dt.MaQuayXuLy, dt.NgayBanGiao,
                   dt.HinhThucXuLy, dt.SoTienHoan, dt.LyDo, nv.TenNV NguoiXuLy
            FROM PhieuDoiTra dt
            LEFT JOIN NhanVien nv ON nv.MaNV=COALESCE(dt.MaNV_XuLy, dt.MaNV_Lap)
            WHERE ${PENDING_APPROVED_SQL}
              AND (
                    (@MaNV IS NOT NULL AND COALESCE(dt.MaNV_XuLy, dt.MaNV_Lap)=@MaNV)
                 OR (@MaQuay IS NOT NULL AND dt.MaQuayXuLy=@MaQuay)
              )
            ORDER BY dt.NgayDuyet, dt.MaDT`);
    return result.recordset;
}, []);

const findNextCashierAtQuay = async (connection, maQuay, afterTime = null) => {
    if (!maQuay) return null;
    const result = await requestOf(connection)
        .input('MaQuay', sql.VarChar, maQuay)
        .input('AfterTime', sql.DateTime, afterTime)
        .query(`
            SELECT TOP 1 l.MaNV, l.MaLich, l.MaQuay, l.BatDauDuKien, l.KetThucDuKien,
                   nv.TenNV, lc.TenCa
            FROM LichLamViec l
            JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
            JOIN NhanVien nv ON nv.MaNV=l.MaNV
            WHERE l.MaQuay=@MaQuay AND l.TrangThai=N'Đã công bố'
              AND nv.ChucVu=N'Thu ngân'
              AND lc.MaLoaiCa<>N'HANH_CHINH' AND ISNULL(lc.NhomCa,N'')<>N'HANH_CHINH'
              AND l.NhiemVu IN (N'Ca chính full-time', N'Thu ngân')
              AND (@AfterTime IS NULL OR l.BatDauDuKien>=@AfterTime)
              AND l.KetThucDuKien>GETDATE()
            ORDER BY l.BatDauDuKien`);
    return result.recordset[0] || null;
};

const handoverApprovedReturns = async (transaction, { fromMaNV, maQuay, fromMaCa = null, afterTime = null }) => safeHandover(async () => {
    const pending = await loadPendingApprovedReturns(transaction, { maNV: fromMaNV });
    if (!pending.length) return { handed: [], next: null, warning: null };

    const next = await findNextCashierAtQuay(transaction, maQuay, afterTime);
    const nextMaNV = next && next.MaNV !== fromMaNV ? next.MaNV : null;

    for (const ticket of pending) {
        await new sql.Request(transaction)
            .input('MaDT', sql.VarChar, ticket.MaDT)
            .input('MaNV_XuLy', sql.VarChar, nextMaNV)
            .input('MaQuayXuLy', sql.VarChar, maQuay || ticket.MaQuayXuLy)
            .input('MaCaBanGiao', sql.VarChar, fromMaCa)
            .query(`
                UPDATE PhieuDoiTra
                SET MaNV_XuLy=@MaNV_XuLy,
                    MaQuayXuLy=COALESCE(@MaQuayXuLy, MaQuayXuLy),
                    NgayBanGiao=GETDATE(),
                    MaCaBanGiao=COALESCE(@MaCaBanGiao, MaCaBanGiao)
                WHERE MaDT=@MaDT AND TrangThai=N'Đã duyệt'`);
    }

    const names = pending.map(item => item.MaDT).join(', ');
    const warning = nextMaNV
        ? `Còn ${pending.length} phiếu đã duyệt chưa hoàn (${names}). Đã chuyển ca sau cùng quầy cho ${next.TenNV}.`
        : `Còn ${pending.length} phiếu đã duyệt chưa hoàn (${names}). Đã chuyển chờ ca sau cùng quầy xác nhận — không chặn đóng ca.`;
    return { handed: pending, next, warning };
}, { handed: [], next: null, warning: null });

const claimHandoverReturns = async (transaction, { maNV, maQuay, maCa }) => {
    if (!maQuay || !maNV) return [];
    return safeHandover(async () => {
        const result = await new sql.Request(transaction)
            .input('MaNV', sql.VarChar, maNV)
            .input('MaQuay', sql.VarChar, maQuay)
            .input('MaCa', sql.VarChar, maCa)
            .query(`
                UPDATE PhieuDoiTra
                SET MaNV_XuLy=@MaNV, MaQuayXuLy=@MaQuay, MaCaBanGiao=@MaCa
                OUTPUT inserted.MaDT
                WHERE TrangThai=N'Đã duyệt'
                  AND NgayHoan IS NULL
                  AND MaQuayXuLy=@MaQuay
                  AND NgayBanGiao IS NOT NULL`);
        return result.recordset;
    }, []);
};

const canCompleteAssignedReturn = (ticket, maNV, maQuay) => {
    if (!ticket || ticket.TrangThai !== 'Đã duyệt') return false;
    const assigned = ticket.MaNV_XuLy || ticket.MaNV_Lap;
    if (assigned === maNV) return true;
    if (ticket.NgayBanGiao && ticket.MaQuayXuLy && maQuay && ticket.MaQuayXuLy === maQuay) return true;
    return false;
};

const assignedCashierOf = (ticket) => ticket?.MaNV_XuLy || ticket?.MaNV_Lap;

module.exports = {
    loadPendingApprovedReturns,
    findNextCashierAtQuay,
    handoverApprovedReturns,
    claimHandoverReturns,
    canCompleteAssignedReturn,
    assignedCashierOf
};
