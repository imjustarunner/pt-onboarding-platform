<template>
  <div class="mci" :class="{ 'mci--web': layout === 'web' }">
    <header class="mci__header">
      <h2 class="mci__title">Mood Check-In</h2>
      <p class="mci__prompt">{{ promptText }}</p>
    </header>

    <!-- Client selection -->
    <div v-if="role === 'client' && phase === 'select'" class="mci__options" role="listbox" aria-label="How are you feeling">
      <button
        v-for="opt in moodOptions"
        :key="opt.id"
        type="button"
        class="mci__mood"
        role="option"
        :aria-selected="selectedMood === opt.id"
        :class="{ 'mci__mood--selected': selectedMood === opt.id }"
        @click="selectedMood = opt.id"
      >
        <span class="mci__mood-icon" aria-hidden="true">{{ opt.icon }}</span>
        <span class="mci__mood-label">{{ opt.label }}</span>
      </button>
    </div>

    <div v-if="role === 'client' && phase === 'select' && selectedMood" class="mci__intensity">
      <label for="mci-intensity">Intensity (optional)</label>
      <input
        id="mci-intensity"
        v-model.number="intensity"
        type="range"
        min="1"
        max="5"
        step="1"
      />
      <span class="mci__intensity-val">{{ intensity }}</span>
    </div>

    <div v-if="role === 'client' && phase === 'select' && selectedMood" class="mci__note">
      <label for="mci-note">Optional note</label>
      <textarea
        id="mci-note"
        v-model="noteDraft"
        rows="2"
        maxlength="500"
        placeholder="Anything you want to add (optional)"
      />
      <p class="mci__privacy">Your note is private until you choose to share it.</p>
    </div>

    <div v-if="role === 'client' && phase === 'select'" class="mci__actions">
      <button
        type="button"
        class="mci__btn mci__btn--primary"
        :disabled="!selectedMood"
        @click="shareSelection"
      >
        Share with provider
      </button>
      <button
        type="button"
        class="mci__btn"
        :disabled="!selectedMood"
        @click="keepPrivate"
      >
        Keep private &amp; continue
      </button>
      <button type="button" class="mci__btn mci__btn--ghost" @click="skip">Skip</button>
    </div>

    <!-- Shared / discussion -->
    <div v-if="phase === 'discuss'" class="mci__discuss">
      <div v-if="sharedMood" class="mci__result" aria-live="polite">
        <span class="mci__mood-icon" aria-hidden="true">{{ moodIcon(sharedMood.id) }}</span>
        <div>
          <strong>{{ sharedMood.label }}</strong>
          <span v-if="sharedMood.intensity"> · intensity {{ sharedMood.intensity }}</span>
          <p v-if="sharedMood.note">{{ sharedMood.note }}</p>
          <p v-else-if="sharedMood.noteShared === false && role === 'client'" class="mci__muted">
            You chose not to share a note.
          </p>
        </div>
      </div>
      <p class="mci__discuss-prompt">{{ discussionPrompt }}</p>
      <div class="mci__actions">
        <button type="button" class="mci__btn mci__btn--primary" @click="finish">
          Return to conversation
        </button>
      </div>
    </div>

    <!-- Provider waiting -->
    <div v-if="role === 'provider' && phase === 'select'" class="mci__waiting">
      <p>Waiting for the client to share how they are feeling…</p>
      <ul class="mci__facilitation">
        <li v-for="(tip, i) in facilitationTips" :key="i">{{ tip }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import manifest from './manifest.js';

const props = defineProps({
  role: { type: String, required: true },
  layout: { type: String, default: 'mobile' },
  sharedState: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['update:sharedState', 'complete', 'skip']);

const moodOptions = [
  { id: 'great', label: 'Great', icon: '◎' },
  { id: 'good', label: 'Good', icon: '○' },
  { id: 'okay', label: 'Okay', icon: '◌' },
  { id: 'stressed', label: 'Stressed', icon: '△' },
  { id: 'overwhelmed', label: 'Overwhelmed', icon: '◇' }
];

const facilitationTips = [
  'What is contributing to that feeling?',
  'Where do you notice it in the body?',
  'Has it changed since the session started?',
  'What would feel helpful right now?'
];

const selectedMood = ref(null);
const intensity = ref(3);
const noteDraft = ref('');
const phase = ref('select');

const promptText = computed(() =>
  props.role === 'client' ? 'How are you feeling right now?' : 'Mood Check-In'
);

const sharedMood = computed(() => props.sharedState?.mood || null);

const discussionPrompt = computed(() => {
  const prompts = facilitationTips;
  const idx = (sharedMood.value?.id || '').length % prompts.length;
  return prompts[idx] || prompts[0];
});

function moodIcon(id) {
  return moodOptions.find((m) => m.id === id)?.icon || '○';
}

function moodLabel(id) {
  return moodOptions.find((m) => m.id === id)?.label || id;
}

function publish(moodPayload, nextPhase = 'discuss') {
  const next = {
    ...props.sharedState,
    mood: moodPayload,
    phase: nextPhase
  };
  emit('update:sharedState', next);
  phase.value = nextPhase;
}

function shareSelection() {
  if (!selectedMood.value) return;
  publish(
    {
      id: selectedMood.value,
      label: moodLabel(selectedMood.value),
      intensity: intensity.value,
      note: noteDraft.value.trim() || undefined,
      noteShared: !!noteDraft.value.trim(),
      sharedAt: new Date().toISOString()
    },
    'discuss'
  );
}

function keepPrivate() {
  if (!selectedMood.value) return;
  publish(
    {
      id: selectedMood.value,
      label: moodLabel(selectedMood.value),
      intensity: intensity.value,
      noteShared: false,
      sharedAt: new Date().toISOString()
    },
    'discuss'
  );
}

function skip() {
  publish({ skipped: true, skippedAt: new Date().toISOString() }, 'discuss');
  emit('skip');
}

function finish() {
  emit('complete', {
    activityId: manifest.id,
    sharedResult: props.sharedState?.mood || { skipped: true }
  });
}

watch(
  () => props.sharedState?.phase,
  (p) => {
    if (p === 'discuss' || props.sharedState?.mood) phase.value = 'discuss';
  },
  { immediate: true }
);

watch(
  () => props.sharedState?.mood,
  (m) => {
    if (m) phase.value = 'discuss';
  },
  { immediate: true }
);

onMounted(() => {
  if (props.sharedState?.mood || props.sharedState?.phase === 'discuss') {
    phase.value = 'discuss';
  }
});

defineExpose({ manifest });
</script>

<style scoped>
.mci {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.75rem 0.25rem 1rem;
  color: #1a1f2c;
}
.mci__title {
  margin: 0;
  font-size: 1.15rem;
}
.mci__prompt {
  margin: 0.25rem 0 0;
  color: #4a5568;
  font-size: 0.95rem;
}
.mci__options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 0.6rem;
}
.mci__mood {
  min-height: 88px;
  border: 2px solid #d5dbe8;
  border-radius: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  cursor: pointer;
  padding: 0.5rem;
}
.mci__mood--selected {
  border-color: #2f6fed;
  background: #eef4ff;
}
.mci__mood-icon {
  font-size: 1.4rem;
  line-height: 1;
}
.mci__mood-label {
  font-size: 0.85rem;
  font-weight: 600;
}
.mci__intensity,
.mci__note {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.mci__intensity-val {
  font-weight: 600;
}
.mci__note textarea {
  border: 1px solid #cfd6e4;
  border-radius: 8px;
  padding: 0.6rem;
  font: inherit;
  resize: vertical;
}
.mci__privacy,
.mci__muted {
  font-size: 0.8rem;
  color: #64748b;
  margin: 0;
}
.mci__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.mci__btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid #c5cddc;
  background: #f4f6fb;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 0.6rem 0.9rem;
}
.mci__btn--primary {
  background: #2f6fed;
  border-color: #2f6fed;
  color: #fff;
}
.mci__btn--primary:disabled,
.mci__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.mci__btn--ghost {
  background: transparent;
}
.mci__result {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.75rem;
  background: #f0f4ff;
  border-radius: 10px;
}
.mci__discuss-prompt {
  font-size: 1rem;
  margin: 0;
}
.mci__waiting {
  padding: 0.5rem 0;
}
.mci__facilitation {
  margin: 0.75rem 0 0;
  padding-left: 1.1rem;
  color: #475569;
  font-size: 0.9rem;
}
.mci--web .mci__options {
  grid-template-columns: repeat(5, 1fr);
}
</style>
