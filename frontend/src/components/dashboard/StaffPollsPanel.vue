<template>
  <details class="staff-polls" @toggle="onToggle">
    <summary>Staff polls and results</summary>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading">Loading polls…</p>
    <template v-else-if="opened">
      <p v-if="!polls.length">No staff polls available.</p>
      <article v-for="poll in polls" :key="poll.id">
        <h4>{{ poll.title }}</h4><p>{{ poll.question }}</p>
        <template v-if="!poll.closedAt">
          <button v-for="option in poll.options" :key="option.key" type="button" :disabled="busy" @click="vote(poll, option)">{{ option.label }}</button>
          <label><input type="checkbox" :checked="poll.resultsText" :disabled="busy" @change="setPreference(poll, $event)" /> Text me the final results when this poll closes.</label>
          <p class="hint">Optional. Requires your separate polling SMS consent and a current mobile number. STOP still applies. Final totals are available here after voting closes.</p>
        </template>
        <template v-else>
          <p>Voting closed. Final totals:</p>
          <ul v-if="poll.results?.length"><li v-for="result in poll.results" :key="result.key">{{ result.label }}: {{ result.total }}</li></ul>
          <p v-else>No votes received.</p>
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
const polls=ref([]),opened=ref(false),loading=ref(false),busy=ref(false),error=ref(''),notice=ref('');
let generation=0;
const params=()=>({agencyId:props.agencyId||undefined});
async function load(){const id=++generation;loading.value=true;error.value='';try{const {data}=await api.get('/me/staff-polls',{params:params()});if(id===generation)polls.value=data;}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Unable to load staff polls.';}finally{if(id===generation)loading.value=false;}}
function onToggle(e){opened.value=e.target.open;if(opened.value)load();}
async function vote(poll,option){busy.value=true;error.value='';notice.value='';const id=generation;try{await api.post(`/me/company-events/${poll.id}/respond`,{responseKey:option.key,agencyId:props.agencyId},{params:params()});if(id===generation)notice.value=`Your response was recorded: ${option.label}.`;}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Unable to record your vote.';}finally{busy.value=false;}}
async function setPreference(poll,event){const value=event.target.checked;busy.value=true;error.value='';const id=generation;try{const {data}=await api.put(`/me/staff-polls/${poll.id}/results-preference`,{resultsText:value},{params:params()});if(id===generation)poll.resultsText=data.resultsText;}catch(e){event.target.checked=poll.resultsText;if(id===generation)error.value=e.response?.data?.error?.message||'Unable to save your preference.';}finally{busy.value=false;}}
watch(()=>props.agencyId,()=>{generation++;polls.value=[];error.value='';notice.value='';if(opened.value)load();});
</script>
<style scoped>
.staff-polls{margin-top:16px;border-top:1px solid #ccd6dd;padding-top:12px}summary{cursor:pointer;font-weight:600}article{border-bottom:1px solid #ddd;padding:12px 0}button{margin:4px 8px 8px 0}label{display:block;margin:10px 0}.hint{font-size:.85rem}[role=alert]{color:#b91c1c}
</style>
