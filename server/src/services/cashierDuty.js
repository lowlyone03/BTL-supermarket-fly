const { sql } = require('../config/db');

/** Được chấm công / mở quầy sớm tối đa 10 phút trước BatDauDuKien. Không gia hạn sau giờ kết thúc ca. */
const GRACE_BEFORE_MINUTES = 10;
const CASHIER_ROLE = 'Thu ngân';
const SALES_DUTIES = new Set(['Ca chính full-time', 'Thu ngân']);

const isOfficeShift = (row) => String(row?.MaLoaiCa || '') === 'HANH_CHINH'
    || String(row?.NhomCa || '') === 'HANH_CHINH';
const isCashierRole = (chucVu) => String(chucVu || '').trim() === CASHIER_ROLE;
const isSalesDuty = (row) => SALES_DUTIES.has(String(row?.NhiemVu || '').trim());
const canRunSalesCounter = (row, chucVu) => Boolean(row && isCashierRole(chucVu) && !isOfficeShift(row) && isSalesDuty(row));

class CashierDutyError extends Error {
    constructor(message, status = 403, duty = null) {
        super(message);
        this.name = 'CashierDutyError';
        this.status = status;
        this.duty = duty;
    }
}

const requestOf = (connection) => (
    typeof connection.request === 'function' ? connection.request() : new sql.Request(connection)
);

const hoursOf = (row) => {
    const start = String(row?.GioBatDau || '').slice(0, 5);
    const end = String(row?.GioKetThuc || '').slice(0, 5);
    if (start && end) return `${start}–${end}`;
    return '';
};

const caLabel = (row) => {
    if (!row) return '';
    const hours = hoursOf(row);
    const day = row.NgayLam ? ` ngày ${row.NgayLam}` : '';
    return hours ? `${row.TenCa}${day} (${hours})` : `${row.TenCa || 'ca'}${day}`;
};

const loadDutyContext = async (connection, maNV) => {
    const schedules = await requestOf(connection)
        .input('MaNV', sql.VarChar, maNV)
        .input('Grace', sql.Int, GRACE_BEFORE_MINUTES)
        .query(`
            SELECT l.MaLich, l.MaNV, l.MaLoaiCa, lc.TenCa, lc.NhomCa, lc.LaCaDem,
                   l.NhiemVu, l.MaQuay, l.TrangThai,
                   CONVERT(varchar(10), l.NgayLam, 23) NgayLam,
                   CONVERT(varchar(5), lc.GioBatDau, 108) GioBatDau,
                   CONVERT(varchar(5), lc.GioKetThuc, 108) GioKetThuc,
                   l.BatDauDuKien, l.KetThucDuKien,
                   cc.MaChamCong, cc.ThoiGianVao, cc.ThoiGianRa, cc.TrangThai TrangThaiChamCong,
                   CASE
                     WHEN GETDATE() < DATEADD(minute, -@Grace, l.BatDauDuKien) THEN N'truoc'
                     WHEN GETDATE() > l.KetThucDuKien THEN N'sau'
                     ELSE N'trong'
                   END ViTri,
                   CASE WHEN CONVERT(date, l.NgayLam) = CONVERT(date, GETDATE())
                          OR CONVERT(date, l.BatDauDuKien) = CONVERT(date, GETDATE())
                          OR CONVERT(date, l.KetThucDuKien) = CONVERT(date, GETDATE())
                        THEN 1 ELSE 0 END LaHomNay
            FROM LichLamViec l
            JOIN LoaiCa lc ON lc.MaLoaiCa = l.MaLoaiCa
            LEFT JOIN ChamCong cc ON cc.MaLich = l.MaLich
            WHERE l.MaNV = @MaNV AND l.TrangThai = N'Đã công bố'
              AND l.KetThucDuKien >= DATEADD(day, -2, GETDATE())
              AND l.BatDauDuKien <= DATEADD(day, 2, GETDATE())
            ORDER BY l.BatDauDuKien`);
    const openShift = await requestOf(connection).input('MaNV', sql.VarChar, maNV).query(`
        SELECT TOP 1 ca.MaCa, ca.MaLich, ca.TrangThai, ca.ThoiGianBatDau, ca.ThoiGianKetThuc, ca.MaQuay
        FROM CaLamViec ca
        WHERE ca.MaNV = @MaNV AND ca.TrangThai = N'Đang mở' AND ca.ThoiGianKetThuc IS NULL
        ORDER BY ca.ThoiGianBatDau DESC`);
    const closed = await requestOf(connection).input('MaNV', sql.VarChar, maNV).query(`
        SELECT ca.MaCa, ca.MaLich, ca.TrangThai, ca.ThoiGianKetThuc
        FROM CaLamViec ca
        WHERE ca.MaNV = @MaNV AND ca.TrangThai = N'Đã chốt'
          AND ca.MaLich IN (
              SELECT l.MaLich FROM LichLamViec l
              WHERE l.MaNV = @MaNV AND l.TrangThai = N'Đã công bố'
                AND l.KetThucDuKien >= DATEADD(day, -2, GETDATE())
                AND l.BatDauDuKien <= DATEADD(day, 2, GETDATE())
          )`);
    const nextShift = await requestOf(connection).input('MaNV', sql.VarChar, maNV).query(`
        SELECT TOP 1 CONVERT(varchar(10), l.NgayLam, 23) NgayLam, lc.TenCa,
               CONVERT(varchar(5), lc.GioBatDau, 108) GioBatDau,
               CONVERT(varchar(5), lc.GioKetThuc, 108) GioKetThuc
        FROM LichLamViec l JOIN LoaiCa lc ON lc.MaLoaiCa = l.MaLoaiCa
        WHERE l.MaNV = @MaNV AND l.TrangThai = N'Đã công bố'
          AND l.BatDauDuKien > GETDATE()
        ORDER BY l.BatDauDuKien`);
    const employee = await requestOf(connection).input('MaNV', sql.VarChar, maNV).query(`
        SELECT MaNV, TenNV, ChucVu FROM NhanVien WHERE MaNV=@MaNV`);
    return {
        employee: employee.recordset[0] || { MaNV: maNV, ChucVu: '' },
        schedules: schedules.recordset,
        openShift: openShift.recordset[0] || null,
        closedByLich: new Map(closed.recordset.map(row => [Number(row.MaLich), row])),
        nextShift: nextShift.recordset[0] || null
    };
};

const snapshotDuty = async (connection, maNV) => {
    const ctx = await loadDutyContext(connection, maNV);
    const inside = ctx.schedules.filter(row => row.ViTri === 'trong');
    const before = ctx.schedules.filter(row => row.ViTri === 'truoc' && Number(row.LaHomNay) === 1);
    const after = ctx.schedules.filter(row => row.ViTri === 'sau' && Number(row.LaHomNay) === 1)
        .sort((a, b) => new Date(b.KetThucDuKien) - new Date(a.KetThucDuKien));
    const current = inside[0] || null;
    const upcoming = before[0] || ctx.nextShift || null;
    const ended = after[0] || null;
    const closedForCurrent = current ? ctx.closedByLich.get(Number(current.MaLich)) : null;
    const openMatches = current && ctx.openShift && Number(ctx.openShift.MaLich) === Number(current.MaLich);
    const chucVu = ctx.employee?.ChucVu || '';
    const salesAllowed = canRunSalesCounter(current, chucVu);

    let status = 'none';
    let message = 'Hôm nay bạn không có lịch làm việc đã công bố. Không chấm công, không mở POS.';
    if (ctx.nextShift) {
        message += ` Ca gần nhất: ${caLabel(ctx.nextShift)}.`;
    }
    if (current) {
        status = 'inside';
        message = salesAllowed
            ? `Đang trong ${caLabel(current)}. Được chấm công sớm tối đa ${GRACE_BEFORE_MINUTES} phút trước giờ vào; hết giờ ca thì không vào lại.`
            : `Đang trong ${caLabel(current)}. Ca này không mở quầy bán hàng — chỉ chấm công vào/ra rồi làm việc theo vai trò.`;
        if (closedForCurrent) {
            status = 'closed';
            message = `${caLabel(current)} đã đóng (${closedForCurrent.MaCa}). Không mở lại ca đã qua.`;
        }
    } else if (upcoming && before.length) {
        status = 'before';
        const row = before[0];
        message = `Chưa đến giờ ca. ${caLabel(row)}. Được chấm công sớm tối đa ${GRACE_BEFORE_MINUTES} phút trước giờ vào — không mở quầy sớm hơn.`;
    } else if (ended) {
        status = 'after';
        message = `${caLabel(ended)} đã kết thúc. Không vào lại, không bán tiếp, không mở lại ca hôm qua.`;
        if (ctx.openShift) {
            message += ` Ca POS ${ctx.openShift.MaCa} vẫn đang mở — hãy đóng ca, không lập hóa đơn thêm.`;
        }
    }

    return {
        graceMinutes: GRACE_BEFORE_MINUTES,
        status,
        message,
        schedule: current || before[0] || ended || null,
        openShift: ctx.openShift,
        canCheckIn: Boolean(current && !current.ThoiGianVao),
        canCheckOut: Boolean(current && current.ThoiGianVao && !current.ThoiGianRa),
        canOpenShift: Boolean(salesAllowed && current.ThoiGianVao && !current.ThoiGianRa && !closedForCurrent && !ctx.openShift),
        canSell: Boolean(salesAllowed && openMatches && !closedForCurrent),
        context: ctx
    };
};

const assertCashierDuty = async (connection, maNV, intent = 'sell') => {
    const duty = await snapshotDuty(connection, maNV);
    const ctx = duty.context;
    const current = ctx.schedules.find(row => row.ViTri === 'trong') || null;
    const before = ctx.schedules.filter(row => row.ViTri === 'truoc' && Number(row.LaHomNay) === 1)[0];
    const after = ctx.schedules.filter(row => row.ViTri === 'sau' && Number(row.LaHomNay) === 1)
        .sort((a, b) => new Date(b.KetThucDuKien) - new Date(a.KetThucDuKien))[0];

    const deny = (message) => {
        throw new CashierDutyError(message, 403, { ...duty, context: undefined });
    };

    if (intent === 'sell') {
        if (!isCashierRole(ctx.employee?.ChucVu) || (current && isOfficeShift(current))) {
            deny('Chỉ Thu ngân trên ca bán hàng mới được dùng POS.');
        }
        if (ctx.openShift && !current) {
            deny(after
                ? `${caLabel(after)} đã kết thúc. Không bán tiếp trên ca POS ${ctx.openShift.MaCa}. Hãy đóng ca.`
                : `Ca POS ${ctx.openShift.MaCa} không nằm trong khung giờ lịch đã công bố. Không bán tiếp — hãy đóng ca.`);
        }
        if (!current) {
            if (before) deny(`Chưa đến giờ ca. ${caLabel(before)}. Không mở POS trước giờ vào (trừ ${GRACE_BEFORE_MINUTES} phút đầu ca).`);
            if (after) deny(`${caLabel(after)} đã kết thúc. Không vào POS, không bán tiếp.`);
            deny(duty.message);
        }
        if (!ctx.openShift) deny('Bạn phải mở ca bán hàng trong khung giờ ca đã công bố trước khi dùng POS.');
        if (Number(ctx.openShift.MaLich) !== Number(current.MaLich)) {
            deny(`Ca POS ${ctx.openShift.MaCa} không khớp ${caLabel(current)}. Không bán bằng ca cũ — hãy đóng ca rồi mở đúng ca hôm nay.`);
        }
        return { duty, schedule: current, shift: ctx.openShift };
    }

    if (!current) {
        if (before) {
            deny(`Chưa đến giờ ca. ${caLabel(before)}. Được chấm công sớm tối đa ${GRACE_BEFORE_MINUTES} phút trước giờ vào.`);
        }
        if (after) {
            deny(`${caLabel(after)} đã kết thúc. Không vào lại, không mở lại ca đã qua.`);
        }
        deny(duty.message);
    }

    if (intent === 'check-in') {
        if (current.ThoiGianVao && current.ThoiGianRa) {
            deny(`Bạn đã chấm công xong ${caLabel(current)}. Không vào lại ca đã qua.`);
        }
        return { duty, schedule: current };
    }

    if (intent === 'open-shift') {
        if (!canRunSalesCounter(current, ctx.employee?.ChucVu)) {
            deny('Chỉ Thu ngân trên ca bán hàng (ca chính) mới được mở ca tại quầy. Ca hành chính không mở quầy bán hàng.');
        }
        const closed = ctx.closedByLich.get(Number(current.MaLich));
        if (closed) {
            deny(`${caLabel(current)} đã đóng (${closed.MaCa}). Không mở lại ca đã qua.`);
        }
        return { duty, schedule: current, shift: ctx.openShift };
    }

    return { duty, schedule: current, shift: ctx.openShift };
};

module.exports = {
    GRACE_BEFORE_MINUTES,
    CashierDutyError,
    snapshotDuty,
    assertCashierDuty,
    isOfficeShift,
    isCashierRole,
    canRunSalesCounter
};
