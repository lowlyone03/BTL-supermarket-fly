const assert = require('node:assert/strict');
const {
    normalizeVnPhone, validateOptionalEmail, validateOptionalVnPhone,
    validateRequiredName, validateOptionalName, validateShipmentDocument, validateOptionalPackages,
    validateOptionalVnPlate, validateShipmentTimes, validateOptionalNote,
    validateUsername, validateNewPassword, validateEmployeeCode, validateRequiredCode,
    validateRequiredVnTaxId, validateOptionalBarcode, validatePositiveInteger,
    validateRequiredNonNegativeInteger, validateRequiredNonNegativeNumber, validateOptionalDate,
    validateRequiredText
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
    assert.equal(validateRequiredText('  SP  ', 'Tên sản phẩm', { min: 2 }).ok, true);
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
