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
const recorderOpen = ref(false);
function back(){backInMobile(router,{path:'/mobile/workspace',query:{view:'calendar'}});}
function openWriter(data={}){router.push({path:'/mobile/workspace',query:{...selection.value,view:'clinical',...(data.recordingId?{recordingId:String(data.recordingId)}:{}),...(data.clinicalSessionId?{clinicalSessionId:String(data.clinicalSessionId)}:{})}});}
async function load(){const current=++generation;recorderOpen.value=false;context.value=null;loading.value=true;error.value='';try{const {data}=await client.value.get('/context',{params:selection.value});if(current===generation)context.value=data;}catch(e){if(current===generation)error.value=e.response?.data?.error?.message || 'This session is unavailable.';}finally{if(current===generation)loading.value=false;}}
onBeforeUnmount(()=>{generation++;context.value=null;});
watch(()=>JSON.stringify(selection.value),load,{immediate:true});
</script>
<template>
  <section class="mobile-clinical-session">
    <button type="button" class="mcs-back" @click="back">← Back</button>
    <p v-if="loading" role="status">Loading session…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="context">
      <header><p>Session</p><h2>{{ context.client?.maskedName || 'Client' }}</h2><small>{{ context.client?.age != null ? `Age ${context.client.age} · ` : '' }}{{ context.session?.dateOfService }}</small></header>
      <div v-if="!recorderOpen" class="mcs-actions">
        <button type="button" class="mcs-action note" @click="openWriter()">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M18 4H8a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-9M10 11h7m-7 5h4m2 5 2.5-6L26 7.5l3 3-7.5 7.5z"/></svg>
          <span>Open note</span><span class="mcs-arrow" aria-hidden="true"></span>
        </button>
        <button v-if="context.session?.id || context.session?.officeEventId" type="button" class="mcs-action audio" :disabled="context.preferences?.features?.recording === false" @click="recorderOpen=true">
          <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="11.5" y="3" width="9" height="17" rx="4.5"/><path d="M7.5 15a8.5 8.5 0 0 0 17 0M16 24v4m-5 0h10"/></svg>
          <span>Record session audio<small v-if="context.preferences?.features?.recording === false" class="mcs-disabled">Disabled for this workspace</small></span><span class="mcs-arrow" aria-hidden="true"></span>
        </button>
      </div>
      <ClinicalSessionRecordingPanel v-else direct-launch :agency-id="context.agencyId" :client-id="context.client.id"
        :clinical-session-id="context.session.id" :office-event-id="context.session.officeEventId"
        base-url="/recording/session" :api-client="client" @close="recorderOpen=false" @narrative-ready="openWriter" />
    </template>
  </section>
</template>
<style scoped>
.mobile-clinical-session{max-width:40rem;margin:0 auto;background:white;padding:clamp(16px,4vw,26px);color:#173754;border:1px solid #dae4ee;border-radius:16px}
.mobile-clinical-session button{font:inherit;cursor:pointer}.mcs-back{background:transparent;color:#275874;border:0;padding:8px 0}
.mobile-clinical-session header{margin:16px 0 20px}.mobile-clinical-session header p{font-size:.73rem;color:#596e84;text-transform:uppercase;letter-spacing:.1em;margin:0}.mobile-clinical-session h2{font-size:1.5rem;margin:5px 0}.mobile-clinical-session small{color:#546a80}
.mcs-actions{display:grid;gap:10px}.mcs-action{display:grid;grid-template-columns:42px 1fr auto;gap:14px;align-items:center;text-align:left;padding:12px 16px;border-radius:13px;font-weight:650!important}.mcs-arrow::after{content:"›"}.mcs-action svg{width:42px;height:42px;padding:7px;box-sizing:border-box;border-radius:11px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.note{color:#fff;background:#184a70;border:1px solid #17415f}.note svg{background:#326181}.audio{color:#1b5751;border:1px solid #b7d5ce;background:#f1f8f5}.audio svg{background:#d7ebe4}.mcs-disabled{display:block;font-size:.78rem;font-weight:400}.mcs-action:disabled{opacity:.7;cursor:default}.mcs-action:focus-visible{outline:3px solid #bf8800;outline-offset:2px}.mobile-clinical-session [role=alert]{color:#9b2c2c}
</style>
