<template>
  <div
    v-if="open"
    :class="embedded ? 'ehr-bring ehr-bring--embedded' : 'ehr-bring-backdrop'"
    @click.self="!embedded && !busy && emit('close')"
  >
    <div :class="embedded ? undefined : 'ehr-bring'" role="dialog" aria-labelledby="ehr-bring-title">
      <header v-if="!embedded" class="ehr-bring-head">
        <div>
          <h3 id="ehr-bring-title">{{ historicalImport ? 'Intake and latest treatment plan' : creationFlow ? 'Import new client records' : 'Bring up to date' }}</h3>
          <p class="ehr-bring-sub">
            {{ clientLabel || 'Client' }}
            <span v-if="clientId"> · #{{ clientId }}</span>
          </p>
        </div>
        <button v-if="!embedded" type="button" class="ehr-link" :disabled="busy" @click="emit('close')">Close</button>
      </header>

      <p class="ehr-muted">Each section autosaves as a private draft. Import a section when ready.</p>
      <p v-if="drafts.state.loading" class="ehr-muted" role="status">Loading saved drafts…</p>
      <p v-if="drafts.state.loadError" class="ehr-error" role="alert">{{ drafts.state.loadError }} <button type="button" class="ehr-link" @click="retryDraftLoad">Retry loading drafts</button></p>
      <div class="ehr-status-row" aria-label="Setup status">
        <span v-for="section in visibleSections" :key="section.key" class="ehr-chip" :class="statusClass(status[section.key])">{{ section.label }} · {{ sectionStatusLabel(section.key) }}</span>
      </div>
      <section v-for="section in visibleSections" :key="section.key" class="ehr-section" :aria-label="section.label">
        <template v-if="section.key === 'insurance'"><label class="ehr-label">Payment basis<select ref="paymentBasisControl" aria-label="Payment basis" v-model="coverageMode" :disabled="busy"><option value="insurance">Insurance</option><option v-if="!delegatedImport" value="self_pay">Self-pay — agreed client rate</option><option value="no_policy">No policy to import</option></select></label><ClientImportSelfPayFields v-if="coverageMode==='self_pay'" v-model="selfPay" :agency-id="agencyId" :client-id="clientId" :disabled="busy || sectionLocked('insurance')" /></template>
        <div v-if="section.key==='insurance' && coverageMode==='insurance'" class="ehr-coverage-pastes">
          <div v-for="position in ['primary','secondary']" :key="position">
            <label class="ehr-label">{{ position==='primary'?'Primary insurance':'Secondary insurance (optional)' }} paste
              <textarea :value="coverageDrafts[position].text" @input="updateCoveragePaste(position,$event.target.value)" :data-section="position==='primary'?'insurance':'secondaryInsurance'" :aria-label="`${position==='primary'?'Primary':'Secondary'} insurance paste`" class="ehr-textarea" :rows="section.rows || 6" :disabled="busy || drafts.state.loading || (coverageDrafts[position].imported && !unlocked.insurance)" :placeholder="section.placeholder" />
            </label>
            <ClientImportPolicyholderBirthDate :text="coverageDrafts[position].text" :position="position"
              :disabled="busy || coverageDrafts[position].imported && !unlocked.insurance" @update="updateCoveragePaste(position,$event)" />
            <p v-if="coverageDrafts[position].imported" class="ehr-imported">✓ {{ position==='primary'?'Primary':'Secondary' }} insurance imported. <button type="button" class="ehr-link" :disabled="busy" @click="unlocked.insurance=true">Edit imported coverage</button></p>
            <p v-if="billingTaskIds[position]" class="ehr-imported" role="status">Sent to Billing · Task #{{ billingTaskIds[position] }}</p>
            <button v-else-if="coverageDrafts[position].text.trim() && !historicalImport" type="button" class="ehr-btn-ghost"
              :disabled="busy" @click="sendCoverageToBilling(position)">Send {{ position }} insurance to Billing</button>
            <p v-if="coverageErrors[position]" class="ehr-error" role="alert">{{ coverageErrors[position] }}</p>
          </div>
        </div>
        <label v-else-if="section.key!=='insurance'" class="ehr-label">
          {{ section.label }} paste
          <textarea v-model="sectionTexts[section.key]" :data-section="section.key" class="ehr-textarea" :rows="section.rows || 6" :disabled="busy || drafts.state.loading || sectionLocked(section.key)" :placeholder="section.placeholder" />
        </label>
        <p v-if="status[section.key] === 'imported'" class="ehr-imported" role="status">✓ {{section.key==='insurance'&&coverageMode==='self_pay'?'Self-pay and client rate saved.':section.key==='insurance'&&coverageMode==='no_policy'?'No policy to import.':section.label+' imported and saved.'}} <button type="button" class="ehr-link" :disabled="busy" @click="unlocked[section.key]=true">Edit imported section</button></p>
        <button v-if="section.key === 'intake' && status.intake === 'imported' && !historicalImport && reviewIntakeLink"
          type="button" class="ehr-link" @click="$emit('review-intake')">Review intake and confirm diagnosis</button>
        <button v-if="section.key === 'plan' && status.plan === 'imported' && !historicalImport && reviewPlanLink"
          type="button" class="ehr-link" :disabled="busy" @click="reviewPlan">Review treatment plan in chart</button>
        <p v-if="section.hint && (section.key!=='insurance'||coverageMode==='insurance')" class="ehr-muted">{{ section.hint }}</p>
        <div v-if="section.key === 'demographics' && !historicalImport && sectionTexts.demographics.trim()" class="ehr-contact-review" :class="{'ehr-review-needed':!contactOwnerConfirmed}">
          <label class="ehr-label">The phone and email in this patient information belong to
            <select ref="contactOwnerControl" :value="contactOwner || suggestedOwnership.owner" :disabled="busy" @change="chooseContactOwner($event.target.value)">
              <option value="guardian">Parent / guardian — use their contact card</option>
              <option value="client">Client — use the client’s own contact details</option>
            </select>
          </label>
          <label class="ehr-confirm"><input :checked="contactOwnerConfirmed" type="checkbox" :disabled="busy || !parsedPatientInfo" @change="confirmContactOwner($event.target.checked)" /> I confirmed who owns this phone and email.</label>
          <label class="ehr-label">Client relationship
            <select v-model="clientClassification" :disabled="busy">
              <option value="">Suggested · {{ suggestedOwnership.clientClassification === 'dependent' ? 'Dependent' : 'Independent client' }}</option>
              <option value="dependent">Dependent</option>
              <option value="independent">Independent client</option>
            </select>
          </label>
        </div>
        <template v-if="section.key === 'contacts'">
          <label v-if="canPrepareAccounts" class="ehr-label"><span><input v-model="preparePrimaryGuardian" type="checkbox" :disabled="busy || !eligibleGuardianMatch" /> Prepare Parent / Guardian 1 for {{eligibleGuardianMatch?.contact.fullName || 'a matching parent contact'}}.</span></label>
          <p class="ehr-muted">Import each parent’s contact card. You can prepare a separate account and review access for each parent below.</p>
          <div v-for="contact in importedContacts" :key="contact.affiliationId" class="ehr-contact">
            <strong>{{ contact.fullName }}</strong> · {{ contact.relationshipType || 'Contact' }}
            <span v-if="contact.portalAccount?.prepared"> · {{contact.portalAccount.created?'Portal account prepared':'Existing portal account linked — same login for this family'}}{{ contact.portalAccount.requiresAccessReview ? ' — review this child’s access below' : '' }}</span>
            <p v-if="contact.portalAccount?.reason" class="ehr-muted">{{ contact.portalAccount.reason }}</p>
          </div>
          <ClientImportGuardianAccounts v-if="canPrepareAccounts && importedContacts.length" :client-id="clientId" :agency-id="agencyId" :contacts="importedContacts" :disabled="busy" @busy="guardianPreparing=$event" @prepared="transitionRefreshKey++" />
          <ClientImportBillingContact v-if="canPrepareAccounts && importedContacts.length" :client-id="clientId" :agency-id="agencyId" :contacts="importedContacts" :disabled="busy" @busy="billingContactBusy=$event" />
        </template>
        <label v-if="section.key === 'intake'" class="ehr-label">Intake type<select v-model="intakeServiceCode" data-intake-service :disabled="busy || drafts.state.loading"><option value="">Choose intake type</option><option value="H0031">H0031</option><option value="90791">90791</option></select></label>
        <div v-if="historicalImport && section.key === 'intake'" class="ehr-source-fields">
          <label class="ehr-label">Original intake date<input v-model="intakeSourceDate" type="date" :disabled="busy" /></label>
          <label class="ehr-label">Original intake author<input v-model="intakeSourceAuthor" :disabled="busy" placeholder="Name in the source, or Unknown" /></label>
        </div>
        <div v-if="historicalImport && section.key === 'plan'" class="ehr-source-fields">
          <label class="ehr-label">Original plan effective date<input v-model="planSourceDate" type="date" :disabled="busy" /></label>
          <label class="ehr-label">Original plan author<input v-model="planSourceAuthor" :disabled="busy" placeholder="Name in the source, or Unknown" /></label>
        </div>
        <div class="ehr-section-actions">
          <span class="ehr-muted" role="status">{{ drafts.state.sections[section.key]?.message }}</span>
          <button type="button" class="ehr-btn-ghost" :disabled="busy || drafts.state.loading || sectionLocked(section.key) || (section.key==='insurance' ? !hasCoveragePaste : !sectionTexts[section.key].trim()) || (historicalImport && !sourceReviewed)" @click="importAll(section.key)">{{ sectionLocked(section.key) ? 'Imported ✓' : section.key==='insurance'&&coverageMode==='self_pay'?'Save self-pay and client rate':section.key==='insurance'&&coverageMode==='no_policy'?'Continue without a policy':`Import ${section.label.toLowerCase()}` }}</button>
        </div>
        <p v-if="drafts.state.sections[section.key]?.error" class="ehr-error" role="alert">{{ drafts.state.sections[section.key].error }} <button type="button" class="ehr-link" @click="drafts.retry(section.key)">Save this paste as the latest draft</button></p>
      </section>


      <ClientPayerLinkage v-if="!historicalImport && canPrepareAccounts && (!onlySections||onlySections.includes('insurance')) && coverageMode==='insurance'" :client-id="clientId" :agency-id="agencyId" :refresh-key="payerRefreshKey" @ready-change="payerReady = $event" @busy="payerBusy = $event" />

      <p v-if="historicalImport" class="ehr-muted">Records from {{ sourceSystem }} are saved as unsigned drafts with their original dates and source author. Review them in the clinical chart before approving current care. Importing does not recreate the original clinician’s signature.</p>
      <label v-if="historicalImport" class="ehr-label"><span><input v-model="sourceReviewed" type="checkbox" :disabled="busy" /> I compared this paste and original dates/authorship with the source. Clinical approval remains a separate review.</span></label>
      <p v-else class="ehr-muted">Intakes are saved as unlinked, nonbillable imported notes. Treatment plans are saved as drafts for the provider to review and finalize in the clinical chart. Send unresolved insurance to Billing to finish the records import.</p>

      <ul v-if="stepLog.length" class="ehr-log">
        <li v-for="(entry, i) in stepLog" :key="i" :class="entry.ok ? 'ok' : 'bad'">{{ entry.message }}</li>
      </ul>
      <p v-if="error" class="ehr-error">{{ error }}</p>
      <p v-if="successMessage" class="ehr-ok">{{ successMessage }}</p>

      <ClientUpdateAssignments v-if="showAssignments" :key="`${agencyId}:${clientId}`" ref="assignmentsPanel" :client-id="clientId" :agency-id="agencyId" :initial-assignment="initialAssignment" @busy="assignmentsBusy=$event" @ready="assignmentsReady=$event" @updated="transitionRefreshKey++" />

      <div v-if="!creationFlow && !historicalImport && creationPendingReasons.length"><p>Still pending in this workflow:</p><ul><li v-for="reason in creationPendingReasons" :key="reason">{{ reason }}</li></ul></div>
      <template v-if="!historicalImport && canPrepareAccounts">
        <p v-if="coverageAwaitingBilling" class="ehr-muted">You can preview the invitation now. Review the chart’s saved coverage and assigned forms after Billing resolves the policy.</p>
        <p v-else-if="!recordsReadyForInvitation" class="ehr-muted">You can update portal access and preview the invitation now. Import the filled record sections before sending it.</p>
        <div class="ehr-invitation"><ClientTransitionInvitation :personal-account-only="personalAccountOnly" :sending-enabled="recordsReadyForInvitation" :patient-info-pending="pendingPatientInfo" @review-patient-info="reviewPatientInfo" :client-id="clientId" :agency-id="agencyId" :refresh-key="transitionRefreshKey" @busy="invitationBusy = $event" /></div>
      </template>
      <div class="ehr-actions">
        <button v-if="!creationFlow && !historicalImport" type="button" class="ehr-btn-ghost" :disabled="busy" @click="markDoneOnly">
          {{ markingDone ? 'Marking…' : 'Mark done' }}
        </button>
        <button
          v-if="!creationFlow || historicalImport"
          type="button"
          class="ehr-btn-primary"
          :disabled="busy || drafts.state.loading || !hasAnyPaste || (historicalImport && !sourceReviewed)"
          @click="importAll()"
        >
          {{ importing ? 'Importing…' : historicalImport ? 'Save historical intake and plan for clinical review' : 'Import all filled sections' }}
        </button>
      </div>
      <div v-if="creationFlow && !historicalImport" class="ehr-finish"><p v-if="creationPendingReasons.length">Remaining setup actions (records import can finish separately):</p><ul v-if="creationPendingReasons.length" aria-label="Remaining import steps"><li v-for="reason in creationPendingReasons" :key="reason">{{ reason }}</li></ul><button type="button" class="ehr-btn-primary" :disabled="busy" @click="completeCreation">Finish client import</button></div>
      <section v-if="completionReview" class="ehr-completion-review" aria-label="Review records import completion">
        <h4>Review before marking done</h4><p v-if="completionPreparing" role="status">Saving record drafts…</p>
        <p v-if="hasBillingHandoff">Billing has the saved insurance paste. You can complete the records import while coverage review is pending.</p>
        <p v-if="assignmentsPanel?.schoolSetupPending">School setup is pending. You can finish the records import and retry school setup from Assignments in this chart.</p>
        <p v-if="error" class="ehr-error" role="alert">{{ error }}</p>
        <template v-if="unimportedSections.length"><p>These paste boxes contain information that has not been imported:</p><ul><li v-for="key in unimportedSections" :key="key">{{ sectionLabel(key) }}</li></ul><button type="button" class="ehr-btn-primary" :disabled="busy" @click="importAll()">Import remaining pasted sections</button><p>Resolve any import errors before finishing.</p></template>
        <template v-if="blankSections.length"><p>These paste boxes are blank. Existing information on the chart is preserved:</p><ul><li v-for="key in blankSections" :key="key">{{ sectionLabel(key) }}</li></ul><label class="ehr-label"><span><input v-model="keepBlankConfirmed" type="checkbox" :disabled="busy" /> Keep these boxes blank and finish with the information imported.</span></label></template>
        <p>Clinical finalization, assignment and billing follow-up remain separate profile actions.</p>
        <button type="button" class="ehr-btn-primary" :disabled="busy || unimportedSections.length > 0 || (blankSections.length > 0 && !keepBlankConfirmed)" @click="finishReviewedImport">Complete records import</button>
        <button type="button" class="ehr-link" :disabled="busy" @click="completionReview=false">Continue editing</button>
      </section>
    </div>
  </div>

</template>

<script setup>
import { isProBonoServiceCode } from '../../../utils/clinicalAfterHoursPolicy.js';
import { automaticEligibilityNotice } from '../../../utils/automaticEligibilityNotice.js';
import { CLIENT_RECORD_SECTIONS } from '../../../utils/clientRecordSections.js';
import { inject, computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import { useAuthStore } from '../../../store/auth';
import sharedApi from '../../../services/api';
import {transitionRequestScope} from '../../../utils/transitionRequestScope';
const api={...sharedApi,...transitionRequestScope(sharedApi,()=>props.agencyId)};
import { useChartImportDrafts } from '../../../composables/useChartImportDrafts.js';
import ClientPayerLinkage from './ClientPayerLinkage.vue';
import { parseChartContacts } from '../../../navigation/chartPasteParser.js';
import { matchingGuardian, suggestRecordsContactOwnership } from '../../../navigation/recordsContactOwnership.js';
import ClientTransitionInvitation from '../../clients/ClientTransitionInvitation.vue';
import ClientUpdateAssignments from './ClientUpdateAssignments.vue';
import { todayCalendarDate } from '../../../utils/formatDate.js';
import ClientImportPolicyholderBirthDate from './ClientImportPolicyholderBirthDate.vue';
import ClientImportSelfPayFields from './ClientImportSelfPayFields.vue';
import ClientImportBillingContact from './ClientImportBillingContact.vue';
import ClientImportGuardianAccounts from './ClientImportGuardianAccounts.vue';
import {
  DEFAULT_MEASUREMENT_METHOD,
  inferScaleDirection,
  isObjectiveScaleValid,
  parseScalePair
} from '../../../utils/treatmentPlanDuration.js';

const props = defineProps({
  reviewPlanLink: Boolean,
  reviewIntakeLink: Boolean,
  personalAccountOnly: Boolean,
  open: { type: Boolean, default: false },
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], required: true },
  clientLabel: { type: String, default: '' },
  mergeExisting: Boolean,
  preferIncomingPastes: Boolean,
  initialTexts: { type: Object, default: () => ({}) },
  initialCoverageDrafts: { type: Object, default: () => ({}) },
  initialAssignment: { type: Object, default: () => ({}) },
  initialCoverageMode: { type: String, default: 'insurance' },
  initialSelfPay: { type: Object, default: () => ({}) },
  creationFlow: { type: Boolean, default: false },
  initialIntakeServiceCode: { type: String, default: '' },
  initialContactOwner: { type:String, default:'' },
  initialContactOwnerConfirmed: Boolean,
  initialClientClassification: { type:String, default:'' },
  initialPatientInfo: { type:Object, default:null },
  autoImport: { type: Boolean, default: true },
  pendingProviderAssignment: {type:Boolean,default:false},
  requireVerifiedPayers: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  historicalImport: { type: Boolean, default: false },
  hideDemographics: { type: Boolean, default: false },
  onlySections: {type:Array,default:null},
  sourceSystem: { type: String, default: 'TherapyNotes' },
  recordStatus: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['close', 'done', 'imported', 'busy', 'drafts-saved', 'section-imported', 'review-intake', 'review-plan', 'sections-imported']);
const auth = getActivePinia() ? useAuthStore() : null;
const delegatedImport=inject('transitionClientImportOperator',ref(false));
const canPrepareAccounts = computed(() => ['super_admin','admin','support'].includes(auth?.user?.role)||delegatedImport.value);

const demographicsText = ref('');
const intakeText = ref('');
const intakeServiceCode = ref('');
let importedIntakeDraft = null;
const reviewPending = reactive({ intake: false, plan: false });
const planText = ref('');
const insuranceText = ref(''), contactsText = ref(''), commentsText = ref(''), payerText = ref(''), billingCommentsText = ref('');
const contactOwner = ref(props.initialContactOwner), contactOwnerConfirmed = ref(props.initialContactOwnerConfirmed);
const clientClassification = ref(props.initialClientClassification);
const parsedPatientInfo = ref(props.initialPatientInfo), contactOwnerControl = ref(null);
const preparePrimaryGuardian = ref(false), importedContacts = ref([]), guardianPreparing=ref(false);
let contactImportRevision = 0;
const sectionTexts = reactive({ demographics: demographicsText, intake: intakeText, plan: planText, insurance: insuranceText, contacts: contactsText, comments: commentsText, payer: payerText, billingComments: billingCommentsText });
const sections = CLIENT_RECORD_SECTIONS;
const visibleSections = computed(() => sections.filter(section => (!props.onlySections||props.onlySections.includes(section.key))&&(props.historicalImport ? ['intake', 'plan'].includes(section.key) : section.key !== 'payer' &&
  (canPrepareAccounts.value || !['insurance','billingComments'].includes(section.key)) && !(props.hideDemographics && section.key === 'demographics'))));
const drafts = useChartImportDrafts();
const unlocked=reactive({}),completionReview=ref(false),keepBlankConfirmed=ref(false);
const sectionLabel=key=>sections.find(section=>section.key===key)?.label||key;
const sectionLocked=key=>status[key]==='imported'&&!unlocked[key]&&(key!=='insurance'||allCoverageHandled.value);
const unimportedSections=computed(()=>filledSections().filter(key=>key==='insurance'?!allCoverageHandled.value:status[key]!=='imported'&&status[key]!=='done'));
const blankSections=computed(()=>visibleSections.value.filter(section=>!(section.key==='insurance'?hasCoveragePaste.value:sectionTexts[section.key].trim())&&!['done','imported'].includes(status[section.key])).map(section=>section.key));
const billingContactBusy=ref(false);
const assignmentsBusy=ref(false),assignmentsReady=ref(false),assignmentsPanel=ref(null);
const completionPreparing=ref(false);
const progressBusy=ref(false);let progressSectionsKey=null;
const showAssignments=computed(()=>!props.historicalImport&&!props.onlySections&&canPrepareAccounts.value);
const payerRefreshKey = ref(0), payerReady = ref(false), payerBusy = ref(false);
const transitionRefreshKey = ref(0), invitationBusy = ref(false);
const payerPosition = ref('primary');
const coverageMode=ref('insurance'),selfPay=ref({code:'',amount:'',basis:'visit',reason:'',imported:false});
const coveragePositions = ['primary', 'secondary'];
const coverageDrafts = reactive({ primary: { text: '', imported: false }, secondary: { text: '', imported: false } });
const billingTaskIds = reactive({ primary: null, secondary: null });
const coverageErrors = reactive({ primary: '', secondary: '' });
const sendingToBilling = ref(false);
const hasBillingHandoff = computed(() => coverageMode.value === 'insurance' && coveragePositions.some(position => billingTaskIds[position]));
const coverageAwaitingBilling = computed(() => hasBillingHandoff.value && coveragePositions.some(position => billingTaskIds[position] && !coverageDrafts[position].imported));
const coverageHandled = position => coverageDrafts[position].imported || Boolean(billingTaskIds[position]);
const allCoverageHandled = computed(() => props.onlySections&&!props.onlySections.includes('insurance')?true:coverageMode.value==='no_policy'?status.insurance==='imported':coverageMode.value==='self_pay'?selfPay.value.imported===true:coveragePositions.every(position => !coverageDrafts[position].text.trim() || coverageHandled(position)));
const hasCoveragePaste = computed(() => props.onlySections&&!props.onlySections.includes('insurance')?false:coverageMode.value!=='insurance'||Boolean(payerText.value.trim()) || Object.values(coverageDrafts).some(draft => draft.text.trim()));
const creationRecordsReady = computed(() => allCoverageHandled.value && visibleSections.value.filter(section => section.key !== 'insurance' && sectionTexts[section.key].trim()).every(section => ['imported','done'].includes(status[section.key])));
const recordsReadyForInvitation = computed(() => creationRecordsReady.value && !coverageAwaitingBilling.value && visibleSections.value.every(section => !reviewPending[section.key]));
let hydratingDrafts = false;
let pipelineSections = [];

const intakeSourceDate = ref(''), intakeSourceAuthor = ref(''), planSourceDate = ref(''), planSourceAuthor = ref(''), sourceReviewed = ref(false);
const importing = ref(false);
const markingDone = ref(false);
const error = ref('');
const successMessage = ref('');
const stepLog = ref([]);
const status = reactive({
  demographics: 'missing',
  intake: 'missing',
  plan: 'missing', insurance: 'missing', contacts: 'missing', comments: 'missing'
});

const hasAnyPaste = computed(
  () => visibleSections.value.some(section => sectionTexts[section.key].trim()) || (!props.historicalImport && hasCoveragePaste.value)
);
const networkBusy = computed(() => importing.value || markingDone.value || invitationBusy.value || payerBusy.value || assignmentsBusy.value || sendingToBilling.value || guardianPreparing.value || billingContactBusy.value || progressBusy.value || drafts.state.loading);
const busy=computed(()=>networkBusy.value||completionPreparing.value);
const filledSections=()=>visibleSections.value.filter(section=>sectionTexts[section.key].trim()||(section.key==='insurance'&&hasCoveragePaste.value)).map(section=>section.key);
const creationPendingReasons=computed(()=>[
 ...(visibleSections.value.some(section=>section.key==='intake')&&intakeText.value.trim()&&!intakeServiceCode.value?['Choose H0031 or 90791 for the imported intake.']:[]),
 ...(props.pendingProviderAssignment?['Resolve the provider assignment above or choose Continue unassigned.']:[]),
 ...filledSections().filter(key=>key==='insurance'?!allCoverageHandled.value:status[key]!=='imported').map(key=>`${status[key]==='failed'?'Retry':'Import'} ${sections.find(section=>section.key===key).label.toLowerCase()}.`),
 ...visibleSections.value.map(section=>section.key).filter(key=>reviewPending[key]).map(key=>`Finish the ${key==='plan'?'treatment plan':key} review.`),
 ...(showAssignments.value&&!assignmentsReady.value?['Review assignments and save any changes.']:[]),
 ...(coverageMode.value==='insurance'&&hasCoveragePaste.value&&!payerReady.value?['Insurance verification is pending in Billing.']:[])
]);
watch(busy, value => emit('busy', value), { flush: 'sync' });
let scopeGeneration = 0;
let importScopeGeneration = 0;
watch(() => [props.open, props.clientId, props.agencyId, props.sourceSystem], () => { scopeGeneration++; }, { flush: 'sync' });
onBeforeUnmount(() => { drafts.detach(); scopeGeneration++; emit('busy', false); });
function assertScope() { if (importScopeGeneration !== scopeGeneration) throw new Error('The selected client changed; no further import steps were run.'); }
function historicalSource(date, author, text) {
  if (!sourceReviewed.value || !date || !String(author || '').trim()) throw new Error('Compare the source and enter its original date and author (or Unknown) before importing.');
  return { sourceSystem: props.sourceSystem, sourceDate: date, sourceAuthor: author.trim(), sourceText: text, reviewed: true };
}

function statusClass(s) {
  if (s === 'imported' || s === 'done') return 'is-ok';
  if (s === 'failed') return 'is-bad';
  if (s === 'needs review') return 'is-warn';
  return 'is-miss';
}
function sectionStatusLabel(key){return status[key]==='missing'?((key==='insurance'?hasCoveragePaste.value:sectionTexts[key].trim())?'Ready to import':'No paste added'):status[key];}
async function beginImportProgress(){
 if(props.historicalImport)return;
 const sections=filledSections(),key=JSON.stringify(sections);if(key===progressSectionsKey)return;
 const own=scopeGeneration;progressBusy.value=true;
 try{await api.post(`/clients/${props.clientId}/chart-import/start`,{sections,...(props.mergeExisting ? {onlyIncomplete:true} : {})},{skipGlobalLoading:true,headers:agencyHeaders()});if(own===scopeGeneration)progressSectionsKey=key;}finally{if(own===scopeGeneration)progressBusy.value=false;}
}

function agencyHeaders() {
  const aid = Number(props.agencyId || 0);
  return aid > 0 ? { 'X-Agency-Id': String(aid) } : undefined;
}

const pastedContacts = computed(() => {
  try { return parseChartContacts(sectionTexts.contacts); } catch { return []; }
});
const suggestedOwnership = computed(() => suggestRecordsContactOwnership(parsedPatientInfo.value, pastedContacts.value, todayCalendarDate()));
const effectiveContactOwner = computed(() => contactOwner.value || suggestedOwnership.value.owner);
const eligibleGuardianMatch = computed(() => {
  if (effectiveContactOwner.value !== 'guardian' || !contactOwnerConfirmed.value) return null;
  const match = matchingGuardian(parsedPatientInfo.value, pastedContacts.value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(match?.contact.email || '') ? match : null;
});
const pendingPatientInfo = computed(() => !props.historicalImport && !!sectionTexts.demographics.trim() && status.demographics !== 'imported');
watch(eligibleGuardianMatch, match => { preparePrimaryGuardian.value = !!match; });
const paymentBasisControl = ref(null);
function reviewInsurance() {
  const control = paymentBasisControl.value?.[0];
  control?.scrollIntoView?.({ block:'center' });
  control?.focus?.();
}
function reviewPatientInfo() {
  error.value = 'Confirm who owns the phone and email, then import Patient info before preparing the client’s account.';
  const control = contactOwnerControl.value?.[0] || contactOwnerControl.value;
  control?.scrollIntoView?.({ block:'center' });
  control?.focus?.();
}
function chooseContactOwner(owner) {
  contactOwner.value = owner;
  contactOwnerConfirmed.value = false;
}
function confirmContactOwner(confirmed) {
  if (confirmed) contactOwner.value = effectiveContactOwner.value;
  contactOwnerConfirmed.value = confirmed;
}

async function previewPatientInfo(text, generation) {
  if (!text.trim() || props.historicalImport) return;
  try {
    const { data } = await api.post(`/clients/${props.clientId}/demographics/parse`, { text }, { skipGlobalLoading:true, headers:agencyHeaders() });
    if (generation === scopeGeneration && text === sectionTexts.demographics) parsedPatientInfo.value = data?.parsed || null;
  } catch { /* Import reports parsing errors when staff save the section. */ }
}

function draftValue(key) {
  return { text: sectionTexts[key], metadata: { imported: status[key] === 'imported', needsReview: reviewPending[key] === true,
    ...(key === 'insurance' ? { coverageMode:coverageMode.value,selfPay:{...selfPay.value},position: payerPosition.value, coverageDrafts: { primary: { ...coverageDrafts.primary }, secondary: { ...coverageDrafts.secondary } } } : {}),
    ...(key === 'demographics' ? { contactOwner: contactOwner.value, contactOwnerConfirmed: contactOwnerConfirmed.value, clientClassification:clientClassification.value } : {}),
    ...(key === 'payer' ? { position: payerPosition.value } : {}), ...(key === 'intake' ? { sourceDate: intakeSourceDate.value, sourceAuthor: intakeSourceAuthor.value, serviceCode: intakeServiceCode.value } : key === 'plan' ? { sourceDate: planSourceDate.value, sourceAuthor: planSourceAuthor.value } : {}) } };
}
function hasIncomingPaste(key) {
  return props.preferIncomingPastes && !!props.initialTexts[key]?.trim();
}
function restoreCoverage(saved, preserve = false) {
  const insurance = saved?.insurance?.value, legacyPayer = saved?.payer?.value;
  const newPolicy = props.preferIncomingPastes && Object.values(props.initialCoverageDrafts).some(slot => slot.text?.trim());
  const newRate = props.preferIncomingPastes && props.initialCoverageMode === 'self_pay';
  coverageMode.value = newPolicy ? 'insurance' : newRate ? 'self_pay' : insurance?.coverageMode || props.initialCoverageMode;
  selfPay.value = { code:'', amount:'', basis:'visit', reason:'', imported:false, ...props.initialSelfPay,
    ...(!newRate ? insurance?.selfPay : {}) };
  const supplied = insurance || legacyPayer ? '' : [props.initialTexts.insurance, props.initialTexts.payer].filter(Boolean).join('\n');
  const active = supplied ? 'primary' : insurance?.position || legacyPayer?.position || 'primary';
  for (const position of ['primary', 'secondary']) {
    if (preserve && coverageDrafts[position].text) continue;
    const incoming = props.initialCoverageDrafts[position];
    const previous = insurance?.coverageDrafts?.[position];
    const stored = newPolicy && incoming?.text?.trim() && incoming.text !== previous?.text
      ? { text:incoming.text, imported:false } : previous || incoming;
    const legacyInsurance = (insurance?.position || 'primary') === position ? insuranceText.value : '';
    const payer = (legacyPayer?.position || 'primary') === position ? payerText.value : '';
    const text = stored?.text ?? (position === 'primary' && supplied ? supplied : [legacyInsurance, payer].filter(Boolean).join('\n'));
    Object.assign(coverageDrafts[position], { text, imported: stored && stored.text !== text ? false : stored?.imported ?? (Boolean(text) && status.insurance === 'imported' && !payer) });
    const savedText = previous?.text ?? ((insurance?.position || 'primary') === position ? insurance?.text : '');
    billingTaskIds[position] = savedText?.trim() === text.trim() ? saved?.insurance?.billingTaskIds?.[position] || null : null;
  }
  payerPosition.value = active;
  insuranceText.value = coverageDrafts[active].text;
  status.insurance = (coverageMode.value==='no_policy'?insurance?.status==='imported':coverageMode.value==='self_pay'?selfPay.value.imported:coverageDrafts[active].imported) ? 'imported' : 'missing';
}
async function loadImportedContacts(generation) {
  if (!canPrepareAccounts.value || props.historicalImport) return;
  const revision = contactImportRevision;
  try {
    const response = await api.get(`/clients/${props.clientId}/chart-import/records`, { skipGlobalLoading: true, headers: agencyHeaders() });
    if (generation === scopeGeneration && revision === contactImportRevision) importedContacts.value = response.data?.contacts || [];
  } catch (err) { if (generation === scopeGeneration && revision === contactImportRevision) error.value = err.response?.data?.error?.message || 'Imported contacts could not be loaded. Reopen this client to retry.'; }
}
async function retryDraftLoad() {
  const generation = scopeGeneration;
  const saved = await drafts.load(props.clientId, props.agencyId);
  if (generation !== scopeGeneration || !saved) return;
  hydratingDrafts = true;
  for (const section of sections) if (!sectionTexts[section.key] && saved[section.key]?.value?.text) sectionTexts[section.key] = saved[section.key].value.text;
  restoreCoverage(saved, true);
  hydratingDrafts = false;
  for (const section of visibleSections.value) drafts.schedule(section.key, draftValue(section.key));
}
watch(
  () => [props.open, props.clientId, props.agencyId, props.sourceSystem],
  async ([open]) => {
    if (!open) { await drafts.flush(); return; }
    const generation = scopeGeneration;
    hydratingDrafts = true;
    payerPosition.value = 'primary';
    for (const position of coveragePositions) {
      Object.assign(coverageDrafts[position], { text: '', imported: false });
      billingTaskIds[position] = null;
      coverageErrors[position] = '';
    }
    importedContacts.value = []; preparePrimaryGuardian.value = false; contactOwner.value = props.initialContactOwner;
    contactOwnerConfirmed.value = props.initialContactOwnerConfirmed; clientClassification.value = props.initialClientClassification; parsedPatientInfo.value = props.initialPatientInfo;
    for (const section of sections) { sectionTexts[section.key] = props.initialTexts[section.key] || ''; status[section.key] = props.recordStatus?.[section.key] || 'missing'; }
    error.value = ''; successMessage.value = ''; stepLog.value = [];
    importedIntakeDraft = null;completionReview.value=false;keepBlankConfirmed.value=false;Object.keys(unlocked).forEach(key=>delete unlocked[key]);
    intakeServiceCode.value = props.initialIntakeServiceCode; intakeSourceDate.value = ''; intakeSourceAuthor.value = ''; planSourceDate.value = ''; planSourceAuthor.value = ''; sourceReviewed.value = false;
    reviewPending.intake = false; reviewPending.plan = false;
    const saved = await drafts.load(props.clientId, props.agencyId);
    if (generation !== scopeGeneration) return;
    for (const section of sections) {
      const stored = saved?.[section.key]?.value;
      if (hasIncomingPaste(section.key)) {
        if (sectionTexts[section.key] !== stored?.text) status[section.key] = 'missing';
      } else if (typeof stored?.text === 'string') sectionTexts[section.key] = stored.text;
    }
    for (const section of sections) if (saved?.[section.key]?.value?.imported && saved[section.key].value.text === sectionTexts[section.key]) status[section.key] = 'imported';
    for (const key of ['intake','plan']) reviewPending[key] = props.historicalImport && status[key] === 'imported' && saved?.[key]?.value?.needsReview === true;
    restoreCoverage(saved);
    const savedPatientInfo = hasIncomingPaste('demographics') ? null : saved?.demographics?.value;
    contactOwner.value = (savedPatientInfo?.imported || savedPatientInfo?.contactOwnerConfirmed !== undefined) ? (savedPatientInfo.contactOwner || '') : props.initialContactOwner;
    contactOwnerConfirmed.value = savedPatientInfo?.contactOwnerConfirmed ?? props.initialContactOwnerConfirmed;
    clientClassification.value = savedPatientInfo?.clientClassification ?? props.initialClientClassification;
    if (hasIncomingPaste('demographics') && (saved?.demographics?.value?.contactOwner !== contactOwner.value
        || saved?.demographics?.value?.clientClassification !== clientClassification.value)) status.demographics = 'missing';
    if (sectionTexts.demographics !== props.initialTexts.demographics) parsedPatientInfo.value = null;
    if (!parsedPatientInfo.value) void previewPatientInfo(sectionTexts.demographics, generation);
    const savedIntake = hasIncomingPaste('intake') ? null : saved?.intake?.value;
    intakeServiceCode.value = savedIntake?.serviceCode || props.initialIntakeServiceCode;
    if (hasIncomingPaste('intake') && saved?.intake?.value?.serviceCode !== intakeServiceCode.value) status.intake = 'missing';
    intakeSourceDate.value = saved?.intake?.value?.sourceDate || ''; intakeSourceAuthor.value = saved?.intake?.value?.sourceAuthor || '';
    planSourceDate.value = saved?.plan?.value?.sourceDate || ''; planSourceAuthor.value = saved?.plan?.value?.sourceAuthor || '';
    hydratingDrafts = false;
    void loadImportedContacts(generation);
    for (const section of visibleSections.value) if (sectionTexts[section.key] || section.key==='insurance'&&hasCoveragePaste.value) drafts.schedule(section.key, draftValue(section.key));
    progressSectionsKey=null;
    if (props.creationFlow && props.autoImport && !props.historicalImport) importAll();
  },
  { immediate: true, flush: 'sync' }
);
watch(() => props.recordStatus, record => {
  for (const section of sections) if (!sectionTexts[section.key].trim() && status[section.key] !== 'imported' && record?.[section.key]) status[section.key] = record[section.key];
}, { deep: true });
for (const section of sections) {
  watch(() => status[section.key], () => { if (!hydratingDrafts) {if(status[section.key]==='imported')unlocked[section.key]=false;drafts.schedule(section.key, draftValue(section.key));} }, { flush: 'sync' });
  watch(() => sectionTexts[section.key], () => {
    if (hydratingDrafts) return;
    if (section.key === 'insurance') Object.assign(coverageDrafts[payerPosition.value], { text: insuranceText.value, imported: false });
    if (['imported','done'].includes(status[section.key])) status[section.key] = 'missing';
    progressSectionsKey = null;
    if (section.key === 'intake') importedIntakeDraft = null;
    if (props.historicalImport) sourceReviewed.value = false;
    drafts.schedule(section.key, draftValue(section.key));
  }, { flush: 'sync' });
}
watch(intakeServiceCode, () => { if (hydratingDrafts) return; status.intake = 'missing'; importedIntakeDraft = null; drafts.schedule('intake', draftValue('intake')); }, { flush: 'sync' });
function updateCoveragePaste(position,text) {
  coverageDrafts[position].text=text;coverageDrafts[position].imported=false;
  billingTaskIds[position]=null;coverageErrors[position]='';
  if(position===payerPosition.value)insuranceText.value=text;
  status.insurance='missing';progressSectionsKey=null;
  drafts.schedule('insurance',draftValue('insurance'));
}
async function sendCoverageToBilling(position) {
  const own = scopeGeneration;
  sendingToBilling.value = true;
  coverageErrors[position] = '';
  try {
    drafts.schedule('insurance', draftValue('insurance'));
    await drafts.flush('insurance');
    if (own !== scopeGeneration) return;
    if (drafts.state.loadError || drafts.state.sections.insurance?.error) throw Error('Save the original insurance paste before sending it to Billing.');
    const { data } = await api.post(`/clients/${props.clientId}/chart-import/sections/insurance`, {
      text: coverageDrafts[position].text, position, deferToBilling: true
    }, { skipGlobalLoading:true, headers:agencyHeaders() });
    if (own !== scopeGeneration) return;
    billingTaskIds[position] = data.result.taskId;
    if (!unimportedSections.value.length) error.value = '';
  } catch (e) {
    if (own === scopeGeneration) coverageErrors[position] = e.response?.data?.error?.message || e.message;
  } finally {
    sendingToBilling.value = false;
  }
}
watch(payerPosition, position => {
  if (hydratingDrafts) return;
  hydratingDrafts = true;
  insuranceText.value = coverageDrafts[position].text;
  status.insurance = coverageDrafts[position].imported ? 'imported' : 'missing';
  hydratingDrafts = false;
  drafts.schedule('insurance', draftValue('insurance'));
}, { flush: 'sync' });
watch([contactOwner, contactOwnerConfirmed, clientClassification], () => {
  if (hydratingDrafts) return;
  status.demographics = 'missing';
  drafts.schedule('demographics', draftValue('demographics'));
}, { flush: 'sync' });
watch(() => sectionTexts.demographics, (value, previous, onCleanup) => {
  if (hydratingDrafts || props.historicalImport) return;
  contactOwner.value = '';
  contactOwnerConfirmed.value = false;
  clientClassification.value = '';
  parsedPatientInfo.value = null;
  const generation = scopeGeneration;
  const timer = setTimeout(() => previewPatientInfo(value, generation), 350);
  onCleanup(() => clearTimeout(timer));
}, { flush: 'sync' });
watch([coverageMode,selfPay],()=>{if(!hydratingDrafts){status.insurance='missing';drafts.schedule('insurance',draftValue('insurance'));}},{deep:true,flush:'sync'});
watch([intakeSourceDate, intakeSourceAuthor], () => { if (hydratingDrafts) return; sourceReviewed.value = false; if (props.historicalImport) { status.intake = 'missing'; importedIntakeDraft = null; } drafts.schedule('intake', draftValue('intake')); }, { flush: 'sync' });
watch([planSourceDate, planSourceAuthor], () => { if (hydratingDrafts) return; sourceReviewed.value = false; if (props.historicalImport) status.plan = 'missing'; drafts.schedule('plan', draftValue('plan')); }, { flush: 'sync' });

function log(ok, message) {
  stepLog.value = [...stepLog.value, { ok, message }];
}

function mapObjective(o = {}) {
  const objectiveText = o.objectiveText || o.text || '';
  let scaleCurrent = o.scaleCurrent ?? o.current ?? null;
  let scaleTarget = o.scaleTarget ?? o.target ?? null;
  if (!isObjectiveScaleValid(scaleCurrent, scaleTarget)) {
    const parsed = parseScalePair(objectiveText);
    if (isObjectiveScaleValid(parsed.scaleCurrent, parsed.scaleTarget)) {
      scaleCurrent = parsed.scaleCurrent;
      scaleTarget = parsed.scaleTarget;
    }
  }
  return {
    objectiveText,
    scaleCurrent,
    scaleTarget,
    scaleDirection: o.scaleDirection || inferScaleDirection(scaleCurrent, scaleTarget),
    measurementMethod: isObjectiveScaleValid(scaleCurrent, scaleTarget)
      ? (o.measurementMethod || DEFAULT_MEASUREMENT_METHOD)
      : null
  };
}

function mapGoal(g = {}) {
  return {
    goalText: g.goalText || g.text || '',
    durationMonths: g.durationMonths || null,
    projectedCompletion: g.projectedCompletion || null,
    objectives: (g.objectives || []).map((o) => mapObjective(o))
  };
}

async function importDemographics() {
  const text = demographicsText.value.trim();
  if (!text) return false;
  const parseRes = await api.post(
    `/clients/${props.clientId}/demographics/parse`,
    { text },
    { skipGlobalLoading: true, headers: agencyHeaders() }
  );
  const p = parseRes?.data?.parsed || {};
  assertScope();
  parsedPatientInfo.value = p;
  if (!props.historicalImport && (p.email || p.contactPhone) && !contactOwnerConfirmed.value) {
    reviewPatientInfo();
    return 'needs_review';
  }
  await api.post(
    `/clients/${props.clientId}/demographics/import`,
    {
      contactOwner: effectiveContactOwner.value,
      ...(props.mergeExisting ? { mergeExisting:true } : {}),
      ...(!props.historicalImport ? {
        contactOwnerConfirmed:contactOwnerConfirmed.value,
        recordsContactClassification:clientClassification.value || suggestedOwnership.value.clientClassification
      } : {}),
      demographics: {
        fullName: p.fullName || '',
        dateOfBirth: p.dateOfBirth || '',
        addressStreet: p.addressStreet || '',
        addressLine2: p.addressLine2 || '',
        addressCity: p.addressCity || '',
        addressState: p.addressState || '',
        addressZip: p.addressZip || '',
        timezone: p.timezone || '',
        contactPhone: p.contactPhone || '',
        textMessagesOk: props.mergeExisting ? p.textMessagesOk : p.textMessagesOk === true,
        email: p.email || '',
        appointmentReminderType: p.appointmentReminderType || '',
        administrativeSex: p.administrativeSex || '',
        preferredLanguage: p.preferredLanguage || '',
        grade: p.grade || ''
      }
    },
    { skipGlobalLoading: true, headers: agencyHeaders() }
  );
  assertScope();
  status.demographics = 'imported';
  transitionRefreshKey.value++;
  log(true, 'Demographics imported');
  return true;
}

async function importIntake() {
  const text = intakeText.value.trim();
  if (!text) return false;
  if (!['H0031','90791'].includes(intakeServiceCode.value)) throw new Error('Choose H0031 or 90791 for the imported intake.');
  const res = importedIntakeDraft || await api.post(
    `/clients/${props.clientId}/intake-note/import`,
    { text, serviceCode: intakeServiceCode.value, ...(props.historicalImport ? { historicalImport: historicalSource(intakeSourceDate.value, intakeSourceAuthor.value, text) } : { recordsImport: { text } }) },
    { skipGlobalLoading: true, headers: agencyHeaders() }
  );
  assertScope();
  importedIntakeDraft = res;
  const draft = res?.data?.draft;
  const draftId = draft?.id;
  if (!draftId) throw new Error('Intake import did not return a draft');
  if (props.historicalImport) {
    reviewPending.intake = draft.status !== 'final';
    status.intake = 'imported';
    log(true, `Historical intake retained from ${intakeSourceDate.value}; clinical review remains pending.`);
    return true;
  }

  reviewPending.intake = false;
  status.intake = 'imported';
  log(true, `Intake ${intakeServiceCode.value} saved to the medical record as an unlinked, nonbillable imported note.`);
  return true;
}

async function importPlan() {
  const text = planText.value.trim();
  if (!text) return false;
  if (props.historicalImport) {
    const parsedResponse = await api.post('/medical-billing/treatment-plans/parse', {
      agencyId: Number(props.agencyId), clientId: Number(props.clientId), text
    }, { skipGlobalLoading: true, headers: agencyHeaders() });
    assertScope();
    const parsed = parsedResponse.data?.parsed || {};
    await api.post('/medical-billing/treatment-plans', {
      agencyId: Number(props.agencyId), clientId: Number(props.clientId), status: 'draft', finalize: false,
      effectiveDate: planSourceDate.value,
      historicalImport: historicalSource(planSourceDate.value, planSourceAuthor.value, text),
      goals: (parsed.goals || []).map(mapGoal), presentingProblem: parsed.presentingProblem || null,
      prescribedFrequency: parsed.prescribedFrequency || null
    }, { skipGlobalLoading: true, headers: agencyHeaders() });
    assertScope();
    status.plan = 'imported'; reviewPending.plan = true;
    log(true, `Historical treatment plan retained with original effective date ${planSourceDate.value}; clinical review remains pending.`);
    return true;
  }
  await api.post('/medical-billing/treatment-plans', {
    agencyId: Number(props.agencyId), clientId: Number(props.clientId),
    recordsImport: { text }, status: 'draft', finalize: false
  }, { skipGlobalLoading: true, headers: agencyHeaders() });
  assertScope();
  reviewPending.plan = false;
  status.plan = 'imported';
  log(true, 'Treatment plan saved as a draft. The provider must review and finalize it in the clinical chart.');
  return true;
}

async function finishImportPipeline() {
  const incomplete = pipelineSections.some(key => key !== 'insurance' && sectionTexts[key].trim() && status[key] !== 'imported') || (importingAllCoverage && !allCoverageHandled.value);
  if (incomplete) {
    error.value = coveragePositions.some(position => coverageErrors[position])
      ? 'Review the insurance boxes. Correct the policy and retry, or send it to Billing to finish the records import.'
      : 'Some records still need attention. Retry the incomplete steps before finishing or posting to the exchange.';
    return;
  }
  const anyOk = pipelineSections.some(key => status[key] === 'imported' || (key === 'insurance' && coveragePositions.some(coverageHandled)));
  if (!anyOk) {
    error.value = 'Nothing imported successfully. Check the paste text and try again.';
    return;
  }
  await drafts.flush();
  assertScope();
  successMessage.value = reviewPending.intake || reviewPending.plan
    ? 'Records saved; clinical review remains pending.'
    : 'Records imported. Treatment-plan drafts await provider finalization; you can mark the records import done.';
  if (props.creationFlow && props.requireVerifiedPayers) {
    successMessage.value = creationRecordsReady.value ? 'Records imported. Payer matching and coverage checks continue automatically; you can finish client import.' : 'Section imported. Import the remaining filled sections to finish this client.';
    emit('sections-imported', { ...status });
    return;
  }
  emit(props.historicalImport?'imported':'section-imported', 'review-intake', { ...status });
}

async function completeCreation() { completionReview.value=true;keepBlankConfirmed.value=false; }
async function finishReviewedImport() {
  if(unimportedSections.value.length || busy.value || blankSections.value.length&&!keepBlankConfirmed.value)return;
  const own=scopeGeneration;completionPreparing.value=true;error.value='';
  try{
    if(showAssignments.value && !hasBillingHandoff.value && await assignmentsPanel.value?.savePendingAssignments?.()===false){error.value='The assignment changes could not be saved. Check the error in Assignments above and retry.';return;}
    if(own!==scopeGeneration)return;
    if(await prepareLeave({confirmPending:false,fromCompletion:true})===false)return;
    if(own!==scopeGeneration)return;
    progressBusy.value=true;
    await beginImportProgress();if(own!==scopeGeneration)return;progressBusy.value=true;
    const {data}=await api.post(`/clients/${props.clientId}/chart-import/complete`,{keptBlankSections:blankSections.value},{skipGlobalLoading:true,headers:agencyHeaders()});
    if(own!==scopeGeneration)return;
    completionReview.value=false;
    successMessage.value=assignmentsPanel.value?.schoolSetupPending
      ? 'Records import marked done. Review the school setup draft in this chart’s Assignments.'
      : 'Records import marked done. Remaining profile actions stay pending.';
    const current=data?.progress?.clientStatus;
    const client=current?{id:Number(props.clientId),status:'ACTIVE',client_status_id:current.id,client_status_key:current.key,client_status_label:current.label}:null;
    emit(props.creationFlow?'imported':'done',{...status,marked:true,...(client?{client}:{}),assignmentDraftPending:assignmentsPanel.value?.hasPendingDraft?.()===true});
  }catch(e){if(own===scopeGeneration)error.value=e.response?.data?.error?.message||'The import could not be completed. Your saved entries remain here.';}
  finally{if(own===scopeGeneration){progressBusy.value=false;completionPreparing.value=false;}}
}

async function prepareLeave({confirmPending=true,fromCompletion=false}={}) {
  if(networkBusy.value || (completionPreparing.value&&!fromCompletion)){error.value='Wait for the current request to finish, then save the draft or complete the import.';return false;}
  if(confirmPending && unimportedSections.value.length && !busy.value && window.confirm('Some pasted information has not been imported. Import it before leaving? Choose Cancel to keep it as a saved draft.')===true){
    await importAll();if(unimportedSections.value.length)return false;
  }
  await drafts.flush();
  if (Object.values(drafts.state.sections).some(section => section.error) || (drafts.state.loadError && hasAnyPaste.value)) {
    error.value = 'Save the drafts before leaving this client. Retry any draft errors above.';
    return false;
  }
  if (showAssignments.value && await assignmentsPanel.value?.saveWorkingDraft?.() === false){error.value='The pending assignment choices could not be saved as a draft. Review the assignment draft error above and retry.';return false;}
  emit('drafts-saved');
  return true;
}
async function reviewPlan() {
  if (await prepareLeave({ confirmPending: false })) emit('review-plan');
}

async function reloadAssignments(){await assignmentsPanel.value?.refresh?.();return true;}
defineExpose({ prepareLeave,importAll,reloadAssignments,reviewInsurance });

async function importSupplementary(key) {
  const result = await api.post(`/clients/${props.clientId}/chart-import/sections/${key}`, { text: sectionTexts[key], ...(['insurance','payer'].includes(key) ? { position: payerPosition.value } : {}),
    ...(key === 'contacts' ? { preparePrimaryGuardian: canPrepareAccounts.value && preparePrimaryGuardian.value && !!eligibleGuardianMatch.value && status.demographics === 'imported' } : {}) }, { skipGlobalLoading: true, headers: agencyHeaders() });
  assertScope();
  if (key === 'insurance') coverageDrafts[payerPosition.value].imported = true;
  status[key] = 'imported';
  transitionRefreshKey.value++;
  if (key === 'contacts') { contactImportRevision++; importedContacts.value = Array.isArray(result.data?.result) ? result.data.result : []; }
  if (['insurance', 'payer'].includes(key)) { payerReady.value = false; payerRefreshKey.value++; }
  const messages = { comments: 'Patient comments saved to Administrative note', insurance: 'Insurance imported for billing review', payer: 'Payer information imported', billingComments: 'Billing comments imported', contacts: 'Additional contacts imported' };
  const eligibility = key === 'insurance' && result.data?.result;
  log(true, (eligibility && (eligibility.eligibilityQueueWarning || automaticEligibilityNotice(eligibility.automaticEligibility))) || messages[key]);
  return result;
}
let importingAllCoverage = false;
async function importCoverage() {
  if(coverageMode.value==='no_policy'){
    status.insurance='imported';
    drafts.schedule('insurance',draftValue('insurance'));
    log(true,'No insurance policy was imported.');
    return;
  }
  if(coverageMode.value==='self_pay'){
    const code=String(selfPay.value.code||'').trim().toUpperCase(),amountCents=Math.round(Number(selfPay.value.amount)*100),reason=String(selfPay.value.reason||'').trim();
    if(!code||!String(selfPay.value.amount).trim()||!Number.isSafeInteger(amountCents)||(isProBonoServiceCode(code)?amountCents!==0:amountCents<1)||!reason)throw Error('Enter the self-pay service code, agreed rate and terms before saving.');
    const settings=await api.get(`/family-billing/account/clients/${props.clientId}/settings`,{params:{agencyId:props.agencyId},skipGlobalLoading:true,headers:agencyHeaders()});assertScope();
    const existing=settings.data?.rates?.find(rate=>rate.serviceCode===code);
    await api.put(`/family-billing/account/clients/${props.clientId}/service-rates/${encodeURIComponent(code)}`,{agencyId:props.agencyId,amountCents,priceBasis:selfPay.value.basis||'visit',reason,revision:existing?.revision||0},{skipGlobalLoading:true,headers:agencyHeaders()});assertScope();
    hydratingDrafts=true;selfPay.value={...selfPay.value,imported:true};hydratingDrafts=false;status.insurance='imported';drafts.schedule('insurance',draftValue('insurance'));transitionRefreshKey.value++;log(true,'Self-pay and client service rate saved. Billing responsibility and payment authorization remain pending.');return;
  }
  const active = payerPosition.value;
  try {
    for (const position of ['primary', 'secondary']) {
      const draft = coverageDrafts[position];
      if (!draft.text.trim() || coverageHandled(position)) continue;
      coverageErrors[position] = '';
      hydratingDrafts = true;
      payerPosition.value = position; insuranceText.value = draft.text; status.insurance = 'missing';
      hydratingDrafts = false;
      try {
        await importSupplementary('insurance');
      } catch (e) {
        assertScope();
        coverageErrors[position] = e.response?.data?.error?.message || e.message;
      }
    }
  } finally {
    hydratingDrafts = true;
    payerPosition.value = active; insuranceText.value = coverageDrafts[active].text;
    status.insurance = coverageDrafts[active].imported ? 'imported' : 'missing';
    hydratingDrafts = false;
    drafts.schedule('insurance', draftValue('insurance'));
  }
}
async function importAll(onlySection = null) {
  if (!hasAnyPaste.value || importing.value || drafts.state.loading) return;
  importScopeGeneration = scopeGeneration;
  importingAllCoverage = !onlySection || onlySection === 'insurance';
  pipelineSections = visibleSections.value.map(section => section.key).filter(key => (!onlySection || onlySection === key) &&
    (sectionTexts[key].trim() || (key === 'insurance' && (coverageMode.value!=='insurance' || importingAllCoverage && Object.values(coverageDrafts).some(draft => draft.text.trim())))));
  importing.value = true; error.value = ''; successMessage.value = ''; stepLog.value = [];
  try {
    if (drafts.state.loadError) throw Error('Load the saved chart drafts before importing your pasted changes.');
    if (props.mergeExisting) await beginImportProgress();
    assertScope();
    await drafts.flush();
    assertScope();
    if (Object.values(drafts.state.sections).some(section => section.error)) throw Error('Save the drafts before importing. Retry any draft errors above.');
    if (props.mergeExisting) emit('drafts-saved');
    else await beginImportProgress();
    assertScope();
    if (props.historicalImport) {
      if (pipelineSections.includes('intake')) historicalSource(intakeSourceDate.value, intakeSourceAuthor.value, intakeText.value);
      if (pipelineSections.includes('plan')) historicalSource(planSourceDate.value, planSourceAuthor.value, planText.value);
    }
    const importers = { demographics: importDemographics, insurance: importCoverage, intake: importIntake, plan: importPlan };
    for (const key of pipelineSections) {
      assertScope();
      if (status[key] === 'imported' && !(key === 'insurance' && importingAllCoverage && !allCoverageHandled.value)) continue;
      if (key === 'plan' && pipelineSections.includes('intake') && status.intake !== 'imported') continue;
      try {
        const result = importers[key] ? await importers[key]() : await importSupplementary(key);
        assertScope();
        if (result === 'needs_review') return;
      } catch (e) {
        assertScope();
        status[key] = 'failed';
        log(false, `${sections.find(section => section.key === key).label} failed: ${e.response?.data?.error?.message || e.message}`);
      }
    }
    assertScope();
    await finishImportPipeline();
  } catch (e) {
    if (scopeGeneration === importScopeGeneration) error.value = e.response?.data?.error?.message || e.message || 'Import failed';
  } finally { importing.value = false; }
}

async function markDoneOnly() {completionReview.value=true;keepBlankConfirmed.value=false;}
</script>

<style scoped>
.ehr-contact-review{display:grid;gap:8px;border:1px solid #c7d9eb;border-radius:8px;padding:12px}.ehr-review-needed{border-color:#c49436;background:#fff7e4}.ehr-confirm{display:flex;align-items:center;gap:8px}
.ehr-imported{padding:12px;background:#eaf8ef;border:1px solid #97cbaa;border-radius:8px;color:#17633a;font-weight:600}.ehr-completion-review{margin-top:20px;padding:20px;border:2px solid #275e96;border-radius:12px;background:#f5f9ff}.ehr-completion-review button{margin:12px 10px 0 0}
.ehr-finish { margin-top: 16px; }
.ehr-invitation { border: 0; padding: 0; margin: 0; min-width: 0; }
.ehr-section { margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
.ehr-section-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ehr-source-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 10px 0 16px; }
.ehr-source-fields input { font: inherit; padding: 8px; border: 1px solid #b8c6d2; border-radius: 7px; }
.ehr-bring-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 5000;
  padding: 48px 16px 24px;
  overflow: auto;
}
.ehr-bring {
  box-sizing: border-box;
  min-width: 0;
  width: min(820px, 100%);
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 18px 20px 20px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
}
.ehr-bring--embedded {
  width: 100%;
  margin: 0 0 16px;
  box-shadow: none;
}
.ehr-bring-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.ehr-bring-head h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
}
.ehr-bring-sub {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.85rem;
}
.ehr-link {
  border: none;
  background: none;
  color: #0f766e;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.ehr-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.ehr-chip {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
}
.ehr-chip.is-ok {
  background: #f0fdf4;
  border-color: #86efac;
  color: #166534;
}
.ehr-chip.is-warn {
  background: #fff7ed;
  border-color: #fdba74;
  color: #c2410c;
}
.ehr-chip.is-miss {
  background: #fffbeb;
  border-color: #fcd34d;
  color: #92400e;
}
.ehr-chip.is-bad {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}
.ehr-plan-review-lift :deep(.na-modal-backdrop) {
  z-index: 10300;
}
.ehr-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
}
.ehr-textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  font-size: 0.85rem;
  resize: vertical;
  box-sizing: border-box;
}
.ehr-muted {
  margin: 0 0 10px;
  color: #64748b;
  font-size: 0.82rem;
}
.ehr-log {
  margin: 0 0 10px;
  padding-left: 18px;
  font-size: 0.84rem;
}
.ehr-log .ok { color: #166534; }
.ehr-log .bad { color: #b91c1c; }
.ehr-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.ehr-btn-ghost, .ehr-btn-primary {
  border-radius: 8px;
  padding: 8px 14px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.ehr-btn-ghost {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
}
.ehr-btn-primary {
  border: none;
  background: #173b69;
  color: #fff;
}
.ehr-btn-primary:disabled, .ehr-btn-ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ehr-error { color: #b91c1c; font-size: 0.85rem; }
.ehr-ok { color: #0f766e; font-size: 0.85rem; font-weight: 600; }
</style>
