<template>
  <main class="records-desk">
    <p>AuricWell · Records management</p><h1>{{ portal ? 'My records requests' : 'Records Manager' }}</h1>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading">Loading practices…</p>
    <template v-else>
      <label>Practice<select v-model="agencyId" @change="loadPractice"><option value="">Choose a practice</option><option v-for="p in practices" :key="p.id" :value="String(p.id)">{{ p.name }} · {{ p.slug }}</option></select></label>
      <p v-if="!practices.length">No records-management access is assigned to your account. Contact your practice administrator.</p>
      <details v-if="options?.canConfigure">
        <summary>Configure Records Managers</summary>
        <p>{{ options.unassignedCount || 0 }} unassigned requests. Only designated Records Managers can read request details.</p>
        <form @submit.prevent="saveSettings">
          <label>Primary Records Manager<select v-model="primary"><option value="">Unassigned</option><option v-for="m in options.candidates" :key="m.id" :value="m.id">{{ m.name }}</option></select></label>
          <fieldset><legend>Backup Records Managers</legend><label v-for="m in options.candidates.filter(m=>m.id!==Number(primary))" :key="m.id" class="check"><input v-model="backups" type="checkbox" :value="m.id" />{{ m.name }}</label></fieldset>
          <label>Internal follow-up target (days)<input v-model.number="followUpDays" type="number" min="1" max="30" required /></label>
          <p>This is an internal reminder target, not a legal deadline. Existing requests keep their original target.</p>
          <label class="check"><input v-model="enabled" type="checkbox" />Accept online records requests for this practice</label>
          <button :disabled="busy">Save records management</button>
        </form>
      </details>
      <p v-if="agencyId && !portal && !selected?.canManage">You can configure Records Managers, but request details require that explicit permission.</p>
      <RecordsRequests v-if="agencyId && ready && (portal || selected?.canManage)" :key="`${agencyId}:${portal}`" :base="`/practices/${agencyId}`" :manage="!portal" :request-id="String(route.query.request || '')" :patients="patients" />
    </template>
  </main>
</template>
<script setup>
import { ref,computed,onMounted } from 'vue';
import { useRoute } from 'vue-router';
import RecordsRequests from '../components/records/RecordsRequests.vue';
import { api } from '../components/records/api.js';
const props=defineProps({portal:Boolean});
const route=useRoute(),practices=ref([]),agencyId=ref(''),options=ref(null),patients=ref([]),primary=ref(''),backups=ref([]),followUpDays=ref(7),enabled=ref(false),loading=ref(true),ready=ref(false),busy=ref(false),error=ref(''),notice=ref('');
const selected=computed(()=>practices.value.find(p=>p.id===Number(agencyId.value)));
async function loadPractice(){ready.value=false;options.value=null;error.value='';if(!agencyId.value)return;try{if(props.portal)patients.value=await api(`/practices/${agencyId.value}/patients`);else{options.value=await api(`/practices/${agencyId.value}/options`);const s=options.value.settings;primary.value=s.managerIds[0]||'';backups.value=s.managerIds.slice(1);followUpDays.value=s.followUpDays;enabled.value=s.enabled;}ready.value=true;}catch(e){error.value=e.message;}}
async function saveSettings(){busy.value=true;notice.value='';error.value='';try{await api(`/practices/${agencyId.value}/options`,{method:'PUT',body:{managerIds:[...(primary.value?[Number(primary.value)]:[]),...backups.value.filter(id=>id!==Number(primary.value))],followUpDays:followUpDays.value,enabled:enabled.value,revision:options.value.settings.revision}});practices.value=(await api('/context')).practices;await loadPractice();notice.value='Records management updated.';}catch(e){error.value=e.message;}finally{busy.value=false;}}
onMounted(async()=>{try{practices.value=props.portal?await api('/practices'):(await api('/context')).practices;const requested=String(route.query.agencyId||'');agencyId.value=practices.value.some(p=>String(p.id)===requested)?requested:practices.value.length===1?String(practices.value[0].id):'';await loadPractice();}catch(e){error.value=e.message;}finally{loading.value=false;}});
</script>
<style scoped>
.records-desk{max-width:1000px;margin:32px auto;padding:24px;background:#fafbf9;color:#183b34;border-radius:16px}label{display:grid;gap:8px;margin:14px 0}select,input{font:inherit;padding:10px;border:1px solid #adbdb7;border-radius:6px}.check{display:flex;gap:10px;align-items:center}button{padding:12px 18px;border:0;border-radius:6px;background:#23554b;color:white}details{margin:24px 0;padding:16px;border:1px solid #d5dcda}summary{cursor:pointer;font-weight:600}[role=alert]{color:#9b2323}
</style>
