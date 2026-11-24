const bookingService = require('../services/bookingService');
const paymentService = require('../services/paymentService');
const { ok } = require('../utils/response');

exports.mode = async (req, res) => ok(res, {
  mode: paymentService.mode(),
  keyId: process.env.RAZORPAY_KEY_ID || '',
  devPayments: process.env.DEV_PAYMENTS === 'true'
}, 'Payment configuration loaded.');

exports.createOrder = async (req, res) => {
  const booking = await bookingService.getBookingById(req.body.bookingId, req.user);
  const order = await paymentService.createOrder(booking, req.user);
  ok(res, order, 'Payment order created.');
};

exports.verify = async (req, res) => {
  const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const booking = await paymentService.verifyAndConfirm({
    bookingId, orderId: razorpay_order_id, paymentId: razorpay_payment_id,
    signature: razorpay_signature, user: req.user
  });
  ok(res, { booking }, 'Payment verified and booking confirmed!');
};

exports.devConfirm = async (req, res) => {
  const booking = await paymentService.devConfirm({ bookingId: req.body.bookingId, user: req.user });
  ok(res, { booking, simulated: true }, 'Development payment confirmed.');
};

exports.failure = async (req, res) => {
  const result = await paymentService.recordFailure({ bookingId: req.body.bookingId, reason: req.body.reason, user: req.user });
  ok(res, result, 'Payment failure recorded.');
};

exports.history = async (req, res) => {
  ok(res, { payments: await paymentService.paymentHistory(req.user.id) }, 'Payment history loaded.');
};

exports.refund = async (req, res) => {
  const result = await paymentService.refund(req.params.bookingId, req.body.reason);
  ok(res, result, 'Refund processed.');
};

module.exports = require('../middleware/errorHandler').wrapControllers(module.exports);
