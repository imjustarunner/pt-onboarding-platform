<template>
  <Teleport to="body">
    <div v-if="open" class="na-dx-backdrop" @click.self="emit('close')">
      <div class="na-dx-modal" role="dialog" aria-labelledby="na-dx-title">
        <header class="na-dx-head">
          <div>
            <h3 id="na-dx-title">Psychotherapy Diagnosis &amp; Justification</h3>
            <p class="na-dx-sub">
              Standalone drafting tool — not attached to a client chart or session.
              Paste presenting problems / symptoms; review every line before clinical use.
            </p>
          </div>
          <button type="button" class="na-link-btn" @click="emit('close')">Close</button>
        </header>

        <div class="na-dx-disclaimer" role="note">
          <strong>Professional review required.</strong>
          This assistant drafts diagnostic language for licensed clinicians. It must never replace clinical judgment.
          Output is attributed to the reviewing clinician’s credentials on file
          <template v-if="clinicianAttribution"> ({{ clinicianAttribution }})</template>.
        </div>

        <label class="na-dx-label">
          Initials (optional — for library / in-progress drafts)
          <input v-model="draftInitials" class="na-dx-input" maxlength="16" placeholder="e.g. J.D." />
        </label>

        <label class="na-dx-label">
          Presenting problem, symptoms, functional impact, and any diagnostic thoughts
          <textarea
            v-model="sourceText"
            class="na-dx-textarea"
            rows="8"
            maxlength="12000"
            placeholder="Paste intake findings, symptom history, life impact, and your clinical impressions…"
          />
        </label>

        <div class="na-dx-actions">
          <button
            type="button"
            class="na-dx-primary"
            :disabled="generating || !String(sourceText || '').trim()"
            @click="generate"
          >
            {{ generating ? 'Drafting…' : 'Draft diagnosis &amp; justification' }}
          </button>
          <button
            type="button"
            class="na-dx-outline"
            :disabled="saving || !outputText.trim()"
            @click="saveDraft"
          >
            {{ saving ? 'Saving…' : 'Save to In Progress' }}
          </button>
        </div>
        <p v-if="error" class="na-dx-error">{{ error }}</p>
        <p v-if="message" class="na-dx-ok">{{ message }}</p>

        <label v-if="outputText" class="na-dx-label">
          Draft output (edit before saving or copying)
          <textarea v-model="outputText" class="na-dx-textarea" rows="12" />
        </label>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api.js';
import { useAuthStore } from '../../store/auth.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'saved']);

const authStore = useAuthStore();
const sourceText = ref('');
const outputText = ref('');
const draftInitials = ref('');
const generating = ref(false);
const saving = ref(false);
const error = ref('');
const message = ref('');

const clinicianAttribution = computed(() => {
  const u = authStore.user || {};
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  const cred = u.credentials || u.license_type || u.credential || '';
  const npi = u.npi || u.npi_number || '';
  const license = u.license_number || u.licenseNumber || '';
  return [name, cred, license ? `Lic ${license}` : '', npi ? `NPI ${npi}` : ''].filter(Boolean).join(' · ');
});

watch(
  () => props.open,
  (on) => {
    if (!on) return;
    error.value = '';
    message.value = '';
  }
);

async function generate() {
  const text = String(sourceText.value || '').trim();
  if (!text || generating.value) return;
  generating.value = true;
  error.value = '';
  message.value = '';
  try {
    const fd = new FormData();
    fd.append('toolId', 'clinical_diagnosis_writer');
    fd.append(
      'inputText',
      [
        'CLINICIAN REVIEW REQUIREMENT: Draft only. A licensed professional must review and accept before chart use.',
        clinicianAttribution.value ? `Reviewing clinician: ${clinicianAttribution.value}` : '',
        '',
        text
      ].filter(Boolean).join('\n')
    );
    if (props.agencyId) fd.append('agencyId', String(props.agencyId));
    if (draftInitials.value) fd.append('initials', String(draftInitials.value).trim());
    const res = await api.post('/clinical-notes/generate', fd, { skipGlobalLoading: true });
    const panels = Array.isArray(res?.data?.panels) ? res.data.panels : [];
    const blob = panels.length
      ? panels.map((p) => `${p.title || p.name || 'Section'}:\n${p.content || p.text || ''}`).join('\n\n')
      : String(res?.data?.text || res?.data?.note || res?.data?.output || '').trim();
    if (!blob) throw new Error('No diagnosis draft returned.');
    const footer = clinicianAttribution.value
      ? `\n\n— Draft for review by ${clinicianAttribution.value}. Not chart-ready until clinician attestation.`
      : '\n\n— Draft for licensed clinician review only.';
    outputText.value = `${blob.trim()}${footer}`;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Generate failed';
  } finally {
    generating.value = false;
  }
}

async function saveDraft() {
  const text = String(outputText.value || '').trim();
  if (!text || saving.value) return;
  if (!props.agencyId) {
    error.value = 'Select an agency context before saving.';
    return;
  }
  saving.value = true;
  error.value = '';
  message.value = '';
  try {
    const outputObj = {
      sections: { 'Diagnosis and Justification': text },
      panels: [{ title: 'Diagnosis and Justification', content: text }],
      meta: {
        toolId: 'clinical_diagnosis_writer',
        source: 'diagnosis_writer_modal',
        clinicianAttribution: clinicianAttribution.value || null,
        professionalReviewRequired: true
      }
    };
    const createRes = await api.post('/clinical-notes/drafts', {
      agencyId: Number(props.agencyId),
      initials: String(draftInitials.value || '').trim() || null,
      clientId: null,
      unlinkClient: true,
      inputText: String(sourceText.value || '').trim() || text.slice(0, 500),
      serviceCode: null,
      dateOfService: new Date().toISOString().slice(0, 10)
    }, { skipGlobalLoading: true });
    const draft = createRes?.data?.draft || null;
    const draftId = draft?.id;
    if (draftId) {
      await api.patch(`/clinical-notes/drafts/${draftId}`, {
        agencyId: Number(props.agencyId),
        outputJson: JSON.stringify(outputObj),
        initials: String(draftInitials.value || '').trim() || null
      }, { skipGlobalLoading: true });
    }
    message.value = 'Saved to In Progress (not attached to a client).';
    emit('saved', draft);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.na-dx-backdrop {
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
.na-dx-modal {
  width: min(760px, 100%);
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.na-dx-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.na-dx-head h3 { margin: 0 0 4px; }
.na-dx-sub { margin: 0; color: #64748b; font-size: 0.86rem; }
.na-dx-disclaimer {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  color: #92400e;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.84rem;
  margin-bottom: 12px;
}
.na-dx-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 10px;
}
.na-dx-input,
.na-dx-textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.9rem;
  font-weight: 400;
  color: #0f172a;
}
.na-dx-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.na-dx-primary {
  border: none;
  background: #0f766e;
  color: #fff;
  font-weight: 700;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}
.na-dx-primary:disabled { opacity: 0.55; cursor: not-allowed; }
.na-dx-outline {
  border: 1px solid #99f6e4;
  background: #fff;
  color: #0f766e;
  font-weight: 700;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}
.na-dx-outline:disabled { opacity: 0.55; cursor: not-allowed; }
.na-dx-error { color: #b91c1c; font-size: 0.84rem; }
.na-dx-ok { color: #0f766e; font-size: 0.84rem; }
.na-link-btn {
  border: none;
  background: transparent;
  color: #0f766e;
  font-weight: 700;
  cursor: pointer;
}
</style>
