const express = require('express');
const controller = require('../controllers/cashierController');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(verifyToken, requirePermission('UC22'));
router.get('/shifts', controller.getShifts);
router.post('/shifts/open', controller.openShift);

module.exports = router;
