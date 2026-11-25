const express = require('express');
const { body } = require('express-validator');
const { protect, adminOnly } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const controller = require('../controllers/paymentController');

const router = express.Router();

router.get('/mode', controller.mode);
router.post('/create-order', protect, paymentLimiter, [body('bookingId').isInt({ min: 1 })], validate, controller.createOrder);
router.post('/verify', protect, paymentLimiter, [
  body('bookingId').isInt({ min: 1 }),
  body('razorpay_order_id').notEmpty(),
  body('razorpay_payment_id').notEmpty(),
  body('razorpay_signature').notEmpty()
], validate, controller.verify);
router.post('/dev-confirm', protect, paymentLimiter, [body('bookingId').isInt({ min: 1 })], validate, controller.devConfirm);
router.post('/failure', protect, paymentLimiter, [body('bookingId').isInt({ min: 1 })], validate, controller.failure);
router.get('/history', protect, controller.history);
router.post('/refund/:bookingId', protect, adminOnly, controller.refund);

module.exports = router;
