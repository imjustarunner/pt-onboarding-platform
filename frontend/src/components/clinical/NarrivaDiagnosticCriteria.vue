<script setup>
import {computed,ref,watch} from 'vue';
import DiagnosticCriteriaComparison from './DiagnosticCriteriaComparison.vue';
import {diagnosticCriteriaStatus} from '../../utils/diagnosticCriteriaReview.js';
const props=defineProps({diagnosis:Object,agencyId:[Number,String],draftId:[Number,String],transport:Object,saved:Object,ensureSaved:Function});
async function client(){return props.transport || (await import('../../services/api.js')).default;}
const emit=defineEmits(['update']);
const open=ref(false),dirty=ref(false),busy=ref(false),error=ref(''),result=ref(props.saved || null);
const code=computed(()=>props.diagnosis?.icd10_code || props.diagnosis?.code || '');
const summary=computed(()=>diagnosticCriteriaStatus(result.value?.criteria));
watch(()=>props.saved,value=>{if(value)result.value=value;});
async function check(){busy.value=true;error.value='';try{if(props.ensureSaved)await props.ensureSaved();if(!props.draftId)throw new Error('Save the current draft before checking this optional aid.');const {data}=await (await client()).post(props.transport?'/diagnosis-criteria':'/narriva/diagnosis-criteria',{agencyId:props.agencyId,draftId:props.draftId,icd10Code:code.value},{skipGlobalLoading:true});result.value=data;emit('update',data);open.value=true;}catch(e){error.value=e.response?.data?.error?.message || e.message || 'The optional criteria review is unavailable.';}finally{busy.value=false;}}
function changeCriterion({ id, field, value }) {
 const criterion=result.value?.criteria.find(item=>item.id===id);
 if(criterion){criterion[field]=value;dirty.value=true;}
}
async function toggle(){open.value=!open.value;if(!open.value || result.value || !props.draftId)return;try{const {data}=await (await client()).post(props.transport?'/diagnosis-criteria':'/narriva/diagnosis-criteria',{action:'read',agencyId:props.agencyId,draftId:props.draftId,icd10Code:code.value},{skipGlobalLoading:true});result.value=data.review || null;}catch(e){error.value=e.response?.data?.error?.message || 'The optional review could not be loaded.';}}
async function save(){if(!result.value?.id)return;busy.value=true;error.value='';try{const {data}=await (await client()).post(props.transport?'/diagnosis-criteria':'/narriva/diagnosis-criteria',{action:'save',agencyId:props.agencyId,draftId:props.draftId,icd10Code:code.value,reviewId:result.value.id,selections:result.value.criteria.map(item=>({id:item.id,status:item.status,frequency:item.frequency,duration:item.duration}))},{skipGlobalLoading:true});result.value=data;dirty.value=false;}catch(e){error.value=e.response?.data?.error?.message || 'The internal review could not be saved.';}finally{busy.value=false;}}

</script>
<template>
  <aside v-if="/^F\d/.test(code)" class="dx-criteria" data-internal-review-only>
    <button type="button" :aria-expanded="open" @click="toggle">Compare with DSM criteria · optional</button>
    <div v-if="open" class="dx-comparison">
      <header><strong>{{ code }} {{ diagnosis.description }}</strong><span>Optional · Internal clinical review</span></header>
      <p>Compare each criterion and required parameter with the evidence recorded for this diagnosis.</p>
      <button type="button" :disabled="busy || dirty" @click="check">{{ busy ? 'Checking criteria support…' : result ? 'Recheck criteria support' : 'Compare criteria' }}</button>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="result?.criteria?.length" class="dx-criteria-status" :class="summary.status">{{ summary.message }}</p>
      <p v-if="result && !result.criteria?.length">{{ result.message }}</p>
      <DiagnosticCriteriaComparison v-if="result?.criteria?.length" :criteria="result.criteria" editable :disabled="busy" @change="changeCriterion" />
      <button v-if="dirty" type="button" :disabled="busy" @click="save">Save internal review</button>
    </div>
  </aside>
</template>

<style scoped>
.dx-criteria{margin:8px 0 14px;color:#435b6f;font-size:14px}
.dx-comparison{border:1px solid #d4e0eb;background:#f8fbfd;border-radius:9px;padding:14px;margin-top:9px}
.dx-comparison header{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}
.dx-comparison header span{font-size:12px}
.dx-criteria button{font:inherit;color:#245b7f;border:1px solid #bfd3e4;border-radius:6px;padding:7px 10px;background:#f5f9fc}
.dx-criteria-status{border-radius:6px;padding:8px 10px;background:#fff2cb;color:#775311;font-weight:650}
.dx-criteria-status.supported{background:#ecf8ef;color:#1e683a}
@media print{.dx-criteria{display:none!important}}
</style>
