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

          <!-- Live MM:SS sits immediately after the baked-in "Timing out in" (top-left on all tenants) -->
          <div class="iw-timer" aria-live="polite" aria-atomic="true">
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
import { resetActivityTimer, reportTimedownDismissed } from '../utils/activityTracker.js';
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
  reportTimedownDismissed();
  resetActivityTimer();
}

watch(
  () => sessionLockStore.warningActive,
  async (active) => {
    if (!active) return;
    useVideo.value = true;
    await nextTick();
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

/* All tenants: clock + "Timing out in" sit in the upper-left of the timedown art */
.iw-timer {
  position: absolute;
  top: clamp(1.15rem, 3.2vh, 2.4rem);
  left: clamp(10.25rem, 17.5vw, 15.5rem);
  display: flex;
  align-items: center;
  pointer-events: none;
  z-index: 2;
}

.iw-timer-value {
  color: #fff;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: clamp(1.15rem, 2.2vw, 1.55rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55), 0 0 12px rgba(0, 0, 0, 0.35);
  min-width: 4.5ch;
  line-height: 1;
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
    top: clamp(0.85rem, 2.5vh, 1.5rem);
    left: clamp(8.75rem, 46vw, 13rem);
  }
  .iw-stay {
    top: auto;
    bottom: calc(20px + 48px);
    right: 16px;
    left: 16px;
  }
}
</style>
