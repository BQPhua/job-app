// ============================================================================
// OFFBOARDING MODULE — admin.html (2026-09-30)
//
// Invite-driven offboarding: HR invites an employee by email → the employee
// fills in the Exit Interview on the candidate site → six departments clear
// them → the employee acknowledges → the Payroll PIC marks payroll done.
// Backend: /api/admin/offboarding (wct-job-app-backend routes/adminOffboarding.js).
//
// Loaded by admin.html BEFORE its main inline script. Everything here only
// runs when called, so it can freely use admin.html's globals (api, apiTry,
// esc, render, setView, currentView, adminScope, selectedApp, ...) at call
// time. Styles: offboarding-admin.css.
//
// Who sees what (the server enforces all of it; the UI just hides what
// can't be used):
//   HR (bu_admin / super admin)  everything in their BU (+ job applications)
//   Payroll PIC                  all cases in their BU, read-only + payroll
//   Clearance PIC                cases with their department's checklist
//   Immediate superior           only the Reporting Unit checklists
//                                assigned to their email
// ============================================================================

const OB_FILTER_KEY = 'wct_ob_filters';
const OB_STATUS_ORDER = ['invited', 'clearance_in_progress', 'pending_acknowledgement', 'pending_payroll', 'completed', 'cancelled'];
const OB_STATUS_LABELS = {
  invited: 'Invited',
  clearance_in_progress: 'Clearance in progress',
  pending_acknowledgement: 'Pending acknowledgement',
  pending_payroll: 'Pending payroll',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const OB_EVENT_LABELS = {
  invited: 'Invitation sent',
  invite_resent: 'Invitation re-sent',
  invite_opened: 'Employee opened the invitation',
  details_updated: 'Case details updated',
  interview_saved: 'Exit Interview draft saved',
  interview_submitted: 'Exit Interview submitted',
  section_saved: 'Checklist progress saved',
  section_signed: 'Checklist signed',
  section_reopened: 'Checklist reopened',
  reminder_sent: 'Reminder sent',
  acknowledged: 'Employee acknowledged the clearance',
  hr_signed: 'HR signed Section D',
  payroll_done: 'Payroll marked done',
  cancelled: 'Case cancelled',
  email_failed: 'Email could not be sent',
};

const OB_ICON = {
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  chev: '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  bell: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  pdf: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
  mail: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7 10-7"/></svg>',
  link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  clipboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>',
  wallet: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>',
};

const OB = {
  meta: null,
  view: 'all',            // 'all' | 'tasks'
  filters: { q: '', status: [], business_unit: '', department: '', company: '', clearance_department_id: '', last_day_from: '', last_day_to: '', due: '' },
  sort: 'last_day',
  dir: 'asc',
  page: 1,
  pageSize: 25,
  data: null,             // { rows, total, counts }
  loading: false,
  selected: new Set(),
  tasks: { sections: [], payroll: [], count: 0 },
  drawer: null,           // { id, bundle, tab, editing }
  seq: 0,
  searchTimer: null,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function obAttr(v) { return esc(v).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
const OB_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function obDate(v) {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return esc(v);
  return `${Number(s.slice(8, 10))} ${OB_MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
}
function obDateTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return esc(v); }
}
function obApi(method, path, body) {
  const url = `/admin/offboarding${path}`;
  const opts = { admin: true };
  if (method === 'get') return apiTry(() => api.get(url, opts));
  if (method === 'post') return apiTry(() => api.post(url, body || {}, opts));
  if (method === 'patch') return apiTry(() => api.patch(url, body || {}, opts));
  if (method === 'put') return apiTry(() => apiRequest(url, { method: 'PUT', body: body || {}, admin: true }));
  throw new Error('bad method');
}
function obIsHr() {
  if (OB.meta) return !!OB.meta.is_hr;
  return adminScope === 'ALL' || (!!adminScope && adminScope !== 'SUPERIOR' && adminScope !== 'GROUP');
}
/** Sessions that read cases from every BU (super admin, group-wide Payroll PIC). */
function obAllUnits() {
  return adminScope === 'ALL' || !!(OB.meta && OB.meta.all_units);
}
function obToast(msg, kind) {
  let host = document.getElementById('obToasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'obToasts';
    host.className = 'ob-toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = `ob-toast${kind === 'err' ? ' err' : ''}`;
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 7000 : 4000);
}
function obBadge(status) {
  return `<span class="ob-badge ${obAttr(status)}">${esc(OB_STATUS_LABELS[status] || status)}</span>`;
}
function obDueHtml(row) {
  if (row.status === 'completed' || row.status === 'cancelled' || row.days_left == null) return '';
  if (row.days_left < 0) return `<span class="ob-due over">Overdue ${-row.days_left}d</span>`;
  if (row.days_left === 0) return '<span class="ob-due soon">Today</span>';
  if (row.days_left <= 7) return `<span class="ob-due soon">in ${row.days_left}d</span>`;
  return '';
}
function obProgressHtml(signed, total) {
  const pct = total ? Math.round((signed / total) * 100) : 0;
  return `<div class="ob-progress" aria-label="${signed} of ${total} departments cleared"><div class="ob-bar"><span style="width:${pct}%"></span></div><span class="t">${signed}/${total}</span></div>`;
}
function obSaveFilters() {
  try { localStorage.setItem(OB_FILTER_KEY, JSON.stringify({ filters: OB.filters, sort: OB.sort, dir: OB.dir, view: OB.view })); } catch (e) { /* storage unavailable */ }
}
function obLoadFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(OB_FILTER_KEY) || 'null');
    if (saved && saved.filters) {
      OB.filters = { ...OB.filters, ...saved.filters, q: '' };
      OB.sort = saved.sort || OB.sort;
      OB.dir = saved.dir || OB.dir;
      OB.view = saved.view === 'tasks' ? 'tasks' : 'all';
    }
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Session bootstrap (called by admin.html after sign-in / on page load)
// ---------------------------------------------------------------------------
async function obLoadMeta() {
  const { data } = await obApi('get', '/meta');
  if (data) OB.meta = data;
  return OB.meta;
}
async function obLoadTasks() {
  const { data } = await obApi('get', '/my-tasks');
  if (data) OB.tasks = data;
  if (typeof render === 'function' && typeof renderSidebarNavOnly === 'function') renderSidebarNavOnly();
  return OB.tasks;
}

/** Entering the Offboarding view (from setView). */
async function obEnter() {
  if (!OB._filtersLoaded) {
    obLoadFilters();
    OB._filtersLoaded = true;
    // PICs and superiors mostly care about their own work.
    if (!obIsHr() && !(OB.meta && OB.meta.roles && OB.meta.roles.payroll_pic)) OB.view = 'tasks';
  }
  if (!OB.meta) await obLoadMeta();
  await Promise.all([obLoadTasks(), OB.view === 'all' ? obLoadList() : Promise.resolve()]);
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------
function obPageHtml() {
  const hr = obIsHr();
  const payroll = !!(OB.meta && OB.meta.roles && OB.meta.roles.payroll_pic);
  const taskCount = OB.tasks.count || 0;
  return `
  <div class="ob-root">
    <div class="ob-head">
      <div class="ob-seg" role="group" aria-label="View">
        <button type="button" aria-pressed="${OB.view === 'all'}" onclick="obSetView('all')">All cases</button>
        <button type="button" aria-pressed="${OB.view === 'tasks'}" onclick="obSetView('tasks')">My tasks ${taskCount ? `<span class="ob-count">${taskCount}</span>` : ''}</button>
      </div>
      <div class="ob-head-actions">
        ${(hr || payroll) && OB.view === 'all' ? `<button class="btn btn-outline btn-sm" onclick="obExportCsv()">${OB_ICON.download} Export CSV</button>` : ''}
        ${hr ? `<button class="btn btn-primary btn-sm" onclick="obOpenInvite()">${OB_ICON.plus} Invite employee</button>` : ''}
      </div>
    </div>
    ${OB.view === 'all' ? `
      <div class="ob-kpis" id="obKpis">${obKpisHtml()}</div>
      ${obToolbarHtml()}
      <div id="obBulk"></div>
      <div id="obResults">${obResultsHtml()}</div>
    ` : `<div id="obTasks">${obTasksHtml()}</div>`}
  </div>`;
}

function obRenderPage() {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `<div class="wrap">${obPageHtml()}</div>`;
  obRenderBulk();
  if (typeof wxAfterRender === 'function') wxAfterRender();
}
function obRenderResults() {
  const k = document.getElementById('obKpis');
  if (k) k.innerHTML = obKpisHtml();
  const r = document.getElementById('obResults');
  if (r) r.innerHTML = obResultsHtml();
  const t = document.getElementById('obTasks');
  if (t) t.innerHTML = obTasksHtml();
  obRenderBulk();
  if (typeof wxAfterRender === 'function') wxAfterRender();
}

function obSetView(v) {
  OB.view = v;
  obSaveFilters();
  obRenderPage();
  if (v === 'all') obLoadList(); else obLoadTasks().then(obRenderResults);
}

// ---------------------------------------------------------------------------
// KPI tiles
// ---------------------------------------------------------------------------
function obKpisHtml() {
  const c = (OB.data && OB.data.counts) || {};
  const f = OB.filters;
  const single = f.status.length === 1 ? f.status[0] : null;
  const tile = (label, n, { status, due, color, alert }) => {
    const pressed = (status && single === status && !f.due) || (due && f.due === due);
    const click = status ? `obKpiStatus('${status}')` : `obKpiDue('${due}')`;
    return `<button type="button" class="ob-kpi${alert && n ? ' is-alert' : ''}" style="--kpi:${color}" aria-pressed="${!!pressed}" onclick="${click}">
      <div class="n">${n == null ? '–' : n}</div><div class="l">${label}</div></button>`;
  };
  return [
    tile('Invited', c.invited, { status: 'invited', color: 'var(--info)' }),
    tile('In clearance', c.clearance_in_progress, { status: 'clearance_in_progress', color: 'var(--warn)' }),
    tile('Pending acknowledgement', c.pending_acknowledgement, { status: 'pending_acknowledgement', color: '#5B36A8' }),
    tile('Pending payroll', c.pending_payroll, { status: 'pending_payroll', color: '#1D6A85' }),
    tile('Overdue', c.overdue, { due: 'overdue', color: 'var(--danger)', alert: true }),
    tile('Completed this month', c.completed_this_month, { status: 'completed', color: 'var(--ok)' }),
  ].join('');
}
function obKpiStatus(status) {
  const f = OB.filters;
  const same = f.status.length === 1 && f.status[0] === status && !f.due;
  f.status = same ? [] : [status];
  f.due = '';
  obApplyFilters(true);
}
function obKpiDue(due) {
  OB.filters.due = OB.filters.due === due ? '' : due;
  OB.filters.status = [];
  obApplyFilters(true);
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
function obToolbarHtml() {
  const f = OB.filters;
  const m = OB.meta || { departments: [], companies: [], business_units: [] };
  const isSuper = obAllUnits();
  const statusSummary = f.status.length === 0 ? 'All statuses' : f.status.length === 1 ? OB_STATUS_LABELS[f.status[0]] : `${f.status.length} statuses`;
  const companies = [...new Set((m.companies || []).map((c) => c.name))].sort();
  const active = obActiveFilterCount();
  return `
  <div class="ob-toolbar" role="search">
    <div class="ob-toolbar-row">
      <div class="ob-search">
        ${OB_ICON.search}
        <label for="obSearch" class="ob-sr">Search offboarding cases</label>
        <input id="obSearch" type="search" placeholder="Search name, email, reference, position, department…" value="${obAttr(f.q)}" oninput="obOnSearch(this.value)" autocomplete="off">
      </div>
      <details class="ob-multi" id="obStatusMulti">
        <summary aria-label="Filter by status">${esc(statusSummary)}</summary>
        <div class="ob-multi-panel">
          ${OB_STATUS_ORDER.map((s) => `<label><input type="checkbox" value="${s}" ${f.status.includes(s) ? 'checked' : ''} onchange="obToggleStatus('${s}', this.checked)"> ${esc(OB_STATUS_LABELS[s])}</label>`).join('')}
        </div>
      </details>
      ${isSuper ? `
        <label class="ob-sr" for="obBu">Business unit</label>
        <select id="obBu" onchange="obSetFilter('business_unit', this.value)">
          <option value="">All business units</option>
          ${['E&C', 'Land', 'Mall'].map((b) => `<option value="${obAttr(b)}" ${f.business_unit === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
        </select>` : ''}
      <label class="ob-sr" for="obDept">Waiting on department</label>
      <select id="obDept" onchange="obSetFilter('clearance_department_id', this.value)">
        <option value="">Any department</option>
        ${(m.departments || []).map((d) => `<option value="${d.id}" ${String(f.clearance_department_id) === String(d.id) ? 'selected' : ''}>Waiting on ${esc(d.name)}</option>`).join('')}
      </select>
      ${companies.length ? `
        <label class="ob-sr" for="obCompany">Company</label>
        <select id="obCompany" onchange="obSetFilter('company', this.value)">
          <option value="">All companies</option>
          ${companies.map((c) => `<option value="${obAttr(c)}" ${f.company === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>` : ''}
    </div>
    <div class="ob-toolbar-row">
      <button type="button" class="ob-chip danger" aria-pressed="${f.due === 'overdue'}" onclick="obKpiDue('overdue')">Overdue</button>
      <button type="button" class="ob-chip" aria-pressed="${f.due === '7d'}" onclick="obKpiDue('7d')">Last day within 7 days</button>
      <label class="ob-inline">Last day from <input class="ob-input" type="date" value="${obAttr(f.last_day_from)}" onchange="obSetFilter('last_day_from', this.value)"></label>
      <label class="ob-inline">to <input class="ob-input" type="date" value="${obAttr(f.last_day_to)}" onchange="obSetFilter('last_day_to', this.value)"></label>
      ${active ? `<button type="button" class="ob-link" onclick="obClearFilters()">Clear filters (${active})</button>` : ''}
    </div>
  </div>`;
}
function obActiveFilterCount() {
  const f = OB.filters;
  return ['q', 'business_unit', 'department', 'company', 'clearance_department_id', 'last_day_from', 'last_day_to', 'due']
    .filter((k) => f[k]).length + (f.status.length ? 1 : 0);
}
function obOnSearch(v) {
  OB.filters.q = v;
  clearTimeout(OB.searchTimer);
  OB.searchTimer = setTimeout(() => { OB.page = 1; obLoadList(); }, 300);
}
function obToggleStatus(s, on) {
  const set = new Set(OB.filters.status);
  if (on) set.add(s); else set.delete(s);
  OB.filters.status = OB_STATUS_ORDER.filter((x) => set.has(x));
  OB.filters.due = '';
  obApplyFilters(false);
  const sum = document.querySelector('#obStatusMulti summary');
  if (sum) sum.textContent = OB.filters.status.length === 0 ? 'All statuses' : OB.filters.status.length === 1 ? OB_STATUS_LABELS[OB.filters.status[0]] : `${OB.filters.status.length} statuses`;
}
function obSetFilter(k, v) { OB.filters[k] = v; obApplyFilters(true); }
function obClearFilters() {
  OB.filters = { q: '', status: [], business_unit: '', department: '', company: '', clearance_department_id: '', last_day_from: '', last_day_to: '', due: '' };
  obApplyFilters(true);
}
function obApplyFilters(rerenderToolbar) {
  OB.page = 1;
  OB.selected.clear();
  obSaveFilters();
  if (rerenderToolbar) obRenderPage();
  obLoadList();
}
// Close the status popover when clicking elsewhere.
document.addEventListener('click', (e) => {
  const d = document.getElementById('obStatusMulti');
  if (d && d.open && !d.contains(e.target)) d.open = false;
});

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
function obQueryString(extra = {}) {
  const f = OB.filters;
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q.trim());
  if (f.status.length) p.set('status', f.status.join(','));
  ['business_unit', 'department', 'company', 'clearance_department_id', 'last_day_from', 'last_day_to', 'due'].forEach((k) => { if (f[k]) p.set(k, f[k]); });
  p.set('sort', OB.sort);
  p.set('dir', OB.dir);
  p.set('page', OB.page);
  p.set('page_size', OB.pageSize);
  Object.entries(extra).forEach(([k, v]) => p.set(k, v));
  return p.toString();
}
async function obLoadList() {
  const seq = ++OB.seq;
  OB.loading = true;
  if (!OB.data) obRenderResults();
  const { data, error } = await obApi('get', `/cases?${obQueryString()}`);
  if (seq !== OB.seq) return; // a newer request superseded this one
  OB.loading = false;
  if (error) { obToast(`Could not load cases: ${error.message}`, 'err'); return; }
  OB.data = data;
  if (currentView === 'offboarding') obRenderResults();
}
function obSort(key) {
  if (OB.sort === key) OB.dir = OB.dir === 'asc' ? 'desc' : 'asc';
  else { OB.sort = key; OB.dir = 'asc'; }
  obSaveFilters();
  obLoadList();
}
function obGoPage(p) { OB.page = p; OB.selected.clear(); obLoadList(); }

function obResultsHtml() {
  if (!OB.data) {
    return `<div class="ob-table-wrap" aria-busy="true"><div style="padding:18px;display:grid;gap:12px;">${'<div class="ob-skeleton"></div>'.repeat(6)}</div></div>`;
  }
  const rows = OB.data.rows || [];
  if (rows.length === 0) {
    const filtered = obActiveFilterCount() > 0;
    return `<div class="ob-table-wrap"><div class="ob-empty">
      <h3>${filtered ? 'No cases match these filters' : 'No offboarding cases yet'}</h3>
      <p>${filtered ? 'Try clearing a filter or searching for something else.' : (obIsHr() ? 'Use “Invite employee” to start an offboarding.' : 'Cases you are involved in will appear here.')}</p>
      ${filtered ? '<button class="btn btn-outline btn-sm" onclick="obClearFilters()">Clear filters</button>' : ''}
    </div></div>`;
  }
  const hr = obIsHr();
  const sortTh = (key, label) => {
    const on = OB.sort === key;
    const arrow = on ? (OB.dir === 'asc' ? '▲' : '▼') : '';
    return `<th aria-sort="${on ? (OB.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" onclick="obSort('${key}')">${label} <span aria-hidden="true">${arrow}</span></button></th>`;
  };
  const allChecked = rows.length > 0 && rows.every((r) => OB.selected.has(r.id));
  const totalPages = Math.max(1, Math.ceil(OB.data.total / OB.pageSize));
  return `
  <div class="ob-table-wrap">
    <table class="ob-table">
      <thead><tr>
        ${hr ? `<th style="width:36px"><input type="checkbox" class="row-check" aria-label="Select all on this page" ${allChecked ? 'checked' : ''} onclick="event.stopPropagation()" onchange="obSelectAll(this.checked)"></th>` : ''}
        ${sortTh('ref', 'Ref')}
        ${sortTh('name', 'Employee')}
        ${obAllUnits() ? '<th>BU</th>' : ''}
        <th>Department / Position</th>
        ${sortTh('last_day', 'Last day')}
        ${sortTh('status', 'Status')}
        <th>Clearance</th>
        <th>Waiting on</th>
      </tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr class="ob-row${OB.selected.has(r.id) ? ' is-selected' : ''}" tabindex="0" onclick="obOpenCase('${r.id}')" onkeydown="if(event.key==='Enter'){obOpenCase('${r.id}')}">
            ${hr ? `<td onclick="event.stopPropagation()"><input type="checkbox" class="row-check" aria-label="Select ${obAttr(r.employee_name)}" ${OB.selected.has(r.id) ? 'checked' : ''} onchange="obSelectRow('${r.id}', this.checked)"></td>` : ''}
            <td class="ob-ref">${esc(r.ref_no)}</td>
            <td class="ob-emp"><div class="nm">${esc(r.employee_name)}</div><div class="em">${esc(r.employee_email)}</div></td>
            ${obAllUnits() ? `<td>${esc(r.business_unit)}</td>` : ''}
            <td><div>${esc(r.department || '—')}</div><div class="ob-sub">${esc(r.position || '')}</div></td>
            <td class="ob-date">${obDate(r.effective_last_day)}<br>${obDueHtml(r)}</td>
            <td>${obBadge(r.status)}</td>
            <td>${r.status === 'invited' || r.status === 'cancelled' ? '<span class="ob-sub">—</span>' : obProgressHtml(r.sections_signed, r.sections_total)}</td>
            <td class="ob-sub">${esc(r.waiting_on)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <div class="pagination">
    <div>${OB.data.total} case${OB.data.total === 1 ? '' : 's'}${OB.loading ? ' · refreshing…' : ''}</div>
    <div class="controls">
      <button class="btn btn-outline btn-sm" ${OB.page <= 1 ? 'disabled' : ''} onclick="obGoPage(${OB.page - 1})">← Prev</button>
      <span>Page ${OB.page} of ${totalPages}</span>
      <button class="btn btn-outline btn-sm" ${OB.page >= totalPages ? 'disabled' : ''} onclick="obGoPage(${OB.page + 1})">Next →</button>
    </div>
  </div>`;
}

function obSelectRow(id, on) { if (on) OB.selected.add(id); else OB.selected.delete(id); obRenderResults(); }
function obSelectAll(on) {
  (OB.data.rows || []).forEach((r) => { if (on) OB.selected.add(r.id); else OB.selected.delete(r.id); });
  obRenderResults();
}
function obRenderBulk() {
  const el = document.getElementById('obBulk');
  if (!el) return;
  const n = OB.selected.size;
  el.innerHTML = n ? `
    <div class="ob-bulk" role="region" aria-label="Bulk actions">
      <span class="grow">${n} selected</span>
      <button class="btn btn-sm" onclick="obBulkRemind()">${OB_ICON.bell} Remind pending departments</button>
      <button class="btn btn-sm" onclick="OB.selected.clear();obRenderResults();">Clear</button>
    </div>` : '';
}
async function obBulkRemind() {
  const ids = Array.from(OB.selected);
  if (!confirm(`Send a reminder to every department that hasn't signed yet, for ${ids.length} case(s)?`)) return;
  showLoading('Sending reminders…');
  const { data, error } = await obApi('post', '/cases/remind-bulk', { case_ids: ids });
  hideLoading();
  if (error) return obToast(error.message, 'err');
  OB.selected.clear();
  obToast(`Sent ${data.sent} reminder(s) across ${data.cases} case(s)${data.skipped ? ` · ${data.skipped} skipped (not in clearance)` : ''}.`);
  obLoadList();
}

async function obExportCsv() {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/offboarding/cases/export.csv?${obQueryString()}`, { headers: { Authorization: `Bearer ${api.getAdminToken()}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `offboarding-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { obToast(`Export failed: ${e.message}`, 'err'); }
}

// ---------------------------------------------------------------------------
// My tasks
// ---------------------------------------------------------------------------
function obDaysBadge(days) {
  if (days == null) return '';
  if (days < 0) return `<span class="ob-due over">Overdue ${-days}d</span>`;
  if (days <= 7) return `<span class="ob-due soon">${days === 0 ? 'Last day today' : `${days}d left`}</span>`;
  return `<span class="ob-sub">${days} days left</span>`;
}
function obTasksHtml() {
  const t = OB.tasks || { sections: [], payroll: [] };
  if (!t.sections.length && !t.payroll.length) {
    return `<div class="ob-table-wrap"><div class="ob-empty"><h3>You're all caught up</h3><p>No checklists or payroll actions are waiting for you right now.</p></div></div>`;
  }
  return `
    ${t.sections.length ? `
      <div class="ob-section-title">Clearance checklists to complete (${t.sections.length})</div>
      <div class="ob-task-list">
        ${t.sections.map((s) => `
          <div class="ob-task">
            <div class="ico">${OB_ICON.clipboard}</div>
            <div class="main">
              <div class="t">${esc(s.department_name)} — ${esc(s.employee_name)}</div>
              <div class="s">${esc(s.ref_no)} · ${esc(s.position || '')} · ${esc(s.business_unit)} · Last day ${obDate(s.last_day)} ${obDaysBadge(s.days_left)}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="obOpenCase('${s.case_id}', 'clearance', ${Number(s.department_id)})">Open checklist</button>
          </div>`).join('')}
      </div>` : ''}
    ${t.payroll.length ? `
      <div class="ob-section-title">Final pay to process (${t.payroll.length})</div>
      <div class="ob-task-list">
        ${t.payroll.map((c) => `
          <div class="ob-task">
            <div class="ico" style="background:#E3F1F6;color:#1D6A85;">${OB_ICON.wallet}</div>
            <div class="main">
              <div class="t">${esc(c.employee_name)}</div>
              <div class="s">${esc(c.ref_no)} · ${esc(c.position || '')} · ${esc(c.business_unit)} · Acknowledged ${obDateTime(c.acknowledged_at)}</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="obOpenCase('${c.id}')">Open case</button>
          </div>`).join('')}
      </div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Case drawer
// ---------------------------------------------------------------------------
function obDrawerEl() {
  let d = document.getElementById('obDrawer');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'obDrawer';
    d.className = 'ob-drawer';
    d.setAttribute('aria-labelledby', 'obDrawerTitle');
    d.addEventListener('close', () => { OB.drawer = null; if (currentView === 'offboarding') { obLoadTasks().then(obRenderResults); if (OB.view === 'all') obLoadList(); } });
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // backdrop click
    document.body.appendChild(d);
  }
  return d;
}
async function obOpenCase(id, tab, focusDept) {
  showLoading('Opening case…');
  const { data, error } = await obApi('get', `/cases/${id}`);
  hideLoading();
  if (error) return obToast(error.message, 'err');
  let startTab = tab || (data.sections.some((s) => s.can_edit) ? 'clearance' : 'overview');
  if (startTab === 'interview' && !(data.can && data.can.view_exit_interview)) startTab = 'overview';
  OB.drawer = { id, bundle: data, tab: startTab, editing: false, focusDept };
  const d = obDrawerEl();
  obRenderDrawer();
  if (!d.open) d.showModal();
  if (focusDept) {
    const sec = document.getElementById(`obSec${focusDept}`);
    if (sec) { sec.open = true; sec.scrollIntoView({ block: 'start' }); }
  }
}
function obCloseDrawer() { const d = document.getElementById('obDrawer'); if (d && d.open) d.close(); }
async function obReloadCase(message) {
  if (!OB.drawer) return;
  const { data, error } = await obApi('get', `/cases/${OB.drawer.id}`);
  if (!error) { OB.drawer.bundle = data; obRenderDrawer(); }
  if (message) obToast(message);
}
function obSetTab(tab) {
  if (!OB.drawer) return;
  OB.drawer.tab = tab;
  obRenderDrawer();
  const btn = document.getElementById(`obTab-${tab}`);
  if (btn) btn.focus();
}
function obVisibleTabs() {
  const canInterview = OB.drawer && OB.drawer.bundle.can && OB.drawer.bundle.can.view_exit_interview;
  return canInterview ? ['overview', 'interview', 'clearance', 'timeline'] : ['overview', 'clearance', 'timeline'];
}
function obTabKey(e) {
  const tabs = obVisibleTabs();
  const i = tabs.indexOf(OB.drawer.tab);
  if (e.key === 'ArrowRight') { e.preventDefault(); obSetTab(tabs[(i + 1) % tabs.length]); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); obSetTab(tabs[(i + tabs.length - 1) % tabs.length]); }
}

function obStepsHtml(c) {
  const idx = { invited: 0, clearance_in_progress: 2, pending_acknowledgement: 3, pending_payroll: 4, completed: 5, cancelled: -1 }[c.status];
  const steps = ['Invited', 'Exit Interview', `Clearance ${c.sections_signed}/${c.sections_total}`, 'Acknowledged', 'Payroll done'];
  const done = (i) => (c.status === 'completed') || (i < idx) || (i === 1 && idx >= 2);
  const now = (i) => (i === idx) || (c.status === 'invited' && i === 1);
  return `<ol class="ob-steps" aria-label="Progress">${steps.map((s, i) => `<li class="${done(i) ? 'done' : (now(i) && c.status !== 'cancelled' ? 'now' : '')}">${esc(s)}</li>`).join('')}</ol>`;
}

function obRenderDrawer() {
  const d = obDrawerEl();
  const b = OB.drawer.bundle;
  const c = b.case;
  const can = b.can || {};
  const tab = OB.drawer.tab;
  const actions = [
    can.payroll_done ? `<button class="btn btn-success btn-sm" onclick="obPayrollDone()">${OB_ICON.check} Mark payroll done</button>` : '',
    can.remind ? `<button class="btn btn-outline btn-sm" onclick="obRemindCase()">${OB_ICON.bell} Remind pending</button>` : '',
    can.resend_invite ? `<button class="btn btn-outline btn-sm" onclick="obResendInvite()">${OB_ICON.mail} Resend invite</button>` : '',
    b.invite_link && c.status === 'invited' ? `<button class="btn btn-outline btn-sm" onclick="obCopyInvite()">${OB_ICON.link} Copy invite link</button>` : '',
    can.pdf_exit_interview ? `<button class="btn btn-outline btn-sm" onclick="obPdf('exit-interview')">${OB_ICON.pdf} Exit Interview PDF</button>` : '',
    can.pdf_clearance ? `<button class="btn btn-outline btn-sm" onclick="obPdf('clearance')">${OB_ICON.pdf} Clearance PDF</button>` : '',
    can.cancel ? `<button class="btn btn-outline-danger btn-sm" onclick="obCancelCase()">Cancel case</button>` : '',
  ].filter(Boolean).join('');
  const tabBtn = (id, label) => `<button role="tab" type="button" id="obTab-${id}" aria-selected="${tab === id}" aria-controls="obPanel" tabindex="${tab === id ? 0 : -1}" onclick="obSetTab('${id}')" onkeydown="obTabKey(event)">${label}</button>`;
  d.innerHTML = `
    <div class="ob-drawer-head">
      <div class="ob-drawer-top">
        <div>
          <h2 id="obDrawerTitle">${esc(c.employee_name)}</h2>
          <div class="meta">${obBadge(c.status)} <span>${esc(c.ref_no)}</span> <span>${esc(c.business_unit)}</span> <span>Last day ${obDate(c.effective_last_day)}</span></div>
        </div>
        <button class="ob-x" type="button" onclick="obCloseDrawer()" aria-label="Close">${OB_ICON.x}</button>
      </div>
      ${c.status === 'cancelled' ? `<div class="ob-alert warn" style="margin-top:12px">Cancelled ${obDateTime(c.cancelled_at)} — ${esc(c.cancel_reason || '')}</div>` : obStepsHtml(c)}
      ${actions ? `<div class="ob-actions">${actions}</div>` : '<div style="height:10px"></div>'}
      <div class="ob-tabs" role="tablist" aria-label="Case sections">
        ${tabBtn('overview', 'Overview')}${can.view_exit_interview ? tabBtn('interview', 'Exit Interview') : ''}${tabBtn('clearance', `Clearance (${c.sections_signed}/${c.sections_total})`)}${tabBtn('timeline', 'Timeline')}
      </div>
    </div>
    <div class="ob-drawer-body" role="tabpanel" id="obPanel" aria-labelledby="obTab-${tab}">
      ${tab === 'overview' ? obOverviewHtml(b) : tab === 'interview' ? obInterviewHtml(b) : tab === 'clearance' ? obClearanceHtml(b) : obTimelineHtml(b)}
    </div>`;
}

function obKv(k, v) { return `<div><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`; }

function obOverviewHtml(b) {
  const c = b.case;
  if (OB.drawer.editing) return obEditHtml(c);
  return `
    <div class="ob-card">
      <div style="display:flex;align-items:center;margin-bottom:10px;"><h3 style="margin:0">Employee</h3>
        ${b.can.edit_details ? `<button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="OB.drawer.editing=true;obRenderDrawer()">${OB_ICON.edit} Edit</button>` : ''}</div>
      <div class="ob-kv">
        ${obKv('Email', esc(c.employee_email))}
        ${obKv('Company', esc(c.company_name || '—'))}
        ${obKv('Department / site', esc(c.department || '—'))}
        ${obKv('Position', esc(c.position || '—'))}
        ${obKv('Date joined', obDate(c.date_joined))}
        ${obKv('Immediate superior', `${esc(c.immediate_superior_name || '—')}${c.immediate_superior_email ? `<div class="ob-sub">${esc(c.immediate_superior_email)}</div>` : '<div class="ob-sub" style="color:#B42318">No superior email yet. Add one with Edit details so they can sign the Reporting Unit</div>'}`)}
        ${obKv('Notice period', c.notice_period_days != null ? `${c.notice_period_days} days` : '—')}
        ${obKv('Official last day', obDate(c.official_last_day))}
        ${obKv('Actual last day', obDate(c.actual_last_day))}
        ${obKv('Linked application', c.application_id ? 'Yes' : '—')}
      </div>
    </div>
    <div class="ob-card">
      <h3>Key dates</h3>
      <div class="ob-kv">
        ${obKv('Invited', `${obDateTime(c.invited_at)}<div class="ob-sub">by ${esc(c.invited_by_email || '')}</div>`)}
        ${obKv('Exit Interview submitted', obDateTime(c.submitted_at))}
        ${obKv('Acknowledged by employee', c.acknowledged_at ? `${obDateTime(c.acknowledged_at)}<div class="ob-sub">${esc(c.acknowledged_signature_name || '')}</div>` : '—')}
        ${obKv('Payroll done', c.payroll_completed_at ? `${obDateTime(c.payroll_completed_at)}<div class="ob-sub">${esc(c.payroll_completed_by_email || '')}${c.payroll_remarks ? ` — ${esc(c.payroll_remarks)}` : ''}</div>` : '—')}
      </div>
    </div>`;
}

function obEditHtml(c) {
  const f = (id, label, value, type = 'text', extra = '') => `<div class="ob-field"><label for="obE_${id}">${label}</label><input id="obE_${id}" type="${type}" value="${obAttr(value == null ? '' : value)}" ${extra}></div>`;
  return `
    <div class="ob-card">
      <h3>Edit case details</h3>
      <div class="ob-form-grid">
        ${f('employee_name', 'Full name', c.employee_name)}
        ${c.status === 'invited' && !c.employee_user_id ? f('employee_email', 'Email', c.employee_email, 'email') : ''}
        ${f('company_name', 'Company', c.company_name)}
        ${f('department', 'Department / site', c.department)}
        ${f('position', 'Position', c.position)}
        ${f('date_joined', 'Date joined', c.date_joined, 'date')}
        ${f('immediate_superior_name', 'Immediate superior', c.immediate_superior_name)}
        ${f('immediate_superior_email', 'Superior email (the Reporting Unit) <span class="req">*</span>', c.immediate_superior_email, 'email', 'required')}
        ${f('notice_period_days', 'Notice period (days)', c.notice_period_days, 'number', 'min="0"')}
        ${f('official_last_day', 'Official last day', c.official_last_day, 'date')}
        ${f('actual_last_day', 'Actual last day', c.actual_last_day, 'date', c.official_last_day ? `min="${obAttr(c.official_last_day)}"` : '')}
      </div>
      <p class="ob-note" style="margin-top:8px">The actual last day can't be before the official last day.</p>
      <div id="obEditErr"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button class="btn btn-outline btn-sm" onclick="OB.drawer.editing=false;obRenderDrawer()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="obSaveEdit()">Save changes</button>
      </div>
    </div>`;
}
async function obSaveEdit() {
  const c = OB.drawer.bundle.case;
  const keys = ['employee_name', 'employee_email', 'company_name', 'department', 'position', 'date_joined', 'immediate_superior_name', 'immediate_superior_email', 'notice_period_days', 'official_last_day', 'actual_last_day'];
  const body = {};
  keys.forEach((k) => {
    const el = document.getElementById(`obE_${k}`);
    if (!el) return;
    const v = el.value.trim();
    const cur = c[k] == null ? '' : String(c[k]);
    if (v !== cur) body[k] = v;
  });
  if (!Object.keys(body).length) { OB.drawer.editing = false; return obRenderDrawer(); }
  const pick = (k) => (k in body ? body[k] : (c[k] == null ? '' : String(c[k]).slice(0, 10)));
  const editErr = (m) => { document.getElementById('obEditErr').innerHTML = `<div class="ob-alert err" style="margin-top:12px" role="alert">${esc(m)}</div>`; };
  if (pick('official_last_day') && pick('actual_last_day') && pick('actual_last_day') < pick('official_last_day')) return editErr('Actual last day cannot be before the official last day.');
  if ('immediate_superior_email' in body && !body.immediate_superior_email) return editErr('Superior email is required — the immediate superior signs the Reporting Unit checklist.');
  const { data, error } = await obApi('patch', `/cases/${c.id}`, body);
  if (error) { document.getElementById('obEditErr').innerHTML = `<div class="ob-alert err" style="margin-top:12px">${esc(error.message)}</div>`; return; }
  OB.drawer.bundle = data;
  OB.drawer.editing = false;
  obRenderDrawer();
  obToast('Case details saved.');
}

function obInterviewHtml(b) {
  const ei = b.exitInterview || {};
  const c = b.case;
  if (!b.exit_interview_submitted) {
    return `<div class="ob-card"><div class="ob-empty" style="padding:24px"><h3>Waiting for the employee</h3><p>${esc(c.employee_name)} hasn't submitted the Exit Interview yet.${b.can.resend_invite ? ' You can resend the invitation from the actions above.' : ''}</p></div></div>`;
  }
  if (!b.can.view_exit_interview) return '<p class="ob-note">The Exit Interview is confidential to HR.</p>';
  const reasons = (ei.reasons || []).map((r) => `<span class="ob-reason">${esc(r)}</span>`).join('');
  const others = (ei.reasons_other || []).map((r) => `<span class="ob-reason custom">${esc(r)}</span>`).join('');
  const hrSigned = !!ei.hr_signed_at;
  return `
    <div class="ob-card">
      <h3>B. Reasons for leaving</h3>
      <div class="ob-reasons">${reasons}${others}${!reasons && !others ? '<span class="ob-sub">None given</span>' : ''}</div>
    </div>
    <div class="ob-card">
      <h3>C. Comments / suggestions</h3>
      <div class="ob-quote">${esc(ei.comments || '—')}</div>
      <div style="margin-top:12px;display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;">
        <span class="ob-sub">Signed by employee</span><span class="ob-sig">${esc(ei.employee_signature_name)}</span><span class="ob-sub">${obDateTime(ei.employee_signed_at)}</span>
      </div>
    </div>
    <div class="ob-card">
      <h3>D. HR sign-off</h3>
      ${hrSigned ? `
        <div class="ob-kv">
          ${obKv('Signed by', `<span class="ob-sig">${esc(ei.hr_signed_name)}</span>`)}
          ${obKv('Position', esc(ei.hr_signed_position))}
          ${obKv('Date', obDateTime(ei.hr_signed_at))}
          ${obKv('Comments', esc(ei.hr_comments || '—'))}
        </div>` : ''}
      ${b.can.hr_signoff ? `
        <div class="ob-form-grid" style="margin-top:${hrSigned ? '14px' : '0'}">
          <div class="ob-field"><label for="obHrName">Full name <span class="req">*</span></label><input id="obHrName" value="${obAttr(hrSigned ? ei.hr_signed_name : (currentUserProfile && currentUserProfile.name) || '')}"></div>
          <div class="ob-field"><label for="obHrPos">Position <span class="req">*</span></label><input id="obHrPos" value="${obAttr(ei.hr_signed_position || '')}" placeholder="e.g. HR Executive"></div>
          <div class="ob-field full"><label for="obHrComments">Comments (optional)</label><textarea id="obHrComments">${esc(ei.hr_comments || '')}</textarea></div>
        </div>
        <div id="obHrErr"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px;"><button class="btn btn-primary btn-sm" onclick="obHrSignoff()">${hrSigned ? 'Update sign-off' : 'Sign Section D'}</button></div>
      ` : (!hrSigned ? '<p class="ob-note">Not signed yet.</p>' : '')}
    </div>`;
}
async function obHrSignoff() {
  const body = {
    name: document.getElementById('obHrName').value.trim(),
    position: document.getElementById('obHrPos').value.trim(),
    comments: document.getElementById('obHrComments').value.trim(),
  };
  if (!body.name || !body.position) { document.getElementById('obHrErr').innerHTML = '<div class="ob-alert err" style="margin-top:10px">Please enter your name and position.</div>'; return; }
  const { data, error } = await obApi('post', `/cases/${OB.drawer.id}/hr-signoff`, body);
  if (error) return obToast(error.message, 'err');
  OB.drawer.bundle = data;
  obRenderDrawer();
  obToast('Section D signed.');
}

function obClearanceHtml(b) {
  const c = b.case;
  if (!b.sections.length) {
    return `<div class="ob-card"><div class="ob-empty" style="padding:24px"><h3>Clearance hasn't started</h3><p>The six department checklists open as soon as ${esc(c.employee_name)} submits the Exit Interview.</p></div></div>`;
  }
  return `
    <p class="ob-note" style="margin:0 0 10px">Tick each item that has been returned or settled, add remarks where useful, then sign. ${c.status === 'clearance_in_progress' ? '' : 'Checklists are locked at this stage — HR can reopen one if something needs correcting.'}</p>
    ${b.sections.map((s) => obSectionHtml(b, s)).join('')}`;
}
function obSectionHtml(b, s) {
  const c = b.case;
  const done = s.status === 'complete';
  const editable = !done && (s.can_edit || s.can_sign_on_behalf);
  const assignee = s.assignee_email ? `Assigned to ${esc(s.assignee_email)}` : `${esc(s.department_name)} PIC`;
  const who = done
    ? `Signed by ${esc(s.signed_by_name)}${s.signed_on_behalf ? ' (on behalf, by HR)' : ''} · ${obDateTime(s.signed_at)}`
    : `${assignee}${s.last_reminded_at ? ` · reminded ${obDateTime(s.last_reminded_at)}` : ''}`;
  const openByDefault = (OB.drawer.focusDept === s.department_id) || (editable && s.can_edit);
  const items = s.items.filter((i) => editable || !i.is_other || i.custom_text || i.is_checked || i.remarks);
  const d = s.department_id;
  return `
  <details class="ob-sec${done ? ' is-done' : ''}" id="obSec${d}" ${openByDefault ? 'open' : ''}>
    <summary>
      <span class="dot">${done ? OB_ICON.check : OB_ICON.clock}</span>
      <span><span class="ttl">${esc(s.department_name)}</span><br><span class="who">${who}</span></span>
      ${OB_ICON.chev}
    </summary>
    <div class="ob-sec-body">
      ${items.map((i) => `
        <div class="ob-item">
          <input type="checkbox" id="obI_${i.id}" ${i.is_checked ? 'checked' : ''} ${editable ? '' : 'disabled'} aria-label="${obAttr(i.is_other ? 'Other item' : i.item_text)}">
          <label class="txt" for="obI_${i.id}">${i.is_other
            ? (editable ? `<input type="text" id="obC_${i.id}" value="${obAttr(i.custom_text || '')}" placeholder="Others — describe the item" aria-label="Other item description">` : `Others: ${esc(i.custom_text || '')}`)
            : esc(i.item_text)}</label>
          <div class="rmcell">${editable ? `<input type="text" id="obR_${i.id}" value="${obAttr(i.remarks || '')}" placeholder="Remarks (optional)" aria-label="Remarks for ${obAttr(i.is_other ? 'other item' : i.item_text)}">` : `<span class="rm">${esc(i.remarks || '')}</span>`}</div>
        </div>`).join('')}
      ${editable ? `
        ${!s.can_edit && s.can_sign_on_behalf ? `
          <label class="ob-behalf"><input type="checkbox" id="obBehalf${d}"> <span>I'm completing this on behalf of ${esc(s.department_name)} (e.g. the PIC is away). It will be recorded as signed by HR on behalf.</span></label>` : ''}
        <div class="ob-signbox">
          <div class="ob-field"><label for="obSign${d}">Type your full name to sign</label><input id="obSign${d}" value="${obAttr((currentUserProfile && currentUserProfile.name) || '')}" autocomplete="name"></div>
          <button class="btn btn-outline btn-sm" onclick="obSaveSection(${d}, false)">Save progress</button>
          <button class="btn btn-primary btn-sm" onclick="obSaveSection(${d}, true)">${OB_ICON.check} Sign ${esc(s.department_name)}</button>
        </div>
        ${b.can.remind && !s.can_edit ? `<div style="margin-top:8px"><button class="ob-link" onclick="obRemindCase([${d}])">Send a reminder to ${esc(s.department_name)}</button></div>` : ''}
      ` : ''}
      ${done && s.can_reopen ? `<div style="margin-top:10px;display:flex;justify-content:flex-end"><button class="btn btn-outline-danger btn-sm" onclick="obReopen(${d})">Reopen checklist</button></div>` : ''}
      ${!done && !editable && c.status === 'clearance_in_progress' ? '<p class="ob-note" style="margin:8px 0 0">Waiting for this department to sign.</p>' : ''}
    </div>
  </details>`;
}
async function obSaveSection(deptId, sign) {
  const b = OB.drawer.bundle;
  const s = b.sections.find((x) => x.department_id === deptId);
  const onBehalf = !s.can_edit;
  if (onBehalf) {
    const box = document.getElementById(`obBehalf${deptId}`);
    if (!box || !box.checked) { obToast('Tick the “on behalf” box first — this checklist belongs to another department.', 'err'); if (box) box.focus(); return; }
  }
  const items = s.items.map((i) => {
    const cb = document.getElementById(`obI_${i.id}`);
    const rm = document.getElementById(`obR_${i.id}`);
    const ct = document.getElementById(`obC_${i.id}`);
    return { id: i.id, is_checked: cb ? cb.checked : i.is_checked, remarks: rm ? rm.value : i.remarks, custom_text: ct ? ct.value : i.custom_text };
  });
  const body = { items, on_behalf: onBehalf };
  if (sign) {
    const name = (document.getElementById(`obSign${deptId}`).value || '').trim();
    if (!name) { obToast('Type your full name to sign.', 'err'); document.getElementById(`obSign${deptId}`).focus(); return; }
    const unchecked = items.filter((i) => !i.is_checked && (!s.items.find((x) => x.id === i.id).is_other || (i.custom_text || '').trim())).length;
    const msg = unchecked
      ? `${unchecked} item(s) are not ticked. Sign ${s.department_name} anyway? (Leave items unticked if they don't apply.)`
      : `Sign the ${s.department_name} checklist as ${name}?`;
    if (!confirm(msg)) return;
    body.sign = { name };
  }
  showLoading(sign ? 'Signing…' : 'Saving…');
  const { data, error } = await obApi('put', `/cases/${OB.drawer.id}/sections/${deptId}`, body);
  hideLoading();
  if (error) return obToast(error.message, 'err');
  OB.drawer.bundle = data;
  OB.drawer.focusDept = null;
  obRenderDrawer();
  obToast(sign ? (data.case.status === 'pending_acknowledgement' ? 'Signed — all departments are done. The employee has been asked to acknowledge.' : `${s.department_name} signed.`) : 'Progress saved.');
}
async function obReopen(deptId) {
  const s = OB.drawer.bundle.sections.find((x) => x.department_id === deptId);
  const reason = prompt(`Reopen the ${s.department_name} checklist? The case goes back to clearance${OB.drawer.bundle.case.acknowledged_at ? ' and the employee will need to acknowledge again' : ''}.\n\nReason (optional):`, '');
  if (reason === null) return;
  const { data, error } = await obApi('post', `/cases/${OB.drawer.id}/sections/${deptId}/reopen`, { reason });
  if (error) return obToast(error.message, 'err');
  OB.drawer.bundle = data;
  obRenderDrawer();
  obToast(`${s.department_name} reopened.`);
}

function obTimelineHtml(b) {
  const ev = [...b.events].reverse();
  if (!ev.length) return '<p class="ob-note">No activity yet.</p>';
  const detail = (e) => {
    const d = e.detail || {};
    if (e.event_type === 'section_signed') return `${esc(d.department || '')}${d.on_behalf ? ' — on behalf, by HR' : ''}`;
    if (e.event_type === 'section_saved' || e.event_type === 'section_reopened') return `${esc(d.department || '')}${d.reason ? ` — ${esc(d.reason)}` : ''}`;
    if (e.event_type === 'reminder_sent') {
      const kinds = { invite_reminder: 'Exit Interview reminder to the employee', ack_reminder: 'Acknowledgement reminder to the employee', payroll_reminder: 'Final pay reminder to Payroll' };
      if (d.kind && kinds[d.kind]) return `${kinds[d.kind]} (after ${d.days_since} days)`;
      return `${d.automatic ? `Automatic ${d.days_before}-day reminder` : 'Manual reminder'}${d.failed && d.failed.length ? ` · ${d.failed.length} failed` : ''}`;
    }
    if (e.event_type === 'cancelled') return esc(d.reason || '');
    if (e.event_type === 'details_updated') return esc((d.fields || []).join(', ').replace(/_/g, ' '));
    if (e.event_type === 'email_failed') return esc(d.email || '');
    if (d.migrated) return 'Moved over from the old offboarding status';
    return '';
  };
  return `<ol class="ob-tl">${ev.map((e) => `
    <li class="${e.event_type === 'email_failed' || e.event_type === 'cancelled' ? 'warn' : ''}">
      <div><b>${esc(OB_EVENT_LABELS[e.event_type] || e.event_type)}</b>${detail(e) ? ` · ${detail(e)}` : ''}</div>
      <div class="when">${obDateTime(e.created_at)} · ${esc(e.actor_email || 'system')}</div>
    </li>`).join('')}</ol>`;
}

// ---------------------------------------------------------------------------
// Case actions
// ---------------------------------------------------------------------------
async function obResendInvite() {
  const { data, error } = await obApi('post', `/cases/${OB.drawer.id}/resend-invite`);
  if (error) return obToast(error.message, 'err');
  OB.drawer.bundle = data;
  obRenderDrawer();
  obToast(data.email_sent ? 'Invitation re-sent.' : 'Saved, but the email could not be sent — copy the invite link instead.', data.email_sent ? '' : 'err');
}
async function obCopyInvite() {
  const link = OB.drawer.bundle.invite_link;
  try { await navigator.clipboard.writeText(link); obToast('Invite link copied. Only the invited email can open it.'); } catch (e) { prompt('Copy the invite link:', link); }
}
async function obRemindCase(deptIds) {
  const body = deptIds ? { department_ids: deptIds } : {};
  const { data, error } = await obApi('post', `/cases/${OB.drawer.id}/remind`, body);
  if (error) return obToast(error.message, 'err');
  obReloadCase(`Reminder sent to ${data.sent} department(s)${data.failed ? ` · ${data.failed} failed` : ''}.`);
}
function obCancelCase() {
  obModal({
    title: 'Cancel this offboarding?',
    subtitle: `${OB.drawer.bundle.case.employee_name} will be told by email that no further action is needed.`,
    body: '<div class="ob-field"><label for="obCancelReason">Reason <span class="req">*</span></label><textarea id="obCancelReason" placeholder="e.g. Resignation withdrawn"></textarea></div><div id="obCancelErr"></div>',
    okLabel: 'Cancel case',
    okClass: 'btn-danger',
    onOk: async (close) => {
      const reason = document.getElementById('obCancelReason').value.trim();
      if (!reason) { document.getElementById('obCancelErr').innerHTML = '<div class="ob-alert err" style="margin-top:10px">Please give a reason.</div>'; return; }
      const { data, error } = await obApi('post', `/cases/${OB.drawer.id}/cancel`, { reason });
      if (error) { document.getElementById('obCancelErr').innerHTML = `<div class="ob-alert err" style="margin-top:10px">${esc(error.message)}</div>`; return; }
      close();
      OB.drawer.bundle = data;
      obRenderDrawer();
      obToast('Case cancelled.');
    },
  });
}
function obPayrollDone() {
  obModal({
    title: 'Mark payroll done',
    subtitle: `Confirms the final pay for ${OB.drawer.bundle.case.employee_name} has been processed. The employee and HR will be emailed and the case closes.`,
    body: '<div class="ob-field"><label for="obPayRemarks">Remarks (optional)</label><textarea id="obPayRemarks" placeholder="e.g. Paid with October payroll"></textarea></div>',
    okLabel: 'Mark payroll done',
    okClass: 'btn-success',
    onOk: async (close) => {
      const { data, error } = await obApi('post', `/cases/${OB.drawer.id}/payroll-done`, { remarks: document.getElementById('obPayRemarks').value.trim() });
      if (error) return obToast(error.message, 'err');
      close();
      OB.drawer.bundle = data;
      obRenderDrawer();
      obToast('Payroll marked done — offboarding complete.');
    },
  });
}
async function obPdf(kind) {
  const w = window.open('', '_blank');
  try {
    const res = await fetch(`${API_BASE_URL}/admin/offboarding/cases/${OB.drawer.id}/pdf/${kind}`, { headers: { Authorization: `Bearer ${api.getAdminToken()}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    const url = URL.createObjectURL(await res.blob());
    if (w) w.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = `${kind}-${OB.drawer.bundle.case.ref_no}.pdf`; a.click(); }
  } catch (e) {
    if (w) w.close();
    obToast(`Could not open the PDF: ${e.message}`, 'err');
  }
}

// ---------------------------------------------------------------------------
// Generic small modal
// ---------------------------------------------------------------------------
function obModal({ title, subtitle, body, okLabel, okClass, onOk }) {
  let dlg = document.getElementById('obModal');
  if (dlg) dlg.remove();
  dlg = document.createElement('dialog');
  dlg.id = 'obModal';
  dlg.className = 'ob-modal';
  dlg.setAttribute('aria-labelledby', 'obModalTitle');
  dlg.innerHTML = `
    <div class="ob-modal-head"><div><h2 id="obModalTitle">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
      <button class="ob-x" type="button" aria-label="Close" onclick="document.getElementById('obModal').close()">${OB_ICON.x}</button></div>
    <div class="ob-modal-body">${body}</div>
    <div class="ob-modal-foot"><button class="btn btn-outline btn-sm" type="button" onclick="document.getElementById('obModal').close()">Back</button>
      <button class="btn ${okClass || 'btn-primary'} btn-sm" type="button" id="obModalOk">${esc(okLabel)}</button></div>`;
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  const close = () => dlg.close();
  dlg.querySelector('#obModalOk').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try { await onOk(close); } finally { const b = document.getElementById('obModalOk'); if (b) b.disabled = false; }
  });
  dlg.showModal();
  return dlg;
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------
function obOpenInvite(prefill = {}) {
  const m = OB.meta || { business_units: [], companies: [] };
  const isSuper = adminScope === 'ALL';
  const bu = prefill.business_unit || (isSuper ? '' : adminScope);
  const companies = [...new Set((m.companies || []).map((c) => c.name))].sort();
  const f = (id, label, { type = 'text', req = false, value = '', help = '', attrs = '' } = {}) => `
    <div class="ob-field${id === 'employee_email' ? ' full' : ''}">
      <label for="obV_${id}">${label}${req ? ' <span class="req">*</span>' : ''}</label>
      <input id="obV_${id}" type="${type}" value="${obAttr(value)}" ${attrs}>
      ${help ? `<span class="help">${help}</span>` : ''}
    </div>`;
  obModal({
    title: 'Invite employee to offboard',
    subtitle: 'They get an email with a personal link to fill in the Exit Interview. Only this email address can open it.',
    body: `
      <div id="obInviteNote"></div>
      <div class="ob-form-grid">
        ${f('employee_email', 'Employee email', { type: 'email', req: true, value: prefill.employee_email, attrs: 'autocomplete="off" onblur="obPrefill(this.value)" placeholder="name@wct.my"', help: 'If this person has a hired job application, their details fill in automatically.' })}
        ${f('employee_name', 'Full name (as per NRIC)', { req: true, value: prefill.employee_name })}
        <div class="ob-field"><label for="obV_business_unit">Business unit <span class="req">*</span></label>
          <select id="obV_business_unit" ${isSuper ? '' : 'disabled'}>
            ${isSuper ? '<option value="">Choose…</option>' : ''}
            ${['E&C', 'Land', 'Mall'].map((b) => `<option value="${obAttr(b)}" ${bu === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
          </select></div>
        <div class="ob-field"><label for="obV_company_name">Company</label>
          <input id="obV_company_name" list="obCompanyList" value="${obAttr(prefill.company_name || '')}" placeholder="Start typing…">
          <datalist id="obCompanyList">${companies.map((c) => `<option value="${obAttr(c)}"></option>`).join('')}</datalist></div>
        ${f('department', 'Department / site', { value: prefill.department })}
        ${f('position', 'Position', { value: prefill.position })}
        ${f('date_joined', 'Date joined', { type: 'date', value: prefill.date_joined })}
        ${f('official_last_day', 'Official last day', { type: 'date', value: prefill.official_last_day, help: 'Optional — the employee confirms it in the form.' })}
        ${f('immediate_superior_name', 'Immediate superior', { value: prefill.immediate_superior_name })}
        ${f('immediate_superior_email', 'Superior email', { type: 'email', req: true, value: prefill.immediate_superior_email, attrs: 'placeholder="superior@wct.my"', help: 'The immediate superior is the Reporting Unit — they get the Reporting Unit checklist to sign.' })}
      </div>
      <div id="obInviteErr"></div>`,
    okLabel: 'Send invitation',
    onOk: obSubmitInvite,
  });
  OB._inviteAppId = prefill.application_id || null;
  if (prefill.employee_email && !prefill.employee_name) obPrefill(prefill.employee_email);
  setTimeout(() => { const el = document.getElementById(prefill.employee_email ? 'obV_employee_name' : 'obV_employee_email'); if (el) el.focus(); }, 30);
}
async function obPrefill(email) {
  const note = document.getElementById('obInviteNote');
  if (!note || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
  const { data } = await obApi('get', `/prefill?email=${encodeURIComponent(email.trim())}`);
  if (!data) return;
  if (data.open_case) {
    note.innerHTML = data.open_case.other_business_unit
      ? `<div class="ob-alert warn">${esc(email)} already has an open offboarding case (${esc(data.open_case.ref_no)}) in another business unit. Please check with that unit's HR.</div>`
      : `<div class="ob-alert warn">${esc(email)} already has an open offboarding case (${esc(data.open_case.ref_no)}). <button class="ob-link" onclick="document.getElementById('obModal').close();obOpenCase('${data.open_case.id}')">Open it</button></div>`;
    return;
  }
  note.innerHTML = '';
  if (data.application_id) {
    OB._inviteAppId = data.application_id;
    const set = (k, v) => { const el = document.getElementById(`obV_${k}`); if (el && !el.value && v) el.value = v; };
    set('employee_name', data.employee_name);
    set('position', data.position);
    set('company_name', data.company_name);
    const buEl = document.getElementById('obV_business_unit');
    if (buEl && !buEl.disabled && !buEl.value && data.business_unit) buEl.value = data.business_unit;
    note.innerHTML = '<div class="ob-alert ok">Filled in from their hired job application — please check before sending.</div>';
  }
}
async function obSubmitInvite(close) {
  const val = (k) => { const el = document.getElementById(`obV_${k}`); return el ? el.value.trim() : ''; };
  const body = {
    employee_email: val('employee_email'),
    employee_name: val('employee_name'),
    business_unit: val('business_unit'),
    company_name: val('company_name'),
    department: val('department'),
    position: val('position'),
    date_joined: val('date_joined'),
    official_last_day: val('official_last_day'),
    immediate_superior_name: val('immediate_superior_name'),
    immediate_superior_email: val('immediate_superior_email'),
    application_id: OB._inviteAppId || undefined,
  };
  const errEl = document.getElementById('obInviteErr');
  const invalid = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.employee_email)) invalid.push(['employee_email', 'Enter a valid email address.']);
  if (!body.employee_name) invalid.push(['employee_name', 'Enter the employee’s full name.']);
  if (!body.business_unit) invalid.push(['business_unit', 'Choose a business unit.']);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.immediate_superior_email)) invalid.push(['immediate_superior_email', 'Enter the immediate superior’s email — they sign the Reporting Unit checklist.']);
  else if (body.immediate_superior_email.toLowerCase() === body.employee_email.toLowerCase()) invalid.push(['immediate_superior_email', 'The immediate superior can’t be the employee themselves.']);
  document.querySelectorAll('#obModal [aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  if (invalid.length) {
    invalid.forEach(([k]) => { const el = document.getElementById(`obV_${k}`); if (el) el.setAttribute('aria-invalid', 'true'); });
    errEl.innerHTML = `<div class="ob-alert err" style="margin-top:12px" role="alert">${invalid.map(([, m]) => esc(m)).join('<br>')}</div>`;
    document.getElementById(`obV_${invalid[0][0]}`).focus();
    return;
  }
  const { data, error } = await obApi('post', '/cases', body);
  if (error) { errEl.innerHTML = `<div class="ob-alert err" style="margin-top:12px" role="alert">${esc(error.message)}</div>`; return; }
  close();
  obToast(data.email_sent ? `Invitation sent to ${body.employee_email}.` : 'Case created, but the email could not be sent — use “Copy invite link”.', data.email_sent ? '' : 'err');
  if (currentView === 'offboarding' && OB.view === 'all') obLoadList();
  obOpenCase(data.case.id, 'overview');
}

/** From the job-application detail modal: start offboarding for a hired candidate. */
async function obStartInviteFromApplication(appId) {
  const a = (typeof selectedApp !== 'undefined' && selectedApp && selectedApp.id === appId) ? selectedApp : null;
  if (typeof closeDetail === 'function') closeDetail();
  await setView('offboarding');
  obOpenInvite(a ? {
    employee_email: a.email, employee_name: a.name_nric, business_unit: a.business_unit,
    position: a.position_applying, application_id: a.id,
  } : {});
}
