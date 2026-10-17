<template>
  <section class="pending-tasks" aria-label="Client pending tasks">
    <header><div><h3>Pending tasks{{ clientName ? ` · ${clientName}` : '' }}</h3><p>Documentation and billing follow-up, together for this client.</p></div><button :disabled="loading" @click="load()">Refresh tasks</button></header>
    <p v-if="loading" role="status">Loading pending tasks…</p><p v-if="error" role="alert">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
    <ul>
      <li v-for="note in pendingNotes" :key="`note-${note.record_key || note.id}`"><div><strong>{{ note.note_status === 'none' || !note.note_status ? 'Complete session note' : 'Review and sign note' }}</strong><small>Clinical team · {{date(note.service_date)}} · {{note.note_status || 'Not started'}}</small></div><button @click="openNote(note)">Open note →</button></li>
      <template v-for="task in tasks" :key="task.profileId">
        <li><div><strong>{{task.state==='help'?'Help with insurance card upload':task.state==='review'?'Review uploaded insurance cards':'Upload missing insurance card images'}}</strong><small>{{task.state==='review'?'Billing team':'Client / guardian'}} · {{task.ownerName}} · {{task.state==='missing'?`${task.missingSlots.length} card side(s) missing`:'Office follow-up needed'}}</small></div><button @click="cardsOpen=!cardsOpen">{{cardsOpen?'Hide':'View'}} card task</button></li>
        <li v-if="task.state==='missing'"><div><strong>Review and send insurance email</strong><small>{{task.snoozedUntil?`Your reminder returns ${dateTime(task.snoozedUntil)}`:task.emailBlocked||'Billing team · Ready for your review'}}</small></div><button @click="review=task">Review email →</button></li>
      </template>
    </ul>
    <p v-if="!loading&&!error&&!tasks.length&&!pendingNotes.length">No pending tasks are available for this client with your access.</p>
    <p v-if="more" class="muted">More policies are available. <button @click="loadMore">Load more</button></p>
    <InsuranceCardTasks v-if="cardsOpen&&billingEnabled" :agency-id="agencyId" :client-id="clientId" staff />
    <InsuranceEmailReview v-if="review" :task="review" @done="reviewDone" />
  </section>
</template>
<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import {useRouter} from 'vue-router';
import api from '../../services/api';
import InsuranceEmailReview from './InsuranceEmailReview.vue';
import InsuranceCardTasks from './InsuranceCardTasks.vue';
const props=defineProps({agencyId:[Number,String],clientId:[Number,String],agencySlug:String,billingEnabled:Boolean,clinicalNotes:{type:Array,default:null}});
const emit=defineEmits(['open-note']);const router=useRouter();
const tasks=ref([]),notes=ref([]),review=ref(null),cardsOpen=ref(false),error=ref(''),notice=ref(''),loading=ref(false),more=ref(null);let version=0;
const pendingNotes=computed(()=>(props.clinicalNotes||notes.value).filter(n=>!['signed','planned','voided','cancelled','canceled'].includes(String(n.note_status||'none').toLowerCase())));
const clientName=computed(()=>tasks.value.flatMap(t=>t.clients).find(c=>Number(c.id)===Number(props.clientId))?.name||'');
const date=value=>value?new Date(value).toLocaleDateString():'Date not recorded';const dateTime=value=>new Date(value).toLocaleString();
async function load(append=false){const current=++version;loading.value=true;error.value='';review.value=null;if(!append){tasks.value=[];notes.value=[];more.value=null;}if(!props.agencyId||!props.clientId){loading.value=false;return;}
  const params={agencyId:props.agencyId,clientId:props.clientId};
  const results=await Promise.allSettled([
    props.billingEnabled?api.get('/family-billing/insurance-cards/review-queue',{params:{...params,after:append?more.value:0},skipGlobalLoading:true}):Promise.resolve(null),
    props.clinicalNotes===null&&!append?api.get(`/billing-reports/clients/${props.clientId}/medical-record`,{params:{agencyId:props.agencyId},skipGlobalLoading:true}):Promise.resolve(null)
  ]);if(current!==version)return;
  const [billing,clinical]=results;
  if(billing.status==='fulfilled'&&billing.value){tasks.value=append?[...tasks.value,...billing.value.data.rows]:billing.value.data.rows;more.value=billing.value.data.nextAfter;}
  if(clinical.status==='fulfilled'&&clinical.value)notes.value=clinical.value.data.encounters||[];
  if(results.some(r=>r.status==='rejected'&&r.reason.response?.status!==403))error.value='Some tasks could not load. Refresh to try again.';
  loading.value=false;
}
function loadMore(){load(true);}
function reviewDone(result){notice.value=result.status==='sent'?'Reviewed email sent.':'Your reminder was updated.';load();}
function openNote(note){if(props.clinicalNotes!==null){emit('open-note',note);return;}const slug=props.agencySlug||tasks.value[0]?.organization?.slug;router.push({path:`${slug?`/${slug}`:''}/admin/clients/${props.clientId}`,query:{tab:'medical-record'}});}
watch(()=>[props.agencyId,props.clientId,props.billingEnabled],()=>{cardsOpen.value=false;notice.value='';load();},{immediate:true});onBeforeUnmount(()=>{version++;});
</script>
<style scoped>
.pending-tasks{padding:22px;border:1px solid #d9e4f1;border-radius:14px;background:#fff;color:#193354;margin-bottom:20px}header{display:flex;justify-content:space-between;align-items:center;gap:12px}h3{margin:0;font-size:20px}p,small{color:#586b82;font-size:14px;line-height:1.5}ul{list-style:none;padding:0;margin:12px 0;max-height:55vh;overflow:auto}li{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 0;border-top:1px solid #e5edf5}small{display:block;margin-top:6px}button{font:inherit;font-size:14px;border:1px solid #b8cbe2;border-radius:8px;padding:9px 12px;color:#1453a8;background:white;cursor:pointer;flex-shrink:0}[role=alert]{color:#a72230}@media(max-width:600px){li,header{align-items:flex-start;flex-direction:column}.pending-tasks{padding:16px}}
</style>
