const nodemailer = require('nodemailer');
const config = require('../config/env');

function transporter() {
  if (!config.mail.host || !config.mail.user) return null;
  return nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: { user: config.mail.user, pass: config.mail.pass }
  });
}

async function sendPasswordReset(email, resetUrl) {
  const transport = transporter();
  const html = `
    <div style="font-family:Arial,sans-serif;background:#0B0B0F;color:#fff;padding:32px;border-radius:16px">
      <h1 style="color:#E50914">CineBook</h1>
      <h2>Reset your password</h2>
      <p>We received a request to reset your password. This link expires in 15 minutes.</p>
      <a href="${resetUrl}" style="display:inline-block;background:#E50914;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Reset Password</a>
      <p style="color:#A3A3B2">If you did not request this, you can safely ignore this email.</p>
    </div>`;
  if (transport) {
    await transport.sendMail({ from: config.mail.from, to: email, subject: 'Reset your CineBook password', html });
    return { delivered: true };
  }
  return { delivered: false, resetUrl };
}

module.exports = { sendPasswordReset };
