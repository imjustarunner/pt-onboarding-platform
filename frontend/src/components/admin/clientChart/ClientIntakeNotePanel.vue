<template>
  <div class="cin">
    <div class="cin-head">
      <h3 class="cin-title">Intake note</h3>
      <p class="hint">
        Drafts use scrubbed clinical intake only (no name, DOB, address, phone, email, or member ID).
        Confirm diagnosis before finalizing. Finalize locks the note and creates a draft treatment plan.
      </p>
    </div>

    <div v-if="phiBanner" class="phi-warning" style="margin-bottom: 12px;">
      <strong>PHI access</strong>
      <span class="muted"> Chart demographics stay on this page for copy — they are never sent to the note writer.</span>
    </div>

    <div v-if="loading" class="muted">Loading intake note…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <div v-if="!assignedProvider" class="cin-callout">
        Assign a clinician to generate an intake note (credential selects 90791 vs H0031).
      </div>

      <div v-else class="cin-meta">
        <div><span class="muted">Service code</span> <strong class="mono">{{ draft?.serviceCode || suggestedCode || '—' }}</strong></div>
        <div><span class="muted">Status</span> <strong>{{ statusLabel }}</strong></div>
        <div v-if="draft?.providerName"><span class="muted">Provider</span> <strong>{{ draft.providerName }}</strong></div>
      </div>

      <div class="cin-actions">
        <button
          type="button"
          class="cdp-btn-primary"
          :disabled="busy || !assignedProvider || draft?.status === 'final'"
          @click="generateDraft"
        >
          {{ busy && busyAction === 'generate' ? 'Generating…' : (draft ? 'Regenerate draft' : 'Generate draft') }}
        </button>
        <button
          v-if="draft?.sections?.length"
          type="button"
          class="cdp-btn-soft"
          @click="copyAll"
        >
          Copy all sections
        </button>
      </div>

      <section v-if="draft?.suggestedDiagnosis" class="cin-dx">
        <h4>Suggested diagnosis</h4>
        <p class="mono">{{ draft.suggestedDiagnosis.code || '—' }} — {{ draft.suggestedDiagnosis.description || '' }}</p>
        <p v-if="draft.suggestedDiagnosis.justification" class="muted tiny" style="white-space: pre-wrap;">{{ draft.suggestedDiagnosis.justification }}</p>
        <div v-if="draft.status !== 'final'" class="cin-dx-actions">
          <button type="button" class="cdp-btn-soft" :disabled="busy" @click="confirmDx('remain')">
            No further information — remain as is
          </button>
          <button type="button" class="cdp-btn-primary" :disabled="busy" @click="confirmDx('confirmed')">
            Diagnosis confirmed
          </button>
          <button type="button" class="cdp-btn-soft" :disabled="busy" @click="showDxEdit = !showDxEdit">
            Change / update diagnosis
          </button>
        </div>
        <div v-if="showDxEdit" class="cin-dx-edit">
          <input v-model="dxEdit.code" class="filters-input" placeholder="ICD-10 code" />
          <input v-model="dxEdit.description" class="filters-input" placeholder="Description" />
          <textarea v-model="dxEdit.comment" class="filters-input" rows="2" placeholder="Reason for change" />
          <button type="button" class="cdp-btn-primary" :disabled="busy" @click="confirmDx('updated')">
            Save updated diagnosis
          </button>
        </div>
      </section>

      <section v-if="draft?.sections?.length" class="cin-sections">
        <h4>Note sections</h4>
        <div v-for="sec in draft.sections" :key="sec.key" class="cin-section">
          <div class="cin-section__head">
            <strong>{{ sec.label }}</strong>
            <button type="button" class="cdp-text-link" @click="copyText(sec.body, sec.label)">Copy</button>
          </div>
          <pre class="cin-section__body">{{ sec.body || '—' }}</pre>
        </div>
      </section>

      <section v-if="draft && draft.status !== 'final'" class="cin-finalize">
        <label class="muted tiny">Optional session context (stays on chart; scrubbed before any rewrite)</label>
        <textarea v-model="sessionContext" class="filters-input" rows="3" placeholder="Additional clinical context from first session…" />
        <button
          type="button"
          class="cdp-btn-primary"
          :disabled="busy || !canFinalize"
          @click="finalize"
        >
          {{ busy && busyAction === 'finalize' ? 'Finalizing…' : 'Finalize → draft treatment plan' }}
        </button>
        <p v-if="!canFinalize" class="hint">Confirm or update diagnosis before finalizing.</p>
      </section>

      <section v-if="treatmentPlan" class="cin-tp">
        <h4>Draft treatment plan</h4>
        <div v-for="(goal, idx) in (treatmentPlan.goals || [])" :key="idx" class="cin-section">
          <div class="cin-section__head">
            <strong>Goal {{ idx + 1 }}</strong>
            <button type="button" class="cdp-text-link" @click="copyText(formatGoal(goal), `Goal ${idx + 1}`)">Copy</button>
          </div>
          <pre class="cin-section__body">{{ formatGoal(goal) }}</pre>
        </div>
        <p v-if="!(treatmentPlan.goals || []).length" class="muted">Draft plan saved — open Treatment plans to edit.</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  assignedProvider: { type: Boolean, default: false },
  suggestedCode: { type: String, default: '' },
  phiBanner: { type: Boolean, default: false }
});

const loading = ref(false);
const busy = ref(false);
const busyAction = ref('');
const error = ref('');
const draft = ref(null);
const treatmentPlan = ref(null);
const showDxEdit = ref(false);
const sessionContext = ref('');
const dxEdit = ref({ code: '', description: '', comment: '' });
const copyFlash = ref('');

const statusLabel = computed(() => {
  const s = String(draft.value?.status || 'none');
  const map = {
    none: 'Not started',
    draft: 'Draft',
    diagnosis_pending: 'Awaiting diagnosis confirm',
    ready: 'Ready to finalize',
    final: 'Finalized'
  };
  return map[s] || s;
});

const canFinalize = computed(() => {
  const s = draft.value?.status;
  return s === 'ready' || s === 'draft' && draft.value?.diagnosisAction;
});

async function load() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`/clients/${id}/intake-note`, { skipGlobalLoading: true });
    draft.value = r.data?.draft || null;
    treatmentPlan.value = r.data?.treatmentPlan || null;
    if (draft.value?.suggestedDiagnosis) {
      dxEdit.value = {
        code: draft.value.suggestedDiagnosis.code || '',
        description: draft.value.suggestedDiagnosis.description || '',
        comment: ''
      };
    }
  } catch (e) {
    if (e.response?.status === 404) {
      draft.value = null;
    } else {
      error.value = e.response?.data?.error?.message || 'Failed to load intake note';
    }
  } finally {
    loading.value = false;
  }
}

async function generateDraft() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  busy.value = true;
  busyAction.value = 'generate';
  error.value = '';
  try {
    const r = await api.post(`/clients/${id}/intake-note/generate`, {});
    draft.value = r.data?.draft || null;
    treatmentPlan.value = r.data?.treatmentPlan || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to generate intake note';
  } finally {
    busy.value = false;
    busyAction.value = '';
  }
}

async function confirmDx(action) {
  const id = Number(props.clientId || 0);
  const draftId = Number(draft.value?.id || 0);
  if (!id || !draftId) return;
  busy.value = true;
  busyAction.value = 'dx';
  error.value = '';
  try {
    const body = { action };
    if (action === 'updated') {
      body.code = dxEdit.value.code;
      body.description = dxEdit.value.description;
      body.comment = dxEdit.value.comment;
    }
    const r = await api.post(`/clients/${id}/intake-note/${draftId}/diagnosis`, body);
    draft.value = r.data?.draft || draft.value;
    showDxEdit.value = false;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to record diagnosis decision';
  } finally {
    busy.value = false;
    busyAction.value = '';
  }
}

async function finalize() {
  const id = Number(props.clientId || 0);
  const draftId = Number(draft.value?.id || 0);
  if (!id || !draftId) return;
  busy.value = true;
  busyAction.value = 'finalize';
  error.value = '';
  try {
    const r = await api.post(`/clients/${id}/intake-note/${draftId}/finalize`, {
      sessionContext: sessionContext.value || ''
    });
    draft.value = r.data?.draft || draft.value;
    treatmentPlan.value = r.data?.treatmentPlan || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to finalize intake note';
  } finally {
    busy.value = false;
    busyAction.value = '';
  }
}

function formatGoal(goal) {
  if (!goal) return '';
  if (typeof goal === 'string') return goal;
  const parts = [goal.goal || goal.text || goal.title, goal.objectives, goal.interventions].filter(Boolean);
  return parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n');
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    copyFlash.value = label || 'Copied';
  } catch {
    /* ignore */
  }
}

function copyAll() {
  const parts = (draft.value?.sections || []).map((s) => `## ${s.label}\n${s.body || ''}`);
  copyText(parts.join('\n\n'), 'All sections');
}

onMounted(load);
watch(() => props.clientId, load);
</script>

<style scoped>
.cin-head { margin-bottom: 12px; }
.cin-title { margin: 0 0 4px; font-size: 16px; font-weight: 750; color: var(--text-primary, #0f172a); }
.cin-callout {
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  color: var(--text-primary, #0f172a);
  font-weight: 650;
}
.cin-meta { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 12px; font-size: 13px; }
.cin-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.cin-dx, .cin-sections, .cin-finalize, .cin-tp { margin-top: 16px; }
.cin-dx h4, .cin-sections h4, .cin-tp h4 { margin: 0 0 8px; font-size: 14px; }
.cin-dx-actions, .cin-dx-edit { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.cin-dx-edit { flex-direction: column; }
.cin-section {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: var(--bg-card, var(--bg, #fff));
  padding: 10px 12px;
  margin-bottom: 8px;
}
.cin-section__head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.cin-section__body {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary, #0f172a);
}
.cdp-btn-primary, .cdp-btn-soft {
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 650;
  cursor: pointer;
  border: 1px solid var(--border, #e2e8f0);
}
.cdp-btn-primary {
  background: var(--primary, #166534);
  color: #fff;
  border-color: transparent;
}
.cdp-btn-soft {
  background: var(--bg-alt, #f8fafc);
  color: var(--text-primary, #0f172a);
}
.cdp-text-link {
  border: 0;
  background: transparent;
  color: var(--primary, #166534);
  font-weight: 650;
  cursor: pointer;
}
.filters-input {
  width: 100%;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--bg, #fff);
  color: var(--text-primary, #0f172a);
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
