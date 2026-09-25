<template>
 <section class="coverage-check" aria-label="Insurance verification">
  <h4>Eligibility &amp; other insurance</h4>
  <p>Verify both policies for the visit date, then resolve payer order. Medicaid eligibility alone does not rule out other insurance or guarantee payment.</p>
  <label>Date of service <input v-model="serviceDate" type="date" :disabled="busy" @change="load" /></label>
  <button type="button" :disabled="busy" @click="load">Load verification history</button>
  <label>Billing office <select v-model="officeId" :disabled="busy"><option value="">Select</option><option v-for="office in offices" :key="office.id" :value="office.id">{{ office.name }} · {{ office.practice_npi }}</option></select></label>
  <button v-for="slot in ['primary','secondary']" :key="slot" type="button" :disabled="busy || !officeId" @click="check(slot)">Check {{ slot }} eligibility</button>
  <p>Save insurance details before checking. Eligibility must be enabled for the payer and billing NPI in Claim.MD. If unavailable, verify through the payer portal or by phone and record the evidence below.</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <ul><li v-for="blocker in evidence.blockers" :key="blocker">{{ blocker }}</li></ul>
  <article v-for="check in evidence.checks" :key="check.id">
   <strong>{{ check.policy_slot }} · {{ check.evidence?.summary?.status || check.status }} · {{ check.created_at }}</strong>
   <p v-if="check.evidence?.summary?.otherCoverageReported">Other coverage reported — investigate and resolve payer order before billing.</p>
   <details v-if="check.evidence"><summary>View payer response and benefits</summary><pre>{{ JSON.stringify(check.evidence.result,null,2) }}</pre></details>
  </article>
  <form @submit.prevent="review">
   <h5>Document verification and coordination of benefits</h5>
   <label>Outcome <select v-model="draft.status"><option value="unresolved">Unresolved — hold claims</option><option value="verified">Verified for this date</option><option value="inactive">Inactive — review coverage</option></select></label>
   <label>Source <select v-model="draft.source"><option value="payer_portal">Payer / Medicaid portal</option><option value="claimmd">Claim.MD responses</option><option value="payer_phone">Payer phone verification</option></select></label>
   <label>Evidence / reference <textarea v-model="draft.reference" maxlength="2000" required placeholder="Record portal response/reference or call reference, verification date, other-coverage findings and resolved payer order." /></label>
   <label v-for="item in attestations" :key="item.key"><input v-model="draft[item.key]" type="checkbox" /> {{ item.label }}</label>
   <button :disabled="busy">Save dated verification</button>
  </form>
 </section>
</template>
<script setup>
import {ref,watch,onMounted,onBeforeUnmount} from 'vue';
import api from '../../services/api.js';
const props=defineProps({clientId:[Number,String],agencyId:[Number,String]});
const serviceDate=ref(new Date().toLocaleDateString('en-CA')),officeId=ref(''),offices=ref([]),busy=ref(false),error=ref(''),notice=ref(''),evidence=ref({checks:[],blockers:[]});
const blank=()=>({status:'unresolved',source:'payer_portal',reference:'',primaryChecked:false,secondaryChecked:false,otherCoverageChecked:false,orderConfirmed:false,medicaidTplChecked:false});
const draft=ref(blank());let generation=0;
const attestations=[{key:'primaryChecked',label:'Primary coverage checked for this client and date'},{key:'secondaryChecked',label:'Secondary coverage checked, if recorded'},{key:'otherCoverageChecked',label:'Asked about and investigated other coverage, including reported additional payers'},{key:'orderConfirmed',label:'Confirmed payer order and resolved discrepancies'},{key:'medicaidTplChecked',label:'For Medicaid: reviewed Other Insurance / TPL in the Medicaid portal and resolved discrepancies'}];
const base=()=>`/medical-billing/clients/${props.clientId}/coverage`;
async function load(){const g=++generation;busy.value=true;error.value='';notice.value='';evidence.value={checks:[],blockers:[]};draft.value=blank();
 const [r,o]=await Promise.allSettled([api.get(base(),{params:{agencyId:props.agencyId,serviceDate:serviceDate.value}}),api.get('/medical-billing/claimmd/billing-offices',{params:{agencyId:props.agencyId}})]);
 if(g!==generation)return;
 if(r.status==='fulfilled')evidence.value=r.value.data;else error.value=r.reason.response?.data?.error?.message||'Verification history could not be loaded';
 offices.value=o.status==='fulfilled'?o.value.data.items||[]:[];
 if(o.status==='rejected')notice.value='Electronic verification is unavailable. Record payer-portal or phone verification below.';
 busy.value=false;
}
async function check(slot){const g=generation;busy.value=true;error.value='';try{await api.post(`${base()}/check`,{agencyId:props.agencyId,billingOfficeId:officeId.value,serviceDate:serviceDate.value,slot,requestKey:crypto.randomUUID()});if(g===generation)await load();}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'Coverage could not be confirmed';}finally{if(g===generation)busy.value=false;}}
async function review(){const g=generation;busy.value=true;error.value='';try{await api.post(`${base()}/review`,{agencyId:props.agencyId,serviceDate:serviceDate.value,...draft.value});if(g===generation){await load();if(g+1===generation)notice.value='Verification recorded. Eligibility is not a payment guarantee.';}}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'Verification could not be saved';}finally{if(g===generation)busy.value=false;}}
watch(()=>[props.clientId,props.agencyId],()=>{generation++;officeId.value='';offices.value=[];notice.value='';load();});onMounted(load);onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>.coverage-check{border-top:1px solid #cbd5e1;padding:16px 0;margin-top:16px}label{display:block;margin:10px 0}button{margin:6px;padding:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:22rem;overflow:auto}textarea{display:block;width:100%;min-height:80px}[role=alert]{color:#b91c1c}</style>
