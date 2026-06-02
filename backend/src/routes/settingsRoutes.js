const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/authMiddleware');

// GET all settings
router.get('/', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM settings ORDER BY key');
    const obj = {};
    rows.forEach(r => obj[r.key] = r.value);
    res.json(obj);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET branding (readable by ANY authenticated user – needed to render the UI)
const BRANDING_KEYS = ['brand_name', 'brand_logo_url', 'brand_favicon_url', 'brand_primary_color'];
router.get('/branding', authMiddleware, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings WHERE key = ANY($1)', [BRANDING_KEYS]);
    const obj = { brand_name: '', brand_logo_url: '', brand_favicon_url: '', brand_primary_color: '' };
    rows.forEach(r => obj[r.key] = r.value);
    res.json(obj);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT upsert a setting
router.put('/:key', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { value } = req.body;
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
      [req.params.key, value]);
    res.json({ key: req.params.key, value });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST test discord webhook
router.post('/test-discord', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key='discord_webhook_url'");
    const url = rows[0]?.value;
    if (!url) return res.status(400).json({ error: 'Discord webhook URL not configured' });

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '✅ Webhook Test Successful',
          description: 'Your ticket system Discord integration is working!',
          color: 0x22c55e,
          timestamp: new Date().toISOString(),
        }]
      })
    });
    if (!resp.ok) return res.status(400).json({ error: `Discord returned ${resp.status}` });
    res.json({ message: 'Test notification sent!' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

module.exports = router;
