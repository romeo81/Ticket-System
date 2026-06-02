/* ── TicketFlow SPA ────────────────────────────────────── */
const API = '/api';
let token = localStorage.getItem('token');
let currentUser = null;
let usersCache = [];
let epicsCache = [];
let sprintsCache = [];
let brandingCache = {};
let ticketsData = [];
let ticketSort = { col: 'updated_at', dir: 'desc' };

const DEFAULT_BRAND_NAME = 'TicketFlow';
const DEFAULT_PRIMARY = '#6366f1';
const DEFAULT_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8E%AB%3C/text%3E%3C/svg%3E";

/* ── Avatar helpers ───────────────────────────────────── */
function getInitials(name) {
  const n = (name || '?').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}
// Deterministic color from a string
function avatarColor(str) {
  let hash = 0;
  const s = str || '?';
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue},55%,45%)`;
}
// Returns an avatar element (image with initials fallback)
function avatarHTML(name, url, size = 26) {
  const init = getInitials(name);
  const bg = avatarColor(name || init);
  const fs = Math.max(9, Math.round(size * 0.4));
  const inner = url
    ? `${esc(init)}<img src="${esc(url)}" alt="" onerror="this.remove()">`
    : esc(init);
  return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${bg}">${inner}</span>`;
}
// Avatar + name inline (for table cells / detail rows)
function userCell(name, url, size = 24) {
  if (!name) return '<span class="text-muted">—</span>';
  return `<span class="user-cell">${avatarHTML(name, url, size)}<span>${esc(name)}</span></span>`;
}

/* ── Branding ─────────────────────────────────────────── */
function lightenHex(hex, pct) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  const num = parseInt(h, 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  r = Math.min(255, Math.round(r + (255 - r) * pct));
  g = Math.min(255, Math.round(g + (255 - g) * pct));
  b = Math.min(255, Math.round(b + (255 - b) * pct));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function isValidHexColor(c) { return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c); }

async function loadAndApplyBranding() {
  try { brandingCache = await api('/settings/branding'); } catch { brandingCache = {}; }
  applyBranding(brandingCache);
}

function applyBranding(b = {}) {
  const name = (b.brand_name || '').trim() || DEFAULT_BRAND_NAME;
  const logo = (b.brand_logo_url || '').trim();
  const favicon = (b.brand_favicon_url || '').trim();
  const color = (b.brand_primary_color || '').trim();

  // Title
  document.title = `${name} – Project Management`;

  // Logos (login + sidebar)
  document.querySelectorAll('.logo').forEach(el => {
    if (logo) {
      el.innerHTML = `<img class="brand-logo-img" src="${esc(logo)}" alt="${esc(name)}" onerror="this.remove()"><span>${esc(name)}</span>`;
    } else {
      el.innerHTML = `🎫 <span>${esc(name)}</span>`;
    }
  });

  // Favicon
  const fav = document.getElementById('app-favicon');
  if (fav) fav.href = favicon || DEFAULT_FAVICON;

  // Primary color
  const root = document.documentElement;
  if (color && isValidHexColor(color)) {
    root.style.setProperty('--primary', color);
    root.style.setProperty('--primary-hover', lightenHex(color, 0.2));
  } else {
    root.style.removeProperty('--primary');
    root.style.removeProperty('--primary-hover');
  }
}

/* ── API helpers ──────────────────────────────────────── */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiUpload(path, formData) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: formData });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Upload failed'); }
  return res.json();
}

/* ── Auth ─────────────────────────────────────────────── */
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('login-username').value,
        password: document.getElementById('login-password').value,
      })
    });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    enterApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  document.getElementById('login-page').classList.add('active');
  document.getElementById('app-shell').classList.add('hidden');
}
document.getElementById('logout-btn').addEventListener('click', logout);

async function enterApp() {
  document.getElementById('login-page').classList.remove('active');
  document.getElementById('app-shell').classList.remove('hidden');
  if (!currentUser) {
    try { currentUser = await api('/auth/me'); } catch { return logout(); }
  }
  const displayName = currentUser.full_name || currentUser.username;
  document.getElementById('current-user-name').textContent = displayName;
  document.getElementById('sidebar-user-avatar').innerHTML = avatarHTML(displayName, currentUser.avatar_url, 34);
  const roleBadge = document.getElementById('current-user-role');
  roleBadge.textContent = currentUser.role;
  roleBadge.className = `badge badge-${currentUser.role}`;

  // Show/hide admin links
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = currentUser.role === 'admin' ? '' : 'none';
  });

  // Apply branding (available to all authenticated users)
  await loadAndApplyBranding();

  // Preload caches
  try { usersCache = await api('/users'); } catch {}
  try { epicsCache = await api('/epics'); } catch {}
  try { sprintsCache = await api('/sprints'); } catch {}

  populateFilterDropdowns();
  showPage('dashboard');
}

/* ── Navigation ───────────────────────────────────────── */
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    if (page) showPage(page);
  });
});

function showPage(name) {
  document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${name}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === name));

  // Load data
  const loaders = { dashboard: loadDashboard, tickets: loadTickets, wiki: loadWiki, epics: loadEpics, sprints: loadSprints, profile: loadProfile, users: loadUsers, settings: loadSettings, 'discord-notifications': loadDiscordConfigs };
  if (loaders[name]) loaders[name]();
}

/* ── Populate filter dropdowns ────────────────────────── */
function populateFilterDropdowns() {
  const epicSel = document.getElementById('filter-epic');
  const sprintSel = document.getElementById('filter-sprint');
  epicSel.innerHTML = '<option value="">All Epics</option>' + epicsCache.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  sprintSel.innerHTML = '<option value="">All Sprints</option>' + sprintsCache.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

/* ── Dashboard ────────────────────────────────────────── */
async function loadDashboard() {
  try {
    const tickets = await api('/tickets');
    const open = tickets.filter(t => t.status === 'Open').length;
    const inProgress = tickets.filter(t => t.status === 'In Progress').length;
    const closed = tickets.filter(t => t.status === 'Closed').length;
    const critical = tickets.filter(t => t.priority === 'Critical' && t.status !== 'Closed').length;

    document.getElementById('dashboard-stats').innerHTML = `
      <div class="stat-card"><div class="stat-value">${tickets.length}</div><div class="stat-label">Total Tickets</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${open}</div><div class="stat-label">Open</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${inProgress}</div><div class="stat-label">In Progress</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${closed}</div><div class="stat-label">Closed</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${critical}</div><div class="stat-label">Critical</div></div>
    `;

    document.getElementById('recent-tickets').innerHTML = tickets.slice(0, 5).map(t => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border)">
        <div>
          <span class="ticket-key" onclick="openTicketDetail(${t.id})">${t.ticket_key}</span>
          <span style="margin-left:.5rem;font-size:.85rem">${t.title}</span>
        </div>
        <span class="badge badge-${statusClass(t.status)}">${t.status}</span>
      </div>
    `).join('');

    const activeSprint = sprintsCache.find(s => s.status === 'active');
    document.getElementById('active-sprint-info').innerHTML = activeSprint
      ? `<h4>${activeSprint.name}</h4><p class="text-muted">${activeSprint.goal || ''}</p>
         <p class="text-muted">${activeSprint.start_date?.slice(0,10) || '?'} → ${activeSprint.end_date?.slice(0,10) || '?'}</p>
         <p>${activeSprint.ticket_count || 0} tickets</p>`
      : '<p class="text-muted">No active sprint</p>';
  } catch (err) { console.error(err); }
}

/* ── Tickets ──────────────────────────────────────────── */
let ticketDebounce;
['ticket-search','filter-status','filter-priority','filter-epic','filter-sprint'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => { clearTimeout(ticketDebounce); ticketDebounce = setTimeout(loadTickets, 300); });
  document.getElementById(id).addEventListener('change', loadTickets);
});

async function loadTickets() {
  try {
    const params = new URLSearchParams();
    const search = document.getElementById('ticket-search').value;
    const status = document.getElementById('filter-status').value;
    const priority = document.getElementById('filter-priority').value;
    const epic = document.getElementById('filter-epic').value;
    const sprint = document.getElementById('filter-sprint').value;
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (epic) params.set('epic_id', epic);
    if (sprint) params.set('sprint_id', sprint);

    ticketsData = await api(`/tickets?${params}`);
    renderTicketsTable();
  } catch (err) { console.error(err); }
}

// Sortable column definitions for the tickets table
const TICKET_COLUMNS = [
  { key: 'ticket_key',    label: 'Key' },
  { key: 'title',         label: 'Title' },
  { key: 'status',        label: 'Status' },
  { key: 'priority',      label: 'Priority' },
  { key: 'assignee_name', label: 'Assignee' },
  { key: 'epic_name',     label: 'Epic' },
  { key: 'sprint_name',   label: 'Sprint' },
  { key: 'updated_at',    label: 'Updated' },
];
const PRIORITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };

function sortTickets(col) {
  if (ticketSort.col === col) {
    ticketSort.dir = ticketSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    ticketSort.col = col;
    // Dates default to newest-first; everything else ascending
    ticketSort.dir = col === 'updated_at' ? 'desc' : 'asc';
  }
  renderTicketsTable();
}

function renderTicketsTable() {
  const { col, dir } = ticketSort;
  const sorted = [...ticketsData].sort((a, b) => {
    let va, vb, cmp;
    if (col === 'priority') {
      va = PRIORITY_RANK[a.priority] || 0; vb = PRIORITY_RANK[b.priority] || 0;
      cmp = va - vb;
    } else if (col === 'updated_at') {
      va = new Date(a.updated_at).getTime() || 0; vb = new Date(b.updated_at).getTime() || 0;
      cmp = va - vb;
    } else {
      va = (a[col] || '').toString().toLowerCase();
      vb = (b[col] || '').toString().toLowerCase();
      // Empty values always sort to the bottom
      if (!va && vb) return 1;
      if (va && !vb) return -1;
      cmp = va.localeCompare(vb, undefined, { numeric: true });
    }
    return dir === 'asc' ? cmp : -cmp;
  });

  const thead = TICKET_COLUMNS.map(c => {
    const active = col === c.key;
    const arrow = active ? (dir === 'asc' ? '▲' : '▼') : '⇅';
    return `<th class="sortable${active ? ' sorted' : ''}" onclick="sortTickets('${c.key}')">
      <span class="th-label">${c.label}<span class="sort-arrow">${arrow}</span></span></th>`;
  }).join('');

  document.getElementById('tickets-list').innerHTML = `
    <table>
      <thead><tr>${thead}</tr></thead>
      <tbody>${sorted.map(t => `
        <tr>
          <td><span class="ticket-key" onclick="openTicketDetail(${t.id})">${t.ticket_key}</span></td>
          <td>${esc(t.title)}</td>
          <td><span class="badge badge-${statusClass(t.status)}">${t.status}</span></td>
          <td><span class="badge badge-${t.priority.toLowerCase()}">${t.priority}</span></td>
          <td>${t.assignee_name ? userCell(t.assignee_name, t.assignee_avatar) : '<span class="text-muted">—</span>'}</td>
          <td>${esc(t.epic_name || '—')}</td>
          <td>${esc(t.sprint_name || '—')}</td>
          <td>${timeAgo(t.updated_at)}</td>
        </tr>
      `).join('')}</tbody>
    </table>
    ${sorted.length === 0 ? '<p class="text-muted" style="padding:1rem">No tickets found.</p>' : ''}
  `;
}

/* ── Ticket Detail ────────────────────────────────────── */
async function openTicketDetail(id) {
  showPage('ticket-detail');
  try {
    const t = await api(`/tickets/${id}`);
    document.getElementById('ticket-detail-actions').innerHTML = `
      <button class="btn btn-sm" onclick="openEditTicketModal(${t.id})">✏️ Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteTicket(${t.id})">🗑️ Delete</button>
    `;
    document.getElementById('ticket-detail-content').innerHTML = `
      <div class="ticket-main">
        <div class="detail-section">
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem">
            <span class="badge badge-${statusClass(t.status)}">${t.status}</span>
            <span class="badge badge-${t.priority.toLowerCase()}">${t.priority}</span>
            <span style="color:var(--text3);font-size:.8rem">${t.ticket_key}</span>
          </div>
          <h2 style="margin-bottom:.75rem">${esc(t.title)}</h2>
          <div style="color:var(--text2);line-height:1.6;white-space:pre-wrap">${esc(t.description || 'No description')}</div>
        </div>

        <!-- Labels & Tags -->
        <div class="detail-section">
          <h3>Labels & Tags</h3>
          <div>
            ${(t.labels||[]).map(l => `<span class="tag" style="background:var(--primary);color:#fff">${esc(l)}</span>`).join('')}
            ${(t.tags||[]).map(g => `<span class="tag">${esc(g)}</span>`).join('')}
            ${!(t.labels?.length || t.tags?.length) ? '<span class="text-muted">None</span>' : ''}
          </div>
        </div>

        <!-- Comments -->
        <div class="detail-section">
          <h3>Comments (${t.comments?.length || 0})</h3>
          ${(t.comments||[]).map(c => `
            <div class="comment-item">
              <div class="comment-head">
                ${avatarHTML(c.author_name || c.author_username || 'Unknown', c.author_avatar, 28)}
                <span class="comment-author">${esc(c.author_name||'Unknown')}</span>
                <span class="comment-time">${timeAgo(c.created_at)}</span>
              </div>
              <div class="comment-body">${esc(c.body)}</div>
            </div>
          `).join('')}
          <div style="margin-top:.75rem">
            <textarea id="new-comment" placeholder="Add a comment..." rows="2"></textarea>
            <button class="btn btn-primary btn-sm" style="margin-top:.35rem" onclick="addComment(${t.id})">Post Comment</button>
          </div>
        </div>

        <!-- Attachments -->
        <div class="detail-section">
          <h3>Attachments (${t.attachments?.length || 0})</h3>
          ${(t.attachments||[]).map(a => `
            <div class="attachment-item">
              📎 <a href="/uploads/${a.filename}" target="_blank">${esc(a.original_name)}</a>
              <span class="text-muted">(${formatSize(a.size)})</span>
              <button class="btn btn-sm btn-danger" onclick="deleteAttachment(${a.id},${t.id})" style="margin-left:auto;padding:2px 6px">×</button>
            </div>
          `).join('')}
          <div style="margin-top:.5rem">
            <input type="file" id="attachment-file" accept="image/*,.pdf" style="font-size:.8rem">
            <button class="btn btn-sm" style="margin-top:.35rem" onclick="uploadAttachment(${t.id})">Upload</button>
          </div>
        </div>

        <!-- Wiki Links -->
        <div class="detail-section">
          <h3>Linked Wiki Articles</h3>
          ${(t.wiki_links||[]).map(w => `
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem">
              📚 <a href="#" onclick="openWikiDetail(${w.id});return false">${esc(w.title)}</a>
              <button class="btn btn-sm btn-danger" onclick="unlinkWiki(${t.id},${w.id})" style="padding:2px 6px">×</button>
            </div>
          `).join('')}
          <div style="margin-top:.5rem">
            <select id="link-wiki-select" class="input-sm"><option value="">Link a wiki article...</option></select>
            <button class="btn btn-sm" onclick="linkWiki(${t.id})">Link</button>
          </div>
        </div>
      </div>

      <div class="ticket-sidebar">
        <div class="detail-section">
          <h3>Details</h3>
          <div class="detail-row"><span class="label">Type</span><span>${t.type || 'Task'}</span></div>
          <div class="detail-row"><span class="label">Assignee</span>${t.assignee_name ? userCell(t.assignee_name, t.assignee_avatar) : '<span>Unassigned</span>'}</div>
          <div class="detail-row"><span class="label">Reporter</span>${t.reporter_name ? userCell(t.reporter_name, t.reporter_avatar) : '<span>—</span>'}</div>
          <div class="detail-row"><span class="label">Epic</span><span>${esc(t.epic_name || '—')}</span></div>
          <div class="detail-row"><span class="label">Sprint</span><span>${esc(t.sprint_name || '—')}</span></div>
          <div class="detail-row"><span class="label">Due Date</span><span>${t.due_date ? t.due_date.slice(0,10) : '—'}</span></div>
          <div class="detail-row"><span class="label">Created</span><span>${timeAgo(t.created_at)}</span></div>
          <div class="detail-row"><span class="label">Updated</span><span>${timeAgo(t.updated_at)}</span></div>
        </div>
      </div>
    `;

    // Populate wiki link dropdown
    try {
      const articles = await api('/wiki');
      const sel = document.getElementById('link-wiki-select');
      sel.innerHTML = '<option value="">Link a wiki article...</option>' + articles.map(a => `<option value="${a.id}">${a.title}</option>`).join('');
    } catch {}
  } catch (err) { console.error(err); }
}

async function addComment(ticketId) {
  const body = document.getElementById('new-comment').value.trim();
  if (!body) return;
  try {
    await api(`/tickets/${ticketId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    openTicketDetail(ticketId);
  } catch (err) { alert(err.message); }
}

async function uploadAttachment(ticketId) {
  const file = document.getElementById('attachment-file').files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    await apiUpload(`/upload/${ticketId}`, fd);
    openTicketDetail(ticketId);
  } catch (err) { alert(err.message); }
}

async function deleteAttachment(attachId, ticketId) {
  if (!confirm('Delete this attachment?')) return;
  try { await api(`/upload/${attachId}`, { method: 'DELETE' }); openTicketDetail(ticketId); } catch (err) { alert(err.message); }
}

async function linkWiki(ticketId) {
  const wikiId = document.getElementById('link-wiki-select').value;
  if (!wikiId) return;
  try { await api(`/tickets/${ticketId}/wiki-link`, { method: 'POST', body: JSON.stringify({ wiki_id: parseInt(wikiId) }) }); openTicketDetail(ticketId); } catch (err) { alert(err.message); }
}

async function unlinkWiki(ticketId, wikiId) {
  try { await api(`/tickets/${ticketId}/wiki-link/${wikiId}`, { method: 'DELETE' }); openTicketDetail(ticketId); } catch (err) { alert(err.message); }
}

async function deleteTicket(id) {
  if (!confirm('Delete this ticket permanently?')) return;
  try { await api(`/tickets/${id}`, { method: 'DELETE' }); showPage('tickets'); } catch (err) { alert(err.message); }
}

/* ── Create / Edit Ticket Modal ───────────────────────── */
function ticketFormHTML(t = {}) {
  return `
    <div class="form-group"><label>Title</label><input id="tf-title" value="${esc(t.title||'')}" required></div>
    <div class="form-group"><label>Description</label><textarea id="tf-desc">${esc(t.description||'')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Status</label><select id="tf-status">
        ${['Open','In Progress','Closed'].map(s => `<option ${t.status===s?'selected':''}>${s}</option>`).join('')}
      </select></div>
      <div class="form-group"><label>Priority</label><select id="tf-priority">
        ${['Low','Medium','High','Critical'].map(p => `<option ${t.priority===p?'selected':''}>${p}</option>`).join('')}
      </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Type</label><select id="tf-type">
        ${['Task','Bug','Story','Feature'].map(tp => `<option ${t.type===tp?'selected':''}>${tp}</option>`).join('')}
      </select></div>
      <div class="form-group"><label>Assignee</label><select id="tf-assignee">
        <option value="">Unassigned</option>
        ${usersCache.map(u => `<option value="${u.id}" ${t.assignee_id==u.id?'selected':''}>${u.full_name||u.username}</option>`).join('')}
      </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Epic</label><select id="tf-epic">
        <option value="">None</option>
        ${epicsCache.map(e => `<option value="${e.id}" ${t.epic_id==e.id?'selected':''}>${e.name}</option>`).join('')}
      </select></div>
      <div class="form-group"><label>Sprint</label><select id="tf-sprint">
        <option value="">None</option>
        ${sprintsCache.map(s => `<option value="${s.id}" ${t.sprint_id==s.id?'selected':''}>${s.name}</option>`).join('')}
      </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Labels (comma separated)</label><input id="tf-labels" value="${(t.labels||[]).join(', ')}"></div>
      <div class="form-group"><label>Tags (comma separated)</label><input id="tf-tags" value="${(t.tags||[]).join(', ')}"></div>
    </div>
    <div class="form-group"><label>Due Date</label><input type="date" id="tf-due" value="${t.due_date?t.due_date.slice(0,10):''}"></div>
  `;
}

function collectTicketForm() {
  const parseArr = v => v.split(',').map(s => s.trim()).filter(Boolean);
  return {
    title: document.getElementById('tf-title').value,
    description: document.getElementById('tf-desc').value,
    status: document.getElementById('tf-status').value,
    priority: document.getElementById('tf-priority').value,
    type: document.getElementById('tf-type').value,
    assignee_id: document.getElementById('tf-assignee').value || null,
    epic_id: document.getElementById('tf-epic').value || null,
    sprint_id: document.getElementById('tf-sprint').value || null,
    labels: parseArr(document.getElementById('tf-labels').value),
    tags: parseArr(document.getElementById('tf-tags').value),
    due_date: document.getElementById('tf-due').value || null,
  };
}

function openCreateTicketModal() {
  openModal('New Ticket', ticketFormHTML() + `<div class="btn-group"><button class="btn btn-primary" onclick="submitCreateTicket()">Create Ticket</button></div>`);
}

async function submitCreateTicket() {
  try {
    await api('/tickets', { method: 'POST', body: JSON.stringify(collectTicketForm()) });
    closeModal(); loadTickets();
  } catch (err) { alert(err.message); }
}

function openEditTicketModal(id) {
  api(`/tickets/${id}`).then(t => {
    openModal('Edit Ticket', ticketFormHTML(t) + `<div class="btn-group"><button class="btn btn-primary" onclick="submitEditTicket(${id})">Save Changes</button></div>`);
  });
}

async function submitEditTicket(id) {
  try {
    await api(`/tickets/${id}`, { method: 'PUT', body: JSON.stringify(collectTicketForm()) });
    closeModal(); openTicketDetail(id);
  } catch (err) { alert(err.message); }
}

/* ── Wiki ─────────────────────────────────────────────── */
let wikiDebounce;
document.getElementById('wiki-search').addEventListener('input', () => { clearTimeout(wikiDebounce); wikiDebounce = setTimeout(loadWiki, 300); });
document.getElementById('wiki-category-filter').addEventListener('change', loadWiki);

async function loadWiki() {
  try {
    const params = new URLSearchParams();
    const s = document.getElementById('wiki-search').value;
    const c = document.getElementById('wiki-category-filter').value;
    if (s) params.set('search', s);
    if (c) params.set('category', c);
    const articles = await api(`/wiki?${params}`);

    // Populate category filter
    const cats = [...new Set(articles.map(a => a.category).filter(Boolean))];
    const catSel = document.getElementById('wiki-category-filter');
    const curCat = catSel.value;
    catSel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option ${c===curCat?'selected':''}>${c}</option>`).join('');

    document.getElementById('wiki-list').innerHTML = articles.map(a => `
      <div class="wiki-card" onclick="openWikiDetail(${a.id})">
        <div class="wiki-meta">${esc(a.category||'General')} · by ${esc(a.author_name||'Unknown')} · ${timeAgo(a.updated_at)}</div>
        <h3>${esc(a.title)}</h3>
        <div class="wiki-excerpt">${esc((a.body||'').replace(/[#*_\[\]]/g,'').slice(0,200))}</div>
      </div>
    `).join('');
  } catch (err) { console.error(err); }
}

async function openWikiDetail(id) {
  showPage('wiki-detail');
  try {
    const a = await api(`/wiki/${id}`);
    document.getElementById('wiki-detail-actions').innerHTML = `
      <button class="btn btn-sm" onclick="openEditWikiModal(${a.id})">✏️ Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteWiki(${a.id})">🗑️ Delete</button>
    `;
    document.getElementById('wiki-detail-content').innerHTML = `
      <div style="margin-bottom:1rem">
        <span class="badge badge-user">${esc(a.category||'General')}</span>
        <span class="text-muted" style="margin-left:.5rem">by ${esc(a.author_name||'Unknown')} · ${timeAgo(a.updated_at)}</span>
      </div>
      <div class="wiki-detail-body">${renderMarkdown(a.body||'')}</div>
      ${a.linked_tickets?.length ? `
        <div class="detail-section" style="margin-top:1rem">
          <h3>Linked Tickets</h3>
          ${a.linked_tickets.map(t => `<div style="margin-bottom:.35rem"><span class="ticket-key" onclick="openTicketDetail(${t.id})">${t.ticket_key}</span> ${esc(t.title)} <span class="badge badge-${statusClass(t.status)}">${t.status}</span></div>`).join('')}
        </div>
      ` : ''}
    `;
  } catch (err) { console.error(err); }
}

function openCreateWikiModal() {
  openModal('New Article', `
    <div class="form-group"><label>Title</label><input id="wf-title" required></div>
    <div class="form-group"><label>Category</label><input id="wf-category" placeholder="e.g. Engineering, Support"></div>
    <div class="form-group"><label>Body (Markdown)</label><textarea id="wf-body" rows="10"></textarea></div>
    <div class="btn-group"><button class="btn btn-primary" onclick="submitCreateWiki()">Create Article</button></div>
  `);
}

async function submitCreateWiki() {
  try {
    await api('/wiki', { method: 'POST', body: JSON.stringify({ title: document.getElementById('wf-title').value, body: document.getElementById('wf-body').value, category: document.getElementById('wf-category').value }) });
    closeModal(); loadWiki();
  } catch (err) { alert(err.message); }
}

function openEditWikiModal(id) {
  api(`/wiki/${id}`).then(a => {
    openModal('Edit Article', `
      <div class="form-group"><label>Title</label><input id="wf-title" value="${esc(a.title)}"></div>
      <div class="form-group"><label>Category</label><input id="wf-category" value="${esc(a.category||'')}"></div>
      <div class="form-group"><label>Body (Markdown)</label><textarea id="wf-body" rows="10">${esc(a.body||'')}</textarea></div>
      <div class="btn-group"><button class="btn btn-primary" onclick="submitEditWiki(${id})">Save</button></div>
    `);
  });
}

async function submitEditWiki(id) {
  try {
    await api(`/wiki/${id}`, { method: 'PUT', body: JSON.stringify({ title: document.getElementById('wf-title').value, body: document.getElementById('wf-body').value, category: document.getElementById('wf-category').value }) });
    closeModal(); openWikiDetail(id);
  } catch (err) { alert(err.message); }
}

async function deleteWiki(id) {
  if (!confirm('Delete this article?')) return;
  try { await api(`/wiki/${id}`, { method: 'DELETE' }); showPage('wiki'); } catch (err) { alert(err.message); }
}

/* ── Epics ────────────────────────────────────────────── */
async function loadEpics() {
  try {
    epicsCache = await api('/epics');
    document.getElementById('epics-list').innerHTML = epicsCache.map(e => `
      <div class="epic-card">
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
          <span style="width:12px;height:12px;border-radius:50%;background:${e.color};display:inline-block"></span>
          <h3>${esc(e.name)}</h3>
          <span class="badge badge-${e.status==='active'?'open':'closed'}" style="margin-left:auto">${e.status}</span>
        </div>
        <p class="text-muted">${esc(e.description||'')}</p>
        <div class="epic-meta">${e.ticket_count} tickets · by ${esc(e.creator_name||'Unknown')}</div>
        <div class="btn-group">
          <button class="btn btn-sm" onclick="openEditEpicModal(${e.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteEpic(${e.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) { console.error(err); }
}

function openCreateEpicModal() {
  openModal('New Epic', `
    <div class="form-group"><label>Name</label><input id="ef-name" required></div>
    <div class="form-group"><label>Description</label><textarea id="ef-desc"></textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Color</label><input type="color" id="ef-color" value="#6366f1"></div>
      <div class="form-group"><label>Status</label><select id="ef-status"><option>active</option><option>completed</option></select></div>
    </div>
    <div class="btn-group"><button class="btn btn-primary" onclick="submitCreateEpic()">Create</button></div>
  `);
}

async function submitCreateEpic() {
  try {
    await api('/epics', { method: 'POST', body: JSON.stringify({ name: document.getElementById('ef-name').value, description: document.getElementById('ef-desc').value, color: document.getElementById('ef-color').value }) });
    closeModal(); loadEpics();
  } catch (err) { alert(err.message); }
}

function openEditEpicModal(id) {
  const e = epicsCache.find(x => x.id === id);
  openModal('Edit Epic', `
    <div class="form-group"><label>Name</label><input id="ef-name" value="${esc(e.name)}"></div>
    <div class="form-group"><label>Description</label><textarea id="ef-desc">${esc(e.description||'')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Color</label><input type="color" id="ef-color" value="${e.color||'#6366f1'}"></div>
      <div class="form-group"><label>Status</label><select id="ef-status">${['active','completed'].map(s=>`<option ${e.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="btn-group"><button class="btn btn-primary" onclick="submitEditEpic(${id})">Save</button></div>
  `);
}

async function submitEditEpic(id) {
  try {
    await api(`/epics/${id}`, { method: 'PUT', body: JSON.stringify({ name: document.getElementById('ef-name').value, description: document.getElementById('ef-desc').value, color: document.getElementById('ef-color').value, status: document.getElementById('ef-status').value }) });
    closeModal(); loadEpics();
  } catch (err) { alert(err.message); }
}

async function deleteEpic(id) {
  if (!confirm('Delete this epic?')) return;
  try { await api(`/epics/${id}`, { method: 'DELETE' }); loadEpics(); } catch (err) { alert(err.message); }
}

/* ── Sprints ──────────────────────────────────────────── */
async function loadSprints() {
  try {
    sprintsCache = await api('/sprints');
    document.getElementById('sprints-list').innerHTML = sprintsCache.map(s => `
      <div class="sprint-card">
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
          <h3>${esc(s.name)}</h3>
          <span class="badge badge-${s.status==='active'?'inprogress':s.status==='completed'?'closed':'open'}" style="margin-left:auto">${s.status}</span>
        </div>
        <p class="text-muted">${esc(s.goal||'')}</p>
        <div class="sprint-meta">
          ${s.start_date?s.start_date.slice(0,10):'?'} → ${s.end_date?s.end_date.slice(0,10):'?'} · ${s.ticket_count} tickets
        </div>
        <div class="btn-group">
          <button class="btn btn-sm" onclick="openEditSprintModal(${s.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSprint(${s.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) { console.error(err); }
}

function openCreateSprintModal() {
  openModal('New Sprint', `
    <div class="form-group"><label>Name</label><input id="sf-name" required></div>
    <div class="form-group"><label>Goal</label><textarea id="sf-goal"></textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Start Date</label><input type="date" id="sf-start"></div>
      <div class="form-group"><label>End Date</label><input type="date" id="sf-end"></div>
    </div>
    <div class="form-group"><label>Status</label><select id="sf-status"><option>planning</option><option>active</option><option>completed</option></select></div>
    <div class="btn-group"><button class="btn btn-primary" onclick="submitCreateSprint()">Create</button></div>
  `);
}

async function submitCreateSprint() {
  try {
    await api('/sprints', { method: 'POST', body: JSON.stringify({ name: document.getElementById('sf-name').value, goal: document.getElementById('sf-goal').value, start_date: document.getElementById('sf-start').value||null, end_date: document.getElementById('sf-end').value||null, status: document.getElementById('sf-status').value }) });
    closeModal(); loadSprints();
  } catch (err) { alert(err.message); }
}

function openEditSprintModal(id) {
  const s = sprintsCache.find(x => x.id === id);
  openModal('Edit Sprint', `
    <div class="form-group"><label>Name</label><input id="sf-name" value="${esc(s.name)}"></div>
    <div class="form-group"><label>Goal</label><textarea id="sf-goal">${esc(s.goal||'')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Start Date</label><input type="date" id="sf-start" value="${s.start_date?s.start_date.slice(0,10):''}"></div>
      <div class="form-group"><label>End Date</label><input type="date" id="sf-end" value="${s.end_date?s.end_date.slice(0,10):''}"></div>
    </div>
    <div class="form-group"><label>Status</label><select id="sf-status">${['planning','active','completed'].map(st=>`<option ${s.status===st?'selected':''}>${st}</option>`).join('')}</select></div>
    <div class="btn-group"><button class="btn btn-primary" onclick="submitEditSprint(${id})">Save</button></div>
  `);
}

async function submitEditSprint(id) {
  try {
    await api(`/sprints/${id}`, { method: 'PUT', body: JSON.stringify({ name: document.getElementById('sf-name').value, goal: document.getElementById('sf-goal').value, start_date: document.getElementById('sf-start').value||null, end_date: document.getElementById('sf-end').value||null, status: document.getElementById('sf-status').value }) });
    closeModal(); loadSprints();
  } catch (err) { alert(err.message); }
}

async function deleteSprint(id) {
  if (!confirm('Delete this sprint?')) return;
  try { await api(`/sprints/${id}`, { method: 'DELETE' }); loadSprints(); } catch (err) { alert(err.message); }
}

/* ── Profile / Change Password ─────────────────────────── */
function loadProfile() {
  if (!currentUser) return;
  document.getElementById('profile-info').innerHTML = `
    <div class="detail-row"><span class="label">Username</span><span>${esc(currentUser.username)}</span></div>
    <div class="detail-row"><span class="label">Full Name</span><span>${esc(currentUser.full_name || '—')}</span></div>
    <div class="detail-row"><span class="label">Email</span><span>${esc(currentUser.email || '—')}</span></div>
    <div class="detail-row"><span class="label">Role</span><span class="badge badge-${currentUser.role}">${currentUser.role}</span></div>
  `;
  // Avatar section
  renderProfileAvatar();
  document.getElementById('avatar-url-input').value = currentUser.avatar_url || '';
  document.getElementById('avatar-file-input').value = '';
  document.getElementById('avatar-msg').classList.add('hidden');
  // Clear password fields
  document.getElementById('cp-current').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  document.getElementById('cp-msg').classList.add('hidden');
}

function renderProfileAvatar() {
  const name = currentUser.full_name || currentUser.username;
  document.getElementById('profile-avatar-preview').innerHTML = avatarHTML(name, currentUser.avatar_url, 88);
}

// Persist avatar_url to the server and refresh UI everywhere
async function persistAvatar(avatarUrl) {
  const msgEl = document.getElementById('avatar-msg');
  try {
    const updated = await api('/users/me/avatar', { method: 'PUT', body: JSON.stringify({ avatar_url: avatarUrl }) });
    currentUser.avatar_url = updated.avatar_url;
    renderProfileAvatar();
    // Refresh sidebar avatar
    const name = currentUser.full_name || currentUser.username;
    document.getElementById('sidebar-user-avatar').innerHTML = avatarHTML(name, currentUser.avatar_url, 34);
    document.getElementById('avatar-url-input').value = currentUser.avatar_url || '';
    msgEl.className = 'msg success';
    msgEl.textContent = avatarUrl ? '✅ Avatar updated!' : '✅ Avatar removed.';
    msgEl.classList.remove('hidden');
  } catch (err) {
    msgEl.className = 'msg error'; msgEl.textContent = err.message; msgEl.classList.remove('hidden');
  }
}

async function saveAvatar() {
  const msgEl = document.getElementById('avatar-msg');
  const fileInput = document.getElementById('avatar-file-input');
  const urlInput = document.getElementById('avatar-url-input');
  try {
    // If a file is selected, upload it first
    if (fileInput.files && fileInput.files[0]) {
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      const res = await apiUpload('/upload/avatar', fd);
      await persistAvatar(res.url);
      fileInput.value = '';
      return;
    }
    const url = urlInput.value.trim();
    if (!url) {
      msgEl.className = 'msg error'; msgEl.textContent = 'Enter an image URL or choose a file to upload.'; msgEl.classList.remove('hidden');
      return;
    }
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) {
      msgEl.className = 'msg error'; msgEl.textContent = 'Avatar must be a valid http(s) URL.'; msgEl.classList.remove('hidden');
      return;
    }
    await persistAvatar(url);
  } catch (err) {
    msgEl.className = 'msg error'; msgEl.textContent = err.message; msgEl.classList.remove('hidden');
  }
}

async function removeAvatar() {
  document.getElementById('avatar-file-input').value = '';
  document.getElementById('avatar-url-input').value = '';
  await persistAvatar(null);
}

async function submitChangePassword() {
  const msgEl = document.getElementById('cp-msg');
  const current = document.getElementById('cp-current').value;
  const newPw = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-confirm').value;

  // Client-side validation
  if (!current || !newPw || !confirm) {
    msgEl.className = 'msg error'; msgEl.textContent = 'All fields are required.'; msgEl.classList.remove('hidden');
    return;
  }
  if (newPw.length < 6) {
    msgEl.className = 'msg error'; msgEl.textContent = 'New password must be at least 6 characters.'; msgEl.classList.remove('hidden');
    return;
  }
  if (newPw !== confirm) {
    msgEl.className = 'msg error'; msgEl.textContent = 'New passwords do not match.'; msgEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await api('/users/me/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: current, new_password: newPw })
    });
    msgEl.className = 'msg success'; msgEl.textContent = '✅ ' + res.message; msgEl.classList.remove('hidden');
    document.getElementById('cp-current').value = '';
    document.getElementById('cp-new').value = '';
    document.getElementById('cp-confirm').value = '';
  } catch (err) {
    msgEl.className = 'msg error'; msgEl.textContent = err.message; msgEl.classList.remove('hidden');
  }
}

/* ── Admin Reset Password Modal ───────────────────────── */
function openResetPasswordModal(id) {
  const u = usersCache.find(x => x.id === id);
  openModal('Reset Password – ' + (u ? u.full_name || u.username : 'User'), `
    <p class="text-muted">Set a new password for this user. No current password is required.</p>
    <div class="form-group"><label>New Password</label><input type="password" id="rp-new" placeholder="At least 6 characters"></div>
    <div class="form-group"><label>Confirm New Password</label><input type="password" id="rp-confirm" placeholder="Re-enter new password"></div>
    <div class="btn-group"><button class="btn btn-primary" onclick="submitResetPassword(${id})">Reset Password</button></div>
    <div id="rp-msg" class="msg hidden"></div>
  `);
}

async function submitResetPassword(id) {
  const msgEl = document.getElementById('rp-msg');
  const newPw = document.getElementById('rp-new').value;
  const confirm = document.getElementById('rp-confirm').value;

  if (!newPw) {
    msgEl.className = 'msg error'; msgEl.textContent = 'New password is required.'; msgEl.classList.remove('hidden');
    return;
  }
  if (newPw.length < 6) {
    msgEl.className = 'msg error'; msgEl.textContent = 'Password must be at least 6 characters.'; msgEl.classList.remove('hidden');
    return;
  }
  if (newPw !== confirm) {
    msgEl.className = 'msg error'; msgEl.textContent = 'Passwords do not match.'; msgEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await api(`/users/${id}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ new_password: newPw })
    });
    msgEl.className = 'msg success'; msgEl.textContent = '✅ ' + res.message; msgEl.classList.remove('hidden');
    document.getElementById('rp-new').value = '';
    document.getElementById('rp-confirm').value = '';
  } catch (err) {
    msgEl.className = 'msg error'; msgEl.textContent = err.message; msgEl.classList.remove('hidden');
  }
}

/* ── Users ────────────────────────────────────────────── */
async function loadUsers() {
  try {
    usersCache = await api('/users');
    document.getElementById('users-list').innerHTML = `
      <table>
        <thead><tr><th>User</th><th>Full Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>${usersCache.map(u => `
          <tr>
            <td>${userCell(u.username, u.avatar_url)}</td>
            <td>${esc(u.full_name||'—')}</td>
            <td>${esc(u.email||'—')}</td>
            <td><span class="badge badge-${u.role}">${u.role}</span></td>
            <td>${timeAgo(u.created_at)}</td>
            <td>
              <button class="btn btn-sm" onclick="openEditUserModal(${u.id})">Edit</button>
              <button class="btn btn-sm" onclick="openResetPasswordModal(${u.id})">🔑 Reset PW</button>
              ${u.id !== currentUser.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">🗑️ Delete</button>` : ''}
            </td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  } catch (err) { console.error(err); }
}

function openCreateUserModal() {
  openModal('Add User', `
    <div class="form-group"><label>Username</label><input id="uf-username" required></div>
    <div class="form-group"><label>Full Name</label><input id="uf-fullname"></div>
    <div class="form-group"><label>Email</label><input type="email" id="uf-email"></div>
    <div class="form-group"><label>Password</label><input type="password" id="uf-password" required></div>
    <div class="form-group"><label>Role</label><select id="uf-role"><option>user</option><option>admin</option></select></div>
    <div class="btn-group"><button class="btn btn-primary" onclick="submitCreateUser()">Create</button></div>
  `);
}

async function submitCreateUser() {
  try {
    await api('/users', { method: 'POST', body: JSON.stringify({ username: document.getElementById('uf-username').value, full_name: document.getElementById('uf-fullname').value, email: document.getElementById('uf-email').value, password: document.getElementById('uf-password').value, role: document.getElementById('uf-role').value }) });
    closeModal(); loadUsers();
  } catch (err) { alert(err.message); }
}

function openEditUserModal(id) {
  const u = usersCache.find(x => x.id === id);
  openModal('Edit User', `
    <div class="form-group"><label>Username</label><input id="uf-username" value="${esc(u.username)}"></div>
    <div class="form-group"><label>Full Name</label><input id="uf-fullname" value="${esc(u.full_name||'')}"></div>
    <div class="form-group"><label>Email</label><input type="email" id="uf-email" value="${esc(u.email||'')}"></div>
    <div class="form-group"><label>Role</label><select id="uf-role">${['user','admin'].map(r=>`<option ${u.role===r?'selected':''}>${r}</option>`).join('')}</select></div>
    <div class="btn-group"><button class="btn btn-primary" onclick="submitEditUser(${id})">Save</button></div>
  `);
}

async function submitEditUser(id) {
  try {
    await api(`/users/${id}`, { method: 'PUT', body: JSON.stringify({ username: document.getElementById('uf-username').value, full_name: document.getElementById('uf-fullname').value, email: document.getElementById('uf-email').value, role: document.getElementById('uf-role').value }) });
    closeModal(); loadUsers();
  } catch (err) { alert(err.message); }
}

async function deleteUser(id) {
  const u = usersCache.find(x => x.id === id);
  const name = u ? (u.username || 'this user') : 'this user';
  if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) return;
  try {
    const res = await api(`/users/${id}`, { method: 'DELETE' });
    toast((res && res.message) || `User "${name}" deleted successfully`, 'success');
    loadUsers();
  } catch (err) {
    toast(err.message || 'Failed to delete user', 'error');
  }
}

/* ── Settings ─────────────────────────────────────────── */
async function loadSettings() {
  try {
    const settings = await api('/settings');
    document.getElementById('discord-webhook-url').value = settings.discord_webhook_url || '';
    // Branding fields
    const name = settings.brand_name || '';
    const logo = settings.brand_logo_url || '';
    const favicon = settings.brand_favicon_url || '';
    const color = settings.brand_primary_color || DEFAULT_PRIMARY;
    document.getElementById('brand-name').value = name;
    document.getElementById('brand-logo-url').value = logo;
    document.getElementById('brand-favicon-url').value = favicon;
    document.getElementById('brand-primary-color').value = isValidHexColor(color) ? color : DEFAULT_PRIMARY;
    document.getElementById('brand-primary-color-text').value = color;
    document.getElementById('branding-msg').classList.add('hidden');
    // Branding asset previews + dropzones
    setupBrandingUI();
    ['logo', 'favicon'].forEach(kind => {
      brandStatus(kind, '', '');                          // clear any old status
      const input = document.getElementById(`brand-${kind}-url`);
      const link  = document.getElementById(`brand-${kind}-urltoggle`);
      // Reveal the URL field automatically when the current value is an external URL.
      const isUrl = input.value.trim() && !input.value.trim().startsWith('/uploads/');
      input.classList.toggle('hidden', !isUrl);
      if (link) link.textContent = isUrl ? 'Hide URL field' : 'Or enter a URL';
      updateBrandPreview(kind);
    });
  } catch {}
}

// Keep the color picker and its text field in sync
document.addEventListener('input', (e) => {
  if (e.target.id === 'brand-primary-color') {
    document.getElementById('brand-primary-color-text').value = e.target.value;
  } else if (e.target.id === 'brand-primary-color-text') {
    const v = e.target.value.trim();
    if (isValidHexColor(v)) document.getElementById('brand-primary-color').value = v;
  }
});

async function saveBranding() {
  const msgEl = document.getElementById('branding-msg');
  const name = document.getElementById('brand-name').value.trim();
  const logo = document.getElementById('brand-logo-url').value.trim();
  const favicon = document.getElementById('brand-favicon-url').value.trim();
  const color = document.getElementById('brand-primary-color-text').value.trim();

  // Validation
  const urlOk = (u) => !u || /^https?:\/\//i.test(u) || u.startsWith('/uploads/');
  if (!urlOk(logo)) { return brandingError('Logo URL must be a valid http(s) URL.'); }
  if (!urlOk(favicon)) { return brandingError('Favicon URL must be a valid http(s) URL.'); }
  if (color && !isValidHexColor(color)) { return brandingError('Primary color must be a valid hex color (e.g. #6366f1).'); }

  try {
    await Promise.all([
      api('/settings/brand_name', { method: 'PUT', body: JSON.stringify({ value: name }) }),
      api('/settings/brand_logo_url', { method: 'PUT', body: JSON.stringify({ value: logo }) }),
      api('/settings/brand_favicon_url', { method: 'PUT', body: JSON.stringify({ value: favicon }) }),
      api('/settings/brand_primary_color', { method: 'PUT', body: JSON.stringify({ value: color }) }),
    ]);
    brandingCache = { brand_name: name, brand_logo_url: logo, brand_favicon_url: favicon, brand_primary_color: color };
    applyBranding(brandingCache);
    updateBrandPreview('logo');
    updateBrandPreview('favicon');
    msgEl.className = 'msg success'; msgEl.textContent = '✅ Branding saved and applied!'; msgEl.classList.remove('hidden');
  } catch (err) {
    brandingError(err.message);
  }
}

/* ── Branding asset uploads (logo / favicon) ──────────── */
const BRAND_MAX_BYTES = 5 * 1024 * 1024;
const BRAND_ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'svg', 'ico', 'gif'];
function brandKindLabel(kind) { return kind === 'favicon' ? 'Favicon' : 'Logo'; }

// Render the preview thumbnail + "source" badge from the current URL input value.
function updateBrandPreview(kind) {
  const val = (document.getElementById(`brand-${kind}-url`).value || '').trim();
  const preview = document.getElementById(`brand-${kind}-preview`);
  const badge = document.getElementById(`brand-${kind}-source`);
  if (preview) {
    preview.innerHTML = val
      ? `<img src="${esc(val)}" alt="${brandKindLabel(kind)} preview" onerror="this.style.display='none'">`
      : `<span class="brand-preview-empty">No ${kind}</span>`;
  }
  if (badge) {
    if (!val) {
      badge.className = 'brand-source-badge none';
      badge.textContent = `No ${kind} set`;
    } else if (val.startsWith('/uploads/')) {
      badge.className = 'brand-source-badge file';
      badge.textContent = '📁 Using uploaded file';
    } else {
      badge.className = 'brand-source-badge url';
      badge.textContent = '🔗 Using external URL';
    }
  }
}

// Show/hide the manual URL field.
function toggleBrandUrl(kind) {
  const input = document.getElementById(`brand-${kind}-url`);
  const link = document.getElementById(`brand-${kind}-urltoggle`);
  const hidden = input.classList.toggle('hidden');
  if (link) link.textContent = hidden ? 'Or enter a URL' : 'Hide URL field';
  if (!hidden) input.focus();
}

function brandStatus(kind, text, cls) {
  const el = document.getElementById(`brand-${kind}-status`);
  if (!el) return;
  el.className = `brand-upload-status ${cls || ''}`.trim();
  el.innerHTML = text;
  el.classList.toggle('hidden', !text);
}

// Apply the four branding inputs live (visual only — persisted on Save).
function applyBrandingFromInputs() {
  applyBranding({
    brand_name: document.getElementById('brand-name').value.trim(),
    brand_logo_url: document.getElementById('brand-logo-url').value.trim(),
    brand_favicon_url: document.getElementById('brand-favicon-url').value.trim(),
    brand_primary_color: document.getElementById('brand-primary-color-text').value.trim(),
  });
}

async function handleBrandFile(kind, file) {
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!BRAND_ALLOWED_EXT.includes(ext)) {
    brandStatus(kind, `❌ Unsupported file type ".${esc(ext)}". Allowed: PNG, JPG, JPEG, SVG, ICO, GIF.`, 'err');
    return;
  }
  if (file.size > BRAND_MAX_BYTES) {
    brandStatus(kind, `❌ File is ${formatSize(file.size)} — the maximum allowed size is 5MB.`, 'err');
    return;
  }
  brandStatus(kind, `⏳ Uploading ${esc(file.name)} (${formatSize(file.size)})…`, 'uploading');
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiUpload('/upload/branding', fd);
    document.getElementById(`brand-${kind}-url`).value = res.url;
    updateBrandPreview(kind);
    applyBrandingFromInputs();   // apply the new asset immediately
    brandStatus(kind, `✅ Uploaded <strong>${esc(res.filename || file.name)}</strong> and applied. Click “Save Branding” to keep it.`, 'ok');
  } catch (err) {
    brandStatus(kind, `❌ ${esc(err.message || 'Upload failed')}`, 'err');
  }
}

// Wire click / keyboard / drag-and-drop / file-input + URL live preview for a dropzone.
function setupBrandDropzone(kind) {
  const zone = document.getElementById(`brand-${kind}-dropzone`);
  const input = document.getElementById(`brand-${kind}-file`);
  if (!zone || !input || zone.dataset.wired) return;
  zone.dataset.wired = '1';
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => {
    if (input.files && input.files[0]) handleBrandFile(kind, input.files[0]);
    input.value = '';
  });
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.add('dragover');
  }));
  ['dragleave', 'dragend'].forEach(ev => zone.addEventListener(ev, () => zone.classList.remove('dragover')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleBrandFile(kind, f);
  });
  const urlInput = document.getElementById(`brand-${kind}-url`);
  if (urlInput) urlInput.addEventListener('input', () => updateBrandPreview(kind));
}

function setupBrandingUI() {
  setupBrandDropzone('logo');
  setupBrandDropzone('favicon');
}

function brandingError(text) {
  const msgEl = document.getElementById('branding-msg');
  msgEl.className = 'msg error'; msgEl.textContent = text; msgEl.classList.remove('hidden');
}

async function resetBrandingDefaults() {
  if (!confirm('Reset branding to defaults? This clears the name, logo, favicon and color.')) return;
  document.getElementById('brand-name').value = '';
  document.getElementById('brand-logo-url').value = '';
  document.getElementById('brand-favicon-url').value = '';
  document.getElementById('brand-primary-color').value = DEFAULT_PRIMARY;
  document.getElementById('brand-primary-color-text').value = '';
  await saveBranding();
}

async function saveDiscordWebhook() {
  const url = document.getElementById('discord-webhook-url').value;
  const msgEl = document.getElementById('settings-msg');
  try {
    await api('/settings/discord_webhook_url', { method: 'PUT', body: JSON.stringify({ value: url }) });
    msgEl.className = 'msg success'; msgEl.textContent = '✅ Webhook URL saved!'; msgEl.classList.remove('hidden');
  } catch (err) {
    msgEl.className = 'msg error'; msgEl.textContent = err.message; msgEl.classList.remove('hidden');
  }
}

async function testDiscordWebhook() {
  const msgEl = document.getElementById('settings-msg');
  try {
    const res = await api('/settings/test-discord', { method: 'POST' });
    msgEl.className = 'msg success'; msgEl.textContent = '✅ ' + res.message; msgEl.classList.remove('hidden');
  } catch (err) {
    msgEl.className = 'msg error'; msgEl.textContent = err.message; msgEl.classList.remove('hidden');
  }
}

/* ── Discord Notifications ────────────────────────────── */
let discordConfigs = [];      // raw configs from server
let discordExpanded = {};     // type -> bool (open state)
const CAT_LABELS = { ticket: 'Tickets', comment: 'Comments', user: 'Users', sprint: 'Sprints', epic: 'Epics', wiki: 'Wiki' };

async function loadDiscordConfigs() {
  const list = document.getElementById('discord-config-list');
  list.innerHTML = '<p class="text-muted">Loading…</p>';
  try {
    const data = await api('/discord/configs');
    discordConfigs = data.configs || [];
    // default webhook banner
    const banner = document.getElementById('discord-default-banner');
    if (data.default_webhook_configured) {
      banner.className = 'dn-banner dn-banner-ok';
      banner.innerHTML = '✅ A <strong>default webhook</strong> is configured in Settings. Notification types without their own webhook URL will use it.';
    } else {
      banner.className = 'dn-banner dn-banner-warn';
      banner.innerHTML = '⚠️ No <strong>default webhook</strong> is set. Add one in <a href="#" onclick="showPage(\'settings\');return false;">Settings → Discord Integration</a>, or give each type its own webhook URL below. Types without any webhook will be skipped.';
    }
    banner.classList.remove('hidden');
    renderDiscordConfigs();
  } catch (err) {
    list.innerHTML = `<p class="msg error">${esc(err.message)}</p>`;
  }
}

function renderDiscordConfigs() {
  const list = document.getElementById('discord-config-list');
  // group by category preserving definition order
  const groups = {};
  discordConfigs.forEach(c => { (groups[c.category] = groups[c.category] || []).push(c); });
  let html = '';
  Object.keys(groups).forEach(cat => {
    html += `<h3 class="dn-group-title">${esc(CAT_LABELS[cat] || cat)}</h3>`;
    groups[cat].forEach(c => { html += discordCardHTML(c); });
  });
  list.innerHTML = html;
}

function discordCardHTML(c) {
  const cfg = c.config;
  const open = !!discordExpanded[c.type];
  const enabled = cfg.enabled;
  const mention = cfg.mention || '';
  const isPreset = mention === '@here' || mention === '@everyone';
  const mentionSel = mention === '' ? 'none' : (isPreset ? mention : 'custom');
  const color = isValidHexColor(cfg.embed_color) ? cfg.embed_color : c.default_color;
  const fields = cfg.fields || [];

  const fieldChecks = c.available_fields.map(f => `
    <label class="dn-check">
      <input type="checkbox" id="dn-${c.type}-f-${f.key}" ${fields.includes(f.key) ? 'checked' : ''}>
      <span>${esc(f.label)}</span>
    </label>`).join('');

  return `
  <div class="dn-card ${enabled ? '' : 'dn-disabled'}" id="dn-card-${c.type}">
    <div class="dn-card-head" onclick="toggleDiscordCard('${c.type}')">
      <div class="dn-card-title">
        <span class="dn-emoji">${c.emoji}</span>
        <span>${esc(c.label)}</span>
        <span class="dn-status-pill ${enabled ? 'on' : 'off'}" id="dn-${c.type}-pill">${enabled ? 'Enabled' : 'Disabled'}</span>
      </div>
      <span class="dn-chevron">${open ? '▲' : '▼'}</span>
    </div>
    <div class="dn-card-body ${open ? '' : 'hidden'}" id="dn-body-${c.type}">
      <div class="dn-grid">
        <div class="dn-controls">
          <label class="dn-toggle">
            <input type="checkbox" id="dn-${c.type}-enabled" ${enabled ? 'checked' : ''} onchange="onDiscordEnableToggle('${c.type}')">
            <span class="dn-slider"></span>
            <span class="dn-toggle-label">Send this notification</span>
          </label>

          <div class="form-group">
            <label>Webhook URL <span class="text-muted" style="margin:0">(optional — falls back to default)</span></label>
            <input type="url" id="dn-${c.type}-webhook" class="input-full" placeholder="https://discord.com/api/webhooks/..." value="${esc(cfg.webhook_url || '')}">
          </div>

          <div class="form-group">
            <label>Message Prefix / Header <span class="text-muted" style="margin:0">(optional)</span></label>
            <input type="text" id="dn-${c.type}-prefix" class="input-full" maxlength="200" placeholder="e.g. 🚨 Heads up team!" value="${esc(cfg.message_prefix || '')}">
          </div>

          <div class="dn-row">
            <div class="form-group" style="flex:1">
              <label>Mention</label>
              <select id="dn-${c.type}-mention-sel" class="input-full" onchange="onDiscordMentionChange('${c.type}')">
                <option value="none" ${mentionSel==='none'?'selected':''}>No mention</option>
                <option value="@here" ${mentionSel==='@here'?'selected':''}>@here</option>
                <option value="@everyone" ${mentionSel==='@everyone'?'selected':''}>@everyone</option>
                <option value="custom" ${mentionSel==='custom'?'selected':''}>Custom (role/user)</option>
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label>Custom mention</label>
              <input type="text" id="dn-${c.type}-mention-custom" class="input-full" placeholder="<@&roleId> or text" value="${esc(isPreset || mention===''?'':mention)}" ${mentionSel==='custom'?'':'disabled'}>
            </div>
          </div>

          <div class="dn-row">
            <div class="form-group" style="flex:1">
              <label>Embed Color</label>
              <div class="color-field">
                <input type="color" id="dn-${c.type}-color" class="color-swatch" value="${color}" oninput="document.getElementById('dn-${c.type}-color-text').value=this.value">
                <input type="text" id="dn-${c.type}-color-text" class="input-full" maxlength="7" value="${esc(color)}" oninput="if(/^#([0-9a-fA-F]{6})$/.test(this.value))document.getElementById('dn-${c.type}-color').value=this.value">
              </div>
            </div>
            <div class="form-group" style="flex:1;display:flex;align-items:flex-end">
              <label class="dn-check">
                <input type="checkbox" id="dn-${c.type}-thumb" ${cfg.include_thumbnail ? 'checked' : ''}>
                <span>Include logo / thumbnail</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>Fields to include <span class="text-muted" style="margin:0">(shown in the embed)</span></label>
            <div class="dn-fields">${fieldChecks}</div>
          </div>

          <div class="btn-group">
            <button class="btn btn-primary" onclick="saveDiscordConfig('${c.type}')">💾 Save</button>
            <button class="btn btn-secondary" onclick="previewDiscordConfig('${c.type}')">👁 Preview</button>
            <button class="btn btn-secondary" onclick="testDiscordConfig('${c.type}')">🚀 Send Test</button>
            <button class="btn btn-secondary" onclick="resetDiscordConfig('${c.type}')">↺ Reset</button>
          </div>
          <div id="dn-${c.type}-msg" class="msg hidden"></div>
        </div>

        <div class="dn-preview-wrap">
          <div class="dn-preview-label">Live Preview</div>
          <div id="dn-${c.type}-preview" class="dn-preview"></div>
        </div>
      </div>
    </div>
  </div>`;
}

function toggleDiscordCard(type) {
  discordExpanded[type] = !discordExpanded[type];
  const body = document.getElementById('dn-body-' + type);
  const chevron = document.querySelector('#dn-card-' + type + ' .dn-chevron');
  if (body) body.classList.toggle('hidden', !discordExpanded[type]);
  if (chevron) chevron.textContent = discordExpanded[type] ? '▲' : '▼';
  if (discordExpanded[type]) previewDiscordConfig(type); // auto-render preview when opened
}

function expandAllDiscord() {
  const anyClosed = discordConfigs.some(c => !discordExpanded[c.type]);
  discordConfigs.forEach(c => { discordExpanded[c.type] = anyClosed; });
  renderDiscordConfigs();
  document.getElementById('discord-expand-toggle').textContent = anyClosed ? 'Collapse all' : 'Expand all';
  if (anyClosed) discordConfigs.forEach(c => previewDiscordConfig(c.type));
}

function onDiscordEnableToggle(type) {
  const on = document.getElementById('dn-' + type + '-enabled').checked;
  const pill = document.getElementById('dn-' + type + '-pill');
  const card = document.getElementById('dn-card-' + type);
  if (pill) { pill.textContent = on ? 'Enabled' : 'Disabled'; pill.className = 'dn-status-pill ' + (on ? 'on' : 'off'); }
  if (card) card.classList.toggle('dn-disabled', !on);
}

function onDiscordMentionChange(type) {
  const sel = document.getElementById('dn-' + type + '-mention-sel').value;
  const custom = document.getElementById('dn-' + type + '-mention-custom');
  custom.disabled = sel !== 'custom';
  if (sel !== 'custom') custom.value = '';
}

// Gather the form values for a type into a config payload
function collectDiscordConfig(type) {
  const c = discordConfigs.find(x => x.type === type);
  const mentionSel = document.getElementById('dn-' + type + '-mention-sel').value;
  let mention = '';
  if (mentionSel === '@here' || mentionSel === '@everyone') mention = mentionSel;
  else if (mentionSel === 'custom') mention = document.getElementById('dn-' + type + '-mention-custom').value.trim();
  const fields = c.available_fields.filter(f => document.getElementById('dn-' + type + '-f-' + f.key).checked).map(f => f.key);
  return {
    enabled: document.getElementById('dn-' + type + '-enabled').checked,
    webhook_url: document.getElementById('dn-' + type + '-webhook').value.trim(),
    message_prefix: document.getElementById('dn-' + type + '-prefix').value.trim(),
    mention,
    embed_color: document.getElementById('dn-' + type + '-color-text').value.trim(),
    include_thumbnail: document.getElementById('dn-' + type + '-thumb').checked,
    fields,
  };
}

function discordMsg(type, kind, text) {
  const el = document.getElementById('dn-' + type + '-msg');
  if (!el) return;
  el.className = 'msg ' + kind; el.textContent = text; el.classList.remove('hidden');
}

function validateDiscordConfig(cfg) {
  if (cfg.webhook_url && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//i.test(cfg.webhook_url))
    return 'Webhook URL must be a valid Discord webhook (https://discord.com/api/webhooks/...).';
  if (cfg.embed_color && !/^#([0-9a-fA-F]{6})$/.test(cfg.embed_color))
    return 'Embed color must be a valid 6-digit hex color (e.g. #6366f1).';
  return null;
}

async function saveDiscordConfig(type) {
  const cfg = collectDiscordConfig(type);
  const err = validateDiscordConfig(cfg);
  if (err) return discordMsg(type, 'error', err);
  try {
    const updated = await api('/discord/configs/' + type, { method: 'PUT', body: JSON.stringify(cfg) });
    const idx = discordConfigs.findIndex(x => x.type === type);
    if (idx >= 0) discordConfigs[idx] = updated;
    onDiscordEnableToggle(type);
    discordMsg(type, 'success', '✅ Saved!');
    previewDiscordConfig(type);
  } catch (e) { discordMsg(type, 'error', e.message); }
}

async function testDiscordConfig(type) {
  const cfg = collectDiscordConfig(type);
  const err = validateDiscordConfig(cfg);
  if (err) return discordMsg(type, 'error', err);
  try {
    // save first so the test uses current form values
    await api('/discord/configs/' + type, { method: 'PUT', body: JSON.stringify(cfg) });
    const res = await api('/discord/configs/' + type + '/test', { method: 'POST' });
    discordMsg(type, 'success', '✅ ' + (res.message || 'Test sent!'));
  } catch (e) { discordMsg(type, 'error', e.message); }
}

async function resetDiscordConfig(type) {
  if (!confirm('Reset this notification type to its default configuration?')) return;
  try {
    const updated = await api('/discord/configs/' + type + '/reset', { method: 'POST' });
    const idx = discordConfigs.findIndex(x => x.type === type);
    if (idx >= 0) discordConfigs[idx] = updated;
    // re-render just this card
    const card = document.getElementById('dn-card-' + type);
    if (card) card.outerHTML = discordCardHTML(updated);
    discordExpanded[type] = true;
    const body = document.getElementById('dn-body-' + type);
    if (body) body.classList.remove('hidden');
    discordMsg(type, 'success', '✅ Reset to defaults.');
    previewDiscordConfig(type);
  } catch (e) { discordMsg(type, 'error', e.message); }
}

async function previewDiscordConfig(type) {
  const box = document.getElementById('dn-' + type + '-preview');
  if (!box) return;
  const cfg = collectDiscordConfig(type);
  try {
    const payload = await api('/discord/configs/' + type + '/preview', { method: 'POST', body: JSON.stringify(cfg) });
    box.innerHTML = renderDiscordEmbed(payload);
  } catch (e) {
    box.innerHTML = `<p class="msg error">${esc(e.message)}</p>`;
  }
}

// Render a Discord-like embed card from a webhook payload {content, embeds:[...]}
function renderDiscordEmbed(payload) {
  const embed = (payload.embeds && payload.embeds[0]) || {};
  const colorInt = typeof embed.color === 'number' ? embed.color : 0x5865f2;
  const colorHex = '#' + colorInt.toString(16).padStart(6, '0');
  const content = payload.content ? `<div class="dn-pv-content">${esc(payload.content)}</div>` : '';
  const fields = (embed.fields || []).map(f => `
    <div class="dn-pv-field ${f.inline ? 'inline' : ''}">
      <div class="dn-pv-fname">${esc(f.name)}</div>
      <div class="dn-pv-fval">${esc(f.value)}</div>
    </div>`).join('');
  const thumb = embed.thumbnail && embed.thumbnail.url
    ? `<img class="dn-pv-thumb" src="${esc(embed.thumbnail.url)}" alt="thumb" onerror="this.style.display='none'">` : '';
  const footer = embed.footer && embed.footer.text
    ? `<div class="dn-pv-footer">${esc(embed.footer.text)}${embed.timestamp ? ' • ' + new Date(embed.timestamp).toLocaleString() : ''}</div>` : '';
  return `
    ${content}
    <div class="dn-pv-embed" style="border-left-color:${colorHex}">
      <div class="dn-pv-embed-inner">
        <div class="dn-pv-main">
          ${embed.title ? `<div class="dn-pv-title">${esc(embed.title)}</div>` : ''}
          ${fields ? `<div class="dn-pv-fields">${fields}</div>` : ''}
          ${footer}
        </div>
        ${thumb}
      </div>
    </div>`;
}

/* ── Modal ────────────────────────────────────────────── */
function openModal(title, bodyHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

/* ── Helpers ──────────────────────────────────────────── */
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

// Lightweight toast notification (type: 'success' | 'error' | 'info').
function toast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '⚠', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${esc(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 300);
  }, type === 'error' ? 5000 : 3500);
}
function statusClass(s) { return s === 'In Progress' ? 'inprogress' : s.toLowerCase(); }
function timeAgo(d) {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff/60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins/60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs/24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}
function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function renderMarkdown(md) {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- \[x\] (.+)$/gm, '<li>✅ $1</li>')
    .replace(/^- \[ \] (.+)$/gm, '<li>⬜ $1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');
}

/* ── Init ─────────────────────────────────────────────── */
applyBranding({}); // set default favicon/logo for the login screen
if (token) { enterApp(); }
