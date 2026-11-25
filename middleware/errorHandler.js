class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const notFound = (req, res, next) => next(new AppError(`Route not found: ${req.originalUrl}`, 404, 'NOT_FOUND'));

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let statusCode = err.statusCode || 500;
  let message = err.isOperational ? err.message : 'Something went wrong. Please try again.';
  let code = err.code || 'INTERNAL_ERROR';

  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'This resource already exists or was already taken. Please refresh and try again.';
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    statusCode = 400;
    code = 'INVALID_REFERENCE';
    message = 'A related record is missing or still in use.';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = err.message;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Your session is invalid or has expired. Please sign in again.';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    code = 'FILE_TOO_LARGE';
    message = 'Image must be smaller than 5 MB.';
  }

  if (statusCode >= 500 && process.env.NODE_ENV !== 'test') {
    console.error('[ERROR]', err);
  }

  res.status(statusCode).json({ success: false, error: { code, message } });
}

function wrapControllers(controllers) {
  return Object.fromEntries(Object.entries(controllers).map(([name, fn]) => [name, typeof fn === 'function' ? asyncHandler(fn) : fn]));
}

module.exports = { AppError, asyncHandler, wrapControllers, notFound, errorHandler };
