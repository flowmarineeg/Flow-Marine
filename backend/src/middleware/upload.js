'use strict';

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const sharp  = require('sharp');

const uploadDir = path.join(__dirname, '../uploads/expenses');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─── Multer storage ───────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file,  cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPEG, PNG, and PDF files are allowed'), false);
};

const maxSizeMB  = Number(process.env.UPLOAD_MAX_SIZE_MB || 10);
const multerBase = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
}).single('attachment');

// ─── Sharp compression (images only) ─────────────────────────────────────────
const compressImage = async (file) => {
  if (!file) return;

  const isJpeg = file.mimetype === 'image/jpeg';
  const isPng  = file.mimetype === 'image/png';
  if (!isJpeg && !isPng) return; // PDFs and unknowns pass through unchanged

  const filePath = file.path;
  const tmpPath  = filePath + '.tmp';

  try {
    const pipeline = sharp(filePath).resize({
      width:               1920,
      withoutEnlargement:  true,   // never upscale
      fit:                 'inside',
    });

    if (isJpeg) {
      pipeline.jpeg({ quality: 80, progressive: true });
    } else {
      pipeline.png({ compressionLevel: 8 });
    }

    await pipeline.toFile(tmpPath);

    // Replace original with compressed version
    fs.unlinkSync(filePath);
    fs.renameSync(tmpPath, filePath);

    // Update file size so controllers/logs see the compressed size
    const stat  = fs.statSync(filePath);
    file.size   = stat.size;
  } catch (err) {
    // Clean up temp file if it was created; leave original intact
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    throw new Error(`Image compression failed: ${err.message}`);
  }
};

// ─── Combined middleware: multer → sharp ──────────────────────────────────────
/**
 * compressUpload
 * Drop-in replacement for the old uploadExpense middleware.
 * Runs multer first, then compresses JPEG/PNG with Sharp.
 * PDFs are passed through unchanged.
 */
const compressUpload = (req, res, next) => {
  multerBase(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    try {
      await compressImage(req.file);
      next();
    } catch (compressErr) {
      // Remove the file if compression failed to avoid leaving corrupt uploads
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ success: false, message: compressErr.message });
    }
  });
};

module.exports = { compressUpload };
