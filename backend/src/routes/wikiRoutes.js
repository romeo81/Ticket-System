const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/authMiddleware');
const notifier = require('../discordNotifier');

// resolve author display name (token only carries username)
async function authorName(userId) {
  try {
    const { rows } = await pool.query('SELECT full_name, username FROM users WHERE id=$1', [userId]);
    return rows.length ? (rows[0].full_name || rows[0].username) : null;
  } catch { return null; }
}

// LIST
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { category, search } = req.query;
    let q = `SELECT w.*, u.full_name as author_name FROM wiki_articles w LEFT JOIN users u ON w.author_id=u.id WHERE 1=1`;
    const params = [];
    if (category) { params.push(category); q += ` AND w.category=$${params.length}`; }
    if (search)   { params.push(`%${search}%`); q += ` AND (w.title ILIKE $${params.length} OR w.body ILIKE $${params.length})`; }
    q += ' ORDER BY w.updated_at DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET ONE
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT w.*, u.full_name as author_name FROM wiki_articles w LEFT JOIN users u ON w.author_id=u.id WHERE w.id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Article not found' });
    const links = await pool.query(
      'SELECT t.id, t.ticket_key, t.title, t.status FROM wiki_ticket_links l JOIN tickets t ON l.ticket_id=t.id WHERE l.wiki_id=$1', [req.params.id]);
    res.json({ ...rows[0], linked_tickets: links.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// CREATE
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, body, category } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO wiki_articles (title, body, category, author_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [title, body, category, req.user.id]);
    notifier.notify('wiki_created', { ...rows[0], author_name: await authorName(req.user.id) });
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// UPDATE
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, body, category } = req.body;
    const { rows } = await pool.query(
      'UPDATE wiki_articles SET title=COALESCE($1,title), body=COALESCE($2,body), category=COALESCE($3,category), updated_at=NOW() WHERE id=$4 RETURNING *',
      [title, body, category, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Article not found' });
    notifier.notify('wiki_updated', { ...rows[0], author_name: await authorName(rows[0].author_id) });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM wiki_articles WHERE id=$1', [req.params.id]);
    res.json({ message: 'Article deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
