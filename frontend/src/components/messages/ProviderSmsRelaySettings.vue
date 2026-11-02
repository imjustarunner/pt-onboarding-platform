<template>
  <section v-if="!unavailable && agencyId" class="relay-settings" aria-labelledby="relay-title">
    <h3 id="relay-title">Provider text forwarding</h3>
    <p>Receive client and guardian texts on your personal phone. Reply to the app number using the exact family code shown, followed by your message. Your name appears on replies sent to the family.</p>
    <p>Secure messages, group conversations and attachments stay in the app.</p>
    <p v-if="loading" role="status">Loading forwarding settings…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="settings">
      <p role="status">{{ active ? 'Forwarding is enabled for this agency.' : 'Forwarding is off for this agency.' }}</p>
      <p v-if="active && (!settings.textsEnabled || !settings.forwardingEnabled)">Text delivery is paused in notification preferences.</p>
      <label>Personal phone <input v-model="phone" type="tel" autocomplete="tel" :disabled="saving" /></label>
      <label>App number <select v-model="numberId" :disabled="saving"><option value="">Choose a number</option><option v-for="number in settings.numbers" :key="number.id" :value="number.id">{{ number.phone }}</option></select></label>
      <p v-if="!settings.numbers.length">An administrator must configure an eligible care number before forwarding can be enabled.</p>
      <blockquote>{{ settings.disclosure }}</blockquote>
      <label class="consent"><input v-model="consent" type="checkbox" :disabled="saving" />{{ isOwnAccount ? 'I own this phone and agree to the disclosure above.' : 'The phone owner has agreed to the disclosure above. Record their verbal permission.' }}</label>
      <button type="button" :disabled="saving || !consent || !phone.trim() || !numberId" @click="save(true)">{{ saving ? 'Saving…' : 'Enable forwarding and texts' }}</button>
      <button v-if="active" type="button" :disabled="saving" @click="save(false)">Turn forwarding off</button>
      <p v-if="saved" role="status">Forwarding settings saved.</p>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ userId: { type: Number, required: true }, agencyId: Number, isOwnAccount: Boolean });
const emit = defineEmits(['updated']);
const settings=ref(null), phone=ref(''), numberId=ref(''), consent=ref(false);
const loading=ref(false), saving=ref(false), saved=ref(false), error=ref(''), unavailable=ref(false);
const active=computed(()=>settings.value?.enrollments.some(row=>row.enabled===true || row.enabled===1));
const endpoint=()=>`/users/${props.userId}/provider-sms-relay?agencyId=${props.agencyId}`;
function apply(data){settings.value=data;const current=data.enrollments.find(row=>row.enabled===true || row.enabled===1);phone.value=current?.phone || data.personalPhone;numberId.value=current?.number_id || data.numbers[0]?.id || '';consent.value=false;}
function message(e){const error=e.response?.data?.error;return typeof error==='string'?error:error?.message || 'Could not save or load forwarding settings.';}
let request=0;
async function load(){const current=++request;settings.value=null;saved.value=false;error.value='';unavailable.value=false;if(!props.agencyId)return;loading.value=true;try{const {data}=await api.get(endpoint());if(current===request)apply(data);}catch(e){if(current===request){if(e.response?.status===403)unavailable.value=true;else error.value=message(e);}}finally{if(current===request)loading.value=false;}}
async function save(enabled){const current=request;saving.value=true;saved.value=false;error.value='';try{const {data}=await api.put(endpoint(),{enabled,phone:phone.value,numberId:numberId.value,consent:consent.value});if(current===request){apply(data);saved.value=true;emit('updated',data);}}catch(e){if(current===request)error.value=message(e);}finally{saving.value=false;}}
watch(()=>[props.userId,props.agencyId],load,{immediate:true});
</script>
<style scoped>
.relay-settings{padding:20px;border:1px solid var(--border,#cad6d0);border-radius:10px;background:var(--bg-card,#fff);color:var(--text-primary,#263c35)}
p,blockquote{line-height:1.5;font-size:14px}label{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0}input,select,button{padding:10px;font:inherit;max-width:100%}blockquote{margin:16px 0;padding:12px;background:var(--bg-secondary,#f2f5f8)}.consent{align-items:flex-start}button{margin:4px 8px 4px 0;cursor:pointer}
</style>
