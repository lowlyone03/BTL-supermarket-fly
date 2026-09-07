const assert = require('node:assert/strict');
const {
    normalizeVnPhone, validateOptionalEmail, validateOptionalVnPhone,
    validateRequiredName, validateOptionalName, validateShipmentDocument, validateOptionalPackages,
    validateOptionalVnPlate, validateShipmentTimes, validateOptionalNote,
    validateUsername, validateNewPassword, validateEmployeeCode, validateRequiredCode,
    validateRequiredVnTaxId, validateOptionalVnTaxId, validateOptionalBhxh, validateOptionalBankAccount,
    validateOptionalMaritalStatus, validateOptionalCccd, validateOptionalGender, validateOptionalBarcode, validatePositiveInteger,
    validateRequiredNonNegativeInteger, validateRequiredNonNegativeNumber, validateClosingCash, validateOptionalDate, validateOptionalPastDate,
    validateRequiredText, validateRequiredCccd, validateRequiredVnPhone, validateEmployeeProfileFields
} = require('./src/services/fieldValidators');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Email trống được phép; nhập thì phải đúng format', () => {
    assert.equal(validateOptionalEmail('').ok, true);
    assert.equal(validateOptionalEmail('  ').ok, true);
    assert.equal(validateOptionalEmail('a@b.vn').ok, true);
    assert.equal(validateOptionalEmail('sai-email').ok, false);
});

test('SĐT VN chuẩn hóa +84/84 về 0 và chấp nhận 10–11 số', () => {
    assert.equal(normalizeVnPhone('+84901234567'), '0901234567');
    assert.equal(normalizeVnPhone('84901234567'), '0901234567');
    assert.equal(validateOptionalVnPhone('').ok, true);
    assert.equal(validateOptionalVnPhone('0901234567').ok, true);
    assert.equal(validateOptionalVnPhone('09012345678').ok, true);
    assert.equal(validateOptionalVnPhone('0123').ok, false);
    assert.equal(validateOptionalVnPhone('02412345678').ok, true);
});

test('Tên bắt buộc tối thiểu 2 ký tự sau trim, không toàn số', () => {
    assert.equal(validateRequiredName('  A  ').ok, false);
    assert.equal(validateRequiredName('An').ok, true);
    assert.equal(validateRequiredName('  ').ok, false);
    assert.equal(validateRequiredName('123').ok, false);
    assert.equal(validateRequiredName('12 34').ok, false);
    assert.equal(validateRequiredName('An 2').ok, true);
    assert.equal(validateOptionalName('').ok, true);
    assert.equal(validateOptionalName('9').ok, false);
});

test('Tên đăng nhập theo rule tài khoản: 3–50, không khoảng trắng', () => {
    assert.equal(validateUsername('ab').ok, false);
    assert.equal(validateUsername('admin').ok, true);
    assert.equal(validateUsername('Admin').value, 'admin');
    assert.equal(validateUsername('thungan.01').ok, true);
    assert.equal(validateUsername('thu ngan').ok, false);
    assert.equal(validateUsername('ThuNgan!').ok, false);
});

test('Mật khẩu mới tối thiểu 3 ký tự, không trống', () => {
    assert.equal(validateNewPassword('').ok, false);
    assert.equal(validateNewPassword('  ').ok, false);
    assert.equal(validateNewPassword('12').ok, false);
    assert.equal(validateNewPassword('123').ok, true);
});

test('Mã nhân viên / mã hồ sơ / MST / mã vạch', () => {
    assert.equal(validateEmployeeCode('nv_tn02').value, 'NV_TN02');
    assert.equal(validateEmployeeCode('A').ok, false);
    assert.equal(validateEmployeeCode('nv tn').ok, false);
    assert.equal(validateRequiredCode('ncc01', 'Mã Nhà cung cấp').value, 'ncc01');
    assert.equal(validateRequiredVnTaxId('0312345678').ok, true);
    assert.equal(validateRequiredVnTaxId('0312345678001').ok, true);
    assert.equal(validateRequiredVnTaxId('123').ok, false);
    assert.equal(validateOptionalBarcode('').ok, true);
    assert.equal(validateOptionalBarcode('8934567890123').ok, true);
    assert.equal(validateOptionalBarcode('ab 1').ok, false);
});

test('Tiền cuối ca: không âm, có trần; được nhỏ hơn quỹ đầu ca', () => {
    assert.equal(validateClosingCash(782000).ok, true);
    assert.equal(validateClosingCash(782000).value, 782000);
    assert.equal(validateClosingCash(0).ok, true);
    assert.equal(validateClosingCash('').ok, false);
    assert.equal(validateClosingCash(-1).ok, false);
    assert.equal(validateClosingCash('abc').ok, false);
    assert.equal(validateClosingCash(1_000_000_001).ok, false);
    assert.match(validateClosingCash(-1).message, /không âm/);
});

test('Số nguyên dương / không âm và ngày tùy chọn', () => {
    assert.equal(validatePositiveInteger(0, 'Số lượng').ok, false);
    assert.equal(validatePositiveInteger('3', 'Số lượng').value, 3);
    assert.equal(validatePositiveInteger('abc', 'Số lượng').ok, false);
    assert.equal(validateRequiredNonNegativeInteger(0, 'Tồn tối thiểu').ok, true);
    assert.equal(validateRequiredNonNegativeInteger(-1, 'Tồn tối thiểu').ok, false);
    assert.equal(validateRequiredNonNegativeNumber('', 'Giá bán').ok, false);
    assert.equal(validateOptionalDate('').ok, true);
    assert.equal(validateOptionalDate('2026-09-04').ok, true);
    assert.equal(validateOptionalDate('04/09/2026').ok, false);
    assert.equal(validateOptionalPastDate('2040-01-01', 'Ngày sinh').ok, false);
    assert.equal(validateOptionalPastDate('1995-06-12', 'Ngày sinh').ok, true);
    assert.equal(validateRequiredText('  SP  ', 'Tên sản phẩm', { min: 2 }).ok, true);
});

test('CCCD / CMND tùy chọn: 12 hoặc 9 chữ số; giới tính Nam/Nữ', () => {
    assert.equal(validateOptionalCccd('').ok, true);
    assert.equal(validateOptionalCccd('001234567890').ok, true);
    assert.equal(validateOptionalCccd('123456789').ok, true);
    assert.equal(validateOptionalCccd('0012 3456 7890').value, '001234567890');
    assert.equal(validateOptionalCccd('12345').ok, false);
    assert.equal(validateOptionalCccd('abc').ok, false);
    assert.equal(validateOptionalGender('').ok, true);
    assert.equal(validateOptionalGender('Nam').ok, true);
    assert.equal(validateOptionalGender('Nữ').ok, true);
    assert.equal(validateOptionalGender('Khác').ok, false);
});

test('Hồ sơ NV: MST / BHXH / STK / hôn nhân tùy chọn', () => {
    assert.equal(validateOptionalVnTaxId('').ok, true);
    assert.equal(validateOptionalVnTaxId('0108800312').ok, true);
    assert.equal(validateOptionalVnTaxId('0108800312001').ok, true);
    assert.equal(validateOptionalVnTaxId('010-880-0312').value, '0108800312');
    assert.equal(validateOptionalVnTaxId('123').ok, false);
    assert.equal(validateOptionalBhxh('').ok, true);
    assert.equal(validateOptionalBhxh('0119700617').ok, true);
    assert.equal(validateOptionalBhxh('011 970 0617').value, '0119700617');
    assert.equal(validateOptionalBhxh('12345').ok, false);
    assert.equal(validateOptionalBankAccount('').ok, true);
    assert.equal(validateOptionalBankAccount('012197061788').ok, true);
    assert.equal(validateOptionalBankAccount('12').ok, false);
    assert.equal(validateOptionalMaritalStatus('').ok, true);
    assert.equal(validateOptionalMaritalStatus('Độc thân').ok, true);
    assert.equal(validateOptionalMaritalStatus('Đã kết hôn').ok, true);
    assert.equal(validateOptionalMaritalStatus('Ly hôn').ok, true);
    assert.equal(validateOptionalMaritalStatus('Góa').ok, true);
    assert.equal(validateOptionalMaritalStatus('Khác').ok, true);
    assert.equal(validateOptionalMaritalStatus('Không rõ').ok, false);
});

test('Hồ sơ nhân viên: tạo mới bắt buộc, cập nhật dần, ràng buộc ngày/tuổi/enum', () => {
    const validNew = {
        TenNV: 'Nguyễn Văn A',
        CCCD: '001234567890',
        NgayCapCCCD: '2020-01-15',
        NoiCapCCCD: 'Cục Cảnh sát QLHC về TTXH',
        NgaySinh: '1998-05-20',
        GioiTinh: 'Nam',
        DanToc: 'Kinh',
        TonGiao: 'Không',
        QuocTich: 'Việt Nam',
        SDT: '0901234567',
        NgayVaoLam: '2024-01-10'
    };
    assert.equal(validateRequiredCccd('').ok, false);
    assert.equal(validateRequiredVnPhone('', 'Số điện thoại').ok, false);
    assert.equal(validateEmployeeProfileFields(validNew, { strictCreate: true }).ok, true);
    assert.equal(validateEmployeeProfileFields({ TenNV: 'Nguyễn Văn A' }, { strictCreate: true }).ok, false);
    assert.equal(validateEmployeeProfileFields({ TenNV: 'Nguyễn Văn A' }, { strictCreate: false }).ok, true);
    assert.equal(validateEmployeeProfileFields({
        ...validNew, CCCD: '001234567890', NoiCapCCCD: ''
    }, { strictCreate: true }).ok, false);
    assert.equal(validateEmployeeProfileFields({
        ...validNew, NguoiLienHe: 'Trần Thị B', SDTLienHe: ''
    }, { strictCreate: true }).ok, false);
    assert.equal(validateEmployeeProfileFields({
        ...validNew, NgayCapCCCD: '1990-01-01'
    }, { strictCreate: true }).ok, false);
    assert.equal(validateEmployeeProfileFields({
        ...validNew, NgaySinh: '2010-01-01', NgayVaoLam: '2024-01-01'
    }, { strictCreate: true }).ok, false);
    assert.equal(validateEmployeeProfileFields({
        ...validNew, DanToc: 'Người ngoài danh sách'
    }, { strictCreate: true }).ok, false);
    const created = validateEmployeeProfileFields({
        TenNV: 'Nguyễn Văn A',
        CCCD: '001234567890',
        NoiCapCCCD: 'Công an Hà Nội',
        NgaySinh: '1998-05-20',
        GioiTinh: 'Nữ',
        SDT: '0901234567',
        NgayVaoLam: '2024-01-10'
    }, { strictCreate: true });
    assert.equal(created.ok, true);
    assert.equal(created.profile.DanToc, 'Kinh');
    assert.equal(created.profile.TonGiao, 'Không');
    assert.equal(created.profile.QuocTich, 'Việt Nam');
});

test('Số phiếu giao và số kiện / biển số / thời gian vận chuyển', () => {
    assert.equal(validateShipmentDocument('PGH-240826-01').ok, true);
    assert.equal(validateShipmentDocument('ab').ok, false);
    assert.equal(validateOptionalPackages('').value, null);
    assert.equal(validateOptionalPackages(3).value, 3);
    assert.equal(validateOptionalPackages(0).ok, false);
    assert.equal(validateOptionalVnPlate('').ok, true);
    assert.equal(validateOptionalVnPlate('29H-123.45').ok, true);
    assert.equal(validateOptionalVnPlate('ABC').ok, false);
    const times = validateShipmentTimes('2026-09-04T15:00', '2026-09-04T19:00');
    assert.equal(times.ok, true);
    assert.equal(validateShipmentTimes('2026-09-04T19:00', '2026-09-04T15:00').ok, false);
    assert.equal(validateOptionalNote('ok', 500).ok, true);
});

console.log('PASS field-validators');
