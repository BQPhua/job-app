/* ==========================================================================
   Candidate experience (index.html): step animations, save feedback and the
   submission celebration. (No guided tour on the candidate side.)
   Uses WX (wct-experience.js) and app.js globals at call time.
   ========================================================================== */
(function () {
  'use strict';

  const WIZARD = ['personal', 'language', 'education', 'experience', 'questions', 'family', 'referees', 'attachments', 'review', 'consent-lang', 'pdpa', 'final'];

  /** After a step change: the form's steps slide; opening an application,
   *  onboarding or going back to the list just swaps the content (a fade
   *  there read like the page reloading). */
  function stepChanged(prev, next) {
    const card = document.getElementById('cardRoot');
    if (!card) return;
    const h = card.querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    if (typeof WX === 'undefined' || WX.reduce()) return;
    const a = WIZARD.indexOf(prev); const b = WIZARD.indexOf(next);
    if (a < 0 || b < 0) return;
    const cls = b > a ? 'wx-slide-fwd' : 'wx-slide-back';
    card.classList.remove('wx-slide-fwd', 'wx-slide-back', 'wx-rise-in');
    void card.offsetWidth;
    card.classList.add(cls);
    setTimeout(() => card.classList.remove(cls), 450);
  }

  const checkSvg = '<svg class="wx-check" viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="40"/><path d="M27 45l12 12 23-25"/></svg>';

  window.WXC = { stepChanged, checkSvg };
})();
