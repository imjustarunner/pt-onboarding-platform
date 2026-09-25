<template>
  <section class="family-voice" aria-label="Family voice event helper">
    <button class="voice-toggle" type="button" :aria-expanded="expanded" @click="toggle">🎙 {{ expanded ? 'Voice event helper' : filled ? 'Voice draft ready · Edit words' : 'Describe an event by voice' }} <span aria-hidden="true">{{ expanded ? '−' : '+' }}</span></button>
    <div v-if="expanded" class="voice-body">
      <p>Tell us one family plan. We’ll fill in what we can; you review and save.</p>
      <p class="voice-example">“Emma has soccer tomorrow from 5 to 6 PM at Riverside Park. Dad is picking up. Bring cleats and water.”</p>
      <button v-if="appleTouch" type="button" class="voice-dictation" :disabled="working" @click="dictateWithKeyboard">🎙 Use keyboard dictation</button>
      <p v-if="appleTouch" class="voice-hint">Tap the microphone on your keyboard, speak your plan, then tap Fill event form.</p>
      <button v-if="supported" type="button" class="voice-mic" :disabled="working" :aria-pressed="listening" @click="listening ? stop() : start()">{{ listening ? '■ Stop listening' : '🎙 Start speaking' }}</button>
      <p v-if="!supported && !appleTouch" class="voice-hint">You can use your keyboard’s dictation microphone in the box below, or type your plan.</p>
      <p v-if="listening" role="status">{{ starting ? "Starting microphone… you can cancel and type instead." : "Listening… tap Stop when you’re done." }}</p>
      <button v-if="listening || working" type="button" class="voice-manual" @click="useManual">Cancel voice · enter manually</button>
      <label>Your words<textarea ref="wordsInput" v-model="transcript" rows="4" maxlength="4000" :disabled="listening || working" placeholder="Who, what, when, where, and anything to remember…" /></label>
      <p class="voice-hint">Times use {{ timezone }}. Your browser transcribes your voice. Fill event form sends the words to the family AI helper.</p>
      <button type="button" class="voice-fill" :disabled="listening || working || !transcript.trim()" @click="fill">{{ working ? 'Preparing your draft…' : 'Fill event form' }}</button>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
    <div v-if="filled" class="voice-result"><p role="status">Draft filled. Check the details below, finish anything missing, then tap Save to our family.</p><ul v-if="review.length" class="voice-review" aria-label="Details to review"><li v-for="(item,i) in review" :key="i">{{ item }}</li></ul></div>
  </section>
</template>
<script setup>
import { ref, watch, onUnmounted } from 'vue';
const props=defineProps({http:{type:Function,required:true},householdId:{type:[Number,String],required:true},timezone:{type:String,required:true},initiallyOpen:Boolean});
const emit=defineEmits(['draft','active','microphone-start']);
const expanded=ref(props.initiallyOpen),transcript=ref(''),listening=ref(false),starting=ref(false),working=ref(false),error=ref(''),filled=ref(false),review=ref([]);
// Do not start WebKit's page-level speech service on iPads/iPhones. Native keyboard
// dictation keeps microphone ownership in the OS and cannot strand the event form.
const appleTouch=/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const Speech=appleTouch?null:(window.SpeechRecognition || window.webkitSpeechRecognition);
const supported=!!Speech,wordsInput=ref(null);
function dictateWithKeyboard(){emit('microphone-start');wordsInput.value?.focus();}
let recognition=null,timer=null,stopTimer=null,startTimer=null,silenceTimer=null,controller=null,disposed=false;
watch([listening,working],()=>emit('active',listening.value||working.value));
function releaseMic(){
  clearTimeout(timer);clearTimeout(stopTimer);clearTimeout(startTimer);clearTimeout(silenceTimer);
  const rec=recognition;recognition=null;
  if(rec){rec.onstart=null;rec.onaudiostart=null;rec.onresult=null;rec.onerror=null;rec.onend=null;try{rec.abort();}catch{}}
  listening.value=false;starting.value=false;
}
function start(){
  if(!Speech||listening.value||working.value)return;
  error.value='';filled.value=false;
  const prefix=transcript.value.trim();
  try{
    const rec=new Speech();recognition=rec;rec.lang=navigator.language||'en-US';rec.continuous=false;rec.interimResults=true;
    const ready=()=>{if(recognition!==rec)return;starting.value=false;clearTimeout(startTimer);};
    rec.onstart=ready;rec.onaudiostart=ready;
    rec.onresult=event=>{
      if(recognition!==rec)return;
      ready();clearTimeout(silenceTimer);
      const words=Array.from(event.results).map(r=>r[0]?.transcript || '').join(' ');
      transcript.value=[prefix,words].filter(Boolean).join(' ').slice(0,4000);
      if(transcript.value.length===4000)stop();
    };
    rec.onerror=event=>{
      if(recognition!==rec)return;
      const hints={'not-allowed':'Microphone access was denied. Enable it in your browser settings, or use keyboard dictation below.','service-not-allowed':'Speech recognition is unavailable. Use keyboard dictation or type below.','audio-capture':'No microphone is available. Check your microphone or use keyboard dictation.','no-speech':'No speech was heard. Try again or type your plan.','network':'Speech recognition lost its connection. Your words are still here; retry or use keyboard dictation.'};
      error.value=hints[event.error] || 'Speech recognition stopped. You can edit your words below and continue.';releaseMic();
    };
    rec.onend=()=>{if(recognition!==rec)return;releaseMic();};
    // Bound both a stalled native permission/start request and a service that starts but never hears words.
    listening.value=true;starting.value=true;
    startTimer=setTimeout(()=>{if(recognition===rec){releaseMic();error.value='The microphone did not start. Use keyboard dictation or type your plan below.';}},8000);
    silenceTimer=setTimeout(()=>{if(recognition===rec){releaseMic();error.value='No words came through. Use keyboard dictation or type below, or try the microphone again.';}},15000);
    timer=setTimeout(stop,60000);
    emit('microphone-start');rec.start();
  }catch{releaseMic();error.value='Could not start the microphone. You can use keyboard dictation or type below.';}
}
function stop(){
  clearTimeout(timer);clearTimeout(startTimer);clearTimeout(silenceTimer);
  try{recognition?.stop();}catch{releaseMic();}
  // Keep final results after stop(), but do not leave the UI stuck if a browser never emits end.
  stopTimer=setTimeout(releaseMic,3000);
}
function cancel(){
  releaseMic();const request=controller;controller=null;request?.abort();working.value=false;
}
function useManual(){cancel();error.value='Voice stopped. You can type here or complete the event form below.';}
defineExpose({cancel});
function toggle(){
  expanded.value=!expanded.value;
  if(!expanded.value)cancel();
}
async function fill(){
  if(listening.value||working.value||!transcript.value.trim())return;
  working.value=true;error.value='';filled.value=false;review.value=[];
  const request=new AbortController();controller=request;
  try{
    const {data}=await props.http.post(`/households/${props.householdId}/voice/event-draft`,{transcript:transcript.value.trim()},{signal:request.signal,timeout:60000});
    if(disposed||request.signal.aborted)return;
    review.value=data.review || [];emit('draft',data.draft);filled.value=true;expanded.value=false;
  }catch(e){if(!disposed&&!request.signal.aborted)error.value=e.response?.data?.error?.message || 'Could not prepare the draft. Your words are still here. Try again or fill in the form below.';}
  finally{if(controller===request){controller=null;working.value=false;}}
}
watch(()=>props.householdId,()=>{cancel();transcript.value='';review.value=[];filled.value=false;});
onUnmounted(()=>{disposed=true;cancel();emit('active',false);});
</script>
<style scoped>
.family-voice button{font:inherit;font-size:14px;border:1px solid var(--control);border-radius:8px;padding:10px 14px;background:var(--surface);color:var(--ink);cursor:pointer}.voice-result{padding:12px 16px 16px;font-size:14px;line-height:1.6}.voice-result p{margin:0 0 8px}.family-voice{border:1px solid var(--control);border-radius:12px;background:var(--soft);overflow:hidden}.voice-toggle{display:flex;justify-content:space-between;gap:12px;width:100%;min-height:48px;padding:12px 16px!important;text-align:left;color:var(--purple);font-weight:700}.voice-body{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:0 16px 18px}.voice-body p{margin:0;line-height:1.6}.voice-example,.voice-hint{font-size:13px;color:var(--muted)}.voice-body label{display:flex;flex-direction:column;gap:6px}.voice-body textarea{width:100%;box-sizing:border-box;resize:vertical;font:inherit;min-height:100px;border:1px solid var(--control);border-radius:8px;padding:10px;background:var(--surface);color:var(--ink)}.voice-mic,.voice-fill{align-self:flex-start;min-height:46px}.voice-fill{background:var(--purple)!important;color:white!important}.voice-review{padding:12px 12px 12px 28px;margin:0;background:var(--surface);border-radius:8px;font-size:14px;line-height:1.6}.voice-body [role=alert]{color:#8b2f21}.voice-body [role=status]{font-weight:600}.voice-body button:disabled{opacity:.6}
</style>
