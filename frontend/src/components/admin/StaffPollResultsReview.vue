<template>
 <section class="poll-results" aria-label="Poll results and response review">
  <p class="hint">Team polls · Conversa</p>
  <header><h3>{{event.title}} — results</h3><button type="button" @click="$emit('close')">Close results</button></header>
  <p>{{publishedConfig.shareResults===false?'Aggregate results are private to organizers. Participants can see their own replies.':publishedConfig.resultsVisibility==='live'?'Participants can see live aggregate results while voting is open.':'Participants can see aggregate results after voting closes.'}}</p>
  <details class="poll-sharing-settings" @toggle="openSettings"><summary>Sharing &amp; linked event</summary>
   <form v-if="settingsOpen" @submit.prevent="saveSettings">
    <p class="hint">Update these settings at any time, including after voting closes. Saving here does not reopen voting or send invitations.</p>
    <label><input v-model="settings.shareResults" type="checkbox" /> Share vote totals with participants</label>
    <label v-if="settings.shareResults">Show shared results<select v-model="settings.resultsVisibility" aria-label="Review results visibility"><option value="after_close">After voting closes</option><option value="live">Live totals while voting is open</option></select></label>
    <label>Linked internal event<select v-model="settings.linkedEventId" aria-label="Review linked event" :disabled="linksLoading"><option value="">No linked event</option><option v-if="settings.linkedEventId && !eventLinks.some(e => e.id === Number(settings.linkedEventId))" :value="settings.linkedEventId">Current link · event details unavailable</option><option v-for="linked in eventLinks.filter(e => e.id !== event.id)" :key="linked.id" :value="linked.id">{{ linked.title }}{{ linked.isActive === false ? ' · Details not yet available' : '' }}</option></select></label>
    <p v-if="linksError" role="alert">{{ linksError }} <button type="button" @click="loadLinks">Retry events</button></p>
    <button type="submit" :disabled="busy">Save sharing &amp; event link</button><p v-if="settingsNotice" role="status">{{ settingsNotice }}</p>
   </form>
  </details>
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
import {ref,computed,onMounted,onBeforeUnmount,watch} from 'vue';import api from '../../services/api';
const props=defineProps({agencyId:[Number,String],event:{type:Object,required:true}});const emit=defineEmits(['close','changed']);
const responses=ref([]),summary=ref([]),error=ref(''),loading=ref(false),busy=ref(false);let generation=0;
const settingsOpen=ref(false),settings=ref({}),publishedConfig=ref({}),eventLinks=ref([]),linksLoading=ref(false),linksError=ref(''),settingsNotice=ref('');
let settingsGeneration=0;
watch(()=>`${props.agencyId}:${props.event.id}`,()=>{settingsGeneration++;settingsOpen.value=false;eventLinks.value=[];linksError.value='';settingsNotice.value='';},{immediate:true});
watch(()=>props.event.votingConfig,config=>{publishedConfig.value=config||{};settings.value={shareResults:config?.shareResults!==false,resultsVisibility:config?.resultsVisibility||'after_close',linkedEventId:config?.linkedEventId||''};},{immediate:true});
async function loadLinks(){const g=settingsGeneration;linksLoading.value=true;linksError.value='';try{const {data}=await api.get(`/agencies/${props.agencyId}/company-events`,{params:{pollLinkOptions:1}});if(g===settingsGeneration)eventLinks.value=Array.isArray(data)?data:[];}catch{if(g===settingsGeneration)linksError.value='Could not load internal events.';}finally{if(g===settingsGeneration)linksLoading.value=false;}}
function openSettings(event){settingsOpen.value=event.target.open;if(settingsOpen.value)loadLinks();}
async function saveSettings(){const g=settingsGeneration;busy.value=true;error.value='';settingsNotice.value='';try{const {data}=await api.put(`${base()}/presentation`,{...settings.value,linkedEventId:Number(settings.value.linkedEventId)||null});if(g!==settingsGeneration)return;publishedConfig.value=data.votingConfig;emit('changed',{...props.event,votingConfig:data.votingConfig});settingsNotice.value='Sharing and event link saved. Voting and delivery are unchanged.';}catch(e){if(g===settingsGeneration)error.value=e.response?.data?.error?.message||'Could not save poll settings.';}finally{if(g===settingsGeneration)busy.value=false;}}
const base=()=>`/agencies/${props.agencyId}/company-events/${props.event.id}`;
const total=computed(()=>summary.value.reduce((n,r)=>n+r.total,0));const percent=n=>total.value?Math.round(100*n/total.value):0;
async function load(){const g=++generation;loading.value=true;error.value='';try{const {data}=await api.get(`${base()}/responses`);if(g!==generation)return;summary.value=data.summary;responses.value=data.responses.map(r=>({...r,selection:r.excluded?'__exclude':r.bucketKey||(r.responseKey==='__UNCLASSIFIED__'?'':r.responseKey),reviewReason:r.reason||''}));}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'Could not load results.';}finally{if(g===generation)loading.value=false;}}
async function classify(r){busy.value=true;error.value='';try{await api.put(`${base()}/responses/${r.id}/review`,{bucketKey:r.selection==='__exclude'?null:r.selection,excluded:r.selection==='__exclude',reason:r.reviewReason,originalBody:r.originalBody,receivedAt:r.receivedAt});await load();}catch(e){error.value=e.response?.data?.error?.message||'Could not save review.';}finally{busy.value=false;}}
onMounted(load);watch(()=>`${props.agencyId}:${props.event.id}`,load);
onBeforeUnmount(()=>{generation++;settingsGeneration++;});
</script>
<style scoped>
.poll-results{background:#fff;padding:24px;border:1px solid #d9e2ed;border-radius:16px;margin:20px 0}.poll-results header{display:flex;justify-content:space-between}.result-bars{display:grid;gap:12px}.result-bars progress{display:block;width:100%;accent-color:#2678ed}.poll-results article{border-top:1px solid #e3e9f1;padding:18px 0}.poll-results label{display:block;margin:10px 0}.poll-results input,.poll-results select{margin-left:10px;padding:8px;border:1px solid #bfcddd;border-radius:6px}[role=alert]{color:#b91c1c}
</style>
<style scoped>
.poll-sharing-settings{margin:18px 0;padding:12px 14px;background:#f4f7fd;border:1px solid #dce5f2;border-radius:10px;color:#152c50;font-size:13px}.poll-sharing-settings summary{font-weight:650;cursor:pointer}.poll-sharing-settings form{padding-top:6px}.poll-sharing-settings .hint{font-size:12px;line-height:1.6;color:#53647c}.poll-sharing-settings label{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.poll-sharing-settings input[type=checkbox]{margin:0;accent-color:#245ccb}.poll-sharing-settings select{display:block;width:100%;margin:0;color:#152c50;background:white}.poll-sharing-settings button{padding:8px 12px;background:white;border:1px solid #b8c8df;border-radius:7px;color:#245ccb;font:inherit;cursor:pointer}.poll-sharing-settings [role=status]{color:#176447}.poll-sharing-settings :is(summary,button,select,input):focus-visible{outline:3px solid #83b5ff;outline-offset:3px}
</style>
