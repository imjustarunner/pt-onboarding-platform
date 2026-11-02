<template>
  <div class="referral-backdrop" @click.self="!busy && $emit('close')">
    <div class="referral-modal" role="dialog" aria-label="Post a new client referral">
      <h2>Post a new client referral</h2>
      <p>Use this when the client is in your EHR but not yet in this app. Complete the required matching details; support will receive a shared task to finish the EHR record. Diagnoses and other preferences remain optional.</p>
      <p v-if="clientId">Client saved. Continue to finish posting this same referral.</p>
      <form data-exchange-form @submit.prevent="submit" @invalid.capture="validationAttempted = true">
        <fieldset :disabled="busy || !!clientId">
          <div class="row">
            <label>Client initials *<input data-exchange-field="initials" :aria-invalid="missingKeys.includes('initials') || undefined" v-model="form.initials" required maxlength="10" placeholder="AB" /></label>
            <label>Age *<input data-exchange-field="age" :aria-invalid="missingKeys.includes('age') || undefined" v-model="form.age" required type="number" min="0" max="120" step="1" /></label>
            <label>Client gender *<select data-exchange-field="gender" :aria-invalid="missingKeys.includes('gender') || undefined" v-model="form.gender" required><option value="">Choose…</option><option value="female">Female</option><option value="male">Male</option><option value="nonbinary">Nonbinary</option><option value="other">Another identity</option><option value="unknown">Unknown / not yet recorded</option></select></label>
          </div>
          <label>Full name (optional — chart and support only)<input v-model="form.fullName" maxlength="200" /></label>
          <p>Full names and contact information are not shown in Exchange listings or matching emails. Client gender does not set a therapist gender preference.</p>
          <label>Diagnosis / diagnoses (if known)<textarea v-model="form.diagnoses" rows="2" maxlength="2000" placeholder="Diagnosis name or code" /></label>
          <label>Clinical concerns *<textarea data-exchange-field="concerns" :aria-invalid="missingKeys.includes('concerns') || undefined" v-model="form.presentingProblem" required rows="3" maxlength="4000" placeholder="Describe the concern without names or contact information" /></label>
          <div class="row">
            <label>Therapist gender preference (optional)<select v-model="form.providerGender"><option value="">No preference</option><option value="female">Female / woman</option><option value="male">Male / man</option><option value="nonbinary">Nonbinary</option></select></label>
            <label>Visit format *<select data-exchange-field="modality" :aria-invalid="missingKeys.includes('modality') || undefined" v-model="form.modality" required><option value="">Choose a format</option><option value="in_person">In person</option><option value="virtual">Virtual</option><option value="either">Either</option></select></label>
          </div>
          <label v-if="form.modality !== 'virtual'">Requested in-person service location *
            <select data-exchange-field="location" :aria-invalid="missingKeys.includes('location') || undefined" v-model="form.serviceLocation" :required="['in_person', 'either'].includes(form.modality)"><option value="">Select a location…</option><option v-for="location in exchangeLocations" :key="location">{{ location }}</option></select>
          </label>
          <label>Insurance plan or self-pay *<input data-exchange-field="insurance" :aria-invalid="missingKeys.includes('insurance') || undefined" v-model="form.insurance" required maxlength="200" placeholder="e.g. Medicaid, Tricare, Aetna, or Self-pay" /></label>
          <p>If a therapist gender is selected, providers who do not match it cannot request this client.</p>
          <label>Provider license requirement<select v-model="form.providerQualification"><option value="">No requirement specified</option><option value="licensed_or_provisional">Licensed clinician (includes provisional licenses)</option><option value="independent">Independently licensed clinician — specifically requested</option></select></label>
          <ClientMatchingPreferences v-model="form.matchingPreferences" :max-selections="0" expanded />
          <p>Available days and times are required. Select every option if the client is flexible.</p><ClientSchedulePreferences required :missing-fields="missingKeys" v-model="form.schedule" />
          <details>
            <summary>Optional EHR details and pasted records</summary>
            <p>These records go in the client chart. The exchange shows initials; notification emails omit the name and initials.</p>
            <label>EHR reference (support only)<input v-model="form.ehrReference" maxlength="200" /></label>
            <label>Demographics<textarea v-model="records.demographics" rows="5" @blur="readDemographics" /></label>
            <label>Intake note<textarea v-model="records.intake" rows="5" /></label>
            <label>Most recent treatment plan<textarea v-model="records.plan" rows="5" /></label>
          </details>
        </fieldset>
        <ExchangeRequiredFields ref="requiredFields" :missing="missingFields" />
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <div class="actions">
          <button type="submit" class="btn btn-primary" :disabled="busy || parsing || posted">{{ busy ? 'Saving…' : clientId ? 'Continue posting referral' : 'Post referral and notify support' }}</button>
          <button type="button" class="btn btn-secondary" :disabled="busy" @click="posted ? $emit('posted', postedListing) : $emit('close')">{{ posted ? 'Done' : 'Close' }}</button>
        </div>
      </form>
    </div>
    <ClientEhrBringUpToDatePanel v-if="clientId" :open="showImport" :client-id="clientId" :agency-id="agencyId" :client-label="form.initials" :initial-texts="records" creation-flow @close="showImport = false" @imported="onImported" />
  </div>
</template>
<script setup>
import { normalizeExchangeLocation } from '../../navigation/clientExchangeLocation.js';
import { EXCHANGE_CITIES as exchangeLocations, assertExchangeEssentials, missingManualReferralFields } from '../../navigation/clientExchangeEssentials.js';
import { computed, nextTick, reactive, ref } from 'vue';
import ExchangeRequiredFields from './ExchangeRequiredFields.vue';
import api from '../../services/api';
import ClientMatchingPreferences from '../public/ClientMatchingPreferences.vue';
import ClientSchedulePreferences from './ClientSchedulePreferences.vue';
import ClientEhrBringUpToDatePanel from '../admin/clientChart/ClientEhrBringUpToDatePanel.vue';
import { normalizeExchangeSchedule } from '../../utils/clientExchangeSchedule.js';
const props = defineProps({ agencyId: { type: Number, required: true } });
const emit = defineEmits(['close', 'posted']);
const form = reactive({ initials: '', age: '', gender: '', fullName: '', ehrReference: '', diagnoses: '', presentingProblem: '', providerGender: '', providerQualification: '', modality: '', serviceLocation: '', insurance: '', matchingPreferences: {}, schedule: {} });
const validationAttempted = ref(false), requiredFields = ref(null);
const missingFields = computed(() => validationAttempted.value ? missingManualReferralFields(form) : []);
const missingKeys = computed(() => missingFields.value.map(field => field.key));
const records = reactive({ demographics: '', intake: '', plan: '' });
const requestId = crypto.randomUUID();
const clientId = ref(null);
const busy = ref(false);
const parsing = ref(false);
const error = ref('');
const showImport = ref(false);
const imported = ref(false);
const posted = ref(false);
const postedListing = ref(null);
async function readDemographics() {
  if (!records.demographics.trim() || clientId.value || parsing.value) return;
  parsing.value = true;
  try {
    const { data } = await api.post('/clients/demographics/preview', { text: records.demographics });
    const name = data.parsed?.fullName;
    if (name && !form.fullName) form.fullName = name;
    if (name && !form.initials) form.initials = name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 10);
  } catch { error.value = 'Enter initials manually; support can review the pasted demographics.'; }
  finally { parsing.value = false; }
}
async function onImported() { imported.value = true; showImport.value = false; await submit(); }
async function submit() {
  if (busy.value || parsing.value || posted.value) return;
  error.value = ''; validationAttempted.value = true;
  if (missingFields.value.length) { await nextTick(); requiredFields.value?.focusFirst(); return; }
  busy.value = true;
  try {
    const schedule = normalizeExchangeSchedule(form.schedule);
    normalizeExchangeLocation(form.serviceLocation, { required: ['in_person', 'either'].includes(form.modality) });
    assertExchangeEssentials({preferences:{...form,schedule},presentingProblems:[form.presentingProblem]});
    if (!clientId.value) {
      const { data } = await api.post('/client-exchange/referrals', { ...form, schedule, agencyId: props.agencyId, requestId });
      clientId.value = data.clientId;
    }
    if (!clientId.value) throw new Error('Client could not be saved');
    if (!imported.value && Object.values(records).some(text => text.trim())) { showImport.value = true; return; }
    const { data } = await api.post('/client-exchange/listings', { agencyId: props.agencyId, clientId: clientId.value });
    posted.value = true;
    postedListing.value = data.listing;
    if (data.listing?.alreadyPosted) { error.value = `Referral #${data.listing.id} already exists. Open it to review the saved details. No duplicate referral or matching notifications were created.`; return; }
    if (data.listing?.notifications?.failed) { error.value = 'Referral posted and support task created, but some matching emails could not be sent.'; return; }
    if (data.listing?.notifications?.queued) { error.value = `Referral #${data.listing.id} posted. Matching emails are awaiting approval in Communications.`; return; }
    emit('posted', postedListing.value);
  } catch (e) { error.value = `${clientId.value ? 'Client and support task are saved. ' : ''}${e.response?.data?.error?.message || e.message || 'Unable to post referral'}`; }
  finally { busy.value = false; }
}
</script>
<style scoped>
.referral-backdrop { position: fixed; inset: 0; z-index: 10050; background: #0f172a80; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 24px 16px; }
.referral-modal { width: min(700px, 100%); background: white; padding: 24px; border-radius: 12px; }
fieldset { display: grid; gap: 14px; border: 0; padding: 0; min-width: 0; }
label { display: grid; gap: 5px; font-weight: 600; font-size: 13px; }
[aria-invalid="true"] { outline: 2px solid #dc2626; outline-offset: 2px; }
input, textarea, select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 9px; font: inherit; min-width: 0; width: 100%; }
.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
details label { margin-top: 12px; }
p { font-size: 14px; color: #475569; } summary { cursor: pointer; font-weight: 600; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }.error { color: #b91c1c; }
</style>
