/* ============================================================================
 * ANALYTICS — two tabs on the admin Analytics page (HR only).
 *   Recruitment  computed in the browser from /admin/export (already scoped
 *                to the admin's business unit by the API).
 *   Offboarding  GET /admin/offboarding/analytics (scoped server-side; exit
 *                reasons are aggregate counts only, no names).
 * One filter row (tab, period, business unit for All Units admins) sits above
 * the charts. Exports (CSV / PDF) read whatever the current tab shows, so they
 * always match the screen.
 *
 * Colour: one validated hue for single-series magnitude (AN_C.primary) and a
 * second, validated against it, for the "Hires" series. Status colours stay
 * reserved for status (applications by status, overdue).
 * ========================================================================== */
const AN = { tab: 'recruitment', months: 'all', bu: '', ob: null, obKey: null, obLoading: false, obError: null, companies: null };
const AN_C = { primary: '#2563B0', second: '#C2701F', track: '#E5E5E4', critical: '#C0392B', grid: '#EEEEEC' };
const AN_PERIODS = [['3', 'Last 3 months'], ['6', 'Last 6 months'], ['12', 'Last 12 months'], ['24', 'Last 24 months'], ['all', 'All time']];
const AN_OB_STATUS_COLORS = {
  invited: '#2E5AAC', clearance_in_progress: '#B9770E', pending_acknowledgement: '#6B4FA0',
  pending_payroll: '#1F7A8C', completed: '#1E7A46', cancelled: '#8A8B8E',
};

function anSetTab(tab) { AN.tab = tab; render(); }
function anSetMonths(v) { AN.months = v; AN.ob = null; render(); }
function anSetBu(v) { AN.bu = v; AN.ob = null; render(); }

/** Recruitment rows after the period / BU filter. */
function anRecRows() {
  let rows = analyticsRows || [];
  if (AN.bu) rows = rows.filter((r) => r.business_unit === AN.bu);
  if (AN.months !== 'all') {
    const cut = new Date();
    cut.setMonth(cut.getMonth() - Number(AN.months));
    rows = rows.filter((r) => r.submitted_at && new Date(r.submitted_at) >= cut);
  }
  return rows;
}

const anPct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const anMonthKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const anMonthLabel = (key) => { const [y, m] = key.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }); };
function anMonthRange(keys) {
  if (!keys.length) return [];
  const sorted = keys.slice().sort();
  let [y, m] = sorted[0].split('-').map(Number);
  const [ey, em] = sorted[sorted.length - 1].split('-').map(Number);
  const out = [];
  while ((y < ey || (y === ey && m <= em)) && out.length < 60) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
function anTop(rows, keyFn, limit = 8) {
  const counts = {};
  rows.forEach((r) => { const k = keyFn(r); if (k) counts[k] = (counts[k] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}
function anAge(r) {
  if (r.age != null && r.age !== '') return Number(r.age);
  if (!r.date_of_birth) return null;
  const b = new Date(r.date_of_birth); const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a -= 1;
  return a;
}

function anRecruitmentMetrics(rows) {
  const total = rows.length;
  const count = (s) => rows.filter((r) => r.status === s).length;
  const hired = count('hired');
  const shortlistedPlus = rows.filter((r) => ['shortlisted', 'kiv', 'hired'].includes(r.status)).length;
  const pipeline = rows.filter((r) => ['submitted', 'shortlisted', 'kiv'].includes(r.status)).length;
  const hiredRows = rows.filter((r) => r.status === 'hired');
  const withDates = hiredRows.filter((r) => r.submitted_at && r.updated_at);
  const avgDays = withDates.length ? Math.round(withDates.reduce((s, r) => s + Math.max(0, (new Date(r.updated_at) - new Date(r.submitted_at)) / 86400000), 0) / withDates.length) : null;
  const referred = rows.filter((r) => r.referral_person === 'Yes').length;
  const flagged = rows.filter((r) => r.declaration_lawsuit === 'Yes' || r.declaration_other_matters === 'Yes').length;
  const onboarded = hiredRows.filter((r) => r.ob_status === 'completed').length;
  return { total, hired, shortlistedPlus, pipeline, avgDays, referred, flagged, onboarded, hiredCount: hiredRows.length };
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------
function analyticsPageView() {
  const isAll = adminScope === 'ALL';
  const shell = `
    <div class="an-head">
      <div class="ob-seg" role="group" aria-label="Analytics area">
        <button type="button" aria-pressed="${AN.tab === 'recruitment'}" onclick="anSetTab('recruitment')">Recruitment</button>
        <button type="button" aria-pressed="${AN.tab === 'offboarding'}" onclick="anSetTab('offboarding')">Offboarding</button>
      </div>
      <div class="an-filters">
        <label class="an-filter"><span>Period</span>
          <select class="select-clean" onchange="anSetMonths(this.value)" aria-label="Period">
            ${AN_PERIODS.map(([v, l]) => `<option value="${v}" ${AN.months === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
        ${isAll ? `<label class="an-filter"><span>Business unit</span>
          <select class="select-clean" onchange="anSetBu(this.value)" aria-label="Business unit">
            <option value="">All units</option>
            ${['E&C', 'Land', 'Mall'].map((b) => `<option value="${esc(b)}" ${AN.bu === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
          </select></label>` : `<span class="an-scope">${esc(adminScope)} only</span>`}
      </div>
      <div class="an-actions">
        <button class="btn btn-outline btn-sm" onclick="exportAnalyticsCsv()">${typeof OB_ICON !== 'undefined' ? OB_ICON.download : ''} Export CSV</button>
        <button class="btn btn-primary btn-sm" onclick="exportAnalyticsPdf()">${typeof ICON_PDF !== 'undefined' ? ICON_PDF : ''} Export PDF</button>
      </div>
    </div>
    <p class="an-period-note">${AN.tab === 'recruitment'
      ? 'Applications submitted in the selected period. Statuses are each application’s current status.'
      : 'Offboarding cases invited in the selected period. Cancelled cases only appear in “Cases by status”.'}</p>`;
  return shell + (AN.tab === 'offboarding' ? anOffboardingHtml() : anRecruitmentHtml());
}

function anTile(label, value, note, opts = {}) {
  return `<div class="metric-card${opts.alert ? ' an-alert' : ''}">
    <div class="metric-label">${opts.alert ? '<span class="an-dot" aria-hidden="true"></span>' : ''}${esc(label)}</div>
    <div class="metric-value">${value}</div>
    ${note ? `<div class="metric-note">${esc(note)}</div>` : ''}
  </div>`;
}
function anCard(id, title, { full = false, tall = false, sub = '' } = {}) {
  return `<div class="chart-card${full ? ' full-width' : ''}">
    <h3>${esc(title)}</h3>${sub ? `<p class="an-sub">${esc(sub)}</p>` : ''}
    <div class="chart-canvas-wrap${tall ? ' an-tall' : ''}"><canvas id="${id}" role="img" aria-label="${obAttrSafe(title)}"></canvas></div>
  </div>`;
}
function obAttrSafe(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// ---------------------------------------------------------------------------
// Recruitment tab
// ---------------------------------------------------------------------------
function anRecruitmentHtml() {
  const rows = anRecRows();
  const m = anRecruitmentMetrics(rows);
  const showBu = adminScope === 'ALL' && !AN.bu;
  return `
    <div class="metric-grid">
      ${anTile('Total applications', m.total, 'Submitted in this period')}
      ${anTile('Hire rate', `${anPct(m.hired, m.total)}%`, `${m.hired} hired of ${m.total}`)}
      ${anTile('Shortlist rate', `${anPct(m.shortlistedPlus, m.total)}%`, 'Shortlisted, KIV or hired')}
      ${anTile('In pipeline', m.pipeline, 'New, shortlisted or KIV, still to decide')}
      ${anTile('Avg. days to hire', m.avgDays === null ? '—' : m.avgDays, 'Approximate: submission to last status update')}
      ${anTile('Referred', `${anPct(m.referred, m.total)}%`, `${m.referred} came through a referral`)}
      ${anTile('Onboarding done', m.hiredCount ? `${m.onboarded}/${m.hiredCount}` : '—', 'Hires who finished onboarding')}
      ${anTile('Compliance flags', m.flagged, 'Declared Yes to a lawsuit or other matter. Worth a manual check')}
    </div>
    ${rows.length === 0 ? '<div class="empty-state">No applications in this period yet.</div>' : `
    <div class="chart-grid">
      ${anCard('chartFunnel', 'Hiring funnel', { sub: 'How many applications reached each stage (current status)' })}
      ${anCard('chartByStatus', 'Applications by status')}
      ${anCard('chartOverTime', 'Applications and hires per month', { full: true, sub: 'Hires are dated by their last status update (approximate)' })}
      ${anCard('chartPositions', 'Top positions applied for', { tall: true, sub: 'Applications, with how many were hired' })}
      ${anCard('chartHiredCompany', 'Hires by company / entity', { tall: true })}
      ${anCard('chartAge', 'Applicant age')}
      ${anCard('chartOnboarding', 'Onboarding progress of hires')}
      ${anCard('chartReferral', 'Referral source')}
      ${anCard('chartAssignment', 'Company / entity assignment')}
      ${showBu ? anCard('chartByUnit', 'Applications by business unit', { full: true }) : ''}
    </div>`}`;
}

const AN_STATUS_ORDER = ['submitted', 'shortlisted', 'kiv', 'hired', 'rejected', 'blacklisted'];
const AN_STATUS_COLORS = { submitted: '#2E5AAC', shortlisted: '#8A6D1F', kiv: '#B9770E', hired: '#1E7A46', rejected: '#C0392B', blacklisted: '#1a1a1a' };

/** All-zero data: show a short note instead of an empty plot. */
function anNoData(el, datasets) {
  const total = datasets.reduce((sum, d) => sum + d.data.reduce((a, b) => a + (Number(b) || 0), 0), 0);
  if (total > 0) return false;
  el.parentElement.innerHTML = '<div class="an-empty">Nothing to show for this period yet.</div>';
  return true;
}
function anChartBase() {
  Chart.defaults.font = { family: 'Inter, system-ui, sans-serif', size: 12 };
  Chart.defaults.color = '#6B6D70';
}
function anBar(id, labels, datasets, { horizontal = false, legend = false, stacked = false } = {}) {
  const el = document.getElementById(id);
  if (!el || anNoData(el, datasets)) return;
  const valueAxis = { beginAtZero: true, ticks: { precision: 0 }, grid: { color: AN_C.grid }, border: { display: false }, stacked };
  const catAxis = { grid: { display: false }, border: { display: false }, stacked,
    ticks: horizontal ? { callback(v) { const l = this.getLabelForValue(v); return l.length > 28 ? `${l.slice(0, 27)}…` : l; } } : {} };
  analyticsCharts[id] = new Chart(el, {
    type: 'bar',
    data: { labels, datasets: datasets.map((d) => ({ borderRadius: 4, borderSkipped: 'start', maxBarThickness: horizontal ? 22 : 44, ...d })) },
    options: {
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: legend, position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12, padding: 12 } } },
      scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
    },
  });
}
function anDoughnut(id, labels, data, colors) {
  const el = document.getElementById(id);
  if (!el || anNoData(el, [{ data }])) return;
  analyticsCharts[id] = new Chart(el, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#fff', borderWidth: 2 }] },
    options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 12 } } } },
  });
}

function anRenderRecruitment() {
  const rows = anRecRows();
  if (!rows.length) return;
  const m = anRecruitmentMetrics(rows);
  anBar('chartFunnel', ['Applied', 'Shortlisted or beyond', 'Hired'], [{ label: 'Applications', data: [m.total, m.shortlistedPlus, m.hired], backgroundColor: AN_C.primary }], { horizontal: true });
  anDoughnut('chartByStatus', AN_STATUS_ORDER.map((s) => STATUS_LABELS[s] || s), AN_STATUS_ORDER.map((s) => rows.filter((r) => r.status === s).length), AN_STATUS_ORDER.map((s) => AN_STATUS_COLORS[s]));

  const applied = {}; const hires = {};
  rows.forEach((r) => {
    if (r.submitted_at) { const k = anMonthKey(r.submitted_at); applied[k] = (applied[k] || 0) + 1; }
    if (r.status === 'hired' && r.updated_at) { const k = anMonthKey(r.updated_at); hires[k] = (hires[k] || 0) + 1; }
  });
  const months = anMonthRange([...Object.keys(applied), ...Object.keys(hires)]);
  anBar('chartOverTime', months.map(anMonthLabel), [
    { label: 'Applications', data: months.map((k) => applied[k] || 0), backgroundColor: AN_C.primary },
    { label: 'Hires', data: months.map((k) => hires[k] || 0), backgroundColor: AN_C.second },
  ], { legend: true });

  const positions = anTop(rows, (r) => (r.position_applying || '').trim() || 'Not specified');
  anBar('chartPositions', positions.map((p) => p[0]), [
    { label: 'Applications', data: positions.map((p) => p[1]), backgroundColor: AN_C.primary },
    { label: 'Hired', data: positions.map((p) => rows.filter((r) => ((r.position_applying || '').trim() || 'Not specified') === p[0] && r.status === 'hired').length), backgroundColor: AN_C.second },
  ], { horizontal: true, legend: true });

  const names = Object.fromEntries((AN.companies || []).map((c) => [c.id, c.name]));
  const byCompany = anTop(rows.filter((r) => r.status === 'hired'), (r) => (r.company_id ? (names[r.company_id] || 'Other entity') : 'Not assigned yet'));
  anBar('chartHiredCompany', byCompany.map((c) => c[0]), [{ label: 'Hires', data: byCompany.map((c) => c[1]), backgroundColor: AN_C.primary }], { horizontal: true });

  const bands = [['Under 25', 0, 24], ['25–34', 25, 34], ['35–44', 35, 44], ['45–54', 45, 54], ['55+', 55, 200]];
  const ages = rows.map(anAge).filter((a) => a != null && !Number.isNaN(a));
  anBar('chartAge', bands.map((b) => b[0]), [{ label: 'Applicants', data: bands.map(([, lo, hi]) => ages.filter((a) => a >= lo && a <= hi).length), backgroundColor: AN_C.primary }]);

  const hiredRows = rows.filter((r) => r.status === 'hired');
  const done = hiredRows.filter((r) => r.ob_status === 'completed').length;
  const inProg = hiredRows.filter((r) => r.ob_status === 'in_progress').length;
  anDoughnut('chartOnboarding', ['Completed', 'In progress', 'Not started'], [done, inProg, hiredRows.length - done - inProg], ['#1E7A46', AN_C.second, AN_C.track]);

  const referred = rows.filter((r) => r.referral_person === 'Yes').length;
  anDoughnut('chartReferral', ['Referred', 'Not referred'], [referred, rows.length - referred], [AN_C.primary, AN_C.track]);
  const assigned = rows.filter((r) => r.company_id).length;
  anDoughnut('chartAssignment', ['Assigned', 'Unassigned'], [assigned, rows.length - assigned], ['#1E7A46', AN_C.track]);

  const units = ['E&C', 'Land', 'Mall'];
  anBar('chartByUnit', units, [
    { label: 'Applications', data: units.map((u) => rows.filter((r) => r.business_unit === u).length), backgroundColor: AN_C.primary },
    { label: 'Hires', data: units.map((u) => rows.filter((r) => r.business_unit === u && r.status === 'hired').length), backgroundColor: AN_C.second },
  ], { legend: true });
}

// ---------------------------------------------------------------------------
// Offboarding tab
// ---------------------------------------------------------------------------
function anObKey() { return `${AN.months}|${AN.bu}`; }
async function anLoadOffboarding() {
  const key = anObKey();
  if ((AN.ob && AN.obKey === key) || AN.obLoading) return;
  AN.obLoading = true; AN.obError = null;
  const qs = new URLSearchParams({ months: AN.months });
  if (adminScope === 'ALL' && AN.bu) qs.set('business_unit', AN.bu);
  const { data, error } = await apiTry(() => api.get(`/admin/offboarding/analytics?${qs}`, { admin: true }));
  AN.obLoading = false;
  if (error) { AN.obError = error.message; } else { AN.ob = data; AN.obKey = key; }
  if (currentView === 'analytics' && AN.tab === 'offboarding') render();
}
const anDays = (v) => (v == null ? '—' : `${v}`);

function anOffboardingHtml() {
  if (!AN.ob || AN.obKey !== anObKey()) {
    if (AN.obError) return `<div class="error-banner" role="alert">Could not load offboarding analytics: ${esc(AN.obError)} <button class="btn btn-outline btn-sm" onclick="AN.obError=null;render()">Try again</button></div>`;
    setTimeout(anLoadOffboarding, 0);
    return `<div class="metric-grid" aria-busy="true">${'<div class="metric-card"><div class="ob-skeleton" style="height:58px"></div></div>'.repeat(4)}</div>`;
  }
  const a = AN.ob;
  const t = a.totals;
  const leavers = t.cases - t.cancelled;
  const showBu = !!a.by_bu;
  return `
    <div class="metric-grid">
      ${anTile('Leavers', leavers, `${t.completed} completed · ${t.open} still open`)}
      ${anTile('Overdue', t.overdue, 'Open cases past their last day', { alert: t.overdue > 0 })}
      ${anTile('Due in 7 days', t.due_7d, 'Open cases with a last day this week')}
      ${anTile('Completed this month', t.completed_this_month, 'Final pay processed')}
      ${anTile('Avg. days to clear', anDays(a.timings.clearance_days), 'Exit Interview submitted → all 6 departments signed')}
      ${anTile('Cleared on time', a.timings.clearance_on_time_pct == null ? '—' : `${a.timings.clearance_on_time_pct}%`, 'Fully cleared on or before the last day')}
      ${anTile('Avg. days to submit', anDays(a.timings.invite_to_submit_days), 'Invite → employee submits the Exit Interview')}
      ${anTile('Avg. days end to end', anDays(a.timings.invite_to_complete_days), 'Invite → final pay done')}
    </div>
    ${t.cases === 0 ? '<div class="empty-state">No offboarding cases in this period yet.</div>' : `
    <div class="chart-grid">
      ${anCard('chartObLeavers', 'Leavers per month', { full: true, sub: 'By last working day. Cancelled cases excluded' })}
      ${anCard('chartObReasons', 'Reasons for leaving', { tall: true, sub: 'From Exit Interviews. One person can give several reasons' })}
      ${anCard('chartObStatus', 'Cases by status', { tall: true })}
      ${anCard('chartObDepts', 'Clearance turnaround by department', { full: true, sub: 'Average days from Exit Interview to sign-off. Longer bars are the slower departments' })}
      <div class="chart-card full-width">
        <h3>Department clearance detail</h3>
        <div class="an-table-wrap"><table class="an-table">
          <thead><tr><th scope="col">Department</th><th scope="col">Avg. days</th><th scope="col">Signed</th><th scope="col">Pending</th><th scope="col">Pending past last day</th><th scope="col">Signed by HR on behalf</th></tr></thead>
          <tbody>${a.departments.map((d) => `<tr><th scope="row">${esc(d.department)}</th><td>${anDays(d.avg_days)}</td><td>${d.signed}</td><td>${d.pending}</td>
            <td>${d.overdue ? `<span class="an-flag"><span class="an-dot" aria-hidden="true"></span>${d.overdue}</span>` : '0'}</td><td>${d.on_behalf}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      ${anCard('chartObTenure', 'Length of service at exit')}
      ${anCard('chartObTopDept', 'Leavers by department / site', { tall: true })}
      ${anCard('chartObTopPos', 'Leavers by position', { tall: true })}
      ${showBu ? anCard('chartObBu', 'Cases by business unit') : ''}
    </div>`}`;
}

function anRenderOffboarding() {
  const a = AN.ob;
  if (!a || AN.obKey !== anObKey() || !a.totals.cases) return;
  anBar('chartObLeavers', a.leavers_by_month.map((m) => anMonthLabel(m.month)), [{ label: 'Leavers', data: a.leavers_by_month.map((m) => m.count), backgroundColor: AN_C.primary }]);
  anBar('chartObReasons', a.exit_reasons.map((r) => r.reason), [{ label: 'Mentions', data: a.exit_reasons.map((r) => r.count), backgroundColor: AN_C.primary }], { horizontal: true });
  anBar('chartObStatus', a.by_status.map((s) => s.label), [{ label: 'Cases', data: a.by_status.map((s) => s.count), backgroundColor: a.by_status.map((s) => AN_OB_STATUS_COLORS[s.status]) }], { horizontal: true });
  anBar('chartObDepts', a.departments.map((d) => d.department), [{ label: 'Avg. days to sign', data: a.departments.map((d) => d.avg_days || 0), backgroundColor: AN_C.primary }], { horizontal: true });
  anBar('chartObTenure', a.tenure.map((x) => x.bucket), [{ label: 'Leavers', data: a.tenure.map((x) => x.count), backgroundColor: AN_C.primary }]);
  anBar('chartObTopDept', a.top_departments.map((x) => x.name), [{ label: 'Leavers', data: a.top_departments.map((x) => x.count), backgroundColor: AN_C.primary }], { horizontal: true });
  anBar('chartObTopPos', a.top_positions.map((x) => x.name), [{ label: 'Leavers', data: a.top_positions.map((x) => x.count), backgroundColor: AN_C.primary }], { horizontal: true });
  if (a.by_bu) anBar('chartObBu', a.by_bu.map((b) => b.business_unit), [{ label: 'Cases', data: a.by_bu.map((b) => b.count), backgroundColor: AN_C.primary }]);
}

function renderAnalyticsCharts() {
  Object.values(analyticsCharts).forEach((c) => c && c.destroy());
  analyticsCharts = {};
  if (typeof Chart === 'undefined') return;
  anChartBase();
  if (AN.tab === 'offboarding') anRenderOffboarding();
  else {
    anRenderRecruitment();
    if (!AN.companies) {
      AN.companies = [];
      apiTry(() => api.get('/admin/companies', { admin: true })).then(({ data }) => {
        AN.companies = data || [];
        if (currentView === 'analytics' && AN.tab === 'recruitment' && AN.companies.length) render();
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Exports: built from the tiles and charts on screen, so they match it.
// ---------------------------------------------------------------------------
function anScopeLabel() {
  if (adminScope !== 'ALL') return adminScope;
  return AN.bu || 'All Business Units';
}
function anTitle() { return AN.tab === 'offboarding' ? 'Offboarding Analytics' : 'Recruitment Analytics'; }
function anPeriodLabel() { return (AN_PERIODS.find((p) => p[0] === AN.months) || [])[1] || ''; }
function anTilesOnScreen() {
  return [...document.querySelectorAll('#root .metric-card')].map((el) => ({
    label: (el.querySelector('.metric-label') || {}).textContent || '',
    value: (el.querySelector('.metric-value') || {}).textContent || '',
  })).filter((x) => x.label);
}
function anChartsOnScreen() {
  return [...document.querySelectorAll('#root .chart-card')].map((card) => {
    const canvas = card.querySelector('canvas');
    const chart = canvas && analyticsCharts[canvas.id];
    return chart ? { title: card.querySelector('h3').textContent, chart } : null;
  }).filter(Boolean);
}

function exportAnalyticsCsv() {
  const lines = [];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const add = (arr) => lines.push(arr.map(q).join(','));
  add([`WCT Group — ${anTitle()}`]);
  add(['Generated', new Date().toLocaleString()]);
  add(['Scope', anScopeLabel()]);
  add(['Period', anPeriodLabel()]);
  add([]);
  add(['Summary', 'Value']);
  anTilesOnScreen().forEach((t) => add([t.label, t.value]));
  anChartsOnScreen().forEach(({ title, chart }) => {
    add([]);
    const ds = chart.data.datasets;
    add([title, ...ds.map((d) => d.label || 'Count')]);
    chart.data.labels.forEach((l, i) => add([l, ...ds.map((d) => d.data[i])]));
  });
  if (AN.tab === 'offboarding' && AN.ob) {
    add([]);
    add(['Department', 'Avg. days', 'Signed', 'Pending', 'Pending past last day', 'Signed by HR on behalf']);
    AN.ob.departments.forEach((d) => add([d.department, d.avg_days ?? '', d.signed, d.pending, d.overdue, d.on_behalf]));
  }
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `wct-${AN.tab}-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportAnalyticsPdf() {
  const tiles = anTilesOnScreen();
  const charts = anChartsOnScreen().map(({ title, chart }) => ({ title, img: chart.canvas.toDataURL('image/png'), wide: chart.canvas.closest('.full-width') }));
  const deptTable = AN.tab === 'offboarding' && AN.ob ? `
    <h2 class="section">Department clearance detail</h2>
    <table class="t"><thead><tr><th>Department</th><th>Avg. days</th><th>Signed</th><th>Pending</th><th>Pending past last day</th><th>On behalf</th></tr></thead>
    <tbody>${AN.ob.departments.map((d) => `<tr><td>${esc(d.department)}</td><td>${anDays(d.avg_days)}</td><td>${d.signed}</td><td>${d.pending}</td><td>${d.overdue}</td><td>${d.on_behalf}</td></tr>`).join('')}</tbody></table>` : '';
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>WCT ${anTitle()} — ${new Date().toLocaleDateString()}</title>
<style>
  @page{ size:A4; margin:14mm; }
  *{box-sizing:border-box;}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;margin:0;}
  .letterhead{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #101B2D;padding-bottom:12px;margin-bottom:16px;}
  .letterhead img.logo{height:48px;}
  .letterhead h1{font-family:Georgia,serif;font-size:18px;margin:0;color:#101B2D;}
  .letterhead .meta{text-align:right;font-size:10px;color:#666;}
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
  .tile{border:1px solid #ddd;border-radius:6px;padding:8px 10px;}
  .tile .l{font-size:8px;text-transform:uppercase;color:#777;letter-spacing:.04em;}
  .tile .v{font-family:Georgia,serif;font-size:18px;font-weight:bold;color:#101B2D;}
  h2.section{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#fff;background:#101B2D;padding:5px 10px;margin:18px 0 10px;}
  .charts{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .box{border:1px solid #eee;border-radius:6px;padding:8px;page-break-inside:avoid;}
  .box.wide{grid-column:1 / -1;}
  .box img{width:100%;height:auto;display:block;}
  .box .cap{font-size:10px;font-weight:bold;margin-bottom:6px;color:#101B2D;}
  table.t{width:100%;border-collapse:collapse;font-size:10px;} table.t th,table.t td{border:1px solid #ddd;padding:5px 7px;text-align:left;} table.t th{background:#F4F4F2;}
  .print-bar{background:#FFF6D6;border-bottom:2px solid #E0C34C;padding:10px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;}
  .print-bar button{font-weight:bold;font-size:13px;padding:8px 18px;border-radius:6px;border:none;cursor:pointer;background:#000;color:#fff;}
  @media print{ .print-bar{display:none;} }
  .footer{margin-top:20px;border-top:1px solid #ccc;padding-top:8px;font-size:8.5px;color:#888;text-align:center;}
</style></head>
<body>
  <div class="print-bar"><span>Ready. Use your browser's print dialog and choose "Save as PDF".</span><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="letterhead">
    <div style="display:flex;align-items:center;gap:14px;"><img class="logo" src="${typeof WCT_LOGO_DATA_URI !== 'undefined' ? WCT_LOGO_DATA_URI : ''}" alt=""><h1>WCT Group — ${anTitle()}</h1></div>
    <div class="meta">Generated ${new Date().toLocaleString()}<br>Scope: ${esc(anScopeLabel())}<br>Period: ${esc(anPeriodLabel())}</div>
  </div>
  <div class="tiles">${tiles.map((x) => `<div class="tile"><div class="l">${esc(x.label)}</div><div class="v">${esc(x.value)}</div></div>`).join('')}</div>
  <h2 class="section">Charts</h2>
  <div class="charts">${charts.map((c) => `<div class="box${c.wide ? ' wide' : ''}"><div class="cap">${esc(c.title)}</div><img src="${c.img}" alt="${esc(c.title)}"></div>`).join('')}</div>
  ${deptTable}
  <div class="footer">WCT Group Employment Portal — Confidential internal report${AN.tab === 'offboarding' ? '. Exit reasons are aggregate counts only' : ''}</div>
</body></html>`;
  const win = window.open('', '_blank');
  if (!win) { uiToast('Please allow pop-ups for this site to generate the PDF.'); return; }
  win.document.open(); win.document.write(html); win.document.close();
  win.onload = () => setTimeout(() => win.print(), 400);
}
