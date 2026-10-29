/* ==========================================================================
   Candidate experience (index.html): step animations, save feedback and the
   submission celebration. (No guided tour on the candidate side.)
   Uses WX (wct-experience.js) and app.js globals at call time.
   ========================================================================== */
(function () {
  'use strict';

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

  const checkSvg = '<svg class="wx-check" viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="40"/><path d="M27 45l12 12 23-25"/></svg>';

  window.WXC = { stepChanged, checkSvg };
})();
