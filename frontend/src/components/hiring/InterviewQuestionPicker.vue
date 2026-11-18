<template>
  <section class="iqp" aria-label="Interview questions">
    <div class="iqp-heading"><h4>Interview questions</h4><button type="button" :disabled="loading || creating" @click="load">Reload questions</button></div>
    <p v-if="loading" role="status">Loading this job’s questions…</p>
    <p v-if="error" class="iqp-error" role="alert">{{ error }}</p>
    <template v-if="!loading && sets.length">
      <label :for="`${id}-set`">Question set</label>
      <div class="iqp-switch">
        <button type="button" aria-label="Previous question set" :disabled="creating || sets.length<2" @click="switchBy(-1)">‹</button>
        <select :id="`${id}-set`" v-model="selectedSet" :disabled="creating" @change="useSet(selectedSet)"><option v-for="set in sets" :key="set.id" :value="set.id">{{set.title}}{{set.jobDefault?' · Job default':''}}</option></select>
        <button type="button" aria-label="Next question set" :disabled="creating || sets.length<2" @click="switchBy(1)">›</button>
      </div>
      <p class="iqp-hint">Switch sets with the arrows, or add individual questions below. Changes here apply to this interview only.</p>
      <p role="status">{{ selected.length }} selected{{ customized?' · Customized for this interview':'' }}<span v-if="!jobDefault"> · Using starter questions until this job has its own guide.</span></p>
      <details open class="iqp-selected"><summary>Review selected questions</summary>
        <ol><li v-for="(question,index) in selected" :key="identity(question)"><div><span>{{question.text}}</span><small>{{question.sourceTitle}}</small></div><div class="iqp-order"><button type="button" :aria-label="`Move question ${index+1} up`" :disabled="creating || index===0" @click="move(index,-1)">↑</button><button type="button" :aria-label="`Remove question ${index+1}`" :disabled="creating" @click="remove(index)">Remove</button></div></li></ol>
        <p v-if="!selected.length">Choose a set or add at least one question before scheduling.</p>
      </details>
      <details class="iqp-library"><summary>Add individual questions</summary>
        <label :for="`${id}-library`">Browse questions from</label><select :id="`${id}-library`" v-model="browseSet" :disabled="creating"><option v-for="set in sets" :key="set.id" :value="set.id">{{set.title}}</option></select>
        <ul><li v-for="question in browseQuestions" :key="identity(question)"><span>{{question.text}}</span><button type="button" :disabled="creating || contains(question) || selected.length>=100" :aria-label="`Add question: ${question.text}`" @click="add(question)">{{contains(question)?'Added':'Add'}}</button></li></ul>
      </details>
      <button v-if="!creating" type="button" @click="creating=true; publish()">Create a question set</button>
      <div v-else class="iqp-create">
        <label :for="`${id}-title`">New set title</label><input :id="`${id}-title`" v-model="newTitle" maxlength="255" :disabled="saving">
        <label :for="`${id}-questions`">Questions, one per line</label><textarea :id="`${id}-questions`" v-model="newText" rows="5" :disabled="saving"></textarea>
        <p>This set is saved {{jobDescriptionId?'with this job posting':'in the company library'}}. It will not replace the job’s default guide.</p>
        <div class="iqp-actions"><button type="button" :disabled="saving || !newTitle.trim() || !newText.trim()" @click="createSet">{{saving?'Saving…':'Save and use set'}}</button><button type="button" :disabled="saving" @click="creating=false; error=''; publish()">Cancel</button></div>
      </div>
    </template>
  </section>
</template>
<script setup>
import {computed,onBeforeUnmount,ref,useId,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],required:true},jobDescriptionId:{type:[Number,String],default:null},modelValue:{type:Object,default:null}});
const emit=defineEmits(['update:modelValue','ready']);
const id=useId(),sets=ref([]),selectedSet=ref('starter'),browseSet=ref('starter'),selected=ref([]),loading=ref(false),error=ref(''),jobDefault=ref(null),creating=ref(false),saving=ref(false),newTitle=ref(''),newText=ref('');
let version=0;
const identity=q=>`${q.setId??'starter'}:${q.key}`;
const browseQuestions=computed(()=>sets.value.find(set=>set.id===browseSet.value)?.questions || []);
const customized=computed(()=>JSON.stringify(selected.value.map(identity))!==JSON.stringify((sets.value.find(set=>set.id===selectedSet.value)?.questions || []).map(identity)));
function publish(){emit('update:modelValue',{setId:selectedSet.value==='starter'?null:Number(selectedSet.value),questions:selected.value.map(q=>({setId:q.setId,questionKey:q.key,fingerprint:q.fingerprint}))});emit('ready',!loading.value && !creating.value && !error.value && selected.value.length>0);}
function useSet(value){selectedSet.value=String(value);selected.value=[...(sets.value.find(set=>set.id===selectedSet.value)?.questions || [])];browseSet.value=selectedSet.value;publish();}
function switchBy(direction){const index=sets.value.findIndex(set=>set.id===selectedSet.value);useSet(sets.value[(index+direction+sets.value.length)%sets.value.length].id);}
const contains=question=>selected.value.some(q=>q.fingerprint===question.fingerprint);
function add(question){if(!contains(question))selected.value.push(question);publish();}
function remove(index){selected.value.splice(index,1);publish();}
function move(index,direction){const [question]=selected.value.splice(index,1);selected.value.splice(index+direction,0,question);publish();}
function toSet(set){return {id:String(set.id),title:set.title,jobDefault:Number(set.id)===Number(jobDefault.value),questions:(set.questions_json || []).map(q=>({...q,setId:Number(set.id),sourceTitle:set.title}))};}
async function load(){
  const request=++version;loading.value=true;error.value='';sets.value=[];selected.value=[];emit('ready',false);emit('update:modelValue',null);
  const endpoint=props.jobDescriptionId?`/hiring/interview-hub/jobs/${props.jobDescriptionId}/guide`:'/hiring/interview-hub/question-options';
  try {
    const {data}=await api.get(endpoint,{params:{agencyId:props.agencyId}});if(request!==version)return;
    const guide=data.data;jobDefault.value=guide.questionSet?.id || null;
    sets.value=(guide.questionSets || []).map(toSet);
    const title=guide.starterSource==='company'?'Company starter questions':'Plotline starter questions';
    sets.value.push({id:'starter',title,questions:(guide.starterQuestions || []).map(q=>({...q,setId:null,sourceTitle:title}))});
    const preferred=sets.value.find(set=>set.jobDefault && set.questions.length);
    loading.value=false;useSet(preferred?.id || 'starter');
  }catch(e){if(request!==version)return;error.value=e.response?.data?.error?.message || e.response?.data?.message || 'Could not load questions. Reload before scheduling.';}
  finally{if(request===version){loading.value=false;publish();}}
}
async function createSet(){
  saving.value=true;error.value='';const request=version;
  try {
    const questions=newText.value.split('\n').map(text=>text.trim()).filter(Boolean).map((text,index)=>({key:`q_${index+1}`,text}));
    const {data}=await api.post('/hiring/interview-hub/job-question-sets',{agencyId:props.agencyId,jobDescriptionId:props.jobDescriptionId || null,title:newTitle.value.trim(),questions});
    if(request!==version)return;
    const set=toSet(data.data);sets.value.push(set);creating.value=false;newTitle.value='';newText.value='';useSet(set.id);
  }catch(e){if(request===version)error.value=e.response?.data?.error?.message || e.response?.data?.message || 'Could not save this set. Your questions are still here.';}
  finally{if(request===version){saving.value=false;publish();}}
}
watch(()=>[props.agencyId,props.jobDescriptionId],()=>{creating.value=false;newTitle.value='';newText.value='';load();},{immediate:true});
onBeforeUnmount(()=>{version++;});
</script>
<style scoped>
.iqp{min-width:0;padding:16px;border:1px solid #d5dfdc;border-radius:12px;background:white;color:#203c32}.iqp-heading{display:flex;justify-content:space-between;align-items:center;gap:10px}.iqp h4{font-size:16px;margin:0}.iqp p{font-size:13px;line-height:1.5}.iqp-hint,small{color:#536b5d}.iqp label{display:block;font-size:13px;font-weight:600;margin:12px 0 6px}.iqp-switch{display:flex;gap:8px}.iqp select,.iqp input,.iqp textarea{box-sizing:border-box;min-width:0;width:100%;border:1px solid #b9cabe;border-radius:8px;padding:10px;font:inherit;background:white;color:inherit}.iqp button{border:1px solid #b9cabe;border-radius:8px;padding:8px 12px;background:white;color:#203c32;cursor:pointer;font:inherit;font-size:13px}.iqp-switch>button{font-size:24px;padding:2px 14px}.iqp button:disabled{opacity:.5;cursor:default}.iqp details{border-top:1px solid #dce3dd;padding:12px 0}.iqp summary{font-weight:600;cursor:pointer;font-size:14px}.iqp ol,.iqp ul{padding:0;list-style:none;margin:8px 0}.iqp li{display:flex;justify-content:space-between;align-items:start;gap:12px;padding:10px 0;border-bottom:1px solid #edf0ed;font-size:14px;overflow-wrap:anywhere}.iqp li>div:first-child,.iqp li>span{min-width:0;flex:1}.iqp small{display:block;font-size:11px;margin-top:4px}.iqp-order,.iqp-actions{display:flex;gap:6px;flex-shrink:0}.iqp-error{color:#a62135}.iqp :focus-visible{outline:3px solid #b66843;outline-offset:2px}.iqp-create{margin-top:12px}@media(max-width:480px){.iqp-selected li{flex-direction:column}.iqp-heading{flex-wrap:wrap}}
</style>
