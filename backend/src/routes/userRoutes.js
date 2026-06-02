const router = require('express').Router();
const { pool } = require('../db');
const { hashPassword, comparePassword } = require('../auth');
const { authMiddleware, adminOnly } = require('../middleware/authMiddleware');
const notifier = require('../discordNotifier');

// GET /api/users
router.get('/', authMiddleware, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, username, email, full_name, role, avatar_url, created_at FROM users ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users  (admin create user)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { username, email, password, full_name, role } = req.body;
    const hash = await hashPassword(password);
    const { rows } = await pool.query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, email, full_name, role',
      [username, email, hash, full_name, role || 'user']
    );
    notifier.notify('user_created', rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username or email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { username, email, full_name, role } = req.body;
    const { rows } = await pool.query(
      'UPDATE users SET username=COALESCE($1,username), email=COALESCE($2,email), full_name=COALESCE($3,full_name), role=COALESCE($4,role) WHERE id=$5 RETURNING id, username, email, full_name, role',
      [username, email, full_name, role, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/me/avatar  (self update avatar URL)
router.put('/me/avatar', authMiddleware, async (req, res) => {
  try {
    let { avatar_url } = req.body;
    if (avatar_url !== null && avatar_url !== undefined) {
      avatar_url = String(avatar_url).trim();
      if (avatar_url === '') avatar_url = null;
      if (avatar_url && avatar_url.length > 2048) {
        return res.status(400).json({ error: 'Avatar URL is too long (max 2048 characters)' });
      }
      // Allow absolute http(s) URLs or our own uploaded paths (/uploads/...)
      if (avatar_url && !/^https?:\/\//i.test(avatar_url) && !avatar_url.startsWith('/uploads/')) {
        return res.status(400).json({ error: 'Avatar must be a valid http(s) URL or an uploaded image' });
      }
    } else {
      avatar_url = null;
    }
    const { rows } = await pool.query(
      'UPDATE users SET avatar_url=$1 WHERE id=$2 RETURNING id, username, email, full_name, role, avatar_url',
      [avatar_url, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/me/password  (self password change – requires current password)
router.put('/me/password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Verify current password
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await comparePassword(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    // Update password
    const hash = await hashPassword(new_password);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/reset-password  (admin reset – no current password needed)
router.put('/:id/reset-password', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password) {
      return res.status(400).json({ error: 'New password is required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Verify user exists
    const { rows } = await pool.query('SELECT id FROM users WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const hash = await hashPassword(new_password);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/users/:id  (admin-only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  // Guard: an admin cannot delete their own account.
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const client = await pool.connect();
  try {
    // Make sure the target user exists (and learn their role).
    const target = await client.query('SELECT id, username, role FROM users WHERE id=$1', [targetId]);
    if (!target.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const targetUser = target.rows[0];

    // Guard: never remove the last remaining admin.
    if (targetUser.role === 'admin') {
      const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE role='admin'");
      if (rows[0].count <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin user' });
      }
    }

    // Detach the user from everything that references them so the FK
    // constraints don't block the delete. These columns are all nullable, so
    // historical records (tickets, comments, epics, etc.) are preserved with an
    // "unassigned" author/owner instead of being destroyed.
    await client.query('BEGIN');
    await client.query('UPDATE tickets            SET assignee_id=NULL WHERE assignee_id=$1', [targetId]);
    await client.query('UPDATE tickets            SET reporter_id=NULL WHERE reporter_id=$1', [targetId]);
    await client.query('UPDATE ticket_comments    SET user_id=NULL     WHERE user_id=$1',     [targetId]);
    await client.query('UPDATE ticket_attachments SET user_id=NULL     WHERE user_id=$1',     [targetId]);
    await client.query('UPDATE epics              SET created_by=NULL  WHERE created_by=$1',  [targetId]);
    await client.query('UPDATE sprints            SET created_by=NULL  WHERE created_by=$1',  [targetId]);
    await client.query('UPDATE wiki_articles      SET author_id=NULL   WHERE author_id=$1',   [targetId]);
    const del = await client.query('DELETE FROM users WHERE id=$1 RETURNING id', [targetId]);
    await client.query('COMMIT');

    if (!del.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: `User "${targetUser.username}" deleted successfully` });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
