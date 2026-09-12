<template>
  <div class="policy-fields">
    <label v-for="field in fields" :key="field.key">{{ field.label }}<input :value="modelValue[field.key] || ''" :type="field.type || 'text'" :required="!!field.required" maxlength="255" @input="update(field.key, $event.target.value)" /></label>
    <label>Client’s relationship to subscriber<select :value="modelValue.relationshipToSubscriber || ''" required @change="update('relationshipToSubscriber', $event.target.value)"><option value="">Select</option><option value="self">Self</option><option value="child">Child</option><option value="spouse">Spouse</option><option value="other">Other</option></select></label>
    <label>Subscriber sex on policy<select :value="modelValue.subscriberSex || ''" @change="update('subscriberSex',$event.target.value)"><option value="">Select</option><option>M</option><option>F</option><option>U</option></select></label>
    <label class="check"><input :checked="modelValue.isMedicaid === true || modelValue.isMedicaid === 1" type="checkbox" @change="update('isMedicaid',$event.target.checked)" /> Medicaid (each client has a separate member ID)</label>
  </div>
</template>
<script setup>
const props = defineProps({ modelValue: { type:Object, default:()=>({}) } });
const emit = defineEmits(['update:modelValue']);
const fields = [{key:'insurerName',label:'Insurance carrier',required:true},{key:'payerId',label:'Electronic payer ID (if known)'},{key:'memberId',label:'Member ID',required:true},{key:'groupNumber',label:'Group number'},{key:'patientSuffix',label:'Patient/member suffix'},{key:'subscriberFirstName',label:'Subscriber legal first name',required:true},{key:'subscriberLastName',label:'Subscriber legal last name',required:true},{key:'subscriberDob',label:'Subscriber date of birth',type:'date'},{key:'subscriberAddressLine1',label:'Subscriber address'},{key:'subscriberAddressLine2',label:'Apartment / suite'},{key:'subscriberCity',label:'City'},{key:'subscriberState',label:'State'},{key:'subscriberPostalCode',label:'ZIP code'},{key:'planType',label:'Plan type'},{key:'effectiveDate',label:'Coverage effective date',type:'date'},{key:'terminationDate',label:'Coverage end date (if applicable)',type:'date'},{key:'claimsPhone',label:'Claims phone'}];
function update(key,value) { emit('update:modelValue',{...props.modelValue,[key]:value}); }
</script>
<style scoped>.policy-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; } label { display:grid; gap:6px; font-size:14px; } input,select { width:100%; padding:10px; border:1px solid #94a3b8; border-radius:7px; background:white; color:#0f172a; } .check { display:flex; align-items:center; } .check input { width:auto; }</style>
