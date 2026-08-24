const express = require('express');
const controller = require('../controllers/accountingController');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(verifyToken, requirePermission('UC27'));
router.get('/receipt-files', controller.listReceiptFiles);
router.get('/receipt-files/:id', controller.getReceiptFile);
router.get('/purchase-order-files', controller.listPurchaseOrderFiles);
router.get('/purchase-order-files/:id', controller.getPurchaseOrderFile);
router.get('/purchase-invoices', controller.listInvoices);
router.get('/purchase-invoices/:id/reconciliation-preview', controller.previewReconciliation);
router.get('/purchase-invoices/:id', controller.getInvoiceDetail);
router.post('/purchase-invoices', controller.createInvoice);
router.post('/purchase-invoices/:id/reconcile', controller.reconcileInvoice);

module.exports = router;
