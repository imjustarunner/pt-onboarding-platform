<template>
 <Teleport to="body"><div class="client-status-backdrop" @click.self="close"><section ref="dialog" class="client-status-dialog" role="dialog" aria-modal="true" aria-labelledby="client-status-title" tabindex="-1">
  <h3 id="client-status-title">Change client status</h3><p>{{client.full_name || client.initials || 'Client'}} · Current status: {{client.client_status_label || client.client_status_key || 'Not recorded'}}</p>
  <p v-if="loading" role="status">Loading this agency’s statuses…</p><p v-if="error" role="alert">{{error}}</p>
  <form v-if="reactivating" @submit.prevent="save">
   <p>Reactivate enrollment to return this client to the active roster. Review their service and provider assignments afterward.</p>
   <label>Reason for reactivation<textarea v-model="reason" maxlength="1000" :disabled="saving" required /></label>
   <button type="submit" :disabled="!canSave">{{ saving ? 'Reactivating…' : 'Reactivate client' }}</button>
   <button type="button" :disabled="saving" @click="close">Cancel</button>
  </form>
  <template v-else>
  <p>To end services, use Terminate client or Mark inactive at the bottom of the profile.</p>
  <form @submit.prevent="save"><label>Client status<select v-model="selected" :disabled="loading||saving" required><option value="" disabled>Select a status…</option><option v-if="selected && !statuses.some(row=>String(row.id)===selected)" :value="selected" disabled>{{client.client_status_label || 'Saved legacy status'}} (current)</option><option v-for="status in statuses" :key="status.id" :value="String(status.id)">{{status.label}}</option></select></label>
   <div><button type="submit" :disabled="!canSave">{{saving?'Saving…':'Save status'}}</button><button type="button" :disabled="saving" @click="close">Cancel</button><button v-if="!loading&&error" type="button" :disabled="saving" @click="load">Reload statuses</button></div>
  </form>
  </template>
 </section></div></Teleport>
</template>
<script setup>
import {canOpenClientReactivation,isClientClosureStatus} from '../../../utils/clientClosure.js';
import {computed,onMounted,onBeforeUnmount,ref} from 'vue';
import api from '../../../services/api';
import {useModalFocus} from '../../../composables/useModalFocus';
const props=defineProps({client:{type:Object,required:true}}),emit=defineEmits(['close','saved']);
const dialog=ref(null),statuses=ref([]),selected=ref(String(props.client.client_status_id||'')),reason=ref(''),loading=ref(false),saving=ref(false),error=ref('');let generation=0;
const chosen=computed(()=>statuses.value.find(row=>String(row.id)===selected.value));
const reactivating = computed(() => canOpenClientReactivation(props.client));
const canSave=computed(()=>!loading.value&&!saving.value&&(reactivating.value ? !!reason.value.trim() : !!chosen.value));
let requestId;
const config=()=>({skipGlobalLoading:true,headers:{'X-Agency-Id':String(props.client.agency_id)}});
async function load(){const own=++generation;loading.value=true;error.value='';try{const {data}=await api.get('/client-settings/client-statuses',{...config(),params:{agencyId:props.client.agency_id}});if(own===generation)statuses.value=(Array.isArray(data)?data:[]).filter(row=>![false,0,'0'].includes(row.is_active) && !isClientClosureStatus(row));}catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Statuses could not be loaded. Please retry.';}finally{if(own===generation)loading.value=false;}}
function close(){if(!saving.value)emit('close');}
async function save(){if(!canSave.value)return;const own=generation;saving.value=true;error.value='';try{
 if (reactivating.value) {
  requestId ||= crypto.randomUUID();
  const {data}=await api.post(`/clients/${props.client.id}/reactivate`,{requestId,reason:reason.value.trim()},config());
  if(own!==generation)return;
  if (data?.client?.status !== 'ACTIVE' || !data.client.client_status_id) {
    error.value='The chart status could not be confirmed. Refresh the profile and review it.';
    return;
  }
  emit('saved',data.client);
  return;
 }
 const {data}=await api.put(`/clients/${props.client.id}`,{client_status_id:Number(selected.value)},config());
 if(own!==generation)return;
 const saved=data.client||data;
 if(Number(saved.client_status_id)!==Number(selected.value)){error.value='The chart still has its previous status. Your selection has been kept.';return;}
 emit('saved',saved);
 }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'The client status could not be saved. Your selection is still here.';}finally{if(own===generation)saving.value=false;}}
useModalFocus(dialog,close);onMounted(() => { if (!reactivating.value) load(); });onBeforeUnmount(()=>generation++);
</script>
<style scoped>.client-status-backdrop{position:fixed;inset:0;background:#102a4380;z-index:12000;display:grid;place-items:center;padding:20px}.client-status-dialog{background:var(--bg-primary,#fff);color:var(--text-primary,#17345c);padding:24px;border-radius:14px;width:min(520px,100%);max-height:90vh;overflow:auto;box-sizing:border-box}.client-status-dialog label{display:grid;gap:8px;margin:16px 0}.client-status-dialog select,.client-status-dialog textarea{padding:12px;font:inherit;max-width:100%;border:1px solid #b8c9dc;border-radius:8px}.client-status-dialog button{padding:10px 14px;margin:8px 8px 0 0;font:inherit}.client-status-dialog [role=alert]{color:#b42318}</style>
