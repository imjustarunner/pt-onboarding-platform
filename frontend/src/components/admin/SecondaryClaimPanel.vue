<template>
  <section class="secondary-claim">
    <h3>Secondary insurance</h3>
    <button type="button" :disabled="busy" @click="load">Prepare / update secondary draft</button>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <form v-if="lines.length" @submit.prevent="save">
      <p>Enter the primary payer’s actual ERA/EOB payment or denial, including every service line. Upload the proof even when the ERA is unavailable in this app. Saving prepares a secondary draft for separate review and approval.</p>
      <label>Where was the primary claim submitted?
        <select v-model="primarySource"><option value="app_primary">Through this app</option><option value="external_primary">Outside this app</option></select>
      </label>
      <label v-if="primarySource === 'external_primary'">External submission system or source
        <input v-model="externalSystem" maxlength="255" minlength="3" placeholder="For example, TherapyNotes or the payer portal" required />
      </label>
      <p v-if="primarySource === 'external_primary'">This records external adjudication with proof. It does not mark the primary as sent by this app. The primary is held against accidental resubmission.</p>
      <fieldset class="proof-upload"><legend>Primary ERA/EOB or denial proof</legend>
        <label>Proof type<select v-model="proofKind"><option value="primary_eob">Primary EOB</option><option value="primary_era">Primary ERA</option><option value="payer_denial">Payer denial</option></select></label>
        <label>Where did the proof come from?<input v-model="proofSource" maxlength="255" placeholder="Payer portal, mailed EOB, fax…" /></label>
        <label>Upload proof (PDF, PNG, JPEG or 835 ERA; up to 10 MB)
          <input ref="fileInput" type="file" accept=".pdf,.png,.jpg,.jpeg,.835,.edi,.txt" @change="chooseProof" />
        </label>
        <button type="button" :disabled="busy || !proofFile || proofSource.trim().length < 3" @click="uploadProof">Upload proof</button>
        <ul v-if="proofs.length"><li v-for="proof in proofs" :key="proof.id"><label class="check"><input v-model="selectedProofs" type="checkbox" :value="proof.id" />{{ proof.filename }} · {{ proof.source }}</label><button type="button" :disabled="busy" @click="downloadProof(proof)">Download proof</button><small>Uploaded {{ proof.uploadedAt || 'just now' }} · User {{ proof.uploadedByUserId }}</small></li></ul>
        <p v-else>No proof uploaded yet. Files remain private to authorized billing staff and stay attached to this primary claim’s history.</p>
      </fieldset>
      <label>Primary payer claim/control number<input v-model="control" maxlength="100" required /></label>
      <label>ERA/EOB reference<input v-model="reference" maxlength="2000" required /></label>
      <label>Payment / adjudication date<input v-model="paymentDate" type="date" required /></label>
      <article v-for="(line,i) in lines" :key="i">
        <h4>Line {{ i+1 }} · {{ line.procedure_code }} · {{ line.units }} unit(s) · billed ${{ (line.charge_cents/100).toFixed(2) }}</h4>
        <label>Primary paid ($)<input v-model="line.paid" type="number" min="0" step="0.01" required /></label>
        <div v-for="(adj,j) in line.adjustments" :key="j" class="adjustment">
          <label>Adjustment (e.g. CO45, PR1)<input v-model="adj.code" maxlength="6" required /></label>
          <label>Amount ($)<input v-model="adj.amount" type="number" min="0" step="0.01" required /></label>
          <button type="button" @click="line.adjustments.splice(j,1)">Remove</button>
        </div>
        <button type="button" :disabled="line.adjustments.length>=8" @click="line.adjustments.push({code:'',amount:''})">Add adjustment</button>
      </article>
      <p>For Medicaid secondary, verify why the primary did not pay. A clearinghouse rejection, missing-information, duplicate-claim or out-of-network denial does not establish that the service is not covered.</p>
      <label class="check"><input v-model="crossover" type="checkbox" />I checked that the primary has not already forwarded this claim to secondary and that it was not submitted there separately.</label>
      <label class="check"><input v-model="attested" type="checkbox" />I reviewed the selected proof. The payer order, primary claim number, service dates, codes, units, billed charges, payments and denial/adjustment reasons match it, and any required waiting period has passed.</label>
      <button :disabled="busy || !selectedProofs.length || !crossover || !attested">Save secondary draft for review</button>
    </form>
  </section>
</template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api.js';
const props=defineProps({agencyId:[Number,String],claimId:[Number,String]});
const emit=defineEmits(['created']);
const lines=ref([]),control=ref(''),reference=ref(''),paymentDate=ref(''),crossover=ref(false),attested=ref(false),busy=ref(false),error=ref(''),notice=ref('');
const primarySource=ref('app_primary'),externalSystem=ref(''),proofs=ref([]),selectedProofs=ref([]),proofKind=ref('primary_eob'),proofSource=ref(''),proofFile=ref(null),fileInput=ref(null);
let generation=0;
function reset(){generation++;lines.value=[];control.value='';reference.value='';paymentDate.value='';crossover.value=false;attested.value=false;busy.value=false;error.value='';notice.value='';primarySource.value='app_primary';externalSystem.value='';proofs.value=[];selectedProofs.value=[];proofFile.value=null;proofSource.value='';if(fileInput.value)fileInput.value.value='';}
async function load(){
 const g=++generation;busy.value=true;error.value='';notice.value='';lines.value=[];selectedProofs.value=[];proofFile.value=null;
 try{
  const {data}=await api.get(`/medical-billing/claimmd/claims/${props.claimId}/draft`,{params:{agencyId:props.agencyId}});
  if(g!==generation)return;
  if(data.claim.parent_claim_id)throw new Error(`This is already secondary. Open its primary claim to review the ERA/EOB.`);
  primarySource.value=data.claim.claimmd_submitted_at?'app_primary':'external_primary';
  const [proofResponse,reviewResponse]=await Promise.all([api.get(`/medical-billing/claims/${props.claimId}/primary-proof`,{params:{agencyId:props.agencyId}}),api.get(`/medical-billing/claims/${props.claimId}/secondary-review`,{params:{agencyId:props.agencyId}})]);
  if(g!==generation)return;
  proofs.value=proofResponse.data.items || [];
  const saved=reviewResponse.data.adjudication;
  const restore=saved && !reviewResponse.data.stale && saved.lines?.length===data.lines.length && saved.lines.every((line,i)=>line.procedureCode===data.lines[i].procedure_code && Number(line.units)===Number(data.lines[i].units));
  lines.value=data.lines.map((line,i)=>({...line,paid:restore?(Number(saved.lines[i].paidCents)/100).toFixed(2):'0.00',adjustments:restore?saved.lines[i].adjustments.map(a=>({code:a.code,amount:(a.amountCents/100).toFixed(2)})):[]}));
  control.value=restore?saved.primaryClaimControlNumber:'';reference.value=restore?saved.reference:'';paymentDate.value=restore?saved.paymentDate:'';
  externalSystem.value=restore?saved.externalSystem || '':'';if(restore)primarySource.value=saved.source;
  selectedProofs.value=restore?(saved.evidenceIds || []).filter(id=>proofs.value.some(file=>file.id===id)):[];
  crossover.value=false;attested.value=false;
  if(reviewResponse.data.stale)notice.value='The primary changed since its last review. Re-enter adjudication from the proof and confirm the service lines before saving.';
 }catch(e){if(g===generation)error.value=e.response?.data?.error?.message || e.message;}finally{if(g===generation)busy.value=false;}
}
function chooseProof(event){proofFile.value=event.target.files?.[0] || null;}
async function uploadProof(){
 const g=generation,agencyId=props.agencyId,claimId=props.claimId;busy.value=true;error.value='';
 try{
  const body=new FormData();body.append('file',proofFile.value);body.append('kind',proofKind.value);body.append('source',proofSource.value);
  const {data}=await api.post(`/medical-billing/claims/${claimId}/primary-proof`,body,{params:{agencyId}});
  if(g!==generation)return;
  proofs.value.push(data.item);selectedProofs.value.push(data.item.id);proofFile.value=null;if(fileInput.value)fileInput.value.value='';notice.value='Proof uploaded and selected. Review its details before saving adjudication.';
 }catch(e){if(g===generation)error.value=e.response?.data?.error?.message || e.message;}finally{if(g===generation)busy.value=false;}
}
async function downloadProof(proof){
 const g=generation;busy.value=true;error.value='';
 try{const {data}=await api.get(`/medical-billing/claims/${props.claimId}/primary-proof/${proof.id}/download`,{params:{agencyId:props.agencyId},responseType:'blob'});if(g!==generation)return;const url=URL.createObjectURL(data),link=document.createElement('a');link.href=url;link.download=proof.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(g===generation)error.value=e.message;}finally{if(g===generation)busy.value=false;}
}
function cents(value){if(!/^\d+(\.\d{1,2})?$/.test(String(value)))throw new Error('Enter dollar amounts with no more than two decimal places');return Math.round(Number(value)*100);}
async function save(){
 const g=generation;busy.value=true;error.value='';
 try{
  const adjudication={source:primarySource.value,externalSystem:externalSystem.value,evidenceIds:[...selectedProofs.value],primaryClaimControlNumber:control.value,reference:reference.value,paymentDate:paymentDate.value,crossoverConfirmedAbsent:crossover.value,attested:attested.value,lines:lines.value.map(l=>({paidCents:cents(l.paid),adjustments:l.adjustments.map(a=>({code:a.code.trim().toUpperCase(),amountCents:cents(a.amount)}))}))};
  const {data}=await api.post(`/medical-billing/claims/${props.claimId}/secondary`,{agencyId:props.agencyId,adjudication});
  if(g===generation){notice.value='Secondary draft saved with the reviewed proof. Review and approve it separately before transmission.';lines.value=[];emit('created',data.claimId);}
 }catch(e){if(g===generation)error.value=e.response?.data?.error?.message || e.message;}finally{if(g===generation)busy.value=false;}
}
watch([lines,control,reference,paymentDate,primarySource,externalSystem,selectedProofs],()=>{attested.value=false;},{deep:true});
watch(()=>[props.agencyId,props.claimId],reset);onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>
.secondary-claim{padding:16px;border:1px solid var(--border,#cbd5e1);margin:15px 0;border-radius:8px;min-width:0}label{display:grid;gap:5px;margin:12px 0}.check{display:flex;align-items:start;gap:8px}article{padding:12px 0;border-bottom:1px solid #cbd5e1}.adjustment{display:flex;gap:10px;align-items:center;flex-wrap:wrap}button{margin:5px 5px 5px 0;padding:8px;cursor:pointer}input,select{max-width:100%;box-sizing:border-box;padding:8px;border:1px solid #a9bbcd;border-radius:6px}.check input{margin-top:4px}fieldset{border:1px solid #cbd5e1;border-radius:8px;margin:18px 0;padding:12px}small{display:block;color:#596b7d}li{margin-bottom:12px;overflow-wrap:anywhere}[role=alert]{color:#b91c1c}button:disabled{opacity:.5;cursor:default}
</style>
