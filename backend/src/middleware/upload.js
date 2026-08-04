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

// ─── Magic-byte validation ────────────────────────────────────────────────────
// fileFilter above only checks the client-supplied `Content-Type` header, which
// is trivially spoofable — a request can label arbitrary content (HTML/SVG,
// executables, etc.) as image/png or application/pdf and have it pass straight
// through to disk. multer's fileFilter runs before the file is written (no
// bytes available yet with diskStorage), so the actual signature can only be
// checked once multerBase has finished writing the file — done in
// compressUpload below, before compressImage/next() run.
const MAGIC_BYTES = {
  'image/jpeg':      [0xFF, 0xD8, 0xFF],
  'image/png':       [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // "%PDF"
};

const matchesDeclaredType = (file) => {
  const signature = MAGIC_BYTES[file.mimetype];
  if (!signature) return false;
  const fd = fs.openSync(file.path, 'r');
  try {
    const buf = Buffer.alloc(signature.length);
    fs.readSync(fd, buf, 0, signature.length, 0);
    return signature.every((byte, i) => buf[i] === byte);
  } finally {
    fs.closeSync(fd);
  }
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
      if (req.file && !matchesDeclaredType(req.file)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, message: 'File content does not match its declared type' });
      }
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
