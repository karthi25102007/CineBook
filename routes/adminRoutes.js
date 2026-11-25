const express = require('express');
const { body } = require('express-validator');
const { protect, adminOnly } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const controller = require('../controllers/adminController');

const router = express.Router();
router.use(protect, adminOnly);

router.get('/dashboard', controller.dashboard);
router.get('/reports/revenue', controller.revenue);
router.get('/reports/popular', controller.popular);
router.get('/reports/bookings', controller.bookingStats);
router.get('/reports/performance', controller.performance);
router.get('/users', controller.users);
router.patch('/users/:id', controller.updateUser);

router.get('/movies', controller.movies);
router.post('/movies', controller.upload, controller.createMovie);
router.put('/movies/:id', controller.upload, controller.updateMovie);
router.delete('/movies/:id', controller.deleteMovie);
router.post('/upload', controller.upload, controller.uploadPoster);

router.get('/theatres', controller.theatres);
router.post('/theatres', writeLimiter, [
  body('name').notEmpty(), body('address').notEmpty(), body('city').notEmpty()
], validate, controller.createTheatre);
router.put('/theatres/:id', controller.updateTheatre);
router.delete('/theatres/:id', controller.deleteTheatre);

router.get('/screens', controller.screens);
router.get('/shows', controller.shows);
router.post('/screens', controller.createScreen);
router.put('/screens/:id', controller.updateScreen);
router.post('/screens/:id/regenerate-seats', controller.regenerateSeats);
router.delete('/screens/:id', controller.deleteScreen);

router.post('/shows', controller.createShow);
router.put('/shows/:id', controller.updateShow);
router.delete('/shows/:id', controller.deleteShow);

router.get('/coupons', controller.coupons);
router.post('/coupons', controller.createCoupon);
router.put('/coupons/:id', controller.updateCoupon);
router.delete('/coupons/:id', controller.deleteCoupon);
router.get('/reviews', controller.reviews);

module.exports = router;
