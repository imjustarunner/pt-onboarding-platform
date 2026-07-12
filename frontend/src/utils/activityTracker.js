/**
 * Activity tracker: inactivity → branded Timedown → Session Ended + platform session ledger.
 *
 * Flow:
 *  1. DOM events reset the idle clock. Meaningful events (click/key/scroll/touch) vs passive (mousemove).
 *  2. After configurable idle (default 3 min), Timedown overlay appears (configurable, default 10 min).
 *  3. "I'm still here" dismisses; incidental mouse moves do NOT.
 *  4. Countdown expiry → logout → Session Ended (tenant login CTA).
 *
 * Anti-gamification:
 *  - Server accrues billable time only on meaningful heartbeats (not mousemove-only).
 *  - Hidden tabs do not send meaningful ticks.
 *  - Server caps each tick and clamps totals to wall clock.
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

const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 30;
const MIN_HEARTBEAT_INTERVAL_SECONDS = 10;
const MAX_HEARTBEAT_INTERVAL_SECONDS = 300;

const LAST_ACTIVITY_KEY = 'presence:lastActivityAt';

let warningTimer = null;
let heartbeatTimer = null;
let sessionLedgerTimer = null;
let lastActivityTime = Date.now();
let isTracking = false;
let timeoutInFlight = false;

/** Runtime timeouts from agency settings (fall back to branding defaults). */
let idleBeforeTimedownMs = IDLE_BEFORE_TIMEDOWN_MS;
let timedownSeconds = TIMEDOWN_SECONDS;

/** Pending flags flushed on next platform-session heartbeat. */
let pendingMeaningful = false;
let pendingPassive = false;

const MEANINGFUL_EVENTS = ['mousedown', 'keypress', 'keydown', 'scroll', 'touchstart', 'click'];
const PASSIVE_EVENTS = ['mousemove'];

function getWarningDelayMs() {
  return idleBeforeTimedownMs;
}

function getTimedownSeconds() {
  return timedownSeconds;
}

function currentSessionPhase() {
  try {
    return useSessionLockStore().warningActive ? 'timedown' : 'active';
  } catch {
    return 'active';
  }
}

async function sendPlatformSessionHeartbeat({ forceMeaningful = false } = {}) {
  const authStore = useAuthStore();
  if (!authStore.isAuthenticated) return;
  const sessionId = localStorage.getItem('sessionId');
  if (!sessionId) return;

  const meaningful = forceMeaningful || pendingMeaningful;
  const passive = !meaningful && pendingPassive;
  pendingMeaningful = false;
  pendingPassive = false;

  const agencyStore = useAgencyStore();
  try {
    await api.post(
      '/auth/platform-session/heartbeat',
      {
        sessionId,
        meaningful,
        passive,
        phase: currentSessionPhase(),
        agencyId: agencyStore.currentAgency?.id || null
      },
      { skipGlobalLoading: true, skipAuthRedirect: true }
    );
  } catch {
    /* best-effort */
  }
}

async function handleTimeout() {
  if (timeoutInFlight) return;
  timeoutInFlight = true;

  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();

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
              idleSeconds: Math.round(idleBeforeTimedownMs / 1000),
              warningSeconds: getTimedownSeconds()
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

      const endedPath = `/session-ended?tenant=${encodeURIComponent(tenantKey)}&login=${encodeURIComponent(loginUrl)}`;
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
  if (sessionLockStore.warningActive) return;
  if (sessionLockStore.isLocked) return;
  if (!isTracking) return;

  // Timer runs whether or not the tab is visible; switching desktops is still idle time.
  const delay = getWarningDelayMs();

  warningTimer = setTimeout(() => {
    warningTimer = null;
    const store = useSessionLockStore();
    const auth = useAuthStore();
    if (!auth.isAuthenticated) return;

    // Mark timedown phase for session ledger
    pendingPassive = false;
    sendPlatformSessionHeartbeat();

    store.showWarning(getTimedownSeconds(), () => {
      handleTimeout();
    });

    // Flush a timedown-phase heartbeat immediately
    setTimeout(() => {
      sendPlatformSessionHeartbeat();
    }, 0);
  }, delay);
}

function onMeaningfulActivity() {
  const sessionLockStore = useSessionLockStore();
  if (sessionLockStore.isLocked) return;
  if (sessionLockStore.warningActive) return;
  pendingMeaningful = true;
  lastActivityTime = Date.now();
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityTime));
  } catch {
    /* ignore */
  }
  resetTimer();
}

function onPassiveActivity() {
  const sessionLockStore = useSessionLockStore();
  if (sessionLockStore.isLocked) return;
  if (sessionLockStore.warningActive) return;
  pendingPassive = true;
  // Passive mouse movement still resets idle (user is present) but is not billable
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
    // Tab is visible again — check whether idle time already elapsed while hidden.
    const store = useSessionLockStore();
    if (store.warningActive) return;

    const idleSinceMs = Date.now() - lastActivityTime;
    if (idleSinceMs >= getWarningDelayMs()) {
      // Already idle long enough; fire the Timedown immediately.
      if (warningTimer) {
        clearTimeout(warningTimer);
        warningTimer = null;
      }
      const auth = useAuthStore();
      if (auth.isAuthenticated) {
        store.showWarning(getTimedownSeconds(), () => {
          handleTimeout();
        });
      }
    } else {
      // Resume the countdown for the remaining idle window.
      if (warningTimer) {
        clearTimeout(warningTimer);
        warningTimer = null;
      }
      const remaining = getWarningDelayMs() - idleSinceMs;
      warningTimer = setTimeout(() => {
        warningTimer = null;
        const s = useSessionLockStore();
        const auth = useAuthStore();
        if (!auth.isAuthenticated) return;
        s.showWarning(getTimedownSeconds(), () => handleTimeout());
      }, remaining);
    }

    sendPresenceHeartbeat();
    sendPlatformSessionHeartbeat({ forceMeaningful: false });
  }
  // Hidden: do NOT cancel the timer. Switching desktops / losing focus is still inactivity.
}

async function sendPresenceHeartbeat() {
  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();
  if (!authStore.isAuthenticated) return;
  const roleNorm = String(authStore.user?.role || '').toLowerCase();
  if (!roleNorm || roleNorm === 'school_staff') return;

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
    /* ignore */
  }
}

function applyTimeoutConfig(config) {
  const idleSec = Number(config?.idleBeforeTimedownSeconds);
  const tdSec = Number(config?.timedownSeconds);
  if (Number.isFinite(idleSec) && idleSec >= 30) {
    idleBeforeTimedownMs = Math.min(3600, Math.floor(idleSec)) * 1000;
  } else {
    idleBeforeTimedownMs = IDLE_BEFORE_TIMEDOWN_MS;
  }
  if (Number.isFinite(tdSec) && tdSec >= 30) {
    timedownSeconds = Math.min(3600, Math.floor(tdSec));
  } else {
    timedownSeconds = TIMEDOWN_SECONDS;
  }
}

export async function startActivityTracking({ force = false } = {}) {
  if (isTracking && !force) return;
  if (isTracking) stopActivityTracking();

  isTracking = true;
  timeoutInFlight = false;
  const storedActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  lastActivityTime = Number.isFinite(storedActivity) ? storedActivity : Date.now();

  try {
    const res = await api.get('/auth/session-lock-config', { skipGlobalLoading: true, skipAuthRedirect: true });
    useSessionLockStore().setLockConfig(res.data || null);
    applyTimeoutConfig(res.data || {});
  } catch {
    useSessionLockStore().setLockConfig(null);
    applyTimeoutConfig({});
  }

  MEANINGFUL_EVENTS.forEach((event) => document.addEventListener(event, onMeaningfulActivity, true));
  PASSIVE_EVENTS.forEach((event) => document.addEventListener(event, onPassiveActivity, true));
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('storage', onStorageActivity);

  resetTimer();
  sendPresenceHeartbeat();
  sendPlatformSessionHeartbeat({ forceMeaningful: true });
  heartbeatTimer = setInterval(sendPresenceHeartbeat, getHeartbeatIntervalMs());
  sessionLedgerTimer = setInterval(() => sendPlatformSessionHeartbeat(), 20000);
}

export function stopActivityTracking({ dismissWarning: shouldDismiss = true } = {}) {
  if (!isTracking && !warningTimer && !heartbeatTimer && !sessionLedgerTimer) {
    if (shouldDismiss) useSessionLockStore().dismissWarning();
    return;
  }
  isTracking = false;

  MEANINGFUL_EVENTS.forEach((event) => document.removeEventListener(event, onMeaningfulActivity, true));
  PASSIVE_EVENTS.forEach((event) => document.removeEventListener(event, onPassiveActivity, true));
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
  if (sessionLedgerTimer) {
    clearInterval(sessionLedgerTimer);
    sessionLedgerTimer = null;
  }

  if (shouldDismiss) useSessionLockStore().dismissWarning();
}

export function getLastActivityTime() {
  return lastActivityTime;
}

export function resetActivityTimer() {
  lastActivityTime = Date.now();
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityTime));
  } catch {
    /* ignore */
  }
  resetTimer();
}

/** Called when user dismisses Timedown — counts as meaningful engagement. */
export function reportTimedownDismissed() {
  pendingMeaningful = true;
  sendPlatformSessionHeartbeat({ forceMeaningful: true });
}

export async function refetchSessionLockConfig() {
  try {
    const res = await api.get('/auth/session-lock-config', { skipGlobalLoading: true, skipAuthRedirect: true });
    useSessionLockStore().setLockConfig(res.data || null);
    applyTimeoutConfig(res.data || {});
  } catch {
    useSessionLockStore().setLockConfig(null);
  }
  resetTimer();
}

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
