const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const controller = require('../controllers/ticketController');

const router = express.Router();

router.get('/:bookingId', protect, controller.getTicket);
router.get('/:bookingId/pdf', protect, controller.downloadPdf);
router.post('/verify', protect, [body('code').notEmpty().withMessage('QR code is required.')], validate, controller.verify);

module.exports = router;
