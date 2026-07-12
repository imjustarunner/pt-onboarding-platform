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
   * Show the "Are you still here?" warning with a countdown.
   * @param {number} seconds  - seconds to count down before calling onExpire
   * @param {Function} onExpire - called when countdown reaches 0 (should trigger logout)
   */
  function showWarning(seconds, onExpire) {
    warningSecondsLeft.value = seconds;
    warningActive.value = true;
    _warningOnExpire = onExpire;
    if (_warningInterval) clearInterval(_warningInterval);
    _warningInterval = setInterval(() => {
      if (warningSecondsLeft.value > 0) {
        warningSecondsLeft.value -= 1;
      } else {
        _clearWarningTimer();
        warningActive.value = false;
        if (typeof _warningOnExpire === 'function') _warningOnExpire();
        _warningOnExpire = null;
      }
    }, 1000);
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
