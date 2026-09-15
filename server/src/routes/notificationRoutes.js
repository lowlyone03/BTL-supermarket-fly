const express = require('express');
const { verifyToken } = require('../middlewares/authMiddleware');
const controller = require('../controllers/notificationController');

const router = express.Router();
router.use(verifyToken);
router.get('/stream', controller.stream);
router.get('/unread-count', controller.unreadCount);
router.post('/read-all', controller.readAll);
router.post('/:id/read', controller.readOne);
router.get('/', controller.list);

module.exports = router;
