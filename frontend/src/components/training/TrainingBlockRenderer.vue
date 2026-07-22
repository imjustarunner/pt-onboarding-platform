<template>
  <section class="training-block" :data-type="type" :id="anchorId">
    <header v-if="showHeader" class="block-header">
      <h3>{{ displayTitle }}</h3>
    </header>

    <VideoPlayer v-if="type === 'video'" :content="data" />

    <SlideViewer v-else-if="type === 'slide'" :content="data" />

    <div v-else-if="type === 'image'" class="image-block">
      <img v-if="data.imageUrl" :src="data.imageUrl" :alt="data.alt || displayTitle" />
    </div>

    <div v-else-if="type === 'pdf'" class="embed-block">
      <iframe v-if="data.fileUrl || data.googleUrl" :src="data.fileUrl || data.googleUrl" title="Document" />
      <a v-else-if="data.googleUrl" :href="data.googleUrl" target="_blank" rel="noopener">Open document</a>
    </div>

    <div v-else-if="type === 'text'" class="text-block">
      <div v-if="isIntro" class="intro">
        <h2 v-if="data.title">{{ data.title }}</h2>
        <div v-if="data.description" v-html="formatHtml(data.description)" />
      </div>
      <div v-else class="rich" v-html="bodyHtml" />
    </div>

    <div v-else-if="type === 'callout'" class="callout" :class="data.calloutStyle || 'info'">
      <strong v-if="data.title">{{ data.title }}</strong>
      <div v-html="formatHtml(data.content || '')" />
    </div>

    <hr v-else-if="type === 'divider'" class="divider" />

    <div v-else-if="type === 'spacer'" :style="{ height: (data.height || 32) + 'px' }" />

    <div v-else-if="type === 'button'" class="button-block">
      <a
        class="btn btn-primary"
        :href="data.url || '#'"
        :target="data.openInNewTab === false ? '_self' : '_blank'"
        rel="noopener"
      >{{ data.label || 'Continue' }}</a>
    </div>

    <div v-else-if="type === 'knowledge_check'" class="kc-block">
      <h4>{{ data.title || 'Check Your Understanding' }}</h4>
      <p class="kc-q">{{ data.question }}</p>
      <label v-for="(opt, i) in options" :key="i" class="kc-opt" :class="{ selected: selected === i, reveal: submitted }">
        <input
          type="radio"
          :name="`kc-${block.id || index}`"
          :disabled="readOnly || submitted"
          :checked="selected === i"
          @change="selected = i"
        />
        <span>{{ opt }}</span>
      </label>
      <div class="kc-actions">
        <button
          v-if="!submitted && !readOnly"
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="selected == null"
          @click="submitKc"
        >
          Submit Answer
        </button>
        <span v-if="autosaved" class="autosaved">Autosaved</span>
      </div>
      <div v-if="submitted" class="kc-feedback" :class="{ correct: kcCorrect }">
        <p>{{ kcCorrect ? (settings.feedbackCorrect || 'Correct!') : (settings.feedbackIncorrect || 'Not quite.') }}</p>
        <p v-if="data.explanation || settings.explanation" class="explanation">
          {{ data.explanation || settings.explanation }}
        </p>
      </div>
    </div>

    <QuizForm
      v-else-if="type === 'quiz' && !readOnly"
      :module-id="moduleId"
      :content="quizContent"
      :disabled="disabled"
      @quiz-completed="$emit('quiz-completed', $event)"
    />
    <div v-else-if="type === 'quiz' && readOnly" class="quiz-readonly">
      <h4>{{ data.title || 'Quiz' }}</h4>
      <p class="muted">Preview / view-only — answers are not saved in this mode.</p>
      <div v-for="(q, qi) in (data.questions || [])" :key="qi" class="q-preview">
        <p><strong>{{ q.question }}</strong></p>
        <ul>
          <li v-for="(o, oi) in (q.options || [])" :key="oi">{{ typeof o === 'string' ? o : o.text }}</li>
        </ul>
      </div>
    </div>

    <AcknowledgmentForm
      v-else-if="type === 'acknowledgment' && !readOnly"
      :module-id="moduleId"
      :content="{ ...data, title: data.title, description: data.text || data.description }"
      @acknowledged="$emit('acknowledged')"
    />
    <div v-else-if="type === 'acknowledgment' && readOnly" class="ack-readonly">
      <h4>{{ data.title || 'Acknowledgment' }}</h4>
      <div v-html="formatHtml(data.text || data.description || '')" />
    </div>

    <div v-else-if="type === 'response'" class="response-block">
      <h4>{{ data.prompt || 'Your response' }}</h4>
      <textarea
        v-if="data.responseType === 'textarea'"
        v-model="responseText"
        rows="5"
        :disabled="readOnly"
        @input="persistResponse"
      />
      <input v-else v-model="responseText" type="text" :disabled="readOnly" @input="persistResponse" />
      <button
        v-if="!readOnly"
        type="button"
        class="btn btn-secondary btn-sm"
        @click="$emit('save-response', { blockId: block.id, text: responseText })"
      >
        Save Response
      </button>
    </div>

    <div v-else-if="type === 'google_form'" class="embed-block">
      <h4 v-if="data.title">{{ data.title }}</h4>
      <iframe v-if="data.formUrl" :src="data.formUrl" title="Google Form" />
    </div>

    <div v-else-if="type === 'form'" class="form-slot">
      <slot name="form" :block="block" :data="data" />
      <p v-if="!$slots.form" class="muted">Profile form fields are configured for this lesson.</p>
    </div>

    <p v-else class="muted">Unsupported block: {{ type }}</p>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import VideoPlayer from '../VideoPlayer.vue';
import SlideViewer from '../SlideViewer.vue';
import QuizForm from '../QuizForm.vue';
import AcknowledgmentForm from '../AcknowledgmentForm.vue';
import {
  normalizeContentType,
  parseContentData
} from '../../utils/trainingBlockTypes.js';
import {
  isIntroTextContent,
  getTextBodyHtml,
  normalizeQuizDataForLearner
} from '../../utils/trainingContentNormalize.js';
import { blockTypeLabel } from '../../utils/trainingBlockTypes.js';

const props = defineProps({
  block: { type: Object, required: true },
  index: { type: Number, default: 0 },
  moduleId: { type: [String, Number], required: true },
  readOnly: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['quiz-completed', 'acknowledged', 'save-response', 'knowledge-check']);

const data = computed(() => parseContentData(props.block.content_data));
const settings = computed(() => parseContentData(props.block.settings) || {});
const type = computed(() => normalizeContentType(props.block.content_type, data.value));
const isIntro = computed(() => type.value === 'text' && isIntroTextContent(data.value));
const bodyHtml = computed(() => getTextBodyHtml(data.value));
const quizContent = computed(() => normalizeQuizDataForLearner(data.value));
const displayTitle = computed(() =>
  props.block.title || data.value.title || blockTypeLabel(type.value)
);
const showHeader = computed(() =>
  !['video', 'divider', 'spacer', 'knowledge_check', 'quiz', 'acknowledgment', 'text'].includes(type.value)
);
const anchorId = computed(() => `block-${props.block.id || props.index}`);

const options = computed(() => {
  const opts = Array.isArray(data.value.options) ? data.value.options : [];
  return opts.map((o) => (typeof o === 'string' ? o : o?.text || '')).filter((s) => s !== undefined);
});

const storageKey = computed(() => `kc:${props.moduleId}:${props.block.id || props.index}`);
const selected = ref(null);
const submitted = ref(false);
const autosaved = ref(false);
const responseText = ref('');

watch(
  storageKey,
  (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      selected.value = parsed.selected;
      submitted.value = !!parsed.submitted;
    } catch { /* ignore */ }
  },
  { immediate: true }
);

const kcCorrect = computed(() => {
  const correct = Number(data.value.correctAnswer);
  return submitted.value && selected.value === correct;
});

function submitKc() {
  submitted.value = true;
  autosaved.value = true;
  try {
    localStorage.setItem(
      storageKey.value,
      JSON.stringify({ selected: selected.value, submitted: true })
    );
  } catch { /* ignore */ }
  emit('knowledge-check', {
    blockId: props.block.id,
    correct: kcCorrect.value,
    selected: selected.value
  });
  setTimeout(() => { autosaved.value = false; }, 2000);
}

function persistResponse() {
  try {
    localStorage.setItem(`resp:${props.moduleId}:${props.block.id}`, responseText.value);
  } catch { /* ignore */ }
}

function formatHtml(text) {
  if (!text) return '';
  if (String(text).includes('<')) return text;
  return String(text).replace(/\n/g, '<br>');
}
</script>

<style scoped>
.training-block {
  margin-bottom: 28px;
  scroll-margin-top: 88px;
}
.block-header h3 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}
.image-block img { max-width: 100%; border-radius: 10px; }
.embed-block iframe {
  width: 100%;
  min-height: 480px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.text-block .rich :deep(p) { line-height: 1.65; }
.callout {
  border-left: 4px solid var(--accent);
  background: var(--bg-alt);
  padding: 14px 16px;
  border-radius: 0 10px 10px 0;
}
.callout.tip, .callout.success { border-left-color: var(--success); }
.callout.warning { border-left-color: var(--warning); }
.kc-block {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px;
  background: var(--bg);
}
.kc-q { font-weight: 600; margin: 8px 0 14px; }
.kc-opt {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
}
.kc-opt.selected { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent); }
.kc-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.autosaved { font-size: 12px; color: var(--success); }
.kc-feedback { margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: var(--bg-alt); }
.kc-feedback.correct { background: color-mix(in srgb, var(--success) 14%, transparent); }
.explanation { color: var(--text-secondary); font-size: 13px; margin-top: 6px; }
.response-block textarea, .response-block input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin: 8px 0;
  font: inherit;
}
.muted { color: var(--text-secondary); font-size: 13px; }
.divider { border: none; border-top: 1px solid var(--border); margin: 8px 0; }
.q-preview { margin-bottom: 12px; }
.q-preview ul { margin: 6px 0 0 18px; }
</style>
