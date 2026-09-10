'use strict';

const express = require('express');
const { verifyToken, requirePermission } = require('../middlewares/authMiddleware');
const { uploadChatFile } = require('../middlewares/chatFileUpload');
const controller = require('../controllers/chatController');

const router = express.Router();
router.use(verifyToken);
router.use(requirePermission('UC01'));
router.get('/stream', controller.stream);
router.get('/unread', controller.unread);
router.get('/rooms', controller.rooms);
router.get('/vouchers', controller.vouchers);
router.get('/vouchers/:loai/:ma', controller.voucherOne);
router.get('/files/:maTin', controller.downloadFile);
router.get('/rooms/:maPhong/messages', controller.messages);
router.post('/rooms/:maPhong/messages', controller.postMessage);
router.post('/rooms/:maPhong/files', uploadChatFile, controller.postFile);
router.post('/rooms/:maPhong/read', controller.markRead);

module.exports = router;
