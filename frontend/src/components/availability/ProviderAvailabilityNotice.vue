<template>
 <aside v-if="reminders.length" class="opening-notice" aria-label="Availability reminders">
  <header class="opening-heading"><strong>{{groups.length===1 ? groups[0].agencyName+' · ' : ''}}New-client availability</strong>
   <button type="button" :aria-expanded="!collapsed" aria-controls="availability-notice-content" @click="toggleCollapsed">{{collapsed ? 'Expand' : 'Collapse'}}</button>
  </header>
  <div v-show="!collapsed" id="availability-notice-content">
  <section v-for="group in groups" :key="group.agencyId" class="opening-agency">
   <strong>{{group.agencyName}}: no bookable {{group.formats}} new-client openings found in the next four schedule weeks.</strong>
   <p>Typical availability and pending room requests do not publish appointment openings. For in-person openings, reserve a room, then offer that reserved hour in Set Availability.</p>
   <div class="opening-actions">
    <router-link :to="{path:'/dashboard',query:{tab:'my',my:'availability',agencyId:group.agencyId}}">Review availability</router-link>
    <template v-for="r in group.reminders" :key="r.format">
     <button type="button" :disabled="busy" @click="enableWaitlist(r)">Enable {{r.format==='IN_PERSON'?'in-person':'virtual'}} waitlist</button>
     <button type="button" :disabled="busy" @click="snooze(r)">{{group.reminders.length>1 ? `Snooze ${r.format==='IN_PERSON'?'in-person':'virtual'} 7 days` : 'Snooze 7 days'}}</button>
     <small v-if="detailsOpen && r.checkedAt">Last checked {{new Date(r.checkedAt).toLocaleString()}}.</small>
    </template>
   </div>
  </section>
  <button type="button" :aria-expanded="detailsOpen" aria-controls="availability-reminder-details" @click="detailsOpen=!detailsOpen">{{detailsOpen ? 'Hide details' : 'Why am I seeing this?'}}</button>
  <div v-if="detailsOpen" id="availability-reminder-details" class="opening-details">
  <p>Publishing a new-client opening switches that format from Waitlist to Open.</p>
  <p>Typical availability and pending room requests do not publish openings. In-person openings need a future room reservation that you have chosen to offer to new clients.</p>
  <p>Published hours may still be occupied by appointments, school assignments, or schedule blocks.</p>
  </div>
  <p v-if="error" role="alert">{{error}}</p>
  </div>
 </aside>
</template>
<script setup>
import {canPollWorkspace,useSessionPolling} from '../../composables/useSessionPolling';
import {computed,ref,watch,onMounted,onUnmounted} from 'vue';
import api from '../../services/api';
const props=defineProps({userId:[Number,String]});
const collapsed=ref(false);
watch(()=>props.userId,id=>{try{collapsed.value=Boolean(id)&&localStorage.getItem(`pt.availabilityNotice.collapsed:${id}`)==='1';}catch{collapsed.value=false;}},{immediate:true});
function toggleCollapsed(){collapsed.value=!collapsed.value;try{if(props.userId)localStorage.setItem(`pt.availabilityNotice.collapsed:${props.userId}`,collapsed.value?'1':'0');}catch{/* This view still collapses. */}}
const reminders=ref([]),busy=ref(false),error=ref(''),detailsOpen=ref(false);let timer,active=true,pending;
const groups=computed(()=>{
 const byAgency=new Map();
 for(const r of reminders.value){if(!byAgency.has(r.agencyId))byAgency.set(r.agencyId,{agencyId:r.agencyId,agencyName:r.agencyName,reminders:[]});byAgency.get(r.agencyId).reminders.push(r);}
 return [...byAgency.values()].map(group=>({...group,formats:group.reminders.map(r=>r.format==='IN_PERSON'?'in-person':'virtual').join(' and ')}));
});
function load(){
 if (!canPollWorkspace()) return;
 if(pending)return pending;
 pending=(async()=>{try{const{data}=await api.get('/availability/me/opening-reminders',{skipGlobalLoading:true,skipAuthRedirect:true});if(active)reminders.value=data.reminders||[];}catch{if(active)reminders.value=[];}finally{pending=null;}})();
 return pending;
}
async function enableWaitlist(r){busy.value=true;error.value='';try{await api.post(`/availability/providers/${r.providerId}/public-settings/waitlist`,{agencyId:r.agencyId,format:r.format},{skipGlobalLoading:true});await load();}catch(e){error.value=e.response?.data?.error?.message||'Could not enable the waitlist. Please try again.';}finally{busy.value=false;}}
async function snooze(r){busy.value=true;error.value='';try{await api.post(`/availability/providers/${r.providerId}/public-settings/snooze`,{agencyId:r.agencyId,format:r.format},{skipGlobalLoading:true});await load();}catch{error.value='Could not snooze this reminder. Please try again.';}finally{busy.value=false;}}
useSessionPolling(load);
onMounted(()=>{load();timer=setInterval(load,60000);window.addEventListener('focus',load);});onUnmounted(()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);});
</script>
<style scoped>
.opening-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}.opening-notice{padding:18px 20px;margin:12px 20px 18px;border:1px solid #c89934;background:#fff7df;color:#563c12;border-radius:12px;font:inherit;line-height:1.6}
.opening-agency+.opening-agency{border-top:1px solid #e5d3a3;margin-top:14px;padding-top:14px}
.opening-notice strong{display:block}.opening-notice p{margin:8px 0}.opening-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}
.opening-notice a{color:#365b35;text-decoration:underline;font-weight:600}.opening-notice button{border:1px solid #947e40;border-radius:6px;background:#fff;color:#563c12;padding:9px 14px;font:inherit;cursor:pointer}.opening-notice button:disabled{opacity:.6;cursor:wait}.opening-notice :focus-visible{outline:3px solid #365b35;outline-offset:3px}
</style>
