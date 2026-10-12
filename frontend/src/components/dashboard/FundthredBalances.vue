<template>
  <section class="ft-balances" aria-label="FundThred leave balances">
    <header><div><img src="/assets/fundthred/wordmark.svg" alt="FundThred" /><p>Your balances and requests</p></div><button type="button" @click="$emit('submit')">Submit a claim →</button></header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="loading">Loading balances…</p>
    <div v-else class="ft-balance-grid">
      <article v-for="card in cards" :key="card.type" :class="'ft-balance ft-balance--'+card.type">
        <h3>{{ card.label }}</h3><strong>{{ number(card.hours) }} <small>hours</small></strong>
        <p>{{ card.rate == null ? 'Payment rate awaiting confirmation' : money(card.hours * card.rate) + ' at ' + money(card.rate) + '/hour' }}</p>
        <p class="ft-note">{{ card.note }}</p>
        <button type="button" @click="$emit('request', card.type)">Request {{ card.label.toLowerCase() }} →</button>
      </article>
    </div>
  </section>
</template>
<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:[Number,String]});
defineEmits(['request','submit']);
const data=ref(null),loading=ref(false),error=ref('');
const number=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});
const money=n=>Number(n||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
const cards=computed(()=>{
 const d=data.value||{}, b=d.balances||{},a=d.account||{},p=d.policy||{};
 const rate=Number(d.effectivePtoPayRate)>0?Number(d.effectivePtoPayRate):null;
 const rows=[{type:'sick',label:'Sick leave',hours:b.sickHours,rate,note:'Current balance; approved requests are deducted by payroll.'}];
 if(p.trainingPtoEnabled&&a.training_pto_eligible) rows.push({type:'training',label:'Training PTO',hours:b.trainingHours,rate,note:'Approved training only. Include your description and proof.'});
 if(p.schoolSupportEnabled&&a.school_support_eligible) rows.push({type:'school_support',label:'School missed-session hours',hours:b.schoolSupportHours,rate:d.schoolSupportPayRate??null,note:'Support activity hours for eligible missed school sessions. Maximum 20 hours.'});
 return rows;
});
watch(()=>props.agencyId,async id=>{data.value=null;if(!id)return;loading.value=true;error.value='';try{data.value=(await api.get('/payroll/me/pto-balances',{params:{agencyId:id}})).data;}catch(e){error.value=e.response?.data?.error?.message||'Unable to load balances';}finally{loading.value=false;}},{immediate:true});
</script>
<style scoped>
.ft-balances{margin-bottom:24px;color:#0d203d}.ft-balances header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin:12px 0}.ft-balances header img{width:160px;height:40px;object-fit:contain;object-position:left}.ft-balances header p{margin:4px 0;color:#526981}.ft-balance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px}.ft-balance{padding:22px;border:1px solid #dbe6eb;border-top:4px solid #087d76;border-radius:16px;background:#fff}.ft-balance--training{border-top-color:#7c3aed}.ft-balance--school_support{border-top-color:#d97706}.ft-balance h3{margin:0 0 16px;font-size:16px;color:#0d203d}.ft-balance strong{font-size:30px}.ft-balance small{font-size:15px;font-weight:500}.ft-balance p{font-size:14px;line-height:1.5}.ft-note{color:#526981}.ft-balances button{min-height:44px;padding:10px 16px;border:1px solid #b7d5d2;background:#e9f8f5;border-radius:10px;color:#075e59;font:inherit;font-weight:650;cursor:pointer}
</style>
