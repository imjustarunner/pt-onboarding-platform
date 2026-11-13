<template><section class="service-enrollments"><h4>Services &amp; providers</h4><p>Each service keeps its own agency, provider, and schedule. Adding a service keeps existing enrollments in place.</p><p v-if="error" role="alert">{{error}}</p><ul><li v-for="service in services" :key="service.id"><div><strong>{{service.label}}</strong><span>{{service.provider_name||'Provider not assigned'}}<template v-if="service.organization_name"> · {{service.organization_name}}</template></span><small>{{ service.status_label || (Number(service.is_active)===1?'Active services':'Discontinued services') }}</small></div><button type="button" :disabled="busy" @click="editStatus(service)">Change status</button><button v-if="Number(service.is_active)!==1" type="button" :disabled="busy" @click="loadReturns(service)">Review return requests</button></li></ul><form v-if="statusEdit" class="status-editor" @submit.prevent="saveStatus"><h5>Service status · {{ statusEdit.label }}</h5><p>This changes this service with {{ statusEdit.provider_name || 'this agency' }}. Cancel or transfer future appointments before ending services. Reactivation does not restore canceled sessions.</p><label>Status<select v-model="statusDraft.status"><option value="active">Active services</option><option value="discontinued">Discontinued services</option><option value="completed">Completed services</option><option value="terminated">Terminated services</option><option value="canceled">Canceled services</option></select></label><label v-if="statusDraft.status!=='active'">Closure category<select v-model="statusDraft.closureReason"><option value="client_choice">Client chose to discontinue</option><option value="care_completed">Services completed</option><option value="discontinued_contact">Discontinued contact / unable to re-engage</option><option value="provider_transition">Services with this provider ended</option><option value="other">Other service closure</option></select></label><p v-if="statusDraft.status!=='active'">Client sees: <strong>{{ statusDraft.status==='terminated' && statusDraft.closureReason==='discontinued_contact'?'Discontinued services':statusDraft.status.charAt(0).toUpperCase()+statusDraft.status.slice(1)+' services' }}</strong>. {{ closureCopy[statusDraft.closureReason] }}</p><label>Reason (staff record)<textarea v-model="statusDraft.reason" maxlength="500" required /></label><label><input v-model="statusDraft.confirmed" type="checkbox" /> I confirm this service status change.</label><button type="submit" :disabled="busy||!statusDraft.confirmed||!statusDraft.reason.trim()">Update service status</button><button type="button" :disabled="busy" @click="statusEdit=null">Cancel</button></form><section v-if="returnService" class="return-reviews"><h5>Requests to be considered again · {{ returnService.label }}</h5><p>Reviewing a request does not reactivate services. Use Change status separately if care is resumed.</p><p v-if="!returnRequests.length">No requests have been received.</p><article v-for="request in returnRequests" :key="request.id"><strong>{{ request.requesterName }} · {{ request.status }}</strong><p>{{ request.note }}</p><template v-if="request.status==='pending'"><label>Message to client (optional)<textarea v-model="returnMessages[request.id]" maxlength="500" /></label><button type="button" :disabled="busy" @click="reviewReturn(request,'reviewed')">Mark reviewed</button><button type="button" :disabled="busy" @click="reviewReturn(request,'declined')">Decline request</button></template><p v-else-if="request.response">{{ request.response }}</p></article></section><form v-if="canAddService" @submit.prevent="save"><label>Service<select v-model="draft.serviceKind"><option value="counseling">Counseling</option><option value="tutoring">Tutoring</option><option value="coaching">Coaching</option><option value="consultation">Consultation</option></select></label><label>Display name<input v-model="draft.label" maxlength="150" placeholder="e.g. Reading tutoring" /></label><label>Assigned provider<select v-model="draft.providerUserId"><option :value="0">Not assigned yet</option><option v-for="provider in providers" :key="provider.id" :value="provider.id">{{provider.first_name}} {{provider.last_name}}</option></select></label><label>School / program<select v-model="draft.organizationId"><option :value="0">Agency service</option><option v-for="org in organizations" :key="org.organization_id" :value="org.organization_id">{{org.organization_name||org.name}}</option></select></label><button :disabled="busy" type="submit">{{busy?'Saving…':'Add service enrollment'}}</button></form></section></template>
<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({ clientId: [Number, String], agencyId: [Number, String], organizations: { type: Array, default: () => [] } });
const auth = useAuthStore();
const providerActor=computed(()=>['provider','provider_plus','clinician','supervisor'].includes(auth.user?.role));
const canAddService=computed(()=>['super_admin','admin','support'].includes(auth.user?.role));
const returnService=ref(null),returnRequests=ref([]),returnMessages=ref({});
const closureCopy={client_choice:'Services were discontinued at your request.',care_completed:'This course of services has been completed.',discontinued_contact:'Services were discontinued because we were unable to re-establish contact.',provider_transition:'Services with this provider have ended.',other:'Services with this provider have ended. Contact the team if you have questions.'};
const services = ref([]), providers = ref([]), error = ref(''), busy = ref(false);
const statusEdit=ref(null),statusDraft=ref({status:'active',reason:'',closureReason:'other',confirmed:false});
const draft = ref({ serviceKind: 'counseling', label: '', providerUserId: 0, organizationId: 0 });
let seq = 0;
onBeforeUnmount(() => { seq++; });

async function load() {
  const own = ++seq;
  services.value = []; providers.value = []; error.value = ''; busy.value = false;statusEdit.value=null;returnService.value=null;returnRequests.value=[];returnMessages.value={};
  draft.value = { serviceKind: 'counseling', label: '', providerUserId: 0, organizationId: 0 };
  if (!props.clientId || !props.agencyId) return;
  try {
    const limited = ['support', 'provider_plus'].includes(String(auth.user?.role || '').toLowerCase());
    const [s, p] = await Promise.all([
      api.get(`/clients/${props.clientId}/service-enrollments`, { params: { agencyId: props.agencyId } }),
      providerActor.value?Promise.resolve({data:[]}):api.get(limited ? '/users/me/providers-for-support' : '/users', { params: { agencyId: props.agencyId } })
    ]);
    if (own !== seq) return;
    services.value = s.data.services || [];
    const rows = Array.isArray(p.data) ? p.data : p.data.users || [];
    providers.value = limited
      ? rows.map(provider => ({ id: provider.supervisee_id, first_name: provider.supervisee_first_name, last_name: provider.supervisee_last_name }))
      : rows.filter(provider => ['provider', 'provider_plus', 'clinician', 'supervisor', 'intern', 'intern_plus', 'clinical_practice_assistant', 'admin', 'super_admin'].includes(provider.role));
  } catch (e) {
    if (own === seq) error.value = e.response?.data?.error?.message || 'Services could not be loaded.';
  }
}
async function save() {
  const own = seq;
  busy.value = true; error.value = '';
  try {
    const { data } = await api.post(`/clients/${props.clientId}/service-enrollments`, {
      ...draft.value, agencyId: Number(props.agencyId),
      label: draft.value.label || ({ counseling: 'Counseling', tutoring: 'Tutoring', coaching: 'Coaching', consultation: 'Consultation' }[draft.value.serviceKind])
    });
    if (own === seq) services.value = data.services;
  } catch (e) { if (own === seq) error.value = e.response?.data?.error?.message || 'Service could not be saved.'; }
  finally { if (own === seq) busy.value = false; }
}
function editStatus(service){statusEdit.value=service;statusDraft.value={status:service.service_status||(Number(service.is_active)===1?'active':'discontinued'),reason:'',closureReason:service.closure_reason||({completed:'care_completed',discontinued:'client_choice'}[service.service_status]||'other'),confirmed:false};error.value='';}
async function saveStatus(){
 const own=seq,service=statusEdit.value;if(!service||!statusDraft.value.confirmed)return;busy.value=true;error.value='';
 try{const {data}=await api.patch(`/clients/${props.clientId}/service-enrollments/${service.id}/status`,{...statusDraft.value,agencyId:Number(props.agencyId),expectedStatus:service.service_status||(Number(service.is_active)===1?'active':'discontinued')});if(own===seq){services.value=data.services;statusEdit.value=null;}}
 catch(e){if(own===seq)error.value=e.response?.data?.error?.message||'Service status could not be updated.';}finally{if(own===seq)busy.value=false;}
}

async function loadReturns(service){const own=seq;busy.value=true;error.value='';returnService.value=service;returnRequests.value=[];try{const{data}=await api.get(`/clients/${props.clientId}/service-enrollments/${service.id}/return-requests`,{params:{agencyId:props.agencyId}});if(own===seq)returnRequests.value=data.requests||[];}catch(e){if(own===seq)error.value=e.response?.data?.error?.message||'Return requests could not load.';}finally{if(own===seq)busy.value=false;}}
async function reviewReturn(request,decision){const own=seq;busy.value=true;error.value='';try{const{data}=await api.post(`/clients/${props.clientId}/service-enrollments/${returnService.value.id}/return-requests/${request.id}/review`,{agencyId:Number(props.agencyId),decision,message:returnMessages.value[request.id]||''});if(own===seq)returnRequests.value=data.requests||[];}catch(e){if(own===seq)error.value=e.response?.data?.error?.message||'Request could not be reviewed.';}finally{if(own===seq)busy.value=false;}}

watch(() => [props.clientId, props.agencyId], load, { immediate: true });
</script>
<style scoped>.service-enrollments{padding:20px;background:white;border:1px solid #dbe5ed;border-radius:14px;margin:16px 0}.service-enrollments p{font-size:13px;color:#52657a}.service-enrollments ul{list-style:none;padding:0}.service-enrollments li{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #e3eaf1}.service-enrollments li span,.service-enrollments li small{display:block}.service-enrollments form{display:flex;flex-wrap:wrap;gap:14px;align-items:end}.service-enrollments label{display:flex;flex-direction:column;gap:6px;font-size:13px}.service-enrollments select,.service-enrollments input,.service-enrollments button{padding:9px;border:1px solid #c8d6e0;border-radius:8px;background:white;color:#23466b}</style>
