<template>
 <section class="expectations-editor">
  <h3>{{ title }}</h3><p>{{ description }}</p>
  <div class="expectation-fields">
   <label v-if="showCoreFields">Contract role name<select :value="value.roleLabel || ''" @change="set('roleLabel',$event.target.value)"><option value="">Infer from role and credentials</option><option>Provider</option><option>Facilitator</option><option>Student</option><option>Employee</option></select></label>
   <label v-if="showCoreFields">Service focus<input :value="value.serviceFocus" @input="set('serviceFocus',$event.target.value)" placeholder="e.g. School-based counseling" /></label>
   <label>Total work hours / week<input :value="value.expectedHours" @input="set('expectedHours',$event.target.value)" placeholder="e.g. 20, or 20–25" /></label>
   <label v-if="showCoreFields">Direct service hours / week<input :value="value.directHours" @input="set('directHours',$event.target.value)" placeholder="e.g. 10" /></label>
   <label v-if="showCoreFields">Days / week<input :value="value.daysPerWeek" @input="set('daysPerWeek',$event.target.value)" /></label>
   <label>Work schedule<input :value="value.schedule" @input="set('schedule',$event.target.value)" placeholder="Days, availability and individual arrangements" /></label>
   <label>Supervision<select :value="value.includeSupervision===undefined?'':String(value.includeSupervision)" @change="set('includeSupervision',$event.target.value===''?undefined:$event.target.value==='true')"><option value="">Use configuration / supervisor assignment</option><option value="true">Include clinical supervision</option><option value="false">Omit clinical supervision clause</option></select></label>
   <label>Assigned supervisor<input :value="value.supervisorName" @input="set('supervisorName',$event.target.value)" /></label>
  </div>
  <article v-for="(d,i) in value.additionalDuties || []" :key="i" class="additional-duty">
   <label>Additional duty<textarea :value="d.description" @input="duty(i,'description',$event.target.value)" placeholder="Responsibilities based on this person’s experience" /></label>
   <label>Compensation<select :value="d.payBasis" @change="duty(i,'payBasis',$event.target.value)"><option value="">Choose a rate</option><option value="direct">Clinical/direct base rate (see preview for unit)</option><option value="indirect">Indirect hourly rate</option><option value="support">Support activity hourly rate</option><option value="hcode">Direct Care Rate (H-code rate, hourly duty)</option><option value="service_code">Specific service code</option><option value="custom">Individually agreed rate</option></select></label>
   <label v-if="d.payBasis==='service_code'">Service code<input :value="d.serviceCode" @input="duty(i,'serviceCode',$event.target.value.toUpperCase())" placeholder="e.g. T1017" /></label>
   <template v-if="d.payBasis==='custom'"><label>Amount ($)<input type="number" min="0.01" step="0.01" :value="d.customRate" @input="duty(i,'customRate',$event.target.value)" /></label><label>Rate unit<select :value="d.rateUnit || 'per_hour'" @change="duty(i,'rateUnit',$event.target.value)"><option value="per_hour">Per hour</option><option value="per_unit">Per unit</option><option value="per_service">Per service</option></select></label></template>
   <button type="button" @click="remove(i)">Remove duty</button>
  </article>
  <button type="button" @click="set('additionalDuties',[...(value.additionalDuties||[]),{description:'',payBasis:'',rateUnit:'per_hour'}])">+ Add compensated duty</button>
  <p class="expectation-note">Configured rates come from this agency’s selected pay category and level. Review the resolved amounts in the contract preview. Individual terms are recorded in the agreement; payroll setup must reflect the same approved terms.</p>
 </section>
</template>
<script setup>
import {computed} from 'vue';
const props=defineProps({modelValue:Object,showCoreFields:{type:Boolean,default:true},title:{type:String,default:'Contract defaults'},description:{type:String,default:'Defaults for hires from this posting. You can override them for each person when preparing their agreement.'}});
const emit=defineEmits(['update:modelValue']);const value=computed(()=>props.modelValue||{});
function set(k,v){emit('update:modelValue',{...value.value,[k]:v});}
function duty(i,k,v){set('additionalDuties',(value.value.additionalDuties||[]).map((d,n)=>n===i?{...d,[k]:v}:d));}
function remove(i){set('additionalDuties',value.value.additionalDuties.filter((_,n)=>n!==i));}
</script>
<style scoped>
.expectations-editor{border:1px solid #ceded5;border-radius:14px;padding:22px;margin:20px 0;background:#f7faf8;color:#203b32}.expectations-editor p{font-size:.9rem;line-height:1.6}.expectation-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.expectations-editor label{display:flex;flex-direction:column;gap:6px;font-size:.85rem}.expectations-editor input,.expectations-editor select,.expectations-editor textarea{font:inherit;background:white;border:1px solid #bbcec2;border-radius:8px;padding:10px;width:100%;box-sizing:border-box}.additional-duty{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;border-top:1px solid #ceded5;padding:18px 0;margin-top:18px}.expectations-editor button{font:inherit;border:1px solid #aac5b7;border-radius:8px;padding:10px 15px;background:white;color:#12583f;cursor:pointer;margin-top:12px}.expectation-note{color:#5b7164}
</style>
