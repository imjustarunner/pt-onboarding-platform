<template>
  <section class="dashboard-meetings" aria-label="Upcoming meetings">
    <RouterLink class="office-button" :to="`${route.params.organizationSlug ? `/${route.params.organizationSlug}` : ''}/my-virtual-office`" title="Your permanent private office link. Every guest supplies a snapshot and waits for your individual admission. Premium: one guest. Premium Plus: couples and families." @click="notifyNavigation">My virtual office ↗</RouterLink>
    <h2>Your meetings</h2>
    <RouterLink :to="{ path: `${route.params.organizationSlug ? `/${route.params.organizationSlug}` : ''}/my-meetings`, query: {} }" @click="notifyNavigation">My meetings · attended meetings and notes</RouterLink>
    <article v-for="meeting in meetings.slice(0, 4)" :key="meeting.key" :class="{ ready: canJoin(meeting) }">
      <div><strong>{{ meeting.title }}</strong><p>{{ formatTime(meeting.start) }} · {{ meeting.end <= now ? 'Ended' : meeting.start <= now ? 'In progress' : 'Upcoming' }}</p></div>
      <button v-if="inspectInPlace" type="button" class="meeting-details" @click="emit('inspect', { ...meeting, to: scheduleLink(meeting) })">
        <CalendarDays :size="16" aria-hidden="true" /> Details <ChevronRight :size="16" aria-hidden="true" />
      </button>
      <a v-else-if="canJoin(meeting)" :href="meeting.url" class="meeting-join" @click="notifyNavigation">Join meeting</a>
      <RouterLink v-else :to="scheduleLink(meeting)" class="meeting-details" @click="notifyNavigation"><CalendarDays :size="16" aria-hidden="true" /> Details <ChevronRight :size="16" aria-hidden="true" /></RouterLink>
    </article>
  </section>
</template>
<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { parseScheduleUtcInstant } from '../../utils/scheduleEventInstants.js';
import { CalendarDays, ChevronRight } from '@lucide/vue';
const emit = defineEmits(['navigate', 'inspect']);
const props = defineProps({ includeAllAgencies: { type: Boolean, default: true }, inspectInPlace: { type: Boolean, default: false } });
function notifyNavigation(event) {
  // RouterLink already prevents the native click's default action. Notify the
  // enclosing briefing on same-tab navigation, including a repeated route.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
  emit('navigate');
}
const auth=useAuthStore(), agencies=useAgencyStore(), route=useRoute(), rows=ref([]), now=ref(Date.now());
let timer;
const meetings=computed(()=>rows.value.filter(m=>m.end>now.value).sort((a,b)=>a.start-b.start));
const canJoin=m=>m.url && m.start-now.value<=300000 && now.value<m.end;
const formatTime=ms=>new Date(ms).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
function scheduleLink(m){return {path:`${route.params.organizationSlug?`/${route.params.organizationSlug}`:''}/my-schedule`,query:{eventId:m.id,eventKind:m.kind,weekStart:m.weekStart}};}
async function load(){try{const userId=auth.user?.id;if(!userId)return;const agencyId=agencies.currentAgency?.id||agencies.userAgencies?.[0]?.id||agencies.agencies?.[0]?.id;if(!agencyId)return;
 const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));const ymd=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const {data}=await api.get(`/users/${userId}/schedule-summary`,{params:{agencyId,weekStart:ymd,includeAllAgencies:props.includeAllAgencies?1:0,skipOfficeMaterialize:true,includeGoogleBusy:false},skipGlobalLoading:true});
 rows.value=[...(data.scheduleEvents||[]),...(data.supervisionSessions||[]).map(e=>({...e,kind:'SUPERVISION'}))].filter(e=>!e.meetingCompletedAt&&!e.liveEndedAt&&!['CANCELLED','CANCELED'].includes(String(e.status||'').toUpperCase())).map(e=>({...e,key:`${e.kind}:${e.id}`,id:e.id,kind:e.kind,title:e.title||'Supervision',start:parseScheduleUtcInstant(e.startAt)?.getTime(),end:parseScheduleUtcInstant(e.endAt)?.getTime(),url:e.appJoinUrl||e.participantJoinUrl||e.joinUrl||e.meetLink||e.googleMeetLink||'',weekStart:ymd})).filter(e=>e.start&&e.end&&(['TEAM_MEETING','HUDDLE','SUPERVISION'].includes(e.kind)||e.url));
}catch{rows.value=[];}}
onMounted(()=>{void load();timer=setInterval(()=>{now.value=Date.now();void load();},30000);});onUnmounted(()=>clearInterval(timer));
</script>
<style scoped>
.meeting-details { display:inline-flex; align-items:center; justify-content:center; gap:8px; flex-shrink:0; min-height:40px; padding:8px 12px; border:1px solid var(--border, #b4d5cb); border-radius:6px; background:var(--bg-card, #fff); color:var(--text-primary, #173f39); font:inherit; font-weight:600; text-decoration:none; cursor:pointer; }
.meeting-details:hover { border-color:currentColor; }
.meeting-details:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
[data-theme="dark"] .dashboard-meetings { background:var(--bg-card); color:var(--text-primary); border-color:var(--border); }
[data-theme="dark"] .dashboard-meetings article.ready { background:var(--bg-alt); }
.office-button{display:block;padding:14px;margin-bottom:16px;background:#245b44;color:#fff;border-radius:10px;font-weight:700;text-decoration:none}
.dashboard-meetings{padding:16px;border:1px solid #b4d5cb;border-radius:12px;margin:12px 0;background:#f6fcf9;color:#173f39}.dashboard-meetings h2{font-size:1.1rem;margin:0 0 10px;color:inherit}.dashboard-meetings article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px;border-radius:9px}.dashboard-meetings article.ready{background:#d9f5e7;border:2px solid #2d6a50}.dashboard-meetings p{margin:5px 0;font-size:.85rem}.meeting-join{display:inline-flex;padding:14px 24px;border-radius:8px;background:#245b44;color:white;font-size:1.05rem;font-weight:800;white-space:nowrap}@media(max-width:600px){.dashboard-meetings article{flex-wrap:wrap}.meeting-join{width:100%;justify-content:center}}
</style>
