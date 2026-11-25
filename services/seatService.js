const { pool, withTransaction } = require('../config/database');
const config = require('../config/env');
const { AppError } = require('../middleware/errorHandler');
const { assert } = require('../utils/security');
const { money } = require('../utils/helpers');

let io = null;
const setSocketIO = (instance) => { io = instance; };

const marks = (ids) => ids.map(() => '?').join(',');

function emitSeatUpdate(showId) {
  if (!io) return;
  (async () => {
    try {
      const [showRows] = await pool.execute('SELECT screen_id FROM shows WHERE id = ?', [showId]);
      if (!showRows[0]) return;
      const [booked] = await pool.execute('SELECT seat_id FROM booking_seats WHERE show_id = ?', [showId]);
      const [reserved] = await pool.execute('SELECT seat_id, session_id, user_id FROM seat_reservations WHERE show_id = ? AND expires_at > NOW()', [showId]);
      io.to(`show:${showId}`).emit('seat:update', {
        showId: Number(showId),
        bookedSeatIds: booked.map((b) => b.seat_id),
        reservedSeatIds: reserved.map((r) => r.seat_id)
      });
    } catch (error) {
      console.error('[SOCKET] seat update failed', error.message);
    }
  })();
}

async function getSeatMap(showId, viewer = {}) {
  const [shows] = await pool.execute('SELECT id, screen_id, show_date, show_time, status FROM shows WHERE id = ?', [showId]);
  assert(shows[0], 'Show not found.', 404, 'SHOW_NOT_FOUND');
  const show = shows[0];

  const [seatRows] = await pool.execute(`
    SELECT s.id, s.seat_number, s.row_label, s.seat_type, sh.silver_price, sh.gold_price, sh.premium_price
    FROM seats s JOIN shows sh ON sh.id = ?
    WHERE s.screen_id = ? AND s.is_active = 1 ORDER BY s.row_label, CAST(REGEXP_REPLACE(s.seat_number, '[A-Za-z]', '') AS UNSIGNED)`, [showId, show.screen_id]);

  const [bookedRows] = await pool.execute('SELECT seat_id FROM booking_seats WHERE show_id = ?', [showId]);
  const [reservationRows] = await pool.execute('SELECT seat_id, session_id, user_id, expires_at FROM seat_reservations WHERE show_id = ? AND expires_at > NOW()', [showId]);
  const booked = new Set(bookedRows.map((r) => r.seat_id));
  const reserved = new Map(reservationRows.map((r) => [r.seat_id, r]));

  const seats = seatRows.map((s) => {
    const res = reserved.get(s.id);
    let status = 'available';
    if (booked.has(s.id)) status = 'booked';
    else if (res) status = res.session_id === viewer.sessionId || (viewer.user?.id && res.user_id === viewer.user.id) ? 'yours' : 'reserved';
    const price = s.seat_type === 'premium' ? s.premium_price : s.seat_type === 'gold' ? s.gold_price : s.silver_price;
    return { id: s.id, number: s.seat_number, row: s.row_label, type: s.seat_type, price: money(price), status };
  });

  const layout = {};
  seats.forEach((seat) => { (layout[seat.row] ||= []).push(seat); });

  return {
    showId: Number(showId), screenId: show.screen_id, date: show.show_date, time: String(show.show_time).slice(0, 5),
    categories: [
      { id: 'silver', label: 'Silver', price: money(seatRows[0]?.silver_price || 0) },
      { id: 'gold', label: 'Gold', price: money(seatRows[0]?.gold_price || 0) },
      { id: 'premium', label: 'Premium', price: money(seatRows[0]?.premium_price || 0) }
    ],
    layout,
    summary: {
      available: seats.filter((s) => s.status === 'available').length,
      booked: seats.filter((s) => s.status === 'booked').length,
      reserved: seats.filter((s) => s.status === 'reserved').length,
      yours: seats.filter((s) => s.status === 'yours').length
    }
  };
}

async function reserveSeats(showId, seatIds, viewer) {
  assert(Array.isArray(seatIds) && seatIds.length > 0, 'Select at least one seat.', 400, 'NO_SEATS');
  assert(seatIds.length <= 10, 'You can book up to 10 seats at a time.', 400, 'TOO_MANY_SEATS');
  const ids = seatIds.map(Number);
  assert(ids.every(Number.isInteger), 'Invalid seat selection.', 400, 'INVALID_SEATS');

  return withTransaction(async (connection) => {
    await connection.execute('DELETE FROM seat_reservations WHERE expires_at < NOW()');
    const [shows] = await connection.execute('SELECT id, screen_id, show_date, show_time, status FROM shows WHERE id = ? FOR UPDATE', [showId]);
    assert(shows[0], 'Show not found.', 404, 'SHOW_NOT_FOUND');
    assert(shows[0].status === 'scheduled', 'This show is not available.', 409, 'SHOW_UNAVAILABLE');
    const showDateTime = new Date(`${shows[0].show_date}T${shows[0].show_time}`);
    assert(showDateTime.getTime() > Date.now(), 'This show has already started.', 409, 'SHOW_STARTED');

    const [seats] = await connection.execute(
      `SELECT id FROM seats WHERE id IN (${marks(ids)}) AND screen_id = ? AND is_active = 1 ORDER BY id FOR UPDATE`,
      [...ids, shows[0].screen_id]
    );
    assert(seats.length === ids.length, 'One or more seats are invalid for this show.', 400, 'INVALID_SEATS');

    const [sold] = await connection.execute(`SELECT seat_id FROM booking_seats WHERE show_id = ? AND seat_id IN (${marks(ids)})`, [showId, ...ids]);
    assert(sold.length === 0, 'One or more selected seats are already booked.', 409, 'SEATS_UNAVAILABLE');

    const [active] = await connection.execute(
      `SELECT seat_id, session_id, user_id FROM seat_reservations WHERE show_id = ? AND seat_id IN (${marks(ids)}) AND expires_at > NOW()`,
      [showId, ...ids]
    );
    const blocked = active.filter((r) => r.session_id !== viewer.sessionId && r.user_id !== viewer.user?.id);
    assert(blocked.length === 0, 'One or more selected seats were just reserved by someone else.', 409, 'SEATS_RESERVED');

    const owns = new Set(active.filter((r) => r.session_id === viewer.sessionId || r.user_id === viewer.user?.id).map((r) => r.seat_id));
    const toInsert = ids.filter((id) => !owns.has(id));
    for (const seatId of toInsert) {
      await connection.execute(
        'INSERT INTO seat_reservations (show_id, seat_id, user_id, session_id, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
        [showId, seatId, viewer.user?.id || null, viewer.sessionId, config.reservationMinutes]
      );
    }
    if (owns.size) {
      await connection.execute(
        `UPDATE seat_reservations SET expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE show_id = ? AND session_id = ? AND seat_id IN (${marks([...owns])})`,
        [config.reservationMinutes, showId, viewer.sessionId, ...owns]
      );
    }
    const [expiry] = await connection.execute('SELECT DATE_ADD(NOW(), INTERVAL ? MINUTE) AS expires_at', [config.reservationMinutes]);
    return { expiresAt: expiry[0].expires_at, seatIds: ids };
  }).then((result) => { emitSeatUpdate(showId); return result; });
}

async function releaseSeats(showId, seatIds, viewer) {
  if (!seatIds?.length) return { released: 0 };
  const ids = seatIds.map(Number);
  const [result] = await pool.execute(
    `DELETE FROM seat_reservations WHERE show_id = ? AND seat_id IN (${marks(ids)})
     AND (session_id = ? OR (? IS NOT NULL AND user_id = ?))`,
    [showId, ...ids, viewer.sessionId, viewer.user?.id || null, viewer.user?.id || null]
  );
  emitSeatUpdate(showId);
  return { released: result.affectedRows };
}

async function cleanupExpired() {
  const [res] = await pool.execute('DELETE FROM seat_reservations WHERE expires_at < NOW()');
  const [bookings] = await pool.execute("DELETE FROM bookings WHERE status = 'pending' AND expires_at < NOW()");
  return { reservations: res.affectedRows, bookings: bookings.affectedRows };
}

module.exports = {
  setSocketIO, emitSeatUpdate, getSeatMap, reserveSeats, releaseSeats, cleanupExpired, marks
};
