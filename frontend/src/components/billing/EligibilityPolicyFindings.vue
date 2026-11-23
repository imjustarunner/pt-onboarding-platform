<template>
 <section aria-label="Information returned by insurers">
  <h4>Benefits and other coverage</h4>
  <p v-if="!findings.length">No verification results are saved yet. Complete the policy details, then check coverage.</p>
  <p v-else>Use the saved response to fill missing details. Other insurance stays under review until its coverage and billing order are confirmed.</p>
  <article v-for="finding in latest" :key="finding.id" class="finding">
   <h5>{{ finding.slot==='secondary'?'Secondary':'Primary' }} · {{ payerName(finding) }} · {{ statusLabel(finding.status) }}</h5>
   <EligibilityBenefitsSummary v-if="finding.details" :details="finding.details" :check-id="finding.id" :service-date="String(finding.serviceDate || '').slice(0,10)" :checked-at="finding.checkedAt" :identity-matches="finding.identityMatches" :is-current="finding.isCurrent" :other-coverage-reported="finding.otherCoverageReported" :current-policy="insurance?.[finding.slot]" :allow-import="finding.status==='active_reported'" allow-draft :busy="busy" :dirty="dirty" :available-slots="availableSlots" @import-details="$emit('import-details',finding)" @draft-policy="$emit('draft-policy',{...$event,finding})" />
   <template v-else><p v-if="finding.otherCoverageReported">Other insurance reported — billing review needed.</p><p v-if="finding.response && finding.identityMatches!==true">Returned identity needs confirmation before these details can update insurance.</p><ul v-if="finding.otherInsurers?.length"><li v-for="(item,index) in finding.otherInsurers" :key="index">{{ item.entity_name || 'Other insurer reported without a name' }}</li></ul></template>
   <details v-if="finding.response"><summary>Full saved payer response</summary><PayerResponseFields :value="finding.response" /></details>
   <p v-else>No payer response was saved. This attempt does not verify coverage.</p>
  </article>
  <details v-if="older.length"><summary>Earlier verification results ({{ older.length }})</summary><article v-for="finding in older" :key="finding.id" class="finding"><h5>Check #{{ finding.id }} · {{ finding.slot }} · {{ String(finding.serviceDate || '').slice(0,10) }}</h5><PayerResponseFields v-if="finding.response" :value="finding.response" /><p v-else>No payer response was saved.</p></article></details>
 </section>
</template>
<script setup>
import {computed} from 'vue';
import EligibilityBenefitsSummary from './EligibilityBenefitsSummary.vue';
import PayerResponseFields from './PayerResponseFields.vue';
const props=defineProps({findings:{type:Array,default:()=>[]},insurance:Object,busy:Boolean,dirty:Boolean});
const payerName=finding=>(finding.isCurrent===true?props.insurance?.[finding.slot]?.insurerName:'')||finding.details?.policies?.[0]?.insurerName||'Payer response';
const statusLabel=value=>({active_reported:'Active coverage reported',inactive_reported:'Inactive coverage reported',review_required:'Billing review needed',error:'Check failed'})[value]||String(value||'').replaceAll('_',' ');
defineEmits(['import-details','draft-policy']);
const latest=computed(()=>[...new Set(props.findings.map(f=>f.slot))].map(slot=>props.findings.find(f=>f.slot===slot&&f.response)||props.findings.find(f=>f.slot===slot)));
const older=computed(()=>props.findings.filter(f=>!latest.value.some(item=>item.id===f.id)));
const availableSlots=computed(()=>['primary','secondary'].filter(slot=>!Object.values(props.insurance?.[slot]||{}).some(value=>value===true||typeof value==='string'&&value.trim())));
</script>
<style scoped>.finding{border:1px solid var(--border,#dce5ed);border-radius:10px;padding:16px;margin:12px 0;min-width:0}h4{margin:0 0 8px}h5{font-size:1rem;margin:0}summary{cursor:pointer;font-weight:600}details{margin-top:12px}</style>
