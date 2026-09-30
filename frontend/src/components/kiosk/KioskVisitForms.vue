<template>
 <form @submit.prevent="next(false)">
  <h2 id="arrival-title">You’re checked in.</h2><p>Your provider has been notified. While you wait, you can answer these optional questions or skip them.</p>
  <p class="progress">Questionnaire {{index+1}} of {{forms.length}}</p>
  <fieldset v-if="current"><legend>{{current.title}}</legend><p v-if="current.description">{{current.description}}</p><p v-if="current.kind==='service_feedback'" class="feedback-note">Optional feedback to help your provider understand your experience. This is not a clinical assessment.</p>
   <label v-for="field in current.fields" :key="field.id">{{field.label}}{{field.required?' *':''}}
    <textarea v-if="field.type==='textarea'" v-model="answers[current.id][field.id]" :required="field.required" maxlength="8000"/>
    <select v-else-if="field.type==='select'||field.type==='multi_select'" v-model="answers[current.id][field.id]" :multiple="field.type==='multi_select'" :required="field.required"><option v-if="field.type==='select'" value="">Choose, or leave blank…</option><option v-for="option in field.options" :key="option.value" :value="option.value">{{option.label}}</option></select>
    <select v-else-if="field.type==='boolean'" v-model="answers[current.id][field.id]" :required="field.required"><option value="">Choose…</option><option :value="true">Yes</option><option :value="false">No</option></select>
    <input v-else-if="field.type==='number'" v-model.number="answers[current.id][field.id]" type="number" step="any" :required="field.required"/>
    <input v-else v-model="answers[current.id][field.id]" :type="field.type==='phone'?'tel':field.type" :required="field.required" maxlength="8000" autocomplete="off"/>
   </label>
  </fieldset>
  <p v-if="error" role="alert">{{error}}</p>
  <button :disabled="saving">{{saving?'Saving securely…':index===forms.length-1?'Save feedback & finish':'Next questionnaire'}}</button>
  <button type="button" class="secondary" :disabled="saving" @click="next(true)">Skip this questionnaire</button>
  <button type="button" class="secondary" :disabled="saving" @click="skipRemaining">{{index?'Skip remaining & finish':'Skip questionnaires & finish'}}</button>
  <button v-if="error" type="button" class="secondary" :disabled="saving" @click="$emit('finish')">Finish without submitting feedback</button>
 </form>
</template>
<script setup>
import {reactive,ref,computed} from 'vue';
const props=defineProps({forms:{type:Array,required:true},saving:Boolean,error:String});const emit=defineEmits(['submit','finish']);
const index=ref(0),skipped=new Set(),current=computed(()=>props.forms[index.value]);
const answers=reactive(Object.fromEntries(props.forms.map(f=>[f.id,Object.fromEntries(f.fields.map(q=>[q.id,q.type==='multi_select'?[]:'']))])));
function save(){const output=Object.fromEntries(Object.entries(answers).filter(([id])=>!skipped.has(id)));emit('submit',{answers:output,skippedFormIds:[...skipped]});}
function next(skip){if(props.saving)return;if(skip)skipped.add(current.value.id);if(index.value<props.forms.length-1)index.value++;else save();}
function skipRemaining(){for(const f of props.forms.slice(index.value))skipped.add(f.id);save();}
</script>
<style scoped>fieldset{border:1px solid #d3ddcf;border-radius:14px;margin:20px 0;padding:18px}legend{font-weight:700}label{display:grid;gap:9px;margin:18px 0;line-height:1.5}input,textarea,select{font:inherit;padding:12px;border-radius:8px;border:1px solid #bacabd;width:100%;box-sizing:border-box}textarea{min-height:90px}button{min-height:54px;background:#234e45;color:white;border:0;border-radius:12px;width:100%;font:inherit;padding:14px;margin-top:10px}button:disabled{opacity:.5}.secondary{background:transparent;border:1px solid #bacabd;color:#234e45}.feedback-note,.progress{font-size:12px;color:#627972}.progress{font-weight:700}</style>
