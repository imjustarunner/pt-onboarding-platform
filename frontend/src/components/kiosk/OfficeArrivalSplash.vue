<template>
  <Teleport to="body">
    <div v-if="arrival" class="arrival-shade" @keydown="trapFocus">
      <section ref="panel" class="arrival-panel" role="alertdialog" aria-modal="true" aria-labelledby="arrival-title" aria-describedby="arrival-message" tabindex="-1">
        <span class="arrival-icon" aria-hidden="true">✓</span>
        <p class="arrival-eyebrow">OFFICE CHECK-IN</p>
        <h2 id="arrival-title">Your client is here.</h2>
        <p id="arrival-message">{{ arrival.message }}</p>
        <div v-if="arrival.feedback" class="feedback-summary">
          <p class="feedback-context">{{arrival.feedback.serviceType==='tutoring'?'Tutoring':'Therapy / counseling'}} · {{arrival.feedback.respondentType==='caregiver'?'Guardian report':arrival.feedback.respondentType==='youth_self'?'Youth self-report':'Adult self-report'}}</p>
          <div class="score-grid"><section v-for="metric in metrics" :key="metric.key"><h3>{{metric.label}}</h3><div class="score-circle" :style="{borderColor:color(arrival.feedback.metrics[metric.key].current)}"><strong>{{score(arrival.feedback.metrics[metric.key].current)}}</strong><small>out of 10</small></div><p>Average <strong>{{score(arrival.feedback.metrics[metric.key].average)}}</strong> / 10</p><p class="change">{{change(arrival.feedback.metrics[metric.key].changeFromStart)}} <span>since first recorded score</span></p></section></div>
          <p v-if="!arrival.feedback.completed" class="arrival-hint">Feedback is still in progress. Scores update here when submitted.</p>
          <p v-if="!arrival.feedback.linked" class="arrival-hint">History is available after this visit is attached to a confirmed client.</p>
          <button class="arrival-secondary" :aria-expanded="expanded" @click="toggleAnswers">{{expanded?'Hide answers':'View answers'}}</button>
          <div v-if="expanded" class="answers"><p v-if="responsesLoading">Loading responses…</p><p v-else-if="responsesError" role="alert">{{responsesError}} <button @click="loadResponses">Try again</button></p><template v-else-if="responses"><p v-if="!responses.completedAt">Answers haven’t been submitted yet.</p><section v-for="form in responses.forms" :key="form.id"><h3>{{form.title}}</h3><p v-if="responses.skippedFormIds.includes(form.id)">Skipped by respondent</p><dl v-else><template v-for="field in form.fields" :key="field.id"><dt>{{field.label}}</dt><dd>{{answer(form,field)}}</dd></template></dl></section></template></div>
          <p class="arrival-hint">Custom feedback, not validated measures. Higher scores are better; distress is reversed.</p>
        </div>
        <p v-else-if="arrival.feedbackUnavailable" class="arrival-hint">Feedback could not load yet. Your arrival alert is still available.</p>
        <p class="arrival-hint">{{ arrival.email_status === 'pending' ? 'Acknowledge now to stop the pending email reminder.' : 'Your arrival alert is saved in Notifications.' }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <button class="arrival-primary" :disabled="saving" @click="acknowledge(false)">{{ saving ? 'Saving…' : 'Got it · I’ll meet them' }}</button>
        <button class="arrival-secondary" :disabled="saving" @click="acknowledge(true)">Got it · Keep future check-ins in-app only</button>
        <small v-if="arrivals.length > 1">{{ arrivals.length - 1 }} more arrival{{ arrivals.length > 2 ? 's' : '' }} waiting</small>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import api from '../../services/api';
const arrivals=ref([]), saving=ref(false), error=ref(''), panel=ref(null);
const arrival=computed(()=>arrivals.value[0] || null);
const metrics=[{key:'connection',label:'Connection'},{key:'progress',label:'Progress'}];
const expanded=ref(false),responses=ref(null),responsesLoading=ref(false),responsesError=ref('');let responseVersion=0;
const score=value=>Number.isFinite(value)?value.toFixed(1):'—';
const change=value=>Number.isFinite(value)?`${value>0?'+':''}${value.toFixed(1)}`:'—';
const color=value=>!Number.isFinite(value)?'#829085':`hsl(${value<=5?value*8:40+(value-5)*17} 65% 36%)`;
function answer(form,field){const value=responses.value.answers?.[form.id]?.[field.id];if(value==null||value==='')return 'Not answered';const label=v=>field.options?.find(o=>o.value===v)?.label||String(v);return Array.isArray(value)?value.map(label).join(', '):typeof value==='boolean'?(value?'Yes':'No'):label(value);}
async function loadResponses(){const id=arrival.value?.feedback?.submissionId;if(!id)return;const request=++responseVersion;responses.value=null;responsesError.value='';responsesLoading.value=true;try{const {data}=await api.get(`/kiosk/client-checkins/${id}/responses`,{skipGlobalLoading:true});if(!disposed&&request===responseVersion)responses.value=data.visit;}catch{if(request===responseVersion)responsesError.value='Responses could not load.';}finally{if(request===responseVersion)responsesLoading.value=false;}}
function toggleAnswers(){expanded.value=!expanded.value;if(expanded.value)loadResponses();else{responseVersion++;responses.value=null;}}
watch(()=>arrival.value?.feedback?.completed,()=>{if(expanded.value)loadResponses();});
let version=0;
let timer,disposed=false,fetching=false,previousFocus;
async function load(){
  if(fetching || saving.value || disposed)return;
  fetching=true;const request=version;
  try{const {data}=await api.get('/notifications/office-arrivals',{skipGlobalLoading:true});if(!disposed && request===version)arrivals.value=data.arrivals || [];}
  catch{/* Preserve visible arrivals during a transient network interruption. */}
  finally{fetching=false;}
}
async function acknowledge(inAppOnly){
  if(saving.value || !arrival.value)return;
  const id=arrival.value.id;version++;saving.value=true;error.value='';
  try{await api.post(`/notifications/office-arrivals/${id}/acknowledge`,{inAppOnly},{skipGlobalLoading:true});if(!disposed)arrivals.value=arrivals.value.filter(a=>a.id!==id);}
  catch{error.value='Acknowledgment could not be saved. Please try again.';}
  finally{saving.value=false;}
}
function trapFocus(event){
  if(event.key!=='Tab')return;
  const buttons=[...panel.value.querySelectorAll('button:not(:disabled)')];
  if(!buttons.length){event.preventDefault();return;}
  if(event.shiftKey && [buttons[0],panel.value].includes(document.activeElement)){event.preventDefault();buttons.at(-1).focus();}
  else if(!event.shiftKey && document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus();}
}
watch(()=>arrival.value?.id,async(id,old)=>{
  responseVersion++;expanded.value=false;responses.value=null;responsesError.value='';
  if(id){if(!old)previousFocus=document.activeElement;await nextTick();panel.value?.focus();}
  else previousFocus?.focus?.();
});
onMounted(()=>{load();timer=setInterval(load,10_000);window.addEventListener('focus',load);});
onUnmounted(()=>{disposed=true;responseVersion++;responses.value=null;clearInterval(timer);window.removeEventListener('focus',load);previousFocus?.focus?.();});
</script>
<style scoped>
.arrival-shade{position:fixed;inset:0;z-index:19000;background:#122b25a6;backdrop-filter:blur(7px);display:grid;place-items:center;padding:24px;overflow:auto}.arrival-panel{width:min(100%,740px);max-height:94dvh;overflow:auto;box-sizing:border-box;padding:42px;border-radius:28px;background:#f7f8f0;color:#24443d;text-align:center;box-shadow:0 24px 80px #0004;font-family:inherit}.arrival-icon{display:grid;place-items:center;margin:auto;width:72px;height:72px;border-radius:50%;font-size:36px;background:#dcebd9;color:#426b3c}.arrival-eyebrow{font-size:11px;letter-spacing:2px;margin:26px 0 12px}h2{font-size:36px;margin:0 0 20px;letter-spacing:-1px}p{line-height:1.65}.arrival-hint{font-size:13px;color:#647567}.arrival-panel button{font:inherit;width:100%;min-height:48px;border-radius:12px;padding:14px;cursor:pointer;margin-top:12px}.arrival-primary{border:0;background:#24443d;color:white}.arrival-secondary{border:1px solid #bdcdbd;background:transparent;color:#24443d;font-size:13px!important}.arrival-panel button:focus-visible{outline:3px solid #b78432;outline-offset:4px}.arrival-panel button:disabled{opacity:.6;cursor:wait}small{display:block;margin-top:16px}@media(max-width:500px){.arrival-panel{padding:26px}h2{font-size:30px}}
.score-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.score-grid section{padding:12px;border:1px solid #d5dfcf;border-radius:16px}.score-grid h3{margin:0 0 12px}.score-circle{width:82px;height:82px;border:6px solid;border-radius:50%;display:flex;flex-direction:column;justify-content:center;margin:auto}.score-circle strong{font-size:29px}.score-circle small{margin:0;font-size:11px}.score-grid p{font-size:13px;margin:12px 0}.change{font-weight:700}.change span{display:block;font-weight:400;font-size:11px}.feedback-context{font-size:12px}.answers{text-align:left;border-top:1px solid #d5dfcf;margin-top:20px;padding-top:12px}.answers dt{font-weight:600;line-height:1.5}.answers dd{margin:8px 0 20px;white-space:pre-wrap}
</style>
