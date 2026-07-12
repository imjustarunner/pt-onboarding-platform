/**
 * Activity tracker: inactivity → branded Timedown (10 min) → Session Ended.
 *
 * Flow:
 *  1. DOM events (mouse, keyboard, scroll, touch) reset the inactivity clock.
 *  2. After 3 minutes idle, the branded Timedown overlay appears (looping MP4 + countdown).
 *  3. User can click "I'm still here" to dismiss; incidental mouse moves do NOT dismiss.
 *  4. When the 10-min countdown expires → logout → Session Ended (not login) → CTA to log back in.
 *
 * Presence heartbeat updates server-side presence but does NOT reset the inactivity clock.
 */
import { unref } from 'vue';
import { useAuthStore } from '../store/auth';
import { useSessionLockStore } from '../store/sessionLock';
import api from '../services/api';
import { useAgencyStore } from '../store/agency';
import {
  IDLE_BEFORE_TIMEDOWN_MS,
  TIMEDOWN_SECONDS,
  resolveSessionTimeoutTenantKey,
  rememberSessionEndedContext,
  markSessionEndedRedirecting
} from './sessionTimeoutBranding';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 30;
const MIN_HEARTBEAT_INTERVAL_SECONDS = 10;
const MAX_HEARTBEAT_INTERVAL_SECONDS = 300;

const LAST_ACTIVITY_KEY = 'presence:lastActivityAt';

// ─── Module state ─────────────────────────────────────────────────────────────

let warningTimer = null; // fires after idle → shows Timedown
let heartbeatTimer = null;
let lastActivityTime = Date.now();
let isTracking = false;
let timeoutInFlight = false;

const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Always 3 minutes idle before Timedown (product requirement). */
function getWarningDelayMs() {
  return IDLE_BEFORE_TIMEDOWN_MS;
}

/** Logout → Session Ended (never bare login). */
async function handleTimeout() {
  if (timeoutInFlight) return;
  timeoutInFlight = true;

  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();

  // Stop heartbeats FIRST so a 401 cannot race to /login before Session Ended.
  // Keep Timedown visible until the hard redirect lands on Session Ended.
  stopActivityTracking({ dismissWarning: false });

  if (!authStore.isAuthenticated) {
    timeoutInFlight = false;
    return;
  }

  markSessionEndedRedirecting();

  try {
    const sessionId = localStorage.getItem('sessionId');
    if (sessionId || authStore.token) {
      try {
        await api.post('/auth/logout', { sessionId, reason: 'timeout' }, { skipAuthRedirect: true });
      } catch (err) {
        if (err?.response?.status !== 401) console.error('[activityTracker] logout call failed:', err);
      }
      try {
        await api.post(
          '/auth/activity-log',
          {
            actionType: 'timeout',
            sessionId,
            metadata: {
              reason: 'inactivity_timeout',
              idleMinutes: IDLE_BEFORE_TIMEDOWN_MS / 60000,
              warningSeconds: TIMEDOWN_SECONDS
            }
          },
          { skipAuthRedirect: true }
        );
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.error('[activityTracker] error during timeout handling:', err);
  } finally {
    try {
      const { getLoginUrlForRedirect, getCurrentPortalSlugFromHostCache, getCurrentPortalSlugFromPath } =
        await import('../utils/loginRedirect');

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
    } catch (err) {
      console.error('[activityTracker] failed to reach Session Ended:', err);
      try {
        window.location.href = '/session-ended';
      } catch {
        /* ignore */
      }
    } finally {
      timeoutInFlight = false;
    }
  }
}

function resetTimer() {
  if (warningTimer) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }

  const sessionLockStore = useSessionLockStore();

  // Do not clear an active Timedown from incidental mouse movement.
  if (sessionLockStore.warningActive) return;
  if (sessionLockStore.isLocked) return;
  if (!isTracking || document.visibilityState !== 'visible') return;

  const delay = getWarningDelayMs();

  warningTimer = setTimeout(() => {
    warningTimer = null;
    const store = useSessionLockStore();
    const auth = useAuthStore();
    if (!auth.isAuthenticated) return;

    // Always show branded Timedown (10 min) → Session Ended. Do not skip to PIN lock.
    store.showWarning(TIMEDOWN_SECONDS, () => {
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
    const store = useSessionLockStore();
    if (store.warningActive) return;
    onActivity();
    sendPresenceHeartbeat();
  } else {
    // Tab hidden — pause idle countdown. Do not dismiss an already-visible Timedown.
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
    await api.post(
      '/presence/heartbeat',
      {
        agencyId,
        lastActivityAt: new Date(lastActivityTime).toISOString()
      },
      { skipGlobalLoading: true, skipAuthRedirect: true }
    );
  } catch {
    /* ignore — presence is best-effort */
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startActivityTracking({ force = false } = {}) {
  if (isTracking && !force) return;
  if (isTracking) stopActivityTracking();

  isTracking = true;
  timeoutInFlight = false;
  const storedActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  lastActivityTime = Number.isFinite(storedActivity) ? storedActivity : Date.now();

  // Still fetch session config (PIN lock for manual lock) but idle always uses 3 min.
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

export function stopActivityTracking({ dismissWarning: shouldDismiss = true } = {}) {
  if (!isTracking && !warningTimer && !heartbeatTimer) {
    if (shouldDismiss) useSessionLockStore().dismissWarning();
    return;
  }
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

  if (shouldDismiss) useSessionLockStore().dismissWarning();
}

export function getLastActivityTime() {
  return lastActivityTime;
}

/** Called when user confirms they are still active (e.g. "Stay Logged In"). */
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
      try {
        return JSON.parse(raw) || {};
      } catch {
        return {};
      }
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
