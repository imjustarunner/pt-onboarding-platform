<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ appointmentId: { type: Number, required: true } });
const options=ref([]), seriesAvailable=ref(false), officeEventId=ref(0), scope=ref('occurrence'), busy=ref(false), error=ref(''), notice=ref(''), opened=ref(false); let generation=0;
async function load() {
  const own=++generation, id=props.appointmentId; busy.value=true; error.value='';
  try { const {data}=await api.get(`/appointments/${id}/office-reservations`,{skipGlobalLoading:true}); if(own!==generation)return; options.value=data.options||[];seriesAvailable.value=!!data.seriesAvailable;officeEventId.value=options.value[0]?.id||0; }
  catch(e) { if(own===generation)error.value=e.response?.data?.error?.message||'Office reservations could not be loaded.'; }
  finally { if(own===generation)busy.value=false; }
}
async function link() {
  if(busy.value||!officeEventId.value)return;
  const own=generation,id=props.appointmentId;busy.value=true;error.value='';notice.value='';
  try { const {data}=await api.post(`/appointments/${id}/office-reservations/link`,{officeEventId:officeEventId.value,scope:scope.value},{skipGlobalLoading:true}); if(own!==generation)return; notice.value=`Office reservation linked to ${data.linkedAppointmentIds.length} appointment(s). Your existing session notes and recurring dates are kept.`; window.dispatchEvent(new Event('pt-schedule-refresh')); }
  catch(e) { if(own===generation){const count=e.response?.data?.linkedAppointmentIds?.length||0;error.value=(count?`${count} appointment(s) were linked before the remaining changes stopped. `:'')+(e.response?.data?.error?.message||'The office reservation could not be linked.');} }
  finally { if(own===generation)busy.value=false; }
}
watch(()=>props.appointmentId,()=>{generation++;options.value=[];opened.value=false;scope.value='occurrence';notice.value='';error.value='';busy.value=false;});
</script>
<template>
  <section class="appointment-office-link" aria-label="Link an existing office reservation">
    <button type="button" :disabled="busy" @click="opened=!opened; opened && load()">{{ opened ? 'Hide office reservations' : 'Link an existing office reservation' }}</button>
    <template v-if="opened"><p>Use an office you have already booked at this time. Your session, notes, and monthly or other recurring dates stay together.</p>
      <p v-if="busy" role="status">Checking office reservations…</p>
      <template v-if="options.length"><label>Reserved office<select v-model="officeEventId" :disabled="busy"><option v-for="office in options" :key="office.id" :value="office.id">{{ office.label }}</option></select></label><label v-if="seriesAvailable">Apply to<select v-model="scope" :disabled="busy"><option value="occurrence">This appointment</option><option value="series">This and future saved appointments in this series</option></select></label><p v-if="scope==='series'">The same office must already be reserved for every saved date.</p><button type="button" :disabled="busy || !officeEventId" @click="link">Link reserved office</button></template>
      <p v-else-if="!busy && !error">No unused office reservation covers this session time. Book the office first, then return here to link it.</p>
    </template><p v-if="notice" role="status">{{ notice }}</p><p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.appointment-office-link{padding:12px 0;grid-column:1/-1;font-size:13px}label{display:grid;gap:6px;margin:10px 0}button,select{font:inherit;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:var(--bg-card,#fff);color:inherit}button{cursor:pointer}button:disabled{opacity:.6;cursor:default}p{line-height:1.5}p[role=alert]{color:#b91c1c}
</style>
