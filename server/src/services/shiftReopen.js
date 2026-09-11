const { sql } = require('../config/db');
const { logAudit } = require('./auditLog');
const { reclaimReturnsOnShiftReopen, ensureReturnHandoverSchema } = require('./returnHandover');

class ShiftReopenError extends Error {
    constructor(message, status = 400, extra = {}) {
        super(message);
        this.name = 'ShiftReopenError';
        this.status = status;
        Object.assign(this, extra);
    }
}

const requestOf = (connection) => (
    typeof connection.request === 'function' ? connection.request() : new sql.Request(connection)
);

const isConfirmedFundReceipt = (receipt) => {
    const status = String(receipt?.TrangThai || '').trim();
    return Boolean(receipt && (status === 'Đã xác nhận' || receipt.NgayXacNhan));
};

const otherOpenShiftBlocks = (targetMaCa, openRow) => Boolean(openRow && openRow.MaCa !== targetMaCa);

const deleteMistakeLogs = async (connection, { maCa, maPT = null, maChamCong = null }) => {
    const deleted = [];
    if (maCa) {
        const closeLogs = await requestOf(connection)
            .input('MaCa', sql.VarChar, maCa)
            .query(`
                DELETE FROM NhatKy
                OUTPUT deleted.MaNK, deleted.HanhDong, deleted.MaBanGhi
                WHERE (
                        HanhDong=N'Đóng ca bán hàng' AND BangLienQuan=N'CaLamViec' AND MaBanGhi=@MaCa
                    ) OR (
                        HanhDong=N'Bàn giao đổi trả' AND NoiDung LIKE N'%' + @MaCa + '%'
                    ) OR (
                        HanhDong=N'Mở lại ca bán hàng' AND BangLienQuan=N'CaLamViec' AND MaBanGhi=@MaCa
                    )`);
        deleted.push(...(closeLogs.recordset || []));
    }
    if (maPT) {
        const receiptLogs = await requestOf(connection)
            .input('MaPT', sql.VarChar, maPT)
            .query(`
                DELETE FROM NhatKy
                OUTPUT deleted.MaNK, deleted.HanhDong, deleted.MaBanGhi
                WHERE HanhDong=N'Lập Phiếu thu cuối ca' AND BangLienQuan=N'PhieuThu' AND MaBanGhi=@MaPT`);
        deleted.push(...(receiptLogs.recordset || []));
    }
    if (maChamCong) {
        const attendanceLogs = await requestOf(connection)
            .input('MaCC', sql.VarChar, String(maChamCong))
            .query(`
                DELETE FROM NhatKy
                OUTPUT deleted.MaNK, deleted.HanhDong, deleted.MaBanGhi
                WHERE BangLienQuan=N'ChamCong' AND MaBanGhi=@MaCC
                  AND (HanhDong LIKE N'%chấm công ra%' OR HanhDong LIKE N'%Chấm công ra%' OR HanhDong LIKE N'%Đóng ca%')`);
        deleted.push(...(attendanceLogs.recordset || []));
    }
    return deleted;
};

const reopenShift = async (transaction, {
    maCa,
    user = null,
    req = null,
    silent = false,
    lyDo = ''
} = {}) => {
    const code = String(maCa || '').trim();
    if (!code) throw new ShiftReopenError('Thiếu mã ca cần mở lại.');

    await ensureReturnHandoverSchema(transaction).catch(() => {});
    await require('./returnRefundSchema').ensureReturnRefundSchema(transaction).catch(() => {});

    const shift = await new sql.Request(transaction).input('MaCa', sql.VarChar, code).query(`
        SELECT ca.*, nv.TenNV
        FROM CaLamViec ca WITH (UPDLOCK, HOLDLOCK)
        JOIN NhanVien nv ON nv.MaNV=ca.MaNV
        WHERE ca.MaCa=@MaCa`);
    if (!shift.recordset.length) throw new ShiftReopenError('Không tìm thấy ca bán hàng.', 404);
    const row = shift.recordset[0];

    if (row.TrangThai === 'Đang mở' && !row.ThoiGianKetThuc) {
        return {
            alreadyOpen: true,
            MaCa: row.MaCa,
            TrangThai: row.TrangThai,
            MaNV: row.MaNV,
            TenNV: row.TenNV,
            deletedLogs: [],
            reclaimedReturns: []
        };
    }

    const openByEmployee = await new sql.Request(transaction).input('MaNV', sql.VarChar, row.MaNV).query(`
        SELECT MaCa FROM CaLamViec WITH (UPDLOCK, HOLDLOCK)
        WHERE MaNV=@MaNV AND TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL`);
    if (otherOpenShiftBlocks(code, openByEmployee.recordset[0])) {
        throw new ShiftReopenError(
            `Nhân viên đã có ca ${openByEmployee.recordset[0].MaCa} đang mở. Không mở ca thứ hai.`
        );
    }

    if (row.MaQuay) {
        const openByCounter = await new sql.Request(transaction).input('MaQuay', sql.VarChar, row.MaQuay).query(`
            SELECT MaCa, MaNV FROM CaLamViec WITH (UPDLOCK, HOLDLOCK)
            WHERE MaQuay=@MaQuay AND TrangThai=N'Đang mở' AND ThoiGianKetThuc IS NULL`);
        if (otherOpenShiftBlocks(code, openByCounter.recordset[0])) {
            throw new ShiftReopenError(
                `Quầy đang có ca ${openByCounter.recordset[0].MaCa} mở. Không mở lại ca này để tránh hai ca cùng quầy.`
            );
        }
    }

    const receipt = await new sql.Request(transaction).input('MaCa', sql.VarChar, code)
        .query('SELECT * FROM PhieuThu WITH (UPDLOCK, HOLDLOCK) WHERE MaCa=@MaCa');
    const pt = receipt.recordset[0] || null;
    if (isConfirmedFundReceipt(pt)) {
        throw new ShiftReopenError(
            `Không mở lại ca ${code}: phiếu thu ${pt.MaPT} đã xác nhận — quỹ đã khóa (P0).`,
            409,
            { fundLocked: true, MaPT: pt.MaPT }
        );
    }

    if (pt) {
        try {
            const journals = await new sql.Request(transaction).input('MaPT', sql.VarChar, pt.MaPT).query(`
                SELECT COUNT(*) SoBT FROM ButToan
                WHERE LoaiChungTu=N'PhieuThu' AND MaChungTu=@MaPT AND ISNULL(DaBiDao,0)=0`);
            if (Number(journals.recordset[0]?.SoBT || 0) > 0) {
                throw new ShiftReopenError(
                    `Không mở lại ca ${code}: phiếu thu ${pt.MaPT} đã có bút toán quỹ.`,
                    409,
                    { fundLocked: true, MaPT: pt.MaPT }
                );
            }
        } catch (error) {
            if (error instanceof ShiftReopenError) throw error;
            if (!/Invalid object name|ButToan/i.test(error.message || '')) throw error;
        }
        await new sql.Request(transaction).input('MaPT', sql.VarChar, pt.MaPT)
            .query('DELETE FROM PhieuThu WHERE MaPT=@MaPT AND TrangThai=N\'Nháp\'');
    }

    const reclaimedReturns = await reclaimReturnsOnShiftReopen(transaction, {
        maNV: row.MaNV,
        maCa: code
    });

    await new sql.Request(transaction).input('MaCa', sql.VarChar, code).query(`
        UPDATE CaLamViec SET
            ThoiGianKetThuc=NULL,
            NgayDongCa=NULL,
            TienCuoiCa=NULL,
            TongTienMat=NULL,
            TongTienQR=NULL,
            TongTienThe=NULL,
            TongTienChuyenKhoan=NULL,
            TongTienHoanMat=NULL,
            TongTienHoanQR=NULL,
            TienMatHeThong=NULL,
            TienThucNop=NULL,
            TrangThai=N'Đang mở',
            TrangThaiDoiSoat=N'Chưa đóng'
        WHERE MaCa=@MaCa`);

    await new sql.Request(transaction).input('MaCa', sql.VarChar, code).query(`
        UPDATE cc SET ThoiGianRa=NULL, TrangThai=N'Đang làm việc', PhutVeSom=0
        FROM ChamCong cc
        JOIN LichLamViec l ON l.MaLich=cc.MaLich
        JOIN CaLamViec ca ON ca.MaNV=l.MaNV
          AND (
                (ca.MaLich IS NOT NULL AND ca.MaLich=cc.MaLich)
             OR ca.ThoiGianBatDau BETWEEN DATEADD(minute, -60, cc.ThoiGianVao)
                                     AND DATEADD(minute,  60, cc.ThoiGianVao)
          )
        WHERE ca.MaCa=@MaCa AND cc.ThoiGianVao IS NOT NULL`);

    const deletedLogs = await deleteMistakeLogs(transaction, {
        maCa: code,
        maPT: pt && String(pt.TrangThai || '') === 'Nháp' ? pt.MaPT : null
    });

    if (!silent && user) {
        const reason = String(lyDo || '').trim();
        await logAudit(transaction, {
            user, req, action: 'Mở lại ca bán hàng', table: 'CaLamViec', recordId: code, uc: 'UC22',
            severity: 'Cảnh báo',
            content: `Mở lại ca đóng nhầm${reason ? `; lý do: ${reason}` : ''}`
        });
    }

    return {
        alreadyOpen: false,
        MaCa: code,
        TrangThai: 'Đang mở',
        MaNV: row.MaNV,
        TenNV: row.TenNV,
        deletedDraftReceipt: pt && String(pt.TrangThai || '') === 'Nháp' ? pt.MaPT : null,
        reclaimedReturns: reclaimedReturns.map(item => item.MaDT),
        deletedLogs
    };
};

const undoAccidentalCheckOut = async (connection, { maChamCong, silentLogs = true } = {}) => {
    const id = Number(maChamCong);
    if (!Number.isFinite(id) || id <= 0) throw new ShiftReopenError('Thiếu mã chấm công.');

    const row = await requestOf(connection).input('MaChamCong', sql.BigInt, id).query(`
        SELECT cc.MaChamCong, cc.MaLich, cc.ThoiGianVao, cc.ThoiGianRa, cc.TrangThai,
               l.MaNV, nv.TenNV, tk.TenDangNhap, lc.TenCa
        FROM ChamCong cc
        JOIN LichLamViec l ON l.MaLich=cc.MaLich
        JOIN NhanVien nv ON nv.MaNV=l.MaNV
        JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
        LEFT JOIN TaiKhoan tk ON tk.MaNV=l.MaNV
        WHERE cc.MaChamCong=@MaChamCong`);
    if (!row.recordset.length) throw new ShiftReopenError('Không tìm thấy lượt chấm công.', 404);
    const item = row.recordset[0];
    if (!item.ThoiGianRa) {
        return { alreadyOpen: true, ...item, deletedLogs: [] };
    }

    await requestOf(connection).input('MaChamCong', sql.BigInt, id).query(`
        UPDATE ChamCong
        SET ThoiGianRa=NULL, TrangThai=N'Đang làm việc', PhutVeSom=0
        WHERE MaChamCong=@MaChamCong AND ThoiGianVao IS NOT NULL`);

    const deletedLogs = silentLogs
        ? await deleteMistakeLogs(connection, { maChamCong: id })
        : [];

    return {
        alreadyOpen: false,
        MaChamCong: id,
        MaNV: item.MaNV,
        TenNV: item.TenNV,
        TenDangNhap: item.TenDangNhap,
        TenCa: item.TenCa,
        TrangThai: 'Đang làm việc',
        deletedLogs
    };
};

const findTodayAccident = async (pool) => {
    const closedPos = await pool.request().query(`
        SELECT TOP 1 ca.MaCa, ca.MaNV, nv.TenNV, tk.TenDangNhap, ca.TrangThai, ca.TrangThaiDoiSoat,
               ca.ThoiGianKetThuc, pt.MaPT, pt.TrangThai TrangThaiPT, pt.NgayXacNhan
        FROM CaLamViec ca
        JOIN NhanVien nv ON nv.MaNV=ca.MaNV
        LEFT JOIN TaiKhoan tk ON tk.MaNV=ca.MaNV
        LEFT JOIN PhieuThu pt ON pt.MaCa=ca.MaCa
        WHERE CONVERT(date, ISNULL(ca.NgayDongCa, ca.ThoiGianKetThuc))=CONVERT(date, GETDATE())
          AND ca.TrangThai=N'Đã chốt'
        ORDER BY ca.ThoiGianKetThuc DESC`);

    const checkOut = await pool.request().query(`
        SELECT TOP 1 cc.MaChamCong, cc.MaLich, cc.ThoiGianVao, cc.ThoiGianRa, cc.TrangThai,
               l.MaNV, nv.TenNV, tk.TenDangNhap, lc.TenCa,
               DATEDIFF(second, cc.ThoiGianVao, cc.ThoiGianRa) SoGiay
        FROM ChamCong cc
        JOIN LichLamViec l ON l.MaLich=cc.MaLich
        JOIN NhanVien nv ON nv.MaNV=l.MaNV
        JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
        LEFT JOIN TaiKhoan tk ON tk.MaNV=l.MaNV
        WHERE cc.ThoiGianVao IS NOT NULL AND cc.ThoiGianRa IS NOT NULL
          AND CONVERT(date, ISNULL(cc.ThoiGianRa, l.NgayLam))=CONVERT(date, GETDATE())
        ORDER BY cc.ThoiGianRa DESC`);

    return {
        closedPos: closedPos.recordset[0] || null,
        checkOut: checkOut.recordset[0] || null
    };
};

module.exports = {
    ShiftReopenError,
    isConfirmedFundReceipt,
    otherOpenShiftBlocks,
    reopenShift,
    undoAccidentalCheckOut,
    findTodayAccident,
    deleteMistakeLogs
};
