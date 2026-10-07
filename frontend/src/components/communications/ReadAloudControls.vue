<template>
 <div class="read-aloud" aria-label="Listen to this update">
  <button type="button" :disabled="!voice" @click="toggle">{{speaking?(paused?'Resume':'Pause'):'Listen to this update'}}</button>
  <button v-if="speaking" type="button" @click="stop">Stop</button>
  <label>Speed<select v-model.number="rate" :disabled="speaking"><option :value="0.85">Slower</option><option :value="1">Normal</option><option :value="1.15">Faster</option></select></label>
  <small role="status">{{message || (voice?'Uses an on-device voice.':'An on-device voice is not available in this browser. You can use your device’s reading tools.')}}</small>
 </div>
</template>
<script setup>
import {onMounted,onBeforeUnmount,ref,watch} from 'vue';
const props=defineProps({html:{type:String,default:''}});const voice=ref(null),rate=ref(1),speaking=ref(false),paused=ref(false),message=ref('');
let queue=[],session=0;const synth=typeof window!=='undefined'?window.speechSynthesis:null;
function voices(){const local=synth?.getVoices().filter(v=>v.localService)||[];voice.value=local.find(v=>/^en-US/i.test(v.lang))||local.find(v=>/^en/i.test(v.lang))||null;}
function stop(){session++;synth?.cancel();speaking.value=false;paused.value=false;queue=[];}
function next(run){if(run!==session)return;const text=queue.shift();if(!text){speaking.value=false;return;}const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice.value;utterance.rate=rate.value;utterance.onend=()=>next(run);utterance.onerror=()=>{if(run===session){stop();message.value='Reading stopped. You can restart or use your device’s reading tools.';}};synth.speak(utterance);}
function toggle(){if(!voice.value)return;if(speaking.value){paused.value=!paused.value;paused.value?synth.pause():synth.resume();return;}stop();message.value='';const doc=new DOMParser().parseFromString(props.html,'text/html');doc.querySelectorAll('style,script,nav,button').forEach(n=>n.remove());doc.querySelectorAll('p,h1,h2,h3,li,td,th,br').forEach(n=>n.append(' '));const text=(doc.body.textContent||'').replace(/\s+/g,' ').trim();queue=text.match(/.{1,220}(?:\s|$)|\S{1,220}/g)||[];speaking.value=queue.length>0;next(session);}
onMounted(()=>{voices();synth?.addEventListener('voiceschanged',voices);});onBeforeUnmount(()=>{stop();synth?.removeEventListener('voiceschanged',voices);});watch(()=>props.html,stop);
</script>
<style scoped>.read-aloud{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 18px;background:#f0f6f2;color:#284635}.read-aloud button{border:1px solid #bdd2c3;background:white;border-radius:8px;padding:8px 12px}.read-aloud select{margin-left:5px}.read-aloud small{font-size:12px}</style>
