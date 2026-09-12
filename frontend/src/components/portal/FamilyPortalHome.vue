<template>
  <div class="portal-home">
    <div class="home-columns">
      <section class="home-card plan-card">
        <div class="home-card-head"><h2>{{ learning ? 'Learning plan' : 'Your care plan' }}</h2><PortalIcon name="plan" /></div>
        <GuardianPlanProgressPanel compact v-if="showPlan && clientId" :client-id="clientId" :agency-id="agencyId" :client-type="learning ? 'learning' : 'clinical'" />
        <div v-else class="home-empty"><PortalIcon name="shield" /><h3>Your access, thoughtfully protected</h3><p>Care information appears here when your relationship has permission to view it. Contact the care team to review access.</p><button @click="$emit('navigate','messages')">Contact your team <span aria-hidden="true">→</span></button></div>
        <button v-if="showPlan && clientId" class="home-link" @click="$emit('navigate','plan')">View full plan →</button>
      </section>
      <div class="home-stack">
        <section class="home-card"><div class="home-card-head"><h2>Programs &amp; sessions</h2><PortalIcon name="sessions" /></div>
          <button v-for="event in events.slice(0,3)" :key="event.key" class="home-event" @click="$emit('event',event)"><span class="home-icon"><PortalIcon name="sessions" /></span><span><strong>{{ event.title }}</strong><small>{{ event.metaPrimary }}</small><small>{{ event.metaSecondary }}</small></span><span aria-hidden="true">→</span></button>
          <p v-if="!events.length" class="home-muted">No shared program sessions to display.</p>
          <button class="home-link" @click="$emit('navigate','registrations')">Explore available registrations →</button>
        </section>
        <section class="home-card"><div class="home-card-head"><h2>Your tasks</h2><button class="home-link" @click="$emit('navigate','documents')">Documents →</button></div>
          <p v-if="loading" role="status">Loading payment tasks…</p><p v-if="error" role="alert">{{ error }} <button class="home-link" @click="load">Retry</button></p>
          <router-link v-for="task in tasks" :key="task.id" class="home-event" :to="{path:'/billing/complete',query:{task:task.id,agencyId}}"><span class="home-icon"><PortalIcon name="tasks" /></span><span><strong>{{ task.title }}</strong><small>Complete payment verification and authorization</small></span><span class="home-pill">To do</span></router-link>
          <p v-if="!loading && !error && !tasks.length" class="home-muted">No pending payment setup tasks. Check Documents for forms and signatures.</p>
        </section>
      </div>
    </div>
    <div class="home-bottom">
      <section class="home-card"><div class="home-card-head"><h2>Secure messages</h2><PortalIcon name="messages" /></div><p class="home-muted">Stay in touch with your team in your private portal.</p><button class="home-link" @click="$emit('navigate','messages')">Open your conversations →</button></section>
      <section class="home-card"><div class="home-card-head"><h2>Your programs</h2><PortalIcon name="child" /></div><button v-for="program in programs" :key="program.id" class="home-program" @click="$emit('program',program)">{{ program.name }} <span aria-hidden="true">→</span></button><p v-if="!programs.length" class="home-muted">Your linked programs will appear here.</p></section>
      <section class="home-card"><div class="home-card-head"><h2>Invoices &amp; receipts</h2><PortalIcon name="billing" /></div><p class="home-muted">View your assigned balances, payment plans, and downloadable receipts.</p><button class="home-link" @click="$emit('navigate','billing')">Open billing &amp; receipts →</button></section>
    </div>
  </div>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import PortalIcon from './PortalIcon.vue';
import GuardianPlanProgressPanel from '../guardian/GuardianPlanProgressPanel.vue';
const props=defineProps({agencyId:[Number,String],clientId:[Number,String],showPlan:Boolean,learning:Boolean,preview:Boolean,events:{type:Array,default:()=>[]},programs:{type:Array,default:()=>[]}});
defineEmits(['navigate','event','program']);
const tasks=ref([]),loading=ref(false),error=ref('');let sequence=0;
async function load(){const request=++sequence;tasks.value=[];error.value='';loading.value=false;if(!props.agencyId||props.preview)return;loading.value=true;try{const {data}=await api.get('/family-billing/tasks',{params:{agencyId:props.agencyId,clientId:props.clientId||undefined}});if(request===sequence)tasks.value=(data.tasks||[]).filter(t=>t.status==='pending');}catch{if(request===sequence)error.value='Payment tasks could not be loaded.';}finally{if(request===sequence)loading.value=false;}}
watch(()=>[props.agencyId,props.clientId,props.preview],load,{immediate:true});
</script>
<style scoped>
.portal-home{display:grid;gap:20px}.home-columns{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);gap:20px;align-items:start}.home-stack{display:grid;gap:20px}.home-bottom{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.home-card{background:#fff;border:1px solid #e2eaf4;border-radius:12px;padding:22px;box-shadow:0 3px 14px #193e7310;min-width:0}.home-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.home-card h2{font-size:18px;letter-spacing:-.3px;line-height:1.3;margin:0;color:#14294b}.home-card svg{width:24px;height:24px;color:var(--portal-accent)}.home-muted,.home-empty p{color:#536680;font-size:14px;line-height:1.65}.home-link,.home-empty button{background:transparent;color:var(--portal-accent);border:0;padding:8px 0;cursor:pointer;font:inherit;text-align:left}.home-event{display:flex;align-items:center;gap:13px;width:100%;padding:16px 0;border:0;border-top:1px solid #e6edf5;background:white;color:#233653;text-align:left;cursor:pointer;text-decoration:none;font:inherit}.home-event>span:nth-child(2){flex:1;min-width:0}.home-event small{display:block;font-size:12px;color:#596c89;margin-top:3px}.home-event strong{font-size:14px;overflow-wrap:anywhere}.home-icon{display:grid;place-items:center;width:44px;height:48px;border-radius:9px;background:var(--portal-tint);flex-shrink:0}.home-pill{font-size:11px;color:#795719;background:#fff3d9;border-radius:7px;padding:4px 9px;white-space:nowrap}.home-program{display:flex;justify-content:space-between;gap:12px;background:white;width:100%;border:0;border-top:1px solid #e6edf5;color:#253c5f;text-align:left;padding:11px 0;font:inherit;cursor:pointer}.home-empty{padding:25px 4px}.home-empty>svg{width:45px;height:45px;background:var(--portal-tint);padding:10px;box-sizing:content-box;border-radius:50%}.home-empty h3{font-size:19px;margin:18px 0 6px}.plan-card :deep(.gpp){margin:0;padding:0;border:0}.plan-card :deep(.gpp-head){display:none}
@media(max-width:1150px){.home-bottom{grid-template-columns:1fr 1fr}.home-bottom>:last-child{grid-column:1/-1}}@media(max-width:950px){.home-columns{grid-template-columns:1fr}.home-stack{order:-1}}@media(max-width:600px){.home-bottom{grid-template-columns:1fr}.home-card{padding:18px}.home-card h2{font-size:17px}}
</style>
