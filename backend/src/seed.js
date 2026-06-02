const { pool } = require('./db');
const { hashPassword } = require('./auth');

async function seed() {
  const client = await pool.connect();
  try {
    // Check if already seeded
    const { rows } = await client.query("SELECT id FROM users WHERE username='admin'");
    if (rows.length) { console.log('ℹ️  Seed data already exists – skipping'); return; }

    const adminHash = await hashPassword('admin123');
    const techHash  = await hashPassword('tech123');

    // Users
    await client.query(`
      INSERT INTO users (username, email, password_hash, full_name, role) VALUES
        ('admin',   'admin@company.com',   $1, 'Admin User',    'admin'),
        ('jsmith',  'jsmith@company.com',  $2, 'John Smith',    'user'),
        ('agarcia', 'agarcia@company.com', $2, 'Ana Garcia',    'user'),
        ('bwong',   'bwong@company.com',   $2, 'Brian Wong',    'user')
    `, [adminHash, techHash]);

    // Epics
    await client.query(`
      INSERT INTO epics (name, description, color, created_by) VALUES
        ('Platform Redesign',    'Complete UI overhaul of the platform',        '#6366f1', 1),
        ('API v2 Migration',     'Migrate all endpoints to v2 API',            '#f59e0b', 1),
        ('Security Hardening',   'Implement SOC2 compliance requirements',     '#ef4444', 1)
    `);

    // Sprints
    await client.query(`
      INSERT INTO sprints (name, goal, status, start_date, end_date, created_by) VALUES
        ('Sprint 1 – Foundation', 'Set up core infrastructure',  'completed', '2026-05-01', '2026-05-14', 1),
        ('Sprint 2 – Features',   'Build main feature set',      'active',    '2026-05-15', '2026-05-28', 1),
        ('Sprint 3 – Polish',     'Bug fixes and polish',        'planning',  '2026-05-29', '2026-06-11', 1)
    `);

    // Tickets
    await client.query(`
      INSERT INTO tickets (ticket_key, title, description, status, priority, type, assignee_id, reporter_id, epic_id, sprint_id, labels, tags) VALUES
        ('TKT-1', 'Set up CI/CD pipeline',           'Configure GitHub Actions for automated testing and deployment', 'Open',        'High',     'Task',    2, 1, 2, 2, '{devops,infra}',         '{backend}'),
        ('TKT-2', 'Fix login session timeout',       'Users are being logged out after 5 minutes instead of 30',      'In Progress', 'Critical', 'Bug',     3, 1, 3, 2, '{auth,bug}',             '{frontend,backend}'),
        ('TKT-3', 'Design new dashboard layout',     'Create mockups for the redesigned dashboard',                   'Open',        'Medium',   'Story',   4, 1, 1, 2, '{design,ui}',            '{frontend}'),
        ('TKT-4', 'Add email notification system',   'Implement transactional emails for ticket updates',             'Open',        'Medium',   'Feature', 2, 3, 2, 3, '{notifications}',        '{backend}'),
        ('TKT-5', 'Database query optimization',     'Optimize slow queries identified in monitoring',                'Closed',      'High',     'Task',    3, 1, 2, 1, '{performance,database}', '{backend}'),
        ('TKT-6', 'Update API documentation',        'Document all new v2 API endpoints',                             'In Progress', 'Low',      'Task',    4, 2, 2, 2, '{docs}',                 '{backend}'),
        ('TKT-7', 'Implement role-based access',     'Add RBAC to all API endpoints',                                 'Open',        'High',     'Feature', 2, 1, 3, 3, '{security,auth}',        '{backend}'),
        ('TKT-8', 'Mobile responsive fixes',         'Fix layout issues on tablets and phones',                        'Open',        'Medium',   'Bug',     4, 3, 1, 2, '{mobile,ui}',            '{frontend}')
    `);
    await client.query("SELECT setval('ticket_seq', 8)");

    // Comments
    await client.query(`
      INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES
        (2, 1, 'This is critical – affecting all users. Please prioritize.'),
        (2, 3, 'Found the issue. The token expiry was set to 300s instead of 1800s.'),
        (5, 3, 'Added indexes on the tickets and comments tables. Queries are 10x faster now.'),
        (5, 1, 'Great work! Closing this ticket.')
    `);

    // Wiki articles
    await client.query(`
      INSERT INTO wiki_articles (title, body, category, author_id) VALUES
        ('Getting Started Guide',
         '# Getting Started\n\nWelcome to the ticket system! This guide will help you get up and running.\n\n## Creating a Ticket\n1. Click "New Ticket" from the dashboard\n2. Fill in the title and description\n3. Set priority and assign to a team member\n4. Click Submit\n\n## Ticket Statuses\n- **Open**: Newly created, not yet started\n- **In Progress**: Currently being worked on\n- **Closed**: Completed or resolved',
         'Onboarding', 1),
        ('API v2 Migration Checklist',
         '# API v2 Migration\n\n## Endpoints to Migrate\n- [x] /api/users\n- [x] /api/tickets\n- [ ] /api/reports\n- [ ] /api/webhooks\n\n## Breaking Changes\n- Pagination now uses cursor-based approach\n- Auth tokens must be sent in Authorization header\n- Response envelope changed from data[] to items[]',
         'Engineering', 2),
        ('Troubleshooting Common Issues',
         '# Troubleshooting\n\n## Login Issues\nIf you cannot log in, try clearing your browser cache and cookies.\n\n## Slow Performance\nCheck the monitoring dashboard for any spikes in database query times.\n\n## File Upload Failures\nEnsure files are under 50MB and are in a supported format (PNG, JPG, PDF).',
         'Support', 1)
    `);

    // Link wiki to tickets
    await client.query(`
      INSERT INTO wiki_ticket_links (wiki_id, ticket_id) VALUES
        (2, 6),
        (3, 2)
    `);

    console.log('🌱  Seed data inserted');
  } finally {
    client.release();
  }
}

module.exports = { seed };
