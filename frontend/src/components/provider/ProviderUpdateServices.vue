<script setup>
import {reactive,ref,watch} from 'vue';
const props=defineProps({data:Object,busy:Boolean,readonly:Boolean});
const emit=defineEmits(['complete','draft']);
const form=reactive({selected:[],subjects:'',ages:'',grades:'',bio:'',acceptingNewStudents:true});
const error=ref('');
const list=value=>String(value||'').split(',').map(v=>v.trim()).filter(Boolean);
watch(()=>props.data,data=>{const t=data?.tutoring||{};Object.assign(form,{selected:[...(data?.selected||[])],subjects:(t.subjectAreas||[]).join(', '),ages:(t.ageGroups||[]).join(', '),grades:(t.gradeLevels||[]).join(', '),bio:t.bio||'',acceptingNewStudents:t.acceptingNewStudents!==false});},{immediate:true});
const draft=()=>({selected:[...form.selected],tutoring:{subjectAreas:list(form.subjects),ageGroups:list(form.ages),gradeLevels:list(form.grades),bio:form.bio,acceptingNewStudents:form.acceptingNewStudents}});
function save(){error.value='';if(form.selected.includes('tutoring')&&(!list(form.subjects).length||!list(form.ages).length||!list(form.grades).length)){error.value='Complete your tutoring subjects/topics, ages and grade levels.';return;}emit('complete',draft());}
defineExpose({draft});
</script>
<template>
 <div class="services-review">
  <p>Select all services you provide. You can provide counseling and tutoring together. Your verified qualifications and approved assignment govern counseling scope; these choices do not change your pay category, level, rates or booking approval.</p>
  <fieldset :disabled="busy||readonly"><legend>Your services</legend>
   <label v-for="option in data?.options||[]" :key="option.serviceType" class="check"><input v-model="form.selected" type="checkbox" :value="option.serviceType"/>{{option.serviceType==='counseling'?'Counseling — within my approved scope':option.displayName}}</label>
   <p v-if="!data?.options?.length">No services are configured for this agency. Ask People Operations to review your assignment.</p>
  </fieldset>
  <p v-if="form.selected.includes('counseling') && data?.credentialTier==='bachelors'">Bachelor’s-level counseling uses the approved facilitator role and oversight. It does not mean you are prelicensed or need licensure-hour tracking. Review the counseling focus questions separately.</p>
  <fieldset v-if="form.selected.includes('tutoring')" :disabled="busy||readonly"><legend>Your tutoring details</legend>
   <label>Subjects and topics <input v-model="form.subjects" data-testid="tutoring-subjects" maxlength="1500" placeholder="Reading, fractions, study skills" required/></label>
   <label>Ages or age ranges <input v-model="form.ages" data-testid="tutoring-ages" maxlength="1500" placeholder="6–10, 11–14, adults" required/></label>
   <label>Grade levels <input v-model="form.grades" data-testid="tutoring-grades" maxlength="1500" placeholder="K–2, grades 3–5, middle school" required/></label>
   <p>Separate entries with commas. Include only ages and topics you can support.</p>
   <label>Tutoring introduction <textarea v-model="form.bio" maxlength="4000" rows="4"/></label>
   <label class="check"><input v-model="form.acceptingNewStudents" type="checkbox"/>Accepting new tutoring students</label>
  </fieldset>
  <p v-if="error" role="alert">{{error}}</p>
  <button type="button" class="pu-btn primary" :disabled="busy||readonly||!data?.options?.length" @click="save">{{busy?'Saving…':'Save and confirm my services'}}</button>
 </div>
</template>
<style scoped>.services-review,fieldset,label{display:grid;gap:12px}fieldset{min-width:0;border:1px solid #c8d7d0;border-radius:12px;padding:16px}.check{display:flex;align-items:center;gap:10px;white-space:normal}.check input{width:18px;flex:0 0 18px}input,textarea{box-sizing:border-box;width:100%;min-width:0;padding:10px;font:inherit;border:1px solid #a9bdb4;border-radius:8px}[role=alert]{color:#a32434}</style>
