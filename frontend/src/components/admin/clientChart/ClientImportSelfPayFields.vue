<template>
  <div class="self-pay-fields">
    <p>Select the service and enter the agreed rate. Choose the practice’s pro bono code for a $0 visit.</p>
    <label>Service code<select :value="modelValue.code" :disabled="disabled || loading" @change="selectCode($event.target.value)">
      <option value="">Select a service</option>
      <option v-for="service in services" :key="service.code" :value="service.code">{{ service.code }}{{ service.description ? ' · ' + service.description : '' }}</option>
    </select></label>
    <p v-if="error" role="alert">{{ error }}</p>
    <label>Agreed rate ($)<input :value="modelValue.amount" :disabled="disabled || proBono" type="number" :min="proBono?0:0.01" step="0.01" @input="change('amount',$event.target.value)" /></label>
    <label>Price basis<select :value="modelValue.basis || 'visit'" :disabled="disabled || proBono" @change="change('basis',$event.target.value)"><option value="visit">Per visit</option><option value="unit">Per unit</option></select></label>
    <label>Agreed self-pay terms<textarea :value="modelValue.reason" :disabled="disabled" maxlength="2000" rows="3" @input="change('reason',$event.target.value)" /></label>
  </div>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import api from '../../../services/api';
import {isProBonoServiceCode} from '../../../utils/clinicalAfterHoursPolicy.js';

const props=defineProps({modelValue:{type:Object,required:true},disabled:Boolean,agencyId:[Number,String],clientId:[Number,String]});
const emit=defineEmits(['update:modelValue']);
function change(key,value){emit('update:modelValue',{...props.modelValue,[key]:value,imported:false});}
const proBono=computed(()=>isProBonoServiceCode(props.modelValue.code));
const services=ref([]),error=ref(''),loading=ref(false);
function selectCode(code){
  const free=isProBonoServiceCode(code);
  emit('update:modelValue',{...props.modelValue,code,amount:free?'0':proBono.value?'':props.modelValue.amount,basis:free?'visit':props.modelValue.basis,imported:false});
}
watch(()=>[props.agencyId,props.clientId],async([agencyId,clientId],_,onCleanup)=>{
  let valid=true;
  onCleanup(()=>{valid=false;});
  services.value=[];error.value='';loading.value=true;
  try{
    const endpoint=clientId?`/family-billing/account/clients/${clientId}/settings`:'/medical-billing/service-codes';
    const {data}=await api.get(endpoint,{params:{agencyId,...(clientId?{}:{readOnly:1,includeProBono:1})},skipGlobalLoading:true});
    if(valid)services.value=(data.services||data.items||[]).filter(row=>![0,false,'0'].includes(row.is_active ?? row.isActive)).map(row=>({code:row.code||row.service_code||row.serviceCode,description:row.description})).filter(row=>row.code);
  }catch{if(valid)error.value='The practice’s service codes could not be loaded.';}
  finally{if(valid)loading.value=false;}
},{immediate:true});
</script>
<style scoped>.self-pay-fields{display:grid;gap:12px;padding:12px;border:1px solid #cbd8e9;border-radius:8px}.self-pay-fields label{display:grid;gap:6px}.self-pay-fields input,.self-pay-fields textarea,.self-pay-fields select{padding:10px;font:inherit;max-width:100%;box-sizing:border-box}.self-pay-fields p{margin:0;font-size:13px;line-height:1.5}</style>
