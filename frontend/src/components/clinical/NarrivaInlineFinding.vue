<template>
  <form class="narriva-inline-finding" @submit.prevent="apply">
    <template v-if="kind === 'consent'">
      <label><input v-model="consent" type="checkbox" /> I confirm the participating client or attending participant(s) consented to participate and were in a private setting at the location shown for this session.</label>
      <button type="submit" :disabled="disabled || !consent">Confirm consent</button>
    </template>
    <template v-else-if="kind === 'participants'">
      <label>Who attended?<select v-model="participants" :disabled="disabled"><option>Client Only</option><option>Client and Others</option><option>Others (client not present)</option></select></label>
      <label v-if="participants !== 'Client Only'">Other participants’ roles<input v-model="participantsDetail" placeholder="Parent, guardian, partner, school staff…" maxlength="500" :disabled="disabled" /></label>
      <label v-else>Clarification<textarea v-model="answer" rows="2" placeholder="For example: Mother was discussed but did not attend." /></label>
      <button type="submit" :disabled="disabled || participants !== 'Client Only' && !participantsDetail.trim()">Confirm participants</button>
    </template>
    <template v-else-if="kind === 'encounter'">
      <div v-if="!deliveryConflict" class="narriva-inline-finding__grid">
        <label v-if="!finding.id?.endsWith(':times')">Date of service<input v-model="date" type="date" /></label>
        <label>Start<input :value="start" @input="editTime('startTime', $event.target.value)" type="time" /></label>
        <label>End<input :value="end" @input="editTime('endTime', $event.target.value)" type="time" /></label>
        <label>Duration (minutes)<input :value="duration" @input="editTime('durationMinutes', $event.target.value)" type="number" min="1" max="600" /></label>
      </div>
      <ClinicalLocationPicker v-if="!finding.id?.endsWith(':times')" v-model="location" :choices="locationChoices" :disabled="disabled" />
      <button type="submit" :disabled="disabled || !date || (!finding.id?.endsWith(':times') && !location.locationLabel) || String(location.placeOfService) === '02' && !String(location.clientLocationDescription || '').trim()">Update session header</button>
    </template>
    <template v-else-if="kind === 'risk'">
      <p>Add a risk-assessment to-do to the generated note. Complete it before submitting the note.</p>
      <button type="submit" :disabled="disabled">Include risk assessment</button>
    </template>
    <template v-else-if="kind === 'presenting'">
      <label>Current presenting problem / reason for this session<textarea v-model="presentingProblem" rows="4" maxlength="4000" placeholder="Describe the current clinical concern and its impact, using roles instead of names." /></label>
      <button type="submit" :disabled="disabled || !presentingProblem.trim()">Confirm presenting problem</button>
    </template>
    <template v-else-if="kind === 'diagnosis'">
      <p v-if="context.diagnoses?.length">On file: {{ context.diagnoses.map(item => item.icd10_code || item.code || item.icd10Code).filter(Boolean).join(', ') }}. Other diagnoses will be preserved.</p>
      <template v-if="diagnosisEditable"><ClinicalDiagnosisSearch :filter-results="diagnosisAllowed" :model-value="diagnosisQuery" :agency-id="context.agencyId" :date-of-service="context.dateOfService" :disabled="disabled" :search="diagnosisSearch" label="Search and select the diagnosis to confirm" @update:model-value="updateDiagnosisQuery" @select="selectDiagnosis" />
      <label>Provider diagnostic justification<textarea v-model="diagnosisJustification" rows="4" maxlength="4000" placeholder="Document the actual findings, duration, functional impact, and diagnostic uncertainty supporting this diagnosis." /></label>
      <button type="submit" :disabled="disabled || !selectedDiagnosis || !diagnosisJustification.trim()">Confirm diagnosis and justification</button></template>
      <p v-else>This service uses diagnoses already on file. An authorized diagnosing provider must update clinical diagnoses and their justification.</p>
    </template>
    <template v-else-if="kind === 'service'">
      <label>Service performed<select v-model="serviceCode"><option value="">Choose an eligible service</option><option v-for="item in serviceOptions" :key="item.code" :value="item.code">{{ item.label }}</option></select></label>
      <label v-if="serviceCode !== context.serviceCode">Reason for changing the session’s service<textarea v-model="serviceReason" rows="2" minlength="5" maxlength="4000" /></label>
      <button v-if="serviceCode !== context.serviceCode" type="submit" :disabled="disabled || !serviceCode || serviceReason.trim().length < 5">Confirm and update service</button>
    </template>
    <template v-else-if="kind === 'complexity'">
      <label>Qualifying communication complication and response<textarea v-model="answer" rows="3" maxlength="4000" placeholder="Describe what complicated communication, how it affected service delivery, and the provider’s response." /></label>
      <button type="submit" :disabled="disabled || !answer.trim()">Use confirmed reason</button>
      <button type="button" :disabled="disabled" @click="$emit('apply', { interactiveComplexitySelected: false })">Remove interactive complexity</button>
    </template>
    <template v-else>
      <label>{{ finding.id?.includes(':conflicting_') ? 'Clarify the two reports' : answerLabel }}<textarea v-model="answer" rows="3" :placeholder="answerHint" maxlength="4000" /></label>
      <button type="submit" :disabled="disabled || !answer.trim()">Use confirmed details</button>
    </template>
    <p v-if="saved && !compact" role="status">Updated here. Recheck the confirmed content when you finish the other prompts.</p>
  </form>
</template>
<script setup>
import { synchronizeServiceTimes } from '../../utils/clinicalServiceTimes.js';
import { computed, ref, watch } from 'vue';
import ClinicalLocationPicker from './ClinicalLocationPicker.vue';
import ClinicalDiagnosisSearch from './ClinicalDiagnosisSearch.vue';
import { sessionDiagnosisEntryMode, canSelectSessionDiagnosis } from '../../utils/narrivaClinicalContext.js';
const props = defineProps({ finding: { type: Object, required: true }, checkId: String, context: { type: Object, default: () => ({}) }, locationChoices: { type: Array, default: () => [] }, serviceChoices: { type: Array, default: () => [] }, diagnosisSearch: Function, disabled: Boolean, compact: Boolean });
const emit = defineEmits(['apply']);
const answer = ref(''), saved = ref(false), consent = ref(false);
const participants = ref('Client Only'), participantsDetail = ref('');
const date = ref(''), start = ref(''), end = ref(''), duration = ref(null), location = ref({});
const serviceCode = ref(''), serviceReason = ref('');
const presentingProblem = ref(''), diagnosisQuery = ref(''), selectedDiagnosis = ref(null), diagnosisJustification = ref('');
const diagnosisMode = computed(() => sessionDiagnosisEntryMode(props.context.diagnosisMode, props.context.credentialTier));
const diagnosisEditable = computed(() => ['full', 'zr_only'].includes(diagnosisMode.value));
const diagnosisAllowed = value => canSelectSessionDiagnosis(diagnosisMode.value, value);
const serviceOptions = computed(() => props.serviceChoices.map(item => typeof item === 'string' ? { code: item, label: item } : { code: item.code || item.value, label: item.label || item.description || item.code || item.value }).filter(item => item.code));
watch(() => props.context, value => {
  consent.value = value.consentConfirmed === true;
  date.value = value.dateOfService || ''; start.value = value.startTime || ''; end.value = value.endTime || ''; duration.value = value.durationMinutes;
  location.value = { ...(value.location || {}), clientLocationDescription: value.clientLocationDescription || value.location?.clientLocationDescription || '' };
  serviceCode.value = value.serviceCode || '';
  presentingProblem.value = value.presentingProblem || '';
  selectedDiagnosis.value = null; diagnosisQuery.value = ''; diagnosisJustification.value = '';
}, { immediate: true });
watch([
  () => props.context.agencyId,
  () => props.context.clientId,
  () => props.context.clinicalSessionId,
  () => props.context.officeEventId,
  () => props.context.participants,
  () => props.context.participantsDetail
], ([, , , , mode, detail]) => {
  participants.value = mode || 'Client Only';
  participantsDetail.value = detail || '';
  answer.value = '';
  saved.value = false;
}, { immediate: true });
const deliveryConflict = computed(() => /:(location|method)_mismatch$/.test(props.finding.id || ''));
const kind = computed(() => props.finding.id?.endsWith(':consent') ? 'consent' : ['participants', 'review_participants'].includes(props.finding.action) ? 'participants' : props.finding.action === 'encounter' ? 'encounter' : props.checkId === 'risk_safety' ? 'risk' : props.finding.action === 'clinical_context' ? /:presenting$/.test(props.finding.id || '') ? 'presenting' : 'diagnosis' : props.finding.action === 'service_code' || props.finding.action === 'clinical_service' ? 'service' : props.finding.action === 'interactive_complexity' ? 'complexity' : 'narrative');
const answerLabel = computed(() => /:interventions$/i.test(props.finding.id) ? 'Describe the assessment, planning, coordination or intervention activities performed' : /engagement|response/i.test(props.finding.id) ? 'Describe the client’s engagement and response to the interventions' : /necessity|presenting/i.test(props.finding.id) ? 'Describe recent symptoms, functional needs, and the reason for this service' : /intervention/i.test(props.finding.id) ? 'Describe the intervention and how it was used' : 'Add the missing session details');
const answerHint = computed(() => 'Use only what was observed, reported, or performed in this session. Use roles instead of names.');
function updateDiagnosisQuery(value) {
  diagnosisQuery.value = value;
  if (value !== selectedDiagnosis.value?.code) selectedDiagnosis.value = null;
}
function selectDiagnosis(value) {
  if (!diagnosisAllowed(value)) return;
  selectedDiagnosis.value = value; diagnosisQuery.value = value.code;
  const existing = (props.context.diagnoses || []).find(item => String(item.icd10_code || item.code || item.icd10Code).toUpperCase() === String(value.code).toUpperCase());
  diagnosisJustification.value = existing?.justification || '';
}
function editTime(field, value) {
  const next = synchronizeServiceTimes({ startTime:start.value, endTime:end.value, durationMinutes:duration.value, [field]:value },field);
  start.value=next.startTime; end.value=next.endTime; duration.value=next.durationMinutes;
}
function apply() {
  if (props.disabled || kind.value === 'presenting' && !presentingProblem.value.trim() || kind.value === 'diagnosis' && (!diagnosisEditable.value || !diagnosisAllowed(selectedDiagnosis.value) || !diagnosisJustification.value.trim())) return;
  const patch = kind.value === 'consent' ? { consentConfirmed: consent.value }
    : kind.value === 'participants' ? { participants: participants.value, participantsDetail: participantsDetail.value.trim(), clarification: answer.value.trim() }
      : kind.value === 'encounter' ? { dateOfService: date.value, startTime: start.value, endTime: end.value, durationMinutes: duration.value, location: location.value, clientLocationDescription: String(location.value.clientLocationDescription || '').trim() }
        : kind.value === 'risk' ? { riskAssessmentIncluded: true }
          : kind.value === 'presenting' ? { presentingProblem: presentingProblem.value.trim() }
          : kind.value === 'diagnosis' ? { diagnosis: { icd10_code: selectedDiagnosis.value.code, description: selectedDiagnosis.value.description, justification: diagnosisJustification.value.trim() } }
          : kind.value === 'service' ? { serviceCode: serviceCode.value, serviceReason: serviceReason.value.trim() }
            : kind.value === 'complexity' ? { clarification: 'Interactive complexity: ' + answer.value.trim() }
          : { clarification: `${answerLabel.value}: ${answer.value.trim()}` };
  emit('apply', patch); saved.value = true;
}
</script>
<style scoped>
.narriva-inline-finding{display:grid;gap:12px;padding:14px;margin:12px 0;border:1px solid #cbddec;border-radius:10px;background:#f7fbff}.narriva-inline-finding label{display:grid;gap:6px;font-weight:600}.narriva-inline-finding input,.narriva-inline-finding select,.narriva-inline-finding textarea{font:inherit;padding:9px;border:1px solid #bacddd;border-radius:7px;min-width:0}.narriva-inline-finding input[type=checkbox]{margin-right:8px}.narriva-inline-finding button{justify-self:start;border:1px solid #246294;border-radius:8px;padding:9px 13px;color:#164a77;background:white;font:inherit;font-weight:600;cursor:pointer}.narriva-inline-finding button:disabled{opacity:.5;cursor:default}.narriva-inline-finding__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.narriva-inline-finding p{font-size:13px;margin:0}
</style>
