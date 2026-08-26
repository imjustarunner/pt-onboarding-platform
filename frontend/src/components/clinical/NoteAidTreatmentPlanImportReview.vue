<template>
  <div v-if="open" class="na-modal-backdrop" @click.self="emit('close')">
    <div class="na-modal na-modal--wide" role="dialog" aria-labelledby="na-plan-import-title">
      <header class="na-modal-head">
        <h3 id="na-plan-import-title">Review imported treatment plan</h3>
        <button type="button" class="na-link-btn" @click="emit('close')">Close</button>
      </header>

      <label class="na-label">
        Paste plan text
        <textarea v-model="pasteText" class="na-textarea" rows="5" placeholder="Paste treatment plan…" />
      </label>
      <div class="na-modal-actions" style="justify-content: flex-start;">
        <button type="button" class="na-btn-outline" :disabled="parsing || !pasteText.trim()" @click="parse">
          {{ parsing ? 'Parsing…' : 'Parse into review' }}
        </button>
      </div>

      <template v-if="model">
        <label class="na-label">
          Effective date
          <input v-model="model.effectiveDate" type="date" class="na-input" />
        </label>

        <div class="na-import-block">
          <div class="na-import-block-head">
            <strong>Diagnoses (ordered)</strong>
            <button type="button" class="na-link-btn" @click="addDiagnosis">Add</button>
          </div>
          <div v-for="(d, di) in model.diagnoses" :key="`dx-${di}`" class="na-import-card">
            <div class="na-import-row">
              <input v-model="d.icd10Code" class="na-input" placeholder="ICD-10" />
              <input v-model="d.description" class="na-input" placeholder="Description" />
              <label class="na-check">
                <input v-model="d.isPrimary" type="checkbox" @change="setPrimary(di)" />
                Primary
              </label>
              <button type="button" class="na-link-btn" :disabled="di === 0" @click="moveDx(di, -1)">↑</button>
              <button type="button" class="na-link-btn" :disabled="di >= model.diagnoses.length - 1" @click="moveDx(di, 1)">↓</button>
              <button type="button" class="na-link-btn" @click="model.diagnoses.splice(di, 1)">Remove</button>
            </div>
          </div>
          <label class="na-label" style="margin-top: 8px;">
            Diagnostic justification
            <span class="hint" style="font-weight: 500;">One narrative covering all diagnoses above</span>
            <textarea
              v-model="model.diagnosticJustification"
              class="na-textarea"
              rows="5"
              placeholder="Describe how the presentation supports the diagnosis list…"
            />
          </label>
        </div>

        <label class="na-label">
          Presenting problem
          <textarea v-model="model.presentingProblem" class="na-textarea" rows="3" />
        </label>

        <label class="na-label">
          Prescribed frequency
          <input v-model="model.prescribedFrequency" class="na-input" placeholder="e.g. Twice a Week" />
        </label>

        <label class="na-label">
          Discharge criteria / planning
          <textarea v-model="model.dischargePlan" class="na-textarea" rows="3" />
        </label>

        <div class="na-import-block">
          <div class="na-import-block-head">
            <strong>Goals &amp; objectives</strong>
            <button type="button" class="na-link-btn" @click="addGoal">Add goal</button>
          </div>
          <div v-for="(g, gi) in model.goals" :key="`g-${gi}`" class="na-import-card">
            <div class="na-import-row">
              <input v-model="g.goalText" class="na-input" placeholder="Goal text" />
              <input v-model="g.projectedCompletion" class="na-input" placeholder="Projected completion" />
              <button type="button" class="na-link-btn" @click="model.goals.splice(gi, 1)">Remove</button>
            </div>
            <div v-for="(o, oi) in g.objectives" :key="`o-${gi}-${oi}`" class="na-import-obj">
              <input v-model="o.objectiveText" class="na-input" placeholder="Objective" />
              <div class="na-import-scale">
                <input v-model.number="o.scaleCurrent" class="na-input" type="number" min="1" max="10" placeholder="Now" />
                <span>→</span>
                <input v-model.number="o.scaleTarget" class="na-input" type="number" min="1" max="10" placeholder="Goal" />
                <select v-model="o.scaleDirection" class="na-input">
                  <option :value="null">Direction</option>
                  <option value="increase">Increase</option>
                  <option value="decrease">Decrease</option>
                </select>
                <span class="muted tiny">{{ directionHint(o) }}</span>
                <button type="button" class="na-link-btn" @click="g.objectives.splice(oi, 1)">Remove</button>
              </div>
              <input v-model="o.measurementMethod" class="na-input" placeholder="Measurement method" />
            </div>
            <button type="button" class="na-link-btn" @click="addObjective(gi)">Add objective</button>
          </div>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
        <div class="na-modal-actions">
          <button type="button" class="na-btn-outline" @click="emit('close')">Cancel</button>
          <button type="button" class="na-btn-primary" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Confirm &amp; save to chart' }}
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
  agencyId: { type: [Number, String], required: true },
  clientId: { type: [Number, String], required: true },
  initialText: { type: String, default: '' }
});

const emit = defineEmits(['close', 'saved']);

const pasteText = ref('');
const model = ref(null);
const parsing = ref(false);
const saving = ref(false);
const error = ref('');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    pasteText.value = props.initialText || '';
    model.value = null;
    error.value = '';
    if (pasteText.value.trim()) parse();
  }
);

function directionHint(o) {
  const cur = Number(o.scaleCurrent);
  const tgt = Number(o.scaleTarget);
  if (!Number.isFinite(cur) || !Number.isFinite(tgt)) return '';
  const dir = o.scaleDirection || (tgt > cur ? 'increase' : tgt < cur ? 'decrease' : '');
  if (!dir) return `${cur} → ${tgt}`;
  return `${cur} → ${tgt} ${dir}`;
}

function setPrimary(index) {
  (model.value?.diagnoses || []).forEach((d, i) => {
    d.isPrimary = i === index;
  });
}

function moveDx(index, delta) {
  const arr = model.value.diagnoses;
  const next = index + delta;
  if (next < 0 || next >= arr.length) return;
  const [item] = arr.splice(index, 1);
  arr.splice(next, 0, item);
}

function addDiagnosis() {
  if (!model.value) return;
  model.value.diagnoses.push({
    icd10Code: '',
    description: '',
    isPrimary: model.value.diagnoses.length === 0
  });
}

function addGoal() {
  if (!model.value) return;
  model.value.goals.push({ goalText: '', projectedCompletion: null, objectives: [] });
}

function addObjective(gi) {
  model.value.goals[gi].objectives.push({
    objectiveText: '',
    scaleCurrent: null,
    scaleTarget: null,
    scaleDirection: null,
    measurementMethod: null
  });
}

async function parse() {
  parsing.value = true;
  error.value = '';
  try {
    const res = await api.post(
      '/medical-billing/treatment-plans/parse',
      {
        agencyId: Number(props.agencyId),
        clientId: Number(props.clientId),
        text: pasteText.value
      },
      { skipGlobalLoading: true }
    );
    const parsed = res?.data?.parsed || {};
    const dxList = parsed.diagnoses || [];
    const sharedJust = String(parsed.diagnosticJustification || '').trim()
      || dxList.map((d) => String(d.justification || '').trim()).find(Boolean)
      || '';
    model.value = reactive({
      effectiveDate: parsed.effectiveDate || '',
      presentingProblem: parsed.presentingProblem || '',
      prescribedFrequency: parsed.prescribedFrequency || '',
      dischargePlan: parsed.dischargePlan || '',
      diagnosticJustification: sharedJust,
      diagnoses: dxList.map((d, i) => ({
        icd10Code: d.icd10Code || '',
        description: d.description || '',
        isPrimary: i === (parsed.primaryDiagnosisIndex || 0)
      })),
      goals: (parsed.goals || []).map((g) => ({
        goalText: g.goalText || '',
        projectedCompletion: g.projectedCompletion || '',
        objectives: (g.objectives || []).map((o) => ({
          objectiveText: o.objectiveText || '',
          scaleCurrent: o.scaleCurrent ?? null,
          scaleTarget: o.scaleTarget ?? null,
          scaleDirection: o.scaleDirection || null,
          measurementMethod: o.measurementMethod || ''
        }))
      }))
    });
    if (!model.value.diagnoses.length) addDiagnosis();
    if (!model.value.goals.length) addGoal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Parse failed';
  } finally {
    parsing.value = false;
  }
}

async function save() {
  if (!model.value) return;
  saving.value = true;
  error.value = '';
  try {
    const primary = (model.value.diagnoses || []).find((d) => d.isPrimary) || model.value.diagnoses?.[0];
    const dischargeParts = [];
    if (String(model.value.presentingProblem || '').trim()) {
      dischargeParts.push(`Presenting Problem\n${String(model.value.presentingProblem).trim()}`);
    }
    if (String(model.value.prescribedFrequency || '').trim()) {
      dischargeParts.push(
        `Prescribed Frequency of Treatment\n${String(model.value.prescribedFrequency).trim()}`
      );
    }
    if (String(model.value.dischargePlan || '').trim()) {
      dischargeParts.push(`Discharge Criteria/Planning\n${String(model.value.dischargePlan).trim()}`);
    }
    const res = await api.post('/medical-billing/treatment-plans', {
      agencyId: Number(props.agencyId),
      clientId: Number(props.clientId),
      title: 'Imported Treatment Plan',
      effectiveDate: model.value.effectiveDate || null,
      dischargePlan: dischargeParts.length ? dischargeParts.join('\n\n') : null,
      presentingProblem: model.value.presentingProblem || null,
      prescribedFrequency: model.value.prescribedFrequency || null,
      sourceToolId: 'note_aid_plan_import',
      icd10Code: primary?.icd10Code || null,
      diagnosisDescription: primary?.description || null,
      diagnosticJustification: String(model.value.diagnosticJustification || '').trim() || null,
      diagnoses: (model.value.diagnoses || []).map((d, i) => ({
        ...d,
        justification: i === 0 || d.isPrimary
          ? String(model.value.diagnosticJustification || '').trim()
          : ''
      })),
      goals: model.value.goals.map((g, i) => ({
        goalIndex: i + 1,
        goalText: g.goalText,
        projectedCompletion: g.projectedCompletion || null,
        objectives: (g.objectives || []).map((o, j) => ({
          objectiveIndex: j + 1,
          objectiveText: o.objectiveText,
          scaleCurrent: o.scaleCurrent,
          scaleTarget: o.scaleTarget,
          scaleDirection: o.scaleDirection,
          measurementMethod: o.measurementMethod || null
        }))
      }))
    });
    emit('saved', res?.data?.plan || null);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
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
  width: min(720px, 100%);
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.na-modal--wide { width: min(860px, 100%); }
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
  color: #334155;
  margin-bottom: 10px;
}
.na-input, .na-textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.na-import-block { margin: 14px 0; }
.na-import-block-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.na-import-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
  background: #f8fafc;
}
.na-import-row, .na-import-scale {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.na-import-obj {
  border-top: 1px dashed #cbd5e1;
  padding-top: 8px;
  margin-top: 8px;
}
.na-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 500;
}
.na-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.muted.tiny { color: #64748b; font-size: 0.75rem; }
.error { color: #b91c1c; font-size: 0.85rem; }
</style>
