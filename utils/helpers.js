const crypto = require('crypto');

function generateBookingRef() {
  const random = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `CB${Date.now().toString(36).toUpperCase()}${random}`;
}

function generateSessionId() {
  return crypto.randomUUID();
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function toDateString(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toTimeString(value) {
  if (!value) return null;
  const str = String(value);
  return str.slice(0, 5);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function dateRange(days = 14) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

module.exports = { generateBookingRef, generateSessionId, money, toDateString, toTimeString, parseJson, dateRange };
