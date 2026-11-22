<template>
 <section class="guardian-workspace" aria-label="Guardian family account">
  <p v-if="loading" role="status">Loading family account…</p><p v-else-if="error" role="alert">{{error}}</p>
  <template v-else-if="data">
   <header class="portal-heading">
    <div><h2>Guardian portal</h2><p>Check sign-in setup and access for each linked client.</p></div>
    <div class="workspace-tools">
      <button v-if="canEdit && data.clients.length" type="button" class="btn btn-secondary" @click="showInvite=true">Email portal setup / invitation</button>
      <button type="button" class="btn btn-secondary" @click="load">Refresh</button>
    </div>
   </header>
   <dl class="contact-summary">
    <div><dt>Password</dt><dd><span class="account-state" :class="{ ready: Number(data.guardian.password_set) === 1 }">{{ Number(data.guardian.password_set) === 1 ? 'Password set' : 'Password setup needed' }}</span></dd></div>
    <div><dt>Last recorded sign-in</dt><dd>{{ signInLabel }}</dd></div>
    <div><dt>Email</dt><dd><a v-if="data.guardian.email" :href="`mailto:${data.guardian.email}`">{{ data.guardian.email }}</a><span v-else>No email on file</span></dd></div>
    <div><dt>Phone</dt><dd><a v-if="data.guardian.phone" :href="`tel:${data.guardian.phone.replace(/[^+0-9]/g,'')}`">{{ data.guardian.phone }}</a><span v-else>No phone on file</span></dd></div>
   </dl>
   <ClientGuardianContactEditor v-if="canEdit && contactRelationship" :client-id="contactRelationship.client_id" :guardian-user-id="guardianId" :profile="{firstName:data.guardian.first_name,lastName:data.guardian.last_name,email:data.guardian.email,phone:data.guardian.phone,relationship:contactRelationship.relationship_title}" @saved="updated" />
   <p v-if="!data.clients.length">No current client relationships are available for this guardian account.</p>
   <div class="family-profiles"><article v-for="client in data.clients" :key="client.client_id">
    <header><div><h3>{{client.full_name||client.initials||`Client ${client.client_id}`}}</h3><p>{{client.agency_name}}<template v-if="client.organization_name"> · {{client.organization_name}}</template></p></div><span class="relationship">{{client.relationship_title||'Guardian'}}</span></header>
    <dl><div><dt>Portal access</dt><dd>{{Number(client.access_enabled)===1?'Portal access enabled':'Portal access disabled'}}</dd></div><div><dt>Guardian’s verified amount due</dt><dd>{{client.billing.available?money(client.billing.amountDueCents):'Unavailable under current billing access'}}</dd><small v-if="client.billing.error">{{client.billing.error}}</small><small v-else-if="client.billing.available && !client.billing.assignedBalanceCount">No balances assigned to this guardian.</small><small v-else-if="client.billing.reviewCount">{{client.billing.reviewCount}} under review or awaiting payment confirmation.</small></div></dl>
    <p v-if="Number(client.access_enabled)!==1" class="disabled-relationship-note">This relationship stays linked and its history is preserved. Enable portal access again without reconnecting.</p>
    <div class="profile-actions"><button type="button" @click="open(client,'portal')">{{canEdit && Number(client.access_enabled)!==1 ? 'Enable portal access' : 'Portal & access'}}</button><button type="button" @click="open(client,'phi')">Documents & forms</button><button v-if="client.billing.available" type="button" @click="open(client,'client-billing')">Balances & receipts</button><button type="button" @click="open(client,'overview')">Open child’s record</button></div>
   </article></div>
   <details v-if="data.historicalRelationships?.length" class="relationship-history">
    <summary>Past relationships ({{data.historicalRelationships.length}})</summary>
    <p>These relationships were marked incorrect. Their history is preserved.</p>
    <article v-for="past in data.historicalRelationships" :key="past.client_id"><strong>{{past.full_name||past.initials||`Client ${past.client_id}`}}</strong><p>{{past.agency_name}} · Marked incorrect</p></article>
   </details>
  </template>
  <ClientDetailPanel v-if="opened" :key="`${opened.client_id}:${openedTab}`" :client="{...opened,id:opened.client_id}" :initial-tab="openedTab" @close="opened=null" @updated="load" />
  <ClientPortalInviteDialog v-if="showInvite" :recipient-guardian-id="guardianId" :client-ids="data.clients.map(c=>c.client_id)" @close="showInvite=false" />
 </section>
</template>
<script setup>
import {computed,defineAsyncComponent,ref,watch} from 'vue';
import api from '../../services/api';
import ClientGuardianContactEditor from './ClientGuardianContactEditor.vue';
import ClientPortalInviteDialog from '../clients/ClientPortalInviteDialog.vue';
const ClientDetailPanel=defineAsyncComponent(()=>import('./ClientDetailPanel.vue').then(module=>module.default));
const props=defineProps({guardianId:{type:Number,required:true},canEdit:Boolean});const emit=defineEmits(['updated']);
const data=ref(null),loading=ref(false),error=ref(''),opened=ref(null),openedTab=ref('portal'),showInvite=ref(false);let generation=0;
const signInLabel = computed(() => {
  const value = data.value?.guardian.lastLogin;
  if (!value) return 'No sign-in on record';
  const date = new Date(value);
  return Number.isNaN(+date) ? 'Unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
});
const contactRelationship=computed(()=>data.value?.clients?.[0]||data.value?.historicalRelationships?.[0]||null);
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents||0)/100);
function open(client,tab){opened.value=client;openedTab.value=tab;}
async function load(){const own=++generation;loading.value=true;error.value='';try{const response=await api.get(`/users/${props.guardianId}/guardian-workspace`,{skipGlobalLoading:true});if(own===generation)data.value=response.data;}catch(e){if(own===generation){data.value=null;error.value=e.response?.data?.error?.message||'Family account could not be loaded.';}}finally{if(own===generation)loading.value=false;}}
async function updated(){await load();emit('updated');}
watch(()=>props.guardianId,()=>{opened.value=null;showInvite.value=false;data.value=null;void load();},{immediate:true});
</script>
<style scoped>
.guardian-workspace { max-width: 72rem; margin: 0 auto; color: var(--text-primary, #19334d); }
.guardian-workspace header { display: flex; justify-content: space-between; align-items: start; gap: 12px; flex-wrap: wrap; }
.guardian-workspace h2, .guardian-workspace h3 { margin: 0 0 5px; }
.guardian-workspace p { margin: 0; color: var(--text-secondary, #536b82); line-height: 1.5; }
.account-state, .relationship { display: inline-block; font-size: 12px; background: #fff2ca; color: #754607; padding: 4px 9px; border-radius: 6px; }
.account-state.ready, .relationship { background: #d9f4e7; color: #185842; }
.contact-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 14px; margin: 16px 0; padding: 14px 16px; border: 1px solid var(--border, #d8e2ed); border-radius: 10px; background: var(--bg-alt, #f5f8fb); }
dt { font-size: 12px; color: var(--text-secondary, #587087); }
dd { margin: 4px 0 0; font-weight: 600; overflow-wrap: anywhere; }
.workspace-tools, .profile-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.family-profiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px; margin-top: 16px; }
.family-profiles article { background: var(--bg-card, white); border: 1px solid var(--border, #d8e2ed); border-radius: 12px; padding: 16px; }
.family-profiles dl { display: grid; gap: 10px; margin: 14px 0; }
.family-profiles small { font-size: 12px; line-height: 1.5; color: var(--text-secondary, #577086); }
.profile-actions button { padding: 6px 10px; border: 1px solid var(--border, #cbd9e7); background: var(--bg-alt, #f7fafc); border-radius: 6px; color: inherit; cursor: pointer; font: inherit; font-size: 13px; }
[role=alert] { color: var(--danger, #a32727); }
</style>
