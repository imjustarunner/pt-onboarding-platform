<template>
 <Teleport to="body">
  <div class="create-records-backdrop auricwell-client-workspace" @click.self="leave">
   <section ref="dialog" class="create-records-modal" role="dialog" aria-modal="true" aria-labelledby="create-records-title" tabindex="-1">
    <header><div><h2 id="create-records-title">{{ created ? `Import records · ${form.fullName}` : 'Add client from records' }}</h2><p>Paste the same sections used in Bring up to date. Create the chart, review imports and assignments, then preview the portal invitation.</p></div><button type="button" class="cr-button" :disabled="busy" @click="leave">Save draft &amp; close</button></header>
    <div class="cr-body">
     <p v-if="error || drafts.state.error" class="cr-error" role="alert">{{ error || drafts.state.error }} <button v-if="drafts.state.error" type="button" class="cr-button" @click="retryDraft">Retry draft save</button></p>
     <p class="cr-draft" role="status">{{ drafts.state.loading ? 'Loading private draft…' : drafts.state.message }}</p>
     <div class="cr-context">
      <label>Agency<select :value="agencyId" :disabled="busy || !!created || drafts.state.loading" @change="changeAgency($event.target.value)"><option value="">Choose agency…</option><option v-for="agency in agencies" :key="agency.id" :value="agency.id">{{ agency.name }}</option></select></label>
      <label>Service<select v-model="form.kind" :disabled="busy || !!created || drafts.state.loading"><option value="clinical">Office / clinical</option><option value="school">School</option><option value="learning">Learning</option><option value="basic_nonclinical">Coaching / consulting</option></select></label>
      <label>{{ form.kind === 'school' ? 'School' : 'Program / office affiliation' }}<select v-model="form.organizationId" :disabled="busy || !!created || drafts.state.loading"><option value="">Choose affiliation…</option><option v-for="org in filteredOrganizations" :key="org.id" :value="org.id">{{ org.name }}</option></select></label>
      <label v-if="!created">Provider<select v-model="form.providerId" :disabled="busy || !!created || drafts.state.loading || !isBackoffice"><option :value="null">Save unassigned</option><option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.first_name }} {{ provider.last_name }}</option></select></label>
      <template v-if="form.kind === 'school'"><label>School year (optional)<input v-model="form.schoolYear" :disabled="!!created" placeholder="YYYY-YYYY" /></label><label>Grade (optional)<select v-model="form.grade" :disabled="!!created"><option value="">Not recorded</option><option v-for="grade in grades" :key="grade.value" :value="grade.value">{{ grade.label }}</option></select></label></template>
     </div>
     <p v-if="!drafts.state.loading && agencyId && !filteredOrganizations.length" class="cr-error">This agency has no active affiliation for this service. Select another service or configure the office affiliation.</p>
     <template v-if="!created">
      <fieldset :disabled="busy || drafts.state.loading || !!drafts.state.error || !agencyId">
       <label>Patient comments paste<textarea v-model="form.records.comments" data-section="comments" rows="4" placeholder="Patient Comments…" /></label>
       <div class="cr-method"><button type="button" :aria-pressed="!form.manual" class="cr-button" @click="form.manual=false">Paste demographics</button><button type="button" :aria-pressed="form.manual" class="cr-button" @click="form.manual=true">Manual entry</button></div>
       <label v-if="!form.manual">Demographics paste<textarea v-model="form.demographics" data-section="demographics" rows="7" placeholder="Paste the client's demographics, including Legal Name and Date of Birth…" /></label>
       <div v-if="!form.manual" class="cr-read-row"><button type="button" class="cr-button" :disabled="!form.demographics.trim() || parsing" @click="readDemographics">{{ parsing ? 'Reading demographics…' : 'Read demographics' }}</button><span>Details fill automatically after pasting. Review them below.</span></div>
       <div v-if="form.manual" class="cr-context"><label>Full name<input v-model="form.fullName" /></label><label>Date of birth<input v-model="form.dateOfBirth" type="date" /></label></div>
       <dl class="cr-identity"><dt>Client</dt><dd>{{ form.fullName || 'Paste demographics to read the name' }}</dd><dt>Date of birth</dt><dd>{{ form.dateOfBirth || 'Not provided' }}</dd><dt>Generated initials</dt><dd>{{ initials || 'Generated from the name' }}</dd></dl>
       <label>The phone and email in this patient information belong to<select v-model="form.contactOwner"><option value="guardian">Parent / guardian — use their contact card and portal account</option><option value="client">Client — use the client’s own contact details</option></select></label>
       <dl v-if="demographicPreview.length" class="cr-identity" aria-label="Demographics preview"><template v-for="field in demographicPreview" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></template></dl>
       <section v-for="section in otherSections" :key="section.key" class="cr-record-section"><label>{{ section.label }} paste<textarea v-model="form.records[section.key]" :data-section="section.key" :rows="section.rows || 5" :placeholder="section.placeholder" /></label><label v-if="section.key==='intake'">Intake type<select v-model="form.intakeServiceCode" data-intake-service><option value="">Choose H0031 or 90791</option><option value="H0031">H0031</option><option value="90791">90791</option></select></label><p v-if="section.hint" class="cr-private">{{ section.hint }}</p></section>
       <p class="cr-private">Pasted records stay in your encrypted agency draft. They are imported into the client chart only when you choose an import action.</p>
       <button type="button" class="cr-button cr-primary" :disabled="!canCreate || parsing" @click="create">{{ working ? 'Creating chart…' : 'Create chart and import sections →' }}</button>
      </fieldset>
     </template>
     <template v-else-if="!completed">
      <p class="cr-saved">Chart #{{ created.id }} is saved. Review the imported sections, complete assignments and payer links, then preview the portal invitation below.</p>
      <section v-if="assignmentError" class="cr-assignment-retry" aria-label="Provider assignment needs attention"><p class="cr-error" role="alert">{{ assignmentError }} Your chart and pasted records are saved; the other sections can still import.</p><label>Provider<select v-model="form.providerId" :disabled="busy || !isBackoffice"><option :value="null">Save unassigned</option><option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.first_name }} {{ provider.last_name }}</option></select></label><button type="button" class="cr-button" :disabled="busy" @click="retryProvider">{{ form.providerId ? 'Retry provider assignment' : 'Continue unassigned' }}</button></section>
      <p v-if="!startImport && !initializing">The saved pastes have not been imported automatically. Continue this same chart below.</p><button v-if="!startImport && !initializing" type="button" class="cr-button cr-primary" :disabled="busy" @click="resumeImport">Resume saved import</button>
      <p v-if="initializing" role="status">Preparing the shared records workflow…</p>
      <ClientEhrBringUpToDatePanel v-if="!initializing" :key="created.id" ref="panel" embedded open creation-flow require-verified-payers :auto-import="startImport" :pending-provider-assignment="!!assignmentError" :client-id="created.id" :agency-id="agencyId" :client-label="form.fullName" :initial-texts="recordPastes" :initial-contact-owner="form.contactOwner" :initial-intake-service-code="form.intakeServiceCode" @busy="panelBusy=$event" @drafts-saved="chartDraftsSaved=true" @imported="finish" />
      <button type="button" class="cr-button" :disabled="busy" @click="leaveImportForNextClient">Save this import and add a different client</button>
     </template>
     <section v-else class="cr-complete"><h3>Client saved{{ form.providerId ? ' and assigned' : '' }}</h3><p>{{ form.fullName }} · {{ providerName || 'Unassigned' }} · Chart #{{ created.id }}</p><button type="button" class="cr-button cr-primary" :disabled="busy" @click="nextClient">Add next client{{ providerName ? ` for ${providerName}` : '' }}</button><button type="button" class="cr-button" @click="leave">Close</button></section>
    </div>
   </section>
  </div>
 </Teleport>
</template>
<script setup>
import { CLIENT_RECORD_SECTIONS } from '../../../utils/clientRecordSections.js';
import { primaryAssignmentProvider } from '../../../utils/clientAssignmentDefaults.js';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useAuthStore } from '../../../store/auth';
import api from '../../../services/api';
import { useModalFocus } from '../../../composables/useModalFocus';
import { useClientCreationDrafts } from '../../../composables/useClientCreationDrafts';
import { generatedClientInitials } from '../../../utils/clientInitials';
import { todayCalendarDate } from '../../../utils/formatDate';
import { STANDARD_GRADE_SELECT_OPTIONS } from '../../../utils/clientGrade';
import { finishClientCreation } from '../../../utils/clientCreationOutcome';
import ClientEhrBringUpToDatePanel from './ClientEhrBringUpToDatePanel.vue';
const props=defineProps({agencies:{type:Array,default:()=>[]},initialAgencyId:{type:[String,Number],default:null}});
const emit=defineEmits(['close','created']);const auth=useAuthStore();
const isBackoffice=computed(()=>['super_admin','admin','support'].includes(auth.user?.role));
const dialog=ref(null),panel=ref(null),agencyId=ref(''),organizations=ref([]),providers=ref([]),created=ref(null),completed=ref(false),working=ref(false),panelBusy=ref(false),parsing=ref(false),error=ref('');
const initializing=ref(false),startImport=ref(false);
const assignmentError=ref('');
const chartDraftsSaved=ref(false);
const defaults=()=>({intakeServiceCode:'',records:Object.fromEntries(CLIENT_RECORD_SECTIONS.map(section=>[section.key,''])),parsedDemographics:null,contactOwner:'guardian',kind:'clinical',organizationId:'',providerId:isBackoffice.value?null:auth.user?.id,schoolYear:'',grade:'',manual:false,demographics:'',fullName:'',dateOfBirth:''});
const form=reactive(defaults()),drafts=useClientCreationDrafts(),grades=STANDARD_GRADE_SELECT_OPTIONS.filter(g=>g.value);
let generation=0,hydrating=false,parseTimer,parseVersion=0;
const busy=computed(()=>working.value||panelBusy.value||drafts.state.loading);
const initials=computed(()=>generatedClientInitials(form.fullName));
const recordPastes=computed(()=>({...form.records,demographics:form.demographics}));
const otherSections=computed(()=>CLIENT_RECORD_SECTIONS.filter(section=>!['comments','demographics','payer'].includes(section.key)&&(isBackoffice.value||!['insurance','billingComments'].includes(section.key))));
const demographicPreview=computed(()=>[
 ['addressStreet','Street address'],['addressLine2','Apartment / unit'],['addressCity','City'],['addressState','State'],['addressZip','ZIP code'],['contactPhone','Contact phone'],['email','Email'],['administrativeSex','Sex'],['preferredLanguage','Preferred language'],['timezone','Time zone'],['textMessagesOk','Text messages'],['appointmentReminderType','Appointment reminders'],['grade','Grade']
].map(([key,label])=>({key,label,value:typeof form.parsedDemographics?.[key]==='boolean'?(form.parsedDemographics[key]?'Yes':'No'):form.parsedDemographics?.[key]})).filter(field=>field.value!=null&&field.value!==''));
const filteredOrganizations=computed(()=>organizations.value.filter(org=>{
 const type=String(org.organization_type||'').toLowerCase();return form.kind==='school'?type==='school':form.kind==='learning'?type==='learning':form.kind==='clinical'?(['clinical','program','office'].includes(type)||(type==='agency'&&Number(org.id)===Number(agencyId.value))):['life_coach','consultant'].includes(type);
}));
const providerName=computed(()=>{const p=providers.value.find(row=>Number(row.id)===Number(form.providerId));return p?[p.first_name,p.last_name].filter(Boolean).join(' '):'';});
const canCreate=computed(()=>!!agencyId.value&&!!form.organizationId&&!!form.fullName.trim()&&!!initials.value&&!drafts.state.error&&!busy.value);
function snapshot(){return{form:{...form,...(created.value&&chartDraftsSaved.value?{records:defaults().records,demographics:''}:{})},created:created.value?{id:created.value.id,agency_id:Number(agencyId.value)}:null,completed:completed.value};}
function save(){if(!hydrating&&agencyId.value)drafts.schedule(snapshot());}
watch(form,save,{deep:true});watch([created,completed],save);
watch(()=>form.kind,()=>{if(hydrating)return;form.organizationId=form.kind==='clinical'&&filteredOrganizations.value.some(row=>Number(row.id)===Number(agencyId.value))?Number(agencyId.value):filteredOrganizations.value.length===1?filteredOrganizations.value[0].id:'';if(form.kind!=='school'){form.schoolYear='';form.grade='';}});
watch(()=>form.demographics,()=>{if(hydrating||form.manual||created.value)return;form.fullName='';form.dateOfBirth='';form.parsedDemographics=null;clearTimeout(parseTimer);parseVersion++;parseTimer=setTimeout(readDemographics,500);},{flush:'sync'});
async function readDemographics(){
 if(!form.demographics.trim()||form.manual)return;const version=++parseVersion,text=form.demographics,context=generation;parsing.value=true;error.value='';
 try{const{data}=await api.post('/clients/demographics/preview',{text},{skipGlobalLoading:true,headers:{'X-Agency-Id':String(agencyId.value)}});if(version!==parseVersion||context!==generation||text!==form.demographics||form.manual)return false;form.parsedDemographics=data.parsed||null;form.fullName=data.parsed?.fullName||'';form.dateOfBirth=data.parsed?.dateOfBirth||'';if(!form.fullName)error.value='The name could not be read. Check the demographics paste or use Manual entry.';return !!form.fullName;}
 catch(e){if(context===generation)error.value=e.response?.data?.error?.message||'Demographics could not be read.';return false;}finally{if(version===parseVersion)parsing.value=false;}
}
async function changeAgency(value){
 chartDraftsSaved.value=false;
 if(created.value||working.value)return;if(agencyId.value&&!(await drafts.flush()))return;
 const version=++generation;parseVersion++;clearTimeout(parseTimer);hydrating=true;agencyId.value=String(value||'');Object.assign(form,defaults());created.value=null;completed.value=false;error.value='';organizations.value=[];providers.value=[];
 if(!agencyId.value){hydrating=false;return;}
 try{
  const[saved,orgs,providerResponse]=await Promise.all([drafts.load(agencyId.value),api.get(`/agencies/${agencyId.value}/affiliated-organizations`,{skipGlobalLoading:true}),api.get('/provider-scheduling/providers',{params:{agencyId:Number(agencyId.value),activeProvidersOnly:true,clientAssignmentsOnly:true},skipGlobalLoading:true})]);
  if(version!==generation)return;
  organizations.value=(Array.isArray(orgs.data)?orgs.data:[]).filter(row=>row.is_active!==false&&row.is_active!==0);
  const agency=props.agencies.find(row=>Number(row.id)===Number(agencyId.value));if(agency&&!organizations.value.some(row=>Number(row.id)===Number(agency.id)))organizations.value.push({...agency,organization_type:agency.organization_type||'agency'});
  providers.value=Array.isArray(providerResponse.data)?providerResponse.data:providerResponse.data?.providers||[];
  if(saved?.form){for(const key of Object.keys(form))if(Object.hasOwn(saved.form,key))form[key]=saved.form[key];form.records={...defaults().records,...(saved.form.records||{})};created.value=saved.created||null;completed.value=saved.completed===true;}
  else {try{const previous=JSON.parse(localStorage.getItem(`client-entry-context:${auth.user.id}:${agencyId.value}`)||'{}');if(providers.value.some(row=>Number(row.id)===Number(previous.providerId)))form.providerId=previous.providerId;}catch{}}
  assignmentError.value='';startImport.value=false;
  if(form.providerId&&!providers.value.some(row=>Number(row.id)===Number(form.providerId))){form.providerId=null;if(created.value)assignmentError.value='The saved provider is no longer assignable in this agency. Choose an active provider or continue unassigned.';}
  if(!form.organizationId&&form.kind==='clinical'&&filteredOrganizations.value.some(row=>Number(row.id)===Number(agencyId.value)))form.organizationId=Number(agencyId.value);
  if(!form.organizationId&&filteredOrganizations.value.length===1)form.organizationId=filteredOrganizations.value[0].id;
  if(created.value){
   const[record,enrollments]=await Promise.all([api.get(`/clients/${created.value.id}`,{skipGlobalLoading:true,headers:{'X-Agency-Id':String(agencyId.value)}}),api.get(`/clients/${created.value.id}/service-enrollments`,{params:{agencyId:Number(agencyId.value)},skipGlobalLoading:true})]);if(version!==generation)return;
   const actualProvider=primaryAssignmentProvider(record.data?.client||record.data,enrollments.data?.services||[]);
   if(actualProvider){form.providerId=actualProvider;assignmentError.value='';}
   else if(form.providerId&&!completed.value)assignmentError.value='The saved provider selection has not been applied to this chart. Retry the assignment or continue unassigned.';
  }
 }catch(e){if(version===generation)error.value=e.response?.data?.error?.message||'Agency setup or the saved chart could not be loaded.';}
 finally{if(version===generation)hydrating=false;}
}
async function retryDraft(){if(!drafts.state.loaded){const currentAgency=agencyId.value;agencyId.value='';await changeAgency(currentAgency);}else await drafts.flush();}
async function create(){
 if(!canCreate.value)return;working.value=true;initializing.value=true;error.value='';
 try{
  if(!form.manual){const read=await readDemographics();if(!read||!form.fullName)throw Error('Read and review the demographics before creating a chart.');}
  save();if(!(await drafts.flush()))return;
  const payload={agency_id:Number(agencyId.value),organization_id:Number(form.organizationId),client_type:form.kind,full_name:form.fullName,date_of_birth:form.dateOfBirth||null,provider_id:isBackoffice.value?null:Number(auth.user.id),submission_date:todayCalendarDate(),referral_date:todayCalendarDate(),school_year:form.kind==='school'?form.schoolYear||null:null,grade:form.kind==='school'?form.grade||null:null,source:'ADMIN_CREATED'};
  const{data}=await api.post('/clients',payload,{skipGlobalLoading:true,headers:{'X-Agency-Id':String(agencyId.value)}});if(!data?.id)throw Error('The client could not be saved.');created.value=data;form.organizationId=data.organization_id||form.organizationId;save();await drafts.flush();emit('created',data);
  if(form.providerId){try{await assignSelectedProvider();}catch(e){assignmentError.value=e.response?.data?.error?.message||e.message||'Provider assignment failed. Select an active provider and retry.';}}
  startImport.value=true;
 }catch(e){error.value=e.response?.data?.error?.message||e.message||'The client could not be created.';}finally{working.value=false;initializing.value=false;}
}
async function assignSelectedProvider(){return finishClientCreation({api,clientId:created.value.id,agencyId:Number(agencyId.value),organizationId:Number(form.organizationId),outcome:'assign',providerId:form.providerId,isSchool:form.kind==='school'});}
async function retryProvider(){working.value=true;try{if(form.providerId)await assignSelectedProvider();assignmentError.value='';await panel.value?.reloadAssignments?.();}catch(e){assignmentError.value=e.response?.data?.error?.message||e.message||'Provider assignment failed. Retry or continue unassigned.';}finally{working.value=false;}}
async function resumeImport(){startImport.value=true;await panel.value?.importAll?.();}
async function finish(){
 // The server has already confirmed records completion. Refreshes must not keep staff in review.
 const snapshot=created.value,id=snapshot?.id,version=generation;completed.value=true;error.value='';save();await drafts.flush();if(version!==generation||created.value?.id!==id)return;emit('created',snapshot);
 try{const[record,enrollments]=await Promise.all([api.get(`/clients/${id}`,{skipGlobalLoading:true,headers:{'X-Agency-Id':String(agencyId.value)}}),api.get(`/clients/${id}/service-enrollments`,{params:{agencyId:Number(agencyId.value)},skipGlobalLoading:true})]);
  if(version!==generation||created.value?.id!==id)return;
  const data=record.data?.client||record.data;form.providerId=primaryAssignmentProvider(data,enrollments.data?.services||[])||null;form.fullName=data.full_name||form.fullName;save();await drafts.flush();
  try{localStorage.setItem(`client-entry-context:${auth.user.id}:${agencyId.value}`,JSON.stringify({providerId:form.providerId}));}catch{}
 }catch{/* The imported chart and completion were saved; its profile can refresh independently. */}
}

async function nextClient(){chartDraftsSaved.value=false;const context={kind:form.kind,organizationId:form.organizationId,providerId:form.providerId};hydrating=true;Object.assign(form,defaults(),context);created.value=null;completed.value=false;startImport.value=false;assignmentError.value='';hydrating=false;save();await drafts.flush();await nextTick();dialog.value?.querySelector('textarea')?.focus();}
async function leaveImportForNextClient(){if(await panel.value?.prepareLeave()===false)return;await nextClient();chartDraftsSaved.value=false;}
async function prepareLeave(){if(busy.value){error.value='Wait for the current request to finish, then save and close.';return false;}clearTimeout(parseTimer);if(await panel.value?.prepareLeave()===false)return false;save();return drafts.flush();}
async function leave(){if(await prepareLeave())emit('close');}
useModalFocus(dialog,leave);
onBeforeRouteLeave(async()=>!busy.value&&await prepareLeave());
function beforeUnload(event){if(drafts.state.saving||drafts.state.error||working.value){event.preventDefault();event.returnValue='';}}
onMounted(()=>{window.addEventListener('beforeunload',beforeUnload);changeAgency(props.initialAgencyId||props.agencies[0]?.id||'');});
onBeforeUnmount(()=>{generation++;parseVersion++;clearTimeout(parseTimer);drafts.dispose();window.removeEventListener('beforeunload',beforeUnload);});
</script>
<style scoped>
.create-records-backdrop{position:fixed;inset:0;z-index:10200;display:flex;justify-content:center;background:#0f172a80;padding:18px;box-sizing:border-box}.create-records-modal{width:min(1280px,100%);height:100%;box-sizing:border-box;display:flex;flex-direction:column;border-radius:14px;background:#fff;color:#17345c;padding:20px;overflow:hidden}header{display:flex;justify-content:space-between;align-items:start;gap:16px;border-bottom:1px solid #dce5f1;padding-bottom:12px}h2{margin:0;font-size:1.35rem}header p{margin:6px 0 0;font-size:13px;color:#60718a}.cr-body{overflow:auto;flex:1;min-height:0;padding:12px 0}.cr-context{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:12px 0 20px}label{display:block;font-size:13px;font-weight:600}input,select,textarea{box-sizing:border-box;width:100%;margin-top:6px;padding:10px 12px;border:1px solid #cbd8e9;border-radius:8px;background:#fff;color:#17345c;font:inherit;font-weight:400}textarea{resize:vertical}fieldset{border:0;padding:0;min-width:0}.cr-button{border:1px solid #cbd9eb;border-radius:8px;background:#edf3fa;color:#173b69;padding:8px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}.cr-button:disabled{opacity:.5;cursor:default}.cr-primary{background:#173b69;color:#fff;border-color:#173b69}.cr-method{display:flex;gap:8px;margin-bottom:12px}.cr-method [aria-pressed=true]{background:#dbe8f9;border-color:#7296c5}.cr-read-row{display:flex;align-items:center;gap:12px;margin:10px 0}.cr-read-row span,.cr-private,.cr-draft{font-size:12px;color:#60718a}.cr-identity{display:grid;grid-template-columns:140px 1fr;gap:8px;padding:16px;border:1px solid #dce5f1;border-radius:10px;background:#f7faff;font-size:14px}.cr-identity dt{color:#60718a}.cr-identity dd{margin:0;font-weight:600}.cr-error{color:#b42318;font-size:13px}.cr-saved{border:1px solid #b8d8c9;background:#effaf4;padding:12px;border-radius:8px;font-size:13px}.cr-complete{padding:24px 0}.cr-complete button{margin:8px 8px 0 0}@media(max-width:600px){.create-records-backdrop{padding:6px}.create-records-modal{padding:12px}.cr-read-row{align-items:start;flex-direction:column}}
</style>
