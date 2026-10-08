<template>
  <details class="staff-polls" @toggle="onToggle">
    <summary><img src="/assets/conversa/mark.svg" alt="" width="24" height="24" style="vertical-align:middle;margin-right:8px" />Team polls · Conversa</summary>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading">Loading polls…</p>
    <template v-else-if="opened">
      <p v-if="!polls.length">No team polls available.</p>
      <article v-for="poll in polls" :key="poll.id">
        <h4>{{ poll.title }}</h4><p>{{ poll.question }}</p>
        <p v-if="poll.myResponse">Your reply: {{poll.myResponse.original||poll.myResponse.label}} <span v-if="poll.myResponse.excluded">— excluded from totals</span><span v-else-if="poll.myResponse.bucketKey">— categorized as {{poll.options.find(o=>o.key===poll.myResponse.bucketKey)?.label||poll.myResponse.bucketKey}}</span></p>
        <template v-if="!poll.closedAt">
          <button v-for="option in poll.options" :key="option.key" type="button" :disabled="busy" @click="vote(poll, option)">{{ option.label }}</button>
          <form v-if="poll.allowOther" @submit.prevent="vote(poll,{key:otherReplies[poll.id],label:otherReplies[poll.id]})"><label>Your own answer<input v-model="otherReplies[poll.id]" maxlength="2000" required /></label><button :disabled="busy">Submit written answer</button></form>
          <label v-if="poll.shareResults!==false"><input type="checkbox" :checked="poll.resultsText" :disabled="busy" @change="setPreference(poll, $event)" /> Text me the final results when this poll closes.</label>
          <p class="hint">Optional. Requires your separate polling SMS consent and a current mobile number. STOP still applies. Shared final totals are available here after voting closes.</p>
        </template>
        <template v-else>
          <p>{{poll.shareResults===false?'Voting closed. The organizer has kept aggregate results private. Your response remains available above.':'Voting closed. Final totals:'}}</p>
          <ul v-if="poll.results?.length"><li v-for="result in poll.results" :key="result.key">{{ result.label }}: {{ result.total }}</li></ul>
          <p v-else-if="poll.shareResults!==false">No categorized votes received.</p>
        </template>
      </article>
      <button type="button" :disabled="busy" @click="load">Refresh polls</button>
    </template>
  </details>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],default:null}});
const otherReplies=ref({});
const polls=ref([]),opened=ref(false),loading=ref(false),busy=ref(false),error=ref(''),notice=ref('');
let generation=0;
const params=()=>({agencyId:props.agencyId||undefined});
async function load(){const id=++generation;loading.value=true;error.value='';try{const {data}=await api.get('/me/staff-polls',{params:params()});if(id===generation)polls.value=data;}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Unable to load staff polls.';}finally{if(id===generation)loading.value=false;}}
function onToggle(e){const next=e.target.open;if(next===opened.value)return;opened.value=next;if(next)load();}
async function vote(poll,option){busy.value=true;error.value='';notice.value='';const id=generation;try{await api.post(`/me/company-events/${poll.id}/respond`,{responseKey:option.key,agencyId:props.agencyId},{params:params()});if(id===generation){notice.value=`Your response was recorded: ${option.label}.`;await load();}}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Unable to record your vote.';}finally{busy.value=false;}}
async function setPreference(poll,event){const value=event.target.checked;busy.value=true;error.value='';const id=generation;try{const {data}=await api.put(`/me/staff-polls/${poll.id}/results-preference`,{resultsText:value},{params:params()});if(id===generation)poll.resultsText=data.resultsText;}catch(e){event.target.checked=poll.resultsText;if(id===generation)error.value=e.response?.data?.error?.message||'Unable to save your preference.';}finally{busy.value=false;}}
watch(()=>props.agencyId,()=>{generation++;polls.value=[];error.value='';notice.value='';if(opened.value)load();});
</script>
<style scoped>
.staff-polls{margin-top:16px;border-top:1px solid #ccd6dd;padding-top:12px}summary{cursor:pointer;font-weight:600}article{border-bottom:1px solid #ddd;padding:12px 0}button{margin:4px 8px 8px 0}label{display:block;margin:10px 0}.hint{font-size:.85rem}[role=alert]{color:#b91c1c}
</style>
