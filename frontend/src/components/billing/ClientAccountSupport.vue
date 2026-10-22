<template>
  <section class="account-support" aria-label="Account support">
    <h4>Payments &amp; portal access</h4>
    <p v-if="loading" role="status">Loading account status…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="summary">
      <p><strong>Current payable balance: {{ money(summary.balance.payableCents) }}</strong></p>
      <p v-if="summary.balance.hasItemsUnderReview">Additional items are pending or under billing review and are excluded from this amount.</p>
      <small>Current app balance. The billing team handles corrections and reconciliation.</small>
      <ul v-if="summary.payers.length">
        <li v-for="(payer,index) in summary.payers" :key="index">
          <strong>{{ payer.name }}</strong>:
          <template v-if="payer.cardOnFile">Card on file for this client<span v-if="payer.card?.brand"> · {{ payer.card.brand }}</span><span v-if="payer.card?.last4"> ending {{ payer.card.last4 }}</span><span v-if="payer.card?.verificationRequired"> · needs verification in the portal</span></template>
          <template v-else>No card assigned to this client</template>
        </li>
      </ul>
      <p v-else>No active responsible payer is set up for this client.</p>
      <label v-if="summary.portalUrl">Client portal link<input :value="summary.portalUrl" readonly @click="$event.target.select()" /></label>
    </template>
    <p>Clients and authorized guardians can add a card, pay their balances, and access receipts and payment history in their own portal. Saving a card does not authorize recurring charges.</p>
    <p>Send an invitation for portal access. Existing users can choose <strong>Forgot password</strong> on the sign-in page to receive a reset email.</p>
    <div class="account-support-actions">
      <button type="button" class="btn btn-secondary" @click="showInvite=true">Send portal invitation</button>
      <button v-if="summary?.portalUrl" type="button" class="btn btn-secondary" @click="copyPortal">Copy portal link</button>
      <button type="button" class="btn btn-secondary" @click="$emit('manage-contacts')">Manage portal contacts</button>
      <button type="button" class="btn btn-secondary" :disabled="loading" @click="load">Refresh account status</button>
    </div>
    <ClientPortalInviteDialog v-if="showInvite" :key="clientId" :client-ids="[Number(clientId)]" @close="showInvite=false" />
  </section>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
import ClientPortalInviteDialog from '../clients/ClientPortalInviteDialog.vue';
const props=defineProps({clientId:{type:[String,Number],required:true},agencyId:{type:[String,Number],required:true}});
defineEmits(['manage-contacts']);
const summary=ref(null),loading=ref(false),error=ref(''),notice=ref(''),showInvite=ref(false);
let generation=0;
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents||0)/100);
async function load(){
  const current=++generation;loading.value=true;summary.value=null;error.value='';notice.value='';
  try{const {data}=await api.get(`/clients/${props.clientId}/account-support`);if(current===generation)summary.value=data;}
  catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'Account status could not be loaded.';}
  finally{if(current===generation)loading.value=false;}
}
async function copyPortal(){
  const current=generation;
  try{await navigator.clipboard.writeText(summary.value.portalUrl);if(current===generation)notice.value='Portal link copied.';}
  catch{if(current===generation)notice.value='Select and copy the portal link above.';}
}
watch(()=>[props.clientId,props.agencyId],()=>{showInvite.value=false;void load();},{immediate:true});
onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>
.account-support{padding:16px;border:1px solid var(--border);border-radius:10px;margin:16px 0}.account-support p{line-height:1.6}.account-support li{margin:8px 0}.account-support label{display:grid;gap:6px;margin:16px 0}.account-support input{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-primary)}.account-support-actions{display:flex;gap:8px;flex-wrap:wrap}.account-support [role=alert]{color:var(--app-text-red,#b91c1c)}
</style>
