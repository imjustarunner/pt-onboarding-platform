<template>
  <section class="service-enrollments" aria-label="Services and providers">
    <header class="services-header">
      <div><h4>Services &amp; providers</h4><p>Assign providers to each service. A school or program enrollment is optional.</p></div>
      <span class="service-count">{{ activeServices.length }} active {{ activeServices.length === 1 ? 'service' : 'services' }}</span>
    </header>
    <p v-if="error" class="service-error" role="alert">{{ error }} <button v-if="!busy && editingServiceId===null && !statusEdit" type="button" @click="load">Retry</button></p>
    <p v-if="loading" role="status">Loading services…</p>
    <p v-else-if="!activeServices.length" class="services-empty">No active services for this agency. Add a service below to get started.</p>
    <ul class="services-list">
      <li v-for="service in activeServices" :key="service.id">
        <div class="service-summary">
          <div><strong>{{ service.label }}</strong><span v-if="servicePrograms(service)" class="service-context">{{ servicePrograms(service) }}</span><span class="service-context">{{ service.status_label || 'Active services' }}</span></div>
          <div class="service-provider" :class="{ 'needs-provider': !Number(service.provider_user_id) }">
            <span class="service-status">{{ Number(service.provider_user_id) ? (service.providers?.length > 1 ? 'Assigned providers' : 'Assigned provider') : 'Needs a provider' }}</span>
            <ul v-if="service.providers?.length > 1" class="service-providers-list">
              <li v-for="provider in service.providers" :key="provider.provider_user_id"><strong>{{ provider.provider_name || `Provider ${provider.provider_user_id}` }}</strong><button v-if="canAddService" type="button" :disabled="busy || providersLoading" @click="edit(service, provider)">Change</button><button type="button" :disabled="busy" @click="editStatus({ ...service, ...provider, id: provider.service_id })">Change status</button></li>
            </ul>
            <strong v-else>{{ service.provider_name || 'Not assigned yet' }}</strong>
          </div>
          <div class="service-actions">
            <button v-if="canAddService && !(service.providers?.length > 1)" type="button" :disabled="busy || providersLoading" @click="edit(service)">{{ Number(service.provider_user_id) ? 'Change provider' : 'Assign provider' }}</button>
            <button v-if="canAddService && service.service_kind === 'counseling' && Number(service.provider_user_id)" type="button" :disabled="busy || providersLoading" @click="addProvider(service)">Add provider</button>
            <button v-if="!(service.providers?.length > 1)" type="button" :disabled="busy" @click="editStatus(service)">Change status</button>
          </div>
        </div>
        <form v-if="Number(editingServiceId) === Number(service.id)" class="service-assignment" @submit.prevent="assign(service)">
          <div><label :for="`service-provider-${service.id}`">{{ addingProvider ? 'Additional provider' : 'Provider' }} for {{ service.label }}</label>
            <ProviderSearchSelect v-model="selectedProviderId" :input-id="`service-provider-${service.id}`" :options="providers" :loading="providersLoading" :disabled="busy" label="Provider for this service" />
          </div>
          <button type="submit" class="service-save" :disabled="busy || !selectedProviderId || !providers.some(provider => Number(provider.id) === Number(selectedProviderId))">{{ busy ? 'Saving…' : 'Save assignment' }}</button>
          <button type="button" :disabled="busy" @click="editingServiceId = null">Cancel</button>
        </form>
      </li>
    </ul>
    <details v-if="formerServices.length" class="former-services"><summary>Former services ({{ formerServices.length }})</summary><ul><li v-for="service in formerServices" :key="service.id"><strong>{{ service.label }}</strong> · {{ service.provider_name || 'No provider' }} · {{ servicePrograms(service) }}<span>{{ service.status_label || 'Discontinued services' }}</span><div class="service-actions"><button type="button" :disabled="busy" @click="editStatus(service)">Change status</button><ClientReenrollment :client-id="clientId" :agency-id="agencyId" :service-id="service.id" /><button type="button" :disabled="busy" @click="loadReturns(service)">Review return requests</button></div></li></ul></details>
    <form v-if="statusEdit" class="status-editor" @submit.prevent="saveStatus"><h5>Service status · {{ statusEdit.label }}</h5><p>This changes this service with {{ statusEdit.provider_name || 'this agency' }}. Cancel or transfer future appointments before ending services. Reactivation does not restore canceled sessions.</p><label>Status<select v-model="statusDraft.status"><option value="active">Active services</option><option value="discontinued">Discontinued services</option><option value="completed">Completed services</option><option value="terminated">Terminated services</option><option value="canceled">Canceled services</option></select></label><label v-if="statusDraft.status!=='active'">Closure category<select v-model="statusDraft.closureReason"><option value="client_choice">Client chose to discontinue</option><option value="care_completed">Services completed</option><option value="discontinued_contact">Discontinued contact / unable to re-engage</option><option value="provider_transition">Services with this provider ended</option><option value="other">Other service closure</option></select></label><p v-if="statusDraft.status!=='active'">Client sees: <strong>{{ statusDraft.status==='terminated' && statusDraft.closureReason==='discontinued_contact'?'Discontinued services':statusDraft.status.charAt(0).toUpperCase()+statusDraft.status.slice(1)+' services' }}</strong>. {{ closureCopy[statusDraft.closureReason] }}</p><label>Reason (staff record)<textarea v-model="statusDraft.reason" maxlength="500" required /></label><label><input v-model="statusDraft.confirmed" type="checkbox" /> I confirm this service status change.</label><button type="submit" :disabled="busy||!statusDraft.confirmed||!statusDraft.reason.trim()">Update service status</button><button type="button" :disabled="busy" @click="statusEdit=null">Cancel</button></form><section v-if="returnService" class="return-reviews"><h5>Requests to be considered again · {{ returnService.label }}</h5><p>Reviewing a request does not reactivate services. Use Change status separately if care is resumed.</p><p v-if="!returnRequests.length">No requests have been received.</p><article v-for="request in returnRequests" :key="request.id"><strong>{{ request.requesterName }} · {{ request.status }}</strong><p>{{ request.note }}</p><template v-if="request.status==='pending'"><label>Message to client (optional)<textarea v-model="returnMessages[request.id]" maxlength="500" /></label><button type="button" :disabled="busy" @click="reviewReturn(request,'reviewed')">Mark reviewed</button><button type="button" :disabled="busy" @click="reviewReturn(request,'declined')">Decline request</button></template><p v-else-if="request.response">{{ request.response }}</p></article></section>
    <details v-if="canAddService && newServiceKinds.length" class="add-service" :open="startAssigning && !activeServices.length">
      <summary>Add another service</summary>
      <p>Add another service offered by this agency. Use Add provider above for another counselor.</p>
      <form class="add-service-form" @submit.prevent="save">
        <label>Service<select v-model="draft.serviceKind"><option v-for="kind in availableServiceKinds" :key="kind" :value="kind" :disabled="kind === 'counseling' && hasCounseling">{{ serviceLabels[kind] }}{{ kind === 'counseling' && hasCounseling ? ' (already added)' : '' }}</option></select></label>
        <label v-if="draft.serviceKind !== 'counseling'">Display name<input v-model="draft.label" maxlength="150" placeholder="e.g. Reading tutoring" /></label>
        <div class="service-provider-field"><label for="new-service-provider">Assigned provider</label><ProviderSearchSelect v-model="draft.providerUserId" input-id="new-service-provider" :options="providers" :loading="providersLoading" :disabled="busy" label="Provider for new service" placeholder="Search providers (optional)…" /></div>
        <label v-if="organizations.length">School / program (optional)<select v-model="draft.organizationId"><option :value="0">No school or program</option><option v-for="org in organizations" :key="org.organization_id" :value="org.organization_id">{{ org.organization_name || org.name }}</option></select></label>
        <button class="service-save" :disabled="busy || loading" type="submit">{{ busy ? 'Saving…' : 'Add service' }}</button>
        <button v-if="hasServiceDraft" type="button" :disabled="busy" @click="cancelServiceDraft">Cancel new service</button>
      </form>
    </details>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import ProviderSearchSelect from '../clients/ProviderSearchSelect.vue';
import { useAuthStore } from '../../store/auth';
import ClientReenrollment from './ClientReenrollment.vue';
import { meaningfulProgram } from '../../utils/clientRosterContext.js';
const props = defineProps({ clientId: [Number, String], agencyId: [Number, String], organizations: { type: Array, default: () => [] }, startAssigning: { type: Boolean, default: false } });
const emit = defineEmits(['updated','loaded','busy']);
const auth=useAuthStore();
const canAddService=computed(()=>['super_admin','admin','support','staff'].includes(auth.user?.role));
const returnService=ref(null),returnRequests=ref([]),returnMessages=ref({});
const statusEdit=ref(null),statusDraft=ref({status:'active',reason:'',closureReason:'other',confirmed:false});
const closureCopy={client_choice:'Services were discontinued at your request.',care_completed:'This course of services has been completed.',discontinued_contact:'Services were discontinued because we were unable to re-establish contact.',provider_transition:'Services with this provider have ended.',other:'Services with this provider have ended. Contact the team if you have questions.'};
const services = ref([]), providers = ref([]), error = ref(''), busy = ref(false), loading = ref(false), providersLoading = ref(false);
const editingServiceId = ref(null), selectedProviderId = ref(''), editingSourceId = ref(null), editingOrganizationId = ref(0);
const addingProvider = ref(false);
const availableServiceKinds = ref([]);
const serviceLabels = { counseling: 'Counseling', tutoring: 'Tutoring', coaching: 'Coaching', consultation: 'Consultation' };
const newDraft = (serviceKind = 'counseling') => ({ serviceKind, label: '', providerUserId: 0, organizationId: 0 });
const draft = ref(newDraft());
const isActive = service => service.is_active === true || Number(service.is_active) === 1;
const activeServices = computed(() => services.value.filter(isActive));
const formerServices = computed(() => services.value.filter(service => !isActive(service)));
const hasCounseling = computed(() => activeServices.value.some(service => service.service_kind === 'counseling'));
const newServiceKinds = computed(() => availableServiceKinds.value.filter(kind => kind !== 'counseling' || !hasCounseling.value));
const hasServiceDraft = computed(() => !!Number(draft.value.providerUserId) || !!draft.value.label.trim() || !!Number(draft.value.organizationId) || draft.value.serviceKind !== (newServiceKinds.value[0] || 'counseling'));
function cancelServiceDraft() { draft.value = newDraft(newServiceKinds.value[0] || 'counseling'); error.value = ''; }
const servicePrograms = service => {
  const organizations = service.organizations?.length ? service.organizations
    : [{name:service.organization_name,organization_type:service.organization_type}];
  return organizations.filter(program => meaningfulProgram(program.name,program.organization_type)).map(program => program.name).join(' · ');
};
let sequence = 0;
async function load() {
  const run = ++sequence;
  services.value = []; providers.value = []; error.value = ''; busy.value = false; editingServiceId.value = null; editingSourceId.value = null; selectedProviderId.value = ''; draft.value = newDraft();
  availableServiceKinds.value = []; addingProvider.value = false;
  statusEdit.value=null;returnService.value=null;returnRequests.value=[];returnMessages.value={};
  loading.value = false; providersLoading.value = false;
  if (!props.clientId || !props.agencyId) return;
  loading.value = true; providersLoading.value = true;
  const [serviceResult, providerResult] = await Promise.allSettled([
    api.get(`/clients/${props.clientId}/service-enrollments`, { params: { agencyId: props.agencyId } }),
    canAddService.value ? api.get('/office-clients/providers', { params: { clientId: props.clientId, agencyIds: String(props.agencyId) }, skipGlobalLoading: true }) : Promise.resolve({data:{providers:[]}})
  ]);
  if (run !== sequence) return;
  loading.value = false; providersLoading.value = false;
  if (serviceResult.status === 'fulfilled') {
    services.value = serviceResult.value.data.services || [];
    availableServiceKinds.value = (serviceResult.value.data.availableServiceKinds || ['counseling']).filter(kind => serviceLabels[kind]);
    draft.value = newDraft(newServiceKinds.value[0] || 'counseling');
    if (props.startAssigning && canAddService.value && activeServices.value.length) edit(activeServices.value.find(service => !Number(service.provider_user_id)) || activeServices.value[0]);
  }
  else error.value = serviceResult.reason.response?.data?.error?.message || 'Services could not be loaded.';
  if (providerResult.status === 'fulfilled') {
    providers.value = (providerResult.value.data.providers || []).filter(provider =>
      (provider.agencies || []).some(agency => Number(agency.id || agency.agencyId) === Number(props.agencyId))
      || (provider.agencyIds || []).some(id => Number(id) === Number(props.agencyId))
    );
  } else error.value = providerResult.reason.response?.data?.error?.message || 'Providers could not be loaded. Reopen Assignments to retry.';
  emit('loaded',{services:services.value,error:error.value});
}
function edit(service, provider = null) {
  addingProvider.value = false;
  provider ||= service.providers?.find(row => Number(row.provider_user_id) === Number(service.provider_user_id)) || null;
  editingServiceId.value = service.id;
  editingSourceId.value = provider?.service_id || service.id;
  editingOrganizationId.value = provider ? provider.organization_id || 0 : service.organization_id || 0;
  selectedProviderId.value = provider?.provider_user_id || service.provider_user_id || '';
  error.value = '';
}
function addProvider(service) {
  edit(service);
  addingProvider.value = true;
  selectedProviderId.value = '';
}
async function persist(input) {
  if (busy.value || !canAddService.value) return;
  const run = sequence;
  busy.value = true; error.value = '';
  try {
    const { data } = await api.post(`/clients/${props.clientId}/service-enrollments`, { ...input, agencyId: Number(props.agencyId) });
    if (run !== sequence) return;
    services.value = data.services || []; editingServiceId.value = null; editingSourceId.value = null; draft.value = newDraft(newServiceKinds.value[0] || 'counseling');
    emit('updated', { services: services.value });
  } catch (e) { if (run === sequence) error.value = e.response?.data?.error?.message || 'Service could not be saved.'; }
  finally { if (run === sequence) busy.value = false; }
}
function assign(service) {
  if (!providers.value.some(provider => Number(provider.id) === Number(selectedProviderId.value))) return;
  return persist({ serviceId: editingSourceId.value || service.id, serviceKind: service.service_kind, label: service.label, organizationId: editingOrganizationId.value, providerUserId: Number(selectedProviderId.value), ...(addingProvider.value ? { addProvider: true } : {}) });
}
function save() {
  if (draft.value.serviceKind === 'counseling' && hasCounseling.value) {
    edit(activeServices.value.find(service => service.service_kind === 'counseling'));
    return;
  }
  if (!availableServiceKinds.value.includes(draft.value.serviceKind)) return;
  const labels = serviceLabels;
  return persist({ ...draft.value, label: draft.value.serviceKind === 'counseling' ? 'Counseling' : draft.value.label.trim() || labels[draft.value.serviceKind] });
}
function editStatus(service){statusEdit.value=service;statusDraft.value={status:service.service_status||(Number(service.is_active)===1?'active':'discontinued'),reason:'',closureReason:service.closure_reason||({completed:'care_completed',discontinued:'client_choice'}[service.service_status]||'other'),confirmed:false};error.value='';}
async function saveStatus(){
 const own=sequence,service=statusEdit.value;if(!service||!statusDraft.value.confirmed)return;busy.value=true;error.value='';
 try{const {data}=await api.patch(`/clients/${props.clientId}/service-enrollments/${service.id}/status`,{...statusDraft.value,agencyId:Number(props.agencyId),expectedStatus:service.service_status||(Number(service.is_active)===1?'active':'discontinued')});if(own===sequence){services.value=data.services;statusEdit.value=null;emit('updated',{services:services.value});}}
 catch(e){if(own===sequence)error.value=e.response?.data?.error?.message||'Service status could not be updated.';}finally{if(own===sequence)busy.value=false;}
}

async function loadReturns(service){const own=sequence;busy.value=true;error.value='';returnService.value=service;returnRequests.value=[];try{const{data}=await api.get(`/clients/${props.clientId}/service-enrollments/${service.id}/return-requests`,{params:{agencyId:props.agencyId}});if(own===sequence)returnRequests.value=data.requests||[];}catch(e){if(own===sequence)error.value=e.response?.data?.error?.message||'Return requests could not load.';}finally{if(own===sequence)busy.value=false;}}
async function reviewReturn(request,decision){const own=sequence;busy.value=true;error.value='';try{const{data}=await api.post(`/clients/${props.clientId}/service-enrollments/${returnService.value.id}/return-requests/${request.id}/review`,{agencyId:Number(props.agencyId),decision,message:returnMessages.value[request.id]||''});if(own===sequence)returnRequests.value=data.requests||[];}catch(e){if(own===sequence)error.value=e.response?.data?.error?.message||'Request could not be reviewed.';}finally{if(own===sequence)busy.value=false;}}

watch(()=>busy.value||loading.value||providersLoading.value||editingServiceId.value!==null||!!statusEdit.value||hasServiceDraft.value,value=>emit('busy',value),{flush:'sync'});
function prepareLeave(){if(busy.value||loading.value||providersLoading.value)return false;if(editingServiceId.value!==null||statusEdit.value||hasServiceDraft.value){error.value='Save or cancel the assignment change before moving to another client.';return false;}return true;}
defineExpose({prepareLeave});
watch(() => [props.clientId, props.agencyId], load, { immediate: true });
onBeforeUnmount(() => { ++sequence;emit('busy',false); });
</script>

<style scoped>
.service-enrollments { padding:20px; background:var(--bg,#fff); border:1px solid var(--border,#dbe5ed); border-radius:14px; margin:16px 0; font-size:14px; color:var(--text-primary,#203b59); min-width:0; }
.services-header { display:flex; flex-wrap:wrap; justify-content:space-between; gap:12px; }
h4 { margin:0 0 8px; font-size:16px; }
p { margin:6px 0 14px; color:var(--text-secondary,#52657a); line-height:1.5; }
.service-count { align-self:start; padding:5px 10px; border-radius:20px; background:var(--bg-alt,#f1f5f9); font-size:13px; white-space:nowrap; }
.services-list,.former-services ul { list-style:none; padding:0; margin:0; }
.services-list > li { padding:16px 0; border-bottom:1px solid var(--border,#e3eaf1); }
.service-summary { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto; gap:16px; align-items:center; }
.service-context,.service-status { display:block; margin-top:5px; color:var(--text-secondary,#52657a); font-size:13px; }
.service-status { margin:0 0 5px; }
.service-provider { border-left:3px solid #89b9aa; padding-left:12px; min-width:0; }
.needs-provider { border-color:#d5b46a; }
.service-provider strong { overflow-wrap:anywhere; }
.service-providers-list { list-style:none; padding:0; margin:0; }
.service-providers-list li { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:6px; }
.service-actions,.service-assignment { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.service-assignment { padding:14px; margin-top:14px; border-radius:10px; background:var(--bg-alt,#f8fafc); align-items:end; }
.service-assignment > div { flex:1 1 240px; min-width:0; }
.service-enrollments button,.service-enrollments input,.service-enrollments select { box-sizing:border-box; min-height:40px; max-width:100%; padding:9px 12px; border:1px solid var(--border,#c8d6e0); border-radius:9px; background:var(--bg,#fff); color:var(--text-primary,#23466b); font:inherit; }
.service-enrollments button { cursor:pointer; font-weight:600; }
.service-enrollments button:disabled { opacity:.5; cursor:default; }
.service-enrollments button:hover:not(:disabled) { background:var(--bg-alt,#f1f5f9); }
.service-enrollments .service-save { background:var(--primary,#2464a0); border-color:var(--primary,#2464a0); color:white; }
.service-enrollments .service-save:hover:not(:disabled) { filter:brightness(1.08); background:var(--primary,#2464a0); }
.service-enrollments .service-end { color:var(--text-secondary,#52657a); background:transparent; border-color:transparent; }
.service-error { color:var(--danger,#b91c1c); }
.add-service,.former-services { margin-top:16px; }
summary { cursor:pointer; font-weight:600; padding:6px 0; }
.add-service-form { display:flex; flex-wrap:wrap; gap:12px; align-items:end; margin-top:12px; }
.add-service-form > label,.service-provider-field { flex:1 1 180px; min-width:0; }
label { display:flex; flex-direction:column; gap:6px; font-size:13px; font-weight:600; margin-bottom:6px; }
.former-services li { padding:10px 0; color:var(--text-secondary,#52657a); }
.status-editor,.return-reviews { margin-top:16px; padding:16px; border:1px solid var(--border,#dbe5ed); border-radius:10px; background:var(--bg-alt,#f8fafc); }
.status-editor { display:flex; flex-wrap:wrap; gap:12px; align-items:end; }
.status-editor h5,.status-editor p { flex-basis:100%; margin:0; font-size:14px; }
.status-editor label { flex:1 1 200px; }
.status-editor label:has(input[type="checkbox"]) { flex-direction:row; align-items:center; flex-basis:100%; }
.former-services li span { display:inline-block; margin-left:10px; font-size:13px; }
@media(max-width:760px) { .service-summary { grid-template-columns:1fr; gap:12px; } .service-actions { justify-content:start; } .service-enrollments { padding:16px; } }
</style>
