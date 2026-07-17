import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

/** Extra seconds to stay signed in after returning to a tab whose Timedown already hit 0 while hidden. */
export const TIMEDOWN_VISIBLE_GRACE_SECONDS = 90;

export const useSessionLockStore = defineStore('sessionLock', () => {
  const isLocked = ref(false);
  const lockConfig = ref(null);

  // Inactivity warning state (shown 10 min before Session Ended / logout)
  const warningActive = ref(false);
  const warningSecondsLeft = ref(0);
  let _warningInterval = null;
  let _warningOnExpire = null;
  let _warningEndsAt = null;
  /** True when countdown hit 0 while the tab was hidden — wait until visible + grace. */
  let _deferredExpire = false;

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
    _deferredExpire = false;
    _warningEndsAt = null;
    const cb = _warningOnExpire;
    _warningOnExpire = null;
    // Keep warningActive true until logout unmounts the modal so the user
    // does not briefly see the dashboard again at 0:00.
    if (typeof cb === 'function') cb();
    else warningActive.value = false;
  }

  /**
   * Show the Timedown warning with a wall-clock countdown.
   * Uses endsAt so background-tab interval throttling cannot freeze the timer at 10:00.
   * Does NOT logout while the document is hidden — defers until the tab is visible again
   * (with a short grace period) so users are not dumped on Session Ended with no modal.
   * @param {number} seconds  - seconds to count down before calling onExpire
   * @param {Function} onExpire - called when countdown reaches 0 (should trigger logout)
   */
  function showWarning(seconds, onExpire) {
    const total = Math.max(1, Math.floor(Number(seconds) || 0));
    warningSecondsLeft.value = total;
    warningActive.value = true;
    _warningOnExpire = onExpire;
    _deferredExpire = false;
    _warningEndsAt = Date.now() + total * 1000;
    _clearWarningTimer();
    _warningInterval = setInterval(() => {
      if (!_warningEndsAt) return;
      const left = Math.max(0, Math.ceil((_warningEndsAt - Date.now()) / 1000));
      warningSecondsLeft.value = left;
      if (left > 0) return;

      // Tab in background / minimized: do not hard-logout until they can see a warning.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        _deferredExpire = true;
        warningSecondsLeft.value = 0;
        return;
      }
      _runExpire();
    }, 250);
  }

  /**
   * Call when the tab becomes visible. If Timedown already hit 0 while hidden
   * (or the wall-clock end passed while timers were throttled), grant a short
   * grace countdown so the modal is actually visible.
   * @returns {boolean} true if grace was started
   */
  function onTabBecameVisible() {
    if (!warningActive.value) return false;
    const expiredByClock = !!( _warningEndsAt && Date.now() >= _warningEndsAt );
    if (!_deferredExpire && !expiredByClock && warningSecondsLeft.value > 0) return false;

    // Expired (or deferred) while away — give them a visible grace window.
    const cb = _warningOnExpire;
    showWarning(TIMEDOWN_VISIBLE_GRACE_SECONDS, cb);
    return true;
  }

  /** Dismiss the warning (user clicked "Stay Logged In"). */
  function dismissWarning() {
    _clearWarningTimer();
    warningActive.value = false;
    warningSecondsLeft.value = 0;
    _warningOnExpire = null;
    _warningEndsAt = null;
    _deferredExpire = false;
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
    dismissWarning,
    onTabBecameVisible
  };
});
