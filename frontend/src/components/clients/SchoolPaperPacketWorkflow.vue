<template>
  <section class="paper-workflow" aria-label="Process school paper packet">
    <header class="paper-header"><div><h3>Process school paper packet</h3><p>Compare each step with the uploaded packet. Existing paper signatures stay on file.</p></div><button type="button" class="btn btn-secondary" :disabled="busy" @click="closeWorkflow">Close</button></header>
    <p v-if="error" ref="validationMessage" tabindex="-1" class="error" role="alert">{{ error }}</p>
    <p v-if="draftMessage" role="status" class="paper-draft-status">{{ draftMessage }}</p>
    <p v-if="loading" role="status">Loading packet and saved information…</p>
    <div v-else-if="context" class="paper-columns">
      <div class="paper-entry">
        <nav aria-label="Packet processing steps"><button v-for="(label, index) in labels" :key="label" type="button" :aria-current="stage === index ? 'step' : undefined" :disabled="busy || index > furthest" :title="index > furthest ? 'Save the preceding step before opening this step.' : label" @click="stage=index">{{ index + 1 }}. {{ label }}</button></nav>
        <p class="muted">Steps open in order after Save and continue. Missing information stays pending for follow-up; moving between saved steps does not change the packet.</p>
        <template v-if="state.processedAt && stage === 6">
          <h4>Paper packet processed</h4><p>The uploaded ROI and disclosure remain the signature evidence.</p>
          <ul><li v-for="(delivery, id) in state.invitations" :key="id">{{ guardianLabel(id) }}: <strong>{{ delivery.status }}</strong><span v-if="delivery.reason"> — {{ delivery.reason }}</span><span v-if="delivery.communicationId"> · Delivery record {{ delivery.communicationId }}</span><span v-if="delivery.attemptedAt"> · {{ new Date(delivery.attemptedAt).toLocaleString() }}</span><span v-if="delivery.status === 'redirected'"> · Sent to the configured test destination; guardian inbox receipt is not confirmed.</span></li></ul>
          <button v-if="hasFailedInvitation" type="button" class="btn btn-primary" :disabled="busy" @click="finish">Retry failed invitations</button>
          <p>Provider assignment and service readiness continue in Client actions.</p>
        </template>
        <div v-else>
          <h4>{{ stage + 1 }}. {{ labels[stage] }}</h4>
          <p v-if="state.processedAt">Saved information · read only</p>
          <fieldset ref="stepFields" :disabled="busy || !!state.processedAt">
            <template v-if="stage === 0">
              <p>Confirm the child’s identity against the source PDF. Required fields need a value before continuing; OCR may leave fields blank when it cannot read them reliably. Apartment/unit and other unprinted optional details may stay blank.</p>
              <div class="paper-fields"><label>Client first name<input v-model="demographics.firstName" required maxlength="255" /></label><label>Client last name<input v-model="demographics.lastName" required maxlength="255" /></label>
              <label>Date of birth<input v-model="demographics.dateOfBirth" required type="date" /></label><label>Sex<select v-model="demographics.gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></label>
              <label>Grade<input v-model="demographics.grade" maxlength="40" /></label><label>Preferred language<input v-model="demographics.preferred_language" maxlength="100" /></label>
              <label v-for="field in addressFields" :key="field.key">{{ field.label }}<input v-if="field.key === 'address_street'" v-address-autocomplete="{ model: demographics, fields: { street: 'address_street', city: 'address_city', state: 'address_state', postalCode: 'address_zip' }, locale: 'en', scopeKey: clientId }" v-model="demographics[field.key]" autocomplete="street-address" maxlength="255" /><input v-else v-model="demographics[field.key]" maxlength="255" /></label></div>
            </template>
            <template v-else-if="stage === 1 || stage === 2">
              <p>Use this parent’s own email for their portal invitation.</p>
              <label v-if="stage === 2" class="paper-check"><input v-model="secondNotListed" type="checkbox" /> No second parent or guardian is listed on this packet</label>
              <div v-if="stage === 1 || !secondNotListed" class="paper-fields">
                <label v-if="context.guardians.length" class="paper-wide">Existing linked contact<select :value="guardianForms[stage-1].id || ''" @change="selectGuardian(stage-1,$event.target.value)"><option value="">Enter a parent or guardian</option><option v-for="g in context.guardians" :key="g.guardian_user_id" :value="g.guardian_user_id">{{ [g.first_name,g.last_name].filter(Boolean).join(' ') }} · {{ g.email }}</option></select></label>
                <label>First name<input v-model="guardianForms[stage-1].firstName" :readonly="!!guardianForms[stage-1].id" required maxlength="255" /></label><label>Last name<input v-model="guardianForms[stage-1].lastName" :readonly="!!guardianForms[stage-1].id" required maxlength="255" /></label>
                <label>Email<input v-model="guardianForms[stage-1].email" :readonly="!!guardianForms[stage-1].id" required type="email" maxlength="255" /></label><label>Phone<input v-model="guardianForms[stage-1].phone" :readonly="!!guardianForms[stage-1].id" type="tel" maxlength="30" /></label>
                <label class="paper-wide">Relationship to client<input v-model="guardianForms[stage-1].relationshipTitle" required maxlength="100" /></label>
              </div>
              <p v-if="guardianForms[stage-1]?.id">This is an existing portal account. Its identity stays unchanged; contact changes can be made in the client profile.</p>
              <p>If an email is missing from the paper, leave this step pending while the support team obtains it. An invitation cannot be delivered without an email.</p>
            </template>
            <template v-else-if="stage === 3">
              <p><strong>School:</strong> {{ context.schoolName }}</p><label class="paper-check"><input v-model="schoolConfirmed" type="checkbox" required /> This is the school shown on the packet</label>
              <label>Does the packet indicate shared custody or healthcare decision-making rights?<select v-model="sharedCustody" required><option value="">Select the answer on paper</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Not clear — support follow-up needed</option></select></label>
            </template>
            <template v-else-if="stage === 4">
              <p>Insurance policy changes are saved with Save and continue or Save insurance information. They are not included in the automatic working draft.</p>
              <label>Insurance / payment category<select v-model="insuranceTypeId" required><option value="">Select the category on paper</option><option v-for="type in insuranceTypes" :key="type.id" :value="String(type.id)">{{ type.label }}</option></select></label>
              <ClientInsuranceEditor ref="insuranceEditor" v-if="insuranceTypeId && !selfPay" :client-id="clientId" :agency-id="context.client.agency_id" account-support assignment-review start-open :show-related-reviews="false" />
              <button v-if="insuranceTypeId && !selfPay" type="button" class="btn btn-secondary" @click="showVerification=!showVerification">{{ showVerification ? 'Close verification' : 'Verify insurance (optional)' }}</button>
              <AssignmentCoverageReview v-if="showVerification && !selfPay" :client-id="Number(clientId)" :agency-id="Number(context.client.agency_id)" />
              <p v-if="selfPay">Self-pay is recorded for billing follow-up. Do not enter a payment-card number from the paper packet.</p>
              <label class="paper-check"><input v-model="insuranceReviewed" type="checkbox" required /> I reviewed the coverage on paper and saved the available primary and secondary policy details, or selected self-pay.</label>
            </template>
            <template v-else-if="stage === 5">
              <p><strong>{{ context.client.full_name }}</strong> · {{ context.schoolName }}</p>
              <p>Parent 1: {{ guardianLabel(state.guardian1Id) }}<br />Parent 2: {{ state.guardian2Id ? guardianLabel(state.guardian2Id) : 'Not listed' }}</p>
              <p v-if="!packetMatched" class="error">The uploaded ROI/disclosure match still needs review. The signed paper remains on file; no new signatures are requested.</p>
              <p v-else>The uploaded packet was matched as version {{ context.packetRead.versionLabel }}. Review the existing staff selections against the paper.</p>
              <section v-if="needsHumanReview && !state.processedAt" class="paper-human-review" aria-label="Confirm paper evidence">
                <h5>Confirm the evidence on this uploaded packet</h5>
                <p>Review the PDF beside this form and record what is actually printed. This records your review; it does not add a signature or change Vision’s result. Missing or uncertain evidence stays pending.</p>
                <label>Printed packet version<input v-model="humanEvidence.versionLabel" required maxlength="60" placeholder="Version printed on this packet" /></label>
                <label>Packet language<select v-model="humanEvidence.locale"><option value="en">English</option><option value="es">Spanish</option></select></label>
                <div v-for="kind in ['roi','disclosure']" :key="kind" class="paper-signature-evidence">
                  <h5>{{ kind === 'roi' ? 'School ROI signature' : 'Disclosure signature' }}</h5>
                  <label>Signature on this paper<select v-model="humanEvidence[kind].status" required><option value="">Select after review</option><option value="present">Present and readable</option><option value="missing">Missing — leave pending</option><option value="uncertain">Uncertain — leave pending</option></select></label>
                  <template v-if="humanEvidence[kind].status === 'present'"><label>Printed signer name<input v-model="humanEvidence[kind].signerName" required maxlength="255" /></label><label>Signed date on paper<input v-model="humanEvidence[kind].signedDate" required type="date" /></label><label>PDF page containing this signature<input v-model.number="humanEvidence[kind].page" required type="number" min="1" max="100" /></label></template>
                </div>
                <p v-if="humanEvidence.roi.signedDate">The paper ROI signed date starts its term. Saving this reviewed step records that calendar date; the signed PDF stays unchanged.</p>
                <label class="paper-check"><input v-model="humanEvidence.sourceViewed" type="checkbox" required :disabled="!packetRendered || packetLoading" /> I viewed this child’s selected source PDF and checked its printed version and both signatures.</label>
                <label class="paper-check"><input v-model="humanEvidence.denyReviewed" type="checkbox" required /> I checked every DENY mark and matched each staff selection below to the paper. Unclear marks need follow-up.</label>
              </section>
              <ClientOnboardingRoiStaffPanel v-if="!state.processedAt" ref="roiEditor" :client-id="clientId" :step-done="false" :review-only="true" defer-changes @updated="refreshPacketRead" />
              <label class="paper-check"><input v-model="staffRoiConfirmed" type="checkbox" required /> I confirmed each matched staff member’s relationship and ROI selection against the paper, and saved any corrections.</label>
              <label class="paper-check"><input v-model="signaturesConfirmed" type="checkbox" required /> I confirmed the existing signatures on the paper ROI and disclosure.</label>
              <p v-if="state.processedAt">The paper consent review was saved. The existing paper remains the signature evidence.</p>
              <p>Finishing establishes the portal and sends a separate invitation to each listed parent. It does not collect new signatures or send one parent’s private answers to the other.</p>
            </template>
            <template v-else><p><strong>{{ context.client.full_name }}</strong> · {{ context.schoolName }}</p><p>Source: {{ selectedDocument?.original_name || 'Uploaded packet' }} · Version {{ state.consentReview?.versionLabel || context.packetRead?.versionLabel || 'Not identified' }}</p><ul><li v-for="id in [state.guardian1Id,state.guardian2Id].filter(Boolean)" :key="id">{{ guardianLabel(id) }} · {{ guardianContact(id) }} — own portal invitation</li></ul><p>Shared custody: {{ state.sharedCustody }}. Insurance: {{ insuranceTypes.find(type => Number(type.id) === Number(insuranceTypeId))?.label || 'Review required' }}.</p><template v-if="state.consentReview?.kind === 'human_source_review'"><p v-for="kind in ['roi','disclosure']" :key="kind">{{ kind === 'roi' ? 'ROI' : 'Disclosure' }}: {{ state.consentReview[kind].signerName }} · {{ state.consentReview[kind].signedDate }} · PDF page {{ state.consentReview[kind].page }}</p></template><ul v-if="state.consentReview?.staffSelections"><li v-for="staff in state.consentReview.staffSelections" :key="staff.schoolStaffUserId">{{ staff.name || `Staff #${staff.schoolStaffUserId}` }}: {{ staff.state }}</li></ul><p>Paper consents and release selections were reviewed. Finish sends each listed parent their own portal invitation.</p></template>
          </fieldset>
          <div v-if="!state.processedAt" class="paper-actions"><button v-if="stage > 0" type="button" class="btn btn-secondary" :disabled="busy" @click="stage--">Back</button><button type="button" class="btn btn-primary" :disabled="busy || (stage === 6 && !packetMatched)" @click="next">{{ busy ? 'Saving…' : stage === 6 ? 'Finish and send portal invitations' : 'Save and continue' }}</button></div>
        </div>
      </div>
      <aside class="paper-source" aria-label="Uploaded paper packet">
        <p class="paper-source-identity">Client #{{ clientId }}<template v-if="documentId"> · Document #{{ documentId }}</template><template v-if="context.packetRead?.id"> · Evaluation #{{ context.packetRead.id }}</template></p>
        <details v-if="state.previousPackets?.length"><summary>Previous packet reviews retained</summary><ul><li v-for="(previous,index) in state.previousPackets" :key="`${previous.documentId}-${index}`">Document #{{ previous.documentId }}<template v-if="previous.consentReview?.versionLabel"> · Version {{ previous.consentReview.versionLabel }}</template><template v-if="previous.processedAt"> · Processed {{ new Date(previous.processedAt).toLocaleString() }}</template><template v-else> · Earlier review retained</template></li></ul><p>Earlier source and invitation history remain on file. The current source still needs its own review.</p></details>
        <label>Uploaded packet<select v-model="documentId" :disabled="busy || !!state.processedAt" @change="changePacket"><option value="">Select the uploaded packet</option><option v-for="doc in documents" :key="doc.id" :value="String(doc.id)">{{ doc.document_title || doc.original_name || 'Paper packet' }}{{ doc.scan_status === 'clean' ? '' : ' — file check pending' }}</option></select></label>
        <button v-if="documentId" type="button" class="btn btn-secondary" :disabled="busy || checkingFile || fileCheckQueued || !!state.processedAt || (selectedDocument?.scan_status === 'clean' && !!context.packetRead)" @click="checkFile">{{ checkingFile ? 'Checking…' : 'Check file and read packet' }}</button><p v-if="fileCheckMessage" role="status">{{ fileCheckMessage }}</p>
        <div v-if="context.packetRead && Number(context.packetRead.documentId) === Number(documentId)" class="packet-evidence"><p>Packet version: {{ context.packetRead.versionLabel || 'Not identified' }}. ROI signature: {{ context.packetRead.roiSignatureDetected ? 'Detected' : 'Needs review' }}. Disclosure signature: {{ context.packetRead.disclosureSignatureDetected ? 'Detected' : 'Needs review' }}.</p><ul v-if="context.packetRead.reviewReasons?.length"><li v-for="reason in context.packetRead.reviewReasons" :key="reason">{{ reviewReasonLabel(reason) }}</li></ul></div>
        <p v-if="packetLoading" role="status">Opening packet…</p><p v-if="packetError" class="error">{{ packetError }}</p>
        <PDFPreview v-if="packetUrl" :key="packetUrl" :pdf-url="packetUrl" @loaded="packetRendered=true" />
        <p v-else-if="!packetLoading && selectedDocument && selectedDocument.scan_status !== 'clean'">The preview becomes available after the private file check passes.</p>
        <p v-else-if="!packetLoading">Select a packet to compare it with the fields on the left.</p>
        <button v-if="fileCheckQueued" class="btn btn-secondary" type="button" :disabled="checkingFile" @click="refreshFileCheck">Refresh file-check status</button>
      </aside>
    </div>
  </section>
</template>
<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import PDFPreview from '../documents/PDFPreview.vue';
import ClientInsuranceEditor from '../billing/ClientInsuranceEditor.vue';
import AssignmentCoverageReview from '../billing/AssignmentCoverageReview.vue';
import ClientOnboardingRoiStaffPanel from './ClientOnboardingRoiStaffPanel.vue';
const props=defineProps({clientId:{type:[Number,String],required:true}});
const emit=defineEmits(['close','processed']);
const labels=['Client demographics','Parent 1 portal account','Parent 2 portal account','School and custody','Insurance','Paper consents and release','Review'];
const keys=['demographics','guardian1','guardian2','school','insurance','consents'];
const context=ref(null), state=ref({completedSteps:[],invitations:{}}), stage=ref(0), loading=ref(true),busy=ref(false),error=ref('');
const stepFields=ref(null), validationMessage=ref(null), insuranceEditor=ref(null), roiEditor=ref(null);
const checkingFile=ref(false),fileCheckMessage=ref(''),fileCheckQueued=ref(false);
const selectedDocument=computed(()=>documents.value.find(d=>Number(d.id)===Number(documentId.value)));
const reviewReasonLabel=reason=>String(reason||'').replaceAll('_',' ');
const documents=ref([]),documentId=ref(''),packetUrl=ref(''),packetLoading=ref(false),packetError=ref(''),packetRendered=ref(false);
const demographics=reactive({}),guardianForms=reactive([{},{}]),secondNotListed=ref(false),schoolConfirmed=ref(false),sharedCustody=ref('');
const insuranceTypes=ref([]),insuranceTypeId=ref(''),insuranceReviewed=ref(false),showVerification=ref(false),signaturesConfirmed=ref(false),staffRoiConfirmed=ref(false);
const blankEvidence=()=>({versionLabel:'',locale:'en',sourceViewed:false,denyReviewed:false,roi:{status:'',signerName:'',signedDate:'',page:1},disclosure:{status:'',signerName:'',signedDate:'',page:1}});
const humanEvidence=reactive(blankEvidence());
const draftMessage=ref('');let hydrated=false,draftDirty=false,draftSaving=false,draftTimer=null,draftQueue=Promise.resolve(),draftGeneration=0,disposed=false,contextGeneration=0;
const addressFields=[{key:'address_street',label:'Street address'},{key:'address_apt',label:'Apartment / unit'},{key:'address_city',label:'City'},{key:'address_state',label:'State'},{key:'address_zip',label:'ZIP code'}];
const endpoint=computed(()=>`/clients/${props.clientId}/paper-packet-processing`);
const furthest=computed(()=>{const i=keys.findIndex(key=>!(state.value.completedSteps||[]).includes(key));return state.value.processedAt?6:i<0?6:i;});
const selfPay=computed(()=>/self[\s_-]*pay/i.test(insuranceTypes.value.find(t=>Number(t.id)===Number(insuranceTypeId.value))?.insurance_key || insuranceTypes.value.find(t=>Number(t.id)===Number(insuranceTypeId.value))?.label || ''));
const packetMatched=computed(()=>{
 const read=context.value?.packetRead,review=state.value.consentReview;
 if(review?.kind==='human_source_review' && Number(review.documentId)===Number(documentId.value) && Number(review.evaluationId)===Number(read?.id))return true;
 const reviewedReplacement=read?.status==='needs_review' && read.reviewReasons?.length===1 && read.reviewReasons[0]==='replacement_packet_requires_review';
 return (read?.status==='applied'||reviewedReplacement) && Number(read.documentId)===Number(documentId.value) && read.roiSignatureDetected && read.disclosureSignatureDetected;
});
const needsHumanReview=computed(()=>!state.value.processedAt);
const hasFailedInvitation=computed(()=>Object.values(state.value.invitations||{}).some(d=>['failed','blocked'].includes(d.status)));
function guardianLabel(id){const g=context.value?.guardians.find(g=>Number(g.guardian_user_id)===Number(id));return g?[g.first_name,g.last_name].filter(Boolean).join(' '):'Not connected';}
function guardianContact(id){const g=context.value?.guardians.find(g=>Number(g.guardian_user_id)===Number(id));return g?[g.email,g.phone_number,g.relationship_title].filter(Boolean).join(' · '):'Contact unavailable';}
function selectGuardian(index,id){const g=context.value.guardians.find(g=>Number(g.guardian_user_id)===Number(id));guardianForms[index]=g?{id:g.guardian_user_id,firstName:g.first_name,lastName:g.last_name,email:g.email,phone:g.phone_number||'',relationshipTitle:g.relationship_title||'Parent / guardian'}:{firstName:'',lastName:'',email:'',phone:'',relationshipTitle:''};}
async function changePacket(){clearTimeout(draftTimer);draftGeneration++;draftDirty=false;fileCheckQueued.value=false;stage.value=0;signaturesConfirmed.value=false;staffRoiConfirmed.value=false;Object.assign(humanEvidence,blankEvidence());await viewPacket();}
let viewGeneration=0;
let packetObjectUrl='';
function releasePacket(){packetRendered.value=false;if(packetObjectUrl)URL.revokeObjectURL(packetObjectUrl);packetObjectUrl='';packetUrl.value='';}
onBeforeUnmount(()=>{contextGeneration++;if(draftDirty&&!state.value.processedAt)void saveWorkingDraft();disposed=true;viewGeneration++;draftGeneration++;clearTimeout(draftTimer);window.removeEventListener('beforeunload',warnUnsaved);releasePacket();});
async function viewPacket(){
  const n=++viewGeneration;releasePacket();packetError.value='';packetLoading.value=false;if(!documentId.value)return;
  if(selectedDocument.value?.scan_status !== 'clean')return;
  packetLoading.value=true;
  try{
    const response=await api.get(`${endpoint.value}/documents/${documentId.value}/view`,{responseType:'blob'});
    if(n!==viewGeneration)return;
    const type=String(response.headers?.['content-type']||response.data?.type||'').toLowerCase();
    if(type.includes('application/json')){
      const data=JSON.parse(await response.data.text());
      if(n!==viewGeneration)return;
      if(!data.url)throw new Error('The packet link is unavailable.');
      packetUrl.value=data.url;
    }else{
      const blob=response.data instanceof Blob?response.data:new Blob([response.data],{type:type||'application/pdf'});
      packetObjectUrl=URL.createObjectURL(blob);packetUrl.value=packetObjectUrl;
    }
  }catch(e){if(n===viewGeneration)packetError.value=e.response?.data?.error?.message||'The packet could not be opened. It must belong to this client and pass its file check.';}
  finally{if(n===viewGeneration)packetLoading.value=false;}
}
async function checkFile(){
 if(fileCheckQueued.value||checkingFile.value||state.value.processedAt)return;const generation=contextGeneration,source=documentId.value,url=endpoint.value;checkingFile.value=true;fileCheckMessage.value='';
 try{const{data}=await api.post(`${url}/documents/${source}/check`);if(disposed||generation!==contextGeneration||source!==documentId.value)return;fileCheckMessage.value=data.message;fileCheckQueued.value=['queued','pending','running'].includes(data.status);const{data:latest}=await api.get(url);if(disposed||generation!==contextGeneration||source!==documentId.value)return;documents.value=latest.documents||[];updatePacketRead(latest.packetRead);if(data.status==='clean')await viewPacket();}catch(e){if(generation===contextGeneration)fileCheckMessage.value=e.response?.data?.error?.message||'The file check could not complete. Please retry.';}finally{if(generation===contextGeneration)checkingFile.value=false;}
}
function updatePacketRead(read){if(context.value.packetRead?.id&&Number(context.value.packetRead.id)!==Number(read?.id)){humanEvidence.sourceViewed=false;humanEvidence.denyReviewed=false;signaturesConfirmed.value=false;staffRoiConfirmed.value=false;}context.value.packetRead=read;}
async function refreshPacketRead(){const generation=contextGeneration,source=documentId.value,{data}=await api.get(endpoint.value);if(disposed||generation!==contextGeneration||source!==documentId.value)return;updatePacketRead(data.packetRead);}
async function refreshFileCheck(){const generation=contextGeneration,source=documentId.value,url=endpoint.value;checkingFile.value=true;try{const{data}=await api.get(url);if(disposed||generation!==contextGeneration||source!==documentId.value)return;documents.value=data.documents||[];updatePacketRead(data.packetRead);if(selectedDocument.value?.scan_status==='clean'){fileCheckQueued.value=false;fileCheckMessage.value='File check passed. Review the packet reading results below.';await viewPacket();}}catch(e){if(generation===contextGeneration)fileCheckMessage.value=e.response?.data?.error?.message||'Unable to refresh the file check. Your entered information is still here.';}finally{if(generation===contextGeneration)checkingFile.value=false;}}

async function loadWorkflow(){const generation=++contextGeneration;hydrated=false;loading.value=true;try{
  const {data}=await api.get(endpoint.value);if(generation!==contextGeneration||disposed)return;context.value=data;state.value=data.state;stage.value=furthest.value;Object.assign(humanEvidence,blankEvidence(),{versionLabel:data.packetRead?.versionLabel||''},data.state.consentReview?.kind==='human_source_review'?data.state.consentReview:{});
  const c=data.client, names=String(c.full_name||'').trim().split(/\s+/);Object.assign(demographics,c,{firstName:names.shift()||'',lastName:names.join(' '),dateOfBirth:dateInputValue(c.date_of_birth)});
  selectGuardian(0,state.value.guardian1Id||data.guardians[0]?.guardian_user_id);selectGuardian(1,state.value.guardian2Id||data.guardians[1]?.guardian_user_id);
  secondNotListed.value=(state.value.completedSteps||[]).includes('guardian2')&&!state.value.guardian2Id;sharedCustody.value=state.value.sharedCustody||'';schoolConfirmed.value=(state.value.completedSteps||[]).includes('school');insuranceTypeId.value=String(c.insurance_type_id||'');insuranceReviewed.value=(state.value.completedSteps||[]).includes('insurance');signaturesConfirmed.value=staffRoiConfirmed.value=!!state.value.processedAt||Number(state.value.consentReview?.documentId)===Number(state.value.documentId);
  const types=await api.get('/client-settings/insurance-types',{params:{agencyId:c.agency_id}});
  if(generation!==contextGeneration||disposed)return;
  documents.value=(data.documents||[]).filter(d=>(String(d.mime_type||'').includes('pdf')||/\.pdf$/i.test(d.original_name||'')));
  insuranceTypes.value=(types.data||[]).filter(t=>t.is_active===true||Number(t.is_active)===1);
  documentId.value=String(state.value.documentId||data.packetRead?.documentId||documents.value[0]?.id||'');await viewPacket();if(generation!==contextGeneration||disposed)return;
  const draft=data.workingDraft;if(draft&&Number(draft.documentId)===Number(documentId.value)){Object.assign(demographics,draft.demographics||{});for(let i=0;i<2;i++)if(draft.guardianForms?.[i])guardianForms[i]=draft.guardianForms[i];secondNotListed.value=!!draft.secondNotListed;schoolConfirmed.value=!!draft.schoolConfirmed;sharedCustody.value=draft.sharedCustody||'';insuranceTypeId.value=String(draft.insuranceTypeId||'');insuranceReviewed.value=!!draft.insuranceReviewed;if(draft.humanEvidence&&Number(draft.evaluationId)===Number(context.value.packetRead?.id))Object.assign(humanEvidence,draft.humanEvidence);stage.value=Math.min(Number(draft.stage)||0,furthest.value);draftMessage.value='Working draft restored. Review the source before continuing.';}
  await nextTick();hydrated=true;
}catch(e){if(generation===contextGeneration)error.value=e.response?.data?.error?.message||'Unable to load the paper-packet workflow.';}finally{if(generation===contextGeneration)loading.value=false;}}
onMounted(loadWorkflow);
watch(()=>props.clientId,()=>{contextGeneration++;viewGeneration++;draftGeneration++;hydrated=false;draftDirty=false;busy.value=false;checkingFile.value=false;clearTimeout(draftTimer);releasePacket();context.value=null;for(const key of Object.keys(demographics))delete demographics[key];Object.assign(humanEvidence,blankEvidence());void loadWorkflow();});
async function connectGuardian(index){
  const generation=contextGeneration,url=endpoint.value,clientId=props.clientId;
  const form=guardianForms[index], existing=context.value.guardians.find(g=>String(g.email||'').toLowerCase()===String(form.email||'').trim().toLowerCase());
  if(existing){if(![1,true].includes(existing.access_enabled))throw new Error('This guardian’s access is disabled. Review the contact in the client profile before continuing.');if(form.relationshipTitle !== existing.relationship_title)await api.post(`/clients/${clientId}/guardians`,{email:existing.email,firstName:existing.first_name,lastName:existing.last_name,relationshipType:'guardian',relationshipTitle:form.relationshipTitle,accessEnabled:true,permissionsJson:existing.permissions_json});return Number(existing.guardian_user_id);}
  const {data}=await api.post(`/clients/${clientId}/guardians`,{...form,relationshipType:'guardian',accessEnabled:true,permissionsJson:{canViewDocs:true,canSignDocs:true,canViewLinks:true,canViewProgress:true,canMessage:true,hideOtherGuardianAnswers:true}});
  if(disposed||generation!==contextGeneration)throw new Error('The selected client changed.');
  const id=Number(data.guardianUser?.id);if(!id)throw new Error('The guardian account could not be connected.');
  const {data:updated}=await api.get(url);if(disposed||generation!==contextGeneration)throw new Error('The selected client changed.');context.value.guardians=updated.guardians;return id;
}
function dateInputValue(value){
  // DATE values are calendar days. ISO strings must not move through a local timezone.
  const raw=String(value||'').trim();
  return /^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(raw)?raw.slice(0,10):'';
}
async function next(){
  error.value='';
  const invalid=[...(stepFields.value?.querySelectorAll('input[required],select[required],textarea[required]')||[])].filter(field=>!field.checkValidity());
  if(invalid.length){
    const names=invalid.map(field=>field.closest('label')?.textContent?.replace(/\s+/g,' ').trim()||'Required field');
    error.value=`Complete or correct: ${[...new Set(names)].join('; ')}. Compare with the uploaded packet. If information is missing, leave this step pending for follow-up.`;
    await nextTick();validationMessage.value?.focus();invalid[0].reportValidity();return;
  }
  if(state.value.processedAt)return;
  clearTimeout(draftTimer);await draftQueue.catch(()=>{});draftDirty=false;
  if(stage.value===6)return finish();const generation=contextGeneration,url=endpoint.value;busy.value=true;error.value='';try{
  let data={};
  if(stage.value===0)data={...demographics,documentId:Number(documentId.value)};
  if(stage.value===1||stage.value===2)data=stage.value===2&&secondNotListed.value?{notListed:true}:{guardianUserId:await connectGuardian(stage.value-1)};
  if(stage.value===3)data={schoolConfirmed:schoolConfirmed.value,sharedCustody:sharedCustody.value};
  if(stage.value===4){
    if(!selfPay.value && !(await insuranceEditor.value?.save()))throw new Error('Open the insurance details and save the available information before continuing.');
    data={reviewed:insuranceReviewed.value,insuranceTypeId:Number(insuranceTypeId.value)};
  }
  if(stage.value===5){if(!(await roiEditor.value?.saveAllDirty()))throw new Error('Save the staff ROI corrections before continuing.');data={signaturesConfirmed:signaturesConfirmed.value,staffRoiConfirmed:staffRoiConfirmed.value,staffChanges:roiEditor.value?.getPendingChanges?.()||[],...(needsHumanReview.value?{evidenceReview:{...JSON.parse(JSON.stringify(humanEvidence)),documentId:Number(documentId.value),evaluationId:context.value.packetRead?.id}}:{})};}
  if(disposed||generation!==contextGeneration)return;
  const result=await api.put(url,{step:keys[stage.value],data});if(disposed||generation!==contextGeneration)return;state.value=result.data.state;
  if(stage.value===5)await roiEditor.value?.reload?.({quiet:true});
  if(disposed||generation!==contextGeneration)return;
  if(stage.value===0)context.value.client.full_name=`${demographics.firstName} ${demographics.lastName}`;
  stage.value++;await refreshPacketRead();
}catch(e){if(generation===contextGeneration)error.value=e.response?.data?.error?.message||e.message||'Unable to save this step.';}finally{if(generation===contextGeneration)busy.value=false;}}
async function finish(){const generation=contextGeneration,url=endpoint.value;busy.value=true;error.value='';try{
 if(!state.value.processedAt&&!packetMatched.value)throw new Error('The paper consent evidence needs review before finishing.');
 const{data}=await api.post(`${url}/complete`,{signaturesConfirmed:signaturesConfirmed.value,staffRoiConfirmed:staffRoiConfirmed.value});if(disposed||generation!==contextGeneration)return;state.value=data.state;stage.value=6;emit('processed',data.state);
 }catch(e){if(generation===contextGeneration)error.value=e.response?.data?.error?.message||e.message||'Unable to complete processing.';}finally{if(generation===contextGeneration)busy.value=false;}}

function snapshot(){return {documentId:Number(documentId.value),evaluationId:context.value?.packetRead?.id||null,stage:stage.value,demographics:{...demographics},guardianForms:JSON.parse(JSON.stringify(guardianForms)),secondNotListed:secondNotListed.value,schoolConfirmed:schoolConfirmed.value,sharedCustody:sharedCustody.value,insuranceTypeId:insuranceTypeId.value,insuranceReviewed:insuranceReviewed.value,humanEvidence:JSON.parse(JSON.stringify(humanEvidence))};}
async function saveWorkingDraft(){
 clearTimeout(draftTimer);if(!draftDirty||!documentId.value||state.value.processedAt)return;
 const data=snapshot(),url=endpoint.value,generation=draftGeneration;draftDirty=false;draftSaving=true;draftMessage.value='Saving working draft…';
 const pending=draftQueue.catch(()=>{}).then(()=>{if(generation!==draftGeneration||Number(data.documentId)!==Number(documentId.value))throw Error('The packet changed.');data.expectedDraftRevision=Number(state.value.workingDraftRevision||0);return api.put(url,{step:'draft',data},{skipGlobalLoading:true});});draftQueue=pending;
 try{const result=await pending;if(!disposed&&generation===draftGeneration){state.value.workingDraftRevision=result.data.state.workingDraftRevision;draftMessage.value=draftDirty?'Unsaved changes — saving shortly.':'Entry draft saved. Save insurance policy changes separately before reloading.';}}
 catch{if(!disposed&&generation===draftGeneration){draftDirty=true;draftMessage.value='Working draft could not save. Keep this window open and save the step before reloading.';}}
 finally{if(!disposed&&generation===draftGeneration)draftSaving=false;}
}
function warnUnsaved(event){if(draftDirty||draftSaving){event.preventDefault();event.returnValue='';}}
window.addEventListener('beforeunload',warnUnsaved);
async function closeWorkflow(){if(draftDirty)await saveWorkingDraft();if(draftDirty)return;emit('close');}
watch(()=>{const{stage,...fields}=snapshot();return JSON.stringify(fields);},()=>{if(!hydrated||disposed||state.value.processedAt)return;draftDirty=true;draftMessage.value='Unsaved changes — saving shortly.';clearTimeout(draftTimer);draftTimer=setTimeout(()=>void saveWorkingDraft(),600);});
</script>
<style scoped>
.paper-workflow{border:1px solid var(--border-color,#d9e1e5);border-radius:12px;padding:18px;background:var(--bg-primary,#fff)}.paper-header{display:flex;justify-content:space-between;gap:20px;align-items:start}.paper-header h3{margin:0}.paper-header p{margin:8px 0 16px}.paper-columns{display:grid;grid-template-columns:minmax(280px,1fr) minmax(320px,1.1fr);gap:22px}.paper-entry{min-width:0;max-height:80vh;overflow:auto;padding-right:8px}.paper-entry nav{display:flex;gap:6px;flex-wrap:wrap}.paper-entry nav button{font:inherit;border:1px solid #c6d3dc;border-radius:6px;padding:7px;background:transparent}.paper-entry nav [aria-current=step]{background:#e6f0f6;font-weight:700}.paper-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.paper-wide{grid-column:1/-1}.paper-fields>label{min-width:0}.paper-workflow{min-width:0;overflow-wrap:anywhere}.paper-workflow fieldset{min-width:0}.paper-actions{flex-wrap:wrap}.paper-workflow label{display:flex;flex-direction:column;gap:5px;margin:10px 0}.paper-workflow input,.paper-workflow select{font:inherit;max-width:100%;min-width:0;padding:8px;border:1px solid #becbd3;border-radius:5px}.paper-workflow fieldset{border:0;padding:0;margin:0}.paper-workflow .paper-check{flex-direction:row;align-items:start}.paper-check input{margin-top:3px}.paper-source{position:sticky;top:0;align-self:start;min-width:0;max-height:80vh;overflow:auto;padding:12px;background:#f4f7f9;border-radius:8px}.paper-source :deep(.pdf-preview){min-height:450px}.paper-actions{display:flex;justify-content:space-between;gap:12px;margin-top:18px}.error{color:#a11}.paper-workflow p{line-height:1.45}@media(max-width:900px){.paper-columns{grid-template-columns:1fr}.paper-source{position:static;max-height:55vh}.paper-entry{max-height:none}.paper-fields{grid-template-columns:1fr}.paper-header{flex-wrap:wrap}}
</style>
