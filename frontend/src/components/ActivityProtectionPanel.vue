<template>
 <section class="protection-panel" aria-label="Activity protection">
  <h2>{{ review ? 'Security alerts & file-access requests' : 'Additional client-file access' }}</h2>
  <p v-if="!review">You can open five distinct client files within 15 minutes. Additional files require a privacy review. Explain the work purpose here. A designated privacy reviewer must approve the request before you continue. Do not include client names or other private details.</p>
  <p v-else>These are review leads, not proof that the account owner acted maliciously. Limits apply to administrators too. Approval does not grant access to otherwise restricted clients.</p>
  <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
  <button @click="load" :disabled="busy">Refresh</button>
  <template v-if="!review">
   <p v-for="hold in data.holds || []" :key="hold.kind" class="hold">{{ hold.kind === 'email' ? 'Email delivery' : 'Additional client-file access' }} is paused for security review.</p>
   <form @submit.prevent="requestAccess">
    <label>Why do you need multiple client files?<textarea v-model.trim="reason" minlength="20" maxlength="2000" required placeholder="Describe the task, who needs the files, and how you will handle them securely." /></label>
    <label>Number of additional file operations (up to 20)<input v-model.number="units" type="number" min="1" max="20" required /></label>
    <button :disabled="busy">Submit review ticket</button>
   </form>
   <p>Approved access lasts one hour, applies to this sign-in only, and has a limited quantity. Opening a file can also allow saving or printing it, so file views count toward the limit.</p>
   <article v-for="ticket in data.tickets || []" :key="ticket.id">
    <strong>Request {{ ticket.id.slice(0,8) }} · {{ ticket.status }}</strong><p>{{ ticket.reason }}</p>
    <p>Requested: {{ ticket.requested_units }} · Used: {{ ticket.used_units }} of {{ ticket.allowed_units }} approved<span v-if="ticket.expires_at"> · Expires {{ time(ticket.expires_at) }}</span></p>
    <p v-if="ticket.review_note">Reviewer: {{ ticket.review_note }}</p>
   </article>
  </template>
  <template v-else>
   <form v-if="verificationRequired" @submit.prevent="verifyReviewer">
    <label>Confirm a fresh authenticator code before reviewing<input v-model.trim="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required /></label>
    <button :disabled="busy">Verify for review</button>
   </form>
   <h3>Pending requests</h3><p v-if="!error && !data.tickets?.length">No pending requests in this queue.</p>
   <article v-for="ticket in data.tickets || []" :key="ticket.id">
    <strong>{{ ticket.actor_email || `User ${ticket.user_id}` }} · {{ time(ticket.created_at) }}</strong><p>{{ ticket.reason }}</p>
    <p>Requested: {{ ticket.requested_units }} file operations. Request {{ ticket.id.slice(0,8) }}.</p>
    <label>Review explanation<input v-model="draft(ticket.id).note" minlength="10" maxlength="1000" /></label>
    <label>Approve this many operations<input v-model.number="draft(ticket.id).units" type="number" min="1" :max="ticket.requested_units" /></label>
    <div class="actions"><button :disabled="busy" @click="decide(ticket,'approved')">Approve for one hour</button><button :disabled="busy" @click="decide(ticket,'denied')">Deny</button></div>
   </article>
   <h3>Blocked activity</h3><p v-if="!error && !data.alerts?.length">No recorded blocks on this page.</p>
   <article v-for="alert in data.alerts || []" :key="alert.id">
    <strong>{{ alert.actor_email || 'Unidentified sign-in attempt' }} · {{ time(alert.occurred_at) }}</strong>
    <p>{{ label(alert.kind) }} · {{ label(alert.reason) }} · {{ alert.units }} attempted</p>
    <p>{{ alert.client_ip || 'IP unavailable' }} · {{ alert.ip_source === 'unverified_proxy' ? 'Address not independently verified' : label(alert.ip_source) }}</p>
    <code>{{ alert.route }}</code><p>Request ID: {{ alert.request_id }}</p>
    <p v-if="alert.reviewed_at">Reviewed {{ time(alert.reviewed_at) }}: {{ alert.review_note }}</p>
    <template v-else><label>Review explanation<input v-model="draft(alert.id).note" minlength="10" maxlength="1000" /></label>
    <label v-if="alert.kind==='email'"><input v-model="draft(alert.id).releaseEmail" type="checkbox" /> Release the email hold after investigating (recipient limits still apply)</label>
    <button :disabled="busy" @click="acknowledge(alert)">Record review</button></template>
   </article>
   <button v-if="data.nextCursor" :disabled="busy" @click="load(data.nextCursor)">Older alerts</button>
  </template>
 </section>
</template>
<script setup>
import { onMounted, reactive, ref } from 'vue';
import api from '../services/api';
const props=defineProps({review:{type:Boolean,default:false}});
const data=ref({}),error=ref(''),message=ref(''),busy=ref(false),reason=ref(''),units=ref(1),code=ref(''),drafts=reactive({});
const verificationRequired=ref(false);
const headers={'X-Account-Security':'1'};
const draft=id=>drafts[id] ||= {note:'',units:1,releaseEmail:false};
const label=s=>String(s||'').replaceAll('_',' ');
const time=s=>new Date(/Z$|[+-]\d\d:\d\d$/.test(String(s))?s:String(s).replace(' ','T')+'Z').toLocaleString(undefined,{timeZoneName:'short'});
async function work(fn){busy.value=true;error.value='';try{await fn();}catch(e){error.value=e.response?.data?.error?.message||'The security request could not be completed.';}finally{busy.value=false;}}
async function load(cursor){await work(async()=>{if(props.review) verificationRequired.value=(await api.get('/account-security')).data.required === true;const response=await api.get(props.review?'/privacy-review':'/account-security/activity-protection',{params:typeof cursor==='string'?{cursor}:{}});data.value=response.data;});}
async function requestAccess(){await work(async()=>{const response=await api.post('/account-security/activity-protection/requests',{reason:reason.value,units:units.value},{headers});message.value=response.data.message||`Request ${response.data.id.slice(0,8)} submitted. Access remains paused until approved.`;reason.value='';});if(!error.value)await load();}
async function verifyReviewer(){await work(async()=>{await api.post('/account-security/authenticator/verify',{code:code.value,rememberDevice:false,personalDevice:false},{headers});code.value='';message.value='Verified for five minutes. Review each request before approving.';});}
async function decide(ticket,decision){await work(async()=>{await api.post(`/privacy-review/tickets/${ticket.id}/review`,{decision,...draft(ticket.id)},{headers});message.value=`Request ${decision}.`;});if(!error.value)await load();}
async function acknowledge(alert){await work(async()=>{await api.post(`/privacy-review/alerts/${alert.id}/review`,draft(alert.id),{headers});message.value='Review recorded.';});if(!error.value)await load();}
onMounted(()=>load());
</script>
<style scoped>
.protection-panel{padding:1.2rem;border:1px solid var(--border-color,#cbd5e1);border-radius:12px;margin:1rem 0;background:var(--bg-primary,#fff);overflow-wrap:anywhere}form,article{margin:1rem 0;padding:1rem 0;border-top:1px solid var(--border-color,#cbd5e1)}label{display:block;margin:.7rem 0}input:not([type=checkbox]),textarea{display:block;width:100%;box-sizing:border-box;max-width:650px;padding:.65rem;border:1px solid #94a3b8;border-radius:6px;background:var(--bg-primary,#fff);color:inherit}textarea{min-height:100px}button{padding:.6rem .8rem;border:1px solid #94a3b8;border-radius:6px;background:var(--bg-secondary,#f1f5f9);color:inherit;cursor:pointer}button:disabled{opacity:.5}.actions{display:flex;flex-wrap:wrap;gap:.7rem}.error,.hold{color:#a12318}code{white-space:normal}
</style>
