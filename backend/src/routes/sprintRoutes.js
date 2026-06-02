const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/authMiddleware');
const notifier = require('../discordNotifier');

router.get('/', authMiddleware, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, u.full_name as creator_name,
             (SELECT COUNT(*) FROM tickets t WHERE t.sprint_id=s.id) as ticket_count
      FROM sprints s LEFT JOIN users u ON s.created_by=u.id ORDER BY s.start_date DESC NULLS LAST`);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, goal, status, start_date, end_date } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO sprints (name, goal, status, start_date, end_date, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, goal, status || 'planning', start_date, end_date, req.user.id]);
    if ((status || 'planning') === 'active') notifier.notify('sprint_started', rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, goal, status, start_date, end_date } = req.body;
    const prev = await pool.query('SELECT status FROM sprints WHERE id=$1', [req.params.id]);
    const oldStatus = prev.rows.length ? prev.rows[0].status : null;
    const { rows } = await pool.query(
      'UPDATE sprints SET name=COALESCE($1,name), goal=COALESCE($2,goal), status=COALESCE($3,status), start_date=COALESCE($4,start_date), end_date=COALESCE($5,end_date) WHERE id=$6 RETURNING *',
      [name, goal, status, start_date, end_date, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Sprint not found' });
    if (status && status !== oldStatus) {
      if (status === 'active')         notifier.notify('sprint_started', rows[0]);
      else if (status === 'completed') notifier.notify('sprint_completed', rows[0]);
    }
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM sprints WHERE id=$1', [req.params.id]);
    res.json({ message: 'Sprint deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
