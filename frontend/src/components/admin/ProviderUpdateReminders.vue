<template>
 <section class="daily-reminders" aria-labelledby="daily-reminder-title">
  <div><h3 id="daily-reminder-title">Daily completion reminders</h3><p>Each morning at 9 a.m. Mountain time, email staff who received this update and have not submitted it. Every reminder includes their saved return link. Reminders stop when they submit.</p></div>
  <p v-if="loading" role="status">Loading reminders…</p>
  <template v-else-if="settings">
   <p class="reminder-state"><strong>{{settings.enabled ? 'Daily reminders are on' : 'Daily reminders are off'}}</strong> · Work email only</p>
   <label class="sms-choice"><input v-model="smsEnabled" type="checkbox" :disabled="busy || pushStatus!=='sent'" /> Also text staff who have opted in and are ready to receive staff reminders</label>
   <small>Texting requires a working staff number and completed text enrollment. Staff without eligible texting still get email.</small>
   <div class="reminder-actions"><button type="button" class="primary" :disabled="busy || pushStatus!=='sent'" @click="save(true)">{{busy ? 'Saving…' : settings.enabled ? 'Save reminder settings' : 'Enable daily reminders'}}</button><button v-if="settings.enabled" type="button" :disabled="busy" @click="save(false)">Pause reminders</button></div>
   <p v-if="pushStatus!=='sent'">Reminders are available after invitations have been sent.</p>
   <div v-if="settings.deliveries?.length" class="reminder-totals"><span v-for="row in settings.deliveries" :key="`${row.channel}-${row.status}`">{{row.channel==='sms' ? 'Texts' : 'Emails'}} {{statusLabel(row.status)}}: <strong>{{row.count}}</strong></span></div>
  </template>
  <p v-if="notice" role="status">{{notice}}</p><p v-if="error" class="error" role="alert">{{error}}</p>
 </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],required:true},pushId:{type:[Number,String],required:true},pushStatus:{type:String,required:true}});
const settings=ref(null),smsEnabled=ref(false),busy=ref(false),loading=ref(false),error=ref(''),notice=ref('');
let loadId=0;
function statusLabel(status){return {sent:'sent',pending:'awaiting approval',sending:'needing delivery review',failed:'failed',skipped:'skipped'}[status]||status;}
watch(()=>[props.agencyId,props.pushId],async()=>{const id=++loadId;loading.value=true;settings.value=null;error.value='';notice.value='';try{const {data}=await api.get(`/provider-update/pushes/${props.pushId}/reminders`,{params:{agencyId:props.agencyId},skipGlobalLoading:true});if(id!==loadId)return;settings.value=data;smsEnabled.value=data.smsEnabled;}catch(e){if(id===loadId)error.value=e.response?.data?.error?.message||'Could not load daily reminder settings.';}finally{if(id===loadId)loading.value=false;}},{immediate:true});
async function save(enabled){const id=loadId;busy.value=true;error.value='';notice.value='';try{const {data}=await api.put(`/provider-update/pushes/${props.pushId}/reminders`,{agencyId:props.agencyId,enabled,smsEnabled:smsEnabled.value});if(id!==loadId)return;settings.value=data;notice.value=enabled?'Saved. Daily reminders will run at 9 a.m. Mountain time.':'Daily reminders paused.';}catch(e){if(id===loadId)error.value=e.response?.data?.error?.message||'Could not save daily reminders.';}finally{busy.value=false;}}
</script>
<style scoped>
.daily-reminders{margin:18px 0;padding:22px;border:1px solid #cadbd0;background:#f3f8f5;border-radius:16px;color:#254739}.daily-reminders h3{margin:0 0 8px;font-size:20px}.daily-reminders p{margin:8px 0;line-height:1.6}.sms-choice{display:flex;align-items:center;gap:12px;line-height:1.5;padding:12px 0;cursor:pointer}.sms-choice input{width:22px;height:22px;flex:none;accent-color:#3e6d54}.daily-reminders small{display:block;color:#526e60}.reminder-actions,.reminder-totals{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}.reminder-actions button{padding:12px 18px;border:1px solid #789d85;border-radius:10px;background:white;color:#254739;font:inherit;font-weight:650;cursor:pointer}.reminder-actions .primary{background:#3e6d54;color:white}.reminder-actions button:disabled{opacity:.55;cursor:default}.reminder-totals span{padding:8px 12px;background:white;border-radius:8px}.error{color:#a21a26}
</style>
