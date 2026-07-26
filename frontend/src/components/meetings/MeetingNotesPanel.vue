<template>
  <div class="mnp" data-testid="meeting-notes-panel">
    <div class="mnp__head">
      <h4>Meeting transcript</h4>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="load">Refresh</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <label class="mnp__label">Transcript</label>
    <textarea
      v-model="transcript"
      class="mnp__textarea"
      rows="8"
      :disabled="loading || saving"
      placeholder="Meeting transcript…"
    />
    <div class="mnp__actions">
      <button type="button" class="btn btn-primary btn-sm" :disabled="loading || saving || !transcript.trim()" @click="save">
        {{ saving ? 'Saving…' : 'Save & summarize' }}
      </button>
    </div>
    <label class="mnp__label">Summary</label>
    <div class="mnp__summary" v-html="summaryHtml"></div>
    <p v-if="!summary && !loading" class="muted">No summary yet. Save a transcript to generate one.</p>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  eventId: { type: [Number, String], required: true }
});

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const transcript = ref('');
const summary = ref('');

const summaryHtml = computed(() => {
  const s = String(summary.value || '').trim();
  if (!s) return '';
  // Plain text with line breaks — escape HTML.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
});

async function load() {
  const eid = Number(props.eventId || 0);
  if (!eid) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/team-meetings/${eid}/notes`, { skipGlobalLoading: true });
    transcript.value = String(data?.transcript || '');
    summary.value = String(data?.summary || '');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load notes';
  } finally {
    loading.value = false;
  }
}

async function save() {
  const eid = Number(props.eventId || 0);
  const text = String(transcript.value || '').trim();
  if (!eid || !text) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/team-meetings/${eid}/client-transcript`, { transcript: text }, { skipGlobalLoading: true });
    // Reload after a short delay so AI summary can land.
    setTimeout(() => { load(); }, 1200);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save transcript';
  } finally {
    saving.value = false;
  }
}

watch(() => props.eventId, () => load());
onMounted(load);

defineExpose({ load });
</script>

<style scoped>
.mnp { display: flex; flex-direction: column; gap: 8px; }
.mnp__head { display: flex; justify-content: space-between; align-items: center; }
.mnp__head h4 { margin: 0; font-size: 0.95rem; }
.mnp__label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.mnp__textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  resize: vertical;
  min-height: 120px;
}
.mnp__actions { display: flex; gap: 8px; }
.mnp__summary {
  font-size: 0.9rem;
  line-height: 1.45;
  color: #334155;
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px;
  min-height: 48px;
}
.error { color: #b91c1c; margin: 0; font-size: 0.85rem; }
.muted { color: #64748b; margin: 0; font-size: 0.85rem; }
</style>
