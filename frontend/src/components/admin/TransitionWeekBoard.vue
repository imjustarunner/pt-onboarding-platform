<template>
  <section class="transition-board" aria-labelledby="transition-week-title">
    <h2 id="transition-week-title">{{ board?.practice?.name || practiceName }} · readiness checklist</h2>
    <p>{{ board?.practice?.focus || 'Review records, families, Google, texting, training, security and billing readiness.' }} Week of November 16–20 · Mountain Time.</p>
    <p>Assign an owner and backup to every item. Keep client names and clinical details in their charts; use protected record references here. Passing a checklist records evidence; it does not send messages, remove accounts or cancel subscriptions.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <div class="board-toolbar"><button type="button" :disabled="busy || dirty" @click="load">Refresh evidence</button><button type="button" :disabled="busy || !dirty" @click="save">Save evidence</button><span v-if="dirty">Unsaved changes</span><span v-else-if="board">Saved revision {{ board.revision }}</span></div>
    <template v-if="board">
      <p><strong>{{ passedCount }}/{{ board.catalog.length }} checklist items passed</strong> · {{ publishedVideos }}/{{ videoDefinitions.length }} training videos published. Unknown and unfinished items remain visible.</p>
      <p v-if="agencyId === 2"><a href="#itsco-cohorts">Go to ITSCO groups of five</a> · {{ board.state.ranking ? `${cohortNumbers.length} named groups frozen` : 'Named groups pending verified session counts — not populated yet' }}</p>
      <div class="metric-grid">
        <fieldset v-for="(metric, key) in board.state.metrics" :key="key" :disabled="busy">
          <legend>{{ metricLabels[key] }}</legend>
          <label>Total <input :value="metric.total" type="number" min="0" placeholder="Unknown" @input="setCount(metric, 'total', $event)" /></label>
          <label>Completed <input :value="metric.completed" type="number" min="0" @input="setCount(metric, 'completed', $event)" /></label>
          <label>Blocked <input :value="metric.blocked" type="number" min="0" @input="setCount(metric, 'blocked', $event)" /></label>
        </fieldset>
      </div>
      <label>Show workstream <select v-model="category"><option value="">All workstreams</option><option v-for="value in categories" :key="value">{{ value }}</option></select></label>
      <details class="video-section" :open="category === 'Training videos'">
        <summary>Training videos · {{ publishedVideos }}/{{ videoDefinitions.length }} ready</summary>
        <p>Assign a creator and due date, then track recording, editing, review and publication. Reuse an approved recording across practices where the workflow matches. Reading the guide or recording a video alone does not mark staff training complete.</p>
        <article v-for="video in videoDefinitions" :key="video.id" class="transition-video">
          <h3>{{ video.title }} <small>Suggested {{ video.minutes }} minutes · {{ video.role }}</small></h3><p>{{ video.outcome }}</p>
          <fieldset :disabled="busy" @input="dirty = true" @change="dirty = true">
            <label>Creator / owner <input v-model="board.state.videos[video.id].owner" maxlength="120" /></label>
            <label>Due date <input v-model="board.state.videos[video.id].dueDate" type="date" /></label>
            <label>Production status <select v-model="board.state.videos[video.id].status"><option v-for="status in videoStatuses" :key="status" :value="status">{{ status.replaceAll('_', ' ') }}</option></select></label>
            <label>Independent reviewer <input v-model="board.state.videos[video.id].reviewer" maxlength="120" /></label>
            <label class="wide">Watch link / authenticated learning page <input v-model="board.state.videos[video.id].url" maxlength="2000" placeholder="https://… or /my-learning/…" /></label>
            <label class="wide">Review evidence <textarea v-model="board.state.videos[video.id].evidence" maxlength="1500" rows="2" /></label>
            <label class="wide">Next action / blocker <textarea v-model="board.state.videos[video.id].nextAction" maxlength="800" rows="2" /></label>
          </fieldset>
          <p v-if="board.state.videos[video.id].completedAt">Published {{ new Date(board.state.videos[video.id].completedAt).toLocaleString() }}</p>
          <a v-if="board.state.videos[video.id].status === 'published' && safeVideoUrl(board.state.videos[video.id].url)" :href="safeVideoUrl(board.state.videos[video.id].url)" target="_blank" rel="noopener noreferrer">Watch reviewed video</a>
        </article>
      </details>
      <div class="task-list">
        <article v-for="task in visibleTasks" :key="task.id" class="transition-task">
          <h3>{{ task.title }}</h3><p>Due November {{ task.day }} · {{ task.role }}<span v-if="task.id === 'packet_complete'"> · Noon</span></p>
          <p v-if="task.requires.length">Requires: {{ task.requires.map(id => board.catalog.find(t => t.id === id)?.title).join('; ') }}</p>
          <fieldset :disabled="busy" @input="dirty = true" @change="dirty = true">
            <label>Status <select v-model="board.state.tasks[task.id].status"><option v-for="status in statuses" :key="status" :value="status">{{ status.replace('_', ' ') }}</option></select></label>
            <label>Owner <input v-model="board.state.tasks[task.id].owner" maxlength="120" /></label>
            <label>Backup <input v-model="board.state.tasks[task.id].backup" maxlength="120" /></label>
            <label class="wide">Evidence / protected reference <textarea v-model="board.state.tasks[task.id].evidence" maxlength="1500" rows="2" /></label>
            <label class="wide">Next action and review date <textarea v-model="board.state.tasks[task.id].nextAction" maxlength="800" rows="2" /></label>
          </fieldset>
        </article>
      </div>
      <details v-if="agencyId === 2" id="itsco-cohorts" class="cohort-section" open>
        <summary>ITSCO · frozen groups of five</summary>
        <p>Rank the complete active roster using completed sessions October 19–November 15 divided by four. Ties use upcoming-week sessions, then provider ID. Missing counts require review. Complete Google, clinical and observed-workday stages in order.</p>
        <template v-if="!board.state.ranking">
          <p>Current provider IDs: {{ providers.map(p => `${p.id} (${p.first_name || p.name || ''} ${p.last_name || ''})`).join(', ') }}</p>
          <label>Verified source reference <input v-model="rankingSource" maxlength="1000" :disabled="busy" /></label>
          <label>Session counts CSV <textarea v-model="rankingCsv" rows="7" :disabled="busy" placeholder="providerId,completedFourWeeks,upcomingWeek&#10;Leave missing counts blank; do not substitute zero." /></label>
          <button type="button" :disabled="busy || dirty || !rankingSource.trim() || !rankingCsv.trim()" @click="freeze">Freeze ranking and create groups</button>
        </template>
        <template v-else>
          <p>Frozen {{ board.state.ranking.frozenAt }} · Source: {{ board.state.ranking.sourceReference }}</p>
          <article v-for="number in cohortNumbers" :key="number" class="transition-task">
            <h3>Group {{ number }}</h3>
            <ul><li v-for="row in board.state.ranking.rows.filter(row => row.cohort === number)" :key="row.providerId">{{ row.rank }}. {{ row.name }} · #{{ row.providerId }} · {{ row.weeklyAverage }} sessions/week · {{ row.upcomingWeek }} upcoming</li></ul>
            <p>{{ cohortProgress(number) }}</p>
            <template v-if="nextStage(number)">
              <label>Stage evidence <textarea v-model="cohortEvidence[number]" maxlength="1500" rows="2" :disabled="busy" /></label>
              <label v-if="nextStage(number) === 'observed'"><input v-model="observed[number]" type="checkbox" :disabled="busy" /> An actual monitored workday is complete; first-session support is arranged where needed.</label>
              <button type="button" :disabled="busy || dirty || !cohortEvidence[number]?.trim() || (number > 1 && !board.state.cohorts[number - 1]?.observed)" @click="advance(number)">Record {{ stageLabels[nextStage(number)] }}</button>
            </template>
          </article>
        </template>
      </details>
      <p>Source archives include inactive and discharged clients. ERA transfers can require monitoring beyond Friday. Close NLU and Inner Strength independently; retain ITSCO access for remaining groups.</p>
      <button type="button" :disabled="busy || !dirty" @click="save">Save evidence</button>
    </template>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: Number, required: true } });
const board = ref(null), busy = ref(false), dirty = ref(false), error = ref(''), notice = ref(''), category = ref(''), providers = ref([]);
const rankingCsv = ref(''), rankingSource = ref(''), cohortEvidence = ref({}), observed = ref({});
const statuses = ['unverified', 'in_progress', 'passed', 'failed', 'deferred'];
const videoStatuses = ['not_started','recording','editing','in_review','published','blocked'];
const practiceName = computed(() => ({ 6: 'Next Level Up', 2: 'ITSCO', 377: 'Inner Strength' }[props.agencyId] || 'Practice'));
const videoDefinitions = computed(() => board.value?.videoCatalog || []);
const publishedVideos = computed(() => videoDefinitions.value.filter(v => board.value.state.videos?.[v.id]?.status === 'published').length);
const passedCount = computed(() => board.value?.catalog.filter(t => board.value.state.tasks[t.id]?.status === 'passed').length || 0);
function safeVideoUrl(value) {
  try { const url = new URL(value, window.location.origin); return value && !value.startsWith('//') && (value.startsWith('/') || url.protocol === 'https:') && !url.username && !url.password ? url.href : null; } catch { return null; }
}
const metricLabels = { provider_updates: 'Provider updates', providers: 'Providers', source_charts: 'All source charts', families: 'Affected families', payer_routes: 'Payer routes' };
const stageLabels = { google_ready: 'Google prerequisites ready', google_retired: 'Google access retired', clinical_ready: 'Clinical transition ready', ehr_retired: 'TherapyNotes workflow retired', observed: 'Monitored workday complete' };
const categories = computed(() => [...new Set(board.value?.catalog.map(t => t.category) || [])]);
const visibleTasks = computed(() => board.value?.catalog.filter(t => !category.value || t.category === category.value) || []);
const cohortNumbers = computed(() => [...new Set(board.value?.state.ranking?.rows.map(row => row.cohort) || [])]);
let generation = 0;
const nextStage = number => Object.keys(stageLabels).find(stage => !board.value.state.cohorts[number]?.[stage]);
const cohortProgress = number => Object.keys(stageLabels).filter(stage => board.value.state.cohorts[number]?.[stage]).map(stage => stageLabels[stage]).join(' → ') || 'No stage accepted yet';
function setCount(metric, key, event) { metric[key] = event.target.value === '' ? null : Number(event.target.value); dirty.value = true; }
async function load() {
  if (dirty.value || busy.value) return;
  const ticket = ++generation, agencyId = props.agencyId; busy.value = true; error.value = '';
  try {
    const result = await api.get('/provider-scheduling/transition-week', { params: { agencyId } });
    if (ticket !== generation) return; board.value = result.data;
    if (category.value && !board.value.catalog.some(t => t.category === category.value)) category.value = '';
    if (agencyId === 2) { const result = await api.get('/provider-scheduling/providers', { params: { agencyId } }); if (ticket === generation) providers.value = result.data; }
  } catch (e) { if (ticket === generation) error.value = e.response?.data?.error?.message || 'Unable to load transition evidence.'; }
  finally { if (ticket === generation) busy.value = false; }
}
async function mutate(input) {
  if (busy.value || !board.value) return;
  const ticket = ++generation, agencyId = props.agencyId; busy.value = true; error.value = ''; notice.value = '';
  try {
    const { data } = await api.put('/provider-scheduling/transition-week', { agencyId, revision: board.value.revision, ...input });
    if (ticket !== generation) return; board.value = data; dirty.value = false; notice.value = 'Transition evidence saved.';
  } catch (e) { if (ticket === generation) error.value = e.response?.data?.error?.message || 'Unable to save. Your local evidence is retained; refresh only after preserving unsaved changes.'; }
  finally { if (ticket === generation) busy.value = false; }
}
const save = () => mutate({ action: 'save', state: board.value.state });
function freeze() {
  const lines = rankingCsv.value.trim().split(/\r?\n/);
  if (lines.shift()?.trim() !== 'providerId,completedFourWeeks,upcomingWeek') { error.value = 'Use the exact CSV header shown, with three numeric columns.'; return; }
  const rows = lines.map(line => { const parts = line.split(',').map(s => s.trim()); return { providerId: parts.length === 3 && parts[0] ? Number(parts[0]) : null, completedFourWeeks: parts[1] ? Number(parts[1]) : null, upcomingWeek: parts[2] ? Number(parts[2]) : null }; });
  void mutate({ action: 'freeze_ranking', rows, sourceReference: rankingSource.value });
}
const advance = number => mutate({ action: 'cohort', cohort: number, stage: nextStage(number), evidence: cohortEvidence.value[number], monitoredWorkdayConfirmed: observed.value[number] === true });
defineExpose({ beforeNavigate: () => { if (!dirty.value && !busy.value) return true; error.value = 'Save transition evidence and wait for the request before leaving.'; return false; } });
watch(() => props.agencyId, () => { generation++; board.value = null; providers.value = []; dirty.value = false; busy.value = false; error.value = ''; notice.value = ''; category.value = ''; rankingCsv.value = ''; rankingSource.value = ''; cohortEvidence.value = {}; observed.value = {}; void load(); }, { immediate: true });
onBeforeUnmount(() => generation++);
</script>
<style scoped>
.transition-board{padding:20px;border:1px solid var(--border,#ccd8e0);border-radius:12px;margin-bottom:24px;line-height:1.5}.board-toolbar,.metric-grid{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0}.transition-board label{display:grid;gap:5px}.transition-board input,.transition-board select,.transition-board textarea,.transition-board button{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}.metric-grid fieldset{flex:1;min-width:150px;display:grid;gap:8px}.metric-grid input{width:100%}.transition-task{padding:14px 0;border-top:1px solid var(--border,#d7e1e8)}.transition-task h3{font-size:1rem;margin:4px 0}.transition-task p{font-size:.9rem}.transition-task fieldset{border:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.transition-task .wide{grid-column:1/-1}.transition-board button{cursor:pointer}.transition-board [role=alert]{color:var(--danger,#b42318)}.cohort-section{margin:20px 0}.cohort-section>label{margin:12px 0}.cohort-section summary{font-weight:700;cursor:pointer}@media(max-width:650px){.transition-task fieldset{grid-template-columns:1fr}.metric-grid{display:grid;grid-template-columns:1fr}.transition-board{padding:12px}}
</style>
<style scoped>.video-section{margin:18px 0;border:1px solid var(--border,#ccd8e0);padding:12px;border-radius:8px}.video-section summary{font-weight:700;cursor:pointer}.transition-video{border-top:1px solid var(--border,#ccd8e0);padding:14px 0}.transition-video small{display:block;font-weight:400}.transition-video fieldset{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;border:0;padding:0}.transition-video .wide{grid-column:1/-1}@media(max-width:650px){.transition-video fieldset{grid-template-columns:1fr}}</style>
