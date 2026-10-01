<template>
  <section class="transcription-panel" aria-label="Session transcription">
    <strong>{{capturing?'Transcription on':state?.paused?'Transcription paused':'Transcription off'}}</strong>
    <p role="status">{{hint || state?.reason}}</p>
    <button v-if="state?.allowed && !state.stopped && !state.finishing" type="button" class="btn btn-secondary" @click="control(state.requested?(state.paused?'resume':'pause'):'start')" :disabled="busy || (!isHost && !state.requested)">{{!state.requested?'Start transcription':state.paused?'Resume transcription':'Pause transcription'}}</button>
    <p v-if="error" role="alert">{{error}}</p>
  </section>
</template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';import {createConsentedAudioCapture} from '../../composables/consentedAudioCapture';
const props=defineProps({baseUrl:{type:String,required:true},connected:Boolean,isHost:Boolean,getStream:Function});const state=ref(null),capturing=ref(false),hint=ref(''),error=ref(''),busy=ref(false);let capture=null;
function start(){if(capture)return;capture=createConsentedAudioCapture({baseUrl:props.baseUrl,getStream:props.getStream,isHost:props.isHost,onState:v=>state.value=v,onCapturing:v=>capturing.value=v,onHint:v=>hint.value=v});capture.start();}
watch(()=>props.connected,value=>{if(value)start();else{capture?.stop();capture=null;}},{immediate:true});
async function control(action){busy.value=true;error.value='';try{await capture?.control(action);}catch(e){error.value=e.response?.data?.error?.message||'Unable to change transcription.';}finally{busy.value=false;}}
async function flush(){await capture?.flush();capture=null;}
defineExpose({flush,getState:()=>state.value});onBeforeUnmount(()=>{void capture?.flush();});
</script>
<style scoped>.transcription-panel{border:1px solid #b8cfc6;background:#f0f7f4;border-radius:10px;padding:12px 16px;color:#173e34;margin:12px 0}.transcription-panel p{margin:6px 0;font-size:13px}[role=alert]{color:#a12727}</style>
