<template>
  <div class="ahost" :class="{ 'ahost--provider': role === 'provider' }">
    <div v-if="!runtime || runtime.status === 'INACTIVE'" class="ahost__idle">
      <slot name="idle">
        <p>No activity in progress.</p>
      </slot>
    </div>

    <div v-else-if="runtime.status === 'CLIENT_PROMPT'" class="ahost__prompt">
      <template v-if="role === 'client'">
        <p>
          {{ providerLabel }} would like to start
          <strong>{{ activityDisplayName }}</strong>. You can pause or return to the conversation at
          any time.
        </p>
        <div class="ahost__actions">
          <button type="button" class="ahost__btn ahost__btn--primary" @click="accept">
            Start Activity
          </button>
          <button type="button" class="ahost__btn" @click="decline">Not Right Now</button>
        </div>
      </template>
      <template v-else>
        <p>Waiting for the client to accept <strong>{{ activityDisplayName }}</strong>…</p>
        <div v-if="runtime.activityId === 'emotion-dice'" class="ahost__setup">
          <h4>Setup</h4>
          <label>
            Rounds
            <select v-model.number="setup.maximumRounds" @change="saveSetup">
              <option :value="2">2</option>
              <option :value="3">3</option>
              <option :value="4">4</option>
              <option :value="5">5</option>
            </select>
          </label>
          <label>
            Who rolls first
            <select v-model="setup.whoRollsFirst" @change="saveSetup">
              <option value="client">Client</option>
              <option value="provider">Provider</option>
            </select>
          </label>
          <label>
            Emotion pack
            <select v-model="setup.packId" @change="saveSetup">
              <option value="core-6">Core (Happy, Sad, …)</option>
              <option value="alt-6">Alternate (Proud, Frustrated, …)</option>
            </select>
          </label>
          <label>
            Prompt depth
            <select v-model="setup.promptDepth" @change="saveSetup">
              <option value="light">Light</option>
              <option value="notice">Notice</option>
              <option value="share">Share</option>
              <option value="perspective">Perspective</option>
            </select>
          </label>
        </div>
        <div v-else-if="runtime.activityId === 'feelings-capture'" class="ahost__setup">
          <h4>Setup</h4>
          <label>
            Mode
            <select v-model="setup.captureMode" @change="saveSetup">
              <option value="untimed_calm">Untimed Calm</option>
              <option value="shared_capture">Shared Capture</option>
              <option value="compare_perspectives">Compare Perspectives</option>
              <option value="client_led">Client-Led</option>
            </select>
          </label>
          <label>
            Situations
            <select v-model.number="setup.maximumRounds" @change="saveSetup">
              <option :value="2">2</option>
              <option :value="3">3</option>
              <option :value="4">4</option>
              <option :value="5">5</option>
            </select>
          </label>
          <label>
            <input v-model="setup.staticMode" type="checkbox" @change="saveSetup" />
            Static mode (recommended)
          </label>
          <label>
            <input v-model="setup.hapticsEnabled" type="checkbox" @change="saveSetup" />
            Allow haptic feedback (client may still keep off)
          </label>
          <p class="ahost__tip">Mobile-primary touch matching. Timer stays off by default.</p>
        </div>
        <div v-else-if="runtime.activityId === 'space-cabin-conversation'" class="ahost__setup">
          <h4>Setup</h4>
          <label>
            Mission
            <select v-model="setup.missionId" @change="saveSetup">
              <option value="first-contact">First Contact</option>
              <option value="alien-misunderstanding">Alien Misunderstanding</option>
              <option value="mission-stress">Mission Stress</option>
              <option value="homesick-traveler">Homesick Traveler</option>
              <option value="crew-conflict">Crew Conflict</option>
              <option value="unknown-emotion">Unknown Emotion</option>
            </select>
          </label>
          <label>
            Scene profile
            <select v-model="setup.performanceProfile" @change="saveSetup">
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
              <option value="mobile">Mobile</option>
              <option value="low_bandwidth">Low bandwidth</option>
              <option value="reduced_motion">Reduced motion</option>
            </select>
          </label>
          <label>
            Scene mood
            <select v-model="setup.sceneMood" @change="saveSetup">
              <option value="curious">Curious</option>
              <option value="calm">Calm</option>
              <option value="warm">Warm</option>
              <option value="tense">Focused</option>
            </select>
          </label>
          <label>
            Difficulty
            <select v-model="setup.difficulty" @change="saveSetup">
              <option value="gentle">Gentle</option>
              <option value="standard">Standard</option>
            </select>
          </label>
          <p class="ahost__tip">
            Immersive narrative practice — no scoring. Web uses richer scene detail; mobile stays
            lighter.
          </p>
        </div>
        <button type="button" class="ahost__btn" @click="decline">Cancel</button>
      </template>
    </div>

    <div
      v-else-if="['ACTIVE', 'PAUSED', 'REFLECTING', 'LOADING'].includes(runtime.status)"
      class="ahost__active"
    >
      <header class="ahost__title-row">
        <div>
          <h3>{{ activityDisplayName }}</h3>
          <p v-if="runtime.status === 'PAUSED'" class="ahost__paused">Paused</p>
        </div>
        <div class="ahost__title-actions">
          <button
            v-if="runtime.status === 'ACTIVE'"
            type="button"
            class="ahost__btn ahost__btn--sm"
            @click="pause"
          >
            Pause
          </button>
          <button
            v-else-if="runtime.status === 'PAUSED'"
            type="button"
            class="ahost__btn ahost__btn--sm ahost__btn--primary"
            @click="resume"
          >
            Resume
          </button>
          <button type="button" class="ahost__btn ahost__btn--sm" @click="exit">
            {{ practiceMode ? 'Exit practice' : 'Return to counseling' }}
          </button>
        </div>
      </header>

      <div v-if="runtime.status !== 'REFLECTING'" class="ahost__canvas">
        <component
          :is="activityComponent"
          v-if="activityComponent"
          :role="role"
          :layout="layout"
          :session-id="sessionId"
          :shared-state="effectiveSharedState"
          :reduced-motion="prefersReducedMotion"
          @update:shared-state="onSharedState"
          @complete="onComplete"
          @skip="onSkip"
          @reflect="openReflection"
          @runtime-updated="onChildRuntime"
        />
        <p v-else class="ahost__unsupported">
          This activity is not available in the session host yet.
        </p>
      </div>

      <!-- Reflection dock (shared completion UI) -->
      <div v-if="showReflectionDock" class="ahost__reflect" aria-live="polite">
        <h4>Optional reflection</h4>
        <p class="ahost__reflect-hint">
          You can jot a short note, save it, or return to the conversation without saving.
        </p>
        <textarea
          v-model="reflectionDraft"
          rows="3"
          maxlength="1000"
          placeholder="What stood out? (optional)"
        />
        <div class="ahost__reflect-dest" v-if="reflectionDraft.trim()">
          <label>
            <input v-model="reflectionDest" type="radio" value="shared" />
            Shared session notes
          </label>
          <label v-if="role === 'client'">
            <input v-model="reflectionDest" type="radio" value="client_journal" />
            My journal only
          </label>
          <label v-if="role === 'provider'">
            <input v-model="reflectionDest" type="radio" value="provider_private" />
            Provider private
          </label>
          <label>
            <input v-model="reflectionDest" type="radio" value="activity_reflection" />
            Activity reflection
          </label>
        </div>
        <div class="ahost__actions">
          <button
            type="button"
            class="ahost__btn ahost__btn--primary"
            :disabled="savingReflection"
            @click="saveReflectionAndExit"
          >
            {{
              reflectionDraft.trim()
                ? (practiceMode ? 'Save & exit' : 'Save & return')
                : (practiceMode ? 'Exit practice' : 'Return to conversation')
            }}
          </button>
          <button type="button" class="ahost__btn" :disabled="savingReflection" @click="exitWithoutReflection">
            {{ practiceMode ? 'Exit without saving' : 'Return without saving' }}
          </button>
        </div>
      </div>

      <aside v-if="role === 'provider' && runtime.status !== 'REFLECTING'" class="ahost__provider-panel">
        <h4>Facilitation</h4>
        <p class="ahost__tip">Keep discussion optional. Avoid framing responses as diagnostic.</p>
        <p class="ahost__tip">Client can skip, pause, or return at any time.</p>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, defineAsyncComponent } from 'vue';
import {
  embeddedActivityComponents,
  isEmbeddedActivityImplemented
} from '../../activities/index.js';
import * as counselingApi from '../../services/counselingApi.js';
import { usePrefersReducedMotion } from '../../composables/usePrefersReducedMotion.js';

const props = defineProps({
  sessionId: { type: [String, Number], required: true },
  role: { type: String, required: true },
  runtime: { type: Object, default: null },
  layout: { type: String, default: 'mobile' },
  providerLabel: { type: String, default: 'Your provider' },
  /** Solo Tools preview — no video session; exit returns to caller */
  practiceMode: { type: Boolean, default: false }
});

const emit = defineEmits(['runtime-updated', 'practice-exit']);

const { prefersReducedMotion } = usePrefersReducedMotion();

const asyncComponents = Object.fromEntries(
  Object.entries(embeddedActivityComponents).map(([id, loader]) => [
    id,
    defineAsyncComponent(loader)
  ])
);

const activityComponent = computed(() => {
  const id = props.runtime?.activityId;
  if (!id || !isEmbeddedActivityImplemented(id)) return null;
  return asyncComponents[id] || null;
});

const activityDisplayName = computed(
  () =>
    props.runtime?.sharedState?.activityDisplayName ||
    props.runtime?.activityId ||
    'Activity'
);

/** Prefer live shared state; on resume after pause, fall back to checkpoint if needed. */
const effectiveSharedState = computed(() => {
  const shared = props.runtime?.sharedState || {};
  if (props.runtime?.status === 'PAUSED' || props.runtime?.status === 'ACTIVE') {
    if (props.runtime?.checkpoint && (!shared || Object.keys(shared).length < 2)) {
      return { ...props.runtime.checkpoint, ...shared };
    }
  }
  return shared;
});

const reflectionPending = ref(false);
const reflectionDraft = ref('');
const reflectionDest = ref('shared');
const savingReflection = ref(false);
const completionResult = ref(null);

const showReflectionDock = computed(
  () =>
    props.runtime?.status === 'REFLECTING' ||
    reflectionPending.value
);

const setup = reactive({
  maximumRounds: 3,
  whoRollsFirst: 'client',
  packId: 'core-6',
  promptDepth: 'light',
  captureMode: 'untimed_calm',
  staticMode: true,
  hapticsEnabled: false,
  missionId: 'first-contact',
  performanceProfile: 'balanced',
  sceneMood: 'curious',
  difficulty: 'gentle'
});

watch(
  () => props.runtime?.sharedState,
  (s) => {
    if (!s) return;
    if (s.maximumRounds) setup.maximumRounds = Number(s.maximumRounds) || 3;
    if (s.whoRollsFirst) setup.whoRollsFirst = s.whoRollsFirst;
    if (s.packId) setup.packId = s.packId;
    if (s.promptDepth) setup.promptDepth = s.promptDepth;
    if (s.mode) setup.captureMode = s.mode;
    if (s.staticMode !== undefined) setup.staticMode = !!s.staticMode;
    if (s.hapticsEnabled !== undefined) setup.hapticsEnabled = !!s.hapticsEnabled;
    if (s.missionId) setup.missionId = s.missionId;
    if (s.performanceProfile) setup.performanceProfile = s.performanceProfile;
    if (s.sceneMood) setup.sceneMood = s.sceneMood;
    if (s.difficulty) setup.difficulty = s.difficulty;
  },
  { immediate: true, deep: true }
);

watch(
  () => props.role,
  (r) => {
    reflectionDest.value = r === 'client' ? 'client_journal' : 'shared';
  },
  { immediate: true }
);

async function accept() {
  const runtime = await counselingApi.respondActivity(props.sessionId, 'accept');
  emit('runtime-updated', runtime);
}

async function decline() {
  const runtime = await counselingApi.respondActivity(props.sessionId, 'decline');
  emit('runtime-updated', runtime);
}

async function saveSetup() {
  const activityId = props.runtime?.activityId;
  const sharedState = {
    ...(props.runtime?.sharedState || {}),
    maximumRounds: setup.maximumRounds
  };
  if (activityId === 'emotion-dice') {
    sharedState.whoRollsFirst = setup.whoRollsFirst;
    sharedState.currentTurn = setup.whoRollsFirst;
    sharedState.packId = setup.packId;
    sharedState.promptDepth = setup.promptDepth;
  }
  if (activityId === 'feelings-capture') {
    sharedState.mode = setup.captureMode;
    sharedState.staticMode = !!setup.staticMode;
    sharedState.hapticsEnabled = !!setup.hapticsEnabled;
    sharedState.timerEnabled = false;
    sharedState.phase = props.runtime?.sharedState?.phase || 'intro';
  }
  if (activityId === 'space-cabin-conversation') {
    sharedState.missionId = setup.missionId;
    sharedState.performanceProfile = setup.performanceProfile;
    sharedState.sceneMood = setup.sceneMood;
    sharedState.difficulty = setup.difficulty;
    sharedState.phase = props.runtime?.sharedState?.phase || 'mission_select';
  }
  const runtime = await counselingApi.patchActivityRuntime(props.sessionId, { sharedState });
  emit('runtime-updated', runtime);
}

function checkpointPayload() {
  return props.runtime?.sharedState || effectiveSharedState.value || {};
}

async function pause() {
  const runtime = await counselingApi.pauseActivity(
    props.sessionId,
    `paused_by_${props.role}`,
    checkpointPayload()
  );
  emit('runtime-updated', runtime);
}

async function resume() {
  const runtime = await counselingApi.resumeActivity(props.sessionId);
  // Restore shared state from checkpoint when present
  if (runtime?.checkpoint && runtime.status === 'ACTIVE') {
    const restored = await counselingApi.patchActivityRuntime(props.sessionId, {
      sharedState: { ...runtime.checkpoint, ...(runtime.sharedState || {}), paused: false },
      status: 'ACTIVE'
    });
    emit('runtime-updated', restored);
    return;
  }
  emit('runtime-updated', runtime);
}

async function exit() {
  const runtime = await counselingApi.exitActivity(props.sessionId, {
    save: true,
    checkpoint: checkpointPayload()
  });
  reflectionPending.value = false;
  emit('runtime-updated', runtime);
  if (props.practiceMode) emit('practice-exit');
}

async function onSharedState(sharedState) {
  const runtime = await counselingApi.patchActivityRuntime(props.sessionId, {
    sharedState,
    status: 'ACTIVE'
  });
  emit('runtime-updated', runtime);
}

function openReflection(result) {
  completionResult.value = result || null;
  reflectionPending.value = true;
}

async function onComplete(result) {
  completionResult.value = result || null;
  const runtime = await counselingApi.patchActivityRuntime(props.sessionId, {
    status: 'REFLECTING',
    sharedState: {
      ...(props.runtime?.sharedState || {}),
      completion: result
    },
    checkpoint: checkpointPayload()
  });
  reflectionPending.value = true;
  emit('runtime-updated', runtime);
}

async function onSkip() {
  /* state already patched via share/skip path */
}

function onChildRuntime(runtime) {
  emit('runtime-updated', runtime);
}

async function saveReflectionAndExit() {
  savingReflection.value = true;
  try {
    const text = reflectionDraft.value.trim();
    if (text) {
      await counselingApi.createCounselingNote(props.sessionId, {
        visibility: reflectionDest.value,
        body: text,
        activityId: props.runtime?.activityId || null
      });
    }
    const runtime = await counselingApi.patchActivityRuntime(props.sessionId, {
      status: 'COMPLETED',
      sharedState: {
        ...(props.runtime?.sharedState || {}),
        completion: completionResult.value,
        reflectionSaved: !!text
      },
      checkpoint: checkpointPayload()
    });
    await counselingApi.exitActivity(props.sessionId, {
      save: true,
      completed: true,
      checkpoint: checkpointPayload()
    });
    reflectionPending.value = false;
    reflectionDraft.value = '';
    emit('runtime-updated', { ...runtime, status: 'INACTIVE' });
    if (props.practiceMode) emit('practice-exit');
  } finally {
    savingReflection.value = false;
  }
}

async function exitWithoutReflection() {
  savingReflection.value = true;
  try {
    await counselingApi.exitActivity(props.sessionId, {
      save: true,
      completed: true,
      checkpoint: checkpointPayload()
    });
    reflectionPending.value = false;
    reflectionDraft.value = '';
    emit('runtime-updated', { ...(props.runtime || {}), status: 'INACTIVE' });
    if (props.practiceMode) emit('practice-exit');
  } finally {
    savingReflection.value = false;
  }
}
</script>

<style scoped>
.ahost {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 120px;
}
.ahost__prompt,
.ahost__idle {
  padding: 0.75rem;
  background: #f8fafc;
  border-radius: 10px;
}
.ahost__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.ahost__btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #fff;
  font-weight: 600;
  cursor: pointer;
  padding: 0.5rem 0.85rem;
}
.ahost__btn--primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.ahost__btn--sm {
  min-height: 40px;
  font-size: 0.85rem;
}
.ahost__title-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  flex-wrap: wrap;
}
.ahost__title-row h3 {
  margin: 0;
  font-size: 1.05rem;
}
.ahost__paused {
  margin: 0.2rem 0 0;
  color: #b45309;
  font-size: 0.85rem;
  font-weight: 600;
}
.ahost__title-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.ahost__canvas {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem;
}
.ahost__provider-panel {
  border-left: 3px solid #93c5fd;
  padding: 0.5rem 0.75rem;
  background: #f0f9ff;
  border-radius: 0 8px 8px 0;
}
.ahost__provider-panel h4 {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
}
.ahost__tip {
  margin: 0.2rem 0;
  font-size: 0.8rem;
  color: #475569;
}
.ahost__unsupported {
  color: #64748b;
}
.ahost__setup {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.75rem 0;
  padding: 0.65rem;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.ahost__setup h4 {
  margin: 0;
  font-size: 0.85rem;
}
.ahost__setup label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: #475569;
}
.ahost__setup select {
  min-height: 40px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  padding: 0.35rem 0.5rem;
  font: inherit;
}
.ahost__reflect {
  padding: 0.85rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}
.ahost__reflect h4 {
  margin: 0 0 0.35rem;
}
.ahost__reflect-hint {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: #64748b;
}
.ahost__reflect textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.6rem;
  font: inherit;
  resize: vertical;
}
.ahost__reflect-dest {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.5rem;
  font-size: 0.85rem;
}
@media (min-width: 900px) {
  .ahost--provider .ahost__active {
    display: grid;
    grid-template-columns: 1fr 220px;
    gap: 0.75rem;
  }
  .ahost--provider .ahost__title-row,
  .ahost--provider .ahost__reflect {
    grid-column: 1 / -1;
  }
}
</style>
