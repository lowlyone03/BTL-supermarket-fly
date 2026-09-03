const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { verifyToken, requireRole, requirePermission } = require('../middlewares/authMiddleware');

// Chỉ Quản lý cửa hàng mới có quyền vào các API này
router.use(verifyToken);
router.use(requireRole('Quản lý'));
router.use(requirePermission('UC02'));

router.get('/', accountController.getAccounts);
router.post('/', accountController.createAccount);
router.patch('/:maTK/toggle-status', accountController.toggleAccountStatus);
router.patch('/:maTK/reset-password', accountController.resetPassword);
router.put('/:maTK/role', accountController.updateAccountRole);
router.get('/audit-log/filters', accountController.getAuditFilters);
router.get('/audit-log/export', accountController.exportAuditLogs);
router.get('/audit-log', accountController.getAuditLogs);

module.exports = router;
