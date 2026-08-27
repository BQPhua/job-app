// ============================================================================
// WCT Group Job Application — client logic
// ============================================================================

const STEPS = ['start','personal','language','education','experience','questions',
               'referees','attachments','review','consent-lang','pdpa','final','done'];

let state = {
  step: 'start',
  id: null,
  reference_no: null,
  status: 'draft',
  business_unit: '', position_applying: '',
  name_nric: '', alias: '',
  permanent_address: '', permanent_postcode: '',
  correspondence_address: '', correspondence_postcode: '',
  tel_residence: '', tel_office: '', mobile_phone: '', email: '',
  place_of_birth: '', nric_new: '', passport_number: '', citizen: '', marital_status: '',
  date_of_birth: '', age: '', bumiputra: '', race: '',
  epf_no: '', income_tax_no: '', tax_branch: '', socso_no: '', bank_account_no: '',
  cidb_green_card_no: '', cidb_branch: '',
  language_ability: [
    {language:'Bahasa Malaysia', spoken:'', written:''},
    {language:'English', spoken:'', written:''},
    {language:'Mandarin', spoken:'', written:''},
    {language:'Others (please state)', spoken:'', written:''}
  ],
  education: [ {type:'School', name:'', from_year:'', to_year:'', qualification:''} ],
  working_experience: [ {employer:'', from:'', to:'', is_current:false, position:'', remuneration:'', responsibilities:''} ],
  resignation_notice_required:'', notice_period:'', date_available_to_start:'',
  expected_basic_salary:'',
  relatives_in_company:'', relatives_name:'', relatives_relationship:'',
  own_transport_motorcar:'', own_transport_motorcycle:'',
  willing_based_outside_klang_valley:'',
  physical_defects:'', physical_defects_specify:'',
  arrested_convicted:'', arrested_convicted_specify:'',
  referee1:{name:'',designation:'',relationship:'',contact:''},
  referee2:{name:'',designation:'',relationship:'',contact:''},
  declaration_lawsuit:'', declaration_lawsuit_specify:'',
  declaration_other_matters:'', declaration_other_matters_specify:'',
  profile_picture_url:'', attachments:[],
  language_choice:'', jts_agreed:false, pdpa_agreed:false
};

const HIGHEST_EDUCATION_OPTIONS = [
  'No Formal Education','Pre-Primary Education','Primary Education','Middle School',
  'Secondary Education or High School','GED (General Educational Development)',
  'Vocational Qualification','Technical Education','Certificate Program',
  'Associate Degree',"Bachelor's Degree",'Post-Graduate Diploma',
  'Professional Certification',"Master's Degree",'Doctoral Degree (Ph.D., Ed.D., etc.)',
  'Professional Degree (MD, JD, DDS, etc.)','Post-Doctoral Studies','Other'
];

let currentUser = null; // populated at boot from Supabase Auth session

const root = document.getElementById('cardRoot');
const progressBar = document.getElementById('progressBar');
const topRefDisplay = document.getElementById('topRefDisplay');

function showLoading(text){ document.getElementById('loadingText').innerText = text||'Working...'; document.getElementById('loadingOverlay').style.display='flex'; }
function hideLoading(){ document.getElementById('loadingOverlay').style.display='none'; }

function updateField(key, value){ state[key] = value; }
function updateNested(obj, key, value){ obj[key] = value; }
function updateArrayField(arrName, idx, key, value){ state[arrName][idx][key] = value; }

function goStep(s){ state.step = s; window.scrollTo(0,0); render(); }

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------
function currentPatch(){
  const p = {...state};
  delete p.step; delete p.id; delete p.reference_no; delete p.status;
  delete p.jts_agreed; delete p.pdpa_agreed;
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
    const { error } = await supabaseClient.rpc('rpc_save_application', {
      p_id: state.id, p_reference_no: state.reference_no, p_patch: currentPatch()
    });
    if(error){
      console.error(error);
      success = false;
      alert(`Your progress could not be saved:\n\n${error.message}\n\nPlease try again — if this keeps happening, contact support before continuing, since your latest changes have NOT been saved.`);
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
function renderProgress(){
  const visibleSteps = STEPS.filter(s=>s!=='start' && s!=='done');
  const idx = visibleSteps.indexOf(state.step);
  progressBar.innerHTML = visibleSteps.map((s,i)=>{
    let cls='seg'; if(i<idx) cls+=' done'; if(i===idx) cls+=' active';
    return `<div class="${cls}"></div>`;
  }).join('');
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
    case 'referees': root.innerHTML = tplReferees(); break;
    case 'attachments': root.innerHTML = tplAttachments(); break;
    case 'review': root.innerHTML = tplReview(); break;
    case 'consent-lang': root.innerHTML = tplConsentLang(); break;
    case 'pdpa': root.innerHTML = tplPdpa(); break;
    case 'final': root.innerHTML = tplFinal(); break;
    case 'done': root.innerHTML = tplDone(); break;
    case 'onboarding': root.innerHTML = tplOnboarding(); break;
  }
}

// ---------------------------------------------------------------------------
// STEP: start (new application, or pick up one of the signed-in user's own drafts)
// ---------------------------------------------------------------------------
let myApplications = [];

let linkBusinessUnit = null; // which business unit this candidate is applying
// under, derived from the URL (?bu=Mall etc.) rather than a dropdown —
// see boot() below.

function statusBadgeHtml(status){
  const label = (status||'').replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
  return `<span class="status-badge ${esc(status)}">${esc(label)}</span>`;
}

function tplStart(){
  const drafts = myApplications.filter(a=>a.status==='draft');
  const others = myApplications.filter(a=>a.status!=='draft');

  return `
    <div class="step-eyebrow">Welcome${currentUser?.name ? ', '+esc(currentUser.name) : ''}</div>
    <h2>Employment Application</h2>
    <p class="step-desc">Apply once — your application will be routed to the right hiring team across E&amp;C, Land, and Mall.</p>

    ${drafts.length ? `
      <div class="section-title" style="margin-top:0;">Continue a Saved Application</div>
      ${drafts.map(a=>`
        <div class="draft-banner">
          <div class="draft-banner-icon">📝</div>
          <div class="draft-banner-body">
            <div class="draft-banner-title">${esc(a.reference_no)} — ${esc(a.position_applying||'Untitled')}</div>
            <div class="draft-banner-meta">${esc(a.business_unit)} · Draft in progress</div>
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
        <thead><tr><th>Reference</th><th>Position</th><th>Unit</th><th>Status</th><th>Submitted</th><th style="width:160px;">Actions</th></tr></thead>
        <tbody>
          ${others.map(a=>`
            <tr>
              <td><strong>${esc(a.reference_no)}</strong></td>
              <td>${esc(a.position_applying)}</td>
              <td>${esc(a.business_unit)}</td>
              <td>${statusBadgeHtml(a.status)}</td>
              <td>${a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}</td>
              <td>
                <div class="history-actions">
                  ${a.status==='hired' ? `<button class="btn btn-primary btn-sm" onclick="openOnboarding('${a.id}')">Onboarding Details</button>` : '<span style="color:var(--ink-soft);font-size:12.5px;">—</span>'}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

    <div class="section-title" style="margin-top:26px;">Start a New Application</div>
    ${VALID_BUSINESS_UNITS.includes(linkBusinessUnit) ? `
      <p class="step-desc" style="margin-top:0;">You are applying for a position with <strong>${esc(linkBusinessUnit)}</strong>.</p>
      ${others.length ? `
        <div class="error-banner" style="background:#FDF3E3;border-color:#E2D3AC;color:#9C7A0E;">
          You've previously submitted ${others.length===1?'an application':others.length+' applications'} (see "Your Previous Applications" above). Submitting a new one may create a duplicate — please check the table first if you're unsure whether you've already applied.
        </div>
      ` : ''}
      <div id="startErr"></div>
      <div class="btn-row"><div></div><div class="right"><button class="btn btn-primary" onclick="startNewApplication()">Begin Application →</button></div></div>
    ` : `
      <div class="error-banner">This application link doesn't specify a valid business unit. Please use the link provided by HR for the specific business unit you're applying to (E&amp;C, Land, or Mall).</div>
    `}
  `;
}

const VALID_BUSINESS_UNITS = ['E&C', 'Land', 'Mall'];

async function deleteDraft(id, referenceNo){
  if(!confirm(`Permanently delete the draft application "${referenceNo}"? This cannot be undone.`)) return;
  showLoading('Deleting draft...');
  try{
    const { error } = await supabaseClient.rpc('rpc_delete_my_draft_application', { p_id: id });
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
  loadStateFromRow(row);
  goStep('personal');
}

async function loadMyApplications(){
  try{
    const { data, error } = await supabaseClient.rpc('rpc_get_my_applications');
    if(error) throw error;
    myApplications = data || [];
  } catch(e){ console.error(e); myApplications = []; }
}

async function startNewApplication(){
  if(!VALID_BUSINESS_UNITS.includes(linkBusinessUnit)){
    document.getElementById('startErr').innerHTML = `<div class="error-banner">This application link doesn't specify a valid business unit.</div>`;
    return;
  }
  showLoading('Creating your application...');
  try{
    const { data, error } = await supabaseClient.rpc('rpc_create_draft', { p_business_unit: linkBusinessUnit });
    if(error) throw error;
    state.id = data[0].id; state.reference_no = data[0].reference_no;
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
      if(k==='attachments' && !row[k]) return;
      state[k] = row[k] ?? state[k];
    }
  });
  // If the saved SOCSO number differs from the NRIC, treat it as intentionally
  // edited so we don't silently overwrite it if they revisit the NRIC field.
  socsoManuallyEdited = !!(state.socso_no && state.socso_no !== state.nric_new);
}

// ---------------------------------------------------------------------------
// STEP: personal particulars
// ---------------------------------------------------------------------------
function tplPersonal(){
  return `
    <div class="step-eyebrow">Step 1 of 8</div>
    <h2>Personal Particulars</h2>
    <p class="step-desc">Applying with <strong>${esc(state.business_unit)}</strong></p>

    <div class="grid">
      <div class="field"><label>Name (per NRIC / Passport) <span class="req-star">*</span></label><input type="text" placeholder="e.g. Ahmad Bin Ali" value="${esc(state.name_nric)}" oninput="updateField('name_nric', this.value)"></div>
      <div class="field"><label>Alias <span class="opt-tag">(optional)</span></label><input type="text" value="${esc(state.alias)}" oninput="updateField('alias', this.value)"></div>
    </div>

    <div class="field"><label>Permanent Address <span class="req-star">*</span></label><textarea placeholder="e.g. 12 Jalan Damai, Taman Sentosa" oninput="updateField('permanent_address', this.value)">${esc(state.permanent_address)}</textarea></div>
    <div class="grid">
      <div class="field"><label>Postcode <span class="req-star">*</span></label><input type="text" placeholder="e.g. 50450" value="${esc(state.permanent_postcode)}" oninput="updateField('permanent_postcode', this.value)"></div>
      <div></div>
    </div>

    <div class="field"><label>Correspondence Address <span class="opt-tag">(if different)</span></label><textarea oninput="updateField('correspondence_address', this.value)">${esc(state.correspondence_address)}</textarea></div>
    <div class="grid">
      <div class="field"><label>Postcode <span class="opt-tag">(optional)</span></label><input type="text" value="${esc(state.correspondence_postcode)}" oninput="updateField('correspondence_postcode', this.value)"></div>
      <div></div>
    </div>

    <div class="grid g3">
      <div class="field"><label>Tel — Residence <span class="opt-tag">(optional)</span></label><input type="tel" placeholder="e.g. 03-1234 5678" value="${esc(state.tel_residence)}" oninput="updateField('tel_residence', this.value)"></div>
      <div class="field"><label>Tel — Office <span class="opt-tag">(optional)</span></label><input type="tel" placeholder="e.g. 03-8765 4321" value="${esc(state.tel_office)}" oninput="updateField('tel_office', this.value)"></div>
      <div class="field"><label>Mobile Phone <span class="req-star">*</span></label><input type="tel" placeholder="e.g. 012-345 6789" value="${esc(state.mobile_phone)}" oninput="updateField('mobile_phone', this.value)"></div>
    </div>

    <div class="grid">
      <div class="field"><label>E-mail Address <span class="req-star">*</span></label><input type="email" placeholder="e.g. ahmad.ali@example.com" value="${esc(state.email)}" oninput="updateField('email', this.value)"></div>
      <div class="field"><label>Place of Birth <span class="req-star">*</span></label><input type="text" placeholder="e.g. Kuala Lumpur" value="${esc(state.place_of_birth)}" oninput="updateField('place_of_birth', this.value)"></div>
    </div>

    <div class="section-title">Identification</div>
    <div class="grid g3">
      <div class="field">
        <label>Citizen <span class="req-star">*</span></label>
        <select onchange="handleCitizenChange(this.value)">
          <option value="">Select</option>
          <option ${state.citizen==='Malaysian'?'selected':''}>Malaysian</option>
          <option ${state.citizen==='Non-Malaysian'?'selected':''}>Non-Malaysian</option>
        </select>
      </div>
      <div class="field">
        <label>NRIC No. (without dash) ${state.citizen==='Malaysian' ? '<span class="req-star">*</span>' : '<span class="opt-tag">(Malaysians only)</span>'}</label>
        <input type="text" value="${esc(state.nric_new)}" placeholder="e.g. 900101011234" maxlength="14"
          ${state.citizen==='Non-Malaysian' ? 'disabled style="background:#F2F2F1;"' : ''}
          oninput="handleNricChange(this.value)">
        <div id="nricValidationMsg" class="hint"></div>
      </div>
      <div class="field">
        <label>Passport Number ${state.citizen==='Non-Malaysian' ? '<span class="req-star">*</span>' : '<span class="opt-tag">(optional)</span>'}</label>
        <input type="text" value="${esc(state.passport_number)}" placeholder="e.g. A12345678" oninput="updateField('passport_number', this.value)">
      </div>
    </div>
    <div class="grid g3">
      <div class="field">
        <label>Date of Birth <span class="req-star">*</span></label>
        <input type="date" id="dobInput" value="${esc(state.date_of_birth)}" onchange="handleDobChange(this.value)" oninput="handleDobChange(this.value)">
        <div class="hint">${state.citizen==='Malaysian' ? "Auto-filled from your NRIC — adjust here if it doesn't look right." : 'Pick a date, or click into the field and type it directly (dd/mm/yyyy).'}</div>
      </div>
      <div class="field"><label>Age</label><input type="number" id="ageInput" value="${esc(state.age)}" readonly style="background:#F2F2F2;"></div>
      <div class="field"><label>Marital Status <span class="req-star">*</span></label>
        <select oninput="updateField('marital_status', this.value)">
          <option value="">Select</option>
          ${['Single','Married','Divorced','Widowed'].map(o=>`<option ${state.marital_status===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="grid g3">
      <div class="field"><label>Bumiputra <span class="req-star">*</span></label>
        <select oninput="updateField('bumiputra', this.value)">
          <option value="">Select</option><option ${state.bumiputra==='Yes'?'selected':''}>Yes</option><option ${state.bumiputra==='No'?'selected':''}>No</option>
        </select>
      </div>
      <div class="field"><label>Race <span class="req-star">*</span></label><input type="text" placeholder="e.g. Malay" value="${esc(state.race)}" oninput="updateField('race', this.value)"></div>
      <div></div>
    </div>

    ${navButtonsValidated('start','language', validatePersonalStep)}
  `;
}

function validatePersonalStep(){
  const errs = [];
  if(!state.name_nric.trim()) errs.push('Please enter your name (per NRIC/Passport).');
  if(!state.permanent_address.trim()) errs.push('Please enter your permanent address.');
  if(!state.permanent_postcode.trim()) errs.push('Please enter your permanent address postcode.');
  if(!state.mobile_phone.trim()) errs.push('Please enter your mobile phone number.');
  if(!state.email.trim()) errs.push('Please enter your email address.');
  if(!state.place_of_birth.trim()) errs.push('Please enter your place of birth.');
  if(!state.citizen) errs.push('Please select your citizenship.');
  if(state.citizen === 'Malaysian'){
    const digits = (state.nric_new||'').replace(/[^0-9]/g,'');
    if(!state.nric_new.trim()) errs.push('Please enter your NRIC number.');
    else if(digits.length !== 12) errs.push('NRIC number must be exactly 12 digits.');
  } else if(state.citizen === 'Non-Malaysian'){
    if(!state.passport_number.trim()) errs.push('Please enter your passport number.');
  }
  if(!state.date_of_birth) errs.push('Please provide your date of birth.');
  if(!state.marital_status) errs.push('Please select your marital status.');
  if(!state.bumiputra) errs.push('Please answer the Bumiputra question.');
  if(!state.race.trim()) errs.push('Please enter your race.');
  return errs;
}

// SOCSO number auto-mirrors the NRIC field as the person types it, since for
// most Malaysian employees the two match. It stays editable — once the person
// types into the SOCSO field directly, we stop overwriting it from NRIC.
let socsoManuallyEdited = false;

// ============================================================================
// POST-HIRE ONBOARDING — multi-step wizard (one section at a time, matching
// the main application's UX) and a Salary Crediting form matching the
// actual company document exactly.
// ============================================================================

const ONBOARDING_STEPS = ['statutory','spouse_children','emergency_beneficiary','salary','review'];

let onboardingAppId = null;
let onboardingState = null;
let onboardingStep = 'statutory';

async function openOnboarding(applicationId){
  showLoading('Loading onboarding forms...');
  try{
    const { data, error } = await supabaseClient.rpc('rpc_get_my_onboarding', { p_application_id: applicationId });
    if(error) throw error;
    onboardingAppId = applicationId;
    onboardingState = data[0];
    onboardingStep = onboardingState.status === 'completed' ? 'review' : 'statutory';
    // If a salary account no. was already saved and differs from the bank
    // account no., the candidate deliberately diverged them — don't clobber
    // that on reopening.
    salaryAccountManuallyEdited = !!(onboardingState.salary_account_no && onboardingState.salary_account_no !== onboardingState.bank_account_no);
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
      spouse_name: document.getElementById('ob_spouse_name')?.value.trim() || '',
      spouse_nric: document.getElementById('ob_spouse_nric')?.value.trim() || '',
      spouse_date_of_birth: document.getElementById('ob_spouse_dob')?.value || '',
      spouse_working: document.querySelector('input[name="ob_spouse_working"]:checked')?.value || '',
      children_below_18: onboardingState.children_below_18,
      children_18_to_23: onboardingState.children_18_to_23,
      emergency_contacts: onboardingState.emergency_contacts,
      beneficiary_name: document.getElementById('ob_beneficiary_name')?.value.trim() || '',
      beneficiary_relationship: document.getElementById('ob_beneficiary_relationship')?.value.trim() || '',
      beneficiary_contact: document.getElementById('ob_beneficiary_contact')?.value.trim() || '',
      tp3_data: onboardingState.tp3_data,
      salary_company: document.querySelector('input[name="ob_salary_company"]:checked')?.value || onboardingState.salary_company || '',
      salary_bank: document.getElementById('ob_salary_bank')?.value.trim() || '',
      salary_account_no: document.getElementById('ob_salary_account_no')?.value.trim() || '',
      salary_ic_submitted: document.getElementById('ob_salary_ic')?.value.trim() || ''
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
    const { data, error } = await supabaseClient.rpc('rpc_save_my_onboarding', { p_application_id: onboardingAppId, p_patch: patch });
    if(error) throw error;
    onboardingState = data[0];
    if(showAlert) alert('Saved.');
    return true;
  } catch(e){ alert('Error saving: ' + e.message); return false; }
}

async function onboardingGoStep(step){
  const ok = await saveOnboarding(false);
  if(ok){ onboardingStep = step; render(); window.scrollTo(0,0); }
}

// Applies the annual limit cap live as the candidate types, updating the
// field in place (no full re-render) so typing doesn't lose focus.
function addChildBelow18(){ onboardingState.children_below_18 = [...onboardingState.children_below_18, {name:'',gender:'',nric:'',date_of_birth:'',course_name:'',tax_relief:false}]; render(); }
function removeChildBelow18(i){ onboardingState.children_below_18.splice(i,1); render(); }
function updateChildBelow18(i, key, val){ onboardingState.children_below_18[i][key] = val; }

function addChild18to23(){ onboardingState.children_18_to_23 = [...onboardingState.children_18_to_23, {name:'',date_of_birth:'',course_name:'',gender:'',nric:'',tax_relief:false}]; render(); }
function removeChild18to23(i){ onboardingState.children_18_to_23.splice(i,1); render(); }
function updateChild18to23(i, key, val){ onboardingState.children_18_to_23[i][key] = val; }

function handleSpouseNricInput(val){
  onboardingState.spouse_nric = val;
  const derivedDob = deriveDobFromNric(val);
  if(derivedDob){
    onboardingState.spouse_date_of_birth = derivedDob;
    const dobEl = document.getElementById('ob_spouse_dob');
    if(dobEl) dobEl.value = derivedDob; // update in place, no full re-render (keeps focus while typing)
  }
}

function handleChildBelow18NricInput(i, val){
  updateChildBelow18(i, 'nric', val);
  const derivedDob = deriveDobFromNric(val);
  if(derivedDob){
    onboardingState.children_below_18[i].date_of_birth = derivedDob;
    const dobEl = document.getElementById(`childBelow18Dob${i}`);
    if(dobEl) dobEl.value = derivedDob;
  }
}

function handleChild18to23NricInput(i, val){
  updateChild18to23(i, 'nric', val);
  const derivedDob = deriveDobFromNric(val);
  if(derivedDob){
    onboardingState.children_18_to_23[i].date_of_birth = derivedDob;
    const dobEl = document.getElementById(`child18to23Dob${i}`);
    if(dobEl) dobEl.value = derivedDob;
  }
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

async function confirmOnboardingSection(section){
  await saveOnboarding(false);
  try{
    const { data, error } = await supabaseClient.rpc('rpc_confirm_onboarding_section', { p_application_id: onboardingAppId, p_section: section });
    if(error) throw error;
    onboardingState = data[0];
    // TP3 has been removed from the candidate-facing flow entirely, but the
    // server-side "all sections confirmed → completed" logic may still
    // expect it — so it's silently confirmed the moment personal_details
    // is, with no UI ever shown for it. This avoids needing to touch
    // rpc_confirm_onboarding_section's internal completion logic.
    if(section === 'personal_details' && !onboardingState.tp3_confirmed){
      const { data: tp3Data, error: tp3Error } = await supabaseClient.rpc('rpc_confirm_onboarding_section', { p_application_id: onboardingAppId, p_section: 'tp3' });
      if(!tp3Error) onboardingState = tp3Data[0];
    }
    if(onboardingState.status === 'completed') onboardingStep = 'review';
    render();
  } catch(e){ alert('Error: ' + e.message); }
}

function backFromOnboarding(){
  onboardingAppId = null; onboardingState = null; onboardingStep = 'statutory';
  salaryAckChecked = false; salaryAccountManuallyEdited = false;
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
    spouse_children: tplObSpouseChildren,
    emergency_beneficiary: tplObEmergencyBeneficiary,
    salary: tplObSalary
  };
  return `
    <div class="step-eyebrow">Onboarding</div>
    <h2>Post-Hire Details</h2>
    ${obProgressBar()}
    ${stepMap[onboardingStep]()}
    <div style="text-align:center;margin-top:18px;">
      <button class="link-btn" onclick="saveAndExitOnboarding()">Save &amp; Exit — continue later</button>
    </div>
  `;
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
      <div class="field"><label>EPF No.</label><input type="text" id="ob_epf_no" value="${esc(o.epf_no)}"></div>
      <div class="field"><label>SOCSO No.</label><input type="text" id="ob_socso_no" value="${esc(o.socso_no)}"></div>
    </div>
    <div class="grid">
      <div class="field"><label>Income Tax No.</label><input type="text" id="ob_income_tax_no" value="${esc(o.income_tax_no)}"></div>
      <div class="field"><label>Tax Branch</label><input type="text" id="ob_tax_branch" value="${esc(o.tax_branch)}"></div>
    </div>
    <div class="grid">
      <div class="field"><label>Bank Account No.</label><input type="text" id="ob_bank_account_no" value="${esc(o.bank_account_no)}" oninput="mirrorSalaryAccountNo(this.value)"></div>
      <div class="field"><label>CIDB Green Card No.</label><input type="text" id="ob_cidb_green_card_no" placeholder="e.g. N/A" value="${esc(o.cidb_green_card_no)}"></div>
    </div>

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="backFromOnboarding()">← Back to My Applications</button>
      <div class="right"><button class="btn btn-primary" onclick="onboardingGoStep('spouse_children')">Next →</button></div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// STEP 2: Spouse + Children
// ---------------------------------------------------------------------------
function tplObSpouseChildren(){
  const o = onboardingState;
  return `
    <div class="section-title" style="margin-top:0;">Spouse Information <span class="opt-tag">(if applicable)</span></div>
    <div class="grid">
      <div class="field"><label>Name (per NRIC)</label><input type="text" id="ob_spouse_name" value="${esc(o.spouse_name)}"></div>
      <div class="field"><label>NRIC No. (without dash)</label><input type="text" id="ob_spouse_nric" value="${esc(o.spouse_nric)}" oninput="handleSpouseNricInput(this.value)"></div>
    </div>
    <div class="grid">
      <div class="field"><label>Date of Birth</label><input type="date" id="ob_spouse_dob" value="${esc(o.spouse_date_of_birth)}"></div>
      <div class="field"><label>Working?</label>
        <div class="radio-row">
          ${['Yes','No'].map(v=>`<label class="radio-opt"><input type="radio" name="ob_spouse_working" value="${v}" ${o.spouse_working===v?'checked':''}> ${v}</label>`).join('')}
        </div>
      </div>
    </div>

    <div class="section-title">Children Below 18 Years Old</div>
    <table class="dyn">
      <thead><tr><th>Name (per NRIC)</th><th>Gender</th><th>NRIC No. (no dash)</th><th>Date of Birth</th><th>Education</th><th>Tax Relief</th><th></th></tr></thead>
      <tbody>
        ${o.children_below_18.map((c,i)=>`
          <tr>
            <td><input type="text" value="${esc(c.name)}" oninput="updateChildBelow18(${i},'name',this.value)"></td>
            <td>
              <select onchange="updateChildBelow18(${i},'gender',this.value)">
                <option value="">—</option>
                <option ${c.gender==='Male'?'selected':''}>Male</option>
                <option ${c.gender==='Female'?'selected':''}>Female</option>
              </select>
            </td>
            <td><input type="text" value="${esc(c.nric)}" oninput="handleChildBelow18NricInput(${i}, this.value)"></td>
            <td><input type="date" id="childBelow18Dob${i}" value="${esc(c.date_of_birth)}" oninput="updateChildBelow18(${i},'date_of_birth',this.value)"></td>
            <td><select onchange="updateChildBelow18(${i},'course_name',this.value)">${childEducationOptionsHtml(c.course_name)}</select></td>
            <td style="text-align:center;"><input type="checkbox" ${c.tax_relief?'checked':''} onchange="updateChildBelow18(${i},'tax_relief',this.checked)"></td>
            <td><button class="remove-x" onclick="removeChildBelow18(${i})">✕</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <button class="add-row-btn" onclick="addChildBelow18()">+ Add child</button>

    <div class="section-title">Children Above 18 Up To 23 <span class="opt-tag">(unmarried &amp; full-time student)</span></div>
    <table class="dyn">
      <thead><tr><th>Name</th><th>Gender</th><th>NRIC No. (no dash)</th><th>Date of Birth</th><th>Education</th><th>Tax Relief</th><th></th></tr></thead>
      <tbody>
        ${o.children_18_to_23.map((c,i)=>`
          <tr>
            <td><input type="text" value="${esc(c.name)}" oninput="updateChild18to23(${i},'name',this.value)"></td>
            <td>
              <select onchange="updateChild18to23(${i},'gender',this.value)">
                <option value="">—</option>
                <option ${c.gender==='Male'?'selected':''}>Male</option>
                <option ${c.gender==='Female'?'selected':''}>Female</option>
              </select>
            </td>
            <td><input type="text" value="${esc(c.nric)}" oninput="handleChild18to23NricInput(${i}, this.value)"></td>
            <td><input type="date" id="child18to23Dob${i}" value="${esc(c.date_of_birth)}" oninput="updateChild18to23(${i},'date_of_birth',this.value)"></td>
            <td><select onchange="updateChild18to23(${i},'course_name',this.value)">${childEducationOptionsHtml(c.course_name)}</select></td>
            <td style="text-align:center;"><input type="checkbox" ${c.tax_relief?'checked':''} onchange="updateChild18to23(${i},'tax_relief',this.checked)"></td>
            <td><button class="remove-x" onclick="removeChild18to23(${i})">✕</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <button class="add-row-btn" onclick="addChild18to23()">+ Add child</button>

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="onboardingGoStep('statutory')">← Back</button>
      <div class="right"><button class="btn btn-primary" onclick="onboardingGoStep('emergency_beneficiary')">Next →</button></div>
    </div>
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
            <td><input type="tel" placeholder="e.g. 012-345 6789" value="${esc(c.contact)}" oninput="updateEmergencyContact(${i},'contact',this.value)"></td>
            <td><button class="remove-x" onclick="removeEmergencyContact(${i})">✕</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <button class="add-row-btn" onclick="addEmergencyContact()">+ Add contact</button>

    <div class="section-title">Beneficiary (Next of Kin)</div>
    <div class="grid g3">
      <div class="field"><label>Name</label><input type="text" id="ob_beneficiary_name" value="${esc(o.beneficiary_name)}"></div>
      <div class="field"><label>Relationship</label><input type="text" id="ob_beneficiary_relationship" value="${esc(o.beneficiary_relationship)}"></div>
      <div class="field"><label>Contact No.</label><input type="tel" placeholder="e.g. 012-345 6789" id="ob_beneficiary_contact" value="${esc(o.beneficiary_contact)}"></div>
    </div>

    <div class="checkbox-row">
      <input type="checkbox" id="confirm_personal_details" ${o.personal_details_confirmed?'checked disabled':''} onchange="if(this.checked) confirmOnboardingSection('personal_details')">
      <label for="confirm_personal_details">I confirm the Statutory Details, Spouse, Children, Emergency Contact and Beneficiary information above is true and correct.</label>
      ${o.personal_details_confirmed ? `<div class="hint" style="margin-left:auto;">Confirmed ${new Date(o.personal_details_confirmed_at).toLocaleString()}</div>` : ''}
    </div>

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="onboardingGoStep('spouse_children')">← Back</button>
      <div class="right"><button class="btn btn-primary" ${o.personal_details_confirmed ? '' : 'disabled'} onclick="onboardingGoStep('salary')">Next →</button></div>
    </div>
    ${!o.personal_details_confirmed ? `<p class="hint" style="text-align:right;margin-top:6px;">Please check the confirmation box above to continue.</p>` : ''}
  `;
}

// ---------------------------------------------------------------------------
// STEP 4: Salary Crediting Requisition Form — matches the actual document
// ---------------------------------------------------------------------------
let salaryAckChecked = false; // local-only acknowledgment; the real, final
// confirmation happens on the Review Before Submitting page via
// submitOnboarding() — this checkbox just gates getting to that page, it
// does not itself lock anything in.
let salaryAccountManuallyEdited = false; // once the candidate edits the
// Salary Account No. field directly, stop overwriting it from Bank Account
// No. — same guard pattern as the SOCSO/NRIC auto-mirror above.

function mirrorSalaryAccountNo(val){
  if(!salaryAccountManuallyEdited && onboardingState){
    onboardingState.salary_account_no = val;
  }
}
function handleSalaryAccountManualEdit(val){
  salaryAccountManuallyEdited = true;
  if(onboardingState) onboardingState.salary_account_no = val;
}

function tplObSalary(){
  const o = onboardingState;
  const companies = ['WCT Berhad', 'WCT Construction Sdn Bhd', 'WCT Machinery Sdn Bhd', 'Intraxis Engineering Sdn Bhd'];
  return `
    <div class="section-title" style="margin-top:0;">Salary Crediting Requisition Form</div>
    <p class="step-desc">To: Human Resources Department</p>

    <div class="field">
      <label>Which company are you employed under? <span class="req-star">*</span></label>
      <div class="radio-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
        ${companies.map(c=>`<label class="radio-opt"><input type="radio" name="ob_salary_company" value="${c}" ${o.salary_company===c?'checked':''}> ${c}</label>`).join('')}
      </div>
    </div>

    <p style="font-size:13.5px;">Please be informed that I hereby agree that my salary is to be paid through my bank account as follows:</p>

    <div class="field"><label>Bank</label><input type="text" placeholder="e.g. Maybank" id="ob_salary_bank" value="${esc(o.salary_bank)}"></div>
    <div class="grid">
      <div class="field">
        <label>Account No.</label>
        <input type="text" id="ob_salary_account_no" value="${esc(o.salary_account_no)}" oninput="handleSalaryAccountManualEdit(this.value)">
        <div class="hint">Pre-filled from the Bank Account No. you entered in Statutory Details — edit here if it's different.</div>
      </div>
      <div class="field"><label>IC/Passport No. Submitted During Application</label><input type="text" id="ob_salary_ic" value="${esc(o.salary_ic_submitted || state.nric_new || state.passport_number)}"></div>
    </div>

    <p style="font-size:12.5px;color:var(--ink-soft);">I confirm that the information herein is correct and in order. Should there be any discrepancy in the information, which will lead to possible delay or inability to credit my salaries, it is my sole responsibility.<br><br>
    <em>Saya mengesahkan maklumat tersebut diatas adalah betul dan teratur. Sebarang perbezaan dalam maklumat tersebut, yang mungkin mengakibatkan kelewatan ataupun ketidakmasukan gaji, adalah tanggungjawab saya sendiri.</em></p>

    <div class="checkbox-row">
      <input type="checkbox" id="confirm_salary_crediting" ${salaryAckChecked?'checked':''} onchange="salaryAckChecked=this.checked;render();">
      <label for="confirm_salary_crediting">I confirm the above information is correct.</label>
    </div>

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="onboardingGoStep('emergency_beneficiary')">← Back</button>
      <div class="right"><button class="btn btn-primary" ${salaryAckChecked ? '' : 'disabled'} onclick="onboardingGoStep('preview')">Review Before Submitting →</button></div>
    </div>
    ${!salaryAckChecked ? `<p class="hint" style="text-align:right;margin-top:6px;">Please check the confirmation box above to continue.</p>` : ''}
  `;
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
    </div>

    <div class="review-block">
      <h4>Spouse Information</h4>
      ${obReviewRow('Name', o.spouse_name)}
      ${obReviewRow('NRIC', o.spouse_nric)}
      ${obReviewRow('Date of Birth', o.spouse_date_of_birth)}
      ${obReviewRow('Working', o.spouse_working)}
    </div>

    <div class="review-block">
      <h4>Children Below 18</h4>
      ${(o.children_below_18||[]).map(c=>obReviewRow(c.name||'Unnamed', `${c.gender||'—'} · NRIC: ${c.nric||'—'} · DOB: ${c.date_of_birth||'—'} · Education: ${c.course_name||'—'} · Tax Relief: ${c.tax_relief?'Yes':'No'}`)).join('') || obReviewRow('Children','None')}
    </div>

    <div class="review-block">
      <h4>Children 18–23 (Unmarried, Full-Time Student)</h4>
      ${(o.children_18_to_23||[]).map(c=>obReviewRow(c.name||'Unnamed', `${c.gender||'—'} · NRIC: ${c.nric||'—'} · DOB: ${c.date_of_birth||'—'} · Education: ${c.course_name||'—'} · Tax Relief: ${c.tax_relief?'Yes':'No'}`)).join('') || obReviewRow('Children','None')}
    </div>

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
  return `
    ${obSummaryPage1Html(o)}
    <div class="review-block">
      <h4>Salary Crediting</h4>
      ${obReviewRow('Company', o.salary_company)}
      ${obReviewRow('Bank', o.salary_bank)}
      ${obReviewRow('Account No.', o.salary_account_no)}
      ${obReviewRow('IC/Passport No. Submitted', o.salary_ic_submitted)}
    </div>
  `;
}

function tplObPreview(){
  const o = onboardingState;
  return `
    <div class="step-eyebrow">Onboarding</div>
    <h2>Review Before Submitting</h2>
    <p class="step-desc">Please check everything below carefully. Once you submit, your onboarding record will be marked complete and HR will be notified — you won't be able to edit it afterward.</p>

    ${obSummaryHtml(o)}

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="onboardingGoStep('salary')">← Back to Edit</button>
      <div class="right"><button class="btn btn-primary" onclick="submitOnboarding()">Submit &amp; Complete Onboarding →</button></div>
    </div>
  `;
}

async function submitOnboarding(){
  const ok = await saveOnboarding(false);
  if(!ok) return;
  try{
    const { data, error } = await supabaseClient.rpc('rpc_confirm_onboarding_section', { p_application_id: onboardingAppId, p_section: 'salary_crediting' });
    if(error) throw error;
    onboardingState = data[0];
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
      <div></div>
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

function handleNricChange(val){
  state.nric_new = val;

  // 12-digit validation (Malaysian NRIC is always exactly 12 digits, no letters)
  const digits = val.replace(/[^0-9]/g, '');
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
    const dobEl = document.getElementById('dobInput');
    const ageEl = document.getElementById('ageInput');
    if(dobEl) dobEl.value = derivedDob;
    if(ageEl) ageEl.value = age;
  }

  if(!socsoManuallyEdited){
    state.socso_no = val;
    const socsoEl = document.getElementById('socsoInput');
    if(socsoEl) socsoEl.value = val; // update in place, no full re-render (keeps focus while typing)
  }
}
function handleSocsoManualEdit(val){
  socsoManuallyEdited = true;
  state.socso_no = val;
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
function tplLanguage(){
  const rows = state.language_ability.map((r,i)=>`
    <tr>
      <td><input type="text" value="${esc(r.language)}" oninput="updateArrayField('language_ability',${i},'language',this.value)"></td>
      <td>${selectGFS(r.spoken, `updateArrayField('language_ability',${i},'spoken',this.value)`)}</td>
      <td>${selectGFS(r.written, `updateArrayField('language_ability',${i},'written',this.value)`)}</td>
    </tr>`).join('');
  return `
    <div class="step-eyebrow">Step 2 of 8</div>
    <h2>Language Ability</h2>
    <p class="step-desc">Rate your spoken and written ability for each language.</p>
    <table class="dyn">
      <thead><tr><th>Language / Dialect</th><th>Spoken</th><th>Written</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <button class="add-row-btn" onclick="addLangRow()">+ Add another language</button>
    ${navButtons('personal','education')}
  `;
}
function selectGFS(val, onchangeFn){
  return `<select onchange="${onchangeFn}"><option value="">—</option>${['Good','Fair','Slight'].map(o=>`<option ${val===o?'selected':''}>${o}</option>`).join('')}</select>`;
}
function addLangRow(){ state.language_ability.push({language:'',spoken:'',written:''}); render(); }

// ---------------------------------------------------------------------------
// STEP: education
// ---------------------------------------------------------------------------
function educationOptionsHtml(selected){
  return `<option value="">Select</option>` + HIGHEST_EDUCATION_OPTIONS.map(o=>`<option ${selected===o?'selected':''}>${o}</option>`).join('');
}

function tplEducation(){
  const rows = state.education.map((r,i)=>`
    <tr>
      <td style="min-width:130px;">
        <select onchange="updateArrayField('education',${i},'type',this.value)">
          ${['School','College/University','Professional Body'].map(o=>`<option ${r.type===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </td>
      <td><input type="text" placeholder="Institution name" value="${esc(r.name)}" oninput="updateArrayField('education',${i},'name',this.value)"></td>
      <td style="width:80px;"><input type="text" placeholder="From" value="${esc(r.from_year)}" oninput="updateArrayField('education',${i},'from_year',this.value)"></td>
      <td style="width:80px;"><input type="text" placeholder="To" value="${esc(r.to_year)}" oninput="updateArrayField('education',${i},'to_year',this.value)"></td>
      <td style="min-width:170px;"><select onchange="updateArrayField('education',${i},'qualification',this.value)">${educationOptionsHtml(r.qualification)}</select></td>
      <td style="min-width:150px;"><input type="text" placeholder="e.g. n/a" value="${esc(r.course_name)}" oninput="updateArrayField('education',${i},'course_name',this.value)"></td>
      <td><button class="remove-x" onclick="removeRow('education',${i})">✕</button></td>
    </tr>`).join('');
  return `
    <div class="step-eyebrow">Step 3 of 8</div>
    <h2>Education</h2>
    <p class="step-desc">Add your school, college/university, and any professional body memberships.</p>

    <table class="dyn">
      <thead><tr><th>Type</th><th>Institution</th><th>From</th><th>To</th><th>Qualification</th><th>Course Name</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <button class="add-row-btn" onclick="addEduRow()">+ Add education entry</button>
    ${navButtonsValidated('language','experience', validateEducationStep)}
  `;
}
function validateEducationStep(){
  const errs = [];
  state.education.forEach((r,i)=>{
    if(!r.name.trim()) errs.push(`Education entry ${i+1}: please enter the institution name.`);
    if(!r.qualification) errs.push(`Education entry ${i+1}: please select a qualification.`);
  });
  return errs;
}
function addEduRow(){ state.education.push({type:'School',name:'',from_year:'',to_year:'',qualification:'',course_name:''}); render(); }

// ---------------------------------------------------------------------------
// STEP: working experience
// ---------------------------------------------------------------------------
function tplExperience(){
  const rows = state.working_experience.map((r,i)=>`
    <div class="card" style="padding:18px;margin-bottom:14px;border-color:#E4E4E3;">
      <div class="grid">
        <div class="field"><label>Employer Name &amp; Address <span class="req-star">*</span></label><textarea placeholder="e.g. n/a" oninput="updateArrayField('working_experience',${i},'employer',this.value)">${esc(r.employer)}</textarea></div>
        <div class="field"><label>Last Position Held <span class="req-star">*</span></label><input type="text" placeholder="e.g. n/a" value="${esc(r.position)}" oninput="updateArrayField('working_experience',${i},'position',this.value)"></div>
      </div>
      <div class="grid">
        <div class="field"><label>From <span class="req-star">*</span></label><input type="month" value="${esc(r.from)}" oninput="updateArrayField('working_experience',${i},'from',this.value)"></div>
        <div class="field">
          <label>To ${r.is_current ? '' : '<span class="req-star">*</span>'}</label>
          <input type="month" value="${esc(r.to)}" ${r.is_current?'disabled':''} style="${r.is_current?'background:#F0F0EE;color:var(--ink-soft);':''}" oninput="updateArrayField('working_experience',${i},'to',this.value)">
        </div>
      </div>
      <label class="radio-opt" style="margin:-8px 0 14px;"><input type="checkbox" ${r.is_current?'checked':''} onchange="toggleCurrentJob(${i}, this.checked)"> I am currently working here</label>
      <div class="grid">
        <div class="field"><label>Last Drawn Remuneration (Monthly) — RM <span class="req-star">*</span></label><input type="text" placeholder="e.g. 3000 or n/a" value="${esc(r.remuneration)}" oninput="updateArrayField('working_experience',${i},'remuneration',this.value)"></div>
        <div></div>
      </div>
      <div class="field"><label>Job Responsibilities <span class="req-star">*</span></label><textarea placeholder="e.g. n/a" oninput="updateArrayField('working_experience',${i},'responsibilities',this.value)">${esc(r.responsibilities)}</textarea></div>
      <button class="btn-danger-outline" onclick="removeRow('working_experience',${i})">Remove this entry</button>
    </div>`).join('');
  return `
    <div class="step-eyebrow">Step 4 of 8</div>
    <h2>Working Experience / Achievement</h2>
    <p class="step-desc">Please complete this even if a resume/CV is attached. You'll be able to attach your CV in a later step.</p>
    ${rows}
    <button class="add-row-btn" onclick="addExpRow()">+ Add work experience</button>
    ${navButtonsValidated('education','questions', validateExperienceStep)}
  `;
}
function toggleCurrentJob(i, checked){
  state.working_experience[i].is_current = checked;
  if(checked) state.working_experience[i].to = '';
  render();
}
function validateExperienceStep(){
  const errs = [];
  state.working_experience.forEach((r,i)=>{
    if(!r.employer.trim()) errs.push(`Work experience ${i+1}: please enter the employer name and address.`);
    if(!r.position.trim()) errs.push(`Work experience ${i+1}: please enter the last position held.`);
    if(!r.from) errs.push(`Work experience ${i+1}: please provide the "From" month/year.`);
    if(!r.is_current && !r.to) errs.push(`Work experience ${i+1}: please provide the "To" month/year, or tick "I am currently working here".`);
    if(!r.remuneration.trim()) errs.push(`Work experience ${i+1}: please enter the last drawn remuneration.`);
  });
  return errs;
}
function addExpRow(){ state.working_experience.push({employer:'',from:'',to:'',is_current:false,position:'',remuneration:'',responsibilities:''}); render(); }
function removeRow(arr, idx){ state[arr].splice(idx,1); render(); }

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
  if(!state.resignation_notice_required) errs.push('Please answer whether resignation notice is required.');
  if(state.resignation_notice_required==='Yes' && !state.notice_period.trim()) errs.push('Notice period is required when resignation notice is required.');
  if(!state.date_available_to_start) errs.push('Please provide your available start date.');
  if(!state.expected_basic_salary.trim()) errs.push('Please provide your expected basic salary.');
  if(!state.relatives_in_company) errs.push('Please answer the relatives/friends question.');
  if(!state.own_transport_motorcar) errs.push('Please answer the motorcar transport question.');
  if(!state.own_transport_motorcycle) errs.push('Please answer the motorcycle transport question.');
  if(!state.willing_based_outside_klang_valley) errs.push('Please answer the outside-Klang-Valley question.');
  if(!state.physical_defects) errs.push('Please answer the physical defects question.');
  if(!state.arrested_convicted) errs.push('Please answer the arrests/convictions question.');
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
    <div class="step-eyebrow">Step 5 of 8</div>
    <h2>Employment Questions</h2>

    <div class="grid">
      <div class="field"><label>Is resignation notice required? <span class="req-star">*</span></label>
        <div class="radio-row">
          ${['Yes','No'].map(o=>`<label class="radio-opt"><input type="radio" name="resignation_notice_required" ${state.resignation_notice_required===o?'checked':''} onchange="handleResignationChange('${o}')"> ${o}</label>`).join('')}
        </div>
      </div>
      ${state.resignation_notice_required==='Yes' ? `
        <div class="field"><label>Notice Period <span class="req-star">*</span></label><input type="text" placeholder="e.g. 1 month" value="${esc(state.notice_period)}" oninput="updateField('notice_period', this.value)"></div>
      ` : `<div></div>`}
    </div>
    <div class="grid">
      <div class="field"><label>Date Available to Start Work <span class="req-star">*</span></label><input type="date" value="${esc(state.date_available_to_start)}" oninput="updateField('date_available_to_start', this.value)"></div>
      <div class="field"><label>Expected Basic Salary (per month) — RM <span class="req-star">*</span></label><input type="text" placeholder="e.g. 4500" value="${esc(state.expected_basic_salary)}" oninput="updateField('expected_basic_salary', this.value)"></div>
    </div>

    <div class="section-title">Additional Questions</div>
    <div class="field"><label>Any relatives or friends working in this Company or its subsidiaries? <span class="req-star">*</span></label>${yesNo('relatives_in_company', state.relatives_in_company, true)}</div>
    ${state.relatives_in_company==='Yes' ? `
      <div class="grid">
        <div class="field"><label>Name <span class="req-star">*</span></label><input type="text" value="${esc(state.relatives_name)}" oninput="updateField('relatives_name', this.value)"></div>
        <div class="field"><label>Relationship <span class="req-star">*</span></label><input type="text" value="${esc(state.relatives_relationship)}" oninput="updateField('relatives_relationship', this.value)"></div>
      </div>` : ''}

    <div class="grid">
      <div class="field"><label>Own transport — Motorcar? <span class="req-star">*</span></label>${yesNo('own_transport_motorcar', state.own_transport_motorcar, true)}</div>
      <div class="field"><label>Own transport — Motorcycle? <span class="req-star">*</span></label>${yesNo('own_transport_motorcycle', state.own_transport_motorcycle, true)}</div>
    </div>

    <div class="field"><label>Willing to be based at branches / site offices outside Klang Valley and/or overseas? <span class="req-star">*</span></label>${yesNo('willing_based_outside_klang_valley', state.willing_based_outside_klang_valley, true)}</div>

    <div class="field"><label>Do you have any physical defects, disabilities, or long-term illnesses? <span class="req-star">*</span></label>${yesNo('physical_defects', state.physical_defects, true)}</div>
    ${state.physical_defects==='Yes' ? `<div class="field"><label>Please specify <span class="req-star">*</span></label><textarea oninput="updateField('physical_defects_specify', this.value)">${esc(state.physical_defects_specify)}</textarea></div>` : ''}

    <div class="field"><label>Have you been arrested or convicted of any offence? <span class="req-star">*</span></label>${yesNo('arrested_convicted', state.arrested_convicted, true)}</div>
    ${state.arrested_convicted==='Yes' ? `<div class="field"><label>Please specify <span class="req-star">*</span></label><textarea oninput="updateField('arrested_convicted_specify', this.value)">${esc(state.arrested_convicted_specify)}</textarea></div>` : ''}

    ${navButtonsValidated('experience','referees', validateQuestionsStep)}
  `;
}

// ---------------------------------------------------------------------------
// STEP: referees & declarations
// ---------------------------------------------------------------------------
function tplReferees(){
  return `
    <div class="step-eyebrow">Step 6 of 8</div>
    <h2>Referees &amp; Declarations</h2>
    <p class="step-desc">Please give two referees whose reference can be obtained on your application.</p>

    <div class="grid">
      <fieldset>
        <legend>Referee 1 <span class="req-star">*</span></legend>
        <div class="field"><label>Name <span class="req-star">*</span></label><input type="text" placeholder="e.g. John Tan" value="${esc(state.referee1.name)}" oninput="updateNested(state.referee1,'name',this.value)"></div>
        <div class="field"><label>Designation <span class="req-star">*</span></label><input type="text" placeholder="e.g. Project Manager" value="${esc(state.referee1.designation)}" oninput="updateNested(state.referee1,'designation',this.value)"></div>
        <div class="field"><label>Relationship <span class="req-star">*</span></label><input type="text" placeholder="e.g. Ex-supervisor" value="${esc(state.referee1.relationship)}" oninput="updateNested(state.referee1,'relationship',this.value)"></div>
        <div class="field"><label>Contact No. <span class="req-star">*</span></label><input type="text" placeholder="e.g. 012-345 6789" value="${esc(state.referee1.contact)}" oninput="updateNested(state.referee1,'contact',this.value)"></div>
      </fieldset>
      <fieldset>
        <legend>Referee 2 <span class="req-star">*</span></legend>
        <div class="field"><label>Name <span class="req-star">*</span></label><input type="text" placeholder="e.g. Jane Lim" value="${esc(state.referee2.name)}" oninput="updateNested(state.referee2,'name',this.value)"></div>
        <div class="field"><label>Designation <span class="req-star">*</span></label><input type="text" placeholder="e.g. HR Manager" value="${esc(state.referee2.designation)}" oninput="updateNested(state.referee2,'designation',this.value)"></div>
        <div class="field"><label>Relationship <span class="req-star">*</span></label><input type="text" placeholder="e.g. Colleague" value="${esc(state.referee2.relationship)}" oninput="updateNested(state.referee2,'relationship',this.value)"></div>
        <div class="field"><label>Contact No. <span class="req-star">*</span></label><input type="text" placeholder="e.g. 012-987 6543" value="${esc(state.referee2.contact)}" oninput="updateNested(state.referee2,'contact',this.value)"></div>
      </fieldset>
    </div>

    <div class="section-title">Declarations</div>
    <p style="font-size:13px;line-height:1.6;">I declare that the statement made by me to the foregoing question are true, complete and correct to the best of my knowledge and belief. Permission is given to the Company to make such investigations as and when necessary on the information given above. I understand that my misrepresentation or material omission made herein or on any other documents requested by the Company, will render dismissal or termination of my employment with the Company.</p>

    <div class="field">
      <label>(B) I declare that save and except for the following I am not involved in, a party to nor the subject of any law suits, arbitral proceedings, disciplinary proceedings, criminal inquiry, investigation and/or conviction and/or any other legal or quasi-legal proceedings. <span class="req-star">*</span></label>
      <div class="radio-row">
        <label class="radio-opt"><input type="radio" name="declaration_lawsuit" value="Yes" ${state.declaration_lawsuit==='Yes'?'checked':''} onchange="updateField('declaration_lawsuit', this.value)"> Yes</label>
        <label class="radio-opt"><input type="radio" name="declaration_lawsuit" value="No" ${state.declaration_lawsuit==='No'?'checked':''} onchange="updateField('declaration_lawsuit', this.value)"> No</label>
      </div>
    </div>
    ${state.declaration_lawsuit==='Yes' ? `<div class="field"><label>Please specify <span class="req-star">*</span></label><textarea oninput="updateField('declaration_lawsuit_specify', this.value)">${esc(state.declaration_lawsuit_specify)}</textarea><div class="hint">Add an attachment on the next step if you need more space.</div></div>` : ''}

    <div class="field">
      <label>(C) I declare that save and except for the following I am not aware of any matter or information that may affect my personal and/or professional public standing or repute or that might adversely affect your consideration of my application for employment. <span class="req-star">*</span></label>
      <div class="radio-row">
        <label class="radio-opt"><input type="radio" name="declaration_other_matters" value="Yes" ${state.declaration_other_matters==='Yes'?'checked':''} onchange="updateField('declaration_other_matters', this.value)"> Yes</label>
        <label class="radio-opt"><input type="radio" name="declaration_other_matters" value="No" ${state.declaration_other_matters==='No'?'checked':''} onchange="updateField('declaration_other_matters', this.value)"> No</label>
      </div>
    </div>
    ${state.declaration_other_matters==='Yes' ? `<div class="field"><label>Please specify <span class="req-star">*</span></label><textarea oninput="updateField('declaration_other_matters_specify', this.value)">${esc(state.declaration_other_matters_specify)}</textarea><div class="hint">Add an attachment on the next step if you need more space.</div></div>` : ''}

    ${navButtonsValidated('questions','attachments', validateRefereesStep)}
  `;
}
function validateRefereesStep(){
  const errs = [];
  ['referee1','referee2'].forEach((key, idx)=>{
    const r = state[key];
    if(!r.name.trim()) errs.push(`Referee ${idx+1}: please enter a name.`);
    if(!r.designation.trim()) errs.push(`Referee ${idx+1}: please enter a designation.`);
    if(!r.relationship.trim()) errs.push(`Referee ${idx+1}: please enter your relationship to them.`);
    if(!r.contact.trim()) errs.push(`Referee ${idx+1}: please enter a contact number.`);
  });
  if(!state.declaration_lawsuit) errs.push('Please answer declaration (B) — lawsuits, proceedings, and investigations.');
  if(state.declaration_lawsuit==='Yes' && !state.declaration_lawsuit_specify.trim()) errs.push('Please specify the details for declaration (B).');
  if(!state.declaration_other_matters) errs.push('Please answer declaration (C) — matters affecting your standing.');
  if(state.declaration_other_matters==='Yes' && !state.declaration_other_matters_specify.trim()) errs.push('Please specify the details for declaration (C).');
  return errs;
}

// ---------------------------------------------------------------------------
// STEP: attachments & profile picture
// ---------------------------------------------------------------------------
function tplAttachments(){
  const attList = state.attachments.map((a,i)=>{
    const isImg = a.type && a.type.startsWith('image/');
    return `<div class="attach-item">
      <div class="attach-thumb">${isImg ? `<img src="${a.url}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">` : '📄'}</div>
      <div class="attach-name">${esc(a.name)}</div>
      <button class="remove-x" onclick="removeAttachment(${i})">Remove</button>
    </div>`;
  }).join('');

  return `
    <div class="step-eyebrow">Step 7 of 8</div>
    <h2>Attachments &amp; Passport Size Photo</h2>

    <div class="section-title" style="margin-top:0;">Passport Size Photo <span class="req-star">*</span></div>
    ${state.profile_picture_url ? `<img src="${state.profile_picture_url}" class="profile-preview">` : ''}
    <div class="upload-box" onclick="document.getElementById('profileInput').click()">
      <div style="font-size:14px;">📷 Click to ${state.profile_picture_url?'change':'upload'} your passport size photo</div>
      <div class="hint">JPG or PNG, clear passport-style photo recommended</div>
    </div>
    <input type="file" id="profileInput" accept="image/*" style="display:none" onchange="handleProfileUpload(this.files[0])">

    <div class="section-title">Supporting Documents</div>
    <p class="hint">Resume/CV, certificates, testimonials, IC copy (front and back), payslip, etc. Add attachments if you need more space than the form provides.</p>
    <div class="upload-box" onclick="document.getElementById('attachInput').click()">
      <div style="font-size:14px;">📎 Click to add a document</div>
      <div class="hint">PDF, JPG, PNG, or Word files</div>
    </div>
    <input type="file" id="attachInput" style="display:none" onchange="handleAttachmentUpload(this.files[0])">
    <div class="attach-list">${attList}</div>

    ${navButtonsValidated('referees','review', validateAttachmentsStep)}
  `;
}
function validateAttachmentsStep(){
  const errs = [];
  if(!state.profile_picture_url) errs.push('Please upload a passport size photo before continuing — it is required.');
  return errs;
}

// Supabase Storage rejects certain characters in file paths (spaces,
// parentheses, brackets, etc). We keep the original name for display in the
// attachment list, but the actual storage key uses a sanitized version.
function sanitizeFilename(name){
  const lastDot = name.lastIndexOf('.');
  const base = lastDot > -1 ? name.slice(0, lastDot) : name;
  const ext = lastDot > -1 ? name.slice(lastDot) : '';
  const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
  const safeExt = ext.replace(/[^a-zA-Z0-9.]+/g, '');
  return safeBase + safeExt;
}

async function handleProfileUpload(file){
  if(!file) return;
  showLoading('Uploading passport size photo...');
  try{
    const path = `${state.id}/profile_${Date.now()}_${sanitizeFilename(file.name)}`;
    const { error } = await supabaseClient.storage.from('profile-pictures').upload(path, file, {upsert:true});
    if(error) throw error;
    const { data } = supabaseClient.storage.from('profile-pictures').getPublicUrl(path);
    state.profile_picture_url = data.publicUrl;
  } catch(e){ alert('Upload failed: '+e.message); }
  hideLoading(); render();
}

async function handleAttachmentUpload(file){
  if(!file) return;
  showLoading('Uploading document...');
  try{
    const path = `${state.id}/${Date.now()}_${sanitizeFilename(file.name)}`;
    const { error } = await supabaseClient.storage.from('attachments').upload(path, file, {upsert:true});
    if(error) throw error;
    const { data } = supabaseClient.storage.from('attachments').getPublicUrl(path);
    state.attachments.push({name:file.name, url:data.publicUrl, type:file.type, uploaded_at:new Date().toISOString()});
  } catch(e){ alert('Upload failed: '+e.message); }
  hideLoading(); render();
}
function removeAttachment(i){ state.attachments.splice(i,1); render(); }

// ---------------------------------------------------------------------------
// STEP: review
// ---------------------------------------------------------------------------
function rrow(k,v){ return `<div class="review-row"><div class="k">${k}</div><div class="v">${esc(v)||'—'}</div></div>`; }
function reviewHeader(title, step){ return `<h4>${title} <span class="edit-link" onclick="goStep('${step}')">Edit</span></h4>`; }

function tplReview(){
  return `
    <div class="step-eyebrow">Step 8 of 8</div>
    <h2>Review Your Application</h2>
    <p class="step-desc">Please check every section carefully before proceeding to the consent forms. Reference number: <strong>${state.reference_no}</strong></p>

    <div class="review-block">
      ${reviewHeader('Position', 'start')}
      ${rrow('Business Unit', state.business_unit)}
      ${rrow('Position Applying', state.position_applying)}
    </div>

    <div class="review-block">
      ${reviewHeader('Personal Particulars', 'personal')}
      ${rrow('Name', state.name_nric)}
      ${rrow('Alias', state.alias)}
      ${rrow('Permanent Address', state.permanent_address+' '+state.permanent_postcode)}
      ${rrow('Correspondence Address', state.correspondence_address+' '+state.correspondence_postcode)}
      ${rrow('Mobile', state.mobile_phone)}
      ${rrow('Email', state.email)}
      ${rrow('NRIC', state.nric_new)}
      ${rrow('Date of Birth / Age', state.date_of_birth+' / '+state.age)}
      ${rrow('Marital Status', state.marital_status)}
      ${rrow('Race / Bumiputra', state.race+' / '+state.bumiputra)}
    </div>

    <div class="review-block">
      ${reviewHeader('Language Ability', 'language')}
      ${state.language_ability.map(r=>rrow(r.language, `Spoken: ${r.spoken||'—'}, Written: ${r.written||'—'}`)).join('')}
    </div>

    <div class="review-block">
      ${reviewHeader('Education', 'education')}
      ${state.education.map(r=>rrow(r.type, `${r.name} (${r.from_year}–${r.to_year}) — ${r.qualification}${r.course_name?' — '+r.course_name:''}`)).join('')}
    </div>

    <div class="review-block">
      ${reviewHeader('Working Experience', 'experience')}
      ${state.working_experience.map(r=>rrow(r.position||'Position', `${r.employer} (${r.from}–${r.is_current?'Present':r.to})`)).join('')}
    </div>

    <div class="review-block">
      ${reviewHeader('Employment Questions', 'questions')}
      ${rrow('Resignation Notice Required', state.resignation_notice_required)}
      ${rrow('Date Available to Start', state.date_available_to_start)}
      ${rrow('Expected Basic Salary', state.expected_basic_salary)}
      ${rrow('Relatives in Company', state.relatives_in_company)}
      ${rrow('Own Transport (Car / Motorcycle)', `${state.own_transport_motorcar} / ${state.own_transport_motorcycle}`)}
      ${rrow('Willing Outside Klang Valley', state.willing_based_outside_klang_valley)}
      ${rrow('Physical Defects', state.physical_defects)}
      ${rrow('Arrested / Convicted', state.arrested_convicted)}
    </div>

    <div class="review-block">
      ${reviewHeader('Referees & Declarations', 'referees')}
      ${rrow('Referee 1', `${state.referee1.name} — ${state.referee1.designation}`)}
      ${rrow('Referee 2', `${state.referee2.name} — ${state.referee2.designation}`)}
      ${rrow('Declaration (B) — Lawsuits/Proceedings', state.declaration_lawsuit==='Yes' ? `Yes — ${state.declaration_lawsuit_specify}` : state.declaration_lawsuit)}
      ${rrow('Declaration (C) — Other Matters', state.declaration_other_matters==='Yes' ? `Yes — ${state.declaration_other_matters_specify}` : state.declaration_other_matters)}
    </div>

    <div class="review-block">
      ${reviewHeader('Attachments', 'attachments')}
      <div class="file-thumb-row">
        <div class="k" style="width:44%;">Passport Size Photo</div>
        <div class="v" style="width:56%;">
          ${state.profile_picture_url
            ? `<img src="${state.profile_picture_url}" class="profile-thumb-lg">`
            : `<span style="color:var(--danger);">Not uploaded (required)</span>`}
        </div>
      </div>
      ${state.attachments.length ? state.attachments.map(f=>{
        const isImg = f.type && f.type.startsWith('image/');
        return `<div class="file-thumb-row">
          <div class="k" style="width:44%;"></div>
          <div class="v" style="width:56%;display:flex;align-items:center;gap:10px;">
            <span class="file-thumb">${isImg ? `<img src="${f.url}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">` : '📄'}</span>
            <a href="${f.url}" target="_blank">${esc(f.name)}</a>
          </div>
        </div>`;
      }).join('') : rrow('Documents', 'None attached')}
    </div>

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="goStep('attachments')">← Back</button>
      <div class="right"><button class="btn btn-primary" onclick="proceedToConsent()">Everything looks correct → Continue to Consent Forms</button></div>
    </div>
  `;
}

async function proceedToConsent(){
  await saveDraft();
  goStep('consent-lang');
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
function selectLang(l){ state.language_choice = l; render(); }

// ---------------------------------------------------------------------------
// STEP: PDPA notice
// ---------------------------------------------------------------------------
function tplPdpa(){
  const t = CONSENT_TEXT[state.language_choice || 'EN'];
  return `
    <div class="step-eyebrow">Consent Form</div>
    <h2>${t.pdpaTitle}</h2>
    <div class="consent-doc">${t.pdpaBody}</div>

    <div class="grid">
      <div class="field"><label>${state.language_choice==='BM'?'Nama':'Name'}</label><input type="text" id="pdpaName" value="${esc(state.name_nric)}"></div>
      <div class="field"><label>${state.language_choice==='BM'?'No. K/P':'NRIC No.'}</label><input type="text" id="pdpaNric" value="${esc(state.nric_new)}"></div>
    </div>

    <div class="checkbox-row">
      <input type="checkbox" id="pdpaAgreeBox">
      <label for="pdpaAgreeBox">${t.agreeLabel}</label>
    </div>
    <div id="pdpaErr"></div>

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="goStep('consent-lang')">← Back</button>
      <div class="right"><button class="btn btn-primary" onclick="submitPdpa()">Agree &amp; Continue →</button></div>
    </div>
  `;
}

async function submitPdpa(){
  const box = document.getElementById('pdpaAgreeBox');
  if(!box.checked){
    document.getElementById('pdpaErr').innerHTML = `<div class="error-banner">Please tick the box to confirm your consent before continuing.</div>`;
    return;
  }
  const name = document.getElementById('pdpaName').value.trim();
  const nric = document.getElementById('pdpaNric').value.trim();
  showLoading('Recording your consent...');
  try{
    // The JTS consent letter step has been removed from the candidate-facing
    // flow entirely, but rpc_agree_jts is called silently here (using data
    // already collected earlier in the form, no extra candidate input) in
    // case anything server-side still expects jts_agreed to be true before
    // allowing final submission — same defensive pattern used for TP3.
    const jtsResult = await supabaseClient.rpc('rpc_agree_jts', {p_id:state.id, p_reference_no:state.reference_no, p_name:state.name_nric, p_nric:state.nric_new, p_mobile:state.mobile_phone});
    if(!jtsResult.error) state.jts_agreed = true;

    const { error } = await supabaseClient.rpc('rpc_agree_pdpa', {p_id:state.id, p_reference_no:state.reference_no, p_name:name, p_nric:nric});
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
    <p class="step-desc">Once submitted, your application will be locked and sent for review. You won't be able to make further edits — if you need to change anything, use the Back button now.</p>
    <div id="finalErr"></div>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="goStep('pdpa')">← Back</button>
      <div class="right"><button class="btn btn-accent" onclick="finalSubmit()">Submit Application</button></div>
    </div>
  `;
}

async function finalSubmit(){
  showLoading('Submitting your application...');
  try{
    const { error } = await supabaseClient.rpc('rpc_submit_application', {p_id:state.id, p_reference_no:state.reference_no});
    if(error) throw error;
    hideLoading();
    goStep('done');
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
      <div class="step-eyebrow">Application Received</div>
      <h2>Thank you for applying to WCT Group</h2>
      <p class="step-desc">Please keep this reference number for your records — you'll need it for any follow-up.</p>
      <div class="ref-box">${state.reference_no}</div>
      <p class="step-desc">Our HR team will be in touch if your profile matches the role. You may close this page now.</p>
      <button class="btn btn-ghost" onclick="location.reload()">Start Another Application</button>
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
  return `
    <div id="stepErr"></div>
    <div class="btn-row">
      ${backStep ? `<button class="btn btn-ghost" onclick="goStepWithSave('${backStep}')">← Back</button>` : '<div></div>'}
      <div class="right">
        <button class="btn btn-ghost" onclick="saveAndExit()">Save &amp; Exit</button>
        <button class="btn btn-primary" onclick="goStepWithValidation('${nextStep}', ${validatorFn.name})">Next →</button>
      </div>
    </div>
  `;
}
async function goStepWithValidation(next, validatorFn){
  const errs = validatorFn();
  if(errs.length){
    document.getElementById('stepErr').innerHTML = `<div class="error-banner">${errs.join('<br>')}</div>`;
    window.scrollTo(0,0);
    return;
  }
  const ok = await saveDraft();
  if(ok) goStep(next);
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
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---------------------------------------------------------------------------
// Boot: require sign-in, load the user's profile + saved applications
// ---------------------------------------------------------------------------
async function signOut(){
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

(async function boot(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session){
    // Preserve any ?error=...&error_description=... from a failed OAuth
    // attempt so login.html can show what actually went wrong.
    const query = window.location.search || (window.location.hash.includes('error') ? '?'+window.location.hash.slice(1) : '');
    window.location.href = 'login.html' + query;
    return;
  }

  // Blacklist check — must happen before anything else loads
  try{
    const { data: isBlacklisted, error } = await supabaseClient.rpc('rpc_check_blacklist');
    if(error) throw error;
    if(isBlacklisted){
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html?blacklisted=1';
      return;
    }
  } catch(e){ console.error('Blacklist check failed:', e); }

  const user = session.user;
  currentUser = {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || user.user_metadata?.name || ''
  };

  showLoading('Loading your applications...');
  await loadMyApplications();
  hideLoading();

  // Which business unit this candidate is applying under is now determined
  // by which link they used to reach the portal (e.g. index.html?bu=Mall),
  // rather than a dropdown they pick themselves — different business units
  // share different links, so the right manager gets notified automatically.
  // Left in the URL (not stripped) since this link may be bookmarked/reused.
  linkBusinessUnit = new URLSearchParams(window.location.search).get('bu');

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
  render();
})();
