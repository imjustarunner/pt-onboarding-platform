/**
 * Activity tracker: inactivity timeout with a pre-logout warning phase, plus presence heartbeat.
 *
 * Flow:
 *  1. DOM events (mouse, keyboard, scroll, touch) reset the inactivity clock.
 *  2. After the configured idle period, the branded Timedown warning fires (10 min countdown).
 *  3. The user can click "I'm still here" to dismiss; incidental mouse moves do NOT dismiss.
 *  4. When the countdown expires → logout → Session Ended screen → tenant login.
 *
 * SSTC note: affiliation-type tenants get SSTC_TIMEOUT_MINUTES (30 min) idle regardless of
 * server config, because members often leave dashboards open while training.
 *
 * The presence heartbeat updates server-side presence (chat online/idle/offline) but
 * intentionally does NOT reset the inactivity clock — network activity ≠ user activity.
 */
import { unref } from 'vue';
import { useAuthStore } from '../store/auth';
import { useSessionLockStore } from '../store/sessionLock';
import api from '../services/api';
import { useAgencyStore } from '../store/agency';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Timeout for SSTC (affiliation) tenants regardless of server config. */
const SSTC_TIMEOUT_MINUTES = 30;

/** How long the branded Timedown countdown runs before Session Ended. */
const WARNING_SECONDS = 600; // 10 minutes

/** Fallback for non-SSTC tenants when server sends no config. */
const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 30;

const MIN_INACTIVITY_TIMEOUT_MINUTES = 1;
const MAX_INACTIVITY_TIMEOUT_MINUTES = 240;

const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 30;
const MIN_HEARTBEAT_INTERVAL_SECONDS = 10;
const MAX_HEARTBEAT_INTERVAL_SECONDS = 300;

const LAST_ACTIVITY_KEY = 'presence:lastActivityAt';

// ─── Module state ─────────────────────────────────────────────────────────────

let warningTimer = null;     // fires after idle period → shows Timedown warning
let heartbeatTimer = null;
let lastActivityTime = Date.now();
let isTracking = false;

// Events that count as real user activity
const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** True when the current agency is an SSTC affiliation club. */
function isSSTC() {
  try {
    const agencyStore = useAgencyStore();
    const orgType = String(
      agencyStore.currentAgency?.organization_type ||
      agencyStore.currentAgency?.organizationType ||
      ''
    ).toLowerCase();
    return orgType === 'affiliation';
  } catch {
    return false;
  }
}

/** Effective idle period in milliseconds before Timedown appears. */
function getInactivityTimeoutMs() {
  if (isSSTC()) return SSTC_TIMEOUT_MINUTES * 60 * 1000;

  const sessionLockStore = useSessionLockStore();
  const config = sessionLockStore.lockConfig;
  if (config?.effectiveTimeoutMinutes != null) {
    return clampNumber(config.effectiveTimeoutMinutes, MIN_INACTIVITY_TIMEOUT_MINUTES, MAX_INACTIVITY_TIMEOUT_MINUTES, DEFAULT_INACTIVITY_TIMEOUT_MINUTES) * 60 * 1000;
  }
  const settings = getSessionSettings();
  const minutes = clampNumber(
    settings.inactivityTimeoutMinutes,
    MIN_INACTIVITY_TIMEOUT_MINUTES,
    MAX_INACTIVITY_TIMEOUT_MINUTES,
    DEFAULT_INACTIVITY_TIMEOUT_MINUTES
  );
  return minutes * 60 * 1000;
}

/** Idle fully, then show the 10-minute Timedown (do not subtract warning from idle). */
function getWarningDelayMs() {
  return getInactivityTimeoutMs();
}

/** Actually perform the logout after the warning expires. */
async function handleTimeout() {
  const authStore = useAuthStore();
  const sessionLockStore = useSessionLockStore();
  const agencyStore = useAgencyStore();

  if (!authStore.isAuthenticated) return;

  // Lock screen path (PIN-based tenants) — skip the warning modal flow entirely
  if (sessionLockStore.useLockScreen) {
    sessionLockStore.lock();
    return;
  }

  try {
    const sessionId = localStorage.getItem('sessionId');
    if (sessionId || authStore.token) {
      try {
        await api.post('/auth/logout', { sessionId, reason: 'timeout' }, { skipAuthRedirect: true });
      } catch (err) {
        if (err?.response?.status !== 401) console.error('[activityTracker] logout call failed:', err);
      }
      try {
        const timeoutMinutes = Math.round(getInactivityTimeoutMs() / 60000);
        await api.post('/auth/activity-log', {
          actionType: 'timeout',
          sessionId,
          metadata: { reason: 'inactivity_timeout', timeoutMinutes, warningSeconds: WARNING_SECONDS }
        }, { skipAuthRedirect: true });
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.error('[activityTracker] error during timeout handling:', err);
  } finally {
    const { getLoginUrlForRedirect, getCurrentPortalSlugFromHostCache, getCurrentPortalSlugFromPath } =
      await import('../utils/loginRedirect');
    const {
      resolveSessionTimeoutTenantKey,
      rememberSessionEndedContext
    } = await import('../utils/sessionTimeoutBranding');

    const user = unref(authStore.user);
    const loginUrl = getLoginUrlForRedirect(user, null, { timeout: true });
    const agency = agencyStore.currentAgency || {};
    const tenantKey = resolveSessionTimeoutTenantKey({
      slug: agency.slug || agency.portal_url || agency.portalUrl,
      portalUrl: agency.portal_url || agency.portalUrl,
      agencyName: agency.name,
      hostSlug: getCurrentPortalSlugFromHostCache() || getCurrentPortalSlugFromPath() || ''
    });
    rememberSessionEndedContext({ loginUrl, tenantKey });

    const endedPath = `/session-ended?tenant=${encodeURIComponent(tenantKey)}`;
    await authStore.logout('timeout', { redirectTo: endedPath });
  }
}

/**
 * Schedules the warning timer (which then triggers the modal, which then
 * auto-triggers logout if ignored).
 */
function resetTimer() {
  if (warningTimer) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }

  const sessionLockStore = useSessionLockStore();

  // Explicit Stay Logged In calls dismissWarning + resetActivityTimer; do not
  // clear an active Timedown from incidental mouse movement here.
  if (sessionLockStore.warningActive) return;

  if (sessionLockStore.isLocked) return;
  if (!isTracking || document.visibilityState !== 'visible') return;

  const delay = getWarningDelayMs();

  warningTimer = setTimeout(() => {
    warningTimer = null;
    const store = useSessionLockStore();
    const auth = useAuthStore();
    if (!auth.isAuthenticated) return;

    // PIN lock-screen tenants skip the warning and lock immediately
    if (store.useLockScreen) {
      store.lock();
      return;
    }

    // Branded Timedown with a 10-min countdown that expires into Session Ended
    store.showWarning(WARNING_SECONDS, () => {
      handleTimeout();
    });
  }, delay);
}

function onActivity() {
  const sessionLockStore = useSessionLockStore();
  if (sessionLockStore.isLocked) return;
  // While Timedown is up, ignore passive activity so the 10-min spin-down can finish
  if (sessionLockStore.warningActive) return;
  lastActivityTime = Date.now();
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityTime));
  } catch {
    /* ignore */
  }
  resetTimer();
}

function onStorageActivity(event) {
  if (event?.key !== LAST_ACTIVITY_KEY) return;
  const nextTime = Number(event.newValue);
  if (!Number.isFinite(nextTime) || nextTime <= lastActivityTime) return;
  lastActivityTime = nextTime;
  if (isTracking && document.visibilityState === 'visible') {
    resetTimer();
  }
}

function onVisibilityChange() {
  if (!isTracking) return;
  if (document.visibilityState === 'visible') {
    // Returned to tab — if Timedown is already showing, leave it alone
    const store = useSessionLockStore();
    if (store.warningActive) return;
    onActivity();
    sendPresenceHeartbeat();
  } else {
    // Tab hidden — pause idle countdown so background tabs don't log out active sessions.
    // Do not dismiss an already-visible Timedown.
    if (useSessionLockStore().warningActive) return;
    if (warningTimer) {
      clearTimeout(warningTimer);
      warningTimer = null;
    }
  }
}

async function sendPresenceHeartbeat() {
  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();
  if (!authStore.isAuthenticated) return;
  const roleNorm = String(authStore.user?.role || '').toLowerCase();
  if (!roleNorm) return;
  if (roleNorm === 'school_staff') return;

  const agencyId = agencyStore.currentAgency?.id || null;
  try {
    await api.post('/presence/heartbeat', {
      agencyId,
      lastActivityAt: new Date(lastActivityTime).toISOString()
    }, { skipGlobalLoading: true, skipAuthRedirect: true });
    // Note: heartbeat success intentionally does NOT call onActivity() or resetTimer().
    // Network ping ≠ user activity. The inactivity clock is reset only by DOM events.
  } catch {
    /* ignore — presence is best-effort */
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startActivityTracking({ force = false } = {}) {
  if (isTracking && !force) return;
  if (isTracking) stopActivityTracking();

  isTracking = true;
  const storedActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  lastActivityTime = Number.isFinite(storedActivity) ? storedActivity : Date.now();

  // Fetch session config (pin lock, effective timeout for non-SSTC)
  try {
    const res = await api.get('/auth/session-lock-config', { skipGlobalLoading: true, skipAuthRedirect: true });
    useSessionLockStore().setLockConfig(res.data || null);
  } catch {
    useSessionLockStore().setLockConfig(null);
  }

  activityEvents.forEach((event) => document.addEventListener(event, onActivity, true));
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('storage', onStorageActivity);

  resetTimer();
  sendPresenceHeartbeat();
  heartbeatTimer = setInterval(sendPresenceHeartbeat, getHeartbeatIntervalMs());
}

export function stopActivityTracking() {
  if (!isTracking) return;
  isTracking = false;

  activityEvents.forEach((event) => document.removeEventListener(event, onActivity, true));
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('storage', onStorageActivity);

  if (warningTimer) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  useSessionLockStore().dismissWarning();
}

export function getLastActivityTime() {
  return lastActivityTime;
}

/** Called when user confirms they are still active (e.g. by clicking "Stay Logged In"). */
export function resetActivityTimer() {
  lastActivityTime = Date.now();
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityTime));
  } catch {
    /* ignore */
  }
  resetTimer();
}

/** Refetch session lock config (e.g. after user changes preferences). */
export async function refetchSessionLockConfig() {
  try {
    const res = await api.get('/auth/session-lock-config', { skipGlobalLoading: true, skipAuthRedirect: true });
    useSessionLockStore().setLockConfig(res.data || null);
  } catch {
    useSessionLockStore().setLockConfig(null);
  }
  resetTimer();
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function getSessionSettings() {
  try {
    const agencyStore = useAgencyStore();
    const raw =
      agencyStore.currentAgency?.session_settings_json ??
      agencyStore.currentAgency?.sessionSettings ??
      null;
    if (!raw) return {};
    if (typeof raw === 'object') return raw || {};
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) || {}; } catch { return {}; }
    }
    return {};
  } catch {
    return {};
  }
}

function clampNumber(raw, min, max, fallback) {
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function getHeartbeatIntervalMs() {
  const settings = getSessionSettings();
  const seconds = clampNumber(
    settings.heartbeatIntervalSeconds,
    MIN_HEARTBEAT_INTERVAL_SECONDS,
    MAX_HEARTBEAT_INTERVAL_SECONDS,
    DEFAULT_HEARTBEAT_INTERVAL_SECONDS
  );
  return seconds * 1000;
}
