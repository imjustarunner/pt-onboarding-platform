<template>
 <div class="enrollment-share-overlay" @click.self="close"><section class="enrollment-share-dialog" role="dialog" aria-modal="true" aria-labelledby="enrollment-share-title"><header><img src="/auricwell/mark.svg" alt="" /><div><p>AuricWell · Enrollment documents</p><h2 id="enrollment-share-title">{{ document.title }}</h2></div><button @click="close" aria-label="Close document sharing">Close</button></header>
 <template v-if="!recordId"><p>Choose an assigned client to create their own saved copy, then share it to an authorized portal account or complete it together.</p><NoteAidClientPicker v-model="clientId" :agency-id="document.agencyId" :search-all-tenants="false" :disabled="busy" />
 <div class="share-options"><label>Completed by<select v-model="audience" :disabled="busy"><option value="self">Individual enrolling themselves</option><option value="guardian">Guardian for a dependent</option></select></label><label>Service<select v-model="service" :disabled="busy"><option value="counseling">Counseling</option><option value="tutoring">Tutoring</option></select></label></div>
 <p v-if="error" role="alert">{{ error }}</p><button class="primary" :disabled="busy||!clientId" @click="create">{{ busy?'Preparing document…':'Create client copy & continue' }}</button></template>
 <SafetyPlansPanel v-else ref="documentPanel" :key="recordId" :agency-id="document.agencyId" :client-id="clientId" :initial-record-id="recordId" record-only />
 </section></div>
</template>
<script setup>
import {ref,onBeforeUnmount} from 'vue';
import api from '../../services/api';
import NoteAidClientPicker from '../clinical/NoteAidClientPicker.vue';
import SafetyPlansPanel from '../safetyPlans/SafetyPlansPanel.vue';
const props=defineProps({document:{type:Object,required:true}});const emit=defineEmits(['close','done']);
const clientId=ref(null),recordId=ref(null),audience=ref(props.document.audience||'guardian'),service=ref(props.document.service||(props.document.channel==='tutoring'?'tutoring':'counseling')),busy=ref(false),error=ref(''),documentPanel=ref(null);let alive=true;
async function create(){busy.value=true;error.value='';try{
 const context={channel:props.document.channel==='school'?'school':'office',audience:audience.value,service:service.value,locale:props.document.locale||'en'};
 const {data:catalog}=await api.get(`/enrollment-portal/clients/${clientId.value}/catalog`,{params:{...context,agencyId:props.document.agencyId}});if(!alive)return;
 const key=({'intake-questionnaire':'enrollment-form','consent-summary':'packet-acknowledgment','signatures':'packet-acknowledgment'})[props.document.key]||props.document.key;
 const source=catalog.documents.find(d=>d.key===key);if(!source)throw new Error('This document is not part of the selected packet. Choose the applicable audience or service.');
 const {data}=await api.post(`/enrollment-portal/clients/${clientId.value}/documents`,{agencyId:props.document.agencyId,foundationKey:source.key,context,data:{documentName:source.title,personLabel:catalog.client.name,planDate:new Date().toLocaleDateString('en-CA')}});if(!alive)return;recordId.value=data.id;emit('done',{clientId:clientId.value,recordId:data.id});
 }catch(e){if(alive)error.value=e.response?.data?.error?.message||e.message||'Document could not be created.';}finally{if(alive)busy.value=false;}}
function prepareToLeave(){if(busy.value)return false;return documentPanel.value?.confirmDiscard?.()!==false;}
function close(){if(!prepareToLeave())return;emit('close');}
defineExpose({prepareToLeave});
onBeforeUnmount(()=>{alive=false;});
</script>
<style scoped>
.enrollment-share-overlay{position:fixed;inset:0;z-index:12000;background:#0f29256e;padding:3vh 3vw;display:flex;justify-content:center}.enrollment-share-dialog{width:min(1200px,100%);overflow:auto;background:#fff;color:#234238;border-radius:16px;padding:24px;box-shadow:0 20px 80px #152b3540}.enrollment-share-dialog header{display:flex;gap:12px;align-items:center;border-bottom:1px solid #dce7df;padding-bottom:18px;margin-bottom:18px}.enrollment-share-dialog header div{flex:1}.enrollment-share-dialog header img{width:36px;height:36px}.enrollment-share-dialog h2{font-size:23px;margin:4px 0}.enrollment-share-dialog p{line-height:1.7;font-size:13px}.enrollment-share-dialog button,.enrollment-share-dialog select{font:inherit;padding:11px 14px;border:1px solid #aec6b9;border-radius:7px;background:#fff;color:#234d40}.enrollment-share-dialog button{cursor:pointer}.enrollment-share-dialog button:disabled{opacity:.5;cursor:default}.enrollment-share-dialog .primary{background:#175b48;color:white}.share-options{display:flex;flex-wrap:wrap;gap:14px;margin:20px 0}.share-options label{display:grid;gap:7px;font-size:13px}[role=alert]{color:#973d2d;background:#fff3ef;padding:12px}@media(max-width:600px){.enrollment-share-overlay{padding:10px}.enrollment-share-dialog{padding:14px}}
</style>
