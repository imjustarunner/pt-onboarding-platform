<template>
  <section class="kiosk-access">
    <h4>{{ building?.name || 'Selected building' }} · AuricWell Kiosk setup</h4>
    <template v-if="building">
      <p><strong>All agencies at {{ building.name }}</strong></p>
      <ul class="agency-list"><li v-for="agency in building.agencies" :key="agency.id">{{ agency.name }}</li></ul>
      <p>One code includes this building’s affiliated agencies and their scheduled providers. You do not need separate kiosk accounts for each agency.</p>
      <p><a :href="kioskUrl" target="_blank" rel="noopener" class="btn btn-primary">Open {{ building.name }} kiosk ↗</a></p>
    </template>
    <p>Create the code below, open the kiosk on the office device, and enter the code once. Then add it to the home screen.</p>
    <p><a href="https://kiosk.auricwell.com" target="_blank" rel="noopener">kiosk.auricwell.com</a> · <a href="https://kiosk.plottwisthq.com" target="_blank" rel="noopener">kiosk.plottwisthq.com</a></p>
    <p class="muted">The building-specific link above works while the shared domains are being connected.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading">Loading kiosk access…</p>
    <template v-else-if="status && building">
      <p>{{ status.configured ? `A code is active for ${building.name}. It cannot be viewed again.` : `Create a code to enable ${building.name}’s kiosk.` }}</p>
      <div v-if="code" class="new-code"><p>{{ building.name }} setup code</p><strong>{{ code }}</strong><p>Save this code privately now. It is shown only once.</p><button class="btn btn-secondary" @click="code=''">Hide code</button></div>
      <button class="btn btn-primary" :disabled="busy" @click="rotate">{{ status.configured ? `Replace ${building.name} code & disconnect its devices` : `Create ${building.name} code` }}</button>
      <p class="muted">The code only unlocks this building’s check-in and directory. It cannot open staff accounts or client charts. Replacing it immediately revokes previous device access.</p>
      <h5>Connected devices ({{ status.devices.length }})</h5>
      <ul><li v-for="(device,index) in status.devices" :key="device.id"><span>Device {{ index+1 }} · Connected {{ date(device.created_at) }} · Last active {{ date(device.last_seen_at) }}</span> <button class="btn btn-secondary" :disabled="busy" @click="revoke(device.id)">Disconnect</button></li></ul>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props=defineProps({officeId:{type:[Number,String],required:true}});
const status=ref(null),code=ref(''),error=ref(''),busy=ref(false),loading=ref(false);
const building=ref(null);
const kioskUrl=computed(()=>`/kiosk-welcome/${props.officeId}`);
let version=0;
const date=value=>new Date(String(value).replace(' ','T')+(String(value).includes('Z')?'':'Z')).toLocaleDateString();
async function load(){const current=++version;loading.value=true;try{const results=await Promise.allSettled([api.get(`/offices/${props.officeId}/kiosk-access`),api.get(`/offices/${props.officeId}`)]);if(current!==version)return;const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;status.value=results[0].value.data;building.value=results[1].value.data;}catch(e){if(current===version){status.value=null;building.value=null;error.value=e.response?.data?.error?.message||'Could not load kiosk access.';}}finally{if(current===version)loading.value=false;}}
async function rotate(){if(busy.value||loading.value||!building.value||!status.value)return;if(status.value.configured&&!window.confirm(`Replace the ${building.value.name} code and disconnect every ${building.value.name} device? Each device will need the new code.`))return;busy.value=true;error.value='';code.value='';const office=props.officeId;try{const {data}=await api.post(`/offices/${office}/kiosk-access/rotate`);if(office===props.officeId){code.value=data.code;await load();}}catch(e){if(office===props.officeId)error.value=e.response?.data?.error?.message||'Could not create the code.';}finally{busy.value=false;}}
async function revoke(id){busy.value=true;try{await api.delete(`/offices/${props.officeId}/kiosk-access/devices/${id}`);await load();}catch{error.value='Could not disconnect this device.';}finally{busy.value=false;}}
watch(()=>props.officeId,()=>{code.value='';status.value=null;building.value=null;error.value='';load();},{immediate:true});
</script>
<style scoped>
.kiosk-access{border-top:1px solid #dce4df;margin-top:24px;padding-top:20px}.kiosk-access p{max-width:780px;line-height:1.6}.new-code{padding:20px;background:#f0f5ef;border-radius:12px;margin:16px 0}.new-code strong{font-size:32px;letter-spacing:.3em;font-variant-numeric:tabular-nums}.muted{font-size:13px;color:#63736b}li{margin:12px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.kiosk-access h4 { font-size: 22px; margin: 0 0 16px; }.agency-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; }.agency-list li { margin: 0; padding: 6px 12px; background: #edf3ee; color: #244638; border-radius: 18px; }
</style>
