<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true},providerId:{type:Number,required:true},providerName:{type:String,required:true},progress:{type:Object,required:true}});
const emit=defineEmits(['queued']);
const confirming=ref(false),busy=ref(false),error=ref(''),localReceipt=ref(null);
let requestKey=null,generation=0;
const receipt=computed(()=>!localReceipt.value||Number(props.progress.reminder?.id)>=Number(localReceipt.value.id)?props.progress.reminder:localReceipt.value);
const mode=computed(()=>props.progress.status==='completed'||props.progress.reconfirmationPending?'reconfirm':'reminder');
const allowed=computed(()=>props.progress.reminderEnabled&&(mode.value==='reconfirm'||props.progress.invitationStatus==='sent')&&(!receipt.value||receipt.value.canSendAgain));
const when=value=>value?new Date(value).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' Mountain':'';
async function send(){
 if(busy.value||!allowed.value)return;
 const current=++generation;busy.value=true;error.value='';
 requestKey||=crypto.randomUUID();
 try{
  const {data}=await api.post(`/availability/admin/school-weekdays/${props.providerId}/email-reminder`,{agencyId:props.agencyId,requestKey,mode:mode.value},{skipGlobalLoading:true});
  if(current!==generation)return;
  localReceipt.value=data.reminder;confirming.value=false;requestKey=null;emit('queued');
 }catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'Could not confirm the reminder request. Check its status; retry uses the same request.';}
 finally{if(current===generation)busy.value=false;}
}
watch(()=>[props.agencyId,props.providerId],()=>{++generation;requestKey=null;localReceipt.value=null;confirming.value=false;busy.value=false;error.value='';});
onBeforeUnmount(()=>{++generation;});
</script>
<template>
 <div v-if="progress.reminderEnabled" class="email-reminder">
  <button type="button" class="btn btn-secondary btn-sm" :disabled="busy||!allowed" :aria-label="`${progress.status==='completed'?'Request re-confirmation':'Send email reminder'} for ${providerName}`" @click="confirming=true">{{busy?'Queueing…':progress.status==='completed'?'Request re-confirmation':'Send email reminder'}}</button>
  <div v-if="confirming" class="reminder-confirmation">
   <p>{{mode==='reconfirm'?`Email ${providerName} to review and re-confirm their saved school availability? Unassigned days will need confirmation until they save their reviewed answers.`:`Send ${providerName} an email reminder to finish their school availability?`}}</p>
   <p>From Notifications, copying your school coordinator. Replies go to the coordinator.</p>
   <button type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="send">{{busy?'Queueing…':'Confirm email'}}</button>
   <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="confirming=false">Cancel</button>
  </div>
  <p v-if="error" role="alert">{{error}}</p>
  <p v-if="receipt" role="status" aria-live="polite">
   <template v-if="receipt.status==='sent'">Reminder email sent {{when(receipt.sentAt)}}.</template>
   <template v-else-if="receipt.status==='pending'">Email queued. The sent date will appear after delivery; you do not need to click again.</template>
   <template v-else-if="receipt.status==='sending'">Sending reminder email…</template>
   <template v-else-if="receipt.status==='cancelled'">Reminder stopped because the form no longer needs a response.</template>
   <template v-else>Reminder {{receipt.status==='review'?'needs review':receipt.status}}. {{receipt.error}}</template>
   <small v-if="receipt.status==='sent'&&!receipt.canSendAgain">Another reminder is available after {{when(receipt.nextAllowedAt)}}.</small>
  </p>
 </div>
</template>
<style scoped>
.email-reminder{margin-top:10px;max-width:320px;font-size:13px;line-height:1.5}.email-reminder p{margin:8px 0}.reminder-confirmation{padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc}.reminder-confirmation button{margin:4px 6px 0 0}small{display:block;color:#64748b}[role=alert]{color:#b91c1c}
</style>
