<template>
 <section class="matching" aria-label="Find matching openings">
  <h3>Find matching openings</h3>
  <p>Ask for a day, time range, format, or age group. Follow up to narrow the same search.</p>
  <form @submit.prevent="ask()"><label>Availability question<input v-model="question" placeholder="Who has availability Wednesday between 2 and 5 PM and sees kids?" required/></label><button :disabled="busy">{{busy?'Checking calendars…':'Find openings'}}</button><button type="button" @click="reset" :disabled="busy">New search</button></form>
  <details><summary>Match a submitted client’s preferences</summary><form @submit.prevent="findClients"><label>Client name or initials<input v-model="clientQuery" minlength="2" required/></label><button :disabled="busy">Find client</button></form><ul><li v-for="c in clients" :key="c.id">{{c.full_name||c.initials||('Client #'+c.id)}} <button :disabled="busy" @click="ask(`Match client #${c.id} preferences to provider availability`)">Find matching providers</button></li></ul><p>Saved day, time, format, location, and age preferences are checked where recorded. Missing or unverified preferences are listed for review.</p></details>
  <p v-if="error" role="alert">{{error}}</p><div class="answer" v-if="answer" role="status">{{answer}}</div>
 </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true}});
const availabilityQueries=ref([]);
const question=ref(''),history=ref([]),answer=ref(''),busy=ref(false),error=ref(''),clientQuery=ref(''),clients=ref([]);
let generation=0;
function reset(){generation++;availabilityQueries.value=[];question.value='';history.value=[];answer.value='';error.value='';clients.value=[];}
async function findClients(){busy.value=true;error.value='';const g=generation;try{const {data}=await api.get('/clients',{params:{agency_id:props.agencyId,search:clientQuery.value,page:1,per_page:10}});if(g===generation)clients.value=data.items||[];}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'Could not find clients.';}finally{busy.value=false;}}
async function ask(text){const q=typeof text==='string'?text:question.value;if(!q.trim())return;const g=generation;busy.value=true;error.value='';try{const {data}=await api.post('/agents/assist',{prompt:q,history:history.value.slice(-8),context:{agencyId:props.agencyId,answerOnly:true,availabilityQueries:availabilityQueries.value}},{timeout:180000});if(g!==generation)return;availabilityQueries.value=data.availabilityQueries||[];answer.value=data.assistantText||'Could not complete this search.';history.value.push({role:'user',text:q},{role:'assistant',text:answer.value});question.value='';}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'Could not check availability. Please retry.';}finally{busy.value=false;}}
watch(()=>props.agencyId,reset);
</script>
<style scoped>
.matching{padding:20px;background:#f1f7f4;border:1px solid #c9ddd2;border-radius:12px;margin:16px 0}.matching form{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:14px 0}.matching label{display:grid;gap:6px;flex:1;min-width:220px}.matching input{padding:11px;border:1px solid #afc5b9;border-radius:6px;font:inherit;width:100%;box-sizing:border-box}.matching button{padding:10px;border-radius:6px;border:1px solid #9ab3a5;cursor:pointer}.answer{white-space:pre-wrap;line-height:1.6;margin-top:18px}.matching li{margin:10px 0}
</style>
