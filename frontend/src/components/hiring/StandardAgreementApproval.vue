<template>
  <section id="standard-agreement-review" class="agreement-review" aria-label="Approve standard agreement terms">
    <h3>Review and approve the standard agreement</h3>
    <p>Read the full draft preview above. An authorized hiring user can approve these standard terms for use by {{ agencyName }}. Each person’s dates, roles and pay must still be reviewed before sending.</p>
    <p v-if="!previewReady">Prepare a current preview and complete its missing fields before approving.</p>
    <label><input v-model="accepted" type="checkbox" :disabled="!previewReady || busy" />I have reviewed the full preview and approve these standard agreement terms for use by {{ agencyName }}.</label>
    <button type="button" :disabled="!previewReady || !accepted || busy" @click="approve">{{ busy ? 'Approving…' : 'Approve standard terms for use' }}</button>
    <a :href="libraryUrl" target="_blank" rel="noopener">Open standard terms in the contract library ↗</a>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true},configId:{type:Number,required:true},agencyName:{type:String,default:'this organization'},previewReady:{type:Boolean,default:false},libraryUrl:{type:String,required:true}});
const emit=defineEmits(['approved']);
const accepted=ref(false),busy=ref(false),error=ref('');
watch(()=>[props.configId,props.previewReady],()=>{accepted.value=false;error.value='';});
async function approve(){
  if(!props.previewReady||!accepted.value||busy.value)return;
  busy.value=true;error.value='';
  try{
    const {data}=await api.patch(`/contracts/configs/${props.configId}`,{agencyId:props.agencyId,isActive:true});
    if(Number(data?.is_active)!==1)throw new Error('The agreement is still inactive. Refresh contract settings and try again.');
    emit('approved');
  }catch(e){error.value=e.response?.data?.error?.message||e.message||'Could not approve the standard agreement.';}
  finally{busy.value=false;}
}
</script>
<style scoped>
.agreement-review{border:1px solid #b7791f;border-radius:10px;padding:18px;margin:18px 0;background:#fff8e8;color:#382514}.agreement-review p{line-height:1.5}.agreement-review label{display:flex;align-items:flex-start;gap:10px;margin:14px 0}.agreement-review input{width:auto;margin-top:4px}.agreement-review button{font:inherit;padding:10px 16px;min-height:44px;border:1px solid #12583f;border-radius:8px;background:#12583f;color:white;cursor:pointer}.agreement-review button:disabled{opacity:.55;cursor:default}.agreement-review a{display:inline-block;margin:12px}.agreement-review [role=alert]{color:#9b1c1c}
</style>
