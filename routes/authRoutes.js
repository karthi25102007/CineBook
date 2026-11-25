const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const controller = require('../controllers/authController');

const router = express.Router();

router.post('/register', authLimiter, [
  body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Name must be between 2 and 120 characters.'),
  body('email').isEmail().withMessage('Enter a valid email address.'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('phone').optional({ nullable: true }).matches(/^[0-9+\-\s]{7,20}$/).withMessage('Enter a valid phone number.'),
  body('city').optional({ nullable: true }).trim().isLength({ max: 100 })
], validate, controller.register);

router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('Enter a valid email address.'),
  body('password').notEmpty().withMessage('Password is required.')
], validate, controller.login);

router.get('/me', protect, controller.me);
router.post('/logout', protect, controller.logout);

router.post('/forgot-password', authLimiter, [
  body('email').isEmail().withMessage('Enter a valid email address.')
], validate, controller.forgotPassword);

router.post('/reset-password', authLimiter, [
  body('token').notEmpty().withMessage('Reset token is required.'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
], validate, controller.resetPassword);

module.exports = router;
