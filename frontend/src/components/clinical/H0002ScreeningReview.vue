<template>
  <Teleport to="body">
    <div class="h0002-backdrop" @click.self="close">
      <section class="h0002-dialog" :class="{'with-packet': packetUrl}" role="dialog" aria-modal="true" aria-labelledby="h0002-title">
        <header><h2 id="h0002-title">H0002 screening review <span v-if="data">— {{ data.clientCode }}</span></h2><button type="button" :disabled="saving" aria-label="Save and close screening review" @click="close">×</button></header>
        <p v-if="loading">Loading screening…</p>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <p v-if="saveNotice" role="status">{{ saveNotice }}</p>
        <div v-if="data" class="review-columns">
          <div class="review-form">
            <p><strong>{{ data.clientType === 'school' ? 'School client' : 'Office client' }}</strong><span v-if="data.schoolName"> · {{ data.schoolName }}</span></p>
            <p class="muted">Questionnaire received: {{ data.submittedAt }}. Service date on signing: {{ data.reviewServiceDate }} (Mountain time).</p>
            <section v-if="data.sourceLanguage === 'es'" class="language-box">
              <strong>This questionnaire was submitted in Spanish.</strong>
              <label>Answer language<select v-model="answerLanguage"><option value="en">English</option><option value="es">Spanish (original)</option><option value="both">English and Spanish</option></select></label>
              <details v-if="!englishText"><summary>Prepare an English translation without identifying details</summary>
                <p>Review the exact text below. Remove all names, addresses, dates of birth and other identifying details before sending it to Google Vertex for translation. The original packet stays unchanged.</p>
                <textarea v-model="translationText" rows="8" aria-label="Text to send for translation" @input="noIdentifiersConfirmed = false" />
                <label class="check"><input v-model="noIdentifiersConfirmed" type="checkbox" />I checked this text and removed all names and identifying details.</label>
                <button type="button" :disabled="translating || !noIdentifiersConfirmed" @click="translate">{{ translating ? 'Translating…' : 'Translate reviewed text to English' }}</button>
              </details>
              <p v-if="englishText" class="muted">English translation — compare with the original when reviewing meaning.</p>
              <details v-if="!data.signedAt"><summary>Forward to a Spanish-speaking provider</summary>
                <p v-if="data.billingSupervisor">Billing supervisor stays {{ data.billingSupervisor.name }}. Only eligible providers with this supervisor appear.</p>
                <select v-model="forwardProvider" aria-label="Spanish-speaking provider"><option value="">Choose a provider</option><option v-for="provider in data.transferProviders" :key="provider.id" :value="provider.id">{{ provider.name }}</option></select>
                <p v-if="!data.transferProviders?.length">No eligible Spanish-speaking provider is configured with the same billing supervisor.</p>
                <button type="button" :disabled="!forwardProvider || saving" @click="forward">Save and forward screening</button>
              </details>
            </section>
            <section v-if="data.roiOnly" class="language-box"><strong>This is a Release of Information, not a screening.</strong><p>No screening signature is needed for this submission. Close this mistaken task without signing; the ROI and your saved work remain in the chart.</p><button v-if="!data.signedAt" type="button" :disabled="saving" @click="closeRoi">Close ROI task without signing</button></section>
            <p v-if="!data.roiOnly && !effectivePsc.complete" role="alert" class="error">{{ effectivePsc.invalid ? 'Invalid screening: too many missing items.' : 'The screening is incomplete.' }} {{ effectivePsc.answered }}/17 valid answers. Check the source packet below. Transcribe answers only when they are present on paper; otherwise obtain the missing responses before signing.</p>
            <p v-if="!data.roiOnly && needsSafetyReview" role="alert" class="error"><strong>Reported safety concern: {{ review.safetyConcern || 'Review the reported history below.' }}</strong> Describe it in the presenting problem and document the assessment and follow-up before confirming review.</p>
            <details open><summary>Screening results and reported history</summary>
              <pre v-if="data.sourceLanguage !== 'es' || answerLanguage !== 'es'">{{ englishText || (data.sourceLanguage === 'es' ? 'English translation is waiting for your review of the redacted text above.' : data.sourceText) }}</pre>
              <pre v-if="data.sourceLanguage === 'es' && answerLanguage !== 'en'" lang="es">{{ data.sourceText }}</pre>
            </details>
            <details :open="data.roiOnly || !effectivePsc.complete || review.paperTranscription || data.packetMethod === 'paper'"><summary>Source intake packet and paper responses</summary>
              <button type="button" @click="loadPackets">Find client intake documents</button>
              <p v-if="packetError" role="alert">{{ packetError }}</p>
              <button v-for="doc in packets" :key="doc.id" type="button" class="packet-link" @click="openPacket(doc)">{{ doc.document_title || doc.original_name || 'Intake document' }}{{ Number(doc.intake_submission_id) === Number(data.submissionId) ? ' · this submission' : ' · other client document' }}</button>
              <template v-if="!data.signedAt && !data.roiOnly">
                <label class="check"><input v-model="review.paperTranscription" type="checkbox" />Transcribe a paper packet</label>
                <template v-if="review.paperTranscription">
                  <p v-if="!review.paperDocumentId">Choose the source document above to open it beside the answers.</p>
                  <p>Read each response from the packet. Missing answers remain unanswered; scores are calculated from your selections.</p>
                  <label v-for="item in data.pscItems" :key="item.key">{{ item.label }}<select v-model="review.paperResponses[item.key]"><option :value="undefined">Unanswered</option><option :value="0">Never</option><option :value="1">Sometimes</option><option :value="2">Often</option></select></label>
                  <label v-for="field in data.clinicalFields" :key="field.key">{{ field.label }}<select v-if="field.options?.length" v-model="review.paperResponses[field.key]"><option value="">Unanswered</option><option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option></select><textarea v-else v-model="review.paperResponses[field.key]" rows="2" maxlength="10000" /></label>
                  <label class="check"><input v-model="review.paperSourceConfirmed" type="checkbox" />I checked the question wording and transcribed these answers from the selected document.</label>
                  <button type="button" @click="buildPresentingProblem">Draft presenting problem from transcribed history</button>
                </template>
              </template>
            </details>
            <template v-if="!data.signedAt && !data.roiOnly">
              <p v-if="data.psc?.complete && /0\/17|needs completion/i.test(review.assessment)">The saved draft mentions missing answers, but the source now has all 17. Review the results and update the draft text before signing.</p>
              <button v-if="!review.paperTranscription" type="button" @click="refreshProposal">Use current screening results in draft</button>
              <p><strong>Proposed outcome:</strong> {{ outcomes[suggestedOutcome] }}. Review and edit before signing.</p>
              <label>Admission determination<select v-model="review.outcome"><option value="meets">Does meet criteria</option><option value="does_not_meet" :disabled="effectivePsc.total !== 0 || data.reportedConcerns || review.paperTranscription">Does not meet criteria</option><option value="further_evaluation">Requires further evaluation</option></select></label>
              <label v-if="review.outcome === 'does_not_meet'" class="check"><input v-model="review.noConcernsConfirmed" type="checkbox" />I confirmed that no concerns or reasons for treatment were reported.</label>
              <label>Presenting problem<textarea v-model="review.presentingProblem" rows="5" maxlength="10000" placeholder="Summarize why the client is seeking therapy using the reported concerns and screening history." /></label>
              <label>Reported safety concern<textarea v-model="review.safetyConcern" rows="2" maxlength="10000" placeholder="Describe the reported concern, such as a history of abuse or neglect. Do not infer a concern that was not reported." /></label>
              <p v-if="review.safetyConcern"><strong>Reported safety concern: {{ review.safetyConcern }}</strong></p>
              <label>Clinical assessment and rationale<textarea v-model="review.assessment" rows="4" maxlength="10000" /></label>
              <label>Treatment needs, available options and follow-up<textarea v-model="review.followUp" rows="3" maxlength="10000" /></label>
              <label>Client service location<select v-model="review.placeOfService"><option value="10">Virtual — client’s home (10)</option><option value="03">School (03){{ data.schoolName ? ` — ${data.schoolName}` : '' }}</option><option value="11">Office (11)</option><option value="02">Virtual — outside the client’s home (02)</option></select></label>
              <label class="check"><input v-model="review.locationConfirmed" type="checkbox" />I confirmed the client service location for this screening.</label>
              <p class="muted">The submission method suggests a location for review. Your own address is not required.</p>
              <p><strong>Deferred billing code:</strong> R69 — illness, unspecified. No disorder diagnosis is added by this screening.</p>
              <details><summary>Admission determination preview</summary><p>{{ review.presentingProblem }}</p><p v-if="review.safetyConcern"><strong>Reported safety concern: {{ review.safetyConcern }}</strong></p><p>{{ outcomes[review.outcome] }}</p><p>{{ review.assessment }}</p><p>{{ review.followUp }}</p></details>
              <label class="check"><input v-model="review.reviewConfirmed" type="checkbox" />I reviewed the screening and supplemental history and made this admission determination.</label>
              <label v-if="needsSafetyReview" class="check"><input v-model="review.safetyReviewed" type="checkbox" />I documented the indicated safety assessment and follow-up.</label>
              <label class="check"><input v-model="review.accurateAndComplete" type="checkbox" />The note is accurate and complete.</label>
              <label class="check"><input v-model="review.medicalNecessityAttested" type="checkbox" />This screening service was medically necessary.</label>
              <footer><button type="button" :disabled="saving" @click="close">Save and close</button><button class="btn btn-primary" type="button" :disabled="!canSign || saving" @click="sign()">{{ saving ? 'Saving…' : 'Sign and send for cosign' }}</button><button type="button" class="btn sign-next" :disabled="!canSign || saving || !hasNextInQueue" :title="hasNextInQueue ? 'Sign this screening, then open the next unfinished item' : 'No other unfinished items in your queue'" @click="sign(true)">Sign and open next in queue</button></footer>
            </template>
            <template v-else-if="data.signedAt"><p>Signed {{ data.signedAt }}. Supervisor cosign and claim readiness are tracked separately.</p><pre>{{ data.draftText }}</pre></template>
          </div>
          <aside v-if="packetUrl" class="packet-preview"><button type="button" @click="packetUrl = ''">Close packet</button><iframe :src="packetUrl" title="Source intake packet" /></aside>
        </div>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch, nextTick, inject } from 'vue';
import api from '../../services/api';
import { onBeforeRouteLeave, matchedRouteKey } from 'vue-router';
const props = defineProps({ sessionId: { type: Number, required: true }, agencyId: { type: Number, required: true }, hasNextInQueue: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'signed', 'saved', 'forwarded']);
const data = ref(null), loading = ref(true), saving = ref(false), error = ref(''), saveNotice = ref('');
const englishText=ref(''),answerLanguage=ref('en'),translationText=ref(''),noIdentifiersConfirmed=ref(false),translating=ref(false),forwardProvider=ref('');
const packets=ref([]),packetUrl=ref(''),packetError=ref('');
const outcomes = { meets: 'Does meet criteria for admission', does_not_meet: 'Does not meet criteria for admission', further_evaluation: 'Further clinical evaluation is needed' };
const review = reactive({ outcome:'further_evaluation',assessment:'',followUp:'',presentingProblem:'',safetyConcern:'',placeOfService:'10',paperTranscription:false,paperDocumentId:null,paperSourceConfirmed:false,paperResponses:{},locationConfirmed:false,noConcernsConfirmed:false,reviewConfirmed:false,safetyReviewed:false,accurateAndComplete:false,medicalNecessityAttested:false });
let revision=0, timer, ready=false, savePromise=null;
const savedSnapshot=ref('');
if(inject(matchedRouteKey,null))onBeforeRouteLeave(async()=>{if(saving.value&&!savePromise)return false;return await saveDraft();});
const snapshot=()=>JSON.stringify(review);
const dirty=computed(()=>snapshot()!==savedSnapshot.value);
const effectivePsc=computed(()=>{
  if(!review.paperTranscription)return data.value?.psc||{};
  const scores=(data.value?.pscItems||[]).map(item=>review.paperResponses[item.key]).filter(value=>Number.isInteger(value)&&value>=0&&value<=2);
  return {complete:scores.length===17,answered:scores.length,invalid:scores.length<14,total:scores.length===17?scores.reduce((sum,value)=>sum+value,0):null,subscales:{}};
});
const suggestedOutcome=computed(()=>review.paperTranscription?(effectivePsc.value.complete&&effectivePsc.value.total>=15?'meets':'further_evaluation'):data.value?.suggestedOutcome);
const needsSafetyReview=computed(()=>data.value?.safetyFlag || !!review.safetyConcern.trim());
const canSign = computed(() => !data.value?.roiOnly && (!review.paperTranscription || (review.paperDocumentId && review.paperSourceConfirmed)) && effectivePsc.value.complete && !Object.values(effectivePsc.value.subscales || {}).some(s=>s.score==null)
  && review.assessment.trim().length>=3 && review.followUp.trim().length>=3 && review.presentingProblem.trim().length>=3 && review.locationConfirmed
  && review.reviewConfirmed && review.accurateAndComplete && review.medicalNecessityAttested
  && (!needsSafetyReview.value || (review.safetyReviewed && review.safetyConcern.trim()))
  && (review.outcome!=='does_not_meet' || (effectivePsc.value.total===0 && !data.value.reportedConcerns && !review.paperTranscription && review.noConcernsConfirmed)));
const endpoint=()=>`/medical-billing/screening-sessions/${props.sessionId}`;
onMounted(async()=>{
  window.addEventListener('beforeunload',warnUnsaved);
  try {
    const {data:result}=await api.get(`${endpoint()}/review`,{params:{agencyId:props.agencyId},skipGlobalLoading:true});data.value=result;
    Object.assign(review,{outcome:result.suggestedOutcome,assessment:result.proposedReview?.assessment||'',followUp:result.proposedReview?.followUp||'',placeOfService:result.location?.code||'10',safetyConcern:(result.safetyConcerns||[]).join('\n'),presentingProblem:result.sourceLanguage==='es'?'':result.proposedReview?.presentingProblem||result.sourceText||''},result.savedReview||{});
    revision=Number(result.savedReview?.revision||0);englishText.value=result.sourceEnglish||'';translationText.value=result.translationPreview||'';
    savedSnapshot.value=result.savedReview?snapshot():'';await nextTick();ready=true;if(!result.signedAt && !result.roiOnly)await saveDraft();
    if(result.roiOnly || !result.psc?.complete || result.packetMethod==='paper' || review.paperTranscription)await loadPackets();
  }catch(e){error.value=e.response?.data?.error?.message||'Could not load the screening.';}
  finally{loading.value=false;}
});
watch(review,()=>{if(!ready||data.value?.signedAt||data.value?.roiOnly)return;clearTimeout(timer);timer=setTimeout(()=>saveDraft(),800);},{deep:true});
watch(()=>review.placeOfService,()=>{if(ready)review.locationConfirmed=false;});
watch(()=>review.paperTranscription,()=>{if(!ready)return;review.locationConfirmed=false;if(review.paperTranscription){review.placeOfService=data.value?.clientType==='school'?'03':'11';review.assessment='';review.outcome='further_evaluation';}});
watch(()=>review.paperResponses,()=>{if(ready)review.paperSourceConfirmed=false;},{deep:true});
async function saveDraft(){
  clearTimeout(timer);if(!data.value||data.value.signedAt||data.value.roiOnly)return true;
  if(savePromise){await savePromise;if(!dirty.value)return true;}
  if(!dirty.value)return true;
  const content=snapshot();saving.value=true;error.value='';saveNotice.value='Saving draft…';
  savePromise=(async()=>{
    try{const r=await api.put(`${endpoint()}/draft`,{...JSON.parse(content),agencyId:props.agencyId,sourceHash:data.value.sourceHash,revision},{skipGlobalLoading:true});revision=r.data.review.revision;savedSnapshot.value=content;saveNotice.value='Draft saved';emit('saved',r.data);return true;}
    catch(e){error.value=e.response?.data?.error?.message||'Draft could not be saved. Keep this window open and retry.';saveNotice.value='Not saved';return false;}
    finally{saving.value=false;savePromise=null;}
  })();return savePromise;
}
async function close(){if(saving.value&&savePromise)await savePromise;if(await saveDraft())emit('close');}
async function sign(openNext=false){if(!canSign.value||saving.value||(openNext&&!props.hasNextInQueue))return;if(!await saveDraft())return;saving.value=true;error.value='';try{const r=await api.post(`${endpoint()}/sign`,{...review,agencyId:props.agencyId,sourceHash:data.value.sourceHash},{skipGlobalLoading:true});data.value.signedAt=new Date().toISOString();emit('signed',r.data,{openNext});}catch(e){error.value=e.response?.data?.error?.message||'Signing failed. Your saved draft is still available.';}finally{saving.value=false;}}
async function translate(){if(!noIdentifiersConfirmed.value)return;translating.value=true;try{const {data:result}=await api.post(`${endpoint()}/translate`,{agencyId:props.agencyId,reviewedText:translationText.value,noIdentifiersConfirmed:true},{skipGlobalLoading:true});if(result.status==='unavailable')throw new Error('Translation unavailable');englishText.value=result.text;answerLanguage.value='en';if(!review.presentingProblem)review.presentingProblem=result.text;}catch(e){error.value=e.response?.data?.error?.message||'English translation is unavailable. The original Spanish answers remain available.';}finally{translating.value=false;}}
async function forward(){if(!forwardProvider.value||!await saveDraft())return;saving.value=true;try{const r=await api.post(`${endpoint()}/forward`,{agencyId:props.agencyId,providerUserId:forwardProvider.value});emit('forwarded',r.data);emit('close');}catch(e){error.value=e.response?.data?.error?.message||'Could not forward this screening.';}finally{saving.value=false;}}
async function loadPackets(){
  packetError.value='';
  try {
    const r=await api.get(`${endpoint()}/documents`,{params:{agencyId:props.agencyId}});
    packets.value=(Array.isArray(r.data)?r.data:[]).sort((a,b)=>Number(Number(b.intake_submission_id)===Number(data.value.submissionId))-Number(Number(a.intake_submission_id)===Number(data.value.submissionId)));
    if(!packets.value.length)packetError.value='No source document is stored for this client. Upload the completed paper packet to the client’s documents, then retry.';
    const selected=packets.value.find(doc=>Number(doc.id)===Number(review.paperDocumentId));
    const packet=selected||packets.value.find(doc=>Number(doc.intake_submission_id)===Number(data.value.submissionId)&&/intake packet/i.test(doc.document_type||doc.document_title||''));
    if(packet)await openPacket(packet);
  }catch{packetError.value='Could not load client documents.';}
}
async function openPacket(doc){try{const r=await api.get(`${endpoint()}/documents/${doc.id}/view`);if(!r.data?.url)throw new Error('No document URL');packetUrl.value=r.data.url;review.paperDocumentId=Number(doc.id);review.paperSourceConfirmed=false;}catch{packetError.value='Could not open this document.';}}
async function closeRoi(){
  saving.value=true;error.value='';
  try{const r=await api.post(`${endpoint()}/close-roi`,{agencyId:props.agencyId,sourceHash:data.value.sourceHash},{skipGlobalLoading:true});ready=false;emit('saved',r.data);emit('close');}
  catch(e){error.value=e.response?.data?.error?.message||'Could not close the ROI task.';}
  finally{saving.value=false;}
}
function refreshProposal(){review.presentingProblem=data.value.proposedReview?.presentingProblem||'';review.assessment=data.value.proposedReview?.assessment||'';review.followUp=data.value.proposedReview?.followUp||'';review.outcome=data.value.suggestedOutcome;review.reviewConfirmed=false;review.accurateAndComplete=false;}
function buildPresentingProblem(){review.presentingProblem=(data.value.clinicalFields||[]).filter(field=>/reason|concern|goal|harm|suicid|abuse|neglect|trauma|help/i.test(field.key)).map(field=>review.paperResponses[field.key]?`${field.label}: ${review.paperResponses[field.key]}`:'').filter(Boolean).join('\n');}
function warnUnsaved(event){if(ready&&!data.value?.signedAt&&!data.value?.roiOnly&&(dirty.value||saving.value)){event.preventDefault();event.returnValue='';}}
onBeforeUnmount(()=>{clearTimeout(timer);window.removeEventListener('beforeunload',warnUnsaved);});
</script>
<style scoped>
.h0002-backdrop{position:fixed;inset:0;background:#15213388;z-index:15000;display:flex;align-items:center;justify-content:center;padding:20px}.h0002-dialog{background:var(--bg-primary,#fff);color:var(--text-primary,#172b40);width:min(1000px,100%);max-height:94vh;overflow:auto;border-radius:14px;padding:24px;box-shadow:0 18px 60px #0003}.with-packet{width:min(1600px,100%)}.with-packet .review-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,1fr);gap:24px}.packet-preview{position:sticky;top:0;height:78vh}.packet-preview iframe{width:100%;height:92%;border:1px solid #ccd}.packet-link{display:block;margin:8px 0}footer{flex-wrap:wrap}header,footer{display:flex;align-items:center;justify-content:space-between;gap:16px}h2{margin:0}header button{border:0;background:transparent;font-size:28px;cursor:pointer}label{display:flex;flex-direction:column;gap:8px;margin:16px 0;font-weight:600}input,textarea,select{font:inherit;padding:10px;border:1px solid #aebdcb;border-radius:6px}textarea{resize:vertical;width:100%;box-sizing:border-box}.check{flex-direction:row;align-items:flex-start;font-weight:400}.check input{margin-top:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.5;background:var(--bg-secondary,#f3f6f8);padding:16px;border-radius:8px}.muted{color:var(--text-secondary,#536579);font-size:14px}.error{color:#a12525}.language-box{background:var(--bg-secondary,#f3f6f8);padding:16px;border-radius:8px}summary{cursor:pointer;font-weight:600}footer{margin-top:24px;justify-content:flex-end}button:disabled{opacity:.55;cursor:not-allowed}@media(max-width:900px){.with-packet .review-columns{grid-template-columns:1fr}.packet-preview{position:static}}
</style>
