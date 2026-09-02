const express = require('express');
const { verifyToken } = require('../middlewares/authMiddleware');
const controller = require('../controllers/notificationController');

const router = express.Router();
router.use(verifyToken);
router.get('/', controller.list);

module.exports = router;
