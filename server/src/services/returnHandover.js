const { sql } = require('../config/db');

const TERMINAL_RETURN_STATUSES = ['Hoàn thành', 'Từ chối', 'Đã hủy'];

const requestOf = (connection) => (
    typeof connection.request === 'function' ? connection.request() : new sql.Request(connection)
);

const isMissingHandoverColumn = (error) => /Invalid column name|MaNV_XuLy|MaQuayXuLy|NgayBanGiao|MaCaBanGiao|NgayTiepNhan/i.test(error?.message || '');

const safeHandover = async (fn, fallback) => {
    try {
        return await fn();
    } catch (error) {
        if (isMissingHandoverColumn(error)) return fallback;
        throw error;
    }
};

const isClosedReturn = (ticket) => {
    if (!ticket) return true;
    if (['Đang hoàn tiền', 'Hoàn tiền thất bại', 'Chờ xử lý hoàn tiền'].includes(ticket.TrangThai)) return false;
    if (TERMINAL_RETURN_STATUSES.includes(ticket.TrangThai)) return true;
    return Boolean(ticket.NgayHoan);
};

const isUnfinishedReturn = (ticket) => Boolean(ticket && !isClosedReturn(ticket));

const assignedCashierOf = (ticket) => {
    if (!ticket) return null;
    if (ticket.NgayBanGiao && !ticket.MaNV_XuLy) return null;
    return ticket.MaNV_XuLy || ticket.MaNV_Lap || null;
};

const isLeftoverReturn = (ticket) => {
    if (!isUnfinishedReturn(ticket) || !ticket.NgayBanGiao) return false;
    return !ticket.MaNV_XuLy;
};

const COUNTER_DUTIES = new Set(['Ca chính full-time', 'Thu ngân', 'Tăng cường part-time', 'Hỗ trợ thu ngân']);

const sameQuay = (ticket, maQuay) => {
    if (!maQuay) return false;
    if (!ticket?.MaQuayXuLy) return true;
    return ticket.MaQuayXuLy === maQuay;
};

const shouldHandoverReturn = (ticket, { fromMaNV } = {}) => {
    if (!isUnfinishedReturn(ticket) || !fromMaNV) return false;
    return ticket.MaNV_Lap === fromMaNV || ticket.MaNV_XuLy === fromMaNV || assignedCashierOf(ticket) === fromMaNV;
};

const canListAssignedReturn = (ticket, { maNV, maQuay, openShift = false } = {}) => {
    if (!ticket || !maNV) return false;
    if (ticket.MaNV_Lap === maNV || ticket.MaNV_XuLy === maNV) return true;
    return Boolean(openShift && isLeftoverReturn(ticket, maNV) && sameQuay(ticket, maQuay));
};

const canClaimLeftoverReturn = (ticket, maNV, maQuay) => {
    if (!maNV || !maQuay || !isLeftoverReturn(ticket, maNV)) return false;
    if (!ticket.MaQuayXuLy) return true;
    return ticket.MaQuayXuLy === maQuay;
};

const canProcessAssignedReturn = (ticket, maNV) => {
    if (!isUnfinishedReturn(ticket) || !maNV) return false;
    if (isLeftoverReturn(ticket, maNV)) return false;
    return assignedCashierOf(ticket) === maNV;
};

const canActOnAssignedReturn = (ticket, maNV, maQuay) => {
    if (!canProcessAssignedReturn(ticket, maNV)) return false;
    if (ticket.MaQuayXuLy && maQuay && ticket.MaQuayXuLy !== maQuay) return false;
    return true;
};

const MONEY_ACTION_STATUSES = ['Đã duyệt', 'Đang hoàn tiền', 'Hoàn tiền thất bại', 'Chờ xử lý hoàn tiền'];

const canCompleteAssignedReturn = (ticket, maNV, maQuay) => (
    Boolean(ticket && MONEY_ACTION_STATUSES.includes(ticket.TrangThai) && canActOnAssignedReturn(ticket, maNV, maQuay))
);

const applyReturnHandover = (ticket, { maQuay = null, fromMaCa = null, handedAt = new Date() } = {}) => {
    if (!isUnfinishedReturn(ticket)) return ticket;
    return {
        ...ticket,
        MaNV_XuLy: null,
        MaQuayXuLy: maQuay || ticket.MaQuayXuLy || null,
        NgayBanGiao: handedAt,
        MaCaBanGiao: fromMaCa || ticket.MaCaBanGiao || null
    };
};

const applyReturnAccept = (ticket, { maNV, maQuay = null, maCa = null } = {}) => {
    if (!isUnfinishedReturn(ticket) || !maNV) return ticket;
    return {
        ...ticket,
        MaNV_XuLy: maNV,
        MaQuayXuLy: maQuay || ticket.MaQuayXuLy || null,
        MaCaBanGiao: maCa || ticket.MaCaBanGiao || null
    };
};

const applyReturnClaim = applyReturnAccept;

const personLabel = (maNV, tenNV) => {
    const name = String(tenNV || '').trim();
    const code = String(maNV || '').trim();
    if (name && code) return `${name} (${code})`;
    return name || code || 'thu ngân';
};

const formatWhen = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const describeReturnHandover = ({
    openerMaNV,
    openerName,
    openerAt,
    parkedAt,
    claimerMaNV,
    claimerName,
    claimerAt,
    customerName,
    completed = false,
    completedAt
} = {}) => {
    const opener = personLabel(openerMaNV, openerName);
    const claimer = personLabel(claimerMaNV, claimerName);
    const customer = String(customerName || '').trim() || 'khách vãng lai';
    const stamp = (when, text) => (when ? `${formatWhen(when)} ${text}` : text);
    const parts = [stamp(openerAt, `${opener} lập phiếu`)];
    if (parkedAt) parts.push(stamp(parkedAt, 'treo cho ca sau cùng quầy (không chờ đúng người cũ)'));
    if (claimerMaNV) parts.push(stamp(claimerAt, `${claimer} mở ca và tự tiếp nhận`));
    if (completed) {
        parts.push(stamp(completedAt, `${claimer} hoàn tất đổi trả cho KH ${customer}`));
    } else if (claimerMaNV) {
        parts.push(`đang xử lý đổi trả cho KH ${customer}`);
    } else {
        parts.push(`chờ thu ngân mở ca hôm nay cùng quầy tự tiếp nhận — KH ${customer}`);
    }
    return parts.join(' → ');
};

const handoverAuditMessage = (fromCa, toCa) => `Bàn giao đổi trả ca ${fromCa} → ${toCa}`;

const UNFINISHED_SQL = `dt.TrangThai NOT IN (N'Hoàn thành', N'Từ chối', N'Đã hủy') AND dt.NgayHoan IS NULL`;
let claimSchemaReady = false;
let claimSchemaPromise = null;

const addColumnIfMissing = async (connection, column, definition) => {
    await requestOf(connection).query(`
        IF COL_LENGTH('dbo.PhieuDoiTra', '${column}') IS NULL
            ALTER TABLE dbo.PhieuDoiTra ADD ${definition};`);
};

const addFkIfMissing = async (connection, name, sqlText) => {
    try {
        await requestOf(connection).query(`
            IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'${name}')
            BEGIN
                ${sqlText}
            END`);
    } catch (error) {
        if (!/already|conflict|FOREIGN KEY/i.test(error.message || '')) throw error;
    }
};

const ensureReturnHandoverSchema = async (connection) => {
    if (claimSchemaReady) return;
    if (claimSchemaPromise) return claimSchemaPromise;
    claimSchemaPromise = (async () => {
        await addColumnIfMissing(connection, 'MaNV_XuLy', 'MaNV_XuLy VARCHAR(20) NULL');
        await addColumnIfMissing(connection, 'MaQuayXuLy', 'MaQuayXuLy VARCHAR(20) NULL');
        await addColumnIfMissing(connection, 'NgayBanGiao', 'NgayBanGiao DATETIME NULL');
        await addColumnIfMissing(connection, 'MaCaBanGiao', 'MaCaBanGiao VARCHAR(20) NULL');
        await addColumnIfMissing(connection, 'NgayTiepNhan', 'NgayTiepNhan DATETIME NULL');
        await requestOf(connection).query(`
            UPDATE dbo.PhieuDoiTra SET MaNV_XuLy = MaNV_Lap WHERE MaNV_XuLy IS NULL;`);
        await addFkIfMissing(connection, 'FK_PhieuDoiTra_MaNV_XuLy',
            'ALTER TABLE dbo.PhieuDoiTra ADD CONSTRAINT FK_PhieuDoiTra_MaNV_XuLy FOREIGN KEY (MaNV_XuLy) REFERENCES dbo.NhanVien (MaNV);');
        await addFkIfMissing(connection, 'FK_PhieuDoiTra_MaQuayXuLy',
            `IF COL_LENGTH('dbo.CaLamViec','MaQuay') IS NOT NULL AND OBJECT_ID(N'dbo.QuayBanHang', N'U') IS NOT NULL
                ALTER TABLE dbo.PhieuDoiTra ADD CONSTRAINT FK_PhieuDoiTra_MaQuayXuLy FOREIGN KEY (MaQuayXuLy) REFERENCES dbo.QuayBanHang (MaQuay);`);
        await addFkIfMissing(connection, 'FK_PhieuDoiTra_MaCaBanGiao',
            'ALTER TABLE dbo.PhieuDoiTra ADD CONSTRAINT FK_PhieuDoiTra_MaCaBanGiao FOREIGN KEY (MaCaBanGiao) REFERENCES dbo.CaLamViec (MaCa);');
        claimSchemaReady = true;
    })().catch((error) => {
        claimSchemaPromise = null;
        if (!isMissingHandoverColumn(error)) throw error;
    });
    return claimSchemaPromise;
};

const ensureReturnClaimSchema = ensureReturnHandoverSchema;

const leftoverSelect = `
            SELECT dt.MaDT, dt.MaHD, dt.MaNV_Lap, dt.MaNV_XuLy, dt.MaQuayXuLy, dt.NgayBanGiao,
                   dt.MaCaBanGiao, dt.NgayLap, dt.NgayHoan, dt.NgayTiepNhan, dt.HinhThucXuLy, dt.SoTienHoan, dt.LyDo, dt.TrangThai,
                   nv.TenNV NguoiXuLy, lap.TenNV NguoiLap, kh.TenKH
            FROM PhieuDoiTra dt
            LEFT JOIN NhanVien nv ON nv.MaNV=COALESCE(dt.MaNV_XuLy, dt.MaNV_Lap)
            LEFT JOIN NhanVien lap ON lap.MaNV=dt.MaNV_Lap
            LEFT JOIN HoaDon hd ON hd.MaHD=dt.MaHD
            LEFT JOIN KhachHang kh ON kh.MaKH=hd.MaKH`;

const loadUnfinishedReturns = async (connection, { maNV = null, maQuay = null } = {}) => safeHandover(async () => {
    await ensureReturnClaimSchema(connection);
    const result = await requestOf(connection)
        .input('MaNV', sql.VarChar, maNV)
        .input('MaQuay', sql.VarChar, maQuay)
        .query(`
            ${leftoverSelect}
            WHERE ${UNFINISHED_SQL}
              AND (
                    (@MaNV IS NOT NULL AND (dt.MaNV_Lap=@MaNV OR dt.MaNV_XuLy=@MaNV))
                 OR (@MaQuay IS NOT NULL AND dt.MaQuayXuLy=@MaQuay)
              )
            ORDER BY dt.NgayLap, dt.MaDT`);
    return result.recordset;
}, []);

const loadPendingApprovedReturns = async (connection, { maNV = null, maQuay = null } = {}) => {
    const rows = await loadUnfinishedReturns(connection, { maNV, maQuay });
    return rows.filter(item => item.TrangThai === 'Đã duyệt');
};

const loadLeftoverReturns = async (connection, { maQuay = null, maNV = null } = {}) => safeHandover(async () => {
    await ensureReturnClaimSchema(connection);
    const result = await requestOf(connection)
        .input('MaNV', sql.VarChar, maNV)
        .input('MaQuay', sql.VarChar, maQuay)
        .query(`
            ${leftoverSelect}
            WHERE ${UNFINISHED_SQL}
              AND dt.NgayBanGiao IS NOT NULL
              AND dt.MaNV_XuLy IS NULL
              AND (@MaQuay IS NULL OR dt.MaQuayXuLy=@MaQuay OR dt.MaQuayXuLy IS NULL)
            ORDER BY dt.NgayBanGiao, dt.MaDT`);
    return result.recordset;
}, []);

const healParkedReturns = async (connection) => safeHandover(async () => {
    await ensureReturnHandoverSchema(connection);
    const result = await requestOf(connection).query(`
        UPDATE dt
        SET MaNV_XuLy=NULL,
            NgayBanGiao=COALESCE(dt.NgayBanGiao, GETDATE()),
            MaQuayXuLy=COALESCE(dt.MaQuayXuLy, src.MaQuay),
            MaCaBanGiao=COALESCE(dt.MaCaBanGiao, src.MaCa)
        OUTPUT inserted.MaDT, inserted.MaQuayXuLy, inserted.MaCaBanGiao
        FROM PhieuDoiTra dt
        JOIN (
            SELECT dt2.MaDT,
                   COALESCE(
                        dt2.MaQuayXuLy, ca.MaQuay, lastCa.MaQuay, lich.MaQuay,
                        (SELECT TOP 1 q.MaQuay FROM QuayBanHang q ORDER BY q.MaQuay)
                   ) MaQuay,
                   COALESCE(dt2.MaCaBanGiao, hd.MaCa, lastCa.MaCa) MaCa
            FROM PhieuDoiTra dt2
            JOIN HoaDon hd ON hd.MaHD=dt2.MaHD
            LEFT JOIN CaLamViec ca ON ca.MaCa=hd.MaCa
            OUTER APPLY (
                SELECT TOP 1 c.MaCa, c.MaQuay
                FROM CaLamViec c
                WHERE c.MaNV=COALESCE(dt2.MaNV_XuLy, dt2.MaNV_Lap)
                ORDER BY c.ThoiGianBatDau DESC
            ) lastCa
            OUTER APPLY (
                SELECT TOP 1 l.MaQuay
                FROM LichLamViec l
                WHERE l.MaNV=COALESCE(dt2.MaNV_XuLy, dt2.MaNV_Lap) AND l.MaQuay IS NOT NULL
                ORDER BY l.NgayLam DESC
            ) lich
            WHERE dt2.TrangThai NOT IN (N'Hoàn thành', N'Từ chối', N'Đã hủy')
              AND dt2.NgayHoan IS NULL
              AND NOT EXISTS (
                    SELECT 1 FROM CaLamViec c
                    WHERE c.MaNV=COALESCE(dt2.MaNV_XuLy, dt2.MaNV_Lap)
                      AND c.TrangThai=N'Đang mở' AND c.ThoiGianKetThuc IS NULL
                      AND CONVERT(date, c.ThoiGianBatDau)=CONVERT(date, GETDATE())
              )
        ) src ON src.MaDT=dt.MaDT`);
    return result.recordset || [];
}, []);

const findNextCashierAtQuay = async (connection, maQuay, afterTime = null) => {
    if (!maQuay) return null;
    const openPos = await requestOf(connection)
        .input('MaQuay', sql.VarChar, maQuay)
        .input('AfterTime', sql.DateTime, afterTime)
        .query(`
            SELECT TOP 1 ca.MaNV, ca.MaCa MaLich, ca.MaQuay, ca.ThoiGianBatDau BatDauDuKien,
                   ca.ThoiGianBatDau KetThucDuKien, nv.TenNV, N'Ca đang mở' TenCa
            FROM CaLamViec ca
            JOIN NhanVien nv ON nv.MaNV=ca.MaNV
            WHERE ca.MaQuay=@MaQuay AND ca.TrangThai=N'Đang mở' AND ca.ThoiGianKetThuc IS NULL
              AND (@AfterTime IS NULL OR ca.ThoiGianBatDau>=@AfterTime)
            ORDER BY ca.ThoiGianBatDau`);
    if (openPos.recordset[0]) return openPos.recordset[0];
    const result = await requestOf(connection)
        .input('MaQuay', sql.VarChar, maQuay)
        .input('AfterTime', sql.DateTime, afterTime)
        .query(`
            SELECT TOP 1 l.MaNV, l.MaLich, l.MaQuay, l.BatDauDuKien, l.KetThucDuKien,
                   nv.TenNV, lc.TenCa, l.NhiemVu
            FROM LichLamViec l
            JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
            JOIN NhanVien nv ON nv.MaNV=l.MaNV
            WHERE l.TrangThai=N'Đã công bố'
              AND nv.ChucVu=N'Thu ngân'
              AND lc.MaLoaiCa<>N'HANH_CHINH' AND ISNULL(lc.NhomCa,N'')<>N'HANH_CHINH'
              AND l.NhiemVu IN (N'Ca chính full-time', N'Thu ngân', N'Tăng cường part-time', N'Hỗ trợ thu ngân')
              AND (l.MaQuay=@MaQuay OR (l.MaQuay IS NULL AND l.NhiemVu IN (N'Tăng cường part-time', N'Hỗ trợ thu ngân')))
              AND (@AfterTime IS NULL OR l.BatDauDuKien>=@AfterTime)
              AND l.KetThucDuKien>GETDATE()
            ORDER BY CASE WHEN l.MaQuay=@MaQuay THEN 0 ELSE 1 END, l.BatDauDuKien`);
    return result.recordset[0] || null;
};

const handoverApprovedReturns = async (transaction, { fromMaNV, maQuay, fromMaCa = null, afterTime = null }) => safeHandover(async () => {
    const pending = await loadUnfinishedReturns(transaction, { maNV: fromMaNV });
    const toHand = pending.filter(item => shouldHandoverReturn(item, { fromMaNV }));
    if (!toHand.length) return { handed: [], next: null, warning: null };

    const next = await findNextCashierAtQuay(transaction, maQuay, afterTime);
    const result = await new sql.Request(transaction)
        .input('MaNV', sql.VarChar, fromMaNV)
        .input('MaQuayXuLy', sql.VarChar, maQuay)
        .input('MaCaBanGiao', sql.VarChar, fromMaCa)
        .query(`
            UPDATE dt
            SET MaNV_XuLy=NULL,
                MaQuayXuLy=COALESCE(@MaQuayXuLy, dt.MaQuayXuLy),
                NgayBanGiao=GETDATE(),
                MaCaBanGiao=COALESCE(@MaCaBanGiao, dt.MaCaBanGiao)
            OUTPUT inserted.MaDT, inserted.MaHD, inserted.HinhThucXuLy, inserted.SoTienHoan,
                   inserted.LyDo, inserted.TrangThai, inserted.MaQuayXuLy, inserted.MaCaBanGiao,
                   inserted.MaNV_Lap, inserted.MaNV_XuLy
            FROM PhieuDoiTra dt
            WHERE ${UNFINISHED_SQL}
              AND (dt.MaNV_Lap=@MaNV OR dt.MaNV_XuLy=@MaNV)`);

    const handed = result.recordset.length ? result.recordset : toHand;
    const names = handed.map(item => item.MaDT).join(', ');
    const nextHint = next && next.MaNV !== fromMaNV
        ? ` ${next.TenNV} mở ca hôm nay cùng quầy sẽ tự tiếp nhận, không chờ người cũ.`
        : ' Ai mở ca hôm nay cùng quầy (ca chính hoặc tăng cường) sẽ tự thấy và tự tiếp nhận.';
    const warning = `Còn ${handed.length} phiếu đổi trả còn treo / chưa hoàn thành (${names}). Không khóa vào ca cũ.${nextHint}`;
    return { handed, next, warning };
}, { handed: [], next: null, warning: null });

const reclaimReturnsOnShiftReopen = async (transaction, { maNV, maCa }) => safeHandover(async () => {
    if (!maNV || !maCa) return [];
    await ensureReturnHandoverSchema(transaction);
    const result = await new sql.Request(transaction)
        .input('MaNV', sql.VarChar, maNV)
        .input('MaCa', sql.VarChar, maCa)
        .query(`
            UPDATE dt
            SET MaNV_XuLy=@MaNV,
                NgayBanGiao=NULL,
                MaCaBanGiao=NULL
            OUTPUT inserted.MaDT
            FROM PhieuDoiTra dt
            WHERE ${UNFINISHED_SQL}
              AND dt.MaCaBanGiao=@MaCa
              AND dt.MaNV_XuLy IS NULL
              AND dt.NgayBanGiao IS NOT NULL`);
    return result.recordset || [];
}, []);

const acceptLeftoverReturn = async (transaction, { maDT, maNV, maQuay, maCa }) => {
    if (!maDT || !maNV || !maQuay || !maCa) return null;
    return safeHandover(async () => {
        await ensureReturnClaimSchema(transaction);
        const result = await new sql.Request(transaction)
            .input('MaDT', sql.VarChar, maDT)
            .input('MaNV', sql.VarChar, maNV)
            .input('MaQuay', sql.VarChar, maQuay)
            .input('MaCa', sql.VarChar, maCa)
            .query(`
                UPDATE PhieuDoiTra
                SET MaNV_XuLy=@MaNV, MaQuayXuLy=@MaQuay, MaCaBanGiao=@MaCa, NgayTiepNhan=GETDATE()
                OUTPUT inserted.MaDT, inserted.MaNV_Lap, inserted.MaNV_XuLy, inserted.MaQuayXuLy,
                       inserted.MaCaBanGiao, inserted.NgayBanGiao, inserted.NgayTiepNhan,
                       inserted.TrangThai, inserted.MaHD, inserted.NgayLap
                WHERE MaDT=@MaDT
                  AND TrangThai NOT IN (N'Hoàn thành', N'Từ chối', N'Đã hủy')
                  AND NgayHoan IS NULL
                  AND NgayBanGiao IS NOT NULL
                  AND (MaQuayXuLy=@MaQuay OR MaQuayXuLy IS NULL)
                  AND MaNV_XuLy IS NULL`);
        return result.recordset[0] || null;
    }, null);
};

const claimLeftoverReturnsForShift = async (connection, { maNV, maQuay, maCa }) => {
    if (!maNV || !maQuay || !maCa) return [];
    const leftover = await loadLeftoverReturns(connection, { maNV, maQuay });
    const claimed = [];
    for (const row of leftover) {
        if (!canClaimLeftoverReturn(row, maNV, maQuay)) continue;
        const accepted = await acceptLeftoverReturn(connection, {
            maDT: row.MaDT, maNV, maQuay, maCa
        });
        if (accepted) claimed.push({ ...row, ...accepted });
    }
    return claimed;
};

const claimHandoverReturns = async (transaction, { maNV, maQuay }) => {
    const leftover = await loadLeftoverReturns(transaction, { maNV, maQuay });
    return leftover.map(row => ({ MaDT: row.MaDT, MaCaTruoc: row.MaCaBanGiao }));
};

module.exports = {
    TERMINAL_RETURN_STATUSES,
    COUNTER_DUTIES,
    isUnfinishedReturn,
    isClosedReturn,
    isLeftoverReturn,
    shouldHandoverReturn,
    canListAssignedReturn,
    canClaimLeftoverReturn,
    canProcessAssignedReturn,
    canActOnAssignedReturn,
    canCompleteAssignedReturn,
    assignedCashierOf,
    applyReturnHandover,
    applyReturnAccept,
    applyReturnClaim,
    describeReturnHandover,
    handoverAuditMessage,
    loadUnfinishedReturns,
    loadPendingApprovedReturns,
    loadLeftoverReturns,
    healParkedReturns,
    findNextCashierAtQuay,
    handoverApprovedReturns,
    reclaimReturnsOnShiftReopen,
    acceptLeftoverReturn,
    claimLeftoverReturnsForShift,
    claimHandoverReturns,
    ensureReturnHandoverSchema,
    ensureReturnClaimSchema,
    formatWhen
};
