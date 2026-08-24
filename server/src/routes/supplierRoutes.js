const express = require('express');
const controller = require('../controllers/supplierController');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(verifyToken, requirePermission('UC11'));
router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.setStatus);
router.get('/:id/purchase-orders', controller.orderHistory);

module.exports = router;
