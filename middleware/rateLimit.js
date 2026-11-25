const rateLimit = require('express-rate-limit');

const windowMessage = { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again shortly.' } };

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 400, standardHeaders: true, legacyHeaders: false });

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: windowMessage
});

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: windowMessage
});

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: windowMessage
});

module.exports = { apiLimiter, authLimiter, paymentLimiter, writeLimiter };
