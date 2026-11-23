<template>
  <section class="portal-access-editor" aria-label="Portal relationship access">
    <h3>Portal access for this client</h3>
    <p>Select who can use the portal before sending an invitation. A contact can remain on file without portal access. Clinical records still follow the client’s consent and verified relationship permissions.</p>
    <p v-if="loading" role="status">Loading portal relationships…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <article v-for="account in accounts" :key="account.guardian_user_id">
      <strong>{{ [account.first_name,account.last_name].filter(Boolean).join(' ') }}</strong><small>{{ account.email }} · {{ account.relationship_type === 'self' ? 'Client (self)' : account.relationship_title || 'Guardian' }}</small>
      <p v-if="account.permissions_json?.relationshipRevoked" role="status">Marked as an incorrect relationship. Access is revoked.</p>
      <template v-else>
      <label>Access level<select v-model="modes[account.guardian_user_id]" :disabled="busy"><option value="none">No portal access</option><option value="care">{{ account.relationship_type === 'self' ? 'Client access' : 'Care access (existing consent applies)' }}</option><template v-if="account.relationship_type !== 'self'"><option value="payment_only">Payment only · visit date, type and amount due</option><option value="payer_plus">Payer plus · service and insurance payment detail</option></template></select></label>
      <label v-if="account.permissions_json?.pendingGuardianVerification && modes[account.guardian_user_id]!=='none'" class="self-confirm"><span><input type="checkbox" v-model="verified[account.guardian_user_id]" /> I verified this guardian’s identity and authority for this access.</span></label>
      <template v-if="modes[account.guardian_user_id] !== originalMode(account) || verified[account.guardian_user_id]"><label>Reason for access change<input v-model="reasons[account.guardian_user_id]" maxlength="1000" placeholder="Record the verified relationship or client’s requested restriction" /></label><button type="button" :disabled="busy || !reasons[account.guardian_user_id]?.trim() || (account.permissions_json?.pendingGuardianVerification && modes[account.guardian_user_id]!=='none' && !verified[account.guardian_user_id])" @click="save(account)">Save access</button></template>
      <p v-if="account.permissions_json?.noView || account.permissions_json?.noViewOtherGuardian">An existing privacy restriction remains in effect. Review its authority in the client’s access record.</p>
      <DisconnectGuardianButton v-if="account.relationship_type !== 'self'" :client-id="Number(clientId)"
        :guardian-id="Number(account.guardian_user_id)" @disconnected="onDisconnected" />
      </template>
    </article>
    <p v-if="!loading && !accounts.length">No linked accounts yet. Prepare the client’s own account to invite them. Add a guardian separately under Account → Guardians.</p>
    <button v-if="showSelfPreparation && !selfIdentity && !accounts.some(account=>account.relationship_type==='self')" type="button" :disabled="busy" @click="loadClientIdentity">Prepare client’s own portal account</button>
    <form v-if="selfIdentity" @submit.prevent="prepareSelf"><p><strong>{{selfIdentity.full_name}}</strong> · {{selfIdentity.email}}</p><label class="self-confirm"><input v-model="selfConfirmed" type="checkbox" required /> I verified that this is the client’s own email and that the client should receive their own portal access. This email does not belong to a guardian.</label><button :disabled="busy || !selfConfirmed">Prepare client account without sending email</button></form>
  </section>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
import DisconnectGuardianButton from './DisconnectGuardianButton.vue';
const props=defineProps({clientId:{type:[Number,String],required:true},agencyId:[Number,String],startSelfReview:Boolean,showSelfPreparation:{type:Boolean,default:true},refreshKey:[Number,String]});const emit=defineEmits(['saved','busy']);
const verified=ref({});
const accounts=ref([]),modes=ref({}),reasons=ref({}),error=ref(''),notice=ref(''),busy=ref(false),loading=ref(false);let generation=0;
const requestConfig = () => ({ skipGlobalLoading:true, ...(props.agencyId ? {headers:{'X-Agency-Id':String(props.agencyId)}} : {}) });
const selfIdentity=ref(null),selfConfirmed=ref(false);
async function loadClientIdentity(){const own=generation;error.value='';selfIdentity.value=null;selfConfirmed.value=false;try{const {data}=await api.get(`/clients/${props.clientId}`,requestConfig());if(own!==generation)return;const client=data.client||data;if(!client.email){error.value='Save the client’s own email under Demographics first. Keep guardian contact information on the guardian’s contact card.';return;}selfIdentity.value=client;}catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'The client’s saved contact information could not be loaded.';}}
async function prepareSelf(){if(busy.value||!selfConfirmed.value||!selfIdentity.value)return;const own=generation,client=selfIdentity.value,parts=String(client.full_name||'').trim().split(/\s+/);if(parts.length<2){error.value='Save the client’s legal first and last name before preparing their account.';return;}busy.value=true;emit('busy',true);error.value='';try{await api.post(`/clients/${props.clientId}/guardians`,{firstName:parts[0],lastName:parts.slice(1).join(' '),email:client.email,relationshipType:'self',relationshipTitle:'Self',accessEnabled:true,clientOwnContactConfirmed:true,sendInvitation:false},requestConfig());if(own!==generation)return;selfIdentity.value=null;selfConfirmed.value=false;await load();notice.value='Client account prepared. Review the client-only invitation before sending.';emit('saved');}catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'The client’s account could not be prepared.';}finally{busy.value=false;emit('busy',false);}}
function originalMode(account){if(Number(account.access_enabled)!==1)return 'none';return account.permissions_json?.billingOnly ? account.permissions_json.billingDetailLevel==='payer_plus'?'payer_plus':'payment_only':'care';}
async function load(){const own=++generation;selfIdentity.value=null;selfConfirmed.value=false;notice.value='';accounts.value=[];modes.value={};reasons.value={};verified.value={};error.value='';if(!props.clientId)return;loading.value=true;try{const {data}=await api.get(`/clients/${props.clientId}/guardians`,requestConfig());if(own!==generation)return;accounts.value=Array.isArray(data)?data:[];for(const account of accounts.value)modes.value[account.guardian_user_id]=originalMode(account);}catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Portal relationships could not be loaded.';}finally{if(own===generation)loading.value=false;}}
async function save(account) {
  if (busy.value) return;
  const client = props.clientId;
  const id = account.guardian_user_id;
  busy.value = true;
  emit('busy', true);
  error.value = '';
  notice.value = '';
  try {
    await api.patch(`/clients/${client}/guardians/${id}`, {
      accessMode: modes.value[id],
      accessReason: reasons.value[id],
      ...(verified.value[id] ? { relationshipVerified: true } : {})
    }, requestConfig());
    if (client !== props.clientId) return;
    await load();
    if (client !== props.clientId) return;
    notice.value = 'Portal access saved.';
    emit('saved');
  } catch (e) {
    if (client === props.clientId) error.value = e.response?.data?.error?.message || 'Portal access could not be saved.';
  } finally {
    busy.value = false;
    emit('busy', false);
  }
}
async function onDisconnected() { await load(); notice.value = 'Guardian disconnected.'; emit('saved'); }
watch(()=>[props.clientId,props.agencyId,props.refreshKey,props.startSelfReview],async()=>{
  const pending=load(), own=generation;
  await pending;
  if(own===generation && !error.value && props.showSelfPreparation && props.startSelfReview && !accounts.value.some(row=>row.relationship_type==='self')) await loadClientIdentity();
},{immediate:true});onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>.portal-access-editor{padding:16px;border:1px solid #d5e1ed;border-radius:10px;margin:16px 0}.portal-access-editor article{padding:14px 0;border-top:1px solid #d5e1ed}.portal-access-editor small{display:block;margin-top:5px}.portal-access-editor label{display:grid;gap:6px;margin:12px 0}.portal-access-editor select,.portal-access-editor input{padding:10px;max-width:100%;font:inherit;border:1px solid #b6c9dc;border-radius:6px}.portal-access-editor button{padding:10px 15px;font:inherit}.portal-access-editor [role=alert]{color:#a12727}</style>
