<template>
  <section v-if="changes.length || error" class="service-changes" aria-label="Claim service corrections">
    <h3>Service corrections · claim #{{ claimId }}</h3>
    <p>A note amendment never sends a second original claim. Supervisor approval and a separate billing decision are required.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <article v-for="change in changes" :key="change.id">
      <h4>Amendment #{{ change.addendumId }} · note #{{ change.noteId }}</h4><p>{{ change.status.replaceAll('_',' ') }}</p>
      <ul><li v-for="(line,i) in change.lines" :key="i">{{ line.procedureCode }} · {{ line.units }} units</li></ul>
      <template v-if="['pending','reconciliation_required'].includes(change.status)">
        <p><strong>Transmission paused.</strong> {{ sent ? 'Reconcile the original payer claim and any payments before using the payer’s corrected-claim, void or appeal process. Record the control number/reference below. This screen does not transmit replacements or post payment adjustments.' : 'Apply approved services to this existing draft, then review charges, modifiers and diagnosis pointers and run a fresh AI review.' }}</p>
        <button :disabled="busy" @click="select(change)">Review correction</button>
        <form v-if="selected?.id===change.id" @submit.prevent="resolve">
          <label>Billing decision<select v-model="action"><option v-if="!sent" value="apply_draft">Update the existing draft</option><option value="payer_followup">Keep paused for payer correction / reconciliation</option><option v-if="sent && change.status==='reconciliation_required'" value="external_reconciled">Payer correction reconciled outside the app</option><option value="no_claim_change">Reviewed — no claim change needed</option></select></label>
          <p v-if="action==='external_reconciled'">Attest only after verifying the payer’s original and corrected outcomes, payments and any recoupment/refund. Record those references below. This closes the follow-up; it does not post or reconcile balances in this app.</p>
          <template v-if="action==='apply_draft'"><label v-for="(line,i) in selected.lines" :key="i">{{ line.procedureCode }} total line charge ($)<input v-model="charges[i]" type="number" min="0.01" max="1000000" step="0.01" required /></label><div v-for="(line,i) in selected.lines" :key="`details-${i}`"><label>{{ line.procedureCode }} modifiers (comma separated, if needed)<input v-model="lineDetails[i].modifiers" /></label><label>Diagnosis pointers (positions in this claim’s diagnosis list)<input v-model="lineDetails[i].diagnosisPointers" placeholder="1 or 1,2" required pattern="(?:[1-9]|1[0-2])(?:,(?:[1-9]|1[0-2])){0,3}" /></label></div></template>
          <label>Reason<textarea v-model="reason" minlength="10" maxlength="2000" required /></label>
          <label v-if="sent || action==='payer_followup'">Payer claim/control number and follow-up reference<input v-model="reference" minlength="3" maxlength="1000" required /></label>
          <label><input v-model="attested" type="checkbox" required /> I reviewed the approved amendment, original claim and available payment history. This decision does not authorize a duplicate original claim.</label>
          <button :disabled="busy || !attested">Save billing decision</button>
        </form>
      </template>
      <p v-else>{{ change.resolution?.reason }}</p>
    </article>
  </section>
</template>
<script setup>
import { ref,watch,onBeforeUnmount } from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:Number,claimId:Number}),emit=defineEmits(['updated']);
const changes=ref([]),sent=ref(false),revision=ref(0),busy=ref(false),error=ref(''),notice=ref(''),selected=ref(null),action=ref(''),reason=ref(''),reference=ref(''),charges=ref([]),lineDetails=ref([]),attested=ref(false);
let generation=0;
const base=()=>`/medical-billing/claimmd/claims/${props.claimId}/service-changes`;
async function load(g=generation){const {data}=await api.get(base(),{params:{agencyId:props.agencyId}});if(g===generation){changes.value=data.changes||[];sent.value=data.previouslyTransmitted;revision.value=data.revision;}}
watch(()=>[props.agencyId,props.claimId],async()=>{const g=++generation;changes.value=[];selected.value=null;error.value='';notice.value='';busy.value=false;try{await load(g);}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'Unable to load service corrections';}},{immediate:true});
onBeforeUnmount(()=>generation++);
function select(change){selected.value=change;action.value=sent.value?'payer_followup':'apply_draft';reason.value='';reference.value='';charges.value=change.lines.map(()=>'');lineDetails.value=change.lines.map(()=>({modifiers:'',diagnosisPointers:''}));attested.value=false;}
async function resolve(){if(busy.value||!attested.value)return;const g=generation;busy.value=true;error.value='';try{const {data}=await api.post(`${base()}/${selected.value.id}/resolve`,{agencyId:props.agencyId,revision:revision.value,action:action.value,reason:reason.value,reference:reference.value,charges:charges.value.map(c=>Math.round(Number(c)*100)),lineDetails:lineDetails.value.map(l=>({modifiers:l.modifiers.toUpperCase().split(/[,\s]+/).filter(Boolean),diagnosisPointers:l.diagnosisPointers})),attested:true});if(g===generation){notice.value=data.message;selected.value=null;await load(g);emit('updated');}}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'Unable to resolve this correction';}finally{if(g===generation)busy.value=false;}}
</script>
<style scoped>
.service-changes{border:1px solid #dca64b;border-radius:10px;padding:1rem;margin:1rem 0}label{display:block;margin:.75rem 0}textarea,select,input:not([type=checkbox]){display:block;padding:.5rem;max-width:100%}button{padding:.5rem;margin:.3rem}article{border-top:1px solid #ddd;padding:.75rem 0}[role=alert]{color:#a21d27}
</style>
