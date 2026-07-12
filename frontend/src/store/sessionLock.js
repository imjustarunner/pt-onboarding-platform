import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useSessionLockStore = defineStore('sessionLock', () => {
  const isLocked = ref(false);
  const lockConfig = ref(null);

  // Inactivity warning state (shown 10 min before Session Ended / logout)
  const warningActive = ref(false);
  const warningSecondsLeft = ref(0);
  let _warningInterval = null;
  let _warningOnExpire = null;

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

  /**
   * Show the Timedown warning with a wall-clock countdown.
   * Uses endsAt so background-tab interval throttling cannot freeze the timer at 10:00.
   * @param {number} seconds  - seconds to count down before calling onExpire
   * @param {Function} onExpire - called when countdown reaches 0 (should trigger logout)
   */
  function showWarning(seconds, onExpire) {
    const total = Math.max(1, Math.floor(Number(seconds) || 0));
    warningSecondsLeft.value = total;
    warningActive.value = true;
    _warningOnExpire = onExpire;
    const endsAt = Date.now() + total * 1000;
    if (_warningInterval) clearInterval(_warningInterval);
    _warningInterval = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      warningSecondsLeft.value = left;
      if (left <= 0) {
        _clearWarningTimer();
        // Keep warningActive true until logout unmounts the modal so the user
        // does not briefly see the dashboard again at 0:00.
        const cb = _warningOnExpire;
        _warningOnExpire = null;
        if (typeof cb === 'function') cb();
        else warningActive.value = false;
      }
    }, 250);
  }

  /** Dismiss the warning (user clicked "Stay Logged In"). */
  function dismissWarning() {
    _clearWarningTimer();
    warningActive.value = false;
    _warningOnExpire = null;
  }

  function _clearWarningTimer() {
    if (_warningInterval) {
      clearInterval(_warningInterval);
      _warningInterval = null;
    }
  }

  return {
    isLocked,
    lockConfig,
    useLockScreen,
    effectiveTimeoutMs,
    warningActive,
    warningSecondsLeft,
    setLockConfig,
    lock,
    unlock,
    showWarning,
    dismissWarning
  };
});
