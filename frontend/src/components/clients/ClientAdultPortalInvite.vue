<template>
  <section class="own-portal" aria-label="Client’s own portal">
    <h3>Client’s own portal</h3>
    <p>Invite this client to their own account. Guardian access is managed separately.</p>
    <p v-if="loading" role="status">Loading the client’s saved email and account…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="client && !loading">
      <p><strong>{{ client.full_name || client.initials }}</strong> · {{ recipientEmail || 'Client email not recorded' }}</p>
      <button v-if="!recipientEmail" type="button" @click="$emit('edit-contact')">Add client email in Demographics</button>
      <p v-else-if="restricted">This client’s account has disabled or restricted access. Review the existing relationship before sending an invitation.</p>
      <template v-else>
        <p v-if="self">The client’s existing account will be used: {{ self.email }}.</p>
        <label><input v-model="confirmed" type="checkbox" :disabled="busy || delivered" /> I verified that this is the client’s own email and that the client should receive their own portal access.</label>
        <button type="button" :disabled="!confirmed || busy || delivered" @click="invite">{{ busy ? 'Preparing invitation…' : 'Invite client to their own portal' }}</button>
      </template>
    </template>
  </section>
</template>
<script setup>
import {computed, onBeforeUnmount, ref, watch} from 'vue';
import api from '../../services/api';
const props=defineProps({clientId:{type:Number,required:true},agencyId:{type:Number,required:true}});
const emit=defineEmits(['updated','edit-contact','busy']);
const client=ref(null),accounts=ref([]),loading=ref(false),busy=ref(false),confirmed=ref(false),delivered=ref(false),error=ref(''),notice=ref('');let generation=0;
const config=()=>({skipGlobalLoading:true,headers:{'X-Agency-Id':String(props.agencyId)}});
const recipientEmail=computed(()=>self.value?.email||client.value?.email||'');
const self=computed(()=>accounts.value.find(row=>row.relationship_type==='self'));
const restricted=computed(()=>self.value && (Number(self.value.access_enabled)!==1 || ['relationshipRevoked','pendingGuardianVerification','noView','noViewOtherGuardian','dependentSelfAccess','billingOnly'].some(key=>self.value.permissions_json?.[key])));
async function load(){const run=++generation;client.value=null;accounts.value=[];confirmed.value=false;delivered.value=false;error.value='';notice.value='';loading.value=true;
  try{const [identity,links]=await Promise.all([api.get(`/clients/${props.clientId}`,config()),api.get(`/clients/${props.clientId}/guardians`,config())]);if(run!==generation)return;client.value=identity.data.client||identity.data;accounts.value=Array.isArray(links.data)?links.data:[];}
  catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'The client’s contact or account could not be loaded.';}
  finally{if(run===generation)loading.value=false;}}
async function invite(){if(busy.value||!confirmed.value||restricted.value||!recipientEmail.value)return;
  const run=generation,id=props.clientId,aid=props.agencyId,request=config();busy.value=true;emit('busy',true);error.value='';notice.value='';
  let sendStarted=false;
  try{let userId=Number(self.value?.guardian_user_id);
    if(!userId){const parts=String(client.value.full_name||'').trim().split(/\s+/);if(parts.length<2)throw new Error('Save the client’s first and last name in Demographics first.');
      const {data}=await api.post(`/clients/${id}/guardians`,{email:client.value.email,firstName:parts[0],lastName:parts.slice(1).join(' '),relationshipType:'self',relationshipTitle:'Self',accessEnabled:true,clientOwnContactConfirmed:true,sendInvitation:false},request);
      if(run!==generation)return;userId=Number(data.guardianUser?.id);if(!userId)throw new Error('Account preparation was not confirmed. Refresh portal access before retrying.');
      accounts.value=[{guardian_user_id:userId,relationship_type:'self',access_enabled:1,email:client.value.email}];emit('updated');
    }
    const {data:preview}=await api.post('/clients/portal-invites/preview',{clientIds:[id]},request);if(run!==generation)return;
    const recipients=(preview.recipients||[]).filter(row=>Number(row.guardianUserId)===userId && row.clients?.some(c=>Number(c.clientId)===id) && Number(row.agencyId)===aid);
    if(recipients.length!==1)throw new Error('The client’s own invitation needs review. Check the linked account and portal status; no invitation was sent.');
    const recipient=recipients[0];
    sendStarted=true;
    const {data}=await api.post('/clients/portal-invites/send',{clientIds:[id],recipientKey:recipient.key,recipientSnapshot:recipient.snapshot},request);if(run!==generation)return;
    delivered.value=true;
    notice.value=({sent:'Invitation sent to the client’s own account.',queued:'Invitation queued for email approval.',failed:'Delivery failed. Review invitation history before retrying.',skipped:'Email delivery was skipped. Review invitation history.',redirected:'Invitation redirected to the configured test inbox.',unconfirmed:'Delivery could not be confirmed. Check email history before retrying.'})[data.status]||'Delivery could not be confirmed. Check email history before retrying.';
    emit('updated');
  }catch(e){if(run===generation){error.value=e.response?.data?.error?.message||e.message||'The invitation could not be confirmed. Check email history before retrying.';if(sendStarted && e.response?.status!==409){delivered.value=true;error.value+=' Check invitation history before retrying.';}
    if(!e.response && !e.message?.startsWith('The client’s own invitation') && !e.message?.startsWith('Save the client'))delivered.value=true;}}
  finally{busy.value=false;emit('busy',false);}}
watch(()=>[props.clientId,props.agencyId],load,{immediate:true});onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>
.own-portal{border:1px solid #cdded9;border-radius:12px;padding:18px;margin:16px 0;background:#f7fbf9}.own-portal h3{margin-top:0}.own-portal p{line-height:1.6}.own-portal label{display:flex;align-items:flex-start;gap:10px;margin:16px 0;line-height:1.5}.own-portal input{flex:none;margin-top:5px}.own-portal button{font:inherit;padding:10px 16px;border:1px solid #91b3a7;border-radius:8px;color:#214c3c;background:white}.own-portal button:disabled{opacity:.55}.own-portal [role=alert]{color:#a12727}
</style>
