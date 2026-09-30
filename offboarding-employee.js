// ============================================================================
// MY OFFBOARDING — candidate site (index.html), 2026-09-30.
//
// A leaver reaches this page from HR's invitation email
// (index.html?offboard=<token>). The token is claimed once — the backend
// checks the signed-in email matches the invited one — and from then on the
// case shows on their home screen. Steps for the employee:
//   1. fill in and sign the Exit Interview (can save a draft),
//   2. wait while six departments clear them (read-only progress),
//   3. review the clearance and acknowledge it,
//   4. download their forms once payroll is done.
// Backend: /api/offboarding (wct-job-app-backend routes/offboarding.js).
//
// Loaded before app.js; only defines functions, which app.js calls
// (obEmpBoot from boot(), tplMyOffboarding from render()).
// ============================================================================

const OB_EMP_TOKEN_KEY = 'wct_offboard_token';
const OB_EMP = {
  cases: [],        // GET /offboarding/mine
  bundle: null,     // GET /offboarding/mine/:id
  caseId: null,
  draft: null,      // editable copy of the Exit Interview while status = invited
  errors: {},       // field → message from the last submit
  claimError: '',
  newReason: '',
};
const OB_EMP_STATUS = {
  invited: 'Exit Interview to complete',
  clearance_in_progress: 'Department clearance in progress',
  pending_acknowledgement: 'Ready for your acknowledgement',
  pending_payroll: 'Final pay being processed',
  completed: 'Offboarding complete',
  cancelled: 'Cancelled by HR',
};

function obEmpAttr(v) { return esc(v).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
const OB_EMP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function obEmpDate(v) {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return esc(v);
  return `${Number(s.slice(8, 10))} ${OB_EMP_MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
}
function obEmpDateTime(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return esc(v); }
}

// ---------------------------------------------------------------------------
// Boot: claim a pending invitation, load my cases
// ---------------------------------------------------------------------------
async function obEmpBoot() {
  const params = new URLSearchParams(window.location.search);
  let token = params.get('offboard');
  if (token) {
    try { sessionStorage.setItem(OB_EMP_TOKEN_KEY, token); } catch (e) { /* ignore */ }
    params.delete('offboard');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  } else {
    try { token = sessionStorage.getItem(OB_EMP_TOKEN_KEY); } catch (e) { token = null; }
  }

  if (token) {
    const { data, error } = await apiTry(() => api.post('/offboarding/claim', { token }));
    if (error && error.status !== 403) {
      try { sessionStorage.removeItem(OB_EMP_TOKEN_KEY); } catch (e) { /* ignore */ }
    }
    if (error) {
      // Keep the token for a 403 (wrong account): after signing in with the
      // right email the claim is retried automatically.
      OB_EMP.claimError = error.message;
    } else {
      try { sessionStorage.removeItem(OB_EMP_TOKEN_KEY); } catch (e) { /* ignore */ }
      OB_EMP.caseId = data.case_id;
    }
  }
  await obEmpLoadCases();
  if (OB_EMP.claimError) { state.step = 'offboarding'; return; }
  if (OB_EMP.caseId) await obEmpOpen(OB_EMP.caseId, { silent: true });
}

async function obEmpLoadCases() {
  const { data } = await apiTry(() => api.get('/offboarding/mine'));
  OB_EMP.cases = data || [];
}

async function obEmpOpen(id, { silent = false } = {}) {
  if (!silent) showLoading('Opening your offboarding…');
  const { data, error } = await apiTry(() => api.get(`/offboarding/mine/${id}`));
  if (!silent) hideLoading();
  if (error) { alert(`Could not open your offboarding: ${error.message}`); return; }
  OB_EMP.caseId = id;
  OB_EMP.bundle = data;
  OB_EMP.errors = {};
  OB_EMP.claimError = '';
  const ei = data.exitInterview || {};
  const c = data.case;
  OB_EMP.draft = {
    immediate_superior_name: c.immediate_superior_name || '',
    notice_period_days: c.notice_period_days == null ? '' : String(c.notice_period_days),
    official_last_day: c.official_last_day || '',
    actual_last_day: c.actual_last_day || '',
    reasons: Array.isArray(ei.reasons) ? ei.reasons.slice() : [],
    reasons_other: Array.isArray(ei.reasons_other) ? ei.reasons_other.slice() : [],
    comments: ei.comments || '',
    signature_name: c.employee_name || '',
    declaration: false,
  };
  if (silent) state.step = 'offboarding'; else goStep('offboarding');
}

function obEmpBack() {
  OB_EMP.bundle = null;
  OB_EMP.claimError = '';
  obEmpLoadCases().then(() => goStep('start'));
}

// ---------------------------------------------------------------------------
// Home-screen card (rendered inside tplStart)
// ---------------------------------------------------------------------------
function obEmpHomeCardHtml() {
  const open = OB_EMP.cases.filter((c) => c.status !== 'cancelled');
  if (!open.length) return '';
  return `
    <div class="section-title" style="margin-top:0;">My Offboarding</div>
    ${open.map((c) => `
      <div class="ob-emp-card">
        <div class="ob-emp-card-body">
          <div class="t">${esc(OB_EMP_STATUS[c.status] || c.status_label)}</div>
          <div class="s">${esc(c.ref_no)} · ${esc(c.position || '')} · Last day ${obEmpDate(c.actual_last_day || c.official_last_day)}</div>
        </div>
        <button class="btn ${c.status === 'invited' || c.status === 'pending_acknowledgement' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="obEmpOpen('${c.id}')">${c.status === 'invited' ? 'Start Exit Interview →' : c.status === 'pending_acknowledgement' ? 'Review & acknowledge →' : 'View →'}</button>
      </div>`).join('')}`;
}
function obEmpHasCases() { return OB_EMP.cases.length > 0; }

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function obEmpStepsHtml(c) {
  const order = ['invited', 'clearance_in_progress', 'pending_acknowledgement', 'pending_payroll', 'completed'];
  const labels = ['Exit Interview', 'Department clearance', 'Your acknowledgement', 'Final pay', 'Done'];
  const idx = order.indexOf(c.status);
  return `<ol class="ob-emp-steps" aria-label="Offboarding progress">${labels.map((l, i) => {
    const cls = c.status === 'completed' || i < idx ? 'done' : i === idx ? 'now' : '';
    return `<li class="${cls}"${i === idx && c.status !== 'completed' ? ' aria-current="step"' : ''}><span class="n">${cls === 'done' ? '✓' : i + 1}</span><span class="l">${l}</span></li>`;
  }).join('')}</ol>`;
}

function tplMyOffboarding() {
  if (OB_EMP.claimError) {
    return `
      <div class="step-eyebrow">Offboarding</div>
      <h2>We couldn't open this invitation</h2>
      <div class="error-banner" role="alert">${esc(OB_EMP.claimError)}</div>
      <p class="step-desc">You're signed in as <strong>${esc(currentUser && currentUser.email)}</strong>. Offboarding invitations only open for the email address HR sent them to.</p>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="obEmpBack()">← Back</button>
        <div class="right"><button class="btn btn-primary" onclick="signOut()">Sign out and use another account</button></div>
      </div>`;
  }
  const b = OB_EMP.bundle;
  if (!b) return '<p>Loading…</p>';
  const c = b.case;
  const intro = {
    invited: 'HR has started your offboarding. Please complete your Exit Interview below — you can save a draft and come back later.',
    clearance_in_progress: 'Thank you for submitting your Exit Interview. Each department is now completing your exit clearance. We\'ll email you when it\'s ready for your acknowledgement.',
    pending_acknowledgement: 'All six departments have completed your exit clearance. Please review the result below and acknowledge it so Payroll can process your final pay.',
    pending_payroll: 'Thank you — Payroll is now processing your final pay. We\'ll email you once it\'s done.',
    completed: 'Your offboarding with WCT is complete. Thank you for your contributions, and all the best for what comes next.',
    cancelled: 'HR has cancelled this offboarding. No further action is needed from you. Please contact HR if you think this is a mistake.',
  }[c.status];
  let body = '';
  if (c.status === 'invited') body = obEmpFormHtml(b);
  else if (c.status === 'pending_acknowledgement') body = obEmpAckHtml(b);
  else if (c.status !== 'cancelled') body = obEmpProgressHtml(b);

  return `
    <div class="step-eyebrow">Offboarding · ${esc(c.ref_no)}</div>
    <h2>My Offboarding</h2>
    <p class="step-desc">${intro}</p>
    ${c.status !== 'cancelled' ? obEmpStepsHtml(c) : ''}
    ${obEmpDetailsHtml(c)}
    ${body}
    ${c.status !== 'invited' && c.status !== 'cancelled' ? `
      <div class="section-title">Your documents</div>
      <div class="ob-emp-docs">
        <button class="btn btn-ghost btn-sm" onclick="obEmpPdf('exit-interview')">Exit Interview Form (PDF)</button>
        ${['pending_payroll', 'completed'].includes(c.status) ? '<button class="btn btn-ghost btn-sm" onclick="obEmpPdf(\'clearance\')">Exit Clearance Form (PDF)</button>' : ''}
      </div>` : ''}
    ${c.status !== 'invited' && c.status !== 'pending_acknowledgement' ? `
      <div class="btn-row"><button class="btn btn-ghost" onclick="obEmpBack()">← Back to home</button><div></div></div>` : ''}`;
}

function obEmpDetailsHtml(c) {
  const row = (k, v) => `<div class="review-row"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;
  return `
    <div class="section-title">A. Employee details</div>
    <div class="ob-emp-details">
      ${row('Name', esc(c.employee_name))}
      ${row('Position', esc(c.position || '—'))}
      ${row('Department / site', esc(c.department || '—'))}
      ${row('Company', esc(c.company_name || c.business_unit))}
      ${row('Date joined', obEmpDate(c.date_joined))}
      ${c.status !== 'invited' ? row('Official last day', obEmpDate(c.official_last_day)) + row('Actual last day', obEmpDate(c.actual_last_day)) : ''}
    </div>
    <p class="hint" style="margin-top:6px;">These details come from HR. If something is wrong, please let HR know.</p>`;
}

// ---------------------------------------------------------------------------
// Exit Interview form (status = invited)
// ---------------------------------------------------------------------------
function obEmpErr(field) {
  const m = OB_EMP.errors[field];
  return m ? `<div class="inline-error" id="obEmpErr_${field}">${esc(m)}</div>` : '';
}
function obEmpFormHtml(b) {
  const d = OB_EMP.draft;
  const reasons = b.reasons || [];
  const today = b.today;
  const notice = Number(d.notice_period_days);
  const minOfficial = Number.isInteger(notice) && notice >= 0 && d.notice_period_days !== '' ? obEmpAddDays(today, notice) : today;
  const inv = (f) => (OB_EMP.errors[f] ? ' invalid' : '');
  return `
    <div class="grid" style="margin-top:14px;">
      <div class="field${inv('immediate_superior_name')}">
        <label for="obEmpSup">Immediate superior <span class="opt-tag">(optional)</span></label>
        <input type="text" id="obEmpSup" value="${obEmpAttr(d.immediate_superior_name)}" oninput="OB_EMP.draft.immediate_superior_name=this.value" maxlength="100" placeholder="e.g. Ahmad bin Ali">
      </div>
      <div class="field${inv('notice_period_days')}">
        <label for="obEmpNotice">Notice period (days) <span class="req-star">*</span></label>
        <input type="number" id="obEmpNotice" min="0" inputmode="numeric" value="${obEmpAttr(d.notice_period_days)}" oninput="OB_EMP.draft.notice_period_days=numericOnly(this.value);this.value=OB_EMP.draft.notice_period_days;obEmpRefreshMin()">
        ${obEmpErr('notice_period_days')}
      </div>
      <div class="field${inv('official_last_day')}">
        <label for="obEmpOfficial">Official last day <span class="req-star">*</span></label>
        <input type="date" id="obEmpOfficial" min="${minOfficial}" value="${obEmpAttr(d.official_last_day)}" oninput="OB_EMP.draft.official_last_day=this.value">
        <div class="hint" id="obEmpOfficialHint">Must be on or after ${obEmpDate(minOfficial)} (today + notice period).</div>
        ${obEmpErr('official_last_day')}
      </div>
      <div class="field${inv('actual_last_day')}">
        <label for="obEmpActual">Actual last day <span class="req-star">*</span></label>
        <input type="date" id="obEmpActual" min="${today}" value="${obEmpAttr(d.actual_last_day)}" oninput="OB_EMP.draft.actual_last_day=this.value">
        <div class="hint">The day you'll actually stop working (can be earlier than the official last day if agreed).</div>
        ${obEmpErr('actual_last_day')}
      </div>
    </div>

    <fieldset class="${OB_EMP.errors.reasons ? 'invalid' : ''}" style="margin-top:6px;">
      <legend>B. Reason(s) that contributed to your decision to leave <span class="req-star">*</span></legend>
      <div class="ob-emp-reasons">
        ${reasons.map((r, i) => `
          <label class="ob-emp-reason"><input type="checkbox" ${d.reasons.includes(r) ? 'checked' : ''} onchange="obEmpToggleReason(${i}, this.checked)"> <span>${esc(r)}</span></label>`).join('')}
      </div>
      <div class="ob-emp-other">
        <label for="obEmpOther" class="ob-emp-sr">Add another reason</label>
        <input type="text" id="obEmpOther" placeholder="Other reason (optional) — type and press Add" maxlength="200" value="${obEmpAttr(OB_EMP.newReason)}" oninput="OB_EMP.newReason=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();obEmpAddReason();}">
        <button type="button" class="btn btn-ghost btn-sm" onclick="obEmpAddReason()">Add</button>
      </div>
      ${d.reasons_other.length ? `<div class="ob-emp-chips">${d.reasons_other.map((r, i) => `<span class="ob-emp-chip">${esc(r)} <button type="button" aria-label="Remove ${obEmpAttr(r)}" onclick="obEmpRemoveReason(${i})">×</button></span>`).join('')}</div>` : ''}
      ${obEmpErr('reasons')}
    </fieldset>

    <div class="field">
      <label for="obEmpComments">C. Comments / suggestions for improvement <span class="opt-tag">(optional)</span></label>
      <textarea id="obEmpComments" rows="4" maxlength="5000" oninput="OB_EMP.draft.comments=this.value" placeholder="Anything you'd like to share with HR">${esc(d.comments)}</textarea>
    </div>

    <div class="section-title">Sign and submit</div>
    <div class="field${inv('signature_name')}">
      <label for="obEmpSig">Type your full name as your signature <span class="req-star">*</span></label>
      <input type="text" id="obEmpSig" value="${obEmpAttr(d.signature_name)}" oninput="OB_EMP.draft.signature_name=this.value" autocomplete="name">
      ${obEmpErr('signature_name')}
    </div>
    <label class="ob-emp-declare${OB_EMP.errors.declaration ? ' invalid' : ''}">
      <input type="checkbox" id="obEmpDeclare" ${d.declaration ? 'checked' : ''} onchange="OB_EMP.draft.declaration=this.checked">
      <span>I confirm the information above is true, and I understand that once submitted my Exit Interview can no longer be edited.</span>
    </label>
    ${obEmpErr('declaration')}
    <div id="obEmpFormErr"></div>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="obEmpSaveDraft(true).then(ok=>ok&&obEmpBack())">Save &amp; exit</button>
      <div class="right">
        <button class="btn btn-ghost" onclick="obEmpSaveDraft(false)">Save draft</button>
        <button class="btn btn-primary" onclick="obEmpSubmit()">Submit Exit Interview →</button>
      </div>
    </div>`;
}
function obEmpAddDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function obEmpRefreshMin() {
  const n = Number(OB_EMP.draft.notice_period_days);
  const min = OB_EMP.draft.notice_period_days !== '' && Number.isInteger(n) ? obEmpAddDays(OB_EMP.bundle.today, n) : OB_EMP.bundle.today;
  const el = document.getElementById('obEmpOfficial');
  if (el) el.min = min;
  const hint = document.getElementById('obEmpOfficialHint');
  if (hint) hint.textContent = `Must be on or after ${obEmpDate(min)} (today + notice period).`;
}
function obEmpToggleReason(i, on) {
  const r = OB_EMP.bundle.reasons[i];
  const set = new Set(OB_EMP.draft.reasons);
  if (on) set.add(r); else set.delete(r);
  OB_EMP.draft.reasons = OB_EMP.bundle.reasons.filter((x) => set.has(x));
}
function obEmpAddReason() {
  const v = (OB_EMP.newReason || '').trim();
  if (!v) return;
  if (!OB_EMP.draft.reasons_other.includes(v) && OB_EMP.draft.reasons_other.length < 10) OB_EMP.draft.reasons_other.push(v);
  OB_EMP.newReason = '';
  render();
  const el = document.getElementById('obEmpOther');
  if (el) el.focus();
}
function obEmpRemoveReason(i) { OB_EMP.draft.reasons_other.splice(i, 1); render(); }

function obEmpDraftPayload() {
  const d = OB_EMP.draft;
  return {
    immediate_superior_name: d.immediate_superior_name,
    notice_period_days: d.notice_period_days === '' ? null : Number(d.notice_period_days),
    official_last_day: d.official_last_day || null,
    actual_last_day: d.actual_last_day || null,
    reasons: d.reasons,
    reasons_other: d.reasons_other,
    comments: d.comments,
  };
}
async function obEmpSaveDraft(quiet) {
  showLoading('Saving your draft…');
  const { error } = await apiTry(() => api.patch(`/offboarding/mine/${OB_EMP.caseId}/exit-interview`, obEmpDraftPayload()));
  hideLoading();
  if (error) { alert(`Your draft could not be saved: ${error.message}`); return false; }
  if (!quiet) {
    const el = document.getElementById('obEmpFormErr');
    if (el) el.innerHTML = '<div class="success-banner" role="status" style="margin-top:14px;">Draft saved. You can come back to it any time from the home page.</div>';
  }
  return true;
}
async function obEmpSubmit() {
  const d = OB_EMP.draft;
  // Quick client-side checks (the server re-checks everything).
  const errs = {};
  if (d.notice_period_days === '') errs.notice_period_days = 'Please enter your notice period in days.';
  if (!d.official_last_day) errs.official_last_day = 'Please choose your official last day.';
  if (!d.actual_last_day) errs.actual_last_day = 'Please choose your actual last day.';
  if (!d.reasons.length && !d.reasons_other.length) errs.reasons = 'Please choose at least one reason, or add your own.';
  if (!d.signature_name.trim()) errs.signature_name = 'Please type your full name to sign.';
  if (!d.declaration) errs.declaration = 'Please tick the confirmation box.';
  OB_EMP.errors = errs;
  if (Object.keys(errs).length) { render(); obEmpFocusFirstError(); return; }
  if (!confirm('Submit your Exit Interview? You won\'t be able to change it afterwards, and HR and the departments will be notified.')) return;
  showLoading('Submitting…');
  const { data, error } = await apiTry(() => api.post(`/offboarding/mine/${OB_EMP.caseId}/exit-interview/submit`, {
    ...obEmpDraftPayload(), signature_name: d.signature_name.trim(), declaration: true,
  }));
  hideLoading();
  if (error) {
    const field = error.data && error.data.field;
    OB_EMP.errors = field ? { [field]: error.message } : {};
    render();
    if (field) obEmpFocusFirstError();
    else { const el = document.getElementById('obEmpFormErr'); if (el) el.innerHTML = `<div class="error-banner" role="alert" style="margin-top:14px;">${esc(error.message)}</div>`; }
    return;
  }
  OB_EMP.bundle = data;
  OB_EMP.errors = {};
  window.scrollTo(0, 0);
  render();
}
function obEmpFocusFirstError() {
  const order = ['notice_period_days', 'official_last_day', 'actual_last_day', 'reasons', 'signature_name', 'declaration'];
  const ids = { notice_period_days: 'obEmpNotice', official_last_day: 'obEmpOfficial', actual_last_day: 'obEmpActual', reasons: 'obEmpOther', signature_name: 'obEmpSig', declaration: 'obEmpDeclare' };
  const first = order.find((f) => OB_EMP.errors[f]);
  const el = first && document.getElementById(ids[first]);
  if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }
}

// ---------------------------------------------------------------------------
// Clearance progress, acknowledgement
// ---------------------------------------------------------------------------
function obEmpProgressHtml(b) {
  return `
    <div class="section-title">Department clearance (${b.case.sections_signed}/${b.case.sections_total})</div>
    <ul class="ob-emp-depts">
      ${b.sections.map((s) => `
        <li class="${s.status === 'complete' ? 'done' : ''}">
          <span class="dot" aria-hidden="true">${s.status === 'complete' ? '✓' : ''}</span>
          <span class="name">${esc(s.department_name)}</span>
          <span class="meta">${s.status === 'complete' ? `Cleared by ${esc(s.signed_by_name || '')} · ${obEmpDateTime(s.signed_at)}` : 'Pending'}</span>
        </li>`).join('')}
    </ul>`;
}
function obEmpAckHtml(b) {
  return `
    <div class="section-title">Your exit clearance</div>
    <p class="hint" style="margin-top:-4px;">Each department's checklist, as signed. If anything here looks wrong, contact HR before acknowledging.</p>
    ${b.sections.map((s) => `
      <details class="ob-emp-sec">
        <summary><span class="dot" aria-hidden="true">✓</span> <strong>${esc(s.department_name)}</strong> <span class="meta">— cleared by ${esc(s.signed_by_name || '')}, ${obEmpDateTime(s.signed_at)}</span></summary>
        <ul>${s.items.map((i) => `<li><span aria-hidden="true">${i.is_checked ? '☑' : '☐'}</span> ${esc(i.item_text)}${i.remarks ? ` <span class="meta">— ${esc(i.remarks)}</span>` : ''}</li>`).join('')}</ul>
      </details>`).join('')}
    <div class="section-title">Acknowledge</div>
    <div class="field${OB_EMP.errors.signature_name ? ' invalid' : ''}">
      <label for="obEmpAckSig">Type your full name as your signature <span class="req-star">*</span></label>
      <input type="text" id="obEmpAckSig" value="${obEmpAttr(OB_EMP.draft.signature_name)}" oninput="OB_EMP.draft.signature_name=this.value" autocomplete="name">
      ${obEmpErr('signature_name')}
    </div>
    <label class="ob-emp-declare${OB_EMP.errors.declaration ? ' invalid' : ''}">
      <input type="checkbox" id="obEmpAckDeclare" ${OB_EMP.draft.declaration ? 'checked' : ''} onchange="OB_EMP.draft.declaration=this.checked">
      <span>I acknowledge that I have returned all company property and settled all matters listed above.</span>
    </label>
    ${obEmpErr('declaration')}
    <div id="obEmpFormErr"></div>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="obEmpBack()">← Back to home</button>
      <div class="right"><button class="btn btn-primary" onclick="obEmpAcknowledge()">Acknowledge &amp; sign →</button></div>
    </div>`;
}
async function obEmpAcknowledge() {
  const d = OB_EMP.draft;
  const errs = {};
  if (!d.signature_name.trim()) errs.signature_name = 'Please type your full name to sign.';
  if (!d.declaration) errs.declaration = 'Please tick the acknowledgement box.';
  OB_EMP.errors = errs;
  if (Object.keys(errs).length) { render(); const el = document.getElementById(errs.signature_name ? 'obEmpAckSig' : 'obEmpAckDeclare'); if (el) el.focus(); return; }
  showLoading('Submitting…');
  const { data, error } = await apiTry(() => api.post(`/offboarding/mine/${OB_EMP.caseId}/acknowledge`, { signature_name: d.signature_name.trim(), declaration: true }));
  hideLoading();
  if (error) { const el = document.getElementById('obEmpFormErr'); if (el) el.innerHTML = `<div class="error-banner" role="alert" style="margin-top:14px;">${esc(error.message)}</div>`; return; }
  OB_EMP.bundle = data;
  OB_EMP.errors = {};
  window.scrollTo(0, 0);
  render();
}

async function obEmpPdf(kind) {
  const w = window.open('', '_blank');
  try {
    const res = await fetch(`${API_BASE_URL}/offboarding/mine/${OB_EMP.caseId}/pdf/${kind}`, { headers: { Authorization: `Bearer ${api.getToken()}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    const url = URL.createObjectURL(await res.blob());
    if (w) w.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = `${kind}.pdf`; a.click(); }
  } catch (e) {
    if (w) w.close();
    alert(`Could not open the PDF: ${e.message}`);
  }
}
