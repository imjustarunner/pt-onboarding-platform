<script setup>
import {computed,ref,watch} from 'vue';
import axios from 'axios';
const props=defineProps({detail:{type:Object,required:true},apiBase:String,sessionToken:String,fullTaskUrl:String});
const emit=defineEmits(['updated']);
const busy=ref(false),error=ref(''),notice=ref(''),urgency=ref('medium'),due=ref('');
const task=computed(()=>props.detail.task || {});
const statuses=[['pending','Open'],['in_progress','In progress'],['waiting','Waiting'],['completed','Completed']];
const date=value=>{if(!value)return '';const result=new Date(value);return Number.isFinite(result.getTime())?result.toLocaleString():'';};
function localInput(value){if(!value)return '';const date=new Date(value);return Number.isFinite(date.getTime())?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):'';}
watch(()=>props.detail,()=>{urgency.value=task.value.urgency || 'medium';due.value=localInput(task.value.due_at);error.value='';notice.value='';},{immediate:true});
async function save(status){
 if(busy.value)return;const id=task.value.id;busy.value=true;error.value='';notice.value='';
 try{const config={headers:{'X-Quick-View-Session':props.sessionToken},withCredentials:true};
  if(status)await axios.patch(`${props.apiBase}/tasks/${id}/status`,{status},config);
  else await axios.patch(`${props.apiBase}/tasks/${id}`,{urgency:urgency.value,dueDate:due.value?new Date(due.value).toISOString():null},config);
  if(id!==task.value.id)return;notice.value='Task updated.';emit('updated');
 }catch(e){if(id===task.value.id)error.value=e.response?.data?.error?.message || 'Could not save this task. Your changes are still here.';}
 finally{busy.value=false;}
}
</script>
<template>
 <section class="quick-task-extras" aria-label="Task information and actions">
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <div class="task-facts"><span v-if="task.category">Category: {{ task.category }}</span><span v-if="task.created_at">Created {{ date(task.created_at) }}</span><span v-if="task.updated_at">Updated {{ date(task.updated_at) }}</span><span v-if="task.completed_at">Completed {{ date(task.completed_at) }}</span><span v-if="task.is_private">Private task</span></div>
  <p v-if="detail.assignees?.length">Assigned to: {{ detail.assignees.map(person=>person.name).join(', ') }}</p>
  <p v-if="task.completion_managed" class="task-managed">Complete this task through its linked workflow. Open the full workspace for the required action.</p>
  <label>Status<select aria-label="Task status" :value="['open','pending'].includes(task.status)?'pending':task.status" :disabled="busy || task.completion_managed || task.can_change_status===false" @change="save($event.target.value)"><option v-for="[value,label] in statuses" :key="value" :value="value">{{ label }}</option><option v-if="!statuses.some(([value])=>value===task.status) && !['open','pending'].includes(task.status)" :value="task.status">{{ task.status }}</option></select></label>
  <form @submit.prevent="save()"><div class="task-edit-fields"><label>Priority<select v-model="urgency" aria-label="Task priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Due date &amp; time<input v-model="due" aria-label="Task due date" type="datetime-local"/></label></div><button class="task-save" :disabled="busy">{{ busy?'Saving…':'Save task details' }}</button></form>
  <p v-if="detail.unavailable?.length" role="alert">Could not load {{ detail.unavailable.join(', ').toLowerCase() }}. Close and reopen this task to try again.</p>
  <details v-if="detail.subtasks?.length" open><summary>Subtasks · {{ detail.subtasks.filter(item=>item.status==='completed').length }}/{{ detail.subtasks.length }} complete</summary><ul><li v-for="item in detail.subtasks" :key="item.id"><span aria-hidden="true">{{ item.status==='completed'?'✓':'○' }}</span> {{ item.title }}<small>{{ item.status }}<template v-if="item.assignee"> · {{ item.assignee }}</template></small></li></ul></details>
  <details><summary>Activity <span v-if="detail.activity?.length">· {{ detail.activity.length }}</span></summary><ul v-if="detail.activity?.length"><li v-for="event in detail.activity" :key="event.id"><strong>{{ event.actor }}</strong> · {{ String(event.action || '').replaceAll('_',' ') }}<small>{{ date(event.at) }}</small></li></ul><p v-else-if="!detail.unavailable?.includes('Activity')">No recorded activity yet.</p></details>
  <a v-if="fullTaskUrl" class="task-full qv-workspace-link" :href="fullTaskUrl" target="_blank" rel="noopener">Full task workspace · more actions</a>
 </section>
</template>
<style scoped>
.quick-task-extras{margin:18px 0;color:#1b385d;font-size:13px}.task-facts{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11px;color:#657d9c;margin-bottom:12px}.quick-task-extras label{display:grid;gap:7px;font-size:12px;margin:12px 0}.quick-task-extras select,.quick-task-extras input{font:inherit;color:inherit;max-width:100%;min-width:0;border:1px solid #d8e3f6;background:white;border-radius:9px;padding:10px;box-sizing:border-box}.task-edit-fields{display:grid;grid-template-columns:1fr 2fr;gap:10px}.task-save,.task-full{display:inline-block;font:inherit;border:1px solid #d8e3f6;border-radius:9px;padding:10px 14px;color:#21599a;background:#f4f8ff;text-decoration:none;cursor:pointer}.task-managed{padding:10px;background:#fff8e5;line-height:1.5}.quick-task-extras details{margin:18px 0;padding-top:12px;border-top:1px solid #e6ebf4}.quick-task-extras summary{cursor:pointer;font-weight:650}.quick-task-extras ul{list-style:none;padding:0}.quick-task-extras li{padding:9px 0;border-bottom:1px solid #edf1f6;line-height:1.5;overflow-wrap:anywhere}.quick-task-extras small{display:block;color:#657d9c;font-size:11px}.quick-task-extras [role=alert]{color:#a0354d}.quick-task-extras [role=status]{color:#28705a}@media(max-width:380px){.task-edit-fields{grid-template-columns:1fr}}
</style>
