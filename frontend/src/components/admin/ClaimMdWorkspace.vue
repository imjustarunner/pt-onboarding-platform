<template>
  <section class="claimmd-workspace">
    <template v-if="section !== 'detail'">
    <h2>Claim.MD connection</h2>
    <p><strong>{{ connection.configured ? 'Connected configuration' : 'Not configured' }}</strong>
      · {{ connection.mode === 'live' ? 'LIVE ACCOUNT' : connection.mode === 'test' ? 'TEST ACCOUNT' : 'Transmission disabled' }}</p>
    <p>Claims require your review here. Keep “Transmit Approval Required” enabled in Claim.MD during initial submissions; portal approval may also be required.</p>
    <div class="actions">
      <button :disabled="busy || !connection.configured" @click="sync">Sync claim responses</button>
      <button :disabled="busy || !connection.configured" @click="loadEnrollments">Refresh enrollment progress</button>
      <a href="https://www.claim.md/" target="_blank" rel="noopener noreferrer">Open Claim.MD</a>
    </div>
    </template>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template v-if="['all', 'claims'].includes(section)">
    <h3>Signed notes awaiting a claim</h3>
    <button :disabled="busy" @click="loadUndrafted">Check for missing claim drafts</button>
    <ul><li v-for="note in undrafted" :key="note.id">Note #{{ note.id }} · Client #{{ note.client_id }} · {{ note.service_code || 'Review service code' }} <button :disabled="busy" @click="createDraft(note)">Prepare claim from note</button></li></ul>

    </template>
    <template v-if="['all', 'payers'].includes(section)">
    <h3>Payer enrollment</h3>
    <p>Use this agency’s billing NPI. Claim.MD uses the agency tax ID from Company Profile. Enrollment may require a verification call to the phone number listed in NPPES.</p>
    <form class="actions" @submit.prevent="searchPayers">
      <label>Payer name <input v-model="search" minlength="2" maxlength="64" required /></label>
      <button :disabled="busy || !connection.configured">Find payers</button>
    </form>
    <label>Billing office / group
      <select v-model="billingOfficeId" data-testid="billing-office">
        <option value="">Select a billing office</option>
        <option v-for="office in billingOffices" :key="office.id" :value="office.id">{{ office.name }} · {{ office.practice_name }} · NPI {{ office.practice_npi || 'missing' }}</option>
      </select>
    </label>
    <p v-if="selectedOffice">{{ selectedOffice.street_address }}, {{ selectedOffice.city }}, {{ selectedOffice.state }} {{ selectedOffice.postal_code }}</p>
    <p>Enrollment applies to this agency’s Tax ID and selected group NPI. Complete payer contracting separately; an electronic enrollment update does not establish network participation.</p>
    <label>Transaction
      <select v-model="enrollmentType"><option value="1500">Professional claims</option><option value="era">ERA / remittance</option><option value="elig">Eligibility</option></select>
    </label>
    <label v-if="enrollmentType === 'era'"><input v-model="acknowledgeEraRouting" type="checkbox" /> I understand ERA enrollment can redirect remittances from an existing clearinghouse.</label>
    <ul>
      <li v-for="payer in payers" :key="payer.payerid">
        <strong>{{ payer.payer_name }}</strong> · {{ payer.payerid }}
        <span> · Claims: {{ payer['1500_claims'] }} · ERA: {{ payer.era }} · Eligibility: {{ payer.eligibility }}</span>
        <button :disabled="busy || !canEnroll" @click="enroll(payer.payerid)">Open enrollment</button>
      </li>
    </ul>
    <table v-if="enrollments.length">
      <thead><tr><th>Payer ID</th><th>Billing office / NPI</th><th>Transaction</th><th>Progress</th><th>Last update</th><th></th></tr></thead>
      <tbody><tr v-for="item in enrollments" :key="item.id"><td>{{ item.payer_id }}</td><td>{{ billingOffices.find(o => o.id === item.billing_office_location_id)?.name || 'Office unavailable' }} · {{ item.provider_npi }}</td><td>{{ item.enrollment_type }}</td><td>{{ enrollmentStatus(item.status) }}</td><td>{{ item.last_event_at || 'Awaiting Claim.MD update' }}</td><td><button :disabled="busy" @click="reopenEnrollment(item)">View / continue</button></td></tr></tbody>
    </table>
    <p v-else>No enrollments started from this app yet.</p>

    </template>
    <form v-if="draft" class="review" @submit.prevent="saveCorrection">
      <h3>Edit billing fields · Claim #{{ draft.claim.id }}</h3>
      <p>Service codes and units come from the clinical record. Billing edits leave the signed note unchanged.</p>
      <label>Place of service <input v-model="draft.claim.place_of_service" required pattern="[0-9]{2}" maxlength="2" /></label>
      <label>Billing NPI <input v-model="draft.claim.billing_npi" required pattern="[0-9]{10}" maxlength="10" /></label>
      <label>Rendering NPI <input v-model="draft.claim.rendering_npi" required pattern="[0-9]{10}" maxlength="10" /></label>
      <label>Taxonomy <input v-model="draft.claim.taxonomy_code" maxlength="10" /></label>
      <div v-for="line in draft.lines" :key="line.id">
        <strong>{{ line.procedure_code }} · {{ line.units }} units</strong>
        <label>Total line charge in dollars <input v-model="line.dollars" type="number" min="0.01" max="1000000" step="0.01" required /></label>
        <label>Modifiers (comma separated) <input v-model="line.modifiers" /></label>
      </div>
      <label>Reason for correction <textarea v-model="correctionReason" required maxlength="1000"></textarea></label>
      <button :disabled="busy">Save for review</button> <button type="button" @click="draft = null">Cancel</button>
    </form>

    <section v-if="review" class="review" aria-label="Claim review">
      <h3>Review claim #{{ review.claimId }}</h3>
      <p>Session #{{ review.clinicalSessionId }} · Signed note #{{ review.clinicalNoteId }} · {{ review.lifecycle }}</p>
      <p><strong>{{ review.payload.pat_name_f }} {{ review.payload.pat_name_l }}</strong> · {{ review.payload.payer_name }} · Member {{ review.payload.ins_number }}</p>
      <p>Billing NPI {{ review.payload.bill_npi }} · Rendering NPI {{ review.payload.prov_npi }}</p>
      <p v-if="review.billingOffice">Billing office: {{ review.billingOffice.name }} · {{ review.payload.bill_name }} · {{ review.payload.bill_addr_1 }}, {{ review.payload.bill_city }}, {{ review.payload.bill_state }} {{ review.payload.bill_zip }}</p>
      <table><thead><tr><th>Service date</th><th>Code</th><th>Modifiers</th><th>Units</th><th>POS</th><th>Charge</th></tr></thead>
        <tbody><tr v-for="(line, index) in review.payload.charge" :key="index"><td>{{ line.from_date }}</td><td>{{ line.proc_code }}</td><td>{{ [line.mod1,line.mod2,line.mod3,line.mod4].filter(Boolean).join(', ') }}</td><td>{{ line.units }}</td><td>{{ line.place_of_service }}</td><td>${{ line.charge }}</td></tr></tbody>
      </table>
      <p><strong>Total: ${{ review.payload.total_charge }}</strong></p>
      <details><summary>Full claim details</summary><pre>{{ JSON.stringify(review.payload, null, 2) }}</pre></details>
      <ul><li v-for="blocker in review.readiness.blockers" :key="blocker" class="error">{{ blocker }}</li><li v-for="warning in review.readiness.warnings" :key="warning">{{ warning }}</li></ul>
      <label><input v-model="approved" type="checkbox" /> I reviewed the patient, coverage, providers, service lines and charges for this {{ connection.mode }} account.</label>
      <div class="actions"><button :disabled="busy || !approved || !review.readiness.ready || !['draft','ready','rejected'].includes(review.lifecycle) || !['test','live'].includes(connection.mode)" @click="submit">Approve and submit {{ connection.mode === 'live' ? 'LIVE claim' : 'test claim' }}</button><button :disabled="busy" @click="review = null">Close review</button></div>
    </section>

    <section v-if="historyClaimId" class="review">
      <h3>Claim #{{ historyClaimId }} history and follow-up</h3>
      <p v-if="!history.length">No clearinghouse activity yet.</p>
      <article v-for="event in history" :key="event.id">
        <strong>{{ event.type.replaceAll('_', ' ') }}</strong> · {{ event.status || '' }} · {{ event.createdAt }}
        <p v-for="(message, i) in event.messages || []" :key="i">{{ message.message }} <small>{{ message.fields }}</small></p>
        <ul><li v-for="suggestion in event.suggestions || []" :key="suggestion">{{ suggestion }}</li></ul>
        <p v-if="event.reason">{{ event.reason }}</p>
      </article>
    </section>
  </section>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: Number, required: true }, connection: { type: Object, required: true }, section: { type: String, default: 'all' } });
const emit = defineEmits(['updated']);
const busy = ref(false), error = ref(''), notice = ref('');
const search = ref(''), billingOfficeId = ref(''), billingOffices = ref([]), enrollmentType = ref('1500'), acknowledgeEraRouting = ref(false);
const selectedOffice = computed(() => billingOffices.value.find(o => Number(o.id) === Number(billingOfficeId.value)));
const enrollmentStatus = status => ({ requested: 'Requested — open enrollment to continue', started: 'Form issued — complete steps in Claim.MD' })[status] || status;
const payers = ref([]), enrollments = ref([]), review = ref(null), approved = ref(false), history = ref([]), historyClaimId = ref(null);
const draft = ref(null), correctionReason = ref('');
const undrafted = ref([]);
let active = true;
onBeforeUnmount(() => { active = false; });
const canEnroll = computed(() => /^\d{10}$/.test(selectedOffice.value?.practice_npi || '') && ['test', 'live'].includes(props.connection.mode) && (enrollmentType.value !== 'era' || acknowledgeEraRouting.value));
async function run(task) {
  if (busy.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try { await task(); } catch (e) { if (active) error.value = e.response?.data?.error?.message || 'The request could not be completed.'; }
  finally { if (active) busy.value = false; }
}
async function fetchEnrollments() {
  const { data } = await api.get('/medical-billing/claimmd/enrollments', { params: { agencyId: props.agencyId } });
  if (active) enrollments.value = data.items || [];
}
const loadEnrollments = () => run(fetchEnrollments);
async function fetchBillingOffices() {
  const { data } = await api.get('/medical-billing/claimmd/billing-offices', { params: { agencyId: props.agencyId } });
  if (active) billingOffices.value = data.items || [];
}
async function fetchUndrafted() {
  const { data } = await api.get('/medical-billing/claims/undrafted-notes', { params: { agencyId: props.agencyId } });
  if (active) undrafted.value = data.notes || [];
}
const loadUndrafted = () => run(fetchUndrafted);
const createDraft = note => run(async () => {
  await api.post('/medical-billing/claims', { agencyId: props.agencyId, clientId: note.client_id, clinicalSessionId: note.clinical_session_id, clinicalNoteId: note.id });
  if (active) { emit('updated'); notice.value = 'Claim prepared for billing review.'; await fetchUndrafted(); }
});
const searchPayers = () => run(async () => {
  const { data } = await api.get('/medical-billing/claimmd/payers', { params: { agencyId: props.agencyId, search: search.value } });
  if (active) { payers.value = data.payers || []; if (!payers.value.length) notice.value = 'No matching payers.'; }
});
function enroll(payerId) {
  if (!canEnroll.value || busy.value) return;
  // Open synchronously to avoid popup blockers; consume the one-use URL immediately.
  const popup = window.open('about:blank', '_blank');
  if (!popup) { error.value = 'Allow popups to open the secure enrollment form.'; return; }
  popup.opener = null;
  run(async () => {
    try {
      const { data } = await api.post('/medical-billing/claimmd/enrollments', { agencyId: props.agencyId, payerId, billingOfficeLocationId: Number(billingOfficeId.value), enrollmentType: enrollmentType.value, acknowledgeEraRouting: acknowledgeEraRouting.value });
      if (!active) { popup.close(); return; }
      popup.location.replace(data.url);
      notice.value = 'Complete the enrollment steps in the Claim.MD window. Progress updates arrive after Claim.MD processes them.';
      await fetchEnrollments();
    } catch (e) { popup.close(); throw e; }
  });
}
function reopenEnrollment(item) {
  const office = billingOffices.value.find(o => Number(o.id) === Number(item.billing_office_location_id));
  if (!office || office.practice_npi !== item.provider_npi) { error.value = 'This enrollment’s billing office or NPI has changed. Review the office profile and start a new enrollment.'; return; }
  billingOfficeId.value = office.id; enrollmentType.value = item.enrollment_type;
  if (item.enrollment_type === 'era' && !acknowledgeEraRouting.value) { error.value = 'Confirm ERA routing above, then click View / continue again.'; return; }
  enroll(item.payer_id);
}
const sync = () => run(async () => {
  const { data } = await api.post('/medical-billing/claimmd/responses/sync', { agencyId: props.agencyId });
  if (active) { notice.value = `${data.updated} claim updates saved.${data.moreAvailable ? ' More updates are available; sync again.' : ''}`; emit('updated'); if (historyClaimId.value) await fetchHistory(historyClaimId.value); }
});
async function fetchHistory(claimId) {
  const { data } = await api.get(`/medical-billing/claimmd/claims/${claimId}/history`, { params: { agencyId: props.agencyId } });
  if (active) { historyClaimId.value = claimId; history.value = data.history || []; }
}
const showHistory = claimId => run(() => fetchHistory(claimId));
const editClaim = claimId => run(async () => {
  review.value = null; approved.value = false; draft.value = null;
  const { data } = await api.get(`/medical-billing/claimmd/claims/${claimId}/draft`, { params: { agencyId: props.agencyId } });
  if (!active) return;
  if (!['draft','ready','rejected'].includes(data.claim.claim_lifecycle)) throw new Error('Claim is not editable');
  draft.value = { ...data, lines: data.lines.map(line => ({ ...line, dollars: (line.charge_cents / 100).toFixed(2), modifiers: (typeof line.modifiers_json === 'string' ? JSON.parse(line.modifiers_json || '[]') : line.modifiers_json || []).join(', ') })) };
  correctionReason.value = '';
});
const saveCorrection = () => run(async () => {
  const { claim, lines } = draft.value;
  const { data } = await api.patch(`/medical-billing/claimmd/claims/${claim.id}`, {
    agencyId: props.agencyId, revision: claim.billing_revision, reason: correctionReason.value,
    placeOfService: claim.place_of_service, billingNpi: claim.billing_npi, renderingNpi: claim.rendering_npi, taxonomyCode: claim.taxonomy_code,
    lines: lines.map(line => ({ id: Number(line.id), chargeCents: Math.round(Number(line.dollars) * 100), modifiers: line.modifiers.split(/[,\s]+/).filter(Boolean).map(m => m.toUpperCase()) }))
  });
  if (active) { draft.value = null; notice.value = data.message; emit('updated'); await fetchHistory(claim.id); }
});
const reviewClaim = claimId => run(async () => {
  review.value = null; approved.value = false;
  const { data } = await api.get(`/medical-billing/claimmd/claims/${claimId}/review`, { params: { agencyId: props.agencyId } });
  if (active) { review.value = data; historyClaimId.value = claimId; history.value = data.history || []; }
});
const submit = () => run(async () => {
  if (!approved.value || !review.value) return;
  const claimId = review.value.claimId;
  const { data } = await api.post(`/medical-billing/claimmd/claims/${claimId}/submit`, { agencyId: props.agencyId, approved: true, reviewHash: review.value.reviewHash, accountMode: props.connection.mode });
  if (active) { review.value = null; approved.value = false; notice.value = data.message; emit('updated'); await fetchHistory(claimId); }
});
onMounted(() => { if (props.connection.configured && ['all', 'payers'].includes(props.section)) run(async () => { await fetchBillingOffices(); await fetchEnrollments(); }); });
defineExpose({ reviewClaim, showHistory, editClaim });
</script>

<style scoped>
.claimmd-workspace { border: 1px solid #d6dfeb; padding: 1.25rem; border-radius: 12px; background: white; margin: 1rem 0; }
.actions { display:flex; flex-wrap:wrap; align-items:center; gap:.75rem; margin:.75rem 0; }
label { display:block; margin:.75rem 0; } input, select, button { padding:.5rem; } button { cursor:pointer; } button:disabled { cursor:default; opacity:.55; }
table { width:100%; border-collapse:collapse; margin:1rem 0; } th, td { padding:.6rem; border-bottom:1px solid #e2e8f0; text-align:left; }
.review { margin-top:1.5rem; padding:1rem; border:1px solid #d6dfeb; border-radius:8px; } .error { color:#a32121; } pre { white-space:pre-wrap; overflow-wrap:anywhere; } article { padding:.75rem 0; border-bottom:1px solid #e2e8f0; }
</style>
