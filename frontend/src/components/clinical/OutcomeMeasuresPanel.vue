<template>
  <section class="outcomes" aria-label="Clinical outcome measures">
    <header class="outcomes-hero">
      <div><p class="eyebrow">Clinical practice · Measure library</p><h2>Understand change.<br><em>Support better conversations.</em></h2><p>Established instruments and clearly labeled original pilots, with a record of change over time.</p></div>
      <div class="catalog-count"><strong>{{ catalog.availableCount || '—' }}</strong><span>available measures<br>English editions</span></div>
    </header>
    <p class="context-note">{{ clientId ? 'Record responses with the client, then review the result and next steps.' : 'Explore blank instruments. Record responses from a client’s Assessments & Evaluations tab.' }} Check each instrument’s population. The treating clinician confirms the respondent, age, consent, training and fit. Scores support assessment and do not establish a diagnosis.</p>
    <p v-if="loading" role="status">Loading measures…</p>
    <p v-if="error" class="error" role="alert">{{ error }} <button v-if="!selected" type="button" @click="load">Retry</button></p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <template v-if="catalog.measures.length">
      <div class="catalog-heading"><h3>{{ clientId ? 'Choose a measure' : 'Browse the instruments' }}</h3><input v-model="search" type="search" aria-label="Search outcome measures" placeholder="Search name or clinical area" /></div>
      <ClinicalScreenerLink :search="search" :client-id="clientId" />
      <div class="measure-cards">
        <button v-for="measure in filtered" :key="measure.id" type="button" :disabled="saving || (clientId && !clientAuthorized)" :aria-pressed="selected?.id === measure.id" @click="select(measure)">
          <span class="eyebrow">{{ measure.domain }}{{ measure.kind === 'original_pilot' ? ' · Not validated' : '' }}</span><strong>{{ measure.title }}</strong><span>{{ measure.summary }}</span><small>{{ measure.timeframe }} · {{ measure.scoreRange }}</small><b>{{ clientId ? 'Record responses' : 'View blank instrument' }} ↗</b>
        </button>
      </div>
      <p v-if="!filtered.length && !matchesSuicideScreener(search)">No measures match this search.</p>
    </template>
    <section v-if="selected" ref="formElement" class="administration" tabindex="-1" :aria-label="selected.title">
      <div class="section-heading"><div><p class="eyebrow">{{ clientId ? 'New administration' : 'Instrument preview' }}</p><h3>{{ selected.title }}</h3></div><button type="button" :disabled="saving" @click="close">Close</button></div>
      <OutcomeMeasureForm :key="selected.id" v-model="answers" :measure="selected" :preview="!clientId" :disabled="saving" />
      <form v-if="clientId" class="record-controls" @submit.prevent="save">
        <label>Administration method<select v-model="administration" :disabled="saving"><option v-for="option in administrationOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
        <fieldset v-if="selected.kind === 'original_pilot'" class="pilot-context">
          <legend>NLU pilot context</legend>
          <label>Age at observation (8–17)<input v-model.number="pilotContext.age" type="number" min="8" max="17" step="1" required :disabled="saving" /></label>
          <label>Observation date<input v-model="pilotContext.observedOn" type="date" required :disabled="saving" /></label>
          <label v-if="selected.respondent === 'caregiver'">Caregiver identifier<select v-model="pilotContext.respondentSeries" required :disabled="saving"><option value="">Choose a caregiver</option><option v-for="n in 3" :key="n" :value="`caregiver_${n}`">Caregiver {{ n }}</option></select><small>Use the same identifier for the same person across visits; do not combine different caregivers.</small></label>
          <label class="confirmation"><input v-model="pilotContext.programConfirmed" type="checkbox" required :disabled="saving" />This is an NLU Therapy Plus Tutoring pilot administration. The respondent understands this is not a validated test.</label>
        </fieldset>
        <label class="confirmation"><input v-model="confirmed" type="checkbox" :disabled="saving" />I confirmed the respondent, age/version, consent, my training and this measure’s fit.</label>
        <p>{{ progress.answered }} of {{ progress.required }} required responses entered. Unanswered items remain missing; partial results are labeled.</p>
        <p>Saving adds a dated clinical record. Review responses before saving; saved responses cannot be overwritten.</p>
        <button class="primary" type="submit" :disabled="saving || !confirmed || !hasAnswers">{{ saving ? 'Saving…' : 'Save to client record' }}</button>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </form>
    </section>
    <NluLearningProgress v-if="clientId" :responses="responses" />
    <section v-if="clientId" class="history" aria-label="Measure history">
      <div class="section-heading"><div><p class="eyebrow">Client record</p><h3>Results &amp; clinical review</h3></div><button type="button" :disabled="saving || loading" @click="refreshHistory">Refresh results</button></div>
      <p v-if="historyError" class="error" role="alert">{{ historyError }}</p>
      <p v-if="!responses.length && !loading && !historyError">No measures recorded yet.</p>
      <p v-if="responses.length === 500">Showing the 500 most recent administrations.</p>
      <article v-for="response in responses" :key="response.id" class="result-card">
        <div class="result-heading"><div><h4>{{ response.questionnaire.title }}</h4><p>{{ when(response.recordedAt) }} · {{ administrationLabel(response.administration) }}</p></div><span :class="['review-status', { pending: !response.reviewedAt }]">{{ response.reviewedAt ? 'Reviewed' : 'Needs clinical review' }}</span></div>
        <p v-if="response.pilotContext" class="context-note">Observed {{ response.pilotContext.observedOn }} · {{ response.pilotContext.respondentSeries }} · Age {{ response.pilotContext.age }} · Original pilot, not validated</p>
        <div v-for="flag in response.result.flags" :key="flag.key" :class="['result-flag', { urgent: flag.urgent }]" :role="flag.urgent ? 'alert' : undefined">{{ flag.text }}</div>
        <div class="result-score"><strong>{{ response.result.total == null ? 'No total score' : response.result.total }}</strong><span v-if="response.result.average != null">Average {{ response.result.average.toFixed(2) }} / 4</span><span>{{ response.result.prorated ? 'Prorated · partial responses' : response.result.complete ? 'Complete responses' : 'Incomplete responses' }}</span></div>
        <p>{{ response.result.interpretation }}</p>
        <dl v-if="Object.keys(response.result.domains).length" class="domain-scores"><div v-for="(value, domain) in response.result.domains" :key="domain"><dt>{{ domainLabel(domain) }}</dt><dd>{{ value == null ? 'Not scored' : value }}<small v-if="response.result.domainDetails?.[domain]"> · {{ response.result.domainDetails[domain].answered }}/{{ response.result.domainDetails[domain].expected }} observed · {{ response.result.domainDetails[domain].direction }} is favorable</small></dd></div></dl>
        <p v-if="changeFromPrevious(response)" class="change-note">{{ changeFromPrevious(response) }}</p>
        <details><summary>Responses &amp; instrument version</summary><p>{{ response.questionnaire.instrumentVersion }} · {{ response.version }}</p><ol class="saved-answers"><li v-for="item in answeredItems(response)" :key="item.key"><strong>{{ item.label }}</strong><span>{{ outcomeResponseLabel(item, response.answers[item.key]) }}</span></li></ol></details>
        <div v-if="response.reviewedAt" class="review-note"><strong>Clinical review · {{ when(response.reviewedAt) }}</strong><p>{{ response.review.note }}</p><p v-if="response.review.safetyFollowUpConfirmed">Direct safety follow-up documented.</p></div>
        <details v-else class="review-form"><summary>Record clinical review</summary><form @submit.prevent="review(response)"><label>Clinical interpretation and next steps<textarea v-model="reviewNotes[response.id]" rows="3" maxlength="4000" required :disabled="saving" /></label><label v-if="response.result.flags.some(f => f.urgent)" class="confirmation"><input v-model="safetyConfirmed[response.id]" type="checkbox" required :disabled="saving" />I completed direct safety follow-up and documented the actions taken above.</label><button class="primary" :disabled="saving || !reviewNotes[response.id]?.trim()" type="submit">Save clinical review</button></form></details>
      </article>
    </section>
    <details v-if="catalog.rights.length" class="rights-register"><summary>Appendix A · Availability &amp; reuse sources <span>{{ catalog.reviewedCount }} references reviewed</span></summary><p>The sources below describe reuse terms for each instrument. Other entries need permission or clarification of the exact version or commercial digital use. Free clinical access alone does not settle that question. Checked {{ catalog.checkedAt }}.</p><div v-for="entry in catalog.rights" :key="entry.id" class="rights-entry"><div><strong>{{ entry.name }}</strong><span>{{ statusLabel(entry.status) }}</span></div><p>{{ entry.reason }}</p><a :href="entry.rightsUrl" target="_blank" rel="noopener noreferrer">Reuse / source reference ↗</a></div></details>
  </section>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import {matchesSuicideScreener} from '../../utils/clinicalScreeners';
import ClinicalScreenerLink from './ClinicalScreenerLink.vue';
import NluLearningProgress from './NluLearningProgress.vue';
import OutcomeMeasureForm from './OutcomeMeasureForm.vue';
import { outcomeItemVisible, outcomeResponseLabel } from '../../utils/outcomeMeasureFields.js';
const props = defineProps({ clientId: { type: [Number, String], default: null }, initialMeasure: { type: String, default: '' }, agencyId: { type: [Number, String], default: null } });
const emit = defineEmits(['dirty']);
const catalog = ref({ measures: [], rights: [] }), responses = ref([]), loading = ref(false), saving = ref(false), error = ref(''), historyError = ref(''), notice = ref('');
const clientAuthorized = ref(false);
const search = ref(''), selected = ref(null), answers = ref({}), confirmed = ref(false), administration = ref('self'), formElement = ref(null);
const pilotContext = ref({ age: null, observedOn: '', respondentSeries: '', programConfirmed: false });
const administrationOptions = computed(() => selected.value?.respondent === 'caregiver' ? [{ value: 'caregiver', label: 'Caregiver report' }, { value: 'caregiver_assisted', label: 'Caregiver report with staff assistance' }] : selected.value?.respondent === 'observer' ? [{ value: 'observer', label: 'Direct observation by recording staff member' }] : [{ value: 'self', label: 'Client self-report, recorded with clinician present' }, { value: 'clinician_assisted', label: 'Clinician-assisted self-report' }]);
const administrationLabel = value => ({ self: 'Self-report', clinician_assisted: 'Clinician-assisted', caregiver: 'Caregiver report', caregiver_assisted: 'Caregiver with staff assistance', observer: 'Staff observation' }[value] || value);
const reviewNotes = ref({}), safetyConfirmed = ref({});
let sequence = 0, historySequence = 0, requestId = '';
const filtered = computed(() => catalog.value.measures.filter(m => `${m.title} ${m.summary} ${m.domain}`.toLowerCase().includes(search.value.trim().toLowerCase())));
const hasAnswers = computed(() => Object.values(answers.value).some(v => Array.isArray(v) ? v.length : String(v ?? '').trim().length));
const hasPilotContext = computed(() => selected.value?.kind === 'original_pilot' && (pilotContext.value.age != null || pilotContext.value.observedOn || pilotContext.value.respondentSeries || pilotContext.value.programConfirmed));
const dirty = computed(() => !!props.clientId && (hasAnswers.value || hasPilotContext.value || Object.values(reviewNotes.value).some(n => n?.trim())));
watch(dirty, value => emit('dirty', value));
const progress = computed(() => { const items = (selected.value?.items || []).filter(i => !i.optional && outcomeItemVisible(i, answers.value)); return { required: items.length, answered: items.filter(i => { const v = answers.value[i.key]; return Array.isArray(v) ? v.length : v != null && String(v).trim() !== ''; }).length }; });
const message = e => e.response?.data?.error?.message || 'The request could not be completed. Your unsaved responses remain here; try again.';
const when = date => new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const statusLabel = status => ({ clinical_form:'Available in Clinical forms', enabled: 'Available in the app', permission_required: 'Permission required', rights_review: 'Digital reuse needs clarification', version_review: 'Exact version needs clarification' }[status]);
const domainLabel = key => ({ adhd: 'Prescription ADHD medication', opioids: 'Prescription opioids', sedatives: 'Anxiety / sleep medication', other: 'Other drugs · follow-up flag' }[key] || key.charAt(0).toUpperCase() + key.slice(1));
function canLeave() { return !saving.value && (!dirty.value || window.confirm('Leave without saving these measure responses or review notes?')); }
defineExpose({ canLeave });
function reset() { selected.value = null; answers.value = {}; confirmed.value = false; administration.value = 'self'; pilotContext.value = { age: null, observedOn: '', respondentSeries: '', programConfirmed: false }; requestId = ''; }
async function select(measure) { if ((props.clientId && !clientAuthorized.value) || saving.value || ((hasAnswers.value || hasPilotContext.value) && !window.confirm('Discard these unsaved responses and open another measure?'))) return; reset(); selected.value = measure; administration.value = administrationOptions.value[0].value; requestId = crypto.randomUUID(); error.value = ''; notice.value = ''; await nextTick(); formElement.value?.focus({ preventScroll: true }); formElement.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }
function close() { if ((hasAnswers.value || hasPilotContext.value) && !window.confirm('Discard these unsaved responses?')) return; reset(); error.value = ''; }
async function load() {
  const current = ++sequence; loading.value = true; error.value = ''; notice.value = ''; historyError.value = ''; catalog.value = { measures: [], rights: [] }; responses.value = []; clientAuthorized.value = false; reset(); reviewNotes.value = {}; safetyConfirmed.value = {};
  try { const { data } = await api.get('/outcome-measures/catalog', { params: props.clientId ? { clientId: props.clientId } : props.agencyId ? { agencyId: props.agencyId } : {} }); if (current !== sequence) return; catalog.value = data;
    if (props.clientId) await refreshHistory();
    if (props.initialMeasure && (!props.clientId || clientAuthorized.value)) { const m = data.measures.find(m => m.id === props.initialMeasure); if (m) await select(m); else error.value = 'This measure is not currently enabled.'; }
  } catch (e) { if (current === sequence) error.value = message(e); }
  finally { if (current === sequence) loading.value = false; }
}
async function refreshHistory() { if (!props.clientId) return; const clientId = props.clientId, current = ++historySequence; historyError.value = ''; try { const { data } = await api.get(`/outcome-measures/clients/${clientId}`); if (current === historySequence && clientId === props.clientId) { responses.value = data.responses; clientAuthorized.value = true; } } catch (e) { if (current === historySequence && clientId === props.clientId) { historyError.value = message(e); if ([401,403,404].includes(e.response?.status)) { clientAuthorized.value = false; responses.value = []; reset(); reviewNotes.value = {}; safetyConfirmed.value = {}; } } } }
async function save() {
  if (!props.clientId || !selected.value || !confirmed.value || saving.value) return;
  const current = sequence, clientId = props.clientId; saving.value = true; error.value = '';
  try { const { data } = await api.post(`/outcome-measures/clients/${clientId}`, { measureId: selected.value.id, version: selected.value.version, requestId, answers: answers.value, clinicalFitConfirmed: true, administration: administration.value, ...(selected.value.kind === 'original_pilot' ? { pilotContext: pilotContext.value } : {}) });
    if (current !== sequence) return; historySequence++; reset(); responses.value = [data.response, ...responses.value.filter(r => r.id !== data.response.id)].slice(0,500); notice.value = 'Responses saved. Review the result and record your clinical next steps below.';
  } catch (e) { if (current === sequence) error.value = message(e); }
  finally { if (current === sequence) saving.value = false; }
}
async function review(response) {
  const current = sequence; if (saving.value) return; saving.value = true; error.value = '';
  try { await api.post(`/outcome-measures/clients/${props.clientId}/${response.id}/review`, { note: reviewNotes.value[response.id], safetyFollowUpConfirmed: safetyConfirmed.value[response.id] === true }); if (current !== sequence) return; delete reviewNotes.value[response.id]; delete safetyConfirmed.value[response.id]; notice.value = 'Clinical review saved.'; await refreshHistory(); }
  catch (e) { if (current === sequence) error.value = message(e); }
  finally { if (current === sequence) saving.value = false; }
}
function answeredItems(response) { return response.questionnaire.items.filter(i => outcomeItemVisible(i, response.answers)); }
function changeFromPrevious(response) {
  if (!response.result.complete || response.result.total == null || ['cage-aid','lec-5'].includes(response.measureId)) return '';
  const index = responses.value.indexOf(response);
  const earlier = responses.value.slice(index + 1).find(r => r.measureId === response.measureId && r.version === response.version && r.administration === response.administration && r.result.complete && r.result.total != null);
  if (!earlier) return '';
  const difference = response.result.total - earlier.result.total;
  return `${difference > 0 ? '+' : ''}${difference} points from ${when(earlier.recordedAt)} (same instrument version and administration method). Interpret the change in clinical context.`;
}
function beforeUnload(event) { if (dirty.value || saving.value) { event.preventDefault(); event.returnValue = ''; } }
watch(() => [props.clientId, props.agencyId], () => { historySequence++; saving.value = false; load(); }, { immediate: true });
watch(() => props.initialMeasure, value => { const measure = catalog.value.measures.find(m => m.id === value); if (measure) select(measure); });
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => { sequence++; historySequence++; window.removeEventListener('beforeunload', beforeUnload); emit('dirty', false); });
</script>
<style scoped>
.outcomes{--ink:#234b3b;--line:#d8e3d9;font-family:var(--font-family,Montserrat,Arial,sans-serif);color:#263d34;background:#fafbf8;border:1px solid var(--line);border-radius:18px;padding:clamp(18px,3vw,36px);margin:24px 0;min-width:0;line-height:1.7}.outcomes-hero{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-bottom:24px;border-bottom:1px solid var(--line)}.eyebrow{font-size:10px!important;text-transform:uppercase;letter-spacing:.14em;color:#53725f;margin:0 0 12px}.outcomes h2{font-size:clamp(24px,3vw,36px);letter-spacing:-.035em;line-height:1.25;margin:0 0 14px;color:var(--ink)}.outcomes h2 em{font-style:normal;font-weight:400}.outcomes p{font-size:13px}.outcomes h3{font-size:19px;margin:0}.catalog-count{display:grid;text-align:center;flex-shrink:0;padding:18px 24px;border-radius:50% 50% 8px 8px;background:#e8efe0}.catalog-count strong{font-size:48px;font-weight:500;line-height:1.1}.catalog-count span{font-size:10px;margin-top:6px}.context-note{max-width:950px;color:#586a60;margin:20px 0 28px}.catalog-heading,.section-heading,.result-heading{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:20px 0}.outcomes input[type=search],.outcomes select,.outcomes textarea{box-sizing:border-box;border:1px solid #bfcfc3;border-radius:7px;padding:11px 12px;background:white;font:inherit;color:#263d34;max-width:100%}.outcomes input[type=search]{width:280px;font-size:12px}.measure-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px}.measure-cards button{display:flex;flex-direction:column;align-items:flex-start;gap:11px;padding:23px;background:white;border:1px solid var(--line);border-radius:10px;text-align:left;font:inherit;color:inherit;cursor:pointer}.measure-cards button:hover,.measure-cards button[aria-pressed=true]{border-color:#587d62;background:#f0f5eb}.measure-cards strong{font-size:16px;line-height:1.5}.measure-cards span:not(.eyebrow){font-size:12px}.measure-cards .eyebrow{margin:0}.measure-cards small{font-size:11px;color:#647467;margin-top:auto}.measure-cards b{font-size:11px;color:var(--ink);font-weight:600}.administration{margin-top:30px;padding:clamp(16px,3vw,30px);border:1px solid #aec5b2;border-radius:12px;background:white;scroll-margin:30px}.outcomes button:not(.measure-cards button){font:inherit;font-size:12px;border:1px solid #c6d3c8;border-radius:6px;padding:9px 14px;background:white;color:var(--ink);cursor:pointer}.outcomes button.primary{background:var(--ink);color:white;border-color:var(--ink)}.outcomes button:disabled{opacity:.55;cursor:default}.record-controls,.review-form form{display:grid;gap:14px;margin-top:20px}.record-controls label,.review-form label{display:grid;gap:8px;font-size:12px}.record-controls p{margin:0;color:#52645b;font-size:12px}.confirmation{display:flex!important;gap:10px;align-items:flex-start}.confirmation input{margin-top:5px;accent-color:var(--ink)}.record-controls button,.review-form button{justify-self:start}.history{border-top:1px solid var(--line);margin-top:35px;padding-top:8px}.result-card{border:1px solid var(--line);border-radius:10px;padding:22px;background:white;margin:18px 0}.result-heading{margin:0 0 14px;align-items:flex-start}.result-heading h4{font-size:16px;margin:0}.result-heading p{font-size:11px;color:#647166;margin:4px 0}.review-status{font-size:10px;padding:4px 8px;border-radius:5px;background:#e7f0e3}.review-status.pending{background:#f8eed9;color:#695019}.result-score{display:flex;align-items:center;gap:18px;flex-wrap:wrap}.result-score strong{font-size:28px;font-weight:500}.result-score span{font-size:11px;color:#576b5f}.result-flag{padding:14px;background:#f7f2df;border:1px solid #ddcc9a;border-radius:7px;font-size:12px;margin:12px 0}.result-flag.urgent{background:#fff0eb;color:#7c2f1e;border-color:#d19080}.domain-scores{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}.domain-scores div{display:flex;gap:12px;justify-content:space-between;background:#f0f4ee;padding:9px;font-size:11px}.domain-scores dd{margin:0;font-weight:700}.outcomes summary{cursor:pointer;font-size:12px;font-weight:600;padding:10px 0}.saved-answers{font-size:12px;padding-left:20px}.saved-answers li{margin:14px 0}.saved-answers span{display:block;color:#5c6c62;white-space:pre-wrap;overflow-wrap:anywhere}.outcomes textarea{width:100%;resize:vertical}.review-note{padding:14px;background:#f0f5ed;margin-top:12px;font-size:11px}.review-note p{white-space:pre-wrap;overflow-wrap:anywhere}.change-note{background:#f3f5ed;padding:12px;border-left:2px solid #759166}.rights-register{margin-top:28px;border-top:1px solid var(--line);padding-top:15px}.rights-register summary span{display:inline-block;font-size:10px;font-weight:400;margin-left:14px}.rights-entry{padding:16px 0;border-top:1px solid var(--line)}.rights-entry>div{display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;font-size:12px}.rights-entry span{font-size:10px;color:#58705f}.rights-entry p{font-size:12px;margin:5px 0}.rights-entry a{font-size:11px;color:var(--ink)}.error{padding:12px;background:#fff0eb;color:#853c28}.notice{padding:12px;background:#e5f1e1;color:#245734}:focus-visible{outline:2px solid #416e52;outline-offset:3px}@media(max-width:560px){.outcomes-hero{display:block}.catalog-count{display:flex;align-items:center;gap:14px;width:fit-content;margin-top:18px;border-radius:8px;text-align:left}.catalog-count{padding:12px}.catalog-count strong{font-size:32px}.outcomes h2{font-size:23px}.catalog-count span{font-size:9px}.result-card{padding:15px}.catalog-heading input{width:100%}}@media print{.outcomes{display:none!important}}
</style>
