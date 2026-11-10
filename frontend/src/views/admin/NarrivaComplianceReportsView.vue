<template>
  <section class="ncr" :class="{'ncr--embedded':embedded}" aria-label="Narriva compliance reports">
    <header class="ncr-heading">
      <div><img :src="NARRIVA_BRAND.compliance" alt="Narriva Compliance by AuricWell" /><h1>{{ testMode ? 'Test a note' : 'Compliance reports' }}</h1><p>{{ agency?.name || 'Your agency' }} · {{ testMode ? 'Standalone Narriva Compliance tester' : 'Sampled documentation and treatment review' }}</p></div>
      <button v-if="!testMode" class="secondary" :disabled="loading || working" @click="load">Refresh</button>
    </header>
    <nav class="ncr-jump" aria-label="Compliance tools"><button class="secondary" :aria-pressed="!testMode" @click="testMode=false">Agency reports</button><button class="secondary" :aria-pressed="testMode" @click="testMode=true">Test a note</button></nav>
    <p v-if="!agencyId" class="notice">Select an agency to review its reports.</p>
    <NarrivaComplianceTester v-if="testMode && agencyId" :key="agencyId" :agency-id="agencyId" />
    <p v-if="!testMode && error" class="error" role="alert">{{ error }}</p>
    <p v-if="!testMode && loading" role="status">Loading reports…</p>
    <template v-else-if="!testMode && settings">
      <nav class="ncr-jump" aria-label="Compliance page"><a href="#narriva-manual-run">Run manually</a><a href="#narriva-report-history">Report history</a><a href="#narriva-report-settings">Frequency and sample</a></nav>
      <section class="ncr-schedule panel" :data-state="scheduleStatus.state" aria-labelledby="ncr-schedule-title">
        <div><span class="eyebrow">Automatic reporting</span><h2 id="ncr-schedule-title">{{ scheduleStatus.title }}</h2><p v-if="settings.enabled && settings.cadence !== 'manual' && settings.nextRunAt"><time :datetime="settings.nextRunAt">{{ dateTime(settings.nextRunAt) }}</time></p><p v-if="scheduledPeriod" class="muted">Reporting period: {{ scheduledPeriod.start }} through {{ scheduledPeriod.end }}</p><p class="muted">{{ scheduleStatus.detail }}</p></div>
        <div v-if="scheduleStatus.countdown" class="ncr-countdown"><span class="eyebrow">Time remaining</span><strong role="timer" aria-live="off" aria-label="Time until the next automatic report">{{ scheduleStatus.countdown }}</strong></div>
      </section>
      <section class="ncr-intro">
        <div><span class="eyebrow">Per report run</span><strong class="price">{{ noCharge ? 'No charge' : money(billing.priceCents, billing.currency) }}</strong><p v-if="noCharge">{{ money(0, billing.currency) }} per completed report. The report fee is currently waived.</p><p v-else>Billed once for a completed report. Retries do not add another charge.</p></div>
        <div><strong>{{ settings.sampleSize }} clients · one agency</strong><p>{{ consecutiveCount }} consecutive-note reviews and {{ randomCount }} random-note reviews, with up to {{ settings.notesPerClient }} notes per client.</p><p class="muted">Consecutive notes are checked for duplication and documented progress. Random notes retain current Narriva approvals; unapproved notes receive further review.</p></div>
      </section>
      <p v-if="noCharge" class="notice">This waiver does not authorize future charges. A paid price requires new acceptance before reports can run at that price.</p>
      <p v-if="billing.reason || !billing.canRun" class="notice">{{ billing.reason || (noCharge ? 'Enable reports at no charge before running a report.' : 'Enable the report add-on and accept its per-run price before running a report.') }}</p>
      <div class="ncr-controls">
        <section id="narriva-manual-run" class="panel">
          <h2>Run a report</h2><p>Sample saved notes within this service-date range. Fewer available clients or notes are reported explicitly.</p>
          <form @submit.prevent="prepareRun">
            <div class="fields"><label>From<input v-model="periodStart" type="date" required :disabled="working" /></label><label>Through<input v-model="periodEnd" type="date" required :disabled="working" /></label></div>
            <button class="primary" :disabled="working || !billing.canRun || !periodValid">Review run · {{ noCharge ? 'No charge' : money(billing.priceCents, billing.currency) }}</button>
          </form>
        </section>
        <section id="narriva-report-settings" class="panel">
          <h2>Frequency and sample</h2><p>{{ settings.enabled ? settings.cadence === 'manual' ? 'The report add-on is enabled for manual runs.' : 'Scheduled reports are enabled.' : 'Quarterly is the default. Scheduling is off until you enable it.' }}</p>
          <form @submit.prevent="prepareSettings">
            <div class="fields"><label>Frequency<select v-model="draftSettings.cadence" :disabled="working"><option value="manual">Manual only</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annually</option><option value="custom">Custom interval</option></select></label><label>Clients per report<input v-model.number="draftSettings.sampleSize" type="number" min="2" max="50" required :disabled="working" /></label></div>
            <div class="fields"><label v-if="draftSettings.cadence === 'custom'">Every (days)<input v-model.number="draftSettings.intervalDays" type="number" min="1" max="366" required :disabled="working" /></label><label>Notes per client<input v-model.number="draftSettings.notesPerClient" type="number" min="1" max="5" required :disabled="working" /></label></div>
            <label class="check"><input v-model="draftSettings.enabled" type="checkbox" :disabled="working || billing.available === false" />Enable the report add-on{{ draftSettings.cadence !== 'manual' ? ' and scheduled runs' : '' }}{{ noCharge ? ' at no charge' : '' }}</label>
            <p v-if="settings.nextRunAt" class="muted">Next scheduled run: {{ dateTime(settings.nextRunAt) }}</p>
            <button class="secondary" :disabled="working">Review settings</button>
          </form>
        </section>
      </div>
      <section id="narriva-report-history" class="panel ncr-history">
        <h2>Report history</h2><p v-if="!runs.length" class="muted">No reports yet. Running a report does not change notes, signatures, treatment plans, or claims.</p>
        <div v-for="run in runs" :key="run.id" class="run-row">
          <button class="run-open" @click="openRun(run.id)"><strong>{{ dateOnly(run.periodStart || run.period_start) }} – {{ dateOnly(run.periodEnd || run.period_end) }}</strong><span>{{ run.sampledClients ?? run.summary?.sampledClients ?? '—' }} clients · {{ statusLabel(run.status) }}</span><span v-if="runFee(run)">{{ runFee(run) }}</span><span v-if="run.completedAt || run.createdAt">{{ run.completedAt ? 'Completed' : 'Requested' }} {{ dateTime(run.completedAt || run.createdAt) }}</span></button>
          <span class="status" :class="`status-${run.status}`">{{ statusLabel(run.status) }}</span>
        </div>
      </section>
      <section class="panel standards"><h2>What this report establishes</h2><p>Findings follow the supplied CCHA SFY25–26 reference and the service rules available for review. Narriva approval is tracked for the exact saved note. It is not an insurer audit result.</p><p>Client identities remain inside the authorized application. The report uses client reference IDs and redacted clinical content. Claim matching, PDF identifiers, and signature evidence are assessed separately; missing evidence stays unassessed.</p><details v-if="standard"><summary>Audit reference and checklist</summary><p>{{ standard.title }} · {{ standard.edition }}</p><p>{{ standard.scope }}</p><div v-for="group in standard.groups" :key="group.id"><h3>{{ group.label }}</h3><ul><li v-for="item in group.checks" :key="item.id">{{ item.label }} <small>(p. {{ item.sourcePage }})</small></li></ul></div></details></section>
    </template>

    <div v-if="confirmation" class="overlay" @click.self="closeConfirmation">
      <section class="dialog confirm" role="dialog" aria-modal="true" aria-labelledby="ncr-confirm-title" @keydown.esc="closeConfirmation" @keydown.tab="trapFocus">
        <h2 id="ncr-confirm-title">{{ confirmation.kind === 'run' ? 'Confirm report run' : 'Confirm report settings' }}</h2>
        <p>{{ agency?.name || 'This agency' }} · {{ confirmationNoCharge ? 'No charge · ' : '' }}{{ money(confirmation.priceCents, billing.currency) }} per completed run</p>
        <p v-if="confirmation.kind === 'run'">{{ periodStart }} through {{ periodEnd }} · {{ settings.sampleSize }} clients, up to {{ settings.notesPerClient }} notes each.</p>
        <p v-else>{{ draftSettings.sampleSize }} clients, up to {{ draftSettings.notesPerClient }} notes each. {{ draftSettings.enabled ? frequencyLabel(draftSettings) : 'The add-on will be disabled. Existing reports are retained.' }}</p>
        <p v-if="confirmationNoCharge" class="notice">No future paid price is accepted by this confirmation. Paid reports require a new acceptance.</p>
        <label v-if="chargeAcceptanceNeeded" class="check"><input v-model="acceptCharge" type="checkbox" /><span v-if="confirmationNoCharge">{{ confirmation.kind === 'settings' ? 'I enable reports' : 'I authorize this report' }} at no charge for this agency{{ confirmation.kind === 'settings' && draftSettings.cadence !== 'manual' ? ' on this schedule' : '' }}.</span><span v-else>I authorize {{ money(confirmation.priceCents, billing.currency) }} per completed run for this agency{{ confirmation.kind === 'settings' && draftSettings.cadence !== 'manual' ? ' on this schedule' : '' }}.</span></label>
        <div class="dialog-actions"><button class="secondary" :disabled="working" @click="closeConfirmation">Cancel</button><button class="primary" :disabled="working || (chargeAcceptanceNeeded && !acceptCharge)" @click="confirmAction">{{ working ? 'Working…' : confirmation.kind === 'run' ? 'Run report' : 'Save settings' }}</button></div>
        <p v-if="working" role="status">Your request is processing. Keep this page open; a retry uses the same request ID.</p><p v-if="error" class="error" role="alert">{{ error }}</p>
      </section>
    </div>
    <div v-if="detailOpen" class="overlay" @click.self="closeDetail">
      <section class="dialog report" role="dialog" aria-modal="true" aria-labelledby="ncr-report-title" @keydown.esc="closeDetail" @keydown.tab="trapFocus">
        <header><h2 id="ncr-report-title">Narriva Compliance Report</h2><button class="secondary" @click="closeDetail">Close</button></header>
        <p v-if="detailLoading" role="status">Loading report…</p><p v-if="detailError" role="alert" class="error">{{ detailError }}</p>
        <template v-if="selectedRun">
          <p>{{ agency?.name }} · {{ dateOnly(selectedRun.periodStart || selectedRun.period_start) }} – {{ dateOnly(selectedRun.periodEnd || selectedRun.period_end) }}</p>
          <p><strong>{{ statusLabel(selectedRun.status) }}</strong> · {{ selectedRun.standardVersion || standard?.edition }}</p>
          <p v-if="runFee(selectedRun)" class="run-fee">{{ runFee(selectedRun) }}</p>
          <div class="report-actions"><button class="secondary" @click="downloadReport">Download report JSON</button><button class="secondary" @click="printReport">Print / Save PDF</button><button v-if="['failed','unavailable'].includes(selectedRun.status)" class="secondary" :disabled="working || !billing.canRun" @click="retryRun">Retry this run · no duplicate charge</button></div>
          <p class="notice">Internal review findings are not payer approval. Unassessed evidence must be reviewed before an audit-readiness conclusion.</p>
          <dl class="metrics"><div v-for="metric in summaryMetrics" :key="metric.label"><dt>{{ metric.label }}</dt><dd>{{ metric.value }}</dd></div></dl>
          <p v-if="selectedRun.message || selectedRun.error" class="notice">{{ selectedRun.message || selectedRun.error }}</p>
          <article v-for="sample in reportSamples" :key="sample.clientRef" class="sample">
            <h3>{{ sample.clientRef }} <span>{{ sample.cohort === 'consecutive' ? 'Consecutive notes' : 'Random notes' }}</span></h3>
            <p v-if="sample.message" class="muted">{{ sample.message }}</p>
            <ul v-if="sample.findings?.length"><li v-for="(finding, index) in sample.findings" :key="index">{{ findingText(finding) }}</li></ul>
            <div v-if="sample.longitudinal" class="longitudinal">
              <p v-if="sample.longitudinal.uniqueness"><strong>Note uniqueness:</strong> {{ statusLabel(sample.longitudinal.uniqueness.status) }}</p>
              <ul><li v-for="(pair,index) in sample.longitudinal.uniqueness?.pairs || []" :key="index">{{ pair.first }} and {{ pair.second }}: {{ pair.similarity }}% text overlap · {{ statusLabel(pair.kind) }}</li></ul>
              <p class="muted">{{ sample.longitudinal.uniqueness?.detail }}</p>
              <p v-if="sample.longitudinal.progress?.selectionCoverage && !sample.longitudinal.progress.selectionCoverage.complete" class="notice">Treatment progress covers {{ sample.longitudinal.progress.selectionCoverage.includedCount }} of {{ sample.longitudinal.progress.selectionCoverage.requestedCount }} selected sessions. {{ sample.longitudinal.progress.selectionCoverage.reason }}</p>
              <ul><li v-for="objective in sample.longitudinal.progress?.objectives || []" :key="objective.objectiveRef"><strong>{{ objective.objectiveRef }} · {{ statusLabel(objective.trend) }}</strong><p>{{ objective.reason }}</p></li></ul>
              <p>{{ sample.longitudinal.progress?.advisory || sample.longitudinal.summary || sample.longitudinal.message }}</p>
              <ul><li v-for="(finding,index) in sample.longitudinal.findings || sample.longitudinal.advisories || []" :key="index">{{ findingText(finding) }}</li></ul>
            </div>
            <details v-for="(note,index) in sample.notes || []" :key="note.noteRef || note.id || index" class="report-note">
              <summary>Note {{ index + 1 }} · {{ statusLabel(note.status || note.evaluationStatus) }} <span v-if="note.approvalStatus || note.priorApproval">· {{ approvalLabel(note) }}</span></summary>
              <p v-if="note.message">{{ note.message }}</p>
              <ul><li v-for="(finding, findingIndex) in note.findings || []" :key="findingIndex">{{ findingText(finding) }}</li></ul>
              <p v-if="note.bypassReason"><strong>Kept-as-is reason:</strong> {{ note.bypassReason }}</p>
              <ul v-if="note.priorApproval?.findings?.length"><li v-for="(finding,index) in note.priorApproval.findings" :key="index"><strong>Original review:</strong> {{ findingText(finding) }}<p v-if="finding.bypassReason || finding.reason">Kept-as-is reason: {{ finding.bypassReason || finding.reason }}</p></li></ul>
              <p v-if="note.audit?.status"><strong>Audit evidence:</strong> {{ statusLabel(note.audit.status) }}</p>
              <ul v-if="note.audit?.checks"><li v-for="check in note.audit.checks" :key="check.id"><strong>{{ check.label }} — {{ statusLabel(check.status) }}</strong><p>{{ check.detail }}</p></li></ul>
              <pre v-if="note.redactedNarrative || note.narrative" class="note-text">{{ note.redactedNarrative || note.narrative }}</pre>
            </details>
          </article>
          <details v-if="selectedRun.provenance"><summary>Sampling and review record</summary><pre>{{ JSON.stringify(selectedRun.provenance, null, 2) }}</pre></details>
        </template>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import { NARRIVA_BRAND } from '../../config/narrivaBrand';
import { reportScheduleStatus, scheduledReportPeriod } from '../../utils/narrivaReportSchedule';
import NarrivaComplianceTester from '../../components/clinical/NarrivaComplianceTester.vue';

defineProps({embedded:Boolean});

const agencyStore = useAgencyStore();
const testMode = ref(false);
const agency = computed(() => agencyStore.currentAgency?.value || agencyStore.currentAgency);
const agencyId = computed(() => Number(agency.value?.id) || null);
const base = '/narriva/compliance-reports';
const settings = ref(null), billing = ref({}), standard = ref(null), runs = ref([]), draftSettings = ref({});
const loading = ref(false), working = ref(false), error = ref(''), confirmation = ref(null), acceptCharge = ref(false);
const detailOpen = ref(false), detailLoading = ref(false), detailError = ref(''), selectedRun = ref(null);
const clock = ref(Date.now());
let clockTimer;
const scheduleStatus = computed(() => reportScheduleStatus(settings.value, billing.value, clock.value));
const scheduledPeriod = computed(() => settings.value?.enabled && settings.value.cadence !== 'manual' ? scheduledReportPeriod(settings.value) : null);
const updateClock = () => { clock.value = Date.now(); };
onMounted(() => { clockTimer = setInterval(updateClock, 60000); document.addEventListener('visibilitychange', updateClock); });
let generation = 0, detailGeneration = 0, refreshTimer = null, previousFocus = null;
const now = new Date(), quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
const ymd = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const periodStart = ref(ymd(new Date(quarterStart.getFullYear(), quarterStart.getMonth() - 3, 1)));
const periodEnd = ref(ymd(new Date(quarterStart.getFullYear(), quarterStart.getMonth(), 0)));
const periodValid = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(periodStart.value) && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd.value) && periodStart.value <= periodEnd.value && periodEnd.value <= ymd(new Date()));
const consecutiveCount = computed(() => Math.floor((settings.value?.sampleSize || 10) / 2));
const randomCount = computed(() => (settings.value?.sampleSize || 10) - consecutiveCount.value);
const chargeAcceptanceNeeded = computed(() => confirmation.value?.kind === 'run' || draftSettings.value.enabled);
const isZeroPrice = value => value !== null && value !== undefined && value !== '' && Number(value) === 0;
const noCharge = computed(() => isZeroPrice(billing.value.priceCents));
const confirmationNoCharge = computed(() => isZeroPrice(confirmation.value?.priceCents));
const reportSamples = computed(() => selectedRun.value?.samples || selectedRun.value?.result?.samples || []);
const summaryMetrics = computed(() => {
  const summary = selectedRun.value?.summary || {};
  return [['Clients sampled','sampledClients'], ['Notes selected','selectedNotes'], ['Existing approvals','approvedNotes'], ['Further reviews','evaluatedNotes'], ['Unavailable','unavailableNotes']].map(([label,key]) => ({ label, value: summary[key] ?? '—' }));
});
const errorMessage = e => e?.response?.data?.error?.message || e?.response?.data?.message || 'This request could not be completed. Please refresh or retry.';
const money = (cents, currency = 'USD') => Number.isSafeInteger(Number(cents)) && Number(cents) >= 0 && cents != null ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(cents) / 100) : 'Price not configured';
const runFee = run => {
  const cents=run?.billing?.unitCents;
  if(cents == null || cents === '' || !Number.isSafeInteger(Number(cents)) || Number(cents) < 0)return '';
  return isZeroPrice(cents) ? `No charge · ${money(cents, run.billing.currency || 'USD')}` : `Price for this run: ${money(cents, run.billing.currency || 'USD')}`;
};
const dateOnly = value => String(value || '').slice(0,10) || '—';
const dateTime = value => {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Not scheduled';
  const options = { dateStyle: 'long', timeStyle: 'short', timeZone: agency.value?.timezone || 'America/Denver' };
  try { return new Intl.DateTimeFormat('en-US', options).format(new Date(value)) + ` (${options.timeZone})`; }
  catch { return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(value)) + ' (UTC)'; }
};
const statusLabel = value => ({ completed:'Completed', running:'In progress', pending:'Pending', queued:'Queued', failed:'Could not complete', unavailable:'Unavailable', empty:'No eligible notes', passed:'Confirmed', findings:'Findings to review', incomplete:'Incomplete evidence', ready_for_review:'Ready for clinician review', not_assessed:'Not assessed', not_applicable:'Not applicable', approved:'Existing Narriva approval', verified:'Existing Narriva approval', skipped_approved:'Approval retained', evaluated:'Evaluated', bypassed:'Kept as written', unapproved:'Not approved', stale:'Approval no longer current' }[value] || String(value || 'Not assessed').replaceAll('_',' '));
const frequencyLabel = value => value.cadence === 'manual' ? 'Manual runs only; no scheduled charges.' : value.cadence === 'custom' ? `Scheduled every ${value.intervalDays} days.` : `${{ monthly:'Monthly', quarterly:'Quarterly', annual:'Annual' }[value.cadence] || value.cadence} scheduled runs.`;
const findingText = finding => typeof finding === 'string' ? finding : finding?.message || finding?.detail || finding?.label || 'Review required';
const approvalLabel = note => statusLabel(note.approvalStatus || (typeof note.priorApproval === 'string' ? note.priorApproval : note.priorApproval?.status));
function options(id = agencyId.value) { return { params: { agencyId:id }, headers: { 'X-Agency-Id': String(id) }, skipGlobalLoading:true }; }
function resetDetail() { clearTimeout(refreshTimer); detailGeneration++; selectedRun.value=null; detailLoading.value=false; detailError.value=''; detailOpen.value=false; }
async function load() {
  updateClock();
  const current = ++generation, id = agencyId.value;
  settings.value=null; runs.value=[]; billing.value={}; standard.value=null; error.value=''; confirmation.value=null; acceptCharge.value=false; resetDetail();
  if (!id) { loading.value=false; return; }
  loading.value=true;
  try {
    const [config, history] = await Promise.all([api.get(`${base}/settings`,options(id)), api.get(`${base}/runs`,options(id))]);
    if (current !== generation || id !== agencyId.value) return;
    settings.value=config.data.settings; billing.value=config.data.billing || {}; standard.value=config.data.standard;
    draftSettings.value={...settings.value}; runs.value=history.data.runs || [];
  } catch (e) { if (current === generation) error.value=errorMessage(e); }
  finally { if (current === generation) loading.value=false; }
}
function prepareRun() {
  if (!billing.value.canRun || !periodValid.value || working.value) return;
  confirmation.value={ kind:'run', idempotencyKey:crypto.randomUUID(), agencyId:agencyId.value, priceCents:billing.value.priceCents }; acceptCharge.value=false;
}
function prepareSettings() { if (working.value) return; confirmation.value={ kind:'settings', agencyId:agencyId.value, priceCents:billing.value.priceCents }; acceptCharge.value=false; }
function closeConfirmation() { if (!working.value) { confirmation.value=null; acceptCharge.value=false; } }
async function confirmAction() {
  const action=confirmation.value, id=agencyId.value, current=generation;
  if (!action || action.agencyId !== id || working.value || (chargeAcceptanceNeeded.value && !acceptCharge.value)) return;
  working.value=true; error.value='';
  try {
    if (action.kind === 'settings') {
      await api.patch(`${base}/settings`, { agencyId:id, revision:settings.value.revision ?? 0, enabled:!!draftSettings.value.enabled, cadence:draftSettings.value.cadence, intervalDays:Number(draftSettings.value.intervalDays || 90), sampleSize:Number(draftSettings.value.sampleSize), notesPerClient:Number(draftSettings.value.notesPerClient), confirmCharge:!!acceptCharge.value, acceptedPriceCents:action.priceCents }, options(id));
      if (current === generation && id === agencyId.value) { confirmation.value=null; await load(); }
    } else {
      const response=await api.post(`${base}/runs`, { agencyId:id, periodStart:periodStart.value, periodEnd:periodEnd.value, idempotencyKey:action.idempotencyKey, confirmCharge:true, acceptedPriceCents:action.priceCents }, options(id));
      if (current !== generation || id !== agencyId.value) return;
      confirmation.value=null; const run=response.data.run || response.data;
      await load(); if (id === agencyId.value && run.id) await openRun(run.id);
    }
  } catch (e) { if (current === generation && id === agencyId.value) error.value=errorMessage(e); }
  finally { working.value=false; }
}
async function openRun(runId) {
  clearTimeout(refreshTimer);
  const current=++detailGeneration, id=agencyId.value;
  detailOpen.value=true; detailLoading.value=true; selectedRun.value=null; detailError.value='';
  try { const response=await api.get(`${base}/runs/${encodeURIComponent(runId)}`,options(id)); if(current===detailGeneration && id===agencyId.value) { selectedRun.value=response.data.run || response.data; scheduleRefresh(runId,current,id); } }
  catch (e) { if(current===detailGeneration && id===agencyId.value) detailError.value=errorMessage(e); }
  finally { if(current===detailGeneration) detailLoading.value=false; }
}
function scheduleRefresh(runId, current, id) {
  if (!['queued','running'].includes(selectedRun.value?.status)) return;
  refreshTimer=setTimeout(async()=>{
    if(current!==detailGeneration || id!==agencyId.value || !detailOpen.value)return;
    try {
      const response=await api.get(`${base}/runs/${encodeURIComponent(runId)}`,options(id));
      if(current!==detailGeneration || id!==agencyId.value)return;
      selectedRun.value=response.data.run || response.data; scheduleRefresh(runId,current,id);
    } catch(e) { if(current===detailGeneration){selectedRun.value=null;detailError.value=errorMessage(e);} }
  },5000);
}
function closeDetail() { resetDetail(); }
async function retryRun() {
  const run=selectedRun.value, id=agencyId.value, current=generation;
  if(!run || working.value || !billing.value.canRun)return;
  working.value=true; detailError.value='';
  try { await api.post(`${base}/runs/${encodeURIComponent(run.id)}/retry`,{agencyId:id},options(id)); if(current===generation && id===agencyId.value) await openRun(run.id); }
  catch(e) { if(current===generation && id===agencyId.value) detailError.value=errorMessage(e); }
  finally { working.value=false; }
}
async function downloadReport() {
  const run=selectedRun.value, id=agencyId.value, current=detailGeneration;
  if(!run)return;
  // Reauthorize every export rather than exporting data cached after revocation.
  try {
    const response=await api.get(`${base}/runs/${encodeURIComponent(run.id)}`,options(id));
    if(current!==detailGeneration || id!==agencyId.value)return;
    const blob=new Blob([JSON.stringify(response.data.run || response.data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=`narriva-compliance-${String(run.id).replace(/[^\w-]/g,'')}.json`;link.click();URL.revokeObjectURL(url);
  } catch(e) { if(current===detailGeneration){selectedRun.value=null;detailError.value=errorMessage(e);} }
}
async function printReport() {
  const run=selectedRun.value, id=agencyId.value, current=detailGeneration;
  if(!run)return;
  try {
    const response=await api.get(`${base}/runs/${encodeURIComponent(run.id)}`,options(id));
    if(current!==detailGeneration || id!==agencyId.value)return;
    selectedRun.value=response.data.run || response.data;
    await nextTick(); document.body.classList.add('narriva-report-print');
    const closed=[...document.querySelectorAll('.ncr .report details:not([open])')]; closed.forEach(el=>{el.open=true;});
    try { window.print(); } finally { closed.forEach(el=>{el.open=false;}); }
  } catch(e) { if(current===detailGeneration){selectedRun.value=null;detailError.value=errorMessage(e);} }
  finally { document.body.classList.remove('narriva-report-print'); }
}
watch(agencyId,load,{immediate:true});
function trapFocus(event) {
  const items=[...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href]')].filter(el=>!el.closest('details:not([open])') || el.tagName==='SUMMARY');
  if(!items.length)return;
  if(event.shiftKey && document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}
  else if(!event.shiftKey && document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}
}
watch(()=>!!confirmation.value || detailOpen.value,async(open,wasOpen)=>{
  if(open&&!wasOpen){previousFocus=document.activeElement;await nextTick();document.querySelector('.ncr .dialog button:not(:disabled),.ncr .dialog input')?.focus();}
  else if(!open&&wasOpen){previousFocus?.focus?.();previousFocus=null;}
});
onBeforeUnmount(()=>{clearInterval(clockTimer);document.removeEventListener('visibilitychange',updateClock);generation++;detailGeneration++;clearTimeout(refreshTimer);document.body.classList.remove('narriva-report-print');});
</script>

<style scoped>
.ncr.ncr--embedded{max-width:none;width:100%;margin:0;padding:0 0 60px}
.ncr-heading{flex-wrap:wrap}.ncr-heading>div{min-width:0;flex:1 1 240px}.ncr .run-open{min-width:0;overflow-wrap:anywhere}.ncr-jump{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}.ncr-jump a{display:inline-flex;align-items:center;min-height:44px;padding:9px 15px;border:1px solid #c4d3e2;border-radius:9px;background:white;color:#204c72;text-decoration:none;font-weight:600}.ncr-jump a:focus-visible{outline:3px solid #4389c0;outline-offset:3px}.ncr-schedule{display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,auto);gap:24px;border-left:4px solid #d0a646!important;background:linear-gradient(110deg,#fff,#f3f7fb)!important}.ncr-schedule h2{margin:7px 0}.ncr-schedule time{font-weight:650}.ncr-countdown{display:flex;flex-direction:column;justify-content:center;border-left:1px solid #d2dfea;padding-left:24px}.ncr-countdown strong{display:block;font-size:24px;line-height:1.5;margin-top:7px;overflow-wrap:anywhere}.ncr [id^="narriva-"]{scroll-margin-top:24px}@media(max-width:700px){.ncr-schedule{grid-template-columns:1fr;gap:12px}.ncr-countdown{border-left:0;border-top:1px solid #d2dfea;padding:14px 0 0}.ncr-countdown strong{font-size:22px}.ncr-jump a{flex:1;justify-content:center;text-align:center}}

.ncr{max-width:1180px;margin:0 auto;padding:28px 22px 80px;color:#173754;line-height:1.55}.ncr *{box-sizing:border-box}.ncr-heading{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:24px}.ncr-heading img{width:295px;max-width:100%;height:auto}.ncr h1{font-size:30px;margin:16px 0 4px}.ncr h2{font-size:19px;margin:0 0 10px}.ncr h3{font-size:16px}.ncr p{margin:8px 0 12px}.ncr button,.ncr input,.ncr select{font:inherit}.ncr button{cursor:pointer;border:1px solid #c4d3e2;border-radius:9px;padding:10px 15px;min-height:44px;line-height:1.35}.ncr button:disabled{opacity:.55;cursor:default}.ncr .primary{background:#185283;color:white;border-color:#185283}.ncr .secondary{background:white;color:#204c72}.ncr button:focus-visible,.ncr input:focus-visible,.ncr select:focus-visible,.ncr summary:focus-visible{outline:3px solid #4389c0;outline-offset:3px}.ncr-intro{display:grid;grid-template-columns:1fr 2fr;gap:32px;border:1px solid #d9e4ed;border-left:4px solid #d0a646;padding:24px;border-radius:13px;background:#f7fafc;margin-bottom:20px}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.07em;display:block}.price{font-size:38px;display:block}.muted{color:#60788d;font-size:14px}.ncr-controls{display:grid;grid-template-columns:1fr 1fr;gap:20px}.panel{border:1px solid #d7e2eb;border-radius:13px;padding:22px;background:#fff;margin-bottom:20px}.fields{display:flex;gap:14px;margin:15px 0}.fields>label{flex:1;min-width:0}.fields input,.fields select{width:100%;min-height:44px;border:1px solid #b9cbdc;border-radius:7px;background:#fff;color:#173754;padding:9px;margin-top:5px}.check{display:flex;align-items:flex-start;gap:10px;margin:18px 0}.check input{width:19px;height:19px;flex:none;margin-top:3px}.notice{background:#fff8e9;padding:13px 17px;border-left:3px solid #bb902d;border-radius:5px;font-size:14px}.error{background:#fff0f1;color:#a22438;border:1px solid #e6bac2;padding:13px;border-radius:8px}.run-row{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #e1e9ef;gap:12px;padding:8px 0}.ncr .run-open{display:flex;flex-direction:column;align-items:flex-start;border:0;background:white;text-align:left;flex:1}.run-open span{color:#60788d;font-size:13px}.status{font-size:12px;padding:5px 10px;background:#edf2f7;border-radius:15px}.status-completed{background:#eaf5ef;color:#24623f}.status-failed,.status-unavailable{background:#fff0f1;color:#982b3a}.standards{font-size:14px}.ncr details>summary{cursor:pointer;font-weight:600;padding:8px 0}.ncr li{margin:7px 0}.overlay{position:fixed;inset:0;background:#10273788;z-index:20000;display:flex;justify-content:center;align-items:flex-start;padding:5vh 18px;overflow:auto}.dialog{background:white;border:1px solid #d4e0ea;border-radius:16px;padding:26px;box-shadow:0 16px 60px #15364a33;width:min(100%,760px);max-height:90vh;overflow:auto}.confirm{width:min(100%,540px)}.dialog-actions,.report-actions{display:flex;gap:10px;justify-content:flex-end;margin:20px 0;flex-wrap:wrap}.report>header{display:flex;justify-content:space-between;gap:20px;align-items:center}.report-actions{justify-content:flex-start}.metrics{display:flex;gap:12px;flex-wrap:wrap}.metrics>div{padding:12px;background:#f3f7fb;border-radius:8px;flex:1;min-width:100px}.metrics dt{font-size:12px;color:#60788d}.metrics dd{font-size:23px;font-weight:700;margin:0}.sample{border-top:1px solid #dbe4ed;margin-top:20px;padding-top:8px}.sample h3 span{font-weight:400;font-size:13px;margin-left:8px;color:#60788d}.report-note{border:1px solid #dbe4ed;border-radius:7px;padding:9px 13px;margin:10px 0}.ncr pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;font-size:12px}.note-text{font:inherit;background:#f7fafc;padding:12px}.ncr small{color:#60788d}@media(max-width:700px){.ncr{padding:18px 12px 60px}.ncr-controls,.ncr-intro{grid-template-columns:1fr}.ncr-intro{gap:12px}.ncr-heading img{width:230px}.ncr h1{font-size:25px}.panel{padding:17px}.overlay{padding:12px}.dialog{max-height:calc(100dvh - 24px);padding:18px}.run-row{align-items:flex-start}.status{max-width:105px}.fields{gap:10px}.report-actions button{flex:1}}
</style>
<style>
@media print{body.narriva-report-print *{visibility:hidden!important}body.narriva-report-print .ncr .report,body.narriva-report-print .ncr .report *{visibility:visible!important}body.narriva-report-print .ncr .overlay{position:absolute;inset:0;padding:0;overflow:visible;background:white}body.narriva-report-print .ncr .report{max-height:none;overflow:visible;width:100%;border:0;box-shadow:none;padding:12px}body.narriva-report-print .report button,body.narriva-report-print .report-actions{display:none!important}body.narriva-report-print .report details> *{display:block!important}body.narriva-report-print .sample{break-inside:avoid}}
</style>
