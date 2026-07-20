<template>
  <!-- Prompt UI is rendered imperatively by statusPromptBridge (Teleport was unreliable on ITSCO). -->
  <span class="pt-status-prompt-anchor" aria-hidden="true"></span>
</template>

<script setup>
import { onUnmounted, watch } from 'vue';
import { useAuthStore } from '../store/auth';
import { useSessionLockStore } from '../store/sessionLock';
import { usePresenceSessionStore } from '../store/presenceSession';
import {
  registerStatusPromptHandlers,
  closeStatusPrompt,
  getStatusPromptMode,
  subscribeStatusPrompt
} from '../utils/statusPromptBridge';
import {
  resetActivityTimer,
  reportTimedownDismissed,
  pauseIdleForSessionExtend,
  clearSessionExtendPause
} from '../utils/activityTracker';

const authStore = useAuthStore();
const sessionLockStore = useSessionLockStore();
const presenceSession = usePresenceSessionStore();

// Keep Pinia promptMode in sync when the imperative bridge closes (Cancel / Update).
const unsubPromptBridge = subscribeStatusPrompt((mode) => {
  if (!mode && presenceSession.promptMode && presenceSession.promptMode !== 'logout') {
    presenceSession.promptMode = null;
  }
}, 'statusPromptModal');

// While Timedown is up, privileged users must keep the status modal stacked on top.
watch(
  () => ({
    warning: sessionLockStore.warningActive,
    extended: presenceSession.isExtended,
    mode: presenceSession.promptMode || getStatusPromptMode()
  }),
  ({ warning, extended, mode }) => {
    if (!warning || extended) return;
    if (!presenceSession.shouldUseStatusPrompt(authStore.user?.role)) return;
    if (mode === 'timedown') return;
    // Re-open if Timedown is showing and the chooser was lost (navigate/HMR/stacking).
    presenceSession.openTimedownPrompt();
  },
  { immediate: true }
);

registerStatusPromptHandlers({
  async onStillHere() {
    try {
      await presenceSession.clearAway();
    } catch {
      /* ignore */
    }
    clearSessionExtendPause({ reschedule: true });
    sessionLockStore.dismissWarning();
    resetActivityTimer();
    reportTimedownDismissed();
  },

  async onSetStatus({
    mode,
    reason,
    durationMinutes,
    reachable = null,
    customLabel = null,
    timerMode = 'reset'
  }) {
    if (!reason) return {};

    if (reason === 'out_day' || reason === 'available_offline') {
      await presenceSession.applyAway({
        reason,
        extendSession: false,
        reachable: null
      });
      sessionLockStore.dismissWarning();
      clearSessionExtendPause({ reschedule: false });
      if (mode === 'logout') {
        return { proceedLogout: true };
      }
      if (mode === 'manual' || mode === 'change') {
        await authStore.logout('user_logout', { skipStatusPrompt: true });
        return {};
      }
      await authStore.logout('timeout', { skipStatusPrompt: true });
      return {};
    }

    await presenceSession.applyAway({
      reason,
      durationMinutes,
      extendSession: true,
      reachable: reachable || null,
      customLabel: customLabel || null,
      timerMode: mode === 'change' && timerMode === 'continue' ? 'continue' : 'reset'
    });
    sessionLockStore.dismissWarning();
    pauseIdleForSessionExtend(presenceSession.sessionExtendUntil);
    // AwaySessionOverlay shows the countdown + combined reason label.
    return {};
  },

  async onLogoutNow() {
    await authStore.logout('timeout', { skipStatusPrompt: true });
  }
});

onUnmounted(() => {
  if (typeof unsubPromptBridge === 'function') unsubPromptBridge();
  // Only clear handlers if this instance still owns them and prompt is closed.
  if (!getStatusPromptMode()) {
    registerStatusPromptHandlers(null);
  }
  try {
    presenceSession.closePrompt({ proceedLogout: false });
  } catch {
    /* ignore */
  }
});

// Keep closeStatusPrompt referenced for tree-shaking clarity / future use
void closeStatusPrompt;
</script>
