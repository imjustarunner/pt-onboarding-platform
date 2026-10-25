<template>
  <section class="ehr-overview" aria-label="Practice overview">
    <header class="ehr-heading"><div><p>{{ practice.name }}</p><h1>{{ greeting }}, {{ account.name?.split(' ')[0] || 'there' }}.</h1><p>Here’s what’s happening in your practice today.</p></div><span>{{ dateLabel }}<small>{{ timezone }}</small></span></header>
    <div class="ehr-metrics">
      <button v-for="key in metricKeys" :key="key" type="button" class="ehr-metric" :class="{'is-collapsed':isCollapsed(key)}" :aria-label="isCollapsed(key)?`Expand ${labels[key]}`:undefined" @click="isCollapsed(key)?setCollapsed(key,false):openCard(key)">
        <PortalIcon :name="icons[key]"/><span><strong>{{ counts[key] }}</strong><span>{{ metricLabels[key] }}</span><small>{{ isCollapsed(key)?'Expand card ↗':metricDescriptions[key] }}</small></span><span aria-hidden="true">›</span>
      </button>
    </div>
    <DashboardCardEditor :layout="layout" :card-keys="availableKeys" :labels="labels" :hidden="hiddenCards" @toggle="toggleCard" @reset="resetCards" />
    <div class="ehr-cards">
      <DashboardOverviewSection v-for="key in availableKeys.filter(id=>!hiddenCards.includes(id))" :key="key" v-show="!collapsedCards.includes(key)" :style="layout.orderStyle(key)" :label="labels[key]" :section-id="`ehr-${key}`" @collapse="setCollapsed(key,true)">
        <article class="ehr-card"><header><h2>{{ labels[key] }}</h2><button v-if="key!=='followups'" type="button" @click="openCard(key)">View all →</button></header>
          <div v-if="rows[key].length" class="ehr-scroll" tabindex="0" role="region" :aria-label="labels[key]">
            <button v-for="row in rows[key]" :key="row.id" type="button" class="ehr-row" @click="openRow(key,row)">
              <span v-if="key==='schedule'" class="ehr-time">{{ format(row.data.start,{hour:'numeric',minute:'2-digit'}) }}</span>
              <PortalIcon v-else :name="icons[key]"/>
              <span class="ehr-row-copy"><strong>{{ rowLabel(key,row) }}</strong><small>{{ rowDescription(key,row) }}</small></span>
              <span class="ehr-status">{{ key==='notes'?'Draft':key==='clients'?row.data.status:key==='schedule'?row.data.status:'Open' }}</span><span aria-hidden="true">›</span>
            </button>
          </div>
          <p v-else class="ehr-empty">{{ emptyLabels[key] }}</p>
        </article>
      </DashboardOverviewSection>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, onBeforeUnmount } from 'vue';
import DashboardOverviewSection from '../components/dashboard/DashboardOverviewSection.vue';
import DashboardCardEditor from '../components/dashboard/DashboardCardEditor.vue';
import PortalIcon from '../components/portal/PortalIcon.vue';
import { useDashboardLayout } from '../composables/useDashboardLayout.js';
import { useDashboardCardState } from '../composables/useDashboardCardState.js';
import { dayKey } from './workspace.js';
const props=defineProps({account:Object,practice:Object,data:Object,navigation:Array,notifications:{type:Array,default:()=>[]}});
const emit=defineEmits(['navigate']);
const labels={schedule:'Today’s Schedule',notes:'Pending Notes & Documentation',clients:'Your Clients',followups:'Practice Follow-ups'};
const icons={schedule:'sessions',notes:'documents',clients:'people',followups:'tasks'};
const sections={schedule:'schedule',notes:'documentation',clients:'clients'};
const scope={userId:computed(()=>props.account.id),agencyId:computed(()=>props.practice.id||props.practice.slug)};
const layout=useDashboardLayout({kind:'auricwell-practice-overview',...scope,defaultOrder:Object.keys(labels)});
const {collapsedCards,hiddenCards,setCollapsed,toggleCard,resetCards}=useDashboardCardState({kind:'auricwell-practice-overview',...scope,cardIds:Object.keys(labels)});
const allowed=computed(()=>props.navigation.map(item=>item.key));
const availableKeys=computed(()=>layout.order.value.filter(key=>key==='followups'||allowed.value.includes(sections[key])));
const metricKeys=computed(()=>['schedule','clients','notes','followups'].filter(key=>availableKeys.value.includes(key)));
const isCollapsed=key=>collapsedCards.value.includes(key)&&!hiddenCards.value.includes(key);
const now=ref(Date.now()),timezone=computed(()=>props.practice.timezone||'America/Denver');
const format=(date,options)=>{const value=new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(date))?`${date}T12:00:00Z`:date);return Number.isNaN(value.getTime())?'Date not recorded':new Intl.DateTimeFormat('en-US',{timeZone:timezone.value,...options}).format(value);};
const dateLabel=computed(()=>format(now.value,{weekday:'long',month:'short',day:'numeric',year:'numeric'}));
const greeting=computed(()=>{const hour=Number(format(now.value,{hour:'numeric',hourCycle:'h23'}));return hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';});
const rows=computed(()=>({
  schedule:(props.data.appointments||[]).filter(row=>dayKey(row.data.start,timezone.value)===dayKey(now.value,timezone.value)&&!/cancel|void|rescheduled/i.test(row.data.status)).sort((a,b)=>new Date(a.data.start)-new Date(b.data.start)),
  notes:(props.data.notes||[]).filter(row=>row.data.status==='draft'),
  clients:(props.data.patients||[]).filter(row=>String(row.data.status).toLowerCase()==='active'),
  followups:props.notifications.filter(row=>allowed.value.includes(row.section)).map((row,index)=>({...row,id:row.id||`${row.section}-${index}`}))
}));
const counts=computed(()=>Object.fromEntries(Object.entries(rows.value).map(([key,items])=>[key,items.length])));
const metricLabels={schedule:'Appointments Today',notes:'Pending Note Drafts',clients:'Active Clients',followups:'Practice Follow-ups'};
const metricDescriptions={schedule:'Your practice schedule',notes:'Drafts awaiting completion',clients:'Within your practice access',followups:'Updates needing your attention'};
const emptyLabels={schedule:'No appointments scheduled today.',notes:'No pending drafts.',clients:'No active clients available.',followups:'You’re up to date. No practice follow-ups.'};
const patientName=id=>(props.data.patients||[]).find(row=>row.id===id)?.data.name||'Client';
function rowLabel(key,row){return key==='clients'?row.data.name:key==='followups'?row.title:patientName(row.patientId);}
function rowDescription(key,row){return key==='schedule'?row.data.serviceCode||'Appointment':key==='notes'?`${row.data.title||'Note draft'} · ${format(row.data.serviceDate,{month:'short',day:'numeric'})}`:key==='clients'?'Open chart':row.message||'Review practice update';}
function openCard(key){
  if(key==='followups'){setCollapsed(key,false);if(hiddenCards.value.includes(key))toggleCard(key);return;}
  emit('navigate',{section:sections[key]});
}
function openRow(key,row){emit('navigate',{section:key==='followups'?row.section:sections[key],...(key==='clients'?{patientId:row.id}:{}),...(key==='notes'?{note:row}:{})});}
const timer=setInterval(()=>now.value=Date.now(),60000);onBeforeUnmount(()=>clearInterval(timer));
</script>
<style scoped>
.ehr-overview { container-type:inline-size; color:#122b49; --primary:#2467a7; --bg-card:#fff; --border:#e2eaf3; --text-primary:#122b49; --text-secondary:#526986; }
.ehr-heading { display:flex; gap:20px; justify-content:space-between; align-items:flex-start; margin-bottom:24px; }
.ehr-heading h1 { font-size:32px; color:#0b2039; margin:5px 0 8px; line-height:1.2; }
.ehr-heading p { margin:0; color:#526986; }
.ehr-heading>span { font-size:13px; text-align:right; }
.ehr-heading small { display:block; margin-top:5px; }
.ehr-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin-bottom:20px; }
.ehr-metric { display:flex; gap:12px; align-items:flex-start; padding:20px 16px; border:1px solid #e2eaf3; border-radius:10px; background:white; color:inherit; text-align:left; font:inherit; min-width:0; cursor:pointer; }
.ehr-metric>svg { width:26px; height:26px; color:#0864cc; flex:none; }
.ehr-metric>span:first-of-type { display:flex; flex:1; flex-direction:column; min-width:0; gap:4px; overflow-wrap:anywhere; }
.ehr-metric strong { font-size:28px; line-height:1.15; }
.ehr-metric small { color:#526986; font-size:11px; }
.ehr-metric.is-collapsed { border-color:#80addd; background:#f3f8ff; }
.ehr-cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
.ehr-card { background:#fff; border:1px solid #e2eaf3; border-radius:10px; padding:0 16px; min-width:0; flex:1; }
.ehr-card>header { display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap; border-bottom:1px solid #edf1f6; padding:14px 0; }
.ehr-card h2 { color:#122b49; font-size:17px; margin:0; }
.ehr-card>header button { color:#0864cc; background:transparent; border:0; padding:0; font-size:12px; cursor:pointer; }
.ehr-scroll { max-height:320px; overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable; }
.ehr-row { display:flex; align-items:center; width:100%; min-height:64px; gap:12px; padding:12px 0; border:0; border-bottom:1px solid #edf1f6; border-radius:0; background:white; color:#233b57; text-align:left; font:inherit; cursor:pointer; }
.ehr-row:hover { background:#f8fbff; }
.ehr-row>svg { width:22px; height:22px; flex:none; color:#647c99; }
.ehr-row-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:3px; overflow-wrap:anywhere; }
.ehr-row strong { font-size:13px; }
.ehr-row small { font-size:11px; color:#637995; }
.ehr-time { width:70px; flex:none; font-size:12px; }
.ehr-status { font-size:11px; color:#526986; overflow-wrap:anywhere; max-width:80px; }
.ehr-empty { min-height:220px; display:grid; place-items:center; color:#637995; font-size:13px; text-align:center; }
.ehr-overview button:focus-visible,.ehr-scroll:focus-visible { outline:2px solid #2467a7; outline-offset:-2px; }
@container (max-width:1000px) { .ehr-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@container (max-width:800px) { .ehr-row { flex-wrap:wrap; gap:7px; }.ehr-row-copy { min-width:120px; }.ehr-status { max-width:none; }.ehr-heading { flex-wrap:wrap; }.ehr-heading>span { text-align:left; } }
@container (max-width:580px) { .ehr-cards { grid-template-columns:minmax(0,1fr); }.ehr-heading h1 { font-size:27px; }.ehr-metric { padding:14px 10px; gap:8px; font-size:12px; } }
</style>
