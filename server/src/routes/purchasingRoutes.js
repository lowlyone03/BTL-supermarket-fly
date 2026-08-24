const express = require('express');
const controller = require('../controllers/warehouseController');
const orderController = require('../controllers/purchaseOrderController');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(verifyToken);
router.get('/purchase-requests', requirePermission('UC12'), controller.listPurchasingRequests);
router.get('/purchase-requests/:id', requirePermission('UC12'), controller.getPurchasingRequestDetail);
router.post('/purchase-requests/:id/accept', requirePermission('UC12'), controller.acceptPurchasingRequest);
router.post('/purchase-requests/:id/request-changes', requirePermission('UC12'), controller.requestPurchasingChanges);
router.get('/purchase-orders', requirePermission('UC13'), orderController.list);
router.get('/purchase-orders/:id', requirePermission('UC13'), orderController.getDetail);
router.post('/purchase-orders', requirePermission('UC13'), orderController.create);
router.put('/purchase-orders/:id', requirePermission('UC13'), orderController.update);
router.post('/purchase-orders/:id/submit', requirePermission('UC13'), orderController.submit);
router.post('/purchase-orders/:id/send-supplier', requirePermission('UC14'), orderController.sendSupplier);
router.post('/purchase-orders/:id/supplier-confirm', requirePermission('UC14'), orderController.confirmSupplier);
router.post('/purchase-orders/:id/shipments', requirePermission('UC14'), orderController.recordShipment);

module.exports = router;
