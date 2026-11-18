<template>
  <section class="job-guide" aria-label="Job interview defaults">
    <div class="guide-heading">
      <div><strong>{{ jobTitle || 'Applied job' }} · Interview guide</strong><p>New interviews start with this job’s guide. Interviewers can switch sets or choose individual questions. Questions stay private to the hiring team.</p></div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="saving || disabled" @click="openEditor">Edit job questions &amp; ratings</button>
    </div>
    <p v-if="loading" role="status">Loading this job’s interview guide…</p>
    <p v-if="loaded" class="guide-source">{{ hasSavedGuide ? 'Saved job default' : `${starterSource === 'company' ? 'Company' : 'Plotline'} starter · no saved job default yet` }} · {{ previewQuestions.length }} questions<span v-if="isDirty"> · Unsaved changes</span></p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="!loaded && !loading" type="button" class="btn btn-secondary btn-sm" @click="loadGuide">Retry loading questions</button>
    <details v-if="loaded && !opened" class="guide-preview"><summary>View {{ hasSavedGuide ? 'saved' : 'starter' }} interview questions</summary><ol><li v-for="(text,index) in previewQuestions" :key="index">{{ text }}</li></ol></details>
    <fieldset v-if="opened && loaded" class="guide-editor" :disabled="saving || disabled">
      <p v-if="embeddedInPosting">Save changes at the bottom of this posting saves your edited questions too. You can also save just the guide below.</p>
      <label>Start from a question set<select v-model="sourceSet"><option value="starter">{{ starterSource === 'company' ? 'Company' : 'Plotline' }} starter questions</option><option v-for="set in availableSets" :key="set.id" :value="String(set.id)">{{ set.title }}{{ Number(set.id) === Number(savedGuideId) ? ' · Job default' : '' }}</option></select></label>
      <button type="button" class="btn btn-secondary btn-sm" @click="useSource">Use selected questions</button>
      <p>Copies questions into this job’s draft. Other jobs and shared sets keep their own questions.</p>
      <label>Job-specific questions (one per line)<textarea v-model="questionText" rows="8" /></label>
      <label class="guide-check"><input v-model="customRatings" type="checkbox" /> Override rating criteria for this job</label>
      <p v-if="!customRatings">Using {{ source === 'platform' ? 'platform' : 'agency' }} rating defaults.</p>
      <div v-for="(criterion,index) in criteria" :key="criterion.key" class="guide-rating"><label>Rating {{ index + 1 }}<input v-model="criterion.label" :disabled="!customRatings" maxlength="200" /></label><button v-if="customRatings" type="button" class="btn btn-secondary btn-sm" @click="criteria.splice(index,1)">Remove</button></div>
      <button v-if="customRatings" type="button" class="btn btn-secondary btn-sm" @click="addRating">Add rating criterion</button>
      <p>Scheduled interviews keep their saved guide and ratings. These changes apply to future interviews.</p>
      <div class="guide-actions"><button type="button" class="btn btn-primary btn-sm" :disabled="saving || (!isDirty && hasSavedGuide)" @click="save">{{ saving ? 'Saving…' : 'Save job defaults' }}</button><button type="button" class="btn btn-secondary btn-sm" @click="cancel">Cancel</button></div>
    </fieldset>
  </section>
</template>
<script setup>
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {onBeforeRouteLeave} from 'vue-router';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],required:true},jobDescriptionId:{type:[Number,String],required:true},jobTitle:{type:String,default:''},embeddedInPosting:Boolean,disabled:Boolean});
const emit=defineEmits(['saved','dirty-change']);
const opened=ref(false),loading=ref(false),loaded=ref(false),saving=ref(false),error=ref(''),notice=ref('');
const questionText=ref(''),criteria=ref([]),customRatings=ref(false),source=ref('platform');
const starterSource=ref('platform'),availableSets=ref([]),sourceSet=ref('starter'),savedGuideId=ref(null),baseline=ref('');
let requestVersion=0,originalQuestions=[],lastGuide=null;
const hasSavedGuide=computed(()=>savedGuideId.value!=null);
const endpoint=()=>`/hiring/interview-hub/jobs/${props.jobDescriptionId}/guide`;
const previewQuestions=computed(()=>questionText.value.split('\n').map(text=>text.trim()).filter(Boolean));
function settings(){
  const used=new Set();
  const questions=previewQuestions.value.map((text,index)=>{
    let key=originalQuestions[index]?.key;
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(key || '') || used.has(key))key=`job_q_${index+1}`;
    while(used.has(key))key+='x';used.add(key);return {key,text};
  });
  return {questions,criteria:customRatings.value?criteria.value.map(c=>({...c})):null};
}
const isDirty=computed(()=>loaded.value && JSON.stringify(settings())!==baseline.value);
watch(isDirty,value=>emit('dirty-change',value));
function hydrate(data){
  lastGuide=data;savedGuideId.value=data.questionSet?.id ?? null;
  originalQuestions=savedGuideId.value!=null?(data.questions || []):(data.starterQuestions || []);
  questionText.value=originalQuestions.map(q=>typeof q==='string'?q:q.text).join('\n');
  criteria.value=(data.criteria || []).map(c=>({...c}));customRatings.value=data.criteriaSource==='job';source.value=data.criteriaSource || 'platform';
  starterSource.value=data.starterSource || 'platform';availableSets.value=data.questionSets || [];
  sourceSet.value=savedGuideId.value==null?'starter':String(savedGuideId.value);
  baseline.value=JSON.stringify(settings());loaded.value=true;
}
async function loadGuide(){
  const version=++requestVersion;loading.value=true;loaded.value=false;error.value='';
  try{const {data}=await api.get(endpoint(),{params:{agencyId:props.agencyId}});if(version!==requestVersion)return;hydrate(data.data);}
  catch(e){if(version===requestVersion)error.value=e.response?.data?.message || e.response?.data?.error?.message || 'Could not load job defaults. Your questions have not been verified.';}
  finally{if(version===requestVersion)loading.value=false;}
}
async function openEditor(){
  opened.value=true;notice.value='';
  if(!isDirty.value)await loadGuide();
}
function useSource(){
  if(isDirty.value && !window.confirm('Replace the unsaved question draft with this set?'))return;
  const questions=sourceSet.value==='starter'?lastGuide?.starterQuestions:availableSets.value.find(set=>String(set.id)===sourceSet.value)?.questions_json;
  originalQuestions=(questions || []).map(q=>typeof q==='string'?{text:q}:{...q});
  questionText.value=originalQuestions.map(q=>q.text).join('\n');
}
function addRating(){criteria.value.push({key:`job_rating_${Date.now()}_${criteria.value.length}`,label:'',weight:1});}
function getPendingSettings({force=false}={}){
  if(!force && !isDirty.value)return undefined;
  if(!loaded.value || loading.value || saving.value)throw new Error('Wait for the job questions to finish loading or saving.');
  const value=settings();
  if(!value.questions.length){error.value='Add at least one question or choose a starter set before saving.';throw new Error(error.value);}
  return value;
}
async function save(){
  let value;try{value=getPendingSettings({force:true});}catch(e){error.value=e.message;return false;}
  saving.value=true;error.value='';const version=requestVersion;
  try{
    const {data}=await api.put(endpoint(),{agencyId:props.agencyId,...value});
    if(version!==requestVersion)return false;
    hydrate(data.data);opened.value=false;notice.value='Job interview defaults saved.';emit('saved',data.data);return true;
  }catch(e){if(version===requestVersion)error.value=e.response?.data?.message || e.response?.data?.error?.message || 'Could not save job defaults. Your edited questions are still here.';return false;}
  finally{saving.value=false;}
}
function cancel(){if(isDirty.value && !window.confirm('Discard the unsaved job question changes?'))return;if(lastGuide)hydrate(lastGuide);opened.value=false;error.value='';}
function beforeUnload(event){if(isDirty.value){event.preventDefault();event.returnValue='';}}
onMounted(()=>window.addEventListener('beforeunload',beforeUnload));
onBeforeRouteLeave(()=>!saving.value && !props.disabled && (!isDirty.value || window.confirm('Leave without saving the job question changes?')));
onBeforeUnmount(()=>{requestVersion++;window.removeEventListener('beforeunload',beforeUnload);});
watch(()=>[props.agencyId,props.jobDescriptionId],()=>{opened.value=false;notice.value='';questionText.value='';lastGuide=null;loadGuide();},{immediate:true});
defineExpose({getPendingSettings,hasUnsavedChanges:isDirty,saving,loading});
</script>
<style scoped>
.job-guide{border:1px solid #d8e1e8;border-radius:12px;padding:14px;background:#fff}.guide-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.job-guide p{font-size:13px;line-height:1.5;color:#536174;margin:6px 0}.guide-editor{border:0;padding:0;margin:16px 0 0;min-width:0;display:grid;gap:12px}.guide-editor label{display:grid;gap:6px;font-size:13px;font-weight:600}.guide-editor textarea,.guide-editor select,.guide-editor input:not([type=checkbox]){box-sizing:border-box;width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}.guide-editor .guide-check{display:flex;align-items:center;gap:8px}.guide-rating{display:flex;gap:10px;align-items:end}.guide-rating label{flex:1}.guide-actions{display:flex;gap:10px}.guide-preview{margin-top:10px;font-size:14px}.guide-preview summary{cursor:pointer}.guide-preview li{margin:8px 0}.job-guide [role=alert]{color:#a62135}.guide-source{font-weight:600}
</style>
