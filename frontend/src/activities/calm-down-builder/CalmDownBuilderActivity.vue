<template>
  <div class="cdb" :class="{ 'cdb--web': layout === 'web', 'cdb--reduced': reducedMotion }">
    <header class="cdb__header">
      <h2 class="cdb__title">Calm Down Builder</h2>
      <p class="cdb__lead">
        Build a personal calm sequence — three to five tools — then practice together. No scoring.
      </p>
    </header>

    <!-- Before check-in -->
    <div v-if="phase === 'before'" class="cdb__step">
      <p class="cdb__prompt">Optional before check-in: how calm do you feel? (1–5)</p>
      <input v-model.number="beforeCalm" type="range" min="1" max="5" step="1" />
      <span>{{ beforeCalm }}</span>
      <div class="cdb__actions">
        <button type="button" class="cdb__btn cdb__btn--primary" @click="goBuild">Continue</button>
        <button type="button" class="cdb__btn cdb__btn--ghost" @click="goBuild">Skip check-in</button>
      </div>
    </div>

    <!-- Build path -->
    <div v-else-if="phase === 'build'" class="cdb__step">
      <p class="cdb__prompt">Choose {{ pathSize }} calming tools and place them on your path.</p>
      <div class="cdb__path" aria-label="Calm path">
        <button
          v-for="(slot, idx) in pathSlots"
          :key="'slot-' + idx"
          type="button"
          class="cdb__slot"
          :class="{ 'cdb__slot--filled': slot }"
          @click="clearSlot(idx)"
        >
          <span v-if="slot">{{ toolLabel(slot) }}</span>
          <span v-else>Empty {{ idx + 1 }}</span>
        </button>
      </div>
      <p class="cdb__hint">Tap a tool, then tap an empty path spot. Tap a filled spot to clear it.</p>
      <div class="cdb__tools" :class="{ 'cdb__tools--web': layout === 'web' }">
        <button
          v-for="t in tools"
          :key="t.id"
          type="button"
          class="cdb__tool"
          :class="{ 'cdb__tool--on': pendingTool === t.id }"
          :disabled="pathSlots.includes(t.id)"
          @click="pendingTool = t.id"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="cdb__size">
        <span>Path length</span>
        <button
          v-for="n in pathSizeOptions"
          :key="n"
          type="button"
          class="cdb__chip"
          :class="{ 'cdb__chip--on': pathSize === n }"
          @click="resizePath(n)"
        >
          {{ n }}
        </button>
      </div>
      <div class="cdb__actions">
        <button
          type="button"
          class="cdb__btn cdb__btn--primary"
          :disabled="!pathComplete"
          @click="startPractice"
        >
          Practice sequence
        </button>
        <button type="button" class="cdb__btn" @click="placePending">Place selected tool</button>
      </div>
    </div>

    <!-- Practice -->
    <div v-else-if="phase === 'practice'" class="cdb__step">
      <p class="cdb__meta">Step {{ practiceIndex + 1 }} of {{ pathSlots.filter(Boolean).length }}</p>
      <p class="cdb__prompt">{{ currentTool?.label }}</p>
      <ul class="cdb__guide">
        <li v-for="(line, i) in currentTool?.guide || []" :key="i">{{ line }}</li>
      </ul>
      <div
        v-if="currentTool?.id === 'deep-breathing'"
        class="cdb__breath"
        :class="{ 'cdb__breath--pulse': !reducedMotion }"
        aria-hidden="true"
      />
      <div class="cdb__actions">
        <button type="button" class="cdb__btn cdb__btn--primary" @click="nextPractice">
          {{ practiceIndex + 1 >= filledCount ? 'Finish practice' : 'Next tool' }}
        </button>
        <button type="button" class="cdb__btn" @click="backToBuild">Edit sequence</button>
      </div>
    </div>

    <!-- After / save -->
    <div v-else-if="phase === 'after'" class="cdb__step">
      <p class="cdb__prompt">Optional after check-in: how calm do you feel now? (1–5)</p>
      <input v-model.number="afterCalm" type="range" min="1" max="5" step="1" />
      <span>{{ afterCalm }}</span>
      <label class="cdb__field">
        Plan name
        <input v-model="planName" type="text" maxlength="60" placeholder="My calm plan" />
      </label>
      <label class="cdb__field">
        Reminder phrase
        <input v-model="reminder" type="text" maxlength="120" placeholder="I can take one calm step." />
      </label>
      <label class="cdb__field">
        When might this help?
        <input v-model="whenUseful" type="text" maxlength="120" />
      </label>
      <p class="cdb__talk">Which tool helped the most? Would you remove any?</p>
      <div class="cdb__actions">
        <button type="button" class="cdb__btn cdb__btn--primary" @click="finish">
          Save plan &amp; reflect
        </button>
        <button type="button" class="cdb__btn cdb__btn--ghost" @click="finishWithoutSave">
          Return without saving
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import manifest from './manifest.js';
import { CALM_TOOLS, PATH_SIZE_OPTIONS, toolById } from './contentPacks.js';

const props = defineProps({
  role: { type: String, required: true },
  layout: { type: String, default: 'mobile' },
  sessionId: { type: [String, Number], default: null },
  sharedState: { type: Object, default: () => ({}) },
  reducedMotion: { type: Boolean, default: false }
});

const emit = defineEmits(['update:sharedState', 'complete', 'skip']);

const tools = CALM_TOOLS;
const pathSizeOptions = PATH_SIZE_OPTIONS;

const beforeCalm = ref(Number(props.sharedState?.beforeCalm) || 3);
const afterCalm = ref(Number(props.sharedState?.afterCalm) || 3);
const pendingTool = ref(null);
const planName = ref(props.sharedState?.calmPlan?.name || 'My calm plan');
const reminder = ref(props.sharedState?.calmPlan?.reminder || '');
const whenUseful = ref(props.sharedState?.calmPlan?.whenUseful || '');

const phase = computed(() => props.sharedState?.phase || 'before');
const pathSize = computed(() => Number(props.sharedState?.pathSize) || 3);
const pathSlots = computed(() => {
  const raw = Array.isArray(props.sharedState?.path) ? props.sharedState.path : [];
  const size = pathSize.value;
  const out = [...raw];
  while (out.length < size) out.push(null);
  return out.slice(0, size);
});
const practiceIndex = computed(() => Number(props.sharedState?.practiceIndex) || 0);
const filledCount = computed(() => pathSlots.value.filter(Boolean).length);
const pathComplete = computed(() => filledCount.value >= pathSize.value);
const currentTool = computed(() => {
  const id = pathSlots.value.filter(Boolean)[practiceIndex.value];
  return toolById(id);
});

watch(
  () => props.sharedState?.path,
  () => {
    /* reactive via computed */
  },
  { deep: true }
);

function publish(partial) {
  emit('update:sharedState', { ...props.sharedState, ...partial });
}

function toolLabel(id) {
  return toolById(id)?.label || id;
}

function goBuild() {
  publish({
    phase: 'build',
    beforeCalm: beforeCalm.value,
    pathSize: pathSize.value,
    path: pathSlots.value.length ? pathSlots.value : Array(pathSize.value).fill(null),
    practiceIndex: 0
  });
}

function resizePath(n) {
  const next = [...pathSlots.value];
  while (next.length < n) next.push(null);
  publish({ pathSize: n, path: next.slice(0, n) });
}

function placePending() {
  if (!pendingTool.value) return;
  const next = [...pathSlots.value];
  const empty = next.findIndex((s) => !s);
  if (empty < 0) return;
  if (next.includes(pendingTool.value)) return;
  next[empty] = pendingTool.value;
  pendingTool.value = null;
  publish({ path: next });
}

function clearSlot(idx) {
  if (pendingTool.value && !pathSlots.value[idx]) {
    const next = [...pathSlots.value];
    next[idx] = pendingTool.value;
    pendingTool.value = null;
    publish({ path: next });
    return;
  }
  const next = [...pathSlots.value];
  next[idx] = null;
  publish({ path: next });
}

function startPractice() {
  if (!pathComplete.value) return;
  publish({ phase: 'practice', practiceIndex: 0, path: pathSlots.value });
}

function nextPractice() {
  const next = practiceIndex.value + 1;
  if (next >= filledCount.value) {
    publish({ phase: 'after', practiceIndex: next });
    return;
  }
  publish({ practiceIndex: next });
}

function backToBuild() {
  publish({ phase: 'build', practiceIndex: 0 });
}

function finish() {
  const calmPlan = {
    name: planName.value.trim() || 'My calm plan',
    tools: pathSlots.value.filter(Boolean),
    reminder: reminder.value.trim() || null,
    whenUseful: whenUseful.value.trim() || null,
    beforeCalm: props.sharedState?.beforeCalm ?? beforeCalm.value,
    afterCalm: afterCalm.value,
    sharedWithProvider: true
  };
  publish({ phase: 'complete', afterCalm: afterCalm.value, calmPlan });
  emit('complete', { activityId: manifest.id, calmPlan });
}

function finishWithoutSave() {
  publish({ phase: 'complete', afterCalm: afterCalm.value, calmPlan: null });
  emit('complete', { activityId: manifest.id, calmPlan: null });
}

defineExpose({ manifest });
</script>

<style scoped>
.cdb {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  color: #1a2e28;
}
.cdb__title {
  margin: 0;
  font-size: 1.15rem;
}
.cdb__lead,
.cdb__meta,
.cdb__hint,
.cdb__talk {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #3d5a50;
}
.cdb__prompt {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
.cdb__path {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.cdb--web .cdb__path {
  flex-direction: row;
  flex-wrap: wrap;
}
.cdb__slot {
  min-height: 48px;
  border-radius: 12px;
  border: 1px dashed #9cb5aa;
  background: #f3faf6;
  font: inherit;
  cursor: pointer;
  padding: 0.5rem 0.75rem;
}
.cdb__slot--filled {
  border-style: solid;
  background: #d5efe3;
  border-color: #2f6b52;
  font-weight: 600;
}
.cdb__tools {
  display: flex;
  gap: 0.45rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}
.cdb__tools--web {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  overflow: visible;
}
.cdb__tool {
  flex: 0 0 auto;
  min-width: 120px;
  min-height: 52px;
  border-radius: 10px;
  border: 1px solid #9cb5aa;
  background: #f8fcf9;
  font: inherit;
  cursor: pointer;
  padding: 0.45rem;
}
.cdb__tool--on {
  background: #c5e4d4;
  border-color: #2f6b52;
  font-weight: 600;
}
.cdb__tool:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.cdb__size {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
}
.cdb__chip {
  min-height: 36px;
  min-width: 36px;
  border-radius: 999px;
  border: 1px solid #9cb5aa;
  background: #f3faf6;
  font: inherit;
  cursor: pointer;
}
.cdb__chip--on {
  background: #2f6b52;
  color: #fff;
  border-color: #2f6b52;
}
.cdb__guide {
  margin: 0;
  padding-left: 1.1rem;
}
.cdb__breath {
  width: 88px;
  height: 88px;
  margin: 0.5rem auto;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #d4efe3, #7eb89a);
}
.cdb__breath--pulse {
  animation: cdb-breathe 4s ease-in-out infinite;
}
@keyframes cdb-breathe {
  0%,
  100% {
    transform: scale(0.9);
  }
  50% {
    transform: scale(1.1);
  }
}
.cdb--reduced .cdb__breath--pulse {
  animation: none;
}
.cdb__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.cdb__field input {
  border: 1px solid #b7c9bf;
  border-radius: 8px;
  padding: 0.55rem;
  font: inherit;
}
.cdb__actions {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.cdb__btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid #9cb5aa;
  background: #e8f3ec;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.cdb__btn--primary {
  background: #2f6b52;
  border-color: #2f6b52;
  color: #fff;
}
.cdb__btn--ghost {
  background: transparent;
}
.cdb__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
