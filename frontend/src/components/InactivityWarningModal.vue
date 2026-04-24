<template>
  <Teleport to="body">
    <Transition name="iw-fade">
      <div
        v-if="sessionLockStore.warningActive"
        class="iw-overlay"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="iw-title"
        aria-describedby="iw-desc"
      >
        <div class="iw-card" :style="cardStyle">
          <!-- Animated ring countdown -->
          <div class="iw-ring-wrap" aria-hidden="true">
            <svg class="iw-ring-svg" viewBox="0 0 80 80">
              <circle class="iw-ring-track" cx="40" cy="40" r="34" />
              <circle
                class="iw-ring-progress"
                cx="40"
                cy="40"
                r="34"
                :stroke-dashoffset="ringOffset"
              />
            </svg>
            <span class="iw-countdown-num">{{ formattedSeconds }}</span>
          </div>

          <div class="iw-body">
            <h2 id="iw-title" class="iw-title">Are you still there?</h2>
            <p id="iw-desc" class="iw-message">
              You'll be automatically signed out in
              <strong>{{ formattedTime }}</strong> due to inactivity.
            </p>

            <div class="iw-actions">
              <button
                type="button"
                class="iw-btn iw-btn--stay"
                @click="stayLoggedIn"
                autofocus
              >Stay Logged In</button>
              <button
                type="button"
                class="iw-btn iw-btn--logout"
                @click="logoutNow"
              >Log Out Now</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';
import { useSessionLockStore } from '../store/sessionLock.js';
import { resetActivityTimer } from '../utils/activityTracker.js';
import { useAuthStore } from '../store/auth.js';
import { useBrandingStore } from '../store/branding.js';

const sessionLockStore = useSessionLockStore();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const TOTAL_WARNING_SECONDS = 180; // must match activityTracker WARNING_SECONDS

const cardStyle = computed(() => {
  const primary = brandingStore.effectivePrimaryColor || '#ff6b35';
  return { '--iw-accent': primary };
});

/** Ring circumference = 2π × r = 2π × 34 ≈ 213.6 */
const CIRCUMFERENCE = 2 * Math.PI * 34;

const ringOffset = computed(() => {
  const pct = sessionLockStore.warningSecondsLeft / TOTAL_WARNING_SECONDS;
  return CIRCUMFERENCE * (1 - pct);
});

const formattedSeconds = computed(() => {
  const s = sessionLockStore.warningSecondsLeft;
  return s > 0 ? s : 0;
});

const formattedTime = computed(() => {
  const s = sessionLockStore.warningSecondsLeft;
  if (s <= 0) return '0 seconds';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0 && sec > 0) return `${m}m ${sec}s`;
  if (m > 0) return `${m} minute${m !== 1 ? 's' : ''}`;
  return `${sec} second${sec !== 1 ? 's' : ''}`;
});

function stayLoggedIn() {
  sessionLockStore.dismissWarning();
  resetActivityTimer();
}

async function logoutNow() {
  sessionLockStore.dismissWarning();
  const { getLoginUrlForRedirect } = await import('../utils/loginRedirect.js');
  const redirectTo = getLoginUrlForRedirect(authStore.user, null, { timeout: true });
  await authStore.logout('user_logout', { redirectTo });
}
</script>

<style scoped>
/* Overlay */
.iw-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  padding: 16px;
}

/* Card */
.iw-card {
  background: #fff;
  border-radius: 20px;
  padding: 32px 28px 28px;
  max-width: 380px;
  width: 100%;
  text-align: center;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  border-top: 4px solid var(--iw-accent, #ff6b35);
}

/* Ring */
.iw-ring-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}
.iw-ring-svg {
  width: 80px;
  height: 80px;
  transform: rotate(-90deg);
}
.iw-ring-track {
  fill: none;
  stroke: #f0f0f0;
  stroke-width: 6;
}
.iw-ring-progress {
  fill: none;
  stroke: var(--iw-accent, #ff6b35);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 213.6;
  transition: stroke-dashoffset 1s linear;
}
.iw-countdown-num {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 700;
  color: #1a1a2e;
}

/* Text */
.iw-body { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
.iw-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0;
}
.iw-message {
  font-size: 0.92rem;
  color: #555;
  margin: 0;
  line-height: 1.5;
}
.iw-message strong { color: #1a1a2e; }

/* Actions */
.iw-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin-top: 6px;
}
.iw-btn {
  width: 100%;
  padding: 13px 20px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s, transform 0.1s;
}
.iw-btn:hover { opacity: 0.88; }
.iw-btn:active { transform: scale(0.98); }
.iw-btn--stay {
  background: var(--iw-accent, #ff6b35);
  color: #fff;
  box-shadow: 0 4px 14px rgba(255,107,53,0.3);
}
.iw-btn--logout {
  background: transparent;
  color: #888;
  border: 1.5px solid #e0e0e0;
  font-weight: 500;
}
.iw-btn--logout:hover { color: #444; border-color: #bbb; }

/* Transition */
.iw-fade-enter-active,
.iw-fade-leave-active { transition: opacity 0.25s ease; }
.iw-fade-enter-from,
.iw-fade-leave-to { opacity: 0; }

/* Mobile */
@media (max-width: 480px) {
  .iw-card {
    padding: 24px 20px 22px;
    border-radius: 16px;
  }
  .iw-title { font-size: 1.2rem; }
}
</style>
