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
        <div class="iw-stage" :class="{ 'iw-stage--clocked': isClockedIn }">
          <!-- Clocked-in: overt status banner (desktop + mobile) -->
          <div v-if="isClockedIn" class="iw-clocked-banner" role="status">
            <span class="iw-clocked-dot" aria-hidden="true" />
            <div class="iw-clocked-banner-text">
              <strong>You are currently clocked in</strong>
              <span>Your screen has been timed out due to inactivity. Session logout in {{ clock }}.</span>
            </div>
            <span v-if="indirectElapsed" class="iw-clocked-elapsed">Worked {{ indirectElapsed }}</span>
          </div>

          <!-- ── Desktop: tenant-branded video / poster ───────────────────── -->
          <template v-if="!isMobile">
            <video
              v-if="useVideo"
              ref="videoRef"
              class="iw-media"
              autoplay
              muted
              loop
              playsinline
              :poster="posterUrl"
              @error="onVideoError"
            >
              <source :src="videoUrl" type="video/mp4" />
            </video>
            <img v-else class="iw-media" :src="posterUrl" alt="" />

            <!-- Live clock aligned with the baked-in "Timing out in" art text -->
            <div class="iw-timer" :class="{ 'iw-timer--long': isLongCountdown }" aria-live="polite" aria-atomic="true">
              <span class="iw-timer-value">{{ clock }}</span>
            </div>

            <div
              v-if="!suppressActions || isClockedIn"
              class="iw-actions"
              :class="{ 'iw-actions--roam': !isClockedIn && !suppressActions }"
              :style="isClockedIn || suppressActions ? null : stayBtnStyle"
            >
              <button
                v-if="isClockedIn"
                type="button"
                class="iw-clock-out"
                :disabled="clockOutBusy"
                @click="clockOutAndContinue"
              >
                {{ clockOutBusy ? 'Clocking out…' : 'Clock Out' }}
              </button>
              <button
                v-if="!suppressActions"
                type="button"
                class="iw-stay"
                :class="{ 'iw-stay--secondary': isClockedIn }"
                :disabled="clockOutBusy"
                @click="stayLoggedIn"
              >
                I'm still here — stay logged in
              </button>
            </div>
          </template>

          <!-- ── Mobile: shared background + text card ────────────────────── -->
          <template v-else>
            <img class="iw-media" :src="mobileBgUrl" alt="" />

            <div class="iw-mobile-card">
              <div class="iw-mobile-shield" aria-hidden="true">{{ isClockedIn ? '●' : '🔒' }}</div>
              <h2 id="iw-title" class="iw-mobile-title">
                {{ isClockedIn ? 'Still Clocked In — Screen Timed Out' : "We're Protecting Your Information" }}
              </h2>
              <p id="iw-desc" class="iw-mobile-body">
                <template v-if="isClockedIn">
                  You are currently clocked in for Log Time. Your screen timed out after inactivity.
                  Clock out below, or stay logged in to keep working. Logout in {{ clock }}.
                </template>
                <template v-else>
                  Your session has been inactive for a while. Hang tight — we'll keep your information secure.
                </template>
              </p>
              <div class="iw-mobile-countdown" aria-live="polite" aria-atomic="true">
                <span class="iw-mobile-countdown-label">{{ isClockedIn ? 'Logout in' : 'Timing out in' }}</span>
                <span class="iw-mobile-countdown-value">{{ clock }}</span>
              </div>
              <button
                v-if="isClockedIn"
                type="button"
                class="iw-mobile-clock-out"
                :disabled="clockOutBusy"
                @click="clockOutAndContinue"
              >
                {{ clockOutBusy ? 'Clocking out…' : 'Clock Out' }}
              </button>
              <button
                v-if="!suppressActions"
                type="button"
                class="iw-mobile-stay"
                :class="{ 'iw-mobile-stay--ghost': isClockedIn }"
                :disabled="clockOutBusy"
                @click="stayLoggedIn"
              >
                I'm still here — stay logged in
              </button>
            </div>
          </template>

          <!-- Screen-reader fallbacks (desktop only needs these, mobile has visible text) -->
          <template v-if="!isMobile">
            <h2 id="iw-title" class="sr-only">
              {{ isClockedIn ? 'Still clocked in — screen timed out' : "We're protecting your information" }}
            </h2>
            <p id="iw-desc" class="sr-only">
              <template v-if="isClockedIn">
                You are currently clocked in. Your screen has been timed out. Logout in {{ clock }}.
              </template>
              <template v-else>
                Your session has been inactive. Timing out in {{ clock }}.
              </template>
            </p>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useSessionLockStore } from '../store/sessionLock.js';
import { useIndirectTimeSessionStore } from '../store/indirectTimeSession.js';
import { resetActivityTimer, reportTimedownDismissed } from '../utils/activityTracker.js';
import { useAgencyStore } from '../store/agency.js';
import {
  resolveSessionTimeoutTenantKey,
  getTimedownVideoUrl,
  getTimedownPosterUrl,
  getMobileTimedownBgUrl,
  formatCountdownClock
} from '../utils/sessionTimeoutBranding.js';
import { getCurrentPortalSlugFromHostCache, getCurrentPortalSlugFromPath } from '../utils/loginRedirect.js';
import { getDashboardRoute } from '../utils/router.js';

defineProps({
  /** When true, hide stay/logout buttons (privileged StatusPromptModal owns actions). */
  suppressActions: { type: Boolean, default: false }
});

const sessionLockStore = useSessionLockStore();
const indirectStore = useIndirectTimeSessionStore();
const agencyStore = useAgencyStore();
const router = useRouter();
const route = useRoute();

const isClockedIn = computed(() => !!indirectStore.isClockedIn);
const indirectElapsed = computed(() => (isClockedIn.value ? indirectStore.formattedElapsed : ''));
const isLongCountdown = computed(() => Number(sessionLockStore.warningSecondsLeft || 0) >= 3600);
const clockOutBusy = ref(false);

// ── Mobile detection ──────────────────────────────────────────────────────────
const mobileQuery = typeof window !== 'undefined'
  ? window.matchMedia('(max-width: 640px)')
  : null;
const isMobile = ref(mobileQuery?.matches ?? false);

function onMobileChange(e) { isMobile.value = e.matches; }
onMounted(() => mobileQuery?.addEventListener('change', onMobileChange));
onUnmounted(() => {
  mobileQuery?.removeEventListener('change', onMobileChange);
  clearTimeout(reshuffleTimer);
});

// ── Desktop: video state ──────────────────────────────────────────────────────
const useVideo = ref(true);
const videoRef = ref(null);

// ── Desktop: random stay-button position ─────────────────────────────────────
const stayBtnStyle = ref({});
let reshuffleTimer = null;

function randomStayPosition() {
  const minX = 2, maxX = 62;
  const minY = 3, maxY = 72;
  const x = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
  const y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
  stayBtnStyle.value = { left: `${x}%`, top: `${y}%`, right: 'auto', bottom: 'auto' };
}

function scheduleReshuffle() {
  clearTimeout(reshuffleTimer);
  if (isClockedIn.value) return;
  const delay = 3000 + Math.random() * 3000;
  reshuffleTimer = setTimeout(() => {
    randomStayPosition();
    scheduleReshuffle();
  }, delay);
}

// ── Branding ──────────────────────────────────────────────────────────────────
const tenantKey = computed(() => {
  const agency = agencyStore.currentAgency || {};
  return resolveSessionTimeoutTenantKey({
    slug: agency.slug || agency.portal_url || agency.portalUrl,
    portalUrl: agency.portal_url || agency.portalUrl,
    agencyName: agency.name,
    hostSlug: getCurrentPortalSlugFromHostCache() || getCurrentPortalSlugFromPath() || ''
  });
});

const videoUrl = computed(() => getTimedownVideoUrl(tenantKey.value));
const posterUrl = computed(() => getTimedownPosterUrl(tenantKey.value));
const mobileBgUrl = getMobileTimedownBgUrl();
const clock = computed(() => formatCountdownClock(sessionLockStore.warningSecondsLeft));

function onVideoError() { useVideo.value = false; }

function stayLoggedIn() {
  sessionLockStore.dismissWarning();
  reportTimedownDismissed();
  resetActivityTimer();
}

function goToLogTime() {
  const base = getDashboardRoute() || '/dashboard';
  const path = typeof base === 'string' ? base : (base?.path || '/dashboard');
  const cur = String(route.path || '').replace(/\/$/, '') || '/';
  const want = String(path || '').replace(/\/$/, '') || '/';
  const query = { ...(route.query || {}), tab: 'log_time' };
  if (cur === want) router.replace({ path: want, query }).catch(() => {});
  else router.push({ path: want, query }).catch(() => {});
}

async function clockOutAndContinue() {
  if (clockOutBusy.value) return;
  clockOutBusy.value = true;
  try {
    await indirectStore.clockOutFromTimedown();
    sessionLockStore.dismissWarning();
    reportTimedownDismissed();
    resetActivityTimer();
    goToLogTime();
  } catch (e) {
    console.error('[InactivityWarningModal] clock out failed:', e);
  } finally {
    clockOutBusy.value = false;
  }
}

watch(
  () => sessionLockStore.warningActive,
  async (active) => {
    if (!active) {
      clearTimeout(reshuffleTimer);
      clockOutBusy.value = false;
      return;
    }
    useVideo.value = true;
    if (!isMobile.value && !isClockedIn.value) {
      randomStayPosition();
      scheduleReshuffle();
    }
    await nextTick();
    if (isMobile.value) return;
    const el = videoRef.value;
    if (!el) return;
    try {
      el.muted = true;
      el.loop = true;
      await el.play();
    } catch {
      /* autoplay may be blocked; poster still shows */
    }
  }
);
</script>

<style scoped>
.iw-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: #000;
}

.iw-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.iw-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.iw-clocked-banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 18px;
  background: linear-gradient(90deg, #14532d 0%, #166534 55%, #15803d 100%);
  color: #fff;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  border-bottom: 3px solid #fbbf24;
}

.iw-clocked-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fbbf24;
  box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.35);
  flex-shrink: 0;
}

.iw-clocked-banner-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.iw-clocked-banner-text strong {
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.iw-clocked-banner-text span {
  font-size: 0.9rem;
  opacity: 0.95;
}

.iw-clocked-elapsed {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.95rem;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.25);
}

/* ── Desktop timer ──────────────────────────────────────────────────────────── */
.iw-timer {
  position: absolute;
  bottom: clamp(7rem, 36vh, 18rem);
  left: clamp(25rem, 34vw, 31rem);
  display: flex;
  align-items: center;
  pointer-events: none;
  z-index: 2;
  white-space: nowrap;
}

.iw-timer--long .iw-timer-value {
  min-width: 7ch;
  font-size: clamp(2rem, 4.5vw, 5.5rem);
}

.iw-timer-value {
  color: #fff;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: clamp(2.5rem, 5.5vw, 7rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 0, 0, 0.4);
  min-width: 4.5ch;
  line-height: 1;
}

/* Fixed action stack when clocked in; roaming stay when not */
.iw-actions {
  position: absolute;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.iw-actions:not(.iw-actions--roam) {
  left: 50%;
  bottom: clamp(2.5rem, 10vh, 5rem);
  transform: translateX(-50%);
  width: min(420px, calc(100vw - 32px));
}

.iw-actions--roam {
  transition: left 0.4s ease, top 0.4s ease;
}

.iw-clock-out {
  border: none;
  background: #dc2626;
  color: #fff;
  border-radius: 999px;
  padding: 18px 36px;
  font-size: 1.5rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 6px 24px rgba(220, 38, 38, 0.45);
}
.iw-clock-out:hover:not(:disabled) {
  background: #b91c1c;
}
.iw-clock-out:disabled {
  opacity: 0.7;
  cursor: wait;
}

.iw-stay {
  border: 2px solid rgba(255, 255, 255, 0.55);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border-radius: 999px;
  padding: 16px 36px;
  font-size: 1.75rem;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(8px);
  white-space: nowrap;
}
.iw-stay:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.65);
}
.iw-stay--secondary {
  font-size: 1.15rem;
  padding: 14px 28px;
  white-space: normal;
  text-align: center;
}

/* ── Mobile card overlay ────────────────────────────────────────────────────── */
.iw-mobile-card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px 40px;
  background: rgba(0, 0, 0, 0.52);
  text-align: center;
  gap: 0;
}

.iw-stage--clocked .iw-mobile-card {
  padding-top: 88px;
}

.iw-mobile-shield {
  font-size: 3rem;
  margin-bottom: 12px;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5));
}

.iw-mobile-title {
  color: #fff;
  font-size: 1.55rem;
  font-weight: 800;
  line-height: 1.2;
  margin: 0 0 10px;
  text-shadow: 0 1px 6px rgba(0,0,0,0.7);
}

.iw-mobile-body {
  color: rgba(255, 255, 255, 0.88);
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0 0 24px;
  max-width: 320px;
  text-shadow: 0 1px 4px rgba(0,0,0,0.6);
}

.iw-mobile-countdown {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin-bottom: 32px;
}

.iw-mobile-countdown-label {
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.iw-mobile-countdown-value {
  color: #fff;
  font-size: clamp(2.75rem, 14vw, 5.5rem);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  text-shadow: 0 2px 12px rgba(0,0,0,0.8);
  line-height: 1;
}

.iw-mobile-clock-out {
  width: 100%;
  max-width: 320px;
  padding: 18px 24px;
  margin-bottom: 12px;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 14px;
  font-size: 1.15rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(220, 38, 38, 0.4);
}
.iw-mobile-clock-out:disabled {
  opacity: 0.7;
  cursor: wait;
}

.iw-mobile-stay {
  width: 100%;
  max-width: 320px;
  padding: 18px 24px;
  background: #fff;
  color: #0f172a;
  border: none;
  border-radius: 14px;
  font-size: 1.1rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0,0,0,0.35);
  letter-spacing: 0.01em;
}
.iw-mobile-stay--ghost {
  background: transparent;
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.65);
  box-shadow: none;
}
.iw-mobile-stay:active {
  transform: scale(0.97);
}

/* ── Shared utilities ───────────────────────────────────────────────────────── */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.iw-fade-enter-active,
.iw-fade-leave-active {
  transition: opacity 0.3s ease;
}
.iw-fade-enter-from,
.iw-fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .iw-clocked-banner {
    padding: 10px 14px;
  }
  .iw-clocked-banner-text strong {
    font-size: 0.95rem;
  }
  .iw-clocked-banner-text span {
    font-size: 0.8rem;
  }
}
</style>
