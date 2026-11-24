<template>
  <form :class="['tw-checklist',{'tw-checklist-compact':compact}]" :aria-label="label" @submit.prevent="save">
    <div class="tw-fields">
      <label v-for="field in ownerFields" :key="field.key">{{ field.label }}
        <select :aria-label="field.label" v-model="draft[field.key]" :disabled="busy||disabled" @change="changed">
          <option :value="null">Assign someone…</option><option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }}</option>
        </select>
      </label>
      <label>Due date <input v-model="draft.dueDate" type="date" :disabled="busy||disabled" @input="changed" /></label>
    </div>
    <div class="tw-checks">
      <label v-for="step in steps" :key="step.id" :class="{ 'is-done': draft.checks[step.id] }">
        <input v-model="draft.checks[step.id]" type="checkbox" :disabled="busy||disabled" @change="changed" />
        <span>{{ step.label }}<small v-if="row?.checks?.[step.id]?.done">{{ completedBy(row.checks[step.id]) }}</small></span>
      </label>
    </div>
    <details v-if="compact" class="tw-person-notes"><summary>Notes & follow-up{{ draft.note?' · note added':'' }}</summary><label>Notes / what still needs doing <textarea v-model="draft.note" rows="2" maxlength="1500" :disabled="busy||disabled" @input="changed" placeholder="Add the next step or a link to the work. Keep clinical details in the chart." /></label></details>
    <label v-else>Notes / what still needs doing <textarea v-model="draft.note" rows="2" maxlength="1500" :disabled="busy||disabled" @input="changed" placeholder="Add the next step or a link to the work. Keep clinical details in the chart." /></label>
    <div class="tw-actions"><button type="submit" class="tw-primary" :disabled="busy || disabled || !dirty">{{ busy ? 'Saving…' : compact ? 'Save provider checklist' : 'Save checklist' }}</button><span v-if="dirty">Unsaved changes</span><span v-else-if="saved" role="status">Checklist saved</span></div>
    <p v-if="error" role="alert">{{ error }}</p>
  </form>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
const props=defineProps({kind:String,itemKey:[String,Number],row:Object,people:{type:Array,default:()=>[]},steps:Array,saveItem:Function,compact:Boolean,disabled:Boolean,label:String});
const emit=defineEmits(['dirty']);
const dirty=ref(false),busy=ref(false),saved=ref(false),error=ref(''),draft=ref({});
const ownerFields=computed(()=>props.kind==='clients'?[{key:'recordsOwnerUserId',label:'Bring records up to date'},{key:'scheduleOwnerUserId',label:'Schedule sessions'}]:[{key:'ownerUserId',label:'Responsible person'}]);
function reset(){draft.value={ownerUserId:null,recordsOwnerUserId:null,scheduleOwnerUserId:null,dueDate:'',note:'',...props.row,checks:Object.fromEntries((props.steps||[]).map(s=>[s.id,!!props.row?.checks?.[s.id]?.done]))};}
watch(()=>[props.kind,props.itemKey,JSON.stringify(props.row),props.steps],()=>{if(!dirty.value)reset();},{immediate:true});
function changed(){dirty.value=true;saved.value=false;emit('dirty',true);}
function completedBy(check){const person=props.people.find(p=>p.id===check.by);return `Done ${new Date(check.at).toLocaleDateString('en-US',{timeZone:'America/Denver'})}${person?` · ${person.name}`:''}`;}
async function save(){if(busy.value||props.disabled)return;busy.value=true;error.value='';try{await props.saveItem({action:'workspace_item',kind:props.kind,key:String(props.itemKey),patch:{...Object.fromEntries(ownerFields.value.map(f=>[f.key,draft.value[f.key]])),dueDate:draft.value.dueDate,note:draft.value.note,checks:draft.value.checks}});dirty.value=false;saved.value=true;emit('dirty',false);reset();}catch(e){error.value=e.response?.data?.error?.message||e.message||'Could not save this checklist.';}finally{busy.value=false;}}
</script>
