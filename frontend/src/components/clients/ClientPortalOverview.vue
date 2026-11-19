<template>
  <section class="client-portal-overview" aria-label="Client portal overview">
    <header><div><h2>Portal · {{client.full_name||client.initials}}</h2><p>Access, shared records, and activity for this client’s portal accounts.</p></div><button v-if="canViewAs" type="button" :disabled="loading" @click="load">Refresh overview</button></header>
    <nav v-if="showActions" class="portal-actions" aria-label="Client portal actions"><button v-if="canAssignDocuments" type="button" @click="openDocumentAssignments">Share documents</button><button type="button" @click="$emit('share-assessments')">Share assessments</button><button type="button" @click="$emit('manage-access')">Manage portal access</button></nav>
    <section v-if="assigningDocuments" class="inline-assignments" aria-label="Assign portal documents and forms"><button type="button" @click="closeAssignments">Done assigning documents</button><ClientUpdateModal v-if="canViewAs && updateOpen" inline :open="true" :client-id="client.id" :client-name="client.full_name" :agency-id="client.agency_id||agency.id" @sent="updateOpen=false" @close="updateOpen=false" /><button v-else-if="canViewAs" type="button" @click="updateOpen=true">Assign forms &amp; assessments</button><section v-if="actor.role==='support'"><h3>Release of information</h3><template v-if="!releaseId">
       <button :disabled="releaseBusy" @click="newRelease">Prepare a release for signature</button>
       <ul v-if="releases.length"><li v-for="release in releases" :key="release.id">
         <button @click="releaseId=release.id">{{ release.documentName || release.title }} · {{ date(release.updatedAt) }}</button>
         {{ release.revoked?'Revoked':release.pendingSignatures?'Signature pending':release.signedCount?'Signed':'Draft' }}
       </li></ul>
      </template><button v-else @click="backToReleases">All releases</button><p role="alert" v-if="releaseError">{{ releaseError }}</p><SafetyPlansPanel v-if="releaseId" ref="assignmentWorkspace" record-only portal-signers-only :initial-record-id="releaseId" :agency-id="Number(client.agency_id)" :client-id="Number(client.id)" /></section><EnrollmentPortalDocuments v-if="actor.role!=='support'" ref="assignmentWorkspace" :client-id="Number(client.id)" :agency-id="Number(agency.id)" /></section>
    <ClientPersonalPortalInvite v-if="canViewAs && personalLoginAvailable" :client-id="Number(client.id)" :agency-id="Number(agency.id)" @updated="load" />
    <ClientPortalAccessEditor v-if="canViewAs" :client-id="client.id" :agency-id="agency.id" :show-self-preparation="!personalLoginAvailable" @saved="load" />
    <p v-if="error" role="alert">{{error}}</p><p v-if="loading" role="status">Loading portal overview…</p>
    <p v-if="canViewAs && !loading && !error && !accounts.length">No portal accounts are linked. Portal availability alone does not give anyone access.</p>
    <template v-if="canViewAs"><div class="portal-metrics"><article><strong>{{accounts.length}}</strong><span>Linked portal accounts</span></article><article><strong>{{available.length}}</strong><span>Relationships with access</span></article><article><strong>{{date(latestActivity)}}</strong><span>Last recorded activity in this practice</span></article></div>
      <p v-if="!loading&&!error&&!accounts.length">No client or parent portal accounts are linked. Use Manage portal access to review invitations and relationships.</p>
      <div class="portal-accounts"><article v-for="account in accounts" :key="account.id"><h3>{{account.name}}</h3><p>{{account.relationship}} · {{account.available?'Relationship access enabled':'Relationship access disabled'}}</p><p class="setup-status">{{ setupLabel(account.passwordSetupStatus) }}</p><p v-if="account.enrollmentStatus" class="enrollment-status">{{ enrollmentLabel(account.enrollmentStatus) }}</p><p v-if="account.invitationId">Invitation #{{ account.invitationId }} · {{ deliveryLabel(account.invitationDeliveryStatus) }}<template v-if="account.invitationSentAt"> · {{ date(account.invitationSentAt) }}</template></p><p v-if="['failed','bounced','undelivered','not_sent'].includes(account.invitationDeliveryStatus)">{{ invitationFailureLabel(account.invitationFailureKind) }}<template v-if="account.invitationAttemptId"> · Delivery attempt #{{account.invitationAttemptId}}</template></p><dl><dt>Last recorded sign-in in this practice</dt><dd>{{date(account.lastLogin)}}</dd><dt>Last sign-in network address</dt><dd>{{account.lastLoginIp||'None recorded'}}</dd><dt>Last activity</dt><dd>{{date(account.lastActivity)}}</dd></dl><div class="account-actions"><button type="button" :disabled="!account.available" @click="previewIds=[account.id]">View as {{account.name}}</button><button type="button" :disabled="!account.available" @click="loadActivity(account)">Activity</button></div></article></div>
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
import SafetyPlansPanel from '../safetyPlans/SafetyPlansPanel.vue';
import ClientUpdateModal from '../admin/ClientUpdateModal.vue';
import EnrollmentPortalDocuments from '../enrollment/EnrollmentPortalDocuments.vue';
import ClientPersonalPortalInvite from './ClientPersonalPortalInvite.vue';
import ClientPortalAccessEditor from './ClientPortalAccessEditor.vue';
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
const props=defineProps({personalLoginAvailable:{type:Boolean,default:false},showActions:{type:Boolean,default:true},client:{type:Object,required:true},agency:{type:Object,required:true},actor:{type:Object,required:true}});
defineEmits(['share-documents','share-assessments','manage-access']);
const releases=ref([]),releaseId=ref(null),releaseBusy=ref(false),releaseError=ref('');
async function loadReleases(){
 const run=generation;
 try{
  const {data}=await api.get('/clinical-forms',{params:{clientId:props.client.id,documentKey:'release-of-information'}});
  if(run===generation)releases.value=data.plans||[];
 }catch(e){if(run===generation)releaseError.value=e.response?.data?.error?.message||'Could not load saved releases.';}
}
function backToReleases(){if(prepareToLeave()){releaseId.value=null;loadReleases();}}
async function newRelease(){
 if(releaseBusy.value)return;
 const run=generation;releaseBusy.value=true;releaseError.value='';
 try{const {data}=await api.post('/clinical-forms',{documentKey:'release-of-information',clientId:props.client.id,agencyId:props.client.agency_id,data:{personLabel:props.client.full_name||props.client.initials,planDate:new Date().toLocaleDateString('en-CA')}});if(run===generation)releaseId.value=data.id;}
 catch(e){if(run===generation)releaseError.value=e.response?.data?.error?.message||'Could not create the release.';}
 finally{if(run===generation)releaseBusy.value=false;}
}
const updateOpen=ref(true);
const assigningDocuments=ref(false),assignmentWorkspace=ref(null);
const canAssignDocuments=computed(()=>['admin','support','super_admin','provider','provider_plus','intern','intern_plus','supervisor','facilitator','qbha'].includes(props.actor.role));
function openDocumentAssignments(){if(canAssignDocuments.value){assigningDocuments.value=true;updateOpen.value=true;if(props.actor.role==='support')loadReleases();}}
function prepareToLeave(){return assignmentWorkspace.value?.prepareToLeave?.()!==false;}
defineExpose({openDocumentAssignments,prepareToLeave});
function closeAssignments(){if(prepareToLeave()){assigningDocuments.value=false;releaseId.value=null;}}
const canViewAs=computed(()=>['admin','support','super_admin'].includes(props.actor.role));
const invitationFailureLabel = kind => ({send_failed:'The invitation could not be sent. Support can review the failed delivery.',bounced:'The recipient’s server rejected the invitation.',undelivered:'The invitation was not delivered.'}[kind] || 'The recorded delivery failed; no detailed reason is available.');
const setupLabel = status => ({ password_set:'Password setup complete', temporary_password:'Temporary password issued — permanent password setup still required', temporary_password_expired:'Temporary password expired — password setup required', setup_link_pending:'Password setup pending — current link available', setup_link_expired:'Password setup link expired — request a fresh link', setup_required:'Password setup required', unknown:'Password setup not verified' }[status] || 'Password setup not verified');
const enrollmentLabel = status => ({pending:'Own enrollment and signatures pending',expired:'Enrollment invitation expired',accepted:'Own enrollment completed',cancelled:'Enrollment invitation cancelled'}[status] || `Enrollment: ${status}`);
const deliveryLabel = status => ({sent:'Invitation sent',delivered:'Invitation delivered',pending:'Delivery pending',sending:'Delivery in progress',failed:'Invitation delivery failed',bounced:'Invitation bounced',not_requested:'Invitation not sent',unknown:'Delivery not recorded — review communication history'}[status] || `Delivery: ${status}`);
const accounts=ref([]),previewIds=ref([]),activity=ref(null),loading=ref(false),error=ref('');let generation=0,activityGeneration=0;
const available=computed(()=>accounts.value.filter(a=>a.available)),viewedAccounts=computed(()=>available.value.filter(a=>previewIds.value.includes(a.id)));
const latestActivity=computed(()=>accounts.value.map(a=>a.lastActivity).filter(Boolean).sort().at(-1));
const date=value=>value?new Date(value).toLocaleString('en-US',{timeZone:props.actor.timezone||'America/Denver'}):'None recorded';
const endpoint=()=>`/portal-admin/clients/${props.client.id}/accounts`;
async function load(){const run=++generation;releases.value=[];releaseId.value=null;releaseError.value='';releaseBusy.value=false;assigningDocuments.value=false;++activityGeneration;accounts.value=[];previewIds.value=[];activity.value=null;error.value='';loading.value=false;if(!canViewAs.value)return;loading.value=true;try{const{data}=await api.get(endpoint(),{params:{agencyId:props.agency.id}});if(run===generation)accounts.value=data.accounts;}catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'Portal overview could not be loaded.';}finally{if(run===generation)loading.value=false;}}
async function loadActivity(account){const run=++activityGeneration;activity.value=null;error.value='';try{const{data}=await api.get(`${endpoint()}/${account.id}/activity`,{params:{agencyId:props.agency.id}});if(run===activityGeneration)activity.value=data;}catch(e){if(run===activityGeneration)error.value=e.response?.data?.error?.message||'Activity could not be loaded.';}}
watch(()=>[props.client.id,props.agency.id,props.actor.role],load,{immediate:true});onBeforeUnmount(()=>{++generation;++activityGeneration;});
</script>
<style scoped>
.client-portal-overview{padding:20px;background:white;border:1px solid #d6e2ef;border-radius:14px;color:#173c62;min-width:0}.client-portal-overview header,.portal-actions,.account-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.client-portal-overview header{justify-content:space-between}.client-portal-overview header h2{margin:0}.client-portal-overview header p{color:#526d89}.portal-actions{margin:16px 0 24px}.client-portal-overview button{font:inherit;padding:10px 14px;border-radius:8px;border:1px solid #b5cbe0;background:#eef5fd;color:#174e7f;cursor:pointer}.client-portal-overview button:disabled{opacity:.5;cursor:default}.portal-metrics,.portal-accounts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:22px}.portal-metrics article,.portal-accounts article{padding:18px;border:1px solid #d6e2ef;border-radius:10px;min-width:0}.portal-metrics strong,.portal-metrics span{display:block}.portal-metrics strong{font-size:22px;margin-bottom:7px}.portal-metrics span,dt{font-size:13px;color:#526d89}.portal-accounts h3{margin:0 0 8px}dd{margin:5px 0 14px}.portal-activity{margin-top:22px}.portal-activity li{padding:7px 0}
</style>
