<template>
  <section class="na-intake-editor" aria-labelledby="na-intake-editor-title">
    <header class="na-intake-editor__head">
      <div>
        <h2 id="na-intake-editor-title">Intake draft</h2>
        <p class="hint">
          Edit sections, then add information below and regenerate. Finalize intake before finalizing the treatment plan.
        </p>
      </div>
      <button type="button" class="na-link-btn" @click="emit('close')">Back to Note Aid</button>
    </header>

    <p v-if="loading" class="muted">Loading intake draft…</p>
    <p v-else-if="error && !draftId" class="error">{{ error }}</p>

    <template v-else-if="draftId">
      <div v-for="(sec, si) in sections" :key="sec.key + '-' + si" class="na-import-card">
        <div class="na-import-row">
          <input v-model="sec.label" class="na-input" placeholder="Section title" :disabled="isFinal" />
          <button type="button" class="na-link-btn" :disabled="isFinal || si === 0" @click="moveSection(si, -1)">↑</button>
          <button type="button" class="na-link-btn" :disabled="isFinal || si >= sections.length - 1" @click="moveSection(si, 1)">↓</button>
        </div>
        <textarea v-model="sec.body" class="na-textarea" rows="4" :disabled="isFinal" />
      </div>

      <div class="na-import-card">
        <div class="na-import-row">
          <strong>Diagnoses</strong>
          <span class="hint">Confirm primary diagnosis before finalizing.</span>
          <button v-if="!isFinal" type="button" class="na-link-btn" @click="addDiagnosis">+ Add</button>
        </div>
        <div v-for="(dx, di) in diagnoses" :key="'dx-' + di" class="na-dx-card">
          <div class="na-import-row">
            <span v-if="di === 0" class="na-dx-primary">Primary</span>
            <input v-model="dx.code" class="na-input na-input--code" placeholder="ICD-10" :disabled="isFinal" />
            <input v-model="dx.description" class="na-input" placeholder="Description" :disabled="isFinal" />
            <button
              v-if="!isFinal && diagnoses.length > 1"
              type="button"
              class="na-link-btn"
              @click="diagnoses.splice(di, 1)"
            >
              Remove
            </button>
          </div>
        </div>
        <label class="na-label">
          Diagnostic justification
          <textarea
            v-model="diagnosticJustification"
            class="na-textarea"
            rows="4"
            placeholder="How the presentation supports the diagnosis list…"
            :disabled="isFinal"
          />
        </label>
      </div>

      <div v-if="!isFinal" class="na-revision-block">
        <label class="na-label" for="na-intake-addendum">
          Additional information / revision instructions
        </label>
        <textarea
          id="na-intake-addendum"
          v-model="addendum"
          class="na-textarea"
          rows="3"
          placeholder="Type or paste additional clinical information to merge into the intake draft…"
        />
        <div class="na-modal-actions na-modal-actions--left">
          <button type="button" class="na-btn-outline" :disabled="busy || !addendum.trim()" @click="regenerate">
            {{ busyAction === 'regenerate' ? 'Regenerating…' : 'Regenerate with addendum' }}
          </button>
          <button type="button" class="na-btn-outline" :disabled="busy" @click="saveSections">
            {{ busyAction === 'save' ? 'Saving…' : 'Save sections' }}
          </button>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="statusFlash" class="hint">{{ statusFlash }}</p>

      <div v-if="!isFinal" class="na-modal-actions">
        <button
          type="button"
          class="na-btn-primary"
          :disabled="busy || !diagnoses[0]?.code"
          @click="finalizeAndEditPlan"
        >
          {{ busyAction === 'finalize' ? 'Finalizing…' : 'Finalize intake and edit treatment plan' }}
        </button>
        <button type="button" class="na-btn-outline" :disabled="busy || !diagnoses[0]?.code" @click="finalizeOnly">
          Finalize intake only
        </button>
      </div>
      <div v-else class="na-modal-actions">
        <button type="button" class="na-btn-primary" @click="emit('open-plan', { planId: treatmentPlanId })">
          Continue to treatment plan
        </button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  intakeDraftId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'open-plan', 'finalized']);

const loading = ref(false);
const busy = ref(false);
const busyAction = ref('');
const error = ref('');
const statusFlash = ref('');
const draftId = ref(null);
const draftStatus = ref('');
const treatmentPlanId = ref(null);
const sections = ref([]);
const diagnoses = ref([{ code: '', description: '' }]);
const diagnosticJustification = ref('');
const addendum = ref('');

const isFinal = computed(() => String(draftStatus.value || '').toLowerCase() === 'final');

function moveSection(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= sections.value.length) return;
  const [item] = sections.value.splice(index, 1);
  sections.value.splice(next, 0, item);
}

function addDiagnosis() {
  diagnoses.value.push({ code: '', description: '' });
}

function applyDraft(draft) {
  if (!draft) return;
  draftId.value = draft.id || null;
  draftStatus.value = draft.status || '';
  treatmentPlanId.value = draft.treatmentPlanId || draft.treatment_plan_id || null;
  sections.value = (draft.sections || []).map((s, i) => ({
    key: s.key || `section_${i + 1}`,
    label: s.label || s.title || s.key,
    body: s.body || s.content || '',
    order: i + 1
  }));
  const confirmed = draft.confirmedDiagnosis || draft.suggestedDiagnosis;
  const list = draft.diagnoses || (confirmed ? [confirmed] : []);
  if (Array.isArray(list) && list.length) {
    diagnoses.value = list.map((d) => ({
      code: d.code || d.icd10Code || d.icd10_code || '',
      description: d.description || ''
    }));
    diagnosticJustification.value = String(
      list[0]?.justification || confirmed?.justification || draft.diagnosticJustification || ''
    ).trim();
  } else {
    diagnoses.value = [{ code: '', description: '' }];
    diagnosticJustification.value = '';
  }
}

async function load() {
  const cid = Number(props.clientId || 0);
  if (!cid) return;
  loading.value = true;
  error.value = '';
  try {
    const wanted = Number(props.intakeDraftId || 0);
    const res = await api.get(`/clients/${cid}/intake-note`, {
      params: wanted ? { draftId: wanted } : undefined,
      skipGlobalLoading: true
    });
    applyDraft(res?.data?.draft);
    if (res?.data?.treatmentPlan?.id) {
      treatmentPlanId.value = res.data.treatmentPlan.id;
    }
    if (!draftId.value) {
      error.value = 'No intake draft found for this client.';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load intake draft';
  } finally {
    loading.value = false;
  }
}

function diagnosesPayload() {
  const just = String(diagnosticJustification.value || '').trim();
  return diagnoses.value.map((d, i) => ({
    code: d.code,
    description: d.description,
    justification: i === 0 ? just : '',
    isPrimary: i === 0
  }));
}

async function saveSections() {
  if (!draftId.value) return;
  busy.value = true;
  busyAction.value = 'save';
  error.value = '';
  statusFlash.value = '';
  try {
    const res = await api.patch(`/clients/${props.clientId}/intake-note/${draftId.value}/sections`, {
      sections: sections.value,
      diagnoses: diagnosesPayload(),
      diagnosticJustification: String(diagnosticJustification.value || '').trim() || null
    });
    applyDraft(res?.data?.draft || { ...res?.data, id: draftId.value, sections: sections.value, status: draftStatus.value });
    statusFlash.value = 'Sections saved.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    busy.value = false;
    busyAction.value = '';
  }
}

async function regenerate() {
  if (!draftId.value || !String(addendum.value || '').trim()) return;
  busy.value = true;
  busyAction.value = 'regenerate';
  error.value = '';
  statusFlash.value = '';
  try {
    await api.patch(`/clients/${props.clientId}/intake-note/${draftId.value}/sections`, {
      sections: sections.value,
      diagnoses: diagnosesPayload(),
      diagnosticJustification: String(diagnosticJustification.value || '').trim() || null
    });
    const res = await api.post(`/clients/${props.clientId}/intake-note/${draftId.value}/regenerate`, {
      revisionInstruction: addendum.value
    });
    applyDraft(res?.data?.draft);
    addendum.value = '';
    statusFlash.value = 'Intake regenerated with your addendum.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Regenerate failed';
  } finally {
    busy.value = false;
    busyAction.value = '';
  }
}

async function finalize({ openPlan } = {}) {
  if (!draftId.value) return;
  busy.value = true;
  busyAction.value = 'finalize';
  error.value = '';
  try {
    await api.patch(`/clients/${props.clientId}/intake-note/${draftId.value}/sections`, {
      sections: sections.value,
      diagnoses: diagnosesPayload(),
      diagnosticJustification: String(diagnosticJustification.value || '').trim() || null
    });
    const res = await api.post(`/clients/${props.clientId}/intake-note/${draftId.value}/finalize`, {
      sessionContext: addendum.value || ''
    });
    applyDraft(res?.data?.draft);
    const planId = res?.data?.treatmentPlan?.id || treatmentPlanId.value;
    if (planId) treatmentPlanId.value = planId;
    emit('finalized', res?.data || null);
    if (openPlan) {
      emit('open-plan', { planId });
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Finalize failed';
  } finally {
    busy.value = false;
    busyAction.value = '';
  }
}

async function finalizeAndEditPlan() {
  await finalize({ openPlan: true });
}

async function finalizeOnly() {
  await finalize({ openPlan: false });
}

watch(
  () => [props.clientId, props.intakeDraftId],
  () => {
    void load();
  },
  { immediate: true }
);
</script>

<style scoped>
.na-intake-editor {
  padding: 8px 4px 24px;
  max-width: 920px;
}
.na-intake-editor__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}
.na-intake-editor__head h2 {
  margin: 0 0 4px;
  font-size: 1.15rem;
}
.na-import-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
  background: #f8fafc;
}
.na-dx-card {
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  padding: 8px;
  margin-top: 8px;
  background: #fff;
}
.na-dx-primary {
  font-size: 0.72rem;
  font-weight: 800;
  color: #0f766e;
  text-transform: uppercase;
}
.na-import-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.na-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  margin: 10px 0 0;
}
.na-input, .na-textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  width: 100%;
  box-sizing: border-box;
}
.na-input--code { max-width: 110px; width: auto; }
.na-revision-block {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}
.na-modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.na-modal-actions--left { justify-content: flex-start; }
.na-btn-primary, .na-btn-outline, .na-link-btn {
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 650;
  cursor: pointer;
  font: inherit;
}
.na-btn-primary {
  background: #166534;
  color: #fff;
  border: 0;
}
.na-btn-outline {
  background: #fff;
  border: 1px solid #cbd5e1;
  color: #0f172a;
}
.na-link-btn {
  border: 0;
  background: transparent;
  color: #166534;
}
.hint { color: #64748b; font-size: 0.85rem; margin: 0; }
.muted { color: #64748b; }
.error { color: #b91c1c; }
</style>
