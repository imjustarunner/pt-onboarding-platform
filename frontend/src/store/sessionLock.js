import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useSessionLockStore = defineStore('sessionLock', () => {
  const isLocked = ref(false);
  const lockConfig = ref(null);

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

  return {
    isLocked,
    lockConfig,
    useLockScreen,
    effectiveTimeoutMs,
    setLockConfig,
    lock,
    unlock
  };
});
