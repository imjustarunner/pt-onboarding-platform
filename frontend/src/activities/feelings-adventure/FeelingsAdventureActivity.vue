<template>
  <div class="fa" :class="{ 'fa--web': layout === 'web', 'fa--reduced': reducedMotion }">
    <header class="fa__header">
      <h2 class="fa__title">Feelings Adventure</h2>
      <p class="fa__lead">
        Cooperative progress — no winners or losers. Identify feelings and helpful next steps together.
      </p>
      <p class="fa__meta">
        Space {{ clientPos + 1 }} / {{ boardSpaces }}
        <span v-if="currentTurn"> · {{ turnLabel }}'s turn</span>
      </p>
    </header>

    <!-- Pack / token setup -->
    <div v-if="phase === 'setup'" class="fa__step">
      <template v-if="role === 'provider'">
        <p class="fa__prompt">Choose a topic pack</p>
        <div class="fa__chips">
          <button
            v-for="p in packList"
            :key="p.id"
            type="button"
            class="fa__chip"
            :class="{ 'fa__chip--on': packId === p.id }"
            @click="selectPack(p.id)"
          >
            {{ p.label }}
          </button>
        </div>
        <button type="button" class="fa__btn fa__btn--primary" :disabled="!packId" @click="readyForToken">
          Continue
        </button>
      </template>
      <template v-else>
        <p class="fa__prompt">Waiting for the provider to choose a topic pack…</p>
      </template>
    </div>

    <div v-else-if="phase === 'token'" class="fa__step">
      <template v-if="role === 'client'">
        <p class="fa__prompt">Pick your token color</p>
        <div class="fa__chips">
          <button
            v-for="t in tokens"
            :key="t"
            type="button"
            class="fa__chip"
            :class="{ 'fa__chip--on': clientToken === t }"
            @click="clientToken = t"
          >
            {{ t }}
          </button>
        </div>
        <button
          type="button"
          class="fa__btn fa__btn--primary"
          :disabled="!clientToken"
          @click="startBoard"
        >
          Start
        </button>
      </template>
      <template v-else>
        <p class="fa__prompt">Waiting for the client to pick a token…</p>
      </template>
    </div>

    <!-- Board + card -->
    <div v-else-if="phase === 'play' || phase === 'special'" class="fa__play">
      <div class="fa__board" aria-hidden="true">
        <div
          v-for="i in boardSpaces"
          :key="i"
          class="fa__space"
          :class="[
            `fa__space--${spaceType(i - 1)}`,
            { 'fa__space--here': clientPos === i - 1 }
          ]"
        >
          <span v-if="i === 1">Start</span>
          <span v-else-if="i === boardSpaces">Finish</span>
          <span v-else>{{ i }}</span>
          <span
            v-if="clientPos === i - 1"
            class="fa__token"
            :style="{ background: tokenColor }"
          />
        </div>
      </div>

      <div v-if="phase === 'play'" class="fa__card">
        <p v-if="!currentSituationText" class="fa__prompt">
          <template v-if="isMyTurn">Draw a situation card when ready.</template>
          <template v-else>Waiting for {{ turnLabel }} to draw…</template>
        </p>
        <template v-else>
          <p class="fa__situation">{{ currentSituationText }}</p>
          <p class="fa__prompt">What feelings might fit?</p>
          <div class="fa__chips">
            <button
              v-for="f in feelingOptions"
              :key="f"
              type="button"
              class="fa__chip"
              :class="{ 'fa__chip--on': selectedFeelings.includes(f) }"
              @click="toggleFeeling(f)"
            >
              {{ f }}
            </button>
          </div>
          <label class="fa__field">
            Body clue (optional)
            <input v-model="bodyClue" type="text" maxlength="80" placeholder="e.g. tight chest" />
          </label>
          <label class="fa__field">
            Helpful next step (optional)
            <input v-model="nextStep" type="text" maxlength="120" placeholder="One small step" />
          </label>
          <p v-if="role === 'provider'" class="fa__hint">
            Invite curiosity. Participation moves the token — answers are not graded.
          </p>
        </template>

        <div class="fa__actions">
          <button
            v-if="!currentSituationText && isMyTurn"
            type="button"
            class="fa__btn fa__btn--primary"
            :disabled="drawing"
            @click="drawCard"
          >
            {{ drawing ? 'Drawing…' : 'Draw card' }}
          </button>
          <button
            v-if="currentSituationText && (role === 'client' || isMyTurn)"
            type="button"
            class="fa__btn fa__btn--primary"
            :disabled="!selectedFeelings.length"
            @click="answerTogether"
          >
            Answer together &amp; move
          </button>
          <button type="button" class="fa__btn" @click="finish">Done for now</button>
        </div>
      </div>

      <div v-else-if="phase === 'special'" class="fa__card">
        <p class="fa__prompt">{{ specialPrompt }}</p>
        <button type="button" class="fa__btn fa__btn--primary" @click="continueAfterSpecial">
          Continue
        </button>
      </div>
    </div>

    <div v-else-if="phase === 'complete'" class="fa__step">
      <p class="fa__prompt">Nice work exploring together.</p>
      <p class="fa__hint">Situations explored: {{ situationsExplored }}</p>
      <button type="button" class="fa__btn fa__btn--primary" @click="finish">
        Finish &amp; reflect
      </button>
    </div>

    <p v-if="error" class="fa__error">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import * as counselingApi from '../../services/counselingApi.js';
import manifest from './manifest.js';
import {
  PACKS,
  FEELING_OPTIONS,
  BOARD_SPACES,
  spaceType as spaceTypeFn,
  spacePrompt
} from './contentPacks.js';

const props = defineProps({
  role: { type: String, required: true },
  layout: { type: String, default: 'mobile' },
  sessionId: { type: [String, Number], required: true },
  sharedState: { type: Object, default: () => ({}) },
  reducedMotion: { type: Boolean, default: false }
});

const emit = defineEmits(['update:sharedState', 'complete', 'skip', 'runtime-updated']);

const packList = Object.values(PACKS);
const feelingOptions = FEELING_OPTIONS;
const boardSpaces = BOARD_SPACES;
const tokens = ['Teal', 'Coral', 'Indigo', 'Gold'];

const drawing = ref(false);
const error = ref('');
const clientToken = ref(props.sharedState?.clientToken || '');
const selectedFeelings = ref([...(props.sharedState?.selectedFeelings || [])]);
const bodyClue = ref(props.sharedState?.bodyClue || '');
const nextStep = ref(props.sharedState?.nextStep || '');

const phase = computed(() => props.sharedState?.phase || 'setup');
const packId = computed(() => props.sharedState?.packId || null);
const currentTurn = computed(() => props.sharedState?.currentTurn || 'client');
const clientPos = computed(() => Number(props.sharedState?.clientPosition) || 0);
const currentSituationText = computed(() => props.sharedState?.currentSituationText || null);
const specialPrompt = computed(() => props.sharedState?.specialPrompt || '');
const situationsExplored = computed(() =>
  Array.isArray(props.sharedState?.history) ? props.sharedState.history.length : 0
);

const isMyTurn = computed(() => currentTurn.value === props.role);
const turnLabel = computed(() => (currentTurn.value === 'provider' ? 'Provider' : 'Client'));
const tokenColor = computed(() => {
  const map = { Teal: '#2f6b52', Coral: '#c45c4a', Indigo: '#3d4f8c', Gold: '#b8860b' };
  return map[props.sharedState?.clientToken || clientToken.value] || '#2f6b52';
});

watch(
  () => props.sharedState?.currentSituationId,
  () => {
    selectedFeelings.value = [];
    bodyClue.value = '';
    nextStep.value = '';
  }
);

function publish(partial) {
  emit('update:sharedState', { ...props.sharedState, ...partial });
}

function spaceType(i) {
  return spaceTypeFn(i);
}

function selectPack(id) {
  publish({ packId: id, phase: 'setup' });
}

function readyForToken() {
  if (!packId.value) return;
  publish({ phase: 'token', packId: packId.value });
}

function startBoard() {
  if (!clientToken.value) return;
  publish({
    phase: 'play',
    clientToken: clientToken.value,
    clientPosition: 0,
    providerPosition: 0,
    currentTurn: 'client',
    history: [],
    currentSituationId: null,
    currentSituationText: null,
    selectedFeelings: [],
    bodyClue: '',
    nextStep: ''
  });
}

async function drawCard() {
  error.value = '';
  drawing.value = true;
  try {
    if (!props.reducedMotion) {
      await new Promise((r) => setTimeout(r, 400));
    }
    const data = await counselingApi.rollActivity(props.sessionId, { action: 'draw' });
    if (data?.runtime) emit('runtime-updated', data.runtime);
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Draw failed';
  } finally {
    drawing.value = false;
  }
}

function toggleFeeling(f) {
  const set = new Set(selectedFeelings.value);
  if (set.has(f)) set.delete(f);
  else set.add(f);
  selectedFeelings.value = [...set];
}

function movementSpaces() {
  let n = 1;
  if (bodyClue.value.trim()) n = 2;
  if (bodyClue.value.trim() && nextStep.value.trim()) n = 3;
  return n;
}

function answerTogether() {
  if (!selectedFeelings.value.length) return;
  const move = movementSpaces();
  const from = clientPos.value;
  const to = Math.min(BOARD_SPACES - 1, from + move);
  const history = Array.isArray(props.sharedState?.history)
    ? [...props.sharedState.history]
    : [];
  history.push({
    situationId: props.sharedState?.currentSituationId,
    feelings: [...selectedFeelings.value],
    bodyClue: bodyClue.value.trim() || null,
    nextStep: nextStep.value.trim() || null,
    move,
    at: new Date().toISOString()
  });

  const landedType = spaceTypeFn(to);
  const special = spacePrompt(landedType);

  if (to >= BOARD_SPACES - 1) {
    publish({
      phase: 'complete',
      clientPosition: to,
      history,
      selectedFeelings: selectedFeelings.value,
      bodyClue: bodyClue.value,
      nextStep: nextStep.value,
      currentSituationId: null,
      currentSituationText: null
    });
    return;
  }

  if (special && landedType !== 'situation' && landedType !== 'start') {
    publish({
      phase: 'special',
      clientPosition: to,
      history,
      specialPrompt: special,
      specialType: landedType,
      currentSituationId: null,
      currentSituationText: null,
      selectedFeelings: [],
      bodyClue: '',
      nextStep: '',
      currentTurn: currentTurn.value === 'client' ? 'provider' : 'client'
    });
    return;
  }

  publish({
    phase: 'play',
    clientPosition: to,
    history,
    currentSituationId: null,
    currentSituationText: null,
    selectedFeelings: [],
    bodyClue: '',
    nextStep: '',
    currentTurn: currentTurn.value === 'client' ? 'provider' : 'client'
  });
}

function continueAfterSpecial() {
  publish({
    phase: 'play',
    specialPrompt: null,
    specialType: null
  });
}

function finish() {
  emit('complete', {
    activityId: manifest.id,
    situationsExplored: situationsExplored.value,
    clientPosition: clientPos.value,
    history: props.sharedState?.history || []
  });
}

defineExpose({ manifest });
</script>

<style scoped>
.fa {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  color: #1a2433;
}
.fa__title {
  margin: 0;
  font-size: 1.15rem;
}
.fa__lead,
.fa__meta,
.fa__hint {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #4a5a6a;
}
.fa__prompt {
  margin: 0;
  font-size: 1rem;
}
.fa__situation {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.35;
}
.fa__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.fa__chip {
  min-height: 40px;
  border-radius: 999px;
  border: 1px solid #9aacc0;
  background: #f4f7fb;
  padding: 0.35rem 0.75rem;
  font: inherit;
  cursor: pointer;
}
.fa__chip--on {
  background: #d5e4f7;
  border-color: #3d5a80;
  font-weight: 600;
}
.fa__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.fa__field input {
  border: 1px solid #b7c3d1;
  border-radius: 8px;
  padding: 0.55rem;
  font: inherit;
}
.fa__actions {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.fa__btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid #9aacc0;
  background: #e8eef6;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.fa__btn--primary {
  background: #3d5a80;
  border-color: #3d5a80;
  color: #fff;
}
.fa__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.fa__board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.35rem;
}
.fa--web .fa__board {
  grid-template-columns: repeat(6, 1fr);
}
.fa__space {
  position: relative;
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid #c5d0dc;
  background: #f8fafc;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5a6a7a;
}
.fa__space--start,
.fa__space--finish {
  background: #e8f3ec;
  border-color: #2f6b52;
  font-weight: 700;
}
.fa__space--coping {
  background: #eef6ff;
}
.fa__space--reflection {
  background: #f7f0ff;
}
.fa__space--encouragement {
  background: #fff8e8;
}
.fa__space--here {
  box-shadow: inset 0 0 0 2px #3d5a80;
}
.fa__token {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid #fff;
}
.fa__error {
  color: #a33;
  margin: 0;
  font-size: 0.9rem;
}
.fa--reduced .fa__token {
  transition: none;
}
</style>
