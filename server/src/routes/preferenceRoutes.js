'use strict';

const express = require('express');
const { verifyToken } = require('../middlewares/authMiddleware');
const preferenceController = require('../controllers/preferenceController');

const router = express.Router();
router.use(verifyToken);
router.get('/preferences', preferenceController.getMine);
router.put('/preferences', preferenceController.putMine);

module.exports = router;
