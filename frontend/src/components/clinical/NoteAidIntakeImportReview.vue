<template>
  <div v-if="open" class="na-modal-backdrop" @click.self="emit('close')">
    <div class="na-modal na-modal--wide" role="dialog" aria-labelledby="na-intake-import-title">
      <header class="na-modal-head">
        <h3 id="na-intake-import-title">Review imported intake</h3>
        <button type="button" class="na-link-btn" @click="emit('close')">Close</button>
      </header>

      <label class="na-label">
        Paste intake text
        <textarea v-model="pasteText" class="na-textarea" rows="5" placeholder="Paste intake note…" />
      </label>
      <div class="na-modal-actions" style="justify-content: flex-start;">
        <button type="button" class="na-btn-outline" :disabled="importing || !pasteText.trim()" @click="doImport">
          {{ importing ? 'Importing…' : 'Parse &amp; create draft' }}
        </button>
      </div>

      <template v-if="draftId && sections.length">
        <div v-for="(sec, si) in sections" :key="sec.key + '-' + si" class="na-import-card">
          <div class="na-import-row">
            <input v-model="sec.label" class="na-input" placeholder="Section title" />
            <button type="button" class="na-link-btn" :disabled="si === 0" @click="moveSection(si, -1)">↑</button>
            <button type="button" class="na-link-btn" :disabled="si >= sections.length - 1" @click="moveSection(si, 1)">↓</button>
            <button type="button" class="na-link-btn" @click="sections.splice(si, 1)">Remove</button>
          </div>
          <textarea v-model="sec.body" class="na-textarea" rows="3" />
        </div>

        <div class="na-import-card">
          <strong>Diagnosis</strong>
          <div class="na-import-row">
            <input v-model="diagnosis.code" class="na-input" placeholder="ICD-10" />
            <input v-model="diagnosis.description" class="na-input" placeholder="Description" />
          </div>
          <textarea v-model="diagnosis.justification" class="na-textarea" rows="2" placeholder="Justification" />
        </div>

        <p v-if="error" class="error">{{ error }}</p>
        <div class="na-modal-actions">
          <button type="button" class="na-btn-outline" :disabled="saving" @click="saveSections">
            {{ saving ? 'Saving…' : 'Save sections' }}
          </button>
          <button type="button" class="na-btn-primary" :disabled="finalizing || !diagnosis.code" @click="finalize">
            {{ finalizing ? 'Finalizing…' : 'Confirm &amp; finalize' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  clientId: { type: [Number, String], required: true },
  initialText: { type: String, default: '' }
});

const emit = defineEmits(['close', 'finalized']);

const pasteText = ref('');
const draftId = ref(null);
const sections = ref([]);
const diagnosis = reactive({ code: '', description: '', justification: '' });
const importing = ref(false);
const saving = ref(false);
const finalizing = ref(false);
const error = ref('');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    pasteText.value = props.initialText || '';
    draftId.value = null;
    sections.value = [];
    diagnosis.code = '';
    diagnosis.description = '';
    diagnosis.justification = '';
    error.value = '';
  }
);

function moveSection(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= sections.value.length) return;
  const [item] = sections.value.splice(index, 1);
  sections.value.splice(next, 0, item);
}

async function doImport() {
  importing.value = true;
  error.value = '';
  try {
    const res = await api.post(`/clients/${props.clientId}/intake-note/import`, {
      text: pasteText.value
    });
    const draft = res?.data?.draft;
    draftId.value = draft?.id || null;
    sections.value = (draft?.sections || res?.data?.parsed?.sections || []).map((s, i) => ({
      key: s.key || `section_${i + 1}`,
      label: s.label || s.title || s.key,
      body: s.body || s.content || '',
      order: i + 1
    }));
    const dx = draft?.confirmedDiagnosis || draft?.suggestedDiagnosis || res?.data?.parsed?.diagnosis;
    if (dx) {
      diagnosis.code = dx.code || dx.icd10Code || '';
      diagnosis.description = dx.description || '';
      diagnosis.justification = dx.justification || '';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Import failed';
  } finally {
    importing.value = false;
  }
}

async function saveSections() {
  if (!draftId.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.patch(`/clients/${props.clientId}/intake-note/${draftId.value}/sections`, {
      sections: sections.value,
      diagnosis: { ...diagnosis }
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function finalize() {
  if (!draftId.value) return;
  finalizing.value = true;
  error.value = '';
  try {
    await saveSections();
    const res = await api.post(`/clients/${props.clientId}/intake-note/${draftId.value}/finalize`, {
      goals: []
    });
    emit('finalized', res?.data || null);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Finalize failed';
  } finally {
    finalizing.value = false;
  }
}
</script>

<style scoped>
.na-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 90;
  padding: 24px 16px;
  overflow: auto;
}
.na-modal {
  background: #fff;
  border-radius: 14px;
  width: min(860px, 100%);
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.na-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.na-modal-head h3 { margin: 0; }
.na-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  margin-bottom: 10px;
}
.na-input, .na-textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.na-import-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
  background: #f8fafc;
}
.na-import-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.na-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.error { color: #b91c1c; font-size: 0.85rem; }
</style>
