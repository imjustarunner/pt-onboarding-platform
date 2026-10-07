<template>
 <section class="poll-results" aria-label="Poll results and response review">
  <header><h3>{{event.title}} — results</h3><button type="button" @click="$emit('close')">Close results</button></header>
  <p>{{event.votingConfig?.shareResults===false?'Aggregate results are private to organizers. Participants can see their own replies.':'Participants can see aggregate results after voting closes.'}}</p>
  <p v-if="error" role="alert">{{error}}</p><p v-if="loading">Loading responses…</p>
  <div class="result-bars"><div v-for="r in summary" :key="r.key"><span>{{r.label}} — {{r.total}} ({{percent(r.total)}}%)</span><progress :value="r.total" :max="Math.max(1,total)" /></div></div>
  <p>{{responses.length}} responded · {{total}} categorized · {{responses.filter(r=>r.excluded).length}} excluded · {{responses.filter(r=>!r.excluded&&!event.votingConfig.options.some(o=>o.key===(r.bucketKey||r.responseKey))).length}} awaiting categorization</p>
  <article v-for="r in responses" :key="r.id">
   <strong>{{r.name}}</strong><p>Original reply: {{r.originalBody||r.responseLabel}}</p><small>{{new Date(r.receivedAt).toLocaleString()}} · {{r.source}}</small>
   <label>Count this reply as<select v-model="r.selection"><option value="">Choose a category</option><option v-for="o in event.votingConfig.options" :key="o.key" :value="o.key">{{o.label}}</option><option value="__exclude">Exclude from totals</option></select></label>
   <label>Reason for review<input v-model="r.reviewReason" maxlength="1000" placeholder="For example: participant meant Monday" /></label>
   <button type="button" :disabled="busy||!r.selection||!r.reviewReason?.trim()" @click="classify(r)">Save review</button>
  </article>
 </section>
</template>
<script setup>
import {ref,computed,onMounted,watch} from 'vue';import api from '../../services/api';
const props=defineProps({agencyId:[Number,String],event:{type:Object,required:true}});defineEmits(['close','changed']);
const responses=ref([]),summary=ref([]),error=ref(''),loading=ref(false),busy=ref(false);let generation=0;
const base=()=>`/agencies/${props.agencyId}/company-events/${props.event.id}`;
const total=computed(()=>summary.value.reduce((n,r)=>n+r.total,0));const percent=n=>total.value?Math.round(100*n/total.value):0;
async function load(){const g=++generation;loading.value=true;error.value='';try{const {data}=await api.get(`${base()}/responses`);if(g!==generation)return;summary.value=data.summary;responses.value=data.responses.map(r=>({...r,selection:r.excluded?'__exclude':r.bucketKey||(r.responseKey==='__UNCLASSIFIED__'?'':r.responseKey),reviewReason:r.reason||''}));}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'Could not load results.';}finally{if(g===generation)loading.value=false;}}
async function classify(r){busy.value=true;error.value='';try{await api.put(`${base()}/responses/${r.id}/review`,{bucketKey:r.selection==='__exclude'?null:r.selection,excluded:r.selection==='__exclude',reason:r.reviewReason,originalBody:r.originalBody,receivedAt:r.receivedAt});await load();}catch(e){error.value=e.response?.data?.error?.message||'Could not save review.';}finally{busy.value=false;}}
onMounted(load);watch(()=>[props.agencyId,props.event.id],load);
</script>
<style scoped>
.poll-results{background:#fff;padding:24px;border:1px solid #d9e2ed;border-radius:16px;margin:20px 0}.poll-results header{display:flex;justify-content:space-between}.result-bars{display:grid;gap:12px}.result-bars progress{display:block;width:100%;accent-color:#2678ed}.poll-results article{border-top:1px solid #e3e9f1;padding:18px 0}.poll-results label{display:block;margin:10px 0}.poll-results input,.poll-results select{margin-left:10px;padding:8px;border:1px solid #bfcddd;border-radius:6px}[role=alert]{color:#b91c1c}
</style>
