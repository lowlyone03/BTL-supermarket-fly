const express = require('express');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');
const controller = require('../controllers/assistantController');

const router = express.Router();
router.use(verifyToken);
router.post('/ask', requirePermission('UC01'), controller.postAsk);
router.get('/brief', requirePermission('UC01'), controller.getToday);
router.get('/alerts', requirePermission('UC01'), controller.getAlerts);
router.get('/insights', requirePermission('UC01'), controller.getInsights);
router.post('/scenario', requirePermission('UC01'), controller.postScenario);
router.get('/scenarios', requirePermission('UC01'), controller.getScenarios);
router.get('/invoices/purchase', requirePermission('UC01'), controller.getPurchaseInvoices);
router.get('/invoices/purchase/:id', requirePermission('UC01'), controller.getPurchaseInvoice);
router.get('/invoices/sales', requirePermission('UC01'), controller.getSalesInvoices);
router.get('/invoices/sales/:id', requirePermission('UC01'), controller.getSalesInvoice);
router.get('/docs/:kind/:id', requirePermission('UC01'), controller.getDocument);
router.get('/docs/:kind', requirePermission('UC01'), controller.getDocument);

module.exports = router;
