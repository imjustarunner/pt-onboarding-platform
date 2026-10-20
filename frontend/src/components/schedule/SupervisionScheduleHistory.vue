<template>
  <section class="history" aria-label="Supervision change and delivery history">
    <h3>Changes &amp; notifications</h3><p>Recorded actions and the status of each email. Held or review means delivery needs attention.</p>
    <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="load">Refresh delivery status</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="loading">Loading history…</p>
    <template v-else><p v-if="!actions.length && !deliveries.length">No schedule changes or missed-session notices recorded yet.</p>
      <ul v-if="actions.length"><li v-for="a in actions" :key="a.id"><strong>{{ a.action_kind }}</strong> · {{ a.actor_name }} · {{ when(a.created_at) }}<p>{{ a.reason }}</p><small v-if="a.delivery_state==='pending'">Email queued</small><small v-if="a.delivery_state==='review'">Email delivery needs review</small></li></ul>
      <table v-if="deliveries.length"><thead><tr><th>Recipient</th><th>Notice</th><th>Status</th><th>Recorded</th></tr></thead><tbody><tr v-for="(d,i) in deliveries" :key="i"><td>{{ d.recipient_name }}</td><td>{{ d.action_kind }}</td><td>{{ d.delivery_status }}</td><td>{{ when(d.created_at) }}</td></tr></tbody></table>
    </template>
  </section>
</template>
<script setup>
import {ref,onMounted} from 'vue';
import api from '../../services/api';
const props=defineProps({sessionId:Number,timezone:{type:String,default:'America/Denver'}});
const actions=ref([]),deliveries=ref([]),loading=ref(false),error=ref('');
const when=value=>{if(!value)return '';const raw=String(value);const d=new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)?raw:`${raw.replace(' ','T')}Z`);return Number.isFinite(+d)?d.toLocaleString('en-US',{timeZone:props.timezone}):'';};
async function load(){loading.value=true;error.value='';try{const {data}=await api.get(`/supervision/sessions/${props.sessionId}/schedule-actions`,{skipGlobalLoading:true});actions.value=data.actions || [];deliveries.value=data.deliveries || [];}catch(e){error.value=e.response?.data?.error?.message || 'Could not load notification history.';}finally{loading.value=false;}}
onMounted(load);
</script>
<style scoped>.history{padding:20px;border:1px solid #dce3ee;border-radius:14px;margin-bottom:20px;overflow:auto}.history h3{margin:0}.history ul{padding-left:20px}.history li{padding:10px 0}.history li p{margin:6px 0}.history table{width:100%;text-align:left;border-collapse:collapse}.history th,.history td{padding:9px;border-bottom:1px solid #e2e8f0}.history strong{text-transform:capitalize}</style>
