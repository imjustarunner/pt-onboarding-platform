<template>
  <div
    class="lesson-block"
    :class="{ selected: isSelected }"
    @click="$emit('select', block.clientKey)"
  >
    <div class="block-toolbar">
      <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
      <span class="block-type">{{ blockTypeLabel(block.content_type) }}</span>
      <span v-if="block.settings?.required" class="required-pill">Required</span>
      <div class="block-actions">
        <button type="button" class="icon-btn" title="Duplicate" @click.stop="$emit('duplicate', block.clientKey)">⧉</button>
        <button type="button" class="icon-btn danger" title="Delete" @click.stop="$emit('delete', block.clientKey)">×</button>
      </div>
    </div>

    <div class="block-body">
      <!-- Video -->
      <div v-if="block.content_type === 'video'" class="fields">
        <label>Title</label>
        <input v-model="local.title" type="text" placeholder="Video title" @input="emitData" />
        <label>Video URL</label>
        <div class="url-row">
          <input v-model="local.videoUrl" type="url" placeholder="YouTube, Vimeo, or library upload URL" @input="emitData" />
          <button type="button" class="btn btn-secondary btn-sm" @click.stop="$emit('open-media', 'video')">Media library</button>
        </div>
        <p v-if="local.placeholderHint" class="hint">{{ local.placeholderHint }}</p>
        <div v-if="embedUrl" class="video-preview">
          <iframe :src="embedUrl" title="Video preview" allowfullscreen />
        </div>
      </div>

      <!-- Text -->
      <div v-else-if="block.content_type === 'text'" class="fields">
        <label>Title</label>
        <input v-model="local.title" type="text" placeholder="Section title" @input="emitData" />
        <label>Content</label>
        <!-- Stable key so TipTap is not remounted on every content_data sync -->
        <RichTextEditor
          :key="`rte-${block.clientKey}`"
          :content="richTextContent"
          @update="onRichText"
        />
      </div>

      <!-- Image -->
      <div v-else-if="block.content_type === 'image'" class="fields">
        <label>Title</label>
        <input v-model="local.title" type="text" @input="emitData" />
        <label>Image URL</label>
        <div class="url-row">
          <input v-model="local.imageUrl" type="url" placeholder="https://..." @input="emitData" />
          <button type="button" class="btn btn-secondary btn-sm" @click.stop="$emit('open-media', 'image')">Media library</button>
        </div>
        <label>Alt text</label>
        <input v-model="local.alt" type="text" @input="emitData" />
        <img v-if="local.imageUrl" :src="local.imageUrl" :alt="local.alt || ''" class="image-preview" />
      </div>

      <!-- PDF / Doc -->
      <div v-else-if="block.content_type === 'pdf'" class="fields">
        <label>Title</label>
        <input v-model="local.title" type="text" @input="emitData" />
        <label>Document URL</label>
        <div class="url-row">
          <input v-model="local.googleUrl" type="url" placeholder="Google Docs / PDF link" @input="onDocUrl" />
          <button type="button" class="btn btn-secondary btn-sm" @click.stop="$emit('open-media', 'pdf')">Media library</button>
        </div>
        <p v-if="local.fileUrl" class="hint">Embed: {{ local.fileUrl }}</p>
      </div>

      <!-- Slides -->
      <div v-else-if="block.content_type === 'slide'" class="fields">
        <label>Title</label>
        <input v-model="local.title" type="text" @input="emitData" />
        <label>Google Slides URL</label>
        <input v-model="local.googleSlidesUrl" type="url" @input="onSlidesUrl" />
      </div>

      <!-- Quiz -->
      <div v-else-if="block.content_type === 'quiz'">
        <QuizBuilder :content="local" @update="onQuizUpdate" />
      </div>

      <!-- Knowledge check -->
      <div v-else-if="block.content_type === 'knowledge_check'" class="fields kc">
        <label>Title</label>
        <input v-model="local.title" type="text" @input="emitData" />
        <label>Question</label>
        <textarea v-model="local.question" rows="2" @input="emitData" placeholder="Ask a quick check question" />
        <label>Options</label>
        <div v-for="(opt, i) in local.options" :key="i" class="option-row">
          <input
            type="radio"
            :name="`kc-${block.clientKey}`"
            :checked="Number(local.correctAnswer) === i"
            @change="local.correctAnswer = i; emitData()"
          />
          <input v-model="local.options[i]" type="text" :placeholder="`Option ${i + 1}`" @input="emitData" />
        </div>
        <button type="button" class="link-btn" @click="addOption">+ Add option</button>
        <label>Explanation (shown after answer)</label>
        <textarea v-model="local.explanation" rows="2" @input="emitData" />
      </div>

      <!-- Callout -->
      <div v-else-if="block.content_type === 'callout'" class="fields">
        <label>Style</label>
        <select v-model="local.calloutStyle" @change="emitData">
          <option value="info">Info</option>
          <option value="tip">Tip</option>
          <option value="warning">Warning</option>
          <option value="success">Success</option>
        </select>
        <label>Title</label>
        <input v-model="local.title" type="text" @input="emitData" />
        <label>Content</label>
        <textarea v-model="local.content" rows="3" @input="emitData" />
        <div class="callout-preview" :class="local.calloutStyle">
          <strong>{{ local.title || 'Callout' }}</strong>
          <p>{{ local.content }}</p>
        </div>
      </div>

      <!-- Divider / Spacer -->
      <div v-else-if="block.content_type === 'divider'" class="divider-preview"><hr /></div>
      <div v-else-if="block.content_type === 'spacer'" class="fields">
        <label>Height (px)</label>
        <input v-model.number="local.height" type="number" min="8" max="200" @input="emitData" />
        <div class="spacer-preview" :style="{ height: (local.height || 32) + 'px' }" />
      </div>

      <!-- Acknowledgment -->
      <div v-else-if="block.content_type === 'acknowledgment'" class="fields">
        <label>Title</label>
        <input v-model="local.title" type="text" @input="emitData" />
        <label>Acknowledgment text</label>
        <textarea v-model="local.text" rows="4" @input="emitData" />
        <label class="checkbox">
          <input v-model="local.requireSignature" type="checkbox" @change="emitData" />
          Require signature
        </label>
      </div>

      <!-- Form -->
      <div v-else-if="block.content_type === 'form'" class="fields">
        <p class="hint">Collects user-info fields. Configure category and fields in the settings panel.</p>
        <label>Category key</label>
        <input v-model="local.categoryKey" type="text" placeholder="e.g. personal_info" @input="emitData" />
      </div>

      <!-- Response -->
      <div v-else-if="block.content_type === 'response'" class="fields">
        <label>Prompt</label>
        <textarea v-model="local.prompt" rows="3" @input="emitData" />
        <label>Response type</label>
        <select v-model="local.responseType" @change="emitData">
          <option value="text">Single line</option>
          <option value="textarea">Multi-line</option>
        </select>
      </div>

      <!-- Google Form -->
      <div v-else-if="block.content_type === 'google_form'" class="fields">
        <label>Title</label>
        <input v-model="local.title" type="text" @input="emitData" />
        <label>Google Form URL</label>
        <input v-model="local.formUrl" type="url" @input="emitData" />
      </div>

      <!-- Button -->
      <div v-else-if="block.content_type === 'button'" class="fields">
        <label>Label</label>
        <input v-model="local.label" type="text" @input="emitData" />
        <label>URL</label>
        <input v-model="local.url" type="url" @input="emitData" />
      </div>

      <div v-else class="fields">
        <p class="hint">Unsupported block type: {{ block.content_type }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';
import RichTextEditor from '../RichTextEditor.vue';
import QuizBuilder from '../QuizBuilder.vue';
import { blockTypeLabel } from '../../../utils/trainingBlockTypes.js';

const props = defineProps({
  block: { type: Object, required: true },
  isSelected: { type: Boolean, default: false }
});

const emit = defineEmits(['select', 'update', 'delete', 'duplicate', 'open-media']);

const local = reactive({ ...(props.block.content_data || {}) });
const richTextContent = computed(() => ({ content: local.content || local.textContent || '' }));
let syncingFromParent = false;

watch(
  () => props.block.content_data,
  (next) => {
    // Avoid clobbering in-progress TipTap edits with echo updates from parent
    if (syncingFromParent) return;
    const nextContent = next?.content ?? next?.textContent ?? '';
    const curContent = local.content ?? local.textContent ?? '';
    if (next && JSON.stringify(next) === JSON.stringify({ ...local })) return;
    // Only sync non-content fields if HTML is unchanged; full replace when remote/load
    if (nextContent === curContent) {
      Object.assign(local, next || {});
      return;
    }
    Object.keys(local).forEach((k) => delete local[k]);
    Object.assign(local, next || {});
  },
  { deep: true }
);

function emitData() {
  syncingFromParent = true;
  emit('update', props.block.clientKey, { ...local });
  queueMicrotask(() => { syncingFromParent = false; });
}

function onRichText({ content }) {
  local.content = content;
  local.textContent = content;
  emitData();
}

function onQuizUpdate(data) {
  Object.keys(local).forEach((k) => delete local[k]);
  Object.assign(local, data || {});
  emitData();
}

function addOption() {
  if (!Array.isArray(local.options)) local.options = ['', '', '', ''];
  local.options.push('');
  emitData();
}

function onDocUrl() {
  const url = local.googleUrl || '';
  const docMatch = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (docMatch) local.fileUrl = `https://docs.google.com/document/d/${docMatch[1]}/preview`;
  else if (sheetMatch) local.fileUrl = `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/preview`;
  else local.fileUrl = url;
  emitData();
}

function onSlidesUrl() {
  const url = local.googleSlidesUrl || '';
  const match = url.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
  local.slidesUrl = match
    ? `https://docs.google.com/presentation/d/${match[1]}/preview`
    : url;
  emitData();
}

const embedUrl = computed(() => {
  const url = String(local.videoUrl || '');
  if (!url) return '';
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vim = url.match(/vimeo\.com\/(\d+)/);
  if (vim) return `https://player.vimeo.com/video/${vim[1]}`;
  return url;
});
</script>

<style scoped>
.lesson-block {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 12px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.lesson-block.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 25%, transparent);
}
.block-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-alt);
  border-bottom: 1px solid var(--border);
  border-radius: 10px 10px 0 0;
}
.drag-handle {
  cursor: grab;
  color: var(--text-secondary);
  font-size: 14px;
  letter-spacing: -2px;
  user-select: none;
}
.block-type {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}
.required-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  color: var(--secondary);
  font-weight: 600;
}
.block-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
.icon-btn {
  border: none;
  background: transparent;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 16px;
}
.icon-btn:hover { background: var(--border); color: var(--text-primary); }
.icon-btn.danger:hover { background: color-mix(in srgb, var(--error) 20%, transparent); color: var(--error); }
.block-body { padding: 14px 16px; }
.fields { display: flex; flex-direction: column; gap: 8px; }
.fields label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.fields input[type="text"],
.fields input[type="url"],
.fields input[type="number"],
.fields textarea,
.fields select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
  background: var(--bg);
  color: var(--text-primary);
}
.hint { font-size: 13px; color: var(--text-secondary); }
.url-row { display: flex; gap: 8px; align-items: center; }
.url-row input { flex: 1; min-width: 0; }
.video-preview { aspect-ratio: 16/9; background: #0f172a; border-radius: 8px; overflow: hidden; }
.video-preview iframe { width: 100%; height: 100%; border: 0; }
.image-preview { max-width: 100%; max-height: 220px; border-radius: 8px; object-fit: contain; }
.option-row { display: flex; gap: 8px; align-items: center; }
.option-row input[type="text"] { flex: 1; }
.link-btn {
  align-self: flex-start;
  border: none;
  background: none;
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.callout-preview {
  border-radius: 8px;
  padding: 12px 14px;
  border-left: 4px solid var(--accent);
  background: var(--bg-alt);
}
.callout-preview.tip { border-left-color: var(--success); }
.callout-preview.warning { border-left-color: var(--warning); }
.callout-preview.success { border-left-color: var(--success); }
.divider-preview { padding: 12px 0; }
.spacer-preview { background: repeating-linear-gradient(45deg, var(--bg-alt), var(--bg-alt) 8px, var(--border) 8px, var(--border) 16px); border-radius: 4px; }
.checkbox { display: flex; align-items: center; gap: 8px; font-weight: 500 !important; color: var(--text-primary) !important; }
</style>
