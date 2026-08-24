const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const { verifyToken } = require('../middlewares/authMiddleware');

// API: POST /api/auth/login
router.post('/login', authController.login);

// API: PUT /api/auth/change-password
router.put('/change-password', verifyToken, authController.changePassword);

module.exports = router;
