<template>
 <section class="finance-panel">
  <p v-if="error" class="finance-error" role="alert">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
  <p v-if="loading" role="status">Loading donations…</p>
  <template v-else-if="settings?.available">
   <header><h2>MH4Kidz donations</h2><a href="https://mh4kidz.org/donate" target="_blank" rel="noopener">View donation page ↗</a></header>
   <p class="finance-callout">{{settings.acceptingDonations?'Online donations are open.':'Online donations are closed until setup is complete and you enable giving.'}}</p>
   <div class="donation-totals"><p><strong>{{money(records.totals.gross)}}</strong> Gross donations</p><p><strong>{{money(records.totals.refunded)}}</strong> Refunded</p><p><strong>{{money(Number(records.totals.gross)-Number(records.totals.refunded))}}</strong> Net contributions</p></div>
   <p>Confirmed gifts and refunds are automatically recorded in the selected fund. Stripe processing fees are recorded separately as expenses. Issue refunds from the connected Stripe account; confirmed refunds update these records and donor acknowledgments.</p>
   <details><summary>Donation setup</summary>
    <form @submit.prevent="save" class="donation-settings">
     <label>Legal nonprofit name<input v-model="settings.legalName" required maxlength="200" /></label>
     <label>EIN<input v-model="settings.ein" placeholder="XX-XXXXXXX" pattern="[0-9]{2}-[0-9]{7}" maxlength="10" /></label>
     <label class="check"><input v-model="settings.taxExemptConfirmed" type="checkbox" /> MH4Kidz’s tax-exempt charitable status is confirmed</label>
     <label class="check"><input v-model="settings.noBenefitsConfirmed" type="checkbox" /> These gifts provide no goods or services in return</label>
     <label>Donation fund<select v-model="settings.fundId"><option :value="null">Choose an unrestricted fund</option><option v-for="fund in funds.filter(f=>f.kind==='unrestricted')" :key="fund.id" :value="fund.id">{{fund.name}}</option></select></label>
     <p v-if="!funds.some(f=>f.kind==='unrestricted')">Create an unrestricted fund in Finance Operations → Funds, then return here.</p>
     <label>Receipt sender<select v-model="settings.senderIdentityId"><option :value="null">Choose a MH4Kidz sender</option><option v-for="sender in settings.senders" :key="sender.id" :value="sender.id">{{sender.display_name}} · {{sender.from_email}}</option></select></label>
     <p v-if="!settings.senders.length">Add an active MH4Kidz email identity in the organization’s email settings.</p>
     <p>Stripe account: <strong>{{settings.stripeConnected?'Connected':'Not connected'}}</strong>. <router-link :to="`/mh4kidz/admin/family-billing?tab=setup&amp;agencyId=${agencyId}`">Open MH4Kidz Stripe setup</router-link>.</p>
     <p v-if="!settings.platformPaymentsReady">The platform’s live Stripe connection and signed Connect webhook also need configuration.</p>
     <label class="check"><input v-model="settings.enabled" type="checkbox" /> Open online donations when setup is complete</label>
     <button :disabled="busy">{{busy?'Saving…':'Save donation settings'}}</button>
    </form>
   </details>
   <h3>Recent donations</h3><button :disabled="busy" @click="exportDonations">Export all confirmed donations (CSV)</button><p v-if="!records.donations.length">No donations yet. Paid gifts will appear here after payment confirmation.</p>
   <div v-else class="finance-table-wrap"><table><thead><tr><th>Donor</th><th>Gift</th><th>Status</th><th>Recognition</th><th>Receipt</th></tr></thead><tbody><tr v-for="row in records.donations" :key="row.id"><td>{{row.donor_name}}<small>{{row.donor_email}}</small><small>{{row.city}} {{row.region}} · {{day(row.paid_at||row.created_at)}}</small></td><td>{{money(row.amount_cents)}}<small v-if="Number(row.refunded_cents)">{{money(row.refunded_cents)}} refunded</small></td><td>{{label(row.status)}}</td><td>{{row.public_recognition?'Public':'Anonymous'}}</td><td>{{row.receipt_status?label(row.receipt_status):'Awaiting payment'}}<p v-if="row.last_error">{{row.last_error}}</p><template v-if="['needs_review','sending'].includes(row.receipt_status)"><label class="check"><input v-model="reviewed[row.id]" type="checkbox" /> I checked Communications for prior delivery</label><button :disabled="busy||!reviewed[row.id]" @click="retry(row.id)">Retry receipt</button></template></td></tr></tbody></table></div>
  </template>
  <p v-else>Online donation setup is available for MH4Kidz.</p>
 </section>
</template>
<script setup>
import {onMounted,onBeforeUnmount,ref} from 'vue';
import api from '../../services/api';
import {money,day,label} from './financeForms';
const props=defineProps({agencyId:{type:Number,required:true},funds:{type:Array,default:()=>[]}});
const settings=ref(null),records=ref({donations:[],totals:{gross:0,refunded:0}}),loading=ref(true),busy=ref(false),error=ref(''),notice=ref(''),reviewed=ref({});
let alive=true;onBeforeUnmount(()=>alive=false);
const base=`/finance-operations/${props.agencyId}/donations`;
async function load(){error.value='';try{const [s,r]=await Promise.all([api.get(`${base}/settings`),api.get(base)]);if(alive){settings.value=s.data;records.value=r.data;}}catch(e){if(alive)error.value=e.response?.data?.error?.message||'Donations could not load.';}finally{if(alive)loading.value=false;}}
async function save(){busy.value=true;error.value='';try{await api.put(`${base}/settings`,settings.value);notice.value='Donation settings saved.';await load();}catch(e){error.value=e.response?.data?.error?.message||'Settings could not be saved.';}finally{busy.value=false;}}
async function retry(id){busy.value=true;error.value='';try{await api.post(`${base}/${id}/receipt`,{reviewedCommunications:reviewed.value[id]===true});await load();}catch(e){error.value=e.response?.data?.error?.message||'Receipt retry could not complete.';}finally{busy.value=false;}}
async function exportDonations(){busy.value=true;error.value='';try{const r=await api.get(`${base}/export.csv`,{responseType:'blob'});const url=URL.createObjectURL(r.data),a=document.createElement('a');a.href=url;a.download='mh4kidz-donations.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{error.value='The donation export could not be downloaded.';}finally{busy.value=false;}}
onMounted(load);
</script>
<style scoped>
.donation-totals{display:flex;gap:24px;flex-wrap:wrap}.donation-totals strong{display:block;font-size:26px}.donation-settings{display:grid;gap:16px;max-width:680px;margin:24px 0}.donation-settings label:not(.check){display:grid;gap:8px}details{padding:18px 0}summary{cursor:pointer;font-weight:700}td small{display:block;margin-top:5px}td{vertical-align:top}
</style>
