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
          <img
            v-else
            class="iw-media"
            :src="posterUrl"
            alt=""
          />

          <!-- Covers baked-in "Timing out in" and supplies live countdown -->
          <div class="iw-timer" aria-live="polite">
            <span class="iw-timer-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </span>
            <span class="iw-timer-label">Timing out in</span>
            <span class="iw-timer-value">{{ clock }}</span>
          </div>

          <h2 id="iw-title" class="sr-only">We're protecting your information</h2>
          <p id="iw-desc" class="sr-only">
            Your session has been inactive. Timing out in {{ clock }}.
          </p>

          <button type="button" class="iw-stay" @click="stayLoggedIn">
            I'm still here — stay logged in
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { useSessionLockStore } from '../store/sessionLock.js';
import { resetActivityTimer } from '../utils/activityTracker.js';
import { useAgencyStore } from '../store/agency.js';
import {
  resolveSessionTimeoutTenantKey,
  getTimedownVideoUrl,
  getTimedownPosterUrl,
  formatCountdownClock
} from '../utils/sessionTimeoutBranding.js';
import { getCurrentPortalSlugFromHostCache, getCurrentPortalSlugFromPath } from '../utils/loginRedirect.js';

const sessionLockStore = useSessionLockStore();
const agencyStore = useAgencyStore();

const useVideo = ref(true);
const videoRef = ref(null);

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
const clock = computed(() => formatCountdownClock(sessionLockStore.warningSecondsLeft));

function onVideoError() {
  useVideo.value = false;
}

function stayLoggedIn() {
  sessionLockStore.dismissWarning();
  resetActivityTimer();
}

watch(
  () => sessionLockStore.warningActive,
  async (active) => {
    if (!active) return;
    useVideo.value = true;
    await nextTick();
    try {
      await videoRef.value?.play?.();
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

/* Bottom-left cluster matching the Timedown artboards */
.iw-timer {
  position: absolute;
  left: clamp(24px, 6vw, 72px);
  bottom: clamp(28px, 8vh, 72px);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  color: #fff;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  pointer-events: none;
  z-index: 2;
}

.iw-timer-icon {
  display: grid;
  place-items: center;
  opacity: 0.95;
}

.iw-timer-label {
  font-size: clamp(0.95rem, 1.6vw, 1.15rem);
  font-weight: 500;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.iw-timer-value {
  font-size: clamp(1.15rem, 2.2vw, 1.55rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  min-width: 4.2ch;
}

.iw-stay {
  position: absolute;
  right: clamp(16px, 3vw, 32px);
  top: clamp(16px, 3vw, 32px);
  z-index: 3;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(6px);
}
.iw-stay:hover {
  background: rgba(0, 0, 0, 0.55);
}

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
  .iw-timer {
    left: 16px;
    right: 16px;
    bottom: 20px;
    justify-content: flex-start;
  }
  .iw-stay {
    top: auto;
    bottom: calc(20px + 56px + 12px);
    right: 16px;
    left: 16px;
  }
}
</style>
