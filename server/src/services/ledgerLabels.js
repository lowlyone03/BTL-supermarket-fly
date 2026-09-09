const { calendarizeRow } = require('./reportingPeriod');

const EXPENSE_TYPE_LABELS = {
    DIEN: 'Tiền điện',
    NUOC: 'Tiền nước',
    THUE_NHA: 'Thuê mặt bằng',
    VP: 'Văn phòng phẩm',
    CUOC: 'Cước vận chuyển',
    QUANG_CAO: 'Quảng cáo',
    SUA_CHUA: 'Sửa chữa nhỏ',
    KHAC: 'Chi phí khác'
};

const EXPENSE_NAME_FALLBACK = {
    'Tien dien': 'Tiền điện',
    'Tien nuoc': 'Tiền nước',
    'Thue mat bang': 'Thuê mặt bằng',
    'Van phong pham': 'Văn phòng phẩm',
    'Cuoc van chuyen': 'Cước vận chuyển',
    'Quang cao': 'Quảng cáo',
    'Sua chua nho': 'Sửa chữa nhỏ',
    'Chi phi khac': 'Chi phí khác'
};

const ACCOUNT_NAME_LABELS = {
    111: 'Tiền mặt',
    112: 'Tiền gửi ngân hàng',
    1331: 'Thuế GTGT được khấu trừ',
    138: 'Phải thu khác (thiếu quỹ ca)',
    156: 'Hàng hóa',
    211: 'TSCĐ hữu hình',
    214: 'Hao mòn TSCĐ',
    331: 'Phải trả người bán',
    33311: 'Thuế GTGT đầu ra',
    334: 'Phải trả người lao động',
    411: 'Vốn chủ sở hữu',
    421: 'Kết quả kinh doanh lũy kế (mini, chưa TNDN)',
    511: 'Doanh thu bán hàng',
    5212: 'Chiết khấu / giảm giá',
    632: 'Giá vốn hàng bán',
    642: 'Chi phí quản lý doanh nghiệp',
    711: 'Thu nhập khác',
    911: 'Xác định kết quả kinh doanh'
};

const NARRATIVE_PREFIXES = [
    ['Ban hang ', 'Bán hàng '],
    ['Gia von ', 'Giá vốn '],
    ['Hoan tien ', 'Hoàn tiền '],
    ['Nhap lai kho ', 'Nhập lại kho '],
    ['Giao doi ', 'Giao đổi '],
    ['Mua hang ', 'Mua hàng '],
    ['Tra hang NCC ', 'Trả hàng NCC '],
    ['Tra NCC ', 'Trả NCC '],
    ['Xuat huy ', 'Xuất hủy '],
    ['Xuat noi bo ', 'Xuất nội bộ '],
    ['Trich luong ', 'Trích lương '],
    ['Chi luong ', 'Chi lương '],
    ['Lech quy ', 'Lệch quỹ '],
    ['Kiem ke thieu ', 'Kiểm kê thiếu '],
    ['Kiem ke thua ', 'Kiểm kê thừa '],
    ['Chi phi ', 'Chi phí '],
    ['Mua TSCD ', 'Mua TSCĐ '],
    ['So du dau ky ', 'Số dư đầu kỳ '],
    ['Ket chuyen ', 'Kết chuyển '],
    ['Khau hao ', 'Khấu hao '],
    ['Dao ', 'Đảo ']
];

const DOC_TYPE_LABELS = {
    HoaDon: 'Hóa đơn bán',
    HoaDonMuaHang: 'Hóa đơn mua hàng',
    PhieuChi: 'Phiếu chi nhà cung cấp',
    PhieuNhap: 'Phiếu nhập kho',
    PhieuXuat: 'Phiếu xuất kho',
    PhieuDoiTra: 'Phiếu đổi trả',
    PhieuThu: 'Phiếu thu cuối ca',
    PhieuChiLuong: 'Phiếu chi lương',
    ChiPhiVanHanh: 'Phiếu chi phí vận hành',
    TaiSanCoDinh: 'Thẻ tài sản cố định',
    KyKeToan: 'Kỳ kế toán',
    KyLuong: 'Kỳ lương',
    ThuCong: 'Bút toán thủ công',
    KiemKe: 'Kiểm kê',
    CaLamViec: 'Ca bán hàng',
    ButToan: 'Bút toán',
    TaiKhoanNganHang: 'Tài khoản ngân hàng',
    SaoKeNganHang: 'Sao kê ngân hàng',
    TaiKhoanKeToan: 'Tài khoản kế toán',
    SoDuDauKy: 'Số dư đầu kỳ',
    ChoGhiSo: 'Chờ ghi sổ'
};

const JOURNAL_TYPE_LABELS = {
    BAN_HANG: 'Bán hàng',
    GIA_VON: 'Giá vốn',
    MUA_HANG: 'Mua hàng',
    TRA_NCC: 'Trả nhà cung cấp',
    TRA_NCC_HANG: 'Trả hàng nhà cung cấp',
    CHI_PHI: 'Chi phí vận hành',
    CHI_LUONG: 'Chi lương',
    TRICH_LUONG: 'Trích lương',
    DOI_TRA_HOAN: 'Đổi trả / hoàn tiền',
    DOI_TRA_NHAP_KHO: 'Đổi trả nhập kho',
    DOI_TRA_GIAO_DOI: 'Đổi trả giao đổi',
    LECH_QUY: 'Lệch quỹ',
    SODU_DAU_KY: 'Số dư đầu kỳ',
    KET_CHUYEN: 'Kết chuyển',
    DAO_KET_CHUYEN: 'Đảo kết chuyển',
    THU_CONG: 'Thủ công',
    MUA_TSCD: 'Mua TSCĐ',
    KHAU_HAO: 'Khấu hao',
    KK_THIEU: 'Kiểm kê thiếu',
    KK_THUA: 'Kiểm kê thừa',
    XUAT_HUY: 'Xuất hủy',
    XUAT_NOI_BO: 'Xuất nội bộ'
};

const REASON_LABELS = {
    THIEU_THUE: 'Thiếu thuế suất — POS chặn / chưa ghi sổ được',
    PN_CHUA_DOI_CHIEU: 'Phiếu nhập chưa đối chiếu 3 bên',
    KY_KHOA: 'Kỳ đã khóa — chờ ghi sổ trễ',
    THIEU_BAN_HANG: 'Thiếu bút toán Bán hàng / Giá vốn',
    'Thieu BAN_HANG/GIA_VON': 'Thiếu bút toán Bán hàng / Giá vốn',
    THIEU_MUA_HANG: 'Thiếu bút toán Mua hàng',
    'Thieu MUA_HANG': 'Thiếu bút toán Mua hàng',
    THIEU_CHI_PHI: 'Thiếu bút toán Chi phí vận hành'
};

const STATUS_LABELS = {
    Mo: 'Mở',
    Khoa: 'Khóa',
    ChuaMo: 'Chưa mở',
    DeNghiKhoa: 'Đề nghị khóa',
    'Su dung': 'Đang sử dụng',
    Ngung: 'Ngừng',
    Nhap: 'Nháp',
    DaXacNhan: 'Đã xác nhận',
    DaHuy: 'Đã hủy',
    DaGhiSo: 'Đã ghi sổ',
    ChoGhiSo: 'Chờ ghi sổ',
    ThuCong: 'Thủ công',
    Seeding: 'Số dư đầu kỳ',
    Engine: 'Hệ thống',
    TuDong: 'Hệ thống',
    'Chua khop': 'Chưa khớp',
    'Khop tu dong': 'Khớp tự động',
    'Khop thu cong': 'Khớp thủ công',
    'Chenh lech': 'Chênh lệch'
};

const VAT_SOURCE_LABELS = {
    HoaDonMuaHang: 'Hóa đơn mua hàng',
    ChiPhi: 'Chi phí vận hành',
    TSCD: 'Tài sản cố định',
    TRA_NCC_HANG: 'Trả hàng nhà cung cấp'
};

const pick = (map, value) => {
    if (value == null || value === '') return '—';
    const key = String(value);
    return map[key] || map[key.trim()] || key;
};

const expenseTypeLabel = (maLoai, tenLoai) =>
    EXPENSE_TYPE_LABELS[maLoai] || EXPENSE_NAME_FALLBACK[tenLoai] || tenLoai || maLoai || '—';

const accountNameLabel = (maTK, tenTK) => {
    const key = String(maTK ?? '').trim();
    return ACCOUNT_NAME_LABELS[key] || tenTK || key || '—';
};

const narrativeLabel = (text) => {
    if (text == null || text === '') return text;
    const raw = String(text);
    for (const [from, to] of NARRATIVE_PREFIXES) {
        if (raw.startsWith(from)) return to + raw.slice(from.length);
    }
    return raw;
};

const docTypeLabel = value => pick(DOC_TYPE_LABELS, value);

const journalTypeLabel = (value) => {
    const raw = String(value || '');
    if (!raw) return '—';
    if (JOURNAL_TYPE_LABELS[raw]) return JOURNAL_TYPE_LABELS[raw];
    if (raw.startsWith('DAO_')) {
        const inner = JOURNAL_TYPE_LABELS[raw.slice(4)] || raw.slice(4);
        return `Đảo ${String(inner).charAt(0).toLowerCase()}${String(inner).slice(1)}`;
    }
    return raw;
};

const reasonLabel = value => pick(REASON_LABELS, value);

const statusLabel = value => pick(STATUS_LABELS, value);

const vatSourceLabel = value => pick(VAT_SOURCE_LABELS, value);

const periodMonthLabel = (maKy) => {
    const match = String(maKy || '').trim().match(/^(\d{4})-(\d{2})/);
    return match ? `Tháng ${Number(match[2])}/${match[1]}` : (maKy ? String(maKy) : '—');
};

const presentExpense = row => {
    const next = calendarizeRow({
        ...row,
        TenLoaiCP: expenseTypeLabel(row.MaLoaiCP, row.TenLoaiCP),
        HasJournal: Number(row?.HasJournal) ? 1 : 0
    });
    next.TenKy = periodMonthLabel(next.MaKy);
    return next;
};

const presentAccount = row => {
    if (!row) return row;
    return { ...row, TenTK: accountNameLabel(row.MaTK, row.TenTK) };
};

const presentJournalRow = row => {
    if (!row) return row;
    const next = calendarizeRow({ ...row });
    if (next.MaTK != null || next.TenTK != null) next.TenTK = accountNameLabel(next.MaTK, next.TenTK);
    if (next.DienGiai != null) next.DienGiai = narrativeLabel(next.DienGiai);
    if (next.DienGiaiDong != null) next.DienGiaiDong = narrativeLabel(next.DienGiaiDong);
    return next;
};

module.exports = {
    EXPENSE_TYPE_LABELS,
    ACCOUNT_NAME_LABELS,
    DOC_TYPE_LABELS,
    JOURNAL_TYPE_LABELS,
    REASON_LABELS,
    STATUS_LABELS,
    VAT_SOURCE_LABELS,
    expenseTypeLabel,
    accountNameLabel,
    narrativeLabel,
    docTypeLabel,
    journalTypeLabel,
    reasonLabel,
    statusLabel,
    vatSourceLabel,
    presentExpense,
    presentAccount,
    presentJournalRow,
    periodMonthLabel
};
