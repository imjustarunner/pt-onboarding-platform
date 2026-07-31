<template>
  <div class="spb">
    <header class="spb__header">
      <div class="spb__header-left">
        <button type="button" class="spb__back" @click="goBack">← Back</button>
        <div>
          <h1>Edit Case Presentation</h1>
          <p class="spb__meta">
            Group Supervision
            <span v-if="sessionMeta"> · {{ sessionMeta }}</span>
            <span v-if="saveStatus" class="spb__save"> · {{ saveStatus }}</span>
          </p>
        </div>
      </div>
      <div class="spb__header-right">
        <router-link
          v-if="sessionId"
          class="btn btn-secondary btn-sm"
          :to="joinRoute"
        >
          View as attendee
        </router-link>
      </div>
    </header>

    <p v-if="error" class="spb__error">{{ error }}</p>
    <div v-if="loading" class="spb__loading">Loading presentation…</div>

    <div v-else-if="presentation" class="spb__body">
      <aside class="spb__nav">
        <div class="spb__presenter-card">
          <strong>{{ authStore.user?.firstName }} {{ authStore.user?.lastName }}</strong>
          <span>Presenter</span>
        </div>
        <div class="spb__progress">
          <div class="spb__ring">{{ slides.length ? selectedIndex + 1 : 0 }} / {{ slides.length }}</div>
          <span class="spb__side-muted">Case conceptualization sections</span>
        </div>
      </aside>

      <main class="spb__main">
        <p class="spb__intro hint">
          Fill in each section with your case content. Use bold, italic, and bullets as needed.
          Slide titles are fixed for now; deck uploads and images will come later.
        </p>

        <div class="spb__workspace">
          <section class="spb__slide-list">
            <ul>
              <li
                v-for="(slide, idx) in slides"
                :key="slide.id"
                :class="{ selected: Number(slide.id) === Number(selectedSlideId) }"
                @click="selectSlide(slide.id)"
              >
                <span class="spb__num">{{ idx + 1 }}</span>
                <span class="spb__slide-title">{{ slide.title || 'Untitled' }}</span>
              </li>
            </ul>
          </section>

          <section v-if="selectedSlide" class="spb__editor">
            <div class="spb__editor-head">
              <strong>Section {{ selectedIndex + 1 }} of {{ slides.length }}</strong>
              <div class="spb__nav-btns">
                <button type="button" class="btn btn-secondary btn-sm" :disabled="selectedIndex <= 0" @click="selectSlide(slides[selectedIndex - 1]?.id)">←</button>
                <button type="button" class="btn btn-secondary btn-sm" :disabled="selectedIndex >= slides.length - 1" @click="selectSlide(slides[selectedIndex + 1]?.id)">→</button>
              </div>
            </div>

            <div class="spb__field">
              <span>Section title</span>
              <div class="spb__title-readonly">{{ draft.title || 'Untitled' }}</div>
            </div>

            <div class="spb__field">
              <span>Section content</span>
              <div class="spb__toolbar" role="toolbar" aria-label="Text formatting">
                <button type="button" class="spb__tool" title="Bold" @mousedown.prevent="applyFormat('bold')"><strong>B</strong></button>
                <button type="button" class="spb__tool" title="Italic" @mousedown.prevent="applyFormat('italic')"><em>I</em></button>
                <button type="button" class="spb__tool" title="Bullet list" @mousedown.prevent="applyFormat('insertUnorderedList')">• List</button>
              </div>
              <div
                ref="bodyEditor"
                class="input spb__richtext"
                contenteditable="true"
                role="textbox"
                aria-multiline="true"
                data-placeholder="Write your case content here…"
                @input="onBodyInput"
              />
            </div>

            <label class="spb__field">
              <span>Presenter notes <em>(visible only to you)</em></span>
              <textarea v-model="draft.presenterNotes" class="input" rows="4" @change="saveSlide" />
            </label>

            <div class="spb__editor-actions">
              <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="saveSlide">
                {{ saving ? 'Saving…' : 'Save section' }}
              </button>
            </div>
          </section>

          <section class="spb__preview">
            <div class="spb__preview-label">Live preview</div>
            <div class="spb__preview-card">
              <h2>{{ draft.title || 'Untitled' }}</h2>
              <div class="spb__preview-body" v-html="previewHtml" />
            </div>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const sessionId = computed(() => route.params.sessionId);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const saveStatus = ref('');
const presentation = ref(null);
const slides = ref([]);
const selectedSlideId = ref(null);
const sessionMeta = ref('');
const bodyEditor = ref(null);
const draft = reactive({
  title: '',
  bodyHtml: '',
  presenterNotes: ''
});

const selectedSlide = computed(() => slides.value.find((s) => Number(s.id) === Number(selectedSlideId.value)) || null);
const selectedIndex = computed(() => slides.value.findIndex((s) => Number(s.id) === Number(selectedSlideId.value)));
const joinRoute = computed(() => {
  const slug = String(route.params.organizationSlug || '').trim();
  if (slug) {
    return {
      name: 'OrganizationJoinSupervision',
      params: { organizationSlug: slug, sessionId: sessionId.value }
    };
  }
  return {
    name: 'JoinSupervision',
    params: { sessionId: sessionId.value }
  };
});

function plainTextToPreviewHtml(raw) {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith('•') || line.startsWith('-') ? `<li>${line.replace(/^[-•]\s*/, '')}</li>` : `<p>${line}</p>`))
    .join('')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
}

const previewHtml = computed(() => {
  const raw = String(draft.bodyHtml || '');
  if (raw.includes('<')) return raw;
  return plainTextToPreviewHtml(raw);
});

function goBack() {
  router.back();
}

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
  if (!el) return;
  el.focus();
  try {
    document.execCommand(command, false, null);
  } catch {
    // ignore unsupported commands
  }
  draft.bodyHtml = el.innerHTML || '';
}

function selectSlide(id) {
  selectedSlideId.value = id;
  const slide = slides.value.find((s) => Number(s.id) === Number(id));
  if (!slide) return;
  draft.title = slide.title || '';
  draft.bodyHtml = slide.body_html || '';
  draft.presenterNotes = slide.presenter_notes || '';
  nextTick(syncBodyEditor);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/supervision/sessions/${sessionId.value}/presentations/mine`);
    presentation.value = data.presentation;
    slides.value = data.presentation?.slides || [];
    if (slides.value.length) selectSlide(slides.value[0].id);
    sessionMeta.value = `Session #${sessionId.value}`;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load presentation';
  } finally {
    loading.value = false;
  }
}

async function saveSlide() {
  if (!selectedSlide.value) return;
  onBodyInput();
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.patch(`/supervision/presentation-slides/${selectedSlide.value.id}`, {
      title: draft.title,
      bodyHtml: draft.bodyHtml,
      presenterNotes: draft.presenterNotes,
      layout: 'text',
      background: null
    });
    const idx = slides.value.findIndex((s) => Number(s.id) === Number(selectedSlide.value.id));
    if (idx >= 0) slides.value[idx] = data.slide;
    saveStatus.value = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save section';
  } finally {
    saving.value = false;
  }
}

watch(sessionId, () => load());
onMounted(load);
</script>

<style scoped>
.spb {
  min-height: 100vh;
  background: linear-gradient(180deg, color-mix(in srgb, var(--agency-secondary-color, var(--secondary)) 92%, #000), #0f1219);
  color: #eef1f7;
  padding: 16px 20px 40px;
}
.spb__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.spb__header h1 {
  margin: 0;
  font-size: 1.35rem;
}
.spb__meta, .spb__save, .hint, .spb__side-muted {
  color: #aab3c5;
  font-size: 0.85rem;
}
.spb__intro {
  margin: 0 0 14px;
  line-height: 1.45;
}
.spb__back {
  background: transparent;
  border: 0;
  color: var(--agency-primary-color, var(--primary));
  cursor: pointer;
  margin-bottom: 6px;
}
.spb__error {
  background: rgba(220, 60, 60, 0.15);
  border: 1px solid rgba(220, 60, 60, 0.4);
  padding: 10px 12px;
  border-radius: 8px;
}
.spb__body {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
}
.spb__nav {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px;
}
.spb__presenter-card, .spb__progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.spb__progress {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.spb__ring {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 3px solid var(--agency-primary-color, var(--primary));
  display: grid;
  place-items: center;
  font-weight: 600;
}
.spb__main {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px;
}
.spb__workspace {
  display: grid;
  grid-template-columns: 240px 1fr 280px;
  gap: 14px;
}
.spb__slide-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 70vh;
  overflow: auto;
}
.spb__slide-list li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.03);
}
.spb__slide-list li.selected {
  outline: 1px solid var(--agency-primary-color, var(--primary));
  background: color-mix(in srgb, var(--agency-primary-color, var(--primary)) 18%, transparent);
}
.spb__num {
  opacity: 0.7;
  font-size: 0.8rem;
}
.spb__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.spb__field em {
  font-style: normal;
  opacity: 0.7;
  font-size: 0.85em;
}
.spb__title-readonly {
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 600;
}
.spb__toolbar {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}
.spb__tool {
  min-width: 34px;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
  cursor: pointer;
  font-size: 0.85rem;
}
.spb__tool:hover {
  background: rgba(255, 255, 255, 0.08);
}
.spb__richtext {
  min-height: 220px;
  resize: vertical;
  overflow: auto;
  line-height: 1.45;
}
.spb__richtext:empty::before {
  content: attr(data-placeholder);
  color: #8b95a8;
  pointer-events: none;
}
.spb__richtext:focus {
  outline: 2px solid color-mix(in srgb, var(--agency-primary-color, var(--primary)) 55%, transparent);
  outline-offset: 1px;
}
.spb__richtext :deep(ul) {
  margin: 0.4em 0;
  padding-left: 1.2rem;
}
.spb__editor-head, .spb__editor-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.spb__preview-label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #aab3c5;
  margin-bottom: 8px;
}
.spb__preview-card {
  border-radius: 12px;
  padding: 18px;
  min-height: 220px;
  background: #151a24;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.spb__preview-card h2 {
  margin: 0 0 10px;
  font-size: 1.15rem;
  color: var(--agency-primary-color, var(--primary));
}
.spb__preview-body :deep(ul) {
  margin: 0;
  padding-left: 1.1rem;
}
.spb__preview-body :deep(p) {
  margin: 0 0 0.5em;
}
.input {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: inherit;
  border-radius: 8px;
  padding: 8px 10px;
}
@media (max-width: 1100px) {
  .spb__body, .spb__workspace {
    grid-template-columns: 1fr;
  }
}
</style>
