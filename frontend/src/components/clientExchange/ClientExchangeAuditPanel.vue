<template>
  <section class="exchange-audit">
    <h3>Matching and delivery audit</h3>
    <button type="button" @click="load" :disabled="loading">{{ loading ? 'Loading…' : 'Refresh audit' }}</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="audit">
      <p>{{ matched.length }} {{ audit.matchesEvaluatedAt ? 'currently matched' : 'matched at last evaluation' }} · {{ unmatched.length }} not matched or needing review</p>
      <p>{{ audit.views?.total || 0 }} detail views · {{ audit.views?.unique_viewers || 0 }} unique viewers since {{ audit.trackingStartedAt ? new Date(audit.trackingStartedAt).toLocaleString() : 'tracking began' }}. Earlier views were not tracked.</p>
      <p v-if="audit.matchesEvaluatedAt">Matching checked {{ new Date(audit.matchesEvaluatedAt).toLocaleString() }}. Refresh checks current settings and does not send notifications.</p>
      <p v-if="!audit.run">No delivery evaluation has been recorded yet.</p>
      <p v-else-if="!audit.run.evaluated_at">Matching notifications are queued.</p>
      <p v-else>Notification evaluation {{ new Date(audit.run.evaluated_at).toLocaleString() }}<span v-if="audit.run.error_code"> · Some results need review.</span></p>
      <p>Sent means accepted by the sending service, not proof of reading. Delivery receipts describe the original notification attempts; current matches can differ. Unverified availability needs confirmation before care begins.</p>
      <details v-for="group in [{title:'Matched providers',rows:matched},{title:'Providers not matched / needing review',rows:unmatched}]" :key="group.title">
        <summary>{{ group.title }} ({{ group.rows.length }})</summary>
        <article v-for="provider in group.rows" :key="provider.userId">
          <strong>{{ provider.name }}</strong>
          <ExchangeMatchStatus v-if="provider.canRequest !== undefined" :fit="provider" />
          <p v-for="check in provider.checks" :key="check.field">{{ check.status }}: {{ check.reason }}</p>
          <p>Email: {{ delivery(provider.emailDelivery) }}</p>
          <p>Text: {{ delivery(provider.smsDelivery) }}</p>
          <p>{{ provider.views }} detail views</p>
        </article>
      </details>
      <details><summary>All recorded viewers</summary><p v-for="viewer in audit.viewers" :key="viewer.user_id">{{ viewer.first_name }} {{ viewer.last_name }}: {{ viewer.view_count }} views</p></details>
    </template>
  </section>
</template>
<script setup>
import ExchangeMatchStatus from './ExchangeMatchStatus.vue';
import {ref,computed,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({listingId:{type:Number,required:true}});
const audit=ref(null),error=ref(''),loading=ref(false);
const matched=computed(()=>(audit.value?.providers||[]).filter(p=>p.matched));
const unmatched=computed(()=>(audit.value?.providers||[]).filter(p=>!p.matched));
const delivery=value=>value?`${value.status}${value.reason?` — ${value.reason}`:''}`:'Not attempted / no historical receipt';
let version=0;
async function load(){const token=++version;loading.value=true;error.value='';try{const {data}=await api.get(`/client-exchange/listings/${props.listingId}/audit`);if(token===version)audit.value=data;}catch(e){if(token===version)error.value=e?.response?.data?.error?.message||'Could not load audit';}finally{if(token===version)loading.value=false;}}
watch(()=>props.listingId,()=>{audit.value=null;load();},{immediate:true});
</script>
<style scoped>
.exchange-audit{border-top:1px solid var(--border,#ddd);padding:16px;font-size:13px} details{margin-top:12px}summary{cursor:pointer;font-weight:600}article{border-bottom:1px solid var(--border,#ddd);padding:12px 0}p{margin:6px 0}
</style>
