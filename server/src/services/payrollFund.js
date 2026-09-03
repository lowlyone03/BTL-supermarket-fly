const { sql } = require('../config/db');

const loadFund = async (connection, maKy) => {
    const result = await new sql.Request(connection).input('MaKy', sql.VarChar, maKy).query(`
        SELECT q.*, ql.TenNV AS TenQL
        FROM QuyLuongKy q
        LEFT JOIN NhanVien ql ON ql.MaNV=q.MaNV_QL
        WHERE q.MaKy=@MaKy`);
    return result.recordset[0] || null;
};

const loadAccountant = async (connection, maKy) => {
    if (maKy) {
        const fromVouchers = await new sql.Request(connection).input('MaKy', sql.VarChar, maKy).query(`
            SELECT TOP 1 nv.MaNV, nv.TenNV, nv.ChucVu
            FROM PhieuChiLuong pcl
            JOIN NhanVien nv ON nv.MaNV=pcl.MaNV_Lap
            JOIN TaiKhoan tk ON tk.MaNV=nv.MaNV
            JOIN VaiTro vt ON vt.MaVaiTro=tk.MaVaiTro
            WHERE pcl.MaKy=@MaKy AND vt.TenVaiTro=N'Kế toán'
            ORDER BY pcl.NgayLap`);
        if (fromVouchers.recordset[0]) {
            return { ...fromVouchers.recordset[0], VaiTro: 'Kế toán' };
        }
    }
    const working = await new sql.Request(connection).query(`
        SELECT TOP 1 nv.MaNV, nv.TenNV, nv.ChucVu
        FROM NhanVien nv
        JOIN TaiKhoan tk ON tk.MaNV=nv.MaNV
        JOIN VaiTro vt ON vt.MaVaiTro=tk.MaVaiTro
        WHERE vt.TenVaiTro=N'Kế toán'
          AND ISNULL(nv.TrangThai, N'Đang làm việc')=N'Đang làm việc'
        ORDER BY nv.TenNV`);
    return working.recordset[0] ? { ...working.recordset[0], VaiTro: 'Kế toán' } : null;
};

const unpaidNeed = async (connection, maKy) => {
    const result = await new sql.Request(connection).input('MaKy', sql.VarChar, maKy).query(`
        SELECT PhuongThuc, COUNT(*) SoPhieu, COALESCE(SUM(SoTien),0) Tong
        FROM PhieuChiLuong
        WHERE MaKy=@MaKy AND TrangThai IN (N'Đã duyệt', N'Thanh toán thất bại')
        GROUP BY PhuongThuc`);
    const of = method => result.recordset.find(row => row.PhuongThuc === method);
    const tm = of('Tiền mặt');
    const ck = of('Chuyển khoản');
    return {
        tmNeed: Number(tm?.Tong || 0),
        ckNeed: Number(ck?.Tong || 0),
        tmCount: Number(tm?.SoPhieu || 0),
        ckCount: Number(ck?.SoPhieu || 0)
    };
};

const listPayouts = async (connection, { maKy = '', actor = '', take = 80 } = {}) => {
    const result = await new sql.Request(connection)
        .input('MaKy', sql.VarChar, maKy)
        .input('Actor', sql.VarChar, actor)
        .input('Take', sql.Int, take)
        .query(`
            SELECT TOP (@Take) ls.MaLS,ls.MaKy,ls.MaPhieu,ls.MaNV,nv.TenNV,ls.SoTien,ls.PhuongThuc,
                   ls.MaGiaoDichNganHang,ls.SoTienMatCon,ls.SoTienCKCon,ls.MaNV_KT,kt.TenNV AS NguoiChi,
                   ls.NgayChi,ls.ThanhCong,ls.GhiChu
            FROM LichSuChiLuong ls
            JOIN NhanVien nv ON nv.MaNV=ls.MaNV
            JOIN NhanVien kt ON kt.MaNV=ls.MaNV_KT
            WHERE (@MaKy='' OR ls.MaKy=@MaKy)
              AND (@Actor='' OR ls.MaNV_KT=@Actor)
            ORDER BY ls.NgayChi DESC, ls.MaLS DESC`);
    return result.recordset;
};

const snapshotFund = async (connection, maKy) => {
    const [fund, need, payouts, accountant] = await Promise.all([
        loadFund(connection, maKy),
        unpaidNeed(connection, maKy),
        listPayouts(connection, { maKy, take: 80 }),
        loadAccountant(connection, maKy)
    ]);
    const tmCon = Number(fund?.SoTienMatCon || 0);
    const ckCon = Number(fund?.SoTienCKCon || 0);
    const presented = fund ? {
        ...fund,
        SoTienMatGiao: Number(fund.SoTienMatGiao || 0),
        SoTienMatCon: tmCon,
        SoTienCKGiao: Number(fund.SoTienCKGiao || 0),
        SoTienCKCon: ckCon
    } : null;
    return {
        fund: presented,
        accountant,
        need,
        payouts,
        tmTopUp: Math.max(0, need.tmNeed - tmCon),
        ckTopUp: Math.max(0, need.ckNeed - ckCon),
        tmReady: tmCon > 0,
        ckReady: Number(fund?.SoTienCKGiao || 0) > 0,
        handed: Boolean(fund?.NgayGiao)
    };
};

const canPayFromFund = (snapshot, method, amount) => {
    if (method === 'Tiền mặt') {
        return Number(snapshot?.fund?.SoTienMatCon || 0) >= Number(amount || 0);
    }
    return Number(snapshot?.fund?.SoTienCKCon || 0) >= Number(amount || 0);
};

module.exports = { loadFund, loadAccountant, unpaidNeed, listPayouts, snapshotFund, canPayFromFund };
