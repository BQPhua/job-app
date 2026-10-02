/* ==========================================================================
   Candidate experience (index.html): step animations, a first-visit tour of
   "My Applications" and of the application form, the application status
   tracker, save feedback and the submission celebration.
   Uses WX (wct-experience.js) and app.js globals at call time.
   ========================================================================== */
(function () {
  'use strict';

  const I = {
    hello: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>',
    form: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17l9-10"/></svg>',
  };
  const WIZARD = ['personal', 'language', 'education', 'experience', 'questions', 'referees', 'attachments', 'review', 'consent-lang', 'pdpa', 'final'];

  /** Animate the card after a step change: slide for the form, rise elsewhere. */
  function stepChanged(prev, next) {
    if (typeof WX === 'undefined' || WX.reduce()) return;
    const card = document.getElementById('cardRoot');
    if (!card) return;
    const a = WIZARD.indexOf(prev); const b = WIZARD.indexOf(next);
    const cls = a >= 0 && b >= 0 ? (b > a ? 'wx-slide-fwd' : 'wx-slide-back') : 'wx-rise-in';
    card.classList.remove('wx-slide-fwd', 'wx-slide-back', 'wx-rise-in');
    void card.offsetWidth;
    card.classList.add(cls);
    setTimeout(() => card.classList.remove(cls), 450);
    if (cls === 'wx-rise-in') WX.enter(card, '.review-block, .draft-banner, .history-table tbody tr, .ob-emp-card');
    const h = card.querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  // ------------------------------------------------------------------------
  // Status tracker for "My Applications" → Application Details
  // ------------------------------------------------------------------------
  function trackerHtml(status) {
    const s = status || 'submitted';
    const inReview = ['under_review', 'shortlisted', 'interview_scheduled', 'kiv', 'offer_sent'].includes(s);
    const closed = ['rejected', 'blacklisted', 'withdrawn'].includes(s);
    const hired = s === 'hired';
    const steps = [
      { label: 'Submitted', sub: 'We have your application', state: 'done' },
      { label: 'In review', sub: s === 'kiv' ? 'Kept on file for upcoming roles' : s === 'shortlisted' ? "You've been shortlisted" : 'HR is reviewing it', state: inReview ? 'now' : (hired || closed ? 'done' : 'now') },
      hired ? { label: 'Offer accepted', sub: 'Complete your onboarding', state: 'hired' }
        : closed ? { label: 'Closed', sub: s === 'withdrawn' ? 'Application withdrawn' : 'Not progressing this time', state: 'end' }
        : { label: 'Outcome', sub: "We'll contact you", state: 'todo' },
    ];
    const cls = { done: 'is-done', now: 'is-now', hired: 'is-done is-hired', end: 'is-done is-end', todo: '' };
    return `<ol class="wx-track" style="--n:${steps.length}" aria-label="Application progress">
      ${steps.map((st, i) => `<li class="${cls[st.state]}" style="--wx-i:${i}" ${st.state === 'now' ? 'aria-current="step"' : ''}>
        <span class="dot">${st.state === 'done' || st.state === 'hired' || st.state === 'end' ? I.check : ''}</span>
        <b>${WX.esc(st.label)}</b>${WX.esc(st.sub)}</li>`).join('')}
    </ol>`;
  }

  // ------------------------------------------------------------------------
  // Tours
  // ------------------------------------------------------------------------
  const who = () => ((typeof currentUser !== 'undefined' && currentUser && currentUser.email) || 'candidate').toLowerCase();
  const first = () => {
    const n = (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || '';
    return n.trim() ? n.trim().split(/\s+/)[0] : '';
  };

  function homeSteps() {
    const name = first();
    return [
      { kind: 'intro', icon: I.hello, title: `Welcome${name ? `, ${name}` : ''}!`,
        body: '<p>Applying to WCT Group takes about 15 minutes, and you can stop and come back any time.</p><p>Here is a quick look around.</p>' },
      { target: '.draft-banner', optional: true, placement: 'bottom', title: 'Pick up where you left off',
        body: '<p>Saved applications wait for you here. Click <b>Continue</b> to carry on exactly where you stopped.</p>' },
      { target: '.history-table', optional: true, placement: 'top', title: 'Track your applications',
        body: '<p>See the status of everything you have submitted. Click a reference number to view the details or download a PDF.</p>' },
      { target: '#beginAppBtn', optional: true, placement: 'top', title: 'Start your application',
        body: '<p>The form has a few short sections: personal details, education, experience, referees and documents.</p>' },
      { target: '#topRefDisplay', optional: true, placement: 'bottom', title: 'Your account',
        body: '<p>Your progress is saved to this account, so you can sign in from any device to continue.</p>' },
      { kind: 'outro', icon: I.flag, title: "You're ready", finishLabel: "Let's go",
        body: '<p>You can replay this tour from the link at the bottom of the page.</p>' },
    ];
  }
  function wizardSteps() {
    return [
      { kind: 'intro', icon: I.form, title: 'How the form works', startLabel: 'Show me', skipLabel: 'Skip, I can manage',
        body: '<p>Three quick tips before you begin.</p>' },
      { target: '#progressBar', placement: 'bottom', title: 'Your progress',
        body: '<p>This bar shows which section you are on and how many are left.</p>' },
      { target: () => Array.from(document.querySelectorAll('#cardRoot .btn')).find((b) => /save\s*&\s*exit/i.test(b.textContent)), optional: true, placement: 'top', title: 'Need a break?',
        body: '<p><b>Save &amp; Exit</b> keeps everything you have typed. Sign in later to continue.</p>' },
      { target: () => Array.from(document.querySelectorAll('#cardRoot .btn-primary')).find((b) => /next/i.test(b.textContent)), optional: true, placement: 'top', title: 'Saved as you go',
        body: '<p>Each time you press <b>Next</b> your answers are saved. If something is missing, we point you straight to it.</p>' },
      { kind: 'outro', icon: I.flag, title: 'Good luck!', finishLabel: 'Start filling in',
        body: '<p>Fields marked <b>*</b> are required.</p>' },
    ];
  }

  function startHomeTour() {
    if (typeof WX === 'undefined') return;
    WX.tour.start({ key: `candidate:v1:${who()}`, label: 'Quick tour', steps: homeSteps(),
      onEnd: (r) => { if (r === 'skipped') WX.toast('Tour skipped. You can replay it from the bottom of the page.'); } });
  }
  function startWizardTour() {
    if (typeof WX === 'undefined') return;
    WX.tour.start({ key: `candidate-form:v1:${who()}`, label: 'Tips', steps: wizardSteps() });
  }

  /** Called after each render: offer the right tour once per person. */
  function afterRender(step) {
    if (typeof WX === 'undefined' || WX.tour.active) return;
    if (new URLSearchParams(location.search).get('tour') === 'off') return;
    if (step === 'start' && !WX.tour.isDone(`candidate:v1:${who()}`)) setTimeout(() => { if (state.step === 'start' && !WX.tour.active && !WX.tour.isDone(`candidate:v1:${who()}`)) startHomeTour(); }, 600);
    if (step === 'personal' && !WX.tour.isDone(`candidate-form:v1:${who()}`)) setTimeout(() => { if (state.step === 'personal' && !WX.tour.active && !WX.tour.isDone(`candidate-form:v1:${who()}`)) startWizardTour(); }, 700);
  }

  function replayLinkHtml() {
    return `<div style="margin-top:22px;text-align:center;"><button type="button" class="wx-tour-replay" onclick="WXC.startHomeTour()">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Take the quick tour again</button></div>`;
  }

  const checkSvg = '<svg class="wx-check" viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="40"/><path d="M27 45l12 12 23-25"/></svg>';

  window.WXC = { stepChanged, trackerHtml, afterRender, startHomeTour, startWizardTour, replayLinkHtml, checkSvg };
})();
