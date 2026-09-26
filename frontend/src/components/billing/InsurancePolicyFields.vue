<template>
  <div class="policy-fields">
    <label>Client’s relationship to subscriber<select :value="modelValue.relationshipToSubscriber || ''" :required="requireComplete" @change="update('relationshipToSubscriber', $event.target.value)"><option value="">Select</option><option value="self">Self</option><option value="child">Child</option><option value="spouse">Spouse</option><option value="other">Other</option></select></label>
    <p v-if="selfPatient" class="self-subscriber">Subscriber is the client. Name, birth date, sex and address use the client identity above; no duplicate entry is needed.</p>
    <label v-for="field in visibleFields" :key="field.key">{{ field.label }}<input :value="modelValue[field.key] || ''" :type="field.type || 'text'" :required="requireComplete && !!field.required" maxlength="255" @input="update(field.key, $event.target.value)" /></label>

    <label v-if="!selfPatient">Subscriber sex on policy<select :value="modelValue.subscriberSex || ''" @change="update('subscriberSex',$event.target.value)"><option value="">Select</option><option>M</option><option>F</option><option>U</option></select></label>
    <label class="check"><input :checked="modelValue.isMedicaid === true || modelValue.isMedicaid === 1" type="checkbox" @change="update('isMedicaid',$event.target.checked)" /> Medicaid (each client has a separate member ID)</label>
  </div>
</template>
<script setup>
import {computed,watch} from 'vue';
const props = defineProps({ modelValue: { type:Object, default:()=>({}) }, patient:{type:Object,default:null}, requireComplete:{type:Boolean,default:true} });
const selfPatient=computed(()=>props.patient && props.modelValue.relationshipToSubscriber==='self');
const emit = defineEmits(['update:modelValue']);
const fields = [{key:'insurerName',label:'Insurance carrier',required:true},{key:'payerId',label:'Electronic payer ID (if known)'},{key:'eligibilityPayerId',label:'Eligibility payer ID (if different)'},{key:'memberId',label:'Member ID',required:true},{key:'groupNumber',label:'Group number'},{key:'patientSuffix',label:'Patient/member suffix'},{key:'subscriberFirstName',label:'Subscriber legal first name',required:true},{key:'subscriberLastName',label:'Subscriber legal last name',required:true},{key:'subscriberDob',label:'Subscriber date of birth',type:'date'},{key:'subscriberAddressLine1',label:'Subscriber address'},{key:'subscriberAddressLine2',label:'Apartment / suite'},{key:'subscriberCity',label:'City'},{key:'subscriberState',label:'State'},{key:'subscriberPostalCode',label:'ZIP code'},{key:'planType',label:'Plan type'},{key:'effectiveDate',label:'Coverage effective date',type:'date'},{key:'terminationDate',label:'Coverage end date (if applicable)',type:'date'},{key:'claimsPhone',label:'Claims phone'}];
const visibleFields=computed(()=>fields.filter(f=>!selfPatient.value || !f.key.startsWith('subscriber')));
function withSubscriber(policy) {
  if(!props.patient || policy.relationshipToSubscriber!=='self')return policy;
  const p=props.patient;
  return {...policy,subscriberFirstName:p.firstName || '',subscriberLastName:p.lastName || '',subscriberDob:p.dateOfBirth || '',subscriberSex:p.sex || '',subscriberAddressLine1:p.addressLine1 || '',subscriberAddressLine2:p.addressLine2 || '',subscriberCity:p.city || '',subscriberState:p.state || '',subscriberPostalCode:p.postalCode || ''};
}
function update(key,value) { emit('update:modelValue',withSubscriber({...props.modelValue,[key]:value})); }
watch(()=>[props.patient,props.modelValue.relationshipToSubscriber],()=>{
  if(!selfPatient.value)return;const next=withSubscriber(props.modelValue);
  if(JSON.stringify(next)!==JSON.stringify(props.modelValue))emit('update:modelValue',next);
},{deep:true,immediate:true});
</script>
<style scoped>.policy-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; } label { display:grid; gap:6px; font-size:14px; } input,select { box-sizing:border-box; width:100%; padding:10px; border:1px solid var(--app-line, #94a3b8); border-radius:7px; background:var(--bg-card); color:var(--text-primary); } .self-subscriber{grid-column:1/-1;margin:0;padding:10px;border-radius:7px;background:var(--app-surface-muted,var(--bg-secondary,#eef6fa));font-size:14px}.check { display:flex; align-items:center; } .check input { width:auto; }</style>
