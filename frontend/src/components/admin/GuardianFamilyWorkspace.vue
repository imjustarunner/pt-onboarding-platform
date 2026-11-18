<template>
 <section class="guardian-workspace" aria-label="Guardian family account">
  <p v-if="loading" role="status">Loading family account…</p><p v-else-if="error" role="alert">{{error}}</p>
  <template v-else-if="data">
   <header><div><p class="eyebrow">Guardian account · Staff view</p><h2>Family & portal</h2><p>Review each child’s access, documents and assigned balances.</p></div><span class="account-state">{{data.guardian.password_set?'Password set':'Password setup needed'}}</span></header>
   <div class="contact-summary"><div><span>Email</span><a v-if="data.guardian.email" :href="`mailto:${data.guardian.email}`">{{data.guardian.email}}</a><strong v-else>No email on file</strong></div><div><span>Phone</span><a v-if="data.guardian.phone" :href="`tel:${data.guardian.phone.replace(/[^+0-9]/g,'')}`">{{data.guardian.phone}}</a><strong v-else>No phone on file</strong></div><div><span>Linked children</span><strong>{{data.clients.length}}</strong></div></div>
   <ClientGuardianContactEditor v-if="canEdit && data.clients.length" :client-id="data.clients[0].client_id" :guardian-user-id="guardianId" :profile="{firstName:data.guardian.first_name,lastName:data.guardian.last_name,email:data.guardian.email,phone:data.guardian.phone,relationship:data.clients[0].relationship_title}" @saved="updated" />
   <div class="workspace-tools"><button v-if="canEdit && data.clients.length" type="button" class="btn btn-secondary" @click="showInvite=true">Email portal setup / invitation</button><button type="button" class="btn btn-secondary" @click="load">Refresh</button></div>
   <p v-if="!data.clients.length">No linked children are available. Use Linked Clients to connect this account.</p>
   <div class="family-profiles"><article v-for="client in data.clients" :key="client.client_id">
    <header><div><h3>{{client.full_name||client.initials||`Client ${client.client_id}`}}</h3><p>{{client.agency_name}}<template v-if="client.organization_name"> · {{client.organization_name}}</template></p></div><span class="relationship">{{client.relationship_title||'Guardian'}}</span></header>
    <dl><div><dt>Portal access</dt><dd>{{Number(client.access_enabled)===1?'Relationship enabled':'Relationship disabled'}}</dd></div><div><dt>Guardian’s verified amount due</dt><dd>{{client.billing.available?money(client.billing.amountDueCents):'Unavailable under current billing access'}}</dd><small v-if="client.billing.error">{{client.billing.error}}</small><small v-else-if="client.billing.available && !client.billing.assignedBalanceCount">No balances assigned to this guardian.</small><small v-else-if="client.billing.reviewCount">{{client.billing.reviewCount}} under review or awaiting payment confirmation.</small></div></dl>
    <div class="profile-actions"><button type="button" @click="open(client,'portal')">Portal & access</button><button type="button" @click="open(client,'phi')">Documents & forms</button><button v-if="client.billing.available" type="button" @click="open(client,'client-billing')">Balances & receipts</button><button type="button" @click="open(client,'overview')">Open child’s record</button></div>
   </article></div>
   <p class="workspace-note">Actions use your staff permissions. Document assignments and sharing are selected separately for each child and recipient.</p>
  </template>
  <ClientDetailPanel v-if="opened" :key="`${opened.client_id}:${openedTab}`" :client="{...opened,id:opened.client_id}" :initial-tab="openedTab" @close="opened=null" @updated="load" />
  <ClientPortalInviteDialog v-if="showInvite" :recipient-guardian-id="guardianId" :client-ids="data.clients.map(c=>c.client_id)" @close="showInvite=false" />
 </section>
</template>
<script setup>
import {defineAsyncComponent,ref,watch} from 'vue';
import api from '../../services/api';
import ClientGuardianContactEditor from './ClientGuardianContactEditor.vue';
import ClientPortalInviteDialog from '../clients/ClientPortalInviteDialog.vue';
const ClientDetailPanel=defineAsyncComponent(()=>import('./ClientDetailPanel.vue').then(module=>module.default));
const props=defineProps({guardianId:{type:Number,required:true},canEdit:Boolean});const emit=defineEmits(['updated']);
const data=ref(null),loading=ref(false),error=ref(''),opened=ref(null),openedTab=ref('portal'),showInvite=ref(false);let generation=0;
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents||0)/100);
function open(client,tab){opened.value=client;openedTab.value=tab;}
async function load(){const own=++generation;loading.value=true;error.value='';try{const response=await api.get(`/users/${props.guardianId}/guardian-workspace`,{skipGlobalLoading:true});if(own===generation)data.value=response.data;}catch(e){if(own===generation){data.value=null;error.value=e.response?.data?.error?.message||'Family account could not be loaded.';}}finally{if(own===generation)loading.value=false;}}
async function updated(){await load();emit('updated');}
watch(()=>props.guardianId,()=>{opened.value=null;showInvite.value=false;data.value=null;void load();},{immediate:true});
</script>
<style scoped>
.guardian-workspace{background:#f5f8fb;border:1px solid #d8e2ed;border-radius:16px;padding:24px;margin:18px 0;color:#19334d}.guardian-workspace header{display:flex;justify-content:space-between;align-items:start;gap:16px;flex-wrap:wrap}.guardian-workspace h2,.guardian-workspace h3{margin:0 0 8px}.guardian-workspace p{margin:6px 0;line-height:1.6}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#536b82}.account-state,.relationship{font-size:12px;background:#e4edf4;padding:7px 11px;border-radius:20px}.contact-summary{display:flex;gap:32px;flex-wrap:wrap;margin:22px 0}.contact-summary>div{display:grid;gap:6px}.contact-summary span,dt{font-size:12px;color:#587087}.contact-summary a{color:#164b78;overflow-wrap:anywhere}.workspace-tools,.profile-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.family-profiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px;margin-top:20px}.family-profiles article{background:white;border:1px solid #d8e2ed;border-radius:12px;padding:20px}.family-profiles dl{display:grid;gap:16px;margin:20px 0}.family-profiles dd{margin:5px 0;font-weight:600}.family-profiles small,.workspace-note{font-size:12px;line-height:1.6;color:#577086}.profile-actions button{padding:10px 12px;border:1px solid #cbd9e7;background:#f7fafc;border-radius:7px;color:#164b78;cursor:pointer;font:inherit;font-size:13px}[role=alert]{color:#a32727}@media(max-width:650px){.guardian-workspace{padding:16px}.contact-summary{gap:18px}}
</style>
