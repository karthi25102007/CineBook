const config = require('../config/env');

const ok = (res, data = {}, message = 'OK', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const created = (res, data = {}, message = 'Created successfully') => ok(res, data, message, 201);

const withPagination = (page = 1, limit = 12) => ({
  page: Math.max(1, Number(page) || 1),
  limit: Math.min(100, Math.max(1, Number(limit) || 12))
});

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  city: user.city,
  avatarUrl: user.avatar_url || null
});

const paymentMode = () => (config.razorpay.keyId && config.razorpay.keySecret ? 'razorpay' : config.devPayments ? 'dev' : 'unavailable');

module.exports = { ok, created, withPagination, publicUser, paymentMode };
