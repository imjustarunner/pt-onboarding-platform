<template>
  <section class="job-guide" aria-label="Job interview defaults">
    <div class="guide-heading"><div><strong>{{ jobTitle || 'Applied job' }} · Interview guide</strong><p>Job questions and ratings default to this job description. Standard questions are also included.</p></div><button type="button" class="btn btn-secondary btn-sm" @click="openEditor">Edit job questions &amp; ratings</button></div>
    <p v-if="notice" role="status">{{ notice }}</p>
    <div v-if="opened" class="guide-editor">
      <p v-if="loading">Loading this job’s interview guide…</p>
      <template v-else-if="loaded">
        <label>Job-specific questions (one per line)<textarea v-model="questionText" rows="6" /></label>
        <label class="guide-check"><input v-model="customRatings" type="checkbox" /> Override rating criteria for this job</label>
        <p v-if="!customRatings">Using {{ source==='platform' ? 'platform' : 'agency' }} rating defaults.</p>
        <div v-for="(criterion,index) in criteria" :key="criterion.key" class="guide-rating"><label>Rating {{ index+1 }}<input v-model="criterion.label" :disabled="!customRatings" maxlength="200" /></label><button v-if="customRatings" type="button" class="btn btn-secondary btn-sm" @click="criteria.splice(index,1)">Remove</button></div>
        <button v-if="customRatings" type="button" class="btn btn-secondary btn-sm" @click="addRating">Add rating criterion</button>
        <p>These defaults apply to future interviews for this job at this agency. Scheduled interviews keep their saved guide and ratings.</p>
        <div class="guide-actions"><button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">{{ saving?'Saving…':'Save job defaults' }}</button><button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="opened=false">Cancel</button></div>
      </template>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],required:true},jobDescriptionId:{type:[Number,String],required:true},jobTitle:{type:String,default:''}});
const emit=defineEmits(['saved']);
const opened=ref(false),loading=ref(false),loaded=ref(false),saving=ref(false),error=ref(''),notice=ref(''),questionText=ref(''),criteria=ref([]),customRatings=ref(false),source=ref('platform');
let requestVersion=0,originalQuestions=[];
const endpoint=()=>`/hiring/interview-hub/jobs/${props.jobDescriptionId}/guide`;
function hydrate(data){originalQuestions=data.questions || [];questionText.value=originalQuestions.map(q=>typeof q==='string'?q:q.text).join('\n');criteria.value=(data.criteria || []).map(c=>({...c}));customRatings.value=data.criteriaSource==='job';source.value=data.criteriaSource;}
async function openEditor(){opened.value=true;loading.value=true;loaded.value=false;error.value='';notice.value='';const version=++requestVersion;try{const{data}=await api.get(endpoint(),{params:{agencyId:props.agencyId}});if(version!==requestVersion)return;hydrate(data.data);loaded.value=true;}catch(e){if(version===requestVersion)error.value=e.response?.data?.message||e.response?.data?.error?.message||'Could not load job defaults.';}finally{if(version===requestVersion)loading.value=false;}}
function addRating(){criteria.value.push({key:`job_rating_${Date.now()}_${criteria.value.length}`,label:'',weight:1});}
async function save(){saving.value=true;error.value='';const version=requestVersion;try{const questions=questionText.value.split('\n').map(s=>s.trim()).filter(Boolean).map((text,index)=>({key:originalQuestions[index]?.key || `job_q_${index+1}`,text}));const{data}=await api.put(endpoint(),{agencyId:props.agencyId,questions,criteria:customRatings.value?criteria.value:null});if(version!==requestVersion)return;hydrate(data.data);opened.value=false;notice.value='Job interview defaults saved.';emit('saved',data.data);}catch(e){if(version===requestVersion)error.value=e.response?.data?.message||e.response?.data?.error?.message||'Could not save job defaults.';}finally{saving.value=false;}}
watch(()=>[props.agencyId,props.jobDescriptionId],()=>{requestVersion++;opened.value=false;notice.value='';loaded.value=false;});
</script>
<style scoped>
.job-guide{border:1px solid #d8e1e8;border-radius:12px;padding:14px;background:#fff}.guide-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.job-guide p{font-size:13px;line-height:1.5;color:#536174;margin:6px 0}.guide-editor{margin-top:16px;display:grid;gap:12px}.guide-editor label{display:grid;gap:6px;font-size:13px;font-weight:600}.guide-editor textarea,.guide-editor input:not([type=checkbox]){box-sizing:border-box;width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}.guide-editor .guide-check{display:flex;align-items:center;gap:8px}.guide-rating{display:flex;gap:10px;align-items:end}.guide-rating label{flex:1}.guide-actions{display:flex;gap:10px}.job-guide [role=alert]{color:#a62135}
</style>
