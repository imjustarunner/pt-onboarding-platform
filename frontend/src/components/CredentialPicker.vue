<template>
 <div class="credential-picker">
  <label>Add a credential<select v-model="selected" :disabled="disabled" @change="add"><option value="">Choose a degree, license or certification…</option><optgroup v-for="group in CREDENTIAL_GROUPS" :key="group.label" :label="group.label"><option v-for="value in group.values.filter(v=>!items.includes(v))" :key="value" :value="value">{{value}}</option></optgroup></select></label>
  <ol aria-label="Credentials in display order"><li v-for="(item,i) in items" :key="item"><strong>{{item}}</strong><span v-if="!CREDENTIAL_OPTIONS.includes(item)" class="invalid">Choose a listed credential</span><button type="button" :disabled="disabled || i===0" :aria-label="`Move ${item} earlier`" @click="move(i,-1)">↑</button><button type="button" :disabled="disabled || i===items.length-1" :aria-label="`Move ${item} later`" @click="move(i,1)">↓</button><button type="button" :disabled="disabled" :aria-label="`Remove ${item}`" @click="update(items.filter((_,n)=>n!==i))">×</button></li></ol>
  <p v-if="items.length" class="credential-preview" aria-live="polite">Display: <strong>{{items.join(', ')}}</strong></p>
  <small>Choose one at a time. Use the arrows to set the order. Select only credentials you hold; license verification is handled separately. Contact People Operations if an option is missing.</small>
 </div>
</template>
<script setup>
import {computed,ref} from 'vue';
import {CREDENTIAL_GROUPS,CREDENTIAL_OPTIONS,credentialItems} from '../utils/credentialDisplay.js';
const props=defineProps({modelValue:String,disabled:Boolean});const emit=defineEmits(['update:modelValue','change']);
const selected=ref(''),items=computed(()=>credentialItems(props.modelValue));
function update(next){const value=next.join(', ');emit('update:modelValue',value);emit('change',value);}
function add(){if(selected.value&&!items.value.includes(selected.value))update([...items.value,selected.value]);selected.value='';}
function move(i,delta){const next=[...items.value];[next[i],next[i+delta]]=[next[i+delta],next[i]];update(next);}
</script>
<style scoped>
.credential-picker{font:inherit;display:grid;gap:10px;min-width:0}.credential-picker label{display:grid;gap:6px}.credential-picker select{width:100%;padding:12px;border:1px solid #b8cfc5;border-radius:8px;font:inherit;background:#fff;color:#203e34}.credential-picker ol{list-style:none;display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0}.credential-picker li{display:flex;align-items:center;gap:6px;background:#edf5f1;padding:6px 9px;border-radius:9px}.credential-picker button{font:inherit;min-width:36px;min-height:36px;border:1px solid #c8d9d0;border-radius:6px;background:white;cursor:pointer;padding:4px}.credential-picker button:disabled{opacity:.35;cursor:default}.credential-picker small{font-size:12px;color:#536c63;font-weight:400}.credential-preview{margin:0;font-size:14px}.invalid{color:#a32d26;font-size:12px}
</style>
