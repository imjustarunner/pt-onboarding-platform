<template>
 <section class="eligibility-summary" aria-label="Policy and benefits from verification">
  <p class="source">Claim.MD check #{{ checkId }} · Service date {{ displayDate(serviceDate) }}<span v-if="checkedAt"> · Checked {{ formatBillingTimestamp(checkedAt) }}</span></p>
  <p v-if="isCurrent===false" role="status">Historical response — saved insurance has changed. Reconcile the current policy before using these details.</p>
  <p v-if="identityMatches!==true" role="status">Returned identity needs confirmation before these details can update insurance.</p>
  <div v-for="policy in details.policies || []" :key="policy.memberIndex" class="policy-snapshot">
   <h5>Returned policy details</h5>
   <dl><template v-for="field in visiblePolicyFields(policy)" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></template></dl>
  </div>
  <details v-if="conflicts.length"><summary>Saved entries differ from the response ({{ conflicts.length }})</summary><p>Existing entries are preserved. Review differences before changing insurance.</p><dl><template v-for="item in conflicts" :key="item.key"><dt>{{ labels[item.key] || item.key }}</dt><dd>Saved: {{ item.saved }} · Returned: {{ item.returned }}</dd></template></dl></details>
  <button v-if="allowImport && identityMatches===true && isCurrent===true" type="button" :disabled="busy || dirty" @click="$emit('import-details')">Fill missing policy details from this check</button>
  <p v-if="allowImport && dirty">Save your current edits before importing saved verification details.</p>
  <section class="other-coverage" aria-label="Other insurance reported">
   <h5>{{ otherCoverageReported || details.otherCoverageReported ? 'Other insurance reported — billing review needed' : 'No other coverage reported by this check' }}</h5>
   <p v-if="otherCoverageReported || details.otherCoverageReported">Confirm the insurer, member/subscriber details, coverage dates and payer order. A reported insurer may belong in primary or secondary.</p>
   <article v-for="item in details.otherInsurance || []" :key="item.id">
    <strong>{{ item.name }}</strong><p v-if="item.role">Reported role: {{ roles[item.role] || item.role }}</p>
    <p v-if="item.reportedPolicyNumber">Reported policy/reference number: {{ item.reportedPolicyNumber }}</p>
    <p v-if="item.phone || item.address">{{ [item.phone,item.address].filter(Boolean).join(' · ') }}</p>
    <p v-if="item.beginDate || item.endDate">Reported dates: {{ item.beginDate || 'Not returned' }} — {{ item.endDate || 'Not returned' }}</p>
    <template v-if="allowDraft && item.canDraft && identityMatches===true && isCurrent===true"><button v-for="slot in ['primary','secondary']" :key="slot" type="button" :disabled="busy || dirty || !availableSlots.includes(slot)" @click="$emit('draft-policy',{candidateId:item.id,slot})">Add as {{ slot }} draft</button></template>
   </article>
  </section>
  <h5 v-if="details.benefits?.length">Returned benefits</h5>
  <p v-if="details.benefits?.length">Amounts keep their service, network, coverage level and period. These are reported benefits; final patient responsibility requires billing review.</p>
  <div v-if="details.benefits?.length" class="benefit-table"><table><thead><tr><th>Benefit / service</th><th>Network / level</th><th>Reported amount</th><th>Period / dates</th><th>Requirements / limits / notes</th></tr></thead><tbody>
   <tr v-for="row in visibleBenefits" :key="row.id"><td><strong>{{ kinds[row.kind] || row.kindDescription || row.kind || 'Benefit' }}</strong><br />{{ row.serviceDescription || services[row.serviceCode] || row.serviceCode || 'Service not specified' }}<small v-if="row.planName || row.insuranceType">{{ [row.planName,row.insuranceType].filter(Boolean).join(' · ') }}</small></td>
    <td>{{ networks[row.network] || row.network || 'Network not specified' }}<br />{{ row.levelDescription || levels[row.levelCode] || row.levelCode || 'Level not specified' }}</td>
    <td><span v-if="row.amount!==''">{{ money(row.amount) }}</span><span v-if="row.percent!==''">{{ row.amount!=='' ? ' · ' : '' }}{{ row.percent }}%</span><span v-if="row.amount==='' && row.percent===''">Not returned</span></td>
    <td>{{ row.periodDescription || periods[row.periodCode] || row.periodCode || 'Period not specified' }}<small v-if="row.beginDate || row.endDate">{{ row.beginDate || 'Not returned' }} — {{ row.endDate || 'Not returned' }}</small></td>
    <td><span v-if="row.authorizationRequired">Authorization: {{ yesNo(row.authorizationRequired) }}<br /></span><span v-if="row.quantity!==''">{{ row.quantity }} {{ row.quantityType || 'units (type not returned)' }}<br /></span>{{ row.notes }}</td></tr>
  </tbody></table></div>
  <button v-if="details.benefits?.length>30" type="button" @click="showAll=!showAll">{{ showAll ? 'Show first 30 benefits' : `Show all ${details.benefits.length} benefits` }}</button>
 </section>
</template>
<script setup>
import {computed,ref} from 'vue';
import {formatBillingDate,formatBillingTimestamp} from '../../utils/billingReviewDisplay.js';
const props=defineProps({details:{type:Object,default:()=>({})},checkId:[Number,String],serviceDate:String,checkedAt:String,identityMatches:{default:null},isCurrent:{default:null},otherCoverageReported:Boolean,allowImport:Boolean,allowDraft:Boolean,busy:Boolean,dirty:Boolean,currentPolicy:Object,availableSlots:{type:Array,default:()=>[]}});
defineEmits(['import-details','draft-policy']);
const showAll=ref(false),visibleBenefits=computed(()=>showAll.value?props.details.benefits:props.details.benefits?.slice(0,30));
const labels={insurerName:'Payer',memberId:'Member ID',groupNumber:'Group number',groupName:'Group name',planName:'Plan name',planNumber:'Plan number',planType:'Plan type',subscriberFirstName:'Subscriber first name',subscriberLastName:'Subscriber last name',subscriberDob:'Subscriber birthdate',subscriberSex:'Subscriber sex',subscriberAddressLine1:'Subscriber address',subscriberAddressLine2:'Apartment / suite',subscriberCity:'Subscriber city',subscriberState:'Subscriber state',subscriberPostalCode:'Subscriber ZIP',effectiveDate:'Coverage effective date',terminationDate:'Coverage end date',payerPhone:'Payer contact phone',payerAddressLine1:'Payer contact address',payerCity:'Payer city',payerState:'Payer state',payerPostalCode:'Payer ZIP'};
const kinds={'1':'Active coverage','2':'Active capitation','3':'Active services capitated','4':'Active primary-care capitation','5':'Active — pending investigation','6':'Inactive coverage','7':'Inactive — pending update','8':'Inactive — pending investigation',A:'Coinsurance',B:'Copay',C:'Deductible',G:'Out-of-pocket limit',E:'Exclusion',F:'Limitation',H:'Unlimited',I:'Not covered',R:'Other payer',U:'Contact the listed entity',D:'Benefit description',P:'Benefit disclaimer'};
const services={'30':'Health plan coverage',MH:'Mental health',A4:'Psychiatric',A6:'Psychotherapy','98':'Office visit'},networks={Y:'In network',N:'Out of network',W:'Network does not apply',U:'Network unknown'},levels={IND:'Individual',FAM:'Family'},roles={PRP:'Primary payer',SEP:'Secondary payer',TTP:'Tertiary payer',PR:'Payer'};
const periods={'23':'Calendar year','24':'Year to date','27':'Visit','29':'Remaining','30':'Exceeded','31':'Not exceeded','32':'Lifetime','33':'Lifetime remaining','34':'Month','35':'Week','22':'Service year','25':'Contract','26':'Episode'};
const displayDate=value=>value?formatBillingDate(value):'Not recorded';
const money=value=>/^-?\d+(?:\.\d{1,2})?$/.test(value)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)):value;
const yesNo=value=>({Y:'Required',N:'Not required',U:'Unknown'})[value]||value;
function visiblePolicyFields(policy){return Object.entries(labels).filter(([key])=>policy[key]).map(([key,label])=>({key,label,value:policy[key]}));}
const conflicts=computed(()=>{const policy=props.details.policies?.length===1?props.details.policies[0]:null;return policy&&props.currentPolicy?Object.keys(labels).filter(key=>policy[key]&&props.currentPolicy[key]&&String(policy[key]).trim()!==String(props.currentPolicy[key]).trim()).map(key=>({key,saved:props.currentPolicy[key],returned:policy[key]})):[];});
</script>
<style scoped>
.eligibility-summary{padding:12px 0;min-width:0}.source{font-size:.85rem;color:var(--text-secondary,#52617a)}h5{font-size:1rem;margin:14px 0 8px}dl{display:grid;grid-template-columns:minmax(130px,1fr) 3fr;gap:6px 12px;margin:8px 0}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}.other-coverage{border:1px solid var(--border,#dce5ed);border-radius:8px;padding:12px;margin:12px 0}.other-coverage h5{margin-top:0}article{border-top:1px solid var(--border,#dce5ed);padding:10px 0}.benefit-table{max-height:24rem;overflow:auto;border:1px solid var(--border,#dce5ed);border-radius:8px;overflow-anchor:none}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid var(--border,#dce5ed);min-width:120px}th{position:sticky;top:0;background:var(--bg-secondary,#f4f7fb)}small{display:block;margin-top:4px}button{font:inherit;border:1px solid var(--border,#bccbd9);border-radius:6px;background:var(--bg-primary,#fff);color:inherit;padding:8px 12px;margin:6px 6px 6px 0;cursor:pointer}button:disabled{opacity:.6;cursor:default}details{margin:12px 0}summary{cursor:pointer;font-weight:600}@media(max-width:600px){dl{grid-template-columns:1fr}dd{margin-bottom:8px}}
</style>
