<template>
<section class="recurring">
 <header><div><img src="/assets/fundthred/icon.svg" alt="" /><h3>Recurring pay & stipends</h3></div><button v-if="editable" @click="adding=!adding">{{ adding?'Close':'＋ Add recurring payment' }}</button></header>
 <p>Scheduled payments appear automatically in payroll for their service dates. Do not submit the same time or stipend again.</p>
 <p v-if="error" role="alert">{{ error }}</p><p v-if="loading">Loading scheduled payments…</p>
 <form v-if="adding" @submit.prevent="save" class="recurring-form">
  <label>Purpose / label<input v-model="form.label" required maxlength="110" placeholder="Ongoing office management" /></label>
  <label>Frequency<select v-model="form.cadence"><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option><option value="once">One time</option></select></label>
  <label>First payment date<input type="date" v-model="form.startsOn" required /></label><label>Last payment date (optional)<input type="date" v-model="form.endsOn" :min="form.startsOn" /></label>
  <label>Payment basis<select v-model="basis"><option value="amount">Fixed stipend amount</option><option value="time">Fixed paid time</option></select></label>
  <label v-if="basis==='amount'">Amount per occurrence ($)<input type="number" min="0.01" step="0.01" v-model="form.amount" required /></label>
  <template v-else><label>Minutes per occurrence<input type="number" min="1" step="1" v-model="form.minutes" required /></label><label>Agreed hourly rate ($)<input type="number" min="0.01" step="0.01" v-model="form.hourlyRate" required /></label></template>
  <p>Monthly payments use the same day of the month (or the last day in shorter months). Existing payroll entries remain unchanged.</p>
  <button :disabled="saving">{{ saving?'Saving…':'Save scheduled payment' }}</button>
 </form>
 <div v-if="!loading&&!rows.length" class="empty">No recurring payments assigned.</div>
 <article v-for="row in rows" :key="row.id">
  <div><strong>{{ row.label }}</strong><p>{{ money(row.amount) }} · {{ frequencies[row.cadence] }}<span v-if="Number(row.minutes)>0"> · {{ Number(row.minutes) }} minutes at {{ money(row.hourly_rate) }}/hour</span></p><small>{{ date(row.starts_on) }}{{ row.ends_on?' through '+date(row.ends_on):' onward' }}</small></div>
  <form v-if="editable" @submit.prevent="stop(row)"><label>End after<input type="date" v-model="endDates[row.id]" :min="date(row.starts_on)" required /></label><button :disabled="saving">Set end date</button></form>
 </article>
</section>
</template>
<script setup>
const api = useSubmitApi();
import {ref,watch} from 'vue';import { useSubmitApi } from '../../composables/useSubmitContext';
const props=defineProps({agencyId:[Number,String],userId:[Number,String],editable:Boolean});
const rows=ref([]),error=ref(''),loading=ref(false),saving=ref(false),adding=ref(false),basis=ref('amount'),endDates=ref({});
const requestKey=ref(crypto.randomUUID());
const form=ref({label:'',cadence:'biweekly',startsOn:'',endsOn:'',amount:'',minutes:15,hourlyRate:''});
const frequencies={once:'One time',weekly:'Weekly',biweekly:'Every two weeks',monthly:'Monthly'};
const date=v=>String(v||'').slice(0,10),money=n=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD'});
const endpoint=()=>props.editable?`/payroll/users/${props.userId}/recurring-payments`:'/payroll/me/recurring-payments';
async function load(){if(!props.agencyId)return;loading.value=true;error.value='';try{rows.value=(await api.get(endpoint(),{params:{agencyId:props.agencyId}})).data;for(const r of rows.value)endDates.value[r.id]=date(r.ends_on);}catch(e){error.value=e.response?.data?.error?.message||'Could not load scheduled payments';}finally{loading.value=false;}}
async function save(){saving.value=true;error.value='';try{await api.post(endpoint(),{...form.value,agencyId:props.agencyId,requestKey:requestKey.value,minutes:basis.value==='time'?form.value.minutes:0});adding.value=false;requestKey.value=crypto.randomUUID();await load();}catch(e){error.value=e.response?.data?.error?.message||'Could not save payment';}finally{saving.value=false;}}
async function stop(row){saving.value=true;error.value='';try{await api.patch(endpoint()+'/'+row.id,{agencyId:props.agencyId,endsOn:endDates.value[row.id]});await load();}catch(e){error.value=e.response?.data?.error?.message||'Could not update payment';}finally{saving.value=false;}}
watch(()=>[props.agencyId,props.userId],load,{immediate:true});
</script>
<style scoped>
.recurring{padding:22px;border:1px solid #dce7ec;border-radius:18px;margin:18px 0;color:#0d203d;background:#fff}.recurring header,.recurring header>div,.recurring article{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.recurring img{width:32px}.recurring h3{margin:0;color:#0d203d}.recurring p,.recurring small{color:#526981;line-height:1.5}.recurring article{padding:16px 0;border-top:1px solid #dce7ec}.recurring-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px;margin:20px 0}.recurring label{display:grid;gap:6px;font-size:14px}.recurring input,.recurring select,.recurring button{font:inherit;min-height:44px;padding:10px 12px;border:1px solid #cbdde3;border-radius:10px;box-sizing:border-box;min-width:0}.recurring button{background:#e6f6f2;color:#075e59;font-weight:650;cursor:pointer}.recurring .empty{color:#526981;padding:12px 0}
</style>
