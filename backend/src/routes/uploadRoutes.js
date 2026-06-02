const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const { pool } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/authMiddleware');

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
// Dedicated subdirectory for branding assets (logo / favicon).
const brandingDir = path.join(uploadDir, 'branding');
try { fs.mkdirSync(brandingDir, { recursive: true }); } catch (_e) { /* ignore */ }

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  }
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/png','image/jpeg','image/gif','image/webp','application/pdf'];
  cb(null, allowed.includes(file.mimetype));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// Image-only filter for avatars
const imageFilter = (_req, file, cb) => {
  const allowed = ['image/png','image/jpeg','image/gif','image/webp'];
  cb(null, allowed.includes(file.mimetype));
};
const avatarUpload = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Branding assets (logo / favicon): images incl. SVG + ICO, stored in branding/ subdir.
const brandingStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, brandingDir),
  filename: (_req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    // Derive a sensible extension when the original name lacks one.
    if (!ext) {
      const map = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
        'image/svg+xml': '.svg', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico' };
      ext = map[file.mimetype] || '';
    }
    cb(null, `${uuid()}${ext}`);
  }
});
const brandingFilter = (_req, file, cb) => {
  const allowed = [
    'image/png', 'image/jpeg', 'image/jpg', 'image/gif',
    'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/webp'
  ];
  cb(null, allowed.includes(file.mimetype));
};
const brandingUpload = multer({ storage: brandingStorage, fileFilter: brandingFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/upload/branding  (admin-only: upload a logo/favicon, returns its URL)
router.post('/branding', authMiddleware, adminOnly, (req, res) => {
  brandingUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Branding assets must be 5MB or smaller.' });
      }
      console.error(err);
      return res.status(400).json({ error: 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No valid image uploaded. Allowed formats: PNG, JPG, JPEG, SVG, ICO, GIF (max 5MB).' });
    }
    res.status(201).json({
      url: `/uploads/branding/${req.file.filename}`,
      filename: req.file.originalname,
      size: req.file.size
    });
  });
});

// POST /api/upload/avatar  (upload an avatar image, returns its URL)
router.post('/avatar', authMiddleware, avatarUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No valid image uploaded. Allowed: PNG, JPG, GIF, WEBP (max 5MB)' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/upload/:ticketId
router.post('/:ticketId', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No valid file uploaded. Allowed: PNG, JPG, GIF, WEBP, PDF' });
    const { rows } = await pool.query(
      'INSERT INTO ticket_attachments (ticket_id, user_id, filename, original_name, mime_type, size) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.ticketId, req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size]
    );
    res.status(201).json({ ...rows[0], url: `/uploads/${req.file.filename}` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/upload/:attachmentId
router.delete('/:attachmentId', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM ticket_attachments WHERE id=$1 RETURNING filename', [req.params.attachmentId]);
    if (rows.length) {
      const fs = require('fs');
      const fp = path.join(uploadDir, rows[0].filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    res.json({ message: 'Attachment deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
