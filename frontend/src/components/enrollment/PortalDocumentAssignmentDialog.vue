<template>
  <Teleport to="body">
    <div class="portal-assignment-overlay" @click.self="close" @keydown="keyDown">
      <section ref="dialog" class="portal-assignment-dialog" role="dialog" aria-modal="true" aria-labelledby="portal-assignment-title" tabindex="-1">
        <header><div><p>Client portal</p><h3 id="portal-assignment-title">Assign {{ documents.length }} {{ documents.length===1?'document':'documents' }}</h3></div><button type="button" aria-label="Close portal assignment" :disabled="busy" @click="close">×</button></header>
        <p>Select the recipient once. All selected items will appear together in their portal.</p>
        <ul class="assignment-items"><li v-for="(item,i) in documents" :key="i">{{ item.title||'Selected document' }}</li></ul>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="!recipients.length" class="notice">No portal account currently has permission to receive these documents. Review the client’s portal access and document permissions before assigning them.</p>
        <form v-else @submit.prevent="assign">
          <label>Assign to<select v-model="recipientId" required :disabled="busy"><option value="" disabled>Choose a portal account</option><option v-for="r in recipients" :key="r.id" :value="r.id">{{ r.name }} · {{ r.kind==='client'?'Client':'Parent / guardian' }}</option></select></label>
          <label>What should they do?<select v-model="action" :disabled="busy"><option value="complete">Complete forms and sign</option><option value="sign">Review and sign saved documents</option></select></label>
          <p class="assignment-help">Forms can be completed in the portal. Documents that require staff completion are shared for review and signature.</p>
          <label v-if="recipient?.kind==='guardian'" class="authority"><input v-model="authorityConfirmed" type="checkbox" required :disabled="busy" />I verified this guardian is authorized to complete and sign the selected documents.</label>
          <p class="assignment-help">A grouped notification points them to their portal. Each completed form is saved for your team to review.</p>
          <footer><button type="button" :disabled="busy" @click="close">Cancel</button><button class="primary" :disabled="busy||!recipient||(recipient.kind==='guardian'&&!authorityConfirmed)">{{ busy?'Assigning…':`Assign ${documents.length===1?'document':`all ${documents.length} items`} to portal` }}</button></footer>
        </form>
        <button v-if="!recipients.length" type="button" @click="close">Close</button>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import {computed,ref,inject,onMounted,onBeforeUnmount,nextTick,watch} from 'vue';
import liveApi from '../../services/api';
const api=inject('clinicalFormsHttp',liveApi);
const props=defineProps({clientId:{type:[Number,String],required:true},agencyId:{type:[Number,String],required:true},documents:{type:Array,required:true},recipients:{type:Array,default:()=>[]},context:{type:Object,default:()=>({})},initialAction:{type:String,default:'complete'}});
const emit=defineEmits(['close','assigned']);
const dialog=ref(null),recipientId=ref(props.recipients.length===1?props.recipients[0].id:''),action=ref(props.initialAction),authorityConfirmed=ref(false),busy=ref(false),error=ref('');
const recipient=computed(()=>props.recipients.find(r=>Number(r.id)===Number(recipientId.value)));
watch(recipientId,()=>{authorityConfirmed.value=false;});
let requestKey=crypto.randomUUID(),lastPayload='',active=true,previousFocus,previousOverflow;
function close(){if(!busy.value)emit('close');}
function keyDown(event){if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){const focusable=[...dialog.value.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')];const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.value)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}
async function assign(){
  if(busy.value||!recipient.value||(recipient.value.kind==='guardian'&&!authorityConfirmed.value))return;
  const payload={agencyId:Number(props.agencyId),recipient:{id:Number(recipient.value.id),kind:recipient.value.kind},action:action.value,authorityConfirmed:authorityConfirmed.value,context:{...props.context},planDate:new Date().toLocaleDateString('en-CA'),documents:props.documents.map(d=>d.recordId?{recordId:Number(d.recordId),version:Number(d.version)}:{foundationKey:d.foundationKey})};
  const serialized=JSON.stringify(payload);if(lastPayload&&lastPayload!==serialized)requestKey=crypto.randomUUID();lastPayload=serialized;
  busy.value=true;error.value='';
  try{const {data}=await api.post(`/enrollment-portal/clients/${props.clientId}/assignments`,{...payload,requestKey});if(active)emit('assigned',data);}
  catch(e){if(active)error.value=e.response?.data?.error?.message||'Assignment could not be confirmed. You can retry this selection safely.';}
  finally{if(active)busy.value=false;}
}
onMounted(async()=>{previousFocus=document.activeElement;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';await nextTick();dialog.value?.focus();});
onBeforeUnmount(()=>{active=false;document.body.style.overflow=previousOverflow;if(previousFocus?.isConnected)previousFocus.focus();});
</script>
<style scoped>
.portal-assignment-overlay{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:20px;background:#102c3c88}.portal-assignment-dialog{box-sizing:border-box;width:min(620px,100%);max-height:90dvh;overflow:auto;border-radius:16px;background:white;padding:26px;color:#203d36;box-shadow:0 20px 70px #0004;font:inherit;line-height:1.6}.portal-assignment-dialog:focus{outline:none}header,footer{display:flex;align-items:center;justify-content:space-between;gap:14px}header p{margin:0;color:#587067;font-size:12px}h3{margin:3px 0;font-size:23px}header button{font-size:24px}.assignment-items{padding:12px 12px 12px 32px;background:#f0f6f2;border-radius:8px;max-height:180px;overflow:auto}label{display:grid;gap:8px;margin:18px 0}button,select{font:inherit;padding:10px 13px;border:1px solid #afc5b9;border-radius:7px;background:white;color:#20533f}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}.primary{background:#175b48;color:white;border-color:#175b48}.authority{display:flex;align-items:flex-start}.authority input{margin-top:5px}.assignment-help{font-size:13px;color:#587067}footer{margin-top:24px;justify-content:flex-end}[role=alert],.notice{padding:12px;background:#fff2e7;border-radius:7px}[role=alert]{color:#8d3225}@media(max-width:520px){.portal-assignment-overlay{padding:10px}.portal-assignment-dialog{padding:18px}footer{align-items:stretch;flex-direction:column-reverse}}
</style>
