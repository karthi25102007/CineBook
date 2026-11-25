const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { withPagination } = require('../utils/response');
const { dateRange } = require('../utils/helpers');
const serializers = require('../utils/serialize');

const MOVIE_SELECT = `
  SELECT m.*,
    (SELECT AVG(r.rating) FROM reviews r WHERE r.movie_id = m.id AND r.status = 'approved') AS avg_review_rating,
    (SELECT COUNT(*) FROM reviews r WHERE r.movie_id = m.id AND r.status = 'approved') AS review_count
  FROM movies m`;

const SHOW_SELECT = `
  SELECT sh.*, m.title AS movie_title, m.poster_url, m.certification, m.language AS movie_language,
    m.duration_minutes, t.id AS theatre_id, t.name AS theatre_name, t.address AS theatre_address,
    t.city AS theatre_city, sc.name AS screen_name, sc.capacity,
    (SELECT COUNT(*) FROM booking_seats bs WHERE bs.show_id = sh.id) AS booked_count,
    (SELECT COUNT(*) FROM seat_reservations sr WHERE sr.show_id = sh.id AND sr.expires_at > NOW()) AS reserved_count
  FROM shows sh
  JOIN movies m ON m.id = sh.movie_id
  JOIN screens sc ON sc.id = sh.screen_id
  JOIN theatres t ON t.id = sc.theatre_id`;

async function listMovies(query = {}) {
  const { page, limit } = withPagination(query.page, query.limit);
  const conditions = ["m.status <> 'archived'"];
  const params = [];

  if (query.q) {
    conditions.push('(m.title LIKE ? OR m.genre LIKE ? OR m.language LIKE ? OR m.description LIKE ?)');
    const like = `%${query.q}%`;
    params.push(like, like, like, like);
  }
  if (query.language) { conditions.push('m.language = ?'); params.push(query.language); }
  if (query.genre) { conditions.push('m.genre LIKE ?'); params.push(`%${query.genre}%`); }
  if (query.status) { conditions.push('m.status = ?'); params.push(query.status); }
  if (query.city) {
    conditions.push(`EXISTS (
      SELECT 1 FROM shows sh JOIN screens sc ON sc.id = sh.screen_id JOIN theatres t ON t.id = sc.theatre_id
      WHERE sh.movie_id = m.id AND sh.show_date >= CURDATE() AND sh.status = 'scheduled' AND t.city = ?)`);
    params.push(query.city);
  }

  const sortMap = {
    latest: 'm.release_date DESC, m.id DESC',
    rating: 'm.rating DESC, m.id DESC',
    title: 'm.title ASC',
    trending: 'm.is_trending DESC, m.rating DESC'
  };
  const order = sortMap[query.sort] || sortMap.latest;
  const where = conditions.join(' AND ');
  const [rows] = await pool.execute(`${MOVIE_SELECT} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM movies m WHERE ${where}`, params);

  return { items: rows.map(serializers.movie), total: countRows[0].total, page, limit, pages: Math.ceil(countRows[0].total / limit) };
}

async function getMovie(idOrSlug) {
  const isSlug = Number.isNaN(Number(idOrSlug));
  const [rows] = await pool.execute(`${MOVIE_SELECT} WHERE ${isSlug ? 'm.slug = ?' : 'm.id = ?'}`, [idOrSlug]);
  if (!rows[0]) throw new AppError('Movie not found.', 404, 'MOVIE_NOT_FOUND');

  const movie = serializers.movie(rows[0]);
  const [reviews] = await pool.execute(`
    SELECT r.id, r.rating, r.comment, r.created_at, u.name AS user_name
    FROM reviews r JOIN users u ON u.id = r.user_id
    WHERE r.movie_id = ? AND r.status = 'approved' ORDER BY r.created_at DESC LIMIT 10`, [movie.id]);
  movie.reviews = reviews.map((r) => ({
    id: r.id, rating: r.rating, comment: r.comment, userName: r.user_name,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null
  }));
  return movie;
}

async function home() {
  const [all] = await pool.execute(`${MOVIE_SELECT} WHERE m.status <> 'archived' ORDER BY m.release_date DESC, m.id DESC`);
  const movies = all.map(serializers.movie);
  const [cities] = await pool.execute("SELECT DISTINCT city FROM theatres WHERE status = 'active' ORDER BY city");
  const [theatres] = await pool.execute('SELECT COUNT(*) AS count FROM theatres WHERE status = "active"');
  return {
    featured: movies.find((m) => m.featured) || movies[0] || null,
    trending: movies.filter((m) => m.trending).slice(0, 8),
    recommended: movies.filter((m) => m.recommended).slice(0, 8),
    upcoming: movies.filter((m) => m.status === 'upcoming').slice(0, 8),
    topRated: [...movies].sort((a, b) => b.rating - a.rating).slice(0, 8),
    nowShowing: movies.filter((m) => m.status === 'now_showing').slice(0, 12),
    languages: [...new Set(movies.map((m) => m.language))],
    genres: [...new Set(movies.flatMap((m) => m.genres))],
    cities: cities.map((c) => c.city),
    stats: { movies: movies.length, theatres: theatres[0].count }
  };
}

async function listTheatres(query = {}) {
  const conditions = ["t.status = 'active'"];
  const params = [];
  if (query.city) { conditions.push('t.city = ?'); params.push(query.city); }
  if (query.q) { conditions.push('(t.name LIKE ? OR t.address LIKE ?)'); params.push(`%${query.q}%`, `%${query.q}%`); }
  if (query.movieId) {
    conditions.push('EXISTS (SELECT 1 FROM shows sh JOIN screens sc2 ON sc2.id = sh.screen_id WHERE sc2.theatre_id = t.id AND sh.movie_id = ? AND sh.show_date >= CURDATE())');
    params.push(query.movieId);
  }
  const [rows] = await pool.execute(`
    SELECT t.*, COUNT(DISTINCT sc.id) AS screen_count
    FROM theatres t LEFT JOIN screens sc ON sc.theatre_id = t.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY t.id ORDER BY t.name ASC`, params);
  return rows.map(serializers.theatre);
}

async function getTheatre(id) {
  const [rows] = await pool.execute(`
    SELECT t.*, COUNT(DISTINCT sc.id) AS screen_count FROM theatres t
    LEFT JOIN screens sc ON sc.theatre_id = t.id WHERE t.id = ? GROUP BY t.id`, [id]);
  if (!rows[0]) throw new AppError('Theatre not found.', 404, 'THEATRE_NOT_FOUND');
  const [screens] = await pool.execute('SELECT * FROM screens WHERE theatre_id = ? AND status = "active" ORDER BY name', [id]);
  const [movies] = await pool.execute(`
    SELECT DISTINCT m.* FROM movies m JOIN shows sh ON sh.movie_id = m.id
    JOIN screens sc ON sc.id = sh.screen_id WHERE sc.theatre_id = ? AND sh.show_date >= CURDATE() AND sh.status = 'scheduled'`, [id]);
  return { ...serializers.theatre(rows[0]), screens: screens.map(serializers.screen), movies: movies.map(serializers.movie) };
}

async function listCities() {
  const [rows] = await pool.execute('SELECT city, COUNT(*) AS theatre_count FROM theatres WHERE status = "active" GROUP BY city ORDER BY city');
  return rows.map((r) => ({ city: r.city, theatreCount: Number(r.theatre_count) }));
}

async function listShows(query = {}) {
  const { start, end } = dateRange(Number(query.days) || 14);
  const conditions = ["sh.status = 'scheduled'", 'sh.show_date BETWEEN ? AND ?'];
  const params = [start, end];
  if (query.movieId) { conditions.push('sh.movie_id = ?'); params.push(query.movieId); }
  if (query.theatreId) { conditions.push('sc.theatre_id = ?'); params.push(query.theatreId); }
  if (query.city) { conditions.push('t.city = ?'); params.push(query.city); }
  if (query.date) { conditions.push('sh.show_date = ?'); params.push(query.date); }
  const [rows] = await pool.execute(`${SHOW_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY sh.show_date ASC, sh.show_time ASC, t.name ASC LIMIT 500`, params);
  return rows.map(serializers.show);
}

async function getShow(id) {
  const [rows] = await pool.execute(`${SHOW_SELECT} WHERE sh.id = ?`, [id]);
  if (!rows[0]) throw new AppError('Show not found.', 404, 'SHOW_NOT_FOUND');
  return serializers.show(rows[0]);
}

async function addReview(userId, movieId, rating, comment) {
  const [movieRows] = await pool.execute('SELECT id FROM movies WHERE id = ?', [movieId]);
  if (!movieRows[0]) throw new AppError('Movie not found.', 404, 'MOVIE_NOT_FOUND');
  await pool.execute(`
    INSERT INTO reviews (user_id, movie_id, rating, comment, status) VALUES (?, ?, ?, ?, 'approved')
    ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment), status = 'approved'`,
  [userId, movieId, rating, comment || null]);
  return { movieId, rating };
}

module.exports = { listMovies, getMovie, home, listTheatres, getTheatre, listCities, listShows, getShow, addReview, SHOW_SELECT };
