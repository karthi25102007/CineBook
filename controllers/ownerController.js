const { pool } = require('../config/database');
const adminService = require('../services/adminService');
const bookingService = require('../services/bookingService');
const { ok, created } = require('../utils/response');

const scope = (req) => req.user.id;

exports.dashboard = async (req, res) => {
  const ownerId = scope(req);
  const [rows] = await pool.execute(`
    SELECT
      (SELECT COUNT(*) FROM theatres WHERE owner_id = ?) AS theatres,
      (SELECT COUNT(*) FROM screens sc JOIN theatres t ON t.id = sc.theatre_id WHERE t.owner_id = ?) AS screens,
      (SELECT COUNT(*) FROM shows sh JOIN screens sc ON sc.id = sh.screen_id JOIN theatres t ON t.id = sc.theatre_id WHERE t.owner_id = ? AND sh.show_date >= CURDATE()) AS upcomingShows,
      (SELECT COUNT(*) FROM bookings b JOIN shows sh ON sh.id = b.show_id JOIN screens sc ON sc.id = sh.screen_id JOIN theatres t ON t.id = sc.theatre_id WHERE t.owner_id = ?) AS bookings,
      (SELECT COALESCE(SUM(b.total_amount),0) FROM bookings b JOIN shows sh ON sh.id = b.show_id JOIN screens sc ON sc.id = sh.screen_id JOIN theatres t ON t.id = sc.theatre_id WHERE t.owner_id = ? AND b.status IN ('confirmed','refunded')) AS revenue,
      (SELECT COALESCE(SUM(b.total_amount),0) FROM bookings b JOIN shows sh ON sh.id = b.show_id JOIN screens sc ON sc.id = sh.screen_id JOIN theatres t ON t.id = sc.theatre_id WHERE t.owner_id = ? AND b.status IN ('confirmed','refunded') AND DATE(b.created_at) = CURDATE()) AS todayRevenue`,
  [ownerId, ownerId, ownerId, ownerId, ownerId, ownerId]);
  const s = rows[0];
  ok(res, {
    stats: {
      theatres: Number(s.theatres), screens: Number(s.screens), upcomingShows: Number(s.upcomingShows),
      bookings: Number(s.bookings), revenue: Number(s.revenue), todayRevenue: Number(s.todayRevenue)
    },
    performance: await adminService.theatrePerformance(ownerId),
    popularMovies: await adminService.popularMovies(5)
  }, 'Owner dashboard loaded.');
};

exports.myTheatres = async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM theatres WHERE owner_id = ? ORDER BY name', [scope(req)]);
  ok(res, { theatres: rows }, 'Your theatres loaded.');
};

exports.updateTheatre = async (req, res) => ok(res, { theatre: await adminService.updateTheatre(req.params.id, req.body, scope(req)) }, 'Theatre updated.');

exports.screens = async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT sc.*, t.name AS theatre_name FROM screens sc JOIN theatres t ON t.id = sc.theatre_id
    WHERE t.owner_id = ? ORDER BY t.name, sc.name`, [scope(req)]);
  ok(res, { screens: rows }, 'Screens loaded.');
};
exports.createScreen = async (req, res) => created(res, { screen: await adminService.createScreen({ ...req.body, theatre_id: req.params.theatreId }, scope(req)) }, 'Screen created.');
exports.updateScreen = async (req, res) => ok(res, { screen: await adminService.updateScreen(req.params.id, req.body, scope(req)) }, 'Screen updated.');
exports.regenerateSeats = async (req, res) => ok(res, await adminService.regenerateSeats(req.params.id, req.body.layout, scope(req)), 'Seat layout regenerated.');
exports.deleteScreen = async (req, res) => ok(res, await adminService.deleteScreen(req.params.id, scope(req)), 'Screen deleted.');

exports.shows = async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT sh.*, m.title AS movie_title, t.name AS theatre_name, sc.name AS screen_name
    FROM shows sh JOIN movies m ON m.id = sh.movie_id JOIN screens sc ON sc.id = sh.screen_id
    JOIN theatres t ON t.id = sc.theatre_id WHERE t.owner_id = ?
    ORDER BY sh.show_date DESC, sh.show_time DESC LIMIT 200`, [scope(req)]);
  ok(res, { shows: rows }, 'Shows loaded.');
};
exports.createShow = async (req, res) => created(res, { show: await adminService.createShow(req.body, scope(req)) }, 'Showtime created.');
exports.updateShow = async (req, res) => ok(res, { show: await adminService.updateShow(req.params.id, req.body, scope(req)) }, 'Showtime updated.');
exports.deleteShow = async (req, res) => ok(res, await adminService.deleteShow(req.params.id, scope(req)), 'Showtime deleted.');

exports.bookings = async (req, res) => ok(res, { bookings: await bookingService.listBookings({ ownerId: scope(req) }) }, 'Bookings loaded.');
exports.revenue = async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT DATE_FORMAT(b.created_at, '%Y-%m-%d') AS label, COUNT(*) AS bookings, SUM(b.total_amount) AS revenue
    FROM bookings b JOIN shows sh ON sh.id = b.show_id JOIN screens sc ON sc.id = sh.screen_id
    JOIN theatres t ON t.id = sc.theatre_id
    WHERE t.owner_id = ? AND b.status IN ('confirmed','refunded')
    GROUP BY label ORDER BY label DESC LIMIT 30`, [scope(req)]);
  ok(res, { report: rows.map((r) => ({ label: r.label, bookings: Number(r.bookings), revenue: Number(r.revenue) })) }, 'Revenue report loaded.');
};

module.exports = require('../middleware/errorHandler').wrapControllers(module.exports);
