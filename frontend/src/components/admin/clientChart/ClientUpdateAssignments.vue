<template>
  <section ref="section" class="update-assignments" aria-label="Assignments">
    <header><h3>Assignments</h3><p>Review services, providers, agency memberships and scheduling defaults before finishing this client.</p></header>
    <p v-if="loading" role="status">Loading assignments…</p>
    <p v-if="error" role="alert">{{ error }} <button v-if="!loaded" type="button" @click="load">Retry</button></p>
    <fieldset class="assignment-services" :disabled="loading || saving || suggesting"><ClientServiceEnrollments ref="servicesPanel" :key="`${agencyId}:${clientId}`" :client-id="clientId" :agency-id="agencyId" :organizations="scopedAffiliations" @loaded="onServicesLoaded" @updated="onServicesUpdated" @busy="servicesBusy=$event" /></fieldset>
    <template v-if="loaded">
      <h4>Agency memberships · {{ agencyName }}</h4>
      <form class="assignment-defaults" @submit.prevent="saveDefaults">
        <h5>Default office &amp; place of service</h5>
        <p>These defaults prefill scheduled sessions and claims for this agency.</p>
        <div class="assignment-fields">
          <label>Default office<select v-model="draft.officeId" aria-label="Default office" :disabled="busy" @change="changeOffice"><option value="">Not set</option><option v-for="office in offices" :key="office.id" :value="String(office.id)">{{ office.name || office.label }}{{ office.street_address ? ` — ${office.street_address}` : '' }}</option></select></label>
          <label>Default place of service<select v-model="draft.pos" aria-label="Default place of service" :disabled="busy" @change="changePlaceOfService"><option value="">Not set</option><option value="11">11 — Office</option><option value="03">03 — School</option><option value="02">02 — Telehealth outside the home</option><option value="10">10 — Telehealth in the home</option><option value="12">12 — Patient’s residence</option><option value="49">49 — Independent clinic</option><option value="99">99 — Other place of service</option><option v-if="draft.pos && !['11','03','02','10','12','49','99'].includes(draft.pos)" :value="draft.pos">{{ draft.pos }}</option></select></label>
          <label>Default billing location<select v-model="draft.serviceLocationId" aria-label="Default billing location" :disabled="busy || !canReadBilling" @change="touched"><option value="">Not set</option><option v-if="draft.serviceLocationId && !locations.some(row=>String(row.id)===draft.serviceLocationId)" :value="draft.serviceLocationId">Saved billing location #{{ draft.serviceLocationId }}</option><option v-for="location in locations" :key="location.id" :value="String(location.id)">{{ location.name || location.label || `Location #${location.id}` }}<template v-if="location.place_of_service"> (POS {{ location.place_of_service }})</template></option></select></label>
        </div>
        <p v-if="hint" role="status">{{ hint }}</p>
        <div class="assignment-actions"><button v-if="!isSchool" type="button" :disabled="busy || !providerId" @click="suggestProvider(true)">Use provider office</button><button type="submit" :disabled="busy || !dirty">{{ saving ? 'Saving…' : 'Save defaults' }}</button><button v-if="dirty" type="button" :disabled="busy" @click="resetDefaults">Reset changes</button></div>
      </form>
      <section v-for="bucket in buckets" :key="bucket.type" class="assignment-affiliations" :aria-label="bucket.label">
        <h5>{{ bucket.label }} ({{ rowsFor(bucket.type).length }})</h5>
        <ul v-if="rowsFor(bucket.type).length"><li v-for="row in rowsFor(bucket.type)" :key="row.organization_id">{{ row.organization_name || row.name }} <span v-if="Number(row.is_primary)===1">· Primary</span></li></ul>
        <p v-else>No {{ bucket.label.toLowerCase() }} linked for this agency.</p>
        <form @submit.prevent="addAffiliation(bucket.type)"><label>Add {{ bucket.singular }}<select v-model="additions[bucket.type]" :disabled="busy"><option value="">Select…</option><option v-for="org in availableFor(bucket.type)" :key="org.id" :value="String(org.id)">{{ org.name }}</option></select></label><label class="assignment-check"><input v-model="makePrimary[bucket.type]" type="checkbox" :disabled="busy" /> Make primary</label><button type="submit" :disabled="busy || !additions[bucket.type]">Add {{ bucket.singular }}</button></form>
      </section>
    </template>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';
import { canAccessMedicalBilling } from '../../../config/medicalBillingAccess';
import { meaningfulProgram } from '../../../utils/clientRosterContext.js';
import { serviceLocationForOffice } from '../../../utils/officeBillingDefaults.js';
import { assignmentOfficesForAgency, primaryAssignmentProvider, providerOfficeDefaults } from '../../../utils/clientAssignmentDefaults.js';
import ClientServiceEnrollments from '../ClientServiceEnrollments.vue';
const props=defineProps({clientId:{type:[Number,String],required:true},agencyId:{type:[Number,String],required:true}});
const emit=defineEmits(['updated','busy','ready']);const auth=useAuthStore();
const client=ref(null),memberships=ref([]),affiliations=ref([]),catalog=ref([]),offices=ref([]),locations=ref([]),services=ref([]);
const loading=ref(false),loaded=ref(false),saving=ref(false),suggesting=ref(false),servicesBusy=ref(false),servicesError=ref(''),error=ref(''),hint=ref(''),section=ref(null),servicesPanel=ref(null);
const blank=()=>({officeId:'',pos:'',serviceLocationId:''});const draft=reactive(blank());const saved=ref(blank());const additions=reactive({school:'',program:'',learning:''}),makePrimary=reactive({school:false,program:false,learning:false});
const buckets=[{type:'school',label:'Schools',singular:'school'},{type:'program',label:'Programs',singular:'program'},{type:'learning',label:'Learning',singular:'learning organization'}];
const canReadBilling=computed(()=>canAccessMedicalBilling(auth.user,props.agencyId));
const isSchool=computed(()=>client.value?.client_type==='school');
const providerId=computed(()=>primaryAssignmentProvider(client.value,services.value));
const agencyName=computed(()=>memberships.value.find(row=>Number(row.agency_id)===Number(props.agencyId))?.agency_name || client.value?.agency_name || `Agency #${props.agencyId}`);
const scopedAffiliations=computed(()=>affiliations.value.filter(row=>catalog.value.some(org=>Number(org.id)===Number(row.organization_id))));
const dirty=computed(()=>Object.keys(draft).some(key=>draft[key]!==saved.value[key]));
const busy=computed(()=>loading.value||saving.value||suggesting.value||servicesBusy.value);
watch(busy,value=>emit('busy',value),{flush:'sync'});
watch(()=>loaded.value&&!busy.value&&!dirty.value&&!error.value&&!servicesError.value,value=>emit('ready',value),{immediate:true,flush:'sync'});
const rows=response=>Array.isArray(response?.data)?response.data:[];
const request=()=>({skipGlobalLoading:true,headers:{'X-Agency-Id':String(props.agencyId)}});
let generation=0,providerRequest=0,manualDefaults=false,autoSuggested=false,attemptedProviderId=0;
function rowsFor(type){return scopedAffiliations.value.filter(row=>row.organization_type===type&&(type!=='program'||meaningfulProgram(row.organization_name||row.name,type)));}
function availableFor(type){return catalog.value.filter(row=>row.organization_type===type&&!affiliations.value.some(current=>Number(current.organization_id)===Number(row.id))&&(type!=='program'||meaningfulProgram(row.name,type)));}
function touched(){manualDefaults=true;autoSuggested=false;providerRequest++;error.value='';hint.value='';}
function matchLocation(){draft.serviceLocationId=String(serviceLocationForOffice(locations.value,draft.officeId,draft.pos)?.id||'');}
function changeOffice(){touched();const office=offices.value.find(row=>String(row.id)===draft.officeId);draft.pos=String(office?.default_place_of_service||office?.defaultPlaceOfService||draft.pos||(isSchool.value?'03':'11'));if(canReadBilling.value)matchLocation();}
function changePlaceOfService(){touched();if(canReadBilling.value)matchLocation();}
function resetDefaults(){providerRequest++;Object.assign(draft,saved.value);manualDefaults=false;autoSuggested=false;error.value='';hint.value='Changes reset.';}
async function load(){
 const own=++generation;providerRequest++;client.value=null;loaded.value=false;loading.value=true;saving.value=false;suggesting.value=false;servicesError.value='';attemptedProviderId=0;error.value='';hint.value='';services.value=[];manualDefaults=false;autoSuggested=false;Object.assign(draft,blank());saved.value=blank();for(const key of Object.keys(additions)){additions[key]='';makePrimary[key]=false;}
 try{
  const [c,m,a,o,f,l]=await Promise.all([api.get(`/clients/${props.clientId}`,request()),api.get(`/clients/${props.clientId}/agency-affiliations`,request()),api.get(`/clients/${props.clientId}/affiliations`,request()),api.get(`/agencies/${props.agencyId}/affiliated-organizations`,request()),api.get('/offices',request()),canReadBilling.value?api.get('/medical-billing/service-locations',{...request(),params:{agencyId:Number(props.agencyId)}}):Promise.resolve({data:[]})]);
  if(own!==generation)return;const record=c.data?.client||c.data;if(Number(record?.agency_id)!==Number(props.agencyId))throw Error('The client agency changed. Reopen this client to review assignments.');
  client.value=record;memberships.value=rows(m);affiliations.value=rows(a);catalog.value=rows(o);offices.value=assignmentOfficesForAgency(Array.isArray(f.data)?f.data:f.data?.locations||[],props.agencyId);locations.value=l.data?.items||l.data?.locations||l.data?.serviceLocations||(Array.isArray(l.data)?l.data:[]);
  locations.value=locations.value.filter(row=>!row.agency_id||Number(row.agency_id)===Number(props.agencyId));
  const member=memberships.value.find(row=>Number(row.agency_id)===Number(props.agencyId))||record;
  saved.value={officeId:String(member.default_office_location_id||record.default_office_location_id||''),pos:String(member.default_place_of_service||record.default_place_of_service||''),serviceLocationId:String(member.default_service_location_id||record.default_service_location_id||'')};Object.assign(draft,saved.value);loaded.value=true;
  if(!isSchool.value&&!draft.officeId&&providerId.value)await suggestProvider(false);
 }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||e.message||'Assignments could not be loaded.';}finally{if(own===generation){loading.value=false;if(loaded.value&&!isSchool.value&&!draft.officeId&&providerId.value&&providerId.value!==attemptedProviderId)void suggestProvider(false);}}
}
async function suggestProvider(replace=false){
 if(!providerId.value||isSchool.value)return;const own=generation,run=++providerRequest,provider=providerId.value;attemptedProviderId=provider;suggesting.value=true;
 try{const response=await api.get(`/users/${provider}/office-assignments`,request());if(own!==generation||run!==providerRequest||provider!==providerId.value)return;
  const next=providerOfficeDefaults({assigned:response.data?.assigned||[],offices:offices.value,locations:locations.value,agencyId:props.agencyId});
  if(!next){hint.value='This provider has no active office for this agency. Choose the client’s office below.';return;}
  if(replace)Object.assign(draft,{...next,serviceLocationId:canReadBilling.value?next.serviceLocationId:draft.serviceLocationId});else{if(!draft.officeId)draft.officeId=next.officeId;if(!draft.pos)draft.pos=next.pos;if(!draft.serviceLocationId&&canReadBilling.value)matchLocation();}
  autoSuggested=true;manualDefaults=false;error.value='';hint.value='Filled from the provider’s assigned office. Review and save defaults.';
 }catch(e){if(own===generation&&run===providerRequest)hint.value=e.response?.data?.error?.message||'Provider office defaults could not be loaded. Choose an office below.';}
 finally{if(own===generation&&run===providerRequest)suggesting.value=false;}
}
function onServicesLoaded(data){services.value=data.services||[];servicesError.value=data.error||'';}
function onServicesUpdated(data){services.value=data.services||[];emit('updated');}
watch(providerId,()=>{if(!loaded.value||loading.value||isSchool.value||manualDefaults)return;if(autoSuggested&&!saved.value.officeId)Object.assign(draft,saved.value);if(!draft.officeId)void suggestProvider(false);});
async function saveDefaults(){if(busy.value)return false;const own=generation,cid=props.clientId,aid=props.agencyId;saving.value=true;error.value='';try{
 await api.post(`/clients/${cid}/agency-affiliations`,{agency_id:Number(aid),default_office_location_id:Number(draft.officeId)||null,default_place_of_service:draft.pos||null,...(canReadBilling.value?{default_service_location_id:Number(draft.serviceLocationId)||null}:{})},request());
 if(own!==generation)return false;saved.value={...draft};manualDefaults=false;autoSuggested=false;hint.value='Defaults saved.';emit('updated');return true;
 }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Scheduling defaults could not be saved.';return false;}finally{if(own===generation)saving.value=false;}}
async function addAffiliation(type){if(busy.value||!additions[type])return;const own=generation,cid=props.clientId,aid=props.agencyId;saving.value=true;error.value='';try{
 await api.post(`/clients/${cid}/affiliations`,{agency_id:Number(aid),organization_id:Number(additions[type]),is_primary:makePrimary[type]},request());if(own!==generation)return;const response=await api.get(`/clients/${cid}/affiliations`,request());if(own!==generation)return;affiliations.value=rows(response);additions[type]='';makePrimary[type]=false;emit('updated');
 }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Affiliation could not be saved.';}finally{if(own===generation)saving.value=false;}}
function prepareLeave(){if(busy.value||!loaded.value||error.value||servicesError.value)return false;if(servicesPanel.value?.prepareLeave?.()===false)return false;if(dirty.value){error.value='Save or reset scheduling defaults before moving to another client.';section.value?.scrollIntoView?.({block:'center'});return false;}return true;}
defineExpose({prepareLeave,reload:load});
watch(()=>[props.clientId,props.agencyId],load,{immediate:true});
onBeforeUnmount(()=>{generation++;providerRequest++;emit('busy',false);});
</script>
<style scoped>
.update-assignments{margin:20px 0;padding:18px;border:1px solid #cbdbe7;border-radius:12px;background:#f5fbfa;color:#19374f}.assignment-services{border:0;padding:0;margin:0;min-width:0}.update-assignments h3{margin:0 0 8px}.update-assignments h4,.update-assignments h5{margin:18px 0 10px}.update-assignments p{font-size:13px;line-height:1.5}.assignment-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.update-assignments label{display:grid;gap:6px;font-size:13px}.update-assignments select{width:100%;padding:10px;border:1px solid #b9ccd8;border-radius:8px;background:white;font:inherit}.update-assignments button{padding:9px 13px;border:1px solid #a9c2d4;border-radius:7px;background:white;color:#173c65;cursor:pointer}.update-assignments button:disabled{opacity:.5;cursor:default}.assignment-actions,.assignment-affiliations form{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:12px}.assignment-affiliations{border-top:1px solid #cee2dd;margin-top:18px}.assignment-check{display:flex!important;align-items:center;margin:10px}.update-assignments [role=alert]{color:#a12828}@media(max-width:750px){.assignment-fields{grid-template-columns:1fr}}
</style>
