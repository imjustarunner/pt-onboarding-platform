<script setup>
import {computed,ref,watch} from 'vue';
import {usePortalCareApi} from '../../composables/usePortalCareApi';
const api=usePortalCareApi();
const props=defineProps({clientId:{type:Number,required:true}});
const data=ref(null),draft=ref({}),error=ref(''),busy=ref(false),message=ref('');let generation=0;
const changedValues=computed(()=>Object.fromEntries(Object.entries(draft.value).filter(([key,value])=>String(value||'').trim()!==String(data.value?.values?.[key]||'')).map(([key,value])=>[key,String(value||'').trim()])));
const canSave=computed(()=>data.value&&!busy.value&&!data.value.requests.some(r=>r.status==='pending')&&Object.keys(changedValues.value).length>0);
async function load(){const run=++generation;data.value=null;error.value='';message.value='';try{const r=await api.get(`/guardian-portal/clients/${props.clientId}/details`,{skipGlobalLoading:true});if(run===generation){data.value=r.data;draft.value={...r.data.values};}}catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'Could not load client details.';}}
async function save(){if(!canSave.value)return;const id=props.clientId,run=generation,values={...changedValues.value};busy.value=true;error.value='';try{await api.post(`/guardian-portal/clients/${id}/details`,{values,revision:data.value.revision},{skipGlobalLoading:true});if(run!==generation)return;await load();message.value='Your updates are saved for our support team to review. The current record stays in place until review is complete.';}catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'Could not save the updates.';}finally{busy.value=false;}}
watch(()=>props.clientId,load,{immediate:true});
</script>
<template><section class="client-details-update"><h3>Client details</h3><p>Review the information on file. Name, contact information, and home address are shared with the care and billing teams after review.</p>
<form v-if="data" @submit.prevent="save"><div class="detail-grid"><label v-for="(label,key) in data.fields" :key="key">{{label}}<input v-model="draft[key]" :type="key==='date_of_birth'?'date':key==='email'?'email':key==='contact_phone'?'tel':'text'" maxlength="255" :disabled="busy" /></label></div>
<button type="submit" :disabled="!canSave">{{busy?'Saving…':'Save updated details'}}</button><p v-if="data.requests.some(r=>r.status==='pending')" role="status">Your update is waiting for support review.</p></form>
<p v-if="message" role="status">{{message}}</p><p v-if="error" role="alert">{{error}} <button type="button" @click="load">Reload</button></p>
<details v-if="data?.requests.length"><summary>Your previous updates</summary><div v-for="r in data.requests" :key="r.id"><p>{{new Date(r.createdAt).toLocaleDateString()}} · {{r.status==='pending'?'Waiting for review':'Reviewed'}}</p><ul><li v-for="(value,key) in r.proposed" :key="key">{{data.fields[key]}}: {{value||'Not provided'}} <span v-if="r.review">· {{r.review.acceptedFields.includes(key)?'Applied':'Kept current value'}}</span></li></ul></div></details></section></template>
<style scoped>.client-details-update{padding:16px;border:1px solid #d7e3dd;border-radius:12px;margin:16px 0}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}label{display:grid;gap:6px}input{min-width:0;width:100%;box-sizing:border-box;padding:9px;font:inherit;border:1px solid #b9cbc2;border-radius:6px}button{font:inherit;padding:9px 14px;cursor:pointer}p[role=alert]{color:#a12727}details{margin-top:16px}@media(max-width:560px){.detail-grid{grid-template-columns:1fr}}</style>
