const { AppError } = require('../middleware/errorHandler');

function signToken(payload, secret, expires) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(payload, secret, { expiresIn: expires });
}

function verifyToken(token, secret) {
  const jwt = require('jsonwebtoken');
  return jwt.verify(token, secret);
}

async function hashPassword(password) {
  const bcrypt = require('bcryptjs');
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  const bcrypt = require('bcryptjs');
  return bcrypt.compare(password, hash || '');
}

function assert(condition, message, statusCode = 400, code = 'BAD_REQUEST') {
  if (!condition) throw new AppError(message, statusCode, code);
}

module.exports = { signToken, verifyToken, hashPassword, comparePassword, assert };
