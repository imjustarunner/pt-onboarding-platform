<template>
 <section class="learning-invitations" aria-labelledby="learning-guardian-heading">
  <h3 id="learning-guardian-heading">Invite another parent or guardian</h3>
  <p>Invite someone authorized for {{ clientName || 'this child' }} to use their own learning portal account. Private documents, learning plans and ratings are shared separately.</p>
  <p v-if="loading" role="status">Checking invitation access…</p>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-if="notice" role="status">{{ notice }}</p>
  <button v-if="error && !data" type="button" @click="load">Check again</button>
  <p v-if="data && !data.canInvite" role="status">{{ data.reason || 'Your learning team must review guardian access before an invitation can be sent.' }}</p>
  <ul v-if="data?.invitations?.length" class="invitation-statuses">
   <li v-for="invitation in data.invitations" :key="invitation.id"><strong>{{ invitation.firstName || invitation.email }}</strong> · {{ invitationLabel(invitation) }}</li>
  </ul>
  <form v-if="data?.canInvite" @submit.prevent="send">
   <fieldset :disabled="busy">
    <label>First name<input v-model="firstName" autocomplete="given-name" required maxlength="100" /></label>
    <label>Last name<input v-model="lastName" autocomplete="family-name" required maxlength="100" /></label>
    <label>Their email address<input ref="emailInput" v-model="email" type="email" autocomplete="email" required maxlength="254" /></label>
    <label>Relationship<select v-model="relationshipTitle"><option>Parent</option><option>Legal guardian</option><option>Other authorized guardian</option></select></label>
    <label class="authority"><input v-model="authorityConfirmed" type="checkbox" required /> I am authorized to invite this guardian for {{ clientName || 'this child' }}. Their access has not been restricted or revoked.</label>
    <button type="submit" :disabled="!canSubmit">{{ busy ? 'Sending…' : 'Send learning portal invitation' }}</button>
   </fieldset>
  </form>
 </section>
</template>
<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({clientId:{type:[Number,String],required:true},agencyId:{type:[Number,String],required:true},clientName:String});
const data=ref(null),loading=ref(false),busy=ref(false),error=ref(''),notice=ref('');
const firstName=ref(''),lastName=ref(''),email=ref(''),relationshipTitle=ref('Parent'),authorityConfirmed=ref(false),emailInput=ref(null);
const canSubmit=computed(()=>!busy.value&&data.value?.canInvite&&authorityConfirmed.value&&firstName.value.trim()&&lastName.value.trim()&&email.value.trim());
let generation=0,requestKey=null,requestBody=null;
const path=id=>`/guardian-portal/clients/${id}/guardian-invitations`;
function invitationLabel(invitation){
 if(invitation.status==='accepted')return 'Accepted';
 if(invitation.status==='revoked')return 'Access revoked';
 if(invitation.status==='expired')return 'Expired';
 if(['failed','bounced','undelivered'].includes(invitation.deliveryStatus))return 'Invitation needs delivery review';
 return invitation.deliveryStatus==='sent'?'Invitation sent; waiting for acceptance':'Invitation pending';
}
async function load(){
 const run=++generation,clientId=props.clientId,agencyId=props.agencyId;
 data.value=null;loading.value=true;busy.value=false;error.value='';notice.value='';authorityConfirmed.value=false;
 firstName.value='';lastName.value='';email.value='';relationshipTitle.value='Parent';requestKey=null;requestBody=null;
 try{const response=await api.get(path(clientId),{params:{agencyId},skipGlobalLoading:true});if(run===generation)data.value=response.data;}
 catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'Invitation access could not be checked.';}
 finally{if(run===generation)loading.value=false;}
}
async function send(){
 if(!canSubmit.value)return;
 if(!emailInput.value?.checkValidity()){error.value='Enter a valid email address.';return;}
 const run=generation,clientId=props.clientId,body={agencyId:Number(props.agencyId),firstName:firstName.value.trim(),lastName:lastName.value.trim(),email:email.value.trim().toLowerCase(),relationshipTitle:relationshipTitle.value,authorityConfirmed:true};
 const serialized=JSON.stringify(body);
 if(!requestKey||serialized!==requestBody){requestKey=crypto.randomUUID();requestBody=serialized;}
 busy.value=true;error.value='';notice.value='';
 try{
  const response=await api.post(path(clientId),{...body,requestKey});if(run!==generation)return;
  const result=response.data,invitation=result.invitation;
  if(invitation)data.value.invitations=[...(data.value.invitations||[]).filter(item=>item.id!==invitation.id),invitation];
  notice.value=result.reused?'This invitation already exists. No additional email was sent.':result.emailSent?'Invitation sent. They must use their own link to accept.':result.deliveryStatus==='failed'?'The invitation was saved, but its email needs review. Contact your learning team before requesting another invitation.':'The invitation was saved. Email delivery is pending.';
  if(result.emailSent||result.reused){firstName.value='';lastName.value='';email.value='';authorityConfirmed.value=false;requestKey=null;requestBody=null;}
 }catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'The invitation result is uncertain. Check again with the same details before requesting a different invitation.';}
 finally{if(run===generation)busy.value=false;}
}
watch(()=>[props.clientId,props.agencyId],load,{immediate:true});onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>
.learning-invitations{padding:20px;border:1px solid #d7e3ef;border-radius:12px;margin:20px 0;background:#fff}.learning-invitations p{line-height:1.6}.learning-invitations fieldset{display:grid;gap:14px;border:0;padding:0}.learning-invitations label{display:grid;gap:6px}.learning-invitations input,.learning-invitations select,.learning-invitations button{font:inherit;min-height:44px;padding:9px;border:1px solid #aabed1;border-radius:7px}.learning-invitations .authority{display:flex;gap:10px;align-items:flex-start}.authority input{min-height:20px;margin-top:3px}.learning-invitations [role=alert]{color:#9e2525}
</style>
