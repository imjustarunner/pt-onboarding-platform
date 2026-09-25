<template>
  <div class="cosign-review">
    <button type="button" :disabled="busy" @click="open">Review &amp; cosign</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-if="document" aria-label="Review note and amendments before signing">
      <pre>{{ document.content }}</pre>
      <p>Sign-off covers this note and every attached amendment/addendum.</p>
      <label><input v-model="attested" type="checkbox" :disabled="busy" /> I reviewed and approve this version and all amendments.</label>
      <button type="button" :disabled="busy || !attested" @click="sign">Sign off</button>
      <button type="button" :disabled="busy" @click="document = null">Cancel</button>
    </section>
  </div>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api.js';
const props=defineProps({noteId:{type:[Number,String],required:true},agencyId:{type:[Number,String],required:true},providerId:{type:[Number,String],default:null}});
const emit=defineEmits(['signed']);
const document=ref(null),busy=ref(false),error=ref(''),attested=ref(false);
let generation=0;
watch(()=>[props.noteId,props.agencyId],()=>{generation++;document.value=null;attested.value=false;busy.value=false;error.value='';});
onBeforeUnmount(()=>{generation++;});
async function open(){
  if(busy.value)return;
  const g=generation;busy.value=true;error.value='';attested.value=false;document.value=null;
  try{
    let providerId=props.providerId;
    if(!providerId){const {data}=await api.get(`/medical-billing/notes/${props.noteId}`,{params:{agencyId:props.agencyId}});providerId=data.note?.providerSignedByUserId;}
    if(g!==generation)return;
    if(!providerId)throw new Error('The signed note author is required for supervisor review.');
    const {data}=await api.get(`/supervision-sessions/supervisee/${providerId}/document-reviews/note/${props.noteId}`,{params:{agencyId:props.agencyId}});
    if(g===generation)document.value=data;
  }catch(e){if(g===generation)error.value=e.response?.data?.error?.message||e.message||'Unable to load the current note.';}
  finally{if(g===generation)busy.value=false;}
}
async function sign(){
  if(busy.value||!attested.value||!document.value)return;
  const g=generation;busy.value=true;error.value='';
  try{
    await api.post(`/medical-billing/notes/${props.noteId}/cosign`,{agencyId:Number(props.agencyId),contentHash:document.value.contentHash,reviewedAndApproved:true});
    if(g===generation){document.value=null;emit('signed');}
  }catch(e){if(g===generation){error.value=e.response?.data?.error?.message||e.message||'Unable to sign off.';attested.value=false;}}
  finally{if(g===generation)busy.value=false;}
}
</script>
<style scoped>
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:24rem;overflow:auto}section{padding:1rem;border:1px solid var(--border-color,#ccd5df);border-radius:8px}button{margin:.35rem;padding:.5rem .75rem}label{display:block;margin:.75rem 0}[role=alert]{color:#a32121}
</style>
