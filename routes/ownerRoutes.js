const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const controller = require('../controllers/ownerController');

const router = express.Router();
router.use(protect, authorize('owner'));

router.get('/dashboard', controller.dashboard);
router.get('/theatres', controller.myTheatres);
router.put('/theatres/:id', controller.updateTheatre);

router.get('/screens', controller.screens);
router.post('/theatres/:theatreId/screens', controller.createScreen);
router.put('/screens/:id', controller.updateScreen);
router.post('/screens/:id/regenerate-seats', controller.regenerateSeats);
router.delete('/screens/:id', controller.deleteScreen);

router.get('/shows', controller.shows);
router.post('/shows', controller.createShow);
router.put('/shows/:id', controller.updateShow);
router.delete('/shows/:id', controller.deleteShow);

router.get('/bookings', controller.bookings);
router.get('/revenue', controller.revenue);

module.exports = router;
