<template>
  <div class="pond" :class="{ 'pond--web': layout === 'web', 'pond--reduced': reducedMotion }">
    <header class="pond__header">
      <h2 class="pond__title">Peaceful Pond</h2>
      <p class="pond__lead">
        You can set a worry down here to make a little space — it is not erased, and you can return to
        it later.
      </p>
    </header>

    <!-- Worry select -->
    <div v-if="phase === 'worry_select'" class="pond__step">
      <p class="pond__prompt">What would you like to set down for a moment?</p>
      <div class="pond__presets">
        <button
          v-for="w in presets"
          :key="w"
          type="button"
          class="pond__chip"
          :class="{ 'pond__chip--on': currentWorry === w }"
          @click="currentWorry = w"
        >
          {{ w }}
        </button>
      </div>
      <label class="pond__custom">
        Or name it in your own words
        <input v-model="customWorry" type="text" maxlength="80" placeholder="Short label (optional)" />
      </label>
      <div class="pond__actions">
        <button
          type="button"
          class="pond__btn pond__btn--primary"
          :disabled="!selectedWorry"
          @click="startBreathing"
        >
          Continue
        </button>
        <button type="button" class="pond__btn pond__btn--ghost" @click="skip">Skip</button>
      </div>
      <p v-if="role === 'provider'" class="pond__hint">Waiting for the client to choose a worry…</p>
    </div>

    <!-- Breathing -->
    <div v-else-if="phase === 'breathing'" class="pond__step pond__breathing">
      <p class="pond__prompt">Pause. Take a slow breath.</p>
      <div
        class="pond__breath-circle"
        :class="{ 'pond__breath-circle--pulse': !reducedMotion }"
        aria-hidden="true"
      />
      <p class="pond__countdown">{{ breathLeft }}s</p>
      <button type="button" class="pond__btn" @click="goPlace">Skip pause</button>
    </div>

    <!-- Tap to place -->
    <div v-else-if="phase === 'place'" class="pond__step">
      <p class="pond__prompt">
        Tap the pond to set “{{ activeWorryLabel }}” down. You are making space — not making it
        disappear.
      </p>
      <div
        ref="pondEl"
        class="pond__surface"
        role="button"
        tabindex="0"
        aria-label="Tap to place your worry on the pond"
        @click="onPondTap"
        @keydown.enter.prevent="placeAtCenter"
      >
        <div class="pond__water" :class="{ 'pond__water--static': reducedMotion }" />
        <div
          v-for="(item, idx) in worriesPlaced"
          :key="`${item.label}-${idx}`"
          class="pond__stone"
          :style="stoneStyle(item)"
        >
          <span class="pond__stone-label">{{ item.label }}</span>
        </div>
        <div
          v-if="ripple"
          class="pond__ripple"
          :class="{ 'pond__ripple--fade': reducedMotion }"
          :style="{ left: ripple.x + 'px', top: ripple.y + 'px' }"
        />
      </div>
    </div>

    <!-- Settled / reflection -->
    <div v-else-if="phase === 'settle' || phase === 'reflect'" class="pond__step">
      <div class="pond__surface pond__surface--calm">
        <div class="pond__water" :class="{ 'pond__water--static': reducedMotion }" />
        <div
          v-for="(item, idx) in worriesPlaced"
          :key="`s-${item.label}-${idx}`"
          class="pond__stone pond__stone--settled"
          :style="stoneStyle(item)"
        >
          <span class="pond__stone-label">{{ item.label }}</span>
        </div>
      </div>
      <p class="pond__prompt">
        That worry can rest here for now. You can return to it later if you want.
      </p>
      <label class="pond__custom">
        Optional reflection
        <textarea
          v-model="reflectionDraft"
          rows="2"
          maxlength="500"
          placeholder="What feels a little lighter, if anything?"
        />
      </label>
      <div class="pond__calm">
        <label for="pond-calm">How calm do you feel now? (optional)</label>
        <input id="pond-calm" v-model.number="calmRating" type="range" min="1" max="5" step="1" />
        <span>{{ calmRating }}</span>
        <p class="pond__hint">There is no wrong rating — this is just a check-in.</p>
      </div>
      <div class="pond__actions">
        <button type="button" class="pond__btn" @click="repeatAnother">Set another down</button>
        <button type="button" class="pond__btn pond__btn--primary" @click="finish">
          Return to conversation
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import manifest from './manifest.js';

const props = defineProps({
  role: { type: String, required: true },
  layout: { type: String, default: 'mobile' },
  sessionId: { type: [String, Number], default: null },
  sharedState: { type: Object, default: () => ({}) },
  reducedMotion: { type: Boolean, default: false }
});

const emit = defineEmits(['update:sharedState', 'complete', 'skip']);

const presets = [
  'Something on my mind',
  'A hard conversation',
  'Feeling behind',
  'Worry about someone',
  'Body tension'
];

const phase = ref(props.sharedState?.phase || 'worry_select');
const currentWorry = ref(props.sharedState?.currentWorry || '');
const customWorry = ref('');
const reflectionDraft = ref(props.sharedState?.reflection || '');
const calmRating = ref(props.sharedState?.calmRating || 3);
const breathLeft = ref(Number(props.sharedState?.breathingSeconds) || 4);
const pondEl = ref(null);
const ripple = ref(null);
let breathTimer = null;
let rippleTimer = null;

const worriesPlaced = computed(() =>
  Array.isArray(props.sharedState?.worriesPlaced) ? props.sharedState.worriesPlaced : []
);

const selectedWorry = computed(() => (customWorry.value.trim() || currentWorry.value || '').trim());
const activeWorryLabel = computed(
  () => props.sharedState?.currentWorry || selectedWorry.value || 'this worry'
);

watch(
  () => props.sharedState?.phase,
  (p) => {
    if (p) phase.value = p;
  }
);

watch(
  () => props.sharedState?.worriesPlaced,
  () => {
    /* reactive via computed */
  },
  { deep: true }
);

function publish(partial) {
  const next = { ...props.sharedState, ...partial };
  emit('update:sharedState', next);
}

function startBreathing() {
  if (props.role === 'provider' && !selectedWorry.value && !props.sharedState?.currentWorry) {
    return;
  }
  const label = selectedWorry.value || props.sharedState?.currentWorry;
  if (!label && props.role === 'client') return;
  breathLeft.value = Number(props.sharedState?.breathingSeconds) || 4;
  phase.value = 'breathing';
  publish({
    phase: 'breathing',
    currentWorry: label,
    breathingSeconds: breathLeft.value
  });
  clearInterval(breathTimer);
  breathTimer = setInterval(() => {
    breathLeft.value -= 1;
    if (breathLeft.value <= 0) {
      clearInterval(breathTimer);
      goPlace();
    }
  }, 1000);
}

function goPlace() {
  clearInterval(breathTimer);
  phase.value = 'place';
  publish({ phase: 'place', currentWorry: activeWorryLabel.value });
}

function stoneStyle(item) {
  return {
    left: `${item.xPercent ?? 50}%`,
    top: `${item.yPercent ?? 50}%`
  };
}

function onPondTap(event) {
  if (props.role === 'provider' && !props.sharedState?.currentWorry) {
    /* provider can place for facilitation demo, but prefer client */
  }
  const el = pondEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  placeAt(x, y, rect.width, rect.height);
}

function placeAtCenter() {
  const el = pondEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  placeAt(rect.width / 2, rect.height / 2, rect.width, rect.height);
}

function placeAt(x, y, w, h) {
  const label = activeWorryLabel.value;
  const xPercent = Math.round((x / w) * 100);
  const yPercent = Math.round((y / h) * 100);
  ripple.value = { x, y };
  clearTimeout(rippleTimer);
  rippleTimer = setTimeout(() => {
    ripple.value = null;
  }, props.reducedMotion ? 200 : 900);

  const nextPlaced = [
    ...worriesPlaced.value,
    {
      label,
      xPercent,
      yPercent,
      placedAt: new Date().toISOString()
    }
  ];

  const settleDelay = props.reducedMotion ? 250 : 800;
  publish({
    phase: 'place',
    worriesPlaced: nextPlaced,
    currentWorry: label
  });
  setTimeout(() => {
    phase.value = 'reflect';
    publish({
      phase: 'reflect',
      worriesPlaced: nextPlaced,
      currentWorry: label
    });
  }, settleDelay);
}

function repeatAnother() {
  currentWorry.value = '';
  customWorry.value = '';
  phase.value = 'worry_select';
  publish({
    phase: 'worry_select',
    currentWorry: null,
    reflection: reflectionDraft.value.trim() || props.sharedState?.reflection || null,
    calmRating: calmRating.value
  });
}

function skip() {
  publish({ phase: 'reflect', skipped: true, skippedAt: new Date().toISOString() });
  emit('skip');
  phase.value = 'reflect';
}

function finish() {
  const reflection = reflectionDraft.value.trim() || null;
  publish({
    phase: 'complete',
    reflection,
    calmRating: calmRating.value,
    reflectionShared: !!reflection
  });
  emit('complete', {
    activityId: manifest.id,
    worriesPlaced: worriesPlaced.value,
    calmRating: calmRating.value,
    reflection
  });
}

onUnmounted(() => {
  clearInterval(breathTimer);
  clearTimeout(rippleTimer);
});

defineExpose({ manifest });
</script>

<style scoped>
.pond {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  color: #1a2e28;
}
.pond__title {
  margin: 0;
  font-size: 1.15rem;
}
.pond__lead {
  margin: 0.35rem 0 0;
  font-size: 0.9rem;
  color: #3d5a50;
}
.pond__prompt {
  margin: 0;
  font-size: 1rem;
}
.pond__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.pond__chip {
  min-height: 40px;
  border-radius: 999px;
  border: 1px solid #9cb5aa;
  background: #f3faf6;
  padding: 0.35rem 0.75rem;
  font: inherit;
  cursor: pointer;
}
.pond__chip--on {
  background: #c5e4d4;
  border-color: #2f6b52;
  font-weight: 600;
}
.pond__custom {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
}
.pond__custom input,
.pond__custom textarea {
  border: 1px solid #b7c9bf;
  border-radius: 8px;
  padding: 0.55rem;
  font: inherit;
}
.pond__actions {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.pond__btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid #9cb5aa;
  background: #e8f3ec;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.pond__btn--primary {
  background: #2f6b52;
  border-color: #2f6b52;
  color: #fff;
}
.pond__btn--ghost {
  background: transparent;
}
.pond__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pond__hint {
  font-size: 0.8rem;
  color: #5a7268;
  margin: 0;
}
.pond__breathing {
  align-items: center;
  text-align: center;
}
.pond__breath-circle {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #d4efe3, #7eb89a);
  margin: 0.5rem auto;
}
.pond__breath-circle--pulse {
  animation: pond-breathe 4s ease-in-out infinite;
}
@keyframes pond-breathe {
  0%,
  100% {
    transform: scale(0.92);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.08);
    opacity: 1;
  }
}
.pond__countdown {
  font-weight: 700;
  font-size: 1.25rem;
  margin: 0;
}
.pond__surface {
  position: relative;
  height: 220px;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid #8fb5a3;
}
.pond__surface--calm {
  cursor: default;
  height: 160px;
}
.pond__water {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.35), transparent 50%),
    linear-gradient(180deg, #6fae96 0%, #3d7a66 55%, #2c5d4d 100%);
}
.pond__water:not(.pond__water--static) {
  animation: pond-shimmer 8s ease-in-out infinite;
}
@keyframes pond-shimmer {
  0%,
  100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.06);
  }
}
.pond__stone {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 52px;
  height: 40px;
  border-radius: 50% 50% 45% 45%;
  background: linear-gradient(145deg, #8a9099, #5c636d);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  z-index: 2;
}
.pond__stone--settled {
  opacity: 0.92;
}
.pond__stone-label {
  font-size: 0.55rem;
  color: #f8fafc;
  text-align: center;
  padding: 0 4px;
  line-height: 1.1;
  max-width: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pond__ripple {
  position: absolute;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  border: 2px solid rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  pointer-events: none;
  z-index: 3;
  animation: pond-ripple 0.85s ease-out forwards;
}
.pond__ripple--fade {
  animation: pond-fade 0.25s ease forwards;
}
@keyframes pond-ripple {
  to {
    width: 100px;
    height: 100px;
    margin: -50px 0 0 -50px;
    opacity: 0;
  }
}
@keyframes pond-fade {
  to {
    opacity: 0;
  }
}
.pond__calm {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.pond--reduced .pond__breath-circle--pulse {
  animation: none;
}
</style>
