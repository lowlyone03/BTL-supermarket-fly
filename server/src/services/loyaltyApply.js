'use strict';

const { sql } = require('../config/db');
const {
    loadLoyaltyPolicy, normalizePolicy, offerForSegment, moneyVnd
} = require('./loyaltyPolicy');

const queryFrom = (source) => (source.request ? source.request() : new sql.Request(source));

let schemaReady = false;
let schemaPromise = null;

const ensureLoyaltyApplySchema = async (connection) => {
    if (!connection || schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await queryFrom(connection).query(`
            IF OBJECT_ID(N'dbo.ApDungChinhSachThanhVien', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.ApDungChinhSachThanhVien (
                    MaHD      VARCHAR(20)    NOT NULL,
                    MaKH      VARCHAR(20)    NOT NULL,
                    Loai      NVARCHAR(20)   NOT NULL,
                    TienGiam  DECIMAL(18, 2) NOT NULL CONSTRAINT DF_ApCS_Tien DEFAULT (0),
                    HeSoDiem  INT            NOT NULL CONSTRAINT DF_ApCS_HeSo DEFAULT (1),
                    GiaTri    NVARCHAR(40)   NULL,
                    NguoiAp   VARCHAR(20)    NULL,
                    ThoiDiem  DATETIME       NOT NULL CONSTRAINT DF_ApCS_Luc DEFAULT (GETDATE()),
                    CONSTRAINT PK_ApDungChinhSachThanhVien PRIMARY KEY (MaHD)
                );
            END`);
        schemaReady = true;
    })().catch((error) => {
        schemaPromise = null;
        throw error;
    });
    return schemaPromise;
};

const bannerForOffer = (offer) => {
    if (!offer || !offer.category) return null;
    if (offer.category === 'VIP') return `Theo chính sách cửa hàng: VIP tối đa ${offer.maxPercent}%`;
    if (offer.category === 'win-back') return `Theo chính sách cửa hàng: Voucher ${moneyVnd(offer.voucherVnd)}`;
    if (offer.category === 'mới') return `Theo chính sách cửa hàng: ×${offer.pointMultiplier} điểm`;
    return null;
};

const mergeLoyaltyDiscount = ({
    loai,
    policy,
    tongTienHang,
    kmAmount = 0,
    kmIsPercent = false,
    kmPercent = 0
} = {}) => {
    const p = normalizePolicy(policy);
    const tong = Math.max(0, Number(tongTienHang) || 0);
    const km = Math.max(0, Math.round(Number(kmAmount) || 0));
    const base = {
        tienGiamGia: km,
        tienGiamCS: 0,
        heSoDiem: 1,
        loai: null,
        giaTri: null
    };
    if (loai === 'VIP') {
        if (!p.vipEnabled) return base;
        const pct = p.vipMaxPercent;
        const vipAmt = Math.round(tong * pct / 100);
        if (kmIsPercent) {
            const mergedPct = Math.max(Number(kmPercent) || 0, pct);
            const merged = Math.round(tong * mergedPct / 100);
            return {
                tienGiamGia: Math.min(tong, merged),
                tienGiamCS: Math.max(0, merged - km),
                heSoDiem: 1,
                loai: 'VIP',
                giaTri: `${pct}%`
            };
        }
        if (vipAmt > km) {
            return {
                tienGiamGia: Math.min(tong, vipAmt),
                tienGiamCS: Math.max(0, vipAmt - km),
                heSoDiem: 1,
                loai: 'VIP',
                giaTri: `${pct}%`
            };
        }
        return { ...base, loai: 'VIP', giaTri: `${pct}%` };
    }
    if (loai === 'win-back') {
        if (!p.winBackEnabled) return base;
        const voucher = Math.min(p.winBackVoucherVnd, Math.max(0, tong - km));
        return {
            tienGiamGia: Math.min(tong, km + voucher),
            tienGiamCS: voucher,
            heSoDiem: 1,
            loai: 'win-back',
            giaTri: String(p.winBackVoucherVnd)
        };
    }
    if (loai === 'mới') {
        if (!p.newMemberEnabled) return base;
        return {
            ...base,
            heSoDiem: p.newMemberPointMultiplier,
            loai: 'mới',
            giaTri: `×${p.newMemberPointMultiplier}`
        };
    }
    return base;
};

const loadCustomerOffer = async (source, maKH) => {
    const id = String(maKH || '').trim();
    if (!id) return null;
    const policy = await loadLoyaltyPolicy();
    const result = await queryFrom(source).input('MaKHOffer', sql.VarChar, id).query(`
        SELECT kh.MaKH, kh.TenKH, kh.HangThanhVien, kh.DiemTichLuy,
               COUNT(hd.MaHD) SoHoaDon,
               COALESCE(SUM(hd.TongThanhToan),0) TongChiTieu,
               MAX(hd.NgayLap) LanMuaGanNhat
        FROM KhachHang kh
        LEFT JOIN HoaDon hd ON hd.MaKH = kh.MaKH AND hd.TrangThai = N'Hoàn thành'
        WHERE kh.MaKH = @MaKHOffer
        GROUP BY kh.MaKH, kh.TenKH, kh.HangThanhVien, kh.DiemTichLuy`);
    if (!result.recordset.length) return null;
    const { computeCustomerRfm } = require('./loyaltyAnalytics');
    const rfm = computeCustomerRfm(result.recordset[0], new Date().toISOString().slice(0, 10), policy);
    const offer = rfm.GoiY || offerForSegment(rfm.Segment, policy);
    const canApply = Boolean(offer.enabled && offer.category);
    return {
        MaKH: rfm.MaKH,
        TenKH: rfm.TenKH,
        HangThanhVien: rfm.HangThanhVien,
        DiemTichLuy: rfm.DiemTichLuy,
        SoHoaDonHoanThanh: rfm.SoHoaDon,
        LanMuaGanNhat: rfm.LanMuaGanNhat,
        Segment: rfm.Segment,
        GoiY: offer,
        banner: canApply ? bannerForOffer(offer) : (offer.shortLabel || null),
        canApply,
        autoApply: false,
        cuaHangRfm: false
    };
};

const assertOfferMatches = (pack, loai) => {
    if (!loai) return pack;
    if (!pack) {
        const error = new Error('Chỉ khách hàng thành viên mới được áp chính sách cửa hàng.');
        error.status = 400;
        throw error;
    }
    if (!pack.canApply || pack.GoiY?.category !== loai) {
        const error = new Error('Chính sách này không áp dụng cho khách (nhóm đang tắt hoặc sai phân khúc).');
        error.status = 400;
        throw error;
    }
    return pack;
};

const saveInvoiceApply = async (connection, {
    maHD, maKH, loai, tienGiamCS, heSoDiem, giaTri, maNV
}) => {
    if (!maHD || !loai || !maKH) return;
    await ensureLoyaltyApplySchema(connection);
    await queryFrom(connection)
        .input('ApMaHD', sql.VarChar, maHD)
        .input('ApMaKH', sql.VarChar, maKH)
        .input('ApLoai', sql.NVarChar, loai)
        .input('ApTien', sql.Decimal(18, 2), Number(tienGiamCS) || 0)
        .input('ApHeSo', sql.Int, Number(heSoDiem) || 1)
        .input('ApGia', sql.NVarChar, giaTri || null)
        .input('ApNV', sql.VarChar, maNV || null)
        .query(`
            IF EXISTS (SELECT 1 FROM dbo.ApDungChinhSachThanhVien WHERE MaHD=@ApMaHD)
                UPDATE dbo.ApDungChinhSachThanhVien
                SET MaKH=@ApMaKH, Loai=@ApLoai, TienGiam=@ApTien, HeSoDiem=@ApHeSo,
                    GiaTri=@ApGia, NguoiAp=@ApNV, ThoiDiem=GETDATE()
                WHERE MaHD=@ApMaHD;
            ELSE
                INSERT dbo.ApDungChinhSachThanhVien
                    (MaHD, MaKH, Loai, TienGiam, HeSoDiem, GiaTri, NguoiAp, ThoiDiem)
                VALUES (@ApMaHD, @ApMaKH, @ApLoai, @ApTien, @ApHeSo, @ApGia, @ApNV, GETDATE());`);
};

const loadInvoiceApply = async (connection, maHD) => {
    if (!maHD) return null;
    try {
        await ensureLoyaltyApplySchema(connection);
        const result = await queryFrom(connection).input('ApMaHD', sql.VarChar, maHD).query(`
            SELECT MaHD, MaKH, Loai, TienGiam, HeSoDiem, GiaTri
            FROM dbo.ApDungChinhSachThanhVien WHERE MaHD=@ApMaHD`);
        return result.recordset[0] || null;
    } catch {
        return null;
    }
};

const loadTodayApplyStats = async (pool) => {
    const empty = { soHd: 0, tongTienGiam: 0, diemNhan: 0 };
    try {
        await ensureLoyaltyApplySchema(pool);
        const result = await queryFrom(pool).query(`
            SELECT
              COUNT(*) soHd,
              COALESCE(SUM(a.TienGiam), 0) tongTienGiam,
              COALESCE(SUM(CASE
                WHEN a.HeSoDiem > 1 AND hd.TrangThai = N'Hoàn thành' THEN hd.DiemCong
                ELSE 0 END), 0) diemNhan
            FROM dbo.ApDungChinhSachThanhVien a
            JOIN dbo.HoaDon hd ON hd.MaHD = a.MaHD
            WHERE CONVERT(date, a.ThoiDiem) = CONVERT(date, GETDATE())`);
        const row = result.recordset[0] || {};
        return {
            soHd: Number(row.soHd) || 0,
            tongTienGiam: Number(row.tongTienGiam) || 0,
            diemNhan: Number(row.diemNhan) || 0
        };
    } catch {
        return empty;
    }
};

const countOffersFromTable = (table, policy) => {
    const p = normalizePolicy(policy);
    let vip = 0;
    let winBack = 0;
    let moi = 0;
    for (const row of table || []) {
        if (p.vipEnabled && row.GoiY?.category === 'VIP') vip += 1;
        if (p.winBackEnabled && row.GoiY?.category === 'win-back') winBack += 1;
        if (p.newMemberEnabled && row.GoiY?.category === 'mới') moi += 1;
    }
    return { vip, winBack, moi };
};

const policySnapshot = (policy) => {
    const p = normalizePolicy(policy);
    return {
        vip: p.vipEnabled ? `${p.vipMaxPercent}%` : 'tắt',
        winBack: p.winBackEnabled ? `${p.winBackVoucherVnd}` : 'tắt',
        moi: p.newMemberEnabled ? `×${p.newMemberPointMultiplier}` : 'tắt'
    };
};

module.exports = {
    ensureLoyaltyApplySchema,
    bannerForOffer,
    mergeLoyaltyDiscount,
    loadCustomerOffer,
    assertOfferMatches,
    saveInvoiceApply,
    loadInvoiceApply,
    loadTodayApplyStats,
    countOffersFromTable,
    policySnapshot
};
