<template>
  <main class="my-meetings" :class="{ embedded }">
    <header class="page-heading">
      <div><p class="eyebrow">YOUR WORKSPACE</p><h1>Meetings</h1><p>Your meetings, shared records, and personal notes in one place.</p></div>
      <RouterLink class="schedule-link" :to="`${prefix}/my-schedule`"><CalendarDays :size="18" /> My schedule</RouterLink>
    </header>
    <ManualMeetingLog :agency-id="agencyId" @saved="load(false)" />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <template v-if="!selected">
      <section class="category-grid" aria-label="Meeting categories">
        <button v-for="card in categoryCards" :key="card.key" class="category-card" :class="card.color" :aria-pressed="category === card.key || (card.key === 'administrative' && isAdminCategory)" @click="chooseCategory(card.key)">
          <span class="category-icon"><component :is="card.icon" :size="25" /></span>
          <span class="category-copy"><strong>{{ card.label }}</strong><span>{{ card.description }}</span></span>
          <span class="category-count" :aria-label="`${categoryCount(card.key)} attended meetings`">{{ categoryCount(card.key) }}</span>
        </button>
      </section>
      <section v-if="category === 'training' && agencyId" class="training-meeting-area" aria-label="Scheduled training">
        <button v-if="canScheduleTraining(auth.user)" type="button" class="primary" @click="trainingEditorOpen=true">Schedule training</button>
        <ScheduledTrainingLog :key="trainingLogVersion" :agency-id="Number(agencyId)" expanded />
      </section>
      <ScheduledTrainingEditor v-if="trainingEditorOpen && agencyId && canScheduleTraining(auth.user)" :agency-id="Number(agencyId)" @close="trainingEditorOpen=false" @saved="trainingLogVersion++;load(false)" />
      <section class="history-panel" aria-label="Attended meetings">
        <div class="history-heading"><div><h2>{{ category ? categories[category] : 'All attended meetings' }}</h2><p>{{ total }} {{ total === 1 ? 'record' : 'records' }} · Most recent first</p></div><button v-if="category || from || to || search" @click="category='';from='';to='';search='';load()">View all meetings</button></div>
        <nav v-if="isAdminCategory" class="admin-tabs" aria-label="Administrative meeting types"><button v-for="key in ['administrative',...adminCategories]" :key="key" :aria-pressed="category===key" @click="chooseCategory(key)">{{ categories[key] }}</button></nav>
        <form class="filters" @submit.prevent="load(false)">
          <label class="search-field">Search meetings<input v-model="search" type="search" placeholder="Meeting or facilitator" /></label>
          <label>From<input v-model="from" type="date" /></label><label>Through<input v-model="to" type="date" /></label>
          <label>Meeting type<select v-model="category"><option value="">All types</option><option v-for="(label,key) in categories" :key="key" :value="key">{{ label }}</option></select></label><button class="primary" :disabled="loading"><Search :size="16" /> Search</button>
        </form>
        <p v-if="loading" class="empty-state" role="status">Loading meetings…</p>
        <div v-else-if="!rows.length" class="empty-state"><MessagesSquare :size="32" /><h3>No attended meetings here yet</h3><p>Records appear when attendance is captured. Try another category or clear your filters.</p></div>
        <div v-if="rows.length" class="table-heading" aria-hidden="true"><span>Date &amp; time</span><span>Meeting</span><span>Participants</span><span>Record</span></div>
        <button v-for="row in rows" :key="`${row.type}:${row.id}`" class="meeting-row" @click="openMeeting(row)">
          <span class="date-cell"><strong>{{ day(row.start_at) }}</strong><span>{{ time(row.start_at) }} – {{ time(row.end_at) }}</span></span>
          <span class="title-cell"><span class="type-badge">{{ categories[row.category] || friendly(row.category) }}</span><strong>{{ row.title }}</strong><span v-if="row.facilitator">Facilitator: {{ row.facilitator }}</span></span>
          <span class="participant-cell"><span class="avatars" aria-hidden="true"><span v-for="person in (row.participants || []).slice(0,3)" :key="person.identity || person.user_id" class="avatar">{{ initials(person.name) }}</span></span><span>{{ (row.participants || []).slice(0,3).map(p=>p.name).join(', ') || 'See attendance record' }}<template v-if="row.participants?.length>3"> +{{ row.participants.length-3 }} more</template></span></span>
          <span class="record-cell"><span class="status-badge">{{ statusLabel(row) }}</span><span v-if="['queued','generating'].includes(row.summary_status)">Summary generating…</span><span class="open-record">View record <ArrowRight :size="16" /></span></span>
        </button>
        <div v-if="hasMore" class="load-more"><button :disabled="loading" @click="load(true)">Load more meetings</button></div>
      </section>
    </template>
    <article v-else class="meeting-detail" aria-label="Meeting record">
      <button class="back-button" @click="closeMeeting"><ArrowLeft :size="17" /> Back to meetings</button>
      <p v-if="detailLoading" role="status">Loading meeting record…</p>
      <template v-else-if="detail">
        <div class="record-heading"><div><span class="type-badge">{{ categories[detail.meeting.category] || friendly(detail.meeting.category) }}</span><h2>{{ detail.meeting.title }}</h2><p>{{ day(detail.meeting.startAt) }} · {{ time(detail.meeting.startAt) }} – {{ time(detail.meeting.endAt) }}</p></div><RouterLink class="schedule-link" :to="calendarLink">View scheduled event <ArrowRight :size="16" /></RouterLink></div>
        <div class="record-facts"><div><span>FACILITATOR</span><strong>{{ detail.meeting.facilitator || 'Not recorded' }}</strong></div><div><span>SESSION</span><strong>{{ duration(detail.meeting.startAt,detail.meeting.endAt) }}</strong></div><div><span>STATUS</span><strong>{{ statusLabel(detail.meeting) }}</strong></div></div>
        <p v-if="detail.meeting.category==='interview'" class="privacy-note">Interview records are available only to authorized staff. Candidates cannot view this history.</p>
        <nav class="tabs" aria-label="Meeting sections"><button v-for="name in tabs" :key="name" :aria-pressed="tab === name" @click="tab = name">{{ name }}</button></nav>
        <section v-if="['Overview','Documents'].includes(tab) && detail.training" class="record-section"><h3>Training topic &amp; assets</h3><p>{{detail.training.topic}}</p><ul><li v-for="asset in detail.training.assets" :key="asset.id"><button type="button" @click="downloadTrainingAsset(asset)">{{asset.filename}}</button></li></ul></section>
        <section v-if="tab === 'Overview' && detail.summary" class="record-section"><h3>Summary</h3><div class="summary-markdown" v-html="summaryHtml" /></section>
        <p v-if="detail.attended===false" class="privacy-note">Shared notes for your invitation. No attendance was recorded for you; private notes and transcript access are not included.</p>
        <section v-if="tab === 'Overview'" class="overview-grid">
          <div v-if="detail.attended!==false" class="record-section"><h3>Participants &amp; attendance</h3><p class="muted">Recorded attendance and join history.</p>
            <ul class="attendance-list"><li v-for="person in detail.attendance" :key="person.user_id"><span class="avatar" aria-hidden="true">{{ initials(person.name) }}</span><div><strong>{{ person.name }} · {{ Math.round(person.total_seconds / 60) }} minutes</strong><span v-if="person.first_joined_at">{{ time(person.first_joined_at) }} – {{ person.last_left_at ? time(person.last_left_at) : 'Departure not recorded' }}</span></div></li>
              <li v-for="person in presenceOnly" :key="person.join_identity"><span class="avatar" aria-hidden="true">{{ initials(person.name) }}</span><div><strong>{{ person.name || 'Participant' }}</strong><span>Joined {{ when(person.joined_at) }}<template v-if="person.left_at"> · Left {{ when(person.left_at) }}</template></span></div></li></ul>
            <p v-if="!detail.attendance.length && !detail.presence.length">No detailed attendance record is available.</p>
            <details v-if="detail.attendanceLog?.length" class="join-log"><summary>View attendance log</summary><p v-for="entry in detail.attendanceLog" :key="entry.id"><strong>{{ entry.name || 'Participant' }}</strong><br />{{ entry.eventType==='attendance'?'Joined':friendly(entry.eventType) }} {{ when(entry.at) }}<template v-if="entry.endedAt"><br />Left {{ when(entry.endedAt) }}</template><br /><span v-if="entry.source">{{ {platform:'Platform meeting',meet:'Google Meet',manual:'Manually recorded'}[entry.source] || friendly(entry.source) }}</span></p></details>
            <details v-else-if="detail.presence.length" class="join-log"><summary>View join and leave log</summary><p v-for="(person,index) in detail.presence" :key="index"><strong>{{ person.name || 'Participant' }}</strong><br />Joined {{ when(person.joined_at) }}<br />{{ person.left_at ? `Left ${when(person.left_at)}` : 'Departure not recorded' }}</p></details>
          </div>
          <div><section class="record-section"><h3>Agenda</h3><ul class="agenda-list"><li v-for="item in detail.agenda" :key="item.id"><strong>{{ item.title }}</strong><span class="muted"> · {{ friendly(item.status) }}</span><p v-if="item.notes">{{ item.notes }}</p></li></ul><p v-if="!detail.agenda.length" class="muted">No agenda items saved.</p></section>
          <section class="record-section"><h3>{{detail.training?'Training goals':'Goals & assigned tasks'}}</h3><p v-if="detail.workspace.focusTitle">{{ detail.workspace.focusTitle }}</p><ul><li v-for="goal in detail.workspace.goals" :key="goal.id">{{ goal.done ? '✓ ' : '' }}{{ goal.text }}</li><li v-for="task in detail.workspace.actionItems" :key="task.id">{{ task.done ? '✓ ' : '' }}{{ task.text }} <span v-if="task.assigneeUserId">— {{ assigneeName(task.assigneeUserId) }}</span></li></ul><p v-if="!detail.workspace.goals?.length && !detail.workspace.actionItems?.length" class="muted">No goals or assigned tasks saved.</p></section></div>
        </section>
        <section v-else-if="tab === 'Documents' && detail.training"><p>Download the documents above. Access stays with your meeting invitation.</p></section>
        <section v-else-if="tab === 'Chat & activity'" class="activity-panel"><h3>Saved chat &amp; activity</h3><p class="muted">Messages, discussion points, polls, and answers captured during this meeting.</p>
          <p v-if="activityLoading" role="status">Loading saved activity…</p><p v-if="activityError" class="error" role="alert">{{ activityError }} <button @click="loadActivity(activity.length>0)">Try again</button></p>
          <p v-if="activityLoaded && !activity.length" class="empty-state">No chat or activity was saved for this meeting.</p>
          <ol class="activity-log"><li v-for="item in activity" :key="item.id"><div class="activity-meta"><strong>{{ item.payload?.authorName || assigneeName(item.userId) }}</strong><span class="type-badge">{{ {chat:'Chat',question:'Discussion point',answer:'Answer',poll:'Poll',poll_vote:'Poll response'}[item.activityType] || friendly(item.activityType) }}</span><time>{{ when(item.createdAt) }}</time></div><p>{{ item.payload?.text || item.payload?.question || item.payload?.answer || item.payload?.optionText || 'Response recorded' }}</p><ul v-if="item.payload?.options?.length"><li v-for="(option,i) in item.payload.options" :key="i">{{ typeof option==='string'?option:option.label || option.text }}</li></ul><small v-if="item.payload?.replyToId">In reply to message #{{ item.payload.replyToId }}</small></li></ol>
          <button v-if="activityMore" :disabled="activityLoading" @click="loadActivity(true)">Load more activity</button>
          <template v-if="detail.meeting.category==='interview'"><h3>Hiring team chat</h3><p class="muted">Internal discussion for authorized interview staff.</p><ol class="activity-log"><li v-for="(message,index) in detail.interviewTeamChat || []" :key="index"><div class="activity-meta"><strong>{{ message.authorName || 'Interviewer' }}</strong><time>{{ when(message.at) }}</time></div><p>{{ message.text }}</p></li></ol><p v-if="!detail.interviewTeamChat?.length" class="muted">No hiring team messages saved.</p></template>
        </section>
        <section v-else-if="tab === 'My notes'"><h3>My private notes</h3><p class="muted">Only you can see these notes.</p><label class="note-label">Personal meeting notes<textarea v-model="note" rows="12" @input="noteDirty = true" /></label><div class="note-actions"><button class="primary" :disabled="saving || !noteDirty" @click="saveNote">{{ saving ? 'Saving…' : 'Save my notes' }}</button><span v-if="noteDirty">Unsaved changes</span><span v-if="noteSaved" role="status">Saved</span></div></section>
        <section v-else-if="tab === 'Transcript'"><h3>Shared transcript</h3><pre>{{ detail.transcript || 'No transcript was captured for this meeting.' }}</pre></section>
        <section v-else><h3>{{ tab }}</h3><p v-if="['queued','generating'].includes(detail.summaryStatus)" role="status">Summary still generating… You can return later.</p><p v-else-if="detail.summaryStatus === 'failed'">Summary generation failed. Your transcript is still available.</p><button v-if="detail.transcript && !['queued','generating'].includes(detail.summaryStatus) && (!detail.summary || detail.summaryStatus === 'failed')" @click="retrySummary">Generate summary</button><p v-if="detail.summary" class="summary-notice">{{ detail.summarySource === 'manual' ? 'Includes a staff-submitted meeting summary.' : 'Auto-generated from the saved transcript. Review for accuracy; suggestions are separate from agreed tasks.' }}</p><div class="summary-content" v-html="summaryHtml"></div><p v-if="!detail.summary && !['queued','generating'].includes(detail.summaryStatus)">No summary available yet.</p></section>
      </template>
    </article>
  </main>
</template>
<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import ManualMeetingLog from '../components/meetings/ManualMeetingLog.vue';
import ScheduledTrainingLog from '../components/schedule/ScheduledTrainingLog.vue';
import ScheduledTrainingEditor from '../components/schedule/ScheduledTrainingEditor.vue';
import { canScheduleTraining } from '../utils/scheduledTraining';
import { useAuthStore } from '../store/auth';
import { Users, UserRound, Building2, Landmark, MessagesSquare, ClipboardList, ArrowLeft, ArrowRight, CalendarDays, Search } from '@lucide/vue';
const props = defineProps({ embedded: Boolean });
import { useRoute, useRouter } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import api from '../services/api';
import { useAgencyStore } from '../store/agency';
import { parseScheduleUtcInstant } from '../utils/scheduleEventInstants.js';
const route = useRoute(), router = useRouter(), agencies = useAgencyStore();
const auth = useAuthStore(), trainingEditorOpen = ref(false), trainingLogVersion = ref(0);
const prefix = computed(() => route.params.organizationSlug ? `/${route.params.organizationSlug}` : '');
const agencyId = computed(() => agencies.currentAgency?.id || agencies.userAgencies?.[0]?.id || agencies.agencies?.[0]?.id);
const categories = { training:'Training', administrative:'All administrative',group_supervision:'Group supervision', general:'General',huddle:'Huddle',cpa:'CPA',mentorship:'Mentorship',admin:'Administrative',town_hall:'Town hall',interview:'Interview',evaluation:'Evaluation',leadership_circle:'Leadership circle',supervisors_meeting:'Supervisors meeting',supervision:'Individual supervision' };
const allTabs = ['Overview','Chat & activity','Summary','Tasks by person','Suggested next steps','Transcript','My notes','Documents'];
const tabs = computed(() => allTabs.filter(name => {
  if (name==='Documents') return !!detail.value?.training;
  if (detail.value?.attended===false) return ['Overview','Summary'].includes(name);
  return !detail.value?.training || !['Tasks by person','Suggested next steps'].includes(name);
}));
const counts=ref({}),total=ref(0);
const category=ref(Object.hasOwn(categories,route.query.category) ? route.query.category : ''),from=ref(''),to=ref(''),search=ref(''),rows=ref([]),hasMore=ref(false),loading=ref(false),error=ref('');
const selected=ref(null),detail=ref(null),detailLoading=ref(false),tab=ref(allTabs.includes(route.query.meetingTab || (!props.embedded && route.query.tab)) ? (route.query.meetingTab || route.query.tab) : 'Overview'),note=ref(''),noteDirty=ref(false),saving=ref(false),noteSaved=ref(false);
const activity=ref([]),activityLoading=ref(false),activityLoaded=ref(false),activityMore=ref(false),activityError=ref('');
let timer,loadVersion=0,detailVersion=0,activityVersion=0;
async function downloadTrainingAsset(asset) {
 try {
  const {data}=await api.get(`/team-meetings/${detail.value.meeting.id}/training/assets/${asset.id}`,{responseType:'blob',skipTeamMeetingAccess:true});
  const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=asset.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }catch{error.value='Could not download the training asset.';}
}
const categoryCards = [
  { key:'training', label:'Training', description:'Scheduled staff learning and attendance.', icon:ClipboardList, color:'blue' },
  { key:'supervision', label:'Individual supervision', description:'Sessions with your supervisor.', icon:UserRound, color:'mint' },
  { key:'group_supervision', label:'Group supervision', description:'Shared learning and case consultation.', icon:Users, color:'blue' },
  { key:'administrative', label:'Administrative meetings', description:'CPA, mentorship, admin, and huddles.', icon:Building2, color:'purple' },
  { key:'town_hall', label:'Town hall meetings', description:'Agency updates and conversation.', icon:Landmark, color:'rose' },
  { key:'general', label:'General meetings', description:'Team and program conversations.', icon:MessagesSquare, color:'amber' },
  { key:'interview', label:'Interview meetings', description:'Interview records for authorized staff.', icon:ClipboardList, color:'mint' }
];
const adminCategories=['admin','cpa','mentorship','huddle'];
const isAdminCategory=computed(()=>category.value==='administrative'||adminCategories.includes(category.value));
const categoryCount=key=>key==='administrative'?adminCategories.reduce((sum,k)=>sum+(counts.value[k]||0),0):counts.value[key]||0;
const friendly=value=>String(value||'').replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase());
const initials=name=>String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('');
const day=value=>parseScheduleUtcInstant(value)?.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})||'—';
const time=value=>parseScheduleUtcInstant(value)?.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})||'—';
const duration=(start,end)=>{const a=parseScheduleUtcInstant(start),b=parseScheduleUtcInstant(end);return a&&b&&b>a?`${Math.round((b-a)/60000)} minutes scheduled`:'Duration not recorded';};
const statusLabel=row=>row.meeting_completed_at||row.live_ended_at||row.completedAt||String(row.status).toUpperCase()==='FINALIZED'?'Completed':String(row.status).toUpperCase()==='CANCELLED'?'Cancelled':'Attendance recorded';
const detailQuery=()=>({ ...route.query,type:selected.value.type,meetingId:selected.value.id,[props.embedded?'meetingTab':'tab']:tab.value });
function chooseCategory(key){category.value=key;void load();}
watch(()=>route.query.category,value=>{if(Object.hasOwn(categories,value))chooseCategory(value);});
async function closeMeeting(){
  if(noteDirty.value){error.value='Save your personal notes before returning to meetings.';return;}
  ++detailVersion;++activityVersion;selected.value=null;detail.value=null;error.value='';
  const query={...route.query};delete query.type;delete query.meetingId;delete query.meetingTab;if(!props.embedded)delete query.tab;
  await router.replace({query});
}
async function loadActivity(append=false){
  const row=selected.value;if(!row)return;
  const version=++activityVersion;activityLoading.value=true;activityError.value='';
  try{const {data}=await api.get(`${path(row)}/activity`,{params:{offset:append?activity.value.length:0},skipGlobalLoading:true});
    if(version!==activityVersion)return;activity.value=append?[...activity.value,...data.activity]:data.activity;activityMore.value=data.hasMore;activityLoaded.value=true;
  }catch(e){if(version===activityVersion)activityError.value=e?.response?.data?.error?.message||'Could not load saved chat and activity.';}
  finally{if(version===activityVersion)activityLoading.value=false;}
}

const when = value => parseScheduleUtcInstant(value)?.toLocaleString() || '—';
const path = row => `/team-meetings/my-meetings/${row.type}/${row.id}`;
const presenceOnly = computed(() => (detail.value?.presence || []).filter(p => !detail.value?.attendance.some(a => `user-${a.user_id}` === p.join_identity)));
const assigneeName = id => !id ? 'Participant' : detail.value?.attendance.find(a => Number(a.user_id)===Number(id))?.name || detail.value?.presence.find(p => p.join_identity===`user-${id}`)?.name || `User #${id}`;
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
    if(version!==loadVersion)return;rows.value=append?[...rows.value,...data.meetings]:data.meetings;hasMore.value=data.hasMore;counts.value=data.counts||{};total.value=data.total??data.meetings.length;
  } catch(e){if(version===loadVersion)error.value=e?.response?.data?.error?.message||'Could not load meetings';}finally{if(version===loadVersion)loading.value=false;}
}
async function openMeeting(row,refresh=false){
  if (!refresh && noteDirty.value) { error.value='Save your personal notes before opening another meeting.';return; }
  const version=++detailVersion;selected.value=row; if(!refresh){++activityVersion;activity.value=[];activityLoaded.value=false;activityLoading.value=false;activityMore.value=false;activityError.value='';error.value='';detail.value=null;detailLoading.value=true;noteSaved.value=false;}
  try{const {data}=await api.get(path(row),{skipGlobalLoading:true});if(version!==detailVersion)return;detail.value=data;if(!tabs.value.includes(tab.value))tab.value='Overview';if(!noteDirty.value)note.value=data.personalNote||'';
    if(!refresh){await router.replace({query:detailQuery()});if(tab.value==='Chat & activity')void loadActivity();}
  }catch(e){if(version===detailVersion)error.value=e?.response?.data?.error?.message||'Could not load meeting';}finally{if(version===detailVersion)detailLoading.value=false;}
}
async function saveNote(){saving.value=true;noteSaved.value=false;try{await api.put(`${path(selected.value)}/personal-note`,{noteText:note.value});noteDirty.value=false;noteSaved.value=true;}catch(e){error.value=e?.response?.data?.error?.message||'Could not save notes';}finally{saving.value=false;}}
async function retrySummary(){try{await api.post(`${path(selected.value)}/summary`);await openMeeting(selected.value,true);}catch(e){error.value=e?.response?.data?.error?.message||'Could not queue summary';}}
watch(tab, value => { if (selected.value) { void router.replace({query:detailQuery()});if(value==='Chat & activity'&&!activityLoaded.value)void loadActivity(); } });
function openLinkedMeeting(){if(['team','supervision'].includes(route.query.type)&&Number(route.query.meetingId)>0)void openMeeting({type:route.query.type,id:Number(route.query.meetingId)});}
watch(agencyId,()=>{++detailVersion;++activityVersion;selected.value=null;detail.value=null;activity.value=[];note.value='';noteDirty.value=false;rows.value=[];counts.value={};total.value=0;void load();openLinkedMeeting();});
onMounted(()=>{void load();openLinkedMeeting();timer=setInterval(()=>{if(selected.value&&!detailLoading.value&&['queued','generating'].includes(detail.value?.summaryStatus))void openMeeting(selected.value,true);},5000);});
onUnmounted(()=>{clearInterval(timer);++loadVersion;++detailVersion;++activityVersion;});
</script>
<style scoped>
.my-meetings{--meeting-ink:#183b43;--meeting-muted:#627585;--meeting-border:#dce6e8;--meeting-accent:#255f55;width:100%;max-width:none;box-sizing:border-box;padding:clamp(16px,2.5vw,36px);color:var(--text-primary,#20343e);background:var(--bg-alt,#f7fafb);min-width:0}
.my-meetings.embedded{padding:clamp(12px,2vw,28px);border-radius:18px}
.page-heading,.history-heading,.record-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
.page-heading{margin-bottom:28px}
h1,h2,h3,p{margin:0}
h1{font-size:clamp(1.8rem,3vw,2.5rem);color:var(--text-primary,var(--meeting-ink));line-height:1.25}
h2{font-size:1.35rem;color:var(--text-primary,var(--meeting-ink))}
h3{font-size:1.05rem;color:var(--text-primary,var(--meeting-ink));margin-bottom:12px}
p{line-height:1.6}
.page-heading p:not(.eyebrow),.history-heading p,.record-heading p,.muted{color:var(--text-secondary,var(--meeting-muted));font-size:.92rem}
.eyebrow{font-size:.7rem;letter-spacing:.14em;font-weight:700;color:var(--meeting-accent);margin-bottom:5px}
button,input,select,textarea{font:inherit;box-sizing:border-box}
button,.schedule-link{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;border:1px solid var(--meeting-border);border-radius:10px;background:var(--bg-primary,#fff);color:var(--text-primary,var(--meeting-ink));cursor:pointer;font-weight:600;font-size:.88rem;text-decoration:none}
button:hover,.schedule-link:hover{border-color:var(--meeting-accent);background:var(--bg-secondary,#f0f7f5)}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #7ebfb0;outline-offset:3px}
button:disabled{opacity:.55;cursor:wait}
.primary{background:var(--meeting-accent);color:white;border-color:var(--meeting-accent)}
.primary:hover{background:#194d44;color:white}
.category-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:28px}
.category-card{padding:20px;gap:14px;text-align:left;justify-content:flex-start;min-width:0;box-shadow:0 2px 5px #173b4304}
.category-copy{display:grid;gap:7px;flex:1;min-width:0}
.category-copy strong{font-size:.96rem}
.category-copy>span{font-size:.8rem;font-weight:400;line-height:1.5;color:var(--meeting-muted)}
.category-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:16px;flex-shrink:0;background:#dcf4eb;color:#25665d}
.blue .category-icon{background:#e3efff;color:#3167b3}
.purple .category-icon{background:#eee5ff;color:#7652ae}
.rose .category-icon{background:#fce9ed;color:#ae556b}
.amber .category-icon{background:#fff1d3;color:#9b6a17}
.category-count{font-size:.78rem;color:var(--meeting-muted)}
.category-card[aria-pressed=true]{border-color:var(--meeting-accent);box-shadow:0 0 0 1px var(--meeting-accent);background:var(--bg-secondary,#f0f8f4)}
.history-panel,.meeting-detail{border:1px solid var(--meeting-border);border-radius:16px;background:var(--bg-primary,#fff);min-width:0;overflow:hidden}
.history-heading{padding:22px 24px}
.history-heading p{margin-top:5px}
.filters{padding:16px 24px;display:flex;align-items:end;gap:12px;flex-wrap:wrap;border-top:1px solid var(--meeting-border);border-bottom:1px solid var(--meeting-border);background:var(--bg-alt,#f8fafb)}
.filters label{display:grid;gap:7px;font-size:.78rem;font-weight:600;min-width:130px;flex:1}
.filters .search-field{flex:2;min-width:190px}
input,select,textarea{width:100%;padding:10px 11px;border:1px solid var(--meeting-border);border-radius:8px;background:var(--bg-primary,#fff);color:inherit;min-width:0;font-size:.88rem}
.table-heading,.meeting-row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(200px,1.8fr) minmax(140px,1.3fr) minmax(120px,1fr);gap:20px;align-items:center;padding:18px 24px}
.table-heading{font-size:.74rem;font-weight:600;color:var(--meeting-muted);background:var(--bg-alt,#f8fafb)}
.meeting-row{width:100%;border:0;border-top:1px solid var(--meeting-border);border-radius:0;text-align:left;font-weight:400}
.meeting-row>span{display:grid;gap:8px;min-width:0;overflow-wrap:anywhere}
.meeting-row strong{font-size:.88rem}
.date-cell>span,.title-cell>span:last-child,.participant-cell,.record-cell{font-size:.78rem;color:var(--meeting-muted)}
.type-badge,.status-badge{display:inline-block;width:fit-content;padding:5px 9px;border-radius:20px;font-size:.7rem;font-weight:600;background:#eaf3f1;color:#2b645b}
.type-badge{background:#eef0fa;color:#515c8b}
.open-record{display:flex;align-items:center;gap:6px;font-weight:700;color:var(--meeting-accent)}
.avatars{display:flex}
.avatar{display:inline-grid;place-items:center;flex-shrink:0;width:32px;height:32px;border-radius:50%;font-size:.72rem;background:#e9f0f3;color:#36596b;font-weight:700}
.avatars .avatar+.avatar{margin-left:-4px;border:2px solid white}
.empty-state{padding:36px 24px;text-align:center;color:var(--meeting-muted)}
.empty-state h3{margin:10px 0}
.load-more{padding:20px;text-align:center}
.admin-tabs,.tabs{display:flex;gap:6px;flex-wrap:wrap}
.admin-tabs{padding:0 24px 18px}
.admin-tabs button[aria-pressed=true],.tabs button[aria-pressed=true]{background:#eaf3f1;border-color:var(--meeting-accent);color:var(--meeting-accent)}
.meeting-detail{padding:24px}
.back-button{margin-bottom:24px}
.record-heading{padding-bottom:22px}
.record-heading h2{font-size:clamp(1.4rem,2.2vw,1.9rem);margin:10px 0}
.record-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));background:var(--bg-alt,#f7fafb);border:1px solid var(--meeting-border);border-radius:12px;margin-bottom:20px}
.record-facts>div{display:grid;gap:8px;padding:18px}
.record-facts span{font-size:.67rem;letter-spacing:.08em;color:var(--meeting-muted)}
.record-facts strong{font-size:.9rem}
.tabs{padding:0 0 18px;border-bottom:1px solid var(--meeting-border);margin-bottom:24px}
.tabs button{font-size:.8rem;padding:9px 12px}
.overview-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:24px}
.record-section{padding:20px;border:1px solid var(--meeting-border);border-radius:12px;margin-bottom:18px}
.attendance-list,.agenda-list,.activity-log{list-style:none;padding:0;margin:0}
.attendance-list>li{display:flex;align-items:center;gap:12px;padding:15px 0;border-bottom:1px solid var(--meeting-border);font-size:.88rem}
.attendance-list>li>div{display:grid;gap:6px}
.attendance-list>li span:not(.avatar){font-size:.78rem;color:var(--meeting-muted)}
.agenda-list li{padding:12px 0}
.record-section ul:not(.attendance-list):not(.agenda-list){padding-left:18px}
.record-section li{line-height:1.65}
.join-log{margin-top:20px;font-size:.85rem}
.join-log summary{cursor:pointer;font-weight:600}
.join-log p{margin:14px 0}
.activity-log>li{padding:20px 0;border-bottom:1px solid var(--meeting-border)}
.activity-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:.85rem;margin-bottom:10px}
.activity-meta time{color:var(--meeting-muted);font-size:.75rem}
.activity-log p,pre{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}
.activity-log small{color:var(--meeting-muted)}
pre{font:inherit;line-height:1.7;padding:20px;background:var(--bg-alt,#f7fafb);border-radius:12px}
.note-label{display:grid;gap:8px;font-size:.86rem;margin-top:18px}
.note-actions{display:flex;gap:12px;align-items:center;margin-top:14px;font-size:.85rem}
.privacy-note{padding:12px 16px;margin-bottom:18px;background:#f2edfb;color:#5a4780;border-radius:8px;font-size:.86rem}
.error{padding:14px 18px;background:#fff0ee;color:#a23628;border-radius:10px;margin:14px 0}
.summary-notice{font-size:.85rem;color:var(--meeting-muted);margin:14px 0}
.summary-content{line-height:1.7;overflow-wrap:anywhere}
.summary-content :deep(h2),.summary-content :deep(h1){font-size:1.2rem;margin:24px 0 10px;padding:12px 16px;background:var(--bg-secondary,#f1f5f9);border-radius:10px}
.summary-content :deep(h3){font-size:1rem;margin:18px 0 8px}
.summary-content :deep(li){margin:8px 0}
.summary-content :deep(p){margin:10px 0}

@media(max-width:1100px){.category-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.table-heading,.meeting-row{grid-template-columns:minmax(120px,1fr) minmax(200px,1.8fr) minmax(130px,1fr);gap:14px}
.table-heading>span:nth-child(3),.meeting-row>.participant-cell{display:none}
}
@media(max-width:640px){.my-meetings.embedded,.my-meetings{padding:12px}
.page-heading{margin-bottom:20px;gap:12px}
.category-grid{grid-template-columns:1fr;gap:9px;margin-bottom:20px}
.category-card{padding:14px}
.category-icon{width:40px;height:40px;border-radius:12px}
.category-copy{gap:4px}
.category-copy strong{font-size:.9rem}
.category-copy>span{font-size:.77rem}
.history-heading,.filters{padding:16px}
.filters label{flex-basis:40%;min-width:0}
.filters .search-field{flex-basis:100%;min-width:0}
.table-heading{display:none}
.meeting-row{grid-template-columns:1fr;padding:18px 16px;gap:12px}
.meeting-row>.participant-cell{display:flex;align-items:center;gap:10px}
.date-cell{font-size:.8rem}
.meeting-row>.date-cell,.meeting-row>.record-cell{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap}
.meeting-detail{padding:16px}
.overview-grid{grid-template-columns:1fr;gap:0}
.record-facts{grid-template-columns:1fr}
.record-facts>div{padding:12px 16px}
.record-section{padding:16px}
.tabs{gap:6px}
.tabs button{flex:1 0 auto}
.record-heading{gap:12px}
.admin-tabs{padding:0 16px 16px}
}

</style>
