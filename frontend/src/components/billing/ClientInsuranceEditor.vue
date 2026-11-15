<template>
  <section v-if="canSeeBilling || accountSupport" class="client-insurance-editor">
    <h4>{{ isPaper ? 'Insurance transcription' : assignmentReview ? 'Edit saved insurance details' : canSeeBilling ? 'Insurance and claim identity' : 'Insurance information' }}</h4>
    <button v-if="!opened" class="btn btn-secondary" type="button" @click="load">Review private insurance details</button>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <form v-if="opened && draft" novalidate @submit.prevent="save">
      <p class="insurance-help">Save partial information at any time. Review details copied from Demographics against the insurance card.<template v-if="canSeeBilling"> Missing claim fields prevent submission, not saving.</template><template v-else> The billing team reviews coverage before preparing claims.</template></p>
      <section v-if="isPaper" class="paper-policy-summary" aria-label="Current paper insurance details">
        <h5>{{ draftDirty ? 'Insurance draft — not yet confirmed' : 'Saved insurance details' }}</h5>
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
        <button v-if="hasSecondary" type="button" class="btn btn-secondary" @click="swapCoverage">Swap primary and secondary</button>
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
      <details class="insurance-identity" :open="!isPaper"><summary>Client identity · {{ draft.patient.firstName }} {{ draft.patient.lastName }} · {{ draft.patient.dateOfBirth }}</summary><button type="button" class="btn btn-secondary" @click="useDemographics">Fill missing fields from Demographics</button><div class="identity-fields"><label v-for="field in patientFields" :key="field.key">{{ field.label }}<input v-model="draft.patient[field.key]" :type="field.type || 'text'" maxlength="255" /></label></div></details>
      <h5>Primary coverage</h5><InsurancePolicyFields :scope-key="`client:${clientId}:primary`" v-model="draft.primary" :payers="payers" :patient="draft.patient" :paper-entry="isPaper" :require-complete="false" />
      <label><input v-model="hasSecondary" type="checkbox" /> Secondary coverage</label><InsurancePolicyFields :scope-key="`client:${clientId}:secondary`" v-if="hasSecondary" v-model="draft.secondary" :payers="payers" :patient="draft.patient" :paper-entry="isPaper" :require-complete="false" />
      <section v-if="isPaper && paperEntryIssues.length" aria-label="Insurance details for staff follow-up">
        <p>Some insurance details need follow-up. Enter what is available; do not guess. Staff can look up the remaining information and billing must review coverage separately.</p>
        <ul><li v-for="issue in paperEntryIssues" :key="issue">{{ issue }}</li></ul>
        <label><input v-model="partialInformationConfirmed" type="checkbox" /> This is all the insurance information I have or know.</label>
      </section>
      <details v-if="canSeeBilling && eligibilityFindings.length" :open="!isPaper" aria-label="Information returned by insurers">
        <summary>{{ isPaper ? 'Earlier verification attempts' : 'Information returned by insurers' }} ({{ eligibilityFindings.length }})</summary>
        <p>Missing policy fields are filled when the returned identity matches. Reported other insurance stays here until its coverage and billing order are resolved. An insurer listed here is not automatically a secondary payer.</p>
        <details v-for="finding in eligibilityFindings" :key="finding.id" class="coverage-evidence">
          <summary>{{ finding.payerId || finding.slot }} · {{ finding.serviceDate?.slice(0,10) }} · {{ finding.status.replaceAll('_',' ') }}{{ finding.otherCoverageReported ? ' · Other insurance reported' : '' }}</summary>
          <p v-if="finding.response && finding.identityMatches === false" role="alert">Returned identity needs reconciliation before these details can update the policy.</p>
          <p v-else-if="finding.response && finding.identityMatches == null">The payer response did not confirm the complete client identity.</p>
          <ul v-if="finding.otherInsurers.length"><li v-for="(insurer,index) in finding.otherInsurers" :key="index">{{ insurer.entity_name || 'Other insurer reported without a name' }}</li></ul>
          <PayerResponseFields v-if="finding.response" :value="finding.response" />
          <p v-else>No payer response was saved. This attempt does not verify coverage.</p>
        </details>
      </details>
      <ul v-if="issues.length"><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul>
      <label v-if="canSeeBilling && !assignmentReview && !isPaper">Provider accepts assignment of insurance payment<select v-model="draft.acceptAssignment"><option :value="null">Select</option><option :value="true">Yes</option><option :value="false">No</option></select></label>
      <p v-if="canSeeBilling && !assignmentReview && !isPaper" class="insurance-review-state">{{ verified ? 'Insurance identity review is recorded for these details.' : 'Review the current details and check the confirmation below before saving them as verified.' }}</p>
      <label v-if="canSeeBilling && !assignmentReview && !isPaper"><input v-model="verified" type="checkbox" /> I reviewed this client’s identity and subscriber details against the policy and verified coverage for claim preparation.</label>
      <label v-if="isPaper" class="paper-transcription-confirmation"><input v-model="paperDetailsConfirmed" type="checkbox" /> I compared the transcribed carrier, member numbers, holders and primary/secondary order with the uploaded packet and corrected the available information.</label>
      <p v-if="isPaper">Saving a draft sends no payer request. Only confirmation of the transcription permits eligibility checks; it does not mark coverage verified.</p>
      <div><button class="btn btn-secondary" :disabled="busy">{{ busy ? 'Saving…' : isPaper ? 'Save draft' : 'Save insurance information' }}</button> <button v-if="isPaper" class="btn btn-primary" type="button" :disabled="busy || !paperDetailsConfirmed" @click="save({paperEntry:true,confirmPaper:true})">Confirm details &amp; check coverage</button> <button v-if="!paperEntry" class="btn btn-secondary" type="button" @click="opened=false;draft=null">Close private details</button></div>
    </form>
    <InsuranceDiscoveryPanel v-if="opened && canSeeBilling && !assignmentReview && [2,6,377].includes(Number(agencyId))" :client-id="clientId" :agency-id="agencyId" :service-date="serviceDate" :current-patient="draft?.patient" @use-policy="useDiscoveredPolicy" @saved="emit('saved')" />
    <CoordinationOfBenefitsPanel v-if="opened && canSeeBilling && !assignmentReview && [2,6,377].includes(Number(agencyId))" :client-id="clientId" :agency-id="agencyId" :service-date="serviceDate" :current-insurance="draft" @use-policy="useDiscoveredPolicy" @saved="emit('saved')" />
    <ClientCoverageVerification v-if="opened && canSeeBilling && !assignmentReview && showRelatedReviews" :client-id="clientId" :agency-id="agencyId" :service-date="serviceDate" @saved="load();emit('saved')" />
    <ClientDocumentationReadiness v-if="opened && canSeeBilling && !assignmentReview && showRelatedReviews" :client-id="clientId" :agency-id="agencyId" :service-date="serviceDate" @saved="emit('saved')" />
  </section>
</template>
<script setup>
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
import PayerResponseFields from './PayerResponseFields.vue';
import { matchConfiguredPayer, withConfiguredPayer } from '../../navigation/paperInsuranceReview.js';
import {preparePacketDraft} from '../../navigation/paperInsuranceDraft.js';
import {medicaidMemberIdNeedsDiscovery} from '../../navigation/paperInsuranceReview.js';
import { paperInsuranceCompletionIssues } from '../../navigation/paperInsuranceCompletion.js';
const props=defineProps({clientId:[String,Number],agencyId:[String,Number],accountSupport:Boolean,assignmentReview:Boolean,startOpen:Boolean,paperEntry:Boolean,paperDocumentId:[String,Number],showRelatedReviews:{type:Boolean,default:true},serviceDate:String,transcriptionConfirmed:Boolean});
const emit=defineEmits(['saved','update:transcriptionConfirmed']);
const insurancePath=computed(()=>canSeeBilling.value?`/medical-billing/clients/${props.clientId}/insurance`:`/clients/${props.clientId}/account-support/insurance`);
const opened=ref(false),draft=ref(null),hasSecondary=ref(false),verified=ref(false),busy=ref(false),error=ref(''),notice=ref(''),issues=ref([]);
const partialInformationConfirmed=ref(false),paperDetailsConfirmed=ref(false),paperRequired=ref(false),paperSourceDocumentId=ref(null),paperOrderPrepared=ref(false),eligibilityStatus=ref(null),savedSnapshot=ref('');
const isPaper=computed(()=>props.paperEntry || paperRequired.value);
const activeSlots=computed(()=>hasSecondary.value?['primary','secondary']:['primary']);
const draftSnapshot=()=>JSON.stringify(canonical({primary:draft.value?.primary,secondary:hasSecondary.value?draft.value?.secondary:null,patient:draft.value?.patient,profileId:draft.value?.profileId,coverageSources:draft.value?.coverageSources}));
const draftDirty=computed(()=>!!draft.value&&draftSnapshot()!==savedSnapshot.value);
const needsChildLookup=policy=>medicaidMemberIdNeedsDiscovery(policy,draft.value?.patient);
watch(paperDetailsConfirmed,value=>emit('update:transcriptionConfirmed',value),{flush:'sync'});
watch(()=>props.transcriptionConfirmed,value=>{if(value!==paperDetailsConfirmed.value)paperDetailsConfirmed.value=value;});
function verificationLabel(slot){
 if(draftDirty.value)return 'Draft — not sent for verification';
 const row=eligibilityStatus.value?.policies?.find(item=>item.slot===slot);
 if(!row)return paperDetailsConfirmed.value?'Not checked':'Awaiting transcription confirmation';
 if(row.status==='not_checked'&&eligibilityStatus.value?.jobStatus==='review_required')return 'Not checked — billing follow-up required';
 if(row.status==='needs_details')return `Not checked — needs ${(row.missingFields || []).join(', ')}`;
 return ({awaiting_review:'Awaiting transcription confirmation',queued:'Eligibility check queued',not_checked:'Not checked',request_failed:'Request failed — no payer response saved',identity_mismatch:'Returned identity needs review',active_reported:'Active coverage reported — billing review remains',inactive_reported:'Inactive coverage reported',needs_review:'Payer response needs review'})[row.status] || 'Not checked';
}
const paperEntryIssues=computed(()=>draft.value?paperInsuranceCompletionIssues({...draft.value,secondary:hasSecondary.value?draft.value.secondary:null}):[]);
const patientFields=[{key:'firstName',label:'Legal first name'},{key:'lastName',label:'Legal last name'},{key:'dateOfBirth',label:'Date of birth',type:'date'},{key:'sex',label:'Sex on claim (M/F/U)'},{key:'addressLine1',label:'Address'},{key:'addressLine2',label:'Apartment/suite'},{key:'city',label:'City'},{key:'state',label:'State'},{key:'postalCode',label:'ZIP code'}];
const payers=ref([]),paperCoverage=ref(null);
const policies=ref([]),selectedSources=ref({primary:'',secondary:''}),demographics=ref({});
const eligibilityFindings=ref([]);
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
watch(()=>JSON.stringify(canonical({draft:draft.value,hasSecondary:hasSecondary.value})),()=>{verified.value=false;partialInformationConfirmed.value=false;paperDetailsConfirmed.value=false;},{flush:'sync'});
let seq=0,pollTimer=null,pollCount=0;
function scheduleVerificationRefresh(){clearTimeout(pollTimer);if(pollCount++<20)pollTimer=setTimeout(()=>void refreshVerification(true),15000);}
function installSavedDraft(value){
 draft.value={profileId:value.profileId || null,coverageSources:structuredClone(value.coverageSources || {}),acceptAssignment:value.acceptAssignment ?? null,primary:{...(value.primary || {})},secondary:{...(value.secondary || {})},patient:{...(value.patient || {})}};
 hasSecondary.value=!!value.secondary;savedSnapshot.value=draftSnapshot();
}
async function load(){
 const n=++seq;clearTimeout(pollTimer);error.value='';notice.value='';
 try{
  const res=await api.get(insurancePath.value,{params:{agencyId:props.agencyId,...(props.paperDocumentId?{paperDocumentId:props.paperDocumentId}:{})}});if(n!==seq)return;
  const data=res.data,v=data.insurance || {};demographics.value=data.demographics || {};payers.value=data.payers || [];paperCoverage.value=data.paperCoverage || null;policies.value=data.policies || [];eligibilityFindings.value=data.eligibilityFindings || [];eligibilityStatus.value=data.eligibilityStatus || null;paperRequired.value=v.paperReviewRequired===true;paperSourceDocumentId.value=props.paperDocumentId || v.paperSourceDocumentId;
  selectedSources.value=Object.fromEntries(['primary','secondary'].map(slot=>[slot,v.coverageSources?.[slot]?`${v.coverageSources[slot].profileId}:${v.coverageSources[slot].slot}`:'']));
  installSavedDraft(v);const savedPatient=JSON.stringify(draft.value.patient);useDemographics();let paperAdded=false;
  if(isPaper.value){const prepared=preparePacketDraft(v,paperCoverage.value,payers.value,draft.value.patient);draft.value.primary=prepared.primary;draft.value.secondary=prepared.secondary || {};hasSecondary.value=!!prepared.secondary;paperOrderPrepared.value=prepared.reordered;if(prepared.reordered){draft.value.profileId=null;draft.value.coverageSources={};selectedSources.value={primary:'',secondary:''};}paperAdded=draftDirty.value;}
  else for(const slot of ['primary','secondary']){const policy=draft.value[slot],payer=matchConfiguredPayer(policy,payers.value);if(payer&&(!policy.payerId||!policy.eligibilityPayerId)){draft.value[slot]=withConfiguredPayer(policy,payer);paperAdded=true;}}
  verified.value=!paperAdded&&v.verifiedForClaims===true&&savedPatient===JSON.stringify(draft.value.patient);paperDetailsConfirmed.value=!draftDirty.value&&data.eligibilityStatus?.reviewed===true;issues.value=data.missingClaimFields || [];opened.value=true;pollCount=0;
  if(['pending','processing'].includes(eligibilityStatus.value?.jobStatus))scheduleVerificationRefresh();
 }catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'Insurance could not be loaded';}
}
async function refreshVerification(poll=false){
 if(!opened.value||!isPaper.value)return;const n=seq;
 try{const {data}=await api.get(insurancePath.value,{params:{agencyId:props.agencyId,...(paperSourceDocumentId.value?{paperDocumentId:paperSourceDocumentId.value}:{})},skipGlobalLoading:true});if(n!==seq)return;
  const unchanged=!draftDirty.value;eligibilityStatus.value=data.eligibilityStatus || null;eligibilityFindings.value=data.eligibilityFindings || [];if(unchanged&&data.insurance){installSavedDraft(data.insurance);paperDetailsConfirmed.value=data.eligibilityStatus?.reviewed===true;}
  if(['pending','processing'].includes(eligibilityStatus.value?.jobStatus))scheduleVerificationRefresh();
 }catch(e){if(n===seq&&!poll)error.value='Saved verification status could not refresh. Your edits are still here.';}
}
async function downloadEvidence(profileId,slot){const n=seq;error.value='';try{const res=await api.get(`/clients/${props.clientId}/insurance-card`,{params:{profileId,slot},responseType:'blob'});if(n!==seq)return;const url=URL.createObjectURL(res.data);const anchor=document.createElement('a');anchor.href=url;anchor.download=`insurance-${slot}.${res.data.type==='application/pdf'?'pdf':res.data.type==='image/png'?'png':'jpg'}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(n===seq)error.value='This card image could not be downloaded; it may not be on file.';}}
function automaticEligibilityNotice(value){
 if(!value)return '';
 if(value.status==='awaiting_paper_review')return 'Draft saved. No payer request was sent. Confirm the transcription against the uploaded packet before checking coverage.';
 if(value.status==='already_checked')return 'Insurance saved. These confirmed details already have a completed check; review the saved result below.';
 if(value.status==='review_required')return 'Insurance saved. An earlier attempt for these details needs billing review. No automatic repeat request was sent.';
 const missing=(value.missing||[]).map(item=>`${item.slot === 'secondary' ? 'Secondary' : 'Primary'}: ${item.message}`).join(' ');
 if(value.status==='queued')return `Insurance saved. Automatic eligibility is queued and normally runs within five minutes.${missing ? ` ${missing}` : ''}`;
 if(value.status==='already_queued')return 'Insurance saved. These details already have an automatic eligibility request. Review verification history for its result.';
 if(value.status==='waiting_for_information')return `Insurance saved. Automatic eligibility is waiting for required information. ${missing}`;
 if(value.status==='disabled')return 'Insurance saved. Automatic eligibility needs company billing setup; an urgent billing follow-up has been requested.';
 return '';
}
async function save(options={}){
 if(busy.value||!draft.value)return false;error.value='';notice.value='';
 const confirmPaper=isPaper.value&&options.confirmPaper===true;
 if(confirmPaper&&!paperDetailsConfirmed.value){error.value='Compare the transcribed insurance with the uploaded packet and confirm it before requesting eligibility.';return false;}
 const missing=options.paperEntry===true?paperEntryIssues.value:[];
 if(missing.length&&!partialInformationConfirmed.value){error.value=missing.join(' ')+' Enter the available details, or confirm “This is all the insurance information I have or know” to continue with staff lookup and billing review pending.';return false;}
 const confirmedPartial=missing.length>0&&partialInformationConfirmed.value;busy.value=true;const n=seq,submittedVerification=verified.value;
 try{
  const res=await api.put(insurancePath.value,{agencyId:props.agencyId,primary:draft.value.primary,secondary:hasSecondary.value?draft.value.secondary:null,patient:draft.value.patient,profileId:draft.value.profileId,coverageSources:draft.value.coverageSources,...(isPaper.value?{paperDocumentId:Number(paperSourceDocumentId.value)||null,paperReviewConfirmed:confirmPaper}:{}),...(canSeeBilling.value?{verifiedForClaims:isPaper.value?false:verified.value,acceptAssignment:draft.value.acceptAssignment}:{})});if(n!==seq)return false;
  issues.value=res.data.missingClaimFields || [];if(res.data.insurance)installSavedDraft(res.data.insurance);else savedSnapshot.value=draftSnapshot();
  paperOrderPrepared.value=false;verified.value=res.data.insurance?.verifiedForClaims ?? submittedVerification;paperDetailsConfirmed.value=confirmPaper || !!res.data.insurance?.paperReview;
  notice.value=res.data.eligibilityQueueWarning || automaticEligibilityNotice(res.data.automaticEligibility) || (isPaper.value?'Draft saved. No new payer request was sent.':!canSeeBilling.value?'Insurance information saved for billing review.':issues.value.length?`Insurance saved. ${issues.value.length} missing claim fields still need review before submission.`:'Insurance saved. Claim submission still requires its readiness review and approval.');
  emit('saved',res.data);if(isPaper.value&&confirmPaper){pollCount=0;await refreshVerification();if(['queued','already_queued'].includes(res.data.automaticEligibility?.status))scheduleVerificationRefresh();}
  return options.paperEntry===true?{saved:true,partialInformationConfirmed:confirmedPartial}:true;
 }catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'Insurance could not be saved';return false;}finally{if(n===seq)busy.value=false;}
}

watch(()=>[props.agencyId,props.clientId,canSeeBilling.value,props.accountSupport,props.paperDocumentId],()=>{seq++;clearTimeout(pollTimer);paperDetailsConfirmed.value=false;paperRequired.value=false;eligibilityStatus.value=null;opened.value=false;draft.value=null;policies.value=[];eligibilityFindings.value=[];selectedSources.value={primary:'',secondary:''};error.value='';notice.value='';demographics.value={};payers.value=[];paperCoverage.value=null;busy.value=false;});
async function refreshPaperCoverage(){const n=seq;try{const {data}=await api.get(insurancePath.value,{params:{agencyId:props.agencyId,...(props.paperDocumentId?{paperDocumentId:props.paperDocumentId}:{})}});if(n===seq){paperCoverage.value=data.paperCoverage || null;notice.value='Packet reading refreshed. Compare the updated proposal with the PDF; your unsaved policy edits are still here.';}}catch(e){if(n===seq)error.value='Packet details could not refresh. Your policy edits are still here.';}}
defineExpose({ save, isOpen: opened, refreshPaperCoverage, transcriptionConfirmed:paperDetailsConfirmed });
onBeforeUnmount(()=>{seq++;clearTimeout(pollTimer);});
onMounted(()=>{if(props.startOpen && (canSeeBilling.value || props.accountSupport))load();});
</script>
<style scoped>.client-insurance-editor {padding:16px;border:1px solid var(--border);border-radius:10px;margin:16px 0}.client-insurance-editor form {display:grid;gap:16px}.identity-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.identity-fields label{display:grid;gap:5px}input:not([type=checkbox]){padding:9px;border:1px solid var(--app-line, #94a3b8);border-radius:6px}p[role=alert]{color:var(--app-text-red, #b91c1c)}</style>

<style scoped>.paper-policy-slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.paper-policy-slots article{padding:10px;border:1px solid var(--border,#cad8df);border-radius:8px;overflow-wrap:anywhere}.paper-policy-slots p{margin:6px 0}.paper-policy-slots span{font-size:12px}.paper-policy-summary h5{margin:0 0 8px}.paper-transcription-confirmation{display:flex;gap:8px;align-items:flex-start}.paper-transcription-confirmation input{margin-top:4px}details>summary{cursor:pointer;font-weight:600}.paper-coverage{padding:9px;border:1px solid var(--border,#d6dfe3);border-radius:7px}.insurance-identity .identity-fields{margin-top:10px}</style>
