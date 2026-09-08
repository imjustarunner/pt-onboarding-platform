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
        <label class="cmnf-check">
          <input v-model="form.billingClaim" type="checkbox" />
          <span>Create billing claim for billing team (manual follow-up for now)</span>
        </label>
      </div>
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
  billingClaim: false,
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
    return 'Manual documentation of outreach. Billing claims (if checked) go to the billing queue without an auto service code for now.';
  }
  return 'Manual chart note — saved to this client’s notes.';
});

function buildMessage() {
  if (props.noteKind !== 'contact') {
    return String(form.details || '').trim();
  }
  const lines = [
    `Contacted: ${form.partyName}`,
    `Relationship: ${form.relationship}`,
    `Method: ${form.method}`,
    `Reason: ${form.reason}`,
    form.minutes != null && form.minutes !== '' ? `Time spent: ${form.minutes} min` : null,
    form.billingClaim ? 'Billing claim requested: yes (pending billing team)' : 'Billing claim requested: no',
    '',
    String(form.details || '').trim()
  ].filter((x) => x != null);
  return lines.join('\n');
}

async function submit() {
  error.value = '';
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
              billing_claim_requested: !!form.billingClaim
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
