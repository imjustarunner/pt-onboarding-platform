<template>
  <section class="actual-review">
    <h4>Actual work-time review</h4>
    <p class="muted">Review daily time records separately from service credits. Include compensable work and required waiting; exclude paid leave and released personal time. Keep the source records. This review records verified totals and does not change service pay.</p>
    <p class="muted">This attestation does not certify minimum wage or overtime. Payroll must separately review the work location, daily and workweek hours, applicable wage floor, regular-rate components and any required additional pay.</p>
    <p v-if="loading" class="muted">Loading review…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="loaded">
      <p v-if="review">Review #{{ review.id }} · {{ current ? 'Matches this payroll calculation' : 'Payroll changed; review again' }} · {{ review.reviewed_at }}</p>
      <p v-if="locked" class="muted">This period is posted or finalized. Existing reviews are read-only; use the payroll correction workflow for changes.</p>
      <form @submit.prevent="save">
        <label>Verified actual work hours
          <input v-model="draft.actualWorkedHours" type="number" min="0" step="0.000001" required :disabled="locked || saving" />
        </label>
        <label>Statutory sick-leave basis hours, if different
          <input v-model="draft.statutorySickBasisHours" type="number" min="0" step="0.000001" :disabled="locked || saving" />
          <span class="muted">Leave blank to use actual work hours. A different statutory basis, such as an applicable exempt employee schedule, must be supported in the note. It does not change the recorded actual hours.</span>
        </label>
        <label>Source reference
          <input v-model="draft.sourceReference" maxlength="500" minlength="5" required :disabled="locked || saving" placeholder="Time record or approved report reference" />
        </label>
        <label>Reconciliation note
          <textarea v-model="draft.reconciliationNote" maxlength="4000" minlength="10" required :disabled="locked || saving" placeholder="Describe the records reviewed and any sick-leave basis adjustment. Do not include client information." />
        </label>
        <label v-if="!locked" class="attestation"><input v-model="draft.attested" type="checkbox" required :disabled="saving" /> I reviewed complete work-time records and the applicable statutory sick-leave basis. These are verified hours, not service-credit estimates.</label>
        <button v-if="!locked" type="submit" class="btn btn-secondary btn-sm" :disabled="saving || !draft.attested">{{ saving ? 'Saving…' : 'Save reviewed hours' }}</button>
      </form>
    </template>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api.js';
const props = defineProps({ periodId: { type: [Number, String], required: true }, userId: { type: [Number, String], required: true } });
const emit = defineEmits(['saved']);
const loading = ref(false), saving = ref(false), loaded = ref(false), error = ref(''), locked = ref(true), current = ref(false), review = ref(null), fingerprint = ref('');
const draft = ref({ actualWorkedHours: '', statutorySickBasisHours: '', sourceReference: '', reconciliationNote: '', attested: false });
let requestVersion = 0;
const load = async () => {
  const version = ++requestVersion;
  loaded.value = false; loading.value = true; error.value = ''; locked.value = true;
  try {
    const response = await api.get(`/payroll/periods/${props.periodId}/actual-hours/${props.userId}`);
    if (version !== requestVersion) return;
    const data = response.data || {};
    review.value = data.review || null; current.value = data.current === true; locked.value = data.locked === true; fingerprint.value = data.summaryFingerprint || '';
    draft.value = { actualWorkedHours: review.value?.actual_worked_hours ?? '', statutorySickBasisHours: review.value?.statutory_sick_basis_hours ?? '', sourceReference: review.value?.source_reference || '', reconciliationNote: review.value?.reconciliation_note || '', attested: false };
    loaded.value = true;
  } catch (err) { if (version === requestVersion) error.value = err.response?.data?.error?.message || err.message || 'Could not load reviewed hours.'; }
  finally { if (version === requestVersion) loading.value = false; }
};
const save = async () => {
  if (locked.value || !draft.value.attested || saving.value) return;
  saving.value = true; error.value = '';
  try {
    await api.put(`/payroll/periods/${props.periodId}/actual-hours/${props.userId}`, { ...draft.value, expectedReviewId: review.value?.id || null, expectedSummaryFingerprint: fingerprint.value });
    await load(); emit('saved');
  } catch (err) { error.value = err.response?.data?.error?.message || err.message || 'Could not save reviewed hours.'; }
  finally { saving.value = false; }
};
watch(() => [props.periodId, props.userId], load, { immediate: true });
</script>

<style scoped>
.actual-review { border: 1px solid var(--border, #e2e8f0); padding: 14px; border-radius: 8px; }
h4 { margin: 0 0 8px; }
.muted { font-size: 13px; color: var(--text-secondary, #64748b); }
form { display: grid; gap: 10px; }
label { display: grid; gap: 4px; font-weight: 600; }
input, textarea { padding: 7px; border: 1px solid var(--border, #e2e8f0); border-radius: 5px; }
textarea { min-height: 65px; }
.attestation { display: flex; align-items: flex-start; font-weight: 400; }
</style>
