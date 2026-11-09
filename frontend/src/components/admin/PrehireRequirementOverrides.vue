<template>
 <section class="prehire-requirements">
  <h4>Required pre-hire checklist</h4>
  <p>For a legacy item handled outside the portal, staff can record an exception with a reason. An exception allows progress without creating a signature or changing the original document.</p>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-if="loading">Loading checklist…</p>
  <ul v-else>
   <li v-for="step in requirements.steps" :key="step.key">
    <strong>{{ step.title }}</strong> — {{ step.staffOverride ? 'Staff exception' : step.complete ? 'Complete' : 'Required' }}
    <p v-if="step.staffOverride">{{ step.staffOverride.reason }} <small>Recorded by {{ step.staffOverride.actorName }} · {{ new Date(step.staffOverride.at).toLocaleString() }}</small></p>
    <button v-if="requirements.editable && step.canOverride && (!step.complete || step.staffOverride)" type="button" :disabled="saving" @click="edit(step)">{{ step.staffOverride ? 'Restore requirement' : 'Record staff exception' }}</button>
   </li>
  </ul>
  <form v-if="selected" @submit.prevent="save">
   <label :for="`override-${userId}`">Reason for {{ selected.staffOverride ? 'restoring' : 'overriding' }} {{ selected.title }}</label>
   <textarea :id="`override-${userId}`" v-model="reason" required minlength="8" maxlength="2000" rows="3" />
   <button type="submit" :disabled="saving || reason.trim().length<8">{{ saving ? 'Saving…' : selected.staffOverride ? 'Restore requirement' : 'Save staff exception' }}</button>
   <button type="button" :disabled="saving" @click="selected=null">Cancel</button>
  </form>
 </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({userId:{type:Number,required:true},agencyId:{type:[Number,String],required:true}});
const emit=defineEmits(['changed']);const requirements=ref({steps:[],editable:false}),loading=ref(false),saving=ref(false),error=ref(''),selected=ref(null),reason=ref('');let sequence=0;
async function load(){const request=++sequence;selected.value=null;loading.value=true;error.value='';try{const{data}=await api.get(`/hiring/candidates/${props.userId}/prehire-requirements`,{params:{agencyId:props.agencyId}});if(request===sequence)requirements.value=data;}catch(e){if(request===sequence)error.value=e.response?.data?.error?.message || 'Could not load pre-hire checklist.';}finally{if(request===sequence)loading.value=false;}}
function edit(step){selected.value=step;reason.value='';error.value='';}
async function save(){if(saving.value||!selected.value)return;saving.value=true;error.value='';try{await api.post(`/hiring/candidates/${props.userId}/prehire-requirements/${encodeURIComponent(selected.value.key)}/override`,{reason:reason.value.trim(),revoke:!!selected.value.staffOverride},{params:{agencyId:props.agencyId}});await load();emit('changed');}catch(e){error.value=e.response?.data?.error?.message || 'Could not save the staff exception.';}finally{saving.value=false;}}
watch(()=>[props.userId,props.agencyId],load,{immediate:true});
</script>
<style scoped>
.prehire-requirements{margin:1rem 0;padding:1rem;border:1px solid var(--border-color,#dce5e9);border-radius:.75rem}.prehire-requirements p{font-size:.9rem;line-height:1.5}.prehire-requirements ul{padding-left:1.25rem}.prehire-requirements li{margin:.8rem 0}.prehire-requirements small{display:block;color:var(--text-secondary,#64748b)}.prehire-requirements button{margin:.35rem .5rem .35rem 0;cursor:pointer}.prehire-requirements textarea{display:block;width:100%;box-sizing:border-box;margin:.5rem 0;font:inherit}
</style>
