// ============================================================================
// API client for the migrated Node/Express + Azure backend.
// Replaces `supabaseClient` (config.js, @supabase/supabase-js) everywhere in
// this app. Two independent token stores, matching the backend's two
// separate JWT secrets (see backend/src/middleware/auth.js):
//   - candidate token -> localStorage 'wct_token'   (Authorization header on
//     every /api/applications, /api/onboarding, /api/exit-interviews,
//     /api/uploads call)
//   - admin token      -> localStorage 'wct_admin_token' (Authorization
//     header on every /api/admin/* call)
// ============================================================================

// Where the backend is. Each page sets `window.API_BASE_URL` in a small inline
// <script> before this file loads (on the live server: <same address>/api);
// local development falls back to localhost:3000.
const API_BASE_URL = window.API_BASE_URL || 'http://localhost:3000/api';

const TOKEN_KEY = 'wct_token';
const ADMIN_TOKEN_KEY = 'wct_admin_token';
const USER_KEY = 'wct_user'; // {id, email, name} — the login/register/oauth
// response's `user` object, cached here since the JWT itself only carries
// {sub, email} (see backend/src/routes/auth.js issueToken()), not the
// display name.

function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }
function getAdminToken() { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; }
function setAdminToken(t) { t ? localStorage.setItem(ADMIN_TOKEN_KEY, t) : localStorage.removeItem(ADMIN_TOKEN_KEY); }
function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
}
function setUser(u) { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); }
function clearSession() { setToken(null); setUser(null); }

/**
 * Core request helper. `opts.admin` picks which token to attach;
 * `opts.formData` sends a FormData body (file upload) instead of JSON.
 * Throws on any non-2xx response, with `.status` and `.data` (the parsed
 * error body, if any) attached — callers match the old
 * `const { data, error } = await supabaseClient.rpc(...)` shape by wrapping
 * calls in try/catch (see apiTry below) rather than every call site having
 * its own try/catch.
 */
// How long to wait before giving up on the server. Uploads get longer, since
// an 8MB file on a slow mobile connection can take a while.
const API_TIMEOUT_MS = 30000;
const UPLOAD_TIMEOUT_MS = 180000;

// Calls that need a signed-in candidate. Without a token they would only come
// back as "Missing bearer token", so they stop here with a clear message.
const CANDIDATE_ONLY = /^\/(applications|onboarding|uploads|exit-interviews|blacklist-check|me)\b/;

function sessionEndedError(admin) {
  const err = new Error(admin
    ? 'Your admin session has ended. Please sign in again.'
    : 'Your session has ended (you may have signed out in another tab). Please sign in again — everything you saved before is kept.');
  err.status = 401;
  err.sessionEnded = true;
  return err;
}

function friendlyStatusMessage(status) {
  if (status === 413) return 'This file is too large to upload. Please choose a smaller file (up to 8MB) or compress it into a ZIP file.';
  if (status === 429) return 'Too many attempts in a short time. Please wait a minute and try again.';
  if (status === 502 || status === 503 || status === 504) return 'The server is busy or restarting. Please wait a minute and try again.';
  if (status >= 500) return 'Something went wrong on our side. Please try again; if it keeps happening, contact HR.';
  return '';
}

/**
 * Core request helper. `opts.admin` picks which token to attach;
 * `opts.formData` sends a FormData body (file upload) instead of JSON.
 * Throws on any non-2xx response, with `.status` and `.data` (the parsed
 * error body, if any) attached — callers match the old
 * `const { data, error } = await supabaseClient.rpc(...)` shape by wrapping
 * calls in try/catch (see apiTry below) rather than every call site having
 * its own try/catch.
 *
 * Every call has a time limit (`opts.timeoutMs`). Reads and saves (GET,
 * PATCH, PUT) are tried once more after a dropped connection or a timeout;
 * anything that creates something (POST, uploads) is not, so it can't
 * happen twice.
 */
async function apiRequest(path, { method = 'GET', body, admin = false, formData = false, timeoutMs } = {}) {
  const token = admin ? getAdminToken() : getToken();
  if (!token && (admin ? /^\/admin\b/.test(path) && !/^\/admin\/auth\b/.test(path) : CANDIDATE_ONLY.test(path))) {
    const err = sessionEndedError(admin);
    try { window.dispatchEvent(new CustomEvent('wct:session-ended', { detail: { admin } })); } catch (e) { /* old browser */ }
    throw err;
  }
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (window.WCT_CLIENT_ID) headers['X-Client-Id'] = window.WCT_CLIENT_ID; // live updates ignore this tab's own changes
  if (body !== undefined && !formData) headers['Content-Type'] = 'application/json';

  const limit = timeoutMs || (formData ? UPLOAD_TIMEOUT_MS : API_TIMEOUT_MS);
  const retryable = method === 'GET' || method === 'PATCH' || method === 'PUT';

  let res;
  for (let attempt = 1; ; attempt += 1) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), limit) : null;
    try {
      res = await fetch(API_BASE_URL + path, {
        method,
        headers,
        body: body === undefined ? undefined : (formData ? body : JSON.stringify(body)),
        signal: ctrl ? ctrl.signal : undefined,
      });
      break;
    } catch (networkErr) {
      const timedOut = networkErr && networkErr.name === 'AbortError';
      if (retryable && attempt === 1) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      const err = new Error(timedOut
        ? (formData
          ? 'The upload took too long and was stopped. Please check your connection and try again, or try a smaller file.'
          : 'The server took too long to answer. Please check your connection and try again.')
        : 'Network error — could not reach the server. Please check your connection and try again.');
      err.status = 0;
      err.timeout = timedOut;
      err.cause = networkErr;
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  let data = null;
  let text = '';
  try { text = await res.text(); } catch (e) { text = ''; }
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = text; }
  }

  if (!res.ok) {
    const serverMsg = data && typeof data === 'object' && data.error;
    if (res.status === 401 && path !== '/auth/login' && !/^\/(auth|admin\/auth)\//.test(path)) {
      const err = sessionEndedError(admin);
      err.data = data;
      try { window.dispatchEvent(new CustomEvent('wct:session-ended', { detail: { admin } })); } catch (e) { /* old browser */ }
      throw err;
    }
    // A plain-text or HTML error page (e.g. from the web server in front of
    // the API) is never shown as the message.
    const message = serverMsg || friendlyStatusMessage(res.status) || res.statusText || 'Request failed';
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Supabase-style wrapper: returns { data, error } instead of throwing, so
 * call sites originally written as
 *   const { data, error } = await supabaseClient.rpc('rpc_x', {...});
 *   if (error) { ...handle... }
 * can become
 *   const { data, error } = await apiTry(() => api.get('/x'));
 *   if (error) { ...handle... }
 * with the smallest possible diff at each call site.
 */
async function apiTry(fn) {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

// Decodes a JWT's payload WITHOUT verifying its signature — only ever safe
// to use for reading display-only claims (name, email) out of a token this
// same browser just received directly from the provider/backend a moment
// ago. Never use this as an authorization check; the backend is what
// actually verifies tokens.
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

const api = {
  get: (path, opts) => apiRequest(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => apiRequest(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => apiRequest(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => apiRequest(path, { ...opts, method: 'DELETE' }),
  upload: (path, file, opts) => {
    const form = new FormData();
    form.append('file', file);
    return apiRequest(path, { ...opts, method: 'POST', body: form, formData: true });
  },
  getToken, setToken, getAdminToken, setAdminToken, getUser, setUser, clearSession,
};
