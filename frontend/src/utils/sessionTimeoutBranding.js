/**
 * Tenant-branded session timeout / session-ended media + login routing.
 *
 * Videos (optional): drop into frontend/public/branding/session/
 *   PlotTwistCoTimedown.mp4, ITSCOTimedown.mp4, NLUTimedown.mp4, PlatformTimedown.mp4
 * Posters + SessionEnded PNGs ship in the same folder.
 */

export const SESSION_ENDED_STORAGE = {
  loginUrl: 'pt.sessionEnded.loginUrl',
  tenant: 'pt.sessionEnded.tenant',
  /** Set while navigating to Session Ended so 401 handlers don't steal redirect to /login. */
  redirecting: 'pt.sessionEnded.redirecting'
};

/** Idle period before the branded Timedown overlay appears. */
export const IDLE_BEFORE_TIMEDOWN_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Privileged roles (admin / super_admin / support / CPA):
 * 10 min idle → Timedown countdown page, then 10 min more before Session Ended (20 min total).
 */
export const IDLE_BEFORE_TIMEDOWN_ADMIN_MS = 10 * 60 * 1000; // 10 minutes
export const IDLE_BEFORE_TIMEDOWN_ADMIN_SECONDS = 600;

/** Length of the Timedown countdown before Session Ended. */
export const TIMEDOWN_SECONDS = 600; // 10 minutes
/** Privileged Timedown length (same as default; kept explicit for the 10+10 policy). */
export const TIMEDOWN_ADMIN_SECONDS = 600;

export function markSessionEndedRedirecting() {
  try {
    sessionStorage.setItem(SESSION_ENDED_STORAGE.redirecting, '1');
  } catch {
    /* ignore */
  }
}

export function clearSessionEndedRedirecting() {
  try {
    sessionStorage.removeItem(SESSION_ENDED_STORAGE.redirecting);
  } catch {
    /* ignore */
  }
}

export function isSessionEndedRedirecting() {
  try {
    return sessionStorage.getItem(SESSION_ENDED_STORAGE.redirecting) === '1';
  } catch {
    return false;
  }
}

export function isSessionEndedPath(pathname = '') {
  const p = String(pathname || '');
  return p === '/session-ended' || p.endsWith('/session-ended') || p.includes('/session-ended');
}

const TENANT_KEYS = ['PlotTwistCo', 'ITSCO', 'NLU', 'Platform'];

/**
 * Map portal slug / host / agency name → brand key used in asset filenames.
 */
export function resolveSessionTimeoutTenantKey({
  slug = '',
  hostSlug = '',
  agencyName = '',
  portalUrl = ''
} = {}) {
  const hay = [slug, hostSlug, portalUrl, agencyName]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  if (!hay) return 'Platform';
  if (hay.includes('itsco')) return 'ITSCO';
  if (/(^|[^a-z])nlu([^a-z]|$)/.test(hay) || hay.includes('new life') || hay.includes('newlife')) {
    return 'NLU';
  }
  // PlotTwist Co agency (not the platform PlotTwistHQ host alone)
  if (hay.includes('plottwistco') || hay.includes('plot twist co') || hay.includes('plottwist-co')) {
    return 'PlotTwistCo';
  }
  if (hay.includes('plottwist') && !hay.includes('plottwisthq') && !hay.includes('plot twist hq')) {
    return 'PlotTwistCo';
  }
  return 'Platform';
}

export function normalizeSessionTimeoutTenantKey(raw) {
  const s = String(raw || '').trim();
  const hit = TENANT_KEYS.find((k) => k.toLowerCase() === s.toLowerCase());
  return hit || 'Platform';
}

export function getTimedownVideoUrl(tenantKey) {
  const key = normalizeSessionTimeoutTenantKey(tenantKey);
  return `/branding/session/${key}Timedown.mp4`;
}

export function getTimedownPosterUrl(tenantKey) {
  const key = normalizeSessionTimeoutTenantKey(tenantKey);
  return `/branding/session/${key}Timedown.png`;
}

export function getSessionEndedImageUrl(tenantKey) {
  const key = normalizeSessionTimeoutTenantKey(tenantKey);
  return `/branding/session/${key}SessionEnded.png`;
}

/** Shared mobile background used for both the timedown warning and session-ended screens on small devices. */
export function getMobileTimedownBgUrl() {
  return '/branding/session/MobileBackground.png';
}

export function rememberSessionEndedContext({ loginUrl, tenantKey }) {
  try {
    if (loginUrl) sessionStorage.setItem(SESSION_ENDED_STORAGE.loginUrl, String(loginUrl));
    if (tenantKey) {
      sessionStorage.setItem(
        SESSION_ENDED_STORAGE.tenant,
        normalizeSessionTimeoutTenantKey(tenantKey)
      );
    }
  } catch {
    /* ignore */
  }
}

export function readSessionEndedContext() {
  try {
    return {
      loginUrl: sessionStorage.getItem(SESSION_ENDED_STORAGE.loginUrl) || '/login',
      tenantKey: normalizeSessionTimeoutTenantKey(
        sessionStorage.getItem(SESSION_ENDED_STORAGE.tenant) || 'Platform'
      )
    };
  } catch {
    return { loginUrl: '/login', tenantKey: 'Platform' };
  }
}

export function clearSessionEndedContext() {
  try {
    sessionStorage.removeItem(SESSION_ENDED_STORAGE.loginUrl);
    sessionStorage.removeItem(SESSION_ENDED_STORAGE.tenant);
    sessionStorage.removeItem(SESSION_ENDED_STORAGE.redirecting);
  } catch {
    /* ignore */
  }
}

/** Format remaining seconds as M:SS, MM:SS, or H:MM:SS when ≥ 1 hour. */
export function formatCountdownClock(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const sec = s % 60;
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  const m = Math.floor(s / 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
