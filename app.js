// ============================================================================
// WCT Group Job Application — client logic
// ============================================================================

const STEPS = ['start','personal','language','education','experience','questions','family',
               'referees','attachments','review','consent-lang','pdpa','final','done'];

let state = {
  step: 'start',
  id: null,
  reference_no: null,
  status: 'draft',
  business_unit: '',
  position_applying: '',
  name_nric: '', alias: '',
  permanent_address: '', permanent_address2: '', permanent_postcode: '', permanent_city: '', permanent_state: '',
  correspondence_address: '', correspondence_address2: '', correspondence_postcode: '', correspondence_city: '', correspondence_state: '',
  tel_residence: '', tel_office: '', mobile_phone: '', email: '',
  place_of_birth: '', nric_new: '', passport_number: '', citizen: '', marital_status: '',
  date_of_birth: '', age: '', bumiputra: '', race: '',
  epf_no: '', income_tax_no: '', tax_branch: '', socso_no: '', bank_account_no: '',
  cidb_green_card_no: '', cidb_branch: '',
  // Bahasa Malaysia and English are fixed rows (compulsory); every other
  // language or dialect (Mandarin included) is an "other" row the candidate
  // can add or remove. See normalizeLanguages().
  language_ability: [
    {language:'Bahasa Malaysia', spoken:'', written:''},
    {language:'English', spoken:'', written:''}
  ],
  education: [], // tplEducation() fills in one row per type (EDU_TYPES)
  working_experience: [ {employer:'', from:'', to:'', is_current:false, position:'', remuneration:'', responsibilities:''} ],
  no_working_experience: false,
  spouse_name:'', spouse_occupation:'', spouse_working:'',
  children_below_18_count: null, children_18_to_23_count: null,
  children_below_18: [], children_18_to_23: [], // older applications only; details are now given at onboarding
  resignation_notice_required:'', notice_period:'', date_available_to_start:'',
  expected_basic_salary:'',
  relatives_in_company:'', relatives_name:'', relatives_relationship:'',
  referral_person:'', referral_name:'', referral_department:'',
  own_transport_motorcar:'', own_transport_motorcycle:'',
  willing_based_outside_klang_valley:'',
  physical_defects:'', physical_defects_specify:'',
  arrested_convicted:'', arrested_convicted_specify:'',
  referee1:{name:'',designation:'',company:'',relationship:'',contact:''},
  referee2:{name:'',designation:'',company:'',relationship:'',contact:''},
  no_referees:false,
  declaration_lawsuit:'', declaration_lawsuit_specify:'',
  declaration_other_matters:'', declaration_other_matters_specify:'',
  profile_picture_url:'', attachments:[],
  language_choice:'', jts_agreed:false, pdpa_agreed:false
};

// Education entries (feedback 30 Oct 2026): the form starts with one entry
// whose type the candidate chooses; any entry can be removed.
// 'School' is the stored value for secondary school (older records).
const EDU_TYPES = [['Primary School','Primary School'],['School','Secondary School'],['College/University','College / University'],['Professional Body','Professional Body']];
function blankEdu(type = ''){ return {type, name:'', from_year:'', to_year:'', qualification:'', course_name:''}; }
let eduSeededFor = null; // application whose first blank entry was already added
// The card the candidate just added: it slides in and its first field gets focus.
let wxJustAdded = null;
function wxAddedClass(id){ return wxJustAdded === id ? ' wx-added' : ''; }
function wxFocusAdded(){
  const id = wxJustAdded; wxJustAdded = null;
  if(!id) return;
  requestAnimationFrame(() => {
    const card = document.querySelector(`[data-wx-card="${id}"]`);
    if(!card) return;
    card.scrollIntoView({block:'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    const f = card.querySelector('select, input'); if(f) f.focus({preventScroll:true});
  });
}

const HIGHEST_EDUCATION_OPTIONS = [
  'No Formal Education','Primary Education',
  'Secondary Education or High School',
  'Vocational Qualification','Technical Education','Certificate Program',
  'Associate Degree',"Bachelor's Degree",'Post-Graduate Diploma',
  'Professional Certification',"Master's Degree",'Doctoral Degree (Ph.D., Ed.D., etc.)',
  'Professional Degree (MD, JD, DDS, etc.)','Post-Doctoral Studies','Other'
];

let currentUser = null; // populated at boot from the cached login/register/oauth response (see api.js getUser())

const root = document.getElementById('cardRoot');
const progressBar = document.getElementById('progressBar');
const topRefDisplay = document.getElementById('topRefDisplay');

function showLoading(text){ document.getElementById('loadingText').innerText = text||'Working...'; document.getElementById('loadingOverlay').style.display='flex'; }
function hideLoading(){ document.getElementById('loadingOverlay').style.display='none'; }

function updateField(key, value){ state[key] = value; }
function updateNested(obj, key, value){ obj[key] = value; }
function updateArrayField(arrName, idx, key, value){ state[arrName][idx][key] = value; }

// ---------------------------------------------------------------------------
// Required-field validation UI: highlight + jump-to-field on Next/Submit
// ---------------------------------------------------------------------------
// Strips everything but digits — used on numeric-only fields (NRIC, salary,
// postcode, phone/contact numbers, bank account numbers, etc.) so those
// fields simply can't contain letters or symbols, rather than only
// complaining about it after the fact.
function numericOnly(v){ return (v == null ? '' : String(v)).replace(/[^0-9]/g, ''); }

// A field/fieldset that failed validation gets `.invalid` added (see
// markFieldInvalid below); this single delegated listener removes it the
// moment the person changes anything inside that field, on any step, without
// needing per-field wiring.
document.addEventListener('input', (e) => {
  const f = e.target.closest && e.target.closest('.field.invalid, fieldset.invalid, .upload-box.invalid, td.invalid, .doc-sec.invalid, .no-exp.invalid');
  if(f) f.classList.remove('invalid');
  if(e.target.classList && e.target.classList.contains('invalid')) e.target.classList.remove('invalid');
});
document.addEventListener('change', (e) => {
  const f = e.target.closest && e.target.closest('.field.invalid, fieldset.invalid, .upload-box.invalid, td.invalid, .doc-sec.invalid, .no-exp.invalid');
  if(f) f.classList.remove('invalid');
  if(e.target.classList && e.target.classList.contains('invalid')) e.target.classList.remove('invalid');
});

function markFieldInvalid(fieldId){
  const el = document.getElementById(fieldId);
  if(el) el.classList.add('invalid');
  return el;
}
function clearAllInvalidFields(){
  document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
}

function goStep(s){
  const prev = state.step;
  state.step = s; window.scrollTo(0,0); render();
  if(window.WXC && prev !== s) WXC.stepChanged(prev, s);
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------
function currentPatch(){
  const p = {...state};
  delete p.step; delete p.id; delete p.reference_no; delete p.status;
  delete p.jts_agreed; delete p.pdpa_agreed;
  // "Same as permanent address": store the permanent address as the
  // correspondence one, so HR always sees a full address.
  if(corrSameAsPermanent){
    // null (not '') so a blank permanent field also clears an old
    // correspondence value instead of being skipped by the '' strip below.
    ['address','address2','postcode','city','state'].forEach(k => { p[`correspondence_${k}`] = state[`permanent_${k}`] || null; });
  }
  // Blank "other language" rows are just empty slots on screen.
  p.language_ability = state.language_ability.filter((r, i) => i < 2 || (r.language||'').trim() || r.spoken || r.written);
  // Optional family tables: drop rows nobody filled in.
  p.children_below_18 = state.children_below_18.filter(c => (c.name||'').trim() || (c.nric||'').trim());
  p.children_18_to_23 = state.children_18_to_23.filter(c => (c.name||'').trim() || (c.nric||'').trim());
  if(state.no_working_experience) p.working_experience = [];
  // Strip empty-string values so the database's coalesce() correctly keeps
  // the existing column value instead of overwriting it with ''. Postgres's
  // coalesce() only falls back on NULL, not on empty string — so a blank
  // field sent as '' would actively overwrite good data, and for
  // constrained columns (like language_choice, which only allows 'BM'/'EN')
  // would fail the save entirely, exactly like the earlier date-field bug.
  Object.keys(p).forEach(key => {
    if(p[key] === '') delete p[key];
  });
  return p;
}

async function saveDraft(){
  if(!state.id) return true;
  showLoading('Saving your progress...');
  let success = true;
  try{
    const { error } = await apiTry(() => api.patch(`/applications/${state.id}`, {
      reference_no: state.reference_no, patch: currentPatch()
    }));
    if(error && error.sessionEnded){
      success = false;
      showSessionEnded();
    } else if(error){
      console.error(error);
      success = false;
      alert(`Your progress could not be saved:\n\n${error.message}\n\nPlease try again — if this keeps happening, contact support before continuing, since your latest changes have NOT been saved.`);
    } else if(window.WX){
      WX.toast('Progress saved', { kind: 'ok', timeout: 1800 });
    }
  } catch(e){
    console.error(e);
    success = false;
    alert(`Your progress could not be saved:\n\n${e.message}\n\nPlease try again — if this keeps happening, contact support before continuing, since your latest changes have NOT been saved.`);
  }
  hideLoading();
  return success;
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
// Short names for the progress caption ("Step 3 of 11 · Education").
const STEP_LABELS = {
  personal:'Personal Particulars', language:'Language Ability', education:'Education',
  experience:'Working Experience', questions:'Employment Questions', family:'Family Details', referees:'Referees & Declarations',
  attachments:'Photo & Documents', review:'Review', 'consent-lang':'Consent Language', pdpa:'PDPA Consent', final:'Submit'
};

// SVG icons (replacing emoji so they render the same everywhere and can be
// labelled for screen readers).
const UI_ICON = {
  pdf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 18v-6m0 6-3-3m3 3 3-3"/></svg>',
  draft: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  calendar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  camera: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>',
  clip: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  file: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
};

function renderProgress(){
  if(state.step === 'offboarding'){
    // Offboarding has its own stepper inside the card.
    progressBar.innerHTML = '';
    const userPart0 = currentUser ? `<span style="margin-right:14px;">${esc(currentUser.email)}</span><button class="btn" style="background:#fff;color:var(--navy);border:1px solid #fff;padding:6px 12px;font-size:12.5px;" onclick="signOut()">Sign out</button>` : '';
    topRefDisplay.innerHTML = userPart0;
    return;
  }
  const visibleSteps = STEPS.filter(s=>s!=='start' && s!=='done');
  const idx = visibleSteps.indexOf(state.step);
  // Visible caption + an accessible progressbar for the application wizard;
  // pages outside the wizard (home, onboarding, details) show no bar.
  if(idx < 0){ progressBar.innerHTML = ''; progressBar.removeAttribute('role'); }
  else {
    progressBar.setAttribute('role', 'progressbar');
    progressBar.setAttribute('aria-valuemin', '1');
    progressBar.setAttribute('aria-valuemax', String(visibleSteps.length));
    progressBar.setAttribute('aria-valuenow', String(idx + 1));
    progressBar.setAttribute('aria-valuetext', `Step ${idx + 1} of ${visibleSteps.length}: ${STEP_LABELS[state.step] || ''}`);
    // Form steps are buttons (Malls feedback, 29 Oct 2026): jump to any step
    // already completed, plus the first one still to do.
    const reach = FORM_STEPS.indexOf(firstIncompleteStep());
    progressBar.innerHTML = `<div class="progress-caption">Step ${idx + 1} of ${visibleSteps.length} · <strong>${esc(STEP_LABELS[state.step] || '')}</strong><span class="progress-tip"> · Select a step to jump to it</span></div>
      <div class="progress-segs">${visibleSteps.map((s,i)=>{
        let cls='pstep'; if(i<idx) cls+=' done'; if(i===idx) cls+=' active';
        const f = FORM_STEPS.indexOf(s);
        const open = f >= 0 && f <= reach && i !== idx;
        const label = `Step ${i + 1}: ${STEP_LABELS[s] || ''}`;
        return open
          ? `<button type="button" class="${cls}" title="${esc(label)}" aria-label="Go to ${esc(label)}" onclick="jumpToStep('${s}')"></button>`
          : `<span class="${cls}" title="${esc(label)}"${i === idx ? ' aria-current="step"' : ''}></span>`;
      }).join('')}</div>`;
  }
  const refPart = state.reference_no ? `<span style="margin-right:14px;">Ref: ${state.reference_no}</span>` : '';
  const userPart = currentUser ? `<span style="margin-right:14px;">${esc(currentUser.email)}</span><button class="btn" style="background:#fff;color:var(--navy);border:1px solid #fff;padding:6px 12px;font-size:12.5px;" onclick="signOut()">Sign out</button>` : '';
  topRefDisplay.innerHTML = refPart + userPart;
}

// ---------------------------------------------------------------------------
// MAIN RENDER DISPATCH
// ---------------------------------------------------------------------------
function render(){
  renderProgress();
  switch(state.step){
    case 'start': root.innerHTML = tplStart(); break;
    case 'personal': root.innerHTML = tplPersonal(); break;
    case 'language': root.innerHTML = tplLanguage(); break;
    case 'education': root.innerHTML = tplEducation(); break;
    case 'experience': root.innerHTML = tplExperience(); break;
    case 'questions': root.innerHTML = tplQuestions(); break;
    case 'family': root.innerHTML = tplFamily(); break;
    case 'referees': root.innerHTML = tplReferees(); break;
    case 'attachments': root.innerHTML = tplAttachments(); break;
    case 'review': root.innerHTML = tplReview(); break;
    case 'consent-lang': root.innerHTML = tplConsentLang(); break;
    case 'pdpa': root.innerHTML = tplPdpa(); break;
    case 'final': root.innerHTML = tplFinal(); break;
    case 'done': root.innerHTML = tplDone(); break;
    case 'onboarding': root.innerHTML = tplOnboarding(); break;
    case 'offboarding': root.innerHTML = tplMyOffboarding(); break;
    case 'my-application-detail': root.innerHTML = tplMyApplicationDetail(); break;
  }
}

// ---------------------------------------------------------------------------
// STEP: start (new application, or pick up one of the signed-in user's own drafts)
// ---------------------------------------------------------------------------
let myApplications = [];

let linkBusinessUnit = null; // which business unit this candidate is applying
// under, derived from the URL (?bu=Mall etc.) rather than a dropdown —
// see boot() below.

// Candidates don't see their application status (stakeholder feedback
// 29 Oct 2026): HR contacts them about the outcome. Hired candidates still
// get the Onboarding Details button.

function tplStart(){
  const drafts = myApplications.filter(a=>a.status==='draft');
  const others = myApplications.filter(a=>a.status!=='draft');

  return `
    <div class="step-eyebrow">Welcome${currentUser?.name ? ', '+esc(currentUser.name) : ''}</div>
    <h2>Employment Application</h2>
    <p class="step-desc">Apply once — your application goes straight to the right hiring team in WCT Group.</p>

    ${obEmpHomeCardHtml()}

    ${drafts.length ? `
      <div class="section-title" style="margin-top:0;">Continue a Saved Application</div>
      ${drafts.map(a=>`
        <div class="draft-banner">
          <div class="draft-banner-icon">${UI_ICON.draft}</div>
          <div class="draft-banner-body">
            <div class="draft-banner-title">${esc(a.reference_no)}</div>
            <div class="draft-banner-meta">${esc(WCT.buName(a.business_unit))} · Draft in progress</div>
          </div>
          <div class="draft-banner-actions" style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="continueDraft('${a.id}')">Continue →</button>
            <button class="btn" style="background:var(--danger);color:#fff;" onclick="deleteDraft('${a.id}','${esc(a.reference_no)}')">Delete</button>
          </div>
        </div>
      `).join('')}
    ` : ''}

    ${others.length ? `
      <div class="section-title" style="margin-top:${drafts.length?'22px':'0'};">Your Previous Applications</div>
      <table class="history-table">
        <thead><tr><th>Reference</th><th>Unit</th><th>Position</th><th>Submitted</th><th style="width:160px;">Actions</th></tr></thead>
        <tbody>
          ${others.map(a=>`
            <tr>
              <td><strong><a href="#" onclick="viewMyApplication('${a.id}'); return false;" style="color:var(--navy-2);text-decoration:underline;">${esc(a.reference_no)}</a></strong></td>
              <td>${esc(WCT.buName(a.business_unit))}</td>
              <td>${esc(a.position_applying)||'—'}</td>
              <td>${a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('en-GB') : '—'}</td>
              <td>
                <div class="history-actions">
                  ${a.status==='hired' ? `<button class="btn btn-primary btn-sm" onclick="openOnboarding('${a.id}')">Onboarding Details</button>` : ''}
                  ${a.status!=='hired' ? '<span style="color:var(--ink-soft);font-size:12.5px;">—</span>' : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

    ${(!linkBusinessUnit && obEmpHasCases()) ? '' : `
    <div class="section-title" style="margin-top:26px;">Start a New Application</div>
    ${linkBusinessUnit ? `
      <p class="step-desc" style="margin-top:0;">You are applying for a position with <strong>${esc(WCT.buName(linkBusinessUnit))}</strong>.</p>
      ${others.length ? `
        <div class="error-banner" style="background:#FDF3E3;border-color:#E2D3AC;color:#9C7A0E;">
          You've previously submitted ${others.length===1?'an application':others.length+' applications'} (see "Your Previous Applications" above). Submitting a new one may create a duplicate — please check the table first if you're unsure whether you've already applied.
        </div>
      ` : ''}
      <div id="startErr"></div>
      <div class="btn-row"><div></div><div class="right"><button class="btn btn-primary" id="beginAppBtn" onclick="startNewApplication()">Begin Application →</button></div></div>
    ` : `
      <div class="error-banner">This application link doesn't specify a valid business unit. Please use the link provided by HR for the business unit you're applying to (${esc(WCT.businessUnits().map(u=>u.name).join(', '))}).</div>
    `}
    `}
  `;
}

async function deleteDraft(id, referenceNo){
  if(!confirm(`Permanently delete the draft application "${referenceNo}"? This cannot be undone.`)) return;
  showLoading('Deleting draft...');
  try{
    const { error } = await apiTry(() => api.del(`/applications/${id}`));
    if(error) throw error;
    await loadMyApplications();
    render();
  } catch(e){
    alert('Error deleting draft: ' + e.message);
  }
  hideLoading();
}

async function continueDraft(id){
  const row = myApplications.find(a=>a.id===id);
  if(!row) return;
  pdpaDraft = { name: '', nric: '', agreed: false }; // never carry a signature over from another application
  loadStateFromRow(row);
  reachedReview = firstIncompleteStep() === 'review';
  goStep(reachedReview ? 'review' : 'personal');
}

let viewingApplicationId = null;
function viewMyApplication(id){
  viewingApplicationId = id;
  goStep('my-application-detail');
}

function tplMyApplicationDetail(){
  const a = myApplications.find(x=>x.id===viewingApplicationId);
  if(!a){
    return `
      <div class="step-eyebrow">Application Details</div>
      <h2>Not found</h2>
      <p class="step-desc">This application could not be found.</p>
      <button class="btn btn-ghost" onclick="goStep('start')">← Back to My Applications</button>
    `;
  }
  return `
    <div class="step-eyebrow">${esc(a.reference_no)}</div>
    <h2>Application Details</h2>
    <p class="step-desc">${esc(WCT.buName(a.business_unit))} · Submitted ${a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('en-GB') : '—'}</p>
    ${applicationSummaryHtml(a, false)}
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="goStep('start')">← Back to My Applications</button>
      <div class="right"><button class="btn btn-primary" onclick="exportMyApplicationPdfById('${a.id}')">${UI_ICON.pdf} Download as PDF</button></div>
    </div>
  `;
}

async function loadMyApplications(){
  try{
    const { data, error } = await apiTry(() => api.get('/applications/mine'));
    if(error) throw error;
    myApplications = data || [];
  } catch(e){ console.error(e); myApplications = []; }
}

async function startNewApplication(){
  if(!linkBusinessUnit){
    document.getElementById('startErr').innerHTML = `<div class="error-banner">This application link doesn't specify a valid business unit.</div>`;
    return;
  }
  showLoading('Creating your application...');
  pdpaDraft = { name: '', nric: '', agreed: false };
  try{
    const { data, error } = await apiTry(() => api.post('/applications', { business_unit: linkBusinessUnit }));
    if(error) throw error;
    state.id = data.id; state.reference_no = data.reference_no;
    reachedReview = false;
    state.business_unit = linkBusinessUnit;
    // Pre-fill from the signed-in account
    if(currentUser){
      state.name_nric = state.name_nric || currentUser.name || '';
      state.email = state.email || currentUser.email || '';
    }
    await saveDraft();
    hideLoading();
    goStep('personal');
  } catch(e){
    hideLoading();
    document.getElementById('startErr').innerHTML = `<div class="error-banner">Something went wrong: ${e.message}</div>`;
  }
}

function loadStateFromRow(row){
  Object.keys(row).forEach(k=>{
    if(k in state || ['id','reference_no','status'].includes(k)){
      if(k==='language_ability' && (!row[k] || row[k].length===0)) return;
      if(k==='education' && (!row[k] || row[k].length===0)) return;
      if(k==='working_experience' && (!row[k] || row[k].length===0)) return;
      if(['attachments','children_below_18','children_18_to_23'].includes(k) && !row[k]) return;
      state[k] = row[k] ?? state[k];
    }
  });
  state.language_ability = normalizeLanguages(state.language_ability);
  ['referee1','referee2'].forEach(k => { state[k] = {name:'',designation:'',company:'',relationship:'',contact:'', ...(state[k]||{})}; });
  state.no_working_experience = !!state.no_working_experience;
  state.no_referees = !!state.no_referees;
  corrSameAsPermanent = WCT.sameAddress(state);
  // If the saved SOCSO number differs from the NRIC, treat it as intentionally
  // edited so we don't silently overwrite it if they revisit the NRIC field.
  socsoManuallyEdited = !!(state.socso_no && state.socso_no !== state.nric_new);
}

// ---------------------------------------------------------------------------
// STEP: personal particulars
// ---------------------------------------------------------------------------
function tplPersonal(){
  return `
    <div class="step-eyebrow">Application Form</div>
    <h2>Personal Particulars</h2>
    <p class="step-desc">Applying with <strong>${esc(WCT.buName(state.business_unit))}</strong></p>

    <div class="field" id="field-position_applying"><label>Position Applying For <span class="req-star">*</span></label><input type="text" placeholder="e.g. Site Engineer" value="${esc(state.position_applying)}" oninput="updateField('position_applying', this.value)"></div>

    <div class="grid">
      <div class="field" id="field-name_nric"><label>Name (per NRIC / Passport) <span class="req-star">*</span></label><input type="text" placeholder="e.g. Ahmad Bin Ali" value="${esc(state.name_nric)}" oninput="updateField('name_nric', this.value)"></div>
      <div class="field"><label>Alias <span class="opt-tag">(optional)</span></label><input type="text" value="${esc(state.alias)}" oninput="updateField('alias', this.value)"></div>
    </div>

    ${addressFieldsHtml('permanent', 'Permanent Address')}

    <label class="radio-opt" style="margin:4px 0 14px;"><input type="checkbox" ${corrSameAsPermanent?'checked':''} onchange="toggleCorrSame(this.checked)"> My correspondence address is the same as my permanent address</label>
    ${corrSameAsPermanent ? '' : addressFieldsHtml('correspondence', 'Correspondence Address')}

    <div class="grid g3">
      <div class="field"><label>Tel — Residence <span class="opt-tag">(optional)</span></label><input type="tel" inputmode="numeric" placeholder="e.g. 0312345678" value="${esc(state.tel_residence)}" oninput="this.value=numericOnly(this.value);updateField('tel_residence', this.value)"></div>
      <div class="field"><label>Tel — Office <span class="opt-tag">(optional)</span></label><input type="tel" inputmode="numeric" placeholder="e.g. 0387654321" value="${esc(state.tel_office)}" oninput="this.value=numericOnly(this.value);updateField('tel_office', this.value)"></div>
      <div class="field" id="field-mobile_phone"><label>Mobile Phone <span class="req-star">*</span></label><input type="tel" inputmode="numeric" placeholder="e.g. 0123456789" maxlength="11" value="${esc(state.mobile_phone)}" oninput="this.value=numericOnly(this.value);updateField('mobile_phone', this.value)"><div class="hint">10–11 digits, no dashes or spaces</div></div>
    </div>

    <div class="grid">
      <div class="field" id="field-email"><label>E-mail Address <span class="req-star">*</span></label><input type="email" placeholder="e.g. ahmad.ali@example.com" value="${esc(state.email)}" oninput="updateField('email', this.value)"></div>
      <div class="field" id="field-place_of_birth"><label>Place of Birth <span class="req-star">*</span></label><input type="text" placeholder="e.g. Kuala Lumpur" value="${esc(state.place_of_birth)}" oninput="updateField('place_of_birth', this.value)"></div>
    </div>

    <div class="section-title">Identification</div>
    <div class="grid g3">
      <div class="field" id="field-citizen">
        <label>Citizen <span class="req-star">*</span></label>
        <select onchange="handleCitizenChange(this.value)">
          <option value="">Select</option>
          <option ${state.citizen==='Malaysian'?'selected':''}>Malaysian</option>
          <option ${state.citizen==='Non-Malaysian'?'selected':''}>Non-Malaysian</option>
        </select>
      </div>
      <div class="field" id="field-nric_new">
        <label>NRIC No. (without dash) ${state.citizen==='Malaysian' ? '<span class="req-star">*</span>' : ''}</label>
        <input type="text" inputmode="numeric" value="${esc(state.nric_new)}" placeholder="e.g. 900101011234" maxlength="12"
          ${state.citizen==='Non-Malaysian' ? 'disabled style="background:#F2F2F1;"' : ''}
          oninput="handleNricChange(this)">
        <div id="nricValidationMsg" class="hint"></div>
      </div>
      <div class="field" id="field-passport_number">
        <label>Passport Number ${state.citizen==='Non-Malaysian' ? '<span class="req-star">*</span>' : '<span class="opt-tag">(optional)</span>'}</label>
        <input type="text" value="${esc(state.passport_number)}" placeholder="e.g. A12345678" oninput="updateField('passport_number', this.value)">
      </div>
    </div>
    <div class="grid g3">
      <div class="field" id="field-date_of_birth">
        <label>Date of Birth <span class="req-star">*</span></label>
        <div style="display:flex;gap:6px;">
          <input type="text" id="dobTextInput" inputmode="numeric" autocomplete="off" placeholder="DD/MM/YYYY" maxlength="10"
            value="${esc(formatDobForDisplay(state.date_of_birth))}" oninput="handleDobTextInput(this)" style="flex:1;">
          <button type="button" class="btn btn-ghost btn-sm icon-btn" title="Pick from calendar" aria-label="Pick date of birth from calendar"
            onclick="const p=document.getElementById('dobPickerInput'); if(p.showPicker){p.showPicker();} else {p.focus();}">${UI_ICON.calendar}</button>
        </div>
        <!-- Kept as a real (but visually hidden) native date input purely so
             the calendar button can open the browser's own calendar picker via
             showPicker() — the visible field above is the actual typing UI,
             always displayed/entered as DD/MM/YYYY regardless of the
             browser's locale, since a bare <input type="date"> renders in
             whatever format the browser/OS locale picks (e.g. mm/dd/yyyy in
             en-US), which isn't what candidates here expect. -->
        <input type="date" id="dobPickerInput" value="${esc(state.date_of_birth)}" onchange="handleDobChange(this.value)"
          style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;">
      </div>
      <div class="field"><label>Age</label><input type="number" id="ageInput" value="${esc(state.age)}" readonly style="background:#F2F2F2;"></div>
      <div class="field" id="field-marital_status"><label>Marital Status <span class="req-star">*</span></label>
        <select oninput="updateField('marital_status', this.value)">
          <option value="">Select</option>
          ${['Single','Married','Divorced','Widowed'].map(o=>`<option ${state.marital_status===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="grid g3">
      <div class="field" id="field-bumiputra"><label>Bumiputra <span class="req-star">*</span></label>
        <select oninput="updateField('bumiputra', this.value)">
          <option value="">Select</option><option ${state.bumiputra==='Yes'?'selected':''}>Yes</option><option ${state.bumiputra==='No'?'selected':''}>No</option>
        </select>
      </div>
      <div class="field" id="field-race"><label>Race <span class="req-star">*</span></label><input type="text" placeholder="e.g. Malay" value="${esc(state.race)}" oninput="updateField('race', this.value)"></div>
      <div></div>
    </div>

    ${navButtonsValidated('start','language', validatePersonalStep)}
  `;
}

function validatePersonalStep(){
  const errs = [];
  if(!state.position_applying.trim()) errs.push({field:'field-position_applying', message:'Please enter the position you are applying for.'});
  if(!state.name_nric.trim()) errs.push({field:'field-name_nric', message:'Please enter your name (per NRIC/Passport).'});
  addressErrors('permanent', 'permanent address', errs);
  if(!corrSameAsPermanent) addressErrors('correspondence', 'correspondence address', errs);
  if(!state.mobile_phone.trim()) errs.push({field:'field-mobile_phone', message:'Please enter your mobile phone number.'});
  else if(!WCT.isValidPhone(state.mobile_phone)) errs.push({field:'field-mobile_phone', message:'Mobile phone number must be 10–11 digits.'});
  if(!state.email.trim()) errs.push({field:'field-email', message:'Please enter your email address.'});
  if(!state.place_of_birth.trim()) errs.push({field:'field-place_of_birth', message:'Please enter your place of birth.'});
  if(!state.citizen) errs.push({field:'field-citizen', message:'Please select your citizenship.'});
  if(state.citizen === 'Malaysian'){
    const digits = numericOnly(state.nric_new);
    if(!state.nric_new.trim()) errs.push({field:'field-nric_new', message:'Please enter your NRIC number.'});
    else if(digits.length !== 12) errs.push({field:'field-nric_new', message:'NRIC number must be exactly 12 digits.'});
  } else if(state.citizen === 'Non-Malaysian'){
    if(!state.passport_number.trim()) errs.push({field:'field-passport_number', message:'Please enter your passport number.'});
  }
  if(!state.date_of_birth) errs.push({field:'field-date_of_birth', message:'Please provide your date of birth.'});
  if(!state.marital_status) errs.push({field:'field-marital_status', message:'Please select your marital status.'});
  if(!state.bumiputra) errs.push({field:'field-bumiputra', message:'Please answer the Bumiputra question.'});
  if(!state.race.trim()) errs.push({field:'field-race', message:'Please enter your race.'});
  return errs;
}

// Address: Line 1 | Line 2, then Postcode | City | State (stakeholder
// feedback 2026-10-14). Line 1 keeps the original *_address column, so old
// one-box addresses still show up in Line 1.
let corrSameAsPermanent = true;
function addressFieldsHtml(kind, title){
  const v = (k) => esc(state[`${kind}_${k}`]);
  const up = (k) => `updateField('${kind}_${k}', this.value)`;
  return `
    <div class="section-title" style="margin-top:6px;">${title} <span class="req-star">*</span></div>
    <div class="grid">
      <div class="field" id="field-${kind}_address"><label for="${kind}Addr1">Address line 1 <span class="req-star">*</span></label><input type="text" id="${kind}Addr1" autocomplete="address-line1" placeholder="e.g. No. 12, Jalan Damai 3/2" value="${v('address')}" oninput="${up('address')}"></div>
      <div class="field"><label for="${kind}Addr2">Address line 2 <span class="opt-tag">(optional)</span></label><input type="text" id="${kind}Addr2" autocomplete="address-line2" placeholder="e.g. Taman Damai Indah" value="${v('address2')}" oninput="${up('address2')}"></div>
    </div>
    <div class="grid g3">
      <div class="field" id="field-${kind}_postcode"><label for="${kind}Postcode">Postcode <span class="req-star">*</span></label><input type="text" id="${kind}Postcode" inputmode="numeric" autocomplete="postal-code" placeholder="e.g. 47100" maxlength="5" value="${v('postcode')}" oninput="this.value=numericOnly(this.value);${up('postcode')}"></div>
      <div class="field" id="field-${kind}_city"><label for="${kind}City">City <span class="req-star">*</span></label><input type="text" id="${kind}City" autocomplete="address-level2" placeholder="e.g. Puchong" value="${v('city')}" oninput="${up('city')}"></div>
      <div class="field" id="field-${kind}_state"><label for="${kind}State">State <span class="req-star">*</span></label>
        <select id="${kind}State" autocomplete="address-level1" onchange="${up('state')}"><option value="">Select</option>${WCT.MY_STATES.map(o=>`<option ${state[`${kind}_state`]===o?'selected':''}>${o}</option>`).join('')}</select></div>
    </div>`;
}
function addressErrors(kind, label, errs){
  if(!(state[`${kind}_address`]||'').trim()) errs.push({field:`field-${kind}_address`, message:`Please enter address line 1 of your ${label}.`});
  const pc = (state[`${kind}_postcode`]||'').trim();
  if(!pc) errs.push({field:`field-${kind}_postcode`, message:`Please enter the postcode of your ${label}.`});
  else if(state[`${kind}_state`] !== 'Outside Malaysia' && !/^\d{5}$/.test(pc)) errs.push({field:`field-${kind}_postcode`, message:`The postcode of your ${label} must be 5 digits.`});
  if(!(state[`${kind}_city`]||'').trim()) errs.push({field:`field-${kind}_city`, message:`Please enter the city of your ${label}.`});
  if(!state[`${kind}_state`]) errs.push({field:`field-${kind}_state`, message:`Please select the state of your ${label}.`});
}
function toggleCorrSame(checked){
  corrSameAsPermanent = checked;
  if(!checked && WCT.sameAddress(state)){
    ['address','address2','postcode','city','state'].forEach(k => { state[`correspondence_${k}`] = ''; });
  }
  render();
}

// SOCSO number auto-mirrors the NRIC field as the person types it, since for
// most Malaysian employees the two match. It stays editable — once the person
// types into the SOCSO field directly, we stop overwriting it from NRIC.
let socsoManuallyEdited = false;

// ============================================================================
// POST-HIRE ONBOARDING — multi-step wizard (one section at a time, matching
// the main application's UX). The Salary Crediting Requisition Form (formerly
// its own step) was folded into Statutory Details (2026-09-15): the Bank
// field and the bilingual salary-crediting confirmation now live there, and
// the standalone 'salary' step no longer exists.
// ============================================================================

// Spouse & children moved to the job application (Family Details step) on
// 2026-10-14, so onboarding is two steps plus the review.
const ONBOARDING_STEPS = ['statutory','emergency_beneficiary','review'];

let onboardingAppId = null;
let onboardingState = null;
let onboardingStep = 'statutory';

async function openOnboarding(applicationId){
  showLoading('Loading onboarding forms...');
  try{
    const { data, error } = await apiTry(() => api.get(`/onboarding/${applicationId}`));
    if(error) throw error;
    onboardingAppId = applicationId;
    onboardingState = data;
    obSeedChildren(onboardingState);
    salaryAck = { name: '', agreed: !!data.salary_crediting_confirmed };
    personalAck = { name: data.personal_details_signed_name || '', agreed: !!data.personal_details_confirmed };
    onboardingStep = onboardingState.status === 'completed' ? 'review' : 'statutory';
    hideLoading();
    goStep('onboarding');
  } catch(e){
    hideLoading();
    alert('Could not load onboarding forms: ' + e.message);
  }
}

async function saveOnboarding(showAlert){
  try{
    const patch = {
      epf_no: document.getElementById('ob_epf_no')?.value.trim() || '',
      income_tax_no: document.getElementById('ob_income_tax_no')?.value.trim() || '',
      tax_branch: document.getElementById('ob_tax_branch')?.value.trim() || '',
      socso_no: document.getElementById('ob_socso_no')?.value.trim() || '',
      bank_account_no: document.getElementById('ob_bank_account_no')?.value.trim() || '',
      cidb_green_card_no: document.getElementById('ob_cidb_green_card_no')?.value.trim() || '',
      emergency_contacts: onboardingState.emergency_contacts,
      beneficiary_name: document.getElementById('ob_beneficiary_name')?.value.trim() || '',
      beneficiary_relationship: document.getElementById('ob_beneficiary_relationship')?.value.trim() || '',
      beneficiary_contact: document.getElementById('ob_beneficiary_contact')?.value.trim() || '',
      tp3_data: onboardingState.tp3_data,
      salary_company: document.getElementById('ob_salary_company')?.value || onboardingState.salary_company || '',
      salary_bank: document.getElementById('ob_salary_bank')?.value.trim() || '',
      // Salary Account No. is no longer its own editable field — it always
      // mirrors Bank Account No. directly at save time.
      salary_account_no: document.getElementById('ob_bank_account_no')?.value.trim() || ''
    };
    // Only the currently-displayed onboarding step's fields actually exist
    // in the DOM at any moment — every other step's fields fall back to ''
    // above. Strip those before sending, so calling save from e.g. the
    // Spouse & Children step doesn't send epf_no: '' and blank out an
    // already-saved Statutory Details value via coalesce(). This mirrors
    // the identical fix already applied to the main application's
    // currentPatch() for the same reason. Array/object fields pulled
    // directly from onboardingState (children, contacts, tp3_data) don't
    // have this problem — they reflect true current state regardless of
    // which step is on screen — so they're left untouched here.
    Object.keys(patch).forEach(key => {
      if(patch[key] === '') delete patch[key];
    });
    // Children are always given here (sent in full, so a removed child goes).
    ['children_below_18','children_18_to_23'].forEach(k => {
      patch[k] = (onboardingState[k] || []).filter(c => (c.name||'').trim() || (c.nric||'').trim());
    });
    const { data, error } = await apiTry(() => api.patch(`/onboarding/${onboardingAppId}`, { patch }));
    if(error) throw error;
    onboardingState = { ...data, available_companies: onboardingState.available_companies, family: onboardingState.family }; obSeedChildren(onboardingState);
    if(showAlert) alert('Saved.');
    return true;
  } catch(e){
    if(e.sessionEnded) showSessionEnded(); else alert('Your details could not be saved: ' + e.message + '\n\nPlease try again.');
    return false;
  }
}

async function onboardingGoStep(step){
  if(onboardingStep === 'statutory'){
    const errs = validateObChildren();
    const box = document.getElementById('obFamErr');
    if(errs.length){
      clearAllInvalidFields();
      if(box) box.innerHTML = `<div class="error-banner">${errs.map(e => esc(e.message)).join('<br>')}</div>`;
      const el = errs[0].field && markFieldInvalid(errs[0].field);
      if(el) el.scrollIntoView({ behavior:'smooth', block:'center' });
      return;
    }
    if(box) box.innerHTML = '';
  }
  const ok = await saveOnboarding(false);
  if(ok){ onboardingStep = step; render(); window.scrollTo(0,0); }
}

// Education level dropdown used for both children tables — kindergarten
// through college/university, default "-" (blank/not applicable, since a
// young child may not be in school yet).
const CHILD_EDUCATION_LEVELS = ['-', 'Kindergarten', 'Primary School', 'Secondary School', 'College/University'];
function childEducationOptionsHtml(selected){
  return CHILD_EDUCATION_LEVELS.map(o=>`<option value="${o==='-'?'':o}" ${(selected||'')===(o==='-'?'':o)?'selected':''}>${o}</option>`).join('');
}

function addEmergencyContact(){ onboardingState.emergency_contacts = [...onboardingState.emergency_contacts, {name:'',relationship:'',contact:''}]; render(); }
function removeEmergencyContact(i){ onboardingState.emergency_contacts.splice(i,1); render(); }
function updateEmergencyContact(i, key, val){ onboardingState.emergency_contacts[i][key] = val; }

function backFromOnboarding(){
  onboardingAppId = null; onboardingState = null; onboardingStep = 'statutory';
  salaryAck = { name: '', agreed: false }; personalAck = { name: '', agreed: false };
  goStep('start');
}

function obProgressBar(){
  const visible = ONBOARDING_STEPS.filter(s=>s!=='review');
  const idx = visible.indexOf(onboardingStep);
  return `<div class="progress" style="margin-bottom:22px;">${visible.map((s,i)=>{
    let cls='seg'; if(i<idx) cls+=' done'; if(i===idx) cls+=' active';
    return `<div class="${cls}"></div>`;
  }).join('')}</div>`;
}

function tplOnboarding(){
  if(onboardingStep === 'review') return tplObReview();
  if(onboardingStep === 'preview') return tplObPreview();
  const stepMap = {
    statutory: tplObStatutory,
    emergency_beneficiary: tplObEmergencyBeneficiary
  };
  return `
    <div class="step-eyebrow">Onboarding</div>
    <h2>Post-Hire Details</h2>
    ${obProgressBar()}
    ${stepMap[onboardingStep]()}
  `;
}

// Shared "Save & Exit" button, placed directly to the left of each
// onboarding step's own "Next →"/submit button (inside that button's own
// ".right" wrapper) rather than centered below the whole page — so it reads
// as a secondary action alongside Next, not a separate detached control.
function saveExitBtnHtml(){
  return `<button class="btn btn-ghost" onclick="saveAndExitOnboarding()">Save &amp; Exit</button>`;
}

async function saveAndExitOnboarding(){
  showLoading('Saving your progress...');
  const ok = await saveOnboarding(false);
  hideLoading();
  if(ok) backFromOnboarding();
}

// ---------------------------------------------------------------------------
// STEP 1: Statutory Details
// ---------------------------------------------------------------------------
function tplObStatutory(){
  const o = onboardingState;
  return `
    <div class="step-desc">Congratulations on being hired! Let's get your onboarding details sorted, one section at a time.</div>
    <div class="section-title" style="margin-top:0;">Statutory Details</div>
    <div class="grid">
      <div class="field"><label>EPF No.</label><input type="text" inputmode="numeric" id="ob_epf_no" value="${esc(o.epf_no)}" oninput="this.value=numericOnly(this.value)"></div>
      <div class="field"><label>SOCSO No.</label><input type="text" inputmode="numeric" id="ob_socso_no" value="${esc(o.socso_no)}" oninput="this.value=numericOnly(this.value)"></div>
    </div>
    <div class="grid">
      <div class="field"><label>Income Tax No.</label><input type="text" id="ob_income_tax_no" value="${esc(o.income_tax_no)}"></div>
      <div class="field"><label>Tax Branch</label><input type="text" id="ob_tax_branch" value="${esc(o.tax_branch)}"></div>
    </div>
    <div class="grid">
      <div class="field"><label>CIDB Green Card No.</label><input type="text" id="ob_cidb_green_card_no" placeholder="e.g. N/A" value="${esc(o.cidb_green_card_no)}"></div>
    </div>

    ${obChildrenHtml()}

    <div class="section-title">Bank Details (Salary Crediting)</div>
    <div class="grid">
      <div class="field"><label for="ob_salary_bank">Bank</label><input type="text" placeholder="e.g. Maybank" id="ob_salary_bank" value="${esc(o.salary_bank)}"></div>
      <div class="field"><label for="ob_bank_account_no">Bank Account No.</label><input type="text" inputmode="numeric" id="ob_bank_account_no" value="${esc(o.bank_account_no)}" oninput="this.value=numericOnly(this.value)"></div>
    </div>
    ${(o.available_companies||[]).length ? `<div class="grid">
      <div class="field"><label for="ob_salary_company">Employing company</label>
        <select id="ob_salary_company"><option value="">Select</option>${o.available_companies.map(c=>`<option ${o.salary_company===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div><div></div></div>` : ''}

    <p style="font-size:12.5px;color:var(--ink-soft);margin-top:14px;">I confirm that the information herein is correct and in order. Should there be any discrepancy in the information, which will lead to possible delay or inability to credit my salaries, it is my sole responsibility.<br><br>
    <em>Saya mengesahkan maklumat tersebut diatas adalah betul dan teratur. Sebarang perbezaan dalam maklumat tersebut, yang mungkin mengakibatkan kelewatan ataupun ketidakmasukan gaji, adalah tanggungjawab saya sendiri.</em></p>

    ${WCT.sigHtml({
      id: 'salarySig', title: 'Salary crediting confirmation',
      name: salaryAck.name || obApplicantName(), agreed: salaryAck.agreed,
      signedAt: o.salary_crediting_confirmed ? o.salary_crediting_confirmed_at : null,
      agreeText: 'I confirm the above information is correct.',
      onChange: (v) => { salaryAck = { name: v.name, agreed: v.agreed }; },
    })}

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="backFromOnboarding()">← Back to My Applications</button>
      <div class="right">${saveExitBtnHtml()}<button class="btn btn-primary" data-sig-gate="salarySig" ${(salaryAck.agreed && (salaryAck.name || obApplicantName())) || o.salary_crediting_confirmed ? '' : 'disabled'} onclick="onboardingGoStep('emergency_beneficiary')">Next →</button></div>
    </div>
    <p class="hint" data-sig-hint="salarySig" style="text-align:right;margin-top:6px;" ${(salaryAck.agreed && (salaryAck.name || obApplicantName())) || o.salary_crediting_confirmed ? 'hidden' : ''}>Please sign the confirmation above to continue.</p>
  `;
}

// ---------------------------------------------------------------------------
// STEP 3: Emergency Contact(s) + Beneficiary + confirm
// ---------------------------------------------------------------------------
function tplObEmergencyBeneficiary(){
  const o = onboardingState;
  return `
    <div class="section-title" style="margin-top:0;">Emergency Contact(s)</div>
    <table class="dyn">
      <thead><tr><th>Name (per NRIC)</th><th>Relationship</th><th>Phone No.</th><th></th></tr></thead>
      <tbody>
        ${o.emergency_contacts.map((c,i)=>`
          <tr>
            <td><input type="text" value="${esc(c.name)}" oninput="updateEmergencyContact(${i},'name',this.value)"></td>
            <td><input type="text" value="${esc(c.relationship)}" oninput="updateEmergencyContact(${i},'relationship',this.value)"></td>
            <td><input type="tel" inputmode="numeric" placeholder="e.g. 0123456789" value="${esc(c.contact)}" oninput="this.value=numericOnly(this.value);updateEmergencyContact(${i},'contact',this.value)"></td>
            <td><button class="remove-x" type="button" aria-label="Remove this row" onclick="removeEmergencyContact(${i})">${UI_ICON.x}</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <button class="add-row-btn" onclick="addEmergencyContact()">+ Add contact</button>

    <div class="section-title">Beneficiary (Next of Kin)</div>
    <div class="grid g3">
      <div class="field"><label>Name</label><input type="text" id="ob_beneficiary_name" value="${esc(o.beneficiary_name)}"></div>
      <div class="field"><label>Relationship</label><input type="text" id="ob_beneficiary_relationship" value="${esc(o.beneficiary_relationship)}"></div>
      <div class="field"><label>Contact No.</label><input type="tel" inputmode="numeric" placeholder="e.g. 0123456789" id="ob_beneficiary_contact" value="${esc(o.beneficiary_contact)}" oninput="this.value=numericOnly(this.value)"></div>
    </div>

    ${WCT.sigHtml({
      id: 'personalSig', title: 'Personal details confirmation',
      name: personalAck.name || o.personal_details_signed_name || obApplicantName(), agreed: personalAck.agreed,
      signedAt: o.personal_details_confirmed ? o.personal_details_confirmed_at : null,
      agreeText: 'I confirm the Statutory Details, Emergency Contact and Beneficiary information above is true and correct.',
      onChange: (v) => { personalAck = { name: v.name, agreed: v.agreed }; if(v.ok){ const el = document.getElementById('obStepErr'); if(el) el.innerHTML = ''; } },
    })}
    <div id="obStepErr"></div>

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="onboardingGoStep('statutory')">← Back</button>
      <div class="right">${saveExitBtnHtml()}<button class="btn btn-primary" onclick="confirmPersonalAndPreview()">Next →</button></div>
    </div>
  `;
}

// The two onboarding signatures (shared signature component). Ticking a box
// only updates the signature block, never re-renders the page, so values
// typed on the step are kept (this was the "digital sign clears my data" bug:
// the old checkbox re-rendered the page from the last saved copy).
//   salaryAck   — Statutory Details; recorded when onboarding is submitted
//   personalAck — Emergency/Beneficiary; recorded when moving to the review
let salaryAck = { name: '', agreed: false };
let personalAck = { name: '', agreed: false };
function obApplicantName(){
  const a = myApplications.find(x=>x.id===onboardingAppId) || {};
  return a.name_nric || (currentUser && currentUser.name) || '';
}
async function confirmPersonalAndPreview(){
  const o = onboardingState;
  if(!o.personal_details_confirmed){
    const sig = WCT.sigValue('personalSig');
    if(!sig.ok){
      document.getElementById('personalSig').classList.add('invalid');
      document.getElementById('obStepErr').innerHTML = `<div class="error-banner">Please type your full name and tick the confirmation box to sign.</div>`;
      return;
    }
    showLoading('Saving...');
    const ok = await saveOnboarding(false);
    if(!ok){ hideLoading(); return; }
    const res = await apiTry(() => api.post(`/onboarding/${onboardingAppId}/confirm-section`, { section: 'personal_details', signed_name: sig.name }));
    if(res.error){ hideLoading(); alert('Error: ' + res.error.message); return; }
    let data = res.data;
    // TP3 is no longer shown but the server still expects it confirmed.
    if(!data.tp3_confirmed){
      const tp3 = await apiTry(() => api.post(`/onboarding/${onboardingAppId}/confirm-section`, { section: 'tp3' }));
      if(!tp3.error) data = tp3.data;
    }
    onboardingState = { ...data, available_companies: o.available_companies, family: o.family }; obSeedChildren(onboardingState);
    hideLoading();
    onboardingStep = 'preview'; render(); window.scrollTo(0,0);
    return;
  }
  onboardingGoStep('preview');
}

// ---------------------------------------------------------------------------
// REVIEW / PREVIEW — comprehensive, paginated read-only summary of every
// onboarding field. Shared between two places:
//   - 'preview' step: reached from Salary's "Review Before Submitting"
//     button, BEFORE anything is finalized — has an editable "Back to Edit"
//     path and an explicit Submit action.
//   - 'review' step: the final, locked view shown after submission (or when
//     re-opening an already-completed onboarding record).
// ---------------------------------------------------------------------------

function obReviewRow(k,v){ return `<div class="review-row"><div class="k">${k}</div><div class="v">${esc(v)||'—'}</div></div>`; }

function obSummaryPage1Html(o){
  return `
    <div class="review-block">
      <h4>Statutory Details</h4>
      ${obReviewRow('EPF No.', o.epf_no)}
      ${obReviewRow('Income Tax No.', o.income_tax_no)}
      ${obReviewRow('Tax Branch', o.tax_branch)}
      ${obReviewRow('SOCSO No.', o.socso_no)}
      ${obReviewRow('Bank Account No.', o.bank_account_no)}
      ${obReviewRow('CIDB Green Card No.', o.cidb_green_card_no)}
      ${obReviewRow('Bank', o.salary_bank)}
      ${obReviewRow('Employing Company', o.salary_company)}
    </div>


    ${(() => { const f = obFamily(o); const kids = [...(f.children_below_18||[]).map(c => ['Below 18', c]), ...(f.children_18_to_23||[]).map(c => ['18 and above', c])];
      return (f.spouse_name || kids.length) ? `<div class="review-block">
      <h4>Family Details</h4>
      ${f.spouse_name ? obReviewRow('Spouse', [f.spouse_name, f.spouse_occupation, f.spouse_working ? 'Working: '+f.spouse_working : ''].filter(Boolean).join(' · ')) : ''}
      ${kids.map(([g, c])=>obReviewRow(`${c.name||'Child'} (${g})`, `${c.gender||'—'} · NRIC: ${c.nric||'—'} · Tax relief: ${c.tax_relief?'Yes':'No'}`)).join('')}
    </div>` : ''; })()}

    <div class="review-block">
      <h4>Emergency Contacts</h4>
      ${(o.emergency_contacts||[]).map(c=>obReviewRow(c.name||'Unnamed', `${c.relationship||'—'} · ${c.contact||'—'}`)).join('') || obReviewRow('Emergency Contacts','None')}
    </div>

    <div class="review-block">
      <h4>Beneficiary (Next of Kin)</h4>
      ${obReviewRow('Name', o.beneficiary_name)}
      ${obReviewRow('Relationship', o.beneficiary_relationship)}
      ${obReviewRow('Contact No.', o.beneficiary_contact)}
    </div>
  `;
}

function obSummaryHtml(o){
  return obSummaryPage1Html(o);
}

function tplObPreview(){
  const o = onboardingState;
  return `
    <div class="step-eyebrow">Onboarding</div>
    <h2>Review Before Submitting</h2>
    <p class="step-desc">Please check everything below carefully. Once you submit, your onboarding record will be marked complete and HR will be notified — you won't be able to edit it afterward.</p>

    ${obSummaryHtml(o)}

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="onboardingGoStep('emergency_beneficiary')">← Back to Edit</button>
      <div class="right"><button class="btn btn-primary" onclick="submitOnboarding()">Submit &amp; Complete Onboarding →</button></div>
    </div>
  `;
}

async function submitOnboarding(){
  const ok = await saveOnboarding(false);
  if(!ok) return;
  try{
    const { data, error } = await apiTry(() => api.post(`/onboarding/${onboardingAppId}/confirm-section`, { section: 'salary_crediting', signed_name: salaryAck.name || obApplicantName() }));
    if(error) throw error;
    onboardingState = { ...data, available_companies: onboardingState.available_companies, family: onboardingState.family }; obSeedChildren(onboardingState);
    onboardingStep = 'review';
    render();
    window.scrollTo(0,0);
  } catch(e){ alert('Error: ' + e.message); }
}

function tplObReview(){
  const o = onboardingState;
  const allDone = o.personal_details_confirmed && o.salary_crediting_confirmed;
  return `
    <div class="step-eyebrow">Onboarding</div>
    <h2>Your Onboarding Details</h2>
    ${allDone
      ? `<div class="success-banner">All sections completed.</div>`
      : `<div class="error-banner">Some sections aren't confirmed yet. <span style="text-decoration:underline;cursor:pointer;" onclick="onboardingStep='statutory';render();">Continue filling them in →</span></div>`}

    ${obSummaryHtml(o)}

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="backFromOnboarding()">← Back to My Applications</button>
      <div class="right"><button class="btn btn-ghost" onclick="exportMyOnboardingPdf()">${UI_ICON.pdf} Download as PDF</button></div>
    </div>
  `;
}

function handleCitizenChange(val){
  state.citizen = val;
  if(val === 'Non-Malaysian'){
    // NRIC isn't applicable — don't carry over a stale value into a disabled field
    state.nric_new = '';
  }
  render();
}

// Derives Date of Birth from a Malaysian NRIC's first 6 digits (YYMMDD),
// using the standard century pivot: if the two-digit year is greater than
// the current two-digit year, assume 19XX, otherwise 20XX.
function deriveDobFromNric(nric){
  const digits = nric.replace(/[^0-9]/g, '');
  if(digits.length < 6) return null;
  const yy = parseInt(digits.slice(0,2), 10);
  const mm = parseInt(digits.slice(2,4), 10);
  const dd = parseInt(digits.slice(4,6), 10);
  if(mm < 1 || mm > 12 || dd < 1 || dd > 31) return null; // not a plausible date, skip
  const currentYY = new Date().getFullYear() % 100;
  const century = yy > currentYY ? 1900 : 2000;
  const year = century + yy;
  const mmStr = String(mm).padStart(2,'0');
  const ddStr = String(dd).padStart(2,'0');
  return `${year}-${mmStr}-${ddStr}`;
}

function handleNricChange(elOrVal){
  // Accepts either the <input> element itself (preferred — lets us strip any
  // non-digit character the person typed, in place) or a bare string value
  // (kept for any other caller), so NRIC simply cannot contain non-digits.
  const isEl = elOrVal && typeof elOrVal === 'object';
  const digits = numericOnly(isEl ? elOrVal.value : elOrVal);
  if(isEl) elOrVal.value = digits;
  const val = digits;
  state.nric_new = val;

  // 12-digit validation (Malaysian NRIC is always exactly 12 digits, no letters)
  const msgEl = document.getElementById('nricValidationMsg');
  if(msgEl){
    if(val.trim() === ''){
      msgEl.innerHTML = '';
    } else if(digits.length !== 12){
      msgEl.innerHTML = `<span style="color:var(--danger);">NRIC must be exactly 12 digits (currently ${digits.length}).</span>`;
    } else {
      msgEl.innerHTML = `<span style="color:var(--ok);">✓ Valid format</span>`;
    }
  }

  // Auto-derive Date of Birth from the NRIC's first 6 digits, once enough
  // digits are entered — the candidate can still override it afterward.
  // Updates fields directly (not via handleDobChange/render) so typing NRIC
  // doesn't lose focus on every keystroke, same fix as the SOCSO mirroring.
  const derivedDob = deriveDobFromNric(val);
  if(derivedDob){
    state.date_of_birth = derivedDob;
    const dob = new Date(derivedDob); const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if(m < 0 || (m===0 && today.getDate() < dob.getDate())) age--;
    state.age = age;
    const dobEl = document.getElementById('dobTextInput');
    const dobPickerEl = document.getElementById('dobPickerInput');
    const ageEl = document.getElementById('ageInput');
    if(dobEl) dobEl.value = formatDobForDisplay(derivedDob);
    if(dobPickerEl) dobPickerEl.value = derivedDob;
    if(ageEl) ageEl.value = age;
  }

  if(!socsoManuallyEdited){
    state.socso_no = val;
    const socsoEl = document.getElementById('socsoInput');
    if(socsoEl) socsoEl.value = val; // update in place, no full re-render (keeps focus while typing)
  }
}

// yyyy-mm-dd (the value type="date" inputs and the backend both use) <->
// dd/mm/yyyy (what candidates actually see and type here).
function formatDobForDisplay(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Lets a candidate type a date of birth as a continuous run of digits
// (e.g. "13042005") without needing to type the slashes themselves — they
// get auto-inserted after the day and month as typed — while typing
// "13/04/2005" directly still works too, since non-digits are stripped
// before reformatting. Only commits to state.date_of_birth (and re-renders,
// via handleDobChange) once a full 8-digit date has been entered AND it's a
// real calendar date, so a half-typed date never gets treated as valid.
function handleDobTextInput(el){
  let digits = el.value.replace(/[^0-9]/g,'').slice(0,8);
  let formatted = digits;
  if(digits.length > 4) formatted = digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4);
  else if(digits.length > 2) formatted = digits.slice(0,2)+'/'+digits.slice(2);
  el.value = formatted;

  if(digits.length === 8){
    const day = digits.slice(0,2), month = digits.slice(2,4), year = digits.slice(4,8);
    const iso = `${year}-${month}-${day}`;
    const d = new Date(iso);
    const isRealDate = !isNaN(d.getTime()) && d.getUTCDate()===parseInt(day,10) && (d.getUTCMonth()+1)===parseInt(month,10);
    if(isRealDate){
      const picker = document.getElementById('dobPickerInput');
      if(picker) picker.value = iso;
      handleDobChange(iso);
    }
  }
}

function handleDobChange(val){
  state.date_of_birth = val;
  if(val){
    const dob = new Date(val); const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if(m < 0 || (m===0 && today.getDate() < dob.getDate())) age--;
    state.age = age;
  }
  render();
}

// ---------------------------------------------------------------------------
// STEP: language ability
// ---------------------------------------------------------------------------
const FIXED_LANGUAGES = ['Bahasa Malaysia', 'English'];
// Old drafts carried "Others (please state)" as a real row value; it is only
// a hint now. BM and English always come first.
function normalizeLanguages(list, keepBlank){
  const rows = (list||[]).map(r => ({language:'', spoken:'', written:'', ...r}))
    .map(r => /^others \(please state\)$/i.test((r.language||'').trim()) ? {...r, language:''} : r);
  const fixed = FIXED_LANGUAGES.map(name => rows.find(r => r.language === name) || {language:name, spoken:'', written:''});
  const others = rows.filter(r => !FIXED_LANGUAGES.includes(r.language) && (keepBlank || (r.language||'').trim() || r.spoken || r.written));
  return [...fixed, ...others];
}
function tplLanguage(){
  state.language_ability = normalizeLanguages(state.language_ability, true);
  const fixed = state.language_ability.slice(0, 2).map((r,i)=>`
    <tr>
      <td><div class="lang-fixed">${esc(r.language)}</div></td>
      <td id="field-lang-spoken-${i}">${selectGFS(r.spoken, `updateArrayField('language_ability',${i},'spoken',this.value)`, `${esc(r.language)} spoken`)}</td>
      <td id="field-lang-written-${i}">${selectGFS(r.written, `updateArrayField('language_ability',${i},'written',this.value)`, `${esc(r.language)} written`)}</td>
      <td></td>
    </tr>`).join('');
  const others = state.language_ability.slice(2).map((r,j)=>{ const i = j + 2; return `
    <tr>
      <td id="field-lang-name-${i}"><input type="text" aria-label="Other language or dialect ${j+1}" placeholder="e.g. Mandarin, Tamil, Cantonese" value="${esc(r.language)}" oninput="updateArrayField('language_ability',${i},'language',this.value)"></td>
      <td id="field-lang-spoken-${i}">${selectGFS(r.spoken, `updateArrayField('language_ability',${i},'spoken',this.value)`, 'Spoken')}</td>
      <td id="field-lang-written-${i}">${selectGFS(r.written, `updateArrayField('language_ability',${i},'written',this.value)`, 'Written')}</td>
      <td><button class="remove-x" type="button" aria-label="Remove this language" title="Remove" onclick="removeLangRow(${i})">${UI_ICON.x}</button></td>
    </tr>`; }).join('');
  return `
    <div class="step-eyebrow">Application Form</div>
    <h2>Language Ability <span class="tag-req" style="vertical-align:middle;">COMPULSORY</span></h2>
    <p class="step-desc">Rate your spoken and written ability for each language. Bahasa Malaysia and English are required. Choose <strong>N/A</strong> if it doesn't apply (for example, a dialect you speak but don't write).</p>
    <table class="dyn lang-table">
      <thead><tr><th>Language / Dialect</th><th>Spoken <span class="req-star">*</span></th><th>Written <span class="req-star">*</span></th><th style="width:48px;"></th></tr></thead>
      <tbody>${fixed}</tbody>
    </table>
    <div class="section-title">Other Languages / Dialects <span class="opt-tag">(optional)</span></div>
    ${others ? `<table class="dyn lang-table">
      <tbody>${others}</tbody>
    </table>` : '<p class="hint" style="margin:0 0 10px;">None added. Speak or write another language or dialect? Add it below.</p>'}
    <button class="add-row-btn" onclick="addLangRow()">+ Add Another Language/Dialect</button>
    ${navButtonsValidated('personal','education', validateLanguageStep)}
  `;
}
function selectGFS(val, onchangeFn, label){
  return `<select ${label ? `aria-label="${label}"` : ''} onchange="${onchangeFn}"><option value="">—</option>${['Good','Fair','Slight','N/A'].map(o=>`<option ${val===o?'selected':''}>${o}</option>`).join('')}</select>`;
}
function addLangRow(){ state.language_ability.push({language:'',spoken:'',written:''}); render(); }
function removeLangRow(i){
  if(i < 2) return;
  state.language_ability.splice(i,1);
  render();
}
function validateLanguageStep(){
  const errs = [];
  state.language_ability.forEach((r,i)=>{
    const name = (r.language||'').trim();
    if(i >= 2 && !name && !r.spoken && !r.written) return; // empty spare row
    if(i >= 2 && !name) errs.push({field:`field-lang-name-${i}`, message:`Please name the other language/dialect, or remove that row.`});
    if(!r.spoken) errs.push({field:`field-lang-spoken-${i}`, message:`${name || 'Other language'}: please rate your spoken ability.`});
    if(!r.written) errs.push({field:`field-lang-written-${i}`, message:`${name || 'Other language'}: please rate your written ability.`});
  });
  return errs;
}

// ---------------------------------------------------------------------------
// STEP: education
// ---------------------------------------------------------------------------
function educationOptionsHtml(selected){
  return `<option value="">Select</option>` + HIGHEST_EDUCATION_OPTIONS.map(o=>`<option ${selected===o?'selected':''}>${o}</option>`).join('');
}
// Covers a couple of school-going years past today (for an in-progress/expected
// qualification's "To" year) down to a wide range of birth years back, newest first.
function yearOptionsHtml(selected){
  const now = new Date().getFullYear();
  let opts = `<option value="">Year</option>`;
  for(let y=now+10; y>=now-80; y--){
    opts += `<option value="${y}" ${String(selected)===String(y)?'selected':''}>${y}</option>`;
  }
  return opts;
}

const EDU_PLACEHOLDER = {
  'Primary School': ['e.g. SK Taman Megah', 'e.g. UPSR'],
  'School': ['e.g. SMK Damansara Jaya', 'e.g. SPM, Science stream'],
  'College/University': ['e.g. Universiti Malaya', 'e.g. Civil Engineering'],
  'Professional Body': ['e.g. Board of Engineers Malaysia', 'e.g. Graduate Engineer'],
};
// "To" offers only years from the "From" year on, so To can't be before From.
function toYearOptionsHtml(from, selected){
  const now = new Date().getFullYear();
  const min = from ? Number(from) : now - 80;
  let opts = `<option value="">Year</option>`;
  for(let y = now + 10; y >= min; y--) opts += `<option value="${y}" ${String(selected)===String(y)?'selected':''}>${y}</option>`;
  return opts;
}
function setEduYear(i, key, value){
  const r = state.education[i];
  r[key] = value;
  if(r.from_year && r.to_year && Number(r.to_year) < Number(r.from_year)) r.to_year = '';
  if(key === 'from_year') render();
}
function tplEducation(){
  if(eduSeededFor !== state.id){ eduSeededFor = state.id; if(!state.education.length) state.education = [blankEdu()]; }
  const cards = state.education.map((r,i)=>{
    const ph = EDU_PLACEHOLDER[r.type] || ['Name of school, college or body', 'e.g. Civil Engineering'];
    const lbl = (EDU_TYPES.find(([v]) => v === r.type) || [0, 'education entry'])[1];
    return `
    <div class="edu-card${wxAddedClass('edu-'+i)}" data-wx-card="edu-${i}">
      <div class="edu-card-h">
        <div class="field" id="field-edu-type-${i}" style="margin:0;">
          <select class="edu-type" aria-label="Type of education ${i+1}" onchange="updateArrayField('education',${i},'type',this.value);render();">
            <option value="">Select education entry</option>
            ${EDU_TYPES.map(([v, label])=>`<option value="${v}" ${r.type===v?'selected':''}>${label}</option>`).join('')}
          </select>
        </div>
        <button class="edu-remove" type="button" aria-label="Remove ${esc(lbl)} (entry ${i+1})" onclick="removeEduEntry(${i})">${UI_ICON.x} Remove</button>
      </div>
      <div class="edu-grid">
        <div class="field edu-wide" id="field-edu-name-${i}"><label for="edu-name-${i}">Institution <span class="req-star">*</span></label><input type="text" id="edu-name-${i}" placeholder="${esc(ph[0])}" value="${esc(r.name)}" oninput="updateArrayField('education',${i},'name',this.value)"></div>
        <div class="field" id="field-edu-from-${i}"><label for="edu-from-${i}">From <span class="req-star">*</span></label><select id="edu-from-${i}" onchange="setEduYear(${i},'from_year',this.value)">${yearOptionsHtml(r.from_year)}</select></div>
        <div class="field" id="field-edu-to-${i}"><label for="edu-to-${i}">To <span class="req-star">*</span></label><select id="edu-to-${i}" onchange="setEduYear(${i},'to_year',this.value)">${toYearOptionsHtml(r.from_year, r.to_year)}</select></div>
        <div class="field" id="field-edu-qualification-${i}"><label for="edu-qual-${i}">Qualification <span class="req-star">*</span></label><select id="edu-qual-${i}" onchange="updateArrayField('education',${i},'qualification',this.value)">${educationOptionsHtml(r.qualification)}</select></div>
        <div class="field" id="field-edu-course-${i}"><label for="edu-course-${i}">Course name <span class="req-star">*</span></label><input type="text" id="edu-course-${i}" placeholder="${esc(ph[1])}" value="${esc(r.course_name)}" oninput="updateArrayField('education',${i},'course_name',this.value)"></div>
      </div>
    </div>`; }).join('');
  return `
    <div class="step-eyebrow">Application Form</div>
    <h2>Education <span class="tag-req" style="vertical-align:middle;">COMPULSORY</span></h2>
    <p class="step-desc">Add your primary school, secondary school, college / university and any professional body or association you belong to, one entry each.</p>
    <div class="info-banner">Choose the type for each entry and use <strong>+ Add education entry</strong> for more. Added one you don't need? Press <strong>Remove</strong>. At least one entry is required.</div>
    <div class="edu-list" id="field-edu-list">${cards || '<div class="edu-empty">No education entries yet. Press <strong>+ Add education entry</strong> to add one.</div>'}</div>
    <button class="add-row-btn" onclick="addEduRow()">+ Add education entry</button>
    ${navButtonsValidated('language','experience', validateEducationStep)}
  `;
}
async function removeEduEntry(i){
  const r = state.education[i];
  if(!r) return;
  const filled = (r.name||'').trim() || r.from_year || r.to_year || r.qualification || (r.course_name||'').trim();
  if(filled && !(await askYesNo('Remove this entry?', 'Are you sure you want to remove this education entry?'))) return;
  state.education.splice(i, 1);
  render();
}
function validateEducationStep(){
  const errs = [];
  if(!state.education.length) return [{field:'field-edu-list', message:'Please add at least one education entry.'}];
  state.education.forEach((r,i)=>{
    const n = `${(EDU_TYPES.find(([v]) => v === r.type) || [0, 'Education entry'])[1]} (entry ${i+1})`;
    if(!r.type) errs.push({field:`field-edu-type-${i}`, message:`Education entry ${i+1}: please choose the type of education.`});
    if(!(r.name||'').trim()) errs.push({field:`field-edu-name-${i}`, message:`${n}: please enter the institution name, or remove the entry.`});
    if(!r.from_year) errs.push({field:`field-edu-from-${i}`, message:`${n}: please select the "From" year.`});
    if(!r.to_year) errs.push({field:`field-edu-to-${i}`, message:`${n}: please select the "To" year.`});
    if(r.from_year && r.to_year && Number(r.from_year) > Number(r.to_year)) errs.push({field:`field-edu-to-${i}`, message:`${n}: the "From" year can't be after the "To" year.`});
    if(!r.qualification) errs.push({field:`field-edu-qualification-${i}`, message:`${n}: please select a qualification.`});
    if(!(r.course_name||'').trim()) errs.push({field:`field-edu-course-${i}`, message:`${n}: please enter the course name.`});
  });
  return errs;
}
function addEduRow(){ state.education.push(blankEdu()); wxJustAdded = 'edu-'+(state.education.length-1); render(); wxFocusAdded(); }

// ---------------------------------------------------------------------------
// STEP: working experience
// ---------------------------------------------------------------------------
function tplExperience(){
  const none = !!state.no_working_experience;
  if(!none && !state.working_experience.length) state.working_experience.push(blankExp());
  const rows = none ? '' : state.working_experience.map((r,i)=>`
    <div class="card" style="padding:18px;margin-bottom:14px;border-color:#E4E4E3;">
      <div class="grid">
        <div class="field" id="field-exp-employer-${i}"><label>Employer Name &amp; Address <span class="req-star">*</span></label><textarea placeholder="e.g. ABC Construction Sdn Bhd, Petaling Jaya" oninput="updateArrayField('working_experience',${i},'employer',this.value)">${esc(r.employer)}</textarea></div>
        <div class="field" id="field-exp-position-${i}"><label>Last Position Held <span class="req-star">*</span></label><input type="text" placeholder="e.g. Site Supervisor" value="${esc(r.position)}" oninput="updateArrayField('working_experience',${i},'position',this.value)"></div>
      </div>
      <div class="grid">
        <div class="field" id="field-exp-from-${i}"><label>From <span class="req-star">*</span></label><input type="month" value="${esc(r.from)}" oninput="updateArrayField('working_experience',${i},'from',this.value)"></div>
        <div class="field" id="field-exp-to-${i}">
          <label>To ${r.is_current ? '' : '<span class="req-star">*</span>'}</label>
          <input type="month" value="${esc(r.to)}" ${r.is_current?'disabled':''} style="${r.is_current?'background:#F0F0EE;color:var(--ink-soft);':''}" oninput="updateArrayField('working_experience',${i},'to',this.value)">
        </div>
      </div>
      <label class="radio-opt" style="margin:-8px 0 14px;"><input type="checkbox" ${r.is_current?'checked':''} onchange="toggleCurrentJob(${i}, this.checked)"> I am currently working here</label>
      <div class="grid">
        <div class="field" id="field-exp-remuneration-${i}"><label>Last Drawn Remuneration (Monthly) — RM <span class="req-star">*</span></label><input type="text" inputmode="numeric" placeholder="e.g. 3000" value="${esc(r.remuneration)}" oninput="this.value=numericOnly(this.value);updateArrayField('working_experience',${i},'remuneration',this.value)"></div>
        <div></div>
      </div>
      <div class="field" id="field-exp-responsibilities-${i}"><label>Job Responsibilities <span class="req-star">*</span></label><textarea placeholder="Your main duties in this role" oninput="updateArrayField('working_experience',${i},'responsibilities',this.value)">${esc(r.responsibilities)}</textarea></div>
      ${state.working_experience.length > 1 ? `<button class="btn-danger-outline" onclick="removeRowConfirm('working_experience',${i})">Remove this entry</button>` : ''}
    </div>`).join('');
  return `
    <div class="step-eyebrow">Application Form</div>
    <h2>Working Experience / Achievement <span class="tag-req" style="vertical-align:middle;">COMPULSORY</span></h2>
    <p class="step-desc">Please complete this even if a resume/CV is attached. Start with your most recent job.</p>
    <label class="no-exp" id="field-no_working_experience">
      <input type="checkbox" ${none?'checked':''} onchange="toggleNoExperience(this.checked)">
      <span><strong>I do not have any previous working experience.</strong><br>If you do not have any previous working experience, tick this box and you may proceed to the next page.</span>
    </label>
    ${rows}
    ${none ? '' : `<button class="add-row-btn" onclick="addExpRow()">+ Add work experience</button>`}
    ${navButtonsValidated('education','questions', validateExperienceStep)}
  `;
}
function blankExp(){ return {employer:'',from:'',to:'',is_current:false,position:'',remuneration:'',responsibilities:''}; }
function toggleCurrentJob(i, checked){
  state.working_experience[i].is_current = checked;
  if(checked) state.working_experience[i].to = '';
  render();
}
const isExpRowEmpty = (r) => !(r.employer||'').trim() && !(r.position||'').trim() && !r.from && !r.to &&
  !r.is_current && !(r.remuneration||'').trim() && !(r.responsibilities||'').trim();
async function toggleNoExperience(checked){
  if(checked && state.working_experience.some(r => !isExpRowEmpty(r))){
    const yes = await askYesNo('Clear your work experience?', 'Ticking this box will remove the work experience you have entered on this page. Are you sure?');
    if(!yes){ render(); return; }
  }
  state.no_working_experience = checked;
  state.working_experience = checked ? [] : [blankExp()];
  render();
}
// The section is compulsory: either tick "no previous working experience" or
// complete every entry in full.
function validateExperienceStep(){
  const errs = [];
  if(state.no_working_experience) return errs;
  if(!state.working_experience.length) return [{field:null, message:'Please add your working experience, or tick "I do not have any previous working experience".'}];
  state.working_experience.forEach((r,i)=>{
    const n = state.working_experience.length > 1 ? ` ${i+1}` : '';
    if(!(r.employer||'').trim()) errs.push({field:`field-exp-employer-${i}`, message:`Work experience${n}: please enter the employer name and address (or tick "I do not have any previous working experience").`});
    if(!(r.position||'').trim()) errs.push({field:`field-exp-position-${i}`, message:`Work experience${n}: please enter the last position held.`});
    if(!r.from) errs.push({field:`field-exp-from-${i}`, message:`Work experience${n}: please provide the "From" month/year.`});
    if(!r.is_current && !r.to) errs.push({field:`field-exp-to-${i}`, message:`Work experience${n}: please provide the "To" month/year, or tick "I am currently working here".`});
    if(r.from && r.to && !r.is_current && r.to < r.from) errs.push({field:`field-exp-to-${i}`, message:`Work experience${n}: the "To" date can't be before the "From" date.`});
    if(!(r.remuneration||'').trim()) errs.push({field:`field-exp-remuneration-${i}`, message:`Work experience${n}: please enter the last drawn remuneration.`});
    if(!(r.responsibilities||'').trim()) errs.push({field:`field-exp-responsibilities-${i}`, message:`Work experience${n}: please describe your job responsibilities.`});
  });
  return errs;
}
function addExpRow(){ state.working_experience.push(blankExp()); render(); }
function removeRow(arr, idx){ state[arr].splice(idx,1); render(); }
async function removeRowConfirm(arr, idx){
  if(await askYesNo('Remove this entry?', 'Are you sure you want to remove this entry?')) removeRow(arr, idx);
}
// Yes/No question in the site's own dialog (falls back to the browser's).
function askYesNo(title, message){
  if(!window.WX || !WX.dialog) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    let answer = false;
    const dlg = WX.dialog({ title, html: `<p style="margin:0 0 18px;">${esc(message)}</p>
      <div class="btn-row" style="margin:0;border:0;padding:0;"><button type="button" class="btn btn-ghost" data-a="no">No</button><div class="right"><button type="button" class="btn btn-primary" data-a="yes">Yes</button></div></div>`,
      onClose: () => resolve(answer) });
    dlg.querySelector('[data-a="yes"]').addEventListener('click', () => { answer = true; dlg.close(); });
    dlg.querySelector('[data-a="no"]').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-a="yes"]').focus();
  });
}

// ---------------------------------------------------------------------------
// STEP: employment questions
// ---------------------------------------------------------------------------
function handleResignationChange(val){
  state.resignation_notice_required = val;
  if(val === 'No') state.notice_period = ''; // leave blank per requirement
  render();
}

function validateQuestionsStep(){
  const errs = [];
  if(!state.resignation_notice_required) errs.push({field:'field-resignation_notice_required', message:'Please answer whether resignation notice is required.'});
  if(state.resignation_notice_required==='Yes' && !state.notice_period.trim()) errs.push({field:'field-notice_period', message:'Notice period is required when resignation notice is required.'});
  if(!state.date_available_to_start) errs.push({field:'field-date_available_to_start', message:'Please provide your available start date.'});
  if(!state.expected_basic_salary.trim()) errs.push({field:'field-expected_basic_salary', message:'Please provide your expected basic salary.'});
  if(!state.relatives_in_company) errs.push({field:'field-relatives_in_company', message:'Please answer the relatives/friends question.'});
  if(state.relatives_in_company==='Yes' && !state.relatives_name.trim()) errs.push({field:'field-relatives_name', message:'Please provide the relative/friend\'s name.'});
  if(state.relatives_in_company==='Yes' && !state.relatives_relationship.trim()) errs.push({field:'field-relatives_relationship', message:'Please provide your relationship to them.'});
  if(!state.referral_person) errs.push({field:'field-referral_person', message:'Please answer whether you were referred by anyone.'});
  if(state.referral_person==='Yes' && !state.referral_name.trim()) errs.push({field:'field-referral_name', message:'Please provide the referral\'s name.'});
  if(state.referral_person==='Yes' && !state.referral_department.trim()) errs.push({field:'field-referral_department', message:'Please provide the referral\'s department.'});
  if(!state.own_transport_motorcar) errs.push({field:'field-own_transport_motorcar', message:'Please answer the motorcar transport question.'});
  if(!state.own_transport_motorcycle) errs.push({field:'field-own_transport_motorcycle', message:'Please answer the motorcycle transport question.'});
  if(!state.willing_based_outside_klang_valley) errs.push({field:'field-willing_based_outside_klang_valley', message:'Please answer the outside-Klang-Valley question.'});
  if(!state.physical_defects) errs.push({field:'field-physical_defects', message:'Please answer the physical defects question.'});
  if(state.physical_defects==='Yes' && !state.physical_defects_specify.trim()) errs.push({field:'field-physical_defects_specify', message:'Please specify your physical defects/disabilities/illnesses.'});
  if(!state.arrested_convicted) errs.push({field:'field-arrested_convicted', message:'Please answer the arrests/convictions question.'});
  if(state.arrested_convicted==='Yes' && !state.arrested_convicted_specify.trim()) errs.push({field:'field-arrested_convicted_specify', message:'Please specify the arrest/conviction details.'});
  return errs;
}

function yesNo(field, val, rerenderOnChange){
  const handler = rerenderOnChange
    ? `updateField('${field}','__O__'); render();`
    : `updateField('${field}','__O__')`;
  return `<div class="radio-row">
    ${['Yes','No'].map(o=>`<label class="radio-opt"><input type="radio" name="${field}" ${val===o?'checked':''} onchange="${handler.replace('__O__', o)}"> ${o}</label>`).join('')}
  </div>`;
}
function tplQuestions(){
  return `
    <div class="step-eyebrow">Application Form</div>
    <h2>Employment Questions</h2>

    <div class="grid">
      <div class="field" id="field-resignation_notice_required"><label>Is resignation notice required? <span class="req-star">*</span></label>
        <div class="radio-row">
          ${['Yes','No'].map(o=>`<label class="radio-opt"><input type="radio" name="resignation_notice_required" ${state.resignation_notice_required===o?'checked':''} onchange="handleResignationChange('${o}')"> ${o}</label>`).join('')}
        </div>
      </div>
      ${state.resignation_notice_required==='Yes' ? `
        <div class="field" id="field-notice_period"><label>Notice Period <span class="req-star">*</span></label><input type="text" placeholder="e.g. 1 month" value="${esc(state.notice_period)}" oninput="updateField('notice_period', this.value)"></div>
      ` : `<div></div>`}
    </div>
    <div class="grid">
      <div class="field" id="field-date_available_to_start"><label>Date Available to Start Work <span class="req-star">*</span></label><input type="date" value="${esc(state.date_available_to_start)}" oninput="updateField('date_available_to_start', this.value)"></div>
      <div class="field" id="field-expected_basic_salary"><label>Expected Basic Salary (per month) — RM <span class="req-star">*</span></label><input type="text" inputmode="numeric" placeholder="e.g. 4500" value="${esc(state.expected_basic_salary)}" oninput="this.value=numericOnly(this.value);updateField('expected_basic_salary', this.value)"></div>
    </div>

    <div class="section-title">Additional Questions</div>
    <div class="field" id="field-relatives_in_company"><label>Any relatives or friends working in this Company or its subsidiaries? <span class="req-star">*</span></label>${yesNo('relatives_in_company', state.relatives_in_company, true)}</div>
    ${state.relatives_in_company==='Yes' ? `
      <div class="grid">
        <div class="field" id="field-relatives_name"><label>Name <span class="req-star">*</span></label><input type="text" value="${esc(state.relatives_name)}" oninput="updateField('relatives_name', this.value)"></div>
        <div class="field" id="field-relatives_relationship"><label>Relationship <span class="req-star">*</span></label><input type="text" value="${esc(state.relatives_relationship)}" oninput="updateField('relatives_relationship', this.value)"></div>
      </div>` : ''}

    <div class="field" id="field-referral_person"><label>Were you referred by anyone to work at this Company? <span class="req-star">*</span></label>${yesNo('referral_person', state.referral_person, true)}</div>
    ${state.referral_person==='Yes' ? `
      <div class="grid">
        <div class="field" id="field-referral_name"><label>Referral Name <span class="req-star">*</span></label><input type="text" value="${esc(state.referral_name)}" oninput="updateField('referral_name', this.value)"></div>
        <div class="field" id="field-referral_department"><label>Referral Department <span class="req-star">*</span></label><input type="text" value="${esc(state.referral_department)}" oninput="updateField('referral_department', this.value)"></div>
      </div>` : ''}

    <div class="grid">
      <div class="field" id="field-own_transport_motorcar"><label>Own transport — Motorcar? <span class="req-star">*</span></label>${yesNo('own_transport_motorcar', state.own_transport_motorcar, true)}</div>
      <div class="field" id="field-own_transport_motorcycle"><label>Own transport — Motorcycle? <span class="req-star">*</span></label>${yesNo('own_transport_motorcycle', state.own_transport_motorcycle, true)}</div>
    </div>

    <div class="field" id="field-willing_based_outside_klang_valley"><label>Willing to be based at branches / site offices outside Klang Valley and/or overseas? <span class="req-star">*</span></label>${yesNo('willing_based_outside_klang_valley', state.willing_based_outside_klang_valley, true)}</div>

    <div class="field" id="field-physical_defects"><label>Do you have any physical defects, disabilities, or long-term illnesses? <span class="req-star">*</span></label>${yesNo('physical_defects', state.physical_defects, true)}</div>
    ${state.physical_defects==='Yes' ? `<div class="field" id="field-physical_defects_specify"><label>Please specify <span class="req-star">*</span></label><textarea oninput="updateField('physical_defects_specify', this.value)">${esc(state.physical_defects_specify)}</textarea></div>` : ''}

    <div class="field" id="field-arrested_convicted"><label>Have you been arrested or convicted of any offence? <span class="req-star">*</span></label>${yesNo('arrested_convicted', state.arrested_convicted, true)}</div>
    ${state.arrested_convicted==='Yes' ? `<div class="field" id="field-arrested_convicted_specify"><label>Please specify <span class="req-star">*</span></label><textarea oninput="updateField('arrested_convicted_specify', this.value)">${esc(state.arrested_convicted_specify)}</textarea></div>` : ''}

    ${navButtonsValidated('experience','family', validateQuestionsStep)}
  `;
}

// ---------------------------------------------------------------------------
// STEP: family details (optional). Feedback 30 Oct 2026: the application asks
// only the spouse's name, occupation and whether they work, plus HOW MANY
// children; each child's details are given at onboarding, once hired.
// ---------------------------------------------------------------------------
const blankChild = () => ({name:'',gender:'',nric:'',date_of_birth:'',course_name:'',tax_relief:false});
function countOptionsHtml(val){
  return `<option value="">Select</option>` + Array.from({length: 11}, (_, n) => `<option value="${n}" ${val === n ? 'selected' : ''}>${n === 10 ? '10 or more' : n}</option>`).join('');
}
function setChildCount(key, v){ state[key] = v === '' ? null : Number(v); }
function tplFamily(){
  return `
    <div class="step-eyebrow">Application Form</div>
    <h2>Family Details <span class="tag-opt" style="vertical-align:middle;">Optional</span></h2>
    <p class="step-desc">Fill this in if it applies to you. HR uses it for tax relief and benefits. You can leave this page blank and continue.</p>

    <div class="section-title" style="margin-top:0;">Spouse Information</div>
    <div class="grid">
      <div class="field"><label for="spouseName">Name (per NRIC)</label><input type="text" id="spouseName" value="${esc(state.spouse_name)}" oninput="updateField('spouse_name', this.value)"></div>
      <div class="field"><label for="spouseOccupation">Occupation</label><input type="text" id="spouseOccupation" placeholder="e.g. Teacher" maxlength="120" value="${esc(state.spouse_occupation)}" oninput="updateField('spouse_occupation', this.value)"></div>
    </div>
    <div class="field"><label>Working?</label>
      <div class="radio-row">${['Yes','No'].map(v=>`<label class="radio-opt"><input type="radio" name="spouse_working" ${state.spouse_working===v?'checked':''} onchange="updateField('spouse_working','${v}')"> ${v}</label>`).join('')}</div>
    </div>

    <div class="section-title">Children</div>
    <div class="grid">
      <div class="field"><label for="kidsBelow18">Number of children below 18</label><select id="kidsBelow18" onchange="setChildCount('children_below_18_count', this.value)">${countOptionsHtml(state.children_below_18_count)}</select></div>
      <div class="field"><label for="kids18plus">Number of children 18 and above <span class="opt-tag">(unmarried, in full-time study)</span></label><select id="kids18plus" onchange="setChildCount('children_18_to_23_count', this.value)">${countOptionsHtml(state.children_18_to_23_count)}</select></div>
    </div>
    <p class="hint">If you join WCT, you'll give each child's details in your onboarding forms.</p>
    ${navButtonsValidated('questions','referees', validateFamilyStep)}
  `;
}
function validateFamilyStep(){ return []; }

// ---------------------------------------------------------------------------
// Onboarding: each child's details (they are no longer asked on the
// application). Cards, so the Remove button is always in view.
// ---------------------------------------------------------------------------
function obKids(key){ if(!Array.isArray(onboardingState[key])) onboardingState[key] = []; return onboardingState[key]; }
// First visit: start from the application's children (older applications) or
// from the number of children the candidate gave.
function obSeedChildren(o){
  const f = o.family || {};
  [['children_below_18','children_below_18_count'],['children_18_to_23','children_18_to_23_count']].forEach(([key, countKey]) => {
    if(Array.isArray(o[key]) && o[key].length) return;
    if(Array.isArray(f[key]) && f[key].length) o[key] = f[key].map(c => ({...blankChild(), ...c}));
    else o[key] = Array.from({length: Math.min(Number(f[countKey]) || 0, 10)}, blankChild);
  });
}
function obChildSet(key, i, field, value){ obKids(key)[i][field] = value; }
function obAddChild(key){ obKids(key).push(blankChild()); wxJustAdded = key+'-'+(obKids(key).length-1); render(); wxFocusAdded(); }
async function obRemoveChild(key, i){
  const c = obKids(key)[i];
  const filled = c && ((c.name||'').trim() || c.nric || c.date_of_birth);
  if(filled && !(await askYesNo('Remove this child?', `Remove ${c.name ? esc(c.name) : 'this child'} from the list?`))) return;
  obKids(key).splice(i, 1);
  render();
}
function obChildNric(key, i, val){
  const c = obKids(key)[i];
  c.nric = val;
  const dob = deriveDobFromNric(val);
  if(dob && val.length >= 6){
    c.date_of_birth = dob;
    const el = document.getElementById(`${key}Dob${i}`);
    if(el) el.value = dob;
  }
}
function obChildCardsHtml(key, label){
  const kids = obKids(key);
  return kids.map((c,i)=>`
    <div class="kid-card${wxAddedClass(key+'-'+i)}" data-wx-card="${key}-${i}">
      <div class="kid-card-h"><strong>${label} ${i+1}</strong>
        <button class="edu-remove" type="button" aria-label="Remove ${label.toLowerCase()} ${i+1}" onclick="obRemoveChild('${key}',${i})">${UI_ICON.x} Remove</button></div>
      <div class="kid-grid">
        <div class="field kid-wide" id="field-${key}-name-${i}"><label for="${key}Name${i}">Name (per NRIC)</label><input type="text" id="${key}Name${i}" value="${esc(c.name)}" oninput="obChildSet('${key}',${i},'name',this.value)"></div>
        <div class="field"><label for="${key}Gender${i}">Gender</label><select id="${key}Gender${i}" onchange="obChildSet('${key}',${i},'gender',this.value)"><option value="">Select</option>${['Male','Female'].map(o=>`<option ${c.gender===o?'selected':''}>${o}</option>`).join('')}</select></div>
        <div class="field" id="field-${key}-nric-${i}"><label for="${key}Nric${i}">NRIC No. (no dash)</label><input type="text" id="${key}Nric${i}" inputmode="numeric" maxlength="12" value="${esc(c.nric)}" oninput="this.value=numericOnly(this.value);obChildNric('${key}',${i},this.value)"></div>
        <div class="field"><label for="${key}Dob${i}">Date of birth</label><input type="date" id="${key}Dob${i}" value="${esc(c.date_of_birth)}" oninput="obChildSet('${key}',${i},'date_of_birth',this.value)"></div>
        <div class="field"><label for="${key}Edu${i}">Education</label><select id="${key}Edu${i}" onchange="obChildSet('${key}',${i},'course_name',this.value)">${childEducationOptionsHtml(c.course_name)}</select></div>
        <label class="kid-relief"><input type="checkbox" ${c.tax_relief?'checked':''} onchange="obChildSet('${key}',${i},'tax_relief',this.checked)"> Claim child tax relief</label>
      </div>
    </div>`).join('') || `<p class="hint" style="margin:0 0 8px;">None added.</p>`;
}
function obChildrenHtml(){
  return `
    <div class="section-title">Children <span class="opt-tag">(for tax relief and benefits)</span></div>
    <p class="hint" style="margin-top:-4px;">Give each child's details. Leave this empty if it doesn't apply to you.</p>
    <h4 class="kid-group">Below 18 years old</h4>
    <div class="kid-list">${obChildCardsHtml('children_below_18', 'Child')}</div>
    <button type="button" class="add-row-btn" onclick="obAddChild('children_below_18')">+ Add child below 18</button>
    <h4 class="kid-group">18 years old and above <span class="opt-tag">(unmarried, in full-time study)</span></h4>
    <div class="kid-list">${obChildCardsHtml('children_18_to_23', 'Child')}</div>
    <button type="button" class="add-row-btn" onclick="obAddChild('children_18_to_23')">+ Add child 18 or above</button>
    <div id="obFamErr"></div>`;
}
function validateObChildren(){
  const errs = [];
  ['children_below_18','children_18_to_23'].forEach(key => obKids(key).forEach((c,i) => {
    const any = (c.name||'').trim() || c.nric || c.date_of_birth || c.gender || c.course_name;
    if(any && !(c.name||'').trim()) errs.push({field:`field-${key}-name-${i}`, message:'Please enter the name of each child you add (or remove that child).'});
    if(c.nric && c.nric.length !== 12) errs.push({field:`field-${key}-nric-${i}`, message:`${c.name || 'Child'}: NRIC must be 12 digits (or leave it blank).`});
  }));
  return errs;
}

// ---------------------------------------------------------------------------
// STEP: referees & declarations
// ---------------------------------------------------------------------------
function refereeFieldsetHtml(key, n, ph, optional){
  const r = state[key];
  const star = optional ? '' : ' <span class="req-star">*</span>';
  const f = (k, label, placeholder, extra='') => `<div class="field"><label for="${key}-${k}">${label}${star}</label><input type="text" id="${key}-${k}" placeholder="${placeholder}" value="${esc(r[k])}" ${extra || `oninput="updateNested(state.${key},'${k}',this.value)"`}></div>`;
  return `<fieldset id="field-${key}">
    <legend>Referee ${n}${optional ? ' <span class="opt-tag">(optional for fresh graduates)</span>' : star}</legend>
    ${f('name', 'Name', ph[0])}
    ${f('designation', 'Designation', ph[1])}
    ${f('company', 'Company', ph[2])}
    ${f('relationship', 'Relationship', ph[3])}
    ${f('contact', 'Contact No.', ph[4], `inputmode="numeric" maxlength="11" oninput="this.value=numericOnly(this.value);updateNested(state.${key},'contact',this.value)"`)}
  </fieldset>`;
}
// Declarations (B) and (C) read like the manual form (Malls feedback,
// 29 Oct 2026): one box per declaration, "NONE" if there is nothing to
// declare. Stored as before: NONE -> 'No'; anything else -> 'Yes' + details.
// "NONE" in any letter case (older answers may say NIL).
const DECL_NIL = /^\s*(none|nil|tiada)\s*\.?\s*$/i;
function declText(key){ return state[key] === 'No' ? 'NONE' : (state[`${key}_specify`] || ''); }
function setDecl(key, text){
  const t = String(text || '');
  if(!t.trim()){ state[key] = ''; state[`${key}_specify`] = ''; }
  else if(DECL_NIL.test(t)){ state[key] = 'No'; state[`${key}_specify`] = ''; }
  else { state[key] = 'Yes'; state[`${key}_specify`] = t; }
}
function declBoxHtml(key, letter, statement){
  return `<div class="field decl-box" id="field-${key}">
      <label for="decl-${key}" class="decl-label">(${letter}) ${statement} <span class="req-star">*</span></label>
      <textarea id="decl-${key}" rows="3" placeholder="Write NONE if none" oninput="setDecl('${key}', this.value)">${esc(declText(key))}</textarea>
      <div class="hint">Write <strong>NONE</strong> if none. Not enough space? Attach a document under <strong>Declaration details</strong> on the next step.</div>
    </div>`;
}
function tplReferees(){
  const none = !!state.no_referees;
  return `
    <div class="step-eyebrow">Application Form</div>
    <h2>Referees &amp; Declarations</h2>
    <p class="step-desc">Please give two referees we can contact about your application. Fresh graduates may give one.</p>

    <label class="no-exp" id="field-no_referees"><input type="checkbox" ${none ? 'checked' : ''} onchange="updateField('no_referees', this.checked); render();">
      <span><strong>I have no referee to provide</strong><br><span class="hint">For example, if you are applying for an internship or your first job.</span></span></label>

    ${none ? '' : `<div class="grid">
      ${refereeFieldsetHtml('referee1', 1, ['e.g. John Tan', 'e.g. Project Manager', 'e.g. ABC Engineering Sdn Bhd', 'e.g. Ex-supervisor', 'e.g. 0123456789'])}
      ${refereeFieldsetHtml('referee2', 2, ['e.g. Jane Lim', 'e.g. HR Manager', 'e.g. XYZ Holdings Berhad', 'e.g. Colleague', 'e.g. 0129876543'], true)}
    </div>`}

    <div class="section-title">Declarations</div>
    <p class="decl-text">(A) ${esc(WCT.DECLARATION_A)}</p>
    ${declBoxHtml('declaration_lawsuit', 'B', esc(WCT.DECLARATION_B).replace(/\.$/, ':'))}
    ${declBoxHtml('declaration_other_matters', 'C', esc(WCT.DECLARATION_C).replace(/\.$/, ':'))}

    ${navButtonsValidated('family','attachments', validateRefereesStep)}
  `;
}
function validateRefereesStep(){
  const errs = [];
  const refStarted = (r) => ['name','designation','company','relationship','contact'].some(k => (r[k]||'').trim());
  if(!state.no_referees) ['referee1','referee2'].forEach((key, idx)=>{
    const r = state[key];
    if(idx === 1 && !refStarted(r)) return; // Referee 2 is optional (fresh graduates give one)
    if(!(r.name||'').trim()) errs.push({field:`field-${key}`, message:`Referee ${idx+1}: please enter a name (or tick "I have no referee to provide").`});
    if(!(r.designation||'').trim()) errs.push({field:`field-${key}`, message:`Referee ${idx+1}: please enter a designation.`});
    if(!(r.company||'').trim()) errs.push({field:`field-${key}`, message:`Referee ${idx+1}: please enter the company.`});
    if(!(r.relationship||'').trim()) errs.push({field:`field-${key}`, message:`Referee ${idx+1}: please enter your relationship to them.`});
    if(!(r.contact||'').trim()) errs.push({field:`field-${key}`, message:`Referee ${idx+1}: please enter a contact number.`});
    else if(!WCT.isValidPhone(r.contact)) errs.push({field:`field-${key}`, message:`Referee ${idx+1}: the contact number must be 10–11 digits.`});
  });
  if(!state.declaration_lawsuit) errs.push({field:'field-declaration_lawsuit', message:'Declaration (B): please give the details, or write NONE if none.'});
  if(!state.declaration_other_matters) errs.push({field:'field-declaration_other_matters', message:'Declaration (C): please give the details, or write NONE if none.'});
  return errs;
}

// ---------------------------------------------------------------------------
// STEP: attachments & profile picture
// ---------------------------------------------------------------------------
const DOC_ICONS = {
  ic: ['#E0F2FE','#0369A1','<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h3"/>'],
  resume: ['#FEE2E2','#B91016','<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'],
  academic: ['#F3E8FF','#7E22CE','<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'],
  payslip: ['#DCFCE7','#15803D','<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>'],
  declaration: ['#FEF3C7','#B45309','<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M9 12h6M9 15h4"/>'],
  other: ['#F1F5F9','#475569','<path d="m21.4 11.6-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>'],
};
function docFileRowHtml(f){
  const url = WCT.fileUrl(f.url);
  return `<div class="doc-file">
    <span class="th">${WCT.isImage(f) ? `<img src="${esc(url)}" alt="">` : esc(WCT.fileBadge(f))}</span>
    <a href="${esc(url)}" target="_blank" rel="noopener">${esc(f.name)}</a>
    ${f.category ? '' : `<select class="doc-move" aria-label="Which document is ${esc(f.name)}?" onchange="moveAttachment(${f._index}, this.value)">
      <option value="">Which document is this?</option>${DOC_MOVE_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`}
    <button type="button" class="x" aria-label="Remove ${esc(f.name)}" onclick="removeAttachmentConfirm(${f._index})">Remove</button>
  </div>`;
}
// Files uploaded before the document sections existed have no category and
// show under "Other documents"; the candidate can say what each one is.
const DOC_MOVE_OPTIONS = [['ic_front','IC — front / passport'],['ic_back','IC — back'],['resume','Resume / CV'],['academic','Academic certificate'],['payslip','Payslip'],['declaration','Declaration details'],['other','Other document']];
async function moveAttachment(i, category){
  const f = state.attachments[i];
  if(!f || !category) return;
  if(category.startsWith('ic_')) state.attachments.forEach(a => { if(a !== f && a.category === category) a.category = 'other'; });
  f.category = category;
  await saveDraftQuiet();
  render();
}
function tplAttachments(){
  const docs = WCT.docsByCategory(state.attachments);
  const sections = WCT.DOC_SECTIONS.map(sec => {
    const [bg, fg, icon] = DOC_ICONS[sec.key];
    const head = `<div class="doc-sec-h"><span class="ic" style="background:${bg};color:${fg}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span>
      <div><h4>${esc(sec.label)}</h4><div class="s">${esc(sec.hint)}</div></div>
      <span class="badge">${sec.required ? '<span class="tag-req">Required</span>' : '<span class="tag-opt">Optional</span>'}</span></div>`;
    if(sec.slots){
      return `<div class="doc-sec wide" id="field-docs-${sec.key}">${head}
        <div class="ic-slots">${sec.slots.map(([cat, label]) => {
          const f = docs[cat][0];
          if(f) return `<div class="ic-slot done"><span class="lbl">${label}</span>${WCT.isImage(f) ? `<img src="${esc(WCT.fileUrl(f.url))}" alt="IC ${label.toLowerCase()}">` : `<span>${esc(f.name)}</span>`}
            <span style="font-size:13px;">${esc(f.name)} · <button type="button" class="link-btn" style="color:var(--danger);" onclick="removeAttachmentConfirm(${f._index})">Remove</button></span></div>`;
          const optionalBack = cat === 'ic_back' && state.citizen === 'Non-Malaysian';
          return `<button type="button" class="ic-slot" onclick="pickDoc('${cat}')"><span class="lbl">${label}${optionalBack ? ' (optional)' : ''}</span>+ Upload ${label.toLowerCase()} of IC${cat==='ic_front' ? ' / passport' : ''}</button>`;
        }).join('')}</div>
        <div id="docErr-${sec.key}"></div></div>`;
    }
    return `<div class="doc-sec" id="field-docs-${sec.key}">${head}
      <div class="doc-files">${docs[sec.key].map(docFileRowHtml).join('')}</div>
      <button type="button" class="doc-add" onclick="pickDoc('${sec.key}')">+ Add file</button>
      <div id="docErr-${sec.key}"></div></div>`;
  }).join('');

  return `
    <div class="step-eyebrow">Application Form</div>
    <h2>Photo &amp; Documents</h2>
    <p class="step-desc">Upload clear copies: PDF, JPG, PNG or Word files, max ${MAX_UPLOAD_MB}MB each. You can add several files to each section.</p>

    <div class="section-title" style="margin-top:0;">Photo <span class="tag-opt">Optional</span></div>
    <div class="photo-row">
      <div class="photo-frame">${state.profile_picture_url ? `<img src="${esc(WCT.fileUrl(state.profile_picture_url))}" alt="Your photo">` : WCT.photoSticker(150, 170)}</div>
      <div>
        <div style="font-weight:700;">${state.profile_picture_url ? 'Your photo' : 'Add a recent photo of yourself'}</div>
        <div class="hint" style="font-size:14px;margin-top:4px;">A plain background with your face clearly visible is best. You can skip this if you don't have one now.</div>
        <div class="photo-actions">
          <button type="button" class="btn btn-primary" onclick="document.getElementById('profileInput').click()">${UI_ICON.camera} ${state.profile_picture_url ? 'Change photo' : 'Upload photo'}</button>
          ${state.profile_picture_url ? `<button type="button" class="btn btn-ghost" onclick="removePhoto()">Remove photo</button>` : ''}
        </div>
        <div id="profileUploadErr"></div>
      </div>
    </div>
    <input type="file" id="profileInput" accept="image/*" style="display:none" onchange="handleProfileUpload(this.files[0]); this.value='';">

    <div class="section-title">Supporting Documents</div>
    <div class="doc-grid">${sections}</div>
    <input type="file" id="docInput" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,image/*,application/pdf" multiple style="display:none" onchange="handleDocUpload(this.files); this.value='';">

    ${navButtonsValidated('referees','review', validateAttachmentsStep)}
  `;
}
// IC (front, plus back for Malaysians) and a resume are required.
function validateAttachmentsStep(){
  const errs = [];
  const docs = WCT.docsByCategory(state.attachments);
  if(!docs.ic_front.length) errs.push({field:'field-docs-ic', message:'Please upload the front of your IC (or your passport photo page).'});
  if(state.citizen !== 'Non-Malaysian' && !docs.ic_back.length) errs.push({field:'field-docs-ic', message:'Please upload the back of your IC.'});
  if(!docs.resume.length) errs.push({field:'field-docs-resume', message:'Please upload your resume / CV.'});
  if(errs.length && state.attachments.some(a => !a.category)) errs.push({field:'field-docs-other', message:'Already uploaded it earlier? Use "Which document is this?" under Other documents to put it in the right section.'});
  return errs;
}
let pendingDocCategory = 'other';
function pickDoc(category){
  pendingDocCategory = category;
  const input = document.getElementById('docInput');
  input.multiple = !category.startsWith('ic_');
  input.click();
}
function docSectionKey(category){ return category.startsWith('ic_') ? 'ic' : category; }
async function handleDocUpload(fileList){
  const files = Array.from(fileList || []);
  if(!files.length) return;
  const category = pendingDocCategory;
  const errBox = `docErr-${docSectionKey(category)}`;
  clearUploadError(errBox);
  for(const f of files){ if(!checkUploadSize(f, errBox)) return; }
  showLoading(files.length > 1 ? `Uploading ${files.length} files...` : 'Uploading document...');
  try{
    for(const file of files){
      const { data, error } = await apiTry(() => api.upload('/uploads/attachment', file));
      if(error) throw error;
      if(category.startsWith('ic_')) state.attachments = state.attachments.filter(a => a.category !== category);
      state.attachments.push({ ...data, category });
    }
  } catch(e){ hideLoading(); render(); showUploadError(errBox, 'Upload failed: '+e.message); return; }
  hideLoading();
  render();
  if(await saveFieldsNow({ attachments: state.attachments })) saveDraftQuiet();
}
async function removeAttachmentConfirm(i){
  const f = state.attachments[i];
  if(!f) return;
  if(!(await askYesNo('Remove this file?', `Remove "${f.name}" from your application?`))) return;
  state.attachments.splice(i,1);
  render();
  await saveFieldsNow({ attachments: state.attachments });
}
async function removePhoto(){
  if(!(await askYesNo('Remove your photo?', 'Are you sure you want to remove your photo?'))) return;
  // '' would be skipped by the save (keeps the old value), so clear it explicitly.
  if(state.id && !(await saveFieldsNow({ profile_picture_url: null }))) return;
  state.profile_picture_url = '';
  render();
}
// Save without the "Saving..." overlay or toast (after an upload/removal).
// A failed save is never silent: a bar at the bottom says so and offers
// "Try again". Returns true when saved.
async function saveDraftQuiet(){
  if(!state.id) return true;
  const { error } = await apiTry(() => api.patch(`/applications/${state.id}`, { reference_no: state.reference_no, patch: currentPatch() }));
  if(error){ console.error(error); showSaveProblem(error, saveDraftQuiet); return false; }
  hideNotice('save');
  return true;
}
// Save just these fields (an uploaded photo or file list) straight away, so
// they reach HR even if some other field on the form can't be saved yet.
async function saveFieldsNow(patch){
  if(!state.id) return true;
  const { error } = await apiTry(() => api.patch(`/applications/${state.id}`, { reference_no: state.reference_no, patch }));
  if(error){ console.error(error); showSaveProblem(error, () => saveFieldsNow(patch)); return false; }
  return true;
}

// ---------------------------------------------------------------------------
// Notices: "not saved" and "session ended" bars at the bottom of the page.
// ---------------------------------------------------------------------------
function showNotice(kind, html, actions){
  let bar = document.getElementById(`wctNotice-${kind}`);
  if(!bar){
    bar = document.createElement('div');
    bar.id = `wctNotice-${kind}`;
    bar.className = `wct-notice is-${kind}`;
    bar.setAttribute('role', 'alert');
    let host = document.getElementById('wctNotices');
    if(!host){ host = document.createElement('div'); host.id = 'wctNotices'; host.className = 'wct-notices'; document.body.appendChild(host); }
    host.appendChild(bar);
  }
  bar.innerHTML = `<div class="msg">${html}</div><div class="acts"></div>`;
  const acts = bar.querySelector('.acts');
  (actions || []).forEach(([label, fn, primary]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = primary ? 'btn btn-primary' : 'btn btn-ghost'; b.textContent = label;
    b.onclick = fn; acts.appendChild(b);
  });
}
function hideNotice(kind){ const bar = document.getElementById(`wctNotice-${kind}`); if(bar) bar.remove(); }
function showSaveProblem(error, retry){
  if(error && error.sessionEnded) return showSessionEnded();
  showNotice('save', `<strong>Your latest changes are not saved.</strong> ${esc(error && error.message || 'Please try again.')}`, [
    ['Try again', async (ev) => { ev.target.disabled = true; ev.target.textContent = 'Saving…'; const ok = await retry(); if(ok) { hideNotice('save'); if(window.WX) WX.toast('Saved', {kind:'ok', timeout:1600}); } else { ev.target.disabled = false; ev.target.textContent = 'Try again'; } }, true],
    ['Dismiss', () => hideNotice('save')]
  ]);
}
function showSessionEnded(){
  hideNotice('save');
  showNotice('session', '<strong>You have been signed out.</strong> This can happen after signing out in another tab or a long break. Sign in again to carry on — everything saved before is kept.', [
    ['Sign in again', () => { window.location.href = 'login.html' + window.location.search; }, true]
  ]);
}
window.addEventListener('wct:session-ended', (e) => { if(!(e.detail && e.detail.admin)) showSessionEnded(); });
// Signed out (or in as someone else) in another tab: say so at once rather
// than at the next save.
window.addEventListener('storage', (e) => {
  if(e.key === 'wct_token' && !e.newValue) showSessionEnded();
});

// Filename sanitization now happens server-side (backend/src/routes/uploads.js
// sanitizeFilename()) before the blob is actually named — this client-side
// copy no longer needs to produce the real storage key, just something
// reasonable to show while uploading.

// Upload size cap — kept in lockstep with the backend's own MAX_FILE_BYTES
// limit in backend/src/routes/uploads.js (also 8MB), so a file that would be
// rejected server-side is caught here first, before any upload even starts.
const MAX_UPLOAD_MB = 8;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// Non-blocking (no native alert()) message rendered right under the upload
// box it concerns, so it can't cover other fields or shift the page around —
// just a small inline banner that clears itself the next time the person
// picks a file.
function showUploadError(containerId, message){
  const el = document.getElementById(containerId);
  if(el) el.innerHTML = `<div class="inline-error">${esc(message)}</div>`;
}
function clearUploadError(containerId){
  const el = document.getElementById(containerId);
  if(el) el.innerHTML = '';
}
function checkUploadSize(file, containerId){
  if(file.size <= MAX_UPLOAD_BYTES) return true;
  const mb = (file.size / (1024*1024)).toFixed(1);
  showUploadError(containerId, `"${file.name}" is ${mb}MB, which is over the ${MAX_UPLOAD_MB}MB limit. Please compress it into a ZIP file and upload that instead.`);
  return false;
}

async function handleProfileUpload(file){
  if(!file) return;
  clearUploadError('profileUploadErr');
  if(!checkUploadSize(file, 'profileUploadErr')) return;
  showLoading('Uploading photo...');
  try{
    const { data, error } = await apiTry(() => api.upload('/uploads/profile-picture', file));
    if(error) throw error;
    state.profile_picture_url = data.url;
  } catch(e){ hideLoading(); showUploadError('profileUploadErr', 'Upload failed: '+e.message); return; }
  hideLoading(); render();
  // The photo is saved on its own first, so HR sees it even if another field
  // on the form can't be saved yet.
  if(await saveFieldsNow({ profile_picture_url: state.profile_picture_url })) saveDraftQuiet();
}



// ---------------------------------------------------------------------------
// STEP: review
// ---------------------------------------------------------------------------
function rrow(k,v){ return `<div class="review-row"><div class="k">${k}</div><div class="v">${esc(v)||'—'}</div></div>`; }
function reviewHeader(title, step){ return `<h4>${title} <button type="button" class="edit-link" onclick="goStep('${step}')" aria-label="Edit ${title.replace(/&amp;/g,'and')}">Edit</button></h4>`; }

// One read-only summary of an application, used by the Review step (with
// Edit links) and by "My Applications" → details (without).
function applicationSummaryHtml(a, editable){
  const h = (title, step) => editable ? reviewHeader(title, step) : `<h4>${title}</h4>`;
  const docs = WCT.docsByCategory(a.attachments);
  const langs = (a.language_ability||[]).filter(r => (r.language||'').trim() && !/^Others \(please state\)$/i.test(r.language));
  const exp = (a.working_experience||[]).filter(r => (r.employer||'').trim() || (r.position||'').trim());
  const refs = [a.referee1, a.referee2].filter(r => r && r.name);
  const kids = [...(a.children_below_18||[]).map(c => ['Below 18', c]), ...(a.children_18_to_23||[]).map(c => ['18 and above', c])];
  const fileRow = (label, list) => `<div class="file-thumb-row"><div class="k" style="width:44%;">${label}</div>
    <div class="v" style="width:56%;">${list.length ? list.map(f => `<div style="display:flex;align-items:center;gap:10px;margin:2px 0;">
      <span class="file-thumb">${WCT.isImage(f) ? `<img src="${esc(WCT.fileUrl(f.url))}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">` : UI_ICON.file}</span>
      <a href="${esc(WCT.fileUrl(f.url))}" target="_blank" rel="noopener">${esc(f.name)}</a></div>`).join('') : '<span style="color:var(--ink-soft);">None</span>'}</div></div>`;
  return `
    <div class="review-block">
      ${h('Personal Particulars', 'personal')}
      ${rrow('Business Unit', WCT.buName(a.business_unit))}
      ${rrow('Position Applying For', a.position_applying)}
      ${rrow('Name (per NRIC)', a.name_nric)}
      ${rrow('Alias', a.alias)}
      ${rrow('Permanent Address', WCT.formatAddress(a, 'permanent'))}
      ${rrow('Correspondence Address', WCT.sameAddress(a) ? 'Same as permanent address' : WCT.formatAddress(a, 'correspondence'))}
      ${rrow('Mobile', a.mobile_phone)}
      ${rrow('Email', a.email)}
      ${rrow('NRIC / Passport', a.nric_new || a.passport_number)}
      ${rrow('Date of Birth / Age', `${formatDobForDisplay(a.date_of_birth) || '—'} / ${a.age || '—'}`)}
      ${rrow('Marital Status', a.marital_status)}
      ${rrow('Race / Bumiputra', `${a.race || '—'} / ${a.bumiputra || '—'}`)}
    </div>
    <div class="review-block">
      ${h('Language Ability', 'language')}
      ${langs.map(r=>rrow(r.language, `Spoken: ${r.spoken||'—'}, Written: ${r.written||'—'}`)).join('') || rrow('Language Ability','None provided')}
    </div>
    <div class="review-block">
      ${h('Education', 'education')}
      ${(a.education||[]).map(r=>rrow(WCT.eduTypeLabel(r.type), `${r.name} (${r.from_year}–${r.to_year}) — ${r.qualification}${r.course_name?' — '+r.course_name:''}`)).join('') || rrow('Education','None provided')}
    </div>
    <div class="review-block">
      ${h('Working Experience', 'experience')}
      ${a.no_working_experience ? rrow('Experience', 'No previous working experience') : (exp.map(r=>rrow(r.position||'Position', `${r.employer} (${r.from}–${r.is_current?'Present':r.to})`)).join('') || rrow('Experience','None provided'))}
    </div>
    <div class="review-block">
      ${h('Employment Questions', 'questions')}
      ${rrow('Resignation Notice Required', a.resignation_notice_required==='Yes' ? `Yes — ${a.notice_period||''}` : a.resignation_notice_required)}
      ${rrow('Date Available to Start', formatDobForDisplay(a.date_available_to_start) || a.date_available_to_start)}
      ${rrow('Expected Basic Salary', fmtMoney(a.expected_basic_salary))}
      ${rrow('Relatives in Company', a.relatives_in_company==='Yes' ? `Yes — ${a.relatives_name} (${a.relatives_relationship})` : a.relatives_in_company)}
      ${rrow('Referred by Anyone', a.referral_person==='Yes' ? `Yes — ${a.referral_name}, ${a.referral_department}` : a.referral_person)}
      ${rrow('Own Transport (Car / Motorcycle)', `${a.own_transport_motorcar||'—'} / ${a.own_transport_motorcycle||'—'}`)}
      ${rrow('Willing Outside Klang Valley', a.willing_based_outside_klang_valley)}
      ${rrow('Physical Defects', a.physical_defects==='Yes' ? `Yes — ${a.physical_defects_specify||''}` : a.physical_defects)}
      ${rrow('Arrested / Convicted', a.arrested_convicted==='Yes' ? `Yes — ${a.arrested_convicted_specify||''}` : a.arrested_convicted)}
    </div>
    <div class="review-block">
      ${h('Family Details', 'family')}
      ${rrow('Spouse', a.spouse_name ? [a.spouse_name, a.spouse_occupation, a.spouse_working ? 'Working: '+a.spouse_working : ''].filter(Boolean).join(' · ') : '')}
      ${rrow('Number of children below 18', a.children_below_18_count != null ? String(a.children_below_18_count) : (kids.filter(k => k[0] === 'Below 18').length ? String(kids.filter(k => k[0] === 'Below 18').length) : ''))}
      ${rrow('Number of children 18 and above', a.children_18_to_23_count != null ? String(a.children_18_to_23_count) : (kids.filter(k => k[0] !== 'Below 18').length ? String(kids.filter(k => k[0] !== 'Below 18').length) : ''))}
    </div>
    <div class="review-block">
      ${h('Referees &amp; Declarations', 'referees')}
      ${a.no_referees ? rrow('Referees', 'No referee to provide') : (refs.map((r,i)=>rrow(`Referee ${i+1}`, `${r.name} — ${r.designation}${r.company ? ', '+r.company : ''} · ${r.relationship} · ${r.contact}`)).join('') || rrow('Referees', 'None provided'))}
      ${rrow('Declaration (B) — Lawsuits/Proceedings', WCT.declAnswer(a.declaration_lawsuit, a.declaration_lawsuit_specify))}
      ${rrow('Declaration (C) — Other Matters', WCT.declAnswer(a.declaration_other_matters, a.declaration_other_matters_specify))}
    </div>
    <div class="review-block">
      ${h('Photo &amp; Documents', 'attachments')}
      <div class="file-thumb-row"><div class="k" style="width:44%;">Photo</div><div class="v" style="width:56%;">
        ${a.profile_picture_url ? `<img src="${esc(WCT.fileUrl(a.profile_picture_url))}" class="profile-thumb-lg" alt="Photo">` : '<span style="color:var(--ink-soft);">Not uploaded (optional)</span>'}</div></div>
      ${fileRow('IC (front / back)', [...docs.ic_front, ...docs.ic_back])}
      ${fileRow('Resume / CV', docs.resume)}
      ${fileRow('Academic certificates', docs.academic)}
      ${fileRow('Payslip', docs.payslip)}
      ${docs.declaration.length ? fileRow('Declaration details', docs.declaration) : ''}
      ${fileRow('Other documents', docs.other)}
    </div>`;
}

function tplReview(){
  reachedReview = true;
  return `
    <div class="step-eyebrow">Application Form</div>
    <h2>Review Your Application</h2>
    <p class="step-desc">Please check every section carefully before proceeding to the consent forms. Reference number: <strong>${state.reference_no}</strong></p>
    ${applicationSummaryHtml(state, true)}
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="goStep('attachments')">← Back</button>
      <div class="right"><button class="btn btn-primary" onclick="proceedToConsent()">Everything looks correct → Continue to Consent Forms</button></div>
    </div>
  `;
}

async function proceedToConsent(){
  const stop = firstIncompleteStep();
  if(stop !== 'review'){ goStep(stop); return; }
  const ok = await saveDraft();
  if(ok) goStep('consent-lang');
}

// ---------------------------------------------------------------------------
// STEP: consent language choice
// ---------------------------------------------------------------------------
function tplConsentLang(){
  return `
    <div class="step-eyebrow">Consent Forms</div>
    <h2>Choose Your Preferred Language</h2>
    <p class="step-desc">The consent and data protection forms are available in Bahasa Malaysia or English. Choose the language you're most comfortable reading.</p>
    <div class="lang-choice">
      <div class="opt ${state.language_choice==='BM'?'selected':''}" onclick="selectLang('BM')">Bahasa Melayu</div>
      <div class="opt ${state.language_choice==='EN'?'selected':''}" onclick="selectLang('EN')">English</div>
    </div>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="goStep('review')">← Back</button>
      <div class="right"><button class="btn btn-primary" ${!state.language_choice?'disabled':''} onclick="goStepWithSave('pdpa')">Continue →</button></div>
    </div>
  `;
}
function selectLang(l){
  state.language_choice = l;
  // The signature starts from what the candidate gave on the form.
  if(!pdpaDraft.name) pdpaDraft = { name: state.name_nric || '', nric: state.nric_new || state.passport_number || '', agreed: false };
  render();
}

// ---------------------------------------------------------------------------
// STEP: PDPA notice
// ---------------------------------------------------------------------------
function tplPdpa(){
  const t = CONSENT_TEXT[state.language_choice || 'EN'];
  return `
    <div class="step-eyebrow">Consent Form</div>
    <h2>${t.pdpaTitle}</h2>
    <div class="consent-doc">${t.pdpaBody}</div>

    ${WCT.sigHtml({
      id: 'pdpaSig',
      title: state.language_choice==='BM' ? 'Tandatangan digital' : 'Digital signature',
      name: pdpaDraft.name, nric: pdpaDraft.nric, agreed: pdpaDraft.agreed,
      nameLabel: state.language_choice==='BM' ? 'Nama penuh (seperti dalam K/P / pasport)' : 'Full name (as per NRIC / passport)',
      nricLabel: state.language_choice==='BM' ? 'No. K/P / Pasport' : 'NRIC / Passport no.',
      agreeText: t.agreeLabel,
      onChange: (v) => { pdpaDraft = { name: v.name, nric: v.nric, agreed: v.agreed }; if(v.ok){ const el = document.getElementById('pdpaErr'); if(el) el.innerHTML = ''; } },
    })}
    <div id="pdpaErr"></div>

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="goStep('consent-lang')">← Back</button>
      <div class="right"><button class="btn btn-primary" onclick="submitPdpa()">Agree &amp; Continue →</button></div>
    </div>
  `;
}

let pdpaDraft = { name: '', nric: '', agreed: false };
async function submitPdpa(){
  const sig = WCT.sigValue('pdpaSig');
  if(!sig.ok){
    document.getElementById('pdpaSig').classList.add('invalid');
    document.getElementById('pdpaErr').innerHTML = `<div class="error-banner">${state.language_choice==='BM' ? 'Sila taip nama dan nombor K/P anda, kemudian tandakan kotak persetujuan.' : 'Please type your full name and NRIC / passport number, then tick the box to confirm your consent.'}</div>`;
    return;
  }
  const { name, nric } = sig;
  showLoading('Recording your consent...');
  try{
    // The JTS consent letter step has been removed from the candidate-facing
    // flow entirely, but rpc_agree_jts is called silently here (using data
    // already collected earlier in the form, no extra candidate input) in
    // case anything server-side still expects jts_agreed to be true before
    // allowing final submission — same defensive pattern used for TP3.
    const jtsResult = await apiTry(() => api.post(`/applications/${state.id}/consent/jts`, {
      reference_no: state.reference_no, name: state.name_nric, nric: state.nric_new, mobile: state.mobile_phone
    }));
    if(!jtsResult.error) state.jts_agreed = true;

    const { error } = await apiTry(() => api.post(`/applications/${state.id}/consent/pdpa`, {
      reference_no: state.reference_no, name, nric
    }));
    if(error) throw error;
    state.pdpa_agreed = true;
    hideLoading();
    goStep('final');
  } catch(e){ hideLoading(); document.getElementById('pdpaErr').innerHTML = `<div class="error-banner">${e.message}</div>`; }
}

// ---------------------------------------------------------------------------
// STEP: final confirmation & submit
// ---------------------------------------------------------------------------
function tplFinal(){
  return `
    <div class="step-eyebrow">Final Step</div>
    <h2>Submit Your Application</h2>
    <div class="success-banner">Both consent forms have been completed.</div>
    <p class="step-desc">Once submitted, your application will be locked and sent to our HR team for review. Please use the Back button now if you need to make any changes.</p>
    <div id="finalErr"></div>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="goStep('pdpa')">← Back</button>
      <div class="right"><button class="btn btn-accent" onclick="finalSubmit()">Submit Application</button></div>
    </div>
  `;
}

let submittedApplication = null;
async function finalSubmit(){
  showLoading('Submitting your application...');
  try{
    const { data, error } = await apiTry(() => api.post(`/applications/${state.id}/submit`, { reference_no: state.reference_no }));
    if(error) throw error;
    // The submitted record carries the PDPA signature (name, NRIC, time),
    // which the form state doesn't, so the PDF on the next page is complete.
    submittedApplication = data || null;
    hideLoading();
    goStep('done');
    if(window.WX) setTimeout(() => WX.celebrate(), 250);
  } catch(e){
    hideLoading();
    document.getElementById('finalErr').innerHTML = `<div class="error-banner">${e.message}</div>`;
  }
}

// ---------------------------------------------------------------------------
// STEP: done
// ---------------------------------------------------------------------------
function tplDone(){
  return `
    <div class="thankyou">
      ${window.WXC ? WXC.checkSvg : ''}
      <div class="step-eyebrow">Application Received</div>
      <h2>Thank you for completing your profile with WCT Group!</h2>
      <p class="step-desc">Your application has been successfully submitted. We appreciate your interest in joining WCT Group and look forward to meeting you at the interview!</p>
      <div class="ref-box">${state.reference_no}</div>
      <p class="step-desc">Please keep this reference number for your records. For enquiries, please contact your HR Representative.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="exportMyApplicationPdf(submittedApplication || state)">${UI_ICON.pdf} Download as PDF</button>
        <button class="btn btn-ghost" onclick="backToMyApplications()">Back to My Applications</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Navigation buttons helper (with autosave on Next)
// ---------------------------------------------------------------------------
function navButtons(backStep, nextStep){
  return `
    <div class="btn-row">
      ${backStep ? `<button class="btn btn-ghost" onclick="goStepWithSave('${backStep}')">← Back</button>` : '<div></div>'}
      <div class="right">
        <button class="btn btn-ghost" onclick="saveAndExit()">Save &amp; Exit</button>
        <button class="btn btn-primary" onclick="goStepWithSave('${nextStep}')">Next →</button>
      </div>
    </div>
  `;
}
async function goStepWithSave(next){ const ok = await saveDraft(); if(ok) goStep(next); }

function navButtonsValidated(backStep, nextStep, validatorFn){
  const toReview = reachedReview && nextStep !== 'review';
  return `
    <div id="stepErr"></div>
    <div class="btn-row">
      ${backStep ? `<button class="btn btn-ghost" onclick="goStepWithSave('${backStep}')">← Back</button>` : '<div></div>'}
      <div class="right">
        <button class="btn btn-ghost" onclick="saveAndExit()">Save &amp; Exit</button>
        ${toReview ? `<button class="btn btn-ghost" onclick="goStepWithValidation('review', ${validatorFn.name})">Save &amp; back to Review</button>` : ''}
        <button class="btn btn-primary" onclick="goStepWithValidation('${nextStep}', ${validatorFn.name})">Next →</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Jumping between steps (Malls feedback, 29 Oct 2026). A step can be opened
// once every step before it is complete, so Review is only reachable with a
// complete form; going back to fix something is always allowed.
// ---------------------------------------------------------------------------
const FORM_STEPS = ['personal','language','education','experience','questions','family','referees','attachments','review'];
const STEP_VALIDATORS = {
  personal: () => validatePersonalStep(), language: () => validateLanguageStep(), education: () => validateEducationStep(),
  experience: () => validateExperienceStep(), questions: () => validateQuestionsStep(), family: () => validateFamilyStep(),
  referees: () => validateRefereesStep(), attachments: () => validateAttachmentsStep(),
};
let reachedReview = false; // shows "Save & back to Review" once the candidate has seen Review
function firstIncompleteStep(){
  for(const st of FORM_STEPS.slice(0, -1)){ if(STEP_VALIDATORS[st]().length) return st; }
  return 'review';
}
async function jumpToStep(target){
  if(target === state.step) return;
  const stop = firstIncompleteStep();
  if(FORM_STEPS.indexOf(target) > FORM_STEPS.indexOf(stop)){
    if(window.WX) WX.toast(`Please complete ${STEP_LABELS[stop]} first.`, { timeout: 2600 });
    return;
  }
  const ok = await saveDraft();
  if(ok) goStep(target);
}
async function goStepWithValidation(next, validatorFn){
  clearAllInvalidFields();
  const errs = validatorFn();
  if(errs.length){
    const messages = errs.map(e => typeof e === 'string' ? e : e.message);
    document.getElementById('stepErr').innerHTML = `<div class="error-banner">${messages.join('<br>')}</div>`;
    let firstEl = null;
    errs.forEach(e => {
      const fieldId = typeof e === 'string' ? null : e.field;
      if(!fieldId) return;
      const el = markFieldInvalid(fieldId);
      if(el && !firstEl) firstEl = el;
    });
    if(firstEl){
      firstEl.scrollIntoView({ behavior:'smooth', block:'center' });
      const focusable = firstEl.matches('input,select,textarea') ? firstEl : firstEl.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled])');
      if(focusable) focusable.focus({ preventScroll:true });
    } else {
      window.scrollTo(0,0);
    }
    return;
  }
  const ok = await saveDraft();
  if(!ok) return;
  if(next === 'review'){
    const stop = firstIncompleteStep();
    if(stop !== 'review'){
      if(window.WX) WX.toast(`${STEP_LABELS[stop]} still needs some details.`, { timeout: 2600 });
      goStep(stop);
      return;
    }
  }
  goStep(next);
}
async function saveAndExit(){
  await saveDraft();
  root.innerHTML = `
    <div class="thankyou">
      <div class="step-eyebrow">Progress Saved</div>
      <h2>Come back anytime</h2>
      <p class="step-desc">Your progress is saved to your account. Just sign back in and you'll find this application waiting for you, exactly where you left off.</p>
      <div class="ref-box">${state.reference_no}</div>
      <button class="btn btn-primary" onclick="backToMyApplications()">Back to My Applications</button>
    </div>`;
}
async function backToMyApplications(){
  showLoading('Loading your applications...');
  await loadMyApplications();
  hideLoading();
  goStep('start');
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function esc(v){
  if(v===null||v===undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function fmt(v){ return (v===null||v===undefined||v==='') ? '—' : esc(String(v)); }
function fmtDate(v){ if(!v) return '—'; try{ return new Date(v).toLocaleDateString('en-GB'); }catch(e){ return esc(v); } }
function fmtDateTime(v){ if(!v) return '—'; try{ return new Date(v).toLocaleString('en-GB'); }catch(e){ return esc(v); } }
// Expected Basic Salary is stored as a bare numeric string (candidate types
// digits only, per the field's numericOnly() validation) — shown elsewhere
// as-is (e.g. "4500"), which reads ambiguously since it's just a number with
// nothing marking it as a Ringgit amount. This formats it the same way the
// input's own label already does ("RM 4,500").
function fmtMoney(v){
  if(v===null||v===undefined||v==='') return '—';
  const n = Number(v);
  if(Number.isNaN(n)) return esc(String(v));
  return 'RM ' + n.toLocaleString('en-MY', {maximumFractionDigits:2});
}

// ---------------------------------------------------------------------------
// PDF EXPORT (candidate's own records) — same print-window approach already
// proven in the admin dashboard: build a print-ready HTML page, open it in
// a new tab, and let the browser's own "Print > Save as PDF" do the work.
// No third-party service, no cost.
// ---------------------------------------------------------------------------
function exportMyApplicationPdfById(id){
  const row = myApplications.find(a=>a.id===id);
  if(!row){ alert('Could not find that application.'); return; }
  exportMyApplicationPdf(row);
}
function exportMyApplicationPdf(a){
  WCT.openPrint(WCT.applicationPdfHtml(a, { hideStatus: true }));
}

// Family details now live on the application; older onboarding records
// kept their own copy, used when the application has none.
function obFamily(o){
  const fam = o.family || {};
  const has = (v) => Array.isArray(v) ? v.length > 0 : !!v;
  const out = {};
  // Spouse: the application's answer (older records: the onboarding copy).
  ['spouse_name','spouse_occupation','spouse_nric','spouse_date_of_birth','spouse_working']
    .forEach(k => { out[k] = has(fam[k]) ? fam[k] : o[k]; });
  // Children: given at onboarding now (older records: on the application).
  ['children_below_18','children_18_to_23'].forEach(k => { out[k] = has(o[k]) ? o[k] : fam[k]; });
  ['children_below_18_count','children_18_to_23_count'].forEach(k => { out[k] = fam[k]; });
  return out;
}
function exportMyOnboardingPdf(){
  if(!onboardingState || !onboardingAppId){ alert('No onboarding data loaded.'); return; }
  const a = myApplications.find(x=>x.id===onboardingAppId) || {};
  const o = { ...onboardingState, ...obFamily(onboardingState) };
  WCT.openPrint(WCT.onboardingPdfHtml(a, o));
}

// ---------------------------------------------------------------------------
// Boot: require sign-in, load the user's profile + saved applications
// ---------------------------------------------------------------------------
function signOut(){
  api.clearSession();
  // Preserve ?bu=... (and anything else in the URL) so someone who signed
  // in via a business-unit-specific link and then signs out doesn't lose
  // that context — without this, logging back in would land on a bare
  // index.html with no business unit, blocking them from starting a new
  // application entirely.
  window.location.href = 'login.html' + window.location.search;
}

(async function boot(){
  if(!api.getToken()){
    window.location.href = 'login.html' + window.location.search;
    return;
  }

  // Blacklist check — must happen before anything else loads. Uses
  // GET /api/blacklist-check (backend/src/routes/applications.js
  // blacklistCheck, mounted at the app level) — a defense-in-depth check
  // independent of the one already enforced at login/register/oauth time,
  // in case an account is blacklisted AFTER a still-valid token was issued.
  try{
    const { data, error } = await apiTry(() => api.get('/blacklist-check'));
    if(error){
      // An expired/invalid token surfaces here as a 401 — treat it the same
      // as "not signed in" rather than silently failing later on.
      if(error.status === 401){
        api.clearSession();
        window.location.href = 'login.html?session_expired=1';
        return;
      }
      throw error;
    }
    if(data.blacklisted){
      api.clearSession();
      window.location.href = 'login.html?blacklisted=1';
      return;
    }
  } catch(e){ console.error('Blacklist check failed:', e); }

  const user = api.getUser();
  currentUser = {
    id: user?.id || '',
    email: user?.email || '',
    name: user?.name || ''
  };

  showLoading('Loading your applications...');
  await loadMyApplications();
  hideLoading();

  // Which business unit this candidate is applying under is now determined
  // by which link they used to reach the portal (e.g. index.html?bu=Mall),
  // rather than a dropdown they pick themselves — different business units
  // share different links, so the right manager gets notified automatically.
  // Left in the URL (not stripped) since this link may be bookmarked/reused.
  // ?bu= may carry a unit's code (Land) or its name (Property Development);
  // either way it is resolved against the managed list from the API.
  await WCT.loadBusinessUnits();
  const linkUnit = WCT.buResolve(new URLSearchParams(window.location.search).get('bu'));
  linkBusinessUnit = linkUnit ? linkUnit.code : null;

  // A "Complete Your Onboarding" email link lands here as
  // index.html?onboarding=<application id> (carried through the sign-in
  // flow if the candidate wasn't already logged in) — open that
  // application's onboarding form directly instead of the generic
  // application list, so the click actually saves them a step.
  const onboardingId = new URLSearchParams(window.location.search).get('onboarding');
  if(onboardingId){
    // Strip the param so refreshing the page afterward doesn't keep
    // re-opening onboarding every time.
    window.history.replaceState({}, '', window.location.pathname);
    await openOnboarding(onboardingId);
  }

  // Offboarding invitation links (index.html?offboard=<token>, carried
  // through login.html when signed out) open the leaver's own offboarding
  // page — see offboarding-employee.js.
  await obEmpBoot();

  render();
})();
