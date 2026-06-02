/* ──────────────────────────────────────────────────────────────
 * Discord Notifier
 * Flexible, per-notification-type Discord webhook integration.
 * A single source of truth for: notification metadata, available
 * fields, sensible defaults, config merging, embed building and
 * dispatch. Used by the route trigger points and the /api/discord
 * configuration endpoints.
 * ────────────────────────────────────────────────────────────── */
const { pool } = require('./db');

/* ── Field catalogue ───────────────────────────────────────────
 * Each field knows how to extract & format its value from the data
 * object passed at trigger time. Keys are stable identifiers stored
 * in the DB config. */
const FIELD_DEFS = {
  // Ticket
  ticket_key:     { label: 'Ticket Key',  get: d => d.ticket_key },
  title:          { label: 'Title',       get: d => d.title },
  description:    { label: 'Description', get: d => trunc(d.description, 1000) },
  status:         { label: 'Status',      get: d => d.status },
  priority:       { label: 'Priority',    get: d => d.priority },
  type:           { label: 'Type',        get: d => d.type },
  assignee:       { label: 'Assignee',    get: d => d.assignee_name },
  reporter:       { label: 'Reporter',    get: d => d.reporter_name },
  epic:           { label: 'Epic',        get: d => d.epic_name },
  sprint:         { label: 'Sprint',      get: d => d.sprint_name },
  labels:         { label: 'Labels',      get: d => arr(d.labels) },
  tags:           { label: 'Tags',        get: d => arr(d.tags) },
  due_date:       { label: 'Due Date',    get: d => dateOnly(d.due_date) },
  // Comment specific
  comment_author: { label: 'Comment By',  get: d => d.comment_author },
  comment_body:   { label: 'Comment',     get: d => trunc(d.comment_body, 1000) },
  // User
  username:       { label: 'Username',    get: d => d.username },
  full_name:      { label: 'Full Name',   get: d => d.full_name },
  email:          { label: 'Email',       get: d => d.email },
  role:           { label: 'Role',        get: d => d.role },
  // Sprint / Epic
  name:           { label: 'Name',        get: d => d.name },
  goal:           { label: 'Goal',        get: d => trunc(d.goal, 1000) },
  start_date:     { label: 'Start Date',  get: d => dateOnly(d.start_date) },
  end_date:       { label: 'End Date',    get: d => dateOnly(d.end_date) },
  epic_desc:      { label: 'Description', get: d => trunc(d.description, 1000) },
  // Wiki
  category:       { label: 'Category',    get: d => d.category },
  author:         { label: 'Author',      get: d => d.author_name },
  excerpt:        { label: 'Excerpt',     get: d => trunc((d.body || '').replace(/[#*_`>\[\]]/g, ''), 300) },
};

/* ── Fields available per entity category ──────────────────────── */
const TICKET_FIELDS  = ['ticket_key','title','description','status','priority','type','assignee','reporter','epic','sprint','labels','tags','due_date'];
const COMMENT_FIELDS = ['ticket_key','title','status','priority','assignee','comment_author','comment_body'];
const USER_FIELDS    = ['username','full_name','email','role'];
const SPRINT_FIELDS  = ['name','goal','status','start_date','end_date'];
const EPIC_FIELDS    = ['name','epic_desc','status'];
const WIKI_FIELDS    = ['title','category','author','excerpt'];

/* ── Notification type definitions & defaults ──────────────────── */
const DEFINITIONS = {
  ticket_created:          { label: 'Ticket Created',          category: 'ticket',  emoji: '🎫', color: '#22c55e', available: TICKET_FIELDS,  defaultFields: ['ticket_key','title','status','priority','assignee'] },
  ticket_updated:          { label: 'Ticket Updated',          category: 'ticket',  emoji: '✏️', color: '#f59e0b', available: TICKET_FIELDS,  defaultFields: ['ticket_key','title','status','priority','assignee'] },
  ticket_assigned:         { label: 'Ticket Assigned',         category: 'ticket',  emoji: '👤', color: '#3b82f6', available: TICKET_FIELDS,  defaultFields: ['ticket_key','title','assignee','status','priority'] },
  ticket_priority_changed: { label: 'Ticket Priority Changed', category: 'ticket',  emoji: '⚡', color: '#f97316', available: TICKET_FIELDS,  defaultFields: ['ticket_key','title','priority','status'] },
  comment_added:           { label: 'Comment Added',           category: 'comment', emoji: '💬', color: '#3b82f6', available: COMMENT_FIELDS, defaultFields: ['ticket_key','title','comment_author','comment_body'] },
  ticket_closed:           { label: 'Ticket Closed',           category: 'ticket',  emoji: '✅', color: '#ef4444', available: TICKET_FIELDS,  defaultFields: ['ticket_key','title','status','assignee'] },
  user_created:            { label: 'New User Created',        category: 'user',    emoji: '🧑‍💼', color: '#8b5cf6', available: USER_FIELDS,   defaultFields: ['username','full_name','role'] },
  sprint_started:          { label: 'Sprint Started',          category: 'sprint',  emoji: '🏃', color: '#22c55e', available: SPRINT_FIELDS,  defaultFields: ['name','goal','start_date','end_date'] },
  sprint_completed:        { label: 'Sprint Completed',        category: 'sprint',  emoji: '🏁', color: '#10b981', available: SPRINT_FIELDS,  defaultFields: ['name','goal','start_date','end_date'] },
  epic_created:            { label: 'Epic Created',            category: 'epic',    emoji: '🏔️', color: '#6366f1', available: EPIC_FIELDS,    defaultFields: ['name','epic_desc','status'] },
  epic_updated:            { label: 'Epic Updated',            category: 'epic',    emoji: '🛠️', color: '#6366f1', available: EPIC_FIELDS,    defaultFields: ['name','epic_desc','status'] },
  wiki_created:            { label: 'Wiki Article Created',    category: 'wiki',    emoji: '📚', color: '#0ea5e9', available: WIKI_FIELDS,    defaultFields: ['title','category','author','excerpt'] },
  wiki_updated:            { label: 'Wiki Article Updated',    category: 'wiki',    emoji: '📝', color: '#0ea5e9', available: WIKI_FIELDS,    defaultFields: ['title','category','author','excerpt'] },
};

const TYPES = Object.keys(DEFINITIONS);

/* ── Helpers ───────────────────────────────────────────────────── */
function trunc(s, n) { if (!s) return null; s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function arr(a) { return Array.isArray(a) && a.length ? a.join(', ') : null; }
function dateOnly(d) { return d ? String(d).slice(0, 10) : null; }
function hexToInt(hex) {
  if (!hex) return null;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  return m ? parseInt(m[1], 16) : null;
}

/* Default config object for a type (used when no DB row exists) */
function defaultConfig(type) {
  const d = DEFINITIONS[type];
  return {
    notification_type: type,
    enabled: true,
    webhook_url: '',
    message_prefix: '',
    mention: '',
    embed_color: d.color,
    include_thumbnail: false,
    fields: [...d.defaultFields],
  };
}

/* Metadata describing a type (for the UI) */
function typeMeta(type) {
  const d = DEFINITIONS[type];
  return {
    type,
    label: d.label,
    category: d.category,
    emoji: d.emoji,
    default_color: d.color,
    available_fields: d.available.map(k => ({ key: k, label: FIELD_DEFS[k] ? FIELD_DEFS[k].label : k })),
    default_fields: d.defaultFields,
  };
}

/* Read a stored config row merged onto defaults */
async function getConfig(type) {
  if (!DEFINITIONS[type]) return null;
  const base = defaultConfig(type);
  try {
    const { rows } = await pool.query('SELECT * FROM discord_notification_config WHERE notification_type=$1', [type]);
    if (!rows.length) return base;
    const r = rows[0];
    return {
      notification_type: type,
      enabled: r.enabled,
      webhook_url: r.webhook_url || '',
      message_prefix: r.message_prefix || '',
      mention: r.mention || '',
      embed_color: r.embed_color || base.embed_color,
      include_thumbnail: !!r.include_thumbnail,
      fields: Array.isArray(r.fields) ? r.fields : base.fields,
    };
  } catch (e) {
    console.error('getConfig error:', e.message);
    return base;
  }
}

/* All configs + metadata for the UI */
async function getAllConfigs() {
  const { rows } = await pool.query('SELECT * FROM discord_notification_config');
  const byType = {};
  rows.forEach(r => byType[r.notification_type] = r);
  return TYPES.map(type => {
    const base = defaultConfig(type);
    const r = byType[type];
    const config = r ? {
      notification_type: type,
      enabled: r.enabled,
      webhook_url: r.webhook_url || '',
      message_prefix: r.message_prefix || '',
      mention: r.mention || '',
      embed_color: r.embed_color || base.embed_color,
      include_thumbnail: !!r.include_thumbnail,
      fields: Array.isArray(r.fields) ? r.fields : base.fields,
    } : base;
    return { ...typeMeta(type), config };
  });
}

/* Persist (upsert) a config for a type */
async function saveConfig(type, c) {
  if (!DEFINITIONS[type]) throw new Error('Unknown notification type');
  const available = DEFINITIONS[type].available;
  const fields = Array.isArray(c.fields) ? c.fields.filter(f => available.includes(f)) : DEFINITIONS[type].defaultFields;
  const { rows } = await pool.query(
    `INSERT INTO discord_notification_config
       (notification_type, enabled, webhook_url, message_prefix, mention, embed_color, include_thumbnail, fields, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (notification_type) DO UPDATE SET
       enabled=$2, webhook_url=$3, message_prefix=$4, mention=$5,
       embed_color=$6, include_thumbnail=$7, fields=$8, updated_at=NOW()
     RETURNING *`,
    [
      type,
      c.enabled !== false,
      (c.webhook_url || '').trim() || null,
      c.message_prefix || '',
      c.mention || '',
      c.embed_color || DEFINITIONS[type].color,
      !!c.include_thumbnail,
      JSON.stringify(fields),
    ]
  );
  return rows[0];
}

/* Remove a stored config so the type reverts to defaults */
async function resetConfig(type) {
  if (!DEFINITIONS[type]) throw new Error('Unknown notification type');
  await pool.query('DELETE FROM discord_notification_config WHERE notification_type=$1', [type]);
  return defaultConfig(type);
}

/* Default webhook URL from the general settings store */
async function getDefaultWebhook() {
  try {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key='discord_webhook_url'");
    return rows[0]?.value || '';
  } catch { return ''; }
}

/* Branding logo (used as thumbnail when include_thumbnail is on) */
async function getBrandThumbnail() {
  try {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key='brand_logo_url'");
    const v = rows[0]?.value || '';
    return /^https?:\/\//i.test(v) ? v : '';
  } catch { return ''; }
}

/* Build the Discord payload (content + embed) for a type/data/config */
async function buildPayload(type, data, configOverride) {
  const def = DEFINITIONS[type];
  if (!def) throw new Error('Unknown notification type');
  const config = configOverride || await getConfig(type);

  // Primary heading
  const headline = primaryHeadline(type, data);
  const prefix = (config.message_prefix || '').trim();
  const title = `${def.emoji} ${prefix ? prefix + ' ' : ''}${headline}`.trim();

  // Embed fields
  const selected = Array.isArray(config.fields) ? config.fields : def.defaultFields;
  const embedFields = [];
  selected.forEach(key => {
    const fd = FIELD_DEFS[key];
    if (!fd) return;
    let val = fd.get(data);
    if (val === null || val === undefined || val === '') return;
    val = String(val);
    // Long text fields render full-width
    const inline = !['description','comment_body','goal','excerpt','epic_desc'].includes(key);
    embedFields.push({ name: fd.label, value: val.slice(0, 1024), inline });
  });

  const embed = {
    title: title.slice(0, 256),
    color: hexToInt(config.embed_color) ?? hexToInt(def.color) ?? 0x6366f1,
    fields: embedFields,
    footer: { text: 'TicketFlow' },
    timestamp: new Date().toISOString(),
  };

  if (config.include_thumbnail) {
    const thumb = await getBrandThumbnail();
    if (thumb) embed.thumbnail = { url: thumb };
  }

  const payload = { embeds: [embed] };
  const mention = (config.mention || '').trim();
  if (mention) payload.content = mention;
  return payload;
}

/* Headline text for the embed title per type */
function primaryHeadline(type, d) {
  const def = DEFINITIONS[type];
  switch (def.category) {
    case 'ticket':
    case 'comment':
      return `${def.label}: ${d.ticket_key || ''}`.trim();
    case 'user':
      return `${def.label}: ${d.full_name || d.username || ''}`.trim();
    case 'sprint':
    case 'epic':
      return `${def.label}: ${d.name || ''}`.trim();
    case 'wiki':
      return `${def.label}: ${d.title || ''}`.trim();
    default:
      return def.label;
  }
}

/* Fire a notification (no-op if disabled or no webhook). Best-effort. */
async function notify(type, data) {
  try {
    const config = await getConfig(type);
    if (!config || !config.enabled) return;
    const webhook = (config.webhook_url || '').trim() || await getDefaultWebhook();
    if (!webhook) return;
    const payload = await buildPayload(type, data, config);
    await postWebhook(webhook, payload);
  } catch (e) {
    console.error(`Discord notify(${type}) error:`, e.message);
  }
}

/* Send a test notification using sample data. Throws on failure. */
async function sendTest(type, configOverride) {
  const def = DEFINITIONS[type];
  if (!def) throw new Error('Unknown notification type');
  const config = configOverride || await getConfig(type);
  const webhook = (config.webhook_url || '').trim() || await getDefaultWebhook();
  if (!webhook) { const err = new Error('No webhook configured (set a custom URL or the default Discord webhook in Settings)'); err.status = 400; throw err; }
  const payload = await buildPayload(type, sampleData(type), config);
  if (payload.embeds[0]) payload.embeds[0].title = '🧪 [TEST] ' + payload.embeds[0].title;
  await postWebhook(webhook, payload);
}

async function postWebhook(url, payload) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    const err = new Error(`Discord returned ${resp.status}${txt ? ': ' + txt.slice(0, 200) : ''}`);
    err.status = 400;
    throw err;
  }
}

/* Representative sample data for previews & tests */
function sampleData(type) {
  const cat = DEFINITIONS[type].category;
  const ticket = {
    ticket_key: 'TKT-128', title: 'Login page returns 500 on submit',
    description: 'Users report an intermittent 500 error when submitting the login form during peak hours.',
    status: 'In Progress', priority: 'High', type: 'Bug',
    assignee_name: 'Alex Garcia', reporter_name: 'Jordan Smith',
    epic_name: 'Authentication Revamp', sprint_name: 'Sprint 12',
    labels: ['backend', 'auth'], tags: ['regression'],
    due_date: '2026-06-15',
  };
  switch (cat) {
    case 'ticket':  return ticket;
    case 'comment': return { ...ticket, comment_author: 'Alex Garcia', comment_body: 'I can reproduce this — looks like a DB connection pool exhaustion. Working on a fix.' };
    case 'user':    return { username: 'mlee', full_name: 'Morgan Lee', email: 'morgan.lee@company.com', role: 'user' };
    case 'sprint':  return { name: 'Sprint 12', goal: 'Stabilize authentication & ship SSO', status: 'active', start_date: '2026-06-01', end_date: '2026-06-14' };
    case 'epic':    return { name: 'Authentication Revamp', description: 'Modernize auth: SSO, MFA, and session hardening.', status: 'active' };
    case 'wiki':    return { title: 'Incident Response Runbook', category: 'Operations', author_name: 'Jordan Smith', body: '# Incident Response\nSteps to triage and resolve production incidents quickly and safely.' };
    default:        return {};
  }
}

module.exports = {
  TYPES, DEFINITIONS, FIELD_DEFS,
  getConfig, getAllConfigs, saveConfig, resetConfig,
  buildPayload, notify, sendTest, sampleData, typeMeta, getDefaultWebhook,
};
