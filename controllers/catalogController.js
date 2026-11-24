const service = require('../services/catalogService');
const { ok } = require('../utils/response');

exports.home = async (req, res) => ok(res, await service.home(), 'Home content loaded.');
exports.movies = async (req, res) => ok(res, await service.listMovies(req.query), 'Movies loaded.');
exports.movie = async (req, res) => ok(res, { movie: await service.getMovie(req.params.idOrSlug) }, 'Movie loaded.');
exports.theatres = async (req, res) => ok(res, { theatres: await service.listTheatres(req.query) }, 'Theatres loaded.');
exports.theatre = async (req, res) => ok(res, { theatre: await service.getTheatre(req.params.id) }, 'Theatre loaded.');
exports.cities = async (req, res) => ok(res, { cities: await service.listCities() }, 'Cities loaded.');
exports.shows = async (req, res) => ok(res, { shows: await service.listShows(req.query) }, 'Showtimes loaded.');
exports.show = async (req, res) => ok(res, { show: await service.getShow(req.params.id) }, 'Show loaded.');
exports.review = async (req, res) => {
  const { movieId, rating, comment } = req.body;
  ok(res, await service.addReview(req.user.id, movieId, rating, comment), 'Thanks for your review!', 201);
};

module.exports = require('../middleware/errorHandler').wrapControllers(module.exports);
