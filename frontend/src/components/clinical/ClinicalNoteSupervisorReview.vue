<template>
  <section class="supervisor-review cosign-review" :class="{ 'supervisor-review--full': fullPage }" :aria-label="`Supervisor review for note ${noteId}`" :aria-busy="loading || busy">
    <header class="review-header">
      <div><p class="eyebrow">Supervisor review · Note #{{ noteId }}</p><h2>{{ clientLabel }}</h2></div>
      <div class="header-actions">
        <button v-if="!fullPage" type="button" :disabled="busy" @click="$emit('open-full', context)">Open full page</button>
        <button type="button" aria-label="Close supervisor review" :disabled="busy" @click="$emit('close')">Close</button>
      </div>
    </header>
    <p v-if="loading" class="review-message" role="status">Loading signed note and review details…</p>
    <div v-if="error" class="review-error" role="alert">{{ error }} <button v-if="!busy" type="button" @click="load">Reload note</button></div>
    <template v-if="note && review && !loading">
      <div class="review-summary">
        <dl class="service-facts">
          <div><dt>Date of service</dt><dd>{{ date(note.dateOfService) }}</dd></div>
          <div><dt>Code</dt><dd>{{ note.serviceCode || 'Not recorded' }}</dd></div>
          <div><dt>Duration</dt><dd :class="{ missing: !details.durationMinutes }">{{ details.durationMinutes != null && details.durationMinutes !== '' ? `${details.durationMinutes} min` : 'Not recorded' }}</dd></div>
          <div><dt>Participants</dt><dd>{{ details.participants || chart.participants || 'Not recorded' }}<small v-if="typeof details.patientPresent === 'boolean'" class="participant-presence">Patient {{ details.patientPresent ? 'present' : 'not present' }}</small></dd></div>
          <div><dt>Location</dt><dd :class="{ missing: !details.locationLabel }">{{ details.locationLabel || 'Not recorded' }}</dd></div>
          <div><dt>Start – end <span v-if="serviceTimeZone">({{ serviceTimeZone }})</span></dt><dd :class="{ missing: !details.startTime || !details.endTime }">{{ details.startTime || 'Not recorded' }} – {{ details.endTime || 'Not recorded' }}</dd></div>
        </dl>
        <div class="signature-state"><span>{{ note.providerSignedAt ? 'Author signed' : 'Author signature missing' }}</span><span>{{ review.cosignedAt ? 'Supervisor approved' : 'Awaiting supervisor approval' }}</span></div>
        <p v-if="note.pendingServiceDetails" class="pending-label">Service details above include an amendment awaiting your approval. <button type="button" :disabled="busy" @click="showCorrections = true">Revise pending amendment</button></p>
        <CosignReviewTimer v-if="review.canTrackCosignTime && reviewProviderId" :key="`${noteId}-${review.contentHash}`" compact :agency-id="agencyId" :provider-id="reviewProviderId" :note-id="noteId" :content-hash="review.contentHash" />
      </div>
      <div ref="body" class="review-body">
        <p v-if="notice" class="review-notice" role="status">{{ notice }}</p>
        <section v-if="openRequests.length" class="request-history" aria-label="Supervisor requests">
          <article v-for="request in openRequests" :key="request.id"><strong>{{ actionLabel(request.action || request.requestType || request.request_type) }}</strong><p>{{ readableReviewMessage(request.message) }}</p><small>{{ timestamp(request.createdAt || request.created_at) }}</small></article>
        </section>
        <div v-if="missingDetails.length && !review.cosignedAt" class="missing-details" role="status">
          <strong>Complete service documentation:</strong> {{ missingDetails.join(', ') }}.
          <button v-if="canAmendService" type="button" :disabled="busy || showFeedback" @click="showCorrections = true">Add or correct service details</button>
        </div>
        <section v-if="sections.length" class="note-content" aria-label="Entered note content">
          <details v-for="section in sections" :key="section.id" open class="content-section">
            <summary>{{ section.title.replace(/^[SOIP]\s*-\s*/i, '') }}</summary><p class="prose">{{ section.text }}</p>
          </details>
        </section>
        <p v-else class="muted">No narrative content was recorded.</p>
        <section v-if="ratings.length" class="ratings" aria-label="Treatment goal ratings">
          <h3>Treatment goals</h3>
          <div class="rating-heading"><span>Goal / objective</span><span>Start</span><span>Recent</span><span>Now</span><span>Goal</span></div>
          <details v-for="row in ratings" :key="row.key" class="rating-row">
            <summary :title="row.detail"><span>{{ row.label }}</span><span>{{ score(row.start) }}</span><span>{{ score(row.recent) }}</span><strong>{{ score(row.current) }}</strong><span>{{ score(row.target) }}</span></summary>
            <p class="prose">{{ row.detail || 'No additional objective details recorded.' }}</p>
          </details>
        </section>
        <section v-if="mse.notable.length" aria-label="Mental status findings" class="clinical-section">
          <h3>Mental status findings</h3><ul><li v-for="row in mse.notable" :key="row.domain"><strong>{{ row.domain }}:</strong> {{ row.status }}<span v-if="row.detail"> — {{ row.detail }}</span></li></ul>
        </section>
        <details v-if="mse.normal.length || chart.skippedMseReason" class="content-section">
          <summary>Mental status · {{ chart.skippedMseReason ? 'not assessed' : 'normal findings' }}</summary>
          <p v-if="chart.skippedMseReason">{{ chart.skippedMseReason }}</p>
          <ul><li v-for="row in mse.normal" :key="row.domain">{{ row.domain }}: {{ row.status }}</li></ul>
        </details>
        <section v-if="riskText" class="clinical-section"><h3>Risk assessment</h3><p class="prose">{{ riskText }}</p></section>
        <section v-if="medicationText" class="clinical-section"><h3>Medications</h3><p class="prose">{{ medicationText }}</p></section>
        <nav class="detail-tabs" aria-label="Additional note information">
          <button v-for="tab in infoTabs" :key="tab.id" type="button" :title="tab.hint" :aria-expanded="activeInfo === tab.id" @click="toggleInfo(tab.id)">{{ tab.label }}</button>
          <button v-if="canAmendService" type="button" title="Record a signed, attributable amendment to service details" :disabled="busy || showFeedback" :aria-expanded="showCorrections" @click="showCorrections = true">Service amendment</button>
        </nav>
        <section v-if="activeInfo === 'signature'" class="info-panel" aria-label="Electronic signature details">
          <h3>Electronic signatures</h3><p>{{ note.attestation?.statement || `${note.providerSigner?.name || 'Author'} signed ${timestamp(note.providerSignedAt)}.` }}</p>
          <dl><div><dt>Provider</dt><dd>{{ providerLabel }}</dd></div><div><dt>Signed at</dt><dd>{{ timestamp(note.providerSignedAt) }}</dd></div></dl>
          <p v-if="note.supervisorCosign?.statement">{{ note.supervisorCosign.statement }}</p>
        </section>
        <section v-if="activeInfo === 'claim'" class="info-panel" aria-label="Claim data">
          <h3>Claim data</h3><dl><div><dt>Payer</dt><dd>{{ note.clientPayer?.name || 'Not available' }}</dd></div><div><dt>Rendering provider</dt><dd>{{ providerLabel }}</dd></div><div v-if="note.primaryDiagnosis"><dt>Diagnosis</dt><dd>{{ [note.primaryDiagnosis.icd10Code, note.primaryDiagnosis.description].filter(Boolean).join(' · ') }}</dd></div><div v-if="note.clientPayer?.memberId"><dt>Member ID</dt><dd>{{ note.clientPayer.memberId }}</dd></div><div v-if="note.linkedClaim?.renderingNpi || note.providerSigner?.npi"><dt>Rendering NPI</dt><dd>{{ note.linkedClaim?.renderingNpi || note.providerSigner.npi }}</dd></div><div v-if="note.linkedClaim?.billingNpi"><dt>Billing NPI</dt><dd>{{ note.linkedClaim.billingNpi }}</dd></div><div><dt>Service</dt><dd>{{ note.serviceCode || 'Not recorded' }} · {{ note.billingPrimaryUnits || 1 }} unit(s)</dd></div><div><dt>Place of service</dt><dd>{{ details.placeOfService || 'Not recorded' }}</dd></div><div><dt>Status</dt><dd>{{ note.linkedClaim?.statusLabel || 'No claim linked' }}</dd></div></dl>
          <p class="muted">Supervisory approval releases documentation for billing review. It does not transmit a claim.</p>
        </section>
        <section v-if="activeInfo === 'addenda'" class="info-panel" aria-label="Signed addenda and amendments">
          <h3>Addenda and amendments</h3>
          <article v-for="entry in addenda" :key="entry.id" class="entry"><strong>{{ entryLabel(entry.entryKind || entry.entry_kind) }}</strong><p class="prose">{{ entry.body }}</p><p v-if="entry.reason || entry.entry_reason">Reason: {{ entry.reason || entry.entry_reason }}</p><small>{{ timestamp(entry.authorSignedAt || entry.author_signed_at || entry.createdAt || entry.created_at) }} · {{ entry.createdByName || `User #${entry.createdByUserId || entry.created_by_user_id || 'unknown'}` }}</small></article>
          <p v-if="!addenda.length" class="muted">No addenda or amendments.</p>
        </section>
        <section v-if="activeInfo === 'materials'" class="info-panel" aria-label="Supporting materials">
          <h3>Supporting materials</h3><p v-if="materialsLoading">Loading supporting materials…</p><p v-else-if="materialsError" role="alert">{{ materialsError }}</p>
          <ul v-else-if="materials.length"><li v-for="item in materials" :key="item.id">{{ item.title || item.filename || `Document #${item.id}` }}<span v-if="item.document_type"> · {{ item.document_type.replace(/_/g, ' ') }}</span></li></ul>
          <p v-else class="muted">No supporting documents listed for this encounter.</p>
        </section>
        <form v-if="showCorrections && canAmendService" class="info-panel amendment-form" @submit.prevent="saveCorrection">
          <h3>Service documentation amendment</h3><p>Record verified encounter details and the reason for your change. Your signed amendment preserves the original, requires fresh supervisory approval, and asks the author to acknowledge it.</p>
          <p v-if="serviceTimeZone" class="muted">Start and end times use {{ serviceTimeZone }} on the date of service.</p>
          <p v-if="locationsLoading" role="status">Loading service locations…</p>
          <p v-else-if="locationsError" role="alert">{{ locationsError }} <button type="button" @click="loadServiceLocations">Retry locations</button></p>
          <p v-else-if="!serviceLocations.length && !retainedLocation" role="status">No active service locations are available. Ask billing to configure the correct encounter location before signing an amendment.</p>
          <div v-if="note.serviceDetailProposal" class="proposal-notice">
            <p>Submission proposal: {{ note.serviceDetailProposal.dateOfService }}, {{ note.serviceDetailProposal.startTime }}–{{ note.serviceDetailProposal.endTime }} (10 minutes). Verify these are the actual service times on this note’s date of service.</p>
            <button type="button" :disabled="busy || note.serviceDetailProposal.dateOfService !== String(note.dateOfService || '').slice(0,10) || note.serviceDetailProposal.crossesMidnight" @click="applySubmissionProposal">Use proposed times</button>
          </div>
          <div class="correction-fields">
            <label>Duration (minutes)<input v-model="correction.durationMinutes" data-testid="duration" type="number" min="1" max="1440" required :disabled="busy" /></label>
            <label>Service location<select v-model="correction.serviceLocationId" data-testid="location" required :disabled="busy || locationsLoading"><option value="">Select the documented location</option><option v-if="retainedLocation" value="documented">Keep documented setting: {{ retainedLocation.name }} · POS {{ retainedLocation.place_of_service }}</option><option v-for="location in serviceLocations" :key="location.id" :value="location.id">{{ location.name }} · POS {{ location.place_of_service }}</option></select></label>
            <label>Start time<input v-model="correction.startTime" data-testid="start" type="time" required :disabled="busy" /></label>
            <label>End time<input v-model="correction.endTime" data-testid="end" type="time" required :disabled="busy" /></label>
            <label>Place of service<input :value="selectedServiceLocation?.place_of_service || ''" data-testid="pos" readonly placeholder="From selected location" /></label>
          </div>
          <label>Participants<input v-model="correction.participants" data-testid="participants" maxlength="1000" placeholder="Names and roles of the people who participated" :disabled="busy" /></label>
          <label>Patient present<select v-model="correction.patientPresent" data-testid="patient-present" :disabled="busy"><option :value="null">Confirm patient presence</option><option :value="true">Patient present</option><option :value="false">Patient not present</option></select></label>
          <p v-if="selectedLocationAddress" class="muted">Service address: {{ selectedLocationAddress }}</p>
          <label>Reason and source of verified details<textarea v-model="correctionReason" data-testid="correction-reason" maxlength="2000" rows="2" required :disabled="busy" /></label>
          <label class="check-line"><input v-model="correctionAttested" data-testid="correction-attestation" type="checkbox" :disabled="busy" /> I verified these encounter details and electronically sign this amendment as accurate.</label>
          <button type="submit" :disabled="busy || !validCorrection">Sign amendment</button><button type="button" :disabled="busy" @click="showCorrections = false">Cancel amendment</button>
        </form>
        <form v-if="showFeedback && canReview" class="info-panel feedback-form" @submit.prevent="sendFeedback">
          <h3>Send to note author</h3>
          <label>Action<select v-model="feedbackAction" data-testid="feedback-action" :disabled="busy"><option value="changes_needed">Changes needed · return for correction</option><option value="review_acknowledge">Review / acknowledge needed · no new signature</option><option value="feedback">Feedback · no response required</option></select></label>
          <p class="muted">{{ feedbackHelp }}</p>
          <label>Your request or feedback<textarea v-model="feedbackMessage" data-testid="feedback-message" rows="3" maxlength="4000" required :disabled="busy" /></label>
          <button type="submit" :disabled="busy || !feedbackMessage.trim()">Send {{ feedbackAction === 'feedback' ? 'feedback' : 'request' }}</button><button type="button" :disabled="busy" @click="cancelFeedback">Cancel</button>
        </form>
      </div>
      <footer class="review-footer">
        <template v-if="canSign">
          <label class="check-line"><input v-model="attested" data-testid="supervisor-attestation" type="checkbox" :disabled="busy || missingDetails.length > 0 || hasChangesNeeded || hasUnfinishedAction" /> {{ isBillable ? 'I reviewed this note, its service details and all amendments, and approve this documentation for billing review under my supervisory responsibility.' : 'I reviewed this note and all amendments, and approve this clinical documentation under my supervisory responsibility.' }}</label>
          <p v-if="hasChangesNeeded" class="missing">Changes have been requested. Review the author's correction before approving.</p>
          <p v-if="hasUnfinishedAction" class="missing" role="status">{{ showCorrections ? 'Sign or cancel the service amendment before approving this note.' : 'Send or cancel your request or feedback before approving this note.' }}</p>
          <div class="footer-actions"><button type="button" :disabled="busy || showCorrections" @click="showFeedback = true">Return / provide feedback</button><button type="button" class="approve" data-testid="cosign" :disabled="busy || !attested || missingDetails.length > 0 || hasChangesNeeded || hasUnfinishedAction" @click="sign">{{ busy ? 'Saving…' : isBillable ? 'Cosign & approve for billing review' : 'Cosign & approve documentation' }}</button></div>
        </template>
        <template v-else><p class="muted">{{ review.cosignedAt ? 'This version has been approved by the supervisor.' : 'Only the assigned responsible supervisor can approve this note.' }}</p><button v-if="canReview" type="button" :disabled="busy || showCorrections" @click="showFeedback = true">Provide feedback</button></template>
      </footer>
    </template>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import api from '../../services/api.js';
import { readableReviewMessage } from '../../utils/noteReviewWork.js';
import CosignReviewTimer from './CosignReviewTimer.vue';
import { formatMedicationsText, formatRiskAssessmentText } from '../../utils/noteAidUiHelpers.js';
import { missingSupervisorServiceDetails, parseReviewContent, supervisorMentalStatus, supervisorNoteSections, supervisorObjectiveRatings, supervisorServiceDetails } from '../../utils/supervisorNoteReview.js';

const props = defineProps({ noteId: { type: [Number, String], required: true }, agencyId: { type: [Number, String], required: true }, providerId: { type: [Number, String], default: null }, clientName: { type: String, default: '' }, fullPage: { type: Boolean, default: false } });
const emit = defineEmits(['signed', 'returned', 'open-full', 'close']);
const note = ref(null), review = ref(null), reviewProviderId = ref(null), loading = ref(false), busy = ref(false), error = ref(''), notice = ref(''), attested = ref(false);
const activeInfo = ref(''), showCorrections = ref(false), showFeedback = ref(false), feedbackAction = ref('changes_needed'), feedbackMessage = ref('');
const correction = reactive({ durationMinutes: '', locationLabel: '', startTime: '', endTime: '', placeOfService: '', serviceLocationId: '', participants: '', patientPresent: null }), correctionReason = ref(''), correctionAttested = ref(false);
const materials = ref([]), materialsLoading = ref(false), materialsError = ref(''), materialsLoaded = ref(false);
const serviceLocations = ref([]), locationsLoading = ref(false), locationsError = ref('');
const body = ref(null);
let generation = 0;
const context = computed(() => ({ noteId: Number(props.noteId), agencyId: Number(props.agencyId) }));
const canonical = computed(() => parseReviewContent(review.value?.content));
const chart = computed(() => note.value?.structuredChart || note.value?.metadata?.structuredChart || {});
const clientLabel = computed(() => note.value?.clientName || props.clientName || note.value?.metadata?.clientName || chart.value.clientName || 'Client');
const details = computed(() => supervisorServiceDetails(note.value));
const serviceTimeZone = computed(() => note.value?.serviceTimeZone || note.value?.sessionTiming?.timeZone || '');
const isBillable = computed(() => note.value?.isBillable !== false);
const missingDetails = computed(() => isBillable.value ? missingSupervisorServiceDetails(details.value, {requireParticipants:note.value?.serviceCode === 'H0002'}) : []);
const sections = computed(() => supervisorNoteSections(canonical.value?.note ?? note.value?.outputJson));
const mse = computed(() => supervisorMentalStatus(chart.value.mentalStatusExam));
const riskText = computed(() => {
  const risk = chart.value.riskAssessment;
  const enteredItems = Object.values(risk?.items || {}).some(item => String(item?.option || item?.detail || '').trim() || (item?.status && item.status !== 'selected'));
  const enteredAreas = (risk?.areas || []).some(item => String(item?.name || '').trim());
  if (!risk || (!risk.patientDeniesAll && !enteredItems && !enteredAreas && !(risk.protectiveFactors || []).length && !String(risk.notes || '').trim())) return '';
  return formatRiskAssessmentText(risk);
});
const medicationText = computed(() => chart.value.medications?.noneCurrently && !chart.value.medications?.comments && !chart.value.medications?.commentsHtml ? '' : formatMedicationsText(chart.value.medications));
const ratings = computed(() => supervisorObjectiveRatings(note.value?.objectiveRatings));
const addenda = computed(() => Array.isArray(canonical.value?.addenda) ? canonical.value.addenda : note.value?.addenda || []);
const openRequests = computed(() => (note.value?.reviewRequests || []).filter(request => !request.resolvedAt && !request.resolved_at && !request.acknowledgedAt && !request.acknowledged_at && !request.dismissedAt && !request.dismissed_at && request.status !== 'resolved' && request.status !== 'acknowledged' && request.status !== 'dismissed'));
const hasChangesNeeded = computed(() => openRequests.value.some(request => (request.action || request.requestType || request.request_type) === 'changes_needed'));
const hasUnfinishedAction = computed(() => showCorrections.value || !!feedbackMessage.value.trim());
const canReview = computed(() => review.value?.canCosign === true || note.value?.canSuperviseReview === true);
const canAmendService = computed(() => canReview.value && isBillable.value && !!note.value?.clinicalSessionId);
const canSign = computed(() => review.value?.canCosign === true && !!note.value?.providerSignedAt && !review.value?.cosignedAt);
const providerLabel = computed(() => [note.value?.providerSigner?.name, note.value?.providerSigner?.credentials].filter(Boolean).join(', ') || 'Not recorded');
const retainedLocation = computed(() => !details.value.serviceLocationId && details.value.locationLabel && details.value.placeOfService ? {id:null,name:details.value.locationLabel,place_of_service:details.value.placeOfService} : null);
const selectedServiceLocation = computed(() => correction.serviceLocationId === 'documented' ? retainedLocation.value : serviceLocations.value.find(location => Number(location.id) === Number(correction.serviceLocationId)) || null);
const selectedLocationAddress = computed(() => { const location = selectedServiceLocation.value; return location ? [location.street_address || location.billing_office_street, location.city || location.billing_office_city, location.state || location.billing_office_state, location.postal_code || location.billing_office_postal].filter(Boolean).join(', ') : ''; });
const validCorrection = computed(() => !locationsLoading.value && !locationsError.value && correctionAttested.value && correctionReason.value.trim() && selectedServiceLocation.value && !missingSupervisorServiceDetails(correction, { requirePlaceOfService: true, requireParticipants:note.value?.serviceCode === 'H0002' }).length && Number(correction.durationMinutes) >= 1 && Number(correction.durationMinutes) <= 1440);
const feedbackHelp = computed(() => ({ changes_needed: 'The note returns to the author with your request at the top. Approval waits for their signed correction.', review_acknowledge: 'The author must review and acknowledge your message. Their existing signature remains valid.', feedback: 'The author receives your feedback; no acknowledgement or new signature is required.' }[feedbackAction.value]));
const infoTabs = computed(() => [{ id: 'signature', label: 'Signature details', hint: `${providerLabel.value} · ${timestamp(note.value?.providerSignedAt)}` }, { id: 'claim', label: 'Claim data', hint: `${note.value?.clientPayer?.name || 'Payer not available'} · ${note.value?.linkedClaim?.statusLabel || 'No claim linked'}` }, { id: 'addenda', label: `Addenda (${addenda.value.length})`, hint: 'Read separately signed additions and amendments' }, { id: 'materials', label: 'Supporting materials', hint: 'List documents attached to this encounter' }]);
const score = value => value == null || value === '' ? '—' : value;
const date = value => value ? String(value).slice(0, 10) : 'Not recorded';
const timestamp = value => { if (!value) return 'Not recorded'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(); };
const actionLabel = action => ({ changes_needed: 'Changes needed', review_acknowledge: 'Review / acknowledge needed', feedback: 'Feedback' }[action] || 'Supervisor request');
const entryLabel = kind => ({ correction: 'Amendment / correction', late_entry: 'Late entry', addendum: 'Addendum' }[kind] || 'Signed entry');
const errorMessage = (e, fallback) => e.response?.data?.error?.message || e.message || fallback;

watch([correction, correctionReason], () => { correctionAttested.value = false; }, { deep: true });
watch(showCorrections, async value => { if (value) { Object.assign(correction, details.value, {serviceLocationId:details.value.serviceLocationId || (retainedLocation.value ? 'documented' : '')}); if (!correction.participants && note.value?.serviceDetailProposal?.participants) { correction.participants=note.value.serviceDetailProposal.participants; correction.patientPresent=note.value.serviceDetailProposal.patientPresent; } correctionReason.value = ''; correctionAttested.value = false; attested.value = false; await loadServiceLocations(); await focusForm('.amendment-form'); } });
watch(selectedServiceLocation, location => { if (location) { correction.locationLabel = location.name; correction.placeOfService = location.place_of_service; } });
watch(showFeedback, async value => { if (value) await focusForm('.feedback-form'); });
watch(hasUnfinishedAction, value => { if (value) attested.value = false; });
watch(() => `${Number(props.agencyId)}:${Number(props.noteId)}`, () => { notice.value = ''; load(); }, { immediate: true });
onBeforeUnmount(() => { generation++; });

async function focusForm(selector) {
  await nextTick();
  const form = body.value?.querySelector(selector);
  form?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  form?.querySelector('textarea, input, select')?.focus();
}

function applySubmissionProposal() {
  const proposal=note.value?.serviceDetailProposal;
  if (!proposal || proposal.dateOfService !== String(note.value?.dateOfService || '').slice(0,10) || proposal.crossesMidnight) return;
  Object.assign(correction,{durationMinutes:proposal.durationMinutes,startTime:proposal.startTime,endTime:proposal.endTime});
  correctionAttested.value=false;
}

function cancelFeedback() { feedbackMessage.value = ''; showFeedback.value = false; }

async function load(attempt = 0) {
  const retry = Number.isInteger(attempt) ? attempt : 0;
  const g = ++generation;
  loading.value = true; error.value = ''; note.value = null; review.value = null; attested.value = false; busy.value = false; showCorrections.value = false; showFeedback.value = false; activeInfo.value = ''; feedbackMessage.value = ''; materials.value = []; materialsLoaded.value = false; materialsLoading.value = false; materialsError.value = ''; serviceLocations.value = []; locationsLoading.value = false; locationsError.value = '';
  try {
    const { data } = await api.get(`/medical-billing/notes/${props.noteId}`, { params: { agencyId: Number(props.agencyId) }, skipGlobalLoading:true });
    if (g !== generation) return;
    if (!data.note) throw new Error('The note is not available.');
    const provider = data.note.providerSignedByUserId || data.note.providerSigner?.id || props.providerId;
    if (!provider) throw new Error('The signed note author is required for supervisor review.');
    const result = await api.get(`/supervision/supervisee/${provider}/document-reviews/note/${props.noteId}`, { params: { agencyId: Number(props.agencyId) }, skipGlobalLoading:true });
    if (g !== generation) return;
    if (!result.data?.contentHash) throw new Error('The review version is unavailable. Reload before signing.');
    if (!data.note.reviewSnapshotToken || data.note.reviewSnapshotToken !== result.data.reviewSnapshotToken) {
      if (retry < 1) return load(retry + 1);
      throw new Error('The note details changed while opening this review, or the current review snapshot is unavailable. Reload before signing.');
    }
    note.value = { ...data.note, ...(result.data.reviewSnapshot || {}) }; review.value = result.data; reviewProviderId.value = provider;
  } catch (e) { if (g === generation) error.value = errorMessage(e, 'Unable to load supervisor review.'); }
  finally { if (g === generation) loading.value = false; }
}

async function sign() {
  if (busy.value || !canSign.value || !attested.value || missingDetails.value.length || hasChangesNeeded.value || hasUnfinishedAction.value) return;
  const g = generation; busy.value = true; error.value = '';
  try {
    const { data } = await api.post(`/medical-billing/notes/${props.noteId}/cosign`, { agencyId: Number(props.agencyId), contentHash: review.value.contentHash, reviewSnapshotToken: review.value.reviewSnapshotToken, reviewedAndApproved: true }, {skipGlobalLoading:true});
    if (g === generation) { attested.value = false; review.value = { ...review.value, cosignedAt: data.cosignedAt || new Date().toISOString() }; emit('signed', { ...context.value, ...data }); }
  } catch (e) { if (g === generation) { attested.value = false; error.value = errorMessage(e, 'Unable to approve this note.'); } }
  finally { if (g === generation) busy.value = false; }
}

async function sendFeedback() {
  if (busy.value || !canReview.value || !feedbackMessage.value.trim()) return;
  const g = generation; busy.value = true; error.value = '';
  try {
    const action = feedbackAction.value;
    const { data } = await api.post(`/medical-billing/notes/${props.noteId}/supervisor-review`, { agencyId: Number(props.agencyId), contentHash: review.value.contentHash, reviewSnapshotToken: review.value.reviewSnapshotToken, action, message: feedbackMessage.value.trim() }, {skipGlobalLoading:true});
    if (g !== generation) return;
    showFeedback.value = false; feedbackMessage.value = ''; attested.value = false;
    if (data.reviewRequest) note.value = { ...note.value, reviewRequests: [...(note.value.reviewRequests || []), data.reviewRequest] };
    notice.value = action === 'feedback' ? 'Feedback sent to the author.' : 'Your request is now in the author’s My work queue.';
    emit('returned', { ...context.value, action, ...data });
    if (action !== 'changes_needed') await load();
  } catch (e) { if (g === generation) error.value = errorMessage(e, 'Unable to send your request.'); }
  finally { if (g === generation) busy.value = false; }
}

async function saveCorrection() {
  if (busy.value || !canAmendService.value || !validCorrection.value) return;
  const g = generation; busy.value = true; error.value = ''; attested.value = false;
  try {
    await api.post(`/medical-billing/notes/${props.noteId}/service-details`, { agencyId: Number(props.agencyId), contentHash: review.value.contentHash, reviewSnapshotToken: review.value.reviewSnapshotToken, reason: correctionReason.value.trim(), attested: true, serviceDetails: { ...correction, durationMinutes: Number(correction.durationMinutes), serviceLocationId: Number(correction.serviceLocationId) || null } }, {skipGlobalLoading:true});
    if (g !== generation) return;
    notice.value = 'Amendment signed. Review the updated details and attest again to approve this version. The author will be asked to acknowledge your amendment.';
    await load();
  } catch (e) { if (g === generation) { correctionAttested.value = false; error.value = errorMessage(e, 'Unable to save the service amendment.'); } }
  finally { if (g === generation) busy.value = false; }
}

async function loadServiceLocations() {
  const g = generation;
  locationsLoading.value = true; locationsError.value = '';
  try {
    const { data } = await api.get('/medical-billing/service-locations', { params: { agencyId: Number(props.agencyId) }, skipGlobalLoading:true });
    if (g !== generation) return;
    serviceLocations.value = (data.items || []).filter(location => location.is_active !== false && location.is_active !== 0 && location.is_active !== '0');
    if (correction.serviceLocationId !== 'documented' && !selectedServiceLocation.value) correction.serviceLocationId = '';
  } catch (e) { if (g === generation) locationsError.value = errorMessage(e, 'Unable to load active service locations.'); }
  finally { if (g === generation) locationsLoading.value = false; }
}

async function toggleInfo(id) {
  activeInfo.value = activeInfo.value === id ? '' : id;
  if (id !== 'materials' || materialsLoaded.value || materialsLoading.value) return;
  const g = generation; materialsLoading.value = true; materialsError.value = '';
  try {
    if (note.value?.clinicalSessionId) {
      const { data } = await api.get(`/clinical-data/sessions/${note.value.clinicalSessionId}/artifacts`, { params: { includeDeleted: 'false' } });
      if (g !== generation) return;
      materials.value = (data.artifacts?.documents || []).filter(item => !item.is_deleted);
    } else materials.value = note.value?.supportingMaterials || [];
    materialsLoaded.value = true;
  } catch (e) { if (g === generation) materialsError.value = errorMessage(e, 'Unable to load supporting materials.'); }
  finally { if (g === generation) materialsLoading.value = false; }
}
</script>

<style scoped>
.supervisor-review{display:flex;flex-direction:column;max-height:calc(100dvh - 100px);min-height:300px;background:var(--bg-card,#fff);color:var(--text-primary,#203246);border:1px solid #a9c7d3;border-radius:14px;box-shadow:0 12px 38px #193c5120;overflow:hidden}.supervisor-review--full{max-height:none;min-height:65vh;box-shadow:none}.review-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;background:#f1f7fa;border-bottom:1px solid #dce7ed}.eyebrow{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#4d657c;margin:0 0 3px}.participant-presence{display:block;font-weight:400;margin-top:3px}.review-header h2{font-size:1.12rem;margin:0}.header-actions{display:flex;gap:6px;flex-shrink:0}button{border:1px solid #b9cbd6;border-radius:7px;background:white;color:#254e6a;padding:7px 10px;font:inherit;font-size:.8rem;cursor:pointer}button:hover:not(:disabled){background:#eaf4f8}button:disabled{opacity:.55;cursor:not-allowed}button:focus-visible,summary:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #339ac9;outline-offset:2px}.review-summary{padding:10px 18px;border-bottom:1px solid #dce7ed}.service-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 12px;margin:0}dt{font-size:.67rem;color:#5b7187;text-transform:uppercase;letter-spacing:.035em}dd{margin:2px 0 0;font-size:.83rem;font-weight:600;overflow-wrap:anywhere}.signature-state{display:flex;gap:8px;margin-top:10px;font-size:.71rem;color:#16665b}.signature-state span{padding:3px 7px;background:#e8f5f1;border-radius:10px}.pending-label{font-size:.76rem;color:#835a16;margin:8px 0 0}.review-body{min-height:0;overflow-y:auto;padding:12px 18px;scrollbar-gutter:stable}.supervisor-review--full .review-body{overflow:visible}.prose{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;font-size:.85rem;margin:8px 0}.content-section{padding:8px 0;border-bottom:1px solid #e5edf1}summary{font-size:.83rem;font-weight:650;cursor:pointer;color:#244e6c}.content-section p{margin-left:14px}.clinical-section{padding:8px 0}.clinical-section h3,.ratings h3,.info-panel h3{font-size:.83rem;margin:0 0 6px}.clinical-section ul,.content-section ul{padding-left:18px;font-size:.82rem;line-height:1.5;margin:6px 0}.rating-heading,.rating-row summary{display:grid;grid-template-columns:minmax(150px,2fr) repeat(4,minmax(38px,.7fr));gap:6px;align-items:center}.rating-heading{font-size:.66rem;color:#5b7187;margin:8px 0;text-transform:uppercase}.rating-row{padding:7px 0;border-top:1px solid #e5edf1}.rating-row summary{font-size:.75rem}.rating-row summary span:not(:first-child),.rating-heading span:not(:first-child),.rating-row summary strong{text-align:center}.ratings{margin:12px 0}.detail-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.detail-tabs button[aria-expanded=true]{background:#e5f2f6;border-color:#4596b5}.info-panel{background:#f7fafc;border:1px solid #dce7ed;border-radius:8px;padding:12px;margin:10px 0;font-size:.82rem}.info-panel dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.info-panel label{display:block;font-size:.8rem;margin:8px 0}.info-panel input:not([type=checkbox]),.info-panel textarea,.info-panel select{display:block;box-sizing:border-box;width:100%;font:inherit;border:1px solid #b6c9d6;border-radius:6px;padding:8px;margin-top:4px;background:white;color:#203246}.info-panel button+button{margin-left:6px}.correction-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}.entry{padding:10px 0;border-bottom:1px solid #dce7ed}.entry small,.muted{color:#61778a}.review-footer{padding:12px 18px;border-top:1px solid #cbdde5;background:#f8fbfc;flex-shrink:0}.supervisor-review--full .review-footer{position:sticky;bottom:0;z-index:1}.check-line{display:flex!important;gap:8px;align-items:flex-start;font-size:.77rem;line-height:1.4}.check-line input{margin-top:3px;flex-shrink:0}.footer-actions{display:flex;justify-content:space-between;gap:10px;margin-top:10px}.approve{background:#126e67;color:white;border-color:#126e67;font-weight:650}.approve:hover:not(:disabled){background:#0c5954}.missing,.review-error{color:#9b3c16}.missing-details{background:#fff6e7;border:1px solid #ecd2a4;border-radius:7px;padding:9px;font-size:.78rem;margin-bottom:10px}.missing-details button{margin:6px 0 0}.review-error,.review-message,.review-notice{padding:12px;font-size:.82rem;margin:0}.review-error{background:#fff3ee}.review-notice{background:#e9f6f0;border-radius:7px;margin-bottom:10px;color:#216451}.request-history{background:#fff5e8;border-left:3px solid #b7791f;padding:9px 12px;font-size:.8rem;margin-bottom:10px}.request-history p{white-space:pre-wrap;margin:5px 0}.review-footer p{font-size:.78rem;margin:5px 0}.review-body>.muted{font-size:.8rem}@media(max-width:700px){.supervisor-review{max-height:calc(100dvh - 24px)}.review-header{padding:10px 12px;align-items:flex-start}.header-actions{flex-direction:column}.review-summary,.review-body,.review-footer{padding:10px 12px}.service-facts{grid-template-columns:repeat(2,minmax(0,1fr))}.footer-actions{flex-direction:column}.footer-actions button{width:100%;padding:10px}.correction-fields{grid-template-columns:1fr}.rating-heading,.rating-row summary{grid-template-columns:minmax(115px,2fr) repeat(4,minmax(30px,.7fr));gap:3px}.review-header h2{font-size:1rem}.check-line{font-size:.74rem}}
</style>
