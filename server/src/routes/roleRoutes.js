const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { verifyToken, requireRole, requirePermission } = require('../middlewares/authMiddleware');

// Chỉ Quản lý cửa hàng mới có quyền vào các API này
router.use(verifyToken);
router.use(requireRole('Quản lý'));
router.use(requirePermission('UC02'));

router.get('/', roleController.getRoles);
router.get('/permissions', roleController.getPermissionMatrix);
router.put('/permissions', roleController.updatePermissions);
router.get('/staff-permissions', roleController.getStaffPermissions);
router.put('/employees/:maNV/permissions', roleController.updateEmployeePermissions);
router.post('/employees/:maNV/permissions/reset', roleController.resetEmployeePermissions);
router.post('/employees/:maNV/promote', roleController.promoteEmployee);

module.exports = router;
