<template>
  <div class="ss" :class="{ 'ss--web': layout === 'web', 'ss--reduced': reducedMotion }">
    <header class="ss__header">
      <h2 class="ss__title">StoryShelf</h2>
      <p class="ss__lead">Choose a topic-based short story to read aloud or together. No scoring.</p>
    </header>

    <!-- Shelf -->
    <div v-if="phase === 'shelf'" class="ss__step">
      <p class="ss__prompt">Choose a topic</p>
      <div class="ss__topics" role="listbox" aria-label="Story topics">
        <button
          v-for="t in topics"
          :key="t.id"
          type="button"
          class="ss__spine"
          role="option"
          :aria-selected="topicId === t.id"
          :class="{ 'ss__spine--on': topicId === t.id }"
          @click="selectTopic(t.id)"
        >
          {{ t.label }}
        </button>
      </div>
      <p v-if="topicBlurb" class="ss__blurb">{{ topicBlurb }}</p>
      <p v-if="topicId" class="ss__prompt">Choose a story to read aloud or read together.</p>
      <div v-if="topicId" class="ss__covers">
        <button
          v-for="s in topicStories"
          :key="s.id"
          type="button"
          class="ss__cover"
          :class="{ 'ss__cover--on': storyId === s.id }"
          @click="selectStory(s.id)"
        >
          <strong>{{ s.title }}</strong>
          <span>{{ s.summary }}</span>
          <span class="ss__meta">{{ s.readingTimeMinutes }} min · {{ s.readingLevel }}</span>
        </button>
      </div>
      <div v-if="storyId" class="ss__preview">
        <p v-if="selectedStory?.contentNote" class="ss__note">
          Content note: {{ selectedStory.contentNote }}
        </p>
        <p class="ss__prompt">Reading mode</p>
        <div class="ss__chips">
          <button
            v-for="m in readingModes"
            :key="m.id"
            type="button"
            class="ss__chip"
            :class="{ 'ss__chip--on': readingMode === m.id }"
            @click="readingMode = m.id"
          >
            {{ m.label }}
          </button>
        </div>
        <div class="ss__actions">
          <button type="button" class="ss__btn ss__btn--primary" @click="openStory">
            Open story
          </button>
          <button
            v-if="role === 'client' && topicId === 'grief'"
            type="button"
            class="ss__btn ss__btn--ghost"
            @click="declineTopic"
          >
            Choose a different topic
          </button>
        </div>
        <p v-if="role === 'provider'" class="ss__hint">
          You may preview before opening. Client can decline sensitive topics anytime.
        </p>
      </div>
    </div>

    <!-- Reading -->
    <div v-else-if="phase === 'reading'" class="ss__step">
      <p class="ss__meta">
        {{ selectedStory?.title }} · page {{ pageIndex + 1 }} / {{ pageCount }}
        <span v-if="readingModeLabel"> · {{ readingModeLabel }}</span>
      </p>
      <article class="ss__page" aria-live="polite">
        <p>{{ currentPageText }}</p>
      </article>
      <div v-if="discussionOpen" class="ss__discuss">
        <p>{{ discussionPrompt }}</p>
        <button type="button" class="ss__btn" @click="discussionOpen = false">Continue reading</button>
      </div>
      <div class="ss__actions ss__actions--row">
        <button type="button" class="ss__btn" :disabled="pageIndex <= 0" @click="prevPage">
          Previous
        </button>
        <button type="button" class="ss__btn" @click="markDiscussion">Discussion marker</button>
        <button
          type="button"
          class="ss__btn ss__btn--primary"
          @click="nextPage"
        >
          {{ pageIndex + 1 >= pageCount ? 'Finish story' : 'Next' }}
        </button>
      </div>
      <button type="button" class="ss__btn ss__btn--ghost" @click="backToShelf">Back to shelf</button>
    </div>

    <!-- Reflect -->
    <div v-else-if="phase === 'reflect'" class="ss__step">
      <p class="ss__prompt">Optional reflection</p>
      <ul class="ss__talk">
        <li>What part of the story stood out?</li>
        <li>Was there a character you understood?</li>
        <li>Would you like to talk about the story or leave it there for today?</li>
      </ul>
      <label class="ss__field">
        Shared note (optional)
        <textarea v-model="reflection" rows="2" maxlength="500" />
      </label>
      <button type="button" class="ss__btn ss__btn--primary" @click="finish">
        Return to conversation
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import manifest from './manifest.js';
import { TOPICS, READING_MODES, storiesForTopic, findStory } from './contentPacks.js';

const props = defineProps({
  role: { type: String, required: true },
  layout: { type: String, default: 'mobile' },
  sessionId: { type: [String, Number], default: null },
  sharedState: { type: Object, default: () => ({}) },
  reducedMotion: { type: Boolean, default: false }
});

const emit = defineEmits(['update:sharedState', 'complete', 'skip']);

const topics = TOPICS;
const readingModes = READING_MODES;

const readingMode = ref(props.sharedState?.readingMode || 'together');
const reflection = ref(props.sharedState?.reflection || '');
const discussionOpen = ref(false);

const phase = computed(() => props.sharedState?.phase || 'shelf');
const topicId = computed(() => props.sharedState?.topicId || null);
const storyId = computed(() => props.sharedState?.storyId || null);
const pageIndex = computed(() => Number(props.sharedState?.pageIndex) || 0);

const topicBlurb = computed(() => topics.find((t) => t.id === topicId.value)?.blurb || '');
const topicStories = computed(() => (topicId.value ? storiesForTopic(topicId.value) : []));
const selectedStory = computed(() =>
  topicId.value && storyId.value ? findStory(topicId.value, storyId.value) : null
);
const pageCount = computed(() => selectedStory.value?.pages?.length || 0);
const currentPageText = computed(
  () => selectedStory.value?.pages?.[pageIndex.value] || ''
);
const readingModeLabel = computed(
  () => readingModes.find((m) => m.id === (props.sharedState?.readingMode || readingMode.value))?.label
);
const discussionPrompt = computed(
  () =>
    props.sharedState?.discussionPrompt ||
    'What stood out on this page? You can talk now or keep reading.'
);

function publish(partial) {
  emit('update:sharedState', { ...props.sharedState, ...partial });
}

function selectTopic(id) {
  publish({
    phase: 'shelf',
    topicId: id,
    storyId: null,
    pageIndex: 0
  });
}

function selectStory(id) {
  publish({ storyId: id });
}

function declineTopic() {
  publish({ topicId: null, storyId: null });
}

function openStory() {
  if (!topicId.value || !storyId.value) return;
  publish({
    phase: 'reading',
    readingMode: readingMode.value,
    pageIndex: 0,
    bookmark: 0,
    discussionMarkers: []
  });
}

function prevPage() {
  if (pageIndex.value <= 0) return;
  publish({ pageIndex: pageIndex.value - 1, bookmark: pageIndex.value - 1 });
}

function nextPage() {
  if (pageIndex.value + 1 >= pageCount.value) {
    publish({ phase: 'reflect', bookmark: pageIndex.value });
    return;
  }
  const next = pageIndex.value + 1;
  publish({ pageIndex: next, bookmark: next });
}

function markDiscussion() {
  const markers = Array.isArray(props.sharedState?.discussionMarkers)
    ? [...props.sharedState.discussionMarkers]
    : [];
  markers.push({ pageIndex: pageIndex.value, at: new Date().toISOString() });
  publish({
    discussionMarkers: markers,
    discussionPrompt: 'What stood out on this page? You can talk now or keep reading.'
  });
  discussionOpen.value = true;
}

function backToShelf() {
  publish({ phase: 'shelf' });
  discussionOpen.value = false;
}

function finish() {
  const note = reflection.value.trim() || null;
  publish({
    phase: 'complete',
    reflection: note,
    reflectionShared: !!note
  });
  emit('complete', {
    activityId: manifest.id,
    storyId: storyId.value,
    topicId: topicId.value,
    reflection: note
  });
}

defineExpose({ manifest });
</script>

<style scoped>
.ss {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  color: #2a2218;
}
.ss__title {
  margin: 0;
  font-size: 1.15rem;
}
.ss__lead,
.ss__meta,
.ss__hint,
.ss__blurb {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #5a4e3c;
}
.ss__prompt {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
.ss__topics {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}
.ss--web .ss__topics {
  flex-wrap: wrap;
  overflow: visible;
}
.ss__spine {
  flex: 0 0 auto;
  min-height: 72px;
  min-width: 52px;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  border-radius: 6px;
  border: 1px solid #c4b49a;
  background: linear-gradient(90deg, #e8dcc8, #f3ebe0);
  padding: 0.5rem 0.35rem;
  font: inherit;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
}
.ss__spine--on {
  background: linear-gradient(90deg, #c9a66b, #e8d4a8);
  border-color: #8a6a3a;
  box-shadow: 0 0 0 2px #8a6a3a;
}
.ss__covers {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
}
.ss--web .ss__covers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  overflow: visible;
}
.ss__cover {
  flex: 0 0 auto;
  width: 160px;
  min-height: 120px;
  text-align: left;
  border-radius: 12px;
  border: 1px solid #c4b49a;
  background: #faf6ef;
  padding: 0.65rem;
  font: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.ss__cover span {
  font-size: 0.8rem;
  color: #5a4e3c;
}
.ss__cover--on {
  border-color: #8a6a3a;
  background: #f0e6d4;
  box-shadow: inset 0 0 0 2px #8a6a3a;
}
.ss__note {
  margin: 0;
  padding: 0.55rem 0.65rem;
  background: #fff8e8;
  border: 1px solid #e0c98a;
  border-radius: 8px;
  font-size: 0.85rem;
}
.ss__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.ss__chip {
  min-height: 40px;
  border-radius: 999px;
  border: 1px solid #c4b49a;
  background: #faf6ef;
  padding: 0.35rem 0.75rem;
  font: inherit;
  cursor: pointer;
}
.ss__chip--on {
  background: #e8d4a8;
  border-color: #8a6a3a;
  font-weight: 600;
}
.ss__page {
  min-height: 140px;
  padding: 1rem;
  border-radius: 12px;
  background: #fffdf8;
  border: 1px solid #e0d4c0;
  line-height: 1.55;
}
.ss__discuss {
  padding: 0.65rem;
  border-radius: 10px;
  background: #eef4ff;
  border: 1px solid #9aacc0;
}
.ss__talk {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.9rem;
}
.ss__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.ss__field textarea {
  border: 1px solid #c4b49a;
  border-radius: 8px;
  padding: 0.55rem;
  font: inherit;
}
.ss__actions {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.ss__actions--row {
  flex-direction: row;
  flex-wrap: wrap;
}
.ss__actions--row .ss__btn {
  flex: 1 1 auto;
}
.ss__btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid #c4b49a;
  background: #f0e6d4;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.ss__btn--primary {
  background: #8a6a3a;
  border-color: #8a6a3a;
  color: #fff;
}
.ss__btn--ghost {
  background: transparent;
}
.ss__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
