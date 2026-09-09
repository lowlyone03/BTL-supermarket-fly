const express = require('express');
const controller = require('../controllers/ledgerController');
const { verifyToken, requirePermission, requireAnyPermission } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(verifyToken);

router.get('/handbook', requireAnyPermission(['UC34', 'UC35', 'UC43']), controller.getHandbook);

const kt34 = requirePermission('UC34');
const kt35 = requirePermission('UC35');
const kt36 = requirePermission('UC36');
const kt37 = requirePermission('UC37');
const soCai = requireAnyPermission(['UC38', 'UC43']);
const khoaKy = requireAnyPermission(['UC39']);
const vat = requireAnyPermission(['UC40', 'UC43']);
const kt41 = requirePermission('UC41');
const kt42 = requirePermission('UC42');
const baoCao = requireAnyPermission(['UC43', 'UC38']);

router.get('/accounts', kt34, controller.listAccounts);
router.post('/accounts', kt34, controller.saveAccount);
router.patch('/accounts/:maTK', kt34, controller.patchAccount);

router.get('/periods', requireAnyPermission(['UC35', 'UC39', 'UC43']), controller.listPeriods);
router.post('/periods', kt35, controller.upsertPeriod);
router.post('/periods/:maKy/open', kt35, controller.openPeriod);
router.get('/periods/:maKy/opening', kt35, controller.getOpening);
router.put('/periods/:maKy/opening', kt35, controller.saveOpening);
router.post('/periods/:maKy/opening/lock', kt35, controller.lockOpening);

router.get('/expense-types', kt36, controller.listExpenseTypes);
router.get('/expenses', kt36, controller.listExpenses);
router.post('/expenses', kt36, controller.createExpense);
router.post('/expenses/:id/confirm', kt36, controller.confirmExpense);
router.post('/expenses/:id/cancel', kt36, controller.cancelExpense);

router.get('/documents/:loai/:id', requireAnyPermission(['UC36', 'UC37', 'UC40', 'UC41', 'UC43']), controller.getDocument);
router.get('/unposted', kt37, controller.listUnposted);
router.post('/unposted/:id/post', kt37, controller.postUnposted);
router.get('/journals', kt37, controller.listJournals);
router.get('/journals/:id', kt37, controller.getJournal);
router.post('/journals', kt37, controller.createManualJournal);
router.post('/journals/:id/reverse', kt37, controller.reverseManual);
router.get('/preview', kt37, controller.previewExisting);

router.get('/reports/journal', soCai, controller.journalReport);
router.get('/reports/general-ledger', soCai, controller.generalLedger);
router.get('/reports/trial-balance', soCai, controller.trialBalance);

router.get('/periods/:maKy/close-check', khoaKy, controller.closeCheck);
router.post('/periods/:maKy/closing-entry', khoaKy, controller.postClosing);
router.post('/periods/:maKy/close', khoaKy, controller.closePeriod);
router.post('/periods/:maKy/reopen', khoaKy, controller.reopenPeriod);

router.get('/reports/vat-output', vat, controller.vatOutput);
router.get('/reports/vat-input', vat, controller.vatInput);
router.get('/reports/vat-summary', vat, controller.vatSummary);

router.get('/assets', kt41, controller.listAssets);
router.post('/assets', kt41, controller.createAsset);
router.post('/assets/:id/confirm', kt41, controller.confirmAsset);
router.post('/periods/:maKy/depreciation', kt41, controller.runDepreciation);

router.get('/bank-accounts', kt42, controller.listBankAccounts);
router.post('/bank-accounts', kt42, controller.createBankAccount);
router.post('/bank-statements', kt42, controller.csvUpload.single('file'), controller.importStatement);
router.get('/bank-statements/:id', kt42, controller.getStatement);
router.post('/bank-statements/:id/auto-match', kt42, controller.autoMatchStatement);
router.post('/bank-lines/:id/match', kt42, controller.matchBankLine);
router.post('/bank-lines/:id/mismatch', kt42, controller.mismatchBankLine);

router.get('/reports/income-statement', baoCao, controller.incomeStatement);
router.get('/reports/balance-sheet', baoCao, controller.balanceSheet);
router.get('/reports/cash-flow', baoCao, controller.cashFlow);
router.get('/reports/cash-movement', baoCao, controller.cashMovement);

module.exports = router;
