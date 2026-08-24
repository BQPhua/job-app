// ============================================================================
// WCT Group Job Application — client logic
// ============================================================================

const STEPS = ['start','personal','language','education','experience','questions',
               'referees','attachments','review','consent-lang','jts','pdpa','final','done'];

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
  working_experience: [ {employer:'', from:'', to:'', position:'', remuneration:'', responsibilities:''} ],
  resignation_notice_required:'', notice_period:'', date_available_to_start:'',
  expected_basic_salary:'',
  relatives_in_company:'', relatives_name:'', relatives_relationship:'',
  own_transport_motorcar:'', own_transport_motorcycle:'',
  willing_based_outside_klang_valley:'',
  physical_defects:'', physical_defects_specify:'',
  arrested_convicted:'', arrested_convicted_specify:'',
  referee1:{name:'',designation:'',relationship:'',contact:''},
  referee2:{name:'',designation:'',relationship:'',contact:''},
  declaration_lawsuit:'NIL', declaration_other_matters:'NIL',
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
    case 'jts': root.innerHTML = tplJts(); break;
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

let activeJobs = [];
async function loadActiveJobs(){
  try{
    const { data, error } = await supabaseClient.rpc('rpc_list_active_jobs');
    if(error) throw error;
    activeJobs = data || [];
  } catch(e){ console.error(e); activeJobs = []; }
}

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
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="continueDraft('${a.id}')">Continue →</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="deleteDraft('${a.id}','${esc(a.reference_no)}')">Delete</button>
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
    ${activeJobs.length ? `
      <div class="field">
        <label>Which open position are you applying for? <span class="req-star">*</span></label>
        <select id="jobSelect">
          <option value="">Select a position</option>
          ${activeJobs.map(j=>`<option value="${j.id}">${esc(j.title)} — ${esc(j.business_unit)}</option>`).join('')}
        </select>
      </div>
      <div id="startErr"></div>
      <div class="btn-row"><div></div><div class="right"><button class="btn btn-primary" onclick="startNewApplication()">Begin Application →</button></div></div>
    ` : `
      <div class="error-banner">There are no open positions right now. Please check back later, or contact HR directly.</div>
    `}
  `;
}

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
  const jobId = document.getElementById('jobSelect').value;
  if(!jobId){
    document.getElementById('startErr').innerHTML = `<div class="error-banner">Please select the position you're applying for.</div>`;
    return;
  }
  const job = activeJobs.find(j=>j.id===jobId);
  showLoading('Creating your application...');
  try{
    const { data, error } = await supabaseClient.rpc('rpc_create_draft', { p_business_unit: job.business_unit });
    if(error) throw error;
    state.id = data[0].id; state.reference_no = data[0].reference_no;
    state.business_unit = job.business_unit; state.position_applying = job.title;
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
    <p class="step-desc">Applying for <strong>${state.position_applying}</strong> — ${state.business_unit}</p>

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
        <label>NRIC No. ${state.citizen==='Malaysian' ? '<span class="req-star">*</span>' : '<span class="opt-tag">(Malaysians only)</span>'}</label>
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
// the main application's UX), full Bahasa Malaysia TP3 form with automatic
// annual-limit capping, and a Salary Crediting form matching the actual
// company document exactly.
// ============================================================================

const TP3_LIMITS = {
  d1_parent_medical: 8000, d2_disabled_equipment: 6000, d3_course_fees: 7000,
  d4_medical_treatment: 10000, d5_lifestyle: 2500, d6_sports_lifestyle: 1000,
  d7_breastfeeding_equipment: 1000, d8_childcare_fees: 3000, d9_ssp1m_savings: 8000,
  d10_alimony: 4000, d11a_kwsp_sukarela: 4000, d11b_life_insurance: 3000,
  d12_private_retirement: 3000, d13_insurance_education_medical: 4000,
  d14_perkeso: 350, d15_ev_compost_cctv: 2500,
  d16a_housing_loan_500k: 7000, d16b_housing_loan_750k: 5000, d17_tourism: 1000
};

const ONBOARDING_STEPS = ['statutory','spouse_children','emergency_beneficiary','tp3_ab_c','tp3_d1_9','tp3_d10_17_declare','salary','review'];

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
    obReviewPage = 1;
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
      cidb_branch: document.getElementById('ob_cidb_branch')?.value.trim() || '',
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
function updateTp3Field(key, val){
  let numeric = parseFloat(String(val).replace(/[^0-9.]/g,''));
  const limit = TP3_LIMITS[key];
  let capMsg = '';
  let finalVal = val;
  if(limit && !isNaN(numeric) && numeric > limit){
    finalVal = String(limit);
    capMsg = `Melebihi had tahunan — dihadkan kepada RM${limit.toLocaleString()}`;
  }
  onboardingState.tp3_data = {...onboardingState.tp3_data, [key]: finalVal};
  const msgEl = document.getElementById('capmsg_'+key);
  if(msgEl) msgEl.innerHTML = capMsg ? `<span style="color:#B9770E;">${capMsg}</span>` : '';
  if(capMsg){
    const inputEl = document.getElementById('tp3_'+key);
    if(inputEl) inputEl.value = finalVal;
  }
}

function addChildBelow18(){ onboardingState.children_below_18 = [...onboardingState.children_below_18, {name:'',date_of_birth:'',tax_relief:false}]; render(); }
function removeChildBelow18(i){ onboardingState.children_below_18.splice(i,1); render(); }
function updateChildBelow18(i, key, val){ onboardingState.children_below_18[i][key] = val; }

function addChild18to23(){ onboardingState.children_18_to_23 = [...onboardingState.children_18_to_23, {name:'',date_of_birth:'',course_name:'',gender:'',nric:'',tax_relief:false}]; render(); }
function removeChild18to23(i){ onboardingState.children_18_to_23.splice(i,1); render(); }
function updateChild18to23(i, key, val){ onboardingState.children_18_to_23[i][key] = val; }

function addEmergencyContact(){ onboardingState.emergency_contacts = [...onboardingState.emergency_contacts, {name:'',relationship:'',contact:''}]; render(); }
function removeEmergencyContact(i){ onboardingState.emergency_contacts.splice(i,1); render(); }
function updateEmergencyContact(i, key, val){ onboardingState.emergency_contacts[i][key] = val; }

async function confirmOnboardingSection(section){
  await saveOnboarding(false);
  try{
    const { data, error } = await supabaseClient.rpc('rpc_confirm_onboarding_section', { p_application_id: onboardingAppId, p_section: section });
    if(error) throw error;
    onboardingState = data[0];
    if(onboardingState.status === 'completed') onboardingStep = 'review';
    render();
  } catch(e){ alert('Error: ' + e.message); }
}

function backFromOnboarding(){
  onboardingAppId = null; onboardingState = null; onboardingStep = 'statutory';
  obReviewPage = 1; salaryAckChecked = false;
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
    tp3_ab_c: tplObTp3AbC,
    tp3_d1_9: tplObTp3D1to9,
    tp3_d10_17_declare: tplObTp3D10to17Declare,
    salary: tplObSalary
  };
  return `
    <div class="step-eyebrow">Onboarding</div>
    <h2>Post-Hire Details</h2>
    ${obProgressBar()}
    ${stepMap[onboardingStep]()}
  `;
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
      <div class="field"><label>Income Tax No.</label><input type="text" id="ob_income_tax_no" value="${esc(o.income_tax_no)}"></div>
    </div>
    <div class="grid">
      <div class="field"><label>Tax Branch</label><input type="text" id="ob_tax_branch" value="${esc(o.tax_branch)}"></div>
      <div class="field"><label>SOCSO No.</label><input type="text" id="ob_socso_no" value="${esc(o.socso_no)}"></div>
    </div>
    <div class="grid">
      <div class="field"><label>Bank Account No.</label><input type="text" id="ob_bank_account_no" value="${esc(o.bank_account_no)}"></div>
      <div class="field"><label>CIDB Green Card No.</label><input type="text" id="ob_cidb_green_card_no" value="${esc(o.cidb_green_card_no)}"></div>
    </div>
    <div class="field"><label>CIDB Branch</label><input type="text" id="ob_cidb_branch" value="${esc(o.cidb_branch)}"></div>

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
      <div class="field"><label>NRIC No.</label><input type="text" id="ob_spouse_nric" value="${esc(o.spouse_nric)}"></div>
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
      <thead><tr><th>Name (per NRIC)</th><th>Date of Birth</th><th>Child Tax Relief</th><th></th></tr></thead>
      <tbody>
        ${o.children_below_18.map((c,i)=>`
          <tr>
            <td><input type="text" value="${esc(c.name)}" oninput="updateChildBelow18(${i},'name',this.value)"></td>
            <td><input type="date" value="${esc(c.date_of_birth)}" oninput="updateChildBelow18(${i},'date_of_birth',this.value)"></td>
            <td style="text-align:center;"><input type="checkbox" ${c.tax_relief?'checked':''} onchange="updateChildBelow18(${i},'tax_relief',this.checked)"></td>
            <td><button class="remove-x" onclick="removeChildBelow18(${i})">✕</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <button class="add-row-btn" onclick="addChildBelow18()">+ Add child</button>

    <div class="section-title">Children Above 18 Up To 23 <span class="opt-tag">(unmarried &amp; full-time student)</span></div>
    <table class="dyn">
      <thead><tr><th>Name</th><th>Gender</th><th>NRIC No.</th><th>Date of Birth</th><th>Course Name</th><th>Tax Relief</th><th></th></tr></thead>
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
            <td><input type="text" value="${esc(c.nric)}" oninput="updateChild18to23(${i},'nric',this.value)"></td>
            <td><input type="date" value="${esc(c.date_of_birth)}" oninput="updateChild18to23(${i},'date_of_birth',this.value)"></td>
            <td><input type="text" value="${esc(c.course_name)}" oninput="updateChild18to23(${i},'course_name',this.value)"></td>
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

    <div class="section-title">Beneficiary</div>
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
      <div class="right"><button class="btn btn-primary" ${o.personal_details_confirmed ? '' : 'disabled'} onclick="onboardingGoStep('tp3_ab_c')">Next →</button></div>
    </div>
    ${!o.personal_details_confirmed ? `<p class="hint" style="text-align:right;margin-top:6px;">Please check the confirmation box above to continue.</p>` : ''}
  `;
}

// ---------------------------------------------------------------------------
// TP3 helpers — fully in Bahasa Malaysia, matching Borang PCB/TP3 (1/2026)
// ---------------------------------------------------------------------------
function tp3Field(t, key, label, placeholder){
  return `<div class="field"><label>${label}</label><input type="text" id="tp3_${key}" placeholder="${placeholder||''}" value="${esc(t[key])}" oninput="updateTp3Field('${key}', this.value)"></div>`;
}
function tp3Money(t, key, label, limit){
  return `
    <div class="field">
      <label>${label}${limit ? ` <span class="opt-tag">(Had Tahunan: RM${limit.toLocaleString()})</span>` : ''}</label>
      <input type="text" id="tp3_${key}" placeholder="RM" value="${esc(t[key])}" oninput="updateTp3Field('${key}', this.value)">
      <div id="capmsg_${key}" class="hint"></div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// STEP 4: TP3 Bahagian A, B, C
// ---------------------------------------------------------------------------
function tplObTp3AbC(){
  const t = onboardingState.tp3_data || {};
  return `
    <div class="section-title" style="margin-top:0;">BORANG PCB/TP3 — Bahagian A: Maklumat Majikan Terdahulu</div>
    <div class="grid">
      ${tp3Field(t, 'employer1_name', 'A1: Nama Majikan Terdahulu 1', 'cth: ABC Sdn Bhd')}
      ${tp3Field(t, 'employer1_tin', 'A2: No. Pengenalan Cukai (TIN) 1')}
    </div>
    <div class="grid">
      ${tp3Field(t, 'employer2_name', 'A3: Nama Majikan Terdahulu 2 (jika ada)')}
      ${tp3Field(t, 'employer2_tin', 'A4: No. Pengenalan Cukai (TIN) 2 (jika ada)')}
    </div>

    <div class="section-title">Bahagian B: Maklumat Individu</div>
    <div class="grid g3">
      ${tp3Field(t, 'b1_name', 'B1: Nama')}
      ${tp3Field(t, 'b2_ic_passport', 'B2: No. Kad Pengenalan/Pasport')}
      ${tp3Field(t, 'b3_tin', 'B3: No. Pengenalan Cukai (TIN)')}
    </div>

    <div class="section-title">Bahagian C: Maklumat Saraan / KWSP / Zakat / PCB</div>
    <p class="hint" style="margin-top:-8px;">Sila nyatakan jumlah keseluruhan daripada majikan-majikan terdahulu.</p>
    ${tp3Money(t, 'c1_gross_remuneration', 'C1: Jumlah saraan kasar bulanan dan saraan tambahan termasuk elaun/perkuisit/pemberian/manfaat yang dikenakan cukai')}
    <div class="section-title" style="font-size:13px;margin-top:10px;">C2: Jumlah elaun/perkuisit/pemberian/manfaat yang dikecualikan cukai</div>
    ${tp3Money(t, 'c2i_travel', 'i) Elaun perjalanan, kad petrol atau elaun petrol dan fi tol atas urusan rasmi')}
    ${tp3Money(t, 'c2ii_childcare', 'ii) Elaun penjagaan anak')}
    ${tp3Money(t, 'c2iii_products', 'iii) Produk yang dikeluarkan oleh perniagaan majikan yang diberi secara percuma atau pada harga diskaun')}
    ${tp3Money(t, 'c2iv_service_award', 'iv) Perkuisit tunai/barangan bagi pencapaian perkhidmatan lalu/anugerah (berkhidmat lebih 10 tahun)')}
    ${tp3Money(t, 'c2v_other', 'v) Lain-lain elaun/perkuisit/pemberian/manfaat yang dikecualikan cukai')}
    ${tp3Money(t, 'c3_epf_total', 'C3: Jumlah caruman KWSP atau Kumpulan Wang Lain Yang Diluluskan ke atas semua saraan')}
    ${tp3Money(t, 'c4i_zakat', 'C4(i): Jumlah Zakat')}
    ${tp3Money(t, 'c4ii_umrah', 'C4(ii): Levi pelepasan bagi perjalanan umrah/tujuan keagamaan (Terhad 2 kali seumur hidup)')}
    ${tp3Money(t, 'c5_total_pcb', 'C5: Jumlah PCB (tidak termasuk CP38)')}

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="onboardingGoStep('emergency_beneficiary')">← Back</button>
      <div class="right"><button class="btn btn-primary" onclick="onboardingGoStep('tp3_d1_9')">Next →</button></div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// STEP 5: TP3 Bahagian D — D1 to D9
// ---------------------------------------------------------------------------
function tplObTp3D1to9(){
  const t = onboardingState.tp3_data || {};
  return `
    <div class="section-title" style="margin-top:0;">Bahagian D: Maklumat Potongan (D1–D9)</div>
    <p class="hint" style="margin-top:-8px;">Setiap item di bawah adalah satu jumlah gabungan, merangkumi semua sub-item yang disenaraikan.</p>

    ${tp3Money(t, 'd1_parent_medical', 'D1: Perbelanjaan untuk ibu bapa/datuk nenek — a) rawatan perubatan, keperluan khas & penjagaan; b) rawatan pergigian; c) pemeriksaan perubatan penuh termasuk vaksinasi (Terhad RM1,000)', TP3_LIMITS.d1_parent_medical)}
    ${tp3Money(t, 'd2_disabled_equipment', 'D2: Peralatan sokongan asas untuk diri sendiri/pasangan/anak/ibu bapa kurang upaya', TP3_LIMITS.d2_disabled_equipment)}
    ${tp3Money(t, 'd3_course_fees', 'D3: Yuran pengajian (diri sendiri) — a) selain Sarjana/PhD (undang-undang/perakaunan/kewangan Islam/teknikal/vokasional/industri/saintifik/teknologi); b) Sarjana/PhD; c) kursus peningkatan kemahiran (Terhad RM2,000)', TP3_LIMITS.d3_course_fees)}
    ${tp3Money(t, 'd4_medical_treatment', 'D4: Perbelanjaan rawatan perubatan — a) penyakit serius; b) rawatan kesuburan; c) vaksinasi (RM1,000); d) pergigian (RM1,000); e) pemeriksaan penuh/kesihatan mental (RM1,000); f) intervensi awal anak OKU ≤18 tahun (RM10,000)', TP3_LIMITS.d4_medical_treatment)}
    ${tp3Money(t, 'd5_lifestyle', 'D5: Gaya hidup — a) buku/jurnal/majalah/surat khabar; b) komputer peribadi/telefon pintar/tablet; c) langganan internet (atas nama sendiri); d) kursus peningkatan kemahiran', TP3_LIMITS.d5_lifestyle)}
    ${tp3Money(t, 'd6_sports_lifestyle', 'D6: Gaya hidup (sukan) — a) peralatan sukan (Akta Pembangunan Sukan 1997); b) sewa/fi fasiliti sukan; c) fi pendaftaran pertandingan; d) yuran gimnasium/latihan sukan', TP3_LIMITS.d6_sports_lifestyle)}
    ${tp3Money(t, 'd7_breastfeeding_equipment', 'D7: Peralatan penyusuan ibu (anak ≤2 tahun, terhad sekali setiap 2 tahun taksiran)', TP3_LIMITS.d7_breastfeeding_equipment)}
    ${tp3Money(t, 'd8_childcare_fees', 'D8: Yuran penghantaran anak ≤12 tahun ke taska/tadika/pusat jagaan harian berdaftar', TP3_LIMITS.d8_childcare_fees)}
    ${tp3Money(t, 'd9_ssp1m_savings', 'D9: Tabungan bersih dalam Skim Simpanan Pendidikan Nasional (SSPN)', TP3_LIMITS.d9_ssp1m_savings)}

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="onboardingGoStep('tp3_ab_c')">← Back</button>
      <div class="right"><button class="btn btn-primary" onclick="onboardingGoStep('tp3_d10_17_declare')">Next →</button></div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// STEP 6: TP3 Bahagian D — D10 to D17 + Bahagian E (declaration)
// ---------------------------------------------------------------------------
function tplObTp3D10to17Declare(){
  const o = onboardingState;
  const t = o.tp3_data || {};
  return `
    <div class="section-title" style="margin-top:0;">Bahagian D: Maklumat Potongan (D10–D17)</div>
    ${tp3Money(t, 'd10_alimony', 'D10: Bayaran alimoni kepada bekas isteri', TP3_LIMITS.d10_alimony)}
    <div class="grid">
      ${tp3Money(t, 'd11a_kwsp_sukarela', 'D11(a): KWSP Sukarela (Terhad RM4,000 termasuk KWSP wajib)', TP3_LIMITS.d11a_kwsp_sukarela)}
      ${tp3Money(t, 'd11b_life_insurance', 'D11(b): Insurans nyawa/KWSP Sukarela (Terhad RM3,000)', TP3_LIMITS.d11b_life_insurance)}
    </div>
    ${tp3Money(t, 'd12_private_retirement', 'D12: Skim persaraan swasta dan anuiti tertangguh', TP3_LIMITS.d12_private_retirement)}
    ${tp3Money(t, 'd13_insurance_education_medical', 'D13: Insurans pendidikan dan perubatan', TP3_LIMITS.d13_insurance_education_medical)}
    ${tp3Money(t, 'd14_perkeso', 'D14: Caruman PERKESO (Akta Keselamatan Sosial Pekerja 1969 / Akta Sistem Insurans Pekerjaan 2017)', TP3_LIMITS.d14_perkeso)}
    ${tp3Money(t, 'd15_ev_compost_cctv', 'D15: Pemasangan/sewaan/pembelian kemudahan pengecasan EV, mesin kompos, atau mesin rincih sisa makanan & CCTV', TP3_LIMITS.d15_ev_compost_cctv)}
    <div class="grid">
      ${tp3Money(t, 'd16a_housing_loan_500k', 'D16(a): Faedah pinjaman rumah — harga sehingga RM500,000', TP3_LIMITS.d16a_housing_loan_500k)}
      ${tp3Money(t, 'd16b_housing_loan_750k', 'D16(b): Faedah pinjaman rumah — RM500,000 hingga RM750,000', TP3_LIMITS.d16b_housing_loan_750k)}
    </div>
    ${tp3Money(t, 'd17_tourism', 'D17: Fi kemasukan ke pusat pelancongan/program kebudayaan dalam negara', TP3_LIMITS.d17_tourism)}

    <div class="section-title">Bahagian E: Akuan Pekerja</div>
    <p style="font-size:13px;">Saya mengakui bahawa semua maklumat yang dinyatakan dalam borang ini adalah benar, betul dan lengkap. Sekiranya maklumat yang diberikan tidak benar, tindakan mahkamah boleh diambil ke atas saya di bawah perenggan 113(1)(b) Akta Cukai Pendapatan 1967.</p>

    <div class="checkbox-row">
      <input type="checkbox" id="confirm_tp3" ${o.tp3_confirmed?'checked disabled':''} onchange="if(this.checked) confirmOnboardingSection('tp3')">
      <label for="confirm_tp3">Saya mengesahkan bahawa maklumat di atas adalah benar, betul dan lengkap.</label>
      ${o.tp3_confirmed ? `<div class="hint" style="margin-left:auto;">Confirmed ${new Date(o.tp3_confirmed_at).toLocaleString()}</div>` : ''}
    </div>

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="onboardingGoStep('tp3_d1_9')">← Back</button>
      <div class="right"><button class="btn btn-primary" ${o.tp3_confirmed ? '' : 'disabled'} onclick="onboardingGoStep('salary')">Next →</button></div>
    </div>
    ${!o.tp3_confirmed ? `<p class="hint" style="text-align:right;margin-top:6px;">Please check the confirmation box above to continue.</p>` : ''}
  `;
}

// ---------------------------------------------------------------------------
// STEP 7: Salary Crediting Requisition Form — matches the actual document
// ---------------------------------------------------------------------------
let salaryAckChecked = false; // local-only acknowledgment; the real, final
// confirmation happens on the Review Before Submitting page via
// submitOnboarding() — this checkbox just gates getting to that page, it
// does not itself lock anything in.

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
      <div class="field"><label>Account No.</label><input type="text" id="ob_salary_account_no" value="${esc(o.salary_account_no)}"></div>
      <div class="field"><label>IC/Passport No. Submitted During Application</label><input type="text" id="ob_salary_ic" value="${esc(o.salary_ic_submitted || state.nric_new || state.passport_number)}"></div>
    </div>

    <p style="font-size:12.5px;color:var(--ink-soft);">I confirm that the information herein is correct and in order. Should there be any discrepancy in the information, which will lead to possible delay or inability to credit my salaries, it is my sole responsibility.<br><br>
    <em>Saya mengesahkan maklumat tersebut diatas adalah betul dan teratur. Sebarang perbezaan dalam maklumat tersebut, yang mungkin mengakibatkan kelewatan ataupun ketidakmasukan gaji, adalah tanggungjawab saya sendiri.</em></p>

    <div class="checkbox-row">
      <input type="checkbox" id="confirm_salary_crediting" ${salaryAckChecked?'checked':''} onchange="salaryAckChecked=this.checked;render();">
      <label for="confirm_salary_crediting">I confirm the above information is correct.</label>
    </div>

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="onboardingGoStep('tp3_d10_17_declare')">← Back</button>
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
// Two pages since the full TP3 form alone is ~30 fields — showing
// everything on one screen was too long to scan comfortably.
// ---------------------------------------------------------------------------
let obReviewPage = 1;

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
      ${obReviewRow('CIDB Branch', o.cidb_branch)}
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
      ${(o.children_below_18||[]).map(c=>obReviewRow(c.name||'Unnamed', `DOB: ${c.date_of_birth||'—'} · Tax Relief: ${c.tax_relief?'Yes':'No'}`)).join('') || obReviewRow('Children','None')}
    </div>

    <div class="review-block">
      <h4>Children 18–23 (Unmarried, Full-Time Student)</h4>
      ${(o.children_18_to_23||[]).map(c=>obReviewRow(c.name||'Unnamed', `${c.gender||'—'} · NRIC: ${c.nric||'—'} · DOB: ${c.date_of_birth||'—'} · ${c.course_name||'—'} · Tax Relief: ${c.tax_relief?'Yes':'No'}`)).join('') || obReviewRow('Children','None')}
    </div>

    <div class="review-block">
      <h4>Emergency Contacts</h4>
      ${(o.emergency_contacts||[]).map(c=>obReviewRow(c.name||'Unnamed', `${c.relationship||'—'} · ${c.contact||'—'}`)).join('') || obReviewRow('Emergency Contacts','None')}
    </div>

    <div class="review-block">
      <h4>Beneficiary</h4>
      ${obReviewRow('Name', o.beneficiary_name)}
      ${obReviewRow('Relationship', o.beneficiary_relationship)}
      ${obReviewRow('Contact No.', o.beneficiary_contact)}
    </div>
  `;
}

function obSummaryPage2Html(o){
  const t = o.tp3_data || {};
  return `
    <div class="review-block">
      <h4>TP3 — Bahagian A: Maklumat Majikan Terdahulu</h4>
      ${obReviewRow('A1 Nama Majikan Terdahulu 1', t.employer1_name)}
      ${obReviewRow('A2 No. Pengenalan Cukai (TIN) 1', t.employer1_tin)}
      ${obReviewRow('A3 Nama Majikan Terdahulu 2', t.employer2_name)}
      ${obReviewRow('A4 No. Pengenalan Cukai (TIN) 2', t.employer2_tin)}
    </div>

    <div class="review-block">
      <h4>TP3 — Bahagian B: Maklumat Individu</h4>
      ${obReviewRow('B1 Nama', t.b1_name)}
      ${obReviewRow('B2 No. Kad Pengenalan/Pasport', t.b2_ic_passport)}
      ${obReviewRow('B3 No. Pengenalan Cukai (TIN)', t.b3_tin)}
    </div>

    <div class="review-block">
      <h4>TP3 — Bahagian C: Saraan / KWSP / Zakat / PCB</h4>
      ${obReviewRow('C1 Jumlah Saraan Kasar', t.c1_gross_remuneration)}
      ${obReviewRow('C2(i) Elaun Perjalanan', t.c2i_travel)}
      ${obReviewRow('C2(ii) Elaun Penjagaan Anak', t.c2ii_childcare)}
      ${obReviewRow('C2(iii) Produk Percuma/Diskaun', t.c2iii_products)}
      ${obReviewRow('C2(iv) Perkuisit Perkhidmatan Lalu', t.c2iv_service_award)}
      ${obReviewRow('C2(v) Lain-lain Pengecualian', t.c2v_other)}
      ${obReviewRow('C3 Jumlah KWSP', t.c3_epf_total)}
      ${obReviewRow('C4(i) Zakat', t.c4i_zakat)}
      ${obReviewRow('C4(ii) Levi Umrah', t.c4ii_umrah)}
      ${obReviewRow('C5 Jumlah PCB', t.c5_total_pcb)}
    </div>

    <div class="review-block">
      <h4>TP3 — Bahagian D: Potongan</h4>
      ${obReviewRow('D1 Ibu Bapa/Datuk Nenek', t.d1_parent_medical)}
      ${obReviewRow('D2 Peralatan OKU', t.d2_disabled_equipment)}
      ${obReviewRow('D3 Yuran Pengajian', t.d3_course_fees)}
      ${obReviewRow('D4 Rawatan Perubatan', t.d4_medical_treatment)}
      ${obReviewRow('D5 Gaya Hidup', t.d5_lifestyle)}
      ${obReviewRow('D6 Gaya Hidup (Sukan)', t.d6_sports_lifestyle)}
      ${obReviewRow('D7 Peralatan Penyusuan', t.d7_breastfeeding_equipment)}
      ${obReviewRow('D8 Yuran Taska/Tadika', t.d8_childcare_fees)}
      ${obReviewRow('D9 Simpanan SSPN', t.d9_ssp1m_savings)}
      ${obReviewRow('D10 Alimoni', t.d10_alimony)}
      ${obReviewRow('D11(a) KWSP Sukarela', t.d11a_kwsp_sukarela)}
      ${obReviewRow('D11(b) Insurans Nyawa', t.d11b_life_insurance)}
      ${obReviewRow('D12 Persaraan Swasta', t.d12_private_retirement)}
      ${obReviewRow('D13 Insurans Pendidikan/Perubatan', t.d13_insurance_education_medical)}
      ${obReviewRow('D14 PERKESO', t.d14_perkeso)}
      ${obReviewRow('D15 EV/Kompos/CCTV', t.d15_ev_compost_cctv)}
      ${obReviewRow('D16(a) Faedah Pinjaman ≤RM500,000', t.d16a_housing_loan_500k)}
      ${obReviewRow('D16(b) Faedah Pinjaman RM500,000–750,000', t.d16b_housing_loan_750k)}
      ${obReviewRow('D17 Pelancongan/Kebudayaan', t.d17_tourism)}
    </div>

    <div class="review-block">
      <h4>Salary Crediting</h4>
      ${obReviewRow('Company', o.salary_company)}
      ${obReviewRow('Bank', o.salary_bank)}
      ${obReviewRow('Account No.', o.salary_account_no)}
      ${obReviewRow('IC/Passport No. Submitted', o.salary_ic_submitted)}
    </div>
  `;
}

function obSummaryPaginationHtml(){
  return `
    <div class="pagination" style="margin:18px 0;">
      <button class="btn btn-ghost btn-sm" style="padding:6px 12px;" ${obReviewPage<=1?'disabled':''} onclick="obReviewPage=1;render();window.scrollTo(0,0);">← Page 1</button>
      <span style="font-size:13px;color:var(--ink-soft);">Page ${obReviewPage} of 2</span>
      <button class="btn btn-ghost btn-sm" style="padding:6px 12px;" ${obReviewPage>=2?'disabled':''} onclick="obReviewPage=2;render();window.scrollTo(0,0);">Page 2 →</button>
    </div>
  `;
}

function tplObPreview(){
  const o = onboardingState;
  return `
    <div class="step-eyebrow">Onboarding</div>
    <h2>Review Before Submitting</h2>
    <p class="step-desc">Please check everything below carefully. Once you submit, your onboarding record will be marked complete and HR will be notified — you won't be able to edit it afterward.</p>

    ${obReviewPage===1 ? obSummaryPage1Html(o) : obSummaryPage2Html(o)}
    ${obSummaryPaginationHtml()}

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
    obReviewPage = 1;
    onboardingStep = 'review';
    render();
    window.scrollTo(0,0);
  } catch(e){ alert('Error: ' + e.message); }
}

function tplObReview(){
  const o = onboardingState;
  const allDone = o.personal_details_confirmed && o.tp3_confirmed && o.salary_crediting_confirmed;
  return `
    <div class="step-eyebrow">Onboarding</div>
    <h2>Your Onboarding Details</h2>
    ${allDone
      ? `<div class="success-banner">All sections completed.</div>`
      : `<div class="error-banner">Some sections aren't confirmed yet. <span style="text-decoration:underline;cursor:pointer;" onclick="onboardingStep='statutory';render();">Continue filling them in →</span></div>`}

    ${obReviewPage===1 ? obSummaryPage1Html(o) : obSummaryPage2Html(o)}
    ${obSummaryPaginationHtml()}

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
      <td><button class="remove-x" onclick="removeRow('education',${i})">✕</button></td>
    </tr>`).join('');
  return `
    <div class="step-eyebrow">Step 3 of 8</div>
    <h2>Education</h2>
    <p class="step-desc">Add your school, college/university, and any professional body memberships.</p>

    <table class="dyn">
      <thead><tr><th>Type</th><th>Institution</th><th>From</th><th>To</th><th>Qualification</th><th></th></tr></thead>
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
function addEduRow(){ state.education.push({type:'School',name:'',from_year:'',to_year:'',qualification:''}); render(); }

// ---------------------------------------------------------------------------
// STEP: working experience
// ---------------------------------------------------------------------------
function tplExperience(){
  const rows = state.working_experience.map((r,i)=>`
    <div class="card" style="padding:18px;margin-bottom:14px;border-color:#E4E4E3;">
      <div class="grid">
        <div class="field"><label>Employer Name &amp; Address <span class="req-star">*</span></label><textarea oninput="updateArrayField('working_experience',${i},'employer',this.value)">${esc(r.employer)}</textarea></div>
        <div class="field"><label>Last Position Held <span class="req-star">*</span></label><input type="text" value="${esc(r.position)}" oninput="updateArrayField('working_experience',${i},'position',this.value)"></div>
      </div>
      <div class="grid">
        <div class="field"><label>From <span class="req-star">*</span></label><input type="month" value="${esc(r.from)}" oninput="updateArrayField('working_experience',${i},'from',this.value)"></div>
        <div class="field"><label>To <span class="req-star">*</span></label><input type="month" value="${esc(r.to)}" oninput="updateArrayField('working_experience',${i},'to',this.value)"></div>
      </div>
      <div class="grid">
        <div class="field"><label>Last Drawn Remuneration (Monthly) <span class="req-star">*</span></label><input type="text" value="${esc(r.remuneration)}" oninput="updateArrayField('working_experience',${i},'remuneration',this.value)"></div>
        <div></div>
      </div>
      <div class="field"><label>Job Responsibilities <span class="req-star">*</span></label><textarea oninput="updateArrayField('working_experience',${i},'responsibilities',this.value)">${esc(r.responsibilities)}</textarea></div>
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
function validateExperienceStep(){
  const errs = [];
  state.working_experience.forEach((r,i)=>{
    if(!r.employer.trim()) errs.push(`Work experience ${i+1}: please enter the employer name and address.`);
    if(!r.position.trim()) errs.push(`Work experience ${i+1}: please enter the last position held.`);
    if(!r.from) errs.push(`Work experience ${i+1}: please provide the "From" month/year.`);
    if(!r.to) errs.push(`Work experience ${i+1}: please provide the "To" month/year.`);
    if(!r.remuneration.trim()) errs.push(`Work experience ${i+1}: please enter the last drawn remuneration.`);
  });
  return errs;
}
function addExpRow(){ state.working_experience.push({employer:'',from:'',to:'',position:'',remuneration:'',responsibilities:''}); render(); }
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
      <div class="field"><label>Expected Basic Salary (per month) <span class="req-star">*</span></label><input type="text" placeholder="e.g. 4500" value="${esc(state.expected_basic_salary)}" oninput="updateField('expected_basic_salary', this.value)"></div>
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
    <p class="hint">I declare that the statements made by me are true, complete, and correct to the best of my knowledge and belief.</p>
    <div class="field">
      <label>Save and except for the following, I am not involved in, a party to, nor the subject of any lawsuit, arbitral proceedings, disciplinary proceedings, criminal inquiry, investigation and/or conviction. (State "NIL" if none)</label>
      <textarea oninput="updateField('declaration_lawsuit', this.value)">${esc(state.declaration_lawsuit)}</textarea>
    </div>
    <div class="field">
      <label>Save and except for the following, I am not aware of any matter that may affect my personal/professional standing or that might adversely affect consideration of my application. (State "NIL" if none)</label>
      <textarea oninput="updateField('declaration_other_matters', this.value)">${esc(state.declaration_other_matters)}</textarea>
    </div>

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
  if(!state.declaration_lawsuit.trim()) errs.push('Please state "NIL" or provide details for the lawsuit declaration.');
  if(!state.declaration_other_matters.trim()) errs.push('Please state "NIL" or provide details for the other matters declaration.');
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
    <h2>Attachments &amp; Profile Picture</h2>

    <div class="section-title" style="margin-top:0;">Profile Picture <span class="req-star">*</span></div>
    ${state.profile_picture_url ? `<img src="${state.profile_picture_url}" class="profile-preview">` : ''}
    <div class="upload-box" onclick="document.getElementById('profileInput').click()">
      <div style="font-size:14px;">📷 Click to ${state.profile_picture_url?'change':'upload'} your profile picture</div>
      <div class="hint">JPG or PNG, clear passport-style photo recommended</div>
    </div>
    <input type="file" id="profileInput" accept="image/*" style="display:none" onchange="handleProfileUpload(this.files[0])">

    <div class="section-title">Supporting Documents</div>
    <p class="hint">Resume/CV, certificates, testimonials, ID copy, etc. Add attachments if you need more space than the form provides.</p>
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
  if(!state.profile_picture_url) errs.push('Please upload a profile picture before continuing — it is required.');
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
  showLoading('Uploading profile picture...');
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
      ${state.education.map(r=>rrow(r.type, `${r.name} (${r.from_year}–${r.to_year}) — ${r.qualification}`)).join('')}
    </div>

    <div class="review-block">
      ${reviewHeader('Working Experience', 'experience')}
      ${state.working_experience.map(r=>rrow(r.position||'Position', `${r.employer} (${r.from}–${r.to})`)).join('')}
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
      ${rrow('Lawsuit Declaration', state.declaration_lawsuit)}
      ${rrow('Other Matters Declaration', state.declaration_other_matters)}
    </div>

    <div class="review-block">
      ${reviewHeader('Attachments', 'attachments')}
      <div class="file-thumb-row">
        <div class="k" style="width:44%;">Profile Picture</div>
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
      <div class="right"><button class="btn btn-primary" ${!state.language_choice?'disabled':''} onclick="goStepWithSave('jts')">Continue →</button></div>
    </div>
  `;
}
function selectLang(l){ state.language_choice = l; render(); }

// ---------------------------------------------------------------------------
// STEP: JTS consent form
// ---------------------------------------------------------------------------
function tplJts(){
  const t = CONSENT_TEXT[state.language_choice || 'EN'];
  return `
    <div class="step-eyebrow">Consent Form 1 of 2</div>
    <h2>${t.jtsTitle}</h2>
    <div class="consent-doc">${t.jtsBody}</div>

    <div class="grid">
      <div class="field"><label>${state.language_choice==='BM'?'Nama Calon':'Candidate Name'}</label><input type="text" id="jtsName" value="${esc(state.name_nric)}"></div>
      <div class="field"><label>${state.language_choice==='BM'?'No. KP / Pasport':'NRIC / Passport No.'}</label><input type="text" id="jtsNric" value="${esc(state.nric_new)}"></div>
    </div>
    <div class="field"><label>${state.language_choice==='BM'?'No. Telefon Bimbit':'Mobile No.'}</label><input type="text" id="jtsMobile" value="${esc(state.mobile_phone)}"></div>

    <div class="checkbox-row">
      <input type="checkbox" id="jtsAgreeBox">
      <label for="jtsAgreeBox">${t.agreeLabel}</label>
    </div>
    <div id="jtsErr"></div>

    <div class="btn-row">
      <button class="btn btn-ghost" onclick="goStep('consent-lang')">← Back</button>
      <div class="right"><button class="btn btn-primary" onclick="submitJts()">Agree &amp; Continue →</button></div>
    </div>
  `;
}

async function submitJts(){
  const box = document.getElementById('jtsAgreeBox');
  if(!box.checked){
    document.getElementById('jtsErr').innerHTML = `<div class="error-banner">Please tick the box to confirm your consent before continuing.</div>`;
    return;
  }
  const name = document.getElementById('jtsName').value.trim();
  const nric = document.getElementById('jtsNric').value.trim();
  const mobile = document.getElementById('jtsMobile').value.trim();
  showLoading('Recording your consent...');
  try{
    const { error } = await supabaseClient.rpc('rpc_agree_jts', {p_id:state.id, p_reference_no:state.reference_no, p_name:name, p_nric:nric, p_mobile:mobile});
    if(error) throw error;
    state.jts_agreed = true;
    hideLoading();
    goStep('pdpa');
  } catch(e){ hideLoading(); document.getElementById('jtsErr').innerHTML = `<div class="error-banner">${e.message}</div>`; }
}

// ---------------------------------------------------------------------------
// STEP: PDPA notice
// ---------------------------------------------------------------------------
function tplPdpa(){
  const t = CONSENT_TEXT[state.language_choice || 'EN'];
  return `
    <div class="step-eyebrow">Consent Form 2 of 2</div>
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
      <button class="btn btn-ghost" onclick="goStep('jts')">← Back</button>
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
  await Promise.all([loadMyApplications(), loadActiveJobs()]);
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
  await Promise.all([loadMyApplications(), loadActiveJobs()]);
  hideLoading();

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
