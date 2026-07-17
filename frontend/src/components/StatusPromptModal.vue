<template>
  <!-- Prompt UI is rendered imperatively by statusPromptBridge (Teleport was unreliable on ITSCO). -->
  <span class="pt-status-prompt-anchor" aria-hidden="true"></span>
</template>

<script setup>
import { onUnmounted } from 'vue';
import { useAuthStore } from '../store/auth';
import { useSessionLockStore } from '../store/sessionLock';
import { usePresenceSessionStore } from '../store/presenceSession';
import {
  registerStatusPromptHandlers,
  closeStatusPrompt,
  getStatusPromptMode
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

  async onSetStatus({ mode, reason, durationMinutes, reachable = null, customLabel = null }) {
    if (!reason) return {};

    if (reason === 'out_day') {
      await presenceSession.applyAway({ reason: 'out_day', extendSession: false });
      sessionLockStore.dismissWarning();
      if (mode === 'logout') {
        return { proceedLogout: true };
      }
      if (mode === 'manual') {
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
      customLabel: customLabel || null
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
