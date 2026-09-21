const STORAGE_KEY = '__pt_login_remember__';
const GOOGLE_SSO_STORAGE_KEY = '__pt_google_sso_remember__';
const SCHOOL_STAFF_PASSWORD_LOGIN_KEY = '__pt_school_staff_password_login_remember__';

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
    const parentOrgSlug = normalizeOrgSlug(parsed?.parentOrgSlug) || null;
    return { username, orgSlug, parentOrgSlug };
  } catch {
    return null;
  }
}

export function setRememberedLogin({ username, orgSlug, parentOrgSlug = null } = {}) {
  try {
    const u = normalizeUsername(username);
    const s = normalizeOrgSlug(orgSlug);
    if (!u || !s) return;
    const parent = normalizeOrgSlug(parentOrgSlug) || null;
    const payload = { username: u, orgSlug: s, ts: Date.now() };
    if (parent) payload.parentOrgSlug = parent;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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
    const parentOrgSlug = normalizeOrgSlug(parsed?.parentOrgSlug) || null;
    return { username, orgSlug, parentOrgSlug, displayName: String(parsed?.displayName || '').trim().slice(0, 160), loginHint: String(parsed?.loginHint || username).trim().slice(0, 254) };
  } catch {
    return null;
  }
}

export function setRememberedGoogleLogin({ username, orgSlug, parentOrgSlug = null, displayName = '', loginHint = '' } = {}) {
  try {
    const u = normalizeUsername(username);
    const s = normalizeOrgSlug(orgSlug);
    if (!u || !s) return;
    const parent = normalizeOrgSlug(parentOrgSlug) || null;
    const payload = { username: u, orgSlug: s, displayName: String(displayName || '').trim().slice(0, 160), loginHint: String(loginHint || u).trim().slice(0, 254), ts: Date.now() };
    if (parent) payload.parentOrgSlug = parent;
    localStorage.setItem(GOOGLE_SSO_STORAGE_KEY, JSON.stringify(payload));
    // Keep the canonical Google account in sync with the username shortcut;
    // an older typed alias must not hide the most recently remembered SSO account.
    setRememberedLogin({ username: u, orgSlug: s, parentOrgSlug: parent });
  } catch {
    // ignore
  }
}

export function getRememberedSchoolStaffPasswordLogin() {
  try {
    const raw = localStorage.getItem(SCHOOL_STAFF_PASSWORD_LOGIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const username = normalizeUsername(parsed?.username);
    const orgSlug = normalizeOrgSlug(parsed?.orgSlug);
    if (!username || !orgSlug) return null;
    const parentOrgSlug = normalizeOrgSlug(parsed?.parentOrgSlug) || null;
    return { username, orgSlug, parentOrgSlug };
  } catch {
    return null;
  }
}

export function setRememberedSchoolStaffPasswordLogin({ username, orgSlug, parentOrgSlug = null } = {}) {
  try {
    const u = normalizeUsername(username);
    const s = normalizeOrgSlug(orgSlug);
    if (!u || !s) return;
    const parent = normalizeOrgSlug(parentOrgSlug) || null;
    const payload = { username: u, orgSlug: s, ts: Date.now() };
    if (parent) payload.parentOrgSlug = parent;
    localStorage.setItem(SCHOOL_STAFF_PASSWORD_LOGIN_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function clearRememberedSchoolStaffPasswordLogin(orgSlug = null) {
  try {
    if (!orgSlug) {
      localStorage.removeItem(SCHOOL_STAFF_PASSWORD_LOGIN_KEY);
      return;
    }
    const remembered = getRememberedSchoolStaffPasswordLogin();
    const target = normalizeOrgSlug(orgSlug);
    if (!remembered || remembered.orgSlug !== target) return;
    localStorage.removeItem(SCHOOL_STAFF_PASSWORD_LOGIN_KEY);
  } catch {
    // ignore
  }
}


export function clearRememberedGoogleLogin(orgSlug = null) {
  try {
    if (!orgSlug || getRememberedGoogleLogin()?.orgSlug === normalizeOrgSlug(orgSlug)) {
      localStorage.removeItem(GOOGLE_SSO_STORAGE_KEY);
    }
  } catch { /* Storage may be disabled. */ }
}

// A branded portal must never display another agency's saved account.
export function getPortalLoginMemory(orgSlug, { username = '', allowGoogle = true } = {}) {
  const slug = normalizeOrgSlug(orgSlug);
  const login = getRememberedLogin();
  const google = allowGoogle ? getRememberedGoogleLogin() : null;
  const matches = value => value && (!slug || value.orgSlug === slug);
  const restored = normalizeUsername(username) || (matches(login) ? login.username : '') || (matches(google) ? google.username : '');
  return {
    username: restored,
    remembered: Boolean(matches(login) && restored.toLowerCase() === login.username.toLowerCase()),
    google: matches(google) && restored.toLowerCase() === google.username.toLowerCase() ? google : null
  };
}
