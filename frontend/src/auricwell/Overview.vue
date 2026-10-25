<template>
  <section class="aw-overview" :aria-busy="loading" @click.capture="guardDemoTools">
    <div class="aw-overview-heading">
      <div><p class="aw-eyebrow">{{ agency.name }}</p><h1>{{ report ? 'My activity' : `${greeting}, ${actor.first_name || 'there'}.` }}</h1><p class="aw-subtitle">{{ report ? 'Your schedule and current work, scoped to this practice.' : "Here’s what’s happening in your practice today." }}</p></div>
      <div class="aw-date-control"><span>{{ dateLabel }}</span><label><PortalIcon name="sessions"/><select v-model="range" aria-label="Schedule date range"><option value="today">Today</option><option value="week">Next 7 days</option></select></label><small>{{ timezone }}</small></div>
    </div>
    <div class="aw-summary-grid">
      <RouterLink class="aw-summary-card" :to="`/${slug}/appointments`"><span class="aw-metric-icon"><PortalIcon name="sessions"/></span><div><strong>{{ metric('appointments',appointments.length) }}</strong><span>{{ range==='today'?'Appointments Today':'Appointments · Next 7 Days' }}</span><small>{{ errors.appointments ? 'Schedule could not load' : 'Your appointments in this practice' }}</small></div><span aria-hidden="true">›</span></RouterLink>
      <RouterLink class="aw-summary-card" :to="`/${slug}/clients`"><span class="aw-metric-icon"><PortalIcon name="people"/></span><div><strong>{{ metric('clients',clientTotal) }}</strong><span>Active Clients</span><small>Your assigned caseload</small></div><span aria-hidden="true">›</span></RouterLink>
      <RouterLink v-if="canDocument" class="aw-summary-card" :to="`/${slug}/documentation`"><span class="aw-metric-icon"><PortalIcon name="documents"/></span><div><strong>{{ metric('notes',notes.length)+(notes.length>=100?'+':'') }}</strong><span>Pending Note Drafts</span><small>Active drafts · last 30 days</small></div><span aria-hidden="true">›</span></RouterLink>
      <a class="aw-summary-card" :href="personalToolUrl(slug,'tasks')"><span class="aw-metric-icon"><PortalIcon name="tasks"/></span><div><strong>{{ metric('tasks',taskTotal) }}</strong><span>Open Tasks</span><small>{{ errors.tasks?'Tasks could not load':taskTotal>50?'First 50 tasks shown':`${overdueTasks} overdue` }}</small></div><span aria-hidden="true">›</span></a>
    </div>
    <div class="aw-dashboard-grid">
      <section class="aw-panel"><header><h2>{{ range==='today'?"Today’s Schedule":'Upcoming Schedule' }}</h2><RouterLink :to="`/${slug}/appointments`">View all appointments <span aria-hidden="true">→</span></RouterLink></header>
        <p v-if="loading" class="aw-empty" role="status">Loading schedule…</p><p v-else-if="errors.appointments" class="aw-empty aw-error" role="alert">{{ errors.appointments }}</p><div v-else-if="!appointments.length" class="aw-empty"><PortalIcon name="sessions"/><h3>No appointments scheduled</h3><p>Open your calendar to review or add availability.</p><a :href="personalToolUrl(slug,'schedule')">Manage my availability →</a></div>
        <div v-else class="aw-schedule-list"><a v-for="row in appointments.slice(0,5)" :key="row.id" class="aw-schedule-row" :href="scheduleUrl(row)"><span class="aw-timeline-dot"/><span class="aw-session-time"><strong>{{ time(row.startAt || row.start_at) }}</strong><small>{{ range==='week'?shortDate(row.startAt || row.start_at):duration(row) }}</small></span><span class="aw-row-main"><strong>{{ row.title || 'Client appointment' }}</strong><small>{{ row.serviceCode || row.service_code || 'Therapy session' }}{{ row.modality ? ` · ${row.modality==='VIRTUAL'?'Telehealth':'In person'}` : '' }}</small></span><span class="aw-badge" :class="{ 'aw-badge-active': appointmentState(row,now)==='In progress' }">{{ appointmentState(row,now) }}</span><span aria-hidden="true">›</span></a></div>
      </section>
      <section v-if="canDocument" class="aw-panel"><header><h2>Pending Notes &amp; Documentation</h2><RouterLink :to="`/${slug}/documentation`">View all notes <span aria-hidden="true">→</span></RouterLink></header>
        <p v-if="loading" class="aw-empty" role="status">Loading notes…</p><p v-else-if="errors.notes" class="aw-empty aw-error" role="alert">{{ errors.notes }}</p><div v-else-if="!notes.length" class="aw-empty"><PortalIcon name="documents"/><h3>No pending drafts</h3><p>Your saved draft notes will appear here.</p><RouterLink :to="`/${slug}/documentation`">Open Notes &amp; Documentation →</RouterLink></div>
        <RouterLink v-for="row in notes.slice(0,5)" v-else :key="row.id" class="aw-list-row" :to="{path:`/${slug}/documentation`,query:{draftId:String(row.id),...(row.client_id?{clientId:String(row.client_id)}:{})}}"><PortalIcon name="documents"/><span class="aw-row-main"><strong>{{ clientName(row) }}</strong><small>{{ row.title || row.note_type?.replaceAll('_',' ') || 'Note draft' }} · {{ shortDate(row.date_of_service || row.created_at) }}</small></span><span class="aw-badge aw-badge-warm">Draft</span><span aria-hidden="true">›</span></RouterLink>
      </section>
      <section class="aw-panel"><header><h2>Your Clients</h2><RouterLink :to="`/${slug}/clients`">View all clients <span aria-hidden="true">→</span></RouterLink></header>
        <p v-if="loading" class="aw-empty" role="status">Loading clients…</p><p v-else-if="errors.clients" class="aw-empty aw-error" role="alert">{{ errors.clients }}</p><div v-else-if="!clients.length" class="aw-empty"><PortalIcon name="people"/><h3>No active clients assigned</h3><p>Clients assigned to you will appear here.</p></div>
        <RouterLink v-for="row in clients.slice(0,5)" v-else :key="row.id" class="aw-list-row" :to="{path:`/${slug}/clients`,query:{clientId:String(row.id)}}"><span class="aw-avatar">{{ initials(clientName(row)) }}</span><span class="aw-row-main"><strong>{{ clientName(row) }}</strong><small>{{ row.status || 'Active' }}{{ row.preferred_language?` · ${row.preferred_language}`:'' }}</small></span><span class="aw-list-action">Open chart</span><span aria-hidden="true">›</span></RouterLink>
      </section>
      <section class="aw-panel"><header><h2>Tasks &amp; Follow-ups</h2><a :href="personalToolUrl(slug,'tasks')">View all tasks <span aria-hidden="true">→</span></a></header>
        <p v-if="loading" class="aw-empty" role="status">Loading tasks…</p><p v-else-if="errors.tasks" class="aw-empty aw-error" role="alert">{{ errors.tasks }}</p><div v-else-if="!tasks.length" class="aw-empty"><PortalIcon name="tasks"/><h3>You’re up to date</h3><p>No open tasks assigned in this practice.</p></div>
        <a v-for="row in tasks.slice(0,5)" v-else :key="row.id" class="aw-list-row" :href="personalToolUrl(slug,'tasks')"><PortalIcon name="tasks"/><span class="aw-row-main"><strong>{{ row.title || row.name || 'Assigned task' }}</strong><small>{{ row.task_list_name || row.task_type?.replaceAll('_',' ') || 'Follow-up' }}</small></span><span class="aw-due" :class="{'aw-overdue':isOverdue(row)}">{{ row.due_date?`Due ${shortDate(row.due_date)}`:'No due date' }}</span><span aria-hidden="true">›</span></a>
      </section>
    </div>
    <footer class="aw-dashboard-footer"><span>{{ loading?'Refreshing…':`Updated ${updatedAt || '—'}` }} · {{ timezone }}</span><button :disabled="loading" @click="load">Refresh dashboard</button></footer>
  </section>
</template>
<script setup>
import { ref,computed,watch,onBeforeUnmount } from 'vue';
import api from '../services/api';
import PortalIcon from '../components/portal/PortalIcon.vue';
import { personalToolUrl,dayKey,shiftDay,rowsOf,clientName,initials,pendingDrafts,appointmentState } from './workspace';
const props=defineProps({agency:Object,actor:Object,slug:String,canDocument:Boolean,report:Boolean,demo:Boolean});
function guardDemoTools(event){if(props.demo&&event.target.closest('a')?.getAttribute('href')?.startsWith(`/${props.slug}/`)){event.preventDefault();event.stopPropagation();window.dispatchEvent(new CustomEvent('aw-demo-notice',{detail:'Personal account tools are not connected in the fictional demo.'}));}}
const range=ref('today'),loading=ref(true),errors=ref({}),appointments=ref([]),clients=ref([]),clientTotal=ref(0),notes=ref([]),tasks=ref([]),taskTotal=ref(0),now=ref(Date.now()),updatedAt=ref('');let sequence=0;
const timezone=computed(()=>props.actor.timezone||props.agency.timezone||'America/Denver');
const today=computed(()=>dayKey(now.value,timezone.value));
const greeting=computed(()=>{const h=Number(new Intl.DateTimeFormat('en-US',{timeZone:timezone.value,hour:'numeric',hourCycle:'h23'}).format(now.value));return h<12?'Good morning':h<18?'Good afternoon':'Good evening';});
const dateLabel=computed(()=>new Intl.DateTimeFormat('en-US',{timeZone:timezone.value,weekday:'long',month:'short',day:'numeric',year:'numeric'}).format(now.value));
const formatDate=(value,options)=>{if(!value)return 'Date not recorded';const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value))?`${value}T12:00:00Z`:value);return Number.isNaN(d.getTime())?'Date not recorded':new Intl.DateTimeFormat('en-US',{timeZone:timezone.value,...options}).format(d);};
const time=value=>formatDate(value,{hour:'numeric',minute:'2-digit'}),shortDate=value=>formatDate(value,{month:'short',day:'numeric'});
const duration=row=>{const minutes=Math.round((new Date(row.endAt||row.end_at)-new Date(row.startAt||row.start_at))/60000);return minutes>0?`${minutes} min`:'Duration not recorded';};
const isOverdue=row=>row.due_date && String(row.due_date).slice(0,10)<today.value;
const overdueTasks=computed(()=>tasks.value.filter(isOverdue).length);
const metric=(key,value)=>loading.value?'—':errors.value[key]?'—':value;
const scheduleUrl=row=>`${personalToolUrl(props.slug,'schedule')}?date=${encodeURIComponent(dayKey(row.startAt||row.start_at,timezone.value))}`;
async function load(){
 const id=++sequence;loading.value=true;errors.value={};appointments.value=[];clients.value=[];notes.value=[];tasks.value=[];clientTotal.value=0;taskTotal.value=0;
 const start=today.value,end=shiftDay(start,range.value==='week'?7:1),params={agencyId:props.agency.id};
 const requests=[['appointments',()=>api.get('/appointments',{params:{...params,providerId:props.actor.id,windowStart:shiftDay(start,-1),windowEnd:shiftDay(end,1)}})],['clients',()=>api.get('/clients',{params:{...params,agency_id:props.agency.id,provider_id:props.actor.id,status:'ACTIVE',paginate:1,page:1,per_page:5}})],['tasks',()=>api.get('/auricwell-preview/tasks')]];
 if(props.canDocument)requests.push(['notes',()=>api.get('/clinical-notes/recent',{params:{...params,archiveStatus:'active'}})]);
 const results=await Promise.allSettled(requests.map(([,get])=>get()));if(id!==sequence)return;
 results.forEach((result,index)=>{const key=requests[index][0];if(result.status==='rejected'){errors.value[key]=result.reason?.response?.status===403?'This information is not available to your account.':`Could not load ${key}. Try refreshing.`;return;}const data=result.value.data;
 if(key==='appointments')appointments.value=rowsOf(data,'appointments').filter(row=>{const day=dayKey(row.startAt||row.start_at,timezone.value);return day>=start&&day<end&&!/cancel|void|rescheduled/.test(String(row.status));}).sort((a,b)=>new Date(a.startAt||a.start_at)-new Date(b.startAt||b.start_at));
 if(key==='clients'){clients.value=rowsOf(data,'clients');clientTotal.value=Number(data.total??clients.value.length);}
 if(key==='notes')notes.value=pendingDrafts(data);
 if(key==='tasks'){tasks.value=rowsOf(data,'tasks').filter(row=>!['completed','overridden','archived'].includes(row.status));taskTotal.value=Number(data.total??tasks.value.length);}
 });loading.value=false;updatedAt.value=time(Date.now());
}
watch(()=>[props.agency.id,props.actor.id,range.value,today.value],load,{immediate:true});
const timer=setInterval(()=>now.value=Date.now(),60000);onBeforeUnmount(()=>{sequence++;clearInterval(timer);});
</script>
