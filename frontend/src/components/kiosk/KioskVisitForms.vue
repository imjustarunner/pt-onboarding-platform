<template>
 <form ref="formElement" @submit.prevent="next(false)">
  <h2 id="arrival-title" tabindex="-1">{{current?'You’re checked in.':'Ready to finish?'}}</h2>
  <p>Your arrival is recorded. These questions are optional, and you can go back to adjust your answers.</p>
  <p class="progress" aria-live="polite">{{current?`Questionnaire ${index+1} of ${forms.length}`:'Review your feedback'}}</p>
  <fieldset v-if="current" :disabled="saving"><legend>{{current.title}}</legend><p v-if="current.description">{{current.description}}</p><p v-if="current.kind==='service_feedback'" class="feedback-note">Optional feedback, not a clinical assessment.</p>
   <div v-for="field in current.fields" :key="field.id" class="question">
    <template v-if="isScale(field)">
     <p :id="`question-${field.id}`" class="question-label">{{field.label}}</p>
     <div class="rating" role="group" :aria-labelledby="`question-${field.id}`"><button v-for="option in numericOptions(field)" :key="option.value" type="button" :aria-pressed="answers[current.id][field.id]===option.value" :aria-label="option.label" @click="choose(field,option.value)">{{option.value}}</button></div>
     <div class="anchors"><span>{{numericOptions(field)[0]?.label}}</span><span>{{numericOptions(field).at(-1)?.label}}</span></div>
     <button v-for="option in field.options.filter(o=>o.score==null)" :key="option.value" type="button" class="unsure" :aria-pressed="answers[current.id][field.id]===option.value" @click="choose(field,option.value)">{{option.label}}</button>
    </template>
    <label v-else>{{field.label}}{{field.required?' *':''}}
     <textarea v-if="field.type==='textarea'" v-model="answers[current.id][field.id]" :required="field.required" maxlength="8000"/>
     <select v-else-if="field.type==='select'||field.type==='multi_select'" v-model="answers[current.id][field.id]" :multiple="field.type==='multi_select'" :required="field.required"><option v-if="field.type==='select'" value="">Choose, or leave blank…</option><option v-for="option in field.options" :key="option.value" :value="option.value">{{option.label}}</option></select>
     <select v-else-if="field.type==='boolean'" v-model="answers[current.id][field.id]" :required="field.required"><option value="">Choose…</option><option :value="true">Yes</option><option :value="false">No</option></select>
     <input v-else-if="field.type==='number'" v-model.number="answers[current.id][field.id]" type="number" step="any" :required="field.required"/>
     <input v-else v-model="answers[current.id][field.id]" :type="field.type==='phone'?'tel':field.type" :required="field.required" maxlength="8000" autocomplete="off"/>
    </label>
   </div>
  </fieldset>
  <div v-else class="review"><p>You can review either questionnaire before saving, or finish now.</p><button v-for="(form,i) in forms" :key="form.id" type="button" class="secondary" @click="goTo(i)">{{form.title}} · {{skipped.has(form.id)?'Skipped':'Review / edit'}}</button></div>
  <p v-if="error" role="alert">{{error}}</p>
  <div class="navigation"><button v-if="index" type="button" class="secondary" :disabled="saving" @click="goTo(index-1)">Back</button><button :disabled="saving">{{saving?'Saving securely…':!current?'Save feedback & finish':index===forms.length-1?'Review & finish':'Next questionnaire'}}</button></div>
  <template v-if="current"><button type="button" class="secondary" :disabled="saving" @click="next(true)">Skip this questionnaire</button><button type="button" class="secondary" :disabled="saving" @click="skipRemaining">{{index?'Skip remaining & finish':'Skip questionnaires & finish'}}</button></template>
  <button v-if="error" type="button" class="secondary" :disabled="saving" @click="$emit('finish')">Finish without submitting feedback</button>
 </form>
</template>
<script setup>
import {reactive,ref,computed,nextTick} from 'vue';
const props=defineProps({forms:{type:Array,required:true},saving:Boolean,error:String});const emit=defineEmits(['submit','finish']);
const formElement=ref(null),index=ref(0),skipped=reactive(new Set()),current=computed(()=>props.forms[index.value]);
const advanced=new Set();
const answers=reactive(Object.fromEntries(props.forms.map(f=>[f.id,Object.fromEntries(f.fields.map(q=>[q.id,q.type==='multi_select'?[]:'']))])));
const isScale=field=>current.value?.scoring==='office_feedback_v1'&&field.type==='select';
const numericOptions=field=>field.options.filter(o=>o.score!=null);
async function goTo(value){if(props.saving)return;index.value=value;await nextTick();formElement.value?.querySelector('h2')?.focus();formElement.value?.closest('.arrival-panel')?.scrollTo?.({top:0});}
function choose(field,value){if(props.saving)return;answers[current.value.id][field.id]=value;skipped.delete(current.value.id);if(!advanced.has(current.value.id)&&current.value.fields.every(q=>isScale(q)&&answers[current.value.id][q.id]!=='')){advanced.add(current.value.id);goTo(index.value+1);}}
function save(){const output=Object.fromEntries(Object.entries(answers).filter(([id])=>!skipped.has(id)));emit('submit',{answers:output,skippedFormIds:[...skipped]});}
function next(skip){if(props.saving)return;if(!current.value){save();return;}if(!skip&&!formElement.value?.reportValidity())return;if(skip)skipped.add(current.value.id);else skipped.delete(current.value.id);if(skip&&index.value===props.forms.length-1)save();else goTo(index.value+1);}
function skipRemaining(){if(props.saving)return;for(const f of props.forms.slice(index.value))skipped.add(f.id);save();}
</script>
<style scoped>
fieldset{border:1px solid #d3ddcf;border-radius:14px;margin:20px 0;padding:20px}legend{font-weight:700;font-size:22px}.question{margin:26px 0}.question-label,label{font-weight:600;line-height:1.5}label{display:grid;gap:9px}input,textarea,select{font:inherit;padding:12px;border-radius:8px;border:1px solid #bacabd;width:100%;box-sizing:border-box}textarea{min-height:90px}button{min-height:48px;background:#234e45;color:white;border:0;border-radius:12px;width:100%;font:inherit;padding:12px;margin-top:10px;cursor:pointer}button:disabled{opacity:.5}.secondary{background:transparent;border:1px solid #bacabd;color:#234e45}.feedback-note,.progress{font-size:12px;color:#627972}.progress{font-weight:700}.rating{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:6px}.rating button{padding:8px 0;background:white;color:#234e45;border:1px solid #bacabd;font-weight:700;font-size:18px}.rating button[aria-pressed=true],.unsure[aria-pressed=true]{background:#234e45;color:white;border-color:#234e45}.anchors{display:flex;justify-content:space-between;gap:15px;font-size:12px;color:#627972;margin-top:8px}.anchors span:last-child{text-align:right}.unsure{width:auto;background:transparent;color:#526b60;font-size:13px;border:1px solid #bacabd;padding:10px 15px}.navigation{display:flex;gap:12px}.navigation .secondary{width:auto;min-width:95px}button:focus-visible{outline:3px solid #b78432;outline-offset:3px}@media(max-width:550px){fieldset{padding:12px}.rating{grid-template-columns:repeat(6,minmax(0,1fr))}.rating button{min-height:48px}.question{margin:22px 0}}
</style>
