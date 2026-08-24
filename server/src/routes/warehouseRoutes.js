const express = require('express');
const controller = require('../controllers/warehouseController');
const receiptController = require('../controllers/receiptController');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(verifyToken);
router.get('/dashboard', requirePermission('UC15'), controller.getDashboard);
router.get('/inventory', requirePermission('UC15'), controller.getInventory);
router.get('/purchase-requests', requirePermission('UC16'), controller.listWarehouseRequests);
router.get('/purchase-requests/:id', requirePermission('UC16'), controller.getWarehouseRequestDetail);
router.post('/purchase-requests', requirePermission('UC16'), controller.createRequest);
router.put('/purchase-requests/:id', requirePermission('UC16'), controller.updateRequest);
router.post('/purchase-requests/:id/submit', requirePermission('UC16'), controller.submitRequest);
router.post('/purchase-requests/:id/cancel', requirePermission('UC16'), controller.cancelRequest);
router.get('/receiving/orders', requirePermission('UC17'), receiptController.listAvailableOrders);
router.post('/receiving/shipments/:id/arrive', requirePermission('UC17'), receiptController.markShipmentArrived);
router.get('/receiving/shipments/:id', requirePermission('UC17'), receiptController.getShipmentForReceipt);
router.get('/receipts', requirePermission('UC17'), receiptController.listReceipts);
router.get('/receipts/:id', requirePermission('UC17'), receiptController.getReceiptDetail);
router.post('/receipts', requirePermission('UC17'), receiptController.createReceipt);
router.post('/receipts/:id/confirm', requirePermission('UC18'), receiptController.confirmReceipt);

module.exports = router;
