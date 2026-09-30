// ============================================================================
// Accessibility enhancer (Stage 2, 2026-09-30) — shared by index.html,
// login.html and admin.html.
//
// These pages render their HTML from template strings in many places, so
// instead of hand-editing hundreds of templates this watches the DOM and
// fills three common gaps as content appears:
//   1. icon-only buttons/links that only have a `title` get an aria-label
//      (screen readers don't reliably announce title);
//   2. a `.field`'s <label> is linked to its input/select/textarea
//      (clicking the label focuses the field; screen readers read it);
//   3. non-button elements with an inline onclick (status badges, stat
//      tiles, ...) become keyboard-operable: role="button", focusable,
//      Enter/Space activate them.
// Pure progressive enhancement: nothing here changes behaviour for mouse
// users, and pages work the same if this file fails to load.
// ============================================================================
(function () {
  let seq = 0;
  const NATIVE = 'a,button,input,select,textarea,label,summary,option,details,tr,td,th,form';

  function enhance(root) {
    if (!root || !root.querySelectorAll) return;

    root.querySelectorAll('button[title]:not([aria-label]), a.btn[title]:not([aria-label])').forEach((el) => {
      if (!(el.textContent || '').trim()) el.setAttribute('aria-label', el.getAttribute('title'));
    });

    root.querySelectorAll('.field > label:not([for]), .ob-field > label:not([for])').forEach((label) => {
      const field = label.parentElement;
      const ctrls = field.querySelectorAll('input:not([type=hidden]), select, textarea');
      if (ctrls.length !== 1) return;
      const ctrl = ctrls[0];
      if (label.contains(ctrl)) return;
      if (!ctrl.id) { seq += 1; ctrl.id = `fld-auto-${seq}`; }
      label.setAttribute('for', ctrl.id);
    });

    root.querySelectorAll('[onclick]:not([role]):not([tabindex])').forEach((el) => {
      if (el.matches('.sidebar-backdrop')) return; // mouse-only dismiss layer
      // <a onclick> without href (e.g. sidebar nav) isn't focusable by default.
      const hreflessLink = el.matches('a:not([href])');
      if (!hreflessLink && (el.matches(NATIVE) || el.closest('button, a'))) return;
      el.setAttribute('role', hreflessLink ? 'link' : 'button');
      el.setAttribute('tabindex', '0');
    });
  }

  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.matches('a:not([href])[role="link"]') && e.key === 'Enter') { e.preventDefault(); el.click(); return; }
    if (el.getAttribute('role') !== 'button' || el.matches('button, a')) return;
    if (e.key === 'Enter') { e.preventDefault(); el.click(); }
    if (e.key === ' ') e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    const el = e.target;
    if (el instanceof HTMLElement && el.getAttribute('role') === 'button' && !el.matches('button, a') && e.key === ' ') el.click();
  });

  const start = () => {
    enhance(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) enhance(n.parentElement || n); });
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
