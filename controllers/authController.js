const crypto = require('crypto');
const config = require('../config/env');
const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { signToken, verifyToken, hashPassword, comparePassword, assert } = require('../utils/security');
const { ok, created, publicUser } = require('../utils/response');
const { sendPasswordReset } = require('../services/mailService');

function authPayload(user) {
  return signToken({ id: user.id, role: user.role, email: user.email }, config.jwt.secret, config.jwt.expires);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

exports.register = async (req, res) => {
  const { name, email, password, phone, city } = req.body;
  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  assert(existing.length === 0, 'An account with this email already exists.', 409, 'EMAIL_EXISTS');

  const passwordHash = await hashPassword(password);
  const [result] = await pool.execute(
    'INSERT INTO users (name, email, password_hash, phone, role, city) VALUES (?, ?, ?, ?, ?, ?)',
    [name.trim(), email.toLowerCase().trim(), passwordHash, phone || null, 'customer', city || null]
  );
  const user = { id: result.insertId, name, email: email.toLowerCase(), phone, role: 'customer', city, avatar_url: null };
  created(res, { user: publicUser(user), token: authPayload(user) }, 'Welcome to CineBook!');
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  const user = rows[0];
  assert(user, 'Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  assert(user.is_active, 'This account has been deactivated.', 403, 'ACCOUNT_INACTIVE');
  assert(await comparePassword(password, user.password_hash), 'Invalid email or password.', 401, 'INVALID_CREDENTIALS');

  await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  ok(res, { user: publicUser(user), token: authPayload(user) }, 'Signed in successfully.');
};

exports.me = async (req, res) => {
  ok(res, { user: publicUser(req.user) }, 'Profile loaded.');
};

exports.logout = async (req, res) => {
  ok(res, { loggedOut: true }, 'Signed out successfully. Remove the stored token on the client.');
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  const [rows] = await pool.execute('SELECT id, name, email FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  const user = rows[0];

  if (user) {
    const token = signToken({ id: user.id, purpose: 'password-reset' }, config.jwt.secret, config.jwt.resetExpires);
    await pool.execute('UPDATE users SET reset_token_hash = ?, reset_token_expires = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?', [tokenHash(token), user.id]);
    const resetUrl = `${config.clientUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const result = await sendPasswordReset(user.email, resetUrl);
    const data = { messageSent: result.delivered };
    if (!result.delivered && config.env !== 'production') data.devResetUrl = result.resetUrl;
    return ok(res, data, 'Password reset instructions have been sent.');
  }

  ok(res, { messageSent: true }, 'If this email is registered, reset instructions have been sent.');
};

exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  const decoded = verifyToken(token, config.jwt.secret);
  assert(decoded.purpose === 'password-reset', 'Invalid reset link.', 400, 'INVALID_RESET_TOKEN');

  const [rows] = await pool.execute(
    'SELECT id FROM users WHERE id = ? AND reset_token_hash = ? AND reset_token_expires > NOW()',
    [decoded.id, tokenHash(token)]
  );
  assert(rows[0], 'This reset link has expired or was already used.', 400, 'INVALID_RESET_TOKEN');

  await pool.execute(
    'UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL WHERE id = ?',
    [await hashPassword(password), decoded.id]
  );
  ok(res, { reset: true }, 'Password updated. You can now sign in.');
};

module.exports = require('../middleware/errorHandler').wrapControllers(module.exports);
