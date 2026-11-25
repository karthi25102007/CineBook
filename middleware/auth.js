const config = require('../config/env');
const { pool } = require('../config/database');
const { AppError, asyncHandler } = require('./errorHandler');
const { verifyToken, assert } = require('../utils/security');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.cookies?.token) return req.cookies.token;
  return null;
}

const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  assert(token, 'Please sign in to continue.', 401, 'UNAUTHORIZED');

  const decoded = verifyToken(token, config.jwt.secret);
  assert(decoded && decoded.id, 'Invalid authentication token.', 401, 'UNAUTHORIZED');

  const [rows] = await pool.execute(
    'SELECT id, name, email, phone, role, city, avatar_url, is_active FROM users WHERE id = ?',
    [decoded.id]
  );
  const user = rows[0];
  assert(user, 'Account not found.', 401, 'UNAUTHORIZED');
  assert(user.is_active, 'This account has been deactivated.', 403, 'ACCOUNT_INACTIVE');

  req.user = user;
  req.token = token;
  next();
});

const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = verifyToken(token, config.jwt.secret);
      const [rows] = await pool.execute(
        'SELECT id, name, email, phone, role, city, avatar_url, is_active FROM users WHERE id = ?',
        [decoded.id]
      );
      if (rows[0]?.is_active) req.user = rows[0];
    } catch {
      req.user = null;
    }
  }
  next();
});

const authorize = (...roles) => (req, res, next) => {
  assert(req.user, 'Please sign in to continue.', 401, 'UNAUTHORIZED');
  assert(roles.includes(req.user.role), 'You do not have permission to perform this action.', 403, 'FORBIDDEN');
  next();
};

const adminOnly = authorize('admin');
const staffOnly = authorize('admin', 'owner');

module.exports = { protect, optionalAuth, authorize, adminOnly, staffOnly, extractToken };
