const router = require('express').Router();
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/authMiddleware');
const notifier = require('../discordNotifier');

// Fetch a ticket enriched with joined names (for notification payloads)
async function enrichedTicket(id) {
  const { rows } = await pool.query(`
    SELECT t.*, u1.full_name as assignee_name, u2.full_name as reporter_name,
           e.name as epic_name, s.name as sprint_name
    FROM tickets t
    LEFT JOIN users u1 ON t.assignee_id=u1.id
    LEFT JOIN users u2 ON t.reporter_id=u2.id
    LEFT JOIN epics e  ON t.epic_id=e.id
    LEFT JOIN sprints s ON t.sprint_id=s.id
    WHERE t.id=$1`, [id]);
  return rows[0];
}

// ─── LIST ────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, priority, assignee_id, epic_id, sprint_id, search } = req.query;
    let q = `SELECT t.*, u1.full_name as assignee_name, u1.username as assignee_username, u1.avatar_url as assignee_avatar,
                    u2.full_name as reporter_name, u2.username as reporter_username, u2.avatar_url as reporter_avatar,
                    e.name as epic_name, s.name as sprint_name
             FROM tickets t
             LEFT JOIN users u1 ON t.assignee_id=u1.id
             LEFT JOIN users u2 ON t.reporter_id=u2.id
             LEFT JOIN epics e  ON t.epic_id=e.id
             LEFT JOIN sprints s ON t.sprint_id=s.id WHERE 1=1`;
    const params = [];
    if (status)      { params.push(status);      q += ` AND t.status=$${params.length}`; }
    if (priority)    { params.push(priority);    q += ` AND t.priority=$${params.length}`; }
    if (assignee_id) { params.push(assignee_id); q += ` AND t.assignee_id=$${params.length}`; }
    if (epic_id)     { params.push(epic_id);     q += ` AND t.epic_id=$${params.length}`; }
    if (sprint_id)   { params.push(sprint_id);   q += ` AND t.sprint_id=$${params.length}`; }
    if (search)      { params.push(`%${search}%`); q += ` AND (t.title ILIKE $${params.length} OR t.ticket_key ILIKE $${params.length})`; }
    q += ' ORDER BY t.created_at DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── GET ONE ─────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, u1.full_name as assignee_name, u1.username as assignee_username, u1.avatar_url as assignee_avatar,
             u2.full_name as reporter_name, u2.username as reporter_username, u2.avatar_url as reporter_avatar,
             e.name as epic_name, s.name as sprint_name
      FROM tickets t
      LEFT JOIN users u1 ON t.assignee_id=u1.id
      LEFT JOIN users u2 ON t.reporter_id=u2.id
      LEFT JOIN epics e  ON t.epic_id=e.id
      LEFT JOIN sprints s ON t.sprint_id=s.id
      WHERE t.id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ticket not found' });

    const comments = await pool.query(
      'SELECT c.*, u.full_name as author_name, u.username as author_username, u.avatar_url as author_avatar FROM ticket_comments c LEFT JOIN users u ON c.user_id=u.id WHERE c.ticket_id=$1 ORDER BY c.created_at', [req.params.id]);
    const attachments = await pool.query(
      'SELECT * FROM ticket_attachments WHERE ticket_id=$1 ORDER BY created_at', [req.params.id]);
    const wikiLinks = await pool.query(
      'SELECT w.id, w.title, w.category FROM wiki_ticket_links l JOIN wiki_articles w ON l.wiki_id=w.id WHERE l.ticket_id=$1', [req.params.id]);

    res.json({ ...rows[0], comments: comments.rows, attachments: attachments.rows, wiki_links: wikiLinks.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── CREATE ──────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, status, priority, type, assignee_id, epic_id, sprint_id, labels, tags, due_date } = req.body;
    const keyRes = await pool.query("SELECT nextval('ticket_seq')");
    const key = `TKT-${keyRes.rows[0].nextval}`;
    const { rows } = await pool.query(
      `INSERT INTO tickets (ticket_key, title, description, status, priority, type, assignee_id, reporter_id, epic_id, sprint_id, labels, tags, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [key, title, description, status||'Open', priority||'Medium', type||'Task', assignee_id||null, req.user.id, epic_id||null, sprint_id||null, labels||[], tags||[], due_date||null]
    );
    notifier.notify('ticket_created', await enrichedTicket(rows[0].id));
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── UPDATE ──────────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, status, priority, type, assignee_id, epic_id, sprint_id, labels, tags, due_date } = req.body;
    // fetch old status to detect close
    const old = await pool.query('SELECT * FROM tickets WHERE id=$1', [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Ticket not found' });

    const { rows } = await pool.query(
      `UPDATE tickets SET title=COALESCE($1,title), description=COALESCE($2,description), status=COALESCE($3,status),
         priority=COALESCE($4,priority), type=COALESCE($5,type), assignee_id=COALESCE($6,assignee_id),
         epic_id=COALESCE($7,epic_id), sprint_id=COALESCE($8,sprint_id),
         labels=COALESCE($9,labels), tags=COALESCE($10,tags), due_date=COALESCE($11,due_date),
         updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [title, description, status, priority, type, assignee_id, epic_id, sprint_id, labels, tags, due_date, req.params.id]
    );
    // Fire the relevant notifications based on what changed
    const before = old.rows[0];
    const after = rows[0];
    const enriched = await enrichedTicket(after.id);

    if (after.status === 'Closed' && before.status !== 'Closed') {
      notifier.notify('ticket_closed', enriched);
    } else if (after.status !== before.status) {
      notifier.notify('ticket_updated', enriched);
    }
    if (String(after.assignee_id || '') !== String(before.assignee_id || '') && after.assignee_id) {
      notifier.notify('ticket_assigned', enriched);
    }
    if (after.priority !== before.priority) {
      notifier.notify('ticket_priority_changed', enriched);
    }
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── DELETE ──────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM tickets WHERE id=$1', [req.params.id]);
    res.json({ message: 'Ticket deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── COMMENTS ────────────────────────────────────────────────
router.post('/:id/comments', authMiddleware, async (req, res) => {
  try {
    const { body } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, req.user.id, body]
    );
    // Notify with enriched ticket + comment context
    const enriched = await enrichedTicket(req.params.id);
    if (enriched) {
      const authorRes = await pool.query('SELECT full_name, username FROM users WHERE id=$1', [req.user.id]);
      const author = authorRes.rows[0];
      notifier.notify('comment_added', {
        ...enriched,
        comment_body: body,
        comment_author: author ? (author.full_name || author.username) : 'Someone',
      });
    }
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── WIKI LINK ───────────────────────────────────────────────
router.post('/:id/wiki-link', authMiddleware, async (req, res) => {
  try {
    const { wiki_id } = req.body;
    await pool.query('INSERT INTO wiki_ticket_links (wiki_id, ticket_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [wiki_id, req.params.id]);
    res.status(201).json({ message: 'Linked' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id/wiki-link/:wikiId', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM wiki_ticket_links WHERE wiki_id=$1 AND ticket_id=$2', [req.params.wikiId, req.params.id]);
    res.json({ message: 'Unlinked' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
