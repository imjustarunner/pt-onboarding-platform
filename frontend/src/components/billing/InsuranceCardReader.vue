<template>
  <fieldset class="card-reader"><legend>Start with your insurance card</legend>
    <p>Upload both sides to help fill in the details. Check the results before saving. Medicaid cards are not needed.</p>
    <label v-for="side in ['front','back']" :key="side">Card {{ side }}<input type="file" accept="image/jpeg,image/png,application/pdf" :disabled="busy||disabled||!clientId" @change="read(side,$event)"/><small v-if="files[side]">{{ files[side].name }} selected</small></label>
    <p v-if="!clientId">Select a covered client first.</p><p v-if="busy" role="status">Reading card…</p><p v-if="message" role="status">{{ message }}</p>
    <small>JPEG, PNG or PDF · up to 10 MB per side. Images are saved securely when you save coverage.</small>
  </fieldset>
</template>
<script setup>
import {ref,onBeforeUnmount} from 'vue';import api from '../../services/api';
const props=defineProps({agencyId:[Number,String],clientId:[Number,String],disabled:Boolean});const emit=defineEmits(['fields','files']);
const files=ref({}),busy=ref(false),message=ref('');let generation=0;
async function read(side,event){const file=event.target.files?.[0];event.target.value='';if(!file)return;
 if(file.size>10*1024*1024||!['image/jpeg','image/png','application/pdf'].includes(file.type)){message.value='Choose a JPEG, PNG or PDF up to 10 MB.';return;}
 const own=++generation;files.value={...files.value,[side]:file};emit('files',{...files.value});busy.value=true;message.value='';const form=new FormData();form.append('file',file);form.append('agencyId',props.agencyId);form.append('clientId',props.clientId);
 try{const {data}=await api.post('/guardian-billing/insurance/read-card',form,{headers:{'Content-Type':'multipart/form-data'}});if(own!==generation)return;emit('fields',data.fields||{});message.value=data.readable?'Details read. Review and correct them below before saving.':'The image is selected, but its details could not be read. Please enter the missing information below.';}
 catch{if(own===generation)message.value='Automatic reading is unavailable. Your image is still selected; enter the details below.';}finally{if(own===generation)busy.value=false;}}
onBeforeUnmount(()=>{generation++;files.value={};});
</script>
<style scoped>.card-reader{padding:18px;border:1px solid #bad1e4;border-radius:12px;background:#f3f8fc;display:grid;gap:12px}.card-reader legend{font-weight:700}.card-reader label{display:grid;gap:6px}.card-reader p{line-height:1.5;margin:0}.card-reader input{max-width:100%}.card-reader small{color:#526784}</style>
