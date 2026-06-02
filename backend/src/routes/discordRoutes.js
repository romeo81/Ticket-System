const router = require('express').Router();
const { authMiddleware, adminOnly } = require('../middleware/authMiddleware');
const notifier = require('../discordNotifier');

// GET /api/discord/configs  – all notification configs + metadata (admin)
router.get('/configs', authMiddleware, adminOnly, async (_req, res) => {
  try {
    const configs = await notifier.getAllConfigs();
    const defaultWebhook = await notifier.getDefaultWebhook();
    res.json({ configs, default_webhook_configured: !!defaultWebhook });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/discord/configs/:type  – update one config (admin)
router.put('/configs/:type', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { type } = req.params;
    if (!notifier.DEFINITIONS[type]) return res.status(404).json({ error: 'Unknown notification type' });

    const { webhook_url, embed_color } = req.body;
    // Validation
    if (webhook_url && !/^https?:\/\//i.test(webhook_url.trim())) {
      return res.status(400).json({ error: 'Webhook URL must be a valid http(s) URL' });
    }
    if (embed_color && !/^#?[0-9a-fA-F]{6}$/.test(String(embed_color).trim())) {
      return res.status(400).json({ error: 'Embed color must be a valid 6-digit hex color (e.g. #6366f1)' });
    }

    await notifier.saveConfig(type, req.body);
    const config = await notifier.getConfig(type);
    res.json({ ...notifier.typeMeta(type), config });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message || 'Server error' }); }
});

// POST /api/discord/configs/:type/preview  – build payload without sending (admin)
router.post('/configs/:type/preview', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { type } = req.params;
    if (!notifier.DEFINITIONS[type]) return res.status(404).json({ error: 'Unknown notification type' });
    // Use the (unsaved) config from the request body merged onto stored config
    const stored = await notifier.getConfig(type);
    const override = { ...stored, ...(req.body || {}) };
    const payload = await notifier.buildPayload(type, notifier.sampleData(type), override);
    res.json(payload);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message || 'Server error' }); }
});

// POST /api/discord/configs/:type/test  – send a test notification (admin)
router.post('/configs/:type/test', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { type } = req.params;
    if (!notifier.DEFINITIONS[type]) return res.status(404).json({ error: 'Unknown notification type' });
    // Allow testing with the current (possibly unsaved) form values
    const stored = await notifier.getConfig(type);
    const override = req.body && Object.keys(req.body).length ? { ...stored, ...req.body } : null;
    await notifier.sendTest(type, override);
    res.json({ message: 'Test notification sent to Discord!' });
  } catch (err) {
    console.error('test error:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  }
});

// POST /api/discord/configs/:type/reset  – revert to defaults (admin)
router.post('/configs/:type/reset', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { type } = req.params;
    if (!notifier.DEFINITIONS[type]) return res.status(404).json({ error: 'Unknown notification type' });
    await notifier.resetConfig(type);
    const config = await notifier.getConfig(type);
    res.json({ ...notifier.typeMeta(type), config });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message || 'Server error' }); }
});

module.exports = router;
