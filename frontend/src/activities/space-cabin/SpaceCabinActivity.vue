<template>
  <div
    class="scabin"
    :class="[
      `scabin--${layout}`,
      `scabin--profile-${effectiveProfile}`,
      `scabin--mood-${sceneMood}`,
      { 'scabin--reduced': reduceFx, 'scabin--paused': alienPaused }
    ]"
  >
    <!-- Immersive cabin scene (CSS/SVG; richer on web) -->
    <div class="scabin__scene" aria-hidden="true">
      <div class="scabin__stars" :class="{ 'scabin__stars--static': reduceFx }" />
      <div class="scabin__planet" :class="{ 'scabin__planet--static': reduceFx }" />
      <div class="scabin__cabin">
        <div class="scabin__window">
          <svg class="scabin__alien" viewBox="0 0 120 140" role="img">
            <ellipse cx="60" cy="48" rx="28" ry="32" class="scabin__alien-head" />
            <ellipse cx="48" cy="46" rx="8" ry="12" class="scabin__alien-eye" />
            <ellipse cx="72" cy="46" rx="8" ry="12" class="scabin__alien-eye" />
            <circle cx="48" cy="48" r="3" class="scabin__alien-pupil" />
            <circle cx="72" cy="48" r="3" class="scabin__alien-pupil" />
            <path d="M48 62 Q60 70 72 62" class="scabin__alien-smile" fill="none" />
            <path d="M40 78 Q60 95 80 78 L75 130 Q60 138 45 130 Z" class="scabin__alien-body" />
            <ellipse
              cx="60"
              cy="100"
              rx="36"
              ry="8"
              class="scabin__holo"
              :class="{ 'scabin__holo--pulse': !reduceFx }"
            />
          </svg>
        </div>
        <div class="scabin__table" />
      </div>
      <p v-if="layout === 'web' && !reduceFx" class="scabin__atmosphere">Space Cabin</p>
    </div>

    <header class="scabin__chrome">
      <div>
        <h2 class="scabin__title">Space Cabin Conversation</h2>
        <p v-if="missionTitle" class="scabin__mission">{{ missionTitle }}</p>
      </div>
      <div class="scabin__chrome-actions">
        <button
          type="button"
          class="scabin__btn scabin__btn--sm"
          :aria-pressed="captionsOn"
          @click="toggleCaptions"
        >
          {{ captionsOn ? 'Captions on' : 'Captions' }}
        </button>
        <button
          v-if="role === 'client'"
          type="button"
          class="scabin__btn scabin__btn--sm"
          @click="requestPause"
        >
          Request pause
        </button>
      </div>
    </header>

    <p v-if="alienPaused" class="scabin__banner" role="status">Scene paused — conversation can continue offline from the story.</p>
    <p v-if="clientPauseRequested && role === 'provider'" class="scabin__banner" role="status">
      Client requested a pause.
    </p>

    <!-- Mission select -->
    <section v-if="phase === 'mission_select'" class="scabin__panel">
      <p class="scabin__lead">
        Choose a short mission. The cabin scene supports practice — there is no score and no right
        answer.
      </p>
      <div class="scabin__missions">
        <button
          v-for="m in missions"
          :key="m.id"
          type="button"
          class="scabin__mission-card"
          :class="{ 'scabin__mission-card--on': selectedMissionId === m.id }"
          :disabled="role === 'client'"
          @click="selectedMissionId = m.id"
        >
          <strong>{{ m.title }}</strong>
          <span>{{ m.summary }}</span>
        </button>
      </div>

      <div v-if="role === 'provider'" class="scabin__setup-row">
        <label>
          Scene profile
          <select v-model="selectedProfileId">
            <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </label>
        <label>
          Scene mood
          <select v-model="selectedMoodId">
            <option v-for="mood in moods" :key="mood.id" :value="mood.id">{{ mood.label }}</option>
          </select>
        </label>
        <label>
          Difficulty
          <select v-model="selectedDifficulty">
            <option value="gentle">Gentle</option>
            <option value="standard">Standard</option>
          </select>
        </label>
      </div>

      <div class="scabin__actions">
        <button
          v-if="role === 'provider'"
          type="button"
          class="scabin__btn scabin__btn--primary"
          :disabled="!selectedMissionId"
          @click="startMission"
        >
          Enter cabin
        </button>
        <p v-else class="scabin__hint">Waiting for your provider to choose a mission…</p>
        <button type="button" class="scabin__btn scabin__btn--ghost" @click="skipActivity">Skip</button>
      </div>
    </section>

    <!-- Dialogue / scene -->
    <section v-else-if="phase === 'dialogue' || phase === 'discuss'" class="scabin__panel scabin__panel--dialogue">
      <div class="scabin__dialogue" aria-live="polite">
        <p class="scabin__speaker">{{ speakerLabel }}</p>
        <p class="scabin__line">{{ currentLine }}</p>
        <p v-if="captionsOn && currentCaptions" class="scabin__captions">{{ currentCaptions }}</p>
        <p v-if="discussionPrompt" class="scabin__discuss">{{ discussionPrompt }}</p>
      </div>

      <div v-if="!alienPaused" class="scabin__options">
        <button
          v-for="opt in visibleOptions"
          :key="opt.id"
          type="button"
          class="scabin__btn"
          :class="{ 'scabin__btn--escape': opt.clientEscape }"
          @click="chooseOption(opt)"
        >
          {{ opt.label }}
        </button>
      </div>
      <p v-else class="scabin__hint">Alien paused. Use provider controls to resume or skip.</p>

      <div v-if="role === 'provider'" class="scabin__provider">
        <h3 class="scabin__provider-title">Provider controls</h3>
        <div class="scabin__provider-actions">
          <button type="button" class="scabin__btn scabin__btn--sm" @click="toggleAlienPause">
            {{ alienPaused ? 'Resume alien' : 'Pause alien' }}
          </button>
          <button type="button" class="scabin__btn scabin__btn--sm" @click="repeatLine">Repeat line</button>
          <button type="button" class="scabin__btn scabin__btn--sm" @click="showDiscussion">
            Discussion prompt
          </button>
          <button type="button" class="scabin__btn scabin__btn--sm" @click="skipToClosing">Skip scene</button>
          <button type="button" class="scabin__btn scabin__btn--sm" @click="calmerMood">Calmer scene</button>
          <button
            type="button"
            class="scabin__btn scabin__btn--sm"
            @click="toggleDifficulty"
          >
            Difficulty: {{ difficulty }}
          </button>
        </div>
        <label class="scabin__branch">
          Jump to branch
          <select :value="nodeId" @change="onBranchJump">
            <option v-for="id in branchIds" :key="id" :value="id">{{ id }}</option>
          </select>
        </label>
        <p class="scabin__hint">Keep discussion optional. No diagnostic framing.</p>
      </div>
    </section>

    <!-- Debrief -->
    <section v-else-if="phase === 'debrief'" class="scabin__panel">
      <h3 class="scabin__subtitle">Optional debrief</h3>
      <ul class="scabin__debrief">
        <li v-for="(prompt, idx) in debriefPrompts" :key="idx">{{ prompt }}</li>
      </ul>
      <label class="scabin__note">
        Optional note (you choose what to share later)
        <textarea
          v-model="reflectionDraft"
          rows="2"
          maxlength="500"
          placeholder="What stood out? (optional)"
        />
      </label>
      <div class="scabin__actions">
        <button type="button" class="scabin__btn scabin__btn--primary" @click="finish">
          Finish &amp; reflect
        </button>
        <button type="button" class="scabin__btn scabin__btn--ghost" @click="skipActivity">
          Return without saving
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import {
  MISSIONS,
  DEBRIEF_PROMPTS,
  getMission,
  getScript,
  getNode
} from './missions.js';
import {
  PERFORMANCE_PROFILES,
  SCENE_MOODS,
  defaultProfileForLayout,
  resolveEffectiveProfile
} from './performanceProfiles.js';
import manifest from './manifest.js';

const props = defineProps({
  role: { type: String, required: true },
  layout: { type: String, default: 'mobile' },
  sessionId: { type: [String, Number], default: null },
  sharedState: { type: Object, default: () => ({}) },
  reducedMotion: { type: Boolean, default: false }
});

const emit = defineEmits(['update:sharedState', 'complete', 'skip']);

const missions = MISSIONS;
const profiles = PERFORMANCE_PROFILES;
const moods = SCENE_MOODS;
const debriefPrompts = DEBRIEF_PROMPTS;

const selectedMissionId = ref(props.sharedState?.missionId || 'first-contact');
const selectedProfileId = ref(
  props.sharedState?.performanceProfile || defaultProfileForLayout(props.layout)
);
const selectedMoodId = ref(props.sharedState?.sceneMood || 'curious');
const selectedDifficulty = ref(props.sharedState?.difficulty || 'gentle');
const reflectionDraft = ref(props.sharedState?.reflection || '');

const phase = computed(() => props.sharedState?.phase || 'mission_select');
const missionId = computed(() => props.sharedState?.missionId || selectedMissionId.value);
const nodeId = computed(() => props.sharedState?.nodeId || null);
const alienPaused = computed(() => !!props.sharedState?.alienPaused);
const captionsOn = computed(() => !!props.sharedState?.captionsOn);
const clientPauseRequested = computed(() => !!props.sharedState?.clientPauseRequested);
const discussionPrompt = computed(() => props.sharedState?.discussionPrompt || null);
const difficulty = computed(() => props.sharedState?.difficulty || selectedDifficulty.value);
const sceneMood = computed(() => props.sharedState?.sceneMood || selectedMoodId.value || 'curious');

const effectiveProfile = computed(() =>
  resolveEffectiveProfile({
    profileId: props.sharedState?.performanceProfile || selectedProfileId.value,
    reducedMotion: props.reducedMotion,
    layout: props.layout
  })
);

const reduceFx = computed(
  () =>
    props.reducedMotion ||
    ['low_bandwidth', 'reduced_motion', 'mobile'].includes(effectiveProfile.value) ||
    (effectiveProfile.value === 'balanced' && props.layout === 'mobile')
);

const missionTitle = computed(() => {
  if (phase.value === 'mission_select') return '';
  return getMission(missionId.value).title;
});

const currentNode = computed(() => {
  if (!props.sharedState?.missionId || !props.sharedState?.nodeId) return null;
  return getNode(props.sharedState.missionId, props.sharedState.nodeId);
});

const currentLine = computed(() => {
  if (props.sharedState?.overrideLine) return props.sharedState.overrideLine;
  return currentNode.value?.line || '';
});

const currentCaptions = computed(
  () => currentNode.value?.captions || currentNode.value?.line || ''
);

const speakerLabel = computed(() => {
  const s = currentNode.value?.speaker;
  if (s === 'alien') return 'Zev';
  if (s === 'system') return 'Cabin';
  return 'Narrator';
});

const visibleOptions = computed(() => {
  const opts = Array.isArray(currentNode.value?.options) ? currentNode.value.options : [];
  if (difficulty.value === 'gentle') {
    return opts.filter((o) => !o.advanced);
  }
  return opts;
});

const branchIds = computed(() => {
  const script = getScript(missionId.value);
  return Object.keys(script.nodes || {});
});

watch(
  () => props.sharedState?.missionId,
  (id) => {
    if (id) selectedMissionId.value = id;
  }
);

watch(
  () => props.sharedState?.performanceProfile,
  (id) => {
    if (id) selectedProfileId.value = id;
  }
);

watch(
  () => props.sharedState?.sceneMood,
  (id) => {
    if (id) selectedMoodId.value = id;
  }
);

watch(
  () => props.sharedState?.difficulty,
  (d) => {
    if (d) selectedDifficulty.value = d;
  }
);

watch(
  () => props.sharedState?.reflection,
  (r) => {
    if (typeof r === 'string') reflectionDraft.value = r;
  }
);

function publish(partial) {
  emit('update:sharedState', {
    ...props.sharedState,
    activityId: manifest.id,
    ...partial
  });
}

function startMission() {
  if (props.role !== 'provider') return;
  const mission = getMission(selectedMissionId.value);
  const script = getScript(mission.id);
  const startId = script.start;
  const node = script.nodes[startId];
  publish({
    phase: 'dialogue',
    missionId: mission.id,
    nodeId: startId,
    performanceProfile: selectedProfileId.value,
    sceneMood: selectedMoodId.value || mission.defaultMood,
    difficulty: selectedDifficulty.value,
    alienPaused: false,
    clientPauseRequested: false,
    discussionPrompt: node.discussionPrompt || null,
    overrideLine: null,
    branchPath: [startId],
    dialogueHistory: [
      { nodeId: startId, speaker: node.speaker, line: node.line, at: new Date().toISOString() }
    ],
    paused: false
  });
}

function chooseOption(opt) {
  if (!opt?.next) return;
  if (alienPaused.value && props.role === 'client') return;
  goToNode(opt.next, { selectedResponseId: opt.id });
}

function goToNode(nextId, extra = {}) {
  const mission = missionId.value;
  const node = getNode(mission, nextId);
  const path = Array.isArray(props.sharedState?.branchPath)
    ? [...props.sharedState.branchPath, nextId]
    : [nextId];
  const history = Array.isArray(props.sharedState?.dialogueHistory)
    ? [...props.sharedState.dialogueHistory]
    : [];
  history.push({
    nodeId: nextId,
    speaker: node.speaker,
    line: node.line,
    at: new Date().toISOString(),
    ...extra
  });

  if (node.debrief || nextId === 'debrief') {
    publish({
      phase: 'debrief',
      nodeId: nextId,
      discussionPrompt: null,
      overrideLine: null,
      branchPath: path,
      dialogueHistory: history,
      clientPauseRequested: false,
      ...extra
    });
    return;
  }

  const nextPhase = node.discussionPrompt ? 'discuss' : 'dialogue';
  publish({
    phase: nextPhase,
    nodeId: nextId,
    discussionPrompt: node.discussionPrompt || null,
    overrideLine: null,
    branchPath: path,
    dialogueHistory: history,
    clientPauseRequested: false,
    ...extra
  });
}

function toggleCaptions() {
  publish({ captionsOn: !captionsOn.value });
}

function requestPause() {
  publish({ clientPauseRequested: true, alienPaused: true });
}

function toggleAlienPause() {
  if (props.role !== 'provider') return;
  publish({
    alienPaused: !alienPaused.value,
    clientPauseRequested: alienPaused.value ? false : props.sharedState?.clientPauseRequested
  });
}

function repeatLine() {
  if (props.role !== 'provider') return;
  publish({ overrideLine: currentNode.value?.line || currentLine.value });
}

function showDiscussion() {
  if (props.role !== 'provider') return;
  const prompt =
    discussionPrompt.value ||
    DEBRIEF_PROMPTS[0] ||
    'What feels important to talk about right now?';
  publish({ phase: 'discuss', discussionPrompt: prompt });
}

function skipToClosing() {
  if (props.role !== 'provider') return;
  goToNode('closing');
}

function calmerMood() {
  if (props.role !== 'provider') return;
  publish({ sceneMood: 'calm', performanceProfile: 'balanced' });
}

function toggleDifficulty() {
  if (props.role !== 'provider') return;
  const next = difficulty.value === 'gentle' ? 'standard' : 'gentle';
  publish({ difficulty: next });
}

function onBranchJump(event) {
  if (props.role !== 'provider') return;
  const id = event.target.value;
  if (id) goToNode(id);
}

function finish() {
  publish({
    phase: 'debrief',
    reflection: reflectionDraft.value.trim() || props.sharedState?.reflection || ''
  });
  emit('complete', {
    activityId: manifest.id,
    missionId: missionId.value,
    branchPath: props.sharedState?.branchPath || [],
    performanceProfile: effectiveProfile.value,
    sceneMood: sceneMood.value,
    reflection: reflectionDraft.value.trim() || null
  });
}

function skipActivity() {
  emit('skip');
  emit('complete', { activityId: manifest.id, skipped: true });
}
</script>

<style scoped>
.scabin {
  --sc-bg: #0b1220;
  --sc-panel: rgba(12, 22, 40, 0.88);
  --sc-text: #e8eef7;
  --sc-muted: #9aabc2;
  --sc-accent: #7ec8e3;
  --sc-line: rgba(255, 255, 255, 0.12);
  position: relative;
  color: var(--sc-text);
  border-radius: 12px;
  overflow: hidden;
  min-height: 320px;
  background: var(--sc-bg);
  font-family: 'Segoe UI', 'Trebuchet MS', sans-serif;
}

.scabin--mood-curious {
  --sc-accent: #7ec8e3;
}
.scabin--mood-calm {
  --sc-accent: #8fbf9f;
}
.scabin--mood-warm {
  --sc-accent: #e8b86d;
}
.scabin--mood-tense {
  --sc-accent: #c9897a;
}

.scabin__scene {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 120%, #1a2a44 0%, var(--sc-bg) 55%);
}

.scabin__stars {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1px 1px at 10% 20%, #fff 50%, transparent 51%),
    radial-gradient(1px 1px at 30% 60%, #cde 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 70% 30%, #fff 50%, transparent 51%),
    radial-gradient(1px 1px at 85% 75%, #9cf 50%, transparent 51%),
    radial-gradient(1px 1px at 50% 10%, #fff 50%, transparent 51%);
  opacity: 0.7;
  animation: scabin-twinkle 6s ease-in-out infinite alternate;
}

.scabin__stars--static,
.scabin--reduced .scabin__stars {
  animation: none;
  opacity: 0.45;
}

.scabin__planet {
  position: absolute;
  right: 8%;
  top: 12%;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #8eb6ff, #2a4a8a 55%, #152238);
  box-shadow: 0 0 24px rgba(100, 160, 255, 0.35);
  animation: scabin-drift 14s ease-in-out infinite alternate;
}

.scabin__planet--static,
.scabin--reduced .scabin__planet,
.scabin--profile-low_bandwidth .scabin__planet {
  animation: none;
  box-shadow: none;
}

.scabin--profile-mobile .scabin__planet {
  width: 48px;
  height: 48px;
  opacity: 0.7;
}

.scabin--profile-low_bandwidth .scabin__stars {
  background-image: none;
  background: #121a2a;
}

.scabin__cabin {
  position: absolute;
  left: 50%;
  bottom: 18%;
  transform: translateX(-50%);
  width: min(280px, 70%);
}

.scabin--web .scabin__cabin {
  width: min(360px, 50%);
  bottom: 22%;
}

.scabin__window {
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-radius: 16px 16px 8px 8px;
  background: linear-gradient(180deg, rgba(20, 40, 70, 0.5), rgba(8, 14, 28, 0.7));
  padding: 8px 8px 0;
}

.scabin__alien {
  display: block;
  width: 100%;
  height: auto;
  max-height: 140px;
}

.scabin--mobile .scabin__alien {
  max-height: 100px;
}

.scabin__alien-head,
.scabin__alien-body {
  fill: #9fd6a8;
}
.scabin__alien-eye {
  fill: #e8fff0;
}
.scabin__alien-pupil {
  fill: #1a3324;
}
.scabin__alien-smile {
  stroke: #1a3324;
  stroke-width: 2;
}
.scabin__holo {
  fill: var(--sc-accent);
  opacity: 0.35;
}
.scabin__holo--pulse {
  animation: scabin-pulse 2.4s ease-in-out infinite;
}

.scabin__table {
  height: 14px;
  margin-top: -4px;
  border-radius: 0 0 10px 10px;
  background: linear-gradient(90deg, #2a3548, #3d4d66, #2a3548);
}

.scabin__atmosphere {
  position: absolute;
  left: 16px;
  bottom: 12px;
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
}

.scabin__chrome,
.scabin__panel,
.scabin__banner {
  position: relative;
  z-index: 1;
}

.scabin__chrome {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px 0;
}

.scabin__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
}

.scabin__mission {
  margin: 2px 0 0;
  font-size: 0.85rem;
  color: var(--sc-accent);
}

.scabin__chrome-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.scabin__banner {
  margin: 8px 14px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(232, 184, 109, 0.15);
  border: 1px solid rgba(232, 184, 109, 0.35);
  font-size: 0.85rem;
}

.scabin__panel {
  margin: 12px 14px 14px;
  padding: 14px;
  border-radius: 12px;
  background: var(--sc-panel);
  border: 1px solid var(--sc-line);
  backdrop-filter: blur(6px);
}

.scabin--profile-low_bandwidth .scabin__panel {
  backdrop-filter: none;
  background: #121a2a;
}

.scabin__lead,
.scabin__hint {
  margin: 0 0 10px;
  color: #b7c4d8;
  font-size: 0.9rem;
}

.scabin__missions {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr;
}

.scabin--web .scabin__missions {
  grid-template-columns: 1fr 1fr;
}

.scabin__mission-card {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--sc-line);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  cursor: pointer;
}

.scabin__mission-card span {
  font-size: 0.8rem;
  color: #9aabc2;
}

.scabin__mission-card--on {
  border-color: var(--sc-accent);
  box-shadow: inset 0 0 0 1px var(--sc-accent);
}

.scabin__mission-card:disabled {
  cursor: default;
  opacity: 0.85;
}

.scabin__setup-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0;
}

.scabin__setup-row label,
.scabin__branch,
.scabin__note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
  color: #b7c4d8;
}

.scabin__setup-row select,
.scabin__branch select,
.scabin__note textarea {
  border-radius: 8px;
  border: 1px solid var(--sc-line);
  background: #0d1626;
  color: var(--sc-text);
  padding: 6px 8px;
}

.scabin__actions,
.scabin__options,
.scabin__provider-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.scabin__btn {
  border-radius: 8px;
  border: 1px solid var(--sc-line);
  background: rgba(255, 255, 255, 0.06);
  color: var(--sc-text);
  padding: 8px 12px;
  font-size: 0.88rem;
  cursor: pointer;
}

.scabin__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scabin__btn--primary {
  background: var(--sc-accent);
  color: #0b1220;
  border-color: transparent;
  font-weight: 600;
}

.scabin__btn--ghost {
  background: transparent;
}

.scabin__btn--sm {
  padding: 5px 8px;
  font-size: 0.78rem;
}

.scabin__btn--escape {
  border-style: dashed;
  color: #c5d4e8;
}

.scabin__speaker {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sc-accent);
}

.scabin__line {
  margin: 6px 0 0;
  font-size: 1.02rem;
  line-height: 1.45;
}

.scabin__captions {
  margin: 8px 0 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.35);
  font-size: 0.85rem;
  color: #d7e3f4;
}

.scabin__discuss {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-left: 3px solid var(--sc-accent);
  background: rgba(126, 200, 227, 0.08);
  font-size: 0.9rem;
}

.scabin__provider {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--sc-line);
}

.scabin__provider-title,
.scabin__subtitle {
  margin: 0 0 8px;
  font-size: 0.92rem;
}

.scabin__debrief {
  margin: 0 0 12px;
  padding-left: 18px;
  color: #c5d2e4;
  font-size: 0.9rem;
}

.scabin__note {
  width: 100%;
}

.scabin__note textarea {
  width: 100%;
  resize: vertical;
  min-height: 56px;
}

.scabin--paused .scabin__alien {
  opacity: 0.55;
  filter: grayscale(0.35);
}

@keyframes scabin-twinkle {
  from {
    opacity: 0.55;
  }
  to {
    opacity: 0.85;
  }
}

@keyframes scabin-drift {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(8px);
  }
}

@keyframes scabin-pulse {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scabin__stars,
  .scabin__planet,
  .scabin__holo--pulse {
    animation: none !important;
  }
}
</style>
