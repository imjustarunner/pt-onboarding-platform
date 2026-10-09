<template>
 <div class="focus-editor">
  <p>First, deselect “Consider matches” for every area you do not serve. Those areas turn gray and are excluded from matching. Then choose {{ requireThree ? 'exactly three' : 'up to three' }} of your strongest areas in each category to highlight on your profile. Other areas you leave selected remain available for matching. An available area is an invitation to discuss fit, not a claim of specialized training.</p>
  <div v-if="requireThree &amp;&amp; missing.length" class="focus-required" :role="showErrors?'alert':'status'">Before continuing, choose three top choices in each category. Still needed: <strong>{{missing.map(g=>g.label).join(', ')}}</strong>.</div>
  <fieldset v-for="group in groups" :key="group.key" :data-focus-group="group.key" :class="{'focus-missing':requireThree &amp;&amp; missing.some(g=>g.key===group.key)}" tabindex="-1">
   <legend>{{group.label}} · {{value.top[group.key]?.length||0}} of 3 highlighted</legend>
   <p v-if="requireThree &amp;&amp; missing.some(g=>g.key===group.key)" class="focus-required"><strong>Required: select {{3-(value.top[group.key]?.length||0)}} more top {{3-(value.top[group.key]?.length||0)===1?'choice':'choices'}} here.</strong></p>
   <p v-if="group.previous?.length">Currently listed: {{group.previous.join('; ')}}.</p>
   <p>Turn off “Consider matches” for areas you do not serve. Select your strongest areas under “Top three.”</p>
   <div class="focus-options"><div v-for="option in group.options" :key="option" class="focus-option" :class="{ excluded:value.excluded[group.key]?.includes(option), highlighted:value.top[group.key]?.includes(option) }">
    <span>{{option}}</span>
    <label><input type="checkbox" :checked="!value.excluded[group.key]?.includes(option)" @change="toggleAllowed(group.key,option,$event.target.checked)" /> Consider matches</label>
    <label><input type="checkbox" :checked="value.top[group.key]?.includes(option)" :disabled="value.excluded[group.key]?.includes(option)||(!value.top[group.key]?.includes(option)&&value.top[group.key]?.length>=3)" @change="toggleTop(group.key,option,$event.target.checked)" /> Top three</label>
   </div></div>
  </fieldset>
 </div>
</template>
<script setup>
import {computed} from 'vue';
import {missingFocusGroups} from '../../navigation/providerFocus';
const props=defineProps({modelValue:{type:Object,required:true},groups:{type:Array,required:true},requireThree:Boolean,showErrors:Boolean}),emit=defineEmits(['update:modelValue']);
const value=computed(()=>props.modelValue);
const missing=computed(()=>missingFocusGroups(props.modelValue,props.groups));
function update(key,option,on,field){const next=JSON.parse(JSON.stringify(props.modelValue));const list=next[field][key]||[];if(field==='top'&&on&&(next.excluded[key]?.includes(option)||(!list.includes(option)&&list.length>=3)))return;next[field][key]=on?[...new Set([...list,option])]:list.filter(v=>v!==option);if(field==='excluded'&&on)next.top[key]=(next.top[key]||[]).filter(v=>v!==option);emit('update:modelValue',next);}
function toggleAllowed(key,option,on){update(key,option,!on,'excluded');}function toggleTop(key,option,on){update(key,option,on,'top');}
</script>
<style scoped>
.focus-required{padding:12px;border-radius:8px;background:#fff3d6;color:#704500;line-height:1.6}.focus-missing{border:2px solid #b87915}.focus-missing:focus{outline:3px solid #ad6719;outline-offset:4px}

.focus-editor,fieldset{display:grid;gap:16px}fieldset{border:1px solid #dbe4df;border-radius:12px;padding:18px;min-width:0}.focus-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:8px}.focus-option{display:grid;grid-template-columns:1fr auto;gap:8px;background:#f5f8f6;border-radius:8px;padding:12px}.focus-option.highlighted{background:#e1f2e8;box-shadow:inset 0 0 0 2px #3d6b4f}.focus-option.excluded{background:#ededed;color:#737373}.focus-option.excluded>span{text-decoration:line-through}.focus-option>span{grid-column:1/-1;font-weight:600}label{font-size:.85rem;display:flex;align-items:center;gap:5px}legend{font-weight:700}p{color:#52665e;line-height:1.5}
</style>
