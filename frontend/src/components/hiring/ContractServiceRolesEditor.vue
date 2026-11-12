<template>
  <fieldset class="service-roles">
    <legend>Service roles and contract clauses</legend>
    <p>{{ source || 'Choose the duties required for this job. Posting choices become the initial selection for each applicant’s contract.' }}</p>
    <p>Review each selected role before generating. A role selection does not grant a license, service authorization or payer eligibility.</p>
    <article v-for="role in roles" :key="role.id">
      <label class="role-choice"><input type="checkbox" :data-role-id="role.id" :checked="selected.includes(role.id)" @change="toggle(role.id,$event.target.checked)" /><span><strong>{{ role.title }}</strong><small>{{ role.description }}</small></span></label>
      <div v-if="selected.includes(role.id)" class="role-details">
        <template v-if="role.id==='childcare'">
          <label>Approved childcare pay level — required before generation<select :value="details.childcare?.payLevel || ''" aria-label="Approved childcare pay level" @change="detail('childcare','payLevel',$event.target.value)"><option value="">Choose the approved childcare level</option><option v-for="level in 5" :key="level" :value="level">Level {{ level }}</option></select></label>
          <label>Individual childcare hourly-rate override — optional<input type="number" min="0.01" step="0.01" :value="details.childcare?.hourlyRate || ''" @input="detail('childcare','hourlyRate',$event.target.value)" /><small>Use only an expressly approved exception. Explain its child-count and staffing treatment in the written compensation terms.</small></label>
        </template>
        <label v-if="requireCompensationForAllRoles || ['childcare','psychological_testing'].includes(role.id)">Individual compensation schedule — required before generation<textarea :value="details[role.id]?.compensationTerms || ''" @input="detail(role.id,'compensationTerms',$event.target.value)" :placeholder="role.id==='childcare'?'Approved childcare pay level, base rate, child-count bands and individual exceptions':role.id==='psychological_testing'?'Approved administration/scoring rate, evaluation rate, indirect rate and allowance rules':'Exact approved individual amounts, pay basis, service eligibility and indirect-time treatment from this person’s agreement'" /></label>
        <label v-if="role.id==='psychological_testing'">Approved testing assignment and supervision — required before generation<textarea :value="details[role.id]?.authorizationTerms || ''" @input="detail(role.id,'authorizationTerms',$event.target.value)" placeholder="Approved instruments and components; personnel qualifications; responsible qualified licensee and direct-supervision arrangement; written approval reference" /></label>
        <small>The selected role’s standard clause is included in the preview. Complete individual service terms and verify eligibility before issuing.</small>
      </div>
    </article>
    <button v-if="modelValue?.serviceRoles !== undefined && allowInference" type="button" @click="useInference">Use job and credential inference instead</button>
  </fieldset>
</template>
<script setup>
import {computed} from 'vue';
import {CONTRACT_SERVICE_ROLE_OPTIONS} from '../../constants/contractServiceRoles.js';
const props=defineProps({modelValue:{type:Object,default:()=>({})},options:{type:Array,default:()=>[]},source:{type:String,default:''},allowInference:{type:Boolean,default:true},requireCompensationForAllRoles:{type:Boolean,default:false}});
const emit=defineEmits(['update:modelValue']);
const roles=computed(()=>props.options.length?props.options:CONTRACT_SERVICE_ROLE_OPTIONS);
const selected=computed(()=>props.modelValue.serviceRoles || []);
const details=computed(()=>props.modelValue.serviceRoleDetails || {});
function toggle(id,checked){emit('update:modelValue',{...props.modelValue,serviceRoles:checked?[...new Set([...selected.value,id])]:selected.value.filter(role=>role!==id)});}
function detail(id,key,value){emit('update:modelValue',{...props.modelValue,serviceRoleDetails:{...details.value,[id]:{...details.value[id],[key]:value}}});}
function useInference(){const next={...props.modelValue};delete next.serviceRoles;emit('update:modelValue',next);}
</script>
<style scoped>
.service-roles{border:1px solid #bbcfc5;border-radius:10px;padding:18px;margin:20px 0}.service-roles legend{font-weight:700}.service-roles p,.service-roles small{font-size:13px;line-height:1.5}.service-roles article{padding:14px 0;border-top:1px solid #d9e4de}.service-roles .role-choice{display:flex;flex-direction:row;align-items:flex-start;gap:10px}.role-choice input{width:auto;margin-top:5px}.role-choice small{display:block;margin-top:5px;color:#5b7164}.role-details{padding:14px 0 0 27px;display:grid;gap:12px}.role-details label{display:grid;gap:6px;font-size:13px}.role-details textarea{font:inherit;min-height:100px;width:100%;padding:10px;box-sizing:border-box;border:1px solid #bbcec2;border-radius:8px;background:white;color:inherit}.service-roles button{font:inherit;background:white;color:inherit;border:1px solid #bbcec2;border-radius:8px;padding:8px 12px}
</style>
