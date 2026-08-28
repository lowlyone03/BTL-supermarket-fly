const { sql } = require('../config/db');

const closeOpenAttendance = async (source, maCa = null) => {
    const request = typeof source.request === 'function' ? source.request() : new sql.Request(source);
    const filter = maCa ? 'AND ca.MaCa = @MaCa' : '';
    if (maCa) request.input('MaCa', sql.VarChar, maCa);
    return request.query(`
        UPDATE cc SET ThoiGianRa = ca.ThoiGianKetThuc, TrangThai = N'Chờ duyệt',
            PhutVeSom = CASE WHEN ca.ThoiGianKetThuc < l.KetThucDuKien
                THEN DATEDIFF(minute, ca.ThoiGianKetThuc, l.KetThucDuKien) ELSE 0 END
        FROM ChamCong cc
        JOIN LichLamViec l ON l.MaLich = cc.MaLich
        JOIN CaLamViec ca ON ca.MaNV = l.MaNV
          AND (
                (ca.MaLich IS NOT NULL AND ca.MaLich = cc.MaLich)
             OR ca.ThoiGianBatDau BETWEEN DATEADD(minute, -60, cc.ThoiGianVao)
                                     AND DATEADD(minute,  60, cc.ThoiGianVao)
          )
        WHERE cc.ThoiGianVao IS NOT NULL AND cc.ThoiGianRa IS NULL
          AND ca.TrangThai = N'Đã chốt' AND ca.ThoiGianKetThuc IS NOT NULL
          ${filter};
    `);
};

module.exports = { closeOpenAttendance };
