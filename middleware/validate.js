const { validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const message = errors.array()[0].msg;
  return next(new AppError(message, 400, 'VALIDATION_ERROR'));
};
