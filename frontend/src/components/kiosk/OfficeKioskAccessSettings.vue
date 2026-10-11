<template>
  <section class="kiosk-access">
    <h4>AuricWell Kiosk access</h4>
    <p>One building, one six-digit code. Open either address on the office device, enter the code once, then add it to the home screen.</p>
    <p><a href="https://kiosk.auricwell.com" target="_blank" rel="noopener">kiosk.auricwell.com</a> · <a href="https://kiosk.plottwisthq.com" target="_blank" rel="noopener">kiosk.plottwisthq.com</a></p>
    <p class="muted">While those domains are being connected, use <a href="/office-kiosk" target="_blank" rel="noopener">this app’s kiosk link</a>.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading">Loading kiosk access…</p>
    <template v-else-if="status">
      <p>{{ status.configured ? 'A setup code is active. It cannot be viewed again.' : 'Create a setup code to enable this building’s kiosk.' }}</p>
      <div v-if="code" class="new-code"><strong>{{ code }}</strong><p>Save this code privately now. It is shown only once.</p><button class="btn btn-secondary" @click="code=''">Hide code</button></div>
      <button class="btn btn-primary" :disabled="busy" @click="rotate">{{ status.configured ? 'Replace code & disconnect all devices' : 'Create six-digit code' }}</button>
      <p class="muted">The code only unlocks this building’s check-in and directory. It cannot open staff accounts or client charts. Replacing it immediately revokes previous device access.</p>
      <h5>Connected devices ({{ status.devices.length }})</h5>
      <ul><li v-for="(device,index) in status.devices" :key="device.id"><span>Device {{ index+1 }} · Connected {{ date(device.created_at) }} · Last active {{ date(device.last_seen_at) }}</span> <button class="btn btn-secondary" :disabled="busy" @click="revoke(device.id)">Disconnect</button></li></ul>
    </template>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props=defineProps({officeId:{type:[Number,String],required:true}});
const status=ref(null),code=ref(''),error=ref(''),busy=ref(false),loading=ref(false);
let version=0;
const date=value=>new Date(String(value).replace(' ','T')+(String(value).includes('Z')?'':'Z')).toLocaleDateString();
async function load(){const current=++version;loading.value=true;try{const {data}=await api.get(`/offices/${props.officeId}/kiosk-access`);if(current===version)status.value=data;}catch(e){if(current===version)error.value=e.response?.data?.error?.message||'Could not load kiosk access.';}finally{if(current===version)loading.value=false;}}
async function rotate(){if(status.value?.configured&&!window.confirm('Replace the office code and disconnect every device? Each device will need the new code.'))return;busy.value=true;error.value='';code.value='';const office=props.officeId;try{const {data}=await api.post(`/offices/${office}/kiosk-access/rotate`);if(office===props.officeId){code.value=data.code;await load();}}catch(e){error.value=e.response?.data?.error?.message||'Could not create the code.';}finally{busy.value=false;}}
async function revoke(id){busy.value=true;try{await api.delete(`/offices/${props.officeId}/kiosk-access/devices/${id}`);await load();}catch{error.value='Could not disconnect this device.';}finally{busy.value=false;}}
watch(()=>props.officeId,()=>{code.value='';status.value=null;error.value='';load();},{immediate:true});
</script>
<style scoped>
.kiosk-access{border-top:1px solid #dce4df;margin-top:24px;padding-top:20px}.kiosk-access p{max-width:780px;line-height:1.6}.new-code{padding:20px;background:#f0f5ef;border-radius:12px;margin:16px 0}.new-code strong{font-size:32px;letter-spacing:.3em;font-variant-numeric:tabular-nums}.muted{font-size:13px;color:#63736b}li{margin:12px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
</style>
