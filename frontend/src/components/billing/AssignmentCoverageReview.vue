<template>
  <section class="assignment-coverage" aria-labelledby="assignment-coverage-title">
    <h3 id="assignment-coverage-title">Check coverage for provider assignment</h3>
    <p v-if="snapshot?.syntheticQaReviewAvailable">Fictional test policies only. This records a QA review without contacting a real payer or verifying actual benefits.</p><p v-else>Record the coverage you checked in the payer portal or by phone. Claim preparation and document review remain separate.</p>
    <p v-if="loading" role="status">Loading saved coverage…</p>
    <p v-if="error" class="review-error" role="alert">{{ error }}</p>
    <template v-if="snapshot">
      <div class="coverage-summary">
        <strong v-if="snapshot.insuranceSummary?.patientName">{{ snapshot.insuranceSummary.patientName }}</strong>
        <dl>
          <div><dt>Primary insurance</dt><dd>{{ summary.primary?.insurerName || 'Not recorded' }}<small v-if="summary.primary?.memberId">Member ID: {{ summary.primary.memberId }}</small></dd></div>
          <div><dt>Secondary insurance</dt><dd>{{ summary.secondary?.insurerName || 'None recorded' }}<small v-if="summary.secondary?.memberId">Member ID: {{ summary.secondary.memberId }}</small></dd></div>
          <div><dt>Verification date</dt><dd>{{ displayDate }}</dd></div>
        </dl>
      </div>
      <p v-for="missing in snapshot.missingAssignmentFields || []" :key="missing" class="review-error">{{ missing }}</p>
      <p v-if="!hasSavedPolicy && !snapshot.missingAssignmentFields?.length" class="review-error">Save the primary insurer and member ID before marking coverage verified.</p>
      <button type="button" class="secondary-button" :disabled="saving || loading" :aria-expanded="editingInsurance" @click="editingInsurance = !editingInsurance">{{ editingInsurance ? 'Close insurance editor' : 'Edit saved insurance details' }}</button>
      <ClientInsuranceEditor v-if="editingInsurance" :client-id="clientId" :agency-id="agencyId" assignment-review start-open @saved="insuranceSaved" />
      <p v-if="savedReview" class="saved-message" role="status">{{ savedReview.syntheticOnly ? 'Fictional QA review saved without payer contact.' : 'Coverage verification saved.' }} Checking whether you can return to provider assignment…</p>
      <form v-else-if="!editingInsurance" @submit.prevent="save">
        <label>How did you verify coverage?
          <select v-model="source" :disabled="saving || loading" required>
            <option value="">Select verification source</option>
            <option v-if="snapshot?.syntheticQaReviewAvailable" value="synthetic_qa">Fictional QA review—no payer contact</option>
            <option value="payer_portal">Payer / Medicaid portal</option>
            <option value="payer_phone">Payer phone verification</option>
          </select>
        </label>
        <label>Brief verification note or reference
          <textarea v-model="reference" :disabled="saving || loading" required minlength="5" maxlength="2000" placeholder="For example: Portal checked today; active coverage, no other insurance." />
        </label>
        <label class="attestation"><input v-model="attested" type="checkbox" :disabled="saving || loading || !hasSavedPolicy || stale" />
          <span v-if="source === 'synthetic_qa'">I reviewed the fictional client’s saved policies, other coverage and payer order for this QA test. This is not an attestation of real eligibility or payer contact.</span>
          <span v-else>I checked this client’s primary coverage, any secondary coverage and other insurance, and confirmed the payer order.<template v-if="summary.hasMedicaidCoverage"> I also reviewed Medicaid Other Insurance / TPL and resolved any discrepancies.</template></span>
        </label>
        <p class="review-help">A billing office or electronic payer ID is not needed for portal or phone verification. Only mark verified after completing these checks.</p>
        <button class="verify-button" :disabled="!canSave">{{ saving ? 'Saving verification…' : 'Mark checked and verified' }}</button>
      </form>
    </template>
    <button v-if="!loading && !saving" type="button" class="reload-button" @click="load">Reload saved coverage</button>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api.js';
import ClientInsuranceEditor from './ClientInsuranceEditor.vue';

const props = defineProps({ clientId: [Number, String], agencyId: [Number, String] });
const emit = defineEmits(['saved', 'updated']);
const denverDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const serviceDate = ref(denverDate()), snapshot = ref(null), loading = ref(false), saving = ref(false), error = ref('');
const source = ref(''), reference = ref(''), attested = ref(false), editingInsurance = ref(false), savedReview = ref(null), stale = ref(false);
const summary = computed(() => snapshot.value?.insuranceSummary || {});
const hasSavedPolicy = computed(() => !!String(summary.value.primary?.insurerName || '').trim() && !!String(summary.value.primary?.memberId || '').trim());
const displayDate = computed(() => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${serviceDate.value}T12:00:00Z`)));
const canSave = computed(() => !saving.value && !loading.value && !stale.value && !savedReview.value && snapshot.value?.readyForAssignmentReview === true && !!snapshot.value?.reviewToken && hasSavedPolicy.value && attested.value && (['payer_portal', 'payer_phone'].includes(source.value) || source.value === 'synthetic_qa' && snapshot.value?.syntheticQaReviewAvailable === true) && reference.value.trim().length >= 5);
const base = () => `/medical-billing/clients/${props.clientId}/coverage`;
let generation = 0;

async function load() {
  const current = ++generation;
  snapshot.value = null; loading.value = true; saving.value = false; error.value = ''; source.value = ''; reference.value = ''; attested.value = false; savedReview.value = null; stale.value = false;
  serviceDate.value = denverDate();
  try {
    const { data } = await api.get(base(), { params: { agencyId: props.agencyId, serviceDate: serviceDate.value, forAssignment: true }, skipGlobalLoading: true });
    if (current === generation) { snapshot.value = data; if(data.syntheticQaReviewAvailable === true) source.value='synthetic_qa'; }
  } catch (e) { if (current === generation) error.value = e.response?.data?.error?.message || 'Saved coverage could not be loaded. Please try again.'; }
  finally { if (current === generation) loading.value = false; }
}

async function insuranceSaved() {
  editingInsurance.value = false;
  await load();
  if (snapshot.value) emit('updated');
}

async function save() {
  if (!canSave.value) return;
  const current = generation; saving.value = true; error.value = '';
  try {
    const { data } = await api.post(`${base()}/review`, {
      agencyId: props.agencyId, serviceDate: serviceDate.value, assignmentReview: true,
      reviewToken: snapshot.value.reviewToken, status: 'verified', source: source.value,
      reference: reference.value.trim(), primaryChecked: true, secondaryChecked: !!summary.value.secondary,
      otherCoverageChecked: true, orderConfirmed: true, medicaidTplChecked: !!summary.value.hasMedicaidCoverage
    }, { skipGlobalLoading: true });
    if (current !== generation) return;
    savedReview.value = data; emit('saved', data);
  } catch (e) {
    if (current !== generation) return;
    error.value = e.response?.data?.error?.message || 'Verification could not be saved. Your provider assignment has not been changed.';
    if (e.response?.data?.error?.code === 'COVERAGE_REVIEW_STALE') { stale.value = true; attested.value = false; }
  } finally { if (current === generation) saving.value = false; }
}

watch(() => [props.clientId, props.agencyId], () => { editingInsurance.value = false; load(); }, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>

<style scoped>
.assignment-coverage{padding:16px 0}.assignment-coverage h3{margin:0 0 8px}.assignment-coverage p{line-height:1.5}.coverage-summary{background:#f1f7fa;border:1px solid #d4e3eb;border-radius:10px;padding:14px;margin-bottom:12px}.coverage-summary dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin:10px 0 0}.coverage-summary dt{font-size:.85rem;color:#475569}.coverage-summary dd{margin:5px 0 0;overflow-wrap:anywhere}.coverage-summary small{display:block;margin-top:4px}.assignment-coverage form{display:grid;gap:14px;margin-top:18px}.assignment-coverage form>label:not(.attestation){display:grid;gap:6px}.assignment-coverage select,.assignment-coverage textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #94a3b8;border-radius:7px;background:var(--bg-primary,#fff);color:inherit;font:inherit}.assignment-coverage textarea{min-height:76px;resize:vertical}.attestation{display:flex;align-items:flex-start;gap:10px;line-height:1.5}.attestation input{flex:0 0 auto;margin-top:5px;width:18px;height:18px}.assignment-coverage button{padding:10px 14px;border:1px solid #94a3b8;border-radius:8px;font:inherit;cursor:pointer}.assignment-coverage button:disabled{opacity:.6;cursor:default}.verify-button{background:#166b75;color:#fff;border-color:#166b75!important;justify-self:start;font-weight:600!important}.secondary-button,.reload-button{background:var(--bg-primary,#fff);color:inherit}.reload-button{margin-top:14px}.review-error{color:#a32332}.review-help{font-size:.9rem;color:#475569;margin:0}.saved-message{padding:12px;border-radius:8px;background:#eaf7ef;color:#166534}@media(max-width:520px){.coverage-summary dl{grid-template-columns:1fr}.verify-button{width:100%}}
</style>
