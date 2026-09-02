<template>
  <Teleport to="body">
    <div v-if="open" class="na-tp-backdrop" @click.self="emit('close')">
      <div class="na-tp-modal" role="dialog" aria-labelledby="na-tp-title">
        <header class="na-tp-head">
          <div>
            <h3 id="na-tp-title">Treatment Plan Writer / Updater</h3>
            <p class="na-tp-sub">
              Standalone tool — no mental status, risk, or session fields.
              Parse into the same goal/objective review used in client setup, then apply to a client or save with initials.
            </p>
          </div>
          <button type="button" class="na-link-btn" @click="emit('close')">Close</button>
        </header>

        <div class="na-tp-modes" role="tablist">
          <button type="button" class="na-tp-mode" :class="{ on: mode === 'write' }" @click="mode = 'write'">
            Write from information
          </button>
          <button type="button" class="na-tp-mode" :class="{ on: mode === 'update' }" @click="mode = 'update'">
            Update existing plan
          </button>
        </div>

        <label class="na-tp-label">
          Initials (for library save without a client)
          <input v-model="draftInitials" class="na-tp-input" maxlength="16" placeholder="e.g. J.D." />
        </label>

        <label class="na-tp-label">
          Optional client to apply to
          <select v-model="applyClientId" class="na-tp-input">
            <option :value="null">Save without attaching to a client</option>
            <option v-for="c in clientOptions" :key="c.id" :value="c.id">
              {{ c.label }}
            </option>
          </select>
        </label>

        <template v-if="mode === 'write'">
          <label class="na-tp-label">
            Paste presenting problem, symptoms, diagnosis, justification, and any plan parameters
            <textarea
              v-model="writeText"
              class="na-tp-textarea"
              rows="8"
              placeholder="Paste intake / diagnostic information, or a full treatment plan to structure…"
            />
          </label>
          <div class="na-tp-actions">
            <button type="button" class="na-tp-outline" :disabled="busy || !writeText.trim()" @click="parsePaste(writeText)">
              {{ parsing ? 'Parsing…' : 'Parse into review' }}
            </button>
            <button type="button" class="na-tp-primary" :disabled="busy || !writeText.trim()" @click="generatePlan">
              {{ generating ? 'Writing…' : 'AI write plan, then review' }}
            </button>
          </div>
        </template>

        <template v-else>
          <label class="na-tp-label">
            Existing treatment plan
            <textarea
              v-model="oldPlanText"
              class="na-tp-textarea"
              rows="7"
              placeholder="Paste the current treatment plan…"
            />
          </label>
          <label class="na-tp-label">
            What should change?
            <textarea
              v-model="changeInstructions"
              class="na-tp-textarea"
              rows="4"
              placeholder="e.g. Raise anxiety goal target; add communication objective; update diagnostic justification for new symptoms…"
            />
          </label>
          <div class="na-tp-actions">
            <button
              type="button"
              class="na-tp-primary"
              :disabled="busy || !oldPlanText.trim() || !changeInstructions.trim()"
              @click="generateUpdate"
            >
              {{ generating ? 'Rewriting…' : 'Rewrite plan, then review' }}
            </button>
          </div>
        </template>

        <p v-if="error" class="na-tp-error">{{ error }}</p>
        <p v-if="message" class="na-tp-ok">{{ message }}</p>

        <div v-if="model" class="na-tp-review">
          <h4>Review structured plan</h4>
          <label class="na-tp-label">
            Effective date
            <input v-model="model.effectiveDate" type="date" class="na-tp-input" />
          </label>
          <label class="na-tp-label">
            Diagnostic justification
            <textarea v-model="model.diagnosticJustification" class="na-tp-textarea" rows="4" />
          </label>
          <label class="na-tp-label">
            Presenting problem
            <textarea v-model="model.presentingProblem" class="na-tp-textarea" rows="3" />
          </label>
          <label class="na-tp-label">
            Discharge criteria
            <textarea v-model="model.dischargePlan" class="na-tp-textarea" rows="3" />
          </label>

          <div v-for="(g, gi) in model.goals" :key="`g-${gi}`" class="na-tp-goal">
            <label class="na-tp-label">
              Goal {{ gi + 1 }}
              <textarea v-model="g.goalText" class="na-tp-textarea" rows="2" />
            </label>
            <div v-for="(o, oi) in g.objectives" :key="`o-${gi}-${oi}`" class="na-tp-obj">
              <label class="na-tp-label">
                Objective {{ gi + 1 }}.{{ oi + 1 }}
                <textarea v-model="o.objectiveText" class="na-tp-textarea" rows="3" />
              </label>
              <div class="na-tp-scales">
                <label>Current <input v-model.number="o.scaleCurrent" type="number" min="1" max="10" class="na-tp-num" /></label>
                <label>Target <input v-model.number="o.scaleTarget" type="number" min="1" max="10" class="na-tp-num" /></label>
                <select v-model="o.scaleDirection" class="na-tp-input na-tp-dir">
                  <option :value="null">Direction</option>
                  <option value="increase">Increase</option>
                  <option value="decrease">Decrease</option>
                </select>
              </div>
            </div>
          </div>

          <div class="na-tp-actions">
            <button
              v-if="applyClientId"
              type="button"
              class="na-tp-primary"
              :disabled="busy"
              @click="saveToClient"
            >
              {{ saving ? 'Saving…' : 'Apply to selected client' }}
            </button>
            <button type="button" class="na-tp-outline" :disabled="busy" @click="saveLibraryDraft">
              {{ saving ? 'Saving…' : 'Save to library (initials only)' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  agencyId: { type: [Number, String], default: null },
  clients: { type: Array, default: () => [] }
});

const emit = defineEmits(['close', 'saved', 'applied']);

const mode = ref('write');
const writeText = ref('');
const oldPlanText = ref('');
const changeInstructions = ref('');
const draftInitials = ref('');
const applyClientId = ref(null);
const model = ref(null);
const parsing = ref(false);
const generating = ref(false);
const saving = ref(false);
const error = ref('');
const message = ref('');

const busy = computed(() => parsing.value || generating.value || saving.value);

const clientOptions = computed(() =>
  (props.clients || [])
    .map((c) => ({
      id: Number(c.id || c.clientId || 0),
      label: c.full_name || c.fullName || c.name || c.initials || `Client #${c.id}`
    }))
    .filter((c) => c.id)
);

watch(
  () => props.open,
  (on) => {
    if (!on) return;
    error.value = '';
    message.value = '';
  }
);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function parsePaste(raw) {
  const text = String(raw || '').trim();
  if (!text) return;
  parsing.value = true;
  error.value = '';
  message.value = '';
  try {
    const res = await api.post(
      '/medical-billing/treatment-plans/parse',
      { text },
      { skipGlobalLoading: true }
    );
    const parsed = res?.data?.plan || res?.data || null;
    if (!parsed) throw new Error('Parse returned no plan.');
    model.value = {
      effectiveDate: parsed.effectiveDate || todayIso(),
      diagnosticJustification: parsed.diagnosticJustification || '',
      presentingProblem: parsed.presentingProblem || '',
      prescribedFrequency: parsed.prescribedFrequency || '',
      dischargePlan: parsed.dischargePlan || '',
      diagnoses: Array.isArray(parsed.diagnoses) ? parsed.diagnoses : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : []
    };
    message.value = 'Parsed into review — edit before saving.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Parse failed';
  } finally {
    parsing.value = false;
  }
}

async function generatePlan() {
  const text = String(writeText.value || '').trim();
  if (!text || generating.value) return;
  generating.value = true;
  error.value = '';
  message.value = '';
  try {
    const fd = new FormData();
    fd.append('toolId', 'clinical_psychotherapy_plan');
    fd.append('inputText', text);
    if (props.agencyId) fd.append('agencyId', String(props.agencyId));
    if (draftInitials.value) fd.append('initials', String(draftInitials.value).trim());
    const res = await api.post('/clinical-notes/generate', fd, { skipGlobalLoading: true });
    const panels = Array.isArray(res?.data?.panels) ? res.data.panels : [];
    const blob = panels.length
      ? panels.map((p) => `${p.title || p.name || 'Section'}:\n${p.content || p.text || ''}`).join('\n\n')
      : String(res?.data?.text || '').trim();
    if (!blob) throw new Error('No plan returned.');
    await parsePaste(blob);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Generate failed';
  } finally {
    generating.value = false;
  }
}

async function generateUpdate() {
  const old = String(oldPlanText.value || '').trim();
  const changes = String(changeInstructions.value || '').trim();
  if (!old || !changes || generating.value) return;
  generating.value = true;
  error.value = '';
  message.value = '';
  try {
    const fd = new FormData();
    fd.append('toolId', 'clinical_psychotherapy_plan');
    fd.append(
      'inputText',
      [
        'UPDATE EXISTING TREATMENT PLAN using the change instructions.',
        'Return a full revised plan (diagnosis/justification if needed, goals, objectives with 1–10 scales, discharge).',
        '',
        '=== CURRENT PLAN ===',
        old,
        '',
        '=== CHANGE INSTRUCTIONS ===',
        changes
      ].join('\n')
    );
    if (props.agencyId) fd.append('agencyId', String(props.agencyId));
    if (draftInitials.value) fd.append('initials', String(draftInitials.value).trim());
    const res = await api.post('/clinical-notes/generate', fd, { skipGlobalLoading: true });
    const panels = Array.isArray(res?.data?.panels) ? res.data.panels : [];
    const blob = panels.length
      ? panels.map((p) => `${p.title || p.name || 'Section'}:\n${p.content || p.text || ''}`).join('\n\n')
      : String(res?.data?.text || '').trim();
    if (!blob) throw new Error('No updated plan returned.');
    await parsePaste(blob);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Update failed';
  } finally {
    generating.value = false;
  }
}

function goalsPayload() {
  return (model.value?.goals || []).map((g, i) => ({
    goalIndex: i + 1,
    goalText: g.goalText,
    projectedCompletion: g.projectedCompletion || null,
    objectives: (g.objectives || []).map((o, j) => ({
      objectiveIndex: j + 1,
      objectiveText: o.objectiveText,
      scaleCurrent: o.scaleCurrent,
      scaleTarget: o.scaleTarget,
      scaleDirection: o.scaleDirection,
      measurementMethod: o.measurementMethod || '1–10 scale (client self-report)'
    }))
  }));
}

async function saveToClient() {
  const clientId = Number(applyClientId.value || 0);
  if (!clientId || !model.value || saving.value) return;
  if (!props.agencyId) {
    error.value = 'Agency is required to apply a plan to a client.';
    return;
  }
  saving.value = true;
  error.value = '';
  message.value = '';
  try {
    const primary = (model.value.diagnoses || []).find((d) => d.isPrimary) || (model.value.diagnoses || [])[0];
    const res = await api.post('/medical-billing/treatment-plans', {
      agencyId: Number(props.agencyId),
      clientId,
      title: 'Imported Treatment Plan',
      status: 'active',
      finalize: true,
      effectiveDate: model.value.effectiveDate || null,
      dischargePlan: model.value.dischargePlan || null,
      presentingProblem: model.value.presentingProblem || null,
      prescribedFrequency: model.value.prescribedFrequency || null,
      sourceToolId: 'note_aid_plan_standalone',
      icd10Code: primary?.icd10Code || null,
      diagnosisDescription: primary?.description || null,
      diagnosticJustification: model.value.diagnosticJustification || null,
      diagnoses: model.value.diagnoses || [],
      goals: goalsPayload()
    }, { skipGlobalLoading: true });
    message.value = 'Treatment plan applied to client chart.';
    emit('applied', res?.data?.plan || null);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Save to client failed';
  } finally {
    saving.value = false;
  }
}

async function saveLibraryDraft() {
  if (!model.value || saving.value) return;
  if (!props.agencyId) {
    error.value = 'Select an agency context before saving.';
    return;
  }
  saving.value = true;
  error.value = '';
  message.value = '';
  try {
    const summary = [
      model.value.diagnosticJustification ? `Diagnostic justification:\n${model.value.diagnosticJustification}` : '',
      ...(model.value.goals || []).flatMap((g, i) => [
        `Goal ${i + 1}: ${g.goalText || ''}`,
        ...(g.objectives || []).map((o, j) => `Objective ${i + 1}.${j + 1}: ${o.objectiveText || ''}`)
      ])
    ].filter(Boolean).join('\n\n');
    const inputBlob = mode.value === 'update'
      ? `${oldPlanText.value}\n\nChanges:\n${changeInstructions.value}`
      : writeText.value;
    const outputObj = {
      sections: { 'Treatment Plan': summary },
      panels: [{ title: 'Treatment Plan', content: summary }],
      meta: {
        toolId: 'clinical_psychotherapy_plan',
        source: 'treatment_plan_standalone_modal',
        structuredPlan: model.value,
        professionalReviewRequired: true
      }
    };
    const createRes = await api.post('/clinical-notes/drafts', {
      agencyId: Number(props.agencyId),
      initials: String(draftInitials.value || '').trim() || null,
      clientId: null,
      unlinkClient: true,
      inputText: String(inputBlob || '').trim() || summary.slice(0, 500),
      serviceCode: null,
      dateOfService: model.value.effectiveDate || todayIso()
    }, { skipGlobalLoading: true });
    const draft = createRes?.data?.draft || null;
    if (draft?.id) {
      await api.patch(`/clinical-notes/drafts/${draft.id}`, {
        agencyId: Number(props.agencyId),
        outputJson: JSON.stringify(outputObj),
        initials: String(draftInitials.value || '').trim() || null
      }, { skipGlobalLoading: true });
    }
    message.value = 'Saved to library / In Progress without a client attachment.';
    emit('saved', draft);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Library save failed';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.na-tp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 16px;
  overflow: auto;
}
.na-tp-modal {
  width: min(920px, 100%);
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.na-tp-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.na-tp-head h3 { margin: 0 0 4px; }
.na-tp-sub { margin: 0; color: #64748b; font-size: 0.86rem; }
.na-tp-modes {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.na-tp-mode {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 700;
  font-size: 0.8rem;
  color: #64748b;
  cursor: pointer;
}
.na-tp-mode.on {
  background: #ccfbf1;
  border-color: #5eead4;
  color: #0f766e;
}
.na-tp-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 10px;
}
.na-tp-input,
.na-tp-textarea,
.na-tp-num {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.9rem;
  font-weight: 400;
  color: #0f172a;
}
.na-tp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 12px;
}
.na-tp-primary {
  border: none;
  background: #0f766e;
  color: #fff;
  font-weight: 700;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}
.na-tp-primary:disabled,
.na-tp-outline:disabled { opacity: 0.55; cursor: not-allowed; }
.na-tp-outline {
  border: 1px solid #99f6e4;
  background: #fff;
  color: #0f766e;
  font-weight: 700;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}
.na-tp-error { color: #b91c1c; font-size: 0.84rem; }
.na-tp-ok { color: #0f766e; font-size: 0.84rem; }
.na-tp-review {
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
  margin-top: 8px;
}
.na-tp-review h4 { margin: 0 0 10px; }
.na-tp-goal {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 10px;
  background: #f8fafc;
}
.na-tp-obj {
  border-top: 1px dotted #cbd5e1;
  padding-top: 8px;
  margin-top: 8px;
}
.na-tp-scales {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 0.8rem;
}
.na-tp-num { width: 4rem; }
.na-tp-dir { width: auto; min-width: 8rem; }
.na-link-btn {
  border: none;
  background: transparent;
  color: #0f766e;
  font-weight: 700;
  cursor: pointer;
}
</style>
