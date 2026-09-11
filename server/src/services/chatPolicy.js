'use strict';

/** Chat nội bộ: một kênh chung. Các KenhVaiTro giữ seed để đồng bộ ẩn, không mở lại. */
const ROOM_SEED = [
    { MaPhong: 'CH_CUAHANG', Khoa: 'cua-hang', TenPhong: '#cửa-hàng', LoaiPhong: 'KenhChung', VaiTroNeo: null },
    { MaPhong: 'CH_QUANLY', Khoa: 'quan-ly', TenPhong: '#quản-lý', LoaiPhong: 'KenhVaiTro', VaiTroNeo: 'Quản lý' },
    { MaPhong: 'CH_KHO', Khoa: 'kho', TenPhong: '#kho', LoaiPhong: 'KenhVaiTro', VaiTroNeo: 'Thủ kho' },
    { MaPhong: 'CH_MUAHANG', Khoa: 'mua-hang', TenPhong: '#mua-hàng', LoaiPhong: 'KenhVaiTro', VaiTroNeo: 'Nhân viên mua hàng' },
    { MaPhong: 'CH_KETOAN', Khoa: 'ke-toan', TenPhong: '#kế-toán', LoaiPhong: 'KenhVaiTro', VaiTroNeo: 'Kế toán' },
    { MaPhong: 'CH_THUNGAN', Khoa: 'thu-ngan', TenPhong: '#thu-ngân', LoaiPhong: 'KenhVaiTro', VaiTroNeo: 'Thu ngân' },
    { MaPhong: 'CH_GIAHAN', Khoa: 'gia-han-ncc', TenPhong: '#gia-hạn NCC', LoaiPhong: 'KenhChung', VaiTroNeo: null }
];

const ALL_STORE_ROLES = ['Quản lý', 'Nhân viên mua hàng', 'Thủ kho', 'Thu ngân', 'Kế toán'];

const ROOM_MATRIX = {
    'cua-hang': ALL_STORE_ROLES,
    'quan-ly': [],
    'kho': [],
    'mua-hang': [],
    'ke-toan': [],
    'thu-ngan': [],
    'gia-han-ncc': []
};

const ROLE_FOLD = (value) => String(value || '').trim().toLocaleLowerCase('vi-VN');

const foldRole = ROLE_FOLD;

const rolesForRoom = (khoa) => ROOM_MATRIX[String(khoa || '')] || [];

const canRoleEnter = (tenVaiTro, khoa) => {
    const role = ROLE_FOLD(tenVaiTro);
    return rolesForRoom(khoa).some((name) => ROLE_FOLD(name) === role);
};

const roomsForRole = (tenVaiTro) => {
    const role = ROLE_FOLD(tenVaiTro);
    return ROOM_SEED.filter((room) => rolesForRoom(room.Khoa).some((name) => ROLE_FOLD(name) === role));
};

const SECRET_RE = /mật\s*khẩu|mat\s*khau|password|otp|jwt|bearer|api[_-]?key/i;
const CCCD_KEYWORD_RE = /cccd|căn\s*cước|can\s*cuoc|cmnd/i;
const TWELVE_DIGITS_RE = /\b\d{12}\b/;
const PAY_HINT_RE = /lương|luong|số\s*tài\s*khoản|so\s*tai\s*khoan|stk\b/i;
const APPROVE_HINT_RE = /duyệt\s*hộ|duyet\s*ho|duyệt\s*giúp|approve\s*hộ|\/approve/i;

const SOFT_TWELVE =
    'Tin có 12 chữ số. Hệ thống chỉ chặn khi kèm CCCD/căn cước/CMND — đây là guardrail đồ án, chặn cứng mọi 12 số dễ báo nhầm.';

const scanMessage = (text) => {
    const raw = String(text || '');
    if (SECRET_RE.test(raw)) {
        return {
            block: true,
            status: 400,
            message: 'Không gửi mật khẩu hay mã đăng nhập trong chat.',
            warning: null
        };
    }
    const hasTwelve = TWELVE_DIGITS_RE.test(raw);
    if (hasTwelve && CCCD_KEYWORD_RE.test(raw)) {
        return {
            block: true,
            status: 400,
            message: 'Không gửi số CCCD/CMND trong chat.',
            warning: null
        };
    }
    const hints = [];
    if (hasTwelve) hints.push(SOFT_TWELVE);
    if (PAY_HINT_RE.test(raw)) {
        hints.push('Kênh chung hiện với mọi bộ phận. Lương / số tài khoản không gửi ở đây.');
    }
    if (APPROVE_HINT_RE.test(raw)) {
        hints.push('Mở Trung tâm phê duyệt hoặc nút Telegram. Chat không duyệt được chứng từ.');
    }
    return { block: false, status: 200, message: null, warning: hints.join(' ') || null };
};

const isActiveActor = ({ TrangThaiNV, TrangThaiTK }) => (
    String(TrangThaiNV || '') === 'Đang làm việc' && Number(TrangThaiTK) === 1
);

const unreadFromWatermark = (messages, maTinCuoi, maNV) => {
    const watermark = Number(maTinCuoi || 0);
    return (messages || []).filter((row) => (
        Number(row.MaTin) > watermark
        && Number(row.DaXoa || 0) === 0
        && String(row.MaNV_Gui || '') !== String(maNV || '')
    )).length;
};

const clipText = (value, max = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const previewText = (value, max = 80) => {
    const text = clipText(value, 400);
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

module.exports = {
    ROOM_SEED,
    ROOM_MATRIX,
    foldRole,
    rolesForRoom,
    canRoleEnter,
    roomsForRole,
    scanMessage,
    isActiveActor,
    unreadFromWatermark,
    clipText,
    previewText,
    SOFT_TWELVE
};
