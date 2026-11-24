require('dotenv').config();

const env = (key, fallback = '') => process.env[key] ?? fallback;

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(env('PORT', 5000)),
  clientUrl: env('CLIENT_URL', 'http://localhost:5173'),
  db: {
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', 3306)),
    user: env('DB_USER', 'root'),
    password: env('DB_PASSWORD', ''),
    database: env('DB_NAME', 'cinebook'),
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    timezone: '+00:00',
    dateStrings: true
  },
  jwt: {
    secret: env('JWT_SECRET', 'change-me-in-production'),
    expires: env('JWT_EXPIRES', '7d'),
    resetExpires: env('JWT_RESET_EXPIRES', '15m')
  },
  razorpay: {
    keyId: env('RAZORPAY_KEY_ID'),
    keySecret: env('RAZORPAY_KEY_SECRET'),
    currency: env('RAZORPAY_CURRENCY', 'INR')
  },
  cloudinary: {
    cloudName: env('CLOUDINARY_CLOUD_NAME'),
    apiKey: env('CLOUDINARY_API_KEY'),
    apiSecret: env('CLOUDINARY_API_SECRET')
  },
  mail: {
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT', 587)),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('MAIL_FROM', 'CineBook <no-reply@cinebook.local>')
  },
  devPayments: env('DEV_PAYMENTS', 'true') === 'true',
  reservationMinutes: Number(env('RESERVATION_MINUTES', 10)),
  convenienceFeePerSeat: Number(env('CONVENIENCE_FEE_PER_SEAT', 28.5)),
  taxPercent: Number(env('TAX_PERCENT', 5)),
  uploadDir: env('UPLOAD_DIR', 'uploads')
};
