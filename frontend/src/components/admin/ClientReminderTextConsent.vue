<template>
  <section class="reminder-consent" aria-label="Appointment text reminders">
    <h3>Appointment text reminders</h3>
    <p>Record a client or guardian’s verbal agreement for their saved phone. This enables appointment texts only.</p>
    <p v-if="loading" role="status">Loading contact and texting status…</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="context">
      <p v-if="context.activationBlocked" class="pending">{{ context.activationBlocked }}</p>
      <p v-if="!context.recipients.length">Save an eligible guardian’s phone and link their account first. Adult clients may use their own saved contact phone.</p>
      <form v-else @submit.prevent="save">
        <label>Recipient<select v-model="selectedId" :disabled="busy" @change="resetAttestation"><option value="">Choose a client or guardian</option><option v-for="person in context.recipients" :key="person.id" :value="String(person.id)">{{ person.name }} — {{ person.relationship === 'self' ? 'Client' : 'Guardian' }}</option></select></label>
        <template v-if="person">
          <p><strong>Phone:</strong> {{ person.phone || 'No valid phone saved' }}</p>
          <p v-if="person.stopped" class="pending">This number selected STOP. Staff cannot turn texts back on. The recipient must restart through the registered program.</p>
          <p v-else-if="person.enabled" role="status">Verbal consent recorded; appointment texts enabled. Current delivery permissions still apply.</p>
          <template v-else-if="person.phone">
            <p v-if="person.lastConsent">Verbal consent previously recorded by staff #{{ person.lastConsent.actorUserId }} at {{ formatDate(person.lastConsent.collectedAt) }}. Activation remains pending.</p>
            <details open><summary>Read this disclosure to the recipient</summary><p class="disclosure">{{ context.disclosure }}</p></details>
            <label>How consent was obtained<select v-model="method" :disabled="busy"><option value="phone">Phone call</option><option value="in_person">In person</option></select></label>
            <label>When they agreed<input v-model="collectedAt" type="datetime-local" required :disabled="busy" /><small>Shown in your device’s local time. Use the actual conversation time.</small></label>
            <label class="check"><input v-model="phoneConfirmed" type="checkbox" :disabled="busy" /> I verified that this recipient controls the phone shown above.</label>
            <label class="check"><input v-model="authorityConfirmed" type="checkbox" :disabled="busy" /> I verified the recipient’s identity and authority for this client’s appointment reminders.</label>
            <label class="check"><input v-model="attested" type="checkbox" :disabled="busy" /> I read this disclosure and the recipient verbally agreed to receive these texts. I am recording my own attestation, not signing for them.</label>
            <button class="btn btn-primary" :disabled="busy || !attested || !phoneConfirmed || !authorityConfirmed">{{ busy ? 'Saving…' : context.activationBlocked ? 'Record verbal consent' : 'Record consent and enable texts' }}</button>
          </template>
        </template>
      </form>
    </template>
  </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({clientId:{type:Number,required:true}});
const context=ref(null),loading=ref(false),busy=ref(false),error=ref(''),notice=ref(''),selectedId=ref('');
const method=ref('phone'),collectedAt=ref(''),attested=ref(false),phoneConfirmed=ref(false),authorityConfirmed=ref(false);
let generation=0,requestKey=crypto.randomUUID();
const person=computed(()=>context.value?.recipients.find(r=>String(r.id)===selectedId.value));
const localNow=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
function resetAttestation(){attested.value=false;phoneConfirmed.value=false;authorityConfirmed.value=false;collectedAt.value=localNow();requestKey=crypto.randomUUID();}
const formatDate=value=>new Date(value).toLocaleString();
async function load(token=generation){loading.value=true;try{const {data}=await api.get(`/clients/${props.clientId}/reminder-text-consent`,{skipGlobalLoading:true});if(token===generation)context.value=data;}catch(e){if(token===generation)error.value=e.response?.data?.error?.message||'Unable to load text reminder consent.';}finally{if(token===generation)loading.value=false;}}
async function save(){
 if(busy.value||!person.value||!attested.value||!phoneConfirmed.value||!authorityConfirmed.value)return;
 const token=generation,clientId=props.clientId,recipient={...person.value};busy.value=true;error.value='';notice.value='';
 try{
  const {data}=await api.post(`/clients/${clientId}/reminder-text-consent`,{recipientId:recipient.id===0?'client':recipient.id,phone:recipient.phone,method:method.value,collectedAt:new Date(collectedAt.value).toISOString(),attested:attested.value,authorityConfirmed:authorityConfirmed.value,phoneConfirmed:phoneConfirmed.value,version:context.value.version,disclosure:context.value.disclosure,requestKey});
  if(token!==generation)return;
  notice.value=data.pendingReason?'Verbal consent recorded. Texts remain off until the agency’s texting setup is ready.':data.duplicate?'This consent was already processed.':data.confirmation==='review'?'Appointment texts enabled. The confirmation needs delivery review; do not resend it without checking.':'Appointment texts enabled. Confirmation accepted for sending; inbox receipt has not been verified.';
  resetAttestation();await load(token);
 }catch(e){if(token===generation)error.value=e.response?.data?.error?.message||'Consent could not be recorded. Check its status before trying again.';}
 finally{if(token===generation)busy.value=false;}
}
watch(()=>props.clientId,()=>{generation++;context.value=null;selectedId.value='';busy.value=false;error.value='';notice.value='';resetAttestation();load(generation);},{immediate:true});
</script>
<style scoped>
.reminder-consent{border:1px solid #d4dfeb;border-radius:10px;padding:20px;margin:18px 0;background:#fff;color:#24374c;line-height:1.6}.reminder-consent h3{margin:0}.reminder-consent form{display:grid;gap:12px;max-width:760px}.reminder-consent label{display:grid;gap:5px}.reminder-consent input,.reminder-consent select{padding:9px;border:1px solid #b8c9db;border-radius:6px;max-width:100%;min-width:0;box-sizing:border-box}.reminder-consent .check{display:flex;align-items:flex-start;gap:10px}.check input{margin-top:6px;flex:none}.disclosure{background:#f4f7fb;padding:16px;overflow-wrap:anywhere}.pending{color:#795b15}.error{color:#a52e38}.reminder-consent small{color:#607286}
</style>
