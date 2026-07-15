<template>
  <div class="ec" :class="{ 'ec--web': layout === 'web', 'ec--reduced': reducedMotion }">
    <header class="ec__header">
      <h2 class="ec__title">Emotion Charades</h2>
      <p class="ec__lead">
        Practice expressing and recognizing emotions. Guesses are curiosity, not a score.
      </p>
      <p class="ec__meta">
        Round {{ round }} of {{ maximumRounds }}
        <span v-if="actorRole"> · {{ actorLabel }} acting</span>
      </p>
    </header>

    <div v-if="phase === 'setup'" class="ec__step">
      <template v-if="role === 'provider'">
        <p class="ec__prompt">Who acts first?</p>
        <div class="ec__chips">
          <button
            type="button"
            class="ec__chip"
            :class="{ 'ec__chip--on': firstActor === 'client' }"
            @click="firstActor = 'client'"
          >
            Client
          </button>
          <button
            type="button"
            class="ec__chip"
            :class="{ 'ec__chip--on': firstActor === 'provider' }"
            @click="firstActor = 'provider'"
          >
            Provider
          </button>
        </div>
        <label class="ec__field">
          Rounds
          <select v-model.number="setupRounds">
            <option :value="2">2</option>
            <option :value="3">3</option>
            <option :value="4">4</option>
          </select>
        </label>
        <button type="button" class="ec__btn ec__btn--primary" @click="startGame">Start</button>
      </template>
      <template v-else>
        <p class="ec__prompt">Waiting for the provider to start…</p>
      </template>
    </div>

    <!-- Actor private prompt -->
    <div v-else-if="phase === 'actor_ready' && isActor" class="ec__step">
      <p class="ec__prompt">Your private emotion card</p>
      <div class="ec__emotion-card" aria-live="polite">
        {{ currentEmotionLabel || '…' }}
      </div>
      <p class="ec__hint">Do not say the emotion name out loud.</p>
      <label class="ec__field">
        Expression mode (optional)
        <select v-model="expressionMode" @change="saveMode">
          <option v-for="m in expressionModes" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </label>
      <button type="button" class="ec__btn ec__btn--primary" :disabled="dealing" @click="markReady">
        Ready to act
      </button>
      <button type="button" class="ec__btn" :disabled="dealing" @click="dealEmotion">
        {{ dealing ? 'Dealing…' : currentEmotionLabel ? 'Deal a different emotion' : 'Deal emotion' }}
      </button>
    </div>

    <div v-else-if="phase === 'actor_ready' && !isActor" class="ec__step">
      <p class="ec__prompt">Waiting for {{ actorLabel }} to get ready…</p>
      <p class="ec__hint">You will guess after they start. The emotion stays private until reveal.</p>
    </div>

    <!-- Acting / guessing -->
    <div v-else-if="phase === 'acting'" class="ec__step">
      <template v-if="isActor">
        <p class="ec__prompt">Express: <strong>{{ currentEmotionLabel }}</strong></p>
        <p class="ec__hint">Mode: {{ modeLabel }}</p>
        <button type="button" class="ec__btn" @click="openReveal">Reveal when ready</button>
      </template>
      <template v-else>
        <p class="ec__prompt">{{ actorLabel }} is acting. What emotion do you notice?</p>
        <div class="ec__chips">
          <button
            v-for="e in emotionOptions"
            :key="e.id"
            type="button"
            class="ec__chip"
            :class="{ 'ec__chip--on': guessId === e.id }"
            @click="guessId = e.id"
          >
            {{ e.label }}
          </button>
        </div>
        <button
          type="button"
          class="ec__btn ec__btn--primary"
          :disabled="!guessId"
          @click="submitGuess"
        >
          Submit guess
        </button>
      </template>
    </div>

    <div v-else-if="phase === 'reveal'" class="ec__step">
      <p class="ec__prompt">The emotion was</p>
      <div class="ec__emotion-card">{{ currentEmotionLabel }}</div>
      <p v-if="lastGuessLabel" class="ec__hint">
        Guess: {{ lastGuessLabel }}
        <span v-if="guessMatched"> — you recognized it.</span>
        <span v-else> — that was a close look; what clue helped?</span>
      </p>
      <ul class="ec__talk">
        <li>What clue helped?</li>
        <li>What other emotion could look similar?</li>
      </ul>
      <div class="ec__actions">
        <button
          v-if="round < maximumRounds"
          type="button"
          class="ec__btn ec__btn--primary"
          @click="nextRound"
        >
          Next round
        </button>
        <button type="button" class="ec__btn ec__btn--primary" @click="finish">
          Finish &amp; reflect
        </button>
      </div>
    </div>

    <p v-if="error" class="ec__error">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import * as counselingApi from '../../services/counselingApi.js';
import manifest from './manifest.js';
import { EMOTION_OPTIONS, EXPRESSION_MODES, emotionLabel } from './contentPacks.js';

const props = defineProps({
  role: { type: String, required: true },
  layout: { type: String, default: 'mobile' },
  sessionId: { type: [String, Number], required: true },
  sharedState: { type: Object, default: () => ({}) },
  reducedMotion: { type: Boolean, default: false }
});

const emit = defineEmits(['update:sharedState', 'complete', 'skip', 'runtime-updated']);

const emotionOptions = EMOTION_OPTIONS;
const expressionModes = EXPRESSION_MODES;

const firstActor = ref(props.sharedState?.firstActor || 'client');
const setupRounds = ref(Number(props.sharedState?.maximumRounds) || 3);
const expressionMode = ref(props.sharedState?.expressionMode || 'face');
const guessId = ref('');
const dealing = ref(false);
const error = ref('');

const phase = computed(() => props.sharedState?.phase || 'setup');
const round = computed(() => Number(props.sharedState?.round) || 1);
const maximumRounds = computed(() => Number(props.sharedState?.maximumRounds) || 3);
const actorRole = computed(() => props.sharedState?.actorRole || null);
const currentEmotionLabel = computed(() => props.sharedState?.currentEmotionLabel || null);
const lastGuessLabel = computed(() => props.sharedState?.lastGuessLabel || null);
const guessMatched = computed(() => !!props.sharedState?.guessMatched);

const isActor = computed(() => actorRole.value === props.role);
const actorLabel = computed(() => (actorRole.value === 'provider' ? 'Provider' : 'Client'));
const modeLabel = computed(
  () => expressionModes.find((m) => m.id === (props.sharedState?.expressionMode || expressionMode.value))?.label || ''
);

watch(
  () => props.sharedState?.round,
  () => {
    guessId.value = '';
  }
);

function publish(partial) {
  emit('update:sharedState', { ...props.sharedState, ...partial });
}

function startGame() {
  publish({
    phase: 'actor_ready',
    firstActor: firstActor.value,
    actorRole: firstActor.value,
    maximumRounds: setupRounds.value,
    round: 1,
    currentEmotionId: null,
    currentEmotionLabel: null,
    revealed: false,
    guessHistory: [],
    expressionMode: expressionMode.value
  });
}

async function dealEmotion() {
  error.value = '';
  dealing.value = true;
  try {
    if (!props.reducedMotion) {
      await new Promise((r) => setTimeout(r, 350));
    }
    const data = await counselingApi.rollActivity(props.sessionId, { action: 'deal' });
    if (data?.runtime) emit('runtime-updated', data.runtime);
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Deal failed';
  } finally {
    dealing.value = false;
  }
}

function saveMode() {
  publish({ expressionMode: expressionMode.value });
}

async function markReady() {
  if (!currentEmotionLabel.value) {
    await dealEmotion();
  }
  // Prefer latest shared state after deal; fall back to local expression mode.
  publish({
    phase: 'acting',
    expressionMode: expressionMode.value,
    revealed: false
  });
}

function submitGuess() {
  if (!guessId.value) return;
  const label = emotionLabel(guessId.value);
  const matched = guessId.value === props.sharedState?.currentEmotionId;
  publish({
    phase: 'reveal',
    revealed: true,
    lastGuessId: guessId.value,
    lastGuessLabel: label,
    guessMatched: matched
  });
}

function openReveal() {
  publish({
    phase: 'reveal',
    revealed: true,
    lastGuessId: props.sharedState?.lastGuessId || null,
    lastGuessLabel: props.sharedState?.lastGuessLabel || null,
    guessMatched: props.sharedState?.guessMatched || false
  });
}

function nextRound() {
  const history = Array.isArray(props.sharedState?.guessHistory)
    ? [...props.sharedState.guessHistory]
    : [];
  history.push({
    round: round.value,
    emotionId: props.sharedState?.currentEmotionId,
    guessId: props.sharedState?.lastGuessId,
    matched: !!props.sharedState?.guessMatched,
    at: new Date().toISOString()
  });
  const nextActor = actorRole.value === 'client' ? 'provider' : 'client';
  publish({
    phase: 'actor_ready',
    round: round.value + 1,
    actorRole: nextActor,
    currentEmotionId: null,
    currentEmotionLabel: null,
    revealed: false,
    lastGuessId: null,
    lastGuessLabel: null,
    guessMatched: false,
    guessHistory: history
  });
  guessId.value = '';
}

function finish() {
  emit('complete', {
    activityId: manifest.id,
    rounds: round.value,
    guessHistory: props.sharedState?.guessHistory || []
  });
}

defineExpose({ manifest });
</script>

<style scoped>
.ec {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  color: #1a2433;
}
.ec__title {
  margin: 0;
  font-size: 1.15rem;
}
.ec__lead,
.ec__meta,
.ec__hint {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #4a5a6a;
}
.ec__prompt {
  margin: 0;
  font-size: 1rem;
}
.ec__emotion-card {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: linear-gradient(145deg, #e8eef8, #d5e0f2);
  border: 1px solid #8a9bb5;
  font-size: 1.35rem;
  font-weight: 700;
}
.ec__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.ec__chip {
  min-height: 40px;
  border-radius: 999px;
  border: 1px solid #9aacc0;
  background: #f4f7fb;
  padding: 0.35rem 0.75rem;
  font: inherit;
  cursor: pointer;
}
.ec__chip--on {
  background: #d5e4f7;
  border-color: #3d5a80;
  font-weight: 600;
}
.ec__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.ec__field select {
  border: 1px solid #b7c3d1;
  border-radius: 8px;
  padding: 0.55rem;
  font: inherit;
}
.ec__actions {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.ec__btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid #9aacc0;
  background: #e8eef6;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.ec__btn--primary {
  background: #3d5a80;
  border-color: #3d5a80;
  color: #fff;
}
.ec__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ec__talk {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.9rem;
  color: #3d4f66;
}
.ec__error {
  color: #a33;
  margin: 0;
  font-size: 0.9rem;
}
</style>
