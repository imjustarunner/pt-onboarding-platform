<template>
  <Teleport to="body">
    <div v-if="open" class="na-modal-backdrop">
      <div class="na-modal na-modal--wide" role="dialog" aria-labelledby="na-intake-import-title">
        <header class="na-modal-head">
          <h3 id="na-intake-import-title">Review imported intake</h3>
          <button type="button" class="na-link-btn" @click="emit('close')">Close</button>
        </header>

        <label class="na-label">
          Paste intake text
          <textarea v-model="pasteText" class="na-textarea" rows="5" placeholder="Paste intake note…" />
        </label>
        <div class="na-modal-actions na-modal-actions--left">
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
            <div class="na-import-row">
              <strong>Diagnoses</strong>
              <span class="hint">First diagnosis is primary for claims.</span>
              <button type="button" class="na-link-btn" @click="addDiagnosis">+ Add diagnosis</button>
            </div>
            <div v-for="(dx, di) in diagnoses" :key="'dx-' + di" class="na-dx-card">
              <div class="na-import-row">
                <span v-if="di === 0" class="na-dx-primary">Primary</span>
                <input v-model="dx.code" class="na-input na-input--code" placeholder="ICD-10" />
                <input v-model="dx.description" class="na-input" placeholder="Description" />
                <button v-if="diagnoses.length > 1" type="button" class="na-link-btn" @click="removeDiagnosis(di)">Remove</button>
              </div>
            </div>

            <div class="na-dx-justification">
              <label class="na-label na-label--tight">
                Diagnostic justification
                <span class="hint">One narrative covering all diagnoses above</span>
                <textarea
                  v-model="diagnosticJustification"
                  class="na-textarea"
                  rows="5"
                  placeholder="Describe how the presentation supports the diagnosis list…"
                />
              </label>
              <div class="na-eval-row">
                <button
                  type="button"
                  class="na-btn-outline na-btn-outline--sm"
                  :disabled="evaluating || !diagnoses[0]?.code || !diagnosticJustification.trim()"
                  @click="evaluateJustification"
                >
                  {{ evaluating ? 'Evaluating…' : 'AI evaluate justification' }}
                </button>
                <span v-if="evaluationScore != null" class="na-eval-score" :class="scoreClass(evaluationScore)">
                  Score: {{ evaluationScore }}/100
                </span>
              </div>
              <p v-if="evaluationSummary" class="na-eval-summary">{{ evaluationSummary }}</p>
              <p v-if="evaluationGaps" class="na-eval-gaps">{{ evaluationGaps }}</p>
            </div>
          </div>

          <p v-if="error" class="error">{{ error }}</p>
          <div class="na-modal-actions">
            <button type="button" class="na-btn-outline" :disabled="saving" @click="onSaveClick">
              {{ saving ? 'Saving…' : 'Save sections' }}
            </button>
            <button type="button" class="na-btn-primary" :disabled="finalizing || !diagnoses[0]?.code" @click="finalize">
              {{ finalizing ? 'Finalizing…' : 'Confirm &amp; finalize' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';
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
const diagnoses = ref([]);
const diagnosticJustification = ref('');
const evaluationScore = ref(null);
const evaluationSummary = ref('');
const evaluationGaps = ref('');
const importing = ref(false);
const saving = ref(false);
const finalizing = ref(false);
const error = ref('');
const evaluating = ref(false);

function resetEvaluation() {
  evaluationScore.value = null;
  evaluationSummary.value = '';
  evaluationGaps.value = '';
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    pasteText.value = props.initialText || '';
    draftId.value = null;
    sections.value = [];
    diagnoses.value = [{ code: '', description: '' }];
    diagnosticJustification.value = '';
    resetEvaluation();
    error.value = '';
    evaluating.value = false;
    if (String(pasteText.value || '').trim()) {
      void doImport();
    }
  }
);

function moveSection(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= sections.value.length) return;
  const [item] = sections.value.splice(index, 1);
  sections.value.splice(next, 0, item);
}

function addDiagnosis() {
  diagnoses.value.push({ code: '', description: '' });
}

function removeDiagnosis(index) {
  if (diagnoses.value.length <= 1) return;
  diagnoses.value.splice(index, 1);
}

function scoreClass(score) {
  const n = Number(score);
  if (n >= 85) return 'good';
  if (n >= 60) return 'mid';
  return 'low';
}

function pickSharedJustification(list, singleDx) {
  const fromList = (Array.isArray(list) ? list : [])
    .map((d) => String(d?.justification || '').trim())
    .find(Boolean);
  if (fromList) return fromList;
  return String(singleDx?.justification || '').trim();
}

function normalizeDiagnosesFromResponse(list, singleDx) {
  if (Array.isArray(list) && list.length) {
    return list.map((d, i) => ({
      code: d.code || d.icd10Code || '',
      description: d.description || '',
      isPrimary: i === 0
    }));
  }
  if (singleDx?.code) {
    return [{
      code: singleDx.code || singleDx.icd10Code || '',
      description: singleDx.description || ''
    }];
  }
  return [{ code: '', description: '' }];
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
    const parsedDx = res?.data?.parsed?.diagnoses;
    const singleDx = draft?.confirmedDiagnosis || draft?.suggestedDiagnosis || res?.data?.parsed?.diagnosis;
    diagnoses.value = normalizeDiagnosesFromResponse(parsedDx, singleDx);
    diagnosticJustification.value = pickSharedJustification(parsedDx, singleDx);
    resetEvaluation();
    const primaryEv = Array.isArray(parsedDx) ? parsedDx[0] : null;
    if (primaryEv?.evaluationScore != null) {
      evaluationScore.value = primaryEv.evaluationScore;
      evaluationSummary.value = primaryEv.evaluationSummary || '';
      evaluationGaps.value = primaryEv.evaluationGaps || '';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Import failed';
  } finally {
    importing.value = false;
  }
}

async function evaluateJustification() {
  const primary = diagnoses.value[0];
  const just = String(diagnosticJustification.value || '').trim();
  if (!primary?.code || !just) return;
  evaluating.value = true;
  error.value = '';
  try {
    const coded = diagnoses.value
      .filter((d) => String(d.code || '').trim())
      .map((d) => ({
        icd10Code: d.code,
        description: d.description || ''
      }));
    const res = await api.post(
      `/clients/${props.clientId}/intake-note/evaluate-diagnosis`,
      {
        icd10Code: primary.code,
        description: primary.description,
        justification: just,
        diagnoses: coded
      },
      { skipGlobalLoading: true }
    );
    const ev = res?.data?.evaluation || {};
    evaluationScore.value = ev.score ?? null;
    evaluationSummary.value = ev.summary || '';
    evaluationGaps.value = ev.gaps || '';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Evaluation failed';
  } finally {
    evaluating.value = false;
  }
}

function diagnosesPayload() {
  const just = String(diagnosticJustification.value || '').trim();
  return diagnoses.value.map((d, i) => ({
    code: d.code,
    description: d.description,
    // Shared justification lives on the primary diagnosis for API / chart storage.
    justification: i === 0 ? just : '',
    isPrimary: i === 0,
    evaluationScore: i === 0 ? evaluationScore.value : null,
    evaluationSummary: i === 0 ? (evaluationSummary.value || null) : null
  }));
}

async function onSaveClick() {
  try {
    await saveSections({ replace: false });
  } catch {
    // error already set
  }
}

async function saveSections({ replace = false } = {}) {
  if (!draftId.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.patch(`/clients/${props.clientId}/intake-note/${draftId.value}/sections`, {
      sections: sections.value,
      diagnoses: diagnosesPayload(),
      diagnosticJustification: String(diagnosticJustification.value || '').trim() || null,
      replace: !!replace
    });
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Save failed';
    const code = e.response?.data?.error?.code;
    const canReplace = e.response?.status === 409
      && (code === 'intake_already_finalized' || /already finalized/i.test(msg));
    if (!replace && canReplace) {
      // One-time chart setup: reopen finalized draft and retry once.
      await api.patch(`/clients/${props.clientId}/intake-note/${draftId.value}/sections`, {
        sections: sections.value,
        diagnoses: diagnosesPayload(),
        diagnosticJustification: String(diagnosticJustification.value || '').trim() || null,
        replace: true
      });
      return;
    }
    error.value = msg;
    throw e;
  } finally {
    saving.value = false;
  }
}

async function finalize() {
  if (!draftId.value) return;
  finalizing.value = true;
  error.value = '';
  try {
    await saveSections({ replace: false });
    try {
      const res = await api.post(`/clients/${props.clientId}/intake-note/${draftId.value}/finalize`, {
        goals: [],
        replace: false
      });
      emit('finalized', res?.data || null);
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message || 'Finalize failed';
      const code = e.response?.data?.error?.code;
      const canReplace = e.response?.status === 409
        && (code === 'intake_already_finalized' || /already finalized/i.test(msg));
      if (canReplace) {
        await saveSections({ replace: true });
        const res = await api.post(`/clients/${props.clientId}/intake-note/${draftId.value}/finalize`, {
          goals: [],
          replace: true
        });
        emit('finalized', res?.data || null);
        return;
      }
      throw e;
    }
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
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 5000;
  padding: 72px 16px 24px;
  overflow: auto;
}
.na-modal {
  background: #fff;
  border-radius: 14px;
  width: min(860px, 100%);
  max-height: calc(100vh - 96px);
  overflow: auto;
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}
.na-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
  padding-bottom: 8px;
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
.na-input--code { max-width: 110px; }
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
.na-dx-card .na-import-row { margin-bottom: 0; }
.na-dx-justification {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
}
.na-label--tight { margin-bottom: 0; }
.na-label--tight .hint { font-weight: 500; margin-bottom: 4px; }
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
.na-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.na-modal-actions--left { justify-content: flex-start; }
.na-btn-primary {
  border: none;
  background: #0f766e;
  color: #fff;
  border-radius: 10px;
  font-weight: 700;
  padding: 8px 14px;
  cursor: pointer;
}
.na-btn-outline {
  border: 1px solid #0f766e;
  background: #fff;
  color: #0d5f59;
  border-radius: 10px;
  font-weight: 700;
  padding: 8px 14px;
  cursor: pointer;
}
.na-btn-outline--sm { padding: 5px 10px; font-size: 0.78rem; }
.na-link-btn { border: none; background: transparent; color: #0f766e; cursor: pointer; font-weight: 600; }
.hint { color: #64748b; font-size: 0.78rem; font-weight: 500; }
.error { color: #b91c1c; font-size: 0.85rem; }
.na-eval-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 6px; }
.na-eval-score { font-size: 0.82rem; font-weight: 800; }
.na-eval-score.good { color: #15803d; }
.na-eval-score.mid { color: #b45309; }
.na-eval-score.low { color: #b91c1c; }
.na-eval-summary { font-size: 0.82rem; color: #334155; margin: 4px 0 0; }
.na-eval-gaps { font-size: 0.78rem; color: #b45309; margin: 2px 0 0; }
</style>
