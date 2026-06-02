require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { bootstrap } = require('./db');
const { seed }      = require('./seed');

const app  = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')));

// Routes
app.use('/api/auth',     require('./routes/authRoutes'));
app.use('/api/users',    require('./routes/userRoutes'));
app.use('/api/tickets',  require('./routes/ticketRoutes'));
app.use('/api/wiki',     require('./routes/wikiRoutes'));
app.use('/api/epics',    require('./routes/epicRoutes'));
app.use('/api/sprints',  require('./routes/sprintRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/discord',  require('./routes/discordRoutes'));
app.use('/api/upload',   require('./routes/uploadRoutes'));

// Health
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Retry helper: pg_isready (used by the postgres healthcheck) can report ready
// a moment before the server actually accepts connections, so we retry the
// bootstrap/seed with backoff instead of crashing on the first transient error.
async function withRetry(fn, label, { retries = 15, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.error(`⚠️  ${label} failed (attempt ${attempt}/${retries}): ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

(async () => {
  try {
    await withRetry(bootstrap, 'Database bootstrap');
    await withRetry(seed, 'Database seed');
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀  API listening on :${PORT}`));
  } catch (err) {
    console.error('❌  Fatal startup error – could not initialize the database:', err);
    process.exit(1);
  }
})();

// Surface unexpected errors instead of dying silently.
process.on('unhandledRejection', (err) => console.error('Unhandled promise rejection:', err));
