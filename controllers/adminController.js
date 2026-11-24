const adminService = require('../services/adminService');
const { upload, saveImage } = require('../services/uploadService');
const { ok, created } = require('../utils/response');

exports.dashboard = async (req, res) => ok(res, await adminService.dashboard(), 'Admin dashboard loaded.');
exports.revenue = async (req, res) => ok(res, { report: await adminService.revenueReport(req.query.period) }, 'Revenue report loaded.');
exports.popular = async (req, res) => ok(res, { movies: await adminService.popularMovies(req.query.limit) }, 'Popular movies loaded.');
exports.bookingStats = async (req, res) => ok(res, { stats: await adminService.bookingStats() }, 'Booking statistics loaded.');
exports.performance = async (req, res) => ok(res, { theatres: await adminService.theatrePerformance() }, 'Theatre performance loaded.');
exports.users = async (req, res) => ok(res, { users: await adminService.listUsers() }, 'Users loaded.');
exports.updateUser = async (req, res) => ok(res, { user: await adminService.updateUser(req.params.id, req.body) }, 'User updated.');

exports.movies = async (req, res) => ok(res, { movies: await adminService.listMoviesAdmin() }, 'Movies loaded.');
exports.createMovie = async (req, res) => {
  const posterUrl = await saveImage(req.file, 'cinebook/movies');
  created(res, { movie: await adminService.createMovie({ ...req.body, adminId: req.user.id }, posterUrl) }, 'Movie created.');
};
exports.updateMovie = async (req, res) => {
  const posterUrl = await saveImage(req.file, 'cinebook/movies');
  ok(res, { movie: await adminService.updateMovie(req.params.id, req.body, posterUrl) }, 'Movie updated.');
};
exports.deleteMovie = async (req, res) => ok(res, await adminService.deleteMovie(req.params.id), 'Movie deleted.');

exports.theatres = async (req, res) => ok(res, { theatres: await adminService.listTheatresAdmin() }, 'Theatres loaded.');
exports.createTheatre = async (req, res) => created(res, { theatre: await adminService.createTheatre(req.body) }, 'Theatre created.');
exports.updateTheatre = async (req, res) => ok(res, { theatre: await adminService.updateTheatre(req.params.id, req.body) }, 'Theatre updated.');
exports.deleteTheatre = async (req, res) => ok(res, await adminService.deleteTheatre(req.params.id), 'Theatre deleted.');

exports.screens = async (req, res) => ok(res, { screens: await adminService.listScreens() }, 'Screens loaded.');
exports.shows = async (req, res) => ok(res, { shows: await adminService.listShows() }, 'Shows loaded.');
exports.createScreen = async (req, res) => created(res, { screen: await adminService.createScreen(req.body) }, 'Screen and seats created.');
exports.updateScreen = async (req, res) => ok(res, { screen: await adminService.updateScreen(req.params.id, req.body) }, 'Screen updated.');
exports.regenerateSeats = async (req, res) => ok(res, await adminService.regenerateSeats(req.params.id, req.body.layout), 'Seat layout regenerated.');
exports.deleteScreen = async (req, res) => ok(res, await adminService.deleteScreen(req.params.id), 'Screen deleted.');

exports.createShow = async (req, res) => created(res, { show: await adminService.createShow(req.body) }, 'Showtime created.');
exports.updateShow = async (req, res) => ok(res, { show: await adminService.updateShow(req.params.id, req.body) }, 'Showtime updated.');
exports.deleteShow = async (req, res) => ok(res, await adminService.deleteShow(req.params.id), 'Showtime deleted.');

exports.coupons = async (req, res) => ok(res, { coupons: await adminService.listCoupons() }, 'Coupons loaded.');
exports.createCoupon = async (req, res) => created(res, { coupon: await adminService.createCoupon(req.body) }, 'Coupon created.');
exports.updateCoupon = async (req, res) => ok(res, await adminService.updateCoupon(req.params.id, req.body), 'Coupon updated.');
exports.deleteCoupon = async (req, res) => ok(res, await adminService.deleteCoupon(req.params.id), 'Coupon deleted.');
exports.reviews = async (req, res) => ok(res, { reviews: await adminService.reviews() }, 'Reviews loaded.');

exports.uploadPoster = async (req, res) => {
  const url = await saveImage(req.file, 'cinebook/posters');
  ok(res, { url }, 'Image uploaded.');
};

module.exports = require('../middleware/errorHandler').wrapControllers({ ...exports, upload });
