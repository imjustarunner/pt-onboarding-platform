<template>
  <aside v-if="summary?.showNotice || (staff && error)" class="contract-scheduling-notice" role="status">
    <template v-if="summary?.showNotice">
      <h3>Weekly scheduling expectation</h3>
      <p class="week">{{ weekLabel }} · {{ summary.timeZone }}</p>
      <p>Signed contract minimum: <strong>{{ summary.agreement.minimumHours }} hours/week</strong>.
        Expected scheduled hours and available-to-book capacity: <strong>{{ summary.agreement.requiredHours }} hours/week each</strong>
        (25% more, rounded up, for no-shows and rescheduling).</p>
      <p><strong>{{ summary.scheduledHours }} hours scheduled in the app</strong> — {{ summary.scheduledShortfallHours }} more hours to reach this week’s target.</p>
      <p v-if="summary.availabilityStatus === 'checked'">
        <strong>{{ summary.capacityHours }} hours of bookable capacity</strong> (booked client time plus open appointment hours).
        <span v-if="summary.capacityShortfallHours > 0">Add {{ summary.capacityShortfallHours }} more available hours.</span>
        <span v-else>The availability target is met.</span>
      </p>
      <p v-else>Bookable availability could not be fully checked. Review the calendar before deciding whether more openings are needed.</p>
      <p class="scope">Counts client appointments and assigned tutoring sessions recorded in this app. External appointments and school blocks may need staff review. This notice clears when the scheduled target is met.</p>
      <div class="actions">
        <button v-if="!staff" type="button" @click="$emit('open')">Review availability</button>
        <button type="button" :disabled="loading" @click="load">{{ loading ? 'Checking…' : 'Check again' }}</button>
      </div>
    </template>
    <p v-else>{{ error }} <button type="button" :disabled="loading" @click="load">Retry</button></p>
  </aside>
</template>
<script setup>
import {computed,ref,watch,onMounted,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({providerId:[Number,String],agencyId:[Number,String],staff:{type:Boolean,default:false}});
defineEmits(['open']);
const summary=ref(null),error=ref(''),loading=ref(false);
let generation=0,timer;
const weekLabel=computed(()=>{
  if(!summary.value)return '';
  const end=new Date(`${summary.value.weekEnd}T12:00:00Z`);end.setUTCDate(end.getUTCDate()-1);
  const format=d=>new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',timeZone:'UTC'}).format(d);
  return `${format(new Date(`${summary.value.weekStart}T12:00:00Z`))}–${format(end)}`;
});
async function load(){
  const request=++generation;
  if(!props.providerId||!props.agencyId){summary.value=null;error.value='';loading.value=false;return;}
  loading.value=true;
  try{
    const {data}=await api.get(`/availability/providers/${props.providerId}/contract-scheduling-expectation`,{params:{agencyId:props.agencyId},skipGlobalLoading:true});
    if(request===generation){summary.value=data;error.value='';}
  }catch{if(request===generation){summary.value=null;error.value='Contract scheduling expectations could not be checked.';}}
  finally{if(request===generation)loading.value=false;}
}
function refreshVisible(){if(document.visibilityState!=='hidden'&&!loading.value)void load();}
watch(()=>[props.providerId,props.agencyId],()=>{summary.value=null;void load();},{immediate:true});
onMounted(()=>{window.addEventListener('focus',refreshVisible);timer=setInterval(refreshVisible,60000);});
onBeforeUnmount(()=>{generation++;clearInterval(timer);window.removeEventListener('focus',refreshVisible);});
</script>
<style scoped>
.contract-scheduling-notice{padding:18px;border:1px solid #c89934;background:#fff8e7;color:#563c12;border-radius:12px;margin:0 0 18px}
h3{margin:0 0 6px;font-size:1.05rem}.week,.scope{font-size:.875rem}.week{margin-top:0}p{line-height:1.5}.actions{display:flex;gap:10px;flex-wrap:wrap}button{padding:8px 12px;border:1px solid #8d702f;border-radius:6px;background:white;color:#563c12;cursor:pointer}button:disabled{opacity:.6}
</style>
