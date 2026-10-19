<template>
  <section class="documentation-readiness" aria-label="Client documentation readiness">
    <h4>Client documentation readiness</h4>
    <p>Review the documents required by this agency and payer for this service. Insurance verification, signed clinical notes and claim approval are separate checks. Provider assignment does not verify documents.</p>
    <label v-if="!scope">Review stage<select v-model="selectedScope" :disabled="busy" @change="load"><option value="treatment">Treatment intake</option><option value="screening">H0002 screening before admission</option></select></label>
    <p v-if="currentScope === 'screening'">Review consent, authority to screen and applicable screening documents. The full treatment intake may still be pending.</p>
    <p v-else>Review the full intake documentation applicable to ongoing treatment, including required consents, disclosures and releases.</p>
    <label v-if="!serviceDate">Check for service date<input v-model="selectedDate" type="date" :disabled="busy" @change="load" /></label>
    <button type="button" :disabled="busy" @click="load">Refresh documentation check</button>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="data">
      <p><strong>{{ statusLabels[data.status] || 'Review required' }}</strong></p>
      <p v-for="blocker in data.blockers" :key="blocker">{{ blocker }}</p>
      <p>{{ data.evidence.uploadedFiles }} uploaded files · {{ data.evidence.signedForms }} signed intake forms. These counts show receipt, not verification.</p>
      <details><summary>Paperwork receipt checklist</summary><ul><li v-for="item in data.evidence.paperwork" :key="item.key">{{ item.label }}: {{ receiptLabels[item.status] }}</li></ul><p>Items for later treatment may remain pending during screening. Insurance cards are optional. Open the client’s Documents to review the actual records.</p></details>
      <p v-if="data.review">Last review: {{ data.review.reference }}</p>
      <form @submit.prevent="save"><fieldset :disabled="busy">
        <label>Documentation outcome<select v-model="draft.status"><option value="incomplete">Incomplete / needs review</option><option value="verified">Verified for this stage</option></select></label>
        <label>Documents effective from<input v-model="draft.effectiveFrom" type="date" required /></label>
        <label>Valid through, if applicable<input v-model="draft.effectiveThrough" type="date" /></label>
        <label>Documents reviewed or outstanding items<textarea v-model="draft.reference" required minlength="10" maxlength="2000" placeholder="Identify the records, applicable requirements and any items still needed or not applicable. Confirm that documents cover the service dates." /></label>
        <label><input v-model="draft.authorityReviewed" type="checkbox" /> I reviewed consent and the signer’s authority for this stage and the dates above.</label>
        <label><input v-model="draft.requiredDocumentsReviewed" type="checkbox" /> I verified all documents required for this stage, including signatures, applicable releases and expiration dates.</label>
        <button :disabled="busy || (draft.status === 'verified' && (!draft.authorityReviewed || !draft.requiredDocumentsReviewed))">Save documentation review</button>
      </fieldset></form>
    </template>
  </section>
</template>
<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api.js';
const props = defineProps({ clientId: [Number, String], agencyId: [Number, String], scope: String, serviceDate: String });
const emit = defineEmits(['saved']);
const selectedScope = ref('treatment'), selectedDate = ref(new Date().toLocaleDateString('en-CA'));
const currentScope = computed(() => props.scope || selectedScope.value), currentDate = computed(() => (props.serviceDate || selectedDate.value).slice(0, 10));
const data = ref(null), busy = ref(false), error = ref(''), notice = ref(''), draft = ref({});
const statusLabels = { not_reviewed: 'Documentation review needed', verified: 'Documentation verified for this stage and date', incomplete: 'Documentation incomplete', changed: 'Documents changed — review again', outside_dates: 'Review does not cover this date' };
const receiptLabels = { not_reviewed: 'Not reviewed', needed: 'Needed', received: 'Received' };
const base = () => `/medical-billing/clients/${props.clientId}/documentation-readiness`;
let generation = 0;
async function load() {
  const g = ++generation; data.value = null; busy.value = true; error.value = ''; notice.value = '';
  draft.value = { status: 'incomplete', effectiveFrom: currentDate.value, effectiveThrough: '', reference: '', authorityReviewed: false, requiredDocumentsReviewed: false };
  try { const response = await api.get(base(), { params: { agencyId: props.agencyId, scope: currentScope.value, serviceDate: currentDate.value } }); if (g === generation) data.value = response.data; }
  catch (e) { if (g === generation) error.value = e.response?.data?.error?.message || 'Documentation check could not be loaded'; }
  finally { if (g === generation) busy.value = false; }
}
async function save() {
  const g = generation; busy.value = true; error.value = ''; notice.value = '';
  try {
    await api.post(base(), { agencyId: props.agencyId, scope: currentScope.value, sourceHash: data.value.sourceHash, previousReviewId: data.value.reviewId, ...draft.value });
    if (g !== generation) return;
    await load();
    if (g + 1 === generation) { notice.value = 'Documentation review saved. Other claim requirements still apply.'; emit('saved'); }
  } catch (e) { if (g === generation) error.value = e.response?.data?.error?.message || 'Documentation review could not be saved'; }
  finally { if (g === generation) busy.value = false; }
}
watch(() => [props.clientId, props.agencyId, props.scope, props.serviceDate], () => { selectedScope.value = 'treatment'; load(); }, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>
<style scoped>
.documentation-readiness{border-top:1px solid var(--border);padding:16px 0;margin-top:16px}label{display:block;margin:10px 0}button{margin:6px 0;padding:8px}fieldset{border:0;padding:0}textarea{display:block;width:100%;min-height:80px}[role=alert]{color:var(--app-text-red,#b91c1c)}
</style>
