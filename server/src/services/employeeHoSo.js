const { sql } = require('../config/db');
const { validateEmployeeProfileFields } = require('./fieldValidators');

const PROFILE_KEYS = [
    'QuocTich', 'DanToc', 'TonGiao', 'NoiSinh', 'NguyenQuan',
    'HoKhauThuongTru', 'ChoOHienNay', 'NgayCapCCCD', 'NoiCapCCCD',
    'TinhTrangHonNhan', 'TrinhDoHocVan', 'ChuyenMon',
    'MSTCaNhan', 'SoBHXH', 'SoTaiKhoanNH', 'TenNganHang', 'ChiNhanhNH',
    'NguoiLienHe', 'QuanHeLienHe', 'SDTLienHe', 'GhiChuHoSo'
];

const HOSO_SELECT = `
    hs.QuocTich, hs.DanToc, hs.TonGiao, hs.NoiSinh, hs.NguyenQuan,
    hs.HoKhauThuongTru, hs.ChoOHienNay, hs.NgayCapCCCD, hs.NoiCapCCCD,
    hs.TinhTrangHonNhan, hs.TrinhDoHocVan, hs.ChuyenMon,
    hs.MSTCaNhan, hs.SoBHXH, hs.SoTaiKhoanNH, hs.TenNganHang, hs.ChiNhanhNH,
    hs.NguoiLienHe, hs.QuanHeLienHe, hs.SDTLienHe, hs.GhiChuHoSo`;

const HOSO_COLUMNS = PROFILE_KEYS.join(', ');
const HOSO_PARAMS = PROFILE_KEYS.map((key) => `@${key}`).join(', ');
const HOSO_UPDATE = PROFILE_KEYS.map((key) => `${key} = @${key}`).join(', ');

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const emptyProfile = () => Object.fromEntries(PROFILE_KEYS.map((key) => [key, null]));

const hasProfileInput = (body = {}) => {
    if (body.HoSo && typeof body.HoSo === 'object') {
        return PROFILE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(body.HoSo, key));
    }
    return PROFILE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(body, key));
};

const pickProfileSource = (body = {}) => {
    const nested = body.HoSo && typeof body.HoSo === 'object' ? body.HoSo : {};
    return { ...nested, ...body };
};

const toHoSoProfile = (profile = {}, { diaChi = null } = {}) => {
    const out = emptyProfile();
    for (const key of PROFILE_KEYS) {
        const value = profile[key];
        out[key] = value === '' || value === undefined ? null : value;
    }
    if (!out.ChoOHienNay) out.ChoOHienNay = diaChi || null;
    if (!out.HoKhauThuongTru && profile.DiaChiThuongTru) out.HoKhauThuongTru = profile.DiaChiThuongTru;
    return out;
};

const validateEmployeeProfile = (body, { diaChi = null, ngaySinh = null, cccd = null, tenNV = '', strictCreate = false } = {}) => {
    const raw = pickProfileSource(body);
    const result = validateEmployeeProfileFields({
        ...raw,
        TenNV: raw.TenNV || tenNV || 'Nhân viên',
        CCCD: raw.CCCD || cccd,
        NgaySinh: raw.NgaySinh || ngaySinh
    }, { strictCreate });
    if (!result.ok) return { error: result.message, errors: result.errors };
    return {
        profile: toHoSoProfile(result.profile, { diaChi: diaChi || result.profile.DiaChi }),
        core: result.profile,
        errors: result.errors
    };
};

const uniqueProfileConflictMessage = (error) => {
    const text = error?.message || '';
    if (text.includes('UX_HoSoNhanVien_MSTCaNhan') || /MSTCaNhan/i.test(text)) {
        return 'Mã số thuế cá nhân đã được dùng cho nhân viên khác.';
    }
    if (text.includes('UX_HoSoNhanVien_SoBHXH') || /SoBHXH/i.test(text)) {
        return 'Số BHXH đã được dùng cho nhân viên khác.';
    }
    return '';
};

const assertUniqueProfileCodes = async (pool, profile, excludeMaNV = '') => {
    const exclude = normalizeText(excludeMaNV);
    if (profile.MSTCaNhan) {
        const request = pool.request().input('MSTCaNhan', sql.VarChar, profile.MSTCaNhan);
        let sqlText = 'SELECT MaNV FROM HoSoNhanVien WHERE MSTCaNhan = @MSTCaNhan';
        if (exclude) {
            request.input('MaNV', sql.VarChar, exclude);
            sqlText += ' AND MaNV <> @MaNV';
        }
        const found = await request.query(sqlText);
        if (found.recordset.length > 0) {
            return { error: 'Mã số thuế cá nhân đã được dùng cho nhân viên khác.' };
        }
    }
    if (profile.SoBHXH) {
        const request = pool.request().input('SoBHXH', sql.VarChar, profile.SoBHXH);
        let sqlText = 'SELECT MaNV FROM HoSoNhanVien WHERE SoBHXH = @SoBHXH';
        if (exclude) {
            request.input('MaNV', sql.VarChar, exclude);
            sqlText += ' AND MaNV <> @MaNV';
        }
        const found = await request.query(sqlText);
        if (found.recordset.length > 0) {
            return { error: 'Số BHXH đã được dùng cho nhân viên khác.' };
        }
    }
    return { ok: true };
};

const bindProfileFields = (request, profile) => request
    .input('QuocTich', sql.NVarChar, profile.QuocTich)
    .input('DanToc', sql.NVarChar, profile.DanToc)
    .input('TonGiao', sql.NVarChar, profile.TonGiao)
    .input('NoiSinh', sql.NVarChar, profile.NoiSinh)
    .input('NguyenQuan', sql.NVarChar, profile.NguyenQuan)
    .input('HoKhauThuongTru', sql.NVarChar, profile.HoKhauThuongTru)
    .input('ChoOHienNay', sql.NVarChar, profile.ChoOHienNay)
    .input('NgayCapCCCD', sql.Date, profile.NgayCapCCCD)
    .input('NoiCapCCCD', sql.NVarChar, profile.NoiCapCCCD)
    .input('TinhTrangHonNhan', sql.NVarChar, profile.TinhTrangHonNhan)
    .input('TrinhDoHocVan', sql.NVarChar, profile.TrinhDoHocVan)
    .input('ChuyenMon', sql.NVarChar, profile.ChuyenMon)
    .input('MSTCaNhan', sql.VarChar, profile.MSTCaNhan)
    .input('SoBHXH', sql.VarChar, profile.SoBHXH)
    .input('SoTaiKhoanNH', sql.VarChar, profile.SoTaiKhoanNH)
    .input('TenNganHang', sql.NVarChar, profile.TenNganHang)
    .input('ChiNhanhNH', sql.NVarChar, profile.ChiNhanhNH)
    .input('NguoiLienHe', sql.NVarChar, profile.NguoiLienHe)
    .input('QuanHeLienHe', sql.NVarChar, profile.QuanHeLienHe)
    .input('SDTLienHe', sql.VarChar, profile.SDTLienHe)
    .input('GhiChuHoSo', sql.NVarChar, profile.GhiChuHoSo);

const upsertEmployeeProfile = async (connection, maNV, profile) => {
    const existing = await new sql.Request(connection)
        .input('MaNV', sql.VarChar, maNV)
        .query('SELECT MaNV FROM HoSoNhanVien WHERE MaNV = @MaNV');
    if (existing.recordset.length === 0) {
        await bindProfileFields(new sql.Request(connection).input('MaNV', sql.VarChar, maNV), profile)
            .query(`INSERT INTO HoSoNhanVien (MaNV, ${HOSO_COLUMNS})
                    VALUES (@MaNV, ${HOSO_PARAMS})`);
        return;
    }
    await bindProfileFields(new sql.Request(connection).input('MaNV', sql.VarChar, maNV), profile)
        .query(`UPDATE HoSoNhanVien SET ${HOSO_UPDATE} WHERE MaNV = @MaNV`);
};

const HOSO_SEED = [
    {
        MaNV: 'NV_QL01', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Không',
        NoiSinh: 'Quận Ba Đình, Hà Nội', NguyenQuan: 'Nam Định',
        HoKhauThuongTru: '18 Nguyễn Thái Học, Ba Đình, Hà Nội',
        ChoOHienNay: '18 Nguyễn Thái Học, Ba Đình, Hà Nội',
        NgayCapCCCD: '2021-08-15', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Đã kết hôn', TrinhDoHocVan: 'Đại học', ChuyenMon: 'Quản trị kinh doanh',
        MSTCaNhan: '0108800312', SoBHXH: '0118800312',
        SoTaiKhoanNH: '012100088888', TenNganHang: 'Vietcombank', ChiNhanhNH: 'Chi nhánh Ba Đình',
        NguoiLienHe: 'Nguyễn Văn Khoa', QuanHeLienHe: 'Chồng', SDTLienHe: '0912000001',
        GhiChuHoSo: 'Quản lý cửa hàng từ ngày khai trương.'
    },
    {
        MaNV: 'NV_MH01', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Không',
        NoiSinh: 'Thành phố Thái Bình, Thái Bình', NguyenQuan: 'Thái Bình',
        HoKhauThuongTru: '27 Láng Hạ, Đống Đa, Hà Nội',
        ChoOHienNay: '27 Láng Hạ, Đống Đa, Hà Nội',
        NgayCapCCCD: '2021-09-20', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Độc thân', TrinhDoHocVan: 'Đại học', ChuyenMon: 'Kinh tế đối ngoại',
        MSTCaNhan: '0109400721', SoBHXH: '0119400721',
        SoTaiKhoanNH: '190347812345', TenNganHang: 'Techcombank', ChiNhanhNH: 'Chi nhánh Đống Đa',
        NguoiLienHe: 'Trần Văn Hải', QuanHeLienHe: 'Bố', SDTLienHe: '0912000002',
        GhiChuHoSo: 'Phụ trách đề nghị mua và theo dõi nhà cung cấp.'
    },
    {
        MaNV: 'NV_TK01', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Phật giáo',
        NoiSinh: 'Thành phố Hải Dương, Hải Dương', NguyenQuan: 'Hải Dương',
        HoKhauThuongTru: '5 Minh Khai, Hai Bà Trưng, Hà Nội',
        ChoOHienNay: '5 Minh Khai, Hai Bà Trưng, Hà Nội',
        NgayCapCCCD: '2021-10-05', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Đã kết hôn', TrinhDoHocVan: 'Cao đẳng', ChuyenMon: 'Quản trị logistics',
        MSTCaNhan: '0109101105', SoBHXH: '0119101105',
        SoTaiKhoanNH: '150920011111', TenNganHang: 'BIDV', ChiNhanhNH: 'Chi nhánh Hai Bà Trưng',
        NguoiLienHe: 'Phạm Thị Lan', QuanHeLienHe: 'Vợ', SDTLienHe: '0912000003',
        GhiChuHoSo: 'Thủ kho kiêm kiểm kê định kỳ.'
    },
    {
        MaNV: 'NV_TN01', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Không',
        NoiSinh: 'Quận Cầu Giấy, Hà Nội', NguyenQuan: 'Hà Nội',
        HoKhauThuongTru: '42 Trần Duy Hưng, Cầu Giấy, Hà Nội',
        ChoOHienNay: '42 Trần Duy Hưng, Cầu Giấy, Hà Nội',
        NgayCapCCCD: '2022-01-18', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Độc thân', TrinhDoHocVan: 'Cao đẳng', ChuyenMon: 'Kế toán thương mại',
        MSTCaNhan: '0109800218', SoBHXH: '0119800218',
        SoTaiKhoanNH: '970412345678', TenNganHang: 'MB Bank', ChiNhanhNH: 'Chi nhánh Cầu Giấy',
        NguoiLienHe: 'Phạm Thị Hoa', QuanHeLienHe: 'Mẹ', SDTLienHe: '0912000004',
        GhiChuHoSo: 'Thu ngân ca sáng, tài khoản thungan.'
    },
    {
        MaNV: 'NV_TN02', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Không',
        NoiSinh: 'Thành phố Bắc Ninh, Bắc Ninh', NguyenQuan: 'Bắc Ninh',
        HoKhauThuongTru: '9 Hoàng Quốc Việt, Cầu Giấy, Hà Nội',
        ChoOHienNay: '9 Hoàng Quốc Việt, Cầu Giấy, Hà Nội',
        NgayCapCCCD: '2022-02-03', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Độc thân', TrinhDoHocVan: 'Trung cấp', ChuyenMon: 'Nghiệp vụ bán hàng',
        MSTCaNhan: '0109700903', SoBHXH: '0119700903',
        SoTaiKhoanNH: '012345678901', TenNganHang: 'Agribank', ChiNhanhNH: 'Chi nhánh Cầu Giấy',
        NguoiLienHe: 'Nguyễn Thị Mai', QuanHeLienHe: 'Mẹ', SDTLienHe: '0912000005',
        GhiChuHoSo: 'Thu ngân ca chiều.'
    },
    {
        MaNV: 'NV_TN03', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Công giáo',
        NoiSinh: 'Huyện Khoái Châu, Hưng Yên', NguyenQuan: 'Hưng Yên',
        HoKhauThuongTru: '15 Nguyễn Trãi, Thanh Xuân, Hà Nội',
        ChoOHienNay: '15 Nguyễn Trãi, Thanh Xuân, Hà Nội',
        NgayCapCCCD: '2022-02-26', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Độc thân', TrinhDoHocVan: 'Cao đẳng', ChuyenMon: 'Quản trị bán lẻ',
        MSTCaNhan: '0109900526', SoBHXH: '0119900526',
        SoTaiKhoanNH: '103456789012', TenNganHang: 'VPBank', ChiNhanhNH: 'Chi nhánh Thanh Xuân',
        NguoiLienHe: 'Đỗ Văn Thành', QuanHeLienHe: 'Bố', SDTLienHe: '0912000006',
        GhiChuHoSo: 'Thu ngân cuối tuần.'
    },
    {
        MaNV: 'NV_TN04', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Không',
        NoiSinh: 'Thành phố Phủ Lý, Hà Nam', NguyenQuan: 'Hà Nam',
        HoKhauThuongTru: '6 Giải Phóng, Hoàng Mai, Hà Nội',
        ChoOHienNay: '6 Giải Phóng, Hoàng Mai, Hà Nội',
        NgayCapCCCD: '2022-03-14', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Đã kết hôn', TrinhDoHocVan: 'Đại học', ChuyenMon: 'Marketing',
        MSTCaNhan: '0109601214', SoBHXH: '0119601214',
        SoTaiKhoanNH: '012199612140', TenNganHang: 'Vietcombank', ChiNhanhNH: 'Chi nhánh Hoàng Mai',
        NguoiLienHe: 'Lê Thị Hạnh', QuanHeLienHe: 'Vợ', SDTLienHe: '0912000007',
        GhiChuHoSo: 'Thu ngân ca tối.'
    },
    {
        MaNV: 'NV_TN05', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Không',
        NoiSinh: 'Quận Đống Đa, Hà Nội', NguyenQuan: 'Hà Nội',
        HoKhauThuongTru: '21 Tây Sơn, Đống Đa, Hà Nội',
        ChoOHienNay: '21 Tây Sơn, Đống Đa, Hà Nội',
        NgayCapCCCD: '2022-04-09', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Độc thân', TrinhDoHocVan: 'Trung học phổ thông', ChuyenMon: 'Nghiệp vụ thu ngân',
        MSTCaNhan: '0100000409', SoBHXH: '0120000409',
        SoTaiKhoanNH: '888812345678', TenNganHang: 'Techcombank', ChiNhanhNH: 'Chi nhánh Đống Đa',
        NguoiLienHe: 'Bùi Văn Phong', QuanHeLienHe: 'Bố', SDTLienHe: '0912000008',
        GhiChuHoSo: 'Thu ngân ca sáng cuối tuần.'
    },
    {
        MaNV: 'NV_TN06', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Không',
        NoiSinh: 'Thành phố Vinh, Nghệ An', NguyenQuan: 'Nghệ An',
        HoKhauThuongTru: '33 Phạm Văn Đồng, Bắc Từ Liêm, Hà Nội',
        ChoOHienNay: '33 Phạm Văn Đồng, Bắc Từ Liêm, Hà Nội',
        NgayCapCCCD: '2022-05-30', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Độc thân', TrinhDoHocVan: 'Cao đẳng', ChuyenMon: 'Thương mại',
        MSTCaNhan: '0109800830', SoBHXH: '0119800830',
        SoTaiKhoanNH: '970498083011', TenNganHang: 'MB Bank', ChiNhanhNH: 'Chi nhánh Bắc Từ Liêm',
        NguoiLienHe: 'Phan Thị Lý', QuanHeLienHe: 'Mẹ', SDTLienHe: '0912000009',
        GhiChuHoSo: 'Thu ngân hỗ trợ quầy thực phẩm.'
    },
    {
        MaNV: 'NV_TN07', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Phật giáo',
        NoiSinh: 'Thành phố Việt Trì, Phú Thọ', NguyenQuan: 'Phú Thọ',
        HoKhauThuongTru: '8 Kim Mã, Ba Đình, Hà Nội',
        ChoOHienNay: '8 Kim Mã, Ba Đình, Hà Nội',
        NgayCapCCCD: '2022-06-22', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Đã kết hôn', TrinhDoHocVan: 'Đại học', ChuyenMon: 'Quản trị nhân lực',
        MSTCaNhan: '0109500122', SoBHXH: '0119500122',
        SoTaiKhoanNH: '190395012211', TenNganHang: 'Techcombank', ChiNhanhNH: 'Chi nhánh Ba Đình',
        NguoiLienHe: 'Hoàng Đức Anh', QuanHeLienHe: 'Chồng', SDTLienHe: '0912000010',
        GhiChuHoSo: 'Thu ngân ca chiều — tối.'
    },
    {
        MaNV: 'NV_TN08', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Không',
        NoiSinh: 'Quận Đống Đa, Hà Nội', NguyenQuan: 'Hà Nội',
        HoKhauThuongTru: '12 Nguyễn Chí Thanh, Đống Đa, Hà Nội',
        ChoOHienNay: '12 Nguyễn Chí Thanh, Đống Đa, Hà Nội',
        NgayCapCCCD: '2022-03-10', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Độc thân', TrinhDoHocVan: 'Cao đẳng', ChuyenMon: 'Kế toán doanh nghiệp',
        MSTCaNhan: '0109700617', SoBHXH: '0119700617',
        SoTaiKhoanNH: '012197061788', TenNganHang: 'Vietcombank', ChiNhanhNH: 'Chi nhánh Đống Đa',
        NguoiLienHe: 'Đặng Thị Hương', QuanHeLienHe: 'Mẹ', SDTLienHe: '0912000011',
        GhiChuHoSo: 'Thu ngân ca chiều, tài khoản thungan08.'
    },
    {
        MaNV: 'NV_KT01', QuocTich: 'Việt Nam', DanToc: 'Kinh', TonGiao: 'Không',
        NoiSinh: 'Quận Hoàn Kiếm, Hà Nội', NguyenQuan: 'Hà Nội',
        HoKhauThuongTru: '4 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội',
        ChoOHienNay: '4 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội',
        NgayCapCCCD: '2021-11-08', NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        TinhTrangHonNhan: 'Đã kết hôn', TrinhDoHocVan: 'Đại học', ChuyenMon: 'Kế toán kiểm toán',
        MSTCaNhan: '0109301008', SoBHXH: '0119301008',
        SoTaiKhoanNH: '150193100888', TenNganHang: 'BIDV', ChiNhanhNH: 'Chi nhánh Hoàn Kiếm',
        NguoiLienHe: 'Trần Quốc Việt', QuanHeLienHe: 'Chồng', SDTLienHe: '0912000012',
        GhiChuHoSo: 'Phụ trách đối chiếu quỹ và bảng lương.'
    }
];

const COALESCE_UPDATE = PROFILE_KEYS.map((key) => `${key} = COALESCE(${key}, @${key})`).join(', ');

const backfillSeedHoSo = async (connection) => {
    let written = 0;
    for (const row of HOSO_SEED) {
        const exists = await new sql.Request(connection)
            .input('MaNV', sql.VarChar, row.MaNV)
            .query('SELECT MaNV FROM NhanVien WHERE MaNV = @MaNV');
        if (exists.recordset.length === 0) continue;
        const hoSo = await new sql.Request(connection)
            .input('MaNV', sql.VarChar, row.MaNV)
            .query('SELECT MaNV FROM HoSoNhanVien WHERE MaNV = @MaNV');
        if (hoSo.recordset.length === 0) {
            await bindProfileFields(new sql.Request(connection).input('MaNV', sql.VarChar, row.MaNV), row)
                .query(`INSERT INTO HoSoNhanVien (MaNV, ${HOSO_COLUMNS})
                        VALUES (@MaNV, ${HOSO_PARAMS})`);
            written += 1;
            continue;
        }
        await bindProfileFields(new sql.Request(connection).input('MaNV', sql.VarChar, row.MaNV), row)
            .query(`UPDATE HoSoNhanVien SET ${COALESCE_UPDATE} WHERE MaNV = @MaNV`);
        written += 1;
    }
    return written;
};

module.exports = {
    PROFILE_KEYS,
    HOSO_SELECT,
    hasProfileInput,
    toHoSoProfile,
    validateEmployeeProfile,
    uniqueProfileConflictMessage,
    assertUniqueProfileCodes,
    bindProfileFields,
    upsertEmployeeProfile,
    HOSO_SEED,
    backfillSeedHoSo
};
