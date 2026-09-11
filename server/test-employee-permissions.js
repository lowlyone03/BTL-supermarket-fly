'use strict';

const assert = require('node:assert/strict');
const {
    MANAGER_FIXED_PERMISSION_CODES,
    codesFromRoleName,
    uniqueCodes,
    sameSet,
    mergeEffective,
    codesOf,
    hasUc
} = require('./src/services/effectivePermissions');
const { ALL, catalogFor, visibleFor } = require('./src/services/assistantScenarios');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

const cashierRole = codesFromRoleName('Thu ngân');

test('Thu ngân kế thừa mẫu vai trò khi chưa có dòng NhanVien_ChucNang', () => {
    assert.ok(cashierRole.includes('UC22'));
    assert.equal(cashierRole.includes('UC28'), false);
    assert.deepEqual(
        mergeEffective({ roleCodes: cashierRole, overrideCodes: null, tenVaiTro: 'Thu ngân' }),
        uniqueCodes(cashierRole)
    );
});

test('Tùy chỉnh nhân viên thay cả bộ quyền, không cộng dồn mẫu', () => {
    const custom = ['UC01', 'UC22', 'UC23', 'UC24', 'UC25', 'UC26', 'UC28', 'UC31'];
    const merged = mergeEffective({
        roleCodes: cashierRole,
        overrideCodes: custom,
        tenVaiTro: 'Thu ngân'
    });
    assert.deepEqual(merged.sort(), uniqueCodes(custom).sort());
    assert.ok(merged.includes('UC28'));
    assert.equal(merged.includes('UC37'), false);
});

test('Lưu trùng mẫu vai trò được coi là inherit (xóa override)', () => {
    assert.equal(sameSet(cashierRole, [...cashierRole].reverse()), true);
    assert.equal(sameSet(cashierRole, [...cashierRole, 'UC28']), false);
});

test('Quản lý luôn cố định, không tùy chỉnh theo người', () => {
    const merged = mergeEffective({
        roleCodes: MANAGER_FIXED_PERMISSION_CODES,
        overrideCodes: ['UC01', 'UC22'],
        tenVaiTro: 'Quản lý'
    });
    assert.ok(MANAGER_FIXED_PERMISSION_CODES.every((code) => merged.includes(code)));
    assert.equal(merged.includes('UC22'), false);
});

test('codesOf ưu tiên Quyen đã hydrate; hasUc theo nhân viên', () => {
    const user = { TenVaiTro: 'Thu ngân', Quyen: ['UC01', 'UC22', 'UC28'] };
    assert.equal(hasUc(user, 'UC28'), true);
    assert.equal(hasUc({ TenVaiTro: 'Thu ngân' }, 'UC28'), false);
    assert.deepEqual(codesOf(user), ['UC01', 'UC22', 'UC28']);
});

test('Catalog kịch bản AI: mỗi mục có UC hợp lệ; thu ngân không thấy công nợ', () => {
    assert.ok(ALL.length >= 100);
    for (const item of ALL) {
        assert.ok(Array.isArray(item.uc), item.id);
        assert.ok(item.uc.every((code) => /^UC\d{2}$/.test(code)), item.id);
        assert.ok(item.prompt && item.title, item.id);
    }
    const cashier = { TenVaiTro: 'Thu ngân' };
    const ids = visibleFor(cashier).map((item) => item.id);
    assert.ok(ids.includes('tn-ket-ca'));
    assert.equal(ids.includes('kt-phan-tram-tra'), false);
    assert.equal(ids.includes('nav-cong-no'), false);
    const manager = catalogFor({ TenVaiTro: 'Quản lý' });
    assert.equal(manager.total, ALL.length);
    assert.equal(manager.denyDuyet, true);
    const cashierCat = catalogFor(cashier);
    assert.ok(cashierCat.total < ALL.length);
    assert.ok(!JSON.stringify(cashierCat.groups).includes('kt-phan-tram-tra'));
});

test('NhanVien_ChucNang.MaChucNang cùng kiểu VARCHAR(20) với ChucNang', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, 'src/services/effectivePermissions.js'), 'utf8');
    const sql = fs.readFileSync(path.join(__dirname, 'migrations/SupermarketFly_Migration_20260911_EmployeePermsPartialPay.sql'), 'utf8');
    assert.match(src, /MaChucNang\s+VARCHAR\(20\)/);
    assert.doesNotMatch(src, /MaChucNang\s+VARCHAR\(10\)/);
    assert.match(sql, /MaChucNang\s+VARCHAR\(20\)/);
    assert.doesNotMatch(sql, /MaChucNang\s+VARCHAR\(10\)/);
});

console.log('employee-permissions tests ok');
