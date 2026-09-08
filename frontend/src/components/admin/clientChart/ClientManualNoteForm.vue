<template>
  <form class="cmnf" @submit.prevent="submit">
    <header class="cmnf-head">
      <h3 class="cmnf-title">{{ title }}</h3>
      <p class="cmnf-sub">{{ subtitle }}</p>
    </header>

    <template v-if="noteKind === 'contact'">
      <label class="cmnf-field">
        <span>Contacted party</span>
        <input v-model="form.partyName" type="text" required placeholder="Name of person contacted" />
      </label>
      <label class="cmnf-field">
        <span>Relationship to patient</span>
        <select v-model="form.relationship" required>
          <option disabled value="">Select…</option>
          <option v-for="r in relationships" :key="r" :value="r">{{ r }}</option>
        </select>
      </label>
      <label class="cmnf-field">
        <span>Method of communication</span>
        <select v-model="form.method" required>
          <option disabled value="">Select…</option>
          <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
        </select>
      </label>
      <label class="cmnf-field">
        <span>Reason for communication</span>
        <input v-model="form.reason" type="text" required placeholder="Brief reason" />
      </label>
      <div class="cmnf-row2">
        <label class="cmnf-field">
          <span>Time spent (minutes)</span>
          <input v-model.number="form.minutes" type="number" min="0" step="1" placeholder="e.g. 15" />
        </label>
        <label class="cmnf-field">
          <span>Suggested service code (optional)</span>
          <input v-model="form.serviceCode" type="text" maxlength="16" placeholder="e.g. H0023" />
        </label>
      </div>
      <fieldset class="cmnf-billing">
        <legend>Billing for this contact (mental health)</legend>
        <p class="cmnf-hint">
          Enable billing when the contact may satisfy a billable service. You can submit to insurance
          (they may deny; client may then owe self-pay), bill self-pay, or waive as pro bono.
        </p>
        <label class="cmnf-check">
          <input v-model="form.billingEnabled" type="checkbox" />
          <span>This contact may be billable — enable billing options</span>
        </label>
        <template v-if="form.billingEnabled">
          <label class="cmnf-field">
            <span>Billing disposition</span>
            <select v-model="form.billingDisposition" required>
              <option value="submit_insurance">Submit to insurance / ClaimMD (denial → client may self-pay)</option>
              <option value="self_pay">Bill client self-pay rate for selected service</option>
              <option value="pro_bono">Waive — pro bono / no compensation</option>
            </select>
          </label>
          <label class="cmnf-check">
            <input v-model="form.billingAttestation" type="checkbox" required />
            <span>
              I attest this contact is not covered (or not expected to be paid) under the client’s insurance
              as a standard session, and I understand the client may owe the self-pay rate if a service is
              selected and insurance denies — unless I waive it as pro bono.
            </span>
          </label>
        </template>
      </fieldset>
    </template>

    <label class="cmnf-field">
      <span>{{ noteKind === 'contact' ? 'Communication details' : 'Note details' }}</span>
      <textarea
        v-model="form.details"
        rows="8"
        required
        :placeholder="noteKind === 'contact' ? 'What was discussed…' : 'Write the note…'"
      />
    </label>

    <p v-if="error" class="cmnf-error">{{ error }}</p>

    <div class="cmnf-actions">
      <button type="button" class="cmnf-btn ghost" :disabled="saving" @click="$emit('cancel')">Cancel</button>
      <button type="submit" class="cmnf-btn primary" :disabled="saving">
        {{ saving ? 'Saving…' : 'Save note' }}
      </button>
    </div>
  </form>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import api from '../../../services/api.js';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  noteKind: {
    type: String,
    default: 'contact',
    validator: (v) => ['contact', 'misc', 'consultation'].includes(v)
  }
});

const emit = defineEmits(['saved', 'cancel']);

const saving = ref(false);
const error = ref('');

const form = reactive({
  partyName: '',
  relationship: '',
  method: '',
  reason: '',
  minutes: null,
  serviceCode: 'H0023',
  billingEnabled: false,
  billingDisposition: 'submit_insurance',
  billingAttestation: false,
  details: ''
});

const relationships = [
  'Parent / Guardian',
  'Self (client)',
  'Spouse / Partner',
  'Family member',
  'School staff',
  'Teacher',
  'Counselor',
  'Case manager',
  'Physician / Healthcare',
  'Insurance / Billing',
  'Other provider',
  'Other'
];

const methods = [
  'Phone call',
  'Voicemail',
  'Email',
  'Text / SMS',
  'Secure message',
  'In person',
  'Video',
  'Fax',
  'Mail',
  'Other'
];

const title = computed(() => {
  if (props.noteKind === 'consultation') return 'Consultation note';
  if (props.noteKind === 'misc') return 'Miscellaneous note';
  return 'Contact note';
});

const subtitle = computed(() => {
  if (props.noteKind === 'contact') {
    return 'Document outreach. If billable, choose insurance submission, self-pay, or pro-bono waiver — AI/code review can evaluate Medicaid billability later from note content + duration.';
  }
  return 'Manual chart note — saved to this client’s notes.';
});

function buildMessage() {
  if (props.noteKind !== 'contact') {
    return String(form.details || '').trim();
  }
  const dispositionLabel = {
    submit_insurance: 'Submit to insurance / ClaimMD',
    self_pay: 'Self-pay',
    pro_bono: 'Pro bono / waived'
  }[form.billingDisposition] || form.billingDisposition;
  const lines = [
    `Contacted: ${form.partyName}`,
    `Relationship: ${form.relationship}`,
    `Method: ${form.method}`,
    `Reason: ${form.reason}`,
    form.minutes != null && form.minutes !== '' ? `Time spent: ${form.minutes} min` : null,
    form.serviceCode ? `Suggested service code: ${String(form.serviceCode).toUpperCase()}` : null,
    form.billingEnabled
      ? `Billing enabled: yes · Disposition: ${dispositionLabel} · Provider attestation: ${form.billingAttestation ? 'yes' : 'no'}`
      : 'Billing enabled: no',
    '',
    String(form.details || '').trim()
  ].filter((x) => x != null);
  return lines.join('\n');
}

async function submit() {
  error.value = '';
  if (props.noteKind === 'contact' && form.billingEnabled) {
    if (!form.billingAttestation) {
      error.value = 'Attest the insurance / self-pay understanding before enabling billing.';
      return;
    }
    if (form.billingDisposition !== 'pro_bono' && !String(form.serviceCode || '').trim()) {
      error.value = 'Enter a suggested service code, or choose pro bono.';
      return;
    }
  }
  saving.value = true;
  try {
    const category =
      props.noteKind === 'contact'
        ? 'contact'
        : props.noteKind === 'consultation'
          ? 'clinical'
          : 'general';
    const message = buildMessage();
    await api.post(
      `/clients/${props.clientId}/notes`,
      {
        category,
        urgency: 'normal',
        message,
        is_internal_only: true,
        meta: props.noteKind === 'contact'
          ? {
              note_form: 'contact',
              party_name: form.partyName,
              relationship: form.relationship,
              method: form.method,
              reason: form.reason,
              minutes: form.minutes,
              service_code: String(form.serviceCode || '').trim().toUpperCase() || null,
              billing_enabled: !!form.billingEnabled,
              billing_disposition: form.billingEnabled ? form.billingDisposition : null,
              billing_attestation: form.billingEnabled ? !!form.billingAttestation : false,
              billing_claim_requested: !!form.billingEnabled && form.billingDisposition === 'submit_insurance',
              self_pay_requested: !!form.billingEnabled && form.billingDisposition === 'self_pay',
              pro_bono_waived: !!form.billingEnabled && form.billingDisposition === 'pro_bono'
            }
          : { note_form: props.noteKind }
      },
      { skipGlobalLoading: true }
    );
    emit('saved');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save note';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.cmnf {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 4px 16px;
  max-width: 640px;
}
.cmnf-head { margin-bottom: 4px; }
.cmnf-title { margin: 0 0 4px; font-size: 1.1rem; font-weight: 800; }
.cmnf-sub { margin: 0; font-size: 13px; color: #64748b; line-height: 1.45; }
.cmnf-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  font-weight: 650;
  color: #334155;
}
.cmnf-field input,
.cmnf-field select,
.cmnf-field textarea {
  font: inherit;
  font-weight: 400;
  padding: 9px 11px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  color: #0f172a;
}
.cmnf-field textarea { resize: vertical; min-height: 140px; line-height: 1.45; }
.cmnf-row2 {
  display: grid;
  grid-template-columns: minmax(120px, 160px) 1fr;
  gap: 12px;
  align-items: end;
}
.cmnf-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 13px;
  color: #334155;
  font-weight: 500;
  padding-bottom: 6px;
}
.cmnf-check input { margin-top: 3px; }
.cmnf-billing {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px 6px;
  margin: 0;
}
.cmnf-billing legend {
  font-size: 12px;
  font-weight: 800;
  color: #0f766e;
  padding: 0 4px;
}
.cmnf-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
  font-weight: 500;
}
.cmnf-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
.cmnf-btn {
  border-radius: 10px;
  padding: 9px 14px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  background: #fff;
}
.cmnf-btn.primary {
  background: #2d6a4f;
  border-color: #2d6a4f;
  color: #fff;
}
.cmnf-btn.ghost:hover { background: #f8fafc; }
.cmnf-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.cmnf-error { margin: 0; color: #b91c1c; font-size: 13px; }
@media (max-width: 560px) {
  .cmnf-row2 { grid-template-columns: 1fr; }
}
</style>
