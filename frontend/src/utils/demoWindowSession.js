/**
 * Window-scoped demo lab session helpers.
 * Parent Platform session stays on localStorage + HttpOnly cookie.
 * Demo windows use sessionStorage only so they do not clobber each other.
 */

export const DEMO_WINDOW_TOKEN_KEY = '__pt_demo_window_token__';
export const DEMO_WINDOW_USER_KEY = '__pt_demo_window_user__';
export const DEMO_WINDOW_AGENCY_KEY = '__pt_demo_window_agency__';
export const DEMO_WINDOW_PATH_KEY = '__pt_demo_window_path__';

export function isDemoWindowSession() {
  try {
    return !!sessionStorage.getItem(DEMO_WINDOW_TOKEN_KEY);
  } catch {
    return false;
  }
}

export function getDemoWindowToken() {
  try {
    return sessionStorage.getItem(DEMO_WINDOW_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function getDemoWindowUser() {
  try {
    const raw = sessionStorage.getItem(DEMO_WINDOW_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getDemoWindowAgency() {
  try {
    const raw = sessionStorage.getItem(DEMO_WINDOW_AGENCY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getDemoWindowPath() {
  try {
    return sessionStorage.getItem(DEMO_WINDOW_PATH_KEY) || null;
  } catch {
    return null;
  }
}

export function persistDemoWindowSession({ token, user, agency, targetPath }) {
  sessionStorage.setItem(DEMO_WINDOW_TOKEN_KEY, String(token || ''));
  sessionStorage.setItem(DEMO_WINDOW_USER_KEY, JSON.stringify(user || null));
  if (agency) {
    sessionStorage.setItem(DEMO_WINDOW_AGENCY_KEY, JSON.stringify(agency));
  } else {
    sessionStorage.removeItem(DEMO_WINDOW_AGENCY_KEY);
  }
  if (targetPath) {
    sessionStorage.setItem(DEMO_WINDOW_PATH_KEY, String(targetPath));
  }
}

export function clearDemoWindowSession() {
  try {
    sessionStorage.removeItem(DEMO_WINDOW_TOKEN_KEY);
    sessionStorage.removeItem(DEMO_WINDOW_USER_KEY);
    sessionStorage.removeItem(DEMO_WINDOW_AGENCY_KEY);
    sessionStorage.removeItem(DEMO_WINDOW_PATH_KEY);
  } catch {
    // ignore
  }
}

/** Encode launch payload into a URL hash (avoids long query strings / server logs). */
export function encodeDemoLaunchHash(payload) {
  const json = JSON.stringify(payload || {});
  return `#demoLaunch=${encodeURIComponent(btoa(unescape(encodeURIComponent(json))))}`;
}

export function decodeDemoLaunchHash(hash) {
  const raw = String(hash || '');
  const m = raw.match(/[#&]?demoLaunch=([^&]+)/);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(m[1]))));
    return JSON.parse(json);
  } catch {
    try {
      return JSON.parse(atob(decodeURIComponent(m[1])));
    } catch {
      return null;
    }
  }
}
