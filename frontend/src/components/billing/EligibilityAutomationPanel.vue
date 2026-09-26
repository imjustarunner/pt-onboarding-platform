<template>
 <section class="automation" aria-labelledby="eligibility-automation-title">
  <header><div><h2 id="eligibility-automation-title">Background insurance verification</h2><p>Schedule checks for enrolled clients. Responses remain subject to billing review; new findings never automatically approve coverage or release a patient balance.</p></div><button :disabled="busy" @click="load(0)">Refresh</button></header>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <template v-if="data">
   <div class="state"><strong>{{ draft.enabled ? 'Requested on' : 'Paused' }}</strong><span>Worker: {{ data.workerEnabled ? 'Enabled' : 'Deployment activation required' }}</span><span>Claim.MD: {{ data.connectionReady ? 'Configured' : 'Setup required' }}</span><span>Shared account monthly limit: {{ data.accountLimit ?? 'Not configured' }}</span><span>{{ data.totals.enrolled }} clients enrolled</span></div>
   <form @submit.prevent="savePolicy">
    <div class="fields"><label>Frequency<select v-model="draft.cadence" :disabled="busy"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="before_visit">Before scheduled visits (next 24 hours)</option></select></label>
    <label>Agency monthly check limit<input v-model.number="draft.monthlyLimit" type="number" min="1" max="1000000" required :disabled="busy" /></label>
    <label class="check"><input v-model="draft.enabled" type="checkbox" :disabled="busy" /> Enable this agency’s schedule</label></div>
    <label>Payer eligibility setup reference<input v-model="draft.readinessReference" minlength="5" maxlength="1000" placeholder="Setup confirmation or enrollment reference; no patient details" required :disabled="busy" /></label>
    <label class="check"><input v-model="draft.readinessConfirmed" type="checkbox" :required="draft.enabled" :disabled="busy" /> I confirmed eligibility access for the selected billing identities and will review returned findings.</label>
    <button :disabled="busy">Save schedule</button><small>Saving assigns you as the responsible reviewer. Your billing access is checked when the worker runs.</small>
   </form>
   <p class="hint">Limits include manual and automatic checks. Unconfirmed requests count toward the limit; review them in Claim.MD before attempting a new check. Primary and secondary policies each require a check. Monthly/weekly checks use the run date and do not verify a different visit date.</p>
   <h3>Client enrollment</h3><p>Only current, active clients with saved insurance are checked. Select the billing office for periodic checks. Before-visit checks use each scheduled session’s billing-office mapping.</p>
   <div class="toolbar"><label>Billing office<select v-model="officeId" :disabled="busy"><option value="">Select an office</option><option v-for="office in data.offices" :key="office.id" :value="office.id">{{ office.name }} · {{ office.practice_npi }}</option></select></label><button :disabled="busy || !selected.length || !officeId" @click="enroll(true)">Enroll selected ({{ selected.length }})</button><button :disabled="busy || !selected.length" @click="enroll(false)">Pause selected</button></div>
   <div class="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select clients on this page" :checked="allSelected" :disabled="busy || !data.clients.length" @change="selectPage($event.target.checked)" /></th><th>Client</th><th>Insurer</th><th>Eligibility schedule</th><th>Office</th><th>Last check</th></tr></thead><tbody><tr v-for="client in data.clients" :key="client.id"><td><input v-model="selected" type="checkbox" :value="client.id" :aria-label="`Select client ${client.id}`" :disabled="busy" /></td><td>{{ client.initials }} · #{{ client.id }}</td><td>{{ client.primary_insurer_name || 'Review insurance' }}</td><td>{{ !client.eligible ? 'Inactive — skipped' : client.enabled ? 'Enrolled' : 'Not enrolled' }}</td><td>{{ data.offices.find(o => o.id === client.billing_office_location_id)?.name || '—' }}</td><td>{{ client.last_status || 'Not checked' }}<small>{{ client.last_checked_at || '' }}</small></td></tr></tbody></table></div>
   <p v-if="!data.clients.length">No clients with insurance are available on this page.</p><div class="toolbar"><button :disabled="busy || !after" @click="load(0)">First page</button><button :disabled="busy || !data.nextAfter" @click="load(data.nextAfter)">Next page</button></div>
   <h3>This month’s activity (UTC)</h3><ul><li v-for="item in data.usage" :key="`${item.source}-${item.status}`">{{ item.source }} · {{ statusLabel(item.status) }}: {{ item.count }}</li></ul><p v-if="!data.usage.length">No checks recorded this month.</p>
   <p>Last worker run: {{ data.policy?.last_run_at || 'Not run' }} · {{ data.policy?.last_run_status || 'Awaiting setup' }}</p>
   <details><summary>Recent checks</summary><p>Review the client’s insurance screen for dated evidence and other-coverage findings. An unconfirmed request must be reconciled before another attempt.</p><ul><li v-for="item in data.recent" :key="item.id">Client #{{ item.client_id }} · {{ item.policy_slot || 'Check' }} · {{ item.service_date?.slice(0,10) || 'Date pending' }} · {{ statusLabel(item.status) }} · {{ item.source }}</li></ul></details>
  </template>
 </section>
</template>
<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true}});
const data=ref(null),draft=ref({}),busy=ref(false),error=ref(''),notice=ref(''),officeId=ref(''),selected=ref([]),after=ref(0);
let generation=0;
const allSelected=computed(()=>data.value?.clients.length&&data.value.clients.every(c=>selected.value.includes(c.id)));
const statusLabel=value=>({reserved:'Awaiting response / reconcile if stalled',returned:'Response returned — review coverage',unknown:'Unconfirmed — review before retry',not_sent:'Not sent'}[value]||value);
function selectPage(on){selected.value=on?data.value.clients.map(c=>c.id):[];}
async function load(cursor=0){const g=++generation;busy.value=true;error.value='';selected.value=[];try{const r=await api.get('/medical-billing/eligibility-automation',{params:{agencyId:props.agencyId,after:cursor}});if(g!==generation)return;data.value=r.data;after.value=cursor;const p=r.data.policy;draft.value={enabled:!!p?.enabled,cadence:p?.cadence||'monthly',monthlyLimit:p?.monthly_limit||1000,revision:p?.revision||0,readinessReference:p?.readiness_reference||'',readinessConfirmed:false};}catch(e){if(g===generation){data.value=null;error.value=e.response?.data?.error?.message||'Eligibility scheduling is unavailable. Check migration and access setup.';}}finally{if(g===generation)busy.value=false;}}
async function mutate(path,payload,message){const g=generation;busy.value=true;error.value='';notice.value='';try{await api.put(path,{...payload,agencyId:props.agencyId});if(g!==generation)return;await load(after.value);if(g+1===generation)notice.value=message;}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'Changes could not be saved';}finally{if(g===generation)busy.value=false;}}
function savePolicy(){return mutate('/medical-billing/eligibility-automation',{...draft.value},'Schedule saved. Checks run only when all setup controls are enabled.');}
async function enroll(enabled){
 if(!enabled){
   // A paused enrollment retains its office; no new identity is assigned.
   const g=generation;busy.value=true;error.value='';
   try{for(const id of selected.value){const row=data.value.clients.find(c=>c.id===id);if(!row?.billing_office_location_id)continue;await api.put('/medical-billing/eligibility-automation/clients',{agencyId:props.agencyId,clientIds:[id],officeId:row.billing_office_location_id,enabled:false});if(g!==generation)return;}await load(after.value);}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'Pause could not be completed; refresh to review';}finally{if(g===generation)busy.value=false;}return;
 }
 return mutate('/medical-billing/eligibility-automation/clients',{clientIds:selected.value,officeId:Number(officeId.value),enabled},'Selected clients enrolled. Both recorded policies are checked.');
}
watch(()=>props.agencyId,()=>{generation++;data.value=null;draft.value={};officeId.value='';notice.value='';load(0);},{immediate:true});
onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>
.automation{background:var(--bg-card,#fff);border:1px solid var(--border-color,#dde5ef);border-radius:14px;padding:24px;margin:20px 0}header,.state,.toolbar,.fields{display:flex;flex-wrap:wrap;gap:16px;align-items:center}header>div{flex:1;min-width:250px}h2{margin:0 0 12px}p,small,li{line-height:1.6}.state,.hint{padding:14px;background:var(--bg-secondary,#eff5fb);border-radius:8px}.state span,small{color:var(--text-secondary,#52617a);font-size:13px}label{display:flex;flex-direction:column;gap:8px;margin:14px 0}.check{flex-direction:row;align-items:center}input:not([type=checkbox]),select,button{font:inherit;padding:10px;border:1px solid var(--border-color,#c4d0df);border-radius:6px;min-height:40px}button{cursor:pointer;color:var(--bw-brand,#2463ad);background:var(--bg-card,#fff)}button:disabled{opacity:.5;cursor:default}small{display:block;margin:8px 0}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse}td,th{padding:12px;text-align:left;border-bottom:1px solid var(--border-color,#dde5ef)}[role=alert]{color:var(--app-text-red, #b91c1c)}summary{cursor:pointer;font-weight:600}li{margin:8px 0}
</style>
