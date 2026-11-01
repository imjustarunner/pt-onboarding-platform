<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({draftId:[Number,String],beforeLink:Function});
const emit=defineEmits(['linked']);
const state=ref(null),selected=ref(''),confirmed=ref(false),busy=ref(false),error=ref('');
let generation=0;
async function load(){const run=++generation;state.value=null;selected.value='';confirmed.value=false;error.value='';
 if(!props.draftId)return;try{const {data}=await api.get(`/clinical-notes/drafts/${props.draftId}/appointment`,{skipGlobalLoading:true});if(run===generation)state.value={...data,options:data?.options||[]};}catch{if(run===generation)error.value='Appointment linkage could not be checked.';}}
watch(()=>props.draftId,load,{immediate:true});
function label(row){const raw=String(row.startAt).replace(' ','T');const date=new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(raw)?raw:`${raw}Z`);
 return `Appointment #${row.appointmentId||row.officeEventId} · ${new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:row.sourceTimezone}).format(date)} (${row.sourceTimezone}) · ${row.serviceCode}`;}
async function link(){if(busy.value||!confirmed.value||!selected.value)return;const run=generation,id=props.draftId;busy.value=true;error.value='';
 try{await props.beforeLink?.();if(run!==generation)return;const {data}=await api.post(`/clinical-notes/drafts/${id}/appointment`,{clinicalSessionId:Number(selected.value),confirmed:true});
 if(run===generation){state.value={linked:true,options:[]};emit('linked',data.draft);}}
 catch(e){if(run===generation)error.value=e.response?.data?.error?.message||e.message||'The draft could not be linked. Your text is preserved.';}finally{busy.value=false;}}
</script>
<template><section v-if="state && !state.linked || error" class="draft-appointment-repair">
 <h3>Link this draft to its appointment</h3><p>This draft has no booked encounter. Choose its matching appointment explicitly. Its client, provider, local service date and code must agree. Existing notes and text are preserved.</p>
 <p v-if="state && !state.options.length">{{state.message || 'No unsigned matching appointment was found. Review the client, date and service code, or open the correct appointment from the schedule.'}}</p>
 <template v-if="state?.options.length"><label>Appointment<select v-model="selected" :disabled="busy"><option value="">Choose an appointment</option><option v-for="row in state.options" :key="row.clinicalSessionId" :value="row.clinicalSessionId">{{label(row)}}</option></select></label>
 <label><input type="checkbox" v-model="confirmed" :disabled="busy"> I checked that this draft describes the selected appointment.</label>
 <button type="button" :disabled="busy || !selected || !confirmed" @click="link">{{busy?'Linking…':'Link appointment'}}</button></template>
 <p v-if="error" role="alert">{{error}}</p><button type="button" :disabled="busy" @click="load">Check again</button>
</section></template>
<style scoped>.draft-appointment-repair{margin:16px 0;padding:18px;border:1px solid #dfc078;background:#fff9e9;border-radius:8px;color:#453b24}p{line-height:1.5}label{display:block;margin:12px 0}select,button{font:inherit;padding:9px;border:1px solid #bda977;border-radius:6px}select{display:block;width:100%;margin-top:8px}button{cursor:pointer;margin-right:10px}input{margin-right:7px}[role=alert]{color:#a12424}</style>
