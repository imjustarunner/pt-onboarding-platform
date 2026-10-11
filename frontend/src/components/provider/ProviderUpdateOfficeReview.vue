<template>
  <section class="office-review">
    <p>Check each current office reservation. Confirm the ones you use, or release incorrect reservations so someone else can book the room. This does not cancel a client appointment.</p>
    <div class="actions"><button type="button" :disabled="loading||busy" @click="load">Refresh reservations</button></div>
    <p class="review-order"><strong>First, review your existing reservations below.</strong> Confirm the rooms you still use and release those you no longer need. New days, times, and room requests come later in <strong>Set Availability</strong>, after you save this review.</p>
    <p v-if="message" role="status">{{message}}</p>
    <p v-if="loading">Loading office reservations…</p><p v-if="error" role="alert">{{error}}</p>
    <section v-for="day in groupedDays" :key="day.weekday" class="reservation-day"><h2>{{day.label}} · {{day.items.length}} {{day.items.length===1?'reservation':'reservations'}}</h2>
    <article v-for="item in day.items" :key="item.id" :class="{confirmed:confirmed.includes(item.id)}">
      <h3>{{item.title}}</h3><p>{{item.when}} · {{item.timeZone}}</p>
      <div v-if="removing===item.id" class="release"><p>Release this reservation from today forward? The room becomes available to other providers. If a client appointment is linked, resolve that appointment in the regular schedule first.</p><button type="button" :disabled="busy||readonly" @click="release(item)">{{busy?'Releasing…':'Release this reservation'}}</button><button type="button" @click="removing=null">Keep reservation</button></div>
      <div v-else class="actions"><button type="button" :disabled="readonly||busy" @click="confirm(item.id)">{{confirmed.includes(item.id)?'✓ Correct':'This reservation is correct'}}</button><button type="button" :disabled="readonly||busy" @click="removing=item.id">Incorrect — remove reservation</button></div>
    </article></section>
    <p v-if="!loading&&!items.length&&!error">You have no current recurring office reservations to review.</p>
    <p v-if="items.length">{{confirmed.filter(id=>items.some(i=>i.id===id)).length}} of {{items.length}} reservations confirmed.</p>
    <button type="button" class="primary" :disabled="readonly||busy||loading||!!error||items.some(i=>!confirmed.includes(i.id))" @click="$emit('complete',{confirmedAssignmentIds:confirmed,officeReservationsReviewed:true})">Save and continue</button>
  </section>
</template>
<script setup>
import {computed,onMounted,ref} from 'vue';
import api from '../../services/api';
const props=defineProps({mode:String,token:String,agencyId:[String,Number],data:Object,readonly:Boolean});
defineEmits(['complete','navigate']);
const base=computed(()=>props.mode==='token'?`/public/provider-update/${encodeURIComponent(props.token)}`:'/provider-update/me');
const items=ref([]),confirmed=ref(props.data?.confirmedAssignmentIds||[]),loading=ref(false),busy=ref(false),error=ref(''),message=ref(''),removing=ref(null);
const groupedDays=computed(()=>[1,2,3,4,5,6,0].map(weekday=>({weekday,label:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][weekday],items:items.value.filter(i=>i.weekday===weekday)})).filter(day=>day.items.length));
let loadId=0;
async function load(){if(busy.value)return;const id=++loadId;loading.value=true;error.value='';try{const {data}=await api.get(`${base.value}/office-schedule-review`,{params:{agencyId:props.agencyId}});if(id===loadId)items.value=data.items||[];}catch(e){if(id===loadId)error.value=e.response?.data?.error?.message||'Unable to load office reservations.';}finally{if(id===loadId)loading.value=false;}}
function confirm(id){if(!confirmed.value.includes(id))confirmed.value.push(id);}
async function release(item){
 if(busy.value||props.readonly)return;
 ++loadId;loading.value=false;busy.value=true;error.value='';message.value='';
 try{
  await api.post(`${base.value}/office-assignments/${item.id}/forfeit`,{agencyId:props.agencyId,scope:'future',acknowledged:true});
  items.value=items.value.filter(i=>i.id!==item.id);
  confirmed.value=confirmed.value.filter(id=>id!==item.id);
  removing.value=null;message.value=`Released ${item.title} · ${item.when}. It has been removed from your reservations.`;
  window.dispatchEvent(new CustomEvent('provider-update-availability-changed',{detail:{agencyId:props.agencyId}}));
 }catch(e){error.value=e.response?.data?.error?.message||'The reservation was not released. Please try again.';}finally{busy.value=false;}
}
defineExpose({draft:()=>({confirmedAssignmentIds:[...confirmed.value]})});
onMounted(load);
</script>
<style scoped>
.reservation-day{display:grid;gap:12px}.reservation-day h2{font-size:1.15rem;margin:8px 0}
.review-order{background:#eef6f1;padding:14px;border-radius:10px}.office-review{display:grid;gap:16px;color:#20384d}.office-review article{padding:18px;border:1px solid #b9cad7;border-radius:12px}.office-review article.confirmed{border-color:#296c65;background:#eff8f6}.office-review h3{margin:0 0 8px}.actions,.release{display:flex;gap:12px;flex-wrap:wrap}.office-review button{font:inherit;padding:10px 16px;background:#fff;border:1px solid #658197;border-radius:8px;color:#20384d;cursor:pointer}.office-review .primary{background:#204f74;color:#fff;width:fit-content}.office-review button:disabled{opacity:.5;cursor:default}[role=alert]{color:#9d2525}.release p{flex-basis:100%}
</style>
