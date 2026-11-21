<template>
  <section class="session-learning">
    <p v-if="loading" role="status">Loading the learning plan…</p>
    <p v-if="error" class="error" role="alert">{{ error }} <button type="button" :disabled="saving" @click="load">Reload</button></p>
    <template v-if="!loading && !error">
      <label v-if="tracks.length > 1" class="subject">Subject<select v-model="subjectId" :disabled="saving || !!existing?.student_subject_id"><option v-for="track in tracks" :key="track.subject.id" :value="Number(track.subject.id)">{{ track.subject.subject_label }}</option></select></label>
      <label v-if="bundle && !planChanged && existing?.status!=='signed'"><input type="checkbox" v-model="generalObservation"> Record a session observation for a different skill</label><p v-if="existing?.status==='signed'" role="status">This session record is signed and read-only.</p><LearningPlanSessionChecklist v-else-if="bundle && !planChanged && !generalObservation" :key="`${clientId}-${sessionId}-${subjectId}-${bundle.plan.id}`" :bundle="bundle" :brief="scopedBrief" :initial-checklist="existing?.metadata_json?.planChecklist || null" :previous-note="existing" :saving="saving" :status="status" @dirty="status = ''" @save="saveChecklist" />
      <p v-else-if="planChanged" role="alert">This saved session uses an earlier learning plan. Its note is preserved below. Review that plan before changing historical results.</p>
      <template v-else><p v-if="generalObservation">Record the skill you practiced. This observation is saved separately from ratings of the approved learning plan.</p><p v-else-if="draftTitle">“{{ draftTitle }}” is awaiting tutor approval. You can save observations for this session here.</p><p v-else>No approved learning plan is available for this subject. A private general session note can be saved here; it will not rate learning-plan progress.</p><label class="general">Session observation<textarea v-model="generalNote" rows="3" maxlength="20000" :disabled="saving" /></label><button :disabled="saving || !sessionId" @click="saveGeneral">Save session observation</button><p role="status">{{ status }}</p></template>
      <button v-if="existing?.id" type="button" :disabled="downloading || saving" @click="downloadPdf">{{ downloading ? 'Preparing PDF…' : 'Download saved record PDF' }}</button>
      <p v-if="planChanged && status" role="status">{{ status }}</p>
      <details v-if="planChanged && existing?.summary"><summary>Saved session note</summary><p>{{ existing.summary }}</p></details>
    </template>
  </section>
</template>
<script setup>
import { confirmRecordDownload, RECORD_DOWNLOAD_NOTICE_VERSION } from '../../utils/recordDownloadNotice';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import * as los from '../../services/tutoringLearningOs';
import LearningPlanSessionChecklist from './LearningPlanSessionChecklist.vue';
const props = defineProps({ clientId: { type: [Number, String], required: true }, agencyId: { type: [Number, String], default: null }, sessionId: { type: [Number, String], default: null }, sessionType: { type: String, default: 'virtual' }, initialSubjectId: { type: [Number, String], default: null }, request: { type: Function, default: null } });
const emit = defineEmits(['saved']);
const generalObservation = ref(false);
const sessionBrief = ref(null);
const tracks = ref([]), subjectId = ref(null), existing = ref(null), loading = ref(false), saving = ref(false), error = ref(''), status = ref(''), generalNote = ref(''), downloading = ref(false);
let generation = 0;
const bundle = computed(() => tracks.value.find(track => Number(track.subject.id) === Number(subjectId.value))?.bundle || null);
const draftTitle = computed(() => tracks.value.find(track => Number(track.subject.id) === Number(subjectId.value))?.draftTitle);
const scopedBrief = computed(() => Number(sessionBrief.value?.learning_plan_id) === Number(bundle.value?.plan.id) && Number(sessionBrief.value?.student_subject_id) === Number(subjectId.value) && Number(sessionBrief.value?.client_id) === Number(props.clientId) && (!props.agencyId || Number(sessionBrief.value?.agency_id) === Number(props.agencyId)) ? sessionBrief.value : null);
const planChanged = computed(() => !!existing.value?.metadata_json?.planChecklist && Number(existing.value.learning_plan_id) !== Number(bundle.value?.plan.id));
async function load() {
  const token = ++generation; generalObservation.value = false; loading.value = true; error.value = ''; status.value = ''; tracks.value = []; existing.value = null; saving.value=false; downloading.value=false; generalNote.value = ''; subjectId.value = null; sessionBrief.value = null;
  try {
    let context;
    if (props.request) context = await props.request('/learning-note-context');
    else {
      const [overview, saved, briefing] = await Promise.all([los.fetchLearningOverview(props.clientId, { agencyId: props.agencyId }), props.sessionId ? los.getSessionNote(props.sessionId) : Promise.resolve({ note: null }), props.sessionId ? los.getSessionBrief(props.sessionId) : Promise.resolve({ brief: null })]);
      const found = await Promise.all((overview.subjects || []).map(async row => {
        const { plans = [] } = await los.listSubjectPlans(row.subject.id);
        const active = plans.find(plan => plan.status === 'active' && plan.approved_at);
        return { subject: row.subject, draftTitle: plans.find(p => !p.approved_at && ['draft','pending_review','active'].includes(p.status))?.title, bundle: active ? await los.getLearningPlan(active.id) : null };
      }));
      context = { tracks: found, note: saved.note, brief: briefing.brief };
    }
    if (token !== generation) return;
    sessionBrief.value = context.brief || null; tracks.value = context.tracks || []; existing.value = context.note || null; generalNote.value = existing.value?.summary || '';
    generalObservation.value = !!existing.value?.summary && !existing.value?.metadata_json?.planChecklist;
    subjectId.value = Number(existing.value?.student_subject_id || props.initialSubjectId || tracks.value.find(track => track.bundle)?.subject.id || tracks.value[0]?.subject.id) || null;
  } catch (cause) { if (token === generation) error.value = cause.response?.data?.error?.message || cause.message; }
  finally { if (token === generation) loading.value = false; }
}
async function persist(payload) {
  if (saving.value || !props.sessionId || existing.value?.status==='signed') return;
  const token = generation; saving.value = true; status.value = ''; error.value = '';
  try {
    const body = { ...payload, sessionId: Number(props.sessionId), sessionType: props.sessionType, ...(existing.value?.id ? { id: existing.value.id } : {}) };
    const result = props.request ? await props.request('/note', 'put', body) : await los.saveSessionNote(body);
    if (token !== generation) return;
    existing.value = result.note; status.value = 'Session record saved.'; emit('saved', result);
  } catch (cause) { if (token === generation) status.value = cause.response?.data?.error?.message || 'The session record was not saved. Your selections are kept.'; }
  finally { if(token===generation)saving.value = false; }
}
function saveChecklist(value) { return persist({ ...value, documentationMode: 'learning_plan_checklist', studentSubjectId: Number(subjectId.value), learningPlanId: bundle.value.plan.id }); }
function saveGeneral() { return persist({ clientId: Number(props.clientId), agencyId: Number(props.agencyId) || undefined, summary: generalNote.value }); }
async function downloadPdf() {
  if (downloading.value || !confirmRecordDownload()) return; const token = generation; downloading.value = true;
  try {
    const data = props.request ? await props.request('/note/pdf', 'get', undefined, { responseType: 'blob', headers: { 'X-Record-Download-Notice': RECORD_DOWNLOAD_NOTICE_VERSION } }) : await los.downloadSessionNotePdf(props.sessionId);
    if (token !== generation) return;
    const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url; link.download = `tutoring-session-${Number(props.sessionId)}.pdf`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (cause) { if (token === generation) status.value = cause.response?.data?.error?.message || 'The saved record PDF could not be downloaded.'; }
  finally { if(token===generation)downloading.value = false; }
}
watch(() => [props.clientId, props.agencyId, props.sessionId], load, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>
<style scoped>
.session-learning{color:var(--text-primary,#243454);font:14px/1.5 system-ui}.error{color:#a12035}.subject,.general{display:grid;gap:5px;font-weight:600;margin:8px 0 14px}.subject select,.general textarea{font:inherit;padding:9px;border:1px solid #ced8e3;border-radius:7px;max-width:100%;color:inherit;background:var(--bg-card,#fff)}button{padding:9px 15px;border:1px solid #c6d5e3;border-radius:7px;cursor:pointer;background:var(--bg-card,#fff);color:inherit}.general textarea{width:100%;box-sizing:border-box}details p{white-space:pre-line}
</style>
