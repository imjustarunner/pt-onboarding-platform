import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useSessionLockStore = defineStore('sessionLock', () => {
  const isLocked = ref(false);
  const lockConfig = ref(null);
  const verificationFailed = ref(false);

  // Inactivity warning state (shown 10 min before Session Ended / logout)
  const warningActive = ref(false);
  const warningSecondsLeft = ref(0);
  let _warningInterval = null;
  let _warningOnExpire = null;
  let _warningEndsAt = null;

  const useLockScreen = computed(() => {
    const c = lockConfig.value;
    return !!(c?.useLockScreen);
  });

  const effectiveTimeoutMs = computed(() => {
    const c = lockConfig.value;
    const min = c?.effectiveTimeoutMinutes ?? 30;
    return Math.min(240, Math.max(1, min)) * 60 * 1000;
  });

  function setLockConfig(config) {
    lockConfig.value = config;
  }

  function lock() {
    isLocked.value = true;
  }

  function unlock() {
    isLocked.value = false;
  }

  function _clearWarningTimer() {
    if (_warningInterval) {
      clearInterval(_warningInterval);
      _warningInterval = null;
    }
  }

  function _runExpire() {
    _clearWarningTimer();
    _warningEndsAt = null;
    const cb = _warningOnExpire;
    _warningOnExpire = null;
    // Keep warningActive true until logout unmounts the modal so the user
    // does not briefly see the dashboard again at 0:00.
    if (typeof cb === 'function') cb();
    else warningActive.value = false;
  }

  /** Absolute deadline: hidden tabs, sleep and reload never grant extra time. */
  function showWarning(seconds, onExpire, endsAt = Date.now() + seconds * 1000) {
    warningActive.value = true;
    _warningOnExpire = onExpire;
    _warningEndsAt = endsAt;
    _clearWarningTimer();
    _warningInterval = setInterval(checkWarningDeadline, 250);
    checkWarningDeadline();
  }

  function checkWarningDeadline() {
    if (!warningActive.value || !_warningEndsAt) return false;
    warningSecondsLeft.value = Math.max(0, Math.ceil((_warningEndsAt - Date.now()) / 1000));
    if (Date.now() >= _warningEndsAt) { _runExpire(); return true; }
    return false;
  }

  function onTabBecameVisible() { return checkWarningDeadline(); }

  /** Dismiss the warning (user clicked "Stay Logged In"). */
  function dismissWarning() {
    _clearWarningTimer();
    warningActive.value = false;
    warningSecondsLeft.value = 0;
    _warningOnExpire = null;
    _warningEndsAt = null;
  }

  return {
    isLocked,
    lockConfig,
    verificationFailed,
    useLockScreen,
    effectiveTimeoutMs,
    warningActive,
    warningSecondsLeft,
    setLockConfig,
    lock,
    unlock,
    showWarning,
    dismissWarning,
    onTabBecameVisible,
    checkWarningDeadline
  };
});
