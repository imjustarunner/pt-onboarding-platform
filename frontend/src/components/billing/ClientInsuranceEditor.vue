<template>
  <section v-if="canSeeBilling" class="client-insurance-editor">
    <h4>Insurance and claim identity</h4>
    <button v-if="!opened" class="btn btn-secondary" type="button" @click="load">Review private insurance details</button>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <form v-if="opened && draft" novalidate @submit.prevent="save">
      <p class="insurance-help">Save partial information at any time. Missing claim fields prevent submission, not saving. Review details copied from Demographics against the insurance card.</p>
      <section v-if="policies.length" aria-label="Submitted insurance policies" class="coverage-review">
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
      <h5>Client identity for claims</h5><button type="button" class="btn btn-secondary" @click="useDemographics">Fill missing fields from Demographics</button><div class="identity-fields"><label v-for="field in patientFields" :key="field.key">{{ field.label }}<input v-model="draft.patient[field.key]" :type="field.type || 'text'" maxlength="255" /></label></div>
      <h5>Primary coverage</h5><InsurancePolicyFields v-model="draft.primary" :patient="draft.patient" :require-complete="false" />
      <label><input v-model="hasSecondary" type="checkbox" /> Secondary coverage</label><InsurancePolicyFields v-if="hasSecondary" v-model="draft.secondary" :patient="draft.patient" :require-complete="false" />
      <ul v-if="issues.length"><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul>
      <label>Provider accepts assignment of insurance payment<select v-model="draft.acceptAssignment"><option :value="null">Select</option><option :value="true">Yes</option><option :value="false">No</option></select></label>
      <label><input v-model="verified" type="checkbox" /> I reviewed this client’s identity and subscriber details against the policy and verified coverage for claim preparation.</label>
      <div><button class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save insurance information' }}</button> <button class="btn btn-secondary" type="button" @click="opened=false;draft=null">Close private details</button></div>
    </form>
    <ClientCoverageVerification v-if="opened" :client-id="clientId" :agency-id="agencyId" />
  </section>
</template>
<script setup>
import {ref,watch,computed} from 'vue';
import { useAuthStore } from '../../store/auth';
import { canAccessMedicalBilling } from '../../config/medicalBillingAccess.js';
const authStore = useAuthStore();
const canSeeBilling = computed(() => canAccessMedicalBilling(authStore.user, props.agencyId));
import api from '../../services/api';
import InsurancePolicyFields from './InsurancePolicyFields.vue';
import ClientCoverageVerification from './ClientCoverageVerification.vue';
const props=defineProps({clientId:[String,Number],agencyId:[String,Number]});
const opened=ref(false),draft=ref(null),hasSecondary=ref(false),verified=ref(false),busy=ref(false),error=ref(''),notice=ref(''),issues=ref([]);
const patientFields=[{key:'firstName',label:'Legal first name'},{key:'lastName',label:'Legal last name'},{key:'dateOfBirth',label:'Date of birth',type:'date'},{key:'sex',label:'Sex on claim (M/F/U)'},{key:'addressLine1',label:'Address'},{key:'addressLine2',label:'Apartment/suite'},{key:'city',label:'City'},{key:'state',label:'State'},{key:'postalCode',label:'ZIP code'}];
const policies=ref([]),selectedSources=ref({primary:'',secondary:''}),demographics=ref({});
const coverageChoices=computed(()=>policies.value.flatMap(policy=>['primary','secondary'].filter(slot=>policy[slot]).map(slot=>({key:`${policy.id}:${slot}`,profileId:policy.id,slot,coverage:policy[slot],label:`${policy.submittedBy} · ${policy[slot].insurerName || 'Policy'}${slot === 'secondary' ? ' (additional submitted policy)' : ''}`}))));
const evidenceSlots=policy=>Object.entries(policy.cardEvidence || {}).filter(([,present])=>present).map(([slot])=>slot);
function useDemographics(){if(!draft.value)return;for(const [key,value] of Object.entries(demographics.value))if(!draft.value.patient[key] && value)draft.value.patient[key]=value;verified.value=false;}
function useSubmittedPolicy(position){const policy=coverageChoices.value.find(p=>p.key===selectedSources.value[position]);draft.value.coverageSources ||= {};if(!policy){delete draft.value.coverageSources[position];if(position==='primary')draft.value.profileId=null;verified.value=false;return;}draft.value[position]={...policy.coverage};draft.value.coverageSources[position]={profileId:policy.profileId,slot:policy.slot};if(position==='primary')draft.value.profileId=policy.profileId;else hasSecondary.value=true;verified.value=false;}
function swapCoverage(){[draft.value.primary,draft.value.secondary]=[draft.value.secondary,draft.value.primary];draft.value.coverageSources ||= {};[draft.value.coverageSources.primary,draft.value.coverageSources.secondary]=[draft.value.coverageSources.secondary,draft.value.coverageSources.primary];[selectedSources.value.primary,selectedSources.value.secondary]=[selectedSources.value.secondary,selectedSources.value.primary];draft.value.profileId=draft.value.coverageSources.primary?.profileId || null;verified.value=false;}
let seq=0;
async function load(){const n=++seq;error.value='';notice.value='';try{const res=await api.get(`/medical-billing/clients/${props.clientId}/insurance`,{params:{agencyId:props.agencyId}});if(n!==seq)return;const v=res.data.insurance || {};demographics.value=res.data.demographics || {};policies.value=res.data.policies || [];selectedSources.value=Object.fromEntries(['primary','secondary'].map(slot=>[slot,v.coverageSources?.[slot]?`${v.coverageSources[slot].profileId}:${v.coverageSources[slot].slot}`:'']));draft.value={profileId:v.profileId || null,coverageSources:structuredClone(v.coverageSources || {}),acceptAssignment:v.acceptAssignment ?? null,primary:{...(v.primary || {})},secondary:{...(v.secondary || {})},patient:{...(v.patient || {})}};useDemographics();hasSecondary.value=!!v.secondary;verified.value=false;issues.value=res.data.missingClaimFields || [];opened.value=true;}catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'Insurance could not be loaded';}}
async function downloadEvidence(profileId,slot){const n=seq;error.value='';try{const res=await api.get(`/clients/${props.clientId}/insurance-card`,{params:{profileId,slot},responseType:'blob'});if(n!==seq)return;const url=URL.createObjectURL(res.data);const anchor=document.createElement('a');anchor.href=url;anchor.download=`insurance-${slot}.${res.data.type==='application/pdf'?'pdf':res.data.type==='image/png'?'png':'jpg'}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(n===seq)error.value='This card image could not be downloaded; it may not be on file.';}}
async function save(){busy.value=true;error.value='';notice.value='';const n=seq;try{const res=await api.put(`/medical-billing/clients/${props.clientId}/insurance`,{agencyId:props.agencyId,...draft.value,secondary:hasSecondary.value?draft.value.secondary:null,verifiedForClaims:verified.value});if(n!==seq)return;issues.value=res.data.missingClaimFields || [];draft.value={...draft.value,...res.data.insurance};notice.value=issues.value.length ? `Insurance saved. ${issues.value.length} missing claim fields still need review before submission.` : 'Insurance saved. Claim submission still requires its readiness review and approval.';}catch(e){if(n===seq)error.value=e.response?.data?.error?.message || 'Insurance could not be saved';}finally{busy.value=false;}}
watch(()=>[props.agencyId,props.clientId],()=>{seq++;opened.value=false;draft.value=null;policies.value=[];selectedSources.value={primary:'',secondary:''};error.value='';notice.value='';demographics.value={};});
</script>
<style scoped>.client-insurance-editor {padding:16px;border:1px solid var(--border);border-radius:10px;margin:16px 0}.client-insurance-editor form {display:grid;gap:16px}.identity-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.identity-fields label{display:grid;gap:5px}input:not([type=checkbox]){padding:9px;border:1px solid var(--app-line, #94a3b8);border-radius:6px}p[role=alert]{color:var(--app-text-red, #b91c1c)}</style>
