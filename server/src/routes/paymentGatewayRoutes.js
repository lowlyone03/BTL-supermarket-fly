const express = require('express');
const controller = require('../controllers/paymentGatewayController');

const router = express.Router();
// JSON đã parse ở app.use(express.json()). urlencoded phòng ZaloPay form-post.
router.use(express.urlencoded({ extended: false }));
router.post('/ipn', controller.ipn);
router.get('/return', controller.returnUrl);

module.exports = router;
