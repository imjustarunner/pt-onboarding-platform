<template>
  <section v-if="active.length" class="closure-banner" role="status" aria-label="School closures affecting your assignments">
    <strong>School calendar notice</strong>
    <ul><li v-for="item in active" :key="item.eventId"><b>{{ item.district }} · {{ item.title }}</b><span v-if="item.reason"> — {{ item.reason }}</span><br /><small>{{ item.schools.map(s=>s.name).join(', ') }} · {{ duration(item) }}</small></li></ul>
    <button type="button" @click="reviewOpen=true">Review closure details</button>
    <Teleport to="body">
      <div v-if="modalVisible" class="closure-overlay" @keydown.esc.prevent="dismiss" @keydown.tab.prevent="dismissButton?.focus()">
        <section role="dialog" aria-modal="true" aria-labelledby="school-closure-title" class="closure-dialog">
          <h2 id="school-closure-title">Your school assignments are affected</h2>
          <article v-for="item in modalItems" :key="item.eventId"><h3>{{ item.district }} · {{ item.title }}</h3><p v-if="item.reason">{{ item.reason }}</p><p>{{ item.schools.map(s=>s.name).join(', ') }}</p><p>{{ duration(item) }}</p></article>
          <p>Review any affected school sessions. This calendar notice does not cancel appointments.</p>
          <p v-if="error" role="alert">{{ error }}</p>
          <button ref="dismissButton" type="button" :disabled="saving" @click="dismiss">{{ saving ? 'Saving…' : 'I understand' }}</button>
        </section>
      </div>
    </Teleport>
  </section>
</template>
<script setup>
import {computed,ref,watch,onMounted,onBeforeUnmount,nextTick} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],default:null},splashAllowed:{type:Boolean,default:true}});
const closures=ref([]),now=ref(Date.now()),reviewOpen=ref(false),saving=ref(false),error=ref(''),dismissButton=ref(null);
let sequence=0,refreshTimer,timer,previousFocus;
const active=computed(()=>closures.value.filter(item=>new Date(item.startsAt).getTime()<=now.value&&now.value<new Date(item.endsAt).getTime()));
const pending=computed(()=>active.value.filter(item=>!item.splashDismissed));
const modalVisible=computed(()=>props.splashAllowed&&active.value.length>0&&(reviewOpen.value||pending.value.length>0));
const modalItems=computed(()=>reviewOpen.value?active.value:pending.value);
function duration(item){const format=new Intl.DateTimeFormat('en-US',{timeZone:item.timeZone,dateStyle:'medium',timeStyle:'short'});return `${format.format(new Date(item.startsAt))} – ${format.format(new Date(item.endsAt))} (${item.timeZone})`;}
async function load(){const request=++sequence;try{const {data}=await api.get('/dashboard/school-closures',{params:props.agencyId?{agencyId:props.agencyId}:undefined});if(request===sequence)closures.value=data.closures||[];}catch{if(request===sequence)closures.value=[];}}
async function dismiss(){if(saving.value)return;saving.value=true;error.value='';try{for(const item of pending.value){await api.post(`/dashboard/school-closures/${item.eventId}/dismiss`,{revision:item.revision});item.splashDismissed=true;}reviewOpen.value=false;}catch{error.value='Could not save your acknowledgement. Please try again.';}finally{saving.value=false;}}
watch(modalVisible,async visible=>{if(visible){previousFocus=document.activeElement;await nextTick();dismissButton.value?.focus();}else previousFocus?.focus?.();});
watch(()=>props.agencyId,()=>{closures.value=[];reviewOpen.value=false;load();});
onMounted(()=>{load();window.addEventListener('focus',load);refreshTimer=setInterval(load,60000);timer=setInterval(()=>{now.value=Date.now();},1000);});
onBeforeUnmount(()=>{sequence++;clearInterval(refreshTimer);clearInterval(timer);window.removeEventListener('focus',load);});
</script>
<style scoped>
.closure-banner { padding:16px 20px; border:1px solid #d4a44d; border-left:5px solid #bd7d1c; border-radius:10px; background:#fff8e8; color:#4b3617; margin:12px 0; }
.closure-banner ul { margin:10px 0; padding-left:20px; }.closure-banner li+li { margin-top:8px; }
.closure-banner button,.closure-dialog button { padding:9px 14px; border:1px solid #8b621d; border-radius:7px; background:#fff; color:#4b3617; cursor:pointer; }
.closure-overlay { position:fixed; inset:0; z-index:1400; background:#10203988; display:flex; align-items:center; justify-content:center; padding:20px; }
.closure-dialog { background:#fff; color:#243047; border-radius:14px; padding:24px; width:min(600px,100%); max-height:85vh; overflow:auto; box-shadow:0 15px 60px #0004; }
.closure-dialog h2 { margin-top:0; }.closure-dialog article { border-bottom:1px solid #ddd; padding-bottom:8px; }.closure-dialog p { overflow-wrap:anywhere; }
</style>
