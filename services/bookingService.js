const { pool, withTransaction } = require('../config/database');
const config = require('../config/env');
const { AppError } = require('../middleware/errorHandler');
const { assert } = require('../utils/security');
const { money, generateBookingRef } = require('../utils/helpers');
const serializers = require('../utils/serialize');
const { marks, emitSeatUpdate } = require('./seatService');

const BOOKING_SELECT = `
  SELECT b.*, m.title AS movie_title, m.poster_url, t.name AS theatre_name, t.address AS theatre_address,
    t.city AS theatre_city, sc.name AS screen_name, sh.show_date, sh.show_time
  FROM bookings b
  JOIN shows sh ON sh.id = b.show_id
  JOIN movies m ON m.id = sh.movie_id
  JOIN screens sc ON sc.id = sh.screen_id
  JOIN theatres t ON t.id = sc.theatre_id`;

async function validateCoupon(code, subtotal) {
  if (!code) return { code: null, discount: 0, coupon: null };
  const [rows] = await pool.execute(
    'SELECT * FROM coupons WHERE UPPER(code) = UPPER(?) AND is_active = 1 AND (valid_from IS NULL OR valid_from <= NOW()) AND (valid_until IS NULL OR valid_until >= NOW())',
    [code.trim()]
  );
  const coupon = rows[0];
  assert(coupon, 'This coupon code is invalid or has expired.', 400, 'INVALID_COUPON');
  assert(coupon.usage_limit === null || coupon.used_count < coupon.usage_limit, 'This coupon has reached its usage limit.', 400, 'COUPON_EXHAUSTED');
  assert(subtotal >= Number(coupon.min_amount), `Add items worth ₹${coupon.min_amount} to use ${coupon.code}.`, 400, 'COUPON_MIN_AMOUNT');

  let discount = coupon.discount_type === 'percent' ? (subtotal * Number(coupon.discount_value)) / 100 : Number(coupon.discount_value);
  if (coupon.max_discount !== null) discount = Math.min(discount, Number(coupon.max_discount));
  return { code: coupon.code, discount: money(Math.min(discount, subtotal)), coupon };
}

async function priceSelection(showId, seatIds, couponCode) {
  assert(Array.isArray(seatIds) && seatIds.length > 0, 'Select at least one seat.', 400, 'NO_SEATS');
  const ids = seatIds.map(Number);
  const [shows] = await pool.execute('SELECT * FROM shows WHERE id = ?', [showId]);
  assert(shows[0], 'Show not found.', 404, 'SHOW_NOT_FOUND');
  const show = shows[0];

  const [seatRows] = await pool.execute(
    `SELECT id, seat_number, seat_type FROM seats WHERE id IN (${marks(ids)}) AND screen_id = ? AND is_active = 1 ORDER BY id`,
    [...ids, show.screen_id]
  );
  assert(seatRows.length === ids.length, 'One or more selected seats are invalid.', 400, 'INVALID_SEATS');

  const seats = seatRows.map((s) => ({
    id: s.id,
    number: s.seat_number,
    type: s.seat_type,
    price: money(s.seat_type === 'premium' ? show.premium_price : s.seat_type === 'gold' ? show.gold_price : show.silver_price)
  }));
  const subtotal = money(seats.reduce((sum, s) => sum + s.price, 0));
  const convenienceFee = money(seats.length * config.convenienceFeePerSeat);
  const { code, discount } = await validateCoupon(couponCode, subtotal);
  const tax = money(((subtotal - discount + convenienceFee) * config.taxPercent) / 100);
  const total = money(subtotal + convenienceFee + tax - discount);
  return { show, seats, subtotal, convenienceFee, tax, discount, couponCode: code, total };
}

async function assertSeatsAvailable(connection, showId, seatIds, viewer) {
  const [sold] = await connection.execute(`SELECT seat_id FROM booking_seats WHERE show_id = ? AND seat_id IN (${marks(seatIds)})`, [showId, ...seatIds]);
  assert(sold.length === 0, 'One or more selected seats have just been booked. Please choose different seats.', 409, 'SEATS_UNAVAILABLE');

  const [reservations] = await connection.execute(
    `SELECT seat_id, session_id, user_id FROM seat_reservations WHERE show_id = ? AND seat_id IN (${marks(seatIds)}) AND expires_at > NOW()`,
    [showId, ...seatIds]
  );
  const blocked = reservations.filter((r) => r.session_id !== viewer.sessionId && r.user_id !== viewer.user?.id);
  assert(blocked.length === 0, 'One or more selected seats were reserved by another user. Please refresh.', 409, 'SEATS_RESERVED');
}

async function createBooking(payload, viewer) {
  const { showId, seatIds, couponCode, sessionId } = payload;
  const price = await priceSelection(showId, seatIds, couponCode);
  const ids = price.seats.map((s) => s.id);
  const session = sessionId || viewer.sessionId;

  return withTransaction(async (connection) => {
    const [shows] = await connection.execute('SELECT id, screen_id, status, show_date, show_time FROM shows WHERE id = ? FOR UPDATE', [showId]);
    assert(shows[0], 'Show not found.', 404, 'SHOW_NOT_FOUND');
    assert(shows[0].status === 'scheduled', 'This show is unavailable.', 409, 'SHOW_UNAVAILABLE');
    const showTime = new Date(`${shows[0].show_date}T${shows[0].show_time}`);
    assert(showTime.getTime() > Date.now(), 'This show has already started.', 409, 'SHOW_STARTED');

    await connection.execute(
      `SELECT id FROM seats WHERE id IN (${marks(ids)}) AND screen_id = ? AND is_active = 1 ORDER BY id FOR UPDATE`,
      [...ids, shows[0].screen_id]
    );
    await assertSeatsAvailable(connection, showId, ids, { sessionId: session, user: viewer.user });

    const reference = generateBookingRef();
    const [result] = await connection.execute(`
      INSERT INTO bookings (booking_ref, user_id, show_id, seats_json, seat_count, subtotal, convenience_fee,
        tax_amount, discount_amount, total_amount, coupon_code, payment_status, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [reference, viewer.user.id, showId, JSON.stringify(price.seats), price.seats.length, price.subtotal,
      price.convenienceFee, price.tax, price.discount, price.total, price.couponCode, config.reservationMinutes]);

    await connection.execute(
      `UPDATE seat_reservations SET expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE show_id = ? AND session_id = ? AND seat_id IN (${marks(ids)})`,
      [config.reservationMinutes, showId, session, ...ids]
    );

    const [rows] = await connection.execute(`${BOOKING_SELECT} WHERE b.id = ?`, [result.insertId]);
    return { ...serializers.booking(rows[0]), expiresInMinutes: config.reservationMinutes };
  });
}

async function confirmBooking(bookingId) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
    const booking = rows[0];
    assert(booking, 'Booking not found.', 404, 'BOOKING_NOT_FOUND');
    assert(booking.status === 'pending', `Booking is already ${booking.status}.`, 409, 'BOOKING_NOT_PENDING');
    assert(!booking.expires_at || new Date(booking.expires_at).getTime() > Date.now(), 'Booking expired. Please start again.', 409, 'BOOKING_EXPIRED');

    const seats = typeof booking.seats_json === 'string' ? JSON.parse(booking.seats_json) : booking.seats_json;
    const ids = seats.map((s) => Number(s.id));
    const [shows] = await connection.execute('SELECT id, screen_id FROM shows WHERE id = ? FOR UPDATE', [booking.show_id]);
    assert(shows[0], 'Show not found.', 404, 'SHOW_NOT_FOUND');

    await connection.execute(
      `SELECT id FROM seats WHERE id IN (${marks(ids)}) AND screen_id = ? AND is_active = 1 ORDER BY id FOR UPDATE`,
      [...ids, shows[0].screen_id]
    );
    const [sold] = await connection.execute(`SELECT seat_id FROM booking_seats WHERE show_id = ? AND seat_id IN (${marks(ids)})`, [booking.show_id, ...ids]);
    assert(sold.length === 0, 'A seat in this booking was sold to another customer.', 409, 'SEATS_UNAVAILABLE');

    for (const seat of seats) {
      await connection.execute(
        'INSERT INTO booking_seats (booking_id, show_id, seat_id, seat_number, seat_type, price) VALUES (?, ?, ?, ?, ?, ?)',
        [booking.id, booking.show_id, seat.id, seat.number, seat.type, seat.price]
      );
    }
    await connection.execute(
      "UPDATE bookings SET status = 'confirmed', payment_status = 'paid', booked_at = NOW() WHERE id = ?",
      [booking.id]
    );
    if (booking.coupon_code) {
      await connection.execute('UPDATE coupons SET used_count = used_count + 1 WHERE UPPER(code) = UPPER(?)', [booking.coupon_code]);
    }
    await connection.execute(
      `DELETE FROM seat_reservations WHERE show_id = ? AND seat_id IN (${marks(ids)})`,
      [booking.show_id, ...ids]
    );
    const [updated] = await connection.execute(`${BOOKING_SELECT} WHERE b.id = ?`, [booking.id]);
    return serializers.booking(updated[0]);
  }).then((result) => { emitSeatUpdate(result.showId); return result; });
}

async function failBooking(bookingId, reason = 'Payment failed') {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
    const booking = rows[0];
    if (!booking) return null;
    if (booking.status === 'confirmed') return serializers.booking(booking);

    const seats = typeof booking.seats_json === 'string' ? JSON.parse(booking.seats_json) : booking.seats_json;
    await connection.execute("UPDATE bookings SET status = 'cancelled', payment_status = 'failed' WHERE id = ?", [bookingId]);
    if (seats.length) {
      await connection.execute(`DELETE FROM seat_reservations WHERE show_id = ? AND seat_id IN (${marks(seats.map((s) => s.id))})`, [booking.show_id, ...seats.map((s) => s.id)]);
    }
    return { bookingId, status: 'cancelled', reason };
  }).then((result) => { emitSeatUpdate((result && result.showId) || 0); return result; });
}

async function cancelBooking(bookingId, reason = 'Cancelled by user') {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(`${BOOKING_SELECT} WHERE b.id = ? FOR UPDATE`, [bookingId]);
    const booking = rows[0];
    assert(booking, 'Booking not found.', 404, 'BOOKING_NOT_FOUND');
    assert(['confirmed', 'pending'].includes(booking.status), 'This booking cannot be cancelled.', 409, 'BOOKING_NOT_CANCELLABLE');
    const seats = typeof booking.seats_json === 'string' ? JSON.parse(booking.seats_json) : booking.seats_json;
    await connection.execute('DELETE FROM booking_seats WHERE booking_id = ?', [bookingId]);
    if (seats.length) {
      await connection.execute(`DELETE FROM seat_reservations WHERE show_id = ? AND seat_id IN (${marks(seats.map((s) => s.id))})`, [booking.show_id, ...seats.map((s) => s.id)]);
    }
    await connection.execute(
      "UPDATE bookings SET status = 'cancelled', payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END WHERE id = ?",
      [bookingId]
    );
    const [updated] = await connection.execute(`${BOOKING_SELECT} WHERE b.id = ?`, [bookingId]);
    return serializers.booking(updated[0]);
  }).then((result) => { emitSeatUpdate(result.showId); return result; });
}

async function getBookingById(id, user, allowStaff = false) {
  const [rows] = await pool.execute(`${BOOKING_SELECT} WHERE b.id = ?`, [id]);
  const booking = rows[0];
  assert(booking, 'Booking not found.', 404, 'BOOKING_NOT_FOUND');
  assert(allowStaff || booking.user_id === user.id, 'You cannot access this booking.', 403, 'FORBIDDEN');
  return serializers.booking(booking);
}

async function getBookingByReference(reference) {
  const [rows] = await pool.execute(`${BOOKING_SELECT} WHERE b.booking_ref = ?`, [reference]);
  return rows[0] ? serializers.booking(rows[0]) : null;
}

async function listBookings(filters = {}) {
  const conditions = [];
  const params = [];
  if (filters.userId) { conditions.push('b.user_id = ?'); params.push(filters.userId); }
  if (filters.status) { conditions.push('b.status = ?'); params.push(filters.status); }
  if (filters.from) { conditions.push('sh.show_date >= ?'); params.push(filters.from); }
  if (filters.to) { conditions.push('sh.show_date <= ?'); params.push(filters.to); }
  if (filters.city) { conditions.push('t.city = ?'); params.push(filters.city); }
  if (filters.theatreId) { conditions.push('t.id = ?'); params.push(filters.theatreId); }
  if (filters.ownerId) { conditions.push('t.owner_id = ?'); params.push(filters.ownerId); }
  if (filters.period === 'upcoming') { conditions.push("sh.show_date >= CURDATE() AND b.status = 'confirmed'"); }
  if (filters.period === 'past') { conditions.push("(sh.show_date < CURDATE() OR b.status IN ('cancelled','refunded'))"); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute(`${BOOKING_SELECT} ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT 300`, params);
  return rows.map(serializers.booking);
}

module.exports = {
  priceSelection, createBooking, confirmBooking, failBooking, cancelBooking,
  getBookingById, getBookingByReference, listBookings, BOOKING_SELECT
};
