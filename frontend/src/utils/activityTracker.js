/**
 * Activity tracker: inactivity → branded Timedown → Session Ended + platform session ledger.
 *
 * Flow:
 *  1. DOM events reset the idle clock. Meaningful events (click/key/scroll/touch) vs passive (mousemove).
 *  2. After configurable idle (default 3 min), Timedown overlay appears (configurable, default 10 min).
 *  3. "I'm still here" dismisses; incidental mouse moves do NOT while Timedown is up.
 *  4. Countdown expiry → logout → Session Ended (tenant login CTA).
 *
 * Reliability:
 *  - Wall-clock idle watchdog (every 10s) so background-tab setTimeout throttling cannot skip Timedown.
 *  - Switching desktops / hiding the tab does NOT pause or cancel idle.
 *
 * Heartbeat strategy (long-term, scales with users):
 *  - Do NOT poll the API on a tight fixed timer for every user forever.
 *  - Ledger: send on real changes (activity flush, phase change, tab visible again),
 *    plus a slow keep-alive (~90s) while the tab is visible so time still accrues.
 *  - Presence: slower when idle, a bit faster when recently active; never while hidden.
 *  - Hidden tabs and Cloud Run 429 cooldowns skip network heartbeats entirely.
 *  - Local scheduler ticks often; network calls stay rare. WebSockets are not needed yet.
 */
import { unref } from 'vue';
import { useAuthStore } from '../store/auth';
import { useSessionLockStore } from '../store/sessionLock';
import { usePresenceSessionStore } from '../store/presenceSession';
import api, { isApiRateLimited } from '../services/api';
import { useAgencyStore } from '../store/agency';
import {
  IDLE_BEFORE_TIMEDOWN_MS,
  IDLE_BEFORE_TIMEDOWN_ADMIN_MS,
  TIMEDOWN_SECONDS,
  resolveSessionTimeoutTenantKey,
  rememberSessionEndedContext,
  markSessionEndedRedirecting
} from './sessionTimeoutBranding';
import { isPrivilegedPresenceRole } from './presenceStatus';

/** Presence cadence when the user was active recently (agency setting can raise this). */
const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 60;
const MIN_HEARTBEAT_INTERVAL_SECONDS = 30;
const MAX_HEARTBEAT_INTERVAL_SECONDS = 300;
/** Presence cadence when idle (no DOM activity for IDLE_FOR_PRESENCE_MS). */
const PRESENCE_IDLE_INTERVAL_MS = 90 * 1000;
const IDLE_FOR_PRESENCE_MS = 2 * 60 * 1000;

/**
 * Ledger keep-alive while tab is visible. Must stay under the server delta cap (180s)
 * so honest time is not truncated between ticks.
 */
const LEDGER_KEEPALIVE_MS = 90 * 1000;
/** Batch rapid clicks into one ledger POST. */
const LEDGER_ACTIVITY_FLUSH_MS = 2 * 1000;
/** Local-only tick — cheap; decides whether a network call is due. */
const HEARTBEAT_SCHEDULER_MS = 15 * 1000;

const IDLE_WATCHDOG_MS = 10 * 1000;

const LAST_ACTIVITY_KEY = 'presence:lastActivityAt';

let warningTimer = null;
let heartbeatTimer = null;
let idleWatchdog = null;
let ledgerFlushTimer = null;
let lastActivityTime = Date.now();
let lastLedgerSentAt = 0;
let lastPresenceSentAt = 0;
let lastSentPhase = null;
let isTracking = false;
let timeoutInFlight = false;
/** When set (ISO), Timedown idle clock is paused until this time (privileged away status). */
let sessionExtendUntilMs = null;
let extendWatchTimer = null;

/** Runtime timeouts from agency settings (fall back to branding defaults). */
let idleBeforeTimedownMs = IDLE_BEFORE_TIMEDOWN_MS;
let timedownSeconds = TIMEDOWN_SECONDS;

/**
 * Optional override while an hourly worker is clocked into indirect time.
 * { idleBeforeTimedownMs, timedownSeconds } — timedown may be up to 2 hours.
 */
let runtimeTimeoutOverride = null;

/** Clocked-in Timedown: 3 min idle → 2 hour countdown (not the default 10 min). */
export const CLOCKED_IN_IDLE_BEFORE_TIMEDOWN_MS = 3 * 60 * 1000;
export const CLOCKED_IN_TIMEDOWN_SECONDS = 2 * 60 * 60;

/** Pending flags flushed on next platform-session heartbeat. */
let pendingMeaningful = false;
let pendingPassive = false;

const MEANINGFUL_EVENTS = ['mousedown', 'keypress', 'keydown', 'scroll', 'touchstart', 'click'];
const PASSIVE_EVENTS = ['mousemove'];

function getWarningDelayMs() {
  if (runtimeTimeoutOverride?.idleBeforeTimedownMs != null) {
    return Number(runtimeTimeoutOverride.idleBeforeTimedownMs);
  }
  return idleBeforeTimedownMs;
}

function getTimedownSeconds() {
  if (runtimeTimeoutOverride?.timedownSeconds != null) {
    return Number(runtimeTimeoutOverride.timedownSeconds);
  }
  return timedownSeconds;
}

/**
 * Force idle/timedown while clocked into indirect time (or clear with null).
 * Does not persist across full config refetch unless re-applied after refetch.
 */
export function setRuntimeTimeoutOverride(override) {
  if (!override || typeof override !== 'object') {
    runtimeTimeoutOverride = null;
  } else {
    const idleMs = Number(override.idleBeforeTimedownMs);
    const tdSec = Number(override.timedownSeconds);
    runtimeTimeoutOverride = {
      idleBeforeTimedownMs: Number.isFinite(idleMs) && idleMs >= 30_000
        ? Math.min(3600_000, Math.floor(idleMs))
        : CLOCKED_IN_IDLE_BEFORE_TIMEDOWN_MS,
      timedownSeconds: Number.isFinite(tdSec) && tdSec >= 30
        ? Math.min(7200, Math.floor(tdSec))
        : CLOCKED_IN_TIMEDOWN_SECONDS
    };
  }
  // Reschedule idle → Timedown with the new values (no-op if Timedown already open).
  try {
    resetTimer();
  } catch {
    /* tracking may not be started yet */
  }
}

export function getRuntimeTimeoutOverride() {
  return runtimeTimeoutOverride ? { ...runtimeTimeoutOverride } : null;
}

export function applyClockedInTimeoutOverride() {
  setRuntimeTimeoutOverride({
    idleBeforeTimedownMs: CLOCKED_IN_IDLE_BEFORE_TIMEDOWN_MS,
    timedownSeconds: CLOCKED_IN_TIMEDOWN_SECONDS
  });
}

export async function clearClockedInTimeoutOverride() {
  runtimeTimeoutOverride = null;
  try {
    await refetchSessionLockConfig();
  } catch {
    applyTimeoutConfig({});
    try {
      resetTimer();
    } catch {
      /* ignore */
    }
  }
}

function currentSessionPhase() {
  try {
    return useSessionLockStore().warningActive ? 'timedown' : 'active';
  } catch {
    return 'active';
  }
}

function isSessionExtendActive() {
  if (!sessionExtendUntilMs) return false;
  if (Date.now() >= sessionExtendUntilMs) {
    // Expired but timer may have been lost (HMR / tab freeze) — clear so Timedown can run.
    sessionExtendUntilMs = null;
    if (extendWatchTimer) {
      clearTimeout(extendWatchTimer);
      extendWatchTimer = null;
    }
    return false;
  }
  return true;
}

function canSendHeartbeat() {
  if (isApiRateLimited()) return false;
  // Away/session-extend: keep presence heartbeats even if the tab is hidden
  // so privileged users stay "Away" instead of flipping to Offline.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && !isSessionExtendActive()) {
    return false;
  }
  return true;
}

function shouldSendLedger({ force = false } = {}) {
  if (force) return true;
  if (pendingMeaningful || pendingPassive) return true;
  const phase = currentSessionPhase();
  if (phase !== lastSentPhase) return true;
  if (!lastLedgerSentAt || Date.now() - lastLedgerSentAt >= LEDGER_KEEPALIVE_MS) return true;
  return false;
}

function scheduleLedgerFlush() {
  if (ledgerFlushTimer) return;
  ledgerFlushTimer = setTimeout(() => {
    ledgerFlushTimer = null;
    sendPlatformSessionHeartbeat();
  }, LEDGER_ACTIVITY_FLUSH_MS);
}

async function sendPlatformSessionHeartbeat({ forceMeaningful = false, force = false } = {}) {
  const authStore = useAuthStore();
  if (!authStore.isAuthenticated) return;
  if (!canSendHeartbeat()) return;
  if (!shouldSendLedger({ force: force || forceMeaningful })) return;

  const sessionId = localStorage.getItem('sessionId');
  if (!sessionId) return;

  const meaningful = forceMeaningful || pendingMeaningful;
  const passive = !meaningful && pendingPassive;
  pendingMeaningful = false;
  pendingPassive = false;

  const phase = currentSessionPhase();
  const agencyStore = useAgencyStore();
  try {
    await api.post(
      '/auth/platform-session/heartbeat',
      {
        sessionId,
        meaningful,
        passive,
        phase,
        agencyId: agencyStore.currentAgency?.id || null
      },
      { skipGlobalLoading: true, skipAuthRedirect: true }
    );
    lastLedgerSentAt = Date.now();
    lastSentPhase = phase;
  } catch {
    /* best-effort — leave pending flags cleared; next keep-alive still accrues wall time */
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

  // If still clocked into indirect time, close the session before logout.
  try {
    const { useIndirectTimeSessionStore } = await import('../store/indirectTimeSession');
    const indirectStore = useIndirectTimeSessionStore();
    if (indirectStore.isClockedIn) {
      await indirectStore.forceClockOutOnLogout();
    }
  } catch {
    /* ignore */
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

/** Single entry point for opening Timedown (from setTimeout or wall-clock watchdog). */
function fireTimedown() {
  const store = useSessionLockStore();
  const auth = useAuthStore();
  if (!isTracking || !auth.isAuthenticated) return;
  if (store.warningActive || store.isLocked) return;
  if (isSessionExtendActive()) return;

  if (warningTimer) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }

  pendingPassive = false;
  // Phase change → force ledger tick so timedown time accrues correctly.
  sendPlatformSessionHeartbeat({ force: true });

  // Privileged roles: ask for status instead of only "I'm still here"
  try {
    const presenceSession = usePresenceSessionStore();
    if (presenceSession.shouldUseStatusPrompt(auth.user?.role)) {
      presenceSession.openTimedownPrompt();
    }
  } catch {
    /* store may not be ready */
  }

  store.showWarning(getTimedownSeconds(), () => {
    handleTimeout();
  });
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
  if (isSessionExtendActive()) return;

  // Schedule from lastActivityTime so background throttling + resume stay accurate.
  const elapsed = Math.max(0, Date.now() - lastActivityTime);
  const delay = Math.max(0, getWarningDelayMs() - elapsed);

  if (delay === 0) {
    fireTimedown();
    return;
  }

  warningTimer = setTimeout(() => {
    warningTimer = null;
    // Re-check wall clock — setTimeout can fire late when the tab was backgrounded.
    if (Date.now() - lastActivityTime >= getWarningDelayMs()) {
      fireTimedown();
    } else {
      resetTimer();
    }
  }, delay);
}

/** Wall-clock backup: browsers throttle setTimeout in background tabs. */
function checkIdleWatchdog() {
  if (!isTracking || timeoutInFlight) return;
  // Recover a stuck Away pause if the expire timer was lost.
  if (sessionExtendUntilMs && Date.now() < sessionExtendUntilMs && !extendWatchTimer) {
    const delay = Math.max(1000, sessionExtendUntilMs - Date.now());
    extendWatchTimer = setTimeout(() => {
      extendWatchTimer = null;
      sessionExtendUntilMs = null;
      lastActivityTime = Date.now() - getWarningDelayMs();
      fireTimedown();
    }, delay);
  }
  if (isSessionExtendActive()) return;
  const store = useSessionLockStore();
  if (store.warningActive || store.isLocked) return;
  if (Date.now() - lastActivityTime >= getWarningDelayMs()) {
    fireTimedown();
  }
}

function markActivity({ meaningful }) {
  const sessionLockStore = useSessionLockStore();
  if (sessionLockStore.isLocked) return;
  if (sessionLockStore.warningActive) return;
  if (meaningful) pendingMeaningful = true;
  else pendingPassive = true;
  lastActivityTime = Date.now();
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityTime));
  } catch {
    /* ignore */
  }
  resetTimer();
  // Only flush on meaningful interaction — mousemove waits for keep-alive / next flush
  // so idle mouse jitter cannot spam the API.
  if (meaningful) scheduleLedgerFlush();
}

function onMeaningfulActivity() {
  markActivity({ meaningful: true });
}

function onPassiveActivity() {
  markActivity({ meaningful: false });
}

function onStorageActivity(event) {
  if (event?.key !== LAST_ACTIVITY_KEY) return;
  const nextTime = Number(event.newValue);
  if (!Number.isFinite(nextTime) || nextTime <= lastActivityTime) return;
  lastActivityTime = nextTime;
  if (isTracking) resetTimer();
}

function onVisibilityChange() {
  if (!isTracking) return;
  if (document.visibilityState !== 'visible') return;

  const store = useSessionLockStore();

  // If Timedown already hit 0 while this tab was hidden, grant a visible grace
  // window instead of logging out before the user can see any modal.
  if (store.warningActive) {
    const grantedGrace = store.onTabBecameVisible();
    if (grantedGrace) {
      try {
        const auth = useAuthStore();
        const presenceSession = usePresenceSessionStore();
        if (presenceSession.shouldUseStatusPrompt(auth.user?.role)) {
          presenceSession.openTimedownPrompt();
        }
      } catch {
        /* ignore */
      }
    }
    sendPresenceHeartbeat({ force: true });
    sendPlatformSessionHeartbeat({ force: true });
    return;
  }

  // Tab visible again — do NOT treat focus as activity. Re-evaluate idle wall clock.
  if (Date.now() - lastActivityTime >= getWarningDelayMs()) {
    fireTimedown();
  } else {
    resetTimer();
  }

  // Catch up once; capped server-side so long hidden gaps are not fully credited.
  sendPresenceHeartbeat({ force: true });
  sendPlatformSessionHeartbeat({ force: true });
}

function presenceIntervalMs() {
  const activeMs = getHeartbeatIntervalMs();
  const idleMs = Math.max(activeMs, PRESENCE_IDLE_INTERVAL_MS);
  if (Date.now() - lastActivityTime >= IDLE_FOR_PRESENCE_MS) return idleMs;
  return activeMs;
}

async function sendPresenceHeartbeat({ force = false } = {}) {
  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();
  if (!authStore.isAuthenticated) return;
  if (!canSendHeartbeat()) return;
  if (!force && lastPresenceSentAt && Date.now() - lastPresenceSentAt < presenceIntervalMs()) return;

  const roleNorm = String(authStore.user?.role || '').toLowerCase();
  // school_staff send presence heartbeats so school-scoped DMs show who is online
  if (!roleNorm || roleNorm === 'client_guardian' || roleNorm === 'kiosk') return;

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
    lastPresenceSentAt = Date.now();
  } catch {
    /* ignore */
  }
}

/** Local scheduler: decide if presence/ledger network calls are due. */
function runHeartbeatScheduler() {
  if (!isTracking) return;
  sendPresenceHeartbeat();
  sendPlatformSessionHeartbeat();
}

/**
 * Only apply explicit Timedown settings.
 * Do NOT fall back to legacy inactivityTimeoutMinutes (that was 8–30 min session-lock config
 * and was incorrectly overriding the 3-minute Timedown default).
 */
function isAdminRole() {
  try {
    return isPrivilegedPresenceRole(useAuthStore().user?.role);
  } catch {
    return false;
  }
}

function defaultIdleBeforeTimedownMs() {
  return isAdminRole() ? IDLE_BEFORE_TIMEDOWN_ADMIN_MS : IDLE_BEFORE_TIMEDOWN_MS;
}

function applyTimeoutConfig(config) {
  const idleSec = Number(config?.idleBeforeTimedownSeconds);
  const tdSec = Number(config?.timedownSeconds);
  if (Number.isFinite(idleSec) && idleSec >= 30) {
    let ms = Math.min(3600, Math.floor(idleSec)) * 1000;
    if (isAdminRole()) ms = Math.max(ms, IDLE_BEFORE_TIMEDOWN_ADMIN_MS);
    idleBeforeTimedownMs = ms;
  } else {
    idleBeforeTimedownMs = defaultIdleBeforeTimedownMs();
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
  lastLedgerSentAt = 0;
  lastPresenceSentAt = 0;
  lastSentPhase = null;
  // Always start idle clock from now — stale localStorage must not skew the first schedule.
  lastActivityTime = Date.now();
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityTime));
  } catch {
    /* ignore */
  }

  // Never trust a leftover local Away pause alone — that was freezing Timedown for up to 2h
  // after a prior status choice even when the user thought they were Active.
  clearSessionExtendPause();
  try {
    usePresenceSessionStore().clearLocalExtend();
  } catch {
    /* ignore */
  }

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

  // Re-apply Away pause only when the server still has an active session extend.
  try {
    const presenceSession = usePresenceSessionStore();
    const data = await presenceSession.refreshFromServer();
    if (data?.session_extend_active && data?.presence_session_extend_until) {
      pauseIdleForSessionExtend(data.presence_session_extend_until);
    } else {
      clearSessionExtendPause();
    }
  } catch {
    clearSessionExtendPause();
  }

  resetTimer();
  sendPresenceHeartbeat({ force: true });
  sendPlatformSessionHeartbeat({ forceMeaningful: true, force: true });
  heartbeatTimer = setInterval(runHeartbeatScheduler, HEARTBEAT_SCHEDULER_MS);
  idleWatchdog = setInterval(checkIdleWatchdog, IDLE_WATCHDOG_MS);
  attachIdleTimeoutDebugGlobals();
}

export function stopActivityTracking({ dismissWarning: shouldDismiss = true } = {}) {
  if (!isTracking && !warningTimer && !heartbeatTimer && !idleWatchdog && !ledgerFlushTimer) {
    if (shouldDismiss) useSessionLockStore().dismissWarning();
    return;
  }
  isTracking = false;
  clearSessionExtendPause();

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
  if (idleWatchdog) {
    clearInterval(idleWatchdog);
    idleWatchdog = null;
  }
  if (ledgerFlushTimer) {
    clearTimeout(ledgerFlushTimer);
    ledgerFlushTimer = null;
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
  sendPlatformSessionHeartbeat({ forceMeaningful: true, force: true });
}

/**
 * Pause Timedown while a privileged away status is active (max 2h).
 * When the window ends, re-open the status / Timedown prompt.
 * Idempotent for the same until-time so presence polls do not keep resetting the idle clock.
 */
export function pauseIdleForSessionExtend(isoUntil) {
  const ms = isoUntil ? new Date(isoUntil).getTime() : NaN;
  const maxUntil = Date.now() + 2 * 60 * 60 * 1000 + 5000;
  if (!Number.isFinite(ms) || ms <= Date.now() || ms > maxUntil) {
    clearSessionExtendPause({ reschedule: true });
    return;
  }
  // Same window already armed — do not touch lastActivityTime (chat polls every ~20s).
  if (sessionExtendUntilMs === ms && extendWatchTimer) {
    return;
  }
  sessionExtendUntilMs = ms;
  if (warningTimer) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }
  if (extendWatchTimer) {
    clearTimeout(extendWatchTimer);
    extendWatchTimer = null;
  }
  const delay = Math.max(1000, ms - Date.now());
  extendWatchTimer = setTimeout(() => {
    extendWatchTimer = null;
    sessionExtendUntilMs = null;
    try {
      usePresenceSessionStore().clearLocalExtend();
    } catch {
      /* ignore */
    }
    // Extension ended — ask again (or Timedown)
    lastActivityTime = Date.now() - getWarningDelayMs();
    fireTimedown();
  }, delay);
  // Keep away presence fresh
  sendPresenceHeartbeat({ force: true });
}

export function clearSessionExtendPause({ reschedule = false } = {}) {
  sessionExtendUntilMs = null;
  if (extendWatchTimer) {
    clearTimeout(extendWatchTimer);
    extendWatchTimer = null;
  }
  if (reschedule && isTracking) resetTimer();
}

/**
 * Console/dev helper: clear Away pause and open Timedown immediately.
 * Also available as window.__forceTimedown() after tracking starts.
 */
export function forceTimedownNow() {
  try {
    usePresenceSessionStore().clearLocalExtend();
  } catch {
    /* ignore */
  }
  clearSessionExtendPause();
  try {
    useSessionLockStore().dismissWarning();
  } catch {
    /* ignore */
  }
  lastActivityTime = Date.now() - getWarningDelayMs() - 1000;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityTime));
  } catch {
    /* ignore */
  }
  fireTimedown();
  return getIdleTimeoutDebug();
}

function attachIdleTimeoutDebugGlobals() {
  if (typeof window === 'undefined') return;
  window.__getIdleTimeoutDebug = getIdleTimeoutDebug;
  window.__forceTimedown = forceTimedownNow;
  window.__clearSessionExtendPause = () => {
    try {
      usePresenceSessionStore().clearLocalExtend();
    } catch {
      /* ignore */
    }
    clearSessionExtendPause({ reschedule: true });
    return getIdleTimeoutDebug();
  };
}

export function getSessionExtendUntilMs() {
  return sessionExtendUntilMs;
}

export async function refetchSessionLockConfig() {
  const preservedOverride = runtimeTimeoutOverride ? { ...runtimeTimeoutOverride } : null;
  try {
    const res = await api.get('/auth/session-lock-config', { skipGlobalLoading: true, skipAuthRedirect: true });
    useSessionLockStore().setLockConfig(res.data || null);
    applyTimeoutConfig(res.data || {});
  } catch {
    useSessionLockStore().setLockConfig(null);
    applyTimeoutConfig({});
  }
  // Agency config refetch must not wipe the clocked-in 2h Timedown override.
  if (preservedOverride) {
    runtimeTimeoutOverride = preservedOverride;
  }
  resetTimer();
}

/** Debug helper — current idle/timedown config in ms/seconds. */
export function getIdleTimeoutDebug() {
  return {
    isTracking,
    idleBeforeTimedownMs,
    timedownSeconds,
    effectiveIdleBeforeTimedownMs: getWarningDelayMs(),
    effectiveTimedownSeconds: getTimedownSeconds(),
    runtimeTimeoutOverride,
    lastActivityTime,
    lastLedgerSentAt,
    lastPresenceSentAt,
    idleElapsedMs: Date.now() - lastActivityTime,
    sessionExtendUntilMs,
    sessionExtendActive: isSessionExtendActive(),
    sessionExtendRemainingSec: sessionExtendUntilMs
      ? Math.max(0, Math.round((sessionExtendUntilMs - Date.now()) / 1000))
      : 0,
    warningActive: (() => {
      try {
        return useSessionLockStore().warningActive;
      } catch {
        return false;
      }
    })(),
    warningSecondsLeft: (() => {
      try {
        return useSessionLockStore().warningSecondsLeft;
      } catch {
        return null;
      }
    })()
  };
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
