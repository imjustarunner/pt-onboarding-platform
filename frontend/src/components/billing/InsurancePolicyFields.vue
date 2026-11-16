<template>
  <div class="policy-fields">
    <label>{{ tx('Coverage category') }}<select :value="modelValue.programType || ''" @change="update('programType',$event.target.value)"><option value="">{{ tx('Not classified') }}</option><option value="commercial">Commercial</option><option value="medicaid">Medicaid</option><option value="tricare">TRICARE</option><option value="medicare">Medicare</option></select></label>
    <label>{{ tx('Client’s relationship to subscriber') }}<select aria-label="Relationship to subscriber" :value="modelValue.relationshipToSubscriber || ''" :required="requireComplete" :disabled="medicaid" @change="update('relationshipToSubscriber', $event.target.value)"><option value="">{{ tx('Select') }}</option><option value="self">{{ tx('Self') }}</option><option value="child">{{ tx('Child') }}</option><option value="spouse">{{ tx('Spouse') }}</option><option value="other">{{ tx('Other') }}</option></select></label>
    <p v-if="medicaid" class="self-subscriber">{{ tx('Medicaid uses Self automatically for primary and secondary coverage.') }}</p>
    <p v-if="selfPatient" class="self-subscriber">{{ tx('Subscriber is the client. Name, birth date, sex and address use the client identity above; no duplicate entry is needed.') }}</p>
    <template v-if="useCatalog">
      <label>Insurance carrier<select aria-label="Insurance carrier" :value="selectedPayerId" :required="requireComplete" @change="selectPayer($event.target.value)"><option value="">Select a configured payer</option><option v-for="payer in payers" :key="payer.id" :value="String(payer.id)">{{ payer.name }}</option></select></label>
      <p v-if="!selectedPayerId && modelValue.insurerName" class="self-subscriber">Saved carrier: {{ modelValue.insurerName }}. Match it to a configured payer before billing.</p>
      <p v-if="!payers.length" class="self-subscriber">No configured payers are available. Billing staff can add or verify this carrier in agency payer setup. You can still save the packet details for follow-up.</p>
      <div class="payer-routes"><span>Claims payer ID: <strong>{{ modelValue.payerId || 'Not matched' }}</strong></span><span>Eligibility payer ID: <strong>{{ modelValue.eligibilityPayerId || 'Not matched' }}</strong></span><small>Connected automatically from the selected payer.</small></div>
    </template>
    <p v-if="modelValue.paperSubscriberName" class="self-subscriber">Holder written on packet: <strong>{{ modelValue.paperSubscriberName }}</strong>.</p>
    <div v-if="subscriberIssues.length || paperMedicaidMismatch" class="subscriber-review" role="alert">
      <p v-for="issue in subscriberIssues" :key="issue">{{ issue }}</p>
      <p v-if="paperMedicaidMismatch">The packet names a different Medicaid holder. After packet submission, search using this client’s legal name and birth date. Do not submit the listed number as the child’s Medicaid ID.</p>
      <p v-if="paperMedicaidMismatch && modelValue.paperReportedMemberId">Number written for the other holder: <strong>{{ modelValue.paperReportedMemberId }}</strong>. The child’s member ID remains pending.</p>
      <button v-if="patient && subscriberIssues.length" type="button" @click="useClientIdentity">Use client details for Medicaid verification</button>
    </div>
    <label v-for="field in mainFields" :key="field.key">{{ tx(field.label) }}<input v-address-autocomplete="field.key === 'subscriberAddressLine1' ? { locale: intakeLocale, scopeKey: `${scopeKey}:${modelValue.id || ''}:${modelValue.insurerName || ''}`, onSelect: fillAddress } : null" :value="modelValue[field.key] || ''" :type="field.type || 'text'" :required="requireComplete && !!field.required" maxlength="255" @input="update(field.key, $event.target.value)" /></label>

    <details v-if="additionalFields.length" class="additional-policy"><summary>Additional policy details</summary><div class="policy-fields"><label v-for="field in additionalFields" :key="field.key">{{ tx(field.label) }}<input v-address-autocomplete="field.key === 'subscriberAddressLine1' ? { locale: intakeLocale, scopeKey, onSelect: fillAddress } : null" :value="modelValue[field.key] || ''" :type="field.type || 'text'" maxlength="255" @input="update(field.key,$event.target.value)" /></label></div></details>
    <p v-if="/health\s*first\s*colorado|colorado\s+(access|medicaid)/i.test(modelValue.insurerName || '')" class="self-subscriber">{{ tx('Health First Colorado member IDs start with a letter, followed by six digits. Check the first character: O is a letter; 0 is zero.') }}</p>
    <label v-if="!selfPatient">{{ tx('Subscriber sex on policy') }}<select :value="modelValue.subscriberSex || ''" @change="update('subscriberSex',$event.target.value)"><option value="">{{ tx('Select') }}</option><option>M</option><option>F</option><option>U</option></select></label>
    <label class="check"><input :checked="modelValue.isMedicaid === true || modelValue.isMedicaid === 1" :disabled="useCatalog && !!selectedPayerId" type="checkbox" @change="update('isMedicaid',$event.target.checked)" /> {{ tx('Medicaid (each client has a separate member ID)') }}</label>
  </div>
</template>
<script setup>
import {computed,watch} from 'vue';
import { policyIsMedicaid } from '../../navigation/insurancePaymentPolicy.js';
import { useIntakeStepTx } from '../../composables/useIntakeStepTx.js';
import { clientSubscriber, insuranceSubscriberIssues, matchConfiguredPayer, withConfiguredPayer } from '../../navigation/paperInsuranceReview.js';
import { medicaidMemberIdNeedsDiscovery } from '../../navigation/paperInsuranceReview.js';
const { tx, intakeLocale } = useIntakeStepTx();
const props = defineProps({ modelValue: { type:Object, default:()=>({}) }, patient:{type:Object,default:null}, payers:{type:Array,default:null}, requireComplete:{type:Boolean,default:true}, scopeKey:{type:[String,Number],default:''},paperEntry:Boolean });
const medicaid = computed(() => policyIsMedicaid(props.modelValue));
const selfPatient=computed(()=>props.patient && props.modelValue.relationshipToSubscriber==='self');
const emit = defineEmits(['update:modelValue']);
const fields = [{key:'insurerName',label:'Insurance carrier',required:true},{key:'payerId',label:'Electronic payer ID (if known)'},{key:'eligibilityPayerId',label:'Eligibility payer ID (if different)'},{key:'memberId',label:'Member ID',required:true},{key:'groupNumber',label:'Group number'},{key:'patientSuffix',label:'Patient/member suffix'},{key:'subscriberFirstName',label:'Subscriber legal first name',required:true},{key:'subscriberLastName',label:'Subscriber legal last name',required:true},{key:'subscriberDob',label:'Subscriber date of birth',type:'date'},{key:'subscriberAddressLine1',label:'Subscriber address'},{key:'subscriberAddressLine2',label:'Apartment / suite'},{key:'subscriberCity',label:'City'},{key:'subscriberState',label:'State'},{key:'subscriberPostalCode',label:'ZIP code'},{key:'planType',label:'Plan type'},{key:'effectiveDate',label:'Coverage effective date',type:'date'},{key:'terminationDate',label:'Coverage end date (if applicable)',type:'date'},{key:'claimsPhone',label:'Claims phone'}];
const useCatalog=computed(()=>Array.isArray(props.payers));
const selectedPayerId=computed(()=>String(props.payers?.find(p=>String(p.id)===String(props.modelValue.payerCatalogId))?.id || matchConfiguredPayer(props.modelValue,props.payers || [])?.id || ''));
const subscriberIssues=computed(()=>insuranceSubscriberIssues(props.modelValue,props.patient));
const paperMedicaidMismatch=computed(()=>medicaidMemberIdNeedsDiscovery(props.modelValue,props.patient) && !!props.modelValue.paperSubscriberName);
const visibleFields=computed(()=>fields.filter(f=>(!useCatalog.value || !['insurerName','payerId','eligibilityPayerId'].includes(f.key)) && (!selfPatient.value || !f.key.startsWith('subscriber'))));
const essentials=new Set(['insurerName','payerId','eligibilityPayerId','memberId','groupNumber','patientSuffix','subscriberFirstName','subscriberLastName','subscriberDob']);
const mainFields=computed(()=>props.paperEntry?visibleFields.value.filter(field=>essentials.has(field.key)):visibleFields.value);
const additionalFields=computed(()=>props.paperEntry?visibleFields.value.filter(field=>!essentials.has(field.key)):[]);
function selectPayer(id) { const payer=props.payers?.find(p=>String(p.id)===id);if(payer)emit('update:modelValue',withSubscriber(withConfiguredPayer(props.modelValue,payer))); }
function useClientIdentity() { emit('update:modelValue',{...props.modelValue,...clientSubscriber(props.patient)}); }
function withSubscriber(policy) {
  if (policyIsMedicaid(policy)) policy = { ...policy, relationshipToSubscriber: 'self' };
  if(!props.patient || policy.relationshipToSubscriber!=='self')return policy;
  const p=props.patient;
  return {...policy,subscriberFirstName:p.firstName || '',subscriberLastName:p.lastName || '',subscriberDob:p.dateOfBirth || '',subscriberSex:p.sex || '',subscriberAddressLine1:p.addressLine1 || '',subscriberAddressLine2:p.addressLine2 || '',subscriberCity:p.city || '',subscriberState:p.state || '',subscriberPostalCode:p.postalCode || ''};
}
function fillAddress(address) { emit('update:modelValue', withSubscriber({ ...props.modelValue, subscriberAddressLine1: address.street, subscriberCity: address.city || '', subscriberState: address.state || '', subscriberPostalCode: address.postalCode || '' })); }
function update(key,value) {const next={...props.modelValue,[key]:value};if(key==='programType')next.isMedicaid=value==='medicaid';if(key==='isMedicaid')next.programType=value?'medicaid':next.programType==='medicaid'?'':next.programType;emit('update:modelValue',withSubscriber(next)); }
watch(()=>[props.patient,props.modelValue],()=>{
  if(!medicaid.value && !selfPatient.value)return;const next=withSubscriber(props.modelValue);
  if(JSON.stringify(next)!==JSON.stringify(props.modelValue))emit('update:modelValue',next);
},{deep:true,immediate:true});
</script>
<style scoped>.payer-routes{display:grid;gap:6px;font-size:13px}.payer-routes small{color:var(--text-secondary,#536579)}.subscriber-review{grid-column:1/-1;padding:12px;border:1px solid #d8a94a;border-radius:8px;background:var(--bg-secondary,#fff8e8)}.subscriber-review p{margin:0 0 8px}.subscriber-review button{font:inherit;padding:8px;border:1px solid var(--border,#94a3b8);border-radius:6px;background:var(--bg-card,#fff);color:var(--text-primary,#172b40)}.policy-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; } label { display:grid; gap:6px; font-size:14px; } input,select { box-sizing:border-box; width:100%; padding:10px; border:1px solid var(--app-line, #94a3b8); border-radius:7px; background:var(--bg-card); color:var(--text-primary); } .self-subscriber{grid-column:1/-1;margin:0;padding:10px;border-radius:7px;background:var(--app-surface-muted,var(--bg-secondary,#eef6fa));font-size:14px}.check { display:flex; align-items:center; } .check input { width:auto; }</style>

<style scoped>.additional-policy{grid-column:1/-1}.additional-policy>summary{cursor:pointer;font-weight:600}.additional-policy .policy-fields{margin-top:10px}</style>
