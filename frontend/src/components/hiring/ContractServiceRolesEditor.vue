<template>
  <fieldset class="service-roles" :class="{'category-placement':categoryPlacement}">
    <legend>Service roles and contract clauses</legend>
    <p>{{ source || 'Choose the duties required for this job. Posting choices become the initial selection for each applicant’s contract.' }}</p>
    <p>Review each selected role before generating. A role selection does not grant a license, service authorization or payer eligibility.</p>
    <article v-for="role in roles" :id="categoryPlacement ? `prehire-service-${role.id}` : undefined" :key="role.id" tabindex="-1">
      <label class="role-choice"><input type="checkbox" :data-role-id="role.id" :checked="selected.includes(role.id)" @change="toggle(role.id,$event.target.checked)" /><span><strong>{{ role.title }}</strong><small>{{ role.description }}</small></span></label>
      <div v-if="selected.includes(role.id)" class="role-details">
        <template v-if="role.id==='tutoring' && serviceCompensation?.tutoring">
          <p v-if="categoryPlacement">Uses employee Category {{ compensationCategory || 'not selected' }}, Level {{ effectiveLevel('tutoring') || 'not selected' }}. Saved individual placement and rate overrides remain in effect until changed.</p>
          <details v-if="categoryPlacement" :open="hasIndividualPlacement('tutoring')"><summary>Individual tutoring override — optional</summary>
            <label>Individual tutoring pay level<select :value="details.tutoring?.payLevel || ''" @change="detail('tutoring','payLevel',$event.target.value)"><option value="">Use employee pay level</option><option v-for="level in 5" :key="level" :value="level">Level {{ level }}</option></select></label>
            <label>Individual tutoring hourly rate<input type="number" min="0.01" step="0.01" :value="details.tutoring?.hourlyRate || ''" @input="detail('tutoring','hourlyRate',$event.target.value)" /></label>
          </details>
          <label v-else>Approved tutoring pay level<select :value="details.tutoring?.payLevel || ''" aria-label="Approved tutoring pay level" @change="detail('tutoring','payLevel',$event.target.value)"><option value="">Choose the tutoring placement</option><option v-for="level in 5" :key="level" :value="level">Level {{ level }}</option></select></label>
          <label v-if="!categoryPlacement">Individual tutoring hourly rate — optional<input type="number" min="0.01" step="0.01" :value="details.tutoring?.hourlyRate || ''" aria-label="Individual tutoring hourly rate" @input="detail('tutoring','hourlyRate',$event.target.value)" /><small>A separately approved individual rate applies to the formats stated in this person’s written terms.</small></label>
          <p v-if="tutoringRates">Virtual: {{ childcareMoney(tutoringRates.virtual) }}/hour · In person: {{ childcareMoney(tutoringRates.inPerson) }}/hour. Indirect time follows the approved service schedule.</p>
          <p v-else>{{ categoryPlacement ? "Choose the employee category and level above to resolve this service. If rates are missing, open pay settings to configure that schedule." : "Choose the approved service placement. Categories 3–4 require a separately approved tutoring rate or placement." }}</p>
        </template>
        <template v-if="role.id==='childcare'">
          <p v-if="categoryPlacement">Uses employee Category {{ compensationCategory || 'not selected' }}, Level {{ effectiveLevel('childcare') || 'not selected' }} unless an individual placement is recorded.</p>
          <details v-if="categoryPlacement" :open="hasIndividualPlacement('childcare')"><summary>Individual childcare placement — optional</summary><label>Individual childcare pay level<select :value="details.childcare?.payLevel || ''" @change="detail('childcare','payLevel',$event.target.value)"><option value="">Use employee pay level</option><option v-for="level in 5" :key="level" :value="level">Level {{ level }}</option></select></label><label>Existing flat hourly-rate override<input type="number" min="0.01" step="0.01" :value="details.childcare?.hourlyRate || ''" @input="detail('childcare','hourlyRate',$event.target.value)" /></label></details>
          <label v-else>Approved childcare pay level — required before generation<select :value="details.childcare?.payLevel || ''" aria-label="Approved childcare pay level" @change="detail('childcare','payLevel',$event.target.value)"><option value="">Choose the approved childcare level</option><option v-for="level in 5" :key="level" :value="level">Level {{ level }}</option></select></label>
          <label v-if="!categoryPlacement">Individual childcare hourly-rate override — optional<input type="number" min="0.01" step="0.01" :value="details.childcare?.hourlyRate || ''" @input="detail('childcare','hourlyRate',$event.target.value)" /><small>Use only an expressly approved exception. Explain its child-count and staffing treatment in the written compensation terms.</small></label>
          <ChildcareRateScheduleEditor :model-value="details.childcare?.ratesByBand || {}" :category="compensationCategory || modelValue.compensationCategory" :level="effectiveLevel('childcare')" :policy="serviceCompensation?.childcare" :flat-rate="details.childcare?.hourlyRate" @update:model-value="detail('childcare','ratesByBand',$event)" />
        </template>
        <p v-if="role.id==='childcare' && hasChildcareSchedule" role="status">The approved four-band childcare schedule above is included in the contract automatically. Add any additional individual terms below.</p>
        <template v-if="categoryPlacement && role.id==='psychological_testing'">
          <p>Rates are included automatically in the agreement. Specific testing assignments, credentials, instruments and supervision are verified separately before testing work. Hiring does not grant clinical authority.</p>
          <details :open="!!details.psychological_testing?.compensationTerms || !!details.psychological_testing?.authorizationTerms"><summary>Additional testing terms or existing assignment — optional</summary><label>Additional testing compensation terms<textarea :value="details.psychological_testing?.compensationTerms || ''" @input="detail(role.id,'compensationTerms',$event.target.value)" /></label><label>Existing approved testing assignment reference<textarea :value="details.psychological_testing?.authorizationTerms || ''" @input="detail(role.id,'authorizationTerms',$event.target.value)" /></label></details>
        </template>
        <label v-if="(!categoryPlacement || role.id!=='psychological_testing') && (requireCompensationForAllRoles || ['childcare','psychological_testing'].includes(role.id))">{{ role.id==='childcare' && hasChildcareSchedule ? 'Additional childcare compensation terms — optional' : role.id==='psychological_testing'?'Testing compensation schedule or additional approved terms':'Individual compensation schedule — required before generation' }}<textarea :aria-label="`${role.title}: compensation terms`" :value="details[role.id]?.compensationTerms || ''" @input="detail(role.id,'compensationTerms',$event.target.value)" :placeholder="role.id==='childcare'?(hasChildcareSchedule?'Additional approved arrangements or exceptions; leave blank to use the schedule above':'Approved childcare pay level, base rate, child-count bands and individual exceptions'):role.id==='psychological_testing'?'Approved administration/scoring rate, evaluation rate, indirect rate and allowance rules':'Exact approved individual amounts, pay basis, service eligibility and indirect-time treatment from this person’s agreement'" /></label>
        <label v-if="!categoryPlacement && role.id==='psychological_testing'">Approved testing assignment and supervision — required before generation<textarea :value="details[role.id]?.authorizationTerms || ''" @input="detail(role.id,'authorizationTerms',$event.target.value)" placeholder="Approved instruments and components; personnel qualifications; responsible qualified licensee and direct-supervision arrangement; written approval reference" /></label>
        <template v-if="role.id==='psychological_testing'">
          <p>Testing is a separately approved, Medicaid-only service role. The generated schedule uses the selected Clinical Session Rate for eligible evaluation and the Direct Care Rate for administration/scoring, with actual component minutes and the agreed indirect allowance. A claim unit does not automatically earn a full clinical credit.</p>
          <p v-if="!categoryPlacement">Use compensation terms for approved individual arrangements or exceptions. Where no configured schedule is available, enter the complete approved rates. In the assignment field, identify the actual instruments/components, qualified responsible clinician, supervision and written approval. Selecting this role does not approve credentials or authorize a claim.</p>
          <table v-if="payProfile"><caption>Testing compensation from Category {{ compensationCategory }}, Level {{ compensationLevel }}</caption><tbody><tr><th>Administration / scoring, per actual hour</th><td>{{ childcareMoney(payProfile.hcodeRate) }}</td></tr><tr><th>Separately authorized evaluation, per actual hour</th><td>{{ childcareMoney(payProfile.creditRate) }}</td></tr><tr><th>Indirect work, per actual hour</th><td>{{ childcareMoney(payProfile.indirectRate) }}</td></tr></tbody></table>
          <p v-if="role.codeGuide?.length">The code guide below is a handbook reference for preparing this agreement. It is excluded from the generated contract. The contract states the individual’s assigned duties, rates and time basis and refers to the Workplace Handbook for code mappings and examples.</p>
          <div v-if="role.codeGuide?.length" class="testing-code-guide"><table><caption>Testing and related clinical codes</caption><thead><tr><th>Code</th><th>Pay bucket</th><th>Credits / time</th><th>Sourced activity example</th></tr></thead><tbody><tr v-for="row in role.codeGuide" :key="row.code"><th>{{row.code}}</th><td>{{row.payBucket}}</td><td>{{row.basis}}<small v-if="row.testingOnly">Testing role required; Medicaid only</small></td><td><template v-if="row.example">{{row.example.activity}}<small>{{row.example.notThis}}</small><a :href="row.example.sourceUrl" target="_blank" rel="noopener noreferrer">{{row.example.sourceTitle}}, page {{row.example.sourcePage}}</a></template><span v-else>See the Testing handbook reference.</span></td></tr></tbody></table></div>
        </template>
        <small>{{ categoryPlacement ? 'The selected role’s standard clause and resolved compensation are included in the preview. Service authorization remains separate.' : 'The selected role’s standard clause is included in the preview. Complete individual service terms and verify eligibility before issuing.' }}</small>
      </div>
    </article>
    <button v-if="modelValue?.serviceRoles !== undefined && allowInference" type="button" @click="useInference">Use job and credential inference instead</button>
  </fieldset>
</template>
<script setup>
import {computed} from 'vue';
import {CONTRACT_SERVICE_ROLE_OPTIONS} from '../../constants/contractServiceRoles.js';
import ChildcareRateScheduleEditor from './ChildcareRateScheduleEditor.vue';
import {childcareMoney,resolvedChildcareBands} from '../../utils/childcarePresentation';
const props=defineProps({modelValue:{type:Object,default:()=>({})},options:{type:Array,default:()=>[]},source:{type:String,default:''},allowInference:{type:Boolean,default:true},requireCompensationForAllRoles:{type:Boolean,default:false},categoryPlacement:{type:Boolean,default:false},compensationLevel:[Number,String],payProfile:Object,compensationCategory:[Number,String],serviceCompensation:{type:Object,default:null}});
const emit=defineEmits(['update:modelValue']);
const roles=computed(()=>props.options.length?props.options:CONTRACT_SERVICE_ROLE_OPTIONS);
const selected=computed(()=>props.modelValue.serviceRoles || []);
const details=computed(()=>props.modelValue.serviceRoleDetails || {});
const effectiveLevel=role=>details.value[role]?.payLevel || (props.categoryPlacement ? props.compensationLevel : null);
const hasIndividualPlacement=role=>!!details.value[role]?.payLevel || !!details.value[role]?.hourlyRate;
const hasChildcareSchedule=computed(()=>{
  const category=Number(props.compensationCategory||props.modelValue.compensationCategory),level=Number(effectiveLevel('childcare'));
  if(props.requireCompensationForAllRoles || !props.serviceCompensation?.childcare || ![1,2,3,4].includes(category) || ![1,2,3,4,5].includes(level))return false;
  return Object.values(resolvedChildcareBands({category,level,policy:props.serviceCompensation.childcare,overrides:details.value.childcare?.ratesByBand,flatRate:details.value.childcare?.hourlyRate})).every(rate=>rate!=null);
});
const tutoringRates=computed(()=>{
  const p=props.serviceCompensation?.tutoring,level=Number(effectiveLevel('tutoring')),category=Number(props.compensationCategory||props.modelValue.compensationCategory),override=details.value.tutoring?.hourlyRate;
  if(!p||![1,2,3,4,5].includes(level))return null;
  if(override!==''&&override!=null&&Number(override)>0)return {virtual:Number(override),inPerson:Number(override)};
  if(category===1)return {virtual:p.category1?.[level-1],inPerson:p.category1?.[level-1]};
  if(category===2)return {virtual:p.category2Virtual?.[level-1],inPerson:p.category2InPerson?.[level-1]};
  const rate=p[`category${category}`]?.[level-1];
  return rate>0?{virtual:rate,inPerson:rate}:null;
});
function toggle(id,checked){emit('update:modelValue',{...props.modelValue,serviceRoles:checked?[...new Set([...selected.value,id])]:selected.value.filter(role=>role!==id)});}
function detail(id,key,value){emit('update:modelValue',{...props.modelValue,serviceRoleDetails:{...details.value,[id]:{...details.value[id],[key]:value}}});}
function useInference(){const next={...props.modelValue};delete next.serviceRoles;emit('update:modelValue',next);}
</script>
<style scoped>
.category-placement{min-width:0;max-width:100%;box-sizing:border-box}.category-placement legend{max-width:100%}.category-placement .role-choice span,.category-placement .role-details{min-width:0}.category-placement .role-details input,.category-placement .role-details select{min-width:0;max-width:100%;box-sizing:border-box}.category-placement :deep(.childcare-rates){min-width:0;max-width:100%;box-sizing:border-box}
@media(max-width:600px){.category-placement .role-details{padding-left:0}.category-placement table{width:100%;table-layout:fixed;overflow-wrap:anywhere}}
.service-roles{border:1px solid #bbcfc5;border-radius:10px;padding:18px;margin:20px 0}.service-roles legend{font-weight:700}.service-roles p,.service-roles small{font-size:13px;line-height:1.5}.service-roles article{padding:14px 0;border-top:1px solid #d9e4de}.service-roles .role-choice{display:flex;flex-direction:row;align-items:flex-start;gap:10px}.role-choice input{width:auto;margin-top:5px}.role-choice small{display:block;margin-top:5px;color:#5b7164}.role-details{padding:14px 0 0 27px;display:grid;gap:12px}.role-details label{display:grid;gap:6px;font-size:13px}.role-details textarea{font:inherit;min-height:100px;width:100%;padding:10px;box-sizing:border-box;border:1px solid #bbcec2;border-radius:8px;background:white;color:inherit}.service-roles button{font:inherit;background:white;color:inherit;border:1px solid #bbcec2;border-radius:8px;padding:8px 12px}
.testing-code-guide{overflow-x:auto;max-width:100%}.testing-code-guide table{border-collapse:collapse;font-size:13px;min-width:420px;width:100%}.testing-code-guide th,.testing-code-guide td{text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid #bbcec2}.testing-code-guide caption{text-align:left;font-weight:700;padding:8px}.testing-code-guide small{display:block}</style>
