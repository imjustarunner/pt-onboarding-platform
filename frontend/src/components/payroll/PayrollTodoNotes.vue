<template>
  <details class="todo-notes"><summary>Notes for this task{{ saved ? ' · saved' : '' }}</summary>
    <p>Only this task in this pay period. Recurring template descriptions stay separate.</p>
    <label :for="`payroll-task-note-${periodId}-${todo.id}`">Task note</label>
    <textarea :id="`payroll-task-note-${periodId}-${todo.id}`" v-model="draft" rows="3" :disabled="saving || disabled" maxlength="10000" />
    <button type="button" class="btn btn-secondary btn-sm" :disabled="saving || disabled || draft === saved" @click="save">{{ saving ? 'Saving…' : 'Save task note' }}</button>
    <span v-if="message" role="status">{{ message }}</span><span v-if="error" role="alert">{{ error }}</span>
  </details>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({periodId:[Number,String],todo:{type:Object,required:true},disabled:Boolean});
const emit=defineEmits(['saved']);
const draft=ref(''),saved=ref(''),saving=ref(false),error=ref(''),message=ref('');let identity=0;
watch(()=>[props.periodId,props.todo.id,props.todo.notes],()=>{identity++;draft.value=saved.value=props.todo.notes || '';error.value='';message.value='';saving.value=false;},{immediate:true});
async function save(){const request=identity,periodId=props.periodId,todoId=props.todo.id,note=draft.value;saving.value=true;error.value='';message.value='';
 try{await api.patch(`/payroll/periods/${periodId}/todos/${todoId}`,{notes:note});if(request!==identity)return;saved.value=note;message.value='Saved to this task only.';emit('saved');}
 catch(e){if(request===identity)error.value=e.response?.data?.error?.message||'Could not save this task note.';}
 finally{if(request===identity)saving.value=false;}}
</script>
<style scoped>
.todo-notes{margin-top:10px;padding:10px;border:1px solid #d6e3df;border-radius:8px;min-width:200px}.todo-notes summary{cursor:pointer;font-weight:600}.todo-notes p{font-size:12px;color:#526963}.todo-notes label{display:block}.todo-notes textarea{display:block;width:100%;box-sizing:border-box;padding:8px;border:1px solid #bccdc7;border-radius:6px;margin:6px 0}[role=alert]{color:#b42318}[role=status]{color:#285f48;margin-left:8px}
</style>
