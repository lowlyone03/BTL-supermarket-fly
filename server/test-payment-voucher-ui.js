'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desktop = relative => fs.readFileSync(path.join(__dirname, '..', 'desktop', relative), 'utf8');
const accounting = desktop('src/pages/accounting/accounting-pages.js');
const purchaseOrders = desktop('src/pages/warehouse/purchase-order-pages.js');
const dashboard = desktop('src/pages/dashboard/dashboard.js');

const sliceBetween = (src, startToken, endToken) => {
  const start = src.indexOf(startToken);
  const end = src.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `${startToken} .. ${endToken}`);
  return src.slice(start, end);
};

const bareHttpCall = /(?:^|[^\w.$])(?:post|put|get)\s*\(\s*[`'"]/m;

const paymentResultForm = sliceBetween(accounting, 'const paymentResultForm', 'const initPayables');
const paymentVoucherForm = sliceBetween(accounting, 'const paymentVoucherForm', 'const bulkPaymentVoucherForm');
const bulkForm = sliceBetween(accounting, 'const bulkPaymentVoucherForm', 'const paymentResultForm');
const payrollPayModal = sliceBetween(accounting, 'const payrollPayModal', 'const initPayroll');
const approvalModal = sliceBetween(purchaseOrders, 'const paymentVoucherApprovalModal', 'const payrollVoucherApprovalModal');

const voucherHandlers = [
  ['paymentResultForm', paymentResultForm],
  ['paymentVoucherForm', paymentVoucherForm],
  ['bulkPaymentVoucherForm', bulkForm],
  ['payrollPayModal', payrollPayModal],
  ['paymentVoucherApprovalModal', approvalModal]
];

for (const [name, src] of voucherHandlers) {
  assert.doesNotMatch(src, bareHttpCall, `${name} must not call undefined post/get/put`);
  assert.match(src, /await api\(context,/, `${name} posts through api()`);
  assert.match(src, /afterAccountingMutation\(context/, `${name} closes dialog and reloads via afterAccountingMutation`);
}

assert.match(paymentResultForm, /submit-payment-result/);
assert.match(paymentResultForm, /Ghi nhận kết quả/);
assert.match(paymentResultForm, /\/accounting\/payment-vouchers\/\$\{debt\.MaPhieu\}\/pay/);
assert.match(paymentResultForm, /method: 'POST'/);
assert.match(paymentResultForm, /ThanhCong: success/);
assert.match(paymentResultForm, /button\.isConnected/);
assert.doesNotMatch(paymentResultForm, /(?:^|[^\w.$])post\s*\(/m);

const helperStart = accounting.indexOf('const afterAccountingMutation');
const helperEnd = accounting.indexOf('const phrase = (text)', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'afterAccountingMutation is defined');
const afterAccountingMutation = new Function(`${accounting.slice(helperStart, helperEnd)}; return afterAccountingMutation;`)();

const runHelper = async extra => {
  const calls = [];
  const context = {
    showToast: (message, type) => calls.push(['toast', message, type]),
    refreshInbox: extra?.refreshInbox || (async () => { calls.push(['inbox']); })
  };
  const close = extra?.close || (() => { calls.push(['close']); });
  const onDone = extra?.onDone || (async () => { calls.push(['reload']); });
  await afterAccountingMutation(context, {
    close, onDone, message: extra?.message || 'Thanh toán thành công.', toastType: extra?.toastType || 'success'
  });
  return calls;
};

(async () => {
  const success = await runHelper();
  assert.deepEqual(success, [
    ['toast', 'Thanh toán thành công.', 'success'],
    ['close'],
    ['reload'],
    ['inbox']
  ]);

  const calls = [];
  await afterAccountingMutation({
    showToast: (message, type) => calls.push(['toast', message, type]),
    refreshInbox: async () => { throw new ReferenceError('post is not defined'); }
  }, {
    close: () => { calls.push(['close']); },
    onDone: async () => { calls.push(['reload']); },
    message: 'Thanh toán thành công.'
  });
  assert.deepEqual(calls, [
    ['toast', 'Thanh toán thành công.', 'success'],
    ['close'],
    ['reload']
  ], 'inbox/post ReferenceError must not undo close or reload');

  const failedApi = [];
  await afterAccountingMutation({
    showToast: (message, type) => failedApi.push(['toast', message, type])
  }, {
    close: () => { failedApi.push(['close']); },
    onDone: async () => { failedApi.push(['reload']); },
    message: 'Thanh toán thất bại.',
    toastType: 'error'
  });
  assert.equal(failedApi[0][2], 'error');
  assert.ok(failedApi.some(item => item[0] === 'close'));
  assert.ok(failedApi.some(item => item[0] === 'reload'));

  let closed = false;
  let reloaded = false;
  await afterAccountingMutation({
    showToast: () => { throw new ReferenceError('post is not defined'); },
    refreshInbox: async () => {}
  }, {
    close: () => { closed = true; },
    onDone: async () => { reloaded = true; },
    message: 'Thanh toán thành công.'
  });
  assert.equal(closed, true, 'dialog still closes if toast helper throws');
  assert.equal(reloaded, true, 'list still reloads if toast helper throws');

  assert.match(dashboard, /refreshInbox:\s*\(\)\s*=>\s*window\.FLY_REFRESH_INBOX/);
  assert.match(dashboard, /window\.FLY_REFRESH_INBOX = \(\) => refreshInboxSoon\(\{ announce: false \}\)/);
  assert.match(dashboard, /apiPost\('\/notifications\/read-all'\)/);

  console.log('PASS payment-voucher-ui');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
