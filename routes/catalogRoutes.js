const express = require('express');
const { body, query } = require('express-validator');
const { optionalAuth, protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const controller = require('../controllers/catalogController');

const router = express.Router();

router.get('/home', controller.home);
router.get('/cities', controller.cities);

router.get('/movies', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sort').optional().isIn(['latest', 'rating', 'title', 'trending'])
], validate, controller.movies);
router.get('/movies/:idOrSlug', controller.movie);

router.get('/theatres', controller.theatres);
router.get('/theatres/:id', controller.theatre);

router.get('/shows', controller.shows);
router.get('/shows/:id', controller.show);

router.post('/reviews', protect, [
  body('movieId').isInt({ min: 1 }).withMessage('A valid movie is required.'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5.'),
  body('comment').optional({ nullable: true }).trim().isLength({ max: 1000 })
], validate, controller.review);

module.exports = router;
