require('./src/config/loadEnv').loadEnv();
const { sql, poolPromise } = require('./src/config/db');
const { reopenShift, undoAccidentalCheckOut, findTodayAccident, isConfirmedFundReceipt } = require('./src/services/shiftReopen');

const report = [];
const log = (line) => {
    report.push(line);
    console.log(line);
};

(async () => {
    const pool = await poolPromise;
    const accident = await findTodayAccident(pool);
    log(`Hôm nay (SQL): ${new Date().toISOString()}`);
    log(`Ca POS đóng gần nhất hôm nay: ${accident.closedPos
        ? `${accident.closedPos.MaCa} · ${accident.closedPos.TenDangNhap} · ${accident.closedPos.TrangThai} · PT ${accident.closedPos.MaPT || 'không'} (${accident.closedPos.TrangThaiPT || '—'})`
        : 'không có'}`);
    log(`Chấm công ra gần nhất hôm nay: ${accident.checkOut
        ? `${accident.checkOut.TenDangNhap} · ${accident.checkOut.TenCa} · MaChamCong ${accident.checkOut.MaChamCong} · ${accident.checkOut.SoGiay} giây`
        : 'không có'}`);

    let reopenedShift = null;
    if (accident.closedPos && !isConfirmedFundReceipt({
        TrangThai: accident.closedPos.TrangThaiPT,
        NgayXacNhan: accident.closedPos.NgayXacNhan
    })) {
        const transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        try {
            reopenedShift = await reopenShift(transaction, {
                maCa: accident.closedPos.MaCa,
                silent: true
            });
            await transaction.commit();
            log(`Đã mở lại ca POS ${reopenedShift.MaCa} → ${reopenedShift.TrangThai}`);
            log(`  Log đã xóa: ${(reopenedShift.deletedLogs || []).map(item => `${item.MaNK}:${item.HanhDong}`).join(', ') || 'không'}`);
        } catch (error) {
            await transaction.rollback().catch(() => {});
            log(`Không mở lại POS ${accident.closedPos.MaCa}: ${error.message}`);
        }
    } else if (accident.closedPos) {
        log(`Bỏ qua reopen POS ${accident.closedPos.MaCa}: quỹ đã khóa (phiếu thu ${accident.closedPos.MaPT} ${accident.closedPos.TrangThaiPT}).`);
    }

    let restoredDuty = null;
    if (accident.checkOut && (accident.checkOut.SoGiay == null || Number(accident.checkOut.SoGiay) <= 300)) {
        restoredDuty = await undoAccidentalCheckOut(pool, {
            maChamCong: accident.checkOut.MaChamCong,
            silentLogs: true
        });
        log(`Đã mở lại chấm công ${restoredDuty.MaChamCong} của ${restoredDuty.TenDangNhap} (${restoredDuty.TenNV}) → ${restoredDuty.TrangThai}`);
        log(`  Log chấm ra đã xóa: ${(restoredDuty.deletedLogs || []).map(item => `${item.MaNK}:${item.HanhDong}`).join(', ') || 'không (API chấm ra vốn không ghi NhatKy)'}`);
    } else if (accident.checkOut) {
        log(`Không tự hoàn tác chấm ra ${accident.checkOut.MaChamCong}: ca đã làm ${accident.checkOut.SoGiay} giây, không giống bấm nhầm vừa xong.`);
    }

    const verify = await pool.request().query(`
        SELECT ca.MaCa, ca.TrangThai, ca.ThoiGianKetThuc, tk.TenDangNhap
        FROM CaLamViec ca
        LEFT JOIN TaiKhoan tk ON tk.MaNV=ca.MaNV
        WHERE ca.TrangThai=N'Đang mở' AND ca.ThoiGianKetThuc IS NULL;

        SELECT cc.MaChamCong, tk.TenDangNhap, nv.TenNV, cc.ThoiGianVao, cc.ThoiGianRa, cc.TrangThai, lc.TenCa
        FROM ChamCong cc
        JOIN LichLamViec l ON l.MaLich=cc.MaLich
        JOIN NhanVien nv ON nv.MaNV=l.MaNV
        JOIN LoaiCa lc ON lc.MaLoaiCa=l.MaLoaiCa
        LEFT JOIN TaiKhoan tk ON tk.MaNV=l.MaNV
        WHERE l.NgayLam=CONVERT(date, GETDATE()) AND cc.ThoiGianVao IS NOT NULL AND cc.ThoiGianRa IS NULL;
    `);
    log(`Ca POS đang mở sau xử lý: ${verify.recordsets[0].length
        ? verify.recordsets[0].map(row => `${row.MaCa} (${row.TenDangNhap}) ${row.TrangThai}`).join(', ')
        : 'không có'}`);
    log(`Chấm công đang mở hôm nay: ${verify.recordsets[1].length
        ? verify.recordsets[1].map(row => `${row.TenDangNhap} ${row.TenCa} #${row.MaChamCong} ${row.TrangThai}`).join(', ')
        : 'không có'}`);

    console.log('\n--- KẾT QUẢ ---');
    console.log(JSON.stringify({
        reopenedShift,
        restoredDuty: restoredDuty && {
            MaChamCong: restoredDuty.MaChamCong,
            TenDangNhap: restoredDuty.TenDangNhap,
            TenNV: restoredDuty.TenNV,
            TenCa: restoredDuty.TenCa,
            TrangThai: restoredDuty.TrangThai,
            alreadyOpen: restoredDuty.alreadyOpen,
            deletedLogs: restoredDuty.deletedLogs
        },
        openPos: verify.recordsets[0],
        openAttendance: verify.recordsets[1]
    }, null, 2));

    await pool.close();
})().catch(async (error) => {
    console.error(error);
    try {
        const { poolPromise: pool } = require('./src/config/db');
        await (await pool).close();
    } catch { /* ignore */ }
    process.exit(1);
});
