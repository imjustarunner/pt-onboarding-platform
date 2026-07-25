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
        <nav class="spb__side-nav">
          <button type="button" class="is-active">Session</button>
          <span class="spb__side-muted">Slides</span>
        </nav>
        <div class="spb__presenter-card">
          <strong>{{ authStore.user?.firstName }} {{ authStore.user?.lastName }}</strong>
          <span>Presenter</span>
        </div>
        <div class="spb__progress">
          <div class="spb__ring">{{ slides.length ? selectedIndex + 1 : 0 }} / {{ slides.length }}</div>
          <button type="button" class="spb__link" @click="activeTab = 'slides'">Reorder slides</button>
        </div>
      </aside>

      <main class="spb__main">
        <div class="spb__tabs">
          <button type="button" :class="{ active: activeTab === 'slides' }" @click="activeTab = 'slides'">Slides</button>
          <button type="button" :class="{ active: activeTab === 'notes' }" @click="activeTab = 'notes'">Presenter Notes</button>
          <button type="button" :class="{ active: activeTab === 'case' }" @click="activeTab = 'case'">Case Summary</button>
          <button type="button" :class="{ active: activeTab === 'attachments' }" @click="activeTab = 'attachments'">Attachments</button>
        </div>

        <div v-if="activeTab === 'slides'" class="spb__workspace">
          <section class="spb__slide-list">
            <button type="button" class="btn btn-primary btn-sm spb__add" @click="addSlide">+ Add slide</button>
            <ul>
              <li
                v-for="(slide, idx) in slides"
                :key="slide.id"
                :class="{ selected: Number(slide.id) === Number(selectedSlideId) }"
                @click="selectSlide(slide.id)"
              >
                <span class="spb__drag">⋮⋮</span>
                <span class="spb__num">{{ idx + 1 }}</span>
                <span class="spb__slide-title">{{ slide.title || 'Untitled' }}</span>
              </li>
            </ul>
          </section>

          <section v-if="selectedSlide" class="spb__editor">
            <div class="spb__editor-head">
              <strong>Slide {{ selectedIndex + 1 }} of {{ slides.length }}</strong>
              <div class="spb__nav-btns">
                <button type="button" class="btn btn-secondary btn-sm" :disabled="selectedIndex <= 0" @click="selectSlide(slides[selectedIndex - 1]?.id)">←</button>
                <button type="button" class="btn btn-secondary btn-sm" :disabled="selectedIndex >= slides.length - 1" @click="selectSlide(slides[selectedIndex + 1]?.id)">→</button>
              </div>
            </div>
            <label class="spb__field">
              <span>Slide Title</span>
              <input v-model="draft.title" type="text" class="input" @change="saveSlide" />
            </label>
            <label class="spb__field">
              <span>Slide Content</span>
              <textarea v-model="draft.bodyHtml" class="input spb__textarea" rows="12" @change="saveSlide" />
            </label>
            <label class="spb__field">
              <span>Slide Notes <em>(visible only to you)</em></span>
              <textarea v-model="draft.presenterNotes" class="input" rows="4" @change="saveSlide" />
            </label>
            <div class="spb__editor-actions">
              <button type="button" class="btn btn-danger btn-sm" @click="removeSlide">Delete slide</button>
              <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="saveSlide">
                {{ saving ? 'Saving…' : 'Save changes' }}
              </button>
            </div>
          </section>

          <section class="spb__preview">
            <div class="spb__preview-card" :style="previewStyle">
              <h2>{{ draft.title || 'Untitled' }}</h2>
              <div class="spb__preview-body" v-html="previewHtml" />
            </div>
            <label class="spb__field">
              <span>Layout</span>
              <select v-model="draft.layout" class="input" @change="saveSlide">
                <option value="text">Text</option>
                <option value="text_image">Text + image</option>
                <option value="title">Title</option>
              </select>
            </label>
            <label class="spb__field">
              <span>Background</span>
              <select v-model="draft.background" class="input" @change="saveSlide">
                <option :value="null">Default</option>
                <option value="brand">Brand primary</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
          </section>
        </div>

        <div v-else-if="activeTab === 'notes'" class="spb__panel">
          <h3>All presenter notes</h3>
          <div v-for="slide in slides" :key="`note-${slide.id}`" class="spb__note-block">
            <strong>{{ slide.title }}</strong>
            <p>{{ slide.presenter_notes || 'No notes yet.' }}</p>
          </div>
        </div>

        <div v-else-if="activeTab === 'case'" class="spb__panel">
          <h3>Case at a glance</h3>
          <div class="spb__case-grid">
            <label class="spb__field">
              <span>Client</span>
              <input v-model="caseSummary.client" class="input" @change="saveCaseSummary" />
            </label>
            <label class="spb__field">
              <span>Presenting concerns</span>
              <input v-model="caseSummary.presentingConcerns" class="input" @change="saveCaseSummary" />
            </label>
            <label class="spb__field">
              <span>Duration of treatment</span>
              <input v-model="caseSummary.duration" class="input" @change="saveCaseSummary" />
            </label>
            <label class="spb__field">
              <span>Setting</span>
              <input v-model="caseSummary.setting" class="input" @change="saveCaseSummary" />
            </label>
          </div>
        </div>

        <div v-else class="spb__panel">
          <h3>Upload or link a deck</h3>
          <p class="hint">Use the in-app template, or replace the live stage with a PowerPoint/PDF upload or Google Slides link.</p>
          <div class="spb__attach-row">
            <input ref="fileInput" type="file" accept=".ppt,.pptx,.pdf,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" @change="onFileSelected" />
            <button type="button" class="btn btn-primary btn-sm" :disabled="uploading" @click="triggerUpload">
              {{ uploading ? 'Uploading…' : 'Upload PowerPoint / PDF' }}
            </button>
          </div>
          <div class="spb__attach-row">
            <input v-model="externalUrl" type="url" class="input" placeholder="https://docs.google.com/presentation/..." />
            <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="saveExternalLink">Save Google Slides link</button>
          </div>
          <p v-if="presentation.sourceType !== 'templated'" class="spb__attach-status">
            Source: {{ presentation.sourceType }}
            <span v-if="presentation.originalFilename"> · {{ presentation.originalFilename }}</span>
            <span v-if="presentation.externalUrl"> · <a :href="presentation.externalUrl" target="_blank" rel="noopener">Open link</a></span>
          </p>
          <button
            v-if="presentation.sourceType !== 'templated'"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="revertToTemplate"
          >
            Use templated slides instead
          </button>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const sessionId = computed(() => route.params.sessionId);
const loading = ref(true);
const saving = ref(false);
const uploading = ref(false);
const error = ref('');
const saveStatus = ref('');
const presentation = ref(null);
const slides = ref([]);
const selectedSlideId = ref(null);
const activeTab = ref('slides');
const externalUrl = ref('');
const fileInput = ref(null);
const sessionMeta = ref('');
const caseSummary = reactive({
  client: '',
  presentingConcerns: '',
  duration: '',
  setting: ''
});
const draft = reactive({
  title: '',
  bodyHtml: '',
  presenterNotes: '',
  layout: 'text',
  background: null
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
const previewHtml = computed(() => {
  const raw = String(draft.bodyHtml || '');
  if (raw.includes('<')) return raw;
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith('•') || line.startsWith('-') ? `<li>${line.replace(/^[-•]\s*/, '')}</li>` : `<p>${line}</p>`))
    .join('')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
});
const previewStyle = computed(() => {
  if (draft.background === 'brand') {
    return { background: 'linear-gradient(135deg, var(--agency-primary-color, var(--primary)), var(--agency-secondary-color, var(--secondary)))', color: '#fff' };
  }
  if (draft.background === 'dark') return { background: '#1a1f2b', color: '#f4f6fb' };
  if (draft.background === 'light') return { background: '#f7f8fb', color: '#1a1f2b' };
  return {};
});

function goBack() {
  router.back();
}

function selectSlide(id) {
  selectedSlideId.value = id;
  const slide = slides.value.find((s) => Number(s.id) === Number(id));
  if (!slide) return;
  draft.title = slide.title || '';
  draft.bodyHtml = slide.body_html || '';
  draft.presenterNotes = slide.presenter_notes || '';
  draft.layout = slide.layout || 'text';
  draft.background = slide.background || null;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/supervision/sessions/${sessionId.value}/presentations/mine`);
    presentation.value = data.presentation;
    slides.value = data.presentation?.slides || [];
    externalUrl.value = data.presentation?.externalUrl || '';
    const cs = data.presentation?.caseSummary || {};
    caseSummary.client = cs.client || '';
    caseSummary.presentingConcerns = cs.presentingConcerns || '';
    caseSummary.duration = cs.duration || '';
    caseSummary.setting = cs.setting || '';
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
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.patch(`/supervision/presentation-slides/${selectedSlide.value.id}`, {
      title: draft.title,
      bodyHtml: draft.bodyHtml,
      presenterNotes: draft.presenterNotes,
      layout: draft.layout,
      background: draft.background
    });
    const idx = slides.value.findIndex((s) => Number(s.id) === Number(selectedSlide.value.id));
    if (idx >= 0) slides.value[idx] = data.slide;
    saveStatus.value = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save slide';
  } finally {
    saving.value = false;
  }
}

async function addSlide() {
  if (!presentation.value?.id) return;
  try {
    const { data } = await api.post(`/supervision/presentations/${presentation.value.id}/slides`, {
      title: 'New slide',
      bodyHtml: '',
      presenterNotes: ''
    });
    slides.value.push(data.slide);
    selectSlide(data.slide.id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to add slide';
  }
}

async function removeSlide() {
  if (!selectedSlide.value) return;
  if (!window.confirm('Delete this slide?')) return;
  try {
    await api.delete(`/supervision/presentation-slides/${selectedSlide.value.id}`);
    slides.value = slides.value.filter((s) => Number(s.id) !== Number(selectedSlide.value.id));
    if (slides.value.length) selectSlide(slides.value[0].id);
    else selectedSlideId.value = null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to delete slide';
  }
}

async function saveCaseSummary() {
  if (!presentation.value?.id) return;
  saving.value = true;
  try {
    const { data } = await api.patch(`/supervision/presentations/${presentation.value.id}`, {
      caseSummary: { ...caseSummary }
    });
    presentation.value = { ...presentation.value, ...data.presentation, slides: slides.value };
    saveStatus.value = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save case summary';
  } finally {
    saving.value = false;
  }
}

function triggerUpload() {
  fileInput.value?.click();
}

async function onFileSelected(ev) {
  const file = ev.target?.files?.[0];
  if (!file || !presentation.value?.id) return;
  uploading.value = true;
  error.value = '';
  try {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post(`/supervision/presentations/${presentation.value.id}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    presentation.value = { ...presentation.value, ...data.presentation, slides: slides.value };
    saveStatus.value = 'Upload saved';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Upload failed';
  } finally {
    uploading.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}

async function saveExternalLink() {
  if (!presentation.value?.id || !externalUrl.value.trim()) return;
  saving.value = true;
  try {
    const { data } = await api.post(`/supervision/presentations/${presentation.value.id}/external-link`, {
      externalUrl: externalUrl.value.trim()
    });
    presentation.value = { ...presentation.value, ...data.presentation, slides: slides.value };
    saveStatus.value = 'Link saved';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save link';
  } finally {
    saving.value = false;
  }
}

async function revertToTemplate() {
  if (!presentation.value?.id) return;
  saving.value = true;
  try {
    const { data } = await api.patch(`/supervision/presentations/${presentation.value.id}`, {
      sourceType: 'templated',
      externalUrl: null,
      status: 'draft'
    });
    presentation.value = { ...presentation.value, ...data.presentation, slides: slides.value };
    externalUrl.value = '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to revert';
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
.spb__side-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.spb__side-nav button {
  text-align: left;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 8px 10px;
  border-radius: 8px;
}
.spb__side-nav button.is-active {
  background: color-mix(in srgb, var(--agency-primary-color, var(--primary)) 25%, transparent);
  color: #fff;
}
.spb__presenter-card, .spb__progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
.spb__link {
  background: none;
  border: 0;
  color: var(--agency-primary-color, var(--primary));
  text-align: left;
  cursor: pointer;
  padding: 0;
}
.spb__main {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px;
}
.spb__tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.spb__tabs button {
  background: none;
  border: 0;
  color: #aab3c5;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.spb__tabs button.active {
  color: #fff;
  border-bottom-color: var(--agency-primary-color, var(--primary));
}
.spb__workspace {
  display: grid;
  grid-template-columns: 240px 1fr 280px;
  gap: 14px;
}
.spb__slide-list ul {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 70vh;
  overflow: auto;
}
.spb__slide-list li {
  display: grid;
  grid-template-columns: auto auto 1fr;
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
.spb__textarea {
  min-height: 220px;
  resize: vertical;
}
.spb__editor-head, .spb__editor-actions, .spb__attach-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.spb__preview-card {
  border-radius: 12px;
  padding: 18px;
  min-height: 220px;
  background: #151a24;
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}
.spb__preview-card h2 {
  margin: 0 0 10px;
  font-size: 1.15rem;
}
.spb__preview-body :deep(ul) {
  margin: 0;
  padding-left: 1.1rem;
}
.spb__case-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.spb__note-block {
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.spb__add { width: 100%; }
.input {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: inherit;
  border-radius: 8px;
  padding: 8px 10px;
}
@media (max-width: 1100px) {
  .spb__body, .spb__workspace, .spb__case-grid {
    grid-template-columns: 1fr;
  }
}
</style>
