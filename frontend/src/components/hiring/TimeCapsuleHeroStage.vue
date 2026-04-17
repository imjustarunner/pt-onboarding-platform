<script setup>
/**
 * Reusable hero: splash art (optionally with printed CTAs + invisible hit-zones), caption, opening/closing videos.
 * New flows: pass `imageSrc`, toggle `embeddedGraphicActions`, listen `@reveal-now` / `@reveal-later`, use exposed
 * `playOpeningIntroForced()` / `playClosingThen()`. Reference: `TimeCapsuleRevealSplashModal.vue`.
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import { TIME_CAPSULE_PUBLIC_ASSETS } from '@/constants/timeCapsulePublicAssets.js';

const props = defineProps({
  personName: { type: String, default: '' },
  /** When the prediction was sealed (server anchor_at) */
  anchorAt: { type: [String, Date, null], default: null },
  /** When the capsule unlocks (reveal_at) */
  revealAt: { type: [String, Date, null], default: null },
  imageSrc: { type: String, default: () => TIME_CAPSULE_PUBLIC_ASSETS.image },
  openingSrc: { type: String, default: () => TIME_CAPSULE_PUBLIC_ASSETS.openingVideo },
  closingSrc: { type: String, default: () => TIME_CAPSULE_PUBLIC_ASSETS.closingVideo },
  /** When true, opening clip auto-plays on mount (e.g. legacy flows). Default: image-only splash first. */
  autoPlayOpening: { type: Boolean, default: false },
  /**
   * Primary splash art includes printed REVEAL NOW / REVEAL LATER buttons — overlay invisible hit targets
   * and emit `reveal-now` / `reveal-later` instead of duplicating HTML buttons elsewhere.
   */
  embeddedGraphicActions: { type: Boolean, default: true },
  /** Disable embedded hit-zones (e.g. while opening video plays). */
  actionsDisabled: { type: Boolean, default: false }
});

const emit = defineEmits(['reveal-now', 'reveal-later', 'opening-ended']);

const openingRef = ref(null);
const closingRef = ref(null);
const openingLayerVisible = ref(false);
const closingLayerVisible = ref(false);

const buriedRangeLabel = computed(() => {
  const fmt = (v) => {
    if (!v) return '';
    try {
      return new Date(v).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return String(v);
    }
  };
  const from = fmt(props.anchorAt);
  const until = fmt(props.revealAt);
  if (from && until) return `Sealed ${from} — opens ${until}`;
  if (from) return `Sealed ${from}`;
  if (until) return `Opens ${until}`;
  return '';
});

const showHitLayer = computed(
  () =>
    props.embeddedGraphicActions &&
    !props.actionsDisabled &&
    !openingLayerVisible.value &&
    !closingLayerVisible.value
);

function finishOpeningAutoplay() {
  openingLayerVisible.value = false;
  emit('opening-ended');
}

async function startAutoplayOpening() {
  await nextTick();
  closingLayerVisible.value = false;
  const el = openingRef.value;
  if (!el) {
    finishOpeningAutoplay();
    return;
  }
  openingLayerVisible.value = true;
  el.currentTime = 0;
  const done = () => {
    el.removeEventListener('ended', done);
    el.removeEventListener('error', done);
    finishOpeningAutoplay();
  };
  el.addEventListener('ended', done, { once: true });
  el.addEventListener('error', done, { once: true });
  try {
    await el.play();
  } catch {
    done();
  }
}

function playOpeningIntroForced() {
  return new Promise((resolve) => {
    nextTick()
      .then(() => {
        closingLayerVisible.value = false;
        const el = openingRef.value;
        if (!el) {
          resolve();
          return;
        }
        openingLayerVisible.value = true;
        el.currentTime = 0;
        const done = () => {
          el.removeEventListener('ended', done);
          el.removeEventListener('error', done);
          openingLayerVisible.value = false;
          resolve();
        };
        el.addEventListener('ended', done, { once: true });
        el.addEventListener('error', done, { once: true });
        el.play().catch(() => done());
      })
      .catch(() => resolve());
  });
}

function playClosingThen(fn) {
  closingLayerVisible.value = true;
  const el = closingRef.value;
  if (!el) {
    fn?.();
    return;
  }
  const done = () => {
    el.removeEventListener('ended', onEnd);
    el.removeEventListener('error', onErr);
    closingLayerVisible.value = false;
    el.pause();
    el.currentTime = 0;
    fn?.();
  };
  const onEnd = () => done();
  const onErr = () => done();
  el.addEventListener('ended', onEnd, { once: true });
  el.addEventListener('error', onErr, { once: true });
  el.currentTime = 0;
  el.play().catch(() => done());
}

defineExpose({ playClosingThen, playOpeningIntroForced, playOpeningIntro: startAutoplayOpening });

onMounted(() => {
  if (props.autoPlayOpening) {
    startAutoplayOpening();
  }
});
</script>

<template>
  <div class="tch-stage" aria-busy="false">
    <div
      class="tch-frame"
      :class="{ 'tch-frame--splash': embeddedGraphicActions, 'tch-frame--legacy': !embeddedGraphicActions }"
    >
      <img class="tch-img" :src="imageSrc" alt="" />

      <!-- Invisible targets over the printed REVEAL NOW / REVEAL LATER artwork (under videos). -->
      <div v-show="showHitLayer" class="tch-cta-layer">
        <button
          type="button"
          class="tch-cta-zone tch-cta-zone--left"
          aria-label="Reveal now"
          :disabled="actionsDisabled"
          @click="emit('reveal-now')"
        />
        <button
          type="button"
          class="tch-cta-zone tch-cta-zone--right"
          aria-label="Reveal later"
          :disabled="actionsDisabled"
          @click="emit('reveal-later')"
        />
      </div>

      <video
        v-show="openingLayerVisible"
        ref="openingRef"
        class="tch-video tch-video--opening"
        playsinline
        preload="auto"
        :src="openingSrc"
      />

      <video
        v-show="closingLayerVisible"
        ref="closingRef"
        class="tch-video tch-video--closing"
        playsinline
        preload="auto"
        :src="closingSrc"
      />

      <!-- Splash: name/dates sit in the lower band under the printed buttons (pointer-events none). -->
      <div
        class="tch-caption"
        :class="{ 'tch-caption--splash': embeddedGraphicActions, 'tch-caption--legacy': !embeddedGraphicActions }"
      >
        <div class="tch-caption-name">{{ personName || 'Applicant' }}</div>
        <div v-if="buriedRangeLabel" class="tch-caption-range">{{ buriedRangeLabel }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tch-stage {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}
.tch-frame {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  background: #0f172a;
}
.tch-frame--legacy {
  aspect-ratio: 4 / 5;
  max-height: min(56vh, 480px);
}
.tch-frame--splash {
  max-height: min(72vh, 720px);
}
.tch-img {
  display: block;
  width: 100%;
  height: auto;
}
.tch-frame--legacy .tch-img {
  height: 100%;
  object-fit: cover;
}
.tch-frame--splash .tch-img {
  object-fit: contain;
}
.tch-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
  z-index: 4;
}
.tch-cta-layer {
  position: absolute;
  left: 3%;
  right: 3%;
  /* Tight band on the printed buttons only — raised + shortened so it doesn’t extend into the dirt below. */
  bottom: 24%;
  height: 8%;
  display: flex;
  gap: 2%;
  z-index: 2;
  pointer-events: auto;
}
.tch-cta-zone {
  flex: 1;
  border: none;
  padding: 0;
  margin: 0;
  background: transparent;
  cursor: pointer;
  border-radius: 10px;
}
.tch-cta-zone:focus-visible {
  outline: 3px solid rgba(255, 255, 255, 0.95);
  outline-offset: 2px;
}
.tch-cta-zone:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.tch-caption {
  position: absolute;
  color: #fff;
  text-align: center;
  pointer-events: none;
  z-index: 3;
}
.tch-caption--legacy {
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 14px 14px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0));
}
.tch-caption--splash {
  left: 0;
  right: 0;
  bottom: 0;
  padding: 6px 12px 8px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.5) 65%, transparent);
}
.tch-caption-name {
  font-weight: 800;
  font-size: clamp(1rem, 2.8vw, 1.2rem);
  letter-spacing: 0.02em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
.tch-caption--splash .tch-caption-name {
  font-size: clamp(0.9rem, 2.4vw, 1.05rem);
}
.tch-caption-range {
  margin-top: 4px;
  font-size: clamp(0.75rem, 2vw, 0.85rem);
  opacity: 0.95;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
.tch-caption--splash .tch-caption-range {
  margin-top: 2px;
  font-size: clamp(0.68rem, 1.8vw, 0.78rem);
}
</style>
