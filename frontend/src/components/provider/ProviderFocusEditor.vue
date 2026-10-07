<template>
 <div class="focus-editor">
  <p>Choose up to three primary areas in each category to highlight on your profile. Leave an area available for matching unless you explicitly exclude it. An available area is an invitation to discuss fit, not a claim of specialized training.</p>
  <fieldset v-for="group in groups" :key="group.key">
   <legend>{{group.label}} · {{value.top[group.key]?.length||0}} of 3 highlighted</legend>
   <p v-if="group.previous?.length">Currently listed: {{group.previous.join('; ')}}.</p>
   <p>Turn off “Consider matches” for areas you do not serve. Select your strongest areas under “Top three.”</p>
   <div class="focus-options"><div v-for="option in group.options" :key="option" class="focus-option">
    <span>{{option}}</span>
    <label><input type="checkbox" :checked="!value.excluded[group.key]?.includes(option)" @change="toggleAllowed(group.key,option,$event.target.checked)" /> Consider matches</label>
    <label><input type="checkbox" :checked="value.top[group.key]?.includes(option)" :disabled="value.excluded[group.key]?.includes(option)||(!value.top[group.key]?.includes(option)&&value.top[group.key]?.length>=3)" @change="toggleTop(group.key,option,$event.target.checked)" /> Top three</label>
   </div></div>
  </fieldset>
 </div>
</template>
<script setup>
import {computed} from 'vue';
const props=defineProps({modelValue:{type:Object,required:true},groups:{type:Array,required:true}}),emit=defineEmits(['update:modelValue']);
const value=computed(()=>props.modelValue);
function update(key,option,on,field){const next=JSON.parse(JSON.stringify(props.modelValue));const list=next[field][key]||[];next[field][key]=on?[...new Set([...list,option])]:list.filter(v=>v!==option);if(field==='excluded'&&on)next.top[key]=(next.top[key]||[]).filter(v=>v!==option);emit('update:modelValue',next);}
function toggleAllowed(key,option,on){update(key,option,!on,'excluded');}function toggleTop(key,option,on){update(key,option,on,'top');}
</script>
<style scoped>
.focus-editor,fieldset{display:grid;gap:16px}fieldset{border:1px solid #dbe4df;border-radius:12px;padding:18px;min-width:0}.focus-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:8px}.focus-option{display:grid;grid-template-columns:1fr auto;gap:8px;background:#f5f8f6;border-radius:8px;padding:12px}.focus-option>span{grid-column:1/-1;font-weight:600}label{font-size:.85rem;display:flex;align-items:center;gap:5px}legend{font-weight:700}p{color:#52665e;line-height:1.5}
</style>
