const express = require('express');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');
const controller = require('../controllers/assistantController');

const router = express.Router();
router.use(verifyToken);
router.post('/ask', requirePermission('UC01'), controller.postAsk);
router.get('/brief', requirePermission('UC01'), controller.getToday);
router.get('/alerts', requirePermission('UC01'), controller.getAlerts);
router.get('/insights', requirePermission('UC01'), controller.getInsights);
router.post('/scenario', requirePermission('UC01'), controller.postScenario);

module.exports = router;
