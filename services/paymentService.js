const crypto = require('crypto');
const Razorpay = require('razorpay');
const config = require('../config/env');
const { pool, withTransaction } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { assert } = require('../utils/security');
const bookingService = require('./bookingService');

const razorpay = config.razorpay.keyId && config.razorpay.keySecret
  ? new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret })
  : null;

const mode = () => (razorpay ? 'razorpay' : config.devPayments ? 'dev' : 'unavailable');

async function createOrder(booking, user) {
  assert(booking.userId === user.id, 'You cannot pay for this booking.', 403, 'FORBIDDEN');
  assert(booking.status === 'pending', 'This booking is no longer pending payment.', 409, 'BOOKING_NOT_PENDING');
  assert(booking.paymentStatus !== 'paid', 'This booking is already paid.', 409, 'ALREADY_PAID');

  const [existing] = await pool.execute(
    "SELECT * FROM payments WHERE booking_id = ? AND status IN ('created','authorized') ORDER BY id DESC LIMIT 1",
    [booking.id]
  );
  if (existing[0] && existing[0].razorpay_order_id) {
    return { mode: existing[0].provider, orderId: existing[0].razorpay_order_id, amount: booking.total, keyId: config.razorpay.keyId, currency: config.razorpay.currency };
  }

  let orderId = null;
  let provider = mode();
  assert(provider !== 'unavailable', 'Payments are not configured. Contact support.', 503, 'PAYMENTS_UNAVAILABLE');

  if (provider === 'razorpay') {
    const order = await razorpay.orders.create({
      amount: Math.round(booking.total * 100),
      currency: config.razorpay.currency,
      receipt: booking.reference.slice(0, 40),
      notes: { bookingId: String(booking.id), bookingRef: booking.reference, customer: user.name }
    });
    orderId = order.id;
  } else {
    orderId = `dev_order_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  }

  await pool.execute(
    'INSERT INTO payments (booking_id, provider, razorpay_order_id, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)',
    [booking.id, provider, orderId, booking.total, config.razorpay.currency, 'created']
  );

  return { mode: provider, orderId, amount: booking.total, keyId: config.razorpay.keyId, currency: config.razorpay.currency };
}

function verifySignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function confirmPaymentRecord(paymentId, data) {
  const [booking] = await pool.execute('SELECT id FROM bookings WHERE id = ?', [paymentId]);
  if (!booking[0]) return null;
  if (bookingService) {
    const existing = await pool.execute('SELECT status FROM bookings WHERE id = ?', [paymentId]);
    if (existing[0][0]?.status === 'confirmed') return bookingService.getBookingById(paymentId, { id: existing[0][0].user_id }, true);
  }
  return null;
}

async function verifyAndConfirm({ bookingId, orderId, paymentId, signature, user }) {
  const [rows] = await pool.execute('SELECT * FROM payments WHERE booking_id = ? AND razorpay_order_id = ? ORDER BY id DESC LIMIT 1', [bookingId, orderId]);
  const payment = rows[0];
  assert(payment, 'Payment record not found.', 404, 'PAYMENT_NOT_FOUND');
  const booking = await bookingService.getBookingById(bookingId, user);
  if (booking.status === 'confirmed') return booking;

  assert(payment.provider === 'razorpay' && razorpay, 'This payment must be confirmed through the development endpoint.', 400, 'WRONG_PAYMENT_MODE');
  assert(verifySignature(orderId, paymentId, signature), 'Payment signature verification failed.', 400, 'INVALID_SIGNATURE');

  const remote = await razorpay.payments.fetch(paymentId);
  assert(['captured', 'authorized'].includes(remote.status), 'Payment was not successful.', 400, 'PAYMENT_NOT_CAPTURED');
  if (remote.status === 'authorized') {
    await razorpay.payments.capture(paymentId, Math.round(booking.total * 100), config.razorpay.currency);
  }

  return withTransaction(async (connection) => {
    await connection.execute(
      "UPDATE payments SET razorpay_payment_id = ?, razorpay_signature = ?, status = 'paid', method = ?, paid_at = NOW() WHERE id = ?",
      [paymentId, signature, remote.method || null, payment.id]
    );
    return bookingService.confirmBooking(bookingId);
  }).catch(async (error) => {
    if (error.code === 'SEATS_UNAVAILABLE') {
      if (remote.status === 'captured') {
        await razorpay.payments.refund(paymentId).catch(() => null);
      }
    }
    throw error;
  });
}

async function devConfirm({ bookingId, user }) {
  assert(config.devPayments, 'Development payments are disabled.', 403, 'DEV_PAYMENTS_DISABLED');
  const booking = await bookingService.getBookingById(bookingId, user);
  if (booking.status === 'confirmed') return booking;

  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1', [bookingId]);
    const payment = rows[0];
    assert(payment && payment.provider === 'dev', 'Start the payment flow again.', 400, 'PAYMENT_NOT_FOUND');
    assert(payment.status !== 'failed', 'This payment attempt failed. Start again.', 409, 'PAYMENT_FAILED');
    const devPaymentId = `dev_pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    await connection.execute(
      "UPDATE payments SET razorpay_payment_id = ?, status = 'paid', method = 'dev', paid_at = NOW() WHERE id = ?",
      [devPaymentId, payment.id]
    );
    return bookingService.confirmBooking(bookingId);
  });
}

async function recordFailure({ bookingId, reason, user }) {
  const booking = await bookingService.getBookingById(bookingId, user);
  if (booking.status === 'confirmed') return { failed: false, reason: 'Booking already confirmed' };
  await pool.execute(
    "UPDATE payments SET status = 'failed', failure_reason = ? WHERE booking_id = ? AND status IN ('created','authorized')",
    [reason || 'Payment failed', bookingId]
  );
  await bookingService.failBooking(bookingId, reason);
  return { failed: true, bookingId };
}

async function refund(bookingId, reason = 'Refund requested') {
  const booking = await bookingService.getBookingById(bookingId, { id: 0 }, true);
  assert(booking.status === 'confirmed' && booking.paymentStatus === 'paid', 'Only paid bookings can be refunded.', 409, 'NOT_REFUNDABLE');
  const [rows] = await pool.execute("SELECT * FROM payments WHERE booking_id = ? AND status = 'paid' ORDER BY id DESC LIMIT 1", [bookingId]);
  const payment = rows[0];
  assert(payment, 'Payment record not found.', 404, 'PAYMENT_NOT_FOUND');

  let refundId = `dev_refund_${crypto.randomUUID().slice(0, 12)}`;
  if (payment.provider === 'razorpay' && razorpay && payment.razorpay_payment_id) {
    const result = await razorpay.payments.refund(payment.razorpay_payment_id, {
      amount: Math.round(Number(payment.amount) * 100), notes: { reason }
    });
    refundId = result.id;
  }
  await withTransaction(async (connection) => {
    await connection.execute("UPDATE payments SET status = 'refunded', refund_id = ?, refund_status = 'processed' WHERE id = ?", [refundId, payment.id]);
    await connection.execute("UPDATE bookings SET status = 'refunded', payment_status = 'refunded' WHERE id = ?", [bookingId]);
    await connection.execute('DELETE FROM booking_seats WHERE booking_id = ?', [bookingId]);
  });
  return { bookingId, refundId, status: 'refunded' };
}

async function paymentHistory(userId) {
  const [rows] = await pool.execute(`
    SELECT p.*, b.booking_ref, m.title AS movie_title
    FROM payments p JOIN bookings b ON b.id = p.booking_id
    JOIN shows sh ON sh.id = b.show_id JOIN movies m ON m.id = sh.movie_id
    WHERE b.user_id = ? ORDER BY p.created_at DESC`, [userId]);
  return rows.map((p) => ({
    id: p.id, bookingId: p.booking_id, reference: p.booking_ref, movieTitle: p.movie_title,
    orderId: p.razorpay_order_id, paymentId: p.razorpay_payment_id, amount: Number(p.amount),
    currency: p.currency, status: p.status, method: p.method, refundId: p.refund_id,
    refundStatus: p.refund_status, createdAt: p.created_at, paidAt: p.paid_at
  }));
}

module.exports = { mode, createOrder, verifyAndConfirm, devConfirm, recordFailure, refund, paymentHistory, razorpay };
