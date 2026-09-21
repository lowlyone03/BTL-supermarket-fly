'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = __dirname;
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const test = (name, fn) => {
    fn();
    console.log(`ok  ${name}`);
};

test('Không còn sessionService / schema bảo mật / migration JWT', () => {
    assert.equal(fs.existsSync(path.join(root, 'src/services/sessionService.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'src/services/backupSecuritySchema.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'migrations/SupermarketFly_Migration_20260921_BackupSecurity.sql')), false);
});

test('Auth không log login fail, không jti/session kill', () => {
    const auth = read('src/controllers/authController.js');
    assert.doesNotMatch(auth, /Đăng nhập thất bại/);
    assert.doesNotMatch(auth, /signUserToken|recordLoginSession|jti/);
    const mw = read('src/middlewares/authMiddleware.js');
    assert.doesNotMatch(mw, /assertActiveAccount|sessionService/);
    const routes = read('src/routes/authRoutes.js');
    assert.doesNotMatch(routes, /\/sessions|logout/);
    const account = read('src/controllers/accountController.js');
    assert.doesNotMatch(account, /revokeAccountTokens|sessionService/);
});

test('Backup SQL fail không ghi JSON giả; có restore + maintenance', () => {
    const service = read('src/services/backupService.js');
    assert.doesNotMatch(service, /writeMetadataFallback|ensureBackupSecuritySchema|SaoLuuCSDL|ChecksumSHA256/);
    assert.match(service, /Sao lưu SQL thất bại/);
    const controller = read('src/controllers/backupController.js');
    assert.doesNotMatch(controller, /security-logs|getSecurityLogs|listSecurityAccounts/);
    assert.match(controller, /saoLuuTruoc/);
    assert.match(controller, /getMaintenance/);
    const admin = read('src/routes/adminRoutes.js');
    assert.doesNotMatch(admin, /security-logs|security-accounts/);
    assert.match(admin, /\/restore/);
    assert.match(admin, /\/maintenance/);
});

test('Whitelist IPN + flag file bảo trì', () => {
    const maint = read('src/services/maintenanceService.js');
    assert.match(maint, /maintenance\.json/);
    assert.match(maint, /\/api\/payments\/gateway/);
    const guard = read('src/middlewares/maintenanceMiddleware.js');
    assert.match(guard, /MAINTENANCE/);
    const app = read('src/app.js');
    assert.match(app, /maintenanceGuard/);
});

test('UI 3 tab, không panel bảo mật / checksum', () => {
    const tpl = read('../desktop/src/pages/admin/admin-page-templates.js');
    assert.match(tpl, /Sao lưu &amp; bảo trì/);
    assert.match(tpl, /data-backup-tab="sao-luu"/);
    assert.match(tpl, /data-backup-tab="khoi-phuc"/);
    assert.match(tpl, /data-backup-tab="bao-tri"/);
    assert.doesNotMatch(tpl, /Nhật ký bảo mật|Phiên đăng nhập của bạn|Checksum/);
    const ui = read('../desktop/src/pages/admin/backup.js');
    assert.doesNotMatch(ui, /security-logs|security-accounts|checksum/);
    const nav = read('../desktop/src/pages/dashboard/dashboard.html');
    assert.match(nav, /Sao lưu &amp; bảo trì/);
});

test('Xác nhận khôi phục KHOI PHUC', () => {
    const { validateRestoreConfirm, RESTORE_CONFIRM_PHRASE } = require('./src/services/fieldValidators');
    assert.equal(RESTORE_CONFIRM_PHRASE, 'KHOI PHUC');
    assert.equal(validateRestoreConfirm('KHOI PHUC').ok, true);
    assert.equal(validateRestoreConfirm('khoi phuc').ok, true);
    assert.equal(validateRestoreConfirm('OK').ok, false);
});

test('Nhân viên chưa chọn không inherit store; overlay bảo trì i18n vi', () => {
    const pref = read('src/services/preferenceService.js');
    assert.match(pref, /own\.ngonNgu \|\| 'vi'/);
    assert.match(pref, /own\.giaoDien \|\| 'light'/);
    assert.doesNotMatch(pref, /own\.ngonNgu \|\| store\.ngonNgu/);
    const appearance = read('../desktop/src/i18n/appearance.js');
    assert.match(appearance, /daChonNgonNgu/);
    assert.match(appearance, /APP_DEFAULT/);
    assert.doesNotMatch(appearance, /fly_pref_last' \|\| '\{\}'/);
    const dashHtml = read('../desktop/src/pages/dashboard/dashboard.html');
    assert.match(dashHtml, /data-i18n="maint.title"/);
    assert.match(dashHtml, /data-theme="light"/);
    assert.match(dashHtml, /data-lang="vi"/);
    assert.doesNotMatch(dashHtml, /fly_pref_last/);
    const dashJs = read('../desktop/src/pages/dashboard/dashboard.js');
    assert.match(dashJs, /fromServer/);
    assert.match(dashJs, /t\('maint\.reason'\)/);
    assert.doesNotMatch(dashJs, /setLang\(|setTheme\(/);
    const vi = read('../desktop/src/i18n/vi.js');
    assert.match(vi, /'maint.title': 'HỆ THỐNG ĐANG BẢO TRÌ'/);
});

console.log('test-backup-maintenance: tất cả bước đều qua.');
