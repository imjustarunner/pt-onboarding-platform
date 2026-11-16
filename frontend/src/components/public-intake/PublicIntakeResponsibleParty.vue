<template>
  <section class="responsible-party" aria-label="Responsible billing party">
    <h3>{{ tx('Responsible billing party') }}</h3>
    <p>{{ tx('Who should receive balances and billing follow-up for this client?') }}</p>
    <label>{{ tx('Responsible party') }}
      <select :value="modelValue?.kind || ''" @change="selectKind($event.target.value)">
        <option value="">{{ tx('Choose a responsible party') }}</option>
        <option value="applicant">{{ tx('Me — the person completing this enrollment') }}</option>
        <option value="other">{{ tx('Someone else') }}</option>
      </select>
    </label>
    <p v-if="!modelValue?.kind" class="responsible-party-note">{{ tx('If this is not selected, choosing a responsible party stays on your portal to-do list.') }}</p>
    <p v-else-if="modelValue.kind === 'applicant'">{{ [name,email,phone].filter(Boolean).join(' · ') }}</p>
    <div v-else-if="modelValue.kind === 'other'" class="responsible-party-fields">
      <label v-for="field in contactFields" :key="field.key">{{ tx(field.label) }}
        <input :value="modelValue.contact?.[field.key] || ''" :type="field.type || 'text'" :autocomplete="field.autocomplete" :maxlength="field.key === 'address' ? 500 : 255" @input="setContact(field.key,$event.target.value)" />
      </label>
    </div>
    <p v-if="modelValue?.kind === 'other'">{{ tx('This saves a billing contact. Portal access and payment authorization are selected separately.') }}</p>
    <p v-if="error" role="alert" class="responsible-party-error">{{ tx(error) }}</p>
  </section>
</template>
<script setup>
import { ref } from 'vue';
import { useIntakeStepTx } from '../../composables/useIntakeStepTx.js';
import { normalizeIntakeResponsibleParty } from '../../utils/intakeResponsibleParty.js';
const props=defineProps({modelValue:{type:Object,default:null},name:String,email:String,phone:String});
const emit=defineEmits(['update:modelValue']);const {tx}=useIntakeStepTx();const error=ref('');
const contactFields=[{key:'fullName',label:'Full name',autocomplete:'name'},{key:'email',label:'Billing email',type:'email',autocomplete:'email'},{key:'phone',label:'Phone number',type:'tel',autocomplete:'tel'},{key:'address',label:'Mailing address',autocomplete:'street-address'},{key:'city',label:'City',autocomplete:'address-level2'},{key:'state',label:'State',autocomplete:'address-level1'},{key:'postalCode',label:'ZIP code',autocomplete:'postal-code'}];
function selectKind(kind){error.value='';emit('update:modelValue',kind?{kind,...(kind==='other'?{contact:{...(props.modelValue?.contact||{})}}:{})}:null);}
function setContact(key,value){error.value='';emit('update:modelValue',{kind:'other',contact:{...(props.modelValue?.contact||{}),[key]:value}});}
function validate(){error.value='';try{normalizeIntakeResponsibleParty(props.modelValue);return true;}catch(e){error.value=e.message;return false;}}
defineExpose({validate});
</script>
<style scoped>
.responsible-party{display:grid;gap:12px;padding:16px;border:1px solid #d9e0ed;border-radius:8px}.responsible-party h3,.responsible-party p{margin:0}.responsible-party label{display:grid;gap:6px}.responsible-party input,.responsible-party select{box-sizing:border-box;min-width:0;width:100%;padding:10px;border:1px solid #b8c5d5;border-radius:6px;background:#fff;font:inherit;color:#17213c}.responsible-party-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.responsible-party-note{color:#475569}.responsible-party-error{color:#a12727}@media(max-width:650px){.responsible-party-fields{grid-template-columns:1fr}}
</style>
