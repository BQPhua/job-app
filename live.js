/* ============================================================================
 * LIVE UPDATES (admin.html)
 *
 * Keeps one open connection to GET /api/admin/events (Server-Sent Events,
 * read with fetch so the sign-in token travels in a header, never the URL).
 * The server only says WHICH area changed ("applications" / "offboarding",
 * plus the case id). The screen then re-fetches through the normal API, so
 * every viewer still only sees their own business unit.
 *
 * Rules so nothing moves under the user's hands:
 *  - changes this tab made itself are ignored (X-Client-Id echo)
 *  - several changes within a moment are merged into one refresh
 *  - an open case drawer is never rewritten; it shows an "Updated — Reload" bar
 *  - lists don't refresh while a dialog is open or the user is typing in the
 *    search/filter bar; they catch up as soon as that's done
 * ========================================================================== */
(function () {
  const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2);
  window.WCT_CLIENT_ID = id; // api.js sends this as X-Client-Id
})();

const LIVE = { ctrl: null, state: 'off', retryMs: 2000, pending: {}, timer: null, deferTimer: null };

function liveSetState(state) {
  LIVE.state = state;
  const el = document.getElementById('liveDot');
  if (!el) return;
  el.dataset.state = state;
  const label = { live: 'Live', connecting: 'Connecting…', reconnecting: 'Reconnecting…', off: '' }[state];
  el.textContent = label;
  el.title = state === 'live' ? 'Live: changes by others appear automatically'
    : state === 'off' ? '' : 'Live updates paused. Trying to reconnect.';
}

function liveStart() {
  if (LIVE.ctrl || typeof api === 'undefined' || !api.getAdminToken()) return;
  LIVE.ctrl = new AbortController();
  liveSetState('connecting');
  liveLoop(LIVE.ctrl.signal);
}

function liveStop() {
  if (LIVE.ctrl) LIVE.ctrl.abort();
  LIVE.ctrl = null;
  clearTimeout(LIVE.timer); clearTimeout(LIVE.deferTimer);
  LIVE.pending = {};
  liveSetState('off');
}

async function liveLoop(signal) {
  while (!signal.aborted) {
    try {
      const res = await fetch(API_BASE_URL + '/admin/events', {
        headers: { Authorization: 'Bearer ' + api.getAdminToken(), Accept: 'text/event-stream' },
        cache: 'no-store',
        signal,
      });
      if (res.status === 401) { liveStop(); return; } // signed out / expired: the app handles that
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      liveSetState('live');
      LIVE.retryMs = 2000;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
          if (data) { try { liveOnEvent(JSON.parse(data)); } catch (e) { /* ignore a bad line */ } }
        }
      }
    } catch (e) {
      if (signal.aborted) return;
    }
    if (signal.aborted) return;
    // Lost the connection (server restart, network blip): back off and retry,
    // then catch up on anything missed while away.
    liveSetState('reconnecting');
    await new Promise((r) => setTimeout(r, LIVE.retryMs));
    LIVE.retryMs = Math.min(LIVE.retryMs * 2, 30000);
    LIVE.pending.applications = LIVE.pending.applications || { cases: new Set() };
    LIVE.pending.offboarding = LIVE.pending.offboarding || { cases: new Set() };
  }
}

function liveOnEvent(e) {
  if (!e || !e.area || e.client === window.WCT_CLIENT_ID) return;
  const p = LIVE.pending[e.area] || (LIVE.pending[e.area] = { cases: new Set() });
  if (e.case_id) p.cases.add(e.case_id);
  clearTimeout(LIVE.timer);
  LIVE.timer = setTimeout(liveFlush, 700); // merge bursts into one refresh
}

/** True while the user is busy in a way a refresh would disturb. */
function liveUserBusy() {
  const a = document.activeElement;
  if (document.querySelector('dialog[open]:not(#obDrawer)') || document.getElementById('obModal')) return true;
  if (a && a.closest && (a.closest('.ob-toolbar') || a.closest('.toolbar') || a.closest('.search-box'))) return true;
  return false;
}

function liveFlush() {
  if (typeof adminToken === 'undefined' || !adminToken) { LIVE.pending = {}; return; }
  const p = LIVE.pending;

  // An open offboarding case that changed: offer a reload, never overwrite.
  if (p.offboarding && typeof OB !== 'undefined' && OB.drawer && (p.offboarding.cases.size === 0 || p.offboarding.cases.has(OB.drawer.id))) {
    liveShowDrawerNotice();
  }

  if (liveUserBusy()) { // try again shortly; keep what's pending
    clearTimeout(LIVE.deferTimer);
    LIVE.deferTimer = setTimeout(liveFlush, 2500);
    return;
  }
  LIVE.pending = {};

  if (p.applications) {
    if (currentView === 'home' && !selectedApp) { loadApplications(); loadStats(); }
    else if (currentView === 'home' && selectedApp && typeof uiToast === 'function') uiToast('New changes in applications. They’ll show when you close this one.');
  }
  if (p.offboarding && typeof obLoadTasks === 'function') {
    obLoadTasks().then(() => {
      if (currentView !== 'offboarding' || OB.drawer) return;
      if (OB.view === 'all') obLoadList(); else obRenderResults();
    });
  }
}

function liveShowDrawerNotice() {
  const d = document.getElementById('obDrawer');
  if (!d || !d.open || d.querySelector('.live-notice')) return;
  const bar = document.createElement('div');
  bar.className = 'live-notice';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>Someone else just updated this case.</span> <button type="button" class="btn btn-primary btn-sm">Reload</button>';
  bar.querySelector('button').onclick = () => { bar.remove(); obReloadCase('Case reloaded with the latest changes.'); };
  const head = d.querySelector('.ob-drawer-head');
  (head || d).appendChild(bar);
}

// Re-check right away when the tab comes back to the foreground, in case the
// connection dropped while the laptop slept.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && typeof adminToken !== 'undefined' && adminToken && !LIVE.ctrl) liveStart();
});
