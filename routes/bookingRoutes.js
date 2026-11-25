const express = require('express');
const { body } = require('express-validator');
const { protect, optionalAuth } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const controller = require('../controllers/bookingController');

const router = express.Router();

router.post('/quote', optionalAuth, [
  body('showId').isInt({ min: 1 }),
  body('seatIds').isArray({ min: 1, max: 10 }),
  body('couponCode').optional({ nullable: true }).trim()
], validate, controller.quote);

router.get('/seats/:showId', optionalAuth, controller.seatMap);

router.post('/reserve', optionalAuth, paymentLimiter, [
  body('showId').isInt({ min: 1 }),
  body('seatIds').isArray({ min: 1, max: 10 }),
  body('sessionId').optional().isString()
], validate, controller.reserve);

router.post('/release', optionalAuth, [
  body('showId').isInt({ min: 1 }),
  body('seatIds').isArray({ min: 1 })
], validate, controller.release);

router.post('/', protect, [
  body('showId').isInt({ min: 1 }).withMessage('A valid show is required.'),
  body('seatIds').isArray({ min: 1, max: 10 }).withMessage('Select 1 to 10 seats.'),
  body('couponCode').optional({ nullable: true }).trim(),
  body('sessionId').optional().isString()
], validate, controller.create);

router.get('/mine', protect, controller.mine);
router.get('/:id', protect, controller.getOne);
router.post('/:id/cancel', protect, controller.cancel);

module.exports = router;
