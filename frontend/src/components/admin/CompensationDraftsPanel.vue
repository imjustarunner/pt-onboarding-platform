<template>
 <section class="comp-drafts">
  <h2>Compensation agreement drafts</h2>
  <p>Edit each individual schedule and agreement text here. Saving a draft does not change payroll, assign signature tasks or send messages.</p><p v-if="form && !isNluDraft">Proposed effective date: October 10, 2026.</p>
  <p v-if="error" role="alert">{{error}}</p>
  <p v-if="optionsLoading" role="status">Loading individual draft setup…</p>
  <p v-if="creationError" role="alert">{{creationError}}</p>
  <section v-if="creationOptions?.enabled" class="create-draft">
   <button v-if="!creationOpen" type="button" :disabled="saving || hasUnsavedChanges" @click="creationOpen=true">Prepare individual compensation draft</button>
   <p v-if="hasUnsavedChanges">Save the current draft before preparing another employee’s agreement.</p>
   <form v-if="creationOpen" @submit.prevent="createDraft">
    <h3>Prepare an individual draft</h3>
    <p>Choose an active employee, an existing update and the authorized agency signer. Preparing a draft does not request signatures, activate payroll or change service permissions.</p>
    <p v-if="!creationOptions.employees?.length">No active employees are available for this agency. Complete the normal employee setup before preparing compensation.</p>
    <p v-if="!creationOptions.pushes?.length">Prepare an employee update for this agency before adding an individual agreement.</p>
    <p v-if="!creationSigners.length">An authorized agency signer other than the employee is required.</p>
    <div class="fields">
     <label>Employee<select v-model.number="createForm.userId" required :disabled="saving"><option :value="null">Choose employee</option><option v-for="employee in creationOptions.employees || []" :key="employee.id" :value="Number(employee.id)">{{employee.name}} · {{employee.role}}</option></select></label>
     <label>Employee update<select v-model.number="createForm.pushId" required :disabled="saving"><option :value="null">Choose existing update</option><option v-for="push in creationOptions.pushes || []" :key="push.id" :value="Number(push.id)">{{push.title}}</option></select></label>
     <label>Authorized agency signer<select v-model.number="createForm.countersignerUserId" required :disabled="saving"><option :value="null">Choose signer</option><option v-for="person in creationSigners" :key="person.id" :value="Number(person.id)">{{person.name}} · {{person.role}}</option></select></label>
     <label>Prospective effective date<input v-model="createForm.effectiveDate" type="date" :min="creationOptions.minimumEffectiveDate" required :disabled="saving" /></label>
     <label>Agreement type<select v-model="createForm.agreementType" required :disabled="saving"><option value="">Choose agreement type</option><option value="amendment">Amend an existing agreement</option><option value="initial" :disabled="creationEmployee?.hasSignedAgreement === true">Initial compensation schedule</option></select></label>
    </div>
    <p v-if="creationEmployee">{{creationEmployee.name}} · {{creationEmployee.role}}. {{creationEmployee.hasSignedAgreement ? 'An existing signed agreement was found. Its saved schedule will be preserved for review.' : 'No signed agreement was found in this agency. Choose an initial schedule or identify the actual prior agreement.'}}</p>
    <label v-if="createForm.agreementType === 'amendment'">Prior agreement reference<input v-model="createForm.priorAgreementReference" maxlength="300" :required="creationEmployee?.hasSignedAgreement === false" :disabled="saving" placeholder="Use the actual agreement date or reference if not stored" /></label>
    <p>Review the resolved service roles, levels and rates in the draft before making changes. Existing open drafts are reused without resetting their terms.</p>
    <div class="actions"><button type="submit" :disabled="saving || !creationComplete">{{saving ? 'Preparing…' : 'Prepare draft for review'}}</button><button type="button" :disabled="saving" @click="creationOpen=false">Cancel</button></div>
   </form>
  </section>
  <p v-else-if="creationOptions?.reason" class="muted">{{creationOptions.reason}}</p>
  <div class="draft-layout">
   <aside><label>Find an employee<input v-model="search" type="search" /></label>
    <button v-for="d in filtered" :key="d.id" :class="{selected:selected?.id===d.id}" :disabled="saving" @click="open(d.id)"><strong>{{d.name}}</strong><span v-if="d.example">Real example</span><small>Category {{d.category || '—'}} · Level {{d.level || '—'}} · {{d.issues.length}} items to complete</small></button>
    <p v-if="!drafts.length">No compensation drafts have been prepared for this agency.</p>
   </aside>
   <article v-if="selected && form">
    <h3>{{form.employee.name}}</h3><p>{{form.employee.title}} · {{form.employee.credential}}</p>
    <p v-if="isNluDraft && form.initialAgreement">Initial compensation schedule. No prior agreement date is required; all proposed terms still need review and actual signatures.</p>
    <p v-if="form.source?.priorAgreement" class="prior-agreement">Preserved prior agreement {{form.source.priorAgreement.id}}<template v-if="form.source.priorAgreement.agreementDate"> · {{form.source.priorAgreement.agreementDate}}</template><template v-if="form.source.priorAgreement.effectiveOn"> · Effective {{form.source.priorAgreement.effectiveOn}}</template>. Existing terms remain effective until a completed prospective agreement applies.</p>
    <p v-if="form.schedule.serviceRoles?.length">{{form.initialAgreement ? 'Proposed' : 'Preserved'}} service roles: {{form.schedule.serviceRoles.join(', ')}}. Editing compensation does not grant service access.</p>
    <ul v-if="selected.issues.length" class="issues"><li v-for="issue in selected.issues" :key="issue">{{issue}}</li></ul>
    <div class="fields">
     <label>Category<select v-model.number="form.schedule.category"><option :value="null">Choose</option><option v-for="(category,key) in categoryOptions" :key="key" :value="Number(key)">{{key}} · {{category.label}}</option></select></label>
     <label>Level<select v-model.number="form.schedule.level"><option :value="null">Choose</option><option v-for="l in 5" :key="l" :value="l">{{l}}</option></select></label>
     <label v-for="[key,label] in visibleRates" :key="key">{{label}}<input v-model="form.schedule[key]" type="number" min="0" step="0.01" /></label>
    </div>
    <section v-if="isNluDraft" class="nlu-service-placements">
     <h3>Prospective NLU service placements</h3>
     <label>Proposed effective date<input v-model="form.effectiveDate" type="date" required /></label>
     <p>Category and service levels are separate approvals. Preserve prior signed terms until this individual amendment is completed and activated.</p>
     <p v-if="policyError" role="alert">{{policyError}}</p>
     <label>Childcare level<select v-model.number="form.schedule.childcareLevel"><option :value="null">No childcare placement</option><option v-for="level in 5" :key="level" :value="level">{{level}}</option></select></label>
     <ChildcareRateScheduleEditor v-if="form.schedule.childcareLevel" v-model="childcareOverrides" :category="form.schedule.category" :level="form.schedule.childcareLevel" :policy="servicePolicy?.childcare" :flat-rate="form.schedule.childcareRate ?? form.schedule.childcareHourlyRate" />
     <label>Tutoring level<select v-model.number="form.schedule.tutoringLevel"><option :value="null">No tutoring placement</option><option v-for="level in 5" :key="level" :value="level">{{level}}</option></select></label>
     <template v-if="form.schedule.tutoringLevel"><label>Fallback tutoring hourly override<input v-model="form.schedule.tutoringHourlyRate" type="number" min="0.01" step="0.01" placeholder="Use approved category and level" /></label><p>Virtual tutoring: {{tutoringMoney('virtual')}} / hour · In person: {{tutoringMoney('in-person')}} / hour.</p><p v-if="hasFormatTutoringRates">Existing individual format rates take precedence over the fallback rate and remain part of this schedule.</p></template>
     <label>Homework Help hourly rate<input v-model="form.schedule.homeworkHelpRate" type="number" min="0.01" step="0.01" /></label>
    </section>
    <p class="muted">Changing category or level here does not apply a payroll rate. Confirm the draft’s rates against the approved matrix.</p>
    <label>Level description<textarea v-model="form.schedule.levelDescription" rows="2" /></label>
    <label v-if="!form.initialAgreement">Prior agreement date or reference<input v-model="form.employee.originalAgreementDate" /></label>
    <label>Individual notes<textarea v-model="form.additionalTerms" rows="2" /></label>
    <h3>Agreement clauses</h3><DraftHtmlEditor :key="selected.id" v-model="form.commonClausesHtml" label="Agreement clauses" />
    <div class="actions"><button :disabled="saving" @click="save">{{saving?'Saving…':'Save draft & update preview'}}</button><button @click="download">Download printable HTML</button><span role="status">{{notice}}</span></div>
    <details open><summary>View saved agreement</summary><iframe sandbox="" title="Saved compensation agreement" :srcdoc="previewHtml" /></details>
    <details class="release"><summary>Release this individual {{form.initialAgreement ? 'schedule' : 'amendment'}} for signature</summary><p>Release makes this document visible to this employee in their real update and My Documents. {{isNluDraft ? 'The assigned authorized agency signer will countersign.' : 'Haley Inyart will countersign.'}} It does not send an email or text and does not change payroll. Private previews remain read-only. Save any edits before releasing.</p><label><input v-model="releaseReady" type="checkbox" /> I reviewed the completed terms and want this employee to be able to sign.</label><button :disabled="saving || !releaseReady || selected.issues.length>0 || hasUnsavedChanges" @click="release">Make available for signature</button></details>
   </article>
  </div>
 </section>
</template>
<script setup>
import {computed,onMounted,ref,watch} from 'vue';
import api from '../../services/api';
import DraftHtmlEditor from './DraftHtmlEditor.vue';
import ChildcareRateScheduleEditor from '../hiring/ChildcareRateScheduleEditor.vue';
import {childcareMoney} from '../../utils/childcarePresentation.js';
const props=defineProps({agencyId:{type:[String,Number],required:true}});
const drafts=ref([]),selected=ref(null),form=ref(null),search=ref(''),error=ref(''),notice=ref(''),saving=ref(false);
const releaseReady=ref(false),servicePolicy=ref(null),libraryCategories=ref(null),policyError=ref('');
const creationOptions=ref(null),optionsLoading=ref(false),creationOpen=ref(false),creationError=ref('');
const emptyCreateForm=()=>({userId:null,pushId:null,countersignerUserId:null,effectiveDate:'',agreementType:'',priorAgreementReference:''});
const createForm=ref(emptyCreateForm());
const creationEmployee=computed(()=>creationOptions.value?.employees?.find(employee=>Number(employee.id)===Number(createForm.value.userId)));
const creationSigners=computed(()=>(creationOptions.value?.countersigners || []).filter(person=>Number(person.id)!==Number(createForm.value.userId)));
const creationComplete=computed(()=>!!(creationEmployee.value && creationOptions.value?.pushes?.some(push=>Number(push.id)===Number(createForm.value.pushId)) && creationSigners.value.some(person=>Number(person.id)===Number(createForm.value.countersignerUserId)) && /^\d{4}-\d{2}-\d{2}$/.test(createForm.value.effectiveDate) && createForm.value.effectiveDate>=creationOptions.value.minimumEffectiveDate && ['amendment','initial'].includes(createForm.value.agreementType) && !(createForm.value.agreementType==='initial' && creationEmployee.value.hasSignedAgreement) && (createForm.value.agreementType==='initial' || creationEmployee.value.hasSignedAgreement || createForm.value.priorAgreementReference.trim())));
const isNluDraft=computed(()=>!!(form.value?.schedule?.nluCompensationPolicyVersion||form.value?.nluCompensationPolicyVersion));
const legacyCategories={1:{label:'Unlicensed'},2:{label:'Pre-licensed'},3:{label:'Licensed'}};
const nluCategories={1:{label:'Foundational Provider'},2:{label:'Bachelor’s-Level and Approved Unlicensed Provider'},3:{label:'Master’s-Level and Pre-Licensed Provider'},4:{label:'Licensed and Advanced Provider'}};
const categoryOptions=computed(()=>isNluDraft.value?(libraryCategories.value?.[4]?libraryCategories.value:nluCategories):legacyCategories);
const childcareOverrides=computed({get:()=>form.value?.schedule?.childcareRatesByBand||{},set:value=>{form.value.schedule.childcareRatesByBand=value;}});
const visibleRates=computed(()=>isNluDraft.value&&(Number(form.value.schedule.category)===1||form.value.schedule.clinicalEligible===false)?rates.filter(([key])=>!['creditRate','hcodeRate','creditRateProbation','hcodeRateProbation'].includes(key)):rates);
function savedTutoringRate(format){const schedule=form.value?.schedule||{};return format==='virtual'?(schedule.tutoringRates?.virtual??schedule.tutoringVirtualRate):(schedule.tutoringRates?.in_person??schedule.tutoringRates?.['in-person']??schedule.tutoringInPersonRate);}
const hasFormatTutoringRates=computed(()=>['virtual','in-person'].some(format=>savedTutoringRate(format)!=null&&savedTutoringRate(format)!==''));
function tutoringMoney(format){const schedule=form.value?.schedule||{},category=Number(schedule.tutoringCategory??schedule.category),level=Number(schedule.tutoringLevel)-1;const individual=savedTutoringRate(format),rate=individual!==''&&individual!=null?individual:schedule.tutoringHourlyRate;return childcareMoney(rate!==''&&rate!=null?rate:category===1?servicePolicy.value?.tutoring?.category1?.[level]:category===2?(format==='virtual'?servicePolicy.value?.tutoring?.category2Virtual:servicePolicy.value?.tutoring?.category2InPerson)?.[level]:null);}
async function loadServicePolicy(agencyId){try{const{data}=await api.get('/contract-generator/library',{params:{agencyId}});if(agencyId!==props.agencyId)return;servicePolicy.value=data.serviceCompensation||null;libraryCategories.value=data.compensationCategories||null;if(!servicePolicy.value)policyError.value='Approved default service rates are unavailable. Existing individual overrides remain visible; confirm defaults before issuing.';}catch(e){if(agencyId===props.agencyId)policyError.value='Approved default service rates could not be loaded. Existing overrides remain editable; confirm defaults before issuing.';}}

const hasUnsavedChanges=computed(()=>!!form.value&&JSON.stringify(form.value)!==JSON.stringify(selected.value?.data));
const rates=[['creditRate','Clinical Session Rate'],['hcodeRate','Direct Care Rate'],['indirectRate','Indirect / hour'],['supportRate','Support / hour'],['ptoRate','Sick leave / hour'],['creditRateProbation','Probation / minimum Clinical Session Rate'],['hcodeRateProbation','Probation / minimum Direct Care Rate'],['indirectRateProbation','Probation / minimum indirect rate'],['supportRateProbation','Probation / minimum support rate']];
const filtered=computed(()=>drafts.value.filter(d=>d.name.toLowerCase().includes(search.value.toLowerCase())).sort((a,b)=>Number(b.example)-Number(a.example)||a.name.localeCompare(b.name)));
const previewHtml=computed(()=>`<!doctype html><html><head><meta charset="utf-8"><title>${isNluDraft.value?'NLU':'ITSCO'} compensation draft</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:35px auto;padding:25px;color:#243b30}h1,h2,h3{color:#3e6d54}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #ccc;text-align:left}@media print{body{margin:0;padding:0}tr{break-inside:avoid}}</style></head><body>${selected.value?.html||''}</body></html>`);
let openRequest=0;
let optionsRequest=0;
async function loadCreationOptions(){
 const request=++optionsRequest,agencyId=props.agencyId;
 optionsLoading.value=true;creationError.value='';
 try{const{data}=await api.get('/provider-update/compensation-drafts/options',{params:{agencyId}});if(request!==optionsRequest||agencyId!==props.agencyId)return;creationOptions.value=data;createForm.value={...emptyCreateForm(),effectiveDate:data.minimumEffectiveDate||''};}
 catch(e){if(request===optionsRequest&&agencyId===props.agencyId)creationError.value=e.response?.data?.error?.message||'Individual draft setup is unavailable. Existing drafts can still be reviewed.';}
 finally{if(request===optionsRequest)optionsLoading.value=false;}
}
async function createDraft(){
 if(saving.value||hasUnsavedChanges.value)return;
 if(!creationComplete.value){creationError.value='Choose the employee, existing update, authorized signer, prospective date and agreement type.';return;}
 const agencyId=props.agencyId,request=openRequest;
 const body={agencyId,userId:createForm.value.userId,pushId:createForm.value.pushId,countersignerUserId:createForm.value.countersignerUserId,effectiveDate:createForm.value.effectiveDate,initialAgreement:createForm.value.agreementType==='initial',...(createForm.value.agreementType==='amendment'&&createForm.value.priorAgreementReference.trim()?{priorAgreementReference:createForm.value.priorAgreementReference.trim()}: {})};
 saving.value=true;creationError.value='';error.value='';notice.value='';
 try{const{data}=await api.post('/provider-update/compensation-drafts',body);if(agencyId!==props.agencyId||request!==openRequest)return;selected.value=data;form.value=JSON.parse(JSON.stringify(data.data));releaseReady.value=false;creationOpen.value=false;if(isNluDraft.value){servicePolicy.value=creationOptions.value.serviceCompensation||servicePolicy.value;libraryCategories.value=creationOptions.value.categories||libraryCategories.value;if(!servicePolicy.value)await loadServicePolicy(agencyId);}notice.value=data.reused?'Existing draft opened without replacing its terms. Review and save before release.':'Draft prepared for review. No signatures, payroll or service permissions changed.';await reload();}
 catch(e){if(agencyId===props.agencyId&&request===openRequest)creationError.value=e.response?.data?.error?.message||'Could not prepare this draft. Your choices are still here.';}
 finally{saving.value=false;}
}
async function reload(){
 const agencyId=props.agencyId;
 try{const response=await api.get('/provider-update/compensation-drafts',{params:{agencyId}});if(agencyId===props.agencyId)drafts.value=response.data.drafts;}
 catch(e){if(agencyId===props.agencyId)error.value=e.response?.data?.error?.message||'Could not load drafts.';}
}
async function open(id){
 const request=++openRequest,agencyId=props.agencyId;
 error.value='';notice.value='';releaseReady.value=false;selected.value=null;form.value=null;
 try{const response=(await api.get(`/provider-update/compensation-drafts/${id}`,{params:{agencyId}})).data;if(request!==openRequest||agencyId!==props.agencyId)return;selected.value=response;form.value=JSON.parse(JSON.stringify(response.data));if(isNluDraft.value)await loadServicePolicy(agencyId);}
 catch(e){if(request===openRequest&&agencyId===props.agencyId)error.value=e.response?.data?.error?.message||'Could not open draft.';}
}
async function save(){
 const agencyId=props.agencyId,id=selected.value.id;
 saving.value=true;error.value='';
 try{
  const response=(await api.put(`/provider-update/compensation-drafts/${id}`,{agencyId,expectedHtml:selected.value.html,...(isNluDraft.value?{effectiveDate:form.value.effectiveDate}:{}),schedule:form.value.schedule,originalAgreementDate:form.value.employee.originalAgreementDate,additionalTerms:form.value.additionalTerms,commonClausesHtml:form.value.commonClausesHtml})).data;
  if(agencyId!==props.agencyId||selected.value?.id!==id)return;
  selected.value=response;form.value=JSON.parse(JSON.stringify(response.data));notice.value='Draft saved. No payroll or employee changes made.';await reload();
 }catch(e){if(agencyId===props.agencyId)error.value=e.response?.data?.error?.message||'Could not save draft.';}finally{saving.value=false;}
}
async function release(){if(!releaseReady.value||selected.value.issues.length||hasUnsavedChanges.value)return;saving.value=true;try{await api.post(`/provider-update/compensation-drafts/${selected.value.id}/release`,{agencyId:props.agencyId,expectedHtml:selected.value.html,pushId:form.value.pushId});notice.value=isNluDraft.value?'Released for employee and authorized agency signatures. No email or text sent.':'Released for employee signature, then Haley’s countersignature. No email or text sent.';selected.value=null;form.value=null;releaseReady.value=false;await reload();}catch(e){error.value=e.response?.data?.error?.message||'Could not release amendment.';}finally{saving.value=false;}}
function download(){const url=URL.createObjectURL(new Blob([previewHtml.value],{type:'text/html'}));const a=document.createElement('a');a.href=url;a.download=`${isNluDraft.value?'NLU':'ITSCO'}-compensation-draft-${selected.value.data.employee.userId}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
watch(()=>createForm.value.userId,()=>{createForm.value.agreementType='';createForm.value.priorAgreementReference='';if(Number(createForm.value.countersignerUserId)===Number(createForm.value.userId))createForm.value.countersignerUserId=null;});
onMounted(()=>{reload();loadCreationOptions();});watch(()=>props.agencyId,()=>{openRequest++;optionsRequest++;creationOptions.value=null;creationOpen.value=false;createForm.value=emptyCreateForm();creationError.value='';servicePolicy.value=null;libraryCategories.value=null;policyError.value='';drafts.value=[];selected.value=null;form.value=null;error.value='';notice.value='';reload();loadCreationOptions();});
</script>
<style scoped>
.comp-drafts{line-height:1.6}.create-draft{padding:16px;border:1px solid #cbd5e1;border-radius:10px;margin:16px 0}.create-draft input,.create-draft select,.create-draft button{font:inherit;min-height:44px}.create-draft button:disabled{opacity:.6}.draft-layout{display:grid;grid-template-columns:260px 1fr;gap:24px}.draft-layout aside{max-height:80vh;overflow:auto}.draft-layout aside button{display:block;width:100%;text-align:left;margin:6px 0;background:#fff;border:1px solid #d6e1dc;border-radius:10px;padding:12px}.draft-layout aside .selected{border:2px solid #3e6d54}.draft-layout small{display:block}.draft-layout aside span{font-size:11px;background:#e1f0e6;padding:3px 6px;margin-left:4px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}label{display:block;margin:8px 0}input,textarea,select{display:block;width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:7px}.issues{padding:14px 28px;background:#fff5de;border-radius:10px}.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:20px 0}.actions button{padding:10px 16px;background:#3e6d54;color:white;border:0;border-radius:8px}iframe{width:100%;height:680px;border:1px solid #d6e1dc}.muted{color:#52675d;font-size:13px}@media(max-width:800px){.draft-layout{grid-template-columns:1fr}.draft-layout aside{max-height:260px}.fields{grid-template-columns:1fr}}
</style>
