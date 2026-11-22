<template>
 <div class="relationship-restore">
  <button v-if="!reviewing" type="button" class="btn btn-secondary btn-sm" @click="reviewing=true">Restore relationship</button>
  <form v-else @submit.prevent="restore">
   <p>Restore this existing relationship. Previous records and history are preserved. Other consent and privacy restrictions still apply.</p>
   <label>Portal access after restoration<select v-model="accessMode" :disabled="busy"><option value="care">Enable portal access</option><option value="payment_only">Payment only</option><option value="payer_plus">Payer plus</option><option value="none">Keep portal access disabled</option></select></label>
   <label class="confirmation"><input v-model="verified" type="checkbox" :disabled="busy" /> I verified this person’s current identity, relationship and authority for the selected access.</label>
   <label>Reason for restoring<input v-model="reason" maxlength="1000" :disabled="busy" required /></label>
   <p v-if="error" role="alert">{{error}}</p>
   <button class="btn btn-primary btn-sm" type="submit" :disabled="busy || !verified || !reason.trim()">{{busy?'Restoring…':'Confirm restoration'}}</button>
   <button class="btn btn-secondary btn-sm" type="button" :disabled="busy" @click="reviewing=false">Cancel</button>
  </form>
 </div>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({clientId:{type:Number,required:true},guardianId:{type:Number,required:true}});
const emit=defineEmits(['restored']);
const reviewing=ref(false),verified=ref(false),reason=ref(''),accessMode=ref('care'),error=ref(''),busy=ref(false);
let generation=0;
watch(()=>[props.clientId,props.guardianId],()=>{generation++;reviewing.value=false;verified.value=false;reason.value='';accessMode.value='care';error.value='';busy.value=false;});
async function restore(){
 if(busy.value || !verified.value || !reason.value.trim())return;
 const own=generation,clientId=props.clientId,guardianId=props.guardianId;busy.value=true;error.value='';
 try{
  const {data}=await api.post(`/clients/${clientId}/guardians/${guardianId}/restore`,{relationshipVerified:true,accessMode:accessMode.value,accessReason:reason.value.trim()},{skipGlobalLoading:true});
  if(own!==generation)return;reviewing.value=false;emit('restored',data);
 }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'The relationship could not be restored.';}
 finally{if(own===generation)busy.value=false;}
}
</script>
<style scoped>
.relationship-restore{margin:12px 0}.relationship-restore form{display:grid;gap:12px;max-width:620px}.relationship-restore label{display:grid;gap:6px}.relationship-restore .confirmation{display:flex;align-items:start;gap:10px}.relationship-restore input:not([type=checkbox]),.relationship-restore select{padding:9px;font:inherit;max-width:100%}.relationship-restore p{line-height:1.5}.relationship-restore [role=alert]{color:#a32727}
</style>
