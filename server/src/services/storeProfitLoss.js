const { sql } = require('../config/db');
const { calculateGrossProfit, roundMoney } = require('./financialRules');
const { ensurePayrollSchema } = require('./payrollSchema');
const { logAudit } = require('./auditLog');
const {
    CAUSE_CATALOG,
    formatVnd,
    monthsOverlapping,
    calculateOperatingResult,
    buildLossReasons,
    buildCashSentence
} = require('./storeProfitLossMath');
const DATE_COLUMN_BY_TABLE = {
    PhieuChi: 'NgayChungTu',
    HoaDonMuaHang: 'NgayHoaDon',
    DonMuaHang: 'NgayLap',
    PhieuNhap: 'NgayXacNhan',
    PhieuThu: 'NgayLap'
};
const NUMERIC_TYPES = new Set(['decimal', 'numeric', 'money', 'smallmoney', 'float', 'real', 'int', 'bigint', 'smallint']);

let schemaReady = false;
let schemaPromise = null;

const n = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const run = (connection, text) => new sql.Request(connection).query(text);

const ensureStoreProfitLossSchema = async (connection) => {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await ensurePayrollSchema(connection).catch(() => {});
        await run(connection, `
            IF OBJECT_ID(N'dbo.KeHoachDieuChinhLaiLo', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.KeHoachDieuChinhLaiLo (
                    MaKeHoach BIGINT IDENTITY(1,1) NOT NULL,
                    LoaiKy NVARCHAR(10) NOT NULL,
                    MaKy NVARCHAR(20) NOT NULL,
                    TuNgay DATE NOT NULL,
                    DenNgay DATE NOT NULL,
                    NhanKy NVARCHAR(80) NOT NULL,
                    SoTienLaiLo DECIMAL(18,2) NOT NULL,
                    TrangThaiLaiLo NVARCHAR(20) NOT NULL,
                    DoanhThuThuan DECIMAL(18,2) NOT NULL,
                    TongLuongKhoa DECIMAL(18,2) NOT NULL,
                    NguyenNhanMa NVARCHAR(500) NOT NULL,
                    NguyenNhanKhac NVARCHAR(500) NULL,
                    KeHoach NVARCHAR(2000) NOT NULL,
                    HanXemLai DATE NOT NULL,
                    MaNV_Gui VARCHAR(20) NOT NULL,
                    TenNV_Gui NVARCHAR(100) NOT NULL,
                    NgayGui DATETIME NOT NULL CONSTRAINT DF_KeHoachLaiLo_NgayGui DEFAULT GETDATE(),
                    SoNguoiNhan INT NOT NULL CONSTRAINT DF_KeHoachLaiLo_SoNguoi DEFAULT 0,
                    CONSTRAINT PK_KeHoachDieuChinhLaiLo PRIMARY KEY (MaKeHoach),
                    CONSTRAINT FK_KeHoachLaiLo_NguoiGui FOREIGN KEY (MaNV_Gui) REFERENCES dbo.NhanVien(MaNV)
                );
            END`);
        await run(connection, `
            IF OBJECT_ID(N'dbo.ThongBaoCuaHang', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.ThongBaoCuaHang (
                    MaTB BIGINT IDENTITY(1,1) NOT NULL,
                    MaKeHoach BIGINT NULL,
                    MaNV_Nhan VARCHAR(20) NOT NULL,
                    TieuDe NVARCHAR(200) NOT NULL,
                    NoiDung NVARCHAR(1000) NOT NULL,
                    MaNV_Gui VARCHAR(20) NOT NULL,
                    TenNV_Gui NVARCHAR(100) NOT NULL,
                    DichDen NVARCHAR(80) NULL,
                    MucDo NVARCHAR(20) NOT NULL CONSTRAINT DF_ThongBaoCH_MucDo DEFAULT N'Cảnh báo',
                    NgayGui DATETIME NOT NULL CONSTRAINT DF_ThongBaoCH_NgayGui DEFAULT GETDATE(),
                    CONSTRAINT PK_ThongBaoCuaHang PRIMARY KEY (MaTB),
                    CONSTRAINT FK_ThongBaoCH_KeHoach FOREIGN KEY (MaKeHoach) REFERENCES dbo.KeHoachDieuChinhLaiLo(MaKeHoach),
                    CONSTRAINT FK_ThongBaoCH_Nhan FOREIGN KEY (MaNV_Nhan) REFERENCES dbo.NhanVien(MaNV),
                    CONSTRAINT FK_ThongBaoCH_Gui FOREIGN KEY (MaNV_Gui) REFERENCES dbo.NhanVien(MaNV)
                );
            END`);
        await run(connection, `
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_KeHoachLaiLo_Ky' AND object_id = OBJECT_ID(N'dbo.KeHoachDieuChinhLaiLo')
            )
                CREATE INDEX IX_KeHoachLaiLo_Ky ON dbo.KeHoachDieuChinhLaiLo (LoaiKy, MaKy, NgayGui DESC);
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = N'IX_ThongBaoCH_Nhan' AND object_id = OBJECT_ID(N'dbo.ThongBaoCuaHang')
            )
                CREATE INDEX IX_ThongBaoCH_Nhan ON dbo.ThongBaoCuaHang (MaNV_Nhan, NgayGui DESC);`);
        schemaReady = true;
    })().catch(error => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

const quoteIdent = name => `[${String(name).replace(/]/g, '')}]`;

const discoverShippingSources = async (pool) => {
    const result = await pool.request().query(`
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo'
          AND DATA_TYPE IN ('decimal','numeric','money','smallmoney','float','real','int','bigint','smallint')
          AND (
            COLUMN_NAME LIKE N'%VanChuyen%'
            OR COLUMN_NAME LIKE N'%CuocVan%'
            OR COLUMN_NAME LIKE N'%PhiShip%'
            OR COLUMN_NAME LIKE N'%ShippingFee%'
            OR COLUMN_NAME LIKE N'%CuocPhi%'
          )`);
    return (result.recordset || []).filter(row => NUMERIC_TYPES.has(String(row.DATA_TYPE || '').toLowerCase())
        && DATE_COLUMN_BY_TABLE[row.TABLE_NAME]);
};

const sumShipping = async (pool, period, sources) => {
    let total = 0;
    const chiTiet = [];
    for (const source of sources) {
        const dateCol = DATE_COLUMN_BY_TABLE[source.TABLE_NAME];
        const sqlText = `
            SELECT COALESCE(SUM(${quoteIdent(source.COLUMN_NAME)}),0) SoTien
            FROM dbo.${quoteIdent(source.TABLE_NAME)}
            WHERE ${quoteIdent(dateCol)} >= @From AND ${quoteIdent(dateCol)} < @ToExclusive`;
        try {
            const result = await pool.request()
                .input('From', sql.NVarChar(10), period.from)
                .input('ToExclusive', sql.NVarChar(10), period.toExclusive)
                .query(sqlText);
            const amount = roundMoney(result.recordset[0]?.SoTien);
            if (amount) {
                total = roundMoney(total + amount);
                chiTiet.push({
                    bang: source.TABLE_NAME,
                    cot: source.COLUMN_NAME,
                    soTien: amount
                });
            }
        } catch {
            /* bỏ nguồn không đọc được, không bịa số */
        }
    }
    return { tong: total, chiTiet };
};

const bindPeriod = (pool, period) => pool.request()
    .input('From', sql.NVarChar(10), period.from)
    .input('ToExclusive', sql.NVarChar(10), period.toExclusive);

const loadPlans = async (pool, period) => {
    const result = await pool.request()
        .input('LoaiKy', sql.NVarChar, period.periodType)
        .input('MaKy', sql.NVarChar, period.period)
        .query(`
            SELECT MaKeHoach, LoaiKy, MaKy, NhanKy, SoTienLaiLo, TrangThaiLaiLo,
                   DoanhThuThuan, TongLuongKhoa, NguyenNhanMa, NguyenNhanKhac,
                   KeHoach, CONVERT(varchar(10), HanXemLai, 23) HanXemLai,
                   MaNV_Gui, TenNV_Gui, NgayGui, SoNguoiNhan
            FROM KeHoachDieuChinhLaiLo
            WHERE LoaiKy=@LoaiKy AND MaKy=@MaKy
            ORDER BY NgayGui DESC`);
    return result.recordset || [];
};

const buildReport = async (pool, resolved) => {
    await ensureStoreProfitLossSchema(pool);
    const period = resolved.period;
    const shippingSources = await discoverShippingSources(pool);
    const monthKeys = monthsOverlapping(period.from, period.toExclusive);

    const [salesResult, returnsResult, nccResult, cashResult, bankResult, payrollResult, shipping] = await Promise.all([
        bindPeriod(pool, period).query(`
            SELECT COUNT(DISTINCT hd.MaHD) SoHoaDon,
                   COALESCE((SELECT SUM(h.TongThanhToan) FROM HoaDon h
                       WHERE h.TrangThai=N'Hoàn thành' AND h.NgayLap>=@From AND h.NgayLap<@ToExclusive),0) DoanhThuHoaDon,
                   COALESCE(SUM(CASE WHEN hd.TrangThai=N'Hoàn thành' THEN ct.ThanhTienVon ELSE 0 END),0) GiaVonHoaDon
            FROM HoaDon hd LEFT JOIN ChiTietHoaDon ct ON ct.MaHD=hd.MaHD
            WHERE hd.TrangThai=N'Hoàn thành' AND hd.NgayLap>=@From AND hd.NgayLap<@ToExclusive`),
        bindPeriod(pool, period).query(`
            WITH ChiTietTheoPhieu AS (
                SELECT MaDT,
                       SUM(CASE WHEN LoaiDong=N'Hàng khách trả' THEN ThanhTienVon ELSE 0 END) GiaVonHangTra,
                       SUM(CASE WHEN LoaiDong=N'Hàng giao đổi' THEN ThanhTienVon ELSE 0 END) GiaVonHangGiaoDoi
                FROM ChiTietDoiTra GROUP BY MaDT
            )
            SELECT COUNT(*) SoPhieuDoiTra, COALESCE(SUM(dt.SoTienHoan),0) TienHoan,
                   COALESCE(SUM(CASE WHEN dt.KetQuaKiemTra LIKE N'%ược nhập lại kho%'
                                     AND dt.KetQuaKiemTra NOT LIKE N'%không nhập lại%'
                                     THEN ct.GiaVonHangTra ELSE 0 END),0) GiaVonHangTraNhapLai,
                   COALESCE(SUM(ct.GiaVonHangGiaoDoi),0) GiaVonHangGiaoDoi
            FROM PhieuDoiTra dt LEFT JOIN ChiTietTheoPhieu ct ON ct.MaDT=dt.MaDT
            WHERE dt.TrangThai=N'Hoàn thành' AND dt.NgayHoan>=@From AND dt.NgayHoan<@ToExclusive`),
        bindPeriod(pool, period).query(`
            SELECT ncc.MaNCC, ncc.TenNCC, COUNT(*) SoPhieu, COALESCE(SUM(pc.SoTien),0) SoTien
            FROM PhieuChi pc
            JOIN NhaCungCap ncc ON ncc.MaNCC=pc.MaNCC
            WHERE pc.TrangThai=N'Thanh toán thành công'
              AND pc.NgayChungTu>=@From AND pc.NgayChungTu<@ToExclusive
            GROUP BY ncc.MaNCC, ncc.TenNCC
            ORDER BY SoTien DESC`),
        bindPeriod(pool, period).query(`
            SELECT COUNT(*) SoPhieuThu,
                   COALESCE(SUM(SoTienThucNop),0) TienMatNop,
                   SUM(CASE WHEN TrangThai=N'Đã xác nhận' THEN 1 ELSE 0 END) SoPhieuDaXacNhan
            FROM PhieuThu
            WHERE NgayLap>=@From AND NgayLap<@ToExclusive`),
        bindPeriod(pool, period).query(`
            SELECT
              COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Chuyển khoản' THEN tt.SoTien ELSE 0 END),0) ChuyenKhoan,
              COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'QR' THEN tt.SoTien ELSE 0 END),0) QR,
              COALESCE(SUM(CASE WHEN tt.PhuongThuc=N'Thẻ' THEN tt.SoTien ELSE 0 END),0) The
            FROM ThanhToan tt
            JOIN HoaDon hd ON hd.MaHD=tt.MaHD
            WHERE hd.TrangThai=N'Hoàn thành' AND tt.TrangThai=N'Thành công'
              AND tt.PhuongThuc IN (N'Chuyển khoản', N'QR', N'Thẻ')
              AND tt.NgayTT>=@From AND tt.NgayTT<@ToExclusive`),
        (async () => {
            if (!monthKeys.length) {
                return { recordset: [], locked: false, months: [], unlocked: monthKeys };
            }
            const request = pool.request();
            monthKeys.forEach((key, index) => request.input(`M${index}`, sql.VarChar, key));
            const inList = monthKeys.map((_, index) => `@M${index}`).join(',');
            try {
                return await request.query(`
                    SELECT k.MaKy, k.TrangThai TrangThaiKy,
                           bl.MaNV, nv.TenNV, nv.ChucVu, bl.TongLuong, bl.TrangThai
                    FROM KyLuong k
                    JOIN BangLuong bl ON bl.MaKy=k.MaKy
                    JOIN NhanVien nv ON nv.MaNV=bl.MaNV
                    WHERE k.MaKy IN (${inList})`);
            } catch {
                return { recordset: [], missing: true };
            }
        })(),
        sumShipping(pool, period, shippingSources)
    ]);

    const gross = calculateGrossProfit({ ...salesResult.recordset[0], ...returnsResult.recordset[0] });
    const nccRows = (nccResult.recordset || []).map(row => ({
        MaNCC: row.MaNCC,
        TenNCC: row.TenNCC,
        SoPhieu: Number(row.SoPhieu || 0),
        SoTien: roundMoney(row.SoTien)
    }));
    const chiNhaCungCap = roundMoney(nccRows.reduce((sum, row) => sum + row.SoTien, 0));

    const payrollRows = payrollResult.recordset || [];
    const lockedRows = payrollRows.filter(row => ['Đã khóa', 'Đã thanh toán'].includes(String(row.TrangThai || ''))
        || ['Đã khóa', 'Đã thanh toán'].includes(String(row.TrangThaiKy || '')));
    const lockedByEmployee = new Map();
    lockedRows.forEach(row => {
        if (!['Đã khóa', 'Đã thanh toán'].includes(String(row.TrangThai || ''))) return;
        const current = lockedByEmployee.get(row.MaNV) || {
            MaNV: row.MaNV, TenNV: row.TenNV, ChucVu: row.ChucVu, TongLuong: 0, ky: []
        };
        current.TongLuong = roundMoney(current.TongLuong + n(row.TongLuong));
        current.ky.push(row.MaKy);
        lockedByEmployee.set(row.MaNV, current);
    });
    const nhanVien = [...lockedByEmployee.values()].sort((a, b) => b.TongLuong - a.TongLuong);
    const tongLuongKhoa = roundMoney(nhanVien.reduce((sum, row) => sum + row.TongLuong, 0));
    const lockedMonths = [...new Set(lockedRows
        .filter(row => ['Đã khóa', 'Đã thanh toán'].includes(String(row.TrangThaiKy || '')))
        .map(row => row.MaKy))];
    const unlockedMonths = monthKeys.filter(key => !lockedMonths.includes(key));
    const payrollLocked = lockedMonths.length > 0;

    const operating = calculateOperatingResult({
        doanhThuThuan: gross.DoanhThuThuan,
        loiNhuanGop: gross.LoiNhuanGop,
        chiNhaCungCap,
        cuocVanChuyen: shipping.tong,
        chiPhiNhanVien: tongLuongKhoa,
        tongLuongKhoa
    });

    const tienMatNop = roundMoney(cashResult.recordset[0]?.TienMatNop);
    const daThuCk = roundMoney(
        n(bankResult.recordset[0]?.ChuyenKhoan)
        + n(bankResult.recordset[0]?.QR)
        + n(bankResult.recordset[0]?.The)
    );
    const tienThuKy = roundMoney(tienMatNop + daThuCk);
    const cash = buildCashSentence(tienThuKy, tongLuongKhoa, payrollLocked);

    const chiPhiThieuChungTu = [
        { ma: 'thue_nha', ten: 'Thuê mặt bằng', ghiChu: 'Chưa có chứng từ — chưa trừ' },
        { ma: 'dien_nuoc', ten: 'Điện nước', ghiChu: 'Chưa có chứng từ — chưa trừ' }
    ];
    if (!shipping.tong) {
        chiPhiThieuChungTu.push({
            ma: 'cuoc_van_chuyen',
            ten: 'Cước vận chuyển',
            ghiChu: 'Chưa có chứng từ — chưa trừ'
        });
    }

    const nguyenNhan = buildLossReasons({
        doanhThuHoaDon: gross.DoanhThuHoaDon,
        doanhThuThuan: gross.DoanhThuThuan,
        tienHoan: gross.TienHoan,
        soPhieuDoiTra: returnsResult.recordset[0]?.SoPhieuDoiTra,
        giaVonThuan: gross.GiaVonHangBanThuan,
        loiNhuanGop: gross.LoiNhuanGop,
        chiNhaCungCap,
        cuocVanChuyen: shipping.tong,
        tongLuongKhoa,
        laiLoSauChiPhi: operating.laiLoSauChiPhi
    });

    const keHoach = await loadPlans(pool, period);
    const luongMoiNguoi = nhanVien.length ? roundMoney(tongLuongKhoa / nhanVien.length) : 0;
    const payrollNote = !monthKeys.length
        ? 'Không gắn được kỳ lương với kỳ báo cáo.'
        : payrollLocked
            ? (unlockedMonths.length
                ? `Đã trừ lương khóa của ${lockedMonths.join(', ')}. Tháng chưa khóa (${unlockedMonths.join(', ')}) chưa trừ.`
                : (period.periodType === 'day'
                    ? 'Lương được khóa theo tháng chứa ngày này, không chia nhỏ theo ngày.'
                    : 'Đã trừ tổng lương các bảng đã khóa trong kỳ.'))
            : 'Bảng lương kỳ này chưa khóa — chưa trừ lương vào lãi/lỗ.';

    return {
        period,
        latestActivity: resolved.latestActivity,
        fallbackFrom: resolved.fallbackFrom,
        congThuc: {
            laiLo: 'Doanh thu thuần − giá vốn thuần − chi NCC thành công − cước vận chuyển (nếu có chứng từ) − lương đã khóa = lãi/lỗ sau chi phí.',
            laiGop: 'Lãi gộp giữ nguyên định nghĩa cũ, không trừ lương.',
            tienThu: 'Tiền mặt phiếu thu ca đã nộp + đã thu CK/QR/thẻ bán trong kỳ, so với lương đã khóa.'
        },
        hoatDong: {
            ...operating,
            banHang: {
                soHoaDon: Number(salesResult.recordset[0]?.SoHoaDon || 0),
                doanhThuHoaDon: gross.DoanhThuHoaDon,
                tienHoan: gross.TienHoan,
                soPhieuDoiTra: Number(returnsResult.recordset[0]?.SoPhieuDoiTra || 0),
                doanhThuThuan: gross.DoanhThuThuan
            },
            giaVon: {
                giaVonHoaDon: gross.GiaVonHoaDon,
                giaVonHangTraNhapLai: gross.GiaVonHangTraNhapLai,
                giaVonHangGiaoDoi: gross.GiaVonHangGiaoDoi,
                giaVonThuan: gross.GiaVonHangBanThuan
            },
            laiGop: {
                soTien: gross.LoiNhuanGop,
                dinhNghia: 'Doanh thu thuần − giá vốn thuần. Không trừ lương, không trừ thuê nhà/điện.'
            },
            benThu3: {
                nhaCungCap: nccRows,
                tongChiNcc: chiNhaCungCap,
                cuocVanChuyen: shipping.tong,
                cuocChiTiet: shipping.chiTiet,
                tong: operating.chiPhiBenThu3,
                ghiChu: chiPhiThieuChungTu
            },
            nhanVien: {
                tongLuongKhoa,
                soNhanVien: nhanVien.length,
                luongMoiNguoi,
                top: nhanVien.slice(0, 8),
                kyDaKhoa: lockedMonths,
                kyChuaKhoa: unlockedMonths,
                daKhoa: payrollLocked,
                ghiChu: payrollNote
            }
        },
        tienMat: {
            tienMatPhieuThu: tienMatNop,
            soPhieuThu: Number(cashResult.recordset[0]?.SoPhieuThu || 0),
            soPhieuDaXacNhan: Number(cashResult.recordset[0]?.SoPhieuDaXacNhan || 0),
            daThuCk: daThuCk,
            chuyenKhoan: roundMoney(bankResult.recordset[0]?.ChuyenKhoan),
            qr: roundMoney(bankResult.recordset[0]?.QR),
            the: roundMoney(bankResult.recordset[0]?.The),
            tongTienThu: tienThuKy,
            tongLuongKhoa,
            ...cash
        },
        nguyenNhan,
        keHoach,
        batBuocKeHoach: operating.batBuocKeHoach
    };
};

const inboxTargetByRole = chucVu => {
    if (chucVu === 'Quản lý') return 'manager-reports';
    if (chucVu === 'Kế toán') return 'accounting-reports';
    if (chucVu === 'Thu ngân') return 'cashier-shifts';
    if (chucVu === 'Thủ kho') return 'warehouse-home';
    if (chucVu === 'Nhân viên mua hàng') return 'purchasing-inbox';
    return '';
};

const savePlan = async (pool, user, req, resolved, body = {}) => {
    await ensureStoreProfitLossSchema(pool);
    const report = await buildReport(pool, resolved);
    if (!report.batBuocKeHoach) {
        const error = new Error('Kỳ này đang lãi, không bắt buộc gửi kế hoạch điều chỉnh.');
        error.status = 400;
        throw error;
    }
    const selected = Array.isArray(body.nguyenNhanMa)
        ? body.nguyenNhanMa.map(item => String(item || '').trim()).filter(Boolean)
        : String(body.nguyenNhanMa || '').split(',').map(item => item.trim()).filter(Boolean);
    const allowed = new Set([...report.nguyenNhan.map(item => item.ma), 'khac']);
    const confirmed = [...new Set(selected.filter(code => allowed.has(code) || CAUSE_CATALOG[code]))];
    const other = String(body.nguyenNhanKhac || '').trim().slice(0, 500);
    if (!confirmed.length && !other) {
        const error = new Error('Hãy chọn ít nhất một nguyên nhân, hoặc ghi nguyên nhân khác.');
        error.status = 400;
        throw error;
    }
    const plan = String(body.keHoach || '').trim();
    if (plan.length < 50) {
        const error = new Error('Kế hoạch điều chỉnh phải ghi rõ việc sẽ làm, tối thiểu 50 ký tự.');
        error.status = 400;
        throw error;
    }
    if (plan.length > 2000) {
        const error = new Error('Kế hoạch điều chỉnh tối đa 2000 ký tự.');
        error.status = 400;
        throw error;
    }
    const reviewDate = String(body.hanXemLai || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
        const error = new Error('Hãy chọn thời hạn xem lại (ngày).');
        error.status = 400;
        throw error;
    }
    const sender = await pool.request().input('MaNV', sql.VarChar, user.MaNV)
        .query('SELECT MaNV, TenNV, ChucVu FROM NhanVien WHERE MaNV=@MaNV');
    const tenGui = sender.recordset[0]?.TenNV || 'Quản lý';
    const period = resolved.period;
    const amount = report.hoatDong.laiLoSauChiPhi;
    const lossText = amount < 0
        ? `lỗ ${formatVnd(-amount)}`
        : `còn lãi ${formatVnd(amount)} nhưng doanh thu chưa đủ trả lương`;
    const planSummary = plan.length > 180 ? `${plan.slice(0, 177)}…` : plan;
    const title = `Cửa hàng ${report.hoatDong.trangThai === 'LỖ' ? 'lỗ' : 'chưa đủ trả lương'} — ${period.label}`;
    const detail = `${period.label}: cửa hàng ${lossText}. Kế hoạch: ${planSummary} Xem lại trước ${reviewDate.split('-').reverse().join('/')}. Người gửi: ${tenGui}.`;

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const inserted = await new sql.Request(transaction)
            .input('LoaiKy', sql.NVarChar, period.periodType)
            .input('MaKy', sql.NVarChar, period.period)
            .input('TuNgay', sql.Date, period.from)
            .input('DenNgay', sql.Date, period.to)
            .input('NhanKy', sql.NVarChar, period.label)
            .input('SoTienLaiLo', sql.Decimal(18, 2), amount)
            .input('TrangThaiLaiLo', sql.NVarChar, report.hoatDong.trangThai)
            .input('DoanhThuThuan', sql.Decimal(18, 2), report.hoatDong.doanhThuThuan)
            .input('TongLuongKhoa', sql.Decimal(18, 2), report.hoatDong.nhanVien.tongLuongKhoa)
            .input('NguyenNhanMa', sql.NVarChar, confirmed.join(','))
            .input('NguyenNhanKhac', sql.NVarChar, other || null)
            .input('KeHoach', sql.NVarChar, plan)
            .input('HanXemLai', sql.Date, reviewDate)
            .input('MaNV', sql.VarChar, user.MaNV)
            .input('TenNV', sql.NVarChar, tenGui)
            .query(`
                INSERT KeHoachDieuChinhLaiLo (
                    LoaiKy, MaKy, TuNgay, DenNgay, NhanKy, SoTienLaiLo, TrangThaiLaiLo,
                    DoanhThuThuan, TongLuongKhoa, NguyenNhanMa, NguyenNhanKhac, KeHoach,
                    HanXemLai, MaNV_Gui, TenNV_Gui)
                OUTPUT inserted.MaKeHoach
                VALUES (
                    @LoaiKy, @MaKy, @TuNgay, @DenNgay, @NhanKy, @SoTienLaiLo, @TrangThaiLaiLo,
                    @DoanhThuThuan, @TongLuongKhoa, @NguyenNhanMa, @NguyenNhanKhac, @KeHoach,
                    @HanXemLai, @MaNV, @TenNV)`);
        const maKeHoach = inserted.recordset[0].MaKeHoach;
        const staff = await new sql.Request(transaction).query(`
            SELECT MaNV, TenNV, ChucVu FROM NhanVien
            WHERE ISNULL(TrangThai, N'Đang làm việc') = N'Đang làm việc'`);
        const recipients = staff.recordset || [];
        if (!recipients.length) throw new Error('Không có nhân viên đang làm việc để gửi thông báo.');
        for (const person of recipients) {
            await new sql.Request(transaction)
                .input('MaKeHoach', sql.BigInt, maKeHoach)
                .input('MaNVNhan', sql.VarChar, person.MaNV)
                .input('TieuDe', sql.NVarChar, title.slice(0, 200))
                .input('NoiDung', sql.NVarChar, detail.slice(0, 1000))
                .input('MaNVGui', sql.VarChar, user.MaNV)
                .input('TenGui', sql.NVarChar, tenGui)
                .input('DichDen', sql.NVarChar, inboxTargetByRole(person.ChucVu) || null)
                .query(`
                    INSERT ThongBaoCuaHang (MaKeHoach, MaNV_Nhan, TieuDe, NoiDung, MaNV_Gui, TenNV_Gui, DichDen, MucDo)
                    VALUES (@MaKeHoach, @MaNVNhan, @TieuDe, @NoiDung, @MaNVGui, @TenGui, @DichDen, N'Cảnh báo')`);
        }
        await new sql.Request(transaction)
            .input('MaKeHoach', sql.BigInt, maKeHoach)
            .input('SoNguoi', sql.Int, recipients.length)
            .query('UPDATE KeHoachDieuChinhLaiLo SET SoNguoiNhan=@SoNguoi WHERE MaKeHoach=@MaKeHoach');
        await logAudit(transaction, {
            user, req,
            action: 'Gửi kế hoạch điều chỉnh lãi lỗ',
            table: 'KeHoachDieuChinhLaiLo',
            recordId: String(maKeHoach),
            uc: 'UC10',
            severity: 'Cảnh báo',
            content: `${period.label}: ${lossText}. Đã gửi thông báo cho ${recipients.length} nhân viên đang làm việc.`
        });
        await transaction.commit();
        const roles = [...new Set(recipients.map(item => item.ChucVu))];
        return {
            message: `Đã lưu kế hoạch và gửi thông báo tới ${recipients.length} nhân viên đang làm việc.`,
            item: {
                MaKeHoach: maKeHoach,
                SoNguoiNhan: recipients.length,
                vaiTroNhan: roles
            },
            keHoach: await loadPlans(pool, period)
        };
    } catch (error) {
        if (transaction._aborted !== true) await transaction.rollback().catch(() => {});
        throw error;
    }
};

const listInboxForEmployee = async (pool, maNV) => {
    await ensureStoreProfitLossSchema(pool);
    const result = await pool.request().input('MaNV', sql.VarChar, maNV).query(`
        SELECT TOP 20 MaTB, MaKeHoach, TieuDe, NoiDung, TenNV_Gui, DichDen, MucDo, NgayGui
        FROM ThongBaoCuaHang
        WHERE MaNV_Nhan=@MaNV
        ORDER BY NgayGui DESC`);
    return result.recordset || [];
};

module.exports = {
    CAUSE_CATALOG,
    monthsOverlapping,
    calculateOperatingResult,
    buildLossReasons,
    buildCashSentence,
    ensureStoreProfitLossSchema,
    buildReport,
    savePlan,
    listInboxForEmployee,
    formatVnd
};
