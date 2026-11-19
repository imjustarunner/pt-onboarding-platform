<template>
 <Teleport to="body"><div class="client-status-backdrop" @click.self="close"><section ref="dialog" class="client-status-dialog" role="dialog" aria-modal="true" aria-labelledby="client-status-title" tabindex="-1">
  <h3 id="client-status-title">Change client status</h3><p>{{client.full_name || client.initials || 'Client'}} · Current status: {{client.client_status_label || client.client_status_key || 'Not recorded'}}</p>
  <p v-if="loading" role="status">Loading this agency’s statuses…</p><p v-if="error" role="alert">{{error}}</p>
  <form @submit.prevent="save"><label>Client status<select v-model="selected" :disabled="loading||saving" required><option value="" disabled>Select a status…</option><option v-if="selected && !statuses.some(row=>String(row.id)===selected)" :value="selected" disabled>{{client.client_status_label || 'Saved legacy status'}} (current)</option><option v-for="status in statuses" :key="status.id" :value="String(status.id)">{{status.label}}</option></select></label>
   <label v-if="terminating">Termination reason<textarea v-model="reason" required maxlength="2000" :disabled="saving" /></label>
   <div><button type="submit" :disabled="!canSave">{{saving?'Saving…':'Save status'}}</button><button type="button" :disabled="saving" @click="close">Cancel</button><button v-if="!loading&&error" type="button" :disabled="saving" @click="load">Reload statuses</button></div>
  </form>
 </section></div></Teleport>
</template>
<script setup>
import {computed,onMounted,onBeforeUnmount,ref} from 'vue';
import api from '../../../services/api';
import {useModalFocus} from '../../../composables/useModalFocus';
const props=defineProps({client:{type:Object,required:true}}),emit=defineEmits(['close','saved']);
const dialog=ref(null),statuses=ref([]),selected=ref(String(props.client.client_status_id||'')),reason=ref(''),loading=ref(false),saving=ref(false),error=ref('');let generation=0;
const chosen=computed(()=>statuses.value.find(row=>String(row.id)===selected.value));
const terminating=computed(()=>String(chosen.value?.status_key||'').toLowerCase()==='terminated');
const canSave=computed(()=>!!chosen.value&&!loading.value&&!saving.value&&(!terminating.value||!!reason.value.trim()));
const config=()=>({skipGlobalLoading:true,headers:{'X-Agency-Id':String(props.client.agency_id)}});
async function load(){const own=++generation;loading.value=true;error.value='';try{const {data}=await api.get('/client-settings/client-statuses',{...config(),params:{agencyId:props.client.agency_id}});if(own===generation)statuses.value=(Array.isArray(data)?data:[]).filter(row=>![false,0,'0'].includes(row.is_active));}catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Statuses could not be loaded. Please retry.';}finally{if(own===generation)loading.value=false;}}
function close(){if(!saving.value)emit('close');}
async function save(){if(!canSave.value)return;const own=generation;saving.value=true;error.value='';try{
 const {data}=await api.put(`/clients/${props.client.id}`,{client_status_id:Number(selected.value),...(terminating.value?{termination_reason:reason.value.trim()}:{})},config());
 if(own!==generation)return;
 const saved=data.client||data;
 if(Number(saved.client_status_id)!==Number(selected.value)){error.value='The chart still has its previous status. Your selection has been kept.';return;}
 emit('saved',saved);
 }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'The client status could not be saved. Your selection is still here.';}finally{if(own===generation)saving.value=false;}}
useModalFocus(dialog,close);onMounted(load);onBeforeUnmount(()=>generation++);
</script>
<style scoped>.client-status-backdrop{position:fixed;inset:0;background:#102a4380;z-index:12000;display:grid;place-items:center;padding:20px}.client-status-dialog{background:var(--bg-primary,#fff);color:var(--text-primary,#17345c);padding:24px;border-radius:14px;width:min(520px,100%);max-height:90vh;overflow:auto;box-sizing:border-box}.client-status-dialog label{display:grid;gap:8px;margin:16px 0}.client-status-dialog select,.client-status-dialog textarea{padding:12px;font:inherit;max-width:100%;border:1px solid #b8c9dc;border-radius:8px}.client-status-dialog button{padding:10px 14px;margin:8px 8px 0 0;font:inherit}.client-status-dialog [role=alert]{color:#b42318}</style>
