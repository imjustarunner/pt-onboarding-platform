<template>
  <section class="collection-rates">
    <h3>Percentage of collected revenue</h3>
    <p>For tutoring or another approved service, pay a percentage of the amount actually collected. This setting applies only to this employee and service code. No collected payment means $0 percentage pay.</p>
    <ul v-if="savedRates.length"><li v-for="rate in savedRates" :key="rate.id">{{ rate.service_code }}: <strong>{{ rate.pay_percent }}% of collections</strong> · From {{ String(rate.effective_start || '').slice(0,10) }}</li></ul>
    <form v-if="canEdit" @submit.prevent="save">
      <label>Service code<input v-model.trim="code" :list="`collection-codes-${userId}`" placeholder="e.g. TUTORING" required maxlength="64" /><datalist :id="`collection-codes-${userId}`"><option v-for="rule in rules" :key="rule.service_code" :value="rule.service_code" /></datalist></label>
      <label>Percentage<input v-model="percent" type="number" min="0" max="100" step="0.01" required placeholder="Enter agreed percentage" /></label>
      <label>Effective from<input v-model="start" type="date" required /></label>
      <button class="btn btn-primary" :disabled="saving || !code || percent === '' || !start">{{ saving ? 'Saving…' : 'Save collection percentage' }}</button>
    </form>
    <p class="hint">Use the service code from the billing report and a pay-period start date. The report must include Client Paid amounts. Existing dated rates remain in history.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="success" role="status">{{ success }}</p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:[Number,String],userId:[Number,String],rules:{type:Array,default:()=>[]},rates:{type:Array,default:()=>[]},canEdit:Boolean});
const emit=defineEmits(['saved']);
const code=ref(''),percent=ref(''),start=ref(''),saving=ref(false),error=ref(''),success=ref('');
const savedRates=computed(()=>props.rates.filter(r=>r.pay_method==='percent_collected'));
watch(()=>[props.agencyId,props.userId],()=>{code.value='';percent.value='';start.value='';error.value='';success.value='';});
async function save(){
  error.value='';success.value='';
  const value=Number(percent.value);
  if(percent.value==='' || !Number.isFinite(value) || value<0 || value>100){error.value='Enter the agreed percentage between 0 and 100.';return;}
  saving.value=true;
  try {
    await api.post('/payroll/rates',{agencyId:props.agencyId,userId:props.userId,serviceCode:code.value,rateAmount:0,payPercent:value,payMethod:'percent_collected',effectiveStart:start.value,effectiveEnd:null});
    success.value='Collection percentage saved for this employee and service code.';emit('saved');
  }catch(e){error.value=e.response?.data?.error?.message || 'Could not save the collection percentage.';}finally{saving.value=false;}
}
</script>
<style scoped>
.collection-rates{padding:18px;border:1px solid #bdd9d0;border-radius:12px;background:#f4fbf8;margin:18px 0}.collection-rates h3{margin-top:0}.collection-rates form{display:flex;gap:12px;flex-wrap:wrap;align-items:end}.collection-rates label{display:flex;flex-direction:column;gap:6px;flex:1 1 170px}.collection-rates input{padding:10px;border:1px solid #9ebbb2;border-radius:8px;min-width:0;width:100%;box-sizing:border-box}.hint{font-size:12px;color:#526963}[role=alert]{color:#b42318}
</style>
