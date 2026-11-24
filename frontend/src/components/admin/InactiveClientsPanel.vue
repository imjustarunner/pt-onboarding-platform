<template>
  <section class="inactive-panel" aria-label="Inactive clients">
    <h2>Inactive clients</h2>
    <p>Accounts and provider history remain available. New registrations, forms, provider assignments, and confirmed appointments can reactivate a client. A request to return to services reopens intake for review.</p>
    <form class="inactive-search" @submit.prevent="page = 1; load()">
      <input v-model="search" type="search" placeholder="Search inactive clients" aria-label="Search inactive clients" />
      <select v-model="previousProviderId" aria-label="Previous provider" @change="page = 1; load()"><option value="">All previous providers</option><option v-for="provider in providerOptions" :key="provider.id" :value="String(provider.id)">{{ provider.name }}</option></select>
      <button type="submit" :disabled="loading">Search</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="providerError" role="alert">{{ providerError }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="loading" role="status">Loading inactive clients…</p>
    <p v-else-if="!clients.length">No inactive clients match this view.</p>
    <ul v-else class="inactive-list">
      <li v-for="client in clients" :key="client.id">
        <div><button type="button" class="inactive-open" @click="$emit('open-client', client)">{{ getClientLabel(client) }}</button><span class="inactive-status">Inactive{{ client.client_status_label && client.client_status_label.toLowerCase() !== 'inactive' ? ` · ${client.client_status_label}` : '' }}</span>
          <p v-if="client.termination_reason">{{ client.termination_reason }}</p>
          <small>Previous providers: {{ client.previous_providers?.map(provider => provider.name).join(', ') || client.termination_last_provider_name || 'Not recorded' }}</small>
        </div>
        <div><button type="button" :disabled="reopeningId === client.id" @click="beginReactivation(client)">Reactivate client</button> <button type="button" :disabled="reopeningId === client.id" @click="reopen(client)">{{ reopeningId === client.id ? 'Reopening…' : 'Reopen intake for review' }}</button></div>
      </li>
    </ul>
    <form v-if="reactivationClient" role="dialog" aria-label="Reactivate client" @submit.prevent="reactivate">
      <h3>Reactivate {{ getClientLabel(reactivationClient) }}</h3>
      <p>This makes the account active. Previous providers, ended services, and canceled appointments remain in history.</p>
      <label>Reason <textarea v-model="reactivationReason" required maxlength="1000" /></label>
      <button type="submit" :disabled="!!reopeningId || !reactivationReason.trim()">Confirm reactivation</button> <button type="button" :disabled="!!reopeningId" @click="reactivationClient = null">Cancel</button>
    </form>
    <div class="inactive-pages"><button type="button" :disabled="page === 1 || loading" @click="page--; load()">Previous</button><span>Page {{ page }}</span><button type="button" :disabled="!hasMore || loading" @click="page++; load()">Next</button></div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import { useClientDisplayMode } from '../../composables/useClientDisplayMode';
const props = defineProps({ agencyIds: { type: Array, default: () => [] }, demo: String });
const emit = defineEmits(['open-client', 'reopened']);
const { getClientLabel } = useClientDisplayMode();
const clients = ref([]), search = ref(''), page = ref(1), hasMore = ref(false), loading = ref(false), error = ref(''), message = ref(''), reopeningId = ref(null);
const providerOptions=ref([]),previousProviderId=ref(''),providerError=ref('');
const reactivationClient=ref(null),reactivationReason=ref('');
let reactivationRequestId='',providerGeneration=0;
let generation = 0;
async function load() {
  const request = ++generation;
  if (!props.agencyIds.length) { clients.value = []; hasMore.value = false; return; }
  loading.value = true; error.value = '';
  try {
    const params = { includeArchived: true, search: search.value, page: page.value, per_page: 50, paginate: true, demo: 'exclude', ...(previousProviderId.value?{previous_provider_id:previousProviderId.value}:{}), ...(props.agencyIds.length === 1 ? { agency_id: props.agencyIds[0] } : { agency_ids: props.agencyIds.join(',') }) };
    const { data } = await api.get('/clients/inactive', { params, skipGlobalLoading: true });
    if (request !== generation) return;
    clients.value = Array.isArray(data) ? data : data.items || data.clients || [];
    const total = Number(data?.total || data?.pagination?.total || 0);
    hasMore.value = total ? page.value * 50 < total : clients.value.length === 50;
  } catch (e) { if (request === generation) error.value = e?.response?.data?.error?.message || 'Inactive clients could not be loaded.'; }
  finally { if (request === generation) loading.value = false; }
}
async function reopen(client) {
  if (reopeningId.value) return;
  reopeningId.value = client.id; error.value = '';
  try {
    await api.post(`/clients/${client.id}/reopen-enrollment`, {}, { headers: { 'X-Agency-Id': String(client.agency_id) } });
    message.value = `${getClientLabel(client)} is back in New Enrollments.`;
    await load(); emit('reopened', client);
  } catch (e) { error.value = e?.response?.data?.error?.message || 'Enrollment could not be reopened.'; }
  finally { reopeningId.value = null; }
}
function beginReactivation(client){reactivationClient.value=client;reactivationReason.value='';reactivationRequestId=crypto.randomUUID();}
async function reactivate(){
 const client=reactivationClient.value;if(!client||reopeningId.value)return;
 reopeningId.value=client.id;error.value='';
 try{await api.post(`/clients/${client.id}/reactivate`,{requestId:reactivationRequestId,reason:reactivationReason.value.trim()},{headers:{'X-Agency-Id':String(client.agency_id)}});message.value=`${getClientLabel(client)} is active.`;reactivationClient.value=null;await load();emit('reopened',client);}
 catch(e){error.value=e?.response?.data?.error?.message||'The client could not be reactivated.';}
 finally{reopeningId.value=null;}
}
async function loadProviders(){
 const request=++providerGeneration;providerError.value='';providerOptions.value=[];
 if(!props.agencyIds.length)return;
 try{const {data}=await api.get('/clients/inactive/providers',{params:{agency_ids:props.agencyIds.join(',')},skipGlobalLoading:true});if(request===providerGeneration)providerOptions.value=Array.isArray(data)?data:[];}
 catch{if(request===providerGeneration)providerError.value='Previous provider filters could not be loaded. You can still search clients.';}
}
watch(() => [props.agencyIds.join(','), props.demo], () => { page.value = 1;previousProviderId.value='';reactivationClient.value=null; load();loadProviders(); }, { immediate: true });
</script>

<style scoped>
.inactive-panel { padding: 1rem; color: var(--text-primary, #17345c); }
h2 { margin-top: 0; }
.inactive-search, .inactive-pages { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin: 1rem 0; }
input { flex: 1; min-width: 180px; padding: .65rem; border: 1px solid var(--border, #cbd5e1); border-radius: 7px; font: inherit; }
button { padding: .6rem .8rem; border: 1px solid var(--border, #cbd5e1); border-radius: 7px; background: var(--card-bg, white); color: inherit; font: inherit; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.inactive-list { list-style: none; padding: 0; margin: 0; }
li { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 1rem 0; border-bottom: 1px solid var(--border, #e2e8f0); }
.inactive-open { border: 0; padding: 0; font-weight: 700; text-align: left; text-decoration: underline; }
.inactive-status { display: block; font-size: .85rem; color: var(--text-secondary, #64748b); margin-top: .3rem; }
li p { margin: .5rem 0; }
</style>
