<template>
  <section v-if="canSeeBilling || accountSupport" class="client-insurance-editor">
    <h4>{{ profileLayout ? 'Insurance and benefits' : isPaper ? 'Insurance details' : assignmentReview ? 'Edit saved insurance details' : canSeeBilling ? 'Insurance and claim identity' : 'Insurance information' }}</h4>
    <button v-if="!opened" class="btn btn-secondary" type="button" @click="load">Review private insurance details</button>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="insuranceLoading" role="status">Loading insurance and saved verification results…</p>
    <template v-if="profileLayout && opened && draft">
     <nav class="insurance-sections" aria-label="Insurance sections"><button v-for="panel in profilePanels" :key="panel.key" type="button" :aria-pressed="activePanel===panel.key" @click="activePanel=panel.key">{{ panel.label }}</button></nav>
     <section v-if="activePanel==='overview'" class="insurance-overview" aria-label="Coverage overview">
      <p v-if="draftDirty" role="status">You have unsaved insurance edits.</p>
      <div class="coverage-cards"><article v-for="slot in ['primary','secondary']" :key="slot"><h5>{{ slot==='primary'?'Primary insurance':'Secondary insurance' }}</h5><strong>{{ draft[slot]?.insurerName || 'Not recorded' }}</strong><p>{{ coverageStatus(slot) }}</p><p v-if="draft[slot]?.insurerName">{{ draft[slot]?.memberId ? 'Member ID saved' : 'Member ID needed' }} · {{ draft[slot]?.payerId ? 'Payer route matched' : 'Payer route needed' }}</p><p v-if="draft[slot]?.planName">{{ draft[slot].planName }}</p></article></div>
      <section class="next-action" aria-label="Next insurance action"><div><h5>Next step</h5><p>{{ nextAction.message }}</p></div><button type="button" @click="activePanel=nextAction.panel">{{ nextAction.label }}</button></section>
      <p>Policy details, a returned coverage response, and billing approval are tracked separately. A successful coverage check does not finish payer-order review.</p>
     </section>
    </template>
    <form v-if="opened && draft" v-show="!profileLayout || activePanel==='details'" novalidate @submit.prevent="save">
      <fieldset class="insurance-edit-fields" :disabled="busy || insuranceLoading">
      <p class="insurance-help">Save partial information at any time. Review details copied from Demographics against the insurance card.<template v-if="canSeeBilling"> Missing claim fields prevent submission, not saving.</template><template v-else> The billing team reviews coverage before preparing claims.</template></p>
      <section v-if="isPaper" class="paper-policy-summary" aria-label="Current paper insurance details">
        <h5>{{ draftDirty ? 'Insurance draft — unsaved changes' : 'Saved insurance details' }}</h5>
        <p v-if="paperOrderPrepared">The old saved Medicaid policy was in the primary position. This draft follows the packet’s two columns. Review and save it before checking coverage.</p>
        <div class="paper-policy-slots"><article v-for="slot in activeSlots" :key="slot"><strong>{{ slot === 'primary' ? 'Primary' : 'Secondary' }} · {{ draft[slot]?.insurerName || 'Choose carrier' }}</strong><p>{{ draft[slot]?.memberId ? `Member ID: ${draft[slot].memberId}` : needsChildLookup(draft[slot]) ? 'Child’s Medicaid ID: lookup pending' : 'Member ID not entered' }}</p><span>{{ verificationLabel(slot) }}</span></article></div>
        <p v-if="hasSecondary">Primary is billed first. Secondary billing follows the primary payer’s adjudication.</p>
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="refreshVerification">Refresh saved verification status</button>
      </section>
      <section v-if="policies.length && !isPaper" aria-label="Submitted insurance policies" class="coverage-review">
        <p>Review each parent’s submitted policy and card images. Choose which coverage belongs in each billing position; saving the order preserves every original submission.</p>
        <div class="identity-fields">
          <label>Use submitted coverage as primary<select v-model="selectedSources.primary" @change="useSubmittedPolicy('primary')"><option value="">Keep or enter primary details manually</option><option v-for="policy in coverageChoices" :key="policy.key" :value="policy.key" :disabled="policy.key === selectedSources.secondary">{{ policy.label }}</option></select></label>
          <label>Use submitted coverage as secondary<select v-model="selectedSources.secondary" @change="useSubmittedPolicy('secondary')"><option value="">Keep or enter secondary details manually</option><option v-for="policy in coverageChoices" :key="policy.key" :value="policy.key" :disabled="policy.key === selectedSources.primary">{{ policy.label }}</option></select></label>
        </div>
        <article v-for="policy in policies" :key="policy.id" class="coverage-evidence">
          <strong>{{ policy.submittedBy }} · {{ policy.primary.insurerName || 'Submitted policy' }}</strong>
          <p v-if="policy.secondary">Additional submitted coverage: {{ policy.secondary.insurerName }}</p>
          <div class="evidence-actions"><button v-for="slot in evidenceSlots(policy)" :key="slot" type="button" class="btn btn-secondary" @click="downloadEvidence(policy.id,slot)">View {{ slot.replaceAll('_',' ') }} card</button></div>
          <small v-if="!evidenceSlots(policy).length">Card images have not been uploaded for this submission.</small>
        </article>
      </section>
      <details v-if="isPaper && paperCoverage && Object.keys(paperCoverage).length" class="paper-coverage" aria-label="Original insurance reader output">
        <summary>Original reader output — may contain errors</summary><p>Your corrected fields below are used when saving. This original read stays available for comparison with the PDF.</p>
        <article v-for="(policy,slot) in paperCoverage" :key="slot"><strong>{{ slot === 'primary' ? 'Primary' : 'Secondary' }}: {{ policy.insurerName || 'Carrier not read' }}</strong><p>Number read: {{ policy.memberId || 'Not read' }} · Holder written on packet: {{ policy.paperSubscriberName || 'Not read' }}</p></article>
      </details>
      <details class="insurance-identity" :open="!isPaper && !profileLayout"><summary>Client identity · {{ draft.patient.firstName }} {{ draft.patient.lastName }} · {{ draft.patient.dateOfBirth }}</summary><button type="button" class="btn btn-secondary" @click="useDemographics">Fill missing fields from Demographics</button><div class="identity-fields"><label v-for="field in patientFields" :key="field.key">{{ field.label }}<input v-model="draft.patient[field.key]" :type="field.type || 'text'" maxlength="255" /></label></div></details>
      <h5>Primary coverage</h5><InsurancePolicyFields :scope-key="`client:${clientId}:primary`" v-model="draft.primary" :payers="payers" :patient="draft.patient" :field-sources="draftDirty ? {} : fieldSources.primary" :organized="profileLayout" :paper-entry="isPaper" :require-complete="false" />
      <label><input v-model="hasSecondary" type="checkbox" /> Secondary coverage</label><InsurancePolicyFields :scope-key="`client:${clientId}:secondary`" v-if="hasSecondary" v-model="draft.secondary" :payers="payers" :patient="draft.patient" :field-sources="draftDirty ? {} : fieldSources.secondary" :organized="profileLayout" :paper-entry="isPaper" :require-complete="false" />
      <button v-if="hasSecondary" type="button" class="btn btn-secondary" @click="swapCoverage">Swap primary and secondary</button>
      <section v-if="isPaper && paperEntryIssues.length" aria-label="Insurance details for staff follow-up">
        <p>Some insurance details need follow-up. Enter what is available; do not guess. Staff can look up the remaining information and billing must review coverage separately.</p>
        <ul><li v-for="issue in paperEntryIssues" :key="issue">{{ issue }}</li></ul>
        <p>Missing details stay with billing for follow-up.</p>
      </section>
      <EligibilityPolicyFindings v-if="canSeeBilling && eligibilityFindings.length && !profileLayout" :findings="eligibilityFindings" :insurance="draft" :busy="busy" :dirty="draftDirty" @import-details="importDetails" @draft-policy="importReportedPolicy" />
      <ul v-if="issues.length"><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul>
      <label v-if="canSeeBilling && !assignmentReview && !isPaper">Provider accepts assignment of insurance payment<select v-model="draft.acceptAssignment"><option :value="null">Select</option><option :value="true">Yes</option><option :value="false">No</option></select></label>
      <p v-if="canSeeBilling && !assignmentReview && !isPaper" class="insurance-review-state">{{ verified ? 'Insurance identity review is recorded for these details.' : 'Review the current details and check the confirmation below before saving them as verified.' }}</p>
      <label v-if="canSeeBilling && !assignmentReview && !isPaper"><input v-model="verified" type="checkbox" /> I reviewed this client’s identity and subscriber details against the policy and verified coverage for claim preparation.</label>
      <p v-if="isPaper && paperEntry">Draft saves send no payer request. Submitting the completed packet queues eligibility checks; billing handles missing details and coverage issues.</p>
      <p v-else-if="isPaper && !paperFinalizedAt">Eligibility begins after the completed packet is submitted.</p>
      <div><button class="btn btn-secondary" :disabled="busy">{{ busy ? 'Saving…' : isPaper ? 'Save draft' : 'Save insurance information' }}</button> <button v-if="isPaper && !paperEntry && canSeeBilling && paperFinalizedAt" class="btn btn-primary" type="button" :disabled="busy" @click="save({checkCoverage:true})">Save corrections &amp; check coverage</button> <button v-if="!paperEntry && !profileLayout" class="btn btn-secondary" type="button" @click="opened=false;draft=null">Close private details</button></div>
      </fieldset>
    </form>
    <EligibilityPolicyFindings v-if="profileLayout && opened && draft && canSeeBilling && activePanel==='benefits'" :findings="eligibilityFindings" :insurance="draft" :busy="busy" :dirty="draftDirty" @import-details="importDetails" @draft-policy="importReportedPolicy" />
    <div v-show="!profileLayout || activePanel==='verification'">
     <ClientCoverageVerification v-if="opened && canSeeBilling && !assignmentReview && showRelatedReviews" :client-id="clientId" :agency-id="agencyId" :service-date="serviceDate" ref="coveragePanel" @checked="refreshVerification" @saved="refreshVerification();emit('saved')" />
     <details v-if="opened && canSeeBilling && !assignmentReview && [2,6,377].includes(Number(agencyId))"><summary>Find missing insurance or investigate payer order</summary><p>Use these additional searches when the saved eligibility response does not resolve coverage.</p><InsuranceDiscoveryPanel :client-id="clientId" :agency-id="agencyId" :service-date="serviceDate" :current-patient="draft?.patient" @use-policy="useDiscoveredPolicy" @saved="emit('saved')" /><CoordinationOfBenefitsPanel :client-id="clientId" :agency-id="agencyId" :service-date="serviceDate" :current-insurance="draft" @use-policy="useDiscoveredPolicy" @saved="emit('saved')" /></details>
     <details v-if="opened && canSeeBilling && !assignmentReview && showRelatedReviews"><summary>Supporting billing documents</summary><ClientDocumentationReadiness :client-id="clientId" :agency-id="agencyId" :service-date="serviceDate" @saved="emit('saved')" /></details>
    </div>
  </section>
</template>
<script setup>
import {automaticEligibilityNotice} from '../../utils/automaticEligibilityNotice.js';
import {ref,watch,computed,onBeforeUnmount,onMounted} from 'vue';
import { useAuthStore } from '../../store/auth';
import { canAccessMedicalBilling } from '../../config/medicalBillingAccess.js';
const authStore = useAuthStore();
const canSeeBilling = computed(() => canAccessMedicalBilling(authStore.user, props.agencyId));
import api from '../../services/api';
import InsurancePolicyFields from './InsurancePolicyFields.vue';
import ClientCoverageVerification from './ClientCoverageVerification.vue';
import ClientDocumentationReadiness from './ClientDocumentationReadiness.vue';
import InsuranceDiscoveryPanel from './InsuranceDiscoveryPanel.vue';
import CoordinationOfBenefitsPanel from './CoordinationOfBenefitsPanel.vue';
import EligibilityPolicyFindings from './EligibilityPolicyFindings.vue';
import {formatBillingDate} from '../../utils/billingReviewDisplay.js';
import { matchConfiguredPayer, withConfiguredPayer } from '../../navigation/paperInsuranceReview.js';
import {preparePacketDraft} from '../../navigation/paperInsuranceDraft.js';
import {medicaidMemberIdNeedsDiscovery} from '../../navigation/paperInsuranceReview.js';
import { paperInsuranceCompletionIssues } from '../../navigation/paperInsuranceCompletion.js';
const props=defineProps({clientId:[String,Number],agencyId:[String,Number],accountSupport:Boolean,assignmentReview:Boolean,startOpen:Boolean,paperEntry:Boolean,paperDocumentId:[String,Number],showRelatedReviews:{type:Boolean,default:true},serviceDate:String,profileLayout:Boolean});
const emit=defineEmits(['saved']);
const insurancePath=computed(()=>canSeeBilling.value?`/medical-billing/clients/${props.clientId}/insurance`:`/clients/${props.clientId}/account-support/insurance`);
const opened=ref(false),draft=ref(null),hasSecondary=ref(false),verified=ref(false),busy=ref(false),error=ref(''),notice=ref(''),issues=ref([]);
const paperFinalizedAt=ref(null),paperRequired=ref(false),paperSourceDocumentId=ref(null),paperOrderPrepared=ref(false),eligibilityStatus=ref(null),savedSnapshot=ref('');
const isPaper=computed(()=>props.paperEntry || paperRequired.value);
const activeSlots=computed(()=>hasSecondary.value?['primary','secondary']:['primary']);
const draftSnapshot=()=>JSON.stringify(canonical({primary:draft.value?.primary,secondary:hasSecondary.value?draft.value?.secondary:null,patient:draft.value?.patient,profileId:draft.value?.profileId,coverageSources:draft.value?.coverageSources}));
const draftDirty=computed(()=>!!draft.value&&draftSnapshot()!==savedSnapshot.value);
const needsChildLookup=policy=>medicaidMemberIdNeedsDiscovery(policy,draft.value?.patient);
function verificationLabel(slot){
 if(draftDirty.value)return 'Draft — not sent for verification';
 const row=eligibilityStatus.value?.policies?.find(item=>item.slot===slot);
 if(!row)return paperFinalizedAt.value?'Not checked':'Awaiting packet submission';
 if(row.status==='not_checked'&&eligibilityStatus.value?.jobStatus==='review_required')return 'Not checked — billing follow-up required';
 if(row.status==='needs_details')return `Not checked — needs ${(row.missingFields || []).join(', ')}`;
 return ({awaiting_review:'Awaiting packet submission',queued:'Eligibility check queued',not_checked:'Not checked',request_failed:'Request failed — no payer response saved',identity_mismatch:'Returned identity needs review',active_reported:'Active coverage reported — billing review remains',inactive_reported:'Inactive coverage reported',needs_review:'Payer response needs review'})[row.status] || 'Not checked';
}
const paperEntryIssues=computed(()=>draft.value?paperInsuranceCompletionIssues({...draft.value,secondary:hasSecondary.value?draft.value.secondary:null}):[]);
const patientFields=[{key:'firstName',label:'Legal first name'},{key:'lastName',label:'Legal last name'},{key:'dateOfBirth',label:'Date of birth',type:'date'},{key:'sex',label:'Sex on claim (M/F/U)'},{key:'addressLine1',label:'Address'},{key:'addressLine2',label:'Apartment/suite'},{key:'city',label:'City'},{key:'state',label:'State'},{key:'postalCode',label:'ZIP code'}];
const payers=ref([]),paperCoverage=ref(null);
const policies=ref([]),selectedSources=ref({primary:'',secondary:''}),demographics=ref({});
const eligibilityFindings=ref([]);
const insuranceFingerprint=ref(''),fieldSources=ref({}),insuranceLoading=ref(false),activePanel=ref('overview'),coveragePanel=ref(null);
const profilePanels=computed(()=>[{key:'overview',label:'Overview'},{key:'details',label:'Edit insurance'},...(canSeeBilling.value?[{key:'benefits',label:'Benefits & other coverage'},{key:'verification',label:'Verify coverage'}]:[])]);
const latestFinding=slot=>eligibilityFindings.value.find(f=>f.slot===slot&&(!props.serviceDate||String(f.serviceDate).slice(0,10)===props.serviceDate.slice(0,10)));
function coverageStatus(slot){
 if(!draft.value?.[slot]?.insurerName)return slot==='secondary'?'Secondary insurance has not been recorded.':'Primary insurance details are needed.';
 if(draftDirty.value)return 'Unsaved edits — coverage status needs review.';
 const f=latestFinding(slot);
 if(!f)return verificationLabel(slot).replace('Awaiting packet submission','No verification result saved');
 if(f.isCurrent!==true)return 'Insurance changed — earlier verification is historical.';
 if(f.status==='error')return 'Last check failed — review verification history.';
 if(f.identityMatches!==true)return 'Returned identity needs review.';
 return `${f.status==='active_reported'?'Active coverage reported':f.status==='inactive_reported'?'Inactive coverage reported':'Payer response needs review'} for ${formatBillingDate(f.serviceDate)}.`;
}
const nextAction=computed(()=>{
 if(draftDirty.value)return {panel:'details',label:'Review and save edits',message:'Your insurance edits have not been saved.'};
 const missing=activeSlots.value.some(slot=>!draft.value?.[slot]?.insurerName||!draft.value?.[slot]?.memberId||!draft.value?.[slot]?.payerId);
 if(missing)return {panel:'details',label:'Complete insurance details',message:'A saved policy is missing its insurer, member ID or payer route.'};
 if(!canSeeBilling.value)return {panel:'details',label:'Review insurance details',message:'Billing staff complete coverage verification and payer-order review.'};
 if(eligibilityFindings.value.some(f=>f.isCurrent===true&&f.otherCoverageReported))return {panel:'benefits',label:'Review other coverage',message:'A payer reported additional insurance. Confirm its details and billing order.'};
 return {panel:'verification',label:'Review coverage verification',message:'Check each recorded policy for the visit date, then resolve payer order and save the dated review.'};
});
const coverageChoices=computed(()=>policies.value.flatMap(policy=>['primary','secondary'].filter(slot=>policy[slot]).map(slot=>({key:`${policy.id}:${slot}`,profileId:policy.id,slot,coverage:policy[slot],label:`${policy.submittedBy} · ${policy[slot].insurerName || 'Policy'}${slot === 'secondary' ? ' (additional submitted policy)' : ''}`}))));
const evidenceSlots=policy=>Object.entries(policy.cardEvidence || {}).filter(([,present])=>present).map(([slot])=>slot);
function useDemographics(){if(!draft.value)return;for(const [key,value] of Object.entries(demographics.value))if(!draft.value.patient[key] && value)draft.value.patient[key]=value;verified.value=false;}
function useSubmittedPolicy(position){const policy=coverageChoices.value.find(p=>p.key===selectedSources.value[position]);draft.value.coverageSources ||= {};if(!policy){delete draft.value.coverageSources[position];if(position==='primary')draft.value.profileId=null;verified.value=false;return;}draft.value[position]={...policy.coverage};draft.value.coverageSources[position]={profileId:policy.profileId,slot:policy.slot};if(position==='primary')draft.value.profileId=policy.profileId;else hasSecondary.value=true;verified.value=false;}
function swapCoverage(){[draft.value.primary,draft.value.secondary]=[draft.value.secondary,draft.value.primary];draft.value.coverageSources ||= {};[draft.value.coverageSources.primary,draft.value.coverageSources.secondary]=[draft.value.coverageSources.secondary,draft.value.coverageSources.primary];[selectedSources.value.primary,selectedSources.value.secondary]=[selectedSources.value.secondary,selectedSources.value.primary];draft.value.profileId=draft.value.coverageSources.primary?.profileId || null;verified.value=false;}
function useDiscoveredPolicy({policy,slot}){
 if(!draft.value || !['primary','secondary'].includes(slot))return;
 const current=draft.value[slot] || {};
 if(current.memberId || current.payerId || current.insurerName){error.value='This position already contains coverage. Reconcile the existing policy before copying another policy into it.';return;}
 draft.value[slot]={...policy,payerId:'',eligibilityPayerId:''};
 if(slot==='secondary')hasSecondary.value=true;
 verified.value=false;error.value='';notice.value='Match copied into the insurance form. Confirm its Claim.MD payer ID, subscriber details and coverage dates, then save. Complete payer-order review before billing.';
}
// A loaded attestation survives an unchanged save. Any edit requires a fresh confirmation.
const canonical = value => value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!=='' && value[key]!=null).map(key=>[key,canonical(value[key])])) : value;
watch(()=>JSON.stringify(canonical({draft:draft.value,hasSecondary:hasSecondary.value})),()=>{verified.value=false;},{flush:'sync'});
let seq=0,pollTimer=null,pollCount=0;
function scheduleVerificationRefresh(){clearTimeout(pollTimer);if(pollCount++<20)pollTimer=setTimeout(()=>void refreshVerification(true),15000);}
function installSavedDraft(value){
 draft.value={profileId:value.profileId || null,coverageSources:structuredClone(value.coverageSources || {}),acceptAssignment:value.acceptAssignment ?? null,primary:{...(value.primary || {})},secondary:{...(value.secondary || {})},patient:{...(value.patient || {})}};
 hasSecondary.value=!!value.secondary;savedSnapshot.value=draftSnapshot();
}
async function load(){
 const n=++seq;clearTimeout(pollTimer);error.value='';notice.value='';insuranceLoading.value=true;
 try{
  const res=await api.get(insurancePath.value,{params:{agencyId:props.agencyId,...(props.paperDocumentId?{paperDocumentId:props.paperDocumentId}:{})},skipGlobalLoading:true});if(n!==seq)return;
  const data=res.data,v=data.insurance || {};insuranceFingerprint.value=data.insuranceFingerprint||'';fieldSources.value=v.eligibilityFieldSources||{};demographics.value=data.demographics || {};payers.value=data.payers || [];paperCoverage.value=data.paperCoverage || null;policies.value=data.policies || [];eligibilityFindings.value=data.eligibilityFindings || [];eligibilityStatus.value=data.eligibilityStatus || null;paperRequired.value=v.paperReviewRequired===true;paperSourceDocumentId.value=props.paperDocumentId || v.paperSourceDocumentId;paperFinalizedAt.value=v.paperFinalizedAt || null;
  selectedSources.value=Object.fromEntries(['primary','secondary'].map(slot=>[slot,v.coverageSources?.[slot]?`${v.coverageSources[slot].profileId}:${v.coverageSources[slot].slot}`:'']));
  installSavedDraft(v);const savedPatient=JSON.stringify(draft.value.patient);useDemographics();let paperAdded=false;
  if(isPaper.value){const prepared=preparePacketDraft(v,paperCoverage.value,payers.value,draft.value.patient);draft.value.primary=prepared.primary;draft.value.secondary=prepared.secondary || {};hasSecondary.value=!!prepared.secondary;paperOrderPrepared.value=prepared.reordered;if(prepared.reordered){draft.value.profileId=null;draft.value.coverageSources={};selectedSources.value={primary:'',secondary:''};}paperAdded=draftDirty.value;}
  else for(const slot of ['primary','secondary']){const policy=draft.value[slot],payer=matchConfiguredPayer(policy,payers.value);if(payer&&(!policy.payerId||!policy.eligibilityPayerId||!policy.payerCatalogId||payer.isMedicaid&&!policy.isMedicaid)){draft.value[slot]=withConfiguredPayer(policy,payer);paperAdded=true;}}
  verified.value=!paperAdded&&v.verifiedForClaims===true&&savedPatient===JSON.stringify(draft.value.patient);issues.value=data.missingClaimFields || [];opened.value=true;pollCount=0;
  if(['pending','processing'].includes(eligibilityStatus.value?.jobStatus))scheduleVerificationRefresh();
 }catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'Insurance could not be loaded';}finally{if(n===seq)insuranceLoading.value=false;}
}
async function refreshVerification(poll=false){
 if(!opened.value)return;const n=seq;
 try{const {data}=await api.get(insurancePath.value,{params:{agencyId:props.agencyId,...(paperSourceDocumentId.value?{paperDocumentId:paperSourceDocumentId.value}:{})},skipGlobalLoading:true});if(n!==seq)return;
  const unchanged=!draftDirty.value;eligibilityStatus.value=data.eligibilityStatus || null;eligibilityFindings.value=data.eligibilityFindings || [];if(unchanged&&data.insurance){installSavedDraft(data.insurance);insuranceFingerprint.value=data.insuranceFingerprint||'';fieldSources.value=data.insurance.eligibilityFieldSources||{};paperFinalizedAt.value=data.insurance.paperFinalizedAt || null;}
  if(['pending','processing'].includes(eligibilityStatus.value?.jobStatus))scheduleVerificationRefresh();
 }catch(e){if(n===seq&&!poll)error.value='Saved verification status could not refresh. Your edits are still here.';}
}
async function importSaved(finding,options={}){
 if(busy.value||!canSeeBilling.value)return;
 if(draftDirty.value){error.value='Save your current edits before importing verification details.';return;}
 let own=seq;busy.value=true;error.value='';notice.value='';
 try{
  const {data}=await api.post(`${insurancePath.value}/eligibility-import`,{agencyId:props.agencyId,checkId:finding.id,insuranceFingerprint:insuranceFingerprint.value,mode:'fill_missing',...options},{skipGlobalLoading:true});
  if(own!==seq)return;own++;await load();if(own!==seq)return;await coveragePanel.value?.refresh?.();if(own!==seq)return;
  notice.value=`${data.message} Source: Claim.MD check #${finding.id}.`;if(options.mode==='reported_coverage')activePanel.value='details';emit('saved');
 }catch(e){if(own===seq)error.value=e.response?.data?.error?.message||'Saved verification details could not be imported. Your insurance entries are preserved.';}
 finally{if(own===seq)busy.value=false;}
}
const importDetails=finding=>importSaved(finding);
const importReportedPolicy=({finding,candidateId,slot})=>importSaved(finding,{mode:'reported_coverage',candidateId,slot});
async function downloadEvidence(profileId,slot){const n=seq;error.value='';try{const res=await api.get(`/clients/${props.clientId}/insurance-card`,{params:{profileId,slot},responseType:'blob'});if(n!==seq)return;const url=URL.createObjectURL(res.data);const anchor=document.createElement('a');anchor.href=url;anchor.download=`insurance-${slot}.${res.data.type==='application/pdf'?'pdf':res.data.type==='image/png'?'png':'jpg'}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(n===seq)error.value='This card image could not be downloaded; it may not be on file.';}}

async function save(options={}){
 if(busy.value||!draft.value)return false;error.value='';notice.value='';
 const checkCoverage=isPaper.value && !props.paperEntry && canSeeBilling.value && !!paperFinalizedAt.value && options.checkCoverage===true;
 const missing=options.paperEntry===true?paperEntryIssues.value:[];
 busy.value=true;const n=seq,submittedVerification=verified.value;
 try{
  const res=await api.put(insurancePath.value,{agencyId:props.agencyId,primary:draft.value.primary,secondary:hasSecondary.value?draft.value.secondary:null,patient:draft.value.patient,profileId:draft.value.profileId,coverageSources:draft.value.coverageSources,...(isPaper.value?{paperDocumentId:Number(paperSourceDocumentId.value)||null,paperReviewConfirmed:false,checkCoverage}:{}),...(canSeeBilling.value?{verifiedForClaims:isPaper.value?false:verified.value,acceptAssignment:draft.value.acceptAssignment}:{})});if(n!==seq)return false;
  issues.value=res.data.missingClaimFields || [];if(res.data.insurance){installSavedDraft(res.data.insurance);fieldSources.value=res.data.insurance.eligibilityFieldSources||{};}else savedSnapshot.value=draftSnapshot();
  paperOrderPrepared.value=false;verified.value=res.data.insurance?.verifiedForClaims ?? submittedVerification;paperFinalizedAt.value=res.data.insurance?.paperFinalizedAt || null;if(isPaper.value && res.data.insurance && !res.data.insurance.paperReview)eligibilityStatus.value=null;
  notice.value=res.data.eligibilityQueueWarning || automaticEligibilityNotice(res.data.automaticEligibility, paperFinalizedAt.value) || (isPaper.value?'Draft saved. No new payer request was sent.':!canSeeBilling.value?'Insurance information saved for billing review.':issues.value.length?`Insurance saved. ${issues.value.length} missing claim fields still need review before submission.`:'Insurance saved. Claim submission still requires its readiness review and approval.');
  emit('saved',res.data);if(checkCoverage){pollCount=0;await refreshVerification();if(['queued','already_queued'].includes(res.data.automaticEligibility?.status))scheduleVerificationRefresh();}else if(props.profileLayout&&canSeeBilling.value&&!isPaper.value){await refreshVerification();await coveragePanel.value?.refresh?.();}
  return options.paperEntry===true?{saved:true,followUpRequired:missing.length>0}:true;
 }catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'Insurance could not be saved';return false;}finally{if(n===seq)busy.value=false;}
}

watch(()=>[props.agencyId,props.clientId,canSeeBilling.value,props.accountSupport,props.paperDocumentId],()=>{seq++;clearTimeout(pollTimer);paperFinalizedAt.value=null;paperRequired.value=false;eligibilityStatus.value=null;insuranceFingerprint.value='';fieldSources.value={};activePanel.value='overview';insuranceLoading.value=false;opened.value=false;draft.value=null;policies.value=[];eligibilityFindings.value=[];selectedSources.value={primary:'',secondary:''};error.value='';notice.value='';demographics.value={};payers.value=[];paperCoverage.value=null;busy.value=false;});
async function refreshPaperCoverage(){const n=seq;try{const {data}=await api.get(insurancePath.value,{params:{agencyId:props.agencyId,...(props.paperDocumentId?{paperDocumentId:props.paperDocumentId}:{})}});if(n===seq){paperCoverage.value=data.paperCoverage || null;notice.value='Packet reading refreshed. Compare the updated proposal with the PDF; your unsaved policy edits are still here.';}}catch(e){if(n===seq)error.value='Packet details could not refresh. Your policy edits are still here.';}}
defineExpose({ save, isOpen: opened, refreshPaperCoverage });
onBeforeUnmount(()=>{seq++;clearTimeout(pollTimer);});
onMounted(()=>{if(props.startOpen && (canSeeBilling.value || props.accountSupport))load();});
</script>
<style scoped>.client-insurance-editor {padding:16px;border:1px solid var(--border);border-radius:10px;margin:16px 0}.client-insurance-editor form {display:grid;gap:16px}.identity-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.identity-fields label{display:grid;gap:5px}input:not([type=checkbox]){padding:9px;border:1px solid var(--app-line, #94a3b8);border-radius:6px}p[role=alert]{color:var(--app-text-red, #b91c1c)}</style>

<style scoped>.paper-policy-slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.paper-policy-slots article{padding:10px;border:1px solid var(--border,#cad8df);border-radius:8px;overflow-wrap:anywhere}.paper-policy-slots p{margin:6px 0}.paper-policy-slots span{font-size:12px}.paper-policy-summary h5{margin:0 0 8px}details>summary{cursor:pointer;font-weight:600}.paper-coverage{padding:9px;border:1px solid var(--border,#d6dfe3);border-radius:7px}.insurance-identity .identity-fields{margin-top:10px}</style>

<style scoped>
.insurance-edit-fields{border:0;padding:0;margin:0;min-width:0}.insurance-sections{display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid var(--border,#dce5ed);padding-bottom:12px;margin:16px 0}.insurance-sections button,.next-action button{font:inherit;padding:10px 14px;border:1px solid var(--border,#bccbd9);border-radius:8px;background:var(--bg-primary,#fff);color:inherit;cursor:pointer}.insurance-sections [aria-pressed=true]{background:var(--primary,#245878);color:#fff;border-color:transparent}.coverage-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}.coverage-cards article,.next-action{border:1px solid var(--border,#dce5ed);padding:18px;border-radius:10px}.coverage-cards h5,.next-action h5{font-size:1rem;margin:0 0 8px}.coverage-cards p{margin:8px 0;line-height:1.5}.next-action{display:flex;align-items:center;justify-content:space-between;gap:16px;background:var(--bg-secondary,#f4f7fb);margin:16px 0}.next-action p{margin:0}summary{cursor:pointer;font-weight:600}@media(max-width:600px){.next-action{align-items:stretch;flex-direction:column}.insurance-sections button{flex:1 1 45%}}
</style>
