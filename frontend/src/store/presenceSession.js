import { ref, computed, nextTick } from 'vue';
import { defineStore } from 'pinia';
import api from '../services/api';
import { isPrivilegedPresenceRole } from '../utils/presenceStatus';
import { openStatusPrompt } from '../utils/statusPromptBridge';
import { useAuthStore } from './auth';

const EXTEND_KEY = 'presence:sessionExtendUntil';

export const usePresenceSessionStore = defineStore('presenceSession', () => {
  const sessionExtendUntil = ref(null);
  const myStatusLabel = ref(null);
  const myReason = ref(null);
  const promptMode = ref(null); // null | 'timedown' | 'logout' | 'manual' | 'change'
  const promptBusy = ref(false);
  let _logoutResolve = null;
  let _logoutReject = null;

  const isExtended = computed(() => {
    if (!sessionExtendUntil.value) return false;
    return new Date(sessionExtendUntil.value).getTime() > Date.now();
  });

  const promptOpen = computed(() => !!promptMode.value);

  function hydrateFromStorage() {
    try {
      const raw = localStorage.getItem(EXTEND_KEY);
      if (raw) {
        const t = new Date(raw).getTime();
        if (Number.isFinite(t) && t > Date.now()) sessionExtendUntil.value = raw;
        else localStorage.removeItem(EXTEND_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  function setLocalExtend(iso) {
    sessionExtendUntil.value = iso || null;
    try {
      if (iso) localStorage.setItem(EXTEND_KEY, iso);
      else localStorage.removeItem(EXTEND_KEY);
    } catch {
      /* ignore */
    }
  }

  function clearLocalExtend() {
    setLocalExtend(null);
    myStatusLabel.value = null;
    myReason.value = null;
  }

  async function refreshFromServer() {
    try {
      const resp = await api.get('/presence/me', { skipGlobalLoading: true, skipAuthRedirect: true });
      const data = resp.data || {};
      myStatusLabel.value = data.status_label || data.presence_display_label || null;
      myReason.value = data.presence_reason || null;
      if (data.session_extend_active && data.presence_session_extend_until) {
        const untilMs = new Date(data.presence_session_extend_until).getTime();
        // Cap / reject absurd or already-expired extends so Timedown cannot stay paused forever.
        if (Number.isFinite(untilMs) && untilMs > Date.now() && untilMs <= Date.now() + 2 * 60 * 60 * 1000) {
          setLocalExtend(data.presence_session_extend_until);
        } else {
          clearLocalExtend();
        }
      } else {
        // Server says no active extend — always clear local pause.
        clearLocalExtend();
      }
      return data;
    } catch {
      return null;
    }
  }

  function currentUserId() {
    try {
      return useAuthStore().user?.id || null;
    } catch {
      return null;
    }
  }

  function openTimedownPrompt() {
    promptMode.value = 'timedown';
    openStatusPrompt('timedown', { userId: currentUserId() });
  }

  /** Intentional Away/timeout from the Logout split control (practice status, stay signed in). */
  function openManualTimeoutPrompt() {
    promptMode.value = 'manual';
    openStatusPrompt('manual', { userId: currentUserId() });
  }

  /** Change Away reason/timer while already away — does not clear Active / "I'm back". */
  function openChangeStatusPrompt() {
    promptMode.value = 'change';
    const reason = myReason.value || 'meal';
    openStatusPrompt('change', {
      userId: currentUserId(),
      initialReason: reason,
      timerMode: 'continue'
    });
  }

  /**
   * Open logout status prompt. Resolves true if caller should proceed with logout,
   * false if user cancelled / set extend instead.
   */
  function openLogoutPrompt() {
    // A previous hung logout (UI never painted / Vue patch died) can leave
    // promptMode stuck on 'logout' and an unresolved waiter. Re-assigning the
    // same mode is a no-op for Vue, so the modal never reappears.
    if (typeof _logoutResolve === 'function') {
      const prev = _logoutResolve;
      _logoutResolve = null;
      _logoutReject = null;
      try {
        prev(false);
      } catch {
        /* ignore */
      }
    }
    return new Promise((resolve, reject) => {
      _logoutResolve = resolve;
      _logoutReject = reject;
      promptMode.value = null;
      nextTick(() => {
        promptMode.value = 'logout';
      });
    });
  }

  function closePrompt({ proceedLogout = false } = {}) {
    const mode = promptMode.value;
    promptMode.value = null;
    if (mode === 'logout' && typeof _logoutResolve === 'function') {
      const resolve = _logoutResolve;
      _logoutResolve = null;
      _logoutReject = null;
      // Let the modal start unmounting before auth.clearAuth tears down the tree.
      queueMicrotask(() => resolve(proceedLogout));
    }
  }

  async function applyAway({
    reason,
    durationMinutes,
    extendSession = true,
    note = null,
    reachable = null,
    customLabel = null,
    timerMode = 'reset'
  } = {}) {
    promptBusy.value = true;
    try {
      const resp = await api.post(
        '/presence/status/away',
        {
          reason,
          durationMinutes,
          extendSession,
          note,
          reachable,
          customLabel,
          timerMode: timerMode === 'continue' ? 'continue' : 'reset'
        },
        { skipGlobalLoading: true }
      );
      const until = resp.data?.session_extend_until || null;
      myStatusLabel.value = resp.data?.status_label || resp.data?.display_label || null;
      myReason.value = reason;
      if (until) setLocalExtend(until);
      else if (reason === 'out_day') clearLocalExtend();
      return resp.data;
    } finally {
      promptBusy.value = false;
    }
  }

  async function clearAway() {
    promptBusy.value = true;
    try {
      await api.post('/presence/status/clear', {}, { skipGlobalLoading: true });
      clearLocalExtend();
    } finally {
      promptBusy.value = false;
    }
  }

  function shouldUseStatusPrompt(role) {
    return isPrivilegedPresenceRole(role);
  }

  hydrateFromStorage();

  return {
    sessionExtendUntil,
    myStatusLabel,
    myReason,
    promptMode,
    promptBusy,
    promptOpen,
    isExtended,
    hydrateFromStorage,
    setLocalExtend,
    clearLocalExtend,
    refreshFromServer,
    openTimedownPrompt,
    openManualTimeoutPrompt,
    openChangeStatusPrompt,
    openLogoutPrompt,
    closePrompt,
    applyAway,
    clearAway,
    shouldUseStatusPrompt
  };
});
