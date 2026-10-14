<template>
 <details class="matching-preferences" :open="expanded">
  <summary>{{es?'Preferencias para encontrar un profesional (opcional)':'Provider fit preferences (optional)'}}</summary>
  <p>{{es?'Elija las preferencias pertinentes por categoría. Puede dejar cualquiera en blanco. No necesita revelar su identidad ni su pertenencia a una comunidad para recibir servicios. Estas preferencias ayudan a hablar sobre compatibilidad; no garantizan disponibilidad ni experiencia especializada.':'Choose the relevant preferences in each category, or leave any category blank. You do not need to disclose your identity or community membership to receive services. These preferences guide a fit discussion; they do not guarantee availability or specialized expertise.'}}</p>
  <p>{{es?'Sus preferencias no se publican en perfiles públicos.':'Your preferences are not published on public profiles.'}}</p>
  <fieldset v-for="group in groups" :key="group.key"><legend>{{es?labels[group.key]:group.label}} · {{selected(group.key).length}}<template v-if="maxSelections"> / {{maxSelections}}</template></legend>
   <p v-if="group.key==='populations'">{{es?'Seleccione comunidades que desea que su profesional comprenda. Elegir una opción no declara una identidad.':'Select communities you would like your provider to understand. A selection is a preference, not a declaration of identity.'}}</p>
   <div class="options"><label v-for="option in group.options" :key="option"><input type="checkbox" :checked="selected(group.key).includes(option)" :disabled="!!maxSelections&&selected(group.key).length>=maxSelections&&!selected(group.key).includes(option)" @change="toggle(group.key,option,$event.target.checked)"/>{{option}}</label></div>
  </fieldset>
 </details>
</template>
<script setup>
import {computed} from 'vue';import {FOCUS_GROUPS} from '../../navigation/providerFocus.js';
const props=defineProps({modelValue:{type:Object,default:()=>({})},locale:{type:String,default:'en'},maxSelections:{type:Number,default:3},expanded:Boolean,allowedOptions:{type:Object,default:null}}),emit=defineEmits(['update:modelValue']);
const es=computed(()=>props.locale==='es');
const groups=computed(()=>FOCUS_GROUPS.map(g=>({...g,options:props.allowedOptions?g.options.filter(o=>(props.allowedOptions[g.key]||[]).includes(o)||selected(g.key).includes(o)):g.options})).filter(g=>g.options.length));
const labels={specialties:'Especialidades',ageGroups:'Edades',populations:'Comunidades',modalities:'Enfoques de terapia'};
const selected=key=>props.modelValue?.[key]||[];
function toggle(key,option,on){const list=selected(key);if(on&&props.maxSelections&&list.length>=props.maxSelections)return;emit('update:modelValue',{...props.modelValue,[key]:on?[...list,option]:list.filter(v=>v!==option)});}
</script>
<style scoped>
.matching-preferences{background:#f7faf8;border:1px solid #d8e4dd;padding:18px;border-radius:12px;margin:16px 0}summary{font-weight:650;cursor:pointer}p{line-height:1.6;color:#435b50}fieldset{border:1px solid #dae4de;padding:16px;border-radius:8px;margin-top:16px;min-width:0}legend{font-weight:650}.options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:12px;max-height:260px;overflow:auto}label{display:flex;align-items:flex-start;gap:8px;font-size:.9rem}input{margin-top:3px;flex-shrink:0}
</style>
