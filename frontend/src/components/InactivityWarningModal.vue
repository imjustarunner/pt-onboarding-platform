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
        <div class="iw-stage">
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
            <div class="iw-timer" aria-live="polite" aria-atomic="true">
              <span class="iw-timer-value">{{ clock }}</span>
            </div>

            <!-- Randomly-roaming stay button (desktop only). Hidden when privileged
                 status prompt is handling "I'm still here" / Away options. -->
            <button
              v-if="!suppressActions"
              type="button"
              class="iw-stay"
              :style="stayBtnStyle"
              @click="stayLoggedIn"
            >
              I'm still here — stay logged in
            </button>
          </template>

          <!-- ── Mobile: shared background + text card ────────────────────── -->
          <template v-else>
            <img class="iw-media" :src="mobileBgUrl" alt="" />

            <div class="iw-mobile-card">
              <div class="iw-mobile-shield" aria-hidden="true">🔒</div>
              <h2 id="iw-title" class="iw-mobile-title">We're Protecting Your Information</h2>
              <p id="iw-desc" class="iw-mobile-body">
                Your session has been inactive for a while. Hang tight — we'll keep your information secure.
              </p>
              <div class="iw-mobile-countdown" aria-live="polite" aria-atomic="true">
                <span class="iw-mobile-countdown-label">Timing out in</span>
                <span class="iw-mobile-countdown-value">{{ clock }}</span>
              </div>
              <button
                v-if="!suppressActions"
                type="button"
                class="iw-mobile-stay"
                @click="stayLoggedIn"
              >
                I'm still here — stay logged in
              </button>
            </div>
          </template>

          <!-- Screen-reader fallbacks (desktop only needs these, mobile has visible text) -->
          <template v-if="!isMobile">
            <h2 id="iw-title" class="sr-only">We're protecting your information</h2>
            <p id="iw-desc" class="sr-only">
              Your session has been inactive. Timing out in {{ clock }}.
            </p>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useSessionLockStore } from '../store/sessionLock.js';
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

defineProps({
  /** When true, hide stay/logout buttons (privileged StatusPromptModal owns actions). */
  suppressActions: { type: Boolean, default: false }
});

const sessionLockStore = useSessionLockStore();
const agencyStore = useAgencyStore();

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

watch(
  () => sessionLockStore.warningActive,
  async (active) => {
    if (!active) {
      clearTimeout(reshuffleTimer);
      return;
    }
    useVideo.value = true;
    if (!isMobile.value) {
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

/* ── Desktop stay button (randomly placed) ──────────────────────────────────── */
.iw-stay {
  position: absolute;
  z-index: 3;
  transition: left 0.4s ease, top 0.4s ease;
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
.iw-stay:hover {
  background: rgba(0, 0, 0, 0.65);
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
  font-size: clamp(3.5rem, 18vw, 5.5rem);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  text-shadow: 0 2px 12px rgba(0,0,0,0.8);
  line-height: 1;
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
</style>
