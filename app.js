const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const config = require('./config/env');
const { testConnection } = require('./config/database');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { ok } = require('./utils/response');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(cors({ origin: [config.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'], credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.resolve(__dirname, config.uploadDir), { fallthrough: true }));

app.get('/api/health', async (req, res, next) => {
  try {
    const db = await testConnection();
    ok(res, { status: 'ok', database: db.database_name, version: db.version, time: new Date().toISOString() }, 'CineBook API is healthy.');
  } catch (error) {
    next(error);
  }
});

app.use('/api', apiLimiter);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/catalog', require('./routes/catalogRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/owner', require('./routes/ownerRoutes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
