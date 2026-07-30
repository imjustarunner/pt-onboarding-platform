<template>
  <div class="spc" data-testid="supervision-presenter-case-panel">
    <div class="spc-head">
      <h3 class="spc-title">Case presentation</h3>
      <p class="spc-sub muted">
        Add the client background and case notes that appear on the Group Supervision stage.
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
        <span>Slide title</span>
        <input v-model="draft.title" class="input" type="text" :disabled="saving" @change="saveSlide" />
      </label>

      <label class="spc-field">
        <span>Client background / content</span>
        <textarea
          v-model="draft.bodyHtml"
          class="input spc-textarea"
          rows="10"
          :disabled="saving"
          placeholder="Write the case background and talking points for the live stage…"
          @change="saveSlide"
        />
      </label>

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

      <div class="spc-grid">
        <label class="spc-field">
          <span>Client</span>
          <input v-model="caseSummary.client" class="input" :disabled="saving" @change="saveCaseSummary" />
        </label>
        <label class="spc-field">
          <span>Presenting concerns</span>
          <input v-model="caseSummary.presentingConcerns" class="input" :disabled="saving" @change="saveCaseSummary" />
        </label>
        <label class="spc-field">
          <span>Duration</span>
          <input v-model="caseSummary.duration" class="input" :disabled="saving" @change="saveCaseSummary" />
        </label>
        <label class="spc-field">
          <span>Setting</span>
          <input v-model="caseSummary.setting" class="input" :disabled="saving" @change="saveCaseSummary" />
        </label>
      </div>

      <div class="spc-actions">
        <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="saveAll">
          {{ saving ? 'Saving…' : 'Save case content' }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="$emit('open-full-builder')">
          Open full slide builder
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
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
const slideId = ref(0);
const draft = reactive({
  title: 'Client Background',
  bodyHtml: '',
  presenterNotes: ''
});
const caseSummary = reactive({
  client: '',
  presentingConcerns: '',
  duration: '',
  setting: ''
});

async function load() {
  const sid = Number(props.sessionId || 0);
  if (!sid) {
    presentationId.value = 0;
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
    const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
    const first = slides[0] || null;
    slideId.value = Number(first?.id || 0);
    draft.title = String(first?.title || 'Client Background');
    draft.bodyHtml = String(first?.body_html || first?.bodyHtml || '');
    draft.presenterNotes = String(first?.presenter_notes || first?.presenterNotes || '');
    const cs = presentation?.caseSummary || {};
    caseSummary.client = String(cs.client || '');
    caseSummary.presentingConcerns = String(cs.presentingConcerns || '');
    caseSummary.duration = String(cs.duration || '');
    caseSummary.setting = String(cs.setting || '');
  } catch (e) {
    presentationId.value = 0;
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load presentation';
  } finally {
    loading.value = false;
  }
}

async function ensureSlide() {
  if (slideId.value || !presentationId.value) return slideId.value;
  const { data } = await api.post(`/supervision/presentations/${presentationId.value}/slides`, {
    title: draft.title || 'Client Background',
    bodyHtml: draft.bodyHtml || '',
    presenterNotes: draft.presenterNotes || ''
  });
  slideId.value = Number(data?.slide?.id || 0);
  return slideId.value;
}

async function saveSlide() {
  if (!presentationId.value) return;
  saving.value = true;
  error.value = '';
  try {
    const id = await ensureSlide();
    if (!id) throw new Error('Could not create slide');
    await api.patch(`/supervision/presentation-slides/${id}`, {
      title: draft.title,
      bodyHtml: draft.bodyHtml,
      presenterNotes: draft.presenterNotes
    });
    saveStatus.value = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save slide';
  } finally {
    saving.value = false;
  }
}

async function saveCaseSummary() {
  if (!presentationId.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.patch(`/supervision/presentations/${presentationId.value}`, {
      caseSummary: { ...caseSummary }
    });
    saveStatus.value = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save case summary';
  } finally {
    saving.value = false;
  }
}

async function saveAll() {
  await saveSlide();
  await saveCaseSummary();
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
.spc-textarea { min-height: 160px; resize: vertical; }
.spc-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.spc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.error { color: #b91c1c; font-size: 0.85rem; }
.muted { color: #64748b; }
@media (max-width: 640px) {
  .spc-grid { grid-template-columns: 1fr; }
}
</style>
