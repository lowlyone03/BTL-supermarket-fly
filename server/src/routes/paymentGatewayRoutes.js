const express = require('express');
const controller = require('../controllers/paymentGatewayController');

const router = express.Router();
router.post('/ipn', controller.ipn);
router.get('/return', controller.returnUrl);

module.exports = router;
