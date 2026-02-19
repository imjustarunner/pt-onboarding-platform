const STORAGE_KEY = '__pt_login_remember__';
const GOOGLE_SSO_STORAGE_KEY = '__pt_google_sso_remember__';

function normalizeUsername(value) {
  return String(value || '').trim();
}

function normalizeOrgSlug(value) {
  return String(value || '').trim().toLowerCase();
}

export function getRememberedLogin() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const username = normalizeUsername(parsed?.username);
    const orgSlug = normalizeOrgSlug(parsed?.orgSlug);
    if (!username || !orgSlug) return null;
    return { username, orgSlug };
  } catch {
    return null;
  }
}

export function setRememberedLogin({ username, orgSlug } = {}) {
  try {
    const u = normalizeUsername(username);
    const s = normalizeOrgSlug(orgSlug);
    if (!u || !s) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: u, orgSlug: s, ts: Date.now() }));
  } catch {
    // ignore
  }
}

export function clearRememberedLogin() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getRememberedGoogleLogin() {
  try {
    const raw = localStorage.getItem(GOOGLE_SSO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const username = normalizeUsername(parsed?.username);
    const orgSlug = normalizeOrgSlug(parsed?.orgSlug);
    if (!username || !orgSlug) return null;
    return { username, orgSlug };
  } catch {
    return null;
  }
}

export function setRememberedGoogleLogin({ username, orgSlug } = {}) {
  try {
    const u = normalizeUsername(username);
    const s = normalizeOrgSlug(orgSlug);
    if (!u || !s) return;
    localStorage.setItem(GOOGLE_SSO_STORAGE_KEY, JSON.stringify({ username: u, orgSlug: s, ts: Date.now() }));
  } catch {
    // ignore
  }
}

