const bookingService = require('../services/bookingService');
const seatService = require('../services/seatService');
const { ok, created } = require('../utils/response');

const viewer = (req) => ({
  user: req.user,
  sessionId: req.body?.sessionId || req.headers['x-session-id'] || req.query.sessionId || 'anonymous'
});

exports.quote = async (req, res) => {
  const { showId, seatIds, couponCode } = req.body;
  const price = await bookingService.priceSelection(showId, seatIds, couponCode);
  ok(res, {
    showId: Number(showId), seats: price.seats, subtotal: price.subtotal,
    convenienceFee: price.convenienceFee, tax: price.tax, discount: price.discount,
    couponCode: price.couponCode, total: price.total
  }, 'Price calculated.');
};

exports.seatMap = async (req, res) => {
  ok(res, await seatService.getSeatMap(req.params.showId, viewer(req)), 'Seat map loaded.');
};

exports.reserve = async (req, res) => {
  const result = await seatService.reserveSeats(req.body.showId, req.body.seatIds, viewer(req));
  ok(res, result, 'Seats reserved for 10 minutes.');
};

exports.release = async (req, res) => {
  const result = await seatService.releaseSeats(req.body.showId, req.body.seatIds, viewer(req));
  ok(res, result, 'Reservation released.');
};

exports.create = async (req, res) => {
  const booking = await bookingService.createBooking(req.body, viewer(req));
  created(res, { booking }, 'Booking created. Complete payment to confirm your seats.');
};

exports.mine = async (req, res) => {
  const bookings = await bookingService.listBookings({ userId: req.user.id, period: req.query.period });
  ok(res, { bookings }, 'Bookings loaded.');
};

exports.getOne = async (req, res) => {
  const booking = await bookingService.getBookingById(req.params.id, req.user, ['admin', 'owner'].includes(req.user.role));
  ok(res, { booking }, 'Booking loaded.');
};

exports.cancel = async (req, res) => {
  const booking = await bookingService.getBookingById(req.params.id, req.user, ['admin', 'owner'].includes(req.user.role));
  const result = await bookingService.cancelBooking(booking.id, req.body.reason);
  ok(res, { booking: result }, 'Booking cancelled.');
};

module.exports = require('../middleware/errorHandler').wrapControllers(module.exports);
