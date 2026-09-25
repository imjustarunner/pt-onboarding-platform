/** Shared inactivity deadlines. Only real activity or server-verified resume can renew them. */
import { unref } from 'vue';
import { useAuthStore } from '../store/auth';
import { useSessionLockStore } from '../store/sessionLock';
import { usePresenceSessionStore } from '../store/presenceSession';
import { useAgencyStore } from '../store/agency';
import api, { isApiRateLimited } from '../services/api';
import { closeStatusPrompt } from './statusPromptBridge';
import { isDemoWindowSession } from './demoWindowSession';
import { sessionStorageKey, localSessionState, phaseAt, isNewerSession } from './sessionDeadline';
import { resolveSessionTimeoutTenantKey, rememberSessionEndedContext, markSessionEndedRedirecting } from './sessionTimeoutBranding';

let isTracking = false;
let initialized = false;
let timeoutInFlight = false;
let state = null;
let storageKey = null;
let scheduler = null;
let activityFlush = null;
let pendingActivity = false;
let lastHeartbeat = 0;
let lastActivitySentAt = 0;
let trackedSessionId = null;
let trackedUserId = null;
let lastActivityTime = Date.now();
let refreshPromise = null;
let refreshGeneration = null;
let verificationRetry = null;
let generation = 0;
let inactivitySuspendCount = 0;
let sessionExtendUntilMs = null;
let runtimeTimeoutOverride = null;
const EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
const REQUEST_OPTIONS = { skipGlobalLoading: true, skipAuthRedirect: true, timeout: 10000 };
export const CLOCKED_IN_IDLE_BEFORE_TIMEDOWN_MS = 180000;
export const CLOCKED_IN_TIMEDOWN_SECONDS = 7200;

const sharedStorage = () => isDemoWindowSession() ? sessionStorage : localStorage;

function publish() {
  try { if (storageKey && state) sharedStorage().setItem(storageKey, JSON.stringify(state)); } catch { /* server remains authoritative */ }
}
function readShared() {
  try {
    const shared = JSON.parse(sharedStorage().getItem(storageKey) || 'null');
    if (shared && Number.isFinite(shared.expiresAt) && isNewerSession(shared, state)) state = shared;
  } catch { /* server remains authoritative */ }
}
function closePrompt() {
  closeStatusPrompt();
  usePresenceSessionStore().closePrompt();
}
function applyServer(data, { broadcast = true } = {}) {
  const next = localSessionState(data?.session);
  if (!next) return;
  // Older requests may finish after a successful unlock in another tab.
  if (initialized && !isNewerSession(next, state)) return;
  initialized = true;
  useSessionLockStore().verificationFailed = false;
  clearTimeout(verificationRetry);
  verificationRetry = null;
  if (data?.policy) useSessionLockStore().setLockConfig(data.policy);
  state = next;
  lastActivityTime = state.lastActivityAt;
  if (broadcast) publish();
  reconcile();
}
function reconcile() {
  if (!isTracking || !initialized || !state || timeoutInFlight) return;
  const store = useSessionLockStore();
  const phase = phaseAt(state);
  if (phase === 'expired') { void handleTimeout(); return; }
  if (phase === 'active') {
    const wasLocked = store.warningActive || store.isLocked;
    store.unlock(); store.dismissWarning();
    if (wasLocked) { closePrompt(); void sendHeartbeats(true); }
    return;
  }
  const newlyLocked = !store.warningActive;
  if (store.useLockScreen) store.lock();
  else store.unlock();
  store.showWarning(Math.max(0, (state.expiresAt - Date.now()) / 1000), expireWarning, state.expiresAt);
  if (store.isLocked) closePrompt();
  if (newlyLocked) {
    // Set the phase BEFORE the ledger/presence POST so admin idle starts now.
    void sendHeartbeats(true);
    queueMicrotask(() => {
      const selector = store.isLocked ? '.session-lock-overlay input' : '.iw-overlay button';
      document.querySelector(selector)?.focus();
    });
  }
}
function expireWarning() {
  readShared();
  if (state && phaseAt(state) !== 'expired') { reconcile(); return; }
  void handleTimeout();
}
async function changeSession(action, pin) {
  const currentGeneration = generation;
  try {
    const response = await api.post('/auth/session-activity', { action, ...(pin == null ? {} : { pin }) }, REQUEST_OPTIONS);
    if (currentGeneration === generation) applyServer(response.data);
    return response.data;
  } catch (error) {
    if (currentGeneration === generation && error.response?.data?.session) applyServer(error.response.data);
    if (error.response?.data?.error?.code === 'SESSION_EXPIRED' && !error.response.data.session) void handleTimeout();
    throw error;
  }
}
export async function resumeSession(pin) {
  readShared();
  if (!state || phaseAt(state) === 'expired') { void handleTimeout(); return false; }
  try {
    await changeSession('resume', pin);
    if (timeoutInFlight || !isTracking || phaseAt(state) !== 'active') return false;
    try { await usePresenceSessionStore().clearAway(); } catch { /* access resumed; presence will refresh */ }
    await sendHeartbeats(true);
    return true;
  } catch (error) {
    if (pin !== undefined) throw error;
    return false;
  }
}
function markActivity() {
  if (!isTracking || !initialized || timeoutInFlight || document.visibilityState !== 'visible') return;
  readShared();
  // Check elapsed deadlines before accepting the first click after sleep.
  if (!state || phaseAt(state) !== 'active') { reconcile(); return; }
  lastActivityTime = Date.now();
  pendingActivity = true;
  if (!activityFlush) {
    const delay = Math.min(Math.max(0, 15000 - (Date.now() - lastActivitySentAt)), Math.max(0, state.lockAt - Date.now() - 1500));
    activityFlush = setTimeout(flushActivity, delay);
  }
}
async function flushActivity() {
  activityFlush = null;
  if (!pendingActivity || !isTracking || timeoutInFlight) return;
  pendingActivity = false;
  lastActivitySentAt = Date.now();
  try { await changeSession('activity'); } catch { /* retain the last confirmed deadline */ }
}
async function sendHeartbeats(force = false) {
  if (!isTracking || !initialized || timeoutInFlight || isApiRateLimited() || !state) return;
  const phase = phaseAt(state);
  if (phase === 'expired') return;
  if (!force && (document.visibilityState !== 'visible' || Date.now() - lastHeartbeat < 60000)) return;
  lastHeartbeat = Date.now();
  const sessionId = localStorage.getItem('sessionId');
  if (!useAuthStore().user?.id) return;
  const agencyId = useAgencyStore().currentAgency?.id || null;
  await Promise.allSettled([
    api.post('/presence/heartbeat', { agencyId, lastActivityAt: new Date(lastActivityTime).toISOString(), sessionPhase: phase }, REQUEST_OPTIONS),
    ...(sessionId ? [api.post('/auth/platform-session/heartbeat', { sessionId, agencyId, phase, meaningful: phase === 'active' && Date.now() - lastActivityTime < 60000 }, REQUEST_OPTIONS)] : [])
  ]);
}
async function refresh() {
  if (!isTracking) return;
  if (refreshPromise && refreshGeneration === generation) return refreshPromise;
  const currentGeneration = generation;
  refreshGeneration = currentGeneration;
  const request = api.get('/auth/session-lock-config', REQUEST_OPTIONS).then(response => {
    if (currentGeneration !== generation || !isTracking) return;
    if (!localSessionState(response.data?.session)) throw new Error('Session verification is unavailable.');
    applyServer({ policy: response.data, session: response.data.session });
  }).catch(error => {
    if (currentGeneration === generation && isTracking && !initialized) useSessionLockStore().verificationFailed = true;
    if (currentGeneration === generation && error.response?.data?.session) applyServer(error.response.data);
    if (currentGeneration === generation && error.response?.data?.error?.code === 'SESSION_EXPIRED' && !error.response.data.session) void handleTimeout();
    throw error;
  }).finally(() => { if (refreshPromise === request) refreshPromise = null; });
  refreshPromise = request;
  return request;
}
function retryInitialVerification() {
  if (!isTracking || initialized || timeoutInFlight || verificationRetry) return;
  const currentGeneration = generation;
  verificationRetry = setTimeout(async () => {
    verificationRetry = null;
    if (currentGeneration !== generation || !isTracking || initialized || timeoutInFlight) return;
    if (document.visibilityState === 'visible' && !isApiRateLimited()) {
      try { await refresh(); } catch { /* The original recovery deadline still applies. */ }
    }
    if (currentGeneration === generation) retryInitialVerification();
  }, 5000);
}
function onStorage(event) {
  if (!isTracking || isDemoWindowSession()) return;
  if ((event.key === 'user' && !event.newValue) || (event.key === 'sessionId' && event.newValue !== trackedSessionId)) {
    // Cookies now belong to a different login; never log that new session out.
    useSessionLockStore().lock(); stopActivityTracking({ dismissWarning: false });
    window.location.reload();
    return;
  }
  if (event.key === 'user' && event.newValue) {
    try {
      if (JSON.parse(event.newValue)?.id !== useAuthStore().user?.id) {
        useSessionLockStore().lock(); stopActivityTracking({ dismissWarning: false });
        window.location.reload(); return;
      }
    } catch { /* malformed shared user state never renews the deadline */ }
  }
  if (event.key === storageKey && !event.newValue) {
    void handleTimeout(); return;
  }
  if (event.key !== storageKey) return;
  readShared(); reconcile();
  // Confirm unlocks with the server; no code/token is placed in shared storage.
  if (state?.phase === 'active') void refresh().catch(() => {});
}
function onVisibility() {
  if (!isTracking || document.visibilityState !== 'visible') return;
  readShared(); reconcile();
  if (!timeoutInFlight) void refresh().catch(() => {});
}
function onSecurityResponse(event) {
  if (!isTracking) return;
  applyServer(event.detail || {});
  if (event.detail?.error?.code === 'SESSION_EXPIRED' && !event.detail.session) void handleTimeout();
}
function tick() {
  readShared(); reconcile();
  void sendHeartbeats();
  // A visible live meeting is ongoing use, but hidden tabs cannot indefinitely
  // suspend security deadlines. Background polling is never counted as activity.
  if (inactivitySuspendCount > 0 && document.visibilityState === 'visible') markActivity();
}
function onFocusIn(event) {
  const store = useSessionLockStore();
  if (!store.isLocked && !store.warningActive) return;
  const allowed = store.isLocked ? '.session-lock-overlay' : '.iw-overlay, [data-pt-status-prompt]';
  if (!event.target?.closest?.(allowed)) document.querySelector(`${store.isLocked ? '.session-lock-overlay' : '.iw-overlay'} input, ${store.isLocked ? '.session-lock-overlay' : '.iw-overlay'} button`)?.focus();
}
export async function startActivityTracking({ force = false, bootstrap = null } = {}) {
  const sessionId = localStorage.getItem('sessionId');
  const userId = useAuthStore().user?.id;
  if (isTracking && trackedSessionId === sessionId && trackedUserId === userId) {
    // Settings/agency hydration is not a new login. Keep confirmed deadlines and
    // any real lock while refreshing policy; concurrent refreshes are deduplicated.
    if (force) { try { await refresh(); } catch { /* Existing deadlines/recovery timer still apply. */ } }
    return;
  }
  stopActivityTracking();
  generation += 1; isTracking = true; initialized = false; timeoutInFlight = false;
  const currentGeneration = generation;
  trackedSessionId = sessionId;
  trackedUserId = userId;
  storageKey = sessionStorageKey(trackedUserId, trackedSessionId);
  lastHeartbeat = 0; lastActivitySentAt = 0;
  state = null; readShared();
  // A cached deadline cannot authorize access or revoke a fresh cookie login.
  // Keep the screen covered until the server confirms this session.
  useSessionLockStore().setLockConfig(null);
  useSessionLockStore().verificationFailed = false;
  useSessionLockStore().lock();
  EVENTS.forEach(event => document.addEventListener(event, markActivity, true));
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('focusin', onFocusIn, true);
  window.addEventListener('pageshow', onVisibility);
  window.addEventListener('focus', onVisibility);
  window.addEventListener('storage', onStorage);
  window.addEventListener('pt:session-security', onSecurityResponse);
  scheduler = setInterval(tick, 1000);
  try {
    if (bootstrap && bootstrap.userId === userId && bootstrap.sessionId === sessionId && bootstrap.policy && localSessionState(bootstrap.session)) {
      applyServer(bootstrap);
    } else {
      await refresh();
    }
  } catch {
    // Retry transient failures without requiring a tab switch, and never extend
    // this deadline or count verification requests as user activity.
    if (currentGeneration === generation && !initialized && isTracking && !timeoutInFlight) {
      useSessionLockStore().lock();
      useSessionLockStore().showWarning(60, handleTimeout);
      retryInitialVerification();
    }
  }
  if (currentGeneration === generation && isTracking) void sendHeartbeats(true);
}
export function stopActivityTracking({ dismissWarning = true } = {}) {
  generation += 1; isTracking = false;
  clearInterval(scheduler); clearTimeout(activityFlush); clearTimeout(verificationRetry);
  verificationRetry = null;
  scheduler = null; activityFlush = null; pendingActivity = false;
  EVENTS.forEach(event => document.removeEventListener(event, markActivity, true));
  document.removeEventListener('visibilitychange', onVisibility);
  document.removeEventListener('focusin', onFocusIn, true);
  window.removeEventListener('pageshow', onVisibility);
  window.removeEventListener('focus', onVisibility);
  window.removeEventListener('storage', onStorage);
  window.removeEventListener('pt:session-security', onSecurityResponse);
  if (dismissWarning) useSessionLockStore().dismissWarning();
}
export async function handleTimeout() {
  if (timeoutInFlight) return;
  timeoutInFlight = true;
  if (state) { state = { ...state, phase: 'expired', serverNow: Math.max(state.serverNow, Date.now()) }; publish(); }
  const store = useSessionLockStore();
  store.lock(); closePrompt();
  stopActivityTracking({ dismissWarning: false });
  try { window.dispatchEvent(new CustomEvent('pt:pause-focus-audio', { detail: { reason: 'timeout' } })); } catch { /* ignore */ }
  const auth = useAuthStore();
  if (!auth.isAuthenticated) return;
  markSessionEndedRedirecting();
  const { getLoginUrlForRedirect, getCurrentPortalSlugFromHostCache, getCurrentPortalSlugFromPath } = await import('./loginRedirect');
  const loginUrl = getLoginUrlForRedirect(unref(auth.user), null, { timeout: true });
  const agency = useAgencyStore().currentAgency || {};
  const tenantKey = resolveSessionTimeoutTenantKey({ slug: agency.slug || agency.portal_url, agencyName: agency.name, hostSlug: getCurrentPortalSlugFromHostCache() || getCurrentPortalSlugFromPath() || '' });
  rememberSessionEndedContext({ loginUrl, tenantKey });
  await auth.logout('timeout', { skipStatusPrompt: true, redirectTo: `/session-ended?tenant=${encodeURIComponent(tenantKey)}&login=${encodeURIComponent(loginUrl)}` });
}
export const refetchSessionLockConfig = refresh;
export const getLastActivityTime = () => lastActivityTime;
export const resetActivityTimer = markActivity;
export const reportTimedownDismissed = () => sendHeartbeats(true);
// Away status and payroll tracking do not extend access to client information.
export function pauseIdleForSessionExtend(iso) { sessionExtendUntilMs = iso ? new Date(iso).getTime() : null; }
export function clearSessionExtendPause() { sessionExtendUntilMs = null; }
export const getSessionExtendUntilMs = () => sessionExtendUntilMs;
export function suspendInactivityTimeout() { inactivitySuspendCount += 1; }
export function resumeInactivityTimeout() { inactivitySuspendCount = Math.max(0, inactivitySuspendCount - 1); markActivity(); }
export function setRuntimeTimeoutOverride(override) { runtimeTimeoutOverride = override; }
export const getRuntimeTimeoutOverride = () => runtimeTimeoutOverride;
export const applyClockedInTimeoutOverride = () => setRuntimeTimeoutOverride({ idleBeforeTimedownMs: CLOCKED_IN_IDLE_BEFORE_TIMEDOWN_MS, timedownSeconds: CLOCKED_IN_TIMEDOWN_SECONDS });
export async function clearClockedInTimeoutOverride() { runtimeTimeoutOverride = null; await refresh(); }
export async function forceTimedownNow() { await changeSession('lock'); return getIdleTimeoutDebug(); }
export const getIdleTimeoutDebug = () => ({ isTracking, state, lastActivityTime, warningActive: useSessionLockStore().warningActive, warningSecondsLeft: useSessionLockStore().warningSecondsLeft });
