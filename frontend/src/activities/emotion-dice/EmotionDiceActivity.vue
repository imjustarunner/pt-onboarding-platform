<template>
  <div class="edice" :class="{ 'edice--web': layout === 'web', 'edice--reduced': reducedMotion }">
    <header class="edice__header">
      <p class="edice__round">
        Round {{ displayRound }} of {{ maximumRounds }}
        <span v-if="currentTurn" class="edice__turn"> · {{ turnLabel }}'s turn</span>
      </p>
    </header>

    <!-- Ready / waiting to roll -->
    <div v-if="phase === 'ready' || (phase === 'discuss' && !currentEmotionLabel && !rolling)" class="edice__ready">
      <div class="edice__die" :class="{ 'edice__die--spin': rolling && !reducedMotion }" aria-hidden="true">
        <span>?</span>
      </div>
      <p v-if="isMyTurn">When you are ready, roll the die.</p>
      <p v-else>Waiting for {{ turnLabel }} to roll…</p>
      <button
        v-if="isMyTurn"
        type="button"
        class="edice__btn edice__btn--primary"
        :disabled="rolling"
        @click="doRoll"
      >
        {{ rolling ? 'Rolling…' : 'Roll' }}
      </button>
    </div>

    <!-- Discuss after roll -->
    <div v-if="(phase === 'discuss' || phase === 'rounds_complete') && currentEmotionLabel" class="edice__discuss">
      <div
        class="edice__die edice__die--result"
        :class="{ 'edice__die--spin': rolling && !reducedMotion }"
        aria-live="polite"
      >
        <span>{{ currentEmotionLabel }}</span>
      </div>
      <p v-if="!promptSkipped && currentPromptText" class="edice__prompt">{{ currentPromptText }}</p>
      <p v-else-if="promptSkipped" class="edice__prompt edice__muted">Prompt skipped — discuss the emotion in your own way.</p>
      <p v-if="hypothetical" class="edice__muted">Hypothetical mode: talk about the emotion as if it belonged to someone else.</p>

      <div v-if="role === 'client' || isMyTurn || lastRollerRole === role" class="edice__escapes">
        <button type="button" class="edice__btn edice__btn--sm" :disabled="rolling" @click="doReroll">
          Reroll
        </button>
        <button type="button" class="edice__btn edice__btn--sm" @click="skipPrompt">Skip prompt</button>
        <button type="button" class="edice__btn edice__btn--sm" @click="requestLighter">Lighter prompt</button>
        <button type="button" class="edice__btn edice__btn--sm" @click="toggleHypothetical">
          {{ hypothetical ? 'Exit hypothetical' : 'Hypothetical' }}
        </button>
        <button type="button" class="edice__btn edice__btn--sm" @click="askProviderFirst">
          Ask provider first
        </button>
      </div>

      <div class="edice__actions">
        <button
          v-if="phase !== 'rounds_complete' && isMyTurn"
          type="button"
          class="edice__btn edice__btn--primary"
          :disabled="rolling"
          @click="doRoll"
        >
          Roll next
        </button>
        <button
          v-else-if="phase !== 'rounds_complete'"
          type="button"
          class="edice__btn"
          disabled
        >
          Waiting for {{ turnLabel }}…
        </button>
        <button type="button" class="edice__btn edice__btn--primary" @click="finish">
          {{ phase === 'rounds_complete' ? 'Finish & reflect' : 'Done for now' }}
        </button>
      </div>
    </div>

    <div v-if="role === 'provider' && phase === 'ready' && !isMyTurn" class="edice__facilitation">
      <p>Invite curiosity, not diagnosis. Client may reroll, skip, or return anytime.</p>
    </div>

    <p v-if="error" class="edice__error">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import * as counselingApi from '../../services/counselingApi.js';
import manifest from './manifest.js';

const props = defineProps({
  role: { type: String, required: true },
  layout: { type: String, default: 'mobile' },
  sessionId: { type: [String, Number], required: true },
  sharedState: { type: Object, default: () => ({}) },
  reducedMotion: { type: Boolean, default: false }
});

const emit = defineEmits(['update:sharedState', 'complete', 'skip', 'runtime-updated']);

const rolling = ref(false);
const error = ref('');
const promptSkipped = ref(false);
const hypothetical = ref(false);

const maximumRounds = computed(() => Number(props.sharedState?.maximumRounds) || 3);
const phase = computed(() => props.sharedState?.phase || 'ready');
const currentTurn = computed(() => props.sharedState?.currentTurn || 'client');
const currentEmotionLabel = computed(
  () => props.sharedState?.currentEmotionLabel || null
);
const currentPromptText = computed(() => props.sharedState?.currentPromptText || null);
const lastRollerRole = computed(() => props.sharedState?.lastRollerRole || null);

const displayRound = computed(() => {
  const completed = Array.isArray(props.sharedState?.rollHistory)
    ? props.sharedState.rollHistory.length
    : Number(props.sharedState?.round) || 0;
  if (phase.value === 'discuss' || phase.value === 'rounds_complete') {
    return Math.max(1, completed);
  }
  return Math.min(maximumRounds.value, completed + 1);
});

const isMyTurn = computed(() => currentTurn.value === props.role);
const turnLabel = computed(() => (currentTurn.value === 'provider' ? 'Provider' : 'Client'));

watch(
  () => props.sharedState?.currentEmotionId,
  () => {
    promptSkipped.value = false;
  }
);

async function doRoll() {
  error.value = '';
  rolling.value = true;
  try {
    // Brief local animation window; result is always from the server.
    if (!props.reducedMotion) {
      await new Promise((r) => setTimeout(r, 600));
    }
    const data = await counselingApi.rollActivity(props.sessionId, { action: 'roll' });
    if (data?.runtime) emit('runtime-updated', data.runtime);
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Roll failed';
  } finally {
    rolling.value = false;
  }
}

async function doReroll() {
  error.value = '';
  rolling.value = true;
  try {
    if (!props.reducedMotion) {
      await new Promise((r) => setTimeout(r, 500));
    }
    const data = await counselingApi.rollActivity(props.sessionId, { action: 'reroll' });
    if (data?.runtime) emit('runtime-updated', data.runtime);
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Reroll failed';
  } finally {
    rolling.value = false;
  }
}

function skipPrompt() {
  promptSkipped.value = true;
  emit('update:sharedState', {
    ...props.sharedState,
    promptSkipped: true
  });
}

async function requestLighter() {
  error.value = '';
  rolling.value = true;
  try {
    const data = await counselingApi.rollActivity(props.sessionId, {
      action: 'reroll',
      lighterPrompt: true
    });
    if (data?.runtime) emit('runtime-updated', data.runtime);
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Could not lighten prompt';
  } finally {
    rolling.value = false;
  }
}

function toggleHypothetical() {
  hypothetical.value = !hypothetical.value;
  emit('update:sharedState', {
    ...props.sharedState,
    hypothetical: hypothetical.value
  });
}

function askProviderFirst() {
  emit('update:sharedState', {
    ...props.sharedState,
    askProviderFirst: true,
    phase: props.sharedState?.phase || 'discuss'
  });
}

function finish() {
  emit('complete', {
    activityId: manifest.id,
    rollHistory: props.sharedState?.rollHistory || [],
    sharedResult: {
      rounds: props.sharedState?.round,
      packId: props.sharedState?.packId
    }
  });
}

defineExpose({ manifest });
</script>

<style scoped>
.edice {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  color: #1a1f2c;
}
.edice__round {
  margin: 0;
  font-size: 0.9rem;
  color: #475569;
  font-weight: 600;
}
.edice__turn {
  font-weight: 500;
}
.edice__die {
  width: 120px;
  height: 120px;
  margin: 0 auto;
  border-radius: 16px;
  border: 2px solid #94a3b8;
  background: linear-gradient(145deg, #f8fafc, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  font-weight: 700;
  text-align: center;
  padding: 0.5rem;
  box-sizing: border-box;
}
.edice__die--result {
  border-color: #2563eb;
  background: linear-gradient(145deg, #eff6ff, #dbeafe);
  min-width: 140px;
  width: auto;
  max-width: 100%;
  padding: 0.75rem 1rem;
}
.edice__die--spin {
  animation: edice-spin 0.6s ease-in-out;
}
.edice--reduced .edice__die--spin {
  animation: edice-fade 0.35s ease;
}
@keyframes edice-spin {
  0% { transform: rotate(0deg) scale(1); }
  40% { transform: rotate(180deg) scale(1.05); }
  100% { transform: rotate(360deg) scale(1); }
}
@keyframes edice-fade {
  from { opacity: 0.4; }
  to { opacity: 1; }
}
.edice__prompt {
  font-size: 1.05rem;
  margin: 0;
  text-align: center;
}
.edice__muted {
  color: #64748b;
  font-size: 0.9rem;
  text-align: center;
}
.edice__ready,
.edice__discuss {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  align-items: stretch;
}
.edice__escapes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.edice__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.edice__btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid #c5cddc;
  background: #f4f6fb;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 0.55rem 0.85rem;
}
.edice__btn--primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.edice__btn--sm {
  min-height: 40px;
  font-size: 0.8rem;
  flex: 1 1 auto;
}
.edice__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.edice__error {
  color: #b91c1c;
  font-size: 0.85rem;
  margin: 0;
}
.edice__facilitation {
  font-size: 0.85rem;
  color: #475569;
}
</style>
