<script setup>
import {computed,ref,watch,nextTick} from 'vue';
import { NARRIVA_BRAND } from '../../config/narrivaBrand.js';
import DiagnosticCriteriaComparison from './DiagnosticCriteriaComparison.vue';
import {diagnosticCriteriaStatus} from '../../utils/diagnosticCriteriaReview.js';
const props=defineProps({diagnosis:Object,agencyId:[Number,String],draftId:[Number,String],transport:Object,saved:Object,ensureSaved:Function});
async function client(){return props.transport || (await import('../../services/api.js')).default;}
const emit=defineEmits(['update']);
const dialog=ref(null),trigger=ref(null);
const open=ref(false),dirty=ref(false),busy=ref(false),error=ref(''),result=ref(props.saved || null);
const code=computed(()=>props.diagnosis?.icd10_code || props.diagnosis?.code || '');
const summary=computed(()=>diagnosticCriteriaStatus(result.value?.criteria));
watch(()=>props.saved,value=>{if(value)result.value=value;});
async function check(){busy.value=true;error.value='';try{if(props.ensureSaved)await props.ensureSaved();if(!props.draftId)throw new Error('Save the current draft before checking this optional aid.');const {data}=await (await client()).post(props.transport?'/diagnosis-criteria':'/narriva/diagnosis-criteria',{agencyId:props.agencyId,draftId:props.draftId,icd10Code:code.value},{skipGlobalLoading:true});result.value=data;emit('update',data);open.value=true;}catch(e){error.value=e.response?.data?.error?.message || e.message || 'The optional criteria review is unavailable.';}finally{busy.value=false;}}
function changeCriterion({ id, field, value }) {
 const criterion=result.value?.criteria.find(item=>item.id===id);
 if(criterion){criterion[field]=value;dirty.value=true;}
}
function close(){open.value=false;nextTick(()=>trigger.value?.focus());}
async function toggle(){
 open.value=true;
 await nextTick();
 if(typeof dialog.value?.showModal==='function')dialog.value.showModal();
 else dialog.value?.setAttribute('open','');
 if(result.value || !props.draftId)return;try{const {data}=await (await client()).post(props.transport?'/diagnosis-criteria':'/narriva/diagnosis-criteria',{action:'read',agencyId:props.agencyId,draftId:props.draftId,icd10Code:code.value},{skipGlobalLoading:true});result.value=data.review || null;}catch(e){error.value=e.response?.data?.error?.message || 'The optional review could not be loaded.';}}
async function save(){if(!result.value?.id)return;busy.value=true;error.value='';try{const {data}=await (await client()).post(props.transport?'/diagnosis-criteria':'/narriva/diagnosis-criteria',{action:'save',agencyId:props.agencyId,draftId:props.draftId,icd10Code:code.value,reviewId:result.value.id,selections:result.value.criteria.map(item=>({id:item.id,status:item.status,frequency:item.frequency,duration:item.duration}))},{skipGlobalLoading:true});result.value=data;dirty.value=false;}catch(e){error.value=e.response?.data?.error?.message || 'The internal review could not be saved.';}finally{busy.value=false;}}

</script>
<template>
  <aside v-if="/^F\d/.test(code)" class="dx-criteria" data-internal-review-only>
    <button ref="trigger" type="button" class="dx-criteria-trigger" :aria-expanded="open" aria-haspopup="dialog" :aria-label="`Compare ${code} with DSM criteria (optional)`" title="Compare with DSM criteria" @click="toggle"><img :src="NARRIVA_BRAND.learning" alt="" /></button>
    <Teleport to="body">
    <dialog v-if="open" ref="dialog" class="dx-comparison" aria-label="Compare with DSM criteria" data-internal-review-only @close="close" @cancel="close">
      <div class="dx-modal-bar"><h2>DSM criteria review</h2><button type="button" autofocus @click="close">Close</button></div>
      <header><strong>{{ code }} {{ diagnosis.description }}</strong><span>Optional · Internal clinical review</span></header>
      <p>Compare each criterion and required parameter with the evidence recorded for this diagnosis.</p>
      <button type="button" :disabled="busy || dirty" @click="check">{{ busy ? 'Checking criteria support…' : result ? 'Recheck criteria support' : 'Compare criteria' }}</button>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="result?.criteria?.length" class="dx-criteria-status" :class="summary.status">{{ summary.message }}</p>
      <p v-if="result && !result.criteria?.length">{{ result.message }}</p>
      <DiagnosticCriteriaComparison v-if="result?.criteria?.length" :criteria="result.criteria" editable :disabled="busy" @change="changeCriterion" />
      <button v-if="dirty" type="button" :disabled="busy" @click="save">Save internal review</button>
    </dialog>
    </Teleport>
  </aside>
</template>

<style scoped>
.dx-criteria{display:inline-flex;color:#435b6f;font-size:14px}
.dx-comparison{box-sizing:border-box;width:min(920px,calc(100% - 24px));max-height:88dvh;border:1px solid #b9cbd9;background:#fff;border-radius:6px;padding:14px;color:#173754}.dx-comparison::backdrop{background:#152e4680}.dx-modal-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.dx-modal-bar h2{font-size:1rem;margin:0}
.dx-comparison header{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}
.dx-comparison header span{font-size:12px}
.dx-comparison button,.dx-criteria button{font:inherit;color:#245b7f;border:1px solid #bfd3e4;border-radius:6px;padding:7px 10px;background:#f5f9fc}
.dx-criteria-status{border-radius:6px;padding:8px 10px;background:#fff2cb;color:#775311;font-weight:650}
.dx-criteria-status.supported{background:#ecf8ef;color:#1e683a}
.dx-criteria .dx-criteria-trigger{width:32px;height:32px;padding:2px;line-height:1}.dx-criteria-trigger img{width:100%;height:100%;object-fit:contain}
@media print{.dx-criteria,.dx-comparison{display:none!important}}
</style>
