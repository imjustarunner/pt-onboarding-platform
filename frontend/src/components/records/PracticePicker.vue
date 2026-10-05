<template>
  <div ref="root" class="practice-picker" @keydown="key" @focusout="leave">
    <span :id="`${id}-label`" class="picker-label">Practice</span>
    <button ref="trigger" class="picker-trigger" type="button" :disabled="disabled" role="combobox" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="id" :aria-labelledby="`${id}-label ${id}-value`" @click="toggle">
      <PracticeLogo v-if="selected" :practice="selected" /><span :id="`${id}-value`">{{ selected?.name || 'Choose your practice' }}</span><span class="chevron" aria-hidden="true">⌄</span>
    </button>
    <div v-if="open" :id="id" class="picker-list" role="listbox" :aria-labelledby="`${id}-label`">
      <button v-for="p in practices" :key="p.id" type="button" :disabled="disabled" role="option" :aria-selected="String(p.id)===String(modelValue)" tabindex="-1" @click="choose(p)"><PracticeLogo :practice="p"/><span>{{ p.name }}</span><span v-if="String(p.id)===String(modelValue)" class="chevron" aria-hidden="true">✓</span></button>
    </div>
  </div>
</template>
<script setup>
import { computed,ref,nextTick,onMounted,onBeforeUnmount,useId } from 'vue';
import PracticeLogo from './PracticeLogo.vue';
const props=defineProps({disabled:Boolean,practices:{type:Array,default:()=>[]},modelValue:{type:[String,Number],default:''}});
const emit=defineEmits(['update:modelValue']);
const id=`practice-${useId()}`,root=ref(null),trigger=ref(null),open=ref(false);
const selected=computed(()=>props.practices.find(p=>String(p.id)===String(props.modelValue)));
async function focus(index){await nextTick();const options=root.value?.querySelectorAll('[role=option]');options?.[Math.max(0,Math.min(index,options.length-1))]?.focus();}
function close(){open.value=false;}
function choose(p){emit('update:modelValue',String(p.id));close();trigger.value?.focus();}
function toggle(){open.value=!open.value;if(open.value)focus(props.practices.findIndex(p=>p===selected.value));}
function key(e){
 if(props.disabled)return;
 if(e.key==='Escape'){e.preventDefault();close();trigger.value?.focus();return;}
 if(e.key==='Tab'){close();return;}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
 e.preventDefault();const options=[...(root.value?.querySelectorAll('[role=option]')||[])];const index=options.indexOf(document.activeElement);
 open.value=true;focus(e.key==='Home'?0:e.key==='End'?props.practices.length-1:e.key==='ArrowDown'?(index+1)%props.practices.length:index<=0?props.practices.length-1:index-1);
}
function leave(e){if(!root.value?.contains(e.relatedTarget))close();}
function outside(e){if(!root.value?.contains(e.target))close();}
onMounted(()=>document.addEventListener('pointerdown',outside));
onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside));
</script>
<style scoped>
.practice-picker{position:relative;margin:18px 0}.picker-label{display:block;font-size:14px;font-weight:550;color:#263958;margin-bottom:8px}.practice-picker button{display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:white!important;color:#112044!important;border:1px solid #bcc9dc!important;border-radius:7px;padding:12px!important;font:inherit;font-size:15px;cursor:pointer;min-height:56px}.chevron{margin-left:auto}.picker-list{position:absolute;top:100%;left:0;right:0;z-index:5;background:#fff;padding:6px;border:1px solid #bcc9dc;border-radius:10px;box-shadow:0 12px 28px #18386826;max-height:320px;overflow:auto}.picker-list button{border:0!important;margin:2px 0}.picker-list button:hover,.picker-list button:focus-visible,.picker-list button[aria-selected=true]{background:#edf4ff!important}.practice-picker button:focus-visible{outline:3px solid #ba891e;outline-offset:2px}
</style>
