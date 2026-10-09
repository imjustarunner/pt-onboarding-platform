<template>
 <form @submit.prevent="save">
  <fieldset :disabled="busy || readonly">
   <h3>Contact and address</h3>
   <label v-for="field in contactFields" :key="field[0]">{{field[1]}}<input v-model="values.contact[field[0]]" :type="field[0]==='phone'?'tel':'text'" :maxlength="field[0]==='emergency'?1000:255" /></label>
   <h3>Demographics and profile details</h3><p>Share only what you want displayed in your profile. These fields are optional.</p>
   <label v-for="field in step.demographicFields" :key="field.key">{{field.label}}<input v-model="values.demographics[field.key]" maxlength="160" /></label>
   <label>Languages spoken<input v-model="languages" placeholder="English, Spanish" /></label>
   <label>Display credential / title<input v-model="values.credential" maxlength="100" /></label>
   <template v-if="step.clinical">
    <h3>Your profile introduction</h3><textarea v-model="values.blurb" maxlength="4000" rows="5" placeholder="Introduce yourself and describe how you work with clients." />
    <ProviderFocusEditor v-model="values.clinicalFocus" :groups="step.focusGroups" />
    <h3>Typical availability</h3><p>Start with your own preferences. People Operations will arrange your office and school schedule separately.</p>
    <TypicalAvailabilityInput v-model="availability" :disabled="busy || readonly" />
   </template>
   <button v-if="!readonly" type="submit">{{busy?'Saving…':'Save user setup'}}</button>
  </fieldset>
 </form>
</template>
<script setup>
import {ref,watch} from 'vue';
import ProviderFocusEditor from '../provider/ProviderFocusEditor.vue';
import TypicalAvailabilityInput from '../publicServices/TypicalAvailabilityInput.vue';
const props=defineProps({step:{type:Object,required:true},busy:Boolean,readonly:Boolean});
const emit=defineEmits(['save']);
const values=ref({}),languages=ref(''),availability=ref('');
const contactFields=[['phone','Personal mobile phone'],['street','Street address'],['line2','Address line 2'],['city','City'],['state','State'],['postalCode','ZIP code'],['emergency','Emergency contact']];
watch(()=>props.step.values,v=>{values.value=JSON.parse(JSON.stringify(v));languages.value=(v.languages||[]).join(', ');availability.value=(v.typicalAvailability||[]).join(', ');},{immediate:true});
const list=v=>v.split(',').map(s=>s.trim()).filter(Boolean);
function save(){if(!props.busy&&!props.readonly)emit('save',{values:payload(),complete:true});}
function payload(){return {...values.value,languages:list(languages.value),typicalAvailability:list(availability.value)};}
</script>
<style scoped>
fieldset{border:0;padding:0;display:grid;gap:18px;min-width:0}label{display:grid;gap:8px}input,textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #bccbc7;border-radius:8px;font:inherit}button{padding:14px;border:0;border-radius:8px;background:var(--hire-brand,#17624b);color:white;font:inherit}h3{margin-bottom:0}
</style>
