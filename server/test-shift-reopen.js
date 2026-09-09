const assert = require('node:assert/strict');
const {
    CLOSE_SHIFT_CONFIRM_PHRASE,
    CHECK_OUT_CONFIRM_PHRASE,
    validateCloseShiftConfirm,
    validateCheckOutConfirm
} = require('./src/services/fieldValidators');
const { isConfirmedFundReceipt, otherOpenShiftBlocks } = require('./src/services/shiftReopen');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Đóng ca phải gõ DONG CA / ĐÓNG CA, không đóng 1 cụm trống', () => {
    assert.equal(CLOSE_SHIFT_CONFIRM_PHRASE, 'DONG CA');
    assert.equal(validateCloseShiftConfirm('').ok, false);
    assert.equal(validateCloseShiftConfirm('dong ca').ok, true);
    assert.equal(validateCloseShiftConfirm('  Đóng  ca  ').ok, true);
    assert.equal(validateCloseShiftConfirm('DONGCA').ok, false);
    assert.equal(validateCloseShiftConfirm('OK').ok, false);
});

test('Chấm công ra phải gõ RA CA', () => {
    assert.equal(CHECK_OUT_CONFIRM_PHRASE, 'RA CA');
    assert.equal(validateCheckOutConfirm('ra ca').ok, true);
    assert.equal(validateCheckOutConfirm('RA  CA').ok, true);
    assert.equal(validateCheckOutConfirm('out').ok, false);
});

test('P0: phiếu thu đã xác nhận thì không reopen', () => {
    assert.equal(isConfirmedFundReceipt(null), false);
    assert.equal(isConfirmedFundReceipt({ TrangThai: 'Nháp' }), false);
    assert.equal(isConfirmedFundReceipt({ TrangThai: 'Đã xác nhận' }), true);
    assert.equal(isConfirmedFundReceipt({ TrangThai: 'Nháp', NgayXacNhan: new Date() }), true);
});

test('Rule 1 ca: ca khác đang mở thì chặn reopen', () => {
    assert.equal(otherOpenShiftBlocks('CA1', null), false);
    assert.equal(otherOpenShiftBlocks('CA1', { MaCa: 'CA1' }), false);
    assert.equal(otherOpenShiftBlocks('CA1', { MaCa: 'CA2' }), true);
});

console.log('SHIFT REOPEN GUARDS PASS');
