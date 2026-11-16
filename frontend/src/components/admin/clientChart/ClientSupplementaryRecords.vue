<template>
  <div v-if="allowed" class="chart-supplementary">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted" role="status">Loading insurance, contacts, and administrative note…</p>
    <template v-else-if="records">
      <ClientMedicalHistory :client-id="clientId" :agency-id="agencyId" />
      <section aria-label="Insurance">
        <h3 class="cc-hub-section__title">Insurance</h3>
        <p v-if="!records.insurance" class="muted">No imported insurance on file.</p>
        <article v-for="policy in policies" :key="policy.position" class="supplement-card">
          <h4>{{ policy.value.insurerName || 'Insurance' }} · {{ policy.position }}</h4>
          <dl><template v-for="field in insuranceFields.filter(field => policy.value[field.key])" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ policy.value[field.key] }}</dd></template></dl>
        </article>
      </section>
      <section aria-label="Additional contacts">
        <h3 class="cc-hub-section__title">Additional contacts</h3>
        <p v-if="!records.contacts.length" class="muted">No imported additional contacts on file.</p>
        <div class="supplement-contacts">
          <article v-for="contact in records.contacts" :key="contact.affiliationId" class="supplement-card">
            <h4>{{ contact.fullName }}</h4>
            <dl><template v-for="field in contactFields.filter(field => contact[field.key])" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ contact[field.key] }}</dd></template></dl>
          </article>
        </div>
      </section>
      <section class="supplement-admin" aria-label="Administrative note">
        <h3 class="cc-hub-section__title">Administrative note</h3>
        <p class="muted">Patient comments · Assigned providers, support, and administrators only</p>
        <p v-if="!editing" class="supplement-note">{{ records.administrativeNote || 'No patient comments on file.' }}</p>
        <button v-if="!editing" type="button" class="cdp-text-link" @click="editNote">{{ records.administrativeNote ? 'Edit administrative note' : 'Add patient comments' }}</button>
        <template v-else>
          <label>Patient comments<textarea v-model="noteDraft" rows="5" :disabled="saving" /></label>
          <div class="supplement-actions"><button type="button" :disabled="saving || !noteDraft.trim()" @click="saveNote">{{ saving ? 'Saving…' : 'Save administrative note' }}</button><button type="button" :disabled="saving" @click="editing = false">Cancel</button></div>
        </template>
      </section>
      <section v-if="records.payer" aria-label="Payer information">
        <h3 class="cc-hub-section__title">Payer information</h3>
        <article v-for="(payer, position) in records.payer" :key="position" class="supplement-card"><h4>{{ position === 'primary' ? 'Primary' : 'Secondary' }}</h4><dl><template v-for="field in payerFields.filter(field => payer[field.key])" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ payer[field.key] }}</dd></template></dl></article>
      </section>
      <section aria-label="Billing comments"><h3 class="cc-hub-section__title">Billing comments</h3><p class="supplement-note">{{ records.billingComments || 'No billing comments on file.' }}</p></section>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../../services/api';
import ClientMedicalHistory from './ClientMedicalHistory.vue';
const props = defineProps({ clientId: { type: [Number, String], required: true }, agencyId: { type: [Number, String], required: true }, refreshKey: { default: null } });
const records = ref(null), allowed = ref(true), loading = ref(false), error = ref(''), editing = ref(false), noteDraft = ref(''), saving = ref(false);
let generation = 0;
const fields = entries => entries.map(([key, label]) => ({ key, label }));
const contactFields = fields([
  ['firstName','First name'], ['middleName','Middle name'], ['lastName','Last name'], ['suffix','Suffix'], ['title','Title'], ['company','Company'], ['contactType','Contact type'], ['relationshipType','Relationship'],
  ['roiSigned','ROI signed (source)'], ['dateOfBirth','Date of birth'], ['appointmentReminders','Appointment reminders (source)'], ['comments','Comments'],
  ['mobilePhone','Mobile phone'], ['workPhone','Work phone'], ['homePhone','Home phone'], ['phone','Phone'], ['fax','Fax'], ['email','Email'],
  ['address','Address'], ['address1','Address 1'], ['address2','Address 2'], ['country','Country'], ['zip','ZIP'], ['cityState','City/state'], ['city','City'], ['state','State'], ['timezone','Time zone']
]);
const insuranceFields = fields([
  ['payerId','Payer ID'], ['memberId','Member ID'], ['groupNumber','Group number'], ['copay','Copay'], ['lastEligibilityCheck','Last eligibility check (source)'],
  ['relationshipToSubscriber','Client relationship to policyholder'], ['subscriberName','Policyholder'], ['subscriberDob','Policyholder date of birth'], ['subscriberSex','Administrative sex'],
  ['subscriberAddressLine1','Address'], ['subscriberAddressLine2','Address 2'], ['subscriberCity','City'], ['subscriberState','State'], ['subscriberPostalCode','ZIP'], ['subscriberPhone','Phone'], ['effectiveDate','Effective date'], ['terminationDate','Termination date']
]);
const payerFields = fields([['payerName','Payer name'], ['network','Network (source)'], ['billingMethod','Billing method (source)'], ['insuranceType','Insurance type'], ['sourcePayerId','TherapyNotes payer ID'], ['address','Address']]);
const policies = computed(() => ['primary','secondary'].filter(key => records.value?.insurance?.[key]).map(key => ({ position: key === 'primary' ? 'Primary' : 'Secondary', value: records.value.insurance[key] })));
function config() { return { skipGlobalLoading: true, headers: { 'X-Agency-Id': String(props.agencyId) } }; }
async function load() {
  const version = ++generation;
  records.value = null; error.value = ''; allowed.value = true; loading.value = true; editing.value = false; noteDraft.value = ''; saving.value = false;
  try {
    const response = await api.get(`/clients/${props.clientId}/chart-import/records`, config());
    if (version === generation) records.value = response.data;
  } catch (err) {
    if (version !== generation) return;
    if (err.response?.status === 403) allowed.value = false;
    else error.value = err.response?.data?.error?.message || 'Supplementary chart records could not be loaded.';
  } finally { if (version === generation) loading.value = false; }
}
function editNote() { noteDraft.value = records.value.administrativeNote; editing.value = true; }
async function saveNote() {
  const version = generation;
  saving.value = true; error.value = '';
  try {
    const response = await api.post(`/clients/${props.clientId}/chart-import/sections/comments`, { text: noteDraft.value }, config());
    if (version !== generation) return;
    records.value.administrativeNote = response.data.result.message; editing.value = false;
  } catch (err) { if (version === generation) error.value = err.response?.data?.error?.message || 'Administrative note could not be saved.'; }
  finally { if (version === generation) saving.value = false; }
}
watch(() => [props.clientId, props.agencyId, props.refreshKey], load, { immediate: true });
onBeforeUnmount(() => generation++);
</script>

<style scoped>
.chart-supplementary { display: grid; gap: 24px; }
.supplement-contacts { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.supplement-card,.supplement-admin { padding: 16px; border: 1px solid #dbe3e9; border-radius: 10px; background: #fff; }
h4 { margin: 0 0 12px; } dl { display: grid; grid-template-columns: minmax(100px, 1fr) 2fr; gap: 6px 12px; margin: 0; font-size: .9rem; }
dt { color: #536475; } dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.supplement-note { white-space: pre-wrap; overflow-wrap: anywhere; }
label { display: grid; gap: 8px; } textarea { box-sizing: border-box; width: 100%; padding: 10px; font: inherit; border: 1px solid #b8c6d2; border-radius: 8px; }
.supplement-actions { display: flex; gap: 8px; margin-top: 10px; } button { cursor: pointer; }
</style>
