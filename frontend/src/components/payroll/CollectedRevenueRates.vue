<template>
  <section class="collection-rates" aria-labelledby="percentage-pay-title">
    <h3 id="percentage-pay-title">Percentage pay</h3>
    <p>Choose the basis stated in the employee’s contract. <strong>Billed charges</strong> pays a percentage of the service charge, whether or not the client has paid. Collected payments is a separate option.</p>
    <p v-if="loading" role="status">Loading saved percentages…</p>
    <ul v-if="savedRates.length" class="saved-rates">
      <li v-for="rate in savedRates" :key="rate.id">
        <div><strong>{{ rate.service_code }} · {{ rate.pay_percent }}%</strong><span>{{ basisLabel(rate.pay_method) }} · {{ rate.effective_start ? `From ${date(rate.effective_start)}` : 'No start date saved' }}</span></div>
        <button v-if="canEdit" type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="edit(rate)">Edit saved rate</button>
      </li>
    </ul>
    <p v-else-if="!loading">No percentage rates have been saved for this employee.</p>
    <form v-if="canEdit" @submit.prevent="save">
      <label>Service code<input v-model.trim="code" :list="`collection-codes-${userId}`" placeholder="Select or enter billing code" required maxlength="64" /><datalist :id="`collection-codes-${userId}`"><option v-for="rule in rules" :key="rule.service_code" :value="rule.service_code" /></datalist></label>
      <label>Percentage<input v-model="percent" type="number" min="0" max="100" step="0.01" required placeholder="Enter agreed percentage" /></label>
      <label>Effective from<input v-model="start" type="date" required /></label>
      <label>Contract basis<select v-model="method"><option value="percent_billed">Billed charges</option><option value="percent_collected">Collected payments</option></select></label>
      <button class="btn btn-primary" :disabled="saving || loading">{{ saving ? 'Saving…' : 'Save percentage rate' }}</button>
    </form>
    <p class="hint">All four fields are required. Billed-charge pay needs an Amount Billed or Total Charge column in the report. Missing charges require review; they do not become $0 pay. Saved rates and dates remain visible above.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="success" role="status">{{ success }}</p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId:[Number,String], userId:[Number,String], rules:{type:Array,default:()=>[]}, rates:{type:Array,default:()=>[]}, canEdit:Boolean });
const emit = defineEmits(['saved']);
const code=ref(''), percent=ref(''), start=ref(''), method=ref('percent_billed'), saving=ref(false), loading=ref(false), error=ref(''), success=ref(''), loaded=ref(null);
let generation=0;
const date = value => String(value || '').slice(0,10);
const savedRates = computed(() => (loaded.value ?? props.rates).filter(r => r.pay_percent !== null && r.pay_percent !== undefined));
const basisLabel = value => value === 'percent_billed' ? 'Billed charges' : value === 'percent_collected' ? 'Collected payments' : 'Percentage saved — confirm contract basis';
function edit(rate) { code.value=rate.service_code; percent.value=String(rate.pay_percent); start.value=date(rate.effective_start); method.value=rate.pay_method === 'percent_collected' ? 'percent_collected' : 'percent_billed'; success.value=''; }
watch(() => [props.agencyId,props.userId], async () => {
  const request=++generation;
  loaded.value=null; code.value=''; percent.value=''; start.value=''; method.value='percent_billed'; error.value=''; success.value=''; saving.value=false;
  if (!props.agencyId || !props.userId) return;
  loading.value=true;
  try {
    const { data }=await api.get('/payroll/rates',{params:{agencyId:props.agencyId,userId:props.userId}});
    if (request!==generation) return;
    loaded.value=Array.isArray(data) ? data : [];
    if (savedRates.value.length) edit(savedRates.value[0]);
  } catch(e) { if(request===generation) error.value=e.response?.data?.error?.message || 'Saved percentages could not be loaded. Try reopening this section.'; }
  finally { if(request===generation) loading.value=false; }
},{immediate:true});
async function save() {
  error.value=''; success.value='';
  const value=Number(percent.value);
  if (!code.value || !start.value || percent.value==='' || !Number.isFinite(value) || value<0 || value>100) { error.value='Enter a service code, percentage from 0 to 100, and effective date.'; return; }
  const request=generation, agencyId=props.agencyId, userId=props.userId;
  const expected={serviceCode:code.value, payPercent:value, payMethod:method.value, effectiveStart:start.value};
  saving.value=true;
  try {
    await api.post('/payroll/rates',{agencyId,userId,...expected,rateAmount:0,effectiveEnd:null});
    const {data}=await api.get('/payroll/rates',{params:{agencyId,userId}});
    if(request!==generation) return;
    loaded.value=Array.isArray(data) ? data : [];
    const persisted=loaded.value.find(r => String(r.service_code).toUpperCase()===expected.serviceCode.toUpperCase() && date(r.effective_start)===expected.effectiveStart && Number(r.pay_percent)===expected.payPercent && r.pay_method===expected.payMethod);
    if (!persisted) throw new Error('The server did not confirm all rate settings. Your percentage may be stored, but the contract basis is not saved. Please reload after the backend update finishes.');
    edit(persisted); success.value='Saved and verified. This percentage will remain here when you return.'; emit('saved');
  } catch(e) { if(request===generation) error.value=e.response?.data?.error?.message || e.message || 'Could not save the percentage.'; }
  finally { if(request===generation) saving.value=false; }
}
</script>
<style scoped>
.collection-rates{padding:18px;border:1px solid #bdd9d0;border-radius:12px;background:#f4fbf8;margin:18px 0}.collection-rates h3{margin-top:0}.collection-rates form{display:flex;gap:12px;flex-wrap:wrap;align-items:end}.collection-rates label{display:flex;flex-direction:column;gap:6px;flex:1 1 170px}.collection-rates input,.collection-rates select{padding:10px;border:1px solid #9ebbb2;border-radius:8px;min-width:0;width:100%;box-sizing:border-box}.hint{font-size:12px;color:#526963}[role=alert]{color:#b42318}.saved-rates{padding:0;list-style:none}.saved-rates li{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;background:white;padding:12px;border-radius:8px;margin:8px 0}.saved-rates span{display:block;font-size:13px;margin-top:4px}
</style>
