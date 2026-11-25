const { pool, withTransaction } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { assert } = require('../utils/security');
const { money } = require('../utils/helpers');
const serializers = require('../utils/serialize');

const movieFields = ['title', 'description', 'genre', 'language', 'duration_minutes', 'release_date', 'poster_url', 'backdrop_url', 'trailer_url', 'rating', 'certification', 'status', 'is_trending', 'is_featured', 'is_recommended', 'cast_json', 'crew_json'];
const theatreFields = ['name', 'address', 'city', 'state', 'pincode', 'phone', 'facilities', 'logo_url', 'owner_id', 'status'];
const showFields = ['movie_id', 'screen_id', 'show_date', 'show_time', 'silver_price', 'gold_price', 'premium_price', 'status'];

function pick(body, fields) {
  const out = {};
  fields.forEach((f) => { if (body[f] !== undefined) out[f] = body[f]; });
  return out;
}

function slugify(title) {
  return String(title || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200) || `movie-${Date.now()}`;
}

async function uniqueSlug(title, excludeId) {
  let slug = slugify(title);
  let suffix = 1;
  while (true) {
    const [rows] = await pool.execute('SELECT id FROM movies WHERE slug = ? AND id <> ?', [slug, excludeId || 0]);
    if (!rows.length) return slug;
    slug = `${slugify(title)}-${suffix++}`;
  }
}

async function dashboard() {
  const [rows] = await pool.execute(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM movies) AS movies,
      (SELECT COUNT(*) FROM theatres) AS theatres,
      (SELECT COUNT(*) FROM bookings) AS bookings,
      (SELECT COUNT(*) FROM bookings WHERE DATE(created_at) = CURDATE()) AS todayBookings,
      (SELECT COUNT(*) FROM shows WHERE show_date >= CURDATE() AND status = 'scheduled') AS upcomingShows,
      (SELECT COALESCE(SUM(total_amount),0) FROM bookings WHERE status IN ('confirmed','refunded')) AS revenue,
      (SELECT COALESCE(SUM(total_amount),0) FROM bookings WHERE status IN ('confirmed','refunded') AND DATE(created_at) = CURDATE()) AS todayRevenue,
      (SELECT COUNT(*) FROM users WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) AS newUsersWeek`);
  const popular = await popularMovies(5);
  const recent = await pool.execute(`
    SELECT b.id, b.booking_ref, b.total_amount, b.status, b.payment_status, b.created_at,
      u.name AS customer, m.title AS movie, t.name AS theatre
    FROM bookings b JOIN users u ON u.id = b.user_id JOIN shows sh ON sh.id = b.show_id
    JOIN movies m ON m.id = sh.movie_id JOIN screens sc ON sc.id = sh.screen_id
    JOIN theatres t ON t.id = sc.theatre_id ORDER BY b.created_at DESC LIMIT 8`);
  const s = rows[0];
  return {
    stats: {
      users: Number(s.users), movies: Number(s.movies), theatres: Number(s.theatres),
      bookings: Number(s.bookings), todayBookings: Number(s.todayBookings), upcomingShows: Number(s.upcomingShows),
      revenue: money(s.revenue), todayRevenue: money(s.todayRevenue), newUsersWeek: Number(s.newUsersWeek)
    },
    popularMovies: popular,
    recentBookings: recent[0].map((r) => ({
      id: r.id, reference: r.booking_ref, amount: Number(r.total_amount), status: r.status,
      paymentStatus: r.payment_status, createdAt: r.created_at, customer: r.customer,
      movie: r.movie, theatre: r.theatre
    }))
  };
}

async function popularMovies(limit = 8) {
  const [rows] = await pool.execute(`
    SELECT m.id, m.title, m.poster_url, COUNT(b.id) AS bookings,
      COALESCE(SUM(CASE WHEN b.status IN ('confirmed','refunded') THEN b.total_amount ELSE 0 END),0) AS revenue
    FROM movies m JOIN shows sh ON sh.movie_id = m.id
    LEFT JOIN bookings b ON b.show_id = sh.id
    GROUP BY m.id ORDER BY bookings DESC, revenue DESC, m.rating DESC LIMIT ?`, [Number(limit) || 8]);
  return rows.map((r) => ({ id: r.id, title: r.title, posterUrl: r.poster_url, bookings: Number(r.bookings), revenue: money(r.revenue) }));
}

async function revenueReport(period = 'daily') {
  const formats = { daily: '%Y-%m-%d', weekly: '%x-W%v', monthly: '%Y-%m' };
  const format = formats[period] || formats.daily;
  const [rows] = await pool.execute(`
    SELECT DATE_FORMAT(b.created_at, '${format}') AS label,
      COUNT(*) AS bookings, COALESCE(SUM(b.total_amount),0) AS revenue
    FROM bookings b WHERE b.status IN ('confirmed','refunded')
    GROUP BY label ORDER BY label ASC LIMIT 60`);
  return rows.map((r) => ({ label: r.label, bookings: Number(r.bookings), revenue: money(r.revenue) }));
}

async function bookingStats() {
  const [rows] = await pool.execute('SELECT status, COUNT(*) AS count FROM bookings GROUP BY status');
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

async function theatrePerformance(ownerId) {
  const params = [];
  const ownerWhere = ownerId ? 'WHERE t.owner_id = ?' : '';
  if (ownerId) params.push(ownerId);
  const [rows] = await pool.execute(`
    SELECT t.id, t.name, t.city, COUNT(DISTINCT sc.id) AS screens, COUNT(b.id) AS bookings,
      COALESCE(SUM(CASE WHEN b.status IN ('confirmed','refunded') THEN b.total_amount ELSE 0 END),0) AS revenue
    FROM theatres t
    LEFT JOIN screens sc ON sc.theatre_id = t.id
    LEFT JOIN shows sh ON sh.screen_id = sc.id
    LEFT JOIN bookings b ON b.show_id = sh.id
    ${ownerWhere}
    GROUP BY t.id ORDER BY revenue DESC, bookings DESC`, params);
  return rows.map((r) => ({ id: r.id, name: r.name, city: r.city, screens: Number(r.screens), bookings: Number(r.bookings), revenue: money(r.revenue) }));
}

async function listUsers() {
  const [rows] = await pool.execute(`
    SELECT u.id, u.name, u.email, u.phone, u.role, u.city, u.is_active, u.last_login_at, u.created_at,
      (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id) AS bookings
    FROM users u ORDER BY u.created_at DESC LIMIT 300`);
  return rows.map((u) => ({ ...u, is_active: Boolean(u.is_active), bookings: Number(u.bookings) }));
}

async function updateUser(id, data) {
  const allowed = ['name', 'email', 'phone', 'city', 'role', 'is_active'];
  const values = allowed.filter((f) => data[f] !== undefined);
  assert(values.length, 'No fields to update.', 400, 'NO_FIELDS');
  const sets = values.map((f) => `${f} = ?`).join(', ');
  const params = values.map((f) => (f === 'is_active' ? (data[f] ? 1 : 0) : data[f]));
  await pool.execute(`UPDATE users SET ${sets} WHERE id = ?`, [...params, id]);
  const [rows] = await pool.execute('SELECT id, name, email, role, city, phone, is_active FROM users WHERE id = ?', [id]);
  assert(rows[0], 'User not found.', 404, 'USER_NOT_FOUND');
  return { ...rows[0], is_active: Boolean(rows[0].is_active) };
}

async function listMoviesAdmin() {
  const [rows] = await pool.execute('SELECT * FROM movies ORDER BY created_at DESC LIMIT 200');
  return rows.map(serializers.movie);
}

async function createMovie(data, posterUrl) {
  const fields = pick(data, movieFields);
  fields.title = String(fields.title || '').trim();
  assert(fields.title, 'Movie title is required.', 400, 'TITLE_REQUIRED');
  fields.slug = await uniqueSlug(fields.title);
  if (posterUrl) fields.poster_url = posterUrl;
  if (fields.cast_json !== undefined) fields.cast_json = JSON.stringify(fields.cast_json || []);
  if (fields.crew_json !== undefined) fields.crew_json = JSON.stringify(fields.crew_json || {});
  const keys = Object.keys(fields);
  const [result] = await pool.execute(
    `INSERT INTO movies (${keys.join(', ')}, created_by) VALUES (${keys.map(() => '?').join(', ')}, ?)`,
    [...keys.map((k) => fields[k]), data.adminId || null]
  );
  return serializers.movie((await pool.execute('SELECT * FROM movies WHERE id = ?', [result.insertId]))[0][0]);
}

async function updateMovie(id, data, posterUrl) {
  const fields = pick(data, movieFields);
  if (fields.title) fields.slug = await uniqueSlug(fields.title, id);
  if (posterUrl) fields.poster_url = posterUrl;
  if (fields.cast_json !== undefined) fields.cast_json = JSON.stringify(fields.cast_json || []);
  if (fields.crew_json !== undefined) fields.crew_json = JSON.stringify(fields.crew_json || {});
  const keys = Object.keys(fields);
  if (keys.length) {
    await pool.execute(`UPDATE movies SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
  }
  const [rows] = await pool.execute('SELECT * FROM movies WHERE id = ?', [id]);
  assert(rows[0], 'Movie not found.', 404, 'MOVIE_NOT_FOUND');
  return serializers.movie(rows[0]);
}

async function deleteMovie(id) {
  const [result] = await pool.execute('DELETE FROM movies WHERE id = ?', [id]);
  assert(result.affectedRows, 'Movie not found.', 404, 'MOVIE_NOT_FOUND');
  return { deleted: true };
}

async function listTheatresAdmin() {
  const [rows] = await pool.execute('SELECT * FROM theatres ORDER BY city, name');
  return rows.map((t) => serializers.theatre({ ...t, facilities: t.facilities }));
}

async function createTheatre(data) {
  const fields = pick(data, theatreFields);
  if (fields.facilities !== undefined) fields.facilities = JSON.stringify(fields.facilities || []);
  const keys = Object.keys(fields);
  assert(fields.name && fields.address && fields.city, 'Name, address and city are required.', 400, 'MISSING_FIELDS');
  const [result] = await pool.execute(`INSERT INTO theatres (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, keys.map((k) => fields[k]));
  return serializers.theatre((await pool.execute('SELECT * FROM theatres WHERE id = ?', [result.insertId]))[0][0]);
}

async function updateTheatre(id, data, ownerScope) {
  const fields = pick(data, theatreFields);
  if (ownerScope) delete fields.owner_id;
  if (fields.facilities !== undefined) fields.facilities = JSON.stringify(fields.facilities || []);
  if (ownerScope) {
    const [owned] = await pool.execute('SELECT id FROM theatres WHERE id = ? AND owner_id = ?', [id, ownerScope]);
    assert(owned[0], 'You do not manage this theatre.', 403, 'FORBIDDEN');
  }
  const keys = Object.keys(fields);
  if (keys.length) await pool.execute(`UPDATE theatres SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
  const [rows] = await pool.execute('SELECT * FROM theatres WHERE id = ?', [id]);
  assert(rows[0], 'Theatre not found.', 404, 'THEATRE_NOT_FOUND');
  return serializers.theatre(rows[0]);
}

async function deleteTheatre(id) {
  const [result] = await pool.execute('DELETE FROM theatres WHERE id = ?', [id]);
  assert(result.affectedRows, 'Theatre not found.', 404, 'THEATRE_NOT_FOUND');
  return { deleted: true };
}

async function generateSeats(connection, screenId, layout) {
  const rows = Math.min(30, Math.max(1, Number(layout.rows) || 8));
  const cols = Math.min(30, Math.max(1, Number(layout.columns) || 12));
  const categories = Array.isArray(layout.categories) && layout.categories.length
    ? layout.categories
    : [
      { type: 'silver', from: 1, to: Math.ceil(rows * 0.25) },
      { type: 'gold', from: Math.ceil(rows * 0.25) + 1, to: Math.ceil(rows * 0.65) },
      { type: 'premium', from: Math.ceil(rows * 0.65) + 1, to: rows }
    ];
  const typeFor = (r) => {
    const found = categories.find((c) => r >= Number(c.from) && r <= Number(c.to));
    return ['silver', 'gold', 'premium'].includes(found?.type) ? found.type : 'silver';
  };
  for (let r = 1; r <= rows; r++) {
    const rowLabel = String.fromCharCode(64 + r);
    for (let c = 1; c <= cols; c++) {
      await connection.execute(
        'INSERT INTO seats (screen_id, seat_number, row_label, seat_type) VALUES (?, ?, ?, ?)',
        [screenId, `${rowLabel}${c}`, rowLabel, typeFor(r)]
      );
    }
  }
  return rows * cols;
}

async function listScreens() {
  const [rows] = await pool.execute(`
    SELECT sc.*, t.name AS theatre_name, t.city AS theatre_city,
      (SELECT COUNT(*) FROM seats s WHERE s.screen_id = sc.id) AS seat_count
    FROM screens sc JOIN theatres t ON t.id = sc.theatre_id ORDER BY t.city, t.name, sc.name`);
  return rows.map((r) => ({ ...serializers.screen(r), theatreName: r.theatre_name, theatreCity: r.theatre_city, seatCount: Number(r.seat_count) }));
}

async function listShows() {
  const [rows] = await pool.execute(`
    SELECT sh.*, m.title AS movie_title, t.name AS theatre_name, t.city AS theatre_city, sc.name AS screen_name
    FROM shows sh JOIN movies m ON m.id = sh.movie_id JOIN screens sc ON sc.id = sh.screen_id
    JOIN theatres t ON t.id = sc.theatre_id
    ORDER BY sh.show_date DESC, sh.show_time DESC LIMIT 300`);
  return rows.map((r) => ({ ...serializers.show(r), theatreCity: r.theatre_city }));
}

async function createScreen(data, ownerScope) {
  const theatreId = Number(data.theatre_id);
  if (ownerScope) {
    const [owned] = await pool.execute('SELECT id FROM theatres WHERE id = ? AND owner_id = ?', [theatreId, ownerScope]);
    assert(owned[0], 'You do not manage this theatre.', 403, 'FORBIDDEN');
  }
  const name = String(data.name || '').trim();
  assert(name, 'Screen name is required.', 400, 'NAME_REQUIRED');
  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      'INSERT INTO screens (theatre_id, name, capacity, seat_layout, status) VALUES (?, ?, ?, ?, ?)',
      [theatreId, name, Number(data.capacity) || 96, JSON.stringify(data.seat_layout || { rows: 8, columns: 12 }), data.status || 'active']
    );
    const count = await generateSeats(connection, result.insertId, data.seat_layout || {});
    await connection.execute('UPDATE screens SET capacity = ? WHERE id = ?', [count, result.insertId]);
    const [rows] = await connection.execute('SELECT * FROM screens WHERE id = ?', [result.insertId]);
    return serializers.screen(rows[0]);
  });
}

async function updateScreen(id, data, ownerScope) {
  const fields = pick(data, ['name', 'capacity', 'seat_layout', 'status']);
  if (fields.seat_layout !== undefined) fields.seat_layout = JSON.stringify(fields.seat_layout);
  if (ownerScope) {
    const [owned] = await pool.execute(`SELECT sc.id FROM screens sc JOIN theatres t ON t.id = sc.theatre_id WHERE sc.id = ? AND t.owner_id = ?`, [id, ownerScope]);
    assert(owned[0], 'You do not manage this screen.', 403, 'FORBIDDEN');
  }
  const keys = Object.keys(fields);
  if (keys.length) await pool.execute(`UPDATE screens SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
  const [rows] = await pool.execute('SELECT * FROM screens WHERE id = ?', [id]);
  assert(rows[0], 'Screen not found.', 404, 'SCREEN_NOT_FOUND');
  return serializers.screen(rows[0]);
}

async function regenerateSeats(id, layout, ownerScope) {
  if (ownerScope) {
    const [owned] = await pool.execute(`SELECT sc.id FROM screens sc JOIN theatres t ON t.id = sc.theatre_id WHERE sc.id = ? AND t.owner_id = ?`, [id, ownerScope]);
    assert(owned[0], 'You do not manage this screen.', 403, 'FORBIDDEN');
  }
  return withTransaction(async (connection) => {
    const [bookings] = await connection.execute(`
      SELECT COUNT(*) AS count FROM booking_seats bs JOIN shows sh ON sh.id = bs.show_id
      WHERE sh.screen_id = ? AND sh.show_date >= CURDATE()`, [id]);
    assert(bookings[0].count === 0, 'Cannot regenerate seats while future bookings exist for this screen.', 409, 'SEATS_IN_USE');
    await connection.execute('DELETE FROM seats WHERE screen_id = ?', [id]);
    const count = await generateSeats(connection, id, layout || {});
    await connection.execute('UPDATE screens SET capacity = ?, seat_layout = ? WHERE id = ?', [count, JSON.stringify(layout || {}), id]);
    return { screenId: Number(id), seats: count };
  });
}

async function deleteScreen(id, ownerScope) {
  if (ownerScope) {
    const [owned] = await pool.execute(`SELECT sc.id FROM screens sc JOIN theatres t ON t.id = sc.theatre_id WHERE sc.id = ? AND t.owner_id = ?`, [id, ownerScope]);
    assert(owned[0], 'You do not manage this screen.', 403, 'FORBIDDEN');
  }
  const [result] = await pool.execute('DELETE FROM screens WHERE id = ?', [id]);
  assert(result.affectedRows, 'Screen not found.', 404, 'SCREEN_NOT_FOUND');
  return { deleted: true };
}

function assertOwnerOfScreen(ownerScope, screenId) {
  if (!ownerScope) return Promise.resolve();
  return pool.execute(`SELECT sc.id FROM screens sc JOIN theatres t ON t.id = sc.theatre_id WHERE sc.id = ? AND t.owner_id = ?`, [screenId, ownerScope])
    .then(([rows]) => assert(rows[0], 'You do not manage this screen.', 403, 'FORBIDDEN'));
}

async function createShow(data, ownerScope) {
  const fields = pick(data, showFields);
  assert(fields.movie_id && fields.screen_id && fields.show_date && fields.show_time, 'Movie, screen, date and time are required.', 400, 'MISSING_FIELDS');
  await assertOwnerOfScreen(ownerScope, fields.screen_id);
  const keys = Object.keys(fields);
  const [result] = await pool.execute(`INSERT INTO shows (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, keys.map((k) => fields[k]));
  return serializers.show((await pool.execute(`SELECT sh.*, m.title AS movie_title, t.id AS theatre_id, t.name AS theatre_name, sc.name AS screen_name, sc.capacity FROM shows sh JOIN movies m ON m.id = sh.movie_id JOIN screens sc ON sc.id = sh.screen_id JOIN theatres t ON t.id = sc.theatre_id WHERE sh.id = ?`, [result.insertId]))[0][0]);
}

async function updateShow(id, data, ownerScope) {
  const fields = pick(data, showFields);
  if (fields.screen_id) await assertOwnerOfScreen(ownerScope, fields.screen_id);
  else if (ownerScope) {
    const [rows] = await pool.execute(`SELECT sh.id FROM shows sh JOIN screens sc ON sc.id = sh.screen_id JOIN theatres t ON t.id = sc.theatre_id WHERE sh.id = ? AND t.owner_id = ?`, [id, ownerScope]);
    assert(rows[0], 'You do not manage this show.', 403, 'FORBIDDEN');
  }
  const keys = Object.keys(fields);
  if (keys.length) await pool.execute(`UPDATE shows SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
  const [rows] = await pool.execute('SELECT * FROM shows WHERE id = ?', [id]);
  assert(rows[0], 'Show not found.', 404, 'SHOW_NOT_FOUND');
  return serializers.show(rows[0]);
}

async function deleteShow(id, ownerScope) {
  if (ownerScope) {
    const [rows] = await pool.execute(`SELECT sh.id FROM shows sh JOIN screens sc ON sc.id = sh.screen_id JOIN theatres t ON t.id = sc.theatre_id WHERE sh.id = ? AND t.owner_id = ?`, [id, ownerScope]);
    assert(rows[0], 'You do not manage this show.', 403, 'FORBIDDEN');
  }
  const [result] = await pool.execute('DELETE FROM shows WHERE id = ?', [id]);
  assert(result.affectedRows, 'Show not found.', 404, 'SHOW_NOT_FOUND');
  return { deleted: true };
}

async function listCoupons() {
  const [rows] = await pool.execute('SELECT * FROM coupons ORDER BY created_at DESC');
  return rows;
}

async function createCoupon(data) {
  const fields = pick(data, ['code', 'description', 'discount_type', 'discount_value', 'min_amount', 'max_discount', 'usage_limit', 'valid_from', 'valid_until', 'is_active']);
  assert(fields.code, 'Coupon code is required.', 400, 'CODE_REQUIRED');
  const keys = Object.keys(fields);
  const [result] = await pool.execute(`INSERT INTO coupons (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, keys.map((k) => fields[k]));
  const [rows] = await pool.execute('SELECT * FROM coupons WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function updateCoupon(id, data) {
  const fields = pick(data, ['description', 'discount_type', 'discount_value', 'min_amount', 'max_discount', 'usage_limit', 'valid_from', 'valid_until', 'is_active']);
  const keys = Object.keys(fields);
  if (keys.length) await pool.execute(`UPDATE coupons SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
  return { updated: true };
}

async function deleteCoupon(id) {
  await pool.execute('DELETE FROM coupons WHERE id = ?', [id]);
  return { deleted: true };
}

async function reviews() {
  const [rows] = await pool.execute(`SELECT r.*, u.name AS user_name, m.title AS movie_title FROM reviews r JOIN users u ON u.id = r.user_id JOIN movies m ON m.id = r.movie_id ORDER BY r.created_at DESC LIMIT 200`);
  return rows;
}

module.exports = {
  dashboard, popularMovies, revenueReport, bookingStats, theatrePerformance, listUsers, updateUser,
  listMoviesAdmin, createMovie, updateMovie, deleteMovie, listTheatresAdmin, createTheatre, updateTheatre,
  deleteTheatre, listScreens, listShows, createScreen, updateScreen, regenerateSeats, deleteScreen, createShow, updateShow, deleteShow,
  listCoupons, createCoupon, updateCoupon, deleteCoupon, reviews
};
