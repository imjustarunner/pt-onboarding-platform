<template>
  <div class="cq" :class="{ 'cq--web': layout === 'web', 'cq--reduced': reducedMotion }">
    <header class="cq__header">
      <h2 class="cq__title">Coping Quest</h2>
      <p class="cq__lead">
        Choices have context. Nothing is permanently labeled good or bad — discuss what might help
        here.
      </p>
      <p class="cq__meta">Progress {{ progress }} / {{ maxProgress }}</p>
    </header>

    <div v-if="phase === 'setup'" class="cq__step">
      <template v-if="role === 'provider'">
        <p class="cq__prompt">Choose a scenario pack</p>
        <div class="cq__chips">
          <button
            v-for="p in packList"
            :key="p.id"
            type="button"
            class="cq__chip"
            :class="{ 'cq__chip--on': packId === p.id }"
            @click="selectPack(p.id)"
          >
            {{ p.label }}
          </button>
        </div>
        <button type="button" class="cq__btn cq__btn--primary" :disabled="!packId" @click="startQuest">
          Start
        </button>
      </template>
      <template v-else>
        <p class="cq__prompt">Waiting for the provider to choose a scenario…</p>
      </template>
    </div>

    <div v-else-if="phase === 'choose'" class="cq__step">
      <div class="cq__scene" aria-hidden="true">
        <div class="cq__path">
          <span
            class="cq__character"
            :class="{ 'cq__character--move': !reducedMotion }"
            :style="{ left: progressPct }"
          >●</span>
          <div class="cq__bridge" />
          <span class="cq__goal">Goal</span>
        </div>
      </div>
      <p class="cq__situation">{{ currentScenarioText }}</p>
      <p class="cq__prompt">Which coping idea do you want to try or examine?</p>
      <div class="cq__cards" :class="{ 'cq__cards--web': layout === 'web' }">
        <button
          v-for="card in copingCards"
          :key="card.id"
          type="button"
          class="cq__card"
          :class="{ 'cq__card--on': selectedCardId === card.id }"
          @click="selectedCardId = card.id"
        >
          {{ card.label }}
        </button>
      </div>
      <div class="cq__actions">
        <button
          type="button"
          class="cq__btn cq__btn--primary"
          :disabled="!selectedCardId"
          @click="revealConsequence"
        >
          See likely short-term effect
        </button>
        <button type="button" class="cq__btn" @click="finish">Done for now</button>
      </div>
    </div>

    <div v-else-if="phase === 'discuss'" class="cq__step">
      <p class="cq__situation">{{ currentScenarioText }}</p>
      <p class="cq__picked"><strong>{{ selectedCardLabel }}</strong></p>
      <p class="cq__consequence">{{ consequenceText }}</p>
      <ul class="cq__talk">
        <li>Why might this help?</li>
        <li>When might it not help?</li>
        <li>What could be combined with it?</li>
      </ul>
      <div v-if="role === 'provider'" class="cq__marks">
        <p class="cq__prompt">Provider mark (optional)</p>
        <div class="cq__chips">
          <button
            v-for="m in contextMarks"
            :key="m"
            type="button"
            class="cq__chip"
            :class="{ 'cq__chip--on': contextMark === m }"
            @click="setMark(m)"
          >
            {{ markLabel(m) }}
          </button>
        </div>
      </div>
      <div class="cq__actions">
        <button type="button" class="cq__btn cq__btn--primary" @click="advance">
          {{ progress + 1 >= maxProgress ? 'Open coping plan' : 'Next situation' }}
        </button>
        <button type="button" class="cq__btn" @click="backToChoose">Pick a different card</button>
      </div>
    </div>

    <div v-else-if="phase === 'plan'" class="cq__step">
      <p class="cq__prompt">Personal coping plan (optional)</p>
      <label class="cq__field">
        Three tools to try
        <textarea v-model="planTools" rows="2" maxlength="300" placeholder="e.g. breathe, walk, ask for help" />
      </label>
      <label class="cq__field">
        One person to contact
        <input v-model="planContact" type="text" maxlength="80" />
      </label>
      <label class="cq__field">
        Reminder statement
        <input v-model="planReminder" type="text" maxlength="120" placeholder="I can take one small step." />
      </label>
      <button type="button" class="cq__btn cq__btn--primary" @click="finish">
        Save plan &amp; reflect
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import manifest from './manifest.js';
import { SCENARIO_PACKS, COPING_CARDS, CONTEXT_MARKS, cardById } from './contentPacks.js';

const props = defineProps({
  role: { type: String, required: true },
  layout: { type: String, default: 'mobile' },
  sessionId: { type: [String, Number], default: null },
  sharedState: { type: Object, default: () => ({}) },
  reducedMotion: { type: Boolean, default: false }
});

const emit = defineEmits(['update:sharedState', 'complete', 'skip']);

const packList = Object.values(SCENARIO_PACKS);
const copingCards = COPING_CARDS;
const contextMarks = CONTEXT_MARKS;
const maxProgress = 3;

const selectedCardId = ref(props.sharedState?.selectedCardId || '');
const contextMark = ref(props.sharedState?.contextMark || '');
const planTools = ref(props.sharedState?.plan?.tools || '');
const planContact = ref(props.sharedState?.plan?.contact || '');
const planReminder = ref(props.sharedState?.plan?.reminder || '');

const phase = computed(() => props.sharedState?.phase || 'setup');
const packId = computed(() => props.sharedState?.packId || null);
const progress = computed(() => Number(props.sharedState?.progress) || 0);
const currentScenarioText = computed(() => props.sharedState?.currentScenarioText || '');
const consequenceText = computed(() => props.sharedState?.consequenceText || '');
const selectedCardLabel = computed(
  () => cardById(props.sharedState?.selectedCardId)?.label || selectedCardId.value
);
const progressPct = computed(() => `${Math.min(92, (progress.value / maxProgress) * 85 + 5)}%`);

watch(
  () => props.sharedState?.selectedCardId,
  (id) => {
    if (id) selectedCardId.value = id;
  }
);

function publish(partial) {
  emit('update:sharedState', { ...props.sharedState, ...partial });
}

function selectPack(id) {
  publish({ packId: id, phase: 'setup' });
}

function pickScenario(pack, index, excludeId) {
  const packData = SCENARIO_PACKS[pack] || SCENARIO_PACKS.stress;
  const list = packData.scenarios;
  const candidates = excludeId ? list.filter((s) => s.id !== excludeId) : list;
  const pool = candidates.length ? candidates : list;
  return pool[index % pool.length];
}

function startQuest() {
  if (!packId.value) return;
  const scenario = pickScenario(packId.value, 0);
  publish({
    phase: 'choose',
    packId: packId.value,
    progress: 0,
    currentScenarioId: scenario.id,
    currentScenarioText: scenario.text,
    selectedCardId: null,
    consequenceText: null,
    contextMark: null,
    choiceHistory: []
  });
}

function revealConsequence() {
  if (!selectedCardId.value) return;
  const card = cardById(selectedCardId.value);
  if (!card) return;
  publish({
    phase: 'discuss',
    selectedCardId: card.id,
    consequenceText: card.shortTerm,
    contextMark: contextMark.value || null
  });
}

function setMark(m) {
  contextMark.value = m;
  publish({ contextMark: m });
}

function markLabel(m) {
  return String(m).replace(/_/g, ' ');
}

function backToChoose() {
  publish({
    phase: 'choose',
    selectedCardId: null,
    consequenceText: null
  });
  selectedCardId.value = '';
}

function advance() {
  const history = Array.isArray(props.sharedState?.choiceHistory)
    ? [...props.sharedState.choiceHistory]
    : [];
  history.push({
    scenarioId: props.sharedState?.currentScenarioId,
    cardId: props.sharedState?.selectedCardId,
    contextMark: props.sharedState?.contextMark || null,
    at: new Date().toISOString()
  });
  const nextProgress = progress.value + 1;
  if (nextProgress >= maxProgress) {
    publish({
      phase: 'plan',
      progress: nextProgress,
      choiceHistory: history,
      selectedCardId: null,
      consequenceText: null
    });
    return;
  }
  const scenario = pickScenario(packId.value, nextProgress, props.sharedState?.currentScenarioId);
  publish({
    phase: 'choose',
    progress: nextProgress,
    choiceHistory: history,
    currentScenarioId: scenario.id,
    currentScenarioText: scenario.text,
    selectedCardId: null,
    consequenceText: null,
    contextMark: null
  });
  selectedCardId.value = '';
  contextMark.value = '';
}

function finish() {
  const plan = {
    tools: planTools.value.trim() || null,
    contact: planContact.value.trim() || null,
    reminder: planReminder.value.trim() || null
  };
  publish({ phase: 'complete', plan });
  emit('complete', {
    activityId: manifest.id,
    choiceHistory: props.sharedState?.choiceHistory || [],
    plan
  });
}

defineExpose({ manifest });
</script>

<style scoped>
.cq {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  color: #1a2a22;
}
.cq__title {
  margin: 0;
  font-size: 1.15rem;
}
.cq__lead,
.cq__meta,
.cq__hint {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #4a6358;
}
.cq__prompt {
  margin: 0;
  font-size: 1rem;
}
.cq__situation {
  margin: 0;
  font-weight: 600;
  line-height: 1.35;
}
.cq__consequence {
  margin: 0;
  padding: 0.65rem 0.75rem;
  background: #eef6f1;
  border-radius: 10px;
  border: 1px solid #9cb5aa;
}
.cq__talk {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.9rem;
  color: #3d5a50;
}
.cq__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.cq__chip {
  min-height: 40px;
  border-radius: 999px;
  border: 1px solid #9cb5aa;
  background: #f3faf6;
  padding: 0.35rem 0.75rem;
  font: inherit;
  cursor: pointer;
}
.cq__chip--on {
  background: #c5e4d4;
  border-color: #2f6b52;
  font-weight: 600;
}
.cq__cards {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}
.cq__cards--web {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  overflow: visible;
}
.cq__card {
  flex: 0 0 auto;
  min-width: 120px;
  min-height: 64px;
  border-radius: 12px;
  border: 1px solid #9cb5aa;
  background: #f8fcf9;
  padding: 0.55rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.cq__card--on {
  background: #d5efe3;
  border-color: #2f6b52;
}
.cq__scene {
  height: 56px;
  position: relative;
}
.cq__path {
  position: relative;
  height: 100%;
}
.cq__bridge {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 8px;
  margin-top: -4px;
  border-radius: 4px;
  background: linear-gradient(90deg, #8fb5a3, #2f6b52);
}
.cq__character {
  position: absolute;
  top: 8px;
  transform: translateX(-50%);
  color: #2f6b52;
  font-size: 1.25rem;
  z-index: 1;
}
.cq__goal {
  position: absolute;
  right: 0;
  top: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #2f6b52;
}
.cq__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.cq__field input,
.cq__field textarea {
  border: 1px solid #b7c9bf;
  border-radius: 8px;
  padding: 0.55rem;
  font: inherit;
}
.cq__actions {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.cq__btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid #9cb5aa;
  background: #e8f3ec;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.cq__btn--primary {
  background: #2f6b52;
  border-color: #2f6b52;
  color: #fff;
}
.cq__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.cq__picked {
  margin: 0;
}
</style>
