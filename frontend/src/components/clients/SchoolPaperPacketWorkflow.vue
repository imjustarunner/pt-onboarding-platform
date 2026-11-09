<template>
  <section class="paper-workflow" aria-label="Process school paper packet">
    <header class="paper-header"><div><h3>Process school paper packet</h3><p>Compare each step with the uploaded packet. Existing paper signatures stay on file.</p></div><button type="button" class="btn btn-secondary" :disabled="busy" @click="$emit('close')">Close</button></header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">Loading packet and saved information…</p>
    <div v-else-if="context" class="paper-columns">
      <div class="paper-entry">
        <nav aria-label="Packet processing steps"><button v-for="(label, index) in labels" :key="label" type="button" :aria-current="stage === index ? 'step' : undefined" :disabled="busy || index > furthest" @click="stage=index">{{ index + 1 }}. {{ label }}</button></nav>
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
              <div class="paper-fields"><label>Client first name<input v-model="demographics.firstName" required maxlength="255" /></label><label>Client last name<input v-model="demographics.lastName" required maxlength="255" /></label>
              <label>Date of birth<input v-model="demographics.dateOfBirth" required type="date" /></label><label>Sex<select v-model="demographics.gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></label>
              <label>Grade<input v-model="demographics.grade" maxlength="40" /></label><label>Preferred language<input v-model="demographics.preferred_language" maxlength="100" /></label>
              <label v-for="field in addressFields" :key="field.key">{{ field.label }}<input v-model="demographics[field.key]" maxlength="255" /></label></div>
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
              <ClientOnboardingRoiStaffPanel v-if="!state.processedAt" ref="roiEditor" :client-id="clientId" :step-done="false" :review-only="true" @updated="refreshPacketRead" />
              <label class="paper-check"><input v-model="staffRoiConfirmed" type="checkbox" required /> I confirmed each matched staff member’s relationship and ROI selection against the paper, and saved any corrections.</label>
              <label class="paper-check"><input v-model="signaturesConfirmed" type="checkbox" required /> I confirmed the existing signatures on the paper ROI and disclosure.</label>
              <p v-if="state.processedAt">The paper consent review was saved. The existing paper remains the signature evidence.</p>
              <p>Finishing establishes the portal and sends a separate invitation to each listed parent. It does not collect new signatures or send one parent’s private answers to the other.</p>
            </template>
            <template v-else><p><strong>{{ context.client.full_name }}</strong> · {{ context.schoolName }}</p><p>Parent 1: {{ guardianLabel(state.guardian1Id) }}<br />Parent 2: {{ state.guardian2Id ? guardianLabel(state.guardian2Id) : 'Not listed' }}</p><p>Paper consents and release selections were reviewed. Finish sends each listed parent their own portal invitation.</p></template>
          </fieldset>
          <div v-if="!state.processedAt" class="paper-actions"><button v-if="stage > 0" type="button" class="btn btn-secondary" :disabled="busy" @click="stage--">Back</button><button type="button" class="btn btn-primary" :disabled="busy || (stage >= 5 && !packetMatched)" @click="next">{{ busy ? 'Saving…' : stage === 6 ? 'Finish and send portal invitations' : 'Save and continue' }}</button></div>
        </div>
      </div>
      <aside class="paper-source" aria-label="Uploaded paper packet">
        <label>Uploaded packet<select v-model="documentId" :disabled="busy || !!state.processedAt" @change="changePacket"><option value="">Select the uploaded packet</option><option v-for="doc in documents" :key="doc.id" :value="String(doc.id)">{{ doc.document_title || doc.original_name || 'Paper packet' }}{{ doc.scan_status === 'clean' ? '' : ' — file check pending' }}</option></select></label>
        <button v-if="documentId" type="button" class="btn btn-secondary" :disabled="busy || checkingFile || fileCheckQueued || !!state.processedAt || (selectedDocument?.scan_status === 'clean' && !!context.packetRead)" @click="checkFile">{{ checkingFile ? 'Checking…' : 'Check file and read packet' }}</button><p v-if="fileCheckMessage" role="status">{{ fileCheckMessage }}</p>
        <div v-if="context.packetRead && Number(context.packetRead.documentId) === Number(documentId)" class="packet-evidence"><p>Packet version: {{ context.packetRead.versionLabel || 'Not identified' }}. ROI signature: {{ context.packetRead.roiSignatureDetected ? 'Detected' : 'Needs review' }}. Disclosure signature: {{ context.packetRead.disclosureSignatureDetected ? 'Detected' : 'Needs review' }}.</p><ul v-if="context.packetRead.reviewReasons?.length"><li v-for="reason in context.packetRead.reviewReasons" :key="reason">{{ reviewReasonLabel(reason) }}</li></ul></div>
        <p v-if="packetLoading" role="status">Opening packet…</p><p v-if="packetError" class="error">{{ packetError }}</p>
        <PDFPreview v-if="packetUrl" :key="packetUrl" :pdf-url="packetUrl" />
        <p v-else-if="!packetLoading && selectedDocument && selectedDocument.scan_status !== 'clean'">The preview becomes available after the private file check passes.</p>
        <p v-else-if="!packetLoading">Select a packet to compare it with the fields on the left.</p>
        <button v-if="fileCheckQueued" class="btn btn-secondary" type="button" :disabled="checkingFile" @click="refreshFileCheck">Refresh file-check status</button>
      </aside>
    </div>
  </section>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
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
const stepFields=ref(null), insuranceEditor=ref(null), roiEditor=ref(null);
const checkingFile=ref(false),fileCheckMessage=ref(''),fileCheckQueued=ref(false);
const selectedDocument=computed(()=>documents.value.find(d=>Number(d.id)===Number(documentId.value)));
const reviewReasonLabel=reason=>String(reason||'').replaceAll('_',' ');
const documents=ref([]),documentId=ref(''),packetUrl=ref(''),packetLoading=ref(false),packetError=ref('');
const demographics=reactive({}),guardianForms=reactive([{},{}]),secondNotListed=ref(false),schoolConfirmed=ref(false),sharedCustody=ref('');
const insuranceTypes=ref([]),insuranceTypeId=ref(''),insuranceReviewed=ref(false),showVerification=ref(false),signaturesConfirmed=ref(false),staffRoiConfirmed=ref(false);
const addressFields=[{key:'address_street',label:'Street address'},{key:'address_apt',label:'Apartment / unit'},{key:'address_city',label:'City'},{key:'address_state',label:'State'},{key:'address_zip',label:'ZIP code'}];
const endpoint=computed(()=>`/clients/${props.clientId}/paper-packet-processing`);
const furthest=computed(()=>{const i=keys.findIndex(key=>!(state.value.completedSteps||[]).includes(key));return state.value.processedAt?6:i<0?6:i;});
const selfPay=computed(()=>/self[\s_-]*pay/i.test(insuranceTypes.value.find(t=>Number(t.id)===Number(insuranceTypeId.value))?.insurance_key || insuranceTypes.value.find(t=>Number(t.id)===Number(insuranceTypeId.value))?.label || ''));
const packetMatched=computed(()=>{
 const read=context.value?.packetRead;
 const reviewedReplacement=read?.status==='needs_review' && read.reviewReasons?.length===1 && read.reviewReasons[0]==='replacement_packet_requires_review';
 return (read?.status==='applied'||reviewedReplacement) && Number(read.documentId)===Number(documentId.value) && read.roiSignatureDetected && read.disclosureSignatureDetected;
});
const hasFailedInvitation=computed(()=>Object.values(state.value.invitations||{}).some(d=>['failed','blocked'].includes(d.status)));
function guardianLabel(id){const g=context.value?.guardians.find(g=>Number(g.guardian_user_id)===Number(id));return g?[g.first_name,g.last_name].filter(Boolean).join(' '):'Not connected';}
function selectGuardian(index,id){const g=context.value.guardians.find(g=>Number(g.guardian_user_id)===Number(id));guardianForms[index]=g?{id:g.guardian_user_id,firstName:g.first_name,lastName:g.last_name,email:g.email,phone:g.phone_number||'',relationshipTitle:g.relationship_title||'Parent / guardian'}:{firstName:'',lastName:'',email:'',phone:'',relationshipTitle:''};}
async function changePacket(){fileCheckQueued.value=false;stage.value=0;signaturesConfirmed.value=false;staffRoiConfirmed.value=false;await viewPacket();}
let viewGeneration=0;
let packetObjectUrl='';
function releasePacket(){if(packetObjectUrl)URL.revokeObjectURL(packetObjectUrl);packetObjectUrl='';packetUrl.value='';}
onBeforeUnmount(()=>{viewGeneration++;releasePacket();});
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
async function checkFile(){if(fileCheckQueued.value||checkingFile.value||state.value.processedAt)return;checkingFile.value=true;fileCheckMessage.value='';try{const{data}=await api.post(`${endpoint.value}/documents/${documentId.value}/check`);fileCheckMessage.value=data.message;fileCheckQueued.value=['queued','pending','running'].includes(data.status);const{data:latest}=await api.get(endpoint.value);documents.value=latest.documents||[];context.value.packetRead=latest.packetRead;if(data.status==='clean')await viewPacket();}catch(e){fileCheckMessage.value=e.response?.data?.error?.message||'The file check could not complete. Please retry.';}finally{checkingFile.value=false;}}
async function refreshPacketRead(){const {data}=await api.get(endpoint.value);context.value.packetRead=data.packetRead;}
async function refreshFileCheck(){checkingFile.value=true;try{const {data}=await api.get(endpoint.value);documents.value=data.documents||[];context.value.packetRead=data.packetRead;if(selectedDocument.value?.scan_status==='clean'){fileCheckQueued.value=false;fileCheckMessage.value='File check passed. Review the packet reading results below.';await viewPacket();}}catch(e){fileCheckMessage.value=e.response?.data?.error?.message||'Unable to refresh the file check. Your entered information is still here.';}finally{checkingFile.value=false;}}
onMounted(async()=>{try{
  const {data}=await api.get(endpoint.value);context.value=data;state.value=data.state;stage.value=furthest.value;
  const c=data.client, names=String(c.full_name||'').trim().split(/\s+/);Object.assign(demographics,c,{firstName:names.shift()||'',lastName:names.join(' '),dateOfBirth:String(c.date_of_birth||'').slice(0,10)});
  selectGuardian(0,state.value.guardian1Id||data.guardians[0]?.guardian_user_id);selectGuardian(1,state.value.guardian2Id||data.guardians[1]?.guardian_user_id);
  secondNotListed.value=(state.value.completedSteps||[]).includes('guardian2')&&!state.value.guardian2Id;sharedCustody.value=state.value.sharedCustody||'';schoolConfirmed.value=(state.value.completedSteps||[]).includes('school');insuranceTypeId.value=String(c.insurance_type_id||'');insuranceReviewed.value=(state.value.completedSteps||[]).includes('insurance');signaturesConfirmed.value=staffRoiConfirmed.value=!!state.value.processedAt||Number(state.value.consentReview?.documentId)===Number(state.value.documentId);
  const types=await api.get('/client-settings/insurance-types',{params:{agencyId:c.agency_id}});
  documents.value=(data.documents||[]).filter(d=>(String(d.mime_type||'').includes('pdf')||/\.pdf$/i.test(d.original_name||'')));
  insuranceTypes.value=(types.data||[]).filter(t=>t.is_active===true||Number(t.is_active)===1);
  documentId.value=String(state.value.documentId||data.packetRead?.documentId||documents.value[0]?.id||'');await viewPacket();
}catch(e){error.value=e.response?.data?.error?.message||'Unable to load the paper-packet workflow.';}finally{loading.value=false;}});
async function connectGuardian(index){
  const form=guardianForms[index], existing=context.value.guardians.find(g=>String(g.email||'').toLowerCase()===String(form.email||'').trim().toLowerCase());
  if(existing){if(![1,true].includes(existing.access_enabled))throw new Error('This guardian’s access is disabled. Review the contact in the client profile before continuing.');if(form.relationshipTitle !== existing.relationship_title)await api.post(`/clients/${props.clientId}/guardians`,{email:existing.email,firstName:existing.first_name,lastName:existing.last_name,relationshipType:'guardian',relationshipTitle:form.relationshipTitle,accessEnabled:true,permissionsJson:existing.permissions_json});return Number(existing.guardian_user_id);}
  const {data}=await api.post(`/clients/${props.clientId}/guardians`,{...form,relationshipType:'guardian',accessEnabled:true,permissionsJson:{canViewDocs:true,canSignDocs:true,canViewLinks:true,canViewProgress:true,canMessage:true,hideOtherGuardianAnswers:true}});
  const id=Number(data.guardianUser?.id);if(!id)throw new Error('The guardian account could not be connected.');
  const {data:updated}=await api.get(endpoint.value);context.value.guardians=updated.guardians;return id;
}
async function next(){
  for(const field of stepFields.value?.querySelectorAll('input[required],select[required],textarea[required]')||[])if(!field.reportValidity())return;
  if(state.value.processedAt)return;
  if(stage.value===6)return finish();busy.value=true;error.value='';try{
  let data={};
  if(stage.value===0)data={...demographics,documentId:Number(documentId.value)};
  if(stage.value===1||stage.value===2)data=stage.value===2&&secondNotListed.value?{notListed:true}:{guardianUserId:await connectGuardian(stage.value-1)};
  if(stage.value===3)data={schoolConfirmed:schoolConfirmed.value,sharedCustody:sharedCustody.value};
  if(stage.value===4){
    if(!selfPay.value && !(await insuranceEditor.value?.save()))throw new Error('Open the insurance details and save the available information before continuing.');
    data={reviewed:insuranceReviewed.value,insuranceTypeId:Number(insuranceTypeId.value)};
  }
  if(stage.value===5){if(!(await roiEditor.value?.saveAllDirty()))throw new Error('Save the staff ROI corrections before continuing.');data={signaturesConfirmed:signaturesConfirmed.value,staffRoiConfirmed:staffRoiConfirmed.value};}
  const result=await api.put(endpoint.value,{step:keys[stage.value],data});state.value=result.data.state;
  if(stage.value===0)context.value.client.full_name=`${demographics.firstName} ${demographics.lastName}`;
  stage.value++;await refreshPacketRead();
}catch(e){error.value=e.response?.data?.error?.message||e.message||'Unable to save this step.';}finally{busy.value=false;}}
async function finish(){busy.value=true;error.value='';try{
  if(!state.value.processedAt && !packetMatched.value)throw new Error('The paper consent evidence needs review before finishing.');
  const {data}=await api.post(`${endpoint.value}/complete`,{signaturesConfirmed:signaturesConfirmed.value,staffRoiConfirmed:staffRoiConfirmed.value});state.value=data.state;stage.value=6;emit('processed',data.state);}catch(e){error.value=e.response?.data?.error?.message||e.message||'Unable to complete processing.';}finally{busy.value=false;}}
</script>
<style scoped>
.paper-workflow{border:1px solid var(--border-color,#d9e1e5);border-radius:12px;padding:18px;background:var(--bg-primary,#fff)}.paper-header{display:flex;justify-content:space-between;gap:20px;align-items:start}.paper-header h3{margin:0}.paper-header p{margin:8px 0 16px}.paper-columns{display:grid;grid-template-columns:minmax(280px,1fr) minmax(320px,1.1fr);gap:22px}.paper-entry{min-width:0;max-height:80vh;overflow:auto;padding-right:8px}.paper-entry nav{display:flex;gap:6px;flex-wrap:wrap}.paper-entry nav button{font:inherit;border:1px solid #c6d3dc;border-radius:6px;padding:7px;background:transparent}.paper-entry nav [aria-current=step]{background:#e6f0f6;font-weight:700}.paper-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.paper-wide{grid-column:1/-1}.paper-fields>label{min-width:0}.paper-workflow{min-width:0;overflow-wrap:anywhere}.paper-workflow fieldset{min-width:0}.paper-actions{flex-wrap:wrap}.paper-workflow label{display:flex;flex-direction:column;gap:5px;margin:10px 0}.paper-workflow input,.paper-workflow select{font:inherit;max-width:100%;min-width:0;padding:8px;border:1px solid #becbd3;border-radius:5px}.paper-workflow fieldset{border:0;padding:0;margin:0}.paper-workflow .paper-check{flex-direction:row;align-items:start}.paper-check input{margin-top:3px}.paper-source{position:sticky;top:0;align-self:start;min-width:0;max-height:80vh;overflow:auto;padding:12px;background:#f4f7f9;border-radius:8px}.paper-source :deep(.pdf-preview){min-height:450px}.paper-actions{display:flex;justify-content:space-between;gap:12px;margin-top:18px}.error{color:#a11}.paper-workflow p{line-height:1.45}@media(max-width:900px){.paper-columns{grid-template-columns:1fr}.paper-source{position:static;max-height:55vh}.paper-entry{max-height:none}.paper-fields{grid-template-columns:1fr}.paper-header{flex-wrap:wrap}}
</style>
