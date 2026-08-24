const express = require('express');
const adminController = require('../controllers/adminController');
const catalogController = require('../controllers/catalogController');
const orderController = require('../controllers/purchaseOrderController');
const { verifyToken, requireRole, requirePermission } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);
router.use(requireRole('Quản lý'));
router.get('/dashboard', adminController.getDashboard);
router.get('/approvals/queues', requirePermission('UC05'), adminController.getApprovalQueues);
router.get('/finance/payables', requirePermission('UC10'), adminController.getPayablesOverview);
router.get('/finance/payables/:id', requirePermission('UC10'), adminController.getPayableDetail);
router.get('/catalog/categories', requirePermission('UC04'), catalogController.getCategories);
router.post('/catalog/categories', requirePermission('UC04'), catalogController.createCategory);
router.put('/catalog/categories/:id', requirePermission('UC04'), catalogController.updateCategory);
router.patch('/catalog/categories/:id/status', requirePermission('UC04'), catalogController.setCategoryStatus);
router.get('/catalog/products', requirePermission('UC04'), catalogController.getProducts);
router.post('/catalog/products', requirePermission('UC04'), catalogController.createProduct);
router.put('/catalog/products/:id', requirePermission('UC04'), catalogController.updateProduct);
router.patch('/catalog/products/:id/status', requirePermission('UC04'), catalogController.setProductStatus);
router.get('/approvals/purchase-orders', requirePermission('UC05'), orderController.list);
router.get('/approvals/purchase-orders/:id', requirePermission('UC05'), orderController.getDetail);
router.post('/approvals/purchase-orders/:id/approve', requirePermission('UC05'), orderController.approve);
router.post('/approvals/purchase-orders/:id/request-changes', requirePermission('UC05'), orderController.requestChanges);
router.post('/approvals/purchase-orders/:id/reject', requirePermission('UC05'), orderController.reject);

module.exports = router;
