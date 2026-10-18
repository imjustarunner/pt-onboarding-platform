<template>
  <section class="shared-billing card">
    <h2>Insurance claims</h2>
    <p>H0002 screenings and later services share one client claim queue. Prepare each service from its signed chart note.</p>
    <p>Keep ERA delivery in TherapyNotes during the transition. Claim acknowledgements here do not confirm payment; reconcile remittances in TherapyNotes.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="filters">
      <label>Client<select v-model="clientId"><option value="">All clients</option><option v-for="patient in linkedPatients" :key="patient.canonicalClientId" :value="patient.canonicalClientId">{{ patient.data.name }}</option></select></label>
      <label>Claim status<select v-model="status"><option value="all">All statuses</option><option value="attention">Needs attention</option><option value="draft">Draft</option><option value="ready">Ready</option><option value="in_progress">In progress</option><option value="paid">Paid</option></select></label>
      <button :disabled="loading" @click="load">Refresh claims</button>
    </div>
    <template v-if="organization">
      <p v-if="workspace?.capabilities.claims === false" role="alert">The shared claim tables are not available yet. Complete billing setup before preparing claims.</p>
      <div class="table-wrap" v-else>
        <table><thead><tr><th>Claim</th><th>Client</th><th>Service date</th><th>Payer</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody><tr v-for="claim in workspace.claims" :key="claim.id"><td>{{ claim.claim_number || `#${claim.id}` }}</td><td>{{ clientName(claim.client_id) }}</td><td>{{ String(claim.date_of_service || '').slice(0,10) }}</td><td>{{ claim.payer_name || 'Review payer' }}</td><td>{{ claim.claim_lifecycle }}{{ claim.service_change_pending ? ' · Service correction' : '' }}</td><td>
            <button @click="claimTools?.reviewClaim(claim.id)">Review</button>
            <button v-if="['draft','ready','rejected'].includes(claim.claim_lifecycle)" @click="claimTools?.editClaim(claim.id)">Edit billing</button>
            <button @click="claimTools?.showHistory(claim.id)">History</button>
          </td></tr></tbody>
        </table>
        <p v-if="!workspace.claims.length">No claims match these filters. Check signed chart notes below to prepare a claim.</p>
      </div>
      <div class="filters"><button :disabled="loading || page === 1" @click="page--">Previous</button><span>Page {{ page }} · {{ workspace.total }} claims</span><button :disabled="loading || page * workspace.pageSize >= workspace.total" @click="page++">Next</button></div>
      <ClaimMdWorkspace ref="claimTools" :key="`${base}:${clientId}`" :agency-id="organization.id" :client-id="clientId ? Number(clientId) : null" :connection="organization.connection" :transport="transport" :allow-era-enrollment="false" @updated="load" />
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import ClaimMdWorkspace from '../../frontend/src/components/admin/ClaimMdWorkspace.vue';
import { sharedBillingTransport } from './sharedBillingTransport.js';
const props = defineProps({ base: { type: String, required: true }, patients: { type: Array, default: () => [] } });
const transport = sharedBillingTransport(props.base);
const workspace = ref(null), loading = ref(false), error = ref(''), clientId = ref(''), status = ref('all'), page = ref(1), claimTools = ref(null);
const organization = computed(() => workspace.value?.organizations?.[0]);
const linkedPatients = computed(() => props.patients.filter(p => p.canonicalClientId));
const clientName = id => linkedPatients.value.find(p => Number(p.canonicalClientId) === Number(id))?.data.name || `Client #${id}`;
let generation = 0;
async function load() {
  const current = ++generation;
  loading.value = true; error.value = '';
  try {
    const { data } = await transport.get('/medical-billing/workspace', { params: { clientId: clientId.value || undefined, status: status.value, page: page.value } });
    if (current === generation) workspace.value = data;
  } catch (e) { if (current === generation) { workspace.value = null; error.value = e.message; } }
  finally { if (current === generation) loading.value = false; }
}
watch([clientId, status], () => { workspace.value = null; if (page.value !== 1) page.value = 1; else load(); });
watch(page, load);
onBeforeUnmount(() => { generation++; });
load();
</script>
<style scoped>
.filters{display:flex;gap:1rem;flex-wrap:wrap;align-items:end;margin:1rem 0}.filters label{display:grid;gap:.4rem}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.7rem;border-bottom:1px solid #ddd}td button{margin:.2rem}button,select{padding:.5rem}[role=alert]{color:#a32121}
</style>
