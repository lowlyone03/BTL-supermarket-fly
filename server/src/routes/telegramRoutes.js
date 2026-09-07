const express = require('express');
const { verifyToken } = require('../middlewares/authMiddleware');
const controller = require('../controllers/telegramBotController');

const router = express.Router();

router.post('/webhook', controller.webhook);
router.post('/link-otp', verifyToken, controller.createLinkOtp);
router.get('/link-status', verifyToken, controller.getLinkStatus);
router.post('/unlink', verifyToken, controller.unlinkSelf);

module.exports = router;
