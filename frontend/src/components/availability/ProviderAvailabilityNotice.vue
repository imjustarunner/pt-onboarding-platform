<template>
 <aside v-if="reminders.length" class="opening-notice" aria-label="Availability reminders">
  <div v-for="r in reminders" :key="`${r.agencyId}-${r.format}`">
   <span>{{r.agencyName}}: no bookable {{r.format==='IN_PERSON'?'in-person':'virtual'}} new-client openings found in the next four schedule weeks.</span>
   <router-link :to="{path:`/admin/users/${r.providerId}`,query:{agencyId:r.agencyId,section:'public-profile'}}">Review availability</router-link>
   <button type="button" :disabled="busy" @click="enableWaitlist(r)">Enable {{r.format==='IN_PERSON'?'in-person':'virtual'}} waitlist</button>
   <button type="button" :disabled="busy" @click="snooze(r)">Snooze 7 days</button>
   <small v-if="detailsOpen && r.checkedAt">Last checked {{new Date(r.checkedAt).toLocaleString()}}.</small>
  </div>
  <button type="button" :aria-expanded="detailsOpen" aria-controls="availability-reminder-details" @click="detailsOpen=!detailsOpen">{{detailsOpen ? 'Hide details' : 'Why am I seeing this?'}}</button>
  <div v-if="detailsOpen" id="availability-reminder-details" class="opening-details">
  <p>Publishing a new-client opening switches that format from Waitlist to Open.</p>
  <p>Typical availability and pending room requests do not publish openings. In-person openings need a future room reservation that you have chosen to offer to new clients.</p>
  <p>Published hours may still be occupied by appointments, school assignments, or schedule blocks.</p>
  </div>
  <p v-if="error" role="alert">{{error}}</p>
 </aside>
</template>
<script setup>
import {ref,onMounted,onUnmounted} from 'vue';
import api from '../../services/api';
const reminders=ref([]),busy=ref(false),error=ref(''),detailsOpen=ref(false);let timer,active=true,pending;
function load(){
 if(pending)return pending;
 pending=(async()=>{try{const{data}=await api.get('/availability/me/opening-reminders',{skipGlobalLoading:true,skipAuthRedirect:true});if(active)reminders.value=data.reminders||[];}catch{if(active)reminders.value=[];}finally{pending=null;}})();
 return pending;
}
async function enableWaitlist(r){busy.value=true;error.value='';try{await api.post(`/availability/providers/${r.providerId}/public-settings/waitlist`,{agencyId:r.agencyId,format:r.format},{skipGlobalLoading:true});await load();}catch(e){error.value=e.response?.data?.error?.message||'Could not enable the waitlist. Please try again.';}finally{busy.value=false;}}
async function snooze(r){busy.value=true;error.value='';try{await api.post(`/availability/providers/${r.providerId}/public-settings/snooze`,{agencyId:r.agencyId,format:r.format},{skipGlobalLoading:true});await load();}catch{error.value='Could not snooze this reminder. Please try again.';}finally{busy.value=false;}}
onMounted(()=>{load();timer=setInterval(load,60000);window.addEventListener('focus',load);});onUnmounted(()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);});
</script>
<style scoped>.opening-notice{padding:12px 20px;background:#fff5d9;color:#493910;border:1px solid #dec478}.opening-notice>div:not(.opening-details){display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:6px 0}.opening-notice a{color:#365b35;text-decoration:underline}.opening-notice button{border:1px solid #947e40;border-radius:5px;background:white;color:#493910;padding:6px 10px}</style>
