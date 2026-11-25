const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const config = require('../config/env');
const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { assert } = require('../utils/security');
const { BOOKING_SELECT, getBookingByReference } = require('./bookingService');

function signPayload(reference) {
  const signature = crypto.createHmac('sha256', config.jwt.secret).update(reference).digest('hex').slice(0, 24);
  return `CINEBOOK:${reference}:${signature}`;
}

async function buildTicket(bookingId, user) {
  const [rows] = await pool.execute(`${BOOKING_SELECT} WHERE b.id = ?`, [bookingId]);
  const row = rows[0];
  assert(row, 'Booking not found.', 404, 'BOOKING_NOT_FOUND');
  assert(row.user_id === user.id || user.role === 'admin' || user.role === 'owner', 'You cannot access this ticket.', 403, 'FORBIDDEN');
  assert(row.status === 'confirmed', 'Ticket is available only for confirmed bookings.', 409, 'BOOKING_NOT_CONFIRMED');

  const [payments] = await pool.execute('SELECT * FROM payments WHERE booking_id = ? AND status = "paid" ORDER BY id DESC LIMIT 1', [bookingId]);
  const [users] = await pool.execute('SELECT name, email FROM users WHERE id = ?', [row.user_id]);
  const seats = typeof row.seats_json === 'string' ? JSON.parse(row.seats_json) : row.seats_json;
  const data = {
    reference: row.booking_ref,
    customerName: users[0]?.name || 'Guest',
    customerEmail: users[0]?.email || '',
    movieTitle: row.movie_title,
    posterUrl: row.poster_url,
    theatreName: row.theatre_name,
    theatreAddress: row.theatre_address,
    city: row.theatre_city,
    screen: row.screen_name,
    date: row.show_date,
    time: String(row.show_time).slice(0, 5),
    seats: seats.map((s) => s.number),
    seatTypes: [...new Set(seats.map((s) => s.type))],
    amount: Number(row.total_amount),
    paymentId: payments[0]?.razorpay_payment_id || null,
    status: row.status,
    code: signPayload(row.booking_ref)
  };
  data.qrDataUrl = await QRCode.toDataURL(data.code, {
    width: 360, margin: 1, color: { dark: '#0B0B0F', light: '#FFFFFF' }
  });
  return data;
}

async function verifyTicket(code) {
  const parts = String(code || '').split(':');
  assert(parts.length === 3 && parts[0] === 'CINEBOOK', 'Invalid ticket QR code.', 400, 'INVALID_QR');
  const [, reference, signature] = parts;
  const expected = crypto.createHmac('sha256', config.jwt.secret).update(reference).digest('hex').slice(0, 24);
  assert(signature === expected, 'Invalid ticket signature.', 400, 'INVALID_QR');
  const booking = await getBookingByReference(reference);
  assert(booking, 'Ticket not found.', 404, 'BOOKING_NOT_FOUND');
  return {
    valid: booking.status === 'confirmed',
    booking: {
      reference: booking.reference, movieTitle: booking.movieTitle, theatreName: booking.theatreName,
      screen: booking.screenName, date: booking.showDate, time: booking.showTime,
      seats: booking.seats.map((s) => s.number), status: booking.status, amount: booking.total
    }
  };
}

function posterPath(posterUrl) {
  if (!posterUrl || !posterUrl.startsWith('/')) return null;
  if (!['.png', '.jpg', '.jpeg'].includes(path.extname(posterUrl).toLowerCase())) return null;
  const candidate = path.resolve(__dirname, '..', '..', 'frontend', 'public', `.${posterUrl}`);
  return fs.existsSync(candidate) ? candidate : null;
}

async function streamPdf(ticket, res) {
  const qrBuffer = await QRCode.toBuffer(ticket.code, { margin: 1, width: 240, color: { dark: '#0B0B0F', light: '#FFFFFF' } });
  const doc = new PDFDocument({ size: 'A5', margin: 0 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="CineBook-${ticket.reference}.pdf"`);
  doc.pipe(res);

  const W = 420;
  const H = 595;
  doc.rect(0, 0, W, H).fill('#0B0B0F');
  doc.rect(0, 0, W, 96).fill('#E50914');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(28).text('CINEBOOK', 28, 30);
  doc.font('Helvetica').fontSize(10).fillColor('#FFE6E8').text('DIGITAL MOVIE TICKET', 30, 65);

  const poster = posterPath(ticket.posterUrl);
  if (poster) {
    doc.image(poster, 28, 118, { width: 100, height: 148, fit: [100, 148] });
  } else {
    doc.roundedRect(28, 118, 100, 148, 8).fill('#17171F');
  }
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text(ticket.movieTitle, 146, 122, { width: 246 });
  doc.font('Helvetica').fontSize(10).fillColor('#F5C542').text(`${ticket.date}  |  ${ticket.time}`, 146, 152);
  doc.fillColor('#C9C9D4').fontSize(10).text(ticket.theatreName, 146, 172, { width: 245 });
  doc.text(`${ticket.theatreAddress}, ${ticket.city}`, 146, 188, { width: 245 });
  doc.text(`Screen: ${ticket.screen}`, 146, 218);
  doc.text(`Seats: ${ticket.seats.join(', ')}`, 146, 234);
  doc.text(`Category: ${ticket.seatTypes.join(', ')}`, 146, 250);

  doc.moveTo(28, 286).lineTo(W - 28, 286).strokeColor('#2C2C38').stroke();
  doc.fillColor('#A3A3B2').fontSize(9).text('BOOKING ID', 28, 300);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text(ticket.reference, 28, 314);
  doc.fillColor('#A3A3B2').font('Helvetica').fontSize(9).text('CUSTOMER', 230, 300);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text(ticket.customerName, 230, 314);
  doc.fillColor('#A3A3B2').font('Helvetica').fontSize(9).text('AMOUNT PAID', 28, 342);
  doc.fillColor('#F5C542').font('Helvetica-Bold').fontSize(14).text(`INR ${ticket.amount.toFixed(2)}`, 28, 356);
  if (ticket.paymentId) {
    doc.fillColor('#A3A3B2').font('Helvetica').fontSize(8).text(`Payment: ${ticket.paymentId}`, 230, 358, { width: 160 });
  }

  doc.roundedRect(126, 390, 168, 168, 10).fill('#FFFFFF');
  doc.image(qrBuffer, 132, 396, { width: 156, height: 156 });
  doc.fillColor('#A3A3B2').font('Helvetica').fontSize(8).text('Scan at the theatre entrance', 0, 566, { width: W, align: 'center' });
  doc.end();
}

module.exports = { buildTicket, verifyTicket, streamPdf };
