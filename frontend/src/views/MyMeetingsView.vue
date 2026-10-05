<template>
  <main class="my-meetings container">
    <header><div><h1>My meetings</h1><p>Meetings you attended, shared records, and your personal notes.</p></div><RouterLink :to="`${prefix}/my-schedule`">My schedule</RouterLink></header>
    <form class="filters" @submit.prevent="load(false)">
      <label>Meeting type<select v-model="category"><option value="">All types</option><option v-for="(label,key) in categories" :key="key" :value="key">{{ label }}</option></select></label>
      <label>From<input v-model="from" type="date" /></label><label>Through<input v-model="to" type="date" /></label>
      <label>Search<input v-model="search" type="search" placeholder="Meeting title" /></label><button :disabled="loading">Apply filters</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">Loading meetings…</p>
    <div class="meeting-layout">
      <section aria-label="Attended meetings">
        <p v-if="!loading && !rows.length">No attended meetings match these filters.</p>
        <button v-for="row in rows" :key="`${row.type}:${row.id}`" class="meeting-row" :aria-pressed="selected?.id === row.id && selected?.type === row.type" @click="openMeeting(row)">
          <strong>{{ row.title }}</strong><span>{{ categories[row.category] || row.category }} · {{ when(row.start_at) }}</span>
          <span v-if="['queued','generating'].includes(row.summary_status)">Summary still generating…</span>
        </button><button v-if="hasMore" :disabled="loading" @click="load(true)">Load more</button>
      </section>
      <article v-if="selected" class="meeting-detail" aria-label="Meeting record">
        <p v-if="detailLoading">Loading meeting record…</p>
        <template v-else-if="detail">
          <h2>{{ detail.meeting.title }}</h2><p>{{ when(detail.meeting.startAt) }}</p>
          <RouterLink :to="calendarLink">View scheduled event</RouterLink>
          <nav class="tabs" aria-label="Meeting sections"><button v-for="name in tabs" :key="name" :aria-pressed="tab === name" @click="tab = name">{{ name }}</button></nav>
          <section v-if="tab === 'Overview'">
            <h3>Attendance</h3>
            <ul><li v-for="person in detail.attendance" :key="person.user_id">{{ person.name }} · {{ Math.round(person.total_seconds / 60) }} minutes</li>
              <li v-for="person in presenceOnly" :key="person.join_identity">{{ person.name || 'Participant' }} · Joined {{ when(person.joined_at) }}</li></ul>
            <p v-if="!detail.attendance.length && !detail.presence.length">No detailed attendance record is available.</p>
            <h3>Agenda</h3><ul><li v-for="item in detail.agenda" :key="item.id"><strong>{{ item.title }}</strong> · {{ item.status }}<p v-if="item.notes">{{ item.notes }}</p></li></ul>
            <p v-if="!detail.agenda.length">No agenda items saved.</p>
            <h3>Goals and assigned tasks</h3><p v-if="detail.workspace.focusTitle">{{ detail.workspace.focusTitle }}</p>
            <ul><li v-for="goal in detail.workspace.goals" :key="goal.id">{{ goal.done ? '✓ ' : '' }}{{ goal.text }}</li><li v-for="task in detail.workspace.actionItems" :key="task.id">{{ task.done ? '✓ ' : '' }}{{ task.text }} <span v-if="task.assigneeUserId">— {{ assigneeName(task.assigneeUserId) }}</span></li></ul>
          </section>
          <section v-else-if="tab === 'My notes'"><h3>My notes</h3><p>Only you can see these notes.</p><textarea v-model="note" rows="14" @input="noteDirty = true" /><button :disabled="saving || !noteDirty" @click="saveNote">{{ saving ? 'Saving…' : 'Save my notes' }}</button><span v-if="noteSaved" role="status">Saved</span></section>
          <section v-else-if="tab === 'Transcript'"><h3>Shared transcript</h3><pre>{{ detail.transcript || 'No transcript was captured for this meeting.' }}</pre></section>
          <section v-else>
            <h3>{{ tab }}</h3><p v-if="['queued','generating'].includes(detail.summaryStatus)" role="status">Summary still generating… You can return later.</p>
            <p v-else-if="detail.summaryStatus === 'failed'">Summary generation failed. Your transcript is still available.</p>
            <button v-if="detail.transcript && !['queued','generating'].includes(detail.summaryStatus) && (!detail.summary || detail.summaryStatus === 'failed')" @click="retrySummary">Generate summary</button>
            <p v-if="detail.summary" class="summary-notice">Auto-generated from the saved transcript. Review for accuracy; suggestions are separate from agreed tasks.</p>
            <div class="summary-content" v-html="summaryHtml"></div><p v-if="!detail.summary && !['queued','generating'].includes(detail.summaryStatus)">No summary available yet.</p>
          </section>
        </template>
      </article>
    </div>
  </main>
</template>
<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import api from '../services/api';
import { useAgencyStore } from '../store/agency';
import { parseScheduleUtcInstant } from '../utils/scheduleEventInstants.js';
const route = useRoute(), router = useRouter(), agencies = useAgencyStore();
const prefix = computed(() => route.params.organizationSlug ? `/${route.params.organizationSlug}` : '');
const agencyId = computed(() => agencies.currentAgency?.id || agencies.userAgencies?.[0]?.id || agencies.agencies?.[0]?.id);
const categories = { general:'General',huddle:'Huddle',cpa:'CPA',mentorship:'Mentorship',admin:'Admin',town_hall:'Town hall',interview:'Interview',evaluation:'Evaluation',leadership_circle:'Leadership circle',supervisors_meeting:'Supervisors meeting',supervision:'Supervision' };
const tabs = ['Overview','Summary','Tasks by person','Suggested next steps','Transcript','My notes'];
const category=ref(''),from=ref(''),to=ref(''),search=ref(''),rows=ref([]),hasMore=ref(false),loading=ref(false),error=ref('');
const selected=ref(null),detail=ref(null),detailLoading=ref(false),tab=ref(tabs.includes(route.query.tab) ? route.query.tab : 'Overview'),note=ref(''),noteDirty=ref(false),saving=ref(false),noteSaved=ref(false);
let timer,loadVersion=0,detailVersion=0;
const when = value => parseScheduleUtcInstant(value)?.toLocaleString() || '—';
const path = row => `/team-meetings/my-meetings/${row.type}/${row.id}`;
const presenceOnly = computed(() => (detail.value?.presence || []).filter(p => !detail.value?.attendance.some(a => `user-${a.user_id}` === p.join_identity)));
const assigneeName = id => detail.value?.attendance.find(a => Number(a.user_id)===Number(id))?.name || detail.value?.presence.find(p => p.join_identity===`user-${id}`)?.name || `User #${id}`;
const summaryHtml = computed(() => {
  let text = detail.value?.summary || '';
  if (['Tasks by person', 'Suggested next steps'].includes(tab.value)) {
    const heading = new RegExp(`^#{1,3}[ \t]*${tab.value}[ \t]*\\n([\\s\\S]*)`, 'im');
    const match = text.match(heading);
    // Keep person/topic subheadings inside the selected section.
    const level = match?.[0]?.match(/^#+/)?.[0]?.length || 2;
    text = match?.[1]?.split(new RegExp(`^#{1,${level}}[ \t]+`, 'm'))[0] || `No ${tab.value.toLowerCase()} recorded.`;
  }
  return DOMPurify.sanitize(marked.parse(text));
});
const calendarLink = computed(() => {
  const meeting=detail.value?.meeting, date=parseScheduleUtcInstant(meeting?.startAt);
  return {path:`${prefix.value}/my-schedule`,query:{eventId:meeting?.id,eventKind:meeting?.type==='supervision'?'SUPERVISION':'TEAM_MEETING',weekStart:date ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` : undefined}};
});
async function load(append=false) {
  const version=++loadVersion;
  if (!agencyId.value) return;
  loading.value=true;error.value='';
  try { const {data}=await api.get('/team-meetings/my-meetings',{params:{agencyId:agencyId.value,category:category.value,from:from.value,to:to.value,search:search.value,offset:append?rows.value.length:0},skipGlobalLoading:true});
    if(version!==loadVersion)return;rows.value=append?[...rows.value,...data.meetings]:data.meetings;hasMore.value=data.hasMore;
  } catch(e){if(version===loadVersion)error.value=e?.response?.data?.error?.message||'Could not load meetings';}finally{if(version===loadVersion)loading.value=false;}
}
async function openMeeting(row,refresh=false){
  if (!refresh && noteDirty.value) { error.value='Save your personal notes before opening another meeting.';return; }
  const version=++detailVersion;selected.value=row; if(!refresh){detail.value=null;detailLoading.value=true;noteSaved.value=false;}
  try{const {data}=await api.get(path(row),{skipGlobalLoading:true});if(version!==detailVersion)return;detail.value=data;if(!noteDirty.value)note.value=data.personalNote||'';
    if(!refresh)await router.replace({query:{...route.query,type:row.type,meetingId:row.id,tab:tab.value}});
  }catch(e){if(version===detailVersion)error.value=e?.response?.data?.error?.message||'Could not load meeting';}finally{if(version===detailVersion)detailLoading.value=false;}
}
async function saveNote(){saving.value=true;noteSaved.value=false;try{await api.put(`${path(selected.value)}/personal-note`,{noteText:note.value});noteDirty.value=false;noteSaved.value=true;}catch(e){error.value=e?.response?.data?.error?.message||'Could not save notes';}finally{saving.value=false;}}
async function retrySummary(){try{await api.post(`${path(selected.value)}/summary`);await openMeeting(selected.value,true);}catch(e){error.value=e?.response?.data?.error?.message||'Could not queue summary';}}
watch(tab, value => { if (selected.value) void router.replace({ query: { ...route.query, type: selected.value.type, meetingId: selected.value.id, tab: value } }); });
function openLinkedMeeting(){if(['team','supervision'].includes(route.query.type)&&Number(route.query.meetingId)>0)void openMeeting({type:route.query.type,id:Number(route.query.meetingId)});}
watch(agencyId,()=>{++detailVersion;selected.value=null;detail.value=null;noteDirty.value=false;rows.value=[];void load();openLinkedMeeting();});
onMounted(()=>{void load();openLinkedMeeting();timer=setInterval(()=>{if(selected.value&&!detailLoading.value&&['queued','generating'].includes(detail.value?.summaryStatus))void openMeeting(selected.value,true);},5000);});
onUnmounted(()=>{clearInterval(timer);++loadVersion;++detailVersion;});
</script>
<style scoped>
.my-meetings{padding:24px;max-width:1400px;margin:auto}header,.filters,.tabs{display:flex;gap:16px;flex-wrap:wrap;align-items:center}header{justify-content:space-between}.filters{margin:24px 0}.filters label{display:grid;gap:6px}input,select,textarea,button{font:inherit;padding:10px;border:1px solid var(--border,#cbd5e1);border-radius:8px}button{cursor:pointer;background:var(--bg,#fff);color:inherit}.meeting-layout{display:grid;grid-template-columns:minmax(230px,1fr) minmax(0,2fr);gap:24px}.meeting-row{display:grid;gap:6px;width:100%;text-align:left;margin-bottom:10px}.meeting-row[aria-pressed=true],.tabs button[aria-pressed=true]{border-color:#2d6a50;background:#e8f5ee;color:#173f39}.meeting-row span{font-size:.9rem}.meeting-detail{padding:20px;border:1px solid var(--border,#cbd5e1);border-radius:12px;min-width:0}.tabs{margin:20px 0;gap:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.6}textarea{box-sizing:border-box;width:100%}@media(max-width:760px){.my-meetings{padding:16px}.meeting-layout{grid-template-columns:1fr}.filters label{flex:1;min-width:130px}}
.summary-notice{font-size:.85rem;color:var(--text-muted,#64748b);line-height:1.5}.summary-content{line-height:1.65;overflow-wrap:anywhere}.summary-content :deep(h2),.summary-content :deep(h1){font-size:1.2rem;margin:24px 0 10px;padding:12px 16px;background:var(--bg-secondary,#f1f5f9);border-radius:10px}.summary-content :deep(h3){font-size:1rem;margin:18px 0 8px}.summary-content :deep(li){margin:8px 0}.summary-content :deep(p){margin:10px 0}
</style>
