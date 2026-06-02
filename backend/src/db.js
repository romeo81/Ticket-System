const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Prevent an idle-client error (e.g. Postgres restarted) from crashing the
// whole process with an uncaught 'error' event.
pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err.message));

async function bootstrap() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Users
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(100) UNIQUE NOT NULL,
        email         VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name     VARCHAR(255),
        role          VARCHAR(50) DEFAULT 'user',
        avatar_url    TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );

      -- Settings (key-value store for app config)
      CREATE TABLE IF NOT EXISTS settings (
        key   VARCHAR(255) PRIMARY KEY,
        value TEXT
      );

      -- Epics
      CREATE TABLE IF NOT EXISTS epics (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        description TEXT,
        color       VARCHAR(20) DEFAULT '#6366f1',
        status      VARCHAR(50) DEFAULT 'active',
        created_by  INT REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      -- Sprints
      CREATE TABLE IF NOT EXISTS sprints (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        goal        TEXT,
        status      VARCHAR(50) DEFAULT 'planning',
        start_date  DATE,
        end_date    DATE,
        created_by  INT REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      -- Tickets
      CREATE TABLE IF NOT EXISTS tickets (
        id          SERIAL PRIMARY KEY,
        ticket_key  VARCHAR(20) UNIQUE NOT NULL,
        title       VARCHAR(500) NOT NULL,
        description TEXT,
        status      VARCHAR(50) DEFAULT 'Open',
        priority    VARCHAR(50) DEFAULT 'Medium',
        type        VARCHAR(50) DEFAULT 'Task',
        assignee_id INT REFERENCES users(id),
        reporter_id INT REFERENCES users(id),
        epic_id     INT REFERENCES epics(id),
        sprint_id   INT REFERENCES sprints(id),
        labels      TEXT[] DEFAULT '{}',
        tags        TEXT[] DEFAULT '{}',
        due_date    DATE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );

      -- Ticket comments
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id         SERIAL PRIMARY KEY,
        ticket_id  INT REFERENCES tickets(id) ON DELETE CASCADE,
        user_id    INT REFERENCES users(id),
        body       TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Ticket attachments
      CREATE TABLE IF NOT EXISTS ticket_attachments (
        id           SERIAL PRIMARY KEY,
        ticket_id    INT REFERENCES tickets(id) ON DELETE CASCADE,
        user_id      INT REFERENCES users(id),
        filename     VARCHAR(500),
        original_name VARCHAR(500),
        mime_type    VARCHAR(100),
        size         INT,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      -- Wiki articles
      CREATE TABLE IF NOT EXISTS wiki_articles (
        id          SERIAL PRIMARY KEY,
        title       VARCHAR(500) NOT NULL,
        body        TEXT,
        category    VARCHAR(100),
        author_id   INT REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );

      -- Wiki ↔ Ticket links
      CREATE TABLE IF NOT EXISTS wiki_ticket_links (
        id         SERIAL PRIMARY KEY,
        wiki_id    INT REFERENCES wiki_articles(id) ON DELETE CASCADE,
        ticket_id  INT REFERENCES tickets(id) ON DELETE CASCADE,
        UNIQUE(wiki_id, ticket_id)
      );

      -- Discord notification configuration (per notification type)
      CREATE TABLE IF NOT EXISTS discord_notification_config (
        notification_type VARCHAR(50) PRIMARY KEY,
        enabled           BOOLEAN DEFAULT TRUE,
        webhook_url       TEXT,
        message_prefix    TEXT DEFAULT '',
        mention           VARCHAR(255) DEFAULT '',
        embed_color       VARCHAR(20),
        include_thumbnail BOOLEAN DEFAULT FALSE,
        fields            JSONB,
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      );

      -- Ticket key sequence
      CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1;
    `);
    console.log('✅  Database schema bootstrapped');
  } finally {
    client.release();
  }
}

module.exports = { pool, bootstrap };
