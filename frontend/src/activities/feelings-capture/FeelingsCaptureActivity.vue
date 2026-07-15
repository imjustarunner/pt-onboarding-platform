<template>
  <div
    class="fc"
    :class="{
      'fc--web': layout === 'web',
      'fc--reduced': reducedMotion || staticMode,
      'fc--compare': mode === 'compare_perspectives'
    }"
  >
    <header class="fc__header">
      <h2 class="fc__title">Feelings Capture</h2>
      <p class="fc__lead">
        Situations can hold more than one feeling. Tap any that might fit — there is no single right
        answer.
      </p>
      <p v-if="layout === 'web'" class="fc__mobile-note">
        Best on mobile — large touch targets. This web view stays tap-friendly.
      </p>
    </header>

    <!-- Intro / mode -->
    <div v-if="phase === 'intro'" class="fc__step">
      <p class="fc__prompt">Choose how you want to capture feelings.</p>
      <div class="fc__modes" role="listbox" aria-label="Capture mode">
        <button
          v-for="m in modeList"
          :key="m.id"
          type="button"
          class="fc__mode"
          role="option"
          :aria-selected="mode === m.id"
          :class="{ 'fc__mode--on': mode === m.id }"
          @click="setMode(m.id)"
        >
          <strong>{{ m.label }}</strong>
          <span>{{ m.description }}</span>
        </button>
      </div>
      <div class="fc__prefs">
        <label class="fc__toggle">
          <input type="checkbox" :checked="staticMode" @change="toggleStatic" />
          Static mode (no floating motion)
        </label>
        <label class="fc__toggle">
          <input type="checkbox" :checked="hapticsEnabled" @change="toggleHaptics" />
          Haptic feedback (optional; off by default)
        </label>
      </div>
      <div class="fc__actions">
        <button type="button" class="fc__btn fc__btn--primary" @click="startCapture">
          Start
        </button>
        <button type="button" class="fc__btn fc__btn--ghost" @click="skipActivity">Skip</button>
      </div>
      <p v-if="role === 'provider'" class="fc__hint">
        Invite curiosity about mixed feelings. Avoid framing choices as diagnostic.
      </p>
    </div>

    <!-- Capture -->
    <div v-else-if="phase === 'capture'" class="fc__step">
      <p class="fc__round">Situation {{ round }} of {{ maximumRounds }}</p>
      <p class="fc__situation" aria-live="polite">{{ situationText }}</p>
      <p class="fc__prompt">
        {{ capturePrompt }}
      </p>

      <div
        class="fc__scene"
        :class="{ 'fc__scene--static': staticMode || reducedMotion }"
        role="group"
        aria-label="Emotion characters"
      >
        <button
          v-for="(em, idx) in sceneEmotions"
          :key="em.id"
          type="button"
          class="fc__emotion"
          :class="{
            'fc__emotion--selected': isSelected(em.id),
            'fc__emotion--float': !staticMode && !reducedMotion
          }"
          :style="emotionStyle(em, idx)"
          :aria-pressed="isSelected(em.id)"
          :aria-label="em.label"
          @click="toggleEmotion(em)"
        >
          <span class="fc__emotion-shape" aria-hidden="true">{{ em.shape }}</span>
          <span class="fc__emotion-label">{{ em.label }}</span>
        </button>
      </div>

      <!-- Shared / role buckets -->
      <div v-if="mode === 'compare_perspectives'" class="fc__buckets">
        <div class="fc__bucket">
          <h3>Client</h3>
          <ul>
            <li v-for="s in selectedClient" :key="'c-' + s.id">{{ s.label }}</li>
            <li v-if="!selectedClient.length" class="fc__muted">None yet</li>
          </ul>
        </div>
        <div class="fc__bucket">
          <h3>Provider</h3>
          <ul>
            <li v-for="s in selectedProvider" :key="'p-' + s.id">{{ s.label }}</li>
            <li v-if="!selectedProvider.length" class="fc__muted">None yet</li>
          </ul>
        </div>
      </div>
      <div v-else class="fc__capture-tray" aria-live="polite">
        <h3>{{ mode === 'shared_capture' ? 'Shared captures' : 'Captured' }}</h3>
        <div class="fc__chips">
          <span v-for="s in traySelections" :key="s.id + (s.by || '')" class="fc__chip">
            {{ s.label }}
            <span v-if="s.by && mode === 'shared_capture'" class="fc__chip-by">{{ s.by }}</span>
          </span>
          <span v-if="!traySelections.length" class="fc__muted">Tap emotions above to capture</span>
        </div>
      </div>

      <div class="fc__actions">
        <button
          type="button"
          class="fc__btn fc__btn--primary"
          :disabled="!canAdvanceFromCapture"
          @click="goDiscuss"
        >
          {{ mode === 'compare_perspectives' ? 'Reveal & discuss' : 'Discuss selections' }}
        </button>
        <button type="button" class="fc__btn" @click="skipSituation">Skip situation</button>
      </div>
    </div>

    <!-- Discuss -->
    <div v-else-if="phase === 'discuss'" class="fc__step">
      <p class="fc__situation">{{ situationText }}</p>
      <div v-if="mode === 'compare_perspectives'" class="fc__compare-result">
        <p>
          <strong>In common:</strong>
          <span v-if="commonLabels.length">{{ commonLabels.join(', ') }}</span>
          <span v-else class="fc__muted">None overlapping this round</span>
        </p>
        <p>
          <strong>Only client:</strong>
          <span v-if="clientOnlyLabels.length">{{ clientOnlyLabels.join(', ') }}</span>
          <span v-else class="fc__muted">—</span>
        </p>
        <p>
          <strong>Only provider:</strong>
          <span v-if="providerOnlyLabels.length">{{ providerOnlyLabels.join(', ') }}</span>
          <span v-else class="fc__muted">—</span>
        </p>
      </div>
      <div v-else class="fc__chips fc__chips--discuss">
        <button
          v-for="s in traySelections"
          :key="'d-' + s.id"
          type="button"
          class="fc__chip fc__chip--btn"
          :class="{ 'fc__chip--focus': discussionEmotionId === s.id }"
          @click="focusEmotion(s.id)"
        >
          {{ s.label }}
        </button>
      </div>
      <p class="fc__prompt" aria-live="polite">{{ discussionPrompt }}</p>
      <p class="fc__hint">Talk it through — or skip. Nothing here is scored.</p>
      <div class="fc__actions">
        <button type="button" class="fc__btn fc__btn--primary" @click="nextOrReflect">
          {{ hasMoreRounds ? 'Next situation' : 'Finish & reflect' }}
        </button>
        <button type="button" class="fc__btn" @click="skipSituation">Skip</button>
      </div>
    </div>

    <!-- Reflect -->
    <div v-else-if="phase === 'reflect' || phase === 'complete'" class="fc__step">
      <p class="fc__prompt">{{ reflectionPrompt }}</p>
      <label class="fc__note">
        Optional reflection
        <textarea
          v-model="reflectionDraft"
          rows="2"
          maxlength="500"
          placeholder="What stood out about mixed feelings? (optional)"
        />
      </label>
      <div class="fc__actions">
        <button type="button" class="fc__btn fc__btn--primary" @click="finish">
          Return to conversation
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import manifest from './manifest.js';
import {
  MODES,
  DEFAULT_MODE,
  SITUATIONS,
  DISCUSSION_PROMPTS,
  REFLECTION_PROMPTS,
  emotionsForSituation,
  situationById,
  createInitialSharedState
} from './contentPacks.js';
import { maybeCaptureHaptic } from './haptics.js';

const props = defineProps({
  role: { type: String, required: true },
  layout: { type: String, default: 'mobile' },
  sessionId: { type: [String, Number], default: null },
  sharedState: { type: Object, default: () => ({}) },
  reducedMotion: { type: Boolean, default: false }
});

const emit = defineEmits(['update:sharedState', 'complete', 'skip']);

const reflectionDraft = ref(props.sharedState?.reflection || '');

const modeList = Object.values(MODES);

const phase = computed(() => props.sharedState?.phase || 'intro');
const mode = computed(() => props.sharedState?.mode || DEFAULT_MODE);
const round = computed(() => Number(props.sharedState?.round) || 1);
const maximumRounds = computed(() => Number(props.sharedState?.maximumRounds) || 3);
const staticMode = computed(() => {
  if (props.sharedState?.staticMode !== undefined) return !!props.sharedState.staticMode;
  return mode.value === 'untimed_calm';
});
const hapticsEnabled = computed(() => !!props.sharedState?.hapticsEnabled);
const discussionEmotionId = computed(() => props.sharedState?.discussionEmotionId || null);

const situation = computed(() => {
  const byId = props.sharedState?.situationId
    ? situationById(props.sharedState.situationId)
    : null;
  if (byId) return byId;
  const idx = Number(props.sharedState?.situationIndex) || 0;
  return SITUATIONS[idx % SITUATIONS.length];
});

const situationText = computed(() => situation.value?.text || '');
const sceneEmotions = computed(() => emotionsForSituation(situation.value));

const selectedShared = computed(() =>
  Array.isArray(props.sharedState?.selectedShared) ? props.sharedState.selectedShared : []
);
const selectedClient = computed(() =>
  Array.isArray(props.sharedState?.selectedClient) ? props.sharedState.selectedClient : []
);
const selectedProvider = computed(() =>
  Array.isArray(props.sharedState?.selectedProvider) ? props.sharedState.selectedProvider : []
);

const traySelections = computed(() => {
  if (mode.value === 'compare_perspectives') {
    return [...selectedClient.value, ...selectedProvider.value];
  }
  if (mode.value === 'client_led') {
    return selectedClient.value.length ? selectedClient.value : selectedShared.value;
  }
  return selectedShared.value;
});

const capturePrompt = computed(() => {
  if (mode.value === 'compare_perspectives') {
    return props.role === 'client'
      ? 'Tap emotions you think fit. Your provider selects separately.'
      : 'Tap emotions you notice. The client selects separately.';
  }
  if (mode.value === 'client_led' && props.role === 'provider') {
    return 'Waiting for the client to capture feelings — then you can add gentle follow-ups.';
  }
  return 'Tap one or more emotions that could fit this situation.';
});

const canAdvanceFromCapture = computed(() => {
  if (mode.value === 'compare_perspectives') {
    return selectedClient.value.length > 0 || selectedProvider.value.length > 0;
  }
  if (mode.value === 'client_led') {
    return selectedClient.value.length > 0 || selectedShared.value.length > 0;
  }
  return selectedShared.value.length > 0;
});

const hasMoreRounds = computed(() => round.value < maximumRounds.value);

const commonLabels = computed(() => {
  const c = new Set(selectedClient.value.map((s) => s.id));
  return selectedProvider.value.filter((s) => c.has(s.id)).map((s) => s.label);
});

const clientOnlyLabels = computed(() => {
  const p = new Set(selectedProvider.value.map((s) => s.id));
  return selectedClient.value.filter((s) => !p.has(s.id)).map((s) => s.label);
});

const providerOnlyLabels = computed(() => {
  const c = new Set(selectedClient.value.map((s) => s.id));
  return selectedProvider.value.filter((s) => !c.has(s.id)).map((s) => s.label);
});

const discussionPrompt = computed(() => {
  const prompts = DISCUSSION_PROMPTS;
  const idx =
    (discussionEmotionId.value || traySelections.value[0]?.id || '').length % prompts.length;
  const base = prompts[idx] || prompts[0];
  if (discussionEmotionId.value) {
    const label =
      traySelections.value.find((s) => s.id === discussionEmotionId.value)?.label ||
      discussionEmotionId.value;
    return `About “${label}”: ${base}`;
  }
  return base;
});

const reflectionPrompt = computed(() => {
  const prompts = REFLECTION_PROMPTS;
  return prompts[round.value % prompts.length] || prompts[0];
});

watch(
  () => props.sharedState?.reflection,
  (r) => {
    if (typeof r === 'string' && r !== reflectionDraft.value) reflectionDraft.value = r;
  }
);

function publish(partial) {
  const base =
    props.sharedState && Object.keys(props.sharedState).length
      ? props.sharedState
      : createInitialSharedState();
  emit('update:sharedState', { ...base, ...partial });
}

function ensureDefaults() {
  if (!props.sharedState?.phase) {
    publish(createInitialSharedState());
  }
}

ensureDefaults();

function setMode(id) {
  const nextStatic = id === 'untimed_calm' ? true : staticMode.value;
  publish({ mode: id, staticMode: nextStatic });
}

function toggleStatic(event) {
  publish({ staticMode: !!event.target.checked });
}

function toggleHaptics(event) {
  publish({ hapticsEnabled: !!event.target.checked });
}

function startCapture() {
  const sit = SITUATIONS[0];
  publish({
    phase: 'capture',
    round: 1,
    situationIndex: 0,
    situationId: sit.id,
    selectedShared: [],
    selectedClient: [],
    selectedProvider: [],
    compareRevealed: false,
    discussionEmotionId: null,
    staticMode: mode.value === 'untimed_calm' ? true : staticMode.value,
    hapticsEnabled: hapticsEnabled.value,
    mode: mode.value,
    maximumRounds: maximumRounds.value
  });
}

function emotionStyle(em, idx) {
  const style = {
    '--fc-hue': String(em.hue ?? 200)
  };
  if (!staticMode.value && !props.reducedMotion) {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    style.left = `${12 + col * 28 + (idx % 2) * 4}%`;
    style.top = `${18 + row * 28}%`;
    style.animationDelay = `${(idx % 5) * 0.35}s`;
  }
  return style;
}

function selectionListForRole() {
  if (mode.value === 'compare_perspectives') {
    return props.role === 'provider' ? 'selectedProvider' : 'selectedClient';
  }
  if (mode.value === 'client_led') {
    return props.role === 'provider' ? 'selectedShared' : 'selectedClient';
  }
  return 'selectedShared';
}

function currentList() {
  const key = selectionListForRole();
  return Array.isArray(props.sharedState?.[key]) ? [...props.sharedState[key]] : [];
}

function isSelected(id) {
  if (mode.value === 'compare_perspectives') {
    const list = props.role === 'provider' ? selectedProvider.value : selectedClient.value;
    return list.some((s) => s.id === id);
  }
  if (mode.value === 'client_led' && props.role === 'client') {
    return selectedClient.value.some((s) => s.id === id);
  }
  return (
    selectedShared.value.some((s) => s.id === id) ||
    selectedClient.value.some((s) => s.id === id)
  );
}

function toggleEmotion(em) {
  if (mode.value === 'client_led' && props.role === 'provider' && !selectedClient.value.length) {
    // Provider follow-up after client has started — still allow adding to shared
  }
  const key = selectionListForRole();
  const list = currentList();
  const exists = list.findIndex((s) => s.id === em.id);
  let next;
  if (exists >= 0) {
    next = list.filter((s) => s.id !== em.id);
  } else {
    next = [
      ...list,
      {
        id: em.id,
        label: em.label,
        by: props.role,
        capturedAt: new Date().toISOString()
      }
    ];
    maybeCaptureHaptic(hapticsEnabled.value);
  }
  publish({ [key]: next });
}

function goDiscuss() {
  publish({
    phase: 'discuss',
    compareRevealed: mode.value === 'compare_perspectives',
    discussionEmotionId: traySelections.value[0]?.id || null
  });
}

function focusEmotion(id) {
  publish({ discussionEmotionId: id });
}

function loadSituation(index) {
  const sit = SITUATIONS[index % SITUATIONS.length];
  publish({
    phase: 'capture',
    round: index + 1,
    situationIndex: index,
    situationId: sit.id,
    selectedShared: [],
    selectedClient: [],
    selectedProvider: [],
    compareRevealed: false,
    discussionEmotionId: null
  });
}

function nextOrReflect() {
  if (hasMoreRounds.value) {
    loadSituation(round.value); // round is 1-based; next index = current round
    return;
  }
  publish({ phase: 'reflect' });
}

function skipSituation() {
  if (hasMoreRounds.value) {
    loadSituation(round.value);
    return;
  }
  publish({ phase: 'reflect', skipped: true, skippedAt: new Date().toISOString() });
}

function skipActivity() {
  publish({
    phase: 'reflect',
    skipped: true,
    skippedAt: new Date().toISOString()
  });
  emit('skip');
}

function finish() {
  const reflection = reflectionDraft.value.trim() || null;
  publish({
    phase: 'complete',
    reflection,
    reflectionShared: !!reflection
  });
  emit('complete', {
    activityId: manifest.id,
    mode: mode.value,
    roundsCompleted: round.value,
    reflection
  });
}

defineExpose({ manifest });
</script>

<style scoped>
.fc {
  --fc-ink: #1c2b33;
  --fc-muted: #5a6b74;
  --fc-surface: #e8f2f4;
  --fc-accent: #2a7a86;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  color: var(--fc-ink);
}

.fc__title {
  margin: 0;
  font-size: 1.15rem;
}
.fc__lead {
  margin: 0.35rem 0 0;
  font-size: 0.9rem;
  color: var(--fc-muted);
}
.fc__mobile-note {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  color: var(--fc-accent);
}
.fc__prompt {
  margin: 0;
  font-size: 1rem;
}
.fc__situation {
  margin: 0;
  padding: 0.85rem 1rem;
  background: var(--fc-surface);
  border-radius: 12px;
  font-size: 1.05rem;
  line-height: 1.4;
}
.fc__round {
  margin: 0;
  font-size: 0.85rem;
  color: var(--fc-muted);
}
.fc__hint,
.fc__muted {
  color: var(--fc-muted);
  font-size: 0.85rem;
}
.fc__modes {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.fc__mode {
  text-align: left;
  padding: 0.85rem 1rem;
  min-height: 3.25rem;
  border: 2px solid #c5d5da;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.fc__mode span {
  font-size: 0.85rem;
  color: var(--fc-muted);
}
.fc__mode--on {
  border-color: var(--fc-accent);
  background: #f0fafb;
}
.fc__prefs {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.fc__toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  min-height: 2.75rem;
}
.fc__scene {
  position: relative;
  min-height: 220px;
  padding: 0.5rem;
  background: linear-gradient(165deg, #dceef2 0%, #f5f0e8 55%, #e8efe6 100%);
  border-radius: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  justify-content: center;
  align-content: center;
}
.fc__scene--static .fc__emotion {
  position: static;
}
.fc__emotion {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  min-width: 5.5rem;
  min-height: 5.5rem;
  padding: 0.55rem;
  border: 2px solid hsl(var(--fc-hue, 200) 35% 55%);
  border-radius: 16px;
  background: hsl(var(--fc-hue, 200) 45% 96%);
  color: var(--fc-ink);
  cursor: pointer;
  touch-action: manipulation;
}
.fc__emotion--float {
  position: absolute;
  animation: fc-drift 5.5s ease-in-out infinite alternate;
}
.fc__emotion--selected {
  border-width: 3px;
  box-shadow: 0 0 0 3px hsl(var(--fc-hue, 200) 40% 70% / 0.45);
  transform: scale(1.04);
}
.fc--reduced .fc__emotion--selected {
  transform: none;
}
.fc__emotion-shape {
  font-size: 1.4rem;
  line-height: 1;
}
.fc__emotion-label {
  font-size: 0.85rem;
  font-weight: 600;
}
.fc__capture-tray,
.fc__buckets {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.fc__buckets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.fc__bucket {
  background: var(--fc-surface);
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
}
.fc__bucket h3,
.fc__capture-tray h3 {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
}
.fc__bucket ul {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.9rem;
}
.fc__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}
.fc__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.7rem;
  min-height: 2.5rem;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #c5d5da;
  font-size: 0.85rem;
}
.fc__chip--btn {
  cursor: pointer;
}
.fc__chip--focus {
  border-color: var(--fc-accent);
  background: #e6f5f7;
}
.fc__chip-by {
  font-size: 0.7rem;
  color: var(--fc-muted);
  text-transform: capitalize;
}
.fc__compare-result {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.75rem;
  background: var(--fc-surface);
  border-radius: 12px;
  font-size: 0.95rem;
}
.fc__note {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.fc__note textarea {
  font: inherit;
  padding: 0.65rem;
  border-radius: 10px;
  border: 1px solid #c5d5da;
  resize: vertical;
}
.fc__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.fc__btn {
  min-height: 2.85rem;
  padding: 0.55rem 1rem;
  border-radius: 12px;
  border: 1px solid #b0c4ca;
  background: #fff;
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
}
.fc__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.fc__btn--primary {
  background: var(--fc-accent);
  border-color: var(--fc-accent);
  color: #fff;
}
.fc__btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--fc-muted);
  text-decoration: underline;
}
.fc--web .fc__scene {
  min-height: 260px;
}

@keyframes fc-drift {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fc__emotion--float {
    animation: none;
  }
}
</style>
