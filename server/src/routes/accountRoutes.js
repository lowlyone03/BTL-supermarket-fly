const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

// Chỉ Quản lý cửa hàng mới có quyền vào các API này
router.use(verifyToken);
router.use(requireRole('Quản lý'));

router.get('/', accountController.getAccounts);
router.post('/', accountController.createAccount);
router.patch('/:maTK/toggle-status', accountController.toggleAccountStatus);
router.patch('/:maTK/reset-password', accountController.resetPassword);
router.put('/:maTK/role', accountController.updateAccountRole);
router.get('/audit-log', accountController.getAuditLogs);

module.exports = router;
