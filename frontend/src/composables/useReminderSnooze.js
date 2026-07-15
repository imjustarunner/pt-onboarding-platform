/**
 * Composable for snooze / defer state of login notification reminder.
 * Time-based snooze and "remind me next login" persist per user in localStorage.
 */
import { ref, computed, watch } from 'vue';

const STORAGE_KEY_PREFIX = 'momentum_reminder_snooze';
const DEFER_KEY_PREFIX = 'momentum_reminder_defer_session';
const DISMISSED_KEY = 'loginNotificationsDismissed';

export function isLoginNotificationDismissed() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markLoginNotificationDismissed() {
  try {
    sessionStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // ignore
  }
}

export function clearLoginNotificationDismissed() {
  try {
    sessionStorage.removeItem(DISMISSED_KEY);
  } catch {
    // ignore
  }
}

export function signalFreshLogin() {
  clearLoginNotificationDismissed();
  try {
    window.dispatchEvent(new CustomEvent('app:just-logged-in'));
  } catch {
    // ignore
  }
}

function getStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}:${userId || 0}`;
}

function getDeferKey(userId) {
  return `${DEFER_KEY_PREFIX}:${userId || 0}`;
}

function loadSnoozedUntil(userId) {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ts = Number(parsed?.until);
    if (!Number.isFinite(ts)) return null;
    return ts;
  } catch {
    return null;
  }
}

function saveSnoozedUntil(userId, until) {
  try {
    const key = getStorageKey(userId);
    if (until == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify({ until }));
    }
  } catch {
    // ignore
  }
}

function loadDeferredSessionId(userId) {
  try {
    const raw = localStorage.getItem(getDeferKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sessionId = String(parsed?.sessionId || '').trim();
    return sessionId || null;
  } catch {
    return null;
  }
}

function saveDeferredSessionId(userId, sessionId) {
  try {
    const key = getDeferKey(userId);
    if (!sessionId) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify({ sessionId: String(sessionId) }));
    }
  } catch {
    // ignore
  }
}

function resolveRef(refLike) {
  if (typeof refLike === 'function') return refLike();
  return refLike?.value;
}

export function useReminderSnooze(userIdRef, sessionIdRef = null) {
  const snoozedUntil = ref(null);
  const deferredSessionId = ref(null);

  const isSnoozed = computed(() => {
    const until = snoozedUntil.value;
    if (!until) return false;
    return Date.now() < until;
  });

  const isDeferredForSession = computed(() => {
    const deferred = deferredSessionId.value;
    const sessionId = resolveRef(sessionIdRef);
    return Boolean(deferred && sessionId && deferred === sessionId);
  });

  function load() {
    const id = resolveRef(userIdRef);
    snoozedUntil.value = loadSnoozedUntil(id);
    deferredSessionId.value = loadDeferredSessionId(id);
  }

  function snooze(durationMs) {
    const id = resolveRef(userIdRef);
    const until = Date.now() + durationMs;
    snoozedUntil.value = until;
    saveSnoozedUntil(id, until);
  }

  function snooze1h() {
    snooze(60 * 60 * 1000);
  }

  function snooze3h() {
    snooze(3 * 60 * 60 * 1000);
  }

  function snoozeTomorrow() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    const ms = tomorrow.getTime() - now.getTime();
    snooze(Math.max(ms, 60 * 60 * 1000)); // at least 1h
  }

  function clearSnooze() {
    const id = resolveRef(userIdRef);
    snoozedUntil.value = null;
    saveSnoozedUntil(id, null);
  }

  function deferUntilNextLogin() {
    const id = resolveRef(userIdRef);
    const sessionId = resolveRef(sessionIdRef);
    if (!sessionId) return;
    deferredSessionId.value = sessionId;
    saveDeferredSessionId(id, sessionId);
  }

  function clearDefer() {
    const id = resolveRef(userIdRef);
    deferredSessionId.value = null;
    saveDeferredSessionId(id, null);
  }

  if (userIdRef) {
    watch(userIdRef, load, { immediate: true });
  }
  if (sessionIdRef) {
    watch(sessionIdRef, load, { immediate: true });
  }

  return {
    isSnoozed,
    isDeferredForSession,
    snoozedUntil,
    deferredSessionId,
    load,
    snooze,
    snooze1h,
    snooze3h,
    snoozeTomorrow,
    clearSnooze,
    deferUntilNextLogin,
    clearDefer
  };
}
