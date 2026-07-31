<template>
  <div class="spc" data-testid="supervision-presenter-case-panel">
    <div class="spc-head">
      <h3 class="spc-title">Case presentation</h3>
      <p class="spc-sub muted">
        Work through each case conceptualization section with text, bullets, bold, and italic.
        Only assigned presenters can edit this.
      </p>
    </div>

    <div v-if="loading" class="muted">Loading presentation…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!presentationId" class="muted">
      No presentation is available for you on this session yet. Ask the facilitator to assign you as a presenter.
    </div>
    <div v-else class="spc-body">
      <p v-if="saveStatus" class="spc-save muted">{{ saveStatus }}</p>

      <label class="spc-field">
        <span>Section</span>
        <select v-model.number="slideId" class="input" :disabled="saving" @change="onSlideChange">
          <option v-for="slide in slides" :key="slide.id" :value="Number(slide.id)">
            {{ slide.title }}
          </option>
        </select>
      </label>

      <div class="spc-field">
        <span>Section content</span>
        <div class="spc-toolbar" role="toolbar" aria-label="Text formatting">
          <button type="button" class="spc-tool" title="Bold" @mousedown.prevent="applyFormat('bold')"><strong>B</strong></button>
          <button type="button" class="spc-tool" title="Italic" @mousedown.prevent="applyFormat('italic')"><em>I</em></button>
          <button type="button" class="spc-tool" title="Bullet list" @mousedown.prevent="applyFormat('insertUnorderedList')">• List</button>
        </div>
        <div
          ref="bodyEditor"
          class="input spc-richtext"
          contenteditable="true"
          role="textbox"
          aria-multiline="true"
          data-placeholder="Write your case content for this section…"
          :contenteditable="!saving"
          @input="onBodyInput"
        />
      </div>

      <label class="spc-field">
        <span>Presenter notes <em>(only you see these)</em></span>
        <textarea
          v-model="draft.presenterNotes"
          class="input"
          rows="3"
          :disabled="saving"
          @change="saveSlide"
        />
      </label>

      <div class="spc-actions">
        <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="saveSlide">
          {{ saving ? 'Saving…' : 'Save section' }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="$emit('open-full-builder')">
          Open full slide builder
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  sessionId: { type: [Number, String], default: 0 }
});
defineEmits(['open-full-builder']);

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const saveStatus = ref('');
const presentationId = ref(0);
const slides = ref([]);
const slideId = ref(0);
const bodyEditor = ref(null);
const draft = reactive({
  bodyHtml: '',
  presenterNotes: ''
});

function syncBodyEditor() {
  const el = bodyEditor.value;
  if (!el) return;
  const html = String(draft.bodyHtml || '');
  if (el.innerHTML !== html) el.innerHTML = html;
}

function onBodyInput() {
  draft.bodyHtml = bodyEditor.value?.innerHTML || '';
}

function applyFormat(command) {
  const el = bodyEditor.value;
  if (!el || saving.value) return;
  el.focus();
  try {
    document.execCommand(command, false, null);
  } catch {
    // ignore
  }
  draft.bodyHtml = el.innerHTML || '';
}

function loadSlideDraft(id) {
  const slide = slides.value.find((s) => Number(s.id) === Number(id));
  if (!slide) return;
  draft.bodyHtml = String(slide.body_html || slide.bodyHtml || '');
  draft.presenterNotes = String(slide.presenter_notes || slide.presenterNotes || '');
  nextTick(syncBodyEditor);
}

function onSlideChange() {
  loadSlideDraft(slideId.value);
}

async function load() {
  const sid = Number(props.sessionId || 0);
  if (!sid) {
    presentationId.value = 0;
    slides.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/supervision/sessions/${sid}/presentations/mine`, {
      skipGlobalLoading: true
    });
    const presentation = data?.presentation || null;
    presentationId.value = Number(presentation?.id || 0);
    slides.value = Array.isArray(presentation?.slides) ? presentation.slides : [];
    slideId.value = Number(slides.value[0]?.id || 0);
    if (slideId.value) loadSlideDraft(slideId.value);
  } catch (e) {
    presentationId.value = 0;
    slides.value = [];
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load presentation';
  } finally {
    loading.value = false;
  }
}

async function saveSlide() {
  if (!presentationId.value || !slideId.value) return;
  onBodyInput();
  saving.value = true;
  error.value = '';
  try {
    const slide = slides.value.find((s) => Number(s.id) === Number(slideId.value));
    await api.patch(`/supervision/presentation-slides/${slideId.value}`, {
      title: slide?.title,
      bodyHtml: draft.bodyHtml,
      presenterNotes: draft.presenterNotes,
      layout: 'text',
      background: null
    });
    saveStatus.value = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save section';
  } finally {
    saving.value = false;
  }
}

watch(() => Number(props.sessionId || 0), () => { void load(); });
onMounted(() => { void load(); });
</script>

<style scoped>
.spc { display: flex; flex-direction: column; gap: 12px; }
.spc-title { margin: 0; font-size: 1rem; font-weight: 800; color: #0f172a; }
.spc-sub { margin: 2px 0 0; font-size: 0.82rem; }
.spc-body { display: flex; flex-direction: column; gap: 12px; }
.spc-save { margin: 0; font-size: 0.78rem; font-weight: 600; }
.spc-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}
.spc-field em { font-weight: 500; color: #94a3b8; }
.spc-toolbar {
  display: flex;
  gap: 6px;
}
.spc-tool {
  min-width: 32px;
  height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #0f172a;
  cursor: pointer;
  font-size: 0.82rem;
}
.spc-richtext {
  min-height: 160px;
  resize: vertical;
  overflow: auto;
  line-height: 1.45;
  font-weight: 400;
}
.spc-richtext:empty::before {
  content: attr(data-placeholder);
  color: #94a3b8;
  pointer-events: none;
}
.spc-richtext:focus {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
}
.spc-richtext :deep(ul) {
  margin: 0.4em 0;
  padding-left: 1.2rem;
}
.spc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.error { color: #b91c1c; font-size: 0.85rem; }
.muted { color: #64748b; }
</style>
