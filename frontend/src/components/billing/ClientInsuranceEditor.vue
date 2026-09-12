<template>
  <section class="client-insurance-editor">
    <h4>Insurance and claim identity</h4>
    <button v-if="!opened" class="btn btn-secondary" type="button" @click="load">Review private insurance details</button>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <form v-if="opened && draft" @submit.prevent="save">
      <label v-if="policies.length">Submitted policies<select v-model="selectedPolicyId" @change="useSubmittedPolicy"><option value="">Select a submission to review</option><option v-for="policy in policies" :key="policy.id" :value="policy.id">{{ policy.submittedBy }} · {{ policy.primary.insurerName || 'Policy' }}</option></select></label>
      <p v-if="policies.length > 1">Review which policy is primary and which is secondary. A new guardian’s submission does not automatically replace existing coverage.</p>
      <div v-if="selectedPolicyId"><button v-for="slot in ['primary_front','primary_back','secondary_front','secondary_back']" :key="slot" type="button" class="btn btn-secondary" @click="downloadEvidence(slot)">Download {{ slot.replaceAll('_',' ') }} evidence</button></div>
      <h5>Client identity for claims</h5><div class="identity-fields"><label v-for="field in patientFields" :key="field.key">{{ field.label }}<input v-model="draft.patient[field.key]" :type="field.type || 'text'" maxlength="255" /></label></div>
      <h5>Primary coverage</h5><InsurancePolicyFields v-model="draft.primary" />
      <label><input v-model="hasSecondary" type="checkbox" /> Secondary coverage</label><InsurancePolicyFields v-if="hasSecondary" v-model="draft.secondary" />
      <ul v-if="issues.length"><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul>
      <label>Provider accepts assignment of insurance payment<select v-model="draft.acceptAssignment"><option :value="null">Select</option><option :value="true">Yes</option><option :value="false">No</option></select></label>
      <label><input v-model="verified" type="checkbox" /> I reviewed this client’s identity and subscriber details against the policy and verified coverage for claim preparation.</label>
      <div><button class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save insurance' }}</button> <button class="btn btn-secondary" type="button" @click="opened=false;draft=null">Close private details</button></div>
    </form>
  </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
import InsurancePolicyFields from './InsurancePolicyFields.vue';
const props=defineProps({clientId:[String,Number],agencyId:[String,Number]});
const opened=ref(false),draft=ref(null),hasSecondary=ref(false),verified=ref(false),busy=ref(false),error=ref(''),notice=ref(''),issues=ref([]);
const patientFields=[{key:'firstName',label:'Legal first name'},{key:'lastName',label:'Legal last name'},{key:'dateOfBirth',label:'Date of birth',type:'date'},{key:'sex',label:'Sex on claim (M/F/U)'},{key:'addressLine1',label:'Address'},{key:'addressLine2',label:'Apartment/suite'},{key:'city',label:'City'},{key:'state',label:'State'},{key:'postalCode',label:'ZIP code'}];
const policies=ref([]),selectedPolicyId=ref('');
function useSubmittedPolicy(){const policy=policies.value.find(p=>p.id===selectedPolicyId.value);if(!policy)return;draft.value.primary={...policy.primary};draft.value.secondary={...(policy.secondary || {})};draft.value.profileId=policy.id;hasSecondary.value=!!policy.secondary;verified.value=false;}
let seq=0;
async function load(){const n=++seq;error.value='';try{const res=await api.get(`/medical-billing/clients/${props.clientId}/insurance`,{params:{agencyId:props.agencyId}});if(n!==seq)return;const v=res.data.insurance || {};policies.value=res.data.policies || [];selectedPolicyId.value='';draft.value={profileId:v.profileId || null,acceptAssignment:v.acceptAssignment ?? null,primary:{...(v.primary || {})},secondary:{...(v.secondary || {})},patient:{...(v.patient || {})}};hasSecondary.value=!!v.secondary;verified.value=false;issues.value=res.data.missingClaimFields || [];opened.value=true;}catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'Insurance could not be loaded';}}
async function downloadEvidence(slot){const n=seq;error.value='';try{const res=await api.get(`/clients/${props.clientId}/insurance-card`,{params:{profileId:selectedPolicyId.value,slot},responseType:'blob'});if(n!==seq)return;const url=URL.createObjectURL(res.data);const anchor=document.createElement('a');anchor.href=url;anchor.download=`insurance-${slot}.${res.data.type==='application/pdf'?'pdf':res.data.type==='image/png'?'png':'jpg'}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(n===seq)error.value='This card image could not be downloaded; it may not be on file.';}}
async function save(){busy.value=true;error.value='';const n=seq;try{const res=await api.put(`/medical-billing/clients/${props.clientId}/insurance`,{agencyId:props.agencyId,...draft.value,secondary:hasSecondary.value?draft.value.secondary:null,verifiedForClaims:verified.value});if(n!==seq)return;issues.value=res.data.missingClaimFields || [];notice.value='Encrypted insurance saved for this client.';}catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'Insurance could not be saved';}finally{busy.value=false;}}
watch(()=>[props.agencyId,props.clientId],()=>{seq++;opened.value=false;draft.value=null;policies.value=[];selectedPolicyId.value='';error.value='';notice.value='';});
</script>
<style scoped>.client-insurance-editor {padding:16px;border:1px solid #cbd5e1;border-radius:10px;margin:16px 0}.client-insurance-editor form {display:grid;gap:16px}.identity-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.identity-fields label{display:grid;gap:5px}input:not([type=checkbox]){padding:9px;border:1px solid #94a3b8;border-radius:6px}p[role=alert]{color:#b91c1c}</style>
