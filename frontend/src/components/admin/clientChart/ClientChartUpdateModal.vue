<template>
  <Teleport to="body">
    <div class="chart-update-backdrop auricwell-client-workspace" @click.self="leave()">
      <div ref="dialog" class="chart-update-modal" role="dialog" aria-modal="true" aria-labelledby="chart-update-title" tabindex="-1">
        <header>
          <div><h2 id="chart-update-title">Bring up to date</h2><p>{{ current?.agency_name || 'Client Management' }} · {{ current?.full_name || current?.initials || 'Select a client' }}</p></div>
          <div class="chart-header-actions">
            <button v-if="current" type="button" class="chart-button" :disabled="busy || moving" @click="openClientChart()">Open client chart</button>
            <button type="button" class="chart-button" :disabled="busy || moving" @click="leave()">Close</button>
          </div>
        </header>
        <nav aria-label="Client navigation">
          <button type="button" class="chart-button" :disabled="busy || moving || index <= 0" @click="move(index - 1)">Previous client</button>
          <button type="button" class="chart-button chart-picker-toggle" :aria-expanded="pickerOpen" @click="pickerOpen = !pickerOpen">Find clients · {{ filtered.length }} matching <span v-if="index >= 0">· {{ index + 1 }} of {{ filtered.length }}</span> ▾</button>
          <button type="button" class="chart-button" :disabled="busy || moving || index >= filtered.length - 1 || !filtered.length" @click="move(index + 1)">Next client →</button>
        </nav>
        <section v-show="pickerOpen" class="chart-picker" aria-label="Find a client to update">
          <div class="chart-filters">
            <input v-model="search" type="search" placeholder="Search name, code, provider or school…" aria-label="Search clients" />
            <select v-model="filters.agency" aria-label="Agency"><option value="">All authorized agencies</option><option v-for="row in agencies" :key="row.id" :value="row.id">{{ row.name }}</option></select>
            <select v-model="filters.status" aria-label="Client status"><option value="">All statuses</option><option v-for="status in statuses" :key="status" :value="status">{{ status }}</option></select>
            <select v-model="filters.assignment" aria-label="Provider assignment"><option value="">Any assignment</option><option value="unassigned">Unassigned</option><option value="assigned">Assigned to a provider</option></select>
            <select v-model="filters.provider" aria-label="Provider"><option value="">All providers</option><option v-for="row in providers" :key="row.id" :value="row.id">{{ row.name }}</option></select>
            <select v-model="filters.school" aria-label="School or affiliation"><option value="">All schools / affiliations</option><option v-for="row in schools" :key="row.id" :value="row.id">{{ row.name }}</option></select>
            <select v-model="filters.demo" aria-label="Record type"><option value="">All records</option><option value="exclude">Hide QA / demos</option><option value="only">QA / demos only</option></select>
            <select v-model="filters.sort" aria-label="Sort clients"><option value="full_name">Name A–Z</option><option value="agency_name">Agency A–Z</option><option value="organization_name">School / affiliation A–Z</option><option value="provider_name">Provider A–Z</option><option value="status">Status A–Z</option></select>
          </div>
          <p class="chart-scope">{{ agencyId ? 'Selected agency' : 'All authorized agencies' }} · {{ queue.length }} clients loaded. Filters define the Previous / Next queue. Your draft belongs to your sign-in.</p>
          <div class="chart-client-results">
            <button v-for="client in filtered" :key="client.id" type="button" class="chart-client-option" :aria-pressed="Number(client.id) === Number(current.id)" :disabled="busy || moving" @click="choose(client)">
              <span><strong>{{ client.full_name || client.initials || `Client #${client.id}` }}</strong><small>{{ client.agency_name || `Agency #${client.agency_id}` }} · {{ chartOrganizationLabel(client.organization_name,client.organization_type) || 'Office / no school' }} · #{{ client.id }}</small></span>
              <span><b>{{ client.client_status_label || client.status || 'Status unavailable' }}</b><small>{{ client.provider_name || 'Unassigned' }}<template v-if="isDemo(client)"> · QA / demo</template></small></span>
            </button>
            <p v-if="!filtered.length && !loading">No clients match these filters.</p>
          </div>
        </section>
        <p v-if="loading" role="status">Loading clients…</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="chart-content"><ClientEhrBringUpToDatePanel v-if="current" :key="`${current.agency_id}:${current.id}`" ref="panel" embedded open review-plan-link @review-plan="openClientChart('treatment-plans', true)" :client-id="current.id" :agency-id="current.agency_id" :client-label="current.full_name || current.initials" @busy="busy = $event" @imported="emit('updated')" @section-imported="emit('updated')" @done="emit('updated')" /></div>
      </div>
    </div>
  </Teleport>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { chartOrganizationLabel } from '../../../utils/clientRosterContext.js';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../../store/auth';
import { useModalFocus } from '../../../composables/useModalFocus';
import api from '../../../services/api';
import ClientEhrBringUpToDatePanel from './ClientEhrBringUpToDatePanel.vue';
import { requiresClientRecordImport } from '../../../utils/clientRecordImport.js';
const props = defineProps({ initialClient: { type: Object, required: true }, agencyId: { type: [Number,String], default: null }, selectedClients: { type: Array, default: null } });
const emit = defineEmits(['close', 'updated']);
const auth = useAuthStore();
const route = useRoute(), router = useRouter();
const queue = ref([props.initialClient].filter(requiresClientRecordImport)), current = ref(props.initialClient), busy = ref(false), moving = ref(false), loading = ref(false), error = ref(''), panel = ref(null), dialog = ref(null), pickerOpen = ref(false), search = ref('');
const filters = reactive({ agency:'',status:'',assignment:'',provider:'',school:'',demo:'',sort:'full_name' });
const preferenceKey = `chart-update-filters-v1:${auth.user?.id || 'anon'}`;
try { const saved=JSON.parse(localStorage.getItem(preferenceKey)||'{}'); for(const key of Object.keys(filters)) if(typeof saved[key]==='string') filters[key]=saved[key]; } catch {}
watch(filters,value=>{try{localStorage.setItem(preferenceKey,JSON.stringify(value));}catch{}},{deep:true});
const isDemo = client => !!Number(client.is_demo) || !!Number(client.created_via_dev_fill);
const options = (id,name) => [...new Map(queue.value.filter(c=>c[id]).map(c=>[String(c[id]),{id:String(c[id]),name:(name==='organization_name'?chartOrganizationLabel(c[name],c.organization_type):c[name]) || `#${c[id]}`}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
const agencies=computed(()=>options('agency_id','agency_name')), providers=computed(()=>options('provider_id','provider_name')), schools=computed(()=>options('organization_id','organization_name'));
const statuses=computed(()=>[...new Set(queue.value.map(c=>c.client_status_label || c.status).filter(Boolean))].sort());
const filtered = computed(() => {
  const term=search.value.trim().toLowerCase();
  return queue.value.filter(c => (!filters.agency || String(c.agency_id)===filters.agency) && (!filters.status || (c.client_status_label||c.status)===filters.status)
    && (!filters.provider || String(c.provider_id)===filters.provider) && (!filters.school || String(c.organization_id)===filters.school)
    && (!filters.assignment || (filters.assignment==='assigned')===!!(c.provider_id || c.provider_name))
    && (!filters.demo || (filters.demo==='only')===isDemo(c))
    && (!term || [c.full_name,c.initials,c.identifier_code,c.id,c.agency_name,chartOrganizationLabel(c.organization_name,c.organization_type),c.provider_name,c.client_status_label,c.status].join(' ').toLowerCase().includes(term)))
    .sort((a,b)=>String(a[filters.sort] || (filters.sort==='full_name'?a.initials:'') || '').localeCompare(String(b[filters.sort] || (filters.sort==='full_name'?b.initials:'') || '')) || Number(a.id)-Number(b.id));
});
const index=computed(()=>filtered.value.findIndex(c=>Number(c.id)===Number(current.value?.id)));
let alive=true;
async function choose(client) {
  if (!client || busy.value || moving.value || Number(client.id)===Number(current.value?.id)) return;
  moving.value=true;
  try { if (await panel.value?.prepareLeave() !== false && alive) current.value=client; }
  finally { moving.value=false; }
}
function move(next) { return choose(filtered.value[next]); }
async function leave() {
  if (busy.value || moving.value) return;
  moving.value=true;
  try { if (await panel.value?.prepareLeave() !== false) emit('close'); }
  finally { moving.value=false; }
}
async function openClientChart(tab = 'bring-up-to-date', alreadySaved = false) {
  if (!current.value || busy.value || moving.value) return;
  const client = current.value;
  moving.value = true;
  try {
    if (!alreadySaved && await panel.value?.prepareLeave({ confirmPending: false }) === false) return;
    const slug = route.params.organizationSlug;
    const path = `${slug ? '/' + slug : ''}/admin/clients/${Number(client.id)}`;
    emit('close');
    await router.push({ path, query: { tab, agencyId: client.agency_id } });
  } finally {
    moving.value = false;
  }
}
useModalFocus(dialog,leave);
onMounted(async () => {
  if (props.selectedClients) {
    const unique = [...new Map(props.selectedClients.filter(client => Number(client?.id) > 0 && requiresClientRecordImport(client)).map(client => [Number(client.id), client])).values()];
    queue.value = unique;
    if (!unique.length) { emit('close'); return; }
    current.value=queue.value.find(client=>Number(client.id)===Number(props.initialClient.id))||queue.value[0];
    for(const key of Object.keys(filters))filters[key]=key==='sort'?'full_name':'';
    search.value='';
    return;
  }
  loading.value = true;
  try {
    const rows=[]; let page=1,total=Infinity;
    while (alive && rows.length<total) {
      const params={...(props.agencyId?{agency_id:props.agencyId}:{}),...(['provider','provider_plus'].includes(auth.user?.role)?{provider_id:auth.user.id}:{}),includeArchived:false,paginate:true,page,per_page:200,sort:'full_name',order:'asc'};
      const response=await api.get('/clients',{params,skipGlobalLoading:true});
      if(!alive)return;
      const payload=response.data, batch=Array.isArray(payload)?payload:payload.items||[];
      total=Array.isArray(payload)?batch.length:Number(payload.total);
      if(!Number.isFinite(total) || (!batch.length && rows.length<total))throw Error('The client list was incomplete. Reopen this window to retry.');
      rows.push(...batch);page++;
    }
    if(!alive)return;
    const unique=[...new Map(rows.filter(requiresClientRecordImport).map(c=>[Number(c.id),c])).values()];
    const selected=unique.find(c=>Number(c.id)===Number(current.value?.id));
    if(!selected && requiresClientRecordImport(props.initialClient))unique.unshift(props.initialClient);
    if(!unique.length){emit('close');return;}
    current.value=selected||unique[0];
    queue.value=unique;
  }catch(err){if(alive)error.value=err.response?.data?.error?.message||err.message||'Clients could not be loaded.';}
  finally{if(alive)loading.value=false;}
});
onBeforeUnmount(()=>{alive=false;});
</script>
<style scoped>
.chart-header-actions {display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.chart-update-backdrop { position:fixed; inset:0; background:#0f172a80; z-index:10200; display:flex; justify-content:center; padding:18px; box-sizing:border-box; }
.chart-update-modal { width:min(1420px,100%); height:100%; display:flex; flex-direction:column; overflow:hidden; background:#fff; border-radius:14px; padding:18px; box-sizing:border-box; color:#17345c; }
header { display:flex; align-items:start; justify-content:space-between; gap:12px; } h2 { margin:0;font-size:1.3rem; } header p { color:#526777; margin:6px 0 10px; }
nav { display:flex; gap:8px; padding:8px 0 12px; border-bottom:1px solid #e2e8f0; flex-shrink:0; }.chart-picker-toggle { flex:1; }
.chart-button { padding:8px 12px; cursor:pointer; background:#eef3fa; color:#173b69; border:1px solid #cfdcec; border-radius:8px; font:inherit; font-size:13px; }.chart-button:disabled{opacity:.5;cursor:default;}
.chart-picker { flex-shrink:0; padding:12px; background:#f6f8fc; border-bottom:1px solid #dce5f1; }.chart-filters { display:flex; flex-wrap:wrap; gap:8px; }.chart-filters input { flex:2 1 260px; }.chart-filters select { flex:1 1 150px; }.chart-filters input,.chart-filters select { min-width:0; font:inherit; font-size:12px; padding:8px; border:1px solid #cedaea; border-radius:7px; background:#fff; color:#17345c; }
.chart-scope { color:#60718a;font-size:12px;margin:8px 0; }.chart-client-results { max-height:210px; overflow:auto; }.chart-client-option { width:100%;display:flex; justify-content:space-between; gap:12px; text-align:left; background:#fff;border:1px solid #e0e7f1; border-radius:7px;padding:8px 10px; margin:4px 0;cursor:pointer;font:inherit;font-size:12px;color:#17345c; }.chart-client-option[aria-pressed=true] { border-color:#5278ac;background:#eaf2fc; }small {display:block;margin-top:3px;color:#60718a;}.chart-content{overflow:auto;min-height:0;flex:1;overscroll-behavior:contain;padding-top:10px;}.error{color:#b91c1c;}
@media(max-width:600px){.chart-update-backdrop{padding:6px}.chart-update-modal{padding:10px}nav{flex-wrap:wrap}.chart-picker-toggle{order:-1;flex-basis:100%}.chart-picker{max-height:40vh;overflow:auto}.chart-client-results{max-height:160px}.chart-client-option{flex-direction:column}}
</style>
