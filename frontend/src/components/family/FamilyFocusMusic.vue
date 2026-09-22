<template>
  <section v-show="open" class="family-focus-music" aria-label="Focus music">
    <header><div><h2>♫ Focus music</h2><p>Music for homework, chores, or a quiet moment together.</p></div><button @click="$emit('close')" aria-label="Close focus music">×</button></header>
    <p v-if="loading" role="status">Loading music…</p><p v-if="error" role="alert">{{ error }} <button @click="load">Try again</button></p>
    <template v-if="tracks.length">
      <label>Choose music<select v-model="trackId" @change="chooseTrack"><option v-for="t in tracks" :key="t.id" :value="t.id">{{ t.title }}{{ t.artist ? ' · '+t.artist : '' }}</option></select></label>
      <div class="music-buttons"><button @click="step(-1)" aria-label="Previous track">⏮</button><button @click="toggle" :aria-label="playing?'Pause music':'Play music'">{{ playing?'Ⅱ Pause':'▶ Play' }}</button><button @click="step(1)" aria-label="Next track">⏭</button><button @click="shuffle=!shuffle" :aria-pressed="shuffle">Shuffle</button><button @click="repeat=!repeat" :aria-pressed="repeat">Repeat track</button><button @click="stop">Stop</button></div>
    </template>
    <p v-else-if="!loading&&!error">The music library is empty.</p>
    <audio ref="audio" controls preload="none" :src="current?.streamUrl" :loop="repeat" @play="playing=true" @pause="playing=false" @ended="step(1)" @error="playbackError" aria-label="Focus music playback" />
  </section>
  <div v-if="playing&&!open" class="music-mini" role="status"><span>♫ {{ current?.title }}</span><button @click="toggle">Pause music</button><button @click="$emit('open')">Open player</button></div>
</template>
<script setup>
import {computed,nextTick,onBeforeUnmount,ref,watch} from 'vue';
const props=defineProps({http:{required:true},open:Boolean,userId:{required:true}});
defineEmits(['close','open']);
const tracks=ref([]),trackId=ref(''),audio=ref(null),playing=ref(false),loading=ref(false),error=ref(''),shuffle=ref(false),repeat=ref(false);
const current=computed(()=>tracks.value.find(t=>t.id===trackId.value));
async function load(){if(loading.value)return;loading.value=true;error.value='';try{tracks.value=(await props.http.get('/focus-music/catalog')).data.tracks || [];if(!current.value)trackId.value=tracks.value[0]?.id || '';}catch(e){error.value=e.response?.data?.error?.message || 'Music could not be loaded.';}finally{loading.value=false;}}
async function play(){if(!current.value||!audio.value)return;error.value='';try{await audio.value.play();}catch{error.value='Tap Play to start music on this device.';}}
function toggle(){if(playing.value)audio.value.pause();else play();}
async function chooseTrack(){const resume=playing.value;await nextTick();audio.value?.load();if(resume)play();}
async function step(direction){if(!tracks.value.length)return;const index=tracks.value.findIndex(t=>t.id===trackId.value);const offset=shuffle.value&&tracks.value.length>1?1+Math.floor(Math.random()*(tracks.value.length-1)):direction;trackId.value=tracks.value[(index+offset+tracks.value.length)%tracks.value.length].id;await nextTick();audio.value?.load();play();}
function stop(){if(audio.value){audio.value.pause();audio.value.currentTime=0;}}
function playbackError(){if(current.value)error.value='This track could not play. Try another track or refresh the library.';}
watch(()=>props.open,open=>{if(open&&!tracks.value.length)load();},{immediate:true});
watch(()=>props.userId,()=>{stop();tracks.value=[];trackId.value='';if(props.open)load();});
onBeforeUnmount(()=>{if(audio.value){audio.value.pause();audio.value.removeAttribute('src');audio.value?.load();}});
</script>
<style scoped>
.family-focus-music{padding:16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;margin-bottom:14px;color:var(--ink)}header{display:flex;justify-content:space-between;gap:12px;align-items:start}h2{margin:0;font-size:20px}p{font-size:13px;margin:4px 0 12px}button,select{font:inherit;padding:8px 12px;border:1px solid var(--control);border-radius:8px;background:var(--surface);color:var(--ink);cursor:pointer}label{display:flex;gap:8px;align-items:center;font-size:13px}select{max-width:100%;min-width:0;flex:1}.music-buttons{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}button[aria-pressed=true]{background:var(--purple);color:white}audio{width:100%;height:36px;margin-top:4px}.music-mini{position:fixed;bottom:10px;right:12px;z-index:15;display:flex;gap:8px;align-items:center;max-width:calc(100vw - 24px);padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 3px 16px #0002;font-size:12px}.music-mini span{max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.music-mini button{font-size:12px}@media(max-width:600px){.music-mini span{max-width:100px}.music-mini{gap:4px}.music-mini button{padding:8px}}
</style>
