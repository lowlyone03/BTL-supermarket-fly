const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { verifyToken, requireRole, requirePermission } = require('../middlewares/authMiddleware');

// Chỉ Quản lý cửa hàng mới có quyền vào các API này
router.use(verifyToken);
router.use(requireRole('Quản lý'));
router.use(requirePermission('UC04'));

router.get('/', employeeController.getEmployees);
router.get('/available', employeeController.getAvailableEmployees);
router.get('/:maNV', employeeController.getEmployeeById);
router.post('/', employeeController.createEmployee);
router.put('/:maNV', employeeController.updateEmployee);

module.exports = router;
