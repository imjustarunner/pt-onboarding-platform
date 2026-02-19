/**
 * Composable for snooze state of login notification reminder.
 * Persists to localStorage per user so snooze survives refresh.
 */
import { ref, computed, watch } from 'vue';

const STORAGE_KEY_PREFIX = 'momentum_reminder_snooze';

function getStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}:${userId || 0}`;
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

export function useReminderSnooze(userIdRef) {
  const snoozedUntil = ref(null);

  const isSnoozed = computed(() => {
    const until = snoozedUntil.value;
    if (!until) return false;
    return Date.now() < until;
  });

  function load() {
    const id = typeof userIdRef === 'function' ? userIdRef() : userIdRef?.value;
    snoozedUntil.value = loadSnoozedUntil(id);
  }

  function snooze(durationMs) {
    const id = typeof userIdRef === 'function' ? userIdRef() : userIdRef?.value;
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
    const id = typeof userIdRef === 'function' ? userIdRef() : userIdRef?.value;
    snoozedUntil.value = null;
    saveSnoozedUntil(id, null);
  }

  if (userIdRef) {
    watch(userIdRef, load, { immediate: true });
  }

  return {
    isSnoozed,
    snoozedUntil,
    load,
    snooze,
    snooze1h,
    snooze3h,
    snoozeTomorrow,
    clearSnooze
  };
}
