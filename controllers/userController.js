const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { hashPassword, comparePassword, assert } = require('../utils/security');
const { ok, publicUser } = require('../utils/response');

exports.updateProfile = async (req, res) => {
  const { name, phone, city, avatarUrl } = req.body;
  await pool.execute(
    'UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), city = COALESCE(?, city), avatar_url = COALESCE(?, avatar_url) WHERE id = ?',
    [name?.trim() || null, phone || null, city || null, avatarUrl || null, req.user.id]
  );
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
  ok(res, { user: publicUser(rows[0]) }, 'Profile updated.');
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  assert(await comparePassword(currentPassword, rows[0].password_hash), 'Current password is incorrect.', 400, 'INVALID_PASSWORD');
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(newPassword), req.user.id]);
  ok(res, { changed: true }, 'Password changed successfully.');
};

exports.watchlist = async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT m.* FROM watchlists w JOIN movies m ON m.id = w.movie_id
    WHERE w.user_id = ? ORDER BY w.created_at DESC`, [req.user.id]);
  ok(res, { movies: rows }, 'Watchlist loaded.');
};

exports.toggleWatchlist = async (req, res) => {
  const movieId = req.params.movieId || req.body.movieId;
  const [rows] = await pool.execute('SELECT id FROM watchlists WHERE user_id = ? AND movie_id = ?', [req.user.id, movieId]);
  if (rows.length) {
    await pool.execute('DELETE FROM watchlists WHERE user_id = ? AND movie_id = ?', [req.user.id, movieId]);
    return ok(res, { saved: false }, 'Removed from watchlist.');
  }
  const [movie] = await pool.execute('SELECT id FROM movies WHERE id = ?', [movieId]);
  assert(movie[0], 'Movie not found.', 404, 'MOVIE_NOT_FOUND');
  await pool.execute('INSERT INTO watchlists (user_id, movie_id) VALUES (?, ?)', [req.user.id, movieId]);
  ok(res, { saved: true }, 'Added to watchlist.');
};

exports.stats = async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT
      (SELECT COUNT(*) FROM bookings WHERE user_id = ? AND status = 'confirmed') AS bookings,
      (SELECT COUNT(*) FROM watchlists WHERE user_id = ?) AS watchlist,
      (SELECT COUNT(*) FROM reviews WHERE user_id = ?) AS reviews`, [req.user.id, req.user.id, req.user.id]);
  ok(res, {
    bookings: Number(rows[0].bookings), watchlist: Number(rows[0].watchlist), reviews: Number(rows[0].reviews)
  }, 'Account summary loaded.');
};

module.exports = require('../middleware/errorHandler').wrapControllers(module.exports);
