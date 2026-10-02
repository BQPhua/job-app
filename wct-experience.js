/* ==========================================================================
   WCT experience layer — shared by admin.html, index.html and login pages.
   window.WX gives every page the same:
     • motion       enter() stagger, countUp(), press ripple, view transition
     • toast()      small polite notices
     • celebrate()  one-off confetti burst (skipped for reduced motion)
     • tour         first-visit guided tour with Skip (spotlight + step card)
     • palette      Ctrl/⌘ K command palette (<dialog closedby="any">)
     • dialog()     simple info dialog (keyboard shortcuts, etc.)
     • keys()       page shortcuts that ignore typing in form fields
   No dependencies. Everything respects prefers-reduced-motion, and browser
   storage is only used for "tour already seen" (wrapped in try/catch).
   ========================================================================== */
(function () {
  'use strict';

  const doc = document;
  const reduce = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const hasPopover = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del(k) { try { window.localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };
  const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const modLabel = isMac ? '⌘' : 'Ctrl';

  // Put an element in the top layer when the Popover API exists (above
  // modals, sticky bars, the loading overlay); otherwise a fixed layer with
  // a very high z-index does the same job.
  function layerOpen(el) {
    if (hasPopover) { el.setAttribute('popover', 'manual'); doc.body.appendChild(el); try { el.showPopover(); } catch (e) { /* already open */ } }
    else { el.classList.add('wx-layer-fallback'); doc.body.appendChild(el); }
  }
  function layerClose(el) {
    if (hasPopover) { try { el.hidePopover(); } catch (e) { /* closed */ } }
    el.remove();
  }

  // ------------------------------------------------------------------------
  // Motion
  // ------------------------------------------------------------------------
  const STAGGER = [
    '.stat', '.ob-kpi', '.detail-section', '.review-block', '.draft-banner',
    '.apps-table tbody tr', '.history-table tbody tr', '.ob-table tbody tr', '.ob-task',
    '.an-card', '.an-kpi', '.chart-card', '.wx-stagger',
  ].join(',');

  /** Fade/rise the cards and rows of a freshly entered view, one after another. */
  function enter(scope, sel) {
    if (!scope || reduce()) return;
    const els = Array.from(scope.querySelectorAll(sel || STAGGER)).slice(0, 28);
    scope.classList.remove('wx-view'); void scope.offsetWidth; scope.classList.add('wx-view');
    els.forEach((el, i) => {
      el.style.setProperty('--wx-i', i);
      el.classList.remove('wx-in'); void el.offsetWidth; el.classList.add('wx-in');
    });
    setTimeout(() => { els.forEach((el) => el.classList.remove('wx-in')); scope.classList.remove('wx-view'); }, 700 + els.length * 35);
  }

  // Numbers tick from the last value shown to the new one, so a live update
  // that moves "New 4" to "New 5" visibly counts up. Keyed by the tile label.
  const lastCount = new Map();
  function countUp(scope, sel) {
    if (!scope) return;
    scope.querySelectorAll(sel || '.stat .n, .ob-kpi .n, [data-count]').forEach((el) => {
      if (el.hasAttribute('data-wx-to')) return; // already ticking (text is mid-count)
      const txt = el.textContent.trim();
      if (!/^\d{1,7}$/.test(txt)) return;
      const to = Number(txt);
      const host = el.closest('.stat, .ob-kpi, [data-count-key]');
      const key = el.getAttribute('data-count-key') || (host ? host.textContent.replace(/[\d–-]+/g, '').trim() : '') || el.id;
      if (!key) return;
      const from = lastCount.has(key) ? lastCount.get(key) : 0;
      lastCount.set(key, to);
      if (from === to || reduce()) return;
      const t0 = performance.now();
      const dur = Math.min(900, 320 + Math.abs(to - from) * 18);
      el.classList.add('wx-ticking');
      el.setAttribute('data-wx-to', String(to));
      const step = (now) => {
        if (!el.isConnected) return;
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(from + (to - from) * e));
        if (p < 1) requestAnimationFrame(step);
        else { el.textContent = String(to); el.classList.remove('wx-ticking'); el.removeAttribute('data-wx-to'); }
      };
      el.textContent = String(from);
      requestAnimationFrame(step);
    });
  }

  // Press ripple on buttons, tiles and nav links.
  const RIPPLE = '.btn, .wx-btn, .stat, .ob-kpi, .sidebar-nav a, .auth-oauth, .auth-submit, .ob-chip, .ob-seg button, .wx-ripple, .oauth-btn';
  doc.addEventListener('pointerdown', (e) => {
    if (reduce() || e.button !== 0) return;
    const host = e.target.closest && e.target.closest(RIPPLE);
    if (!host || host.disabled || host.getAttribute('aria-disabled') === 'true') return;
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const wrap = doc.createElement('span');
    wrap.className = 'wx-rp';
    wrap.setAttribute('aria-hidden', 'true');
    const dot = doc.createElement('span');
    const size = Math.max(r.width, r.height) * 2.2;
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - r.left - size / 2}px`;
    dot.style.top = `${e.clientY - r.top - size / 2}px`;
    wrap.appendChild(dot);
    host.appendChild(wrap);
    setTimeout(() => wrap.remove(), 650);
  }, { passive: true });

  /**
   * Run a DOM update as a view transition (cross-fade / directional slide)
   * where supported, then move focus to `focus` for keyboard and screen
   * reader users. Falls back to the plain update.
   */
  function transition(update, opts) {
    const o = opts || {};
    const settle = () => {
      const el = typeof o.focus === 'string' ? doc.querySelector(o.focus) : o.focus;
      if (el) {
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
      }
    };
    if (!doc.startViewTransition || reduce() || doc.hidden) {
      const r = update();
      if (o.fallbackEnter) enter(o.fallbackEnter());
      return Promise.resolve(r).then(settle);
    }
    const root = doc.documentElement;
    if (o.dir) root.setAttribute('data-wx-dir', o.dir);
    let t;
    try { t = doc.startViewTransition(update); } catch (e) { root.removeAttribute('data-wx-dir'); update(); settle(); return Promise.resolve(); }
    t.finished.finally(() => { root.removeAttribute('data-wx-dir'); settle(); });
    return t.updateCallbackDone.catch(() => {});
  }

  // ------------------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------------------
  function toast(msg, opts) {
    const o = opts || {};
    let host = doc.getElementById('wxToasts');
    if (!host) {
      host = doc.createElement('div');
      host.id = 'wxToasts';
      host.className = 'wx-toasts';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      doc.body.appendChild(host);
    }
    const t = doc.createElement('div');
    t.className = `wx-toast ${o.kind ? `is-${o.kind}` : ''}`;
    t.innerHTML = `${o.kind === 'ok' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' : ''}<span></span>`;
    t.querySelector('span').textContent = String(msg);
    host.appendChild(t);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 260); }, o.timeout || 2600);
  }

  // ------------------------------------------------------------------------
  // Celebrate — a short confetti burst in brand colours.
  // ------------------------------------------------------------------------
  function celebrate() {
    if (reduce()) return;
    const c = doc.createElement('canvas');
    c.className = 'wx-confetti';
    c.setAttribute('aria-hidden', 'true');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth; const H = window.innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    doc.body.appendChild(c);
    const ctx = c.getContext('2d');
    if (!ctx) { c.remove(); return; }
    ctx.scale(dpr, dpr);
    const colours = ['#0F172A', '#D7141A', '#0369A1', '#38BDF8', '#F59E0B', '#CBD5E1'];
    const parts = Array.from({ length: 140 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? -10 : W + 10, y: H * (0.55 + Math.random() * 0.25),
        vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 8), vy: -(9 + Math.random() * 9),
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        col: colours[i % colours.length],
      };
    });
    const t0 = performance.now();
    const frame = (now) => {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      parts.forEach((p) => {
        p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - t / 2400);
        ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (t < 2400) requestAnimationFrame(frame); else c.remove();
    };
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------------
  // Guided tour
  // ------------------------------------------------------------------------
  // step = {
  //   target: 'css selector' | () => Element   (none = centred card)
  //   title, body (HTML), placement: 'right' | 'bottom' | 'left' | 'top'
  //   kind: 'intro' | 'outro'          intro shows Start / Skip; outro Finish
  //   optional: true                    skip the step if the target is absent
  //   before: async () => {}            e.g. open the right page first
  //   icon: svg string                  shown on intro/outro cards
  // }
  const tour = (function () {
    let st = null; // { cfg, steps, i, root, spot, card, prevFocus, raf }

    const doneKey = (key) => `wct_tour:${key}`;
    const isDone = (key) => !!store.get(doneKey(key));
    const reset = (key) => store.del(doneKey(key));

    function resolve(step) {
      if (!step.target) return null;
      let el = null;
      try { el = typeof step.target === 'function' ? step.target() : doc.querySelector(step.target); } catch (e) { el = null; }
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if ((!r.width && !r.height) || cs.visibility === 'hidden' || cs.display === 'none') return null;
      // Off-canvas (e.g. the mobile sidebar drawer) counts as not visible.
      if (r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0) return null;
      return el;
    }

    function build() {
      const root = doc.createElement('div');
      root.className = 'wx-tour';
      root.innerHTML = `
        <div class="wx-tour-catch"></div>
        <div class="wx-tour-dim"></div>
        <div class="wx-tour-spot"></div>
        <section class="wx-tour-card" role="dialog" aria-modal="true" aria-labelledby="wxTourTitle" aria-describedby="wxTourBody">
          <div class="wx-tour-top">
            <span class="wx-tour-count" id="wxTourCount"></span>
            <button type="button" class="wx-tour-x" data-act="skip" aria-label="Skip tour"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          <div class="wx-tour-icon" aria-hidden="true"></div>
          <h2 class="wx-tour-title" id="wxTourTitle"></h2>
          <div class="wx-tour-body" id="wxTourBody"></div>
          <div class="wx-tour-bar" aria-hidden="true"><i></i></div>
          <div class="wx-tour-foot">
            <button type="button" class="wx-tour-link" data-act="skip">Skip tour</button>
            <div class="wx-tour-actions">
              <button type="button" class="wx-btn" data-act="back">Back</button>
              <button type="button" class="wx-btn wx-btn-primary" data-act="next">Next</button>
            </div>
          </div>
        </section>`;
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (b) { act(b.getAttribute('data-act')); return; }
        if (e.target.classList.contains('wx-tour-catch')) {
          // Clicks outside the card don't dismiss by accident — nudge instead.
          const card = st && st.card;
          if (card && !reduce()) { card.classList.remove('wx-nudge'); void card.offsetWidth; card.classList.add('wx-nudge'); }
        }
      });
      root.addEventListener('keydown', onKey);
      return root;
    }

    function onKey(e) {
      if (!st) return;
      if (e.key === 'Escape') { e.preventDefault(); act('skip'); }
      else if (e.key === 'ArrowRight' && !isTyping(e.target)) { e.preventDefault(); act('next'); }
      else if (e.key === 'ArrowLeft' && !isTyping(e.target)) { e.preventDefault(); act('back'); }
      else if (e.key === 'Tab') {
        const f = Array.from(st.card.querySelectorAll('button:not([hidden]):not([disabled])')).filter((b) => b.offsetParent !== null);
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    function act(a) {
      if (!st) return;
      const step = st.steps[st.i];
      if (a === 'skip') return end(step && step.kind === 'outro' ? 'done' : 'skipped');
      if (a === 'next') return st.i >= st.steps.length - 1 ? end('done') : go(st.i + 1, 1);
      if (a === 'back') return go(st.i - 1, -1);
    }

    async function go(i, dir) {
      if (!st || i < 0 || i >= st.steps.length) return;
      const token = (st.token = (st.token || 0) + 1);
      const step = st.steps[i];
      if (step.before) { try { await step.before(); } catch (e) { /* keep touring */ } }
      if (!st || st.token !== token) return;
      await new Promise((r) => setTimeout(r, step.before ? 120 : 0));
      let el = resolve(step);
      if (step.target && !el && step.optional) {
        const next = i + (dir || 1);
        if (next >= 0 && next < st.steps.length) return go(next, dir || 1);
        return end('done');
      }
      st.i = i;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 70 || r.bottom > window.innerHeight - 40) {
          el.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' });
          await new Promise((res) => setTimeout(res, reduce() ? 0 : 380));
          el = resolve(step) || el;
        }
      }
      paint(step, el);
    }

    function paint(step, el) {
      const { card, spot, steps } = st;
      const counted = steps.filter((s) => !s.kind);
      const n = counted.indexOf(step);
      card.classList.toggle('is-intro', step.kind === 'intro');
      card.classList.toggle('is-outro', step.kind === 'outro');
      card.classList.toggle('is-center', !el);
      card.querySelector('#wxTourCount').textContent = n >= 0 ? `Step ${n + 1} of ${counted.length}` : (step.kind === 'intro' ? (st.cfg.label || 'Quick tour') : 'All set');
      const icon = card.querySelector('.wx-tour-icon');
      icon.innerHTML = step.icon || '';
      icon.hidden = !step.icon;
      card.querySelector('#wxTourTitle').textContent = step.title || '';
      card.querySelector('#wxTourBody').innerHTML = step.body || '';
      card.querySelector('.wx-tour-bar i').style.width = `${counted.length ? Math.max(0, n + 1) / counted.length * 100 : 0}%`;
      card.querySelector('.wx-tour-bar').hidden = n < 0;
      const back = card.querySelector('[data-act="back"]');
      const next = card.querySelector('[data-act="next"]');
      const skipLink = card.querySelector('.wx-tour-link');
      back.hidden = step.kind === 'intro' || st.i === 0;
      skipLink.hidden = step.kind === 'outro';
      skipLink.textContent = step.kind === 'intro' ? (st.cfg.skipLabel || "Skip, I know my way around") : 'Skip tour';
      next.textContent = step.kind === 'intro' ? (st.cfg.startLabel || 'Start the tour') : (st.i >= steps.length - 1 ? (step.finishLabel || 'Finish') : 'Next');
      card.classList.remove('wx-step-in'); void card.offsetWidth; card.classList.add('wx-step-in');
      st.el = el;
      st.step = step;
      place();
      next.focus({ preventScroll: true });
    }

    // The dimmed backdrop is one full-screen layer with a rounded hole cut
    // out (clip-path, even-odd), so the highlighted element stays bright
    // and the hole can glide between steps.
    function hole(x, y, w, h, r) {
      const vw = window.innerWidth; const vh = window.innerHeight;
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      if (w < 1 || h < 1) { st.dim.style.clipPath = `path(evenodd, 'M0 0H${vw}V${vh}H0Z M${vw / 2} ${vh / 2}h1v1h-1Z')`; return; }
      const p = `M0 0H${vw}V${vh}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
      st.dim.style.clipPath = `path(evenodd, '${p}')`;
    }

    function place() {
      if (!st) return;
      const { card, spot, step } = st;
      const el = st.el && st.el.isConnected ? st.el : (st.step ? resolve(st.step) : null);
      st.el = el;
      const vw = window.innerWidth; const vh = window.innerHeight;
      if (!el) {
        spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
        spot.classList.add('is-off');
        hole(vw / 2, vh / 2, 0, 0, 0);
        card.style.left = ''; card.style.top = '';
        return;
      }
      spot.classList.remove('is-off');
      const pad = step.padding != null ? step.padding : 8;
      const r = el.getBoundingClientRect();
      const s = { left: Math.max(4, r.left - pad), top: Math.max(4, r.top - pad) };
      s.width = Math.min(vw - 8, r.right + pad) - s.left;
      s.height = Math.min(vh - 8, r.bottom + pad) - s.top;
      const radius = Math.min(16, parseFloat(getComputedStyle(el).borderRadius) + 4 || 10);
      spot.style.cssText = `left:${s.left}px;top:${s.top}px;width:${s.width}px;height:${s.height}px;border-radius:${radius}px;`;
      hole(s.left, s.top, s.width, s.height, radius);
      if (vw < 640) { card.style.left = ''; card.style.top = ''; card.classList.add('is-docked'); return; }
      card.classList.remove('is-docked');
      const cw = card.offsetWidth; const ch = card.offsetHeight; const gap = 16;
      const fits = {
        right: s.left + s.width + gap + cw <= vw - 12,
        left: s.left - gap - cw >= 12,
        bottom: s.top + s.height + gap + ch <= vh - 12,
        top: s.top - gap - ch >= 12,
      };
      const order = [step.placement, 'right', 'bottom', 'left', 'top'].filter(Boolean);
      const side = order.find((p) => fits[p]) || 'bottom';
      let x; let y;
      if (side === 'right') { x = s.left + s.width + gap; y = s.top; }
      else if (side === 'left') { x = s.left - gap - cw; y = s.top; }
      else if (side === 'bottom') { x = s.left; y = s.top + s.height + gap; }
      else { x = s.left; y = s.top - gap - ch; }
      x = Math.max(12, Math.min(x, vw - cw - 12));
      y = Math.max(12, Math.min(y, vh - ch - 12));
      card.style.left = `${x}px`; card.style.top = `${y}px`;
      card.setAttribute('data-side', side);
    }

    const onMove = () => { if (!st) return; cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(place); };

    function start(cfg) {
      if (st) end('replaced', true);
      const steps = (cfg.steps || []).filter(Boolean);
      if (!steps.length) return;
      const root = build();
      st = { cfg, steps, i: 0, root, spot: root.querySelector('.wx-tour-spot'), dim: root.querySelector('.wx-tour-dim'), card: root.querySelector('.wx-tour-card'), prevFocus: doc.activeElement };
      layerOpen(root);
      doc.documentElement.classList.add('wx-touring');
      window.addEventListener('resize', onMove);
      window.addEventListener('scroll', onMove, true);
      go(0, 1);
    }

    function end(reason, silent) {
      if (!st) return;
      const { cfg, root, prevFocus } = st;
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      cancelAnimationFrame(st.raf);
      st = null;
      doc.documentElement.classList.remove('wx-touring');
      root.classList.add('is-leaving');
      setTimeout(() => layerClose(root), reduce() ? 0 : 180);
      if (cfg.key && reason !== 'replaced') store.set(doneKey(cfg.key), reason);
      if (prevFocus && prevFocus.isConnected && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      if (!silent && cfg.onEnd) cfg.onEnd(reason);
    }

    return { start, end: (r) => end(r || 'skipped'), isDone, reset, get active() { return !!st; }, reposition: onMove };
  })();

  // ------------------------------------------------------------------------
  // Dialog helper (closedby="any" + fallback light dismiss)
  // ------------------------------------------------------------------------
  function lightDismiss(dlg) {
    dlg.setAttribute('closedby', 'any');
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dlg.addEventListener('click', (e) => {
        if (e.target !== dlg) return;
        const r = dlg.getBoundingClientRect();
        const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
        if (!inside) dlg.close();
      });
    }
  }

  function dialog(opts) {
    const o = opts || {};
    const dlg = doc.createElement('dialog');
    dlg.className = `wx-dialog ${o.className || ''}`;
    dlg.setAttribute('aria-labelledby', 'wxDlgTitle');
    dlg.innerHTML = `
      <div class="wx-dialog-head"><h2 id="wxDlgTitle">${esc(o.title || '')}</h2>
        <button type="button" class="wx-dialog-x" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
      <div class="wx-dialog-body">${o.html || ''}</div>`;
    lightDismiss(dlg);
    dlg.querySelector('.wx-dialog-x').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { dlg.remove(); if (o.onClose) o.onClose(); });
    doc.body.appendChild(dlg);
    dlg.showModal();
    return dlg;
  }

  // ------------------------------------------------------------------------
  // Command palette
  // ------------------------------------------------------------------------
  const palette = (function () {
    let dlg = null; let input; let list; let items = []; let flat = []; let active = 0; let source = null;

    function score(text, q) {
      if (!q) return 1;
      const t = text.toLowerCase();
      const idx = t.indexOf(q);
      if (idx === 0) return 100;
      if (idx > 0) return 80 - Math.min(40, idx) + (/[\s·(—-]/.test(t[idx - 1]) ? 15 : 0);
      let ti = 0; let hits = 0;
      for (const ch of q) { ti = t.indexOf(ch, ti); if (ti < 0) return 0; ti += 1; hits += 1; }
      return hits ? 20 : 0;
    }

    function ensure() {
      if (dlg) return;
      dlg = doc.createElement('dialog');
      dlg.className = 'wx-pal';
      dlg.setAttribute('aria-label', 'Search and jump to');
      dlg.innerHTML = `
        <div class="wx-pal-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="text" role="combobox" aria-expanded="true" aria-controls="wxPalList" aria-autocomplete="list" autocomplete="off" spellcheck="false">
          <kbd>Esc</kbd>
        </div>
        <ul class="wx-pal-list" id="wxPalList" role="listbox" aria-label="Results"></ul>
        <div class="wx-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>${modLabel}</kbd><kbd>K</kbd> toggle</span></div>`;
      lightDismiss(dlg);
      input = dlg.querySelector('input');
      list = dlg.querySelector('ul');
      input.addEventListener('input', draw);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); run(active); }
      });
      list.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) run(Number(li.getAttribute('data-i'))); });
      list.addEventListener('mousemove', (e) => { const li = e.target.closest('[data-i]'); if (li) setActive(Number(li.getAttribute('data-i')), false); });
      doc.body.appendChild(dlg);
    }

    function draw() {
      const q = input.value.trim().toLowerCase();
      const groups = (typeof source === 'function' ? source(q) : source) || [];
      flat = [];
      let html = '';
      // Rank inside each group, then (when searching) put the group with the
      // best match first, so "farid" opens Farid's case rather than a fuzzy
      // hit in an earlier group.
      const rankedGroups = groups.map((g, gi) => {
        const ranked = (g.items || [])
          .map((it) => ({ it, s: Math.max(score(it.label, q), score(`${it.keywords || ''} ${it.hint || ''}`, q) * 0.6) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, g.limit || 6);
        return { g, gi, ranked, best: ranked.length ? ranked[0].s : 0 };
      }).filter((x) => x.ranked.length);
      if (q) rankedGroups.sort((a, b) => (b.best - a.best) || (a.gi - b.gi));
      rankedGroups.forEach(({ g, ranked }) => {
        html += `<li class="wx-pal-group" role="presentation">${esc(g.title)}</li>`;
        ranked.forEach(({ it }) => {
          const i = flat.push(it) - 1;
          html += `<li class="wx-pal-item" role="option" id="wxPalOpt${i}" data-i="${i}" aria-selected="false">
            <span class="wx-pal-ic" aria-hidden="true">${it.icon || ''}</span>
            <span class="wx-pal-label">${esc(it.label)}</span>
            ${it.hint ? `<span class="wx-pal-hint">${esc(it.hint)}</span>` : ''}</li>`;
        });
      });
      list.innerHTML = html || `<li class="wx-pal-empty" role="presentation">No matches for “${esc(input.value.trim())}”</li>`;
      setActive(0, false);
    }

    function setActive(i, scroll) {
      if (!flat.length) { input.removeAttribute('aria-activedescendant'); return; }
      active = (i + flat.length) % flat.length;
      list.querySelectorAll('[aria-selected="true"]').forEach((el) => el.setAttribute('aria-selected', 'false'));
      const el = doc.getElementById(`wxPalOpt${active}`);
      if (el) { el.setAttribute('aria-selected', 'true'); if (scroll !== false) el.scrollIntoView({ block: 'nearest' }); }
      input.setAttribute('aria-activedescendant', `wxPalOpt${active}`);
    }
    const move = (d) => setActive(active + d);

    function run(i) {
      const it = flat[i];
      if (!it) return;
      dlg.close();
      setTimeout(() => it.run(input.value.trim()), 0);
    }

    function open(opts) {
      ensure();
      source = opts.source;
      input.placeholder = opts.placeholder || 'Search or jump to…';
      input.value = '';
      draw();
      if (!dlg.open) dlg.showModal();
      input.focus();
    }
    function toggle(opts) { if (dlg && dlg.open) dlg.close(); else open(opts); }

    return { open, toggle, refresh: () => { if (dlg && dlg.open) draw(); }, get isOpen() { return !!(dlg && dlg.open); } };
  })();

  // ------------------------------------------------------------------------
  // Shortcuts: keys({ 'mod+k': fn, '/': fn, '?': fn, 'g d': fn })
  // ------------------------------------------------------------------------
  function keys(map) {
    let pending = null; let timer = null;
    doc.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || tour.active) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k' && map['mod+k']) { e.preventDefault(); map['mod+k'](e); return; }
      if (mod || e.altKey || isTyping(e.target) || doc.querySelector('dialog[open]')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (pending) {
        const fn = map[`${pending} ${k}`];
        pending = null; clearTimeout(timer);
        if (fn) { e.preventDefault(); fn(e); }
        return;
      }
      if (Object.keys(map).some((s) => s.startsWith(`${k} `))) { pending = k; timer = setTimeout(() => { pending = null; }, 1200); return; }
      if (map[k]) { e.preventDefault(); map[k](e); }
    });
  }

  window.WX = { enter, countUp, transition, toast, celebrate, tour, palette, dialog, keys, esc, reduce, modLabel, store };
})();
