const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/authMiddleware');
const notifier = require('../discordNotifier');

router.get('/', authMiddleware, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.*, u.full_name as creator_name,
             (SELECT COUNT(*) FROM tickets t WHERE t.epic_id=e.id) as ticket_count
      FROM epics e LEFT JOIN users u ON e.created_by=u.id ORDER BY e.created_at DESC`);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO epics (name, description, color, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, description, color || '#6366f1', req.user.id]);
    notifier.notify('epic_created', rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, description, color, status } = req.body;
    const { rows } = await pool.query(
      'UPDATE epics SET name=COALESCE($1,name), description=COALESCE($2,description), color=COALESCE($3,color), status=COALESCE($4,status) WHERE id=$5 RETURNING *',
      [name, description, color, status, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Epic not found' });
    notifier.notify('epic_updated', rows[0]);
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM epics WHERE id=$1', [req.params.id]);
    res.json({ message: 'Epic deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
