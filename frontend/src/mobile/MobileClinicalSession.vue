<script setup>
import { computed, ref, watch, onBeforeUnmount, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ClinicalSessionRecordingPanel from '../components/clinical/ClinicalSessionRecordingPanel.vue';
import { mobileClinicalClient } from './clinicalTransport.js';
import { backInMobile } from './mobileNavigation.js';
const props=defineProps({apiBase:String,sessionToken:String});
const route=useRoute(),router=useRouter(),context=ref(null),loading=ref(false),error=ref('');let generation=0;
const client=computed(()=>mobileClinicalClient(props.apiBase,props.sessionToken));
const selection=computed(()=>Object.fromEntries(['workId','clinicalSessionId','officeEventId','clientId','draftId','noteId','recordingId'].filter(key=>route.query[key]).map(key=>[key,route.query[key]])));
const recorderOpen = ref(false);
const now = ref(Date.now());
let clock;
const recordingEnabled = computed(() => context.value?.preferences?.features?.recording === true);
const recordingWindow = computed(() => {
  const start = Date.parse(context.value?.session?.startAt);
  const end = Date.parse(context.value?.session?.endAt);
  return start <= now.value && end > now.value;
});
onMounted(() => { clock = setInterval(() => { now.value = Date.now(); }, 1000); });
function back(){backInMobile(router,{path:'/mobile/workspace',query:{view:'calendar'}});}
function openWriter(data={}){router.push({path:'/mobile/workspace',query:{...selection.value,view:'clinical',...(data.recordingId?{recordingId:String(data.recordingId)}:{}),...(data.clinicalSessionId?{clinicalSessionId:String(data.clinicalSessionId)}:{})}});}
async function load(){const current=++generation;recorderOpen.value=false;context.value=null;loading.value=true;error.value='';try{const {data}=await client.value.get('/context',{params:selection.value});if(current===generation)context.value=data;}catch(e){if(current===generation)error.value=e.response?.data?.error?.message || 'This session is unavailable.';}finally{if(current===generation)loading.value=false;}}
onBeforeUnmount(()=>{clearInterval(clock);generation++;context.value=null;});
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
          <svg class="mcs-art" viewBox="0 0 60 60" aria-hidden="true">
            <g transform="rotate(-8 30 30)">
              <rect x="10" y="12" width="30" height="39" rx="4" fill="#70aab6"/>
              <rect x="15" y="7" width="30" height="39" rx="4" fill="#fff"/>
              <path d="M22 17h15m-15 6h12m-12 6h8" fill="none" stroke="#69919f" stroke-width="2.5" stroke-linecap="round"/>
            </g>
            <path d="m30 41 2-8 15-17a3 3 0 0 1 5 5L37 38z" fill="#f6c969" stroke="#173e51" stroke-width="1.5"/>
            <path d="m30 41 2-8 5 5z" fill="#dfae6b"/>
          </svg>
          <span>Open note</span><span class="mcs-arrow" aria-hidden="true">→</span>
        </button>
        <button v-if="recordingEnabled && recordingWindow && (context.session?.id || context.session?.officeEventId)" type="button" class="mcs-action audio" @click="recorderOpen=true">
          <svg class="mcs-art" viewBox="0 0 60 60" aria-hidden="true">
            <rect x="16" y="4" width="28" height="51" rx="8" fill="#476571"/>
            <rect x="19" y="6" width="22" height="13" rx="5" fill="#c4d8dc"/>
            <path d="M23 10h14m-14 4h14" stroke="#698893" stroke-width="2" stroke-linecap="round"/>
            <rect x="20" y="23" width="20" height="9" rx="2" fill="#c6e6de"/>
            <path d="M22 28h3l2-3 3 5 2-4 2 2h4" fill="none" stroke="#366d67" stroke-linejoin="round"/>
            <circle cx="30" cy="42" r="6" fill="#d8e4e6"/><circle cx="30" cy="42" r="3" fill="#526e78"/>
          </svg>
          <span>Transcribe Full Session<small>Record with everyone’s consent</small></span>
          <span v-if="recordingEnabled" class="mcs-arrow" aria-hidden="true">→</span>
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
.mcs-actions{display:grid;gap:10px}
.mcs-action{display:grid;grid-template-columns:56px minmax(0,1fr) auto;align-items:center;gap:14px;text-align:left;min-height:76px;padding:10px 16px;border-radius:14px}
.mcs-action>span:first-of-type{font-size:1.05rem;font-weight:650;line-height:1.3}
.mcs-art{width:56px;height:56px;display:block}
.mcs-action .mcs-arrow{display:grid;place-items:center;width:28px;height:28px;border:1px solid currentColor;border-radius:50%;font-size:1rem}
.note{color:#fff;background:linear-gradient(110deg,#163e59,#1e576a);border:1px solid #214c60;box-shadow:0 3px 8px #193e5319}
.audio{color:#fff;background:linear-gradient(130deg,#154d92,#0b254e);border:1px solid #2d5b9a;border-left:3px solid #efbe55}
.mcs-action:disabled{opacity:1;cursor:default;color:#354e5b;background:#f3f6f7;border-color:#dae4e6}
.audio small{display:block;font-size:.82rem;font-weight:450;line-height:1.4;margin-top:3px;color:#e0e9f8}
.mcs-action:enabled:hover{box-shadow:0 3px 12px #193e532e}
.mcs-action:focus-visible{outline:3px solid #bd8300;outline-offset:2px}
.mobile-clinical-session [role=alert]{color:#9b2c2c}
@media(max-width:360px){.mcs-action{grid-template-columns:46px minmax(0,1fr) auto;gap:10px;padding:10px}.mcs-art{width:46px;height:46px}}
</style>
