const STORAGE_KEY = '__pt_login_remember__';
const GOOGLE_SSO_STORAGE_KEY = '__pt_google_sso_remember__';
const SCHOOL_STAFF_PASSWORD_LOGIN_KEY = '__pt_school_staff_password_login_remember__';

function normalizeUsername(value) {
  return String(value || '').trim();
}

function normalizeOrgSlug(value) {
  return String(value || '').trim().toLowerCase();
}

// Keep each portal's shortcut independently. The legacy key remains the most
// recent account for the unscoped platform login and older app versions.
function readRecord(key, orgSlug = '') {
  const slug = normalizeOrgSlug(orgSlug);
  if (slug) {
    const records = JSON.parse(localStorage.getItem(`${key}:portals`) || '{}');
    if (Object.hasOwn(records, slug)) return records[slug];
  }
  const latest = JSON.parse(localStorage.getItem(key) || 'null');
  return !slug || normalizeOrgSlug(latest?.orgSlug) === slug ? latest : null;
}
function writeRecord(key, payload) {
  let records = {};
  try { records = JSON.parse(localStorage.getItem(`${key}:portals`) || '{}') || {}; } catch { /* repair malformed storage */ }
  let previous;
  try { previous = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* optional legacy record */ }
  if (previous?.orgSlug) records = { ...records, [previous.orgSlug]: previous };
  localStorage.setItem(`${key}:portals`, JSON.stringify({ ...records, [payload.orgSlug]: payload }));
  localStorage.setItem(key, JSON.stringify(payload));
}
function clearRecord(key, orgSlug = '') {
  const slug = normalizeOrgSlug(orgSlug);
  if (!slug) { localStorage.removeItem(key); localStorage.removeItem(`${key}:portals`); return; }
  const records = JSON.parse(localStorage.getItem(`${key}:portals`) || '{}');
  delete records[slug];
  localStorage.setItem(`${key}:portals`, JSON.stringify(records));
  const latest = JSON.parse(localStorage.getItem(key) || 'null');
  if (normalizeOrgSlug(latest?.orgSlug) === slug) localStorage.removeItem(key);
}

export function getRememberedLogin(portalSlug = '') {
  try {
    const parsed = readRecord(STORAGE_KEY, portalSlug);
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
    writeRecord(STORAGE_KEY, payload);
  } catch {
    // ignore
  }
}

export function clearRememberedLogin(orgSlug = '') {
  try {
    clearRecord(STORAGE_KEY, orgSlug);
  } catch {
    // ignore
  }
}

export function getRememberedGoogleLogin(portalSlug = '') {
  try {
    const parsed = readRecord(GOOGLE_SSO_STORAGE_KEY, portalSlug);
    const username = normalizeUsername(parsed?.username);
    const orgSlug = normalizeOrgSlug(parsed?.orgSlug);
    if (!username || !orgSlug) return null;
    const parentOrgSlug = normalizeOrgSlug(parsed?.parentOrgSlug) || null;
    return { username, orgSlug, parentOrgSlug, displayName: String(parsed?.displayName || '').trim().slice(0, 160), loginHint: String(parsed?.loginHint || username).trim().slice(0, 254), organizationName: String(parsed?.organizationName || '').trim().slice(0, 160), title: String(parsed?.title || '').trim().slice(0, 160) };
  } catch {
    return null;
  }
}

export function setRememberedGoogleLogin({ username, orgSlug, parentOrgSlug = null, displayName = '', loginHint = '', organizationName = '', title = '' } = {}) {
  try {
    const u = normalizeUsername(username);
    const s = normalizeOrgSlug(orgSlug);
    if (!u || !s) return;
    const parent = normalizeOrgSlug(parentOrgSlug) || null;
    const previous = getRememberedGoogleLogin(s);
    const sameAccount = previous?.orgSlug === s && previous.username.toLowerCase() === u.toLowerCase();
    const saved = sameAccount ? previous : {};
    const payload = {
      username: u, orgSlug: s,
      displayName: String(displayName || saved.displayName || '').trim().slice(0, 160),
      loginHint: String(loginHint || saved.loginHint || u).trim().slice(0, 254),
      organizationName: String(organizationName || saved.organizationName || '').trim().slice(0, 160),
      title: String(title || saved.title || '').trim().slice(0, 160),
      ts: Date.now()
    };
    if (parent) payload.parentOrgSlug = parent;
    writeRecord(GOOGLE_SSO_STORAGE_KEY, payload);
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
    clearRecord(GOOGLE_SSO_STORAGE_KEY, orgSlug);
  } catch { /* Storage may be disabled. */ }
}

// A branded portal must never display another agency's saved account.
export function getPortalLoginMemory(orgSlug, { username = '', allowGoogle = true } = {}) {
  const slug = normalizeOrgSlug(orgSlug);
  const login = getRememberedLogin(slug);
  const google = allowGoogle ? getRememberedGoogleLogin(slug) : null;
  const matches = value => value && (!slug || value.orgSlug === slug);
  const restored = normalizeUsername(username) || (matches(login) ? login.username : '') || (matches(google) ? google.username : '');
  return {
    username: restored,
    remembered: Boolean(matches(login) && restored.toLowerCase() === login.username.toLowerCase()),
    google: matches(google) && [google.username, google.loginHint].some(value => value?.toLowerCase() === restored.toLowerCase()) ? google : null
  };
}

// A per-tab choice survives Google's full-page redirect. No credential is stored here.
const SSO_PREFERENCE_KEY = '__pt_sso_remember_choice__';
const SSO_PERSISTENT_CHOICE_KEY = '__pt_sso_remember_preferences__';
export function setSsoRememberChoice(remember, orgSlug) {
  try { sessionStorage.setItem(SSO_PREFERENCE_KEY, JSON.stringify({ remember: !!remember, orgSlug: normalizeOrgSlug(orgSlug), at: Date.now() })); } catch { /* optional */ }
  try {
    const choices = JSON.parse(localStorage.getItem(SSO_PERSISTENT_CHOICE_KEY) || '{}');
    localStorage.setItem(SSO_PERSISTENT_CHOICE_KEY, JSON.stringify({ ...choices, [normalizeOrgSlug(orgSlug)]: !!remember }));
  } catch { /* optional */ }
}
export function shouldRememberSso(orgSlug) {
  try {
    const choice = JSON.parse(sessionStorage.getItem(SSO_PREFERENCE_KEY) || 'null');
    if (choice?.orgSlug === normalizeOrgSlug(orgSlug) && Date.now() - choice.at < 3600000) return choice.remember !== false;
  } catch { /* external/legacy SSO entry defaults to remembering the shortcut */ }
  try {
    const choices = JSON.parse(localStorage.getItem(SSO_PERSISTENT_CHOICE_KEY) || '{}');
    if (choices?.[normalizeOrgSlug(orgSlug)] === false) return false;
  } catch { /* optional */ }
  return true;
}
