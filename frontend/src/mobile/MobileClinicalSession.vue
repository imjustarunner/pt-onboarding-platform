<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ClinicalSessionRecordingPanel from '../components/clinical/ClinicalSessionRecordingPanel.vue';
import { mobileClinicalClient } from './clinicalTransport.js';
import { backInMobile } from './mobileNavigation.js';
const props=defineProps({apiBase:String,sessionToken:String});
const route=useRoute(),router=useRouter(),context=ref(null),loading=ref(false),error=ref('');let generation=0;
const client=computed(()=>mobileClinicalClient(props.apiBase,props.sessionToken));
const selection=computed(()=>Object.fromEntries(['workId','clinicalSessionId','officeEventId','clientId','draftId','noteId','recordingId'].filter(key=>route.query[key]).map(key=>[key,route.query[key]])));
function back(){backInMobile(router,{path:'/mobile/workspace',query:{view:'calendar'}});}
function openWriter(data={}){router.push({path:'/mobile/workspace',query:{...selection.value,view:'clinical',...(data.recordingId?{recordingId:String(data.recordingId)}:{}),...(data.clinicalSessionId?{clinicalSessionId:String(data.clinicalSessionId)}:{})}});}
async function load(){const current=++generation;context.value=null;loading.value=true;error.value='';try{const {data}=await client.value.get('/context',{params:selection.value});if(current===generation)context.value=data;}catch(e){if(current===generation)error.value=e.response?.data?.error?.message || 'This session is unavailable.';}finally{if(current===generation)loading.value=false;}}
onBeforeUnmount(()=>{generation++;context.value=null;});
watch(()=>JSON.stringify(selection.value),load,{immediate:true});
</script>
<template><section class="mobile-clinical-session"><button type="button" class="mcs-back" @click="back">← Back</button><p v-if="loading" role="status">Loading session…</p><p v-if="error" role="alert">{{ error }}</p><template v-if="context"><header><div><p>Session</p><h2>{{ context.client?.maskedName || 'Client' }}</h2><small>{{ context.client?.age != null ? `Age ${context.client.age} · ` : '' }}{{ context.session?.dateOfService }}</small></div><button type="button" @click="openWriter()">Open note</button></header><ClinicalSessionRecordingPanel v-if="context.session?.id || context.session?.officeEventId" :agency-id="context.agencyId" :client-id="context.client?.id" :clinical-session-id="context.session?.id" :office-event-id="context.session?.officeEventId" base-url="/recording/session" :api-client="client" @narrative-ready="openWriter" @close="back"/><p v-else>This item has no authorized scheduled encounter. Open a scheduled session to record.</p></template></section></template>
<style scoped>.mobile-clinical-session{background:white;padding:16px;color:#173754}.mobile-clinical-session button{font:inherit;cursor:pointer;border:1px solid #d0dce8;border-radius:9px;background:#f0f5fc;color:#1b527e;padding:10px 12px}.mobile-clinical-session>header{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:20px 0}.mobile-clinical-session header p{font-size:11px;color:#6d8296;text-transform:uppercase;letter-spacing:.06em;margin:0}.mobile-clinical-session h2{font-size:22px;margin:5px 0}.mobile-clinical-session small{color:#71859a}.mobile-clinical-session [role=alert]{color:#a12c2a}.mobile-clinical-session :deep(.session-capture){padding:0;border:0}.mobile-clinical-session :deep(.session-capture>header>div h2){font-size:19px}</style>
