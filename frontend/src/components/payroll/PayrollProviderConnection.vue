<template>
  <details v-if="periodId && !locked" class="provider-connect" @toggle="onToggle">
    <summary>Connect an imported provider</summary>
    <p>Connect a name in the billing report to the employee’s existing payroll profile and compensation.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="success" role="status">{{ success }}</p>
    <p v-if="loading" role="status">Loading connection review…</p>
    <div class="connection-fields">
      <label>Provider in the report
        <select v-model="providerName" :disabled="loading || saving" @change="refreshReview">
          <option value="">Choose report name</option>
          <option v-for="provider in providers" :key="provider.name" :value="provider.name">{{ provider.name }}</option>
        </select>
      </label>
      <label>Existing payroll profile
        <select v-model="targetUserId" :disabled="loading || saving" @change="refreshReview">
          <option :value="null">Choose existing employee</option>
          <option v-for="person in candidates" :key="person.id" :value="person.id">{{ person.name }}{{ person.archived ? ' (Archived — payroll history)' : '' }} · #{{ person.id }}</option>
        </select>
      </label>
    </div>
    <template v-if="review">
      <p>{{ review.currentRows }} current-report rows and {{ review.catchupRows }} prior catch-up-report rows will connect to <strong>{{ review.target.name }}</strong>.</p>
      <p v-if="review.target.archived">This profile stays archived. Connecting payroll services does not restore sign-in access.</p>
      <p>Existing rates and posted payroll history stay intact. After connecting, review catch-up items and run payroll again to calculate the pay.</p>
      <label class="connection-confirm"><input v-model="confirmed" type="checkbox" :disabled="saving" /> I confirm these services belong to this employee.</label>
      <button type="button" class="btn btn-primary" :disabled="loading || saving || !confirmed || !review.changedRows" @click="connect">{{ saving ? 'Connecting…' : 'Connect provider' }}</button>
    </template>
    <button v-if="error" type="button" class="btn btn-secondary" :disabled="loading || saving" @click="reload">Refresh connection review</button>
  </details>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({periodId:{type:Number,default:null},locked:Boolean});
const emit=defineEmits(['connected']);
const providers=ref([]),candidates=ref([]),providerName=ref(''),targetUserId=ref(null),review=ref(null),confirmed=ref(false),loading=ref(false),saving=ref(false),error=ref(''),success=ref('');
let version=0,open=false;
const message=e=>e?.response?.data?.error?.message||e.message||'Unable to review the provider connection.';
const refreshReview=async()=>{
 const request=++version,periodId=props.periodId;review.value=null;confirmed.value=false;error.value='';success.value='';
 if(!providerName.value||!targetUserId.value){loading.value=false;return;}
 loading.value=true;
 try{const {data}=await api.get(`/payroll/periods/${periodId}/provider-connection`,{params:{providerName:providerName.value,targetUserId:targetUserId.value}});if(request===version)review.value=data;}
 catch(e){if(request===version)error.value=message(e);}finally{if(request===version)loading.value=false;}
};
const reload=async()=>{
 const request=++version,periodId=props.periodId;review.value=null;confirmed.value=false;loading.value=true;error.value='';
 try{const {data}=await api.get(`/payroll/periods/${periodId}/provider-connection`);if(request!==version)return;providers.value=data.providers||[];candidates.value=data.candidates||[];}
 catch(e){if(request===version)error.value=message(e);}finally{if(request===version)loading.value=false;}
 if(request===version&&providerName.value&&targetUserId.value)await refreshReview();
};
const onToggle=async event=>{open=event.target.open;if(open)await reload();};
const connect=async()=>{
 if(saving.value||!confirmed.value||!review.value?.reviewToken||props.locked)return;
 const request=version,periodId=props.periodId;saving.value=true;error.value='';
 try{
  const {data}=await api.post(`/payroll/periods/${periodId}/provider-connection`,{providerName:providerName.value,targetUserId:targetUserId.value,reviewToken:review.value.reviewToken,confirmedSamePerson:true});
  if(!data.connected)throw Error('The server did not confirm the connection. Refresh the review.');
  if(request!==version)return;
  success.value=`Connected ${data.changedRows} rows to ${data.target.name}. Review catch-up items, then run payroll again.`;review.value=null;confirmed.value=false;emit('connected',data);
 }catch(e){if(request===version){error.value=message(e);review.value=null;confirmed.value=false;}}finally{saving.value=false;}
};
watch(()=>[props.periodId,props.locked],()=>{++version;providerName.value='';targetUserId.value=null;review.value=null;confirmed.value=false;providers.value=[];candidates.value=[];success.value='';error.value='';loading.value=false;if(open&&props.periodId&&!props.locked)reload();});
</script>
<style scoped>
.provider-connect{margin:14px 0;padding:16px;border:1px solid var(--border,#cddde5);border-radius:12px;background:var(--surface,#fff);color:var(--text-primary,#173a44)}.provider-connect summary{cursor:pointer;font-weight:700}.provider-connect p{line-height:1.55}.connection-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:16px 0}.connection-fields label{display:grid;gap:6px}.connection-fields select{padding:10px;max-width:100%;min-width:0;border:1px solid #cddde5;border-radius:8px;font:inherit}.connection-confirm{display:block;margin:16px 0}.provider-connect [role=alert]{color:#b42318}.provider-connect [role=status]{font-weight:600}@media(max-width:640px){.connection-fields{grid-template-columns:1fr}}
</style>
