<template>
  <details class="phone-followup">
    <summary>Log a phone follow-up</summary>
    <p>Use this for calls handled through Grasshopper or another phone service. Automatic call capture is not active.</p>
    <p>Billing follow-ups go to Ticket Desk → Billing. The ticket stays open for staff to claim, assign, and resolve.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="result" role="status">
      <p>Created {{ result.topic === 'billing' ? 'Billing' : 'General support' }} ticket #{{ result.ticketId }}. Eligible agency staff receive an in-app notification.</p>
      <a :href="ticketHref">Open ticket #{{ result.ticketId }}</a>
      <button type="button" @click="reset">Log another call</button>
    </div>
    <form v-else @submit.prevent="submit">
      <fieldset :disabled="busy || retryPending">
        <label>Category<select v-model="form.topic" name="topic"><option value="billing">Billing</option><option value="general">General support</option></select></label>
        <label>Follow-up needed<select v-model="form.outcome" name="outcome"><option value="callback_requested">Caller requested a callback</option><option value="missed_call">Missed call</option><option value="voicemail">Voicemail to address</option><option value="follow_up_needed">Call answered; work remains</option></select></label>
        <label>Caller name (optional)<input v-model="form.callerName" name="callerName" maxlength="120" autocomplete="off" /></label>
        <label>Callback number (optional)<input v-model="form.callbackPhone" name="callbackPhone" type="tel" autocomplete="off" /></label>
        <label>What needs attention?<textarea v-model="form.notes" name="notes" required maxlength="5000" rows="3" /></label>
        <p>Include only what staff need to follow up. Do not enter card numbers or payment credentials. Verify the caller before linking any client record.</p>
      </fieldset>
      <p v-if="retryPending">The original details are held until we confirm whether that ticket was saved. Retry to check its status.</p>
      <button type="submit" :disabled="busy || !agencyId || !form.notes.trim()">{{ busy ? 'Creating ticket…' : retryPending ? 'Retry original request' : 'Create follow-up ticket' }}</button>
    </form>
  </details>
</template>
<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],required:true}});
const blank=()=>({topic:'billing',outcome:'callback_requested',callerName:'',callbackPhone:'',notes:''});
const form=ref(blank()), busy=ref(false), error=ref(''), result=ref(null), retryPending=ref(false);
let requestId=null, submittedBody=null, generation=0;
const ticketHref=computed(()=>`/tickets?ticketId=${encodeURIComponent(result.value?.ticketId || '')}`);
function reset(){generation++;requestId=null;submittedBody=null;form.value=blank();busy.value=false;error.value='';result.value=null;retryPending.value=false;}
async function submit(){
  if(busy.value || !props.agencyId)return;
  busy.value=true;error.value='';const current=generation;
  try{
    // Freeze the submitted payload on a transport failure: a retry must not create
    // another ticket or silently change an already accepted request.
    if(!submittedBody){requestId=crypto.randomUUID();submittedBody={...form.value,requestId};}
    const {data}=await api.post(`/sms-numbers/agency/${props.agencyId}/phone-followups`,submittedBody);
    if(current===generation)result.value=data;
  }catch(e){
    if(current===generation){
      error.value=e.response?.data?.error?.message || 'Unable to confirm the ticket was created. Retry to check the same request without creating a duplicate.';
      if(e.response?.status===400){requestId=null;submittedBody=null;retryPending.value=false;}
      else if(submittedBody){form.value={...submittedBody};retryPending.value=true;}
    }
  }finally{if(current===generation)busy.value=false;}
}
watch(()=>props.agencyId,reset);
onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>
.phone-followup{padding:1rem;border:1px solid var(--border,#ccd2db);border-radius:8px;margin:1rem 0}summary{font-weight:700;cursor:pointer}fieldset{border:0;padding:0;min-width:0}label{display:flex;flex-direction:column;gap:.4rem;margin:.8rem 0}input,select,textarea{padding:.6rem;border:1px solid var(--border,#ccd2db);border-radius:6px;background:var(--bg-card,#fff);color:inherit;font:inherit}button{margin:.5rem;padding:.6rem;border:1px solid var(--border,#ccd2db);border-radius:6px;cursor:pointer}button:disabled{opacity:.6}[role=alert]{color:#b42318}
</style>
