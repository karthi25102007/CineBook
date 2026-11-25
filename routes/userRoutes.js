const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const controller = require('../controllers/userController');

const router = express.Router();

router.use(protect);
router.patch('/profile', [
  body('name').optional().trim().isLength({ min: 2, max: 120 }),
  body('phone').optional({ nullable: true }).matches(/^[0-9+\-\s]{7,20}$/),
  body('city').optional({ nullable: true }).trim().isLength({ max: 100 })
], validate, controller.updateProfile);
router.post('/change-password', [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters.')
], validate, controller.changePassword);
router.get('/watchlist', controller.watchlist);
router.post('/watchlist/:movieId', controller.toggleWatchlist);
router.delete('/watchlist/:movieId', controller.toggleWatchlist);
router.get('/stats', controller.stats);

module.exports = router;
