require('dotenv').config();
const { sql, poolPromise } = require('./src/config/db');

const EXTRA_CASHIER_ID = 'NV_TN09';
const EXTRA_ACCOUNT = 'thungan09';
const FALLBACK_NV = 'NV_TN08';
const FALLBACK_MANAGER = 'NV_QL01';

async function reassignRemainingEmployeeFks(request, maNV) {
    const fks = await request.query(`
        SELECT OBJECT_NAME(fk.parent_object_id) Bang,
               COL_NAME(fc.parent_object_id, fc.parent_column_id) Cot,
               c.is_nullable IsNullable
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fc ON fc.constraint_object_id = fk.object_id
        JOIN sys.columns c ON c.object_id = fc.parent_object_id AND c.column_id = fc.parent_column_id
        WHERE fk.referenced_object_id = OBJECT_ID('dbo.NhanVien')
          AND OBJECT_NAME(fk.parent_object_id) NOT IN ('TaiKhoan','NhanVien')`);
    for (const row of fks.recordset) {
        const target = row.IsNullable ? 'NULL' : (row.Cot.toLowerCase().includes('duyet') || row.Cot.toLowerCase().includes('phancong') || row.Cot.toLowerCase().includes('congbo')
            ? `'${FALLBACK_MANAGER}'`
            : `'${FALLBACK_NV}'`);
        await request.query(`
            UPDATE dbo.[${row.Bang}]
            SET [${row.Cot}] = ${target}
            WHERE [${row.Cot}] = '${maNV}'`);
    }
}

async function purgeExtraCashier(pool) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = () => new sql.Request(transaction);
    try {
        const account = await request().input('MaNV', sql.VarChar, EXTRA_CASHIER_ID)
            .input('TenDangNhap', sql.VarChar, EXTRA_ACCOUNT)
            .query(`SELECT TOP 1 MaTK FROM dbo.TaiKhoan WHERE MaNV=@MaNV OR TenDangNhap=@TenDangNhap`);
        const maTK = account.recordset[0]?.MaTK;

        await request().input('MaNV', sql.VarChar, EXTRA_CASHIER_ID).query(`
            IF OBJECT_ID('dbo.ChiTietBangLuong','U') IS NOT NULL
            BEGIN
                DELETE ct FROM dbo.ChiTietBangLuong ct
                JOIN dbo.BangLuong bl ON bl.MaBangLuong = ct.MaBangLuong
                WHERE bl.MaNV = @MaNV;
                DELETE ct FROM dbo.ChiTietBangLuong ct
                JOIN dbo.ChamCong cc ON cc.MaChamCong = ct.MaChamCong
                JOIN dbo.LichLamViec l ON l.MaLich = cc.MaLich
                WHERE l.MaNV = @MaNV;
            END;
            IF OBJECT_ID('dbo.BangLuong','U') IS NOT NULL
                DELETE FROM dbo.BangLuong WHERE MaNV = @MaNV;
            IF OBJECT_ID('dbo.KyLuong','U') IS NOT NULL
                UPDATE dbo.KyLuong SET NguoiLap = NULL WHERE NguoiLap = @MaNV;
            IF OBJECT_ID('dbo.DieuChinhChamCong','U') IS NOT NULL
            BEGIN
                UPDATE dbo.DieuChinhChamCong SET NguoiDuyet = NULL WHERE NguoiDuyet = @MaNV;
                DELETE d FROM dbo.DieuChinhChamCong d
                JOIN dbo.ChamCong cc ON cc.MaChamCong = d.MaChamCong
                JOIN dbo.LichLamViec l ON l.MaLich = cc.MaLich
                WHERE l.MaNV = @MaNV OR d.NguoiDeXuat = @MaNV;
            END;
            IF OBJECT_ID('dbo.ChamCong','U') IS NOT NULL
            BEGIN
                UPDATE dbo.ChamCong SET NguoiDuyet = NULL WHERE NguoiDuyet = @MaNV;
                DELETE cc FROM dbo.ChamCong cc
                JOIN dbo.LichLamViec l ON l.MaLich = cc.MaLich
                WHERE l.MaNV = @MaNV;
            END;

            IF COL_LENGTH('dbo.PhieuDoiTra','MaCaHoan') IS NOT NULL
                UPDATE dbo.PhieuDoiTra SET MaCaHoan = NULL
                WHERE MaCaHoan IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV);

            UPDATE dbo.PhieuDoiTra SET MaNV_Duyet = NULL WHERE MaNV_Duyet = @MaNV;
            UPDATE dbo.PhieuDoiTra SET MaNV_KiemTra = NULL WHERE MaNV_KiemTra = @MaNV;

            DELETE ctdt FROM dbo.ChiTietDoiTra ctdt
            JOIN dbo.PhieuDoiTra dt ON dt.MaDT = ctdt.MaDT
            WHERE dt.MaNV_Lap = @MaNV
               OR dt.MaHD IN (SELECT MaHD FROM dbo.HoaDon WHERE MaNV = @MaNV
                              OR MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV));
            DELETE FROM dbo.PhieuDoiTra
            WHERE MaNV_Lap = @MaNV
               OR MaHD IN (SELECT MaHD FROM dbo.HoaDon WHERE MaNV = @MaNV
                           OR MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV));
            DELETE FROM dbo.PhieuThu
            WHERE MaNV_Lap = @MaNV
               OR MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV);
            DELETE tt FROM dbo.ThanhToan tt
            JOIN dbo.HoaDon hd ON hd.MaHD = tt.MaHD
            WHERE hd.MaNV = @MaNV OR hd.MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV);
            DELETE ct FROM dbo.ChiTietHoaDon ct
            JOIN dbo.HoaDon hd ON hd.MaHD = ct.MaHD
            WHERE hd.MaNV = @MaNV OR hd.MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV);
            DELETE FROM dbo.HoaDon
            WHERE MaNV = @MaNV OR MaCa IN (SELECT MaCa FROM dbo.CaLamViec WHERE MaNV = @MaNV);

            IF COL_LENGTH('dbo.CaLamViec','MaLich') IS NOT NULL
                UPDATE dbo.CaLamViec SET MaLich = NULL WHERE MaNV = @MaNV;
            DELETE FROM dbo.CaLamViec WHERE MaNV = @MaNV;

            IF OBJECT_ID('dbo.LichLamViec','U') IS NOT NULL
            BEGIN
                UPDATE dbo.LichLamViec SET NguoiPhanCong = '${FALLBACK_MANAGER}'
                WHERE NguoiPhanCong = @MaNV AND MaNV <> @MaNV;
                IF COL_LENGTH('dbo.LichLamViec','NguoiCongBo') IS NOT NULL
                    UPDATE dbo.LichLamViec SET NguoiCongBo = '${FALLBACK_MANAGER}'
                    WHERE NguoiCongBo = @MaNV AND MaNV <> @MaNV;
                DELETE FROM dbo.LichLamViec WHERE MaNV = @MaNV;
            END;
            IF OBJECT_ID('dbo.MucLuongNhanVien','U') IS NOT NULL
                DELETE FROM dbo.MucLuongNhanVien WHERE MaNV = @MaNV;
        `);

        await reassignRemainingEmployeeFks(request(), EXTRA_CASHIER_ID);

        if (maTK) {
            await request().input('MaTK', sql.Int, maTK)
                .query('DELETE FROM dbo.NhatKy WHERE MaTK = @MaTK');
        }
        await request().input('MaNV', sql.VarChar, EXTRA_CASHIER_ID)
            .input('TenDangNhap', sql.VarChar, EXTRA_ACCOUNT)
            .query(`DELETE FROM dbo.TaiKhoan WHERE MaNV = @MaNV OR TenDangNhap = @TenDangNhap;
                    DELETE FROM dbo.NhanVien WHERE MaNV = @MaNV;`);
        await transaction.commit();
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
}

async function dashboardCounts(pool) {
    const result = await pool.request().query(`
        SELECT
            (SELECT COUNT(*) FROM NhanVien) AS TongNhanVien,
            (SELECT COUNT(*) FROM NhanVien WHERE TrangThai = N'Đang làm việc') AS NhanVienDangLam,
            (SELECT COUNT(*) FROM TaiKhoan) AS TongTaiKhoan,
            (SELECT COUNT(*) FROM TaiKhoan WHERE TrangThai = 1) AS TaiKhoanHoatDong,
            (SELECT COUNT(*) FROM TaiKhoan WHERE TrangThai = 0) AS TaiKhoanBiKhoa,
            (SELECT COUNT(*) FROM NhanVien WHERE MaNV = 'NV_TN09') AS ConNV_TN09,
            (SELECT COUNT(*) FROM TaiKhoan WHERE TenDangNhap = 'thungan09') AS ConThungan09`);
    return result.recordset[0];
}

async function runCli() {
    const pool = await poolPromise;
    try {
        await purgeExtraCashier(pool);
        const counts = await dashboardCounts(pool);
        console.log('Đã xóa hẳn NV_TN09 / thungan09.');
        console.table(counts);
    } finally {
        await pool.close().catch(() => {});
    }
}

module.exports = { purgeExtraCashier };

if (require.main === module) {
    runCli().then(() => process.exit(0)).catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
