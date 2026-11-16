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

      <p class="ehr-muted">Each section autosaves as a private draft. Import a section when ready, or import all filled sections.</p>
      <p v-if="drafts.state.loading" class="ehr-muted" role="status">Loading saved drafts…</p>
      <p v-if="drafts.state.loadError" class="ehr-error" role="alert">{{ drafts.state.loadError }} <button type="button" class="ehr-link" @click="retryDraftLoad">Retry loading drafts</button></p>
      <div class="ehr-status-row" aria-label="Setup status">
        <span v-for="section in visibleSections" :key="section.key" class="ehr-chip" :class="statusClass(status[section.key])">{{ section.label }} · {{ status[section.key] }}</span>
      </div>
      <section v-for="section in visibleSections" :key="section.key" class="ehr-section" :aria-label="section.label">
        <label v-if="section.key === 'insurance'" class="ehr-label">Coverage<select v-model="payerPosition" :disabled="busy"><option value="primary">Primary insurance</option><option value="secondary">Secondary insurance</option></select></label>
        <label class="ehr-label">
          {{ section.label }} paste
          <textarea v-model="sectionTexts[section.key]" :data-section="section.key" class="ehr-textarea" :rows="section.rows || 6" :disabled="busy || drafts.state.loading" :placeholder="section.placeholder" />
        </label>
        <p v-if="section.hint" class="ehr-muted">{{ section.hint }}</p>
        <label v-if="section.key === 'demographics'" class="ehr-label">The phone and email in this patient information belong to<select v-model="contactOwner" :disabled="busy"><option value="guardian">Parent / guardian — use their contact card and portal account</option><option value="client">Client — use the client’s own contact details</option></select></label>
        <template v-if="section.key === 'contacts'">
          <label v-if="canPrepareAccounts" class="ehr-label"><span><input v-model="preparePrimaryGuardian" type="checkbox" :disabled="busy" /> Prepare the primary parent’s portal account when their phone or email matches the patient information.</span></label>
          <p class="ehr-muted">Other people remain contacts. Choose additional accounts below after import. Review portal access and send the invitation at the bottom.</p>
          <div v-for="contact in importedContacts" :key="contact.affiliationId" class="ehr-contact">
            <strong>{{ contact.fullName }}</strong> · {{ contact.relationshipType || 'Contact' }}
            <span v-if="contact.portalAccount?.prepared"> · Portal account prepared{{ contact.portalAccount.requiresAccessReview ? ' — review access below' : '' }}</span>
            <label v-else-if="canPrepareAccounts" class="ehr-label"><span><input v-model="guardianContactNames" type="checkbox" :value="contact.fullName" :disabled="busy" /> Prepare a portal account for this contact</span></label>
            <p v-if="contact.portalAccount?.reason" class="ehr-muted">{{ contact.portalAccount.reason }}</p>
          </div>
          <button v-if="guardianContactNames.length" type="button" class="ehr-btn-ghost" :disabled="busy" @click="prepareAdditionalAccounts">Prepare selected portal accounts</button>
        </template>
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
          <button type="button" class="ehr-btn-ghost" :disabled="busy || drafts.state.loading || !sectionTexts[section.key].trim() || (historicalImport && !sourceReviewed)" @click="importAll(section.key)">Import {{ section.label.toLowerCase() }}</button>
        </div>
        <p v-if="drafts.state.sections[section.key]?.error" class="ehr-error" role="alert">{{ drafts.state.sections[section.key].error }} <button type="button" class="ehr-link" @click="drafts.retry(section.key)">Save this paste as the latest draft</button></p>
      </section>

      <ClientMedicalHistory v-if="!historicalImport" ref="historyPanel" :client-id="clientId" :agency-id="agencyId" :client-label="clientLabel" @busy="historyBusy=$event" />

      <ClientPayerLinkage v-if="!historicalImport && canPrepareAccounts" :client-id="clientId" :agency-id="agencyId" :refresh-key="payerRefreshKey" @ready-change="payerReady = $event" @busy="payerBusy = $event" />

      <p v-if="historicalImport" class="ehr-muted">Records from {{ sourceSystem }} are saved as unsigned drafts with their original dates and source author. Review them in the clinical chart before approving current care. Importing does not recreate the original clinician’s signature.</p>
      <label v-if="historicalImport" class="ehr-label"><span><input v-model="sourceReviewed" type="checkbox" :disabled="busy" /> I compared this paste and original dates/authorship with the source. Clinical approval remains a separate review.</span></label>
      <p v-else class="ehr-muted">
        Only filled sections are imported. Treatment plan effective date:
        <strong>{{ todayIso }}</strong>.
        If 1–10 scales (or discharge) can’t be read cleanly, the same treatment-plan review opens so you can fix flags before saving.
      </p>

      <ul v-if="stepLog.length" class="ehr-log">
        <li v-for="(entry, i) in stepLog" :key="i" :class="entry.ok ? 'ok' : 'bad'">{{ entry.message }}</li>
      </ul>
      <p v-if="error" class="ehr-error">{{ error }}</p>
      <p v-if="successMessage" class="ehr-ok">{{ successMessage }}</p>

      <div class="ehr-actions">
        <button v-if="creationFlow && requireVerifiedPayers" type="button" class="ehr-btn-primary" :disabled="busy || !creationRecordsReady || (hasCoveragePaste && !payerReady)" @click="completeCreation">Finish client import</button>
        <button v-if="!creationFlow && !historicalImport" type="button" class="ehr-btn-ghost" :disabled="busy" @click="markDoneOnly">
          {{ markingDone ? 'Marking…' : 'Mark done' }}
        </button>
        <button
          type="button"
          class="ehr-btn-primary"
          :disabled="busy || drafts.state.loading || !hasAnyPaste || (historicalImport && !sourceReviewed)"
          @click="importAll()"
        >
          {{ importing ? 'Importing…' : historicalImport ? 'Save historical intake and plan for clinical review' : 'Import all filled sections' }}
        </button>
      </div>
      <template v-if="!historicalImport && canPrepareAccounts">
        <p v-if="!recordsReadyForInvitation" class="ehr-muted">Import the filled sections and finish pending reviews before sending the portal invitation.</p>
        <fieldset class="ehr-invitation" :disabled="busy || !recordsReadyForInvitation"><ClientTransitionInvitation :client-id="clientId" :agency-id="agencyId" :refresh-key="transitionRefreshKey" @busy="invitationBusy = $event" /></fieldset>
      </template>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showPlanReview" class="ehr-plan-review-lift">
      <NoteAidTreatmentPlanImportReview
        :open="showPlanReview"
        :agency-id="agencyId"
        :client-id="clientId"
        :initial-text="planReviewText"
        :allow-imported-draft="creationFlow"
        mode="import"
        @close="onPlanReviewClose"
        @saved="onPlanReviewSaved"
      />
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import { useAuthStore } from '../../../store/auth';
import api from '../../../services/api';
import { useChartImportDrafts } from '../../../composables/useChartImportDrafts.js';
import ClientPayerLinkage from './ClientPayerLinkage.vue';
import ClientMedicalHistory from './ClientMedicalHistory.vue';
import ClientTransitionInvitation from '../../clients/ClientTransitionInvitation.vue';
import NoteAidTreatmentPlanImportReview from '../../clinical/NoteAidTreatmentPlanImportReview.vue';
import {
  DEFAULT_MEASUREMENT_METHOD,
  inferScaleDirection,
  isObjectiveScaleValid,
  parseScalePair
} from '../../../utils/treatmentPlanDuration.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], required: true },
  clientLabel: { type: String, default: '' },
  initialTexts: { type: Object, default: () => ({}) },
  creationFlow: { type: Boolean, default: false },
  autoImport: { type: Boolean, default: true },
  requireVerifiedPayers: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  historicalImport: { type: Boolean, default: false },
  hideDemographics: { type: Boolean, default: false },
  sourceSystem: { type: String, default: 'TherapyNotes' },
  recordStatus: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['close', 'done', 'imported', 'busy']);
const auth = getActivePinia() ? useAuthStore() : null;
const canPrepareAccounts = computed(() => ['super_admin','admin','support'].includes(auth?.user?.role));

const demographicsText = ref('');
const intakeText = ref('');
let importedIntakeDraft = null;
const reviewPending = reactive({ intake: false, plan: false });
const planText = ref('');
const insuranceText = ref(''), contactsText = ref(''), commentsText = ref(''), payerText = ref(''), billingCommentsText = ref('');
const contactOwner = ref('guardian'), preparePrimaryGuardian = ref(true), importedContacts = ref([]), guardianContactNames = ref([]);
let contactImportRevision = 0;
const sectionTexts = reactive({ demographics: demographicsText, intake: intakeText, plan: planText, insurance: insuranceText, contacts: contactsText, comments: commentsText, payer: payerText, billingComments: billingCommentsText });
const sections = [
  { key: 'comments', label: 'Patient comments', placeholder: 'Patient Comments\nPaste administrative comments…', rows: 4, hint: 'Saved to Administrative note on the overview. Accessible to assigned providers, support, and administrators.' },
  { key: 'demographics', label: 'Demographics', placeholder: 'Legal Name\nDate of Birth\n…' },
  { key: 'contacts', label: 'Additional contacts', placeholder: 'Paste Contacts, including names, relationships, phones, email, and other details…', hint: 'Paste the parent and other contact cards below demographics. Source ROI and reminder details remain available for review.' },
  { key: 'insurance', label: 'Insurance', placeholder: 'Beacon Health Options (43324): Primary\nPolicy Information\nCopay\n$20.00\nMember ID\n…\nPolicy Group\n…\nPolicy Holder\nSelf', hint: 'One paste for this coverage, including carrier, policy and payer details. Confirm the matching electronic payer below after importing.' },
  { key: 'payer', label: 'Payer information', placeholder: 'Payer Information\nPayer Name\nNetwork\nBilling Method\nInsurance Type\nPayer ID\nAddress', hint: 'After import, confirm the matching electronic payer below. A TherapyNotes payer ID alone does not verify the route.' },
  { key: 'billingComments', label: 'Billing comments', placeholder: 'Billing Comments\nPaste billing comments…', rows: 4 },
  { key: 'intake', label: 'Intake', placeholder: 'Paste intake note text…', rows: 8 },
  { key: 'plan', label: 'Treatment plan', placeholder: 'Paste treatment plan text…', rows: 8 }
];
const visibleSections = computed(() => sections.filter(section => props.historicalImport ? ['intake', 'plan'].includes(section.key) : section.key !== 'payer' &&
  (canPrepareAccounts.value || !['insurance','billingComments'].includes(section.key)) && !(props.hideDemographics && section.key === 'demographics')));
const drafts = useChartImportDrafts();
const historyBusy=ref(false),historyPanel=ref(null);
const payerRefreshKey = ref(0), payerReady = ref(false), payerBusy = ref(false);
const transitionRefreshKey = ref(0), invitationBusy = ref(false);
const payerPosition = ref('primary');
const coverageDrafts = reactive({ primary: { text: '', imported: false }, secondary: { text: '', imported: false } });
const allCoverageImported = computed(() => Object.values(coverageDrafts).every(draft => !draft.text.trim() || draft.imported));
const hasCoveragePaste = computed(() => Boolean(payerText.value.trim()) || Object.values(coverageDrafts).some(draft => draft.text.trim()));
const creationRecordsReady = computed(() => allCoverageImported.value && visibleSections.value.filter(section => sectionTexts[section.key].trim()).every(section => status[section.key] === 'imported'));
const recordsReadyForInvitation = computed(() => creationRecordsReady.value && !reviewPending.intake && !reviewPending.plan);
let hydratingDrafts = false;
let pipelineSections = [];

const intakeSourceDate = ref(''), intakeSourceAuthor = ref(''), planSourceDate = ref(''), planSourceAuthor = ref(''), sourceReviewed = ref(false);
const importing = ref(false);
const markingDone = ref(false);
const error = ref('');
const successMessage = ref('');
const stepLog = ref([]);
const showPlanReview = ref(false);
const planReviewText = ref('');
const status = reactive({
  demographics: 'missing',
  intake: 'missing',
  plan: 'missing', insurance: 'missing', contacts: 'missing', comments: 'missing'
});

const todayIso = computed(() => new Date().toISOString().slice(0, 10));
const hasAnyPaste = computed(
  () => visibleSections.value.some(section => sectionTexts[section.key].trim()) || (!props.historicalImport && Object.values(coverageDrafts).some(draft => draft.text.trim()))
);
const busy = computed(() => importing.value || markingDone.value || showPlanReview.value || invitationBusy.value || historyBusy.value || payerBusy.value || drafts.state.loading);
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

function agencyHeaders() {
  const aid = Number(props.agencyId || 0);
  return aid > 0 ? { 'X-Agency-Id': String(aid) } : undefined;
}

function draftValue(key) {
  return { text: sectionTexts[key], metadata: { imported: status[key] === 'imported', needsReview: reviewPending[key] === true,
    ...(key === 'insurance' ? { position: payerPosition.value, coverageDrafts: { primary: { ...coverageDrafts.primary }, secondary: { ...coverageDrafts.secondary } } } : {}),
    ...(key === 'demographics' ? { contactOwner: contactOwner.value } : {}),
    ...(key === 'payer' ? { position: payerPosition.value } : {}), ...(key === 'intake' ? { sourceDate: intakeSourceDate.value, sourceAuthor: intakeSourceAuthor.value } : key === 'plan' ? { sourceDate: planSourceDate.value, sourceAuthor: planSourceAuthor.value } : {}) } };
}
function restoreCoverage(saved, preserve = false) {
  const insurance = saved?.insurance?.value, legacyPayer = saved?.payer?.value;
  const supplied = [props.initialTexts.insurance, props.initialTexts.payer].filter(Boolean).join('\n');
  const active = supplied ? 'primary' : insurance?.position || legacyPayer?.position || 'primary';
  for (const position of ['primary', 'secondary']) {
    if (preserve && coverageDrafts[position].text) continue;
    const stored = insurance?.coverageDrafts?.[position];
    const legacyInsurance = (insurance?.position || 'primary') === position ? insuranceText.value : '';
    const payer = (legacyPayer?.position || 'primary') === position ? payerText.value : '';
    const text = position === 'primary' && supplied ? supplied : stored?.text ?? [legacyInsurance, payer].filter(Boolean).join('\n');
    Object.assign(coverageDrafts[position], { text, imported: stored && stored.text !== text ? false : stored?.imported ?? (Boolean(text) && status.insurance === 'imported' && !payer) });
  }
  payerPosition.value = active;
  insuranceText.value = coverageDrafts[active].text;
  status.insurance = coverageDrafts[active].imported ? 'imported' : 'missing';
  contactOwner.value = saved?.demographics?.value?.contactOwner === 'client' ? 'client' : 'guardian';
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
    for (const position of ['primary', 'secondary']) Object.assign(coverageDrafts[position], { text: '', imported: false });
    importedContacts.value = []; guardianContactNames.value = []; preparePrimaryGuardian.value = true; contactOwner.value = 'guardian';
    for (const section of sections) { sectionTexts[section.key] = props.initialTexts[section.key] || ''; status[section.key] = props.recordStatus?.[section.key] || 'missing'; }
    error.value = ''; successMessage.value = ''; stepLog.value = [];
    showPlanReview.value = false; planReviewText.value = ''; importedIntakeDraft = null;
    intakeSourceDate.value = ''; intakeSourceAuthor.value = ''; planSourceDate.value = ''; planSourceAuthor.value = ''; sourceReviewed.value = false;
    reviewPending.intake = false; reviewPending.plan = false;
    const saved = await drafts.load(props.clientId, props.agencyId);
    if (generation !== scopeGeneration) return;
    for (const section of sections) if (!sectionTexts[section.key] && saved?.[section.key]?.value?.text) sectionTexts[section.key] = saved[section.key].value.text;
    for (const section of sections) if (saved?.[section.key]?.value?.imported && saved[section.key].value.text === sectionTexts[section.key]) status[section.key] = 'imported';
    for (const key of ['intake','plan']) reviewPending[key] = status[key] === 'imported' && saved?.[key]?.value?.needsReview === true;
    restoreCoverage(saved);
    intakeSourceDate.value = saved?.intake?.value?.sourceDate || ''; intakeSourceAuthor.value = saved?.intake?.value?.sourceAuthor || '';
    planSourceDate.value = saved?.plan?.value?.sourceDate || ''; planSourceAuthor.value = saved?.plan?.value?.sourceAuthor || '';
    hydratingDrafts = false;
    void loadImportedContacts(generation);
    for (const section of visibleSections.value) if (sectionTexts[section.key]) drafts.schedule(section.key, draftValue(section.key));
    if (props.creationFlow && props.autoImport && !props.historicalImport) importAll();
  },
  { immediate: true, flush: 'sync' }
);
watch(() => props.recordStatus, record => {
  for (const section of sections) if (status[section.key] !== 'imported' && record?.[section.key]) status[section.key] = record[section.key];
}, { deep: true });
for (const section of sections) {
  watch(() => status[section.key], () => { if (!hydratingDrafts) drafts.schedule(section.key, draftValue(section.key)); }, { flush: 'sync' });
  watch(() => sectionTexts[section.key], () => {
    if (hydratingDrafts) return;
    if (section.key === 'insurance') Object.assign(coverageDrafts[payerPosition.value], { text: insuranceText.value, imported: false });
    if (status[section.key] === 'imported') status[section.key] = 'missing';
    if (section.key === 'intake') importedIntakeDraft = null;
    if (props.historicalImport) sourceReviewed.value = false;
    drafts.schedule(section.key, draftValue(section.key));
  }, { flush: 'sync' });
}
watch(payerPosition, position => {
  if (hydratingDrafts) return;
  hydratingDrafts = true;
  insuranceText.value = coverageDrafts[position].text;
  status.insurance = coverageDrafts[position].imported ? 'imported' : 'missing';
  hydratingDrafts = false;
  drafts.schedule('insurance', draftValue('insurance'));
}, { flush: 'sync' });
watch(contactOwner, () => { if (!hydratingDrafts) { status.demographics = 'missing'; drafts.schedule('demographics', draftValue('demographics')); } }, { flush: 'sync' });
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

function planNeedsReview(parsed, goals) {
  const dischargeBlank = !String(parsed?.dischargePlan || '').trim();
  const objectives = (goals || []).flatMap((g) => g.objectives || []);
  if (!objectives.length) return true;
  const badScale = objectives.some((o) => !isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget));
  return dischargeBlank || badScale;
}

function openPlanReview(text) {
  planReviewText.value = text;
  showPlanReview.value = true;
  status.plan = 'needs review';
  log(true, 'Treatment plan needs review (missing/unclear 1–10 scales or discharge). Confirm in the review dialog.');
}

function onPlanReviewClose() {
  showPlanReview.value = false;
  if (status.plan === 'needs review') {
    log(false, 'Treatment plan review closed without saving');
  }
}

async function onPlanReviewSaved(plan) {
  if (scopeGeneration !== importScopeGeneration) return;
  reviewPending.plan = plan?.status === 'draft';
  showPlanReview.value = false;
  status.plan = 'imported';
  log(true, `Treatment plan saved from review (effective ${todayIso.value})`);
  await finishImportPipeline();
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
  await api.post(
    `/clients/${props.clientId}/demographics/import`,
    {
      contactOwner: contactOwner.value,
      demographics: {
        fullName: p.fullName || '',
        dateOfBirth: p.dateOfBirth || '',
        addressStreet: p.addressStreet || '',
        addressCity: p.addressCity || '',
        addressState: p.addressState || '',
        addressZip: p.addressZip || '',
        timezone: p.timezone || '',
        contactPhone: p.contactPhone || '',
        textMessagesOk: p.textMessagesOk === true,
        email: p.email || '',
        appointmentReminderType: p.appointmentReminderType || '',
        administrativeSex: p.administrativeSex || ''
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
  const res = importedIntakeDraft || await api.post(
    `/clients/${props.clientId}/intake-note/import`,
    { text, ...(props.historicalImport ? { historicalImport: historicalSource(intakeSourceDate.value, intakeSourceAuthor.value, text) } : props.creationFlow ? { sessionContext: { source: 'client_creation_record_import' } } : {}) },
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

  const sections = (draft?.sections || res?.data?.parsed?.sections || []).map((s, i) => ({
    key: s.key || `section_${i + 1}`,
    label: s.label || s.title || s.key,
    body: s.body || s.content || '',
    order: i + 1
  }));
  const parsedDx = res?.data?.parsed?.diagnoses;
  const singleDx = draft?.confirmedDiagnosis || draft?.suggestedDiagnosis || res?.data?.parsed?.diagnosis;
  let diagnoses = [];
  if (Array.isArray(parsedDx) && parsedDx.length) {
    diagnoses = parsedDx.map((d) => ({
      code: d.code || d.icd10Code || '',
      description: d.description || ''
    }));
  } else if (singleDx?.code || singleDx?.icd10Code) {
    diagnoses = [{
      code: singleDx.code || singleDx.icd10Code || '',
      description: singleDx.description || ''
    }];
  }

  try {
    await api.patch(
      `/clients/${props.clientId}/intake-note/${draftId}/sections`,
      { sections, diagnoses, replace: false },
      { skipGlobalLoading: true, headers: agencyHeaders() }
    );
  } catch (e) {
    assertScope();
    const code = e.response?.data?.error?.code;
    const msg = e.response?.data?.error?.message || '';
    if (e.response?.status === 409 && (code === 'intake_already_finalized' || /already finalized/i.test(msg))) {
      await api.patch(
        `/clients/${props.clientId}/intake-note/${draftId}/sections`,
        { sections, diagnoses, replace: true },
        { skipGlobalLoading: true, headers: agencyHeaders() }
      );
    } else {
      throw e;
    }
  }

  assertScope();
  if (props.creationFlow && !diagnoses.some(d => d.code)) {
    reviewPending.intake = true;
    status.intake = 'imported';
    log(true, 'Intake saved; diagnosis review is still pending.');
    return true;
  }
  reviewPending.intake = false;

  try {
    await api.post(
      `/clients/${props.clientId}/intake-note/${draftId}/finalize`,
      { goals: [], replace: false },
      { skipGlobalLoading: true, headers: agencyHeaders() }
    );
  } catch (e) {
    assertScope();
    const code = e.response?.data?.error?.code;
    const msg = e.response?.data?.error?.message || '';
    if (e.response?.status === 409 && (code === 'intake_already_finalized' || /already finalized/i.test(msg))) {
      await api.post(
        `/clients/${props.clientId}/intake-note/${draftId}/finalize`,
        { goals: [], replace: true },
        { skipGlobalLoading: true, headers: agencyHeaders() }
      );
    } else {
      throw e;
    }
  }

  assertScope();
  status.intake = 'imported';
  log(true, 'Intake imported and finalized');
  return true;
}

async function importPlan() {
  const text = planText.value.trim();
  if (!text) return false;
  const parseRes = await api.post(
    '/medical-billing/treatment-plans/parse',
    {
      agencyId: Number(props.agencyId),
      clientId: Number(props.clientId),
      text
    },
    { skipGlobalLoading: true }
  );
  const parsed = parseRes?.data?.parsed || {};
  assertScope();
  const dxList = parsed.diagnoses || [];
  const sharedJust = String(parsed.diagnosticJustification || '').trim()
    || dxList.map((d) => String(d.justification || '').trim()).find(Boolean)
    || '';
  const diagnoses = dxList.length
    ? dxList.map((d, i) => ({
      icd10Code: d.icd10Code || '',
      description: d.description || '',
      isPrimary: i === (parsed.primaryDiagnosisIndex || 0),
      justification: i === 0 ? sharedJust : ''
    }))
    : [];
  const goals = (parsed.goals || []).map((g) => mapGoal(g));

  if (props.historicalImport) {
    const result = await api.post('/medical-billing/treatment-plans', {
      agencyId: Number(props.agencyId), clientId: Number(props.clientId),
      status: 'draft', finalize: false, effectiveDate: planSourceDate.value,
      historicalImport: historicalSource(planSourceDate.value, planSourceAuthor.value, text),
      sourceToolId: 'ehr_transition_import', goals,
      presentingProblem: parsed.presentingProblem || null, prescribedFrequency: parsed.prescribedFrequency || null
    }, { skipGlobalLoading: true });
    assertScope();
    status.plan = 'imported'; reviewPending.plan = result.data?.plan?.status !== 'active';
    log(true, `Historical treatment plan retained with original effective date ${planSourceDate.value}; clinical review remains pending.`);
    return true;
  }

  if (planNeedsReview(parsed, goals)) {
    openPlanReview(text);
    return 'needs_review';
  }

  const primary = diagnoses.find((d) => d.isPrimary) || diagnoses[0];
  const effectiveDate = todayIso.value;
  const dischargeParts = [];
  if (String(parsed.presentingProblem || '').trim()) {
    dischargeParts.push(`Presenting Problem\n${String(parsed.presentingProblem).trim()}`);
  }
  if (String(parsed.prescribedFrequency || '').trim()) {
    dischargeParts.push(`Prescribed Frequency of Treatment\n${String(parsed.prescribedFrequency).trim()}`);
  }
  if (String(parsed.dischargePlan || '').trim()) {
    dischargeParts.push(`Discharge Criteria/Planning\n${String(parsed.dischargePlan).trim()}`);
  }

  const payload = {
      agencyId: Number(props.agencyId),
      clientId: Number(props.clientId),
      title: 'Imported Treatment Plan',
      status: 'active',
      finalize: true,
      effectiveDate,
      dischargePlan: dischargeParts.length ? dischargeParts.join('\n\n') : (parsed.dischargePlan || null),
      presentingProblem: parsed.presentingProblem || null,
      prescribedFrequency: parsed.prescribedFrequency || null,
      sourceToolId: 'ehr_bring_up_to_date',
      icd10Code: primary?.icd10Code || null,
      diagnosisDescription: primary?.description || null,
      diagnosticJustification: sharedJust || null,
      diagnoses,
      goals: goals.map((g, i) => ({
        goalIndex: i + 1,
        goalText: g.goalText,
        projectedCompletion: g.projectedCompletion || null,
        objectives: (g.objectives || []).map((o, j) => ({
          objectiveIndex: j + 1,
          objectiveText: o.objectiveText,
          scaleCurrent: o.scaleCurrent,
          scaleTarget: o.scaleTarget,
          scaleDirection: o.scaleDirection,
          measurementMethod: o.measurementMethod || DEFAULT_MEASUREMENT_METHOD
        }))
      }))
    };
  reviewPending.plan = false;
  try {
    await api.post('/medical-billing/treatment-plans', payload, { skipGlobalLoading: true });
  } catch (e) {
    assertScope();
    if (!props.creationFlow || e.response?.data?.error?.code !== 'intake_not_finalized') throw e;
    await api.post('/medical-billing/treatment-plans', { ...payload, status: 'draft', finalize: false, sourceToolId: 'client_creation_record_import' }, { skipGlobalLoading: true });
    reviewPending.plan = true;
    log(true, 'Treatment plan saved; intake finalization is still pending.');
  }
  assertScope();
  status.plan = 'imported';
  log(true, `Treatment plan saved (effective ${effectiveDate})`);
  return true;
}

async function promoteSetupComplete() {
  await api.post(
    `/clients/${props.clientId}/note-aid-setup-complete`,
    {},
    { skipGlobalLoading: true, headers: agencyHeaders() }
  );
  log(true, 'Marked client setup complete');
}

async function finishImportPipeline() {
  const incomplete = pipelineSections.some(key => sectionTexts[key].trim() && status[key] !== 'imported') || (importingAllCoverage && !allCoverageImported.value);
  if (incomplete) {
    error.value = 'Some records still need attention. Retry the incomplete steps before finishing or posting to the exchange.';
    return;
  }
  const anyOk = pipelineSections.some(key => status[key] === 'imported' || (key === 'insurance' && Object.values(coverageDrafts).some(draft => draft.imported)));
  if (!anyOk) {
    error.value = 'Nothing imported successfully. Check the paste text and try again.';
    return;
  }
  await drafts.flush();
  assertScope();
  try {
    if (pipelineSections.some(key => ['intake', 'plan'].includes(key)) && !props.historicalImport && !reviewPending.intake && !reviewPending.plan
      && (!props.creationFlow || (status.intake === 'imported' && status.plan === 'imported'))) await promoteSetupComplete();
  } catch (e) {
    log(false, `Setup complete skipped: ${e.response?.data?.error?.message || e.message}`);
  }
  successMessage.value = reviewPending.intake || reviewPending.plan
    ? 'Records saved; clinical review remains pending.'
    : (props.creationFlow ? 'Records imported.' : 'Selected sections imported. You can continue with the remaining sections.');
  if (props.creationFlow && props.requireVerifiedPayers) {
    successMessage.value = creationRecordsReady.value ? 'Records imported. Confirm the payer links, then finish client import.' : 'Section imported. Import the remaining filled sections to finish this client.';
    return;
  }
  emit('imported', { ...status });
}

async function completeCreation() {
  if (!creationRecordsReady.value || (hasCoveragePaste.value && !payerReady.value)) return;
  if (await prepareLeave() === false) return;
  emit('imported', { ...status });
}

async function prepareLeave() {
  if (historyPanel.value?.prepareLeave?.() === false) return false;
  await drafts.flush();
  if (Object.values(drafts.state.sections).some(section => section.error) || (drafts.state.loadError && hasAnyPaste.value)) {
    error.value = 'Save the drafts before leaving this client. Retry any draft errors above.';
    return false;
  }
  return true;
}
defineExpose({ prepareLeave });

async function importSupplementary(key) {
  const result = await api.post(`/clients/${props.clientId}/chart-import/sections/${key}`, { text: sectionTexts[key], ...(['insurance','payer'].includes(key) ? { position: payerPosition.value } : {}),
    ...(key === 'contacts' ? { preparePrimaryGuardian: canPrepareAccounts.value && preparePrimaryGuardian.value && contactOwner.value === 'guardian', guardianContactNames: guardianContactNames.value } : {}) }, { skipGlobalLoading: true, headers: agencyHeaders() });
  assertScope();
  if (key === 'insurance') coverageDrafts[payerPosition.value].imported = true;
  status[key] = 'imported';
  transitionRefreshKey.value++;
  if (key === 'contacts') { contactImportRevision++; importedContacts.value = Array.isArray(result.data?.result) ? result.data.result : []; guardianContactNames.value = []; }
  if (['insurance', 'payer'].includes(key)) { payerReady.value = false; payerRefreshKey.value++; }
  const messages = { comments: 'Patient comments saved to Administrative note', insurance: 'Insurance imported for billing review', payer: 'Payer information imported', billingComments: 'Billing comments imported', contacts: 'Additional contacts imported' };
  log(true, messages[key]);
  return result;
}
let importingAllCoverage = false;
async function importCoverage() {
  if (!importingAllCoverage) return importSupplementary('insurance');
  const active = payerPosition.value;
  try {
    for (const position of ['primary', 'secondary']) {
      const draft = coverageDrafts[position];
      if (!draft.text.trim() || draft.imported) continue;
      hydratingDrafts = true;
      payerPosition.value = position; insuranceText.value = draft.text; status.insurance = 'missing';
      hydratingDrafts = false;
      await importSupplementary('insurance');
    }
  } finally {
    hydratingDrafts = true;
    payerPosition.value = active; insuranceText.value = coverageDrafts[active].text;
    status.insurance = coverageDrafts[active].imported ? 'imported' : 'missing';
    hydratingDrafts = false;
    drafts.schedule('insurance', draftValue('insurance'));
  }
}
async function prepareAdditionalAccounts() {
  status.contacts = 'missing';
  await importAll('contacts');
}

async function importAll(onlySection = null) {
  if (!hasAnyPaste.value || importing.value || drafts.state.loading) return;
  importScopeGeneration = scopeGeneration;
  importingAllCoverage = !onlySection;
  pipelineSections = visibleSections.value.map(section => section.key).filter(key => (!onlySection || onlySection === key) &&
    (sectionTexts[key].trim() || (key === 'insurance' && importingAllCoverage && Object.values(coverageDrafts).some(draft => draft.text.trim()))));
  importing.value = true; error.value = ''; successMessage.value = ''; stepLog.value = [];
  try {
    await drafts.flush();
    assertScope();
    if (props.historicalImport) {
      if (pipelineSections.includes('intake')) historicalSource(intakeSourceDate.value, intakeSourceAuthor.value, intakeText.value);
      if (pipelineSections.includes('plan')) historicalSource(planSourceDate.value, planSourceAuthor.value, planText.value);
    }
    const importers = { demographics: importDemographics, insurance: importCoverage, intake: importIntake, plan: importPlan };
    for (const key of pipelineSections) {
      assertScope();
      if (status[key] === 'imported' && !(key === 'insurance' && importingAllCoverage && !allCoverageImported.value)) continue;
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

async function markDoneOnly() {
  markingDone.value = true;
  error.value = '';
  try {
    await promoteSetupComplete();
    successMessage.value = 'Marked done.';
    emit('done', { marked: true });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not mark done';
  } finally {
    markingDone.value = false;
  }
}
</script>

<style scoped>
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
