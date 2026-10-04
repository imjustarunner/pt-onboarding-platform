<template>
  <label>{{ label }}<input v-model="text" required maxlength="200" placeholder="Give it a name" autocomplete="off" @input="schedule" @blur="flush" /></label>
  <div v-if="suggestEvents && suggestions.length" class="event-title-suggestions" role="group" aria-label="Suggested event names">
    <button v-for="type in suggestions" :key="type.id" type="button" @pointerdown.prevent @click="choose(type.label)">{{ type.icon }} {{ type.label }}</button>
  </div>
</template>
<script setup>
import { ref, watch, onUnmounted } from 'vue';
import { searchFamilyEventGroups } from '../../utils/familyCommandCenter';
const props=defineProps({modelValue:{type:String,default:''},label:{type:String,default:'What’s happening?'},suggestEvents:Boolean});
const emit=defineEmits(['update:modelValue','change']);
const text=ref(props.modelValue),suggestions=ref([]);
let timer;
// Keep keystrokes local. In particular, do not attach the full catalog to a
// native datalist: WebKit rebuilds its keyboard suggestions as each letter lands.
function flush(){
  clearTimeout(timer);
  if(text.value!==props.modelValue){emit('update:modelValue',text.value);emit('change');}
}
function schedule(){
  clearTimeout(timer);
  timer=setTimeout(()=>{
    flush();
    suggestions.value=props.suggestEvents && text.value.trim().length>=2
      ? [...new Map(searchFamilyEventGroups(text.value).flatMap(g=>g.types).map(t=>[t.id,t])).values()].slice(0,6) : [];
  },250);
}
function choose(value){text.value=value;flush();suggestions.value=[];}
watch(()=>props.modelValue,value=>{if(value!==text.value){clearTimeout(timer);text.value=value;suggestions.value=[];}});
onUnmounted(()=>clearTimeout(timer));
defineExpose({flush});
</script>
<style scoped>
label{display:flex;flex-direction:column;gap:7px;font-size:13px;color:var(--muted)}
input{box-sizing:border-box;width:100%;border:1px solid var(--control);border-radius:9px;background:var(--surface);color:var(--ink);padding:11px 12px;min-height:44px;font:inherit;font-size:16px}
input::placeholder{color:var(--muted);opacity:1}
input:focus{outline:2px solid var(--purple);outline-offset:1px}
.event-title-suggestions{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.event-title-suggestions button{font:inherit;font-size:13px;min-height:44px;padding:8px 12px;color:var(--ink);background:var(--surface);border:1px solid var(--control);border-radius:9px;cursor:pointer}
.event-title-suggestions button:focus-visible{outline:2px solid var(--purple);outline-offset:2px}
</style>
