<template>
  <section class="client-portal-overview" aria-label="Client portal overview">
    <header><div><h2>Portal · {{client.full_name||client.initials}}</h2><p>Access, shared records, and activity for this client’s portal accounts.</p></div><button v-if="canViewAs" type="button" :disabled="loading" @click="load">Refresh overview</button></header>
    <nav class="portal-actions" aria-label="Client portal actions"><button type="button" @click="$emit('share-documents')">Share documents</button><button type="button" @click="$emit('share-assessments')">Share assessments</button><button type="button" @click="$emit('manage-access')">Manage portal access</button></nav>
    <p v-if="error" role="alert">{{error}}</p><p v-if="loading" role="status">Loading portal overview…</p>
    <p v-if="canViewAs && !loading && !error && !accounts.length">No portal accounts are linked. Portal availability alone does not give anyone access.</p>
    <template v-if="canViewAs"><div class="portal-metrics"><article><strong>{{accounts.length}}</strong><span>Linked portal accounts</span></article><article><strong>{{available.length}}</strong><span>Accounts with access</span></article><article><strong>{{date(latestActivity)}}</strong><span>Last recorded activity in this practice</span></article></div>
      <p v-if="!loading&&!error&&!accounts.length">No client or parent portal accounts are linked. Use Manage portal access to review invitations and relationships.</p>
      <div class="portal-accounts"><article v-for="account in accounts" :key="account.id"><h3>{{account.name}}</h3><p>{{account.relationship}} · {{account.available?'Access enabled':'Access disabled'}}</p><p v-if="account.enrollmentStatus" class="enrollment-status">{{ enrollmentLabel(account.enrollmentStatus) }}</p><p v-if="account.invitationId">Invitation #{{ account.invitationId }} · {{ deliveryLabel(account.invitationDeliveryStatus) }}<template v-if="account.invitationSentAt"> · {{ date(account.invitationSentAt) }}</template></p><dl><dt>Last recorded sign-in in this practice</dt><dd>{{date(account.lastLogin)}}</dd><dt>Last sign-in network address</dt><dd>{{account.lastLoginIp||'None recorded'}}</dd><dt>Last activity</dt><dd>{{date(account.lastActivity)}}</dd></dl><div class="account-actions"><button type="button" :disabled="!account.available" @click="previewIds=[account.id]">View as {{account.name}}</button><button type="button" :disabled="!account.available" @click="loadActivity(account)">Activity</button></div></article></div>
      <button v-if="available.length>1" type="button" @click="previewIds=available.map(a=>a.id)">Show all linked portal views</button>
      <section v-if="activity" class="portal-activity"><h3>{{activity.account.name}} · Recent activity</h3><p>Latest 100 sign-ins and portal opens, with the network address recorded for each. Message text and document contents are not stored here. Staff previews are attributed to the staff member.</p><ol><li v-for="event in activity.events" :key="`${event.source}-${event.id}`"><time>{{date(event.occurredAt)}}</time> · {{describe(event)}}<span v-if="event.ipAddress"> · {{event.ipAddress}}</span></li></ol><p v-if="!activity.events.length">No activity recorded for this practice.</p></section>
      <PortalAccountPreview v-for="account in viewedAccounts" :key="`${client.id}:${account.id}`" :account="account" :client="client" :agency="agency" @close="previewIds=previewIds.filter(id=>id!==account.id)" />
    </template><p v-else>Portal activity and View as are available to admin, support, and superadmin.</p>
  </section>
</template>
<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
import PortalAccountPreview from '../../auricwell/PortalAccountPreview.vue';
import { toPlainEnglish } from '../../utils/auditActionRegistry';
const describe=event=>{const route=String(event.route||'');const writing=event.method&&event.method!=='GET'&&event.method!=='HEAD';
 if(route.includes('download')||route.includes('download-url'))return 'Opened a portal document';
 if(route.includes('intake-documents')||route.includes('enrollment-copies'))return route.includes('/:')&&!route.endsWith('intake-documents')&&!route.endsWith('enrollment-copies')?'Opened a portal document':'Opened enrollment documents';
 if(route.includes('shared-files'))return route.includes('/:')?'Opened a shared file':'Opened shared files';
 if(route.includes('/messages'))return writing?'Sent a portal message':route.includes('/messages/')?'Opened a message':'Opened messages';
 if(route.includes('/emails'))return writing?'Sent a portal email':route.includes('/emails/')?'Opened an email':'Opened portal email';
 if(route.includes('appointments'))return 'Opened appointments';
 if(route.includes('daily-notes')||route.includes('/details'))return 'Opened the portal record';
 if(route.includes('balances'))return 'Opened balances';
 if(route.endsWith('/overview'))return 'Opened the portal home';
 if(route.includes('/clients/'))return 'Opened the portal record';
 if(route.includes('skill-builders'))return 'Opened skill builder';
 if(event.action==='login')return 'Signed in';
 return toPlainEnglish(event.action)||String(event.action||'Portal activity').replaceAll('_',' ');};
const props=defineProps({client:{type:Object,required:true},agency:{type:Object,required:true},actor:{type:Object,required:true}});
defineEmits(['share-documents','share-assessments','manage-access']);
const canViewAs=computed(()=>['admin','support','super_admin'].includes(props.actor.role));
const enrollmentLabel = status => ({pending:'Own enrollment and signatures pending',expired:'Enrollment invitation expired',accepted:'Own enrollment completed',cancelled:'Enrollment invitation cancelled'}[status] || `Enrollment: ${status}`);
const deliveryLabel = status => ({sent:'Invitation sent',delivered:'Invitation delivered',pending:'Delivery pending',sending:'Delivery in progress',failed:'Invitation delivery failed',bounced:'Invitation bounced',not_requested:'Invitation not sent',unknown:'Delivery not recorded — review communication history'}[status] || `Delivery: ${status}`);
const accounts=ref([]),previewIds=ref([]),activity=ref(null),loading=ref(false),error=ref('');let generation=0,activityGeneration=0;
const available=computed(()=>accounts.value.filter(a=>a.available)),viewedAccounts=computed(()=>available.value.filter(a=>previewIds.value.includes(a.id)));
const latestActivity=computed(()=>accounts.value.map(a=>a.lastActivity).filter(Boolean).sort().at(-1));
const date=value=>value?new Date(value).toLocaleString('en-US',{timeZone:props.actor.timezone||'America/Denver'}):'None recorded';
const endpoint=()=>`/portal-admin/clients/${props.client.id}/accounts`;
async function load(){const run=++generation;++activityGeneration;accounts.value=[];previewIds.value=[];activity.value=null;error.value='';loading.value=false;if(!canViewAs.value)return;loading.value=true;try{const{data}=await api.get(endpoint(),{params:{agencyId:props.agency.id}});if(run===generation)accounts.value=data.accounts;}catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'Portal overview could not be loaded.';}finally{if(run===generation)loading.value=false;}}
async function loadActivity(account){const run=++activityGeneration;activity.value=null;error.value='';try{const{data}=await api.get(`${endpoint()}/${account.id}/activity`,{params:{agencyId:props.agency.id}});if(run===activityGeneration)activity.value=data;}catch(e){if(run===activityGeneration)error.value=e.response?.data?.error?.message||'Activity could not be loaded.';}}
watch(()=>[props.client.id,props.agency.id,props.actor.role],load,{immediate:true});onBeforeUnmount(()=>{++generation;++activityGeneration;});
</script>
<style scoped>
.client-portal-overview{padding:20px;background:white;border:1px solid #d6e2ef;border-radius:14px;color:#173c62;min-width:0}.client-portal-overview header,.portal-actions,.account-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.client-portal-overview header{justify-content:space-between}.client-portal-overview header h2{margin:0}.client-portal-overview header p{color:#526d89}.portal-actions{margin:16px 0 24px}.client-portal-overview button{font:inherit;padding:10px 14px;border-radius:8px;border:1px solid #b5cbe0;background:#eef5fd;color:#174e7f;cursor:pointer}.client-portal-overview button:disabled{opacity:.5;cursor:default}.portal-metrics,.portal-accounts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:22px}.portal-metrics article,.portal-accounts article{padding:18px;border:1px solid #d6e2ef;border-radius:10px;min-width:0}.portal-metrics strong,.portal-metrics span{display:block}.portal-metrics strong{font-size:22px;margin-bottom:7px}.portal-metrics span,dt{font-size:13px;color:#526d89}.portal-accounts h3{margin:0 0 8px}dd{margin:5px 0 14px}.portal-activity{margin-top:22px}.portal-activity li{padding:7px 0}
</style>
