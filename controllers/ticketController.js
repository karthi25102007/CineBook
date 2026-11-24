const ticketService = require('../services/ticketService');
const { ok } = require('../utils/response');

exports.getTicket = async (req, res) => {
  const ticket = await ticketService.buildTicket(req.params.bookingId, req.user);
  ok(res, { ticket }, 'Ticket generated.');
};

exports.downloadPdf = async (req, res) => {
  const ticket = await ticketService.buildTicket(req.params.bookingId, req.user);
  await ticketService.streamPdf(ticket, res);
};

exports.verify = async (req, res) => {
  ok(res, await ticketService.verifyTicket(req.body.code), 'QR code verified.');
};

module.exports = require('../middleware/errorHandler').wrapControllers(module.exports);
