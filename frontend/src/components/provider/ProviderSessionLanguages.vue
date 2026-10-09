<template>
 <fieldset class="languages"><legend>Languages you use for sessions</legend>
 <p>Only list another language if you are proficient enough to conduct sessions in that language. These choices appear on your public profile and help clients search. Conversational familiarity alone is not enough.</p>
 <div v-for="(row,index) in modelValue" :key="index" class="language-row">
  <label>Language<input :value="row.language" list="session-languages" maxlength="60" @input="change(index,'language',$event.target.value)" /></label>
  <label>Proficiency<select :value="row.proficiency" @change="change(index,'proficiency',$event.target.value)"><option value="">Choose proficiency</option><option value="professional">Professional working proficiency</option><option value="fluent">Fluent</option><option value="native">Native / bilingual</option></select></label>
  <label class="attestation"><input type="checkbox" :checked="row.canConductSessions===true" @change="change(index,'canConductSessions',$event.target.checked)"/> I can conduct sessions in this language.</label>
  <button type="button" @click="emit('update:modelValue',modelValue.filter((_,i)=>i!==index))">Remove</button>
 </div>
 <datalist id="session-languages"><option>English</option><option>Spanish</option><option>American Sign Language</option></datalist>
 <button type="button" :disabled="modelValue.length>=12" @click="emit('update:modelValue',[...modelValue,{language:'',proficiency:'',canConductSessions:false}])">Add a language</button>
 <p v-if="error" role="alert" class="language-error">{{error}}</p>
 </fieldset>
</template>
<script setup>
const props=defineProps({modelValue:{type:Array,default:()=>[]},error:String});
const emit=defineEmits(['update:modelValue']);
function change(index,key,value){emit('update:modelValue',props.modelValue.map((row,i)=>i===index?{...row,[key]:value}:row));}
</script>
<style scoped>
.languages{border:1px solid #b9c9d5;border-radius:10px;padding:16px;margin:18px 0}.languages legend{font-weight:700}.language-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px 0;border-bottom:1px solid #dae2e8}.language-row label{display:grid;gap:6px}.language-row input,.language-row select{padding:9px;font:inherit}.language-row .attestation{display:flex;align-items:center}.language-error{color:#a32222;font-weight:600}button{padding:8px 12px;margin-top:8px} @media(max-width:600px){.language-row{grid-template-columns:1fr}}
</style>
