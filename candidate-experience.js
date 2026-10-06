/* ==========================================================================
   Candidate experience (index.html): step animations, the application status
   tracker, save feedback and the submission celebration. (No guided tour on
   the candidate side.)
   Uses WX (wct-experience.js) and app.js globals at call time.
   ========================================================================== */
(function () {
  'use strict';

  const I = {
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

  const checkSvg = '<svg class="wx-check" viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="40"/><path d="M27 45l12 12 23-25"/></svg>';

  window.WXC = { stepChanged, trackerHtml, checkSvg };
})();
