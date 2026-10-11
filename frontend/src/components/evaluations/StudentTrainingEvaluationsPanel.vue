<template>
  <section v-if="available" class="training-workspace" aria-label="Student training evaluations">
    <header class="training-workspace-header"><div><h3>Student training evaluations</h3><p>Quarterly supervisor reviews using the Appendix G rubric.</p></div><button type="button" :disabled="busy || loading" @click="refresh">Refresh</button></header>
    <p v-if="loading" role="status">Loading evaluations…</p>
    <p v-if="error" class="training-error" role="alert">{{ error }}</p>
    <form v-if="eligibleStudents.length" class="training-create" @submit.prevent="create">
      <label>Intern / trainee<select v-model="student" :disabled="busy"><option value="">Choose an intern</option><option v-for="person in eligibleStudents" :key="person.id" :value="person.id">{{ person.name }}</option></select></label>
      <label>Year<input v-model.number="year" type="number" min="2020" max="2100" :disabled="busy" required /></label>
      <label>Quarter<select v-model.number="quarter" :disabled="busy"><option v-for="q in 4" :key="q" :value="q">Q{{ q }}</option></select></label>
      <button type="submit" :disabled="busy || !student">Start evaluation</button>
    </form>
    <p v-if="canManage && !eligibleStudents.length && !loading" class="training-help">No eligible interns are listed. Set the employee’s employment classification to Intern in their profile. Supervisors also need a clinical supervisor assignment.</p>
    <div v-if="visibleEvaluations.length" class="training-records"><button v-for="item in visibleEvaluations" :key="item.id" type="button" :class="{ selected: record?.id === item.id }" :disabled="busy" @click="open(item.id)"><span><strong>{{ item.studentName }}</strong><small>Q{{ item.quarter }} {{ item.year }} · {{ item.evaluatorName }}</small></span><span>{{ item.status === 'submitted' ? 'Submitted' : 'Draft' }}<small v-if="item.status === 'submitted'">{{ item.total }} / 100 · {{ item.outcome }}</small></span></button></div>
    <p v-else-if="!loading && !error" class="training-help">No evaluations to display. Assigned clinical supervisors and People Operations complete these reviews. Interns can view their own submitted evaluations here.</p>
    <template v-if="record">
      <p class="training-record-status">{{ record.status === 'submitted' ? 'Submitted · Read-only record' : 'Draft · Not yet visible to the intern' }}<span v-if="dirty"> · Unsaved changes</span><span v-else-if="saved"> · {{ saved }}</span></p>
      <StudentTrainingEvaluationForm v-model="draft" :template="record.template" :context="record" :disabled="!record.canEdit || busy" />
      <div v-if="record.canEdit" class="training-save"><p>Save a draft to continue later. Submitting makes the evaluation available to the intern and locks the record.</p><label><input v-model="confirmed" type="checkbox" :disabled="busy" /> I have reviewed all scores and notes.</label><div><button type="button" :disabled="busy || !dirty" @click="save(false)">Save draft</button><button type="button" :disabled="busy || !complete || !confirmed" @click="save(true)">{{ busy ? 'Saving…' : 'Submit evaluation' }}</button></div></div>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import StudentTrainingEvaluationForm from './StudentTrainingEvaluationForm.vue';
const props = defineProps({ agencyId: { type: [Number, String], required: true }, studentId: { type: [Number, String], default: null } });
const available = ref(true), loading = ref(false), busy = ref(false), error = ref(''), saved = ref('');
const students = ref([]), evaluations = ref([]), canManage = ref(false), record = ref(null), draft = ref({}), baseline = ref(''), confirmed = ref(false);
const student = ref(''), year = ref(new Date().getFullYear()), quarter = ref(Math.floor(new Date().getMonth() / 3) + 1);
let epoch = 0;
const endpoint = '/evaluations/student-training';
const eligibleStudents = computed(() => students.value.filter(s => !props.studentId || Number(s.id) === Number(props.studentId)));
const visibleEvaluations = computed(() => evaluations.value.filter(e => !props.studentId || Number(e.studentUserId) === Number(props.studentId)));
const dirty = computed(() => !!record.value?.canEdit && JSON.stringify(draft.value) !== baseline.value);
const complete = computed(() => record.value?.template.sections.every(s => Number.isInteger(draft.value.scores?.[s.key]) && draft.value.scores[s.key] >= 0 && draft.value.scores[s.key] <= s.maxPoints));
const leave = () => !dirty.value || window.confirm('Discard unsaved evaluation changes? Save a draft first if you want to keep them.');
const failure = e => e?.response?.data?.error?.message || 'Evaluations are temporarily unavailable. Please try again.';
function useRecord(value) { record.value = value; draft.value = JSON.parse(JSON.stringify(value.response)); baseline.value = JSON.stringify(draft.value); confirmed.value = false; }
async function load() {
  const current = ++epoch;
  loading.value = true; available.value = true; error.value = ''; record.value = null; students.value = []; evaluations.value = []; canManage.value = false; student.value = ''; saved.value = ''; busy.value = false;
  if (!Number(props.agencyId)) { loading.value = false; available.value = false; return; }
  try {
    const { data } = await api.get(endpoint, { params: { agencyId: props.agencyId } });
    if (current !== epoch) return;
    students.value = data.students || []; evaluations.value = data.evaluations || []; canManage.value = data.canManage === true;
    if (eligibleStudents.value.length === 1) student.value = eligibleStudents.value[0].id;
  } catch (e) { if (current === epoch) { if (e?.response?.status === 404) available.value = false; else error.value = failure(e); } }
  finally { if (current === epoch) loading.value = false; }
}
async function refresh() { if (leave()) await load(); }
async function open(id) {
  if (busy.value || !leave()) return;
  const current = epoch; busy.value = true; error.value = ''; saved.value = '';
  try { const { data } = await api.get(`${endpoint}/${id}`, { params: { agencyId: props.agencyId } }); if (current === epoch) useRecord(data); }
  catch (e) { if (current === epoch) error.value = failure(e); }
  finally { if (current === epoch) busy.value = false; }
}
async function create() {
  if (busy.value || !student.value || !leave()) return;
  const current = epoch; busy.value = true; error.value = ''; saved.value = '';
  try {
    const { data } = await api.post(endpoint, { agencyId: Number(props.agencyId), studentUserId: Number(student.value), year: year.value, quarter: quarter.value });
    if (current !== epoch) return;
    useRecord(data); evaluations.value.unshift(data);
  } catch (e) { if (current === epoch) error.value = failure(e); }
  finally { if (current === epoch) busy.value = false; }
}
async function save(submit) {
  if (busy.value || !record.value?.canEdit || (submit && (!complete.value || !confirmed.value))) return;
  const current = epoch; busy.value = true; error.value = ''; saved.value = '';
  try {
    const payload = { agencyId: Number(props.agencyId), revision: record.value.revision, response: draft.value };
    const { data } = submit ? await api.post(`${endpoint}/${record.value.id}/submit`, payload) : await api.put(`${endpoint}/${record.value.id}`, payload);
    if (current !== epoch) return;
    useRecord(data); saved.value = submit ? 'Evaluation submitted' : 'Draft saved';
    evaluations.value = evaluations.value.map(e => e.id === data.id ? data : e);
  } catch (e) { if (current === epoch) error.value = failure(e); }
  finally { if (current === epoch) busy.value = false; }
}
function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = ''; } }
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => { epoch++; window.removeEventListener('beforeunload', beforeUnload); });
watch(() => [props.agencyId, props.studentId], load, { immediate: true });
watch(draft, () => { confirmed.value = false; }, { deep: true });
</script>

<style scoped>
.training-workspace{margin:24px 0;padding:24px;border:1px solid #d2ddc8;border-radius:12px;background:#fffef9;color:#2a4937;font-size:14px;line-height:1.65}.training-workspace-header{display:flex;justify-content:space-between;align-items:start;gap:15px}.training-workspace h3{font:27px Georgia,serif;margin:0;color:#18543f}.training-workspace-header p,.training-help{font-size:12px;color:#69785f}.training-workspace button{cursor:pointer;padding:10px 15px;border:1px solid #b5c7a7;border-radius:6px;background:#f3f7ed;color:#18543f;font:inherit;font-size:12px}.training-workspace button:disabled{opacity:.5;cursor:default}.training-create{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:22px 0}.training-create label{display:grid;gap:5px;font-size:12px;max-width:100%}.training-create input,.training-create select{padding:10px;border:1px solid #b5c7a7;border-radius:6px;background:white;color:#284737;max-width:100%;font:inherit}.training-create input{width:100px}.training-records{display:grid;gap:8px;margin:20px 0}.training-records button{display:flex;justify-content:space-between;gap:12px;text-align:left;background:white}.training-records small{display:block;font-size:11px}.training-records .selected{border-color:#18543f;background:#edf3e6}.training-record-status{font-size:12px;color:#617552}.training-save{margin-top:20px;padding:20px;background:#edf3e6;border-radius:8px;font-size:12px}.training-save label{display:flex;gap:8px;align-items:center}.training-save>div{display:flex;gap:10px;margin-top:17px;flex-wrap:wrap}.training-save button:last-child,.training-create button{background:#18543f;color:white;border-color:#18543f}.training-error{color:#883e2d;padding:12px;border:1px solid #e4c4b7;border-radius:6px}.training-workspace :focus-visible{outline:2px solid #18543f;outline-offset:3px}@media(max-width:600px){.training-workspace{padding:15px}.training-workspace h3{font-size:22px}.training-records button{flex-direction:column}.training-create label:first-child{width:100%}}
</style>
