<script setup>
import {computed,onMounted,ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true},claimId:Number,context:Object,serviceCodes:{type:Array,default:()=>[]},suggestedCharges:Object});
const emit=defineEmits(['saved']);
const scope=ref('practice'),category=ref('category_3'),context=ref(props.context||{}),schedule=ref(null),busy=ref(false),error=ref(''),notice=ref(''),reason=ref(''),amounts=ref({}),allServices=ref(false);
const scopes=computed(()=>[{id:'practice',label:'Practice default'},...(context.value.payerId?[{id:'payer',label:'This payer'}]:[]),...(context.value.providerUserId&&context.value.payerId?[{id:'provider',label:'This provider and payer'}]:[]),{id:'category',label:'Provider type'},...(context.value.clientId?[{id:'client',label:'This client'}]:[])]);
const params=()=>({agencyId:props.agencyId,mode:'insurance',scope:scope.value,clientId:context.value.clientId,providerUserId:context.value.providerUserId,payerId:context.value.payerId,categoryKey:category.value,includeHidden:true});
const rows=computed(()=>schedule.value?.rows.filter(row=>allServices.value||!props.serviceCodes.length||props.serviceCodes.includes(row.serviceCode))||[]);
const money=v=>v==null?'Not set':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v/100);
async function load(){busy.value=true;error.value='';try{schedule.value=(await api.get('/medical-billing/fee-schedule/canonical',{params:params(),skipGlobalLoading:true})).data;amounts.value=Object.fromEntries(schedule.value.rows.map(row=>[row.serviceCode,(props.suggestedCharges?.[row.serviceCode]??row.rateCents)==null?'':((props.suggestedCharges?.[row.serviceCode]??row.rateCents)/100).toFixed(2)]));}catch(e){error.value=e.response?.data?.error?.message||'Rate defaults could not be loaded.';}finally{busy.value=false;}}
async function save(row){if(busy.value)return;busy.value=true;error.value='';notice.value='';try{
 const raw=String(amounts.value[row.serviceCode]||'');if(!/^\d+(\.\d{1,2})?$/.test(raw)||reason.value.trim().length<10)throw new Error('Enter a dollar amount and explain this default change.');
 schedule.value=(await api.post('/medical-billing/fee-schedule/canonical',{...params(),revision:schedule.value.revision,serviceCode:row.serviceCode,action:'set',rateCents:Math.round(Number(raw)*100),rateUnit:'unit',reason:reason.value.trim()},{skipGlobalLoading:true})).data;
 notice.value=`${row.serviceCode} default saved. New claims use this rate; existing claim amounts stay recorded until explicitly corrected.`;emit('saved',{serviceCode:row.serviceCode,scope:scope.value});
 }catch(e){error.value=e.response?.data?.error?.message||e.message||'Rate default was not saved.';}finally{busy.value=false;}}
onMounted(async()=>{if(props.claimId&&!props.context){try{context.value=(await api.get(`/medical-billing/claimmd/claims/${props.claimId}/draft`,{params:{agencyId:props.agencyId},skipGlobalLoading:true})).data.editContext||{};}catch(e){error.value='Claim rate context is unavailable. Practice defaults remain available.';}}await load();});
watch([scope,category],()=>load());
</script>
<template>
 <section class="rate-defaults" aria-label="Edit rate defaults"><h3>Edit defaults</h3><p>Defaults set the billed charge. Payer reimbursement and clinical service permissions are checked separately.</p>
  <label>Apply this default to <select v-model="scope" :disabled="busy"><option v-for="item in scopes" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
  <label v-if="scope==='category'">Provider type <select v-model="category" :disabled="busy"><option v-for="item in schedule?.categories||[]" :key="item.key" :value="item.key">{{ item.label }}</option></select></label>
  <label>Why are you changing the default?<input v-model="reason" maxlength="1000" placeholder="Reviewed billed charges or contracted rate" /></label>
  <label><input v-model="allServices" type="checkbox" /> Show all current services</label>
  <div v-for="row in rows" :key="row.serviceCode" class="rate-row"><strong>{{ row.serviceCode }}</strong><span>{{ row.sourceLabel }} · {{ money(row.rateCents) }} per unit</span><label>New dollars per unit <input v-model="amounts[row.serviceCode]" inputmode="decimal" /></label><button type="button" :disabled="busy||reason.trim().length<10" @click="save(row)">Save default</button></div>
  <p v-if="busy" role="status">Loading or saving defaults…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
 </section>
</template>
<style scoped>.rate-defaults{padding:16px;border:1px solid #bfccda;border-radius:10px;background:var(--app-surface,#fff);margin:12px 0}label{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0}.rate-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;border-top:1px solid #e1e7ed;padding:10px 0}.rate-row span{font-size:13px;color:#53677c}.rate-row input{width:110px}input,select,button{font:inherit;padding:8px;border:1px solid #b9c8d8;border-radius:6px}button{cursor:pointer}p{line-height:1.5;font-size:13px}[role=alert]{color:#a12424}</style>
