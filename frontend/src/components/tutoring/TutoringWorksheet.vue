<template>
<section class="worksheet-work">
 <header><div><h2>{{title}}</h2><small>Version {{version?.version}} · {{version?.status}} <span v-if="host">· Answer keys are private</span></small></div><button v-if="host&&!editing&&!closed" @click="beginEdit">Edit a new version</button></header>
 <p v-if="error" role="alert">{{error}} <button @click="load">Reload</button></p><p v-if="closed" role="status">The session has ended. Saved work remains available for tutor review; new learner answers and worksheet edits are closed.</p><p v-if="notice" role="status">{{notice}}</p>
 <div v-if="version" class="worksheet-layout" :class="{authoring:editing}">
 <InteractiveWorksheet ref="viewer" :key="version.id" :definition="definition" :answers="answers" :read-file="readFile" :editing="editing" :selected="selected" :disabled="host&&!assisting||attempt?.status&&attempt.status!=='draft'" @update:definition="definition=$event;dirty=true" @select="selected=$event" @update:answers="answers=$event;answersDirty=true"/>
 <aside v-if="editing" class="author-fields" aria-label="Worksheet editor">
  <h3>Answer areas</h3><p>Add, drag and resize answer areas on each page. Review the source before approving.</p>
  <button @click="addQuestion">Add answer area on page {{viewer?.page||1}}</button>
  <label>Instructions<textarea v-model="definition.instructions" maxlength="3000" @input="dirty=true"/></label>
  <label>Question<select v-model="selected"><option v-for="q in definition.questions" :key="q.id" :value="q.id">{{q.prompt}}</option></select></label>
  <template v-if="selectedQuestion">
   <label>Prompt<textarea v-model="selectedQuestion.prompt" maxlength="1200" @input="dirty=true"/></label>
   <label>Response<select v-model="selectedQuestion.type" @change="dirty=true"><option value="text">Typed answer</option><option value="numeric">Number</option><option value="choice">Multiple choice</option><option value="ink">Handwriting</option><option value="example">Worked example</option></select></label>
   <label v-if="selectedQuestion.type==='choice'">Choices, one per line<textarea :value="selectedQuestion.options.join('\n')" @input="selectedQuestion.options=$event.target.value.split('\n');dirty=true"/></label>
   <label v-if="goals.length">Learning goal<select v-model.number="selectedQuestion.goalId" @change="dirty=true"><option :value="null">General practice / no plan goal</option><option v-for="g in goals" :key="g.id" :value="Number(g.id)">{{g.title}}</option></select></label>
   <label>Private answer key<input v-model="selectedQuestion.answerKey" maxlength="1000" @input="dirty=true"/></label>
   <label>Skill<input v-model="selectedQuestion.skill" maxlength="100" @input="dirty=true"/></label><label>Grade or level<input v-model="selectedQuestion.grade" maxlength="30" @input="dirty=true"/></label>
   <div class="coordinates"><label v-for="field in ['x','y','width','height']" :key="field">{{field}} %<input type="number" min="0" max="100" v-model.number="selectedQuestion[field]" @input="dirty=true"/></label></div>
   <button @click="definition.questions=definition.questions.filter(q=>q.id!==selected);selected='';dirty=true">Remove this answer area</button>
  </template>
  <button :disabled="busy||closed" @click="saveVersion">Save new draft</button><button :disabled="busy||closed" @click="approveAndPresent">Approve and share this version</button><button @click="cancelEdit">Cancel edits</button>
 </aside>
 </div>
 <div v-if="version&&!editing" class="worksheet-actions">
  <template v-if="host&&!closed"><button :disabled="busy" @click="present">Share this approved version</button><button v-if="version.status==='draft'" :disabled="busy" @click="approveAndPresent">Approve and share</button><button @click="assisting=!assisting;attempt=null;answers={};requestId=cryptoId();revision=0">{{assisting?'Leave assisted entry':'Record learner answers together'}}</button><small v-if="assisting">Answers entered by the tutor are labeled assisted entry.</small></template>
  <template v-if="!host||assisting"><button :disabled="busy||closed||attempt?.status&&attempt.status!=='draft'" @click="saveAnswers(false)">Save answers</button><button :disabled="busy||closed||attempt?.status&&attempt.status!=='draft'" @click="saveAnswers(true)">Submit answers</button><button v-if="!closed&&attempt?.status&&attempt.status!=='draft'" @click="newAttempt">Try a new attempt</button><span>{{answersDirty?'Unsaved answers':attempt?.status==='draft'?'Draft saved':attempt?.status||''}}</span></template>
 </div>
 <section v-if="host&&!editing" class="reviews"><h3>Learner attempts</h3><p v-if="!attempts.length">No submitted work yet.</p>
  <article v-for="a in attempts" :key="a.id"><button @click="selectAttempt(a)">Attempt #{{a.id}} · {{a.status}} · {{a.actor.startsWith('guest:')?'Invited learner':a.actor}}</button>
   <div v-if="reviewing===a.id"><div v-for="q in definition.questions" :key="q.id" class="review-row"><strong>{{q.prompt}}</strong><WorksheetInk v-if="q.type==='ink'" :model-value="a.answers[q.id]||[]" disabled/><p v-else>Answer: {{a.answers[q.id]||'No answer'}}</p><p v-if="q.answerKey">Private key: {{q.answerKey}}</p><label>Observation<select v-model="reviews[q.id].rating"><option v-for="r in rubric" :key="r.value" :value="r.value">{{r.label}}</option></select></label><label><input type="checkbox" v-model="reviews[q.id].independent"/> Completed independently</label><label>Private feedback<textarea v-model="reviews[q.id].notes" maxlength="2000"/></label></div><button :disabled="busy||a.status==='reviewed'" @click="reviewAttempt(a)">Save tutor review</button></div>
  </article>
 </section>
</section>
</template>
<script setup>
import {defineAsyncComponent,ref,computed,onMounted,watch,onBeforeUnmount} from 'vue';
const InteractiveWorksheet=defineAsyncComponent(()=>import('./InteractiveWorksheet.vue').then(m=>m.default));
import WorksheetInk from './WorksheetInk.vue';
const props=defineProps({versionId:Number,title:{type:String,default:'Interactive worksheet'},host:Boolean,closed:Boolean,request:Function,learningContext:Object}),emit=defineEmits(['shared','changed']);
const version=ref(null),definition=ref({instructions:'',questions:[]}),editing=ref(false),dirty=ref(false),answersDirty=ref(false),busy=ref(false),error=ref(''),notice=ref(''),selected=ref(''),viewer=ref(null),answers=ref({}),attempt=ref(null),attempts=ref([]),assisting=ref(false),reviewing=ref(null),reviews=ref({});
const cryptoId=()=>crypto.randomUUID();let requestId=cryptoId(),revision=0,disposed=false,poll;
const rubric=[{value:'not_observed',label:'Not observed'},{value:'emerging',label:'1 · Emerging'},{value:'developing',label:'2 · Developing'},{value:'nearly_secure',label:'3 · Nearly secure'},{value:'secure',label:'4 · Secure'}];
const goals=computed(()=>(props.learningContext?.tracks||[]).flatMap(t=>t.bundle?.goals||[]));
const selectedQuestion=computed(()=>definition.value.questions.find(q=>q.id===selected.value));
const path=()=>'/studio/versions/'+version.value.id;
const readFile=()=>props.request(path()+'/file','get',undefined,{responseType:'blob'});
async function action(fn){if(busy.value)return;busy.value=true;error.value='';try{await fn();}catch(e){error.value=e.response?.data?.error?.message||e.message;}finally{busy.value=false;}}
async function load(){await action(async()=>{version.value=await props.request('/studio/versions/'+props.versionId);definition.value=JSON.parse(JSON.stringify(version.value.definition));await refreshAttempts(true);});}
async function refreshAttempts(initial=false){if(!version.value||disposed||editing.value||answersDirty.value)return;try{const data=await props.request(path()+'/attempts');if(disposed)return;attempts.value=data.attempts;if(initial&&!props.host){const current=data.attempts[0];if(current){attempt.value=current;answers.value=current.answers;requestId=current.requestId;revision=current.revision;}}}catch(e){if(initial)throw e;}}
function beginEdit(){editing.value=true;dirty.value=false;selected.value=definition.value.questions[0]?.id||'';}
function cancelEdit(){definition.value=JSON.parse(JSON.stringify(version.value.definition));editing.value=false;dirty.value=false;}
function addQuestion(){const q={id:cryptoId(),page:viewer.value?.page||1,x:15,y:25,width:60,height:12,prompt:'New question',type:'text',options:[],answerKey:'',skill:'',grade:''};definition.value.questions.push(q);selected.value=q.id;dirty.value=true;}
async function persist(){const saved=await props.request('/studio/materials/'+version.value.materialId+'/versions','post',{...definition.value,baseVersion:version.value.version});version.value={...version.value,...saved};dirty.value=false;emit('changed');}
async function saveVersion(){await action(async()=>{await persist();notice.value='New draft saved. Existing attempts keep their original version.';});}
async function approveAndPresent(){await action(async()=>{if(dirty.value)await persist();await props.request(path()+'/approve','post');version.value.status='approved';await props.request(path()+'/share','post');editing.value=false;emit('shared',version.value.id);emit('changed');notice.value='Reviewed worksheet shared in this session.';});}
async function present(){await action(async()=>{await props.request(path()+'/share','post');emit('shared',version.value.id);notice.value='Worksheet shared.';});}
async function saveAnswers(submit){await action(async()=>{attempt.value=await props.request(path()+'/attempts','put',{requestId,revision,answers:answers.value,submit});revision=attempt.value.revision;answersDirty.value=false;notice.value=submit?'Answers submitted. Your tutor will review your work.':'Answers saved.';await refreshAttempts();});}
function newAttempt(){attempt.value=null;answers.value={};requestId=cryptoId();revision=0;answersDirty.value=false;}
function selectAttempt(a){reviewing.value=a.id;answers.value=a.answers;reviews.value=Object.fromEntries(definition.value.questions.map(q=>[q.id,a.review?.[q.id]||{rating:'not_observed',independent:false,notes:''}]));}
async function reviewAttempt(a){await action(async()=>{await props.request(path()+'/attempts/'+a.id+'/review','post',{review:reviews.value});notice.value='Tutor review recorded with this worksheet version and session.';await refreshAttempts();emit('changed');});}
onMounted(()=>{load();poll=setInterval(()=>refreshAttempts(),5000);});watch(()=>props.versionId,()=>{newAttempt();editing.value=false;load();});
function warn(e){if(dirty.value||answersDirty.value){e.preventDefault();e.returnValue='';}}
window.addEventListener('beforeunload',warn);onBeforeUnmount(()=>{disposed=true;clearInterval(poll);window.removeEventListener('beforeunload',warn);});
</script>
<style scoped>
.worksheet-work{min-width:0;background:white}.worksheet-work>header{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid #dce6ed;gap:8px}.worksheet-work h2{font-size:16px;margin:0 0 4px}.worksheet-work small{color:#526c80}.worksheet-layout.authoring{display:grid;grid-template-columns:minmax(0,1fr) 245px}.author-fields{padding:12px;border-left:1px solid #dce6ed;max-height:65vh;overflow:auto;background:#f7fafb}.author-fields label,.review-row label{display:grid;gap:5px;margin:10px 0;font-size:12px}.author-fields input,.author-fields textarea,.author-fields select,.review-row textarea,.review-row select{box-sizing:border-box;width:100%;padding:7px;border:1px solid #b6cbd7;border-radius:5px;background:white;color:#19394e;font:inherit}.coordinates{display:grid;grid-template-columns:1fr 1fr;gap:4px}.worksheet-work button{border:1px solid #bfd2dc;background:white;color:#204b61;border-radius:7px;padding:7px 10px;font:inherit;font-size:12px;cursor:pointer}.worksheet-work button:disabled{opacity:.55}.worksheet-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px;border-top:1px solid #dce6ed}.reviews{padding:12px}.reviews article{padding:8px 0;border-bottom:1px solid #dce6ed}.review-row{padding:10px;background:#f1f7f7;margin:8px 0;border-radius:8px}.review-row input[type=checkbox]{width:auto}.worksheet-work [role=alert]{padding:10px;color:#a42b42}.worksheet-work [role=status]{padding:8px;color:#20614d}@media(max-width:900px){.worksheet-layout.authoring{display:flex;flex-direction:column}.author-fields{max-height:none;border-left:0}.worksheet-work>header{flex-wrap:wrap}}
</style>
