const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { cloudinary, configured } = require('../config/cloudinary');
const { AppError } = require('../middleware/errorHandler');
const config = require('../config/env');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new AppError('Only image files are allowed.', 400, 'INVALID_FILE'));
    cb(null, true);
  }
}).single('poster');

async function saveImage(file, folder = 'cinebook') {
  if (!file) return null;
  if (configured) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image', transformation: [{ width: 900, height: 1350, crop: 'limit' }] },
        (error, result) => (error ? reject(error) : resolve(result.secure_url))
      );
      stream.end(file.buffer);
    });
  }
  const dir = path.resolve(__dirname, '..', config.uploadDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return `/uploads/${filename}`;
}

module.exports = { upload, saveImage, cloudinaryConfigured: configured };
