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
    return { username, orgSlug, parentOrgSlug };
  } catch {
    return null;
  }
}

export function setRememberedGoogleLogin({ username, orgSlug, parentOrgSlug = null } = {}) {
  try {
    const u = normalizeUsername(username);
    const s = normalizeOrgSlug(orgSlug);
    if (!u || !s) return;
    const parent = normalizeOrgSlug(parentOrgSlug) || null;
    const payload = { username: u, orgSlug: s, ts: Date.now() };
    if (parent) payload.parentOrgSlug = parent;
    localStorage.setItem(GOOGLE_SSO_STORAGE_KEY, JSON.stringify(payload));
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

